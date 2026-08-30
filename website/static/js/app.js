// Page navigation
let currentUser = null;

function getUser() {
    try {
        const data = localStorage.getItem('pigstyle_user');
        if (data) {
            currentUser = JSON.parse(data);
            console.log('Current user:', currentUser);
            return currentUser;
        }
    } catch {}
    return null;
}

// Update menu based on user role
function updateMenu() {
    const user = getUser();
    const nav = document.getElementById('menu');
    if (!nav) {
        console.error('Menu not found');
        return;
    }
    
    const loginBtn = nav.querySelector('.login-btn');
    console.log('Updating menu, user:', user);
    
    // Remove existing dynamic admin toggle button if present
    const existingAdminToggle = nav.querySelector('.admin-toggle');
    if (existingAdminToggle) existingAdminToggle.remove();
    
    // Remove existing dynamic dashboard button (from old system)
    const existingDashboard = nav.querySelector('[data-page="dashboard"]');
    if (existingDashboard) existingDashboard.remove();
    
    // Remove any other dynamic admin buttons (from old system)
    const adminPages = [
        'add-records', 'accounting', 'purchases', 'scan', 
        'post-discogs', 'discogs-orders', 'edit-records', 'accessories', 
        'custom-labels', 'custom-checkout', 'email-subscriptions', 
        'record-orders', 'feedback', 'sticky-notes', 'stats', 
        'creditors', 'users', 'print-settings', 'store-settings', 
        'gift-cards', 'config-keys', 'cache-management', 'system-info', 
        'db-query', 'email-list'
    ];
    
    adminPages.forEach(page => {
        const existing = nav.querySelector(`[data-page="${page}"]`);
        if (existing) existing.remove();
    });
    
    if (user && user.logged_in) {
        // For admin users, add a single admin toggle button
        if (user.role === 'admin') {
            const adminToggle = document.createElement('button');
            adminToggle.className = 'admin-toggle';
            adminToggle.setAttribute('data-page', 'admin-dashboard');
            adminToggle.innerHTML = '<i class="fas fa-crown"></i>';
            adminToggle.title = 'Admin Panel';
            adminToggle.onclick = function() { 
                window.showPage('admin-dashboard', this); 
            };
            nav.insertBefore(adminToggle, loginBtn);
        }
        
        // For consignor users, add a dashboard button
        if (user.role === 'consignor') {
            const dashboardBtn = document.createElement('button');
            dashboardBtn.setAttribute('data-page', 'dashboard');
            dashboardBtn.innerHTML = '<i class="fas fa-chart-pie"></i>';
            dashboardBtn.title = 'Dashboard';
            dashboardBtn.onclick = function() { 
                window.showPage('dashboard', this); 
            };
            nav.insertBefore(dashboardBtn, loginBtn);
        }
        
        // Change login to logout
        if (loginBtn) {
            loginBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
            loginBtn.title = 'Logout';
            loginBtn.onclick = function() {
                localStorage.removeItem('pigstyle_user');
                currentUser = null;
                updateMenu();
                window.showPage('home');
            };
        }
    } else {
        // Reset login button for guest
        if (loginBtn) {
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i>';
            loginBtn.title = 'Login';
            loginBtn.onclick = function() { window.showPage('login', this); };
        }
    }
}

async function showPage(page, btnElement) {
    // Pages that require authentication
    const restrictedPages = [
        'dashboard', 'add-records', 'accounting', 'purchases', 'scan', 
        'post-discogs', 'discogs-orders', 'edit-records', 'accessories', 
        'custom-labels', 'email-subscriptions', 'record-orders', 'feedback', 
        'sticky-notes', 'stats', 'creditors', 'users', 'print-settings', 
        'store-settings', 'gift-cards', 'config-keys', 'cache-management', 
        'system-info', 'db-query', 'custom-checkout', 'admin-dashboard',
        'email-list'
    ];
    
    if (restrictedPages.includes(page)) {
        const user = getUser();
        if (!user || !user.logged_in) {
            showPage('login');
            return;
        }
        const adminOnly = [
            'add-records', 'accounting', 'purchases', 'scan', 'post-discogs', 
            'discogs-orders', 'edit-records', 'accessories', 'custom-labels', 
            'email-subscriptions', 'record-orders', 'feedback', 'sticky-notes', 
            'stats', 'creditors', 'users', 'print-settings', 'store-settings', 
            'gift-cards', 'config-keys', 'cache-management', 'system-info', 
            'db-query', 'custom-checkout', 'admin-dashboard', 'email-list'
        ];
        if (adminOnly.includes(page) && user.role !== 'admin') {
            showPage('home');
            return;
        }
    }
    
    // Update active button state
    document.querySelectorAll('nav button').forEach(function(btn) {
        btn.classList.remove('active');
    });
    if (btnElement) {
        btnElement.classList.add('active');
    }
    
    var content = document.getElementById('page-content');
    try {
        // Special handling for admin-dashboard - render from JS
        if (page === 'admin-dashboard') {
            if (typeof window.renderAdminDashboard === 'function') {
                window.renderAdminDashboard();
            } else {
                content.innerHTML = '<div class="simple-page"><h1>Loading Admin Dashboard...</h1></div>';
                // Try to initialize admin dashboard
                if (typeof window.initAdminDashboard === 'function') {
                    window.initAdminDashboard();
                }
            }
            return;
        }
        
        var response = await fetch('/tiles/' + page + '.html');
        console.log('📄 Loading page:', page, 'Status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        var html = await response.text();
        content.innerHTML = html;
        
        document.querySelectorAll('.flip-hint').forEach(function(hint) {
            hint.onclick = function(e) {
                e.stopPropagation();
                var card = this.closest('.flip-card');
                if (card) {
                    card.classList.toggle('flipped');
                }
            };
        });
        
        // Initialize page-specific functionality
        const initMap = {
            'shop': 'initShop',
            'new': 'initNew',
            'merch': 'initMerch',
            'events': 'initEvents',
            'connect': 'initConnect',
            'alerts': 'initAlerts',
            'order': 'initOrder',
            'cart': 'initCart',
            'email': 'initEmail',
            'login': 'initLogin',
            'dashboard': 'initDashboard',
            'add-records': 'initAddRecords',
            'accounting': 'initAccounting',
            'purchases': 'initPurchases',
            'scan': 'initScan',
            'post-discogs': 'initPostDiscogs',
            'discogs-orders': 'initDiscogsOrders',
            'edit-records': 'initEditRecords',
            'accessories': 'initAccessories',
            'custom-labels': 'initCustomLabels',
            'custom-checkout': 'initCustomCheckout',
            'email-subscriptions': 'initEmailSubscriptions',
            'record-orders': 'initRecordOrders',
            'feedback': 'initFeedback',
            'sticky-notes': 'initStickyNotes',
            'stats': 'initStats',
            'creditors': 'initCreditors',
            'users': 'initUsers',
            'print-settings': 'initPrintSettings',
            'store-settings': 'initStoreSettings',
            'gift-cards': 'initGiftCards',
            'config-keys': 'initConfigKeys',
            'cache-management': 'initCacheManagement',
            'system-info': 'initSystemInfo',
            'db-query': 'initDbQuery',
            'email-list': 'initEmailList'
        };
        
        const initFn = initMap[page];
        if (initFn && typeof window[initFn] === 'function') {
            console.log('🔧 Initializing:', page);
            window[initFn]();
        }
        
    } catch(err) {
        console.error('❌ Failed to load page:', page, err);
        content.innerHTML = '<div class="simple-page"><h1>Error</h1><p>Failed to load page</p></div>';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    var homeBtn = document.querySelector('nav button:first-child');
    if (homeBtn) {
        homeBtn.classList.add('active');
    }
    updateMenu();
    showPage('home');
});

window.updateMenu = updateMenu;
window.showPage = showPage;
window.getUser = getUser;