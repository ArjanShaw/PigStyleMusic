// Admin Dashboard - Shows all admin features as text-labeled cards
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
            color: 'primary'
        },
        { 
            page: 'accounting', 
            icon: 'fa-calculator', 
            label: 'Accounting', 
            description: 'View and manage financial records',
            color: 'success'
        },
        { 
            page: 'purchases', 
            icon: 'fa-boxes', 
            label: 'Purchases', 
            description: 'Manage purchase orders and inventory',
            color: 'warning'
        },
        { 
            page: 'scan', 
            icon: 'fa-qrcode', 
            label: 'Scan', 
            description: 'Scan barcodes and QR codes',
            color: 'info'
        },
        { 
            page: 'post-discogs', 
            icon: 'fa-share-alt', 
            label: 'Post to Discogs', 
            description: 'Post inventory to Discogs marketplace',
            color: 'purple'
        },
        { 
            page: 'discogs-orders', 
            icon: 'fa-shopping-bag', 
            label: 'Discogs Orders', 
            description: 'Manage orders from Discogs',
            color: 'pink'
        },
        { 
            page: 'edit-records', 
            icon: 'fa-edit', 
            label: 'Edit Records', 
            description: 'Edit existing record information',
            color: 'primary'
        },
        { 
            page: 'accessories', 
            icon: 'fa-tshirt', 
            label: 'Accessories', 
            description: 'Manage store accessories and merch',
            color: 'success'
        },
        { 
            page: 'custom-labels', 
            icon: 'fa-tag', 
            label: 'Custom Labels', 
            description: 'Print custom labels and barcodes',
            color: 'warning'
        },
        { 
            page: 'custom-checkout', 
            icon: 'fa-plus-circle', 
            label: 'Custom Checkout', 
            description: 'Add custom items to cart',
            color: 'info'
        },
        { 
            page: 'email-subscriptions', 
            icon: 'fa-envelope', 
            label: 'Email Subscriptions', 
            description: 'Manage email newsletter subscribers',
            color: 'purple'
        },
        { 
            page: 'record-orders', 
            icon: 'fa-shopping-cart', 
            label: 'Record Orders', 
            description: 'View and manage record orders',
            color: 'pink'
        },
        { 
            page: 'feedback', 
            icon: 'fa-comment', 
            label: 'Feedback', 
            description: 'View customer feedback and reviews',
            color: 'primary'
        },
        { 
            page: 'sticky-notes', 
            icon: 'fa-sticky-note', 
            label: 'Sticky Notes', 
            description: 'Create and manage sticky notes',
            color: 'success'
        },
        { 
            page: 'stats', 
            icon: 'fa-chart-line', 
            label: 'Stats', 
            description: 'View store statistics and analytics',
            color: 'warning'
        },
        { 
            page: 'creditors', 
            icon: 'fa-hand-holding-usd', 
            label: 'Creditors', 
            description: 'Manage creditor accounts',
            color: 'info'
        },
        { 
            page: 'users', 
            icon: 'fa-users', 
            label: 'Users', 
            description: 'Manage user accounts and permissions',
            color: 'danger'
        },
        { 
            page: 'print-settings', 
            icon: 'fa-print', 
            label: 'Print Settings', 
            description: 'Configure label and receipt printer settings',
            color: 'purple'
        },
        { 
            page: 'store-settings', 
            icon: 'fa-store', 
            label: 'Store Settings', 
            description: 'Configure store information and settings',
            color: 'pink'
        },
        { 
            page: 'gift-cards', 
            icon: 'fa-gift', 
            label: 'Gift Cards', 
            description: 'Manage and create gift cards',
            color: 'primary'
        },
        { 
            page: 'config-keys', 
            icon: 'fa-key', 
            label: 'Config Keys', 
            description: 'Manage system configuration keys',
            color: 'success'
        },
         
        { 
            page: 'db-query', 
            icon: 'fa-database', 
            label: 'DB Query', 
            description: 'Run database queries (advanced)',
            color: 'danger'
        }
    ];

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
                <div class="admin-dashboard-grid">
        `;

        adminFeatures.forEach(feature => {
            html += `
                <div class="admin-dashboard-card card-${feature.color}" onclick="showPage('${feature.page}', this)" title="${feature.description}">
                    <i class="fas ${feature.icon}"></i>
                    <div class="card-label">${feature.label}</div>
                    <div class="card-description">${feature.description}</div>
                </div>
            `;
        });

        html += `
                </div>
                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px;">
                    <i class="fas fa-shield-alt"></i> Admin Panel v1.0 &bull; ${adminFeatures.length} tools available
                </div>
            </div>
        `;

        container.innerHTML = html;
    };

    // ========== INIT ==========
    window.initAdminDashboard = function() {
        console.log('🔧 initAdminDashboard called');
        window.renderAdminDashboard();
    };

    console.log('✅ Admin Dashboard module initialized');
})();