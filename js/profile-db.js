/**
 * User profile data: when Supabase Auth is configured uses Supabase (profiles + product_reviews).
 * Otherwise uses IndexedDB (TerrariumProfiles). Same API for addresses, billing, reviews.
 */
(function (global) {
    'use strict';
    if (!global) return;

    var DB_NAME = 'TerrariumProfiles';
    var db = null;

    function useSupabaseProfiles() {
        return global.supabaseDb && global.supabaseDb.isConfigured && global.supabaseDb.isConfigured() &&
            global.supabaseAuth && global.supabaseAuth.isConfigured && global.supabaseAuth.isConfigured();
    }

    function getDb() {
        if (db) return db;
        if (typeof global.Dexie === 'undefined') return null;
        db = new global.Dexie(DB_NAME);
        db.version(1).stores({
            profiles: 'userId',
            reviews: '++id, userId, productType, productId, createdAt'
        });
        return db;
    }

    function getProfile(userId) {
        if (useSupabaseProfiles() && userId != null) {
            return global.supabaseDb.getProfile(userId).then(function (p) {
                return p || { userId: userId, savedAddresses: [], billingAddress: null };
            });
        }
        var database = getDb();
        if (!database) return Promise.resolve(null);
        var id = Number(userId);
        if (!isFinite(id)) return Promise.resolve(null);
        return database.profiles.get(id).then(function (p) {
            return p || { userId: id, savedAddresses: [], billingAddress: null };
        });
    }

    function saveProfile(userId, data) {
        if (useSupabaseProfiles() && userId != null) {
            return global.supabaseDb.updateProfile(userId, { savedAddresses: data.savedAddresses || [], billingAddress: data.billingAddress !== undefined ? data.billingAddress : undefined });
        }
        var database = getDb();
        if (!database) return Promise.reject(new Error('Profile DB not available'));
        var id = Number(userId);
        if (!isFinite(id)) return Promise.reject(new Error('Invalid user id'));
        return database.profiles.put({ userId: id, savedAddresses: data.savedAddresses || [], billingAddress: data.billingAddress || null });
    }

    /** Get saved shipping addresses. */
    function getSavedAddresses(userId) {
        return getProfile(userId).then(function (p) {
            return p.savedAddresses || [];
        });
    }

    /** Add or update a saved address. address.id optional; if not set, generate. */
    function saveAddress(userId, address) {
        return getProfile(userId).then(function (p) {
            var list = p.savedAddresses || [];
            var id = address.id || ('addr_' + Date.now());
            var entry = {
                id: id,
                label: address.label || 'Home',
                name: address.name || '',
                line1: address.line1 || '',
                line2: address.line2 || '',
                city: address.city || '',
                state: address.state || '',
                postalCode: address.postalCode || '',
                country: address.country || '',
                phone: address.phone || '',
                isDefault: !!address.isDefault
            };
            if (entry.isDefault) list.forEach(function (a) { a.isDefault = false; });
            var idx = list.findIndex(function (a) { return a.id === id; });
            if (idx >= 0) list[idx] = entry;
            else list.push(entry);
            return saveProfile(userId, { savedAddresses: list, billingAddress: p.billingAddress }).then(function () { return entry; });
        });
    }

    function deleteAddress(userId, addressId) {
        return getProfile(userId).then(function (p) {
            var list = (p.savedAddresses || []).filter(function (a) { return a.id !== addressId; });
            return saveProfile(userId, { savedAddresses: list, billingAddress: p.billingAddress });
        });
    }

    /** Get billing address (single object or null). */
    function getBillingAddress(userId) {
        return getProfile(userId).then(function (p) {
            return p.billingAddress || null;
        });
    }

    function saveBillingAddress(userId, address) {
        return getProfile(userId).then(function (p) {
            var billing = address ? {
                name: address.name || '',
                line1: address.line1 || '',
                line2: address.line2 || '',
                city: address.city || '',
                state: address.state || '',
                postalCode: address.postalCode || '',
                country: address.country || '',
                phone: address.phone || ''
            } : null;
            return saveProfile(userId, { savedAddresses: p.savedAddresses || [], billingAddress: billing });
        });
    }

    /** Add or update a review. */
    function saveReview(userId, review) {
        if (useSupabaseProfiles() && userId != null) {
            return global.supabaseDb.saveReview(userId, {
                userDisplayName: review.userDisplayName || '',
                productType: review.productType || 'plant',
                productId: review.productId,
                productName: review.productName || '',
                rating: review.rating,
                comment: review.comment || ''
            });
        }
        var database = getDb();
        if (!database) return Promise.reject(new Error('Profile DB not available'));
        var rec = {
            userId: Number(userId),
            userDisplayName: review.userDisplayName || '',
            productType: review.productType || 'plant',
            productId: Number(review.productId),
            productName: review.productName || '',
            rating: Math.min(5, Math.max(1, Number(review.rating) || 5)),
            comment: (review.comment || '').trim(),
            createdAt: review.createdAt || Date.now()
        };
        if (review.id) {
            return database.reviews.update(Number(review.id), rec).then(function () { return review.id; });
        }
        return database.reviews.add(rec);
    }

    /** Get average rating and count for a product. */
    function getAverageRating(productType, productId) {
        if (useSupabaseProfiles()) {
            return global.supabaseDb.getAverageRating(productType, productId);
        }
        return getReviewsByProduct(productType, productId).then(function (reviews) {
            var count = (reviews || []).length;
            if (count === 0) return { average: 0, count: 0 };
            var sum = reviews.reduce(function (s, r) { return s + (Number(r.rating) || 0); }, 0);
            return { average: Math.round((sum / count) * 10) / 10, count: count };
        });
    }

    function getReviewsByUser(userId, limit) {
        if (useSupabaseProfiles() && userId != null) {
            return global.supabaseDb.getReviewsByUser(userId, limit);
        }
        var database = getDb();
        if (!database) return Promise.resolve([]);
        return database.reviews.where('userId').equals(Number(userId)).sortBy('createdAt').then(function (arr) {
            arr = (arr || []).slice().reverse();
            return limit ? arr.slice(0, limit) : arr;
        });
    }

    /** Get all reviews for a product (e.g. plant, supply, vivarium). */
    function getReviewsByProduct(productType, productId) {
        if (useSupabaseProfiles()) {
            return global.supabaseDb.getReviewsByProduct(productType, productId);
        }
        var database = getDb();
        if (!database) return Promise.resolve([]);
        return database.reviews.where('productType').equals(String(productType)).toArray().then(function (arr) {
            arr = (arr || []).filter(function (r) { return Number(r.productId) === Number(productId); });
            arr.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
            return arr;
        });
    }

    function getReviewById(reviewId) {
        if (useSupabaseProfiles()) {
            return global.supabaseDb.getReviewById(reviewId);
        }
        var database = getDb();
        if (!database) return Promise.resolve(null);
        return database.reviews.get(Number(reviewId));
    }

    function deleteReview(reviewId) {
        if (useSupabaseProfiles()) {
            return global.supabaseDb.deleteReview(reviewId);
        }
        var database = getDb();
        if (!database) return Promise.resolve();
        return database.reviews.delete(Number(reviewId));
    }

    var root = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : global;
    if (root) {
        root.profileDb = {
            getProfile: getProfile,
            saveProfile: saveProfile,
            getSavedAddresses: getSavedAddresses,
            saveAddress: saveAddress,
            deleteAddress: deleteAddress,
            getBillingAddress: getBillingAddress,
            saveBillingAddress: saveBillingAddress,
            saveReview: saveReview,
            getReviewsByUser: getReviewsByUser,
            getReviewsByProduct: getReviewsByProduct,
            getAverageRating: getAverageRating,
            getReviewById: getReviewById,
            deleteReview: deleteReview
        };
    }
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
