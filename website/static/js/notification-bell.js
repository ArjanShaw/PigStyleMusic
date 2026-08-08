// static/js/notification-bell.js
// Shared notification bell functionality for all pages
// Supports: Subscriptions, Feedback, Orders

// ============================================================
// NOTIFICATION TYPES
// ============================================================
const NOTIFICATION_TYPES = {
    SUBSCRIPTION: 'subscription',
    FEEDBACK: 'feedback',
    ORDER: 'order'
};

// ============================================================
// MAIN INITIALIZATION
// ============================================================

function initNotificationBell() {
    const notificationContainer = document.getElementById('navbar-notification-container');
    const notificationBadge = document.getElementById('navbar-notification-badge');
    const notificationBtn = document.getElementById('navbar-notification-btn');
    
    if (!notificationContainer || !notificationBtn) {
        console.warn('Notification bell elements not found');
        return;
    }

    // ============================================================
    // LOGIN STATUS CHECK
    // ============================================================

    async function checkLoginStatus() {
        try {
            const response = await fetch('/session/check', {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.warn('Session check failed:', response.status);
                return;
            }
            
            const data = await response.json();
            
            if (data.logged_in) {
                notificationContainer.classList.remove('hidden');
                notificationContainer.style.display = 'inline-block';
                checkNotifications();
                if (window.notificationInterval) {
                    clearInterval(window.notificationInterval);
                }
                window.notificationInterval = setInterval(checkNotifications, 30000);
            } else {
                notificationContainer.classList.add('hidden');
                notificationContainer.style.display = 'none';
                if (window.notificationInterval) {
                    clearInterval(window.notificationInterval);
                    window.notificationInterval = null;
                }
                if (notificationBadge) {
                    notificationBadge.style.display = 'none';
                    notificationBadge.classList.remove('show');
                }
            }
        } catch (error) {
            console.error('Error checking login status:', error);
        }
    }

    // ============================================================
    // CHECK NOTIFICATIONS (ALL TYPES)
    // ============================================================

    async function checkNotifications() {
        try {
            if (notificationContainer.classList.contains('hidden')) {
                return;
            }
            
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const baseUrl = isLocalhost ? 'http://localhost:5000' : `https://${window.location.hostname}`;
            
            // Get all unread notification counts from different sources
            const endpoints = [
                { url: `${baseUrl}/api/subscriptions/notifications/count`, type: 'subscription' },
                { url: `${baseUrl}/api/feedback/unread-count`, type: 'feedback' },
                { url: `${baseUrl}/api/record-orders/unread-count`, type: 'order' }
            ];
            
            let totalCount = 0;
            const counts = {};
            
            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint.url, {
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.status === 'success' && data.count > 0) {
                            counts[endpoint.type] = data.count;
                            totalCount += data.count;
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to fetch ${endpoint.type} notifications:`, e);
                }
            }
            
            // Update badge
            if (totalCount > 0) {
                if (notificationBadge) {
                    notificationBadge.textContent = totalCount > 99 ? '99+' : totalCount;
                    notificationBadge.style.display = 'block';
                    notificationBadge.classList.add('show');
                }
                if (notificationBtn) {
                    notificationBtn.classList.add('has-notifications');
                }
            } else {
                if (notificationBadge) {
                    notificationBadge.style.display = 'none';
                    notificationBadge.classList.remove('show');
                }
                if (notificationBtn) {
                    notificationBtn.classList.remove('has-notifications');
                }
            }
        } catch (error) {
            console.error('Error checking notifications:', error);
        }
    }

    // ============================================================
    // LOAD NOTIFICATIONS (ALL TYPES)
    // ============================================================

    async function loadNotifications() {
        try {
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const baseUrl = isLocalhost ? 'http://localhost:5000' : `https://${window.location.hostname}`;
            const list = document.getElementById('navbar-notification-list');
            
            if (!list) return;
            
            // Fetch all types of notifications
            const endpoints = [
                { url: `${baseUrl}/api/subscriptions/notifications`, type: 'subscription', icon: 'fa-envelope', label: 'Record Alert' },
                { url: `${baseUrl}/api/feedback/unread`, type: 'feedback', icon: 'fa-comment', label: 'Feedback' },
                { url: `${baseUrl}/api/record-orders/unread`, type: 'order', icon: 'fa-shopping-cart', label: 'Order' }
            ];
            
            let allNotifications = [];
            
            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint.url, {
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.status === 'success' && data.notifications) {
                            // Add type metadata to each notification
                            const typed = data.notifications.map(n => ({
                                ...n,
                                type: endpoint.type,
                                icon: endpoint.icon,
                                label: endpoint.label
                            }));
                            allNotifications = allNotifications.concat(typed);
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to fetch ${endpoint.type} notifications:`, e);
                }
            }
            
            // Sort by created_at descending (newest first)
            allNotifications.sort((a, b) => {
                return new Date(b.created_at) - new Date(a.created_at);
            });
            
            if (allNotifications.length > 0) {
                let html = '';
                allNotifications.forEach(n => {
                    const timeAgo = getTimeAgo(n.created_at);
                    const iconClass = n.icon || 'fa-bell';
                    const label = n.label || 'Notification';
                    
                    // Build detail text based on type
                    let detailText = '';
                    if (n.type === 'subscription') {
                        const parts = [];
                        if (n.artist) parts.push(`Artist: ${escapeHtml(n.artist)}`);
                        if (n.title) parts.push(`Title: ${escapeHtml(n.title)}`);
                        if (n.catalog_number) parts.push(`Catalog: ${escapeHtml(n.catalog_number)}`);
                        detailText = parts.join(' | ') || 'New subscription';
                    } else if (n.type === 'feedback') {
                        detailText = n.content ? escapeHtml(n.content.substring(0, 100)) : 'New feedback';
                        if (n.content && n.content.length > 100) detailText += '...';
                    } else if (n.type === 'order') {
                        const parts = [];
                        if (n.artist) parts.push(`Artist: ${escapeHtml(n.artist)}`);
                        if (n.title) parts.push(`Title: ${escapeHtml(n.title)}`);
                        detailText = parts.join(' | ') || 'New order request';
                    }
                    
                    const idAttr = n.type === 'subscription' ? `data-subscription-id="${n.id}"` : 
                                   n.type === 'feedback' ? `data-feedback-id="${n.id}"` : 
                                   `data-order-id="${n.id}"`;
                    
                    html += `
                        <div class="navbar-notification-item unread" ${idAttr} data-type="${n.type}">
                            <div class="navbar-notification-icon" style="background: ${getIconColor(n.type)};">
                                <i class="fas ${iconClass}"></i>
                            </div>
                            <div class="navbar-notification-content">
                                <div class="navbar-notification-email">
                                    ${escapeHtml(n.email || 'User')}
                                    <span style="font-weight: normal; font-size: 11px; color: #888; margin-left: 6px;">${label}</span>
                                </div>
                                <div class="navbar-notification-details">${detailText}</div>
                                <div class="navbar-notification-time">${timeAgo}</div>
                            </div>
                            <button class="navbar-notification-mark-read" onclick="markNotificationRead(${n.id}, '${n.type}')">Mark Read</button>
                        </div>
                    `;
                });
                list.innerHTML = html;
            } else {
                list.innerHTML = `
                    <div class="navbar-notification-empty">
                        <i class="fas fa-bell-slash"></i>
                        No new notifications
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    // ============================================================
    // ICON COLOR HELPER
    // ============================================================

    function getIconColor(type) {
        switch(type) {
            case 'subscription': return '#007bff';
            case 'feedback': return '#28a745';
            case 'order': return '#ff6b6b';
            default: return '#6c757d';
        }
    }

    // ============================================================
    // MARK NOTIFICATION READ
    // ============================================================

    window.markNotificationRead = async function(id, type) {
        try {
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const baseUrl = isLocalhost ? 'http://localhost:5000' : `https://${window.location.hostname}`;
            
            let url;
            if (type === 'subscription') {
                url = `${baseUrl}/api/subscriptions/${id}`;
                await fetch(url, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ mark_read: true })
                });
            } else if (type === 'feedback') {
                url = `${baseUrl}/api/feedback/${id}/mark-read`;
                await fetch(url, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
            } else if (type === 'order') {
                url = `${baseUrl}/api/record-orders/${id}/mark-read`;
                await fetch(url, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
            }
            
            loadNotifications();
            checkNotifications();
        } catch (error) {
            console.error('Error marking notification read:', error);
        }
    };

    // ============================================================
    // MARK ALL NOTIFICATIONS READ
    // ============================================================

    window.markAllNotificationsRead = async function() {
        try {
            const items = document.querySelectorAll('.navbar-notification-item.unread');
            
            if (items.length === 0) return;
            
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const baseUrl = isLocalhost ? 'http://localhost:5000' : `https://${window.location.hostname}`;
            
            // Process each notification type separately
            const subscriptionIds = [];
            const feedbackIds = [];
            const orderIds = [];
            
            items.forEach(item => {
                const type = item.dataset.type;
                const id = parseInt(item.dataset.subscriptionId || item.dataset.feedbackId || item.dataset.orderId);
                if (!id) return;
                
                if (type === 'subscription') subscriptionIds.push(id);
                else if (type === 'feedback') feedbackIds.push(id);
                else if (type === 'order') orderIds.push(id);
            });
            
            // Mark each type as read
            for (const id of subscriptionIds) {
                await fetch(`${baseUrl}/api/subscriptions/${id}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ mark_read: true })
                });
            }
            
            for (const id of feedbackIds) {
                await fetch(`${baseUrl}/api/feedback/${id}/mark-read`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
            }
            
            for (const id of orderIds) {
                await fetch(`${baseUrl}/api/record-orders/${id}/mark-read`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
            }
            
            loadNotifications();
            checkNotifications();
        } catch (error) {
            console.error('Error marking all notifications read:', error);
        }
    };

    // ============================================================
    // TOGGLE DROPDOWN
    // ============================================================

    window.toggleNotificationDropdown = function() {
        const dropdown = document.getElementById('navbar-notification-dropdown');
        if (dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
        } else {
            dropdown.classList.add('show');
            loadNotifications();
        }
    };

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    if (notificationBtn) {
        notificationBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleNotificationDropdown();
        });
    }

    document.addEventListener('click', function(e) {
        const container = document.getElementById('navbar-notification-container');
        if (container && !container.contains(e.target)) {
            const dropdown = document.getElementById('navbar-notification-dropdown');
            if (dropdown) {
                dropdown.classList.remove('show');
            }
        }
    });

    const markAllBtn = document.getElementById('navbar-mark-all-read');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.markAllNotificationsRead();
        });
    }

    // ============================================================
    // VISIBILITY MANAGEMENT
    // ============================================================

    function updateBellVisibility() {
        if (typeof Auth !== 'undefined' && Auth.isLoggedIn) {
            notificationContainer.classList.remove('hidden');
            notificationContainer.style.display = 'inline-block';
            checkNotifications();
            
            if (window.notificationInterval) {
                clearInterval(window.notificationInterval);
            }
            window.notificationInterval = setInterval(checkNotifications, 30000);
        } else if (typeof Auth !== 'undefined' && !Auth.isLoggedIn) {
            notificationContainer.classList.add('hidden');
            notificationContainer.style.display = 'none';
            if (window.notificationInterval) {
                clearInterval(window.notificationInterval);
                window.notificationInterval = null;
            }
        } else {
            checkLoginStatus();
        }
    }

    updateBellVisibility();

    document.addEventListener('authStateChanged', function(e) {
        updateBellVisibility();
    });

    let authCheckAttempts = 0;
    const maxAuthChecks = 20;
    const authCheckInterval = setInterval(function() {
        authCheckAttempts++;
        if (typeof Auth !== 'undefined') {
            clearInterval(authCheckInterval);
            updateBellVisibility();
        } else if (authCheckAttempts >= maxAuthChecks) {
            clearInterval(authCheckInterval);
            checkLoginStatus();
        }
    }, 500);

    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            updateBellVisibility();
        }
    });
}

// ============================================================
// HELPER FUNCTIONS (if not defined elsewhere)
// ============================================================

if (typeof getTimeAgo === 'undefined') {
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
}

if (typeof escapeHtml === 'undefined') {
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}