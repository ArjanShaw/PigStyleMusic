// ============================================================================
// label-printer.js - Unified Label PDF Generator
// ============================================================================
// All config values are pulled from the database on demand.
// No hardcoded defaults. Each value is fetched when needed.
// NO try/catch anywhere — errors propagate and are visible in the console.
// Barcode value is explicitly parsed to an integer before being used.
// A single canvas is reused for every barcode render to avoid exhausting
// the browser's canvas backing-store limit over long print runs.
// The PDF is downloaded via doc.save() — not opened in a browser tab,
// which avoids the browser's data-URL size limit.

(function() {
    'use strict';

    console.log('🏷️ label-printer.js loading...');

    const API_BASE = window.location.hostname === 'localhost' ||
                     window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    // ========== CONFIG CACHE ==========
    let configCache = {};

    // ========== FETCH SINGLE CONFIG VALUE ==========
    async function fetchConfigValue(key) {
        if (configCache[key] !== undefined && configCache[key] !== null) {
            return configCache[key];
        }

        const response = await fetch(`${API_BASE}/config/${key}`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} while fetching config "${key}"`);
        }

        const data = await response.json();

        if (data.status !== 'success' || data.config_value === undefined || data.config_value === null) {
            throw new Error(`Config key "${key}" not found in database`);
        }

        configCache[key] = data.config_value;
        return configCache[key];
    }

    // ========== MAIN GENERATOR ==========
    async function generateLabelPDF(items, options) {
        if (!items || items.length === 0) {
            alert('No items to print.');
            return;
        }

        const mode = options?.mode || 'records';

        const jsPDF = window.jspdf.jsPDF;
        if (!jsPDF) {
            alert('jsPDF library not loaded.');
            return;
        }

        // ===== FETCH EACH CONFIG VALUE INDIVIDUALLY =====
        const labelWidthMm    = parseFloat(await fetchConfigValue('LABEL_WIDTH_MM'));
        const labelHeightMm   = parseFloat(await fetchConfigValue('LABEL_HEIGHT_MM'));
        const leftMarginMm    = parseFloat(await fetchConfigValue('LEFT_MARGIN_MM'));
        const gutterMm        = parseFloat(await fetchConfigValue('GUTTER_SPACING_MM'));
        const topMarginMm     = parseFloat(await fetchConfigValue('TOP_MARGIN_MM'));
        const priceFontSize   = parseInt(await fetchConfigValue('PRICE_FONT_SIZE'));
        const textFontSize    = parseInt(await fetchConfigValue('TEXT_FONT_SIZE'));
        const printBordersVal = await fetchConfigValue('PRINT_BORDERS');
        const priceYPosMm     = parseFloat(await fetchConfigValue('PRICE_Y_POS'));
        const barcodeYPosMm   = parseFloat(await fetchConfigValue('BARCODE_Y_POS'));
        const infoYPosMm      = parseFloat(await fetchConfigValue('INFO_Y_POS'));

        // ===== NaN GUARD =====
        const configValues = {
            LABEL_WIDTH_MM: labelWidthMm,
            LABEL_HEIGHT_MM: labelHeightMm,
            LEFT_MARGIN_MM: leftMarginMm,
            GUTTER_SPACING_MM: gutterMm,
            TOP_MARGIN_MM: topMarginMm,
            PRICE_FONT_SIZE: priceFontSize,
            TEXT_FONT_SIZE: textFontSize,
            PRICE_Y_POS: priceYPosMm,
            BARCODE_Y_POS: barcodeYPosMm,
            INFO_Y_POS: infoYPosMm
        };
        for (const [key, val] of Object.entries(configValues)) {
            if (Number.isNaN(val)) {
                alert(`Config "${key}" is not numeric (got NaN)`);
                return;
            }
        }

        const mmToPt = 2.83465;
        const labelWidth   = labelWidthMm  * mmToPt;
        const labelHeight  = labelHeightMm * mmToPt;
        const leftMargin   = leftMarginMm  * mmToPt;
        const gutter       = gutterMm      * mmToPt;
        const topMargin    = topMarginMm   * mmToPt;
        const priceYPos    = priceYPosMm   * mmToPt;
        const barcodeYPos  = barcodeYPosMm * mmToPt;
        const infoYPos     = infoYPosMm    * mmToPt;
        const printBorders = printBordersVal === 'true';

        const rows = 15;
        const cols = 4;
        const labelsPerPage = rows * cols;

        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'legal' });
        let currentLabel = 0;
        let pageNumber = 0;

        // ================================================================
        // SINGLE REUSABLE CANVAS — created once, reset before and after
        // each barcode render. Prevents the browser's per-page canvas
        // limit from being hit on long runs.
        // ================================================================
        const barcodeCanvas = document.createElement('canvas');

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const pageIndex = currentLabel % labelsPerPage;
            const pageNum   = Math.floor(currentLabel / labelsPerPage);

            if (pageNum > pageNumber) {
                doc.addPage();
                pageNumber = pageNum;
            }

            const row = Math.floor(pageIndex / cols);
            const col = pageIndex % cols;
            const x = leftMargin + col * (labelWidth + gutter);
            const y = topMargin + row * labelHeight;

            if (printBorders) {
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.rect(x, y, labelWidth, labelHeight);
            }

            if (mode === 'records') {
                const record = item;
                const artist = record.artist || 'Unknown';
                const title  = record.title  || '';
                const genre  = (record.discogs_genre_raw || '').split(',')[0].trim();

                let infoText = artist;
                if (title) infoText += ' - ' + title;
                if (genre) infoText = genre + ' | ' + infoText;

                doc.setFontSize(textFontSize);
                doc.setFont('helvetica', 'normal');
                let displayText = infoText;
                const maxWidth = labelWidth - 10;
                if (doc.getTextWidth(displayText) > maxWidth) {
                    while (doc.getTextWidth(displayText + '…') > maxWidth && displayText.length > 0) {
                        displayText = displayText.slice(0, -1);
                    }
                    displayText += '…';
                }
                const infoWidth = doc.getTextWidth(displayText);
                doc.text(displayText, x + (labelWidth - infoWidth) / 2, y + infoYPos);

                const priceText = '$' + (record.store_price || 0).toFixed(2);
                doc.setFontSize(priceFontSize);
                doc.setFont('helvetica', 'bold');
                const priceWidth = doc.getTextWidth(priceText);
                doc.text(priceText, x + (labelWidth - priceWidth) / 2, y + priceYPos);

                // ============================================================
                // BARCODE — value parsed to a positive integer
                // Canvas is reset before and after to release its bitmap.
                // ============================================================
                const parsedId = Number.parseInt(String(record.id), 10);

                if (Number.isInteger(parsedId) && parsedId > 0 && window.JsBarcode) {
                    // Reset any previous bitmap on the shared canvas
                    barcodeCanvas.width = 0;
                    barcodeCanvas.height = 0;

                    JsBarcode(barcodeCanvas, String(parsedId), {
                        format: 'CODE128',
                        displayValue: false,
                        height: 30,
                        width: 1.3,
                        margin: 0
                    });

                    const barcodeData = barcodeCanvas.toDataURL('image/png');
                    const maxBarcodeHeight = labelHeight * 0.33;
                    const barcodeWidth = 40;

                    doc.addImage(
                        barcodeData, 'PNG',
                        x + (labelWidth - barcodeWidth) / 2,
                        y + barcodeYPos,
                        barcodeWidth,
                        maxBarcodeHeight
                    );

                    // Release the bitmap immediately after use
                    barcodeCanvas.width = 0;
                    barcodeCanvas.height = 0;
                }

            } else {
                const line = typeof item === 'string' ? item.trim() : String(item).trim();
                if (!line) continue;

                if (line.startsWith('GC-') && window.JsBarcode) {
                    // Reset any previous bitmap on the shared canvas
                    barcodeCanvas.width = 0;
                    barcodeCanvas.height = 0;

                    JsBarcode(barcodeCanvas, line, {
                        format: 'CODE128',
                        width: 1.0,
                        height: 40,
                        displayValue: false,
                        fontSize: 0,
                        margin: 0,
                        background: '#ffffff'
                    });

                    const maxWidth = labelWidth - 6 * mmToPt;
                    const maxHeight = labelHeight * 0.33;

                    const canvasWidth = barcodeCanvas.width;
                    const canvasHeight = barcodeCanvas.height;

                    let imgWidth = maxWidth;
                    let imgHeight = (canvasHeight / canvasWidth) * imgWidth;
                    if (imgHeight > maxHeight) {
                        imgHeight = maxHeight;
                        imgWidth = (canvasWidth / canvasHeight) * imgHeight;
                    }

                    const imgX = x + (labelWidth - imgWidth) / 2;
                    const imgY = y + (labelHeight - imgHeight - 4 * mmToPt) / 2;

                    doc.addImage(barcodeCanvas.toDataURL('image/png'), 'PNG', imgX, imgY, imgWidth, imgHeight);

                    // Release the bitmap immediately after use
                    barcodeCanvas.width = 0;
                    barcodeCanvas.height = 0;

                    doc.setFontSize(6);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(50, 50, 50);
                    const textWidth = doc.getTextWidth(line);
                    const textX = x + (labelWidth - textWidth) / 2;
                    const textY = y + labelHeight - 2 * mmToPt;
                    doc.text(line, textX, textY);

                } else {
                    const parts = line.split('|').map(p => p.trim());
                    if (parts.length === 1) {
                        doc.setFontSize(10);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(0, 0, 0);
                        const textWidth = doc.getTextWidth(parts[0]);
                        const textX = x + (labelWidth - textWidth) / 2;
                        const textY = y + labelHeight / 2 + 3 * mmToPt;
                        doc.text(parts[0], textX, textY);
                    } else {
                        const lineHeight = 6 * mmToPt;
                        const totalLines = parts.length;
                        const startTextY = y + (labelHeight - (totalLines * lineHeight)) / 2 + 4 * mmToPt;
                        doc.setFontSize(8);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(0, 0, 0);
                        parts.forEach((part, idx) => {
                            const textWidth = doc.getTextWidth(part);
                            const textX = x + (labelWidth - textWidth) / 2;
                            const textY = startTextY + idx * lineHeight;
                            doc.text(part, textX, textY);
                        });
                    }
                }
            }

            currentLabel++;
        }

        // Release the canvas after the loop in case a final bitmap is still held
        barcodeCanvas.width = 0;
        barcodeCanvas.height = 0;

        // ============================================================
        // DOWNLOAD THE PDF — no browser tab, no data URL, no size limit
        // ============================================================
        doc.save('labels.pdf');

        console.log('📄 label-printer: PDF generated with ' + items.length + ' labels');
    }

    // ========== WRAPPER FUNCTIONS ==========
    async function generatePriceTags(records, options) {
        return generateLabelPDF(records, { mode: 'records', title: 'Price Tags', ...options });
    }

    async function generateCustomLabels(lines, options) {
        return generateLabelPDF(lines, { mode: 'lines', title: 'Custom Labels', ...options });
    }

    // ========== EXPOSE ==========
    window.LabelPrinter = {
        generateLabelPDF,
        generatePriceTags,
        generateCustomLabels
    };

    console.log('✅ label-printer.js loaded successfully');

})();