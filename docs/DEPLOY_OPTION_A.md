# Deploy with Option A (no build step – good for beginners)

This is the simplest way: you put your Supabase details in one file and push to GitHub. Your live site will then use the same shared data for everyone.

---

## Step 1: Get your two values from Supabase

1. Open [supabase.com](https://supabase.com) and sign in.
2. Open your project (or create one and run `supabase-schema.sql` in the SQL Editor first).
3. Go to **Project Settings** (gear icon) → **API**.
4. Copy these two things (keep the tab open):
   - **Project URL** (e.g. `https://abcdefgh.supabase.co`)
   - **Publishable** key (long string – the one that’s safe for the browser, *not* the Secret key)

---

## Step 2: Put them into your project

1. Open the file **`js/config.js`** in your project (same folder as your site).
2. Find these two lines at the bottom:
   ```js
   window.SUPABASE_URL = window.SUPABASE_URL || '';
   window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || window.SUPABASE_PUBLISHABLE_KEY || '';
   ```
3. Replace the **empty quotes** `''` with your values:
   - First line: paste your **Project URL** between the quotes, e.g. `'https://abcdefgh.supabase.co'`
   - Second line: paste your **Publishable key** between the quotes, e.g. `'eyJhbGc...'`
4. Save the file.

Example (with fake values):

```js
window.SUPABASE_URL = window.SUPABASE_URL || 'https://abcdefgh.supabase.co';
window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || window.SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## Step 3: Push to GitHub so the live site updates

If your site is already hosted from this repo (e.g. GitHub Pages):

1. In your project folder, **commit** the change:
   - If you use GitHub Desktop: commit the change to `js/config.js` and push.
   - If you use the command line:
     ```bash
     git add js/config.js
     git commit -m "Add Supabase config for shared data"
     git push
     ```
2. Wait a minute or two for GitHub (or your host) to update the site.
3. Open your **live site URL** in the browser. Inventory, custom equipment, and custom vivariums should now be shared for all visitors.

---

## Checklist

- [ ] Supabase project created and `supabase-schema.sql` run in SQL Editor  
- [ ] Project URL and Publishable key copied from Supabase → Project Settings → API  
- [ ] Both values pasted into `js/config.js` (in the quotes), file saved  
- [ ] Changes pushed to GitHub (or your host)  
- [ ] Live site opened and tested (e.g. add a custom vivarium and check from another device or incognito)

**Why new items don’t show everywhere:**  
- **Supplies tab (cards view):** If you had the main site open in another tab, that tab will refresh the supplies list when you add an item (storage event). Otherwise, refresh the main site once to see the new item.  
- **Other browser or device:** New items only appear everywhere if Supabase is configured. Without it, they’re stored in the current browser only. Follow Step 1–2 above so your hosted site has `config.js` with Supabase URL and key; then new items are saved to the cloud and show for all visitors and devices.

If something doesn’t work, check the browser console (F12 → Console) for errors and that `js/config.js` is loading (e.g. in the Network tab).
