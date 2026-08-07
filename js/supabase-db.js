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

    /** Current user JWT for RLS-protected writes. */
    function getAuthToken() {
        return (global.supabaseAuth && global.supabaseAuth.getAccessToken)
            ? global.supabaseAuth.getAccessToken()
            : null;
    }

    /** Authenticated request (uses Supabase Auth JWT for RLS). Never falls back to anon key. */
    function requestAuth(method, path, body) {
        var token = getAuthToken();
        if (!token) return Promise.reject(new Error('Not authenticated'));
        var headers = {
            'apikey': HEADERS.apikey,
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
        var opt = { method: method, headers: headers };
        if (body !== undefined) opt.body = JSON.stringify(body);
        return fetch(BASE + path, opt).then(function (res) {
            if (!res.ok) return Promise.reject(new Error(res.status + ' ' + res.statusText));
            if (res.status === 204 || res.headers.get('content-length') === '0') return [];
            return res.json();
        });
    }

    function storageAuthHeaders(extra) {
        var token = getAuthToken();
        if (!token) return null;
        var headers = {
            'Authorization': 'Bearer ' + token,
            'apikey': HEADERS.apikey || global.SUPABASE_ANON_KEY || ''
        };
        if (extra) {
            Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
        }
        return headers;
    }

    /** Sanitize storage path: no leading/trailing slashes, no backslashes, no double slashes. */
    function sanitizeStoragePath(path) {
        if (typeof path !== 'string') return '';
        return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '').trim();
    }

    /**
     * Upload a file to Supabase Storage (staff JWT required — RLS).
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

        var headers = storageAuthHeaders({ 'x-upsert': 'true' });
        if (!headers) return Promise.reject(new Error('Not authenticated'));
        var url = STORAGE_BASE + '/storage/v1/object/vivarium-assets/' + path;
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
        var headers = storageAuthHeaders();
        if (!headers) return Promise.reject(new Error('Not authenticated'));
        return fetch(url, { method: 'DELETE', headers: headers }).then(function (res) {
            if (!res.ok) return Promise.reject(new Error('Storage delete failed: ' + res.status));
            return undefined;
        });
    }

    /** Staff may read costs from inventory_costs; everyone else never sees costPrice. */
    function canReadFullInventory() {
        var u = global.auth && global.auth.getCurrentUser ? global.auth.getCurrentUser() : null;
        return !!(u && (u.role === 'owner' || u.role === 'admin' || u.role === 'stock'));
    }

    function mapInventoryRows(rows) {
        return (rows || []).map(function (r) {
            var d = r.data || {};
            d.plantId = r.plant_id;
            delete d.costPrice;
            return d;
        });
    }

    function stripCostFromObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        var copy = Object.assign({}, obj);
        delete copy.costPrice;
        return copy;
    }

    function fetchInventoryCostsByPlantId() {
        if (!canReadFullInventory()) return Promise.resolve({});
        return requestAuth('GET', '/inventory_costs?select=plant_id,cost_price').then(function (rows) {
            var byId = {};
            (rows || []).forEach(function (r) {
                if (r && r.plant_id != null && r.cost_price != null && r.cost_price !== '') {
                    byId[r.plant_id] = Number(r.cost_price);
                }
            });
            return byId;
        }).catch(function () { return {}; });
    }

    function mergeCostsIntoRows(rows, costById) {
        (rows || []).forEach(function (d) {
            if (!d || d.plantId == null) return;
            if (costById[d.plantId] != null) d.costPrice = costById[d.plantId];
            else delete d.costPrice;
        });
        return rows;
    }

    function upsertInventoryCost(plantId, costPrice) {
        var id = Number(plantId);
        if (!isFinite(id)) return Promise.resolve();
        if (costPrice == null || costPrice === '' || isNaN(Number(costPrice))) {
            return requestAuth('DELETE', '/inventory_costs?plant_id=eq.' + id).catch(function () {});
        }
        var body = {
            cost_price: Number(costPrice),
            updated_at: new Date().toISOString()
        };
        return requestAuth('PATCH', '/inventory_costs?plant_id=eq.' + id, body).then(function (updated) {
            if (updated && updated.length > 0) return updated;
            return requestAuth('POST', '/inventory_costs', {
                plant_id: id,
                cost_price: Number(costPrice),
                updated_at: new Date().toISOString()
            });
        }).catch(function () {
            return requestAuth('POST', '/inventory_costs', {
                plant_id: id,
                cost_price: Number(costPrice),
                updated_at: new Date().toISOString()
            });
        });
    }

    // ---- Inventory (same shape as IndexedDB: { plantId, name, price, ... }) ----
    function getInventory() {
        if (!isConfigured()) return Promise.resolve([]);
        // Public-safe inventory rows (no cost in data). Staff merge costs separately.
        return request('GET', '/inventory_public?select=plant_id,data').then(mapInventoryRows).then(function (rows) {
            if (!canReadFullInventory()) return rows;
            return fetchInventoryCostsByPlantId().then(function (costById) {
                return mergeCostsIntoRows(rows, costById);
            });
        }).catch(function () { return []; });
    }

    function getInventoryItem(plantId) {
        var id = Number(plantId);
        if (!isFinite(id)) return Promise.resolve(undefined);
        if (!isConfigured()) return Promise.resolve(undefined);
        var path = '/inventory_public?plant_id=eq.' + id + '&select=plant_id,data';
        return request('GET', path).then(function (rows) {
            if (!rows || rows.length === 0) return undefined;
            var d = rows[0].data || {};
            d.plantId = rows[0].plant_id;
            delete d.costPrice;
            if (!canReadFullInventory()) return d;
            return requestAuth('GET', '/inventory_costs?plant_id=eq.' + id + '&select=plant_id,cost_price').then(function (costRows) {
                if (costRows && costRows[0] && costRows[0].cost_price != null && costRows[0].cost_price !== '') {
                    d.costPrice = Number(costRows[0].cost_price);
                }
                return d;
            }).catch(function () { return d; });
        }).catch(function () { return undefined; });
    }

    /** Staff load of inventory row + cost (for merges that must not wipe cost). */
    function getInventoryItemFull(plantId) {
        return getInventoryItem(plantId);
    }

    function deleteInventoryRow(plantId) {
        var id = Number(plantId);
        if (!isFinite(id)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return requestAuth('DELETE', '/inventory_costs?plant_id=eq.' + id).catch(function () {}).then(function () {
            return requestAuth('DELETE', '/inventory?plant_id=eq.' + id);
        }).then(function () {});
    }

    function setInventoryRow(plantId, data) {
        var id = Number(plantId);
        if (!isFinite(id)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        var costProvided = data && Object.prototype.hasOwnProperty.call(data, 'costPrice');
        var nextCost = costProvided ? data.costPrice : undefined;
        return getInventoryItemFull(plantId).then(function (existing) {
            var row = existing || { plantId: id };
            if ('name' in data) row.name = data.name;
            if ('scientificName' in data) row.scientificName = data.scientificName;
            if ('price' in data) row.price = data.price;
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
            delete row.costPrice;
            var payload = { data: stripCostFromObject(row), updated_at: new Date().toISOString() };
            return requestAuth('PATCH', '/inventory?plant_id=eq.' + id, payload).then(function (updated) {
                if (updated && updated.length > 0) return updated;
                return requestAuth('POST', '/inventory', { plant_id: id, data: stripCostFromObject(row), updated_at: new Date().toISOString() });
            }).then(function (result) {
                if (!costProvided) return result;
                return upsertInventoryCost(id, nextCost).then(function () { return result; });
            });
        });
    }

    /**
     * Update one plant in plants_catalog (e.g. after adding images).
     * costPrice is never stored in catalog (inventory-only).
     */
    function updatePlantInCatalog(plantId, plantData) {
        var id = Number(plantId);
        if (!isFinite(id) || !plantData) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        var payload = { data: stripCostFromObject(plantData) };
        return requestAuth('PATCH', '/plants_catalog?id=eq.' + id, payload).catch(function () {});
    }

    function deleteFromPlantsCatalog(plantId) {
        var id = Number(plantId);
        if (!isFinite(id)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return requestAuth('DELETE', '/plants_catalog?id=eq.' + id).catch(function () {});
    }

    // ---- Catalog helpers (read-only) ----

    /**
     * Fields needed for cards, filters, sort, and badges.
     * Omits gallery arrays + long text (description/careTips) — those load on detail open.
     */
    var PLANT_LIST_JSON_KEYS = [
        'name', 'scientificName', 'commonNames', 'imageUrl', 'price', 'unit', 'stockQuantity',
        'hidden', 'rarity', 'size', 'carnivorous', 'category', 'plantType', 'growthHabit',
        'growthPattern', 'substrate', 'substrateType', 'specialNeeds', 'isCultivar', 'isVariety',
        'isHybrid', 'taxonomy', 'humidityRange', 'lightRange', 'airCirculationRange',
        'waterNeedsRange', 'temperatureRange', 'growthRateRange', 'difficultyRange', 'difficulty',
        'waterCirculationRange', 'waterTemperatureRange', 'waterPhRange', 'waterHardnessRange',
        'salinityRange', 'soilPhRange', 'availability', 'humidity', 'lightRequirements',
        'airCirculation', 'watering', 'temperature', 'growthRate', 'waterCirculation', 'type',
        'topSeller', 'salesCount'
    ];

    function resolveAssetUrl(u) {
        if (!u || typeof u !== 'string') return u;
        if (/^https?:\/\//i.test(u)) return u;
        var base = STORAGE_BASE || ((global.SUPABASE_URL || '').toString().replace(/\/$/, ''));
        if (!base) return u;
        var storagePrefix = base + '/storage/v1/object/public/vivarium-assets/';
        if (u.startsWith('/storage/')) return base + u;
        if (u.startsWith('plants/')) return storagePrefix + u;
        if (u.startsWith('images/plants/')) return storagePrefix + u.slice(7);
        return u;
    }

    function normalizeCatalogPlant(d, id, slim) {
        d = stripCostFromObject(d || {});
        d.id = id;
        if (!Array.isArray(d.images) && d.imageUrl) d.images = [d.imageUrl];
        if (!Array.isArray(d.images)) d.images = [];
        if (slim) {
            // List payload has no gallery — keep a single thumb slot for cards
            if (d.imageUrl) d.images = [d.imageUrl];
            else d.images = [];
            d._catalogSlim = true;
        }
        if (Array.isArray(d.images)) d.images = d.images.map(resolveAssetUrl);
        if (d.imageUrl) d.imageUrl = resolveAssetUrl(d.imageUrl);
        return d;
    }

    /** Full plant blobs (admin tools / hydration). Prefer getPlantsCatalogList for the shop. */
    function getPlantsCatalog() {
        if (!isConfigured()) return Promise.resolve([]);
        return request('GET', '/plants_catalog?select=id,data&order=id.asc').then(function (rows) {
            return (rows || []).map(function (r) {
                return normalizeCatalogPlant(r.data, r.id, false);
            });
        }).catch(function () { return []; });
    }

    /**
     * Lightweight catalog for the storefront grid (~half the full JSON payload).
     * Falls back to full getPlantsCatalog if the projected select fails.
     */
    function getPlantsCatalogList() {
        if (!isConfigured()) return Promise.resolve([]);
        var select = 'id,' + PLANT_LIST_JSON_KEYS.map(function (k) { return 'data->' + k; }).join(',');
        return request('GET', '/plants_catalog?select=' + encodeURIComponent(select) + '&order=id.asc')
            .then(function (rows) {
                if (!rows || !rows.length) return [];
                // Guard: projected select should flatten keys onto the row (not nest under data)
                var sample = rows[0];
                if (sample && sample.data && typeof sample.data === 'object' && sample.name == null) {
                    return getPlantsCatalog();
                }
                return rows.map(function (r) {
                    var d = Object.assign({}, r);
                    delete d.id;
                    return normalizeCatalogPlant(d, r.id, true);
                });
            })
            .catch(function () { return getPlantsCatalog(); });
    }

    /** Full single plant (detail panel / edit). */
    function getPlantFromCatalog(plantId) {
        var id = Number(plantId);
        if (!isFinite(id) || !isConfigured()) return Promise.resolve(null);
        return request('GET', '/plants_catalog?id=eq.' + id + '&select=id,data').then(function (rows) {
            if (!rows || !rows[0]) return null;
            return normalizeCatalogPlant(rows[0].data, rows[0].id, false);
        }).catch(function () { return null; });
    }

    function getEquipmentCatalog() {
        if (!isConfigured()) return Promise.resolve([]);
        return request('GET', '/equipment_catalog?select=id,data&order=id.asc').then(function (rows) {
            return (rows || []).map(function (r) {
                var d = stripCostFromObject(r.data || {});
                d.id = r.id;
                return d;
            });
        }).catch(function () { return []; });
    }

    function getVivariumsCatalog() {
        if (!isConfigured()) return Promise.resolve([]);
        return request('GET', '/vivariums_catalog?select=id,data&order=id.asc').then(function (rows) {
            return (rows || []).map(function (r) {
                var d = stripCostFromObject(r.data || {});
                d.id = r.id;
                return d;
            });
        }).catch(function () { return []; });
    }

    function updateEquipmentInCatalog(equipmentId, itemData) {
        var id = Number(equipmentId);
        if (!isFinite(id) || !itemData) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return requestAuth('PATCH', '/equipment_catalog?id=eq.' + id, { data: stripCostFromObject(itemData) }).catch(function () {});
    }

    function updateVivariumInCatalog(vivariumId, itemData) {
        var id = Number(vivariumId);
        if (!isFinite(id) || !itemData) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return requestAuth('PATCH', '/vivariums_catalog?id=eq.' + id, { data: stripCostFromObject(itemData) }).catch(function () {});
    }

    function createEquipmentInCatalog(itemData) {
        if (!itemData || itemData.id == null) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        var id = Number(itemData.id);
        if (!isFinite(id)) return Promise.resolve();
        return requestAuth('POST', '/equipment_catalog', { id: id, data: stripCostFromObject(itemData) }).catch(function () {});
    }

    function createVivariumInCatalog(itemData) {
        if (!itemData || itemData.id == null) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        var id = Number(itemData.id);
        if (!isFinite(id)) return Promise.resolve();
        return requestAuth('POST', '/vivariums_catalog', { id: id, data: stripCostFromObject(itemData) }).catch(function () {});
    }

    function deleteFromEquipmentCatalog(equipmentId) {
        var id = Number(equipmentId);
        if (!isFinite(id)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return requestAuth('DELETE', '/equipment_catalog?id=eq.' + id).catch(function () {});
    }

    function deleteFromVivariumCatalog(vivariumId) {
        var id = Number(vivariumId);
        if (!isFinite(id)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return requestAuth('DELETE', '/vivariums_catalog?id=eq.' + id).catch(function () {});
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

    function normalizeArticleRow(r) {
        var d = (r && r.data) ? Object.assign({}, r.data) : {};
        if (r && r.id != null) d.id = r.id;
        if (r && r.slug && !d.slug) d.slug = r.slug;
        return d;
    }

    function getArticles() {
        if (!isConfigured()) return Promise.resolve([]);
        return request('GET', '/articles?select=id,slug,data&order=id.asc').then(function (rows) {
            return (rows || []).map(normalizeArticleRow);
        }).catch(function () { return []; });
    }

    function getArticleBySlug(slug) {
        if (!slug || !isConfigured()) return Promise.resolve(null);
        var q = encodeURIComponent(String(slug));
        return request('GET', '/articles?slug=eq.' + q + '&select=id,slug,data&limit=1').then(function (rows) {
            return (rows && rows[0]) ? normalizeArticleRow(rows[0]) : null;
        }).catch(function () { return null; });
    }

    function getNextArticleId() {
        if (!isConfigured()) return Promise.resolve(70001);
        return request('GET', '/articles?select=id&order=id.desc&limit=1').then(function (rows) {
            var max = (rows && rows[0] && rows[0].id != null) ? Number(rows[0].id) : 70000;
            return Math.max(70001, max + 1);
        }).catch(function () { return 70001; });
    }

    function createArticle(itemData) {
        if (!itemData || itemData.id == null || !itemData.slug) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        var id = Number(itemData.id);
        if (!isFinite(id)) return Promise.resolve();
        var payload = { id: id, slug: String(itemData.slug), data: itemData, updated_at: new Date().toISOString() };
        return requestAuth('POST', '/articles', payload);
    }

    function updateArticle(articleId, itemData) {
        var id = Number(articleId);
        if (!isFinite(id) || !itemData) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        var payload = { data: itemData, updated_at: new Date().toISOString() };
        if (itemData.slug) payload.slug = String(itemData.slug);
        return requestAuth('PATCH', '/articles?id=eq.' + id, payload);
    }

    function deleteArticle(articleId) {
        var id = Number(articleId);
        if (!isFinite(id)) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();
        return requestAuth('DELETE', '/articles?id=eq.' + id).catch(function () {});
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
            var promises = toDelete.map(function (id) { return requestAuth('DELETE', '/custom_equipment?id=eq.' + id); });
            items.forEach(function (item) {
                var id = Number(item.id);
                if (!isFinite(id)) return;
                promises.push(
                    requestAuth('PATCH', '/custom_equipment?id=eq.' + id, { data: item }).then(function (r) {
                        if (r && r.length > 0) return r;
                        return requestAuth('POST', '/custom_equipment', { id: id, data: item });
                    }).catch(function () {
                        return requestAuth('POST', '/custom_equipment', { id: id, data: item });
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
            var promises = toDelete.map(function (id) { return requestAuth('DELETE', '/custom_vivariums?id=eq.' + id); });
            items.forEach(function (item) {
                var id = Number(item.id);
                if (!isFinite(id)) return;
                promises.push(
                    requestAuth('PATCH', '/custom_vivariums?id=eq.' + id, { data: item }).then(function (r) {
                        if (r && r.length > 0) return r;
                        return requestAuth('POST', '/custom_vivariums', { id: id, data: item });
                    }).catch(function () {
                        return requestAuth('POST', '/custom_vivariums', { id: id, data: item });
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
        getPlantsCatalogList: getPlantsCatalogList,
        getPlantFromCatalog: getPlantFromCatalog,
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
        getArticles: getArticles,
        getArticleBySlug: getArticleBySlug,
        getNextArticleId: getNextArticleId,
        createArticle: createArticle,
        updateArticle: updateArticle,
        deleteArticle: deleteArticle,
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
