// ============================================================================
// utils.js - Shared Utilities and Core Functions (UPDATED - NO fetchAllConfigValues)
// ============================================================================

// API Utility
const APIUtils = {
    baseUrl: window.AppConfig ? AppConfig.baseUrl : 'http://localhost:5000',
    
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        
        const token = localStorage.getItem('auth_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        return headers;
    },
    
    async request(method, endpoint, data = null, queryParams = null) {
        let url = `${this.baseUrl}${endpoint}`;
        
        if (queryParams) {
            const params = new URLSearchParams(queryParams).toString();
            url += `?${params}`;
        }
        
        const options = {
            method: method,
            headers: this.getHeaders(),
            credentials: 'include'
        };
        
        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'error') {
            throw new Error(result.error || 'API returned error status');
        }
        
        return result;
    },
    
    async get(endpoint, queryParams = null) {
        return this.request('GET', endpoint, null, queryParams);
    },
    
    async post(endpoint, data) {
        return this.request('POST', endpoint, data);
    },
    
    async put(endpoint, data) {
        return this.request('PUT', endpoint, data);
    },
    
    async delete(endpoint) {
        return this.request('DELETE', endpoint);
    }
};

// UI Helper Functions
function showMessage(message, type = 'info') {
    document.querySelectorAll('.message-popup').forEach(el => el.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-popup message-${type}`;
    
    messageDiv.innerHTML = `
        <div style="
            position: fixed;
            top: 100px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196F3'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 2000;
            display: flex;
            align-items: center;
            gap: 10px;
            max-width: 400px;
            animation: slideIn 0.3s ease;
        ">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}" 
               style="font-size: 20px;"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 5000);
}

function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status-message');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-message status-${type}`;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}

function showCheckoutStatus(message, type = 'info') {
    const statusEl = document.getElementById('checkout-status-message');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-message status-${type}`;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}

function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = show ? 'block' : 'none';
}

function showCheckoutLoading(show) {
    const loadingEl = document.getElementById('checkout-loading');
    if (loadingEl) loadingEl.style.display = show ? 'block' : 'none';
}

function showReceiptsLoading(show) {
    const loadingEl = document.getElementById('receipts-loading');
    if (loadingEl) loadingEl.style.display = show ? 'block' : 'none';
}

function showArtistsLoading(show) {
    const loadingEl = document.getElementById('artists-loading');
    if (loadingEl) loadingEl.style.display = show ? 'block' : 'none';
}

function showGenresLoading(show) {
    const loadingEl = document.getElementById('genres-loading');
    if (loadingEl) loadingEl.style.display = show ? 'block' : 'none';
}

function showAccessoriesLoading(show) {
    const loadingEl = document.getElementById('accessories-loading');
    if (loadingEl) loadingEl.style.display = show ? 'block' : 'none';
}

// Text Utilities
function escapeHtml(text) {
    if (!text) return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength - 1) + '…' : text;
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch (e) {
        return dateString.split('T')[0] || 'Unknown';
    }
}

// Status Utilities
function getStatusClass(statusId) {
    switch(statusId) {
        case 1: return 'condition-gplus';
        case 2: return 'condition-vgplus';
        case 3: return 'condition-mint';
        default: return 'condition-g';
    }
}

function getStatusText(statusId) {
    switch(statusId) {
        case 1: return 'Inactive';
        case 2: return 'Active';
        case 3: return 'Sold';
        default: return `Status ${statusId || '?'}`;
    }
}

function getStatusIdFromFilter(filterValue) {
    switch(filterValue) {
        case 'inactive': return 1;
        case 'active': return 2;
        case 'sold': return 3;
        default: return null;
    }
}

// Global Variables
let consignorCache = {};
let allRecords = [];
let filteredRecords = [];
let currentPage = 1;
let pageSize = 100;
let totalPages = 1;

// REMOVED: dbConfigValues global - no longer used
// let dbConfigValues = {};

let recentlyPrintedIds = new Set();
let savedReceipts = [];

// Placeholder functions - will be overridden by receipts.js
window.loadSavedReceipts = function() { return []; };
window.saveReceipt = function(transaction) { };
window.renderReceipts = function(receipts) { };
window.searchReceipts = function() { };
window.resetReceiptSearch = function() { };
window.viewReceiptDetails = function(receiptId) { };
window.closeReceiptModal = function() { };
window.showRefundModal = function(receiptId) { };
window.closeRefundModal = function() { };
window.processRefund = function() { };
window.downloadReceiptPDF = function(receiptId) { };
window.printReceipt = function(receiptId) { };
window.printToThermalPrinter = function(text) { };
window.formatReceiptForPrinter = function(transaction) { return ''; };

// Auth object
if (typeof window.Auth === 'undefined') {
    window.Auth = {
        isLoggedIn: false,
        user: null,
        
        async checkSession() {
            const token = localStorage.getItem('auth_token');
            if (token) {
                this.isLoggedIn = true;
                try {
                    const response = await APIUtils.get('/auth/me');
                    if (response.status === 'success' && response.user) {
                        this.user = response.user;
                    }
                } catch (error) {
                    console.error('Auth check failed:', error);
                }
            }
            return this.isLoggedIn;
        },
        
        getUser() {
            return this.user;
        },
        
        isAdmin() {
            return this.user && this.user.role === 'admin';
        },
        
        isConsignor() {
            return this.user && this.user.role === 'consignor';
        },
        
        isYoutubeLinker() {
            return this.user && this.user.role === 'youtube_linker';
        },
        
        hasPermission(permission) {
            if (!this.isLoggedIn) return false;
            
            const permissions = {
                'admin': ['view_dashboard', 'view_admin_panel', 'add_records', 'manage_all_records', 
                         'process_payouts', 'manage_users', 'edit_own_records', 'view_sales_reports',
                         'approve_payout', 'link_youtube'],
                'consignor': ['view_dashboard', 'add_records', 'edit_own_records', 'view_sales_reports',
                             'request_payout', 'link_youtube'],
                'youtube_linker': ['view_dashboard', 'link_youtube']
            };
            
            return permissions[this.user?.role]?.includes(permission) || false;
        }
    };
}

/**
 * Verify that required configuration values are available
 * @returns {Promise<boolean>} True if all required configs are available
 */
async function verifyRequiredConfigs() {
    console.log('🟡 utils.js: Verifying required configuration values...');
    
    const requiredConfigs = ['TAX_ENABLED', 'TAX_RATE', 'STORE_NAME'];
    const missingConfigs = [];
    const configValues = {};
    
    for (const key of requiredConfigs) {
        try {
            // Try to use getConfigValue from config-value-manager.js
            if (typeof window.getConfigValue === 'function') {
                const value = await window.getConfigValue(key);
                if (value !== null && value !== undefined) {
                    configValues[key] = value;
                    console.log(`✅ Config ${key}:`, value);
                } else {
                    console.warn(`⚠️ Config ${key} returned null/undefined`);
                    missingConfigs.push(key);
                }
            } 
            // Fallback to direct API call if getConfigValue not available
            else {
                const baseUrl = window.AppConfig?.baseUrl || '';
                const response = await fetch(`${baseUrl}/config/${key}`, {
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success' && data.config_value !== null) {
                        configValues[key] = data.config_value;
                        console.log(`✅ Config ${key} (direct):`, data.config_value);
                    } else {
                        missingConfigs.push(key);
                    }
                } else {
                    missingConfigs.push(key);
                }
            }
        } catch (error) {
            console.error(`❌ Failed to load ${key}:`, error);
            missingConfigs.push(key);
        }
    }
    
    if (missingConfigs.length > 0) {
        console.warn('⚠️ utils.js: Missing config keys:', missingConfigs);
        showMessage(`⚠️ Some configuration values are missing: ${missingConfigs.join(', ')}. Some features may not work correctly.`, 'warning');
        return false;
    } else {
        console.log('✅ utils.js: All required configs loaded successfully');
        return true;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🟢 utils.js: DOM loaded, checking authentication');
    
    // Check if we're on a page that requires authentication
    const currentPath = window.location.pathname;
    const protectedPaths = ['/admin', '/dashboard', '/youtube-linker'];
    
    if (protectedPaths.some(path => currentPath.startsWith(path))) {
        const userData = localStorage.getItem('user');
        if (userData) {
            try {
                const user = JSON.parse(userData);
                if (user.role !== 'admin' && user.role !== 'consignor' && user.role !== 'youtube_linker') {
                    console.error('🔴 utils.js: Invalid user role, redirecting to home');
                    window.location.href = '/';
                    return;
                }
                console.log('✅ utils.js: User authenticated:', user.username);
            } catch {
                console.error('🔴 utils.js: Error parsing user data, redirecting to home');
                window.location.href = '/';
                return;
            }
        } else {
            // Don't redirect if we're on a page that might not require auth
            // Let individual pages handle their own auth checks
            console.log('🟡 utils.js: No user data found, but page may not require auth');
        }
    }
    
    // Verify required configuration values (non-critical, just for logging)
    try {
        await verifyRequiredConfigs();
    } catch (error) {
        console.error('❌ utils.js: Failed to verify configuration:', error);
        // Don't show fatal error - let the app continue with defaults
    }
    
    window.selectedRecords = new Set();
    console.log('✅ utils.js: Initialization complete');
});

// Listen for tab changes but DON'T initialize - just log
document.addEventListener('tabChanged', function(e) {
    console.log(`📢 utils.js: Tab changed event received: ${e.detail.tabName}`);
});