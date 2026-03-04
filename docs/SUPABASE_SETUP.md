# Global data with Supabase

To make inventory, custom equipment, and custom vivariums **shared for all visitors** (not just your browser), use Supabase as the backend.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project** → choose org, name, database password, region.
3. Wait for the project to be ready.

## 2. Create the tables

1. In the Supabase dashboard, open **SQL Editor**.
2. Copy the contents of **`supabase-schema.sql`** (in the project root) and run it.

## 2b. Create the Storage bucket (for images)

So that plant and equipment images are stored globally, create a public bucket:

1. In Supabase dashboard go to **Storage**.
2. **New bucket** → Name: `vivarium-assets` → set **Public bucket** to Yes (so image URLs work for everyone).
3. Create the bucket. You can leave default policies or add a policy that allows all to read and insert (e.g. `INSERT` and `SELECT` for role `anon` on `vivarium-assets`).

## 3. Get your keys

1. In Supabase: **Project Settings** → **API**.
2. Copy:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **Publishable** API key (the one safe for the browser).
3. Do **not** use the **Secret** API key in the site — that one must stay server-side only.

## 4. Configure the site

1. Edit `js/config.js` and set:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_ANON_KEY` = your **Publishable** API key (Supabase may still label it “anon” in some UIs; use the publishable one)

## 5. Deploy so the hosted site uses the config

Two ways, depending on whether you’re okay having the Publishable key in the repo.

### Option A: Commit `config.js` (simplest)

The **Publishable** key is meant to be used in the browser, so it’s safe to be visible in a public repo. Supabase protects data with Row Level Security (RLS), not by hiding this key.

1. Put your real Project URL and Publishable key in `js/config.js`.
2. Commit and push. Your hosted site (e.g. GitHub Pages) will serve that file and use Supabase.

No extra deploy step.

### Option B: Inject keys at deploy time (keys not in repo)

If you don’t want the key in the repo, generate `config.js` during deploy from environment variables or secrets.

**Example: GitHub Actions for GitHub Pages**

1. Keep a template that is committed, e.g. `js/config.template.js`:

   ```js
   (function () {
     'use strict';
     window.SUPABASE_URL = '{{SUPABASE_URL}}';
     window.SUPABASE_ANON_KEY = '{{SUPABASE_ANON_KEY}}';
   })();
   ```

2. In the repo: **Settings → Secrets and variables → Actions**. Add:
   - `SUPABASE_URL` = your Project URL  
   - `SUPABASE_ANON_KEY` = your Publishable key  

3. In your workflow that deploys the site (e.g. `.github/workflows/deploy.yml`), before deploying, run:

   ```yaml
   - name: Inject Supabase config
     run: |
       sed -e "s|{{SUPABASE_URL}}|${{ secrets.SUPABASE_URL }}|g" \
           -e "s|{{SUPABASE_ANON_KEY}}|${{ secrets.SUPABASE_ANON_KEY }}|g" \
           js/config.template.js > js/config.js
   ```

   So the workflow checks out the repo, builds/replaces placeholders from secrets, writes `js/config.js`, then deploys (e.g. with `peaceiris/actions-gh-pages`). The repo never contains the real keys; only the runner has them.

**Other hosts (Netlify, Vercel, etc.)**  
Use their “build” or “prebuild” step to run a similar command that reads env vars and writes `js/config.js` from a template. Your HTML already loads `js/config.js`; no code change needed.

## 6. Load config in your pages

In **index.html** and **build-vivarium.html**, include the config script **before** other app scripts:

```html
<script src="js/config.js"></script>
```

If you use a single `index.html`, add it there; add the same line to `build-vivarium.html` if the builder is a separate page.

## Global auth (accounts, profiles, reviews)

To store **accounts and profiles globally** (so users can log in from any device and data survives clearing the browser):

1. Run **`supabase-auth-schema.sql`** in the Supabase SQL Editor (after the main schema). This creates `profiles` and `product_reviews` tables and RLS policies.
2. In Supabase: **Authentication → Providers** ensure **Email** is enabled.
3. In `js/config.js` set **`SUPABASE_OWNER_EMAIL`** to your email so you get the owner role when you register (or set it later in the Access Control page).

When `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, the site uses Supabase Auth for login/register and Supabase for profiles and reviews. When they are empty, it uses local auth (IndexedDB) as before.

## What becomes global

- **Accounts** – Register and login via Supabase Auth (when config is set).
- **Profiles** – Addresses, billing, roles in `profiles` table.
- **Reviews** – Product reviews in `product_reviews` table.
- **Inventory** – stock, prices, visibility, **images**, and **plant details** for plants/supplies/vivariums (same for everyone).
- **Custom equipment** – supplies added via the site, including **images** (visible to all).
- **Custom vivariums** – custom builds saved from the vivarium builder, including **images** (visible to all).

When you add or change images (plants, equipment, or vivariums), new uploads are stored in the **vivarium-assets** Storage bucket and the image URLs are saved in Supabase so they are visible on all devices and browsers.

When `SUPABASE_URL` and the Publishable key (`SUPABASE_ANON_KEY`) are set, the site uses Supabase for this data. When they are empty, it falls back to local storage (current behaviour).
