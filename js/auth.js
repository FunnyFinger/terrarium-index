/**
 * Auth API backed only by Supabase Auth (js/supabase-auth.js).
 * Same surface: register, login, logout, getCurrentUser, roles, changePassword.
 */
(function (global) {
    'use strict';
    if (!global) return;

    // Legacy local-auth session keys — clear on load so old IndexedDB sessions cannot linger.
    var LEGACY_SESSION_KEYS = [
        'terrarium_auth',
        'terrarium_auth_userId',
        'terrarium_auth_email',
        'terrarium_auth_name',
        'terrarium_auth_role',
        'terrarium_auth_createdAt'
    ];

    function clearLegacySession() {
        try {
            LEGACY_SESSION_KEYS.forEach(function (k) { localStorage.removeItem(k); });
        } catch (e) {}
    }

    clearLegacySession();

    function isConfigured() {
        return !!(global.supabaseAuth && global.supabaseAuth.isConfigured && global.supabaseAuth.isConfigured());
    }

    function notConfiguredError() {
        return Promise.reject(new Error('Authentication is not available. Supabase must be configured.'));
    }

    function getUser() {
        if (!isConfigured()) return Promise.resolve(null);
        return global.supabaseAuth.getCurrentUser().catch(function () { return null; });
    }

    function getCurrentUser() {
        if (!isConfigured()) return null;
        return global.supabaseAuth.getCurrentUserSync() || null;
    }

    function hasRole(roleName) {
        var u = getCurrentUser();
        return u && u.role === roleName;
    }

    function isOwner() {
        return hasRole('owner');
    }

    function isAdmin() {
        return hasRole('admin');
    }

    function canManageInventory() {
        var u = getCurrentUser();
        return u && (u.role === 'owner' || u.role === 'admin');
    }

    /** Can access inventory page and edit stock/price/cost/reorder only (no details, no images). */
    function canManageStock() {
        var u = getCurrentUser();
        return u && (u.role === 'owner' || u.role === 'admin' || u.role === 'stock');
    }

    function isLoggedIn() {
        return getCurrentUser() !== null;
    }

    function register(email, password, name, captchaToken) {
        if (!isConfigured()) return notConfiguredError();
        return global.supabaseAuth.signUp(email, password, name, captchaToken);
    }

    function login(email, password, captchaToken) {
        if (!isConfigured()) return notConfiguredError();
        return global.supabaseAuth.signIn(email, password, captchaToken);
    }

    function logout() {
        clearLegacySession();
        if (isConfigured() && global.supabaseAuth.signOut) {
            var p = global.supabaseAuth.signOut();
            if (global.dispatchEvent) global.dispatchEvent(new Event('authStateChange'));
            return p || Promise.resolve();
        }
        if (global.dispatchEvent) global.dispatchEvent(new Event('authStateChange'));
        return Promise.resolve();
    }

    function changePassword(currentPassword, newPassword) {
        if (!isConfigured()) return notConfiguredError();
        if (!newPassword || newPassword.length < 6) {
            return Promise.reject(new Error('New password must be at least 6 characters'));
        }
        // Re-auth with current password, then update via Supabase.
        var user = getCurrentUser();
        if (!user || !user.email) {
            return Promise.reject(new Error('You must be logged in to change password'));
        }
        if (!currentPassword) {
            return Promise.reject(new Error('Current password is required'));
        }
        return global.supabaseAuth.signIn(user.email, currentPassword).then(function () {
            return global.supabaseAuth.changePassword(newPassword);
        });
    }

    var auth = {
        register: register,
        login: login,
        logout: logout,
        getUser: getUser,
        getCurrentUser: getCurrentUser,
        isLoggedIn: isLoggedIn,
        hasRole: hasRole,
        isOwner: isOwner,
        isAdmin: isAdmin,
        canManageInventory: canManageInventory,
        canManageStock: canManageStock,
        changePassword: changePassword
    };

    var root = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : global;
    if (root && typeof root.module !== 'undefined' && root.module.exports) {
        root.module.exports = auth;
    } else if (root) {
        root.auth = auth;
    }
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
