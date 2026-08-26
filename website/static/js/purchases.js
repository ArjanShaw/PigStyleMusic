// Purchases page - Inventory Purchase Management
(function() {
    let selectedPurchaseId = null;
    let purchases = [];
    let purchaseRecords = [];

    const API_BASE = 'http://localhost:5000';

    // Get headers with auth
    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Load purchases
    async function loadPurchases() {
        const list = document.getElementById('purchases-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch(`${API_BASE}/api/inventory-purchases`, {
                credentials: 'include',
                headers: getHeaders()
            });
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

    // Render purchases table
    function renderPurchases(purchasesList) {
        const list = document.getElementById('purchases-list');
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
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Action</th>
                </tr>
            </thead>
            <tbody>`;
        
        purchasesList.forEach(p => {
            const isSelected = (p.id === selectedPurchaseId);
            const statusColor = p.status === 'complete' ? '#28a745' : '#ffc107';
            const statusText = p.status === 'complete' ? '✅ Complete' : '📝 Draft';
            
            html += `<tr ${isSelected ? 'style="background: #e3f2fd;"' : ''} data-id="${p.id}">
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${p.id}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${p.seller_name || 'Unknown'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: ${statusColor};">${statusText}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${p.record_count || 0}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${p.amount_spent && p.amount_spent > 0 ? '$' + p.amount_spent.toFixed(2) : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${p.bill_of_sale_path ? '📄 Yes' : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="purchasesSelect(${p.id})" style="padding: 4px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-eye"></i> View
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // Update stats
    function updateStats(purchasesList) {
        const total = purchasesList.length;
        const complete = purchasesList.filter(p => p.status === 'complete').length;
        const draft = purchasesList.filter(p => p.status === 'draft').length;
        const totalRecords = purchasesList.reduce((sum, p) => sum + (p.record_count || 0), 0);
        
        document.getElementById('purchases-total-count').textContent = total;
        document.getElementById('purchases-complete-count').textContent = complete;
        document.getElementById('purchases-draft-count').textContent = draft;
        document.getElementById('purchases-total-records').textContent = totalRecords;
    }

    // Select a purchase
    window.purchasesSelect = async function(id) {
        selectedPurchaseId = id;
        
        // Highlight selected row
        document.querySelectorAll('#purchases-list tr[data-id]').forEach(row => {
            row.style.background = row.dataset.id == id ? '#e3f2fd' : '';
        });
        
        // Show action buttons
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
        
        // Load records for this purchase
        await loadPurchaseRecords(id);
    };

    // Load records for a purchase
    async function loadPurchaseRecords(purchaseId) {
        const list = document.getElementById('purchases-list');
        // Find the row and add a details section
        const row = list.querySelector(`tr[data-id="${purchaseId}"]`);
        if (!row) return;
        
        // Remove existing details row
        const existingDetails = row.nextElementSibling;
        if (existingDetails && existingDetails.classList && existingDetails.classList.contains('purchase-details')) {
            existingDetails.remove();
        }
        
        try {
            const response = await fetch(`${API_BASE}/records?batch_id=${purchaseId}&limit=500`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                purchaseRecords = data.records || [];
                renderPurchaseRecords(purchaseId, purchaseRecords);
            }
        } catch (err) {
            console.error('Error loading purchase records:', err);
        }
    }

    // Render purchase records
    function renderPurchaseRecords(purchaseId, records) {
        const list = document.getElementById('purchases-list');
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
        
        // Insert after the current row
        row.insertAdjacentHTML('afterend', html);
    }

    // Create new purchase
    window.purchasesCreate = async function() {
        const sellerName = prompt('Enter seller name:');
        if (!sellerName) return;
        const contact = prompt('Enter contact (phone/email) [optional]:') || '';
        const description = prompt('Enter description [optional]:') || '';
        
        try {
            const response = await fetch(`${API_BASE}/api/purchases`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ seller_name: sellerName, seller_contact: contact, description: description })
            });
            const data = await response.json();
            if (data.status === 'success') {
                alert('✅ Purchase created successfully!');
                loadPurchases();
                if (data.id) {
                    selectedPurchaseId = data.id;
                    setTimeout(() => purchasesSelect(data.id), 300);
                }
            } else {
                alert('❌ Error: ' + (data.error || 'Failed to create purchase'));
            }
        } catch (err) {
            alert('❌ Error: ' + err.message);
        }
    };

    // Refresh
    window.purchasesRefresh = function() {
        loadPurchases();
    };

    // Accept draft
    window.purchasesAcceptDraft = async function() {
        if (!selectedPurchaseId) {
            alert('Please select a purchase first.');
            return;
        }
        
        const amount = prompt('Enter offer amount ($):');
        if (amount === null) return;
        const offerAmount = parseFloat(amount);
        if (isNaN(offerAmount) || offerAmount <= 0) {
            alert('Please enter a valid amount.');
            return;
        }
        
        // Get records for this purchase
        try {
            const response = await fetch(`${API_BASE}/records?batch_id=${selectedPurchaseId}&limit=500`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            const records = data.records || [];
            
            if (records.length === 0) {
                alert('No records linked to this purchase.');
                return;
            }
            
            const signatureMethod = confirm('Square POS signature? Click OK for Square POS, Cancel for Print & Upload.');
            
            const result = await fetch(`${API_BASE}/api/purchases/${selectedPurchaseId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({
                    offer_amount: offerAmount,
                    signature_method: signatureMethod ? 'square' : 'upload',
                    record_ids: records.map(r => r.id)
                })
            });
            const resultData = await result.json();
            
            if (resultData.status === 'success') {
                alert('✅ Draft accepted! Offer: $' + offerAmount.toFixed(2));
                loadPurchases();
                if (selectedPurchaseId) {
                    setTimeout(() => purchasesSelect(selectedPurchaseId), 300);
                }
            } else {
                alert('❌ Error: ' + (resultData.error || 'Failed to accept draft'));
            }
        } catch (err) {
            alert('❌ Error: ' + err.message);
        }
    };

    // Delete purchase
    window.purchasesDelete = async function() {
        if (!selectedPurchaseId) {
            alert('Please select a purchase first.');
            return;
        }
        
        if (!confirm('Are you sure you want to delete purchase #' + selectedPurchaseId + ' and all its linked records? This cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/purchases/${selectedPurchaseId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.status === 'success') {
                alert('✅ Purchase deleted.');
                selectedPurchaseId = null;
                document.getElementById('purchases-delete-btn').style.display = 'none';
                document.getElementById('purchases-accept-draft-btn').style.display = 'none';
                loadPurchases();
            } else {
                alert('❌ Error: ' + (data.error || 'Failed to delete'));
            }
        } catch (err) {
            alert('❌ Error: ' + err.message);
        }
    };

    // Initialize
    window.initPurchases = function() {
        console.log('Purchases initialized');
        loadPurchases();
    };
})();
