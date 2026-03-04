# Global data for a published site

For a site published globally, anything that should work across devices and browsers (and survive clearing browser data) must be stored on the server, not only in the browser.

---

## Global auth and profiles (implemented)

When **SUPABASE_URL** and **SUPABASE_ANON_KEY** are set in `js/config.js`, the site uses **Supabase Auth** and **Supabase tables** for:

- **Accounts** – Register and login are stored in Supabase Auth. Users can log in from any device; clearing browser data no longer deletes accounts.
- **Profiles** – Role (owner, admin, stock, user), display name, and addresses are stored in the `profiles` table. Set **SUPABASE_OWNER_EMAIL** in config to your email to get owner role on register.
- **Reviews** – Product reviews and ratings are stored in `product_reviews` and are visible to all visitors.

**Setup:** Run `supabase-auth-schema.sql` in the Supabase SQL Editor (after the main `supabase-schema.sql`). In the Supabase dashboard, ensure **Authentication → Providers → Email** is enabled. No other code change is required; the app uses Supabase Auth when config is set and falls back to local auth otherwise.

---

## Already global (when Supabase is configured)

| Data | Where | Notes |
|------|--------|------|
| **Plants catalog** | Supabase `plants_catalog` | Same for all visitors. |
| **Equipment / supplies catalog** | Supabase `equipment_catalog` | Same for all visitors. |
| **Vivariums catalog** | Supabase `vivariums_catalog` | Same for all visitors. |
| **Inventory** (stock, prices, images) | Supabase `inventory` | Merged with catalog for display. |
| **Product images** | Supabase Storage `vivarium-assets` | Served via public URLs. |

Configure via `js/config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) and `docs/SUPABASE_SETUP.md`.

---

## Should be stored globally (recommended for production)

### 1. **Accounts (auth)**

**Current:** Users are stored in the browser only (IndexedDB `TerrariumAuth` via `js/auth-db.js`). Clearing site data deletes all accounts.

**Recommendation:** Use **Supabase Auth** (or another server-side auth). Then:

- Users can log in from any device/browser.
- Password reset and email verification work.
- You can store roles (owner, admin, stock, user) in a `profiles` table keyed by Supabase user id.

**Implementation outline:** Enable Supabase Auth in the dashboard, add `@supabase/supabase-js` (or use REST), and replace `js/auth.js` / `js/auth-db.js` so that register/login call Supabase Auth and session is validated server-side. Map Supabase user id to your existing role system (e.g. a `profiles` or `app_users` table with `role`).

---

### 2. **User profiles** (addresses, billing)

**Current:** Stored in IndexedDB `TerrariumProfiles` (`js/profile-db.js`). Tied to local auth user id; lost when browser data is cleared.

**Recommendation:** Add a Supabase table (e.g. `profiles` or `user_profiles`) with columns such as `user_id` (from Supabase Auth), `saved_addresses` (jsonb), `billing_address` (jsonb). RLS: users can read/write only their own row.

---

### 3. **Reviews and ratings**

**Current:** Stored in IndexedDB `TerrariumProfiles.reviews` (`js/profile-db.js`). Only visible on the device where they were submitted.

**Recommendation:** Add a Supabase table (e.g. `product_reviews`) with `user_id`, `product_type`, `product_id`, `rating`, `comment`, `created_at`. RLS: anyone can read; only authenticated users can insert; users can update/delete their own. Then have `profileDb.saveReview` / `getReviewsByProduct` use Supabase instead of IndexedDB.

---

### 4. **Roles / access control**

**Current:** Roles (owner, admin, stock, user) live in the local auth DB. With Supabase Auth you need a single source of truth.

**Recommendation:** Store roles in Supabase, e.g. in a `profiles` table: `id` (Supabase user id), `email`, `display_name`, `role`. Set your own account to `owner` (e.g. by email). Use RLS and this table so the app can enforce who can manage inventory, edit catalog, etc.

---

## Optional (can stay local or sync later)

| Data | Current | Suggestion |
|------|---------|------------|
| **Cart** | `localStorage` `terrarium_cart` | Fine to keep local for “guest” experience. Optionally add “Save cart” that stores cart in a `user_carts` table keyed by user id. |
| **Theme / UI preferences** | `localStorage` (e.g. `terrarium_theme`, `plantCardSize`) | Can stay local, or save to `profiles` for cross-device preference. |
| **Session** | `localStorage` (terrarium_auth_*) | With Supabase Auth, session is a JWT; you still store it in localStorage/sessionStorage but the server validates it. |

---

## Summary checklist for “global” readiness

- [ ] **Auth:** Move from IndexedDB auth to **Supabase Auth** (or another server-side auth). Accounts and login then work globally.
- [ ] **Profiles:** Add Supabase table for addresses/billing; use it from `profile-db.js` when Supabase is configured.
- [ ] **Reviews:** Add Supabase table for product reviews; use it from `profile-db.js` / product-reviews widget when Supabase is configured.
- [ ] **Roles:** Store roles in Supabase (e.g. in `profiles`) and enforce in RLS and in the app.
- [ ] **Catalog + inventory + images:** Already global when Supabase and Storage are set up (see `SUPABASE_SETUP.md`).

After auth and profiles/reviews are in Supabase, the site will behave like a normal published site: one account works everywhere, and clearing the browser no longer removes users or their data.
