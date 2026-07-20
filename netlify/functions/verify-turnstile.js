/**
 * Verify Cloudflare Turnstile token (shared by reviews and other forms).
 * Env: TURNSTILE_SECRET_KEY (same secret used by complete-order).
 */
exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: ''
        };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const secret = process.env.TURNSTILE_SECRET_KEY || '';
    if (!secret) {
        // Not configured — allow (matches client skipping widgets when site key empty)
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ ok: true, skipped: true })
        };
    }

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (_) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const token = (body.token || body.turnstileToken || '').toString().trim();
    if (!token) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ ok: false, error: 'CAPTCHA token missing' })
        };
    }

    const ip = (
        (event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'])) || ''
    ).toString().split(',')[0].trim();

    try {
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
        if (!data.success) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ ok: false, error: 'CAPTCHA verification failed' })
            };
        }
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ ok: true })
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ ok: false, error: err.message || 'CAPTCHA check failed' })
        };
    }
};
