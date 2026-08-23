// PigStyle Music - Consolidated Configuration File

// ENVIRONMENT CONFIGURATION
const EnvironmentConfig = {
    development: {
        API_BASE_URL: 'http://localhost:5000',
        FRONTEND_URL: 'http://localhost:8000',
        DEBUG: true,
        ENV_NAME: 'development'
    },
    staging: {
        API_BASE_URL: 'https://staging.pigstylemusic.com',
        FRONTEND_URL: 'https://staging.pigstylemusic.com',
        DEBUG: true,
        ENV_NAME: 'staging'
    },
    production: {
        API_BASE_URL: 'https://www.pigstylemusic.com',
        FRONTEND_URL: 'https://www.pigstylemusic.com',
        DEBUG: false,
        ENV_NAME: 'production'
    }
};

const detectEnvironment = () => {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'development';
    if (host.includes('staging') || host.includes('test') || host.includes('dev')) return 'staging';
    return 'production';
};

const CURRENT_ENV = detectEnvironment();
const ENV_CONFIG = EnvironmentConfig[CURRENT_ENV];

const AppConfig = {
    environment: CURRENT_ENV,
    isDevelopment: CURRENT_ENV === 'development',
    isStaging: CURRENT_ENV === 'staging',
    isProduction: CURRENT_ENV === 'production',
    debug: ENV_CONFIG.DEBUG,
    get baseUrl() { return ENV_CONFIG.API_BASE_URL; },
    get frontendUrl() { return ENV_CONFIG.FRONTEND_URL; },
    endpoints: {
        login: '/api/login2',
        logout: '/logout',
        session: '/session/check',
        sessionCheck: '/session/check',
        discogsSearch: '/api/discogs/search',
        discogsRelease: '/api/discogs/release',
        discogsMappings: '/discogs-genre-mappings',
        records: '/records',
        recordById: (id) => `/records/${id}`,
        search: '/api/search',
        recordsCount: '/records/count',
        userRecords: (userId) => `/records/user/${userId}`,
        userRecordsCount: (userId) => `/records/user/${userId}/count`,
        consignorRecords: '/api/consignor/records',
        'catalog/grouped-records': '/catalog/grouped-records',
        genres: '/genres',
        genreByName: (name) => `/genres/by-name/${encodeURIComponent(name)}`,
        config: '/config',
        configByKey: (key) => `/config/${key}`,
        priceAdvice: '/api/price-advice',
        priceEstimate: '/api/price-estimate-v3',
        commissionRate: '/api/commission-rate',
        consignmentRecords: '/consignment/records',
        consignmentStats: '/consignment/stats',
        users: '/users',
        userById: (id) => `/users/${id}`,
        vote: (recordId, voterIp, voteType) => `/api/vote/${recordId}/${voterIp}/${voteType}`,
        userVotes: (voterIp) => `/api/userVotes/${voterIp}`,
        voteCounts: (recordId) => `/api/votes/${recordId}`,
        spotify: '/api/spotify',
        stats: '/stats',
        health: '/health',
        subscriptions: '/api/subscriptions',
        subscribe: '/api/subscribe',
        subscriptionById: (id) => `/api/subscriptions/${id}`,
        subscriptionNotifications: '/api/subscriptions/notifications',
        subscriptionNotificationCount: '/api/subscriptions/notifications/count',
        subscriptionDeactivateAll: '/api/subscriptions/deactivate-all',
    },
    settings: { timeout: 30000, retryAttempts: 3, retryDelay: 1000 },
    getUrl(endpointKey, params = {}) {
        let endpoint = this.endpoints[endpointKey];
        if (!endpoint) { console.error(`Endpoint "${endpointKey}" not found.`); return this.baseUrl; }
        let urlPath = typeof endpoint === 'function' ? endpoint(params) : endpoint;
        let url = `${this.baseUrl}${urlPath}`;
        if (typeof endpoint !== 'function' && params && Object.keys(params).length > 0) {
            const qs = new URLSearchParams(params).toString();
            url += `?${qs}`;
        }
        return url;
    },
    getHeaders(additional = {}) {
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json', ...additional };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    },
    async checkAvailability() {
        try {
            const res = await fetch(`${this.baseUrl}/health`, { method: 'HEAD', timeout: 5000 });
            return res.ok;
        } catch { return false; }
    },
    formatError(error) {
        if (error.response) return { status: error.response.status, message: error.response.data?.error || `HTTP ${error.response.status}`, details: error.response.data };
        if (error.request) return { status: 0, message: 'No response from server.', details: null };
        return { status: -1, message: error.message || 'Unknown error', details: null };
    },
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

const pigstyleAPI = {
    get baseURL() { return AppConfig.baseUrl; },
    get headers() { return AppConfig.getHeaders(); },
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; },
    getUniqueArtists(records) {
        const artists = new Set();
        records.forEach(record => { if (record.artist && record.artist.trim()) artists.add(record.artist.trim()); });
        return Array.from(artists).sort();
    },
    async request(endpointKey, options = {}) {
        const url = AppConfig.getUrl(endpointKey, options.params);
        const config = { method: options.method || 'GET', headers: this.headers, credentials: 'include', ...options };
        try {
            const response = await fetch(url, config);
            if (!response.ok) { const text = await response.text(); throw new Error(`HTTP error! status: ${response.status}`); }
            const data = await response.json();
            if (data.status === 'error') throw new Error(data.error || 'API returned error status');
            return data;
        } catch (error) { console.error(`API request failed for ${endpointKey}:`, error); throw error; }
    },
    loadAllRecords() { return this.request('records'); },
    loadRandomRecords(limit = 500, hasYouTube = true) { return this.request('records', { params: { random: true, limit, has_youtube: hasYouTube } }); },
    loadCatalogGroupedRecords() { return this.request('catalog/grouped-records'); },
    getRecord(recordId) { return this.request('records', { params: { id: recordId } }); },
    searchRecords(searchTerm) { return this.request('search', { params: { q: searchTerm } }); },
    voteOnRecord(recordId, voterIp, voteType) { return this.request('vote', { method: 'POST', params: { recordId, voterIp, voteType } }); },
    getUserVotes(voterIp) { return this.request('userVotes', { params: { voterIp } }); },
    getVoteCounts(recordId) { return this.request('voteCounts', { params: { recordId } }); },
    getSpotifyPlaylists(genreFilter = null) { return this.request('spotify', { params: genreFilter ? { genre: genreFilter } : null }); },
    getUsers() { return this.request('users'); },
    getGenres() { return this.request('genres'); },
    getStats() { return this.request('stats'); },
    healthCheck() { return AppConfig.checkAvailability(); },
    generateVoterHash(ipAddress) {
        let hash = 0;
        for (let i = 0; i < ipAddress.length; i++) { const char = ipAddress.charCodeAt(i); hash = ((hash << 5) - hash) + char; hash = hash & hash; }
        return Math.abs(hash).toString(16);
    },
    async getUserIP() {
        try { const res = await fetch('https://api.ipify.org?format=json'); const data = await res.json(); return data.ip || 'unknown'; }
        catch { if (!sessionStorage.getItem('clientId')) sessionStorage.setItem('clientId', Date.now().toString(36) + Math.random().toString(36).substr(2)); return sessionStorage.getItem('clientId'); }
    },
    formatPrice(price) {
        if (price === null || price === undefined || price === '') return 'Price N/A';
        const num = parseFloat(price);
        return isNaN(num) ? 'Price N/A' : `$${num.toFixed(2)}`;
    },
    truncateText(text, maxLength) { return (!text || text.length <= maxLength) ? text : text.substring(0, maxLength) + '...'; },
    getSubscriptions(params = {}) { return this.request('subscriptions', { params }); },
    createSubscription(data) { return this.request('subscribe', { method: 'POST', body: JSON.stringify(data) }); },
    updateSubscription(id, data) { return this.request('subscriptionById', { method: 'PUT', params: { id }, body: JSON.stringify(data) }); },
    deleteSubscription(id) { return this.request('subscriptionById', { method: 'DELETE', params: { id } }); },
    deactivateAllSubscriptions() { return this.request('subscriptionDeactivateAll', { method: 'POST' }); },
    getNotificationCount() { return this.request('subscriptionNotificationCount'); },
    getNotifications() { return this.request('subscriptionNotifications'); }
};

const Auth = {
    user: null,
    isLoggedIn: false,
    role: null,
    async init() {
        await this.checkSession();
        this.setupEventListeners();
        this.updateUI();
    },
    async checkSession() {
        try {
            const response = await fetch(AppConfig.getUrl('session'), { method: 'GET', credentials: 'include', headers: AppConfig.getHeaders() });
            if (response.ok) {
                const data = await response.json();
                if (data.logged_in && data.user) {
                    this.user = data.user;
                    this.isLoggedIn = true;
                    this.role = data.user.role;
                    console.log('User logged in:', this.user.username, 'Role:', this.role);
                    if (data.token) localStorage.setItem('auth_token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    localStorage.setItem('auth_timestamp', Date.now().toString());
                    this.updateNavLinks();
                } else this.clearAuth();
            } else this.clearAuth();
        } catch (error) { console.error('Session check failed:', error); this.clearAuth(); }
        this.updateAdminLinks();
    },
    updateNavLinks() {
        const link = document.getElementById('dashboard-nav-link');
        if (link) link.style.display = (this.isLoggedIn && (this.role === 'admin' || this.role === 'consignor')) ? 'inline-block' : 'none';
    },
    // Show/hide all admin-only elements (including Accounting link)
    updateAdminLinks() {
        const isAdmin = this.role === 'admin';
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isAdmin ? 'inline-block' : 'none';
        });
    },
    async login(username, password) {
        try {
            const response = await fetch(AppConfig.getUrl('login'), { method: 'POST', headers: AppConfig.getHeaders(), body: JSON.stringify({ username, password }), credentials: 'include' });
            const text = await response.text();
            let data;
            try { data = JSON.parse(text); } catch (e) { return { success: false, error: e }; }
            if (response.ok) {
                this.user = data.user;
                this.isLoggedIn = true;
                this.role = data.user.role;
                if (data.token) localStorage.setItem('auth_token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('auth_timestamp', Date.now().toString());
                this.updateUI();
                this.updateNavLinks();
                this.updateAdminLinks();
                window.location.href = this.role === 'youtube_linker' ? '/youtube-linker' : '/dashboard';
                return { success: true, user: data.user };
            } else return { success: false, error: data.error || 'Login failed' };
        } catch (error) { console.error('Login failed:', error); return { success: false, error: error.message || 'Network error' }; }
    },
    async logout() {
        console.log('Logging out...');
        try {
            const response = await fetch(AppConfig.getUrl('logout'), { method: 'POST', headers: AppConfig.getHeaders(), credentials: 'include' });
            if (response.ok) { const data = await response.json(); console.log('Logout successful:', data.message); }
            else console.error('Logout failed with status:', response.status);
        } catch (error) { console.error('Logout request failed:', error); }
        this.clearAuth();
        this.clearAllCookies();
        this.updateUI();
        this.updateAdminLinks();
        window.location.href = '/';
        return { success: true };
    },
    clearAllCookies() {
        const cookies = document.cookie.split(";");
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i];
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=." + window.location.hostname;
        }
        console.log('All cookies cleared');
    },
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
    hasPermission(requiredRole) {
        if (!this.isLoggedIn) return false;
        const hierarchy = { 'admin': ['admin', 'consignor', 'youtube_linker', 'public'], 'consignor': ['consignor', 'public'], 'youtube_linker': ['youtube_linker', 'public'], 'public': ['public'] };
        return hierarchy[this.role]?.includes(requiredRole) || false;
    },
    canAccess(feature) {
        const permissions = {
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
        if (!permissions[feature]) return true;
        return this.hasAnyRole(permissions[feature]);
    },
    hasAnyRole(roles) { return this.isLoggedIn && roles.includes(this.role); },
    setupEventListeners() {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                const result = await this.login(username, password);
                if (!result.success) this.showMessage(result.error || 'Login failed', 'error');
            });
        }
        const logoutLink = document.getElementById('nav-logout-link');
        if (logoutLink) {
            const newLink = logoutLink.cloneNode(true);
            logoutLink.parentNode.replaceChild(newLink, logoutLink);
            newLink.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); console.log('Logout clicked'); this.logout(); });
        }
    },
    updateUI() {
        this.updateNavbar();
        this.updatePageContent();
        this.updateButtons();
        this.updateAdminLinks();
    },
    // ============================================================
    // Navbar: show/hide static auth links + dashboard link
    // ============================================================
    updateNavbar() {
        const loginLink = document.getElementById('nav-login-link');
        const registerLink = document.getElementById('nav-register-link');
        const logoutLink = document.getElementById('nav-logout-link');
        const dashboardLink = document.getElementById('nav-dashboard-link');
        const notificationContainer = document.getElementById('navbar-notification-container');
        const greeting = document.getElementById('nav-user-greeting');

        // Notification bell
        if (notificationContainer) {
            if (this.isLoggedIn) {
                notificationContainer.classList.remove('hidden');
            } else {
                notificationContainer.classList.add('hidden');
            }
        }

        // Auth links and greeting
        if (loginLink && registerLink && logoutLink) {
            if (this.isLoggedIn) {
                loginLink.style.display = 'none';
                registerLink.style.display = 'none';
                logoutLink.style.display = 'inline-block';
                if (greeting) {
                    greeting.textContent = `Hi, ${this.user?.username || 'User'}`;
                    greeting.style.display = 'inline-block';
                }
                // Show dashboard link when logged in
                if (dashboardLink) {
                    dashboardLink.style.display = 'inline-block';
                }
            } else {
                loginLink.style.display = 'inline-block';
                registerLink.style.display = 'inline-block';
                logoutLink.style.display = 'none';
                if (greeting) greeting.style.display = 'none';
                // Hide dashboard link when not logged in
                if (dashboardLink) {
                    dashboardLink.style.display = 'none';
                }
            }
        }
    },
    updatePageContent() {
        document.querySelectorAll('[data-require-auth], [data-require-role]').forEach(el => {
            const requireAuth = el.getAttribute('data-require-auth');
            const requireRole = el.getAttribute('data-require-role');
            if (requireAuth === 'true' && !this.isLoggedIn) el.style.display = 'none';
            else if (requireRole && !this.hasAnyRole(requireRole.split(','))) el.style.display = 'none';
            else el.style.display = '';
        });
    },
    updateButtons() {
        const addBtn = document.getElementById('add-record-button');
        if (addBtn) { if (this.canAccess('add_records')) { addBtn.style.display = 'inline-block'; addBtn.disabled = false; } else { addBtn.style.display = 'none'; addBtn.disabled = true; } }
        document.querySelectorAll('[data-admin-only]').forEach(btn => {
            if (this.role === 'admin') { btn.style.display = 'inline-block'; btn.disabled = false; } else { btn.style.display = 'none'; btn.disabled = true; }
        });
    },
    showMessage(message, type = 'info') {
        document.querySelectorAll('#auth-message').forEach(el => el.remove());
        const div = document.createElement('div');
        div.id = 'auth-message';
        div.className = `auth-message auth-message-${type}`;
        div.textContent = message;
        div.style.cssText = `position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:4px;color:white;font-weight:500;z-index:1000;animation:slideIn 0.3s ease;background:${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'}`;
        document.body.appendChild(div);
        setTimeout(() => { if (div.parentNode) { div.style.animation = 'slideOut 0.3s ease'; setTimeout(() => div.remove(), 300); } }, 5000);
    },
    getUser() { return this.user; },
    getRole() { return this.role; },
    isAuthenticated() { return this.isLoggedIn; }
};

const addAuthStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .nav-link { color: white; text-decoration: none; display: flex; align-items: center; gap: 8px; font-size: 14px; padding: 6px 12px; border-radius: 4px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); transition: background 0.2s; }
        .nav-link:hover { background: rgba(255,255,255,0.3); }
        #nav-user-greeting { color: #fff; font-weight: 500; margin-right: 10px; display: none; }
        .hidden { display: none !important; }
        .admin-only { display: none; color: #ffb3b3 !important; border-color: rgba(255,107,107,0.4) !important; }
        .admin-only:hover { background: rgba(255,107,107,0.3) !important; }
        .role-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
        .role-badge.admin { background: #dc3545; color: white; }
        .role-badge.consignor { background: #28a745; color: white; }
        .role-badge.youtube_linker { background: #ffc107; color: #333; }
    `;
    document.head.appendChild(style);
};

console.log('PigStyle Music Configuration loading...');
AppConfig.logEnvironmentInfo();
window.AppConfig = AppConfig;
window.pigstyleAPI = pigstyleAPI;
window.Auth = Auth;
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing PigStyle Music...');
    addAuthStyles();
    Auth.init();
    AppConfig.checkAvailability().then(available => console.log(`API is ${available ? 'available' : 'unavailable'}`));
});
console.log('PigStyle Music Configuration loaded successfully.');