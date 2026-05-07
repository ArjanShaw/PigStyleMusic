// ============================================================================
// discogs.js - Location-based bulk posting to Discogs (No listing ID tracking)
// ============================================================================

let currentLocationRecords = [];
let filteredRecords = [];
let currentLocation = null;
let isLoading = false;
let cancelResolve = false;

// DOM Elements
let tableBody = null;
let locationSelect = null;
let postButton = null;
let statusMessage = null;
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
        if (!markupInput) return;
        
        const response = await fetch(`${AppConfig.baseUrl}/config/DISCOGS_MARKUP_PERCENT`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (response.ok) {
            const data = await response.json();
            if (data.config_value) markupInput.value = data.config_value;
        }
    } catch (error) {
        console.error('Error loading Discogs config:', error);
    }
}

window.saveDiscogsConfig = async function() {
    const markupInput = document.getElementById('discogs-markup');
    const configStatus = document.getElementById('config-status');
    
    if (!markupInput) return;
    
    configStatus.innerHTML = 'Saving...';
    configStatus.style.color = '#ffc107';
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/config/DISCOGS_MARKUP_PERCENT`, {
            method: 'PUT',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ config_value: markupInput.value })
        });
        
        if (response.ok) {
            configStatus.innerHTML = '✅ Saved!';
            configStatus.style.color = '#28a745';
            setTimeout(() => { configStatus.innerHTML = ''; }, 3000);
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
// Load unique locations from records
// ============================================================================

async function loadLocations() {
    console.log('📍 Loading locations from API...');
    
    try {
        const url = `${AppConfig.baseUrl}/api/locations`;
        console.log('📡 Fetching from:', url);
        
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        console.log('📡 Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            renderLocationSelect(data.locations);
            console.log(`✅ Loaded ${data.locations.length} locations`);
        } else {
            throw new Error(data.error || 'Failed to load locations');
        }
    } catch (error) {
        console.error('Error loading locations:', error);
        renderLocationSelect([]);
        showStatus(`Warning: Could not load locations - ${error.message}`, 'warning');
    }
}

function renderLocationSelect(locations) {
    if (!locationSelect) {
        console.error('locationSelect element not found! Check ID: discogs-location-select');
        return;
    }
    
    console.log(`🎨 Rendering ${locations.length} locations to dropdown`);
    
    locationSelect.innerHTML = '<option value="">-- Select a location --</option>';
    
    if (!locations || locations.length === 0) {
        locationSelect.innerHTML = '<option value="">-- No locations found --</option>';
        return;
    }
    
    locations.forEach(location => {
        const option = document.createElement('option');
        option.value = location;
        const displayText = location.length > 100 ? location.substring(0, 97) + '...' : location;
        option.textContent = displayText;
        option.title = location;
        locationSelect.appendChild(option);
    });
    
    console.log(`✅ Added ${locations.length} options to dropdown`);
}

// ============================================================================
// Load records by location
// ============================================================================

async function loadLocationRecords() {
    const selectedLocation = locationSelect?.value;
    
    if (!selectedLocation) {
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 40px;">Select a location to view records</td></tr>';
        }
        if (postButton) {
            postButton.disabled = true;
            postButton.style.opacity = '0.5';
        }
        return;
    }
    
    currentLocation = selectedLocation;
    isLoading = true;
    
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-pulse"></i> Loading records...</td></tr>';
    }
    
    try {
        const url = `${AppConfig.baseUrl}/api/records/by-location?location=${encodeURIComponent(selectedLocation)}`;
        console.log('📡 Fetching records from:', url);
        
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            currentLocationRecords = data.records || [];
            applySearchFilter();
            
            if (postButton) {
                postButton.disabled = false;
                postButton.style.opacity = '1';
                postButton.innerHTML = `<i class="fab fa-discogs"></i> Post ${filteredRecords.length} Record(s) to Discogs`;
            }
            console.log(`✅ Loaded ${currentLocationRecords.length} records from location`);
        } else {
            throw new Error(data.error || 'Failed to load records');
        }
        
    } catch (error) {
        console.error('Error loading location records:', error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 40px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle"></i> Error: ${error.message}
            </td></tr>`;
        }
        if (postButton) {
            postButton.disabled = true;
            postButton.style.opacity = '0.5';
        }
    } finally {
        isLoading = false;
    }
}

// ============================================================================
// Apply search filter to current location records
// ============================================================================

function applySearchFilter() {
    const searchTerm = searchInput?.value?.trim().toLowerCase() || '';
    
    if (searchTerm) {
        filteredRecords = currentLocationRecords.filter(record => {
            const matchesArtist = record.artist && record.artist.toLowerCase().includes(searchTerm);
            const matchesTitle = record.title && record.title.toLowerCase().includes(searchTerm);
            const matchesCatalog = record.catalog_number && record.catalog_number.toLowerCase().includes(searchTerm);
            return matchesArtist || matchesTitle || matchesCatalog;
        });
    } else {
        filteredRecords = [...currentLocationRecords];
    }
    
    renderTable();
    
    if (postButton) {
        const eligibleCount = filteredRecords.filter(r => r.status_id === 2).length;
        postButton.innerHTML = `<i class="fab fa-discogs"></i> Post ${eligibleCount} of ${filteredRecords.length} Record(s) to Discogs`;
        postButton.disabled = eligibleCount === 0;
        postButton.style.opacity = eligibleCount === 0 ? '0.5' : '1';
    }
    
    if (statusMessage && currentLocation) {
        const searchInfo = searchTerm ? ` (matching "${searchTerm}")` : '';
        statusMessage.innerHTML = `📍 Location: ${currentLocation} | ${filteredRecords.length} record(s) found${searchInfo}`;
        statusMessage.className = 'status-message status-info';
        statusMessage.style.display = 'block';
        setTimeout(() => { statusMessage.style.display = 'none'; }, 3000);
    }
}

// ============================================================================
// Clear search filter
// ============================================================================

window.clearDiscogsSearch = function() {
    if (searchInput) {
        searchInput.value = '';
    }
    applySearchFilter();
};

// ============================================================================
// Render table from filteredRecords
// ============================================================================

function renderTable() {
    if (!tableBody) {
        console.error('tableBody not found');
        return;
    }
    
    if (filteredRecords.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 40px;">
            ${currentLocation ? 'No records found in this location.' : 'Select a location above'}
        </td></tr>`;
        return;
    }
    
    let html = '';
    for (const record of filteredRecords) {
        let imageUrl = record.image_url && record.image_url !== '' && record.image_url !== 'None' ? record.image_url : null;
        
        let statusBadge = '';
        if (record.status_id === 1) statusBadge = '<span class="status-badge new">📋 New</span>';
        else if (record.status_id === 2) statusBadge = '<span class="status-badge active">✅ Active</span>';
        else if (record.status_id === 3) statusBadge = '<span class="status-badge sold">💰 Sold</span>';
        else statusBadge = '<span class="status-badge">❓ Unknown</span>';
        
        const canPost = record.status_id === 2;
        
        html += `
            <tr>
                <td style="text-align: center;">
                    ${imageUrl ? 
                        `<img src="${imageUrl}" alt="${escapeHtml(record.artist)}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">` :
                        `<div style="width: 40px; height: 40px; background: #e0e0e0; border-radius: 4px; display: flex; align-items: center; justify-content: center; margin: 0 auto;"><i class="fas fa-record-vinyl" style="color: #999;"></i></div>`
                    }
                </td>
                <td>${record.id || '—'}</td>
                <td><strong>${escapeHtml(record.artist)}</strong></td>
                <td>${escapeHtml(record.title)}</td>
                <td>${record.catalog_number || '—'}</td>
                <td>${record.disc_condition_name || record.sleeve_condition_name || '—'}</td>
                <td>${record.sleeve_condition_name || '—'}</td>
                <td>${record.store_price ? `$${parseFloat(record.store_price).toFixed(2)}` : '—'}</td>
                <td title="${escapeHtml(record.location || '')}">${escapeHtml(record.location ? record.location.substring(0, 50) : '—')}</td>
                <td>${statusBadge}</td>
                <td style="text-align: center;">
                    ${canPost ? 
                        `<button class="post-single-btn" data-record-id="${record.id}" data-artist="${escapeHtml(record.artist)}" data-title="${escapeHtml(record.title)}" data-price="${record.store_price}" data-media-condition="${record.disc_condition_name || ''}" data-sleeve-condition="${record.sleeve_condition_name || ''}" data-catalog="${escapeHtml(record.catalog_number || '')}" data-location="${escapeHtml(record.location || '')}" data-notes="${escapeHtml(record.notes || '')}">
                            <i class="fab fa-discogs"></i> Post
                         </button>` :
                        `<span style="color: #999;">—</span>`
                    }
                </td>
            </tr>
        `;
    }
    
    tableBody.innerHTML = html;
    
    // Attach event listeners to post buttons
    document.querySelectorAll('.post-single-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const recordId = parseInt(this.dataset.recordId);
            const artist = this.dataset.artist;
            const title = this.dataset.title;
            const price = parseFloat(this.dataset.price);
            const mediaCondition = this.dataset.mediaCondition;
            const sleeveCondition = this.dataset.sleeveCondition;
            const catalogNumber = this.dataset.catalog;
            const location = this.dataset.location;
            const notes = this.dataset.notes;
            
            postSingleRecordToDiscogs(recordId, artist, title, price, mediaCondition, sleeveCondition, catalogNumber, location, notes);
        });
    });
}

// ============================================================================
// Post Single Record to Discogs
// ============================================================================

window.postSingleRecordToDiscogs = async function(recordId, artist, title, price, mediaCondition, sleeveCondition, catalogNumber, location, notes) {
    console.log('postSingleRecordToDiscogs called', { recordId, artist, title, price });
    
    if (!recordId) {
        showStatus('Invalid record ID', 'error');
        return;
    }
    
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
    
    if (!confirm(`📋 Post "${artist} - ${title}" to Discogs?\n\nStore Price: $${price}\nMedia: ${mediaCondition}\nSleeve: ${sleeveCondition}\n\nThis will create a new Discogs listing.`)) {
        return;
    }
    
    openProgressModal(`Posting to Discogs: ${artist} - ${title}`);
    appendToModalLog(`🚀 Starting to post "${artist} - ${title}" to Discogs...`, 'info');
    appendToModalLog(`💰 Store Price: $${price}`, 'info');
    appendToModalLog(`📀 Media Condition: ${mediaCondition}`, 'info');
    appendToModalLog(`📀 Sleeve Condition: ${sleeveCondition}`, 'info');
    if (location) appendToModalLog(`📍 Location: ${location}`, 'info');
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    
    // Get markup percentage from config
    let markupPercent = 20;
    try {
        const markupResp = await fetch(`${AppConfig.baseUrl}/config/DISCOGS_MARKUP_PERCENT`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (markupResp.ok) {
            const data = await markupResp.json();
            if (data.config_value) markupPercent = parseFloat(data.config_value);
        }
    } catch (e) {
        console.warn('Could not load markup config, using default 20%');
    }
    
    const discogsPrice = Math.round(price * (1 + markupPercent / 100) * 100) / 100;
    appendToModalLog(`💰 Discogs List Price (${markupPercent}% markup): $${discogsPrice}`, 'info');
    
    const listingData = {
        record: {
            id: recordId,
            artist: artist,
            title: title,
            catalog_number: catalogNumber || '',
            media_condition: mediaCondition,
            sleeve_condition: sleeveCondition,
            price: discogsPrice,
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
            let discogsUrl = result.listing_url;
            if (!discogsUrl && result.listing_id) {
                discogsUrl = `https://www.discogs.com/sell/item/${result.listing_id}`;
            }
            
            appendToModalLog(`✅ SUCCESS! Record posted to Discogs!`, 'success');
            appendToModalLog(`🔗 Discogs URL: ${discogsUrl}`, 'success');
            appendToModalLog(`🆔 Listing ID: ${result.listing_id}`, 'info');
            appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'success');
            
            showStatusWithLink(`✅ Successfully posted "${artist} - ${title}" to Discogs!`, discogsUrl, 'success');
            
            // Reload the current location to refresh the list
            await loadLocationRecords();
            
        } else {
            throw new Error(result.error || 'Failed to create listing');
        }
        
    } catch (error) {
        appendToModalLog(`❌ FAILED: ${error.message}`, 'error');
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        setTimeout(() => closeProgressModal(), 2000);
    }
};

// ============================================================================
// Bulk Post All Records in Current Location
// ============================================================================

async function bulkPostToDiscogs() {
    // Get eligible records (active status)
    const eligibleRecords = filteredRecords.filter(r => r.status_id === 2);
    
    if (eligibleRecords.length === 0) {
        showStatus('No eligible records to post (only Active records can be posted)', 'warning');
        return;
    }
    
    const markupPercent = document.getElementById('discogs-markup')?.value || 20;
    
    if (!confirm(`📋 Post ${eligibleRecords.length} record(s) from location "${currentLocation}" to Discogs?\n\nMarkup: ${markupPercent}%\n\nThis will create new Discogs listings for each record.\n\nRate limited to 1 request per second.`)) {
        return;
    }
    
    openProgressModal(`Posting ${eligibleRecords.length} Records to Discogs`);
    appendToModalLog(`🚀 Starting bulk post for ${eligibleRecords.length} records from "${currentLocation}"...`, 'info');
    appendToModalLog(`💰 Markup: ${markupPercent}%`, 'info');
    appendToModalLog(`⏱️ Rate limited to 1 request per second. Estimated time: ~${Math.ceil(eligibleRecords.length / 60)} minutes`, 'warning');
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    
    let posted = 0;
    let failed = 0;
    
    for (let i = 0; i < eligibleRecords.length; i++) {
        if (cancelResolve) {
            appendToModalLog(`⏹️ Operation cancelled by user.`, 'warning');
            break;
        }
        
        const record = eligibleRecords[i];
        updateModalProgress(i + 1, eligibleRecords.length);
        
        const discogsPrice = Math.round(record.store_price * (1 + markupPercent / 100) * 100) / 100;
        
        appendToModalLog(`[${i+1}/${eligibleRecords.length}] Processing: ${record.artist} - ${record.title}`, 'info');
        appendToModalLog(`   Store: $${record.store_price?.toFixed(2)} → Discogs: $${discogsPrice}`, 'info');
        
        const listingData = {
            record: {
                id: record.id,
                artist: record.artist,
                title: record.title,
                catalog_number: record.catalog_number || '',
                media_condition: record.disc_condition_name || record.sleeve_condition_name || '',
                sleeve_condition: record.sleeve_condition_name || '',
                price: discogsPrice,
                notes: record.notes || '',
                location: record.location || ''
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
                posted++;
                let discogsUrl = result.listing_url;
                if (!discogsUrl && result.listing_id) {
                    discogsUrl = `https://www.discogs.com/sell/item/${result.listing_id}`;
                }
                appendToModalLog(`   ✅ POSTED: ${record.artist} - ${record.title} (ID: ${result.listing_id})`, 'success');
                if (discogsUrl) {
                    appendToModalLog(`   🔗 ${discogsUrl}`, 'info');
                }
            } else {
                failed++;
                appendToModalLog(`   ❌ FAILED: ${record.artist} - ${record.title} - ${result.error}`, 'error');
            }
        } catch (error) {
            failed++;
            appendToModalLog(`   ❌ FAILED: ${record.artist} - ${record.title} - ${error.message}`, 'error');
        }
        
        if (i < eligibleRecords.length - 1 && !cancelResolve) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    appendToModalLog(`📊 RESULTS:`, 'info');
    appendToModalLog(`   ✅ Posted: ${posted}`, 'success');
    appendToModalLog(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
    
    if (posted > 0) {
        appendToModalLog(`🔄 Reloading location data...`, 'info');
        await loadLocationRecords();
        appendToModalLog(`✅ Data refreshed`, 'success');
    }
}

// ============================================================================
// Show status message with clickable link
// ============================================================================

function showStatusWithLink(message, url, type = 'success') {
    if (!statusMessage) return;
    
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const linkHtml = url ? `<br><a href="${url}" target="_blank" style="color: #007bff; text-decoration: underline;"><i class="fab fa-discogs"></i> View on Discogs</a>` : '';
    
    statusMessage.innerHTML = `${icons[type] || 'ℹ️'} ${escapeHtml(message)}${linkHtml}`;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.style.display = 'block';
    
    setTimeout(() => {
        if (statusMessage) statusMessage.style.display = 'none';
    }, 15000);
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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.closeProgressModal = closeProgressModal;
window.refreshDiscogsLocations = loadLocations;

// ============================================================================
// Initialization - Load data when tab opens
// ============================================================================

function initDiscogsTab() {
    console.log('🎵 Initializing Discogs Tab (Location-based only)...');
    
    tableBody = document.getElementById('combined-inventory-body');
    locationSelect = document.getElementById('discogs-location-select');
    postButton = document.getElementById('post-location-button');
    statusMessage = document.getElementById('discogs-status-message');
    searchInput = document.getElementById('discogs-search-input');
    searchButton = document.getElementById('discogs-search-button');
    
    if (!tableBody) {
        console.error('Table body element not found!');
        return;
    }
    
    if (!locationSelect) {
        console.error('Location select element not found! Looking for id: discogs-location-select');
        return;
    }
    
    // Setup location select event
    locationSelect.onchange = () => {
        console.log('Location changed to:', locationSelect.value);
        loadLocationRecords();
    };
    
    // Setup search event listeners
    if (searchButton) {
        searchButton.onclick = () => {
            applySearchFilter();
        };
    }
    if (searchInput) {
        searchInput.onkeyup = (e) => {
            if (e.key === 'Enter') {
                applySearchFilter();
            }
        };
    }
    
    // Setup post button
    if (postButton) {
        postButton.onclick = () => {
            bulkPostToDiscogs();
        };
        postButton.disabled = true;
        postButton.style.opacity = '0.5';
    }
    
    // Load config and locations
    loadDiscogsConfig();
    loadLocations();
    
    tableBody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 40px;">Select a location to view records</td></tr>';
    
    console.log('✅ Discogs Tab initialized');
}

// ============================================================================
// Tab Activation Handler
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'discogs') {
        console.log('🎵 Discogs tab activated, initializing...');
        setTimeout(initDiscogsTab, 100);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const discogsTab = document.querySelector('.tab[data-tab="discogs"]');
    if (discogsTab && discogsTab.classList.contains('active')) {
        setTimeout(initDiscogsTab, 200);
    }
});

// Make initDiscogsTab globally available
window.initDiscogsTab = initDiscogsTab;

console.log('✅ discogs.js loaded - Location-based bulk posting only (no listing ID tracking)');