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

    // Bulk action modal state
    let bulkActionType = null;   // 'format' | 'status' | 'location'
    let bulkActionPurchaseId = null;

    // Cached dropdown data
    let cachedFormats = null;
    let cachedLocations = null;

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

        showStatus('📄 Fetching records for purchase #' + purchaseId + '...', 'info');

        try {
            var url = API_BASE + '/records?batch_id=' + purchaseId + '&status_ids=1,2,3,4&limit=1000';
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
                z-index: 10002;
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

        const expandedRows = new Set();
        document.querySelectorAll('#purchases-list tr.purchase-details').forEach(row => {
            const prev = row.previousElementSibling;
            if (prev && prev.dataset.id) expandedRows.add(prev.dataset.id);
        });

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
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;

        purchasesList.forEach(p => {
            const isSelected = (p.id === selectedPurchaseId);
            const recordCount = p.record_count || 0;
            const createdAt = p.created_at ? new Date(p.created_at).toLocaleString() : '—';

            const editStyle = 'padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; background: #fffbe6; outline: none; cursor: text;';

            html += `<tr ${isSelected ? 'style="background: #e3f2fd; cursor: pointer;"' : 'style="cursor: pointer;"'}
                         data-id="${p.id}"
                         onclick="purchasesRowClick(event, ${p.id})">
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${p.id}</td>

                <td contenteditable="true"
                    data-field="seller_name"
                    data-purchase-id="${p.id}"
                    style="${editStyle} min-width: 120px;"
                    onclick="event.stopPropagation();"
                    onblur="purchasesInlineEdit(this)"
                    onkeydown="purchasesCellKeydown(event, this)">${p.seller_name || ''}</td>

                <td contenteditable="true"
                    data-field="seller_contact"
                    data-purchase-id="${p.id}"
                    style="${editStyle} min-width: 120px;"
                    onclick="event.stopPropagation();"
                    onblur="purchasesInlineEdit(this)"
                    onkeydown="purchasesCellKeydown(event, this)">${p.seller_contact || ''}</td>

                <td contenteditable="true"
                    data-field="description"
                    data-purchase-id="${p.id}"
                    style="${editStyle} min-width: 180px; max-width: 320px;"
                    onclick="event.stopPropagation();"
                    onblur="purchasesInlineEdit(this)"
                    onkeydown="purchasesCellKeydown(event, this)">${p.description || ''}</td>

                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${recordCount}</td>

                <td contenteditable="true"
                    data-field="amount_spent"
                    data-purchase-id="${p.id}"
                    style="${editStyle} text-align: right;"
                    onclick="event.stopPropagation();"
                    onblur="purchasesInlineEdit(this)"
                    onkeydown="purchasesCellKeydown(event, this)">${p.amount_spent && p.amount_spent > 0 ? p.amount_spent.toFixed(2) : ''}</td>

                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #333;" onclick="event.stopPropagation();">
                    ${p.bill_of_sale_path
                        ? `<a href="${API_BASE}${p.bill_of_sale_path}" target="_blank" style="color: #007bff; text-decoration: none;" title="View bill">📄</a>`
                        : '<span style="color: #999;">—</span>'}
                </td>

                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; white-space: nowrap; font-size: 12px;">${createdAt}</td>

                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; position: relative;" onclick="event.stopPropagation();">
                    <button onclick="purchasesToggleRowActions(event, ${p.id})"
                            style="padding: 5px 12px; background: #6f42c1; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;">
                        <i class="fas fa-bolt"></i> Actions <i class="fas fa-caret-down"></i>
                    </button>
                    <div id="purchases-row-menu-${p.id}"
                         class="purchases-row-action-menu"
                         style="display: none; position: absolute; top: 100%; right: 8px; margin-top: 2px; background: white; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); z-index: 1000; min-width: 210px; padding: 6px 0; text-align: left;">
                        <div class="pa-item" onclick="purchasesRowAction(${p.id}, 'view')" style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: #333;">
                            <i class="fas fa-eye" style="width: 20px; color: #007bff;"></i> View Records
                        </div>
                        <div class="pa-item" onclick="purchasesRowAction(${p.id}, 'upload-bill')" style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: #333;">
                            <i class="fas fa-file-upload" style="width: 20px; color: #6c757d;"></i> Upload Bill
                        </div>
                        <div class="pa-item" onclick="purchasesRowAction(${p.id}, 'print')" style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: #333;">
                            <i class="fas fa-print" style="width: 20px; color: #17a2b8;"></i> Print Labels ${recordCount > 0 ? `(${recordCount})` : ''}
                        </div>
                        <div style="height: 1px; background: #eee; margin: 4px 0;"></div>
                        <div class="pa-item" onclick="purchasesRowAction(${p.id}, 'set-format')" style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: #333;">
                            <i class="fas fa-compact-disc" style="width: 20px; color: #e83e8c;"></i> Set Format…
                        </div>
                        <div class="pa-item" onclick="purchasesRowAction(${p.id}, 'set-status')" style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: #333;">
                            <i class="fas fa-toggle-on" style="width: 20px; color: #28a745;"></i> Set Status…
                        </div>
                        <div class="pa-item" onclick="purchasesRowAction(${p.id}, 'move-location')" style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: #333;">
                            <i class="fas fa-map-marker-alt" style="width: 20px; color: #fd7e14;"></i> Move to Location…
                        </div>
                        <div style="height: 1px; background: #eee; margin: 4px 0;"></div>
                        <div class="pa-item" onclick="purchasesRowAction(${p.id}, 'delete')" style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: #dc3545;">
                            <i class="fas fa-trash" style="width: 20px;"></i> Delete Purchase
                        </div>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        list.innerHTML = html;

        expandedRows.forEach(id => {
            const row = list.querySelector(`tr[data-id="${id}"]`);
            if (row) {
                loadPurchaseRecords(id);
            }
        });
    }

    // ===== ROW CLICK =====
    window.purchasesRowClick = function(event, id) {
        if (event.target.isContentEditable) return;
        if (event.target.closest('a, button, input, select, .purchases-row-action-menu')) return;
        purchasesSelect(id);
    };

    // ===== CELL KEYBOARD HANDLER =====
    window.purchasesCellKeydown = function(event, cell) {
        if (event.key === 'Enter') {
            event.preventDefault();
            cell.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
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

        cell.style.background = '#fff3cd';

        const payload = {};
        if (field === 'amount_spent') {
            payload.total_purchase_price = newValue;
        } else {
            payload[field] = newValue;
        }

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
                purchase[field] = newValue;

                if (field === 'amount_spent') {
                    cell.textContent = newValue > 0 ? newValue.toFixed(2) : '';
                }

                cell.style.background = '#d4edda';
                setTimeout(() => { cell.style.background = '#fffbe6'; }, 800);

                showStatus(`✅ Updated ${field.replace('_', ' ')}`, 'success');
            } else {
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
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/records?batch_id=${purchaseId}&status_ids=1,2,3,4&limit=500`, {
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
            <td colspan="9" style="padding: 10px;">
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
                        <th style="padding: 4px 8px; text-align: left; color: #333;">Format</th>
                        <th style="padding: 4px 8px; text-align: left; color: #333;">Location</th>
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
                const format = r.format_name || '—';
                const location = r.location_display || r.location_name || '—';
                html += `<tr>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${r.id}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${r.artist || 'Unknown'}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${r.title || 'Unknown'}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${format}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${location}</td>
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

    // ============================================================
    // ===== ROW ACTIONS DROPDOWN =====
    // ============================================================

    window.purchasesToggleRowActions = function(event, purchaseId) {
        event.stopPropagation();

        // Close all other open menus
        document.querySelectorAll('.purchases-row-action-menu').forEach(m => {
            if (m.id !== `purchases-row-menu-${purchaseId}`) {
                m.style.display = 'none';
            }
        });

        const menu = document.getElementById(`purchases-row-menu-${purchaseId}`);
        if (!menu) return;
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    };

    // Close row menus when clicking elsewhere
    document.addEventListener('click', function(e) {
        document.querySelectorAll('.purchases-row-action-menu').forEach(m => {
            if (!m.contains(e.target) && !e.target.closest('button')) {
                m.style.display = 'none';
            }
        });
    });

    function closeAllRowMenus() {
        document.querySelectorAll('.purchases-row-action-menu').forEach(m => {
            m.style.display = 'none';
        });
    }

    window.purchasesRowAction = async function(purchaseId, action) {
        closeAllRowMenus();

        // Every action operates on the purchase that owns the row
        selectedPurchaseId = purchaseId;

        if (action === 'view') {
            await loadPurchaseRecords(purchaseId);
        }
        else if (action === 'upload-bill') {
            uploadPurchaseBill(purchaseId);
        }
        else if (action === 'print') {
            printPurchaseLabels(purchaseId);
        }
        else if (action === 'set-format') {
            await openBulkModal('format', purchaseId);
        }
        else if (action === 'set-status') {
            await openBulkModal('status', purchaseId);
        }
        else if (action === 'move-location') {
            await openBulkModal('location', purchaseId);
        }
        else if (action === 'delete') {
            purchasesDelete(purchaseId);
        }
    };

    // ============================================================
    // ===== BULK ACTION MODAL =====
    // ============================================================

    async function openBulkModal(type, purchaseId) {
        bulkActionType = type;
        bulkActionPurchaseId = purchaseId;

        const modal = document.getElementById('purchases-action-modal');
        const titleEl = document.getElementById('purchases-action-title');
        const descEl = document.getElementById('purchases-action-desc');
        const bodyEl = document.getElementById('purchases-action-body');
        const statusEl = document.getElementById('purchases-action-status');
        const confirmBtn = document.getElementById('purchases-action-confirm');

        statusEl.style.display = 'none';
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-check"></i> Apply';

        // Count records first
        let recordCount = 0;
        try {
            const resp = await fetch(`${API_BASE}/records?batch_id=${purchaseId}&status_ids=1,2,3,4&limit=1000`, {
                credentials: 'include',
                mode: 'cors',
                headers: { 'Accept': 'application/json' }
            });
            const data = await resp.json();
            recordCount = (data.records || []).length;
        } catch (err) {
            showStatus('❌ Could not load records: ' + err.message, 'error');
            return;
        }

        if (recordCount === 0) {
            showStatus('⚠️ Purchase #' + purchaseId + ' has no records.', 'warning');
            return;
        }

        if (type === 'format') {
            titleEl.textContent = '💿 Set Format — Purchase #' + purchaseId;
            descEl.textContent = 'Apply a single format to all ' + recordCount + ' record(s) in this purchase.';
            bodyEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Loading formats…</div>';
            modal.style.display = 'flex';

            const formats = await fetchFormats();
            if (!formats.length) {
                bodyEl.innerHTML = '<div style="color:#dc3545;">No formats available.</div>';
                return;
            }
            bodyEl.innerHTML = buildSelectHtml('format-select', formats.map(f => ({ value: f.id, label: f.name })), 'Choose a format…');
        }
        else if (type === 'status') {
            titleEl.textContent = '✅ Set Status — Purchase #' + purchaseId;
            descEl.textContent = 'Apply a single status to all ' + recordCount + ' record(s) in this purchase.';
            const options = [
                { value: 1, label: 'Draft (Inactive)' },
                { value: 2, label: 'Active' }
            ];
            bodyEl.innerHTML = buildSelectHtml('status-select', options, 'Choose a status…');
            modal.style.display = 'flex';
        }
        else if (type === 'location') {
            titleEl.textContent = '📍 Move to Location — Purchase #' + purchaseId;
            descEl.textContent = 'Move all ' + recordCount + ' record(s) in this purchase to a single location.';
            bodyEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Loading locations…</div>';
            modal.style.display = 'flex';

            const locations = await fetchLocations();
            if (!locations.length) {
                bodyEl.innerHTML = '<div style="color:#dc3545;">No locations available.</div>';
                return;
            }
            bodyEl.innerHTML =
                buildSelectHtml('location-select', locations.map(l => ({ value: l.id, label: l.display_name || l.name })), 'Choose a location…') +
                '<label style="display:flex; align-items:center; gap:8px; margin-top:12px; font-size:13px; color:#333;">' +
                '<input type="checkbox" id="clear-location-index" checked> Clear bin index for all records' +
                '</label>';
        }
    }

    function buildSelectHtml(id, options, placeholder) {
        let html = `<select id="${id}" style="width:100%; padding:10px; border:2px solid #ddd; border-radius:8px; font-size:14px; background:white; color:#333;">`;
        html += `<option value="">${placeholder}</option>`;
        options.forEach(o => {
            html += `<option value="${o.value}">${o.label}</option>`;
        });
        html += `</select>`;
        return html;
    }

    window.purchasesCloseActionModal = function() {
        const modal = document.getElementById('purchases-action-modal');
        if (modal) modal.style.display = 'none';
        bulkActionType = null;
        bulkActionPurchaseId = null;
    };

    function showModalStatus(message, type) {
        const el = document.getElementById('purchases-action-status');
        if (!el) return;
        el.style.display = 'block';
        el.textContent = message;
        const colors = { success: '#d4edda', error: '#f8d7da', warning: '#fff3cd', info: '#cce5ff' };
        const textColors = { success: '#155724', error: '#721c24', warning: '#856404', info: '#004085' };
        el.style.background = colors[type] || '#f8f9fa';
        el.style.color = textColors[type] || '#333';
    }

    // ============================================================
    // ===== APPLY BULK ACTION =====
    // ============================================================

    window.purchasesApplyBulkAction = async function() {
        if (!bulkActionType || !bulkActionPurchaseId) return;

        const confirmBtn = document.getElementById('purchases-action-confirm');
        const statusEl = document.getElementById('purchases-action-status');
        statusEl.style.display = 'none';

        let payload = {};

        if (bulkActionType === 'format') {
            const sel = document.getElementById('format-select');
            const val = sel ? sel.value : '';
            if (!val) { showModalStatus('Please choose a format.', 'warning'); return; }
            payload.format_id = parseInt(val, 10);
        }
        else if (bulkActionType === 'status') {
            const sel = document.getElementById('status-select');
            const val = sel ? sel.value : '';
            if (!val) { showModalStatus('Please choose a status.', 'warning'); return; }
            payload.status_id = parseInt(val, 10);
        }
        else if (bulkActionType === 'location') {
            const sel = document.getElementById('location-select');
            const val = sel ? sel.value : '';
            if (!val) { showModalStatus('Please choose a location.', 'warning'); return; }
            payload.location_id = parseInt(val, 10);
            const clearIdx = document.getElementById('clear-location-index');
            payload.clear_location_index = clearIdx ? clearIdx.checked : true;
        }

        // Fetch the purchase's records to get IDs
        let recordIds = [];
        try {
            const resp = await fetch(`${API_BASE}/records?batch_id=${bulkActionPurchaseId}&status_ids=1,2,3,4&limit=1000`, {
                credentials: 'include',
                mode: 'cors',
                headers: { 'Accept': 'application/json' }
            });
            const data = await resp.json();
            recordIds = (data.records || []).map(r => r.id);
        } catch (err) {
            showModalStatus('❌ Could not load records: ' + err.message, 'error');
            return;
        }

        if (recordIds.length === 0) {
            showModalStatus('⚠️ No records to update.', 'warning');
            return;
        }

        const sel = document.getElementById(bulkActionType === 'format' ? 'format-select'
                                        : bulkActionType === 'status' ? 'status-select'
                                        : 'location-select');
        const chosenLabel = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
        const actionWord = bulkActionType === 'format' ? 'format'
                         : bulkActionType === 'status' ? 'status'
                         : 'location';
        if (!confirm(`Apply "${chosenLabel}" as new ${actionWord} to ${recordIds.length} record(s) in purchase #${bulkActionPurchaseId}?`)) {
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying…';

        try {
            const response = await fetch(`${API_BASE}/api/records/bulk-update`, {
                method: 'POST',
                credentials: 'include',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    record_ids: recordIds,
                    ...payload
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                showModalStatus(`✅ Updated ${result.updated_count} record(s).`, 'success');
                showStatus(`✅ Updated ${result.updated_count} record(s)`, 'success');

                // Refresh the row's detail table if it's open
                const list = document.getElementById('purchases-list');
                const row = list ? list.querySelector(`tr[data-id="${bulkActionPurchaseId}"]`) : null;
                if (row) {
                    const details = row.nextElementSibling;
                    if (details && details.classList && details.classList.contains('purchase-details')) {
                        details.remove();
                        loadPurchaseRecords(bulkActionPurchaseId);
                    }
                }

                setTimeout(() => {
                    purchasesCloseActionModal();
                }, 900);
            } else {
                showModalStatus('❌ ' + (result.error || 'Update failed'), 'error');
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-check"></i> Apply';
            }
        } catch (err) {
            showModalStatus('❌ ' + err.message, 'error');
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Apply';
        }
    };

    // ============================================================
    // ===== DROPDOWN DATA FETCHERS =====
    // ============================================================

    async function fetchFormats() {
        if (cachedFormats) return cachedFormats;
        try {
            const resp = await fetch(`${API_BASE}/api/formats`, {
                credentials: 'include',
                mode: 'cors',
                headers: { 'Accept': 'application/json' }
            });
            const data = await resp.json();
            if (data.status === 'success' && Array.isArray(data.formats)) {
                cachedFormats = data.formats;
                return cachedFormats;
            }
        } catch (err) {
            console.error('fetchFormats error:', err);
        }
        return [];
    }

    async function fetchLocations() {
        if (cachedLocations) return cachedLocations;
        try {
            const resp = await fetch(`${API_BASE}/api/locations`, {
                credentials: 'include',
                mode: 'cors',
                headers: { 'Accept': 'application/json' }
            });
            const data = await resp.json();
            if (data.status === 'success' && Array.isArray(data.locations)) {
                cachedLocations = data.locations;
                return cachedLocations;
            }
        } catch (err) {
            console.error('fetchLocations error:', err);
        }
        return [];
    }

    // ===== DELETE PURCHASE =====
    window.purchasesDelete = async function(purchaseId) {
        closeAllRowMenus();

        const id = purchaseId || selectedPurchaseId;
        if (!id) {
            showStatus('Please select a purchase first.', 'warning');
            return;
        }

        if (!confirm('Are you sure you want to delete purchase #' + id + '? Records will be unlinked (not deleted).')) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/inventory-purchases/${id}`, {
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
                if (selectedPurchaseId == id) selectedPurchaseId = null;
                loadPurchases();
            } else {
                showStatus('❌ Error: ' + (data.error || 'Failed to delete'), 'error');
            }
        } catch (err) {
            console.error('Error deleting purchase:', err);
            showStatus('❌ Error: ' + err.message, 'error');
        }
    };

    // ===== INITIALIZE =====
    window.initPurchases = function() {
        console.log('Purchases initialized');
        selectedPurchaseId = null;
        loadPurchases();
        setTimeout(checkDependencies, 1000);
    };
})();