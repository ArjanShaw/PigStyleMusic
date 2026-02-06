// PigStyle Music Configuration - AUTO PORT DETECTION
console.log('config.js is loading...');

const AppConfig = {
    // AUTO-DETECT BASE URL
    // Dynamically sets the correct URL for local dev vs production
    get baseUrl() {
        const currentHostname = window.location.hostname;
        const currentPort = window.location.port;
        
        // Check if we're running locally
        if (currentHostname === 'localhost' || currentHostname === '127.0.0.1') {
            // Frontend is on port 8000, but API is on port 5000
            return `http://${currentHostname}:5000`;
        }
        // We're in production on PythonAnywhere
        else {
            // Use HTTPS for production
            return `https://${currentHostname}`;
        }
    },
    
    // API endpoints (relative to baseUrl)
    endpoints: {
        sessionCheck: '/session/check',
        login: '/api/login',
        logout: '/api/logout',
        consignorRecords: '/api/consignor/records',
        records: '/api/records',
        search: '/api/search',
        genres: '/api/genres',
        discogsSearch: '/api/discogs/search',
        priceEstimate: '/api/price-estimate',
        commissionRate: '/api/commission-rate',
        discogsMappings: '/discogs-genre-mappings'
    },
    
    // Method to get a full URL for an endpoint
    getUrl(endpointKey, params = null) {
        const endpoint = this.endpoints[endpointKey];
        if (!endpoint) {
            console.error(`Endpoint "${endpointKey}" not found in config.`);
            return this.baseUrl;
        }
        let url = `${this.baseUrl}${endpoint}`;
        if (params) {
            const queryString = new URLSearchParams(params).toString();
            url += `?${queryString}`;
        }
        return url;
    },
    
    // Method to get standard headers
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        // Add auth token if it exists
        const token = localStorage.getItem('auth_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }
};

console.log('AppConfig created. Base URL:', AppConfig.baseUrl);
console.log('Current browser location:', window.location.href);

// Make it globally available
window.AppConfig = AppConfig;
console.log('AppConfig is now globally available.');