// Custom Labels page
(function() {
    let startRow = 1;
    let startCol = 1;
    let currentLabels = [];

    const API_BASE = 'http://localhost:5000';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Update preview
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
        
        // Check for barcodes
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
            
            // Render barcodes
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

    // Generate PDF
    window.clGeneratePDF = async function() {
        const textarea = document.getElementById('cl-label-text');
        if (!textarea) return;
        
        const lines = textarea.value.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) {
            alert('Please enter at least one label before generating PDF.');
            return;
        }
        
        try {
            // Load config
            const config = await loadConfig();
            
            // Generate PDF using jsPDF
            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                alert('jsPDF library not loaded. Please check your internet connection.');
                return;
            }
            
            const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
            
            const labelWidth = parseFloat(config['LABEL_WIDTH_MM'] || 63.5) * 2.83465;
            const labelHeight = parseFloat(config['LABEL_HEIGHT_MM'] || 33.9) * 2.83465;
            const leftMargin = parseFloat(config['LEFT_MARGIN_MM'] || 11.1) * 2.83465;
            const gutter = parseFloat(config['GUTTER_SPACING_MM'] || 3.2) * 2.83465;
            const topMargin = parseFloat(config['TOP_MARGIN_MM'] || 12.7) * 2.83465;
            const printBorders = (config['PRINT_BORDERS'] || 'false') === 'true';
            
            const cols = 4;
            const rows = 15;
            const labelsPerPage = cols * rows;
            
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
                
                // Draw border
                if (printBorders) {
                    doc.setDrawColor(0);
                    doc.setLineWidth(0.5);
                    doc.rect(x, y, labelWidth, labelHeight);
                }
                
                // Check if barcode
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
                        
                        const maxWidth = labelWidth - 6 * 2.83465;
                        const maxHeight = labelHeight * 0.33;
                        const imgWidth = Math.min(maxWidth, maxHeight * (canvas.width / canvas.height));
                        const imgHeight = imgWidth * (canvas.height / canvas.width);
                        const imgX = x + (labelWidth - imgWidth) / 2;
                        const imgY = y + (labelHeight - imgHeight - 4 * 2.83465) / 2;
                        
                        doc.addImage(canvas.toDataURL('image/png'), 'PNG', imgX, imgY, imgWidth, imgHeight);
                        
                        // Human-readable text
                        doc.setFontSize(6);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(50, 50, 50);
                        const textWidth = doc.getTextWidth(line);
                        const textX = x + (labelWidth - textWidth) / 2;
                        const textY = y + labelHeight - 2 * 2.83465;
                        doc.text(line, textX, textY);
                    } catch (e) {
                        // Fallback to text
                        doc.setFontSize(10);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(0, 0, 0);
                        const textWidth = doc.getTextWidth(line);
                        const textX = x + (labelWidth - textWidth) / 2;
                        const textY = y + labelHeight / 2 + 3 * 2.83465;
                        doc.text(line, textX, textY);
                    }
                } else {
                    // Text label (multi-line support)
                    const parts = line.split('|').map(p => p.trim());
                    if (parts.length === 1) {
                        doc.setFontSize(10);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(0, 0, 0);
                        const textWidth = doc.getTextWidth(parts[0]);
                        const textX = x + (labelWidth - textWidth) / 2;
                        const textY = y + labelHeight / 2 + 3 * 2.83465;
                        doc.text(parts[0], textX, textY);
                    } else {
                        const lineHeight = 6 * 2.83465;
                        const totalLines = parts.length;
                        const startTextY = y + (labelHeight - (totalLines * lineHeight)) / 2 + 4 * 2.83465;
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
            
            // Open PDF
            const pdfBlob = doc.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
            
            showToast('✅ PDF generated successfully!');
            
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error generating PDF: ' + error.message);
        }
    };

    // Load config
    async function loadConfig() {
        const keys = [
            'LABEL_WIDTH_MM', 'LABEL_HEIGHT_MM', 'LEFT_MARGIN_MM',
            'GUTTER_SPACING_MM', 'TOP_MARGIN_MM', 'PRINT_BORDERS'
        ];
        
        const config = {};
        for (const key of keys) {
            try {
                const response = await fetch(`${API_BASE}/config/${key}`, {
                    credentials: 'include',
                    headers: getHeaders()
                });
                if (response.ok) {
                    const data = await response.json();
                    config[key] = data.config_value;
                }
            } catch (e) {
                console.warn('Could not load config key:', key, e);
            }
        }
        return config;
    }

    // Generate gift card barcodes
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

    // Update start position
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
        
        // Save to localStorage
        try {
            localStorage.setItem('customLabelsStartPosition', JSON.stringify({ row: startRow, col: startCol }));
        } catch (e) {}
        
        showToast('✅ Start position updated');
    };

    // Load start position
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

    // Clear text
    window.clClearText = function() {
        const textarea = document.getElementById('cl-label-text');
        if (textarea) {
            textarea.value = '';
            updatePreview();
        }
    };

    // Load sample
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

    // Toast notification
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

    // Init
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
