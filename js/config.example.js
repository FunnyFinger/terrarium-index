/**
 * Copy this file to config.js and set your Supabase credentials.
 * When set, inventory, custom equipment, and custom vivariums are stored globally (Supabase).
 * When empty, data stays local (browser only).
 */
(function () {
    'use strict';
    window.SUPABASE_URL = '';      // Project URL, e.g. https://xxxx.supabase.co
    window.SUPABASE_ANON_KEY = ''; // Publishable API key (browser-safe). Do not use the Secret key.
})();
