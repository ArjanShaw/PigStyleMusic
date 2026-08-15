// ============================================================================
// custom-labels.js - Custom Labels Management
// ============================================================================
// Uses the shared LabelPrinter module for PDF generation.
// No duplicate layout logic - everything is handled by label-printer.js.
// ============================================================================

(function() {
    'use strict';

    console.log('🏷️ custom-labels.js loading...');

    // ========== DOM Elements ==========
    const labelText = document.getElementById('custom-label-text');
    const labelPreview = document.getElementById('custom-label-preview');
    const previewCount = document.getElementById('custom-label-preview-count');
    const startRowInput = document.getElementById('custom-label-start-row');
    const startColInput = document.getElementById('custom-label-start-col');
    const startDisplay = document.getElementById('custom-label-start-display');

    // ========== State ==========
    let startRow = 1;
    let startCol = 1;

    // ========== Helper Functions ==========
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== Preview Update (with barcode support) ==========
    function updatePreview() {
        if (!labelText || !labelPreview || !previewCount) return;

        const lines = labelText.value.split('\n').filter(line => line.trim() !== '');
        previewCount.textContent = lines.length + ' labels';

        if (lines.length === 0) {
            labelPreview.innerHTML = '<p style="color:#666; text-align:center;">Enter labels above to see preview</p>';
            return;
        }

        // Check if any line starts with GC- (barcode indicator)
        const hasBarcodes = lines.some(line => line.trim().startsWith('GC-'));

        if (hasBarcodes) {
            // Render as barcodes with preview
            let html = '';
            lines.forEach(line => {
                const trimmed = line.trim();
                const canvasId = 'barcode-preview-' + Math.random().toString(36).substr(2, 9);
                html += `
                    <div class="barcode-preview-item" style="background:white; border:1px solid #ddd; padding:4px 8px; margin-bottom:4px; border-radius:4px; display:flex; align-items:center; gap:12px; font-size:13px;">
                        <canvas id="${canvasId}" style="height:30px; width:auto;"></canvas>
                        <span class="code-text" style="font-family:monospace; color:#333; font-weight:500;">${escapeHtml(trimmed)}</span>
                    </div>
                `;
            });
            labelPreview.innerHTML = html;

            // Render each barcode on its canvas
            const canvases = labelPreview.querySelectorAll('canvas');
            lines.forEach((line, index) => {
                const canvas = canvases[index];
                if (canvas && window.JsBarcode) {
                    try {
                        window.JsBarcode(canvas, line.trim(), {
                            format: 'CODE128',
                            width: 1.5,
                            height: 30,
                            displayValue: false,
                            fontSize: 0,
                            margin: 0
                        });
                    } catch (e) {
                        console.warn('Could not render barcode for', line, e);
                    }
                }
            });
        } else {
            // Render as text (original behavior)
            labelPreview.innerHTML = lines.map(line => {
                const parts = line.split('|').map(p => p.trim());
                return `<div style="background:white; border:1px solid #ddd; padding:8px; margin-bottom:5px; border-radius:4px; font-size:13px;">${parts.join(' • ')}</div>`;
            }).join('');
        }
    }

    // ========== Starting Position ==========
    function updateStartPosition() {
        startRow = parseInt(startRowInput.value) || 1;
        startCol = parseInt(startColInput.value) || 1;

        // Clamp values
        if (startRow < 1) startRow = 1;
        if (startRow > 15) startRow = 15;
        if (startCol < 1) startCol = 1;
        if (startCol > 4) startCol = 4;

        startRowInput.value = startRow;
        startColInput.value = startCol;

        if (startDisplay) {
            startDisplay.textContent = startRow + ', ' + startCol;
        }

        // Save to localStorage
        try {
            localStorage.setItem('customLabelsStartPosition', JSON.stringify({ row: startRow, col: startCol }));
        } catch (e) {
            console.warn('Could not save start position:', e);
        }
    }

    function loadStartPosition() {
        try {
            const stored = localStorage.getItem('customLabelsStartPosition');
            if (stored) {
                const pos = JSON.parse(stored);
                if (pos.row && pos.col) {
                    startRowInput.value = pos.row;
                    startColInput.value = pos.col;
                    updateStartPosition();
                    return;
                }
            }
        } catch (e) {
            console.warn('Could not load start position:', e);
        }
        // Defaults
        startRowInput.value = 1;
        startColInput.value = 1;
        updateStartPosition();
    }

    // ========== Generate PDF (using LabelPrinter) ==========
    async function generatePDF() {
        if (!labelText) {
            alert('Could not find custom label text area.');
            return;
        }

        const lines = labelText.value.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) {
            alert('Please enter at least one label before generating PDF.');
            return;
        }

        // Check if LabelPrinter is available
        if (!window.LabelPrinter) {
            alert('LabelPrinter module not loaded. Please refresh the page.');
            console.error('LabelPrinter not available');
            return;
        }

        try {
            // Pass the lines and options to the shared generator
            await window.LabelPrinter.generateCustomLabels(lines, {
                title: 'Custom Labels',
                saveFilename: `custom-labels-${new Date().toISOString().slice(0,10)}.pdf`
            });
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error generating PDF: ' + error.message);
        }
    }

    // ========== Clear Text ==========
    function clearText() {
        if (labelText) {
            labelText.value = '';
            updatePreview();
        }
    }

    // ========== Load Sample ==========
    function loadSample() {
        if (!labelText) return;
        labelText.value = 
            'Summer Sale 50% Off\n' +
            'New Arrivals|Vinyl Records\n' +
            'Store Credit Available\n' +
            'Buy One Get One Free|Limited Time\n' +
            'Clearance|All Sales Final\n' +
            'GC-A7F3K9M2\n' +
            'GC-8B4X7N5P\n' +
            'GC-C2D9F6E1';
        updatePreview();
    }

    // ========== Expose to Window ==========
    window.customLabelsGeneratePDF = generatePDF;
    window.customLabelsClearText = clearText;
    window.customLabelsLoadSample = loadSample;
    window.customLabelsUpdateStartPosition = updateStartPosition;

    // ========== Init ==========
    function init() {
        console.log('🏷️ custom-labels: Initializing...');

        // Load start position from storage
        loadStartPosition();

        // Set up event listeners
        if (labelText) {
            labelText.addEventListener('input', updatePreview);
        }

        if (startRowInput) {
            startRowInput.addEventListener('change', updateStartPosition);
        }

        if (startColInput) {
            startColInput.addEventListener('change', updateStartPosition);
        }

        // Initial preview update
        updatePreview();

        console.log('✅ custom-labels.js initialized');
    }

    // Auto-initialize if DOM is ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 100);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

    console.log('✅ custom-labels.js loaded successfully');

})();