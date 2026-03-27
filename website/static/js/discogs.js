// discogs.js - Cleaned version with Discogs listings table and local inventory table

// State management
let discogsInventory = [];
let filteredDiscogsInventory = [];
let discogsCurrentPage = 1;
let discogsPageSize = 50;
let discogsTotalPages = 1;
let discogsSelectedRecords = new Set();

// Filter state
let sleeveConditionFilter = '';
let discConditionFilter = '';
let listingStatusFilter = 'all';
let searchFilter = '';
let consignorFilter = 'all';
let discogsStatusFilter = 'all';

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
window.populateConditionDropdowns = populateConditionDropdowns;
window.loadConsignors = loadConsignors;
window.loadDiscogsListings = loadDiscogsListings;

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
            
            populateConditionDropdowns(data.conditions);
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
 * Populate condition dropdowns
 */
function populateConditionDropdowns(conditions) {
    const sortedConditions = [...conditions].sort((a, b) => a.quality_index - b.quality_index);
    
    const sleeveDropdown = document.getElementById('sleeve-condition-filter');
    const discDropdown = document.getElementById('disc-condition-filter');
    
    if (!sleeveDropdown || !discDropdown) return;
    
    sleeveDropdown.innerHTML = '<option value="">All Conditions</option>';
    discDropdown.innerHTML = '<option value="">All Conditions</option>';
    
    sortedConditions.forEach(condition => {
        const displayText = condition.display_name || condition.condition_name;
        const optionValue = condition.condition_name;
        
        const sleeveOption = document.createElement('option');
        sleeveOption.value = optionValue;
        sleeveOption.textContent = displayText;
        sleeveDropdown.appendChild(sleeveOption);
        
        const discOption = document.createElement('option');
        discOption.value = optionValue;
        discOption.textContent = displayText;
        discDropdown.appendChild(discOption);
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
                consignor_id: record.consignor_id || null
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
    
    if (tableBody) {
        tableBody.innerHTML = '<td colspan="9" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Loading Discogs listings...<\/td>';
    }
    
    return fetch(url, {
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => response.json())
    .then(data => {
        if (!tableBody) return;
        
        if (data.success && data.listings && data.listings.length > 0) {
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
            tableBody.innerHTML = '<td colspan="9" style="text-align: center; padding: 40px;">No Discogs listings found<\/td>';
            if (orphanedCountEl) orphanedCountEl.textContent = 0;
            const listedCountEl = document.getElementById('discogs-listed-count');
            if (listedCountEl) listedCountEl.textContent = 0;
        }
        
        return data;
    })
    .catch(error => {
        console.error('Error loading Discogs listings:', error);
        if (tableBody) {
            tableBody.innerHTML = `<td colspan="9" style="text-align: center; padding: 40px; color: #dc3545;">Error: ${error.message}<\/td>`;
        }
        if (orphanedCountEl) orphanedCountEl.textContent = 0;
        return null;
    });
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
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            showDiscogsStatus('Failed to fetch Discogs listings', 'error');
            return;
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
        .then(response => response.json())
        .then(recordsData => {
            if (!recordsData.status === 'success' || !recordsData.records) {
                showDiscogsStatus('Failed to fetch local records', 'error');
                return;
            }
            
            const recordsWithDiscogsId = recordsData.records.filter(r => r.discogs_listing_id);
            const allRecordsMap = {};
            recordsData.records.forEach(r => { allRecordsMap[r.id] = r; });
            
            let recordsToClear = [];
            let listingsToDelete = [];
            
            // Check local records against Discogs
            recordsWithDiscogsId.forEach(record => {
                const listingId = String(record.discogs_listing_id);
                if (!discogsListingIds.has(listingId)) {
                    // Record has listing ID but it's not on Discogs - clear it
                    recordsToClear.push(record.id);
                }
            });
            
            // Check Discogs listings against local records
            data.listings.forEach(listing => {
                const listingId = String(listing.listing_id);
                const localRecord = recordsWithDiscogsId.find(r => String(r.discogs_listing_id) === listingId);
                if (!localRecord) {
                    // Discogs listing has no matching local record - delete from Discogs
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
                
                alert(summaryMessage);
                showDiscogsStatus(summaryMessage, 'success');
                
                // Reload inventory
                setTimeout(() => {
                    loadDiscogsInventory();
                }, 1000);
            });
        });
    })
    .catch(error => {
        console.error('Error syncing Discogs status:', error);
        showDiscogsStatus(`Sync error: ${error.message}`, 'error');
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
        tableBody.innerHTML = '<td colspan="13" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i><p>Loading inventory...</p><\/td>';
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
        applyDiscogsFilters();
        updateDiscogsStats();
        
        if (loadingEl) loadingEl.style.display = 'none';
    })
    .catch(error => {
        console.error('Error loading inventory:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (tableBody) {
            tableBody.innerHTML = `<td colspan="13" style="text-align: center; padding: 40px; color: #dc3545;">
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
 * Apply filters to inventory
 */
function applyDiscogsFilters() {
    filteredDiscogsInventory = discogsInventory.filter(record => {
        // Disc condition filter
        if (discConditionFilter) {
            const discConditionId = record.condition_disc_id;
            if (!discConditionId) return false;
            
            const discQuality = conditionsMap.qualityIndexMap[discConditionId];
            const filterQuality = conditionsMap.qualityIndexMap[discConditionFilter];
            
            if (discQuality === undefined || filterQuality === undefined) return false;
            if (discQuality > filterQuality) return false;
        }
        
        // Sleeve condition filter
        if (sleeveConditionFilter) {
            const sleeveConditionId = record.condition_sleeve_id;
            if (!sleeveConditionId) return false;
            
            const sleeveQuality = conditionsMap.qualityIndexMap[sleeveConditionId];
            const filterQuality = conditionsMap.qualityIndexMap[sleeveConditionFilter];
            
            if (sleeveQuality === undefined || filterQuality === undefined) return false;
            if (sleeveQuality > filterQuality) return false;
        }
        
        // Listing status filter
        if (listingStatusFilter === 'listed' && !record.discogs_listing_id) return false;
        if (listingStatusFilter === 'unlisted' && record.discogs_listing_id) return false;
        
        // Discogs status filter
        if (discogsStatusFilter !== 'all') {
            if (discogsStatusFilter === 'active' && record.status_id === 3) return false;
            if (discogsStatusFilter === 'sold' && record.status_id !== 3) return false;
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
            
            if (!artist.includes(searchLower) && 
                !title.includes(searchLower) && 
                !catalog.includes(searchLower) && 
                !barcode.includes(searchLower) &&
                !consignor.includes(searchLower)) {
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
 * Render inventory table
 */
function renderDiscogsInventory() {
    const tableBody = document.getElementById('discogs-inventory-body');
    const startIndex = (discogsCurrentPage - 1) * discogsPageSize;
    const endIndex = Math.min(startIndex + discogsPageSize, filteredDiscogsInventory.length);
    const pageRecords = filteredDiscogsInventory.slice(startIndex, endIndex);
    
    if (!tableBody) return;
    
    if (filteredDiscogsInventory.length === 0) {
        tableBody.innerHTML = '<td colspan="13" style="text-align: center; padding: 40px;"><i class="fab fa-discogs" style="font-size: 48px; color: #ccc;"></i><p>No records match your filters</p><\/td>';
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
        
        let statusText = isListed ? 'Listed' : 'Not Listed';
        if (isSold) statusText = 'Sold';
        
        // Create hyperlink for Discogs Listing ID if it exists
        let discogsListingDisplay = '-';
        if (discogsListingId) {
            discogsListingDisplay = `<a href="https://www.discogs.com/sell/item/${discogsListingId}" target="_blank" class="discogs-link" title="View on Discogs">
                ${escapeHtml(String(discogsListingId))}
                <i class="fas fa-external-link-alt" style="font-size: 10px; margin-left: 3px;"></i>
            </a>`;
        }
        
        html += `
            <tr class="${isSelected ? 'record-selected' : ''}">
                <td style="text-align: center;">
                    <input type="checkbox" 
                           class="discogs-record-checkbox" 
                           data-record-id="${record.id}" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="toggleDiscogsRecordSelection(${record.id}, this.checked)"
                           ${isListed || isSold ? 'disabled' : ''}>
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
                  <td>${isSold ? '<span class="status-badge sold">Sold</span>' : (isListed ? '<span class="status-badge paid">Listed</span>' : '<span class="status-badge new">Not Listed</span>')}<\/td>
                  <td>${discogsListingDisplay}<\/td>
                  <td>
                    ${!isListed && !isSold ? 
                        `<button class="btn btn-small btn-info" onclick="viewDiscogsMatch(${record.id})" title="Find on Discogs">
                            <i class="fab fa-discogs"></i> Find
                        </button>` : 
                        (isListed ? 
                            `<button class="btn btn-small btn-danger" onclick="deleteDiscogsListing(${record.id}, '${discogsListingId}')" title="Delete from Discogs">
                                <i class="fab fa-discogs"></i> Delete
                            </button>` : '')
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
        const unlistedRecords = pageRecords.filter(r => !r.discogs_listing_id && r.status_id !== 3);
        const selectedUnlistedCount = Array.from(discogsSelectedRecords).filter(id => 
            pageRecords.some(r => r.id === id && !r.discogs_listing_id && r.status_id !== 3)
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
    sleeveConditionFilter = document.getElementById('sleeve-condition-filter').value;
    discConditionFilter = document.getElementById('disc-condition-filter').value;
    listingStatusFilter = document.getElementById('listing-status-filter').value;
    searchFilter = document.getElementById('discogs-search').value;
    consignorFilter = document.getElementById('consignor-filter').value;
    discogsStatusFilter = document.getElementById('discogs-status-filter').value;
    
    discogsCurrentPage = 1;
    applyDiscogsFilters();
}

function resetDiscogsFilters() {
    document.getElementById('sleeve-condition-filter').value = '';
    document.getElementById('disc-condition-filter').value = '';
    document.getElementById('listing-status-filter').value = 'all';
    document.getElementById('discogs-search').value = '';
    document.getElementById('consignor-filter').value = 'all';
    document.getElementById('discogs-status-filter').value = 'all';
    
    sleeveConditionFilter = '';
    discConditionFilter = '';
    listingStatusFilter = 'all';
    searchFilter = '';
    consignorFilter = 'all';
    discogsStatusFilter = 'all';
    
    discogsCurrentPage = 1;
    applyDiscogsFilters();
}

function updateDiscogsStats() {
    const totalActive = discogsInventory.length;
    const listedCount = discogsInventory.filter(r => r.discogs_listing_id && r.status_id !== 3).length;
    const soldCount = discogsInventory.filter(r => r.status_id === 3).length;
    const notListedCount = totalActive - listedCount - soldCount;
    
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
    
    const selectAllCheckbox = document.getElementById('discogs-select-all');
    if (selectAllCheckbox) {
        const currentPageRecords = filteredDiscogsInventory.slice(
            (discogsCurrentPage - 1) * discogsPageSize,
            discogsCurrentPage * discogsPageSize
        ).filter(r => !r.discogs_listing_id && r.status_id !== 3);
        
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
        if (!record.discogs_listing_id && record.status_id !== 3) {
            if (checked) {
                discogsSelectedRecords.add(record.id);
            } else {
                discogsSelectedRecords.delete(record.id);
            }
        }
    });
    
    renderDiscogsInventory();
}

function selectAllDiscogsRecords() {
    filteredDiscogsInventory.forEach(record => {
        if (!record.discogs_listing_id && record.status_id !== 3) {
            discogsSelectedRecords.add(record.id);
        }
    });
    renderDiscogsInventory();
}

function deselectAllDiscogsRecords() {
    discogsSelectedRecords.clear();
    renderDiscogsInventory();
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

function submitToDiscogs() {
    const selectedIds = Array.from(discogsSelectedRecords);
    
    if (selectedIds.length === 0) {
        showDiscogsStatus('Please select at least one record to list', 'warning');
        return;
    }
    
    const recordsToSubmit = discogsInventory
        .filter(r => selectedIds.includes(r.id))
        .map(r => ({
            id: r.id,
            artist: r.artist,
            title: r.title,
            catalog_number: r.catalog_number || '',
            media_condition: getConditionName(r.condition_disc_id),
            sleeve_condition: getConditionName(r.condition_sleeve_id),
            price: r.store_price,
            notes: r.notes || ''
        }));
    
    showDiscogsStatus(`Submitting ${recordsToSubmit.length} records to Discogs...`, 'info');
    
    fetch(`${window.AppConfig.baseUrl}/api/discogs/create-listings`, {
        method: 'POST',
        credentials: 'include',
        headers: window.AppConfig.getHeaders(),
        body: JSON.stringify({ records: recordsToSubmit })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showDiscogsStatus(`Successfully listed ${data.successful} items on Discogs`, 'success');
            discogsSelectedRecords.clear();
            updateDiscogsSelectionCount();
            loadDiscogsInventory();
        } else {
            showDiscogsStatus(`Error: ${data.error || 'Unknown error'}`, 'error');
        }
    })
    .catch(error => {
        console.error('Error submitting to Discogs:', error);
        showDiscogsStatus(`Error: ${error.message}`, 'error');
    });
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
    
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
    
    if (type !== 'error') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
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