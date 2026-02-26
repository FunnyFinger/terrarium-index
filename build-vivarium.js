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

    /** Drainage combos: 50006 = Black Gravel, 50007 = Clay Balls, 50008 = Mesh */
    var DRAINAGE_COMBOS = [
        { id: 'combo1', label: 'Black gravel + Clay balls + Mesh', ids: [50006, 50007, 50008] },
        { id: 'combo2', label: 'Black gravel ×2 + Mesh', ids: [50006, 50006, 50008] },
        { id: 'combo3', label: 'Clay balls ×2 + Mesh', ids: [50007, 50007, 50008] }
    ];

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

    function normalizePlantImagePath(path) {
        if (!path || typeof path !== 'string' || !path.startsWith('images/')) return path;
        if (path.startsWith('images/plants/')) return path;
        if (path.startsWith('images/supplies/') || path.startsWith('images/vivariums/')) return path;
        var match = path.match(/^images\/([^/]+)\/(.*)$/);
        return match ? 'images/plants/' + match[1] + '/' + match[2] : path;
    }

    function getPlantImageUrl(p) {
        var url = p.imageUrl || (p.images && p.images.length ? p.images[0] : null);

        // Fallback: reuse any cached image paths from localStorage (populated by the main plant grid)
        if (!url && p && p.id != null && typeof localStorage !== 'undefined') {
            try {
                var cachedMain = localStorage.getItem('plant_' + p.id + '_imageUrl');
                if (cachedMain) {
                    url = cachedMain;
                } else {
                    var raw = localStorage.getItem('plant_' + p.id + '_images');
                    if (raw) {
                        var arr = JSON.parse(raw);
                        if (Array.isArray(arr) && arr.length > 0) url = arr[0];
                    }
                }
            } catch (e) { /* ignore */ }
        }

        if (!url) {
            var sci = p && p.scientificName ? p.scientificName : null;
            if (sci) {
                var slug = slugify(sci);
                if (slug) url = 'images/plants/' + slug + '/' + slug + '-1.jpg';
            }
        }

        if (url) return (window.imageUtils && typeof window.imageUtils.normalizePlantImagePath === 'function')
            ? window.imageUtils.normalizePlantImagePath(url) : normalizePlantImagePath(url);
        return '';
    }

    function getMaxPlants() {
        return 15;
    }

    var BUILD_PLANTS_PAGE_SIZE = 24;
    var buildPlantPage = 1;

    function escapeAttr(s) {
        if (s == null) return '';
        var str = String(s);
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /** Build HTML for one supply card (same visual as plant card). singleSelect: true = button with selected state, false = label + checkbox. Description shown in tooltip on hover. */
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
        var imgUrl = e.imageUrl || (e.images && e.images[0]);
        var imgBlock = imgUrl
            ? '<div class="build-supply-card-img-wrap"><img src="' + escapeHtml(imgUrl) + '" alt="" class="build-supply-card-img"></div>'
            : '<div class="build-supply-card-img-wrap"><div class="build-supply-card-img"></div></div>';
        var cardTop = '<div class="build-supply-card-top">' +
            '<span class="build-supply-card-check" aria-hidden="true">' + checkContent + '</span>' +
            imgBlock + '</div>';
        var cardBody = '<div class="build-supply-card-body">' +
            '<span class="build-supply-card-name">' + name + '</span>' +
            (size ? '<div class="build-supply-card-size">' + size + '</div>' : '') +
            '</div>';
        var dataDesc = desc ? (' data-build-desc="' + escapeAttr(desc) + '"') : '';
        if (singleSelect) {
            return '<button type="button" class="build-supply-card build-supply-card-single' + selClass + '" data-id="' + escapeHtml(String(id)) + '"' + dataDesc + '>' +
                cardTop + cardBody + '</button>';
        }
        return '<label class="build-supply-card' + selClass + '"' + dataDesc + '>' +
            '<input type="checkbox" class="build-supply-card-input" id="' + inputId + '" data-id="' + id + '"' + (checked ? ' checked' : '') + ' aria-label="Select ' + name + '">' +
            cardTop + cardBody + '</label>';
    }

    /** Display-only supply card (image + name) for use inside drainage combo blocks. */
    function supplyCardDisplayHtml(e) {
        var name = escapeHtml(e.name || 'Item');
        var size = (e.size && String(e.size).trim()) ? escapeHtml(String(e.size).trim()) : '';
        var imgUrl = e.imageUrl || (e.images && e.images[0]);
        var imgBlock = imgUrl
            ? '<div class="build-supply-card-img-wrap"><img src="' + escapeHtml(imgUrl) + '" alt="" class="build-supply-card-img"></div>'
            : '<div class="build-supply-card-img-wrap"><div class="build-supply-card-img"></div></div>';
        var body = '<div class="build-supply-card-body">' +
            '<span class="build-supply-card-name">' + name + '</span>' +
            (size ? '<div class="build-supply-card-size">' + size + '</div>' : '') + '</div>';
        return '<div class="build-supply-card build-supply-card-display">' +
            '<div class="build-supply-card-top">' + imgBlock + '</div>' + body + '</div>';
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

    /** Small enclosure id (Glass Terrarium Container - Small); show compact/mini plants even with lower type score. */
    var SMALL_ENCLOSURE_ID = 50001;
    var PLANT_TYPE_SCORE_THRESHOLD = 25;
    var MAX_HEIGHT_CM_FOR_SMALL = 35;

    function plantFitsSmallEnclosure(p) {
        var maxCm = getPlantMaxHeightCm(p);
        if (maxCm != null && maxCm <= MAX_HEIGHT_CM_FOR_SMALL) return true;
        var cat = p.category || [];
        if (Array.isArray(cat) && cat.some(function (c) { return String(c).toLowerCase() === 'mini'; })) return true;
        return false;
    }

    function getPlantsForType(vivariumType) {
        var plants = getPlants();
        var getScores = window.getPlantVivariumScores;
        var enclosureId = supplyIdNum(config.enclosureId);
        var isSmallEnclosure = enclosureId === SMALL_ENCLOSURE_ID;
        if (getScores && vivariumType) {
            var filtered = plants.filter(function (p) {
                var scores = getScores(p);
                var score = scores[vivariumType];
                var passesScore = score != null && score >= PLANT_TYPE_SCORE_THRESHOLD;
                if (passesScore) return true;
                if (isSmallEnclosure && plantFitsSmallEnclosure(p)) return true;
                return false;
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
                var drainageCombo = DRAINAGE_COMBOS.filter(function (c) { return drainageIdsMatch(config.drainageIds || [], c.ids); })[0];
                var drainageLabel = drainageCombo ? drainageCombo.label : '';
                if (el) el.textContent = drainageLabel ? 'Selected: ' + drainageLabel : '';
                if (stepChoice) stepChoice.textContent = drainageLabel;
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
                renderDrainageOptions();
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

    function drainageIdsMatch(idsA, idsB) {
        if (!idsA || !idsB || idsA.length !== idsB.length) return false;
        var a = idsA.map(supplyIdNum).sort(function (x, y) { return x - y; });
        var b = idsB.map(supplyIdNum).sort(function (x, y) { return x - y; });
        for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
        return true;
    }

    function renderDrainageOptions() {
        var el = document.getElementById('buildDrainageOptions');
        if (!el) return;
        el.classList.remove('build-options');
        el.classList.add('build-supply-list', 'build-drainage-combo-list');
        var equipment = getEquipment();
        var current = (config.drainageIds || []).map(supplyIdNum);
        el.innerHTML = DRAINAGE_COMBOS.map(function (combo) {
            var selected = drainageIdsMatch(current, combo.ids);
            var selClass = selected ? ' build-drainage-combo-selected' : '';
            var cardsHtml = combo.ids.map(function (id) {
                var e = equipment.filter(function (x) { return supplyIdNum(x.id) === supplyIdNum(id); })[0];
                return e ? supplyCardDisplayHtml(e) : '';
            }).filter(Boolean).join('');
            var checkContent = selected ? '✓' : '';
            return '<button type="button" class="build-drainage-combo' + selClass + '" data-drainage-combo="' + escapeHtml(combo.id) + '">' +
                '<span class="build-drainage-combo-check" aria-hidden="true">' + checkContent + '</span>' +
                '<div class="build-drainage-combo-cards">' + cardsHtml + '</div></button>';
        }).join('');
        el.querySelectorAll('.build-drainage-combo').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var comboId = btn.getAttribute('data-drainage-combo');
                var combo = DRAINAGE_COMBOS.filter(function (c) { return c.id === comboId; })[0];
                if (combo) config.drainageIds = combo.ids.slice();
                document.querySelectorAll('#buildDrainageOptions .build-drainage-combo').forEach(function (b) {
                    b.classList.remove('build-drainage-combo-selected');
                    var ch = b.querySelector('.build-drainage-combo-check');
                    if (ch) ch.textContent = '';
                });
                btn.classList.add('build-drainage-combo-selected');
                var ch = btn.querySelector('.build-drainage-combo-check');
                if (ch) ch.textContent = '✓';
                var nextBtn = document.querySelector('#buildPanel3 [data-next="4"]');
                if (nextBtn) nextBtn.disabled = false;
                updateSelectedDisplay();
            });
        });
        var nextBtn = document.querySelector('#buildPanel3 [data-next="4"]');
        if (nextBtn) nextBtn.disabled = !config.drainageIds.length;
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

    function updateBuildPlantCardImage(plantId, imageUrl) {
        var cards = document.querySelectorAll('.build-plant-card[data-plant-id="' + plantId + '"] .build-plant-card-img-wrap');
        if (!cards.length) return;
        cards.forEach(function (wrap) {
            var img = wrap.querySelector('img.build-plant-card-img');
            if (!imageUrl) {
                if (img) img.remove();
                var placeholder = wrap.querySelector('.build-plant-card-img');
                if (!placeholder) {
                    var div = document.createElement('div');
                    div.className = 'build-plant-card-img';
                    wrap.appendChild(div);
                }
                return;
            }
            if (!img) {
                img = document.createElement('img');
                img.className = 'build-plant-card-img';
                img.alt = '';
                wrap.innerHTML = '';
                wrap.appendChild(img);
            }
            img.src = imageUrl;
        });
    }

    function discoverImagesForBuildPlants(pagePlants) {
        if (!pagePlants || !pagePlants.length) return;
        pagePlants.forEach(function (plant) {
            if (!plant || plant.id == null) return;
            var url = getPlantImageUrl(plant);
            if (url) updateBuildPlantCardImage(plant.id, url);
        });
    }

    function renderPlantList() {
        var container = document.getElementById('buildPlantList');
        var paginationEl = document.getElementById('buildPlantPagination');
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
        // Selected plants first (in selection order), then the rest
        var selectedIds = config.plantIds || [];
        plants = plants.slice().sort(function (a, b) {
            var aid = plantIdNum(a.id);
            var bid = plantIdNum(b.id);
            var aSel = selectedIds.indexOf(aid);
            var bSel = selectedIds.indexOf(bid);
            if (aSel !== -1 && bSel !== -1) return aSel - bSel;
            if (aSel !== -1) return -1;
            if (bSel !== -1) return 1;
            return 0;
        });
        var totalPlants = plants.length;
        var totalPages = Math.max(1, Math.ceil(totalPlants / BUILD_PLANTS_PAGE_SIZE));
        buildPlantPage = Math.max(1, Math.min(buildPlantPage, totalPages));
        var start = (buildPlantPage - 1) * BUILD_PLANTS_PAGE_SIZE;
        var pagePlants = plants.slice(start, start + BUILD_PLANTS_PAGE_SIZE);
        var onMainSite = !!document.getElementById('tabPlants');
        var baseUrl = window.location.href.replace(/\/[^/]*$/, '/') + 'index.html';
        var atLimit = config.plantIds.length >= maxPlants;
        container.innerHTML = pagePlants.map(function (p) {
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
        if (paginationEl) {
            if (totalPages <= 1) {
                paginationEl.innerHTML = totalPlants > 0 ? '<p class="build-plant-pagination-info">Showing all ' + totalPlants + ' plants</p>' : '';
            } else {
                var startOne = totalPlants === 0 ? 0 : start + 1;
                var endOne = Math.min(start + BUILD_PLANTS_PAGE_SIZE, totalPlants);
                var info = '<p class="build-plant-pagination-info">Showing ' + startOne + '–' + endOne + ' of ' + totalPlants + ' plants</p>';
                var prevDisabled = buildPlantPage <= 1 ? ' disabled' : '';
                var nextDisabled = buildPlantPage >= totalPages ? ' disabled' : '';
                var prevBtn = '<button type="button" class="build-pagination-btn build-pagination-prev"' + prevDisabled + ' data-page="' + (buildPlantPage - 1) + '" aria-label="Previous page">Previous</button>';
                var nextBtn = '<button type="button" class="build-pagination-btn build-pagination-next"' + nextDisabled + ' data-page="' + (buildPlantPage + 1) + '" aria-label="Next page">Next</button>';
                var pageNums = '';
                var showFrom = Math.max(1, buildPlantPage - 2);
                var showTo = Math.min(totalPages, buildPlantPage + 2);
                for (var pg = showFrom; pg <= showTo; pg++) {
                    var active = pg === buildPlantPage ? ' build-pagination-page-active' : '';
                    pageNums += '<button type="button" class="build-pagination-btn build-pagination-page' + active + '" data-page="' + pg + '" aria-label="Page ' + pg + '"' + (pg === buildPlantPage ? ' aria-current="page"' : '') + '>' + pg + '</button>';
                }
                paginationEl.innerHTML = '<div class="build-pagination-wrap">' + info + '<div class="build-pagination-controls">' + prevBtn + '<span class="build-pagination-pages">' + pageNums + '</span>' + nextBtn + '</div></div>';
                paginationEl.querySelectorAll('.build-pagination-btn').forEach(function (btn) {
                    if (btn.disabled) return;
                    btn.addEventListener('click', function () {
                        var p = parseInt(btn.getAttribute('data-page'), 10);
                        if (p >= 1 && p <= totalPages) {
                            buildPlantPage = p;
                            renderPlantList();
                            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    });
                });
            }
        }
        discoverImagesForBuildPlants(pagePlants);
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

    var LABOUR_VIVARIUM_ID = 'labour-vivarium';
    var LABOUR_CHARGE_KD = 10;

    function getNextCustomVivariumId() {
        var nextId = 60001;
        try {
            var custom = JSON.parse(localStorage.getItem('custom_vivariums') || '[]');
            if (Array.isArray(custom) && custom.length) {
                var maxId = custom.reduce(function (m, v) { var id = parseInt(v.id, 10) || 0; return id > m ? id : m; }, 60000);
                nextId = maxId + 1;
            }
        } catch (e) { }
        return nextId;
    }

    function addBuildToCart() {
        var cartBefore = getCart().filter(function (i) { return i.plantId !== LABOUR_VIVARIUM_ID; });
        var cart = cartBefore.slice();
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
        cart.push({ plantId: LABOUR_VIVARIUM_ID, name: 'Labour (Vivarium build)', scientificName: '', quantity: 1, price: LABOUR_CHARGE_KD });
        setCart(cart);

        // Compute total price for THIS build only (excluding any items that were already in the cart before starting the builder).
        var beforeQtyById = {};
        cartBefore.forEach(function (item) {
            var key = String(item.plantId);
            beforeQtyById[key] = (beforeQtyById[key] || 0) + (item.quantity || 0);
        });
        var buildTotal = cart.reduce(function (sum, item) {
            var key = String(item.plantId);
            var prevQty = beforeQtyById[key] || 0;
            var deltaQty = (item.quantity || 0) - prevQty;
            if (deltaQty > 0 && item.price != null) {
                sum += Number(item.price) * deltaQty;
            }
            return sum;
        }, 0);

        var typeName = (BUILD_TYPES.filter(function (t) { return t.id === config.type; })[0] || {}).name || 'Vivarium';
        var customVivarium = {
            id: getNextCustomVivariumId(),
            name: 'Custom ' + typeName + ' Build',
            type: config.type || 'open-terrarium',
            description: 'Customer-built ' + typeName.toLowerCase() + ' with selected enclosure, drainage, substrate, hardscape, plants, and optional supplies.',
            plantIds: (config.plantIds || []).map(function (id) { return plantIdNum(id); }),
            supplyIds: [].concat(
                config.enclosureId ? [supplyIdNum(config.enclosureId)] : [],
                config.drainageIds || [],
                config.substrateIds || [],
                config.hardscapeIds || [],
                config.decorationIds || [],
                config.accessoryIds || [],
                config.toolIds || []
            ),
            price: buildTotal > 0 ? Number(buildTotal.toFixed(3)) : null,
            availability: 'in-stock',
            _buildConfig: {
                type: config.type,
                enclosureId: config.enclosureId ? supplyIdNum(config.enclosureId) : null,
                drainageIds: (config.drainageIds || []).map(function (id) { return supplyIdNum(id); }),
                substrateIds: (config.substrateIds || []).map(function (id) { return supplyIdNum(id); }),
                hardscapeIds: (config.hardscapeIds || []).map(function (id) { return supplyIdNum(id); }),
                plantIds: (config.plantIds || []).map(function (id) { return plantIdNum(id); }),
                decorationIds: (config.decorationIds || []).map(function (id) { return supplyIdNum(id); }),
                accessoryIds: (config.accessoryIds || []).map(function (id) { return supplyIdNum(id); }),
                toolIds: (config.toolIds || []).map(function (id) { return supplyIdNum(id); })
            }
        };
        try {
            var custom = JSON.parse(localStorage.getItem('custom_vivariums') || '[]');
            if (!Array.isArray(custom)) custom = [];
            custom.push(customVivarium);
            localStorage.setItem('custom_vivariums', JSON.stringify(custom));
            if (typeof window.syncToRepo === 'function') window.syncToRepo();
        } catch (e) { }

        // Also create an inventory row so the custom vivarium shows a cost equal to the build price.
        try {
            if (window.inventoryDb && typeof window.inventoryDb.setItem === 'function' && customVivarium.id != null && buildTotal > 0) {
                window.inventoryDb.setItem(customVivarium.id, {
                    name: customVivarium.name,
                    scientificName: '',
                    price: customVivarium.price,
                    costPrice: customVivarium.price,
                    quantityInStock: 0,
                    reorderLevel: 0,
                    description: customVivarium.description
                });
            }
        } catch (e) { /* ignore */ }

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

    function initBuildDescTooltip() {
        var tooltip = document.getElementById('buildDescTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'buildDescTooltip';
            tooltip.className = 'build-desc-tooltip';
            tooltip.setAttribute('role', 'tooltip');
            tooltip.setAttribute('aria-hidden', 'true');
            document.body.appendChild(tooltip);
        }
        document.addEventListener('mouseover', function (e) {
            var card = e.target && e.target.closest && e.target.closest('.build-supply-card');
            var desc = card && card.getAttribute && card.getAttribute('data-build-desc');
            if (!desc) {
                tooltip.classList.remove('build-desc-tooltip-visible');
                tooltip.setAttribute('aria-hidden', 'true');
                return;
            }
            tooltip.textContent = desc;
            tooltip.classList.add('build-desc-tooltip-visible');
            tooltip.setAttribute('aria-hidden', 'false');
            var rect = card.getBoundingClientRect();
            var gap = 8;
            requestAnimationFrame(function () {
                var ttRect = tooltip.getBoundingClientRect();
                var left = rect.left + (rect.width / 2) - (ttRect.width / 2);
                left = Math.max(8, Math.min(left, document.documentElement.clientWidth - ttRect.width - 8));
                var top = rect.top - ttRect.height - gap;
                if (top < 8) {
                    top = rect.bottom + gap;
                } else {
                    top = Math.max(8, top);
                }
                tooltip.style.left = left + 'px';
                tooltip.style.top = top + 'px';
            });
        });
        document.addEventListener('mouseout', function (e) {
            var fromCard = e.target && e.target.closest && e.target.closest('.build-supply-card');
            var toCard = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.build-supply-card');
            if (fromCard && !toCard) {
                tooltip.classList.remove('build-desc-tooltip-visible');
                tooltip.setAttribute('aria-hidden', 'true');
            }
        });
    }

    function init() {
        initBuildDescTooltip();
        logBuildStepSupplies(true);
        renderTypeOptions();
        renderEnclosureOptions();
        renderDrainageOptions();
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
                buildPlantPage = 1;
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
            // If the inventory has no supply rows yet (e.g. on the hosted site),
            // fall back to showing all equipment from equipment.json instead of an empty list.
            if (set.size === 0) {
                inventorySupplyIds = null;
                inventorySupplyIdOrder = [];
            } else {
                inventorySupplyIds = set;
                inventorySupplyIdOrder = order;
            }
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
