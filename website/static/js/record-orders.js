// Record Orders page
(function() {
    let orders = [];
    let filteredOrders = [];
    let currentPage = 1;
    const pageSize = 50;
    let currentViewId = null;

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
        const list = document.getElementById('ro-list');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const searchTerm = document.getElementById('ro-search')?.value || '';
            const statusFilter = document.getElementById('ro-status-filter')?.value || 'all';
            const readFilter = document.getElementById('ro-read-filter')?.value || 'all';
            
            let url = `${API_BASE}/api/record-orders?limit=500`;
            if (searchTerm) {
                url += `&search=${encodeURIComponent(searchTerm)}`;
            }
            
            const response = await fetch(url, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                orders = data.orders || [];
                
                // Apply filters
                filteredOrders = orders.filter(order => {
                    // Status filter
                    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
                    
                    // Read filter
                    if (readFilter === 'unread' && order.is_read) return false;
                    if (readFilter === 'read' && !order.is_read) return false;
                    
                    return true;
                });
                
                renderOrders();
                updateStats();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading orders:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Render orders
    function renderOrders() {
        const list = document.getElementById('ro-list');
        if (!list) return;
        
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredOrders.length);
        const pageData = filteredOrders.slice(start, end);
        
        if (!pageData || pageData.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No orders found</div>';
            updatePagination();
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">#</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Order #</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Customer</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Email</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Phone</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Items</th>
                    <th style="padding: 8px 10px; text-align: right; color: #333;">Total</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Read</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Created</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        pageData.forEach((order, idx) => {
            const statusClass = order.status === 'pending' ? 'pending' :
                               order.status === 'confirmed' ? 'confirmed' :
                               order.status === 'processing' ? 'processing' :
                               order.status === 'shipped' ? 'shipped' :
                               order.status === 'completed' ? 'completed' :
                               order.status === 'cancelled' ? 'cancelled' : '';
            const statusText = order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : '—';
            const readClass = order.is_read ? 'read' : 'unread';
            const readText = order.is_read ? 'Read' : '🔔 New';
            const totalItems = order.items ? order.items.length : 0;
            
            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${start + idx + 1}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-family: monospace;">#${order.order_number || order.id}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${order.customer_name || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${order.email || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${order.phone || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${totalItems}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; color: #28a745; font-weight: 600;">$${(parseFloat(order.total) || 0).toFixed(2)}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${readClass}">${readText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="roView(${order.id})" style="padding: 4px 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
        updatePagination();
    }

    // Update stats
    function updateStats() {
        const total = orders.length;
        const pending = orders.filter(o => o.status === 'pending' || o.status === 'confirmed' || o.status === 'processing').length;
        const completed = orders.filter(o => o.status === 'completed' || o.status === 'shipped' || o.status === 'delivered').length;
        const cancelled = orders.filter(o => o.status === 'cancelled').length;
        const unread = orders.filter(o => !o.is_read).length;
        
        document.getElementById('ro-total').textContent = total;
        document.getElementById('ro-pending').textContent = pending;
        document.getElementById('ro-completed').textContent = completed;
        document.getElementById('ro-cancelled').textContent = cancelled;
        document.getElementById('ro-unread').textContent = unread;
    }

    // Update pagination
    function updatePagination() {
        const total = filteredOrders.length;
        const totalPages = Math.ceil(total / pageSize) || 1;
        // Add pagination controls if needed
    }

    // View order
    window.roView = async function(id) {
        currentViewId = id;
        document.getElementById('ro-modal-title').textContent = `📦 Order #${id}`;
        document.getElementById('ro-view-id').value = id;
        document.getElementById('ro-modal-body').innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        document.getElementById('ro-modal-status').style.display = 'none';
        document.getElementById('ro-modal').style.display = 'flex';
        
        try {
            const order = orders.find(o => o.id === id);
            if (!order) {
                document.getElementById('ro-modal-body').innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Order not found</div>';
                return;
            }
            
            // Mark as read
            if (!order.is_read) {
                await markOrderRead(id);
                order.is_read = true;
                renderOrders();
                updateStats();
            }
            
            renderOrderDetails(order);
        } catch (err) {
            console.error('Error viewing order:', err);
            document.getElementById('ro-modal-body').innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    };

    // Render order details
    function renderOrderDetails(order) {
        const body = document.getElementById('ro-modal-body');
        
        let itemsHtml = '';
        if (order.items && order.items.length > 0) {
            itemsHtml = `<table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px;">
                <thead>
                    <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                        <th style="padding: 6px 8px; text-align: left; color: #333;">Artist</th>
                        <th style="padding: 6px 8px; text-align: left; color: #333;">Title</th>
                        <th style="padding: 6px 8px; text-align: right; color: #333;">Price</th>
                    </tr>
                </thead>
                <tbody>`;
            
            order.items.forEach(item => {
                itemsHtml += `<tr>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${item.artist || '—'}</td>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${item.title || '—'}</td>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${item.price ? '$' + parseFloat(item.price).toFixed(2) : '—'}</td>
                </tr>`;
            });
            
            itemsHtml += `</tbody></table>`;
        } else {
            itemsHtml = '<div style="text-align: center; padding: 10px; color: #999;">No items in this order</div>';
        }
        
        const statusOptions = ['pending', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled'];
        let statusSelect = `<select id="ro-status-select" style="width: 100%; padding: 8px; border: 2px solid #ddd; border-radius: 8px;">`;
        statusOptions.forEach(s => {
            const selected = s === order.status ? 'selected' : '';
            statusSelect += `<option value="${s}" ${selected}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`;
        });
        statusSelect += `</select>`;
        
        body.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Customer</label>
                    <div style="color: #333;">${order.customer_name || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Email</label>
                    <div style="color: #333;">${order.email || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Phone</label>
                    <div style="color: #333;">${order.phone || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Total</label>
                    <div style="color: #28a745; font-weight: 600; font-size: 18px;">$${(parseFloat(order.total) || 0).toFixed(2)}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Created</label>
                    <div style="color: #333;">${order.created_at ? new Date(order.created_at).toLocaleString() : '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Status</label>
                    ${statusSelect}
                </div>
                <div style="grid-column: 1 / -1;">
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Notes</label>
                    <div style="color: #666; background: #f8f9fa; padding: 8px; border-radius: 4px;">${order.notes || 'No notes'}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Items (${order.items ? order.items.length : 0})</label>
                    ${itemsHtml}
                </div>
            </div>
        `;
    }

    // Update status
    window.roUpdateStatus = async function() {
        const id = document.getElementById('ro-view-id').value;
        const status = document.getElementById('ro-status-select')?.value;
        if (!id || !status) return;
        
        const order = orders.find(o => o.id == id);
        if (!order) return;
        
        if (order.status === status) {
            showModalStatus('No change to status', 'info');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/record-orders/${id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ status: status })
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showModalStatus('✅ Order status updated!', 'success');
                order.status = status;
                renderOrders();
                updateStats();
                setTimeout(() => {
                    roCloseModal();
                }, 1000);
            } else {
                showModalStatus(`❌ Error: ${result.error || 'Failed to update'}`, 'error');
            }
        } catch (err) {
            console.error('Error updating order:', err);
            showModalStatus(`❌ Error: ${err.message}`, 'error');
        }
    };

    // Mark as read
    async function markOrderRead(id) {
        try {
            await fetch(`${API_BASE}/api/record-orders/${id}/mark-read`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
        } catch (err) {
            console.error('Error marking read:', err);
        }
    }

    // Mark all as read
    window.roMarkAllRead = async function() {
        const unreadCount = orders.filter(o => !o.is_read).length;
        if (unreadCount === 0) {
            showToast('No unread orders to mark', 'info');
            return;
        }
        
        if (!confirm(`Mark all ${unreadCount} orders as read?`)) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/record-orders/mark-all-read`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showToast('✅ All orders marked as read');
                orders.forEach(o => o.is_read = true);
                renderOrders();
                updateStats();
            } else {
                alert(`Error: ${result.error || 'Failed to mark all as read'}`);
            }
        } catch (err) {
            console.error('Error marking all as read:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // Export CSV
    window.roExportCSV = function() {
        if (orders.length === 0) {
            showToast('No orders to export', 'info');
            return;
        }
        
        let csv = 'Order #,Customer,Email,Phone,Items,Total,Status,Created\n';
        orders.forEach(o => {
            const items = o.items ? o.items.map(i => `${i.artist || ''} - ${i.title || ''}`).join('; ') : '';
            csv += `${o.order_number || o.id},"${o.customer_name || ''}","${o.email || ''}","${o.phone || ''}","${items}",${parseFloat(o.total || 0).toFixed(2)},${o.status || ''},${o.created_at || ''}\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `record_orders_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('✅ CSV exported');
    };

    // Apply filters
    window.roApplyFilters = function() {
        currentPage = 1;
        loadOrders();
    };

    window.roClearFilters = function() {
        document.getElementById('ro-search').value = '';
        document.getElementById('ro-status-filter').value = 'all';
        document.getElementById('ro-read-filter').value = 'all';
        currentPage = 1;
        loadOrders();
    };

    // Refresh
    window.roRefresh = function() {
        loadOrders();
    };

    // Close modal
    window.roCloseModal = function() {
        document.getElementById('ro-modal').style.display = 'none';
        currentViewId = null;
    };

    // Modal status
    function showModalStatus(message, type) {
        const statusDiv = document.getElementById('ro-modal-status');
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
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
        statusDiv.style.background = colors[type] || '#f8f9fa';
        statusDiv.style.color = textColors[type] || '#333';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

    // Toast
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'info' ? '#17a2b8' : '#ffc107';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            background: ${bgColor};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 400px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Enter key search
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('ro-search');
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    roApplyFilters();
                }
            });
        }
    });

    // Close modal on outside click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('ro-modal');
        if (modal && e.target === modal) {
            roCloseModal();
        }
    });

    // Init
    window.initRecordOrders = function() {
        console.log('Record Orders initialized');
        loadOrders();
    };
})();
