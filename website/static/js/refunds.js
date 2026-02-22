// ============================================================================
// refunds.js - Refund Functionality for Receipts Tab
// ============================================================================

console.log('✅ refunds.js loaded successfully');

// Refund variables
let currentRefundReceipt = null;

// Show refund modal for a receipt
function showRefundModal(receiptId) {
    console.log('Showing refund modal for receipt:', receiptId);
    
    // Find the receipt
    const receipt = window.savedReceipts.find(r => r.id === receiptId);
    if (!receipt) {
        alert('Receipt not found');
        return;
    }
    
    currentRefundReceipt = receipt;
    
    // Get modal elements
    const modal = document.getElementById('refund-modal');
    const receiptInfo = document.getElementById('refund-receipt-info');
    const itemsContainer = document.getElementById('refund-items-container');
    const refundAmount = document.getElementById('refund-amount');
    const refundReason = document.getElementById('refund-reason');
    const refundError = document.getElementById('refund-error');
    const processBtn = document.getElementById('process-refund-btn');
    const terminalSelect = document.getElementById('refund-terminal-select');
    
    // Check if modal exists
    if (!modal) {
        console.error('❌ Refund modal not found in DOM');
        alert('Error: Refund modal not found. Please refresh the page.');
        return;
    }
    
    // Show receipt info
    if (receiptInfo) {
        const dateStr = new Date(receipt.date).toLocaleString();
        receiptInfo.innerHTML = `
            <div><strong>Receipt:</strong> ${escapeHtml(receipt.id)}</div>
            <div><strong>Date:</strong> ${dateStr}</div>
            <div><strong>Original Total:</strong> $${(receipt.total || 0).toFixed(2)}</div>
            <div><strong>Payment Method:</strong> ${escapeHtml(receipt.paymentMethod || 'Unknown')}</div>
        `;
    }
    
    // Show items with checkboxes
    if (itemsContainer) {
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
    }
    
    // Reset form
    if (refundAmount) refundAmount.value = '0.00';
    if (refundReason) refundReason.value = 'Customer request';
    if (refundError) refundError.style.display = 'none';
    if (processBtn) processBtn.disabled = true;
    
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
    
    let total = 0;
    checkboxes.forEach(cb => {
        total += parseFloat(cb.dataset.itemPrice) || 0;
    });
    
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
            const terminals = data.terminals || [];
            renderTerminalSelect(terminalSelect, terminals);
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
    currentRefundReceipt = null;
}

// Process refund
async function processRefund() {
    if (!currentRefundReceipt) {
        alert('No receipt selected for refund');
        return;
    }
    
    // Get selected items
    const selectedCheckboxes = document.querySelectorAll('.refund-item-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert('Please select items to refund');
        return;
    }
    
    const refundAmount = parseFloat(document.getElementById('refund-amount')?.value || 0);
    const refundReason = document.getElementById('refund-reason')?.value || 'Customer request';
    const terminalId = document.getElementById('refund-terminal-select')?.value;
    const paymentMethod = currentRefundReceipt.paymentMethod;
    
    // Get selected items data
    const selectedItems = [];
    const remainingItems = [];
    
    selectedCheckboxes.forEach(cb => {
        const index = parseInt(cb.dataset.itemIndex);
        selectedItems.push(currentRefundReceipt.items[index]);
    });
    
    // Get remaining items (not selected for refund)
    currentRefundReceipt.items.forEach((item, index) => {
        const isSelected = Array.from(selectedCheckboxes).some(cb => parseInt(cb.dataset.itemIndex) === index);
        if (!isSelected) {
            remainingItems.push(item);
        }
    });
    
    // Validate refund amount
    if (isNaN(refundAmount) || refundAmount <= 0) {
        alert('Please enter a valid refund amount');
        return;
    }
    
    // Process based on payment method
    const processBtn = document.getElementById('process-refund-btn');
    if (processBtn) {
        processBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Processing...';
        processBtn.disabled = true;
    }
    
    try {
        if (paymentMethod === 'Square Terminal' || paymentMethod === 'Square') {
            // Square refund
            if (!terminalId) {
                alert('Please select a Square terminal');
                if (processBtn) {
                    processBtn.innerHTML = '<i class="fas fa-undo"></i> Process Refund';
                    processBtn.disabled = false;
                }
                return;
            }
            
            // Call Square refund API
            const response = await fetch(`${AppConfig.baseUrl}/api/square/refund`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payment_id: currentRefundReceipt.id,
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
            const index = window.savedReceipts.findIndex(r => r.id === currentRefundReceipt.id);
            if (index !== -1) {
                window.savedReceipts.splice(index, 1);
            }
        } else {
            // Partial refund - update the receipt
            const receipt = window.savedReceipts.find(r => r.id === currentRefundReceipt.id);
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
        if (typeof window.renderReceipts === 'function') {
            window.renderReceipts(window.savedReceipts);
        }
        
        alert(`Refund of $${refundAmount.toFixed(2)} processed successfully`);
        closeRefundModal();
        
    } catch (error) {
        console.error('Refund error:', error);
        alert(`Refund failed: ${error.message}`);
    } finally {
        if (processBtn) {
            processBtn.innerHTML = '<i class="fas fa-undo"></i> Process Refund';
            processBtn.disabled = false;
        }
    }
}

// Make functions globally available
window.showRefundModal = showRefundModal;
window.closeRefundModal = closeRefundModal;
window.processRefund = processRefund;
window.refreshTerminalsForRefund = refreshTerminalsForRefund;

console.log('✅ Refund functions attached to window');