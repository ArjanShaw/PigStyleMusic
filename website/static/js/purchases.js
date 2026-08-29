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

    // Check periodically until dependencies are loaded
    var checkInterval = setInterval(function() {
        if (checkDependencies()) {
            clearInterval(checkInterval);
            console.log('✅ Label printing dependencies loaded');
        }
    }, 500);

    // Also check when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(checkDependencies, 500);
    });

    // ===== PRINT LABELS =====
    window.printPurchaseLabels = async function(purchaseId) {
        const statusDiv = document.getElementById('purchases-status');
        
        // Check if dependencies are loaded
        if (!dependenciesLoaded) {
            showStatus('⏳ Loading label printer dependencies...', 'info');
            
            // Wait for dependencies to load
            await new Promise(function(resolve) {
                var waitInterval = setInterval(function() {
                    if (dependenciesLoaded) {
                        clearInterval(waitInterval);
                        resolve();
                    }
                }, 200);
                // Timeout after 10 seconds
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

        // Disable all print buttons for this purchase
        var buttons = document.querySelectorAll('.btn-print[data-purchase-id="' + purchaseId + '"]');
        buttons.forEach(function(btn) { btn.disabled = true; });

        showStatus('📄 Fetching records for purchase #' + purchaseId + '...', 'info');

        try {
            // Fetch records for this purchase
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

            // Use LabelPrinter if available
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

    // ===== SHOW STATUS =====
    function showStatus(message, type = 'info') {
        let statusDiv = document.getElementById('purchases-status');
        
        if (!statusDiv) {
            // Create status div if it doesn't exist
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
        
        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Seller</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Records</th>
                    <th style="padding: 8px 10px; text-align: right; color: #333;">Amount</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Date</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Bill</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        purchasesList.forEach(p => {
            const isSelected = (p.id === selectedPurchaseId);
            const statusColor = p.status === 'complete' ? '#28a745' : '#ffc107';
            const statusText = p.status === 'complete' ? '✅ Complete' : '📝 Draft';
            const recordCount = p.record_count || 0;
            
            html += `<tr ${isSelected ? 'style="background: #e3f2fd;"' : ''} data-id="${p.id}">
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${p.id}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${p.seller_name || 'Unknown'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: ${statusColor};">${statusText}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${recordCount}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${p.amount_spent && p.amount_spent > 0 ? '$' + p.amount_spent.toFixed(2) : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${p.bill_of_sale_path ? '📄 Yes' : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: center;">
                        <button onclick="purchasesSelect(${p.id})" style="padding: 4px 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            <i class="fas fa-eye"></i>
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
    }

    // ===== UPDATE STATS =====
    function updateStats(purchasesList) {
        const total = purchasesList.length;
        const complete = purchasesList.filter(p => p.status === 'complete').length;
        const draft = purchasesList.filter(p => p.status === 'draft').length;
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
        
        const purchase = purchases.find(p => p.id === id);
        if (purchase) {
            const deleteBtn = document.getElementById('purchases-delete-btn');
            const acceptBtn = document.getElementById('purchases-accept-draft-btn');
            
            if (deleteBtn) {
                deleteBtn.style.display = purchase.status === 'complete' ? 'none' : 'inline-block';
            }
            if (acceptBtn) {
                acceptBtn.style.display = (purchase.status === 'draft' && purchase.record_count > 0) ? 'inline-block' : 'none';
            }
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
            <td colspan="8" style="padding: 10px;">
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
                        <th style="padding: 4px 8px; text-align: right; color: #333;">Price</th>
                        <th style="padding: 4px 8px; text-align: center; color: #333;">Status</th>
                    </tr>
                </thead>
                <tbody>`;
            
            records.forEach(r => {
                const statusMap = { 1: 'New', 2: 'Active', 3: 'Sold', 4: 'Discogs' };
                const status = statusMap[r.status_id] || 'Unknown';
                html += `<tr>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${r.id}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${r.artist || 'Unknown'}</td>
                    <td style="padding: 4px 8px; border-bottom: 1px solid #eee; color: #333;">${r.title || 'Unknown'}</td>
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
        
        try {
            const response = await fetch(`${API_BASE}/api/purchases`, {
                method: 'POST',
                credentials: 'include',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seller_name: sellerName, seller_contact: contact, description: description })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            if (data.status === 'success') {
                showStatus('✅ Purchase created successfully!', 'success');
                loadPurchases();
                if (data.id) {
                    selectedPurchaseId = data.id;
                    setTimeout(() => purchasesSelect(data.id), 300);
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

    // ===== ACCEPT DRAFT =====
    window.purchasesAcceptDraft = async function() {
        if (!selectedPurchaseId) {
            showStatus('Please select a purchase first.', 'warning');
            return;
        }
        
        const amount = prompt('Enter offer amount ($):');
        if (amount === null) return;
        const offerAmount = parseFloat(amount);
        if (isNaN(offerAmount) || offerAmount <= 0) {
            showStatus('Please enter a valid amount.', 'warning');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/records?batch_id=${selectedPurchaseId}&limit=500`, {
                credentials: 'include',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            const records = data.records || [];
            
            if (records.length === 0) {
                showStatus('No records linked to this purchase.', 'warning');
                return;
            }
            
            const signatureMethod = confirm('Square POS signature? Click OK for Square POS, Cancel for Print & Upload.');
            
            const result = await fetch(`${API_BASE}/api/purchases/${selectedPurchaseId}`, {
                method: 'PUT',
                credentials: 'include',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    offer_amount: offerAmount,
                    signature_method: signatureMethod ? 'square' : 'upload',
                    record_ids: records.map(r => r.id)
                })
            });
            
            if (!result.ok) {
                throw new Error(`HTTP ${result.status}`);
            }
            
            const resultData = await result.json();
            
            if (resultData.status === 'success') {
                showStatus('✅ Draft accepted! Offer: $' + offerAmount.toFixed(2), 'success');
                loadPurchases();
                if (selectedPurchaseId) {
                    setTimeout(() => purchasesSelect(selectedPurchaseId), 300);
                }
            } else {
                showStatus('❌ Error: ' + (resultData.error || 'Failed to accept draft'), 'error');
            }
        } catch (err) {
            console.error('Error accepting draft:', err);
            showStatus('❌ Error: ' + err.message, 'error');
        }
    };

    // ===== DELETE PURCHASE =====
    window.purchasesDelete = async function() {
        if (!selectedPurchaseId) {
            showStatus('Please select a purchase first.', 'warning');
            return;
        }
        
        if (!confirm('Are you sure you want to delete purchase #' + selectedPurchaseId + ' and all its linked records? This cannot be undone.')) {
            return;
        }
        
        const deleteBtn = document.getElementById('purchases-delete-btn');
        if (deleteBtn) {
            deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            deleteBtn.disabled = true;
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/purchases/${selectedPurchaseId}`, {
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
                const acceptBtn = document.getElementById('purchases-accept-draft-btn');
                if (deleteBtn2) deleteBtn2.style.display = 'none';
                if (acceptBtn) acceptBtn.style.display = 'none';
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
        // Check dependencies after a delay
        setTimeout(checkDependencies, 1000);
    };
})();