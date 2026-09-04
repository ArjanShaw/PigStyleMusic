// ============================================================
// ONLINE ORDERS - Orders from Square checkout (orders table)
// ============================================================

(function() {
    'use strict';

    console.log('📦 Online Orders module loaded');

    let orders = [];
    let filteredOrders = [];
    let currentPage = 1;
    const pageSize = 50;
    let searchTimeout = null;

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
        const list = document.getElementById('oo-list');
        if (!list) {
            console.warn('⚠️ oo-list not found');
            return;
        }
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const searchTerm = document.getElementById('oo-search')?.value || '';
            
            let url = `${API_BASE}/api/admin/orders?per_page=500`;
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
                filteredOrders = [...orders];
                updateStats();
                renderOrders();
                updatePagination();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading orders:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Update stats
    function updateStats() {
        const total = orders.length;
        const pending = orders.filter(o => o.order_status === 'pending' || o.order_status === 'processing').length;
        const completed = orders.filter(o => o.order_status === 'completed' || o.payment_status === 'paid').length;
        const revenue = orders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
        
        const totalEl = document.getElementById('oo-total-orders');
        const pendingEl = document.getElementById('oo-pending-orders');
        const completedEl = document.getElementById('oo-completed-orders');
        const revenueEl = document.getElementById('oo-total-revenue');
        
        if (totalEl) totalEl.textContent = total;
        if (pendingEl) pendingEl.textContent = pending;
        if (completedEl) completedEl.textContent = completed;
        if (revenueEl) revenueEl.textContent = '$' + revenue.toFixed(2);
    }

    // Apply local filters
    function applyLocalFilters(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            filteredOrders = [...orders];
            return;
        }
        
        const term = searchTerm.toLowerCase().trim();
        filteredOrders = orders.filter(order => {
            const orderNumber = (order.order_number || '').toLowerCase();
            const customerName = (order.customer_name || '').toLowerCase();
            const email = (order.customer_email || '').toLowerCase();
            
            return orderNumber.includes(term) || 
                   customerName.includes(term) || 
                   email.includes(term);
        });
    }

    // Render orders
    function renderOrders() {
        const list = document.getElementById('oo-list');
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
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Items</th>
                    <th style="padding: 8px 10px; text-align: right; color: #333;">Total</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Payment</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Created</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        pageData.forEach((order, idx) => {
            const statusClass = order.order_status === 'pending' ? 'pending' :
                               order.order_status === 'processing' ? 'processing' :
                               order.order_status === 'completed' ? 'completed' :
                               order.order_status === 'cancelled' ? 'cancelled' : '';
            const statusText = order.order_status ? order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1) : '—';
            
            const paymentClass = order.payment_status === 'paid' ? 'completed' : 'pending';
            const paymentText = order.payment_status ? order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1) : '—';
            
            const totalItems = order.item_count || 0;
            
            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${start + idx + 1}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-family: monospace; font-weight: 600;">${order.order_number || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${order.customer_name || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${order.customer_email || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${totalItems}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; color: #28a745; font-weight: 600;">$${(parseFloat(order.total) || 0).toFixed(2)}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${paymentClass}">${paymentText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="ooView('${order.id}')" style="padding: 4px 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
        updatePagination();
    }

    // Update pagination
    function updatePagination() {
        const total = filteredOrders.length;
        const totalPages = Math.ceil(total / pageSize) || 1;
        
        const pageInfo = document.getElementById('oo-page-info');
        const prevBtn = document.getElementById('oo-prev-page');
        const nextBtn = document.getElementById('oo-next-page');
        const totalRecords = document.getElementById('oo-total-records');
        
        if (pageInfo) {
            pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        }
        if (prevBtn) {
            prevBtn.disabled = currentPage <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = currentPage >= totalPages;
        }
        if (totalRecords) {
            totalRecords.textContent = filteredOrders.length;
        }
    }

    // Handle search
    function handleSearch() {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        searchTimeout = setTimeout(() => {
            const searchTerm = document.getElementById('oo-search')?.value || '';
            applyLocalFilters(searchTerm);
            currentPage = 1;
            renderOrders();
            updatePagination();
        }, 300);
    }

    // View order
    window.ooView = async function(id) {
        document.getElementById('oo-modal-title').textContent = `📦 Order #${id}`;
        document.getElementById('oo-view-id').value = id;
        document.getElementById('oo-modal-body').innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        document.getElementById('oo-modal-status').style.display = 'none';
        document.getElementById('oo-modal').style.display = 'flex';
        
        try {
            const response = await fetch(`${API_BASE}/api/admin/orders/${id}`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                renderOrderDetails(data.order, data.items);
            } else {
                document.getElementById('oo-modal-body').innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Order not found'}</div>`;
            }
        } catch (err) {
            console.error('Error viewing order:', err);
            document.getElementById('oo-modal-body').innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    };

    // Render order details
    function renderOrderDetails(order, items) {
        const body = document.getElementById('oo-modal-body');
        
        let itemsHtml = '';
        if (items && items.length > 0) {
            itemsHtml = `<table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px;">
                <thead>
                    <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                        <th style="padding: 6px 8px; text-align: left; color: #333;">Artist</th>
                        <th style="padding: 6px 8px; text-align: left; color: #333;">Title</th>
                        <th style="padding: 6px 8px; text-align: right; color: #333;">Price</th>
                    </tr>
                </thead>
                <tbody>`;
            
            items.forEach(item => {
                itemsHtml += `<tr>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${item.record_artist || '—'}</td>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${item.record_title || '—'}</td>
                    <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${item.price_at_time ? '$' + parseFloat(item.price_at_time).toFixed(2) : '—'}</td>
                </tr>`;
            });
            
            itemsHtml += `</tbody></table>`;
        } else {
            itemsHtml = '<div style="text-align: center; padding: 10px; color: #999;">No items in this order</div>';
        }
        
        const statusMap = {
            'pending': 'Pending',
            'processing': 'Processing',
            'completed': 'Completed',
            'cancelled': 'Cancelled'
        };
        
        body.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Order Number</label>
                    <div style="color: #333; font-family: monospace; font-weight: 600;">${order.order_number || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Total</label>
                    <div style="color: #28a745; font-weight: 600; font-size: 18px;">$${(parseFloat(order.total) || 0).toFixed(2)}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Customer</label>
                    <div style="color: #333;">${order.customer_name || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Email</label>
                    <div style="color: #333;">${order.customer_email || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Status</label>
                    <div style="color: #333; font-weight: 600;">${statusMap[order.order_status] || order.order_status || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Payment</label>
                    <div style="color: #333; font-weight: 600;">${order.payment_status || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Shipping Method</label>
                    <div style="color: #333;">${order.shipping_method || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Created</label>
                    <div style="color: #333;">${order.created_at ? new Date(order.created_at).toLocaleString() : '—'}</div>
                </div>
                ${order.shipping_address_line1 ? `
                <div style="grid-column: 1 / -1;">
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Shipping Address</label>
                    <div style="color: #333;">${order.shipping_address_line1}${order.shipping_address_line2 ? ', ' + order.shipping_address_line2 : ''}${order.shipping_city ? ', ' + order.shipping_city : ''}${order.shipping_state ? ', ' + order.shipping_state : ''}${order.shipping_zip ? ' ' + order.shipping_zip : ''}</div>
                </div>
                ` : ''}
                ${order.notes ? `
                <div style="grid-column: 1 / -1;">
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Notes</label>
                    <div style="color: #666; background: #f8f9fa; padding: 8px; border-radius: 4px;">${order.notes}</div>
                </div>
                ` : ''}
                <div style="grid-column: 1 / -1;">
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Items (${items ? items.length : 0})</label>
                    ${itemsHtml}
                </div>
            </div>
        `;
    }

    // Close modal
    window.ooCloseModal = function() {
        document.getElementById('oo-modal').style.display = 'none';
    };

    // Clear search
    window.ooClearSearch = function() {
        document.getElementById('oo-search').value = '';
        currentPage = 1;
        applyLocalFilters('');
        renderOrders();
        updatePagination();
        loadOrders();
    };

    // Refresh
    window.ooRefresh = function() {
        loadOrders();
    };

    // Pagination
    window.ooPrevPage = function() {
        if (currentPage > 1) {
            currentPage--;
            renderOrders();
            updatePagination();
        }
    };

    window.ooNextPage = function() {
        const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
        if (currentPage < totalPages) {
            currentPage++;
            renderOrders();
            updatePagination();
        }
    };

    // Export CSV
    window.ooExportCSV = function() {
        if (!orders || orders.length === 0) {
            alert('No orders to export.');
            return;
        }
        
        let csv = 'Order Number,Customer,Email,Total,Status,Payment,Items,Created\n';
        orders.forEach(order => {
            const items = order.item_count || 0;
            csv += `"${order.order_number || ''}","${order.customer_name || ''}","${order.customer_email || ''}",${parseFloat(order.total || 0).toFixed(2)},"${order.order_status || ''}","${order.payment_status || ''}",${items},"${order.created_at || ''}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `online_orders_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    // Initialize search
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('oo-search');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearch);
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    if (searchTimeout) {
                        clearTimeout(searchTimeout);
                        searchTimeout = null;
                    }
                    const searchTerm = this.value || '';
                    applyLocalFilters(searchTerm);
                    currentPage = 1;
                    renderOrders();
                    updatePagination();
                }
            });
        }
    });

    // Close modal on outside click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('oo-modal');
        if (modal && e.target === modal) {
            ooCloseModal();
        }
    });

    // ===== INIT FUNCTION =====
    window.initOnlineOrders = function() {
        console.log('📦 Online Orders initialized');
        loadOrders();
    };

})();