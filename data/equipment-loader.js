/**
 * Load equipment (containers, tools) for the shop.
 * Equipment items use ids 50001+ to avoid clash with plant ids.
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
            const list = Array.isArray(data) ? data : (data.items || data.equipment || []);
            window.equipmentData = list;
            return list;
        } catch (e) {
            console.warn('Equipment load failed:', e.message);
            window.equipmentData = [];
            return [];
        }
    }

    window.loadEquipment = loadEquipment;
})();
