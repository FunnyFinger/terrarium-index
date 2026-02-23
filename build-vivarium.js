(function () {
    'use strict';

    var BUILD_TYPES = [
        { id: 'open-terrarium', name: 'Open Terrarium', desc: 'Tropical plants, good airflow' },
        { id: 'closed-terrarium', name: 'Closed Terrarium', desc: 'High humidity, self-sustaining' },
        { id: 'aerarium', name: 'Aerarium', desc: 'Air plants, no soil' },
        { id: 'deserterium', name: 'Deserterium', desc: 'Cacti & succulents, dry' },
        { id: 'paludarium', name: 'Paludarium', desc: 'Land + water' },
        { id: 'riparium', name: 'Riparium', desc: 'Riverbank / marginal plants' },
        { id: 'aquarium', name: 'Aquarium', desc: 'Fully aquatic plants' }
    ];

    /* Supply categories from inventory predefined list (data/supply-categories.js). Build steps use these. */
    var SUPPLY_CATEGORIES = (function () {
        var sc = typeof window !== 'undefined' && window.supplyCategories;
        if (sc && sc.list && sc.list.length) {
            var o = {};
            sc.list.forEach(function (x) { o[x.value] = x.value; });
            return o;
        }
        return { enclosures: 'enclosures', drainage: 'drainage', soil: 'soil', hardscape: 'hardscape', decoration: 'decoration', accessories: 'accessories', tools: 'tools' };
    })();
    var CATEGORY_MAP = (function () {
        var sc = typeof window !== 'undefined' && window.supplyCategories;
        if (sc && sc.list && sc.legacyMap) {
            var m = {};
            sc.list.forEach(function (x) {
                m[x.value] = [x.value];
                Object.keys(sc.legacyMap).forEach(function (leg) {
                    if (sc.legacyMap[leg] === x.value) m[x.value].push(leg);
                });
            });
            return m;
        }
        return { enclosures: ['enclosures', 'container'], drainage: ['drainage'], soil: ['soil'], hardscape: ['hardscape'], decoration: ['decoration'], accessories: ['accessories'], tools: ['tools', 'tool'] };
    })();

    var CART_STORAGE_KEY = 'terrarium_cart';

    var config = {
        type: null,
        enclosureId: null,
        drainageIds: [],
        substrateIds: [],
        hardscapeIds: [],
        plantIds: [],
        decorationIds: [],
        accessoryIds: [],
        toolIds: []
    };

    function escapeHtml(s) {
        if (s == null) return '';
        var str = String(s);
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function plantIdNum(pid) { return parseInt(pid, 10) || 0; }

    function getPlants() {
        var a = window.allPlants || [];
        var b = window.plantsDatabase || (typeof plantsDatabase !== 'undefined' ? plantsDatabase : []);
        return (a.length > 0 ? a : (Array.isArray(b) ? b : []));
    }

    /** Supplies from inventory: same source as the shop (equipment.json + custom_equipment, merged with inventory DB). */
    function getEquipment() {
        var a = window.allEquipment;
        var b = window.equipmentData;
        var list = (Array.isArray(a) && a.length > 0) ? a : (Array.isArray(b) ? b : []);
        return list;
    }

    /** Set of supply ids that have a row in the inventory DB. Build steps show only these. */
    var inventorySupplyIds = null;
    /** Order of supply ids as they appear in the inventory (same order as Inventory page). */
    var inventorySupplyIdOrder = [];

    function getEquipmentByCategory(category) {
        var catalog = getEquipment();
        if (!catalog.length) return [];
        var eq = catalog;
        if (inventorySupplyIds !== null) {
            var idSet = inventorySupplyIds;
            eq = catalog.filter(function (e) {
                var id = supplyIdNum(e.id);
                return idSet.has(id) || idSet.has(String(id));
            });
            if (!eq.length) return [];
        }
        var allowed = CATEGORY_MAP[category];
        if (!allowed) allowed = [category];
        var allowedLower = allowed.map(function (c) { return (c || '').toLowerCase(); });
        eq = eq.filter(function (e) {
            if (e.hidden) return false;
            var cat = (e.category != null && e.category !== '') ? String(e.category).toLowerCase().trim() : '';
            if (!cat) return false;
            return allowedLower.indexOf(cat) !== -1;
        });
        if (inventorySupplyIdOrder.length > 0) {
            eq.sort(function (a, b) {
                var ia = inventorySupplyIdOrder.indexOf(supplyIdNum(a.id));
                var ib = inventorySupplyIdOrder.indexOf(supplyIdNum(b.id));
                if (ia === -1 && ib === -1) return 0;
                if (ia === -1) return 1;
                if (ib === -1) return -1;
                return ia - ib;
            });
        }
        return eq;
    }

    function getPlantImageUrl(p) {
        if (p.imageUrl) return p.imageUrl;
        if (p.images && p.images.length) return p.images[0];
        var slug = window.scientificNameToSlug && window.scientificNameToSlug(typeof p.scientificName === 'string' ? p.scientificName : (p.scientificName && p.scientificName.name));
        return slug ? 'images/' + slug + '/' + slug + '-1.jpg' : '';
    }

    function getMaxPlants() {
        return 15;
    }

    /** Build HTML for one supply card (same visual as plant card). singleSelect: true = button with selected state, false = label + checkbox. */
    function supplyCardHtml(e, options) {
        var name = escapeHtml(e.name || 'Item');
        var size = (e.size && String(e.size).trim()) ? escapeHtml(String(e.size).trim()) : '';
        var desc = (e.description && String(e.description).trim()) ? escapeHtml(String(e.description).trim()) : '';
        var singleSelect = options && options.singleSelect;
        var checked = options && options.checked;
        var id = e.id;
        var category = (options && options.category) || '';
        var inputId = 'supp-' + (category || 'item') + '-' + id;
        var selClass = checked ? ' build-supply-card-selected' : '';
        var checkContent = singleSelect ? (checked ? '✓' : '') : (checked ? '✓' : '');
        var cardTop = '<div class="build-supply-card-top">' +
            '<span class="build-supply-card-check" aria-hidden="true">' + checkContent + '</span>' +
            '<div class="build-supply-card-img-wrap"><div class="build-supply-card-img"></div></div></div>';
        var cardBody = '<div class="build-supply-card-body">' +
            '<span class="build-supply-card-name">' + name + '</span>' +
            (size ? '<div class="build-supply-card-size">' + size + '</div>' : '') +
            '</div>';
        var cardDesc = desc ? ('<div class="build-supply-card-desc" role="tooltip">' + desc + '</div>') : '';
        if (singleSelect) {
            return '<button type="button" class="build-supply-card build-supply-card-single' + selClass + '" data-id="' + escapeHtml(String(id)) + '">' +
                cardTop + cardBody + cardDesc + '</button>';
        }
        return '<label class="build-supply-card' + selClass + '">' +
            '<input type="checkbox" class="build-supply-card-input" id="' + inputId + '" data-id="' + id + '"' + (checked ? ' checked' : '') + ' aria-label="Select ' + name + '">' +
            cardTop + cardBody + cardDesc + '</label>';
    }

    function getPlantMaxHeightCm(plant) {
        var s = plant && plant.size;
        if (typeof s !== 'string' || !s.trim()) return null;
        var m = s.match(/(\d+)\s*[-–—]\s*(\d+)\s*cm/i) || s.match(/(\d+)\s*cm/i);
        if (m) return m[2] != null ? Math.max(parseInt(m[1], 10), parseInt(m[2], 10)) : parseInt(m[1], 10);
        return null;
    }

    /** Debug: log which inventory supplies are loaded for each build step. Enable with ?debug=1 or window.BUILD_DEBUG_SUPPLIES = true. Call with true to force output. */
    function logBuildStepSupplies(force) {
        var q = typeof location !== 'undefined' && location.search ? location.search : '';
        var debugOn = force === true || q.indexOf('debug=1') !== -1 || (typeof window !== 'undefined' && window.BUILD_DEBUG_SUPPLIES);
        if (!debugOn) return;
        var steps = [
            { step: 2, label: 'Enclosure', category: SUPPLY_CATEGORIES.enclosures },
            { step: 3, label: 'Drainage', category: SUPPLY_CATEGORIES.drainage },
            { step: 4, label: 'Substrate', category: SUPPLY_CATEGORIES.soil },
            { step: 5, label: 'Hard scape', category: SUPPLY_CATEGORIES.hardscape },
            { step: 7, label: 'Decorations', category: SUPPLY_CATEGORIES.decoration },
            { step: 8, label: 'Accessories', category: SUPPLY_CATEGORIES.accessories },
            { step: 9, label: 'Optional tools', category: SUPPLY_CATEGORIES.tools }
        ];
        var total = getEquipment().length;
        var invCount = inventorySupplyIds ? inventorySupplyIds.size : 0;
        console.group('[Build] Inventory supplies per step');
        console.log('Equipment catalog total: ' + total + ' | Inventory supply rows (plantId >= ' + SUPPLY_ID_MIN + '): ' + invCount);
        steps.forEach(function (s) {
            var list = getEquipmentByCategory(s.category);
            console.group('Step ' + s.step + ' — ' + s.label + ' (category: ' + s.category + ')');
            console.log('Count: ' + list.length);
            if (list.length) {
                console.table(list.map(function (e) {
                    return { id: supplyIdNum(e.id), name: (e.name || '').slice(0, 50), category: e.category || '', size: (e.size || '').slice(0, 30) };
                }));
            } else {
                console.log('(no items)');
            }
            console.groupEnd();
        });
        console.groupEnd();
    }

    function getPlantsForType(vivariumType) {
        var plants = getPlants();
        var getScores = window.getPlantVivariumScores;
        if (getScores && vivariumType) {
            var filtered = plants.filter(function (p) {
                var scores = getScores(p);
                var score = scores[vivariumType];
                return score != null && score >= 50;
            });
            if (filtered.length > 0) plants = filtered;
        }
        return plants;
    }

    function supplyIdNum(id) { var n = parseInt(id, 10); return isNaN(n) ? id : n; }

    function getSupplyNames(ids, category) {
        var eq = getEquipmentByCategory(category);
        return (ids || []).map(function (id) {
            var e = eq.filter(function (x) { return supplyIdNum(x.id) === supplyIdNum(id); })[0];
            return e ? (e.name || 'Item') : '';
        }).filter(Boolean);
    }

    function updateSelectedDisplay() {
        var eq = getEquipment();
        var plants = getPlants();
        var i, el, names, stepChoice;
        for (i = 1; i <= 10; i++) {
            el = document.getElementById('buildSelected' + i);
            stepChoice = document.querySelector('.build-step[data-step="' + i + '"] .build-step-choice');
            if (!el && !stepChoice) continue;
            if (i === 1) {
                var t = config.type && BUILD_TYPES.filter(function (x) { return x.id === config.type; })[0];
                var txt = t ? t.name : '';
                if (el) el.textContent = t ? 'Selected: ' + t.name : '';
                if (stepChoice) stepChoice.textContent = txt;
            } else if (i === 2) {
                var enc = eq.filter(function (x) { return supplyIdNum(x.id) === supplyIdNum(config.enclosureId); })[0];
                var txt2 = enc ? enc.name : '';
                if (el) el.textContent = enc ? 'Selected: ' + enc.name : '';
                if (stepChoice) stepChoice.textContent = txt2;
            } else if (i === 3) {
                names = getSupplyNames(config.drainageIds, SUPPLY_CATEGORIES.drainage);
                if (el) el.textContent = names.length ? 'Selected: ' + names.join(', ') : '';
                if (stepChoice) stepChoice.textContent = names.join('\n');
            } else if (i === 4) {
                names = getSupplyNames(config.substrateIds, SUPPLY_CATEGORIES.soil);
                if (el) el.textContent = names.length ? 'Selected: ' + names.join(', ') : '';
                if (stepChoice) stepChoice.textContent = names.join('\n');
            } else if (i === 5) {
                names = getSupplyNames(config.hardscapeIds, SUPPLY_CATEGORIES.hardscape);
                if (el) el.textContent = names.length ? 'Selected: ' + names.join(', ') : '';
                if (stepChoice) stepChoice.textContent = names.join('\n');
            } else if (i === 6) {
                var selectedNames = (config.plantIds || []).map(function (id) {
                    var idN = plantIdNum(id);
                    var p = plants.filter(function (x) { return plantIdNum(x.id) === idN; })[0];
                    return p ? (p.name || (p.commonNames && p.commonNames[0]) || '') : '';
                }).filter(Boolean);
                if (el) {
                    if (selectedNames.length === 0) el.textContent = '';
                    else if (selectedNames.length <= 3) el.textContent = 'Selected: ' + selectedNames.join(', ');
                    else el.textContent = 'Selected: ' + selectedNames.length + ' plants — ' + selectedNames.slice(0, 2).join(', ') + ', …';
                }
                if (stepChoice) stepChoice.textContent = selectedNames.join('\n');
            } else if (i === 7) {
                names = getSupplyNames(config.decorationIds, SUPPLY_CATEGORIES.decoration);
                if (el) el.textContent = names.length ? 'Selected: ' + names.join(', ') : '';
                if (stepChoice) stepChoice.textContent = names.join('\n');
            } else if (i === 8) {
                names = getSupplyNames(config.accessoryIds, SUPPLY_CATEGORIES.accessories);
                if (el) el.textContent = names.length ? 'Selected: ' + names.join(', ') : '';
                if (stepChoice) stepChoice.textContent = names.join('\n');
            } else if (i === 9) {
                names = getSupplyNames(config.toolIds, SUPPLY_CATEGORIES.tools);
                if (el) el.textContent = names.length ? 'Selected: ' + names.join(', ') : '';
                if (stepChoice) stepChoice.textContent = names.join('\n');
            }
        }
        var limitHint = document.getElementById('buildPlantLimitHint');
        if (limitHint) limitHint.textContent = (config.plantIds || []).length + ' / ' + getMaxPlants() + ' plants selected';
    }

    function renderTypeOptions() {
        var el = document.getElementById('buildTypeOptions');
        if (!el) return;
        el.innerHTML = BUILD_TYPES.map(function (t) {
            var sel = config.type === t.id ? ' build-option-selected' : '';
            return '<button type="button" class="build-option-card' + sel + '" data-type="' + escapeHtml(t.id) + '">' +
                '<span class="build-option-name">' + escapeHtml(t.name) + '</span>' +
                '<span class="build-option-detail">' + escapeHtml(t.desc) + '</span></button>';
        }).join('');
        el.querySelectorAll('.build-option-card').forEach(function (btn) {
            btn.addEventListener('click', function () {
                config.type = btn.getAttribute('data-type');
                config.enclosureId = null;
                config.drainageIds = [];
                config.substrateIds = [];
                config.hardscapeIds = [];
                config.plantIds = [];
                config.decorationIds = [];
                config.accessoryIds = [];
                config.toolIds = [];
                document.querySelectorAll('#buildTypeOptions .build-option-card').forEach(function (b) { b.classList.remove('build-option-selected'); });
                btn.classList.add('build-option-selected');
                document.querySelector('[data-next="2"]').disabled = false;
                renderEnclosureOptions();
                renderSupplyMulti('buildDrainageOptions', SUPPLY_CATEGORIES.drainage, 'drainageIds');
                renderSupplyMulti('buildSubstrateOptions', SUPPLY_CATEGORIES.soil, 'substrateIds');
                renderSupplyMulti('buildHardscapeOptions', SUPPLY_CATEGORIES.hardscape, 'hardscapeIds');
                renderPlantList();
                renderSupplyMulti('buildDecorationOptions', SUPPLY_CATEGORIES.decoration, 'decorationIds');
                renderAccessoryList();
                renderSupplyMulti('buildToolsOptions', SUPPLY_CATEGORIES.tools, 'toolIds');
                updateSelectedDisplay();
            });
        });
        updateSelectedDisplay();
    }

    function renderEnclosureOptions() {
        var el = document.getElementById('buildEnclosureOptions');
        if (!el) return;
        el.classList.add('build-supply-list');
        var list = getEquipmentByCategory(SUPPLY_CATEGORIES.enclosures);
        el.innerHTML = list.map(function (e) {
            var eid = supplyIdNum(e.id);
            var checked = supplyIdNum(config.enclosureId) === eid;
            return supplyCardHtml(e, { singleSelect: true, checked: checked });
        }).join('');
        el.querySelectorAll('.build-supply-card-single').forEach(function (btn) {
            btn.addEventListener('click', function () {
                config.enclosureId = btn.getAttribute('data-id');
                if (config.enclosureId) config.enclosureId = supplyIdNum(config.enclosureId);
                document.querySelectorAll('#buildEnclosureOptions .build-supply-card').forEach(function (b) {
                    b.classList.remove('build-supply-card-selected');
                    var ch = b.querySelector('.build-supply-card-check');
                    if (ch) ch.textContent = '';
                });
                btn.classList.add('build-supply-card-selected');
                var ch = btn.querySelector('.build-supply-card-check');
                if (ch) ch.textContent = '✓';
                var nextBtn = document.querySelector('#buildPanel2 [data-next="3"]');
                if (nextBtn) nextBtn.disabled = false;
                updateSelectedDisplay();
            });
        });
        var nextBtn = document.querySelector('#buildPanel2 [data-next="3"]');
        if (nextBtn) nextBtn.disabled = list.length > 0 && !config.enclosureId;
        updateSelectedDisplay();
    }

    function renderSupplyMulti(containerId, category, configKey) {
        var el = document.getElementById(containerId);
        if (!el) return;
        el.classList.add('build-supply-list');
        var list = getEquipmentByCategory(category);
        var ids = (config[configKey] || []).map(supplyIdNum);
        el.innerHTML = list.map(function (e) {
            var eid = supplyIdNum(e.id);
            var checked = ids.indexOf(eid) !== -1;
            return supplyCardHtml(e, { category: category, checked: checked });
        }).join('');
        el.querySelectorAll('.build-supply-card-input').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var id = supplyIdNum(cb.getAttribute('data-id'));
                var arr = config[configKey] || [];
                var idx = -1;
                for (var i = 0; i < arr.length; i++) { if (supplyIdNum(arr[i]) === id) { idx = i; break; } }
                if (cb.checked && idx === -1) config[configKey].push(id);
                else if (!cb.checked && idx !== -1) config[configKey].splice(idx, 1);
                var card = cb.closest('.build-supply-card');
                if (card) {
                    card.classList.toggle('build-supply-card-selected', cb.checked);
                    var checkEl = card.querySelector('.build-supply-card-check');
                    if (checkEl) checkEl.textContent = cb.checked ? '✓' : '';
                }
                updateSelectedDisplay();
            });
        });
        updateSelectedDisplay();
    }

    function renderPlantList() {
        var container = document.getElementById('buildPlantList');
        var searchEl = document.getElementById('buildPlantSearch');
        if (!container) return;
        var maxPlants = getMaxPlants();
        while (config.plantIds.length > maxPlants) config.plantIds.pop();
        var type = config.type;
        var all = getPlants();
        var plants = type ? getPlantsForType(type) : all;
        if (plants.length === 0 && all.length > 0) plants = all;
        var q = (searchEl && searchEl.value) ? searchEl.value.trim().toLowerCase() : '';
        if (q) {
            plants = plants.filter(function (p) {
                var name = (p.name || '').toLowerCase();
                var sci = (typeof p.scientificName === 'string' ? (p.scientificName || '') : (p.scientificName && p.scientificName.name ? String(p.scientificName.name) : '')).toLowerCase();
                if (name.indexOf(q) !== -1 || sci.indexOf(q) !== -1) return true;
                var cn = p.commonNames;
                if (Array.isArray(cn)) {
                    for (var i = 0; i < cn.length; i++) {
                        if (String(cn[i] || '').toLowerCase().indexOf(q) !== -1) return true;
                    }
                }
                return false;
            });
        }
        var onMainSite = !!document.getElementById('tabPlants');
        var baseUrl = window.location.href.replace(/\/[^/]*$/, '/') + 'index.html';
        var atLimit = config.plantIds.length >= maxPlants;
        container.innerHTML = plants.slice(0, 100).map(function (p) {
            var pid = plantIdNum(p.id);
            var name = p.name || (p.commonNames && p.commonNames[0]) || '—';
            var sci = typeof p.scientificName === 'string' ? (p.scientificName || '—') : (p.scientificName && p.scientificName.name ? p.scientificName.name : '—');
            var imgUrl = getPlantImageUrl(p);
            var selected = config.plantIds.indexOf(pid) !== -1;
            var selClass = selected ? ' build-plant-card-selected' : '';
            var disabled = !selected && atLimit;
            var nameHtml;
            if (onMainSite && typeof window.showPlantModal === 'function') {
                nameHtml = '<button type="button" class="build-plant-card-name-link" data-plant-id="' + pid + '">' + escapeHtml(name) + '</button>';
            } else {
                var link = baseUrl + '?plant=' + pid;
                nameHtml = '<a href="' + escapeHtml(link) + '" class="build-plant-card-name-link" target="_blank" rel="noopener">' + escapeHtml(name) + '</a>';
            }
            var imgBlock = imgUrl
                ? '<div class="build-plant-card-img-wrap"><img src="' + escapeHtml(imgUrl) + '" alt="" class="build-plant-card-img"></div>'
                : '<div class="build-plant-card-img-wrap"><div class="build-plant-card-img"></div></div>';
            return '<label class="build-plant-card' + selClass + (disabled ? ' build-plant-card-disabled' : '') + '" data-plant-id="' + pid + '">' +
                '<input type="checkbox" class="build-plant-card-input" data-plant-id="' + pid + '"' + (selected ? ' checked' : '') + (disabled ? ' disabled' : '') + ' aria-label="Select ' + escapeHtml(name) + '">' +
                '<div class="build-plant-card-top">' +
                '<span class="build-plant-card-check" aria-hidden="true">' + (selected ? '✓' : '') + '</span>' +
                imgBlock +
                '</div>' +
                '<div class="build-plant-card-body">' +
                '<span class="build-plant-card-name">' + nameHtml + '</span>' +
                '<div class="build-plant-card-scientific">' + escapeHtml(sci) + '</div>' +
                '</div></label>';
        }).join('');
        if (plants.length > 100) {
            container.innerHTML += '<p class="build-panel-desc">Showing first 100 of ' + plants.length + '. Use search to narrow.</p>';
        }
        updateSelectedDisplay();
    }

    function renderAccessoryList() {
        var el = document.getElementById('buildAccessoryList');
        if (!el) return;
        el.classList.add('build-supply-list');
        var list = getEquipmentByCategory(SUPPLY_CATEGORIES.accessories);
        var accIds = (config.accessoryIds || []).map(supplyIdNum);
        el.innerHTML = list.map(function (e) {
            var eid = supplyIdNum(e.id);
            var checked = accIds.indexOf(eid) !== -1;
            return supplyCardHtml(e, { category: 'accessories', checked: checked });
        }).join('');
        el.querySelectorAll('.build-supply-card-input').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var id = supplyIdNum(cb.getAttribute('data-id'));
                var ids = config.accessoryIds || [];
                var idx = -1;
                for (var i = 0; i < ids.length; i++) { if (supplyIdNum(ids[i]) === id) { idx = i; break; } }
                if (cb.checked && idx === -1) config.accessoryIds.push(id);
                else if (!cb.checked && idx !== -1) config.accessoryIds.splice(idx, 1);
                var card = cb.closest('.build-supply-card');
                if (card) {
                    card.classList.toggle('build-supply-card-selected', cb.checked);
                    var checkEl = card.querySelector('.build-supply-card-check');
                    if (checkEl) checkEl.textContent = cb.checked ? '✓' : '';
                }
                updateSelectedDisplay();
            });
        });
        updateSelectedDisplay();
    }

    function renderReviewSummary() {
        var el = document.getElementById('buildReviewSummary');
        if (!el) return;
        var eq = getEquipment();
        var plants = getPlants();

        function sciName(p) {
            if (!p) return '';
            return typeof p.scientificName === 'string' ? p.scientificName : (p.scientificName && p.scientificName.name ? p.scientificName.name : '');
        }
        function formatPrice(num) {
            if (num == null || num === '') return 'Price on request';
            var n = Number(num);
            if (isNaN(n)) return 'Price on request';
            return 'KD ' + n.toFixed(2);
        }
        function supplyCard(e) {
            var imgUrl = e.imageUrl || (e.images && e.images[0]) || '';
            var name = e.name || 'Item';
            var priceStr = e.price != null && e.price !== '' ? formatPrice(e.price) : 'Price on request';
            return '<div class="plant-card equipment-card build-review-item-card">' +
                '<div class="plant-image-container">' +
                (imgUrl ? '<img src="' + escapeHtml(imgUrl) + '" alt="" class="plant-image" loading="lazy">' : '<div class="image-placeholder"></div>') +
                '<div class="card-price">' + escapeHtml(priceStr) + '</div></div>' +
                '<div class="plant-info"><div class="plant-name">' + escapeHtml(name) + '</div></div></div>';
        }
        function itemsForIds(ids) {
            var seen = {};
            var out = [];
            (ids || []).forEach(function (id) {
                var idn = supplyIdNum(id);
                if (seen[idn]) return;
                seen[idn] = true;
                var e = eq.filter(function (x) { return supplyIdNum(x.id) === idn; })[0];
                if (e) out.push(e);
            });
            return out;
        }
        var typeObj = config.type && BUILD_TYPES.filter(function (x) { return x.id === config.type; })[0];
        var enclosureItem = config.enclosureId ? eq.filter(function (x) { return supplyIdNum(x.id) === supplyIdNum(config.enclosureId); })[0] : null;
        var drainageItems = itemsForIds(config.drainageIds);
        var substrateItems = itemsForIds(config.substrateIds);
        var hardscapeItems = itemsForIds(config.hardscapeIds);
        var plantItems = [];
        var seenPlant = {};
        (config.plantIds || []).forEach(function (id) {
            var idn = plantIdNum(id);
            if (seenPlant[idn]) return;
            seenPlant[idn] = true;
            var p = plants.filter(function (x) { return plantIdNum(x.id) === idn; })[0];
            if (p) plantItems.push(p);
        });
        var decorationItems = itemsForIds(config.decorationIds);
        var accItems = itemsForIds(config.accessoryIds);
        var toolItems = itemsForIds(config.toolIds);

        var html = '<div class="build-review-cards">';
        html += '<div class="build-review-card"><h3 class="build-review-card-title">Vivarium type</h3><div class="build-review-card-content">';
        if (typeObj) {
            html += '<div class="build-review-chip">' + escapeHtml(typeObj.name) + '</div>';
            if (typeObj.desc) html += '<p class="build-review-card-desc">' + escapeHtml(typeObj.desc) + '</p>';
        } else html += '<span class="build-review-empty">—</span>';
        html += '</div></div>';

        html += '<div class="build-review-card"><h3 class="build-review-card-title">Enclosure</h3><div class="build-review-card-content build-review-items-grid plants-grid card-size-small">';
        if (enclosureItem) html += supplyCard(enclosureItem);
        else html += '<span class="build-review-empty">—</span>';
        html += '</div></div>';

        html += '<div class="build-review-card"><h3 class="build-review-card-title">Drainage</h3><div class="build-review-card-content build-review-items-grid plants-grid card-size-small">';
        if (drainageItems.length) drainageItems.forEach(function (e) { html += supplyCard(e); });
        else html += '<span class="build-review-empty">—</span>';
        html += '</div></div>';

        html += '<div class="build-review-card"><h3 class="build-review-card-title">Substrate</h3><div class="build-review-card-content build-review-items-grid plants-grid card-size-small">';
        if (substrateItems.length) substrateItems.forEach(function (e) { html += supplyCard(e); });
        else html += '<span class="build-review-empty">—</span>';
        html += '</div></div>';

        html += '<div class="build-review-card"><h3 class="build-review-card-title">Hard scape</h3><div class="build-review-card-content build-review-items-grid plants-grid card-size-small">';
        if (hardscapeItems.length) hardscapeItems.forEach(function (e) { html += supplyCard(e); });
        else html += '<span class="build-review-empty">—</span>';
        html += '</div></div>';

        html += '<div class="build-review-card build-review-card-wide"><h3 class="build-review-card-title">Plants</h3><div class="build-review-card-content">';
        if (plantItems.length) {
            html += '<div class="build-review-items-grid plants-grid card-size-small">';
            plantItems.forEach(function (p) {
                var imgUrl = getPlantImageUrl(p);
                var name = p.name || (p.commonNames && p.commonNames[0]) || '';
                var sci = sciName(p);
                html += '<div class="plant-card build-review-item-card"><div class="plant-image-container">';
                html += imgUrl ? '<img src="' + escapeHtml(imgUrl) + '" alt="" class="plant-image" loading="lazy">' : '<div class="image-placeholder"></div>';
                html += '</div><div class="plant-info"><div class="plant-name">' + escapeHtml(name) + '</div>';
                if (sci) html += '<div class="plant-scientific">' + escapeHtml(sci) + '</div>';
                html += '</div></div>';
            });
            html += '</div>';
        } else html += '<span class="build-review-empty">—</span>';
        html += '</div></div>';

        html += '<div class="build-review-card"><h3 class="build-review-card-title">Decorations</h3><div class="build-review-card-content build-review-items-grid plants-grid card-size-small">';
        if (decorationItems.length) decorationItems.forEach(function (e) { html += supplyCard(e); });
        else html += '<span class="build-review-empty">—</span>';
        html += '</div></div>';

        html += '<div class="build-review-card"><h3 class="build-review-card-title">Accessories</h3><div class="build-review-card-content build-review-items-grid plants-grid card-size-small">';
        if (accItems.length) accItems.forEach(function (e) { html += supplyCard(e); });
        else html += '<span class="build-review-empty">—</span>';
        html += '</div></div>';

        html += '<div class="build-review-card"><h3 class="build-review-card-title">Optional tools</h3><div class="build-review-card-content build-review-items-grid plants-grid card-size-small">';
        if (toolItems.length) toolItems.forEach(function (e) { html += supplyCard(e); });
        else html += '<span class="build-review-empty">—</span>';
        html += '</div></div>';

        html += '</div>';
        el.innerHTML = html;
    }

    function getCart() {
        try {
            var raw = localStorage.getItem(CART_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function setCart(items) {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
        if (typeof window.updateCartUI === 'function') window.updateCartUI();
    }

    function addSupplyToCart(cart, equipment, id) {
        var idN = supplyIdNum(id);
        var e = equipment.filter(function (x) { return supplyIdNum(x.id) === idN; })[0];
        if (!e) return;
        var price = (e.price !== undefined && e.price !== null && e.price !== '') ? Number(e.price) : null;
        var keyId = e.id != null ? e.id : idN;
        var existing = cart.filter(function (i) { return i.plantId == keyId || supplyIdNum(i.plantId) === idN; })[0];
        if (existing) existing.quantity += 1;
        else cart.push({ plantId: keyId, name: e.name || 'Item', scientificName: '', quantity: 1, price: price });
    }

    function addBuildToCart() {
        var cart = getCart();
        var plants = getPlants();
        var equipment = getEquipment();
        if (config.enclosureId) addSupplyToCart(cart, equipment, config.enclosureId);
        (config.drainageIds || []).forEach(function (id) { addSupplyToCart(cart, equipment, id); });
        (config.substrateIds || []).forEach(function (id) { addSupplyToCart(cart, equipment, id); });
        (config.hardscapeIds || []).forEach(function (id) { addSupplyToCart(cart, equipment, id); });
        (config.plantIds || []).forEach(function (id) {
            var idN = plantIdNum(id);
            var p = plants.filter(function (x) { return plantIdNum(x.id) === idN; })[0];
            if (!p) return;
            var price = (p.price !== undefined && p.price !== null && p.price !== '') ? Number(p.price) : null;
            var scientificName = typeof p.scientificName === 'string' ? p.scientificName : (p.scientificName && p.scientificName.name ? p.scientificName.name : '');
            var keyId = p.id != null ? p.id : idN;
            var existing = cart.filter(function (i) { return i.plantId == keyId || plantIdNum(i.plantId) === idN; })[0];
            if (existing) existing.quantity += 1;
            else cart.push({ plantId: keyId, name: p.name || 'Plant', scientificName: scientificName, quantity: 1, price: price });
        });
        (config.decorationIds || []).forEach(function (id) { addSupplyToCart(cart, equipment, id); });
        (config.accessoryIds || []).forEach(function (id) { addSupplyToCart(cart, equipment, id); });
        (config.toolIds || []).forEach(function (id) { addSupplyToCart(cart, equipment, id); });
        setCart(cart);
        var base = window.location.href.replace(/\/[^/]*$/, '/');
        window.location.href = base + 'checkout.html';
    }

    function goToStep(step) {
        step = parseInt(step, 10);
        document.querySelectorAll('.build-panel').forEach(function (p) {
            p.classList.remove('build-panel-active');
            p.hidden = true;
        });
        document.querySelectorAll('.build-step').forEach(function (s) {
            s.removeAttribute('aria-current');
            var n = parseInt(s.getAttribute('data-step'), 10);
            s.classList.toggle('build-step-done', n < step);
        });
        var panel = document.getElementById('buildPanel' + step);
        var stepEl = document.querySelector('.build-step[data-step="' + step + '"]');
        if (panel) {
            panel.classList.add('build-panel-active');
            panel.hidden = false;
        }
        if (stepEl) stepEl.setAttribute('aria-current', 'step');
        if (step === 10) {
            config.plantIds = (config.plantIds || []).reduce(function (acc, id) {
                var idn = plantIdNum(id);
                if (acc.indexOf(idn) === -1) acc.push(idn);
                return acc;
            }, []);
            ['drainageIds', 'substrateIds', 'hardscapeIds', 'decorationIds', 'accessoryIds', 'toolIds'].forEach(function (key) {
                config[key] = (config[key] || []).reduce(function (acc, id) {
                    var idn = supplyIdNum(id);
                    if (acc.indexOf(idn) === -1) acc.push(idn);
                    return acc;
                }, []);
            });
            renderReviewSummary();
        }
        updateSelectedDisplay();
    }

    function bindStepNav() {
        document.querySelectorAll('.build-next').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var next = btn.getAttribute('data-next');
                if (next) goToStep(next);
            });
        });
        document.querySelectorAll('.build-prev').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var prev = btn.getAttribute('data-prev');
                if (prev) goToStep(prev);
            });
        });
    }

    function init() {
        logBuildStepSupplies(true);
        renderTypeOptions();
        renderEnclosureOptions();
        renderSupplyMulti('buildDrainageOptions', SUPPLY_CATEGORIES.drainage, 'drainageIds');
        renderSupplyMulti('buildSubstrateOptions', SUPPLY_CATEGORIES.soil, 'substrateIds');
        renderSupplyMulti('buildHardscapeOptions', SUPPLY_CATEGORIES.hardscape, 'hardscapeIds');
        renderPlantList();
        renderSupplyMulti('buildDecorationOptions', SUPPLY_CATEGORIES.decoration, 'decorationIds');
        renderAccessoryList();
        renderSupplyMulti('buildToolsOptions', SUPPLY_CATEGORIES.tools, 'toolIds');
        window.addEventListener('plantsLoaded', function onPlantsLoaded() {
            window.removeEventListener('plantsLoaded', onPlantsLoaded);
            renderPlantList();
            var panel10 = document.getElementById('buildPanel10');
            if (panel10 && panel10.classList.contains('build-panel-active')) renderReviewSummary();
        });

        var searchInput = document.getElementById('buildPlantSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                renderPlantList();
            });
        }
        var plantListContainer = document.getElementById('buildPlantList');
        if (plantListContainer) {
            plantListContainer.addEventListener('click', function (e) {
                var nameLink = e.target.closest('.build-plant-card-name-link');
                if (!nameLink) return;
                e.preventDefault();
                e.stopPropagation();
                var card = e.target.closest('.build-plant-card');
                var id = plantIdNum(nameLink.getAttribute('data-plant-id') || (card && card.getAttribute('data-plant-id')));
                if (!id) return;
                var plant = getPlants().filter(function (p) { return plantIdNum(p.id) === id; })[0];
                if (document.getElementById('tabPlants') && typeof window.showPlantModal === 'function' && plant) {
                    document.getElementById('tabPlants').click();
                    setTimeout(function () { window.showPlantModal(plant); }, 0);
                } else {
                    var base = window.location.href.replace(/\/[^/]*$/, '/') + 'index.html';
                    window.open(base + '?plant=' + id, '_blank', 'noopener');
                }
            });
            plantListContainer.addEventListener('change', function (e) {
                if (!e.target.classList.contains('build-plant-card-input')) return;
                var id = plantIdNum(e.target.getAttribute('data-plant-id'));
                if (!id) return;
                var card = e.target.closest('.build-plant-card');
                var maxPlants = getMaxPlants();
                if (e.target.checked) {
                    if (config.plantIds.length >= maxPlants) {
                        e.target.checked = false;
                        if (card) {
                            card.classList.remove('build-plant-card-selected');
                            var check = card.querySelector('.build-plant-card-check');
                            if (check) check.textContent = '';
                        }
                        updateSelectedDisplay();
                        return;
                    }
                    if (config.plantIds.indexOf(id) === -1) config.plantIds.push(id);
                } else {
                    var idx = config.plantIds.indexOf(id);
                    if (idx !== -1) config.plantIds.splice(idx, 1);
                }
                if (card) {
                    card.classList.toggle('build-plant-card-selected', config.plantIds.indexOf(id) !== -1);
                    var check = card.querySelector('.build-plant-card-check');
                    if (check) check.textContent = e.target.checked ? '✓' : '';
                }
                updateSelectedDisplay();
            });
        }
        var confirmBtn = document.getElementById('buildConfirmOrderBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function () {
                addBuildToCart();
            });
        }
    }

    function waitForDataThenInit() {
        var attempts = 0;
        var maxAttempts = 80;
        function check() {
            var plants = getPlants();
            if (Array.isArray(plants) && plants.length > 0) {
                ensureEquipmentThenInit();
                return;
            }
            attempts++;
            if (attempts < maxAttempts) setTimeout(check, 200);
            else ensureEquipmentThenInit();
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { setTimeout(check, 200); });
        } else {
            setTimeout(check, 200);
        }
    }

    function ensureEquipmentThenInit() {
        if (typeof window.loadEquipment === 'function') {
            window.loadEquipment().then(function (list) {
                var arr = Array.isArray(list) ? list : [];
                window.allEquipment = arr;
                window.equipmentData = arr;
                function doInit() {
                    init();
                }
                if (arr.length > 0 && window.inventoryDb) {
                    if (window.inventoryDb.mergeInventoryIntoPlants) {
                        return window.inventoryDb.mergeInventoryIntoPlants(arr).then(function () {
                            return refreshInventorySupplyIds().then(doInit);
                        });
                    }
                    return refreshInventorySupplyIds().then(doInit);
                }
                refreshInventorySupplyIds().then(doInit);
            }).catch(function () {
                window.allEquipment = [];
                window.equipmentData = [];
                inventorySupplyIds = null;
                init();
            });
        } else {
            init();
        }
    }

    /** Supply ids start at 50001 (equipment.json). Build steps are derived only from inventory (supply rows). */
    var SUPPLY_ID_MIN = 50001;

    /** Build the set and order of supply ids from the inventory DB. Build steps use this as the single source of truth. */
    function refreshInventorySupplyIds() {
        if (!window.inventoryDb || typeof window.inventoryDb.getAll !== 'function') {
            inventorySupplyIds = null;
            inventorySupplyIdOrder = [];
            return Promise.resolve();
        }
        return window.inventoryDb.getAll().then(function (rows) {
            var set = new Set();
            var order = [];
            if (rows && rows.length) {
                rows.forEach(function (r) {
                    var id = r.plantId != null ? parseInt(r.plantId, 10) : NaN;
                    if (!isNaN(id) && id >= SUPPLY_ID_MIN) {
                        set.add(id);
                        order.push(id);
                    }
                });
            }
            inventorySupplyIds = set;
            inventorySupplyIdOrder = order;
        }).catch(function () {
            inventorySupplyIds = null;
            inventorySupplyIdOrder = [];
        });
    }

    window.initBuildVivarium = init;
    window.goToStepBuild = goToStep;
    window.logBuildStepSupplies = logBuildStepSupplies;
    if (document.getElementById('buildTypeOptions')) {
        bindStepNav();
        waitForDataThenInit();
    }
})();
