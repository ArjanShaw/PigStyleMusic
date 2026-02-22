// ============================================================================
// utils.js - Shared Utilities and Core Functions
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

// Tab Switching
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const tab = document.querySelector(`.tab[onclick="switchTab('${tabName}')"]`);
    if (tab) tab.classList.add('active');
    
    const content = document.getElementById(`${tabName}-tab`);
    if (content) content.classList.add('active');
    
    // Dispatch custom event for tab change
    const event = new CustomEvent('tabChanged', { detail: { tabName } });
    document.dispatchEvent(event);
}

// Global Variables
let consignorCache = {};
let allRecords = [];
let filteredRecords = [];
let currentPage = 1;
let pageSize = 100;
let totalPages = 1;
let dbConfigValues = {};
let recentlyPrintedIds = new Set();
let savedReceipts = [];

// Placeholder functions - will be overridden by receipts.js
// These are empty functions that won't log warnings
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

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    const userData = localStorage.getItem('user');
    if (userData) {
        try {
            const user = JSON.parse(userData);
            if (user.role !== 'admin') {
                window.location.href = '/';
                return;
            }
        } catch {
            window.location.href = '/';
            return;
        }
    } else {
        window.location.href = '/';
        return;
    }
    
    window.selectedRecords = new Set();
});