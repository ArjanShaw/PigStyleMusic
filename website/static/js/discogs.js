// discogs.js - Cleaned version with Discogs listings table and local inventory table
// Added barcode scanner component with "Show Selected Only" filter
// Added location field for records with modal popup

// State management
let discogsInventory = [];
let filteredDiscogsInventory = [];
let discogsCurrentPage = 1;
let discogsPageSize = 50;
let discogsTotalPages = 1;
let discogsSelectedRecords = new Set();

// Filter state
let listingStatusFilter = 'all';
let searchFilter = '';
let consignorFilter = 'all';
let discogsStatusFilter = 'all'; // 'active' = listed and not sold, 'sold' = listed and sold on Discogs
let localStatusFilter = 'all';
let showSelectedOnlyFilter = 'selected'; // 'selected' or 'all'

// Conditions data from database
let conditionsMap = {
    byId: {},
    byName: {},
    byDisplayName: {},
    byAbbreviation: {},
    qualityIndexMap: {}
};

// Consignors data
let consignorsList = [];

// Store Discogs listings with status
let discogsListingsMap = {}; // Key: listing_id, Value: listing object with status
let openDiscogsOrders = []; // Store open orders for printing

// Barcode scanner state
let barcodeScannerTimeout = null;

// Store records to submit before modal confirmation
let pendingRecordsToSubmit = [];

// Make functions globally available
window.loadDiscogsInventory = loadDiscogsInventory;
window.filterDiscogsInventory = filterDiscogsInventory;
window.resetDiscogsFilters = resetDiscogsFilters;
window.goToDiscogsPage = goToDiscogsPage;
window.changeDiscogsPageSize = changeDiscogsPageSize;
window.toggleAllDiscogsRecords = toggleAllDiscogsRecords;
window.toggleDiscogsRecordSelection = toggleDiscogsRecordSelection;
window.selectAllDiscogsRecords = selectAllDiscogsRecords;
window.deselectAllDiscogsRecords = deselectAllDiscogsRecords;
window.submitToDiscogs = submitToDiscogs;
window.deleteDiscogsListing = deleteDiscogsListing;
window.syncDiscogsStatus = syncDiscogsStatus;
window.loadConsignors = loadConsignors;
window.loadDiscogsListings = loadDiscogsListings;
window.printDiscogsOrders = printDiscogsOrders;
window.scanBarcode = scanBarcode;
window.closeDiscogsLocationModal = closeDiscogsLocationModal;
window.confirmDiscogsSubmit = confirmDiscogsSubmit;

/**
 * Load conditions from database
 */
function loadConditions() {
    console.log('📀 Loading conditions from database...');
    
    return fetch(`${window.AppConfig.baseUrl}/api/conditions`, {
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success' && data.conditions) {
            conditionsMap = {
                byId: {},
                byName: {},
                byDisplayName: {},
                byAbbreviation: {},
                qualityIndexMap: {}
            };
            
            data.conditions.forEach(condition => {
                conditionsMap.byId[condition.id] = condition;
                conditionsMap.byName[condition.condition_name] = condition;
                conditionsMap.byDisplayName[condition.display_name] = condition;
                if (condition.abbreviation) {
                    conditionsMap.byAbbreviation[condition.abbreviation] = condition;
                }
                conditionsMap.qualityIndexMap[condition.id] = condition.quality_index;
                conditionsMap.qualityIndexMap[condition.condition_name] = condition.quality_index;
                conditionsMap.qualityIndexMap[condition.display_name] = condition.quality_index;
                if (condition.abbreviation) {
                    conditionsMap.qualityIndexMap[condition.abbreviation] = condition.quality_index;
                }
            });
            
            return conditionsMap;
        } else {
            throw new Error('Failed to load conditions');
        }
    })
    .catch(error => {
        console.error('Error loading conditions:', error);
        return null;
    });
}

/**
 * Load consignors from database
 */
function loadConsignors() {
    console.log('👤 Loading consignors from database...');
    
    return fetch(`${window.AppConfig.baseUrl}/users?role=consignor`, {
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success' && data.users) {
            consignorsList = data.users.map(user => ({
                id: user.id,
                username: user.username,
                full_name: user.full_name || user.username,
                initials: user.initials || ''
            }));
            
            populateConsignorDropdown(consignorsList);
            return consignorsList;
        } else {
            consignorsList = [];
            return [];
        }
    })
    .catch(error => {
        console.error('Error loading consignors:', error);
        consignorsList = [];
        return [];
    });
}

/**
 * Populate consignor dropdown
 */
function populateConsignorDropdown(consignors) {
    const consignorDropdown = document.getElementById('consignor-filter');
    if (!consignorDropdown) return;
    
    consignorDropdown.innerHTML = '<option value="all">All Consignors</option>';
    
    const sortedConsignors = [...consignors].sort((a, b) => {
        const nameA = (a.full_name || a.username).toLowerCase();
        const nameB = (b.full_name || b.username).toLowerCase();
        return nameA.localeCompare(nameB);
    });
    
    sortedConsignors.forEach(consignor => {
        const option = document.createElement('option');
        option.value = consignor.id;
        let displayName = consignor.full_name || consignor.username;
        if (consignor.initials) {
            displayName += ` (${consignor.initials})`;
        }
        option.textContent = displayName;
        consignorDropdown.appendChild(option);
    });
}

/**
 * Load local inventory
 */
function loadLocalInventory() {
    return fetch(`${window.AppConfig.baseUrl}/records?status=active&limit=10000`, {
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success' && data.records) {
            discogsInventory = data.records.map(record => ({
                ...record,
                discogs_listed: record.discogs_listing_id ? true : false,
                consignor_name: record.consignor_name || 'Unknown',
                consignor_id: record.consignor_id || null,
                discogs_status: null, // Will be populated from Discogs listings
                genre_name: record.genre_name || record.genre || 'Unknown',
                location: record.location || '' // Add location field
            }));
            
            return discogsInventory;
        } else {
            return [];
        }
    })
    .catch(error => {
        console.error('Error loading inventory:', error);
        return [];
    });
}

/**
 * Load Discogs listings and filter to show only orphaned listings
 */
function loadDiscogsListings() {
    const url = `${window.AppConfig.baseUrl}/api/discogs/test-listings`;
    const tableBody = document.getElementById('discogs-orphaned-body');
    const orphanedCountEl = document.getElementById('discogs-orphaned-count');
    const openOrdersCountEl = document.getElementById('open-orders-count');
    const salesTotalEl = document.getElementById('sales-total');
    
    if (tableBody) {
        tableBody.innerHTML = '<td colspan="9" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Loading Discogs listings...<\/td>';
    }
    
    return fetch(url, {
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        if (!tableBody) return;
        
        if (data.success && data.listings && data.listings.length > 0) {
            // Build map of Discogs listings by listing_id
            discogsListingsMap = {};
            data.listings.forEach(listing => {
                discogsListingsMap[String(listing.listing_id)] = listing;
            });
            
            // Update discogs_status for each local record
            discogsInventory.forEach(record => {
                if (record.discogs_listing_id) {
                    const discogsListing = discogsListingsMap[String(record.discogs_listing_id)];
                    if (discogsListing) {
                        record.discogs_status = discogsListing.status;
                    } else {
                        record.discogs_status = null;
                    }
                }
            });
            
            // Get all discogs_listing_ids from local records
            const localDiscogsIds = new Set();
            discogsInventory.forEach(record => {
                if (record.discogs_listing_id) {
                    localDiscogsIds.add(String(record.discogs_listing_id));
                }
            });
            
            // Filter to show only listings that have no matching local record
            const orphanedListings = data.listings.filter(listing => {
                return !localDiscogsIds.has(String(listing.listing_id));
            });
            
            // Calculate open orders (sold on Discogs but not locally marked as sold)
            const soldListings = data.listings.filter(listing => {
                return listing.status === 'Sold';
            });
            
            // Filter sold listings to only those NOT matched to a local record that's already marked sold
            const openOrdersListings = soldListings.filter(listing => {
                const localRecord = discogsInventory.find(r => String(r.discogs_listing_id) === String(listing.listing_id));
                // If there's no local record, it's definitely an open order
                if (!localRecord) return true;
                // If there is a local record but it's not marked as sold, it's an open order
                return localRecord.status_id !== 3;
            });
            
            // Store open orders for printing with genre info
            openDiscogsOrders = openOrdersListings.map(listing => {
                // Try to find the matching local record if it exists
                const localRecord = discogsInventory.find(r => String(r.discogs_listing_id) === String(listing.listing_id));
                return {
                    listing_id: listing.listing_id,
                    release_id: listing.release_id,
                    artist: listing.artist,
                    title: listing.title,
                    genre: localRecord ? localRecord.genre_name : (listing.genre || 'Unknown'),
                    price: parseFloat(listing.price || 0),
                    condition: listing.condition,
                    sleeve_condition: listing.sleeve_condition,
                    status: listing.status,
                    url: listing.url,
                    order_date: listing.order_date || null,
                    buyer_username: listing.buyer_username || null,
                    local_record_id: localRecord ? localRecord.id : null,
                    local_status: localRecord ? (localRecord.status_id === 3 ? 'sold' : 'active') : 'no_local_record'
                };
            });
            
            const openOrdersCount = openOrdersListings.length;
            const salesTotal = openOrdersListings.reduce((sum, listing) => sum + parseFloat(listing.price || 0), 0);
            
            if (openOrdersCountEl) openOrdersCountEl.textContent = openOrdersCount;
            if (salesTotalEl) salesTotalEl.textContent = `$${salesTotal.toFixed(2)}`;
            if (orphanedCountEl) orphanedCountEl.textContent = orphanedListings.length;
            
            if (orphanedListings.length > 0) {
                let html = '';
                orphanedListings.forEach(listing => {
                    html += `
                        <tr>
                            <td>${escapeHtml(String(listing.listing_id || ''))}<\/td>
                            <td>${escapeHtml(String(listing.release_id || ''))}<\/td>
                            <td>${escapeHtml(listing.artist || 'Unknown')}<\/td>
                            <td>${escapeHtml(listing.title || 'Unknown')}<\/td>
                            <td>$${parseFloat(listing.price || 0).toFixed(2)}<\/td>
                            <td><span class="condition-badge">${escapeHtml(listing.condition || 'Not specified')}<\/span><\/td>
                            <td><span class="condition-badge">${escapeHtml(listing.sleeve_condition || 'Not specified')}<\/span><\/td>
                            <td><span class="status-badge ${listing.status === 'For Sale' ? 'active' : 'sold'}">${escapeHtml(listing.status || 'Unknown')}<\/span><\/td>
                            <td><a href="${listing.url}" target="_blank"><i class="fab fa-discogs"></i> View<\/a><\/td>
                        <\/tr>
                    `;
                });
                tableBody.innerHTML = html;
            } else {
                tableBody.innerHTML = '<td colspan="9" style="text-align: center; padding: 40px;">No orphaned listings found<\/td>';
            }
            
            const listedCount = data.listings.filter(l => l.status === 'For Sale').length;
            const listedCountEl = document.getElementById('discogs-listed-count');
            if (listedCountEl) listedCountEl.textContent = listedCount;
        } else {
            const errorMsg = data.error || 'Unknown error from Discogs API';
            tableBody.innerHTML = `<td colspan="9" style="text-align: center; padding: 40px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading Discogs listings: ${escapeHtml(errorMsg)}</p>
                <button class="btn btn-primary btn-small" onclick="loadDiscogsListings()">
                    <i class="fas fa-sync-alt"></i> Retry
                </button>
                <\/td>`;
            if (orphanedCountEl) orphanedCountEl.textContent = 0;
            if (openOrdersCountEl) openOrdersCountEl.textContent = 0;
            if (salesTotalEl) salesTotalEl.textContent = '$0.00';
            const listedCountEl = document.getElementById('discogs-listed-count');
            if (listedCountEl) listedCountEl.textContent = 0;
            discogsListingsMap = {};
            openDiscogsOrders = [];
            
            showDiscogsStatus(`Failed to load Discogs listings: ${errorMsg}`, 'error');
        }
        
        return data;
    })
    .catch(error => {
        console.error('Error loading Discogs listings:', error);
        if (tableBody) {
            tableBody.innerHTML = `<td colspan="9" style="text-align: center; padding: 40px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error: ${escapeHtml(error.message)}</p>
                <button class="btn btn-primary btn-small" onclick="loadDiscogsListings()">
                    <i class="fas fa-sync-alt"></i> Retry
                </button>
                <\/td>`;
        }
        if (orphanedCountEl) orphanedCountEl.textContent = 0;
        if (openOrdersCountEl) openOrdersCountEl.textContent = 0;
        if (salesTotalEl) salesTotalEl.textContent = '$0.00';
        showDiscogsStatus(`Error loading Discogs listings: ${error.message}`, 'error');
        return null;
    });
}

/**
 * Scan barcode - checks matching records and adds to selection
 */
function scanBarcode(barcode) {
    if (!barcode || barcode.trim() === '') {
        updateScannerStatus('Please enter a barcode', 'warning');
        return;
    }
    
    barcode = barcode.trim();
    updateScannerStatus('Searching...', 'info');
    
    // Search local inventory for matching barcode
    const matches = discogsInventory.filter(record => 
        record.barcode && String(record.barcode).trim() === barcode
    );
    
    if (matches.length === 0) {
        alert(`No records found for barcode: ${barcode}`);
        updateScannerStatus(`No records found for barcode: ${barcode}`, 'error');
        clearBarcodeInput();
        return;
    }
    
    // Check if any matches are already selected
    const alreadySelected = matches.filter(record => discogsSelectedRecords.has(record.id));
    const newMatches = matches.filter(record => !discogsSelectedRecords.has(record.id));
    
    if (newMatches.length === 0) {
        updateScannerStatus(`All ${matches.length} record(s) already selected`, 'warning');
        clearBarcodeInput();
        return;
    }
    
    // Add new matches to selection
    let addedCount = 0;
    newMatches.forEach(record => {
        discogsSelectedRecords.add(record.id);
        addedCount++;
    });
    
    updateDiscogsSelectionCount();
    
    // Show success message
    const message = addedCount === 1 
        ? `Added: ${newMatches[0].artist} - ${newMatches[0].title}`
        : `Added ${addedCount} records for barcode: ${barcode}`;
    updateScannerStatus(message, 'success');
    
    // Re-render the table to show the newly selected records
    applyDiscogsFilters();
    
    // Highlight the newly added records
    setTimeout(() => {
        newMatches.forEach(record => {
            highlightRecordRow(record.id);
            scrollToRecordIfNeeded(record.id);
        });
    }, 100);
    
    clearBarcodeInput();
}

/**
 * Highlight a record row in the table
 */
function highlightRecordRow(recordId) {
    const rows = document.querySelectorAll('#discogs-inventory-body tr');
    for (let row of rows) {
        const checkbox = row.querySelector('.discogs-record-checkbox');
        if (checkbox && checkbox.getAttribute('data-record-id') == recordId) {
            row.classList.add('highlight-row');
            setTimeout(() => {
                row.classList.remove('highlight-row');
            }, 1500);
            break;
        }
    }
}

/**
 * Scroll to a record if it's not on the current page
 */
function scrollToRecordIfNeeded(recordId) {
    // Check if the record is on the current page
    const recordOnCurrentPage = filteredDiscogsInventory.slice(
        (discogsCurrentPage - 1) * discogsPageSize,
        discogsCurrentPage * discogsPageSize
    ).some(r => r.id === recordId);
    
    if (!recordOnCurrentPage) {
        // Find which page the record is on
        const recordIndex = filteredDiscogsInventory.findIndex(r => r.id === recordId);
        if (recordIndex !== -1) {
            const targetPage = Math.floor(recordIndex / discogsPageSize) + 1;
            if (targetPage !== discogsCurrentPage) {
                discogsCurrentPage = targetPage;
                renderDiscogsInventory();
                updateDiscogsPagination();
                
                // After rendering, highlight the row
                setTimeout(() => {
                    highlightRecordRow(recordId);
                }, 100);
            }
        }
    }
}

/**
 * Update scanner status display
 */
function updateScannerStatus(message, type = 'info') {
    const statusEl = document.getElementById('scanner-status');
    if (!statusEl) return;
    
    statusEl.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i> ${escapeHtml(message)}`;
    statusEl.className = '';
    statusEl.classList.add(type);
    
    // Clear status after 3 seconds for non-info messages
    if (type !== 'info') {
        setTimeout(() => {
            if (statusEl) {
                statusEl.innerHTML = '<i class="fas fa-info-circle"></i> Ready to scan';
                statusEl.className = '';
            }
        }, 3000);
    }
}

/**
 * Clear barcode input field
 */
function clearBarcodeInput() {
    const input = document.getElementById('batch-barcode-input');
    if (input) {
        input.value = '';
        input.focus();
    }
}

/**
 * Sync Discogs status with local records
 */
function syncDiscogsStatus() {
    showDiscogsStatus('Syncing with Discogs...', 'info');
    
    // First, fetch current Discogs listings
    fetch(`${window.AppConfig.baseUrl}/api/discogs/test-listings`, {
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch Discogs listings');
        }
        
        if (!data.listings) {
            throw new Error('No listings data received from Discogs');
        }
        
        // Create a set of listing_ids from Discogs
        const discogsListingIds = new Set();
        const discogsListingMap = {};
        if (data.listings && data.listings.length > 0) {
            data.listings.forEach(listing => {
                discogsListingIds.add(String(listing.listing_id));
                discogsListingMap[listing.listing_id] = listing;
            });
        }
        
        // Fetch all records with discogs_listing_id directly from the database
        fetch(`${window.AppConfig.baseUrl}/records?status=active&limit=10000`, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders()
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(recordsData => {
            if (recordsData.status !== 'success' || !recordsData.records) {
                throw new Error(recordsData.error || 'Failed to fetch local records');
            }
            
            const recordsWithDiscogsId = recordsData.records.filter(r => r.discogs_listing_id);
            
            let recordsToClear = [];
            let listingsToDelete = [];
            
            // Check local records against Discogs
            recordsWithDiscogsId.forEach(record => {
                const listingId = String(record.discogs_listing_id);
                if (!discogsListingIds.has(listingId)) {
                    recordsToClear.push(record.id);
                }
            });
            
            // Check Discogs listings against local records
            data.listings.forEach(listing => {
                const listingId = String(listing.listing_id);
                const localRecord = recordsWithDiscogsId.find(r => String(r.discogs_listing_id) === listingId);
                if (!localRecord) {
                    listingsToDelete.push({ id: listingId, artist: listing.artist, title: listing.title });
                }
            });
            
            let clearedCount = 0;
            let deletedCount = 0;
            let promises = [];
            
            // Clear discogs_listing_id from local records
            recordsToClear.forEach(recordId => {
                promises.push(
                    fetch(`${window.AppConfig.baseUrl}/records/${recordId}`, {
                        method: 'PUT',
                        credentials: 'include',
                        headers: window.AppConfig.getHeaders(),
                        body: JSON.stringify({ 
                            discogs_listing_id: null,
                            discogs_listed_date: null
                        })
                    }).then(() => {
                        clearedCount++;
                    }).catch(error => {
                        console.error(`Error clearing Discogs ID for record ${recordId}:`, error);
                    })
                );
            });
            
            // Delete orphaned listings from Discogs
            listingsToDelete.forEach(listing => {
                promises.push(
                    fetch(`${window.AppConfig.baseUrl}/api/discogs/delete-listing/${listing.id}`, {
                        method: 'DELETE',
                        credentials: 'include',
                        headers: window.AppConfig.getHeaders()
                    }).then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            deletedCount++;
                        }
                    }).catch(error => {
                        console.error(`Error deleting listing ${listing.id}:`, error);
                    })
                );
            });
            
            // Wait for all updates to complete
            Promise.all(promises).then(() => {
                let summaryMessage = 'Sync complete:';
                if (clearedCount > 0) {
                    summaryMessage += `\n- ${clearedCount} invalid Discogs IDs cleared from local records`;
                }
                if (deletedCount > 0) {
                    summaryMessage += `\n- ${deletedCount} orphaned Discogs listings deleted`;
                }
                if (clearedCount === 0 && deletedCount === 0) {
                    summaryMessage += ' No changes needed';
                }
                
                showDiscogsStatus(summaryMessage, 'success');
                
                // Reload inventory
                setTimeout(() => {
                    loadDiscogsInventory();
                }, 1000);
            }).catch(error => {
                showDiscogsStatus(`Sync error: ${error.message}`, 'error');
            });
        })
        .catch(error => {
            showDiscogsStatus(`Error fetching local records: ${error.message}`, 'error');
        });
    })
    .catch(error => {
        console.error('Error syncing Discogs status:', error);
        let errorMessage = error.message;
        
        if (error.message.includes('Failed to fetch')) {
            errorMessage = 'Network error - Cannot connect to server. Please check your internet connection and try again.';
        } else if (error.message.includes('HTTP 401')) {
            errorMessage = 'Authentication failed. Please log in again.';
        } else if (error.message.includes('HTTP 403')) {
            errorMessage = 'Permission denied. You don\'t have access to Discogs listings.';
        } else if (error.message.includes('HTTP 404')) {
            errorMessage = 'Discogs API endpoint not found. Please check the configuration.';
        } else if (error.message.includes('HTTP 429')) {
            errorMessage = 'Rate limited by Discogs. Please wait a moment and try again.';
        } else if (error.message.includes('HTTP 500')) {
            errorMessage = 'Server error. Please try again later.';
        }
        
        showDiscogsStatus(`Sync error: ${errorMessage}`, 'error');
    });
}

/**
 * Load Discogs inventory
 */
function loadDiscogsInventory() {
    console.log('📀 Loading Discogs inventory...');
    
    const loadingEl = document.getElementById('discogs-loading');
    const tableBody = document.getElementById('discogs-inventory-body');
    
    if (loadingEl) loadingEl.style.display = 'block';
    
    if (tableBody) {
        tableBody.innerHTML = '<td colspan="15" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i><p>Loading inventory...</p><\/td>';
    }
    
    Promise.all([
        loadConditions(),
        loadConsignors(),
        loadDiscogsListings()
    ])
    .then(() => {
        return loadLocalInventory();
    })
    .then(() => {
        // After loading local inventory, update discogs_status for each record
        discogsInventory.forEach(record => {
            if (record.discogs_listing_id) {
                const discogsListing = discogsListingsMap[String(record.discogs_listing_id)];
                if (discogsListing) {
                    record.discogs_status = discogsListing.status;
                } else {
                    record.discogs_status = null;
                }
            } else {
                record.discogs_status = null;
            }
        });
        
        applyDiscogsFilters();
        updateDiscogsStats();
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        // Set up barcode scanner listener
        setupBarcodeScanner();
    })
    .catch(error => {
        console.error('Error loading inventory:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (tableBody) {
            tableBody.innerHTML = `<td colspan="15" style="text-align: center; padding: 40px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading inventory: ${error.message}</p>
                <button class="btn btn-primary" onclick="loadDiscogsInventory()">
                    <i class="fas fa-sync-alt"></i> Try Again
                </button>
             <\/td>`;
        }
    });
}

/**
 * Set up barcode scanner input listener
 */
function setupBarcodeScanner() {
    const barcodeInput = document.getElementById('batch-barcode-input');
    if (!barcodeInput) return;
    
    // Remove existing listener to avoid duplicates
    barcodeInput.removeEventListener('input', handleBarcodeInput);
    barcodeInput.addEventListener('input', handleBarcodeInput);
    
    // Focus the input
    barcodeInput.focus();
}

/**
 * Handle barcode input with debounce
 */
function handleBarcodeInput(event) {
    const value = event.target.value;
    
    // Clear previous timeout
    if (barcodeScannerTimeout) {
        clearTimeout(barcodeScannerTimeout);
    }
    
    // Debounce to avoid searching on every keystroke
    barcodeScannerTimeout = setTimeout(() => {
        if (value && value.trim() !== '') {
            scanBarcode(value);
        }
    }, 300);
}

/**
 * Print open Discogs orders
 */
function printDiscogsOrders() {
    if (openDiscogsOrders.length === 0) {
        showDiscogsStatus('No open orders to print', 'warning');
        return;
    }
    
    // Create print window
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    
    // Get current date for report header
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();
    
    // Calculate total sales
    const totalSales = openDiscogsOrders.reduce((sum, order) => sum + order.price, 0);
    
    // Generate HTML content
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Discogs Open Orders Report</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: Arial, Helvetica, sans-serif; padding: 20px; background: white; color: #333; }
                .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #333; }
                .header h1 { color: #333; margin-bottom: 10px; }
                .header .date { color: #666; font-size: 14px; }
                .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 30px; display: flex; justify-content: space-between; flex-wrap: wrap; }
                .summary-item { text-align: center; flex: 1; min-width: 150px; }
                .summary-item .label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
                .summary-item .value { font-size: 24px; font-weight: bold; color: #333; }
                .summary-item .value.sales { color: #28a745; }
                .orders-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                .orders-table th { background: #f8f9fa; border: 1px solid #ddd; padding: 12px; text-align: left; font-weight: bold; }
                .orders-table td { border: 1px solid #ddd; padding: 10px 12px; vertical-align: top; }
                .status-badge { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; background: #ffc107; color: #333; }
                .condition-badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 11px; background: #e9ecef; color: #333; }
                .genre-badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 11px; background: #d4edda; color: #155724; }
                .price { font-weight: bold; color: #28a745; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #666; }
                @media print { .no-print { display: none; } }
                .btn-small { padding: 4px 8px; font-size: 11px; border: none; border-radius: 3px; cursor: pointer; text-decoration: none; display: inline-block; }
                .btn-discogs { background: #333; color: white; }
            </style>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        </head>
        <body>
            <div class="header">
                <h1>🎵 Discogs Open Orders Report</h1>
                <div class="date">Generated: ${dateStr} at ${timeStr}</div>
            </div>
            <div class="summary">
                <div class="summary-item"><div class="label">Open Orders</div><div class="value">${openDiscogsOrders.length}</div></div>
                <div class="summary-item"><div class="label">Total Sales</div><div class="value sales">$${totalSales.toFixed(2)}</div></div>
            </div>
            <div style="margin-bottom: 15px; text-align: right;">
                <button class="btn-small btn-discogs no-print" onclick="window.print()">🖨️ Print this page</button>
            </div>
            <table class="orders-table">
                <thead>
                    <tr><th>#</th><th>Listing ID</th><th>Artist</th><th>Title</th><th>Genre</th><th>Price</th><th>Media</th><th>Sleeve</th><th>Order Date</th><th>Actions</th></thead>
                <tbody>
                    ${openDiscogsOrders.map((order, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${escapeHtml(String(order.listing_id))}</td>
                            <td><strong>${escapeHtml(order.artist)}</strong></td>
                            <td>${escapeHtml(order.title)}</td>
                            <td><span class="genre-badge">${escapeHtml(order.genre)}</span></td>
                            <td class="price">$${order.price.toFixed(2)}</td>
                            <td><span class="condition-badge">${escapeHtml(order.condition || 'N/A')}</span></td>
                            <td><span class="condition-badge">${escapeHtml(order.sleeve_condition || 'N/A')}</span></td>
                            <td>${order.order_date ? new Date(order.order_date).toLocaleDateString() : 'Unknown'}</td>
                            <td><a href="${order.url}" target="_blank" class="btn-small btn-discogs"><i class="fab fa-discogs"></i> View</a></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="footer"><p>Generated from PigStyle Music Admin Panel</p></div>
        </body>
        </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
}

/**
 * Apply filters to inventory
 */
function applyDiscogsFilters() {
    // First apply standard filters
    let filtered = discogsInventory.filter(record => {
        // Listing status filter (Discogs listing status - whether it has a Discogs listing ID)
        if (listingStatusFilter === 'listed' && !record.discogs_listing_id) return false;
        if (listingStatusFilter === 'unlisted' && record.discogs_listing_id) return false;
        
        // Local status filter (status in local database)
        if (localStatusFilter !== 'all') {
            if (localStatusFilter === 'active' && record.status_id !== 2) return false;
            if (localStatusFilter === 'new' && record.status_id !== 0) return false;
            if (localStatusFilter === 'sold' && record.status_id !== 3) return false;
        }
        
        // Discogs status filter - based on Discogs listing status, not local status
        if (discogsStatusFilter !== 'all') {
            // Only consider records that have a Discogs listing
            if (!record.discogs_listing_id) return false;
            
            if (discogsStatusFilter === 'active') {
                // Should show records that are listed and NOT sold on Discogs
                if (record.discogs_status === 'Sold') return false;
            } else if (discogsStatusFilter === 'sold') {
                // Should show records that are listed and SOLD on Discogs
                if (record.discogs_status !== 'Sold') return false;
            }
        }
        
        // Consignor filter
        if (consignorFilter !== 'all') {
            const consignorId = record.consignor_id;
            if (!consignorId) return false;
            if (String(consignorId) !== String(consignorFilter)) return false;
        }
        
        // Search filter
        if (searchFilter) {
            const searchLower = searchFilter.toLowerCase();
            const artist = (record.artist || '').toLowerCase();
            const title = (record.title || '').toLowerCase();
            const catalog = (record.catalog_number || '').toLowerCase();
            const barcode = (record.barcode || '').toLowerCase();
            const consignor = (record.consignor_name || '').toLowerCase();
            const genre = (record.genre_name || '').toLowerCase();
            
            if (!artist.includes(searchLower) && 
                !title.includes(searchLower) && 
                !catalog.includes(searchLower) && 
                !barcode.includes(searchLower) &&
                !consignor.includes(searchLower) &&
                !genre.includes(searchLower)) {
                return false;
            }
        }
        
        return true;
    });
    
    // Apply "Show Selected Only" filter
    if (showSelectedOnlyFilter === 'selected') {
        filtered = filtered.filter(record => discogsSelectedRecords.has(record.id));
    }
    
    filteredDiscogsInventory = filtered;
    
    discogsTotalPages = Math.ceil(filteredDiscogsInventory.length / discogsPageSize);
    if (discogsCurrentPage > discogsTotalPages) {
        discogsCurrentPage = discogsTotalPages || 1;
    }
    
    renderDiscogsInventory();
    updateDiscogsFilterCounts();
}

/**
 * Render inventory table
 */
function renderDiscogsInventory() {
    const tableBody = document.getElementById('discogs-inventory-body');
    const startIndex = (discogsCurrentPage - 1) * discogsPageSize;
    const endIndex = Math.min(startIndex + discogsPageSize, filteredDiscogsInventory.length);
    const pageRecords = filteredDiscogsInventory.slice(startIndex, endIndex);
    
    if (!tableBody) return;
    
    if (filteredDiscogsInventory.length === 0) {
        tableBody.innerHTML = '<td colspan="15" style="text-align: center; padding: 40px;"><i class="fab fa-discogs" style="font-size: 48px; color: #ccc;"></i><p>No records match your filters</p><\/td>';
        return;
    }
    
    let html = '';
    pageRecords.forEach(record => {
        const isSelected = discogsSelectedRecords.has(record.id);
        const isListed = record.discogs_listing_id ? true : false;
        const discogsListingId = record.discogs_listing_id || '';
        const isSold = record.status_id === 3;
        
        const sleeveConditionId = record.condition_sleeve_id;
        const discConditionId = record.condition_disc_id;
        
        const sleeveConditionObj = sleeveConditionId ? conditionsMap.byId[sleeveConditionId] : null;
        const discConditionObj = discConditionId ? conditionsMap.byId[discConditionId] : null;
        
        const sleeveCondition = sleeveConditionObj 
            ? (sleeveConditionObj.display_name || sleeveConditionObj.condition_name)
            : 'Not specified';
        const discCondition = discConditionObj
            ? (discConditionObj.display_name || discConditionObj.condition_name)
            : 'Not specified';
        
        let consignorDisplay = 'Store';
        if (record.consignor_id) {
            const consignor = consignorsList.find(c => String(c.id) === String(record.consignor_id));
            if (consignor) {
                consignorDisplay = consignor.full_name || consignor.username;
                if (consignor.initials) {
                    consignorDisplay += ` (${consignor.initials})`;
                }
            } else {
                consignorDisplay = record.consignor_name || 'Consignor';
            }
        }
        
        // Local status text
        let localStatusText = '';
        let localStatusClass = '';
        if (isSold) {
            localStatusText = 'Sold';
            localStatusClass = 'sold';
        } else if (record.status_id === 0) {
            localStatusText = 'New';
            localStatusClass = 'new';
        } else if (record.status_id === 2) {
            localStatusText = 'Active';
            localStatusClass = 'active';
        } else {
            localStatusText = 'Unknown';
            localStatusClass = '';
        }
        
        // Discogs status text - based on actual Discogs listing status
        let discogsStatusText = 'Not Listed';
        let discogsStatusClass = 'new';
        
        if (isListed) {
            if (record.discogs_status === 'Sold') {
                discogsStatusText = 'Sold on Discogs';
                discogsStatusClass = 'sold';
            } else if (record.discogs_status === 'For Sale') {
                discogsStatusText = 'Listed (For Sale)';
                discogsStatusClass = 'active';
            } else {
                discogsStatusText = 'Listed (Unknown)';
                discogsStatusClass = 'active';
            }
        }
        
        // Create hyperlink for Discogs Listing ID if it exists
        let discogsListingDisplay = '-';
        if (discogsListingId) {
            discogsListingDisplay = `<a href="https://www.discogs.com/sell/item/${discogsListingId}" target="_blank" class="discogs-link" title="View on Discogs">
                ${escapeHtml(String(discogsListingId))}
                <i class="fas fa-external-link-alt" style="font-size: 10px; margin-left: 3px;"></i>
            </a>`;
        }
        
        // Determine if checkbox should be disabled
        const checkboxDisabled = isListed || isSold || (record.discogs_status === 'Sold');
        
        html += `
            <tr class="${isSelected ? 'record-selected' : ''}">
                <td style="text-align: center;">
                    <input type="checkbox" 
                           class="discogs-record-checkbox" 
                           data-record-id="${record.id}" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="toggleDiscogsRecordSelection(${record.id}, this.checked)"
                           ${checkboxDisabled ? 'disabled' : ''}>
                  <\/td>
                  <td>${record.id}<\/td>
                  <td>${escapeHtml(record.artist || '')}<\/td>
                  <td>${escapeHtml(record.title || '')}<\/td>
                  <td>${escapeHtml(record.label || '')}<\/td>
                  <td>${escapeHtml(record.catalog_number || '')}<\/td>
                  <td>$${parseFloat(record.store_price || 0).toFixed(2)}<\/td>
                  <td><span class="condition-badge">${escapeHtml(sleeveCondition)}<\/span><\/td>
                  <td><span class="condition-badge">${escapeHtml(discCondition)}<\/span><\/td>
                  <td>${escapeHtml(consignorDisplay)}<\/td>
                  <td><span class="status-badge ${localStatusClass}">${escapeHtml(localStatusText)}<\/span><\/td>
                  <td><span class="status-badge ${discogsStatusClass}">${escapeHtml(discogsStatusText)}<\/span><\/td>
                  <td>${discogsListingDisplay}<\/td>
                  <td>${escapeHtml(record.location || '-')}<\/td>
                  <td>
                    ${!isListed && !isSold ? 
                        `<button class="btn btn-small btn-info" onclick="viewDiscogsMatch(${record.id})" title="Find on Discogs">
                            <i class="fab fa-discogs"></i> Find
                        </button>` : 
                        (isListed && record.discogs_status !== 'Sold' ? 
                            `<button class="btn btn-small btn-danger" onclick="deleteDiscogsListing(${record.id}, '${discogsListingId}')" title="Delete from Discogs">
                                <i class="fab fa-discogs"></i> Delete
                            </button>` : 
                            (record.discogs_status === 'Sold' ?
                                `<span class="status-badge sold" style="font-size: 11px;">Sold on Discogs</span>` : ''))
                    }
                  <\/td>
              <\/tr>
        `;
    });
    
    tableBody.innerHTML = html;
    updateDiscogsPagination();
    updateDiscogsSelectionCount();
    
    const selectAllCheckbox = document.getElementById('discogs-select-all');
    if (selectAllCheckbox) {
        const unlistedRecords = pageRecords.filter(r => !r.discogs_listing_id && r.status_id !== 3 && r.discogs_status !== 'Sold');
        const selectedUnlistedCount = Array.from(discogsSelectedRecords).filter(id => 
            pageRecords.some(r => r.id === id && !r.discogs_listing_id && r.status_id !== 3 && r.discogs_status !== 'Sold')
        ).length;
        
        selectAllCheckbox.checked = unlistedRecords.length > 0 && selectedUnlistedCount === unlistedRecords.length;
        selectAllCheckbox.indeterminate = selectedUnlistedCount > 0 && selectedUnlistedCount < unlistedRecords.length;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateDiscogsPagination() {
    const totalPagesEl = document.getElementById('discogs-total-pages');
    const currentPageEl = document.getElementById('discogs-current-page');
    const firstBtn = document.getElementById('discogs-first-btn');
    const prevBtn = document.getElementById('discogs-prev-btn');
    const nextBtn = document.getElementById('discogs-next-btn');
    const lastBtn = document.getElementById('discogs-last-btn');
    
    if (totalPagesEl) totalPagesEl.textContent = discogsTotalPages;
    if (currentPageEl) currentPageEl.value = discogsCurrentPage;
    
    if (firstBtn) firstBtn.disabled = discogsCurrentPage === 1;
    if (prevBtn) prevBtn.disabled = discogsCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = discogsCurrentPage === discogsTotalPages;
    if (lastBtn) lastBtn.disabled = discogsCurrentPage === discogsTotalPages;
}

function goToDiscogsPage(page) {
    if (page < 1 || page > discogsTotalPages) return;
    discogsCurrentPage = page;
    renderDiscogsInventory();
}

function changeDiscogsPageSize(size) {
    discogsPageSize = size;
    discogsCurrentPage = 1;
    applyDiscogsFilters();
}

function filterDiscogsInventory() {
    listingStatusFilter = document.getElementById('listing-status-filter').value;
    searchFilter = document.getElementById('discogs-search').value;
    consignorFilter = document.getElementById('consignor-filter').value;
    discogsStatusFilter = document.getElementById('discogs-status-filter').value;
    localStatusFilter = document.getElementById('local-status-filter').value;
    showSelectedOnlyFilter = document.getElementById('show-selected-filter').value;
    
    discogsCurrentPage = 1;
    applyDiscogsFilters();
}

function resetDiscogsFilters() {
    document.getElementById('listing-status-filter').value = 'all';
    document.getElementById('discogs-search').value = '';
    document.getElementById('consignor-filter').value = 'all';
    document.getElementById('discogs-status-filter').value = 'all';
    document.getElementById('local-status-filter').value = 'all';
    document.getElementById('show-selected-filter').value = 'selected';
    
    listingStatusFilter = 'all';
    searchFilter = '';
    consignorFilter = 'all';
    discogsStatusFilter = 'all';
    localStatusFilter = 'all';
    showSelectedOnlyFilter = 'selected';
    
    discogsCurrentPage = 1;
    applyDiscogsFilters();
}

function updateDiscogsStats() {
    const totalActive = discogsInventory.length;
    const listedCount = discogsInventory.filter(r => r.discogs_listing_id && r.discogs_status !== 'Sold').length;
    const soldOnDiscogsCount = discogsInventory.filter(r => r.discogs_status === 'Sold').length;
    const notListedCount = totalActive - listedCount - soldOnDiscogsCount;
    
    const totalActiveEl = document.getElementById('discogs-total-active');
    const listedCountEl = document.getElementById('discogs-listed-count');
    const notListedEl = document.getElementById('discogs-not-listed');
    const localCountEl = document.getElementById('local-record-count');
    
    if (totalActiveEl) totalActiveEl.textContent = totalActive;
    if (listedCountEl) listedCountEl.textContent = listedCount;
    if (notListedEl) notListedEl.textContent = notListedCount;
    if (localCountEl) localCountEl.textContent = totalActive;
}

function updateDiscogsFilterCounts() {
    const filteredCountEl = document.getElementById('discogs-filtered-count');
    const totalFilteredEl = document.getElementById('discogs-total-filtered');
    
    if (filteredCountEl) filteredCountEl.textContent = filteredDiscogsInventory.length;
    if (totalFilteredEl) totalFilteredEl.textContent = discogsInventory.length;
}

function toggleDiscogsRecordSelection(recordId, selected) {
    if (selected) {
        discogsSelectedRecords.add(recordId);
    } else {
        discogsSelectedRecords.delete(recordId);
    }
    
    updateDiscogsSelectionCount();
    
    // Re-apply filters to update the display (important for "Show Selected Only" mode)
    applyDiscogsFilters();
    
    const selectAllCheckbox = document.getElementById('discogs-select-all');
    if (selectAllCheckbox) {
        const currentPageRecords = filteredDiscogsInventory.slice(
            (discogsCurrentPage - 1) * discogsPageSize,
            discogsCurrentPage * discogsPageSize
        ).filter(r => !r.discogs_listing_id && r.status_id !== 3 && r.discogs_status !== 'Sold');
        
        const selectedOnPage = currentPageRecords.filter(r => discogsSelectedRecords.has(r.id)).length;
        
        selectAllCheckbox.checked = selectedOnPage === currentPageRecords.length && currentPageRecords.length > 0;
        selectAllCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < currentPageRecords.length;
    }
}

function toggleAllDiscogsRecords() {
    const selectAllCheckbox = document.getElementById('discogs-select-all');
    const checked = selectAllCheckbox.checked;
    
    const startIndex = (discogsCurrentPage - 1) * discogsPageSize;
    const endIndex = Math.min(startIndex + discogsPageSize, filteredDiscogsInventory.length);
    const pageRecords = filteredDiscogsInventory.slice(startIndex, endIndex);
    
    pageRecords.forEach(record => {
        if (!record.discogs_listing_id && record.status_id !== 3 && record.discogs_status !== 'Sold') {
            if (checked) {
                discogsSelectedRecords.add(record.id);
            } else {
                discogsSelectedRecords.delete(record.id);
            }
        }
    });
    
    // Re-apply filters to update the display
    applyDiscogsFilters();
}

function selectAllDiscogsRecords() {
    filteredDiscogsInventory.forEach(record => {
        if (!record.discogs_listing_id && record.status_id !== 3 && record.discogs_status !== 'Sold') {
            discogsSelectedRecords.add(record.id);
        }
    });
    applyDiscogsFilters();
}

function deselectAllDiscogsRecords() {
    discogsSelectedRecords.clear();
    applyDiscogsFilters();
}

function updateDiscogsSelectionCount() {
    const count = discogsSelectedRecords.size;
    const selectedCountEl = document.getElementById('selected-count');
    const discogsSelectedCountEl = document.getElementById('discogs-selected-count');
    const submitBtn = document.getElementById('submit-to-discogs-btn');
    
    if (selectedCountEl) selectedCountEl.textContent = count;
    if (discogsSelectedCountEl) discogsSelectedCountEl.textContent = count;
    if (submitBtn) submitBtn.disabled = count === 0;
}

// Global variable to track if submission is cancelled
let discogsSubmissionCancelled = false;

/**
 * Show location modal before submitting to Discogs
 */
function submitToDiscogs() {
    const selectedIds = Array.from(discogsSelectedRecords);
    
    if (selectedIds.length === 0) {
        showDiscogsStatus('Please select at least one record to list', 'warning');
        return;
    }
    
    // Prepare records for preview
    const selectedRecords = discogsInventory.filter(r => selectedIds.includes(r.id));
    
    // Store in global variable for modal confirmation
    pendingRecordsToSubmit = selectedRecords;
    
    // Update modal with record count and list
    const modalSelectedCount = document.getElementById('modal-selected-count');
    const modalRecordsList = document.getElementById('modal-records-list');
    
    if (modalSelectedCount) {
        modalSelectedCount.textContent = selectedRecords.length;
    }
    
    if (modalRecordsList) {
        let recordsHtml = '';
        selectedRecords.slice(0, 10).forEach(record => {
            recordsHtml += `<div style="margin-bottom: 5px; padding: 4px; border-bottom: 1px solid #eee;">
                <strong>#${record.id}</strong> - ${escapeHtml(record.artist)} - ${escapeHtml(record.title)}
            </div>`;
        });
        if (selectedRecords.length > 10) {
            recordsHtml += `<div style="color: #666; margin-top: 5px;">... and ${selectedRecords.length - 10} more</div>`;
        }
        modalRecordsList.innerHTML = recordsHtml;
    }
    
    // Clear previous location input
    const locationInput = document.getElementById('modal-location-input');
    if (locationInput) {
        locationInput.value = '';
        locationInput.focus();
    }
    
    // Show modal
    const modal = document.getElementById('discogs-location-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

/**
 * Close the location modal
 */
function closeDiscogsLocationModal() {
    const modal = document.getElementById('discogs-location-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    pendingRecordsToSubmit = [];
}

/**
 * Confirm and submit records to Discogs with location
 */
function confirmDiscogsSubmit() {
    const locationInput = document.getElementById('modal-location-input');
    const locationValue = locationInput ? locationInput.value.trim() : '';
    
    // Close modal
    closeDiscogsLocationModal();
    
    if (!pendingRecordsToSubmit || pendingRecordsToSubmit.length === 0) {
        showDiscogsStatus('No records to submit', 'warning');
        return;
    }
    
    // Prepare records with location
    const allRecordsToSubmit = pendingRecordsToSubmit.map(r => ({
        id: r.id,
        artist: r.artist,
        title: r.title,
        catalog_number: r.catalog_number || '',
        media_condition: getConditionName(r.condition_disc_id),
        sleeve_condition: getConditionName(r.condition_sleeve_id),
        price: r.store_price,
        notes: r.notes || '',
        location: locationValue
    }));
    
    // Reset cancellation flag
    discogsSubmissionCancelled = false;
    
    // Create a progress container with cancel button
    const statusEl = document.getElementById('discogs-status-message');
    if (statusEl) {
        statusEl.innerHTML = `
            <div style="margin-bottom: 10px;">
                <strong>📤 Submitting ${allRecordsToSubmit.length} records to Discogs...</strong>
                <button id="cancel-discogs-submit" class="btn btn-danger btn-small" style="margin-left: 15px; padding: 5px 10px;">
                    <i class="fas fa-times"></i> Cancel
                </button>
            </div>
            <div id="submit-progress" style="margin-top: 10px; max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 12px; background: #f8f9fa; padding: 10px; border-radius: 4px;"></div>
        `;
        statusEl.style.display = 'block';
        statusEl.className = 'status-message status-info';
        
        // Add cancel button event listener
        document.getElementById('cancel-discogs-submit').onclick = () => {
            discogsSubmissionCancelled = true;
            const progressEl = document.getElementById('submit-progress');
            if (progressEl) {
                progressEl.innerHTML += `<div style="color: #ffc107; margin-top: 10px;">⚠️ Submission cancelled by user</div>`;
            }
            if (statusEl) {
                statusEl.innerHTML = `<div>⏹️ Submission cancelled. ${allRecordsToSubmit.length} records not processed.</div>`;
                statusEl.className = 'status-message status-warning';
            }
        };
    }
    
    const progressEl = document.getElementById('submit-progress');
    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;
    
    function processRecord(index) {
        if (discogsSubmissionCancelled) {
            return;
        }
        
        if (index >= allRecordsToSubmit.length) {
            // All done
            let message = `<div style="margin-top: 10px;"><strong>✅ Listing Complete!</strong></div>`;
            message += `<div>✅ Successful: ${successCount}</div>`;
            message += `<div>❌ Failed: ${failCount}</div>`;
            message += `<div>📊 Total: ${allRecordsToSubmit.length}</div>`;
            
            if (failCount > 0) {
                message += `<div style="margin-top: 10px;"><strong>Failed Records:</strong></div>`;
            }
            
            if (statusEl) {
                statusEl.innerHTML = message;
                statusEl.className = 'status-message status-success';
            }
            
            discogsSelectedRecords.clear();
            updateDiscogsSelectionCount();
            loadDiscogsInventory();
            return;
        }
        
        const record = allRecordsToSubmit[index];
        const currentNum = index + 1;
        
        if (progressEl) {
            progressEl.innerHTML += `<div style="color: #007bff;">📤 [${currentNum}/${allRecordsToSubmit.length}] Processing: ${record.artist} - ${record.title} (ID: ${record.id})...</div>`;
            progressEl.scrollTop = progressEl.scrollHeight;
        }
        
        fetch(`${window.AppConfig.baseUrl}/api/discogs/create-listing-single`, {
            method: 'POST',
            credentials: 'include',
            headers: window.AppConfig.getHeaders(),
            body: JSON.stringify({ record: record })
        })
        .then(response => response.json())
        .then(data => {
            processedCount++;
            
            if (data.success) {
                successCount++;
                if (progressEl) {
                    progressEl.innerHTML += `<div style="color: #28a745;">✅ [${currentNum}/${allRecordsToSubmit.length}] Record ${record.id}: Listed! (Discogs ID: ${data.listing_id})</div>`;
                }
            } else {
                failCount++;
                if (progressEl) {
                    progressEl.innerHTML += `<div style="color: #dc3545;">❌ [${currentNum}/${allRecordsToSubmit.length}] Record ${record.id}: ${data.error}</div>`;
                }
            }
            progressEl.scrollTop = progressEl.scrollHeight;
            
            // Process next record after delay
            setTimeout(() => {
                processRecord(index + 1);
            }, 2000); // 2 second delay between records
        })
        .catch(error => {
            processedCount++;
            failCount++;
            if (progressEl) {
                progressEl.innerHTML += `<div style="color: #dc3545;">❌ [${currentNum}/${allRecordsToSubmit.length}] Record ${record.id}: Network error - ${error.message}</div>`;
                progressEl.scrollTop = progressEl.scrollHeight;
            }
            
            setTimeout(() => {
                processRecord(index + 1);
            }, 2000);
        });
    }
    
    // Start processing
    processRecord(0);
}

function deleteDiscogsListing(recordId, listingId) {
    if (!listingId) {
        showDiscogsStatus('No Discogs listing ID found for this record', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete this listing from Discogs?\n\nRecord ID: ${recordId}\nListing ID: ${listingId}`)) {
        return;
    }
    
    showDiscogsStatus(`Deleting listing ${listingId} from Discogs...`, 'info');
    
    fetch(`${window.AppConfig.baseUrl}/api/discogs/delete-listing/${listingId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            fetch(`${window.AppConfig.baseUrl}/records/${recordId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: window.AppConfig.getHeaders(),
                body: JSON.stringify({ discogs_listing_id: null })
            })
            .then(() => {
                showDiscogsStatus(`Successfully deleted listing ${listingId} from Discogs`, 'success');
                loadDiscogsInventory();
            })
            .catch(error => {
                console.error('Error updating local record:', error);
                showDiscogsStatus('Listing deleted from Discogs but failed to update local record', 'warning');
                loadDiscogsInventory();
            });
        } else {
            showDiscogsStatus(`Error deleting listing: ${data.error || 'Unknown error'}`, 'error');
        }
    })
    .catch(error => {
        console.error('Error deleting Discogs listing:', error);
        showDiscogsStatus(`Error: ${error.message}`, 'error');
    });
}

function showDiscogsStatus(message, type = 'info') {
    const statusEl = document.getElementById('discogs-status-message');
    if (!statusEl) return;
    
    // Clear any existing timeout
    if (window.statusTimeout) {
        clearTimeout(window.statusTimeout);
    }
    
    // Format the message with appropriate icon
    let icon = '';
    if (type === 'success') icon = '✅ ';
    else if (type === 'error') icon = '❌ ';
    else if (type === 'warning') icon = '⚠️ ';
    else if (type === 'info') icon = 'ℹ️ ';
    
    statusEl.innerHTML = `${icon}${escapeHtml(message)}`;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
    
    // Keep error messages visible longer (30 seconds)
    // Success messages disappear after 5 seconds
    // Info/warning messages after 10 seconds
    let timeoutDuration = 5000; // default 5 seconds
    if (type === 'error') {
        timeoutDuration = 30000; // 30 seconds for errors
    } else if (type === 'warning') {
        timeoutDuration = 10000; // 10 seconds for warnings
    } else if (type === 'info') {
        timeoutDuration = 8000; // 8 seconds for info
    }
    
    window.statusTimeout = setTimeout(() => {
        statusEl.style.display = 'none';
    }, timeoutDuration);
}

function getConditionName(conditionId) {
    if (!conditionId) return 'Not Specified';
    const condition = conditionsMap.byId[conditionId];
    return condition ? condition.condition_name : 'Not Specified';
}

function viewDiscogsMatch(recordId) {
    const record = discogsInventory.find(r => r.id == recordId);
    if (!record) return;
    
    const searchQuery = encodeURIComponent(`${record.artist} ${record.title}`);
    window.open(`https://www.discogs.com/search/?q=${searchQuery}`, '_blank');
}

// Initialize when tab is shown
document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('tabChanged', function(e) {
        if (e.detail.tabName === 'discogs') {
            console.log('📀 Discogs tab activated, loading inventory...');
            setTimeout(loadDiscogsInventory, 100);
        }
    });
});

console.log('✅ discogs.js loaded');