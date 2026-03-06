// discogs.js - Fixed version with backend API integration

/**
 * Discogs Inventory Management Module
 * Handles filtering, selecting, and submitting records to Discogs seller account
 */

// State management
let discogsInventory = [];
let filteredDiscogsInventory = [];
let discogsCurrentPage = 1;
let discogsPageSize = 50;
let discogsTotalPages = 1;
let discogsSelectedRecords = new Set(); // Store selected record IDs

// Filter state
let sleeveConditionFilter = '';
let discConditionFilter = '';
let listingStatusFilter = 'all';
let searchFilter = '';

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
window.syncDiscogsListings = syncDiscogsListings;
window.viewDiscogsMatch = viewDiscogsMatch;

/**
 * Load inventory for Discogs tab
 */
function loadDiscogsInventory() {
    console.log('📀 loadDiscogsInventory: Loading Discogs inventory...');
    
    const loadingEl = document.getElementById('discogs-loading');
    const tableBody = document.getElementById('discogs-inventory-body');
    const statusMsg = document.getElementById('discogs-status-message');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (statusMsg) statusMsg.style.display = 'none';
    
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 32px;"></i><p>Loading inventory...</p></td></tr>';
    }
    
    // First, check Discogs authentication status
    fetch(`${window.AppConfig.baseUrl}/api/discogs/check-auth`, {
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => response.json())
    .then(authData => {
        console.log('📀 Discogs auth status:', authData);
        
        // Load local records regardless of auth status
        return loadLocalInventory();
    })
    .catch(error => {
        console.error('📀 Error checking Discogs auth:', error);
        // Still try to load local records
        return loadLocalInventory();
    });
}

/**
 * Load local inventory from database
 */
function loadLocalInventory() {
    return fetch(`${window.AppConfig.baseUrl}/records?status=active&limit=1000`, {
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('📀 loadDiscogsInventory: Received data:', data);
        
        if (data.status === 'success' && data.records) {
            // Initialize records with discogs_listed flag (default to false)
            discogsInventory = data.records.map(record => ({
                ...record,
                discogs_listed: false // Will be updated by sync function if implemented
            }));
            
            console.log(`📀 loadDiscogsInventory: Loaded ${discogsInventory.length} records`);
            
            // Try to sync with Discogs to mark which ones are already listed
            checkDiscogsListings();
            
            applyDiscogsFilters();
            updateDiscogsStats();
            
            const loadingEl = document.getElementById('discogs-loading');
            if (loadingEl) loadingEl.style.display = 'none';
        } else {
            throw new Error('Invalid response format');
        }
    })
    .catch(error => {
        console.error('📀 loadDiscogsInventory: Error loading inventory:', error);
        
        const tableBody = document.getElementById('discogs-inventory-body');
        const loadingEl = document.getElementById('discogs-loading');
        
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 40px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                <p>Error loading inventory: ${error.message}</p>
                <button class="btn btn-primary" onclick="loadDiscogsInventory()">
                    <i class="fas fa-sync-alt"></i> Try Again
                </button>
            </td></tr>`;
        }
        
        if (loadingEl) loadingEl.style.display = 'none';
    });
}

/**
 * Check which records are already listed on Discogs
 */
function checkDiscogsListings() {
    // First check if authenticated
    fetch(`${window.AppConfig.baseUrl}/api/discogs/check-auth`, {
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => response.json())
    .then(authData => {
        if (!authData.authenticated) {
            console.log('📀 Not authenticated with Discogs, cannot check listings');
            return;
        }
        
        // Fetch actual Discogs listings
        return fetch(`${window.AppConfig.baseUrl}/api/discogs/my-listings`, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders()
        });
    })
    .then(response => {
        if (!response) return;
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data && data.success && data.listings) {
            console.log(`📀 Found ${data.listings.length} listings on Discogs`);
            
            // Create a map of release_id to listing info
            const discogsListingsMap = {};
            data.listings.forEach(listing => {
                discogsListingsMap[listing.release_id] = {
                    listing_id: listing.listing_id,
                    price: listing.price,
                    condition: listing.condition
                };
            });
            
            // Update local inventory with listing status
            // This would require matching logic - you might need to store discogs_release_id in your records
            // For now, we'll just show that we have listings
            updateDiscogsStats();
        }
    })
    .catch(error => {
        console.error('📀 Error checking Discogs listings:', error);
    });
}

/**
 * Apply filters to inventory
 */
function applyDiscogsFilters() {
    filteredDiscogsInventory = discogsInventory.filter(record => {
        // Sleeve condition filter
        if (sleeveConditionFilter) {
            const conditionValue = getConditionValue(record.sleeve_condition || record.condition || '');
            const filterValue = getConditionValue(sleeveConditionFilter);
            if (conditionValue < filterValue) return false;
        }
        
        // Disc condition filter
        if (discConditionFilter) {
            const conditionValue = getConditionValue(record.media_condition || record.condition || '');
            const filterValue = getConditionValue(discConditionFilter);
            if (conditionValue < filterValue) return false;
        }
        
        // Listing status filter
        if (listingStatusFilter === 'listed' && !record.discogs_listed) return false;
        if (listingStatusFilter === 'unlisted' && record.discogs_listed) return false;
        
        // Search filter
        if (searchFilter) {
            const searchLower = searchFilter.toLowerCase();
            const artist = (record.artist || '').toLowerCase();
            const title = (record.title || '').toLowerCase();
            const catalog = (record.catalog_number || '').toLowerCase();
            const barcode = (record.barcode || '').toLowerCase();
            
            if (!artist.includes(searchLower) && 
                !title.includes(searchLower) && 
                !catalog.includes(searchLower) && 
                !barcode.includes(searchLower)) {
                return false;
            }
        }
        
        return true;
    });
    
    discogsTotalPages = Math.ceil(filteredDiscogsInventory.length / discogsPageSize);
    if (discogsCurrentPage > discogsTotalPages) {
        discogsCurrentPage = discogsTotalPages || 1;
    }
    
    renderDiscogsInventory();
    updateDiscogsFilterCounts();
}

/**
 * Get numeric value for condition for comparison
 */
function getConditionValue(condition) {
    const conditionOrder = {
        'Mint (M)': 10,
        'Near Mint (NM or M-)': 9,
        'Very Good Plus (VG+)': 8,
        'Very Good (VG)': 7,
        'Good Plus (G+)': 6,
        'Good (G)': 5,
        'Fair (F)': 4,
        'Poor (P)': 3
    };
    
    // Extract the condition string if it contains additional text
    for (const [key, value] of Object.entries(conditionOrder)) {
        if (condition && condition.includes(key)) {
            return value;
        }
    }
    
    return 0; // Unknown condition
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
        tableBody.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 40px;"><i class="fab fa-discogs" style="font-size: 48px; margin-bottom: 20px; color: #ccc; display: block;"></i><p>No records match your filters</p></td></tr>';
        return;
    }
    
    let html = '';
    pageRecords.forEach(record => {
        const isSelected = discogsSelectedRecords.has(record.id);
        const isListed = record.discogs_listed || false;
        
        // Get condition values
        const sleeveCondition = record.sleeve_condition || record.condition || 'Not specified';
        const discCondition = record.media_condition || record.condition || 'Not specified';
        
        html += `
            <tr class="${isSelected ? 'record-selected' : ''} ${isListed ? 'record-listed' : ''}">
                <td style="text-align: center;">
                    <input type="checkbox" 
                           class="discogs-record-checkbox" 
                           data-record-id="${record.id}" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="toggleDiscogsRecordSelection(${record.id}, this.checked)"
                           ${isListed ? 'disabled' : ''}>
                </td>
                <td>${record.id}</td>
                <td>${escapeHtml(record.artist || '')}</td>
                <td>${escapeHtml(record.title || '')}</td>
                <td>${escapeHtml(record.label || '')}</td>
                <td>${escapeHtml(record.catalog_number || '')}</td>
                <td>$${parseFloat(record.store_price || 0).toFixed(2)}</td>
                <td><span class="condition-badge">${escapeHtml(sleeveCondition)}</span></td>
                <td><span class="condition-badge">${escapeHtml(discCondition)}</span></td>
                <td>
                    ${isListed ? 
                        '<span class="status-badge paid">Listed</span>' : 
                        '<span class="status-badge new">Not Listed</span>'}
                </td>
                <td>${record.discogs_release_id ? escapeHtml(record.discogs_release_id) : '-'}</td>
                <td>
                    ${!isListed ? `
                        <button class="btn btn-small btn-info" onclick="viewDiscogsMatch(${record.id})" title="Find on Discogs">
                            <i class="fab fa-discogs"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
    updateDiscogsPagination();
    updateDiscogsSelectionCount();
    
    // Update select all checkbox
    const selectAllCheckbox = document.getElementById('discogs-select-all');
    if (selectAllCheckbox) {
        const unlistedRecords = pageRecords.filter(r => !r.discogs_listed);
        const selectedUnlistedCount = Array.from(discogsSelectedRecords).filter(id => 
            pageRecords.some(r => r.id === id && !r.discogs_listed)
        ).length;
        
        selectAllCheckbox.checked = unlistedRecords.length > 0 && selectedUnlistedCount === unlistedRecords.length;
        selectAllCheckbox.indeterminate = selectedUnlistedCount > 0 && selectedUnlistedCount < unlistedRecords.length;
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Update pagination controls
 */
function updateDiscogsPagination() {
    document.getElementById('discogs-total-pages').textContent = discogsTotalPages;
    document.getElementById('discogs-current-page').value = discogsCurrentPage;
    
    document.getElementById('discogs-first-btn').disabled = discogsCurrentPage === 1;
    document.getElementById('discogs-prev-btn').disabled = discogsCurrentPage === 1;
    document.getElementById('discogs-next-btn').disabled = discogsCurrentPage === discogsTotalPages;
    document.getElementById('discogs-last-btn').disabled = discogsCurrentPage === discogsTotalPages;
}

/**
 * Go to specific page
 */
function goToDiscogsPage(page) {
    if (page < 1 || page > discogsTotalPages) return;
    discogsCurrentPage = page;
    renderDiscogsInventory();
}

/**
 * Change page size
 */
function changeDiscogsPageSize(size) {
    discogsPageSize = size;
    discogsCurrentPage = 1;
    applyDiscogsFilters();
}

/**
 * Filter inventory based on current filter values
 */
function filterDiscogsInventory() {
    sleeveConditionFilter = document.getElementById('sleeve-condition-filter').value;
    discConditionFilter = document.getElementById('disc-condition-filter').value;
    listingStatusFilter = document.getElementById('listing-status-filter').value;
    searchFilter = document.getElementById('discogs-search').value;
    
    discogsCurrentPage = 1;
    applyDiscogsFilters();
}

/**
 * Reset all filters
 */
function resetDiscogsFilters() {
    document.getElementById('sleeve-condition-filter').value = '';
    document.getElementById('disc-condition-filter').value = '';
    document.getElementById('listing-status-filter').value = 'all';
    document.getElementById('discogs-search').value = '';
    
    sleeveConditionFilter = '';
    discConditionFilter = '';
    listingStatusFilter = 'all';
    searchFilter = '';
    
    discogsCurrentPage = 1;
    applyDiscogsFilters();
}

/**
 * Update stats displays
 */
function updateDiscogsStats() {
    const totalActive = discogsInventory.length;
    const listedCount = discogsInventory.filter(r => r.discogs_listed).length;
    const notListedCount = totalActive - listedCount;
    
    document.getElementById('discogs-total-active').textContent = totalActive;
    document.getElementById('discogs-listed-count').textContent = listedCount;
    document.getElementById('discogs-not-listed').textContent = notListedCount;
}

/**
 * Update filter counts display
 */
function updateDiscogsFilterCounts() {
    document.getElementById('discogs-filtered-count').textContent = filteredDiscogsInventory.length;
    document.getElementById('discogs-total-filtered').textContent = discogsInventory.length;
}

/**
 * Toggle selection of a single record
 */
function toggleDiscogsRecordSelection(recordId, selected) {
    if (selected) {
        discogsSelectedRecords.add(recordId);
    } else {
        discogsSelectedRecords.delete(recordId);
    }
    
    updateDiscogsSelectionCount();
    
    // Update select all checkbox state
    const selectAllCheckbox = document.getElementById('discogs-select-all');
    if (selectAllCheckbox) {
        const currentPageRecords = filteredDiscogsInventory.slice(
            (discogsCurrentPage - 1) * discogsPageSize,
            discogsCurrentPage * discogsPageSize
        ).filter(r => !r.discogs_listed);
        
        const selectedOnPage = currentPageRecords.filter(r => discogsSelectedRecords.has(r.id)).length;
        
        selectAllCheckbox.checked = selectedOnPage === currentPageRecords.length && currentPageRecords.length > 0;
        selectAllCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < currentPageRecords.length;
    }
}

/**
 * Toggle all records on current page
 */
function toggleAllDiscogsRecords() {
    const selectAllCheckbox = document.getElementById('discogs-select-all');
    const checked = selectAllCheckbox.checked;
    
    const startIndex = (discogsCurrentPage - 1) * discogsPageSize;
    const endIndex = Math.min(startIndex + discogsPageSize, filteredDiscogsInventory.length);
    const pageRecords = filteredDiscogsInventory.slice(startIndex, endIndex);
    
    pageRecords.forEach(record => {
        if (!record.discogs_listed) {
            if (checked) {
                discogsSelectedRecords.add(record.id);
            } else {
                discogsSelectedRecords.delete(record.id);
            }
        }
    });
    
    renderDiscogsInventory();
}

/**
 * Select all records across all pages
 */
function selectAllDiscogsRecords() {
    filteredDiscogsInventory.forEach(record => {
        if (!record.discogs_listed) {
            discogsSelectedRecords.add(record.id);
        }
    });
    
    renderDiscogsInventory();
}

/**
 * Deselect all records
 */
function deselectAllDiscogsRecords() {
    discogsSelectedRecords.clear();
    renderDiscogsInventory();
}

/**
 * Update selected count display
 */
function updateDiscogsSelectionCount() {
    const count = discogsSelectedRecords.size;
    document.getElementById('selected-count').textContent = count;
    document.getElementById('discogs-selected-count').textContent = count;
    
    const submitBtn = document.getElementById('submit-to-discogs-btn');
    if (submitBtn) {
        submitBtn.disabled = count === 0;
    }
}

/**
 * Submit selected records to Discogs
 */
function submitToDiscogs() {
    const selectedIds = Array.from(discogsSelectedRecords);
    
    if (selectedIds.length === 0) {
        showDiscogsStatus('Please select at least one record to list', 'warning');
        return;
    }
    
    // Get selected records
    const recordsToSubmit = discogsInventory
        .filter(r => selectedIds.includes(r.id))
        .map(r => ({
            id: r.id,
            artist: r.artist,
            title: r.title,
            catalog_number: r.catalog_number,
            media_condition: r.media_condition || r.condition || '',
            sleeve_condition: r.sleeve_condition || r.condition || '',
            price: r.store_price,
            discogs_release_id: r.discogs_release_id,
            notes: r.notes || ''
        }));
    
    // Check for missing release IDs
    const missingRelease = recordsToSubmit.filter(r => !r.discogs_release_id);
    if (missingRelease.length > 0) {
        showDiscogsStatus(`${missingRelease.length} records need Discogs release IDs. Please add them first.`, 'warning');
        return;
    }
    
    // Check authentication first
    showDiscogsStatus('Checking Discogs authentication...', 'info');
    
    fetch(`${window.AppConfig.baseUrl}/api/discogs/check-auth`, {
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(res => res.json())
    .then(authData => {
        if (!authData.authenticated) {
            // Start OAuth flow
            showDiscogsStatus('Redirecting to Discogs for authorization...', 'info');
            
            return fetch(`${window.AppConfig.baseUrl}/api/discogs/auth`, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders()
            })
            .then(res => res.json())
            .then(authUrlData => {
                if (authUrlData.auth_url) {
                    window.location.href = authUrlData.auth_url;
                } else {
                    throw new Error('Failed to get authorization URL');
                }
            });
        }
        
        // Already authenticated, proceed with listing
        return submitListingsToDiscogs(recordsToSubmit);
    })
    .catch(error => {
        console.error('Error in Discogs auth flow:', error);
        showDiscogsStatus(`Error: ${error.message}`, 'error');
    });
}

/**
 * Submit listings to Discogs API
 */
function submitListingsToDiscogs(records) {
    showDiscogsStatus('Submitting to Discogs...', 'info');
    
    fetch(`${window.AppConfig.baseUrl}/api/discogs/create-listings`, {
        method: 'POST',
        credentials: 'include',
        headers: window.AppConfig.getHeaders(),
        body: JSON.stringify({ records: records })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showDiscogsStatus(`Successfully listed ${data.successful} items on Discogs`, 'success');
            discogsSelectedRecords.clear();
            loadDiscogsInventory(); // Reload
        } else {
            showDiscogsStatus(`Error: ${data.error || 'Unknown error'}`, 'error');
        }
    })
    .catch(error => {
        console.error('Error submitting to Discogs:', error);
        showDiscogsStatus(`Error: ${error.message}`, 'error');
    });
}

/**
 * Sync with existing Discogs listings
 */
function syncDiscogsListings() {
    showDiscogsStatus('Syncing with Discogs...', 'info');
    
    fetch(`${window.AppConfig.baseUrl}/api/discogs/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showDiscogsStatus(`Sync complete. Found ${data.count} listings on Discogs.`, 'success');
            loadDiscogsInventory(); // Reload with updated data
        } else {
            showDiscogsStatus(`Sync error: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        console.error('Sync error:', error);
        showDiscogsStatus(`Sync error: ${error.message}`, 'error');
    });
}

/**
 * View Discogs match for a record
 */
function viewDiscogsMatch(recordId) {
    const record = discogsInventory.find(r => r.id == recordId);
    if (!record) return;
    
    // Open Discogs search in new window
    const searchQuery = encodeURIComponent(`${record.artist} ${record.title}`);
    window.open(`https://www.discogs.com/search/?q=${searchQuery}`, '_blank');
}

/**
 * Show status message
 */
function showDiscogsStatus(message, type = 'info') {
    const statusEl = document.getElementById('discogs-status-message');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

// Initialize when tab is shown
document.addEventListener('DOMContentLoaded', function() {
    // Listen for tab changes
    document.addEventListener('tabChanged', function(e) {
        if (e.detail.tabName === 'discogs') {
            console.log('📀 Discogs tab activated, loading inventory...');
            setTimeout(loadDiscogsInventory, 100);
        }
    });
    
    // Also check if we're coming back from OAuth callback
    if (window.location.hash === '#discogs') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('oauth_token') || params.get('oauth_verifier')) {
            console.log('📀 Returning from Discogs OAuth, reloading inventory...');
            setTimeout(loadDiscogsInventory, 500);
        }
    }
});

console.log('✅ discogs.js loaded successfully');