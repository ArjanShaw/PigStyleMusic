// ============================================================================
// receipts.js - Receipts Tab Functionality
// ============================================================================

// Load saved receipts from localStorage
function loadSavedReceipts() {
    const saved = localStorage.getItem('pigstyle_receipts');
    if (saved) {
        try {
            savedReceipts = JSON.parse(saved);
            savedReceipts.forEach(receipt => {
                receipt.date = new Date(receipt.date);
            });
        } catch (e) {
            console.error('Error loading receipts:', e);
            savedReceipts = [];
        }
    }
    return savedReceipts;
}

// Save a receipt to localStorage
function saveReceipt(transaction) {
    const receiptToSave = {
        ...transaction,
        date: transaction.date.toISOString()
    };
    
    savedReceipts.unshift(receiptToSave);
    
    if (savedReceipts.length > 1000) {
        savedReceipts = savedReceipts.slice(0, 1000);
    }
    
    localStorage.setItem('pigstyle_receipts', JSON.stringify(savedReceipts));
    
    if (document.getElementById('receipts-tab').classList.contains('active')) {
        renderReceipts(savedReceipts);
    }
}

// Render receipts in the receipts tab
function renderReceipts(receipts) {
    const container = document.getElementById('receipts-grid');
    
    if (receipts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666; grid-column: 1/-1;">
                <i class="fas fa-receipt" style="font-size: 48px; margin-bottom: 20px; color: #ccc;"></i>
                <p>No receipts found</p>
            </div>
        `;
        
        document.getElementById('total-receipts').textContent = '0';
        document.getElementById('total-receipts-sales').textContent = '$0.00';
        document.getElementById('total-receipts-tax').textContent = '$0.00';
        document.getElementById('total-receipts-items').textContent = '0';
        return;
    }
    
    let html = '';
    let totalSales = 0;
    let totalTax = 0;
    let totalItems = 0;
    
    receipts.forEach(receipt => {
        const date = new Date(receipt.date);
        const dateStr = date.toLocaleDateString() + ' ' + 
                       date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const itemCount = receipt.items.length;
        const itemSummary = itemCount === 1 ? 
            (receipt.items[0].type === 'accessory' ? receipt.items[0].description : 
             receipt.items[0].type === 'custom' ? receipt.items[0].note :
             receipt.items[0].artist + ' - ' + receipt.items[0].title) : 
            `${itemCount} items`;
        
        totalSales += receipt.total || 0;
        totalTax += receipt.tax || 0;
        totalItems += itemCount;
        
        html += `
            <div class="receipt-card" onclick="viewReceipt('${receipt.id}')">
                <div class="receipt-card-header">
                    <span class="receipt-card-title">${receipt.id}</span>
                    <span class="receipt-card-date">${dateStr}</span>
                </div>
                <div class="receipt-card-meta">
                    <span>Items: ${itemCount}</span>
                    <span class="receipt-card-total">$${(receipt.total || 0).toFixed(2)}</span>
                </div>
                <div class="receipt-card-items" title="${itemSummary}">
                    <i class="fas fa-music"></i> ${itemSummary}
                </div>
                <div class="receipt-card-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-primary" onclick="viewReceipt('${receipt.id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-sm btn-success" onclick="downloadReceiptPDF('${receipt.id}')">
                        <i class="fas fa-download"></i> PDF
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="printReceipt('${receipt.id}')">
                        <i class="fas fa-print"></i> Print
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    document.getElementById('total-receipts').textContent = receipts.length;
    document.getElementById('total-receipts-sales').textContent = `$${totalSales.toFixed(2)}`;
    document.getElementById('total-receipts-tax').textContent = `$${totalTax.toFixed(2)}`;
    document.getElementById('total-receipts-items').textContent = totalItems;
}

// Search receipts
function searchReceipts() {
    const startDate = document.getElementById('receipt-start-date').value;
    const endDate = document.getElementById('receipt-end-date').value;
    const query = document.getElementById('receipt-search-query').value.toLowerCase().trim();
    
    let filtered = [...savedReceipts];
    
    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filtered = filtered.filter(r => new Date(r.date) >= start);
    }
    
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter(r => new Date(r.date) <= end);
    }
    
    if (query) {
        filtered = filtered.filter(r => 
            r.id.toLowerCase().includes(query) ||
            r.items.some(item => 
                (item.artist && item.artist.toLowerCase().includes(query)) ||
                (item.title && item.title.toLowerCase().includes(query)) ||
                (item.catalog_number && item.catalog_number.toLowerCase().includes(query)) ||
                (item.description && item.description.toLowerCase().includes(query)) ||
                (item.note && item.note.toLowerCase().includes(query))
            )
        );
    }
    
    renderReceipts(filtered);
}

// Reset receipt search
function resetReceiptSearch() {
    document.getElementById('receipt-start-date').value = '';
    document.getElementById('receipt-end-date').value = '';
    document.getElementById('receipt-search-query').value = '';
    renderReceipts(savedReceipts);
}

// View a specific receipt
function viewReceipt(receiptId) {
    const receipt = savedReceipts.find(r => r.id === receiptId);
    if (receipt) {
        if (typeof receipt.date === 'string') {
            receipt.date = new Date(receipt.date);
        }
        showReceipt(receipt);
    }
}

// Download receipt as PDF
async function downloadReceiptPDF(receiptId) {
    const receipt = savedReceipts.find(r => r.id === receiptId);
    if (!receipt) return;
    
    if (typeof receipt.date === 'string') {
        receipt.date = new Date(receipt.date);
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const dateStr = receipt.date.toLocaleDateString() + ' ' + 
                   receipt.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    let y = 20;
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(receipt.storeName || (dbConfigValues['STORE_NAME'] && dbConfigValues['STORE_NAME'].value) || 'PigStyle Music', 105, y, { align: 'center' });
    
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(receipt.storeAddress || (dbConfigValues['STORE_ADDRESS'] && dbConfigValues['STORE_ADDRESS'].value) || '', 105, y, { align: 'center' });
    
    y += 5;
    doc.text(receipt.storePhone || (dbConfigValues['STORE_PHONE'] && dbConfigValues['STORE_PHONE'].value) || '', 105, y, { align: 'center' });
    
    y += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RECEIPT', 105, y, { align: 'center' });
    
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Receipt #: ${receipt.id}`, 20, y);
    doc.text(`Date: ${dateStr}`, 20, y + 5);
    
    y += 15;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Item', 20, y);
    doc.text('Price', 180, y, { align: 'right' });
    doc.line(20, y + 2, 190, y + 2);
    
    y += 7;
    doc.setFont('helvetica', 'normal');
    
    receipt.items.forEach((item, index) => {
        let desc;
        if (item.type === 'accessory') {
            desc = `[ACCESSORY] ${item.description || 'Unknown'}`;
        } else if (item.type === 'custom') {
            desc = `[CUSTOM] ${item.note || 'Custom Item'}`;
        } else {
            desc = `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`;
        }
        const price = `$${(item.store_price || 0).toFixed(2)}`;
        
        if (desc.length > 40) {
            doc.text(desc.substring(0, 37) + '...', 20, y);
        } else {
            doc.text(desc, 20, y);
        }
        doc.text(price, 180, y, { align: 'right' });
        
        y += 5;
        
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
    });
    
    y += 5;
    doc.line(20, y, 190, y);
    y += 5;
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Subtotal: $${(receipt.subtotal || 0).toFixed(2)}`, 180, y, { align: 'right' });
    y += 5;
    doc.text(`Tax (${receipt.taxRate || (dbConfigValues['TAX_RATE'] && dbConfigValues['TAX_RATE'].value) || 0}%): $${(receipt.tax || 0).toFixed(2)}`, 180, y, { align: 'right' });
    y += 5;
    doc.setFontSize(11);
    doc.text(`TOTAL: $${(receipt.total || 0).toFixed(2)}`, 180, y, { align: 'right' });
    
    y += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Payment Method: ${receipt.paymentMethod || 'Cash'}`, 20, y);
    y += 5;
    doc.text(`Tendered: $${(receipt.tendered || 0).toFixed(2)}`, 20, y);
    y += 5;
    doc.text(`Change: $${(receipt.change || 0).toFixed(2)}`, 20, y);
    
    y += 10;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text(receipt.footer || (dbConfigValues['RECEIPT_FOOTER'] && dbConfigValues['RECEIPT_FOOTER'].value) || 'Thank you for your purchase!', 105, y, { align: 'center' });
    
    doc.save(`${receipt.id}.pdf`);
}

// Print receipt
function printReceipt(receiptId) {
    const receipt = savedReceipts.find(r => r.id === receiptId);
    if (receipt) {
        if (typeof receipt.date === 'string') {
            receipt.date = new Date(receipt.date);
        }
        showReceipt(receipt);
        setTimeout(() => {
            window.print();
        }, 500);
    }
}

// Show receipt in modal
function showReceipt(transaction) {
    const receiptContent = document.getElementById('receipt-content');
    const dateStr = transaction.date.toLocaleDateString() + ' ' + 
                   transaction.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    let itemsHtml = '';
    transaction.items.forEach(item => {
        if (item.type === 'accessory') {
            itemsHtml += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <div><span class="accessory-badge" style="background: #9b59b6; color: white; padding: 2px 6px; border-radius: 4px; margin-right: 5px;">ACC</span> ${escapeHtml(item.description) || 'Unknown Accessory'}</div>
                    <div>$${(item.store_price || 0).toFixed(2)}</div>
                </div>
            `;
        } else if (item.type === 'custom') {
            itemsHtml += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <div><span class="accessory-badge" style="background: #ffd700; color: #333; padding: 2px 6px; border-radius: 4px; margin-right: 5px;">CUSTOM</span> ${escapeHtml(item.note) || 'Custom Item'}</div>
                    <div>$${(item.store_price || 0).toFixed(2)}</div>
                </div>
            `;
        } else {
            itemsHtml += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <div>${escapeHtml(item.artist) || 'Unknown'} - ${escapeHtml(item.title) || 'Unknown'}</div>
                    <div>$${(item.store_price || 0).toFixed(2)}</div>
                </div>
            `;
        }
    });
    
    receiptContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h2>${escapeHtml(transaction.storeName) || (dbConfigValues['STORE_NAME'] && dbConfigValues['STORE_NAME'].value) || 'PigStyle Music'}</h2>
            <p>${escapeHtml(transaction.storeAddress) || (dbConfigValues['STORE_ADDRESS'] && dbConfigValues['STORE_ADDRESS'].value) || ''}</p>
            <p>${escapeHtml(transaction.storePhone) || (dbConfigValues['STORE_PHONE'] && dbConfigValues['STORE_PHONE'].value) || ''}</p>
        </div>
        
        <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between;">
                <span><strong>Receipt #:</strong> ${escapeHtml(transaction.id)}</span>
                <span><strong>Date:</strong> ${dateStr}</span>
            </div>
            <div><strong>Cashier:</strong> ${escapeHtml(transaction.cashier) || 'Admin'}</div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h3>Items</h3>
            ${itemsHtml}
        </div>
        
        <div style="border-top: 1px solid #ccc; padding-top: 10px;">
            <div style="display: flex; justify-content: space-between;">
                <span>Subtotal:</span>
                <span>$${(transaction.subtotal || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Tax (${transaction.taxRate || (dbConfigValues['TAX_RATE'] && dbConfigValues['TAX_RATE'].value) || 0}%):</span>
                <span>$${(transaction.tax || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; margin-top: 10px;">
                <span>TOTAL:</span>
                <span>$${(transaction.total || 0).toFixed(2)}</span>
            </div>
        </div>
        
        <div style="margin-top: 20px;">
            <div><strong>Payment Method:</strong> ${escapeHtml(transaction.paymentMethod) || 'Cash'}</div>
            ${transaction.tendered ? `<div><strong>Tendered:</strong> $${transaction.tendered.toFixed(2)}</div>` : ''}
            ${transaction.change ? `<div><strong>Change:</strong> $${transaction.change.toFixed(2)}</div>` : ''}
        </div>
        
        <div style="text-align: center; margin-top: 30px; font-style: italic;">
            ${escapeHtml(transaction.footer) || (dbConfigValues['RECEIPT_FOOTER'] && dbConfigValues['RECEIPT_FOOTER'].value) || 'Thank you for your purchase!'}
        </div>
    `;
    
    document.getElementById('receipt-modal').style.display = 'flex';
}

// Close receipt modal
function closeReceiptModal() {
    document.getElementById('receipt-modal').style.display = 'none';
}

// Function to send text directly to thermal printer
async function printToThermalPrinter(text) {
    try {
        const baseUrl = window.AppConfig ? AppConfig.baseUrl : 'http://localhost:5000';
        const url = `${baseUrl}/print-receipt`;
        
        console.log('Sending print job to:', url);
        console.log('Text length:', text.length);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                printer: '/dev/usb/lp2',
                data: text
            })
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Print failed:', errorText);
        } else {
            const result = await response.json();
            console.log('Print job sent successfully:', result);
        }
    } catch (error) {
        console.error('Error printing:', error);
    }
}

// Function to format receipt for thermal printer
function formatReceiptForPrinter(transaction) {
    const storeName = transaction.storeName || 'PigStyle Music';
    const storeAddress = transaction.storeAddress || '';
    const storePhone = transaction.storePhone || '';
    const dateStr = transaction.date.toLocaleString();
    
    let receipt = [];
    
    receipt.push('\x1B\x40');
    receipt.push('\x1B\x61\x01');
    receipt.push(storeName + '\n');
    if (storeAddress) receipt.push(storeAddress + '\n');
    if (storePhone) receipt.push(storePhone + '\n');
    receipt.push(''.padEnd(32, '-') + '\n');
    
    receipt.push('\x1B\x61\x00');
    receipt.push(`Receipt #: ${transaction.id}\n`);
    receipt.push(`Date: ${dateStr}\n`);
    receipt.push(`Cashier: ${transaction.cashier || 'Admin'}\n`);
    receipt.push(''.padEnd(32, '-') + '\n');
    
    receipt.push('\x1B\x45\x01');
    receipt.push('Item'.padEnd(24) + 'Price\n');
    receipt.push('\x1B\x45\x00');
    receipt.push(''.padEnd(32, '-') + '\n');
    
    transaction.items.forEach(item => {
        let line;
        if (item.type === 'accessory') {
            const desc = (item.description || '').substring(0, 18);
            line = `[ACC] ${desc}`.padEnd(24) + `$${item.store_price.toFixed(2)}`.padStart(8) + '\n';
        } else if (item.type === 'custom') {
            const desc = (item.note || 'Custom Item').substring(0, 18);
            line = `[CUSTOM] ${desc}`.padEnd(24) + `$${item.store_price.toFixed(2)}`.padStart(8) + '\n';
        } else {
            const title = (item.title || '').substring(0, 22);
            line = `${title}`.padEnd(24) + `$${item.store_price.toFixed(2)}`.padStart(8) + '\n';
        }
        receipt.push(line);
    });
    
    receipt.push(''.padEnd(32, '-') + '\n');
    
    receipt.push('\x1B\x45\x01');
    receipt.push(`Subtotal:`.padEnd(24) + `$${transaction.subtotal.toFixed(2)}`.padStart(8) + '\n');
    receipt.push(`Tax (${transaction.taxRate || 0}%):`.padEnd(24) + `$${transaction.tax.toFixed(2)}`.padStart(8) + '\n');
    receipt.push(`TOTAL:`.padEnd(24) + `$${transaction.total.toFixed(2)}`.padStart(8) + '\n');
    receipt.push('\x1B\x45\x00');
    
    receipt.push(''.padEnd(32, '-') + '\n');
    receipt.push(`Payment: ${transaction.paymentMethod || 'Cash'}\n`);
    if (transaction.tendered) {
        receipt.push(`Tendered:`.padEnd(24) + `$${transaction.tendered.toFixed(2)}`.padStart(8) + '\n');
        receipt.push(`Change:`.padEnd(24) + `$${transaction.change.toFixed(2)}`.padStart(8) + '\n');
    }
    
    receipt.push(''.padEnd(32, '-') + '\n');
    receipt.push('\x1B\x61\x01');
    receipt.push(transaction.footer || 'Thank you for your purchase!\n');
    receipt.push('\n\n\n');
    
    receipt.push('\x1B\x69');
    
    return receipt.join('');
}

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'receipts') {
        loadSavedReceipts();
        renderReceipts(savedReceipts);
    }
});