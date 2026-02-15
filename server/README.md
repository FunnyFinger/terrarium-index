# Checkout API (Stripe)

Backend for card payments. Cash on delivery and bank transfer work without this server.

## Setup

1. **Stripe account**: Create one at [stripe.com](https://stripe.com). Get your **Secret key** (Dashboard → Developers → API keys).
2. **Install and run**:
   ```bash
   cd server
   npm install
   ```
3. **Environment**: Create a `.env` file in `server/`:
   ```
   STRIPE_SECRET_KEY=sk_test_xxxx
   PORT=3000
   ```
   Or export: `export STRIPE_SECRET_KEY=sk_test_xxxx`
4. **Start**: `npm start`
5. **Frontend**: So the site can call the API, set the base URL. Either:
   - In the browser console before checkout: `window.CHECKOUT_API_BASE = 'http://localhost:3000'`
   - Or add a small script in `checkout.html` that sets it when you’re on your dev domain (e.g. if `location.hostname === 'localhost'` then set `CHECKOUT_API_BASE = 'http://localhost:3000'`).

For production, host this server (e.g. Node on a VPS, or a serverless function) and set `CHECKOUT_API_BASE` to that URL (e.g. `https://api.yoursite.com`). Use your live Stripe key in production.

## Endpoints

- **POST /api/create-checkout-session** – Body: `{ orderId, amount, currency?, customerEmail?, successUrl, cancelUrl }`. Returns `{ url }` to redirect the customer to Stripe Checkout.
- **GET /api/verify-session?session_id=...&order_id=...** – Verifies payment and returns `{ verified: true }` so the frontend can mark the order as paid.

## Currency

Amount is in KWD (Kuwaiti Dinar). The server converts to fils (1 KWD = 1000 fils) for Stripe.
