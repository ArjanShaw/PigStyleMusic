// API Configuration for PigStyle Music
const APIConfig = {
    // Base API URL - update this to your actual API domain
    baseUrl: window.location.origin,
    
    // API Endpoints
    endpoints: {
        // Authentication
        login: '/api/login',
        logout: '/api/logout',
        session: '/api/session',
        
        // Discogs
        discogsSearch: '/api/discogs/search',
        discogsRelease: '/api/discogs/release',
        
        // Records
        records: '/records',
        recordById: (id) => `/records/${id}`,
        recordsSearch: '/search',
        recordsCount: '/records/count',
        userRecords: (userId) => `/records/user/${userId}`,
        userRecordsCount: (userId) => `/records/user/${userId}/count`,
        
        // Genres
        genres: '/genres',
        genreByName: (name) => `/genres/by-name/${encodeURIComponent(name)}`,
        
        // Config
        config: '/config',
        configByKey: (key) => `/config/${key}`,
        
        // Price Advice
        priceAdvice: '/api/price-advice',
        
        // Consignment
        consignmentRecords: '/api/consignment',
        consignmentStats: '/api/consignment/stats',
        
        // Users
        users: '/users',
        userById: (id) => `/users/${id}`
    },
    
    // API Request settings
    settings: {
        timeout: 30000, // 30 seconds
        retryAttempts: 3,
        retryDelay: 1000
    },
    
    // Get full URL for endpoint
    getUrl(endpoint, params = {}) {
        let url = `${this.baseUrl}${endpoint}`;
        
        // Replace path parameters
        if (typeof endpoint === 'function') {
            url = `${this.baseUrl}${endpoint(params)}`;
        }
        
        return url;
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
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            return {
                status: error.response.status,
                message: error.response.data?.error || `HTTP ${error.response.status}`,
                details: error.response.data
            };
        } else if (error.request) {
            // The request was made but no response was received
            return {
                status: 0,
                message: 'No response from server. Please check your connection.',
                details: null
            };
        } else {
            // Something happened in setting up the request that triggered an Error
            return {
                status: -1,
                message: error.message || 'Unknown error',
                details: null
            };
        }
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIConfig;
}