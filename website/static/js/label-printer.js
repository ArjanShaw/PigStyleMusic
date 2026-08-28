// ============================================================================
// label-printer.js - Unified Label PDF Generator
// ============================================================================
// Reuses the exact same layout, margins, grid, and config values as price tags.
// Supports:
//   - Price tags (record objects with artist, title, price, barcode, etc.)
//   - Custom text labels (lines with optional multi-line using |)
//   - Barcode labels (lines starting with GC- render as Code128 barcodes)
//
// Usage:
//   await generateLabelPDF(items, options)
//   where items = records[] or string[] (lines)
//   and options = { mode: 'records' | 'lines', title: 'Price Tags' | 'Custom Labels' }
// ============================================================================

(function() {
    'use strict';

    console.log('🏷️ label-printer.js loading...');

    // ========== CONFIG CACHE ==========
    let configCache = {};
    let configLoaded = false;

    async function loadConfig() {
        if (configLoaded && Object.keys(configCache).length > 0) {
            return configCache;
        }

        const keys = [
            'LABEL_WIDTH_MM', 'LABEL_HEIGHT_MM', 'LEFT_MARGIN_MM',
            'GUTTER_SPACING_MM', 'TOP_MARGIN_MM', 'PRICE_FONT_SIZE',
            'TEXT_FONT_SIZE', 'BARCODE_HEIGHT', 'PRINT_BORDERS',
            'PRICE_Y_POS', 'BARCODE_Y_POS', 'INFO_Y_POS'
        ];

        try {
            const results = await Promise.all(keys.map(async (key) => {
                try {
                    const response = await fetch('/config/' + key, {
                        credentials: 'include'
                    });
                    if (!response.ok) return null;
                    const data = await response.json();
                    return { key, value: data.config_value };
                } catch (e) {
                    console.warn('Could not load config key:', key, e);
                    return null;
                }
            }));

            results.forEach(item => {
                if (item && item.value !== undefined && item.value !== null) {
                    configCache[item.key] = item.value;
                }
            });

            // Set defaults for missing values
            const defaults = {
                'LABEL_WIDTH_MM': 63.5,
                'LABEL_HEIGHT_MM': 33.9,
                'LEFT_MARGIN_MM': 11.1,
                'GUTTER_SPACING_MM': 3.2,
                'TOP_MARGIN_MM': 12.7,
                'PRICE_FONT_SIZE': 12,
                'TEXT_FONT_SIZE': 8,
                'BARCODE_HEIGHT': 25,
                'PRINT_BORDERS': 'false',
                'PRICE_Y_POS': 16,
                'BARCODE_Y_POS': 10,
                'INFO_Y_POS': 22
            };

            for (const key in defaults) {
                if (!configCache[key]) {
                    configCache[key] = defaults[key];
                }
            }

            configLoaded = true;
            console.log('✅ label-printer: config loaded', configCache);
            return configCache;

        } catch (error) {
            console.error('❌ label-printer: error loading config', error);
            // Return defaults
            configCache = {
                'LABEL_WIDTH_MM': 63.5,
                'LABEL_HEIGHT_MM': 33.9,
                'LEFT_MARGIN_MM': 11.1,
                'GUTTER_SPACING_MM': 3.2,
                'TOP_MARGIN_MM': 12.7,
                'PRICE_FONT_SIZE': 12,
                'TEXT_FONT_SIZE': 8,
                'BARCODE_HEIGHT': 25,
                'PRINT_BORDERS': 'false',
                'PRICE_Y_POS': 16,
                'BARCODE_Y_POS': 10,
                'INFO_Y_POS': 22
            };
            configLoaded = true;
            return configCache;
        }
    }

    function getConfigValue(key, defaultValue) {
        if (configCache[key] !== undefined && configCache[key] !== null) {
            return configCache[key];
        }
        return defaultValue;
    }

    // ========== MAIN GENERATOR ==========

    /**
     * Generate a PDF with labels (price tags, custom text, or barcodes)
     * 
     * @param {Array} items - Array of record objects OR string lines
     * @param {Object} options - { mode: 'records' | 'lines', title: string, saveFilename: string }
     * @returns {Promise<void>}
     */
    async function generateLabelPDF(items, options) {
        if (!items || items.length === 0) {
            alert('No items to print.');
            return;
        }

        const mode = options?.mode || 'records';
        const title = options?.title || (mode === 'records' ? 'Price Tags' : 'Custom Labels');

        // Ensure config is loaded
        await loadConfig();

        const jsPDF = window.jspdf.jsPDF;
        if (!jsPDF) {
            alert('jsPDF library not loaded. Please check your internet connection.');
            return;
        }

        // ===== READ CONFIG =====
        const labelWidth = parseFloat(getConfigValue('LABEL_WIDTH_MM', 63.5));
        const labelHeight = parseFloat(getConfigValue('LABEL_HEIGHT_MM', 33.9));
        const leftMargin = parseFloat(getConfigValue('LEFT_MARGIN_MM', 11.1));
        const gutter = parseFloat(getConfigValue('GUTTER_SPACING_MM', 3.2));
        const topMargin = parseFloat(getConfigValue('TOP_MARGIN_MM', 12.7));
        const priceFontSize = parseInt(getConfigValue('PRICE_FONT_SIZE', 12));
        const textFontSize = parseInt(getConfigValue('TEXT_FONT_SIZE', 8));
        const barcodeHeight = parseFloat(getConfigValue('BARCODE_HEIGHT', 25));
        const printBorders = getConfigValue('PRINT_BORDERS', 'false') === 'true';
        const priceYPos = parseFloat(getConfigValue('PRICE_Y_POS', 16));
        const barcodeYPos = parseFloat(getConfigValue('BARCODE_Y_POS', 10));
        const infoYPos = parseFloat(getConfigValue('INFO_Y_POS', 22));

        // ===== PAPER SETUP =====
        const mmToPt = 2.83465;
        const labelWidthPt = labelWidth * mmToPt;
        const labelHeightPt = labelHeight * mmToPt;
        const leftMarginPt = leftMargin * mmToPt;
        const gutterPt = gutter * mmToPt;
        const topMarginPt = topMargin * mmToPt;

        const rows = 15;
        const cols = 4;
        const labelsPerPage = rows * cols;

        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
        let currentLabel = 0;
        let pageNumber = 0;

        // ===== PROCESS EACH ITEM =====
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const pageIndex = currentLabel % labelsPerPage;
            const pageNum = Math.floor(currentLabel / labelsPerPage);

            if (pageNum > pageNumber) {
                doc.addPage();
                pageNumber = pageNum;
            }

            const row = Math.floor(pageIndex / cols);
            const col = pageIndex % cols;
            const x = leftMarginPt + col * (labelWidthPt + gutterPt);
            const y = topMarginPt + row * labelHeightPt;

            // Draw border
            if (printBorders) {
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.rect(x, y, labelWidthPt, labelHeightPt);
            }

            if (mode === 'records') {
                // ===== PRICE TAG MODE (record object) =====
                const record = item;
                const artist = record.artist || 'Unknown';
                const title = record.title || '';
                const genre = (record.discogs_genre_raw || '').split(',')[0].trim();
                
                // Info text: genre | artist - title
                let infoText = artist;
                if (title) infoText += ' - ' + title;
                if (genre) infoText = genre + ' | ' + infoText;

                // Truncate to fit
                doc.setFontSize(textFontSize);
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
                doc.text(displayText, x + (labelWidthPt - infoWidth) / 2, y + infoYPos * mmToPt);

                // Price
                const priceText = '$' + (record.store_price || 0).toFixed(2);
                doc.setFontSize(priceFontSize);
                doc.setFont('helvetica', 'bold');
                const priceWidth = doc.getTextWidth(priceText);
                doc.text(priceText, x + (labelWidthPt - priceWidth) / 2, y + priceYPos * mmToPt);

                // Barcode
                const barcodeNum = record.barcode || record.id;
                if (barcodeNum && window.JsBarcode) {
                    try {
                        const canvas = document.createElement('canvas');
                        JsBarcode(canvas, barcodeNum.toString(), {
                            format: 'CODE128',
                            displayValue: false,
                            height: 30,
                            width: 1.3,
                            margin: 0
                        });
                        const barcodeData = canvas.toDataURL('image/png');
                        const maxBarcodeHeightPt = labelHeightPt * 0.33;
                        const barcodeWidthPt = 40;
                        doc.addImage(barcodeData, 'PNG', 
                            x + (labelWidthPt - barcodeWidthPt) / 2, 
                            y + barcodeYPos * mmToPt, 
                            barcodeWidthPt, 
                            maxBarcodeHeightPt
                        );
                    } catch (e) {
                        console.warn('Could not render barcode for', barcodeNum, e);
                    }
                }

            } else {
                // ===== LINE / BARCODE MODE =====
                const line = typeof item === 'string' ? item.trim() : String(item).trim();
                if (!line) continue;

                if (line.startsWith('GC-') && window.JsBarcode) {
                    try {
                        const canvas = document.createElement('canvas');
                        JsBarcode(canvas, line, {
                            format: 'CODE128',
                            width: 1.0,
                            height: 40,
                            displayValue: false,
                            fontSize: 0,
                            margin: 0,
                            background: '#ffffff'
                        });

                        const maxWidth = labelWidthPt - 6 * mmToPt;
                        const maxHeight = labelHeightPt * 0.33;

                        const canvasWidth = canvas.width;
                        const canvasHeight = canvas.height;

                        let imgWidth = maxWidth;
                        let imgHeight = (canvasHeight / canvasWidth) * imgWidth;
                        if (imgHeight > maxHeight) {
                            imgHeight = maxHeight;
                            imgWidth = (canvasWidth / canvasHeight) * imgHeight;
                        }

                        const imgX = x + (labelWidthPt - imgWidth) / 2;
                        const imgY = y + (labelHeightPt - imgHeight - 4 * mmToPt) / 2;

                        doc.addImage(canvas.toDataURL('image/png'), 'PNG', imgX, imgY, imgWidth, imgHeight);

                        doc.setFontSize(6);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(50, 50, 50);
                        const textWidth = doc.getTextWidth(line);
                        const textX = x + (labelWidthPt - textWidth) / 2;
                        const textY = y + labelHeightPt - 2 * mmToPt;
                        doc.text(line, textX, textY);

                    } catch (e) {
                        console.warn('Could not render barcode for', line, e);
                        doc.setFontSize(8);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(0, 0, 0);
                        const textWidth = doc.getTextWidth(line);
                        const textX = x + (labelWidthPt - textWidth) / 2;
                        const textY = y + labelHeightPt / 2 + 3 * mmToPt;
                        doc.text(line, textX, textY);
                    }
                } else {
                    const parts = line.split('|').map(p => p.trim());
                    if (parts.length === 1) {
                        doc.setFontSize(10);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(0, 0, 0);
                        const textWidth = doc.getTextWidth(parts[0]);
                        const textX = x + (labelWidthPt - textWidth) / 2;
                        const textY = y + labelHeightPt / 2 + 3 * mmToPt;
                        doc.text(parts[0], textX, textY);
                    } else {
                        const lineHeight = 6 * mmToPt;
                        const totalLines = parts.length;
                        const startTextY = y + (labelHeightPt - (totalLines * lineHeight)) / 2 + 4 * mmToPt;
                        doc.setFontSize(8);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(0, 0, 0);
                        parts.forEach((part, idx) => {
                            const textWidth = doc.getTextWidth(part);
                            const textX = x + (labelWidthPt - textWidth) / 2;
                            const textY = startTextY + idx * lineHeight;
                            doc.text(part, textX, textY);
                        });
                    }
                }
            }

            currentLabel++;
        }

        // ===== SAVE PDF =====
        doc.output('dataurlnewwindow');
        console.log('📄 label-printer: PDF generated with ' + items.length + ' labels');
    }

    // ========== WRAPPER FUNCTIONS ==========

    /**
     * Generate price tags from record objects
     */
    async function generatePriceTags(records, options) {
        return generateLabelPDF(records, { mode: 'records', title: 'Price Tags', ...options });
    }

    /**
     * Generate custom labels from text lines (with barcode support)
     */
    async function generateCustomLabels(lines, options) {
        return generateLabelPDF(lines, { mode: 'lines', title: 'Custom Labels', ...options });
    }

    // ========== EXPOSE ==========

    window.LabelPrinter = {
        generateLabelPDF,
        generatePriceTags,
        generateCustomLabels,
        loadConfig,
        getConfigValue
    };

    console.log('✅ label-printer.js loaded successfully');

})();
