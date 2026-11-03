// Admin Dashboard - Two-column searchable list of admin features with notification badges
(function() {
    'use strict';

    console.log('🚀 Admin Dashboard module loaded');

    // ========== ADMIN FEATURES CONFIGURATION ==========
    const adminFeatures = [
        { page: 'add-records', icon: 'fa-plus-circle', label: 'Add Records', description: 'Add new vinyl records to inventory', color: 'primary', notification: null },
        { page: 'accounting', icon: 'fa-calculator', label: 'Accounting', description: 'View and manage financial records', color: 'success', notification: null },
        { page: 'purchases', icon: 'fa-boxes', label: 'Purchases', description: 'Manage purchase orders and inventory', color: 'warning', notification: null },
        { page: 'scan', icon: 'fa-qrcode', label: 'Scan', description: 'Scan barcodes and QR codes', color: 'info', notification: null },
        { page: 'post-discogs', icon: 'fa-share-alt', label: 'Post to Discogs', description: 'Post inventory to Discogs marketplace', color: 'purple', notification: null },
        { page: 'discogs-orders', icon: 'fa-shopping-bag', label: 'Discogs Orders', description: 'Manage orders from Discogs', color: 'pink', notification: null },
        { page: 'edit-records', icon: 'fa-edit', label: 'Edit Records', description: 'Edit existing record information', color: 'primary', notification: null },
        { page: 'locations-admin', icon: 'fa-map-marker-alt', label: 'Locations', description: 'Manage location hierarchy, pricing, and post subtrees to eBay/Discogs', color: 'info', notification: null },
        { page: 'accessories', icon: 'fa-tshirt', label: 'Accessories', description: 'Manage store accessories and merch', color: 'success', notification: null },
        { page: 'custom-labels', icon: 'fa-tag', label: 'Custom Labels', description: 'Print custom labels and barcodes', color: 'warning', notification: null },
        { page: 'shipping-labels', icon: 'fa-shipping-fast', label: 'Shipping Labels', description: 'Print Avery 5168 shipping labels from PDF', color: 'info', notification: null },
        { page: 'custom-checkout', icon: 'fa-plus-circle', label: 'Custom Checkout', description: 'Add custom items to cart', color: 'info', notification: null },
        { page: 'email-subscriptions', icon: 'fa-envelope', label: 'Email Subscriptions', description: 'Manage record alert subscriptions', color: 'purple', notification: { endpoint: '/api/subscriptions/notifications/count', key: 'count', label: 'New Subscriptions' } },
        { page: 'record-orders', icon: 'fa-shopping-cart', label: 'Record Orders', description: 'View and manage record orders', color: 'pink', notification: { endpoint: '/api/record-orders/unread-count', key: 'count', label: 'New Orders' } },
        { page: 'feedback', icon: 'fa-comment', label: 'Feedback', description: 'View customer feedback and reviews', color: 'primary', notification: { endpoint: '/api/feedback/unread-count', key: 'count', label: 'New Feedback' } },
        { page: 'email-list', icon: 'fa-mail-bulk', label: 'Email List', description: 'Manage newsletter subscribers', color: 'info', notification: { endpoint: '/api/admin/email-list/unread-count', key: 'count', label: 'New Subscribers' } },
        { page: 'online-orders', icon: 'fa-shopping-bag', label: 'Online Orders', description: 'Manage orders from the online store (Square checkout)', color: 'purple', notification: null },
        { page: 'sticky-notes', icon: 'fa-sticky-note', label: 'Sticky Notes', description: 'Create and manage sticky notes', color: 'success', notification: null },
        { page: 'stats', icon: 'fa-chart-line', label: 'Stats', description: 'View store statistics and analytics', color: 'warning', notification: null },
        { page: 'creditors', icon: 'fa-hand-holding-usd', label: 'Creditors', description: 'Manage creditor accounts', color: 'info', notification: null },
        { page: 'users', icon: 'fa-users', label: 'Users', description: 'Manage user accounts and permissions', color: 'danger', notification: null },
        { page: 'print-settings', icon: 'fa-print', label: 'Print Settings', description: 'Configure label and receipt printer settings', color: 'purple', notification: null },
        { page: 'store-settings', icon: 'fa-store', label: 'Store Settings', description: 'Configure store information and settings', color: 'pink', notification: null },
        { page: 'gift-cards', icon: 'fa-gift', label: 'Gift Cards', description: 'Manage and create gift cards', color: 'primary', notification: null },
        { page: 'config-keys', icon: 'fa-key', label: 'Config Keys', description: 'Manage system configuration keys', color: 'success', notification: null },
        { page: 'db-query', icon: 'fa-database', label: 'DB Query', description: 'Run database queries (advanced)', color: 'danger', notification: null }
    ];

    // Track notification counts
    let notificationCounts = {
        'email-subscriptions': 0,
        'record-orders': 0,
        'feedback': 0,
        'email-list': 0
    };

    let pollInterval = null;
    const POLL_INTERVAL = 30000; // 30 seconds

    // Current search query (persists across re-renders while dashboard is up)
    let currentSearchQuery = '';

    // ========== CHECK ADMIN ACCESS ==========
    function isAdmin() {
        try {
            const userData = localStorage.getItem('pigstyle_user');
            if (userData) {
                const user = JSON.parse(userData);
                return user.role === 'admin' || user.role === 'manager';
            }
        } catch {}
        return false;
    }

    function getUser() {
        try {
            const data = localStorage.getItem('pigstyle_user');
            if (data) return JSON.parse(data);
        } catch {}
        return null;
    }

    // ========== API HELPERS ==========
    function getAPIBase() {
        return window.location.hostname === 'localhost'
            ? 'http://localhost:5000'
            : 'https://www.pigstylemusic.com';
    }

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ========== FETCH NOTIFICATION COUNTS ==========
    async function fetchNotificationCounts() {
        const API_BASE = getAPIBase();
        const results = {
            'email-subscriptions': 0,
            'record-orders': 0,
            'feedback': 0,
            'email-list': 0
        };

        try {
            const [subs, orders, feedback, emailList] = await Promise.all([
                fetch(`${API_BASE}/api/subscriptions/notifications/count`, { credentials: 'include', headers: getHeaders() }).then(r => r.ok ? r.json() : { count: 0 }),
                fetch(`${API_BASE}/api/record-orders/unread-count`, { credentials: 'include', headers: getHeaders() }).then(r => r.ok ? r.json() : { count: 0 }),
                fetch(`${API_BASE}/api/feedback/unread-count`, { credentials: 'include', headers: getHeaders() }).then(r => r.ok ? r.json() : { count: 0 }),
                fetch(`${API_BASE}/api/admin/email-list/unread-count`, { credentials: 'include', headers: getHeaders() }).then(r => r.ok ? r.json() : { count: 0 })
            ]);

            results['email-subscriptions'] = subs.count || 0;
            results['record-orders'] = orders.count || 0;
            results['feedback'] = feedback.count || 0;
            results['email-list'] = emailList.count || 0;
        } catch (error) {
            console.debug('🔔 Notification count fetch error:', error.message);
        }

        notificationCounts = results;
        return results;
    }

    // ========== FILTERING ==========
    function filterFeatures(features, query) {
        if (!query || !query.trim()) return features;
        const q = query.trim().toLowerCase();
        return features.filter(f =>
            f.label.toLowerCase().includes(q) ||
            f.description.toLowerCase().includes(q) ||
            f.page.toLowerCase().includes(q)
        );
    }

    // ========== RENDER ITEM (one row in the list) ==========
    function renderListItem(feature) {
        const hasNotification = feature.notification !== null;
        const colorMap = {
            primary: '#007bff',
            success: '#28a745',
            warning: '#ffc107',
            info: '#17a2b8',
            purple: '#6f42c1',
            pink: '#e83e8c',
            danger: '#dc3545'
        };
        const accent = colorMap[feature.color] || '#6c757d';

        return `
            <div class="admin-list-item"
                 data-page="${feature.page}"
                 data-search-text="${escapeHtml((feature.label + ' ' + feature.description + ' ' + feature.page).toLowerCase())}"
                 onclick="showPage('${feature.page}', this)"
                 title="${escapeHtml(feature.description)}"
                 style="
                     display: flex;
                     align-items: center;
                     gap: 12px;
                     padding: 12px 14px;
                     background: white;
                     border: 1px solid #e9ecef;
                     border-left: 4px solid ${accent};
                     border-radius: 8px;
                     cursor: pointer;
                     transition: all 0.15s ease;
                     position: relative;
                 "
                 onmouseover="this.style.background='#f8f9fa'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)';"
                 onmouseout="this.style.background='white'; this.style.boxShadow='none';">
                <div style="
                    width: 38px;
                    height: 38px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: ${accent}15;
                    color: ${accent};
                    border-radius: 8px;
                    flex-shrink: 0;
                    font-size: 16px;
                    position: relative;
                ">
                    <i class="fas ${feature.icon}"></i>
                    ${hasNotification ? `
                        <span class="notification-badge" style="
                            position: absolute;
                            top: -6px;
                            right: -6px;
                            background: #dc3545;
                            color: white;
                            border-radius: 10px;
                            padding: 1px 6px;
                            font-size: 10px;
                            font-weight: 700;
                            min-width: 18px;
                            text-align: center;
                            display: none;
                            box-shadow: 0 2px 6px rgba(220,53,69,0.4);
                            border: 2px solid white;
                            line-height: 1.2;
                        ">0</span>
                    ` : ''}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="
                        font-weight: 600;
                        color: #333;
                        font-size: 14px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        flex-wrap: wrap;
                    ">
                        <span>${escapeHtml(feature.label)}</span>
                        ${feature.page === 'online-orders' ? `
                            <span style="
                                background: #6f42c1;
                                color: white;
                                font-size: 9px;
                                font-weight: 700;
                                padding: 1px 6px;
                                border-radius: 8px;
                                letter-spacing: 0.5px;
                                text-transform: uppercase;
                            ">NEW</span>
                        ` : ''}
                        ${hasNotification ? `
                            <span class="notification-label" style="font-size: 11px; color: #999; font-weight: 500;">
                                <i class="fas fa-bell" style="color: #ff6b6b; font-size: 10px;"></i>
                                <span class="notification-count" style="font-weight: 700; color: #dc3545;">0</span>
                                <span style="font-weight: 500;">${escapeHtml(feature.notification.label)}</span>
                            </span>
                        ` : ''}
                    </div>
                    <div style="
                        color: #888;
                        font-size: 12px;
                        margin-top: 2px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    ">${escapeHtml(feature.description)}</div>
                </div>
                <i class="fas fa-chevron-right" style="color: #ccc; font-size: 12px; flex-shrink: 0;"></i>
            </div>
        `;
    }

    // ========== RENDER DASHBOARD ==========
    window.renderAdminDashboard = function() {
        console.log('🖥️ Rendering Admin Dashboard');
        const container = document.getElementById('page-content');

        if (!container) {
            console.error('❌ page-content not found');
            return;
        }

        if (!isAdmin()) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px; text-align: center; background: rgba(255,255,255,0.95); border-radius: 16px;">
                    <div style="font-size: 48px; margin-bottom: 20px;">🔒</div>
                    <h2 style="color: #333;">Admin Access Required</h2>
                    <p style="color: #666;">Please log in as an admin to access the dashboard.</p>
                    <button onclick="showPage('login')" style="margin-top: 20px; padding: 10px 30px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">
                        <i class="fas fa-sign-in-alt"></i> Go to Login
                    </button>
                </div>
            `;
            return;
        }

        const user = getUser();
        const userName = user ? user.name || user.username || 'Admin' : 'Admin';

        let html = `
            <div class="admin-dashboard" style="display: flex; flex-direction: column; height: 100%; background: white; border-radius: 16px; padding: 20px; overflow: hidden; box-sizing: border-box;">
                <div class="admin-dashboard-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <h1 style="margin: 0; font-size: 24px; color: #333;"><i class="fas fa-crown" style="color: #ffc107;"></i> Admin Dashboard</h1>
                        <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Welcome back, ${escapeHtml(userName)}! Select a tool below to get started.</p>
                    </div>
                    <div class="admin-user-info" style="font-size: 13px; color: #666;">
                        <i class="fas fa-user-shield"></i> 
                        ${escapeHtml(userName)} 
                        <span style="color: #999; margin: 0 5px;">|</span>
                        <i class="fas fa-circle" style="color: #28a745; font-size: 10px;"></i> 
                        Online
                    </div>
                </div>

                <!-- Search box -->
                <div style="position: relative; margin-bottom: 12px;">
                    <i class="fas fa-search" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #999; font-size: 14px;"></i>
                    <input type="text"
                           id="admin-dashboard-search"
                           placeholder="Search tools by name or description…"
                           value="${escapeHtml(currentSearchQuery)}"
                           oninput="window.adminDashboardFilter(this.value)"
                           style="
                               width: 100%;
                               padding: 10px 14px 10px 38px;
                               font-size: 14px;
                               border: 1px solid #dee2e6;
                               border-radius: 8px;
                               box-sizing: border-box;
                               outline: none;
                               color: #333;
                           "
                           onfocus="this.style.borderColor='#007bff'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)';"
                           onblur="this.style.borderColor='#dee2e6'; this.style.boxShadow='none';">
                    <button id="admin-dashboard-search-clear"
                            onclick="window.adminDashboardFilter('')"
                            style="
                                position: absolute;
                                right: 8px;
                                top: 50%;
                                transform: translateY(-50%);
                                background: transparent;
                                border: none;
                                color: #999;
                                cursor: pointer;
                                padding: 4px 8px;
                                font-size: 14px;
                                display: ${currentSearchQuery ? 'block' : 'none'};
                            "
                            title="Clear search">✕</button>
                </div>

                <!-- Notification Summary Bar -->
                <div class="notification-summary" style="
                    display: flex;
                    gap: 16px;
                    padding: 10px 16px;
                    background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                    border-radius: 10px;
                    margin-bottom: 12px;
                    flex-wrap: wrap;
                    align-items: center;
                    font-size: 13px;
                ">
                    <span style="font-weight: 600; color: #333;">
                        <i class="fas fa-bell" style="color: #ff6b6b;"></i> 
                        Notifications
                    </span>
                    <span style="color: #555;">📧 Alerts: <strong id="summary-subs">0</strong></span>
                    <span style="color: #555;">📦 Orders: <strong id="summary-orders">0</strong></span>
                    <span style="color: #555;">💬 Feedback: <strong id="summary-feedback">0</strong></span>
                    <span style="color: #555;">📋 New Subs: <strong id="summary-email-list">0</strong></span>
                    <span style="color: #555; font-weight: 600;">🔔 Total: <strong id="summary-total" style="color: #dc3545;">0</strong></span>
                    <button onclick="markAllNotificationsRead()" style="
                        margin-left: auto;
                        padding: 4px 14px;
                        background: #007bff;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: 600;
                    ">
                        <i class="fas fa-check-double"></i> Mark All Read
                    </button>
                </div>

                <!-- Two-column list -->
                <div id="admin-list-container" style="flex: 1; overflow-y: auto; padding-right: 4px;">
                    <div id="admin-list-grid" style="
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px;
                    ">
        `;

        adminFeatures.forEach(feature => {
            html += renderListItem(feature);
        });

        html += `
                    </div>
                    <div id="admin-list-empty" style="
                        display: none;
                        text-align: center;
                        padding: 40px 20px;
                        color: #999;
                        font-size: 13px;
                    ">
                        <i class="fas fa-search" style="font-size: 32px; color: #ddd; display: block; margin-bottom: 12px;"></i>
                        No tools match your search.
                    </div>
                </div>

                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fas fa-shield-alt"></i> Admin Panel v1.1</span>
                    <span><span id="admin-list-visible-count">${adminFeatures.length}</span> of ${adminFeatures.length} tools</span>
                </div>
            </div>

            <style>
                @media (max-width: 720px) {
                    #admin-list-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
            </style>
        `;

        container.innerHTML = html;

        // Restore search filter if one was set
        if (currentSearchQuery) {
            applyFilter(currentSearchQuery);
        }

        setTimeout(() => { refreshNotificationCounts(); }, 300);
        startPolling();
    };

    // ========== FILTER / SEARCH ==========
    function applyFilter(query) {
        currentSearchQuery = query || '';
        const grid = document.getElementById('admin-list-grid');
        const empty = document.getElementById('admin-list-empty');
        const clearBtn = document.getElementById('admin-dashboard-search-clear');
        const countEl = document.getElementById('admin-list-visible-count');
        if (!grid) return;

        const q = currentSearchQuery.trim().toLowerCase();
        let visible = 0;
        const items = grid.querySelectorAll('.admin-list-item');
        items.forEach(item => {
            const text = item.dataset.searchText || '';
            const match = !q || text.includes(q);
            item.style.display = match ? 'flex' : 'none';
            if (match) visible++;
        });

        if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
        if (clearBtn) clearBtn.style.display = currentSearchQuery ? 'block' : 'none';
        if (countEl) countEl.textContent = visible;
    }

    window.adminDashboardFilter = function(query) {
        applyFilter(query);
    };

    // ========== REFRESH NOTIFICATION COUNTS ==========
    async function refreshNotificationCounts() {
        const counts = await fetchNotificationCounts();

        const total = counts['email-subscriptions'] + counts['record-orders'] + counts['feedback'] + counts['email-list'];

        const summarySubs = document.getElementById('summary-subs');
        const summaryOrders = document.getElementById('summary-orders');
        const summaryFeedback = document.getElementById('summary-feedback');
        const summaryEmailList = document.getElementById('summary-email-list');
        const summaryTotal = document.getElementById('summary-total');

        if (summarySubs) summarySubs.textContent = counts['email-subscriptions'];
        if (summaryOrders) summaryOrders.textContent = counts['record-orders'];
        if (summaryFeedback) summaryFeedback.textContent = counts['feedback'];
        if (summaryEmailList) summaryEmailList.textContent = counts['email-list'];
        if (summaryTotal) {
            summaryTotal.textContent = total;
            summaryTotal.style.color = total > 0 ? '#dc3545' : '#28a745';
        }

        document.querySelectorAll('.admin-list-item').forEach(item => {
            const page = item.dataset.page;
            if (page && counts[page] !== undefined) {
                const count = counts[page];
                const badge = item.querySelector('.notification-badge');
                if (badge) {
                    if (count > 0) {
                        badge.textContent = count > 99 ? '99+' : count;
                        badge.style.display = 'block';
                    } else {
                        badge.style.display = 'none';
                    }
                }
                const countLabel = item.querySelector('.notification-count');
                if (countLabel) {
                    countLabel.textContent = count;
                    countLabel.style.color = count > 0 ? '#dc3545' : '#999';
                }
            }
        });
    }

    // ========== MARK ALL NOTIFICATIONS READ ==========
    window.markAllNotificationsRead = async function() {
        const API_BASE = getAPIBase();

        if (!confirm('Mark all notifications as read?')) return;

        const btn = document.querySelector('.notification-summary button');
        if (btn) {
            btn.textContent = '⏳ Marking...';
            btn.disabled = true;
        }

        const endpoints = [
            '/api/subscriptions/mark-all-read',
            '/api/record-orders/mark-all-read',
            '/api/feedback/mark-all-read',
            '/api/admin/email-list/mark-all-read'
        ];

        let success = 0;
        let failed = 0;

        for (const url of endpoints) {
            try {
                const response = await fetch(`${API_BASE}${url}`, {
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
            btn.innerHTML = '<i class="fas fa-check-double"></i> Mark All Read';
            btn.disabled = false;
        }

        if (failed === 0) showToast('✅ All notifications marked as read!');
        else showToast(`⚠️ ${success} marked, ${failed} failed`, 'warning');

        await refreshNotificationCounts();
    };

    // ========== POLLING ==========
    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(refreshNotificationCounts, POLL_INTERVAL);
        console.log(`🔔 Admin dashboard polling started (${POLL_INTERVAL/1000}s interval)`);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    // ========== TOAST ==========
    function showToast(message, type = 'success') {
        const existing = document.querySelector('.admin-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'admin-toast';
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

    // ========== INIT ==========
    window.initAdminDashboard = function() {
        console.log('🔧 initAdminDashboard called');
        currentSearchQuery = '';
        window.renderAdminDashboard();
    };

    document.addEventListener('pageChange', function() {
        stopPolling();
    });

    console.log('✅ Admin Dashboard module initialized');
})();