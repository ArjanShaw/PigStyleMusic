// Discogs Orders page
(function() {
    let orders = [];
    let orderItems = [];
    let selectedOrderId = null;
    let viewingAllOrders = true;
    let selectedLabelPosition = 'LT';
    let labelPdfFile = null;

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // =====================================================================
    // BULK MARK PAID ORDERS SOLD  (defined first so it's always available)
    // =====================================================================
    window.discogsBulkMarkPaidOrdersSold = async function() {
        console.log('🎯 discogsBulkMarkPaidOrdersSold called');
        if (!confirm(
            'Mark every record in "Payment Received" Discogs orders as sold?\n\n' +
            'This will set each record to Sold on Discogs and update its store_price ' +
            'to the Discogs sale price.'
        )) return;

        const tableDiv = document.getElementById('discogs-orders-table');
        const statusDiv = document.getElementById('discogs-orders-status-msg');
        const originalHtml = tableDiv ? tableDiv.innerHTML : '';

        const startTime = Date.now();
        let dots = 0;

        // Inject spinner keyframes once
        if (!document.getElementById('discogsSpinStyle')) {
            const style = document.createElement('style');
            style.id = 'discogsSpinStyle';
            style.textContent = '@keyframes discogsSpin { to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }

        if (tableDiv) {
            tableDiv.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 20px;gap:14px;">
                    <div style="width:56px;height:56px;border:5px solid #e9ecef;border-top-color:#28a745;border-radius:50%;animation:discogsSpin 0.9s linear infinite;"></div>
                    <div style="font-size:16px;font-weight:600;color:#333;">Scanning Payment Received orders…</div>
                    <div style="font-size:13px;color:#666;">Fetching orders from Discogs and matching PIGSTYLE IDs</div>
                    <div id="bulk-elapsed" style="font-size:12px;color:#999;">Elapsed: 0s</div>
                    <div style="font-size:11px;color:#aaa;max-width:420px;text-align:center;line-height:1.5;">
                        Please don't close this tab.
                    </div>
                </div>
            `;
        }

        const progressInterval = setInterval(() => {
            const el = document.getElementById('bulk-elapsed');
            if (el) {
                const secs = Math.floor((Date.now() - startTime) / 1000);
                dots = (dots + 1) % 4;
                el.textContent = `Elapsed: ${secs}s ${'.'.repeat(dots)}`;
            }
        }, 1000);

        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.className = 'status-message status-info';
            statusDiv.textContent = '⏳ Working… please wait';
        }

        try {
            const response = await fetch(`${API_BASE}/api/discogs/bulk-mark-paid-orders-sold`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });

            const data = await response.json();
            clearInterval(progressInterval);

            if (data.status === 'success') {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const details = data.details || [];
                const interesting = details.filter(d =>
                    d.result === 'marked_sold' || d.result === 'not_found'
                );

                let html = `
                    <div style="padding:24px;max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:14px;">
                        <div style="font-size:22px;font-weight:700;color:#28a745;text-align:center;">
                            ✅ Bulk Action Complete
                        </div>
                        <div style="font-size:13px;color:#888;text-align:center;">
                            Finished in ${elapsed}s · Scanned ${data.orders_scanned || 0} order(s)
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:6px;">
                            <div style="background:#e7f5ea;padding:12px 16px;border-radius:8px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#28a745;font-weight:700;">Marked Sold</div>
                                <div style="font-size:24px;font-weight:700;color:#28a745;">${data.marked}</div>
                            </div>
                            <div style="background:#fff4e5;padding:12px 16px;border-radius:8px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#e67e22;font-weight:700;">Already Sold</div>
                                <div style="font-size:24px;font-weight:700;color:#e67e22;">${data.skipped}</div>
                            </div>
                            <div style="background:#fdecea;padding:12px 16px;border-radius:8px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#c0392b;font-weight:700;">Not In DB</div>
                                <div style="font-size:24px;font-weight:700;color:#c0392b;">${data.not_found}</div>
                            </div>
                            <div style="background:#eef1f5;padding:12px 16px;border-radius:8px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#5a6673;font-weight:700;">No PIGSTYLE ID</div>
                                <div style="font-size:24px;font-weight:700;color:#5a6673;">${data.no_pigstyle}</div>
                            </div>
                        </div>
                `;

                if (interesting.length > 0) {
                    html += `
                        <details style="margin-top:8px;">
                            <summary style="cursor:pointer;font-size:13px;color:#555;font-weight:600;padding:8px 0;">
                                Show details (${interesting.length})
                            </summary>
                            <div style="max-height:300px;overflow-y:auto;border:1px solid #eee;border-radius:6px;margin-top:6px;">
                                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                                    <thead>
                                        <tr style="background:#f8f9fa;position:sticky;top:0;">
                                            <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;">PigStyle ID</th>
                                            <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;">Order</th>
                                            <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;">Result</th>
                                            <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;">Info</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${interesting.map(d => {
                                            const color = d.result === 'marked_sold' ? '#28a745' : '#c0392b';
                                            const label = d.result === 'marked_sold' ? '✅ Sold' : '❌ Not found';
                                            const info = d.result === 'marked_sold'
                                                ? `${d.artist || ''} - ${d.title || ''} ($${(d.sale_price || 0).toFixed(2)})`
                                                : 'PIGSTYLE ID missing from records table';
                                            return `<tr>
                                                <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;font-family:monospace;">${d.pigstyle_id}</td>
                                                <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#666;">${d.order_id || '—'}</td>
                                                <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:${color};font-weight:600;">${label}</td>
                                                <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#555;">${info}</td>
                                            </tr>`;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    `;
                }

                html += `
                        <div style="display:flex;gap:10px;justify-content:center;margin-top:10px;">
                            <button onclick="discogsOrdersApplyFilters()" 
                                    style="padding:10px 24px;background:#007bff;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                                🔄 Reload Orders
                            </button>
                        </div>
                    </div>
                `;

                if (tableDiv) tableDiv.innerHTML = html;

                if (statusDiv) {
                    statusDiv.style.display = 'block';
                    statusDiv.className = 'status-message status-success';
                    statusDiv.textContent = `✅ Marked ${data.marked} sold · ${data.skipped} already sold · ${data.not_found} not in DB · ${data.no_pigstyle} without PIGSTYLE ID`;
                }
            } else {
                if (tableDiv) tableDiv.innerHTML = originalHtml;
                const msg = data.error || data.message || 'Bulk action failed';
                if (statusDiv) {
                    statusDiv.style.display = 'block';
                    statusDiv.className = 'status-message status-error';
                    statusDiv.textContent = `❌ ${msg}`;
                }
            }
        } catch (err) {
            clearInterval(progressInterval);
            if (tableDiv) tableDiv.innerHTML = originalHtml;
            const statusDiv2 = document.getElementById('discogs-orders-status-msg');
            if (statusDiv2) {
                statusDiv2.style.display = 'block';
                statusDiv2.className = 'status-message status-error';
                statusDiv2.textContent = `❌ Error: ${err.message}`;
            }
            console.error('Bulk mark sold error:', err);
        }
    };

    // =====================================================================
    // LOAD ORDERS
    // =====================================================================
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

            console.log('🔍 Fetching orders from:', url);

            const response = await fetch(url, {
                credentials: 'include',
                headers: getHeaders()
            });
            
            const data = await response.json();

            if (data.status === 'success') {
                orders = data.orders || [];
                orders.sort((a, b) => {
                    const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
                    const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
                    return dateB - dateA;
                });
                viewingAllOrders = true;
                renderOrdersTable();
                showStatus(`✅ Loaded ${orders.length} orders (latest first)`, 'success');
            } else {
                const errorMsg = data.error || data.message || 'Failed to load orders';
                console.error('❌ API Error:', errorMsg);
                tableDiv.innerHTML = `
                    <div style="text-align: center; padding: 30px 20px; color: #dc3545;">
                        <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
                        <div style="font-weight: 600; margin-bottom: 8px;">Error Loading Orders</div>
                        <div style="color: #666; font-size: 14px;">${errorMsg}</div>
                        <div style="margin-top: 15px; font-size: 12px; color: #999;">
                            Check that DISCOGS_USER_TOKEN is properly configured in the server environment.
                        </div>
                        <button onclick="discogsOrdersApplyFilters()" style="margin-top: 15px; padding: 8px 24px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            <i class="fas fa-sync"></i> Retry
                        </button>
                    </div>
                `;
                showStatus(`❌ ${errorMsg}`, 'error');
            }
        } catch (err) {
            console.error('❌ Fetch error:', err);
            tableDiv.innerHTML = `
                <div style="text-align: center; padding: 30px 20px; color: #dc3545;">
                    <div style="font-size: 48px; margin-bottom: 10px;">🔌</div>
                    <div style="font-weight: 600; margin-bottom: 8px;">Connection Error</div>
                    <div style="color: #666; font-size: 14px;">${err.message}</div>
                    <div style="margin-top: 15px; font-size: 12px; color: #999;">
                        Could not connect to the server. Please check your internet connection.
                    </div>
                    <button onclick="discogsOrdersApplyFilters()" style="margin-top: 15px; padding: 8px 24px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-sync"></i> Retry
                    </button>
                </div>
            `;
            showStatus(`❌ Error: ${err.message}`, 'error');
        }
    }

    // =====================================================================
    // RENDER ORDERS TABLE
    // =====================================================================
    function renderOrdersTable() {
        const tableDiv = document.getElementById('discogs-orders-table');
        const container = document.getElementById('discogs-orders-container');
        if (!tableDiv || !container) return;
        
        let displayOrders = orders;
        if (!viewingAllOrders && selectedOrderId) {
            displayOrders = orders.filter(o => (o.order_id || o.id) === selectedOrderId);
        }
        
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
        
        if (!viewingAllOrders && selectedOrderId) {
            setTimeout(() => {
                const itemsSection = document.getElementById('discogs-order-items-section');
                if (itemsSection) {
                    itemsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        }
    }

    // =====================================================================
    // SELECT / SHOW ORDERS
    // =====================================================================
    window.discogsSelectOrder = function(orderId) {
        selectedOrderId = orderId;
        viewingAllOrders = false;
        
        const order = orders.find(o => (o.order_id || o.id) === orderId);
        if (order) {
            const summaryEl = document.getElementById('discogs-order-summary');
            if (summaryEl) {
                const buyer = order.buyer_username || order.buyer_name || 'Unknown';
                const total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '—';
                const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '—';
                summaryEl.textContent = `${buyer} | ${order.items ? order.items.length : 0} items | Total: ${total} | ${date}`;
            }
            
            const itemsSection = document.getElementById('discogs-order-items-section');
            if (itemsSection) {
                itemsSection.style.display = 'block';
            }
            
            loadOrderItems(orderId);
        }
        
        renderOrdersTable();
    };

    window.discogsShowAllOrders = function() {
        viewingAllOrders = true;
        selectedOrderId = null;
        
        const itemsSection = document.getElementById('discogs-order-items-section');
        if (itemsSection) {
            itemsSection.style.display = 'none';
        }
        
        const itemsDiv = document.getElementById('discogs-order-items');
        if (itemsDiv) {
            itemsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Select an order to view items</div>';
        }
        
        renderOrdersTable();
        showStatus('📋 Showing all orders', 'success');
    };

    // =====================================================================
    // LOAD ORDER ITEMS
    // (no per-record fetch — backend already returns record_status_id)
    // =====================================================================
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
                
                const enriched = items.map(item => {
                    let pigstyleId = null;
                    if (item.condition_comments || item.private_comments) {
                        const comments = (item.condition_comments || '') + ' ' + (item.private_comments || '');
                        const match = comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                        if (match) pigstyleId = parseInt(match[1]);
                    }
                    return {
                        ...item,
                        pigstyle_id: pigstyleId,
                        record_status_id: item.record_status_id ?? null,
                        artist: item.artist || 'Unknown',
                        title: item.title || 'Unknown',
                        price: item.price || 0
                    };
                });
                
                orderItems = enriched;
                renderOrderItems(orderItems);
                
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
                showStatus(`❌ Error loading order items`, 'error');
            }
        } catch (err) {
            console.error('Error loading order items:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
            showStatus(`❌ Error: ${err.message}`, 'error');
        }
    }

    // =====================================================================
    // RENDER ORDER ITEMS
    // =====================================================================
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
            
            const isSold = item.record_status_id === 3 || item.record_status_id === 4;
            
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
                    ${item.pigstyle_id && !isSold ? 
                        `<button onclick="discogsMarkSold(${item.pigstyle_id}, ${idx})" style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            <i class="fas fa-check"></i> Mark Sold
                        </button>` :
                        isSold ?
                        `<span style="color: #28a745; font-weight: 500; font-size: 11px;">✓ Sold</span>` :
                        ''
                    }
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // =====================================================================
    // MARK SINGLE RECORD SOLD
    // =====================================================================
    window.discogsMarkSold = async function(recordId, itemIndex) {
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
                if (orderItems[itemIndex]) {
                    orderItems[itemIndex].record_status_id = 4;
                    renderOrderItems(orderItems);
                    renderOrdersTable();
                }
            } else {
                showStatus(`❌ Error: ${data.error || 'Failed to mark as sold'}`, 'error');
            }
        } catch (err) {
            console.error('Error marking sold:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
        }
    };

    // =====================================================================
    // SHIPPING LABEL FUNCTIONS
    // =====================================================================
    window.discogsPrintShippingLabel = function() {
        if (!selectedOrderId) {
            showStatus('⚠️ Please select an order first', 'error');
            return;
        }
        
        const order = orders.find(o => (o.order_id || o.id) === selectedOrderId);
        if (!order) {
            showStatus('⚠️ Order not found', 'error');
            return;
        }
        
        document.getElementById('discogs-label-order-id').textContent = selectedOrderId;
        document.getElementById('discogs-label-buyer').textContent = order.buyer_username || order.buyer_name || 'Unknown';
        document.getElementById('discogs-label-items').textContent = orderItems.length + ' items';
        
        selectedLabelPosition = 'LT';
        document.querySelectorAll('[id^="discogs-pos-"]').forEach(btn => {
            btn.style.border = '2px solid #ddd';
            btn.style.background = 'white';
        });
        document.getElementById('discogs-pos-LT').style.border = '2px solid #007bff';
        document.getElementById('discogs-pos-LT').style.background = '#e7f3ff';
        
        document.getElementById('discogs-label-pdf').value = '';
        labelPdfFile = null;
        
        document.getElementById('discogs-shipping-modal').style.display = 'flex';
    };
    
    window.discogsCloseShippingModal = function() {
        document.getElementById('discogs-shipping-modal').style.display = 'none';
    };
    
    window.discogsSelectLabelPosition = function(position) {
        selectedLabelPosition = position;
        document.querySelectorAll('[id^="discogs-pos-"]').forEach(btn => {
            btn.style.border = '2px solid #ddd';
            btn.style.background = 'white';
        });
        document.getElementById(`discogs-pos-${position}`).style.border = '2px solid #007bff';
        document.getElementById(`discogs-pos-${position}`).style.background = '#e7f3ff';
    };
    
    window.discogsPrintLabel = async function() {
        const fileInput = document.getElementById('discogs-label-pdf');
        if (!fileInput.files || fileInput.files.length === 0) {
            showStatus('⚠️ Please upload a PDF label file', 'error');
            return;
        }
        
        try {
            showStatus('📄 Preparing label for printing...', 'success');
            
            const file = fileInput.files[0];
            const fileUrl = URL.createObjectURL(file);
            
            const order = orders.find(o => (o.order_id || o.id) === selectedOrderId);
            const buyer = order ? order.buyer_username || order.buyer_name || 'Unknown' : 'Unknown';
            
            const positionStyles = {
                'LT': { top: '0', left: '0' },
                'RT': { top: '0', right: '0' },
                'LB': { bottom: '0', left: '0' },
                'RB': { bottom: '0', right: '0' }
            };
            
            const pos = positionStyles[selectedLabelPosition];
            
            const printWindow = window.open('', '_blank', 'width=800,height=600');
            
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Shipping Label - Order #${selectedOrderId}</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { background: white; margin: 0; padding: 0; width: 100%; height: 100%; }
                        .page-container { width: 8.5in; height: 11in; margin: 0 auto; position: relative; background: white; }
                        .label-container {
                            position: absolute; width: 4.25in; height: 5.5in;
                            ${pos.top !== undefined ? `top: ${pos.top};` : ''}
                            ${pos.bottom !== undefined ? `bottom: ${pos.bottom};` : ''}
                            ${pos.left !== undefined ? `left: ${pos.left};` : ''}
                            ${pos.right !== undefined ? `right: ${pos.right};` : ''}
                            border: 1px dashed #ccc;
                            display: flex; align-items: center; justify-content: center;
                            background: white; padding: 10px; overflow: hidden;
                        }
                        .label-container iframe { width: 100%; height: 100%; border: none; background: white; }
                        .label-info {
                            position: absolute; bottom: 10px; left: 10px;
                            font-size: 10px; color: #999; font-family: Arial, sans-serif;
                            background: rgba(255,255,255,0.9); padding: 2px 8px; border-radius: 4px;
                        }
                        .label-position {
                            position: absolute; top: 10px; right: 10px;
                            font-size: 10px; color: #999; font-family: Arial, sans-serif;
                            background: rgba(255,255,255,0.9); padding: 2px 8px; border-radius: 4px;
                        }
                        @media print {
                            body { margin: 0; padding: 0; }
                            .page-container { margin: 0; }
                            .label-container { border: none; }
                            .label-info, .label-position { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="page-container">
                        <div class="label-container">
                            <iframe src="${fileUrl}"></iframe>
                        </div>
                        <div class="label-info">Order #${selectedOrderId} | ${buyer}</div>
                        <div class="label-position">Position: ${selectedLabelPosition}</div>
                    </div>
                    <script>
                        window.onload = function() {
                            setTimeout(function() { window.print(); }, 1000);
                        };
                    <\/script>
                </body>
                </html>
            `);
            
            printWindow.document.close();
            
            showStatus(`✅ Label ready for printing - Order #${selectedOrderId} at position ${selectedLabelPosition}`, 'success');
            
            setTimeout(() => {
                document.getElementById('discogs-shipping-modal').style.display = 'none';
            }, 2000);
            
        } catch (err) {
            console.error('Error preparing label:', err);
            showStatus(`❌ Error preparing label: ${err.message}`, 'error');
        }
    };

    // =====================================================================
    // HELPERS
    // =====================================================================
    function showStatus(message, type) {
        const statusDiv = document.getElementById('discogs-orders-status-msg');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.className = `status-message status-${type}`;
        if (window.statusTimeout) clearTimeout(window.statusTimeout);
        window.statusTimeout = setTimeout(() => { 
            statusDiv.style.display = 'none'; 
        }, 5000);
    }

    window.discogsOrdersApplyFilters = function() {
        viewingAllOrders = true;
        selectedOrderId = null;
        const itemsSection = document.getElementById('discogs-order-items-section');
        if (itemsSection) itemsSection.style.display = 'none';
        loadOrders();
    };

    // =====================================================================
    // INIT
    // =====================================================================
    window.initDiscogsOrders = function() {
        console.log('📦 Discogs Orders initialized');
        
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
        
        const modal = document.getElementById('discogs-shipping-modal');
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === this) discogsCloseShippingModal();
            });
        }

        loadOrders();
    };
})();