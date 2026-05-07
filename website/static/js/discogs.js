// ============================================================================
// discogs.js - Location-based bulk posting to Discogs with Markup Rules
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
                    <div id="modal-log" style="height: 300px; overflow-y: auto; background: #1e1e1e; border-radius: 4px; padding: 10px; font-family: monospace; font-size: 12px; color: #d4d4d4;"></div>
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
            appendToModalLog('Cancelling... Please wait for current item to complete.', 'warning');
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
    modalProgressBar.style.width = percent + '%';
    if (modalProgressText) modalProgressText.textContent = percent + '%';
}

function appendToModalLog(message, type) {
    if (!modalLog) return;
    type = type || 'info';
    
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
// Load unique locations from records
// ============================================================================

async function loadLocations() {
    console.log('Loading locations from API...');
    
    try {
        const url = AppConfig.baseUrl + '/api/locations';
        
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            renderLocationSelect(data.locations);
            console.log('Loaded ' + data.locations.length + ' locations');
        } else {
            throw new Error(data.error || 'Failed to load locations');
        }
    } catch (error) {
        console.error('Error loading locations:', error);
        renderLocationSelect([]);
        showStatus('Warning: Could not load locations - ' + error.message, 'warning');
    }
}

function renderLocationSelect(locations) {
    if (!locationSelect) {
        console.error('locationSelect element not found!');
        return;
    }
    
    locationSelect.innerHTML = '<option value="">-- Select a location --</option>';
    
    if (!locations || locations.length === 0) {
        locationSelect.innerHTML = '<option value="">-- No locations found --</option>';
        return;
    }
    
    locations.forEach(function(location) {
        const option = document.createElement('option');
        option.value = location;
        option.textContent = location;
        locationSelect.appendChild(option);
    });
}

// ============================================================================
// Load records by location
// ============================================================================

async function loadLocationRecords() {
    const selectedLocation = locationSelect ? locationSelect.value : null;
    
    if (!selectedLocation) {
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;">Select a location to view records</td></tr>';
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
        tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-pulse"></i> Loading records...</td></tr>';
    }
    
    try {
        const url = AppConfig.baseUrl + '/api/records/by-location?location=' + encodeURIComponent(selectedLocation);
        
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            currentLocationRecords = data.records || [];
            applySearchFilter();
            
            if (postButton) {
                postButton.disabled = false;
                postButton.style.opacity = '1';
                var eligibleCount = filteredRecords.filter(function(r) { return r.status_id === 2; }).length;
                postButton.innerHTML = '<i class="fab fa-discogs"></i> Post ' + eligibleCount + ' of ' + filteredRecords.length + ' Record(s) to Discogs';
            }
        } else {
            throw new Error(data.error || 'Failed to load records');
        }
        
    } catch (error) {
        console.error('Error loading location records:', error);
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px; color: #dc3545;">Error: ' + error.message + '</td></tr>';
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
// Apply search filter
// ============================================================================

function applySearchFilter() {
    var searchTerm = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
    
    if (searchTerm) {
        filteredRecords = currentLocationRecords.filter(function(record) {
            var matchesArtist = record.artist && record.artist.toLowerCase().indexOf(searchTerm) !== -1;
            var matchesTitle = record.title && record.title.toLowerCase().indexOf(searchTerm) !== -1;
            var matchesCatalog = record.catalog_number && record.catalog_number.toLowerCase().indexOf(searchTerm) !== -1;
            return matchesArtist || matchesTitle || matchesCatalog;
        });
    } else {
        filteredRecords = currentLocationRecords.slice();
    }
    
    renderTable();
    
    if (postButton) {
        var eligibleCount = filteredRecords.filter(function(r) { return r.status_id === 2; }).length;
        postButton.innerHTML = '<i class="fab fa-discogs"></i> Post ' + eligibleCount + ' of ' + filteredRecords.length + ' Record(s) to Discogs';
        postButton.disabled = (eligibleCount === 0);
        postButton.style.opacity = (eligibleCount === 0) ? '0.5' : '1';
    }
}

// ============================================================================
// Clear search filter
// ============================================================================

function clearDiscogsSearch() {
    if (searchInput) {
        searchInput.value = '';
    }
    applySearchFilter();
}

// ============================================================================
// Toggle Markup Rules
// ============================================================================

function toggleMarkupRules() {
    var content = document.getElementById('markup-rules-content');
    var icon = document.getElementById('markup-rules-toggle-icon');
    
    if (!content || !icon) return;
    
    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
        loadMarkupRules();
    } else {
        content.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
}

// ============================================================================
// Calculate markup for record
// ============================================================================

async function calculateMarkupForRecord(createdAt, storePrice) {
    if (!createdAt) {
        return {
            success: false,
            error: 'Missing creation date'
        };
    }
    
    try {
        const response = await fetch(AppConfig.baseUrl + '/api/discogs/calculate-markup', {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                created_at: createdAt,
                store_price: storePrice
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            return {
                success: true,
                discogs_price: result.discogs_price,
                markup_percent: result.markup_percent,
                days_old: result.days_old
            };
        } else {
            return {
                success: false,
                error: result.error || 'Failed to calculate markup'
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================================================
// Render table
// ============================================================================

async function renderTable() {
    if (!tableBody) return;
    
    if (filteredRecords.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;">' + (currentLocation ? 'No records found in this location.' : 'Select a location above') + '</td></tr>';
        return;
    }
    
    var html = '';
    
    for (var i = 0; i < filteredRecords.length; i++) {
        var record = filteredRecords[i];
        var imageUrl = record.image_url && record.image_url !== '' && record.image_url !== 'None' ? record.image_url : null;
        
        var statusBadge = '';
        if (record.status_id === 1) statusBadge = '<span class="status-badge new">New</span>';
        else if (record.status_id === 2) statusBadge = '<span class="status-badge active">Active</span>';
        else if (record.status_id === 3) statusBadge = '<span class="status-badge sold">Sold</span>';
        else statusBadge = '<span class="status-badge">Unknown</span>';
        
        var canPost = (record.status_id === 2);
        var discogsPrice = null;
        var markupPercent = null;
        var priceError = null;
        
        if (canPost && record.created_at) {
            var markupInfo = await calculateMarkupForRecord(record.created_at, record.store_price);
            if (markupInfo.success) {
                discogsPrice = markupInfo.discogs_price;
                markupPercent = markupInfo.markup_percent;
            } else {
                priceError = markupInfo.error;
            }
        } else if (canPost && !record.created_at) {
            priceError = 'Missing creation date';
        }
        
        var displayDiscogsPrice = discogsPrice ? '$' + discogsPrice.toFixed(2) : '—';
        var markupClass = (markupPercent > 0) ? 'positive' : ((markupPercent < 0) ? 'negative' : 'zero');
        var displayMarkup = (markupPercent !== null) ? (markupPercent > 0 ? '+' : '') + markupPercent + '%' : '—';
        
        html += '<tr>';
        html += '<td style="text-align: center;">' + (imageUrl ? '<img src="' + escapeHtml(imageUrl) + '" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">' : '<div style="width: 40px; height: 40px; background: #e0e0e0; border-radius: 4px; display: inline-block;"></div>') + '</td>';
        html += '<td>' + (record.id || '—') + '</td>';
        html += '<td><strong>' + escapeHtml(record.artist) + '</strong></td>';
        html += '<td>' + escapeHtml(record.title) + '</td>';
        html += '<td>' + (record.catalog_number || '—') + '</td>';
        html += '<td>' + (record.disc_condition_name || record.sleeve_condition_name || '—') + '</td>';
        html += '<td>' + (record.sleeve_condition_name || '—') + '</td>';
        html += '<td>' + (record.store_price ? '$' + parseFloat(record.store_price).toFixed(2) : '—') + '</td>';
        html += '<td class="discogs-price-cell" style="' + (discogsPrice ? 'color: #28a745; font-weight: bold;' : 'color: #999;') + '">' + displayDiscogsPrice + (priceError ? '<div style="font-size: 10px; color: #dc3545;">' + priceError + '</div>' : '') + '</td>';
        html += '<td class="markup-cell ' + markupClass + '">' + displayMarkup + '</td>';
        html += '<td title="' + escapeHtml(record.location || '') + '">' + (record.location ? record.location.substring(0, 50) : '—') + '</td>';
        html += '<td>' + statusBadge + '</td>';
        html += '<td style="text-align: center;">';
        if (canPost && discogsPrice) {
            html += '<button class="post-single-btn" data-record-id="' + record.id + '" data-artist="' + escapeHtml(record.artist) + '" data-title="' + escapeHtml(record.title) + '" data-price="' + record.store_price + '" data-discogs-price="' + discogsPrice + '" data-markup-percent="' + markupPercent + '" data-media-condition="' + (record.disc_condition_name || '') + '" data-sleeve-condition="' + (record.sleeve_condition_name || '') + '" data-catalog="' + escapeHtml(record.catalog_number || '') + '" data-location="' + escapeHtml(record.location || '') + '" data-notes="' + escapeHtml(record.notes || '') + '"><i class="fab fa-discogs"></i> Post</button>';
        } else if (canPost && !discogsPrice) {
            html += '<span style="color: #dc3545; font-size: 11px;">Cannot post</span>';
        } else {
            html += '<span style="color: #999;">—</span>';
        }
        html += '</td></tr>';
    }
    
    tableBody.innerHTML = html;
    
    // Attach event listeners
    var buttons = document.querySelectorAll('.post-single-btn');
    for (var j = 0; j < buttons.length; j++) {
        buttons[j].addEventListener('click', function(e) {
            e.preventDefault();
            var btn = this;
            postSingleRecordToDiscogs(
                parseInt(btn.dataset.recordId),
                btn.dataset.artist,
                btn.dataset.title,
                parseFloat(btn.dataset.price),
                parseFloat(btn.dataset.discogsPrice),
                parseFloat(btn.dataset.markupPercent),
                btn.dataset.mediaCondition,
                btn.dataset.sleeveCondition,
                btn.dataset.catalog,
                btn.dataset.location,
                btn.dataset.notes
            );
        });
    }
}

// ============================================================================
// Post Single Record
// ============================================================================

async function postSingleRecordToDiscogs(recordId, artist, title, price, discogsPrice, markupPercent, mediaCondition, sleeveCondition, catalogNumber, location, notes) {
    if (!recordId || !mediaCondition || !sleeveCondition || !price || !discogsPrice) {
        showStatus('Missing required information', 'error');
        return;
    }
    
    if (!confirm('Post "' + artist + ' - ' + title + '" to Discogs?\n\nStore Price: $' + price + '\nDiscogs Price: $' + discogsPrice + ' (' + (markupPercent > 0 ? '+' : '') + markupPercent + '%)\nMedia: ' + mediaCondition + '\nSleeve: ' + sleeveCondition)) {
        return;
    }
    
    openProgressModal('Posting to Discogs: ' + artist + ' - ' + title);
    appendToModalLog('Starting to post "' + artist + ' - ' + title + '" to Discogs...', 'info');
    appendToModalLog('Store Price: $' + price, 'info');
    appendToModalLog('Discogs Price: $' + discogsPrice + ' (' + (markupPercent > 0 ? '+' : '') + markupPercent + '%)', 'info');
    
    var listingData = {
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
        var response = await fetch(AppConfig.baseUrl + '/api/discogs/create-listing-single', {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(listingData)
        });
        
        var result = await response.json();
        
        if (result.success) {
            var discogsUrl = result.listing_url;
            if (!discogsUrl && result.listing_id) {
                discogsUrl = 'https://www.discogs.com/sell/item/' + result.listing_id;
            }
            
            appendToModalLog('SUCCESS! Record posted to Discogs!', 'success');
            appendToModalLog('Discogs URL: ' + discogsUrl, 'success');
            showStatusWithLink('Successfully posted "' + artist + ' - ' + title + '" to Discogs!', discogsUrl, 'success');
            await loadLocationRecords();
        } else {
            throw new Error(result.error || 'Failed to create listing');
        }
    } catch (error) {
        appendToModalLog('FAILED: ' + error.message, 'error');
        showStatus('Error: ' + error.message, 'error');
    } finally {
        setTimeout(function() { closeProgressModal(); }, 2000);
    }
}

// ============================================================================
// Bulk Post
// ============================================================================

async function bulkPostToDiscogs() {
    var eligibleRecords = filteredRecords.filter(function(r) { return r.status_id === 2; });
    
    if (eligibleRecords.length === 0) {
        showStatus('No eligible records to post', 'warning');
        return;
    }
    
    openProgressModal('Validating ' + eligibleRecords.length + ' records...');
    appendToModalLog('Validating markup rules for ' + eligibleRecords.length + ' records...', 'info');
    
    var validatedRecords = [];
    for (var i = 0; i < eligibleRecords.length; i++) {
        var record = eligibleRecords[i];
        if (!record.created_at) {
            appendToModalLog('Record #' + record.id + ' (' + record.artist + ' - ' + record.title + ') cannot be posted: Missing creation date', 'error');
            continue;
        }
        
        var markupInfo = await calculateMarkupForRecord(record.created_at, record.store_price);
        if (markupInfo.success) {
            validatedRecords.push({
                id: record.id,
                artist: record.artist,
                title: record.title,
                store_price: record.store_price,
                discogs_price: markupInfo.discogs_price,
                markup_percent: markupInfo.markup_percent,
                catalog_number: record.catalog_number,
                disc_condition_name: record.disc_condition_name,
                sleeve_condition_name: record.sleeve_condition_name,
                notes: record.notes,
                location: record.location
            });
        } else {
            appendToModalLog('Record #' + record.id + ' (' + record.artist + ' - ' + record.title + ') cannot be posted: ' + markupInfo.error, 'error');
        }
    }
    
    if (validatedRecords.length === 0) {
        appendToModalLog('No records can be posted. Please configure markup rules first.', 'error');
        showStatus('No records can be posted. Please configure markup rules.', 'error');
        setTimeout(function() { closeProgressModal(); }, 3000);
        return;
    }
    
    closeProgressModal();
    
    if (!confirm('Post ' + validatedRecords.length + ' record(s) to Discogs?\n\nThis will create new Discogs listings for each record.')) {
        return;
    }
    
    openProgressModal('Posting ' + validatedRecords.length + ' Records to Discogs');
    appendToModalLog('Starting bulk post for ' + validatedRecords.length + ' records...', 'info');
    
    var posted = 0;
    var failed = 0;
    
    for (var j = 0; j < validatedRecords.length; j++) {
        if (cancelResolve) {
            appendToModalLog('Operation cancelled by user.', 'warning');
            break;
        }
        
        var rec = validatedRecords[j];
        updateModalProgress(j + 1, validatedRecords.length);
        
        appendToModalLog('[' + (j+1) + '/' + validatedRecords.length + '] Processing: ' + rec.artist + ' - ' + rec.title, 'info');
        appendToModalLog('   Store: $' + rec.store_price.toFixed(2) + ' → Discogs: $' + rec.discogs_price.toFixed(2) + ' (' + (rec.markup_percent > 0 ? '+' : '') + rec.markup_percent + '%)', 'info');
        
        var listingData = {
            record: {
                id: rec.id,
                artist: rec.artist,
                title: rec.title,
                catalog_number: rec.catalog_number || '',
                media_condition: rec.disc_condition_name || rec.sleeve_condition_name || '',
                sleeve_condition: rec.sleeve_condition_name || '',
                price: rec.discogs_price,
                notes: rec.notes || '',
                location: rec.location || ''
            }
        };
        
        try {
            var response = await fetch(AppConfig.baseUrl + '/api/discogs/create-listing-single', {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(listingData)
            });
            
            var result = await response.json();
            
            if (result.success) {
                posted++;
                appendToModalLog('   POSTED: ' + rec.artist + ' - ' + rec.title, 'success');
            } else {
                failed++;
                appendToModalLog('   FAILED: ' + rec.artist + ' - ' + rec.title + ' - ' + result.error, 'error');
            }
        } catch (error) {
            failed++;
            appendToModalLog('   FAILED: ' + rec.artist + ' - ' + rec.title + ' - ' + error.message, 'error');
        }
        
        if (j < validatedRecords.length - 1 && !cancelResolve) {
            await new Promise(function(resolve) { setTimeout(resolve, 1000); });
        }
    }
    
    appendToModalLog('RESULTS:', 'info');
    appendToModalLog('   Posted: ' + posted, 'success');
    appendToModalLog('   Failed: ' + failed, failed > 0 ? 'error' : 'info');
    
    if (posted > 0) {
        appendToModalLog('Reloading location data...', 'info');
        await loadLocationRecords();
    }
}

// ============================================================================
// Show status messages
// ============================================================================

function showStatusWithLink(message, url, type) {
    if (!statusMessage) return;
    type = type || 'success';
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    var linkHtml = url ? '<br><a href="' + url + '" target="_blank" style="color: #007bff;">View on Discogs</a>' : '';
    statusMessage.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message) + linkHtml;
    statusMessage.className = 'status-message status-' + type;
    statusMessage.style.display = 'block';
    setTimeout(function() { if (statusMessage) statusMessage.style.display = 'none'; }, 15000);
}

function showStatus(message, type) {
    if (!statusMessage) return;
    type = type || 'info';
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    statusMessage.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
    statusMessage.className = 'status-message status-' + type;
    statusMessage.style.display = 'block';
    setTimeout(function() { if (statusMessage) statusMessage.style.display = 'none'; }, 8000);
}

// ============================================================================
// Markup Rules Management
// ============================================================================

async function loadMarkupRules() {
    try {
        var response = await fetch(AppConfig.baseUrl + '/api/markup-rules', {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (response.ok) {
            var data = await response.json();
            if (data.status === 'success') {
                renderMarkupRules(data.rules);
            }
        }
    } catch (error) {
        console.error('Error loading markup rules:', error);
    }
}

function renderMarkupRules(rules) {
    var tbody = document.getElementById('markup-rules-body');
    var warning = document.getElementById('no-rules-warning');
    
    if (!tbody) return;
    
    if (!rules || rules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding: 30px; text-align: center;">No rules configured. Add your first rule above.</td></tr>';
        if (warning) warning.style.display = 'block';
        return;
    }
    
    if (warning) warning.style.display = 'none';
    
    rules.sort(function(a, b) { return a.days_old - b.days_old; });
    
    var html = '';
    for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        html += '<tr style="border-bottom: 1px solid #dee2e6;">';
        html += '<td style="padding: 12px;">' + rule.days_old + '+ days</td>';
        html += '<td style="padding: 12px;"><input type="number" id="rule-percent-' + rule.id + '" value="' + rule.markup_percent + '" step="1" style="width: 80px; padding: 6px;"><span>%</span></td>';
        html += '<td style="padding: 12px;"><input type="text" id="rule-desc-' + rule.id + '" value="' + escapeHtml(rule.description || '') + '" style="width: 100%; padding: 6px;"></td>';
        html += '<td style="padding: 12px;">';
        html += '<button class="btn btn-sm btn-info" onclick="updateMarkupRule(' + rule.id + ')">Save</button> ';
        html += '<button class="btn btn-sm btn-danger" onclick="deleteMarkupRule(' + rule.id + ')">Delete</button>';
        html += '</td></tr>';
    }
    tbody.innerHTML = html;
}

async function addMarkupRule() {
    var days_old = parseInt(document.getElementById('new-rule-days').value);
    var markup_percent = parseFloat(document.getElementById('new-rule-percent').value);
    var description = document.getElementById('new-rule-desc').value;
    
    if (isNaN(days_old) || isNaN(markup_percent)) {
        showStatus('Please enter valid days and percentage', 'error');
        return;
    }
    
    try {
        var response = await fetch(AppConfig.baseUrl + '/api/markup-rules', {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ days_old: days_old, markup_percent: markup_percent, description: description })
        });
        
        if (response.ok) {
            showStatus('Markup rule added successfully', 'success');
            document.getElementById('new-rule-days').value = '';
            document.getElementById('new-rule-percent').value = '';
            document.getElementById('new-rule-desc').value = '';
            loadMarkupRules();
            if (currentLocation) await loadLocationRecords();
        } else {
            var error = await response.json();
            showStatus('Error: ' + error.error, 'error');
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

async function updateMarkupRule(ruleId) {
    var markup_percent = parseFloat(document.getElementById('rule-percent-' + ruleId).value);
    var description = document.getElementById('rule-desc-' + ruleId).value;
    
    if (isNaN(markup_percent)) {
        showStatus('Please enter a valid percentage', 'error');
        return;
    }
    
    try {
        var response = await fetch(AppConfig.baseUrl + '/api/markup-rules/' + ruleId, {
            method: 'PUT',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ markup_percent: markup_percent, description: description })
        });
        
        if (response.ok) {
            showStatus('Markup rule updated successfully', 'success');
            loadMarkupRules();
            if (currentLocation) await loadLocationRecords();
        } else {
            var error = await response.json();
            showStatus('Error: ' + error.error, 'error');
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

async function deleteMarkupRule(ruleId) {
    if (!confirm('Are you sure you want to delete this markup rule?')) return;
    
    try {
        var response = await fetch(AppConfig.baseUrl + '/api/markup-rules/' + ruleId, {
            method: 'DELETE',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (response.ok) {
            showStatus('Markup rule deleted successfully', 'success');
            loadMarkupRules();
            if (currentLocation) await loadLocationRecords();
        } else {
            var error = await response.json();
            showStatus('Error: ' + error.error, 'error');
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

// ============================================================================
// Config Management
// ============================================================================

async function saveDiscogsConfig() {
    var markupInput = document.getElementById('discogs-markup');
    var configStatus = document.getElementById('config-status');
    
    if (!markupInput) return;
    
    configStatus.innerHTML = 'Saving...';
    
    try {
        var response = await fetch(AppConfig.baseUrl + '/config/DISCOGS_MARKUP_PERCENT', {
            method: 'PUT',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ config_value: markupInput.value })
        });
        
        if (response.ok) {
            configStatus.innerHTML = 'Saved!';
            configStatus.style.color = '#28a745';
            setTimeout(function() { configStatus.innerHTML = ''; }, 3000);
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        configStatus.innerHTML = 'Save failed';
        configStatus.style.color = '#dc3545';
        setTimeout(function() { configStatus.innerHTML = ''; }, 3000);
    }
}

// ============================================================================
// Escape HTML
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============================================================================
// Initialization
// ============================================================================

function initDiscogsTab() {
    console.log('Initializing Discogs Tab...');
    
    tableBody = document.getElementById('combined-inventory-body');
    locationSelect = document.getElementById('discogs-location-select');
    postButton = document.getElementById('post-location-button');
    statusMessage = document.getElementById('discogs-status-message');
    searchInput = document.getElementById('discogs-search-input');
    searchButton = document.getElementById('discogs-search-button');
    
    if (locationSelect) {
        locationSelect.onchange = function() {
            loadLocationRecords();
        };
    }
    
    if (searchButton) {
        searchButton.onclick = function() {
            applySearchFilter();
        };
    }
    
    if (searchInput) {
        searchInput.onkeyup = function(e) {
            if (e.key === 'Enter') {
                applySearchFilter();
            }
        };
    }
    
    if (postButton) {
        postButton.onclick = function() {
            bulkPostToDiscogs();
        };
        postButton.disabled = true;
        postButton.style.opacity = '0.5';
    }
    
    loadLocations();
    
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;">Select a location to view records</td></tr>';
    }
}

// ============================================================================
// Make functions globally available
// ============================================================================

window.initDiscogsTab = initDiscogsTab;
window.clearDiscogsSearch = clearDiscogsSearch;
window.toggleMarkupRules = toggleMarkupRules;
window.addMarkupRule = addMarkupRule;
window.updateMarkupRule = updateMarkupRule;
window.deleteMarkupRule = deleteMarkupRule;
window.saveDiscogsConfig = saveDiscogsConfig;
window.postSingleRecordToDiscogs = postSingleRecordToDiscogs;
window.closeProgressModal = closeProgressModal;
window.refreshDiscogsLocations = loadLocations;

// ============================================================================
// Tab Activation Handler
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'discogs') {
        setTimeout(initDiscogsTab, 100);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    var discogsTab = document.querySelector('.tab[data-tab="discogs"]');
    if (discogsTab && discogsTab.classList.contains('active')) {
        setTimeout(initDiscogsTab, 200);
    }
});

console.log('discogs.js loaded');