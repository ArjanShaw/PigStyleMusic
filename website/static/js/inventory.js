// ============================================================================
// inventory.js - Inventory Management Tab with Table Layout
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
let pendingAmbiguousScans = [];
let scannerBlocked = false;
let pendingResolveFunction = null;
let currentModalBarcode = null;

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

/**
 * Gets the main location string based on selected type
 */
function getMainLocationString() {
    if (mainLocationType && mainLocationType.value === 'Custom') {
        return customLocationInput ? customLocationInput.value.trim() : '';
    }
    const locationType = mainLocationType ? mainLocationType.value : 'Bin';
    const number = mainLocationNumber ? mainLocationNumber.value.trim() : '1';
    return `${locationType} ${number}`;
}

/**
 * Gets the full location string based on current settings
 * Format: "Genre | Main Location | Sublocation | Counter"
 */
function buildLocationString() {
    const parts = [];
    
    // Add genre if selected
    if (currentGenre) {
        parts.push(currentGenre);
    }
    
    // Add main location
    const mainLocation = getMainLocationString();
    if (mainLocation) {
        parts.push(mainLocation);
    }
    
    // Add sublocation if selected
    if (currentSublocation && SUBLOCATION_NAMES[currentSublocation]) {
        parts.push(`${SUBLOCATION_ICONS[currentSublocation]} ${SUBLOCATION_NAMES[currentSublocation]}`);
    }
    
    // Add counter
    parts.push(String(currentCounter));
    
    return parts.join(' | ');
}

/**
 * Updates the location preview display
 */
function updateLocationPreview() {
    if (locationPreview) {
        const previewString = buildLocationString();
        locationPreview.textContent = previewString || '--';
    }
}

/**
 * Gets the target letter for suggestions from main location
 */
function getTargetArtistLetter() {
    const mainLocation = getMainLocationString().toLowerCase();
    
    // Check for letter in main location (e.g., "Bin 2 J", "Display A")
    const letterMatch = mainLocation.match(/\b([a-z])\b/);
    if (letterMatch) {
        return letterMatch[1].toUpperCase();
    }
    
    return null;
}

/**
 * Extracts the significant letter for alphabetical sorting
 */
function getArtistSortKey(artistName) {
    if (!artistName) return '';
    
    let name = artistName.trim();
    name = name.replace(/^the\s+/i, '');
    
    const numberMap = {
        '10,000': 'ten thousand',
        '10000': 'ten thousand',
        '1000': 'one thousand',
        '100': 'one hundred',
        '20': 'twenty',
        '30': 'thirty',
        '40': 'forty',
        '50': 'fifty',
        '60': 'sixty',
        '70': 'seventy',
        '80': 'eighty',
        '90': 'ninety'
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

window.closeDuplicateRecordModal = function(isCancel = true) {
    const modal = document.getElementById('duplicate-record-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    if (pendingResolveFunction) {
        if (isCancel) {
            pendingResolveFunction(null);
            showScanResult(`❌ Scan cancelled for barcode: ${currentModalBarcode}`, 'warning');
        }
        pendingResolveFunction = null;
        currentModalBarcode = null;
    }
    
    scannerBlocked = false;
    
    setTimeout(() => {
        processAmbiguousScanQueue();
    }, 100);
    
    if (barcodeInput) barcodeInput.focus();
};

function showDuplicateRecordModal(records, barcode, resolveFn) {
    const modal = document.getElementById('duplicate-record-modal');
    if (!modal) {
        console.error('Duplicate record modal not found!');
        resolveFn(null);
        return;
    }
    
    pendingResolveFunction = resolveFn;
    currentModalBarcode = barcode;
    
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
    
    const barcodeDisplay = document.getElementById('dup-barcode-display');
    const countDisplay = document.getElementById('dup-count-display');
    
    if (barcodeDisplay) barcodeDisplay.textContent = barcode;
    if (countDisplay) countDisplay.textContent = records.length;
    
    const listContainer = document.getElementById('duplicate-records-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    sortedRecords.forEach((record, idx) => {
        const isActive = record.status_id === 2;
        const isSuggested = isActive && idx === 0;
        const artistSortKey = getArtistSortKey(record.artist);
        
        const itemDiv = document.createElement('div');
        itemDiv.style.cssText = `
            padding: 15px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            background: ${isSuggested ? '#e3f2fd' : 'white'};
            ${!isActive ? 'opacity: 0.85;' : ''}
        `;
        itemDiv.onclick = () => {
            if (pendingResolveFunction) {
                pendingResolveFunction(record);
                pendingResolveFunction = null;
                currentModalBarcode = null;
            }
            modal.style.display = 'none';
            scannerBlocked = false;
            setTimeout(() => processAmbiguousScanQueue(), 100);
        };
        
        let statusText = '';
        let statusClass = '';
        if (record.status_id === 1) {
            statusText = 'New (Inactive)';
            statusClass = 'new';
        } else if (record.status_id === 2) {
            statusText = 'Active';
            statusClass = 'active';
        } else if (record.status_id === 3) {
            statusText = 'Sold';
            statusClass = 'sold';
        } else {
            statusText = 'Unknown';
            statusClass = '';
        }
        
        let conditionText = '';
        if (record.sleeve_condition_name && record.disc_condition_name) {
            if (record.sleeve_condition_name === record.disc_condition_name) {
                conditionText = record.sleeve_condition_name;
            } else {
                conditionText = `Sleeve: ${record.sleeve_condition_name || '?'} / Disc: ${record.disc_condition_name || '?'}`;
            }
        } else if (record.sleeve_condition_name) {
            conditionText = record.sleeve_condition_name;
        } else if (record.disc_condition_name) {
            conditionText = record.disc_condition_name;
        } else {
            conditionText = 'Unknown';
        }
        
        let suggestionReason = '';
        if (isSuggested && targetLetter && artistSortKey === targetLetter) {
            suggestionReason = `<div style="font-size: 11px; color: #28a745; margin-top: 5px;">
                <i class="fas fa-check-circle"></i> Active record in "${targetLetter}" section
            </div>`;
        } else if (isSuggested) {
            suggestionReason = `<div style="font-size: 11px; color: #28a745; margin-top: 5px;">
                <i class="fas fa-check-circle"></i> Active record
            </div>`;
        } else if (!isActive) {
            suggestionReason = `<div style="font-size: 11px; color: #dc3545; margin-top: 5px;">
                <i class="fas fa-exclamation-triangle"></i> ${statusText} - not suggested
            </div>`;
        }
        
        itemDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <div style="font-weight: bold; margin-bottom: 5px;">
                        ${escapeHtml(record.artist || 'Unknown Artist')} - ${escapeHtml(record.title || 'Unknown Title')}
                        <span style="font-size: 10px; color: #666; margin-left: 8px;">[${artistSortKey}]</span>
                    </div>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        <strong>ID:</strong> #${record.id} | 
                        <strong>Status:</strong> <span class="status-badge ${statusClass}">${statusText}</span> |
                        <strong>Condition:</strong> ${escapeHtml(conditionText)}
                    </div>
                    <div style="font-size: 12px; color: #666;">
                        <strong>Location:</strong> ${record.location || 'No location'} |
                        <strong>Last Seen:</strong> ${record.last_seen || 'Never'}
                    </div>
                    ${record.store_price ? `<div style="font-size: 13px; margin-top: 5px; font-weight: bold; color: #28a745;">Price: $${parseFloat(record.store_price).toFixed(2)}</div>` : ''}
                    ${suggestionReason}
                </div>
                <div>
                    <span style="
                        background: ${isSuggested ? '#28a745' : '#6c757d'};
                        color: white;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                    ">
                        <i class="fas ${isSuggested ? 'fa-star' : 'fa-arrow-right'}"></i> 
                        ${isSuggested ? 'Suggested' : 'Select'}
                    </span>
                </div>
            </div>
        `;
        
        listContainer.appendChild(itemDiv);
    });
    
    if (activeRecords.length === 0) {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = 'margin-top: 10px; padding: 10px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; color: #856404; font-size: 13px;';
        warningDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No active records found with this barcode. All copies are either sold or inactive.';
        listContainer.appendChild(warningDiv);
    }
    
    modal.style.display = 'flex';
    scannerBlocked = true;
    playBeep(1000, 400, 'sine');
}

function processAmbiguousScanQueue() {
    if (pendingAmbiguousScans.length > 0 && !scannerBlocked) {
        const nextScan = pendingAmbiguousScans.shift();
        processScan(nextScan.barcode, true);
    }
}

// ============================================================================
// Scan Processing
// ============================================================================

async function processScan(barcode, fromQueue = false) {
    if (scannerBlocked && !fromQueue) {
        pendingAmbiguousScans.push({ barcode });
        playBeep(600, 150, 'sine');
        showScanResult(`⚠️ Please complete current selection first.`, 'warning');
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
            showScanResult(`⚠️ ${exactMatches.length} records found. Please select the correct record.`, 'warning');
            
            return new Promise((resolve) => {
                showDuplicateRecordModal(exactMatches, barcode, async (selectedRecord) => {
                    if (selectedRecord) {
                        await processSelectedRecord(selectedRecord, barcode);
                    }
                    resolve();
                });
            });
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
        }, 8000);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Initialization
// ============================================================================

function initInventoryTab() {
    console.log('📦 Initializing Inventory Tab...');
    
    // Get DOM elements
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
    
    if (!barcodeInput) {
        console.error('Inventory tab elements not found');
        return;
    }
    
    // Load genres
    loadGenres();
    
    // Set initial values
    currentCounter = 1;
    if (counterDisplay) counterDisplay.textContent = currentCounter;
    
    // Add event listeners
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
    
    // Initialize location type visibility
    onMainLocationTypeChange();
    
    // Update preview
    updateLocationPreview();
    
    // Reset scanner state
    scannerBlocked = false;
    pendingAmbiguousScans = [];
    pendingResolveFunction = null;
    
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
        scannerBlocked = false;
        pendingAmbiguousScans = [];
        pendingResolveFunction = null;
        setTimeout(initInventoryTab, 100);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const inventoryTab = document.querySelector('.tab[data-tab="inventory"]');
    if (inventoryTab && inventoryTab.classList.contains('active')) {
        setTimeout(initInventoryTab, 200);
    }
});

console.log('✅ inventory.js loaded with table layout');