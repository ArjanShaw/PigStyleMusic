// config.js - Simplified version
const AppConfig = {
    getUrl: function(endpoint, params) {
        // Use relative URLs - much simpler!
        const endpointMap = {
            'sessionCheck': '/sessioncheck',
            'login': '/login',
            'logout': '/logout',
            'users': '/users',
            'records': '/records',
            // Add all your endpoints here
        };
        
        const actualEndpoint = endpointMap[endpoint] || endpoint;
        let url = actualEndpoint;  // Just use the relative path
        
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