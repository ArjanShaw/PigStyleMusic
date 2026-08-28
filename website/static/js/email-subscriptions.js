// ============================================================================
// email-subscriptions.js - Email Subscriptions Management for Admin Panel
// ============================================================================

// ============================================================
// STATE
// ============================================================
const SubscriptionState = {
    subscriptions: [],
    currentPage: 1,
    pageSize: 50,
    totalFiltered: 0,
    filteredSubscriptions: [],
    searchTerm: '',
    statusFilter: 'all',
    isEditing: false,
    editingId: null,
    notificationCount: 0,
    notificationInterval: null,
    lastChecked: null,
    isNotificationPanelOpen: false,
    notifications: [],
};

// ============================================================
// INITIALIZATION
// ============================================================
function initEmailSubscriptionsTab() {
    console.log('🔵 initEmailSubscriptionsTab called');
    
    // Load initial data
    loadSubscriptions();
    loadNotificationCount();
    setupSubscriptionEventListeners();
    startNotificationPolling();
    
    console.log('✅ initEmailSubscriptionsTab complete');
}

// ============================================================
// LOAD FUNCTIONS
// ============================================================

function loadSubscriptions() {
    const searchParams = new URLSearchParams();
    if (SubscriptionState.searchTerm) {
        searchParams.append('search', SubscriptionState.searchTerm);
    }
    
    const url = `${AppConfig.baseUrl}/api/subscriptions?${searchParams.toString()}`;
    
    fetch(url, {
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            SubscriptionState.subscriptions = data.subscriptions || [];
            applyFilters();
            renderSubscriptions();
            updateStats();
        } else {
            showSubscriptionStatus('Error loading subscriptions: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(err => {
        console.error('Error loading subscriptions:', err);
        showSubscriptionStatus('Error loading subscriptions: ' + err.message, 'error');
    });
}

function loadNotificationCount() {
    fetch(`${AppConfig.baseUrl}/api/subscriptions/notifications/count`, {
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            SubscriptionState.notificationCount = data.count || 0;
            updateNotificationBadge();
        }
    })
    .catch(err => console.error('Error loading notification count:', err));
}

function loadNotifications() {
    fetch(`${AppConfig.baseUrl}/api/subscriptions/notifications`, {
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            SubscriptionState.notifications = data.notifications || [];
            renderNotificationPanel();
        }
    })
    .catch(err => console.error('Error loading notifications:', err));
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================

function renderSubscriptions() {
    const tbody = document.getElementById('subscriptions-body');
    const start = (SubscriptionState.currentPage - 1) * SubscriptionState.pageSize;
    const end = start + SubscriptionState.pageSize;
    const pageData = SubscriptionState.filteredSubscriptions.slice(start, end);
    
    if (!pageData || pageData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;padding:40px;">
                    <i class="fas fa-envelope" style="font-size: 48px; color: #ccc; display: block; margin-bottom: 15px;"></i>
                    ${SubscriptionState.searchTerm ? 'No subscriptions match your search.' : 'No subscriptions found.'}
                </td>
            </tr>
        `;
        updatePaginationInfo(0);
        return;
    }
    
    let html = '';
    pageData.forEach((sub, index) => {
        const statusClass = sub.is_active ? 'active' : 'inactive';
        const statusText = sub.is_active ? 'Active' : 'Inactive';
        const createdDate = sub.created_at ? new Date(sub.created_at).toLocaleDateString() : 'N/A';
        
        // Check if this is a new subscription (for highlighting)
        const isNew = sub.is_new || false;
        const rowClass = isNew ? 'subscription-new' : '';
        
        html += `
            <tr class="${rowClass}" data-id="${sub.id}">
                <td>${start + index + 1}</td>
                <td><strong>${escapeHtml(sub.email)}</strong></td>
                <td>${escapeHtml(sub.artist || '-')}</td>
                <td>${escapeHtml(sub.title || '-')}</td>
                <td>${escapeHtml(sub.catalog_number || '-')}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${createdDate}</td>
                <td>
                    <div class="table-actions">
                        <button class="table-action-btn" onclick="editSubscription(${sub.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="table-action-btn ${sub.is_active ? 'btn-warning' : 'btn-success'}" 
                                onclick="toggleSubscriptionStatus(${sub.id})" 
                                title="${sub.is_active ? 'Deactivate' : 'Activate'}">
                            <i class="fas ${sub.is_active ? 'fa-pause' : 'fa-play'}"></i>
                        </button>
                        <button class="table-action-btn delete-btn" onclick="deleteSubscription(${sub.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    updatePaginationInfo(SubscriptionState.filteredSubscriptions.length);
    
    // Auto-hide new subscription highlights after 5 seconds
    setTimeout(() => {
        document.querySelectorAll('.subscription-new').forEach(row => {
            row.classList.remove('subscription-new');
        });
    }, 5000);
}

function renderNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (!panel) return;
    
    const notifications = SubscriptionState.notifications;
    
    if (!notifications || notifications.length === 0) {
        panel.innerHTML = `
            <div style="text-align:center;padding:30px;color:#999;">
                <i class="fas fa-bell-slash" style="font-size: 32px; display:block; margin-bottom:10px;"></i>
                No new notifications
            </div>
        `;
        return;
    }
    
    let html = '<div class="notification-list">';
    notifications.forEach(notif => {
        const timeAgo = getTimeAgo(notif.created_at);
        html += `
            <div class="notification-item ${notif.is_read ? 'read' : 'unread'}" data-id="${notif.id}">
                <div class="notification-icon">
                    <i class="fas fa-envelope"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-title">New Subscription: ${escapeHtml(notif.email)}</div>
                    <div class="notification-details">
                        ${notif.artist ? `Artist: ${escapeHtml(notif.artist)}` : ''}
                        ${notif.title ? `Title: ${escapeHtml(notif.title)}` : ''}
                        ${notif.catalog_number ? `Catalog: ${escapeHtml(notif.catalog_number)}` : ''}
                    </div>
                    <div class="notification-time">${timeAgo}</div>
                </div>
                <button class="notification-close" onclick="markNotificationRead(${notif.id})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    });
    html += '</div>';
    
    panel.innerHTML = html;
}

function updateStats() {
    const total = SubscriptionState.subscriptions.length;
    const active = SubscriptionState.subscriptions.filter(s => s.is_active).length;
    const inactive = total - active;
    
    // Count new subscriptions today
    const today = new Date().toDateString();
    const newToday = SubscriptionState.subscriptions.filter(s => {
        if (!s.created_at) return false;
        const created = new Date(s.created_at).toDateString();
        return created === today;
    }).length;
    
    document.getElementById('sub-total').textContent = total;
    document.getElementById('sub-active').textContent = active;
    document.getElementById('sub-inactive').textContent = inactive;
    document.getElementById('sub-new-today').textContent = newToday;
}

function updatePaginationInfo(total) {
    const totalPages = Math.ceil(total / SubscriptionState.pageSize) || 1;
    const start = (SubscriptionState.currentPage - 1) * SubscriptionState.pageSize + 1;
    const end = Math.min(start + SubscriptionState.pageSize - 1, total);
    
    document.getElementById('sub-showing-start').textContent = total > 0 ? start : 0;
    document.getElementById('sub-showing-end').textContent = total > 0 ? end : 0;
    document.getElementById('sub-total-filtered').textContent = total;
    document.getElementById('sub-current-page').textContent = SubscriptionState.currentPage;
    document.getElementById('sub-total-pages').textContent = totalPages;
    
    document.getElementById('sub-prev-page').disabled = SubscriptionState.currentPage <= 1;
    document.getElementById('sub-next-page').disabled = SubscriptionState.currentPage >= totalPages;
}

function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    const status = document.getElementById('notification-status');
    
    if (SubscriptionState.notificationCount > 0) {
        badge.style.display = 'block';
        badge.textContent = SubscriptionState.notificationCount > 99 ? '99+' : SubscriptionState.notificationCount;
        if (status) {
            status.textContent = `${SubscriptionState.notificationCount} new alert${SubscriptionState.notificationCount > 1 ? 's' : ''}`;
            status.style.color = '#dc3545';
            status.style.fontWeight = 'bold';
        }
    } else {
        badge.style.display = 'none';
        if (status) {
            status.textContent = 'No new alerts';
            status.style.color = '#28a745';
            status.style.fontWeight = 'normal';
        }
    }
}

// ============================================================
// FILTER FUNCTIONS
// ============================================================

function applyFilters() {
    let filtered = [...SubscriptionState.subscriptions];
    
    // Apply search filter
    if (SubscriptionState.searchTerm) {
        const search = SubscriptionState.searchTerm.toLowerCase();
        filtered = filtered.filter(sub => {
            return (sub.email && sub.email.toLowerCase().includes(search)) ||
                   (sub.artist && sub.artist.toLowerCase().includes(search)) ||
                   (sub.title && sub.title.toLowerCase().includes(search)) ||
                   (sub.catalog_number && sub.catalog_number.toLowerCase().includes(search));
        });
    }
    
    // Apply status filter
    if (SubscriptionState.statusFilter !== 'all') {
        const isActive = SubscriptionState.statusFilter === '1';
        filtered = filtered.filter(sub => sub.is_active === isActive);
    }
    
    SubscriptionState.filteredSubscriptions = filtered;
    SubscriptionState.currentPage = 1;
    renderSubscriptions();
}

function filterSubscriptions() {
    const searchInput = document.getElementById('sub-search-input');
    const statusFilter = document.getElementById('sub-status-filter');
    
    SubscriptionState.searchTerm = searchInput ? searchInput.value.trim() : '';
    SubscriptionState.statusFilter = statusFilter ? statusFilter.value : 'all';
    
    applyFilters();
}

function refreshSubscriptions() {
    loadSubscriptions();
    loadNotificationCount();
}

// ============================================================
// CRUD OPERATIONS
// ============================================================

function showAddSubscriptionModal() {
    SubscriptionState.isEditing = false;
    SubscriptionState.editingId = null;
    
    document.getElementById('sub-modal-title').textContent = '<i class="fas fa-envelope"></i> Add Subscription';
    document.getElementById('sub-edit-id').value = '';
    document.getElementById('sub-email').value = '';
    document.getElementById('sub-artist').value = '';
    document.getElementById('sub-title').value = '';
    document.getElementById('sub-catalog').value = '';
    document.getElementById('sub-status').value = '1';
    document.getElementById('sub-delete-btn').style.display = 'none';
    document.getElementById('sub-modal-status').style.display = 'none';
    
    document.getElementById('subscription-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('sub-email').focus(), 100);
}

function editSubscription(id) {
    const sub = SubscriptionState.subscriptions.find(s => s.id === id);
    if (!sub) {
        showSubscriptionStatus('Subscription not found', 'error');
        return;
    }
    
    SubscriptionState.isEditing = true;
    SubscriptionState.editingId = id;
    
    document.getElementById('sub-modal-title').textContent = '<i class="fas fa-edit"></i> Edit Subscription';
    document.getElementById('sub-edit-id').value = id;
    document.getElementById('sub-email').value = sub.email || '';
    document.getElementById('sub-artist').value = sub.artist || '';
    document.getElementById('sub-title').value = sub.title || '';
    document.getElementById('sub-catalog').value = sub.catalog_number || '';
    document.getElementById('sub-status').value = sub.is_active ? '1' : '0';
    document.getElementById('sub-delete-btn').style.display = 'inline-block';
    document.getElementById('sub-modal-status').style.display = 'none';
    
    document.getElementById('subscription-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('sub-email').focus(), 100);
}

function closeSubscriptionModal() {
    document.getElementById('subscription-modal').style.display = 'none';
    document.getElementById('sub-modal-status').style.display = 'none';
}

function saveSubscription() {
    const id = document.getElementById('sub-edit-id').value;
    const email = document.getElementById('sub-email').value.trim();
    const artist = document.getElementById('sub-artist').value.trim();
    const title = document.getElementById('sub-title').value.trim();
    const catalog = document.getElementById('sub-catalog').value.trim();
    const status = document.getElementById('sub-status').value === '1';
    
    // Validate
    if (!email) {
        showSubscriptionModalStatus('Email is required', 'error');
        return;
    }
    if (!email.includes('@') || !email.includes('.')) {
        showSubscriptionModalStatus('Please enter a valid email address', 'error');
        return;
    }
    if (!artist && !title && !catalog) {
        showSubscriptionModalStatus('At least one search term (artist, title, or catalog number) is required', 'error');
        return;
    }
    
    const data = {
        email: email,
        artist: artist,
        title: title,
        catalog_number: catalog,
        is_active: status
    };
    
    const url = id ? 
        `${AppConfig.baseUrl}/api/subscriptions/${id}` : 
        `${AppConfig.baseUrl}/api/subscribe`;
    const method = id ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            showSubscriptionModalStatus('Subscription saved successfully!', 'success');
            closeSubscriptionModal();
            loadSubscriptions();
            loadNotificationCount();
        } else {
            showSubscriptionModalStatus('Error: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(err => {
        console.error('Error saving subscription:', err);
        showSubscriptionModalStatus('Error saving: ' + err.message, 'error');
    });
}

function toggleSubscriptionStatus(id) {
    const sub = SubscriptionState.subscriptions.find(s => s.id === id);
    if (!sub) {
        showSubscriptionStatus('Subscription not found', 'error');
        return;
    }
    
    const newStatus = !sub.is_active;
    const action = newStatus ? 'activate' : 'deactivate';
    
    if (!confirm(`Are you sure you want to ${action} this subscription for ${sub.email}?`)) {
        return;
    }
    
    const data = {
        is_active: newStatus
    };
    
    fetch(`${AppConfig.baseUrl}/api/subscriptions/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            showSubscriptionStatus(`Subscription ${action}d successfully`, 'success');
            loadSubscriptions();
        } else {
            showSubscriptionStatus('Error: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(err => {
        console.error('Error toggling subscription:', err);
        showSubscriptionStatus('Error: ' + err.message, 'error');
    });
}

function deleteSubscription(id) {
    const sub = SubscriptionState.subscriptions.find(s => s.id === id);
    if (!sub) {
        showSubscriptionStatus('Subscription not found', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to permanently delete the subscription for ${sub.email}? This cannot be undone.`)) {
        return;
    }
    
    fetch(`${AppConfig.baseUrl}/api/subscriptions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            showSubscriptionStatus('Subscription deleted successfully', 'success');
            closeSubscriptionModal();
            loadSubscriptions();
            loadNotificationCount();
        } else {
            showSubscriptionStatus('Error: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(err => {
        console.error('Error deleting subscription:', err);
        showSubscriptionStatus('Error: ' + err.message, 'error');
    });
}

function clearAllSubscriptions() {
    const activeCount = SubscriptionState.subscriptions.filter(s => s.is_active).length;
    if (activeCount === 0) {
        showSubscriptionStatus('No active subscriptions to clear', 'warning');
        return;
    }
    
    if (!confirm(`Are you sure you want to deactivate ALL ${activeCount} active subscriptions? This will not delete them, just deactivate.`)) {
        return;
    }
    
    fetch(`${AppConfig.baseUrl}/api/subscriptions/deactivate-all`, {
        method: 'POST',
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            showSubscriptionStatus(`Deactivated ${data.count || activeCount} subscriptions`, 'success');
            loadSubscriptions();
        } else {
            showSubscriptionStatus('Error: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(err => {
        console.error('Error clearing subscriptions:', err);
        showSubscriptionStatus('Error: ' + err.message, 'error');
    });
}

// ============================================================
// NOTIFICATION FUNCTIONS
// ============================================================

function toggleSubscriptionNotifications() {
    SubscriptionState.isNotificationPanelOpen = !SubscriptionState.isNotificationPanelOpen;
    
    if (SubscriptionState.isNotificationPanelOpen) {
        loadNotifications();
        document.getElementById('notification-panel').style.display = 'block';
        // Mark notifications as read when panel is opened
        markAllNotificationsRead();
    } else {
        document.getElementById('notification-panel').style.display = 'none';
    }
}

function markNotificationRead(id) {
    fetch(`${AppConfig.baseUrl}/api/subscriptions/notifications/${id}/read`, {
        method: 'POST',
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            // Remove from notifications list
            SubscriptionState.notifications = SubscriptionState.notifications.filter(n => n.id !== id);
            renderNotificationPanel();
            loadNotificationCount();
        }
    })
    .catch(err => console.error('Error marking notification read:', err));
}

function markAllNotificationsRead() {
    fetch(`${AppConfig.baseUrl}/api/subscriptions/notifications/mark-all-read`, {
        method: 'POST',
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            SubscriptionState.notifications = [];
            renderNotificationPanel();
            loadNotificationCount();
        }
    })
    .catch(err => console.error('Error marking all notifications read:', err));
}

function startNotificationPolling() {
    // Check for new notifications every 30 seconds
    if (SubscriptionState.notificationInterval) {
        clearInterval(SubscriptionState.notificationInterval);
    }
    
    SubscriptionState.notificationInterval = setInterval(() => {
        loadNotificationCount();
        // If notification panel is open, refresh notifications
        if (SubscriptionState.isNotificationPanelOpen) {
            loadNotifications();
        }
    }, 30000);
}

function stopNotificationPolling() {
    if (SubscriptionState.notificationInterval) {
        clearInterval(SubscriptionState.notificationInterval);
        SubscriptionState.notificationInterval = null;
    }
}

// ============================================================
// PAGINATION
// ============================================================

function changeSubPage(delta) {
    const totalPages = Math.ceil(SubscriptionState.filteredSubscriptions.length / SubscriptionState.pageSize) || 1;
    const newPage = SubscriptionState.currentPage + delta;
    
    if (newPage < 1 || newPage > totalPages) return;
    
    SubscriptionState.currentPage = newPage;
    renderSubscriptions();
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function showSubscriptionStatus(message, type) {
    const statusEl = document.getElementById('subscription-status-message');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

function showSubscriptionModalStatus(message, type) {
    const statusEl = document.getElementById('sub-modal-status');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
}

// ============================================================
// ADMIN NAVBAR BELL - ALWAYS VISIBLE
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔔 Initializing admin navbar bell...');
    
    const btn = document.getElementById('navbar-notification-btn');
    const badge = document.getElementById('navbar-notification-badge');
    const dropdown = document.getElementById('navbar-notification-dropdown');
    const list = document.getElementById('navbar-notification-list');
    const markAllBtn = document.getElementById('navbar-mark-all-read');
    
    if (!btn) {
        console.log('No navbar bell found - skipping');
        return;
    }
    
    console.log('✅ Navbar bell found - initializing');
    
    // Show badge with count
    function updateBadge(count) {
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
    
    // Check for notifications
    function checkNotifications() {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const apiUrl = isLocalhost 
            ? window.AppConfig ? window.AppConfig.baseUrl + '/api/subscriptions/notifications/count'
            : `https://${window.location.hostname}/api/subscriptions/notifications/count`;
        
        fetch(apiUrl, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        })
        .then(res => {
            if (!res.ok) throw new Error('API error');
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                updateBadge(data.count || 0);
                // Also update tab badge if it exists
                const tabBadge = document.getElementById('notification-badge');
                if (tabBadge) {
                    if (data.count > 0) {
                        tabBadge.style.display = 'block';
                        tabBadge.textContent = data.count > 99 ? '99+' : data.count;
                    } else {
                        tabBadge.style.display = 'none';
                    }
                }
                const status = document.getElementById('notification-status');
                if (status) {
                    if (data.count > 0) {
                        status.textContent = `${data.count} new alert${data.count > 1 ? 's' : ''}`;
                        status.style.color = '#dc3545';
                        status.style.fontWeight = 'bold';
                    } else {
                        status.textContent = 'No new alerts';
                        status.style.color = '#28a745';
                        status.style.fontWeight = 'normal';
                    }
                }
            }
        })
        .catch(err => console.error('Error checking notifications:', err));
    }
    
    // Load notifications for dropdown
    function loadNotifications() {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const apiUrl = isLocalhost 
            ? window.AppConfig ? window.AppConfig.baseUrl + '/api/subscriptions/notifications'
            : `https://${window.location.hostname}/api/subscriptions/notifications`;
        
        fetch(apiUrl, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        })
        .then(res => res.json())
        .then(data => {
            if (!list) return;
            
            if (data.status === 'success' && data.notifications && data.notifications.length > 0) {
                let html = '';
                data.notifications.forEach(n => {
                    const timeAgo = getTimeAgo(n.created_at);
                    html += `
                        <div class="navbar-notification-item unread" data-id="${n.id}">
                            <div class="navbar-notification-icon">
                                <i class="fas fa-envelope"></i>
                            </div>
                            <div class="navbar-notification-content">
                                <div class="navbar-notification-email">${escapeHtml(n.email)}</div>
                                <div class="navbar-notification-details">
                                    ${n.artist ? `Artist: ${escapeHtml(n.artist)}` : ''}
                                    ${n.title ? `Title: ${escapeHtml(n.title)}` : ''}
                                    ${n.catalog_number ? `Catalog: ${escapeHtml(n.catalog_number)}` : ''}
                                </div>
                                <div class="navbar-notification-time">${timeAgo}</div>
                            </div>
                            <button class="navbar-notification-mark-read" onclick="markNotificationRead(${n.id})">Mark Read</button>
                        </div>
                    `;
                });
                list.innerHTML = html;
            } else {
                list.innerHTML = `
                    <div style="padding: 30px 20px; color: #999; text-align: center; font-size: 14px;">
                        <i class="fas fa-bell-slash" style="font-size: 28px; display: block; margin-bottom: 10px; color: #ddd;"></i>
                        No new notifications
                    </div>
                `;
            }
        })
        .catch(err => console.error('Error loading notifications:', err));
    }
    
    // Mark notification as read
    window.markNotificationRead = function(id) {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const apiUrl = isLocalhost 
            ? `http://localhost:5000/api/subscriptions/${id}`
            : `https://${window.location.hostname}/api/subscriptions/${id}`;
        
        fetch(apiUrl, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ mark_read: true })
        })
        .then(() => {
            loadNotifications();
            checkNotifications();
        })
        .catch(err => console.error('Error marking notification read:', err));
    };
    
    // Mark all notifications as read
    window.markAllNotificationsRead = function() {
        const items = document.querySelectorAll('.navbar-notification-item.unread');
        const ids = [];
        items.forEach(item => {
            const id = parseInt(item.dataset.id);
            if (id) ids.push(id);
        });
        
        if (ids.length === 0) {
            // Also close dropdown if open
            if (dropdown) dropdown.style.display = 'none';
            return;
        }
        
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        Promise.all(ids.map(id => {
            const apiUrl = isLocalhost 
                ? `http://localhost:5000/api/subscriptions/${id}`
                : `https://${window.location.hostname}/api/subscriptions/${id}`;
            return fetch(apiUrl, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ mark_read: true })
            });
        }))
        .then(() => {
            loadNotifications();
            checkNotifications();
            if (dropdown) dropdown.style.display = 'none';
        })
        .catch(err => console.error('Error marking all notifications read:', err));
    };
    
    // Toggle dropdown
    function toggleDropdown(e) {
        if (e) e.stopPropagation();
        if (!dropdown) return;
        
        if (dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
        } else {
            dropdown.style.display = 'block';
            loadNotifications();
        }
    }
    
    // Event listeners
    btn.addEventListener('click', toggleDropdown);
    
    if (markAllBtn) {
        markAllBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.markAllNotificationsRead();
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const container = document.getElementById('navbar-notification-container');
        if (container && !container.contains(e.target)) {
            if (dropdown) dropdown.style.display = 'none';
        }
    });
    
    // Initial check
    checkNotifications();
    
    // Poll every 30 seconds
    setInterval(checkNotifications, 30000);
    
    console.log('✅ Admin navbar bell initialized');
});

// ============================================================
// EXPORT FOR TAB MANAGER
// ============================================================

// Register with TabManager if available
if (typeof window.TabManager !== 'undefined') {
    window.TabManager.registerInitializer('email-subscriptions', function() {
        console.log('🔵 TabManager: Initializing Email Subscriptions tab');
        initEmailSubscriptionsTab();
    });
    
    window.TabManager.registerCleanup('email-subscriptions', function() {
        console.log('🧹 TabManager: Cleaning up Email Subscriptions tab');
        stopNotificationPolling();
    });
}

// Make functions globally accessible
window.initEmailSubscriptionsTab = initEmailSubscriptionsTab;
window.loadSubscriptions = loadSubscriptions;
window.filterSubscriptions = filterSubscriptions;
window.refreshSubscriptions = refreshSubscriptions;
window.showAddSubscriptionModal = showAddSubscriptionModal;
window.editSubscription = editSubscription;
window.closeSubscriptionModal = closeSubscriptionModal;
window.saveSubscription = saveSubscription;
window.toggleSubscriptionStatus = toggleSubscriptionStatus;
window.deleteSubscription = deleteSubscription;
window.clearAllSubscriptions = clearAllSubscriptions;
window.changeSubPage = changeSubPage;
window.toggleSubscriptionNotifications = toggleSubscriptionNotifications;
window.markNotificationRead = markNotificationRead;
window.markAllNotificationsRead = markAllNotificationsRead;

console.log('✅ email-subscriptions.js loaded');