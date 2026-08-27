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
    
    const existingCheckout = nav.querySelector('[data-page="checkout"]');
    if (existingCheckout) existingCheckout.remove();
    
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
        
        // Checkout for admin OR consignor
        if (allowedRoles.includes(user.role)) {
            const checkoutBtn = document.createElement('button');
            checkoutBtn.setAttribute('data-page', 'checkout');
            checkoutBtn.innerHTML = '<i class="fas fa-shopping-bag"></i>';
            checkoutBtn.title = 'Checkout';
            checkoutBtn.onclick = function() { window.showPage('checkout', this); };
            nav.insertBefore(checkoutBtn, loginBtn);
        }
        
        // Admin-only features
        if (user.role === 'admin') {
            const adminBtns = [
                { page: 'add-records', icon: 'fa-plus-circle', label: 'Add Records' },
                { page: 'accounting', icon: 'fa-calculator', label: 'Accounting' },
                { page: 'purchases', icon: 'fa-boxes', label: 'Purchases' },
                { page: 'scan', icon: 'fa-qrcode', label: 'Scan' },
                { page: 'post-discogs', icon: 'fa-share-alt', label: 'Post to Discogs' },
                { page: 'discogs-orders', icon: 'fa-shopping-bag', label: 'Discogs Orders' }
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
    // Check if page requires authentication
    const restrictedPages = ['dashboard', 'checkout', 'add-records', 'accounting', 'purchases', 'scan', 'post-discogs', 'discogs-orders'];
    if (restrictedPages.includes(page)) {
        const user = getUser();
        if (!user || !user.logged_in) {
            showPage('login');
            return;
        }
        if (page === 'dashboard' || page === 'checkout') {
            const allowedRoles = ['admin', 'consignor'];
            if (!allowedRoles.includes(user.role)) {
                showPage('home');
                return;
            }
        }
        const adminOnly = ['add-records', 'accounting', 'purchases', 'scan', 'post-discogs', 'discogs-orders'];
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
            'checkout': 'initCheckout',
            'add-records': 'initAddRecords',
            'accounting': 'initAccounting',
            'purchases': 'initPurchases',
            'scan': 'initScan',
            'post-discogs': 'initPostDiscogs',
            'discogs-orders': 'initDiscogsOrders'
        };
        
        const initFn = initMap[page];
        if (initFn && typeof window[initFn] === 'function') {
            window[initFn]();
        }
        
    } catch(err) {
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
