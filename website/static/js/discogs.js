// discogs.js - Cleaned version with only Discogs listings table and local inventory table

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
window.populateConditionDropdowns = populateConditionDropdowns;
window.loadConsignors = loadConsignors;
window.debugDiscogsAPI = debugDiscogsAPI;

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
                discogs_listed: false,
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
 * Load Discogs inventory
 */
function loadDiscogsInventory() {
    console.log('📀 Loading Discogs inventory...');
    
    const loadingEl = document.getElementById('discogs-loading');
    const tableBody = document.getElementById('discogs-inventory-body');
    
    if (loadingEl) loadingEl.style.display = 'block';
    
    if (tableBody) {
        tableBody.innerHTML = '백<td colspan="12" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i><p>Loading local inventory...</p></td>';
    }
    
    Promise.all([
        loadConditions(),
        loadConsignors()
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
            tableBody.innerHTML = `<td colspan="12" style="text-align: center; padding: 40px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading inventory: ${error.message}</p>
                <button class="btn btn-primary" onclick="loadDiscogsInventory()">
                    <i class="fas fa-sync-alt"></i> Try Again
                </button>
            </td>`;
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
        if (listingStatusFilter === 'listed' && !record.discogs_listed) return false;
        if (listingStatusFilter === 'unlisted' && record.discogs_listed) return false;
        
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
        tableBody.innerHTML = '<td colspan="12" style="text-align: center; padding: 40px;"><i class="fab fa-discogs" style="font-size: 48px; color: #ccc;"></i><p>No records match your filters</p></td>';
        return;
    }
    
    let html = '';
    pageRecords.forEach(record => {
        const isSelected = discogsSelectedRecords.has(record.id);
        const isListed = record.discogs_listed || false;
        
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
        
        html += `
            <tr class="${isSelected ? 'record-selected' : ''}">
                <td style="text-align: center;">
                    <input type="checkbox" 
                           class="discogs-record-checkbox" 
                           data-record-id="${record.id}" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="toggleDiscogsRecordSelection(${record.id}, this.checked)">
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
                <td>${isListed ? '<span class="status-badge paid">Listed</span>' : '<span class="status-badge new">Not Listed</span>'}</td>
                <td>${record.catalog_number ? escapeHtml(record.catalog_number) : '-'}</td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
    updateDiscogsPagination();
    updateDiscogsSelectionCount();
    
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
    
    discogsCurrentPage = 1;
    applyDiscogsFilters();
}

function resetDiscogsFilters() {
    document.getElementById('sleeve-condition-filter').value = '';
    document.getElementById('disc-condition-filter').value = '';
    document.getElementById('listing-status-filter').value = 'all';
    document.getElementById('discogs-search').value = '';
    document.getElementById('consignor-filter').value = 'all';
    
    sleeveConditionFilter = '';
    discConditionFilter = '';
    listingStatusFilter = 'all';
    searchFilter = '';
    consignorFilter = 'all';
    
    discogsCurrentPage = 1;
    applyDiscogsFilters();
}

function updateDiscogsStats() {
    const totalActive = discogsInventory.length;
    const notListedCount = totalActive;
    
    document.getElementById('discogs-total-active').textContent = totalActive;
    document.getElementById('discogs-not-listed').textContent = notListedCount;
    
    const localCountEl = document.getElementById('local-record-count');
    if (localCountEl) localCountEl.textContent = totalActive;
}

function updateDiscogsFilterCounts() {
    document.getElementById('discogs-filtered-count').textContent = filteredDiscogsInventory.length;
    document.getElementById('discogs-total-filtered').textContent = discogsInventory.length;
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
        ).filter(r => !r.discogs_listed);
        
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

function selectAllDiscogsRecords() {
    filteredDiscogsInventory.forEach(record => {
        if (!record.discogs_listed) {
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
    document.getElementById('selected-count').textContent = count;
    document.getElementById('discogs-selected-count').textContent = count;
    
    const submitBtn = document.getElementById('submit-to-discogs-btn');
    if (submitBtn) {
        submitBtn.disabled = count === 0;
    }
}
function submitToDiscogs() {
    const selectedIds = Array.from(discogsSelectedRecords);
    
    if (selectedIds.length === 0) {
        showDiscogsStatus('Please select at least one record to list', 'warning');
        return;
    }
    
    // Get selected records with required fields
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
            // Optionally reload to update listed status
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
// Helper function to get condition name from condition ID
function getConditionName(conditionId) {
    if (!conditionId) return 'Not Specified';
    const condition = conditionsMap.byId[conditionId];
    return condition ? condition.condition_name : 'Not Specified';
}

function debugDiscogsAPI() {
    const url = `${window.AppConfig.baseUrl}/api/discogs/test-listings`;
    const tableBody = document.getElementById('discogs-response-body');
    
    if (tableBody) {
        tableBody.innerHTML = '<td colspan="9" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td>';
    }
    
    fetch(url, {
        credentials: 'include',
        headers: window.AppConfig.getHeaders()
    })
    .then(response => response.json())
    .then(data => {
        if (!tableBody) return;
        
        if (data.success && data.listings && data.listings.length > 0) {
            let html = '';
            data.listings.forEach(listing => {
                html += `
                    <tr>
                        <td>${escapeHtml(String(listing.listing_id || ''))}</td>
                        <td>${escapeHtml(String(listing.release_id || ''))}</td>
                        <td>${escapeHtml(listing.artist || 'Unknown')}</td>
                        <td>${escapeHtml(listing.title || 'Unknown')}</td>
                        <td>$${parseFloat(listing.price || 0).toFixed(2)}</td>
                        <td><span class="condition-badge">${escapeHtml(listing.condition || 'Not specified')}</span></td>
                        <td><span class="condition-badge">${escapeHtml(listing.sleeve_condition || 'Not specified')}</span></td>
                        <td><span class="status-badge ${listing.status === 'For Sale' ? 'active' : 'sold'}">${escapeHtml(listing.status || 'Unknown')}</span></td>
                        <td><a href="${listing.url}" target="_blank"><i class="fab fa-discogs"></i> View</a></td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;
        } else {
            tableBody.innerHTML = '<td colspan="9" style="text-align: center; padding: 40px;">No listings found</td>';
        }
    })
    .catch(error => {
        console.error('Error calling API:', error);
        if (tableBody) {
            tableBody.innerHTML = `<td colspan="9" style="text-align: center; padding: 40px; color: #dc3545;">Error: ${error.message}</td>`;
        }
    });
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