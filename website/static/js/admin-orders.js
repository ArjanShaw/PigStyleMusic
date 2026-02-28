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
        const total = stats.status_stats?.reduce((sum, s) => sum + s.count, 0) || 0;
        totalOrders.textContent = total;
    }
    
    if (totalRevenue) {
        const revenue = stats.status_stats?.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0) || 0;
        totalRevenue.textContent = formatCurrency(revenue);
    }
    
    if (pendingOrders) {
        const pending = stats.status_stats?.find(s => s.status === 'pending')?.count || 0;
        pendingOrders.textContent = pending;
    }
    
    if (paidOrders) {
        const paid = stats.status_stats?.find(s => s.status === 'paid')?.count || 0;
        paidOrders.textContent = paid;
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
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px;">No orders found</td></tr>';
        }
        updatePaginationInfo(0, 0, 0);
        return;
    }
    
    if (emptyEl) emptyEl.style.display = 'none';
    
    let html = '';
    pageOrders.forEach((order, index) => {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        const itemCount = items?.length || 0;
        const itemPreview = items?.slice(0, 2).map(item => 
            `${item.artist || ''} - ${item.title || ''}`
        ).join('<br>') + (items?.length > 2 ? `<br>... and ${items.length - 2} more` : '');
        
        const statusClass = order.status === 'paid' ? 'status-paid' : 
                           order.status === 'cancelled' ? 'status-cancelled' : 'status-pending';
        
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
                <td>
                    <button class="btn-small btn-info" onclick="viewOrderDetails(${order.id})" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
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
    if (pageInfo) pageInfo.value = currentPage;
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
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    
    let itemsHtml = '';
    items.forEach(item => {
        itemsHtml += `
            <tr>
                <td>${item.artist || ''}</td>
                <td>${item.title || ''}</td>
                <td>${item.condition || ''}</td>
                <td>${formatCurrency(item.price)}</td>
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
                        <p><strong>Order ID:</strong> ${order.square_order_id || 'N/A'}</p>
                        <p><strong>Payment ID:</strong> ${order.square_payment_id || 'N/A'}</p>
                        <p><strong>Date:</strong> ${formatDate(order.created_at)}</p>
                        <p><strong>Status:</strong> <span class="status-badge status-${order.status}">${order.status}</span></p>
                    </div>
                    <div>
                        <h4>Customer Information</h4>
                        <p><strong>Name:</strong> ${order.customer_name || 'N/A'}</p>
                        <p><strong>Email:</strong> ${order.customer_email || 'N/A'}</p>
                        <p><strong>Payment Status:</strong> ${order.payment_status || 'N/A'}</p>
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
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" style="text-align: right;"><strong>Total:</strong></td>
                                <td><strong>${formatCurrency(order.total)}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
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
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#dc3545;">${message}</td></tr>`;
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

// Export to CSV
function exportOrdersToCSV() {
    if (filteredOrders.length === 0) {
        alert('No orders to export');
        return;
    }
    
    const headers = ['ID', 'Order ID', 'Date', 'Customer Email', 'Customer Name', 'Items', 'Total', 'Status'];
    const csvRows = [];
    
    csvRows.push(headers.join(','));
    
    filteredOrders.forEach(order => {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        const itemCount = items?.length || 0;
        const itemPreview = items?.map(item => `${item.artist} - ${item.title}`).join('; ').substring(0, 100);
        
        const row = [
            order.id,
            order.square_order_id || '',
            formatDate(order.created_at),
            order.customer_email || '',
            order.customer_name || '',
            `"${itemCount} items: ${itemPreview}"`,
            order.total,
            order.status || 'pending'
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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the admin page
    if (document.getElementById('orders-tab')) {
        initOrdersTab();
    }
});