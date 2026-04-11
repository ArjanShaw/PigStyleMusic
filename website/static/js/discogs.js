// ============================================================================
// discogs.js - Load once on tab open, cache, then filter locally
// Includes progress modal for resolve operations and stats table
// ============================================================================

let cachedInventory = [];
let filteredInventory = [];
let currentCategory = null;
let isLoading = false;
let isCacheValid = false;
let isResolving = false;
let cancelResolve = false;

// DOM Elements
let tableBody = null;
let categorySelect = null;
let resolveButton = null;
let statusMessage = null;
let cutoffDateInput = null;
let searchInput = null;
let searchButton = null;

// Modal elements
let progressModal = null;
let modalTitle = null;
let modalProgressBar = null;
let modalProgressText = null;
let modalLog = null;
let modalCancelBtn = null;

// ============================================================================
// Create Progress Modal
// ============================================================================

function createProgressModal() {
    if (document.getElementById('discogs-progress-modal')) return;
    
    const modalHtml = `
        <div id="discogs-progress-modal" class="modal-overlay" style="display: none; z-index: 10001;">
            <div class="modal-content" style="max-width: 600px; width: 90%; background: white; border-radius: 8px;">
                <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 20px; border-radius: 8px 8px 0 0;">
                    <h3 id="modal-title" style="margin: 0; color: white;">Processing</h3>
                    <button class="modal-close" onclick="closeProgressModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; float: right;">&times;</button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span>Progress:</span>
                            <span id="modal-progress-percent">0%</span>
                        </div>
                        <div style="width: 100%; height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden;">
                            <div id="modal-progress-bar" style="width: 0%; height: 100%; background: #007bff; transition: width 0.3s;"></div>
                        </div>
                    </div>
                    <div id="modal-log" style="height: 300px; overflow-y: auto; background: #1e1e1e; border-radius: 4px; padding: 10px; font-family: 'Courier New', monospace; font-size: 12px; color: #d4d4d4;"></div>
                </div>
                <div class="modal-footer" style="padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #ddd; border-radius: 0 0 8px 8px; display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="modal-cancel-btn" class="btn btn-danger">Cancel</button>
                    <button id="modal-close-btn" class="btn btn-secondary" onclick="closeProgressModal()">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    progressModal = document.getElementById('discogs-progress-modal');
    modalTitle = document.getElementById('modal-title');
    modalProgressBar = document.getElementById('modal-progress-bar');
    modalProgressText = document.getElementById('modal-progress-percent');
    modalLog = document.getElementById('modal-log');
    modalCancelBtn = document.getElementById('modal-cancel-btn');
}

function openProgressModal(title) {
    createProgressModal();
    if (!progressModal) return;
    
    modalTitle.textContent = title;
    modalProgressBar.style.width = '0%';
    if (modalProgressText) modalProgressText.textContent = '0%';
    if (modalLog) modalLog.innerHTML = '';
    progressModal.style.display = 'flex';
    cancelResolve = false;
    
    if (modalCancelBtn) {
        modalCancelBtn.onclick = () => {
            cancelResolve = true;
            appendToModalLog('⚠️ Cancelling... Please wait for current item to complete.', 'warning');
            modalCancelBtn.disabled = true;
            modalCancelBtn.textContent = 'Cancelling...';
        };
        modalCancelBtn.disabled = false;
        modalCancelBtn.textContent = 'Cancel';
    }
}

function closeProgressModal() {
    if (progressModal) progressModal.style.display = 'none';
    cancelResolve = false;
    if (modalCancelBtn) {
        modalCancelBtn.disabled = false;
        modalCancelBtn.textContent = 'Cancel';
    }
}

function updateModalProgress(current, total) {
    if (!modalProgressBar) return;
    const percent = Math.round((current / total) * 100);
    modalProgressBar.style.width = `${percent}%`;
    if (modalProgressText) modalProgressText.textContent = `${percent}%`;
}

function appendToModalLog(message, type = 'info') {
    if (!modalLog) return;
    
    const colors = {
        success: '#4ec9b0',
        error: '#f48771',
        warning: '#ce9178',
        info: '#9cdcfe'
    };
    
    const logEntry = document.createElement('div');
    logEntry.style.marginBottom = '4px';
    logEntry.style.padding = '2px 0';
    logEntry.style.color = colors[type] || colors.info;
    logEntry.style.fontFamily = 'monospace';
    logEntry.style.fontSize = '12px';
    logEntry.innerHTML = message;
    modalLog.appendChild(logEntry);
    modalLog.scrollTop = modalLog.scrollHeight;
}

// ============================================================================
// Config Management
// ============================================================================

async function loadDiscogsConfig() {
    try {
        const markupInput = document.getElementById('discogs-markup');
        const stepInput = document.getElementById('discogs-step');
        
        if (!markupInput) return;
        
        const markupResp = await fetch(`${AppConfig.baseUrl}/config/DISCOGS_MARKUP_PERCENT`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (markupResp.ok) {
            const data = await markupResp.json();
            if (data.config_value) markupInput.value = data.config_value;
        }
        
        const stepResp = await fetch(`${AppConfig.baseUrl}/config/DISCOGS_PRICE_STEP`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (stepResp.ok) {
            const data = await stepResp.json();
            if (data.config_value) stepInput.value = data.config_value;
        }
    } catch (error) {
        console.error('Error loading Discogs config:', error);
    }
}

window.saveDiscogsConfig = async function() {
    const markupInput = document.getElementById('discogs-markup');
    const stepInput = document.getElementById('discogs-step');
    const configStatus = document.getElementById('config-status');
    
    if (!markupInput || !stepInput) return;
    
    const markup = markupInput.value;
    const step = stepInput.value;
    
    configStatus.innerHTML = 'Saving...';
    configStatus.style.color = '#ffc107';
    
    try {
        const markupResp = await fetch(`${AppConfig.baseUrl}/config/DISCOGS_MARKUP_PERCENT`, {
            method: 'PUT',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ config_value: markup })
        });
        
        const stepResp = await fetch(`${AppConfig.baseUrl}/config/DISCOGS_PRICE_STEP`, {
            method: 'PUT',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ config_value: step })
        });
        
        if (markupResp.ok && stepResp.ok) {
            configStatus.innerHTML = '✅ Saved!';
            configStatus.style.color = '#28a745';
            setTimeout(() => { configStatus.innerHTML = ''; }, 3000);
            await refreshData();
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        configStatus.innerHTML = '❌ Save failed';
        configStatus.style.color = '#dc3545';
        setTimeout(() => { configStatus.innerHTML = ''; }, 3000);
    }
};

// ============================================================================
// Update Stats Table - Fetch true counts from database
// ============================================================================

async function updateStatsTable() {
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/discogs/stats`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch stats');
        }
        
        const totalRecords = data.stats.total_records;
        const activeRecords = data.stats.active_records;
        
        const discogsOrphans = cachedInventory.filter(item => item.type === 'discogs_orphan').length;
        const localOrphans = cachedInventory.filter(item => item.type === 'local_orphan').length;
        const notListed = cachedInventory.filter(item => item.type === 'not_listed').length;
        const dueReduction = cachedInventory.filter(item => item.type === 'both' && item.needs_reduction === true).length;
        
        const statTotal = document.getElementById('stat-total');
        const statActive = document.getElementById('stat-active');
        const statDiscogsOrphans = document.getElementById('stat-discogs-orphans');
        const statLocalOrphans = document.getElementById('stat-local-orphans');
        const statNotListed = document.getElementById('stat-not-listed');
        const statDueReduction = document.getElementById('stat-due-reduction');
        
        if (statTotal) statTotal.textContent = totalRecords;
        if (statActive) statActive.textContent = activeRecords;
        if (statDiscogsOrphans) statDiscogsOrphans.textContent = discogsOrphans;
        if (statLocalOrphans) statLocalOrphans.textContent = localOrphans;
        if (statNotListed) statNotListed.textContent = notListed;
        if (statDueReduction) statDueReduction.textContent = dueReduction;
        
        console.log(`📊 Stats: Total=${totalRecords}, Active=${activeRecords}, DiscogsOrphans=${discogsOrphans}, LocalOrphans=${localOrphans}, NotListed=${notListed}, DueReduction=${dueReduction}`);
        
    } catch (error) {
        console.error('Error fetching stats:', error);
        const statTotal = document.getElementById('stat-total');
        if (statTotal) statTotal.textContent = cachedInventory.length;
    }
}

// ============================================================================
// Initialization - Load data ONCE when tab opens
// ============================================================================

function initDiscogsTab() {
    console.log('🎵 Initializing Discogs Tab...');
    
    tableBody = document.getElementById('combined-inventory-body');
    categorySelect = document.getElementById('discogs-category');
    resolveButton = document.getElementById('resolve-button');
    statusMessage = document.getElementById('discogs-status-message');
    cutoffDateInput = document.getElementById('discogs-cutoff-date');
    searchInput = document.getElementById('discogs-search-input');
    searchButton = document.getElementById('discogs-search-button');
    
    if (!tableBody || !categorySelect) {
        console.error('Discogs tab elements not found');
        return;
    }
    
    if (cutoffDateInput && !cutoffDateInput.value) {
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() - 30);
        cutoffDateInput.value = defaultDate.toISOString().split('T')[0];
    }
    
    if (searchButton) {
        searchButton.onclick = () => filterByCategory();
    }
    if (searchInput) {
        searchInput.onkeyup = (e) => {
            if (e.key === 'Enter') filterByCategory();
        };
    }
    
    resolveButton.disabled = true;
    resolveButton.style.opacity = '0.5';
    tableBody.innerHTML = '<td colspan="12" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-pulse"></i> Loading data from Discogs and local database...<\/td>';
    
    loadDiscogsConfig();
    loadInitialData();
    
    console.log('✅ Discogs Tab initialized');
}

// ============================================================================
// Load data once - calls backend ONE TIME
// ============================================================================

async function loadInitialData() {
    if (isLoading) return;
    isLoading = true;
    
    const cutoffDate = cutoffDateInput?.value;
    if (!cutoffDate) {
        tableBody.innerHTML = '<td colspan="12" style="text-align: center; padding: 40px;">Please select a cutoff date<\/td>';
        isLoading = false;
        return;
    }
    
    try {
        const url = `${AppConfig.baseUrl}/api/discogs/combined-inventory?cutoff_date=${cutoffDate}`;
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load inventory');
        }
        
        cachedInventory = data.results || [];
        isCacheValid = true;
        
        console.log(`📦 Cached ${cachedInventory.length} total records from combined inventory`);
        
        await updateStatsTable();
        
        categorySelect.disabled = false;
        
        if (statusMessage) {
            const totalRecords = cachedInventory.length;
            const discogsOrphans = cachedInventory.filter(item => item.type === 'discogs_orphan').length;
            const localOrphans = cachedInventory.filter(item => item.type === 'local_orphan').length;
            const notListed = cachedInventory.filter(item => item.type === 'not_listed').length;
            
            statusMessage.innerHTML = `✅ Data loaded. Combined inventory: ${totalRecords} items | Discogs Orphans: ${discogsOrphans} | Local Orphans: ${localOrphans} | Not Listed: ${notListed}`;
            statusMessage.className = 'status-message status-success';
            statusMessage.style.display = 'block';
            setTimeout(() => { statusMessage.style.display = 'none'; }, 5000);
        }
        
        tableBody.innerHTML = '<td colspan="12" style="text-align: center; padding: 40px;">Select a category above to view records<\/td>';
        
    } catch (error) {
        console.error('Error loading data:', error);
        tableBody.innerHTML = `<td colspan="12" style="text-align: center; padding: 40px; color: #dc3545;">
            <i class="fas fa-exclamation-triangle"></i> Error: ${error.message}
            <br><br>
            <button class="btn btn-primary" onclick="refreshData()">Retry</button>
        <\/td>`;
    } finally {
        isLoading = false;
    }
}

// ============================================================================
// Filter data locally when dropdown changes - WITH SEARCH
// ============================================================================

window.filterByCategory = function() {
    if (!isCacheValid || cachedInventory.length === 0) {
        console.warn('No cached data available');
        return;
    }
    
    currentCategory = categorySelect?.value;
    if (!currentCategory) {
        tableBody.innerHTML = '<td colspan="12" style="text-align: center; padding: 40px;">Select a category above<\/td>';
        resolveButton.disabled = true;
        resolveButton.style.opacity = '0.5';
        return;
    }
    
    // First filter by category
    let categoryFiltered = [];
    if (currentCategory === 'discogs_orphans') {
        categoryFiltered = cachedInventory.filter(item => item.type === 'discogs_orphan');
    } else if (currentCategory === 'local_orphans') {
        categoryFiltered = cachedInventory.filter(item => item.type === 'local_orphan');
    } else if (currentCategory === 'not_listed') {
        categoryFiltered = cachedInventory.filter(item => item.type === 'not_listed');
    } else if (currentCategory === 'due_reduction') {
        categoryFiltered = cachedInventory.filter(item => item.type === 'both' && item.needs_reduction === true);
    } else {
        categoryFiltered = [];
    }
    
    // Then apply search filter if search term exists
    const searchTerm = searchInput?.value?.trim().toLowerCase() || '';
    if (searchTerm) {
        filteredInventory = categoryFiltered.filter(item => {
            return (item.artist && item.artist.toLowerCase().includes(searchTerm)) ||
                   (item.title && item.title.toLowerCase().includes(searchTerm)) ||
                   (item.catalog_number && item.catalog_number.toLowerCase().includes(searchTerm)) ||
                   (item.barcode && item.barcode.includes(searchTerm));
        });
    } else {
        filteredInventory = categoryFiltered;
    }
    
    renderTable();
    
    // Update resolve button state
    if (filteredInventory.length > 0) {
        resolveButton.disabled = false;
        resolveButton.style.opacity = '1';
        
        let buttonText = '';
        if (currentCategory === 'discogs_orphans') buttonText = '🗑 Delete All Discogs Orphans';
        else if (currentCategory === 'local_orphans') buttonText = '⚠ Clear All Local Orphans';
        else if (currentCategory === 'not_listed') buttonText = '📋 List All on Discogs';
        else if (currentCategory === 'due_reduction') buttonText = '💰 Apply Price Reductions';
        resolveButton.innerHTML = buttonText;
    } else {
        resolveButton.disabled = true;
        resolveButton.style.opacity = '0.5';
    }
    
    if (statusMessage) {
        let categoryName = '';
        if (currentCategory === 'discogs_orphans') categoryName = 'Discogs Orphans';
        else if (currentCategory === 'local_orphans') categoryName = 'Local Orphans';
        else if (currentCategory === 'not_listed') categoryName = 'Listing Candidates';
        else if (currentCategory === 'due_reduction') categoryName = 'Due for Reduction';
        
        const searchInfo = searchTerm ? ` (matching "${searchTerm}")` : '';
        statusMessage.innerHTML = `📋 Showing ${filteredInventory.length} ${categoryName}${searchInfo}`;
        statusMessage.className = 'status-message status-info';
        statusMessage.style.display = 'block';
        setTimeout(() => { statusMessage.style.display = 'none'; }, 3000);
    }
};

// ============================================================================
// Clear search filter
// ============================================================================

window.clearDiscogsSearch = function() {
    if (searchInput) {
        searchInput.value = '';
    }
    filterByCategory();
};

// ============================================================================
// Render table from filteredInventory with Post button
// ============================================================================

function renderTable() {
    if (!tableBody) return;
    
    if (filteredInventory.length === 0) {
        let message = '';
        if (currentCategory === 'discogs_orphans') message = 'No Discogs orphans found.';
        else if (currentCategory === 'local_orphans') message = 'No local orphans found.';
        else if (currentCategory === 'not_listed') message = 'No listing candidates found. Try adjusting the cutoff date and click "Refresh Data".';
        else if (currentCategory === 'due_reduction') message = 'No listings due for price reduction.';
        else message = 'Select a category above';
        tableBody.innerHTML = `<td colspan="13" style="text-align: center; padding: 40px;">${message}<\/td>`;
        return;
    }
    
    let html = '';
    for (const item of filteredInventory) {
        let typeBadge = '';
        let reasonDisplay = '';
        let actionButton = '';
        
        if (currentCategory === 'discogs_orphans') {
            typeBadge = '<span class="status-badge" style="background: #dc3545; color: white;">🗑 Discogs Orphan</span>';
            reasonDisplay = item.reason ? `<span style="color: #dc3545; font-size: 12px;">⚠️ ${escapeHtml(item.reason)}</span>` : '—';
        } else if (currentCategory === 'local_orphans') {
            typeBadge = '<span class="status-badge" style="background: #ffc107; color: #333;">⚠ Local Orphan</span>';
            reasonDisplay = item.reason ? `<span style="color: #856404; font-size: 12px;">⚠️ ${escapeHtml(item.reason)}</span>` : '—';
        } else if (currentCategory === 'not_listed') {
            typeBadge = '<span class="status-badge" style="background: #28a745; color: white;">📋 Listing Candidate</span>';
            reasonDisplay = '<span style="color: #28a745; font-size: 12px;">✓ Eligible for Discogs</span>';
            // Add Post button for not_listed items
            actionButton = `<button class="btn btn-sm btn-success" onclick="postSingleRecordToDiscogs(${item.record_id}, '${escapeHtml(item.artist).replace(/'/g, "\\'")}', '${escapeHtml(item.title).replace(/'/g, "\\'")}', ${item.price || 0}, '${escapeHtml(item.media_condition || '').replace(/'/g, "\\'")}', '${escapeHtml(item.sleeve_condition || '').replace(/'/g, "\\'")}', '${escapeHtml(item.catalog_number || '').replace(/'/g, "\\'")}', '${escapeHtml(item.location || '').replace(/'/g, "\\'")}', '${escapeHtml(item.notes || '').replace(/'/g, "\\'")}')" style="padding: 4px 8px; font-size: 11px;">
                                <i class="fab fa-discogs"></i> Post
                            </button>`;
        } else if (currentCategory === 'due_reduction') {
            typeBadge = '<span class="status-badge" style="background: #fd7e14; color: white;">💰 Due for Reduction</span>';
            reasonDisplay = `<span style="color: #fd7e14; font-size: 12px;">Current: $${item.price?.toFixed(2)} → Expected: $${item.expected_price?.toFixed(2)} (${item.weeks_on_discogs} weeks)</span>`;
        }
        
        let lastSeenDisplay = item.last_seen || '—';
        let locationDisplay = item.location ? `<span class="location-badge">${escapeHtml(item.location)}</span>` : '<span style="color: #dc3545;">—</span>';
        let priceDisplay = item.price ? `$${item.price.toFixed(2)}` : '—';
        let expectedPriceDisplay = item.expected_price ? `$${item.expected_price.toFixed(2)}` : '—';
        let weeksDisplay = item.weeks_on_discogs !== undefined ? item.weeks_on_discogs : '—';
        let discogsLink = item.url ? `<a href="${item.url}" target="_blank" class="discogs-link"><i class="fab fa-discogs"></i> View</a>` : '—';
        let mediaConditionDisplay = item.media_condition || '—';
        let sleeveConditionDisplay = item.sleeve_condition || '—';
        
        html += `
            <tr>
                <td>${typeBadge}<\/td>
                <td>${item.record_id || '—'}<\/td>
                <td>${item.listing_id || '—'}<\/td>
                <td><strong>${escapeHtml(item.artist)}<\/strong><\/td>
                <td>${escapeHtml(item.title)}<\/td>
                <td>${mediaConditionDisplay}<\/td>
                <td>${sleeveConditionDisplay}<\/td>
                <td>${lastSeenDisplay}<\/td>
                <td>${locationDisplay}<\/td>
                <td>${priceDisplay}<\/td>
                <td>${expectedPriceDisplay}<\/td>
                <td>${weeksDisplay}<\/td>
                <td>${discogsLink}<\/td>
                <td>${reasonDisplay}<\/td>
                <td style="text-align: center;">${actionButton}<\/td>
            </tr>
        `;
    }
    
    tableBody.innerHTML = html;
}

// ============================================================================
// Post Single Record to Discogs
// ============================================================================

let lastPostedUrl = null;

window.postSingleRecordToDiscogs = async function(recordId, artist, title, price, mediaCondition, sleeveCondition, catalogNumber, location, notes) {
    if (!recordId) {
        showStatus('Invalid record ID', 'error');
        return;
    }
    
    // Validate conditions
    if (!mediaCondition || !mediaCondition.trim()) {
        showStatus('Media condition is required', 'error');
        return;
    }
    
    if (!sleeveCondition || !sleeveCondition.trim()) {
        showStatus('Sleeve condition is required', 'error');
        return;
    }
    
    if (!price || price <= 0) {
        showStatus('Valid price is required', 'error');
        return;
    }
    
    if (!confirm(`📋 Post "${artist} - ${title}" to Discogs?\n\nPrice: $${price}\nMedia: ${mediaCondition}\nSleeve: ${sleeveCondition}\n\nThis will create a new Discogs listing.`)) {
        return;
    }
    
    // Show progress in modal
    openProgressModal(`Posting to Discogs: ${artist} - ${title}`);
    appendToModalLog(`🚀 Starting to post "${artist} - ${title}" to Discogs...`, 'info');
    appendToModalLog(`💰 Price: $${price}`, 'info');
    appendToModalLog(`📀 Media Condition: ${mediaCondition}`, 'info');
    appendToModalLog(`📀 Sleeve Condition: ${sleeveCondition}`, 'info');
    if (location) appendToModalLog(`📍 Location: ${location}`, 'info');
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    
    const listingData = {
        record: {
            id: recordId,
            artist: artist,
            title: title,
            catalog_number: catalogNumber || '',
            media_condition: mediaCondition,
            sleeve_condition: sleeveCondition,
            price: price,
            notes: notes || '',
            location: location || ''
        }
    };
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/discogs/create-listing-single`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(listingData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            lastPostedUrl = result.listing_url;
            appendToModalLog(`✅ SUCCESS! Record posted to Discogs!`, 'success');
            appendToModalLog(`🔗 Discogs URL: ${result.listing_url}`, 'success');
            appendToModalLog(`🆔 Listing ID: ${result.listing_id}`, 'info');
            appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'success');
            
            // Show success message with clickable link
            showStatusWithLink(`✅ Successfully posted "${artist} - ${title}" to Discogs!`, result.listing_url, 'success');
            
            // Refresh data after posting
            appendToModalLog(`🔄 Refreshing data...`, 'info');
            await refreshData();
            appendToModalLog(`✅ Data refreshed`, 'success');
            
            // Keep modal open to show the URL
            setTimeout(() => {
                if (!cancelResolve) {
                    // Don't auto-close - let user see the URL
                    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
                    appendToModalLog(`💡 You can close this window now.`, 'info');
                }
            }, 1000);
            
        } else {
            throw new Error(result.error || 'Failed to create listing');
        }
        
    } catch (error) {
        appendToModalLog(`❌ FAILED: ${error.message}`, 'error');
        showStatus(`Error: ${error.message}`, 'error');
    }
};

// ============================================================================
// Show status message with clickable link
// ============================================================================

function showStatusWithLink(message, url, type = 'success') {
    if (!statusMessage) return;
    
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const linkHtml = url ? `<br><a href="${url}" target="_blank" style="color: #007bff; text-decoration: underline;"><i class="fab fa-discogs"></i> View on Discogs: ${url}</a>` : '';
    
    statusMessage.innerHTML = `${icons[type] || 'ℹ️'} ${escapeHtml(message)}${linkHtml}`;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.style.display = 'block';
    
    // Keep visible longer for URLs
    setTimeout(() => {
        if (statusMessage) statusMessage.style.display = 'none';
    }, 15000);
}

// ============================================================================
// Refresh data (when cutoff date changes)
// ============================================================================

window.refreshData = function() {
    cachedInventory = [];
    isCacheValid = false;
    tableBody.innerHTML = '<td colspan="13" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-pulse"></i> Reloading data...<\/td>';
    loadInitialData();
};

// ============================================================================
// RESOLVE: Delete Discogs Orphans
// ============================================================================

async function resolveDiscogsOrphans() {
    const items = filteredInventory;
    const total = items.length;
    
    openProgressModal(`Deleting ${total} Discogs Orphans`);
    appendToModalLog(`🚀 Starting deletion of ${total} Discogs orphans...`, 'info');
    appendToModalLog(`⏱️ Rate limited to 1 request per second. Estimated time: ~${Math.ceil(total / 60)} minutes`, 'warning');
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    
    let deleted = 0;
    let failed = 0;
    
    for (let i = 0; i < total; i++) {
        if (cancelResolve) {
            appendToModalLog(`⏹️ Operation cancelled by user.`, 'warning');
            break;
        }
        
        const item = items[i];
        updateModalProgress(i + 1, total);
        appendToModalLog(`[${i+1}/${total}] Processing: ${item.artist} - ${item.title}`, 'info');
        appendToModalLog(`   Reason: ${item.reason}`, 'info');
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/discogs/delete-listing/${item.listing_id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            
            if (response.ok) {
                deleted++;
                appendToModalLog(`   ✅ DELETED: ${item.artist} - ${item.title}`, 'success');
            } else if (response.status === 429) {
                appendToModalLog(`   ⏳ Rate limited, waiting 5 seconds...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const retryResponse = await fetch(`${AppConfig.baseUrl}/api/discogs/delete-listing/${item.listing_id}`, {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
                });
                
                if (retryResponse.ok) {
                    deleted++;
                    appendToModalLog(`   ✅ DELETED (retry): ${item.artist} - ${item.title}`, 'success');
                } else {
                    failed++;
                    appendToModalLog(`   ❌ FAILED (retry): ${item.artist} - ${item.title} - HTTP ${retryResponse.status}`, 'error');
                }
            } else {
                failed++;
                appendToModalLog(`   ❌ FAILED: ${item.artist} - ${item.title} - HTTP ${response.status}`, 'error');
            }
        } catch (error) {
            failed++;
            appendToModalLog(`   ❌ FAILED: ${item.artist} - ${item.title} - ${error.message}`, 'error');
        }
        
        if (i < total - 1 && !cancelResolve) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    appendToModalLog(`📊 RESULTS:`, 'info');
    appendToModalLog(`   ✅ Deleted: ${deleted}`, 'success');
    appendToModalLog(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
    
    if (deleted > 0) {
        appendToModalLog(`🔄 Refreshing data...`, 'info');
        await refreshData();
        appendToModalLog(`✅ Data refreshed`, 'success');
    }
}

// ============================================================================
// RESOLVE: Clear Local Orphans
// ============================================================================

async function resolveLocalOrphans() {
    const items = filteredInventory;
    const total = items.length;
    
    openProgressModal(`Clearing ${total} Local Orphans`);
    appendToModalLog(`🚀 Starting to clear ${total} local orphans...`, 'info');
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    
    let cleared = 0;
    let failed = 0;
    
    for (let i = 0; i < total; i++) {
        if (cancelResolve) {
            appendToModalLog(`⏹️ Operation cancelled by user.`, 'warning');
            break;
        }
        
        const item = items[i];
        updateModalProgress(i + 1, total);
        appendToModalLog(`[${i+1}/${total}] Clearing: ${item.artist} - ${item.title}`, 'info');
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/records/${item.record_id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    discogs_listing_id: null,
                    discogs_listed_date: null
                })
            });
            
            if (response.ok) {
                cleared++;
                appendToModalLog(`   ✅ CLEARED: ${item.artist} - ${item.title}`, 'success');
            } else {
                failed++;
                appendToModalLog(`   ❌ FAILED: ${item.artist} - ${item.title} - HTTP ${response.status}`, 'error');
            }
        } catch (error) {
            failed++;
            appendToModalLog(`   ❌ FAILED: ${item.artist} - ${item.title} - ${error.message}`, 'error');
        }
        
        if (i < total - 1 && !cancelResolve) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    appendToModalLog(`📊 RESULTS:`, 'info');
    appendToModalLog(`   ✅ Cleared: ${cleared}`, 'success');
    appendToModalLog(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
    
    if (cleared > 0) {
        appendToModalLog(`🔄 Refreshing data...`, 'info');
        await refreshData();
        appendToModalLog(`✅ Data refreshed`, 'success');
    }
}

// ============================================================================
// RESOLVE: List Not Listed - Simplified progress log
// ============================================================================

async function resolveNotListed() {
    const items = filteredInventory;
    const total = items.length;
    
    openProgressModal(`Listing ${total} Candidates on Discogs`);
    appendToModalLog(`🚀 Starting to list ${total} candidates on Discogs...`, 'info');
    appendToModalLog(`⏱️ Rate limited to 1 request per second. Estimated time: ~${Math.ceil(total / 60)} minutes`, 'warning');
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    
    let listed = 0;
    let failed = 0;
    
    for (let i = 0; i < total; i++) {
        if (cancelResolve) {
            appendToModalLog(`⏹️ Operation cancelled by user.`, 'warning');
            break;
        }
        
        const item = items[i];
        updateModalProgress(i + 1, total);
        
        // Validate conditions before sending (silent validation)
        if (!item.media_condition || !item.media_condition.trim()) {
            failed++;
            continue;
        }
        
        if (!item.sleeve_condition || !item.sleeve_condition.trim()) {
            failed++;
            continue;
        }
        
        const listingData = {
            record: {
                id: item.record_id,
                artist: item.artist,
                title: item.title,
                catalog_number: item.catalog_number || '',
                media_condition: item.media_condition,
                sleeve_condition: item.sleeve_condition,
                price: item.price,
                notes: item.notes || '',
                location: item.location
            }
        };
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/discogs/create-listing-single`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(listingData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                listed++;
                appendToModalLog(`✅ LISTED: ${item.artist} - ${item.title} (ID: ${result.listing_id})`, 'success');
                if (result.listing_url) {
                    appendToModalLog(`   🔗 ${result.listing_url}`, 'info');
                }
            } else if (response.status === 429) {
                appendToModalLog(`⏳ Rate limited, waiting 5 seconds...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const retryResponse = await fetch(`${AppConfig.baseUrl}/api/discogs/create-listing-single`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(listingData)
                });
                
                const retryResult = await retryResponse.json();
                if (retryResult.success) {
                    listed++;
                    appendToModalLog(`✅ LISTED (retry): ${item.artist} - ${item.title} (ID: ${retryResult.listing_id})`, 'success');
                } else {
                    failed++;
                    appendToModalLog(`❌ FAILED (retry): ${item.artist} - ${item.title} - ${retryResult.error}`, 'error');
                }
            } else {
                failed++;
                appendToModalLog(`❌ FAILED: ${item.artist} - ${item.title} - ${result.error || `HTTP ${response.status}`}`, 'error');
            }
        } catch (error) {
            failed++;
            appendToModalLog(`❌ FAILED: ${item.artist} - ${item.title} - ${error.message}`, 'error');
        }
        
        if (i < total - 1 && !cancelResolve) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    appendToModalLog(`📊 RESULTS:`, 'info');
    appendToModalLog(`   ✅ Listed: ${listed}`, 'success');
    appendToModalLog(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
    
    if (listed > 0) {
        appendToModalLog(`🔄 Refreshing data...`, 'info');
        await refreshData();
        appendToModalLog(`✅ Data refreshed`, 'success');
    }
}

// ============================================================================
// RESOLVE: Apply Price Reductions (for Due Reduction category)
// ============================================================================

async function resolvePriceReductions() {
    const items = filteredInventory;
    const total = items.length;
    
    if (total === 0) {
        showStatus('No items due for reduction', 'warning');
        return;
    }
    
    const markup = document.getElementById('discogs-markup')?.value || 20;
    const step = document.getElementById('discogs-step')?.value || 5;
    
    if (!confirm(`💰 Apply price reductions to ${total} listing(s)?\n\nMarkup: ${markup}%\nWeekly reduction: ${step}%\n\nThis will update Discogs with new prices.\n\nRate limited to 1 request per second.`)) {
        return;
    }
    
    openProgressModal(`Applying Price Reductions to ${total} Listings`);
    appendToModalLog(`🚀 Starting price reductions...`, 'info');
    appendToModalLog(`📊 Markup: ${markup}% | Weekly reduction: ${step}%`, 'info');
    appendToModalLog(`⏱️ Rate limited to 1 request per second`, 'warning');
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    
    let updated = 0;
    let failed = 0;
    
    for (let i = 0; i < total; i++) {
        if (cancelResolve) {
            appendToModalLog(`⏹️ Operation cancelled by user.`, 'warning');
            break;
        }
        
        const item = items[i];
        updateModalProgress(i + 1, total);
        appendToModalLog(`[${i+1}/${total}] Processing: ${item.artist} - ${item.title}`, 'info');
        appendToModalLog(`   Current: $${item.price?.toFixed(2) || '?'} | Expected: $${item.expected_price?.toFixed(2) || '?'} | Weeks: ${item.weeks_on_discogs || 0}`, 'info');
        
        try {
            const updateData = {
                price: item.expected_price,
                condition: item.media_condition || 'Very Good Plus (VG+)',
                sleeve_condition: item.sleeve_condition || 'Very Good Plus (VG+)',
                status: "For Sale"
            };
            
            const response = await fetch(`${AppConfig.baseUrl}/api/discogs/update-listing-price/${item.listing_id}`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });
            
            if (response.ok) {
                updated++;
                appendToModalLog(`   ✅ Updated: $${item.price?.toFixed(2)} → $${item.expected_price?.toFixed(2)}`, 'success');
            } else if (response.status === 429) {
                appendToModalLog(`   ⏳ Rate limited, waiting 5 seconds...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const retryResponse = await fetch(`${AppConfig.baseUrl}/api/discogs/update-listing-price/${item.listing_id}`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updateData)
                });
                
                if (retryResponse.ok) {
                    updated++;
                    appendToModalLog(`   ✅ Updated (retry): $${item.price?.toFixed(2)} → $${item.expected_price?.toFixed(2)}`, 'success');
                } else {
                    failed++;
                    appendToModalLog(`   ❌ FAILED (retry): ${item.artist} - ${item.title}`, 'error');
                }
            } else {
                failed++;
                appendToModalLog(`   ❌ FAILED: ${item.artist} - ${item.title} - HTTP ${response.status}`, 'error');
            }
        } catch (error) {
            failed++;
            appendToModalLog(`   ❌ FAILED: ${item.artist} - ${item.title} - ${error.message}`, 'error');
        }
        
        if (i < total - 1 && !cancelResolve) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    appendToModalLog(`📊 RESULTS:`, 'info');
    appendToModalLog(`   ✅ Updated: ${updated}`, 'success');
    appendToModalLog(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
    
    if (updated > 0) {
        appendToModalLog(`🔄 Refreshing data...`, 'info');
        await refreshData();
        appendToModalLog(`✅ Data refreshed`, 'success');
    }
}

// ============================================================================
// Main Resolve dispatcher
// ============================================================================

window.resolveCategory = async function() {
    if (!currentCategory || filteredInventory.length === 0) {
        alert('No items to process');
        return;
    }
    
    if (currentCategory === 'discogs_orphans') {
        if (!confirm(`🗑️ DELETE ${filteredInventory.length} Discogs orphan(s) from Discogs?\n\nThis cannot be undone.`)) return;
        await resolveDiscogsOrphans();
    } else if (currentCategory === 'local_orphans') {
        if (!confirm(`⚠️ Clear discogs_listing_id for ${filteredInventory.length} local record(s)?`)) return;
        await resolveLocalOrphans();
    } else if (currentCategory === 'not_listed') {
        if (!confirm(`📋 List ${filteredInventory.length} record(s) on Discogs?\n\n⚠️ Rate limited to 1 per second.`)) return;
        await resolveNotListed();
    } else if (currentCategory === 'due_reduction') {
        await resolvePriceReductions();
    }
};

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showStatus(message, type = 'info') {
    if (!statusMessage) return;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    statusMessage.innerHTML = `${icons[type] || 'ℹ️'} ${escapeHtml(message)}`;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.style.display = 'block';
    setTimeout(() => {
        if (statusMessage) statusMessage.style.display = 'none';
    }, 8000);
}

window.closeProgressModal = closeProgressModal;

// ============================================================================
// Tab Activation Handler
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'discogs') {
        console.log('🎵 Discogs tab activated');
        setTimeout(initDiscogsTab, 100);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const discogsTab = document.querySelector('.tab[data-tab="discogs"]');
    if (discogsTab && discogsTab.classList.contains('active')) {
        setTimeout(initDiscogsTab, 200);
    }
});

console.log('✅ discogs.js loaded - with search, single post, and Discogs URL display');