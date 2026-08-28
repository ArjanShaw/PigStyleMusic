// Custom Labels page
(function() {
    let startRow = 1;
    let startCol = 1;
    let currentLabels = [];

    const API_BASE = '';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // ===== FETCH A SINGLE CONFIG VALUE =====
    async function fetchConfigValue(key) {
        try {
            const response = await fetch(`${API_BASE}/config/${key}`, {
                credentials: 'include',
                headers: getHeaders()
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status !== 'success' || data.config_value === undefined || data.config_value === null) {
                throw new Error(`Config key "${key}" not found in database`);
            }
            
            return data.config_value;
        } catch (error) {
            throw new Error(`Failed to load config "${key}": ${error.message}`);
        }
    }

    // ===== UPDATE PREVIEW =====
    function updatePreview() {
        const textarea = document.getElementById('cl-label-text');
        const preview = document.getElementById('cl-preview');
        const count = document.getElementById('cl-preview-count');
        
        if (!textarea || !preview || !count) return;
        
        const lines = textarea.value.split('\n').filter(line => line.trim() !== '');
        currentLabels = lines;
        count.textContent = lines.length + ' labels';
        
        if (lines.length === 0) {
            preview.innerHTML = '<p style="text-align: center; padding: 20px; color: #999;">Enter labels above to see preview</p>';
            return;
        }
        
        const hasBarcodes = lines.some(line => line.trim().startsWith('GC-'));
        
        if (hasBarcodes) {
            let html = '';
            lines.forEach(line => {
                const trimmed = line.trim();
                const canvasId = 'cl-barcode-preview-' + Math.random().toString(36).substr(2, 9);
                html += `
                    <div style="background: white; border: 1px solid #ddd; padding: 4px 8px; margin-bottom: 4px; border-radius: 4px; display: flex; align-items: center; gap: 12px; font-size: 13px;">
                        <canvas id="${canvasId}" style="height: 30px; width: auto;"></canvas>
                        <span style="font-family: monospace; color: #333; font-weight: 500;">${escapeHtml(trimmed)}</span>
                    </div>
                `;
            });
            preview.innerHTML = html;
            
            const canvases = preview.querySelectorAll('canvas');
            lines.forEach((line, index) => {
                const canvas = canvases[index];
                if (canvas && window.JsBarcode) {
                    try {
                        JsBarcode(canvas, line.trim(), {
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
            preview.innerHTML = lines.map(line => {
                const parts = line.split('|').map(p => p.trim());
                return `<div style="background: white; border: 1px solid #ddd; padding: 6px 10px; margin-bottom: 4px; border-radius: 4px; font-size: 13px; color: #333;">${parts.join(' • ')}</div>`;
            }).join('');
        }
    }

    // ===== GENERATE PDF =====
    window.clGeneratePDF = async function() {
        const textarea = document.getElementById('cl-label-text');
        if (!textarea) return;
        
        const lines = textarea.value.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) {
            alert('Please enter at least one label before generating PDF.');
            return;
        }
        
        try {
            // ===== FETCH EACH CONFIG VALUE INDIVIDUALLY =====
            const labelWidthMm = parseFloat(await fetchConfigValue('LABEL_WIDTH_MM'));
            const labelHeightMm = parseFloat(await fetchConfigValue('LABEL_HEIGHT_MM'));
            const leftMarginMm = parseFloat(await fetchConfigValue('LEFT_MARGIN_MM'));
            const gutterMm = parseFloat(await fetchConfigValue('GUTTER_SPACING_MM'));
            const topMarginMm = parseFloat(await fetchConfigValue('TOP_MARGIN_MM'));
            const printBorders = await fetchConfigValue('PRINT_BORDERS');

            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                alert('jsPDF library not loaded. Please check your internet connection.');
                return;
            }
            
            const mmToPt = 2.83465;
            const labelWidth = labelWidthMm * mmToPt;
            const labelHeight = labelHeightMm * mmToPt;
            const leftMargin = leftMarginMm * mmToPt;
            const gutter = gutterMm * mmToPt;
            const topMargin = topMarginMm * mmToPt;
            const printBordersEnabled = printBorders === 'true';
            
            const cols = 4;
            const rows = 15;
            const labelsPerPage = cols * rows;
            
            const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'legal' });
            let currentLabel = 0;
            let pageNum = 0;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const pageIndex = currentLabel % labelsPerPage;
                const page = Math.floor(currentLabel / labelsPerPage);
                
                if (page > pageNum) {
                    doc.addPage();
                    pageNum = page;
                }
                
                const row = Math.floor(pageIndex / cols);
                const col = pageIndex % cols;
                const x = leftMargin + col * (labelWidth + gutter);
                const y = topMargin + row * labelHeight;
                
                if (printBordersEnabled) {
                    doc.setDrawColor(0);
                    doc.setLineWidth(0.5);
                    doc.rect(x, y, labelWidth, labelHeight);
                }
                
                if (line.startsWith('GC-')) {
                    try {
                        const canvas = document.createElement('canvas');
                        JsBarcode(canvas, line, {
                            format: 'CODE128',
                            width: 1.0,
                            height: 40,
                            displayValue: false,
                            fontSize: 0,
                            margin: 0
                        });
                        
                        const maxWidth = labelWidth - 6 * mmToPt;
                        const maxHeight = labelHeight * 0.33;
                        const imgWidth = Math.min(maxWidth, maxHeight * (canvas.width / canvas.height));
                        const imgHeight = imgWidth * (canvas.height / canvas.width);
                        const imgX = x + (labelWidth - imgWidth) / 2;
                        const imgY = y + (labelHeight - imgHeight - 4 * mmToPt) / 2;
                        
                        doc.addImage(canvas.toDataURL('image/png'), 'PNG', imgX, imgY, imgWidth, imgHeight);
                        
                        doc.setFontSize(6);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(50, 50, 50);
                        const textWidth = doc.getTextWidth(line);
                        const textX = x + (labelWidth - textWidth) / 2;
                        const textY = y + labelHeight - 2 * mmToPt;
                        doc.text(line, textX, textY);
                    } catch (e) {
                        doc.setFontSize(10);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(0, 0, 0);
                        const textWidth = doc.getTextWidth(line);
                        const textX = x + (labelWidth - textWidth) / 2;
                        const textY = y + labelHeight / 2 + 3 * mmToPt;
                        doc.text(line, textX, textY);
                    }
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
                
                currentLabel++;
            }
            
            const pdfBlob = doc.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
            
            showToast('✅ PDF generated successfully!');
            
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error generating PDF: ' + error.message);
        }
    };

    // ===== GENERATE GIFT CARD BARCODES =====
    window.clGenerateGiftCards = function() {
        const textarea = document.getElementById('cl-label-text');
        if (!textarea) return;
        
        const count = 60;
        const codes = [];
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        for (let i = 0; i < count; i++) {
            let code = 'GC-';
            for (let j = 0; j < 8; j++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            codes.push(code);
        }
        
        textarea.value = codes.join('\n');
        updatePreview();
        showToast('✅ 60 gift card barcodes generated!');
    };

    // ===== START POSITION =====
    window.clUpdateStart = function() {
        const rowInput = document.getElementById('cl-start-row');
        const colInput = document.getElementById('cl-start-col');
        const display = document.getElementById('cl-start-display');
        
        startRow = parseInt(rowInput.value) || 1;
        startCol = parseInt(colInput.value) || 1;
        
        if (startRow < 1) startRow = 1;
        if (startRow > 15) startRow = 15;
        if (startCol < 1) startCol = 1;
        if (startCol > 4) startCol = 4;
        
        rowInput.value = startRow;
        colInput.value = startCol;
        display.textContent = `Position: ${startRow}, ${startCol}`;
        
        try {
            localStorage.setItem('customLabelsStartPosition', JSON.stringify({ row: startRow, col: startCol }));
        } catch (e) {}
        
        showToast('✅ Start position updated');
    };

    function loadStartPosition() {
        try {
            const stored = localStorage.getItem('customLabelsStartPosition');
            if (stored) {
                const pos = JSON.parse(stored);
                if (pos.row && pos.col) {
                    document.getElementById('cl-start-row').value = pos.row;
                    document.getElementById('cl-start-col').value = pos.col;
                    clUpdateStart();
                    return;
                }
            }
        } catch (e) {}
        clUpdateStart();
    }

    // ===== CLEAR / SAMPLE =====
    window.clClearText = function() {
        const textarea = document.getElementById('cl-label-text');
        if (textarea) {
            textarea.value = '';
            updatePreview();
        }
    };

    window.clLoadSample = function() {
        const textarea = document.getElementById('cl-label-text');
        if (textarea) {
            textarea.value = 
                'Summer Sale 50% Off\n' +
                'New Arrivals|Vinyl Records\n' +
                'Store Credit Available\n' +
                'Buy One Get One Free|Limited Time\n' +
                'Clearance|All Sales Final\n' +
                'GC-A7F3K9M2\n' +
                'GC-8B4X7N5P\n' +
                'GC-C2D9F6E1';
            updatePreview();
            showToast('✅ Sample loaded!');
        }
    };

    // ===== TOAST =====
    function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            background: #28a745;
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 400px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===== INIT =====
    window.initCustomLabels = function() {
        console.log('Custom Labels initialized');
        loadStartPosition();
        
        const textarea = document.getElementById('cl-label-text');
        if (textarea) {
            textarea.addEventListener('input', updatePreview);
        }
        
        updatePreview();
    };
})();
