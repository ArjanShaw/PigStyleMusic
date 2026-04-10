// ============================================================================
// inventory.js - Inventory Management Tab
// ============================================================================

// State management for location counters (browser memory only)
let locationCounters = {};

// Current location prefix
let currentLocationPrefix = 'bin 1';

// DOM Elements
let barcodeInput = null;
let locationPrefixInput = null;
let counterDisplay = null;
let scanResultDiv = null;

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
    
    // Add event listeners
    locationPrefixInput.addEventListener('change', onLocationPrefixChange);
    barcodeInput.addEventListener('keypress', onBarcodeEnter);
    
    // Focus on barcode input
    barcodeInput.focus();
    
    console.log('✅ Inventory Tab initialized');
}

// ============================================================================
// Event Handlers
// ============================================================================

function onLocationPrefixChange(event) {
    const newPrefix = event.target.value.trim();
    if (newPrefix && newPrefix !== currentLocationPrefix) {
        currentLocationPrefix = newPrefix;
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
        
        // Generate location string
        const currentCounter = getCurrentCounter();
        const locationString = `${currentLocationPrefix}/${currentCounter}`;
        
        // Update the record
        const updateResponse = await fetch(`${AppConfig.baseUrl}/records/${exactMatch.id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                location: locationString,
                last_seen: new Date().toISOString().split('T')[0] // YYYY-MM-DD
            })
        });
        
        if (!updateResponse.ok) {
            throw new Error(`Update failed: ${updateResponse.status}`);
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
            `✅ Record #${exactMatch.id}: "${artist} - ${title}"\n   → Location: ${locationString}\n   → Last seen: ${new Date().toISOString().split('T')[0]}`,
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
    
    // Set color based on type
    const colors = {
        success: 'rgba(40, 167, 69, 0.2)',
        error: 'rgba(220, 53, 69, 0.2)',
        warning: 'rgba(255, 193, 7, 0.2)',
        info: 'rgba(23, 162, 184, 0.2)'
    };
    scanResultDiv.style.backgroundColor = colors[type] || colors.info;
    scanResultDiv.style.borderLeft = `4px solid ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8'}`;
    
    // Auto-hide after 5 seconds for non-error messages
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

console.log('✅ inventory.js loaded');