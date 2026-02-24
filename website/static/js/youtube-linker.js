// ============================================================================
// youtube-linker.js - Complete YouTube Linker Application with Artist Filter
// ============================================================================

class YouTubeLinker {
    constructor() {
        console.log('🎬 YouTubeLinker constructor called');
        
        // State management
        this.state = {
            recordsWithoutLinks: [],
            currentSearchResults: null,
            currentSearchQuery: null,
            selectedRecord: null,
            dropdownOptions: [],
            filteredOptions: [],
            lastSavedRecord: null,
            searchQuery: '',
            selectedArtist: 'All Artists',
            selectedGenre: 'All Genres',
            searchCache: new Map(),
            availableArtists: ['All Artists'],
            availableGenres: ['All Genres'],
            processedToday: 0,
            youtubeEnabled: false,
            quotaExceeded: false
        };
        
        // Get DOM elements - these should all exist now
        this.elements = {
            totalWithoutYoutube: document.getElementById('total-without-youtube'),
            totalActive: document.getElementById('total-active'),
            processedToday: document.getElementById('processed-today'),
            searchInput: document.getElementById('search-input'),
            artistFilter: document.getElementById('artist-filter'),
            genreFilter: document.getElementById('genre-filter'),
            displayedCount: document.getElementById('displayed-count'),
            totalCount: document.getElementById('total-count'),
            recordSelect: document.getElementById('record-select'),
            noRecordsMessage: document.getElementById('no-records-message'),
            recordDetails: document.getElementById('record-details'),
            recordImage: document.getElementById('record-image'),
            recordTitle: document.getElementById('record-title'),
            recordGenre: document.getElementById('record-genre'),
            recordCatalog: document.getElementById('record-catalog'),
            recordPrice: document.getElementById('record-price'),
            searchQuery: document.getElementById('search-query'),
            resultsGrid: document.getElementById('results-grid'),
            noResults: document.getElementById('no-results'),
            loadingResults: document.getElementById('loading-results'),
            resultsCount: document.getElementById('results-count'),
            refreshSearch: document.getElementById('refresh-search')
        };
        
        // Verify all elements were found
        const missingElements = [];
        for (const [key, element] of Object.entries(this.elements)) {
            if (!element) {
                missingElements.push(key);
            }
        }
        
        if (missingElements.length > 0) {
            console.warn('Missing DOM elements:', missingElements);
        } else {
            console.log('✅ All DOM elements found');
        }
        
        // Bind methods
        this.init = this.init.bind(this);
        this.loadRecords = this.loadRecords.bind(this);
        this.handleSearch = this.handleSearch.bind(this);
        this.handleArtistFilter = this.handleArtistFilter.bind(this);
        this.handleGenreFilter = this.handleGenreFilter.bind(this);
        this.handleRecordSelect = this.handleRecordSelect.bind(this);
        this.searchYouTube = this.searchYouTube.bind(this);
        this.saveYouTubeLink = this.saveYouTubeLink.bind(this);
        this.updateStats = this.updateStats.bind(this);
        this.clearCache = this.clearCache.bind(this);
        this.refreshSearch = this.refreshSearch.bind(this);
    }
    
    async init() {
        console.log('🎬 Initializing YouTube Linker');
        
        // Check YouTube configuration
        await this._checkYouTubeConfig();
        
        // Setup event listeners
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', () => this.handleSearch());
        }
        if (this.elements.artistFilter) {
            this.elements.artistFilter.addEventListener('change', () => this.handleArtistFilter());
        }
        if (this.elements.genreFilter) {
            this.elements.genreFilter.addEventListener('change', () => this.handleGenreFilter());
        }
        if (this.elements.recordSelect) {
            this.elements.recordSelect.addEventListener('change', (e) => this.handleRecordSelect(e));
        }
        if (this.elements.refreshSearch) {
            this.elements.refreshSearch.addEventListener('click', () => this.refreshSearch());
        }
        
        // Load records
        await this.loadRecords();
        
        // Load processed today count
        this._loadProcessedToday();
    }
    
    async _checkYouTubeConfig() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/youtube/status`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.state.youtubeEnabled = data.configured;
                if (this.state.youtubeEnabled) {
                    console.log('✅ YouTube API enabled on server');
                } else {
                    this._showMessage('⚠️ YouTube API not configured on server', 'warning');
                }
            }
        } catch (error) {
            console.error('Error checking YouTube API status:', error);
            this.state.youtubeEnabled = false;
        }
    }
    
    async loadRecords() {
        try {
            console.log('Loading records...');
            
            const response = await fetch(`${AppConfig.baseUrl}/records?status_id=2&limit=10000`, {
                credentials: 'include'
            });
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            const allRecords = data.records || [];
            
            console.log(`Loaded ${allRecords.length} total active records`);
            
            // Update total active stat
            if (this.elements.totalActive) {
                this.elements.totalActive.textContent = allRecords.length;
            }
            
            // Filter records without YouTube links
            this.state.recordsWithoutLinks = allRecords.filter(record => 
                !record.youtube_url || record.youtube_url.trim() === ''
            );
            
            console.log(`Found ${this.state.recordsWithoutLinks.length} records without YouTube links`);
            
            // Update stats
            this.updateStats();
            
            // Build dropdown options
            this._buildDropdownOptions();
            
        } catch (error) {
            console.error('Error loading records:', error);
            this._showMessage(`Error loading records: ${error.message}`, 'error');
        }
    }
    
    _buildDropdownOptions() {
        const records = this.state.recordsWithoutLinks;
        
        if (records.length === 0) {
            if (this.elements.recordSelect) this.elements.recordSelect.style.display = 'none';
            if (this.elements.noRecordsMessage) this.elements.noRecordsMessage.style.display = 'block';
            if (this.elements.recordDetails) this.elements.recordDetails.style.display = 'none';
            return;
        }
        
        if (this.elements.recordSelect) this.elements.recordSelect.style.display = 'block';
        if (this.elements.noRecordsMessage) this.elements.noRecordsMessage.style.display = 'none';
        
        // Build options array
        this.state.dropdownOptions = records.map(record => {
            const artist = record.artist || 'Unknown Artist';
            const title = record.title || 'Unknown Title';
            const catalog = record.catalog_number || '';
            const genre = record.genre_name || record.genre || 'Unknown';
            
            const displayText = catalog 
                ? `${artist} - ${title} [${catalog}]`
                : `${artist} - ${title}`;
            
            const searchText = `${artist} ${title} ${catalog}`.toLowerCase();
            
            return {
                display: displayText,
                record: record,
                value: `record_${record.id}`,
                searchText: searchText,
                artist: artist,
                genre: genre,
                recordId: record.id
            };
        });
        
        // Extract unique artists and genres
        const artists = new Set(['All Artists']);
        const genres = new Set(['All Genres']);
        
        this.state.dropdownOptions.forEach(opt => {
            if (opt.artist) artists.add(opt.artist);
            if (opt.genre) genres.add(opt.genre);
        });
        
        this.state.availableArtists = Array.from(artists).sort();
        this.state.availableGenres = Array.from(genres).sort();
        
        // Update filter dropdowns
        this._updateArtistFilter();
        this._updateGenreFilter();
        
        // Apply initial filters
        this._applyFilters();
    }
    
    _updateArtistFilter() {
        if (!this.elements.artistFilter) return;
        
        this.elements.artistFilter.innerHTML = this.state.availableArtists.map(artist => 
            `<option value="${artist}" ${artist === this.state.selectedArtist ? 'selected' : ''}>${escapeHtml(artist)}</option>`
        ).join('');
    }
    
    _updateGenreFilter() {
        if (!this.elements.genreFilter) return;
        
        this.elements.genreFilter.innerHTML = this.state.availableGenres.map(genre => 
            `<option value="${genre}" ${genre === this.state.selectedGenre ? 'selected' : ''}>${escapeHtml(genre)}</option>`
        ).join('');
    }
    
    _applyFilters() {
        let filtered = [...this.state.dropdownOptions];
        
        // Apply artist filter
        if (this.state.selectedArtist !== 'All Artists') {
            filtered = filtered.filter(opt => opt.artist === this.state.selectedArtist);
        }
        
        // Apply genre filter
        if (this.state.selectedGenre !== 'All Genres') {
            filtered = filtered.filter(opt => opt.genre === this.state.selectedGenre);
        }
        
        // Apply search filter
        if (this.state.searchQuery) {
            const query = this.state.searchQuery.toLowerCase();
            filtered = filtered.filter(opt => opt.searchText.includes(query));
        }
        
        this.state.filteredOptions = filtered;
        
        // Update select dropdown
        this._updateSelectDropdown();
        
        // Update filter metrics
        if (this.elements.displayedCount) {
            this.elements.displayedCount.textContent = filtered.length;
        }
        if (this.elements.totalCount) {
            this.elements.totalCount.textContent = this.state.dropdownOptions.length;
        }
        
        // Auto-select first item if available
        if (filtered.length > 0 && this.elements.recordSelect) {
            const firstValue = filtered[0].value;
            this.elements.recordSelect.value = firstValue;
            this.state.selectedRecord = filtered[0].record;
            this._displayRecordDetails(filtered[0].record);
        } else if (this.elements.recordDetails) {
            this.elements.recordDetails.style.display = 'none';
        }
    }
    
    _updateSelectDropdown() {
        if (!this.elements.recordSelect) return;
        
        if (this.state.filteredOptions.length === 0) {
            this.elements.recordSelect.innerHTML = '<option value="">No matching records</option>';
            return;
        }
        
        this.elements.recordSelect.innerHTML = this.state.filteredOptions.map(opt => 
            `<option value="${opt.value}">${escapeHtml(opt.display)}</option>`
        ).join('');
    }
    
    handleSearch() {
        if (!this.elements.searchInput) return;
        this.state.searchQuery = this.elements.searchInput.value;
        this._applyFilters();
    }
    
    handleArtistFilter() {
        if (!this.elements.artistFilter) return;
        this.state.selectedArtist = this.elements.artistFilter.value;
        this._applyFilters();
    }
    
    handleGenreFilter() {
        if (!this.elements.genreFilter) return;
        this.state.selectedGenre = this.elements.genreFilter.value;
        this._applyFilters();
    }
    
    handleRecordSelect(event) {
        const selectedValue = event.target.value;
        if (!selectedValue) return;
        
        const selected = this.state.filteredOptions.find(opt => opt.value === selectedValue);
        if (selected) {
            this.state.selectedRecord = selected.record;
            this._displayRecordDetails(selected.record);
        }
    }
    
    _displayRecordDetails(record) {
        if (!record || !this.elements.recordDetails) return;
        
        if (this.elements.recordImage) {
            this.elements.recordImage.src = record.image_url || 'https://via.placeholder.com/150x150/eee/ccc?text=No+Image';
        }
        if (this.elements.recordTitle) {
            this.elements.recordTitle.textContent = `${record.artist || 'Unknown'} - ${record.title || 'Unknown'}`;
        }
        if (this.elements.recordGenre) {
            this.elements.recordGenre.textContent = record.genre_name || record.genre || 'Unknown';
        }
        if (this.elements.recordCatalog) {
            this.elements.recordCatalog.textContent = record.catalog_number || 'N/A';
        }
        if (this.elements.recordPrice) {
            this.elements.recordPrice.textContent = (record.store_price || 0).toFixed(2);
        }
        
        this.elements.recordDetails.style.display = 'block';
        
        // Check cache for this record
        if (this.state.searchCache.has(record.id)) {
            const cached = this.state.searchCache.get(record.id);
            this.state.currentSearchResults = cached.results;
            this.state.currentSearchQuery = cached.query;
            if (this.elements.searchQuery) {
                this.elements.searchQuery.textContent = cached.query;
            }
            this._displayYouTubeResults();
        } else {
            // Perform new search
            this.searchYouTube(record);
        }
    }
    
    async searchYouTube(record) {
        if (!this.state.youtubeEnabled) {
            this._showMessage('YouTube API not configured on server', 'error');
            return;
        }
        
        if (this.state.quotaExceeded) {
            this._showMessage('YouTube API quota exceeded - try again later', 'warning');
            return;
        }
        
        const artist = record.artist || '';
        const title = record.title || '';
        const searchQuery = `${artist} - ${title}`;
        
        if (this.elements.searchQuery) {
            this.elements.searchQuery.textContent = searchQuery;
        }
        this.state.currentSearchQuery = searchQuery;
        
        // Show loading
        if (this.elements.loadingResults) this.elements.loadingResults.style.display = 'block';
        if (this.elements.resultsGrid) this.elements.resultsGrid.style.display = 'none';
        if (this.elements.noResults) this.elements.noResults.style.display = 'none';
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/youtube/search`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: searchQuery })
            });
            
            if (response.status === 429) {
                this.state.quotaExceeded = true;
                this._showMessage('YouTube API quota exceeded', 'warning');
                if (this.elements.loadingResults) this.elements.loadingResults.style.display = 'none';
                if (this.elements.noResults) this.elements.noResults.style.display = 'block';
                return;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'error') {
                throw new Error(data.error);
            }
            
            const results = data.results || [];
            this.state.currentSearchResults = results;
            
            // Cache results
            this.state.searchCache.set(record.id, {
                results: results,
                query: searchQuery
            });
            
            this._displayYouTubeResults();
            
        } catch (error) {
            console.error('YouTube search error:', error);
            this._showMessage(`YouTube search failed: ${error.message}`, 'error');
            
            if (this.elements.loadingResults) this.elements.loadingResults.style.display = 'none';
            if (this.elements.noResults) this.elements.noResults.style.display = 'block';
        }
    }
    
    _displayYouTubeResults() {
        const results = this.state.currentSearchResults;
        
        if (this.elements.loadingResults) {
            this.elements.loadingResults.style.display = 'none';
        }
        
        if (!results || results.length === 0) {
            if (this.elements.noResults) this.elements.noResults.style.display = 'block';
            if (this.elements.resultsGrid) this.elements.resultsGrid.style.display = 'none';
            if (this.elements.resultsCount) this.elements.resultsCount.textContent = '(0 results)';
            return;
        }
        
        if (this.elements.noResults) this.elements.noResults.style.display = 'none';
        if (this.elements.resultsGrid) {
            this.elements.resultsGrid.style.display = 'grid';
            this.elements.resultsGrid.innerHTML = results.map((result, index) => 
                this._renderVideoCard(result, index)
            ).join('');
        }
        if (this.elements.resultsCount) {
            this.elements.resultsCount.textContent = `(${results.length} results)`;
        }
        
        // Attach event listeners to save buttons
        results.forEach((result, index) => {
            const btn = document.getElementById(`save-btn-${index}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    this.saveYouTubeLink(result, index);
                });
            }
        });
    }
    
    _renderVideoCard(result, index) {
        if (!this.state.selectedRecord) return '';
        
        const videoId = this._extractYouTubeId(result.url);
        const displayTitle = result.title && result.title.length > 40 
            ? result.title.substring(0, 40) + '...' 
            : result.title || 'Unknown Title';
        
        const sessionKey = `saved_${this.state.selectedRecord.id}_${index}`;
        const isSaved = localStorage.getItem(sessionKey) === 'true';
        
        return `
            <div class="video-card">
                <h5>${escapeHtml(displayTitle)}</h5>
                <p><i class="fas fa-user"></i> ${escapeHtml(result.channel || 'Unknown')}</p>
                
                <div class="video-container">
                    <iframe 
                        src="https://www.youtube.com/embed/${videoId}" 
                        allowfullscreen>
                    </iframe>
                </div>
                
                <button class="btn-save" id="save-btn-${index}" ${isSaved ? 'disabled' : ''}>
                    <i class="fas fa-${isSaved ? 'check' : 'save'}"></i>
                    ${isSaved ? 'Saved!' : 'Save This Clip'}
                </button>
            </div>
        `;
    }
    
    _extractYouTubeId(url) {
        if (!url) return '';
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?]+)/,
            /youtube\.com\/embed\/([^&\n?]+)/,
            /youtube\.com\/v\/([^&\n?]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return '';
    }
    
    async saveYouTubeLink(result, index) {
        if (!this.state.selectedRecord) return;
        
        const recordId = this.state.selectedRecord.id;
        const youtubeUrl = result.url;
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/records/${recordId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ youtube_url: youtubeUrl })
            });
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            
            if (data.status === 'success') {
                // Mark as saved in localStorage
                localStorage.setItem(`saved_${recordId}_${index}`, 'true');
                
                // Update button
                const btn = document.getElementById(`save-btn-${index}`);
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
                    btn.disabled = true;
                }
                
                // Increment processed today
                this._incrementProcessedToday();
                
                this._showMessage('✅ YouTube link saved successfully!', 'success');
                
                // Remove record from list after a short delay
                setTimeout(() => {
                    this._removeRecordFromList(recordId);
                }, 1500);
                
            } else {
                throw new Error(data.error || 'Failed to save');
            }
            
        } catch (error) {
            console.error('Error saving YouTube link:', error);
            this._showMessage(`Failed to save: ${error.message}`, 'error');
        }
    }
    
    _removeRecordFromList(recordId) {
        // Remove from dropdown options
        this.state.dropdownOptions = this.state.dropdownOptions.filter(
            opt => opt.recordId !== recordId
        );
        
        // Remove from records without links
        this.state.recordsWithoutLinks = this.state.recordsWithoutLinks.filter(
            record => record.id !== recordId
        );
        
        // Clear from cache
        this.state.searchCache.delete(recordId);
        
        // Rebuild artists and genres if needed
        const artists = new Set(['All Artists']);
        const genres = new Set(['All Genres']);
        
        this.state.dropdownOptions.forEach(opt => {
            if (opt.artist) artists.add(opt.artist);
            if (opt.genre) genres.add(opt.genre);
        });
        
        this.state.availableArtists = Array.from(artists).sort();
        this.state.availableGenres = Array.from(genres).sort();
        
        this._updateArtistFilter();
        this._updateGenreFilter();
        
        // Update stats
        this.updateStats();
        
        // Reapply filters
        this._applyFilters();
        
        // If no records left, show all done message
        if (this.state.dropdownOptions.length === 0) {
            if (this.elements.recordSelect) this.elements.recordSelect.style.display = 'none';
            if (this.elements.recordDetails) this.elements.recordDetails.style.display = 'none';
            if (this.elements.noRecordsMessage) this.elements.noRecordsMessage.style.display = 'block';
        }
    }
    
    refreshSearch() {
        if (!this.state.selectedRecord) return;
        
        // Clear cache for this record
        this.state.searchCache.delete(this.state.selectedRecord.id);
        
        // Perform new search
        this.searchYouTube(this.state.selectedRecord);
    }
    
    updateStats() {
        if (this.elements.totalWithoutYoutube) {
            this.elements.totalWithoutYoutube.textContent = this.state.recordsWithoutLinks.length;
        }
    }
    
    _loadProcessedToday() {
        const today = new Date().toDateString();
        const stored = localStorage.getItem('youtube_processed_today');
        
        if (stored) {
            const data = JSON.parse(stored);
            if (data.date === today) {
                this.state.processedToday = data.count;
            } else {
                this.state.processedToday = 0;
                localStorage.setItem('youtube_processed_today', JSON.stringify({
                    date: today,
                    count: 0
                }));
            }
        } else {
            this.state.processedToday = 0;
            localStorage.setItem('youtube_processed_today', JSON.stringify({
                date: today,
                count: 0
            }));
        }
        
        if (this.elements.processedToday) {
            this.elements.processedToday.textContent = this.state.processedToday;
        }
    }
    
    _incrementProcessedToday() {
        this.state.processedToday++;
        const today = new Date().toDateString();
        localStorage.setItem('youtube_processed_today', JSON.stringify({
            date: today,
            count: this.state.processedToday
        }));
        if (this.elements.processedToday) {
            this.elements.processedToday.textContent = this.state.processedToday;
        }
    }
    
    clearCache() {
        this.state.searchCache.clear();
        this._showMessage('Cache cleared', 'success');
    }
    
    _showMessage(message, type) {
        const container = document.getElementById('message-container');
        if (!container) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `${type}-message`;
        messageDiv.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(messageDiv);
        
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);
    }
}

// Make globally available
window.YouTubeLinker = YouTubeLinker;