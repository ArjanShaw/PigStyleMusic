// ============================================================================
// custom-labels.js - Custom Labels Module with Barcode Generation
// Reuses existing label printing infrastructure for consistent sizing
// ============================================================================

(function() {
    'use strict';

    console.log('🎨 Custom Labels Module Initialized');

    // ========== DOM Elements ==========
    const customLabelText = document.getElementById('custom-label-text');
    const customLabelPreview = document.getElementById('custom-label-preview');
    const customLabelPreviewCount = document.getElementById('custom-label-preview-count');
    const customLabelStartRow = document.getElementById('custom-label-start-row');
    const customLabelStartCol = document.getElementById('custom-label-start-col');
    const customLabelStartDisplay = document.getElementById('custom-label-start-display');

    // ========== State ==========
    let currentLabels = [];
    let startRow = 1;
    let startCol = 1;

    // ========== Initialize ==========
    function init() {
        console.log('🎨 Custom labels tab activated');

        // Load saved start position from localStorage
        try {
            const savedRow = localStorage.getItem('customLabelStartRow');
            const savedCol = localStorage.getItem('customLabelStartCol');
            if (savedRow) startRow = parseInt(savedRow);
            if (savedCol) startCol = parseInt(savedCol);
            if (customLabelStartRow) customLabelStartRow.value = startRow;
            if (customLabelStartCol) customLabelStartCol.value = startCol;
            if (customLabelStartDisplay) {
                customLabelStartDisplay.textContent = startRow + ', ' + startCol;
            }
        } catch (e) {
            console.warn('Could not load start position:', e);
        }

        // Load labels from localStorage
        try {
            const savedLabels = localStorage.getItem('customLabels');
            if (savedLabels) {
                currentLabels = JSON.parse(savedLabels);
                if (customLabelText) {
                    customLabelText.value = currentLabels.join('\n');
                }
                updatePreview();
            }
        } catch (e) {
            console.warn('Could not load custom labels:', e);
        }

        // Set up event listeners
        if (customLabelText) {
            customLabelText.addEventListener('input', function() {
                updatePreview();
                saveLabels();
            });
        }

        if (customLabelStartRow) {
            customLabelStartRow.addEventListener('change', function() {
                startRow = parseInt(this.value) || 1;
                localStorage.setItem('customLabelStartRow', startRow);
                if (customLabelStartDisplay) {
                    customLabelStartDisplay.textContent = startRow + ', ' + startCol;
                }
            });
        }

        if (customLabelStartCol) {
            customLabelStartCol.addEventListener('change', function() {
                startCol = parseInt(this.value) || 1;
                localStorage.setItem('customLabelStartCol', startCol);
                if (customLabelStartDisplay) {
                    customLabelStartDisplay.textContent = startRow + ', ' + startCol;
                }
            });
        }
    }

    // ========== Update Preview ==========
    function updatePreview() {
        if (!customLabelText || !customLabelPreview || !customLabelPreviewCount) return;

        const text = customLabelText.value;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        currentLabels = lines;

        // Update count
        customLabelPreviewCount.textContent = lines.length + ' labels';

        if (lines.length === 0) {
            customLabelPreview.innerHTML = '<p style="color: #666; text-align: center;">Enter labels above to see preview</p>';
            return;
        }

        let html = '';
        const maxLines = 5;
        const showCount = Math.min(lines.length, maxLines);

        for (let i = 0; i < showCount; i++) {
            const label = lines[i];
            const parts = label.split('|').map(p => p.trim());
            html += '<div style="display: inline-block; margin: 5px; padding: 15px; background: white; border: 1px solid #ddd; border-radius: 4px; min-width: 150px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">';
            parts.forEach(part => {
                html += '<div style="font-size: 14px; font-weight: 500; color: #333; margin: 2px 0;">' + escapeHtml(part) + '</div>';
            });
            html += '</div>';
        }

        if (lines.length > maxLines) {
            html += '<div style="display: inline-block; margin: 5px; padding: 15px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; min-width: 150px; text-align: center; color: #999;">+ ' + (lines.length - maxLines) + ' more</div>';
        }

        customLabelPreview.innerHTML = html;
    }

    // ========== Save Labels ==========
    function saveLabels() {
        try {
            localStorage.setItem('customLabels', JSON.stringify(currentLabels));
        } catch (e) {
            console.warn('Could not save custom labels:', e);
        }
    }

    // ========== Generate Custom Labels PDF (Reuses Price Tag Logic) ==========
    function customLabelsGeneratePDF() {
        const text = customLabelText ? customLabelText.value : '';
        const lines = text.split('\n').filter(line => line.trim() !== '');

        if (lines.length === 0) {
            alert('Please enter at least one label.');
            return;
        }

        // Reuse the same PDF generation as price tags
        generateLabelPDF(lines, 'custom');
    }

    // ========== Generate Barcodes PDF (Reuses Price Tag Logic) ==========
    function generateBarcodes() {
        console.log('🔢 generateBarcodes called');

        var countInput = document.getElementById('barcode-count');
        var formatSelect = document.getElementById('barcode-format');
        var statusEl = document.getElementById('barcode-status');

        if (!countInput || !formatSelect || !statusEl) {
            console.error('❌ Barcode elements not found in DOM');
            alert('Please refresh the page and try again.');
            return;
        }

        var count = parseInt(countInput.value) || 10;
        var format = formatSelect.value || 'avery5160';

        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(255,255,255,0.2)';
        statusEl.textContent = '⏳ Generating barcodes...';

        // Call the API to generate codes
        fetch(window.AppConfig.baseUrl + '/api/gift-card/print', {
            method: 'POST',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: count })
        })
        .then(function(response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response.json();
        })
        .then(function(data) {
            if (data.status === 'success') {
                statusEl.style.background = 'rgba(40,167,69,0.3)';
                statusEl.textContent = '✅ Generated ' + data.codes.length + ' barcodes. Generating PDF...';
                // Reuse the same label generation with barcode mode
                generateLabelPDF(data.codes, 'barcode');
                statusEl.textContent = '✅ ' + data.codes.length + ' barcodes printed successfully! No database records created.';
            } else {
                statusEl.style.background = 'rgba(255,0,0,0.2)';
                statusEl.textContent = '❌ Error: ' + (data.error || 'Failed to generate barcodes');
            }
        })
        .catch(function(error) {
            console.error('❌ Barcode generation error:', error);
            statusEl.style.background = 'rgba(255,0,0,0.2)';
            statusEl.textContent = '❌ Error: ' + error.message;
        });
    }

    // ========== Core Label Generation (Reused by both custom labels and barcodes) ==========
    function generateLabelPDF(items, mode) {
        console.log('📄 generateLabelPDF: ' + items.length + ' items, mode: ' + mode);

        // Make sure jsPDF is loaded
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
            console.error('❌ jsPDF not loaded');
            alert('Error: jsPDF library not loaded. Please refresh the page.');
            return;
        }

        // Get label configuration from API (same as price tags)
        Promise.all([
            getConfigValue('LABEL_WIDTH_MM'),
            getConfigValue('LABEL_HEIGHT_MM'),
            getConfigValue('LEFT_MARGIN_MM'),
            getConfigValue('GUTTER_SPACING_MM'),
            getConfigValue('TOP_MARGIN_MM'),
            getConfigValue('PRICE_FONT_SIZE'),
            getConfigValue('TEXT_FONT_SIZE'),
            getConfigValue('BARCODE_HEIGHT'),
            getConfigValue('PRINT_BORDERS'),
            getConfigValue('PRICE_Y_POS'),
            getConfigValue('BARCODE_Y_POS'),
            getConfigValue('INFO_Y_POS')
        ]).then(function(values) {
            var [
                labelWidthMM, labelHeightMM, leftMarginMM, gutterSpacingMM, topMarginMM,
                priceFontSize, textFontSize, barcodeHeightMM, printBorders,
                priceYPosMM, barcodeYPosMM, infoYPosMM
            ] = values;

            // Use defaults if config not available
            labelWidthMM = parseFloat(labelWidthMM) || 63.5;
            labelHeightMM = parseFloat(labelHeightMM) || 33.9;
            leftMarginMM = parseFloat(leftMarginMM) || 11.1;
            gutterSpacingMM = parseFloat(gutterSpacingMM) || 3.0;
            topMarginMM = parseFloat(topMarginMM) || 13.4;
            priceFontSize = parseInt(priceFontSize) || 24;
            textFontSize = parseInt(textFontSize) || 12;
            barcodeHeightMM = parseFloat(barcodeHeightMM) || 15.0;
            printBorders = printBorders === 'true';
            priceYPosMM = parseFloat(priceYPosMM) || 20.0;
            barcodeYPosMM = parseFloat(barcodeYPosMM) || 10.0;
            infoYPosMM = parseFloat(infoYPosMM) || 25.0;

            var mmToPt = 2.83465;
            var labelWidthPt = labelWidthMM * mmToPt;
            var labelHeightPt = labelHeightMM * mmToPt;
            var leftMarginPt = leftMarginMM * mmToPt;
            var gutterSpacingPt = gutterSpacingMM * mmToPt;
            var topMarginPt = topMarginMM * mmToPt;
            var barcodeHeightPt = barcodeHeightMM * mmToPt;

            var jsPDF = window.jspdf.jsPDF;
            var doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

            var rows = 15;
            var cols = 4;
            var labelsPerPage = rows * cols;
            var currentLabel = 0;
            var pageNumber = 0;

            // Get start position
            var startRowVal = parseInt(customLabelStartRow ? customLabelStartRow.value : 1) || 1;
            var startColVal = parseInt(customLabelStartCol ? customLabelStartCol.value : 1) || 1;
            var startIndex = ((startRowVal - 1) * cols) + (startColVal - 1);
            if (startIndex < 0) startIndex = 0;

            for (var i = 0; i < items.length; i++) {
                var globalIndex = startIndex + i;
                var pageIndex = globalIndex % labelsPerPage;
                var pageNum = Math.floor(globalIndex / labelsPerPage);

                if (pageNum > pageNumber) {
                    doc.addPage();
                    pageNumber = pageNum;
                }

                var row = Math.floor(pageIndex / cols);
                var col = pageIndex % cols;
                var x = leftMarginPt + col * (labelWidthPt + gutterSpacingPt);
                var y = topMarginPt + row * labelHeightPt;

                // Draw border (if enabled)
                if (printBorders) {
                    doc.setDrawColor(200);
                    doc.setLineWidth(0.5);
                    doc.rect(x, y, labelWidthPt, labelHeightPt);
                }

                if (mode === 'barcode') {
                    // BARCODE MODE - uses same layout as price tags
                    var code = items[i];

                    // Draw barcode
                    try {
                        if (typeof JsBarcode !== 'undefined') {
                            var canvas = document.createElement('canvas');
                            canvas.width = 400;
                            canvas.height = 120;

                            JsBarcode(canvas, code, {
                                format: 'CODE128',
                                displayValue: true,
                                font: 'monospace',
                                fontSize: 20,
                                textAlign: 'center',
                                textPosition: 'bottom',
                                textMargin: 5,
                                margin: 5,
                                width: 2,
                                height: 70
                            });

                            var barcodeData = canvas.toDataURL('image/png');
                            var barcodeWidth = labelWidthPt - 20;
                            var barcodeHeight = barcodeWidth * (120 / 400);
                            var barcodeX = x + (labelWidthPt - barcodeWidth) / 2;
                            var barcodeY = y + (labelHeightPt - barcodeHeight) / 2 - 5;

                            doc.addImage(barcodeData, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeight);
                        } else {
                            // Fallback: just show the code as text
                            doc.setFontSize(18);
                            doc.setFont('helvetica', 'bold');
                            doc.setTextColor(0);
                            doc.text(code, x + labelWidthPt / 2, y + labelHeightPt / 2, { align: 'center' });
                        }
                    } catch (e) {
                        console.warn('Barcode generation failed for ' + code + ':', e);
                        // Fallback text
                        doc.setFontSize(18);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(0);
                        doc.text(code, x + labelWidthPt / 2, y + labelHeightPt / 2, { align: 'center' });
                    }

                } else {
                    // CUSTOM LABEL MODE - multi-line text
                    var labelText = items[i];
                    var parts = labelText.split('|').map(function(p) { return p.trim(); });

                    if (parts.length === 1) {
                        // Single line - centered
                        doc.setFontSize(textFontSize);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(0);
                        var textWidth = doc.getTextWidth(parts[0]);
                        var textX = x + (labelWidthPt - textWidth) / 2;
                        doc.text(parts[0], textX, y + labelHeightPt / 2 + 4);
                    } else {
                        // Multiple lines - centered vertically and horizontally
                        var lineHeight = 18;
                        var totalLines = parts.length;
                        var startY = y + (labelHeightPt - (totalLines * lineHeight)) / 2 + 14;

                        doc.setFontSize(textFontSize);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(0);

                        for (var j = 0; j < parts.length; j++) {
                            var lineText = parts[j];
                            var textWidth2 = doc.getTextWidth(lineText);
                            var textX2 = x + (labelWidthPt - textWidth2) / 2;
                            var textY2 = startY + (j * lineHeight);
                            doc.text(lineText, textX2, textY2);
                        }
                    }
                }

                currentLabel++;
            }

            // Open PDF
            var pdfBlob = doc.output('blob');
            var pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');

            console.log('📄 PDF generated with ' + items.length + ' labels');
        }).catch(function(error) {
            console.error('Error generating PDF:', error);
            alert('Error generating PDF: ' + error.message);
        });
    }

    // ========== Get Config Value from API ==========
    function getConfigValue(key) {
        return new Promise(function(resolve) {
            // First check if it's already loaded
            if (window.dbConfigValues && window.dbConfigValues[key]) {
                resolve(window.dbConfigValues[key].value);
                return;
            }

            // Check localStorage
            try {
                var stored = localStorage.getItem('dbConfigValues');
                if (stored) {
                    var configs = JSON.parse(stored);
                    if (configs[key]) {
                        resolve(configs[key].value);
                        return;
                    }
                }
            } catch (e) {}

            // Fetch from API
            fetch(window.AppConfig.baseUrl + '/config/' + key, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            })
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function(data) {
                resolve(data.config_value);
            })
            .catch(function() {
                resolve(null);
            });
        });
    }

    // ========== Clear Text ==========
    function customLabelsClearText() {
        if (customLabelText) {
            customLabelText.value = '';
            currentLabels = [];
            updatePreview();
            saveLabels();
        }
    }

    // ========== Load Sample ==========
    function customLabelsLoadSample() {
        const sample = [
            'Summer Sale 50% Off',
            'New Arrivals|Vinyl Records',
            'Store Credit Available',
            'Buy One Get One Free|Limited Time',
            'Clearance|All Sales Final',
            'Gift Cards Available',
            'Trade-Ins Welcome|Ask Inside',
            'Limited Edition|Signed Copy',
            'Staff Pick|Recommended',
            'New Arrivals|Limited Stock'
        ];
        if (customLabelText) {
            customLabelText.value = sample.join('\n');
            currentLabels = sample;
            updatePreview();
            saveLabels();
        }
    }

    // ========== Update Start Position ==========
    function customLabelsUpdateStartPosition() {
        const row = parseInt(customLabelStartRow ? customLabelStartRow.value : 1) || 1;
        const col = parseInt(customLabelStartCol ? customLabelStartCol.value : 1) || 1;
        startRow = row;
        startCol = col;
        localStorage.setItem('customLabelStartRow', row);
        localStorage.setItem('customLabelStartCol', col);
        if (customLabelStartDisplay) {
            customLabelStartDisplay.textContent = row + ', ' + col;
        }
        console.log('📐 Start position updated to: Row ' + row + ', Column ' + col);
    }

    // ========== Helper: Escape HTML ==========
    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== Expose functions ==========
    window.customLabelsGeneratePDF = customLabelsGeneratePDF;
    window.customLabelsClearText = customLabelsClearText;
    window.customLabelsLoadSample = customLabelsLoadSample;
    window.customLabelsUpdateStartPosition = customLabelsUpdateStartPosition;
    window.generateBarcodes = generateBarcodes;

    // ========== Initialize ==========
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

    // Listen for tab activation to re-initialize
    document.addEventListener('tabChanged', function(e) {
        if (e.detail && e.detail.tab === 'custom-labels') {
            console.log('🎨 Custom labels tab activated');
            if (customLabelText && customLabelText.value) {
                updatePreview();
            }
        }
    });

    console.log('🎨 Custom Labels Module Loaded - generateBarcodes exposed');

})();