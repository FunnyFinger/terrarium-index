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

    var ENCLOSURE_SIZES = [
        { id: 'tiny', label: 'Tiny', height: '0–5 cm' },
        { id: 'small', label: 'Small', height: '5–15 cm' },
        { id: 'medium', label: 'Medium', height: '15–30 cm' },
        { id: 'large', label: 'Large', height: '30–60 cm' },
        { id: 'xlarge', label: 'X-Large', height: '60–180 cm' },
        { id: 'open', label: 'Open', height: '180+ cm' }
    ];

    var SUBSTRATE_BY_TYPE = {
        'open-terrarium': [
            { id: 'drain-leca', name: 'Drainage: LECA', layer: 'drainage' },
            { id: 'drain-gravel', name: 'Drainage: Gravel', layer: 'drainage' },
            { id: 'sub-moist', name: 'Substrate: Terrarium soil (moist)', layer: 'substrate' },
            { id: 'sub-moss', name: 'Topping: Sphagnum moss', layer: 'substrate' }
        ],
        'closed-terrarium': [
            { id: 'drain-leca', name: 'Drainage: LECA', layer: 'drainage' },
            { id: 'drain-gravel', name: 'Drainage: Gravel', layer: 'drainage' },
            { id: 'sub-moist', name: 'Substrate: Terrarium soil (moist)', layer: 'substrate' },
            { id: 'sub-moss', name: 'Topping: Sphagnum moss', layer: 'substrate' }
        ],
        'aerarium': [
            { id: 'mount-cork', name: 'Mount: Cork bark', layer: 'mount' },
            { id: 'mount-driftwood', name: 'Mount: Driftwood', layer: 'mount' }
        ],
        'deserterium': [
            { id: 'drain-gravel', name: 'Drainage: Gravel', layer: 'drainage' },
            { id: 'sub-cactus', name: 'Substrate: Cactus/succulent mix', layer: 'substrate' },
            { id: 'sub-sand', name: 'Topping: Horticultural sand', layer: 'substrate' }
        ],
        'paludarium': [
            { id: 'drain-leca', name: 'Drainage: LECA', layer: 'drainage' },
            { id: 'sub-aquatic', name: 'Aquatic substrate', layer: 'substrate' },
            { id: 'sub-moist', name: 'Land: Terrarium soil (moist)', layer: 'substrate' }
        ],
        'riparium': [
            { id: 'drain-leca', name: 'Drainage: LECA', layer: 'drainage' },
            { id: 'sub-aquatic', name: 'Aquatic substrate', layer: 'substrate' },
            { id: 'sub-moist', name: 'Marginal soil (moist)', layer: 'substrate' }
        ],
        'aquarium': [
            { id: 'sub-aquatic', name: 'Aquatic substrate', layer: 'substrate' },
            { id: 'sub-gravel', name: 'Gravel / sand', layer: 'substrate' }
        ]
    };

    var config = {
        type: null,
        size: null,
        substrateIds: [],
        plantIds: [],
        accessoryIds: []
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
        return window.allPlants || window.plantsDatabase || [];
    }

    function getEquipment() {
        return window.allEquipment || [];
    }

    function getPlantImageUrl(p) {
        if (p.imageUrl) return p.imageUrl;
        if (p.images && p.images.length) return p.images[0];
        var slug = window.scientificNameToSlug && window.scientificNameToSlug(typeof p.scientificName === 'string' ? p.scientificName : (p.scientificName && p.scientificName.name));
        return slug ? 'images/' + slug + '/' + slug + '-1.jpg' : '';
    }

    var ENCLOSURE_MAX_CM = { tiny: 5, small: 15, medium: 30, large: 60, xlarge: 180, open: Infinity };

    var MAX_PLANTS_BY_SIZE = { tiny: 3, small: 5, medium: 7, large: 10, xlarge: 12, open: 15 };

    function getMaxPlants() {
        if (!config.size || !MAX_PLANTS_BY_SIZE[config.size]) return 15;
        return MAX_PLANTS_BY_SIZE[config.size];
    }

    function getPlantMaxHeightCm(plant) {
        var s = plant && plant.size;
        if (typeof s !== 'string' || !s.trim()) return null;
        var m = s.match(/(\d+)\s*[-–—]\s*(\d+)\s*cm/i) || s.match(/(\d+)\s*cm/i);
        if (m) return m[2] != null ? Math.max(parseInt(m[1], 10), parseInt(m[2], 10)) : parseInt(m[1], 10);
        return null;
    }

    function getPlantsForType(vivariumType, enclosureSizeId) {
        var plants = getPlants();
        var getScores = window.getPlantVivariumScores;
        if (getScores && vivariumType) {
            plants = plants.filter(function (p) {
                var scores = getScores(p);
                var score = scores[vivariumType];
                return score != null && score >= 50;
            });
        }
        if (enclosureSizeId && ENCLOSURE_MAX_CM[enclosureSizeId] != null) {
            var maxCm = ENCLOSURE_MAX_CM[enclosureSizeId];
            if (maxCm !== Infinity) {
                plants = plants.filter(function (p) {
                    var plantMax = getPlantMaxHeightCm(p);
                    return plantMax == null || plantMax <= maxCm;
                });
            }
        }
        return plants;
    }

    function getEquipmentForType(vivariumType) {
        var eq = getEquipment();
        if (!eq.length) return eq;
        return eq.filter(function (e) { return !e.hidden; });
    }

    function updateSelectedDisplay() {
        var el1 = document.getElementById('buildSelected1');
        var el2 = document.getElementById('buildSelected2');
        var el3 = document.getElementById('buildSelected3');
        var el4 = document.getElementById('buildSelected4');
        var el5 = document.getElementById('buildSelected5');
        if (el1) {
            var t = config.type && BUILD_TYPES.filter(function (x) { return x.id === config.type; })[0];
            el1.textContent = t ? 'Selected: ' + t.name : '';
        }
        if (el2) {
            var s = config.size && ENCLOSURE_SIZES.filter(function (x) { return x.id === config.size; })[0];
            el2.textContent = s ? 'Selected: ' + s.label + ' (' + s.height + ')' : '';
        }
        if (el3) {
            var list = (config.type && SUBSTRATE_BY_TYPE[config.type]) ? SUBSTRATE_BY_TYPE[config.type] : [];
            var names = config.substrateIds.map(function (id) {
                var o = list.filter(function (x) { return x.id === id; })[0];
                return o ? o.name : id;
            });
            el3.textContent = names.length ? 'Selected: ' + names.join(', ') : '';
        }
        if (el4) {
            var plants = getPlants();
            var selectedNames = config.plantIds.map(function (id) {
                var idN = parseInt(id, 10);
                var p = plants.filter(function (x) { return parseInt(x.id, 10) === idN; })[0];
                return p ? (p.name || (p.commonNames && p.commonNames[0]) || '') : '';
            }).filter(Boolean);
            if (selectedNames.length === 0) el4.textContent = '';
            else if (selectedNames.length <= 3) el4.textContent = 'Selected: ' + selectedNames.join(', ');
            else el4.textContent = 'Selected: ' + selectedNames.length + ' plants — ' + selectedNames.slice(0, 2).join(', ') + ', …';
        }
        if (el5) {
            var eq = getEquipment();
            var accNames = config.accessoryIds.map(function (id) {
                var e = eq.filter(function (x) { return x.id === id; })[0];
                return e ? (e.name || 'Item') : '';
            }).filter(Boolean);
            el5.textContent = accNames.length ? 'Selected: ' + accNames.join(', ') : '';
        }
        var stepChoice1 = document.querySelector('.build-step[data-step="1"] .build-step-choice');
        var stepChoice2 = document.querySelector('.build-step[data-step="2"] .build-step-choice');
        var stepChoice3 = document.querySelector('.build-step[data-step="3"] .build-step-choice');
        var stepChoice4 = document.querySelector('.build-step[data-step="4"] .build-step-choice');
        var stepChoice5 = document.querySelector('.build-step[data-step="5"] .build-step-choice');
        if (stepChoice1) {
            var t = config.type && BUILD_TYPES.filter(function (x) { return x.id === config.type; })[0];
            stepChoice1.textContent = t ? t.name : '';
        }
        if (stepChoice2) {
            var s = config.size && ENCLOSURE_SIZES.filter(function (x) { return x.id === config.size; })[0];
            stepChoice2.textContent = s ? s.label + ' (' + s.height + ')' : '';
        }
        if (stepChoice3) {
            var list = (config.type && SUBSTRATE_BY_TYPE[config.type]) ? SUBSTRATE_BY_TYPE[config.type] : [];
            var names = config.substrateIds.map(function (id) {
                var o = list.filter(function (x) { return x.id === id; })[0];
                return o ? o.name : id;
            });
            stepChoice3.textContent = names.length ? names.join('\n') : '';
        }
        if (stepChoice4) {
            var plants = getPlants();
            var selectedNames = config.plantIds.map(function (id) {
                var idN = parseInt(id, 10);
                var p = plants.filter(function (x) { return parseInt(x.id, 10) === idN; })[0];
                return p ? (p.name || (p.commonNames && p.commonNames[0]) || '') : '';
            }).filter(Boolean);
            stepChoice4.textContent = selectedNames.length ? selectedNames.join('\n') : '';
        }
        if (stepChoice5) {
            var eq = getEquipment();
            var accNames = config.accessoryIds.map(function (id) {
                var e = eq.filter(function (x) { return x.id === id; })[0];
                return e ? (e.name || 'Item') : '';
            }).filter(Boolean);
            stepChoice5.textContent = accNames.length ? accNames.join('\n') : '';
        }
        var limitHint = document.getElementById('buildPlantLimitHint');
        if (limitHint) limitHint.textContent = config.plantIds.length + ' / ' + getMaxPlants() + ' plants selected';
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
                document.querySelectorAll('#buildTypeOptions .build-option-card').forEach(function (b) { b.classList.remove('build-option-selected'); });
                btn.classList.add('build-option-selected');
                document.querySelector('[data-next="2"]').disabled = false;
                renderSubstrateOptions();
                renderPlantList();
                renderAccessoryList();
                updateSelectedDisplay();
            });
        });
        updateSelectedDisplay();
    }

    function renderSizeOptions() {
        var el = document.getElementById('buildSizeOptions');
        if (!el) return;
        el.innerHTML = ENCLOSURE_SIZES.map(function (s) {
            var sel = config.size === s.id ? ' build-option-selected' : '';
            return '<button type="button" class="build-option-card" data-size="' + escapeHtml(s.id) + '"' + sel + '>' +
                '<span class="build-option-name">' + escapeHtml(s.label) + '</span>' +
                '<span class="build-option-detail">' + escapeHtml(s.height) + '</span></button>';
        }).join('');
        el.querySelectorAll('.build-option-card').forEach(function (btn) {
            btn.addEventListener('click', function () {
                config.size = btn.getAttribute('data-size');
                document.querySelectorAll('#buildSizeOptions .build-option-card').forEach(function (b) { b.classList.remove('build-option-selected'); });
                btn.classList.add('build-option-selected');
                document.querySelector('#buildPanel2 [data-next="3"]').disabled = false;
                renderPlantList();
                updateSelectedDisplay();
            });
        });
        updateSelectedDisplay();
    }

    function renderSubstrateOptions() {
        var el = document.getElementById('buildSubstrateOptions');
        if (!el) return;
        var list = (config.type && SUBSTRATE_BY_TYPE[config.type]) ? SUBSTRATE_BY_TYPE[config.type] : [];
        el.innerHTML = list.map(function (s) {
            var checked = config.substrateIds.indexOf(s.id) !== -1;
            return '<label class="build-option-card build-substrate-option">' +
                '<input type="checkbox" data-substrate-id="' + escapeHtml(s.id) + '"' + (checked ? ' checked' : '') + '>' +
                '<span class="build-option-name">' + escapeHtml(s.name) + '</span></label>';
        }).join('');
        el.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var id = cb.getAttribute('data-substrate-id');
                var idx = config.substrateIds.indexOf(id);
                if (cb.checked && idx === -1) config.substrateIds.push(id);
                else if (!cb.checked && idx !== -1) config.substrateIds.splice(idx, 1);
                updateSelectedDisplay();
            });
        });
        document.querySelector('#buildPanel3 [data-next="4"]').disabled = false;
        updateSelectedDisplay();
    }

    function renderPlantList() {
        var container = document.getElementById('buildPlantList');
        var searchEl = document.getElementById('buildPlantSearch');
        if (!container) return;
        var maxPlants = getMaxPlants();
        while (config.plantIds.length > maxPlants) config.plantIds.pop();
        var type = config.type;
        var plants = type ? getPlantsForType(type, config.size) : (config.size ? getPlants().filter(function (p) {
            var maxCm = ENCLOSURE_MAX_CM[config.size];
            if (maxCm == null || maxCm === Infinity) return true;
            var plantMax = getPlantMaxHeightCm(p);
            return plantMax == null || plantMax <= maxCm;
        }) : getPlants());
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
        var equipment = getEquipmentForType(config.type);
        el.innerHTML = equipment.map(function (e) {
            var checked = config.accessoryIds.indexOf(e.id) !== -1;
            return '<div class="build-accessory-card">' +
                '<input type="checkbox" id="acc-' + e.id + '" data-id="' + e.id + '"' + (checked ? ' checked' : '') + '>' +
                '<label for="acc-' + e.id + '">' + escapeHtml(e.name || 'Item') + '</label></div>';
        }).join('');
        el.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var id = parseInt(cb.getAttribute('data-id'), 10);
                var idx = config.accessoryIds.indexOf(id);
                if (cb.checked && idx === -1) config.accessoryIds.push(id);
                else if (!cb.checked && idx !== -1) config.accessoryIds.splice(idx, 1);
                updateSelectedDisplay();
            });
        });
        updateSelectedDisplay();
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
        updateSelectedDisplay();
    }

    function init() {
        renderTypeOptions();
        renderSizeOptions();
        if (config.type) {
            renderSubstrateOptions();
            renderPlantList();
            renderAccessoryList();
        }

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
        var doneBtn = document.getElementById('buildDoneBtn');
        if (doneBtn) {
            doneBtn.addEventListener('click', function () {
                var tabPlants = document.getElementById('tabPlants');
                if (tabPlants) tabPlants.click();
            });
        }
    }

    function waitForDataThenInit() {
        var attempts = 0;
        var maxAttempts = 60;
        function check() {
            var plants = getPlants();
            if (Array.isArray(plants) && (plants.length > 0 || attempts > 30)) {
                init();
                return;
            }
            attempts++;
            if (attempts < maxAttempts) setTimeout(check, 150);
            else init();
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { setTimeout(check, 100); });
        } else {
            setTimeout(check, 100);
        }
    }

    window.initBuildVivarium = init;
    if (document.getElementById('buildTypeOptions')) {
        waitForDataThenInit();
    }
})();
