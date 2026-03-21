// ============================================================================
// price-tags.js - Price Tags Tab Functionality with Starting Position
// ============================================================================

// Use window object to avoid redeclaration errors
window.priceTagsModule = window.priceTagsModule || {};

// Cache for consignor information
if (typeof window.consignorCache === 'undefined') {
    window.consignorCache = {};
}

// State variables
if (typeof window.allRecords === 'undefined') {
    window.allRecords = [];
}

if (typeof window.filteredRecords === 'undefined') {
    window.filteredRecords = [];
}

if (typeof window.currentPage === 'undefined') {
    window.currentPage = 1;
}

if (typeof window.pageSize === 'undefined') {
    window.pageSize = 100;
}

if (typeof window.totalPages === 'undefined') {
    window.totalPages = 1;
}

if (typeof window.recentlyPrintedIds === 'undefined') {
    window.recentlyPrintedIds = new Set();
}

// Print Queue - array to maintain order
window.printQueue = window.printQueue || [];

// Starting position for printing
if (typeof window.printStartRow === 'undefined') {
    window.printStartRow = 1;
}

if (typeof window.printStartCol === 'undefined') {
    window.printStartCol = 1;
}

// Range selection state
window.rangeMode = false;
window.rangeFromIndex = null;
window.rangeFromId = null;

// Locator state variables
if (typeof window.locatorMatches === 'undefined') {
    window.locatorMatches = [];
}

if (typeof window.currentMatchIndex === 'undefined') {
    window.currentMatchIndex = -1;
}

// Helper functions
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getStatusIdFromFilter(filter) {
    switch(filter) {
        case 'new': return 1;
        case 'active': return 2;
        case 'sold': return 3;
        case 'removed': return 4;
        default: return null;
    }
}

// Show loading indicator
function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = show ? 'flex' : 'none';
    }
}

// Show status message
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status-message');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-message status-${type}`;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}

// Update starting position display
function updatePrintStartPosition() {
    const rowInput = document.getElementById('print-start-row');
    const colInput = document.getElementById('print-start-col');
    
    if (rowInput) {
        let newRow = parseInt(rowInput.value);
        if (isNaN(newRow)) newRow = 1;
        newRow = Math.max(1, Math.min(15, newRow));
        window.printStartRow = newRow;
        rowInput.value = newRow;
    }
    
    if (colInput) {
        let newCol = parseInt(colInput.value);
        if (isNaN(newCol)) newCol = 1;
        newCol = Math.max(1, Math.min(4, newCol));
        window.printStartCol = newCol;
        colInput.value = newCol;
    }
    
    const displayEl = document.getElementById('print-start-display');
    if (displayEl) {
        displayEl.textContent = `${window.printStartRow}, ${window.printStartCol}`;
    }
    
    showStatus(`Price tags will start at position (${window.printStartRow}, ${window.printStartCol})`, 'info');
}

// Load consignors for filter
async function loadConsignorsForPriceTags() {
    try {
        const url = `${AppConfig.baseUrl}/users`;
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            const users = data.users || [];
            const userSelect = document.getElementById('user-select');
            
            if (!userSelect) {
                console.error('User select element not found');
                return;
            }
            
            // Clear existing options
            userSelect.innerHTML = '';
            
            // Add "All Users" option
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'All Users';
            userSelect.appendChild(allOption);
            
            // Add user options
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.username} (ID: ${user.id})`;
                userSelect.appendChild(option);
                
                // Cache user info
                window.consignorCache[user.id] = {
                    username: user.username || `User ${user.id}`,
                    initials: user.initials || (user.username ? user.username.substring(0, 2).toUpperCase() : '')
                };
            });
            
            console.log(`Loaded ${users.length} users for filter`);
            
            // Add event listener for user select change
            const oldUserSelect = userSelect;
            const newUserSelect = oldUserSelect.cloneNode(true);
            oldUserSelect.parentNode.replaceChild(newUserSelect, oldUserSelect);
            
            newUserSelect.addEventListener('change', function() {
                console.log('User selected changed to:', this.value);
                // Clear queue when changing users
                clearQueue();
                cancelRangeSelection();
                // Load records for the selected user
                loadRecordsForPriceTags();
            });
            
        } else {
            console.error('Failed to load users:', data.message);
            showStatus('Failed to load users: ' + (data.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showStatus('Failed to load users: ' + error.message, 'error');
    }
}

// Load records
async function loadRecordsForPriceTags() {
    showLoading(true);
    
    try {
        const userSelect = document.getElementById('user-select');
        if (!userSelect) {
            console.error('User select element not found');
            showLoading(false);
            return;
        }
        
        const selectedUserId = userSelect.value === 'all' ? null : userSelect.value;
        console.log('Loading records for user:', selectedUserId);
        
        let url;
        if (selectedUserId) {
            url = `${AppConfig.baseUrl}/records/user/${selectedUserId}`;
        } else {
            url = `${AppConfig.baseUrl}/records`;
        }
        
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            window.allRecords = data.records || [];
            
            // Sort by created date descending (newest first)
            window.allRecords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            // Update stats
            const totalRecordsEl = document.getElementById('total-records-print');
            if (totalRecordsEl) totalRecordsEl.textContent = window.allRecords.length;
            
            const newCount = window.allRecords.filter(r => r.status_id === 1).length;
            const activeCount = window.allRecords.filter(r => r.status_id === 2).length;
            const soldCount = window.allRecords.filter(r => r.status_id === 3).length;
            const removedCount = window.allRecords.filter(r => r.status_id === 4).length;
            
            const newEl = document.getElementById('inactive-records');
            const activeEl = document.getElementById('active-records');
            const soldEl = document.getElementById('sold-records');
            
            if (newEl) newEl.textContent = newCount;
            if (activeEl) activeEl.textContent = activeCount;
            if (soldEl) soldEl.textContent = soldCount;
            
            // Fetch any missing consignor info
            const consignorIds = new Set();
            window.allRecords.forEach(r => { if (r.consignor_id) consignorIds.add(r.consignor_id); });
            
            const fetchPromises = Array.from(consignorIds).map(id => getConsignorInfo(id));
            await Promise.all(fetchPromises);
            
            filterRecords();
            
            showStatus(`Loaded ${window.allRecords.length} records (${newCount} new, ${activeCount} active, ${soldCount} sold, ${removedCount} removed)`, 'success');
        } else {
            showStatus('Failed to load records: ' + (data.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error loading records:', error);
        showStatus('Failed to load records: ' + error.message, 'error');
    }
    
    showLoading(false);
}

// Get consignor info
async function getConsignorInfo(consignorId) {
    if (!consignorId) return { username: 'None', initials: '' };
    
    if (window.consignorCache[consignorId]) {
        return window.consignorCache[consignorId];
    }
    
    try {
        const url = `${AppConfig.baseUrl}/users/${consignorId}`;
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                const user = data.user || {};
                const consignorInfo = {
                    username: user.username || `User ${consignorId}`,
                    initials: user.initials || (user.username ? user.username.substring(0, 2).toUpperCase() : '')
                };
                window.consignorCache[consignorId] = consignorInfo;
                return consignorInfo;
            }
        }
    } catch (error) {
        console.log('Error fetching consignor:', error);
    }
    
    return { username: `User ${consignorId}`, initials: '' };
}

// Filter records
function filterRecords() {
    const statusFilter = document.getElementById('status-filter').value;
    const statusId = getStatusIdFromFilter(statusFilter);
    
    if (statusId) {
        window.filteredRecords = window.allRecords.filter(r => r.status_id === statusId);
    } else {
        window.filteredRecords = [...window.allRecords];
    }
    
    // Keep the sort order (newest first)
    window.filteredRecords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    window.currentPage = 1;
    updatePagination();
    renderCurrentPage();
    
    // Clear locator when filtering
    clearLocatorHighlight();
    cancelRangeSelection();
    
    const statusText = statusFilter === 'all' ? 'All records' : 
                      statusFilter === 'new' ? 'New records' :
                      statusFilter === 'active' ? 'Active records' : 
                      statusFilter === 'sold' ? 'Sold records' : 'Removed records';
    
    showStatus(`Showing ${window.filteredRecords.length} ${statusText}`, 'info');
}

// Update pagination
function updatePagination() {
    window.totalPages = Math.ceil(window.filteredRecords.length / window.pageSize);
    if (window.totalPages === 0) window.totalPages = 1;
    
    const totalPagesEl = document.getElementById('total-pages');
    if (totalPagesEl) totalPagesEl.textContent = window.totalPages;
    
    const currentPageEl = document.getElementById('current-page');
    if (currentPageEl) currentPageEl.value = window.currentPage;
    
    const totalFilteredEl = document.getElementById('total-filtered');
    if (totalFilteredEl) totalFilteredEl.textContent = window.filteredRecords.length;
    
    // Update button states
    const firstBtn = document.getElementById('first-page-btn');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const lastBtn = document.getElementById('last-page-btn');
    
    if (firstBtn) firstBtn.disabled = window.currentPage === 1;
    if (prevBtn) prevBtn.disabled = window.currentPage === 1;
    if (nextBtn) nextBtn.disabled = window.currentPage === window.totalPages;
    if (lastBtn) lastBtn.disabled = window.currentPage === window.totalPages;
    
    const startIndex = (window.currentPage - 1) * window.pageSize + 1;
    const endIndex = Math.min(window.currentPage * window.pageSize, window.filteredRecords.length);
    
    const showingStartEl = document.getElementById('showing-start');
    const showingEndEl = document.getElementById('showing-end');
    
    if (showingStartEl) showingStartEl.textContent = window.filteredRecords.length > 0 ? startIndex : 0;
    if (showingEndEl) showingEndEl.textContent = window.filteredRecords.length > 0 ? endIndex : 0;
}

// Update queue display
function updateQueueDisplay() {
    const queueContent = document.getElementById('queue-content');
    const queueEmpty = document.getElementById('queue-empty');
    const queueCount = document.getElementById('queue-count');
    const printQueueBtn = document.getElementById('print-queue-btn');
    const markActiveQueueBtn = document.getElementById('mark-active-queue-btn');
    const clearQueueBtn = document.getElementById('clear-queue-btn');
    const printQueueCount = document.getElementById('print-queue-count');
    
    if (!queueContent) return;
    
    // Update queue count
    if (queueCount) queueCount.textContent = window.printQueue.length;
    if (printQueueCount) printQueueCount.textContent = window.printQueue.length;
    
    // Update button states
    const hasItems = window.printQueue.length > 0;
    if (printQueueBtn) printQueueBtn.disabled = !hasItems;
    if (markActiveQueueBtn) markActiveQueueBtn.disabled = !hasItems;
    if (clearQueueBtn) clearQueueBtn.disabled = !hasItems;
    
    // Clear queue content
    queueContent.innerHTML = '';
    
    if (window.printQueue.length === 0) {
        if (queueEmpty) {
            queueEmpty.style.display = 'block';
        } else {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'queue-empty';
            emptyDiv.innerHTML = `
                <i class="fas fa-inbox" style="font-size: 24px; margin-bottom: 10px; opacity: 0.5;"></i>
                <p>No records in print queue</p>
                <p style="font-size: 12px;">Click 'from' on a record to start a range selection</p>
            `;
            queueContent.appendChild(emptyDiv);
        }
        return;
    }
    
    if (queueEmpty) queueEmpty.style.display = 'none';
    
    // Render each item in the queue
    window.printQueue.forEach((recordId, index) => {
        const record = window.allRecords.find(r => r.id.toString() === recordId);
        if (!record) return;
        
        const consignorInfo = window.consignorCache[record.consignor_id] || { username: 'None', initials: '' };
        
        const queueItem = document.createElement('div');
        queueItem.className = 'queue-item';
        queueItem.innerHTML = `
            <div class="queue-item-number">${index + 1}</div>
            <div class="queue-item-info">
                <div class="queue-item-title">${escapeHtml(record.artist || 'Unknown')} - ${escapeHtml(record.title || 'Unknown')}</div>
                <div class="queue-item-details">
                    <span>$${(record.store_price || 0).toFixed(2)}</span>
                    <span>${escapeHtml(record.genre_name || record.genre || 'Unknown')}</span>
                    <span>${consignorInfo.initials ? `(${escapeHtml(consignorInfo.initials)})` : ''}</span>
                </div>
            </div>
            <div style="display: flex; gap: 5px;">
                <button class="queue-item-move" onclick="moveQueueItem(${index}, 'up')" ${index === 0 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-up"></i>
                </button>
                <button class="queue-item-move" onclick="moveQueueItem(${index}, 'down')" ${index === window.printQueue.length - 1 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-down"></i>
                </button>
                <button class="queue-item-remove" onclick="removeFromQueue('${recordId}')">
                    <i class="fas fa-times"></i> Remove
                </button>
            </div>
        `;
        queueContent.appendChild(queueItem);
    });
    
    // Re-render current page to update row highlighting
    renderCurrentPage();
}

// Move queue item up or down
function moveQueueItem(index, direction) {
    if (direction === 'up' && index > 0) {
        [window.printQueue[index - 1], window.printQueue[index]] = [window.printQueue[index], window.printQueue[index - 1]];
    } else if (direction === 'down' && index < window.printQueue.length - 1) {
        [window.printQueue[index], window.printQueue[index + 1]] = [window.printQueue[index + 1], window.printQueue[index]];
    } else {
        return;
    }
    
    updateQueueDisplay();
    showStatus('Queue order updated', 'success');
}

// Add to queue
function addToQueue(recordId) {
    const recordIdStr = recordId.toString();
    
    // Don't add sold records
    const record = window.allRecords.find(r => r.id.toString() === recordIdStr);
    if (record && record.status_id === 3) {
        showStatus('Sold records cannot be added to queue', 'warning');
        return;
    }
    
    // Check if already in queue
    if (window.printQueue.includes(recordIdStr)) {
        showStatus('Record already in queue', 'info');
        return;
    }
    
    window.printQueue.push(recordIdStr);
    updateQueueDisplay();
    showStatus('Record added to queue', 'success');
}

// Remove from queue
function removeFromQueue(recordId) {
    const recordIdStr = recordId.toString();
    const index = window.printQueue.indexOf(recordIdStr);
    
    if (index !== -1) {
        window.printQueue.splice(index, 1);
        updateQueueDisplay();
        showStatus('Record removed from queue', 'info');
    }
}

// Clear queue
function clearQueue() {
    if (window.printQueue.length === 0) return;
    
    if (confirm('Are you sure you want to clear the entire queue?')) {
        window.printQueue = [];
        cancelRangeSelection();
        updateQueueDisplay();
        showStatus('Queue cleared', 'info');
    }
}

// Add all records on current page to queue
function addAllOnPageToQueue() {
    const startIndex = (window.currentPage - 1) * window.pageSize;
    const endIndex = Math.min(startIndex + window.pageSize, window.filteredRecords.length);
    const pageRecords = window.filteredRecords.slice(startIndex, endIndex);
    
    // Filter out sold records and records already in queue
    const recordsToAdd = pageRecords.filter(r => 
        r.status_id !== 3 && !window.printQueue.includes(r.id.toString())
    );
    
    if (recordsToAdd.length === 0) {
        showStatus('No eligible records on this page to add', 'info');
        return;
    }
    
    recordsToAdd.forEach(record => {
        window.printQueue.push(record.id.toString());
    });
    
    updateQueueDisplay();
    showStatus(`Added ${recordsToAdd.length} records from current page to queue`, 'success');
}

// Range selection functions
function startRangeFrom(recordId, button) {
    const recordIdStr = recordId.toString();
    
    // Check if we're clicking the same from button
    if (window.rangeMode && window.rangeFromId === recordIdStr) {
        cancelRangeSelection();
        return;
    }
    
    // Find the record's index in the filtered list
    const recordIndex = window.filteredRecords.findIndex(r => r.id.toString() === recordIdStr);
    if (recordIndex === -1) return;
    
    window.rangeMode = true;
    window.rangeFromIndex = recordIndex;
    window.rangeFromId = recordIdStr;
    
    // Update UI
    document.querySelectorAll('.from-btn').forEach(btn => {
        btn.classList.remove('selected-from');
        btn.textContent = 'from';
    });
    
    button.classList.add('selected-from');
    button.textContent = 'from';
    
    document.querySelectorAll('.to-btn').forEach(btn => {
        btn.textContent = 'to';
        btn.classList.remove('selected-to');
    });
    
    // Show cancel range button
    const cancelBtn = document.getElementById('cancel-range-btn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    
    showStatus(`Select 'to' to complete range selection`, 'info');
}

function completeRangeTo(recordId, button) {
    if (!window.rangeMode) return;
    
    const recordIdStr = recordId.toString();
    
    // Find the record's index in the filtered list
    const recordIndex = window.filteredRecords.findIndex(r => r.id.toString() === recordIdStr);
    if (recordIndex === -1) return;
    
    // Determine range direction
    const start = Math.min(window.rangeFromIndex, recordIndex);
    const end = Math.max(window.rangeFromIndex, recordIndex);
    
    // Get records in range
    const recordsInRange = window.filteredRecords.slice(start, end + 1);
    
    // Filter out sold records and records already in queue
    const recordsToAdd = recordsInRange.filter(r => 
        r.status_id !== 3 && !window.printQueue.includes(r.id.toString())
    );
    
    if (recordsToAdd.length === 0) {
        showStatus('No eligible records in selected range', 'info');
        cancelRangeSelection();
        return;
    }
    
    // Add to queue in the order they appear in the table
    recordsToAdd.forEach(record => {
        window.printQueue.push(record.id.toString());
    });
    
    updateQueueDisplay();
    showStatus(`Added ${recordsToAdd.length} records from range to queue`, 'success');
    
    // Clear range mode
    cancelRangeSelection();
}

function cancelRangeSelection() {
    window.rangeMode = false;
    window.rangeFromIndex = null;
    window.rangeFromId = null;
    
    // Reset all buttons
    document.querySelectorAll('.from-btn').forEach(btn => {
        btn.classList.remove('selected-from');
        btn.textContent = 'from';
    });
    
    document.querySelectorAll('.to-btn').forEach(btn => {
        btn.textContent = 'to';
        btn.classList.remove('selected-to');
    });
    
    // Hide cancel range button
    const cancelBtn = document.getElementById('cancel-range-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
}

// Clear all locator highlights
function clearLocatorHighlight() {
    document.querySelectorAll('.record-locator-match, .record-locator-current').forEach(el => {
        el.classList.remove('record-locator-match', 'record-locator-current');
    });
    
    window.locatorMatches = [];
    window.currentMatchIndex = -1;
    
    const matchCountEl = document.getElementById('match-count');
    if (matchCountEl) matchCountEl.textContent = '0';
    
    const searchInput = document.getElementById('record-locator-search');
    if (searchInput) searchInput.value = '';
}

// Locate record function
function locateRecord() {
    const searchTerm = document.getElementById('record-locator-search').value.trim().toLowerCase();
    
    document.querySelectorAll('.record-locator-match, .record-locator-current').forEach(el => {
        el.classList.remove('record-locator-match', 'record-locator-current');
    });
    
    if (!searchTerm) {
        window.locatorMatches = [];
        window.currentMatchIndex = -1;
        document.getElementById('match-count').textContent = '0';
        return;
    }
    
    const allRows = document.querySelectorAll('#records-body tr');
    const matches = [];
    
    allRows.forEach((row, index) => {
        const rowText = row.textContent.toLowerCase();
        if (rowText.includes(searchTerm)) {
            matches.push({
                element: row,
                index: index
            });
            row.classList.add('record-locator-match');
        }
    });
    
    window.locatorMatches = matches;
    
    const matchCountEl = document.getElementById('match-count');
    if (matchCountEl) {
        matchCountEl.textContent = matches.length;
    }
    
    if (matches.length > 0) {
        if (window.currentMatchIndex >= 0 && window.currentMatchIndex < matches.length) {
            highlightMatchIndex(window.currentMatchIndex);
        } else {
            window.currentMatchIndex = 0;
            highlightMatchIndex(0);
        }
    } else {
        window.currentMatchIndex = -1;
    }
}

// Highlight a specific match by index
function highlightMatchIndex(index) {
    if (!window.locatorMatches || window.locatorMatches.length === 0) return;
    if (index < 0 || index >= window.locatorMatches.length) return;
    
    document.querySelectorAll('.record-locator-current').forEach(el => {
        el.classList.remove('record-locator-current');
    });
    
    const match = window.locatorMatches[index];
    match.element.classList.add('record-locator-current');
    
    match.element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
    
    window.currentMatchIndex = index;
    
    const matchCountEl = document.getElementById('match-count');
    if (matchCountEl) {
        matchCountEl.textContent = `${index + 1}/${window.locatorMatches.length}`;
    }
}

// Find next match
function findNextMatch() {
    if (!window.locatorMatches || window.locatorMatches.length === 0) {
        locateRecord();
        return;
    }
    
    let nextIndex = window.currentMatchIndex + 1;
    if (nextIndex >= window.locatorMatches.length) {
        nextIndex = 0;
    }
    
    highlightMatchIndex(nextIndex);
}

// Find previous match
function findPreviousMatch() {
    if (!window.locatorMatches || window.locatorMatches.length === 0) return;
    
    let prevIndex = window.currentMatchIndex - 1;
    if (prevIndex < 0) {
        prevIndex = window.locatorMatches.length - 1;
    }
    
    highlightMatchIndex(prevIndex);
}

// Render current page
function renderCurrentPage() {
    const tbody = document.getElementById('records-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (window.filteredRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 20px; color: #666;">No records found</td></tr>`;
        updatePagination();
        return;
    }
    
    const startIndex = (window.currentPage - 1) * window.pageSize;
    const endIndex = Math.min(startIndex + window.pageSize, window.filteredRecords.length);
    const pageRecords = window.filteredRecords.slice(startIndex, endIndex);
    
    pageRecords.forEach((record, index) => {
        const globalIndex = startIndex + index;
        const consignorInfo = window.consignorCache[record.consignor_id] || { username: 'None', initials: '' };
        
        const isRecentlyPrinted = window.recentlyPrintedIds.has(record.id.toString());
        const isInQueue = window.printQueue.includes(record.id.toString());
        const isSold = record.status_id === 3;
        
        const tr = document.createElement('tr');
        tr.setAttribute('data-record-id', record.id);
        
        if (isInQueue) {
            tr.classList.add('record-in-queue');
        } else if (isRecentlyPrinted) {
            tr.style.backgroundColor = '#f0fff0';
            tr.style.borderLeft = '3px solid #27ae60';
        }
        
        const queuePosition = isInQueue ? window.printQueue.indexOf(record.id.toString()) + 1 : null;
        
        // Determine button state
        let buttonHtml = '';
        if (isInQueue) {
            buttonHtml = `<span class="record-queue-position" title="Position in queue">#${queuePosition}</span>`;
        } else if (isSold) {
            buttonHtml = `<span style="color: #999; font-size: 11px;">sold</span>`;
        } else {
            const fromBtnClass = window.rangeMode && window.rangeFromId === record.id.toString() ? 'selected-from' : '';
            buttonHtml = `
                <div style="display: flex; gap: 3px;">
                    <button class="btn btn-small from-btn ${fromBtnClass}" 
                            onclick="event.stopPropagation(); startRangeFrom('${record.id}', this)" 
                            style="padding: 3px 6px; font-size: 11px;">
                        ${window.rangeMode && window.rangeFromId === record.id.toString() ? 'from' : 'from'}
                    </button>
                    <button class="btn btn-small to-btn" 
                            onclick="event.stopPropagation(); completeRangeTo('${record.id}', this)" 
                            style="padding: 3px 6px; font-size: 11px; background-color: #6c757d; color: white;">
                        to
                    </button>
                </div>
            `;
        }
        
        tr.innerHTML = `
            <td>${buttonHtml}</td>
            <td>${globalIndex + 1}</td>
            <td><strong>${formatDate(record.created_at)}</strong></td>
            <td>${truncateText(escapeHtml(record.artist) || 'Unknown', 25)}</td>
            <td>${truncateText(escapeHtml(record.title) || 'Unknown', 30)}</td>
            <td>$${(record.store_price || 0).toFixed(2)}</td>
            <td>${truncateText(escapeHtml(record.catalog_number) || 'N/A', 15)}</td>
            <td>${truncateText(escapeHtml(record.genre_name || record.genre) || 'Unknown', 20)}</td>
            <td>${record.barcode || 'N/A'}</td>
            <td>
                ${record.consignor_id ? 
                    `<span class="consignor-badge" title="${escapeHtml(consignorInfo.username)}">${escapeHtml(consignorInfo.initials) || escapeHtml(consignorInfo.username.substring(0, 2))}</span>` : 
                    '<span style="color: #999;">None</span>'}
            </td>
            <td>
                <span>${record.status_id}</span>
                ${isRecentlyPrinted ? '<br><small style="color: #27ae60; font-size: 10px;">(Printed)</small>' : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Re-apply locator highlights if there's a search term
    const searchInput = document.getElementById('record-locator-search');
    if (searchInput && searchInput.value.trim()) {
        locateRecord();
    }
    
    updatePagination();
}

// Pagination functions
function goToPage(page) {
    if (page < 1) page = 1;
    if (page > window.totalPages) page = window.totalPages;
    
    window.currentPage = page;
    cancelRangeSelection();
    renderCurrentPage();
    updatePagination();
}

function goToFirstPage() {
    goToPage(1);
}

function goToPreviousPage() {
    goToPage(window.currentPage - 1);
}

function goToNextPage() {
    goToPage(window.currentPage + 1);
}

function goToLastPage() {
    goToPage(window.totalPages);
}

function changePageSize(newSize) {
    window.pageSize = newSize;
    window.currentPage = 1;
    cancelRangeSelection();
    updatePagination();
    renderCurrentPage();
}

// PDF Generation with starting position support
async function generatePDF(records) {
    const { jsPDF } = window.jspdf;
    
    console.log('📄 Generating Price Tags PDF');
    console.log(`📍 Starting at position: Row ${window.printStartRow}, Col ${window.printStartCol}`);
    console.log(`📊 Total records: ${records.length}`);
    
    try {
        if (typeof window.getConfigValue !== 'function') {
            throw new Error('getConfigValue function not available');
        }
        
        const labelWidthMM = await window.getConfigValue('LABEL_WIDTH_MM');
        const labelHeightMM = await window.getConfigValue('LABEL_HEIGHT_MM');
        const leftMarginMM = await window.getConfigValue('LEFT_MARGIN_MM');
        const gutterSpacingMM = await window.getConfigValue('GUTTER_SPACING_MM');
        const topMarginMM = await window.getConfigValue('TOP_MARGIN_MM');
        const priceFontSize = await window.getConfigValue('PRICE_FONT_SIZE');
        const textFontSize = await window.getConfigValue('TEXT_FONT_SIZE');
        const barcodeHeightMM = await window.getConfigValue('BARCODE_HEIGHT');
        const printBorders = await window.getConfigValue('PRINT_BORDERS');
        const priceYPosMM = await window.getConfigValue('PRICE_Y_POS');
        const barcodeYPosMM = await window.getConfigValue('BARCODE_Y_POS');
        const infoYPosMM = await window.getConfigValue('INFO_Y_POS');
        
        const mmToPt = 2.83465;
        const labelWidthPt = parseFloat(labelWidthMM) * mmToPt;
        const labelHeightPt = parseFloat(labelHeightMM) * mmToPt;
        const leftMarginPt = parseFloat(leftMarginMM) * mmToPt;
        const gutterSpacingPt = parseFloat(gutterSpacingMM) * mmToPt;
        const topMarginPt = parseFloat(topMarginMM) * mmToPt;
        const barcodeHeightPt = parseFloat(barcodeHeightMM) * mmToPt;
        
        const priceYPosPt = parseFloat(priceYPosMM) * mmToPt;
        const barcodeYPosPt = parseFloat(barcodeYPosMM) * mmToPt;
        const infoYPosPt = parseFloat(infoYPosMM) * mmToPt;
        
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'letter'
        });
        
        const rows = 15;
        const cols = 4;
        const labelsPerPage = rows * cols;
        
        // Calculate starting index (0-indexed)
        const startIndex = ((window.printStartRow - 1) * cols) + (window.printStartCol - 1);
        let currentLabel = 0;
        let pageNumber = 0;
        
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            if (!record) continue;
            if (record.status_id === 3) continue;
            
            // Calculate absolute position
            const absoluteIndex = startIndex + currentLabel;
            const pageIndex = absoluteIndex % labelsPerPage;
            const pageNum = Math.floor(absoluteIndex / labelsPerPage);
            
            if (pageNum > pageNumber) {
                doc.addPage();
                pageNumber = pageNum;
            }
            
            const row = Math.floor(pageIndex / cols);
            const col = pageIndex % cols;
            
            const x = leftMarginPt + (col * (labelWidthPt + gutterSpacingPt));
            const y = topMarginPt + (row * labelHeightPt);
            
            if (printBorders === 'true' || printBorders === true) {
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.rect(x, y, labelWidthPt, labelHeightPt);
            }
            
            // Get consignor initials
            let consignorInitials = '';
            if (record.consignor_id) {
                const consignorInfo = await getConsignorInfo(record.consignor_id);
                consignorInitials = consignorInfo.initials || '';
            }
            
            const artist = record.artist || 'Unknown';
            const genre = record.genre_name || record.genre || 'Unknown';
            const initialsText = consignorInitials ? ` (${consignorInitials})` : '';
            const infoText = `${genre} | ${artist}${initialsText}`;
            
            doc.setFontSize(parseInt(textFontSize));
            doc.setFont('helvetica', 'normal');
            
            let displayText = infoText;
            const maxWidth = labelWidthPt - 10;
            if (doc.getTextWidth(displayText) > maxWidth) {
                while (doc.getTextWidth(displayText + '…') > maxWidth && displayText.length > 0) {
                    displayText = displayText.slice(0, -1);
                }
                displayText += '…';
            }
            
            const infoWidth = doc.getTextWidth(displayText);
            const infoX = x + (labelWidthPt - infoWidth) / 2;
            const infoY = y + infoYPosPt;
            doc.text(displayText, infoX, infoY);
            
            const price = record.store_price || 0;
            const priceText = `$${price.toFixed(2)}`;
            doc.setFontSize(parseInt(priceFontSize));
            doc.setFont('helvetica', 'bold');
            
            const priceWidth = doc.getTextWidth(priceText);
            const priceX = x + (labelWidthPt - priceWidth) / 2;
            const priceY = y + priceYPosPt;
            doc.text(priceText, priceX, priceY);
            
            const barcodeNum = record.barcode;
            if (barcodeNum) {
                try {
                    const canvas = document.createElement('canvas');
                    JsBarcode(canvas, barcodeNum, {
                        format: "CODE128",
                        displayValue: false,
                        height: 30,
                        width: 2,
                        margin: 0
                    });
                    
                    const barcodeData = canvas.toDataURL('image/png');
                    const barcodeWidth = 40;
                    const barcodeX = x + (labelWidthPt - barcodeWidth) / 2;
                    const barcodeY = y + barcodeYPosPt;
                    
                    doc.addImage(barcodeData, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeightPt);
                } catch (barcodeError) {
                    console.error('Error generating barcode:', barcodeError);
                }
            }
            
            currentLabel++;
        }
        
        console.log(`✅ Generated ${currentLabel} labels starting at position (${window.printStartRow}, ${window.printStartCol})`);
        return doc.output('blob');
        
    } catch (error) {
        console.error('PDF generation failed:', error);
        showStatus(`PDF generation failed: ${error.message}`, 'error');
        throw error;
    }
}

// Modal Functions
function showPrintConfirmation() {
    if (window.printQueue.length === 0) {
        showStatus('No records in queue to print', 'error');
        return;
    }
    
    const selectedRecordsList = window.printQueue.map(id => 
        window.allRecords.find(r => r.id.toString() === id)
    ).filter(r => r);
    
    const printCountEl = document.getElementById('print-count');
    if (printCountEl) printCountEl.textContent = selectedRecordsList.length;
    
    const startPositionEl = document.getElementById('print-start-position-summary');
    if (startPositionEl) {
        startPositionEl.textContent = `(${window.printStartRow}, ${window.printStartCol})`;
    }
    
    const summaryList = document.getElementById('print-summary-list');
    if (summaryList) {
        summaryList.innerHTML = '';
        selectedRecordsList.slice(0, 10).forEach((record, i) => {
            const item = document.createElement('div');
            item.style.padding = '5px';
            item.style.borderBottom = i < 9 ? '1px solid #eee' : 'none';
            item.innerHTML = `<strong>${i + 1}.</strong> ${escapeHtml(record.artist || 'Unknown')} - ${escapeHtml(record.title || 'Unknown')} ($${(record.store_price || 0).toFixed(2)})`;
            summaryList.appendChild(item);
        });
        
        if (selectedRecordsList.length > 10) {
            const more = document.createElement('div');
            more.style.padding = '5px';
            more.style.color = '#666';
            more.style.fontStyle = 'italic';
            more.textContent = `... and ${selectedRecordsList.length - 10} more`;
            summaryList.appendChild(more);
        }
    }
    
    const modal = document.getElementById('print-confirmation-modal');
    if (modal) modal.style.display = 'flex';
}

function closePrintConfirmation() {
    const modal = document.getElementById('print-confirmation-modal');
    if (modal) modal.style.display = 'none';
}

async function confirmPrint() {
    const selectedIds = window.printQueue;
    
    closePrintConfirmation();
    showLoading(true);
    
    const selectedRecordsList = selectedIds.map(id => 
        window.allRecords.find(r => r.id.toString() === id)
    ).filter(r => r);
        
    if (selectedRecordsList.length === 0) {
        showStatus('No valid records in queue', 'error');
        showLoading(false);
        return;
    }
    
    console.log(`Generating PDF for ${selectedRecordsList.length} records starting at (${window.printStartRow}, ${window.printStartCol})`);
    
    try {
        const pdfBlob = await generatePDF(selectedRecordsList);
        
        // Download the PDF
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `price_tags_${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Mark as recently printed
        selectedRecordsList.forEach(record => {
            window.recentlyPrintedIds.add(record.id.toString());
        });
        
        showStatus(`PDF generated for ${selectedRecordsList.length} records starting at (${window.printStartRow}, ${window.printStartCol}).`, 'success');
    } catch (error) {
        console.error('PDF generation failed:', error);
        showStatus(`PDF generation failed: ${error.message}`, 'error');
    }
    
    renderCurrentPage();
    showLoading(false);
}

function showMarkActiveConfirmation() {
    if (window.printQueue.length === 0) {
        showStatus('No records in queue', 'error');
        return;
    }
    
    const selectedRecordsList = window.printQueue.map(id => 
        window.allRecords.find(r => r.id.toString() === id)
    ).filter(r => r);
    
    const newRecords = selectedRecordsList.filter(r => r && r.status_id === 1);
    const activeRecords = selectedRecordsList.filter(r => r && r.status_id === 2);
    const soldRecords = selectedRecordsList.filter(r => r && r.status_id === 3);
    const removedRecords = selectedRecordsList.filter(r => r && r.status_id === 4);
    
    const markActiveCountEl = document.getElementById('mark-active-count');
    if (markActiveCountEl) markActiveCountEl.textContent = newRecords.length;
    
    const summaryList = document.getElementById('mark-active-summary-list');
    if (summaryList) {
        summaryList.innerHTML = '';
        
        const total = document.createElement('div');
        total.style.padding = '5px';
        total.style.fontWeight = 'bold';
        total.innerHTML = `Total in queue: ${selectedRecordsList.length} records`;
        summaryList.appendChild(total);
        
        const newDiv = document.createElement('div');
        newDiv.style.padding = '5px';
        newDiv.style.color = newRecords.length > 0 ? '#28a745' : '#666';
        newDiv.innerHTML = `✓ New records to mark as Active: ${newRecords.length}`;
        summaryList.appendChild(newDiv);
        
        if (activeRecords.length > 0) {
            const activeDiv = document.createElement('div');
            activeDiv.style.padding = '5px';
            activeDiv.style.color = '#666';
            activeDiv.innerHTML = `ℹ Already active records: ${activeRecords.length} (no change)`;
            summaryList.appendChild(activeDiv);
        }
        
        if (soldRecords.length > 0) {
            const soldDiv = document.createElement('div');
            soldDiv.style.padding = '5px';
            soldDiv.style.color = '#856404';
            soldDiv.innerHTML = `⚠ Sold records: ${soldRecords.length} (won't be changed)`;
            summaryList.appendChild(soldDiv);
        }
        
        if (removedRecords.length > 0) {
            const removedDiv = document.createElement('div');
            removedDiv.style.padding = '5px';
            removedDiv.style.color = '#721c24';
            removedDiv.innerHTML = `⚠ Removed records: ${removedRecords.length} (won't be changed)`;
            summaryList.appendChild(removedDiv);
        }
        
        if (newRecords.length > 0) {
            summaryList.appendChild(document.createElement('hr'));
            newRecords.slice(0, 5).forEach((record, i) => {
                const item = document.createElement('div');
                item.style.padding = '3px 5px';
                item.style.fontSize = '12px';
                item.innerHTML = `${i + 1}. ${escapeHtml(record.artist || 'Unknown')} - ${escapeHtml(record.title || 'Unknown')}`;
                summaryList.appendChild(item);
            });
            
            if (newRecords.length > 5) {
                const more = document.createElement('div');
                more.style.padding = '3px 5px';
                more.style.color = '#666';
                more.style.fontStyle = 'italic';
                more.textContent = `... and ${newRecords.length - 5} more`;
                summaryList.appendChild(more);
            }
        }
    }
    
    const confirmCheck = document.getElementById('mark-active-confirmation-check');
    if (confirmCheck) confirmCheck.checked = false;
    
    const confirmBtn = document.getElementById('confirm-mark-active-btn');
    if (confirmBtn) confirmBtn.disabled = true;
    
    const modal = document.getElementById('mark-active-confirmation-modal');
    if (modal) modal.style.display = 'flex';
    
    // Add event listener to checkbox
    if (confirmCheck) {
        const newCheck = confirmCheck.cloneNode(true);
        confirmCheck.parentNode.replaceChild(newCheck, confirmCheck);
        
        newCheck.addEventListener('change', function() {
            if (confirmBtn) confirmBtn.disabled = !this.checked;
        });
    }
}

function closeMarkActiveConfirmation() {
    const modal = document.getElementById('mark-active-confirmation-modal');
    if (modal) modal.style.display = 'none';
}

async function confirmMarkActive() {
    const queueIds = window.printQueue;
    
    closeMarkActiveConfirmation();
    showLoading(true);
    
    const newRecordIds = queueIds.filter(id => {
        const record = window.allRecords.find(r => r.id.toString() === id);
        return record && record.status_id === 1;
    });
    
    if (newRecordIds.length === 0) {
        showStatus('No new records in queue to mark as active', 'info');
        showLoading(false);
        return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const recordId of newRecordIds) {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/records/${recordId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    status_id: 2
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    successCount++;
                    
                    // Update local data
                    const recordIndex = window.allRecords.findIndex(r => r.id.toString() === recordId);
                    if (recordIndex !== -1) {
                        window.allRecords[recordIndex].status_id = 2;
                    }
                } else {
                    errorCount++;
                }
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error(`Error updating record ${recordId}:`, error);
            errorCount++;
        }
    }
    
    // Remove successfully marked records from queue
    window.printQueue = window.printQueue.filter(id => {
        const record = window.allRecords.find(r => r.id.toString() === id);
        return record && record.status_id !== 2;
    });
    
    // Remove from recently printed
    newRecordIds.forEach(id => {
        window.recentlyPrintedIds.delete(id);
    });
    
    updateQueueDisplay();
    
    // Reload records to get fresh data
    await loadRecordsForPriceTags();
    
    if (successCount > 0) {
        showStatus(`Successfully marked ${successCount} records as Active${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
    } else {
        showStatus(`Failed to mark records as Active: ${errorCount} errors`, 'error');
    }
    
    showLoading(false);
}

// Initialize when tab is activated
if (!window.priceTagsModule.initialized) {
    document.addEventListener('tabChanged', function(e) {
        if (e.detail && e.detail.tabName === 'price-tags') {
            console.log('Price tags tab activated, loading users and records...');
            loadConsignorsForPriceTags();
            loadRecordsForPriceTags();
            
            // Initialize starting position display
            const startRowInput = document.getElementById('print-start-row');
            const startColInput = document.getElementById('print-start-col');
            if (startRowInput) startRowInput.value = window.printStartRow;
            if (startColInput) startColInput.value = window.printStartCol;
        }
    });
    
    document.addEventListener('DOMContentLoaded', function() {
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'price-tags-tab') {
            console.log('Price tags tab is active on load, loading users and records...');
            loadConsignorsForPriceTags();
            loadRecordsForPriceTags();
            
            // Initialize starting position display
            const startRowInput = document.getElementById('print-start-row');
            const startColInput = document.getElementById('print-start-col');
            if (startRowInput) startRowInput.value = window.printStartRow;
            if (startColInput) startColInput.value = window.printStartCol;
        }
        
        const searchInput = document.getElementById('record-locator-search');
        if (searchInput) {
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    findNextMatch();
                }
            });
        }
    });
    
    window.priceTagsModule.initialized = true;
}

// Export functions for use in HTML
window.loadConsignorsForPriceTags = loadConsignorsForPriceTags;
window.loadRecordsForPriceTags = loadRecordsForPriceTags;
window.filterRecords = filterRecords;
window.goToPage = goToPage;
window.goToFirstPage = goToFirstPage;
window.goToPreviousPage = goToPreviousPage;
window.goToNextPage = goToNextPage;
window.goToLastPage = goToLastPage;
window.changePageSize = changePageSize;
window.updatePrintStartPosition = updatePrintStartPosition;

// Queue functions
window.addToQueue = addToQueue;
window.removeFromQueue = removeFromQueue;
window.clearQueue = clearQueue;
window.moveQueueItem = moveQueueItem;
window.addAllOnPageToQueue = addAllOnPageToQueue;

// Range selection functions
window.startRangeFrom = startRangeFrom;
window.completeRangeTo = completeRangeTo;
window.cancelRangeSelection = cancelRangeSelection;

// Modal functions
window.showPrintConfirmation = showPrintConfirmation;
window.closePrintConfirmation = closePrintConfirmation;
window.confirmPrint = confirmPrint;
window.showMarkActiveConfirmation = showMarkActiveConfirmation;
window.closeMarkActiveConfirmation = closeMarkActiveConfirmation;
window.confirmMarkActive = confirmMarkActive;

// Locator functions
window.locateRecord = locateRecord;
window.findNextMatch = findNextMatch;
window.findPreviousMatch = findPreviousMatch;
window.clearLocatorHighlight = clearLocatorHighlight;