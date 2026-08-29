// Discogs Orders page
(function() {
    let orders = [];
    let orderItems = [];
    let selectedOrderId = null;

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Load orders
    async function loadOrders() {
        const status = document.getElementById('discogs-orders-status');
        const dateFrom = document.getElementById('discogs-orders-date-from');
        const dateTo = document.getElementById('discogs-orders-date-to');
        const search = document.getElementById('discogs-orders-search');

        const select = document.getElementById('discogs-order-select');
        if (!select) return;
        
        select.innerHTML = '<option value="">Loading orders...</option>';

        try {
            let url = `${API_BASE}/api/discogs/orders?per_page=200`;
            if (status && status.value) url += `&status=${encodeURIComponent(status.value)}`;
            if (dateFrom && dateFrom.value) url += `&date_from=${encodeURIComponent(dateFrom.value)}`;
            if (dateTo && dateTo.value) url += `&date_to=${encodeURIComponent(dateTo.value)}`;
            if (search && search.value) url += `&search=${encodeURIComponent(search.value)}`;
            url += '&all=true';

            const response = await fetch(url, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();

            if (data.status === 'success') {
                orders = data.orders || [];
                renderOrders();
                showStatus(`✅ Loaded ${orders.length} orders`, 'success');
            } else {
                select.innerHTML = '<option value="">Error loading orders</option>';
                showStatus(`❌ Error: ${data.error || 'Failed to load'}`, 'error');
            }
        } catch (err) {
            console.error('Error loading orders:', err);
            select.innerHTML = '<option value="">Error loading orders</option>';
            showStatus(`❌ Error: ${err.message}`, 'error');
        }
    }

    // Render orders dropdown
    function renderOrders() {
        const select = document.getElementById('discogs-order-select');
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Select an order --</option>';
        
        orders.forEach(order => {
            const opt = document.createElement('option');
            opt.value = order.order_id || order.id;
            const buyer = order.buyer_username || order.buyer_name || 'Unknown buyer';
            const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '';
            const total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '';
            const itemCount = order.items ? order.items.length : 0;
            opt.textContent = `${order.order_id || order.id} - ${buyer} ${date} ${total} (${itemCount} items)`;
            select.appendChild(opt);
        });
    }

    // Load order items
    async function loadOrderItems(orderId) {
        const list = document.getElementById('discogs-order-items');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading items...</div>';

        try {
            const response = await fetch(`${API_BASE}/api/discogs/orders/${orderId}`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();

            if (data.status === 'success' && data.order) {
                const order = data.order;
                const items = order.items || [];
                
                // Enrich items with pigstyle data
                const enriched = [];
                for (const item of items) {
                    let pigstyleId = null;
                    let record = null;
                    
                    if (item.condition_comments || item.private_comments) {
                        const comments = (item.condition_comments || '') + ' ' + (item.private_comments || '');
                        const match = comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                        if (match) pigstyleId = parseInt(match[1]);
                    }
                    
                    if (pigstyleId) {
                        try {
                            const recRes = await fetch(`${API_BASE}/records/${pigstyleId}`, {
                                credentials: 'include',
                                headers: getHeaders()
                            });
                            if (recRes.ok) {
                                record = await recRes.json();
                            }
                        } catch(e) {}
                    }
                    
                    enriched.push({
                        ...item,
                        pigstyle_id: pigstyleId,
                        record: record,
                        record_status_id: record ? record.status_id : null,
                        artist: item.artist || 'Unknown',
                        title: item.title || 'Unknown',
                        price: item.price || 0
                    });
                }
                
                orderItems = enriched;
                renderOrderItems(orderItems);
                showStatus(`✅ ${orderItems.length} items loaded`, 'success');
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error loading order items</div>`;
            }
        } catch (err) {
            console.error('Error loading order items:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Render order items
    function renderOrderItems(items) {
        const list = document.getElementById('discogs-order-items');
        if (!list) return;
        
        if (items.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No items in this order</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">#</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Artist</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Title</th>
                    <th style="padding: 8px 10px; text-align: right; color: #333;">Price</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Condition</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">PigStyle ID</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Action</th>
                </tr>
            </thead>
            <tbody>`;
        
        items.forEach((item, idx) => {
            const statusText = item.record_status_id === 2 ? 'Active' :
                              item.record_status_id === 3 || item.record_status_id === 4 ? 'Sold' :
                              item.record_status_id === 1 ? 'New' : '—';
            const statusClass = item.record_status_id === 2 ? 'active' :
                               item.record_status_id === 3 || item.record_status_id === 4 ? 'sold' :
                               item.record_status_id === 1 ? 'new' : '';
            
            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${idx + 1}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${item.artist}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${item.title}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; color: #333;">$${item.price.toFixed(2)}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${item.media_condition || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    ${item.pigstyle_id ? 
                        `<span style="color: #28a745; font-weight: 600;">${item.pigstyle_id}</span>` : 
                        '<span style="color: #999;">—</span>'
                    }
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    ${item.pigstyle_id && item.record_status_id !== 3 && item.record_status_id !== 4 ? 
                        `<button onclick="discogsMarkSold(${item.pigstyle_id})" style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            <i class="fas fa-check"></i> Mark Sold
                        </button>` :
                        ''
                    }
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // Mark record as sold on Discogs
    window.discogsMarkSold = async function(recordId) {
        if (!confirm(`Mark record #${recordId} as sold on Discogs?`)) return;

        try {
            const response = await fetch(`${API_BASE}/api/records/${recordId}/mark-discogs-sold`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();

            if (data.status === 'success') {
                showStatus(`✅ Record #${recordId} marked as sold on Discogs`, 'success');
                if (selectedOrderId) {
                    loadOrderItems(selectedOrderId);
                }
            } else {
                showStatus(`❌ Error: ${data.error || 'Failed to mark as sold'}`, 'error');
            }
        } catch (err) {
            console.error('Error marking sold:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
        }
    };

    // Show status
    function showStatus(message, type) {
        const statusDiv = document.getElementById('discogs-orders-status-msg');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.className = `status-message status-${type}`;
        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

    // Expose functions
    window.discogsOrdersApplyFilters = function() {
        loadOrders();
    };

    window.discogsOrdersRefresh = function() {
        loadOrders();
    };

    // Init
    window.initDiscogsOrders = function() {
        console.log('Discogs Orders initialized');
        
        // Set default date range
        const dateFrom = document.getElementById('discogs-orders-date-from');
        const dateTo = document.getElementById('discogs-orders-date-to');
        
        if (dateFrom && !dateFrom.value) {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            dateFrom.value = d.toISOString().split('T')[0];
        }
        if (dateTo && !dateTo.value) {
            dateTo.value = new Date().toISOString().split('T')[0];
        }

        const orderSelect = document.getElementById('discogs-order-select');
        if (orderSelect) {
            orderSelect.addEventListener('change', function() {
                const orderId = this.value;
                selectedOrderId = orderId;
                if (orderId) {
                    loadOrderItems(orderId);
                } else {
                    const list = document.getElementById('discogs-order-items');
                    if (list) {
                        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Select an order to view items</div>';
                    }
                    orderItems = [];
                }
            });
        }
        
        loadOrders();
    };
})();
