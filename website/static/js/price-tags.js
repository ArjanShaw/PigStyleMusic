// ============================================================================
// price-tags.js - Price Tags Tab Functionality
// ============================================================================

// Use window object to avoid redeclaration errors
window.priceTagsModule = window.priceTagsModule || {};

// Cache for consignor information - check if it already exists
if (typeof window.consignorCache === 'undefined') {
    window.consignorCache = {};
}

// State variables - check if they already exist
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

// Selected records (make sure this is defined)
window.selectedRecords = window.selectedRecords || new Set();

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

function getConfigValue(key) {
    if (window.dbConfigValues && window.dbConfigValues[key]) {
        const value = window.dbConfigValues[key].value;
        const num = parseFloat(value);
        return isNaN(num) ? value : num;
    }
    
    // Default values
    const defaults = {
        'LABEL_WIDTH_MM': 50.8,
        'LABEL_HEIGHT_MM': 25.4,
        'LEFT_MARGIN_MM': 8,
        'GUTTER_SPACING_MM': 2,
        'TOP_MARGIN_MM': 12,
        'PRICE_FONT_SIZE': 14,
        'TEXT_FONT_SIZE': 8,
        'ARTIST_LABEL_FONT_SIZE': 12,
        'BARCODE_HEIGHT': 8,
        'PRINT_BORDERS': false,
        'PRICE_Y_POS': 12,
        'BARCODE_Y_POS': 16,
        'INFO_Y_POS': 8
    };
    
    return defaults[key] || null;
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
            
            // Update batch size input
            const batchSizeInput = document.getElementById('batch-size');
            if (batchSizeInput) {
                batchSizeInput.max = newCount;
                batchSizeInput.value = Math.min(parseInt(batchSizeInput.value) || 10, newCount || 10);
            }
            
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
    
    const selectedCount = window.selectedRecords ? window.selectedRecords.size : 0;
    const selectedCountEl = document.getElementById('selected-count');
    if (selectedCountEl) selectedCountEl.textContent = selectedCount;
    
    updateButtonStates();
}

// Update button states
function updateButtonStates() {
    const selectedCount = window.selectedRecords ? window.selectedRecords.size : 0;
    const hasSelection = selectedCount > 0;
    
    const printBtn = document.getElementById('print-btn');
    const markActiveBtn = document.getElementById('mark-active-btn');
    
    if (printBtn) printBtn.disabled = !hasSelection;
    if (markActiveBtn) markActiveBtn.disabled = !hasSelection;
    
    // Update selected tags count
    const selectedTagsEl = document.getElementById('selected-tags');
    if (selectedTagsEl) selectedTagsEl.textContent = selectedCount;
}

// Render current page - DISPLAYING RAW STATUS_ID
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
    
    // Debug: Log the first few records to see their status_id
    console.log('============ RECORD STATUS DEBUG ================');
    pageRecords.slice(0, 5).forEach((record, i) => {
        console.log(`Record ${i}: ID=${record.id}, status_id=${record.status_id}, status_name=${record.status_name}`);
    });
    
    pageRecords.forEach((record, index) => {
        const globalIndex = startIndex + index;
        const consignorInfo = window.consignorCache[record.consignor_id] || { username: 'None', initials: '' };
        
        const isRecentlyPrinted = window.recentlyPrintedIds.has(record.id.toString());
        
        // Get status_id for display
        const statusId = record.status_id;
        
        const tr = document.createElement('tr');
        if (isRecentlyPrinted) {
            tr.style.backgroundColor = '#f0fff0';
            tr.style.borderLeft = '3px solid #27ae60';
        }
        
        tr.innerHTML = `
            <td><input type="checkbox" class="record-checkbox" data-id="${record.id}" ${window.selectedRecords && window.selectedRecords.has(record.id.toString()) ? 'checked' : ''}></td>
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
                <span >
                    ${statusId}
                </span>
                ${isRecentlyPrinted ? '<br><small style="color: #27ae60; font-size: 10px;">(Printed)</small>' : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Add event listeners to checkboxes
    document.querySelectorAll('.record-checkbox').forEach(checkbox => {
        // Remove existing listeners by cloning
        const newCheckbox = checkbox.cloneNode(true);
        checkbox.parentNode.replaceChild(newCheckbox, checkbox);
        
        newCheckbox.addEventListener('change', function() {
            const recordId = this.getAttribute('data-id');
            if (this.checked) {
                window.selectedRecords.add(recordId);
            } else {
                window.selectedRecords.delete(recordId);
            }
            updateButtonStates();
            updatePagination();
        });
    });
    
    // Handle select all checkbox
    const selectAllCheckbox = document.getElementById('select-all');
    if (selectAllCheckbox) {
        // Remove existing event listener by cloning and replacing
        const newSelectAll = selectAllCheckbox.cloneNode(true);
        selectAllCheckbox.parentNode.replaceChild(newSelectAll, selectAllCheckbox);
        
        newSelectAll.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.record-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
                const recordId = checkbox.getAttribute('data-id');
                if (this.checked) {
                    window.selectedRecords.add(recordId);
                } else {
                    window.selectedRecords.delete(recordId);
                }
            });
            updateButtonStates();
            updatePagination();
        });
    }
    
    updatePagination();
}

// Pagination functions
function goToPage(page) {
    if (page < 1) page = 1;
    if (page > window.totalPages) page = window.totalPages;
    
    window.currentPage = page;
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
    updatePagination();
    renderCurrentPage();
}

// Selection functions
function selectRecentNewRecords() {
    const batchSizeInput = document.getElementById('batch-size');
    if (!batchSizeInput) return;
    
    const batchSize = parseInt(batchSizeInput.value) || 10;
    
    // Clear current selection
    window.selectedRecords.clear();
    
    // Get new records (status_id = 1)
    const newRecords = window.allRecords
        .filter(r => r.status_id === 1)
        .slice(0, batchSize);
    
    // Add to selection
    newRecords.forEach(record => {
        window.selectedRecords.add(record.id.toString());
    });
    
    renderCurrentPage();
    updateButtonStates();
    
    if (newRecords.length > 0) {
        showStatus(`Selected ${newRecords.length} most recent new records`, 'success');
    } else {
        showStatus('No new records available to select', 'info');
    }
}

function selectAllOnPage() {
    const startIndex = (window.currentPage - 1) * window.pageSize;
    const endIndex = Math.min(startIndex + window.pageSize, window.filteredRecords.length);
    const pageRecords = window.filteredRecords.slice(startIndex, endIndex);
    
    pageRecords.forEach((record) => {
        const recordId = record.id.toString();
        window.selectedRecords.add(recordId);
    });
    
    renderCurrentPage();
    updateButtonStates();
    
    showStatus(`Selected all ${pageRecords.length} records on this page`, 'success');
}

function clearSelection() {
    window.selectedRecords.clear();
    renderCurrentPage();
    updateButtonStates();
    showStatus('Selection cleared', 'info');
}

// Modal Functions
function showPrintConfirmation() {
    const selectedIds = Array.from(window.selectedRecords);
    if (selectedIds.length === 0) {
        showStatus('No records selected for printing', 'error');
        return;
    }
    
    const selectedRecordsList = window.allRecords.filter(r => selectedIds.includes(r.id.toString()));
    
    const printCountEl = document.getElementById('print-count');
    if (printCountEl) printCountEl.textContent = selectedRecordsList.length;
    
    const summaryList = document.getElementById('print-summary-list');
    if (summaryList) {
        summaryList.innerHTML = `
            <li>Total selected: ${selectedRecordsList.length} records</li>
            <li>These records will have price tags generated</li>
        `;
    }
    
    const modal = document.getElementById('print-confirmation-modal');
    if (modal) modal.style.display = 'flex';
}

function closePrintConfirmation() {
    const modal = document.getElementById('print-confirmation-modal');
    if (modal) modal.style.display = 'none';
}

async function confirmPrint() {
    const selectedIds = Array.from(window.selectedRecords);
    
    closePrintConfirmation();
    showLoading(true);
    
    const selectedRecordsList = window.allRecords
        .filter(r => selectedIds.includes(r.id.toString()));
        
    if (selectedRecordsList.length === 0) {
        showStatus('No records selected', 'error');
        showLoading(false);
        return;
    }
    
    // Make sure config is loaded
    if (typeof fetchAllConfigValues === 'function') {
        await fetchAllConfigValues();
    }
    
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
    
    // Clear selection
    window.selectedRecords.clear();
    
    showStatus(`PDF generated for ${selectedRecordsList.length} records.`, 'success');
    
    renderCurrentPage();
    updateButtonStates();
    
    showLoading(false);
}

function showMarkActiveConfirmation() {
    const selectedIds = Array.from(window.selectedRecords);
    if (selectedIds.length === 0) {
        showStatus('No records selected', 'error');
        return;
    }
    
    const selectedRecordsList = window.allRecords.filter(r => selectedIds.includes(r.id.toString()));
    const newRecords = selectedRecordsList.filter(r => r.status_id === 1);
    const activeRecords = selectedRecordsList.filter(r => r.status_id === 2);
    const soldRecords = selectedRecordsList.filter(r => r.status_id === 3);
    const removedRecords = selectedRecordsList.filter(r => r.status_id === 4);
    
    const markActiveCountEl = document.getElementById('mark-active-count');
    if (markActiveCountEl) markActiveCountEl.textContent = selectedRecordsList.length;
    
    const summaryList = document.getElementById('mark-active-summary-list');
    if (summaryList) {
        summaryList.innerHTML = `
            <li>Total selected: ${selectedRecordsList.length} records</li>
            <li>New records: ${newRecords.length} (will be marked as Active)</li>
            <li>Active records: ${activeRecords.length} (already active - no change)</li>
            <li>Sold records: ${soldRecords.length} (won't be changed)</li>
            <li>Removed records: ${removedRecords.length} (won't be changed)</li>
        `;
    }
    
    const confirmCheck = document.getElementById('mark-active-confirmation-check');
    if (confirmCheck) confirmCheck.checked = false;
    
    const confirmBtn = document.getElementById('confirm-mark-active-btn');
    if (confirmBtn) confirmBtn.disabled = true;
    
    const modal = document.getElementById('mark-active-confirmation-modal');
    if (modal) modal.style.display = 'flex';
    
    // Add event listener to checkbox
    if (confirmCheck) {
        // Remove existing listeners
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
    const selectedIds = Array.from(window.selectedRecords);
    
    closeMarkActiveConfirmation();
    showLoading(true);
    
    const newRecordIds = selectedIds.filter(id => {
        const record = window.allRecords.find(r => r.id.toString() === id);
        return record && record.status_id === 1;
    });
    
    if (newRecordIds.length === 0) {
        showStatus('No new records to mark as active', 'info');
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
    
    // Clear selection
    window.selectedRecords.clear();
    
    // Remove from recently printed
    newRecordIds.forEach(id => {
        window.recentlyPrintedIds.delete(id);
    });
    
    // Reload records to get fresh data
    await loadRecordsForPriceTags();
    
    if (successCount > 0) {
        showStatus(`Successfully marked ${successCount} records as Active${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
    } else {
        showStatus(`Failed to mark records as Active: ${errorCount} errors`, 'error');
    }
    
    showLoading(false);
}

// PDF Generation
async function generatePDF(records) {
    return new Promise(async (resolve) => {
        const { jsPDF } = window.jspdf;
        
        // Get configuration values
        const labelWidthMM = getConfigValue('LABEL_WIDTH_MM');
        const labelHeightMM = getConfigValue('LABEL_HEIGHT_MM');
        const leftMarginMM = getConfigValue('LEFT_MARGIN_MM');
        const gutterSpacingMM = getConfigValue('GUTTER_SPACING_MM');
        const topMarginMM = getConfigValue('TOP_MARGIN_MM');
        const priceFontSize = getConfigValue('PRICE_FONT_SIZE');
        const textFontSize = getConfigValue('TEXT_FONT_SIZE');
        const artistLabelFontSize = getConfigValue('ARTIST_LABEL_FONT_SIZE');
        const barcodeHeightMM = getConfigValue('BARCODE_HEIGHT');
        const printBorders = getConfigValue('PRINT_BORDERS');
        
        const priceYPos = getConfigValue('PRICE_Y_POS');
        const barcodeYPos = getConfigValue('BARCODE_Y_POS');
        const infoYPos = getConfigValue('INFO_Y_POS');
        
        // Convert mm to points (1 mm = 2.83465 points)
        const mmToPt = 2.83465;
        const labelWidthPt = labelWidthMM * mmToPt;
        const labelHeightPt = labelHeightMM * mmToPt;
        const leftMarginPt = leftMarginMM * mmToPt;
        const gutterSpacingPt = gutterSpacingMM * mmToPt;
        const topMarginPt = topMarginMM * mmToPt;
        const barcodeHeightPt = barcodeHeightMM * mmToPt;
        
        const doc = new jsPDF({
            unit: 'pt',
            format: 'letter'
        });
        
        // 15 rows, 4 columns = 60 labels per page
        const rows = 15;
        const cols = 4;
        const labelsPerPage = rows * cols;
        
        let currentLabel = 0;
        
        // Check if these are artist labels (special case)
        const isArtistLabels = records.length > 0 && records[0].title === 'ARTIST LABEL';
        
        for (const record of records) {
            // Add new page if needed
            if (currentLabel > 0 && currentLabel % labelsPerPage === 0) {
                doc.addPage();
            }
            
            // Calculate position on page
            const pageIndex = currentLabel % labelsPerPage;
            const row = Math.floor(pageIndex / cols);
            const col = pageIndex % cols;
            
            const x = leftMarginPt + (col * (labelWidthPt + gutterSpacingPt));
            const y = topMarginPt + (row * labelHeightPt);
            
            // Draw border if enabled
            if (printBorders) {
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.rect(x, y, labelWidthPt, labelHeightPt);
            }
            
            if (isArtistLabels) {
                // Artist label mode
                const artist = record.artist || 'Unknown';
                
                doc.setFontSize(artistLabelFontSize);
                doc.setFont('helvetica', 'bold');
                
                const textWidth = doc.getTextWidth(artist);
                const textX = x + (labelWidthPt - textWidth) / 2;
                const textY = y + (labelHeightPt / 2) + (artistLabelFontSize / 3);
                
                doc.text(artist, textX, textY);
            } else {
                // Regular price tag mode
                const consignorId = record.consignor_id;
                let consignorInitials = '';
                if (consignorId) {
                    const consignorInfo = await getConsignorInfo(consignorId);
                    consignorInitials = consignorInfo.initials || '';
                }
                
                // Print price
                const price = record.store_price || 0;
                const priceText = `$${price.toFixed(2)}`;
                doc.setFontSize(priceFontSize);
                doc.setFont('helvetica', 'bold');
                
                const priceWidth = doc.getTextWidth(priceText);
                const priceX = x + (labelWidthPt - priceWidth) / 2;
                const priceY = y + (priceYPos * mmToPt);
                
                doc.text(priceText, priceX, priceY);
                
                // Print info (genre and artist)
                const artist = record.artist || 'Unknown';
                const genre = record.genre_name || record.genre || 'Unknown';
                
                const initialsText = consignorInitials ? ` | (${consignorInitials})` : '';
                const maxInfoWidth = labelWidthPt - 10;
                
                let baseText = genre;
                if (artist !== 'Unknown') {
                    baseText += ` | ${artist}`;
                }
                
                doc.setFontSize(textFontSize);
                doc.setFont('helvetica', 'normal');
                
                // Calculate available width
                const initialsWidth = initialsText ? doc.getTextWidth(initialsText) : 0;
                const availableWidthForBase = maxInfoWidth - initialsWidth;
                
                // Truncate base text if needed
                let displayBaseText = baseText;
                if (doc.getTextWidth(baseText) > availableWidthForBase) {
                    while (doc.getTextWidth(displayBaseText + '…') > availableWidthForBase && displayBaseText.length > 0) {
                        displayBaseText = displayBaseText.slice(0, -1);
                    }
                    displayBaseText += '…';
                }
                
                let infoText = displayBaseText + initialsText;
                
                const infoWidth = doc.getTextWidth(infoText);
                const infoX = x + (labelWidthPt - infoWidth) / 2;
                const infoY = y + (infoYPos * mmToPt);
                
                doc.text(infoText, infoX, infoY);
                
                // Print barcode
                const barcodeNum = record.barcode;
                if (barcodeNum) {
                    const canvas = document.createElement('canvas');
                    JsBarcode(canvas, barcodeNum, {
                        format: "CODE128",
                        displayValue: false,
                        height: 20,
                        margin: 0,
                        width: 2
                    });
                    
                    const barcodeData = canvas.toDataURL('image/png');
                    const barcodeX = x + (labelWidthPt - (25 * mmToPt)) / 2;
                    const barcodeY = y + (barcodeYPos * mmToPt);
                    
                    doc.addImage(barcodeData, 'PNG', barcodeX, barcodeY, 25 * mmToPt, barcodeHeightPt);
                }
            }
            
            currentLabel++;
        }
        
        const pdfBlob = doc.output('blob');
        resolve(pdfBlob);
    });
}

// Initialize when tab is activated - use a flag to prevent multiple initializations
if (!window.priceTagsModule.initialized) {
    document.addEventListener('tabChanged', function(e) {
        if (e.detail && e.detail.tabName === 'price-tags') {
            console.log('Price tags tab activated, loading users and records...');
            loadConsignorsForPriceTags();
            loadRecordsForPriceTags();
        }
    });
    
    // Also initialize if we're already on the tab when page loads
    document.addEventListener('DOMContentLoaded', function() {
        // Check if price-tags tab is active
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'price-tags-tab') {
            console.log('Price tags tab is active on load, loading users and records...');
            loadConsignorsForPriceTags();
            loadRecordsForPriceTags();
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
window.selectRecentNewRecords = selectRecentNewRecords;
window.selectAllOnPage = selectAllOnPage;
window.clearSelection = clearSelection;
window.showPrintConfirmation = showPrintConfirmation;
window.closePrintConfirmation = closePrintConfirmation;
window.confirmPrint = confirmPrint;
window.showMarkActiveConfirmation = showMarkActiveConfirmation;
window.closeMarkActiveConfirmation = closeMarkActiveConfirmation;
window.confirmMarkActive = confirmMarkActive;