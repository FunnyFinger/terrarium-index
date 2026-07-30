/**
 * Shared order-email HTML builders + Resend send (used by complete-order).
 */
function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatKD(n) {
    const num = Number(n);
    if (isNaN(num)) return '—';
    return 'KD ' + (Math.round(num * 100) / 100).toFixed(3);
}

function emailWrapper(title, content) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f2f7ed;font-family:Arial,sans-serif;color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f7ed;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(45,80,22,0.10);">
      <tr>
        <td style="background:#2d5016;padding:28px 32px;text-align:center;">
          <p style="margin:0;font-size:1.5em;font-weight:700;color:#fff;letter-spacing:0.02em;">🌿 Vivarium Store</p>
          <p style="margin:6px 0 0;font-size:0.9em;color:#b8d89a;">Kuwait's premier terrarium plant shop</p>
        </td>
      </tr>
      <tr><td style="padding:32px;">${content}</td></tr>
      <tr>
        <td style="background:#f0f7ea;padding:20px 32px;text-align:center;border-top:1px solid #d4e8bc;">
          <p style="margin:0;font-size:0.82em;color:#6b9a5e;">
            Vivarium Store · Kuwait<br>
            <a href="https://vivarium-store.com" style="color:#2d5016;text-decoration:none;">vivarium-store.com</a>
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildItemRows(items) {
    return (items || []).map(item => `
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e8f0e0;color:#1a3d08;">
                ${escHtml(item.name || 'Item')}
                ${item.scientificName ? `<br><span style="font-size:0.82em;color:#6b9a5e;font-style:italic;">${escHtml(item.scientificName)}</span>` : ''}
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #e8f0e0;text-align:center;color:#333;">
                ${Number(item.quantity) % 1 !== 0 ? Number(item.quantity) : Math.round(item.quantity)}${item.unit ? ' ' + escHtml(item.unit) : ''}
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #e8f0e0;text-align:right;color:#333;white-space:nowrap;">
                ${item.price != null ? formatKD(item.lineTotal != null ? item.lineTotal : item.price * item.quantity) : '—'}
            </td>
        </tr>`).join('');
}

function buildTotalRow(totalAmount) {
    if (totalAmount == null || isNaN(Number(totalAmount))) return '';
    return `<tr>
            <td colspan="2" style="padding:12px;font-weight:700;font-size:1.05em;color:#2d5016;background:#f0f7ea;">Total</td>
            <td style="padding:12px;text-align:right;font-weight:700;font-size:1.05em;color:#2d5016;background:#f0f7ea;white-space:nowrap;">${formatKD(totalAmount)}</td>
           </tr>`;
}

function buildCustomerEmail({ orderNum, customer, itemRows, totalRow, payLabel }) {
    const content = `
        <h1 style="margin:0 0 8px;color:#2d5016;font-size:1.5em;">Thank you, ${escHtml(customer.name || 'there')}! 🌱</h1>
        <p style="margin:0 0 24px;color:#555;">Your order has been confirmed. We'll be in touch shortly.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fbf3;border-radius:8px;padding:16px;margin-bottom:24px;">
          <tr>
            <td style="font-size:0.9em;color:#555;">Order number</td>
            <td style="font-size:0.9em;color:#2d5016;font-weight:700;text-align:right;">#${escHtml(orderNum)}</td>
          </tr>
          <tr>
            <td style="font-size:0.9em;color:#555;padding-top:6px;">Payment</td>
            <td style="font-size:0.9em;color:#333;text-align:right;padding-top:6px;">${escHtml(payLabel)}</td>
          </tr>
          ${customer.address ? `
          <tr>
            <td style="font-size:0.9em;color:#555;padding-top:6px;vertical-align:top;">Delivery to</td>
            <td style="font-size:0.9em;color:#333;text-align:right;padding-top:6px;">${escHtml(customer.address)}</td>
          </tr>` : ''}
        </table>
        <h2 style="margin:0 0 12px;color:#2d5016;font-size:1.1em;">Your items</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
          <thead>
            <tr style="background:#f0f7ea;">
              <th style="padding:10px 12px;text-align:left;font-size:0.85em;color:#2d5016;">Item</th>
              <th style="padding:10px 12px;text-align:center;font-size:0.85em;color:#2d5016;">Qty</th>
              <th style="padding:10px 12px;text-align:right;font-size:0.85em;color:#2d5016;">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>${totalRow}</tfoot>
        </table>
        <div style="text-align:center;margin:28px 0 8px;">
          <a href="https://vivarium-store.com" style="display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:700;font-size:1em;">Continue shopping →</a>
        </div>
        <p style="margin:24px 0 0;font-size:0.9em;color:#888;text-align:center;">Questions? Reply to this email or visit our website.</p>`;
    return emailWrapper(`Order #${orderNum} confirmed`, content);
}

function buildOwnerEmail({ orderNum, customer, itemRows, totalRow, payLabel }) {
    const content = `
        <h1 style="margin:0 0 8px;color:#2d5016;font-size:1.4em;">📦 New order #${escHtml(orderNum)}</h1>
        <p style="margin:0 0 24px;color:#555;">A new order has been placed on Vivarium Store.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fbf3;border-radius:8px;padding:16px;margin-bottom:24px;">
          <tr><td style="font-size:0.9em;color:#555;">Name</td><td style="font-size:0.9em;font-weight:700;text-align:right;">${escHtml(customer.name || '—')}</td></tr>
          <tr><td style="font-size:0.9em;color:#555;padding-top:6px;">Email</td><td style="font-size:0.9em;text-align:right;padding-top:6px;">${escHtml(customer.email || '—')}</td></tr>
          <tr><td style="font-size:0.9em;color:#555;padding-top:6px;">Phone</td><td style="font-size:0.9em;text-align:right;padding-top:6px;">${escHtml(customer.phone || '—')}</td></tr>
          <tr><td style="font-size:0.9em;color:#555;padding-top:6px;">Payment</td><td style="font-size:0.9em;text-align:right;padding-top:6px;">${escHtml(payLabel)}</td></tr>
          ${customer.address ? `<tr><td style="font-size:0.9em;color:#555;padding-top:6px;vertical-align:top;">Address</td><td style="font-size:0.9em;text-align:right;padding-top:6px;">${escHtml(customer.address)}</td></tr>` : ''}
        </table>
        <h2 style="margin:0 0 12px;color:#2d5016;font-size:1.1em;">Order items</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
          <thead>
            <tr style="background:#f0f7ea;">
              <th style="padding:10px 12px;text-align:left;font-size:0.85em;color:#2d5016;">Item</th>
              <th style="padding:10px 12px;text-align:center;font-size:0.85em;color:#2d5016;">Qty</th>
              <th style="padding:10px 12px;text-align:right;font-size:0.85em;color:#2d5016;">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>${totalRow}</tfoot>
        </table>
        <div style="text-align:center;margin:16px 0;">
          <a href="https://vivarium-store.com/dashboard.html" style="display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:700;font-size:0.95em;">View dashboard →</a>
        </div>`;
    return emailWrapper(`New order #${orderNum}`, content);
}

async function sendWithResend(apiKey, payload) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
        const msg = (data && data.message) ? data.message : ('Resend error ' + res.status);
        throw new Error(msg);
    }
    return data;
}

async function sendOrderEmails({ orderId, customer, items, totalAmount, paymentMethod }) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.EMAIL_FROM || 'Vivarium Store <onboarding@resend.dev>';
    if (!apiKey) {
        return { skipped: true, reason: 'Email not configured' };
    }

    const ownerEmail = process.env.STORE_OWNER_EMAIL;
    const orderNum = orderId ? String(orderId) : 'N/A';
    const payLabel = paymentMethod === 'bank' ? 'Bank transfer'
        : paymentMethod === 'card' ? 'Card (Stripe)'
        : 'Cash on delivery';

    const itemRows = buildItemRows(items);
    const totalRow = buildTotalRow(totalAmount);
    const customerHtml = buildCustomerEmail({ orderNum, customer, itemRows, totalRow, payLabel });
    const ownerHtml = buildOwnerEmail({ orderNum, customer, itemRows, totalRow, payLabel });

    // Send independently so owner still gets notified if customer send is blocked
    // (e.g. Resend test domain only allows sending to your own inbox).
    let customerSent = false;
    let customerError = null;
    let ownerSent = false;
    let ownerError = null;

    try {
        await sendWithResend(apiKey, {
            from: fromEmail,
            to: [customer.email],
            subject: `Order #${orderNum} confirmed — Vivarium Store`,
            html: customerHtml
        });
        customerSent = true;
    } catch (err) {
        customerError = err.message || 'Customer email failed';
        console.error('Customer order email failed:', customerError);
    }

    if (ownerEmail) {
        try {
            await sendWithResend(apiKey, {
                from: fromEmail,
                to: [ownerEmail],
                subject: `New order #${orderNum} from ${customer.name || customer.email}`,
                html: ownerHtml
            });
            ownerSent = true;
        } catch (err) {
            ownerError = err.message || 'Owner email failed';
            console.error('Owner order email failed:', ownerError);
        }
    }

    if (!customerSent && !ownerSent) {
        throw new Error(customerError || ownerError || 'Email send failed');
    }

    return {
        sent: customerSent || ownerSent,
        orderId: orderNum,
        customerSent: customerSent,
        ownerSent: ownerSent,
        customerError: customerError,
        ownerError: ownerError,
        // Hint when using Resend's shared test sender
        hint: (!customerSent && /own email|verify a domain|resend\.dev/i.test(String(customerError || '')))
            ? 'Verify your domain in Resend and set EMAIL_FROM to an address on that domain (e.g. orders@vivarium-store.com). The free onboarding@resend.dev sender can only email your Resend account address.'
            : undefined
    };
}

module.exports = { sendOrderEmails, escHtml };
