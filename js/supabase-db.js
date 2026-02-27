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

    /**
     * Upload a file to Supabase Storage. Bucket must exist and be public (see docs/SUPABASE_SETUP.md).
     * @param {File} file - the file to upload
     * @param {string} objectPath - path inside bucket, e.g. "plants/123/photo.jpg"
     * @returns {Promise<string>} public URL of the uploaded file
     */
    function uploadToStorage(file, objectPath) {
        if (!file || !objectPath) return Promise.reject(new Error('file and path required'));
        if (!isConfigured()) return Promise.reject(new Error('Supabase not configured'));
        if (!STORAGE_BASE) STORAGE_BASE = (global.SUPABASE_URL || '').toString().trim().replace(/\/$/, '');
        var url = STORAGE_BASE + '/storage/v1/object/vivarium-assets/' + objectPath;
        var headers = {
            'Authorization': 'Bearer ' + (global.SUPABASE_ANON_KEY || HEADERS.apikey || ''),
            'apikey': (global.SUPABASE_ANON_KEY || HEADERS.apikey || '')
        };
        if (file.type) headers['Content-Type'] = file.type;
        return fetch(url, { method: 'POST', headers: headers, body: file }).then(function (res) {
            if (!res.ok) return Promise.reject(new Error('Storage upload failed: ' + res.status));
            return res.json().then(function (data) {
                var path = (data && data.path) ? data.path : objectPath;
                return STORAGE_BASE + '/storage/v1/object/public/vivarium-assets/' + path;
            }).catch(function () {
                return STORAGE_BASE + '/storage/v1/object/public/vivarium-assets/' + objectPath;
            });
        });
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

    // ---- Custom equipment (array of items with id, name, category, ...) ----
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
        getCustomEquipment: getCustomEquipment,
        saveCustomEquipment: saveCustomEquipment,
        getCustomVivariums: getCustomVivariums,
        saveCustomVivariums: saveCustomVivariums,
        uploadToStorage: uploadToStorage,
        deleteFromStorage: deleteFromStorage,
        updatePlantInCatalog: updatePlantInCatalog
    };
})(typeof window !== 'undefined' ? window : this);
