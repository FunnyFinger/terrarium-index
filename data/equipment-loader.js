/**
 * Load supplies (containers, tools, soil, hardscape, etc.) for the shop.
 * Supply items use ids 50001+ to avoid clash with plant ids.
 * Same cart and inventory as plants; no plant-specific fields.
 */
(function () {
    'use strict';
    const EQUIPMENT_URL = 'data/equipment.json';

    async function loadEquipment() {
        if (typeof window === 'undefined') return [];
        try {
            const resp = await fetch(EQUIPMENT_URL + '?v=' + Date.now(), { cache: 'no-store' });
            if (!resp.ok) return [];
            const data = await resp.json();
            let list = Array.isArray(data) ? data : (data.items || data.equipment || []);
            try {
                const custom = typeof localStorage !== 'undefined' && localStorage.getItem('custom_equipment');
                const customEq = custom ? JSON.parse(custom) : [];
                if (Array.isArray(customEq) && customEq.length) list = (list || []).concat(customEq);
            } catch (err) { /* ignore */ }
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
