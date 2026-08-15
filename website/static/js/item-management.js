(function() {
    'use strict';

    // ============================================================
    // ITEM MANAGEMENT - Unified Checkout, Delete, and Refund
    // ============================================================

    // ============================================================
    // GLOBAL STATE
    // ============================================================
    const ItemManagement = {
        // State
        records: [],
        selectedRecords: [],
        selectedIds: new Set(),
        currentPage: 1,
        pageSize: 50,
        totalRecords: 0,
        totalPages: 1,
        searchTerm: '',
        isProcessing: false,
        currentAction: 'checkout',
        viewMode: 'search',
        
        // Checkout state
        checkoutQueue: [],
        checkoutTotal: 0,
        checkoutSelectedItems: [],
        checkoutViewMode: 'list',
        checkoutRemaining: 0,
        checkoutPaymentEntries: [],
        
        // Square state
        squareAvailable: false,
        squareCheckoutId: null,
        squarePollInterval: null,
        availableTerminals: [],
        
        // Debtor state
        checkoutDebtorData: null,
        
        // DOM refs
        elements: {}
    };

    // ============================================================
    // INITIALIZATION
    // ============================================================
    document.addEventListener('DOMContentLoaded', function() {
        console.log('Item Management initializing...');
        
        ItemManagement.elements = {
            statusMessage: document.getElementById('status-message'),
            recordsTableBody: document.getElementById('records-table-body'),
            searchInput: document.getElementById('searchInput'),
            searchButton: document.getElementById('searchButton'),
            clearSearch: document.getElementById('clearSearch'),
            selectAllCheckbox: document.getElementById('select-all-checkbox'),
            selectAllBtn: document.getElementById('select-all-btn'),
            clearSelectionBtn: document.getElementById('clear-selection-btn'),
            executeActionBtn: document.getElementById('execute-action-btn'),
            selectedCountText: document.getElementById('selected-count-text'),
            selectedCountDisplay: document.getElementById('selected-count-display'),
            totalValue: document.getElementById('total-value'),
            totalRecords: document.getElementById('total-records'),
            activeRecords: document.getElementById('active-records'),
            recordCurrentPage: document.getElementById('record-current-page'),
            recordTotalPages: document.getElementById('record-total-pages'),
            recordShowingStart: document.getElementById('record-showing-start'),
            recordShowingEnd: document.getElementById('record-showing-end'),
            recordTotalFiltered: document.getElementById('record-total-filtered'),
            recordFirstPage: document.getElementById('record-first-page'),
            recordPrevPage: document.getElementById('record-prev-page'),
            recordNextPage: document.getElementById('record-next-page'),
            recordLastPage: document.getElementById('record-last-page'),
            recordPageSize: document.getElementById('record-page-size'),
            actionModeRadios: document.querySelectorAll('input[name="actionMode"]'),
            viewStatusText: document.getElementById('view-status-text'),
            selectionCountBadge: document.getElementById('selection-count-badge'),
            clearSelectionBtn: document.getElementById('clear-selection-btn')
        };
        
        setupEventListeners();
        loadStats();
        performSearch();
        
        console.log('Item Management initialized');
    });

    // ============================================================
    // EVENT LISTENERS
    // ============================================================
    function setupEventListeners() {
        console.log('Setting up event listeners...');
        const els = ItemManagement.elements;
        
        if (els.searchButton) {
            els.searchButton.addEventListener('click', performSearch);
        }
        if (els.searchInput) {
            els.searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    performSearch();
                }
            });
        }
        if (els.clearSearch) {
            els.clearSearch.addEventListener('click', clearSearch);
        }
        
        if (els.recordFirstPage) {
            els.recordFirstPage.addEventListener('click', function() { goToPage(1); });
        }
        if (els.recordPrevPage) {
            els.recordPrevPage.addEventListener('click', function() { goToPage(ItemManagement.currentPage - 1); });
        }
        if (els.recordNextPage) {
            els.recordNextPage.addEventListener('click', function() { goToPage(ItemManagement.currentPage + 1); });
        }
        if (els.recordLastPage) {
            els.recordLastPage.addEventListener('click', function() { goToPage(ItemManagement.totalPages); });
        }
        if (els.recordCurrentPage) {
            els.recordCurrentPage.addEventListener('change', function() {
                const page = parseInt(this.value) || 1;
                goToPage(page);
            });
        }
        if (els.recordPageSize) {
            els.recordPageSize.addEventListener('change', function() {
                ItemManagement.pageSize = parseInt(this.value);
                ItemManagement.currentPage = 1;
                performSearch();
            });
        }
        
        if (els.selectAllCheckbox) {
            els.selectAllCheckbox.addEventListener('change', function() {
                if (this.checked) selectAllRecords();
                else clearSelection();
            });
        }
        if (els.selectAllBtn) {
            els.selectAllBtn.addEventListener('click', selectAllRecords);
        }
        if (els.clearSelectionBtn) {
            els.clearSelectionBtn.addEventListener('click', clearSelection);
        }
        if (els.executeActionBtn) {
            els.executeActionBtn.addEventListener('click', executeAction);
        }
        
        els.actionModeRadios.forEach(function(radio) {
            radio.addEventListener('change', function() {
                ItemManagement.currentAction = this.value;
                updateActionUI();
                clearSelection();
                performSearch();
            });
        });
        
        console.log('Event listeners set up');
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================
    function updateViewButtons() {
        const count = ItemManagement.selectedRecords.length;
        const badge = document.getElementById('selection-count-badge');
        if (badge) badge.textContent = count;
        
        const clearBtn = document.getElementById('clear-selection-btn');
        if (clearBtn) clearBtn.style.display = count > 0 ? 'inline-block' : 'none';
        
        const statusText = document.getElementById('view-status-text');
        if (statusText) {
            statusText.textContent = ItemManagement.viewMode === 'selection' 
                ? 'Showing selection list (' + count + ' items)' 
                : 'Showing search results';
        }
        
        const selectedDisplay = document.getElementById('selected-count-display');
        if (selectedDisplay) selectedDisplay.textContent = count;
        const selectedText = document.getElementById('selected-count-text');
        if (selectedText) selectedText.textContent = count;
    }

    // ============================================================
    // SELECTION FUNCTIONS
    // ============================================================
    function addToSelection(record) {
        if (!ItemManagement.selectedRecords.some(r => r.id === record.id)) {
            ItemManagement.selectedRecords.push(record);
            ItemManagement.selectedIds.add(record.id);
        }
        ItemManagement.viewMode = 'selection';
        updateViewButtons();
        renderTable();
        updateSelectionUI();
        updateExecuteButton();
        const searchInput = ItemManagement.elements.searchInput;
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        ItemManagement.searchTerm = '';
    }

    function removeFromSelection(recordId) {
        ItemManagement.selectedRecords = ItemManagement.selectedRecords.filter(r => r.id !== recordId);
        ItemManagement.selectedIds.delete(recordId);
        if (ItemManagement.selectedRecords.length === 0) {
            ItemManagement.viewMode = 'search';
            const searchInput = ItemManagement.elements.searchInput;
            if (searchInput) searchInput.focus();
        }
        updateViewButtons();
        renderTable();
        updateSelectionUI();
        updateExecuteButton();
    }

    function selectAllRecords() {
        ItemManagement.records.forEach(function(record) {
            if (!ItemManagement.selectedRecords.some(r => r.id === record.id)) {
                ItemManagement.selectedRecords.push(record);
                ItemManagement.selectedIds.add(record.id);
            }
        });
        ItemManagement.viewMode = 'selection';
        updateViewButtons();
        renderTable();
        updateSelectionUI();
        updateExecuteButton();
        const searchInput = ItemManagement.elements.searchInput;
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        ItemManagement.searchTerm = '';
    }

    function clearSelection() {
        ItemManagement.selectedRecords = [];
        ItemManagement.selectedIds.clear();
        ItemManagement.viewMode = 'search';
        updateViewButtons();
        renderTable();
        updateSelectionUI();
        updateExecuteButton();
        const searchInput = ItemManagement.elements.searchInput;
        if (searchInput) searchInput.focus();
    }

    function updateSelectionUI() {
        const count = ItemManagement.selectedRecords.length;
        const els = ItemManagement.elements;
        if (els.selectedCountText) els.selectedCountText.textContent = count;
        if (els.selectedCountDisplay) els.selectedCountDisplay.textContent = count;
        if (els.executeActionBtn) els.executeActionBtn.disabled = count === 0;
        
        const total = ItemManagement.records.length;
        if (els.selectAllCheckbox) {
            if (total > 0 && count === total) {
                els.selectAllCheckbox.checked = true;
                els.selectAllCheckbox.indeterminate = false;
            } else if (count > 0 && count < total) {
                els.selectAllCheckbox.checked = false;
                els.selectAllCheckbox.indeterminate = true;
            } else {
                els.selectAllCheckbox.checked = false;
                els.selectAllCheckbox.indeterminate = false;
            }
        }
        
        let totalValue = 0;
        ItemManagement.selectedRecords.forEach(function(record) {
            totalValue += parseFloat(record.store_price) || 0;
        });
        if (els.totalValue) els.totalValue.textContent = '$' + totalValue.toFixed(2);
        
        updateViewButtons();
        updateExecuteButton();
    }

    function updateExecuteButton() {
        const btn = ItemManagement.elements.executeActionBtn;
        if (btn) btn.disabled = ItemManagement.selectedRecords.length === 0;
    }

    function updateActionUI() {
        const action = ItemManagement.currentAction;
        const btn = ItemManagement.elements.executeActionBtn;
        const icons = { 'checkout': 'fa-shopping-cart', 'delete': 'fa-trash', 'refund': 'fa-undo' };
        const labels = { 'checkout': 'Checkout Selected', 'delete': 'Delete Selected', 'refund': 'Refund Selected' };
        const colors = { 'checkout': 'btn-success', 'delete': 'btn-danger', 'refund': 'btn-warning' };
        if (btn) {
            btn.innerHTML = `<i class="fas ${icons[action]}"></i> ${labels[action]}`;
            btn.className = `btn ${colors[action]}`;
            btn.disabled = ItemManagement.selectedRecords.length === 0;
        }
        const searchInput = ItemManagement.elements.searchInput;
        if (searchInput) {
            const placeholders = {
                'checkout': 'Search active records...',
                'refund': 'Search sold records...',
                'delete': 'Search records to delete...'
            };
            searchInput.placeholder = placeholders[action] || 'Search records...';
        }
    }

    // ============================================================
    // SEARCH FUNCTIONS – SIMPLIFIED
    // ============================================================
    function performSearch() {
        console.log('performSearch called');
        const els = ItemManagement.elements;
        ItemManagement.searchTerm = els.searchInput.value.trim();
        ItemManagement.currentPage = 1;

        ItemManagement.viewMode = 'search';
        updateViewButtons();
        showStatus('Searching...', 'info');

        const params = new URLSearchParams();

        // Status filter based on action mode
        const action = ItemManagement.currentAction;
        if (action === 'checkout') params.append('status_ids', '2');
        else if (action === 'refund') params.append('status_ids', '3,4');
        else if (action === 'delete') params.append('status_ids', '1,2');
        else params.append('status_ids', '1,2,3,4');

        // Simple search: send the term as 'search' parameter
        const term = ItemManagement.searchTerm;
        if (term) {
            params.append('search', term);
        }

        // Pagination
        const limit = ItemManagement.pageSize;
        const offset = (ItemManagement.currentPage - 1) * limit;
        params.append('limit', limit);
        params.append('offset', offset);

        const url = `${AppConfig.baseUrl}/records?${params.toString()}`;
        console.log('Fetching:', url);

        fetch(url, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        })
        .then(response => {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(data => {
            if (data.status === 'success') {
                ItemManagement.records = data.records || [];
                ItemManagement.totalRecords = data.total || ItemManagement.records.length;
                ItemManagement.totalPages = Math.ceil(ItemManagement.totalRecords / limit) || 1;

                renderTable();
                updatePagination();
                updateStats();
                updateSelectionUI();
                updateViewButtons();
                hideStatus();

                const actionLabel = { 'checkout': 'Active', 'refund': 'Sold', 'delete': 'New + Active' }[action] || 'All';
                let msg = ItemManagement.records.length === 0 
                    ? `No ${actionLabel} records found.` 
                    : `Showing ${ItemManagement.records.length} ${actionLabel} records${term ? ' matching "' + term + '"' : ''}.`;
                showStatus(msg + ` (Page ${ItemManagement.currentPage} of ${ItemManagement.totalPages})`, 'info');
            } else {
                showStatus(data.error || 'Search failed', 'error');
            }
        })
        .catch(error => {
            console.error('Search error:', error);
            showStatus('Error performing search: ' + error.message, 'error');
        });
    }

    function clearSearch() {
        ItemManagement.elements.searchInput.value = '';
        ItemManagement.searchTerm = '';
        ItemManagement.currentPage = 1;
        ItemManagement.viewMode = 'search';
        updateViewButtons();
        performSearch();
    }

    function goToPage(page) {
        if (page < 1 || page > ItemManagement.totalPages) return;
        ItemManagement.currentPage = page;
        ItemManagement.elements.recordCurrentPage.value = page;
        performSearch();
    }

    // ============================================================
    // RENDER FUNCTIONS
    // ============================================================
    function renderTable() {
        const tbody = ItemManagement.elements.recordsTableBody;
        const viewMode = ItemManagement.viewMode || 'search';
        let records = [];
        let emptyMessage = '';

        if (viewMode === 'selection') {
            records = ItemManagement.selectedRecords;
            emptyMessage = 'No items selected. Search for records and add them to your selection.';
        } else {
            records = ItemManagement.records;
            const action = ItemManagement.currentAction;
            if (action === 'checkout') emptyMessage = 'No active records found. Search to find records to checkout.';
            else if (action === 'refund') emptyMessage = 'No sold records found. Search to find records to refund.';
            else if (action === 'delete') emptyMessage = 'No new or active records found. Search to find records to delete.';
            else emptyMessage = 'Search for items to manage them.';
        }

        if (!records || records.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px;">
                        <i class="fas fa-search" style="font-size: 48px; color: #ccc; display: block; margin-bottom: 15px;"></i>
                        ${ItemManagement.searchTerm && viewMode === 'search' ? 'No records found matching your search.' : emptyMessage}
                    </td>
                </tr>
            `;
            return;
        }

        updateViewButtons();

        let html = '';
        records.forEach(function(record) {
            const isSelected = ItemManagement.selectedIds.has(record.id);
            const statusClass = getStatusClass(record.status_id || record.status);
            const statusLabel = getStatusLabel(record.status_id || record.status);
            const price = parseFloat(record.store_price) || 0;

            let actionHtml = '';
            if (viewMode === 'selection') {
                actionHtml = `<button class="btn btn-sm btn-danger remove-selection-btn" data-id="${record.id}"><i class="fas fa-times"></i> Remove</button>`;
            } else {
                if (isSelected) {
                    actionHtml = `<button class="btn btn-sm btn-secondary" disabled><i class="fas fa-check"></i> Added</button>`;
                } else {
                    actionHtml = `<button class="btn btn-sm btn-success add-selection-btn" data-id="${record.id}"><i class="fas fa-plus"></i> Add</button>`;
                }
            }

            html += `
                <tr class="${isSelected ? 'selected-row' : ''}" data-id="${record.id}">
                    <td><input type="checkbox" class="record-checkbox" data-id="${record.id}" ${isSelected ? 'checked' : ''}></td>
                    <td>${record.id}</td>
                    <td>${escapeHtml(record.artist || 'Unknown')}</td>
                    <td>${escapeHtml(record.title || 'Unknown')}</td>
                    <td><strong>$${price.toFixed(2)}</strong></td>
                    <td><code class="barcode-value">${escapeHtml(record.barcode || 'N/A')}</code></td>
                    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${actionHtml}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Attach event listeners
        if (viewMode === 'selection') {
            tbody.querySelectorAll('.remove-selection-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    removeFromSelection(parseInt(this.dataset.id));
                });
            });
        } else {
            tbody.querySelectorAll('.add-selection-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const id = parseInt(this.dataset.id);
                    const record = ItemManagement.records.find(r => r.id === id);
                    if (record) addToSelection(record);
                });
            });
        }

        tbody.querySelectorAll('.record-checkbox').forEach(function(checkbox) {
            checkbox.addEventListener('change', function() {
                const id = parseInt(this.dataset.id);
                const record = ItemManagement.records.find(r => r.id === id);
                if (this.checked) {
                    if (record) addToSelection(record);
                } else {
                    removeFromSelection(id);
                }
            });
        });
    }

    // ============================================================
    // STATS & PAGINATION
    // ============================================================
    function loadStats() {
        fetch(`${AppConfig.baseUrl}/records/count`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'success') {
                    ItemManagement.elements.totalRecords.textContent = data.count || 0;
                }
            })
            .catch(console.error);
        
        fetch(`${AppConfig.baseUrl}/records/count?status_id=2`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'success') {
                    ItemManagement.elements.activeRecords.textContent = data.count || 0;
                }
            })
            .catch(console.error);
    }

    function updateStats() {
        const start = (ItemManagement.currentPage - 1) * ItemManagement.pageSize + 1;
        const end = Math.min(start + ItemManagement.pageSize - 1, ItemManagement.totalRecords);
        const els = ItemManagement.elements;
        if (els.recordShowingStart) els.recordShowingStart.textContent = ItemManagement.totalRecords > 0 ? start : 0;
        if (els.recordShowingEnd) els.recordShowingEnd.textContent = end;
        if (els.recordTotalFiltered) els.recordTotalFiltered.textContent = ItemManagement.totalRecords;
    }

    function updatePagination() {
        const els = ItemManagement.elements;
        const current = ItemManagement.currentPage;
        const total = ItemManagement.totalPages;
        if (els.recordCurrentPage) els.recordCurrentPage.value = current;
        if (els.recordTotalPages) els.recordTotalPages.textContent = total;
        if (els.recordFirstPage) els.recordFirstPage.disabled = current <= 1;
        if (els.recordPrevPage) els.recordPrevPage.disabled = current <= 1;
        if (els.recordNextPage) els.recordNextPage.disabled = current >= total;
        if (els.recordLastPage) els.recordLastPage.disabled = current >= total;
    }

    // ============================================================
    // ACTION EXECUTION
    // ============================================================
    function executeAction() {
        if (ItemManagement.selectedRecords.length === 0) {
            showStatus('Please select at least one item.', 'warning');
            return;
        }
        const action = ItemManagement.currentAction;
        if (action === 'checkout') {
            executeCheckout();
        } else if (action === 'delete') {
            confirmDelete();
        } else if (action === 'refund') {
            confirmRefund();
        } else {
            showStatus('Unknown action: ' + action, 'error');
        }
    }

    // ============================================================
    // CHECKOUT FUNCTIONS – FULL IMPLEMENTATION
    // ============================================================
    
    function executeCheckout() {
        console.log('🛒 executeCheckout called');
        var selectedRecords = ItemManagement.selectedRecords;
        
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
        
        // Add to checkout queue
        availableRecords.forEach(function(r) {
            if (!ItemManagement.checkoutSelectedItems.some(function(item) { return item.id === r.id; })) {
                ItemManagement.checkoutSelectedItems.push(r);
            }
        });
        
        ItemManagement.checkoutViewMode = 'list';
        showStatus('Added ' + availableRecords.length + ' items to checkout.', 'success');
        showCheckoutModal();
    }

    async function checkSquareAvailability() {
        try {
            var response = await fetch(AppConfig.baseUrl + '/api/square/terminals', {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error('Failed to fetch terminals');
            var data = await response.json();
            ItemManagement.squareAvailable = data.terminals && data.terminals.length > 0;
            ItemManagement.availableTerminals = data.terminals || [];
            console.log('📟 Square terminals available:', ItemManagement.squareAvailable);
        } catch (error) {
            console.warn('Square not available:', error);
            ItemManagement.squareAvailable = false;
            ItemManagement.availableTerminals = [];
        }
        return ItemManagement.squareAvailable;
    }

    function showCheckoutModal() {
        console.log('🛒 showCheckoutModal called');
        
        var oldModal = document.getElementById('checkout-payment-modal');
        if (oldModal) {
            oldModal.parentNode.removeChild(oldModal);
        }

        var selected = ItemManagement.checkoutSelectedItems;
        if (selected.length === 0) {
            showStatus('No records in checkout list', 'warning');
            return;
        }
        
        var total = selected.reduce(function(sum, r) { return sum + (r.store_price || 0); }, 0);
        var tax = total * 0.08;
        var grandTotal = total + tax;
        
        ItemManagement.checkoutTotal = grandTotal;
        ItemManagement.checkoutRemaining = grandTotal;
        ItemManagement.checkoutPaymentEntries = [];

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

        document.getElementById('checkout-remaining').textContent = ItemManagement.checkoutRemaining.toFixed(2);
        renderCheckoutEntries();

        document.getElementById('checkout-add-payment').onclick = function() {
            var amountInput = document.getElementById('checkout-payment-amount');
            var methodSelect2 = document.getElementById('checkout-payment-method');
            var amount = parseFloat(amountInput.value);
            if (isNaN(amount) || amount <= 0) {
                amount = ItemManagement.checkoutRemaining;
                if (amount <= 0) {
                    showCheckoutStatus('No remaining balance to pay.', 'error');
                    return;
                }
                amountInput.value = amount.toFixed(2);
            }
            var method = methodSelect2.value;

            if (method === 'Card (Square)' && !ItemManagement.squareAvailable) {
                showCheckoutStatus('Square POS is not available. Please use Cash.', 'error');
                return;
            }

            addPaymentEntry(method, amount);
        };

        document.getElementById('checkout-complete-payment').onclick = function() {
            if (ItemManagement.checkoutRemaining > 0.01) {
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
        if (amount > ItemManagement.checkoutRemaining && ItemManagement.checkoutRemaining > 0) {
            // allow overpayment
        }
        ItemManagement.checkoutPaymentEntries.push({ method: method, amount: amount });
        ItemManagement.checkoutRemaining -= amount;
        document.getElementById('checkout-remaining').textContent = ItemManagement.checkoutRemaining.toFixed(2);
        renderCheckoutEntries();
        updateCheckoutCompleteButton();
        showCheckoutStatus('Added $' + amount.toFixed(2) + ' ' + method, 'success');
        document.getElementById('checkout-payment-amount').value = '';
    }

    function renderCheckoutEntries() {
        var container = document.getElementById('checkout-payment-entries');
        if (!container) return;
        if (ItemManagement.checkoutPaymentEntries.length === 0) {
            container.innerHTML = '<div style="color: #999; text-align: center; padding: 10px;">No payments added yet.</div>';
            return;
        }
        var html = '';
        ItemManagement.checkoutPaymentEntries.forEach(function(entry, idx) {
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
        var entry = ItemManagement.checkoutPaymentEntries[index];
        if (entry) {
            ItemManagement.checkoutRemaining += entry.amount;
            ItemManagement.checkoutPaymentEntries.splice(index, 1);
            document.getElementById('checkout-remaining').textContent = ItemManagement.checkoutRemaining.toFixed(2);
            renderCheckoutEntries();
            updateCheckoutCompleteButton();
            showCheckoutStatus('Payment entry removed', 'info');
        }
    }

    function updateCheckoutCompleteButton() {
        var btn = document.getElementById('checkout-complete-payment');
        if (btn) {
            btn.disabled = ItemManagement.checkoutRemaining > 0.01;
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
    // LOOKUP DEBTOR – UPDATED to handle gift cards
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
                // Gift card lookup
                var giftCardResponse = await fetch(AppConfig.baseUrl + '/api/gift-card/balance/' + encodeURIComponent(code), {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                var giftCardData = await giftCardResponse.json();
                
                if (giftCardData.status === 'success') {
                    var balance = giftCardData.balance || 0;
                    
                    ItemManagement.checkoutDebtorData = {
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
                    // Gift card not found
                    infoDiv.style.display = 'block';
                    statusEl.textContent = '❌ Gift card not found. Check the code.';
                    statusEl.style.color = '#dc3545';
                    ItemManagement.checkoutDebtorData = null;
                    return;
                }
            }
            
            // ---- DEBTOR / STORE CREDIT LOOKUP ----
            var response = await fetch(AppConfig.baseUrl + '/api/debtor/lookup', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: code })
            });
            
            var data = await response.json();
            
            if (data.status === 'success' && data.balance !== undefined) {
                ItemManagement.checkoutDebtorData = data;
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
                ItemManagement.checkoutDebtorData = null;
            }
        } catch (error) {
            console.error('Error looking up:', error);
            statusEl.textContent = '❌ Error: ' + error.message;
            statusEl.style.color = '#dc3545';
            ItemManagement.checkoutDebtorData = null;
        }
    }

    async function applyDebtorToCheckout() {
    if (!ItemManagement.checkoutDebtorData) {
        showCheckoutStatus('Please lookup a debtor first.', 'error');
        return;
    }
    
    var statusEl = document.getElementById('checkout-debtor-status');
    var data = ItemManagement.checkoutDebtorData;
    var balance = data.balance || 0;
    
    if (balance <= 0) {
        statusEl.textContent = '⚠️ This account has no balance.';
        statusEl.style.color = '#856404';
        return;
    }
    
    if (ItemManagement.checkoutRemaining <= 0.01) {
        statusEl.textContent = '⚠️ No remaining balance to pay.';
        statusEl.style.color = '#856404';
        return;
    }
    
    var amount = Math.min(balance, ItemManagement.checkoutRemaining);
    
    try {
        var endpoint, payload;
        
        // ---- Check if this is a gift card ----
        if (data.is_gift_card) {
            // Use gift card redeem endpoint
            endpoint = '/api/gift-card/redeem';
            payload = {
                code: data.debtor,
                purchase_amount: amount,
                order_id: generateOrderId()   // optional
            };
        } else {
            // Use debtor redeem endpoint for store credit
            endpoint = '/api/debtor/redeem';
            payload = {
                name: data.debtor,
                amount: amount,
                description: 'Checkout redemption - ' + ItemManagement.checkoutSelectedItems.length + ' items'
            };
        }
        
        var response = await fetch(AppConfig.baseUrl + endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        var result = await response.json();
        
        if (result.status === 'success') {
            // ---- Handle success ----
            var appliedAmount = result.applied_amount || amount;
            var newBalance = result.new_balance || (balance - appliedAmount);
            
            // Add payment entry
            var method = data.is_gift_card ? 'Gift Card (' + data.debtor + ')' : 'Store Credit (' + data.debtor + ')';
            addPaymentEntry(method, appliedAmount);
            
            // Update displayed balance
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
            
            if (ItemManagement.checkoutRemaining <= 0.01) {
                updateCheckoutCompleteButton();
            }
            
        } else {
            // ---- Handle error from API ----
            statusEl.textContent = '❌ ' + (result.error || 'Failed to redeem');
            statusEl.style.color = '#dc3545';
        }
    } catch (error) {
        console.error('Error redeeming:', error);
        statusEl.textContent = '❌ Error: ' + error.message;
        statusEl.style.color = '#dc3545';
    }
}

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
            if (!ItemManagement.squareAvailable || ItemManagement.availableTerminals.length === 0) {
                await checkSquareAvailability();
                if (!ItemManagement.squareAvailable || ItemManagement.availableTerminals.length === 0) {
                    throw new Error('No Square Terminal available. Please use Cash or Gift Card.');
                }
            }

            var deviceId = ItemManagement.availableTerminals[0].id;
            console.log('Using Square Terminal device ID:', deviceId);

            var records = ItemManagement.checkoutSelectedItems;
            var totalCents = Math.round(ItemManagement.checkoutTotal * 100);
            var recordIds = records.map(function(r) { return r.id; });
            var titles = records.map(function(r) { return r.artist + ' - ' + r.title; });

            addPaymentEntry('Card (Square)', ItemManagement.checkoutTotal);

            var response = await fetch(AppConfig.baseUrl + '/api/square/terminal/checkout', {
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
                if (ItemManagement.checkoutPaymentEntries.length > 0) {
                    var lastEntry = ItemManagement.checkoutPaymentEntries[ItemManagement.checkoutPaymentEntries.length - 1];
                    if (lastEntry.method === 'Card (Square)') {
                        ItemManagement.checkoutPaymentEntries.pop();
                        ItemManagement.checkoutRemaining += lastEntry.amount;
                        document.getElementById('checkout-remaining').textContent = ItemManagement.checkoutRemaining.toFixed(2);
                        renderCheckoutEntries();
                        updateCheckoutCompleteButton();
                    }
                }
                throw new Error(data.message || 'Failed to create Square checkout');
            }

            var checkout = data.checkout;
            ItemManagement.squareCheckoutId = checkout.id;

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
        if (ItemManagement.squarePollInterval) {
            clearInterval(ItemManagement.squarePollInterval);
        }

        var statusDiv = document.getElementById('checkout-square-status');
        var attempts = 0;
        var maxAttempts = 60;

        ItemManagement.squarePollInterval = setInterval(async function() {
            attempts++;
            try {
                var response = await fetch(AppConfig.baseUrl + '/api/square/terminal/checkout/' + checkoutId + '/status', {
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
                    clearInterval(ItemManagement.squarePollInterval);
                    ItemManagement.squarePollInterval = null;
                    statusDiv.textContent = '✅ Payment completed successfully!';
                    statusDiv.className = 'status-message status-success';
                    await completeCheckout();
                    setTimeout(function() {
                        var modal = document.getElementById('checkout-payment-modal');
                        if (modal) modal.style.display = 'none';
                    }, 1500);
                } else if (status === 'CANCELED' || status === 'FAILED') {
                    clearInterval(ItemManagement.squarePollInterval);
                    ItemManagement.squarePollInterval = null;
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
                    clearInterval(ItemManagement.squarePollInterval);
                    ItemManagement.squarePollInterval = null;
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
    // COMPLETE CHECKOUT – UPDATED to create gift cards after payment
    // ============================================================
    async function completeCheckout() {
        console.log('🛒 completeCheckout called');
        
        if (ItemManagement.checkoutRemaining > 0.01) {
            showCheckoutStatus('Remaining balance not covered', 'error');
            return;
        }

        var selected = ItemManagement.checkoutSelectedItems;
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
                    payment_method: 'cash'   // adjust if needed
                };

                var response = await fetch(AppConfig.baseUrl + '/api/gift-card/create', {
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

        // --- Continue with existing logic: mark records as sold, consignor transactions, etc. ---
        bernieTotal = bernieItems.reduce(function(sum, r) { return sum + (r.store_price || 0); }, 0);
        console.log('🛒 Bernie total:', bernieTotal);
        console.log('🛒 Regular records:', regularRecords.length);
        console.log('🛒 Consignor records:', consignorRecords.length);

        var orderId = generateOrderId();
        var totalAmount = 0;

        var paymentMethod = ItemManagement.checkoutPaymentEntries.length > 0 ? ItemManagement.checkoutPaymentEntries[0].method : 'Cash';
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

                var paymentMethod2 = ItemManagement.checkoutPaymentEntries.length > 0 ? ItemManagement.checkoutPaymentEntries[0].method : 'Cash';
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
        for (var i = 0; i < ItemManagement.checkoutPaymentEntries.length; i++) {
            var entry = ItemManagement.checkoutPaymentEntries[i];
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

        ItemManagement.checkoutSelectedItems = [];
        ItemManagement.checkoutViewMode = 'list';
        ItemManagement.checkoutPaymentEntries = [];
        ItemManagement.checkoutRemaining = 0;
        ItemManagement.selectedRecords = [];
        ItemManagement.selectedIds.clear();

        var modal = document.getElementById('checkout-payment-modal');
        if (modal) {
            modal.style.display = 'none';
        }

        ItemManagement.records = [];
        ItemManagement.totalRecords = 0;
        ItemManagement.viewMode = 'search';
        renderTable();
        updatePagination();
        updateSelectionUI();
        updateViewButtons();

        playSound('success');
        console.log('🛒 completeCheckout finished successfully');
    }

    // ============================================================
    // CUSTOM ITEM FUNCTIONS
    // ============================================================
    
    function showCustomItemModal() {
        var existingModal = document.getElementById('custom-item-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        var modal = document.createElement('div');
        modal.id = 'custom-item-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; width: 95%;">
                <div class="modal-header" style="background: #17a2b8; color: white;">
                    <h3 class="modal-title"><i class="fas fa-plus-circle"></i> Add Custom Item</h3>
                    <button class="modal-close" onclick="closeCustomItemModal()" style="color: white; font-size: 28px; background: none; border: none; cursor: pointer;">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 15px;">
                        <label for="custom-item-desc" style="display:block; font-weight:500; margin-bottom:4px;">Description *</label>
                        <input type="text" id="custom-item-desc" placeholder="e.g., Merchandise, Gift Card, etc." style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="custom-item-price" style="display:block; font-weight:500; margin-bottom:4px;">Price ($) *</label>
                        <input type="number" id="custom-item-price" step="0.01" min="0.01" placeholder="0.00" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                    </div>
                    <div id="custom-item-status" style="margin-top:10px; display:none;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeCustomItemModal()">Cancel</button>
                    <button class="btn btn-success" id="custom-item-add-btn"><i class="fas fa-check"></i> Add to Checkout</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('custom-item-add-btn').addEventListener('click', addCustomItemFromModal);

        document.getElementById('custom-item-desc').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('custom-item-price').focus();
            }
        });
        document.getElementById('custom-item-price').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                addCustomItemFromModal();
            }
        });
    }

    function closeCustomItemModal() {
        var modal = document.getElementById('custom-item-modal');
        if (modal) modal.remove();
    }

    function addCustomItemFromModal() {
        var desc = document.getElementById('custom-item-desc').value.trim();
        var price = parseFloat(document.getElementById('custom-item-price').value);
        var statusDiv = document.getElementById('custom-item-status');

        if (!desc) {
            statusDiv.textContent = 'Please enter a description.';
            statusDiv.className = 'status-message warning';
            statusDiv.style.display = 'block';
            return;
        }
        if (isNaN(price) || price <= 0) {
            statusDiv.textContent = 'Please enter a valid price greater than 0.';
            statusDiv.className = 'status-message error';
            statusDiv.style.display = 'block';
            return;
        }

        var customItem = {
            id: -Date.now(),
            artist: 'Custom',
            title: desc,
            store_price: price,
            barcode: 'CUSTOM',
            isCustom: true
        };

        if (!ItemManagement.selectedRecords.some(function(r) { return r.id === customItem.id; })) {
            ItemManagement.selectedRecords.push(customItem);
            ItemManagement.selectedIds.add(customItem.id);
        }
        if (!ItemManagement.checkoutSelectedItems.some(function(r) { return r.id === customItem.id; })) {
            ItemManagement.checkoutSelectedItems.push(customItem);
        }

        closeCustomItemModal();
        ItemManagement.viewMode = 'selection';
        updateViewButtons();
        renderTable();
        updateSelectionUI();
        updateExecuteButton();

        showStatus('Added custom item: "' + desc + '" for $' + price.toFixed(2), 'success');
    }

    function addBernieItem() {
        var bernieItem = {
            id: -Date.now() - 1,
            artist: 'Bernie',
            title: 'Bern It',
            store_price: 0.99,
            barcode: null,
            isCustom: true,
            isBernie: true
        };

        if (!ItemManagement.selectedRecords.some(function(r) { return r.id === bernieItem.id; })) {
            ItemManagement.selectedRecords.push(bernieItem);
            ItemManagement.selectedIds.add(bernieItem.id);
        }
        if (!ItemManagement.checkoutSelectedItems.some(function(r) { return r.id === bernieItem.id; })) {
            ItemManagement.checkoutSelectedItems.push(bernieItem);
        }

        ItemManagement.viewMode = 'selection';
        updateViewButtons();
        renderTable();
        updateSelectionUI();
        updateExecuteButton();

        showStatus('Added Bernie donation: "Bern It" for $0.99', 'success');
        playSound('success');
    }

    // ============================================================
    // GIFT CARD MODAL – UPDATED (only adds to cart, no API call)
    // ============================================================
    function showGiftCardModal() {
        var existingModal = document.getElementById('checkout-gift-card-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        var modal = document.createElement('div');
        modal.id = 'checkout-gift-card-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; width: 95%;">
                <div class="modal-header" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white;">
                    <h3 class="modal-title"><i class="fas fa-gift"></i> Gift Card</h3>
                    <button class="modal-close" id="checkout-gift-card-close-btn" style="color: white; font-size: 28px; background: none; border: none; cursor: pointer;">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 15px;">
                        <label for="gift-card-code" style="display: block; font-weight: 600; margin-bottom: 5px; color: #333;">Barcode / Code *</label>
                        <input type="text" id="gift-card-code" placeholder="Scan or enter code (e.g., GC-A7F3K9M2)" style="width:100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; text-transform: uppercase;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="gift-card-value" style="display: block; font-weight: 600; margin-bottom: 5px; color: #333;">Card Value ($) *</label>
                        <input type="number" id="gift-card-value" step="0.01" min="0.01" placeholder="0.00" style="width:100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="gift-card-charge" style="display: block; font-weight: 600; margin-bottom: 5px; color: #333;">Charge Amount ($)</label>
                        <input type="number" id="gift-card-charge" step="0.01" min="0" placeholder="0.00" style="width:100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                        <p style="font-size: 12px; color: #666; margin-top: 5px;"><i class="fas fa-info-circle"></i> Set to $0 for free cards, or enter any amount</p>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="gift-card-recipient" style="display: block; font-weight: 600; margin-bottom: 5px; color: #333;">Recipient Name *</label>
                        <input type="text" id="gift-card-recipient" placeholder="Enter recipient name" style="width:100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="gift-card-notes" style="display: block; font-weight: 600; margin-bottom: 5px; color: #333;">Reason / Notes (optional)</label>
                        <input type="text" id="gift-card-notes" placeholder="e.g., Birthday gift, Trade-in, etc." style="width:100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    <div id="gift-card-status" style="margin-top: 10px; display: none;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="checkout-gift-card-cancel-btn">Cancel</button>
                    <button class="btn btn-success" id="gift-card-add-btn"><i class="fas fa-gift"></i> Add to Cart</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // --- Event listeners for close ---
        document.getElementById('checkout-gift-card-close-btn').addEventListener('click', function() {
            closeCheckoutGiftCardModal();
        });
        document.getElementById('checkout-gift-card-cancel-btn').addEventListener('click', function() {
            closeCheckoutGiftCardModal();
        });
        document.getElementById('gift-card-add-btn').addEventListener('click', addGiftCardFromModal);

        // Enter key navigation
        document.getElementById('gift-card-code').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('gift-card-value').focus();
            }
        });
        document.getElementById('gift-card-value').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('gift-card-charge').focus();
            }
        });
        document.getElementById('gift-card-charge').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('gift-card-recipient').focus();
            }
        });
        document.getElementById('gift-card-recipient').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                addGiftCardFromModal();
            }
        });
    }

    function closeCheckoutGiftCardModal() {
        var modal = document.getElementById('checkout-gift-card-modal');
        if (modal) modal.remove();
        // Also remove any old gift-card-modal with the old ID
        var oldModal = document.getElementById('gift-card-modal');
        if (oldModal) oldModal.remove();
    }

    // Keep alias for compatibility
    function closeGiftCardModal() {
        closeCheckoutGiftCardModal();
    }

    // ============================================================
    // GIFT CARD – ADD TO CART (no API call, pending)
    // ============================================================
    function addGiftCardFromModal() {
        var code = document.getElementById('gift-card-code').value.trim().toUpperCase();
        var value = parseFloat(document.getElementById('gift-card-value').value);
        var charge = parseFloat(document.getElementById('gift-card-charge').value) || 0;
        var recipient = document.getElementById('gift-card-recipient').value.trim();
        var notes = document.getElementById('gift-card-notes').value.trim();
        var statusDiv = document.getElementById('gift-card-status');

        // --- Validation ---
        if (!code) {
            if (statusDiv) {
                statusDiv.textContent = 'Please enter a barcode/code.';
                statusDiv.className = 'status-message warning';
                statusDiv.style.display = 'block';
            }
            return;
        }
        if (isNaN(value) || value <= 0) {
            if (statusDiv) {
                statusDiv.textContent = 'Please enter a valid card value greater than 0.';
                statusDiv.className = 'status-message error';
                statusDiv.style.display = 'block';
            }
            return;
        }
        if (!recipient) {
            if (statusDiv) {
                statusDiv.textContent = 'Please enter a recipient name.';
                statusDiv.className = 'status-message warning';
                statusDiv.style.display = 'block';
            }
            return;
        }

        // --- Create temporary gift card item (pending, not in DB yet) ---
        var giftCardItem = {
            id: -Date.now() - 2,
            artist: 'Gift Card',
            title: recipient + (notes ? ' (' + notes + ')' : ''),
            store_price: value,
            barcode: code,
            isCustom: true,
            isGiftCard: true,
            pending: true,
            card_value: value,
            charge_amount: charge,
            recipient: recipient,
            notes: notes
        };

        if (!ItemManagement.selectedRecords.some(function(r) { return r.id === giftCardItem.id; })) {
            ItemManagement.selectedRecords.push(giftCardItem);
            ItemManagement.selectedIds.add(giftCardItem.id);
        }
        if (!ItemManagement.checkoutSelectedItems.some(function(r) { return r.id === giftCardItem.id; })) {
            ItemManagement.checkoutSelectedItems.push(giftCardItem);
        }

        // --- Close modal ---
        closeCheckoutGiftCardModal();

        // --- Update UI ---
        ItemManagement.viewMode = 'selection';
        updateViewButtons();
        renderTable();
        updateSelectionUI();
        updateExecuteButton();

        showStatus('✅ Gift card "' + code + '" added to cart ($' + value.toFixed(2) + '). Will be activated upon successful payment.', 'success');
        playSound('success');
    }

    // ============================================================
    // DELETE FUNCTIONS
    // ============================================================
    function confirmDelete() {
        var selectedRecords = ItemManagement.selectedRecords;
        
        if (selectedRecords.length === 0) {
            showStatus('No records selected for deletion.', 'warning');
            return;
        }
        
        document.getElementById('delete-count-display').textContent = selectedRecords.length;
        
        let previewHtml = '';
        selectedRecords.forEach(function(r) {
            previewHtml += '<div>• ' + escapeHtml(r.artist || 'Unknown') + ' - ' + escapeHtml(r.title || 'Unknown') + ' ($' + (parseFloat(r.store_price) || 0).toFixed(2) + ')</div>';
        });
        document.getElementById('delete-items-preview').innerHTML = previewHtml;
        
        document.getElementById('confirm-delete-modal').style.display = 'flex';
    }

    function confirmDeleteRecords() {
        if (ItemManagement.isProcessing) return;
        ItemManagement.isProcessing = true;
        showStatus('Deleting records...', 'info');
        
        const ids = ItemManagement.selectedRecords.map(function(r) { return r.id; });
        
        fetch(`${AppConfig.baseUrl}/api/records/delete`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ ids: ids })
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(text || 'HTTP ' + response.status);
                });
            }
            return response.json();
        })
        .then(data => {
            ItemManagement.isProcessing = false;
            closeConfirmDeleteModal();
            
            if (data.status === 'success') {
                showStatus('Deleted ' + data.deleted + ' record(s) successfully.', 'success');
                clearSelection();
                performSearch();
                loadStats();
            } else {
                showStatus(data.error || 'Delete failed.', 'error');
            }
        })
        .catch(error => {
            ItemManagement.isProcessing = false;
            console.error('Delete error:', error);
            showStatus('Error deleting records: ' + error.message, 'error');
        });
    }

    function closeConfirmDeleteModal() {
        document.getElementById('confirm-delete-modal').style.display = 'none';
    }

    // ============================================================
    // REFUND FUNCTIONS
    // ============================================================
    function confirmRefund() {
        var selectedRecords = ItemManagement.selectedRecords;
        
        if (selectedRecords.length === 0) {
            showStatus('No records selected for refund.', 'warning');
            return;
        }
        
        var refundable = selectedRecords.filter(function(r) {
            var status = r.status_id || r.status;
            return status === 3 || status === 'sold';
        });
        
        if (refundable.length === 0) {
            showStatus('None of the selected records are sold and can be refunded.', 'warning');
            return;
        }
        
        if (refundable.length < selectedRecords.length) {
            showStatus(selectedRecords.length - refundable.length + ' record(s) are not sold and will be skipped.', 'warning');
        }
        
        document.getElementById('refund-count-display').textContent = refundable.length;
        
        let previewHtml = '';
        refundable.forEach(function(r) {
            previewHtml += '<div>• ' + escapeHtml(r.artist || 'Unknown') + ' - ' + escapeHtml(r.title || 'Unknown') + ' ($' + (parseFloat(r.store_price) || 0).toFixed(2) + ')</div>';
        });
        document.getElementById('refund-items-preview').innerHTML = previewHtml;
        
        ItemManagement._refundIds = refundable.map(function(r) { return r.id; });
        
        document.getElementById('confirm-refund-modal').style.display = 'flex';
    }

    function confirmRefundRecords() {
        if (ItemManagement.isProcessing) return;
        ItemManagement.isProcessing = true;
        showStatus('Processing refunds...', 'info');
        
        const ids = ItemManagement._refundIds || [];
        
        if (ids.length === 0) {
            showStatus('No records to refund.', 'warning');
            ItemManagement.isProcessing = false;
            return;
        }
        
        fetch(`${AppConfig.baseUrl}/api/records/refund`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ ids: ids })
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(text || 'HTTP ' + response.status);
                });
            }
            return response.json();
        })
        .then(data => {
            ItemManagement.isProcessing = false;
            closeConfirmRefundModal();
            ItemManagement._refundIds = [];
            
            if (data.status === 'success') {
                showStatus('Refunded ' + data.refunded + ' record(s) successfully.', 'success');
                clearSelection();
                performSearch();
                loadStats();
            } else {
                showStatus(data.error || 'Refund failed.', 'error');
            }
        })
        .catch(error => {
            ItemManagement.isProcessing = false;
            console.error('Refund error:', error);
            showStatus('Error processing refunds: ' + error.message, 'error');
        });
    }

    function closeConfirmRefundModal() {
        document.getElementById('confirm-refund-modal').style.display = 'none';
    }

    // ============================================================
    // GIFT CARD FUNCTIONS (for payment) – kept for compatibility
    // ============================================================
    function checkGiftCardForPayment() {
        const code = document.getElementById('giftcard-code').value.trim();
        if (!code) {
            showStatus('Please enter a gift card code.', 'warning');
            return;
        }
        
        fetch(`${AppConfig.baseUrl}/api/gift-cards/` + encodeURIComponent(code), {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(text || 'HTTP ' + response.status);
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.status === 'success' && data.card) {
                document.getElementById('giftcard-id-display').textContent = data.card.code;
                document.getElementById('giftcard-balance-display').textContent = '$' + (parseFloat(data.card.balance) || 0).toFixed(2);
                document.getElementById('giftcard-info').style.display = 'block';
                document.getElementById('giftcard-apply-section').style.display = 'block';
                document.getElementById('giftcard-result').style.display = 'none';
            } else {
                showStatus(data.error || 'Gift card not found.', 'error');
            }
        })
        .catch(error => {
            console.error('Gift card check error:', error);
            showStatus('Error checking gift card: ' + error.message, 'error');
        });
    }

    function applyGiftCardToCart() {
        const amount = parseFloat(document.getElementById('giftcard-amount').value) || 0;
        const balance = parseFloat(document.getElementById('giftcard-balance-display').textContent.replace('$', ''));
        const totalDue = ItemManagement.checkoutTotal;
        
        if (amount <= 0) {
            showStatus('Please enter a valid amount.', 'warning');
            return;
        }
        
        if (amount > balance) {
            showStatus('Amount exceeds gift card balance.', 'error');
            return;
        }
        
        if (amount > totalDue) {
            showStatus('Amount exceeds total due.', 'warning');
            return;
        }
        
        // Process checkout with gift card
        processCheckout('gift_card', {
            amount: amount,
            code: document.getElementById('giftcard-code').value.trim(),
            balance_used: amount,
            remaining_balance: balance - amount
        });
    }

    function closeGiftCardModal() {
        document.getElementById('giftcard-modal').style.display = 'none';
        document.getElementById('giftcard-code').value = '';
        document.getElementById('giftcard-info').style.display = 'none';
        document.getElementById('giftcard-apply-section').style.display = 'none';
        document.getElementById('giftcard-result').style.display = 'none';
    }

    // ============================================================
    // SET GIFT CARD AMOUNT
    // ============================================================
    function setGiftCardAmount(type) {
        const totalDue = parseFloat(document.getElementById('giftcard-total-due').textContent.replace('$', ''));
        const balance = parseFloat(document.getElementById('giftcard-balance-display').textContent.replace('$', ''));
        const amountInput = document.getElementById('giftcard-amount');
        
        if (type === 'full') {
            amountInput.value = Math.min(totalDue, balance).toFixed(2);
        } else if (type === 'half') {
            amountInput.value = Math.min(totalDue / 2, balance).toFixed(2);
        }
    }

    // ============================================================
    // PROCESS CHECKOUT (for gift card payments)
    // ============================================================
    function processCheckout(method, details) {
        if (ItemManagement.isProcessing) return;
        ItemManagement.isProcessing = true;
        showStatus('Processing checkout...', 'info');
        
        const items = ItemManagement.checkoutQueue.map(function(item) {
            return { record_id: item.id };
        });
        
        const payload = {
            items: items,
            payment_method: method,
            payment_details: details
        };
        
        fetch(`${AppConfig.baseUrl}/api/checkout/process`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(text || 'HTTP ' + response.status);
                });
            }
            return response.json();
        })
        .then(data => {
            ItemManagement.isProcessing = false;
            closeTenderModal();
            
            if (data.status === 'success') {
                showStatus('Checkout complete! ' + data.completed + ' items sold for $' + data.total.toFixed(2), 'success');
                ItemManagement.checkoutQueue = [];
                ItemManagement.checkoutTotal = 0;
                clearSelection();
                performSearch();
                loadStats();
            } else {
                showStatus(data.error || 'Checkout failed.', 'error');
            }
        })
        .catch(error => {
            ItemManagement.isProcessing = false;
            console.error('Checkout error:', error);
            showStatus('Error processing checkout: ' + error.message, 'error');
        });
    }

    function closeTenderModal() {
        document.getElementById('tender-modal').style.display = 'none';
        document.getElementById('tender-amount').value = '';
        document.getElementById('change-display-container').style.display = 'none';
        document.getElementById('complete-payment-btn').disabled = true;
    }

    function processCashPayment() {
        const totalDue = ItemManagement.checkoutTotal;
        const tenderAmount = parseFloat(document.getElementById('tender-amount').value) || 0;
        const change = tenderAmount - totalDue;
        
        if (tenderAmount < totalDue) {
            showStatus('Insufficient payment amount.', 'error');
            return;
        }
        
        // Process the checkout
        processCheckout('cash', {
            amount: totalDue,
            tendered: tenderAmount,
            change: change
        });
    }

    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================
    function getStatusClass(status) {
        const statusMap = {
            1: 'new',
            2: 'active',
            3: 'sold',
            4: 'removed',
            'new': 'new',
            'active': 'active',
            'sold': 'sold',
            'removed': 'removed'
        };
        return statusMap[status] || 'active';
    }

    function getStatusLabel(status) {
        const labelMap = {
            1: 'New',
            2: 'Active',
            3: 'Sold',
            4: 'Removed',
            'new': 'New',
            'active': 'Active',
            'sold': 'Sold',
            'removed': 'Removed'
        };
        return labelMap[status] || 'Active';
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showStatus(message, type) {
        const el = ItemManagement.elements.statusMessage;
        if (!el) return;
        el.textContent = message;
        el.className = 'status-message ' + type;
        el.style.display = 'block';
    }

    function hideStatus() {
        const el = ItemManagement.elements.statusMessage;
        if (el) {
            el.style.display = 'none';
        }
    }

    function generateOrderId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
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

    async function apiRequest(method, endpoint, body) {
        console.log('🌐 apiRequest: ' + method + ' ' + endpoint, body || '');
        var options = {
            method: method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }
        var res = await fetch(AppConfig.baseUrl + endpoint, options);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' on ' + method + ' ' + endpoint);
        return res.json();
    }

    function playSound(type) {
        try {
            console.log('🔊 Sound requested:', type);
        } catch (e) { console.warn('Sound error:', e); }
    }

    // ============================================================
    // EXPOSE GLOBAL FUNCTIONS FOR HTML
    // ============================================================
    window.performSearch = performSearch;
    window.clearSearch = clearSearch;
    window.goToPage = goToPage;
    window.selectAllRecords = selectAllRecords;
    window.clearSelection = clearSelection;
    window.executeAction = executeAction;
    window.closeTenderModal = closeTenderModal;
    window.closeGiftCardModal = closeGiftCardModal;
    window.closeConfirmDeleteModal = closeConfirmDeleteModal;
    window.closeConfirmRefundModal = closeConfirmRefundModal;
    window.setGiftCardAmount = setGiftCardAmount;
    window.confirmDeleteRecords = confirmDeleteRecords;
    window.confirmRefundRecords = confirmRefundRecords;
    window.checkGiftCardForPayment = checkGiftCardForPayment;
    window.applyGiftCardToCart = applyGiftCardToCart;
    window.lookupDebtorForCheckout = lookupDebtorForCheckout;
    window.applyDebtorToCheckout = applyDebtorToCheckout;
    window.processCashPayment = processCashPayment;
    window.showCustomItemModal = showCustomItemModal;
    window.closeCustomItemModal = closeCustomItemModal;
    window.addBernieItem = addBernieItem;
    window.showGiftCardModal = showGiftCardModal;
    window.closeGiftCardModal = closeGiftCardModal;
    window.closeCheckoutGiftCardModal = closeCheckoutGiftCardModal;

    console.log('Item Management JavaScript loaded.');

})();