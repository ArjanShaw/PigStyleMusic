// ============================================================================
// discogs-orders.js - Discogs Orders Management with "Mark Sold" Button
// ============================================================================

console.log('📦 discogs-orders.js loading...');

let currentOrders = [];
let ordersPagination = null;
let isLoadingOrders = false;
let ordersSearchTerm = '';
let ordersStatusFilter = '';
let ordersInitialized = false;

// DOM Elements
let ordersTableBody = null;
let ordersRefreshBtn = null;
let ordersStatusFilterSelect = null;
let ordersSearchInput = null;
let ordersSearchButton = null;
let ordersStatusMessage = null;
let ordersTotalDisplay = null;
let ordersRevenueDisplay = null;
let ordersPaginationContainer = null;
let ordersPrevPageBtn = null;
let ordersNextPageBtn = null;
let ordersPageInfo = null;

// ============================================================================
// Initialize Orders Tab
// ============================================================================

function initDiscogsOrdersTab() {
    console.log('📦 initDiscogsOrdersTab() called');
    
    if (ordersInitialized) {
        console.log('📦 Already initialized, skipping');
        return;
    }
    
    // Get DOM elements
    ordersTableBody = document.getElementById('discogs-orders-body');
    ordersRefreshBtn = document.getElementById('discogs-orders-refresh');
    ordersStatusFilterSelect = document.getElementById('discogs-orders-status-filter');
    ordersSearchInput = document.getElementById('discogs-orders-search');
    ordersSearchButton = document.getElementById('discogs-orders-search-btn');
    ordersStatusMessage = document.getElementById('discogs-orders-status');
    ordersTotalDisplay = document.getElementById('discogs-orders-total');
    ordersRevenueDisplay = document.getElementById('discogs-orders-revenue');
    ordersPaginationContainer = document.getElementById('discogs-orders-pagination');
    ordersPrevPageBtn = document.getElementById('discogs-orders-prev');
    ordersNextPageBtn = document.getElementById('discogs-orders-next');
    ordersPageInfo = document.getElementById('discogs-orders-page-info');
    
    console.log('📦 DOM elements found:', {
        ordersTableBody: !!ordersTableBody,
        ordersRefreshBtn: !!ordersRefreshBtn,
        ordersStatusFilterSelect: !!ordersStatusFilterSelect,
        ordersSearchInput: !!ordersSearchInput,
        ordersSearchButton: !!ordersSearchButton,
        ordersStatusMessage: !!ordersStatusMessage
    });
    
    if (!ordersTableBody) {
        console.error('❌ ordersTableBody not found! Check HTML for id="discogs-orders-body"');
        return;
    }
    
    // Set up event listeners
    if (ordersRefreshBtn) {
        ordersRefreshBtn.addEventListener('click', function() {
            console.log('📦 Refresh button clicked');
            loadDiscogsOrders();
        });
    }
    
    if (ordersStatusFilterSelect) {
        ordersStatusFilterSelect.addEventListener('change', function() {
            console.log('📦 Status filter changed to:', this.value);
            ordersStatusFilter = this.value;
            loadDiscogsOrders();
        });
    }
    
    if (ordersSearchButton) {
        ordersSearchButton.addEventListener('click', function() {
            ordersSearchTerm = ordersSearchInput ? ordersSearchInput.value.trim() : '';
            console.log('📦 Search clicked:', ordersSearchTerm);
            loadDiscogsOrders();
        });
    }
    
    if (ordersSearchInput) {
        ordersSearchInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') {
                ordersSearchTerm = this.value.trim();
                console.log('📦 Search enter:', ordersSearchTerm);
                loadDiscogsOrders();
            }
        });
    }
    
    if (ordersPrevPageBtn) {
        ordersPrevPageBtn.addEventListener('click', function() {
            if (ordersPagination && ordersPagination.page > 1) {
                console.log('📦 Previous page clicked');
                loadDiscogsOrders(ordersPagination.page - 1);
            }
        });
    }
    
    if (ordersNextPageBtn) {
        ordersNextPageBtn.addEventListener('click', function() {
            if (ordersPagination && ordersPagination.page < ordersPagination.pages) {
                console.log('📦 Next page clicked');
                loadDiscogsOrders(ordersPagination.page + 1);
            }
        });
    }
    
    ordersInitialized = true;
    console.log('✅ Discogs Orders Tab initialized');
    
    // Load orders
    loadDiscogsOrders();
}

// ============================================================================
// Load Orders from API
// ============================================================================

async function loadDiscogsOrders(page = 1) {
    console.log('📦 loadDiscogsOrders() called, page:', page);
    
    if (isLoadingOrders) {
        console.log('📦 Already loading, skipping');
        return;
    }
    
    isLoadingOrders = true;
    
    // Show loading state
    if (ordersTableBody) {
        ordersTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-spinner fa-pulse" style="font-size: 24px;"></i>
                    <p style="margin-top: 10px; color: #666;">Loading orders from Discogs...</p>
                    <p style="font-size: 12px; color: #999; margin-top: 5px;">Check console for debug info</p>
                </td>
            </tr>
        `;
    }
    
    try {
        if (typeof AppConfig === 'undefined') {
            console.error('❌ AppConfig is not defined!');
            throw new Error('AppConfig not loaded. Please refresh the page.');
        }
        
        console.log('📦 AppConfig found:', AppConfig);
        console.log('📦 AppConfig.baseUrl:', AppConfig.baseUrl);
        
        let url = `${AppConfig.baseUrl}/api/discogs/orders?page=${page}&per_page=50`;
        
        if (ordersStatusFilter && ordersStatusFilter.trim() !== '') {
            url += `&status=${encodeURIComponent(ordersStatusFilter)}`;
        }
        
        console.log(`📦 Fetching orders from: ${url}`);
        
        let headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        if (AppConfig.getHeaders) {
            console.log('📦 Using AppConfig.getHeaders()');
            headers = { ...headers, ...AppConfig.getHeaders() };
        }
        
        console.log('📦 Headers:', headers);
        
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: headers
        });
        
        console.log(`📦 Response status: ${response.status}`);
        console.log(`📦 Response statusText: ${response.statusText}`);
        
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                console.log('📦 Error response:', errorData);
                if (errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch (e) {
                console.log('📦 Could not parse error response as JSON');
                const text = await response.text();
                console.log('📦 Raw error response:', text);
            }
            
            if (response.status === 401) {
                throw new Error('Not authenticated. Please log in as admin.');
            } else if (response.status === 403) {
                throw new Error('Admin access required.');
            } else if (response.status === 500) {
                throw new Error(`Server error (500). Check Flask logs.`);
            } else {
                throw new Error(errorMessage);
            }
        }
        
        const data = await response.json();
        console.log('📦 Response data:', data);
        console.log('📦 Response status:', data.status);
        console.log('📦 Orders count:', data.orders ? data.orders.length : 0);
        
        if (data.status === 'success') {
            currentOrders = data.orders || [];
            ordersPagination = data.pagination || null;
            
            console.log(`📦 Loaded ${currentOrders.length} orders`);
            
            renderOrdersTable(currentOrders);
            updatePagination();
            updateStats(currentOrders);
            updateStatusMessage(`✅ Loaded ${currentOrders.length} orders`, 'success');
        } else {
            throw new Error(data.error || 'Failed to load orders');
        }
        
    } catch (error) {
        console.error('❌ Error loading Discogs orders:', error);
        console.error('❌ Error stack:', error.stack);
        
        if (ordersTableBody) {
            ordersTableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: #dc3545;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 32px; display: block; margin-bottom: 15px;"></i>
                        <p style="font-size: 16px; font-weight: 600; margin-bottom: 5px;">Error loading orders</p>
                        <p style="font-size: 14px; color: #666; margin-bottom: 15px;">${escapeHtml(error.message)}</p>
                        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-sm" onclick="loadDiscogsOrders()" style="padding: 8px 20px;">
                                <i class="fas fa-sync-alt"></i> Retry
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="checkDiscogsAuth()" style="padding: 8px 20px;">
                                <i class="fas fa-key"></i> Check Auth
                            </button>
                        </div>
                        <p style="font-size: 12px; color: #999; margin-top: 15px;">Check browser console for more details</p>
                    </td>
                </tr>
            `;
        }
        
        updateStatusMessage(`❌ Error: ${error.message}`, 'error');
    } finally {
        isLoadingOrders = false;
        console.log('📦 loadDiscogsOrders() finished, isLoadingOrders:', isLoadingOrders);
    }
}

// ============================================================================
// Check Discogs Authentication
// ============================================================================

async function checkDiscogsAuth() {
    console.log('📦 checkDiscogsAuth() called');
    
    try {
        if (typeof AppConfig === 'undefined') {
            console.error('❌ AppConfig not defined');
            alert('❌ AppConfig not loaded. Please refresh the page.');
            return;
        }
        
        console.log('📦 Checking auth at:', `${AppConfig.baseUrl}/api/discogs/check-auth`);
        
        const response = await fetch(`${AppConfig.baseUrl}/api/discogs/check-auth`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        console.log('📦 Auth response status:', response.status);
        
        const data = await response.json();
        console.log('📦 Auth data:', data);
        
        if (data.authenticated) {
            alert('✅ Authenticated with Discogs');
        } else {
            alert('❌ Not authenticated with Discogs. Please authenticate first.');
        }
        
    } catch (error) {
        console.error('❌ Auth check error:', error);
        alert(`Error checking auth: ${error.message}`);
    }
}

// ============================================================================
// Render Orders Table (list view)
// ============================================================================

function renderOrdersTable(orders) {
    console.log('📦 renderOrdersTable() called with', orders ? orders.length : 0, 'orders');
    
    if (!ordersTableBody) {
        console.error('❌ ordersTableBody is null');
        return;
    }
    
    if (!orders || orders.length === 0) {
        console.log('📦 No orders to display');
        ordersTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-inbox" style="font-size: 48px; display: block; margin-bottom: 15px; color: #ccc;"></i>
                    <p>No orders found${ordersStatusFilter ? ` with status "${ordersStatusFilter}"` : ''}.</p>
                    <p style="font-size: 13px; margin-top: 5px;">Click Refresh to fetch orders from Discogs.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    let filteredOrders = orders;
    if (ordersSearchTerm) {
        const searchLower = ordersSearchTerm.toLowerCase();
        filteredOrders = orders.filter(order => {
            const orderId = (order.order_id || '').toLowerCase();
            const buyer = (order.buyer_username || '').toLowerCase();
            const buyerName = (order.buyer_name || '').toLowerCase();
            return orderId.includes(searchLower) || 
                   buyer.includes(searchLower) || 
                   buyerName.includes(searchLower);
        });
        console.log(`📦 Filtered to ${filteredOrders.length} orders matching "${ordersSearchTerm}"`);
    }
    
    if (filteredOrders.length === 0) {
        ordersTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-search" style="font-size: 32px; display: block; margin-bottom: 15px; color: #ccc;"></i>
                    <p>No orders matching "${ordersSearchTerm}"</p>
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    
    const sortedOrders = [...filteredOrders].sort((a, b) => {
        if (!a.created_at && !b.created_at) return 0;
        if (!a.created_at) return 1;
        if (!b.created_at) return -1;
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return dateB - dateA;
    });
    
    console.log(`📦 Sorted ${sortedOrders.length} orders, newest first`);
    
    for (const order of sortedOrders) {
        const items = order.items || [];
        let artist = 'Unknown';
        let title = 'Unknown';
        let catalog = '';
        
        if (items.length > 0) {
            const firstItem = items[0];
            artist = firstItem.artist || 'Unknown';
            title = firstItem.title || 'Unknown';
            catalog = firstItem.catalog_number || '';
        }
        
        const itemCount = items.length;
        const titleDisplay = itemCount > 1 ? `${title} (+${itemCount - 1} more)` : title;
        const statusBadge = getStatusBadge(order.status);
        const amount = order.total_amount || 0;
        const currency = order.currency || 'USD';
        const amountDisplay = `${currency} ${amount.toFixed(2)}`;
        const createdDate = order.created_at ? formatDate(order.created_at) : '—';
        const paidDate = order.paid_at ? formatDate(order.paid_at) : '—';
        
        html += `
            <tr>
                <td>
                    <div style="font-weight: 600; font-size: 13px;">${escapeHtml(order.order_id || '—')}</div>
                    <div style="font-size: 11px; color: #999;">${escapeHtml(order.buyer_username || '')}</div>
                </td>
                <td>
                    <div style="font-weight: 600;">${escapeHtml(artist)}</div>
                    <div style="font-size: 13px; color: #555;">${escapeHtml(titleDisplay)}</div>
                    ${catalog ? `<div style="font-size: 11px; color: #999;">${escapeHtml(catalog)}</div>` : ''}
                </td>
                <td style="font-weight: 600; color: #28a745;">${amountDisplay}</td>
                <td>${statusBadge}</td>
                <td style="font-size: 13px;">${createdDate}</td>
                <td style="font-size: 13px;">${paidDate}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewDiscogsOrder('${order.order_id}')" style="padding: 4px 8px; font-size: 12px;">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }
    
    ordersTableBody.innerHTML = html;
    console.log(`📦 Rendered ${sortedOrders.length} orders, newest first`);
}

// ============================================================================
// Update Statistics
// ============================================================================

function updateStats(orders) {
    if (ordersTotalDisplay) {
        ordersTotalDisplay.textContent = orders.length;
    }
    
    if (ordersRevenueDisplay) {
        let totalRevenue = 0;
        for (const order of orders) {
            totalRevenue += order.total_amount || 0;
        }
        ordersRevenueDisplay.textContent = `$${totalRevenue.toFixed(2)}`;
    }
}

// ============================================================================
// Get Status Badge HTML
// ============================================================================

function getStatusBadge(status) {
    const statusMap = {
        'Pending': { class: 'status-badge status-pending', label: '⏳ Pending' },
        'Payment Received': { class: 'status-badge status-paid', label: '✅ Payment Received' },
        'In Progress': { class: 'status-badge status-in-progress', label: '🔄 In Progress' },
        'Shipped': { class: 'status-badge status-shipped', label: '📦 Shipped' },
        'Completed': { class: 'status-badge status-completed', label: '✔️ Completed' },
        'Cancelled (Item Unavailable)': { class: 'status-badge status-cancelled', label: '❌ Cancelled' },
        'Cancelled (Per Buyer\'s Request)': { class: 'status-badge status-cancelled', label: '❌ Cancelled by Buyer' }
    };
    
    const mapping = statusMap[status] || { class: 'status-badge', label: status || 'Unknown' };
    return `<span class="${mapping.class}">${mapping.label}</span>`;
}

// ============================================================================
// Update Pagination Controls
// ============================================================================

function updatePagination() {
    if (!ordersPaginationContainer) return;
    
    if (!ordersPagination || ordersPagination.pages <= 1) {
        ordersPaginationContainer.style.display = 'none';
        return;
    }
    
    ordersPaginationContainer.style.display = 'flex';
    
    const currentPage = ordersPagination.page || 1;
    const totalPages = ordersPagination.pages || 1;
    
    if (ordersPrevPageBtn) {
        ordersPrevPageBtn.disabled = currentPage <= 1;
    }
    
    if (ordersNextPageBtn) {
        ordersNextPageBtn.disabled = currentPage >= totalPages;
    }
    
    if (ordersPageInfo) {
        ordersPageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
}

// ============================================================================
// View Order Details (Modal)
// ============================================================================

async function viewDiscogsOrder(orderId) {
    if (!orderId) return;
    showOrderDetailModal(orderId);
}

function showOrderDetailModal(orderId) {
    let modal = document.getElementById('discogs-order-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="discogs-order-modal" class="modal-overlay" style="display: none; z-index: 10002;">
                <div class="modal-content" style="max-width: 850px; width: 95%; background: white; border-radius: 8px;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 20px; border-radius: 8px 8px 0 0;">
                        <h3 id="discogs-order-modal-title" style="margin: 0; color: white;">Order Details</h3>
                        <button class="modal-close" onclick="closeDiscogsOrderModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; float: right;">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px; max-height: 600px; overflow-y: auto;">
                        <div id="discogs-order-modal-content">
                            <div style="text-align: center; padding: 30px;">
                                <i class="fas fa-spinner fa-pulse" style="font-size: 32px;"></i>
                                <p>Loading order details...</p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #ddd; border-radius: 0 0 8px 8px; display: flex; justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="closeDiscogsOrderModal()">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('discogs-order-modal');
    }
    
    modal.style.display = 'flex';
    loadOrderDetail(orderId);
}

async function loadOrderDetail(orderId) {
    const content = document.getElementById('discogs-order-modal-content');
    if (!content) return;
    
    content.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <i class="fas fa-spinner fa-pulse" style="font-size: 32px;"></i>
            <p>Loading order details...</p>
        </div>
    `;
    
    try {
        const url = `${AppConfig.baseUrl}/api/discogs/orders/${orderId}`;
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success' && data.order) {
            renderOrderDetail(data.order);
        } else {
            throw new Error(data.error || 'Failed to load order details');
        }
        
    } catch (error) {
        console.error('Error loading order detail:', error);
        content.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle" style="font-size: 32px;"></i>
                <p>Error loading order details: ${error.message}</p>
            </div>
        `;
    }
}

// ============================================================================
// Helper: Extract PigStyle ID from item fields
// ============================================================================

function extractPigstyleIdFromItem(item) {
    // Try condition_comments first (most common)
    if (item.condition_comments) {
        const match = item.condition_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
        if (match) {
            return parseInt(match[1], 10);
        }
    }
    
    // Try private_comments
    if (item.private_comments) {
        const match = item.private_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
        if (match) {
            return parseInt(match[1], 10);
        }
    }
    
    // Try release.description (unlikely but just in case)
    if (item.release && item.release.description) {
        const match = item.release.description.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
        if (match) {
            return parseInt(match[1], 10);
        }
    }
    
    return null;
}

// ============================================================================
// Mark Record as Sold (called by the button)
// ============================================================================

async function markRecordSold(recordId, salePrice, orderId, artist, title, buttonElement, rowElement) {
    // Disable button and show loading state
    buttonElement.disabled = true;
    buttonElement.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> ...';
    buttonElement.style.opacity = '0.7';
    
    try {
        const url = `${AppConfig.baseUrl}/api/records/mark-sold-on-discogs`;
        
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                record_id: recordId,
                sale_price: salePrice,
                discogs_order_id: orderId
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            // Update the UI
            buttonElement.innerHTML = '✔ Sold';
            buttonElement.style.background = '#28a745';
            buttonElement.style.color = 'white';
            buttonElement.disabled = true;
            
            if (rowElement) {
                rowElement.style.background = '#d4edda';
            }
            
            showToast(`✅ "${artist} - ${title}" marked as sold for $${salePrice.toFixed(2)}`, 'success');
            
            // Refresh orders list after a delay
            setTimeout(() => {
                loadDiscogsOrders();
            }, 3000);
            
        } else {
            throw new Error(data.error || 'Failed to mark as sold');
        }
        
    } catch (error) {
        console.error('❌ Error marking record as sold:', error);
        buttonElement.innerHTML = '❌ Error';
        buttonElement.style.background = '#dc3545';
        buttonElement.style.color = 'white';
        buttonElement.disabled = false;
        showToast(`❌ Error: ${error.message}`, 'error');
    }
}

// ============================================================================
// Render Order Detail (with "Mark Sold" button, checks status)
// ============================================================================

function renderOrderDetail(order) {
    console.log('🔥 renderOrderDetail called with order:', order.order_id);
    
    const content = document.getElementById('discogs-order-modal-content');
    if (!content) {
        console.error('❌ Content element not found');
        return;
    }
    
    const items = order.items || [];
    const statusBadge = getStatusBadge(order.status);
    const currency = order.currency || 'USD';
    const orderId = order.order_id || '';
    
    let html = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div>
                <div style="font-size: 12px; color: #999;">Order ID</div>
                <div style="font-weight: 600; font-size: 16px;">${escapeHtml(orderId)}</div>
            </div>
            <div>
                <div style="font-size: 12px; color: #999;">Status</div>
                <div>${statusBadge}</div>
            </div>
            <div>
                <div style="font-size: 12px; color: #999;">Buyer</div>
                <div style="font-weight: 600;">${escapeHtml(order.buyer_username || '—')}</div>
                <div style="font-size: 13px; color: #666;">${escapeHtml(order.buyer_name || '')}</div>
                <div style="font-size: 13px; color: #666;">${escapeHtml(order.buyer_email || '')}</div>
            </div>
            <div>
                <div style="font-size: 12px; color: #999;">Total</div>
                <div style="font-weight: 600; font-size: 18px; color: #28a745;">${currency} ${(order.total_amount || 0).toFixed(2)}</div>
                <div style="font-size: 13px; color: #666;">Subtotal: ${currency} ${(order.subtotal || 0).toFixed(2)}</div>
                <div style="font-size: 13px; color: #666;">Shipping: ${currency} ${(order.shipping_amount || 0).toFixed(2)}</div>
            </div>
            <div>
                <div style="font-size: 12px; color: #999;">Created</div>
                <div>${order.created_at ? formatDate(order.created_at) : '—'}</div>
            </div>
            <div>
                <div style="font-size: 12px; color: #999;">Paid</div>
                <div>${order.paid_at ? formatDate(order.paid_at) : '—'}</div>
            </div>
        </div>
        
        <div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="font-weight: 600;">Items (${items.length})</div>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 8px; text-align: left;">Artist</th>
                        <th style="padding: 8px; text-align: left;">Title</th>
                        <th style="padding: 8px; text-align: center;">PigStyle ID</th>
                        <th style="padding: 8px; text-align: left;">Condition</th>
                        <th style="padding: 8px; text-align: right;">Price</th>
                        <th style="padding: 8px; text-align: center;">Qty</th>
                        <th style="padding: 8px; text-align: center;">Action</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemPrice = item.price || 0;
        const itemCurrency = currency;
        const itemArtist = item.artist || 'Unknown';
        const itemTitle = item.title || 'Unknown';
        const rowId = `item-${orderId}-${i}`;
        
        // Extract PigStyle ID
        const pigstyleId = extractPigstyleIdFromItem(item);
        const pigstyleDisplay = pigstyleId ? `#${pigstyleId}` : '—';
        
        // Determine record status
        const statusId = item.record_status_id; // from backend
        const isActive = (statusId === 2); // only status_id = 2 means "Active"
        
        // Build the action column
        let actionHtml = '';
        if (!pigstyleId) {
            actionHtml = `<span style="font-size: 12px; color: #999;">No ID</span>`;
        } else if (isActive) {
            // Show clickable "Mark Sold" button
            actionHtml = `
                <button class="btn btn-sm btn-success mark-sold-btn" 
                        data-record-id="${pigstyleId}"
                        data-sale-price="${itemPrice}"
                        data-order-id="${escapeHtml(orderId)}"
                        data-artist="${escapeHtml(itemArtist)}"
                        data-title="${escapeHtml(itemTitle)}"
                        style="padding: 4px 12px; font-size: 12px; white-space: nowrap;">
                    <i class="fas fa-check-circle"></i> Mark Sold
                </button>
            `;
        } else {
            // Not active – show status label
            let label = 'Inactive';
            if (statusId === 3) label = 'Sold';
            else if (statusId === 4) label = 'Sold on Discogs';
            else if (statusId === 1) label = 'New';
            else if (statusId === null || statusId === undefined) label = 'Unknown';
            actionHtml = `<span style="font-size: 12px; color: #999;">${label}</span>`;
        }
        
        html += `
            <tr style="border-bottom: 1px solid #eee;" id="${rowId}">
                <td style="padding: 8px;">${escapeHtml(itemArtist)}</td>
                <td style="padding: 8px;">${escapeHtml(itemTitle)}</td>
                <td style="padding: 8px; text-align: center; font-weight: bold; color: #007bff;">${pigstyleDisplay}</td>
                <td style="padding: 8px; font-size: 12px;">${escapeHtml(item.media_condition || '—')}</td>
                <td style="padding: 8px; text-align: right; font-weight: 600;">${itemCurrency} ${itemPrice.toFixed(2)}</td>
                <td style="padding: 8px; text-align: center;">${item.quantity || 1}</td>
                <td style="padding: 8px; text-align: center;">
                    ${actionHtml}
                </td>
            </tr>
        `;
    }
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    if (order.shipping_address) {
        html += `
            <div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 15px;">
                <div style="font-weight: 600; margin-bottom: 5px;">Shipping Address</div>
                <div style="font-size: 14px; color: #333;">${escapeHtml(order.shipping_address)}</div>
                <div style="font-size: 13px; color: #666; margin-top: 5px;">Method: ${escapeHtml(order.shipping_method || '—')}</div>
            </div>
        `;
    }
    
    if (order.buyer_message) {
        html += `
            <div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 15px;">
                <div style="font-weight: 600; margin-bottom: 5px;">Buyer Message</div>
                <div style="font-size: 14px; color: #333; background: #f8f9fa; padding: 10px; border-radius: 4px;">${escapeHtml(order.buyer_message)}</div>
            </div>
        `;
    }
    
    content.innerHTML = html;
    
    // Attach click event listeners to all "Mark Sold" buttons
    const buttons = content.querySelectorAll('.mark-sold-btn');
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const recordId = parseInt(this.dataset.recordId);
            const salePrice = parseFloat(this.dataset.salePrice);
            const orderId = this.dataset.orderId;
            const artist = this.dataset.artist;
            const title = this.dataset.title;
            const rowElement = this.closest('tr');
            
            if (!recordId || isNaN(salePrice)) {
                showToast('Invalid record ID or price.', 'error');
                return;
            }
            
            // Confirm before proceeding
            if (!confirm(`Mark "${artist} - ${title}" as sold for $${salePrice.toFixed(2)}?`)) {
                return;
            }
            
            markRecordSold(recordId, salePrice, orderId, artist, title, this, rowElement);
        });
    });
}

// ============================================================================
// Toast Notification
// ============================================================================

function showToast(message, type) {
    // Create toast container if it doesn't exist
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 100000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 400px;
        `;
        document.body.appendChild(container);
    }
    
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${colors[type] || colors.info};
        color: ${type === 'warning' ? '#333' : 'white'};
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-size: 14px;
        animation: slideInRight 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 500);
    }, 4000);
}

// ============================================================================
// Close Order Modal
// ============================================================================

function closeDiscogsOrderModal() {
    const modal = document.getElementById('discogs-order-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return dateStr;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateStatusMessage(message, type) {
    if (!ordersStatusMessage) return;
    
    type = type || 'info';
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    
    ordersStatusMessage.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
    ordersStatusMessage.className = `status-message status-${type}`;
    ordersStatusMessage.style.display = 'block';
    
    setTimeout(function() {
        if (ordersStatusMessage) {
            ordersStatusMessage.style.display = 'none';
        }
    }, 8000);
}

// ============================================================================
// Tab Activation Handler
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    console.log('📦 tabChanged event received:', e.detail);
    if (e.detail && e.detail.tabName === 'discogs-orders') {
        console.log('📦 Discogs Orders tab activated');
        setTimeout(function() {
            console.log('📦 Calling initDiscogsOrdersTab after delay');
            initDiscogsOrdersTab();
        }, 100);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 DOMContentLoaded fired');
    const ordersTab = document.querySelector('.tab[data-tab="discogs-orders"]');
    console.log('📦 Orders tab element:', ordersTab);
    if (ordersTab) {
        console.log('📦 Orders tab classes:', ordersTab.className);
        if (ordersTab.classList.contains('active')) {
            console.log('📦 Orders tab is active, initializing');
            setTimeout(initDiscogsOrdersTab, 200);
        } else {
            console.log('📦 Orders tab is not active, waiting for tab change');
        }
    } else {
        console.error('❌ Orders tab element not found!');
    }
});

// Add CSS animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    .mark-sold-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }
`;
document.head.appendChild(styleSheet);

console.log('✅ discogs-orders.js loaded (with status check)');