// ================================================================
// FILE: /static/js/app.js
// Page navigation - UNCHANGED from working version
// ================================================================

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
        'email-list', 'online-orders'
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
            'db-query', 'custom-checkout', 'admin-dashboard', 'email-list',
            'online-orders'
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
            'new-arrivals': 'initNewArrivals',
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
            'email-list': 'initEmailList',
            'confirmation': 'initConfirmation',
            'online-orders': 'initOnlineOrders'
        };
        
        const initFn = initMap[page];
        if (initFn && typeof window[initFn] === 'function') {
            console.log('🔧 Initializing:', page);
            window[initFn]();
        } else {
            console.log('ℹ️ No init function for:', page);
        }
        
        // After loading confirmation page, check for Square return
        if (page === 'confirmation' && typeof window.checkSquareReturn === 'function') {
            // The confirmation page will handle the order completion
            console.log('🔵 Confirmation page loaded, checking for order...');
        }
        
    } catch(err) {
        console.error('❌ Failed to load page:', page, err);
        content.innerHTML = '<div class="simple-page"><h1>Error</h1><p>Failed to load page</p></div>';
    }
}

// ==================== NAVIGATION HELPERS ====================

// Navigate menu left/right
function navigateMenu(direction) {
    console.log('🔄 Navigating:', direction);
    
    const nav = document.getElementById('menu');
    if (!nav) {
        console.error('❌ Menu not found');
        return;
    }
    
    // Get all page buttons (exclude nav arrows, admin toggle, login)
    const allButtons = nav.querySelectorAll('button');
    const pageButtons = [];
    
    allButtons.forEach(btn => {
        // Skip nav arrows
        if (btn.id === 'nav-prev' || btn.id === 'nav-next') return;
        // Skip admin toggle
        if (btn.classList.contains('admin-toggle')) return;
        // Skip login button
        if (btn.classList.contains('login-btn')) return;
        // Skip cart button (it's handled separately below)
        if (btn.title === 'Cart') return;
        
        // Check if it has an onclick that calls showPage
        const onclick = btn.getAttribute('onclick');
        if (onclick && onclick.includes('showPage')) {
            pageButtons.push(btn);
        }
    });
    
    // Add cart button separately if it exists and isn't already included
    const cartBtn = nav.querySelector('[title="Cart"]');
    if (cartBtn && !pageButtons.includes(cartBtn)) {
        pageButtons.push(cartBtn);
    }
    
    console.log('📋 Found', pageButtons.length, 'page buttons');
    
    if (pageButtons.length === 0) return;
    
    // Find currently active button
    let activeIndex = 0;
    pageButtons.forEach((btn, idx) => {
        if (btn.classList.contains('active')) {
            activeIndex = idx;
        }
    });
    
    // Calculate new index
    if (direction === 'next') {
        activeIndex = (activeIndex + 1) % pageButtons.length;
    } else if (direction === 'prev') {
        activeIndex = (activeIndex - 1 + pageButtons.length) % pageButtons.length;
    }
    
    console.log('👉 Clicking button at index:', activeIndex, 'Page:', pageButtons[activeIndex]?.getAttribute('onclick'));
    
    // Click the button at the new index
    if (pageButtons[activeIndex]) {
        pageButtons[activeIndex].click();
    }
}

// Keyboard shortcuts for navigation
document.addEventListener('keydown', function(e) {
    // Left arrow: navigate previous
    if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeElement = document.activeElement;
        // Don't interfere with input fields
        if (activeElement && (activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' || 
            activeElement.tagName === 'SELECT')) {
            return;
        }
        e.preventDefault();
        navigateMenu('prev');
    }
    // Right arrow: navigate next
    else if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeElement = document.activeElement;
        // Don't interfere with input fields
        if (activeElement && (activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' || 
            activeElement.tagName === 'SELECT')) {
            return;
        }
        e.preventDefault();
        navigateMenu('next');
    }
});

// Style the navigation arrows (inject once)
(function initNavStyles() {
    const styleId = 'nav-arrow-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        #nav-prev, #nav-next {
            background: rgba(255,255,255,0.15) !important;
            border: 1px solid rgba(255,255,255,0.25) !important;
            border-radius: 50% !important;
            color: white !important;
            width: 36px !important;
            height: 36px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
            cursor: pointer !important;
            transition: all 0.3s ease !important;
            margin: 0 2px !important;
        }
        #nav-prev:hover, #nav-next:hover {
            background: rgba(255,255,255,0.3) !important;
            border-color: rgba(255,255,255,0.5) !important;
            transform: scale(1.05) !important;
        }
        #nav-prev:active, #nav-next:active {
            transform: scale(0.9) !important;
        }
        @media (max-width: 768px) {
            #nav-prev, #nav-next {
                width: 30px !important;
                height: 30px !important;
                font-size: 12px !important;
            }
        }
    `;
    document.head.appendChild(style);
})();

// Make navigateMenu globally available
window.navigateMenu = navigateMenu;

// ===== CHECK FOR SQUARE RETURN ON APP START =====
function checkSquareReturnOnStart() {
    console.log('🔵 [APP START] Checking for Square return...');
    
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const orderId = urlParams.get('order_id');
    const paymentId = urlParams.get('payment_id');
    
    console.log(`🔵 [APP START] status: ${status}, orderId: ${orderId}`);
    
    if (status === 'completed' && orderId) {
        console.log('✅ [APP START] Found completed order:', orderId);
        
        // Store pending order info
        window.pendingOrderId = orderId;
        window.pendingPaymentId = paymentId;
        
        // Navigate to confirmation page
        setTimeout(function() {
            showPage('confirmation');
        }, 100);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    var homeBtn = document.querySelector('nav button:first-child');
    if (homeBtn) {
        homeBtn.classList.add('active');
    }
    updateMenu();
    
    // Check for Square return BEFORE loading home page
    checkSquareReturnOnStart();
    
    // Only load home if not redirected to confirmation
    if (!window.pendingOrderId) {
        showPage('home');
    }
});

window.updateMenu = updateMenu;
window.showPage = showPage;
window.getUser = getUser;
window.checkSquareReturnOnStart = checkSquareReturnOnStart;