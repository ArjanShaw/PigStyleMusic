// Shipping Management Module
const ShippingManager = {
    currentPage: 1,
    pageSize: 50,
    totalPages: 1,
    totalOrders: 0,
    currentFilter: 'pending',
    orders: [],
    filteredOrders: [],
    currentOrderId: null,
    
    // Initialize
    init: function() {
        this.loadStats();
        this.loadOrders();
        this.setupEventListeners();
    },
    
    // Setup event listeners
    setupEventListeners: function() {
        // Real-time search
        document.getElementById('shipping-search')?.addEventListener('input', () => {
            this.filterOrders();
        });
    },
    
    // Load shipping stats
    loadStats: async function() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/orders/stats`, {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                const stats = data.stats;
                document.getElementById('pending-shipping-count').textContent = stats.pending_orders || 0;
                document.getElementById('shipped-today-count').textContent = stats.shipped_today || 0;
                document.getElementById('shipping-revenue').textContent = 
                    `$${(stats.total_revenue || 0).toFixed(2)}`;
            }
        } catch (error) {
            console.error('Error loading shipping stats:', error);
        }
    },
    
    // Load orders
    loadOrders: async function() {
        const filter = document.getElementById('shipping-status-filter').value;
        this.currentFilter = filter;
        
        const tbody = document.getElementById('shipping-body');
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading orders...</td></tr>';
        
        try {
            let url = `${AppConfig.baseUrl}/api/orders/all`;
            if (filter !== 'all') {
                url += `?status=${filter}`;
            }
            
            const response = await fetch(url, {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                this.orders = data.orders || [];
                this.filteredOrders = [...this.orders];
                this.totalOrders = this.filteredOrders.length;
                this.totalPages = Math.ceil(this.totalOrders / this.pageSize);
                
                this.renderOrders();
                this.updatePagination();
                
                // Show/hide pagination
                document.getElementById('shipping-pagination').style.display = 
                    this.totalPages > 1 ? 'flex' : 'none';
            } else {
                throw new Error(data.error || 'Failed to load orders');
            }
        } catch (error) {
            console.error('Error loading orders:', error);
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 20px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle"></i> Error loading orders: ${error.message}
            </td></tr>`;
        }
    },
    
    // Render orders for current page
    renderOrders: function() {
        const tbody = document.getElementById('shipping-body');
        const start = (this.currentPage - 1) * this.pageSize;
        const end = Math.min(start + this.pageSize, this.filteredOrders.length);
        const pageOrders = this.filteredOrders.slice(start, end);
        
        if (pageOrders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px;">No orders found</td></tr>';
            return;
        }
        
        let html = '';
        pageOrders.forEach(order => {
            const date = new Date(order.created_at).toLocaleDateString();
            const statusClass = order.order_status === 'pending' ? 'status-badge-warning' : 
                              order.order_status === 'shipped' ? 'status-badge-success' : 
                              'status-badge-secondary';
            
            html += `
                <tr class="${order.order_status === 'pending' ? 'row-pending' : ''}">
                    <td><strong>${order.order_number}</strong></td>
                    <td>${date}</td>
                    <td>
                        <strong>${escapeHtml(order.record_artist)}</strong><br>
                        <small>${escapeHtml(order.record_title)}</small><br>
                        <small>Condition: ${order.record_condition || 'N/A'}</small>
                    </td>
                    <td>${escapeHtml(order.customer_name)}</td>
                    <td>
                        ${escapeHtml(order.shipping_address_line1)}<br>
                        ${order.shipping_address_line2 ? escapeHtml(order.shipping_address_line2) + '<br>' : ''}
                        ${escapeHtml(order.shipping_city)}, ${escapeHtml(order.shipping_state)} ${escapeHtml(order.shipping_zip)}
                    </td>
                    <td><strong>$${order.total_amount.toFixed(2)}</strong></td>
                    <td>
                        <span class="status-badge ${statusClass}">${order.order_status}</span>
                    </td>
                    <td>
                        ${order.tracking_number ? 
                            `<a href="#" onclick="ShippingManager.trackOrder('${order.tracking_number}', '${order.carrier}')">${order.tracking_number}</a>` : 
                            '-'
                        }
                    </td>
                    <td>
                        <button class="btn-action" onclick="ShippingManager.viewOrderDetails('${order.order_number}')" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${order.order_status === 'pending' ? 
                            `<button class="btn-action" onclick="ShippingManager.openShipModal('${order.order_number}')" title="Mark Shipped">
                                <i class="fas fa-shipping-fast"></i>
                            </button>` : 
                            ''
                        }
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
        // Update showing count
        document.getElementById('showing-start').textContent = start + 1;
        document.getElementById('showing-end').textContent = end;
        document.getElementById('total-filtered').textContent = this.filteredOrders.length;
    },
    
    // Filter orders by search term
    filterOrders: function() {
        const searchTerm = document.getElementById('shipping-search').value.toLowerCase().trim();
        
        if (!searchTerm) {
            this.filteredOrders = [...this.orders];
        } else {
            this.filteredOrders = this.orders.filter(order => 
                order.order_number.toLowerCase().includes(searchTerm) ||
                order.customer_name.toLowerCase().includes(searchTerm) ||
                order.record_artist.toLowerCase().includes(searchTerm) ||
                order.record_title.toLowerCase().includes(searchTerm) ||
                (order.tracking_number && order.tracking_number.toLowerCase().includes(searchTerm))
            );
        }
        
        this.totalOrders = this.filteredOrders.length;
        this.totalPages = Math.ceil(this.totalOrders / this.pageSize);
        this.currentPage = 1;
        this.renderOrders();
        this.updatePagination();
    },
    
    // Open ship modal
    openShipModal: async function(orderNumber) {
        const order = this.orders.find(o => o.order_number === orderNumber);
        if (!order) return;
        
        this.currentOrderId = orderNumber;
        
        document.getElementById('ship-order-number').textContent = order.order_number;
        document.getElementById('ship-record-title').textContent = 
            `${order.record_artist} - ${order.record_title}`;
        document.getElementById('ship-customer-name').textContent = order.customer_name;
        
        const address = [
            order.shipping_address_line1,
            order.shipping_address_line2,
            `${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`
        ].filter(line => line && line.trim()).join('<br>');
        document.getElementById('ship-address').innerHTML = address;
        
        document.getElementById('ship-tracking-number').value = '';
        document.getElementById('ship-carrier').value = 'USPS';
        
        document.getElementById('ship-order-modal').style.display = 'flex';
    },
    
    // Confirm ship order
    confirmShipOrder: async function() {
        const tracking = document.getElementById('ship-tracking-number').value.trim();
        const carrier = document.getElementById('ship-carrier').value;
        
        if (!tracking) {
            alert('Please enter tracking number');
            return;
        }
        
        const confirmBtn = document.getElementById('confirm-ship-btn');
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/orders/${this.currentOrderId}/mark-shipped`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    tracking_number: tracking,
                    carrier: carrier
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                this.closeShipModal();
                this.loadOrders();
                this.loadStats();
                showStatusMessage('Order marked as shipped!', 'success');
            } else {
                throw new Error(data.error || 'Failed to mark as shipped');
            }
        } catch (error) {
            console.error('Error marking order shipped:', error);
            alert('Error: ' + error.message);
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Mark as Shipped';
        }
    },
    
    // View order details
    viewOrderDetails: async function(orderNumber) {
        const order = this.orders.find(o => o.order_number === orderNumber);
        if (!order) return;
        
        const date = new Date(order.created_at).toLocaleString();
        
        const content = document.getElementById('order-details-content');
        content.innerHTML = `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 15px 0;">Order #${order.order_number}</h4>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <h5>Record Details</h5>
                        <p><strong>Artist:</strong> ${escapeHtml(order.record_artist)}</p>
                        <p><strong>Title:</strong> ${escapeHtml(order.record_title)}</p>
                        <p><strong>Condition:</strong> ${order.record_condition || 'N/A'}</p>
                        <p><strong>Price:</strong> $${order.record_price.toFixed(2)}</p>
                    </div>
                    <div>
                        <h5>Payment Details</h5>
                        <p><strong>Subtotal:</strong> $${order.record_price.toFixed(2)}</p>
                        <p><strong>Shipping:</strong> $${order.shipping_cost.toFixed(2)}</p>
                        <p><strong>Total:</strong> $${order.total_amount.toFixed(2)}</p>
                        <p><strong>Payment ID:</strong> ${order.square_payment_id || 'N/A'}</p>
                    </div>
                </div>
                
                <div style="margin-top: 20px;">
                    <h5>Customer Details</h5>
                    <p><strong>Name:</strong> ${escapeHtml(order.customer_name)}</p>
                    <p><strong>Email:</strong> ${escapeHtml(order.customer_email || 'N/A')}</p>
                    <p><strong>Address:</strong><br>
                        ${escapeHtml(order.shipping_address_line1)}<br>
                        ${order.shipping_address_line2 ? escapeHtml(order.shipping_address_line2) + '<br>' : ''}
                        ${escapeHtml(order.shipping_city)}, ${escapeHtml(order.shipping_state)} ${escapeHtml(order.shipping_zip)}
                    </p>
                </div>
                
                <div style="margin-top: 20px;">
                    <h5>Order Timeline</h5>
                    <p><strong>Created:</strong> ${date}</p>
                    ${order.shipped_date ? `<p><strong>Shipped:</strong> ${new Date(order.shipped_date).toLocaleString()}</p>` : ''}
                    ${order.tracking_number ? `<p><strong>Tracking:</strong> ${order.tracking_number} (${order.carrier})</p>` : ''}
                </div>
            </div>
        `;
        
        document.getElementById('order-details-modal').style.display = 'flex';
    },
    
    // Track order
    trackOrder: function(trackingNumber, carrier) {
        let url = '#';
        switch(carrier) {
            case 'USPS':
                url = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
                break;
            case 'UPS':
                url = `https://www.ups.com/track?tracknum=${trackingNumber}`;
                break;
            case 'FedEx':
                url = `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
                break;
            case 'DHL':
                url = `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${trackingNumber}`;
                break;
        }
        window.open(url, '_blank');
    },
    
    // Print shipping label (placeholder - integrate with your label printer)
    printShippingLabel: function() {
        alert('Shipping label printing integration - Add your label printer API here');
    },
    
    // Export shipping list as CSV
    exportShippingList: function() {
        const headers = ['Order #', 'Date', 'Artist', 'Title', 'Customer', 'Address', 'City', 'State', 'ZIP', 'Total', 'Status', 'Tracking'];
        const rows = this.filteredOrders.map(order => [
            order.order_number,
            new Date(order.created_at).toLocaleDateString(),
            order.record_artist,
            order.record_title,
            order.customer_name,
            order.shipping_address_line1,
            order.shipping_city,
            order.shipping_state,
            order.shipping_zip,
            order.total_amount.toFixed(2),
            order.order_status,
            order.tracking_number || ''
        ]);
        
        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shipping_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    },
    
    // Close ship modal
    closeShipModal: function() {
        document.getElementById('ship-order-modal').style.display = 'none';
        this.currentOrderId = null;
    },
    
    // Close order details modal
    closeOrderDetailsModal: function() {
        document.getElementById('order-details-modal').style.display = 'none';
    },
    
    // Update pagination
    updatePagination: function() {
        document.getElementById('shipping-current-page').textContent = this.currentPage;
        document.getElementById('shipping-total-pages').textContent = this.totalPages;
        
        document.getElementById('shipping-first-btn').disabled = this.currentPage === 1;
        document.getElementById('shipping-prev-btn').disabled = this.currentPage === 1;
        document.getElementById('shipping-next-btn').disabled = this.currentPage === this.totalPages;
        document.getElementById('shipping-last-btn').disabled = this.currentPage === this.totalPages;
    },
    
    // Go to page
    goToPage: function(direction) {
        if (direction === 'first') this.currentPage = 1;
        else if (direction === 'prev' && this.currentPage > 1) this.currentPage--;
        else if (direction === 'next' && this.currentPage < this.totalPages) this.currentPage++;
        else if (direction === 'last') this.currentPage = this.totalPages;
        
        this.renderOrders();
        this.updatePagination();
    },
    
    // Change page size
    changePageSize: function(size) {
        this.pageSize = size;
        this.totalPages = Math.ceil(this.filteredOrders.length / this.pageSize);
        this.currentPage = 1;
        this.renderOrders();
        this.updatePagination();
    }
};

// Helper functions for HTML onclick
function loadShippingOrders() { ShippingManager.loadOrders(); }
function filterShippingOrders() { ShippingManager.filterOrders(); }
function exportShippingList() { ShippingManager.exportShippingList(); }
function goToShippingPage(direction) { ShippingManager.goToPage(direction); }
function changeShippingPageSize(size) { ShippingManager.changePageSize(size); }
function closeShipModal() { ShippingManager.closeShipModal(); }
function closeOrderDetailsModal() { ShippingManager.closeOrderDetailsModal(); }

// Make ShippingManager globally available
window.ShippingManager = ShippingManager;