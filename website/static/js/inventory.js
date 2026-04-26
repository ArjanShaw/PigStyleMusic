// ============================================================================
// inventory.js - Inventory Management Tab
// ============================================================================

// State management for location counters (browser memory only)
let locationCounters = {};

// Current location prefix
let currentLocationPrefix = 'bin 1';

// Current genre
let currentGenre = '';

// Available genres (loaded from API)
let availableGenres = [];

// DOM Elements
let barcodeInput = null;
let locationPrefixInput = null;
let genreSelect = null;
let counterDisplay = null;
let scanResultDiv = null;
let addGenreInput = null;
let addGenreBtn = null;

// ============================================================================
// Initialization
// ============================================================================

function initInventoryTab() {
    console.log('📦 Initializing Inventory Tab...');
    
    // Get DOM elements
    barcodeInput = document.getElementById('inventory-barcode-input');
    locationPrefixInput = document.getElementById('location-prefix');
    counterDisplay = document.getElementById('counter-display');
    scanResultDiv = document.getElementById('scan-result');
    
    if (!barcodeInput || !locationPrefixInput) {
        console.error('Inventory tab elements not found');
        return;
    }
    
    // Set current location prefix
    currentLocationPrefix = locationPrefixInput.value.trim() || 'bin 1';
    updateCounterDisplay();
    
    // Load available genres from API
    loadGenres();
    
    // Add event listeners
    locationPrefixInput.addEventListener('change', onLocationPrefixChange);
    barcodeInput.addEventListener('keypress', onBarcodeEnter);
    
    // Focus on barcode input
    barcodeInput.focus();
    
    console.log('✅ Inventory Tab initialized');
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
            console.log(`📀 Loaded ${availableGenres.length} genres from API:`, availableGenres);
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
    const genreSelectContainer = document.getElementById('genre-select-container');
    if (!genreSelectContainer) {
        // Create the container if it doesn't exist
        createGenreUI();
        return;
    }
    
    const select = genreSelectContainer.querySelector('select');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">-- No Genre --</option>';
        
        availableGenres.forEach(genre => {
            const option = document.createElement('option');
            option.value = genre;
            option.textContent = genre;
            if (currentValue === genre) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }
}

function createGenreUI() {
    const scannerSection = document.querySelector('.inventory-scanner-section');
    if (!scannerSection) return;
    
    // Find the grid div
    const gridDiv = scannerSection.querySelector('div[style*="display: grid"]');
    if (!gridDiv) return;
    
    // Create genre select container
    const genreContainer = document.createElement('div');
    genreContainer.id = 'genre-select-container';
    genreContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
    
    const genreLabel = document.createElement('label');
    genreLabel.style.cssText = 'display: block; margin-bottom: 8px; font-size: 0.9rem;';
    genreLabel.innerHTML = '<i class="fas fa-music"></i> Genre Section';
    
    const selectWrapper = document.createElement('div');
    selectWrapper.style.cssText = 'display: flex; gap: 8px; align-items: center; flex-wrap: wrap;';
    
    const select = document.createElement('select');
    select.id = 'genre-select';
    select.style.cssText = 'flex: 2; min-width: 150px; background: rgba(255,255,255,0.95); color: #333; padding: 10px; border-radius: 6px; border: none;';
    select.innerHTML = '<option value="">-- No Genre --</option>';
    
    // Populate genres
    availableGenres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        select.appendChild(option);
    });
    
    // Add custom genre input
    const addGenreInputEl = document.createElement('input');
    addGenreInputEl.type = 'text';
    addGenreInputEl.id = 'add-genre-input';
    addGenreInputEl.placeholder = 'New genre...';
    addGenreInputEl.style.cssText = 'flex: 1; min-width: 100px; background: rgba(255,255,255,0.95); color: #333; padding: 10px; border-radius: 6px; border: none;';
    
    const addGenreBtnEl = document.createElement('button');
    addGenreBtnEl.type = 'button';
    addGenreBtnEl.id = 'add-genre-btn';
    addGenreBtnEl.className = 'btn btn-small btn-info';
    addGenreBtnEl.innerHTML = '<i class="fas fa-plus"></i> Add';
    addGenreBtnEl.style.cssText = 'padding: 8px 15px; white-space: nowrap;';
    
    selectWrapper.appendChild(select);
    selectWrapper.appendChild(addGenreInputEl);
    selectWrapper.appendChild(addGenreBtnEl);
    
    genreContainer.appendChild(genreLabel);
    genreContainer.appendChild(selectWrapper);
    
    // Insert genre container before the location prefix input's parent
    const locationContainer = gridDiv.querySelector('div:first-child');
    if (locationContainer) {
        locationContainer.before(genreContainer);
    } else {
        gridDiv.prepend(genreContainer);
    }
    
    // Store references
    genreSelect = select;
    addGenreInput = addGenreInputEl;
    addGenreBtn = addGenreBtnEl;
    
    // Add event listeners
    select.addEventListener('change', onGenreChange);
    addGenreBtnEl.addEventListener('click', () => addCustomGenre(addGenreInputEl.value.trim()));
    addGenreInputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addCustomGenre(addGenreInputEl.value.trim());
        }
    });
}

function onGenreChange(event) {
    currentGenre = event.target.value;
    console.log(`🎵 Genre changed to: ${currentGenre || 'none'}`);
    
    // Update the location prefix display to show genre
    if (locationPrefixInput) {
        const basePrefix = locationPrefixInput.value.split('|')[0].trim() || 'bin 1';
        if (currentGenre) {
            locationPrefixInput.value = `${currentGenre} | ${basePrefix}`;
        } else {
            locationPrefixInput.value = basePrefix;
        }
        onLocationPrefixChange({ target: locationPrefixInput });
    }
}

async function addCustomGenre(genreName) {
    if (!genreName) {
        showScanResult('Please enter a genre name', 'warning');
        return;
    }
    
    // Capitalize first letter of each word
    genreName = genreName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    
    if (availableGenres.includes(genreName)) {
        showScanResult(`Genre "${genreName}" already exists`, 'warning');
        const select = document.getElementById('genre-select');
        if (select) {
            select.value = genreName;
            currentGenre = genreName;
        }
        return;
    }
    
    // Add to available genres (client-side only for now)
    availableGenres.push(genreName);
    availableGenres.sort();
    
    // Re-render select
    renderGenreSelect();
    
    // Select the new genre
    const select = document.getElementById('genre-select');
    if (select) {
        select.value = genreName;
        currentGenre = genreName;
    }
    
    // Clear input
    const addInput = document.getElementById('add-genre-input');
    if (addInput) addInput.value = '';
    
    // Update location prefix
    if (locationPrefixInput) {
        const basePrefix = locationPrefixInput.value.split('|')[0].trim() || 'bin 1';
        locationPrefixInput.value = `${currentGenre} | ${basePrefix}`;
        onLocationPrefixChange({ target: locationPrefixInput });
    }
    
    showScanResult(`✅ Genre "${genreName}" added (will appear in dropdown for this session)`, 'success');
    
    // Note: This doesn't save to database yet. The genre will be saved when a record is scanned with it.
}

// ============================================================================
// Event Handlers
// ============================================================================

function onLocationPrefixChange(event) {
    let newPrefix = event.target.value.trim();
    
    // Extract the base prefix (after genre)
    let basePrefix = newPrefix;
    if (newPrefix.includes('|')) {
        basePrefix = newPrefix.split('|')[1].trim();
    } else {
        basePrefix = newPrefix;
    }
    
    if (basePrefix && basePrefix !== currentLocationPrefix) {
        currentLocationPrefix = basePrefix;
        // Counter for new prefix starts at 1 (if not already in memory, it will be created)
        if (!locationCounters[currentLocationPrefix]) {
            locationCounters[currentLocationPrefix] = 1;
        }
        updateCounterDisplay();
        showScanResult(`Location changed to "${currentLocationPrefix}". Counter reset to ${getCurrentCounter()}.`, 'info');
    }
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
// Counter Management
// ============================================================================

function getCurrentCounter() {
    if (!locationCounters[currentLocationPrefix]) {
        locationCounters[currentLocationPrefix] = 1;
    }
    return locationCounters[currentLocationPrefix];
}

function incrementCounter() {
    locationCounters[currentLocationPrefix] = getCurrentCounter() + 1;
    updateCounterDisplay();
}

function updateCounterDisplay() {
    if (counterDisplay) {
        counterDisplay.textContent = getCurrentCounter();
    }
}

window.resetCounter = function() {
    locationCounters[currentLocationPrefix] = 1;
    updateCounterDisplay();
    showScanResult(`Counter for "${currentLocationPrefix}" reset to 1`, 'info');
    barcodeInput.focus();
};

// ============================================================================
// Scan Processing
// ============================================================================

async function processScan(barcode) {
    console.log(`🔍 Processing barcode: ${barcode}`);
    
    // Clear input for next scan
    barcodeInput.value = '';
    
    // Show scanning status
    showScanResult(`Scanning barcode: ${barcode}...`, 'info');
    
    try {
        // First, find the record by barcode
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
        
        // Filter for exact barcode match
        const exactMatch = records.find(r => r.barcode && String(r.barcode).trim() === barcode);
        
        if (!exactMatch) {
            throw new Error(`No record found with barcode: ${barcode}`);
        }
        
        // Check if record is already sold
        if (exactMatch.status_id === 3) {
            throw new Error(`Record #${exactMatch.id} - "${exactMatch.artist} - ${exactMatch.title}" is already SOLD. Cannot update location.`);
        }
        
        // Generate location string with genre prefix
        const currentCounter = getCurrentCounter();
        let locationString = `${currentLocationPrefix}/${currentCounter}`;
        
        // Add genre prefix if selected
        if (currentGenre) {
            locationString = `${currentGenre} - ${locationString}`;
        }
        
        const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        console.log(`📝 Updating record #${exactMatch.id}: location="${locationString}", last_seen="${todayDate}"`);
        
        // Update the record - send both fields
        const updateResponse = await fetch(`${AppConfig.baseUrl}/records/${exactMatch.id}`, {
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
        
        // Success - increment counter
        incrementCounter();
        
        // Show success message
        const artist = exactMatch.artist || 'Unknown';
        const title = exactMatch.title || 'Unknown';
        showScanResult(
            `✅ Record #${exactMatch.id}: "${artist} - ${title}"\n   → Location: ${locationString}\n   → Last seen: ${todayDate}`,
            'success'
        );
        
    } catch (error) {
        console.error('Scan error:', error);
        showScanResult(`❌ Error: ${error.message}`, 'error');
    }
    
    // Refocus on barcode input for next scan
    setTimeout(() => {
        barcodeInput.focus();
    }, 100);
}

// ============================================================================
// UI Helpers
// ============================================================================

function showScanResult(message, type = 'info') {
    if (!scanResultDiv) return;
    
    scanResultDiv.style.display = 'block';
    scanResultDiv.innerHTML = message.replace(/\n/g, '<br>');
    
    // Force text color to black for readability
    scanResultDiv.style.color = '#000000';
    
    // Set background color based on type
    const colors = {
        success: 'rgba(40, 167, 69, 0.2)',
        error: 'rgba(220, 53, 69, 0.2)',
        warning: 'rgba(255, 193, 7, 0.2)',
        info: 'rgba(23, 162, 184, 0.2)'
    };
    scanResultDiv.style.backgroundColor = colors[type] || colors.info;
    scanResultDiv.style.borderLeft = `4px solid ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8'}`;
    
    // Auto-hide after 8 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            if (scanResultDiv && scanResultDiv.style.display === 'block') {
                scanResultDiv.style.display = 'none';
            }
        }, 8000);
    }
}

// ============================================================================
// Tab Activation Handler (fallback for when TabManager doesn't call init)
// ============================================================================

// Initialize when inventory tab is shown
document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'inventory') {
        console.log('📢 inventory.js received tabChanged event for inventory');
        // Small delay to ensure DOM is ready
        setTimeout(initInventoryTab, 100);
    }
});

// Also initialize on page load if inventory tab is active by default
document.addEventListener('DOMContentLoaded', function() {
    // Check if inventory tab is active by default
    const inventoryTab = document.querySelector('.tab[data-tab="inventory"]');
    if (inventoryTab && inventoryTab.classList.contains('active')) {
        console.log('📄 inventory.js: Inventory tab active on page load, initializing...');
        setTimeout(initInventoryTab, 200);
    }
});

// Also expose init function globally as a backup
window.initInventoryTab = initInventoryTab;
window.addCustomGenre = addCustomGenre;

console.log('✅ inventory.js loaded');