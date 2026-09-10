// ================================================================
// FILE: /static/js/app.js
// Page navigation with engagement-style horizontal slide track
// for CUSTOMER tiles; admin tiles render the old hard-swap way.
//
// Admin tile list mirrors admin-dashboard.js — do not change that file.
// ================================================================

// ==================== STATE ====================
let currentUser = null;

// Auto-slide config (matches engagement.html)
const SLIDE_INTERVAL = 4000;      // 4s between auto-advances
const SLIDE_GRACE    = 3000;      // wait before first auto-advance
const SLIDE_TRANSITION_MS = 700;  // must match CSS transition duration

// Rotation order — these are the tiles that live in the slide track
const CUSTOMER_TILES = [
    'home', 'shop', 'new', 'new-arrivals', 'merch',
    'events', 'connect', 'alerts', 'order', 'email'
];

// Admin tiles — mirror of admin-dashboard.js adminFeatures[].
// These use the old hard-swap render path and are excluded from rotation.
const ADMIN_TILES = [
    'admin-dashboard',
    'add-records', 'accounting', 'purchases', 'scan', 'post-discogs',
    'discogs-orders', 'edit-records', 'accessories', 'custom-labels',
    'custom-checkout', 'email-subscriptions', 'record-orders', 'feedback',
    'email-list', 'online-orders', 'sticky-notes', 'stats', 'creditors',
    'users', 'print-settings', 'store-settings', 'gift-cards',
    'config-keys', 'cache-management', 'system-info', 'db-query',
    // Consignor + auth, also outside the rotation
    'dashboard', 'login'
];

// Runtime state for the slide track
let slideTrackEl    = null;   // #slides-container
let slideDotsEl     = null;   // #slide-dots
let slideCache      = {};     // { page: HTMLElement }
let currentSlideName = null;
let autoSlideTimer  = null;
let autoSlideStopped = false;
let isSliding       = false;

// ==================== USER ====================
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

// ==================== MENU ====================
function updateMenu() {
    const user = getUser();
    const nav = document.getElementById('menu');
    if (!nav) {
        console.error('Menu not found');
        return;
    }

    const loginBtn = nav.querySelector('.login-btn');
    console.log('Updating menu, user:', user);

    // Remove dynamic admin toggle if present
    const existingAdminToggle = nav.querySelector('.admin-toggle');
    if (existingAdminToggle) existingAdminToggle.remove();

    // Remove dynamic consignor dashboard button if present
    const existingDashboard = nav.querySelector('[data-page="dashboard"]');
    if (existingDashboard) existingDashboard.remove();

    // Remove any legacy admin buttons
    ADMIN_TILES.forEach(page => {
        const existing = nav.querySelector(`[data-page="${page}"]`);
        if (existing) existing.remove();
    });

    if (user && user.logged_in) {
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
        if (loginBtn) {
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i>';
            loginBtn.title = 'Login';
            loginBtn.onclick = function() { window.showPage('login', this); };
        }
    }
}

// ==================== INIT MAP ====================
const INIT_MAP = {
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

// ==================== SLIDE TRACK SETUP ====================
// Builds #slides-container + #slide-dots inside #page-content once.
function ensureSlideTrack() {
    if (slideTrackEl) return;

    const pageContent = document.getElementById('page-content');
    if (!pageContent) {
        console.error('❌ #page-content not found');
        return;
    }

    // Inject styles once
    if (!document.getElementById('slide-track-styles')) {
        const style = document.createElement('style');
        style.id = 'slide-track-styles';
        style.textContent = `
            #page-content {
                overflow: hidden;
                position: relative;
            }
            #slides-container {
                display: flex;
                height: 100%;
                width: 100%;
                transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
                will-change: transform;
            }
            #slides-container.hidden {
                display: none;
            }
            .slide {
                flex: 0 0 100%;
                width: 100%;
                height: 100%;
                overflow-y: auto;
                overflow-x: hidden;
                position: relative;
            }
            #slide-dots {
                position: absolute;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 10px;
                z-index: 50;
                pointer-events: auto;
            }
            #slide-dots .dot {
                width: 9px;
                height: 9px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.25);
                cursor: pointer;
                transition: all 0.4s ease;
                -webkit-tap-highlight-color: transparent;
            }
            #slide-dots .dot:hover {
                background: rgba(255, 255, 255, 0.5);
            }
            #slide-dots .dot.active {
                background: #6d4fc6;
                box-shadow: 0 0 20px rgba(109, 79, 198, 0.5);
                width: 26px;
                border-radius: 6px;
            }
            .admin-slot {
                display: none;
            }
            .admin-slot.active {
                display: block;
                height: 100%;
                overflow-y: auto;
            }
        `;
        document.head.appendChild(style);
    }

    // Clear page-content and build the track
    pageContent.innerHTML = '';

    slideTrackEl = document.createElement('div');
    slideTrackEl.id = 'slides-container';

    slideDotsEl = document.createElement('div');
    slideDotsEl.id = 'slide-dots';
    slideDotsEl.style.display = 'none';

    pageContent.appendChild(slideTrackEl);
    pageContent.appendChild(slideDotsEl);
}

// Ensures the slide for `page` exists in the track, fetched once.
async function ensureSlide(page) {
    if (slideCache[page]) return slideCache[page];

    const response = await fetch('/tiles/' + page + '.html');
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const html = await response.text();

    const slide = document.createElement('div');
    slide.className = 'slide';
    slide.dataset.page = page;
    slide.innerHTML = html;

    slideTrackEl.appendChild(slide);
    slideCache[page] = slide;

    // Wire flip-card hints inside this slide only
    slide.querySelectorAll('.flip-hint').forEach(function(hint) {
        hint.onclick = function(e) {
            e.stopPropagation();
            const card = this.closest('.flip-card');
            if (card) card.classList.toggle('flipped');
        };
    });

    return slide;
}

// Renders dots for all customer slides currently in the track
function renderDots() {
    if (!slideDotsEl) return;
    slideDotsEl.innerHTML = '';
    const pages = Array.from(slideTrackEl.children).map(s => s.dataset.page);
    pages.forEach(page => {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.dataset.page = page;
        dot.addEventListener('click', function(e) {
            e.stopPropagation();
            userInteractedWithMenu();
            goToSlide(page);
        });
        slideDotsEl.appendChild(dot);
    });
    updateActiveDot();
}

function updateActiveDot() {
    if (!slideDotsEl) return;
    slideDotsEl.querySelectorAll('.dot').forEach(dot => {
        dot.classList.toggle('active', dot.dataset.page === currentSlideName);
    });
}

// Sync the highlighted nav button to the current slide
function updateActiveNavButton() {
    const nav = document.getElementById('menu');
    if (!nav) return;
    nav.querySelectorAll('button').forEach(function(btn) {
        btn.classList.remove('active');
    });
    // Find the nav button whose onclick references this page
    const target = nav.querySelector(
        `button[onclick*="showPage('${currentSlideName}'"]`
    );
    if (target) target.classList.add('active');
}

// Slide to an existing slide in the track
function goToSlide(page) {
    if (isSliding) return;
    if (!slideTrackEl || !slideCache[page]) return;

    const slides = Array.from(slideTrackEl.children);
    const index = slides.findIndex(s => s.dataset.page === page);
    if (index < 0) return;

    isSliding = true;
    currentSlideName = page;

    slideTrackEl.style.transform = `translateX(-${index * 100}%)`;
    updateActiveDot();
    updateActiveNavButton();

    setTimeout(() => {
        isSliding = false;
        resetAutoSlide();
    }, SLIDE_TRANSITION_MS);
}

// ==================== AUTO-SLIDE ====================
function startAutoSlide() {
    if (autoSlideStopped) return;
    stopAutoSlide();
    autoSlideTimer = setInterval(() => {
        const pages = Array.from(slideTrackEl.children).map(s => s.dataset.page);
        if (pages.length < 2) return;
        const idx = pages.indexOf(currentSlideName);
        const next = pages[(idx + 1) % pages.length];
        goToSlide(next);
    }, SLIDE_INTERVAL);
    console.log('▶️ Auto-slide started (' + SLIDE_INTERVAL + 'ms)');
}

function stopAutoSlide() {
    if (autoSlideTimer) {
        clearInterval(autoSlideTimer);
        autoSlideTimer = null;
    }
}

function resetAutoSlide() {
    if (autoSlideStopped) return;
    startAutoSlide();
}

function userInteractedWithMenu() {
    if (autoSlideStopped) return;
    autoSlideStopped = true;
    stopAutoSlide();
    console.log('⏹️ Auto-slide stopped (user interacted)');
}

// ==================== RENDER: CUSTOMER TILE ====================
async function renderCustomerPage(page, btnElement) {
    ensureSlideTrack();

    // Show the track, hide any admin slot
    slideTrackEl.classList.remove('hidden');
    const existingAdminSlot = document.querySelector('.admin-slot.active');
    if (existingAdminSlot) existingAdminSlot.classList.remove('active');
    slideDotsEl.style.display = 'flex';

    // First visit: preload ALL customer tiles so the rotation is smooth
    // (engagement.html builds all slides up front for the same reason).
    if (Object.keys(slideCache).length === 0) {
        console.log('📥 Preloading all customer tiles...');
        try {
            const results = await Promise.all(
                CUSTOMER_TILES.map(async (p) => {
                    const r = await fetch('/tiles/' + p + '.html');
                    if (!r.ok) throw new Error('HTTP ' + r.status + ' on ' + p);
                    return { page: p, html: await r.text() };
                })
            );

            // Append in CUSTOMER_TILES order so the track matches the config
            results.forEach(({ page: p, html }) => {
                const slide = document.createElement('div');
                slide.className = 'slide';
                slide.dataset.page = p;
                slide.innerHTML = html;

                slide.querySelectorAll('.flip-hint').forEach(function(hint) {
                    hint.onclick = function(e) {
                        e.stopPropagation();
                        const card = this.closest('.flip-card');
                        if (card) card.classList.toggle('flipped');
                    };
                });

                slideTrackEl.appendChild(slide);
                slideCache[p] = slide;
            });

            renderDots();
            console.log('✅ Preloaded', results.length, 'customer tiles');
        } catch (err) {
            console.error('❌ Failed to preload customer tiles:', err);
            slideTrackEl.innerHTML =
                '<div class="simple-page"><h1>Error</h1><p>Failed to load tiles</p></div>';
            return;
        }
    }

    // Make sure the requested page actually exists in the track
    if (!slideCache[page]) {
        console.warn('⚠️ No slide for', page, '— falling back to admin renderer');
        return renderAdminPage(page, btnElement);
    }

    // Every switch — including the first one — uses the same animation.
    goToSlide(page);

    // Run the tile's init function
    const initFn = INIT_MAP[page];
    if (initFn && typeof window[initFn] === 'function') {
        console.log('🔧 Initializing:', page);
        window[initFn]();
    }

    // Dispatch pageChange so pollers can clean up
    document.dispatchEvent(new CustomEvent('pageChange', {
        detail: { page, mode: 'customer' }
    }));

    // Start the rotation now that the track is populated
    if (!autoSlideStopped) {
        resetAutoSlide();
    }
}

// ==================== RENDER: ADMIN TILE ====================
async function renderAdminPage(page, btnElement) {
    // Kill rotation permanently — the user chose an admin tool
    userInteractedWithMenu();
    stopAutoSlide();

    const pageContent = document.getElementById('page-content');
    if (!pageContent) return;

    // Hide slide track if it exists
    if (slideTrackEl) slideTrackEl.classList.add('hidden');
    if (slideDotsEl) slideDotsEl.style.display = 'none';

    // Reuse a single admin slot inside page-content
    let adminSlot = pageContent.querySelector('.admin-slot');
    if (!adminSlot) {
        adminSlot = document.createElement('div');
        adminSlot.className = 'admin-slot';
        pageContent.appendChild(adminSlot);
    }
    adminSlot.classList.add('active');

    try {
        // admin-dashboard is rendered by JS, not fetched
        if (page === 'admin-dashboard') {
            if (typeof window.renderAdminDashboard === 'function') {
                window.renderAdminDashboard();
            } else {
                adminSlot.innerHTML = '<div class="simple-page"><h1>Loading Admin Dashboard...</h1></div>';
                if (typeof window.initAdminDashboard === 'function') {
                    window.initAdminDashboard();
                }
            }
        } else {
            const response = await fetch('/tiles/' + page + '.html');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const html = await response.text();
            adminSlot.innerHTML = html;

            adminSlot.querySelectorAll('.flip-hint').forEach(function(hint) {
                hint.onclick = function(e) {
                    e.stopPropagation();
                    const card = this.closest('.flip-card');
                    if (card) card.classList.toggle('flipped');
                };
            });
        }

        // Run tile init
        const initFn = INIT_MAP[page];
        if (initFn && typeof window[initFn] === 'function') {
            console.log('🔧 Initializing (admin):', page);
            window[initFn]();
        }

        // Special: confirmation page Square return
        if (page === 'confirmation' && typeof window.checkSquareReturn === 'function') {
            console.log('🔵 Confirmation page loaded, checking for order...');
        }

        // Dispatch pageChange
        document.dispatchEvent(new CustomEvent('pageChange', {
            detail: { page, mode: 'admin' }
        }));

    } catch (err) {
        console.error('❌ Failed to load admin page:', page, err);
        adminSlot.innerHTML = '<div class="simple-page"><h1>Error</h1><p>Failed to load page</p></div>';
    }
}

// ==================== SHOW PAGE (dispatcher) ====================
async function showPage(page, btnElement) {
    // Auth gate — same as before
    if (ADMIN_TILES.includes(page)) {
        const user = getUser();
        if (!user || !user.logged_in) {
            showPage('login');
            return;
        }
        const adminOnly = ADMIN_TILES.filter(p => p !== 'dashboard' && p !== 'login');
        if (adminOnly.includes(page) && user.role !== 'admin') {
            showPage('home');
            return;
        }
    }

    // Active button state
    document.querySelectorAll('nav button').forEach(function(btn) {
        btn.classList.remove('active');
    });
    if (btnElement) btnElement.classList.add('active');

    // Dispatch to the right renderer
    if (CUSTOMER_TILES.includes(page)) {
        return renderCustomerPage(page, btnElement);
    }
    return renderAdminPage(page, btnElement);
}

// ==================== NAVIGATION HELPERS ====================
function navigateMenu(direction) {
    console.log('🔄 Navigating:', direction);

    const nav = document.getElementById('menu');
    if (!nav) {
        console.error('❌ Menu not found');
        return;
    }

    const allButtons = nav.querySelectorAll('button');
    const pageButtons = [];

    allButtons.forEach(btn => {
        if (btn.classList.contains('admin-toggle')) return;
        if (btn.classList.contains('login-btn')) return;
        if (btn.title === 'Cart') return;

        const onclick = btn.getAttribute('onclick');
        if (onclick && onclick.includes('showPage')) {
            pageButtons.push(btn);
        }
    });

    const cartBtn = nav.querySelector('[title="Cart"]');
    if (cartBtn && !pageButtons.includes(cartBtn)) {
        pageButtons.push(cartBtn);
    }

    if (pageButtons.length === 0) return;

    let activeIndex = 0;
    pageButtons.forEach((btn, idx) => {
        if (btn.classList.contains('active')) activeIndex = idx;
    });

    if (direction === 'next') {
        activeIndex = (activeIndex + 1) % pageButtons.length;
    } else if (direction === 'prev') {
        activeIndex = (activeIndex - 1 + pageButtons.length) % pageButtons.length;
    }

    if (pageButtons[activeIndex]) pageButtons[activeIndex].click();
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;
        e.preventDefault();
        userInteractedWithMenu();
        navigateMenu('prev');
    } else if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;
        e.preventDefault();
        userInteractedWithMenu();
        navigateMenu('next');
    }
});

// Menu centering (arrow buttons removed)
(function initNavStyles() {
    const styleId = 'nav-arrow-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        #menu {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        /* Kill the margin-left:auto on login so it stops
           pushing the whole row to the left */
        #menu button.login-btn {
            margin-left: 0 !important;
        }
    `;
    document.head.appendChild(style);
})();

// ==================== USER-INTERACTION STOP HOOKS ====================
// Any deliberate nav/tile click stops the rotation permanently.
(function initStopListeners() {
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('nav button');
        if (btn) {
            userInteractedWithMenu();
        }
        if (e.target.closest('#slides-container')) {
            userInteractedWithMenu();
        }
    }, true);
})();

// Make globals
window.navigateMenu = navigateMenu;
window.updateMenu = updateMenu;
window.showPage = showPage;
window.getUser = getUser;

// ==================== SQUARE RETURN ====================
function checkSquareReturnOnStart() {
    console.log('🔵 [APP START] Checking for Square return...');

    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const orderId = urlParams.get('order_id');
    const paymentId = urlParams.get('payment_id');

    console.log(`🔵 [APP START] status: ${status}, orderId: ${orderId}`);

    if (status === 'completed' && orderId) {
        console.log('✅ [APP START] Found completed order:', orderId);
        window.pendingOrderId = orderId;
        window.pendingPaymentId = paymentId;
        setTimeout(function() {
            showPage('confirmation');
        }, 100);
    }
}

window.checkSquareReturnOnStart = checkSquareReturnOnStart;

// ==================== BOOT ====================
document.addEventListener('DOMContentLoaded', function() {
    const homeBtn = document.querySelector('nav button:first-child');
    if (homeBtn) homeBtn.classList.add('active');

    updateMenu();
    checkSquareReturnOnStart();

    if (!window.pendingOrderId) {
        showPage('home');

        // Kick off the auto-slide after the grace period
        setTimeout(function() {
            if (!autoSlideStopped) startAutoSlide();
        }, SLIDE_GRACE);
    }
});