# Deploying Terrarium Index to the web

Your site is **static** (HTML, CSS, JS, JSON, images). No dedicated server needed.

## Option 1: Netlify (easiest)

1. Go to [netlify.com](https://www.netlify.com) → Sign up (free).
2. Drag and drop your **entire project folder** (Terrarium_index) onto the Netlify deploy area.
3. Netlify will serve `index.html` and all files. You get a URL like `random-name.netlify.app`.
4. Optional: add a custom domain in Site settings → Domain management.
5. **Environment variables** (Site configuration → Environment variables) — required for Supabase:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (publishable/anon key)
   - Optional: `SUPABASE_OWNER_EMAIL`, `TURNSTILE_SITE_KEY`
   - Server-only (already used by order functions): `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, etc.

   Browser config is injected by `netlify/functions/public-config.js` (rewritten over `/js/config.js`). See `docs/SUPABASE_SETUP.md` Option B.

All your files (data, images) are stored and served by Netlify.

## Option 2: GitHub Pages (free, good if you use Git)

1. Push this repo to GitHub (you already have git).
2. On GitHub: repo → **Settings** → **Pages**.
3. Source: **Deploy from a branch**. Branch: `master` (or `main`), folder: **/ (root)**. Save.
4. After a minute, site is at `https://<username>.github.io/<repo-name>/`.

GitHub stores and serves all files from the repo.

## What to upload

Upload the **whole project**: `index.html`, `styles.css`, `script.js`, `data/`, `images/`, and every other file/folder. The site will load JSON and images from the same origin on the host.

## Inventory & POS (stock, prices, sales)

The **Inventory** page and cart/checkout use **IndexedDB** (via Dexie.js) in the browser. Stock, prices, and sales are stored locally per device/browser. There is no server-side database. To sync or back up inventory across devices, you’d add a backend (e.g. Supabase, Firebase) later.

---

You do **not** need a dedicated server for this project.
