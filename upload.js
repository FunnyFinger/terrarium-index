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

let currentUploadPlant = null;
let currentImageFile = null;
let currentImageFiles = [];
let currentImageUrl = null;

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
    uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) closeUploadModalFunc();
    });

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

    const modalClickHandler = (e) => {
        if (e.target === uploadModal) {
            e.stopPropagation();
            e.preventDefault();
        }
    };

    uploadModal?.removeEventListener('click', closeUploadModalFunc);
    uploadModal?.addEventListener('click', modalClickHandler, { once: true });

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
            folderStatus.textContent = '✅ Folder access granted! Images will save automatically to images/[plant-folder]/';
            folderStatus.style.color = 'var(--accent-color)';
        }
        if (selectFolderBtn) {
            selectFolderBtn.textContent = '✅ Folder Selected';
            selectFolderBtn.style.display = 'none';
            selectFolderBtn.disabled = false;
        }

        uploadModal?.addEventListener('click', (e) => {
            if (e.target === uploadModal) closeUploadModalFunc();
        });
    } catch (err) {
        if (selectFolderBtn) {
            selectFolderBtn.disabled = false;
            selectFolderBtn.textContent = '📁 Select Folder (One-time Setup)';
        }
        uploadModal?.addEventListener('click', (e) => {
            if (e.target === uploadModal) closeUploadModalFunc();
        });

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
        saveImageBtn,
        folderStatus,
        selectFolderBtn,
        fileInput,
        imageUrlInput
    } = elements;

    const allPlants = getAllPlants();
    currentUploadPlant = allPlants.find(p => p.id === plantId);
    if (!currentUploadPlant) return;

    const scientificName = currentUploadPlant.scientificName || currentUploadPlant.name;
    const escapedName = scientificName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    uploadPlantName.innerHTML = `Uploading image for: <span class="scientific-name-tag" onclick="copyScientificNameToClipboard('${escapedName}', this)" title="Click to copy scientific name" style="cursor: pointer; color: var(--primary-color); text-decoration: underline; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: rgba(74, 144, 226, 0.1); transition: all 0.2s; display: inline-block;">${scientificName}</span>`;

    uploadModal.classList.remove('hidden');
    uploadModal.classList.add('show');
    saveImageBtn.textContent = '💾 Save Image';
    saveImageBtn.disabled = false;

    document.addEventListener('paste', handlePaste);

    if (!getImagesFolderHandle() && 'showDirectoryPicker' in window) {
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

    if (!getImagesFolderHandle() && 'showDirectoryPicker' in window) {
        selectFolderBtn.style.display = 'inline-block';
        selectFolderBtn.textContent = '📁 Select Folder (One-time Setup)';
    } else {
        selectFolderBtn.style.display = 'none';
    }

    if (folderStatus) {
        if (getImagesFolderHandle()) {
            folderStatus.textContent = '✅ Images folder ready - files will save automatically!';
            folderStatus.style.color = 'var(--accent-color)';
        } else if ('showDirectoryPicker' in window) {
            folderStatus.textContent = '💡 Click "📁 Select Folder" button above to set up folder access (one-time setup).';
            folderStatus.style.color = 'var(--text-light)';
        } else {
            folderStatus.textContent = '💡 Browser does not support automatic folder saving. Please use Chrome or Edge.';
            folderStatus.style.color = 'var(--text-light)';
        }
    }

    currentImageFile = null;
    currentImageFiles = [];
    currentImageUrl = null;
    fileInput.value = '';
    imageUrlInput.value = '';
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
    const { uploadModal, saveImageBtn } = elements;
    if (!uploadModal) return;

    uploadModal.classList.remove('show');
    uploadModal.classList.add('hidden');
    saveImageBtn.textContent = '💾 Save Image';
    saveImageBtn.disabled = false;
    document.removeEventListener('paste', handlePaste);

    setTimeout(() => {
        currentUploadPlant = null;
        currentImageFile = null;
        currentImageFiles = [];
        currentImageUrl = null;
    }, 100);
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

    e.preventDefault();
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

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

async function saveImage() {
    const { saveImageBtn, folderStatus } = elements;
    const allPlants = getAllPlants();
    const plantModal = elements.plantModal;

    if (!currentUploadPlant) {
        console.error('❌ No plant selected. Please close and reopen the upload modal.');
        return;
    }

    const imagesToSave = [];
    if (currentImageFiles.length > 0) {
        imagesToSave.push(...currentImageFiles);
    } else if (currentImageFile) {
        imagesToSave.push(currentImageFile);
    } else if (currentImageUrl) {
        imagesToSave.push(null);
    }

    if (imagesToSave.length === 0) {
        console.warn('⚠️ Please select an image file, provide a URL, or drag and drop an image first.');
        return;
    }

    if (saveImageBtn.disabled) {
        return;
    }

    saveImageBtn.disabled = true;

    let plantFolderName;
    let folderPath;

    if (currentUploadPlant.scientificName) {
        plantFolderName = scientificNameToSlug(currentUploadPlant.scientificName);
        if (plantFolderName) {
            folderPath = `images/${plantFolderName}`;
        }
    }

    if (!plantFolderName) {
        plantFolderName = currentUploadPlant.name.toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/'/g, '')
            .replace(/[^a-z0-9-]/g, '');
        folderPath = `images/${plantFolderName}`;
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

        renderPlants(getFilteredPlants());
        if (plantModal?.classList.contains('show')) {
            showPlantModal(currentUploadPlant);
        }

        setTimeout(() => {
            closeUploadModalFunc();
        }, 1500);
    } else {
        saveImageBtn.textContent = '💾 Save Image';
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
            const plantFolderHandle = await imagesFolderHandle.getDirectoryHandle(plantFolderName, { create: true });
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
    fileToDataUrl,
    blobToDataUrl
};
})();

