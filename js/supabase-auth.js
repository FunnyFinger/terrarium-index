/**
 * Supabase Auth: sole auth backend for the site.
 * Handles register, login, logout and session. auth.js wraps this API for the app.
 * Owner role is assigned by the DB trigger (app_settings.owner_email),
 * kept in sync from Netlify SUPABASE_OWNER_EMAIL / STORE_OWNER_EMAIL via public-config.
 */
(function (global) {
    'use strict';
    if (!global) return;

    var supabaseClient = null;

    function getSupabase() {
        if (supabaseClient) return supabaseClient;
        var url = (global.SUPABASE_URL || '').toString().trim();
        var key = (global.SUPABASE_ANON_KEY || '').toString().trim();
        var createClient = (global.supabase && global.supabase.createClient) || global.createClient;
        if (!url || !key || typeof createClient !== 'function') return null;
        supabaseClient = createClient(url, key);
        return supabaseClient;
    }

    function isConfigured() {
        var url = (global.SUPABASE_URL || '').toString().trim();
        var key = (global.SUPABASE_ANON_KEY || '').toString().trim();
        return !!(url && key);
    }

    /** Ensure profile row exists for the given Supabase user and return profile (role, display_name). */
    function ensureProfile(user, displayName) {
        var supabase = getSupabase();
        if (!supabase) return Promise.resolve(null);
        var id = user.id;
        var email = (user.email || '').toLowerCase().trim();
        var name = (displayName || (user.user_metadata && user.user_metadata.name) || email.split('@')[0] || '').trim();
        // Role is enforced server-side (trigger). Never trust client-supplied role.
        var role = 'user';

        return supabase
            .from('profiles')
            .select('role, display_name')
            .eq('id', id)
            .single()
            .then(function (r) {
                if (r.data) return r.data;
                return supabase
                    .from('profiles')
                    .upsert({ id: id, email: email, display_name: name || null, role: role, updated_at: new Date().toISOString() }, { onConflict: 'id' })
                    .select('role, display_name')
                    .single()
                    .then(function (u) { return u.data || { role: role, display_name: name || null }; });
            })
            .catch(function () {
                return { role: role, display_name: name || null };
            });
    }

    /** Base URL for email confirmation redirect (so link goes to your site, not localhost). */
    function getEmailRedirectUrl() {
        var o = (typeof global.location !== 'undefined' && global.location.origin) ? global.location.origin : '';
        var path = (typeof global.location !== 'undefined' && global.location.pathname) ? global.location.pathname : '';
        if (o && path && path.indexOf('auth') !== -1) return o + path;
        return o ? o + '/auth.html' : '';
    }

    function signUp(email, password, name, captchaToken) {
        var supabase = getSupabase();
        if (!supabase) return Promise.reject(new Error('Supabase Auth not available'));
        email = (email || '').trim();
        if (!email) return Promise.reject(new Error('Email is required'));
        if (!password || password.length < 6) return Promise.reject(new Error('Password must be at least 6 characters'));

        var redirectTo = getEmailRedirectUrl();
        var options = {
            data: { name: (name || '').trim() || email.split('@')[0] },
            emailRedirectTo: redirectTo || undefined
        };
        if (captchaToken) options.captchaToken = captchaToken;
        return supabase.auth.signUp({
            email: email,
            password: password,
            options: options
        }).then(function (res) {
            if (res.error) return Promise.reject(new Error(res.error.message || 'Sign up failed'));
            var user = res.data && res.data.user;
            var session = res.data && res.data.session;
            if (!user) return Promise.reject(new Error('Sign up failed'));
            if (!session) {
                return Promise.resolve({ needsEmailConfirmation: true, email: user.email || email });
            }
            cachedAccessToken = session.access_token || null;
            return ensureProfile(user, (name || '').trim()).then(function (profile) {
                var appUser = {
                    id: user.id,
                    email: user.email || '',
                    name: (profile && profile.display_name) || (user.user_metadata && user.user_metadata.name) || user.email || '',
                    role: (profile && profile.role) || 'user',
                    createdAt: user.created_at ? new Date(user.created_at).getTime() : null
                };
                cachedUser = appUser;
                return appUser;
            });
        });
    }

    function signIn(email, password, captchaToken) {
        var supabase = getSupabase();
        if (!supabase) return Promise.reject(new Error('Supabase Auth not available'));
        email = (email || '').trim();
        if (!email || !password) return Promise.reject(new Error('Email and password are required'));

        var fallbackMsg = 'Invalid email or password. If you don\'t have an account, please register first.';
        var payload = { email: email, password: password };
        if (captchaToken) payload.options = { captchaToken: captchaToken };
        return supabase.auth.signInWithPassword(payload).then(function (res) {
            if (res.error) {
                var msg = (res.error.message || '').toLowerCase();
                if (msg.indexOf('invalid') !== -1 || msg.indexOf('credentials') !== -1 || msg.indexOf('email') !== -1)
                    return Promise.reject(new Error(fallbackMsg));
                return Promise.reject(new Error(res.error.message || fallbackMsg));
            }
            var user = res.data && res.data.user;
            var session = res.data && res.data.session;
            if (!user || !session) return Promise.reject(new Error(fallbackMsg));
            cachedAccessToken = session.access_token || null;
            return ensureProfile(user).then(function (profile) {
                var appUser = {
                    id: user.id,
                    email: user.email || '',
                    name: (profile && profile.display_name) || (user.user_metadata && user.user_metadata.name) || user.email || '',
                    role: (profile && profile.role) || 'user',
                    createdAt: user.created_at ? new Date(user.created_at).getTime() : null
                };
                cachedUser = appUser;
                return appUser;
            });
        }).catch(function (err) {
            if (err && err.message && err.message.indexOf('register') !== -1) return Promise.reject(err);
            return Promise.reject(new Error(fallbackMsg));
        });
    }

    function signOut() {
        cachedUser = null;
        cachedAccessToken = null;
        var supabase = getSupabase();
        if (supabase) return supabase.auth.signOut().catch(function () {});
        return Promise.resolve();
    }

    /** Get current user for app (id, email, name, role). id is uuid string. */
    function getCurrentUser() {
        var supabase = getSupabase();
        if (!supabase) return Promise.resolve(null);
        return supabase.auth.getSession().then(function (res) {
            var session = res.data && res.data.session;
            var user = session && session.user;
            if (!user) { cachedUser = null; cachedAccessToken = null; return null; }
            if (session.access_token) cachedAccessToken = session.access_token;
            return ensureProfile(user).then(function (profile) {
                var appUser = {
                    id: user.id,
                    email: user.email || '',
                    name: (profile && profile.display_name) || (user.user_metadata && user.user_metadata.name) || user.email || '',
                    role: (profile && profile.role) || 'user',
                    createdAt: user.created_at ? new Date(user.created_at).getTime() : null
                };
                cachedUser = appUser;
                if (global.dispatchEvent) global.dispatchEvent(new Event('authStateChange'));
                return appUser;
            });
        }).catch(function () { return null; });
    }

    /** Sync getCurrentUser for auth.js: auth expects sync getCurrentUser(). We cache and refresh on load. */
    var cachedUser = null;
    var cachedAccessToken = null;

    function getCurrentUserSync() {
        return cachedUser;
    }

    function refreshCachedUser() {
        getCurrentUser().then(function (u) {
            cachedUser = u;
            if (global.dispatchEvent) global.dispatchEvent(new Event('authStateChange'));
        }).catch(function () { cachedUser = null; });
    }

    function setSessionCache(session) {
        if (!session) {
            cachedAccessToken = null;
            cachedUser = null;
            return;
        }
        cachedAccessToken = session.access_token || null;
        var user = session.user;
        if (user) {
            var meta = user.user_metadata || {};
            cachedUser = {
                id: user.id,
                email: user.email || '',
                name: (meta.name || user.email || '').trim() || user.email || '',
                role: 'user',
                createdAt: user.created_at ? new Date(user.created_at).getTime() : null
            };
            if (global.dispatchEvent) global.dispatchEvent(new Event('authStateChange'));
            ensureProfile(user).then(function (profile) {
                if (profile) {
                    cachedUser = {
                        id: user.id,
                        email: user.email || '',
                        name: (profile.display_name || meta.name || user.email || '').trim() || user.email || '',
                        role: profile.role || 'user',
                        createdAt: user.created_at ? new Date(user.created_at).getTime() : null
                    };
                    if (global.dispatchEvent) global.dispatchEvent(new Event('authStateChange'));
                }
            }).catch(function () {});
        } else {
            cachedUser = null;
        }
    }

    /** Parse access_token and refresh_token from hash or query (e.g. after "Confirm your mail" link). */
    function parseTokensFromUrl() {
        if (!global.location) return null;
        var params = {};
        function parsePart(str) {
            if (!str) return;
            str.split('&').forEach(function (pair) {
                var i = pair.indexOf('=');
                if (i !== -1) params[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent((pair.slice(i + 1) || '').replace(/\+/g, ' '));
            });
        }
        if (global.location.hash) parsePart(global.location.hash.slice(1));
        if (global.location.search) parsePart(global.location.search.slice(1));
        var access_token = params.access_token;
        var refresh_token = params.refresh_token;
        return (access_token && refresh_token) ? { access_token: access_token, refresh_token: refresh_token } : null;
    }

    /** Recover session from URL hash/query (e.g. after clicking "Confirm your mail" in email). */
    function recoverSessionFromHash() {
        var tokens = parseTokensFromUrl();
        if (!tokens) return Promise.resolve();
        var supabase = getSupabase();
        if (!supabase) return Promise.resolve();
        return supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token }).then(function (res) {
            if (res.data && res.data.session) setSessionCache(res.data.session);
            try {
                var path = global.location.pathname || '/';
                var search = (global.location.search || '').replace(/[?&]access_token=[^&]*/g, '').replace(/[?&]refresh_token=[^&]*/g, '').replace(/^&|&$/g, '').replace(/\?&/, '?').replace(/\?$/, '');
                global.history.replaceState(null, '', path + (search || ''));
            } catch (e) {}
            if ((global.location.pathname || '').indexOf('auth') !== -1)
                global.location.replace(global.location.origin + '/');
        }).catch(function () {});
    }

    /** Call once after Supabase client is ready to restore session and listen for auth changes. */
    function init() {
        var supabase = getSupabase();
        if (!supabase) return;
        recoverSessionFromHash().then(function () {
            return supabase.auth.getSession();
        }).then(function (res) {
            setSessionCache(res.data && res.data.session);
        }).catch(function () { cachedUser = null; cachedAccessToken = null; });
        supabase.auth.onAuthStateChange(function (event, session) {
            if (event === 'SIGNED_OUT') {
                cachedUser = null;
                cachedAccessToken = null;
            } else if (session) {
                setSessionCache(session);
            }
        });
    }

    /** Return current access token for authenticated Supabase requests (RLS). */
    function getAccessToken() {
        return cachedAccessToken;
    }

    function changePassword(newPassword) {
        var supabase = getSupabase();
        if (!supabase) return Promise.reject(new Error('Supabase Auth not available'));
        return supabase.auth.updateUser({ password: newPassword }).then(function (res) {
            if (res.error) return Promise.reject(new Error(res.error.message || 'Password update failed'));
        });
    }

    global.supabaseAuth = {
        isConfigured: isConfigured,
        signUp: signUp,
        signIn: signIn,
        signOut: signOut,
        getCurrentUser: getCurrentUser,
        getCurrentUserSync: getCurrentUserSync,
        refreshCachedUser: refreshCachedUser,
        init: init,
        getAccessToken: getAccessToken,
        ensureProfile: ensureProfile,
        changePassword: changePassword
    };
    if (isConfigured()) { init(); }
})(typeof window !== 'undefined' ? window : this);
