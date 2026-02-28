/**
 * Load supplies (containers, tools, soil, hardscape, etc.) for the shop.
 * Supply items use ids 50001+ to avoid clash with plant ids.
 * Same cart and inventory as plants; no plant-specific fields.
 */
(function () {
    'use strict';
    function getDataBaseUrl() {
        try {
            if (typeof document !== 'undefined' && document.baseURI) {
                var base = new URL('data/', document.baseURI).href;
                if (base) return base;
            }
            var script = document.currentScript;
            if (script && script.src) {
                return script.src.replace(/\/[^/]+$/, '/');
            }
        } catch (e) { /* ignore */ }
        return 'data/';
    }
    const DATA_BASE = getDataBaseUrl();

    function normalizeEquipmentImageUrls(list) {
        if (!list || !list.length) return;
        var base = (typeof window !== 'undefined' && window.SUPABASE_URL) ? String(window.SUPABASE_URL).replace(/\/$/, '') : '';
        if (!base) return;
        var storagePrefix = base + '/storage/v1/object/public/vivarium-assets/';
        list.forEach(function (item) {
            function toStorageUrl(path) {
                if (!path || typeof path !== 'string' || /^https?:\/\//i.test(path)) return path;
                if (path.startsWith('supplies/')) return storagePrefix + path;
                if (path.startsWith('images/supplies/')) return storagePrefix + path.slice(7);
                var legacy = path.match(/^(?:images\/)?equipment\/(\d+)(?:\/(.*))?$/);
                if (legacy) return storagePrefix + 'supplies/equipment-' + legacy[1] + '/' + ((legacy[2] && legacy[2].trim()) ? legacy[2] : '1.jpg');
                return path;
            }
            if (item.imageUrl) item.imageUrl = toStorageUrl(item.imageUrl);
            if (Array.isArray(item.images)) item.images = item.images.map(toStorageUrl);
        });
    }

    async function loadEquipment() {
        if (typeof window === 'undefined') return [];
        try {
            // If Supabase is configured and provides a catalog, use that as the single source of truth.
            if (window.supabaseDb && window.supabaseDb.isConfigured && window.supabaseDb.isConfigured() && window.supabaseDb.getEquipmentCatalog) {
                try {
                    const cat = await window.supabaseDb.getEquipmentCatalog();
                    if (Array.isArray(cat) && cat.length) {
                        normalizeEquipmentImageUrls(cat);
                        window.equipmentData = cat;
                        return cat;
                    }
                } catch (e) {
                    console.warn('Supabase equipment_catalog load failed, falling back to JSON:', e.message);
                }
            }
            // Prefer repo overrides (synced from local edits when using sync server)
            const overridesResp = await fetch(DATA_BASE + 'overrides/equipment.json?v=' + Date.now(), { cache: 'no-store' });
            if (overridesResp.ok) {
                const data = await overridesResp.json();
                const list = Array.isArray(data) ? data : (data.items || data.equipment || []);
                if (Array.isArray(list) && list.length) {
                    const byId = {};
                    list.forEach(function (item) {
                        if (!item || item.id == null) return;
                        byId[item.id] = Object.assign({}, byId[item.id] || {}, item);
                    });
                    list = Object.values(byId);
                    normalizeEquipmentImageUrls(list);
                    window.equipmentData = list;
                    return window.equipmentData;
                }
            }
            var resp = await fetch(DATA_BASE + 'equipment.json?v=' + Date.now(), { cache: 'no-store' });
            if (!resp.ok && DATA_BASE !== 'data/') {
                resp = await fetch('data/equipment.json?v=' + Date.now(), { cache: 'no-store' });
            }
            if (!resp.ok) return [];
            const data = await resp.json();
            let list = Array.isArray(data) ? data : (data.items || data.equipment || []);
            try {
                var customEq = [];
                if (typeof localStorage !== 'undefined' && localStorage.getItem('custom_equipment')) {
                    customEq = JSON.parse(localStorage.getItem('custom_equipment'));
                }
                if (Array.isArray(customEq) && customEq.length) list = (list || []).concat(customEq);
            } catch (err) { /* ignore */ }
            if (Array.isArray(list) && list.length) {
                const byId = {};
                list.forEach(function (item) {
                    if (!item || item.id == null) return;
                    byId[item.id] = Object.assign({}, byId[item.id] || {}, item);
                });
                list = Object.values(byId);
            }
            normalizeEquipmentImageUrls(list);
            window.equipmentData = list;
            return list;
        } catch (e) {
            console.warn('Supplies load failed:', e.message);
            window.equipmentData = [];
            return [];
        }
    }

    window.loadEquipment = loadEquipment;
})();
