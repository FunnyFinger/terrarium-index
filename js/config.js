/**
 * Supabase config (Option A – keys in this file, same for everyone who visits your site).
 * 1. Get your values from Supabase: Project Settings → API → Project URL + Publishable key.
 * 2. Paste them below in the quotes (replace the empty '' or any placeholder).
 * 3. Save this file and push to GitHub; your hosted site will then use Supabase.
 * Do NOT use the Secret key – only the Publishable key. See docs/DEPLOY_OPTION_A.md.
 */
(function () {
    'use strict';
    window.SUPABASE_URL = window.SUPABASE_URL || 'https://wftupkrpgwdewnytlgms.supabase.co';
    window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || window.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_WpRHh9_NVxCkTzYHOFggTw_Z2VwHsvd';
    // Set to your email to get owner role when you register (global auth). Leave empty to assign owner via Supabase dashboard.
    window.SUPABASE_OWNER_EMAIL = window.SUPABASE_OWNER_EMAIL || 'the_fantasy_maker@hotmail.com';
    // Cloudflare Turnstile site key (public). Leave '' until you create a widget at
    // https://dash.cloudflare.com/ → Turnstile. Pair with TURNSTILE_SECRET_KEY on Netlify
    // and the same secret under Supabase → Authentication → Attack Protection → CAPTCHA.
    window.TURNSTILE_SITE_KEY = window.TURNSTILE_SITE_KEY || '0x4AAAAAAD6Cy3pzCik3miQZ';
})();
