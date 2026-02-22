// ============================================================================
// receipts.js - Receipts Tab Functionality with Refunds
// ============================================================================

console.log('✅ receipts.js loaded successfully!');

// Global variables - renamed to avoid conflict with checkout.js
let currentReceiptForRefund = null;
let selectedRefundItems = new Set();
let refundAvailableTerminals = []; // Renamed from availableTerminals

// Load saved receipts from localStorage
function loadSavedReceipts() {
    console.log('Loading saved receipts...');
    const saved = localStorage.getItem('pigstyle_receipts');
    if (saved) {
        try {
            window.savedReceipts = JSON.parse(saved);
            window.savedReceipts.forEach(receipt => {
                receipt.date = new Date(receipt.date);
                // Ensure items array exists
                if (!receipt.items) receipt.items = [];
            });
            console.log(`Loaded ${window.savedReceipts.length} receipts`);
        } catch (e) {
            console.error('Error loading receipts:', e);
            window.savedReceipts = [];
        }
    } else {
        console.log('No receipts found');
        window.savedReceipts = [];
    }
    return window.savedReceipts;
}

// Save a receipt to localStorage
function saveReceipt(transaction) {
    console.log('Saving receipt:', transaction.id);
    const receiptToSave = {
        ...transaction,
        date: transaction.date.toISOString()
    };
    
    if (!window.savedReceipts) window.savedReceipts = [];
    window.savedReceipts.unshift(receiptToSave);
    
    if (window.savedReceipts.length > 1000) {
        window.savedReceipts = window.savedReceipts.slice(0, 1000);
    }
    
    localStorage.setItem('pigstyle_receipts', JSON.stringify(window.savedReceipts));
    console.log('Receipt saved. Total receipts:', window.savedReceipts.length);
    
    // Always refresh the receipts tab if it's active
    if (document.getElementById('receipts-tab')?.classList.contains('active')) {
        renderReceipts(window.savedReceipts);
    }
}

// Render receipts with item details
function renderReceipts(receipts) {
    const container = document.getElementById('receipts-grid');
    if (!container) {
        console.error('Receipts grid container not found');
        return;
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
    
    if (totalReceiptsEl) totalReceiptsEl.textContent = receipts.length;
    if (totalSalesEl) totalSalesEl.textContent = `$${totalSales.toFixed(2)}`;
    if (totalTaxEl) totalTaxEl.textContent = `$${totalTax.toFixed(2)}`;
    if (totalItemsEl) totalItemsEl.textContent = totalItems;
}

// View receipt details in modal
function viewReceiptDetails(receiptId) {
    const receipt = window.savedReceipts.find(r => r.id === receiptId);
    if (!receipt) return;
    
    if (typeof receipt.date === 'string') {
        receipt.date = new Date(receipt.date);
    }
    
    showReceiptModal(receipt);
}

// Show receipt in modal
function showReceiptModal(transaction) {
    const modal = document.getElementById('receipt-modal');
    const content = document.getElementById('receipt-content');
    if (!modal || !content) return;
    
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
    document.getElementById('receipt-modal').style.display = 'none';
}

// Search receipts with item-level search
function searchReceipts() {
    const startDate = document.getElementById('receipt-start-date').value;
    const endDate = document.getElementById('receipt-end-date').value;
    const query = document.getElementById('receipt-search-query').value.toLowerCase().trim();
    
    let filtered = [...(window.savedReceipts || [])];
    
    // Filter by date
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
    
    // Filter by search query (searches receipt ID and all item fields)
    if (query) {
        filtered = filtered.filter(receipt => {
            // Search receipt ID
            if (receipt.id.toLowerCase().includes(query)) return true;
            
            // Search through all items
            return receipt.items.some(item => {
                if (item.artist && item.artist.toLowerCase().includes(query)) return true;
                if (item.title && item.title.toLowerCase().includes(query)) return true;
                if (item.catalog_number && item.catalog_number.toLowerCase().includes(query)) return true;
                if (item.description && item.description.toLowerCase().includes(query)) return true;
                if (item.note && item.note.toLowerCase().includes(query)) return true;
                return false;
            });
        });
    }
    
    renderReceipts(filtered);
}

// Reset receipt search
function resetReceiptSearch() {
    document.getElementById('receipt-start-date').value = '';
    document.getElementById('receipt-end-date').value = '';
    document.getElementById('receipt-search-query').value = '';
    renderReceipts(window.savedReceipts || []);
}

// Show refund modal for a receipt
function showRefundModal(receiptId) {
    const receipt = window.savedReceipts.find(r => r.id === receiptId);
    if (!receipt) {
        alert('Receipt not found');
        return;
    }
    
    currentReceiptForRefund = receipt;
    selectedRefundItems.clear();
    
    // Refresh terminals
    refreshTerminalsForRefund();
    
    // Populate refund modal
    const modal = document.getElementById('refund-modal');
    const itemsContainer = document.getElementById('refund-items-container');
    const receiptInfo = document.getElementById('refund-receipt-info');
    
    if (!modal || !itemsContainer || !receiptInfo) {
        console.error('Refund modal elements not found');
        return;
    }
    
    // Show receipt info
    const dateStr = new Date(receipt.date).toLocaleString();
    receiptInfo.innerHTML = `
        <div><strong>Receipt:</strong> ${escapeHtml(receipt.id)}</div>
        <div><strong>Date:</strong> ${dateStr}</div>
        <div><strong>Original Total:</strong> $${(receipt.total || 0).toFixed(2)}</div>
        <div><strong>Payment Method:</strong> ${escapeHtml(receipt.paymentMethod || 'Unknown')}</div>
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
    
    // Reset refund amount and reason
    const refundAmount = document.getElementById('refund-amount');
    const refundReason = document.getElementById('refund-reason');
    const refundError = document.getElementById('refund-error');
    const processBtn = document.getElementById('process-refund-btn');
    
    if (refundAmount) refundAmount.value = '0.00';
    if (refundReason) refundReason.value = 'Customer request';
    if (refundError) refundError.style.display = 'none';
    if (processBtn) processBtn.disabled = true;
    
    // Show modal
    modal.style.display = 'flex';
}

// Update refund total based on selected items
function updateRefundTotal() {
    const checkboxes = document.querySelectorAll('.refund-item-checkbox:checked');
    let total = 0;
    
    checkboxes.forEach(cb => {
        total += parseFloat(cb.dataset.itemPrice) || 0;
    });
    
    const refundAmount = document.getElementById('refund-amount');
    const processBtn = document.getElementById('process-refund-btn');
    
    if (refundAmount) refundAmount.value = total.toFixed(2);
    if (processBtn) processBtn.disabled = checkboxes.length === 0;
}

// Refresh terminals for refund
async function refreshTerminalsForRefund() {
    const terminalSelect = document.getElementById('refund-terminal-select');
    if (!terminalSelect) return;
    
    terminalSelect.innerHTML = '<option value="">Loading terminals...</option>';
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/square/terminals`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to fetch terminals');
        
        const data = await response.json();
        if (data.status === 'success') {
            refundAvailableTerminals = data.terminals || [];
            renderTerminalSelect(terminalSelect, refundAvailableTerminals);
        }
    } catch (error) {
        console.error('Error fetching terminals:', error);
        terminalSelect.innerHTML = '<option value="">No terminals available</option>';
    }
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
        showCheckoutStatus('No receipt selected for refund', 'error');
        return;
    }
    
    // Get selected items
    const selectedCheckboxes = document.querySelectorAll('.refund-item-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showCheckoutStatus('Please select items to refund', 'error');
        return;
    }
    
    const refundAmount = parseFloat(document.getElementById('refund-amount').value);
    const refundReason = document.getElementById('refund-reason').value;
    const terminalId = document.getElementById('refund-terminal-select').value;
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
    
    // Validate refund amount
    if (isNaN(refundAmount) || refundAmount <= 0) {
        showCheckoutStatus('Please enter a valid refund amount', 'error');
        return;
    }
    
    // Process based on payment method
    const processBtn = document.getElementById('process-refund-btn');
    const originalText = processBtn.innerHTML;
    processBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Processing...';
    processBtn.disabled = true;
    
    try {
        if (paymentMethod === 'Square Terminal' || paymentMethod === 'Square') {
            // Square refund
            if (!terminalId) {
                showCheckoutStatus('Please select a Square terminal', 'error');
                processBtn.innerHTML = originalText;
                processBtn.disabled = false;
                return;
            }
            
            // Call Square refund API
            const response = await fetch(`${AppConfig.baseUrl}/api/square/refund`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payment_id: currentReceiptForRefund.id,
                    amount: refundAmount,
                    reason: refundReason,
                    device_id: terminalId,
                    items: selectedItems.map(item => ({
                        id: item.id,
                        type: item.type,
                        price: item.store_price
                    }))
                })
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(error);
            }
            
            const data = await response.json();
            if (data.status !== 'success') {
                throw new Error(data.message || 'Refund failed');
            }
        }
        
        // Update the receipt in localStorage
        if (remainingItems.length === 0) {
            // All items refunded - remove the receipt
            const index = window.savedReceipts.findIndex(r => r.id === currentReceiptForRefund.id);
            if (index !== -1) {
                window.savedReceipts.splice(index, 1);
            }
        } else {
            // Partial refund - update the receipt
            const receipt = window.savedReceipts.find(r => r.id === currentReceiptForRefund.id);
            if (receipt) {
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
            }
        }
        
        // Save updated receipts
        localStorage.setItem('pigstyle_receipts', JSON.stringify(window.savedReceipts));
        
        // Refresh display
        renderReceipts(window.savedReceipts);
        
        showCheckoutStatus(`Refund of $${refundAmount.toFixed(2)} processed successfully`, 'success');
        closeRefundModal();
        
    } catch (error) {
        console.error('Refund error:', error);
        showCheckoutStatus(`Refund failed: ${error.message}`, 'error');
    } finally {
        processBtn.innerHTML = originalText;
        processBtn.disabled = false;
    }
}

// Download receipt as PDF (placeholder)
function downloadReceiptPDF(receiptId) {
    console.log('Download PDF for receipt:', receiptId);
    alert('PDF download functionality coming soon!');
}

// Print receipt
function printReceipt(receiptId) {
    const receipt = window.savedReceipts.find(r => r.id === receiptId);
    if (!receipt) return;
    
    if (typeof receipt.date === 'string') {
        receipt.date = new Date(receipt.date);
    }
    
    showReceiptModal(receipt);
    setTimeout(() => {
        window.print();
    }, 500);
}

// Print to thermal printer (placeholder)
function printToThermalPrinter(text) {
    console.log('Thermal print:', text?.substring(0, 100));
}

// Format receipt for printer (placeholder)
function formatReceiptForPrinter(transaction) {
    return JSON.stringify(transaction, null, 2);
}

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'receipts') {
        loadSavedReceipts();
        renderReceipts(window.savedReceipts);
    }
});

// Explicitly attach all functions to window object
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

// Log confirmation
console.log('✅ Receipt functions attached to window:', {
    saveReceipt: typeof window.saveReceipt === 'function',
    resetReceiptSearch: typeof window.resetReceiptSearch === 'function',
    printToThermalPrinter: typeof window.printToThermalPrinter === 'function',
    formatReceiptForPrinter: typeof window.formatReceiptForPrinter === 'function',
    showRefundModal: typeof window.showRefundModal === 'function'
});