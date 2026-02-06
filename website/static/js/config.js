// PigStyle Music Configuration
// Single source for all environment-specific settings

const AppConfig = {
    // BASE URL - Change this one value for the entire app
    // For production on PythonAnywhere:
    baseUrl: 'https://www.pigstylemusic.com',
    
    // For local development, comment the line above and uncomment this one:
    // baseUrl: 'http://localhost:5000',
    
    // API endpoints (relative to baseUrl)
    endpoints: {
        records: '/api/records',
        consignorRecords: '/api/consignor/records',
        login: '/api/login',
        logout: '/api/logout',
        search: '/api/search',
        genres: '/api/genres',
        // Add all other endpoints used in your app here
    },
    
    // Utility method to get full URL for an endpoint
    getUrl(endpointKey) {
        const endpoint = this.endpoints[endpointKey];
        if (!endpoint) {
            console.error(`Endpoint "${endpointKey}" not defined in AppConfig.endpoints`);
            return this.baseUrl;
        }
        return `${this.baseUrl}${endpoint}`;
    }
};