// ============================================================================
// refunds.js - Refund Functionality
// ============================================================================

// Make sure we have access to the receipts data
let refundReceipts = [];

// Initialize refunds module
function initRefunds() {
    console.log('Initializing refunds module');
    
    // Try to get receipts from the global variable
    if (typeof window.allReceipts !== 'undefined') {
        refundReceipts = window.allReceipts;
        console.log('Found', refundReceipts.length, 'receipts from global');
    }
    
    // Also try to get from the receipts module
    if (typeof allReceipts !== 'undefined') {
        refundReceipts = allReceipts;
        console.log('Found', refundReceipts.length, 'receipts from local');
    }
}

// Call init when loaded
initRefunds();

// Listen for receipt updates
document.addEventListener('receiptsLoaded', function(e) {
    if (e.detail && e.detail.receipts) {
        refundReceipts = e.detail.receipts;
        console.log('Refunds: received', refundReceipts.length, 'receipts');
    }
});

// Also try to get receipts when the receipts tab is shown
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'receipts') {
        // Give the receipts module time to load
        setTimeout(() => {
            if (typeof window.allReceipts !== 'undefined') {
                refundReceipts = window.allReceipts;
                console.log('Refunds: updated from receipts tab, now have', refundReceipts.length, 'receipts');
            }
            if (typeof allReceipts !== 'undefined') {
                refundReceipts = allReceipts;
                console.log('Refunds: updated from local, now have', refundReceipts.length, 'receipts');
            }
        }, 500);
    }
});

// Show refund modal
window.showRefundModal = function(receiptId) {
    console.log('showRefundModal called with receiptId:', receiptId);
    console.log('Current refundReceipts:', refundReceipts ? refundReceipts.length : 0);
    
    // Try to get fresh receipts if we don't have any
    if (!refundReceipts || refundReceipts.length === 0) {
        if (typeof window.allReceipts !== 'undefined') {
            refundReceipts = window.allReceipts;
            console.log('Got receipts from window.allReceipts:', refundReceipts.length);
        } else if (typeof allReceipts !== 'undefined') {
            refundReceipts = allReceipts;
            console.log('Got receipts from allReceipts:', refundReceipts.length);
        } else {
            console.error('No receipts available');
            alert('Unable to load receipt data. Please refresh the receipts tab first.');
            return;
        }
    }
    
    // Find the receipt
    const receipt = refundReceipts.find(r => 
        r.receipt_id === receiptId || r.id === receiptId
    );
    
    console.log('Found receipt:', receipt);
    
    if (!receipt) {
        console.error('Receipt not found with ID:', receiptId);
        alert('Receipt not found. Please refresh and try again.');
        return;
    }
    
    const modal = document.getElementById('refund-modal');
    const receiptInfo = document.getElementById('refund-receipt-info');
    const itemsContainer = document.getElementById('refund-items-container');
    const refundAmount = document.getElementById('refund-amount');
    const processBtn = document.getElementById('process-refund-btn');
    const terminalSelect = document.getElementById('refund-terminal-select');
    
    if (!modal || !receiptInfo || !itemsContainer || !refundAmount || !processBtn) {
        console.error('Refund modal elements not found');
        return;
    }
    
    // Parse transaction data
    const transactionData = parseTransactionData(receipt);
    
    // Format date
    const formattedDate = formatReceiptDate(receipt);
    
    // Populate terminal select if available
    if (terminalSelect) {
        populateTerminalSelect(terminalSelect);
    }
    
    // Show receipt info
    receiptInfo.innerHTML = `
        <p><strong>Receipt:</strong> #${escapeHtml(receiptId)}</p>
        <p><strong>Date:</strong> ${escapeHtml(formattedDate)}</p>
        <p><strong>Total:</strong> $${(transactionData.total || receipt.total || 0).toFixed(2)}</p>
        <p><strong>Payment Method:</strong> ${escapeHtml(transactionData.paymentMethod || receipt.payment_method || 'Unknown')}</p>
    `;
    
    // Show items
    const items = transactionData.items || receipt.items || [];
    let itemsHtml = '<h4>Select items to refund:</h4>';
    
    if (Array.isArray(items) && items.length > 0) {
        items.forEach((item, index) => {
            let description = '';
            if (item.type === 'accessory') {
                description = item.description || 'Accessory';
            } else if (item.type === 'custom') {
                description = item.note || 'Custom Item';
            } else {
                description = `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`;
            }
            
            const price = parseFloat(item.store_price) || 0;
            
            itemsHtml += `
                <div class="refund-item" style="padding: 8px; margin: 5px 0; background: #f8f9fa; border-radius: 4px;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                        <input type="checkbox" class="refund-item-checkbox" data-index="${index}" data-price="${price}" checked>
                        <span style="flex: 1;">${escapeHtml(description)}</span>
                        <span style="font-weight: bold;">$${price.toFixed(2)}</span>
                    </label>
                </div>
            `;
        });
    } else {
        itemsHtml += '<p style="color: #666; text-align: center; padding: 20px;">No items found on this receipt</p>';
    }
    
    itemsContainer.innerHTML = itemsHtml;
    
    // Set refund amount to total
    const totalAmount = transactionData.total || receipt.total || 0;
    refundAmount.value = totalAmount.toFixed(2);
    refundAmount.readOnly = true; // Make it read-only since we're using checkboxes
    
    // Add event listeners to checkboxes
    document.querySelectorAll('.refund-item-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateRefundAmount);
    });
    
    // Enable process button
    processBtn.disabled = false;
    
    // Store receipt ID for later use
    modal.dataset.currentReceiptId = receiptId;
    
    modal.style.display = 'flex';
};

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

// Populate terminal select
async function populateTerminalSelect(selectEl) {
    try {
        selectEl.innerHTML = '<option value="">Loading terminals...</option>';
        
        const response = await fetch(`${AppConfig.baseUrl}/api/square/terminals`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load terminals: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success' && data.terminals) {
            const onlineTerminals = data.terminals.filter(t => t.status === 'ONLINE');
            
            if (onlineTerminals.length > 0) {
                selectEl.innerHTML = '<option value="">Select a terminal...</option>';
                onlineTerminals.forEach(terminal => {
                    let terminalId = terminal.id;
                    if (terminalId && terminalId.startsWith('device:')) {
                        terminalId = terminalId.replace('device:', '');
                    }
                    selectEl.innerHTML += `<option value="${terminalId}">${escapeHtml(terminal.device_name) || 'Square Terminal'} (Online)</option>`;
                });
            } else {
                selectEl.innerHTML = '<option value="">No online terminals available</option>';
            }
        } else {
            selectEl.innerHTML = '<option value="">No terminals found</option>';
        }
    } catch (error) {
        console.error('Error loading terminals:', error);
        selectEl.innerHTML = '<option value="">Error loading terminals</option>';
    }
}

// Parse transaction data
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

// Format receipt date
function formatReceiptDate(receipt) {
    if (!receipt) return 'Invalid Date';
    
    try {
        let dateValue;
        
        if (receipt.transaction_data) {
            if (typeof receipt.transaction_data === 'string') {
                try {
                    const transactionData = JSON.parse(receipt.transaction_data);
                    dateValue = transactionData.date;
                } catch (e) {}
            } else if (typeof receipt.transaction_data === 'object') {
                dateValue = receipt.transaction_data.date;
            }
        }
        
        if (!dateValue) {
            dateValue = receipt.created_at || receipt.date;
        }
        
        if (!dateValue) return 'Invalid Date';
        
        let date;
        if (typeof dateValue === 'string') {
            if (dateValue.includes('T')) {
                date = new Date(dateValue);
            } else if (dateValue.includes(' ')) {
                date = new Date(dateValue.replace(' ', 'T') + 'Z');
            } else {
                date = new Date(dateValue);
            }
        } else if (typeof dateValue === 'number') {
            date = new Date(dateValue);
        } else if (dateValue instanceof Date) {
            date = dateValue;
        } else {
            return 'Invalid Date';
        }
        
        if (isNaN(date.getTime())) {
            return 'Invalid Date';
        }
        
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    } catch (e) {
        return 'Invalid Date';
    }
}

// Close refund modal
window.closeRefundModal = function() {
    const modal = document.getElementById('refund-modal');
    if (modal) {
        modal.style.display = 'none';
        // Clear selections
        modal.dataset.currentReceiptId = '';
    }
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
            errorDiv.textContent = 'Please select at least one item to refund';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    // Get selected items
    const selectedItems = [];
    document.querySelectorAll('.refund-item-checkbox:checked').forEach(cb => {
        selectedItems.push({
            index: parseInt(cb.dataset.index),
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
    
    const receiptId = modal.dataset.currentReceiptId;
    const receipt = refundReceipts.find(r => r.receipt_id === receiptId || r.id === receiptId);
    
    if (!receipt) {
        if (errorDiv) {
            errorDiv.textContent = 'Receipt not found';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    const transactionData = parseTransactionData(receipt);
    const paymentMethod = transactionData.paymentMethod || receipt.payment_method || 'Unknown';
    
    // Show processing state
    const processBtn = document.getElementById('process-refund-btn');
    const originalText = processBtn.innerHTML;
    processBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Processing...';
    processBtn.disabled = true;
    
    try {
        // Here you would implement the actual refund logic
        console.log('Processing refund:', {
            receiptId: receiptId,
            amount: parseFloat(refundAmount),
            reason: refundReason,
            items: selectedItems,
            terminal: terminalSelect?.value,
            paymentMethod: paymentMethod
        });
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Show success message
        alert(`Refund of $${parseFloat(refundAmount).toFixed(2)} processed successfully!`);
        
        // Close modal
        closeRefundModal();
        
    } catch (error) {
        console.error('Refund error:', error);
        if (errorDiv) {
            errorDiv.textContent = `Refund failed: ${error.message}`;
            errorDiv.style.display = 'block';
        }
        processBtn.innerHTML = originalText;
        processBtn.disabled = false;
    }
};

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add CSS for refund modal if not already present
function addRefundModalStyles() {
    const styleId = 'refund-modal-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .refund-item {
            transition: background-color 0.2s;
        }
        .refund-item:hover {
            background-color: #e9ecef !important;
        }
        .refund-item input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }
        #refund-error {
            color: #dc3545;
            padding: 10px;
            border-radius: 4px;
            margin-top: 10px;
            display: none;
        }
        #refund-terminal-select {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            margin-bottom: 15px;
        }
    `;
    document.head.appendChild(style);
}

// Add styles when loaded
addRefundModalStyles();

console.log('✅ refunds.js loaded');