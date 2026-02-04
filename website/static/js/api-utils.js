// PigStyle Records API Utilities
// Centralized API calls for the PigStyle Records application

const pigstyleAPI = {
    // Base API URL - change this based on your deployment environment
    baseURL: window.location.hostname.includes('localhost') 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com',
    
    // Common headers for all requests
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    
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
    
    // Get all records from API
    loadAllRecords: async function() {
        try {
            console.log('Loading all records from API...');
            const response = await fetch(`${this.baseURL}/records`, {
                method: 'GET',
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                console.log(`Loaded ${data.records.length} records`);
                return data.records;
            } else {
                throw new Error(data.error || 'Failed to load records');
            }
        } catch (error) {
            console.error('Error loading records:', error);
            throw error;
        }
    },
    
    // Get catalog grouped records for catalog.html
    loadCatalogGroupedRecords: async function() {
        try {
            console.log('Loading catalog grouped records...');
            const response = await fetch(`${this.baseURL}/catalog/grouped-records`, {
                method: 'GET',
                headers: this.headers
            });
            
            if (!response.ok) {
                console.error('HTTP error:', response.status, response.statusText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                console.log(`Loaded ${data.count} records in ${data.groups.length} price groups`);
                return data;
            } else {
                console.error('API error:', data.error);
                throw new Error(data.error || 'Failed to load catalog records');
            }
        } catch (error) {
            console.error('Error loading catalog grouped records:', error);
            throw error;
        }
    },
    
    // Get a single record by ID
    getRecord: async function(recordId) {
        try {
            const response = await fetch(`${this.baseURL}/records/${recordId}`, {
                method: 'GET',
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error getting record:', error);
            throw error;
        }
    },
    
    // Search records
    searchRecords: async function(searchTerm) {
        try {
            const response = await fetch(`${this.baseURL}/search?q=${encodeURIComponent(searchTerm)}`, {
                method: 'GET',
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.records || [];
        } catch (error) {
            console.error('Error searching records:', error);
            throw error;
        }
    },
    
    // Vote on a record
    voteOnRecord: async function(recordId, voterIp, voteType) {
        try {
            const response = await fetch(`${this.baseURL}/vote/${recordId}/${voterIp}/${voteType}`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify({})
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error voting on record:', error);
            throw error;
        }
    },
    
    // Get user's votes
    getUserVotes: async function(voterIp) {
        try {
            const response = await fetch(`${this.baseURL}/user-votes/${voterIp}`, {
                method: 'GET',
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.votes || {};
        } catch (error) {
            console.error('Error getting user votes:', error);
            throw error;
        }
    },
    
    // Get vote counts for a record
    getVoteCounts: async function(recordId) {
        try {
            const response = await fetch(`${this.baseURL}/votes/${recordId}`, {
                method: 'GET',
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error getting vote counts:', error);
            throw error;
        }
    },
    
    // Get Spotify playlists
    getSpotifyPlaylists: async function(genreFilter = null) {
        try {
            let url = `${this.baseURL}/spotify/stored-playlists`;
            if (genreFilter) {
                url += `?genre=${encodeURIComponent(genreFilter)}`;
            }
            
            const response = await fetch(url, {
                method: 'GET',
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error getting Spotify playlists:', error);
            throw error;
        }
    },
    
    // Get all users
    getUsers: async function() {
        try {
            const response = await fetch(`${this.baseURL}/users`, {
                method: 'GET',
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.users || [];
        } catch (error) {
            console.error('Error getting users:', error);
            throw error;
        }
    },
    
    // Get all genres
    getGenres: async function() {
        try {
            const response = await fetch(`${this.baseURL}/genres`, {
                method: 'GET',
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.genres || [];
        } catch (error) {
            console.error('Error getting genres:', error);
            throw error;
        }
    },
    
    // Get database statistics
    getStats: async function() {
        try {
            const response = await fetch(`${this.baseURL}/stats`, {
                method: 'GET',
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error getting stats:', error);
            throw error;
        }
    },
    
    // Health check
    healthCheck: async function() {
        try {
            const response = await fetch(`${this.baseURL}/health`, {
                method: 'GET',
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error checking health:', error);
            throw error;
        }
    },
    
    // Generate voter hash from IP address
    generateVoterHash: function(ipAddress) {
        // Simple hash function - in production, use a more secure method
        let hash = 0;
        for (let i = 0; i < ipAddress.length; i++) {
            const char = ipAddress.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    },
    
    // Get user's IP address (client-side approximation)
    getUserIP: async function() {
        try {
            // This is a client-side approximation - real IP needs server-side handling
            // Using a service to get public IP
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip || 'unknown';
        } catch (error) {
            console.log('Could not get public IP, using fallback');
            // Fallback to a session-based identifier
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
if (typeof module !== 'undefined' && module.exports) {
    module.exports = pigstyleAPI;
}