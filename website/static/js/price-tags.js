// ============================================================================
// price-tags.js - Price Tags Tab Functionality
// ============================================================================

// Load users for filter
async function loadUsers() {
    const url = `${AppConfig.baseUrl}/users`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'success') {
        const users = data.users || [];
        const userSelect = $('#user-select');
        userSelect.empty();
        userSelect.append('<option value="all">All Users</option>');
        
        users.forEach(user => {
            userSelect.append(`<option value="${user.id}">${user.username} (ID: ${user.id})</option>`);
        });
        
        users.forEach(user => {
            consignorCache[user.id] = {
                username: user.username || `User ${user.id}`,
                initials: user.initials || (user.username ? user.username.substring(0, 2).toUpperCase() : '')
            };
        });
    }
}

// Load records
async function loadRecords() {
    showLoading(true);
    
    const userSelect = document.getElementById('user-select');
    const selectedUserId = userSelect.value === 'all' ? null : userSelect.value;
    
    let url;
    if (selectedUserId) {
        url = `${AppConfig.baseUrl}/records/user/${selectedUserId}`;
    } else {
        url = `${AppConfig.baseUrl}/records`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'success') {
        allRecords = data.records || [];
        
        allRecords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        document.getElementById('total-records-print').textContent = allRecords.length;
        const inactiveCount = allRecords.filter(r => r.status_id === 1).length;
        const activeCount = allRecords.filter(r => r.status_id === 2).length;
        const soldCount = allRecords.filter(r => r.status_id === 3).length;
        
        document.getElementById('inactive-records').textContent = inactiveCount;
        document.getElementById('active-records').textContent = activeCount;
        document.getElementById('sold-records').textContent = soldCount;
        
        const batchSizeInput = document.getElementById('batch-size');
        batchSizeInput.max = inactiveCount;
        batchSizeInput.value = Math.min(parseInt(batchSizeInput.value) || 10, inactiveCount);
        
        const consignorIds = new Set();
        allRecords.forEach(r => { if (r.consignor_id) consignorIds.add(r.consignor_id); });
        const fetchPromises = Array.from(consignorIds).map(id => getConsignorInfo(id));
        await Promise.all(fetchPromises);
        
        filterRecords();
        
        showStatus(`Loaded ${allRecords.length} records (${inactiveCount} inactive, ${activeCount} active, ${soldCount} sold)`, 'success');
    }
    
    showLoading(false);
}

// Get consignor info
async function getConsignorInfo(consignorId) {
    if (!consignorId) return { username: 'None', initials: '' };
    
    if (consignorCache[consignorId]) {
        return consignorCache[consignorId];
    }
    
    try {
        const url = `${AppConfig.baseUrl}/users/${consignorId}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                const user = data.user || {};
                const consignorInfo = {
                    username: user.username || `User ${consignorId}`,
                    initials: user.initials || (user.username ? user.username.substring(0, 2).toUpperCase() : '')
                };
                consignorCache[consignorId] = consignorInfo;
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
        filteredRecords = allRecords.filter(r => r.status_id === statusId);
    } else {
        filteredRecords = [...allRecords];
    }
    
    filteredRecords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    currentPage = 1;
    updatePagination();
    renderCurrentPage();
    
    const statusText = statusFilter === 'all' ? 'All records' : 
                      statusFilter === 'inactive' ? 'Inactive records' :
                      statusFilter === 'active' ? 'Active records' : 'Sold records';
    
    showStatus(`Showing ${filteredRecords.length} ${statusText}`, 'info');
}

// Update pagination
function updatePagination() {
    totalPages = Math.ceil(filteredRecords.length / pageSize);
    if (totalPages === 0) totalPages = 1;
    
    document.getElementById('total-pages').textContent = totalPages;
    document.getElementById('current-page').value = currentPage;
    document.getElementById('total-filtered').textContent = filteredRecords.length;
    
    document.getElementById('first-page-btn').disabled = currentPage === 1;
    document.getElementById('prev-page-btn').disabled = currentPage === 1;
    document.getElementById('next-page-btn').disabled = currentPage === totalPages;
    document.getElementById('last-page-btn').disabled = currentPage === totalPages;
    
    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, filteredRecords.length);
    
    document.getElementById('showing-start').textContent = filteredRecords.length > 0 ? startIndex : 0;
    document.getElementById('showing-end').textContent = filteredRecords.length > 0 ? endIndex : 0;
    document.getElementById('total-filtered').textContent = filteredRecords.length;
    
    const selectedCount = window.selectedRecords ? window.selectedRecords.size : 0;
    document.getElementById('selected-count').textContent = selectedCount;
    
    updateButtonStates();
}

// Update button states
function updateButtonStates() {
    const selectedCount = window.selectedRecords ? window.selectedRecords.size : 0;
    const hasSelection = selectedCount > 0;
    
    document.getElementById('print-btn').disabled = !hasSelection;
    document.getElementById('mark-active-btn').disabled = !hasSelection;
}

// Render current page
function renderCurrentPage() {
    const tbody = document.getElementById('records-body');
    tbody.innerHTML = '';
    
    if (filteredRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 20px; color: #666;">No records found</td></tr>`;
        updatePagination();
        return;
    }
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredRecords.length);
    const pageRecords = filteredRecords.slice(startIndex, endIndex);
    
    pageRecords.forEach((record, index) => {
        const globalIndex = startIndex + index;
        const consignorInfo = consignorCache[record.consignor_id] || { username: 'None', initials: '' };
        
        const isRecentlyPrinted = recentlyPrintedIds.has(record.id.toString());
        
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
                <span class="condition-badge ${getStatusClass(record.status_id)}">
                    ${getStatusText(record.status_id)}
                </span>
                ${isRecentlyPrinted ? '<br><small style="color: #27ae60; font-size: 10px;">(Printed)</small>' : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    document.querySelectorAll('.record-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
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
    
    const selectAllCheckbox = document.getElementById('select-all');
    selectAllCheckbox.checked = false;
    selectAllCheckbox.addEventListener('change', function() {
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
    
    updatePagination();
}

// Pagination functions
function goToPage(page) {
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    
    currentPage = page;
    renderCurrentPage();
    updatePagination();
}

function goToFirstPage() {
    goToPage(1);
}

function goToPreviousPage() {
    goToPage(currentPage - 1);
}

function goToNextPage() {
    goToPage(currentPage + 1);
}

function goToLastPage() {
    goToPage(totalPages);
}

function changePageSize(newSize) {
    pageSize = newSize;
    currentPage = 1;
    updatePagination();
    renderCurrentPage();
}

function updateSelectionUI() {
    const count = window.selectedRecords ? window.selectedRecords.size : 0;
    document.getElementById('selected-tags').textContent = count;
    updateButtonStates();
}

// Selection functions
function selectRecentInactiveRecords() {
    const batchSize = parseInt(document.getElementById('batch-size').value) || 10;
    
    window.selectedRecords.clear();
    
    const recentRecords = allRecords
        .slice(0, batchSize);
    
    recentRecords.forEach(record => {
        window.selectedRecords.add(record.id.toString());
    });
    
    renderCurrentPage();
    
    if (recentRecords.length > 0) {
        showStatus(`Selected ${recentRecords.length} most recent records`, 'success');
    } else {
        showStatus('No records available to select', 'info');
    }
}

function selectAllOnPage() {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredRecords.length);
    const pageRecords = filteredRecords.slice(startIndex, endIndex);
    
    pageRecords.forEach((record) => {
        const recordId = record.id.toString();
        window.selectedRecords.add(recordId);
    });
    
    renderCurrentPage();
    
    showStatus(`Selected all ${pageRecords.length} records on this page`, 'success');
}

function clearSelection() {
    window.selectedRecords.clear();
    renderCurrentPage();
    showStatus('Selection cleared', 'info');
}

// Modal Functions
function showPrintConfirmation() {
    const selectedIds = Array.from(window.selectedRecords);
    if (selectedIds.length === 0) {
        showStatus('No records selected for printing', 'error');
        return;
    }
    
    const selectedRecords = allRecords.filter(r => selectedIds.includes(r.id.toString()));
    
    document.getElementById('print-count').textContent = selectedRecords.length;
    
    const summaryList = document.getElementById('print-summary-list');
    summaryList.innerHTML = `
        <li>Total selected: ${selectedRecords.length} records</li>
        <li>These records will have price tags generated</li>
    `;
    
    document.getElementById('print-confirmation-modal').style.display = 'flex';
}

function closePrintConfirmation() {
    document.getElementById('print-confirmation-modal').style.display = 'none';
}

async function confirmPrint() {
    const selectedIds = Array.from(window.selectedRecords);
    
    closePrintConfirmation();
    showLoading(true);
    
    const selectedRecords = allRecords
        .filter(r => selectedIds.includes(r.id.toString()));
        
    if (selectedRecords.length === 0) {
        showStatus('No records selected', 'error');
        showLoading(false);
        return;
    }
    
    await fetchAllConfigValues();
    
    const pdfBlob = await generatePDF(selectedRecords);
    
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `price_tags_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    selectedRecords.forEach(record => {
        recentlyPrintedIds.add(record.id.toString());
    });
    
    window.selectedRecords.clear();
    
    showStatus(`PDF generated for ${selectedRecords.length} records.`, 'success');
    
    renderCurrentPage();
    
    showLoading(false);
}

function showMarkActiveConfirmation() {
    const selectedIds = Array.from(window.selectedRecords);
    if (selectedIds.length === 0) {
        showStatus('No records selected', 'error');
        return;
    }
    
    const selectedRecords = allRecords.filter(r => selectedIds.includes(r.id.toString()));
    const inactiveRecords = selectedRecords.filter(r => r.status_id === 1);
    const activeRecords = selectedRecords.filter(r => r.status_id === 2);
    const soldRecords = selectedRecords.filter(r => r.status_id === 3);
    
    document.getElementById('mark-active-count').textContent = selectedRecords.length;
    
    const summaryList = document.getElementById('mark-active-summary-list');
    summaryList.innerHTML = `
        <li>Total selected: ${selectedRecords.length} records</li>
        <li>Inactive records: ${inactiveRecords.length} (will be marked as Active)</li>
        <li>Active records: ${activeRecords.length} (already active - no change)</li>
        <li>Sold records: ${soldRecords.length} (won't be changed)</li>
    `;
    
    document.getElementById('mark-active-confirmation-check').checked = false;
    document.getElementById('confirm-mark-active-btn').disabled = true;
    
    document.getElementById('mark-active-confirmation-modal').style.display = 'flex';
    
    document.getElementById('mark-active-confirmation-check').addEventListener('change', function() {
        document.getElementById('confirm-mark-active-btn').disabled = !this.checked;
    });
}

function closeMarkActiveConfirmation() {
    document.getElementById('mark-active-confirmation-modal').style.display = 'none';
}

async function confirmMarkActive() {
    const selectedIds = Array.from(window.selectedRecords);
    
    closeMarkActiveConfirmation();
    showLoading(true);
    
    const inactiveRecordIds = selectedIds.filter(id => {
        const record = allRecords.find(r => r.id.toString() === id);
        return record && record.status_id === 1;
    });
    
    if (inactiveRecordIds.length === 0) {
        showStatus('No inactive records to mark as active', 'info');
        showLoading(false);
        return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const recordId of inactiveRecordIds) {
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
                    
                    const recordIndex = allRecords.findIndex(r => r.id.toString() === recordId);
                    if (recordIndex !== -1) {
                        allRecords[recordIndex].status_id = 2;
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
    
    window.selectedRecords.clear();
    
    inactiveRecordIds.forEach(id => {
        recentlyPrintedIds.delete(id);
    });
    
    await loadRecords();
    
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
        
        const rows = 15;
        const cols = 4;
        const labelsPerPage = rows * cols;
        
        let currentLabel = 0;
        
        const isArtistLabels = records.length > 0 && records[0].title === 'ARTIST LABEL';
        
        for (const record of records) {
            if (currentLabel > 0 && currentLabel % labelsPerPage === 0) {
                doc.addPage();
            }
            
            const pageIndex = currentLabel % labelsPerPage;
            const row = Math.floor(pageIndex / cols);
            const col = pageIndex % cols;
            
            const x = leftMarginPt + (col * (labelWidthPt + gutterSpacingPt));
            const y = topMarginPt + (row * labelHeightPt);
            
            if (printBorders) {
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.rect(x, y, labelWidthPt, labelHeightPt);
            }
            
            if (isArtistLabels) {
                const artist = record.artist || 'Unknown';
                
                doc.setFontSize(artistLabelFontSize);
                doc.setFont('helvetica', 'bold');
                
                const textWidth = doc.getTextWidth(artist);
                const textX = x + (labelWidthPt - textWidth) / 2;
                const textY = y + (labelHeightPt / 2) + (artistLabelFontSize / 3);
                
                doc.text(artist, textX, textY);
            } else {
                const consignorId = record.consignor_id;
                let consignorInitials = '';
                if (consignorId) {
                    const consignorInfo = await getConsignorInfo(consignorId);
                    consignorInitials = consignorInfo.initials || '';
                }
                
                const price = record.store_price || 0;
                const priceText = `$${price.toFixed(2)}`;
                doc.setFontSize(priceFontSize);
                doc.setFont('helvetica', 'bold');
                
                const priceWidth = doc.getTextWidth(priceText);
                const priceX = x + (labelWidthPt - priceWidth) / 2;
                const priceY = y + (priceYPos * mmToPt);
                
                doc.text(priceText, priceX, priceY);
                
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
                const initialsWidth = initialsText ? doc.getTextWidth(initialsText) : 0;
                const availableWidthForBase = maxInfoWidth - initialsWidth;
                
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

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'price-tags') {
        loadRecords();
    }
});