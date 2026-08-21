// ============================================================================
// item-management.js - Unified Item Management Module
// ============================================================================

(function() {
    'use strict';

    console.log('📦 item-management.js loading...');

    // ========== DOM Elements ==========
    const searchInput = document.getElementById('item-search-input');
    const searchForm = document.getElementById('item-search-form');
    const searchButton = document.getElementById('item-search-button');
    const clearSearchBtn = document.getElementById('item-clear-search');

    const recordsTableBody = document.getElementById('item-records-table-body');
    const selectAllCheckbox = document.getElementById('item-select-all-checkbox');

    const pageSizeSelect = document.getElementById('item-record-page-size');
    const currentPageInput = document.getElementById('item-record-current-page');
    const totalPagesSpan = document.getElementById('item-record-total-pages');
    const showingStartSpan = document.getElementById('item-record-showing-start');
    const showingEndSpan = document.getElementById('item-record-showing-end');
    const totalFilteredSpan = document.getElementById('item-record-total-filtered');
    const firstPageBtn = document.getElementById('item-record-first-page');
    const prevPageBtn = document.getElementById('item-record-prev-page');
    const nextPageBtn = document.getElementById('item-record-next-page');
    const lastPageBtn = document.getElementById('item-record-last-page');

    const selectedCountSpan = document.getElementById('item-selected-count');
    const selectedCountBadge = document.getElementById('item-selection-count-badge');
    const selectedCountText = document.getElementById('item-selected-count-text');
    const totalValueSpan = document.getElementById('item-total-value');
    const executeActionBtn = document.getElementById('item-execute-action-btn');
    const clearSelectionBtn = document.getElementById('item-clear-selection-btn');
    const clearSelectionTop = document.getElementById('item-clear-selection-top');
    const selectAllBtn = document.getElementById('item-select-all-btn');
    const statusMessage = document.getElementById('item-status-message');

    // ========== State ==========
    let records = [];
    let filteredRecords = [];
    let currentPage = 1;
    let pageSize = 50;
    let totalRecords = 0;
    let selectedIds = new Set();
    let currentActionMode = 'checkout';
    let isInitialized = false;
    let isRendering = false;

    // Checkout state
    let checkoutSelectedItems = [];
    let checkoutTotal = 0;
    let checkoutRemaining = 0;
    let checkoutPaymentEntries = [];
    let squareAvailable = false;
    let squareCheckoutId = null;
    let squarePollInterval = null;
    let availableTerminals = [];
    let checkoutDebtorData = null;

    // ========== Helper Functions ==========
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showStatus(message, type) {
        if (!statusMessage) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        statusMessage.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        statusMessage.className = 'status-message ' + type;
        statusMessage.style.display = 'block';
        clearTimeout(statusMessage._timeout);
        statusMessage._timeout = setTimeout(function() {
            statusMessage.style.display = 'none';
        }, 5000);
    }

    function getStatusName(statusId) {
        const map = { 1: 'New', 2: 'Active', 3: 'Sold', 4: 'Sold on Discogs', 5: 'Sold Online' };
        return map[statusId] || 'Unknown';
    }

    function getStatusClass(statusId) {
        const map = { 1: 'new', 2: 'active', 3: 'sold', 4: 'discogs', 5: 'sold' };
        return map[statusId] || '';
    }

    function formatCurrency(amount) {
        if (amount === undefined || amount === null) return '$0.00';
        return '$' + parseFloat(amount).toFixed(2);
    }

    function generateOrderId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ========== API Helpers ==========
    function getBaseUrl() {
        if (typeof AppConfig !== 'undefined' && AppConfig.baseUrl) {
            return AppConfig.baseUrl;
        }
        return '';
    }

    async function apiRequest(method, endpoint, body) {
        const baseUrl = getBaseUrl();
        const options = {
            method: method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(baseUrl + endpoint, options);
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ' on ' + method + ' ' + endpoint);
        }
        return response.json();
    }

    // ========== Load Stats ==========
    async function loadStats() {
        try {
            const totalData = await apiRequest('GET', '/records/count');
            const totalRecordsEl = document.getElementById('item-total-records');
            if (totalRecordsEl) totalRecordsEl.textContent = totalData.count || 0;

            const activeData = await apiRequest('GET', '/records/count?status_id=2');
            const activeRecordsEl = document.getElementById('item-active-records');
            if (activeRecordsEl) activeRecordsEl.textContent = activeData.count || 0;

            updateSelectionStats();
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    // ========== Load Records ==========
    async function loadRecords(searchTerm) {
        try {
            let url = '/records?status_ids=2,1';
            if (searchTerm && searchTerm.trim()) {
                url += '&search=' + encodeURIComponent(searchTerm.trim());
            }
            url += '&limit=1000';

            const data = await apiRequest('GET', url);
            if (data.status === 'success') {
                records = data.records || [];
                filteredRecords = records.slice();
                totalRecords = filteredRecords.length;
                currentPage = 1;
                renderTable();
                updatePagination();
                updateSelectionStats();
                showStatus('Loaded ' + totalRecords + ' records', 'info');
            } else {
                throw new Error(data.error || 'Failed to load records');
            }
        } catch (error) {
            console.error('Error loading records:', error);
            showStatus('Error loading records: ' + error.message, 'error');
            records = [];
            filteredRecords = [];
            totalRecords = 0;
            renderTable();
            updatePagination();
        }
    }

    // ========== Render Table ==========
    function renderTable() {
        if (isRendering) return;
        isRendering = true;

        try {
            const start = (currentPage - 1) * pageSize;
            const end = Math.min(start + pageSize, filteredRecords.length);
            const pageRecords = filteredRecords.slice(start, end);

            const selectedCount = selectedIds.size;
            let displayRecords = pageRecords;

            if (selectedCount > 0) {
                displayRecords = pageRecords.filter(function(r) {
                    return selectedIds.has(r.id);
                });
                const viewText = document.getElementById('item-view-status-text');
                if (viewText) {
                    viewText.textContent = 'Showing ' + selectedCount + ' selected item(s)';
                }
            } else {
                const viewText = document.getElementById('item-view-status-text');
                if (viewText) {
                    const searchTerm = searchInput ? searchInput.value.trim() : '';
                    if (searchTerm) {
                        viewText.textContent = 'Showing results for "' + escapeHtml(searchTerm) + '" (' + totalRecords + ' total)';
                    } else {
                        viewText.textContent = 'Showing all records (' + totalRecords + ' total)';
                    }
                }
            }

            if (displayRecords.length === 0) {
                let message = 'No records found.';
                if (selectedCount > 0) {
                    message = 'No items selected on this page. Search for records and check the boxes to select them.';
                } else if (searchInput && searchInput.value.trim()) {
                    message = 'No records found matching "' + escapeHtml(searchInput.value.trim()) + '"';
                } else {
                    message = 'Search for records to manage';
                }
                recordsTableBody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: center; padding: 40px; color: #999;">
                            <i class="fas fa-search" style="font-size: 36px; display: block; margin-bottom: 10px;"></i>
                            ${message}
                        </td>
                    </tr>
                `;
                return;
            }

            let html = '';
            displayRecords.forEach(function(record, index) {
                const globalIndex = start + index;
                const isSelected = selectedIds.has(record.id);
                const statusName = getStatusName(record.status_id);
                const statusClass = getStatusClass(record.status_id);
                const price = record.store_price || 0;

                html += `<tr class="${isSelected ? 'selected-row' : ''}" data-id="${record.id}">`;
                html += `<td><input type="checkbox" class="item-select-checkbox" data-id="${record.id}" ${isSelected ? 'checked' : ''}></td>`;
                html += `<td>${record.id}</td>`;
                html += `<td>${escapeHtml(record.artist || 'Unknown')}</td>`;
                html += `<td>${escapeHtml(record.title || 'Unknown')}</td>`;
                html += `<td>${formatCurrency(price)}</td>`;
                html += `<td><span class="barcode-value">${escapeHtml(record.barcode || '—')}</span></td>`;
                html += `<td><span class="status-badge ${statusClass}">${statusName}</span></td>`;
                
                if (isSelected) {
                    html += `<td>
                        <button class="btn btn-small btn-danger remove-item-btn" data-id="${record.id}" title="Remove from selection">
                            <i class="fas fa-times"></i> Remove
                        </button>
                    </td>`;
                } else {
                    html += `<td>
                        <button class="btn btn-small btn-primary add-item-btn" data-id="${record.id}" title="Add to selection">
                            <i class="fas fa-plus"></i> Select
                        </button>
                    </td>`;
                }
                html += `</tr>`;
            });

            recordsTableBody.innerHTML = html;

            document.querySelectorAll('.item-select-checkbox').forEach(function(checkbox) {
                checkbox.addEventListener('change', function() {
                    const id = parseInt(this.dataset.id);
                    if (this.checked) {
                        selectedIds.add(id);
                    } else {
                        selectedIds.delete(id);
                    }
                    updateSelectionStats();
                    renderTable();
                });
            });

            document.querySelectorAll('.remove-item-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const id = parseInt(this.dataset.id);
                    selectedIds.delete(id);
                    updateSelectionStats();
                    renderTable();
                });
            });

            document.querySelectorAll('.add-item-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const id = parseInt(this.dataset.id);
                    selectedIds.add(id);
                    updateSelectionStats();
                    renderTable();
                });
            });

            const allChecked = displayRecords.every(function(r) { return selectedIds.has(r.id); });
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = allChecked && displayRecords.length > 0;
                selectAllCheckbox.indeterminate = !allChecked && displayRecords.some(function(r) { return selectedIds.has(r.id); });
            }

            updateSelectionStats();
        } finally {
            isRendering = false;
        }
    }

    // ========== Pagination ==========
    function updatePagination() {
        const totalPages = Math.ceil(totalRecords / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalRecords);

        showingStartSpan.textContent = start;
        showingEndSpan.textContent = end;
        totalFilteredSpan.textContent = totalRecords;
        totalPagesSpan.textContent = totalPages;
        currentPageInput.value = currentPage;

        firstPageBtn.disabled = currentPage === 1;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages;
        lastPageBtn.disabled = currentPage === totalPages;
    }

    // ========== Selection Stats ==========
    function updateSelectionStats() {
        const count = selectedIds.size;
        selectedCountSpan.textContent = count;
        selectedCountBadge.textContent = count;
        selectedCountText.textContent = count;

        let totalValue = 0;
        records.forEach(function(r) {
            if (selectedIds.has(r.id)) {
                totalValue += (r.store_price || 0);
            }
        });
        totalValueSpan.textContent = formatCurrency(totalValue);

        executeActionBtn.disabled = count === 0;
        const showClear = count > 0;
        clearSelectionBtn.style.display = showClear ? 'inline-flex' : 'none';
        clearSelectionTop.style.display = showClear ? 'inline-flex' : 'none';

        if (selectAllBtn) {
            if (count > 0) {
                selectAllBtn.innerHTML = '<i class="fas fa-times"></i> Clear All';
                selectAllBtn.className = 'btn btn-danger';
                selectAllBtn.onclick = function() { clearSelection(); };
            } else {
                selectAllBtn.innerHTML = '<i class="fas fa-check-double"></i> Select All';
                selectAllBtn.className = 'btn btn-info';
                selectAllBtn.onclick = function() { selectAll(); };
            }
        }

        const selectedCountStat = document.getElementById('item-selected-count');
        if (selectedCountStat) selectedCountStat.textContent = count;
    }

    // ========== Select All ==========
    function selectAll() {
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredRecords.length);
        const pageRecords = filteredRecords.slice(start, end);
        pageRecords.forEach(function(r) { selectedIds.add(r.id); });
        updateSelectionStats();
        renderTable();
    }

    // ========== Clear Selection ==========
    function clearSelection() {
        selectedIds.clear();
        updateSelectionStats();
        renderTable();
    }

    // ========== Search ==========
    function performSearch() {
        const term = searchInput ? searchInput.value.trim() : '';
        selectedIds.clear();
        loadRecords(term);
    }

    function clearSearch() {
        if (searchInput) searchInput.value = '';
        selectedIds.clear();
        loadRecords('');
    }

    // ========== Toggle Select All ==========
    function toggleSelectAll() {
        if (!selectAllCheckbox) return;
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredRecords.length);
        const pageRecords = filteredRecords.slice(start, end);

        const allChecked = pageRecords.every(function(r) { return selectedIds.has(r.id); });

        pageRecords.forEach(function(r) {
            if (allChecked) {
                selectedIds.delete(r.id);
            } else {
                selectedIds.add(r.id);
            }
        });

        updateSelectionStats();
        renderTable();
    }

    // ========== Action Mode ==========
    function getActionMode() {
        const checked = document.querySelector('input[name="item-action-mode"]:checked');
        return checked ? checked.value : 'checkout';
    }

    // ========== Execute Action ==========
    function executeAction() {
        const mode = getActionMode();
        const selectedRecords = records.filter(function(r) { return selectedIds.has(r.id); });

        if (selectedRecords.length === 0) {
            showStatus('No items selected.', 'warning');
            return;
        }

        switch (mode) {
            case 'checkout':
                executeCheckout(selectedRecords);
                break;
            case 'delete':
                showConfirmDelete(selectedRecords);
                break;
            case 'refund':
                showConfirmRefund(selectedRecords);
                break;
            default:
                showStatus('Unknown action mode: ' + mode, 'error');
        }
    }

    // ============================================================
    // CHECKOUT FUNCTIONS – ORIGINAL IMPLEMENTATION
    // ============================================================
    
    function executeCheckout(selectedRecords) {
        console.log('🛒 executeCheckout called');
        
        if (selectedRecords.length === 0) {
            showStatus('No records selected for checkout.', 'warning');
            return;
        }
        
        var availableRecords = selectedRecords.filter(function(r) {
            var status = r.status_id || r.status;
            return status !== 3 && status !== 'sold';
        });
        
        if (availableRecords.length === 0) {
            showStatus('All selected records are already sold.', 'warning');
            return;
        }
        
        if (availableRecords.length < selectedRecords.length) {
            showStatus(selectedRecords.length - availableRecords.length + ' record(s) are already sold and will be skipped.', 'warning');
        }
        
        availableRecords.forEach(function(r) {
            if (!checkoutSelectedItems.some(function(item) { return item.id === r.id; })) {
                checkoutSelectedItems.push(r);
            }
        });
        
        showStatus('Added ' + availableRecords.length + ' items to checkout.', 'success');
        showCheckoutModal();
    }

    async function checkSquareAvailability() {
        const baseUrl = getBaseUrl();
        try {
            var response = await fetch(baseUrl + '/api/square/terminals', {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error('Failed to fetch terminals');
            var data = await response.json();
            squareAvailable = data.terminals && data.terminals.length > 0;
            availableTerminals = data.terminals || [];
            console.log('📟 Square terminals available:', squareAvailable);
        } catch (error) {
            console.warn('Square not available:', error);
            squareAvailable = false;
            availableTerminals = [];
        }
        return squareAvailable;
    }

    function showCheckoutModal() {
        console.log('🛒 showCheckoutModal called');
        
        var oldModal = document.getElementById('checkout-payment-modal');
        if (oldModal) {
            oldModal.parentNode.removeChild(oldModal);
        }

        var selected = checkoutSelectedItems;
        if (selected.length === 0) {
            showStatus('No records in checkout list', 'warning');
            return;
        }
        
        var total = selected.reduce(function(sum, r) { return sum + (r.store_price || 0); }, 0);
        var tax = total * 0.08;
        var grandTotal = total + tax;
        
        checkoutTotal = grandTotal;
        checkoutRemaining = grandTotal;
        checkoutPaymentEntries = [];

        var orderId = generateOrderId();

        var modal = document.createElement('div');
        modal.id = 'checkout-payment-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 550px; width: 95%;">
                <div class="modal-header" style="background: #007bff; color: white;">
                    <h3 class="modal-title"><i class="fas fa-shopping-cart"></i> Checkout</h3>
                    <button class="modal-close" onclick="document.getElementById('checkout-payment-modal').style.display='none'" style="color: white;">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>${selected.length}</strong> item(s) selected.</p>
                    <div style="font-size: 20px; font-weight: bold; margin: 10px 0;">Total: $${grandTotal.toFixed(2)}</div>
                    <div style="font-size: 16px; margin: 10px 0; color: #28a745;">Remaining: $<span id="checkout-remaining">${grandTotal.toFixed(2)}</span></div>
                    
                    <div style="background: #e3f2fd; padding: 12px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #b8daff;">
                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            <input type="text" id="checkout-debtor-code" placeholder="GIFT-XXXXX or debtor name" style="flex: 2; min-width: 150px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <button class="btn btn-sm btn-primary" onclick="window.lookupDebtorForCheckout()" style="padding: 6px 12px;"><i class="fas fa-search"></i> Lookup</button>
                        </div>
                        <div id="checkout-debtor-info" style="display: none; margin-top: 8px; padding: 8px; background: white; border-radius: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                                <span><strong id="checkout-debtor-name">—</strong> <span id="checkout-debtor-type" style="font-size: 12px; color: #666;">(Store Credit)</span></span>
                                <span style="font-weight: bold; color: #28a745;">Balance: $<span id="checkout-debtor-balance">0.00</span></span>
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                                <button class="btn btn-sm btn-success" onclick="window.applyDebtorToCheckout()" style="padding: 6px 12px;"><i class="fas fa-check"></i> Apply Credit</button>
                                <button class="btn btn-sm btn-secondary" onclick="document.getElementById('checkout-debtor-info').style.display='none'"><i class="fas fa-times"></i> Cancel</button>
                            </div>
                            <div id="checkout-debtor-status" style="font-size: 13px; margin-top: 5px;"></div>
                        </div>
                        <div style="font-size: 12px; color: #666; margin-top: 6px;">
                            <i class="fas fa-info-circle"></i> Enter a gift card code (GIFT-XXXXX) or a store credit debtor name. Click Apply to use the balance.
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin: 10px 0;">
                        <input type="number" id="checkout-payment-amount" class="form-control" placeholder="Amount" step="0.01" min="0" style="flex: 1; min-width: 100px;">
                        <select id="checkout-payment-method" class="form-control" style="flex: 1; min-width: 120px;">
                            <option value="Cash" selected>Cash</option>
                            <option value="Card (Square)">Card (Square)</option>
                        </select>
                        <button class="btn btn-primary" id="checkout-add-payment" style="background: #007bff; color: white;"><i class="fas fa-plus"></i> Add Payment</button>
                    </div>
                    
                    <div id="checkout-square-warning" style="display:none; padding:8px; background:#fff3cd; border-radius:4px; margin-bottom:10px;">
                        ⚠️ Square POS is not available. Card option is disabled.
                    </div>
                    <div id="checkout-square-status" style="margin-top:10px; padding:10px; border-radius:4px; display:none; background:#f8f9fa; border:1px solid #ddd;"></div>
                    <div id="checkout-payment-entries" style="max-height: 150px; overflow-y: auto; margin: 10px 0;"></div>
                    <div id="checkout-payment-status" style="margin-top: 10px; display: none;"></div>
                    <button class="btn btn-success" id="checkout-complete-payment" style="width: 100%; margin-top: 10px;" disabled>Complete Payment</button>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('checkout-payment-modal').style.display='none'">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        checkSquareAvailability().then(function(avail) {
            var methodSelect = document.getElementById('checkout-payment-method');
            var cardOption = methodSelect.querySelector('option[value="Card (Square)"]');
            var warning = document.getElementById('checkout-square-warning');
            if (!avail) {
                if (cardOption) cardOption.disabled = true;
                if (warning) warning.style.display = 'block';
                if (methodSelect.value === 'Card (Square)') methodSelect.value = 'Cash';
            } else {
                if (cardOption) cardOption.disabled = false;
                if (warning) warning.style.display = 'none';
            }
        });

        document.getElementById('checkout-remaining').textContent = checkoutRemaining.toFixed(2);
        renderCheckoutEntries();

        document.getElementById('checkout-add-payment').onclick = function() {
            var amountInput = document.getElementById('checkout-payment-amount');
            var methodSelect2 = document.getElementById('checkout-payment-method');
            var amount = parseFloat(amountInput.value);
            if (isNaN(amount) || amount <= 0) {
                amount = checkoutRemaining;
                if (amount <= 0) {
                    showCheckoutStatus('No remaining balance to pay.', 'error');
                    return;
                }
                amountInput.value = amount.toFixed(2);
            }
            var method = methodSelect2.value;

            if (method === 'Card (Square)' && !squareAvailable) {
                showCheckoutStatus('Square POS is not available. Please use Cash.', 'error');
                return;
            }

            addPaymentEntry(method, amount);
        };

        document.getElementById('checkout-complete-payment').onclick = function() {
            if (checkoutRemaining > 0.01) {
                showCheckoutStatus('Remaining balance not covered', 'error');
                return;
            }
            var methodSelect3 = document.getElementById('checkout-payment-method');
            var method = methodSelect3.value;
            if (method === 'Card (Square)') {
                processSquarePayment();
            } else {
                completeCheckout();
            }
        };

        modal.style.display = 'flex';
        updateCheckoutCompleteButton();
    }

    function addPaymentEntry(method, amount) {
        if (amount > checkoutRemaining && checkoutRemaining > 0) {
            // allow overpayment
        }
        checkoutPaymentEntries.push({ method: method, amount: amount });
        checkoutRemaining -= amount;
        document.getElementById('checkout-remaining').textContent = checkoutRemaining.toFixed(2);
        renderCheckoutEntries();
        updateCheckoutCompleteButton();
        showCheckoutStatus('Added $' + amount.toFixed(2) + ' ' + method, 'success');
        document.getElementById('checkout-payment-amount').value = '';
    }

    function renderCheckoutEntries() {
        var container = document.getElementById('checkout-payment-entries');
        if (!container) return;
        if (checkoutPaymentEntries.length === 0) {
            container.innerHTML = '<div style="color: #999; text-align: center; padding: 10px;">No payments added yet.</div>';
            return;
        }
        var html = '';
        checkoutPaymentEntries.forEach(function(entry, idx) {
            html += '<div style="display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #eee;">';
            html += '<span>' + entry.method + '</span>';
            html += '<span>$' + entry.amount.toFixed(2) + '</span>';
            html += '<button class="btn btn-sm btn-danger checkout-remove-entry" data-index="' + idx + '" style="padding: 2px 6px;"><i class="fas fa-times"></i></button>';
            html += '</div>';
        });
        container.innerHTML = html;

        container.querySelectorAll('.checkout-remove-entry').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var index = parseInt(this.dataset.index);
                removeCheckoutEntry(index);
            });
        });
    }

    function removeCheckoutEntry(index) {
        var entry = checkoutPaymentEntries[index];
        if (entry) {
            checkoutRemaining += entry.amount;
            checkoutPaymentEntries.splice(index, 1);
            document.getElementById('checkout-remaining').textContent = checkoutRemaining.toFixed(2);
            renderCheckoutEntries();
            updateCheckoutCompleteButton();
            showCheckoutStatus('Payment entry removed', 'info');
        }
    }

    function updateCheckoutCompleteButton() {
        var btn = document.getElementById('checkout-complete-payment');
        if (btn) {
            btn.disabled = checkoutRemaining > 0.01;
        }
    }

    function showCheckoutStatus(message, type) {
        var el = document.getElementById('checkout-payment-status');
        if (el) {
            el.textContent = message;
            el.className = 'status-message status-' + type;
            el.style.display = 'block';
        }
    }

    // ============================================================
    // LOOKUP DEBTOR
    // ============================================================
    async function lookupDebtorForCheckout() {
        var input = document.getElementById('checkout-debtor-code');
        var infoDiv = document.getElementById('checkout-debtor-info');
        var statusEl = document.getElementById('checkout-debtor-status');
        var nameEl = document.getElementById('checkout-debtor-name');
        var typeEl = document.getElementById('checkout-debtor-type');
        var balanceEl = document.getElementById('checkout-debtor-balance');
        
        if (!input) return;
        
        var code = input.value.trim().toUpperCase();
        if (!code) {
            if (statusEl) {
                statusEl.textContent = '⚠️ Please enter a code or name.';
                statusEl.style.color = '#856404';
            }
            return;
        }
        
        statusEl.textContent = '⏳ Looking up...';
        statusEl.style.color = '#666';
        
        try {
            // ---- CHECK FOR GIFT CARD FIRST ----
            if (code.startsWith('GIFT-') || code.startsWith('GC-')) {
                var giftCardResponse = await fetch(getBaseUrl() + '/api/gift-card/balance/' + encodeURIComponent(code), {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                var giftCardData = await giftCardResponse.json();
                
                if (giftCardData.status === 'success') {
                    var balance = giftCardData.balance || 0;
                    
                    checkoutDebtorData = {
                        debtor: code,
                        balance: balance,
                        is_gift_card: true,
                        is_bernie: false
                    };
                    
                    infoDiv.style.display = 'block';
                    nameEl.textContent = code;
                    typeEl.textContent = '🎁 Gift Card';
                    balanceEl.textContent = balance.toFixed(2);
                    balanceEl.style.color = balance > 0 ? '#28a745' : '#dc3545';
                    
                    if (balance <= 0) {
                        statusEl.textContent = '⚠️ This gift card has no balance.';
                        statusEl.style.color = '#856404';
                    } else {
                        statusEl.textContent = '✅ Gift card balance: $' + balance.toFixed(2) + '. Click Apply to use it.';
                        statusEl.style.color = '#28a745';
                    }
                    return;
                } else {
                    infoDiv.style.display = 'block';
                    statusEl.textContent = '❌ Gift card not found. Check the code.';
                    statusEl.style.color = '#dc3545';
                    checkoutDebtorData = null;
                    return;
                }
            }
            
            // ---- DEBTOR / STORE CREDIT LOOKUP ----
            var response = await fetch(getBaseUrl() + '/api/debtor/lookup', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: code })
            });
            
            var data = await response.json();
            
            if (data.status === 'success' && data.balance !== undefined) {
                checkoutDebtorData = data;
                var balance = data.balance || 0;
                var isGiftCard = data.is_gift_card;
                var isBernie = data.is_bernie;
                
                infoDiv.style.display = 'block';
                nameEl.textContent = data.debtor;
                
                if (isGiftCard) {
                    typeEl.textContent = '🎁 Gift Card';
                } else if (isBernie) {
                    typeEl.textContent = '🌹 Bernie Fund (Cannot redeem)';
                } else {
                    typeEl.textContent = '💰 Store Credit';
                }
                
                balanceEl.textContent = balance.toFixed(2);
                balanceEl.style.color = balance > 0 ? '#28a745' : '#dc3545';
                
                if (balance <= 0) {
                    statusEl.textContent = '⚠️ This account has no balance.';
                    statusEl.style.color = '#856404';
                } else if (isBernie) {
                    statusEl.textContent = '⚠️ Bernie funds cannot be redeemed for purchases.';
                    statusEl.style.color = '#856404';
                } else {
                    statusEl.textContent = '✅ Balance available: $' + balance.toFixed(2) + '. Click Apply to use it.';
                    statusEl.style.color = '#28a745';
                }
            } else {
                infoDiv.style.display = 'block';
                statusEl.textContent = '❌ Not found. Check the code or name.';
                statusEl.style.color = '#dc3545';
                checkoutDebtorData = null;
            }
        } catch (error) {
            console.error('Error looking up:', error);
            statusEl.textContent = '❌ Error: ' + error.message;
            statusEl.style.color = '#dc3545';
            checkoutDebtorData = null;
        }
    }

    async function applyDebtorToCheckout() {
        if (!checkoutDebtorData) {
            showCheckoutStatus('Please lookup a debtor first.', 'error');
            return;
        }
        
        var statusEl = document.getElementById('checkout-debtor-status');
        var data = checkoutDebtorData;
        var balance = data.balance || 0;
        
        if (balance <= 0) {
            statusEl.textContent = '⚠️ This account has no balance.';
            statusEl.style.color = '#856404';
            return;
        }
        
        if (checkoutRemaining <= 0.01) {
            statusEl.textContent = '⚠️ No remaining balance to pay.';
            statusEl.style.color = '#856404';
            return;
        }
        
        var amount = Math.min(balance, checkoutRemaining);
        
        try {
            var endpoint, payload;
            
            if (data.is_gift_card) {
                endpoint = '/api/gift-card/redeem';
                payload = {
                    code: data.debtor,
                    purchase_amount: amount,
                    order_id: generateOrderId()
                };
            } else {
                endpoint = '/api/debtor/redeem';
                payload = {
                    name: data.debtor,
                    amount: amount,
                    description: 'Checkout redemption - ' + checkoutSelectedItems.length + ' items'
                };
            }
            
            var response = await fetch(getBaseUrl() + endpoint, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            var result = await response.json();
            
            if (result.status === 'success') {
                var appliedAmount = result.applied_amount || amount;
                var newBalance = result.new_balance || (balance - appliedAmount);
                
                var method = data.is_gift_card ? 'Gift Card (' + data.debtor + ')' : 'Store Credit (' + data.debtor + ')';
                addPaymentEntry(method, appliedAmount);
                
                data.balance = newBalance;
                document.getElementById('checkout-debtor-balance').textContent = newBalance.toFixed(2);
                
                if (newBalance <= 0.01) {
                    statusEl.textContent = '✅ Applied $' + appliedAmount.toFixed(2) + ' from ' + data.debtor + '. Card/account is now empty.';
                    statusEl.style.color = '#28a745';
                    setTimeout(function() {
                        document.getElementById('checkout-debtor-info').style.display = 'none';
                    }, 2000);
                } else {
                    statusEl.textContent = '✅ Applied $' + appliedAmount.toFixed(2) + ' from ' + data.debtor + '. Remaining balance: $' + newBalance.toFixed(2);
                    statusEl.style.color = '#28a745';
                }
                
                if (checkoutRemaining <= 0.01) {
                    updateCheckoutCompleteButton();
                }
                
            } else {
                statusEl.textContent = '❌ ' + (result.error || 'Failed to redeem');
                statusEl.style.color = '#dc3545';
            }
        } catch (error) {
            console.error('Error redeeming:', error);
            statusEl.textContent = '❌ Error: ' + error.message;
            statusEl.style.color = '#dc3545';
        }
    }

    // ============================================================
    // SQUARE PAYMENT
    // ============================================================
    async function processSquarePayment() {
        var statusDiv = document.getElementById('checkout-square-status');
        var completeBtn = document.getElementById('checkout-complete-payment');
        if (!statusDiv) return;

        completeBtn.disabled = true;
        completeBtn.textContent = 'Processing...';

        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message status-info';
        statusDiv.textContent = '⏳ Sending payment request to Square Terminal...';

        try {
            if (!squareAvailable || availableTerminals.length === 0) {
                await checkSquareAvailability();
                if (!squareAvailable || availableTerminals.length === 0) {
                    throw new Error('No Square Terminal available. Please use Cash or Gift Card.');
                }
            }

            var deviceId = availableTerminals[0].id;
            console.log('Using Square Terminal device ID:', deviceId);

            var records = checkoutSelectedItems;
            var totalCents = Math.round(checkoutTotal * 100);
            var recordIds = records.map(function(r) { return r.id; });
            var titles = records.map(function(r) { return r.artist + ' - ' + r.title; });

            addPaymentEntry('Card (Square)', checkoutTotal);

            var response = await fetch(getBaseUrl() + '/api/square/terminal/checkout', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount_cents: totalCents,
                    record_ids: recordIds,
                    record_titles: titles,
                    reference_id: generateOrderId(),
                    device_id: deviceId
                })
            });

            var data = await response.json();
            if (data.status !== 'success') {
                if (checkoutPaymentEntries.length > 0) {
                    var lastEntry = checkoutPaymentEntries[checkoutPaymentEntries.length - 1];
                    if (lastEntry.method === 'Card (Square)') {
                        checkoutPaymentEntries.pop();
                        checkoutRemaining += lastEntry.amount;
                        document.getElementById('checkout-remaining').textContent = checkoutRemaining.toFixed(2);
                        renderCheckoutEntries();
                        updateCheckoutCompleteButton();
                    }
                }
                throw new Error(data.message || 'Failed to create Square checkout');
            }

            var checkout = data.checkout;
            squareCheckoutId = checkout.id;

            statusDiv.textContent = '💳 Payment request sent to POS. Waiting for customer to complete payment...';
            statusDiv.className = 'status-message status-info';

            startPollingSquareStatus(checkout.id);

        } catch (error) {
            console.error('Square checkout error:', error);
            statusDiv.textContent = '❌ Error: ' + error.message;
            statusDiv.className = 'status-message status-error';
            completeBtn.disabled = false;
            completeBtn.textContent = 'Complete Payment';
        }
    }

    function startPollingSquareStatus(checkoutId) {
        if (squarePollInterval) {
            clearInterval(squarePollInterval);
        }

        var statusDiv = document.getElementById('checkout-square-status');
        var attempts = 0;
        var maxAttempts = 60;

        squarePollInterval = setInterval(async function() {
            attempts++;
            try {
                var response = await fetch(getBaseUrl() + '/api/square/terminal/checkout/' + checkoutId + '/status', {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
                var data = await response.json();
                if (data.status !== 'success') {
                    return;
                }

                var checkout = data.checkout;
                var status = checkout.status;

                if (status === 'COMPLETED') {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    statusDiv.textContent = '✅ Payment completed successfully!';
                    statusDiv.className = 'status-message status-success';
                    await completeCheckout();
                    setTimeout(function() {
                        var modal = document.getElementById('checkout-payment-modal');
                        if (modal) modal.style.display = 'none';
                    }, 1500);
                } else if (status === 'CANCELED' || status === 'FAILED') {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    statusDiv.textContent = '❌ Payment ' + status.toLowerCase() + '. Please try again.';
                    statusDiv.className = 'status-message status-error';
                    var completeBtn = document.getElementById('checkout-complete-payment');
                    completeBtn.disabled = false;
                    completeBtn.textContent = 'Complete Payment';
                } else if (status === 'PENDING' || status === 'IN_PROGRESS') {
                    statusDiv.textContent = '⏳ Waiting for payment... (' + attempts + 's)';
                    statusDiv.className = 'status-message status-info';
                }

                if (attempts >= maxAttempts) {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    statusDiv.textContent = '⏰ Payment timed out. Please try again.';
                    statusDiv.className = 'status-message status-warning';
                    var completeBtn = document.getElementById('checkout-complete-payment');
                    completeBtn.disabled = false;
                    completeBtn.textContent = 'Complete Payment';
                }

            } catch (error) {
                console.warn('Polling error:', error);
            }
        }, 2000);
    }

    // ============================================================
    // COMPLETE CHECKOUT
    // ============================================================
    async function completeCheckout() {
        console.log('🛒 completeCheckout called');
        
        if (checkoutRemaining > 0.01) {
            showCheckoutStatus('Remaining balance not covered', 'error');
            return;
        }

        var selected = checkoutSelectedItems;
        if (selected.length === 0) {
            return;
        }

        var today = getLocalMSTDate();
        var success = 0;
        var bernieTotal = 0;
        var consignorTransactions = [];

        var regularRecords = [];
        var bernieItems = [];
        var consignorRecords = [];
        var giftCardItems = [];

        for (var i = 0; i < selected.length; i++) {
            var record = selected[i];
            if (record.isBernie === true) {
                bernieItems.push(record);
            } else if (record.isGiftCard === true) {
                giftCardItems.push(record);
            } else if (record.isCustom === true) {
                // skip other custom items
            } else if (record.consignor_id && record.consignor_id !== 1 && record.consignor_id !== null) {
                consignorRecords.push(record);
            } else {
                regularRecords.push(record);
            }
        }

        // --- 🎁 Create gift cards (only after payment is confirmed) ---
        var giftCardErrors = [];
        for (var i = 0; i < giftCardItems.length; i++) {
            var item = giftCardItems[i];
            try {
                var createPayload = {
                    code: item.barcode,
                    card_value: item.store_price,
                    charge_amount: item.charge_amount || 0,
                    recipient_name: item.recipient || 'Unknown',
                    notes: item.notes || 'Created at checkout',
                    payment_method: 'cash'
                };

                var response = await fetch(getBaseUrl() + '/api/gift-card/create', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(createPayload)
                });

                var data = await response.json();
                if (data.status === 'success') {
                    console.log('✅ Gift card created:', item.barcode);
                    success++;
                } else {
                    giftCardErrors.push(item.barcode + ': ' + (data.error || 'unknown error'));
                }
            } catch (error) {
                giftCardErrors.push(item.barcode + ': ' + error.message);
            }
        }

        if (giftCardErrors.length > 0) {
            showCheckoutStatus('⚠️ Some gift cards failed to create: ' + giftCardErrors.join('; '), 'warning');
        }

        bernieTotal = bernieItems.reduce(function(sum, r) { return sum + (r.store_price || 0); }, 0);
        console.log('🛒 Bernie total:', bernieTotal);
        console.log('🛒 Regular records:', regularRecords.length);
        console.log('🛒 Consignor records:', consignorRecords.length);

        var orderId = generateOrderId();
        var totalAmount = 0;

        var paymentMethod = checkoutPaymentEntries.length > 0 ? checkoutPaymentEntries[0].method : 'Cash';
        var paymentMethodMap = {
            'Cash': 'cash',
            'Card (Square)': 'square',
            'Gift Card': 'giftcard',
            'Store Credit': 'store_credit'
        };
        var salePaymentMethod = paymentMethodMap[paymentMethod] || 'cash';
        
        for (var i = 0; i < selected.length; i++) {
            totalAmount += (selected[i].store_price || 0);
        }

        var saleItems = selected.map(function(item) {
            return {
                id: item.id,
                artist: item.artist || 'Custom',
                title: item.title || 'Item',
                price: item.store_price || 0,
                isCustom: item.isCustom || false,
                isBernie: item.isBernie || false,
                consignor_id: item.consignor_id || null
            };
        });

        try {
            console.log('🛒 Creating sale journal entry for order:', orderId, 'total:', totalAmount);
            var saleResult = await apiRequest('POST', '/api/accounting/sale', {
                order_id: orderId,
                payment_method: salePaymentMethod,
                total_amount: totalAmount,
                items: saleItems,
                transaction_date: today
            });
            if (saleResult.status === 'success') {
                console.log('✅ Sale journal entry created:', saleResult.entry_id);
            } else {
                console.warn('⚠️ Failed to create sale journal entry:', saleResult.error);
            }
        } catch (err) {
            console.error('❌ Error creating sale journal entry:', err);
        }

        for (var i = 0; i < regularRecords.length; i++) {
            var record = regularRecords[i];
            try {
                await apiRequest('PUT', '/records/' + record.id, {
                    status_id: 3,
                    date_sold: today,
                    actual_sale_price: record.store_price
                });
                success++;
            } catch (err) {
                console.error('Failed to update record', record.id, err);
            }
        }

        for (var i = 0; i < consignorRecords.length; i++) {
            var record = consignorRecords[i];
            try {
                var consignorName = 'Unknown Consignor';
                try {
                    var userRes = await apiRequest('GET', '/users/' + record.consignor_id);
                    if (userRes && userRes.id) {
                        consignorName = userRes.full_name || userRes.username || 'Consignor-' + record.consignor_id;
                    }
                } catch (userErr) {
                    console.warn('Could not fetch consignor name for ID:', record.consignor_id, userErr);
                    consignorName = 'Consignor-' + record.consignor_id;
                }

                var salePrice = record.store_price || 0;
                var commissionRate = record.commission_rate || 0.3;
                var consignorShare = salePrice * (1 - commissionRate);
                var storeCommission = salePrice * commissionRate;

                consignorTransactions.push({
                    record_id: record.id,
                    consignor_id: record.consignor_id,
                    consignor_name: consignorName,
                    sale_price: salePrice,
                    commission_rate: commissionRate,
                    consignor_share: consignorShare,
                    store_commission: storeCommission
                });

                await apiRequest('PUT', '/records/' + record.id, {
                    status_id: 3,
                    date_sold: today,
                    actual_sale_price: salePrice
                });
                success++;

            } catch (err) {
                console.error('Failed to process consignor record', record.id, err);
            }
        }

        for (var i = 0; i < consignorTransactions.length; i++) {
            var tx = consignorTransactions[i];
            try {
                var accountsRes = await apiRequest('GET', '/api/accounting/accounts');
                var accounts = accountsRes.accounts || [];
                var cashAccount = accounts.find(function(a) { return a.code === '1015'; });
                var revenueAccount = accounts.find(function(a) { return a.code === '4000'; });
                var payableAccount = accounts.find(function(a) { return a.code === '2015'; });

                if (!cashAccount || !revenueAccount || !payableAccount) {
                    console.error('Required accounts not found for consignor transaction');
                    showCheckoutStatus('Error: Required accounts not found', 'error');
                    continue;
                }

                var entryData = {
                    date: today,
                    description: tx.consignor_name + ' | ISSUE | Record #' + tx.record_id + ' sold - $' + tx.sale_price.toFixed(2) + ' (' + (tx.commission_rate * 100).toFixed(0) + '% commission)',
                    lines: [
                        { account_id: cashAccount.id, debit: tx.sale_price, credit: 0 },
                        { account_id: revenueAccount.id, debit: 0, credit: tx.store_commission },
                        { account_id: payableAccount.id, debit: 0, credit: tx.consignor_share }
                    ]
                };
                var result = await apiRequest('POST', '/api/accounting/manual', entryData);
                if (result.status === 'success') {
                    console.log('✅ Consignor ' + tx.consignor_name + ' credited $' + tx.consignor_share.toFixed(2));
                } else {
                    console.error('Failed to create consignor journal entry:', result.error);
                }
            } catch (err) {
                console.error('Error processing consignor transaction:', err);
            }
        }

        if (bernieTotal > 0) {
            try {
                var accountsRes = await apiRequest('GET', '/api/accounting/accounts');
                var accounts = accountsRes.accounts || [];

                var paymentMethod2 = checkoutPaymentEntries.length > 0 ? checkoutPaymentEntries[0].method : 'Cash';
                var accountMap = {
                    'Cash': '1015',
                    'Card (Square)': '1030',
                    'Gift Card': '1015',
                    'Store Credit': '1015'
                };
                var accountCode = accountMap[paymentMethod2] || '1015';

                var cashAccount = accounts.find(function(a) { return a.code === accountCode; });
                var payableAccount = accounts.find(function(a) { return a.code === '2015'; });

                if (cashAccount && payableAccount) {
                    var entryData = {
                        date: today,
                        description: 'BERNIE | ISSUE | Donation - $' + bernieTotal.toFixed(2) + ' (' + bernieItems.length + ' items)',
                        lines: [
                            { account_id: cashAccount.id, debit: bernieTotal, credit: 0 },
                            { account_id: payableAccount.id, debit: 0, credit: bernieTotal }
                        ]
                    };
                    var result = await apiRequest('POST', '/api/accounting/manual', entryData);
                    if (result.status === 'success') {
                        console.log('✅ Bernie donation journal entry created: $' + bernieTotal.toFixed(2));
                    } else {
                        console.error('Failed to create Bernie journal entry:', result.error);
                    }
                }
            } catch (err) {
                console.error('Error processing Bernie donation:', err);
            }
        }

        var receiptError = null;
        var receiptDownloaded = false;

        var now = new Date();
        var dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        var receipt = 'PigStyle Music\n';
        receipt += '====================\n';
        receipt += dateStr + ' ' + timeStr + '\n';
        receipt += 'Order: ' + orderId + '\n\n';
        receipt += 'ITEMS:\n';
        receipt += '--------------------\n';

        var subtotal = 0;
        for (var i = 0; i < selected.length; i++) {
            var item = selected[i];
            var price = item.store_price || 0;
            var desc = item.isCustom ? item.title : item.artist + ' - ' + item.title;
            if (item.isBernie) {
                receipt += '[Bernie] ' + desc.padEnd(25) + '$' + price.toFixed(2) + '\n';
            } else if (item.consignor_id && item.consignor_id !== 1) {
                receipt += '[Consignor] ' + desc.padEnd(25) + '$' + price.toFixed(2) + '\n';
            } else if (item.isGiftCard) {
                receipt += '[Gift Card] ' + desc.padEnd(25) + '$' + price.toFixed(2) + '\n';
            } else {
                receipt += desc.padEnd(25) + '$' + price.toFixed(2) + '\n';
            }
            subtotal += price;
        }

        var taxRate = 0.08;
        var tax = subtotal * taxRate;
        var grandTotal = subtotal + tax;

        receipt += '--------------------\n';
        receipt += 'Subtotal'.padEnd(25) + '$' + subtotal.toFixed(2) + '\n';
        receipt += 'Tax'.padEnd(25) + '$' + tax.toFixed(2) + '\n';
        receipt += 'Total'.padEnd(25) + '$' + grandTotal.toFixed(2) + '\n\n';

        receipt += 'PAYMENT:\n';
        receipt += '--------------------\n';
        var totalPaid = 0;
        for (var i = 0; i < checkoutPaymentEntries.length; i++) {
            var entry = checkoutPaymentEntries[i];
            receipt += entry.method.padEnd(25) + '$' + entry.amount.toFixed(2) + '\n';
            totalPaid += entry.amount;
        }
        if (totalPaid < grandTotal) {
            receipt += 'Unpaid'.padEnd(25) + '$' + (grandTotal - totalPaid).toFixed(2) + '\n';
        }
        receipt += '--------------------\n';

        receipt += 'Thank you!\n';
        receipt += 'PigStyle Music\n';
        receipt += 'Come back soon!\n\n\n\n';

        var filename = 'receipt_' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + '.txt';

        try {
            downloadReceipt(receipt, filename);
            receiptDownloaded = true;
        } catch (error) {
            receiptError = error.message || 'Download error';
            console.error('Receipt download error:', error);
        }

        var consignorCount = consignorTransactions.length;
        var consignorTotal = consignorTransactions.reduce(function(sum, t) { return sum + t.consignor_share; }, 0);

        var statusMsg = success + ' records marked as sold';
        if (consignorCount > 0) {
            statusMsg += ', ' + consignorCount + ' consignor(s) credited $' + consignorTotal.toFixed(2);
        }
        if (bernieTotal > 0) {
            statusMsg += ', Bernie donations: $' + bernieTotal.toFixed(2);
        }
        if (giftCardErrors.length > 0) {
            statusMsg += ' ⚠️ Gift card errors: ' + giftCardErrors.join('; ');
        }

        if (receiptDownloaded) {
            statusMsg += ' ✅ Receipt downloaded.';
        } else if (receiptError) {
            statusMsg += ' ⚠️ Receipt could not be downloaded (' + receiptError + '). Purchase completed anyway.';
        }

        showCheckoutStatus('✅ ' + statusMsg, receiptError ? 'warning' : 'success');

        checkoutSelectedItems = [];
        checkoutPaymentEntries = [];
        checkoutRemaining = 0;
        selectedIds.clear();
        selectedRecords = [];

        var modal = document.getElementById('checkout-payment-modal');
        if (modal) {
            modal.style.display = 'none';
        }

        records = [];
        totalRecords = 0;
        viewMode = 'search';
        renderTable();
        updatePagination();
        updateSelectionStats();
        updateViewButtons();

        console.log('🛒 completeCheckout finished successfully');
    }

    // ========== Tender Modal (Cash) ==========
    let tenderTotal = 0;
    let tenderItems = [];

    function showTenderModal(total, items) {
        tenderTotal = total;
        tenderItems = items;

        const modal = document.getElementById('item-tender-modal');
        const totalDue = document.getElementById('item-tender-total-due');
        const amountInput = document.getElementById('item-tender-amount');
        const changeContainer = document.getElementById('item-change-display-container');
        const changeAmount = document.getElementById('item-change-amount');
        const completeBtn = document.getElementById('item-complete-payment-btn');

        if (!modal) return;

        totalDue.textContent = formatCurrency(total);
        amountInput.value = '';
        changeContainer.style.display = 'none';
        completeBtn.disabled = true;

        modal.style.display = 'flex';
        amountInput.focus();

        const newAmountInput = amountInput.cloneNode(true);
        amountInput.parentNode.replaceChild(newAmountInput, amountInput);

        newAmountInput.addEventListener('input', function() {
            const received = parseFloat(this.value) || 0;
            if (received >= total) {
                const change = received - total;
                changeAmount.textContent = formatCurrency(change);
                changeContainer.style.display = 'block';
                completeBtn.disabled = false;
            } else {
                changeContainer.style.display = 'none';
                completeBtn.disabled = true;
            }
        });

        newAmountInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !completeBtn.disabled) {
                processCashPayment();
            }
        });
    }

    function closeTenderModal() {
        const modal = document.getElementById('item-tender-modal');
        if (modal) modal.style.display = 'none';
    }

    function processCashPayment() {
        const amountInput = document.getElementById('item-tender-amount');
        const received = parseFloat(amountInput.value) || 0;

        if (received < tenderTotal) {
            showStatus('Amount received is less than total due.', 'error');
            return;
        }

        const change = received - tenderTotal;
        closeTenderModal();

        // This is now handled by completeCheckout via the checkout modal flow
        // But keep for direct calls
        completeSale(tenderItems, 'cash', { amount: received, change: change });
    }

    // ========== Gift Card Modal ==========
    function showGiftCardModal(total, items) {
        const modal = document.getElementById('item-giftcard-modal');
        const totalDue = document.getElementById('item-giftcard-total-due');
        const codeInput = document.getElementById('item-giftcard-code');
        const infoDiv = document.getElementById('item-giftcard-info');
        const applySection = document.getElementById('item-giftcard-apply-section');
        const resultDiv = document.getElementById('item-giftcard-result');

        if (!modal) return;

        totalDue.textContent = formatCurrency(total);
        codeInput.value = '';
        infoDiv.style.display = 'none';
        applySection.style.display = 'none';
        resultDiv.style.display = 'none';

        modal.style.display = 'flex';
        codeInput.focus();
    }

    function closeGiftCardModal() {
        const modal = document.getElementById('item-giftcard-modal');
        if (modal) modal.style.display = 'none';
    }

    async function checkGiftCardForPayment() {
        const codeInput = document.getElementById('item-giftcard-code');
        const code = codeInput.value.trim().toUpperCase();

        if (!code) {
            showStatus('Please enter a gift card code.', 'warning');
            return;
        }

        try {
            const data = await apiRequest('GET', '/api/gift-card/balance/' + encodeURIComponent(code));

            if (data.status === 'success') {
                const balance = data.balance || 0;

                const infoDiv = document.getElementById('item-giftcard-info');
                const applySection = document.getElementById('item-giftcard-apply-section');
                const idDisplay = document.getElementById('item-giftcard-id-display');
                const balanceDisplay = document.getElementById('item-giftcard-balance-display');

                if (idDisplay) idDisplay.textContent = code;
                if (balanceDisplay) balanceDisplay.textContent = formatCurrency(balance);

                infoDiv.style.display = 'block';

                if (balance > 0) {
                    applySection.style.display = 'block';
                    const amountInput = document.getElementById('item-giftcard-amount');
                    if (amountInput) {
                        const total = checkoutTotal || 0;
                        amountInput.value = Math.min(balance, total).toFixed(2);
                        amountInput.max = Math.min(balance, total);
                    }
                } else {
                    applySection.style.display = 'none';
                    showStatus('Gift card has zero balance.', 'warning');
                }
            } else {
                showStatus('Gift card not found.', 'error');
            }
        } catch (error) {
            console.error('Error checking gift card:', error);
            showStatus('Error checking gift card: ' + error.message, 'error');
        }
    }

    async function applyGiftCardToCart() {
        const codeInput = document.getElementById('item-giftcard-code');
        const amountInput = document.getElementById('item-giftcard-amount');
        const code = codeInput.value.trim().toUpperCase();
        const amount = parseFloat(amountInput.value) || 0;

        if (!code) {
            showStatus('Please enter a gift card code.', 'warning');
            return;
        }

        if (amount <= 0) {
            showStatus('Please enter a valid amount to apply.', 'warning');
            return;
        }

        try {
            const data = await apiRequest('POST', '/api/gift-card/redeem', {
                code: code,
                purchase_amount: amount
            });

            if (data.status === 'success') {
                const resultDiv = document.getElementById('item-giftcard-result');
                resultDiv.style.display = 'block';
                resultDiv.style.padding = '10px';
                resultDiv.style.borderRadius = '4px';
                resultDiv.style.background = '#d4edda';
                resultDiv.style.color = '#155724';
                resultDiv.innerHTML = '✅ Applied $' + amount.toFixed(2) + ' from gift card. New balance: ' + formatCurrency(data.new_balance || 0);

                closeGiftCardModal();

                const remaining = (checkoutTotal || 0) - amount;
                if (remaining > 0) {
                    const items = checkoutSelectedItems || [];
                    completeSale(items, 'giftcard_cash', { giftCardAmount: amount, cashAmount: remaining });
                } else {
                    completeSale(checkoutSelectedItems || [], 'giftcard', { amount: amount });
                }
            } else {
                showStatus('Error applying gift card: ' + (data.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error applying gift card:', error);
            showStatus('Error applying gift card: ' + error.message, 'error');
        }
    }

    function setGiftCardAmount(type) {
        const amountInput = document.getElementById('item-giftcard-amount');
        const total = checkoutTotal || 0;
        if (!amountInput) return;

        if (type === 'full') {
            amountInput.value = total.toFixed(2);
        } else if (type === 'half') {
            amountInput.value = (total / 2).toFixed(2);
        }
    }

    // ========== Square Payment Modal ==========
    function showSquarePaymentModal(total, items) {
        // This is now handled by the checkout modal flow
        showCheckoutModal();
    }

    function closeSquarePaymentModal() {
        const modal = document.getElementById('item-square-payment-modal');
        if (modal) modal.style.display = 'none';
        if (squarePollInterval) {
            clearInterval(squarePollInterval);
        }
    }

    function forceCompleteSquarePayment() {
        // Force complete handled in the checkout modal flow
        var modal = document.getElementById('item-square-payment-modal');
        if (modal) modal.style.display = 'none';
        completeCheckout();
    }

    function cancelSquarePayment() {
        const modal = document.getElementById('item-square-payment-modal');
        if (modal) {
            modal.style.display = 'none';
            showStatus('Square payment cancelled.', 'info');
        }
        if (squarePollInterval) {
            clearInterval(squarePollInterval);
        }
    }

    // ========== Complete Sale ==========
    async function completeSale(items, paymentMethod, paymentDetails) {
        try {
            const recordIds = items.map(function(item) { return item.id; });

            const response = await apiRequest('POST', '/records/update-status', {
                record_ids: recordIds,
                status_id: 5
            });

            if (response.status === 'success') {
                const total = items.reduce(function(sum, item) { return sum + (item.price || 0); }, 0);
                const tax = total * 0.08;
                const grandTotal = total + tax;

                showStatus('✅ Sale completed! ' + items.length + ' items sold via ' + paymentMethod, 'success');

                selectedIds.clear();
                await loadRecords(searchInput ? searchInput.value.trim() : '');
                await loadStats();

                generateReceipt(items, paymentMethod, paymentDetails, grandTotal, tax);
            } else {
                throw new Error(response.error || 'Failed to mark records as sold');
            }
        } catch (error) {
            console.error('Error completing sale:', error);
            showStatus('Error completing sale: ' + error.message, 'error');
        }
    }

    // ========== Receipt ==========
    function generateReceipt(items, paymentMethod, paymentDetails, total, tax) {
        let receipt = '=== PIGSTYLE MUSIC ===\n';
        receipt += 'Date: ' + new Date().toLocaleString() + '\n';
        receipt += 'Payment: ' + paymentMethod + '\n';
        receipt += '------------------------\n';

        items.forEach(function(item) {
            const price = item.price || 0;
            receipt += (item.artist || 'Unknown') + ' - ' + (item.title || 'Unknown') + '\n';
            receipt += '  $' + price.toFixed(2) + '\n';
        });

        receipt += '------------------------\n';
        receipt += 'Subtotal: $' + (total - tax).toFixed(2) + '\n';
        receipt += 'Tax (8%): $' + tax.toFixed(2) + '\n';
        receipt += 'Total: $' + total.toFixed(2) + '\n';

        if (paymentMethod === 'cash' && paymentDetails) {
            receipt += 'Amount Received: $' + (paymentDetails.amount || 0).toFixed(2) + '\n';
            receipt += 'Change: $' + (paymentDetails.change || 0).toFixed(2) + '\n';
        }

        receipt += '------------------------\n';
        receipt += 'Thank you for shopping at PigStyle Music!';

        const blob = new Blob([receipt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'receipt_' + new Date().toISOString().slice(0, 10) + '.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showStatus('📄 Receipt downloaded.', 'success');
    }

    // ========== Delete ==========
    function showConfirmDelete(selectedRecords) {
        const modal = document.getElementById('item-confirm-delete-modal');
        const countDisplay = document.getElementById('item-delete-count-display');
        const preview = document.getElementById('item-delete-items-preview');

        if (!modal) return;

        countDisplay.textContent = selectedRecords.length;

        let previewHtml = '';
        selectedRecords.slice(0, 10).forEach(function(r) {
            previewHtml += '<div>' + escapeHtml(r.artist || 'Unknown') + ' - ' + escapeHtml(r.title || 'Unknown') + ' ($' + (r.store_price || 0).toFixed(2) + ')</div>';
        });
        if (selectedRecords.length > 10) {
            previewHtml += '<div style="color:#999;font-style:italic;">... and ' + (selectedRecords.length - 10) + ' more</div>';
        }
        preview.innerHTML = previewHtml;

        modal.style.display = 'flex';
    }

    function closeConfirmDeleteModal() {
        const modal = document.getElementById('item-confirm-delete-modal');
        if (modal) modal.style.display = 'none';
    }

    async function confirmDeleteRecords() {
        const records = window._deleteRecords || [];
        if (records.length === 0) return;

        try {
            const recordIds = records.map(function(r) { return r.id; });

            for (const id of recordIds) {
                await apiRequest('DELETE', '/records/' + id);
            }

            showStatus('✅ ' + records.length + ' record(s) deleted successfully.', 'success');
            closeConfirmDeleteModal();

            selectedIds.clear();
            await loadRecords(searchInput ? searchInput.value.trim() : '');
            await loadStats();

        } catch (error) {
            console.error('Error deleting records:', error);
            showStatus('Error deleting records: ' + error.message, 'error');
        }
    }

    // ========== Refund ==========
    function showConfirmRefund(selectedRecords) {
        const modal = document.getElementById('item-confirm-refund-modal');
        const countDisplay = document.getElementById('item-refund-count-display');
        const preview = document.getElementById('item-refund-items-preview');

        if (!modal) return;

        countDisplay.textContent = selectedRecords.length;

        let previewHtml = '';
        selectedRecords.slice(0, 10).forEach(function(r) {
            previewHtml += '<div>' + escapeHtml(r.artist || 'Unknown') + ' - ' + escapeHtml(r.title || 'Unknown') + ' ($' + (r.store_price || 0).toFixed(2) + ')</div>';
        });
        if (selectedRecords.length > 10) {
            previewHtml += '<div style="color:#999;font-style:italic;">... and ' + (selectedRecords.length - 10) + ' more</div>';
        }
        preview.innerHTML = previewHtml;

        modal.style.display = 'flex';
    }

    function closeConfirmRefundModal() {
        const modal = document.getElementById('item-confirm-refund-modal');
        if (modal) modal.style.display = 'none';
    }

    async function confirmRefundRecords() {
        const records = window._refundRecords || [];
        if (records.length === 0) return;

        try {
            const recordIds = records.map(function(r) { return r.id; });

            await apiRequest('POST', '/records/update-status', {
                record_ids: recordIds,
                status_id: 2
            });

            for (const id of recordIds) {
                await apiRequest('PUT', '/records/' + id, {
                    date_sold: null,
                    actual_sale_price: null
                });
            }

            showStatus('✅ ' + records.length + ' record(s) refunded and restocked.', 'success');
            closeConfirmRefundModal();

            selectedIds.clear();
            await loadRecords(searchInput ? searchInput.value.trim() : '');
            await loadStats();

        } catch (error) {
            console.error('Error refunding records:', error);
            showStatus('Error refunding records: ' + error.message, 'error');
        }
    }

    // ========== Custom Item ==========
    function showCustomItemModal() {
        const modal = document.getElementById('item-custom-item-modal');
        if (!modal) return;

        document.getElementById('item-custom-name').value = '';
        document.getElementById('item-custom-price').value = '';
        document.getElementById('item-custom-quantity').value = '1';
        document.getElementById('item-custom-status').style.display = 'none';

        modal.style.display = 'flex';
        document.getElementById('item-custom-name').focus();
    }

    function closeCustomItemModal() {
        const modal = document.getElementById('item-custom-item-modal');
        if (modal) modal.style.display = 'none';
    }

    function addCustomItem() {
        const name = document.getElementById('item-custom-name').value.trim();
        const price = parseFloat(document.getElementById('item-custom-price').value);
        const quantity = parseInt(document.getElementById('item-custom-quantity').value) || 1;

        if (!name) {
            showStatus('Please enter an item name.', 'warning');
            return;
        }

        if (!price || price <= 0) {
            showStatus('Please enter a valid price.', 'warning');
            return;
        }

        const tempId = 'temp_' + Date.now();
        const tempRecord = {
            id: tempId,
            artist: 'Custom Item',
            title: name,
            store_price: price,
            status_id: 0,
            is_custom: true
        };

        records.unshift(tempRecord);
        selectedIds.add(tempId);
        updateSelectionStats();
        renderTable();

        showStatus('✅ Added "' + name + '" to cart ($' + price.toFixed(2) + ' x ' + quantity + ')', 'success');
        closeCustomItemModal();
    }

    // ========== Bernie Donation ==========
    function addBernieItem() {
        const bernieItem = {
            id: 'bernie_' + Date.now(),
            artist: 'Bernie Sanders',
            title: 'Campaign Donation',
            store_price: 0.99,
            status_id: 0,
            is_bernie: true
        };

        records.unshift(bernieItem);
        selectedIds.add(bernieItem.id);
        updateSelectionStats();
        renderTable();

        showStatus('💸 Added Bernie donation ($0.99) to cart.', 'success');
    }

    // ========== Gift Card Item ==========
    function showGiftCardAddModal() {
        const amount = prompt('Enter gift card amount ($):');
        if (amount === null) return;

        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            showStatus('Please enter a valid amount.', 'warning');
            return;
        }

        const giftCardItem = {
            id: 'giftcard_' + Date.now(),
            artist: 'Gift Card',
            title: '$' + value.toFixed(2) + ' Gift Card',
            store_price: value,
            status_id: 0,
            is_giftcard: true
        };

        records.unshift(giftCardItem);
        selectedIds.add(giftCardItem.id);
        updateSelectionStats();
        renderTable();

        showStatus('🎁 Added gift card ($' + value.toFixed(2) + ') to cart.', 'success');
    }

    // ========== View Functions ==========
    function updateViewButtons() {
        const count = selectedIds.size;
        const badge = document.getElementById('item-selection-count-badge');
        if (badge) badge.textContent = count;
        
        const clearBtn = document.getElementById('item-clear-selection-btn');
        if (clearBtn) clearBtn.style.display = count > 0 ? 'inline-block' : 'none';
        
        const statusText = document.getElementById('item-view-status-text');
        if (statusText) {
            statusText.textContent = count > 0 ? 'Showing selection list (' + count + ' items)' : 'Showing search results';
        }
    }

    function getLocalMSTDate() {
        var now = new Date();
        var year = now.getFullYear();
        var month = String(now.getMonth() + 1).padStart(2, '0');
        var day = String(now.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function downloadReceipt(text, filename) {
        filename = filename || 'receipt.txt';
        console.log('📄 downloadReceipt: filename=' + filename + ', text length=' + text.length);
        var blob = new Blob([text], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('✅ downloadReceipt: file downloaded');
    }

    // ========== Init ==========
    function init() {
        if (isInitialized) return;
        isInitialized = true;

        console.log('🔄 Initializing Item Management...');

        if (searchButton) {
            searchButton.addEventListener('click', performSearch);
        }

        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    performSearch();
                }
            });
        }

        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', clearSearch);
        }

        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', toggleSelectAll);
        }

        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', function() {
                selectAll();
            });
        }

        if (clearSelectionBtn) {
            clearSelectionBtn.addEventListener('click', clearSelection);
        }

        if (clearSelectionTop) {
            clearSelectionTop.addEventListener('click', clearSelection);
        }

        if (executeActionBtn) {
            executeActionBtn.addEventListener('click', executeAction);
        }

        document.querySelectorAll('input[name="item-action-mode"]').forEach(function(radio) {
            radio.addEventListener('change', function() {
                currentActionMode = this.value;
            });
        });

        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', function() {
                pageSize = parseInt(this.value);
                currentPage = 1;
                renderTable();
                updatePagination();
            });
        }

        if (currentPageInput) {
            currentPageInput.addEventListener('change', function() {
                const page = parseInt(this.value);
                const totalPages = Math.ceil(totalRecords / pageSize) || 1;
                if (isNaN(page) || page < 1) {
                    currentPage = 1;
                } else if (page > totalPages) {
                    currentPage = totalPages;
                } else {
                    currentPage = page;
                }
                renderTable();
                updatePagination();
            });
        }

        if (firstPageBtn) {
            firstPageBtn.addEventListener('click', function() {
                currentPage = 1;
                renderTable();
                updatePagination();
            });
        }

        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', function() {
                if (currentPage > 1) {
                    currentPage--;
                    renderTable();
                    updatePagination();
                }
            });
        }

        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', function() {
                const totalPages = Math.ceil(totalRecords / pageSize) || 1;
                if (currentPage < totalPages) {
                    currentPage++;
                    renderTable();
                    updatePagination();
                }
            });
        }

        if (lastPageBtn) {
            lastPageBtn.addEventListener('click', function() {
                const totalPages = Math.ceil(totalRecords / pageSize) || 1;
                currentPage = totalPages;
                renderTable();
                updatePagination();
            });
        }

        const customBtn = document.getElementById('item-custom-item-btn');
        if (customBtn) customBtn.addEventListener('click', showCustomItemModal);

        const bernieBtn = document.getElementById('item-bernie-btn');
        if (bernieBtn) bernieBtn.addEventListener('click', addBernieItem);

        const giftCardBtn = document.getElementById('item-gift-card-btn');
        if (giftCardBtn) giftCardBtn.addEventListener('click', showGiftCardAddModal);

        loadRecords('');
        loadStats();

        console.log('✅ Item Management initialized.');
    }

    // ========== Expose Public API ==========
    window.itemManagement = {
        // Modal functions
        showTenderModal: showTenderModal,
        closeTenderModal: closeTenderModal,
        processCashPayment: processCashPayment,

        showGiftCardModal: showGiftCardModal,
        closeGiftCardModal: closeGiftCardModal,
        checkGiftCardForPayment: checkGiftCardForPayment,
        applyGiftCardToCart: applyGiftCardToCart,
        setGiftCardAmount: setGiftCardAmount,

        showCustomItemModal: showCustomItemModal,
        closeCustomItemModal: closeCustomItemModal,
        addCustomItem: addCustomItem,

        closeSquarePaymentModal: closeSquarePaymentModal,
        forceCompleteSquarePayment: forceCompleteSquarePayment,
        cancelSquarePayment: cancelSquarePayment,

        closeConfirmDeleteModal: closeConfirmDeleteModal,
        confirmDeleteRecords: confirmDeleteRecords,

        closeConfirmRefundModal: closeConfirmRefundModal,
        confirmRefundRecords: confirmRefundRecords,

        // Checkout functions
        showCheckoutModal: showCheckoutModal,
        lookupDebtorForCheckout: lookupDebtorForCheckout,
        applyDebtorToCheckout: applyDebtorToCheckout,

        // Helper functions
        addBernieItem: addBernieItem,
        showGiftCardAddModal: showGiftCardAddModal,

        // State
        tenderTotal: 0,
        tenderItems: [],
        giftCardTotal: 0,
        giftCardItems: [],
        squareTotal: 0,
        squareItems: [],
        deleteRecords: [],
        refundRecords: [],

        // Init
        init: init
    };

    // Auto-init when DOM is ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 100);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

    console.log('✅ item-management.js loaded, API exposed via window.itemManagement');

})();