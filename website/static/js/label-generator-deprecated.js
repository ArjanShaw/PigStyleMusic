// ============================================================================
// label-generator.js - Shared PDF Label Generation Logic
// ============================================================================

window.labelGenerator = window.labelGenerator || {};

/**
 * Generate price tags PDF (maintains original functionality)
 * @param {Array} records - Array of record objects
 * @param {Object} consignorCache - Cache of consignor info
 * @param {Function} getConsignorInfo - Function to get consignor info
 * @returns {Promise<Blob>} PDF blob
 */
async function generatePriceTagsPDF(records, consignorCache, getConsignorInfo) {
    const { jsPDF } = window.jspdf;
    
    console.log('📄 Generating Price Tags PDF');
    console.log(`📊 Total records: ${records.length}`);
    
    // Get configuration values
    const config = await loadLabelConfig();
    
    // Create PDF with letter size
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter'
    });
    
    // Calculate layout (15 rows, 4 columns - fixed as per original)
    const rows = 15;
    const cols = 4;
    const labelsPerPage = rows * cols;
    
    let currentLabel = 0;
    
    for (const record of records) {
        if (!record) continue;
        if (record.status_id === 3) continue; // Skip sold
        
        // Add new page if needed
        if (currentLabel > 0 && currentLabel % labelsPerPage === 0) {
            doc.addPage();
        }
        
        // Calculate position
        const pageIndex = currentLabel % labelsPerPage;
        const row = Math.floor(pageIndex / cols);
        const col = pageIndex % cols;
        
        const x = config.leftMarginPt + (col * (config.labelWidthPt + config.gutterSpacingPt));
        const y = config.topMarginPt + (row * config.labelHeightPt);
        
        // Draw border if enabled
        if (config.printBorders) {
            doc.setDrawColor(0);
            doc.setLineWidth(0.5);
            doc.rect(x, y, config.labelWidthPt, config.labelHeightPt);
        }
        
        // Get consignor initials
        let consignorInitials = '';
        if (record.consignor_id) {
            const consignorInfo = await getConsignorInfo(record.consignor_id);
            consignorInitials = consignorInfo.initials || '';
        }
        
        // Print info text (genre | artist (initials))
        const artist = record.artist || 'Unknown';
        const genre = record.genre_name || record.genre || 'Unknown';
        const initialsText = consignorInitials ? ` (${consignorInitials})` : '';
        const infoText = `${genre} | ${artist}${initialsText}`;
        
        doc.setFontSize(config.textFontSize);
        doc.setFont('helvetica', 'normal');
        
        // Truncate if needed
        let displayText = infoText;
        const maxWidth = config.labelWidthPt - 10;
        if (doc.getTextWidth(displayText) > maxWidth) {
            while (doc.getTextWidth(displayText + '…') > maxWidth && displayText.length > 0) {
                displayText = displayText.slice(0, -1);
            }
            displayText += '…';
        }
        
        const infoWidth = doc.getTextWidth(displayText);
        const infoX = x + (config.labelWidthPt - infoWidth) / 2;
        const infoY = y + config.infoYPosPt;
        doc.text(displayText, infoX, infoY);
        
        // Print price
        const price = record.store_price || 0;
        const priceText = `$${price.toFixed(2)}`;
        doc.setFontSize(config.priceFontSize);
        doc.setFont('helvetica', 'bold');
        
        const priceWidth = doc.getTextWidth(priceText);
        const priceX = x + (config.labelWidthPt - priceWidth) / 2;
        const priceY = y + config.priceYPosPt;
        doc.text(priceText, priceX, priceY);
        
        // Print barcode
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
                const barcodeX = x + (config.labelWidthPt - barcodeWidth) / 2;
                const barcodeY = y + config.barcodeYPosPt;
                
                doc.addImage(barcodeData, 'PNG', barcodeX, barcodeY, barcodeWidth, config.barcodeHeightPt);
            } catch (barcodeError) {
                console.error('Error generating barcode:', barcodeError);
            }
        }
        
        currentLabel++;
    }
    
    return doc.output('blob');
}

/**
 * Generate custom text labels PDF with starting position
 * @param {Array} labels - Array of {text} objects
 * @param {Object} options - Options {startRow, startCol}
 * @returns {Promise<Blob>} PDF blob
 */
async function generateCustomLabelsPDF(labels, options = {}) {
    const { jsPDF } = window.jspdf;
    
    console.log('📄 Generating Custom Labels PDF');
    console.log(`📊 Total labels: ${labels.length}`);
    console.log(`📍 Starting position: Row ${options.startRow || 1}, Col ${options.startCol || 1}`);
    
    // Get configuration values
    const config = await loadLabelConfig();
    
    // Create PDF with letter size
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter'
    });
    
    // Calculate layout (15 rows, 4 columns - same as price tags)
    const rows = 15;
    const cols = 4;
    const labelsPerPage = rows * cols;
    
    // Starting position (1-indexed, convert to 0-indexed)
    const startRow = (options.startRow || 1) - 1;
    const startCol = (options.startCol || 1) - 1;
    
    // Calculate starting index
    let startIndex = (startRow * cols) + startCol;
    let currentLabel = 0;
    let pageNumber = 0;
    
    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        if (!label || !label.text) continue;
        
        // Calculate absolute position on sheet
        const absoluteIndex = startIndex + currentLabel;
        const pageIndex = absoluteIndex % labelsPerPage;
        const pageNum = Math.floor(absoluteIndex / labelsPerPage);
        
        // Add new page if needed
        if (pageNum > pageNumber) {
            doc.addPage();
            pageNumber = pageNum;
        }
        
        // Calculate row and column
        const row = Math.floor(pageIndex / cols);
        const col = pageIndex % cols;
        
        const x = config.leftMarginPt + (col * (config.labelWidthPt + config.gutterSpacingPt));
        const y = config.topMarginPt + (row * config.labelHeightPt);
        
        // Draw border if enabled
        if (config.printBorders) {
            doc.setDrawColor(0);
            doc.setLineWidth(0.5);
            doc.rect(x, y, config.labelWidthPt, config.labelHeightPt);
        }
        
        // Print text centered on the label
        const text = label.text;
        doc.setFontSize(config.textFontSize);
        doc.setFont('helvetica', 'normal');
        
        // Handle multiline text
        const maxWidth = config.labelWidthPt - 10;
        const lines = [];
        let currentLine = '';
        const words = text.split(' ');
        
        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (doc.getTextWidth(testLine) <= maxWidth) {
                currentLine = testLine;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) lines.push(currentLine);
        
        // Calculate vertical center
        const lineHeight = config.textFontSize + 2;
        const totalHeight = lines.length * lineHeight;
        const startY = y + (config.labelHeightPt - totalHeight) / 2;
        
        // Draw each line centered
        lines.forEach((line, idx) => {
            const textWidth = doc.getTextWidth(line);
            const textX = x + (config.labelWidthPt - textWidth) / 2;
            const textY = startY + (idx * lineHeight);
            doc.text(line, textX, textY);
        });
        
        currentLabel++;
    }
    
    console.log(`✅ Generated ${currentLabel} labels starting at position (${startRow + 1}, ${startCol + 1})`);
    
    return doc.output('blob');
}

/**
 * Load label configuration from database
 * @returns {Promise<Object>} Configuration object with pt values
 */
async function loadLabelConfig() {
    if (typeof window.getConfigValue !== 'function') {
        throw new Error('getConfigValue function not available');
    }
    
    const mmToPt = 2.83465;
    
    const config = {
        // Raw mm values
        labelWidthMM: parseFloat(await window.getConfigValue('LABEL_WIDTH_MM')),
        labelHeightMM: parseFloat(await window.getConfigValue('LABEL_HEIGHT_MM')),
        leftMarginMM: parseFloat(await window.getConfigValue('LEFT_MARGIN_MM')),
        gutterSpacingMM: parseFloat(await window.getConfigValue('GUTTER_SPACING_MM')),
        topMarginMM: parseFloat(await window.getConfigValue('TOP_MARGIN_MM')),
        priceFontSize: parseInt(await window.getConfigValue('PRICE_FONT_SIZE')),
        textFontSize: parseInt(await window.getConfigValue('TEXT_FONT_SIZE')),
        barcodeHeightMM: parseFloat(await window.getConfigValue('BARCODE_HEIGHT')),
        printBorders: (await window.getConfigValue('PRINT_BORDERS')) === 'true',
        priceYPosMM: parseFloat(await window.getConfigValue('PRICE_Y_POS')),
        barcodeYPosMM: parseFloat(await window.getConfigValue('BARCODE_Y_POS')),
        infoYPosMM: parseFloat(await window.getConfigValue('INFO_Y_POS'))
    };
    
    // Convert to points
    config.labelWidthPt = config.labelWidthMM * mmToPt;
    config.labelHeightPt = config.labelHeightMM * mmToPt;
    config.leftMarginPt = config.leftMarginMM * mmToPt;
    config.gutterSpacingPt = config.gutterSpacingMM * mmToPt;
    config.topMarginPt = config.topMarginMM * mmToPt;
    config.barcodeHeightPt = config.barcodeHeightMM * mmToPt;
    config.priceYPosPt = config.priceYPosMM * mmToPt;
    config.barcodeYPosPt = config.barcodeYPosMM * mmToPt;
    config.infoYPosPt = config.infoYPosMM * mmToPt;
    
    return config;
}

// Export functions
window.labelGenerator = {
    generatePriceTagsPDF,
    generateCustomLabelsPDF,
    loadLabelConfig
};