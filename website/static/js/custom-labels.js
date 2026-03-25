// ============================================================================
// custom-labels.js - Custom Label Placer with Direct Input Fields & Dynamic Font Sizing
// ============================================================================

window.customLabelsModule = window.customLabelsModule || {};

// State variables
window.customLabelsItems = window.customLabelsItems || [];
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
        
        // Initialize items array if empty
        if (!window.customLabelsItems || window.customLabelsItems.length === 0) {
            window.customLabelsItems = new Array(60).fill(null);
        }
        
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

// Calculate optimal font size for text in a given container
function calculateOptimalFontSize(text, containerWidth, containerHeight, minFontSize = 8, maxFontSize = 72) {
    if (!text || text.length === 0) return 14;
    
    // Create a temporary canvas to measure text width
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Binary search for optimal font size
    let low = minFontSize;
    let high = maxFontSize;
    let bestSize = minFontSize;
    
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        ctx.font = `bold ${mid}px sans-serif`;
        const textWidth = ctx.measureText(text).width;
        
        if (textWidth <= containerWidth && mid <= containerHeight) {
            bestSize = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    
    return Math.max(minFontSize, Math.min(maxFontSize, bestSize));
}

// Render the label sheet grid with direct input fields
function renderLabelSheetGrid() {
    const gridContainer = document.getElementById('label-sheet-grid');
    if (!gridContainer) {
        console.error('Grid container not found');
        return;
    }
    
    if (!window.labelSheetConfig) {
        console.log('No config yet, showing loading');
        gridContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;"><i class="fas fa-spinner fa-spin"></i><p>Loading configuration...</p></div>';
        return;
    }
    
    const { rows, cols, labelWidthMM, labelHeightMM } = window.labelSheetConfig;
    
    // Scale for display (pixels per mm)
    const scale = 3;
    const cellWidth = labelWidthMM * scale;
    const cellHeight = labelHeightMM * scale;
    
    gridContainer.innerHTML = '';
    gridContainer.style.display = 'grid';
    gridContainer.style.gridTemplateColumns = `repeat(${cols}, ${cellWidth}px)`;
    gridContainer.style.gap = '8px';
    gridContainer.style.justifyContent = 'center';
    gridContainer.style.background = '#e9ecef';
    gridContainer.style.padding = '20px';
    gridContainer.style.overflowX = 'auto';
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const labelIndex = row * cols + col;
            const labelItem = window.customLabelsItems[labelIndex];
            const text = labelItem ? labelItem.text : '';
            
            const cell = document.createElement('div');
            cell.className = 'label-sheet-cell';
            cell.style.width = `${cellWidth}px`;
            cell.style.height = `${cellHeight}px`;
            cell.style.border = window.labelSheetConfig.printBorders ? '2px solid #ccc' : '1px solid #ddd';
            cell.style.borderRadius = '4px';
            cell.style.background = text ? '#fff3cd' : 'white';
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            cell.style.position = 'relative';
            cell.style.padding = '4px';
            cell.style.boxSizing = 'border-box';
            cell.style.overflow = 'hidden';
            
            // Create input field
            const input = document.createElement('input');
            input.type = 'text';
            input.value = text;
            input.placeholder = `(${row + 1}, ${col + 1})`;
            input.style.width = '100%';
            input.style.height = '100%';
            input.style.border = 'none';
            input.style.background = 'transparent';
            input.style.textAlign = 'center';
            input.style.fontFamily = 'sans-serif';
            input.style.fontWeight = 'bold';
            input.style.padding = '0';
            input.style.margin = '0';
            input.style.outline = 'none';
            input.style.cursor = 'text';
            input.style.fontSize = '14px';
            input.style.color = text ? '#333' : '#999';
            
            // Set initial font size if there's text
            if (text) {
                const optimalSize = calculateOptimalFontSize(text, cellWidth - 8, cellHeight - 8);
                input.style.fontSize = `${optimalSize}px`;
                input.style.fontWeight = 'bold';
                input.style.color = '#333';
            }
            
            // Handle input changes
            input.addEventListener('input', function(e) {
                const newText = e.target.value;
                
                // Update storage
                if (newText && newText.trim()) {
                    window.customLabelsItems[labelIndex] = { text: newText };
                } else {
                    window.customLabelsItems[labelIndex] = null;
                }
                
                // Update cell background
                cell.style.background = (newText && newText.trim()) ? '#fff3cd' : 'white';
                
                // Recalculate font size dynamically as user types
                if (newText && newText.trim()) {
                    const newSize = calculateOptimalFontSize(newText, cellWidth - 8, cellHeight - 8);
                    input.style.fontSize = `${newSize}px`;
                    input.style.fontWeight = 'bold';
                    input.style.color = '#333';
                } else {
                    input.style.fontSize = '14px';
                    input.style.fontWeight = 'bold';
                    input.style.color = '#999';
                }
                
                // Update queue display
                updateCustomLabelsQueueDisplay();
            });
            
            // Handle blur to trim whitespace
            input.addEventListener('blur', function(e) {
                const trimmed = e.target.value.trim();
                if (trimmed !== e.target.value) {
                    e.target.value = trimmed;
                    if (trimmed) {
                        window.customLabelsItems[labelIndex] = { text: trimmed };
                        cell.style.background = '#fff3cd';
                        // Recalculate font size
                        const newSize = calculateOptimalFontSize(trimmed, cellWidth - 8, cellHeight - 8);
                        input.style.fontSize = `${newSize}px`;
                        input.style.fontWeight = 'bold';
                        input.style.color = '#333';
                    } else {
                        window.customLabelsItems[labelIndex] = null;
                        cell.style.background = 'white';
                        input.style.fontSize = '14px';
                        input.style.fontWeight = 'bold';
                        input.style.color = '#999';
                    }
                    updateCustomLabelsQueueDisplay();
                }
            });
            
            // Add click handler to ensure input gets focus
            cell.addEventListener('click', function(e) {
                e.stopPropagation();
                input.focus();
            });
            
            cell.appendChild(input);
            gridContainer.appendChild(cell);
        }
    }
    
    console.log(`Grid rendered: ${rows} rows x ${cols} cols = ${rows * cols} input fields`);
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

// Update queue display (shows only non-empty labels)
function updateCustomLabelsQueueDisplay() {
    const queueContent = document.getElementById('custom-labels-queue-content');
    const queueCount = document.getElementById('custom-labels-queue-count');
    const printQueueCount = document.getElementById('print-custom-queue-count');
    const printQueueBtn = document.getElementById('print-custom-queue-btn');
    
    if (!queueContent) return;
    
    const validLabels = [];
    for (let i = 0; i < window.customLabelsItems.length; i++) {
        if (window.customLabelsItems[i] && window.customLabelsItems[i].text) {
            validLabels.push({
                index: i,
                text: window.customLabelsItems[i].text,
                row: Math.floor(i / 4),
                col: i % 4
            });
        }
    }
    
    if (queueCount) queueCount.textContent = validLabels.length;
    if (printQueueCount) printQueueCount.textContent = validLabels.length;
    
    if (printQueueBtn) {
        printQueueBtn.disabled = validLabels.length === 0;
    }
    
    if (validLabels.length === 0) {
        queueContent.innerHTML = `
            <div class="queue-empty" style="text-align: center; padding: 40px; color: #999;">
                <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No labels placed on the sheet</p>
                <p style="font-size: 12px;">Click on any cell in the grid above and start typing</p>
            </div>
        `;
        return;
    }
    
    queueContent.innerHTML = '';
    
    validLabels.forEach((item, idx) => {
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
            <div class="queue-item-number" style="background: #6c757d; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${idx + 1}</div>
            <div class="queue-item-info" style="flex: 1;">
                <div class="queue-item-title" style="font-weight: 600; margin-bottom: 4px;">Position (${item.row + 1}, ${item.col + 1})</div>
                <div class="queue-item-details" style="font-size: 12px; color: #666;">
                    <span style="font-weight: bold;">${escapeHtml(item.text)}</span>
                </div>
            </div>
            <button class="queue-item-remove" onclick="clearLabelPosition(${item.index})" style="background: none; border: 1px solid #dc3545; color: #dc3545; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                <i class="fas fa-times"></i> Clear
            </button>
        `;
        
        queueContent.appendChild(queueItem);
    });
}

// Clear a specific label position
function clearLabelPosition(index) {
    if (index >= 0 && index < window.customLabelsItems.length) {
        window.customLabelsItems[index] = null;
        renderLabelSheetGrid();
        updateCustomLabelsQueueDisplay();
        showStatus('Label cleared', 'info');
    }
}

// Clear all labels
function clearAllLabels() {
    const hasLabels = window.customLabelsItems.some(item => item && item.text);
    if (!hasLabels) return;
    
    if (confirm('Are you sure you want to clear ALL labels from the sheet?')) {
        window.customLabelsItems = new Array(60).fill(null);
        renderLabelSheetGrid();
        updateCustomLabelsQueueDisplay();
        showStatus('All labels cleared', 'info');
    }
}

// Show print confirmation
function showPrintConfirmation() {
    const validLabels = [];
    for (let i = 0; i < window.customLabelsItems.length; i++) {
        if (window.customLabelsItems[i] && window.customLabelsItems[i].text) {
            validLabels.push({
                index: i,
                text: window.customLabelsItems[i].text,
                row: Math.floor(i / 4),
                col: i % 4
            });
        }
    }
    
    if (validLabels.length === 0) {
        showStatus('No labels to print', 'error');
        return;
    }
    
    const summaryList = document.getElementById('custom-print-summary-list');
    if (summaryList) {
        summaryList.innerHTML = '';
        
        validLabels.slice(0, 20).forEach((item, idx) => {
            const div = document.createElement('div');
            div.style.padding = '5px';
            div.style.borderBottom = '1px solid #eee';
            div.innerHTML = `${idx + 1}. Position (${item.row + 1},${item.col + 1}): <strong>${escapeHtml(item.text)}</strong>`;
            summaryList.appendChild(div);
        });
        
        if (validLabels.length > 20) {
            const more = document.createElement('div');
            more.style.padding = '5px';
            more.style.fontStyle = 'italic';
            more.style.color = '#666';
            more.textContent = `... and ${validLabels.length - 20} more`;
            summaryList.appendChild(more);
        }
    }
    
    const countEl = document.getElementById('custom-print-count');
    if (countEl) countEl.textContent = validLabels.length;
    
    const startPosEl = document.getElementById('custom-print-start-position');
    if (startPosEl) startPosEl.textContent = `(${window.startRow}, ${window.startCol})`;
    
    const modal = document.getElementById('custom-print-confirmation-modal');
    if (modal) modal.style.display = 'flex';
}

// Close print confirmation
function closePrintConfirmation() {
    const modal = document.getElementById('custom-print-confirmation-modal');
    if (modal) modal.style.display = 'none';
}

// Confirm and print
async function confirmPrint() {
    closePrintConfirmation();
    showLoading(true);
    
    try {
        // Build labels array with positions
        const labels = [];
        for (let i = 0; i < window.customLabelsItems.length; i++) {
            const item = window.customLabelsItems[i];
            if (item && item.text) {
                labels.push({
                    text: item.text,
                    position: i,
                    row: Math.floor(i / 4),
                    col: i % 4
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
    
    const validCount = window.customLabelsItems.filter(item => item && item.text).length;
    
    const info = `Label Sheet Information:
- Label Size: ${window.labelSheetConfig.labelWidthMM}mm x ${window.labelSheetConfig.labelHeightMM}mm
- Grid: ${window.labelSheetConfig.cols} columns x ${window.labelSheetConfig.rows} rows
- Labels per page: ${window.labelSheetConfig.labelsPerPage}
- Margins: Left=${window.labelSheetConfig.leftMarginMM}mm, Top=${window.labelSheetConfig.topMarginMM}mm
- Gutter spacing: ${window.labelSheetConfig.gutterSpacingMM}mm
- Print borders: ${window.labelSheetConfig.printBorders ? 'Yes' : 'No'}
- Starting position: Row ${window.startRow}, Column ${window.startCol}
- Labels with text: ${validCount} / ${window.labelSheetConfig.labelsPerPage}`;
    
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
window.updateStartingPosition = updateStartingPosition;
window.showPrintConfirmation = showPrintConfirmation;
window.closePrintConfirmation = closePrintConfirmation;
window.confirmPrint = confirmPrint;
window.showSheetInfo = showSheetInfo;
window.refreshLabelSheet = refreshLabelSheet;
window.updateCustomLabelsQueueDisplay = updateCustomLabelsQueueDisplay;
window.clearAllLabels = clearAllLabels;
window.clearLabelPosition = clearLabelPosition;