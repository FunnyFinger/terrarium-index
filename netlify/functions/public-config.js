/**
 * Serves browser public config as JavaScript (loaded as /js/config.js via rewrite).
 * Env (set in Netlify → Site settings → Environment variables):
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY)
 * Optional:
 *   SUPABASE_OWNER_EMAIL (or STORE_OWNER_EMAIL) — synced into Supabase app_settings for owner role
 *   TURNSTILE_SITE_KEY
 *   SUPABASE_SERVICE_ROLE_KEY — used to sync owner email into app_settings
 */

function jsString(value) {
    return JSON.stringify(value == null ? '' : String(value));
}

async function syncOwnerEmailToSupabase(ownerEmail) {
    const email = (ownerEmail || '').toString().trim().toLowerCase();
    if (!email) return;
    const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
    if (!base || !key) return;
    try {
        await fetch(base + '/rest/v1/app_settings?on_conflict=id', {
            method: 'POST',
            headers: {
                apikey: key,
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({
                id: 1,
                owner_email: email,
                updated_at: new Date().toISOString()
            })
        });
    } catch (_) {
        /* table may not exist yet — run supabase-owner-email-config.sql */
    }
}

exports.handler = async function () {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anon =
        process.env.SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        '';
    const ownerEmail = process.env.SUPABASE_OWNER_EMAIL || process.env.STORE_OWNER_EMAIL || '';
    const turnstile = process.env.TURNSTILE_SITE_KEY || '';

    // Keep DB trigger in sync with Netlify env (non-blocking for clients if it fails)
    await syncOwnerEmailToSupabase(ownerEmail);

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
