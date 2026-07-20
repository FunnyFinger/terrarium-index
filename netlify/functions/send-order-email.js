/**
 * Netlify Function: send-order-email (legacy)
 *
 * Direct public access is disabled. Use /.netlify/functions/complete-order instead,
 * which validates prices, updates stock, and sends mail.
 *
 * Optional: set ORDER_EMAIL_INTERNAL_SECRET and pass header x-order-email-secret
 * for trusted internal callers only.
 */

const { sendOrderEmails } = require('./lib/order-email');

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const secret = process.env.ORDER_EMAIL_INTERNAL_SECRET || '';
    const provided = (event.headers && (event.headers['x-order-email-secret'] || event.headers['X-Order-Email-Secret'])) || '';
    if (!secret || provided !== secret) {
        return {
            statusCode: 403,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Forbidden. Use /.netlify/functions/complete-order for customer orders.'
            })
        };
    }

    let body;
    try { body = JSON.parse(event.body); }
    catch (_) { return { statusCode: 400, body: 'Invalid JSON' }; }

    const { orderId, customer, items, totalAmount, paymentMethod } = body;
    if (!customer || !customer.email) {
        return { statusCode: 400, body: 'Missing customer email' };
    }

    try {
        const result = await sendOrderEmails({ orderId, customer, items, totalAmount, paymentMethod });
        return { statusCode: 200, body: JSON.stringify(result) };
    } catch (err) {
        console.error('Email send failed:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
