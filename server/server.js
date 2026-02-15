/**
 * Minimal Stripe Checkout API for Vivarium Store.
 * Set STRIPE_SECRET_KEY in env (e.g. .env or export).
 * Run: npm install && npm start
 * Frontend: set window.CHECKOUT_API_BASE = 'http://localhost:3000' (or your server URL).
 */
try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }); } catch (_) {}
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;
const stripeSecret = process.env.STRIPE_SECRET_KEY;

app.use(cors({ origin: true }));
app.use(express.json());

// KWD: 1 KWD = 1000 fils (Stripe uses smallest currency unit)
function kwdToFils(kwd) {
  const n = Number(kwd);
  return Math.max(0, Math.round(n * 1000));
}

app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripeSecret) {
    return res.status(503).json({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY.' });
  }
  const stripe = new Stripe(stripeSecret);
  const { orderId, amount, currency, customerEmail, successUrl, cancelUrl } = req.body || {};
  const amountNum = Number(amount);
  if (!orderId || !amountNum || amountNum <= 0) {
    return res.status(400).json({ error: 'orderId and amount required' });
  }
  const cur = (currency || 'kwd').toLowerCase();
  const amountFils = cur === 'kwd' ? kwdToFils(amountNum) : Math.round(amountNum * 100); // default cents for others

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: cur,
            unit_amount: amountFils,
            product_data: {
              name: 'Order #' + orderId,
              description: 'Vivarium Store – Order ' + orderId,
            },
          },
        },
      ],
      success_url: successUrl || req.body.successUrl,
      cancel_url: cancelUrl || req.body.cancelUrl,
      customer_email: customerEmail || undefined,
      metadata: { orderId: String(orderId) },
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to create session' });
  }
});

app.get('/api/verify-session', async (req, res) => {
  if (!stripeSecret) {
    return res.status(503).json({ verified: false, error: 'Stripe not configured' });
  }
  const stripe = new Stripe(stripeSecret);
  const sessionId = req.query.session_id;
  const orderId = req.query.order_id;
  if (!sessionId || !orderId) {
    return res.status(400).json({ verified: false });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const verified = session.payment_status === 'paid' && session.metadata && session.metadata.orderId === String(orderId);
    return res.json({ verified });
  } catch (err) {
    console.error('Verify error:', err.message);
    return res.status(500).json({ verified: false });
  }
});

app.listen(PORT, () => {
  console.log('Checkout API running on http://localhost:' + PORT);
  if (!stripeSecret) console.warn('STRIPE_SECRET_KEY not set – card payments will fail.');
});
