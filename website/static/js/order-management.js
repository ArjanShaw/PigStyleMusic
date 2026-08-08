// static/js/order-management.js
// Admin order management logic for admin.html Record Orders tab

// ============================================================
// STATE MANAGEMENT
// ============================================================

const OrderManagement = {
    orders: [],
    currentPage: 1,
    pageSize: 50,
    totalOrders: 0,
    totalPages: 1,
    filters: {
        search: '',
        status: 'all',
        readStatus: 'all'
    },
    isLoading: false
};

// ============================================================
// DOM REFS
// ============================================================

function getOrderDOM() {
    return {
        tableBody: document.getElementById('orders-body'),
        totalEl: document.getElementById('orders-total'),
        pendingEl: document.getElementById('orders-pending'),
        completedEl: document.getElementById('orders-completed'),
        unreadEl: document.getElementById('orders-unread'),
        showingStart: document.getElementById('orders-showing-start'),
        showingEnd: document.getElementById('orders-showing-end'),
        totalFiltered: document.getElementById('orders-total-filtered'),
        currentPage: document.getElementById('orders-current-page'),
        totalPages: document.getElementById('orders-total-pages'),
        prevPage: document.getElementById('orders-prev-page'),
        nextPage: document.getElementById('orders-next-page'),
        pageSize: document.getElementById('orders-page-size'),
        searchInput: document.getElementById('orders-search'),
        statusFilter: document.getElementById('orders-status-filter'),
        readFilter: document.getElementById('orders-read-filter'),
        statusEl: document.getElementById('orders-status-message')
    };
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the record orders tab
    const tab = document.querySelector('[data-tab="record-orders"]');
    if (tab) {
        // Set up event listeners
        setupOrderEventListeners();
        // Load initial data
        loadOrders();
    }
});

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupOrderEventListeners() {
    const dom = getOrderDOM();
    
    // Search input - debounced
    if (dom.searchInput) {
        let searchTimeout;
        dom.searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() {
                OrderManagement.filters.search = dom.searchInput.value.trim();
                OrderManagement.currentPage = 1;
                loadOrders();
            }, 500);
        });
        
        // Enter key to search immediately
        dom.searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(searchTimeout);
                OrderManagement.filters.search = dom.searchInput.value.trim();
                OrderManagement.currentPage = 1;
                loadOrders();
            }
        });
    }
    
    // Status filter
    if (dom.statusFilter) {
        dom.statusFilter.addEventListener('change', function() {
            OrderManagement.filters.status = this.value;
            OrderManagement.currentPage = 1;
            loadOrders();
        });
    }
    
    // Read filter
    if (dom.readFilter) {
        dom.readFilter.addEventListener('change', function() {
            OrderManagement.filters.readStatus = this.value;
            OrderManagement.currentPage = 1;
            loadOrders();
        });
    }
    
    // Page size
    if (dom.pageSize) {
        dom.pageSize.addEventListener('change', function() {
            OrderManagement.pageSize = parseInt(this.value);
            OrderManagement.currentPage = 1;
            loadOrders();
        });
    }
    
    // Prev page
    if (dom.prevPage) {
        dom.prevPage.addEventListener('click', function() {
            if (OrderManagement.currentPage > 1) {
                OrderManagement.currentPage--;
                loadOrders();
            }
        });
    }
    
    // Next page
    if (dom.nextPage) {
        dom.nextPage.addEventListener('click', function() {
            if (OrderManagement.currentPage < OrderManagement.totalPages) {
                OrderManagement.currentPage++;
                loadOrders();
            }
        });
    }
}

// ============================================================
// LOAD ORDERS
// ============================================================

async function loadOrders() {
    const dom = getOrderDOM();
    if (!dom.tableBody) return;
    
    if (OrderManagement.isLoading) return;
    OrderManagement.isLoading = true;
    
    dom.tableBody.innerHTML = `
        <tr>
            <td colspan="11" style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i>
                <p style="margin-top: 10px; color: #666;">Loading orders...</p>
            </td>
        </tr>
    `;
    
    try {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocalhost ? 'http://localhost:5000' : `https://${window.location.hostname}`;
        
        // Build query string
        const params = new URLSearchParams();
        params.append('page', OrderManagement.currentPage);
        params.append('per_page', OrderManagement.pageSize);
        
        if (OrderManagement.filters.status !== 'all') {
            params.append('status', OrderManagement.filters.status);
        }
        if (OrderManagement.filters.search) {
            params.append('search', OrderManagement.filters.search);
        }
        
        const url = `${baseUrl}/api/orders?${params.toString()}`;
        
        const response = await fetch(url, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load orders: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            OrderManagement.orders = data.orders || [];
            OrderManagement.totalOrders = data.total || 0;
            OrderManagement.totalPages = data.total_pages || 1;
            renderOrders(data.orders || []);
            updatePagination();
            updateStats();
        } else {
            throw new Error(data.error || 'Failed to load orders');
        }
    } catch (error) {
        console.error('Error loading orders:', error);
        dom.tableBody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 40px; color: #dc3545;">
                    <i class="fas fa-exclamation-circle" style="font-size: 24px;"></i>
                    <p style="margin-top: 10px;">Error loading orders: ${error.message}</p>
                    <button class="btn btn-secondary btn-small" onclick="loadOrders()" style="margin-top: 10px;">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </td>
            </tr>
        `;
    } finally {
        OrderManagement.isLoading = false;
    }
}

// ============================================================
// RENDER ORDERS
// ============================================================

function renderOrders(orders) {
    const dom = getOrderDOM();
    if (!dom.tableBody) return;
    
    if (!orders || orders.length === 0) {
        dom.tableBody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 40px; color: #999;">
                    <i class="fas fa-inbox" style="font-size: 36px; display: block; margin-bottom: 10px;"></i>
                    No orders found.
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    orders.forEach(order => {
        const isUnread = !order.notified;
        const statusClass = getStatusClass(order.status);
        const statusDisplay = order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Unknown';
        const createdDate = order.created_at ? formatDate(order.created_at) : 'N/A';
        const totalAmount = order.total_amount || 0;
        const itemCount = order.item_count || 0;
        
        html += `
            <tr class="${isUnread ? 'order-row-unread' : ''}" data-order-id="${order.id}">
                <td>${order.id || '—'}</td>
                <td><strong>${escapeHtml(order.order_number || '—')}</strong></td>
                <td>${escapeHtml(order.customer_name || '—')}</td>
                <td>${escapeHtml(order.customer_email || '—')}</td>
                <td>${escapeHtml(order.customer_phone || '—')}</td>
                <td style="text-align: center;">${itemCount}</td>
                <td><strong>$${totalAmount.toFixed(2)}</strong></td>
                <td><span class="order-status-badge ${statusClass}">${statusDisplay}</span></td>
                <td>
                    ${isUnread ? 
                        `<span class="subscription-read-badge unread"><i class="fas fa-circle" style="font-size: 8px; color: #007bff;"></i> New</span>` : 
                        `<span class="subscription-read-badge read"><i class="fas fa-check"></i> Read</span>`
                    }
                </td>
                <td style="font-size: 13px; color: #666;">${createdDate}</td>
                <td>
                    <div class="table-actions" style="display: flex; gap: 5px; flex-wrap: wrap;">
                        <button class="table-action-btn" onclick="viewOrder(${order.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="table-action-btn" onclick="updateOrderStatus(${order.id})" title="Update Status">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${isUnread ? 
                            `<button class="table-action-btn" onclick="markOrderRead(${order.id})" title="Mark as Read" style="color: #28a745;">
                                <i class="fas fa-check-double"></i>
                            </button>` : ''
                        }
                        <button class="table-action-btn delete-btn" onclick="deleteOrder(${order.id})" title="Delete Order">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    dom.tableBody.innerHTML = html;
}

// ============================================================
// UPDATE PAGINATION
// ============================================================

function updatePagination() {
    const dom = getOrderDOM();
    const total = OrderManagement.totalOrders;
    const page = OrderManagement.currentPage;
    const perPage = OrderManagement.pageSize;
    const pages = OrderManagement.totalPages;
    
    const start = (page - 1) * perPage + 1;
    const end = Math.min(page * perPage, total);
    
    if (dom.showingStart) dom.showingStart.textContent = total > 0 ? start : 0;
    if (dom.showingEnd) dom.showingEnd.textContent = end;
    if (dom.totalFiltered) dom.totalFiltered.textContent = total;
    if (dom.currentPage) dom.currentPage.textContent = page;
    if (dom.totalPages) dom.totalPages.textContent = pages;
    
    if (dom.prevPage) dom.prevPage.disabled = page <= 1;
    if (dom.nextPage) dom.nextPage.disabled = page >= pages;
}

// ============================================================
// UPDATE STATS
// ============================================================

async function updateStats() {
    try {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocalhost ? 'http://localhost:5000' : `https://${window.location.hostname}`;
        
        // Get stats from the orders list
        const total = OrderManagement.totalOrders;
        const pending = OrderManagement.orders.filter(o => o.status === 'pending').length;
        const completed = OrderManagement.orders.filter(o => o.status === 'completed' || o.status === 'delivered').length;
        const unread = OrderManagement.orders.filter(o => !o.notified).length;
        
        const dom = getOrderDOM();
        if (dom.totalEl) dom.totalEl.textContent = total;
        if (dom.pendingEl) dom.pendingEl.textContent = pending;
        if (dom.completedEl) dom.completedEl.textContent = completed;
        if (dom.unreadEl) dom.unreadEl.textContent = unread;
        
        // Also get unread count from API for accuracy
        try {
            const response = await fetch(`${baseUrl}/api/orders/unread-count`, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.count !== undefined) {
                    if (dom.unreadEl) dom.unreadEl.textContent = data.count;
                }
            }
        } catch (e) {
            console.warn('Could not fetch unread count:', e);
        }
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// ============================================================
// VIEW ORDER DETAILS
// ============================================================

window.viewOrder = async function(orderId) {
    try {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocalhost ? 'http://localhost:5000' : `https://${window.location.hostname}`;
        
        const response = await fetch(`${baseUrl}/api/orders/${orderId}`, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load order: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success' && data.order) {
            showOrderDetailModal(data.order);
        } else {
            throw new Error(data.error || 'Failed to load order details');
        }
    } catch (error) {
        console.error('Error viewing order:', error);
        showStatusMessage('Error loading order details: ' + error.message, 'error');
    }
};

function showOrderDetailModal(order) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('order-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'order-detail-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3 class="modal-title"><i class="fas fa-shopping-cart"></i> Order Details</h3>
                    <button class="modal-close" onclick="closeOrderDetailModal()">&times;</button>
                </div>
                <div class="modal-body" id="order-detail-body"></div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeOrderDetailModal()">Close</button>
                    <button class="btn btn-primary" onclick="updateOrderStatusFromDetail()"><i class="fas fa-edit"></i> Update Status</button>
                    <button class="btn btn-success" onclick="markOrderReadFromDetail()"><i class="fas fa-check-double"></i> Mark Read</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Store order data for modal actions
    window._currentOrderDetail = order;
    
    const body = document.getElementById('order-detail-body');
    if (!body) return;
    
    const items = order.items || [];
    const totalAmount = items.reduce((sum, item) => sum + (item.price_at_time || 0) * (item.quantity || 1), 0);
    
    let itemsHtml = '';
    if (items.length > 0) {
        itemsHtml = `
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
                <thead>
                    <tr>
                        <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">Item</th>
                        <th style="text-align: center; padding: 8px; border-bottom: 2px solid #ddd;">Qty</th>
                        <th style="text-align: right; padding: 8px; border-bottom: 2px solid #ddd;">Price</th>
                        <th style="text-align: right; padding: 8px; border-bottom: 2px solid #ddd;">Total</th>
                    </tr>
                </thead>
                <tbody>
        `;
        items.forEach(item => {
            const itemTotal = (item.price_at_time || 0) * (item.quantity || 1);
            const artist = item.artist || 'Unknown';
            const title = item.title || 'Unknown';
            itemsHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">
                        <strong>${escapeHtml(artist)}</strong> - ${escapeHtml(title)}
                        ${item.barcode ? `<span style="font-size: 11px; color: #999; display: block;">Barcode: ${escapeHtml(item.barcode)}</span>` : ''}
                    </td>
                    <td style="text-align: center; padding: 8px; border-bottom: 1px solid #eee;">${item.quantity || 1}</td>
                    <td style="text-align: right; padding: 8px; border-bottom: 1px solid #eee;">$${(item.price_at_time || 0).toFixed(2)}</td>
                    <td style="text-align: right; padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">$${itemTotal.toFixed(2)}</td>
                </tr>
            `;
        });
        itemsHtml += `
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align: right; padding: 10px; font-weight: 600;">Total:</td>
                        <td style="text-align: right; padding: 10px; font-weight: 700; color: #28a745;">$${totalAmount.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
        `;
    } else {
        itemsHtml = '<p style="color: #999; text-align: center; padding: 20px;">No items in this order.</p>';
    }
    
    body.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
            <div>
                <strong>Order #:</strong> ${escapeHtml(order.order_number || '—')}
            </div>
            <div>
                <strong>Status:</strong> <span class="order-status-badge ${getStatusClass(order.status)}">${order.status || 'Unknown'}</span>
            </div>
            <div>
                <strong>Customer:</strong> ${escapeHtml(order.customer_name || '—')}
            </div>
            <div>
                <strong>Email:</strong> ${escapeHtml(order.customer_email || '—')}
            </div>
            <div>
                <strong>Phone:</strong> ${escapeHtml(order.customer_phone || '—')}
            </div>
            <div>
                <strong>Created:</strong> ${order.created_at ? formatDate(order.created_at) : 'N/A'}
            </div>
        </div>
        ${order.shipping_address ? `
            <div style="margin-bottom: 10px;">
                <strong>Shipping Address:</strong><br>
                ${escapeHtml(order.shipping_address)}
            </div>
        ` : ''}
        ${order.notes ? `
            <div style="margin-bottom: 10px;">
                <strong>Notes:</strong><br>
                ${escapeHtml(order.notes)}
            </div>
        ` : ''}
        <div>
            <strong>Items (${items.length}):</strong>
            ${itemsHtml}
        </div>
    `;
    
    modal.classList.add('active');
    document.body.classList.add('modal-open');
}

window.closeOrderDetailModal = function() {
    const modal = document.getElementById('order-detail-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
    window._currentOrderDetail = null;
};

// ============================================================
// UPDATE ORDER STATUS
// ============================================================

window.updateOrderStatus = async function(orderId) {
    // Show status update modal
    showStatusUpdateModal(orderId);
};

function showStatusUpdateModal(orderId) {
    let modal = document.getElementById('order-status-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'order-status-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3 class="modal-title"><i class="fas fa-edit"></i> Update Order Status</h3>
                    <button class="modal-close" onclick="closeStatusUpdateModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label for="status-select" style="display: block; margin-bottom: 5px; font-weight: 600;">New Status:</label>
                        <select id="status-select" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="processing">Processing</option>
                            <option value="shipped">Shipped</option>
                            <option value="delivered">Delivered</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                    <div id="status-update-message" style="display: none;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeStatusUpdateModal()">Cancel</button>
                    <button class="btn btn-success" onclick="confirmStatusUpdate()"><i class="fas fa-save"></i> Update</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Store order ID for the confirm function
    window._statusUpdateOrderId = orderId;
    document.getElementById('status-update-message').style.display = 'none';
    document.getElementById('status-update-message').className = '';
    
    modal.classList.add('active');
    document.body.classList.add('modal-open');
}

window.closeStatusUpdateModal = function() {
    const modal = document.getElementById('order-status-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
    window._statusUpdateOrderId = null;
};

window.confirmStatusUpdate = async function() {
    const orderId = window._statusUpdateOrderId;
    const statusSelect = document.getElementById('status-select');
    const messageEl = document.getElementById('status-update-message');
    
    if (!orderId || !statusSelect) return;
    
    const newStatus = statusSelect.value;
    const submitBtn = document.querySelector('#order-status-modal .btn-success');
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    messageEl.style.display = 'none';
    
    try {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocalhost ? 'http://localhost:5000' : `https://${window.location.hostname}`;
        
        const response = await fetch(`${baseUrl}/api/orders/${orderId}/status`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            messageEl.className = 'status-message success';
            messageEl.textContent = data.message || 'Order status updated successfully!';
            messageEl.style.display = 'block';
            
            // Reload orders after delay
            setTimeout(function() {
                closeStatusUpdateModal();
                loadOrders();
            }, 1500);
        } else {
            messageEl.className = 'status-message error';
            messageEl.textContent = data.error || 'Failed to update order status';
            messageEl.style.display = 'block';
        }
    } catch (error) {
        console.error('Error updating order status:', error);
        messageEl.className = 'status-message error';
        messageEl.textContent = 'Network error. Please try again.';
        messageEl.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Update';
    }
};

window.updateOrderStatusFromDetail = function() {
    const order = window._currentOrderDetail;
    if (order) {
        closeOrderDetailModal();
        setTimeout(function() {
            showStatusUpdateModal(order.id);
        }, 300);
    }
};

// ============================================================
// MARK ORDER READ
// ============================================================

window.markOrderRead = async function(orderId) {
    try {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocalhost ? 'http://localhost:5000' : `https://${window.location.hostname}`;
        
        const response = await fetch(`${baseUrl}/api/orders/${orderId}/mark-read`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to mark order read: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatusMessage('Order marked as read', 'success');
            loadOrders();
        } else {
            throw new Error(data.error || 'Failed to mark order read');
        }
    } catch (error) {
        console.error('Error marking order read:', error);
        showStatusMessage('Error: ' + error.message, 'error');
    }
};

window.markOrderReadFromDetail = function() {
    const order = window._currentOrderDetail;
    if (order) {
        markOrderRead(order.id);
        closeOrderDetailModal();
    }
};

// ============================================================
// MARK ALL ORDERS READ
// ============================================================

window.markAllOrdersRead = async function() {
    if (!confirm('Mark all orders as read?')) return;
    
    try {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocalhost ? 'http://localhost:5000' : `https://${window.location.hostname}`;
        
        // Get all unread orders
        const response = await fetch(`${baseUrl}/api/orders/unread`, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch unread orders: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success' && data.notifications) {
            let markedCount = 0;
            for (const order of data.notifications) {
                try {
                    await fetch(`${baseUrl}/api/orders/${order.id}/mark-read`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    });
                    markedCount++;
                } catch (e) {
                    console.warn('Failed to mark order read:', order.id, e);
                }
            }
            
            showStatusMessage(`Marked ${markedCount} orders as read`, 'success');
            loadOrders();
        }
    } catch (error) {
        console.error('Error marking all orders read:', error);
        showStatusMessage('Error: ' + error.message, 'error');
    }
};

// ============================================================
// DELETE ORDER
// ============================================================

window.deleteOrder = async function(orderId) {
    if (!confirm(`Are you sure you want to delete order #${orderId}? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocalhost ? 'http://localhost:5000' : `https://${window.location.hostname}`;
        
        const response = await fetch(`${baseUrl}/api/orders/${orderId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete order: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatusMessage(data.message || 'Order deleted successfully', 'success');
            loadOrders();
        } else {
            throw new Error(data.error || 'Failed to delete order');
        }
    } catch (error) {
        console.error('Error deleting order:', error);
        showStatusMessage('Error: ' + error.message, 'error');
    }
};

// ============================================================
// EXPORT ORDERS CSV
// ============================================================

window.exportOrdersCSV = function() {
    const orders = OrderManagement.orders;
    if (!orders || orders.length === 0) {
        showStatusMessage('No orders to export', 'warning');
        return;
    }
    
    // CSV headers
    const headers = [
        'Order ID',
        'Order Number',
        'Customer Name',
        'Customer Email',
        'Customer Phone',
        'Shipping Address',
        'Status',
        'Item Count',
        'Total Amount',
        'Created At',
        'Read Status'
    ];
    
    // Build CSV rows
    const rows = orders.map(order => [
        order.id || '',
        order.order_number || '',
        order.customer_name || '',
        order.customer_email || '',
        order.customer_phone || '',
        (order.shipping_address || '').replace(/,/g, ';'),
        order.status || '',
        order.item_count || 0,
        (order.total_amount || 0).toFixed(2),
        order.created_at || '',
        order.notified ? 'Read' : 'Unread'
    ]);
    
    // Combine headers and rows
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `orders_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showStatusMessage(`Exported ${orders.length} orders to CSV`, 'success');
};

// ============================================================
// APPLY / CLEAR FILTERS
// ============================================================

window.applyOrderFilters = function() {
    const dom = getOrderDOM();
    if (dom.searchInput) {
        OrderManagement.filters.search = dom.searchInput.value.trim();
    }
    if (dom.statusFilter) {
        OrderManagement.filters.status = dom.statusFilter.value;
    }
    if (dom.readFilter) {
        OrderManagement.filters.readStatus = dom.readFilter.value;
    }
    OrderManagement.currentPage = 1;
    loadOrders();
};

window.clearOrderFilters = function() {
    const dom = getOrderDOM();
    if (dom.searchInput) dom.searchInput.value = '';
    if (dom.statusFilter) dom.statusFilter.value = 'all';
    if (dom.readFilter) dom.readFilter.value = 'all';
    
    OrderManagement.filters = {
        search: '',
        status: 'all',
        readStatus: 'all'
    };
    OrderManagement.currentPage = 1;
    loadOrders();
};

// ============================================================
// STATUS MESSAGES
// ============================================================

function showStatusMessage(message, type) {
    const dom = getOrderDOM();
    const statusEl = dom.statusEl || document.getElementById('orders-status-message');
    if (!statusEl) {
        // Fallback to alert
        alert(message);
        return;
    }
    
    statusEl.textContent = message;
    statusEl.className = 'status-message ' + type;
    statusEl.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function getStatusClass(status) {
    switch (status) {
        case 'pending': return 'order-pending';
        case 'confirmed': return 'order-confirmed';
        case 'processing': return 'order-processing';
        case 'shipped': return 'order-shipped';
        case 'delivered': return 'order-delivered';
        case 'completed': return 'order-completed';
        case 'cancelled': return 'order-cancelled';
        default: return 'order-pending';
    }
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateStr;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ============================================================

// These are referenced from HTML onclick attributes
window.loadOrders = loadOrders;
window.viewOrder = viewOrder;
window.closeOrderDetailModal = closeOrderDetailModal;
window.updateOrderStatus = updateOrderStatus;
window.closeStatusUpdateModal = closeStatusUpdateModal;
window.confirmStatusUpdate = confirmStatusUpdate;
window.updateOrderStatusFromDetail = updateOrderStatusFromDetail;
window.markOrderRead = markOrderRead;
window.markOrderReadFromDetail = markOrderReadFromDetail;
window.markAllOrdersRead = markAllOrdersRead;
window.deleteOrder = deleteOrder;
window.exportOrdersCSV = exportOrdersCSV;
window.applyOrderFilters = applyOrderFilters;
window.clearOrderFilters = clearOrderFilters;