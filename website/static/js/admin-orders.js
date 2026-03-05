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
                    <button class="btn-small btn-info" onclick="viewOrderDetails('${order.id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${showRefresh ? `
                        <button class="btn-small btn-warning" onclick="refreshOrderPayment('${order.id}')" title="Check Square for Payment">
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

// ==================== ENHANCED PRINTABLE ORDER DETAILS ====================

// Enhanced view order details with printable layout
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
            showPrintableOrderModal(data.order);
        } else {
            alert('Failed to load order details');
        }
    } catch (error) {
        console.error('Error loading order details:', error);
        alert('Error loading order details');
    }
}

// Show printable order modal
function showPrintableOrderModal(order) {
    const items = order.items || [];
    
    // FIX: Check for shipping address presence instead of relying on shipping_method
    const hasShippingAddress = order.shipping_address_line1 && 
                              order.shipping_address_line1.trim() !== '';
    
    // Calculate totals
    const subtotal = parseFloat(order.subtotal) || 0;
    const shipping = parseFloat(order.shipping_cost) || 0;
    const tax = parseFloat(order.tax) || 0;
    const total = parseFloat(order.total) || 0;
    
    // Format date
    const orderDate = new Date(order.created_at);
    const formattedDate = orderDate.toLocaleDateString() + ' ' + orderDate.toLocaleTimeString();
    
    // Build items HTML
    let itemsHtml = '';
    items.forEach(item => {
        itemsHtml += `
            <tr>
                <td class="item-id">${item.record_id || 'N/A'}</td>
                <td class="item-artist">${escapeHtml(item.artist || '')}</td>
                <td class="item-title">${escapeHtml(item.title || '')}</td>
                <td class="item-condition">${escapeHtml(item.condition || '')}</td>
                <td class="item-price">$${(parseFloat(item.price) || 0).toFixed(2)}</td>
            </tr>
        `;
    });
    
    // Status color class
    const statusClass = order.status === 'paid' ? 'status-paid' : 
                       order.status === 'cancelled' ? 'status-cancelled' : 'status-pending';
    
    // Status icon
    const statusIcon = order.status === 'paid' ? '✅' : 
                      order.status === 'cancelled' ? '❌' : '⏳';
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'order-printable-modal';
    modal.id = 'order-details-modal';
    modal.innerHTML = `
        <div class="order-printable-content">
            <div class="printable-header">
                <h2><i class="fas fa-receipt"></i> Order Details</h2>
                <button class="modal-close-btn" onclick="closeOrderDetailsModal()">&times;</button>
            </div>
            
            <div class="printable-body" id="printable-order-content">
                <!-- Status Card -->
                <div class="status-card">
                    <div class="status-badge-large ${statusClass}">
                        ${statusIcon} ${(order.status || 'pending').toUpperCase()}
                    </div>
                    <div class="order-date">
                        <i class="far fa-calendar-alt"></i> ${formattedDate}
                    </div>
                </div>
                
                <!-- Order Info Card -->
                <div class="info-card">
                    <h3><i class="fas fa-hashtag"></i> Order Information</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Order #:</span>
                            <span class="info-value">${order.order_number || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Square Order ID:</span>
                            <span class="info-value mono">${order.square_order_id || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Square Payment ID:</span>
                            <span class="info-value mono">${order.square_payment_id || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Customer Card -->
                <div class="info-card">
                    <h3><i class="fas fa-user"></i> Customer Information</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Name:</span>
                            <span class="info-value">${escapeHtml(order.customer_name || 'N/A')}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Email:</span>
                            <span class="info-value">${escapeHtml(order.customer_email || 'N/A')}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Shipping/Pickup Card - FIXED: Now checks for shipping address presence -->
                <div class="info-card ${hasShippingAddress ? '' : 'pickup-only'}">
                    <h3><i class="fas ${hasShippingAddress ? 'fa-truck' : 'fa-store'}"></i> 
                        ${hasShippingAddress ? 'Shipping Information' : 'Pickup Information'}
                    </h3>
                    ${hasShippingAddress ? `
                        <div class="info-grid">
                            <div class="info-item full-width">
                                <span class="info-label">Address:</span>
                                <span class="info-value" style="color: #333 !important;">
                                    ${escapeHtml(order.shipping_address_line1 || '')}<br>
                                    ${order.shipping_address_line2 ? escapeHtml(order.shipping_address_line2) + '<br>' : ''}
                                    ${escapeHtml(order.shipping_city || '')}, ${escapeHtml(order.shipping_state || '')} ${escapeHtml(order.shipping_zip || '')}<br>
                                    ${escapeHtml(order.shipping_country || 'USA')}
                                </span>
                            </div>
                        </div>
                    ` : `
                        <div class="pickup-message">
                            <i class="fas fa-check-circle"></i> Customer will pick up in store
                        </div>
                    `}
                </div>
                
                <!-- Items Card -->
                <div class="items-card">
                    <h3><i class="fas fa-compact-disc"></i> Items (${items.length})</h3>
                    <div class="items-table-container">
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Artist</th>
                                    <th>Title</th>
                                    <th>Condition</th>
                                    <th>Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml || '<tr><td colspan="5" class="no-items">No items found</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Totals - FIXED: Added explicit black text color -->
                    <div class="totals-section" style="color: #333 !important;">
                        <div class="total-row" style="color: #333 !important;">
                            <span style="color: #333 !important;">Subtotal:</span>
                            <span style="color: #333 !important;">$${subtotal.toFixed(2)}</span>
                        </div>
                        <div class="total-row" style="color: #333 !important;">
                            <span style="color: #333 !important;">Shipping:</span>
                            <span style="color: #333 !important;">$${shipping.toFixed(2)}</span>
                        </div>
                        <div class="total-row" style="color: #333 !important;">
                            <span style="color: #333 !important;">Tax:</span>
                            <span style="color: #333 !important;">$${tax.toFixed(2)}</span>
                        </div>
                        <div class="total-row grand-total" style="color: #333 !important;">
                            <span style="color: #333 !important;">TOTAL:</span>
                            <span style="color: #28a745 !important; font-weight: bold;">$${total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Notes if any -->
                ${order.notes ? `
                    <div class="notes-card">
                        <h3><i class="fas fa-sticky-note"></i> Notes</h3>
                        <p>${escapeHtml(order.notes)}</p>
                    </div>
                ` : ''}
            </div>
            
            <div class="printable-footer">
                <button class="btn btn-secondary" onclick="closeOrderDetailsModal()">
                    <i class="fas fa-times"></i> Close
                </button>
                <button class="btn btn-primary" onclick="printOrderDetails()">
                    <i class="fas fa-print"></i> Print Order
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Print order details
function printOrderDetails() {
    const content = document.getElementById('printable-order-content');
    if (!content) return;
    
    // Clone the content for printing
    const printContent = content.cloneNode(true);
    
    // Create print styles - FIXED: Added black text colors
    const styles = `
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #000 !important; }
            * { color: #000 !important; }
            .status-card { 
                background: #f8f9fa; 
                padding: 15px; 
                border-radius: 8px; 
                margin-bottom: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border: 1px solid #ddd;
            }
            .status-badge-large { 
                padding: 8px 16px; 
                border-radius: 20px; 
                font-weight: bold;
                font-size: 16px;
            }
            .status-paid { background: #d4edda; color: #155724 !important; border: 1px solid #c3e6cb; }
            .status-pending { background: #fff3cd; color: #856404 !important; border: 1px solid #ffeeba; }
            .status-cancelled { background: #f8d7da; color: #721c24 !important; border: 1px solid #f5c6cb; }
            .order-date { color: #000 !important; font-size: 14px; }
            .info-card { 
                background: white; 
                border: 1px solid #ddd; 
                border-radius: 8px; 
                padding: 15px; 
                margin-bottom: 20px;
            }
            .info-card h3 { 
                margin: 0 0 15px 0; 
                color: #000 !important; 
                font-size: 16px;
                border-bottom: 2px solid #007bff;
                padding-bottom: 8px;
            }
            .info-grid { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 15px;
            }
            .info-item { line-height: 1.6; }
            .info-item.full-width { grid-column: 1 / -1; }
            .info-label { 
                font-weight: bold; 
                color: #000 !important; 
                display: inline-block;
                width: 100px;
            }
            .info-value { color: #000 !important; }
            .mono { font-family: monospace; font-size: 12px; }
            .pickup-message {
                background: #e3f2fd;
                padding: 15px;
                border-radius: 4px;
                color: #0d47a1 !important;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .items-card { 
                background: white; 
                border: 1px solid #ddd; 
                border-radius: 8px; 
                padding: 15px; 
                margin-bottom: 20px;
            }
            .items-card h3 { 
                margin: 0 0 15px 0; 
                color: #000 !important; 
                font-size: 16px;
                border-bottom: 2px solid #28a745;
                padding-bottom: 8px;
            }
            .items-table-container { overflow-x: auto; }
            .items-table { 
                width: 100%; 
                border-collapse: collapse; 
                font-size: 14px;
            }
            .items-table th {
                background: #f8f9fa;
                padding: 12px;
                text-align: left;
                border-bottom: 2px solid #ddd;
                color: #000 !important;
            }
            .items-table td {
                padding: 10px 12px;
                border-bottom: 1px solid #eee;
                color: #000 !important;
            }
            .items-table .item-id { 
                font-family: monospace; 
                font-weight: bold;
                color: #007bff !important;
            }
            .items-table .item-price { 
                font-weight: bold; 
                color: #28a745 !important;
            }
            .totals-section {
                margin-top: 20px;
                padding-top: 15px;
                border-top: 2px solid #333;
                text-align: right;
                color: #000 !important;
            }
            .total-row {
                display: flex;
                justify-content: flex-end;
                gap: 30px;
                margin-bottom: 8px;
                font-size: 15px;
                color: #000 !important;
            }
            .total-row span {
                color: #000 !important;
            }
            .grand-total {
                font-size: 18px;
                font-weight: bold;
                color: #000 !important;
                border-top: 1px solid #ddd;
                padding-top: 8px;
                margin-top: 8px;
            }
            .grand-total span:last-child {
                color: #28a745 !important;
            }
            .notes-card {
                background: #fff3cd;
                border: 1px solid #ffeeba;
                border-radius: 8px;
                padding: 15px;
                margin-top: 20px;
            }
            .notes-card h3 {
                margin: 0 0 10px 0;
                color: #856404 !important;
                font-size: 16px;
            }
            .notes-card p {
                margin: 0;
                color: #856404 !important;
            }
            @media print {
                .modal-close-btn, .printable-footer { display: none; }
                body { padding: 0; }
                .info-card, .items-card, .status-card { break-inside: avoid; }
            }
        </style>
    `;
    
    // Create print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Order Details - ${order?.order_number || 'Order'}</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            ${styles}
        </head>
        <body>
            ${printContent.outerHTML}
            <script>
                window.onload = function() { window.print(); window.close(); }
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Close modal
function closeOrderDetailsModal() {
    const modal = document.getElementById('order-details-modal');
    if (modal) modal.remove();
}

// ==================== END ENHANCED ORDER DETAILS ====================

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

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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