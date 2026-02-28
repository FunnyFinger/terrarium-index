/**
 * Load ready-made vivariums (open/closed terrariums, aerariums, deserteriums, etc.)
 * Vivarium ids use 60001+ to avoid clash with plants and supplies.
 */
(function () {
    'use strict';
    function getVivariumsUrl() {
        try {
            var script = document.currentScript;
            if (script && script.src) {
                var base = script.src.replace(/\/[^/]+$/, '/');
                return base + 'vivariums.json';
            }
        } catch (e) { /* ignore */ }
        return (typeof document !== 'undefined' && document.baseURI ? new URL('data/vivariums.json', document.baseURI).href : 'data/vivariums.json');
    }
    const VIVARIUMS_URL = getVivariumsUrl();

    function normalizeVivariumImageUrls(list) {
        if (!list || !list.length) return;
        var base = (typeof window !== 'undefined' && window.SUPABASE_URL) ? String(window.SUPABASE_URL).replace(/\/$/, '') : '';
        if (!base) return;
        var storagePrefix = base + '/storage/v1/object/public/vivarium-assets/';
        list.forEach(function (item) {
            function toStorageUrl(path) {
                if (!path || typeof path !== 'string' || /^https?:\/\//i.test(path)) return path;
                if (path.startsWith('vivariums/') || path.startsWith('Vivariums/')) return storagePrefix + path;
                if (path.startsWith('images/vivariums/')) return storagePrefix + path.slice(7);
                if (path.startsWith('images/Vivariums/')) return storagePrefix + 'Vivariums/' + path.slice(16);
                return path;
            }
            if (item.imageUrl) item.imageUrl = toStorageUrl(item.imageUrl);
            if (Array.isArray(item.images)) item.images = item.images.map(toStorageUrl);
        });
    }

    async function loadVivariums() {
        if (typeof window === 'undefined') return [];
        try {
            var list;
            // Prefer Supabase vivariums_catalog as single source when configured
            if (window.supabaseDb && window.supabaseDb.isConfigured && window.supabaseDb.isConfigured()) {
                try {
                    var cat = await window.supabaseDb.getVivariumsCatalog();
                    if (Array.isArray(cat)) {
                        list = cat;
                        var byId = {};
                        list.forEach(function (v) {
                            if (!v || v.id == null) return;
                            byId[v.id] = Object.assign({}, byId[v.id] || {}, v);
                        });
                        list = Object.values(byId);
                        normalizeVivariumImageUrls(list);
                        window.vivariumData = list;
                        return list;
                    }
                } catch (e) {
                    console.warn('Supabase vivariums load failed, falling back to JSON:', (e && e.message) || e);
                }
            }

            const resp = await fetch(VIVARIUMS_URL + '?v=' + Date.now(), { cache: 'no-store' });
            if (!resp.ok) return [];
            const data = await resp.json();
            list = Array.isArray(data) ? data : (data.items || data.vivariums || []);
            try {
                const baseUrl = VIVARIUMS_URL.replace(/\/[^/]+$/, '/');
                const ovResp = await fetch(baseUrl + 'overrides/vivarium-overrides.json?v=' + Date.now(), { cache: 'no-store' });
                if (ovResp.ok) {
                    const overrides = await ovResp.json();
                    const edits = overrides.edits || {};
                    const custom = Array.isArray(overrides.custom) ? overrides.custom : [];
                    list.forEach(function (v) {
                        var id = v.id;
                        if (id == null) return;
                        var edit = edits[id] || edits[String(id)];
                        if (edit && typeof edit === 'object') {
                            if (edit.name != null) v.name = edit.name;
                            if (edit.description != null) v.description = edit.description;
                            if (edit.price != null) v.price = edit.price;
                            if (edit.type != null) v.type = edit.type;
                            if (edit.availability != null) v.availability = edit.availability;
                            if (edit.plantIds != null && Array.isArray(edit.plantIds)) v.plantIds = edit.plantIds;
                            if (edit.supplyIds != null && Array.isArray(edit.supplyIds)) v.supplyIds = edit.supplyIds;
                            if (edit.imageUrl != null) v.imageUrl = edit.imageUrl;
                            if (edit.images != null && Array.isArray(edit.images)) v.images = edit.images;
                        }
                    });
                    if (custom.length) list = list.concat(custom);
                }
            } catch (_) { /* ignore */ }
            normalizeVivariumImageUrls(list);
            window.vivariumData = list;
            return list;
        } catch (e) {
            console.warn('Vivariums load failed:', e.message);
            window.vivariumData = [];
            return [];
        }
    }

    window.loadVivariums = loadVivariums;
})();
