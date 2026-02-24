// ============================================================================
// receipts.js - Receipts Tab Functionality
// ============================================================================

let allReceipts = [];

// Make functions globally available
window.loadReceipts = loadReceipts;
window.renderReceipts = renderReceipts;
window.searchReceipts = searchReceipts;
window.resetReceiptSearch = resetReceiptSearch;
window.printReceipt = printReceipt;
window.showRefundModal = showRefundModal;
window.saveReceipt = saveReceipt;
window.closeReceiptModal = closeReceiptModal;

// Helper function to safely format date
function formatReceiptDate(receipt) {
    if (!receipt) return 'Invalid Date';
    
    try {
        let dateValue;
        
        // First try to get date from transaction_data
        if (receipt.transaction_data) {
            // If transaction_data is a string, parse it
            if (typeof receipt.transaction_data === 'string') {
                try {
                    const transactionData = JSON.parse(receipt.transaction_data);
                    dateValue = transactionData.date;
                } catch (e) {
                    console.error('Error parsing transaction_data:', e);
                }
            } 
            // If transaction_data is already an object
            else if (typeof receipt.transaction_data === 'object') {
                dateValue = receipt.transaction_data.date;
            }
        }
        
        // If no date in transaction_data, try created_at
        if (!dateValue) {
            dateValue = receipt.created_at || receipt.date;
        }
        
        if (!dateValue) return 'Invalid Date';
        
        // Parse the date
        let date;
        if (typeof dateValue === 'string') {
            // Handle ISO format
            if (dateValue.includes('T')) {
                date = new Date(dateValue);
            }
            // Handle MySQL datetime format (YYYY-MM-DD HH:MM:SS)
            else if (dateValue.includes(' ')) {
                date = new Date(dateValue.replace(' ', 'T') + 'Z');
            }
            else {
                date = new Date(dateValue);
            }
        } else if (typeof dateValue === 'number') {
            date = new Date(dateValue);
        } else if (dateValue instanceof Date) {
            date = dateValue;
        } else {
            return 'Invalid Date';
        }
        
        // Final validation
        if (isNaN(date.getTime())) {
            return 'Invalid Date';
        }
        
        // Format the date
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    } catch (e) {
        console.error('Date parsing error:', e, 'Receipt:', receipt);
        return 'Invalid Date';
    }
}

// Helper function to parse transaction data
function parseTransactionData(receipt) {
    if (!receipt) return {};
    
    try {
        if (receipt.transaction_data) {
            if (typeof receipt.transaction_data === 'string') {
                return JSON.parse(receipt.transaction_data);
            } else if (typeof receipt.transaction_data === 'object') {
                return receipt.transaction_data;
            }
        }
    } catch (e) {
        console.error('Error parsing transaction_data:', e);
    }
    
    return {};
}

// Load receipts from database
async function loadReceipts() {
    const loading = document.getElementById('receipts-loading');
    const grid = document.getElementById('receipts-grid');
    
    if (loading) loading.style.display = 'block';
    if (grid) grid.innerHTML = '';
    
    try {
        console.log('Loading receipts from database...');
        const response = await fetch(`${AppConfig.baseUrl}/api/receipts`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load receipts: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Receipts data received:', data);
        
        if (data.status === 'success') {
            allReceipts = data.receipts || [];
            console.log(`Loaded ${allReceipts.length} receipts from database`);
            
            // Log the first receipt to see its structure
            if (allReceipts.length > 0) {
                console.log('Sample receipt:', allReceipts[0]);
                // Test date formatting
                console.log('Formatted date:', formatReceiptDate(allReceipts[0]));
            }
            
            // Clear any filters
            const startDate = document.getElementById('receipt-start-date');
            const endDate = document.getElementById('receipt-end-date');
            const searchQuery = document.getElementById('receipt-search-query');
            
            if (startDate) startDate.value = '';
            if (endDate) endDate.value = '';
            if (searchQuery) searchQuery.value = '';
            
            // Render the receipts
            renderReceipts(allReceipts);
        } else {
            throw new Error(data.error || 'Failed to load receipts');
        }
    } catch (error) {
        console.error('Error loading receipts:', error);
        if (grid) {
            grid.innerHTML = `
                <div class="error-message" style="text-align: center; padding: 40px;">
                    <i class="fas fa-exclamation-circle" style="font-size: 48px; color: #dc3545; margin-bottom: 20px;"></i>
                    <p style="color: #666; margin-bottom: 20px;">Error loading receipts: ${error.message}</p>
                    <button class="btn btn-primary" onclick="loadReceipts()">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;
        }
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// Render receipts to the grid
function renderReceipts(receipts) {
    const grid = document.getElementById('receipts-grid');
    if (!grid) return;
    
    console.log('Rendering receipts:', receipts ? receipts.length : 0);
    
    // Make sure receipts is an array
    if (!receipts || !Array.isArray(receipts)) {
        console.error('Receipts is not an array:', receipts);
        grid.innerHTML = `
            <div class="error-message" style="text-align: center; padding: 40px;">
                <i class="fas fa-exclamation-circle" style="font-size: 48px; color: #dc3545; margin-bottom: 20px;"></i>
                <p style="color: #666; margin-bottom: 20px;">Invalid receipt data received</p>
                <button class="btn btn-primary" onclick="loadReceipts()">
                    <i class="fas fa-sync-alt"></i> Reload
                </button>
            </div>
        `;
        return;
    }
    
    if (receipts.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                <i class="fas fa-receipt" style="font-size: 64px; color: #ccc; margin-bottom: 20px;"></i>
                <h3 style="color: #333; margin-bottom: 10px;">No Receipts Found</h3>
                <p style="color: #666;">Complete a sale to generate your first receipt</p>
            </div>
        `;
        updateReceiptStats(receipts);
        return;
    }
    
    // Sort receipts by date (newest first)
    const sortedReceipts = [...receipts].sort((a, b) => {
        const dateA = new Date(formatReceiptDate(a)).getTime();
        const dateB = new Date(formatReceiptDate(b)).getTime();
        return dateB - dateA;
    });
    
    let html = '';
    sortedReceipts.forEach(receipt => {
        html += renderReceiptCard(receipt);
    });
    
    grid.innerHTML = html;
    updateReceiptStats(receipts);
}

// Render a single receipt card
function renderReceiptCard(receipt) {
    // Parse transaction data to get additional fields
    const transactionData = parseTransactionData(receipt);
    
    // Safely parse the date using our helper function
    const formattedDate = formatReceiptDate(receipt);
    
    // Get items from transaction data or receipt
    const items = transactionData.items || receipt.items || [];
    
    // Get item count safely
    const itemCount = Array.isArray(items) ? items.length : 0;
    
    // Get first few items for preview safely
    let itemsPreview = '';
    if (Array.isArray(items)) {
        itemsPreview = items.slice(0, 3).map(item => {
            if (item.type === 'accessory') {
                return item.description || 'Accessory';
            } else if (item.type === 'custom') {
                return item.note || 'Custom Item';
            } else {
                return `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`;
            }
        }).join(', ');
    }
    
    const moreItems = itemCount > 3 ? ` +${itemCount - 3} more` : '';
    
    // Safely get total
    const total = transactionData.total || receipt.total || 0;
    
    // Get receipt ID safely
    const receiptId = receipt.receipt_id || receipt.id || 'Unknown';
    
    // Get payment method safely
    const paymentMethod = transactionData.paymentMethod || receipt.payment_method || 'Unknown';
    
    // Get cashier safely
    const cashier = transactionData.cashier || receipt.cashier || 'Admin';
    
    return `
        <div class="receipt-card" onclick="showReceiptDetails('${receiptId}')">
            <div class="receipt-card-header">
                <span class="receipt-id">#${escapeHtml(receiptId)}</span>
                <span class="receipt-date">${escapeHtml(formattedDate)}</span>
            </div>
            <div class="receipt-card-body">
                <div class="receipt-items-preview">${escapeHtml(itemsPreview)}${escapeHtml(moreItems)}</div>
                <div class="receipt-total">$${parseFloat(total).toFixed(2)}</div>
            </div>
            <div class="receipt-card-footer">
                <span class="receipt-payment-method">
                    <i class="fas ${paymentMethod.toLowerCase().includes('cash') ? 'fa-money-bill-wave' : 'fa-square'}"></i>
                    ${escapeHtml(paymentMethod)}
                </span>
                <span class="receipt-cashier">${escapeHtml(cashier)}</span>
            </div>
        </div>
    `;
}

// Update receipt statistics
function updateReceiptStats(receipts) {
    console.log('Updating stats for receipts:', receipts ? receipts.length : 0);
    
    // Make sure receipts is an array
    if (!receipts || !Array.isArray(receipts)) {
        console.error('Cannot update stats: receipts is not an array');
        return;
    }
    
    let totalSales = 0;
    let totalTax = 0;
    let totalItems = 0;
    
    receipts.forEach(receipt => {
        const transactionData = parseTransactionData(receipt);
        totalSales += parseFloat(transactionData.total || receipt.total || 0);
        totalTax += parseFloat(transactionData.tax || receipt.tax || 0);
        
        const items = transactionData.items || receipt.items || [];
        if (Array.isArray(items)) {
            totalItems += items.length;
        }
    });
    
    const totalReceipts = receipts.length;
    
    // Update the DOM
    const totalReceiptsEl = document.getElementById('total-receipts');
    const totalSalesEl = document.getElementById('total-receipts-sales');
    const totalTaxEl = document.getElementById('total-receipts-tax');
    const totalItemsEl = document.getElementById('total-receipts-items');
    
    if (totalReceiptsEl) totalReceiptsEl.textContent = totalReceipts;
    if (totalSalesEl) totalSalesEl.textContent = `$${totalSales.toFixed(2)}`;
    if (totalTaxEl) totalTaxEl.textContent = `$${totalTax.toFixed(2)}`;
    if (totalItemsEl) totalItemsEl.textContent = totalItems;
}

// Search receipts
function searchReceipts() {
    const startDate = document.getElementById('receipt-start-date')?.value;
    const endDate = document.getElementById('receipt-end-date')?.value;
    const searchQuery = document.getElementById('receipt-search-query')?.value.toLowerCase().trim() || '';
    
    console.log('Searching receipts with:', { startDate, endDate, searchQuery });
    
    let filtered = [...allReceipts];
    
    // Filter by date range
    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filtered = filtered.filter(r => {
            const receiptDate = new Date(formatReceiptDate(r));
            return receiptDate >= start;
        });
    }
    
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter(r => {
            const receiptDate = new Date(formatReceiptDate(r));
            return receiptDate <= end;
        });
    }
    
    // Filter by search query
    if (searchQuery) {
        filtered = filtered.filter(receipt => {
            const transactionData = parseTransactionData(receipt);
            
            // Search in receipt ID
            const receiptId = (receipt.receipt_id || receipt.id || '').toLowerCase();
            if (receiptId.includes(searchQuery)) return true;
            
            // Search in items
            const items = transactionData.items || receipt.items || [];
            if (Array.isArray(items)) {
                return items.some(item => {
                    const artist = (item.artist || '').toLowerCase();
                    const title = (item.title || '').toLowerCase();
                    const catalog = (item.catalog_number || '').toLowerCase();
                    const description = (item.description || '').toLowerCase();
                    const note = (item.note || '').toLowerCase();
                    
                    return artist.includes(searchQuery) ||
                           title.includes(searchQuery) ||
                           catalog.includes(searchQuery) ||
                           description.includes(searchQuery) ||
                           note.includes(searchQuery);
                });
            }
            return false;
        });
    }
    
    console.log(`Found ${filtered.length} receipts matching criteria`);
    renderReceipts(filtered);
}

// Reset receipt search
function resetReceiptSearch() {
    const startDate = document.getElementById('receipt-start-date');
    const endDate = document.getElementById('receipt-end-date');
    const searchQuery = document.getElementById('receipt-search-query');
    
    if (startDate) startDate.value = '';
    if (endDate) endDate.value = '';
    if (searchQuery) searchQuery.value = '';
    
    renderReceipts(allReceipts);
}

// Print a receipt - now just calls the detail view with print option
function printReceipt(receiptId) {
    // Instead of opening a new popup, show the receipt in the detail modal with print button
    showReceiptDetails(receiptId);
}

// Close receipt modal
function closeReceiptModal() {
    const modal = document.getElementById('receipt-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Show receipt details in modal
function showReceiptDetails(receiptId) {
    const receipt = allReceipts.find(r => r.receipt_id === receiptId || r.id === receiptId);
    if (!receipt) return;
    
    const modal = document.getElementById('receipt-modal');
    const content = document.getElementById('receipt-content');
    
    if (!modal || !content) return;
    
    const transactionData = parseTransactionData(receipt);
    const formattedDate = formatReceiptDate(receipt);
    
    // Get items from transaction data
    const items = transactionData.items || receipt.items || [];
    
    let itemsHtml = '';
    if (Array.isArray(items)) {
        items.forEach(item => {
            if (item.type === 'accessory') {
                itemsHtml += `
                    <tr>
                        <td>${escapeHtml(item.description || 'Accessory')}</td>
                        <td>1</td>
                        <td>$${(item.store_price || 0).toFixed(2)}</td>
                        <td>$${(item.store_price || 0).toFixed(2)}</td>
                    </tr>
                `;
            } else if (item.type === 'custom') {
                itemsHtml += `
                    <tr>
                        <td>${escapeHtml(item.note || 'Custom Item')}</td>
                        <td>1</td>
                        <td>$${(item.store_price || 0).toFixed(2)}</td>
                        <td>$${(item.store_price || 0).toFixed(2)}</td>
                    </tr>
                `;
            } else {
                itemsHtml += `
                    <tr>
                        <td>${escapeHtml(item.artist || 'Unknown')} - ${escapeHtml(item.title || 'Unknown')}</td>
                        <td>1</td>
                        <td>$${(item.store_price || 0).toFixed(2)}</td>
                        <td>$${(item.store_price || 0).toFixed(2)}</td>
                    </tr>
                `;
            }
        });
    }
    
    const paymentMethod = transactionData.paymentMethod || receipt.payment_method || 'Unknown';
    const cashier = transactionData.cashier || receipt.cashier || 'Admin';
    const total = transactionData.total || receipt.total || 0;
    const subtotal = transactionData.subtotal || 0;
    const tax = transactionData.tax || receipt.tax || 0;
    const taxRate = transactionData.taxRate || 0;
    const discount = transactionData.discount || 0;
    const discountType = transactionData.discountType;
    const discountAmount = transactionData.discountAmount || 0;
    const tendered = transactionData.tendered || 0;
    const change = transactionData.change || 0;
    const squarePaymentId = transactionData.square_payment_id || receipt.square_payment_id || null;
    
    // Generate a printable version of the receipt
    const printableReceipt = generatePrintableReceipt({
        ...receipt,
        ...transactionData,
        formattedDate,
        items,
        paymentMethod,
        cashier,
        total,
        subtotal,
        tax,
        taxRate,
        discount,
        discountType,
        discountAmount,
        tendered,
        change,
        squarePaymentId
    });
    
    content.innerHTML = `
        <div class="receipt-detail">
            <div class="receipt-detail-header">
                <h3>Receipt #${escapeHtml(receiptId)}</h3>
                <button class="modal-close" onclick="closeReceiptModal()">&times;</button>
            </div>
            
            <div class="receipt-info">
                <p><strong>Date:</strong> ${escapeHtml(formattedDate)}</p>
                <p><strong>Cashier:</strong> ${escapeHtml(cashier)}</p>
                <p><strong>Payment Method:</strong> ${escapeHtml(paymentMethod)}</p>
                ${squarePaymentId ? `<p><strong>Square ID:</strong> ${escapeHtml(squarePaymentId)}</p>` : ''}
            </div>
            
            <div class="receipt-items">
                <table class="receipt-items-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml || '<tr><td colspan="4" style="text-align:center;">No items</td></tr>'}
                    </tbody>
                </table>
            </div>
            
            <div class="receipt-summary">
                <div class="summary-row">
                    <span>Subtotal:</span>
                    <span>$${(subtotal || 0).toFixed(2)}</span>
                </div>
                ${discount && discount > 0 ? `
                <div class="summary-row discount">
                    <span>${discountType === 'percentage' ? `Discount (${discountAmount}%)` : 'Discount'}:</span>
                    <span>-$${(discount || 0).toFixed(2)}</span>
                </div>
                ` : ''}
                <div class="summary-row">
                    <span>Tax (${(taxRate || 0)}%):</span>
                    <span>$${(tax || 0).toFixed(2)}</span>
                </div>
                <div class="summary-row total">
                    <span>Total:</span>
                    <span>$${(total || 0).toFixed(2)}</span>
                </div>
                ${paymentMethod.toLowerCase().includes('cash') && change > 0 ? `
                <div class="summary-row">
                    <span>Tendered:</span>
                    <span>$${(tendered || 0).toFixed(2)}</span>
                </div>
                <div class="summary-row">
                    <span>Change:</span>
                    <span>$${(change || 0).toFixed(2)}</span>
                </div>
                ` : ''}
            </div>
            
            <div class="receipt-printable-version" style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 4px; font-family: monospace; white-space: pre-wrap; font-size: 12px; max-height: 200px; overflow-y: auto;">
                ${escapeHtml(printableReceipt).replace(/\n/g, '<br>')}
            </div>
            
            <div class="receipt-actions">
                <button class="btn btn-primary" onclick="window.print()">
                    <i class="fas fa-print"></i> Print Receipt
                </button>
                <button class="btn btn-warning" onclick="showRefundModal('${receiptId}')">
                    <i class="fas fa-undo-alt"></i> Process Refund
                </button>
                <button class="btn btn-secondary" onclick="closeReceiptModal()">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

// Generate printable receipt text
function generatePrintableReceipt(data) {
    const storeName = data.storeName || 'PigStyle Music';
    const storeAddress = data.storeAddress || '';
    const storePhone = data.storePhone || '';
    const footer = data.footer || 'Thank you for your purchase!';
    const receiptId = data.receipt_id || data.id || 'Unknown';
    
    let receipt = '';
    receipt += ''.padStart(32, '=') + '\n';
    receipt += centerText(storeName, 32) + '\n';
    if (storeAddress) receipt += centerText(storeAddress, 32) + '\n';
    if (storePhone) receipt += centerText(storePhone, 32) + '\n';
    receipt += ''.padStart(32, '=') + '\n\n';
    
    receipt += `Receipt #: ${receiptId}\n`;
    receipt += `Date: ${data.formattedDate || new Date().toLocaleString()}\n`;
    receipt += `Cashier: ${data.cashier || 'Admin'}\n`;
    receipt += `Payment: ${data.paymentMethod || 'Cash'}\n\n`;
    
    receipt += ''.padStart(32, '-') + '\n';
    
    if (data.items && Array.isArray(data.items)) {
        data.items.forEach(item => {
            let description = '';
            if (item.type === 'accessory') {
                description = item.description || 'Accessory';
            } else if (item.type === 'custom') {
                description = item.note || 'Custom Item';
            } else {
                description = `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`;
            }
            
            const price = item.store_price || 0;
            const shortDesc = description.length > 20 ? description.substring(0, 18) + '..' : description;
            receipt += `${shortDesc.padEnd(20)} $${price.toFixed(2).padStart(8)}\n`;
        });
    }
    
    receipt += ''.padStart(32, '-') + '\n';
    receipt += `Subtotal:${''.padStart(14)} $${(data.subtotal || 0).toFixed(2).padStart(8)}\n`;
    
    if (data.discount && data.discount > 0) {
        const discountText = data.discountType === 'percentage' ? 
            `Discount (${data.discountAmount}%):` : 'Discount:';
        receipt += `${discountText.padEnd(22)} -$${(data.discount || 0).toFixed(2).padStart(8)}\n`;
    }
    
    receipt += `Tax (${data.taxRate || 0}%):${''.padStart(12)} $${(data.tax || 0).toFixed(2).padStart(8)}\n`;
    receipt += ''.padStart(32, '=') + '\n';
    receipt += `TOTAL:${''.padStart(16)} $${(data.total || 0).toFixed(2).padStart(8)}\n`;
    receipt += ''.padStart(32, '=') + '\n\n';
    
    if (data.paymentMethod && data.paymentMethod.toLowerCase().includes('cash') && data.change > 0) {
        receipt += `Tendered: $${(data.tendered || 0).toFixed(2)}\n`;
        receipt += `Change: $${(data.change || 0).toFixed(2)}\n\n`;
    }
    
    if (data.squarePaymentId) {
        receipt += `Square ID: ${data.squarePaymentId}\n\n`;
    }
    
    receipt += centerText(footer, 32) + '\n';
    receipt += ''.padStart(32, '=') + '\n';
    
    return receipt;
}

function centerText(text, width) {
    const padding = Math.max(0, width - text.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

// Save receipt to database
async function saveReceipt(transaction) {
    console.log('Saving receipt:', transaction.id);
    
    // Validate and clean the transaction data
    const cleanTransaction = {
        id: transaction.id || `CASH-${Date.now()}`,
        date: transaction.date || new Date().toISOString(),
        items: Array.isArray(transaction.items) ? transaction.items.map(item => ({
            id: item.id || null,
            type: item.type || 'record',
            artist: item.artist || null,
            title: item.title || null,
            description: item.description || item.note || null,
            note: item.note || null,
            store_price: parseFloat(item.store_price) || 0,
            catalog_number: item.catalog_number || null,
            barcode: item.barcode || null,
            consignor_id: item.consignor_id || null
        })) : [],
        subtotal: parseFloat(transaction.subtotal) || 0,
        discount: parseFloat(transaction.discount) || 0,
        discountType: transaction.discountType || null,
        discountAmount: parseFloat(transaction.discountAmount) || 0,
        tax: parseFloat(transaction.tax) || 0,
        taxRate: parseFloat(transaction.taxRate) || 0,
        total: parseFloat(transaction.total) || 0,
        tendered: parseFloat(transaction.tendered) || 0,
        change: parseFloat(transaction.change) || 0,
        paymentMethod: transaction.paymentMethod || 'Cash',
        cashier: transaction.cashier || 'Admin',
        storeName: transaction.storeName || 'PigStyle Music',
        storeAddress: transaction.storeAddress || '',
        storePhone: transaction.storePhone || '',
        footer: transaction.footer || 'Thank you for your purchase!',
        consignorPayments: transaction.consignorPayments || {},
        square_payment_id: transaction.square_payment_id || null
    };
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/receipts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(cleanTransaction)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to save receipt: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            console.log(`✅ Receipt saved to database: ${transaction.id}`);
            // Add to local array
            allReceipts.push(cleanTransaction);
            return true;
        } else {
            throw new Error(data.error || 'Failed to save receipt');
        }
    } catch (error) {
        console.error('Error saving receipt:', error);
        return false;
    }
}

// Show refund modal
function showRefundModal(receiptId) {
    const receipt = allReceipts.find(r => r.receipt_id === receiptId || r.id === receiptId);
    if (!receipt) return;
    
    const modal = document.getElementById('refund-modal');
    const receiptInfo = document.getElementById('refund-receipt-info');
    const itemsContainer = document.getElementById('refund-items-container');
    const refundAmount = document.getElementById('refund-amount');
    const processBtn = document.getElementById('process-refund-btn');
    
    if (!modal || !receiptInfo || !itemsContainer || !refundAmount || !processBtn) return;
    
    const transactionData = parseTransactionData(receipt);
    const formattedDate = formatReceiptDate(receipt);
    
    // Show receipt info
    receiptInfo.innerHTML = `
        <p><strong>Receipt:</strong> #${escapeHtml(receiptId)}</p>
        <p><strong>Date:</strong> ${escapeHtml(formattedDate)}</p>
        <p><strong>Total:</strong> $${(transactionData.total || receipt.total || 0).toFixed(2)}</p>
        <p><strong>Payment Method:</strong> ${escapeHtml(transactionData.paymentMethod || receipt.payment_method || 'Unknown')}</p>
    `;
    
    // Show items
    const items = transactionData.items || receipt.items || [];
    let itemsHtml = '<h4>Items on this receipt:</h4>';
    if (Array.isArray(items)) {
        items.forEach((item, index) => {
            let description = '';
            if (item.type === 'accessory') {
                description = item.description || 'Accessory';
            } else if (item.type === 'custom') {
                description = item.note || 'Custom Item';
            } else {
                description = `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`;
            }
            
            itemsHtml += `
                <div class="refund-item">
                    <label>
                        <input type="checkbox" class="refund-item-checkbox" data-index="${index}" data-price="${item.store_price || 0}" checked>
                        ${escapeHtml(description)} - $${(item.store_price || 0).toFixed(2)}
                    </label>
                </div>
            `;
        });
    }
    
    itemsContainer.innerHTML = itemsHtml;
    
    // Set refund amount to total
    refundAmount.value = (transactionData.total || receipt.total || 0).toFixed(2);
    
    // Add event listeners to checkboxes
    document.querySelectorAll('.refund-item-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateRefundAmount);
    });
    
    // Enable process button
    processBtn.disabled = false;
    
    modal.style.display = 'flex';
}

// Update refund amount based on selected items
function updateRefundAmount() {
    const checkboxes = document.querySelectorAll('.refund-item-checkbox:checked');
    const refundAmount = document.getElementById('refund-amount');
    
    let total = 0;
    checkboxes.forEach(cb => {
        total += parseFloat(cb.dataset.price) || 0;
    });
    
    if (refundAmount) {
        refundAmount.value = total.toFixed(2);
    }
}

// Close refund modal
window.closeRefundModal = function() {
    const modal = document.getElementById('refund-modal');
    if (modal) modal.style.display = 'none';
};

// Process refund
window.processRefund = async function() {
    const modal = document.getElementById('refund-modal');
    const refundAmount = document.getElementById('refund-amount')?.value;
    const refundReason = document.getElementById('refund-reason')?.value;
    const terminalSelect = document.getElementById('refund-terminal-select');
    const errorDiv = document.getElementById('refund-error');
    
    if (!refundAmount || parseFloat(refundAmount) <= 0) {
        if (errorDiv) {
            errorDiv.textContent = 'Please enter a valid refund amount';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    // Get selected items
    const selectedItems = [];
    document.querySelectorAll('.refund-item-checkbox:checked').forEach(cb => {
        selectedItems.push({
            index: cb.dataset.index,
            price: parseFloat(cb.dataset.price)
        });
    });
    
    if (selectedItems.length === 0) {
        if (errorDiv) {
            errorDiv.textContent = 'Please select at least one item to refund';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    // Here you would implement the actual refund logic
    console.log('Processing refund:', {
        amount: parseFloat(refundAmount),
        reason: refundReason,
        items: selectedItems,
        terminal: terminalSelect?.value
    });
    
    alert('Refund functionality would be implemented here');
    closeRefundModal();
};

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load receipts when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'receipts') {
        loadReceipts();
    }
});

console.log('✅ receipts.js loaded');