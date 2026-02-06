// Authentication Module for PigStyle Music
const Auth = {
    // Current user state
    user: null,
    isLoggedIn: false,
    role: null,
    
    // Initialize auth system
    async init() {
        await this.checkSession();
        this.setupEventListeners();
        this.updateUI();
    },
    
    // Check if user is logged in
    async checkSession() {
        try {
            const response = await fetch(AppConfig.getUrl('sessionCheck'), {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.logged_in && data.user) {
                    this.user = data.user;
                    this.isLoggedIn = true;
                    this.role = data.user.role;
                    console.log('User logged in:', this.user.username);
                    
                    // Store token if available
                    if (data.token) {
                        localStorage.setItem('auth_token', data.token);
                    }
                } else {
                    this.clearAuth();
                }
            } else {
                this.clearAuth();
            }
        } catch (error) {
            console.error('Session check failed:', error);
            this.clearAuth();
        }
    },
    
    // Login user
    async login(username, password) {
        try {
            const response = await fetch(AppConfig.getUrl('login'), {
                method: 'POST',
                headers: AppConfig.getHeaders(),
                body: JSON.stringify({ username, password }),
                credentials: 'include'
            });
            
            const responseText = await response.text();
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                console.error('Failed to parse response:', responseText);
                return { success: false, error: 'Invalid server response' };
            }
            
            if (response.ok) {
                this.user = data.user;
                this.isLoggedIn = true;
                this.role = data.user.role;
                
                // Store token if available
                if (data.token) {
                    localStorage.setItem('auth_token', data.token);
                }
                
                // Store in localStorage for quick access
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('auth_timestamp', Date.now().toString());
                
                this.updateUI();
                return { success: true, user: data.user };
            } else {
                return { success: false, error: data.error || 'Login failed' };
            }
        } catch (error) {
            console.error('Login failed:', error);
            return { success: false, error: error.message || 'Network error' };
        }
    },
    
    // Logout user
    async logout() {
        try {
            await fetch(AppConfig.getUrl('logout'), {
                method: 'POST',
                headers: AppConfig.getHeaders(),
                credentials: 'include'
            });
        } catch (error) {
            console.error('Logout failed:', error);
        }
        
        this.clearAuth();
        this.updateUI();
    },
    
    // Clear authentication data
    clearAuth() {
        this.user = null;
        this.isLoggedIn = false;
        this.role = null;
        localStorage.removeItem('user');
        localStorage.removeItem('auth_timestamp');
        localStorage.removeItem('auth_token');
    },
    
    // Check if user has specific permission
    hasPermission(requiredRole) {
        if (!this.isLoggedIn) return false;
        
        // Role hierarchy: admin > consignor > public
        const roleHierarchy = {
            'admin': ['admin', 'consignor', 'public'],
            'consignor': ['consignor', 'public'],
            'public': ['public']
        };
        
        return roleHierarchy[this.role]?.includes(requiredRole) || false;
    },
    
    // Check if user can access a feature
    canAccess(feature) {
        const featurePermissions = {
            'view_dashboard': ['admin', 'consignor'],
            'view_admin_panel': ['admin'],
            'add_records': ['admin', 'consignor'],
            'manage_all_records': ['admin'],
            'process_payouts': ['admin'],
            'manage_users': ['admin'],
            'edit_own_records': ['admin', 'consignor'],
            'view_sales_reports': ['admin', 'consignor'],
            'request_payout': ['consignor'],
            'approve_payout': ['admin']
        };
        
        if (!featurePermissions[feature]) return true;
        return this.hasAnyRole(featurePermissions[feature]);
    },
    
    // Check if user has any of the required roles
    hasAnyRole(roles) {
        if (!this.isLoggedIn) return false;
        return roles.includes(this.role);
    },
    
    // Setup event listeners
    setupEventListeners() {
        // Login form submission (if exists)
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                
                const result = await this.login(username, password);
                if (result.success) {
                    this.showMessage('Login successful!', 'success');
                    setTimeout(() => {
                        window.location.href = '/dashboard';
                    }, 1000);
                } else {
                    this.showMessage(result.error || 'Login failed', 'error');
                }
            });
        }
        
        // Logout button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'logout-button' || e.target.closest('#logout-button')) {
                e.preventDefault();
                this.logout();
                window.location.href = '/';
            }
        });
    },
    
    // Update UI based on auth state
    updateUI() {
        this.updateNavbar();
        this.updatePageContent();
        this.updateButtons();
    },
    
    // Update navbar based on auth state
    updateNavbar() {
        const authSection = document.getElementById('auth-section');
        if (!authSection) return;
        
        if (this.isLoggedIn) {
            authSection.innerHTML = `
                <div class="user-menu">
                    <span class="user-greeting">Hi, ${this.user.username}</span>
                    <div class="dropdown">
                        <button class="dropdown-toggle">
                            <i class="fas fa-user"></i>
                            <i class="fas fa-caret-down"></i>
                        </button>
                        <div class="dropdown-menu">
                            <a href="/dashboard" class="dropdown-item">
                                <i class="fas fa-tachometer-alt"></i> Dashboard
                            </a>
                            ${this.role === 'admin' ? `
                            <a href="/admin" class="dropdown-item">
                                <i class="fas fa-cog"></i> Admin Panel
                            </a>
                            ` : ''}
                            <div class="dropdown-divider"></div>
                            <a href="#" id="logout-button" class="dropdown-item">
                                <i class="fas fa-sign-out-alt"></i> Logout
                            </a>
                        </div>
                    </div>
                </div>
            `;
        } else {
            authSection.innerHTML = `
                <a href="/login" class="nav-link">
                    <i class="fas fa-sign-in-alt"></i> Login
                </a>
            `;
        }
    },
    
    // Update page content based on auth state
    updatePageContent() {
        const protectedElements = document.querySelectorAll('[data-require-auth], [data-require-role]');
        
        protectedElements.forEach(element => {
            const requireAuth = element.getAttribute('data-require-auth');
            const requireRole = element.getAttribute('data-require-role');
            
            if (requireAuth === 'true' && !this.isLoggedIn) {
                element.style.display = 'none';
            } else if (requireRole && !this.hasAnyRole(requireRole.split(','))) {
                element.style.display = 'none';
            } else {
                element.style.display = '';
            }
        });
    },
    
    // Update buttons based on auth state
    updateButtons() {
        const addRecordBtn = document.getElementById('add-record-button');
        if (addRecordBtn) {
            if (this.canAccess('add_records')) {
                addRecordBtn.style.display = 'inline-block';
                addRecordBtn.disabled = false;
            } else {
                addRecordBtn.style.display = 'none';
                addRecordBtn.disabled = true;
            }
        }
        
        const adminButtons = document.querySelectorAll('[data-admin-only]');
        adminButtons.forEach(button => {
            if (this.role === 'admin') {
                button.style.display = 'inline-block';
                button.disabled = false;
            } else {
                button.style.display = 'none';
                button.disabled = true;
            }
        });
    },
    
    // Show message to user
    showMessage(message, type = 'info') {
        const existingMessage = document.getElementById('auth-message');
        if (existingMessage) existingMessage.remove();
        
        const messageDiv = document.createElement('div');
        messageDiv.id = 'auth-message';
        messageDiv.className = `auth-message auth-message-${type}`;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        if (type === 'success') {
            messageDiv.style.background = '#4CAF50';
        } else if (type === 'error') {
            messageDiv.style.background = '#f44336';
        } else {
            messageDiv.style.background = '#2196F3';
        }
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => messageDiv.remove(), 300);
            }
        }, 5000);
    },
    
    // Get current user info
    getUser() {
        return this.user;
    },
    
    // Get user role
    getRole() {
        return this.role;
    },
    
    // Check if logged in
    isAuthenticated() {
        return this.isLoggedIn;
    }
};

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .user-menu {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .user-greeting {
        color: white;
        font-weight: 500;
    }
    
    .dropdown {
        position: relative;
        display: inline-block;
    }
    
    .dropdown-toggle {
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
    }
    
    .dropdown-menu {
        display: none;
        position: absolute;
        right: 0;
        top: 100%;
        background: white;
        min-width: 200px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border-radius: 4px;
        z-index: 1000;
        margin-top: 5px;
    }
    
    .dropdown:hover .dropdown-menu {
        display: block;
    }
    
    .dropdown-item {
        display: block;
        padding: 10px 15px;
        color: #333;
        text-decoration: none;
        border-bottom: 1px solid #eee;
    }
    
    .dropdown-item:hover {
        background: #f5f5f5;
    }
    
    .dropdown-item i {
        margin-right: 8px;
        width: 16px;
        text-align: center;
    }
    
    .dropdown-divider {
        height: 1px;
        background: #eee;
        margin: 5px 0;
    }
    
    .nav-link {
        color: white;
        text-decoration: none;
        display: flex;
        align-items: center;
        gap: 5px;
    }
    
    .nav-link:hover {
        opacity: 0.9;
    }
`;
document.head.appendChild(style);

// Initialize auth when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});

// Export for use in other modules
window.Auth = Auth;