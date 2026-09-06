// Discogs Orders page
(function() {
    let orders = [];
    let orderItems = [];
    let selectedOrderId = null;
    let viewingAllOrders = true;

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

        const tableDiv = document.getElementById('discogs-orders-table');
        if (!tableDiv) return;
        
        tableDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading orders...</div>';

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
                // Sort orders by date (latest first)
                orders.sort((a, b) => {
                    const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
                    const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
                    return dateB - dateA;
                });
                viewingAllOrders = true;
                renderOrdersTable();
                showStatus(`✅ Loaded ${orders.length} orders (latest first)`, 'success');
            } else {
                tableDiv.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load orders'}</div>`;
                showStatus(`❌ Error: ${data.error || 'Failed to load'}`, 'error');
            }
        } catch (err) {
            console.error('Error loading orders:', err);
            tableDiv.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
            showStatus(`❌ Error: ${err.message}`, 'error');
        }
    }

    // Render orders table
    function renderOrdersTable() {
        const tableDiv = document.getElementById('discogs-orders-table');
        const container = document.getElementById('discogs-orders-container');
        if (!tableDiv || !container) return;
        
        // Determine which orders to show
        let displayOrders = orders;
        if (!viewingAllOrders && selectedOrderId) {
            displayOrders = orders.filter(o => (o.order_id || o.id) === selectedOrderId);
        }
        
        // Adjust container height based on view mode
        if (!viewingAllOrders && selectedOrderId) {
            container.style.flex = '0.5';
            container.style.maxHeight = '200px';
        } else {
            container.style.flex = '2';
            container.style.maxHeight = 'none';
        }
        
        if (displayOrders.length === 0) {
            if (!viewingAllOrders) {
                tableDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Order not found</div>';
            } else {
                tableDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No orders found</div>';
            }
            return;
        }

        let html = `<div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 10px; background: #f8f9fa; border-bottom: 2px solid #ddd; position: sticky; top: 0; z-index: 5;">
            <span style="font-weight: 600; color: #333;">
                ${viewingAllOrders ? `📋 All Orders (${displayOrders.length})` : `📋 Order #${selectedOrderId}`}
            </span>
            ${!viewingAllOrders ? 
                `<button onclick="discogsShowAllOrders()" style="padding: 4px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    <i class="fas fa-arrow-left"></i> Back to All Orders
                </button>` : ''
            }
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 5px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Order ID</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Buyer</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Date</th>
                    <th style="padding: 8px 10px; text-align: right; color: #333;">Total</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Items</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Action</th>
                </tr>
            </thead>
            <tbody>`;
        
        displayOrders.forEach((order, index) => {
            const statusColor = order.status === 'Payment Received' ? '#28a745' :
                              order.status === 'Shipped' ? '#007bff' :
                              order.status === 'Delivered' ? '#17a2b8' :
                              order.status === 'Cancelled' ? '#dc3545' :
                              order.status === 'Refunded' ? '#ffc107' : '#6c757d';
            
            const rowBg = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
            const isSelected = selectedOrderId === (order.order_id || order.id) && !viewingAllOrders;
            
            // Show relative time for recent orders
            let dateDisplay = '—';
            if (order.created_at) {
                const date = new Date(order.created_at);
                const now = new Date();
                const diffMs = now - date;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);
                
                if (diffMins < 1) {
                    dateDisplay = 'Just now';
                } else if (diffMins < 60) {
                    dateDisplay = `${diffMins}m ago`;
                } else if (diffHours < 24) {
                    dateDisplay = `${diffHours}h ago`;
                } else if (diffDays < 7) {
                    dateDisplay = `${diffDays}d ago`;
                } else {
                    dateDisplay = date.toLocaleDateString();
                }
            }
            
            html += `<tr style="background: ${rowBg}; ${isSelected ? 'border-left: 3px solid #007bff;' : ''}">
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: ${isSelected ? '600' : 'normal'};">
                    ${order.order_id || order.id}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">
                    ${order.buyer_username || order.buyer_name || 'Unknown'}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">
                    ${dateDisplay}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-weight: 500;">
                    ${order.total_amount ? '$' + order.total_amount.toFixed(2) : '—'}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #555;">
                    ${order.items ? order.items.length : 0}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; background: ${statusColor}20; color: ${statusColor}; font-size: 11px; font-weight: 500;">
                        ${order.status || 'Unknown'}
                    </span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    ${viewingAllOrders ? 
                        `<button onclick="discogsSelectOrder('${order.order_id || order.id}')" style="padding: 4px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            <i class="fas fa-eye"></i> View Items
                        </button>` :
                        `<span style="color: #28a745; font-weight: 500; font-size: 11px;">✓ Viewing</span>`
                    }
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        tableDiv.innerHTML = html;
        
        // If viewing a single order, scroll to show the items
        if (!viewingAllOrders && selectedOrderId) {
            setTimeout(() => {
                const itemsSection = document.getElementById('discogs-order-items-section');
                if (itemsSection) {
                    itemsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        }
    }

    // Select order and load items
    window.discogsSelectOrder = function(orderId) {
        selectedOrderId = orderId;
        viewingAllOrders = false;
        
        // Find the selected order to get details
        const order = orders.find(o => (o.order_id || o.id) === orderId);
        if (order) {
            // Update order summary
            const summaryEl = document.getElementById('discogs-order-summary');
            if (summaryEl) {
                const buyer = order.buyer_username || order.buyer_name || 'Unknown';
                const total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '—';
                const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '—';
                summaryEl.textContent = `${buyer} | ${order.items ? order.items.length : 0} items | Total: ${total} | ${date}`;
            }
            
            // Show order items section
            const itemsSection = document.getElementById('discogs-order-items-section');
            if (itemsSection) {
                itemsSection.style.display = 'block';
            }
            
            loadOrderItems(orderId);
        }
        
        renderOrdersTable(); // Update table to show only selected order
    };

    // Show all orders
    window.discogsShowAllOrders = function() {
        viewingAllOrders = true;
        selectedOrderId = null;
        
        // Hide order items section
        const itemsSection = document.getElementById('discogs-order-items-section');
        if (itemsSection) {
            itemsSection.style.display = 'none';
        }
        
        // Clear order items
        const itemsDiv = document.getElementById('discogs-order-items');
        if (itemsDiv) {
            itemsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Select an order to view items</div>';
        }
        
        renderOrdersTable();
        showStatus('📋 Showing all orders', 'success');
    };

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
                
                // Update order summary
                const summaryEl = document.getElementById('discogs-order-summary');
                if (summaryEl) {
                    const buyer = order.buyer_username || order.buyer_name || 'Unknown';
                    const total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '—';
                    const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '—';
                    summaryEl.textContent = `${buyer} | ${orderItems.length} items | Total: ${total} | ${date}`;
                }
                
                showStatus(`✅ ${orderItems.length} items loaded for order #${orderId}`, 'success');
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
            const statusColor = item.record_status_id === 2 ? '#28a745' :
                               item.record_status_id === 3 || item.record_status_id === 4 ? '#dc3545' :
                               item.record_status_id === 1 ? '#17a2b8' : '#6c757d';
            
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
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; background: ${statusColor}20; color: ${statusColor}; font-size: 11px; font-weight: 500;">
                        ${statusText}
                    </span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    ${item.pigstyle_id && item.record_status_id !== 3 && item.record_status_id !== 4 ? 
                        `<button onclick="discogsMarkSold(${item.pigstyle_id})" style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            <i class="fas fa-check"></i> Mark Sold
                        </button>` :
                        item.pigstyle_id && (item.record_status_id === 3 || item.record_status_id === 4) ?
                        `<span style="color: #28a745; font-weight: 500; font-size: 11px;">✓ Sold</span>` :
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

    // Refresh order items
    window.discogsRefreshOrderItems = function() {
        if (selectedOrderId) {
            loadOrderItems(selectedOrderId);
        } else {
            showStatus('⚠️ No order selected', 'error');
        }
    };

    // Export order
    window.discogsExportOrder = function() {
        if (!selectedOrderId || orderItems.length === 0) {
            showStatus('⚠️ No order selected or no items to export', 'error');
            return;
        }
        
        const order = orders.find(o => (o.order_id || o.id) === selectedOrderId);
        const buyer = order ? order.buyer_username || order.buyer_name || 'Unknown' : 'Unknown';
        
        let csv = `Order ID,${selectedOrderId}\n`;
        csv += `Buyer,${buyer}\n`;
        csv += `Date,${order && order.created_at ? new Date(order.created_at).toLocaleString() : '—'}\n`;
        csv += `Status,${order ? order.status : '—'}\n`;
        csv += `Total,${order && order.total_amount ? '$' + order.total_amount.toFixed(2) : '—'}\n\n`;
        csv += `#,Artist,Title,Price,Condition,PigStyle ID,Status\n`;
        
        orderItems.forEach((item, idx) => {
            const statusText = item.record_status_id === 2 ? 'Active' :
                              item.record_status_id === 3 || item.record_status_id === 4 ? 'Sold' :
                              item.record_status_id === 1 ? 'New' : '—';
            csv += `${idx + 1},"${item.artist}","${item.title}",$${item.price.toFixed(2)},${item.media_condition || '—'},${item.pigstyle_id || '—'},${statusText}\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `order_${selectedOrderId}_${buyer.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        
        showStatus(`📥 Order exported successfully`, 'success');
    };

    // Show status
    function showStatus(message, type) {
        const statusDiv = document.getElementById('discogs-orders-status-msg');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.className = `status-message status-${type}`;
        // Clear any existing timeout
        if (window.statusTimeout) {
            clearTimeout(window.statusTimeout);
        }
        window.statusTimeout = setTimeout(() => { 
            statusDiv.style.display = 'none'; 
        }, 5000);
    }

    // Expose functions
    window.discogsOrdersApplyFilters = function() {
        viewingAllOrders = true;
        selectedOrderId = null;
        // Hide order items section
        const itemsSection = document.getElementById('discogs-order-items-section');
        if (itemsSection) {
            itemsSection.style.display = 'none';
        }
        loadOrders();
    };

    window.discogsOrdersRefresh = function() {
        if (viewingAllOrders) {
            loadOrders();
        } else if (selectedOrderId) {
            loadOrderItems(selectedOrderId);
            renderOrdersTable();
        } else {
            loadOrders();
        }
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

        loadOrders();
    };
})();