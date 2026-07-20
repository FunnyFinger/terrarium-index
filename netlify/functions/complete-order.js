/**
 * Netlify Function: complete-order
 *
 * Validates line prices against Supabase inventory (service role), decrements stock,
 * sends confirmation emails, and rate-limits abuse.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *   RESEND_API_KEY, EMAIL_FROM, STORE_OWNER_EMAIL
 *   TURNSTILE_SECRET_KEY — if set, requires body.turnstileToken
 */

const { sendOrderEmails } = require('./lib/order-email');

const MAX_DELIVERY_LINE = 50;
const MAX_QTY_PER_LINE = 30;
const MAX_LINES = 40;
const MIN_FORM_MS = 2500;

// Limits: [max hits, window ms]
const LIMIT_IP_SHORT = [8, 15 * 60 * 1000];      // 8 / 15 min
const LIMIT_IP_DAY = [40, 24 * 60 * 60 * 1000];  // 40 / day
const LIMIT_EMAIL = [6, 60 * 60 * 1000];         // 6 / hour

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify(body)
    };
}

function isChargeId(id) {
    return typeof id === 'string' && id.indexOf('charge_') === 0;
}

function clientIp(event) {
    const h = event.headers || {};
    return (
        h['x-nf-client-connection-ip'] ||
        h['x-forwarded-for'] ||
        h['X-Forwarded-For'] ||
        h['client-ip'] ||
        ''
    ).toString().split(',')[0].trim() || 'unknown';
}

async function supabaseRest(method, path, body, prefer) {
    const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
    if (!base || !key) {
        const missing = [];
        if (!base) missing.push('SUPABASE_URL');
        if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
        throw new Error('Supabase not configured on server (missing ' + missing.join(', ') + '). Add env vars in Netlify and redeploy.');
    }

    const res = await fetch(base + '/rest/v1' + path, {
        method,
        headers: {
            apikey: key,
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
            Prefer: prefer || 'return=representation'
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
        const text = await res.text().catch(function () { return ''; });
        throw new Error('Supabase ' + res.status + (text ? ': ' + text.slice(0, 200) : ''));
    }
    if (res.status === 204) return [];
    return res.json();
}

/**
 * Sliding-window counter in checkout_rate_limits.
 * Fails open (allows) if the table is missing so checkout still works before SQL is run.
 */
async function assertRateLimit(bucketKey, maxHits, windowMs) {
    const now = Date.now();
    let rows;
    try {
        rows = await supabaseRest(
            'GET',
            '/checkout_rate_limits?bucket_key=eq.' + encodeURIComponent(bucketKey) + '&select=bucket_key,hit_count,window_start'
        );
    } catch (err) {
        console.warn('Rate limit table unavailable, allowing request:', err.message);
        return;
    }

    const row = rows && rows[0];
    if (!row) {
        try {
            await supabaseRest('POST', '/checkout_rate_limits', {
                bucket_key: bucketKey,
                hit_count: 1,
                window_start: new Date(now).toISOString()
            }, 'return=minimal,resolution=merge-duplicates');
        } catch (err) {
            console.warn('Rate limit insert failed:', err.message);
        }
        return;
    }

    const start = new Date(row.window_start).getTime();
    if (!Number.isFinite(start) || now - start > windowMs) {
        await supabaseRest(
            'PATCH',
            '/checkout_rate_limits?bucket_key=eq.' + encodeURIComponent(bucketKey),
            { hit_count: 1, window_start: new Date(now).toISOString() },
            'return=minimal'
        );
        return;
    }

    if (Number(row.hit_count) >= maxHits) {
        const err = new Error('Too many orders from this device or email. Please try again later.');
        err.statusCode = 429;
        throw err;
    }

    await supabaseRest(
        'PATCH',
        '/checkout_rate_limits?bucket_key=eq.' + encodeURIComponent(bucketKey),
        { hit_count: Number(row.hit_count) + 1 },
        'return=minimal'
    );
}

async function verifyTurnstile(token, ip) {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return true;
    if (!token) return false;
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            secret: secret,
            response: token,
            remoteip: ip || ''
        }).toString()
    });
    const data = await res.json().catch(function () { return {}; });
    return !!(data && data.success);
}

async function fetchInventoryRows(plantIds) {
    const ids = plantIds.filter(function (id) { return Number.isFinite(Number(id)); });
    if (!ids.length) return {};
    const path = '/inventory?plant_id=in.(' + ids.join(',') + ')&select=plant_id,data';
    const rows = await supabaseRest('GET', path);
    const byId = {};
    (rows || []).forEach(function (r) {
        byId[String(r.plant_id)] = r.data || {};
    });
    return byId;
}

async function decrementStock(plantId, qty, rowData) {
    const current = Number(rowData.quantityInStock);
    if (!Number.isFinite(current)) return;
    const next = Math.max(0, current - Number(qty));
    const updated = Object.assign({}, rowData, {
        plantId: Number(plantId),
        quantityInStock: next,
        updatedAt: Date.now()
    });
    await supabaseRest('PATCH', '/inventory?plant_id=eq.' + Number(plantId), {
        data: updated,
        updated_at: new Date().toISOString()
    }, 'return=minimal');
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') {
        return json(204, {});
    }
    if (event.httpMethod !== 'POST') {
        return json(405, { error: 'Method Not Allowed' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (_) {
        return json(400, { error: 'Invalid JSON' });
    }

    // Honeypot: real users leave this empty (hidden field on checkout)
    if ((body.website || body.company || body.hp_field || '').toString().trim()) {
        return json(400, { error: 'Invalid request' });
    }

    const formOpenedAt = Number(body.formOpenedAt);
    if (Number.isFinite(formOpenedAt) && formOpenedAt > 0) {
        const elapsed = Date.now() - formOpenedAt;
        if (elapsed >= 0 && elapsed < MIN_FORM_MS) {
            return json(400, { error: 'Please wait a moment and try again.' });
        }
    }

    const customer = body.customer || {};
    const email = (customer.email || '').trim().toLowerCase();
    if (!email || email.indexOf('@') === -1) {
        return json(400, { error: 'Valid customer email required' });
    }
    if (email.endsWith('.invalid') || email.endsWith('@example.com') || email.indexOf('stock-adjust') !== -1) {
        return json(400, { error: 'Valid customer email required' });
    }

    const ip = clientIp(event);
    try {
        if (process.env.TURNSTILE_SECRET_KEY) {
            const ok = await verifyTurnstile(body.turnstileToken, ip);
            if (!ok) return json(400, { error: 'Captcha verification failed. Please try again.' });
        }

        await assertRateLimit('ip:' + ip + ':short', LIMIT_IP_SHORT[0], LIMIT_IP_SHORT[1]);
        await assertRateLimit('ip:' + ip + ':day', LIMIT_IP_DAY[0], LIMIT_IP_DAY[1]);
        await assertRateLimit('email:' + email, LIMIT_EMAIL[0], LIMIT_EMAIL[1]);
    } catch (limitErr) {
        if (limitErr && limitErr.statusCode === 429) {
            return json(429, { error: limitErr.message });
        }
        console.error('Rate limit / captcha check failed:', limitErr);
        return json(500, { error: limitErr.message || 'Order check failed' });
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length || rawItems.length > MAX_LINES) {
        return json(400, { error: 'Invalid items' });
    }

    const paymentMethod = body.paymentMethod || 'cod';
    const orderId = body.orderId != null ? body.orderId : null;
    const sendEmail = body.sendEmail !== false;
    const updateStock = body.updateStock !== false;

    try {
        const productIds = rawItems
            .map(function (i) { return i.plantId; })
            .filter(function (id) { return !isChargeId(id) && Number.isFinite(Number(id)); });

        const invById = updateStock || productIds.length
            ? await fetchInventoryRows(productIds)
            : {};

        const validated = [];
        let totalAmount = 0;

        for (let i = 0; i < rawItems.length; i++) {
            const line = rawItems[i] || {};
            const qty = Number(line.quantity);
            if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY_PER_LINE) {
                return json(400, { error: 'Invalid quantity for an item' });
            }

            if (isChargeId(line.plantId)) {
                const price = Math.min(MAX_DELIVERY_LINE, Math.max(0, Number(line.price) || 0));
                const lineTotal = price * qty;
                totalAmount += lineTotal;
                validated.push({
                    plantId: line.plantId,
                    name: String(line.name || 'Delivery').slice(0, 120),
                    scientificName: '',
                    quantity: qty,
                    unit: line.unit || undefined,
                    price: price,
                    lineTotal: lineTotal
                });
                continue;
            }

            const id = Number(line.plantId);
            if (!Number.isFinite(id)) {
                return json(400, { error: 'Invalid item id' });
            }
            const row = invById[String(id)];
            if (!row) {
                return json(400, { error: 'Unknown item: ' + id });
            }
            const price = Number(row.price);
            if (!Number.isFinite(price) || price < 0) {
                return json(400, { error: 'Item has no valid price: ' + id });
            }
            const stock = Number(row.quantityInStock);
            if (updateStock && Number.isFinite(stock) && stock < qty) {
                return json(400, { error: 'Insufficient stock for ' + (row.name || id) });
            }

            const lineTotal = price * qty;
            totalAmount += lineTotal;
            validated.push({
                plantId: id,
                name: row.name || String(line.name || 'Item').slice(0, 120),
                scientificName: row.scientificName || line.scientificName || '',
                quantity: qty,
                unit: row.unit || line.unit || undefined,
                price: price,
                lineTotal: lineTotal
            });
        }

        totalAmount = Math.round(totalAmount * 1000) / 1000;

        if (updateStock) {
            for (let j = 0; j < validated.length; j++) {
                const v = validated[j];
                if (isChargeId(v.plantId)) continue;
                const row = invById[String(v.plantId)];
                if (row) await decrementStock(v.plantId, v.quantity, row);
            }
        }

        let emailResult = { skipped: true };
        if (sendEmail) {
            try {
                emailResult = await sendOrderEmails({
                    orderId: orderId,
                    customer: {
                        name: customer.name,
                        email: email,
                        phone: customer.phone,
                        address: customer.address
                    },
                    items: validated,
                    totalAmount: totalAmount,
                    paymentMethod: paymentMethod
                });
            } catch (emailErr) {
                console.error('Order email failed:', emailErr);
                emailResult = { error: emailErr.message || 'Email failed' };
            }
        }

        return json(200, {
            ok: true,
            orderId: orderId,
            totalAmount: totalAmount,
            items: validated,
            email: emailResult
        });
    } catch (err) {
        console.error('complete-order failed:', err);
        return json(500, { error: err.message || 'Order processing failed' });
    }
};
