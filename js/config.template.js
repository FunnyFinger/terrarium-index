/**
 * Template for js/config.js when injecting keys at deploy time (Option B in docs/SUPABASE_SETUP.md).
 * Replace {{SUPABASE_URL}} and {{SUPABASE_ANON_KEY}} with env vars or secrets during build/deploy.
 */
(function () {
    'use strict';
    window.SUPABASE_URL = '{{SUPABASE_URL}}';
    window.SUPABASE_ANON_KEY = '{{SUPABASE_ANON_KEY}}';
})();
