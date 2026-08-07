// static/js/notification-bell.js
// Shared notification bell functionality for all pages

function initNotificationBell() {
    const notificationContainer = document.getElementById('navbar-notification-container');
    const notificationBadge = document.getElementById('navbar-notification-badge');
    const notificationBtn = document.getElementById('navbar-notification-btn');
    
    if (!notificationContainer || !notificationBtn) {
        console.warn('Notification bell elements not found');
        return;
    }

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

    async function checkNotifications() {
        try {
            if (notificationContainer.classList.contains('hidden')) {
                return;
            }
            
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const apiUrl = isLocalhost 
                ? 'http://localhost:5000/api/subscriptions/notifications/count'
                : `https://${window.location.hostname}/api/subscriptions/notifications/count`;
            
            const response = await fetch(apiUrl, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) return;
            
            const data = await response.json();
            
            if (data.status === 'success' && data.count > 0) {
                if (notificationBadge) {
                    notificationBadge.textContent = data.count > 99 ? '99+' : data.count;
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

    async function loadNotifications() {
        try {
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const apiUrl = isLocalhost 
                ? 'http://localhost:5000/api/subscriptions/notifications'
                : `https://${window.location.hostname}/api/subscriptions/notifications`;
            
            const response = await fetch(apiUrl, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) return;
            
            const data = await response.json();
            const list = document.getElementById('navbar-notification-list');
            
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

    window.markNotificationRead = async function(id) {
        try {
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const apiUrl = isLocalhost 
                ? `http://localhost:5000/api/subscriptions/${id}`
                : `https://${window.location.hostname}/api/subscriptions/${id}`;
            
            await fetch(apiUrl, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ mark_read: true })
            });
            
            loadNotifications();
            checkNotifications();
        } catch (error) {
            console.error('Error marking notification read:', error);
        }
    };

    window.markAllNotificationsRead = async function() {
        try {
            const items = document.querySelectorAll('.navbar-notification-item.unread');
            const ids = [];
            items.forEach(item => {
                const id = parseInt(item.dataset.id);
                if (id) ids.push(id);
            });
            
            if (ids.length === 0) return;
            
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            for (const id of ids) {
                const apiUrl = isLocalhost 
                    ? `http://localhost:5000/api/subscriptions/${id}`
                    : `https://${window.location.hostname}/api/subscriptions/${id}`;
                
                await fetch(apiUrl, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ mark_read: true })
                });
            }
            
            loadNotifications();
            checkNotifications();
        } catch (error) {
            console.error('Error marking all notifications read:', error);
        }
    };

    window.toggleNotificationDropdown = function() {
        const dropdown = document.getElementById('navbar-notification-dropdown');
        if (dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
        } else {
            dropdown.classList.add('show');
            loadNotifications();
        }
    };

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