// ============================================================================
// order-management.js - Record Orders Management (Full)
// ============================================================================

(function() {
    'use strict';

    console.log('📦 order-management.js loading...');

    // ========== DOM Elements ==========
    const ordersTableBody = document.getElementById('orders-body');
    const ordersTotalSpan = document.getElementById('orders-total');
    const ordersPendingSpan = document.getElementById('orders-pending');
    const ordersCompletedSpan = document.getElementById('orders-completed');
    const ordersUnreadSpan = document.getElementById('orders-unread');
    const ordersSearchInput = document.getElementById('orders-search');
    const ordersStatusFilter = document.getElementById('orders-status-filter');
    const ordersReadFilter = document.getElementById('orders-read-filter');
    const ordersPrevPageBtn = document.getElementById('orders-prev-page');
    const ordersNextPageBtn = document.getElementById('orders-next-page');
    const ordersCurrentPageSpan = document.getElementById('orders-current-page');
    const ordersTotalPagesSpan = document.getElementById('orders-total-pages');
    const ordersShowingStartSpan = document.getElementById('orders-showing-start');
    const ordersShowingEndSpan = document.getElementById('orders-showing-end');
    const ordersTotalFilteredSpan = document.getElementById('orders-total-filtered');
    const ordersPageSizeSelect = document.getElementById('orders-page-size');

    // ========== State ==========
    let orders = [];
    let currentPage = 1;
    let pageSize = 50;
    let totalOrders = 0;
    let totalPages = 1;

    // ========== Load Orders ==========
    async function loadOrders() {
        const search = ordersSearchInput ? ordersSearchInput.value.trim() : '';
        const status = ordersStatusFilter ? ordersStatusFilter.value : 'all';
        const readFilter = ordersReadFilter ? ordersReadFilter.value : 'all';

        try {
            // FIXED: Use /api/admin/orders instead of /api/orders
            let url = `${AppConfig.baseUrl}/api/admin/orders?page=${currentPage}&per_page=${pageSize}`;
            
            if (status !== 'all') {
                url += `&status=${encodeURIComponent(status)}`;
            }
            if (search) {
                url += `&search=${encodeURIComponent(search)}`;
            }
            if (readFilter !== 'all') {
                url += `&notified=${readFilter === 'unread' ? 0 : 1}`;
            }

            const response = await fetch(url, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });

            if (!response.ok) {
                throw new Error(`Failed to load orders: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.status === 'success') {
                orders = data.orders || [];
                totalOrders = data.total || 0;
                totalPages = data.total_pages || 1;
                
                renderOrders();
                updatePagination();
                updateStats();
            } else {
                throw new Error(data.error || 'Unknown error');
            }

        } catch (error) {
            console.error('Error loading orders:', error);
            if (ordersTableBody) {
                ordersTableBody.innerHTML = `
                    <tr>
                        <td colspan="11" style="text-align:center;padding:40px;color:#dc3545;">
                            <i class="fas fa-exclamation-triangle"></i> 
                            Error loading orders: ${error.message}
                        </td>
                    </tr>
                `;
            }
        }
    }

    // ========== Render Orders ==========
    function renderOrders() {
        if (!ordersTableBody) return;

        if (orders.length === 0) {
            ordersTableBody.innerHTML = `
                <tr>
                    <td colspan="11" style="text-align:center;padding:40px;color:#999;">
                        <i class="fas fa-shopping-cart" style="font-size:24px;display:block;margin-bottom:10px;"></i>
                        No orders found
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        orders.forEach((order, index) => {
            const isUnread = order.notified === 0 || order.notified === null;
            const rowClass = isUnread ? 'order-row-unread' : '';
            const statusClass = order.order_status || 'pending';
            const readStatus = isUnread ? 'unread' : 'read';
            const readBadge = isUnread ? 'unread' : 'read';

            html += `
                <tr class="${rowClass}" data-order-id="${order.id}">
                    <td>${(currentPage - 1) * pageSize + index + 1}</td>
                    <td><strong>${escapeHtml(order.order_number || order.id)}</strong></td>
                    <td>${escapeHtml(order.customer_name || 'Walk-in Customer')}</td>
                    <td>${escapeHtml(order.customer_email || '—')}</td>
                    <td>${escapeHtml(order.customer_phone || '—')}</td>
                    <td>${order.item_count || 0}</td>
                    <td>$${parseFloat(order.total || 0).toFixed(2)}</td>
                    <td><span class="order-status-badge ${statusClass}">${escapeHtml(statusClass)}</span></td>
                    <td><span class="subscription-read-badge ${readBadge}">${isUnread ? '📬 New' : '✓ Read'}</span></td>
                    <td>${formatDate(order.created_at)}</td>
                    <td>
                        <div class="table-actions">
                            <button class="table-action-btn" onclick="viewOrder('${order.id}')" title="View Details">
                                <i class="fas fa-eye"></i>
                            </button>
                            ${isUnread ? `<button class="table-action-btn" onclick="markOrderRead('${order.id}')" title="Mark as Read"><i class="fas fa-check"></i></button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        ordersTableBody.innerHTML = html;
    }

    // ========== Update Pagination ==========
    function updatePagination() {
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalOrders);

        if (ordersShowingStartSpan) ordersShowingStartSpan.textContent = totalOrders > 0 ? start : 0;
        if (ordersShowingEndSpan) ordersShowingEndSpan.textContent = totalOrders > 0 ? end : 0;
        if (ordersTotalFilteredSpan) ordersTotalFilteredSpan.textContent = totalOrders;
        if (ordersCurrentPageSpan) ordersCurrentPageSpan.textContent = currentPage;
        if (ordersTotalPagesSpan) ordersTotalPagesSpan.textContent = totalPages;

        if (ordersPrevPageBtn) ordersPrevPageBtn.disabled = currentPage <= 1;
        if (ordersNextPageBtn) ordersNextPageBtn.disabled = currentPage >= totalPages;
    }

    // ========== Update Stats ==========
    async function updateStats() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/admin/orders/stats`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                const stats = data.stats || {};
                if (ordersTotalSpan) ordersTotalSpan.textContent = stats.total_orders || 0;
                if (ordersPendingSpan) ordersPendingSpan.textContent = stats.pending_orders || 0;
                if (ordersCompletedSpan) ordersCompletedSpan.textContent = stats.completed_orders || 0;
                if (ordersUnreadSpan) ordersUnreadSpan.textContent = stats.unread_orders || 0;
            }
        } catch (error) {
            console.error('Error loading order stats:', error);
        }
    }

    // ========== View Order ==========
    window.viewOrder = function(orderId) {
        window.location.href = `/admin#order-detail-${orderId}`;
    };

    // ========== Mark Order as Read ==========
    window.markOrderRead = async function(orderId) {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/orders/${orderId}/mark-read`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            
            if (response.ok) {
                loadOrders();
                showToast('Order marked as read', 'success');
            } else {
                throw new Error('Failed to mark order as read');
            }
        } catch (error) {
            console.error('Error marking order read:', error);
            showToast('Error marking order as read', 'error');
        }
    };

    // ========== Mark All Orders as Read ==========
    window.markAllOrdersRead = async function() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/orders/mark-all-read`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            
            if (response.ok) {
                loadOrders();
                showToast('All orders marked as read', 'success');
            } else {
                throw new Error('Failed to mark all orders as read');
            }
        } catch (error) {
            console.error('Error marking all orders read:', error);
            showToast('Error marking all orders as read', 'error');
        }
    };

    // ========== Export Orders CSV ==========
    window.exportOrdersCSV = function() {
        if (!orders || orders.length === 0) {
            showToast('No orders to export', 'warning');
            return;
        }

        let csv = 'Order #,Customer,Email,Items,Total,Status,Created\n';
        orders.forEach(order => {
            csv += `${order.order_number || order.id},`;
            csv += `"${order.customer_name || 'Walk-in Customer'}",`;
            csv += `"${order.customer_email || ''}",`;
            csv += `${order.item_count || 0},`;
            csv += `${parseFloat(order.total || 0).toFixed(2)},`;
            csv += `${order.order_status || 'pending'},`;
            csv += `${formatDate(order.created_at)}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // ========== Apply Filters ==========
    window.applyOrderFilters = function() {
        currentPage = 1;
        loadOrders();
    };

    window.clearOrderFilters = function() {
        if (ordersSearchInput) ordersSearchInput.value = '';
        if (ordersStatusFilter) ordersStatusFilter.value = 'all';
        if (ordersReadFilter) ordersReadFilter.value = 'all';
        currentPage = 1;
        loadOrders();
    };

    // ========== Utility Functions ==========
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDate(dateString) {
        if (!dateString) return '—';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return dateString;
        }
    }

    function showToast(message, type) {
        const el = document.getElementById('status-message');
        if (!el) return;
        el.textContent = message;
        el.className = `status-message status-${type || 'info'}`;
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    }

    // ========== Event Listeners ==========
    function setupEventListeners() {
        if (ordersPrevPageBtn) {
            ordersPrevPageBtn.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    loadOrders();
                }
            });
        }

        if (ordersNextPageBtn) {
            ordersNextPageBtn.addEventListener('click', () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    loadOrders();
                }
            });
        }

        if (ordersPageSizeSelect) {
            ordersPageSizeSelect.addEventListener('change', () => {
                pageSize = parseInt(ordersPageSizeSelect.value);
                currentPage = 1;
                loadOrders();
            });
        }

        if (ordersSearchInput) {
            ordersSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyOrderFilters();
                }
            });
        }
    }

    // ========== Initialize ==========
    function init() {
        console.log('📦 Initializing order management...');
        setupEventListeners();
        loadOrders();
    }

    // Expose functions to window
    window.loadOrders = loadOrders;
    window.applyOrderFilters = applyOrderFilters;
    window.clearOrderFilters = clearOrderFilters;
    window.exportOrdersCSV = exportOrdersCSV;
    window.markAllOrdersRead = markAllOrdersRead;

    // Auto-init if DOM ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 500);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

    // Also expose for TabManager
    window.initRecordOrdersTab = init;

    console.log('✅ order-management.js loaded');
})();