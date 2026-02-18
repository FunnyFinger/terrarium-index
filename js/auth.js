/**
 * Client-side auth: register, login, logout, session (localStorage).
 * Passwords hashed with PBKDF2-like derivation (SHA-256 + salt).
 */
(function (global) {
    'use strict';
    if (!global) return;

    var SESSION_KEY = 'terrarium_auth';
    var SESSION_USER_ID = 'terrarium_auth_userId';
    var SESSION_EMAIL = 'terrarium_auth_email';
    var SESSION_NAME = 'terrarium_auth_name';
    var SESSION_ROLE = 'terrarium_auth_role';
    var SESSION_CREATED_AT = 'terrarium_auth_createdAt';

    function getAuthDb() {
        return global.authDb || null;
    }

    function toHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(function (b) { return ('0' + b.toString(16)).slice(-2); })
            .join('');
    }

    function fromHex(hex) {
        var bytes = new Uint8Array(hex.length / 2);
        for (var i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes.buffer;
    }

    function randomSalt() {
        var arr = new Uint8Array(16);
        if (global.crypto && global.crypto.getRandomValues) {
            global.crypto.getRandomValues(arr);
        }
        return toHex(arr);
    }

    function hashPassword(password, salt) {
        if (!global.crypto || !global.crypto.subtle) {
            return Promise.resolve(salt + ':' + btoa(unescape(encodeURIComponent(password))));
        }
        var enc = new TextEncoder();
        var data = enc.encode(salt + password);
        return global.crypto.subtle.digest('SHA-256', data).then(function (buffer) {
            return salt + ':' + toHex(buffer);
        });
    }

    function verifyPassword(password, storedHash) {
        var parts = (storedHash || '').split(':');
        var salt = parts[0] || '';
        if (parts.length < 2) return Promise.resolve(false);
        return hashPassword(password, salt).then(function (hash) {
            return hash === storedHash;
        });
    }

    function setSession(user) {
        try {
            localStorage.setItem(SESSION_USER_ID, String(user.id));
            localStorage.setItem(SESSION_EMAIL, user.email || '');
            localStorage.setItem(SESSION_NAME, user.name || '');
            localStorage.setItem(SESSION_ROLE, (user.role || 'user'));
            if (user.createdAt != null) localStorage.setItem(SESSION_CREATED_AT, String(user.createdAt));
            localStorage.setItem(SESSION_KEY, '1');
        } catch (e) {}
    }

    function clearSession() {
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(SESSION_USER_ID);
            localStorage.removeItem(SESSION_EMAIL);
            localStorage.removeItem(SESSION_NAME);
            localStorage.removeItem(SESSION_ROLE);
            localStorage.removeItem(SESSION_CREATED_AT);
        } catch (e) {}
    }

    function getCurrentUser() {
        try {
            if (localStorage.getItem(SESSION_KEY) !== '1') return null;
            var id = localStorage.getItem(SESSION_USER_ID);
            var email = localStorage.getItem(SESSION_EMAIL);
            var name = localStorage.getItem(SESSION_NAME);
            var role = localStorage.getItem(SESSION_ROLE) || 'user';
            var createdAt = localStorage.getItem(SESSION_CREATED_AT);
            if (!id) return null;
            return {
                id: Number(id),
                email: email || '',
                name: name || '',
                role: role,
                createdAt: createdAt ? Number(createdAt) : null
            };
        } catch (e) {
            return null;
        }
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

    function register(email, password, name) {
        var db = getAuthDb();
        if (!db) return Promise.reject(new Error('Auth not available'));
        email = (email || '').trim();
        if (!email) return Promise.reject(new Error('Email is required'));
        if (!password || password.length < 6) return Promise.reject(new Error('Password must be at least 6 characters'));
        return db.getUserByEmail(email).then(function (existing) {
            if (existing) return Promise.reject(new Error('An account with this email already exists'));
            var salt = randomSalt();
            return hashPassword(password, salt).then(function (hash) {
                return db.createUser(email, hash, name);
            });
        }).then(function (id) {
            return db.getUserById(id);
        }).then(function (user) {
            if (user) {
                setSession({ id: user.id, email: user.email, name: user.name, role: user.role || 'user', createdAt: user.createdAt });
                return { id: user.id, email: user.email, name: user.name, role: user.role || 'user' };
            }
            return Promise.reject(new Error('Registration failed'));
        });
    }

    function login(email, password) {
        var db = getAuthDb();
        if (!db) return Promise.reject(new Error('Auth not available'));
        email = (email || '').trim();
        if (!email || !password) return Promise.reject(new Error('Email and password are required'));
        return db.getUserByEmail(email).then(function (user) {
            if (!user) return Promise.reject(new Error('Invalid email or password'));
            return verifyPassword(password, user.passwordHash).then(function (ok) {
                if (!ok) return Promise.reject(new Error('Invalid email or password'));
                setSession({ id: user.id, email: user.email, name: user.name, role: user.role || 'user', createdAt: user.createdAt });
                return { id: user.id, email: user.email, name: user.name, role: user.role || 'user' };
            });
        });
    }

    function logout() {
        clearSession();
        if (global.dispatchEvent) {
            global.dispatchEvent(new Event('authStateChange'));
        }
    }

    var auth = {
        register: register,
        login: login,
        logout: logout,
        getCurrentUser: getCurrentUser,
        isLoggedIn: isLoggedIn,
        hasRole: hasRole,
        isOwner: isOwner,
        isAdmin: isAdmin,
        canManageInventory: canManageInventory,
        canManageStock: canManageStock,
        setSession: setSession,
        clearSession: clearSession
    };

    var root = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : global;
    if (root && typeof root.module !== 'undefined' && root.module.exports) {
        root.module.exports = auth;
    } else if (root) {
        root.auth = auth;
    }
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
