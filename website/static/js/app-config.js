// PigStyle Music - Consolidated Configuration File

// ENVIRONMENT CONFIGURATION
const EnvironmentConfig = {
    // Development environment (localhost)
    development: {
        API_BASE_URL: 'http://localhost:5000',
        FRONTEND_URL: 'http://localhost:8000',
        DEBUG: true,
        ENV_NAME: 'development'
    },
    
    // Staging/test environment
    staging: {
        API_BASE_URL: 'https://staging.pigstylemusic.com',
        FRONTEND_URL: 'https://staging.pigstylemusic.com',
        DEBUG: true,
        ENV_NAME: 'staging'
    },
    
    // Production environment
    production: {
        API_BASE_URL: 'https://www.pigstylemusic.com',
        FRONTEND_URL: 'https://www.pigstylemusic.com',
        DEBUG: false,
        ENV_NAME: 'production'
    }
};

// AUTO-DETECT ENVIRONMENT
const detectEnvironment = () => {
    const currentHostname = window.location.hostname;
    const currentPort = window.location.port;
    
    // Development environments
    if (currentHostname === 'localhost' || currentHostname === '127.0.0.1') {
        return 'development';
    }
    
    // Staging environment (if you have one)
    if (currentHostname.includes('staging') || 
        currentHostname.includes('test') || 
        currentHostname.includes('dev')) {
        return 'staging';
    }
    
    // Production (everything else)
    return 'production';
};

// CURRENT ENVIRONMENT
const CURRENT_ENV = detectEnvironment();
const ENV_CONFIG = EnvironmentConfig[CURRENT_ENV];

// MAIN APP CONFIGURATION
const AppConfig = {
    // Environment info
    environment: CURRENT_ENV,
    isDevelopment: CURRENT_ENV === 'development',
    isStaging: CURRENT_ENV === 'staging',
    isProduction: CURRENT_ENV === 'production',
    debug: ENV_CONFIG.DEBUG,
    
    // Dynamically sets the correct URL for local dev vs production
    get baseUrl() {
        return ENV_CONFIG.API_BASE_URL;
    },
    
    get frontendUrl() {
        return ENV_CONFIG.FRONTEND_URL;
    },
    
    // API Endpoints Configuration
    endpoints: {
        // Authentication
        login: '/api/login',
        logout: '/logout',
        session: '/session/check',
        sessionCheck: '/session/check', // Alias for backward compatibility
        
        // Discogs
        discogsSearch: '/api/discogs/search',
        discogsRelease: '/api/discogs/release',
        discogsMappings: '/discogs-genre-mappings',
        
        // Records
        records: '/records',
        recordById: (id) => `/records/${id}`,
        search: '/api/search',
        recordsCount: '/records/count',
        userRecords: (userId) => `/records/user/${userId}`,
        userRecordsCount: (userId) => `/records/user/${userId}/count`,
        consignorRecords: '/api/consignor/records',
        'catalog/grouped-records': '/catalog/grouped-records',

        // Genres
        genres: '/genres',
        genreByName: (name) => `/genres/by-name/${encodeURIComponent(name)}`,
        
        // Config
        config: '/config',
        configByKey: (key) => `/config/${key}`,
        
        // Price & Commission
        priceAdvice: '/api/price-advice',
        priceEstimate: '/api/price-estimate',
        commissionRate: '/api/commission-rate',
        
        // Consignment
        consignmentRecords: '/consignment/records',
        consignmentStats: '/consignment/stats',
        
        // Users
        users: '/users',
        userById: (id) => `/users/${id}`,
        
        // Voting (legacy endpoints)
        vote: (recordId, voterIp, voteType) => `/api/vote/${recordId}/${voterIp}/${voteType}`,
        userVotes: (voterIp) => `/api/userVotes/${voterIp}`,
        voteCounts: (recordId) => `/api/votes/${recordId}`,
        
        // Spotify
        spotify: '/api/spotify',
        
        // Stats & Health
        stats: '/stats',
        health: '/health'
    },
    
    // API Request settings
    settings: {
        timeout: 30000, // 30 seconds
        retryAttempts: 3,
        retryDelay: 1000
    },
    
    // Get full URL for endpoint
    getUrl(endpointKey, params = {}) {
        let endpoint = this.endpoints[endpointKey];
        if (!endpoint) {
            console.error(`Endpoint "${endpointKey}" not found in config.`);
            return this.baseUrl;
        }
        
        let urlPath;
        if (typeof endpoint === 'function') {
            urlPath = endpoint(params);
        } else {
            urlPath = endpoint;
        }
        
        let url = `${this.baseUrl}${urlPath}`;
        
        // Add query parameters if not a function endpoint
        if (typeof endpoint !== 'function' && params && Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            url += `?${queryString}`;
        }
        
        return url;
    },
    
    // Method to get standard headers
    getHeaders(additionalHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...additionalHeaders
        };
        
        // Add auth token if it exists
        const token = localStorage.getItem('auth_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        return headers;
    },
    
    // Check if API is available
    async checkAvailability() {
        try {
            const response = await fetch(`${this.baseUrl}/health`, { 
                method: 'HEAD',
                timeout: 5000 
            });
            return response.ok;
        } catch (error) {
            console.warn('API health check failed:', error);
            return false;
        }
    },
    
    // Format API error messages
    formatError(error) {
        if (error.response) {
            return {
                status: error.response.status,
                message: error.response.data?.error || `HTTP ${error.response.status}`,
                details: error.response.data
            };
        } else if (error.request) {
            return {
                status: 0,
                message: 'No response from server. Please check your connection.',
                details: null
            };
        } else {
            return {
                status: -1,
                message: error.message || 'Unknown error',
                details: null
            };
        }
    },
    
    // Log environment info
    logEnvironmentInfo() {
        console.log('=== PigStyle Music Environment Info ===');
        console.log(`Environment: ${this.environment.toUpperCase()}`);
        console.log(`API Base URL: ${this.baseUrl}`);
        console.log(`Frontend URL: ${this.frontendUrl}`);
        console.log(`Debug Mode: ${this.debug}`);
        console.log(`Browser Location: ${window.location.href}`);
        console.log('=====================================');
    }
};

// API UTILITIES
const pigstyleAPI = {
    // Use the centralized config
    get baseURL() {
        return AppConfig.baseUrl;
    },
    
    // Common headers
    get headers() {
        return AppConfig.getHeaders();
    },
    
    // Escape HTML to prevent XSS attacks
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // Get unique artists from records array
    getUniqueArtists(records) {
        const artists = new Set();
        records.forEach(record => {
            if (record.artist && record.artist.trim() !== '') {
                artists.add(record.artist.trim());
            }
        });
        return Array.from(artists).sort();
    },
    
    // Generic request method
    async request(endpointKey, options = {}) {
        const url = AppConfig.getUrl(endpointKey, options.params);
        const config = {
            method: options.method || 'GET',
            headers: this.headers,
            credentials: 'include',
            ...options
        };
        
        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`API error ${response.status}:`, errorText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'error') {
                throw new Error(data.error || 'API returned error status');
            }
            
            return data;
        } catch (error) {
            console.error(`API request failed for ${endpointKey}:`, error);
            throw error;
        }
    },
    
    // Get all records from API
    loadAllRecords() {
        console.log('Loading all records from API...');
        return this.request('records');
    },
    
    // Get random records for streaming page
    loadRandomRecords(limit = 500, hasYouTube = true) {
        console.log(`Loading ${limit} random records ${hasYouTube ? 'with YouTube' : ''}...`);
        return this.request('records', {
            params: { random: true, limit, has_youtube: hasYouTube }
        });
    },
    
    loadCatalogGroupedRecords() {
        console.log('Loading catalog grouped records...');
        return this.request('catalog/grouped-records');
    },
    
    // Get a single record by ID
    getRecord(recordId) {
        return this.request('records', {
            params: { id: recordId }
        });
    },
    
    // Search records
    searchRecords(searchTerm) {
        return this.request('search', {
            params: { q: searchTerm }
        });
    },
    
    // Vote on a record (legacy - use with caution)
    voteOnRecord(recordId, voterIp, voteType) {
        return this.request('vote', {
            method: 'POST',
            params: { recordId, voterIp, voteType }
        });
    },
    
    // Get user's votes (legacy)
    getUserVotes(voterIp) {
        return this.request('userVotes', {
            params: { voterIp }
        });
    },
    
    // Get vote counts for a record (legacy)
    getVoteCounts(recordId) {
        return this.request('voteCounts', {
            params: { recordId }
        });
    },
    
    // Get Spotify playlists
    getSpotifyPlaylists(genreFilter = null) {
        const params = genreFilter ? { genre: genreFilter } : null;
        return this.request('spotify', { params });
    },
    
    // Get all users
    getUsers() {
        return this.request('users');
    },
    
    // Get all genres
    getGenres() {
        return this.request('genres');
    },
    
    // Get database statistics
    getStats() {
        return this.request('stats');
    },
    
    // Health check
    healthCheck() {
        return AppConfig.checkAvailability();
    },
    
    // Generate voter hash from IP address
    generateVoterHash(ipAddress) {
        let hash = 0;
        for (let i = 0; i < ipAddress.length; i++) {
            const char = ipAddress.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    },
    
    // Get user's IP address (client-side approximation)
    async getUserIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip || 'unknown';
        } catch (error) {
            console.log('Could not get public IP, using fallback');
            if (!sessionStorage.getItem('clientId')) {
                sessionStorage.setItem('clientId', Date.now().toString(36) + Math.random().toString(36).substr(2));
            }
            return sessionStorage.getItem('clientId');
        }
    },
    
    // Format price for display
    formatPrice(price) {
        if (price === null || price === undefined || price === '') {
            return 'Price N/A';
        }
        try {
            const priceNum = parseFloat(price);
            if (isNaN(priceNum)) {
                return 'Price N/A';
            }
            return `$${priceNum.toFixed(2)}`;
        } catch (error) {
            return 'Price N/A';
        }
    },
    
    // Truncate text with ellipsis
    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + '...';
    }
};

// AUTHENTICATION MODULE
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
            const response = await fetch(AppConfig.getUrl('session'), {
                method: 'GET',
                credentials: 'include',
                headers: AppConfig.getHeaders()
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.logged_in && data.user) {
                    this.user = data.user;
                    this.isLoggedIn = true;
                    this.role = data.user.role;
                    console.log('User logged in:', this.user.username, 'Role:', this.role);
                    
                    // Store token if available
                    if (data.token) {
                        localStorage.setItem('auth_token', data.token);
                    }
                    
                    // Store in localStorage for quick access
                    localStorage.setItem('user', JSON.stringify(data.user));
                    localStorage.setItem('auth_timestamp', Date.now().toString());
                    
                    // Update navbar links based on role
                    this.updateNavLinks();
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
    
    // Update navigation links based on role
    updateNavLinks() {
        const dashboardLink = document.getElementById('dashboard-nav-link');
        const youtubeLinkerLink = document.getElementById('youtube-linker-nav-link');
        
        if (!dashboardLink || !youtubeLinkerLink) return;
        
        if (this.isLoggedIn) {
            if (this.role === 'youtube_linker') {
                dashboardLink.style.display = 'none';
                youtubeLinkerLink.style.display = 'inline-block';
            } else if (this.role === 'admin' || this.role === 'consignor') {
                dashboardLink.style.display = 'inline-block';
                youtubeLinkerLink.style.display = 'none';
            }
        } else {
            dashboardLink.style.display = 'none';
            youtubeLinkerLink.style.display = 'none';
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
                this.updateNavLinks();
                
                // Redirect based on role
                if (this.role === 'youtube_linker') {
                    window.location.href = '/youtube-linker';
                } else {
                    window.location.href = '/dashboard';
                }
                
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
        console.log('Logging out...');
        
        try {
            // Call the logout endpoint
            const response = await fetch(AppConfig.getUrl('logout'), {
                method: 'POST',
                headers: AppConfig.getHeaders(),
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Logout successful:', data.message);
            } else {
                console.error('Logout failed with status:', response.status);
            }
        } catch (error) {
            console.error('Logout request failed:', error);
        }
        
        // Clear all client-side auth data
        this.clearAuth();
        
        // Force clear all cookies
        this.clearAllCookies();
        
        // Update UI to show logged out state
        this.updateUI();
        
        // Redirect to home page
        window.location.href = '/';
        
        return { success: true };
    },
    
    // Clear all cookies
    clearAllCookies() {
        const cookies = document.cookie.split(";");
        
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i];
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
            
            // Clear cookie for all paths and domains
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=." + window.location.hostname;
        }
        
        console.log('All cookies cleared');
    },
    
    // Clear authentication data
    clearAuth() {
        this.user = null;
        this.isLoggedIn = false;
        this.role = null;
        localStorage.removeItem('user');
        localStorage.removeItem('auth_timestamp');
        localStorage.removeItem('auth_token');
        sessionStorage.removeItem('clientId');
        console.log('Auth data cleared from localStorage');
    },
    
    // Check if user has specific permission
    hasPermission(requiredRole) {
        if (!this.isLoggedIn) return false;
        
        // Role hierarchy: admin > consignor > youtube_linker > public
        const roleHierarchy = {
            'admin': ['admin', 'consignor', 'youtube_linker', 'public'],
            'consignor': ['consignor', 'public'],
            'youtube_linker': ['youtube_linker', 'public'],
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
            'approve_payout': ['admin'],
            'link_youtube': ['admin', 'youtube_linker']
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
                if (!result.success) {
                    this.showMessage(result.error || 'Login failed', 'error');
                }
            });
        }
        
        // Logout button event listener
        document.addEventListener('click', (e) => {
            const logoutButton = e.target.closest('#logout-button');
            if (logoutButton) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Logout button clicked');
                this.logout();
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
                    <span class="user-greeting">Hi, ${this.user?.username || 'User'}</span>
                    <div class="dropdown">
                        <button class="dropdown-toggle" id="dropdown-toggle-button" aria-label="User menu">
                            <i class="fas fa-user"></i>
                            <i class="fas fa-caret-down"></i>
                        </button>
                        <div class="dropdown-menu" id="dropdown-menu">
                            ${this.role === 'youtube_linker' ? `
                            <a href="/youtube-linker" class="dropdown-item">
                                <i class="fab fa-youtube"></i> YouTube Linker
                            </a>
                            ` : ''}
                            ${this.role === 'admin' || this.role === 'consignor' ? `
                            <a href="/dashboard" class="dropdown-item">
                                <i class="fas fa-tachometer-alt"></i> Dashboard
                            </a>
                            ` : ''}
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
            
            // Set up dropdown interaction
            this.setupDropdown();
            
            // Direct attachment of logout button click handler
            setTimeout(() => {
                const logoutBtn = document.getElementById('logout-button');
                if (logoutBtn) {
                    const newLogoutBtn = logoutBtn.cloneNode(true);
                    logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
                    
                    newLogoutBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Logout button clicked (direct handler)');
                        this.logout();
                    });
                }
            }, 50);
            
        } else {
            authSection.innerHTML = `
                <a href="/login" class="nav-link">
                    <i class="fas fa-sign-in-alt"></i> Login
                </a>
            `;
        }
    },
    
    // Setup dropdown interaction
    setupDropdown() {
        setTimeout(() => {
            const toggleButton = document.getElementById('dropdown-toggle-button');
            const dropdownMenu = document.getElementById('dropdown-menu');
            
            if (toggleButton && dropdownMenu) {
                const newToggleButton = toggleButton.cloneNode(true);
                toggleButton.parentNode.replaceChild(newToggleButton, toggleButton);
                
                newToggleButton.addEventListener('click', function(e) {
                    e.stopPropagation();
                    dropdownMenu.classList.toggle('show');
                });
                
                document.addEventListener('click', function(e) {
                    if (!newToggleButton.contains(e.target) && !dropdownMenu.contains(e.target)) {
                        dropdownMenu.classList.remove('show');
                    }
                });
                
                dropdownMenu.addEventListener('mouseenter', function() {
                    dropdownMenu.classList.add('show');
                });
                
                dropdownMenu.addEventListener('mouseleave', function() {
                    dropdownMenu.classList.remove('show');
                });
                
                dropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
                    item.addEventListener('click', function() {
                        dropdownMenu.classList.remove('show');
                    });
                });
                
                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape' && dropdownMenu.classList.contains('show')) {
                        dropdownMenu.classList.remove('show');
                    }
                });
            }
        }, 100);
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
const addAuthStyles = () => {
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
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .user-menu {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .user-greeting {
            color: white;
            font-weight: 500;
            font-size: 14px;
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
            gap: 8px;
            font-size: 14px;
            min-width: 40px;
            justify-content: center;
            transition: background 0.2s;
        }
        
        .dropdown-toggle:hover {
            background: rgba(255, 255, 255, 0.3);
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
            animation: fadeIn 0.2s ease;
            border: 1px solid #ddd;
        }
        
        .dropdown-menu.show {
            display: block;
        }
        
        .dropdown-item {
            display: flex;
            align-items: center;
            padding: 10px 15px;
            color: #333 !important;  // Add !important here

            text-decoration: none;
            border-bottom: 1px solid #eee;
            transition: background 0.2s;
            font-size: 14px;
        }
        
        .dropdown-item:hover {
            background: #f5f5f5;
            color: #000;
        }
        
        .dropdown-item i {
            margin-right: 10px;
            width: 16px;
            text-align: center;
            color: #666;
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
            gap: 8px;
            font-size: 14px;
            padding: 6px 12px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            transition: background 0.2s;
        }
        
        .nav-link:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        /* Role badges */
        .role-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .role-badge.admin { background: #dc3545; color: white; }
        .role-badge.consignor { background: #28a745; color: white; }
        .role-badge.youtube_linker { background: #ffc107; color: #333; }
        
        /* Fix for small screens */
        @media (max-width: 768px) {
            .user-greeting {
                display: none;
            }
            
            .dropdown-menu {
                position: fixed;
                top: 60px;
                right: 20px;
                left: auto;
                min-width: 180px;
            }
        }
    `;
    document.head.appendChild(style);
};

// INITIALIZATION
console.log('PigStyle Music Configuration loading...');
AppConfig.logEnvironmentInfo(); // Log environment info on load

// Make everything globally available
window.AppConfig = AppConfig;
window.pigstyleAPI = pigstyleAPI;
window.Auth = Auth;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing PigStyle Music...');
    addAuthStyles();
    Auth.init();
    
    // Optional: Check API availability on load
    AppConfig.checkAvailability().then(isAvailable => {
        console.log(`API is ${isAvailable ? 'available' : 'unavailable'}`);
    });
});

console.log('PigStyle Music Configuration loaded successfully.');