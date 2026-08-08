// static/js/shared.js
// Shared functionality for all pages

// ===== LOAD COMPONENTS =====
function loadNavbar() {
    fetch('/components/navbar.html')
        .then(response => response.text())
        .then(html => {
            document.getElementById('navbar-placeholder').innerHTML = html;
            // Initialize notification bell (defined in notification-bell.js)
            if (typeof initNotificationBell === 'function') {
                initNotificationBell();
            }
            // initSubscriptionModal() is DEPRECATED - using /record-alerts page instead
            // No longer call initSubscriptionModal()
        })
        .catch(error => {
            console.error('Error loading navbar:', error);
        });
}

function loadSubscriptionModal() {
    fetch('/components/subscription-modal.html')
        .then(response => response.text())
        .then(html => {
            document.getElementById('subscription-modal-placeholder').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading subscription modal:', error);
        });
}

// ===== SUBSCRIPTION MODAL INITIALIZATION (DEPRECATED) =====
// Record Alerts now uses a dedicated page at /record-alerts
// This function is kept for backwards compatibility but does NOT attach any click handlers
function initSubscriptionModal() {
    console.log('📄 Record Alerts now uses /record-alerts page (not popup)');
    // The modal functionality is deprecated - use the page instead
    // No click handlers are attached here anymore
    // The subscribe-link in navbar now points directly to /record-alerts
}

// ===== MOBILE MENU =====
function initMobileMenu() {
    // Check if we're on mobile (icons only mode)
    const isMobile = window.innerWidth <= 768;
    
    // Add smooth scrolling for the nav links container
    const navLinks = document.querySelector('.nav-links');
    if (navLinks && isMobile) {
        // Enable horizontal scrolling with momentum
        navLinks.style.webkitOverflowScrolling = 'touch';
        navLinks.style.overflowX = 'auto';
        
        // Hide scrollbar indicator
        navLinks.addEventListener('touchstart', function() {
            this.style.scrollbarWidth = 'none';
        });
    }
    
    // Handle window resize to update mobile state
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            const newIsMobile = window.innerWidth <= 768;
            if (newIsMobile !== isMobile) {
                // Toggle mobile-specific classes if needed
                const navLinksEl = document.querySelector('.nav-links');
                if (navLinksEl) {
                    if (newIsMobile) {
                        navLinksEl.style.webkitOverflowScrolling = 'touch';
                        navLinksEl.style.overflowX = 'auto';
                    } else {
                        navLinksEl.style.webkitOverflowScrolling = '';
                        navLinksEl.style.overflowX = '';
                    }
                }
            }
        }, 250);
    });
}

// ===== NAV TOOLTIPS =====
function initNavTooltips() {
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        // On mobile, show tooltips on tap/long press
        document.querySelectorAll('.nav-link').forEach(link => {
            let pressTimer;
            
            link.addEventListener('touchstart', function(e) {
                pressTimer = setTimeout(function() {
                    const tooltip = link.querySelector('.nav-tooltip');
                    if (tooltip) {
                        tooltip.style.display = 'block';
                        setTimeout(function() {
                            tooltip.style.display = '';
                        }, 2000);
                    }
                }, 500);
            });
            
            link.addEventListener('touchend', function() {
                clearTimeout(pressTimer);
            });
            
            link.addEventListener('touchmove', function() {
                clearTimeout(pressTimer);
            });
        });
    }
}

// ===== LOGOUT FUNCTION =====
function logoutUser() {
    fetch('/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            sessionStorage.clear();
            // Clear cookies
            document.cookie.split(';').forEach(function(c) {
                document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
            });
            window.location.href = '/';
        }
    })
    .catch(error => {
        console.error('Logout error:', error);
        window.location.href = '/';
    });
}

// ===== COOKIE HELPER =====
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// ===== DATE HELPER =====
function getTimeAgo(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

// ===== HTML ESCAPE =====
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}