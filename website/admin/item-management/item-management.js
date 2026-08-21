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

            // Determine which records to show based on selection count
            const selectedCount = selectedIds.size;
            let displayRecords = pageRecords;

            // If we have selected items, show only selected items
            if (selectedCount > 0) {
                displayRecords = pageRecords.filter(function(r) {
                    return selectedIds.has(r.id);
                });
                // Update view status text
                const viewText = document.getElementById('item-view-status-text');
                if (viewText) {
                    viewText.textContent = 'Showing ' + selectedCount + ' selected item(s)';
                }
            } else {
                // Show all records in search mode
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
                
                // Only show remove button if the record is selected
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

            // Event listeners for checkboxes
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

            // Event listeners for remove buttons
            document.querySelectorAll('.remove-item-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const id = parseInt(this.dataset.id);
                    selectedIds.delete(id);
                    updateSelectionStats();
                    renderTable();
                });
            });

            // Event listeners for add buttons
            document.querySelectorAll('.add-item-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const id = parseInt(this.dataset.id);
                    selectedIds.add(id);
                    updateSelectionStats();
                    renderTable();
                });
            });

            // Update select all checkbox
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

        // Calculate total value of selected items
        let totalValue = 0;
        records.forEach(function(r) {
            if (selectedIds.has(r.id)) {
                totalValue += (r.store_price || 0);
            }
        });
        totalValueSpan.textContent = formatCurrency(totalValue);

        // Update buttons
        executeActionBtn.disabled = count === 0;
        const showClear = count > 0;
        clearSelectionBtn.style.display = showClear ? 'inline-flex' : 'none';
        clearSelectionTop.style.display = showClear ? 'inline-flex' : 'none';

        // Update select all button text
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

        // Update stats
        const selectedCountStat = document.getElementById('item-selected-count');
        if (selectedCountStat) selectedCountStat.textContent = count;
    }

    // ========== Select All ==========
    function selectAll() {
        // Select all records on current page
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
        // Clear selections when doing a new search
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
                showPaymentMethodModal(selectedRecords);
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

    // ========== Payment Method Modal ==========
    function showPaymentMethodModal(selectedRecords) {
        const modal = document.getElementById('item-payment-method-modal');
        if (!modal) {
            showStatus('Payment modal not found.', 'error');
            return;
        }

        // Calculate totals
        const items = selectedRecords.map(function(r) {
            return {
                id: r.id,
                title: r.title || 'Unknown',
                artist: r.artist || 'Unknown',
                price: r.store_price || 0,
                barcode: r.barcode || '',
                condition: r.sleeve_condition_name || 'Unknown'
            };
        });

        const subtotal = items.reduce(function(sum, item) { return sum + item.price; }, 0);
        const taxRate = 0.08;
        const tax = subtotal * taxRate;
        const total = subtotal + tax;

        const totalDisplay = document.getElementById('item-payment-total-display');
        const itemsDisplay = document.getElementById('item-payment-items-display');
        if (totalDisplay) totalDisplay.textContent = formatCurrency(total);
        if (itemsDisplay) itemsDisplay.textContent = items.length + ' item(s)';

        // Store items for later use
        window.itemManagement = window.itemManagement || {};
        window.itemManagement._pendingCheckoutItems = items;
        window.itemManagement._pendingCheckoutTotal = total;

        modal.style.display = 'flex';
    }

    function closePaymentMethodModal() {
        const modal = document.getElementById('item-payment-method-modal');
        if (modal) modal.style.display = 'none';
        window.itemManagement._pendingCheckoutItems = null;
        window.itemManagement._pendingCheckoutTotal = null;
    }

    function selectPaymentMethod(method) {
        closePaymentMethodModal();
        const items = window.itemManagement._pendingCheckoutItems || [];
        const total = window.itemManagement._pendingCheckoutTotal || 0;

        if (!items.length) {
            showStatus('No items to checkout.', 'warning');
            return;
        }

        switch (method) {
            case 'cash':
                showTenderModal(total, items);
                break;
            case 'square':
                showSquarePaymentModal(total, items);
                break;
            case 'giftcard':
                showGiftCardModal(total, items);
                break;
            default:
                showStatus('Unknown payment method.', 'error');
        }
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

        // Clear previous listeners
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

        // Mark records as sold
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

        window.itemManagement = window.itemManagement || {};
        window.itemManagement.giftCardTotal = total;
        window.itemManagement.giftCardItems = items;
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
                const total = window.itemManagement.giftCardTotal || 0;

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

                // Complete the sale with the remaining balance as cash
                const remaining = (window.itemManagement.giftCardTotal || 0) - amount;
                if (remaining > 0) {
                    const items = window.itemManagement.giftCardItems || [];
                    completeSale(items, 'giftcard_cash', { giftCardAmount: amount, cashAmount: remaining });
                } else {
                    completeSale(window.itemManagement.giftCardItems || [], 'giftcard', { amount: amount });
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
        const total = window.itemManagement.giftCardTotal || 0;
        if (!amountInput) return;

        if (type === 'full') {
            amountInput.value = total.toFixed(2);
        } else if (type === 'half') {
            amountInput.value = (total / 2).toFixed(2);
        }
    }

    // ========== Square Payment Modal ==========
    function showSquarePaymentModal(total, items) {
        const modal = document.getElementById('item-square-payment-modal');
        const amountDisplay = document.getElementById('item-square-modal-amount');
        const statusMessageEl = document.getElementById('item-square-status-message');
        const statusDetail = document.getElementById('item-square-status-detail');
        const statusText = document.getElementById('item-square-modal-status-text');
        const forceWarning = document.getElementById('item-square-force-warning');

        if (!modal) return;

        amountDisplay.textContent = formatCurrency(total);
        statusMessageEl.textContent = 'Waiting for payment on terminal...';
        statusDetail.textContent = 'Please complete payment on the Square Terminal';
        statusText.textContent = 'Waiting...';
        statusText.style.color = '#ffc107';
        forceWarning.style.display = 'none';

        modal.style.display = 'flex';

        window.itemManagement = window.itemManagement || {};
        window.itemManagement.squareTotal = total;
        window.itemManagement.squareItems = items;
        window.itemManagement.squareCompleted = false;

        // Auto-poll Square for payment status (simulated)
        let pollCount = 0;
        const maxPolls = 30;

        const pollInterval = setInterval(function() {
            pollCount++;
            if (pollCount > maxPolls || window.itemManagement.squareCompleted) {
                clearInterval(pollInterval);
                return;
            }

            // Simulate Square payment check - in production, this would hit the Square API
            if (pollCount > 5 && Math.random() < 0.1) {
                window.itemManagement.squareCompleted = true;
                clearInterval(pollInterval);
                statusMessageEl.textContent = '✅ Payment completed!';
                statusDetail.textContent = 'Payment successful on Square Terminal';
                statusText.textContent = 'Completed';
                statusText.style.color = '#28a745';

                setTimeout(function() {
                    modal.style.display = 'none';
                    completeSale(window.itemManagement.squareItems, 'square', { amount: window.itemManagement.squareTotal });
                }, 1500);
            }
        }, 3000);

        window.itemManagement._squarePollInterval = pollInterval;
    }

    function closeSquarePaymentModal() {
        const modal = document.getElementById('item-square-payment-modal');
        if (modal) modal.style.display = 'none';
        if (window.itemManagement && window.itemManagement._squarePollInterval) {
            clearInterval(window.itemManagement._squarePollInterval);
        }
    }

    function forceCompleteSquarePayment() {
        const modal = document.getElementById('item-square-payment-modal');
        const statusMessageEl = document.getElementById('item-square-status-message');
        const statusText = document.getElementById('item-square-modal-status-text');
        const forceWarning = document.getElementById('item-square-force-warning');

        if (!modal) return;

        forceWarning.style.display = 'block';
        setTimeout(function() {
            statusMessageEl.textContent = '✅ Payment force-completed!';
            statusText.textContent = 'Force Completed';
            statusText.style.color = '#28a745';

            window.itemManagement.squareCompleted = true;
            if (window.itemManagement._squarePollInterval) {
                clearInterval(window.itemManagement._squarePollInterval);
            }

            setTimeout(function() {
                modal.style.display = 'none';
                completeSale(window.itemManagement.squareItems || [], 'square', { amount: window.itemManagement.squareTotal || 0 });
            }, 1500);
        }, 1000);
    }

    function cancelSquarePayment() {
        const modal = document.getElementById('item-square-payment-modal');
        if (modal) {
            modal.style.display = 'none';
            showStatus('Square payment cancelled.', 'info');
        }
        if (window.itemManagement && window.itemManagement._squarePollInterval) {
            clearInterval(window.itemManagement._squarePollInterval);
        }
    }

    // ========== Complete Sale ==========
    async function completeSale(items, paymentMethod, paymentDetails) {
        try {
            const recordIds = items.map(function(item) { return item.id; });

            // Mark records as sold
            const response = await apiRequest('POST', '/records/update-status', {
                record_ids: recordIds,
                status_id: 5 // Sold Online
            });

            if (response.status === 'success') {
                const total = items.reduce(function(sum, item) { return sum + (item.price || 0); }, 0);
                const tax = total * 0.08;
                const grandTotal = total + tax;

                showStatus('✅ Sale completed! ' + items.length + ' items sold via ' + paymentMethod, 'success');

                // Clear selection and refresh
                selectedIds.clear();
                await loadRecords(searchInput ? searchInput.value.trim() : '');
                await loadStats();

                // Generate receipt
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

        // Download receipt
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

        window.itemManagement = window.itemManagement || {};
        window.itemManagement.deleteRecords = selectedRecords;
    }

    function closeConfirmDeleteModal() {
        const modal = document.getElementById('item-confirm-delete-modal');
        if (modal) modal.style.display = 'none';
    }

    async function confirmDeleteRecords() {
        const records = window.itemManagement.deleteRecords || [];
        if (records.length === 0) return;

        try {
            const recordIds = records.map(function(r) { return r.id; });

            // Delete each record
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

        window.itemManagement = window.itemManagement || {};
        window.itemManagement.refundRecords = selectedRecords;
    }

    function closeConfirmRefundModal() {
        const modal = document.getElementById('item-confirm-refund-modal');
        if (modal) modal.style.display = 'none';
    }

    async function confirmRefundRecords() {
        const records = window.itemManagement.refundRecords || [];
        if (records.length === 0) return;

        try {
            const recordIds = records.map(function(r) { return r.id; });

            // Set status back to Active (2) and clear sale fields
            await apiRequest('POST', '/records/update-status', {
                record_ids: recordIds,
                status_id: 2
            });

            // Also clear date_sold and actual_sale_price for each record
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

        // Create a custom item object
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

    // ========== Init ==========
    function init() {
        if (isInitialized) return;
        isInitialized = true;

        console.log('🔄 Initializing Item Management...');

        // Set up event listeners
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

        // Action mode radio buttons
        document.querySelectorAll('input[name="item-action-mode"]').forEach(function(radio) {
            radio.addEventListener('change', function() {
                currentActionMode = this.value;
            });
        });

        // Pagination
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

        // Custom item buttons
        const customBtn = document.getElementById('item-custom-item-btn');
        if (customBtn) customBtn.addEventListener('click', showCustomItemModal);

        const bernieBtn = document.getElementById('item-bernie-btn');
        if (bernieBtn) bernieBtn.addEventListener('click', addBernieItem);

        const giftCardBtn = document.getElementById('item-gift-card-btn');
        if (giftCardBtn) giftCardBtn.addEventListener('click', showGiftCardAddModal);

        // Payment method modal buttons
        const paymentMethodCancel = document.querySelector('#item-payment-method-modal .btn-secondary');
        if (paymentMethodCancel) {
            paymentMethodCancel.addEventListener('click', closePaymentMethodModal);
        }

        // Load initial data
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

        showSquarePaymentModal: showSquarePaymentModal,
        closeSquarePaymentModal: closeSquarePaymentModal,
        forceCompleteSquarePayment: forceCompleteSquarePayment,
        cancelSquarePayment: cancelSquarePayment,

        closeConfirmDeleteModal: closeConfirmDeleteModal,
        confirmDeleteRecords: confirmDeleteRecords,

        closeConfirmRefundModal: closeConfirmRefundModal,
        confirmRefundRecords: confirmRefundRecords,

        // Payment method modal functions
        showPaymentMethodModal: showPaymentMethodModal,
        closePaymentMethodModal: closePaymentMethodModal,
        selectPaymentMethod: selectPaymentMethod,

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
        _pendingCheckoutItems: null,
        _pendingCheckoutTotal: null,

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