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
    
    // Remove existing dynamic buttons
    const existingDashboard = nav.querySelector('[data-page="dashboard"]');
    if (existingDashboard) existingDashboard.remove();
    
    const existingAddRecords = nav.querySelector('[data-page="add-records"]');
    if (existingAddRecords) existingAddRecords.remove();
    
    const existingAccounting = nav.querySelector('[data-page="accounting"]');
    if (existingAccounting) existingAccounting.remove();
    
    const existingPurchases = nav.querySelector('[data-page="purchases"]');
    if (existingPurchases) existingPurchases.remove();
    
    const existingScan = nav.querySelector('[data-page="scan"]');
    if (existingScan) existingScan.remove();
    
    const existingPostDiscogs = nav.querySelector('[data-page="post-discogs"]');
    if (existingPostDiscogs) existingPostDiscogs.remove();
    
    const existingDiscogsOrders = nav.querySelector('[data-page="discogs-orders"]');
    if (existingDiscogsOrders) existingDiscogsOrders.remove();
    
    const existingEditRecords = nav.querySelector('[data-page="edit-records"]');
    if (existingEditRecords) existingEditRecords.remove();
    
    const existingAccessories = nav.querySelector('[data-page="accessories"]');
    if (existingAccessories) existingAccessories.remove();
    
    const existingCustomLabels = nav.querySelector('[data-page="custom-labels"]');
    if (existingCustomLabels) existingCustomLabels.remove();
    
    const existingEmailSubscriptions = nav.querySelector('[data-page="email-subscriptions"]');
    if (existingEmailSubscriptions) existingEmailSubscriptions.remove();
    
    const existingRecordOrders = nav.querySelector('[data-page="record-orders"]');
    if (existingRecordOrders) existingRecordOrders.remove();
    
    const existingFeedback = nav.querySelector('[data-page="feedback"]');
    if (existingFeedback) existingFeedback.remove();
    
    const existingStickyNotes = nav.querySelector('[data-page="sticky-notes"]');
    if (existingStickyNotes) existingStickyNotes.remove();
    
    const existingStats = nav.querySelector('[data-page="stats"]');
    if (existingStats) existingStats.remove();
    
    const existingCreditors = nav.querySelector('[data-page="creditors"]');
    if (existingCreditors) existingCreditors.remove();
    
    const existingUsers = nav.querySelector('[data-page="users"]');
    if (existingUsers) existingUsers.remove();
    
    const existingPrintSettings = nav.querySelector('[data-page="print-settings"]');
    if (existingPrintSettings) existingPrintSettings.remove();
    
    const existingStoreSettings = nav.querySelector('[data-page="store-settings"]');
    if (existingStoreSettings) existingStoreSettings.remove();
    
    const existingGiftCards = nav.querySelector('[data-page="gift-cards"]');
    if (existingGiftCards) existingGiftCards.remove();
    
    const existingConfigKeys = nav.querySelector('[data-page="config-keys"]');
    if (existingConfigKeys) existingConfigKeys.remove();
    
    const existingCacheManagement = nav.querySelector('[data-page="cache-management"]');
    if (existingCacheManagement) existingCacheManagement.remove();
    
    const existingSystemInfo = nav.querySelector('[data-page="system-info"]');
    if (existingSystemInfo) existingSystemInfo.remove();
    
    const existingDbQuery = nav.querySelector('[data-page="db-query"]');
    if (existingDbQuery) existingDbQuery.remove();
    
    if (user && user.logged_in) {
        const allowedRoles = ['admin', 'consignor'];
        
        // Dashboard for admin OR consignor
        if (allowedRoles.includes(user.role)) {
            const dashboardBtn = document.createElement('button');
            dashboardBtn.setAttribute('data-page', 'dashboard');
            dashboardBtn.innerHTML = '<i class="fas fa-chart-pie"></i>';
            dashboardBtn.title = 'Dashboard';
            dashboardBtn.onclick = function() { window.showPage('dashboard', this); };
            nav.insertBefore(dashboardBtn, loginBtn);
        }
        
        // Admin-only features
        if (user.role === 'admin') {
            const adminBtns = [
                { page: 'add-records', icon: 'fa-plus-circle', label: 'Add Records' },
                { page: 'accounting', icon: 'fa-calculator', label: 'Accounting' },
                { page: 'purchases', icon: 'fa-boxes', label: 'Purchases' },
                { page: 'scan', icon: 'fa-qrcode', label: 'Scan' },
                { page: 'post-discogs', icon: 'fa-share-alt', label: 'Post to Discogs' },
                { page: 'discogs-orders', icon: 'fa-shopping-bag', label: 'Discogs Orders' },
                { page: 'edit-records', icon: 'fa-edit', label: 'Edit Records' },
                { page: 'accessories', icon: 'fa-tshirt', label: 'Accessories' },
                { page: 'custom-labels', icon: 'fa-tag', label: 'Custom Labels' },
                { page: 'email-subscriptions', icon: 'fa-envelope', label: 'Email Subscriptions' },
                { page: 'record-orders', icon: 'fa-shopping-cart', label: 'Record Orders' },
                { page: 'feedback', icon: 'fa-comment', label: 'Feedback' },
                { page: 'sticky-notes', icon: 'fa-sticky-note', label: 'Sticky Notes' },
                { page: 'stats', icon: 'fa-chart-line', label: 'Stats' },
                { page: 'creditors', icon: 'fa-hand-holding-usd', label: 'Creditors' },
                { page: 'users', icon: 'fa-users', label: 'Users' },
                { page: 'print-settings', icon: 'fa-print', label: 'Print Settings' },
                { page: 'store-settings', icon: 'fa-store', label: 'Store Settings' },
                { page: 'gift-cards', icon: 'fa-gift', label: 'Gift Cards' },
                { page: 'config-keys', icon: 'fa-key', label: 'Config Keys' },
                { page: 'cache-management', icon: 'fa-trash', label: 'Cache Management' },
                { page: 'system-info', icon: 'fa-info-circle', label: 'System Info' },
                { page: 'db-query', icon: 'fa-database', label: 'DB Query' }
            ];
            
            adminBtns.forEach(b => {
                const btn = document.createElement('button');
                btn.setAttribute('data-page', b.page);
                btn.innerHTML = `<i class="fas ${b.icon}"></i>`;
                btn.title = b.label;
                btn.onclick = function() { window.showPage(b.page, this); };
                nav.insertBefore(btn, loginBtn);
            });
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
        // Reset login button
        if (loginBtn) {
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i>';
            loginBtn.title = 'Login';
            loginBtn.onclick = function() { window.showPage('login', this); };
        }
    }
}

async function showPage(page, btnElement) {
    // Pages that require authentication
    const restrictedPages = ['dashboard', 'add-records', 'accounting', 'purchases', 'scan', 'post-discogs', 'discogs-orders', 'edit-records', 'accessories', 'custom-labels', 'email-subscriptions', 'record-orders', 'feedback', 'sticky-notes', 'stats', 'creditors', 'users', 'print-settings', 'store-settings', 'gift-cards', 'config-keys', 'cache-management', 'system-info', 'db-query'];
    
    if (restrictedPages.includes(page)) {
        const user = getUser();
        if (!user || !user.logged_in) {
            showPage('login');
            return;
        }
        const adminOnly = ['add-records', 'accounting', 'purchases', 'scan', 'post-discogs', 'discogs-orders', 'edit-records', 'accessories', 'custom-labels', 'email-subscriptions', 'record-orders', 'feedback', 'sticky-notes', 'stats', 'creditors', 'users', 'print-settings', 'store-settings', 'gift-cards', 'config-keys', 'cache-management', 'system-info', 'db-query'];
        if (adminOnly.includes(page) && user.role !== 'admin') {
            showPage('home');
            return;
        }
    }
    
    document.querySelectorAll('nav button').forEach(function(btn) {
        btn.classList.remove('active');
    });
    if (btnElement) {
        btnElement.classList.add('active');
    }
    
    var content = document.getElementById('page-content');
    try {
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
            'db-query': 'initDbQuery'
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
