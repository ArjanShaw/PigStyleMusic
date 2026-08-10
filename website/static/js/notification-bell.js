// ============================================================================
// notification-bell.js - Unified Notification Bell
// ============================================================================

(function() {
    'use strict';

    console.log('🔔 notification-bell.js loading...');

    // ========== DOM Elements ==========
    let bellContainer = null;
    let bellButton = null;
    let bellBadge = null;
    let bellDropdown = null;

    // ========== State ==========
    let isOpen = false;
    let unreadCount = 0;
    let notificationInterval = null;
    let initialized = false;
    let notifications = [];

    // ========== Configuration ==========
    const POLL_INTERVAL = 30000; // 30 seconds

    // ========== Initialize ==========
    function initNotificationBell() {
        console.log('🔔 Initializing notification bell...');
        
        if (initialized) {
            console.log('🔔 Notification bell already initialized');
            return;
        }

        // Create bell container
        bellContainer = document.createElement('div');
        bellContainer.id = 'notification-bell-container';
        bellContainer.className = 'notification-bell-container';
        bellContainer.style.cssText = `
            position: relative;
            display: inline-block;
            margin-left: 15px;
            cursor: pointer;
        `;

        // Create bell button
        bellButton = document.createElement('button');
        bellButton.id = 'notification-bell-button';
        bellButton.className = 'notification-bell-button';
        bellButton.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            padding: 5px 8px;
            position: relative;
            transition: color 0.2s;
        `;
        bellButton.innerHTML = '<i class="fas fa-bell"></i>';
        bellButton.setAttribute('aria-label', 'Notifications');
        bellButton.title = 'Notifications';

        // Create badge
        bellBadge = document.createElement('span');
        bellBadge.id = 'notification-bell-badge';
        bellBadge.className = 'notification-bell-badge';
        bellBadge.style.cssText = `
            position: absolute;
            top: -5px;
            right: -5px;
            background: #ff6b6b;
            color: white;
            border-radius: 50%;
            padding: 2px 6px;
            font-size: 10px;
            font-weight: 600;
            min-width: 18px;
            text-align: center;
            display: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        bellBadge.textContent = '0';

        // Create dropdown
        bellDropdown = document.createElement('div');
        bellDropdown.id = 'notification-bell-dropdown';
        bellDropdown.className = 'notification-bell-dropdown';
        bellDropdown.style.cssText = `
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 10px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.2);
            width: 380px;
            max-height: 450px;
            overflow: hidden;
            display: none;
            z-index: 9999;
            border: 1px solid rgba(0,0,0,0.05);
        `;

        // Dropdown header
        const dropdownHeader = document.createElement('div');
        dropdownHeader.style.cssText = `
            padding: 15px 20px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8f9fa;
        `;
        dropdownHeader.innerHTML = `
            <span style="font-weight: 600; color: #333; font-size: 14px;">
                <i class="fas fa-bell" style="color: #ff6b6b;"></i> Notifications
            </span>
            <button id="notification-mark-all-read" style="
                background: none;
                border: none;
                color: #007bff;
                font-size: 12px;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
            ">Mark all as read</button>
        `;
        bellDropdown.appendChild(dropdownHeader);

        // Dropdown list container
        const dropdownList = document.createElement('div');
        dropdownList.id = 'notification-bell-list';
        dropdownList.style.cssText = `
            max-height: 350px;
            overflow-y: auto;
            padding: 5px 0;
        `;
        bellDropdown.appendChild(dropdownList);

        // Dropdown footer
        const dropdownFooter = document.createElement('div');
        dropdownFooter.style.cssText = `
            padding: 10px 20px;
            border-top: 1px solid #eee;
            text-align: center;
            background: #f8f9fa;
        `;
        dropdownFooter.innerHTML = `
            <a href="/admin#record-orders" style="
                color: #666;
                text-decoration: none;
                font-size: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
            ">
                <i class="fas fa-cog"></i> Manage notifications
            </a>
        `;
        bellDropdown.appendChild(dropdownFooter);

        // Assemble
        bellContainer.appendChild(bellButton);
        bellContainer.appendChild(bellBadge);
        bellContainer.appendChild(bellDropdown);
        
        // Find where to insert - look for navbar-right or auth-section
        const navbar = document.querySelector('nav > div');
        if (navbar) {
            navbar.appendChild(bellContainer);
            console.log('✅ Notification bell added to navbar');
        } else {
            // Fallback: add to body
            document.body.appendChild(bellContainer);
            console.log('⚠️ Navbar not found, notification bell added to body');
        }

        // Event listeners
        bellButton.addEventListener('click', toggleDropdown);
        document.addEventListener('click', closeDropdownOnOutsideClick);
        document.getElementById('notification-mark-all-read')?.addEventListener('click', markAllRead);

        // Start polling
        startPolling();

        // Initial load
        loadNotifications();

        initialized = true;
        console.log('✅ Notification bell initialized');
    }

    // ========== Toggle Dropdown ==========
    function toggleDropdown(event) {
        event.stopPropagation();
        isOpen = !isOpen;
        bellDropdown.style.display = isOpen ? 'block' : 'none';
        
        if (isOpen) {
            loadNotifications();
        }
    }

    function closeDropdownOnOutsideClick(event) {
        if (bellContainer && !bellContainer.contains(event.target)) {
            isOpen = false;
            bellDropdown.style.display = 'none';
        }
    }

    // ========== Load Notifications ==========
    async function loadNotifications() {
        try {
            const [feedback, subscriptions, orders] = await Promise.all([
                getUnreadFeedback(),
                getUnreadSubscriptions(),
                getUnreadOrders()
            ]);
            
            notifications = [];
            
            // Format feedback notifications
            feedback.forEach(item => {
                notifications.push({
                    id: item.id,
                    type: 'feedback',
                    title: '📝 New Feedback',
                    message: item.content ? item.content.substring(0, 100) : 'New feedback received',
                    created_at: item.created_at,
                    link: '/admin#record-orders',  // FIXED: goes to Record Orders tab
                    markRead: () => markFeedbackRead(item.id)
                });
            });
            
            // Format subscription notifications
            subscriptions.forEach(item => {
                notifications.push({
                    id: item.id,
                    type: 'subscription',
                    title: '🔔 New Record Alert',
                    message: `${item.email} wants "${item.artist} - ${item.title || 'Any'}"`,
                    created_at: item.created_at,
                    link: '/admin#email-subscriptions',  // FIXED: goes to Email Subscriptions tab
                    markRead: () => markSubscriptionRead(item.id)
                });
            });
            
            // Format order notifications
            orders.forEach(item => {
                notifications.push({
                    id: item.id,
                    type: 'order',
                    title: '🛒 New Order!',
                    message: `Order #${item.order_number} - ${item.customer_name} - $${parseFloat(item.total).toFixed(2)}`,
                    created_at: item.created_at,
                    link: `/admin#record-orders`,  // FIXED: goes to Record Orders tab
                    markRead: () => markOrderRead(item.id)
                });
            });
            
            // Sort by created_at desc (newest first)
            notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            renderNotifications(notifications);
            
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    // ========== Render Notifications ==========
    function renderNotifications(notifications) {
        const list = document.getElementById('notification-bell-list');
        if (!list) return;

        const totalUnread = notifications.length;
        updateBadge(totalUnread);

        if (notifications.length === 0) {
            list.innerHTML = `
                <div style="
                    text-align: center;
                    padding: 40px 20px;
                    color: #999;
                ">
                    <i class="fas fa-check-circle" style="font-size: 32px; display: block; margin-bottom: 10px; color: #28a745;"></i>
                    <p style="margin: 0; font-size: 14px;">All caught up!</p>
                    <p style="margin: 5px 0 0; font-size: 12px;">No new notifications</p>
                </div>
            `;
            return;
        }

        let html = '';
        notifications.forEach(item => {
            html += `
                <div class="notification-item" data-id="${item.id}" data-type="${item.type}" style="
                    padding: 12px 16px;
                    border-bottom: 1px solid #f0f0f0;
                    cursor: pointer;
                    transition: background 0.2s;
                    ${item.isNew ? 'background: #f0f7ff;' : ''}
                " onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='${item.isNew ? '#f0f7ff' : 'white'}'">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 600; font-size: 13px; color: #333; margin-bottom: 2px;">
                                ${item.title}
                            </div>
                            <div style="font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${escapeHtml(item.message)}
                            </div>
                            <div style="font-size: 10px; color: #999; margin-top: 4px;">
                                ${formatTime(item.created_at)}
                            </div>
                        </div>
                        <button class="notification-mark-read" data-id="${item.id}" data-type="${item.type}" style="
                            background: none;
                            border: none;
                            color: #007bff;
                            font-size: 12px;
                            cursor: pointer;
                            padding: 2px 6px;
                            border-radius: 4px;
                            flex-shrink: 0;
                        ">✕</button>
                    </div>
                </div>
            `;
        });

        list.innerHTML = html;

        // Event listeners for mark read buttons
        list.querySelectorAll('.notification-mark-read').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                const type = this.dataset.type;
                markNotificationRead(id, type);
            });
        });

        // Click on notification item - goes to the link
        list.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', function() {
                const id = this.dataset.id;
                const type = this.dataset.type;
                const notification = notifications.find(n => n.id == id);
                if (notification && notification.link) {
                    window.location.href = notification.link;
                }
            });
        });
    }

    // ========== Mark Notification Read ==========
    async function markNotificationRead(id, type) {
        let success = false;
        
        if (type === 'feedback') {
            success = await markFeedbackRead(id);
        } else if (type === 'subscription') {
            success = await markSubscriptionRead(id);
        } else if (type === 'order') {
            success = await markOrderRead(id);
        }
        
        if (success) {
            loadNotifications();
            updateTotalCount();
        }
    }

    // ========== API Calls ==========
    async function getUnreadFeedback() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/feedback/unread`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            return data.notifications || [];
        } catch (error) {
            console.error('Error fetching unread feedback:', error);
            return [];
        }
    }

    async function getUnreadSubscriptions() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/subscriptions/notifications`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            return data.notifications || [];
        } catch (error) {
            console.error('Error fetching unread subscriptions:', error);
            return [];
        }
    }

    async function getUnreadOrders() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/orders/unread`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status === 'success') {
                return data.orders || [];
            }
            return [];
        } catch (error) {
            console.error('Error fetching unread orders:', error);
            return [];
        }
    }

    async function getUnreadOrdersCount() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/orders/unread-count`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            return data.count || 0;
        } catch (error) {
            console.error('Error fetching unread orders count:', error);
            return 0;
        }
    }

    async function getUnreadFeedbackCount() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/feedback/unread-count`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            return data.count || 0;
        } catch (error) {
            console.error('Error fetching unread feedback count:', error);
            return 0;
        }
    }

    async function getUnreadSubscriptionCount() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/subscriptions/notifications/count`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            return data.count || 0;
        } catch (error) {
            console.error('Error fetching unread subscriptions count:', error);
            return 0;
        }
    }

    async function markFeedbackRead(id) {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/feedback/${id}/mark-read`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            return response.ok;
        } catch (error) {
            console.error('Error marking feedback read:', error);
            return false;
        }
    }

    async function markSubscriptionRead(id) {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/subscriptions/${id}/mark-read`, {
                method: 'PUT',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mark_read: true })
            });
            return response.ok;
        } catch (error) {
            console.error('Error marking subscription read:', error);
            return false;
        }
    }

    async function markOrderRead(id) {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/orders/${id}/mark-read`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            return response.ok;
        } catch (error) {
            console.error('Error marking order read:', error);
            return false;
        }
    }

    // ========== Update Badge ==========
    function updateBadge(count) {
        unreadCount = count;
        if (bellBadge) {
            if (count > 0) {
                bellBadge.textContent = count > 99 ? '99+' : count;
                bellBadge.style.display = 'block';
            } else {
                bellBadge.style.display = 'none';
            }
        }
    }

    async function updateTotalCount() {
        try {
            const [feedbackCount, subscriptionCount, orderCount] = await Promise.all([
                getUnreadFeedbackCount(),
                getUnreadSubscriptionCount(),
                getUnreadOrdersCount()
            ]);
            const total = feedbackCount + subscriptionCount + orderCount;
            updateBadge(total);
        } catch (error) {
            console.error('Error updating total count:', error);
        }
    }

    // ========== Mark All Read ==========
    async function markAllRead() {
        // Mark all feedback as read
        try {
            const feedbackResponse = await fetch(`${AppConfig.baseUrl}/api/feedback/mark-all-read`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            if (!feedbackResponse.ok) {
                console.error('Failed to mark all feedback as read');
            }
        } catch (error) {
            console.error('Error marking all feedback as read:', error);
        }

        // Mark all subscriptions as read
        try {
            const subResponse = await fetch(`${AppConfig.baseUrl}/api/subscriptions/mark-all-read`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            if (!subResponse.ok) {
                console.error('Failed to mark all subscriptions as read');
            }
        } catch (error) {
            console.error('Error marking all subscriptions as read:', error);
        }

        // Mark all orders as read
        try {
            const orderResponse = await fetch(`${AppConfig.baseUrl}/api/orders/mark-all-read`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            if (!orderResponse.ok) {
                console.error('Failed to mark all orders as read');
            }
        } catch (error) {
            console.error('Error marking all orders as read:', error);
        }

        // Reload notifications
        updateTotalCount();
        loadNotifications();
    }

    // ========== Polling ==========
    function startPolling() {
        if (notificationInterval) {
            clearInterval(notificationInterval);
        }
        notificationInterval = setInterval(() => {
            updateTotalCount();
        }, POLL_INTERVAL);
        console.log(`🔔 Notification polling started (${POLL_INTERVAL/1000}s interval)`);
    }

    function stopPolling() {
        if (notificationInterval) {
            clearInterval(notificationInterval);
            notificationInterval = null;
            console.log('🔔 Notification polling stopped');
        }
    }

    // ========== Utility Functions ==========
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
        if (diff < 172800000) return 'Yesterday';
        return date.toLocaleDateString();
    }

    // ========== Expose Functions ==========
    window.notificationBell = {
        init: initNotificationBell,
        loadNotifications: loadNotifications,
        updateTotalCount: updateTotalCount,
        startPolling: startPolling,
        stopPolling: stopPolling
    };

    // Auto-initialize on DOM ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initNotificationBell, 500);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initNotificationBell, 500);
        });
    }

    // Also check for navbar after load
    document.addEventListener('DOMContentLoaded', function() {
        // Check if navbar is loaded dynamically
        const observer = new MutationObserver(function(mutations) {
            const navbar = document.querySelector('nav > div');
            if (navbar && !initialized) {
                console.log('🔔 Navbar detected, initializing notification bell...');
                initNotificationBell();
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        
        // Also try after a delay
        setTimeout(function() {
            if (!initialized) {
                const navbar = document.querySelector('nav > div');
                if (navbar) {
                    console.log('🔔 Navbar found after delay, initializing...');
                    initNotificationBell();
                }
            }
        }, 2000);
    });

    console.log('✅ notification-bell.js loaded');
})();