/**
 * Load supplies (containers, tools, soil, hardscape, etc.) for the shop.
 * Supply items use ids 50001+ to avoid clash with plant ids.
 * Same cart and inventory as plants; no plant-specific fields.
 */
(function () {
    'use strict';
    function getDataBaseUrl() {
        try {
            var script = document.currentScript;
            if (script && script.src) {
                return script.src.replace(/\/[^/]+$/, '/');
            }
        } catch (e) { /* ignore */ }
        return (typeof document !== 'undefined' && document.baseURI ? new URL('data/', document.baseURI).href : 'data/');
    }
    const DATA_BASE = getDataBaseUrl();

    async function loadEquipment() {
        if (typeof window === 'undefined') return [];
        try {
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
                    window.equipmentData = Object.values(byId);
                    return window.equipmentData;
                }
            }
            const resp = await fetch(DATA_BASE + 'equipment.json?v=' + Date.now(), { cache: 'no-store' });
            if (!resp.ok) return [];
            const data = await resp.json();
            let list = Array.isArray(data) ? data : (data.items || data.equipment || []);
            try {
                const custom = typeof localStorage !== 'undefined' && localStorage.getItem('custom_equipment');
                const customEq = custom ? JSON.parse(custom) : [];
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
