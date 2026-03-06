/**
 * Supabase-backed storage for global inventory, custom equipment, and custom vivariums.
 * When SUPABASE_URL and SUPABASE_ANON_KEY are set in js/config.js, the site uses this
 * so all visitors see and edit the same data.
 */
(function (global) {
    'use strict';

    var BASE = '';
    var HEADERS = {};

    function configure() {
        var url = (global.SUPABASE_URL || '').toString().trim();
        var key = (global.SUPABASE_ANON_KEY || '').toString().trim();
        if (!url || !key) return false;
        BASE = url.replace(/\/$/, '') + '/rest/v1';
        STORAGE_BASE = url.replace(/\/$/, '');
        HEADERS = {
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
        return true;
    }

    function isConfigured() {
        if (BASE && HEADERS.apikey) return true;
        return configure();
    }

    var STORAGE_BASE = '';

    function request(method, path, body) {
        var opt = { method: method, headers: HEADERS };
        if (body !== undefined) opt.body = JSON.stringify(body);
        return fetch(BASE + path, opt).then(function (res) {
            if (!res.ok) return Promise.reject(new Error(res.status + ' ' + res.statusText));
            if (res.status === 204 || res.headers.get('content-length') === '0') return [];
            return res.json();
        });
    }

    /** Authenticated request (uses Supabase Auth JWT for RLS). */
    function requestAuth(method, path, body) {
        var token = (global.supabaseAuth && global.supabaseAuth.getAccessToken) ? global.supabaseAuth.getAccessToken() : null;
        var headers = { 'apikey': HEADERS.apikey, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        else headers['Authorization'] = HEADERS['Authorization'];
        var opt = { method: method, headers: headers };
        if (body !== undefined) opt.body = JSON.stringify(body);
        return fetch(BASE + path, opt).then(function (res) {
            if (!res.ok) return Promise.reject(new Error(res.status + ' ' + res.statusText));
            if (res.status === 204 || res.headers.get('content-length') === '0') return [];
            return res.json();
        });
    }

    /** Sanitize storage path: no leading/trailing slashes, no backslashes, no double slashes. */
    function sanitizeStoragePath(path) {
        if (typeof path !== 'string') return '';
        return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '').trim();
    }

    /**
     * Upload a file to Supabase Storage via raw fetch using the anon key.
     * The vivarium-assets bucket has INSERT policy for anon role only. Using a JWT (authenticated role)
     * would fail with 400 because there is no INSERT policy for authenticated users.
     * @param {File} file - the file to upload
     * @param {string} objectPath - path inside bucket, e.g. "plants/123/photo.jpg"
     * @returns {Promise<string>} public URL of the uploaded file
     */
    function uploadToStorage(file, objectPath) {
        if (!file || !objectPath) return Promise.reject(new Error('file and path required'));
        if (!isConfigured()) return Promise.reject(new Error('Supabase not configured'));
        if (!STORAGE_BASE) STORAGE_BASE = (global.SUPABASE_URL || '').toString().trim().replace(/\/$/, '');
        var path = sanitizeStoragePath(objectPath);
        if (!path) return Promise.reject(new Error('Invalid storage path'));

        var anonKey = global.SUPABASE_ANON_KEY || HEADERS.apikey || '';
        var url = STORAGE_BASE + '/storage/v1/object/vivarium-assets/' + path;
        var headers = {
            'Authorization': 'Bearer ' + anonKey,
            'apikey': anonKey,
            'x-upsert': 'true'
        };
        if (file.type) headers['Content-Type'] = file.type;
        return fetch(url, { method: 'POST', headers: headers, body: file }).then(function (res) {
            if (!res.ok) {
                return res.text().then(function (body) {
                    var msg = (body && body.trim()) ? (body.length > 200 ? body.slice(0, 200) + '…' : body) : ('HTTP ' + res.status);
                    return Promise.reject(new Error('Upload failed (' + res.status + '): ' + msg));
                });
            }
            var publicUrl = STORAGE_BASE + '/storage/v1/object/public/vivarium-assets/' + path;
            return res.text().then(function (text) {
                if (!text || !text.trim()) return publicUrl;
                try {
                    var data = JSON.parse(text);
                    var key = (data && (data.Key || data.path)) ? (data.Key || data.path) : path;
                    if (key.indexOf('vivarium-assets/') === 0) key = key.replace(/^vivarium-assets\/?/, '');
                    return STORAGE_BASE + '/storage/v1/object/public/vivarium-assets/' + key;
                } catch (e) {
                    return publicUrl;
                }
            }).catch(function () {
                return publicUrl;
            });
        });
    }

    /**
     * List object names under a prefix in vivarium-assets (e.g. "plants/aglaonema-commutatum/").
     * Returns full public URLs for each file so plant.images can be populated when catalog has none.
     * @param {string} prefix - path prefix including trailing slash
     * @returns {Promise<string[]>} full public URLs, or [] on error/empty
     */
    function listStoragePaths(prefix) {
        if (!prefix || typeof prefix !== 'string') return Promise.resolve([]);
        if (!isConfigured()) return Promise.resolve([]);
        if (!STORAGE_BASE) STORAGE_BASE = (global.SUPABASE_URL || '').toString().trim().replace(/\/$/, '');
        var url = STORAGE_BASE + '/storage/v1/object/list/vivarium-assets';
        var headers = {
            'Authorization': 'Bearer ' + (global.SUPABASE_ANON_KEY || HEADERS.apikey || ''),
            'apikey': (global.SUPABASE_ANON_KEY || HEADERS.apikey || ''),
            'Content-Type': 'application/json'
        };
        var body = JSON.stringify({ prefix: prefix, limit: 500 });
        return fetch(url, { method: 'POST', headers: headers, body: body }).then(function (res) {
            if (!res.ok) return [];
            return res.json().then(function (arr) {
                if (!Array.isArray(arr)) return [];
                var base = STORAGE_BASE + '/storage/v1/object/public/vivarium-assets/';
                return arr
                    .filter(function (o) { return o && (o.name || o.path); })
                    .map(function (o) {
                        var path = o.path || (prefix + (o.name || ''));
                        return base + (path.charAt(0) === '/' ? path.slice(1) : path);
                    });
            }).catch(function () { return []; });
        }).catch(function () { return []; });
    }

    /**
     * Delete a file from Supabase Storage (vivarium-assets bucket).
     * @param {string} publicUrlOrPath - full public URL (e.g. https://xxx.supabase.co/storage/.../plants/slug/slug-5.jpg) or object path (e.g. plants/slug/slug-5.jpg)
     * @returns {Promise<void>}
     */
    function deleteFromStorage(publicUrlOrPath) {
        if (!publicUrlOrPath || typeof publicUrlOrPath !== 'string') return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        if (!STORAGE_BASE) STORAGE_BASE = (global.SUPABASE_URL || '').toString().trim().replace(/\/$/, '');
        var objectPath = publicUrlOrPath.trim();
        var prefix = STORAGE_BASE + '/storage/v1/object/public/vivarium-assets/';
        if (objectPath.indexOf(prefix) === 0) {
            objectPath = objectPath.slice(prefix.length);
        } else if (objectPath.indexOf('/storage/v1/object/public/vivarium-assets/') !== -1) {
            objectPath = objectPath.split('/storage/v1/object/public/vivarium-assets/')[1] || objectPath;
        }
        if (!objectPath) return Promise.resolve();
        var url = STORAGE_BASE + '/storage/v1/object/vivarium-assets/' + objectPath;
        var headers = {
            'Authorization': 'Bearer ' + (global.SUPABASE_ANON_KEY || HEADERS.apikey || ''),
            'apikey': (global.SUPABASE_ANON_KEY || HEADERS.apikey || '')
        };
        return fetch(url, { method: 'DELETE', headers: headers }).then(function (res) {
            if (!res.ok) return Promise.reject(new Error('Storage delete failed: ' + res.status));
            return undefined;
        }).catch(function () {});
    }

    // ---- Inventory (same shape as IndexedDB: { plantId, name, price, ... }) ----
    function getInventory() {
        if (!isConfigured()) return Promise.resolve([]);
        return request('GET', '/inventory?select=plant_id,data').then(function (rows) {
            return (rows || []).map(function (r) {
                var d = r.data || {};
                d.plantId = r.plant_id;
                return d;
            });
        }).catch(function () { return []; });
    }

    function getInventoryItem(plantId) {
        var id = Number(plantId);
        if (!isFinite(id)) return Promise.resolve(undefined);
        if (!isConfigured()) return Promise.resolve(undefined);
        return request('GET', '/inventory?plant_id=eq.' + id + '&select=plant_id,data').then(function (rows) {
            if (!rows || rows.length === 0) return undefined;
            var d = rows[0].data || {};
            d.plantId = rows[0].plant_id;
            return d;
        }).catch(function () { return undefined; });
    }

    function deleteInventoryRow(plantId) {
        var id = Number(plantId);
        if (!isFinite(id)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return request('DELETE', '/inventory?plant_id=eq.' + id).then(function () {});
    }

    function setInventoryRow(plantId, data) {
        var id = Number(plantId);
        if (!isFinite(id)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return getInventoryItem(plantId).then(function (existing) {
            var row = existing || { plantId: id };
            if ('name' in data) row.name = data.name;
            if ('scientificName' in data) row.scientificName = data.scientificName;
            if ('price' in data) row.price = data.price;
            if ('costPrice' in data) row.costPrice = data.costPrice;
            if ('quantityInStock' in data) row.quantityInStock = data.quantityInStock;
            if ('reorderLevel' in data) row.reorderLevel = data.reorderLevel;
            if ('size' in data) row.size = data.size;
            if ('unit' in data) row.unit = data.unit;
            if ('description' in data) row.description = data.description;
            if ('hidden' in data) row.hidden = data.hidden;
            if ('category' in data) row.category = data.category;
            if ('images' in data) row.images = data.images;
            if ('imageUrl' in data) row.imageUrl = data.imageUrl;
            row.updatedAt = Date.now();
            var payload = { data: row, updated_at: new Date().toISOString() };
            return request('PATCH', '/inventory?plant_id=eq.' + id, payload).then(function (updated) {
                if (updated && updated.length > 0) return updated;
                return request('POST', '/inventory', { plant_id: id, data: row, updated_at: new Date().toISOString() });
            });
        });
    }

    /**
     * Update one plant in plants_catalog (e.g. after adding images).
     * @param {number} plantId - plant id
     * @param {object} plantData - full plant object to store in data column (must include id, images, imageUrl, etc.)
     */
    function updatePlantInCatalog(plantId, plantData) {
        var id = Number(plantId);
        if (!isFinite(id) || !plantData) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        var payload = { data: plantData };
        return request('PATCH', '/plants_catalog?id=eq.' + id, payload).catch(function () {});
    }

    function deleteFromPlantsCatalog(plantId) {
        var id = Number(plantId);
        if (!isFinite(id)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return request('DELETE', '/plants_catalog?id=eq.' + id).catch(function () {});
    }

    // ---- Catalog helpers (read-only) ----
    function getPlantsCatalog() {
        if (!isConfigured()) return Promise.resolve([]);
        return request('GET', '/plants_catalog?select=id,data&order=id.asc').then(function (rows) {
            return (rows || []).map(function (r) {
                var d = r.data || {};
                d.id = r.id;
                if (!Array.isArray(d.images) && d.imageUrl) d.images = [d.imageUrl];
                if (!Array.isArray(d.images)) d.images = [];
                return d;
            });
        }).catch(function () { return []; });
    }

    function getEquipmentCatalog() {
        if (!isConfigured()) return Promise.resolve([]);
        return request('GET', '/equipment_catalog?select=id,data&order=id.asc').then(function (rows) {
            return (rows || []).map(function (r) {
                var d = r.data || {};
                d.id = r.id;
                return d;
            });
        }).catch(function () { return []; });
    }

    function getVivariumsCatalog() {
        if (!isConfigured()) return Promise.resolve([]);
        return request('GET', '/vivariums_catalog?select=id,data&order=id.asc').then(function (rows) {
            return (rows || []).map(function (r) {
                var d = r.data || {};
                d.id = r.id;
                return d;
            });
        }).catch(function () { return []; });
    }

    function updateEquipmentInCatalog(equipmentId, itemData) {
        var id = Number(equipmentId);
        if (!isFinite(id) || !itemData) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return request('PATCH', '/equipment_catalog?id=eq.' + id, { data: itemData }).catch(function () {});
    }

    function updateVivariumInCatalog(vivariumId, itemData) {
        var id = Number(vivariumId);
        if (!isFinite(id) || !itemData) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return request('PATCH', '/vivariums_catalog?id=eq.' + id, { data: itemData }).catch(function () {});
    }

    function createEquipmentInCatalog(itemData) {
        if (!itemData || itemData.id == null) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        var id = Number(itemData.id);
        if (!isFinite(id)) return Promise.resolve();
        return request('POST', '/equipment_catalog', { id: id, data: itemData }).catch(function () {});
    }

    function createVivariumInCatalog(itemData) {
        if (!itemData || itemData.id == null) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        var id = Number(itemData.id);
        if (!isFinite(id)) return Promise.resolve();
        return request('POST', '/vivariums_catalog', { id: id, data: itemData }).catch(function () {});
    }

    function deleteFromEquipmentCatalog(equipmentId) {
        var id = Number(equipmentId);
        if (!isFinite(id)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return request('DELETE', '/equipment_catalog?id=eq.' + id).catch(function () {});
    }

    function deleteFromVivariumCatalog(vivariumId) {
        var id = Number(vivariumId);
        if (!isFinite(id)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return request('DELETE', '/vivariums_catalog?id=eq.' + id).catch(function () {});
    }

    function getNextEquipmentId() {
        if (!isConfigured()) return Promise.resolve(50001);
        return request('GET', '/equipment_catalog?select=id&order=id.desc&limit=1').then(function (rows) {
            var max = (rows && rows[0] && rows[0].id != null) ? Number(rows[0].id) : 50000;
            return Math.max(50001, max + 1);
        }).catch(function () { return 50001; });
    }

    function getNextVivariumId() {
        if (!isConfigured()) return Promise.resolve(60001);
        return request('GET', '/vivariums_catalog?select=id&order=id.desc&limit=1').then(function (rows) {
            var max = (rows && rows[0] && rows[0].id != null) ? Number(rows[0].id) : 60000;
            return Math.max(60001, max + 1);
        }).catch(function () { return 60001; });
    }

    // ---- Custom equipment (legacy; prefer equipment_catalog) ----
    function getCustomEquipment() {
        if (!isConfigured()) return Promise.resolve([]);
        return request('GET', '/custom_equipment?select=id,data&order=id.asc').then(function (rows) {
            return (rows || []).map(function (r) { return r.data || {}; });
        }).catch(function () { return []; });
    }

    function saveCustomEquipment(items) {
        if (!Array.isArray(items)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return request('GET', '/custom_equipment?select=id').then(function (existing) {
            var ids = (existing || []).map(function (r) { return r.id; });
            var toDelete = ids.filter(function (id) { return !items.some(function (it) { return Number(it.id) === Number(id); }); });
            var promises = toDelete.map(function (id) { return request('DELETE', '/custom_equipment?id=eq.' + id); });
            items.forEach(function (item) {
                var id = Number(item.id);
                if (!isFinite(id)) return;
                promises.push(
                    request('PATCH', '/custom_equipment?id=eq.' + id, { data: item }).then(function (r) {
                        if (r && r.length > 0) return r;
                        return request('POST', '/custom_equipment', { id: id, data: item });
                    }).catch(function () {
                        return request('POST', '/custom_equipment', { id: id, data: item });
                    })
                );
            });
            return Promise.all(promises);
        }).catch(function () {});
    }

    // ---- Custom vivariums (array of { id, name, type, plantIds, ... }) ----
    function getCustomVivariums() {
        if (!isConfigured()) return Promise.resolve([]);
        return request('GET', '/custom_vivariums?select=id,data&order=id.asc').then(function (rows) {
            return (rows || []).map(function (r) { return r.data || {}; });
        }).catch(function () { return []; });
    }

    function saveCustomVivariums(items) {
        if (!Array.isArray(items)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return request('GET', '/custom_vivariums?select=id').then(function (existing) {
            var ids = (existing || []).map(function (r) { return r.id; });
            var toDelete = ids.filter(function (id) { return !items.some(function (it) { return Number(it.id) === Number(id); }); });
            var promises = toDelete.map(function (id) { return request('DELETE', '/custom_vivariums?id=eq.' + id); });
            items.forEach(function (item) {
                var id = Number(item.id);
                if (!isFinite(id)) return;
                promises.push(
                    request('PATCH', '/custom_vivariums?id=eq.' + id, { data: item }).then(function (r) {
                        if (r && r.length > 0) return r;
                        return request('POST', '/custom_vivariums', { id: id, data: item });
                    }).catch(function () {
                        return request('POST', '/custom_vivariums', { id: id, data: item });
                    })
                );
            });
            return Promise.all(promises);
        }).catch(function () {});
    }

    // ---- Profiles (auth-scoped; use requestAuth) ----
    function getProfile(userId) {
        if (!isConfigured() || !userId) return Promise.resolve(null);
        return requestAuth('GET', '/profiles?id=eq.' + encodeURIComponent(userId) + '&select=*').then(function (rows) {
            if (!rows || rows.length === 0) return null;
            var r = rows[0];
            return { userId: userId, savedAddresses: r.saved_addresses || [], billingAddress: r.billing_address || null };
        }).catch(function () { return null; });
    }

    function updateProfile(userId, data) {
        if (!isConfigured() || !userId) return Promise.reject(new Error('Not configured'));
        var payload = {
            saved_addresses: data.savedAddresses || [],
            billing_address: data.billingAddress !== undefined ? data.billingAddress : undefined,
            updated_at: new Date().toISOString()
        };
        return requestAuth('PATCH', '/profiles?id=eq.' + encodeURIComponent(userId), payload).then(function () {});
    }

    /** List all profiles (for access control). Requires authenticated user; RLS allows read for authenticated. */
    function getProfiles() {
        if (!isConfigured()) return Promise.resolve([]);
        return requestAuth('GET', '/profiles?select=id,email,display_name,role,created_at&order=created_at.desc').then(function (rows) {
            return (rows || []).map(function (r) {
                return { id: r.id, email: r.email || '', name: r.display_name || '', role: r.role || 'user', createdAt: r.created_at ? new Date(r.created_at).getTime() : null };
            });
        }).catch(function () { return []; });
    }

    /** Set role for a profile (owner only in practice; RLS must allow). */
    function setProfileRole(userId, newRole) {
        if (!isConfigured() || !userId) return Promise.reject(new Error('Not configured'));
        var allowed = ['owner', 'admin', 'stock', 'user'];
        if (allowed.indexOf(newRole) === -1) return Promise.reject(new Error('Invalid role'));
        return requestAuth('PATCH', '/profiles?id=eq.' + encodeURIComponent(userId), { role: newRole, updated_at: new Date().toISOString() }).then(function () {});
    }

    // ---- Product reviews (read with request; write with requestAuth) ----
    function getReviewsByProduct(productType, productId) {
        if (!isConfigured()) return Promise.resolve([]);
        return request('GET', '/product_reviews?product_type=eq.' + encodeURIComponent(productType) + '&product_id=eq.' + Number(productId) + '&order=created_at.desc').then(function (rows) {
            return (rows || []).map(function (r) {
                return { id: r.id, userId: r.user_id, userDisplayName: r.user_display_name, productType: r.product_type, productId: r.product_id, productName: r.product_name, rating: r.rating, comment: r.comment || '', createdAt: r.created_at ? new Date(r.created_at).getTime() : null };
            });
        }).catch(function () { return []; });
    }

    function getAverageRating(productType, productId) {
        return getReviewsByProduct(productType, productId).then(function (reviews) {
            var count = (reviews || []).length;
            if (count === 0) return { average: 0, count: 0 };
            var sum = reviews.reduce(function (s, r) { return s + (Number(r.rating) || 0); }, 0);
            return { average: Math.round((sum / count) * 10) / 10, count: count };
        });
    }

    function saveReview(userId, review) {
        if (!isConfigured()) return Promise.reject(new Error('Not configured'));
        var payload = {
            user_id: userId,
            user_display_name: (review.userDisplayName || '').trim() || undefined,
            product_type: review.productType || 'plant',
            product_id: Number(review.productId),
            product_name: review.productName || null,
            rating: Math.min(5, Math.max(1, Number(review.rating) || 5)),
            comment: (review.comment || '').trim() || null
        };
        return requestAuth('POST', '/product_reviews', payload).then(function (rows) {
            return (rows && rows[0] && rows[0].id) || null;
        });
    }

    function getReviewsByUser(userId, limit) {
        if (!isConfigured() || !userId) return Promise.resolve([]);
        var path = '/product_reviews?user_id=eq.' + encodeURIComponent(userId) + '&order=created_at.desc';
        if (limit) path += '&limit=' + Number(limit);
        return requestAuth('GET', path).then(function (rows) {
            return (rows || []).map(function (r) {
                return { id: r.id, userId: r.user_id, userDisplayName: r.user_display_name, productType: r.product_type, productId: r.product_id, productName: r.product_name, rating: r.rating, comment: r.comment || '', createdAt: r.created_at ? new Date(r.created_at).getTime() : null };
            });
        }).catch(function () { return []; });
    }

    function getReviewById(reviewId) {
        if (!isConfigured()) return Promise.resolve(null);
        return request('GET', '/product_reviews?id=eq.' + Number(reviewId)).then(function (rows) {
            if (!rows || rows.length === 0) return null;
            var r = rows[0];
            return { id: r.id, userId: r.user_id, userDisplayName: r.user_display_name, productType: r.product_type, productId: r.product_id, productName: r.product_name, rating: r.rating, comment: r.comment || '', createdAt: r.created_at ? new Date(r.created_at).getTime() : null };
        }).catch(function () { return null; });
    }

    function deleteReview(reviewId) {
        if (!isConfigured()) return Promise.resolve();
        return requestAuth('DELETE', '/product_reviews?id=eq.' + Number(reviewId)).catch(function () {});
    }

    configure();
    global.supabaseDb = {
        isConfigured: isConfigured,
        getInventory: getInventory,
        getInventoryItem: getInventoryItem,
        setInventoryRow: setInventoryRow,
        deleteInventoryRow: deleteInventoryRow,
        getPlantsCatalog: getPlantsCatalog,
        getEquipmentCatalog: getEquipmentCatalog,
        getVivariumsCatalog: getVivariumsCatalog,
        updateEquipmentInCatalog: updateEquipmentInCatalog,
        updateVivariumInCatalog: updateVivariumInCatalog,
        createEquipmentInCatalog: createEquipmentInCatalog,
        createVivariumInCatalog: createVivariumInCatalog,
        deleteFromEquipmentCatalog: deleteFromEquipmentCatalog,
        deleteFromVivariumCatalog: deleteFromVivariumCatalog,
        getNextEquipmentId: getNextEquipmentId,
        getNextVivariumId: getNextVivariumId,
        getCustomEquipment: getCustomEquipment,
        saveCustomEquipment: saveCustomEquipment,
        getCustomVivariums: getCustomVivariums,
        saveCustomVivariums: saveCustomVivariums,
        uploadToStorage: uploadToStorage,
        listStoragePaths: listStoragePaths,
        deleteFromStorage: deleteFromStorage,
        updatePlantInCatalog: updatePlantInCatalog,
        deleteFromPlantsCatalog: deleteFromPlantsCatalog,
        getProfile: getProfile,
        updateProfile: updateProfile,
        getProfiles: getProfiles,
        setProfileRole: setProfileRole,
        getReviewsByProduct: getReviewsByProduct,
        getAverageRating: getAverageRating,
        saveReview: saveReview,
        getReviewsByUser: getReviewsByUser,
        getReviewById: getReviewById,
        deleteReview: deleteReview
    };
})(typeof window !== 'undefined' ? window : this);
