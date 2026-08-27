// Notification Bell - Only shows when backend session is active
(function() {
    'use strict';

    console.log('🔔 Notification bell loading...');

    let bellContainer = null;
    let bellButton = null;
    let bellBadge = null;
    let bellDropdown = null;
    let isOpen = false;
    let unreadCount = 0;
    let notificationInterval = null;
    let initialized = false;
    let notifications = [];
    let backendSessionActive = false;
    let sessionCheckAttempts = 0;
    const MAX_ATTEMPTS = 3;

    const API_BASE = 'http://localhost:5000';
    const POLL_INTERVAL = 30000;

    function getHeaders() {
        return { 'Content-Type': 'application/json' };
    }

    // Check if user is logged in (localStorage check)
    function isLoggedIn() {
        try {
            const userData = localStorage.getItem('pigstyle_user');
            if (userData) {
                const user = JSON.parse(userData);
                return user && user.logged_in === true;
            }
        } catch {}
        return false;
    }

    // Check backend session
    async function checkSession() {
        const response = await fetch(`${API_BASE}/session/check`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            backendSessionActive = data.logged_in === true;
            return backendSessionActive;
    }

    // Initialize bell - only if backend session is active
    async function initNotificationBell() {
        if (initialized) return;

        // Check if user is logged in locally
        if (!isLoggedIn()) {
            console.log('🔔 User not logged in (localStorage), bell hidden');
            return;
        }

        // Check backend session with retries
        let sessionActive = false;
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            sessionActive = await checkSession();
            if (sessionActive) break;
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (!sessionActive) {
            console.log('🔔 No active backend session, bell hidden');
            return;
        }

        initialized = true;
        console.log('🔔 Initializing notification bell...');

        // Find where to insert
        const nav = document.getElementById('menu');
        if (!nav) {
            console.warn('Nav not found, retrying...');
            setTimeout(() => initNotificationBell(), 500);
            return;
        }

        const loginBtn = nav.querySelector('.login-btn');
        if (!loginBtn) {
            console.warn('Login button not found, retrying...');
            setTimeout(() => initNotificationBell(), 500);
            return;
        }

        // Create bell container
        bellContainer = document.createElement('div');
        bellContainer.id = 'notification-bell-container';
        bellContainer.style.cssText = `
            position: relative;
            display: inline-block;
            margin-right: 8px;
            cursor: pointer;
        `;

        // Create bell button
        bellButton = document.createElement('button');
        bellButton.id = 'notification-bell-button';
        bellButton.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            padding: 5px 8px;
            position: relative;
            transition: color 0.2s;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        bellButton.innerHTML = '<i class="fas fa-bell"></i>';
        bellButton.title = 'Notifications';

        // Create badge
        bellBadge = document.createElement('span');
        bellBadge.id = 'notification-bell-badge';
        bellBadge.style.cssText = `
            position: absolute;
            top: 2px;
            right: 2px;
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
            pointer-events: none;
        `;

        // Create dropdown
        bellDropdown = document.createElement('div');
        bellDropdown.id = 'notification-bell-dropdown';
        bellDropdown.style.cssText = `
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 8px;
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
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8f9fa;
        `;
        header.innerHTML = `
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
        bellDropdown.appendChild(header);

        // Dropdown list
        const list = document.createElement('div');
        list.id = 'notification-bell-list';
        list.style.cssText = `
            max-height: 350px;
            overflow-y: auto;
            padding: 5px 0;
        `;
        bellDropdown.appendChild(list);

        // Dropdown footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 8px 16px;
            border-top: 1px solid #eee;
            text-align: center;
            background: #f8f9fa;
        `;
        footer.innerHTML = `
            <span style="color: #999; font-size: 11px;">Notifications from the last 30 days</span>
        `;
        bellDropdown.appendChild(footer);

        // Assemble
        bellContainer.appendChild(bellButton);
        bellContainer.appendChild(bellBadge);
        bellContainer.appendChild(bellDropdown);
        nav.insertBefore(bellContainer, loginBtn);

        // Event listeners
        bellButton.addEventListener('click', toggleDropdown);
        document.addEventListener('click', closeDropdownOnOutsideClick);

        // Mark all read handler
        document.getElementById('notification-mark-all-read')?.addEventListener('click', markAllRead);

        // Start polling
        startPolling();

        // Initial load
        loadNotifications();
        updateTotalCount();

        console.log('✅ Notification bell initialized');
    }

    // Toggle dropdown
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

    // Load notifications
    async function loadNotifications() {
        if (!isLoggedIn() || !backendSessionActive) {
            return;
        }

        try {
            const [feedback, subscriptions] = await Promise.all([
                getUnreadFeedback(),
                getUnreadSubscriptions()
            ]);
            
            notifications = [];

            feedback.forEach(item => {
                notifications.push({
                    id: item.id,
                    type: 'feedback',
                    title: '📝 New Feedback',
                    message: item.content ? item.content.substring(0, 80) : 'New feedback received',
                    created_at: item.created_at,
                    icon: 'fa-comment'
                });
            });

            subscriptions.forEach(item => {
                notifications.push({
                    id: item.id,
                    type: 'subscription',
                    title: '🔔 Record Alert',
                    message: `${item.email} wants "${item.artist || 'Any'}"`,
                    created_at: item.created_at,
                    icon: 'fa-bell'
                });
            });

            notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            renderNotifications(notifications);

        } catch (error) {
            console.debug('🔔 Notification load error:', error.message);
        }
    }

    // Render notifications
    function renderNotifications(notifications) {
        const list = document.getElementById('notification-bell-list');
        if (!list) return;

        const totalUnread = notifications.length;
        updateBadge(totalUnread);

        if (notifications.length === 0) {
            list.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #999;">
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
                    padding: 10px 14px;
                    border-bottom: 1px solid #f0f0f0;
                    cursor: pointer;
                    transition: background 0.2s;
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                " onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                    <div style="font-size: 20px; color: #ff6b6b; margin-top: 2px;">
                        <i class="fas ${item.icon}"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 13px; color: #333; margin-bottom: 2px;">${item.title}</div>
                        <div style="font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.message)}</div>
                        <div style="font-size: 10px; color: #999; margin-top: 4px;">${formatTime(item.created_at)}</div>
                    </div>
                    <button class="notification-mark-read" data-id="${item.id}" data-type="${item.type}" style="
                        background: none;
                        border: none;
                        color: #999;
                        font-size: 14px;
                        cursor: pointer;
                        padding: 2px 6px;
                        flex-shrink: 0;
                    ">×</button>
                </div>
            `;
        });

        list.innerHTML = html;

        list.querySelectorAll('.notification-mark-read').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                const type = this.dataset.type;
                markNotificationRead(id, type);
            });
        });

        list.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', function() {
                const id = this.dataset.id;
                const type = this.dataset.type;
                markNotificationRead(id, type);
            });
        });
    }

    // Mark notification read
    async function markNotificationRead(id, type) {
        let success = false;

        if (type === 'feedback') {
            success = await markFeedbackRead(id);
        } else if (type === 'subscription') {
            success = await markSubscriptionRead(id);
        }

        if (success) {
            loadNotifications();
            updateTotalCount();
        }
    }

    // ===== API Calls =====

    // Feedback
    async function getUnreadFeedback() {
        try {
            const response = await fetch(`${API_BASE}/api/feedback/unread`, {
                credentials: 'include',
                headers: getHeaders()
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.status === 'success' ? data.notifications || [] : [];
        } catch { return []; }
    }

    async function markFeedbackRead(id) {
        try {
            const response = await fetch(`${API_BASE}/api/feedback/${id}/mark-read`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
            return response.ok;
        } catch { return false; }
    }

    // Subscriptions
    async function getUnreadSubscriptions() {
        try {
            const response = await fetch(`${API_BASE}/api/subscriptions/notifications`, {
                credentials: 'include',
                headers: getHeaders()
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.status === 'success' ? data.notifications || [] : [];
        } catch { return []; }
    }

    async function markSubscriptionRead(id) {
        try {
            const response = await fetch(`${API_BASE}/api/subscriptions/${id}/mark-read`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ mark_read: true })
            });
            return response.ok;
        } catch { return false; }
    }

    // Get total count
    async function getTotalUnreadCount() {
        try {
            const [feedbackCount, subscriptionCount] = await Promise.all([
                fetch(`${API_BASE}/api/feedback/unread-count`, { credentials: 'include', headers: getHeaders() }).then(r => r.ok ? r.json() : { count: 0 }),
                fetch(`${API_BASE}/api/subscriptions/notifications/count`, { credentials: 'include', headers: getHeaders() }).then(r => r.ok ? r.json() : { count: 0 })
            ]);
            return (feedbackCount.count || 0) + (subscriptionCount.count || 0);
        } catch {
            return 0;
        }
    }

    // ===== Update Badge =====
    function updateBadge(count) {
        unreadCount = count || 0;
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
        if (!isLoggedIn() || !backendSessionActive) {
            updateBadge(0);
            return;
        }
        try {
            const count = await getTotalUnreadCount();
            updateBadge(count);
        } catch (error) {
            console.debug('🔔 Update count error:', error.message);
        }
    }

    // ===== Mark All Read =====
    async function markAllRead() {
        if (!isLoggedIn() || !backendSessionActive) return;

        const endpoints = [
            { url: '/api/feedback/mark-all-read', name: 'Feedback' },
            { url: '/api/subscriptions/mark-all-read', name: 'Subscriptions' }
        ];

        const btn = document.getElementById('notification-mark-all-read');
        if (btn) {
            btn.textContent = 'Marking...';
            btn.disabled = true;
        }

        let success = 0;
        let failed = 0;

        for (const endpoint of endpoints) {
            try {
                const response = await fetch(`${API_BASE}${endpoint.url}`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: getHeaders()
                });
                if (response.ok) success++;
                else failed++;
            } catch {
                failed++;
            }
        }

        if (btn) {
            btn.textContent = 'Mark all as read';
            btn.disabled = false;
        }

        if (failed === 0) {
            showToast('✅ All notifications marked as read!');
        } else {
            showToast(`⚠️ ${success} marked, ${failed} failed`, 'warning');
        }

        await updateTotalCount();
        loadNotifications();
    }

    // ===== Polling =====
    function startPolling() {
        if (notificationInterval) clearInterval(notificationInterval);
        notificationInterval = setInterval(updateTotalCount, POLL_INTERVAL);
        console.log(`🔔 Polling started (${POLL_INTERVAL/1000}s interval)`);
    }

    // ===== Utility Functions =====
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

    function showToast(message, type = 'success') {
        const existing = document.querySelector('.notification-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'notification-toast';
        const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#ffc107';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            background: ${bgColor};
            color: ${type === 'warning' ? '#333' : 'white'};
            font-weight: 600;
            z-index: 99999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px;
            font-size: 14px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    // ===== Init =====
    function init() {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(initNotificationBell, 500);
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(initNotificationBell, 500);
            });
        }
    }

    init();

    window.notificationBell = {
        init: initNotificationBell,
        loadNotifications: loadNotifications,
        updateTotalCount: updateTotalCount,
        startPolling: startPolling
    };

    console.log('✅ notification-bell.js loaded');

})();
