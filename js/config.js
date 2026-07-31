/**
 * Browser public config (placeholders in git).
 *
 * Production (Netlify): this file is rewritten to netlify/functions/public-config.js,
 * which injects SUPABASE_URL / SUPABASE_ANON_KEY from site environment variables.
 *
 * Local: copy .env.example → .env, then run `npm run generate-config`,
 * or paste values below (do not commit real keys).
 *
 * The anon/publishable key is browser-safe with RLS, but prefer env injection.
 * Keys that were previously committed should be rotated in the Supabase dashboard.
 */
(function () {
    'use strict';
    window.SUPABASE_URL = window.SUPABASE_URL || '';
    window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || window.SUPABASE_PUBLISHABLE_KEY || '';
    window.SUPABASE_OWNER_EMAIL = window.SUPABASE_OWNER_EMAIL || '';
    window.TURNSTILE_SITE_KEY = window.TURNSTILE_SITE_KEY || '';
})();
