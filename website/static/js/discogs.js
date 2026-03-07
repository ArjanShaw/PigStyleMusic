// discogs.js - Complete version with database-driven condition filtering and consignor filter

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
let consignorFilter = 'all'; // New consignor filter

// Conditions data from database
let conditionsMap = {
    byId: {},           // id -> condition object
    byName: {},         // condition_name -> condition object
    byDisplayName: {},  // display_name -> condition object
    byAbbreviation: {}, // abbreviation -> condition object
    qualityIndexMap: {} // Maps condition identifiers to quality_index
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
window.syncDiscogsListings = syncDiscogsListings;
window.viewDiscogsMatch = viewDiscogsMatch;
window.populateConditionDropdowns = populateConditionDropdowns;
window.loadConsignors = loadConsignors; // New function

/**
 * Load conditions from database and populate dropdowns
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
            // Create maps for quick lookup
            conditionsMap = {
                byId: {},
                byName: {},
                byDisplayName: {},
                byAbbreviation: {},
                qualityIndexMap: {}
            };
            
            data.conditions.forEach(condition => {
                // Store by ID
                conditionsMap.byId[condition.id] = condition;
                
                // Store by condition_name
                conditionsMap.byName[condition.condition_name] = condition;
                
                // Store by display_name (what users see)
                conditionsMap.byDisplayName[condition.display_name] = condition;
                
                // Store by abbreviation if available
                if (condition.abbreviation) {
                    conditionsMap.byAbbreviation[condition.abbreviation] = condition;
                }
                
                // Store quality index by various identifiers for easy lookup
                conditionsMap.qualityIndexMap[condition.id] = condition.quality_index;
                conditionsMap.qualityIndexMap[condition.condition_name] = condition.quality_index;
                conditionsMap.qualityIndexMap[condition.display_name] = condition.quality_index;
                if (condition.abbreviation) {
                    conditionsMap.qualityIndexMap[condition.abbreviation] = condition.quality_index;
                }
            });
            
            console.log('📀 Conditions loaded:', conditionsMap);
            
            // Populate the dropdowns with conditions from database
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
            
            console.log(`👤 Loaded ${consignorsList.length} consignors`);
            
            // Populate consignor dropdown
            populateConsignorDropdown(consignorsList);
            
            return consignorsList;
        } else {
            console.warn('No consignors found or error loading consignors');
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
    
    if (!consignorDropdown) {
        console.error('Consignor dropdown element not found');
        return;
    }
    
    // Clear existing options and add default
    consignorDropdown.innerHTML = '<option value="all">All Consignors</option>';
    
    // Sort consignors by name
    const sortedConsignors = [...consignors].sort((a, b) => {
        const nameA = (a.full_name || a.username).toLowerCase();
        const nameB = (b.full_name || b.username).toLowerCase();
        return nameA.localeCompare(nameB);
    });
    
    // Add consignor options
    sortedConsignors.forEach(consignor => {
        const option = document.createElement('option');
        option.value = consignor.id;
        
        // Display name with initials if available
        let displayName = consignor.full_name || consignor.username;
        if (consignor.initials) {
            displayName += ` (${consignor.initials})`;
        }
        
        option.textContent = displayName;
        consignorDropdown.appendChild(option);
    });
    
    console.log(`👤 Populated consignor dropdown with ${consignors.length} consignors`);
}

/**
 * Populate condition dropdowns with data from database
 */
function populateConditionDropdowns(conditions) {
    console.log('📀 Populating condition dropdowns with', conditions.length, 'conditions');
    
    // Sort conditions by quality_index (best to worst)
    const sortedConditions = [...conditions].sort((a, b) => a.quality_index - b.quality_index);
    
    // Get both dropdown elements
    const sleeveDropdown = document.getElementById('sleeve-condition-filter');
    const discDropdown = document.getElementById('disc-condition-filter');
    
    if (!sleeveDropdown || !discDropdown) {
        console.error('Dropdown elements not found');
        return;
    }
    
    // Clear existing options (except the first "All Conditions" option)
    sleeveDropdown.innerHTML = '<option value="">All Conditions</option>';
    discDropdown.innerHTML = '<option value="">All Conditions</option>';
    
    // Add options from database
    sortedConditions.forEach(condition => {
        // Use display_name for what users see
        const displayText = condition.display_name || condition.condition_name;
        
        // Use the condition_name as the value (since we have mapping)
        // This ensures backward compatibility with existing code
        const optionValue = condition.condition_name;
        
        // Create option elements
        const sleeveOption = document.createElement('option');
        sleeveOption.value = optionValue;
        sleeveOption.textContent = displayText;
        sleeveDropdown.appendChild(sleeveOption);
        
        const discOption = document.createElement('option');
        discOption.value = optionValue;
        discOption.textContent = displayText;
        discDropdown.appendChild(discOption);
    });
    
    console.log('📀 Dropdowns populated successfully');
}

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
        tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 32px;"></i><p>Loading inventory...</p></td></tr>';
    }
    
    // First load conditions and populate dropdowns
    Promise.all([
        loadConditions(),
        loadConsignors() // Load consignors in parallel
    ])
        .then(() => {
            // Then check Discogs authentication status
            return fetch(`${window.AppConfig.baseUrl}/api/discogs/check-auth`, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders()
            });
        })
        .then(response => response.json())
        .then(authData => {
            console.log('📀 Discogs auth status:', authData);
            // Load local records
            return loadLocalInventory();
        })
        .catch(error => {
            console.error('📀 Error in initialization:', error);
            // Still try to load local records
            return loadLocalInventory();
        });
}

/**
 * Load local inventory from database
 */
function loadLocalInventory() {
    // Load up to 10000 records (adjust as needed)
    return fetch(`${window.AppConfig.baseUrl}/records?status=active&limit=10000`, {
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
                discogs_listed: false, // Will be updated by sync function if implemented
                consignor_name: record.consignor_name || 'Unknown', // Ensure consignor name is available
                consignor_id: record.consignor_id || null
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
            tableBody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 40px; color: #dc3545;">
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
            
            // Here you would update discogs_listed flags in your inventory
            // This requires matching logic based on release_id or other identifiers
            
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
    console.log('📊 Applying filters:', {
        sleeveFilter: sleeveConditionFilter,
        discFilter: discConditionFilter,
        listingStatus: listingStatusFilter,
        search: searchFilter,
        consignor: consignorFilter,
        totalRecords: discogsInventory.length
    });
    
    filteredDiscogsInventory = discogsInventory.filter(record => {
        // Disc condition filter
        if (discConditionFilter) {
            // Get the condition ID from the record
            const discConditionId = record.condition_disc_id;
            
            // If disc condition is missing (NULL), exclude it when filter is active
            if (!discConditionId) {
                return false;
            }
            
            // Get the quality index from the conditions map using the condition ID
            const discQuality = conditionsMap.qualityIndexMap[discConditionId];
            
            if (discQuality === undefined) {
                return false;
            }
            
            // Get filter quality from the conditions map using the selected condition name
            const filterQuality = conditionsMap.qualityIndexMap[discConditionFilter];
            
            // If filter quality not found, exclude (shouldn't happen)
            if (filterQuality === undefined) {
                console.warn('Unknown condition filter:', discConditionFilter);
                return false;
            }
            
            // Compare: we want records with quality_index <= filter quality
            // (lower index = better condition)
            if (discQuality > filterQuality) {
                return false;
            }
        }
        
        // Sleeve condition filter
        if (sleeveConditionFilter) {
            // Get the condition ID from the record
            const sleeveConditionId = record.condition_sleeve_id;
            
            // If sleeve condition is missing (NULL), exclude it when filter is active
            if (!sleeveConditionId) {
                return false;
            }
            
            // Get the quality index from the conditions map using the condition ID
            const sleeveQuality = conditionsMap.qualityIndexMap[sleeveConditionId];
            
            if (sleeveQuality === undefined) {
                return false;
            }
            
            const filterQuality = conditionsMap.qualityIndexMap[sleeveConditionFilter];
            
            if (filterQuality === undefined) {
                console.warn('Unknown condition filter:', sleeveConditionFilter);
                return false;
            }
            
            if (sleeveQuality > filterQuality) {
                return false;
            }
        }
        
        // Listing status filter
        if (listingStatusFilter === 'listed' && !record.discogs_listed) return false;
        if (listingStatusFilter === 'unlisted' && record.discogs_listed) return false;
        
        // Consignor filter
        if (consignorFilter !== 'all') {
            const consignorId = record.consignor_id;
            
            // If record has no consignor (store-owned), exclude when specific consignor is selected
            if (!consignorId) {
                return false;
            }
            
            // Compare as strings or numbers based on how they're stored
            if (String(consignorId) !== String(consignorFilter)) {
                return false;
            }
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
    
    console.log('📊 Filtered records:', filteredDiscogsInventory.length);
    
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
        tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;"><i class="fab fa-discogs" style="font-size: 48px; margin-bottom: 20px; color: #ccc; display: block;"></i><p>No records match your filters</p></td></tr>';
        return;
    }
    
    let html = '';
    pageRecords.forEach(record => {
        const isSelected = discogsSelectedRecords.has(record.id);
        const isListed = record.discogs_listed || false;
        
        // Get condition names from IDs using the conditions map
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
        
        // Get consignor display name
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
                <td>${escapeHtml(consignorDisplay)}</td>
                <td>
                    ${isListed ? 
                        '<span class="status-badge paid">Listed</span>' : 
                        '<span class="status-badge new">Not Listed</span>'}
                </td>
                <td>${record.catalog_number ? escapeHtml(record.catalog_number) : '-'}</td>
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
    consignorFilter = document.getElementById('consignor-filter').value; // New consignor filter
    
    console.log('Filtering with:', {
        sleeveConditionFilter,
        discConditionFilter,
        listingStatusFilter,
        searchFilter,
        consignorFilter
    });
    
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
    document.getElementById('consignor-filter').value = 'all'; // Reset consignor filter
    
    sleeveConditionFilter = '';
    discConditionFilter = '';
    listingStatusFilter = 'all';
    searchFilter = '';
    consignorFilter = 'all'; // Reset consignor filter
    
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
            media_condition: r.media_condition || '',
            sleeve_condition: r.sleeve_condition || '',
            price: r.store_price,
            notes: r.notes || ''
        }));
    
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
    
    // Auto-hide after 5 seconds for success/info, keep error visible
    if (type !== 'error') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
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

console.log('✅ discogs.js loaded successfully with consignor filter');