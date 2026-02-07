// config.js - App Configuration
const AppConfig = {
    // Flask API runs on port 5000
    baseUrl: 'http://localhost:5000',
    
    getUrl: function(endpoint, params) {
        let url = `${this.baseUrl}/${endpoint}`;
        if (params) {
            const queryString = new URLSearchParams(params).toString();
            if (queryString) {
                url += `?${queryString}`;
            }
        }
        console.log('API URL:', url);
        return url;
    },
    
    getHeaders: function() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }
};

// Make available globally
window.AppConfig = AppConfig;