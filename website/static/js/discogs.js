// ============================================================================
// discogs.js - Location-based bulk posting to Discogs with Markup Rules
// ============================================================================

let currentLocationRecords = [];
let discogsFilteredRecords = [];
let currentLocation = null;
let currentLocationPrefix = null;
let isLoading = false;
let cancelResolve = false;

// DOM Elements
let tableBody = null;
let discogsLocationSelect = null;
let discogsPostButton = null;
let discogsStatusMessage = null;
let discogsSearchInput = null;
let discogsSearchButton = null;

// Modal elements
let progressModal = null;
let modalTitle = null;
let modalProgressBar = null;
let modalProgressText = null;
let modalLog = null;
let modalCancelBtn = null;

// ============================================================================
// Helper: Check if record has a consignor
// ============================================================================

function hasConsignor(record) {
    return (record.consignor_id && record.consignor_id !== 1 && record.consignor_id !== null);
}

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
// Toggle Markup Rules Collapsible Section
// ============================================================================

window.toggleMarkupRules = function() {
    const content = document.getElementById('markup-rules-content');
    const icon = document.getElementById('markup-rules-toggle-icon');
    
    if (!content || !icon) {
        console.error('Markup rules elements not found');
        return;
    }
    
    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
        loadMarkupRules();
    } else {
        content.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
};

// ============================================================================
// Load unique locations from records (stripped of counters)
// ============================================================================

async function loadLocations() {
    console.log('📍 Loading locations from API...');
    
    try {
        const url = window.AppConfig.baseUrl + '/api/locations';
        
        const response = await fetch(url, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            renderLocationSelect(data.locations);
            console.log('✅ Loaded ' + data.locations.length + ' bins/locations');
        } else {
            throw new Error(data.error || 'Failed to load locations');
        }
    } catch (error) {
        console.error('Error loading locations:', error);
        renderLocationSelect([]);
        showDiscogsStatus('Warning: Could not load locations - ' + error.message, 'warning');
    }
}

function renderLocationSelect(locations) {
    if (!discogsLocationSelect) {
        console.error('locationSelect element not found!');
        return;
    }
    
    discogsLocationSelect.innerHTML = '<option value="">-- Select a bin/location --</option>';
    
    if (!locations || locations.length === 0) {
        discogsLocationSelect.innerHTML = '<option value="">-- No locations found --</option>';
        return;
    }
    
    locations.forEach(function(location) {
        const option = document.createElement('option');
        option.value = location;
        option.textContent = location;
        discogsLocationSelect.appendChild(option);
    });
}

// ============================================================================
// Load records by location (entire bin - all counters)
// ============================================================================

async function loadLocationRecords() {
    const selectedLocation = discogsLocationSelect ? discogsLocationSelect.value : null;
    
    if (!selectedLocation) {
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;">Select a bin/location to view records</td></tr>';
        }
        if (discogsPostButton) {
            discogsPostButton.disabled = true;
            discogsPostButton.style.opacity = '0.5';
            discogsPostButton.innerHTML = '<i class="fab fa-discogs"></i> Post to Discogs';
        }
        return;
    }
    
    currentLocation = selectedLocation;
    isLoading = true;
    
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-pulse"></i> Loading records...</td></tr>';
    }
    
    try {
        const url = window.AppConfig.baseUrl + '/api/records/by-location?location=' + encodeURIComponent(selectedLocation);
        
        const response = await fetch(url, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            currentLocationRecords = data.records || [];
            console.log('✅ Loaded ' + currentLocationRecords.length + ' records from bin "' + selectedLocation + '"');
            
            if (currentLocationRecords.length > 0) {
                console.log('Sample record location:', currentLocationRecords[0].location);
            }
            
            applyDiscogsSearchFilter();
            
            if (discogsPostButton) {
                discogsPostButton.disabled = false;
                discogsPostButton.style.opacity = '1';
                // Only count store items (no consignor) for posting
                const eligibleCount = discogsFilteredRecords.filter(function(r) { 
                    return r.status_id === 2 && !hasConsignor(r);
                }).length;
                discogsPostButton.innerHTML = '<i class="fab fa-discogs"></i> Post Entire "' + selectedLocation + '" (' + eligibleCount + ' of ' + discogsFilteredRecords.length + ' records)';
            }
        } else {
            throw new Error(data.error || 'Failed to load records');
        }
        
    } catch (error) {
        console.error('Error loading location records:', error);
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px; color: #dc3545;">Error: ' + error.message + '</td><tr>';
        }
        if (discogsPostButton) {
            discogsPostButton.disabled = true;
            discogsPostButton.style.opacity = '0.5';
            discogsPostButton.innerHTML = '<i class="fab fa-discogs"></i> Post to Discogs';
        }
    } finally {
        isLoading = false;
    }
}

// ============================================================================
// Apply search filter to current location records
// ============================================================================

function applyDiscogsSearchFilter() {
    const searchTerm = (discogsSearchInput && discogsSearchInput.value) ? discogsSearchInput.value.trim().toLowerCase() : '';
    
    if (searchTerm) {
        discogsFilteredRecords = currentLocationRecords.filter(function(record) {
            const matchesArtist = record.artist && record.artist.toLowerCase().indexOf(searchTerm) !== -1;
            const matchesTitle = record.title && record.title.toLowerCase().indexOf(searchTerm) !== -1;
            const matchesCatalog = record.catalog_number && record.catalog_number.toLowerCase().indexOf(searchTerm) !== -1;
            return matchesArtist || matchesTitle || matchesCatalog;
        });
    } else {
        discogsFilteredRecords = currentLocationRecords.slice();
    }
    
    renderDiscogsTable();
    
    if (discogsPostButton && currentLocation) {
        const eligibleCount = discogsFilteredRecords.filter(function(r) { 
            return r.status_id === 2 && !hasConsignor(r);
        }).length;
        discogsPostButton.innerHTML = '<i class="fab fa-discogs"></i> Post Entire "' + currentLocation + '" (' + eligibleCount + ' of ' + discogsFilteredRecords.length + ' records)';
        discogsPostButton.disabled = (eligibleCount === 0);
        discogsPostButton.style.opacity = (eligibleCount === 0) ? '0.5' : '1';
    }
    
    if (discogsStatusMessage && currentLocation) {
        const searchInfo = searchTerm ? ' (matching "' + searchTerm + '")' : '';
        discogsStatusMessage.innerHTML = '📍 Bin: ' + currentLocation + ' | ' + discogsFilteredRecords.length + ' record(s) found in this bin' + searchInfo;
        discogsStatusMessage.className = 'status-message status-info';
        discogsStatusMessage.style.display = 'block';
        setTimeout(function() { if (discogsStatusMessage) discogsStatusMessage.style.display = 'none'; }, 3000);
    }
}

// ============================================================================
// Clear search filter
// ============================================================================

window.clearDiscogsSearch = function() {
    if (discogsSearchInput) {
        discogsSearchInput.value = '';
    }
    applyDiscogsSearchFilter();
};

// ============================================================================
// Calculate markup based on record age using API
// ============================================================================

async function calculateMarkupForRecord(createdAt, storePrice) {
    if (!createdAt) {
        return {
            success: false,
            error: 'Missing creation date'
        };
    }
    
    try {
        const response = await fetch(window.AppConfig.baseUrl + '/api/discogs/calculate-markup', {
            method: 'POST',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
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
        console.error('Error in calculateMarkupForRecord:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================================================
// Render table from discogsFilteredRecords
// ============================================================================

async function renderDiscogsTable() {
    if (!tableBody) return;
    
    if (discogsFilteredRecords.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;">' + (currentLocation ? 'No records found in this bin.' : 'Select a bin above') + '</td></tr>';
        return;
    }
    
    let html = '';
    let processedCount = 0;
    
    for (const record of discogsFilteredRecords) {
        let imageUrl = record.image_url && record.image_url !== '' && record.image_url !== 'None' ? record.image_url : null;
        
        const canPost = (record.status_id === 2);
        const hasConsignorFlag = hasConsignor(record);
        let discogsPrice = null;
        let markupPercent = null;
        let priceError = null;
        
        if (canPost) {
            if (hasConsignorFlag) {
                // Consignor items - use store price, no markup, but cannot auto-post
                discogsPrice = record.store_price;
                markupPercent = 0;
                priceError = 'Consignor item - cannot auto-post';
            } else if (!record.created_at) {
                priceError = 'Missing creation date';
            } else {
                try {
                    const markupInfo = await calculateMarkupForRecord(record.created_at, record.store_price);
                    if (markupInfo.success) {
                        discogsPrice = markupInfo.discogs_price;
                        markupPercent = markupInfo.markup_percent;
                    } else {
                        priceError = markupInfo.error;
                    }
                } catch (err) {
                    priceError = err.message;
                    console.error('Error calculating markup for record ' + record.id + ':', err);
                }
            }
        }
        
        const displayDiscogsPrice = discogsPrice ? '$' + discogsPrice.toFixed(2) : '—';
        const markupClass = (markupPercent > 0) ? 'positive' : ((markupPercent < 0) ? 'negative' : 'zero');
        const displayMarkup = (markupPercent !== null) ? (markupPercent > 0 ? '+' : '') + markupPercent + '%' : '—';
        
        const displayLocation = record.location || '—';
        const shortLocation = displayLocation.length > 30 ? displayLocation.substring(0, 27) + '...' : displayLocation;
        
        // Add consignor badge if applicable
        const consignorBadge = hasConsignorFlag ? '<span style="display: inline-block; background: #ffc107; color: #333; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 5px;" title="Consignor item - cannot auto-post">👤 Consignor</span>' : '';
        
        html += '<tr style="' + (hasConsignorFlag ? 'background: #fff8e7;' : '') + '">';
        html += '<td style="text-align: center;">' + (imageUrl ? '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(record.artist) + '" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">' : '<div style="width: 40px; height: 40px; background: #e0e0e0; border-radius: 4px; display: inline-block;"></div>') + '</td>';
        html += '<td>' + (record.id || '—') + consignorBadge + '</td>';
        html += '<td><strong>' + escapeHtml(record.artist) + '</strong></td>';
        html += '<td>' + escapeHtml(record.title) + '</td>';
        html += '<td>' + (record.catalog_number || '—') + '</td>';
        html += '<td>' + (record.disc_condition_name || record.sleeve_condition_name || '—') + '</td>';
        html += '<td>' + (record.sleeve_condition_name || '—') + '</td>';
        html += '<td>' + (record.store_price ? '$' + parseFloat(record.store_price).toFixed(2) : '—') + '</td>';
        html += '<td class="discogs-price-cell" style="' + (discogsPrice ? 'color: #28a745; font-weight: bold;' : 'color: #999;') + '">' + displayDiscogsPrice + (priceError ? '<div style="font-size: 10px; color: #dc3545;">⚠️ ' + priceError + '</div>' : '') + '</td>';
        html += '<td class="markup-cell ' + markupClass + '">' + displayMarkup + '</td>';
        html += '<td title="' + escapeHtml(displayLocation) + '" style="font-size: 12px;">' + escapeHtml(shortLocation) + '</td>';
        html += '<td style="text-align: center;">';
        
        if (canPost && discogsPrice && !hasConsignorFlag) {
            // Normal store item - can post
            html += '<button class="post-single-btn" data-record-id="' + record.id + '" data-artist="' + escapeHtml(record.artist) + '" data-title="' + escapeHtml(record.title) + '" data-price="' + record.store_price + '" data-discogs-price="' + discogsPrice + '" data-markup-percent="' + markupPercent + '" data-media-condition="' + (record.disc_condition_name || '') + '" data-sleeve-condition="' + (record.sleeve_condition_name || '') + '" data-catalog="' + escapeHtml(record.catalog_number || '') + '" data-location="' + escapeHtml(record.location || '') + '" data-notes="' + escapeHtml(record.notes || '') + '" data-has-consignor="false"><i class="fab fa-discogs"></i> Post</button>';
        } else if (canPost && hasConsignorFlag) {
            // Consignor item - cannot auto-post
            html += '<span style="color: #ffc107; font-size: 11px;" title="Consignor items must be posted manually on Discogs"><i class="fas fa-user"></i> Manual only</span>';
        } else if (canPost && !discogsPrice) {
            html += '<span style="color: #dc3545; font-size: 11px;">⚠️ No price</span>';
        } else {
            html += '<span style="color: #999;">—</span>';
        }
        html += '</td>';
        html += '</tr>';
        
        processedCount++;
        if (processedCount % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    
    tableBody.innerHTML = html;
    
    // Attach event listeners to post buttons
    document.querySelectorAll('.post-single-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            postSingleRecordToDiscogs(
                parseInt(this.dataset.recordId),
                this.dataset.artist,
                this.dataset.title,
                parseFloat(this.dataset.price),
                parseFloat(this.dataset.discogsPrice),
                parseFloat(this.dataset.markupPercent),
                this.dataset.mediaCondition,
                this.dataset.sleeveCondition,
                this.dataset.catalog,
                this.dataset.location,
                this.dataset.notes,
                this.dataset.hasConsignor === 'true'
            );
        });
    });
}

// ============================================================================
// Post Single Record to Discogs - WITH RETRIES
// ============================================================================

window.postSingleRecordToDiscogs = async function(recordId, artist, title, price, discogsPrice, markupPercent, mediaCondition, sleeveCondition, catalogNumber, location, notes, hasConsignorFlag) {
    console.log('postSingleRecordToDiscogs called', { recordId, artist, title, price, discogsPrice });
    
    // NEW: Prevent posting consignor items
    if (hasConsignorFlag) {
        showDiscogsStatus('Consignor items cannot be auto-posted to Discogs. Must be posted manually.', 'error');
        return;
    }
    
    if (!recordId || !mediaCondition || !sleeveCondition || !price || !discogsPrice) {
        showDiscogsStatus('Missing required information', 'error');
        return;
    }
    
    if (!confirm('📋 Post "' + artist + ' - ' + title + '" to Discogs?\n\nStore Price: $' + price + '\nDiscogs Price: $' + discogsPrice + ' (' + (markupPercent > 0 ? '+' : '') + markupPercent + '%)\nMedia: ' + mediaCondition + '\nSleeve: ' + sleeveCondition)) {
        return;
    }
    
    openProgressModal('Posting to Discogs: ' + artist + ' - ' + title);
    appendToModalLog('🚀 Starting to post "' + artist + ' - ' + title + '" to Discogs...', 'info');
    appendToModalLog('💰 Store Price: $' + price, 'info');
    appendToModalLog('💰 Discogs Price: $' + discogsPrice + ' (' + (markupPercent > 0 ? '+' : '') + markupPercent + '%)', 'info');
    appendToModalLog('📀 Media Condition: ' + mediaCondition, 'info');
    appendToModalLog('📀 Sleeve Condition: ' + sleeveCondition, 'info');
    if (location) appendToModalLog('📍 Location: ' + location, 'info');
    appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
    
    // RETRY LOGIC: Try up to 5 times for single post
    let success = false;
    let lastError = null;
    const maxRetries = 5;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (attempt > 1) {
            appendToModalLog('🔄 Retry attempt ' + attempt + ' of ' + maxRetries + '...', 'warning');
            const waitTime = 3000 * Math.pow(2, attempt - 1);
            appendToModalLog('   Waiting ' + (waitTime / 1000) + ' seconds before retry...', 'info');
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
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
            appendToModalLog('📤 Sending to Discogs API (attempt ' + attempt + ')...', 'info');
            
            const response = await fetch(window.AppConfig.baseUrl + '/api/discogs/create-listing-single', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(listingData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                success = true;
                let discogsUrl = result.listing_url;
                if (!discogsUrl && result.listing_id) {
                    discogsUrl = 'https://www.discogs.com/sell/item/' + result.listing_id;
                }
                
                appendToModalLog('✅ SUCCESS! Record posted to Discogs!', 'success');
                appendToModalLog('🔗 Discogs URL: ' + discogsUrl, 'success');
                appendToModalLog('🆔 Listing ID: ' + result.listing_id, 'info');
                appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'success');
                
                showDiscogsStatusWithLink('✅ Successfully posted "' + artist + ' - ' + title + '" to Discogs!', discogsUrl, 'success');
                await loadLocationRecords();
                break;
            } else {
                lastError = result.error || 'Unknown error';
                appendToModalLog('❌ Attempt ' + attempt + ' failed: ' + lastError, 'error');
                
                if (!result.error || (!result.error.includes('too quickly') && !result.error.includes('rate') && !result.error.includes('timeout'))) {
                    appendToModalLog('   ⚠️ Non-retryable error, stopping attempts', 'warning');
                    break;
                }
            }
        } catch (error) {
            lastError = error.message;
            appendToModalLog('❌ Attempt ' + attempt + ' failed: ' + error.message, 'error');
            console.error('Fetch error:', error);
        }
    }
    
    if (!success) {
        appendToModalLog('❌ PERMANENT FAILURE after ' + maxRetries + ' attempts: ' + lastError, 'error');
        showDiscogsStatus('Error: ' + lastError, 'error');
    }
    
    setTimeout(function() { closeProgressModal(); }, 2000);
};

// ============================================================================
// Bulk Post All Records in Current Bin - SKIP CONSIGNOR ITEMS
// ============================================================================

async function bulkPostToDiscogs() {
    // Only include store items (no consignor) for posting
    const eligibleRecords = discogsFilteredRecords.filter(function(r) { 
        return r.status_id === 2 && !hasConsignor(r);
    });
    const consignorCount = discogsFilteredRecords.filter(function(r) { 
        return r.status_id === 2 && hasConsignor(r);
    }).length;
    
    if (eligibleRecords.length === 0) {
        if (consignorCount > 0) {
            showDiscogsStatus('All records in this bin are consignor items. Consignor items cannot be auto-posted to Discogs.', 'warning');
        } else {
            showDiscogsStatus('No eligible records to post (only Active store records can be posted)', 'warning');
        }
        return;
    }
    
    const totalTimeMinutes = Math.ceil(eligibleRecords.length * 3 / 60);
    let confirmMessage = '📋 Post ' + eligibleRecords.length + ' store record(s) from bin "' + currentLocation + '" to Discogs?\n\n';
    if (consignorCount > 0) {
        confirmMessage += '⚠️ ' + consignorCount + ' consignor item(s) will be SKIPPED (cannot auto-post)\n\n';
    }
    confirmMessage += '⏱️ Estimated total time: ~' + totalTimeMinutes + ' minute(s)\n\nContinue?';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    openProgressModal('Posting ' + eligibleRecords.length + ' Records from Bin "' + currentLocation + '" to Discogs');
    appendToModalLog('🚀 Starting bulk post for ' + eligibleRecords.length + ' store records from bin "' + currentLocation + '"...', 'info');
    if (consignorCount > 0) {
        appendToModalLog('⚠️ Skipping ' + consignorCount + ' consignor item(s) (cannot auto-post)', 'warning');
    }
    appendToModalLog('⏱️ 3-second delay between requests for reliability', 'warning');
    appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
    
    let posted = 0;
    let failed = 0;
    let skipped = 0;
    const failedRecords = [];
    
    for (let i = 0; i < eligibleRecords.length; i++) {
        if (cancelResolve) {
            appendToModalLog('⏹️ Operation cancelled by user.', 'warning');
            break;
        }
        
        const record = eligibleRecords[i];
        updateModalProgress(i + 1, eligibleRecords.length);
        
        // Quick validation
        if (!record.created_at) {
            skipped++;
            appendToModalLog(`[${i+1}/${eligibleRecords.length}] ⚠️ "${record.artist} - ${record.title}" - Missing creation date, skipping`, 'warning');
            continue;
        }
        
        if (!record.disc_condition_name && !record.sleeve_condition_name) {
            skipped++;
            appendToModalLog(`[${i+1}/${eligibleRecords.length}] ⚠️ "${record.artist} - ${record.title}" - Missing condition, skipping`, 'warning');
            continue;
        }
        
        appendToModalLog(`[${i+1}/${eligibleRecords.length}] 📀 "${record.artist} - ${record.title}"`, 'info');
        
        // Calculate markup (1 API call)
        const markupInfo = await calculateMarkupForRecord(record.created_at, record.store_price);
        
        if (!markupInfo.success) {
            failed++;
            failedRecords.push(`${record.artist} - ${record.title}: ${markupInfo.error}`);
            appendToModalLog(`   ❌ Cannot post: ${markupInfo.error}`, 'error');
            continue;
        }
        
        appendToModalLog(`   💰 Store: $${record.store_price} → Discogs: $${markupInfo.discogs_price} (+${markupInfo.markup_percent}%)`, 'info');
        
        // Post to Discogs
        let success = false;
        let lastError = null;
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (cancelResolve) break;
            
            if (attempt > 1) {
                appendToModalLog(`   🔄 RETRY ${attempt}/${maxRetries}...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
            }
            
            const listingData = {
                record: {
                    id: record.id,
                    artist: record.artist,
                    title: record.title,
                    catalog_number: record.catalog_number || '',
                    media_condition: record.disc_condition_name || record.sleeve_condition_name,
                    sleeve_condition: record.sleeve_condition_name || record.disc_condition_name,
                    price: markupInfo.discogs_price,
                    notes: record.notes || '',
                    location: record.location || ''
                }
            };
            
            try {
                const postResponse = await fetch(window.AppConfig.baseUrl + '/api/discogs/create-listing-single', {
                    method: 'POST',
                    credentials: 'include',
                    headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(listingData)
                });
                
                const result = await postResponse.json();
                
                if (result.success) {
                    success = true;
                    posted++;
                    appendToModalLog(`   ✅ POSTED! Listing ID: ${result.listing_id}`, 'success');
                    break;
                } else {
                    lastError = result.error || 'Unknown error';
                    appendToModalLog(`   ❌ Attempt ${attempt} failed: ${lastError}`, 'error');
                    
                    if (!result.error || (!result.error.includes('too quickly') && !result.error.includes('rate'))) {
                        break;
                    }
                }
            } catch (err) {
                lastError = err.message;
                appendToModalLog(`   ❌ Attempt ${attempt} error: ${err.message}`, 'error');
            }
        }
        
        if (!success) {
            failed++;
            failedRecords.push(`${record.artist} - ${record.title}: ${lastError}`);
            appendToModalLog(`   ❌ PERMANENT FAILURE after ${maxRetries} attempts`, 'error');
        }
        
        // Wait 3 seconds between records
        if (i < eligibleRecords.length - 1 && !cancelResolve) {
            appendToModalLog(`   ⏳ Waiting 3 seconds...`, 'info');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
    appendToModalLog('📊 FINAL RESULTS:', 'info');
    appendToModalLog(`   ✅ Successfully posted: ${posted}`, 'success');
    appendToModalLog(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
    appendToModalLog(`   ⚠️ Skipped (missing data): ${skipped}`, 'warning');
    if (consignorCount > 0) {
        appendToModalLog(`   👤 Consignor items skipped: ${consignorCount}`, 'warning');
    }
    
    if (failedRecords.length > 0 && failedRecords.length <= 20) {
        appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'warning');
        appendToModalLog('❌ FAILED RECORDS:', 'warning');
        for (const failedRecord of failedRecords) {
            appendToModalLog(`   • ${failedRecord}`, 'error');
        }
    } else if (failedRecords.length > 20) {
        appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'warning');
        appendToModalLog(`❌ ${failedRecords.length} records failed. Check console for details.`, 'error');
    }
    
    if (posted > 0) {
        appendToModalLog('🔄 Reloading location data...', 'info');
        await loadLocationRecords();
        appendToModalLog('✅ Data refreshed', 'success');
    }
    
    if (posted > 0 && failed === 0 && skipped === 0) {
        showDiscogsStatus('✅ Successfully posted ALL ' + posted + ' store records from bin "' + currentLocation + '" to Discogs!', 'success');
    } else if (posted > 0) {
        showDiscogsStatus(`⚠️ Posted ${posted} records, ${failed} failed, ${skipped} skipped. Check log.`, 'warning');
    } else {
        showDiscogsStatus('❌ Failed to post any records. Check log.', 'error');
    }
}

// ============================================================================
// REPOST ENTIRE STORE TO DISCOGS - ONLY STORE ITEMS (NO CONSIGNORS)
// ============================================================================

window.repostEntireStoreToDiscogs = async function() {
    console.log('🔄 Reposting entire store to Discogs...');
    
    showDiscogsStatus('Loading all active store records from the entire store...', 'info');
    
    try {
        // Fetch ALL active records (status_id = 2) from ALL locations
        const url = window.AppConfig.baseUrl + '/records/status/2';
        
        const response = await fetch(url, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        
        const data = await response.json();
        
        if (data.status !== 'success') {
            throw new Error(data.error || 'Failed to load records');
        }
        
        const allActiveRecords = data.records || [];
        
        // Filter: Must have location AND be store-owned (no consignor)
        const eligibleRecords = allActiveRecords.filter(record => {
            const hasConsignorFlag = hasConsignor(record);
            return record.location && 
                   record.location.trim() !== '' &&
                   record.location !== 'null' &&
                   record.location !== 'None' &&
                   !hasConsignorFlag;
        });
        
        const skippedNoLocation = allActiveRecords.filter(r => (!r.location || r.location.trim() === '')).length;
        const skippedConsignor = allActiveRecords.filter(r => hasConsignor(r)).length;
        
        if (eligibleRecords.length === 0) {
            let msg = `No eligible store records found. `;
            if (skippedNoLocation > 0) msg += `${skippedNoLocation} record(s) have no location. `;
            if (skippedConsignor > 0) msg += `${skippedConsignor} consignor record(s) cannot be auto-posted.`;
            showDiscogsStatus(msg, 'warning');
            return;
        }
        
        const totalTimeHours = Math.ceil(eligibleRecords.length * 3 / 3600);
        let confirmMsg = `📋 REPOST ENTIRE STORE to Discogs?\n\n`;
        confirmMsg += `Store records with location: ${eligibleRecords.length}\n`;
        confirmMsg += `Skipped (no location): ${skippedNoLocation}\n`;
        confirmMsg += `Skipped (consignor items): ${skippedConsignor}\n`;
        confirmMsg += `⚠️ Each record takes ~3 seconds\n`;
        confirmMsg += `⏱️ Estimated time: ~${totalTimeHours} hour(s)\n\n`;
        confirmMsg += `Continue?`;
        
        if (!confirm(confirmMsg)) {
            return;
        }
        
        openProgressModal('Reposting ' + eligibleRecords.length + ' Store Records from Entire Store');
        appendToModalLog('🚀 Starting REPOST ENTIRE STORE for ' + eligibleRecords.length + ' store records...', 'info');
        appendToModalLog(`⚠️ Skipped ${skippedNoLocation} record(s) with missing location`, 'warning');
        appendToModalLog(`⚠️ Skipped ${skippedConsignor} consignor item(s) (cannot auto-post)`, 'warning');
        appendToModalLog('⏱️ Validating and posting in one pass (3 seconds per record)', 'info');
        appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
        
        let posted = 0;
        let failed = 0;
        let skipped = 0;
        const failedRecords = [];
        
        for (let i = 0; i < eligibleRecords.length; i++) {
            if (cancelResolve) {
                appendToModalLog('⏹️ Operation cancelled by user.', 'warning');
                break;
            }
            
            const record = eligibleRecords[i];
            updateModalProgress(i + 1, eligibleRecords.length);
            
            // Quick validation - skip if missing required data
            if (!record.created_at) {
                skipped++;
                appendToModalLog(`[${i+1}/${eligibleRecords.length}] ⚠️ "${record.artist} - ${record.title}" - Missing creation date, skipping`, 'warning');
                continue;
            }
            
            if (!record.disc_condition_name && !record.sleeve_condition_name) {
                skipped++;
                appendToModalLog(`[${i+1}/${eligibleRecords.length}] ⚠️ "${record.artist} - ${record.title}" - Missing condition, skipping`, 'warning');
                continue;
            }
            
            appendToModalLog(`[${i+1}/${eligibleRecords.length}] 📀 "${record.artist} - ${record.title}"`, 'info');
            
            // Calculate markup (1 API call)
            const markupInfo = await calculateMarkupForRecord(record.created_at, record.store_price);
            
            if (!markupInfo.success) {
                failed++;
                failedRecords.push(`${record.artist} - ${record.title}: ${markupInfo.error}`);
                appendToModalLog(`   ❌ Cannot post: ${markupInfo.error}`, 'error');
                continue;
            }
            
            appendToModalLog(`   💰 Store: $${record.store_price} → Discogs: $${markupInfo.discogs_price} (+${markupInfo.markup_percent}%)`, 'info');
            
            // Post to Discogs (2nd API call)
            let success = false;
            let lastError = null;
            const maxRetries = 3;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                if (cancelResolve) break;
                
                if (attempt > 1) {
                    appendToModalLog(`   🔄 RETRY ${attempt}/${maxRetries}...`, 'warning');
                    await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
                }
                
                const listingData = {
                    record: {
                        id: record.id,
                        artist: record.artist,
                        title: record.title,
                        catalog_number: record.catalog_number || '',
                        media_condition: record.disc_condition_name || record.sleeve_condition_name,
                        sleeve_condition: record.sleeve_condition_name || record.disc_condition_name,
                        price: markupInfo.discogs_price,
                        notes: record.notes || '',
                        location: record.location || ''
                    }
                };
                
                try {
                    const postResponse = await fetch(window.AppConfig.baseUrl + '/api/discogs/create-listing-single', {
                        method: 'POST',
                        credentials: 'include',
                        headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(listingData)
                    });
                    
                    const result = await postResponse.json();
                    
                    if (result.success) {
                        success = true;
                        posted++;
                        appendToModalLog(`   ✅ POSTED! Listing ID: ${result.listing_id}`, 'success');
                        break;
                    } else {
                        lastError = result.error || 'Unknown error';
                        appendToModalLog(`   ❌ Attempt ${attempt} failed: ${lastError}`, 'error');
                        
                        if (!result.error || (!result.error.includes('too quickly') && !result.error.includes('rate'))) {
                            break;
                        }
                    }
                } catch (err) {
                    lastError = err.message;
                    appendToModalLog(`   ❌ Attempt ${attempt} error: ${err.message}`, 'error');
                }
            }
            
            if (!success) {
                failed++;
                failedRecords.push(`${record.artist} - ${record.title}: ${lastError}`);
                appendToModalLog(`   ❌ PERMANENT FAILURE after ${maxRetries} attempts`, 'error');
            }
            
            // Wait 3 seconds between records
            if (i < eligibleRecords.length - 1 && !cancelResolve) {
                appendToModalLog(`   ⏳ Waiting 3 seconds...`, 'info');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
        appendToModalLog('📊 FINAL RESULTS - ENTIRE STORE REPOST:', 'info');
        appendToModalLog(`   ✅ Successfully posted: ${posted}`, 'success');
        appendToModalLog(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
        appendToModalLog(`   ⚠️ Skipped (missing data): ${skipped}`, 'warning');
        appendToModalLog(`   📊 Total processed: ${posted + failed + skipped} of ${eligibleRecords.length}`, 'info');
        
        if (failedRecords.length > 0 && failedRecords.length <= 20) {
            appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'warning');
            appendToModalLog('❌ FAILED RECORDS:', 'warning');
            for (const failedRecord of failedRecords) {
                appendToModalLog(`   • ${failedRecord}`, 'error');
            }
        } else if (failedRecords.length > 20) {
            appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'warning');
            appendToModalLog(`❌ ${failedRecords.length} records failed. Check console for details.`, 'error');
        }
        
        if (posted > 0) {
            showDiscogsStatus(`✅ Reposted ${posted} store records. ${failed} failed, ${skipped} skipped.`, posted === eligibleRecords.length ? 'success' : 'warning');
        } else {
            showDiscogsStatus(`❌ Failed to repost any records. Check log for details.`, 'error');
        }
        
    } catch (error) {
        console.error('Error in repostEntireStoreToDiscogs:', error);
        showDiscogsStatus('Error: ' + error.message, 'error');
        if (progressModal && progressModal.style.display === 'flex') {
            appendToModalLog('❌ FATAL ERROR: ' + error.message, 'error');
        }
    }
};

// ============================================================================
// Show status messages
// ============================================================================

function showDiscogsStatusWithLink(message, url, type) {
    if (!discogsStatusMessage) return;
    type = type || 'success';
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const linkHtml = url ? '<br><a href="' + url + '" target="_blank" style="color: #007bff; text-decoration: underline;"><i class="fab fa-discogs"></i> View on Discogs</a>' : '';
    discogsStatusMessage.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message) + linkHtml;
    discogsStatusMessage.className = 'status-message status-' + type;
    discogsStatusMessage.style.display = 'block';
    setTimeout(function() { if (discogsStatusMessage) discogsStatusMessage.style.display = 'none'; }, 15000);
}

function showDiscogsStatus(message, type) {
    if (!discogsStatusMessage) return;
    type = type || 'info';
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    discogsStatusMessage.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
    discogsStatusMessage.className = 'status-message status-' + type;
    discogsStatusMessage.style.display = 'block';
    setTimeout(function() { if (discogsStatusMessage) discogsStatusMessage.style.display = 'none'; }, 8000);
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
// Config Management
// ============================================================================

async function loadDiscogsConfig() {
    try {
        const markupInput = document.getElementById('discogs-markup');
        if (!markupInput) return;
        
        const response = await fetch(window.AppConfig.baseUrl + '/config/DISCOGS_MARKUP_PERCENT', {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
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
        const response = await fetch(window.AppConfig.baseUrl + '/config/DISCOGS_MARKUP_PERCENT', {
            method: 'PUT',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ config_value: markupInput.value })
        });
        
        if (response.ok) {
            configStatus.innerHTML = '✅ Saved!';
            configStatus.style.color = '#28a745';
            setTimeout(function() { configStatus.innerHTML = ''; }, 3000);
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        configStatus.innerHTML = '❌ Save failed';
        configStatus.style.color = '#dc3545';
        setTimeout(function() { configStatus.innerHTML = ''; }, 3000);
    }
};

// ============================================================================
// Markup Rules Management
// ============================================================================

async function loadMarkupRules() {
    try {
        const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules', {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                renderMarkupRules(data.rules);
            }
        }
    } catch (error) {
        console.error('Error loading markup rules:', error);
    }
}

function renderMarkupRules(rules) {
    const tbody = document.getElementById('markup-rules-body');
    const warning = document.getElementById('no-rules-warning');
    
    if (!tbody) return;
    
    if (!rules || rules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding: 30px; text-align: center; color: #999;">⚠️ No rules configured. Add your first rule above.</td></tr>';
        if (warning) warning.style.display = 'block';
        return;
    }
    
    if (warning) warning.style.display = 'none';
    
    rules.sort(function(a, b) { return a.days_old - b.days_old; });
    
    let html = '';
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        html += '<tr style="border-bottom: 1px solid #dee2e6;">';
        html += '<td style="padding: 12px;">' + rule.days_old + '+ days</td>';
        html += '<td style="padding: 12px;"><input type="number" id="rule-percent-' + rule.id + '" value="' + rule.markup_percent + '" step="1" style="width: 80px; padding: 6px; border: 1px solid #ddd; border-radius: 4px;"><span>%</span></td>';
        html += '<td style="padding: 12px;"><input type="text" id="rule-desc-' + rule.id + '" value="' + escapeHtml(rule.description || '') + '" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;"></td>';
        html += '<td style="padding: 12px;">';
        html += '<button class="btn btn-sm btn-info" onclick="updateMarkupRule(' + rule.id + ')" style="padding: 4px 8px; margin-right: 5px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-save"></i></button> ';
        html += '<button class="btn btn-sm btn-danger" onclick="deleteMarkupRule(' + rule.id + ')" style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i></button>';
        html += '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

window.addMarkupRule = async function() {
    const days_old = parseInt(document.getElementById('new-rule-days').value);
    const markup_percent = parseFloat(document.getElementById('new-rule-percent').value);
    const description = document.getElementById('new-rule-desc').value;
    
    if (isNaN(days_old) || isNaN(markup_percent)) {
        showDiscogsStatus('Please enter valid days and percentage', 'error');
        return;
    }
    
    try {
        const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules', {
            method: 'POST',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ days_old: days_old, markup_percent: markup_percent, description: description })
        });
        
        if (response.ok) {
            showDiscogsStatus('Markup rule added successfully', 'success');
            document.getElementById('new-rule-days').value = '';
            document.getElementById('new-rule-percent').value = '';
            document.getElementById('new-rule-desc').value = '';
            loadMarkupRules();
            if (currentLocation) {
                await loadLocationRecords();
            }
        } else {
            const error = await response.json();
            showDiscogsStatus('Error: ' + error.error, 'error');
        }
    } catch (error) {
        showDiscogsStatus('Error: ' + error.message, 'error');
    }
};

window.updateMarkupRule = async function(ruleId) {
    const markup_percent = parseFloat(document.getElementById('rule-percent-' + ruleId).value);
    const description = document.getElementById('rule-desc-' + ruleId).value;
    
    if (isNaN(markup_percent)) {
        showDiscogsStatus('Please enter a valid percentage', 'error');
        return;
    }
    
    try {
        const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules/' + ruleId, {
            method: 'PUT',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ markup_percent: markup_percent, description: description })
        });
        
        if (response.ok) {
            showDiscogsStatus('Markup rule updated successfully', 'success');
            loadMarkupRules();
            if (currentLocation) {
                await loadLocationRecords();
            }
        } else {
            const error = await response.json();
            showDiscogsStatus('Error: ' + error.error, 'error');
        }
    } catch (error) {
        showDiscogsStatus('Error: ' + error.message, 'error');
    }
};

window.deleteMarkupRule = async function(ruleId) {
    if (!confirm('Are you sure you want to delete this markup rule?')) return;
    
    try {
        const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules/' + ruleId, {
            method: 'DELETE',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        
        if (response.ok) {
            showDiscogsStatus('Markup rule deleted successfully', 'success');
            loadMarkupRules();
            if (currentLocation) {
                await loadLocationRecords();
            }
        } else {
            const error = await response.json();
            showDiscogsStatus('Error: ' + error.error, 'error');
        }
    } catch (error) {
        showDiscogsStatus('Error: ' + error.message, 'error');
    }
};

window.closeProgressModal = closeProgressModal;
window.refreshDiscogsLocations = loadLocations;

// ============================================================================
// Initialization
// ============================================================================

window.initDiscogsTab = function() {
    console.log('🎵 Initializing Discogs Tab...');
    
    tableBody = document.getElementById('combined-inventory-body');
    discogsLocationSelect = document.getElementById('discogs-location-select');
    discogsPostButton = document.getElementById('post-location-button');
    discogsStatusMessage = document.getElementById('discogs-status-message');
    discogsSearchInput = document.getElementById('discogs-search-input');
    discogsSearchButton = document.getElementById('discogs-search-button');
    
    if (!tableBody) {
        console.error('Table body element not found!');
        return;
    }
    
    if (!discogsLocationSelect) {
        console.error('Location select element not found!');
        return;
    }
    
    discogsLocationSelect.onchange = function() {
        console.log('Location changed to:', discogsLocationSelect.value);
        loadLocationRecords();
    };
    
    if (discogsSearchButton) {
        discogsSearchButton.onclick = function() {
            applyDiscogsSearchFilter();
        };
    }
    if (discogsSearchInput) {
        discogsSearchInput.onkeyup = function(e) {
            if (e.key === 'Enter') {
                applyDiscogsSearchFilter();
            }
        };
    }
    
    if (discogsPostButton) {
        discogsPostButton.onclick = function() {
            bulkPostToDiscogs();
        };
        discogsPostButton.disabled = true;
        discogsPostButton.style.opacity = '0.5';
        discogsPostButton.innerHTML = '<i class="fab fa-discogs"></i> Post to Discogs';
    }
    
    loadLocations();
    loadMarkupRules();
    
    tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;">Select a bin/location to view records</td></tr>';
    
    console.log('✅ Discogs Tab initialized');
};

// ============================================================================
// Tab Activation Handler
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'discogs') {
        console.log('🎵 Discogs tab activated, initializing...');
        setTimeout(window.initDiscogsTab, 100);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const discogsTab = document.querySelector('.tab[data-tab="discogs"]');
    if (discogsTab && discogsTab.classList.contains('active')) {
        setTimeout(window.initDiscogsTab, 200);
    }
});

console.log('✅ discogs.js loaded - Bin-based bulk posting (consignor items are SKIPPED)');