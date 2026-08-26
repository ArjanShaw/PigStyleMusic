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
    const existingCheckout = nav.querySelector('[data-page="checkout"]');
    if (existingCheckout) existingCheckout.remove();
    
    const existingAddRecords = nav.querySelector('[data-page="add-records"]');
    if (existingAddRecords) existingAddRecords.remove();
    
    const existingDashboard = nav.querySelector('[data-page="dashboard"]');
    if (existingDashboard) existingDashboard.remove();
    
    if (user && user.logged_in) {
        // Dashboard for admin OR consignor
        const allowedRoles = ['admin', 'consignor'];
        if (allowedRoles.includes(user.role)) {
            const dashboardBtn = document.createElement('button');
            dashboardBtn.setAttribute('data-page', 'dashboard');
            dashboardBtn.innerHTML = '<i class="fas fa-chart-pie"></i>';
            dashboardBtn.title = 'Dashboard';
            dashboardBtn.onclick = function() { showPage('dashboard', this); };
            nav.insertBefore(dashboardBtn, loginBtn);
        }
        
        // Checkout for admin OR consignor
        if (allowedRoles.includes(user.role)) {
            const checkoutBtn = document.createElement('button');
            checkoutBtn.setAttribute('data-page', 'checkout');
            checkoutBtn.innerHTML = '<i class="fas fa-shopping-bag"></i>';
            checkoutBtn.title = 'Checkout';
            checkoutBtn.onclick = function() { showPage('checkout', this); };
            nav.insertBefore(checkoutBtn, loginBtn);
        }
        
        // Add Records ONLY for admin
        if (user.role === 'admin') {
            const addRecordsBtn = document.createElement('button');
            addRecordsBtn.setAttribute('data-page', 'add-records');
            addRecordsBtn.innerHTML = '<i class="fas fa-plus-circle"></i>';
            addRecordsBtn.title = 'Add Records';
            addRecordsBtn.onclick = function() { showPage('add-records', this); };
            nav.insertBefore(addRecordsBtn, loginBtn);
        }
        
        // Change login to logout
        if (loginBtn) {
            loginBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
            loginBtn.title = 'Logout';
            loginBtn.onclick = function() {
                localStorage.removeItem('pigstyle_user');
                currentUser = null;
                updateMenu();
                showPage('home');
            };
        }
    } else {
        // Reset login button
        if (loginBtn) {
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i>';
            loginBtn.title = 'Login';
            loginBtn.onclick = function() { showPage('login', this); };
        }
    }
}

async function showPage(page, btnElement) {
    // Check if page requires authentication
    const restrictedPages = ['dashboard', 'checkout', 'add-records'];
    if (restrictedPages.includes(page)) {
        const user = getUser();
        if (!user || !user.logged_in) {
            showPage('login');
            return;
        }
        // Dashboard and Checkout for admin OR consignor
        if (page === 'dashboard' || page === 'checkout') {
            const allowedRoles = ['admin', 'consignor'];
            if (!allowedRoles.includes(user.role)) {
                showPage('home');
                return;
            }
        }
        // Add Records ONLY for admin
        if (page === 'add-records' && user.role !== 'admin') {
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
        
        // Show user info on dashboard
        if (page === 'dashboard') {
            const user = getUser();
            const userInfo = document.getElementById('dashboardUser');
            if (userInfo && user) {
                userInfo.textContent = 'Logged in as: ' + (user.full_name || user.username) + ' (' + user.role + ')';
            }
        }
        
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
        if (page === 'shop' && typeof initShop === 'function') {
            initShop();
        }
        if (page === 'new' && typeof initNew === 'function') {
            initNew();
        }
        if (page === 'merch' && typeof initMerch === 'function') {
            initMerch();
        }
        if (page === 'events' && typeof initEvents === 'function') {
            initEvents();
        }
        if (page === 'connect' && typeof initConnect === 'function') {
            initConnect();
        }
        if (page === 'alerts' && typeof initAlerts === 'function') {
            initAlerts();
        }
        if (page === 'order' && typeof initOrder === 'function') {
            initOrder();
        }
        if (page === 'cart' && typeof initCart === 'function') {
            initCart();
        }
        if (page === 'email' && typeof initEmail === 'function') {
            initEmail();
        }
        if (page === 'login' && typeof initLogin === 'function') {
            initLogin();
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
