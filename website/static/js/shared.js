// static/js/shared.js
// Shared functionality for all pages

// ===== LOAD COMPONENTS =====
function loadNavbar() {
    const placeholder = document.getElementById('navbar-placeholder');
    if (!placeholder) return;

    fetch('/components/navbar.html')
        .then(response => response.text())
        .then(html => {
            placeholder.innerHTML = html;
            // Apply auth state directly from localStorage (bypass session check)
            applyAuthFromLocalStorage();
            // Initialize notification bell
            if (typeof initNotificationBell === 'function') {
                initNotificationBell();
            }
            initSubscriptionModal();
        })
        .catch(error => {
            console.error('Error loading navbar:', error);
        });
}
 
// ===== SUBSCRIPTION MODAL INITIALIZATION =====
function initSubscriptionModal() {
    const subscribeLink = document.getElementById('subscribe-link');
    const subscribeModal = document.getElementById('subscribe-modal');
    const subscribeClose = document.querySelector('.subscribe-modal-close');
    const subscribeForm = document.getElementById('subscribe-form');
    const subscribeMessage = document.getElementById('subscribe-message');

    if (!subscribeLink || !subscribeModal) return;

    subscribeLink.addEventListener('click', function(e) {
        e.preventDefault();
        subscribeModal.style.display = 'flex';
        document.body.classList.add('modal-open');
    });

    if (subscribeClose) {
        subscribeClose.addEventListener('click', function() {
            subscribeModal.style.display = 'none';
            document.body.classList.remove('modal-open');
            if (subscribeMessage) subscribeMessage.style.display = 'none';
            if (subscribeForm) subscribeForm.reset();
        });
    }

    subscribeModal.addEventListener('click', function(e) {
        if (e.target === subscribeModal) {
            subscribeModal.style.display = 'none';
            document.body.classList.remove('modal-open');
            if (subscribeMessage) subscribeMessage.style.display = 'none';
            if (subscribeForm) subscribeForm.reset();
        }
    });

    if (subscribeForm) {
        subscribeForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('subscribe-email').value.trim();
            const artist = document.getElementById('subscribe-artist').value.trim();
            const title = document.getElementById('subscribe-title').value.trim();
            const catalog_number = document.getElementById('subscribe-catalog').value.trim();
            
            if (!artist && !title && !catalog_number) {
                showSubscribeMessage('Please enter at least one search term (artist, title, or catalog number)', 'error');
                return;
            }
            
            if (!email || !email.includes('@') || !email.includes('.')) {
                showSubscribeMessage('Please enter a valid email address', 'error');
                return;
            }
            
            const submitBtn = subscribeForm.querySelector('.subscribe-submit-btn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subscribing...';
            
            try {
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                const apiUrl = isLocalhost 
                    ? 'http://localhost:5000/api/subscribe'
                    : `https://${window.location.hostname}/api/subscribe`;
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ email, artist, title, catalog_number })
                });
                
                const data = await response.json();
                
                if (response.ok && data.status === 'success') {
                    showSubscribeMessage(data.already_subscribed ? data.message : 'Thank you for subscribing! We\'ll email you when matching records arrive.', data.already_subscribed ? 'info' : 'success');
                    subscribeForm.reset();
                    
                    setTimeout(() => {
                        subscribeModal.style.display = 'none';
                        document.body.classList.remove('modal-open');
                        if (subscribeMessage) subscribeMessage.style.display = 'none';
                    }, 3000);
                } else {
                    showSubscribeMessage(data.error || 'Something went wrong. Please try again.', 'error');
                }
            } catch (error) {
                console.error('Subscription error:', error);
                showSubscribeMessage('Network error. Please try again.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-bell"></i> Subscribe';
            }
        });
    }

    function showSubscribeMessage(message, type) {
        if (!subscribeMessage) return;
        subscribeMessage.textContent = message;
        subscribeMessage.style.display = 'block';
        subscribeMessage.style.background = type === 'success' ? '#d4edda' : (type === 'info' ? '#cce5ff' : '#f8d7da');
        subscribeMessage.style.color = type === 'success' ? '#155724' : (type === 'info' ? '#004085' : '#721c24');
        subscribeMessage.style.border = type === 'success' ? '1px solid #c3e6cb' : (type === 'info' ? '1px solid #b8daff' : '1px solid #f5c6cb');
        subscribeMessage.style.borderRadius = '4px';
        subscribeMessage.style.padding = '12px';
        subscribeMessage.style.marginTop = '15px';
    }
}

// ===== AUTH STATE FROM LOCALSTORAGE =====
function applyAuthFromLocalStorage() {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('user');
    
    // User is logged in if EITHER token OR user exists
    const isLoggedIn = !!(token || userStr);

    let username = '';
    let role = '';
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            username = user.username || user.full_name || 'User';
            role = user.role || '';
        } catch (e) {}
    }

    const isAdmin = role === 'admin';

    // Get all navbar elements
    const loginLink = document.getElementById('nav-login-link');
    const registerLink = document.getElementById('nav-register-link');
    const logoutLink = document.getElementById('nav-logout-link');
    const greeting = document.getElementById('nav-user-greeting');
    const notificationContainer = document.getElementById('navbar-notification-container');
    const adminLinks = document.querySelectorAll('.admin-only');

    if (isLoggedIn) {
        if (loginLink) loginLink.style.display = 'none';
        if (registerLink) registerLink.style.display = 'none';
        if (logoutLink) logoutLink.style.display = 'inline-block';
        if (greeting) {
            greeting.textContent = `Hi, ${username || 'User'}`;
            greeting.style.display = 'inline-block';
        }
        if (notificationContainer) notificationContainer.classList.remove('hidden');
        // Show admin links only if admin
        adminLinks.forEach(el => {
            el.style.display = isAdmin ? 'inline-block' : 'none';
        });
    } else {
        if (loginLink) loginLink.style.display = 'inline-block';
        if (registerLink) registerLink.style.display = 'inline-block';
        if (logoutLink) logoutLink.style.display = 'none';
        if (greeting) greeting.style.display = 'none';
        if (notificationContainer) notificationContainer.classList.add('hidden');
        adminLinks.forEach(el => el.style.display = 'none');
    }

    console.log('Navbar updated from localStorage. Logged in:', isLoggedIn, 'Role:', role);
}

// ===== AUTO‑INIT ON DOM READY =====
document.addEventListener('DOMContentLoaded', function() {
    // Load navbar if placeholder exists
    loadNavbar();
    
});