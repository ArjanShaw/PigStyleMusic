// ============================================================================
// youtube-linker.js - Complete YouTube Linker Application with Edit Functionality
// ============================================================================

class YouTubeLinker {
    constructor() {
        console.log('🎬 YouTubeLinker constructor called');
        
        // State management
        this.state = {
            allRecords: [],           // All active records
            filteredRecords: [],       // Currently filtered records
            currentSearchResults: null,
            currentSearchQuery: null,
            selectedRecord: null,
            dropdownOptions: [],
            filteredOptions: [],
            lastSavedRecord: null,
            searchQuery: '',
            filterType: 'without',     // 'without', 'with', or 'all'
            selectedArtist: 'All Artists',
            selectedGenre: 'All Genres',
            searchCache: new Map(),
            availableArtists: ['All Artists'],
            availableGenres: ['All Genres'],
            processedToday: 0,
            youtubeEnabled: false,
            quotaExceeded: false
        };
        
        // Get DOM elements
        this.elements = {
            totalWithoutYoutube: document.getElementById('total-without-youtube'),
            totalWithYoutube: document.getElementById('total-with-youtube'),
            totalActive: document.getElementById('total-active'),
            processedToday: document.getElementById('processed-today'),
            filterType: document.getElementById('filter-type'),
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
            currentYoutubeBadge: document.getElementById('current-youtube-badge'),
            currentYoutubeLink: document.getElementById('current-youtube-link'),
            removeLinkBtn: document.getElementById('remove-link-btn'),
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
        this.handleFilterType = this.handleFilterType.bind(this);
        this.handleSearch = this.handleSearch.bind(this);
        this.handleArtistFilter = this.handleArtistFilter.bind(this);
        this.handleGenreFilter = this.handleGenreFilter.bind(this);
        this.handleRecordSelect = this.handleRecordSelect.bind(this);
        this.searchYouTube = this.searchYouTube.bind(this);
        this.saveYouTubeLink = this.saveYouTubeLink.bind(this);
        this.updateYouTubeLink = this.updateYouTubeLink.bind(this);
        this.removeYouTubeLink = this.removeYouTubeLink.bind(this);
        this.updateStats = this.updateStats.bind(this);
        this.clearCache = this.clearCache.bind(this);
        this.refreshSearch = this.refreshSearch.bind(this);
    }
    
    async init() {
        console.log('🎬 Initializing YouTube Linker');
        
        // Check YouTube configuration
        await this._checkYouTubeConfig();
        
        // Setup event listeners
        if (this.elements.filterType) {
            this.elements.filterType.addEventListener('change', () => this.handleFilterType());
        }
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
        if (this.elements.removeLinkBtn) {
            this.elements.removeLinkBtn.addEventListener('click', () => this.removeYouTubeLink());
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
    
    // ========== Unified Record Loader ==========
async function loadRecords(options) {
    options = options || {};
    console.log('🔵 loadRecords called with options:', options);
    try {
        var {
            // Status filters
            statusIds,
            
            // Search filters (individual fields)
            artist,
            title,
            catalogNumber,
            barcode,
            
            // Location filter
            locationId,
            
            // Format filter
            formatIds,
            
            // Genre filter
            genres,
            
            // Media filters
            requireImage = false,
            
            // Date filters
            createdAfter,
            lastSeenAfter,
            lastSeenBefore,
            
            // Pagination
            limit,
            
            // Batch filter
            batchId,
            
            // Ordering
            orderBy = 'created_at',
            orderDir = 'DESC',
            
            // Legacy/compatibility options (deprecated)
            search,           // DEPRECATED - use artist/title/catalogNumber/barcode
            location,         // DEPRECATED - use locationId
            format,           // DEPRECATED - use formatIds
            requireLocation,  // DEPRECATED - use locationId with null check
            excludeOldNoLocation, // DEPRECATED - removed
            bypassDateFilter, // DEPRECATED - removed
            random,           // DEPRECATED - removed
            hasYoutube,       // DEPRECATED - removed
            showAllStatuses,  // DEPRECATED - removed
            filterBySearch,   // DEPRECATED - removed
            excludeBatch,     // DEPRECATED - use batchId = -1
            mode              // Used for UI mode only, not filtering
        } = options;

        // Build URL and params
        var url = '/records';
        var params = new URLSearchParams();

        // --- Status Filter ---
        if (statusIds && statusIds.length > 0) {
            params.append('status_ids', statusIds.join(','));
        }
        // If no status filter, show all (default)

        // --- Search Filters (individual fields) ---
        // If legacy 'search' is provided, use it as combined search
        if (search && !artist && !title && !catalogNumber && !barcode) {
            // For backward compatibility, use search as combined
            // But we should encourage using specific fields
            console.warn('⚠️ Using deprecated "search" parameter. Please use artist, title, catalogNumber, or barcode instead.');
            params.append('artist', search);
            params.append('title', search);
        } else {
            if (artist) params.append('artist', artist);
            if (title) params.append('title', title);
            if (catalogNumber) params.append('catalog_number', catalogNumber);
            if (barcode) params.append('barcode', barcode);
        }

        // --- Location Filter ---
        if (locationId) {
            params.append('location_id', locationId);
        }
        // DEPRECATED: location parameter - try to convert to locationId
        if (location && !locationId) {
            console.warn('⚠️ Using deprecated "location" parameter. Please use locationId instead.');
            // Try to find location by name (this would need a lookup)
            // For now, just pass it as-is and let the backend handle it
            params.append('location', location);
        }

        // --- Format Filter ---
        if (formatIds && formatIds.length > 0) {
            params.append('format_ids', formatIds.join(','));
        }
        // DEPRECATED: single format
        if (format && !formatIds) {
            console.warn('⚠️ Using deprecated "format" parameter. Please use formatIds instead.');
            params.append('format_ids', format);
        }

        // --- Genre Filter ---
        if (genres && genres.length > 0) {
            params.append('genres', genres.join(','));
        }

        // --- Media Filters ---
        if (requireImage) {
            params.append('require_image', 'true');
        }

        // DEPRECATED: requireLocation - use locationId with null check
        if (requireLocation) {
            console.warn('⚠️ Using deprecated "requireLocation" parameter. Please use locationId instead.');
            // The backend handles this by checking location_id IS NOT NULL
            // when locationId is provided with a special value
            params.append('location_id', 'null');
        }

        // --- Date Filters ---
        if (createdAfter) {
            params.append('created_after', createdAfter);
        }
        if (lastSeenAfter) {
            params.append('last_seen_after', lastSeenAfter);
        }
        if (lastSeenBefore) {
            params.append('last_seen_before', lastSeenBefore);
        }

        // --- Batch Filter ---
        if (batchId !== undefined && batchId !== null) {
            params.append('batch_id', batchId);
        }
        // DEPRECATED: excludeBatch - use batchId = -1
        if (excludeBatch) {
            console.warn('⚠️ Using deprecated "excludeBatch" parameter. Please use batchId = -1 instead.');
            params.append('batch_id', '-1');
        }

        // --- Pagination ---
        if (limit) {
            params.append('limit', limit);
        }

        // --- Ordering ---
        if (orderBy) {
            params.append('order_by', orderBy);
        }
        if (orderDir) {
            params.append('order_dir', orderDir);
        }

        // --- DEPRECATED: bypassDateFilter ---
        if (bypassDateFilter) {
            console.warn('⚠️ Using deprecated "bypassDateFilter" parameter. This is now the default behavior.');
            // Do nothing - default is no date filter
        }

        // --- DEPRECATED: random ---
        if (random) {
            console.warn('⚠️ Using deprecated "random" parameter. This feature is no longer supported.');
            // Ignored
        }

        // --- DEPRECATED: hasYoutube ---
        if (hasYoutube) {
            console.warn('⚠️ Using deprecated "hasYoutube" parameter. This feature is no longer supported.');
            // Ignored
        }

        // --- DEPRECATED: showAllStatuses ---
        if (showAllStatuses) {
            console.warn('⚠️ Using deprecated "showAllStatuses" parameter. This is now the default behavior.');
            // Do nothing - default is show all statuses
        }

        // --- DEPRECATED: excludeOldNoLocation ---
        if (excludeOldNoLocation) {
            console.warn('⚠️ Using deprecated "excludeOldNoLocation" parameter. Use createdAfter and lastSeenAfter instead.');
            // Ignored - use date filters instead
        }

        var queryString = params.toString();
        var fullUrl = window.AppConfig.baseUrl + url + (queryString ? '?' + queryString : '');
        console.log('🔵 loadRecords: fetching ' + fullUrl);

        var response = await fetch(fullUrl, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || 'Failed to load records');

        var records = data.records || [];
        console.log('🔵 loadRecords: API returned ' + records.length + ' records');

        // Store records
        allRecords = records;
        filteredRecords = records;
        totalRecords = filteredRecords.length;
        currentPage = 1;
        currentMode = mode || 'inventory';

        if (mode === 'add' && !search && !artist && !title && !catalogNumber && !barcode) {
            currentResults = [];
        }

        console.log('🔵 loadRecords: about to render with ' + filteredRecords.length + ' records');
        renderPagination();
        renderTablePage();

        var statusMsg = 'Showing ' + totalRecords + ' records';
        if (statusIds && statusIds.length === 1) statusMsg += ' with status_id=' + statusIds[0];
        else if (statusIds && statusIds.length > 1) statusMsg += ' with status_ids ' + statusIds.join(', ');
        if (locationId) statusMsg += ' in location_id=' + locationId;
        if (search) statusMsg += ' matching "' + search + '"';
        if (batchId === -1) statusMsg += ' (excluding batch)';
        else if (batchId) statusMsg += ' (purchase ' + batchId + ')';
        showStatus(statusMsg, 'info');
        updateSelectionCount();

        if (mode === 'discogs') {
            if (locationId) {
                currentLocationRecords = records;
            }
            console.log('🔵 loadRecords: calling populateDiscogsPrices for ' + records.length + ' records');
            await populateDiscogsPrices(records);
        }

        return records;
    } catch (error) {
        console.error('❌ loadRecords error:', error);
        showStatus('Error loading records: ' + error.message, 'error');
        return [];
    }
}

    
    handleFilterType() {
        if (!this.elements.filterType) return;
        this.state.filterType = this.elements.filterType.value;
        this._applyFilters();
    }
    
    _applyFilters() {
        // First filter by type (with/without youtube)
        let filtered = [...this.state.allRecords];
        
        if (this.state.filterType === 'without') {
            filtered = filtered.filter(record => 
                !record.youtube_url || record.youtube_url.trim() === ''
            );
        } else if (this.state.filterType === 'with') {
            filtered = filtered.filter(record => 
                record.youtube_url && record.youtube_url.trim() !== ''
            );
        }
        // 'all' shows everything
        
        // Then apply artist/genre/search filters
        this.state.filteredRecords = filtered;
        
        // Build dropdown options
        this._buildDropdownOptions();
        
        // Update stats display
        this.updateStats();
    }
    
    _buildDropdownOptions() {
        const records = this.state.filteredRecords;
        
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
            const hasYoutube = record.youtube_url && record.youtube_url.trim() !== '';
            
            const displayText = catalog 
                ? `${artist} - ${title} [${catalog}] ${hasYoutube ? '📺' : ''}`
                : `${artist} - ${title} ${hasYoutube ? '📺' : ''}`;
            
            const searchText = `${artist} ${title} ${catalog}`.toLowerCase();
            
            return {
                display: displayText,
                record: record,
                value: `record_${record.id}`,
                searchText: searchText,
                artist: artist,
                genre: genre,
                hasYoutube: hasYoutube,
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
        
        // Apply search filter
        this._applySearchFilter();
    }
    
    _applySearchFilter() {
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
    
    _updateArtistFilter() {
        if (!this.elements.artistFilter) return;
        
        this.elements.artistFilter.innerHTML = this.state.availableArtists.map(artist => 
            `<option value="${artist}" ${artist === this.state.selectedArtist ? 'selected' : ''}>${this.escapeHtml(artist)}</option>`
        ).join('');
    }
    
    _updateGenreFilter() {
        if (!this.elements.genreFilter) return;
        
        this.elements.genreFilter.innerHTML = this.state.availableGenres.map(genre => 
            `<option value="${genre}" ${genre === this.state.selectedGenre ? 'selected' : ''}>${this.escapeHtml(genre)}</option>`
        ).join('');
    }
    
    _updateSelectDropdown() {
        if (!this.elements.recordSelect) return;
        
        if (this.state.filteredOptions.length === 0) {
            this.elements.recordSelect.innerHTML = '<option value="">No matching records</option>';
            return;
        }
        
        this.elements.recordSelect.innerHTML = this.state.filteredOptions.map(opt => 
            `<option value="${opt.value}">${this.escapeHtml(opt.display)}</option>`
        ).join('');
    }
    
    handleSearch() {
        if (!this.elements.searchInput) return;
        this.state.searchQuery = this.elements.searchInput.value;
        this._applySearchFilter();
    }
    
    handleArtistFilter() {
        if (!this.elements.artistFilter) return;
        this.state.selectedArtist = this.elements.artistFilter.value;
        this._applySearchFilter();
    }
    
    handleGenreFilter() {
        if (!this.elements.genreFilter) return;
        this.state.selectedGenre = this.elements.genreFilter.value;
        this._applySearchFilter();
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
        
        // Show/hide current YouTube badge
        const hasYoutube = record.youtube_url && record.youtube_url.trim() !== '';
        if (hasYoutube && this.elements.currentYoutubeBadge && this.elements.currentYoutubeLink) {
            this.elements.currentYoutubeBadge.style.display = 'flex';
            this.elements.currentYoutubeLink.href = record.youtube_url;
            this.elements.currentYoutubeLink.textContent = this._extractYouTubeId(record.youtube_url) || 'View';
        } else if (this.elements.currentYoutubeBadge) {
            this.elements.currentYoutubeBadge.style.display = 'none';
        }
        
        // Show/hide remove button
        if (this.elements.removeLinkBtn) {
            this.elements.removeLinkBtn.style.display = hasYoutube ? 'inline-block' : 'none';
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
        
        // Attach event listeners to buttons
        results.forEach((result, index) => {
            const saveBtn = document.getElementById(`save-btn-${index}`);
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    this.saveYouTubeLink(result, index);
                });
            }
            
            const updateBtn = document.getElementById(`update-btn-${index}`);
            if (updateBtn) {
                updateBtn.addEventListener('click', () => {
                    this.updateYouTubeLink(result, index);
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
        const isCurrentLink = this.state.selectedRecord.youtube_url === result.url;
        
        const hasExistingLink = this.state.selectedRecord.youtube_url && 
                                this.state.selectedRecord.youtube_url.trim() !== '';
        
        let buttonHtml = '';
        if (isCurrentLink) {
            buttonHtml = `<button class="btn-save" disabled><i class="fas fa-check"></i> Current Link</button>`;
        } else if (hasExistingLink) {
            buttonHtml = `<button class="btn-update" id="update-btn-${index}"><i class="fas fa-sync-alt"></i> Update to This</button>`;
        } else {
            buttonHtml = `<button class="btn-save" id="save-btn-${index}" ${isSaved ? 'disabled' : ''}>
                <i class="fas fa-${isSaved ? 'check' : 'save'}"></i>
                ${isSaved ? 'Saved!' : 'Save This Clip'}
            </button>`;
        }
        
        return `
            <div class="video-card ${isCurrentLink ? 'current-link' : ''}">
                ${isCurrentLink ? '<span class="current-badge">CURRENT</span>' : ''}
                <h5>${this.escapeHtml(displayTitle)}</h5>
                <p><i class="fas fa-user"></i> ${this.escapeHtml(result.channel || 'Unknown')}</p>
                
                <div class="video-container">
                    <iframe 
                        src="https://www.youtube.com/embed/${videoId}" 
                        allowfullscreen>
                    </iframe>
                </div>
                
                ${buttonHtml}
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
                
                // Update record in state
                this.state.selectedRecord.youtube_url = youtubeUrl;
                
                // Update the record in allRecords
                const recordIndex = this.state.allRecords.findIndex(r => r.id === recordId);
                if (recordIndex !== -1) {
                    this.state.allRecords[recordIndex].youtube_url = youtubeUrl;
                }
                
                // Increment processed today
                this._incrementProcessedToday();
                
                this._showMessage('✅ YouTube link saved successfully!', 'success');
                
                // Refresh the display
                setTimeout(() => {
                    this._displayRecordDetails(this.state.selectedRecord);
                    this._applyFilters();
                }, 1500);
                
            } else {
                throw new Error(data.error || 'Failed to save');
            }
            
        } catch (error) {
            console.error('Error saving YouTube link:', error);
            this._showMessage(`Failed to save: ${error.message}`, 'error');
        }
    }
    
    async updateYouTubeLink(result, index) {
        if (!this.state.selectedRecord) return;
        
        if (!confirm('Are you sure you want to update the YouTube link for this record?')) {
            return;
        }
        
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
                // Update record in state
                this.state.selectedRecord.youtube_url = youtubeUrl;
                
                // Update the record in allRecords
                const recordIndex = this.state.allRecords.findIndex(r => r.id === recordId);
                if (recordIndex !== -1) {
                    this.state.allRecords[recordIndex].youtube_url = youtubeUrl;
                }
                
                // Clear cache for this record
                this.state.searchCache.delete(recordId);
                
                this._showMessage('✅ YouTube link updated successfully!', 'success');
                
                // Refresh the display
                setTimeout(() => {
                    this._displayRecordDetails(this.state.selectedRecord);
                    this._applyFilters();
                }, 1500);
                
            } else {
                throw new Error(data.error || 'Failed to update');
            }
            
        } catch (error) {
            console.error('Error updating YouTube link:', error);
            this._showMessage(`Failed to update: ${error.message}`, 'error');
        }
    }
    
    async removeYouTubeLink() {
        if (!this.state.selectedRecord) return;
        
        if (!confirm('Are you sure you want to remove the YouTube link from this record?')) {
            return;
        }
        
        const recordId = this.state.selectedRecord.id;
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/records/${recordId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ youtube_url: '' })
            });
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            
            if (data.status === 'success') {
                // Update record in state
                this.state.selectedRecord.youtube_url = '';
                
                // Update the record in allRecords
                const recordIndex = this.state.allRecords.findIndex(r => r.id === recordId);
                if (recordIndex !== -1) {
                    this.state.allRecords[recordIndex].youtube_url = '';
                }
                
                // Clear cache for this record
                this.state.searchCache.delete(recordId);
                
                this._showMessage('✅ YouTube link removed successfully!', 'success');
                
                // Refresh the display
                setTimeout(() => {
                    this._displayRecordDetails(this.state.selectedRecord);
                    this._applyFilters();
                }, 1500);
                
            } else {
                throw new Error(data.error || 'Failed to remove');
            }
            
        } catch (error) {
            console.error('Error removing YouTube link:', error);
            this._showMessage(`Failed to remove: ${error.message}`, 'error');
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
        const totalActive = this.state.allRecords.length;
        const withoutYoutube = this.state.allRecords.filter(r => !r.youtube_url || r.youtube_url.trim() === '').length;
        const withYoutube = totalActive - withoutYoutube;
        
        if (this.elements.totalWithoutYoutube) {
            this.elements.totalWithoutYoutube.textContent = withoutYoutube;
        }
        if (this.elements.totalWithYoutube) {
            this.elements.totalWithYoutube.textContent = withYoutube;
        }
        if (this.elements.totalActive) {
            this.elements.totalActive.textContent = totalActive;
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
            <i class="fas fa-${type === 'success' ? 'check-circle' : 
                                type === 'warning' ? 'exclamation-triangle' : 
                                'exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(messageDiv);
        
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);
    }
    
    escapeHtml(text) {
        if (!text) return text;
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Make globally available
window.YouTubeLinker = YouTubeLinker;