/**
 * Copy to config.js for local file serving, or use: npm run generate-config
 * On Netlify, env vars are injected via netlify/functions/public-config.js.
 */
(function () {
    'use strict';
    window.SUPABASE_URL = '';      // Project URL, e.g. https://xxxx.supabase.co
    window.SUPABASE_ANON_KEY = ''; // Publishable/anon key (browser-safe). Not the Secret key.
    window.SUPABASE_OWNER_EMAIL = '';
    window.TURNSTILE_SITE_KEY = '';
})();
