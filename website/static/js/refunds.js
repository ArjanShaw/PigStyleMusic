// ============================================================================
// refunds.js - Refund Functionality
// ============================================================================

// Refund variables
let currentRefundTransaction = null;

function showRefundModal() {
    document.getElementById('refund-search').value = '';
    document.getElementById('refund-transaction-details').style.display = 'none';
    document.getElementById('refund-error').style.display = 'none';
    document.getElementById('process-refund-btn').disabled = true;
    currentRefundTransaction = null;
    
    document.getElementById('refund-modal').style.display = 'flex';
}

function closeRefundModal() {
    document.getElementById('refund-modal').style.display = 'none';
    currentRefundTransaction = null;
}

function searchRefundTransaction() {
    const searchTerm = document.getElementById('refund-search').value.trim().toLowerCase();
    const errorDiv = document.getElementById('refund-error');
    
    if (!searchTerm) {
        errorDiv.textContent = 'Please enter a receipt number or transaction ID';
        errorDiv.style.display = 'block';
        return;
    }
    
    const receipt = savedReceipts.find(r => 
        r.id.toLowerCase().includes(searchTerm)
    );
    
    if (receipt) {
        currentRefundTransaction = receipt;
        
        document.getElementById('refund-receipt-id').textContent = receipt.id;
        document.getElementById('refund-date').textContent = new Date(receipt.date).toLocaleString();
        document.getElementById('refund-original-amount').textContent = `$${receipt.total.toFixed(2)}`;
        document.getElementById('refund-amount').value = receipt.total.toFixed(2);
        document.getElementById('refund-amount').max = receipt.total;
        
        document.getElementById('refund-transaction-details').style.display = 'block';
        errorDiv.style.display = 'none';
        document.getElementById('process-refund-btn').disabled = false;
        
        document.getElementById('refund-amount').addEventListener('input', function() {
            const amount = parseFloat(this.value) || 0;
            const maxAmount = receipt.total;
            
            if (amount <= 0) {
                errorDiv.textContent = 'Refund amount must be greater than 0';
                errorDiv.style.display = 'block';
                document.getElementById('process-refund-btn').disabled = true;
            } else if (amount > maxAmount) {
                errorDiv.textContent = `Refund amount cannot exceed $${maxAmount.toFixed(2)}`;
                errorDiv.style.display = 'block';
                document.getElementById('process-refund-btn').disabled = true;
            } else {
                errorDiv.style.display = 'none';
                document.getElementById('process-refund-btn').disabled = false;
            }
        });
    } else {
        errorDiv.textContent = 'No transaction found with that ID';
        errorDiv.style.display = 'block';
        document.getElementById('refund-transaction-details').style.display = 'none';
        document.getElementById('process-refund-btn').disabled = true;
    }
}

async function processRefund() {
    if (!currentRefundTransaction) {
        showCheckoutStatus('No transaction selected for refund', 'error');
        return;
    }
    
    const refundAmount = parseFloat(document.getElementById('refund-amount').value);
    const refundReason = document.getElementById('refund-reason').value;
    
    if (isNaN(refundAmount) || refundAmount <= 0) {
        showCheckoutStatus('Please enter a valid refund amount', 'error');
        return;
    }
    
    if (refundAmount > currentRefundTransaction.total) {
        showCheckoutStatus('Refund amount cannot exceed original transaction total', 'error');
        return;
    }
    
    const processBtn = document.getElementById('process-refund-btn');
    const originalText = processBtn.innerHTML;
    processBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Processing...';
    processBtn.disabled = true;
    
    try {
        if (currentRefundTransaction.id.startsWith('SQUARE-')) {
            showCheckoutStatus('Square refund processing - would call Square API here', 'info');
        } else {
            const receiptIndex = savedReceipts.findIndex(r => r.id === currentRefundTransaction.id);
            if (receiptIndex !== -1) {
                savedReceipts.splice(receiptIndex, 1);
                localStorage.setItem('pigstyle_receipts', JSON.stringify(savedReceipts));
                
                if (document.getElementById('receipts-tab').classList.contains('active')) {
                    renderReceipts(savedReceipts);
                }
            }
        }
        
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