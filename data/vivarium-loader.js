/**
 * Load ready-made vivariums (open/closed terrariums, aerariums, deserteriums, etc.)
 * Vivarium ids use 60001+ to avoid clash with plants and supplies.
 */
(function () {
    'use strict';
    const VIVARIUMS_URL = 'data/vivariums.json';

    async function loadVivariums() {
        if (typeof window === 'undefined') return [];
        try {
            const resp = await fetch(VIVARIUMS_URL + '?v=' + Date.now(), { cache: 'no-store' });
            if (!resp.ok) return [];
            const data = await resp.json();
            const list = Array.isArray(data) ? data : (data.items || data.vivariums || []);
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
