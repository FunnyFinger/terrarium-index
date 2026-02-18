/**
 * User store (IndexedDB via Dexie) for auth: email, password hash, name, role.
 * Set OWNER_EMAIL to your email to become owner on register (or use setUserRole after).
 */
(function (global) {
    'use strict';
    if (!global) return;

    var DB_NAME = 'TerrariumAuth';
    /** Set this to your email to get owner role when you register. To make an existing account owner, run in console (use your real email): authDb.getUserByEmail('your-real@email.com').then(u => { if (u) authDb.setUserRole(u.id, 'owner'); else console.log('No user with that email'); }); then log out and log in. */
    var OWNER_EMAIL = 'the_fantasy_maker@hotmail.com';
    var db = null;

    function getDb() {
        if (db) return db;
        if (typeof global.Dexie === 'undefined') return null;
        db = new global.Dexie(DB_NAME);
        db.version(1).stores({
            users: '++id, email, createdAt'
        });
        db.version(2).stores({
            users: '++id, email, createdAt, role'
        }).upgrade(function(tx) {
            return tx.table('users').toCollection().modify(function(u) {
                if (u.role === undefined) u.role = 'user';
            });
        });
        return db;
    }

    function createUser(email, passwordHash, name, role) {
        var database = getDb();
        if (!database) return Promise.reject(new Error('Database not available'));
        var now = Date.now();
        var emailLo = email.toLowerCase().trim();
        var assignedRole = (OWNER_EMAIL && emailLo === OWNER_EMAIL.toLowerCase()) ? 'owner' : (role || 'user');
        return database.users.add({
            email: emailLo,
            passwordHash: passwordHash,
            name: (name || '').trim() || email.split('@')[0],
            createdAt: now,
            role: assignedRole
        });
    }

    function setUserRole(userId, newRole) {
        var database = getDb();
        if (!database) return Promise.reject(new Error('Database not available'));
        var allowed = ['owner', 'admin', 'stock', 'user'];
        if (allowed.indexOf(newRole) === -1) return Promise.reject(new Error('Invalid role'));
        return database.users.update(Number(userId), { role: newRole });
    }

    function getUserByEmail(email) {
        var database = getDb();
        if (!database) return Promise.resolve(null);
        return database.users.where('email').equals(email.toLowerCase().trim()).first();
    }

    function getUserById(id) {
        var database = getDb();
        if (!database) return Promise.resolve(null);
        return database.users.get(Number(id));
    }

    /** List all users for access control (no passwordHash). Owner only. */
    function getAllUsers() {
        var database = getDb();
        if (!database) return Promise.resolve([]);
        return database.users.toArray().then(function(rows) {
            return rows.map(function(u) {
                return { id: u.id, email: u.email || '', name: u.name || '', role: u.role || 'user', createdAt: u.createdAt };
            });
        });
    }

    var authDb = {
        createUser: createUser,
        getUserByEmail: getUserByEmail,
        getUserById: getUserById,
        setUserRole: setUserRole,
        getAllUsers: getAllUsers,
        OWNER_EMAIL: OWNER_EMAIL
    };

    var root = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : global;
    if (root && typeof root.module !== 'undefined' && root.module.exports) {
        root.module.exports = authDb;
    } else if (root) {
        root.authDb = authDb;
    }
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
