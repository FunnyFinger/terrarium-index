/**
 * Template for js/config.js when injecting keys at deploy time.
 * Prefer Netlify function public-config.js; or run scripts/generate-config.js.
 */
(function () {
    'use strict';
    window.SUPABASE_URL = '{{SUPABASE_URL}}';
    window.SUPABASE_ANON_KEY = '{{SUPABASE_ANON_KEY}}';
    window.SUPABASE_OWNER_EMAIL = '{{SUPABASE_OWNER_EMAIL}}';
    window.TURNSTILE_SITE_KEY = '{{TURNSTILE_SITE_KEY}}';
})();
