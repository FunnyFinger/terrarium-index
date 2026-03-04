/**
 * Supabase Auth: global accounts. When SUPABASE_URL and SUPABASE_ANON_KEY are set,
 * this module handles register, login, logout and session. auth.js uses it when available.
 * Set SUPABASE_OWNER_EMAIL in config.js to your email to get owner role on register.
 */
(function (global) {
    'use strict';
    if (!global) return;

    var supabaseClient = null;
    var OWNER_EMAIL = (global.SUPABASE_OWNER_EMAIL || '').toString().trim();

    function getSupabase() {
        if (supabaseClient) return supabaseClient;
        var url = (global.SUPABASE_URL || '').toString().trim();
        var key = (global.SUPABASE_ANON_KEY || '').toString().trim();
        if (!url || !key || typeof global.createClient !== 'function') return null;
        supabaseClient = global.createClient(url, key);
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
        var role = (OWNER_EMAIL && email === OWNER_EMAIL.toLowerCase()) ? 'owner' : 'user';

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

    function signUp(email, password, name) {
        var supabase = getSupabase();
        if (!supabase) return Promise.reject(new Error('Supabase Auth not available'));
        email = (email || '').trim();
        if (!email) return Promise.reject(new Error('Email is required'));
        if (!password || password.length < 6) return Promise.reject(new Error('Password must be at least 6 characters'));

        return supabase.auth.signUp({
            email: email,
            password: password,
            options: { data: { name: (name || '').trim() || email.split('@')[0] } }
        }).then(function (res) {
            if (res.error) return Promise.reject(new Error(res.error.message || 'Sign up failed'));
            var user = res.data && res.data.user;
            var session = res.data && res.data.session;
            if (!user) return Promise.reject(new Error('Sign up failed'));
            if (session) cachedAccessToken = session.access_token || null;
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

    function signIn(email, password) {
        var supabase = getSupabase();
        if (!supabase) return Promise.reject(new Error('Supabase Auth not available'));
        email = (email || '').trim();
        if (!email || !password) return Promise.reject(new Error('Email and password are required'));

        return supabase.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
            if (res.error) return Promise.reject(new Error(res.error.message || 'Invalid email or password'));
            var user = res.data && res.data.user;
            var session = res.data && res.data.session;
            if (!user) return Promise.reject(new Error('Invalid email or password'));
            if (session) cachedAccessToken = session.access_token || null;
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
        });
    }

    function signOut() {
        var supabase = getSupabase();
        if (supabase) supabase.auth.signOut().catch(function () {});
    }

    /** Get current user for app (id, email, name, role). id is uuid string. */
    function getCurrentUser() {
        var supabase = getSupabase();
        if (!supabase) return Promise.resolve(null);
        return supabase.auth.getSession().then(function (res) {
            var session = res.data && res.data.session;
            var user = session && session.user;
            if (!user) return null;
            return ensureProfile(user).then(function (profile) {
                return {
                    id: user.id,
                    email: user.email || '',
                    name: (profile && profile.display_name) || (user.user_metadata && user.user_metadata.name) || user.email || '',
                    role: (profile && profile.role) || 'user',
                    createdAt: user.created_at ? new Date(user.created_at).getTime() : null
                };
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
            ensureProfile(user).then(function (profile) {
                cachedUser = {
                    id: user.id,
                    email: user.email || '',
                    name: (profile && profile.display_name) || (user.user_metadata && user.user_metadata.name) || user.email || '',
                    role: (profile && profile.role) || 'user',
                    createdAt: user.created_at ? new Date(user.created_at).getTime() : null
                };
                if (global.dispatchEvent) global.dispatchEvent(new Event('authStateChange'));
            }).catch(function () { cachedUser = null; });
        } else {
            cachedUser = null;
        }
    }

    /** Call once after Supabase client is ready to restore session and listen for auth changes. */
    function init() {
        var supabase = getSupabase();
        if (!supabase) return;
        supabase.auth.getSession().then(function (res) {
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
})(typeof window !== 'undefined' ? window : this);
