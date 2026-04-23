// ============================================================================
// custom-labels.js - Independent Custom Labels Module
// ALL function names are prefixed with "customLabels" to avoid conflicts
// Does NOT share any variables or functions with price-tags.js
// ============================================================================

// Module namespace - completely isolated
window.CustomLabelsModule = window.CustomLabelsModule || {};

// Private state variables (using unique names)
let customLabels_list = [];
let customLabels_startRow = 1;
let customLabels_startCol = 1;

// ============================================================================
// Helper Functions (unique names)
// ============================================================================

function customLabelsEscapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function customLabelsShowStatus(message, type = 'info') {
    let statusEl = document.getElementById('custom-labels-status-message');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'custom-labels-status-message';
        statusEl.className = 'status-message';
        const tabContent = document.getElementById('custom-labels-tab');
        if (tabContent) {
            tabContent.insertBefore(statusEl, tabContent.firstChild);
        }
    }
    
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    statusEl.innerHTML = `${icons[type] || 'ℹ️'} ${customLabelsEscapeHtml(message)}`;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        if (statusEl) statusEl.style.display = 'none';
    }, 5000);
}

function customLabelsShowLoading(show) {
    let loadingEl = document.getElementById('custom-labels-loading');
    if (!loadingEl && show) {
        loadingEl = document.createElement('div');
        loadingEl.id = 'custom-labels-loading';
        loadingEl.className = 'loading';
        loadingEl.innerHTML = '<div class="loading-spinner"></div><p>Generating PDF...</p>';
        loadingEl.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10000; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
        document.body.appendChild(loadingEl);
    }
    
    if (loadingEl) {
        loadingEl.style.display = show ? 'flex' : 'none';
    }
}

// ============================================================================
// Configuration Loading
// ============================================================================

async function customLabelsGetConfigValue(configKey) {
    try {
        const response = await fetch(`${AppConfig.baseUrl}/config/${configKey}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.config_value;
        }
    } catch (error) {
        console.error(`Error loading config ${configKey}:`, error);
    }
    
    const defaults = {
        'LABEL_WIDTH_MM': '101.6',
        'LABEL_HEIGHT_MM': '50.8',
        'LEFT_MARGIN_MM': '12.7',
        'GUTTER_SPACING_MM': '3.175',
        'TOP_MARGIN_MM': '12.7',
        'PRINT_BORDERS': 'true',
        'BARCODE_HEIGHT': '10'
    };
    
    return defaults[configKey] || null;
}

// ============================================================================
// Calculate Optimal Font Size
// ============================================================================

function customLabelsCalculateFontSize(text, maxWidthPt, maxHeightPt, lineCount, doc) {
    // Start with a large font size
    let fontSize = Math.min(72, maxHeightPt / (lineCount * 1.2));
    let minFontSize = 8;
    
    doc.setFont('helvetica', 'bold');
    
    // Binary search for the largest font that fits
    let bestSize = minFontSize;
    let low = minFontSize;
    let high = fontSize;
    
    for (let attempt = 0; attempt < 15; attempt++) {
        if (low > high) break;
        
        const testSize = (low + high) / 2;
        doc.setFontSize(testSize);
        
        // Check if all lines fit
        let allLinesFit = true;
        for (const line of text) {
            const lineWidth = doc.getTextWidth(line);
            if (lineWidth > maxWidthPt) {
                allLinesFit = false;
                break;
            }
        }
        
        const totalHeight = testSize * 1.2 * lineCount;
        if (allLinesFit && totalHeight <= maxHeightPt) {
            bestSize = testSize;
            low = testSize + 0.5;
        } else {
            high = testSize - 0.5;
        }
    }
    
    return Math.max(minFontSize, Math.min(72, bestSize));
}

// ============================================================================
// Start Position Management
// ============================================================================

function customLabelsUpdateStartPosition() {
    const rowInput = document.getElementById('custom-label-start-row');
    const colInput = document.getElementById('custom-label-start-col');
    
    if (rowInput) {
        let newRow = parseInt(rowInput.value);
        if (isNaN(newRow)) newRow = 1;
        newRow = Math.max(1, Math.min(15, newRow));
        customLabels_startRow = newRow;
        rowInput.value = newRow;
    }
    
    if (colInput) {
        let newCol = parseInt(colInput.value);
        if (isNaN(newCol)) newCol = 1;
        newCol = Math.max(1, Math.min(4, newCol));
        customLabels_startCol = newCol;
        colInput.value = newCol;
    }
    
    const displayEl = document.getElementById('custom-label-start-display');
    if (displayEl) {
        displayEl.textContent = `${customLabels_startRow}, ${customLabels_startCol}`;
    }
    
    customLabelsShowStatus(`Labels will start at position (${customLabels_startRow}, ${customLabels_startCol})`, 'info');
}

// ============================================================================
// Label Processing
// ============================================================================

function customLabelsParseInput() {
    const textarea = document.getElementById('custom-label-text');
    if (!textarea) return [];
    
    const rawText = textarea.value;
    const lines = rawText.split(/\r?\n/);
    
    const labels = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        
        const linesArray = trimmed.split('|').map(l => l.trim()).filter(l => l !== '');
        
        labels.push({
            raw: trimmed,
            lines: linesArray,
            lineCount: linesArray.length
        });
    }
    
    return labels;
}

function customLabelsUpdatePreview() {
    const labels = customLabelsParseInput();
    const previewDiv = document.getElementById('custom-label-preview');
    const countSpan = document.getElementById('custom-label-preview-count');
    
    if (countSpan) {
        countSpan.textContent = `${labels.length} label${labels.length !== 1 ? 's' : ''}`;
    }
    
    if (!previewDiv) return;
    
    if (labels.length === 0) {
        previewDiv.innerHTML = '<p style="color: #666; text-align: center;">Enter labels above to see preview</p>';
        return;
    }
    
    let previewHtml = '<div style="display: flex; flex-wrap: wrap; gap: 15px;">';
    
    labels.forEach((label, idx) => {
        previewHtml += `
            <div style="background: white; border: 1px solid #ddd; border-radius: 4px; padding: 10px; width: 200px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="font-size: 11px; color: #999; margin-bottom: 5px;">Label #${idx + 1}</div>
                <div style="text-align: center;">
                    ${label.lines.map(line => `<div style="font-size: 12px; padding: 2px 0;">${customLabelsEscapeHtml(line)}</div>`).join('')}
                </div>
            </div>
        `;
    });
    
    previewHtml += '</div>';
    previewDiv.innerHTML = previewHtml;
}

// ============================================================================
// PDF Generation with Dynamic Font Sizing
// ============================================================================

async function customLabelsGeneratePDF() {
    const labels = customLabelsParseInput();
    
    if (labels.length === 0) {
        customLabelsShowStatus('Please enter at least one label', 'error');
        return;
    }
    
    customLabelsShowLoading(true);
    
    try {
        const labelWidthMM = await customLabelsGetConfigValue('LABEL_WIDTH_MM');
        const labelHeightMM = await customLabelsGetConfigValue('LABEL_HEIGHT_MM');
        const leftMarginMM = await customLabelsGetConfigValue('LEFT_MARGIN_MM');
        const gutterSpacingMM = await customLabelsGetConfigValue('GUTTER_SPACING_MM');
        const topMarginMM = await customLabelsGetConfigValue('TOP_MARGIN_MM');
        const printBorders = await customLabelsGetConfigValue('PRINT_BORDERS');
        
        const { jsPDF } = window.jspdf;
        
        const mmToPt = 2.83465;
        const labelWidthPt = parseFloat(labelWidthMM) * mmToPt;
        const labelHeightPt = parseFloat(labelHeightMM) * mmToPt;
        const leftMarginPt = parseFloat(leftMarginMM) * mmToPt;
        const gutterSpacingPt = parseFloat(gutterSpacingMM) * mmToPt;
        const topMarginPt = parseFloat(topMarginMM) * mmToPt;
        
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'letter'
        });
        
        const rows = 15;
        const cols = 4;
        const labelsPerPage = rows * cols;
        
        const startIndex = ((customLabels_startRow - 1) * cols) + (customLabels_startCol - 1);
        let currentLabelIndex = 0;
        let pageNumber = 0;
        
        // Available area for text (with 10pt padding on each side)
        const textMaxWidth = labelWidthPt - 20;
        const textMaxHeight = labelHeightPt - 20;
        
        console.log(`📄 Custom Labels PDF Generation with Dynamic Font Sizing`);
        console.log(`📍 Starting at position: Row ${customLabels_startRow}, Col ${customLabels_startCol}`);
        console.log(`📊 Total labels: ${labels.length}`);
        console.log(`📏 Label size: ${labelWidthPt}pt x ${labelHeightPt}pt`);
        console.log(`📏 Text area: ${textMaxWidth}pt x ${textMaxHeight}pt`);
        
        for (let i = 0; i < labels.length; i++) {
            const label = labels[i];
            
            const absoluteIndex = startIndex + currentLabelIndex;
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
            
            // Calculate optimal font size for this label
            const optimalFontSize = customLabelsCalculateFontSize(
                label.lines, 
                textMaxWidth, 
                textMaxHeight, 
                label.lineCount, 
                doc
            );
            
            doc.setFontSize(optimalFontSize);
            doc.setFont('helvetica', 'bold');
            
            const lineHeight = optimalFontSize * 1.2;
            const totalTextHeight = label.lineCount * lineHeight;
            const startY = y + (labelHeightPt - totalTextHeight) / 2 + (lineHeight * 0.8);
            
            // Draw each line centered
            for (let lineIdx = 0; lineIdx < label.lines.length; lineIdx++) {
                const line = label.lines[lineIdx];
                const lineY = startY + (lineIdx * lineHeight);
                
                const textWidth = doc.getTextWidth(line);
                const textX = x + (labelWidthPt - textWidth) / 2;
                
                doc.text(line, textX, lineY);
            }
            
            console.log(`  Label ${i+1}: "${label.lines[0]}${label.lines.length > 1 ? '...' : ''}" - Font size: ${optimalFontSize.toFixed(1)}pt`);
            
            currentLabelIndex++;
        }
        
        console.log(`✅ Generated ${currentLabelIndex} custom labels`);
        
        const pdfBlob = doc.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `custom_labels_${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        customLabelsShowStatus(`PDF generated with ${currentLabelIndex} labels (dynamic font sizing)`, 'success');
        
    } catch (error) {
        console.error('Custom labels PDF generation failed:', error);
        customLabelsShowStatus(`PDF generation failed: ${error.message}`, 'error');
    } finally {
        customLabelsShowLoading(false);
    }
}

// ============================================================================
// UI Actions
// ============================================================================

function customLabelsClearText() {
    const textarea = document.getElementById('custom-label-text');
    if (textarea) {
        textarea.value = '';
        customLabelsUpdatePreview();
        customLabelsShowStatus('All labels cleared', 'info');
    }
}

function customLabelsLoadSample() {
    const textarea = document.getElementById('custom-label-text');
    if (textarea) {
        textarea.value = `SUMMER SALE!
50% OFF ALL RECORDS

NEW ARRIVALS
VINYL & CDS

STORE CREDIT
AVAILABLE HERE

BUY ONE GET ONE FREE
LIMITED TIME

CLEARANCE
ALL SALES FINAL

STAFF PICK
RECOMMENDED

GIFT CARDS
AVAILABLE

FREE SHIPPING
ON ORDERS OVER $50

RECORD STORE DAY
EXCLUSIVE RELEASES

TRADE-INS WELCOME
BRING YOUR RECORDS`;
        customLabelsUpdatePreview();
        customLabelsShowStatus('Sample labels loaded', 'success');
    }
}

// ============================================================================
// Event Listeners
// ============================================================================

function customLabelsInit() {
    console.log('🎨 Custom Labels Module Initialized');
    
    const textarea = document.getElementById('custom-label-text');
    if (textarea) {
        textarea.addEventListener('input', customLabelsUpdatePreview);
    }
    
    customLabelsUpdateStartPosition();
    customLabelsUpdatePreview();
}

// ============================================================================
// Tab Activation Handler
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'custom-labels') {
        console.log('🎨 Custom labels tab activated');
        setTimeout(customLabelsInit, 100);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const customLabelsTab = document.querySelector('.tab[data-tab="custom-labels"]');
    if (customLabelsTab && customLabelsTab.classList.contains('active')) {
        setTimeout(customLabelsInit, 200);
    }
});

// Export functions for use in HTML
window.customLabelsUpdateStartPosition = customLabelsUpdateStartPosition;
window.customLabelsGeneratePDF = customLabelsGeneratePDF;
window.customLabelsClearText = customLabelsClearText;
window.customLabelsLoadSample = customLabelsLoadSample;

console.log('✅ custom-labels.js loaded - Dynamic font sizing enabled');