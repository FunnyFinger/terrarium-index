/**
 * Predefined supply categories for Inventory (Supplies) and Build steps.
 * Must match the Category column dropdown in the inventory / add-equipment form.
 * Build page places each category in the corresponding step.
 */
(function (global) {
    'use strict';

    var SUPPLY_CATEGORIES = [
        { value: 'enclosures', label: 'Enclosures' },
        { value: 'drainage', label: 'Drainage' },
        { value: 'soil', label: 'Soil' },
        { value: 'hardscape', label: 'Hard scape' },
        { value: 'decoration', label: 'Decoration' },
        { value: 'accessories', label: 'Accessories' },
        { value: 'tools', label: 'Tools' }
    ];

    /** Legacy category values stored in DB → canonical category for build step mapping */
    var LEGACY_CATEGORY_MAP = {
        container: 'enclosures',
        tool: 'tools'
    };

    /** Build-step labels (order matches supply steps 2–9: Enclosure, Drainage, Substrate, …). */
    var BUILD_STEP_LABELS = {
        enclosures: 'Enclosure',
        drainage: 'Drainage',
        soil: 'Substrate',
        hardscape: 'Hard scape',
        decoration: 'Decorations',
        accessories: 'Accessories',
        tools: 'Optional tools'
    };

    function canonicalCategory(cat) {
        if (!cat || typeof cat !== 'string') return '';
        var c = cat.trim().toLowerCase();
        if (LEGACY_CATEGORY_MAP[c] !== undefined) return LEGACY_CATEGORY_MAP[c];
        return SUPPLY_CATEGORIES.some(function (x) { return x.value === c; }) ? c : '';
    }

    global.supplyCategories = {
        list: SUPPLY_CATEGORIES,
        legacyMap: LEGACY_CATEGORY_MAP,
        buildStepLabel: function (categoryValue) { return BUILD_STEP_LABELS[categoryValue] || categoryValue; },
        canonical: canonicalCategory
    };
})(typeof window !== 'undefined' ? window : this);
