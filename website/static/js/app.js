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
        
        // Add Records ONLY for admin
        if (user.role === 'admin') {
            const addRecordsBtn = document.createElement('button');
            addRecordsBtn.setAttribute('data-page', 'add-records');
            addRecordsBtn.innerHTML = '<i class="fas fa-plus-circle"></i>';
            addRecordsBtn.title = 'Add Records';
            addRecordsBtn.onclick = function() { window.showPage('add-records', this); };
            nav.insertBefore(addRecordsBtn, loginBtn);
        }
        
        // Accounting ONLY for admin
        if (user.role === 'admin') {
            const accountingBtn = document.createElement('button');
            accountingBtn.setAttribute('data-page', 'accounting');
            accountingBtn.innerHTML = '<i class="fas fa-calculator"></i>';
            accountingBtn.title = 'Accounting';
            accountingBtn.onclick = function() { window.showPage('accounting', this); };
            nav.insertBefore(accountingBtn, loginBtn);
        }
        
        // Purchases ONLY for admin
        if (user.role === 'admin') {
            const purchasesBtn = document.createElement('button');
            purchasesBtn.setAttribute('data-page', 'purchases');
            purchasesBtn.innerHTML = '<i class="fas fa-boxes"></i>';
            purchasesBtn.title = 'Purchases';
            purchasesBtn.onclick = function() { window.showPage('purchases', this); };
            nav.insertBefore(purchasesBtn, loginBtn);
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
    const restrictedPages = ['dashboard', 'checkout', 'add-records', 'accounting', 'purchases'];
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
        if ((page === 'add-records' || page === 'accounting' || page === 'purchases') && user.role !== 'admin') {
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
        if (page === 'shop' && typeof window.initShop === 'function') {
            window.initShop();
        }
        if (page === 'new' && typeof window.initNew === 'function') {
            window.initNew();
        }
        if (page === 'merch' && typeof window.initMerch === 'function') {
            window.initMerch();
        }
        if (page === 'events' && typeof window.initEvents === 'function') {
            window.initEvents();
        }
        if (page === 'connect' && typeof window.initConnect === 'function') {
            window.initConnect();
        }
        if (page === 'alerts' && typeof window.initAlerts === 'function') {
            window.initAlerts();
        }
        if (page === 'order' && typeof window.initOrder === 'function') {
            window.initOrder();
        }
        if (page === 'cart' && typeof window.initCart === 'function') {
            window.initCart();
        }
        if (page === 'email' && typeof window.initEmail === 'function') {
            window.initEmail();
        }
        if (page === 'login' && typeof window.initLogin === 'function') {
            window.initLogin();
        }
        if (page === 'dashboard' && typeof window.initDashboard === 'function') {
            window.initDashboard();
        }
        if (page === 'checkout' && typeof window.initCheckout === 'function') {
            window.initCheckout();
        }
        if (page === 'add-records' && typeof window.initAddRecords === 'function') {
            window.initAddRecords();
        }
        if (page === 'accounting' && typeof window.initAccounting === 'function') {
            window.initAccounting();
        }
        if (page === 'purchases' && typeof window.initPurchases === 'function') {
            window.initPurchases();
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
