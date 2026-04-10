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
        const onDiscogs = data.stats.on_discogs;
        
        // These come from the cached inventory
        const discogsOrphans = cachedInventory.filter(item => item.type === 'discogs_orphan').length;
        const localOrphans = cachedInventory.filter(item => item.type === 'local_orphan').length;
        const notListed = cachedInventory.filter(item => item.type === 'not_listed').length;
        
        // Update stats table cells
        const statTotal = document.getElementById('stat-total');
        const statActive = document.getElementById('stat-active');
        const statOnDiscogs = document.getElementById('stat-on-discogs');
        const statDiscogsOrphans = document.getElementById('stat-discogs-orphans');
        const statLocalOrphans = document.getElementById('stat-local-orphans');
        const statNotListed = document.getElementById('stat-not-listed');
        
        if (statTotal) statTotal.textContent = totalRecords;
        if (statActive) statActive.textContent = activeRecords;
        if (statOnDiscogs) statOnDiscogs.textContent = onDiscogs;
        if (statDiscogsOrphans) statDiscogsOrphans.textContent = discogsOrphans;
        if (statLocalOrphans) statLocalOrphans.textContent = localOrphans;
        if (statNotListed) statNotListed.textContent = notListed;
        
        console.log(`📊 Stats updated: Total=${totalRecords}, Active=${activeRecords}, OnDiscogs=${onDiscogs}, DiscogsOrphans=${discogsOrphans}, LocalOrphans=${localOrphans}, NotListed=${notListed}`);
        
    } catch (error) {
        console.error('Error fetching stats:', error);
        // Set fallback values
        const statTotal = document.getElementById('stat-total');
        const statActive = document.getElementById('stat-active');
        const statOnDiscogs = document.getElementById('stat-on-discogs');
        
        if (statTotal) statTotal.textContent = cachedInventory.length;
        if (statActive) statActive.textContent = '?';
        if (statOnDiscogs) statOnDiscogs.textContent = '?';
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
    
    if (!tableBody || !categorySelect) {
        console.error('Discogs tab elements not found');
        return;
    }
    
    // Set default cutoff date to 30 days ago
    if (cutoffDateInput && !cutoffDateInput.value) {
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() - 30);
        cutoffDateInput.value = defaultDate.toISOString().split('T')[0];
    }
    
    // Set initial state
    resolveButton.disabled = true;
    resolveButton.style.opacity = '0.5';
    tableBody.innerHTML = '<td colspan="11" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-pulse"></i> Loading data from Discogs and local database...<\/td>';
    
    // Load data ONCE
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
        tableBody.innerHTML = '<td colspan="11" style="text-align: center; padding: 40px;">Please select a cutoff date<\/td>';
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
        
        // Cache ALL data
        cachedInventory = data.results || [];
        isCacheValid = true;
        
        console.log(`📦 Cached ${cachedInventory.length} total records from combined inventory`);
        
        // Update stats table using separate stats endpoint
        await updateStatsTable();
        
        // Enable the dropdown
        categorySelect.disabled = false;
        
        // Show status
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
        
        tableBody.innerHTML = '<td colspan="11" style="text-align: center; padding: 40px;">Select a category above to view records<\/td>';
        
    } catch (error) {
        console.error('Error loading data:', error);
        tableBody.innerHTML = `<td colspan="11" style="text-align: center; padding: 40px; color: #dc3545;">
            <i class="fas fa-exclamation-triangle"></i> Error: ${error.message}
            <br><br>
            <button class="btn btn-primary" onclick="refreshData()">Retry</button>
        <\/td>`;
    } finally {
        isLoading = false;
    }
}

// ============================================================================
// Filter data locally when dropdown changes - NO BACKEND CALL
// ============================================================================

window.filterByCategory = function() {
    if (!isCacheValid || cachedInventory.length === 0) {
        console.warn('No cached data available');
        return;
    }
    
    currentCategory = categorySelect?.value;
    if (!currentCategory) {
        tableBody.innerHTML = '<td colspan="11" style="text-align: center; padding: 40px;">Select a category above<\/td>';
        resolveButton.disabled = true;
        resolveButton.style.opacity = '0.5';
        return;
    }
    
    // Filter the cached data locally - FAST, no network call
    if (currentCategory === 'discogs_orphans') {
        filteredInventory = cachedInventory.filter(item => item.type === 'discogs_orphan');
    } else if (currentCategory === 'local_orphans') {
        filteredInventory = cachedInventory.filter(item => item.type === 'local_orphan');
    } else if (currentCategory === 'not_listed') {
        filteredInventory = cachedInventory.filter(item => item.type === 'not_listed');
    } else {
        filteredInventory = [];
    }
    
    // Render the filtered table
    renderTable();
    
    // Enable resolve button if there are items
    if (filteredInventory.length > 0) {
        resolveButton.disabled = false;
        resolveButton.style.opacity = '1';
        
        let buttonText = '';
        if (currentCategory === 'discogs_orphans') buttonText = '🗑 Delete All Discogs Orphans';
        else if (currentCategory === 'local_orphans') buttonText = '⚠ Clear All Local Orphans';
        else buttonText = '📋 List All on Discogs';
        resolveButton.innerHTML = buttonText;
    } else {
        resolveButton.disabled = true;
        resolveButton.style.opacity = '0.5';
    }
    
    // Update status
    if (statusMessage) {
        let categoryName = '';
        if (currentCategory === 'discogs_orphans') categoryName = 'Discogs Orphans';
        else if (currentCategory === 'local_orphans') categoryName = 'Local Orphans';
        else categoryName = 'Listing Candidates';
        statusMessage.innerHTML = `📋 Showing ${filteredInventory.length} ${categoryName}`;
        statusMessage.className = 'status-message status-info';
        statusMessage.style.display = 'block';
        setTimeout(() => { statusMessage.style.display = 'none'; }, 2000);
    }
};

// ============================================================================
// Render table from filteredInventory (local data)
// ============================================================================

function renderTable() {
    if (!tableBody) return;
    
    if (filteredInventory.length === 0) {
        let message = '';
        if (currentCategory === 'discogs_orphans') message = 'No Discogs orphans found.';
        else if (currentCategory === 'local_orphans') message = 'No local orphans found.';
        else if (currentCategory === 'not_listed') message = 'No listing candidates found. Try adjusting the cutoff date and click "Refresh Data".';
        else message = 'Select a category above';
        tableBody.innerHTML = `<td colspan="11" style="text-align: center; padding: 40px;">${message}<\/td>`;
        return;
    }
    
    let html = '';
    for (const item of filteredInventory) {
        let typeBadge = '';
        let reasonDisplay = '';
        
        if (currentCategory === 'discogs_orphans') {
            typeBadge = '<span class="status-badge" style="background: #dc3545; color: white;">🗑 Discogs Orphan</span>';
            reasonDisplay = item.reason ? `<span style="color: #dc3545; font-size: 12px;">⚠️ ${escapeHtml(item.reason)}</span>` : '—';
        } else if (currentCategory === 'local_orphans') {
            typeBadge = '<span class="status-badge" style="background: #ffc107; color: #333;">⚠ Local Orphan</span>';
            reasonDisplay = item.reason ? `<span style="color: #856404; font-size: 12px;">⚠️ ${escapeHtml(item.reason)}</span>` : '—';
        } else {
            typeBadge = '<span class="status-badge" style="background: #28a745; color: white;">📋 Listing Candidate</span>';
            reasonDisplay = '<span style="color: #28a745; font-size: 12px;">✓ Eligible for Discogs</span>';
        }
        
        html += `
            <tr>
                <td>${typeBadge}<\/td>
                <td>${item.record_id || '—'}<\/td>
                <td>${item.listing_id || '—'}<\/td>
                <td><strong>${escapeHtml(item.artist)}<\/strong><\/td>
                <td>${escapeHtml(item.title)}<\/td>
                <td>${item.last_seen || '—'}<\/td>
                <td>${item.location ? escapeHtml(item.location) : '<span style="color: #dc3545;">—</span>'}<\/td>
                <td>${item.price ? `$${item.price.toFixed(2)}` : '—'}<\/td>
                <td>${item.discogs_status ? escapeHtml(item.discogs_status) : '—'}<\/td>
                <td>${item.url ? `<a href="${item.url}" target="_blank" class="discogs-link"><i class="fab fa-discogs"></i> View</a>` : '—'}<\/td>
                <td>${reasonDisplay}<\/td>
            </tr>
        `;
    }
    
    tableBody.innerHTML = html;
}

// ============================================================================
// Refresh data (when cutoff date changes)
// ============================================================================

window.refreshData = function() {
    cachedInventory = [];
    isCacheValid = false;
    tableBody.innerHTML = '<td colspan="11" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-pulse"></i> Reloading data...<\/td>';
    loadInitialData();
};

// ============================================================================
// RESOLVE: Delete Discogs Orphans (with progress modal)
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
// RESOLVE: Clear Local Orphans (with progress modal)
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
// RESOLVE: List Not Listed (with progress modal)
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
        appendToModalLog(`[${i+1}/${total}] Listing: ${item.artist} - ${item.title}`, 'info');
        
        const listingData = {
            record: {
                id: item.record_id,
                artist: item.artist,
                title: item.title,
                catalog_number: '',
                media_condition: 'Very Good Plus (VG+)',
                sleeve_condition: 'Very Good Plus (VG+)',
                price: item.price,
                notes: '',
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
                appendToModalLog(`   ✅ LISTED: ${item.artist} - ${item.title} (ID: ${result.listing_id})`, 'success');
            } else if (response.status === 429) {
                appendToModalLog(`   ⏳ Rate limited, waiting 5 seconds...`, 'warning');
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
                    appendToModalLog(`   ✅ LISTED (retry): ${item.artist} - ${item.title} (ID: ${retryResult.listing_id})`, 'success');
                } else {
                    failed++;
                    appendToModalLog(`   ❌ FAILED (retry): ${item.artist} - ${item.title} - ${retryResult.error}`, 'error');
                }
            } else {
                failed++;
                appendToModalLog(`   ❌ FAILED: ${item.artist} - ${item.title} - ${result.error || `HTTP ${response.status}`}`, 'error');
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
    appendToModalLog(`   ✅ Listed: ${listed}`, 'success');
    appendToModalLog(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
    
    if (listed > 0) {
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
    }
};

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

console.log('✅ discogs.js loaded - with separate stats endpoint and progress modal');