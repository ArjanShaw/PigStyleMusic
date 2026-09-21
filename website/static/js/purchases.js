// Purchases page - Inventory Purchase Management
(function() {
    'use strict';

    // ===== API BASE URL =====
    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    let selectedPurchaseId = null;
    let purchases = [];
    let purchaseRecords = [];
    let dependenciesLoaded = false;

    // ===== CHECK DEPENDENCIES FOR LABEL PRINTING =====
    function checkDependencies() {
        if (typeof window.jspdf !== 'undefined' && typeof window.JsBarcode !== 'undefined') {
            dependenciesLoaded = true;
            return true;
        }
        return false;
    }

    var checkInterval = setInterval(function() {
        if (checkDependencies()) {
            clearInterval(checkInterval);
            console.log('✅ Label printing dependencies loaded');
        }
    }, 500);

    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(checkDependencies, 500);
    });

    // ===== PRINT LABELS =====
    window.printPurchaseLabels = async function(purchaseId) {
        if (!dependenciesLoaded) {
            showStatus('⏳ Loading label printer dependencies...', 'info');
            await new Promise(function(resolve) {
                var waitInterval = setInterval(function() {
                    if (dependenciesLoaded) {
                        clearInterval(waitInterval);
                        resolve();
                    }
                }, 200);
                setTimeout(function() {
                    clearInterval(waitInterval);
                    resolve();
                }, 10000);
            });
            if (!dependenciesLoaded) {
                showStatus('❌ Label printer dependencies failed to load. Please refresh the page.', 'error');
                return;
            }
        }

        var buttons = document.querySelectorAll('.btn-print[data-purchase-id="' + purchaseId + '"]');
        buttons.forEach(function(btn) { btn.disabled = true; });

        showStatus('📄 Fetching records for purchase #' + purchaseId + '...', 'info');

        try {
            var url = API_BASE + '/records?batch_id=' + purchaseId + '&limit=1000';
            var response = await fetch(url, {
                credentials: 'include',
                mode: 'cors',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            var data = await response.json();
            if (data.status !== 'success') {
                throw new Error(data.error || 'Failed to load records');
            }

            var records = data.records || [];

            if (records.length === 0) {
                showStatus('⚠️ No records found for purchase #' + purchaseId, 'warning');
                buttons.forEach(function(btn) { btn.disabled = false; });
                return;
            }

            showStatus('🖨️ Generating ' + records.length + ' labels for purchase #' + purchaseId + '...', 'info');

            if (window.LabelPrinter) {
                await window.LabelPrinter.generatePriceTags(records, {
                    title: 'Purchase #' + purchaseId + ' - ' + records.length + ' records'
                });
                showStatus('✅ ' + records.length + ' labels printed for purchase #' + purchaseId, 'success');
            } else {
                throw new Error('LabelPrinter not available');
            }

        } catch (error) {
            console.error('Print error:', error);
            showStatus('❌ Error printing labels: ' + error.message, 'error');
        } finally {
            buttons.forEach(function(btn) { btn.disabled = false; });
        }
    };

    // ===== SHOW STATUS TOAST =====
    function showStatus(message, type = 'info') {
        let statusDiv = document.getElementById('purchases-status');

        if (!statusDiv) {
            const container = document.querySelector('.purchases-container') || document.body;
            const div = document.createElement('div');
            div.id = 'purchases-status';
            div.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 8px;
                font-weight: 600;
                z-index: 10000;
                max-width: 400px;
                display: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            `;
            container.appendChild(div);
            statusDiv = div;
        }

        const colors = {
            success: '#d4edda',
            error: '#f8d7da',
            warning: '#fff3cd',
            info: '#cce5ff'
        };
        const textColors = {
            success: '#155724',
            error: '#721c24',
            warning: '#856404',
            info: '#004085'
        };

        statusDiv.style.display = 'block';
        statusDiv.style.background = colors[type] || '#f8f9fa';
        statusDiv.style.color = textColors[type] || '#333';
        statusDiv.textContent = message;

        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

    // ===== LOAD PURCHASES =====
    async function loadPurchases() {
        const list = document.getElementById('purchases-list');
        if (!list) return;

        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';

        try {
            const response = await fetch(`${API_BASE}/api/inventory-purchases`, {
                credentials: 'include',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.status === 401) {
                list.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #dc3545;">
                        <div style="font-size: 48px; margin-bottom: 10px;">🔒</div>
                        <p style="font-size: 16px; font-weight: 600;">Please log in to view purchases</p>
                        <button onclick="window.showPage('login')" style="margin-top: 10px; padding: 8px 20px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            Go to Login
                        </button>
                    </div>
                `;
                return;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'success') {
                purchases = data.purchases || [];
                renderPurchases(purchases);
                updateStats(purchases);
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading purchases:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // ===== RENDER PURCHASES =====
    function renderPurchases(purchasesList) {
        const list = document.getElementById('purchases-list');
        if (!list) return;

        if (!purchasesList || purchasesList.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No purchases found. Click "New Purchase" to create one.</div>';
            return;
        }

        // Remember which rows were expanded
        const expandedRows = new Set();
        document.querySelectorAll('#purchases-list tr.purchase-details').forEach(row => {
            const prev = row.previousElementSibling;
            if (prev && prev.dataset.id) expandedRows.add(prev.dataset.id);
        });

        // Columns: ID, Seller, Contact, Description, Records, Amount, Bill, Created, Updated, Actions
        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Seller</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Contact</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Description</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Records</th>
                    <th style="padding: 8px 10px; text-align: right; color: #333;">Amount</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Bill</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Created</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Updated</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;

        purchasesList.forEach(p => {
            const isSelected = (p.id === selectedPurchaseId);
            const recordCount = p.record_count || 0;
            const createdAt = p.created_at ? new Date(p.created_at).toLocaleString() : '—';
            const updatedAt = p.updated_at ? new Date(p.updated_at).toLocaleString() : '—';

            // Editable-cell styling
            const editStyle = 'padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; background: #fffbe6; outline: none; cursor: text;';

            html += `<tr ${isSelected ? 'style="background: #e3f2fd;"' : ''} data-id="${p.id}">
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${p.id}</td>

                <td contenteditable="true"
                    data-field="seller_name"
                    data-purchase-id="${p.id}"
                    style="${editStyle} min-width: 120px;"
                    onblur="purchasesInlineEdit(this)"
                    onkeydown="purchasesCellKeydown(event, this)">${p.seller_name || ''}</td>

                <td contenteditable="true"
                    data-field="seller_contact"
                    data-purchase-id="${p.id}"
                    style="${editStyle} min-width: 120px;"
                    onblur="purchasesInlineEdit(this)"
                    onkeydown="purchasesCellKeydown(event, this)">${p.seller_contact || ''}</td>

                <td contenteditable="true"
                    data-field="description"
                    data-purchase-id="${p.id}"
                    style="${editStyle} min-width: 180px; max-width: 320px;"
                    onblur="purchasesInlineEdit(this)"
                    onkeydown="purchasesCellKeydown(event, this)">${p.description || ''}</td>

                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${recordCount}</td>

                <td contenteditable="true"
                    data-field="amount_spent"
                    data-purchase-id="${p.id}"
                    style="${editStyle} text-align: right;"
                    onblur="purchasesInlineEdit(this)"
                    onkeydown="purchasesCellKeydown(event, this)">${p.amount_spent && p.amount_spent > 0 ? p.amount_spent.toFixed(2) : ''}</td>

                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #333;">
                    ${p.bill_of_sale_path
                        ? `<a href="${API_BASE}${p.bill_of_sale_path}" target="_blank" style="color: #007bff; text-decoration: none;" title="View bill">📄</a>`
                        : '<span style="color: #999;">—</span>'}
                </td>

                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; white-space: nowrap; font-size: 12px;">${createdAt}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; white-space: nowrap; font-size: 12px;">${updatedAt}</td>

                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: center;">
                        <button onclick="purchasesSelect(${p.id})" style="padding: 4px 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;" title="View records">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button onclick="uploadPurchaseBill(${p.id})" style="padding: 4px 10px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;" title="Upload bill of sale">
                            <i class="fas fa-file-upload"></i>
                        </button>
                        ${recordCount > 0 ? `
                            <button class="btn-print" data-purchase-id="${p.id}" onclick="printPurchaseLabels(${p.id})"
                                    style="padding: 4px 10px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;"
                                    title="Print ${recordCount} labels">
                                <i class="fas fa-print"></i> ${recordCount}
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        list.innerHTML = html;

        // Restore expanded rows
        expandedRows.forEach(id => {
            const row = list.querySelector(`tr[data-id="${id}"]`);
            if (row) {
                loadPurchaseRecords(id);
            }
        });
    }

    // ===== CELL KEYBOARD HANDLER (commit on Enter, cancel on Escape) =====
    window.purchasesCellKeydown = function(event, cell) {
        if (event.key === 'Enter') {
            event.preventDefault();
            cell.blur(); // triggers onblur -> purchasesInlineEdit
        } else if (event.key === 'Escape') {
            event.preventDefault();
            // Revert: re-render from purchases array
            const purchaseId = cell.dataset.purchaseId;
            const field = cell.dataset.field;
            const purchase = purchases.find(p => String(p.id) === String(purchaseId));
            if (purchase) {
                if (field === 'amount_spent') {
                    cell.textContent = purchase.amount_spent && purchase.amount_spent > 0
                        ? purchase.amount_spent.toFixed(2)
                        : '';
                } else {
                    cell.textContent = purchase[field] || '';
                }
            }
            cell.blur();
        }
    };

    // ===== INLINE EDIT HANDLER =====
    window.purchasesInlineEdit = async function(cell) {
        const purchaseId = cell.dataset.purchaseId;
        const field = cell.dataset.field;
        const rawValue = cell.textContent.trim();

        const purchase = purchases.find(p => String(p.id) === String(purchaseId));
        if (!purchase) return;

        // Normalize for comparison
        let oldValue;
        let newValue;

        if (field === 'amount_spent') {
            oldValue = (purchase.amount_spent || 0);
            newValue = parseFloat(rawValue) || 0;
            if (newValue < 0) {
                showStatus('Amount cannot be negative', 'warning');
                cell.textContent = oldValue > 0 ? oldValue.toFixed(2) : '';
                return;
            }
            if (Math.abs(oldValue - newValue) < 0.001) {
                cell.textContent = newValue > 0 ? newValue.toFixed(2) : '';
                return;
            }
        } else {
            oldValue = (purchase[field] || '').toString().trim();
            newValue = rawValue;
            if (oldValue === newValue) return;
        }

        // Visual feedback
        cell.style.background = '#fff3cd';

        // Build the request payload
        const payload = {};
        if (field === 'amount_spent') {
            // amount_spent edits go through the price endpoint
            payload.total_purchase_price = newValue;
        } else {
            payload[field] = newValue;
        }

        // Choose the endpoint: price edits use /api/inventory-purchases, others use /api/purchases
        const url = field === 'amount_spent'
            ? `${API_BASE}/api/inventory-purchases/${purchaseId}`
            : `${API_BASE}/api/purchases/${purchaseId}`;

        try {
            const response = await fetch(url, {
                method: 'PUT',
                credentials: 'include',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.status === 'success') {
                // Update local model
                purchase[field] = newValue;

                // Normalize display
                if (field === 'amount_spent') {
                    cell.textContent = newValue > 0 ? newValue.toFixed(2) : '';
                }

                cell.style.background = '#d4edda';
                setTimeout(() => { cell.style.background = '#fffbe6'; }, 800);

                // Refresh updated_at display by re-fetching in background (optional)
                showStatus(`✅ Updated ${field.replace('_', ' ')}`, 'success');
            } else {
                // Revert
                if (field === 'amount_spent') {
                    cell.textContent = oldValue > 0 ? oldValue.toFixed(2) : '';
                } else {
                    cell.textContent = oldValue;
                }
                cell.style.background = '#f8d7da';
                setTimeout(() => { cell.style.background = '#fffbe6'; }, 800);
                showStatus(`❌ ${data.error || 'Update failed'}`, 'error');
            }
        } catch (err) {
            console.error('Inline edit error:', err);
            if (field === 'amount_spent') {
                cell.textContent = oldValue > 0 ? oldValue.toFixed(2) : '';
            } else {
                cell.textContent = oldValue;
            }
            cell.style.background = '#f8d7da';
            setTimeout(() => { cell.style.background = '#fffbe6'; }, 800);
            showStatus('❌ Error: ' + err.message, 'error');
        }
    };

    // ===== UPLOAD BILL =====
    window.uploadPurchaseBill = function(purchaseId) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.pdf';
        input.onchange = async function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('bill_image', file);

            showStatus('📤 Uploading bill...', 'info');

            try {
                const response = await fetch(`${API_BASE}/api/purchases/${purchaseId}/bill`, {
                    method: 'POST',
                    credentials: 'include',
                    mode: 'cors',
                    body: formData
                });

                const data = await response.json();

                if (data.status === 'success') {
                    showStatus('✅ Bill uploaded', 'success');
                    loadPurchases();
                } else {
                    showStatus('❌ ' + (data.error || 'Upload failed'), 'error');
                }
            } catch (err) {
                console.error('Upload error:', err);
                showStatus('❌ Error: ' + err.message, 'error');
            }
        };
        input.click();
    };

    // ===== UPDATE STATS =====
    function updateStats(purchasesList) {
        const total = purchasesList.length;
        const complete = purchasesList.filter(p => (p.record_count || 0) > 0).length;
        const draft = total - complete;
        const totalRecords = purchasesList.reduce((sum, p) => sum + (p.record_count || 0), 0);

        const totalEl = document.getElementById('purchases-total-count');
        const completeEl = document.getElementById('purchases-complete-count');
        const draftEl = document.getElementById('purchases-draft-count');
        const recordsEl = document.getElementById('purchases-total-records');

        if (totalEl) totalEl.textContent = total;
        if (completeEl) completeEl.textContent = complete;
        if (draftEl) draftEl.textContent = draft;
        if (recordsEl) recordsEl.textContent = totalRecords;
    }

    // ===== SELECT PURCHASE =====
    window.purchasesSelect = async function(id) {
        selectedPurchaseId = id;

        document.querySelectorAll('#purchases-list tr[data-id]').forEach(row => {
            row.style.background = row.dataset.id == id ? '#e3f2fd' : '';
        });

        const deleteBtn = document.getElementById('purchases-delete-btn');
        const purchase = purchases.find(p => p.id === id);
        if (deleteBtn && purchase) {
            deleteBtn.style.display = (purchase.record_count || 0) === 0 ? 'inline-block' : 'none';
        }

        await loadPurchaseRecords(id);
    };

    // ===== LOAD PURCHASE RECORDS =====
    async function loadPurchaseRecords(purchaseId) {
        const list = document.getElementById('purchases-list');
        if (!list) return;

        const row = list.querySelector(`tr[data-id="${purchaseId}"]`);
        if (!row) return;

        const existingDetails = row.nextElementSibling;
        if (existingDetails && existingDetails.classList && existingDetails.classList.contains('purchase-details')) {
            existingDetails.remove();
            return; // toggle off
        }

        try {
            const response = await fetch(`${API_BASE}/records?batch_id=${purchaseId}&limit=500`, {
                credentials: 'include',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'success') {
                purchaseRecords = data.records || [];
                renderPurchaseRecords(purchaseId, purchaseRecords);
            }
        } catch (err) {
            console.error('Error loading purchase records:', err);
            showStatus('Error loading records: ' + err.message, 'error');
        }
    }

    // ===== RENDER PURCHASE RECORDS =====
    function renderPurchaseRecords(purchaseId, records) {
        const list = document.getElementById('purchases-list');
        if (!list) return;

        const row = list.querySelector(`tr[data-id="${purchaseId}"]`);
        if (!row) return;

        let html = `<tr class="purchase-details" style="background: #f8f9fa;">
            <td colspan="10" style="padding: 10px;">
                <div style="font-weight: 600; color: #333; margin-bottom: 8px;">📀 Records (${records.length})</div>
                <div style="max-height: 200px; overflow-y: auto;">`;

        if (records.length === 0) {
            html += '<div style="text-align: center; padding: 20px; color: #999;">No records linked to this purchase</div>';
        } else {
            html += `<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background: #e9ecef;">
                        <th style="padding: 4px 8px; text-align: left; color: #333;">ID</th>
                        <th style="padding: 4px 8px; text-align: left; color: #333;">Artist</th>
                        <th style="padding: 4px 8px; text-align: left; color: #333;">Title</th>
                        <th style="padding: 4px 8px; text-align: left; color: #333;">Sleeve</th>
                        <th style="padding: 4px 8px; text-align: left; color: #333;">Disc</th>
                        <th style="padding: 4px 8px; text-align: right; color: #333;">Price</th>
                        <th style="padding: 4px 8px; text-align: center; color: #333;">Status</th>
                    </tr>
                </thead>
                <tbody>`;

            records.forEach(r => {
                const status = r.status_name || 'Unknown';
                const sleeve = r.sleeve_condition_name || r.sleeve_display || '—';
                const disc = r.disc_condition_name || r.disc_display || '—';
                html += `<tr>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${r.id}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${r.artist || 'Unknown'}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${r.title || 'Unknown'}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${sleeve}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${disc}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${r.store_price ? '$' + r.store_price.toFixed(2) : '—'}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${status}</td>
                </tr>`;
            });

            html += '</tbody></table>';
        }

        html += `</div></td></tr>`;

        row.insertAdjacentHTML('afterend', html);
    }

    // ===== CREATE NEW PURCHASE =====
    window.purchasesCreate = async function() {
        const sellerName = prompt('Enter seller name:');
        if (!sellerName) return;
        const contact = prompt('Enter contact (phone/email) [optional]:') || '';
        const description = prompt('Enter description [optional]:') || '';
        const amount = prompt('Enter total purchase price ($) [optional, default 0]:') || '0';
        const amountValue = parseFloat(amount) || 0;

        try {
            const response = await fetch(`${API_BASE}/api/inventory-purchases`, {
                method: 'POST',
                credentials: 'include',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    seller_name: sellerName,
                    seller_contact: contact,
                    description: description,
                    amount_spent: amountValue
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            if (data.status === 'success') {
                showStatus('✅ Purchase created successfully!', 'success');
                loadPurchases();
                if (data.purchase_id) {
                    selectedPurchaseId = data.purchase_id;
                    setTimeout(() => purchasesSelect(data.purchase_id), 300);
                }
            } else {
                showStatus('❌ Error: ' + (data.error || 'Failed to create purchase'), 'error');
            }
        } catch (err) {
            console.error('Error creating purchase:', err);
            showStatus('❌ Error: ' + err.message, 'error');
        }
    };

    // ===== REFRESH =====
    window.purchasesRefresh = function() {
        loadPurchases();
        showStatus('✅ Refreshed', 'success');
    };

    // ===== DELETE PURCHASE =====
    window.purchasesDelete = async function() {
        if (!selectedPurchaseId) {
            showStatus('Please select a purchase first.', 'warning');
            return;
        }

        if (!confirm('Are you sure you want to delete purchase #' + selectedPurchaseId + '? Records will be unlinked (not deleted).')) {
            return;
        }

        const deleteBtn = document.getElementById('purchases-delete-btn');
        if (deleteBtn) {
            deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            deleteBtn.disabled = true;
        }

        try {
            const response = await fetch(`${API_BASE}/api/inventory-purchases/${selectedPurchaseId}`, {
                method: 'DELETE',
                credentials: 'include',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            if (data.status === 'success') {
                showStatus('✅ Purchase deleted.', 'success');
                selectedPurchaseId = null;
                const deleteBtn2 = document.getElementById('purchases-delete-btn');
                if (deleteBtn2) deleteBtn2.style.display = 'none';
                loadPurchases();
            } else {
                showStatus('❌ Error: ' + (data.error || 'Failed to delete'), 'error');
            }
        } catch (err) {
            console.error('Error deleting purchase:', err);
            showStatus('❌ Error: ' + err.message, 'error');
        } finally {
            if (deleteBtn) {
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
                deleteBtn.disabled = false;
            }
        }
    };

    // ===== INITIALIZE =====
    window.initPurchases = function() {
        console.log('Purchases initialized');
        loadPurchases();
        setTimeout(checkDependencies, 1000);
    };
})();