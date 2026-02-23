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
