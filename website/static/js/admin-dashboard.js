// Admin Dashboard - Shows all admin features as text-labeled cards with notification badges
(function() {
    'use strict';

    console.log('🚀 Admin Dashboard module loaded');

    // ========== ADMIN FEATURES CONFIGURATION ==========
    const adminFeatures = [
        { 
            page: 'add-records', 
            icon: 'fa-plus-circle', 
            label: 'Add Records', 
            description: 'Add new vinyl records to inventory',
            color: 'primary',
            notification: null
        },
        { 
            page: 'accounting', 
            icon: 'fa-calculator', 
            label: 'Accounting', 
            description: 'View and manage financial records',
            color: 'success',
            notification: null
        },
        { 
            page: 'purchases', 
            icon: 'fa-boxes', 
            label: 'Purchases', 
            description: 'Manage purchase orders and inventory',
            color: 'warning',
            notification: null
        },
        { 
            page: 'scan', 
            icon: 'fa-qrcode', 
            label: 'Scan', 
            description: 'Scan barcodes and QR codes',
            color: 'info',
            notification: null
        },
        { 
            page: 'post-discogs', 
            icon: 'fa-share-alt', 
            label: 'Post to Discogs', 
            description: 'Post inventory to Discogs marketplace',
            color: 'purple',
            notification: null
        },
        { 
            page: 'discogs-orders', 
            icon: 'fa-shopping-bag', 
            label: 'Discogs Orders', 
            description: 'Manage orders from Discogs',
            color: 'pink',
            notification: null
        },
        { 
            page: 'edit-records', 
            icon: 'fa-edit', 
            label: 'Edit Records', 
            description: 'Edit existing record information',
            color: 'primary',
            notification: null
        },
        { 
            page: 'accessories', 
            icon: 'fa-tshirt', 
            label: 'Accessories', 
            description: 'Manage store accessories and merch',
            color: 'success',
            notification: null
        },
        { 
            page: 'custom-labels', 
            icon: 'fa-tag', 
            label: 'Custom Labels', 
            description: 'Print custom labels and barcodes',
            color: 'warning',
            notification: null
        },
        { 
            page: 'custom-checkout', 
            icon: 'fa-plus-circle', 
            label: 'Custom Checkout', 
            description: 'Add custom items to cart',
            color: 'info',
            notification: null
        },
        { 
            page: 'email-subscriptions', 
            icon: 'fa-envelope', 
            label: 'Email Subscriptions', 
            description: 'Manage record alert subscriptions',
            color: 'purple',
            notification: {
                endpoint: '/api/subscriptions/notifications/count',
                key: 'count',
                label: 'New Subscriptions'
            }
        },
        { 
            page: 'record-orders', 
            icon: 'fa-shopping-cart', 
            label: 'Record Orders', 
            description: 'View and manage record orders',
            color: 'pink',
            notification: {
                endpoint: '/api/record-orders/unread-count',
                key: 'count',
                label: 'New Orders'
            }
        },
        { 
            page: 'feedback', 
            icon: 'fa-comment', 
            label: 'Feedback', 
            description: 'View customer feedback and reviews',
            color: 'primary',
            notification: {
                endpoint: '/api/feedback/unread-count',
                key: 'count',
                label: 'New Feedback'
            }
        },
        { 
            page: 'email-list', 
            icon: 'fa-mail-bulk', 
            label: 'Email List', 
            description: 'Manage newsletter subscribers',
            color: 'info',
            notification: {
                endpoint: '/api/admin/email-list/unread-count',
                key: 'count',
                label: 'New Subscribers'
            }
        },
        { 
            page: 'sticky-notes', 
            icon: 'fa-sticky-note', 
            label: 'Sticky Notes', 
            description: 'Create and manage sticky notes',
            color: 'success',
            notification: null
        },
        { 
            page: 'stats', 
            icon: 'fa-chart-line', 
            label: 'Stats', 
            description: 'View store statistics and analytics',
            color: 'warning',
            notification: null
        },
        { 
            page: 'creditors', 
            icon: 'fa-hand-holding-usd', 
            label: 'Creditors', 
            description: 'Manage creditor accounts',
            color: 'info',
            notification: null
        },
        { 
            page: 'users', 
            icon: 'fa-users', 
            label: 'Users', 
            description: 'Manage user accounts and permissions',
            color: 'danger',
            notification: null
        },
        { 
            page: 'print-settings', 
            icon: 'fa-print', 
            label: 'Print Settings', 
            description: 'Configure label and receipt printer settings',
            color: 'purple',
            notification: null
        },
        { 
            page: 'store-settings', 
            icon: 'fa-store', 
            label: 'Store Settings', 
            description: 'Configure store information and settings',
            color: 'pink',
            notification: null
        },
        { 
            page: 'gift-cards', 
            icon: 'fa-gift', 
            label: 'Gift Cards', 
            description: 'Manage and create gift cards',
            color: 'primary',
            notification: null
        },
        { 
            page: 'config-keys', 
            icon: 'fa-key', 
            label: 'Config Keys', 
            description: 'Manage system configuration keys',
            color: 'success',
            notification: null
        },
        { 
            page: 'db-query', 
            icon: 'fa-database', 
            label: 'DB Query', 
            description: 'Run database queries (advanced)',
            color: 'danger',
            notification: null
        }
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
            if (data) {
                return JSON.parse(data);
            }
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
                fetch(`${API_BASE}/api/subscriptions/notifications/count`, {
                    credentials: 'include',
                    headers: getHeaders()
                }).then(r => r.ok ? r.json() : { count: 0 }),
                fetch(`${API_BASE}/api/record-orders/unread-count`, {
                    credentials: 'include',
                    headers: getHeaders()
                }).then(r => r.ok ? r.json() : { count: 0 }),
                fetch(`${API_BASE}/api/feedback/unread-count`, {
                    credentials: 'include',
                    headers: getHeaders()
                }).then(r => r.ok ? r.json() : { count: 0 }),
                fetch(`${API_BASE}/api/admin/email-list/unread-count`, {
                    credentials: 'include',
                    headers: getHeaders()
                }).then(r => r.ok ? r.json() : { count: 0 })
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

    // ========== UPDATE BADGES ON TILES ==========
    function updateTileBadges(counts) {
        const tiles = document.querySelectorAll('.admin-dashboard-card');
        tiles.forEach(tile => {
            const page = tile.dataset.page;
            if (page && counts[page] !== undefined) {
                const count = counts[page];
                const badge = tile.querySelector('.notification-badge');
                const dot = tile.querySelector('.notification-dot');
                
                if (badge) {
                    if (count > 0) {
                        badge.textContent = count > 99 ? '99+' : count;
                        badge.style.display = 'flex';
                    } else {
                        badge.style.display = 'none';
                    }
                }
                
                if (dot) {
                    dot.style.display = count > 0 ? 'block' : 'none';
                }
            }
        });
    }

    // ========== RENDER DASHBOARD ==========
    window.renderAdminDashboard = function() {
        console.log('🖥️ Rendering Admin Dashboard');
        const container = document.getElementById('page-content');
        
        if (!container) {
            console.error('❌ page-content not found');
            return;
        }

        // Check admin access
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
            <div class="admin-dashboard">
                <div class="admin-dashboard-header">
                    <div>
                        <h1><i class="fas fa-crown"></i> Admin Dashboard</h1>
                        <p style="color: #666; margin-top: 5px; font-size: 14px;">Welcome back, ${userName}! Select a tool below to get started.</p>
                    </div>
                    <div class="admin-user-info">
                        <i class="fas fa-user-shield"></i> 
                        ${userName} 
                        <span style="color: #999; margin: 0 5px;">|</span>
                        <i class="fas fa-circle" style="color: #28a745; font-size: 10px;"></i> 
                        Online
                    </div>
                </div>
                
                <!-- Notification Summary Bar -->
                <div class="notification-summary" style="
                    display: flex;
                    gap: 20px;
                    padding: 12px 20px;
                    background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                    border-radius: 12px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                    align-items: center;
                ">
                    <span style="font-weight: 600; color: #333; font-size: 14px;">
                        <i class="fas fa-bell" style="color: #ff6b6b;"></i> 
                        Notification Summary
                    </span>
                    <div style="display: flex; gap: 16px; flex-wrap: wrap;" id="notification-summary-items">
                        <span style="font-size: 13px; color: #555;">
                            📧 Alerts: <strong id="summary-subs">0</strong>
                        </span>
                        <span style="font-size: 13px; color: #555;">
                            📦 Orders: <strong id="summary-orders">0</strong>
                        </span>
                        <span style="font-size: 13px; color: #555;">
                            💬 Feedback: <strong id="summary-feedback">0</strong>
                        </span>
                        <span style="font-size: 13px; color: #555;">
                            📋 New Subs: <strong id="summary-email-list">0</strong>
                        </span>
                        <span style="font-size: 13px; color: #555; font-weight: 600;">
                            🔔 Total: <strong id="summary-total" style="color: #dc3545;">0</strong>
                        </span>
                    </div>
                    <button onclick="markAllNotificationsRead()" style="
                        margin-left: auto;
                        padding: 4px 16px;
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
                
                <div class="admin-dashboard-grid">
        `;

        adminFeatures.forEach(feature => {
            const hasNotification = feature.notification !== null;
            const pageId = feature.page;
            
            html += `
                <div class="admin-dashboard-card card-${feature.color}" 
                     data-page="${pageId}"
                     onclick="showPage('${pageId}', this)" 
                     title="${feature.description}"
                     style="position: relative;">
                    ${hasNotification ? `
                        <span class="notification-dot" style="
                            position: absolute;
                            top: 10px;
                            right: 10px;
                            width: 12px;
                            height: 12px;
                            background: #dc3545;
                            border-radius: 50%;
                            border: 2px solid white;
                            display: none;
                            animation: pulse-dot 2s infinite;
                        "></span>
                        <span class="notification-badge" style="
                            position: absolute;
                            top: -6px;
                            right: -6px;
                            background: #dc3545;
                            color: white;
                            border-radius: 50%;
                            padding: 2px 6px;
                            font-size: 10px;
                            font-weight: 700;
                            min-width: 20px;
                            text-align: center;
                            display: none;
                            box-shadow: 0 2px 8px rgba(220, 53, 69, 0.4);
                            border: 2px solid white;
                            z-index: 5;
                        ">0</span>
                    ` : ''}
                    <i class="fas ${feature.icon}"></i>
                    <div class="card-label">${feature.label}</div>
                    <div class="card-description">${feature.description}</div>
                    ${hasNotification ? `
                        <div style="
                            margin-top: 6px;
                            font-size: 10px;
                            color: #999;
                            font-weight: 500;
                        ">
                            <i class="fas fa-bell" style="color: #ff6b6b; font-size: 9px;"></i>
                            <span class="notification-label">${feature.notification.label}: </span>
                            <span class="notification-count" style="font-weight: 700; color: #dc3545;">0</span>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        html += `
                </div>
                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px;">
                    <i class="fas fa-shield-alt"></i> Admin Panel v1.0 &bull; ${adminFeatures.length} tools available
                </div>
            </div>
            
            <style>
                @keyframes pulse-dot {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.5); opacity: 0.5; }
                    100% { transform: scale(1); opacity: 1; }
                }
                
                .admin-dashboard-card .notification-badge {
                    animation: pulse-dot 2s infinite;
                }
            </style>
        `;

        container.innerHTML = html;

        // Fetch and display notification counts after rendering
        setTimeout(() => {
            refreshNotificationCounts();
        }, 500);

        // Start polling for notifications
        startPolling();
    };

    // ========== REFRESH NOTIFICATION COUNTS ==========
    async function refreshNotificationCounts() {
        const counts = await fetchNotificationCounts();
        
        // Update summary bar
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
        
        // Update tile badges
        const tiles = document.querySelectorAll('.admin-dashboard-card');
        tiles.forEach(tile => {
            const page = tile.dataset.page;
            if (page && counts[page] !== undefined) {
                const count = counts[page];
                
                // Update dot
                const dot = tile.querySelector('.notification-dot');
                if (dot) {
                    dot.style.display = count > 0 ? 'block' : 'none';
                }
                
                // Update badge
                const badge = tile.querySelector('.notification-badge');
                if (badge) {
                    if (count > 0) {
                        badge.textContent = count > 99 ? '99+' : count;
                        badge.style.display = 'flex';
                    } else {
                        badge.style.display = 'none';
                    }
                }
                
                // Update count label
                const countLabel = tile.querySelector('.notification-count');
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
            { url: '/api/subscriptions/mark-all-read', name: 'Subscriptions' },
            { url: '/api/record-orders/mark-all-read', name: 'Orders' },
            { url: '/api/feedback/mark-all-read', name: 'Feedback' },
            { url: '/api/admin/email-list/mark-all-read', name: 'Email List' }
        ];
        
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
            btn.textContent = '<i class="fas fa-check-double"></i> Mark All Read';
            btn.disabled = false;
        }
        
        if (failed === 0) {
            showToast('✅ All notifications marked as read!');
        } else {
            showToast(`⚠️ ${success} marked, ${failed} failed`, 'warning');
        }
        
        // Refresh counts
        await refreshNotificationCounts();
    };

    // ========== POLLING ==========
    function startPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
        }
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
        window.renderAdminDashboard();
    };

    // Clean up polling when page changes
    document.addEventListener('pageChange', function() {
        stopPolling();
    });

    console.log('✅ Admin Dashboard module initialized');
})();