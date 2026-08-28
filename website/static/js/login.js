// Login page
(function() {
    // ===== DETECT ENVIRONMENT =====
    function getApiBase() {
        const hostname = window.location.hostname;
        const port = window.location.port;
        
        // Production: pigstylemusic.com
        if (hostname === 'www.pigstylemusic.com' || hostname === 'pigstylemusic.com') {
            return '';
        }
        
        // Local development: check if Flask is on 5000 or 5001
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            // If we're on port 8000 (static server), Flask is likely on 5000
            if (port === '8000') {
                return 'http://localhost:5000';
            }
            // If we're on port 5000, Flask is serving everything
            if (port === '5000' || port === '5001') {
                return '';
            }
            // Default to 5000 for local development
            return 'http://localhost:5000';
        }
        
        // Fallback: use relative URLs (same origin)
        return '';
    }

    // ===== GET API BASE URL =====
    const API_BASE = getApiBase();
    console.log('🔧 Login API Base URL:', API_BASE || '(same origin)');

    // ===== LOGIN FUNCTION =====
    window.handleLogin = async function() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        const statusDiv = document.getElementById('loginStatus');
        
        if (!username) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter your username</span>';
            return;
        }
        if (!password) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter your password</span>';
            return;
        }
        
        statusDiv.innerHTML = '<span style="color:#666;">⏳ Logging in...</span>';
        
        try {
            const url = API_BASE + '/api/login';
            console.log('📤 POST', url);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ 
                    username: username,
                    password: password
                })
            });
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('❌ Non-JSON response:', text.substring(0, 200));
                throw new Error('Server returned HTML (likely 404). Check if Flask is running.');
            }
            
            const data = await response.json();
            console.log('📥 Login response:', data);
            
            if (data.status === 'success' && data.user) {
                // Store user data
                localStorage.setItem('pigstyle_user', JSON.stringify({
                    logged_in: true,
                    username: data.user.username || username,
                    role: data.user.role || 'user',
                    user_id: data.user.id || data.user.user_id,
                    full_name: data.user.full_name || username,
                    email: data.user.email || ''
                }));
                
                statusDiv.innerHTML = '<span style="color:#28a745;">✅ Login successful!</span>';
                document.getElementById('loginUsername').value = '';
                document.getElementById('loginPassword').value = '';
                
                // Update menu
                if (typeof updateMenu === 'function') {
                    updateMenu();
                }
                
                // If on login page, go home
                const content = document.getElementById('page-content');
                if (content && content.querySelector('#loginResponse')) {
                    showPage('home');
                }
            } else {
                statusDiv.innerHTML = '<span style="color:#dc3545;">❌ ' + (data.error || 'Invalid credentials') + '</span>';
            }
        } catch(err) {
            console.error('❌ Login error:', err);
            statusDiv.innerHTML = '<span style="color:#dc3545;">❌ ' + err.message + '</span>';
        }
    };

    // ===== CHECK SESSION =====
    window.checkSession = async function() {
        try {
            const url = API_BASE + '/api/session/check';
            console.log('🔍 Checking session:', url);
            
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            console.log('📥 Session check:', data);
            
            if (data.logged_in && data.user) {
                localStorage.setItem('pigstyle_user', JSON.stringify({
                    logged_in: true,
                    username: data.user.username,
                    role: data.user.role,
                    user_id: data.user.id,
                    full_name: data.user.full_name || data.user.username,
                    email: data.user.email || ''
                }));
                
                if (typeof updateMenu === 'function') {
                    updateMenu();
                }
                return true;
            }
            return false;
        } catch(err) {
            console.error('❌ Session check failed:', err);
            return false;
        }
    };

    // ===== LOGOUT =====
    window.handleLogout = function() {
        localStorage.removeItem('pigstyle_user');
        if (typeof updateMenu === 'function') {
            updateMenu();
        }
        showPage('home');
    };

    // ===== INIT =====
    window.initLogin = function() {
        console.log('🔐 Login page initialized');
        console.log('📡 API Base:', API_BASE || '(same origin)');
        
        // Auto-login check
        const user = localStorage.getItem('pigstyle_user');
        if (user) {
            try {
                const parsed = JSON.parse(user);
                if (parsed.logged_in && typeof updateMenu === 'function') {
                    updateMenu();
                }
            } catch {}
        }
        
        // Enter key support
        const passwordInput = document.getElementById('loginPassword');
        if (passwordInput) {
            passwordInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    window.handleLogin();
                }
            });
        }
        
        const usernameInput = document.getElementById('loginUsername');
        if (usernameInput) {
            usernameInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('loginPassword').focus();
                }
            });
        }
    };
})();