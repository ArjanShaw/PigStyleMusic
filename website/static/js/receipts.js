// ============================================================================
// receipts.js - Receipts Tab Functionality with Database Storage
// ============================================================================

console.log('✅ receipts.js loaded successfully');

// Global variables
let currentReceiptForRefund = null;
let selectedRefundItems = new Set();
let refundAvailableTerminals = [];

// Load saved receipts from database only
async function loadSavedReceipts() {
    console.log('Loading receipts from database...');
    
    const response = await fetch(`${AppConfig.baseUrl}/api/receipts`, {
        credentials: 'include'
    });
    
    if (!response.ok) {
        throw new Error(`Failed to load receipts: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'success') {
        throw new Error(data.error || 'Failed to load receipts');
    }
    
    // Convert database receipts to the format expected by the UI
    const dbReceipts = data.receipts.map(r => {
        // Parse the stored transaction data
        const transaction = r.transaction_data;
        // Ensure date is a Date object
        transaction.date = new Date(transaction.date || r.created_at);
        return transaction;
    });
    
    window.savedReceipts = dbReceipts;
    console.log(`Loaded ${dbReceipts.length} receipts from database`);
    return window.savedReceipts;
}

// Save a receipt to database only
async function saveReceipt(transaction) {
    console.log('Saving receipt:', transaction.id);
    
    // Prepare the receipt for saving
    const receiptToSave = {
        ...transaction,
        date: transaction.date.toISOString()
    };
    
    // Save to database only
    const response = await fetch(`${AppConfig.baseUrl}/api/receipts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(receiptToSave)
    });
    
    if (!response.ok) {
        throw new Error(`Failed to save receipt: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'success') {
        throw new Error(data.error || 'Failed to save receipt');
    }
    
    console.log('✅ Receipt saved to database:', data.receipt_id);
    
    // Update local array
    if (!window.savedReceipts) window.savedReceipts = [];
    window.savedReceipts.unshift(receiptToSave);
    
    // Update UI if receipts tab is active
    if (document.getElementById('receipts-tab')?.classList.contains('active')) {
        renderReceipts(window.savedReceipts);
    }
}

// Render receipts with item details
function renderReceipts(receipts) {
    const container = document.getElementById('receipts-grid');
    if (!container) {
        throw new Error('Receipts grid container not found');
    }
    
    console.log('Rendering', receipts.length, 'receipts');
    
    // Update stats
    updateReceiptStats(receipts);
    
    if (!receipts || receipts.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:40px;color:#666;grid-column:1/-1;">
                <i class="fas fa-receipt" style="font-size:48px;margin-bottom:20px;color:#ccc;"></i>
                <p>No receipts found</p>
                <p><small>Complete a sale to generate a receipt</small></p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    receipts.forEach(receipt => {
        const date = new Date(receipt.date);
        const dateStr = date.toLocaleDateString() + ' ' + 
                       date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // Generate items preview HTML
        let itemsPreview = '';
        receipt.items.slice(0, 3).forEach(item => {
            let itemDesc = '';
            if (item.type === 'accessory') {
                itemDesc = `<span class="item-badge accessory">ACC</span> ${escapeHtml(item.description || 'Unknown')}`;
            } else if (item.type === 'custom') {
                itemDesc = `<span class="item-badge custom">CUS</span> ${escapeHtml(item.note || 'Custom')}`;
            } else {
                itemDesc = `${escapeHtml(item.artist || '')} - ${escapeHtml(item.title || 'Unknown')}`;
            }
            itemsPreview += `<div class="receipt-item-preview">${itemDesc} - $${(item.store_price || 0).toFixed(2)}</div>`;
        });
        
        if (receipt.items.length > 3) {
            itemsPreview += `<div class="receipt-item-preview more">...and ${receipt.items.length - 3} more items</div>`;
        }
        
        html += `
            <div class="receipt-card" data-receipt-id="${receipt.id}">
                <div class="receipt-card-header">
                    <span class="receipt-card-title">${escapeHtml(receipt.id)}</span>
                    <span class="receipt-card-date">${dateStr}</span>
                </div>
                <div class="receipt-card-meta">
                    <span><i class="fas fa-cash-register"></i> ${escapeHtml(receipt.paymentMethod || 'Unknown')}</span>
                    <span><i class="fas fa-user"></i> ${escapeHtml(receipt.cashier || 'Admin')}</span>
                </div>
                <div class="receipt-card-items">
                    ${itemsPreview}
                </div>
                <div class="receipt-card-total-row">
                    <span class="receipt-card-total-label">Total:</span>
                    <span class="receipt-card-total">$${(receipt.total || 0).toFixed(2)}</span>
                </div>
                ${receipt.discount && receipt.discount > 0 ? 
                    `<div class="receipt-card-discount">
                        <i class="fas fa-tag"></i> Discount: -$${receipt.discount.toFixed(2)} 
                        ${receipt.discountType === 'percentage' ? `(${receipt.discountAmount}%)` : ''}
                    </div>` : ''}
                <div class="receipt-card-actions">
                    <button class="btn btn-sm btn-primary" onclick="viewReceiptDetails('${receipt.id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="showRefundModal('${receipt.id}')">
                        <i class="fas fa-undo-alt"></i> Refund
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
}

// Update receipt statistics
function updateReceiptStats(receipts) {
    let totalSales = 0;
    let totalTax = 0;
    let totalItems = 0;
    
    receipts.forEach(receipt => {
        totalSales += receipt.total || 0;
        totalTax += receipt.tax || 0;
        totalItems += receipt.items?.length || 0;
    });
    
    const totalReceiptsEl = document.getElementById('total-receipts');
    const totalSalesEl = document.getElementById('total-receipts-sales');
    const totalTaxEl = document.getElementById('total-receipts-tax');
    const totalItemsEl = document.getElementById('total-receipts-items');
    
    if (!totalReceiptsEl || !totalSalesEl || !totalTaxEl || !totalItemsEl) {
        throw new Error('Receipt stats elements not found');
    }
    
    totalReceiptsEl.textContent = receipts.length;
    totalSalesEl.textContent = `$${totalSales.toFixed(2)}`;
    totalTaxEl.textContent = `$${totalTax.toFixed(2)}`;
    totalItemsEl.textContent = totalItems;
}

// View receipt details in modal
function viewReceiptDetails(receiptId) {
    const receipt = window.savedReceipts.find(r => r.id === receiptId);
    if (!receipt) {
        throw new Error(`Receipt ${receiptId} not found`);
    }
    
    if (typeof receipt.date === 'string') {
        receipt.date = new Date(receipt.date);
    }
    
    showReceiptModal(receipt);
}

// Show receipt in modal
function showReceiptModal(transaction) {
    const modal = document.getElementById('receipt-modal');
    const content = document.getElementById('receipt-content');
    if (!modal || !content) {
        throw new Error('Receipt modal elements not found');
    }
    
    const dateStr = transaction.date.toLocaleDateString() + ' ' + 
                   transaction.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    let itemsHtml = '';
    transaction.items.forEach((item, index) => {
        if (item.type === 'accessory') {
            itemsHtml += `
                <div class="receipt-modal-item">
                    <div>
                        <span class="item-badge accessory">ACCESSORY</span>
                        ${escapeHtml(item.description) || 'Unknown Accessory'}
                    </div>
                    <div>$${(item.store_price || 0).toFixed(2)}</div>
                </div>
            `;
        } else if (item.type === 'custom') {
            itemsHtml += `
                <div class="receipt-modal-item">
                    <div>
                        <span class="item-badge custom">CUSTOM</span>
                        ${escapeHtml(item.note) || 'Custom Item'}
                    </div>
                    <div>$${(item.store_price || 0).toFixed(2)}</div>
                </div>
            `;
        } else {
            itemsHtml += `
                <div class="receipt-modal-item">
                    <div>
                        <strong>${escapeHtml(item.artist) || 'Unknown'}</strong> - ${escapeHtml(item.title) || 'Unknown'}
                        ${item.catalog_number ? `<br><small>Cat#: ${escapeHtml(item.catalog_number)}</small>` : ''}
                    </div>
                    <div>$${(item.store_price || 0).toFixed(2)}</div>
                </div>
            `;
        }
    });
    
    const subtotalBeforeDiscount = (transaction.subtotal || 0) + (transaction.discount || 0);
    
    content.innerHTML = `
        <div class="receipt-modal-header">
            <h2>${escapeHtml(transaction.storeName) || 'PigStyle Music'}</h2>
            <p>${escapeHtml(transaction.storeAddress) || ''}</p>
            <p>${escapeHtml(transaction.storePhone) || ''}</p>
        </div>
        
        <div class="receipt-modal-info">
            <div><strong>Receipt #:</strong> ${escapeHtml(transaction.id)}</div>
            <div><strong>Date:</strong> ${dateStr}</div>
            <div><strong>Cashier:</strong> ${escapeHtml(transaction.cashier) || 'Admin'}</div>
            <div><strong>Payment:</strong> ${escapeHtml(transaction.paymentMethod) || 'Cash'}</div>
        </div>
        
        <div class="receipt-modal-items">
            <h3>Items</h3>
            ${itemsHtml}
        </div>
        
        <div class="receipt-modal-totals">
            <div class="total-row">
                <span>Subtotal:</span>
                <span>$${subtotalBeforeDiscount.toFixed(2)}</span>
            </div>
            ${transaction.discount && transaction.discount > 0 ? 
                `<div class="total-row discount">
                    <span>Discount ${transaction.discountType === 'percentage' ? `(${transaction.discountAmount}%)` : ''}:</span>
                    <span>-$${transaction.discount.toFixed(2)}</span>
                </div>` : ''}
            <div class="total-row">
                <span>Tax (${transaction.taxRate || 0}%):</span>
                <span>$${(transaction.tax || 0).toFixed(2)}</span>
            </div>
            <div class="total-row grand-total">
                <span>TOTAL:</span>
                <span>$${(transaction.total || 0).toFixed(2)}</span>
            </div>
        </div>
        
        <div class="receipt-modal-footer">
            ${escapeHtml(transaction.footer) || 'Thank you for your purchase!'}
        </div>
    `;
    
    modal.style.display = 'flex';
}

// Close receipt modal
function closeReceiptModal() {
    const modal = document.getElementById('receipt-modal');
    if (modal) modal.style.display = 'none';
}

// Search receipts with item-level search
async function searchReceipts() {
    const startDate = document.getElementById('receipt-start-date').value;
    const endDate = document.getElementById('receipt-end-date').value;
    const query = document.getElementById('receipt-search-query').value.toLowerCase().trim();
    
    // Build query string
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (query) params.append('search', query);
    
    const response = await fetch(`${AppConfig.baseUrl}/api/receipts?${params.toString()}`, {
        credentials: 'include'
    });
    
    if (!response.ok) {
        throw new Error(`Failed to search receipts: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.status !== 'success') {
        throw new Error(data.error || 'Failed to search receipts');
    }
    
    // Convert to UI format
    const receipts = data.receipts.map(r => {
        const transaction = r.transaction_data;
        transaction.date = new Date(transaction.date || r.created_at);
        return transaction;
    });
    
    renderReceipts(receipts);
}

// Reset receipt search
function resetReceiptSearch() {
    document.getElementById('receipt-start-date').value = '';
    document.getElementById('receipt-end-date').value = '';
    document.getElementById('receipt-search-query').value = '';
    loadSavedReceipts().then(renderReceipts);
}

// Show refund modal for a receipt
function showRefundModal(receiptId) {
    const receipt = window.savedReceipts.find(r => r.id === receiptId);
    if (!receipt) {
        throw new Error(`Receipt ${receiptId} not found`);
    }
    
    currentReceiptForRefund = receipt;
    selectedRefundItems.clear();
    
    // Refresh terminals
    refreshTerminalsForRefund();
    
    // Populate refund modal
    const modal = document.getElementById('refund-modal');
    const itemsContainer = document.getElementById('refund-items-container');
    const receiptInfo = document.getElementById('refund-receipt-info');
    const refundAmount = document.getElementById('refund-amount');
    const refundReason = document.getElementById('refund-reason');
    const refundError = document.getElementById('refund-error');
    const processBtn = document.getElementById('process-refund-btn');
    const terminalSelect = document.getElementById('refund-terminal-select');
    
    // Check if modal exists
    if (!modal) {
        throw new Error('Refund modal not found in DOM');
    }
    
    if (!itemsContainer || !receiptInfo || !refundAmount || !refundReason || !processBtn) {
        throw new Error('Required refund modal elements not found');
    }
    
    // Show receipt info
    const dateStr = new Date(receipt.date).toLocaleString();
    receiptInfo.innerHTML = `
        <div><strong>Receipt:</strong> ${escapeHtml(receipt.id)}</div>
        <div><strong>Date:</strong> ${dateStr}</div>
        <div><strong>Original Total:</strong> $${(receipt.total || 0).toFixed(2)}</div>
        <div><strong>Payment Method:</strong> ${escapeHtml(receipt.paymentMethod || 'Unknown')}</div>
        ${receipt.square_payment_id ? `<div><strong>Square Payment ID:</strong> ${escapeHtml(receipt.square_payment_id)}</div>` : ''}
    `;
    
    // Show items with checkboxes
    let itemsHtml = '<h4>Select Items to Refund:</h4>';
    receipt.items.forEach((item, index) => {
        let itemDesc = '';
        if (item.type === 'accessory') {
            itemDesc = `[ACCESSORY] ${escapeHtml(item.description || 'Unknown')}`;
        } else if (item.type === 'custom') {
            itemDesc = `[CUSTOM] ${escapeHtml(item.note || 'Custom Item')}`;
        } else {
            itemDesc = `${escapeHtml(item.artist || 'Unknown')} - ${escapeHtml(item.title || 'Unknown')}`;
        }
        
        itemsHtml += `
            <div class="refund-item">
                <input type="checkbox" class="refund-item-checkbox" data-item-index="${index}" data-item-price="${item.store_price || 0}" id="refund-item-${index}">
                <label for="refund-item-${index}" class="refund-item-label">
                    <span class="refund-item-desc">${itemDesc}</span>
                    <span class="refund-item-price">$${(item.store_price || 0).toFixed(2)}</span>
                </label>
            </div>
        `;
    });
    
    itemsContainer.innerHTML = itemsHtml;
    
    // Add event listeners to checkboxes
    document.querySelectorAll('.refund-item-checkbox').forEach(cb => {
        cb.addEventListener('change', updateRefundTotal);
    });
    
    // Reset form
    refundAmount.value = '0.00';
    refundReason.value = 'Customer request';
    if (refundError) refundError.style.display = 'none';
    processBtn.disabled = true;
    
    // Show modal
    modal.style.display = 'flex';
    
    // Refresh terminals
    if (terminalSelect) {
        refreshTerminalsForRefund();
    }
}

// Update refund total based on selected items
function updateRefundTotal() {
    const checkboxes = document.querySelectorAll('.refund-item-checkbox:checked');
    const refundAmount = document.getElementById('refund-amount');
    const processBtn = document.getElementById('process-refund-btn');
    
    if (!refundAmount || !processBtn) return;
    
    let total = 0;
    checkboxes.forEach(cb => {
        total += parseFloat(cb.dataset.itemPrice) || 0;
    });
    
    refundAmount.value = total.toFixed(2);
    processBtn.disabled = checkboxes.length === 0;
}

// Refresh terminals for refund
async function refreshTerminalsForRefund() {
    const terminalSelect = document.getElementById('refund-terminal-select');
    if (!terminalSelect) return;
    
    terminalSelect.innerHTML = '<option value="">Loading terminals...</option>';
    
    const response = await fetch(`${AppConfig.baseUrl}/api/square/terminals`, {
        credentials: 'include'
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch terminals: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.status !== 'success') {
        throw new Error(data.error || 'Failed to fetch terminals');
    }
    
    refundAvailableTerminals = data.terminals || [];
    renderTerminalSelect(terminalSelect, refundAvailableTerminals);
}

// Render terminal select dropdown
function renderTerminalSelect(selectElement, terminals) {
    const onlineTerminals = terminals.filter(t => t.status === 'ONLINE');
    
    if (onlineTerminals.length === 0) {
        selectElement.innerHTML = '<option value="">No online terminals</option>';
        return;
    }
    
    let html = '<option value="">Select a terminal...</option>';
    onlineTerminals.forEach(terminal => {
        let terminalId = terminal.id;
        if (terminalId && terminalId.startsWith('device:')) {
            terminalId = terminalId.replace('device:', '');
        }
        html += `<option value="${terminalId}">${escapeHtml(terminal.device_name) || 'Square Terminal'} (Online)</option>`;
    });
    
    selectElement.innerHTML = html;
}

// Close refund modal
function closeRefundModal() {
    const modal = document.getElementById('refund-modal');
    if (modal) modal.style.display = 'none';
    currentReceiptForRefund = null;
    selectedRefundItems.clear();
}

// Process refund
async function processRefund() {
    if (!currentReceiptForRefund) {
        throw new Error('No receipt selected for refund');
    }
    
    // Get selected items
    const selectedCheckboxes = document.querySelectorAll('.refund-item-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        throw new Error('Please select items to refund');
    }
    
    const refundAmount = parseFloat(document.getElementById('refund-amount')?.value);
    if (isNaN(refundAmount) || refundAmount <= 0) {
        throw new Error('Invalid refund amount');
    }
    
    const refundReason = document.getElementById('refund-reason')?.value || 'Customer request';
    const terminalId = document.getElementById('refund-terminal-select')?.value;
    const paymentMethod = currentReceiptForRefund.paymentMethod;
    
    // Get selected items data
    const selectedItems = [];
    const remainingItems = [];
    
    selectedCheckboxes.forEach(cb => {
        const index = parseInt(cb.dataset.itemIndex);
        selectedItems.push(currentReceiptForRefund.items[index]);
    });
    
    // Get remaining items (not selected for refund)
    currentReceiptForRefund.items.forEach((item, index) => {
        const isSelected = Array.from(selectedCheckboxes).some(cb => parseInt(cb.dataset.itemIndex) === index);
        if (!isSelected) {
            remainingItems.push(item);
        }
    });
    
    const processBtn = document.getElementById('process-refund-btn');
    if (processBtn) {
        processBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Processing...';
        processBtn.disabled = true;
    }
    
    try {
        // Prepare refund request
        const refundRequest = {
            amount: refundAmount,
            reason: refundReason,
            payment_method: paymentMethod,
            items: selectedItems.map(item => ({
                id: item.id,
                type: item.type,
                price: item.store_price
            }))
        };
        
        // For Square payments, include payment_id if we have it
        if (paymentMethod === 'Square Terminal' || paymentMethod === 'Square') {
            if (!currentReceiptForRefund.square_payment_id) {
                throw new Error('No Square payment ID found for this receipt. Cannot process refund through Square.');
            }
            
            refundRequest.payment_id = currentReceiptForRefund.square_payment_id;
            
            // Add terminal ID if selected
            if (terminalId) {
                refundRequest.device_id = terminalId;
            }
            
            // Call Square refund API
            console.log('Calling Square refund API with:', refundRequest);
            
            const response = await fetch(`${AppConfig.baseUrl}/api/square/refund`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(refundRequest)
            });
            
            const responseData = await response.json();
            
            if (!response.ok) {
                throw new Error(responseData.error || `HTTP error ${response.status}`);
            }
            
            if (responseData.status !== 'success') {
                throw new Error(responseData.message || 'Refund failed');
            }
            
            console.log('Square refund successful:', responseData);
        }
        
        // Update the receipt in database
        if (remainingItems.length === 0) {
            // All items refunded - delete the receipt from database
            const deleteResponse = await fetch(`${AppConfig.baseUrl}/api/receipts/${currentReceiptForRefund.id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (!deleteResponse.ok) {
                throw new Error(`Failed to delete receipt: ${deleteResponse.status}`);
            }
            
            // Remove from local array
            const index = window.savedReceipts.findIndex(r => r.id === currentReceiptForRefund.id);
            if (index !== -1) {
                window.savedReceipts.splice(index, 1);
            }
        } else {
            // Partial refund - update the receipt
            const receipt = window.savedReceipts.find(r => r.id === currentReceiptForRefund.id);
            if (!receipt) {
                throw new Error('Receipt not found in local array');
            }
            
            receipt.items = remainingItems;
            
            // Recalculate totals
            const subtotal = remainingItems.reduce((sum, item) => sum + (item.store_price || 0), 0);
            const discount = receipt.discount || 0;
            const discountedSubtotal = subtotal - discount;
            const taxRate = (receipt.taxRate || 0) / 100;
            const tax = discountedSubtotal * taxRate;
            const total = discountedSubtotal + tax;
            
            receipt.subtotal = discountedSubtotal;
            receipt.tax = tax;
            receipt.total = total;
            
            // Save updated receipt to database
            await saveReceipt(receipt);
        }
        
        // Refresh display
        renderReceipts(window.savedReceipts);
        
        alert(`✅ Refund of $${refundAmount.toFixed(2)} processed successfully`);
        closeRefundModal();
        
    } catch (error) {
        console.error('Refund error:', error);
        alert(`❌ Refund failed: ${error.message}`);
    } finally {
        if (processBtn) {
            processBtn.innerHTML = '<i class="fas fa-undo"></i> Process Refund';
            processBtn.disabled = false;
        }
    }
}

// Download receipt as PDF (placeholder - implement later)
function downloadReceiptPDF(receiptId) {
    alert('PDF download functionality coming soon!');
}

// Print receipt
function printReceipt(receiptId) {
    const receipt = window.savedReceipts.find(r => r.id === receiptId);
    if (!receipt) {
        throw new Error(`Receipt ${receiptId} not found`);
    }
    
    if (typeof receipt.date === 'string') {
        receipt.date = new Date(receipt.date);
    }
    
    showReceiptModal(receipt);
    setTimeout(() => {
        window.print();
    }, 500);
}

// Print to thermal printer (placeholder - implement later)
function printToThermalPrinter(text) {
    console.log('Thermal print would happen here:', text?.substring(0, 100));
    // Implement actual thermal printing here
}

// Format receipt for printer (placeholder - implement later)
function formatReceiptForPrinter(transaction) {
    return JSON.stringify(transaction, null, 2);
}

// Initialize when tab is activated
document.addEventListener('tabChanged', async function(e) {
    if (e.detail.tabName === 'receipts') {
        try {
            await loadSavedReceipts();
            renderReceipts(window.savedReceipts);
        } catch (error) {
            console.error('Failed to load receipts:', error);
            alert(`Error loading receipts: ${error.message}`);
        }
    }
});

// Make functions globally available
window.loadSavedReceipts = loadSavedReceipts;
window.saveReceipt = saveReceipt;
window.renderReceipts = renderReceipts;
window.searchReceipts = searchReceipts;
window.resetReceiptSearch = resetReceiptSearch;
window.viewReceiptDetails = viewReceiptDetails;
window.closeReceiptModal = closeReceiptModal;
window.showRefundModal = showRefundModal;
window.closeRefundModal = closeRefundModal;
window.processRefund = processRefund;
window.downloadReceiptPDF = downloadReceiptPDF;
window.printReceipt = printReceipt;
window.printToThermalPrinter = printToThermalPrinter;
window.formatReceiptForPrinter = formatReceiptForPrinter;

console.log('✅ Receipt functions attached to window');