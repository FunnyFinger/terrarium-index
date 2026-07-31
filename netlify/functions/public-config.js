/**
 * Serves browser public config as JavaScript (loaded as /js/config.js via rewrite).
 * Env (set in Netlify → Site settings → Environment variables):
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY)
 * Optional:
 *   SUPABASE_OWNER_EMAIL
 *   TURNSTILE_SITE_KEY
 */

function jsString(value) {
    return JSON.stringify(value == null ? '' : String(value));
}

exports.handler = async function () {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anon =
        process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        '';
    const ownerEmail = process.env.SUPABASE_OWNER_EMAIL || process.env.STORE_OWNER_EMAIL || '';
    const turnstile = process.env.TURNSTILE_SITE_KEY || '';

    const body = [
        '(function () {',
        "  'use strict';",
        '  window.SUPABASE_URL = window.SUPABASE_URL || ' + jsString(url) + ';',
        '  window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || window.SUPABASE_PUBLISHABLE_KEY || ' + jsString(anon) + ';',
        '  window.SUPABASE_OWNER_EMAIL = window.SUPABASE_OWNER_EMAIL || ' + jsString(ownerEmail) + ';',
        '  window.TURNSTILE_SITE_KEY = window.TURNSTILE_SITE_KEY || ' + jsString(turnstile) + ';',
        '})();',
        ''
    ].join('\n');

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            'Access-Control-Allow-Origin': '*'
        },
        body: body
    };
};
