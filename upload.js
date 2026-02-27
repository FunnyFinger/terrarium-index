(function () {
'use strict';

let elements = {};
let getAllPlants = () => [];
let getFilteredPlants = () => [];
let renderPlants = () => {};
let showPlantModal = () => {};
let scientificNameToSlug = () => null;
let ensureUniqueImages = (images) => images || [];
let scanExistingImages = async () => ({ existingImages: [], existingNumbers: new Set() });
let generateThumbnailFromBlob = async () => {};
let generateThumbnailForPlant = async () => {};
let getImagesFolderHandle = () => null;
let setImagesFolderHandle = () => {};
let getPlantsMergedFolderHandle = () => null;
let setPlantsMergedFolderHandle = () => {};
let getScientificNameString = (plant) => (plant && (typeof plant.scientificName === 'string' ? plant.scientificName : (plant.scientificName && (plant.scientificName.scientificName || plant.scientificName.name || plant.scientificName.uninomial)) || plant.name)) || '';
let savePlantToJsonFile = () => {};
let getColTaxonId = async () => null;
let getCalculatedVivariumTypes = () => [];

let currentUploadPlant = null;
let currentImageFile = null;
let currentImageFiles = [];
let currentImageUrl = null;

// Plant detail fields: element key in elements object -> plant object field name (size is handled separately with min/max)
var GROWTH_RATE_OPTIONS = ['Slow', 'Moderate', 'Fast'];

var SUBSTRATE_OPTIONS = ['Well Draining', 'Moist', 'Epiphytic', 'Attached', 'None'];

var PLANT_DETAIL_FIELDS = [
    { el: 'uploadPlantType', field: 'plantType' },
    { el: 'uploadSubstrate', field: 'substrate', fixedOptions: SUBSTRATE_OPTIONS },
    { el: 'uploadGrowthRate', field: 'growthRate', fixedOptions: GROWTH_RATE_OPTIONS },
    { el: 'uploadRarity', field: 'rarity' },
    { el: 'uploadGrowthPattern', field: 'growthPattern' },
    { el: 'uploadGrowthHabit', field: 'growthHabit' },
    { el: 'uploadHazard', field: 'hazard' },
    { el: 'uploadFloweringPeriod', field: 'floweringPeriod' }
];

var REQUIREMENT_RANGE_FIELDS = [
    { key: 'humidityRange', minEl: 'uploadHumidityMin', maxEl: 'uploadHumidityMax' },
    { key: 'lightRange', minEl: 'uploadLightMin', maxEl: 'uploadLightMax' },
    { key: 'temperatureRange', minEl: 'uploadTempMin', maxEl: 'uploadTempMax' },
    { key: 'airCirculationRange', minEl: 'uploadAirCircMin', maxEl: 'uploadAirCircMax' },
    { key: 'waterNeedsRange', minEl: 'uploadWaterNeedsMin', maxEl: 'uploadWaterNeedsMax' },
    { key: 'difficultyRange', minEl: 'uploadDifficultyMin', maxEl: 'uploadDifficultyMax' },
    { key: 'growthRateRange', minEl: 'uploadGrowthRateMin', maxEl: 'uploadGrowthRateMax' },
    { key: 'soilPhRange', minEl: 'uploadSoilPhMin', maxEl: 'uploadSoilPhMax' }
];

var SUITABLE_FOR_OPTIONS = [
    { value: 'open-terrarium', label: 'Open Terrarium' },
    { value: 'closed-terrarium', label: 'Closed Terrarium' },
    { value: 'paludarium', label: 'Paludarium' },
    { value: 'riparium', label: 'Riparium' },
    { value: 'aquarium', label: 'Aquarium' },
    { value: 'aerarium', label: 'Aerarium' },
    { value: 'deserterium', label: 'Deserterium' },
    { value: 'indoor', label: 'Indoor' },
    { value: 'outdoor', label: 'Outdoor' }
];

var SUITABLE_FOR_LABEL_TO_VALUE = {};
SUITABLE_FOR_OPTIONS.forEach(function (o) { SUITABLE_FOR_LABEL_TO_VALUE[o.label] = o.value; });

function renderSuitableForTags(selectedValues) {
    var container = elements.uploadSuitableForTags;
    if (!container) return;
    var set = new Set(Array.isArray(selectedValues) ? selectedValues.map(String) : []);
    container.innerHTML = '';
    SUITABLE_FOR_OPTIONS.forEach(function (opt) {
        var selected = set.has(opt.value);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'edit-plant-tag ' + opt.value + (selected ? ' edit-plant-tag-selected' : '');
        btn.setAttribute('data-value', opt.value);
        btn.textContent = opt.label;
        btn.addEventListener('click', function () {
            btn.classList.toggle('edit-plant-tag-selected');
        });
        container.appendChild(btn);
    });
}

function getUniqueValuesForField(plants, fieldName) {
    var set = new Set();
    if (!plants || !plants.length) return [];
    plants.forEach(function (p) {
        var v = p[fieldName];
        if (v == null) return;
        if (typeof v === 'string' && v.trim()) set.add(v.trim());
        if (Array.isArray(v)) v.forEach(function (x) { if (x && String(x).trim()) set.add(String(x).trim()); });
    });
    return Array.from(set).sort();
}

function populatePlantDetailSelects(plants) {
    PLANT_DETAIL_FIELDS.forEach(function (_) {
        var select = elements[_.el];
        if (!select) return;
        var options = _.fixedOptions ? _.fixedOptions : getUniqueValuesForField(plants, _.field);
        var current = currentUploadPlant && currentUploadPlant[_.field];
        var currentStr = (current != null && current !== '') ? String(current).trim() : '';
        select.innerHTML = '<option value="">—</option>' + options.map(function (o) {
            return '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>';
        }).join('');
        select.value = (options.indexOf(currentStr) !== -1) ? currentStr : '';
    });
}
function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
function parseSizeToMinMax(sizeStr) {
    if (!sizeStr || typeof sizeStr !== 'string') return { min: '', max: '' };
    var m = sizeStr.trim().match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
    if (m) return { min: m[1], max: m[2] };
    var single = sizeStr.trim().match(/(\d+(?:\.\d+)?)/);
    if (single) return { min: single[1], max: single[1] };
    return { min: '', max: '' };
}
function sizeMinMaxToString(min, max) {
    var a = (min != null && String(min).trim() !== '') ? String(min).trim() : '';
    var b = (max != null && String(max).trim() !== '') ? String(max).trim() : '';
    if (!a && !b) return '';
    if (a && b) return a + '-' + b + ' cm';
    return (a || b) + ' cm';
}
function readPlantDetailsFromForm() {
    if (!currentUploadPlant) return;
    PLANT_DETAIL_FIELDS.forEach(function (_) {
        var select = elements[_.el];
        if (!select) return;
        var v = select.value ? select.value.trim() : '';
        currentUploadPlant[_.field] = v || '';
    });
    var minEl = elements.uploadSizeMin;
    var maxEl = elements.uploadSizeMax;
    if (minEl && maxEl) {
        currentUploadPlant.size = sizeMinMaxToString(minEl.value, maxEl.value);
    }
    var priceEl = elements.uploadPrice;
    var costEl = elements.uploadCost;
    var marginPctEl = elements.uploadMarginPct;
    var unitEl = elements.uploadUnit;
    var invEl = elements.uploadInventory;
    var reorderEl = elements.uploadReorder;
    var cost = costEl && costEl.value.trim() !== '' ? parseFloat(costEl.value) : NaN;
    var marginPct = marginPctEl && marginPctEl.value.trim() !== '' ? parseFloat(marginPctEl.value) : NaN;
    if (!isNaN(cost)) currentUploadPlant.costPrice = cost;
    else currentUploadPlant.costPrice = undefined;
    if (!isNaN(cost) && !isNaN(marginPct) && marginPct < 100) {
        var p = cost / (1 - marginPct / 100);
        currentUploadPlant.price = p;
        if (priceEl) priceEl.value = p.toFixed(2);
    } else {
        currentUploadPlant.price = priceEl && priceEl.value.trim() !== '' ? (parseFloat(priceEl.value) || undefined) : undefined;
    }
    if (unitEl && unitEl.value && unitEl.value.trim() !== '') {
        currentUploadPlant.unit = unitEl.value.trim();
    } else {
        currentUploadPlant.unit = undefined;
    }
    if (invEl) {
        var q = invEl.value.trim();
        currentUploadPlant.stockQuantity = q === '' ? 0 : (parseFloat(q) || 0);
    }
    if (reorderEl) {
        var r = reorderEl.value.trim();
        currentUploadPlant.reorderLevel = r === '' ? undefined : (parseFloat(r));
        if (currentUploadPlant.reorderLevel !== undefined && isNaN(currentUploadPlant.reorderLevel)) currentUploadPlant.reorderLevel = undefined;
    }
    var sciNameEl = elements.uploadScientificName;
    var commonNamesEl = elements.uploadCommonNames;
    if (sciNameEl) {
        currentUploadPlant.scientificName = sciNameEl.value ? sciNameEl.value.trim() : '';
    }
    if (commonNamesEl) {
        var raw = commonNamesEl.value || '';
        currentUploadPlant.commonNames = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    var colUrlEl = elements.uploadCatalogueOfLifeUrl;
    if (colUrlEl) {
        currentUploadPlant.catalogueOfLifeUrl = colUrlEl.value ? colUrlEl.value.trim() : '';
    }
    var suitableContainer = elements.uploadSuitableForTags;
    if (suitableContainer) {
        var selected = [];
        suitableContainer.querySelectorAll('.edit-plant-tag-selected').forEach(function (el) {
            var v = el.getAttribute('data-value');
            if (v) selected.push(v);
        });
        currentUploadPlant.suitableFor = selected;
    }
    REQUIREMENT_RANGE_FIELDS.forEach(function (_) {
        var minEl = elements[_.minEl];
        var maxEl = elements[_.maxEl];
        if (!minEl || !maxEl) return;
        var minVal = minEl.value.trim();
        var maxVal = maxEl.value.trim();
        var minNum = minVal === '' ? null : parseFloat(minVal);
        var maxNum = maxVal === '' ? null : parseFloat(maxVal);
        if (minNum == null && maxNum == null) {
            currentUploadPlant[_.key] = undefined;
            return;
        }
        var ideal = (minNum != null && maxNum != null) ? (minNum + maxNum) / 2 : (minNum != null ? minNum : maxNum);
        currentUploadPlant[_.key] = {
            min: minNum != null ? minNum : ideal,
            max: maxNum != null ? maxNum : ideal,
            ideal: ideal
        };
    });
}

function init(options = {}) {
    elements = options.elements || {};
    getAllPlants = options.getAllPlants || getAllPlants;
    getFilteredPlants = options.getFilteredPlants || getFilteredPlants;
    renderPlants = options.renderPlants || renderPlants;
    showPlantModal = options.showPlantModal || showPlantModal;
    scientificNameToSlug = options.scientificNameToSlug || scientificNameToSlug;
    ensureUniqueImages = options.ensureUniqueImages || ensureUniqueImages;
    scanExistingImages = options.scanExistingImages || scanExistingImages;
    generateThumbnailFromBlob = options.generateThumbnailFromBlob || generateThumbnailFromBlob;
    generateThumbnailForPlant = options.generateThumbnailForPlant || generateThumbnailForPlant;
    getImagesFolderHandle = options.getImagesFolderHandle || getImagesFolderHandle;
    setImagesFolderHandle = options.setImagesFolderHandle || setImagesFolderHandle;
    getPlantsMergedFolderHandle = options.getPlantsMergedFolderHandle || getPlantsMergedFolderHandle;
    setPlantsMergedFolderHandle = options.setPlantsMergedFolderHandle || setPlantsMergedFolderHandle;
    getScientificNameString = options.getScientificNameString || getScientificNameString;
    savePlantToJsonFile = options.savePlantToJsonFile || savePlantToJsonFile;
    getColTaxonId = options.getColTaxonId || getColTaxonId;
    getCalculatedVivariumTypes = options.getCalculatedVivariumTypes || getCalculatedVivariumTypes;
}

function setupUploadListeners() {
    const {
        uploadModal,
        closeUploadModal,
        cancelUploadBtn,
        fileInput,
        dragDropArea,
        loadUrlBtn,
        imageUrlInput,
        saveImageBtn,
        selectFolderBtn
    } = elements;

    if (!uploadModal) return;

    closeUploadModal?.addEventListener('click', closeUploadModalFunc);
    cancelUploadBtn?.addEventListener('click', closeUploadModalFunc);

    fileInput?.addEventListener('change', handleFileSelect);
    dragDropArea?.addEventListener('click', () => fileInput.click());

    dragDropArea?.addEventListener('dragover', handleDragOver);
    dragDropArea?.addEventListener('dragleave', handleDragLeave);
    dragDropArea?.addEventListener('drop', handleDrop);

    loadUrlBtn?.addEventListener('click', loadImageFromUrl);
    imageUrlInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadImageFromUrl();
    });

    saveImageBtn?.addEventListener('click', saveImage);

    (function () {
        var costEl = elements.uploadCost;
        var marginPctEl = elements.uploadMarginPct;
        var priceEl = elements.uploadPrice;
        function updatePriceFromCostAndMargin() {
            if (!priceEl) return;
            var c = costEl && costEl.value.trim() !== '' ? parseFloat(costEl.value) : NaN;
            var m = marginPctEl && marginPctEl.value.trim() !== '' ? parseFloat(marginPctEl.value) : NaN;
            if (!isNaN(c) && !isNaN(m) && m < 100) priceEl.value = (c / (1 - m / 100)).toFixed(2);
            else if (priceEl.value === '' && isNaN(c)) priceEl.value = '';
        }
        if (costEl) costEl.addEventListener('input', updatePriceFromCostAndMargin);
        if (marginPctEl) marginPctEl.addEventListener('input', updatePriceFromCostAndMargin);
    })();

    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', selectImagesFolder);
        checkStoredFolder();
    }
}

async function selectImagesFolder() {
    const {
        uploadModal,
        folderStatus,
        selectFolderBtn
    } = elements;

    if (!('showDirectoryPicker' in window)) {
        console.warn('⚠️ Browser does not support folder selection. Please use Chrome or Edge browser.');
        return;
    }

    try {
        if (selectFolderBtn) {
            selectFolderBtn.disabled = true;
            selectFolderBtn.textContent = '⏳ Waiting for folder selection...';
        }
        if (folderStatus) {
            folderStatus.textContent = '📁 A folder selection dialog should appear NOW. Look for it in your taskbar or press Alt+Tab.';
            folderStatus.style.color = 'var(--accent-color)';
        }

        const selectedFolder = await window.showDirectoryPicker({
            mode: 'readwrite',
            id: 'workspace-folder',
            startIn: 'desktop'
        });

        let imagesFolderHandle = selectedFolder;
        try {
            if (selectedFolder.name.toLowerCase() !== 'images') {
                imagesFolderHandle = await selectedFolder.getDirectoryHandle('images', { create: true });
            }
        } catch (e) {
            imagesFolderHandle = selectedFolder;
        }
        setImagesFolderHandle(imagesFolderHandle);

        try {
            if (selectedFolder.name.toLowerCase() !== 'images') {
                const dataFolder = await selectedFolder.getDirectoryHandle('data', { create: false });
                const plantsMergedFolderHandle = await dataFolder.getDirectoryHandle('plants-merged', { create: false });
                setPlantsMergedFolderHandle(plantsMergedFolderHandle);
            }
        } catch (e) {
            console.warn('⚠️ Could not access data/plants-merged folder:', e.message);
        }

        localStorage.setItem('imagesFolderSelected', 'true');

        if (folderStatus) {
            folderStatus.textContent = '✅ Folder access granted! Images will save to images/plants/, images/supplies/, or images/vivariums/';
            folderStatus.style.color = 'var(--accent-color)';
        }
        if (selectFolderBtn) {
            selectFolderBtn.textContent = '✅ Folder Selected';
            selectFolderBtn.style.display = 'none';
            selectFolderBtn.disabled = false;
        }
    } catch (err) {
        if (selectFolderBtn) {
            selectFolderBtn.disabled = false;
            selectFolderBtn.textContent = '📁 Select Folder (One-time Setup)';
        }

        if (err.name === 'AbortError') {
            if (folderStatus) {
                folderStatus.textContent = '💡 Folder selection cancelled. Click the button again to select your folder.';
                folderStatus.style.color = 'var(--text-light)';
            }
        } else {
            console.error('❌ Error selecting folder:', err);
            if (folderStatus) {
                folderStatus.textContent = '⚠️ Error selecting folder. Please try again.';
                folderStatus.style.color = 'var(--text-light)';
            }
        }
    }
}

async function checkStoredFolder() {
    const wasSelected = localStorage.getItem('imagesFolderSelected');
    if (!wasSelected || !('showDirectoryPicker' in window) || getImagesFolderHandle()) {
        return;
    }

    try {
        const selectedFolder = await window.showDirectoryPicker({
            mode: 'readwrite',
            id: 'workspace-folder',
            startIn: 'desktop'
        });

        let imagesFolderHandle = selectedFolder;
        try {
            if (selectedFolder.name.toLowerCase() !== 'images') {
                imagesFolderHandle = await selectedFolder.getDirectoryHandle('images', { create: true });
            }
        } catch (e) {
            imagesFolderHandle = selectedFolder;
        }
        setImagesFolderHandle(imagesFolderHandle);

        try {
            if (selectedFolder.name.toLowerCase() !== 'images') {
                const dataFolder = await selectedFolder.getDirectoryHandle('data', { create: false });
                const plantsMergedFolderHandle = await dataFolder.getDirectoryHandle('plants-merged', { create: false });
                setPlantsMergedFolderHandle(plantsMergedFolderHandle);
            }
        } catch (e) {
            console.warn('⚠️ Could not restore plants-merged folder access:', e.message);
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.log('ℹ️ Folder access not available - will request when needed');
        }
    }
}

async function ensureFolderAccess() {
    if (getImagesFolderHandle()) {
        return true;
    }

    if (!('showDirectoryPicker' in window)) {
        console.warn('⚠️ File System Access API not supported in this browser');
        return false;
    }

    try {
        const selectedFolder = await window.showDirectoryPicker({
            mode: 'readwrite',
            id: 'workspace-folder',
            startIn: 'desktop'
        });

        let imagesFolderHandle = selectedFolder;
        try {
            if (selectedFolder.name.toLowerCase() !== 'images') {
                imagesFolderHandle = await selectedFolder.getDirectoryHandle('images', { create: true });
            }
        } catch (e) {
            imagesFolderHandle = selectedFolder;
        }
        setImagesFolderHandle(imagesFolderHandle);

        localStorage.setItem('imagesFolderSelected', 'true');
        return true;
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('❌ Error accessing folder:', err);
        }
        return false;
    }
}

async function openImageUpload(plantId) {
    const {
        uploadModal,
        uploadPlantName,
        uploadPlantDescription,
        saveImageBtn,
        folderStatus,
        selectFolderBtn,
        fileInput,
        imageUrlInput
    } = elements;

    if (!uploadModal) return;

    const allPlants = getAllPlants();
    if (plantId != null) {
        currentUploadPlant = allPlants.find(p => p.id === plantId) || null;
    } else {
        currentUploadPlant = { id: null, name: 'New Plant', scientificName: '', description: '', images: [] };
    }
    if (!currentUploadPlant) return;

    if (uploadPlantName) {
        if (currentUploadPlant.id != null) {
            var scientificName = getScientificNameString(currentUploadPlant) || currentUploadPlant.name || '';
            var escapedName = String(scientificName).replace(/'/g, "\\'").replace(/"/g, '&quot;');
            uploadPlantName.innerHTML = 'Plant: <span class="scientific-name-tag" onclick="typeof copyScientificNameToClipboard===\'function\'&&copyScientificNameToClipboard(\'' + escapedName + '\', this)" title="Click to copy" style="cursor: pointer; color: var(--primary-color); text-decoration: underline; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: rgba(74, 144, 226, 0.1); transition: all 0.2s; display: inline-block;">' + escapeHtml(scientificName) + '</span>';
            uploadPlantName.style.display = '';
        } else {
            uploadPlantName.innerHTML = '';
            uploadPlantName.style.display = 'none';
        }
    }

    if (uploadPlantDescription) {
        uploadPlantDescription.value = currentUploadPlant.description || '';
    }
    var careTipsEl = elements.uploadCareTips;
    if (careTipsEl) {
        var tips = currentUploadPlant.careTips;
        careTipsEl.value = Array.isArray(tips) ? tips.filter(Boolean).map(String).join('\n') : (tips ? String(tips) : '');
    }
    var sciNameEl = elements.uploadScientificName;
    var commonNamesEl = elements.uploadCommonNames;
    if (sciNameEl) sciNameEl.value = getScientificNameString(currentUploadPlant) || '';
    if (commonNamesEl) {
        var arr = currentUploadPlant.commonNames;
        commonNamesEl.value = Array.isArray(arr) ? arr.filter(Boolean).map(String).join(', ') : (arr ? String(arr) : '');
    }
    var colUrlEl = elements.uploadCatalogueOfLifeUrl;
    if (colUrlEl) {
        var colUrl = currentUploadPlant.catalogueOfLifeUrl || (currentUploadPlant.taxonomy && currentUploadPlant.taxonomy.catalogueOfLifeUrl) || '';
        colUrlEl.value = typeof colUrl === 'string' ? colUrl.trim() : '';
        if (!colUrlEl.value) {
            var snStr = getScientificNameString(currentUploadPlant);
            if (snStr) {
                try {
                    var taxonId = await getColTaxonId(snStr, 'species');
                    if (taxonId) colUrlEl.value = 'https://www.catalogueoflife.org/data/taxon/' + taxonId;
                } catch (e) { /* ignore */ }
            }
        }
    }
    populatePlantDetailSelects(allPlants);
    var sizeParsed = parseSizeToMinMax(currentUploadPlant.size);
    var sizeMinEl = elements.uploadSizeMin;
    var sizeMaxEl = elements.uploadSizeMax;
    if (sizeMinEl) sizeMinEl.value = sizeParsed.min;
    if (sizeMaxEl) sizeMaxEl.value = sizeParsed.max;

    var priceEl = elements.uploadPrice;
    var costEl = elements.uploadCost;
    var marginPctEl = elements.uploadMarginPct;
    var unitEl = elements.uploadUnit;
    var invEl = elements.uploadInventory;
    var reorderEl = elements.uploadReorder;
    if (costEl) costEl.value = (currentUploadPlant.costPrice != null && currentUploadPlant.costPrice !== '') ? currentUploadPlant.costPrice : '';
    var price = currentUploadPlant.price != null && currentUploadPlant.price !== '' ? currentUploadPlant.price : null;
    var cost = currentUploadPlant.costPrice != null && currentUploadPlant.costPrice !== '' ? currentUploadPlant.costPrice : null;
    var marginPct = (price != null && price > 0 && cost != null) ? ((price - cost) / price * 100) : '';
    if (marginPctEl) marginPctEl.value = marginPct !== '' ? Number(marginPct).toFixed(1) : '';
    if (priceEl) priceEl.value = (price != null ? price : '');
    var defaultUnit = 'pot';
    var pt = (currentUploadPlant.plantType || '').toLowerCase();
    var nameStr = (getScientificNameString(currentUploadPlant) || '').toLowerCase() + ' ' + ((currentUploadPlant.commonNames || []).join(' ')).toLowerCase();
    if (pt.indexOf('moss') !== -1 || nameStr.indexOf('moss') !== -1) defaultUnit = 'm2';
    if (unitEl) unitEl.value = (currentUploadPlant.unit != null && currentUploadPlant.unit !== '') ? currentUploadPlant.unit : defaultUnit;
    if (invEl) invEl.value = (currentUploadPlant.stockQuantity != null && currentUploadPlant.stockQuantity !== '') ? currentUploadPlant.stockQuantity : '';
    if (reorderEl) reorderEl.value = (currentUploadPlant.reorderLevel != null && currentUploadPlant.reorderLevel !== '') ? currentUploadPlant.reorderLevel : '';

    var suitableSelected = currentUploadPlant.suitableFor;
    if ((currentUploadPlant.id != null) && (!suitableSelected || !suitableSelected.length)) {
        var calculatedNames = getCalculatedVivariumTypes(currentUploadPlant) || [];
        suitableSelected = calculatedNames.map(function (name) {
            return SUITABLE_FOR_LABEL_TO_VALUE[String(name)] || String(name).toLowerCase().replace(/\s+/g, '-');
        }).filter(Boolean);
    }
    renderSuitableForTags(suitableSelected);

    REQUIREMENT_RANGE_FIELDS.forEach(function (_) {
        var range = currentUploadPlant[_.key];
        var minEl = elements[_.minEl];
        var maxEl = elements[_.maxEl];
        if (minEl) minEl.value = (range && typeof range.min === 'number') ? range.min : '';
        if (maxEl) maxEl.value = (range && typeof range.max === 'number') ? range.max : '';
    });

    uploadModal.classList.remove('hidden');
    uploadModal.classList.add('show');
    if (document.documentElement) document.documentElement.classList.remove('edit-loading-on');
    if (document.body && !document.body.classList.contains('edit-page-visible')) document.body.classList.add('edit-page-visible');
    saveImageBtn.textContent = '💾 Save';
    saveImageBtn.disabled = false;

    document.addEventListener('paste', handlePaste);

    if (window.supabaseDb && window.supabaseDb.isConfigured && window.supabaseDb.isConfigured()) {
        if (selectFolderBtn) selectFolderBtn.style.display = 'none';
        if (folderStatus) {
            folderStatus.textContent = 'Edits save directly to Supabase.';
            folderStatus.style.color = 'var(--text-light)';
        }
    } else if (!getImagesFolderHandle() && 'showDirectoryPicker' in window) {
        const wasSelected = localStorage.getItem('imagesFolderSelected');
        if (wasSelected) {
            if (folderStatus) {
                folderStatus.textContent = '⏳ Restoring folder access...';
                folderStatus.style.color = 'var(--text-light)';
            }
            try {
                const selectedFolder = await window.showDirectoryPicker({
                    mode: 'readwrite',
                    id: 'workspace-folder',
                    startIn: 'desktop'
                });

                let imagesFolderHandle = selectedFolder;
                try {
                    if (selectedFolder.name.toLowerCase() !== 'images') {
                        imagesFolderHandle = await selectedFolder.getDirectoryHandle('images', { create: true });
                    }
                } catch (e) {
                    imagesFolderHandle = selectedFolder;
                }
                setImagesFolderHandle(imagesFolderHandle);
            } catch (err) {
                console.log('ℹ️ Could not restore folder access automatically');
            }
        }
    }

    var useSupabase = typeof window !== 'undefined' && window.supabaseDb && window.supabaseDb.isConfigured && window.supabaseDb.isConfigured();
    if (useSupabase) {
        selectFolderBtn.style.display = 'none';
        if (folderStatus) {
            folderStatus.textContent = 'Edits save directly to Supabase.';
            folderStatus.style.color = 'var(--text-light)';
        }
    } else if (!getImagesFolderHandle() && 'showDirectoryPicker' in window) {
        selectFolderBtn.style.display = 'inline-block';
        selectFolderBtn.textContent = '📁 Select Folder (One-time Setup)';
        if (folderStatus) {
            folderStatus.textContent = '💡 Click "📁 Select Folder" button above to set up folder access (one-time setup).';
            folderStatus.style.color = 'var(--text-light)';
        }
    } else {
        selectFolderBtn.style.display = 'none';
        if (folderStatus) {
            folderStatus.textContent = getImagesFolderHandle() ? '✅ Images folder ready - files will save automatically!' : '💡 Browser does not support automatic folder saving. Please use Chrome or Edge.';
            folderStatus.style.color = getImagesFolderHandle() ? 'var(--accent-color)' : 'var(--text-light)';
        }
    }

    currentImageFile = null;
    currentImageFiles = [];
    currentImageUrl = null;
    if (fileInput) fileInput.value = '';
    if (imageUrlInput) imageUrlInput.value = '';
    updateDragDropGallery();
}

function updateUploadGallery() {
    const { uploadGallery, uploadGalleryGrid, uploadGalleryCount } = elements;
    if (!uploadGallery || !uploadGalleryGrid || !uploadGalleryCount) return;

    const files = currentImageFiles.length > 0 ? currentImageFiles : (currentImageFile ? [currentImageFile] : []);
    if (files.length === 0) {
        uploadGallery.style.display = 'none';
        return;
    }

    uploadGallery.style.display = 'block';
    uploadGalleryCount.textContent = files.length;
    uploadGalleryGrid.innerHTML = '';

    files.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'upload-gallery-item';
        item.dataset.index = index;

        const img = document.createElement('img');
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);

        const numberBadge = document.createElement('div');
        numberBadge.className = 'image-number';
        numberBadge.textContent = `#${index + 1}`;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '×';
        removeBtn.title = 'Remove this image';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeImageFromUploadGallery(index);
        };

        item.appendChild(img);
        item.appendChild(numberBadge);
        item.appendChild(removeBtn);
        uploadGalleryGrid.appendChild(item);
    });
}

function removeImageFromUploadGallery(index) {
    const { fileInput, folderStatus } = elements;

    if (currentImageFiles.length > 0) {
        currentImageFiles.splice(index, 1);
        currentImageFile = currentImageFiles[0] || null;
    } else if (currentImageFile && index === 0) {
        currentImageFile = null;
    }

    if (currentImageFiles.length > 0) {
        const dataTransfer = new DataTransfer();
        currentImageFiles.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;
    } else {
        fileInput.value = '';
    }

    updateDragDropGallery();

    const totalFiles = currentImageFiles.length > 0 ? currentImageFiles.length : (currentImageFile ? 1 : 0);
    if (folderStatus) {
        if (totalFiles > 1) {
            folderStatus.textContent = `📸 ${totalFiles} images ready to upload`;
            folderStatus.style.color = 'var(--accent-color)';
        } else {
            folderStatus.textContent = '';
        }
    }
}

function updateDragDropGallery() {
    const {
        dragDropEmpty,
        dragDropGallery,
        dragDropGalleryGrid,
        dragDropCount
    } = elements;

    if (!dragDropEmpty || !dragDropGallery || !dragDropGalleryGrid || !dragDropCount) return;

    const files = currentImageFiles.length > 0 ? currentImageFiles : (currentImageFile ? [currentImageFile] : []);
    if (files.length === 0) {
        dragDropEmpty.style.display = 'block';
        dragDropGallery.style.display = 'none';
        return;
    }

    dragDropEmpty.style.display = 'none';
    dragDropGallery.style.display = 'block';
    dragDropCount.textContent = files.length;
    dragDropGalleryGrid.innerHTML = '';

    files.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'drag-drop-gallery-item';
        item.dataset.index = index;

        const img = document.createElement('img');
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);

        const numberBadge = document.createElement('div');
        numberBadge.className = 'image-number';
        numberBadge.textContent = `#${index + 1}`;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '×';
        removeBtn.title = 'Remove this image';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeImageFromUploadGallery(index);
        };

        item.appendChild(img);
        item.appendChild(numberBadge);
        item.appendChild(removeBtn);
        dragDropGalleryGrid.appendChild(item);
    });
}

function clearDragDropGallery() {
    const { fileInput, folderStatus } = elements;

    currentImageFiles = [];
    currentImageFile = null;
    fileInput.value = '';
    updateDragDropGallery();
    if (folderStatus) {
        folderStatus.textContent = '';
    }
}

function closeUploadModalFunc() {
    const { uploadModal, saveImageBtn, uploadPlantDescription } = elements;
    if (!uploadModal) return;

    uploadModal.classList.remove('show');
    uploadModal.classList.add('hidden');
    if (document.body) document.body.classList.remove('edit-page-visible');
    saveImageBtn.textContent = '💾 Save';
    saveImageBtn.disabled = false;
    if (uploadPlantDescription) uploadPlantDescription.value = '';
    document.removeEventListener('paste', handlePaste);

    setTimeout(() => {
        currentUploadPlant = null;
        currentImageFile = null;
        currentImageFiles = [];
        currentImageUrl = null;
    }, 100);
    if (typeof window !== 'undefined' && window.self !== window.top) try { window.parent.postMessage({ type: 'invAddOverlayClose' }, '*'); } catch (e) {}
}

function handleFileSelect(e) {
    const { folderStatus, fileInput } = elements;
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));

    if (files.length > 0) {
        const existingFileNames = new Set(currentImageFiles.map(f => f.name + f.size + f.lastModified));
        const newFiles = files.filter(f => !existingFileNames.has(f.name + f.size + f.lastModified));

        if (newFiles.length > 0) {
            currentImageFiles = [...currentImageFiles, ...newFiles];
            currentImageFile = currentImageFiles[0];

            const dataTransfer = new DataTransfer();
            currentImageFiles.forEach(file => dataTransfer.items.add(file));
            fileInput.files = dataTransfer.files;

            updateDragDropGallery();

            if (folderStatus) {
                folderStatus.textContent = currentImageFiles.length > 1
                    ? `📸 ${currentImageFiles.length} images ready to upload`
                    : '';
                folderStatus.style.color = 'var(--accent-color)';
            }
        }
    }
}

function handleDragOver(e) {
    e.preventDefault();
    elements.dragDropArea?.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    elements.dragDropArea?.classList.remove('drag-over');
}

function handleDrop(e) {
    const { folderStatus, fileInput } = elements;
    e.preventDefault();
    elements.dragDropArea?.classList.remove('drag-over');

    const imageFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const existingFileNames = new Set(currentImageFiles.map(f => f.name + f.size + f.lastModified));
    const newFiles = imageFiles.filter(f => !existingFileNames.has(f.name + f.size + f.lastModified));

    if (newFiles.length > 0) {
        currentImageFiles = [...currentImageFiles, ...newFiles];
        currentImageFile = currentImageFiles[0];

        const dataTransfer = new DataTransfer();
        currentImageFiles.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;

        updateDragDropGallery();

        if (folderStatus) {
            folderStatus.textContent = currentImageFiles.length > 1
                ? `📸 ${currentImageFiles.length} images ready to upload`
                : '';
            folderStatus.style.color = 'var(--accent-color)';
        }
    }
}

async function handlePaste(e) {
    const { uploadModal, fileInput, folderStatus } = elements;
    if (!uploadModal || !uploadModal.classList.contains('show')) return;

    var target = e.target && e.target.closest ? e.target.closest('input, textarea, [contenteditable="true"]') : null;
    if (!target && document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.getAttribute('contenteditable') === 'true')) target = document.activeElement;
    if (target) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    const newFiles = [];
    for (const item of imageItems) {
        const blob = item.getAsFile();
        if (!blob) continue;
        const timestamp = Date.now();
        const fileExtension = blob.type.split('/')[1] || 'png';
        const fileName = `pasted-image-${timestamp}.${fileExtension}`;
        const file = new File([blob], fileName, { type: blob.type, lastModified: timestamp });

        const existingFileNames = new Set(currentImageFiles.map(f => f.name + f.size + f.lastModified));
        const fileKey = file.name + file.size + file.lastModified;
        if (!existingFileNames.has(fileKey)) {
            newFiles.push(file);
        }
    }

    if (newFiles.length > 0) {
        currentImageFiles = [...currentImageFiles, ...newFiles];
        currentImageFile = currentImageFiles[0];

        const dataTransfer = new DataTransfer();
        currentImageFiles.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;

        updateDragDropGallery();

        if (folderStatus) {
            folderStatus.textContent = currentImageFiles.length > 1
                ? `📸 ${currentImageFiles.length} images ready to upload`
                : '';
            folderStatus.style.color = 'var(--accent-color)';
        }
    }
}

async function loadImageFromUrl() {
    const { imageUrlInput, fileInput, folderStatus } = elements;
    const url = imageUrlInput.value.trim();
    if (!url) return;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
            throw new Error('URL does not point to a valid image');
        }

        const fileName = url.split('/').pop().split('?')[0] || 'image-from-url.jpg';
        const file = new File([blob], fileName, { type: blob.type });

        const existingFileNames = new Set(currentImageFiles.map(f => f.name + f.size + f.lastModified));
        const fileKey = file.name + file.size + file.lastModified;
        if (existingFileNames.has(fileKey)) {
            return;
        }

        currentImageFiles = [...currentImageFiles, file];
        currentImageFile = currentImageFiles[0];

        const dataTransfer = new DataTransfer();
        currentImageFiles.forEach(f => dataTransfer.items.add(f));
        fileInput.files = dataTransfer.files;

        updateDragDropGallery();

        if (folderStatus) {
            folderStatus.textContent = currentImageFiles.length > 1
                ? `📸 ${currentImageFiles.length} images ready to upload`
                : '';
            folderStatus.style.color = 'var(--accent-color)';
        }

        imageUrlInput.value = '';
    } catch (error) {
        if (folderStatus) {
            folderStatus.textContent = `❌ Error: ${error.message}`;
            folderStatus.style.color = 'var(--error-color, #d32f2f)';
        }
    }
}

function findNextAvailableNumber(existingNumbers, maxCheck = 100) {
    for (let i = 1; i <= maxCheck; i++) {
        if (!existingNumbers.has(i)) {
            return i;
        }
    }
    if (existingNumbers.size > 0) {
        return Math.max(...Array.from(existingNumbers)) + 1;
    }
    return 1;
}

/**
 * Save an array of image File objects to the plant's folder on disk (images/plants/{slug}/).
 * Used by the plant-image-only modal so that "Add or edit images" creates the folder and persists files.
 * Prompts for folder access if not already granted.
 */
async function savePlantImageFilesToFolder(plant, imageFiles) {
    if (!plant || !imageFiles || imageFiles.length === 0) return { success: false, savedPaths: [] };
    currentUploadPlant = plant;
    const snStr = getScientificNameString(plant);
    let plantFolderName = null;
    let folderPath = null;
    if (snStr) {
        plantFolderName = scientificNameToSlug(snStr);
        if (plantFolderName) folderPath = 'images/plants/' + plantFolderName;
    }
    if (!plantFolderName && plant.name) {
        plantFolderName = String(plant.name).toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/'/g, '')
            .replace(/[^a-z0-9-]/g, '');
        folderPath = 'images/plants/' + plantFolderName;
    }
    if (!plantFolderName) return { success: false, savedPaths: [] };

    const { existingImages, existingNumbers } = await scanExistingImages(plantFolderName, plant);
    if (existingImages.length > 0) {
        currentUploadPlant.images = [...new Set([...(currentUploadPlant.images || []), ...existingImages])];
    } else if (!currentUploadPlant.images) {
        currentUploadPlant.images = [];
    }
    let currentNumber = findNextAvailableNumber(existingNumbers);
    const totalImages = imageFiles.length;
    let savedCount = 0;

    for (let imgIndex = 0; imgIndex < imageFiles.length; imgIndex++) {
        const result = await saveSingleImage(imageFiles[imgIndex], false, imgIndex, totalImages, plantFolderName, folderPath, currentNumber);
        if (result && result.success) {
            savedCount++;
            currentNumber = result.nextNumber;
        } else {
            currentNumber = result ? result.nextNumber : currentNumber + 1;
        }
    }

    return { success: savedCount > 0, savedPaths: (currentUploadPlant && currentUploadPlant.images) ? currentUploadPlant.images.slice() : [] };
}

/** Resolve directory handle for a path under images (e.g. images/plants/slug or images/supplies/equipment-50001). */
async function getDirectoryHandleForPath(imagesFolderHandle, folderPath) {
    const relative = folderPath.replace(/^images\/?/, '');
    const parts = relative.split('/').filter(Boolean);
    let h = imagesFolderHandle;
    for (const p of parts) {
        h = await h.getDirectoryHandle(p, { create: true });
    }
    return h;
}

/**
 * Save one equipment image file to images/supplies/equipment-{id}/{number}.jpg.
 * Uses same folder handle as plants (images folder). Returns { success, fullPath }.
 */
async function saveSingleEquipmentImage(equipment, imageFile, folderName, number) {
    const imagesFolderHandle = getImagesFolderHandle();
    if (!imagesFolderHandle) return { success: false, fullPath: null };
    const ext = (imageFile.name && imageFile.name.toLowerCase().match(/\.(jpe?g|png|gif|webp)$/)) ? imageFile.name.match(/\.(jpe?g|png|gif|webp)$/i)[0].toLowerCase() : '.jpg';
    const filename = number + ext;
    const folderPath = 'images/supplies/' + folderName;
    const fullPath = folderPath + '/' + filename;
    try {
        const equipmentFolderHandle = await getDirectoryHandleForPath(imagesFolderHandle, folderPath);
        const fileHandle = await equipmentFolderHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(imageFile);
        await writable.close();
        return { success: true, fullPath: fullPath };
    } catch (err) {
        console.error('Error saving equipment image:', err);
        return { success: false, fullPath: null };
    }
}

/**
 * Save equipment image files to images/supplies/equipment-{id}/ (1.jpg, 2.jpg, ...).
 * Same flow as plants: prompt for folder if needed, write files, update equipment.images/imageUrl.
 */
async function saveEquipmentImageFilesToFolder(equipment, imageFiles) {
    if (!equipment || !imageFiles || imageFiles.length === 0) return { success: false, savedPaths: [] };
    const folderName = 'equipment-' + equipment.id;
    const folderPath = 'images/supplies/' + folderName;
    const existingNumbers = new Set();
    (equipment.images || []).forEach(function (path) {
        if (typeof path !== 'string' || (path.indexOf(folderPath + '/') !== 0 && path.indexOf('images/equipment-' + equipment.id + '/') !== 0)) return;
        const m = path.match(/\/(\d+)\.(jpg|jpeg|png|gif|webp)$/i);
        if (m) existingNumbers.add(parseInt(m[1], 10));
    });
    if (!getImagesFolderHandle() && 'showDirectoryPicker' in window) {
        try {
            const accessGranted = await ensureFolderAccess();
            if (!accessGranted) return { success: false, savedPaths: [] };
        } catch (e) {
            return { success: false, savedPaths: [] };
        }
    }
    const existingPaths = (equipment.images || []).filter(function (p) {
        return typeof p === 'string' && p.indexOf('data:') !== 0 && (p.indexOf('images/supplies/equipment-') === 0 || p.indexOf('images/equipment-') === 0);
    });
    let nextNumber = findNextAvailableNumber(existingNumbers);
    const savedPaths = [];
    for (let i = 0; i < imageFiles.length; i++) {
        const result = await saveSingleEquipmentImage(equipment, imageFiles[i], folderName, nextNumber);
        if (result.success && result.fullPath) {
            savedPaths.push(result.fullPath);
            nextNumber++;
        }
    }
    if (savedPaths.length === 0) return { success: false, savedPaths: [] };
    const allPaths = existingPaths.concat(savedPaths);
    equipment.images = allPaths;
    equipment.imageUrl = allPaths[0];
    try {
        localStorage.setItem('equipment_' + equipment.id + '_images', JSON.stringify(allPaths));
        localStorage.setItem('equipment_' + equipment.id + '_imageUrl', allPaths[0]);
        if (typeof window !== 'undefined' && typeof window.syncToRepo === 'function') window.syncToRepo();
    } catch (e) { /* ignore */ }
    return { success: true, savedPaths: allPaths };
}

/**
 * Save one vivarium image file to images/vivariums/vivarium-{id}/{number}.jpg.
 */
async function saveSingleVivariumImage(vivarium, imageFile, folderName, number) {
    const imagesFolderHandle = getImagesFolderHandle();
    if (!imagesFolderHandle) return { success: false, fullPath: null };
    const ext = (imageFile.name && imageFile.name.toLowerCase().match(/\.(jpe?g|png|gif|webp)$/)) ? imageFile.name.match(/\.(jpe?g|png|gif|webp)$/i)[0].toLowerCase() : '.jpg';
    const filename = number + ext;
    const folderPath = 'images/vivariums/' + folderName;
    const fullPath = folderPath + '/' + filename;
    try {
        const vivariumFolderHandle = await getDirectoryHandleForPath(imagesFolderHandle, folderPath);
        const fileHandle = await vivariumFolderHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(imageFile);
        await writable.close();
        return { success: true, fullPath: fullPath };
    } catch (err) {
        console.error('Error saving vivarium image:', err);
        return { success: false, fullPath: null };
    }
}

/**
 * Save vivarium image files to images/vivariums/vivarium-{id}/ (1.jpg, 2.jpg, ...).
 */
async function saveVivariumImageFilesToFolder(vivarium, imageFiles) {
    if (!vivarium || !imageFiles || imageFiles.length === 0) return { success: false, savedPaths: [] };
    const folderName = 'vivarium-' + vivarium.id;
    const folderPath = 'images/vivariums/' + folderName;
    const existingNumbers = new Set();
    (vivarium.images || []).forEach(function (path) {
        if (typeof path !== 'string' || (path.indexOf(folderPath + '/') !== 0 && path.indexOf('images/vivarium-' + vivarium.id + '/') !== 0)) return;
        const m = path.match(/\/(\d+)\.(jpg|jpeg|png|gif|webp)$/i);
        if (m) existingNumbers.add(parseInt(m[1], 10));
    });
    if (!getImagesFolderHandle() && 'showDirectoryPicker' in window) {
        try {
            const accessGranted = await ensureFolderAccess();
            if (!accessGranted) return { success: false, savedPaths: [] };
        } catch (e) {
            return { success: false, savedPaths: [] };
        }
    }
    const existingPaths = (vivarium.images || []).filter(function (p) {
        return typeof p === 'string' && p.indexOf('data:') !== 0 && (p.indexOf('images/vivariums/vivarium-') === 0 || p.indexOf('images/vivarium-') === 0);
    });
    let nextNumber = findNextAvailableNumber(existingNumbers);
    const savedPaths = [];
    for (let i = 0; i < imageFiles.length; i++) {
        const result = await saveSingleVivariumImage(vivarium, imageFiles[i], folderName, nextNumber);
        if (result.success && result.fullPath) {
            savedPaths.push(result.fullPath);
            nextNumber++;
        }
    }
    if (savedPaths.length === 0) return { success: false, savedPaths: [] };
    const allPaths = existingPaths.concat(savedPaths);
    vivarium.images = allPaths;
    vivarium.imageUrl = allPaths[0];
    try {
        localStorage.setItem('vivarium_' + vivarium.id + '_images', JSON.stringify(allPaths));
        localStorage.setItem('vivarium_' + vivarium.id + '_imageUrl', allPaths[0]);
    } catch (e) { /* ignore */ }
    return { success: true, savedPaths: allPaths };
}

async function saveImage() {
    const { saveImageBtn, folderStatus, uploadPlantDescription } = elements;
    const allPlants = getAllPlants();
    const plantModal = elements.plantModal;

    if (!currentUploadPlant) {
        console.error('❌ No plant selected. Please close and reopen the edit modal.');
        return;
    }

    // Always persist description and plant details from form
    if (uploadPlantDescription) {
        currentUploadPlant.description = uploadPlantDescription.value.trim() || '';
    }
    var careTipsEl = elements.uploadCareTips;
    if (careTipsEl) {
        currentUploadPlant.careTips = (careTipsEl.value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    readPlantDetailsFromForm();

    const imagesToSave = [];
    if (currentImageFiles.length > 0) {
        imagesToSave.push(...currentImageFiles);
    } else if (currentImageFile) {
        imagesToSave.push(currentImageFile);
    } else if (currentImageUrl) {
        imagesToSave.push(null);
    }

    if (imagesToSave.length === 0) {
        if (currentUploadPlant.id != null) {
            saveImageBtn.disabled = true;
            saveImageBtn.textContent = '💾 Saving...';
            try {
                if (window.inventoryDb && window.inventoryDb.setItem) {
                    window.inventoryDb.setItem(currentUploadPlant.id, {
                        name: currentUploadPlant.name,
                        scientificName: getScientificNameString(currentUploadPlant) || '',
                        price: currentUploadPlant.price,
                        costPrice: currentUploadPlant.costPrice,
                        quantityInStock: currentUploadPlant.stockQuantity != null ? currentUploadPlant.stockQuantity : 0,
                        reorderLevel: currentUploadPlant.reorderLevel,
                        unit: currentUploadPlant.unit
                    });
                }
                var useSupabase = window.supabaseDb && window.supabaseDb.isConfigured && window.supabaseDb.isConfigured() && window.supabaseDb.updatePlantInCatalog;
                if (useSupabase) {
                    var updatedPlant = Object.assign({}, currentUploadPlant);
                    await window.supabaseDb.updatePlantInCatalog(currentUploadPlant.id, updatedPlant);
                    saveImageBtn.textContent = '✅ Saved to Supabase';
                    if (folderStatus) {
                        folderStatus.textContent = '✅ Plant details saved to Supabase.';
                        folderStatus.style.color = 'var(--accent-color)';
                    }
                } else {
                    var didSave = await savePlantToJsonFile(currentUploadPlant);
                    saveImageBtn.textContent = didSave ? '✅ Details saved' : '✅ Details updated';
                    if (folderStatus) {
                        if (didSave) {
                            folderStatus.textContent = '✅ Plant details saved to file. Changes will persist after reload.';
                            folderStatus.style.color = 'var(--accent-color)';
                        } else {
                            folderStatus.textContent = '✅ Details updated in memory. To keep after reload: click "Select Folder" and choose your Terrarium_index project folder.';
                            folderStatus.style.color = 'var(--text-color)';
                        }
                    }
                }
            } catch (e) {
                saveImageBtn.textContent = '💾 Save';
                if (folderStatus) folderStatus.textContent = 'Could not save. ' + (e && e.message ? e.message : '');
            }
            renderPlants(getFilteredPlants());
            setTimeout(() => closeUploadModalFunc(), 1200);
            saveImageBtn.disabled = false;
        } else {
            console.warn('⚠️ Add a plant image or select an existing plant to edit.');
        }
        return;
    }

    if (saveImageBtn.disabled) {
        return;
    }

    saveImageBtn.disabled = true;

    let plantFolderName;
    let folderPath;

    const snStr = getScientificNameString(currentUploadPlant);
    if (snStr) {
        plantFolderName = scientificNameToSlug(snStr);
        if (plantFolderName) {
            folderPath = `images/plants/${plantFolderName}`;
        }
    }

    if (!plantFolderName && currentUploadPlant.name) {
        plantFolderName = String(currentUploadPlant.name).toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/'/g, '')
            .replace(/[^a-z0-9-]/g, '');
        folderPath = `images/plants/${plantFolderName}`;
    }

    if (!plantFolderName) {
        saveImageBtn.disabled = false;
        return;
    }

    saveImageBtn.textContent = '⏳ Scanning...';
    const { existingImages, existingNumbers } = await scanExistingImages(plantFolderName, currentUploadPlant);

    if (existingImages.length > 0) {
        currentUploadPlant.images = [...new Set([...existingImages, ...(currentUploadPlant.images || [])])];
    } else if (!currentUploadPlant.images) {
        currentUploadPlant.images = currentUploadPlant.imageUrl ? [currentUploadPlant.imageUrl] : [];
    }

    const totalImages = imagesToSave.length;
    let savedCount = 0;
    let failedCount = 0;
    let currentNumber = findNextAvailableNumber(existingNumbers);

    for (let imgIndex = 0; imgIndex < imagesToSave.length; imgIndex++) {
        const imageFile = imagesToSave[imgIndex];
        const isUrl = imageFile === null && currentImageUrl;

        try {
            saveImageBtn.textContent = `⏳ Saving ${imgIndex + 1}/${totalImages}...`;
            const result = await saveSingleImage(imageFile, isUrl, imgIndex, totalImages, plantFolderName, folderPath, currentNumber);
            if (result && result.success) {
                savedCount++;
                currentNumber = result.nextNumber;
            } else {
                failedCount++;
                currentNumber = result ? result.nextNumber : currentNumber + 1;
            }
        } catch (error) {
            failedCount++;
            currentNumber = currentNumber + 1;
        }
    }

    if (savedCount > 0) {
        saveImageBtn.textContent = `✅ Saved ${savedCount}/${totalImages}`;
        if (folderStatus) {
            folderStatus.textContent = `✅ ${savedCount} image(s) saved successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`;
            folderStatus.style.color = 'var(--accent-color)';
        }
        if (currentUploadPlant.id != null) {
            if (window.inventoryDb && window.inventoryDb.setItem) {
                window.inventoryDb.setItem(currentUploadPlant.id, {
                    name: currentUploadPlant.name,
                    scientificName: getScientificNameString(currentUploadPlant) || '',
                    price: currentUploadPlant.price,
                    costPrice: currentUploadPlant.costPrice,
                    quantityInStock: currentUploadPlant.stockQuantity != null ? currentUploadPlant.stockQuantity : 0,
                    reorderLevel: currentUploadPlant.reorderLevel,
                    unit: currentUploadPlant.unit
                });
            }
            savePlantToJsonFile(currentUploadPlant).catch(() => {});
        }
        renderPlants(getFilteredPlants());
        if (plantModal?.classList.contains('show')) {
            showPlantModal(currentUploadPlant);
        }

        setTimeout(() => {
            closeUploadModalFunc();
        }, 1500);
    } else {
        saveImageBtn.textContent = '💾 Save';
        if (folderStatus) {
            folderStatus.textContent = `❌ Failed to save ${totalImages} image(s)`;
            folderStatus.style.color = 'var(--text-light)';
        }
    }

    saveImageBtn.disabled = false;
}

async function saveSingleImage(imageFile, isUrl, imageIndex, totalImages, plantFolderName, folderPath, startNumber) {
    const { saveImageBtn, folderStatus, uploadModal } = elements;
    const allPlants = getAllPlants();

    if (!currentUploadPlant) {
        return { success: false, nextNumber: startNumber };
    }

    try {
        const nextNumber = startNumber;
        const filenameBase = plantFolderName.replace(/^\d{5}-/, '');
        const filename = `${filenameBase}-${nextNumber}.jpg`;
        const fullPath = `${folderPath}/${filename}`;

        if (imageIndex === 0 && totalImages === 1) {
            saveImageBtn.textContent = '💾 Saving...';
        }

        let imageBlob = null;
        if (isUrl && currentImageUrl) {
            const response = await fetch(currentImageUrl);
            imageBlob = await response.blob();
        } else if (imageFile) {
            imageBlob = imageFile;
        }

        if (!imageBlob) {
            return { success: false, nextNumber: startNumber + 1 };
        }

        if (imageIndex === 0 && !getImagesFolderHandle() && 'showDirectoryPicker' in window) {
            saveImageBtn.textContent = '⏳ Please select Terrarium_index folder...';
            if (folderStatus) {
                folderStatus.textContent = '📁 A folder picker dialog should appear. Please select your Terrarium_index folder.';
                folderStatus.style.color = 'var(--accent-color)';
            }

            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(resolve);
                });
            });

            const modalOverlay = uploadModal.querySelector('.modal-overlay') || uploadModal;
            const originalDisplay = modalOverlay.style.display;
            const originalZIndex = modalOverlay.style.zIndex;
            modalOverlay.style.display = 'none';
            modalOverlay.style.zIndex = '-1';

            try {
                const accessGranted = await ensureFolderAccess();
                modalOverlay.style.display = originalDisplay;
                modalOverlay.style.zIndex = originalZIndex;
                if (!accessGranted) {
                    return { success: false, nextNumber: startNumber };
                }
                if (folderStatus) {
                    folderStatus.textContent = '✅ Folder access granted! Saving images...';
                    folderStatus.style.color = 'var(--accent-color)';
                }
            } catch (err) {
                modalOverlay.style.display = originalDisplay;
                modalOverlay.style.zIndex = originalZIndex;
                return { success: false, nextNumber: startNumber };
            }
        }

        const imagesFolderHandle = getImagesFolderHandle();
        if (!imagesFolderHandle) {
            return { success: false, nextNumber: startNumber + 1 };
        }

        try {
            const plantFolderHandle = await getDirectoryHandleForPath(imagesFolderHandle, folderPath);
            const fileHandle = await plantFolderHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(imageBlob);
            await writable.close();

            if (!currentUploadPlant.images) {
                currentUploadPlant.images = [];
            }
            if (!currentUploadPlant.images.includes(fullPath)) {
                currentUploadPlant.images.push(fullPath);
            }
            if (imageIndex === 0 && !currentUploadPlant.imageUrl) {
                currentUploadPlant.imageUrl = fullPath;
            }

            try {
                currentUploadPlant.images = ensureUniqueImages(currentUploadPlant.images);
                localStorage.setItem(`plant_${currentUploadPlant.id}_images`, JSON.stringify(currentUploadPlant.images));
                if (currentUploadPlant.imageUrl) {
                    localStorage.setItem(`plant_${currentUploadPlant.id}_imageUrl`, currentUploadPlant.imageUrl);
                }
                if (typeof window !== 'undefined' && typeof window.syncToRepo === 'function') window.syncToRepo();
            } catch (e) {
                console.log('Could not save to localStorage:', e);
            }

            const currentPlantIndex = allPlants.findIndex(p => p.id === currentUploadPlant.id);
            if (currentPlantIndex >= 0) {
                allPlants[currentPlantIndex] = { ...currentUploadPlant };
            }

            if (imageIndex === 0 && plantFolderHandle) {
                try {
                    await generateThumbnailFromBlob(imageBlob, plantFolderHandle, plantFolderName);
                } catch (thumbError) {
                    console.warn('⚠️ Could not generate thumbnail:', thumbError.message);
                }
            }

            return { success: true, nextNumber: nextNumber + 1 };
        } catch (err) {
            console.error('❌ Error saving to folder:', err);
            return { success: false, nextNumber: startNumber + 1 };
        }
    } catch (error) {
        return { success: false, nextNumber: startNumber + 1 };
    }
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

window.uploadUtils = {
    init,
    setupUploadListeners,
    selectImagesFolder,
    checkStoredFolder,
    ensureFolderAccess,
    openImageUpload,
    updateUploadGallery,
    removeImageFromUploadGallery,
    updateDragDropGallery,
    clearDragDropGallery,
    closeUploadModalFunc,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    loadImageFromUrl,
    saveImage,
    saveSingleImage,
    savePlantImageFilesToFolder,
    saveEquipmentImageFilesToFolder,
    saveVivariumImageFilesToFolder,
    fileToDataUrl,
    blobToDataUrl
};
})();

