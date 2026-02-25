// ============================================================================
// receipts.js - Receipt History and Management
// ============================================================================

// Global variables
let currentReceipts = [];
let currentReceiptPage = 1;
let receiptsPerPage = 10;
let totalReceipts = 0;
let totalReceiptPages = 1;

// ============================================================================
// Utility Functions
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
}

function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '$0.00';
    return `$${parseFloat(amount).toFixed(2)}`;
}

// ============================================================================
// Receipt Statistics
// ============================================================================

async function loadReceiptStats() {
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/receipts/stats`, {
            credentials: 'include',
            headers: AppConfig.getHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load stats: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            const stats = data.stats || [];
            
            // Calculate totals from stats array
            let totalSales = 0;
            let totalTax = 0;
            let totalItems = 0;
            
            stats.forEach(stat => {
                totalSales += parseFloat(stat.total_sales || 0);
                totalTax += parseFloat(stat.total_tax || 0);
                totalItems += parseInt(stat.total_items || 0);
            });
            
            document.getElementById('total-receipts').textContent = stats.length || 0;
            document.getElementById('total-receipts-sales').textContent = formatCurrency(totalSales);
            document.getElementById('total-receipts-tax').textContent = formatCurrency(totalTax);
            document.getElementById('total-receipts-items').textContent = totalItems || 0;
        }
    } catch (error) {
        console.error('Error loading receipt stats:', error);
        // Set default values on error
        document.getElementById('total-receipts').textContent = '0';
        document.getElementById('total-receipts-sales').textContent = '$0.00';
        document.getElementById('total-receipts-tax').textContent = '$0.00';
        document.getElementById('total-receipts-items').textContent = '0';
    }
}

// ============================================================================
// Receipt Search and Display
// ============================================================================

window.searchReceipts = async function(page = 1) {
    const startDate = document.getElementById('receipt-start-date')?.value;
    const endDate = document.getElementById('receipt-end-date')?.value;
    const searchQuery = document.getElementById('receipt-search-query')?.value;
    
    showReceiptsLoading(true);
    
    try {
        // Build URL with query parameters
        let url = `${AppConfig.baseUrl}/api/receipts?`;
        const params = new URLSearchParams();
        
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (searchQuery) params.append('search', searchQuery);
        
        url += params.toString();
        
        console.log('Fetching receipts from:', url);
        
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load receipts: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            currentReceipts = data.receipts || [];
            totalReceipts = data.count || currentReceipts.length;
            totalReceiptPages = Math.ceil(totalReceipts / receiptsPerPage);
            
            // Apply pagination manually since backend doesn't support it yet
            const start = (page - 1) * receiptsPerPage;
            const end = start + receiptsPerPage;
            const paginatedReceipts = currentReceipts.slice(start, end);
            
            renderReceipts(paginatedReceipts);
            renderReceiptPagination();
            
            if (currentReceipts.length === 0) {
                showReceiptStatus('No receipts found', 'info');
            }
        } else {
            throw new Error(data.error || 'Failed to load receipts');
        }
        
    } catch (error) {
        console.error('Error searching receipts:', error);
        showReceiptStatus(`Error: ${error.message}`, 'error');
        
        // Show empty state
        const container = document.getElementById('receipts-grid');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px; color: #666; grid-column: 1/-1;">
                    <i class="fas fa-receipt" style="font-size: 64px; margin-bottom: 20px; color: #ccc;"></i>
                    <h3>Unable to Load Receipts</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="searchReceipts()">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;
        }
    } finally {
        showReceiptsLoading(false);
    }
};

window.resetReceiptSearch = function() {
    document.getElementById('receipt-start-date').value = '';
    document.getElementById('receipt-end-date').value = '';
    document.getElementById('receipt-search-query').value = '';
    searchReceipts(1);
};

function renderReceipts(receipts) {
    const container = document.getElementById('receipts-grid');
    if (!container) return;
    
    if (!receipts || receipts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px; color: #666; grid-column: 1/-1;">
                <i class="fas fa-receipt" style="font-size: 64px; margin-bottom: 20px; color: #ccc;"></i>
                <h3>No Receipts Found</h3>
                <p>Complete a sale to generate receipts.</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    receipts.forEach(receipt => {
        // Handle different receipt formats
        const receiptId = receipt.receipt_id || receipt.id || 'N/A';
        const date = receipt.created_at || receipt.date || new Date().toISOString();
        const paymentMethod = receipt.payment_method || 'Cash';
        const cashier = receipt.cashier || 'Unknown';
        const total = receipt.total || 0;
        
        // Parse transaction data if it exists
        let itemCount = 0;
        let firstItem = '';
        if (receipt.transaction_data) {
            try {
                const transactionData = typeof receipt.transaction_data === 'string' 
                    ? JSON.parse(receipt.transaction_data) 
                    : receipt.transaction_data;
                
                if (transactionData.items && transactionData.items.length > 0) {
                    itemCount = transactionData.items.length;
                    const first = transactionData.items[0];
                    firstItem = first.description || first.title || first.note || 'Item';
                }
            } catch (e) {
                console.error('Error parsing transaction data:', e);
            }
        }
        
        html += `
            <div class="receipt-card" onclick="viewReceiptDetails('${receiptId}')">
                <div class="receipt-card-header">
                    <span class="receipt-id">#${escapeHtml(receiptId)}</span>
                    <span class="receipt-method ${paymentMethod.toLowerCase()}">
                        ${escapeHtml(paymentMethod)}
                    </span>
                </div>
                
                <div class="receipt-card-body">
                    <div class="receipt-date">
                        <i class="far fa-calendar-alt"></i> ${formatDate(date)}
                    </div>
                    
                    <div class="receipt-items">
                        <i class="fas fa-box"></i> ${itemCount} item${itemCount !== 1 ? 's' : ''}
                        ${firstItem ? `<span class="receipt-first-item">${escapeHtml(firstItem)}</span>` : ''}
                    </div>
                    
                    <div class="receipt-cashier">
                        <i class="fas fa-user"></i> ${escapeHtml(cashier)}
                    </div>
                </div>
                
                <div class="receipt-card-footer">
                    <span class="receipt-total">${formatCurrency(total)}</span>
                    <div class="receipt-actions">
                        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); viewReceiptDetails('${receiptId}')">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="btn btn-sm btn-info" onclick="event.stopPropagation(); printReceiptToVCP8370('${receiptId}')">
                            <i class="fas fa-print"></i> Thermal
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); printBrowserReceipt('${receiptId}')">
                            <i class="fas fa-file-pdf"></i> Print
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function renderReceiptPagination() {
    const paginationContainer = document.getElementById('receipts-pagination');
    if (!paginationContainer) {
        // Create pagination if it doesn't exist
        const container = document.getElementById('receipts-grid')?.parentNode;
        if (container) {
            const pagination = document.createElement('div');
            pagination.id = 'receipts-pagination';
            pagination.className = 'pagination';
            pagination.style.marginTop = '20px';
            pagination.style.display = 'flex';
            pagination.style.justifyContent = 'center';
            pagination.style.alignItems = 'center';
            pagination.style.gap = '10px';
            container.appendChild(pagination);
        }
    }
    
    const pagination = document.getElementById('receipts-pagination');
    if (!pagination) return;
    
    if (totalReceiptPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = `
        <button class="page-btn" onclick="changeReceiptPage(1)" ${currentReceiptPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-angle-double-left"></i>
        </button>
        <button class="page-btn" onclick="changeReceiptPage(${currentReceiptPage - 1})" ${currentReceiptPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-angle-left"></i>
        </button>
    `;
    
    // Show page numbers
    const startPage = Math.max(1, currentReceiptPage - 2);
    const endPage = Math.min(totalReceiptPages, currentReceiptPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <button class="page-btn ${i === currentReceiptPage ? 'active' : ''}" 
                    onclick="changeReceiptPage(${i})">
                ${i}
            </button>
        `;
    }
    
    html += `
        <button class="page-btn" onclick="changeReceiptPage(${currentReceiptPage + 1})" ${currentReceiptPage === totalReceiptPages ? 'disabled' : ''}>
            <i class="fas fa-angle-right"></i>
        </button>
        <button class="page-btn" onclick="changeReceiptPage(${totalReceiptPages})" ${currentReceiptPage === totalReceiptPages ? 'disabled' : ''}>
            <i class="fas fa-angle-double-right"></i>
        </button>
        
        <div class="records-per-page">
            <span>Show:</span>
            <select onchange="changeReceiptsPerPage(this.value)">
                <option value="10" ${receiptsPerPage === 10 ? 'selected' : ''}>10</option>
                <option value="25" ${receiptsPerPage === 25 ? 'selected' : ''}>25</option>
                <option value="50" ${receiptsPerPage === 50 ? 'selected' : ''}>50</option>
                <option value="100" ${receiptsPerPage === 100 ? 'selected' : ''}>100</option>
            </select>
        </div>
    `;
    
    pagination.innerHTML = html;
}

window.changeReceiptPage = function(page) {
    if (page < 1 || page > totalReceiptPages) return;
    currentReceiptPage = page;
    searchReceipts(page);
};

window.changeReceiptsPerPage = function(perPage) {
    receiptsPerPage = parseInt(perPage);
    currentReceiptPage = 1;
    searchReceipts(1);
};

// ============================================================================
// Receipt Details View
// ============================================================================

window.viewReceiptDetails = async function(receiptId) {
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/receipts/${receiptId}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch receipt: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'success' || !data.receipt) {
            throw new Error('Receipt not found');
        }
        
        const receipt = data.receipt;
        showReceiptDetailsModal(receipt);
        
    } catch (error) {
        console.error('Error viewing receipt:', error);
        showReceiptStatus(`Error: ${error.message}`, 'error');
    }
};

function showReceiptDetailsModal(receipt) {
    // Parse transaction data
    let transactionData = {};
    let items = [];
    
    if (receipt.transaction_data) {
        try {
            transactionData = typeof receipt.transaction_data === 'string' 
                ? JSON.parse(receipt.transaction_data) 
                : receipt.transaction_data;
            items = transactionData.items || [];
        } catch (e) {
            console.error('Error parsing transaction data:', e);
        }
    }
    
    // Create modal if it doesn't exist
    let modal = document.getElementById('receipt-details-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'receipt-details-modal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }
    
    const itemsHtml = items.map(item => {
        let description = '';
        if (item.type === 'accessory') {
            description = item.description || 'Accessory';
        } else if (item.type === 'custom') {
            description = item.note || 'Custom Item';
        } else {
            description = item.artist ? `${item.artist} - ${item.title}` : (item.title || 'Item');
        }
        
        return `
            <tr>
                <td>${escapeHtml(description)}</td>
                <td>${escapeHtml(item.catalog_number || '')}</td>
                <td style="text-align: right;">${formatCurrency(item.store_price || item.price || 0)}</td>
            </tr>
        `;
    }).join('');
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-receipt"></i> Receipt #${escapeHtml(receipt.receipt_id || receipt.id)}
                </h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').style.display='none'">&times;</button>
            </div>
            
            <div class="modal-body">
                <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <strong>Date:</strong> ${formatDate(receipt.created_at || receipt.date)}
                        </div>
                        <div>
                            <strong>Payment:</strong> ${escapeHtml(receipt.payment_method || 'Cash')}
                        </div>
                        <div>
                            <strong>Cashier:</strong> ${escapeHtml(receipt.cashier || 'Unknown')}
                        </div>
                        <div>
                            <strong>Square ID:</strong> ${escapeHtml(receipt.square_payment_id || 'N/A')}
                        </div>
                    </div>
                </div>
                
                <h4>Items</h4>
                <div style="overflow-x: auto; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa;">
                                <th style="padding: 10px; text-align: left;">Description</th>
                                <th style="padding: 10px; text-align: left;">Catalog #</th>
                                <th style="padding: 10px; text-align: right;">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml || '<tr><td colspan="3" style="text-align: center; padding: 20px;">No items found</td></tr>'}
                        </tbody>
                    </table>
                </div>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Subtotal:</span>
                        <span>${formatCurrency(transactionData.subtotal || receipt.total || 0)}</span>
                    </div>
                    ${transactionData.discount > 0 ? `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px; color: #27ae60;">
                        <span>Discount${transactionData.discountType === 'percentage' ? ` (${transactionData.discountAmount}%)` : ''}:</span>
                        <span>-${formatCurrency(transactionData.discount)}</span>
                    </div>
                    ` : ''}
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Tax (${transactionData.taxRate || 0}%):</span>
                        <span>${formatCurrency(transactionData.tax || 0)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.2em; margin-top: 10px; padding-top: 10px; border-top: 2px solid #ddd;">
                        <span>Total:</span>
                        <span>${formatCurrency(receipt.total || transactionData.total || 0)}</span>
                    </div>
                    ${transactionData.paymentMethod === 'Cash' && transactionData.change > 0 ? `
                    <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">
                        <span>Tendered:</span>
                        <span>${formatCurrency(transactionData.tendered || transactionData.total)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Change:</span>
                        <span>${formatCurrency(transactionData.change || 0)}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="modal-footer">
                <button class="btn btn-info" onclick="printReceiptToVCP8370('${receipt.receipt_id || receipt.id}')">
                    <i class="fas fa-print"></i> Thermal Print
                </button>
                <button class="btn btn-primary" onclick="printBrowserReceipt('${receipt.receipt_id || receipt.id}')">
                    <i class="fas fa-file-pdf"></i> Browser Print
                </button>
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').style.display='none'">
                    Close
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

// ============================================================================
// Receipt Printing Functions
// ============================================================================

// Browser print function
window.printBrowserReceipt = async function(receiptId) {
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/receipts/${receiptId}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch receipt: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'success' || !data.receipt) {
            throw new Error('Receipt not found');
        }
        
        const receipt = data.receipt;
        const receiptText = await formatReceiptForBrowser(receipt);
        showPrintableReceipt(receiptText);
        
    } catch (error) {
        console.error('Error printing receipt:', error);
        showReceiptStatus(`Error: ${error.message}`, 'error');
    }
};

// VCP-8370 Thermal Printer Function
window.printReceiptToVCP8370 = async function(receiptId) {
    console.log('🖨️ Printing receipt to VCP-8370:', receiptId);
    
    try {
        showReceiptStatus('Fetching receipt data...', 'info');
        
        const response = await fetch(`${AppConfig.baseUrl}/api/receipts/${receiptId}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch receipt: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'success' || !data.receipt) {
            throw new Error('Receipt not found');
        }
        
        const receipt = data.receipt;
        
        // Format the receipt for thermal printing
        const receiptText = await formatThermalReceipt(receipt);
        
        showReceiptStatus('Sending to VCP-8370 printer...', 'info');
        
        // Check if printToVCP8370 function exists (from checkout.js)
        if (typeof window.printToVCP8370 === 'function') {
            const success = await window.printToVCP8370(receiptText);
            
            if (success) {
                showReceiptStatus('✅ Receipt printed successfully!', 'success');
            } else {
                // Fallback to browser print
                showReceiptStatus('⚠️ Thermal printer failed, showing browser print', 'warning');
                showPrintableReceipt(receiptText);
            }
        } else {
            // printToVCP8370 not available, use browser print
            console.warn('printToVCP8370 function not found, using browser print');
            showReceiptStatus('Thermal printer not available, using browser print', 'warning');
            showPrintableReceipt(receiptText);
        }
        
    } catch (error) {
        console.error('❌ Failed to print receipt:', error);
        showReceiptStatus(`Error: ${error.message}`, 'error');
    }
};

// Format receipt for thermal printer (compact format)
async function formatThermalReceipt(receipt) {
    // Parse transaction data
    let transactionData = {};
    if (receipt.transaction_data) {
        try {
            transactionData = typeof receipt.transaction_data === 'string' 
                ? JSON.parse(receipt.transaction_data) 
                : receipt.transaction_data;
        } catch (e) {
            console.error('Error parsing transaction data:', e);
        }
    }
    
    const storeName = transactionData.storeName || window.getConfigValue?.('STORE_NAME') || 'PigStyle Music';
    const storeAddress = transactionData.storeAddress || window.getConfigValue?.('STORE_ADDRESS') || '';
    const storePhone = transactionData.storePhone || window.getConfigValue?.('STORE_PHONE') || '';
    const footer = transactionData.footer || window.getConfigValue?.('RECEIPT_FOOTER') || 'Thank you for your purchase!';
    const charsPerLine = window.getConfigValue?.('PRINTER_CHARS_PER_LINE') || 32;
    
    let text = '';
    text += ''.padEnd(charsPerLine, '=') + '\n';
    text += centerText(storeName, charsPerLine) + '\n';
    if (storeAddress) text += centerText(storeAddress, charsPerLine) + '\n';
    if (storePhone) text += centerText(storePhone, charsPerLine) + '\n';
    text += ''.padEnd(charsPerLine, '=') + '\n';
    text += `Receipt: ${receipt.receipt_id || receipt.id}\n`;
    text += `Date: ${formatDate(receipt.created_at || receipt.date)}\n`;
    text += `Cashier: ${receipt.cashier || transactionData.cashier || 'Unknown'}\n`;
    text += `Payment: ${receipt.payment_method || transactionData.paymentMethod || 'Cash'}\n`;
    text += ''.padEnd(charsPerLine, '-') + '\n';
    
    const items = transactionData.items || [];
    if (items.length > 0) {
        items.forEach(item => {
            let desc = '';
            if (item.type === 'accessory') {
                desc = item.description || 'Accessory';
            } else if (item.type === 'custom') {
                desc = item.note || 'Custom Item';
            } else {
                desc = item.artist ? `${item.artist} - ${item.title}` : (item.title || 'Item');
            }
            
            const price = item.store_price || item.price || 0;
            const maxDescLength = charsPerLine - 9;
            const shortDesc = desc.length > maxDescLength ? 
                desc.substring(0, maxDescLength - 3) + '...' : 
                desc.padEnd(maxDescLength);
            text += shortDesc + ' ' + price.toFixed(2).padStart(8) + '\n';
        });
    }
    
    text += ''.padEnd(charsPerLine, '-') + '\n';
    text += `Subtotal:${''.padStart(charsPerLine - 13)} ${(transactionData.subtotal || 0).toFixed(2).padStart(8)}\n`;
    
    if (transactionData.discount > 0) {
        const discountText = transactionData.discountType === 'percentage' ? 
            `Discount (${transactionData.discountAmount}%):` : 'Discount:';
        text += `${discountText.padEnd(charsPerLine - 13)} -${(transactionData.discount || 0).toFixed(2).padStart(8)}\n`;
    }
    
    text += `Tax (${transactionData.taxRate || 0}%):${''.padStart(charsPerLine - 16)} ${(transactionData.tax || 0).toFixed(2).padStart(8)}\n`;
    text += ''.padEnd(charsPerLine, '=') + '\n';
    text += `TOTAL:${''.padStart(charsPerLine - 10)} ${(receipt.total || transactionData.total || 0).toFixed(2).padStart(8)}\n`;
    text += ''.padEnd(charsPerLine, '=') + '\n\n';
    
    if ((receipt.payment_method || transactionData.paymentMethod) === 'Cash' && transactionData.change > 0) {
        text += `Tendered: ${(transactionData.tendered || 0).toFixed(2).padStart(8)}\n`;
        text += `Change: ${(transactionData.change || 0).toFixed(2).padStart(8)}\n\n`;
    }
    
    if (receipt.square_payment_id || transactionData.square_payment_id) {
        text += `Square ID: ${receipt.square_payment_id || transactionData.square_payment_id}\n\n`;
    }
    
    text += centerText(footer, charsPerLine) + '\n';
    text += ''.padEnd(charsPerLine, '=') + '\n';
    
    return text;
}

// Format receipt for browser printing (wider format)
async function formatReceiptForBrowser(receipt) {
    // Parse transaction data
    let transactionData = {};
    if (receipt.transaction_data) {
        try {
            transactionData = typeof receipt.transaction_data === 'string' 
                ? JSON.parse(receipt.transaction_data) 
                : receipt.transaction_data;
        } catch (e) {
            console.error('Error parsing transaction data:', e);
        }
    }
    
    const storeName = transactionData.storeName || window.getConfigValue?.('STORE_NAME') || 'PigStyle Music';
    const storeAddress = transactionData.storeAddress || window.getConfigValue?.('STORE_ADDRESS') || '';
    const storePhone = transactionData.storePhone || window.getConfigValue?.('STORE_PHONE') || '';
    const footer = transactionData.footer || window.getConfigValue?.('RECEIPT_FOOTER') || 'Thank you for your purchase!';
    
    let text = '';
    text += ''.padStart(48, '=') + '\n';
    text += centerText(storeName, 48) + '\n';
    if (storeAddress) text += centerText(storeAddress, 48) + '\n';
    if (storePhone) text += centerText(storePhone, 48) + '\n';
    text += ''.padStart(48, '=') + '\n\n';
    
    text += `Receipt #: ${receipt.receipt_id || receipt.id}\n`;
    text += `Date: ${formatDate(receipt.created_at || receipt.date)}\n`;
    text += `Cashier: ${receipt.cashier || transactionData.cashier || 'Unknown'}\n`;
    text += `Payment: ${receipt.payment_method || transactionData.paymentMethod || 'Cash'}\n\n`;
    
    text += ''.padStart(48, '-') + '\n';
    
    const items = transactionData.items || [];
    if (items.length > 0) {
        items.forEach(item => {
            let desc = '';
            if (item.type === 'accessory') {
                desc = item.description || 'Accessory';
            } else if (item.type === 'custom') {
                desc = item.note || 'Custom Item';
            } else {
                desc = item.artist ? `${item.artist} - ${item.title}` : (item.title || 'Item');
            }
            
            const price = item.store_price || item.price || 0;
            const maxDescLength = 35;
            const shortDesc = desc.length > maxDescLength ? 
                desc.substring(0, maxDescLength - 3) + '...' : 
                desc.padEnd(maxDescLength);
            text += `${shortDesc} $${price.toFixed(2).padStart(10)}\n`;
        });
    }
    
    text += ''.padStart(48, '-') + '\n';
    text += `Subtotal:${''.padStart(27)} $${(transactionData.subtotal || 0).toFixed(2).padStart(10)}\n`;
    
    if (transactionData.discount > 0) {
        const discountText = transactionData.discountType === 'percentage' ? 
            `Discount (${transactionData.discountAmount}%):` : 'Discount:';
        text += `${discountText.padEnd(38)} -$${(transactionData.discount || 0).toFixed(2).padStart(10)}\n`;
    }
    
    text += `Tax (${transactionData.taxRate || 0}%):${''.padStart(26)} $${(transactionData.tax || 0).toFixed(2).padStart(10)}\n`;
    text += ''.padStart(48, '=') + '\n';
    text += `TOTAL:${''.padStart(32)} $${(receipt.total || transactionData.total || 0).toFixed(2).padStart(10)}\n`;
    text += ''.padStart(48, '=') + '\n\n';
    
    if ((receipt.payment_method || transactionData.paymentMethod) === 'Cash' && transactionData.change > 0) {
        text += `Tendered: $${(transactionData.tendered || 0).toFixed(2).padStart(10)}\n`;
        text += `Change: $${(transactionData.change || 0).toFixed(2).padStart(10)}\n\n`;
    }
    
    if (receipt.square_payment_id || transactionData.square_payment_id) {
        text += `Square ID: ${receipt.square_payment_id || transactionData.square_payment_id}\n\n`;
    }
    
    text += centerText(footer, 48) + '\n';
    text += ''.padStart(48, '=') + '\n';
    
    return text;
}

function centerText(text, width) {
    const padding = Math.max(0, width - text.length);
    const leftPad = Math.floor(padding / 2);
    return ' '.repeat(leftPad) + text;
}

function showPrintableReceipt(receiptText) {
    let modal = document.getElementById('printable-receipt-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'printable-receipt-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; width: 90%;">
                <div class="modal-header">
                    <h3 class="modal-title">Receipt</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').style.display='none'">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; font-size: 14px; line-height: 1.5; max-height: 500px; overflow-y: auto;" id="receipt-content-display">
                        ${escapeHtml(receiptText).replace(/\n/g, '<br>')}
                    </div>
                    <p style="color: #666; font-size: 12px; margin-top: 15px; text-align: center;">
                        <i class="fas fa-info-circle"></i> Use your browser's print function (Ctrl+P)
                    </p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="window.print()">
                        <i class="fas fa-print"></i> Print
                    </button>
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').style.display='none'">
                        Close
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        const contentDiv = modal.querySelector('#receipt-content-display');
        if (contentDiv) {
            contentDiv.innerHTML = escapeHtml(receiptText).replace(/\n/g, '<br>');
        }
    }
    
    modal.style.display = 'flex';
}

// ============================================================================
// Status Message Functions
// ============================================================================

function showReceiptsLoading(show) {
    const loadingEl = document.getElementById('receipts-loading');
    if (loadingEl) {
        loadingEl.style.display = show ? 'flex' : 'none';
    }
}

function showReceiptStatus(message, type = 'info') {
    const statusEl = document.getElementById('receipt-status-message');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
    
    if (type !== 'error') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}

// Create status message element if it doesn't exist
function ensureStatusElement() {
    if (!document.getElementById('receipt-status-message')) {
        const statusDiv = document.createElement('div');
        statusDiv.id = 'receipt-status-message';
        statusDiv.className = 'status-message';
        statusDiv.style.display = 'none';
        
        const receiptsGrid = document.getElementById('receipts-grid');
        if (receiptsGrid && receiptsGrid.parentNode) {
            receiptsGrid.parentNode.insertBefore(statusDiv, receiptsGrid);
        }
    }
}

// ============================================================================
// Initialization
// ============================================================================

// Initialize receipts tab
window.initializeReceiptsTab = function() {
    console.log('Initializing receipts tab...');
    ensureStatusElement();
    loadReceiptStats();
    searchReceipts(1);
};

// Listen for tab changes
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'receipts') {
        initializeReceiptsTab();
    }
});

// Auto-initialize if receipts tab is active on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check if receipts tab is active
    const receiptsTab = document.getElementById('receipts-tab');
    if (receiptsTab && receiptsTab.classList.contains('active')) {
        initializeReceiptsTab();
    }
});

console.log('✅ receipts.js loaded with VCP-8370 thermal printer support');