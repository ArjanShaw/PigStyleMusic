// ============================================================================
// custom-labels.js - Custom Label Placer with Starting Position
// ============================================================================

window.customLabelsModule = window.customLabelsModule || {};

// State variables
window.customLabelsItems = window.customLabelsItems || []; // Array of {text}
window.labelSheetConfig = null;
window.startRow = 1;
window.startCol = 1;

// Load label sheet configuration
async function loadLabelSheetConfig() {
    try {
        if (typeof window.getConfigValue !== 'function') {
            throw new Error('getConfigValue not available');
        }
        
        window.labelSheetConfig = await window.labelGenerator.loadLabelConfig();
        
        // Calculate grid dimensions (15 rows, 4 columns)
        window.labelSheetConfig.rows = 15;
        window.labelSheetConfig.cols = 4;
        window.labelSheetConfig.labelsPerPage = window.labelSheetConfig.rows * window.labelSheetConfig.cols;
        
        console.log('Label sheet config loaded:', window.labelSheetConfig);
        
        // Update display
        renderLabelSheetGrid();
        updateCustomLabelsQueueDisplay();
        updateStartingPositionDisplay();
        
        return window.labelSheetConfig;
    } catch (error) {
        console.error('Failed to load config:', error);
        showStatus('Failed to load configuration: ' + error.message, 'error');
        return null;
    }
}

// Render the label sheet grid
function renderLabelSheetGrid() {
    const gridContainer = document.getElementById('label-sheet-grid');
    if (!gridContainer || !window.labelSheetConfig) return;
    
    const { rows, cols, labelWidthMM, labelHeightMM } = window.labelSheetConfig;
    
    // Scale for display (pixels per mm)
    const scale = 3;
    const cellWidth = labelWidthMM * scale;
    const cellHeight = labelHeightMM * scale;
    
    gridContainer.innerHTML = '';
    gridContainer.style.display = 'grid';
    gridContainer.style.gridTemplateColumns = `repeat(${cols}, ${cellWidth}px)`;
    gridContainer.style.gap = '5px';
    gridContainer.style.justifyContent = 'center';
    gridContainer.style.background = '#e9ecef';
    gridContainer.style.padding = '20px';
    gridContainer.style.overflowX = 'auto';
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const labelIndex = row * cols + col;
            const labelItem = window.customLabelsItems[labelIndex];
            
            const cell = document.createElement('div');
            cell.className = 'label-sheet-cell';
            cell.style.width = `${cellWidth}px`;
            cell.style.height = `${cellHeight}px`;
            cell.style.border = window.labelSheetConfig.printBorders ? '1px solid #ccc' : '1px dashed #ddd';
            cell.style.borderRadius = '4px';
            cell.style.background = labelItem ? '#fff3cd' : 'white';
            cell.style.cursor = 'pointer';
            cell.style.display = 'flex';
            cell.style.flexDirection = 'column';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            cell.style.textAlign = 'center';
            cell.style.padding = '5px';
            cell.style.position = 'relative';
            cell.style.overflow = 'hidden';
            
            cell.onclick = () => selectLabelPosition(row, col);
            
            if (labelItem) {
                const textSpan = document.createElement('div');
                textSpan.style.fontSize = '12px';
                textSpan.style.fontWeight = 'normal';
                textSpan.style.color = '#333';
                textSpan.style.wordBreak = 'break-word';
                textSpan.style.maxWidth = '100%';
                textSpan.textContent = labelItem.text;
                cell.appendChild(textSpan);
                
                const removeBtn = document.createElement('button');
                removeBtn.className = 'btn btn-small';
                removeBtn.style.position = 'absolute';
                removeBtn.style.top = '2px';
                removeBtn.style.right = '2px';
                removeBtn.style.padding = '2px 4px';
                removeBtn.style.fontSize = '10px';
                removeBtn.style.background = '#dc3545';
                removeBtn.style.color = 'white';
                removeBtn.style.border = 'none';
                removeBtn.style.borderRadius = '2px';
                removeBtn.style.cursor = 'pointer';
                removeBtn.innerHTML = '×';
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    removeLabelFromPosition(row, col);
                };
                cell.appendChild(removeBtn);
            } else {
                const plusIcon = document.createElement('i');
                plusIcon.className = 'fas fa-plus';
                plusIcon.style.color = '#999';
                plusIcon.style.fontSize = '20px';
                cell.appendChild(plusIcon);
                
                const coordText = document.createElement('div');
                coordText.style.fontSize = '10px';
                coordText.style.marginTop = '5px';
                coordText.style.color = '#999';
                coordText.textContent = `${row + 1},${col + 1}`;
                cell.appendChild(coordText);
            }
            
            if (window.selectedPosition && window.selectedPosition.row === row && window.selectedPosition.col === col) {
                cell.style.border = '3px solid #007bff';
                cell.style.boxShadow = '0 0 0 2px rgba(0,123,255,0.25)';
            }
            
            gridContainer.appendChild(cell);
        }
    }
}

// Select a label position
function selectLabelPosition(row, col) {
    window.selectedPosition = { row, col };
    renderLabelSheetGrid();
    
    const labelIndex = row * 4 + col;
    const existingItem = window.customLabelsItems[labelIndex];
    
    if (existingItem) {
        document.getElementById('label-text').value = existingItem.text;
        document.getElementById('position-info').textContent = `Editing position (${row + 1}, ${col + 1})`;
        document.getElementById('add-update-btn').innerHTML = '<i class="fas fa-save"></i> Update Label';
    } else {
        document.getElementById('label-text').value = '';
        document.getElementById('position-info').textContent = `Adding label at position (${row + 1}, ${col + 1})`;
        document.getElementById('add-update-btn').innerHTML = '<i class="fas fa-plus"></i> Add Label';
    }
    
    document.getElementById('label-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Remove label from position
function removeLabelFromPosition(row, col) {
    const labelIndex = row * 4 + col;
    if (window.customLabelsItems[labelIndex]) {
        delete window.customLabelsItems[labelIndex];
        if (window.selectedPosition && window.selectedPosition.row === row && window.selectedPosition.col === col) {
            window.selectedPosition = null;
            document.getElementById('label-text').value = '';
            document.getElementById('add-update-btn').innerHTML = '<i class="fas fa-plus"></i> Add Label';
            document.getElementById('position-info').textContent = 'No position selected';
        }
        renderLabelSheetGrid();
        updateCustomLabelsQueueDisplay();
        showStatus('Label removed', 'info');
    }
}

// Add or update label
function addOrUpdateLabel() {
    if (!window.selectedPosition) {
        showStatus('Please select a position on the label sheet first', 'warning');
        return;
    }
    
    const text = document.getElementById('label-text').value.trim();
    
    if (!text) {
        showStatus('Please enter text for the label', 'warning');
        return;
    }
    
    const labelIndex = window.selectedPosition.row * 4 + window.selectedPosition.col;
    
    window.customLabelsItems[labelIndex] = {
        text: text
    };
    
    document.getElementById('label-text').value = '';
    window.selectedPosition = null;
    renderLabelSheetGrid();
    updateCustomLabelsQueueDisplay();
    showStatus('Label added', 'success');
}

// Clear all labels
function clearAllLabels() {
    const hasLabels = window.customLabelsItems.some(item => item);
    if (!hasLabels) return;
    
    if (confirm('Are you sure you want to clear ALL labels from the sheet?')) {
        window.customLabelsItems = [];
        window.selectedPosition = null;
        renderLabelSheetGrid();
        updateCustomLabelsQueueDisplay();
        showStatus('All labels cleared', 'info');
    }
}

// Update starting position display
function updateStartingPositionDisplay() {
    const startRowDisplay = document.getElementById('start-row-display');
    const startColDisplay = document.getElementById('start-col-display');
    
    if (startRowDisplay) startRowDisplay.textContent = window.startRow;
    if (startColDisplay) startColDisplay.textContent = window.startCol;
}

// Update starting position
function updateStartingPosition() {
    const rowInput = document.getElementById('start-row');
    const colInput = document.getElementById('start-col');
    
    if (rowInput) {
        let newRow = parseInt(rowInput.value);
        if (isNaN(newRow)) newRow = 1;
        newRow = Math.max(1, Math.min(15, newRow));
        window.startRow = newRow;
        rowInput.value = newRow;
    }
    
    if (colInput) {
        let newCol = parseInt(colInput.value);
        if (isNaN(newCol)) newCol = 1;
        newCol = Math.max(1, Math.min(4, newCol));
        window.startCol = newCol;
        colInput.value = newCol;
    }
    
    updateStartingPositionDisplay();
    showStatus(`Printing will start at position (${window.startRow}, ${window.startCol})`, 'info');
}

// Update queue display
function updateCustomLabelsQueueDisplay() {
    const queueContent = document.getElementById('custom-labels-queue-content');
    const queueCount = document.getElementById('custom-labels-queue-count');
    const printQueueCount = document.getElementById('print-custom-queue-count');
    const printQueueBtn = document.getElementById('print-custom-queue-btn');
    
    if (!queueContent) return;
    
    const validLabels = window.customLabelsItems.filter(item => item);
    
    queueCount.textContent = validLabels.length;
    printQueueCount.textContent = validLabels.length;
    
    if (printQueueBtn) {
        printQueueBtn.disabled = validLabels.length === 0;
    }
    
    if (validLabels.length === 0) {
        queueContent.innerHTML = `
            <div class="queue-empty" style="text-align: center; padding: 40px; color: #999;">
                <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No labels placed on the sheet</p>
                <p style="font-size: 12px;">Click on any cell in the grid above to add a label</p>
            </div>
        `;
        return;
    }
    
    queueContent.innerHTML = '';
    
    let index = 1;
    for (let i = 0; i < window.customLabelsItems.length; i++) {
        const item = window.customLabelsItems[i];
        if (!item) continue;
        
        const row = Math.floor(i / 4);
        const col = i % 4;
        
        const queueItem = document.createElement('div');
        queueItem.className = 'queue-item';
        queueItem.style.background = 'white';
        queueItem.style.border = '1px solid #e0e0e0';
        queueItem.style.borderRadius = '6px';
        queueItem.style.padding = '12px 15px';
        queueItem.style.marginBottom = '8px';
        queueItem.style.display = 'flex';
        queueItem.style.alignItems = 'center';
        queueItem.style.gap = '15px';
        
        queueItem.innerHTML = `
            <div class="queue-item-number" style="background: #6c757d; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${index}</div>
            <div class="queue-item-info" style="flex: 1;">
                <div class="queue-item-title" style="font-weight: 600; margin-bottom: 4px;">Position (${row + 1}, ${col + 1})</div>
                <div class="queue-item-details" style="font-size: 12px; color: #666;">
                    <span>${escapeHtml(item.text)}</span>
                </div>
            </div>
            <button class="queue-item-remove" onclick="removeLabelFromPosition(${row}, ${col})" style="background: none; border: 1px solid #dc3545; color: #dc3545; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                <i class="fas fa-times"></i> Remove
            </button>
        `;
        
        queueContent.appendChild(queueItem);
        index++;
    }
}

// Show print confirmation
function showPrintConfirmation() {
    const validLabels = window.customLabelsItems.filter(item => item);
    
    if (validLabels.length === 0) {
        showStatus('No labels to print', 'error');
        return;
    }
    
    const summaryList = document.getElementById('custom-print-summary-list');
    if (summaryList) {
        summaryList.innerHTML = '';
        
        let count = 0;
        for (let i = 0; i < window.customLabelsItems.length && count < 20; i++) {
            const item = window.customLabelsItems[i];
            if (!item) continue;
            
            const row = Math.floor(i / 4);
            const col = i % 4;
            
            const div = document.createElement('div');
            div.style.padding = '5px';
            div.style.borderBottom = '1px solid #eee';
            div.innerHTML = `${count + 1}. Position (${row + 1},${col + 1}): ${escapeHtml(item.text)}`;
            summaryList.appendChild(div);
            count++;
        }
        
        const totalLabels = validLabels.length;
        if (totalLabels > 20) {
            const more = document.createElement('div');
            more.style.padding = '5px';
            more.style.fontStyle = 'italic';
            more.style.color = '#666';
            more.textContent = `... and ${totalLabels - 20} more`;
            summaryList.appendChild(more);
        }
    }
    
    document.getElementById('custom-print-count').textContent = validLabels.length;
    document.getElementById('custom-print-start-position').textContent = `(${window.startRow}, ${window.startCol})`;
    document.getElementById('custom-print-confirmation-modal').style.display = 'flex';
}

// Close print confirmation
function closePrintConfirmation() {
    document.getElementById('custom-print-confirmation-modal').style.display = 'none';
}

// Confirm and print
async function confirmPrint() {
    closePrintConfirmation();
    showLoading(true);
    
    try {
        // Convert items array to labels array for PDF generator
        const labels = [];
        for (let i = 0; i < window.customLabelsItems.length; i++) {
            if (window.customLabelsItems[i]) {
                labels.push({
                    text: window.customLabelsItems[i].text
                });
            }
        }
        
        const pdfBlob = await window.labelGenerator.generateCustomLabelsPDF(labels, {
            startRow: window.startRow,
            startCol: window.startCol
        });
        
        if (pdfBlob) {
            const url = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `custom_labels_${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showStatus(`Printed ${labels.length} labels successfully`, 'success');
        }
    } catch (error) {
        console.error('Print failed:', error);
        showStatus(`Print failed: ${error.message}`, 'error');
    }
    
    showLoading(false);
}

// Show sheet information
function showSheetInfo() {
    if (!window.labelSheetConfig) {
        showStatus('Config not loaded', 'error');
        return;
    }
    
    const info = `
        Label Sheet Information:
        - Label Size: ${window.labelSheetConfig.labelWidthMM}mm x ${window.labelSheetConfig.labelHeightMM}mm
        - Grid: ${window.labelSheetConfig.cols} columns x ${window.labelSheetConfig.rows} rows
        - Labels per page: ${window.labelSheetConfig.labelsPerPage}
        - Margins: Left=${window.labelSheetConfig.leftMarginMM}mm, Top=${window.labelSheetConfig.topMarginMM}mm
        - Gutter spacing: ${window.labelSheetConfig.gutterSpacingMM}mm
        - Print borders: ${window.labelSheetConfig.printBorders ? 'Yes' : 'No'}
        - Starting position: Row ${window.startRow}, Column ${window.startCol}
    `;
    
    alert(info);
}

// Refresh label sheet
function refreshLabelSheet() {
    loadLabelSheetConfig();
}

// Helper functions
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('custom-labels-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-message status-${type}`;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}

function showLoading(show) {
    const loadingEl = document.getElementById('custom-labels-loading');
    if (loadingEl) {
        loadingEl.style.display = show ? 'flex' : 'none';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
if (!window.customLabelsModule.initialized) {
    document.addEventListener('tabChanged', function(e) {
        if (e.detail && e.detail.tabName === 'custom-labels') {
            console.log('Custom labels tab activated');
            loadLabelSheetConfig();
        }
    });
    
    document.addEventListener('DOMContentLoaded', function() {
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'custom-labels-tab') {
            loadLabelSheetConfig();
        }
        
        // Initialize starting position inputs
        const startRowInput = document.getElementById('start-row');
        const startColInput = document.getElementById('start-col');
        
        if (startRowInput) {
            startRowInput.value = window.startRow;
            startRowInput.addEventListener('change', updateStartingPosition);
        }
        
        if (startColInput) {
            startColInput.value = window.startCol;
            startColInput.addEventListener('change', updateStartingPosition);
        }
    });
    
    window.customLabelsModule.initialized = true;
}

// Export functions
window.loadLabelSheetConfig = loadLabelSheetConfig;
window.renderLabelSheetGrid = renderLabelSheetGrid;
window.selectLabelPosition = selectLabelPosition;
window.addOrUpdateLabel = addOrUpdateLabel;
window.removeLabelFromPosition = removeLabelFromPosition;
window.clearAllLabels = clearAllLabels;
window.updateStartingPosition = updateStartingPosition;
window.showPrintConfirmation = showPrintConfirmation;
window.closePrintConfirmation = closePrintConfirmation;
window.confirmPrint = confirmPrint;
window.showSheetInfo = showSheetInfo;
window.refreshLabelSheet = refreshLabelSheet;
window.updateCustomLabelsQueueDisplay = updateCustomLabelsQueueDisplay;