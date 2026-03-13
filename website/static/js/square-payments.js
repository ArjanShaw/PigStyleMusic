// ============================================================================
// square-payments.js - Square Payments Management for Admin Panel
// ============================================================================

// Global variables
let squarePayments = [];
let filteredSquarePayments = [];
let squarePaymentsCurrentPage = 1;
let squarePaymentsPageSize = 50;
let squarePaymentsTotalPages = 1;
let squarePaymentsLoading = false;
let selectedPrintColumns = {
    date: true,
    amount: true,
    status: true,
    method: true,
    card: true,
    note: true
};

// Initialize Square Payments tab
function initSquarePaymentsTab() {
    console.log('Initializing Square Payments tab...');
    
    // Set default dates
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const startDateInput = document.getElementById('square-start-date');
    const endDateInput = document.getElementById('square-end-date');
    
    if (startDateInput) startDateInput.value = startDate.toISOString().split('T')[0];
    if (endDateInput) endDateInput.value = endDate.toISOString().split('T')[0];
    
    // Load payments
    loadSquarePayments();
}

// Load Square payments from API
async function loadSquarePayments() {
    const loadingEl = document.getElementById('square-payments-loading');
    const errorEl = document.getElementById('square-payments-error');
    const tableBody = document.getElementById('square-payments-body');
    
    if (!tableBody) return;
    
    try {
        squarePaymentsLoading = true;
        if (loadingEl) loadingEl.style.display = 'block';
        if (errorEl) errorEl.style.display = 'none';
        
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading payments...</td></tr>';
        
        const startDate = document.getElementById('square-start-date')?.value;
        const endDate = document.getElementById('square-end-date')?.value;
        const statusFilter = document.getElementById('square-status-filter')?.value || 'all';
        
        let url = `${AppConfig.baseUrl}/api/square/payments`;
        const params = new URLSearchParams();
        
        if (startDate) {
            const startDateTime = new Date(startDate);
            startDateTime.setHours(0, 0, 0, 0);
            params.append('begin_time', startDateTime.toISOString());
        }
        if (endDate) {
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);
            params.append('end_time', endDateTime.toISOString());
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            squarePayments = data.payments || [];
            applySquarePaymentFilters(statusFilter);
        } else {
            throw new Error(data.error || 'Failed to load payments');
        }
        
    } catch (error) {
        console.error('Error loading Square payments:', error);
        if (errorEl) {
            errorEl.textContent = `Error loading payments: ${error.message}`;
            errorEl.style.display = 'block';
        }
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#dc3545;">
            <i class="fas fa-exclamation-circle"></i> Error: ${error.message}
        </td></tr>`;
    } finally {
        squarePaymentsLoading = false;
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// Apply filters to payments
function applySquarePaymentFilters(statusFilter) {
    let filtered = [...squarePayments];
    
    if (statusFilter && statusFilter !== 'all') {
        filtered = filtered.filter(p => p.status === statusFilter);
    }
    
    filteredSquarePayments = filtered;
    updateSquarePaymentsStats();
    renderSquarePaymentsTable();
}

// Update statistics
function updateSquarePaymentsStats() {
    const totalEl = document.getElementById('square-payments-total');
    const amountEl = document.getElementById('square-payments-amount');
    const completedEl = document.getElementById('square-payments-completed');
    const cardEl = document.getElementById('square-payments-card');
    
    if (totalEl) totalEl.textContent = filteredSquarePayments.length;
    
    const totalAmount = filteredSquarePayments.reduce((sum, p) => {
        const amount = p.amount_money?.amount || 0;
        return sum + (amount / 100);
    }, 0);
    if (amountEl) amountEl.textContent = formatCurrency(totalAmount);
    
    const completedCount = filteredSquarePayments.filter(p => p.status === 'COMPLETED').length;
    if (completedEl) completedEl.textContent = completedCount;
    
    const cardCount = filteredSquarePayments.filter(p => 
        p.card_details?.card?.card_brand || p.source_type === 'CARD'
    ).length;
    if (cardEl) cardEl.textContent = cardCount;
    
    updateSquarePaymentsPagination();
}

// Parse note to extract items
function parseNoteItems(note) {
    if (!note || note === '-') return [];
    
    // Split by record delimiter " || "
    const records = note.split(' || ');
    return records;
}

// Format note for table display
function formatNoteForDisplay(note) {
    if (!note || note === '-') return '-';
    
    const records = parseNoteItems(note);
    
    if (records.length === 1) {
        // Single record - return it
        return note;
    } else {
        // Multiple records - show count and first record
        const firstRecord = records[0];
        // Truncate if too long
        const displayFirst = firstRecord.length > 30 ? firstRecord.substring(0, 27) + '...' : firstRecord;
        return `${records.length} items: ${displayFirst}`;
    }
}

// Parse a single record string in format "barcode | artist | title" or "barcode | ACC: description"
function parseRecordString(record) {
    const parts = record.split(' | ');
    
    if (parts.length >= 3 && !record.includes('ACC:')) {
        // Format: barcode | artist | title
        return {
            type: 'record',
            barcode: parts[0],
            artist: parts[1],
            title: parts.slice(2).join(' | ') // Rejoin in case title had extra pipes
        };
    } else if (record.includes('ACC:')) {
        // Format: barcode | ACC: description
        const barcode = parts[0];
        const description = parts.slice(1).join(' | ').replace('ACC:', '').trim();
        return {
            type: 'accessory',
            barcode: barcode,
            description: description
        };
    } else {
        // Fallback for unexpected format
        return {
            type: 'unknown',
            raw: record
        };
    }
}

// Render payments table
function renderSquarePaymentsTable() {
    const tableBody = document.getElementById('square-payments-body');
    if (!tableBody) return;
    
    const start = (squarePaymentsCurrentPage - 1) * squarePaymentsPageSize;
    const end = Math.min(start + squarePaymentsPageSize, filteredSquarePayments.length);
    const pagePayments = filteredSquarePayments.slice(start, end);
    
    if (pagePayments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">No payments found</td></tr>';
        return;
    }
    
    let html = '';
    pagePayments.forEach(payment => {
        const amount = (payment.amount_money?.amount || 0) / 100;
        const date = payment.created_at ? new Date(payment.created_at).toLocaleString() : 'N/A';
        const status = payment.status || 'UNKNOWN';
        const statusClass = `payment-status-badge ${status}`;
        const note = payment.note || '-';
        const displayNote = formatNoteForDisplay(note);
        const fullNote = note; // Keep full note for tooltip
        
        // Get payment method details
        let methodIcon = '';
        let methodText = 'Unknown';
        let cardDetails = '';
        
        if (payment.card_details) {
            const card = payment.card_details.card || {};
            methodIcon = '<i class="fas fa-credit-card"></i>';
            methodText = `${card.card_brand || 'Card'} •••• ${card.last_4 || '****'}`;
            cardDetails = `${card.exp_month || '**'}/${card.exp_year || '****'}`;
        } else if (payment.source_type === 'CASH') {
            methodIcon = '<i class="fas fa-money-bill-wave"></i>';
            methodText = 'Cash';
        } else if (payment.source_type === 'SQUARE_GIFT_CARD') {
            methodIcon = '<i class="fas fa-gift"></i>';
            methodText = 'Gift Card';
        } else if (payment.source_type) {
            methodText = payment.source_type.replace('_', ' ').toLowerCase()
                .replace(/\b\w/g, l => l.toUpperCase());
        }
        
        // Get application fee (if any)
        let appFee = 0;
        if (payment.processing_fee && payment.processing_fee.length > 0) {
            appFee = payment.processing_fee.reduce((sum, fee) => 
                sum + (fee.amount_money?.amount || 0), 0) / 100;
        }
        
        html += `
            <tr>
                <td>${date}</td>
                <td><strong>${formatCurrency(amount)}</strong></td>
                <td><span class="${statusClass}">${status}</span></td>
                <td>
                    ${methodIcon} ${methodText}
                    ${appFee > 0 ? `<br><span class="square-meta">Fee: ${formatCurrency(appFee)}</span>` : ''}
                </td>
                <td>
                    ${cardDetails || '-'}
                </td>
                <td title="${fullNote}">${displayNote}</td>
                <td class="table-actions">
                    <button class="table-action-btn" onclick="viewSquarePaymentDetails('${payment.id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
}

// Format note for detailed view in modal
function formatNoteForDetails(note) {
    if (!note) return '';
    
    const records = parseNoteItems(note);
    
    if (records.length === 1) {
        // Single record
        const parsed = parseRecordString(records[0]);
        
        if (parsed.type === 'record') {
            return `
                <div style="padding: 12px; background: white; border-radius: 4px; border-left: 4px solid #007bff;">
                    <div style="margin-bottom: 5px;"><strong>Barcode:</strong> <span class="barcode-value">${parsed.barcode}</span></div>
                    <div style="margin-bottom: 5px;"><strong>Artist:</strong> ${parsed.artist}</div>
                    <div><strong>Title:</strong> ${parsed.title}</div>
                </div>
            `;
        } else if (parsed.type === 'accessory') {
            return `
                <div style="padding: 12px; background: white; border-radius: 4px; border-left: 4px solid #17a2b8;">
                    <div style="margin-bottom: 5px;"><strong>Barcode:</strong> <span class="barcode-value">${parsed.barcode}</span></div>
                    <div><strong>Accessory:</strong> ${parsed.description}</div>
                </div>
            `;
        } else {
            return `<div style="padding: 8px; background: white; border-radius: 4px;">${records[0]}</div>`;
        }
    } else {
        // Multiple records - format as a list
        let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
        
        records.forEach((record, index) => {
            const parsed = parseRecordString(record);
            
            if (parsed.type === 'record') {
                html += `
                    <div style="padding: 12px; background: white; border-radius: 4px; border-left: 4px solid #007bff;">
                        <div style="margin-bottom: 5px;"><strong>Item ${index + 1}</strong></div>
                        <div style="margin-bottom: 5px;"><strong>Barcode:</strong> <span class="barcode-value">${parsed.barcode}</span></div>
                        <div style="margin-bottom: 5px;"><strong>Artist:</strong> ${parsed.artist}</div>
                        <div><strong>Title:</strong> ${parsed.title}</div>
                    </div>
                `;
            } else if (parsed.type === 'accessory') {
                html += `
                    <div style="padding: 12px; background: white; border-radius: 4px; border-left: 4px solid #17a2b8;">
                        <div style="margin-bottom: 5px;"><strong>Item ${index + 1} (Accessory)</strong></div>
                        <div style="margin-bottom: 5px;"><strong>Barcode:</strong> <span class="barcode-value">${parsed.barcode}</span></div>
                        <div><strong>Description:</strong> ${parsed.description}</div>
                    </div>
                `;
            } else {
                html += `
                    <div style="padding: 8px; background: white; border-radius: 4px;">
                        <strong>Item ${index + 1}:</strong> ${record}
                    </div>
                `;
            }
        });
        
        html += '</div>';
        return html;
    }
}

// View payment details modal
function viewSquarePaymentDetails(paymentId) {
    const payment = squarePayments.find(p => p.id === paymentId);
    if (!payment) {
        alert('Payment not found');
        return;
    }
    
    const amount = (payment.amount_money?.amount || 0) / 100;
    const tipAmount = (payment.tip_money?.amount || 0) / 100;
    const taxAmount = (payment.tax_money?.amount || 0) / 100;
    const appFee = payment.processing_fee?.reduce((sum, fee) => 
        sum + (fee.amount_money?.amount || 0), 0) / 100 || 0;
    
    let modal = document.getElementById('square-payment-details-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'square-payment-details-modal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }
    
    // Build card details if present
    let cardHtml = '';
    if (payment.card_details) {
        const card = payment.card_details.card || {};
        cardHtml = `
            <div class="square-payment-details-item">
                <strong>Card:</strong> ${card.card_brand || 'Unknown'} •••• ${card.last_4 || '****'}
            </div>
            <div class="square-payment-details-item">
                <strong>Expires:</strong> ${card.exp_month || '**'}/${card.exp_year || '****'}
            </div>
            <div class="square-payment-details-item">
                <strong>Entry Method:</strong> ${payment.card_details.entry_method || 'Unknown'}
            </div>
            <div class="square-payment-details-item">
                <strong>AVS Status:</strong> ${payment.card_details.avs_status || 'Unknown'}
            </div>
            <div class="square-payment-details-item">
                <strong>CVV Status:</strong> ${payment.card_details.cvv_status || 'Unknown'}
            </div>
            <div class="square-payment-details-item">
                <strong>Statement Description:</strong> ${payment.card_details.statement_description || 'N/A'}
            </div>
        `;
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3 class="modal-title"><i class="fas fa-credit-card"></i> Payment Details</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').style.display='none'">&times;</button>
            </div>
            <div class="modal-body">
                <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div class="square-payment-details-item">
                            <strong>Payment ID:</strong> ${payment.id || 'N/A'}
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Status:</strong> <span class="payment-status-badge ${payment.status}">${payment.status}</span>
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Created:</strong> ${payment.created_at ? new Date(payment.created_at).toLocaleString() : 'N/A'}
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Updated:</strong> ${payment.updated_at ? new Date(payment.updated_at).toLocaleString() : 'N/A'}
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Order ID:</strong> ${payment.order_id || 'N/A'}
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Reference ID:</strong> ${payment.reference_id || 'N/A'}
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Location ID:</strong> ${payment.location_id || 'N/A'}
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Receipt #:</strong> ${payment.receipt_number || 'N/A'}
                        </div>
                    </div>
                </div>
                
                <h4>Amount Details</h4>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div class="square-payment-details-item">
                            <strong>Amount:</strong> ${formatCurrency(amount)}
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Tip:</strong> ${formatCurrency(tipAmount)}
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Tax:</strong> ${formatCurrency(taxAmount)}
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Processing Fee:</strong> ${formatCurrency(appFee)}
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Net Amount:</strong> ${formatCurrency(amount - appFee)}
                        </div>
                        <div class="square-payment-details-item">
                            <strong>Currency:</strong> ${payment.amount_money?.currency || 'USD'}
                        </div>
                    </div>
                </div>
                
                ${payment.card_details ? `
                    <h4>Card Details</h4>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            ${cardHtml}
                        </div>
                    </div>
                ` : ''}
                
                ${payment.note ? `
                    <h4>Items</h4>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                        ${formatNoteForDetails(payment.note)}
                    </div>
                ` : ''}
                
                <div style="text-align: center; margin-top: 20px;">
                    <a href="https://app.squareup.com/dashboard/sales/transactions/${payment.id}" 
                       target="_blank" 
                       class="btn btn-primary">
                        <i class="fas fa-external-link-alt"></i> View in Square Dashboard
                    </a>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').style.display='none'">Close</button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

// Update pagination controls
function updateSquarePaymentsPagination() {
    squarePaymentsTotalPages = Math.ceil(filteredSquarePayments.length / squarePaymentsPageSize);
    
    const firstBtn = document.getElementById('square-payments-first-btn');
    const prevBtn = document.getElementById('square-payments-prev-btn');
    const nextBtn = document.getElementById('square-payments-next-btn');
    const lastBtn = document.getElementById('square-payments-last-btn');
    const currentSpan = document.getElementById('square-payments-current-page');
    const totalSpan = document.getElementById('square-payments-total-pages');
    
    if (firstBtn) firstBtn.disabled = squarePaymentsCurrentPage === 1;
    if (prevBtn) prevBtn.disabled = squarePaymentsCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = squarePaymentsCurrentPage === squarePaymentsTotalPages || squarePaymentsTotalPages === 0;
    if (lastBtn) lastBtn.disabled = squarePaymentsCurrentPage === squarePaymentsTotalPages || squarePaymentsTotalPages === 0;
    if (currentSpan) currentSpan.textContent = squarePaymentsCurrentPage;
    if (totalSpan) totalSpan.textContent = squarePaymentsTotalPages || 1;
}

// Go to specific page
function goToSquarePaymentsPage(page) {
    if (page < 1 || page > squarePaymentsTotalPages) return;
    squarePaymentsCurrentPage = page;
    renderSquarePaymentsTable();
    updateSquarePaymentsPagination();
}

// Change page size
function changeSquarePaymentsPageSize(size) {
    squarePaymentsPageSize = parseInt(size);
    squarePaymentsCurrentPage = 1;
    renderSquarePaymentsTable();
    updateSquarePaymentsPagination();
}

// Reset filters
function resetSquareFilters() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    document.getElementById('square-end-date').value = endDate.toISOString().split('T')[0];
    document.getElementById('square-start-date').value = startDate.toISOString().split('T')[0];
    document.getElementById('square-status-filter').value = 'all';
    
    loadSquarePayments();
}

// Show column selection modal for printing
function showPrintColumnSelection() {
    const modal = document.getElementById('print-column-modal');
    if (!modal) return;
    
    // Update checkbox states
    document.getElementById('print-col-date').checked = selectedPrintColumns.date;
    document.getElementById('print-col-amount').checked = selectedPrintColumns.amount;
    document.getElementById('print-col-status').checked = selectedPrintColumns.status;
    document.getElementById('print-col-method').checked = selectedPrintColumns.method;
    document.getElementById('print-col-card').checked = selectedPrintColumns.card;
    document.getElementById('print-col-note').checked = selectedPrintColumns.note;
    
    modal.style.display = 'flex';
}

// Close column selection modal
function closePrintColumnSelection() {
    const modal = document.getElementById('print-column-modal');
    if (modal) modal.style.display = 'none';
}

// Save column selection and print
function saveColumnSelectionAndPrint() {
    selectedPrintColumns = {
        date: document.getElementById('print-col-date').checked,
        amount: document.getElementById('print-col-amount').checked,
        status: document.getElementById('print-col-status').checked,
        method: document.getElementById('print-col-method').checked,
        card: document.getElementById('print-col-card').checked,
        note: document.getElementById('print-col-note').checked
    };
    
    closePrintColumnSelection();
    printSquarePayments();
}

// Print Square Payments table
function printSquarePayments() {
    if (filteredSquarePayments.length === 0) {
        alert('No payments to print');
        return;
    }
    
    // Get filter info
    const startDate = document.getElementById('square-start-date')?.value || 'Any';
    const endDate = document.getElementById('square-end-date')?.value || 'Any';
    const statusFilter = document.getElementById('square-status-filter')?.value || 'all';
    const statusText = statusFilter === 'all' ? 'All Statuses' : statusFilter;
    
    // Build table HTML with selected columns
    let tableHtml = '<table style="width:100%; border-collapse: collapse; font-size: 12px;">';
    
    // Build header
    tableHtml += '<thead><tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">';
    if (selectedPrintColumns.date) tableHtml += '<th style="padding: 8px; text-align: left;">Date</th>';
    if (selectedPrintColumns.amount) tableHtml += '<th style="padding: 8px; text-align: left;">Amount</th>';
    if (selectedPrintColumns.status) tableHtml += '<th style="padding: 8px; text-align: left;">Status</th>';
    if (selectedPrintColumns.method) tableHtml += '<th style="padding: 8px; text-align: left;">Payment Method</th>';
    if (selectedPrintColumns.card) tableHtml += '<th style="padding: 8px; text-align: left;">Card Details</th>';
    if (selectedPrintColumns.note) tableHtml += '<th style="padding: 8px; text-align: left;">Note</th>';
    tableHtml += '</tr></thead><tbody>';
    
    // Build rows
    filteredSquarePayments.forEach(payment => {
        const amount = (payment.amount_money?.amount || 0) / 100;
        const date = payment.created_at ? new Date(payment.created_at).toLocaleString() : 'N/A';
        const status = payment.status || 'UNKNOWN';
        const note = payment.note || '-';
        
        // Get payment method details
        let methodText = 'Unknown';
        if (payment.card_details) {
            const card = payment.card_details.card || {};
            methodText = `${card.card_brand || 'Card'} •••• ${card.last_4 || '****'}`;
        } else if (payment.source_type === 'CASH') {
            methodText = 'Cash';
        } else if (payment.source_type === 'SQUARE_GIFT_CARD') {
            methodText = 'Gift Card';
        } else if (payment.source_type) {
            methodText = payment.source_type.replace('_', ' ').toLowerCase()
                .replace(/\b\w/g, l => l.toUpperCase());
        }
        
        // Get card details
        let cardDetails = '-';
        if (payment.card_details) {
            const card = payment.card_details.card || {};
            cardDetails = `${card.exp_month || '**'}/${card.exp_year || '****'}`;
        }
        
        tableHtml += '<tr style="border-bottom: 1px solid #eee;">';
        if (selectedPrintColumns.date) tableHtml += `<td style="padding: 8px;">${date}</td>`;
        if (selectedPrintColumns.amount) tableHtml += `<td style="padding: 8px;"><strong>${formatCurrency(amount)}</strong></td>`;
        if (selectedPrintColumns.status) tableHtml += `<td style="padding: 8px;">${status}</td>`;
        if (selectedPrintColumns.method) tableHtml += `<td style="padding: 8px;">${methodText}</td>`;
        if (selectedPrintColumns.card) tableHtml += `<td style="padding: 8px;">${cardDetails}</td>`;
        if (selectedPrintColumns.note) tableHtml += `<td style="padding: 8px;">${note}</td>`;
        tableHtml += '</tr>';
    });
    
    tableHtml += '</tbody></table>';
    
    // Get stats for summary
    const totalAmount = filteredSquarePayments.reduce((sum, p) => {
        const amount = p.amount_money?.amount || 0;
        return sum + (amount / 100);
    }, 0);
    
    const completedCount = filteredSquarePayments.filter(p => p.status === 'COMPLETED').length;
    
    // Create print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Square Payments Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                h1 { font-size: 24px; margin-bottom: 10px; }
                h2 { font-size: 18px; margin: 20px 0 10px; color: #666; }
                .header { margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #333; }
                .filters { background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 20px; font-size: 13px; }
                .filters p { margin: 5px 0; }
                .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
                .summary-item { background: #f8f9fa; padding: 10px; border-radius: 4px; text-align: center; }
                .summary-item .label { font-size: 12px; color: #666; }
                .summary-item .value { font-size: 18px; font-weight: bold; color: #007bff; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #f8f9fa; padding: 10px; text-align: left; border-bottom: 2px solid #ddd; }
                td { padding: 8px 10px; border-bottom: 1px solid #eee; }
                .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
                @media print {
                    body { margin: 0.5in; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Square Payments Report</h1>
                <p>Generated: ${new Date().toLocaleString()}</p>
            </div>
            
            <div class="filters">
                <p><strong>Date Range:</strong> ${startDate} to ${endDate}</p>
                <p><strong>Status Filter:</strong> ${statusText}</p>
                <p><strong>Total Payments:</strong> ${filteredSquarePayments.length}</p>
            </div>
            
            <div class="summary">
                <div class="summary-item">
                    <div class="label">Total Amount</div>
                    <div class="value">${formatCurrency(totalAmount)}</div>
                </div>
                <div class="summary-item">
                    <div class="label">Completed</div>
                    <div class="value">${completedCount}</div>
                </div>
                <div class="summary-item">
                    <div class="label">Card Payments</div>
                    <div class="value">${filteredSquarePayments.filter(p => p.card_details).length}</div>
                </div>
                <div class="summary-item">
                    <div class="label">Cash Payments</div>
                    <div class="value">${filteredSquarePayments.filter(p => p.source_type === 'CASH').length}</div>
                </div>
            </div>
            
            ${tableHtml}
            
            <div class="footer">
                <p>PigStyle Music - Square Payments Report</p>
            </div>
            
            <div class="no-print" style="text-align: center; margin-top: 30px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Print Report</button>
                <button onclick="window.close()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px;">Close</button>
            </div>
            
            <script>
                // Auto-trigger print dialog
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 500);
                };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Export to CSV
function exportSquarePaymentsToCSV() {
    if (filteredSquarePayments.length === 0) {
        alert('No payments to export');
        return;
    }
    
    const headers = ['Date', 'Amount', 'Status', 'Payment Method', 'Card Details', 'Note', 'Payment ID', 'Order ID', 'Reference ID'];
    const csvRows = [];
    
    csvRows.push(headers.join(','));
    
    filteredSquarePayments.forEach(payment => {
        const amount = (payment.amount_money?.amount || 0) / 100;
        const date = payment.created_at ? new Date(payment.created_at).toLocaleString() : 'N/A';
        
        // Get payment method
        let method = 'Unknown';
        if (payment.card_details) {
            const card = payment.card_details.card || {};
            method = `${card.card_brand || 'Card'} ${card.last_4 ? '•••• ' + card.last_4 : ''}`;
        } else if (payment.source_type) {
            method = payment.source_type;
        }
        
        const cardDetails = payment.card_details ? 
            `${payment.card_details.card?.exp_month || ''}/${payment.card_details.card?.exp_year || ''}` : '';
        
        const row = [
            `"${date}"`,
            amount,
            `"${payment.status || ''}"`,
            `"${method}"`,
            `"${cardDetails}"`,
            `"${(payment.note || '').replace(/"/g, '""')}"`,
            `"${payment.id || ''}"`,
            `"${payment.order_id || ''}"`,
            `"${payment.reference_id || ''}"`
        ];
        
        csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `square_payments_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount || 0);
}

// Listen for tab changes
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'square-payments') {
        initSquarePaymentsTab();
    }
});

// Auto-initialize if square-payments tab is active on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check if square-payments tab is active
    const squarePaymentsTab = document.getElementById('square-payments-tab');
    if (squarePaymentsTab && squarePaymentsTab.classList.contains('active')) {
        initSquarePaymentsTab();
    }
});

console.log('✅ square-payments.js loaded with print functionality and formatted notes');