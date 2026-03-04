// ==================== ORDERS MANAGEMENT ====================

let orders = [];
let filteredOrders = [];
let ordersCurrentPage = 1;
let ordersPageSize = 20;
let ordersSortField = 'created_at';
let ordersSortDirection = 'desc';
let ordersStatusFilter = 'all';
let ordersSearchTerm = '';

// Load orders from API
async function loadOrders() {
    const loadingEl = document.getElementById('orders-loading');
    const tableBody = document.getElementById('orders-body');
    const emptyEl = document.getElementById('orders-empty');
    
    try {
        if (loadingEl) loadingEl.style.display = 'block';
        if (tableBody) tableBody.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'none';
        
        const response = await fetch(`${AppConfig.baseUrl}/api/admin/orders`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            orders = data.orders || [];
            filteredOrders = [...orders];
            updateOrdersStats();
            applyOrdersFilters();
        } else {
            console.error('Failed to load orders:', data.error);
            showOrdersError('Failed to load orders');
        }
        
    } catch (error) {
        console.error('Error loading orders:', error);
        showOrdersError('Error loading orders: ' + error.message);
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// Load order statistics
async function loadOrderStats() {
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/admin/orders/stats`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            updateStatsDisplay(data);
        }
    } catch (error) {
        console.error('Error loading order stats:', error);
    }
}

// Update statistics display
function updateStatsDisplay(stats) {
    const totalOrders = document.getElementById('total-orders');
    const totalRevenue = document.getElementById('total-revenue');
    const pendingOrders = document.getElementById('pending-orders');
    const paidOrders = document.getElementById('paid-orders');
    
    if (totalOrders) {
        totalOrders.textContent = stats.stats?.total_orders || 0;
    }
    
    if (totalRevenue) {
        totalRevenue.textContent = formatCurrency(stats.stats?.total_revenue || 0);
    }
    
    if (pendingOrders) {
        pendingOrders.textContent = stats.status_stats?.find(s => s.status === 'pending')?.count || 0;
    }
    
    if (paidOrders) {
        paidOrders.textContent = stats.status_stats?.find(s => s.status === 'paid')?.count || 0;
    }
}

// Apply filters and sorting
function applyOrdersFilters() {
    let filtered = [...orders];
    
    // Apply status filter
    if (ordersStatusFilter !== 'all') {
        filtered = filtered.filter(order => order.status === ordersStatusFilter);
    }
    
    // Apply search
    if (ordersSearchTerm.trim()) {
        const term = ordersSearchTerm.toLowerCase().trim();
        filtered = filtered.filter(order => {
            return (order.square_order_id && order.square_order_id.toLowerCase().includes(term)) ||
                   (order.customer_email && order.customer_email.toLowerCase().includes(term)) ||
                   (order.customer_name && order.customer_name.toLowerCase().includes(term)) ||
                   JSON.stringify(order.items).toLowerCase().includes(term);
        });
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
        let aVal = a[ordersSortField];
        let bVal = b[ordersSortField];
        
        if (ordersSortField === 'total') {
            aVal = parseFloat(aVal) || 0;
            bVal = parseFloat(bVal) || 0;
        } else if (ordersSortField === 'created_at') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
        } else if (ordersSortField === 'customer_email' || ordersSortField === 'customer_name') {
            aVal = (aVal || '').toLowerCase();
            bVal = (bVal || '').toLowerCase();
        }
        
        if (ordersSortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
    
    filteredOrders = filtered;
    updateOrdersPagination();
    renderOrdersTable();
}

// Render orders table
function renderOrdersTable() {
    const tableBody = document.getElementById('orders-body');
    const emptyEl = document.getElementById('orders-empty');
    
    if (!tableBody) return;
    
    const start = (ordersCurrentPage - 1) * ordersPageSize;
    const end = Math.min(start + ordersPageSize, filteredOrders.length);
    const pageOrders = filteredOrders.slice(start, end);
    
    if (pageOrders.length === 0) {
        if (emptyEl) {
            emptyEl.style.display = 'block';
            tableBody.innerHTML = '';
        } else {
            tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px;">No orders found</td></tr>';
        }
        updatePaginationInfo(0, 0, 0);
        return;
    }
    
    if (emptyEl) emptyEl.style.display = 'none';
    
    let html = '';
    pageOrders.forEach((order) => {
        const items = order.items || [];
        const itemCount = items.length;
        const itemPreview = items.slice(0, 2).map(item => 
            `${item.artist || ''} - ${item.title || ''}`
        ).join('<br>') + (items.length > 2 ? `<br>... and ${items.length - 2} more` : '');
        
        const statusClass = order.status === 'paid' ? 'status-paid' : 
                           order.status === 'cancelled' ? 'status-cancelled' : 'status-pending';
        
        // Determine if we should show refresh button (only for pending orders)
        const showRefresh = order.status === 'pending';
        
        html += `
            <tr>
                <td>${order.id}</td>
                <td>${order.square_order_id ? order.square_order_id.substring(0, 8) : 'N/A'}</td>
                <td>${formatDate(order.created_at)}</td>
                <td>${order.customer_email || '-'}</td>
                <td>${order.customer_name || '-'}</td>
                <td>${itemPreview}</td>
                <td>${formatCurrency(order.total)}</td>
                <td><span class="status-badge ${statusClass}">${order.status || 'pending'}</span></td>
                <td class="table-actions">
                    <button class="btn-small btn-info" onclick="viewOrderDetails(${order.id})" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${showRefresh ? `
                        <button class="btn-small btn-warning" onclick="refreshOrderPayment(${order.id})" title="Check Square for Payment">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
    updatePaginationInfo(start + 1, end, filteredOrders.length);
}

// Update pagination controls
function updateOrdersPagination() {
    const totalPages = Math.ceil(filteredOrders.length / ordersPageSize);
    const currentPage = ordersCurrentPage;
    
    const firstBtn = document.getElementById('orders-first-btn');
    const prevBtn = document.getElementById('orders-prev-btn');
    const nextBtn = document.getElementById('orders-next-btn');
    const lastBtn = document.getElementById('orders-last-btn');
    const pageInfo = document.getElementById('orders-current-page');
    const totalPagesSpan = document.getElementById('orders-total-pages');
    
    if (firstBtn) firstBtn.disabled = currentPage === 1;
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    if (lastBtn) lastBtn.disabled = currentPage === totalPages || totalPages === 0;
    if (pageInfo) {
        pageInfo.value = currentPage;
        pageInfo.max = totalPages || 1;
    }
    if (totalPagesSpan) totalPagesSpan.textContent = totalPages || 1;
}

// Update pagination info display
function updatePaginationInfo(start, end, total) {
    const startSpan = document.getElementById('orders-showing-start');
    const endSpan = document.getElementById('orders-showing-end');
    const totalSpan = document.getElementById('orders-total-filtered');
    
    if (startSpan) startSpan.textContent = start;
    if (endSpan) endSpan.textContent = end;
    if (totalSpan) totalSpan.textContent = total;
}

// Go to specific page
function goToOrdersPage(page) {
    const totalPages = Math.ceil(filteredOrders.length / ordersPageSize);
    if (page < 1 || page > totalPages) return;
    
    ordersCurrentPage = page;
    renderOrdersTable();
    updateOrdersPagination();
}

// Change page size
function changeOrdersPageSize(size) {
    ordersPageSize = parseInt(size);
    ordersCurrentPage = 1;
    applyOrdersFilters();
}

// Sort orders by field
function sortOrders(field) {
    if (ordersSortField === field) {
        ordersSortDirection = ordersSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        ordersSortField = field;
        ordersSortDirection = 'asc';
    }
    
    // Update sort indicators
    document.querySelectorAll('.sort-indicator').forEach(el => el.remove());
    const header = document.getElementById(`sort-${field}`);
    if (header) {
        const indicator = document.createElement('span');
        indicator.className = 'sort-indicator';
        indicator.innerHTML = ordersSortDirection === 'asc' ? ' ↑' : ' ↓';
        header.appendChild(indicator);
    }
    
    applyOrdersFilters();
}

// Filter by status
function filterOrdersByStatus(status) {
    ordersStatusFilter = status;
    ordersCurrentPage = 1;
    applyOrdersFilters();
}

// Search orders
function searchOrders() {
    const searchInput = document.getElementById('orders-search');
    ordersSearchTerm = searchInput ? searchInput.value : '';
    ordersCurrentPage = 1;
    applyOrdersFilters();
}

// Clear search
function clearOrdersSearch() {
    const searchInput = document.getElementById('orders-search');
    if (searchInput) searchInput.value = '';
    ordersSearchTerm = '';
    ordersCurrentPage = 1;
    applyOrdersFilters();
}

// View order details
async function viewOrderDetails(orderId) {
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/admin/orders/${orderId}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showOrderDetailsModal(data.order);
        } else {
            alert('Failed to load order details');
        }
    } catch (error) {
        console.error('Error loading order details:', error);
        alert('Error loading order details');
    }
}

// Show order details modal
function showOrderDetailsModal(order) {
    const items = order.items || [];
    
    let itemsHtml = '';
    items.forEach(item => {
        itemsHtml += `
            <tr>
                <td>${item.artist || ''}</td>
                <td>${item.title || ''}</td>
                <td>${item.condition || ''}</td>
                <td>${formatCurrency(item.price || 0)}</td>
            </tr>
        `;
    });
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'order-details-modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h3 class="modal-title"><i class="fas fa-receipt"></i> Order Details #${order.id}</h3>
                <button class="modal-close" onclick="closeOrderDetailsModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <h4>Order Information</h4>
                        <p><strong>Order #:</strong> ${order.order_number || 'N/A'}</p>
                        <p><strong>Square Order ID:</strong> ${order.square_order_id || 'N/A'}</p>
                        <p><strong>Square Payment ID:</strong> ${order.square_payment_id || 'N/A'}</p>
                        <p><strong>Date:</strong> ${formatDate(order.created_at)}</p>
                        <p><strong>Status:</strong> <span class="status-badge status-${order.status}">${order.status}</span></p>
                    </div>
                    <div>
                        <h4>Customer Information</h4>
                        <p><strong>Name:</strong> ${order.customer_name || 'N/A'}</p>
                        <p><strong>Email:</strong> ${order.customer_email || 'N/A'}</p>
                        <p><strong>Shipping Method:</strong> ${order.shipping_method || 'N/A'}</p>
                        ${order.shipping_method === 'ship' ? `
                            <p><strong>Address:</strong> ${order.shipping_address_line1 || ''} ${order.shipping_address_line2 || ''}</p>
                            <p><strong>City/State/Zip:</strong> ${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}</p>
                            <p><strong>Country:</strong> ${order.shipping_country || ''}</p>
                        ` : ''}
                    </div>
                </div>
                
                <h4>Items (${items.length})</h4>
                <div style="overflow-x: auto;">
                    <table class="records-table">
                        <thead>
                            <tr>
                                <th>Artist</th>
                                <th>Title</th>
                                <th>Condition</th>
                                <th>Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml || '<tr><td colspan="4" style="text-align:center;">No items found</td></tr>'}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" style="text-align: right;"><strong>Subtotal:</strong></td>
                                <td>${formatCurrency(order.subtotal || 0)}</td>
                            </tr>
                            <tr>
                                <td colspan="3" style="text-align: right;"><strong>Shipping:</strong></td>
                                <td>${formatCurrency(order.shipping_cost || 0)}</td>
                            </tr>
                            <tr>
                                <td colspan="3" style="text-align: right;"><strong>Tax:</strong></td>
                                <td>${formatCurrency(order.tax || 0)}</td>
                            </tr>
                            <tr>
                                <td colspan="3" style="text-align: right;"><strong>Total:</strong></td>
                                <td><strong>${formatCurrency(order.total || 0)}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                
                ${order.notes ? `
                    <div style="margin-top: 20px;">
                        <h4>Notes</h4>
                        <p style="background: #f8f9fa; padding: 10px; border-radius: 4px;">${order.notes}</p>
                    </div>
                ` : ''}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeOrderDetailsModal()">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Close order details modal
function closeOrderDetailsModal() {
    const modal = document.getElementById('order-details-modal');
    if (modal) modal.remove();
}

// Refresh order payment status from Square
async function refreshOrderPayment(orderId) {
    if (!confirm(`Check Square for payment status of Order #${orderId}?`)) {
        return;
    }
    
    // Find the button that was clicked
    const button = event.target.closest('button');
    const originalHtml = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    button.disabled = true;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/admin/orders/${orderId}/refresh-payment`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            if (data.payment_found) {
                showNotification(`✅ Payment found! Order #${orderId} marked as paid.`, 'success');
                // Refresh the orders list
                await loadOrders();
                await loadOrderStats();
            } else {
                showNotification(`❌ No matching payment found for Order #${orderId}`, 'warning');
            }
        } else {
            showNotification(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error refreshing payment:', error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        button.innerHTML = originalHtml;
        button.disabled = false;
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove any existing notification
    const existing = document.querySelector('.order-notification');
    if (existing) existing.remove();
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `order-notification ${type}`;
    notification.innerHTML = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : '#dc3545'};
        color: ${type === 'warning' ? '#333' : 'white'};
        border-radius: 4px;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
        font-weight: 500;
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 300);
        }
    }, 5000);
}

// Update orders stats
function updateOrdersStats() {
    const totalOrders = document.getElementById('total-orders');
    const totalRevenue = document.getElementById('total-revenue');
    const pendingOrders = document.getElementById('pending-orders');
    const paidOrders = document.getElementById('paid-orders');
    
    if (totalOrders) {
        totalOrders.textContent = orders.length;
    }
    
    if (totalRevenue) {
        const revenue = orders.reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0);
        totalRevenue.textContent = formatCurrency(revenue);
    }
    
    if (pendingOrders) {
        const pending = orders.filter(order => order.status === 'pending').length;
        pendingOrders.textContent = pending;
    }
    
    if (paidOrders) {
        const paid = orders.filter(order => order.status === 'paid').length;
        paidOrders.textContent = paid;
    }
}

// Show error message
function showOrdersError(message) {
    const tableBody = document.getElementById('orders-body');
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:#dc3545;">${message}</td></tr>`;
    }
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount || 0);
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Refresh orders
function refreshOrders() {
    loadOrders();
    loadOrderStats();
}

// Export to CSV
function exportOrdersToCSV() {
    if (filteredOrders.length === 0) {
        alert('No orders to export');
        return;
    }
    
    const headers = ['ID', 'Order Number', 'Square Order ID', 'Date', 'Customer Email', 'Customer Name', 'Items', 'Subtotal', 'Shipping', 'Tax', 'Total', 'Status', 'Payment Status'];
    const csvRows = [];
    
    csvRows.push(headers.join(','));
    
    filteredOrders.forEach(order => {
        const items = order.items || [];
        const itemCount = items.length;
        const itemPreview = items.map(item => `${item.artist} - ${item.title}`).join('; ').substring(0, 100);
        
        const row = [
            order.id,
            order.order_number || '',
            order.square_order_id || '',
            formatDate(order.created_at),
            order.customer_email || '',
            order.customer_name || '',
            `"${itemCount} items: ${itemPreview}"`,
            order.subtotal || 0,
            order.shipping_cost || 0,
            order.tax || 0,
            order.total || 0,
            order.status || 'pending',
            order.payment_status || 'pending'
        ];
        
        csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Initialize orders tab
function initOrdersTab() {
    console.log('Initializing Orders tab...');
    loadOrders();
    loadOrderStats();
    
    // Set up event listeners
    const searchInput = document.getElementById('orders-search');
    if (searchInput) {
        searchInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') searchOrders();
        });
    }
    
    const statusFilter = document.getElementById('orders-status-filter');
    if (statusFilter) {
        statusFilter.addEventListener('change', function() {
            filterOrdersByStatus(this.value);
        });
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the admin page and orders tab exists
    if (document.getElementById('orders-tab')) {
        // Wait for tab manager to initialize
        setTimeout(initOrdersTab, 500);
    }
});

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .order-notification {
        transition: all 0.3s ease;
    }
`;
document.head.appendChild(style);