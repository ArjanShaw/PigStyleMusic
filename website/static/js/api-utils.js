// PigStyle Records API Utilities
const pigstyleAPI = {
    // Use the centralized config
    baseURL: AppConfig.baseUrl,
    
    // Common headers
    headers: AppConfig.getHeaders(),
    
    // Escape HTML to prevent XSS attacks
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // Get unique artists from records array
    getUniqueArtists: function(records) {
        const artists = new Set();
        records.forEach(record => {
            if (record.artist && record.artist.trim() !== '') {
                artists.add(record.artist.trim());
            }
        });
        return Array.from(artists).sort();
    },
    
    // Generic request method
    async request(endpoint, options = {}) {
        const url = AppConfig.getUrl(endpoint, options.params);
        const config = {
            method: options.method || 'GET',
            headers: this.headers,
            ...options
        };
        
        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'error') {
                throw new Error(data.error || 'API returned error status');
            }
            
            return data;
        } catch (error) {
            console.error(`API request failed for ${endpoint}:`, error);
            throw error;
        }
    },
    
    // Get all records from API
    loadAllRecords: async function() {
        console.log('Loading all records from API...');
        return this.request('records');
    },
    
    // Get random records for streaming page
    loadRandomRecords: async function(limit = 500, hasYouTube = true) {
        console.log(`Loading ${limit} random records ${hasYouTube ? 'with YouTube' : ''}...`);
        return this.request('records', {
            params: { random: true, limit, has_youtube: hasYouTube }
        });
    },
    
    // Get catalog grouped records
    loadCatalogGroupedRecords: async function() {
        console.log('Loading catalog grouped records...');
        return this.request('records', {
            params: { grouped: true }
        });
    },
    
    // Get a single record by ID
    getRecord: async function(recordId) {
        return this.request(`records/${recordId}`);
    },
    
    // Search records
    searchRecords: async function(searchTerm) {
        return this.request('search', {
            params: { q: searchTerm }
        });
    },
    
    // Vote on a record
    voteOnRecord: async function(recordId, voterIp, voteType) {
        return this.request(`vote/${recordId}/${voterIp}/${voteType}`, {
            method: 'POST'
        });
    },
    
    // Get user's votes
    getUserVotes: async function(voterIp) {
        return this.request(`userVotes/${voterIp}`);
    },
    
    // Get vote counts for a record
    getVoteCounts: async function(recordId) {
        return this.request(`votes/${recordId}`);
    },
    
    // Get Spotify playlists
    getSpotifyPlaylists: async function(genreFilter = null) {
        const params = genreFilter ? { genre: genreFilter } : null;
        return this.request('spotify', { params });
    },
    
    // Get all users
    getUsers: async function() {
        return this.request('users');
    },
    
    // Get all genres
    getGenres: async function() {
        return this.request('genres');
    },
    
    // Get database statistics
    getStats: async function() {
        return this.request('stats');
    },
    
    // Health check
    healthCheck: async function() {
        return this.request('health');
    },
    
    // Generate voter hash from IP address
    generateVoterHash: function(ipAddress) {
        let hash = 0;
        for (let i = 0; i < ipAddress.length; i++) {
            const char = ipAddress.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    },
    
    // Get user's IP address (client-side approximation)
    getUserIP: async function() {
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
    formatPrice: function(price) {
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
    truncateText: function(text, maxLength) {
        if (!text || text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + '...';
    }
};

// Export for use in other scripts
window.pigstyleAPI = pigstyleAPI;