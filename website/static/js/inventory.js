// ============================================================================
// inventory.js - Inventory Management Tab with Keyboard Selection
// ============================================================================

// State management for location counters
let locationCounters = {};

// Current location components
let currentGenre = '';
let currentMainLocation = 'Bin';
let currentMainNumber = '1';
let currentCustomLocation = '';
let currentSublocation = '';
let currentCounter = 1;

// Available genres
let availableGenres = [];

// DOM Elements
let barcodeInput = null;
let genreSelect = null;
let mainLocationType = null;
let mainLocationNumber = null;
let customLocationInput = null;
let sublocationSelect = null;
let counterDisplay = null;
let scanResultDiv = null;
let locationPreview = null;
let addGenreInput = null;
let addGenreBtn = null;

// Audio context
let audioContext = null;

// Scanner state
let modalElement = null;
let currentModalRecords = [];
let isModalActive = false;
let modalKeyHandler = null;

// Sublocation display names
const SUBLOCATION_NAMES = {
    'LT': 'Left Top',
    'RT': 'Right Top',
    'LB': 'Left Bottom',
    'RB': 'Right Bottom'
};

const SUBLOCATION_ICONS = {
    'LT': '↖️',
    'RT': '↗️',
    'LB': '↙️',
    'RB': '↘️'
};

// ============================================================================
// Helper Functions
// ============================================================================

function getMainLocationString() {
    if (mainLocationType && mainLocationType.value === 'Custom') {
        return customLocationInput ? customLocationInput.value.trim() : '';
    }
    const locationType = mainLocationType ? mainLocationType.value : 'Bin';
    const number = mainLocationNumber ? mainLocationNumber.value.trim() : '1';
    return `${locationType} ${number}`;
}

function buildLocationString() {
    const parts = [];
    
    if (currentGenre && currentGenre !== '') {
        parts.push(currentGenre);
    }
    
    const mainLocation = getMainLocationString();
    if (mainLocation) {
        parts.push(mainLocation);
    }
    
    if (currentSublocation && SUBLOCATION_NAMES[currentSublocation]) {
        parts.push(`${SUBLOCATION_ICONS[currentSublocation]} ${SUBLOCATION_NAMES[currentSublocation]}`);
    }
    
    parts.push(String(currentCounter));
    
    return parts.join(' | ');
}

function updateLocationPreview() {
    if (locationPreview) {
        const previewString = buildLocationString();
        locationPreview.textContent = previewString || '--';
    }
}

function getTargetArtistLetter() {
    const mainLocation = getMainLocationString().toLowerCase();
    const letterMatch = mainLocation.match(/\b([a-z])\b/);
    if (letterMatch) {
        return letterMatch[1].toUpperCase();
    }
    return null;
}

function getArtistSortKey(artistName) {
    if (!artistName) return '';
    
    let name = artistName.trim();
    name = name.replace(/^the\s+/i, '');
    
    const numberMap = {
        '10,000': 'ten thousand',
        '10000': 'ten thousand',
        '1000': 'one thousand',
        '100': 'one hundred'
    };
    
    const numberMatch = name.match(/^(\d{1,5}(?:,\d{3})?)\s+/);
    if (numberMatch) {
        const numberStr = numberMatch[1];
        if (numberMap[numberStr]) {
            name = numberMap[numberStr] + ' ' + name.substring(numberMatch[0].length);
        }
    }
    
    return name.charAt(0).toUpperCase();
}

// ============================================================================
// Audio Functions
// ============================================================================

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playBeep(frequency = 800, duration = 200, type = 'sine') {
    try {
        initAudio();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + duration / 1000);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (error) {
        console.warn('Could not play beep:', error);
    }
}

// ============================================================================
// Counter Management
// ============================================================================

function getCurrentCounter() {
    return currentCounter;
}

function incrementCounter() {
    currentCounter++;
    if (counterDisplay) {
        counterDisplay.textContent = currentCounter;
    }
    updateLocationPreview();
}

function resetCounter() {
    currentCounter = 1;
    if (counterDisplay) {
        counterDisplay.textContent = currentCounter;
    }
    updateLocationPreview();
    showScanResult(`Counter reset to 1`, 'info');
    if (barcodeInput) barcodeInput.focus();
}

// ============================================================================
// Genre Management
// ============================================================================

async function loadGenres() {
    console.log('📀 Loading genres from API...');
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/genres`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load genres: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            availableGenres = data.genres || [];
            console.log(`📀 Loaded ${availableGenres.length} genres`);
            renderGenreSelect();
        } else {
            throw new Error(data.error || 'Failed to load genres');
        }
    } catch (error) {
        console.error('Error loading genres:', error);
        availableGenres = [];
        renderGenreSelect();
        showScanResult(`Warning: Could not load genres - ${error.message}`, 'warning');
    }
}

function renderGenreSelect() {
    if (!genreSelect) return;
    
    const currentValue = genreSelect.value;
    genreSelect.innerHTML = '<option value="">-- No Genre --</option>';
    
    availableGenres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        if (currentValue === genre) {
            option.selected = true;
        }
        genreSelect.appendChild(option);
    });
}

function onGenreChange() {
    currentGenre = genreSelect ? genreSelect.value : '';
    console.log(`🎵 Genre changed to: "${currentGenre}"`);
    updateLocationPreview();
}

async function addCustomGenre() {
    const genreName = addGenreInput ? addGenreInput.value.trim() : '';
    if (!genreName) {
        showScanResult('Please enter a genre name', 'warning');
        return;
    }
    
    const formattedName = genreName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    
    if (availableGenres.includes(formattedName)) {
        showScanResult(`Genre "${formattedName}" already exists`, 'warning');
        if (genreSelect) {
            genreSelect.value = formattedName;
            currentGenre = formattedName;
            updateLocationPreview();
        }
        return;
    }
    
    availableGenres.push(formattedName);
    availableGenres.sort();
    renderGenreSelect();
    
    if (genreSelect) {
        genreSelect.value = formattedName;
        currentGenre = formattedName;
    }
    
    if (addGenreInput) addGenreInput.value = '';
    
    updateLocationPreview();
    showScanResult(`✅ Genre "${formattedName}" added`, 'success');
}

// ============================================================================
// Location Type Handlers
// ============================================================================

function onMainLocationTypeChange() {
    const isCustom = mainLocationType && mainLocationType.value === 'Custom';
    if (customLocationInput) {
        customLocationInput.style.display = isCustom ? 'block' : 'none';
    }
    if (mainLocationNumber) {
        mainLocationNumber.style.display = isCustom ? 'none' : 'block';
    }
    updateLocationPreview();
}

function onMainLocationNumberChange() {
    updateLocationPreview();
}

function onCustomLocationChange() {
    updateLocationPreview();
}

function onSublocationChange() {
    currentSublocation = sublocationSelect ? sublocationSelect.value : '';
    updateLocationPreview();
}

// ============================================================================
// Duplicate Record Modal Functions
// ============================================================================

function closeDuplicateRecordModal() {
    // Remove keyboard handler
    if (modalKeyHandler) {
        document.removeEventListener('keydown', modalKeyHandler);
        modalKeyHandler = null;
    }
    
    if (modalElement) {
        modalElement.style.display = 'none';
    }
    
    isModalActive = false;
    currentModalRecords = [];
    
    if (barcodeInput) {
        barcodeInput.disabled = false;
        barcodeInput.focus();
    }
}

function showDuplicateRecordModal(records, originalBarcode) {
    modalElement = document.getElementById('duplicate-record-modal');
    if (!modalElement) {
        console.error('Duplicate record modal not found!');
        return;
    }
    
    // Remove any existing keyboard handler
    if (modalKeyHandler) {
        document.removeEventListener('keydown', modalKeyHandler);
        modalKeyHandler = null;
    }
    
    isModalActive = true;
    currentModalRecords = records;
    
    const targetLetter = getTargetArtistLetter();
    console.log('Target letter for suggestions:', targetLetter);
    
    // Split records into active and non-active
    const activeRecords = records.filter(r => r.status_id === 2);
    const nonActiveRecords = records.filter(r => r.status_id !== 2);
    
    // Sort active records by artist letter matching target
    const sortedActiveRecords = [...activeRecords].sort((a, b) => {
        const aLetter = getArtistSortKey(a.artist);
        const bLetter = getArtistSortKey(b.artist);
        
        if (targetLetter) {
            const aMatches = aLetter === targetLetter;
            const bMatches = bLetter === targetLetter;
            if (aMatches && !bMatches) return -1;
            if (bMatches && !aMatches) return 1;
        }
        
        return aLetter.localeCompare(bLetter);
    });
    
    const sortedNonActiveRecords = [...nonActiveRecords].sort((a, b) => {
        const aLetter = getArtistSortKey(a.artist);
        const bLetter = getArtistSortKey(b.artist);
        return aLetter.localeCompare(bLetter);
    });
    
    const sortedRecords = [...sortedActiveRecords, ...sortedNonActiveRecords];
    const suggestedRecord = sortedActiveRecords.length > 0 ? sortedActiveRecords[0] : null;
    
    const barcodeDisplay = document.getElementById('dup-barcode-display');
    const countDisplay = document.getElementById('dup-count-display');
    
    if (barcodeDisplay) barcodeDisplay.textContent = originalBarcode;
    if (countDisplay) countDisplay.textContent = records.length;
    
    const listContainer = document.getElementById('duplicate-records-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    // Add instruction banner with keyboard shortcuts
    const instructionBanner = document.createElement('div');
    instructionBanner.style.cssText = `
        margin-bottom: 15px;
        padding: 12px;
        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
        border-radius: 8px;
        text-align: center;
        color: white;
        font-weight: bold;
    `;
    instructionBanner.innerHTML = `
        <i class="fas fa-keyboard"></i> 
        <strong>Press 1, 2, or 3 on your keyboard</strong> to select the corresponding record
        <br><small>Or click the image with your mouse</small>
    `;
    listContainer.appendChild(instructionBanner);
    
    // Create card grid
    const gridContainer = document.createElement('div');
    gridContainer.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 15px;
        margin-top: 10px;
        max-height: 450px;
        overflow-y: auto;
        padding: 5px;
    `;
    
    sortedRecords.forEach((record, idx) => {
        const isActive = record.status_id === 2;
        const artistSortKey = getArtistSortKey(record.artist);
        const recordNumber = idx + 1;
        
        // Get image URL safely
        let imageUrl = null;
        if (record.image_url && record.image_url !== '' && record.image_url !== 'None') {
            imageUrl = record.image_url;
        }
        
        const card = document.createElement('div');
        card.className = 'record-selection-card';
        card.setAttribute('data-record-id', record.id);
        card.setAttribute('data-record-number', recordNumber);
        card.style.cssText = `
            background: white;
            border: 2px solid ${suggestedRecord && suggestedRecord.id === record.id ? '#2196f3' : '#ddd'};
            border-radius: 10px;
            padding: 12px;
            transition: all 0.2s ease;
            cursor: pointer;
            ${!isActive ? 'opacity: 0.6;' : ''}
        `;
        
        // Click handler for mouse
        card.onclick = () => {
            console.log(`Clicked record ${record.id}`);
            processSelectedRecord(record, originalBarcode).then(() => {
                closeDuplicateRecordModal();
            }).catch(error => {
                console.error('Error processing record:', error);
                showScanResult(`❌ Error: ${error.message}`, 'error');
            });
        };
        
        // Hover effect
        card.onmouseenter = () => {
            card.style.borderColor = '#999';
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
        };
        card.onmouseleave = () => {
            card.style.borderColor = suggestedRecord && suggestedRecord.id === record.id ? '#2196f3' : '#ddd';
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = 'none';
        };
        
        // Number badge
        const numberBadge = document.createElement('div');
        numberBadge.style.cssText = `
            position: absolute;
            top: -8px;
            left: -8px;
            background: ${suggestedRecord && suggestedRecord.id === record.id ? '#2196f3' : '#6c757d'};
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 16px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        numberBadge.textContent = recordNumber;
        card.style.position = 'relative';
        card.appendChild(numberBadge);
        
        // Suggested badge
        if (suggestedRecord && suggestedRecord.id === record.id) {
            const suggestBadge = document.createElement('div');
            suggestBadge.style.cssText = `
                position: absolute;
                top: -8px;
                right: -8px;
                background: #ffc107;
                color: #333;
                padding: 4px 8px;
                border-radius: 20px;
                font-size: 10px;
                font-weight: bold;
            `;
            suggestBadge.innerHTML = '⭐ SUGGESTED';
            card.appendChild(suggestBadge);
        }
        
        // Image section
        if (imageUrl) {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = `${record.artist || 'Unknown'} - ${record.title || 'Unknown'}`;
            img.style.cssText = `
                width: 100%;
                height: 160px;
                object-fit: cover;
                border-radius: 6px;
                background: #f0f0f0;
                margin-bottom: 10px;
            `;
            img.onerror = () => {
                img.style.display = 'none';
                const noImg = document.createElement('div');
                noImg.style.cssText = `
                    width: 100%;
                    height: 160px;
                    background: #f0f0f0;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 10px;
                    color: #999;
                `;
                noImg.innerHTML = '<i class="fas fa-record-vinyl" style="font-size: 50px;"></i>';
                card.insertBefore(noImg, img);
                img.remove();
            };
            card.appendChild(img);
        } else {
            const noImg = document.createElement('div');
            noImg.style.cssText = `
                width: 100%;
                height: 160px;
                background: #f0f0f0;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 10px;
                color: #999;
            `;
            noImg.innerHTML = '<i class="fas fa-record-vinyl" style="font-size: 50px;"></i>';
            card.appendChild(noImg);
        }
        
        // Title
        const title = document.createElement('div');
        title.style.cssText = `
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 5px;
            color: #333;
            line-height: 1.3;
        `;
        title.textContent = `${record.artist || 'Unknown'} - ${(record.title || 'Unknown').substring(0, 45)}${(record.title || '').length > 45 ? '...' : ''}`;
        card.appendChild(title);
        
        // Details
        const details = document.createElement('div');
        details.style.cssText = `
            font-size: 11px;
            color: #666;
            margin-top: 5px;
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
        `;
        
        let statusText = '';
        if (record.status_id === 1) statusText = '📋 New';
        else if (record.status_id === 2) statusText = '✅ Active';
        else if (record.status_id === 3) statusText = '💰 Sold';
        else statusText = '❓ Unknown';
        
        details.innerHTML = `
            <span>ID: #${record.id}</span>
            <span>${statusText}</span>
            <span>${record.store_price ? `$${parseFloat(record.store_price).toFixed(2)}` : 'Price N/A'}</span>
            <span>Section: ${artistSortKey}</span>
        `;
        card.appendChild(details);
        
        // Keyboard shortcut hint
        const kbHint = document.createElement('div');
        kbHint.style.cssText = `
            margin-top: 10px;
            background: #f8f9fa;
            padding: 5px;
            border-radius: 6px;
            font-size: 11px;
            text-align: center;
            color: #666;
        `;
        kbHint.innerHTML = `<i class="fas fa-keyboard"></i> Press <strong>${recordNumber}</strong> on keyboard`;
        card.appendChild(kbHint);
        
        gridContainer.appendChild(card);
    });
    
    listContainer.appendChild(gridContainer);
    
    // Footer instruction
    const footerInstruction = document.createElement('div');
    footerInstruction.style.cssText = `
        margin-top: 15px;
        padding: 10px;
        background: #f8f9fa;
        border-radius: 8px;
        text-align: center;
        font-size: 12px;
        color: #666;
        border-left: 3px solid #ffc107;
    `;
    footerInstruction.innerHTML = `
        <i class="fas fa-info-circle"></i> 
        <strong>Press the number key (1-${sortedRecords.length})</strong> or click the image to select
    `;
    listContainer.appendChild(footerInstruction);
    
    // Show modal
    modalElement.style.display = 'flex';
    
    // Add keyboard handler
    modalKeyHandler = (e) => {
        // Only handle if modal is active
        if (!isModalActive) return;
        
        const key = parseInt(e.key);
        if (!isNaN(key) && key >= 1 && key <= sortedRecords.length) {
            e.preventDefault();
            const selectedRecord = sortedRecords[key - 1];
            if (selectedRecord) {
                console.log(`Key ${key} pressed, selecting record ${selectedRecord.id}`);
                // Play selection sound
                playBeep(600, 100, 'sine');
                // Process the record
                processSelectedRecord(selectedRecord, originalBarcode).then(() => {
                    closeDuplicateRecordModal();
                }).catch(error => {
                    console.error('Error processing record:', error);
                    showScanResult(`❌ Error: ${error.message}`, 'error');
                });
            }
        }
    };
    
    document.addEventListener('keydown', modalKeyHandler);
    
    // Keep barcode input focused for scanning
    if (barcodeInput) {
        barcodeInput.disabled = false;
        setTimeout(() => {
            barcodeInput.focus();
        }, 100);
    }
    
    playBeep(1000, 400, 'sine');
}

// ============================================================================
// Scan Processing
// ============================================================================

async function processScan(barcode, fromQueue = false) {
    console.log(`Processing scan: ${barcode}, modalActive: ${isModalActive}`);
    
    // If modal is active, don't process new scans - keyboard shortcuts only
    if (isModalActive) {
        playBeep(600, 150, 'sine');
        showScanResult(`⚠️ Multiple records found. Press 1, 2, or 3 on keyboard to select the correct record.`, 'warning');
        if (barcodeInput) barcodeInput.value = '';
        return;
    }
    
    if (barcodeInput) barcodeInput.value = '';
    showScanResult(`Scanning barcode: ${barcode}...`, 'info');
    
    try {
        const searchResponse = await fetch(`${AppConfig.baseUrl}/records/search?q=${encodeURIComponent(barcode)}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            }
        });
        
        if (!searchResponse.ok) {
            throw new Error(`Search failed: ${searchResponse.status}`);
        }
        
        const searchData = await searchResponse.json();
        
        if (searchData.status !== 'success') {
            throw new Error(searchData.error || 'Search failed');
        }
        
        const records = searchData.records || [];
        const exactMatches = records.filter(r => r.barcode && String(r.barcode).trim() === barcode);
        
        if (exactMatches.length === 0) {
            playBeep(400, 500, 'sawtooth');
            throw new Error(`No record found with barcode: ${barcode}`);
        }
        
        if (exactMatches.length > 1) {
            playBeep(1000, 400, 'sine');
            showScanResult(`⚠️ ${exactMatches.length} records found. Press 1-${Math.min(exactMatches.length, 9)} on keyboard to select.`, 'warning');
            
            showDuplicateRecordModal(exactMatches, barcode);
            return;
        }
        
        await processSelectedRecord(exactMatches[0], barcode);
        
    } catch (error) {
        console.error('Scan error:', error);
        playBeep(400, 500, 'sawtooth');
        showScanResult(`❌ Error: ${error.message}`, 'error');
        
        setTimeout(() => {
            if (barcodeInput) barcodeInput.focus();
        }, 100);
    }
}

async function processSelectedRecord(record, barcode) {
    console.log(`Processing record #${record.id}: "${record.artist} - ${record.title}"`);
    
    if (record.status_id === 3) {
        playBeep(400, 500, 'sawtooth');
        showScanResult(`⚠️ Record #${record.id} is already SOLD. Cannot update location.`, 'warning');
        setTimeout(() => {
            if (barcodeInput) barcodeInput.focus();
        }, 100);
        return;
    }
    
    const locationString = buildLocationString();
    const todayDate = new Date().toISOString().split('T')[0];
    
    console.log(`Updating record #${record.id}: location="${locationString}", last_seen="${todayDate}"`);
    
    const updateResponse = await fetch(`${AppConfig.baseUrl}/records/${record.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            location: locationString,
            last_seen: todayDate
        })
    });
    
    if (!updateResponse.ok) {
        let errorMessage = `Update failed: ${updateResponse.status}`;
        try {
            const errorData = await updateResponse.json();
            if (errorData.error) errorMessage = errorData.error;
        } catch(e) {}
        throw new Error(errorMessage);
    }
    
    const updateData = await updateResponse.json();
    
    if (updateData.status !== 'success') {
        throw new Error(updateData.error || 'Update failed');
    }
    
    incrementCounter();
    playBeep(880, 100, 'sine');
    setTimeout(() => playBeep(440, 100, 'sine'), 100);
    
    const artist = record.artist || 'Unknown';
    const title = record.title || 'Unknown';
    showScanResult(
        `✅ Record #${record.id}: "${artist} - ${title}"\n   → Location: ${locationString}\n   → Last seen: ${todayDate}`,
        'success'
    );
    
    setTimeout(() => {
        if (barcodeInput) barcodeInput.focus();
    }, 100);
}

// ============================================================================
// UI Helpers
// ============================================================================

function showScanResult(message, type = 'info') {
    if (!scanResultDiv) return;
    
    scanResultDiv.style.display = 'block';
    scanResultDiv.innerHTML = message.replace(/\n/g, '<br>');
    scanResultDiv.style.color = '#000000';
    
    const colors = {
        success: 'rgba(40, 167, 69, 0.2)',
        error: 'rgba(220, 53, 69, 0.2)',
        warning: 'rgba(255, 193, 7, 0.2)',
        info: 'rgba(23, 162, 184, 0.2)'
    };
    scanResultDiv.style.backgroundColor = colors[type] || colors.info;
    scanResultDiv.style.borderLeft = `4px solid ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8'}`;
    
    if (type !== 'error') {
        setTimeout(() => {
            if (scanResultDiv && scanResultDiv.style.display === 'block') {
                scanResultDiv.style.display = 'none';
            }
        }, 5000);
    }
}

// ============================================================================
// Initialization
// ============================================================================

function initInventoryTab() {
    console.log('📦 Initializing Inventory Tab...');
    
    barcodeInput = document.getElementById('inventory-barcode-input');
    genreSelect = document.getElementById('genre-select');
    mainLocationType = document.getElementById('main-location-type');
    mainLocationNumber = document.getElementById('main-location-number');
    customLocationInput = document.getElementById('custom-location-input');
    sublocationSelect = document.getElementById('sublocation');
    counterDisplay = document.getElementById('counter-display');
    scanResultDiv = document.getElementById('scan-result');
    locationPreview = document.getElementById('location-preview');
    addGenreInput = document.getElementById('add-genre-input');
    addGenreBtn = document.getElementById('add-genre-btn');
    modalElement = document.getElementById('duplicate-record-modal');
    
    if (!barcodeInput) {
        console.error('Inventory tab elements not found');
        return;
    }
    
    loadGenres();
    
    currentCounter = 1;
    if (counterDisplay) counterDisplay.textContent = currentCounter;
    
    if (genreSelect) genreSelect.addEventListener('change', onGenreChange);
    if (mainLocationType) mainLocationType.addEventListener('change', onMainLocationTypeChange);
    if (mainLocationNumber) mainLocationNumber.addEventListener('input', onMainLocationNumberChange);
    if (customLocationInput) customLocationInput.addEventListener('input', onCustomLocationChange);
    if (sublocationSelect) sublocationSelect.addEventListener('change', onSublocationChange);
    if (addGenreBtn) addGenreBtn.addEventListener('click', addCustomGenre);
    if (addGenreInput) addGenreInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCustomGenre();
    });
    
    if (barcodeInput) {
        barcodeInput.addEventListener('keypress', onBarcodeEnter);
    }
    
    onMainLocationTypeChange();
    updateLocationPreview();
    
    // Reset modal state
    isModalActive = false;
    currentModalRecords = [];
    
    barcodeInput.focus();
    
    console.log('✅ Inventory Tab initialized');
}

function onBarcodeEnter(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const barcode = barcodeInput.value.trim();
        if (barcode) {
            processScan(barcode);
        }
    }
}

// ============================================================================
// Expose Global Functions
// ============================================================================

window.initInventoryTab = initInventoryTab;
window.resetCounter = resetCounter;
window.closeDuplicateRecordModal = closeDuplicateRecordModal;

// ============================================================================
// Tab Activation
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'inventory') {
        // Close modal if open
        if (modalKeyHandler) {
            document.removeEventListener('keydown', modalKeyHandler);
            modalKeyHandler = null;
        }
        isModalActive = false;
        currentModalRecords = [];
        if (modalElement) {
            modalElement.style.display = 'none';
        }
        setTimeout(initInventoryTab, 100);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const inventoryTab = document.querySelector('.tab[data-tab="inventory"]');
    if (inventoryTab && inventoryTab.classList.contains('active')) {
        setTimeout(initInventoryTab, 200);
    }
});

console.log('✅ inventory.js loaded with keyboard selection (1, 2, 3 keys)');