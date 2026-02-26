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

    function request(method, path, body) {
        var opt = { method: method, headers: HEADERS };
        if (body !== undefined) opt.body = JSON.stringify(body);
        return fetch(BASE + path, opt).then(function (res) {
            if (!res.ok) return Promise.reject(new Error(res.status + ' ' + res.statusText));
            if (res.status === 204 || res.headers.get('content-length') === '0') return [];
            return res.json();
        });
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
            row.updatedAt = Date.now();
            var payload = { data: row, updated_at: new Date().toISOString() };
            return request('PATCH', '/inventory?plant_id=eq.' + id, payload).then(function (updated) {
                if (updated && updated.length > 0) return updated;
                return request('POST', '/inventory', { plant_id: id, data: row, updated_at: new Date().toISOString() });
            });
        });
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
        getCustomEquipment: getCustomEquipment,
        saveCustomEquipment: saveCustomEquipment,
        getCustomVivariums: getCustomVivariums,
        saveCustomVivariums: saveCustomVivariums
    };
})(typeof window !== 'undefined' ? window : this);
