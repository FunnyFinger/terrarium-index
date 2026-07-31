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

### Option B: Inject keys from environment variables (keys not in repo) — preferred

The committed `js/config.js` only has empty placeholders. Production loads config from a Netlify function that reads site env vars.

#### Netlify (this project)

1. In **Netlify → Site configuration → Environment variables**, set:
   - `SUPABASE_URL` — Project URL  
   - `SUPABASE_ANON_KEY` — Publishable / anon key (or `SUPABASE_PUBLISHABLE_KEY`)  
   - `SUPABASE_OWNER_EMAIL` — (optional) your owner email  
   - `TURNSTILE_SITE_KEY` — (optional) Cloudflare Turnstile site key  

   `SUPABASE_URL` and the anon/publishable key are already required for SEO/product functions (`catalog-seo.js`).

2. Deploy. A rewrite maps `/js/config.js` → `/.netlify/functions/public-config`, which injects those values. No keys need to live in git.

3. **Rotate keys that were ever committed:** Supabase → Project Settings → API → reset the publishable/anon key, then update the Netlify env var. Old keys remain in git history until rotated.

#### Local development

1. Copy `.env.example` → `.env` and fill in the same values (`.env` is gitignored).  
2. Run `npm run generate-config` to write `js/config.js`, **or** use `netlify dev` so the function serves config.

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
3. In **Authentication → URL Configuration** set:
   - **Site URL** = your live site (e.g. `https://vivarium-store.com`). This is where “Confirm your mail” links in emails will send users.
   - **Redirect URLs** = add `https://your-site.com/auth.html` (and your domain) so the confirmation link works.
4. **Owner role from env (not hardcoded in the client):**
   - In Netlify → Environment variables set **`SUPABASE_OWNER_EMAIL`** (or reuse **`STORE_OWNER_EMAIL`**) to your login email.
   - Run **`supabase-owner-email-config.sql`** once in the Supabase SQL Editor (creates `app_settings` + updates the role trigger).
   - After deploy, loading the site syncs that email into Supabase via `public-config`. Registering with that email gets **owner**; everyone else starts as **user**. Existing owners can promote others in Access Control.
   - Changing the env email does **not** auto-demote an old owner — update roles in Access Control or Supabase if needed.

**Not receiving confirmation emails?**
- In Supabase: **Authentication → Providers → Email** ensure **Confirm email** is enabled if you want confirmation emails. If you turn it **off**, new users are signed in immediately (no email).
- Check the **spam/junk** folder; sender is `noreply@mail.app.supabase.io`.
- To use your own domain and SMTP (fewer spam issues): **Project Settings → Auth → SMTP** and configure custom SMTP.

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
