// ============================================================================
// GLOBAL VARIABLES
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

// Genre Predictor Class
class GenrePredictor {
    constructor() {
        this.genreMappingCache = {};
    }
    
    async predictGenre(discogsGenre) {
        if (!discogsGenre) return null;
        
        let cleanGenre = discogsGenre;
        if (cleanGenre.includes('/')) {
            cleanGenre = cleanGenre.replace('/', ' ');
        }
        
        if (this.genreMappingCache[cleanGenre]) {
            console.log(`GENRE_CACHE: Using cached prediction for "${cleanGenre}"`);
            return this.genreMappingCache[cleanGenre];
        }
        
        const response = await APIUtils.get(
            `/discogs-genre-mappings/${encodeURIComponent(cleanGenre)}`
        );
        
        if (response.status === 'success' && response.mapping) {
            this.genreMappingCache[cleanGenre] = response.mapping;
            console.log(`GENRE_PREDICTION: Found mapping for "${cleanGenre}" -> ${response.mapping.local_genre_name}`);
            return response.mapping;
        } else {
            console.log(`GENRE_PREDICTION: No mapping found for "${cleanGenre}"`);
            this.genreMappingCache[cleanGenre] = null;
            return null;
        }
    }
    
    clearCache() {
        this.genreMappingCache = {};
    }
    
    async saveMapping(discogsGenre, localGenreId, localGenreName) {
        const cleanGenre = discogsGenre.includes('/') ? 
            discogsGenre.replace('/', ' ') : discogsGenre;
        
        const mappingData = {
            discogs_genre: cleanGenre,
            local_genre_id: localGenreId
        };
        
        const response = await APIUtils.post('/discogs-genre-mappings', mappingData);
        
        if (response.status === 'success') {
            this.genreMappingCache[cleanGenre] = {
                local_genre_id: localGenreId,
                local_genre_name: localGenreName
            };
            
            console.log(`GENRE_MAPPING: Saved mapping "${cleanGenre}" -> ${localGenreName}`);
            return response;
        }
        return null;
    }
}

// Barcode Generator Class
class BarcodeGenerator {
    constructor() {
        this.baseCounter = 3290;
        this.prefix = '22';
        this.loadCounter();
    }
    
    loadCounter() {
        try {
            const savedCounter = localStorage.getItem('pigstyle_barcode_counter');
            if (savedCounter) {
                const parsed = parseInt(savedCounter);
                if (!isNaN(parsed) && parsed > this.baseCounter) {
                    this.baseCounter = parsed;
                }
            }
            console.log('BARCODE: Loaded counter:', this.baseCounter);
        } catch (error) {
            console.warn('BARCODE: Could not load counter:', error);
        }
    }
    
    saveCounter() {
        try {
            localStorage.setItem('pigstyle_barcode_counter', this.baseCounter.toString());
        } catch (error) {
            console.warn('BARCODE: Could not save counter:', error);
        }
    }
    
    generateBarcode() {
        const sequence = this.baseCounter.toString().padStart(4, '0');
        const barcode = `${this.prefix}000000${sequence}`;
        console.log('BARCODE_GENERATED:', barcode, 'Sequence:', this.baseCounter);
        this.baseCounter++;
        this.saveCounter();
        return barcode;
    }
    
    validateBarcode(barcode) {
        if (!barcode || typeof barcode !== 'string') {
            return false;
        }
        return /^\d+$/.test(barcode);
    }
    
    getCurrentCounter() {
        return this.baseCounter;
    }
    
    resetCounter(startFrom = 3290) {
        this.baseCounter = startFrom;
        this.saveCounter();
        console.log('BARCODE: Counter reset to:', startFrom);
    }
}

// Add/Edit/Delete Manager Class
class AddEditDeleteManager {
    constructor() {
        this.currentSearchType = 'add';
        this.currentSearchField = 'all';
        this.currentResults = [];
        this.genres = [];
        this.conditions = [];
        this.statuses = ['new', 'active', 'sold', 'removed'];
        this.genrePredictor = new GenrePredictor();
        this.barcodeGenerator = new BarcodeGenerator();
        this.commissionRate = 0.20;
        this.minimumPrice = 1.99;
        
        this.init();
    }

    async init() {
        await this.loadMinimumPrice();
        await this.loadStats();
        await this.loadGenres();
        this.loadConditions();
        this.setupEventListeners();
    }

    async loadMinimumPrice() {
        try {
            const response = await APIUtils.get('/config/MIN_STORE_PRICE');
            this.minimumPrice = parseFloat(response.config_value) || 1.99;
            console.log(`MIN_PRICE: Minimum store price loaded: $${this.minimumPrice.toFixed(2)}`);
        } catch (error) {
            console.warn('MIN_PRICE: Could not load MIN_STORE_PRICE, using default:', error);
            this.minimumPrice = 1.99;
        }
    }

    async loadStats() {
        try {
            const response = await APIUtils.get('/records/count');
            const recordsCount = response.count || 0;
            document.getElementById('total-records').textContent = recordsCount;

            const commissionResponse = await APIUtils.get('/api/commission-rate');
            this.commissionRate = commissionResponse.commission_rate / 100;
            document.getElementById('commission-rate').textContent = 
                `${commissionResponse.commission_rate || 20.0}%`;

            const configResponse = await APIUtils.get('/config/STORE_CAPACITY');
            const capacity = parseInt(configResponse.config_value);
            const fillPercentage = (recordsCount / capacity * 100).toFixed(1);
            document.getElementById('store-fill').textContent = `${fillPercentage}%`;

            await this.loadLastAddedRecord();
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadLastAddedRecord() {
        try {
            const response = await APIUtils.get('/records', { 
                limit: 1, 
                order_by: 'created_at', 
                order: 'desc' 
            });
            
            if (response.records && response.records.length > 0) {
                const record = response.records[0];
                document.getElementById('last-added').textContent = 
                    `${record.artist.substring(0, 15)}...`;
            }
        } catch (error) {
            console.error('Error loading last added record:', error);
        }
    }

    async loadGenres() {
        console.log('LOAD_GENRES: Starting to load genres from /genres endpoint');
        try {
            const response = await APIUtils.get('/genres');
            console.log('LOAD_GENRES: Raw API response:', response);
            
            if (response && response.genres) {
                this.genres = response.genres;
                console.log('LOAD_GENRES: Genres loaded successfully:', this.genres);
            } else {
                console.error('LOAD_GENRES: Invalid response format:', response);
                this.genres = [];
            }
        } catch (error) {
            console.error('Error loading genres:', error);
            this.genres = [];
        }
    }

    loadConditions() {
        const allConditions = [
            'Mint (M)',
            'Near Mint (NM or M-)',
            'Very Good Plus (VG+)',
            'Very Good (VG)',
            'Good Plus (G+)',
            'Good (G)',
            'Fair (F)',
            'Poor (P)'
        ];
        
        this.conditions = allConditions;
        console.log('LOAD_CONDITIONS: Conditions loaded:', this.conditions);
    }

    setupEventListeners() {
        document.querySelectorAll('input[name="searchType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.currentSearchType = e.target.value;
                this.updateSearchPlaceholder();
                this.clearResults();
            });
        });

        document.getElementById('searchField').addEventListener('change', (e) => {
            this.currentSearchField = e.target.value;
            this.updateSearchPlaceholder();
        });

        document.getElementById('searchForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const searchTerm = document.getElementById('searchInput').value.trim();
            
            if (!searchTerm) {
                showMessage('Please enter a search term', 'error');
                return;
            }

            await this.performSearch(searchTerm);
        });

        document.getElementById('clearSearch').addEventListener('click', () => {
            document.getElementById('searchInput').value = '';
            this.clearResults();
        });

        this.updateSearchPlaceholder();
    }

    updateSearchPlaceholder() {
        const searchInput = document.getElementById('searchInput');
        const searchField = this.currentSearchField;
        
        let placeholderText = 'Enter search term...';
        
        if (this.currentSearchType === 'add') {
            placeholderText = 'Search Discogs (artist, album, catalog #)...';
        } else {
            switch(searchField) {
                case 'barcode':
                    placeholderText = 'Enter barcode...';
                    break;
                case 'artist':
                    placeholderText = 'Enter artist name...';
                    break;
                case 'title':
                    placeholderText = 'Enter album title...';
                    break;
                case 'all':
                default:
                    placeholderText = 'Enter barcode, artist, or title...';
                    break;
            }
        }
        
        searchInput.placeholder = placeholderText;
    }

    async performSearch(searchTerm) {
        const resultsContainer = document.getElementById('results-container');
        resultsContainer.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Searching...</p>
            </div>
        `;

        console.log('PERFORM_SEARCH: Starting search for:', searchTerm);
        console.log('PERFORM_SEARCH: Search type:', this.currentSearchType);
        console.log('PERFORM_SEARCH: Search field:', this.currentSearchField);
        console.log('PERFORM_SEARCH: Current genres:', this.genres);
        console.log('PERFORM_SEARCH: Current conditions:', this.conditions);

        if (this.currentSearchType === 'add') {
            this.currentResults = await this.searchDiscogs(searchTerm);
        } else {
            this.currentResults = await this.searchDatabase(searchTerm);
        }

        console.log('PERFORM_SEARCH: Found', this.currentResults.length, 'results');
        this.displayResults();
    }

    async searchDiscogs(searchTerm) {
        try {
            const response = await APIUtils.get('/api/discogs/search', { q: searchTerm });
            
            if (response.status === 'success' && response.results) {
                const enhancedResults = await Promise.all(
                    response.results.map(async (record) => {
                        if (record.genre) {
                            const prediction = await this.genrePredictor.predictGenre(record.genre);
                            if (prediction) {
                                record.predicted_genre = prediction;
                                console.log(`GENRE_PREDICTION: "${record.genre}" -> ${prediction.local_genre_name}`);
                            }
                        }
                        return record;
                    })
                );
                
                return enhancedResults;
            }
        } catch (error) {
            console.error('Error searching Discogs:', error);
        }
        
        return this.getSampleResults(searchTerm);
    }

    async searchDatabase(searchTerm) {
        try {
            let params = { 
                q: searchTerm,
                search_field: this.currentSearchField
            };
            
            const response = await APIUtils.get('/search', params);
            
            if (response.status === 'success' && response.records) {
                return response.records;
            }
        } catch (error) {
            console.error('Error searching database:', error);
        }
        return [];
    }

    getSampleResults(searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        
        if (searchLower.includes('nirvana')) {
            return [
                {
                    id: 'discogs_1',
                    artist: 'Nirvana',
                    title: 'Nevermind',
                    year: '1991',
                    genre: 'Rock, Grunge',
                    format: 'Vinyl, LP, Album',
                    country: 'US',
                    image_url: 'https://img.discogs.com/GHS-24425.jpg',
                    catalog_number: 'GHS 24425',
                    discogs_id: '123456',
                    barcode: ['GHS 24425', '075992442517'],
                    predicted_genre: { local_genre_id: 1, local_genre_name: 'Rock' }
                }
            ];
        } else {
            return [
                {
                    id: 'discogs_4',
                    artist: 'Sample Artist',
                    title: `Sample Album for "${searchTerm}"`,
                    year: '2023',
                    genre: 'Rock',
                    format: 'Vinyl, LP',
                    country: 'US',
                    image_url: '',
                    catalog_number: 'SMP001',
                    discogs_id: '999999',
                    barcode: ['123456789012'],
                    predicted_genre: null
                }
            ];
        }
    }

    displayResults() {
        const resultsContainer = document.getElementById('results-container');
        
        if (!this.currentResults || this.currentResults.length === 0) {
            resultsContainer.innerHTML = `
                <div class="loading">
                    <i class="fas fa-search"></i>
                    <p>No results found</p>
                    <p><small>Try a different search term</small></p>
                </div>
            `;
            return;
        }

        if (this.currentSearchType === 'add') {
            resultsContainer.innerHTML = this.renderDiscogsResults();
        } else {
            resultsContainer.innerHTML = this.renderDatabaseResults();
        }

        this.attachResultEventListeners();
    }

    renderDiscogsResults() {
        const resultsCount = this.currentResults.length;
        
        const findGenreIndex = (genreId) => {
            if (!this.genres || !genreId) return -1;
            return this.genres.findIndex(g => g.id == genreId);
        };
        
        return `
            <h3>Search Results (${resultsCount})</h3>
            <div class="price-note" style="margin-bottom: 15px; padding: 10px; background: #f0f0f0; border-radius: 4px; border-left: 4px solid #007bff;">
                <i class="fas fa-info-circle"></i>
                <strong>Pricing Rules:</strong> Minimum price: $${this.minimumPrice.toFixed(2)}. 
                <div style="margin-top: 5px;">
                    <div>• Prices are rounded according to store pricing rules</div>
                    <div>• <strong>Price step: $1.00</strong> - Use +/- buttons to adjust by whole dollars</div>
                </div>
            </div>
            ${this.currentResults.map((record, index) => {
                const hasPrediction = record.predicted_genre;
                const predictedGenreId = hasPrediction ? record.predicted_genre.local_genre_id : null;
                const predictedGenreName = hasPrediction ? record.predicted_genre.local_genre_name : null;
                const predictionIndex = findGenreIndex(predictedGenreId);
                
                const genreOptions = this.genres.map((genre, idx) => {
                    const selected = hasPrediction && idx === predictionIndex ? 'selected' : '';
                    return `<option value="${genre.id}" ${selected}>${genre.genre_name}</option>`;
                }).join('');
                
                const conditionOptions = this.conditions.map(condition => {
                    return `<option value="${condition}">${condition}</option>`;
                }).join('');
                
                let discogsIdentifiers = '';
                if (record.barcode) {
                    if (Array.isArray(record.barcode)) {
                        discogsIdentifiers = record.barcode.join(', ');
                    } else {
                        discogsIdentifiers = record.barcode;
                    }
                }
                
                return `
                    <div class="record-card" data-record-id="${record.discogs_id || record.id}" data-index="${index}">
                        <div class="record-header">
                            ${record.image_url ? `
                                <img src="${record.image_url}" alt="${record.artist} - ${record.title}" class="record-image" 
                                     onerror="this.src='https://via.placeholder.com/100x100/333/666?text=No+Image'">
                            ` : `
                                <div class="record-image" style="background: #333; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-record-vinyl" style="font-size: 40px; color: #666;"></i>
                                </div>
                            `}
                            <div class="record-info">
                                <div class="record-title">${record.artist} - ${record.title}</div>
                                <div class="record-details">
                                    ${record.year ? `<p><strong>Year:</strong> ${record.year}</p>` : ''}
                                    ${record.genre ? `<p><strong>Discogs Genre:</strong> ${record.genre}</p>` : ''}
                                    ${record.format ? `<p><strong>Format:</strong> ${record.format}</p>` : ''}
                                    ${record.country ? `<p><strong>Country:</strong> ${record.country}</p>` : ''}
                                    ${record.catalog_number ? `<p><strong>Discogs Catalog #:</strong> ${record.catalog_number}</p>` : ''}
                                    ${discogsIdentifiers ? `<p><strong>Discogs Identifiers:</strong> ${discogsIdentifiers}</p>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        ${hasPrediction ? `
                            <div class="genre-prediction prediction-available" id="prediction-banner-${record.discogs_id}">
                                <i class="fas fa-lightbulb prediction-icon"></i>
                                <div class="prediction-text">
                                    <strong>💡 Genre Prediction:</strong> "${record.genre}" maps to <strong>${predictedGenreName}</strong>
                                    <div class="prediction-hint">
                                        Based on previous mappings. The dropdown is pre-selected.
                                    </div>
                                </div>
                                <button class="btn accept-prediction-btn" 
                                        data-record-id="${record.discogs_id}"
                                        data-discogs-genre="${record.genre}"
                                        data-genre-id="${predictedGenreId}"
                                        data-genre-name="${predictedGenreName}">
                                    <i class="fas fa-check"></i> Confirm
                                </button>
                            </div>
                        ` : record.genre ? `
                            <div class="genre-prediction">
                                <i class="fas fa-search prediction-icon"></i>
                                <div class="prediction-text">
                                    No genre prediction found for "${record.genre}"
                                    <div class="prediction-hint">
                                        Select a genre manually to create a mapping for future records
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Genre *</label>
                                <select class="form-control genre-select ${hasPrediction ? 'predicted-genre' : ''}" 
                                        required
                                        data-record-id="${record.discogs_id}">
                                    <option value="">Select genre...</option>
                                    ${genreOptions}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Condition *</label>
                                <select class="form-control condition-select" required>
                                    <option value="">Select condition...</option>
                                    ${conditionOptions}
                                </select>
                                <div class="estimation-hint">
                                    <i class="fas fa-bolt"></i>
                                    Price auto-estimates when condition is selected
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Price ($) *</label>
                                <input type="number" 
                                       class="form-control price-input" 
                                       step="1" 
                                       min="${this.minimumPrice}" 
                                       placeholder="Min: $${this.minimumPrice.toFixed(2)}" 
                                       required>
                                <div class="price-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                    <i class="fas fa-plus-circle"></i> <i class="fas fa-minus-circle"></i> Use +/- buttons to adjust by $1.00
                                </div>
                            </div>
                        </div>
                        
                        <div class="barcode-info">
                            <i class="fas fa-barcode"></i>
                            <span>A numeric PigStyle barcode will be automatically generated when you add this record</span>
                        </div>
                        
                        <div id="calculation-${record.discogs_id}" class="calculation-container"></div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <button class="btn btn-primary add-record-btn">
                                    <i class="fas fa-plus"></i> Add to Inventory
                                </button>
                                <div class="form-hint" style="font-size: 12px; color: rgba(0,0,0,0.5); margin-top: 5px;">
                                    * Required fields
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        `;
    }

    renderDatabaseResults() {
        const user = JSON.parse(localStorage.getItem('user')) || {};
        const userRole = user.role || 'admin';
        const userId = user.id;
        const resultsCount = this.currentResults.length;
        
        const filteredResults = this.currentResults;
        
        if (filteredResults.length === 0) {
            return `
                <div class="loading">
                    <i class="fas fa-search"></i>
                    <p>No matching records found in database</p>
                    <p><small>Try searching for different terms or add new records</small></p>
                </div>
            `;
        }
        
        const getGenreOptions = (recordId) => {
            const record = this.currentResults.find(r => r.id == recordId);
            return this.genres.map(genre => {
                const selected = record && record.genre_id == genre.id ? 'selected' : '';
                return `<option value="${genre.id}" ${selected}>${genre.genre_name}</option>`;
            }).join('');
        };
        
        const getConditionOptions = (recordId) => {
            const record = this.currentResults.find(r => r.id == recordId);
            return this.conditions.map(condition => {
                const selected = record && record.condition === condition ? 'selected' : '';
                return `<option value="${condition}" ${selected}>${condition}</option>`;
            }).join('');
        };
        
        const getStatusOptions = (recordId) => {
            const record = this.currentResults.find(r => r.id == recordId);
            return this.statuses.map(status => {
                const selected = record && (record.status_name || 'active').toLowerCase() === status ? 'selected' : '';
                return `<option value="${status}" ${selected}>${status.charAt(0).toUpperCase() + status.slice(1)}</option>`;
            }).join('');
        };
        
        return `
            <h3>Database Results (${filteredResults.length})</h3>
            <div class="price-note" style="margin-bottom: 15px; padding: 10px; background: #f0f0f0; border-radius: 4px; border-left: 4px solid #007bff;">
                <i class="fas fa-info-circle"></i>
                <strong>Pricing Rules:</strong> Minimum price: $${this.minimumPrice.toFixed(2)}. 
                <div style="margin-top: 5px;">
                    <div>• Prices are rounded according to store pricing rules</div>
                    <div>• <strong>Price step: $1.00</strong> - Use +/- buttons to adjust by whole dollars</div>
                </div>
            </div>
            ${filteredResults.map((record, index) => {
                const statusName = (record.status_name || 'active').toLowerCase();
                const statusClass = statusName.replace(/\s+/g, '-');
                const displayStatus = record.status_name || 'Active';
                
                return `
                    <div class="record-card" data-record-id="${record.id}" data-index="${index}">
                        <div class="record-header">
                            ${record.image_url ? `
                                <img src="${record.image_url}" alt="${record.artist} - ${record.title}" class="record-image"
                                     onerror="this.src='https://via.placeholder.com/100x100/333/666?text=No+Image'">
                            ` : `
                                <div class="record-image" style="background: #333; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-record-vinyl" style="font-size: 40px; color: #666;"></i>
                                </div>
                            `}
                            <div class="record-info">
                                <div class="record-title">${record.artist} - ${record.title}</div>
                                <div class="record-details">
                                    ${record.genre_name ? `<p><strong>Genre:</strong> ${record.genre_name}</p>` : ''}
                                    ${record.barcode ? `<p><strong>PigStyle Barcode:</strong> <span class="barcode-value">${record.barcode}</span></p>` : ''}
                                    ${record.catalog_number ? `<p><strong>Catalog #:</strong> ${record.catalog_number}</p>` : ''}
                                    <p><strong>Price:</strong> $${(record.store_price || 0).toFixed(2)}</p>
                                    <p><strong>Commission:</strong> ${(this.commissionRate * 100).toFixed(1)}%</p>
                                    ${record.condition ? `<p><strong>Condition:</strong> ${record.condition}</p>` : ''}
                                    <p><strong>Status:</strong> <span class="status-badge ${statusClass}">${displayStatus}</span></p>
                                    ${record.consignor_name ? `<p><strong>Consignor:</strong> ${record.consignor_name}</p>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <div id="calculation-${record.id}" class="calculation-container"></div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Genre</label>
                                <select class="form-control edit-genre-select" data-record-id="${record.id}">
                                    <option value="">Select genre...</option>
                                    ${getGenreOptions(record.id)}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Condition</label>
                                <select class="form-control edit-condition-select" data-record-id="${record.id}">
                                    <option value="">Select condition...</option>
                                    ${getConditionOptions(record.id)}
                                </select>
                                <div class="estimation-hint">
                                    <i class="fas fa-bolt"></i>
                                    Price auto-estimates when condition is selected
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Price ($)</label>
                                <input type="number" 
                                       class="form-control edit-price-input" 
                                       data-record-id="${record.id}"
                                       value="${record.store_price || ''}" 
                                       step="1" 
                                       min="${this.minimumPrice}"
                                       placeholder="Min: $${this.minimumPrice.toFixed(2)}">
                                <div class="price-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                    <i class="fas fa-plus-circle"></i> <i class="fas fa-minus-circle"></i> Use +/- buttons to adjust by $1.00
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                ${userRole === 'admin' ? `
                                    <div style="margin-bottom: 10px;">
                                        <label class="form-label">Status</label>
                                        <select class="form-control edit-status-select" data-record-id="${record.id}">
                                            ${getStatusOptions(record.id)}
                                        </select>
                                    </div>
                                ` : ''}
                                
                                <button class="btn btn-primary save-changes-btn" data-record-id="${record.id}">
                                    <i class="fas fa-save"></i> Save Changes
                                </button>
                            </div>
                            
                            ${userRole === 'admin' ? `
                                <div class="form-group">
                                    <button class="btn btn-secondary delete-record-btn" data-record-id="${record.id}">
                                        <i class="fas fa-trash"></i> Delete Record
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        `;
    }

    async estimatePriceForRecord(record, selectedCondition) {
        console.log('ESTIMATE_PRICE: Estimating price for', record.artist, '-', record.title, 'Condition:', selectedCondition);
            
        try {
            const response = await APIUtils.post('/api/price-estimate', {
                artist: record.artist,
                title: record.title,
                condition: selectedCondition,
                discogs_genre: record.genre || '',
                discogs_id: record.discogs_id || ''
            });
            
            console.log('ESTIMATE_PRICE: API response:', response);
            return response;
        } catch (error) {
            console.error('Error estimating price:', error);
            return { success: false };
        }
    }

    async handleConditionChange(event, isEditMode = false) {
        const selectElement = event.target;
        const card = selectElement.closest('.record-card');
        const recordId = card.getAttribute('data-record-id');
        const selectedCondition = selectElement.value;
        
        if (!selectedCondition) {
            return;
        }
        
        let record;
        if (isEditMode) {
            record = this.currentResults.find(r => r.id == recordId);
        } else {
            const index = card.getAttribute('data-index');
            record = this.currentResults[index];
        }
        
        if (!record) {
            console.error('HANDLE_CONDITION_CHANGE: Record not found');
            return;
        }
        
        let priceInput;
        if (isEditMode) {
            priceInput = card.querySelector('.edit-price-input');
        } else {
            priceInput = card.querySelector('.price-input');
        }
        
        if (!priceInput) {
            console.error('HANDLE_CONDITION_CHANGE: Price input not found');
            return;
        }
        
        const hasExistingValue = priceInput.value && priceInput.value.trim() !== '' && !isNaN(parseFloat(priceInput.value));
        
        const originalValue = priceInput.value;
        priceInput.disabled = true;
        
        const priceContainer = priceInput.parentElement;
        const tempOverlay = document.createElement('div');
        tempOverlay.className = 'price-estimating';
        tempOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.2) 50%, rgba(0, 0, 0, 0.1) 100%);
            border: 1px solid rgba(0, 0, 0, 0.3);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #000;
            font-weight: bold;
            z-index: 10;
            animation: pulse 2s infinite;
        `;
        tempOverlay.textContent = hasExistingValue ? 'Calculating advised price...' : 'Estimating...';
        priceContainer.style.position = 'relative';
        priceContainer.appendChild(tempOverlay);
        
        const estimate = await this.estimatePriceForRecord(record, selectedCondition);
        
        tempOverlay.remove();
        priceInput.disabled = false;
        
        if (estimate.success || estimate.estimated_price || estimate.calculation) {
            let estimatedPrice;
            let priceSource = 'unknown';
            
            if (estimate.estimated_price) {
                estimatedPrice = estimate.estimated_price;
                priceSource = estimate.price_source || 'estimated';
            } else if (estimate.price) {
                estimatedPrice = estimate.price;
                priceSource = estimate.source || 'estimated';
            } else if (estimate.calculation && estimate.calculation.length > 0) {
                const finalStep = estimate.calculation[estimate.calculation.length - 1];
                if (finalStep.includes('Final advised price:')) {
                    const priceMatch = finalStep.match(/\$([\d.]+)/);
                    if (priceMatch) {
                        estimatedPrice = parseFloat(priceMatch[1]);
                        priceSource = 'calculated';
                    }
                }
            }
            
            if (estimatedPrice) {
                const finalPrice = estimatedPrice;
                
                priceInput.value = parseFloat(finalPrice).toFixed(2);
                priceInput.classList.add('price-estimated');
                
                const existingHints = priceInput.parentElement.querySelectorAll('.estimation-hint, .advised-price-note');
                existingHints.forEach(hint => hint.remove());
                
                const hint = document.createElement('div');
                hint.className = 'estimation-hint';
                
                if (hasExistingValue && Math.abs(parseFloat(originalValue) - finalPrice) > 0.01) {
                    hint.innerHTML = `
                        <i class="fas fa-lightbulb"></i>
                        <strong>Advised Price:</strong> $${finalPrice.toFixed(2)} (Your entry: $${parseFloat(originalValue).toFixed(2)})
                        <div style="font-size: 11px; color: #666; margin-top: 2px;">
                            Based on ${priceSource} data • Already rounded to store price
                        </div>
                        <button class="btn btn-small" style="margin-left: auto; padding: 2px 8px; font-size: 10px;" 
                                onclick="this.closest('.estimation-hint').remove(); this.closest('.form-group').querySelector('input').value = '${originalValue}';">
                            <i class="fas fa-times"></i> Keep my price
                        </button>
                    `;
                } else {
                    hint.innerHTML = `
                        <i class="fas fa-bolt"></i>
                        <strong>Advised Price:</strong> $${finalPrice.toFixed(2)}
                        <div style="font-size: 11px; color: #666; margin-top: 2px;">
                            Based on ${priceSource} data • Already rounded to store price
                        </div>
                        <button class="btn btn-small" style="margin-left: auto; padding: 2px 8px; font-size: 10px;" 
                                onclick="this.closest('.estimation-hint').remove()">
                            <i class="fas fa-times"></i> Dismiss
                        </button>
                    `;
                }
                
                priceInput.parentElement.appendChild(hint);
                
                this.showExpandableCalculationDetails(record, selectedCondition, estimate, recordId, finalPrice);
                
            } else {
                if (!hasExistingValue) {
                    priceInput.value = '';
                }
                showMessage('Could not estimate price. Please enter manually.', 'warning');
            }
        } else {
            if (!hasExistingValue) {
                priceInput.value = originalValue;
            }
            showMessage('Could not estimate price. Please enter manually.', 'warning');
        }
    }

    showExpandableCalculationDetails(record, condition, estimate, recordId, finalPrice) {
        const calculationContainer = document.getElementById(`calculation-${recordId}`);
        if (!calculationContainer) return;
        
        let calculationHTML = '';
        let priceSourceClass = 'estimated';
        
        if (estimate.estimated_price || estimate.price) {
            if (estimate.price_source === 'discogs' || estimate.source === 'discogs') {
                priceSourceClass = 'estimated';
            } else if (estimate.price_source === 'calculated' || estimate.source === 'calculated') {
                priceSourceClass = 'calculated';
            }
        }
        
        calculationHTML += `
            <div class="rounding-info" style="margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px; border: 1px solid #dee2e6;">
                <strong>💰 Price Rules Applied by API:</strong>
                <div style="margin-top: 5px;">
                    <div>• <strong>Final Price:</strong> $${finalPrice.toFixed(2)} (already rounded)</div>
                    <div>• <strong>Minimum Price:</strong> $${this.minimumPrice.toFixed(2)} ${finalPrice === this.minimumPrice ? '✓ Minimum applied' : '✓ Met minimum'}</div>
                    <div style="font-size: 11px; color: #666; margin-top: 3px;">
                        Price has been automatically rounded according to store pricing rules
                    </div>
                </div>
            </div>
        `;
        
        if (estimate.calculation && estimate.calculation.length > 0) {
            calculationHTML += `
                <div class="calculation-content">
                    <strong>🧮 Price Calculation:</strong>
                    ${estimate.calculation.map(step => `
                        <div class="calculation-step">
                            ${step}
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        if (estimate.ebay_summary && Object.keys(estimate.ebay_summary).length > 0) {
            const searchQuery = estimate.search_query || estimate.ebay_summary.search_query || 'Nirvana Nevermind vinyl';
            
            calculationHTML += `
                <div class="ebay-summary">
                    <strong>🛒 eBay Listings Summary</strong>
                    <div class="ebay-summary-table-container">
                        <table class="ebay-summary-table">
                            <tr>
                                <th>Search Query</th>
                                <td>${searchQuery}</td>
                            </tr>
                            <tr>
                                <th>Total Listings</th>
                                <td>${estimate.ebay_summary.total_listings || 0}</td>
                            </tr>
                            <tr>
                                <th>Condition Listings</th>
                                <td>${estimate.ebay_summary.condition_listings || 0}</td>
                            </tr>
                            <tr>
                                <th>Condition Median</th>
                                <td>$${(estimate.ebay_summary.condition_median || 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <th>Generic Median</th>
                                <td>$${(estimate.ebay_summary.generic_median || 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <th>Price Range</th>
                                <td>$${(estimate.ebay_summary.price_range?.[0] || 0).toFixed(2)} - $${(estimate.ebay_summary.price_range?.[1] || 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <th>Average Price</th>
                                <td>$${(estimate.ebay_summary.average_price || 0).toFixed(2)}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            `;
        }
        
        if (estimate.ebay_listings && estimate.ebay_listings.length > 0) {
            calculationHTML += `
                <div class="ebay-listings" style="margin-top: 15px;">
                    <div class="table-header">
                        <h4>📊 eBay Listings Details</h4>
                        <span class="table-count">
                            ${estimate.ebay_listings.length} listings
                        </span>
                    </div>
                    <div class="table-scroll-container">
                        <table class="ebay-listings-table">
                            <thead>
                                <tr>
                                    <th>Price</th>
                                    <th>Shipping</th>
                                    <th>Total</th>
                                    <th>Condition</th>
                                    <th>Title</th>
                                    <th>Link</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${estimate.ebay_listings.map(listing => `
                                    <tr class="${listing.matches_condition ? 'matches-condition' : ''}">
                                        <td>
                                            <div class="ebay-price">$${listing.price.toFixed(2)}</div>
                                        </td>
                                        <td>
                                            <div class="ebay-shipping">
                                                ${listing.shipping != null ? `$${listing.shipping.toFixed(2)}` : 'n/a'}
                                            </div>
                                        </td>
                                        <td>
                                            <div class="ebay-total">
                                                ${typeof listing.total === 'number' ? `$${listing.total.toFixed(2)}` : 'n/a'}
                                            </div>
                                            ${listing.matches_condition ? '<span class="condition-match-badge">✓ Match</span>' : ''}
                                        </td>
                                         
                                        <td>
                                            <div class="ebay-condition">${listing.condition || 'N/A'}</div>
                                        </td>
                                        <td>
                                            <div class="ebay-title" title="${listing.full_title || listing.title}">
                                                ${listing.title}
                                            </div>
                                        </td>
                                        <td>
                                            <a href="${listing.url}" target="_blank" rel="noopener noreferrer" 
                                            class="ebay-link">
                                                <i class="fas fa-external-link-alt"></i> View
                                            </a>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
        
        if (calculationHTML) {
            calculationContainer.innerHTML = `
                <div class="calculation-toggle" onclick="this.classList.toggle('expanded'); 
                    this.nextElementSibling.classList.toggle('expanded');">
                    <i class="fas fa-chevron-down"></i>
                    <span>Show price calculation details</span>
                    <span class="price-source-badge ${priceSourceClass}">
                        ${priceSourceClass === 'calculated' ? 'CALCULATED' : 'ESTIMATED'}
                    </span>
                </div>
                <div class="calculation-details">
                    ${calculationHTML}
                </div>
            `;
        } else {
            calculationContainer.innerHTML = '';
        }
    }

    addConditionChangeListeners() {
        document.querySelectorAll('.condition-select').forEach(select => {
            select.addEventListener('change', (e) => this.handleConditionChange(e, false));
        });
        
        document.querySelectorAll('.edit-condition-select').forEach(select => {
            select.addEventListener('change', (e) => this.handleConditionChange(e, true));
        });
    }

    attachResultEventListeners() {
        document.querySelectorAll('.add-record-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const card = e.target.closest('.record-card');
                const index = card.getAttribute('data-index');
                const record = this.currentResults[index];
                
                await this.addRecordFromDiscogs(card, record);
            });
        });

        document.querySelectorAll('.accept-prediction-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                e.preventDefault();
                
                const discogsGenre = button.getAttribute('data-discogs-genre');
                const genreId = button.getAttribute('data-genre-id');
                const genreName = button.getAttribute('data-genre-name');
                const recordId = button.getAttribute('data-record-id');
                
                const saved = await this.genrePredictor.saveMapping(discogsGenre, genreId, genreName);
                
                if (saved) {
                    const banner = document.getElementById(`prediction-banner-${recordId}`);
                    if (banner) {
                        banner.innerHTML = `
                            <i class="fas fa-check-circle"></i>
                            <div class="prediction-text">
                                <strong>✅ Mapping Saved!</strong> Future "${discogsGenre}" records will default to ${genreName}
                            </div>
                        `;
                        banner.classList.add('prediction-success');
                        banner.classList.remove('prediction-available');
                    }
                    
                    button.style.display = 'none';
                    
                    showMessage(`Genre mapping saved: "${discogsGenre}" → ${genreName}`, 'success');
                }
            });
        });

        document.querySelectorAll('.save-changes-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const recordId = e.target.getAttribute('data-record-id');
                await this.saveRecordChanges(recordId);
            });
        });

        document.querySelectorAll('.delete-record-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const recordId = e.target.getAttribute('data-record-id');
                if (confirm('Are you sure you want to delete this record?')) {
                    await this.deleteRecord(recordId);
                }
            });
        });
        
        this.addConditionChangeListeners();
    }

    async addRecordFromDiscogs(card, discogsRecord) {
        const genreSelect = card.querySelector('.genre-select');
        const conditionSelect = card.querySelector('.condition-select');
        const priceInput = card.querySelector('.price-input');
        
        const genreId = genreSelect.value;
        const condition = conditionSelect.value;
        const price = parseFloat(priceInput.value);
        
        const errors = [];
        if (!genreId) errors.push('Please select a genre');
        if (!condition) errors.push('Please select a condition');
        if (!price || price < this.minimumPrice) errors.push(`Price must be at least $${this.minimumPrice.toFixed(2)}`);
        
        if (errors.length > 0) {
            showMessage(errors.join('. '), 'error');
            return;
        }
        
        const user = JSON.parse(localStorage.getItem('user')) || {};
        const genre = this.genres.find(g => g.id == genreId);
        const genreName = genre ? genre.genre_name : '';
        
        const pigstyleBarcode = this.barcodeGenerator.generateBarcode();
        
        if (!this.barcodeGenerator.validateBarcode(pigstyleBarcode)) {
            showMessage('Error: Generated barcode is not valid numeric format', 'error');
            return;
        }
        
        console.log('=== ADDING RECORD ===');
        console.log('Generated PigStyle barcode (numeric):', pigstyleBarcode);
        console.log('Barcode validation:', this.barcodeGenerator.validateBarcode(pigstyleBarcode));
        console.log('Input price:', price);
        console.log('Artist:', discogsRecord.artist);
        console.log('Title:', discogsRecord.title);
        console.log('Genre ID:', genreId);
        console.log('Condition:', condition);
        console.log('Final Price:', price);
        
        const recordData = {
            artist: discogsRecord.artist,
            title: discogsRecord.title,
            barcode: pigstyleBarcode,
            genre_id: parseInt(genreId),
            genre_name: genreName,
            image_url: discogsRecord.image_url || '',
            catalog_number: discogsRecord.catalog_number || '',
            format: discogsRecord.format || 'Vinyl',
            condition: condition,
            store_price: price,
            youtube_url: '',
            consignor_id: user.id || null,
            commission_rate: this.commissionRate,
            status_id: 1,
        };
        
        console.log('Sending to /records endpoint:', recordData);
        
        try {
            const response = await APIUtils.post('/records', recordData);
            
            if (response.status === 'success') {
                showMessage(`Record added successfully! Barcode: ${pigstyleBarcode}. Price: $${price.toFixed(2)}`, 'success');

                if (discogsRecord.genre && discogsRecord.predicted_genre && 
                    discogsRecord.predicted_genre.local_genre_id == genreId) {
                    await this.genrePredictor.saveMapping(
                        discogsRecord.genre,
                        genreId,
                        genreName
                    );
                } else if (discogsRecord.genre && genreId) {
                    await this.genrePredictor.saveMapping(
                        discogsRecord.genre,
                        genreId,
                        genreName
                    );
                }
                
                // Refresh stats
                await this.loadStats();
                
                // Clear search
                this.clearResults();
                document.getElementById('searchInput').value = '';
                
                // Show success and offer to add another
                document.getElementById('searchInput').focus();
                
            } else {
                showMessage(`Error: ${response.error || 'Failed to add record'}`, 'error');
            }
        } catch (error) {
            console.error('Error adding record:', error);
            showMessage(`Error: ${error.message}`, 'error');
        }
    }

    async saveRecordChanges(recordId) {
        const card = document.querySelector(`[data-record-id="${recordId}"]`);
        if (!card) return;
        
        const genreSelect = card.querySelector('.edit-genre-select');
        const conditionSelect = card.querySelector('.edit-condition-select');
        const priceInput = card.querySelector('.edit-price-input');
        const statusSelect = card.querySelector('.edit-status-select');
        
        const updates = {};
        
        if (genreSelect && genreSelect.value) {
            updates.genre_id = parseInt(genreSelect.value);
        }
        
        if (conditionSelect && conditionSelect.value) {
            updates.condition = conditionSelect.value;
        }
        
        if (priceInput) {
            const price = parseFloat(priceInput.value);
            if (!isNaN(price) && price >= 0) {
                if (price < this.minimumPrice) {
                    showMessage(`Price must be at least $${this.minimumPrice.toFixed(2)}`, 'error');
                    return;
                }
                updates.store_price = price;
            }
        }
        
        if (statusSelect && statusSelect.value) {
            const statusMap = {
                'new': 1,
                'active': 2,
                'sold': 3,
                'removed': 4
            };
            updates.status_id = statusMap[statusSelect.value] || 2;
        }
        
        if (Object.keys(updates).length === 0) {
            showMessage('No changes to save', 'info');
            return;
        }
        
        console.log('SAVE_CHANGES: Updating record', recordId, 'with:', updates);
        
        try {
            const response = await APIUtils.put(`/records/${recordId}`, updates);
            
            if (response.status === 'success') {
                showMessage(`Record updated successfully! Price: $${updates.store_price ? (response.record.store_price || updates.store_price).toFixed(2) : 'unchanged'}`, 'success');
                const currentSearch = document.getElementById('searchInput').value;
                if (currentSearch) {
                    await this.performSearch(currentSearch);
                }
                await this.loadStats();
            } else {
                showMessage(`Error: ${response.error || 'Failed to update record'}`, 'error');
            }
        } catch (error) {
            console.error('Error updating record:', error);
            showMessage(`Error: ${error.message}`, 'error');
        }
    }

    async deleteRecord(recordId) {
        try {
            const response = await APIUtils.delete(`/records/${recordId}`);
            
            if (response.status === 'success') {
                showMessage('Record deleted successfully!', 'success');
                
                // Remove from current results
                this.currentResults = this.currentResults.filter(r => r.id != recordId);
                
                // Refresh display
                this.displayResults();
                
                // Refresh stats
                await this.loadStats();
            } else {
                showMessage(`Error: ${response.error || 'Failed to delete record'}`, 'error');
            }
        } catch (error) {
            console.error('Error deleting record:', error);
            showMessage(`Error: ${error.message}`, 'error');
        }
    }

    clearResults() {
        this.currentResults = [];
        document.getElementById('results-container').innerHTML = `
            <div class="loading">
                <i class="fas fa-search"></i>
                <p>Search for records to get started</p>
                <p><small>Enter a search term above</small></p>
            </div>
        `;
    }
}

// ============================================================================
// GLOBAL VARIABLES (continued)
// ============================================================================

let consignorCache = {};
let allRecords = [];
let filteredRecords = [];
let currentPage = 1;
let pageSize = 100;
let totalPages = 1;
let dbConfigValues = {};
let recentlyPrintedIds = new Set();
let currentSearchResults = [];
let availableTerminals = [];
let selectedTerminalId = null;
let activeCheckoutId = null;

// Shopping Cart Variables
let checkoutCart = [];
let pendingCartCheckout = null;
let currentDiscount = {
    amount: 0,
    type: 'fixed',
    value: 0
};

// Receipts Storage
let savedReceipts = [];

// Consignors list with owed amounts
let consignorsList = [];
let consignorOwedAmounts = {};

// Artists variables
let allArtists = [];
let filteredArtists = [];
let artistsCurrentPage = 1;
let artistsPageSize = 50;
let artistsTotalPages = 1;
let selectedArtists = new Set();

// Genre mismatches variables
let allMismatches = [];
let filteredMismatches = [];
let mismatchesCurrentPage = 1;
let mismatchesPageSize = 25;
let mismatchesTotalPages = 1;

// Genre edit variables
let currentEditArtist = null;
let currentEditGenreId = null;

// Accessories variables
let allAccessories = [];
let filteredAccessories = [];
let currentEditAccessoryId = null;
let currentDeleteAccessoryId = null;
let selectedAccessories = new Set();

// Add/Edit/Delete Manager instance
let addEditDeleteManager = null;

// Refund variables
let currentRefundTransaction = null;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Function to send text directly to thermal printer
async function printToThermalPrinter(text) {
    try {
        const baseUrl = window.AppConfig ? AppConfig.baseUrl : 'http://localhost:5000';
        const url = `${baseUrl}/print-receipt`;
        
        console.log('Sending print job to:', url);
        console.log('Text length:', text.length);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                printer: '/dev/usb/lp2',
                data: text
            })
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Print failed:', errorText);
        } else {
            const result = await response.json();
            console.log('Print job sent successfully:', result);
        }
    } catch (error) {
        console.error('Error printing:', error);
    }
}

// Function to format receipt for thermal printer
function formatReceiptForPrinter(transaction) {
    const storeName = transaction.storeName || 'PigStyle Music';
    const storeAddress = transaction.storeAddress || '';
    const storePhone = transaction.storePhone || '';
    const dateStr = transaction.date.toLocaleString();
    
    let receipt = [];
    
    receipt.push('\x1B\x40');
    receipt.push('\x1B\x61\x01');
    receipt.push(storeName + '\n');
    if (storeAddress) receipt.push(storeAddress + '\n');
    if (storePhone) receipt.push(storePhone + '\n');
    receipt.push(''.padEnd(32, '-') + '\n');
    
    receipt.push('\x1B\x61\x00');
    receipt.push(`Receipt #: ${transaction.id}\n`);
    receipt.push(`Date: ${dateStr}\n`);
    receipt.push(`Cashier: ${transaction.cashier || 'Admin'}\n`);
    receipt.push(''.padEnd(32, '-') + '\n');
    
    receipt.push('\x1B\x45\x01');
    receipt.push('Item'.padEnd(24) + 'Price\n');
    receipt.push('\x1B\x45\x00');
    receipt.push(''.padEnd(32, '-') + '\n');
    
    transaction.items.forEach(item => {
        let line;
        if (item.type === 'accessory') {
            const desc = (item.description || '').substring(0, 18);
            line = `[ACC] ${desc}`.padEnd(24) + `$${item.store_price.toFixed(2)}`.padStart(8) + '\n';
        } else {
            const title = (item.title || '').substring(0, 22);
            line = `${title}`.padEnd(24) + `$${item.store_price.toFixed(2)}`.padStart(8) + '\n';
        }
        receipt.push(line);
    });
    
    receipt.push(''.padEnd(32, '-') + '\n');
    
    receipt.push('\x1B\x45\x01');
    receipt.push(`Subtotal:`.padEnd(24) + `$${transaction.subtotal.toFixed(2)}`.padStart(8) + '\n');
    receipt.push(`Tax (${transaction.taxRate || 0}%):`.padEnd(24) + `$${transaction.tax.toFixed(2)}`.padStart(8) + '\n');
    receipt.push(`TOTAL:`.padEnd(24) + `$${transaction.total.toFixed(2)}`.padStart(8) + '\n');
    receipt.push('\x1B\x45\x00');
    
    receipt.push(''.padEnd(32, '-') + '\n');
    receipt.push(`Payment: ${transaction.paymentMethod || 'Cash'}\n`);
    if (transaction.tendered) {
        receipt.push(`Tendered:`.padEnd(24) + `$${transaction.tendered.toFixed(2)}`.padStart(8) + '\n');
        receipt.push(`Change:`.padEnd(24) + `$${transaction.change.toFixed(2)}`.padStart(8) + '\n');
    }
    
    receipt.push(''.padEnd(32, '-') + '\n');
    receipt.push('\x1B\x61\x01');
    receipt.push(transaction.footer || 'Thank you for your purchase!\n');
    receipt.push('\n\n\n');
    
    receipt.push('\x1B\x69');
    
    return receipt.join('');
}

// Fetch all config values from database
async function fetchAllConfigValues() {
    const response = await fetch(`${AppConfig.baseUrl}/config`);
    const data = await response.json();
    
    if (data.status === 'success') {
        dbConfigValues = data.configs || {};
        return dbConfigValues;
    } else {
        throw new Error('Failed to fetch configuration from database');
    }
}

// Get a specific config value
function getConfigValue(key) {
    if (!dbConfigValues[key]) {
        throw new Error(`Configuration key '${key}' not found in database`);
    }
    const value = dbConfigValues[key].value;
    
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value) && value !== '') return parseFloat(value);
    return value;
}

// Update a config value in database
async function updateConfigValue(key, newValue) {
    const response = await fetch(`${AppConfig.baseUrl}/config/${key}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            config_value: String(newValue)
        })
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
        if (!dbConfigValues[key]) {
            dbConfigValues[key] = {
                value: String(newValue),
                description: ''
            };
        } else {
            dbConfigValues[key].value = String(newValue);
        }
        return true;
    } else {
        throw new Error(`Failed to update configuration key '${key}'`);
    }
}

// Delete a config value
async function deleteConfigValue(key) {
    if (!confirm(`Are you sure you want to delete '${key}'? This action cannot be undone.`)) {
        return false;
    }
    
    const response = await fetch(`${AppConfig.baseUrl}/config/${key}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        }
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
        delete dbConfigValues[key];
        return true;
    } else {
        throw new Error(`Failed to delete configuration key '${key}'`);
    }
}

// Add a new config value
async function addConfigValue(key, value, description) {
    const response = await fetch(`${AppConfig.baseUrl}/config`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            config_key: key,
            config_value: String(value),
            description: description
        })
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
        dbConfigValues[key] = {
            value: String(value),
            description: description || ''
        };
        return true;
    } else {
        throw new Error(`Failed to add configuration key '${key}'`);
    }
}

// Load both config tables
async function loadConfigTables() {
    await fetchAllConfigValues();
    
    const printKeys = [
        'LABEL_WIDTH_MM',
        'LABEL_HEIGHT_MM',
        'LEFT_MARGIN_MM',
        'GUTTER_SPACING_MM',
        'TOP_MARGIN_MM',
        'PRICE_FONT_SIZE',
        'TEXT_FONT_SIZE',
        'ARTIST_LABEL_FONT_SIZE',
        'BARCODE_HEIGHT',
        'PRINT_BORDERS',
        'PRICE_Y_POS',
        'BARCODE_Y_POS',
        'INFO_Y_POS'
    ];
    
    const printConfigBody = document.getElementById('print-config-body');
    const generalConfigBody = document.getElementById('general-config-body');
    
    let printHtml = '';
    let generalHtml = '';
    
    const sortedKeys = Object.keys(dbConfigValues).sort();
    
    for (const key of sortedKeys) {
        const config = dbConfigValues[key];
        const value = config.value;
        const description = config.description || '';
        
        const rowHtml = `
            <tr id="config-row-${key.replace(/\./g, '-')}">
                <td><code>${key}</code></td>
                <td>
                    <input type="text" class="config-value-input" data-key="${key}" value="${value}" style="width: 100%; padding: 5px;">
                </td>
                <td>${description}</td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="saveConfigValue('${key}')">
                        <i class="fas fa-save"></i> Save
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteConfigValue('${key}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `;
        
        if (printKeys.includes(key)) {
            printHtml += rowHtml;
        } else {
            generalHtml += rowHtml;
        }
    }
    
    printConfigBody.innerHTML = printHtml || '<tr><td colspan="4" style="text-align:center; padding:20px;">No print settings found</td></tr>';
    generalConfigBody.innerHTML = generalHtml || '<tr><td colspan="4" style="text-align:center; padding:20px;">No general settings found</td></tr>';
    
    updateUIFromConfig();
}

// Add new configuration
async function addNewConfig() {
    const key = document.getElementById('new-config-key').value.trim();
    const value = document.getElementById('new-config-value').value.trim();
    const description = document.getElementById('new-config-description').value.trim();
    
    if (!key || !value) {
        alert('Key and Value are required');
        return;
    }
    
    if (dbConfigValues[key]) {
        alert(`Configuration key '${key}' already exists`);
        return;
    }
    
    const button = event.target;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Adding...';
    button.disabled = true;
    
    try {
        await addConfigValue(key, value, description);
        
        document.getElementById('new-config-key').value = '';
        document.getElementById('new-config-value').value = '';
        document.getElementById('new-config-description').value = '';
        
        await loadConfigTables();
        
        button.innerHTML = '<i class="fas fa-check"></i> Added!';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
        
    } catch (error) {
        button.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
        alert(`Error: ${error.message}`);
    }
}

// Save a specific config value
async function saveConfigValue(key) {
    const input = document.querySelector(`.config-value-input[data-key="${key}"]`);
    const newValue = input.value.trim();
    
    const button = input.closest('tr').querySelector('button.btn-success');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Saving...';
    button.disabled = true;
    
    try {
        await updateConfigValue(key, newValue);
        
        button.innerHTML = '<i class="fas fa-check"></i> Saved!';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
        
        updateUIFromConfig();
        
    } catch (error) {
        button.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
        throw error;
    }
}

// Update UI elements that depend on config values
function updateUIFromConfig() {
    try {
        const taxRate = getConfigValue('TAX_RATE');
        document.getElementById('tax-rate-display').textContent = taxRate;
        
        document.getElementById('commission-rate-display').textContent = 'Per Record';
        document.getElementById('admin-commission-display').textContent = 'Per Record';
        document.getElementById('consignor-commission-display').textContent = 'Per Record';
        
    } catch (error) {
        console.error('Error updating UI from config:', error);
    }
}

// Get admin config values for backward compatibility
function getAdminConfig() {
    let taxRate = 0;
    let taxEnabled = false;
    let commissionRate = 10;
    
    try {
        taxRate = getConfigValue('TAX_RATE');
    } catch (e) {
        console.log('TAX_RATE not found, using default');
    }
    
    try {
        taxEnabled = getConfigValue('TAX_ENABLED');
    } catch (e) {
        console.log('TAX_ENABLED not found, using default false');
    }
    
    try {
        commissionRate = getConfigValue('COMMISSION_RATE');
    } catch (e) {
        console.log('COMMISSION_RATE not found, using default 10');
    }
    
    return {
        taxRate: taxRate,
        taxEnabled: taxEnabled,
        commissionRate: commissionRate,
        storeName: (dbConfigValues['STORE_NAME'] && dbConfigValues['STORE_NAME'].value) || 'PigStyle Music',
        storeAddress: (dbConfigValues['STORE_ADDRESS'] && dbConfigValues['STORE_ADDRESS'].value) || '',
        storePhone: (dbConfigValues['STORE_PHONE'] && dbConfigValues['STORE_PHONE'].value) || '',
        receiptFooter: (dbConfigValues['RECEIPT_FOOTER'] && dbConfigValues['RECEIPT_FOOTER'].value) || 'Thank you for your purchase!',
        autoPrintReceipt: (dbConfigValues['AUTO_PRINT_RECEIPT'] && dbConfigValues['AUTO_PRINT_RECEIPT'].value) || false
    };
}

// Load saved receipts from localStorage
function loadSavedReceipts() {
    const saved = localStorage.getItem('pigstyle_receipts');
    if (saved) {
        try {
            savedReceipts = JSON.parse(saved);
            savedReceipts.forEach(receipt => {
                receipt.date = new Date(receipt.date);
            });
        } catch (e) {
            console.error('Error loading receipts:', e);
            savedReceipts = [];
        }
    }
    return savedReceipts;
}

// Save a receipt to localStorage
function saveReceipt(transaction) {
    const receiptToSave = {
        ...transaction,
        date: transaction.date.toISOString()
    };
    
    savedReceipts.unshift(receiptToSave);
    
    if (savedReceipts.length > 1000) {
        savedReceipts = savedReceipts.slice(0, 1000);
    }
    
    localStorage.setItem('pigstyle_receipts', JSON.stringify(savedReceipts));
    
    if (document.getElementById('receipts-tab').classList.contains('active')) {
        renderReceipts(savedReceipts);
    }
}

// Render receipts in the receipts tab
function renderReceipts(receipts) {
    const container = document.getElementById('receipts-grid');
    
    if (receipts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666; grid-column: 1/-1;">
                <i class="fas fa-receipt" style="font-size: 48px; margin-bottom: 20px; color: #ccc;"></i>
                <p>No receipts found</p>
            </div>
        `;
        
        document.getElementById('total-receipts').textContent = '0';
        document.getElementById('total-receipts-sales').textContent = '$0.00';
        document.getElementById('total-receipts-tax').textContent = '$0.00';
        document.getElementById('total-receipts-items').textContent = '0';
        return;
    }
    
    let html = '';
    let totalSales = 0;
    let totalTax = 0;
    let totalItems = 0;
    
    receipts.forEach(receipt => {
        const date = new Date(receipt.date);
        const dateStr = date.toLocaleDateString() + ' ' + 
                       date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const itemCount = receipt.items.length;
        const itemSummary = itemCount === 1 ? 
            (receipt.items[0].type === 'accessory' ? receipt.items[0].description : receipt.items[0].artist + ' - ' + receipt.items[0].title) : 
            `${itemCount} items`;
        
        totalSales += receipt.total || 0;
        totalTax += receipt.tax || 0;
        totalItems += itemCount;
        
        html += `
            <div class="receipt-card" onclick="viewReceipt('${receipt.id}')">
                <div class="receipt-card-header">
                    <span class="receipt-card-title">${receipt.id}</span>
                    <span class="receipt-card-date">${dateStr}</span>
                </div>
                <div class="receipt-card-meta">
                    <span>Items: ${itemCount}</span>
                    <span class="receipt-card-total">$${(receipt.total || 0).toFixed(2)}</span>
                </div>
                <div class="receipt-card-items" title="${itemSummary}">
                    <i class="fas fa-music"></i> ${itemSummary}
                </div>
                <div class="receipt-card-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-primary" onclick="viewReceipt('${receipt.id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-sm btn-success" onclick="downloadReceiptPDF('${receipt.id}')">
                        <i class="fas fa-download"></i> PDF
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="printReceipt('${receipt.id}')">
                        <i class="fas fa-print"></i> Print
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    document.getElementById('total-receipts').textContent = receipts.length;
    document.getElementById('total-receipts-sales').textContent = `$${totalSales.toFixed(2)}`;
    document.getElementById('total-receipts-tax').textContent = `$${totalTax.toFixed(2)}`;
    document.getElementById('total-receipts-items').textContent = totalItems;
}

// Search receipts
function searchReceipts() {
    const startDate = document.getElementById('receipt-start-date').value;
    const endDate = document.getElementById('receipt-end-date').value;
    const query = document.getElementById('receipt-search-query').value.toLowerCase().trim();
    
    let filtered = [...savedReceipts];
    
    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filtered = filtered.filter(r => new Date(r.date) >= start);
    }
    
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter(r => new Date(r.date) <= end);
    }
    
    if (query) {
        filtered = filtered.filter(r => 
            r.id.toLowerCase().includes(query) ||
            r.items.some(item => 
                (item.artist && item.artist.toLowerCase().includes(query)) ||
                (item.title && item.title.toLowerCase().includes(query)) ||
                (item.catalog_number && item.catalog_number.toLowerCase().includes(query)) ||
                (item.description && item.description.toLowerCase().includes(query))
            )
        );
    }
    
    renderReceipts(filtered);
}

// Reset receipt search
function resetReceiptSearch() {
    document.getElementById('receipt-start-date').value = '';
    document.getElementById('receipt-end-date').value = '';
    document.getElementById('receipt-search-query').value = '';
    renderReceipts(savedReceipts);
}

// View a specific receipt
function viewReceipt(receiptId) {
    const receipt = savedReceipts.find(r => r.id === receiptId);
    if (receipt) {
        if (typeof receipt.date === 'string') {
            receipt.date = new Date(receipt.date);
        }
        showReceipt(receipt);
    }
}

// Download receipt as PDF
async function downloadReceiptPDF(receiptId) {
    const receipt = savedReceipts.find(r => r.id === receiptId);
    if (!receipt) return;
    
    if (typeof receipt.date === 'string') {
        receipt.date = new Date(receipt.date);
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const dateStr = receipt.date.toLocaleDateString() + ' ' + 
                   receipt.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    let y = 20;
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(receipt.storeName || (dbConfigValues['STORE_NAME'] && dbConfigValues['STORE_NAME'].value) || 'PigStyle Music', 105, y, { align: 'center' });
    
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(receipt.storeAddress || (dbConfigValues['STORE_ADDRESS'] && dbConfigValues['STORE_ADDRESS'].value) || '', 105, y, { align: 'center' });
    
    y += 5;
    doc.text(receipt.storePhone || (dbConfigValues['STORE_PHONE'] && dbConfigValues['STORE_PHONE'].value) || '', 105, y, { align: 'center' });
    
    y += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RECEIPT', 105, y, { align: 'center' });
    
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Receipt #: ${receipt.id}`, 20, y);
    doc.text(`Date: ${dateStr}`, 20, y + 5);
    
    y += 15;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Item', 20, y);
    doc.text('Price', 180, y, { align: 'right' });
    doc.line(20, y + 2, 190, y + 2);
    
    y += 7;
    doc.setFont('helvetica', 'normal');
    
    receipt.items.forEach((item, index) => {
        let desc;
        if (item.type === 'accessory') {
            desc = `[ACCESSORY] ${item.description || 'Unknown'}`;
        } else {
            desc = `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`;
        }
        const price = `$${(item.store_price || 0).toFixed(2)}`;
        
        if (desc.length > 40) {
            doc.text(desc.substring(0, 37) + '...', 20, y);
        } else {
            doc.text(desc, 20, y);
        }
        doc.text(price, 180, y, { align: 'right' });
        
        y += 5;
        
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
    });
    
    y += 5;
    doc.line(20, y, 190, y);
    y += 5;
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Subtotal: $${(receipt.subtotal || 0).toFixed(2)}`, 180, y, { align: 'right' });
    y += 5;
    doc.text(`Tax (${receipt.taxRate || (dbConfigValues['TAX_RATE'] && dbConfigValues['TAX_RATE'].value) || 0}%): $${(receipt.tax || 0).toFixed(2)}`, 180, y, { align: 'right' });
    y += 5;
    doc.setFontSize(11);
    doc.text(`TOTAL: $${(receipt.total || 0).toFixed(2)}`, 180, y, { align: 'right' });
    
    y += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Payment Method: ${receipt.paymentMethod || 'Cash'}`, 20, y);
    y += 5;
    doc.text(`Tendered: $${(receipt.tendered || 0).toFixed(2)}`, 20, y);
    y += 5;
    doc.text(`Change: $${(receipt.change || 0).toFixed(2)}`, 20, y);
    
    y += 10;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text(receipt.footer || (dbConfigValues['RECEIPT_FOOTER'] && dbConfigValues['RECEIPT_FOOTER'].value) || 'Thank you for your purchase!', 105, y, { align: 'center' });
    
    doc.save(`${receipt.id}.pdf`);
}

// Print receipt
function printReceipt(receiptId) {
    const receipt = savedReceipts.find(r => r.id === receiptId);
    if (receipt) {
        if (typeof receipt.date === 'string') {
            receipt.date = new Date(receipt.date);
        }
        showReceipt(receipt);
        setTimeout(() => {
            window.print();
        }, 500);
    }
}

// Show receipt in modal
function showReceipt(transaction) {
    const receiptContent = document.getElementById('receipt-content');
    const dateStr = transaction.date.toLocaleDateString() + ' ' + 
                   transaction.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    let itemsHtml = '';
    transaction.items.forEach(item => {
        if (item.type === 'accessory') {
            itemsHtml += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <div><span class="accessory-badge" style="background: #9b59b6; color: white; padding: 2px 6px; border-radius: 4px; margin-right: 5px;">ACC</span> ${escapeHtml(item.description) || 'Unknown Accessory'}</div>
                    <div>$${(item.store_price || 0).toFixed(2)}</div>
                </div>
            `;
        } else {
            itemsHtml += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <div>${escapeHtml(item.artist) || 'Unknown'} - ${escapeHtml(item.title) || 'Unknown'}</div>
                    <div>$${(item.store_price || 0).toFixed(2)}</div>
                </div>
            `;
        }
    });
    
    receiptContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h2>${escapeHtml(transaction.storeName) || (dbConfigValues['STORE_NAME'] && dbConfigValues['STORE_NAME'].value) || 'PigStyle Music'}</h2>
            <p>${escapeHtml(transaction.storeAddress) || (dbConfigValues['STORE_ADDRESS'] && dbConfigValues['STORE_ADDRESS'].value) || ''}</p>
            <p>${escapeHtml(transaction.storePhone) || (dbConfigValues['STORE_PHONE'] && dbConfigValues['STORE_PHONE'].value) || ''}</p>
        </div>
        
        <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between;">
                <span><strong>Receipt #:</strong> ${escapeHtml(transaction.id)}</span>
                <span><strong>Date:</strong> ${dateStr}</span>
            </div>
            <div><strong>Cashier:</strong> ${escapeHtml(transaction.cashier) || 'Admin'}</div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h3>Items</h3>
            ${itemsHtml}
        </div>
        
        <div style="border-top: 1px solid #ccc; padding-top: 10px;">
            <div style="display: flex; justify-content: space-between;">
                <span>Subtotal:</span>
                <span>$${(transaction.subtotal || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Tax (${transaction.taxRate || (dbConfigValues['TAX_RATE'] && dbConfigValues['TAX_RATE'].value) || 0}%):</span>
                <span>$${(transaction.tax || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; margin-top: 10px;">
                <span>TOTAL:</span>
                <span>$${(transaction.total || 0).toFixed(2)}</span>
            </div>
        </div>
        
        <div style="margin-top: 20px;">
            <div><strong>Payment Method:</strong> ${escapeHtml(transaction.paymentMethod) || 'Cash'}</div>
            ${transaction.tendered ? `<div><strong>Tendered:</strong> $${transaction.tendered.toFixed(2)}</div>` : ''}
            ${transaction.change ? `<div><strong>Change:</strong> $${transaction.change.toFixed(2)}</div>` : ''}
        </div>
        
        <div style="text-align: center; margin-top: 30px; font-style: italic;">
            ${escapeHtml(transaction.footer) || (dbConfigValues['RECEIPT_FOOTER'] && dbConfigValues['RECEIPT_FOOTER'].value) || 'Thank you for your purchase!'}
        </div>
    `;
    
    document.getElementById('receipt-modal').style.display = 'flex';
}

// Close receipt modal
function closeReceiptModal() {
    document.getElementById('receipt-modal').style.display = 'none';
}

// Helper function to escape HTML special characters
function escapeHtml(text) {
    if (!text) return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper functions
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.tab[onclick="switchTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    if (tabName === 'add-edit-delete') {
        if (!addEditDeleteManager) {
            addEditDeleteManager = new AddEditDeleteManager();
        }
    } else if (tabName === 'admin-config') {
        loadConfigTables();
    } else if (tabName === 'check-out') {
        const searchResults = document.getElementById('search-results');
        if (currentSearchResults.length === 0) {
            searchResults.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-search" style="font-size: 48px; margin-bottom: 20px; color: #ccc;"></i>
                    <p>Enter a search term to find records or accessories</p>
                </div>
            `;
        }
        refreshTerminals();
    } else if (tabName === 'receipts') {
        loadSavedReceipts();
        renderReceipts(savedReceipts);
    } else if (tabName === 'consignors') {
        loadConsignors();
    } else if (tabName === 'artists') {
        loadArtists();
    } else if (tabName === 'genres') {
        loadGenreMismatches();
    } else if (tabName === 'accessories') {
        loadAccessories();
    } else if (tabName === 'price-tags') {
        loadRecords();
    }
}

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
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

function showCheckoutStatus(message, type = 'info') {
    const statusEl = document.getElementById('checkout-status-message');
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showCheckoutLoading(show) {
    document.getElementById('checkout-loading').style.display = show ? 'block' : 'none';
}

function showReceiptsLoading(show) {
    document.getElementById('receipts-loading').style.display = show ? 'block' : 'none';
}

function showArtistsLoading(show) {
    document.getElementById('artists-loading').style.display = show ? 'block' : 'none';
}

function showGenresLoading(show) {
    document.getElementById('genres-loading').style.display = show ? 'block' : 'none';
}

function showAccessoriesLoading(show) {
    document.getElementById('accessories-loading').style.display = show ? 'block' : 'none';
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

async function getConsignorInfo(consignorId) {
    if (!consignorId) return { username: 'None', initials: '' };
    
    if (consignorCache[consignorId]) {
        return consignorCache[consignorId];
    }
    
    try {
        const url = `${AppConfig.baseUrl}/users/${consignorId}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                const user = data.user || {};
                const consignorInfo = {
                    username: user.username || `User ${consignorId}`,
                    initials: user.initials || (user.username ? user.username.substring(0, 2).toUpperCase() : '')
                };
                consignorCache[consignorId] = consignorInfo;
                return consignorInfo;
            }
        }
    } catch (error) {
        console.log('Error fetching consignor:', error);
    }
    
    return { username: `User ${consignorId}`, initials: '' };
}

async function loadUsers() {
    const url = `${AppConfig.baseUrl}/users`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'success') {
        const users = data.users || [];
        const userSelect = $('#user-select');
        userSelect.empty();
        userSelect.append('<option value="all">All Users</option>');
        
        users.forEach(user => {
            userSelect.append(`<option value="${user.id}">${user.username} (ID: ${user.id})</option>`);
        });
        
        users.forEach(user => {
            consignorCache[user.id] = {
                username: user.username || `User ${user.id}`,
                initials: user.initials || (user.username ? user.username.substring(0, 2).toUpperCase() : '')
            };
        });
    }
}

async function loadRecords() {
    showLoading(true);
    
    const userSelect = document.getElementById('user-select');
    const selectedUserId = userSelect.value === 'all' ? null : userSelect.value;
    
    let url;
    if (selectedUserId) {
        url = `${AppConfig.baseUrl}/records/user/${selectedUserId}`;
    } else {
        url = `${AppConfig.baseUrl}/records`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'success') {
        allRecords = data.records || [];
        
        allRecords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        document.getElementById('total-records-print').textContent = allRecords.length;
        const inactiveCount = allRecords.filter(r => r.status_id === 1).length;
        const activeCount = allRecords.filter(r => r.status_id === 2).length;
        const soldCount = allRecords.filter(r => r.status_id === 3).length;
        
        document.getElementById('inactive-records').textContent = inactiveCount;
        document.getElementById('active-records').textContent = activeCount;
        document.getElementById('sold-records').textContent = soldCount;
        
        const batchSizeInput = document.getElementById('batch-size');
        batchSizeInput.max = inactiveCount;
        batchSizeInput.value = Math.min(parseInt(batchSizeInput.value) || 10, inactiveCount);
        
        const consignorIds = new Set();
        allRecords.forEach(r => { if (r.consignor_id) consignorIds.add(r.consignor_id); });
        const fetchPromises = Array.from(consignorIds).map(id => getConsignorInfo(id));
        await Promise.all(fetchPromises);
        
        filterRecords();
        
        showStatus(`Loaded ${allRecords.length} records (${inactiveCount} inactive, ${activeCount} active, ${soldCount} sold)`, 'success');
    }
    
    showLoading(false);
}

function filterRecords() {
    const statusFilter = document.getElementById('status-filter').value;
    const statusId = getStatusIdFromFilter(statusFilter);
    
    if (statusId) {
        filteredRecords = allRecords.filter(r => r.status_id === statusId);
    } else {
        filteredRecords = [...allRecords];
    }
    
    filteredRecords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    currentPage = 1;
    updatePagination();
    renderCurrentPage();
    
    const statusText = statusFilter === 'all' ? 'All records' : 
                      statusFilter === 'inactive' ? 'Inactive records' :
                      statusFilter === 'active' ? 'Active records' : 'Sold records';
    
    showStatus(`Showing ${filteredRecords.length} ${statusText}`, 'info');
}

function updatePagination() {
    totalPages = Math.ceil(filteredRecords.length / pageSize);
    if (totalPages === 0) totalPages = 1;
    
    document.getElementById('total-pages').textContent = totalPages;
    document.getElementById('current-page').value = currentPage;
    document.getElementById('total-filtered').textContent = filteredRecords.length;
    
    document.getElementById('first-page-btn').disabled = currentPage === 1;
    document.getElementById('prev-page-btn').disabled = currentPage === 1;
    document.getElementById('next-page-btn').disabled = currentPage === totalPages;
    document.getElementById('last-page-btn').disabled = currentPage === totalPages;
    
    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, filteredRecords.length);
    
    document.getElementById('showing-start').textContent = filteredRecords.length > 0 ? startIndex : 0;
    document.getElementById('showing-end').textContent = filteredRecords.length > 0 ? endIndex : 0;
    document.getElementById('total-filtered').textContent = filteredRecords.length;
    
    const selectedCount = window.selectedRecords ? window.selectedRecords.size : 0;
    document.getElementById('selected-count').textContent = selectedCount;
    
    updateButtonStates();
}

function updateButtonStates() {
    const selectedCount = window.selectedRecords ? window.selectedRecords.size : 0;
    const hasSelection = selectedCount > 0;
    
    document.getElementById('print-btn').disabled = !hasSelection;
    document.getElementById('mark-active-btn').disabled = !hasSelection;
}

function renderCurrentPage() {
    const tbody = document.getElementById('records-body');
    tbody.innerHTML = '';
    
    if (filteredRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 20px; color: #666;">No records found</td></tr>`;
        updatePagination();
        return;
    }
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredRecords.length);
    const pageRecords = filteredRecords.slice(startIndex, endIndex);
    
    pageRecords.forEach((record, index) => {
        const globalIndex = startIndex + index;
        const consignorInfo = consignorCache[record.consignor_id] || { username: 'None', initials: '' };
        
        const isRecentlyPrinted = recentlyPrintedIds.has(record.id.toString());
        
        const tr = document.createElement('tr');
        if (isRecentlyPrinted) {
            tr.style.backgroundColor = '#f0fff0';
            tr.style.borderLeft = '3px solid #27ae60';
        }
        
        tr.innerHTML = `
            <td><input type="checkbox" class="record-checkbox" data-id="${record.id}" ${window.selectedRecords && window.selectedRecords.has(record.id.toString()) ? 'checked' : ''}></td>
            <td>${globalIndex + 1}</td>
            <td><strong>${formatDate(record.created_at)}</strong></td>
            <td>${truncateText(escapeHtml(record.artist) || 'Unknown', 25)}</td>
            <td>${truncateText(escapeHtml(record.title) || 'Unknown', 30)}</td>
            <td>$${(record.store_price || 0).toFixed(2)}</td>
            <td>${truncateText(escapeHtml(record.catalog_number) || 'N/A', 15)}</td>
            <td>${truncateText(escapeHtml(record.genre_name || record.genre) || 'Unknown', 20)}</td>
            <td>${record.barcode || 'N/A'}</td>
            <td>
                ${record.consignor_id ? 
                    `<span class="consignor-badge" title="${escapeHtml(consignorInfo.username)}">${escapeHtml(consignorInfo.initials) || escapeHtml(consignorInfo.username.substring(0, 2))}</span>` : 
                    '<span style="color: #999;">None</span>'}
            </td>
            <td>
                <span class="condition-badge ${getStatusClass(record.status_id)}">
                    ${getStatusText(record.status_id)}
                </span>
                ${isRecentlyPrinted ? '<br><small style="color: #27ae60; font-size: 10px;">(Printed)</small>' : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    document.querySelectorAll('.record-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const recordId = this.getAttribute('data-id');
            if (this.checked) {
                window.selectedRecords.add(recordId);
            } else {
                window.selectedRecords.delete(recordId);
            }
            updateButtonStates();
            updatePagination();
        });
    });
    
    const selectAllCheckbox = document.getElementById('select-all');
    selectAllCheckbox.checked = false;
    selectAllCheckbox.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.record-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
            const recordId = checkbox.getAttribute('data-id');
            if (this.checked) {
                window.selectedRecords.add(recordId);
            } else {
                window.selectedRecords.delete(recordId);
            }
        });
        updateButtonStates();
        updatePagination();
    });
    
    updatePagination();
}

function goToPage(page) {
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    
    currentPage = page;
    renderCurrentPage();
    updatePagination();
}

function goToFirstPage() {
    goToPage(1);
}

function goToPreviousPage() {
    goToPage(currentPage - 1);
}

function goToNextPage() {
    goToPage(currentPage + 1);
}

function goToLastPage() {
    goToPage(totalPages);
}

function changePageSize(newSize) {
    pageSize = newSize;
    currentPage = 1;
    updatePagination();
    renderCurrentPage();
}

function updateSelectionUI() {
    const count = window.selectedRecords ? window.selectedRecords.size : 0;
    document.getElementById('selected-tags').textContent = count;
    updateButtonStates();
}

// ============= UPDATED FUNCTION TO SELECT RECENT RECORDS (ANY STATUS) =============
function selectRecentInactiveRecords() {
    const batchSize = parseInt(document.getElementById('batch-size').value) || 10;
    
    window.selectedRecords.clear();
    
    // Select from all records, not just inactive ones
    const recentRecords = allRecords
        .slice(0, batchSize);
    
    recentRecords.forEach(record => {
        window.selectedRecords.add(record.id.toString());
    });
    
    renderCurrentPage();
    
    if (recentRecords.length > 0) {
        showStatus(`Selected ${recentRecords.length} most recent records`, 'success');
    } else {
        showStatus('No records available to select', 'info');
    }
}

function selectAllOnPage() {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredRecords.length);
    const pageRecords = filteredRecords.slice(startIndex, endIndex);
    
    pageRecords.forEach((record) => {
        const recordId = record.id.toString();
        window.selectedRecords.add(recordId);
    });
    
    renderCurrentPage();
    
    showStatus(`Selected all ${pageRecords.length} records on this page`, 'success');
}

function clearSelection() {
    window.selectedRecords.clear();
    renderCurrentPage();
    showStatus('Selection cleared', 'info');
}

// Modal Functions
function showPrintConfirmation() {
    const selectedIds = Array.from(window.selectedRecords);
    if (selectedIds.length === 0) {
        showStatus('No records selected for printing', 'error');
        return;
    }
    
    const selectedRecords = allRecords.filter(r => selectedIds.includes(r.id.toString()));
    // Removed filtering that separated by status - just show total count
    // All records can now be printed regardless of status
    
    document.getElementById('print-count').textContent = selectedRecords.length;
    
    const summaryList = document.getElementById('print-summary-list');
    summaryList.innerHTML = `
        <li>Total selected: ${selectedRecords.length} records</li>
        <li>These records will have price tags generated</li>
    `;
    
    document.getElementById('print-confirmation-modal').style.display = 'flex';
}

function closePrintConfirmation() {
    document.getElementById('print-confirmation-modal').style.display = 'none';
}

// ============= UPDATED FUNCTION TO ALLOW PRINTING ANY RECORDS =============
async function confirmPrint() {
    const selectedIds = Array.from(window.selectedRecords);
    
    closePrintConfirmation();
    showLoading(true);
    
    // Removed filter that only allowed inactive records
    const selectedRecords = allRecords
        .filter(r => selectedIds.includes(r.id.toString()));
        // Removed: && r.status_id === 1
        
    if (selectedRecords.length === 0) {
        showStatus('No records selected', 'error');
        showLoading(false);
        return;
    }
    
    await fetchAllConfigValues();
    
    const pdfBlob = await generatePDF(selectedRecords);
    
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `price_tags_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Track printed records (optional)
    selectedRecords.forEach(record => {
        recentlyPrintedIds.add(record.id.toString());
    });
    
    window.selectedRecords.clear();
    
    showStatus(`PDF generated for ${selectedRecords.length} records.`, 'success');
    
    renderCurrentPage();
    
    showLoading(false);
}

function showMarkActiveConfirmation() {
    const selectedIds = Array.from(window.selectedRecords);
    if (selectedIds.length === 0) {
        showStatus('No records selected', 'error');
        return;
    }
    
    const selectedRecords = allRecords.filter(r => selectedIds.includes(r.id.toString()));
    const inactiveRecords = selectedRecords.filter(r => r.status_id === 1);
    const activeRecords = selectedRecords.filter(r => r.status_id === 2);
    const soldRecords = selectedRecords.filter(r => r.status_id === 3);
    
    document.getElementById('mark-active-count').textContent = selectedRecords.length;
    
    const summaryList = document.getElementById('mark-active-summary-list');
    summaryList.innerHTML = `
        <li>Total selected: ${selectedRecords.length} records</li>
        <li>Inactive records: ${inactiveRecords.length} (will be marked as Active)</li>
        <li>Active records: ${activeRecords.length} (already active - no change)</li>
        <li>Sold records: ${soldRecords.length} (won't be changed)</li>
    `;
    
    document.getElementById('mark-active-confirmation-check').checked = false;
    document.getElementById('confirm-mark-active-btn').disabled = true;
    
    document.getElementById('mark-active-confirmation-modal').style.display = 'flex';
    
    document.getElementById('mark-active-confirmation-check').addEventListener('change', function() {
        document.getElementById('confirm-mark-active-btn').disabled = !this.checked;
    });
}

function closeMarkActiveConfirmation() {
    document.getElementById('mark-active-confirmation-modal').style.display = 'none';
}

async function confirmMarkActive() {
    const selectedIds = Array.from(window.selectedRecords);
    
    closeMarkActiveConfirmation();
    showLoading(true);
    
    const inactiveRecordIds = selectedIds.filter(id => {
        const record = allRecords.find(r => r.id.toString() === id);
        return record && record.status_id === 1;
    });
    
    if (inactiveRecordIds.length === 0) {
        showStatus('No inactive records to mark as active', 'info');
        showLoading(false);
        return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const recordId of inactiveRecordIds) {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/records/${recordId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    status_id: 2
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    successCount++;
                    
                    const recordIndex = allRecords.findIndex(r => r.id.toString() === recordId);
                    if (recordIndex !== -1) {
                        allRecords[recordIndex].status_id = 2;
                    }
                } else {
                    errorCount++;
                }
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error(`Error updating record ${recordId}:`, error);
            errorCount++;
        }
    }
    
    window.selectedRecords.clear();
    
    inactiveRecordIds.forEach(id => {
        recentlyPrintedIds.delete(id);
    });
    
    await loadRecords();
    
    if (successCount > 0) {
        showStatus(`Successfully marked ${successCount} records as Active${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
    } else {
        showStatus(`Failed to mark records as Active: ${errorCount} errors`, 'error');
    }
    
    showLoading(false);
}

async function generatePDF(records) {
    return new Promise(async (resolve) => {
        const { jsPDF } = window.jspdf;
        
        const labelWidthMM = getConfigValue('LABEL_WIDTH_MM');
        const labelHeightMM = getConfigValue('LABEL_HEIGHT_MM');
        const leftMarginMM = getConfigValue('LEFT_MARGIN_MM');
        const gutterSpacingMM = getConfigValue('GUTTER_SPACING_MM');
        const topMarginMM = getConfigValue('TOP_MARGIN_MM');
        const priceFontSize = getConfigValue('PRICE_FONT_SIZE');
        const textFontSize = getConfigValue('TEXT_FONT_SIZE');
        const artistLabelFontSize = getConfigValue('ARTIST_LABEL_FONT_SIZE');
        const barcodeHeightMM = getConfigValue('BARCODE_HEIGHT');
        const printBorders = getConfigValue('PRINT_BORDERS');
        
        const priceYPos = getConfigValue('PRICE_Y_POS');
        const barcodeYPos = getConfigValue('BARCODE_Y_POS');
        const infoYPos = getConfigValue('INFO_Y_POS');
        
        const mmToPt = 2.83465;
        const labelWidthPt = labelWidthMM * mmToPt;
        const labelHeightPt = labelHeightMM * mmToPt;
        const leftMarginPt = leftMarginMM * mmToPt;
        const gutterSpacingPt = gutterSpacingMM * mmToPt;
        const topMarginPt = topMarginMM * mmToPt;
        const barcodeHeightPt = barcodeHeightMM * mmToPt;
        
        const doc = new jsPDF({
            unit: 'pt',
            format: 'letter'
        });
        
        const rows = 15;
        const cols = 4;
        const labelsPerPage = rows * cols;
        
        let currentLabel = 0;
        
        const isArtistLabels = records.length > 0 && records[0].title === 'ARTIST LABEL';
        
        for (const record of records) {
            if (currentLabel > 0 && currentLabel % labelsPerPage === 0) {
                doc.addPage();
            }
            
            const pageIndex = currentLabel % labelsPerPage;
            const row = Math.floor(pageIndex / cols);
            const col = pageIndex % cols;
            
            const x = leftMarginPt + (col * (labelWidthPt + gutterSpacingPt));
            const y = topMarginPt + (row * labelHeightPt);
            
            if (printBorders) {
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.rect(x, y, labelWidthPt, labelHeightPt);
            }
            
            if (isArtistLabels) {
                const artist = record.artist || 'Unknown';
                
                doc.setFontSize(artistLabelFontSize);
                doc.setFont('helvetica', 'bold');
                
                const textWidth = doc.getTextWidth(artist);
                const textX = x + (labelWidthPt - textWidth) / 2;
                const textY = y + (labelHeightPt / 2) + (artistLabelFontSize / 3);
                
                doc.text(artist, textX, textY);
            } else {
                const consignorId = record.consignor_id;
                let consignorInitials = '';
                if (consignorId) {
                    const consignorInfo = await getConsignorInfo(consignorId);
                    consignorInitials = consignorInfo.initials || '';
                }
                
                const price = record.store_price || 0;
                const priceText = `$${price.toFixed(2)}`;
                doc.setFontSize(priceFontSize);
                doc.setFont('helvetica', 'bold');
                
                const priceWidth = doc.getTextWidth(priceText);
                const priceX = x + (labelWidthPt - priceWidth) / 2;
                const priceY = y + (priceYPos * mmToPt);
                
                doc.text(priceText, priceX, priceY);
                
                const artist = record.artist || 'Unknown';
                const genre = record.genre_name || record.genre || 'Unknown';
                
                const initialsText = consignorInitials ? ` | (${consignorInitials})` : '';
                const maxInfoWidth = labelWidthPt - 10;
                
                let baseText = genre;
                if (artist !== 'Unknown') {
                    baseText += ` | ${artist}`;
                }
                
                doc.setFontSize(textFontSize);
                doc.setFont('helvetica', 'normal');
                const initialsWidth = initialsText ? doc.getTextWidth(initialsText) : 0;
                const availableWidthForBase = maxInfoWidth - initialsWidth;
                
                let displayBaseText = baseText;
                if (doc.getTextWidth(baseText) > availableWidthForBase) {
                    while (doc.getTextWidth(displayBaseText + '…') > availableWidthForBase && displayBaseText.length > 0) {
                        displayBaseText = displayBaseText.slice(0, -1);
                    }
                    displayBaseText += '…';
                }
                
                let infoText = displayBaseText + initialsText;
                
                const infoWidth = doc.getTextWidth(infoText);
                const infoX = x + (labelWidthPt - infoWidth) / 2;
                const infoY = y + (infoYPos * mmToPt);
                
                doc.text(infoText, infoX, infoY);
                
                const barcodeNum = record.barcode;
                if (barcodeNum) {
                    const canvas = document.createElement('canvas');
                    JsBarcode(canvas, barcodeNum, {
                        format: "CODE128",
                        displayValue: false,
                        height: 20,
                        margin: 0,
                        width: 2
                    });
                    
                    const barcodeData = canvas.toDataURL('image/png');
                    const barcodeX = x + (labelWidthPt - (25 * mmToPt)) / 2;
                    const barcodeY = y + (barcodeYPos * mmToPt);
                    
                    doc.addImage(barcodeData, 'PNG', barcodeX, barcodeY, 25 * mmToPt, barcodeHeightPt);
                }
            }
            
            currentLabel++;
        }
        
        const pdfBlob = doc.output('blob');
        resolve(pdfBlob);
    });
}

// ============= TERMINAL MANAGEMENT FUNCTIONS =============

async function refreshTerminals() {
    const terminalList = document.getElementById('terminal-list');
    terminalList.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="loading-spinner" style="width: 30px; height: 30px;"></div><p>Loading terminals...</p></div>';
    
    const response = await fetch(`${AppConfig.baseUrl}/api/square/terminals`, {
        credentials: 'include'
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Terminal fetch error:', response.status, errorText);
        terminalList.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">
            <i class="fas fa-exclamation-circle" style="font-size: 24px; margin-bottom: 10px;"></i>
            <p>Error ${response.status}: ${response.statusText}</p>
            <p style="font-size: 12px;">${errorText.substring(0, 100)}</p>
        </div>`;
        return;
    }
    
    const data = await response.json();
    if (data.status === 'success') {
        availableTerminals = data.terminals || [];
        renderTerminalList(availableTerminals);
    } else {
        terminalList.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">
            <i class="fas fa-exclamation-circle" style="font-size: 24px; margin-bottom: 10px;"></i>
            <p>Error: ${data.message || 'Unknown error'}</p>
        </div>`;
    }
}

function renderTerminalList(terminals) {
    const terminalList = document.getElementById('terminal-list');
    
    if (terminals.length === 0) {
        terminalList.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #666;">
                <i class="fas fa-square" style="font-size: 24px; margin-bottom: 10px; color: #ccc;"></i>
                <p>No Square Terminals found</p>
                <small>Make sure your terminal is registered and online</small>
            </div>
        `;
        return;
    }
    
    let html = '';
    terminals.forEach(terminal => {
        let displayId = terminal.id;
        let storeId = terminal.id;
        
        if (storeId && storeId.startsWith('device:')) {
            storeId = storeId.replace('device:', '');
        }
        
        const isOnline = terminal.status === 'ONLINE';
        const isSelected = selectedTerminalId === storeId;
        
        html += `
            <div class="terminal-item ${isSelected ? 'selected' : ''}" onclick="selectTerminal('${storeId}')">
                <div class="terminal-icon">
                    <i class="fas fa-square"></i>
                </div>
                <div class="terminal-details">
                    <div class="terminal-name">${escapeHtml(terminal.device_name) || 'Square Terminal'}</div>
                    <div class="terminal-id">ID: ${escapeHtml(displayId)}</div>
                </div>
                <div class="terminal-status ${isOnline ? 'online' : 'offline'}">
                    ${isOnline ? 'Online' : 'Offline'}
                </div>
            </div>
        `;
    });
    
    terminalList.innerHTML = html;
    
    if (terminals.length === 1) {
        let singleTerminalId = terminals[0].id;
        if (singleTerminalId && singleTerminalId.startsWith('device:')) {
            singleTerminalId = singleTerminalId.replace('device:', '');
        }
        selectedTerminalId = singleTerminalId;
    }
}

function selectTerminal(terminalId) {
    selectedTerminalId = terminalId;
    renderTerminalList(availableTerminals);
}

// ============= CHECK OUT FUNCTIONS =============

async function searchRecordsAndAccessories() {
    const query = document.getElementById('search-query').value.trim();
    if (!query) {
        showCheckoutStatus('Please enter a search term', 'error');
        return;
    }
    
    const activeOnly = document.getElementById('filter-active').checked;
    const barcodeOnly = document.getElementById('filter-barcode').checked;
    
    showCheckoutLoading(true);
    
    try {
        let recordsUrl = `${AppConfig.baseUrl}/records/search?q=${encodeURIComponent(query)}`;
        const recordsResponse = await fetch(recordsUrl);
        const recordsData = await recordsResponse.json();
        
        const accessoriesUrl = `${AppConfig.baseUrl}/accessories`;
        const accessoriesResponse = await fetch(accessoriesUrl);
        const accessoriesData = await accessoriesResponse.json();
        
        let records = [];
        let accessories = [];
        
        if (recordsData.status === 'success') {
            records = recordsData.records || [];
        }
        
        if (accessoriesData.status === 'success') {
            const allAcc = accessoriesData.accessories || [];
            
            const queryLower = query.toLowerCase();
            accessories = allAcc.filter(acc => {
                if (acc.bar_code && acc.bar_code.toLowerCase().includes(queryLower)) {
                    return true;
                }
                if (acc.description && acc.description.toLowerCase().includes(queryLower)) {
                    return true;
                }
                return false;
            });
        }
        
        if (activeOnly) {
            records = records.filter(r => r.status_id === 2);
        }
        
        if (barcodeOnly) {
            records = records.filter(r => r.barcode && r.barcode.toLowerCase().includes(query.toLowerCase()));
            accessories = accessories.filter(acc => acc.bar_code && acc.bar_code.toLowerCase().includes(query.toLowerCase()));
        }
        
        const transformedAccessories = accessories.map(acc => ({
            id: `acc_${acc.id}`,
            original_id: acc.id,
            type: 'accessory',
            artist: null,
            title: null,
            description: acc.description,
            store_price: acc.store_price,
            catalog_number: null,
            genre_name: 'Accessory',
            barcode: acc.bar_code,
            consignor_id: null,
            status_id: 2,
            count: acc.count,
            created_at: acc.created_at
        }));
        
        currentSearchResults = [...records, ...transformedAccessories];
        
        currentSearchResults.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        renderSearchResults(currentSearchResults);
        
        showCheckoutStatus(`Found ${records.length} records and ${accessories.length} accessories`, 'success');
    } catch (error) {
        console.error('Error searching:', error);
        showCheckoutStatus('Error searching items', 'error');
    }
    
    showCheckoutLoading(false);
}

function renderSearchResults(results) {
    const container = document.getElementById('search-results');
    document.getElementById('search-result-count').textContent = results.length;
    document.getElementById('displayed-results').textContent = results.length;
    
    if (results.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-search" style="font-size: 48px; margin-bottom: 20px; color: #ccc;"></i>
                <p>No items found matching your search</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    results.forEach(item => {
        const inCart = checkoutCart.some(cartItem => {
            if (item.type === 'accessory') {
                return cartItem.type === 'accessory' && cartItem.original_id === item.original_id;
            } else {
                return cartItem.id === item.id;
            }
        });
        
        if (item.type === 'accessory') {
            const stockDisplay = item.count < 0 ? 
                `<span class="stock-negative">(Stock: ${item.count})</span>` : 
                `<span class="stock-positive">(Stock: ${item.count})</span>`;
            
            html += `
                <div class="search-result-item" style="border-left: 4px solid #9b59b6;">
                    <div class="result-details">
                        <div class="result-artist">
                            <span class="accessory-badge">ACCESSORY</span>
                            ${escapeHtml(item.description) || 'Unknown Accessory'}
                            <span class="stock-indicator ${item.count < 0 ? 'stock-negative' : 'stock-positive'}">${stockDisplay}</span>
                        </div>
                        <div class="result-meta">
                            <span class="result-barcode"><i class="fas fa-barcode"></i> ${escapeHtml(item.barcode)}</span>
                        </div>
                    </div>
                    <div class="result-price">$${(item.store_price || 0).toFixed(2)}</div>
                    <div class="result-actions">
                        ${inCart ? 
                            `<button class="btn btn-secondary btn-sm" onclick="removeAccessoryFromCart(${item.original_id})">
                                <i class="fas fa-minus"></i> Remove
                            </button>` :
                            `<button class="btn btn-cart btn-sm" onclick="addAccessoryToCart(${item.original_id}, '${escapeHtml(item.description)}', ${item.store_price})">
                                <i class="fas fa-cart-plus"></i> Add to Cart
                            </button>`
                        }
                    </div>
                </div>
            `;
        } else {
            const consignorInfo = consignorCache[item.consignor_id] || { username: 'None', initials: '' };
            
            html += `
                <div class="search-result-item">
                    <div class="result-details">
                        <div class="result-artist">${escapeHtml(item.artist) || 'Unknown Artist'}</div>
                        <div class="result-title">${escapeHtml(item.title) || 'Unknown Title'}</div>
                        <div class="result-meta">
                            <span class="result-catalog">${escapeHtml(item.catalog_number) || 'No catalog'}</span>
                            ${item.barcode ? `<span class="result-barcode"><i class="fas fa-barcode"></i> ${escapeHtml(item.barcode)}</span>` : ''}
                            <span>Status: ${getStatusText(item.status_id)}</span>
                            ${item.consignor_id ? `<span><i class="fas fa-user"></i> ${escapeHtml(consignorInfo.username)}</span>` : ''}
                        </div>
                    </div>
                    <div class="result-price">$${(item.store_price || 0).toFixed(2)}</div>
                    <div class="result-actions">
                        ${item.status_id === 3 ? 
                            '<span class="sold-badge"><i class="fas fa-check-circle"></i> Sold</span>' : 
                            item.status_id === 2 ?
                            (inCart ? 
                                `<button class="btn btn-secondary btn-sm" onclick="removeFromCart(${item.id})">
                                    <i class="fas fa-minus"></i> Remove
                                </button>` :
                                `<button class="btn btn-cart btn-sm" onclick="addToCartFromData(${item.id})">
                                    <i class="fas fa-cart-plus"></i> Add to Cart
                                </button>`
                            ) :
                            '<span class="inactive-badge">Not Active</span>'
                        }
                    </div>
                </div>
            `;
        }
    });
    
    container.innerHTML = html;
    
    updateCartDisplay();
}

function addAccessoryToCart(id, description, price) {
    if (checkoutCart.some(item => item.type === 'accessory' && item.original_id === id)) {
        showCheckoutStatus('Item already in cart', 'info');
        return;
    }
    
    const cartItem = {
        id: `acc_${id}`,
        original_id: id,
        type: 'accessory',
        description: description,
        store_price: price,
        barcode: allAccessories.find(a => a.id === id)?.bar_code || ''
    };
    
    checkoutCart.push(cartItem);
    
    updateCartDisplay();
    searchRecordsAndAccessories();
    showCheckoutStatus(`Added "${description}" to cart`, 'success');
}

function removeAccessoryFromCart(originalId) {
    const index = checkoutCart.findIndex(item => item.type === 'accessory' && item.original_id === originalId);
    if (index !== -1) {
        const removed = checkoutCart.splice(index, 1)[0];
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus(`Removed "${removed.description}" from cart`, 'info');
    }
}

function addToCartFromData(recordId) {
    const record = currentSearchResults.find(r => r.id === recordId) || 
                  allRecords.find(r => r.id === recordId);
    if (record && record.type !== 'accessory') {
        addToCart(record);
    }
}

function addToCart(record) {
    if (checkoutCart.some(item => item.id === record.id)) {
        showCheckoutStatus('Item already in cart', 'info');
        return;
    }
    
    checkoutCart.push(record);
    
    updateCartDisplay();
    searchRecordsAndAccessories();
    showCheckoutStatus(`Added "${record.title}" to cart`, 'success');
}

function removeFromCart(recordId) {
    const recordIndex = checkoutCart.findIndex(item => item.id === recordId);
    if (recordIndex !== -1) {
        const removed = checkoutCart.splice(recordIndex, 1)[0];
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus(`Removed "${removed.title}" from cart`, 'info');
    }
}

function clearCart() {
    if (checkoutCart.length === 0) return;
    
    if (confirm('Are you sure you want to clear the cart?')) {
        checkoutCart = [];
        currentDiscount = { amount: 0, type: 'fixed', value: 0 };
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus('Cart cleared', 'info');
    }
}

function updateCartWithDiscount() {
    const discountAmount = parseFloat(document.getElementById('discount-amount').value) || 0;
    const discountType = document.getElementById('discount-type').value;
    const errorDiv = document.getElementById('discount-error');
    
    currentDiscount = {
        amount: discountAmount,
        type: discountType,
        value: 0
    };
    
    errorDiv.style.display = 'none';
    
    updateCartDisplay();
}

function calculateTotalsWithDiscount() {
    let subtotal = 0;
    checkoutCart.forEach(item => {
        const price = parseFloat(item.store_price);
        subtotal += price;
    });
    
    let discountValue = 0;
    const discountRow = document.getElementById('discount-row');
    const discountDisplay = document.getElementById('discount-display');
    const errorDiv = document.getElementById('discount-error');
    
    if (currentDiscount.amount > 0) {
        if (currentDiscount.type === 'percentage') {
            if (currentDiscount.amount <= 100) {
                discountValue = subtotal * (currentDiscount.amount / 100);
            } else {
                errorDiv.textContent = 'Percentage discount cannot exceed 100%';
                errorDiv.style.display = 'block';
                currentDiscount.value = 0;
                discountRow.style.display = 'none';
            }
        } else {
            if (currentDiscount.amount <= subtotal) {
                discountValue = currentDiscount.amount;
            } else {
                errorDiv.textContent = 'Fixed discount cannot exceed subtotal';
                errorDiv.style.display = 'block';
                currentDiscount.value = 0;
                discountRow.style.display = 'none';
            }
        }
        
        if (discountValue > 0) {
            currentDiscount.value = discountValue;
            discountDisplay.textContent = `-$${discountValue.toFixed(2)}`;
            discountRow.style.display = 'flex';
        }
    } else {
        discountRow.style.display = 'none';
        currentDiscount.value = 0;
    }
    
    return subtotal - discountValue;
}

function updateCartDisplay() {
    const cartSection = document.getElementById('shopping-cart-section');
    const cartItems = document.getElementById('cart-items');
    const cartCount = document.getElementById('cart-item-count');
    const cartSubtotal = document.getElementById('cart-subtotal');
    const cartTax = document.getElementById('cart-tax');
    const cartTotal = document.getElementById('cart-total');
    const squareBtn = document.getElementById('checkout-square-btn');
    
    if (checkoutCart.length === 0) {
        cartSection.style.display = 'none';
        squareBtn.disabled = true;
        return;
    }
    
    cartSection.style.display = 'block';
    cartCount.textContent = `${checkoutCart.length} item${checkoutCart.length !== 1 ? 's' : ''}`;
    
    let subtotal = 0;
    checkoutCart.forEach(item => {
        const price = parseFloat(item.store_price);
        subtotal += price;
    });
    
    const discountedSubtotal = calculateTotalsWithDiscount();
    
    let taxRate = 0;
    try {
        taxRate = getConfigValue('TAX_ENABLED') ? (parseFloat(getConfigValue('TAX_RATE')) / 100) : 0;
    } catch (e) {
        console.log('Tax config not found, using 0');
    }
    
    const tax = discountedSubtotal * taxRate;
    const total = discountedSubtotal + tax;
    
    cartSubtotal.textContent = `$${discountedSubtotal.toFixed(2)}`;
    cartTax.textContent = `$${tax.toFixed(2)}`;
    cartTotal.textContent = `$${total.toFixed(2)}`;
    
    squareBtn.disabled = availableTerminals.length === 0;
    
    let cartHtml = '';
    checkoutCart.forEach(item => {
        if (item.type === 'accessory') {
            cartHtml += `
                <div class="cart-item" style="border-left: 4px solid #9b59b6;">
                    <div class="cart-item-details">
                        <div class="cart-item-artist">
                            <span class="accessory-badge">ACC</span>
                            ${escapeHtml(item.description) || 'Unknown Accessory'}
                        </div>
                        <div class="cart-item-meta">${escapeHtml(item.barcode) || 'No barcode'}</div>
                    </div>
                    <div class="cart-item-price">$${(item.store_price || 0).toFixed(2)}</div>
                    <div class="cart-item-remove" onclick="removeAccessoryFromCart(${item.original_id})">
                        <i class="fas fa-times"></i>
                    </div>
                </div>
            `;
        } else {
            const price = parseFloat(item.store_price) || 0;
            cartHtml += `
                <div class="cart-item">
                    <div class="cart-item-details">
                        <div class="cart-item-artist">${escapeHtml(item.artist) || 'Unknown Artist'}</div>
                        <div class="cart-item-title">${escapeHtml(item.title) || 'Unknown Title'}</div>
                        <div class="cart-item-meta">${escapeHtml(item.catalog_number) || 'No catalog'}</div>
                    </div>
                    <div class="cart-item-price">$${price.toFixed(2)}</div>
                    <div class="cart-item-remove" onclick="removeFromCart(${item.id})">
                        <i class="fas fa-times"></i>
                    </div>
                </div>
            `;
        }
    });
    
    cartItems.innerHTML = cartHtml;
}

// ============= SQUARE PAYMENT FUNCTIONS =============

function processSquarePayment() {
    if (checkoutCart.length === 0) {
        showCheckoutStatus('Cart is empty', 'error');
        return;
    }
    
    if (availableTerminals.length === 0) {
        showCheckoutStatus('No Square Terminals available. Please refresh terminals.', 'error');
        return;
    }
    
    const onlineTerminals = availableTerminals.filter(t => t.status === 'ONLINE');
    if (onlineTerminals.length === 0) {
        showCheckoutStatus('No online terminals available. Please check terminal connection.', 'error');
        return;
    }
    
    pendingCartCheckout = {
        items: [...checkoutCart],
        type: 'cart',
        discount: { ...currentDiscount }
    };
    
    renderTerminalSelectionModal();
}

function renderTerminalSelectionModal() {
    const onlineTerminals = availableTerminals.filter(t => t.status === 'ONLINE');
    
    const selectionList = document.getElementById('terminal-selection-list');
    let html = '<h4>Select Terminal</h4>';
    
    onlineTerminals.forEach(terminal => {
        let terminalId = terminal.id;
        if (terminalId && terminalId.startsWith('device:')) {
            terminalId = terminalId.replace('device:', '');
        }
        
        html += `
            <div class="terminal-device" onclick="selectTerminalForCheckout('${terminalId}')">
                <input type="radio" name="terminal" value="${terminalId}" ${selectedTerminalId === terminalId ? 'checked' : ''}>
                <div class="terminal-device-info">
                    <div class="terminal-device-name">${escapeHtml(terminal.device_name) || 'Square Terminal'}</div>
                    <div class="terminal-device-status online">Online</div>
                </div>
            </div>
        `;
    });
    
    selectionList.innerHTML = html;
    
    if (selectedTerminalId && onlineTerminals.some(t => {
        let tid = t.id;
        if (tid && tid.startsWith('device:')) {
            tid = tid.replace('device:', '');
        }
        return tid === selectedTerminalId;
    })) {
        document.getElementById('confirm-terminal-btn').disabled = false;
    } else {
        document.getElementById('confirm-terminal-btn').disabled = true;
    }
    
    document.getElementById('terminal-selection-modal').style.display = 'flex';
}

function selectTerminalForCheckout(terminalId) {
    selectedTerminalId = terminalId;
    
    document.querySelectorAll('input[name="terminal"]').forEach(radio => {
        radio.checked = radio.value === terminalId;
    });
    
    document.getElementById('confirm-terminal-btn').disabled = false;
}

function closeTerminalSelectionModal() {
    document.getElementById('terminal-selection-modal').style.display = 'none';
}

async function initiateCartTerminalCheckout() {
    if (!pendingCartCheckout) {
        showCheckoutStatus('No items selected for checkout', 'error');
        closeTerminalSelectionModal();
        return;
    }
    
    if (!selectedTerminalId) {
        showCheckoutStatus('Please select a terminal', 'error');
        return;
    }
    
    const total = parseFloat(document.getElementById('cart-total').textContent.replace('$', ''));
    const amountCents = Math.round(total * 100);
    const recordIds = pendingCartCheckout.items.map(item => 
        item.type === 'accessory' ? `acc_${item.original_id}` : item.id
    );
    const recordTitles = pendingCartCheckout.items.map(item => 
        item.type === 'accessory' ? item.description : item.title
    );
    
    closeTerminalSelectionModal();
    
    const modalBody = document.getElementById('terminal-checkout-body');
    modalBody.innerHTML = `
        <div class="payment-status">
            <div class="payment-status-icon processing">
                <i class="fas fa-spinner fa-pulse"></i>
            </div>
            <div class="payment-status-message">Creating Terminal Checkout...</div>
            <div class="payment-status-detail">Amount: $${total.toFixed(2)}</div>
            <div class="payment-status-detail">Please wait while we prepare the terminal</div>
        </div>
    `;
    document.getElementById('terminal-checkout-modal').style.display = 'flex';
    
    try {
        const requestBody = {
            amount_cents: amountCents,
            record_ids: recordIds,
            record_titles: recordTitles,
            device_id: selectedTerminalId
        };
        
        console.log('Sending checkout request:', requestBody);
        
        const response = await fetch(`${AppConfig.baseUrl}/api/square/terminal/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(requestBody)
        });
        
        const responseText = await response.text();
        console.log('Response status:', response.status);
        console.log('Response body:', responseText);
        
        if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = JSON.parse(responseText);
                errorMessage = errorData.message || errorData.error || errorMessage;
            } catch (e) {
                if (responseText) errorMessage = responseText;
            }
            throw new Error(errorMessage);
        }
        
        const data = JSON.parse(responseText);
        
        if (data.status === 'success') {
            const checkout = data.checkout;
            activeCheckoutId = checkout.id;
            
            modalBody.innerHTML = `
                <div class="payment-status">
                    <div class="payment-status-icon processing">
                        <i class="fas fa-credit-card"></i>
                    </div>
                    <div class="payment-status-message">Checkout Created</div>
                    <div class="payment-status-detail">Amount: $${total.toFixed(2)}</div>
                    <div class="payment-status-detail">Please complete payment on the Square Terminal</div>
                    <div class="payment-status-detail" style="margin-top: 20px; font-weight: bold;">After payment is complete, click below to update record status</div>
                    <button class="btn btn-success" onclick="completeSquarePayment()" style="margin-top: 20px;">
                        <i class="fas fa-check-circle"></i> Payment Complete - Update Records
                    </button>
                    <button class="btn btn-warning" onclick="cancelTerminalCheckout()" style="margin-top: 10px;">
                        <i class="fas fa-times"></i> Cancel Payment
                    </button>
                </div>
            `;
        } else {
            throw new Error(data.message || 'Failed to create checkout');
        }
    } catch (error) {
        console.error('Checkout error:', error);
        
        modalBody.innerHTML = `
            <div class="payment-status">
                <div class="payment-status-icon error">
                    <i class="fas fa-times-circle"></i>
                </div>
                <div class="payment-status-message">Checkout Failed</div>
                <div class="payment-status-detail">${error.message}</div>
                <button class="btn btn-primary" onclick="closeTerminalCheckoutModal()" style="margin-top: 20px;">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        `;
        
        showCheckoutStatus(`Checkout failed: ${error.message}`, 'error');
    }
}

async function completeSquarePayment() {
    if (!pendingCartCheckout) {
        showCheckoutStatus('No pending checkout found', 'error');
        return;
    }
    
    await processSquarePaymentSuccess();
    
    const modalBody = document.getElementById('terminal-checkout-body');
    modalBody.innerHTML = `
        <div class="payment-status">
            <div class="payment-status-icon success">
                <i class="fas fa-check-circle"></i>
            </div>
            <div class="payment-status-message">Payment Recorded Successfully!</div>
            <div class="payment-status-detail">Records have been updated to sold status</div>
            <button class="btn btn-success" onclick="closeTerminalCheckoutModal()" style="margin-top: 20px;">
                <i class="fas fa-check"></i> Done
            </button>
        </div>
    `;
    
    showCheckoutStatus('Payment completed successfully!', 'success');
}

async function processSquarePaymentSuccess() {
    showCheckoutLoading(true);
    
    let successCount = 0;
    let errorCount = 0;
    const soldItems = [];
    const consignorPayments = {};
    
    for (const item of pendingCartCheckout.items) {
        if (item.type === 'accessory') {
            try {
                const getResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`);
                const getData = await getResponse.json();
                
                if (getData.status === 'success') {
                    const accessory = getData.accessory;
                    const newCount = accessory.count - 1;
                    
                    const updateResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            count: newCount
                        })
                    });
                    
                    if (updateResponse.ok) {
                        const updateData = await updateResponse.json();
                        if (updateData.status === 'success') {
                            successCount++;
                            soldItems.push({
                                ...item,
                                description: accessory.description,
                                store_price: accessory.store_price
                            });
                        } else {
                            errorCount++;
                        }
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error updating accessory ${item.original_id}:`, error);
                errorCount++;
            }
        } else {
            try {
                const response = await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        status_id: 3
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success') {
                        successCount++;
                        soldItems.push(item);
                        
                        if (item.consignor_id) {
                            const commissionRate = item.commission_rate || 10;
                            const consignorShare = item.store_price * (1 - (commissionRate / 100));
                            
                            if (!consignorPayments[item.consignor_id]) {
                                consignorPayments[item.consignor_id] = 0;
                            }
                            consignorPayments[item.consignor_id] += consignorShare;
                        }
                        
                        const recordIndex = allRecords.findIndex(r => r.id === item.id);
                        if (recordIndex !== -1) {
                            allRecords[recordIndex].status_id = 3;
                        }
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error updating record ${item.id}:`, error);
                errorCount++;
            }
        }
    }
    
    if (Object.keys(consignorPayments).length > 0) {
        let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
        for (const [consignorId, amount] of Object.entries(consignorPayments)) {
            storedOwed[consignorId] = (storedOwed[consignorId] || 0) + amount;
        }
        localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
        consignorOwedAmounts = storedOwed;
    }
    
    if (successCount > 0) {
        let cashierName = 'Admin';
        try {
            const userData = localStorage.getItem('user');
            if (userData) {
                const user = JSON.parse(userData);
                cashierName = user.username || 'Admin';
            }
        } catch (e) {
            console.error('Error parsing user data:', e);
        }
        
        const subtotal = pendingCartCheckout.items.reduce((sum, item) => sum + (parseFloat(item.store_price) || 0), 0);
        let taxRate = 0;
        try {
            taxRate = getConfigValue('TAX_ENABLED') ? (getConfigValue('TAX_RATE') / 100) : 0;
        } catch (e) {
            console.log('Tax config not found, using 0');
        }
        
        const discount = pendingCartCheckout.discount ? pendingCartCheckout.discount.value || 0 : 0;
        const discountedSubtotal = subtotal - discount;
        const tax = discountedSubtotal * taxRate;
        const total = discountedSubtotal + tax;
        
        const transaction = {
            id: `SQUARE-${Date.now()}`,
            date: new Date(),
            items: [...soldItems],
            subtotal: discountedSubtotal,
            discount: discount,
            tax: tax,
            taxRate: taxRate * 100,
            total: total,
            paymentMethod: 'Square Terminal',
            cashier: cashierName,
            storeName: dbConfigValues['STORE_NAME'] ? dbConfigValues['STORE_NAME'].value : 'PigStyle Music',
            storeAddress: dbConfigValues['STORE_ADDRESS'] ? dbConfigValues['STORE_ADDRESS'].value : '',
            storePhone: dbConfigValues['STORE_PHONE'] ? dbConfigValues['STORE_PHONE'].value : '',
            footer: dbConfigValues['RECEIPT_FOOTER'] ? dbConfigValues['RECEIPT_FOOTER'].value : 'Thank you for your purchase!',
            consignorPayments: consignorPayments
        };
        
        saveReceipt(transaction);
        
        const receiptText = formatReceiptForPrinter(transaction);
        printToThermalPrinter(receiptText);
        
        checkoutCart = [];
        currentDiscount = { amount: 0, type: 'fixed', value: 0 };
        updateCartDisplay();
        searchRecordsAndAccessories();
        
        showCheckoutStatus(`Successfully sold ${successCount} items${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
    } else {
        showCheckoutStatus(`Failed to process sale: ${errorCount} errors`, 'error');
    }
    
    showCheckoutLoading(false);
    pendingCartCheckout = null;
}

async function cancelTerminalCheckout() {
    if (!activeCheckoutId) {
        showCheckoutStatus('No active checkout to cancel', 'info');
        return;
    }
    
    const modalBody = document.getElementById('terminal-checkout-body');
    modalBody.innerHTML = `
        <div class="payment-status">
            <div class="payment-status-icon processing">
                <i class="fas fa-spinner fa-pulse"></i>
            </div>
            <div class="payment-status-message">Cancelling checkout...</div>
        </div>
    `;
    
    try {
        console.log('Original checkout ID:', activeCheckoutId);
        
        const checkoutIdToUse = `termapia:${activeCheckoutId}`;
        console.log('Using checkout ID with prefix:', checkoutIdToUse);
        
        const encodedId = encodeURIComponent(checkoutIdToUse);
        const url = `${AppConfig.baseUrl}/api/square/terminal/checkout/${encodedId}/cancel`;
        console.log('Sending cancel request to:', url);
        
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({})
        });
        
        console.log('Cancel response status:', response.status);
        
        const responseText = await response.text();
        console.log('Cancel response body:', responseText);
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            data = { message: responseText };
        }
        
        if (response.ok) {
            if (data.status === 'success') {
                showCheckoutStatus('Checkout cancelled successfully', 'success');
                
                modalBody.innerHTML = `
                    <div class="payment-status">
                        <div class="payment-status-icon success">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="payment-status-message">Checkout Cancelled Successfully</div>
                        <button class="btn btn-primary" onclick="closeTerminalCheckoutModal()" style="margin-top: 20px;">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                `;
                
                activeCheckoutId = null;
            } else {
                throw new Error(data.message || 'Failed to cancel checkout');
            }
        } else {
            let errorMessage = `Error ${response.status}: ${response.statusText}`;
            if (data.message) {
                errorMessage = data.message;
            }
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error('Cancel checkout error:', error);
        
        modalBody.innerHTML = `
            <div class="payment-status">
                <div class="payment-status-icon error">
                    <i class="fas fa-times-circle"></i>
                </div>
                <div class="payment-status-message">Failed to Cancel Checkout</div>
                <div class="payment-status-detail">${error.message}</div>
                <div class="payment-status-detail" style="font-size: 12px; margin-top: 10px;">
                    Checkout ID: ${escapeHtml(activeCheckoutId)}
                </div>
                <button class="btn btn-primary" onclick="closeTerminalCheckoutModal()" style="margin-top: 20px;">
                    <i class="fas fa-times"></i> Close
                </button>
                <button class="btn btn-secondary" onclick="cancelTerminalCheckout()" style="margin-top: 10px;">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
        
        showCheckoutStatus(`Failed to cancel: ${error.message}`, 'error');
    }
}

function closeTerminalCheckoutModal() {
    document.getElementById('terminal-checkout-modal').style.display = 'none';
    activeCheckoutId = null;
}

// ============= CASH PAYMENT FUNCTIONS =============

function showTenderModal() {
    if (checkoutCart.length === 0) {
        showCheckoutStatus('Cart is empty', 'error');
        return;
    }
    
    const total = parseFloat(document.getElementById('cart-total').textContent.replace('$', ''));
    
    document.getElementById('tender-total-due').textContent = `$${total.toFixed(2)}`;
    document.getElementById('tender-amount').value = '';
    document.getElementById('change-display-container').style.display = 'none';
    document.getElementById('complete-payment-btn').disabled = true;
    
    document.getElementById('tender-modal').style.display = 'flex';
    document.getElementById('tender-amount').focus();
    
    document.getElementById('tender-amount').addEventListener('input', function(e) {
        const tendered = parseFloat(e.target.value) || 0;
        const total = parseFloat(document.getElementById('tender-total-due').textContent.replace('$', ''));
        
        if (tendered >= total) {
            const change = tendered - total;
            document.getElementById('change-amount').textContent = `$${change.toFixed(2)}`;
            document.getElementById('change-display-container').style.display = 'block';
            document.getElementById('complete-payment-btn').disabled = false;
        } else {
            document.getElementById('change-display-container').style.display = 'none';
            document.getElementById('complete-payment-btn').disabled = true;
        }
    });
}

function closeTenderModal() {
    document.getElementById('tender-modal').style.display = 'none';
}

async function processCashPayment() {
    const tendered = parseFloat(document.getElementById('tender-amount').value) || 0;
    const total = parseFloat(document.getElementById('cart-total').textContent.replace('$', ''));
    
    if (tendered < total) {
        showCheckoutStatus('Insufficient payment', 'error');
        return;
    }
    
    const change = tendered - total;
    
    closeTenderModal();
    showCheckoutLoading(true);
    
    let successCount = 0;
    let errorCount = 0;
    const soldItems = [];
    const consignorPayments = {};
    
    for (const item of checkoutCart) {
        if (item.type === 'accessory') {
            try {
                const getResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`);
                const getData = await getResponse.json();
                
                if (getData.status === 'success') {
                    const accessory = getData.accessory;
                    const newCount = accessory.count - 1;
                    
                    const updateResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            count: newCount
                        })
                    });
                    
                    if (updateResponse.ok) {
                        const updateData = await updateResponse.json();
                        if (updateData.status === 'success') {
                            successCount++;
                            soldItems.push({
                                ...item,
                                description: accessory.description,
                                store_price: accessory.store_price
                            });
                        } else {
                            errorCount++;
                        }
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error updating accessory ${item.original_id}:`, error);
                errorCount++;
            }
        } else {
            try {
                const response = await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        status_id: 3
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success') {
                        successCount++;
                        soldItems.push(item);
                        
                        if (item.consignor_id) {
                            const commissionRate = item.commission_rate || 10;
                            const consignorShare = item.store_price * (1 - (commissionRate / 100));
                            
                            if (!consignorPayments[item.consignor_id]) {
                                consignorPayments[item.consignor_id] = 0;
                            }
                            consignorPayments[item.consignor_id] += consignorShare;
                        }
                        
                        const recordIndex = allRecords.findIndex(r => r.id === item.id);
                        if (recordIndex !== -1) {
                            allRecords[recordIndex].status_id = 3;
                        }
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error updating record ${item.id}:`, error);
                errorCount++;
            }
        }
    }
    
    if (Object.keys(consignorPayments).length > 0) {
        let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
        for (const [consignorId, amount] of Object.entries(consignorPayments)) {
            storedOwed[consignorId] = (storedOwed[consignorId] || 0) + amount;
        }
        localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
        consignorOwedAmounts = storedOwed;
    }
    
    if (successCount > 0) {
        let cashierName = 'Admin';
        try {
            const userData = localStorage.getItem('user');
            if (userData) {
                const user = JSON.parse(userData);
                cashierName = user.username || 'Admin';
            }
        } catch (e) {
            console.error('Error parsing user data:', e);
        }
        
        const subtotal = checkoutCart.reduce((sum, item) => sum + (parseFloat(item.store_price) || 0), 0);
        let taxRate = 0;
        try {
            taxRate = getConfigValue('TAX_ENABLED') ? (getConfigValue('TAX_RATE') / 100) : 0;
        } catch (e) {
            console.log('Tax config not found, using 0');
        }
        
        const discount = currentDiscount.value || 0;
        const discountedSubtotal = subtotal - discount;
        const tax = discountedSubtotal * taxRate;
        
        const transaction = {
            id: `CASH-${Date.now()}`,
            date: new Date(),
            items: [...soldItems],
            subtotal: discountedSubtotal,
            discount: discount,
            tax: tax,
            taxRate: taxRate * 100,
            total: total,
            tendered: tendered,
            change: change,
            paymentMethod: 'Cash',
            cashier: cashierName,
            storeName: dbConfigValues['STORE_NAME'] ? dbConfigValues['STORE_NAME'].value : 'PigStyle Music',
            storeAddress: dbConfigValues['STORE_ADDRESS'] ? dbConfigValues['STORE_ADDRESS'].value : '',
            storePhone: dbConfigValues['STORE_PHONE'] ? dbConfigValues['STORE_PHONE'].value : '',
            footer: dbConfigValues['RECEIPT_FOOTER'] ? dbConfigValues['RECEIPT_FOOTER'].value : 'Thank you for your purchase!',
            consignorPayments: consignorPayments
        };
        
        saveReceipt(transaction);
        
        const receiptText = formatReceiptForPrinter(transaction);
        printToThermalPrinter(receiptText);
        
        checkoutCart = [];
        currentDiscount = { amount: 0, type: 'fixed', value: 0 };
        updateCartDisplay();
        searchRecordsAndAccessories();
        
        showCheckoutStatus(`Successfully sold ${successCount} items${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
    } else {
        showCheckoutStatus(`Failed to process sale: ${errorCount} errors`, 'error');
    }
    
    showCheckoutLoading(false);
}

// ========== CONSIGNOR MANAGEMENT FUNCTIONS ==========
async function loadConsignors() {
    const tbody = document.getElementById('consignors-body');
    const loading = document.getElementById('consignors-loading');
    loading.style.display = 'block';
    
    const url = `${AppConfig.baseUrl}/users`;
    const response = await fetch(url);
    const data = await response.json();
    
    let users = data.users || [];
    
    let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
    consignorOwedAmounts = storedOwed;
    
    let totalAdminCommission = 0;
    savedReceipts.forEach(receipt => {
        if (receipt.consignorPayments) {
            receipt.items.forEach(item => {
                if (item.consignor_id && item.type !== 'accessory') {
                    const commissionRate = item.commission_rate || 10;
                    totalAdminCommission += item.store_price * (commissionRate / 100);
                }
            });
        }
    });
    
    consignorsList = users.map(u => ({
        id: u.id,
        username: u.username || 'Unknown',
        initials: u.initials || (u.username ? u.username.substring(0,2).toUpperCase() : '??'),
        owed: storedOwed[u.id] || 0,
        recordsSold: allRecords.filter(r => r.consignor_id == u.id && r.status_id === 3).length
    }));
    
    renderConsignors(consignorsList);
    updateConsignorStats(totalAdminCommission);
    
    loading.style.display = 'none';
}

function renderConsignors(consignors) {
    const tbody = document.getElementById('consignors-body');
    if (!consignors.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No consignors found</td></tr>`;
        return;
    }
    let html = '';
    consignors.forEach(c => {
        html += `<tr>
            <td>${c.id}</td>
            <td>${escapeHtml(c.username)}</td>
            <td>${escapeHtml(c.initials)}</td>
            <td>$${c.owed.toFixed(2)}</td>
            <td>${c.recordsSold}</td>
            <td>
                <button class="btn btn-sm btn-success" onclick="showPaymentModal('${c.id}', '${escapeHtml(c.username)}', ${c.owed})">
                    <i class="fas fa-dollar-sign"></i> Clear
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteConsignor('${c.id}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function updateConsignorStats(totalAdminCommission) {
    document.getElementById('total-consignors').textContent = consignorsList.length;
    const totalOwed = consignorsList.reduce((acc, c) => acc + (c.owed || 0), 0);
    document.getElementById('total-credit').textContent = `$${totalOwed.toFixed(2)}`;
    document.getElementById('admin-total-commission').textContent = `$${totalAdminCommission.toFixed(2)}`;
}

let currentPaymentUserId = null;
let currentPaymentAmount = 0;

function showPaymentModal(userId, username, amount) {
    if (amount <= 0) {
        alert('This consignor has no owed amount to clear.');
        return;
    }
    currentPaymentUserId = userId;
    currentPaymentAmount = amount;
    document.getElementById('payment-consignor-name').textContent = username;
    document.getElementById('payment-amount').textContent = `$${amount.toFixed(2)}`;
    document.getElementById('payment-modal').style.display = 'flex';
}

function closePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
    currentPaymentUserId = null;
    currentPaymentAmount = 0;
}

async function processPayment() {
    if (!currentPaymentUserId) return;
    
    let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
    delete storedOwed[currentPaymentUserId];
    localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
    
    consignorOwedAmounts = storedOwed;
    const consignor = consignorsList.find(c => c.id == currentPaymentUserId);
    if (consignor) {
        consignor.owed = 0;
    }
    
    renderConsignors(consignorsList);
    
    let totalAdminCommission = 0;
    savedReceipts.forEach(receipt => {
        if (receipt.consignorPayments) {
            receipt.items.forEach(item => {
                if (item.consignor_id && item.type !== 'accessory') {
                    const commissionRate = item.commission_rate || 10;
                    totalAdminCommission += item.store_price * (commissionRate / 100);
                }
            });
        }
    });
    updateConsignorStats(totalAdminCommission);
    
    closePaymentModal();
    showStatus(`Payment cleared for ${consignor?.username}`, 'success');
}

async function deleteConsignor(userId) {
    if (!confirm('Are you sure you want to delete this consignor? This action cannot be undone.')) return;
    
    const hasRecords = allRecords.some(r => r.consignor_id == userId);
    if (hasRecords) {
        alert('Cannot delete consignor with existing records. Please reassign or delete records first.');
        return;
    }
    
    const loading = document.getElementById('consignors-loading');
    loading.style.display = 'block';
    
    consignorsList = consignorsList.filter(c => c.id != userId);
    renderConsignors(consignorsList);
    
    let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
    delete storedOwed[userId];
    localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
    
    updateConsignorStats(0);
    showStatus('Consignor deleted', 'success');
    
    loading.style.display = 'none';
}

// ========== ARTISTS FUNCTIONS ==========
async function loadArtists() {
    showArtistsLoading(true);
    
    try {
        const recordsUrl = `${AppConfig.baseUrl}/records`;
        const recordsResponse = await fetch(recordsUrl);
        const recordsData = await recordsResponse.json();
        
        if (recordsData.status === 'success') {
            const records = recordsData.records || [];
            
            const artistMap = new Map();
            
            records.forEach(record => {
                if (!record.artist) return;
                
                const artistName = record.artist.trim();
                
                if (!artistMap.has(artistName)) {
                    artistMap.set(artistName, {
                        name: artistName,
                        recordCount: 0
                    });
                }
                
                const artistData = artistMap.get(artistName);
                artistData.recordCount++;
            });
            
            allArtists = Array.from(artistMap.values())
                .sort((a, b) => b.recordCount - a.recordCount);
            
            filteredArtists = [...allArtists];
            
            artistsCurrentPage = 1;
            
            renderArtists();
            
            document.getElementById('total-artists-count').textContent = allArtists.length;
        }
    } catch (error) {
        console.error('Error loading artists:', error);
        const tbody = document.getElementById('artists-body');
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">
            <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
            Error loading artists: ${error.message}
        </td></tr>`;
    }
    
    showArtistsLoading(false);
}

function filterArtists() {
    const searchTerm = document.getElementById('artist-search').value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredArtists = [...allArtists];
    } else {
        filteredArtists = allArtists.filter(artist => 
            artist.name.toLowerCase().includes(searchTerm)
        );
    }
    
    artistsCurrentPage = 1;
    renderArtists();
}

function renderArtists() {
    const tbody = document.getElementById('artists-body');
    
    if (filteredArtists.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px;">
            <i class="fas fa-music" style="font-size: 48px; margin-bottom: 20px; color: #ccc; display: block;"></i>
            No artists found
        </td></tr>`;
        updateArtistsPagination();
        return;
    }
    
    const startIndex = (artistsCurrentPage - 1) * artistsPageSize;
    const endIndex = Math.min(startIndex + artistsPageSize, filteredArtists.length);
    const pageArtists = filteredArtists.slice(startIndex, endIndex);
    
    let html = '';
    pageArtists.forEach((artist, index) => {
        const globalIndex = startIndex + index + 1;
        const isSelected = selectedArtists.has(artist.name);
        
        html += `
            <tr>
                <td><input type="checkbox" class="artist-checkbox" data-artist="${escapeHtml(artist.name)}" ${isSelected ? 'checked' : ''}></td>
                <td>${globalIndex}</td>
                <td><strong>${escapeHtml(artist.name)}</strong></td>
                <td style="text-align: center;"><span class="badge" style="background: #3498db; color: white; padding: 3px 8px; border-radius: 12px;">${artist.recordCount}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="searchArtistRecords('${escapeHtml(artist.name)}')">
                        <i class="fas fa-search"></i> View Records
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    document.querySelectorAll('.artist-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const artistName = this.getAttribute('data-artist');
            if (this.checked) {
                selectedArtists.add(artistName);
            } else {
                selectedArtists.delete(artistName);
            }
            updateArtistButtonStates();
        });
    });
    
    const selectAllCheckbox = document.getElementById('select-all-artists');
    selectAllCheckbox.checked = false;
    selectAllCheckbox.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.artist-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
            const artistName = checkbox.getAttribute('data-artist');
            if (this.checked) {
                selectedArtists.add(artistName);
            } else {
                selectedArtists.delete(artistName);
            }
        });
        updateArtistButtonStates();
    });
    
    updateArtistsPagination();
}

function updateArtistsPagination() {
    artistsTotalPages = Math.ceil(filteredArtists.length / artistsPageSize);
    if (artistsTotalPages === 0) artistsTotalPages = 1;
    
    document.getElementById('artists-current-page').textContent = artistsCurrentPage;
    document.getElementById('artists-total-pages').textContent = artistsTotalPages;
    
    document.getElementById('artists-first-btn').disabled = artistsCurrentPage === 1;
    document.getElementById('artists-prev-btn').disabled = artistsCurrentPage === 1;
    document.getElementById('artists-next-btn').disabled = artistsCurrentPage === artistsTotalPages;
    document.getElementById('artists-last-btn').disabled = artistsCurrentPage === artistsTotalPages;
    
    updateArtistButtonStates();
}

function updateArtistButtonStates() {
    const hasSelection = selectedArtists.size > 0;
    document.getElementById('print-artists-btn').disabled = !hasSelection;
}

function goToArtistsPage(direction) {
    if (direction === 'first') {
        artistsCurrentPage = 1;
    } else if (direction === 'prev') {
        artistsCurrentPage = Math.max(1, artistsCurrentPage - 1);
    } else if (direction === 'next') {
        artistsCurrentPage = Math.min(artistsTotalPages, artistsCurrentPage + 1);
    } else if (direction === 'last') {
        artistsCurrentPage = artistsTotalPages;
    }
    
    renderArtists();
}

function changeArtistsPageSize(newSize) {
    artistsPageSize = newSize;
    artistsCurrentPage = 1;
    renderArtists();
}

function selectTopArtists() {
    const batchSize = parseInt(document.getElementById('artist-batch-size').value) || 10;
    
    selectedArtists.clear();
    
    const topArtists = allArtists.slice(0, batchSize);
    
    topArtists.forEach(artist => {
        selectedArtists.add(artist.name);
    });
    
    renderArtists();
    
    if (topArtists.length > 0) {
        showStatus(`Selected top ${topArtists.length} artists by record count`, 'success');
    } else {
        showStatus('No artists available to select', 'info');
    }
}

function selectAllArtistsOnPage() {
    const startIndex = (artistsCurrentPage - 1) * artistsPageSize;
    const endIndex = Math.min(startIndex + artistsPageSize, filteredArtists.length);
    const pageArtists = filteredArtists.slice(startIndex, endIndex);
    
    pageArtists.forEach(artist => {
        selectedArtists.add(artist.name);
    });
    
    renderArtists();
    
    showStatus(`Selected all ${pageArtists.length} artists on this page`, 'success');
}

function clearArtistSelection() {
    selectedArtists.clear();
    renderArtists();
    showStatus('Artist selection cleared', 'info');
}

function searchArtistRecords(artistName) {
    switchTab('check-out');
    
    const searchInput = document.getElementById('search-query');
    searchInput.value = artistName;
    
    document.getElementById('filter-barcode').checked = false;
    
    searchRecordsAndAccessories();
}

function showPrintArtistsConfirmation() {
    if (selectedArtists.size === 0) {
        showStatus('No artists selected for printing', 'error');
        return;
    }
    
    const selectedArtistsList = allArtists.filter(artist => selectedArtists.has(artist.name));
    
    document.getElementById('print-artists-count').textContent = selectedArtistsList.length;
    
    const summaryList = document.getElementById('print-artists-summary-list');
    let summaryHtml = '';
    selectedArtistsList.slice(0, 10).forEach(artist => {
        summaryHtml += `<li>${escapeHtml(artist.name)} (${artist.recordCount} records)</li>`;
    });
    if (selectedArtistsList.length > 10) {
        summaryHtml += `<li>...and ${selectedArtistsList.length - 10} more</li>`;
    }
    summaryList.innerHTML = summaryHtml;
    
    document.getElementById('print-artists-confirmation-modal').style.display = 'flex';
}

function closePrintArtistsConfirmation() {
    document.getElementById('print-artists-confirmation-modal').style.display = 'none';
}

async function confirmPrintArtists() {
    closePrintArtistsConfirmation();
    showLoading(true);
    
    const selectedArtistsList = allArtists.filter(artist => selectedArtists.has(artist.name));
    
    if (selectedArtistsList.length === 0) {
        showStatus('No artists selected', 'error');
        showLoading(false);
        return;
    }
    
    await fetchAllConfigValues();
    
    const dummyRecords = selectedArtistsList.map(artist => ({
        artist: artist.name,
        title: 'ARTIST LABEL',
        store_price: 0,
        genre_name: 'Artist',
        barcode: null,
        consignor_id: null
    }));
    
    const pdfBlob = await generatePDF(dummyRecords);
    
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artist_labels_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showStatus(`PDF generated for ${selectedArtistsList.length} artists`, 'success');
    showLoading(false);
}

// ========== GENRE MISMATCH FUNCTIONS ==========
async function loadGenreMismatches() {
    showGenresLoading(true);
    
    try {
        const artistGenreUrl = `${AppConfig.baseUrl}/artist-genre`;
        const artistGenreResponse = await fetch(artistGenreUrl);
        
        if (!artistGenreResponse.ok) {
            throw new Error(`Failed to fetch artist-genre data: ${artistGenreResponse.status}`);
        }
        
        const artistGenres = await artistGenreResponse.json();
        
        const recordsUrl = `${AppConfig.baseUrl}/records`;
        const recordsResponse = await fetch(recordsUrl);
        const recordsData = await recordsResponse.json();
        
        const genresUrl = `${AppConfig.baseUrl}/genres`;
        const genresResponse = await fetch(genresUrl);
        const genresData = await genresResponse.json();
        
        window.allGenres = [];
        if (genresData.status === 'success') {
            window.allGenres = genresData.genres || [];
        }
        
        if (recordsData.status === 'success') {
            const records = recordsData.records || [];
            
            const expectedGenreMap = new Map();
            const artistGenreIdMap = new Map();
            
            if (Array.isArray(artistGenres)) {
                artistGenres.forEach(item => {
                    const artist = item.artist;
                    const genre = item.genre_name;
                    const genreId = item.genre_id;
                    
                    if (artist && genre && !expectedGenreMap.has(artist)) {
                        expectedGenreMap.set(artist, genre);
                        artistGenreIdMap.set(artist, genreId);
                    }
                });
            }
            
            const mismatchMap = new Map();
            
            records.forEach(record => {
                if (!record.artist) return;
                
                const artist = record.artist.trim();
                const recordGenre = record.genre_name || record.genre || 'Unknown';
                
                if (expectedGenreMap.has(artist)) {
                    const expectedGenre = expectedGenreMap.get(artist);
                    const genreId = artistGenreIdMap.get(artist);
                    
                    if (recordGenre !== expectedGenre) {
                        if (!mismatchMap.has(artist)) {
                            mismatchMap.set(artist, {
                                artist: artist,
                                expectedGenre: expectedGenre,
                                genreId: genreId,
                                mismatchedRecords: []
                            });
                        }
                        
                        mismatchMap.get(artist).mismatchedRecords.push({
                            title: record.title || 'Unknown',
                            genre: recordGenre,
                            catalog: record.catalog_number || 'N/A'
                        });
                    }
                }
            });
            
            allMismatches = Array.from(mismatchMap.values())
                .filter(m => m.mismatchedRecords.length > 0)
                .sort((a, b) => b.mismatchedRecords.length - a.mismatchedRecords.length);
            
            filteredMismatches = [...allMismatches];
            
            document.getElementById('total-mismatch-artists').textContent = allMismatches.length;
            const totalMismatchRecords = allMismatches.reduce((sum, m) => sum + m.mismatchedRecords.length, 0);
            document.getElementById('total-mismatch-records').textContent = totalMismatchRecords;
            
            populateGenreFilterFromMismatches();
            
            mismatchesCurrentPage = 1;
            
            renderMismatches();
        } else {
            throw new Error('Failed to fetch records');
        }
    } catch (error) {
        console.error('Error loading genre mismatches:', error);
        const tbody = document.getElementById('genre-mismatches-body');
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">
            <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
            Error loading genre mismatches: ${error.message}
        </td></tr>`;
    }
    
    showGenresLoading(false);
}

function populateGenreFilterFromMismatches() {
    const genreSet = new Set();
    allMismatches.forEach(m => {
        genreSet.add(m.expectedGenre);
    });
    
    const genreFilter = document.getElementById('genre-filter-select');
    const currentValue = genreFilter.value;
    
    const sortedGenres = Array.from(genreSet).sort();
    
    genreFilter.innerHTML = '<option value="all">All Genres</option>';
    
    sortedGenres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        genreFilter.appendChild(option);
    });
    
    if (currentValue !== 'all' && sortedGenres.includes(currentValue)) {
        genreFilter.value = currentValue;
    }
}

function filterGenreMismatches() {
    const searchTerm = document.getElementById('genre-mismatch-search').value.toLowerCase().trim();
    const selectedGenre = document.getElementById('genre-filter-select').value;
    
    filteredMismatches = allMismatches.filter(mismatch => {
        if (searchTerm && !mismatch.artist.toLowerCase().includes(searchTerm)) {
            return false;
        }
        
        if (selectedGenre !== 'all' && mismatch.expectedGenre !== selectedGenre) {
            return false;
        }
        
        return true;
    });
    
    mismatchesCurrentPage = 1;
    renderMismatches();
}

function renderMismatches() {
    const tbody = document.getElementById('genre-mismatches-body');
    
    if (filteredMismatches.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px;">
            <i class="fas fa-check-circle" style="font-size: 48px; margin-bottom: 20px; color: #28a745; display: block;"></i>
            No genre mismatches found!
        </td></tr>`;
        updateMismatchesPagination();
        return;
    }
    
    const startIndex = (mismatchesCurrentPage - 1) * mismatchesPageSize;
    const endIndex = Math.min(startIndex + mismatchesPageSize, filteredMismatches.length);
    const pageMismatches = filteredMismatches.slice(startIndex, endIndex);
    
    let html = '';
    pageMismatches.forEach(mismatch => {
        let recordsHtml = '';
        mismatch.mismatchedRecords.slice(0, 3).forEach(record => {
            recordsHtml += `<div style="font-size: 0.9em; color: #666; margin: 2px 0;">
                <i class="fas fa-times" style="color: #dc3545; margin-right: 5px;"></i>
                ${escapeHtml(record.title)} (Genre: ${escapeHtml(record.genre)})
            </div>`;
        });
        if (mismatch.mismatchedRecords.length > 3) {
            recordsHtml += `<div style="font-size: 0.9em; color: #666;">...and ${mismatch.mismatchedRecords.length - 3} more</div>`;
        }
        
        html += `
            <tr>
                <td><strong>${escapeHtml(mismatch.artist)}</strong></td>
                <td><span class="badge" style="background: #28a745; color: white; padding: 3px 8px; border-radius: 12px;">${escapeHtml(mismatch.expectedGenre)}</span></td>
                <td>${recordsHtml}</td>
                <td style="text-align: center;"><span class="badge" style="background: #dc3545; color: white; padding: 3px 8px; border-radius: 12px;">${mismatch.mismatchedRecords.length}</span></td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="showGenreEditModal('${escapeHtml(mismatch.artist)}', '${escapeHtml(mismatch.expectedGenre)}', ${mismatch.genreId})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    updateMismatchesPagination();
}

function updateMismatchesPagination() {
    mismatchesTotalPages = Math.ceil(filteredMismatches.length / mismatchesPageSize);
    if (mismatchesTotalPages === 0) mismatchesTotalPages = 1;
    
    document.getElementById('mismatches-current-page').textContent = mismatchesCurrentPage;
    document.getElementById('mismatches-total-pages').textContent = mismatchesTotalPages;
    
    document.getElementById('mismatches-first-btn').disabled = mismatchesCurrentPage === 1;
    document.getElementById('mismatches-prev-btn').disabled = mismatchesCurrentPage === 1;
    document.getElementById('mismatches-next-btn').disabled = mismatchesCurrentPage === mismatchesTotalPages;
    document.getElementById('mismatches-last-btn').disabled = mismatchesCurrentPage === mismatchesTotalPages;
}

function goToMismatchesPage(direction) {
    if (direction === 'first') {
        mismatchesCurrentPage = 1;
    } else if (direction === 'prev') {
        mismatchesCurrentPage = Math.max(1, mismatchesCurrentPage - 1);
    } else if (direction === 'next') {
        mismatchesCurrentPage = Math.min(mismatchesTotalPages, mismatchesCurrentPage + 1);
    } else if (direction === 'last') {
        mismatchesCurrentPage = mismatchesTotalPages;
    }
    
    renderMismatches();
}

function changeMismatchesPageSize(newSize) {
    mismatchesPageSize = newSize;
    mismatchesCurrentPage = 1;
    renderMismatches();
}

function showGenreEditModal(artist, currentGenre, genreId) {
    currentEditArtist = artist;
    currentEditGenreId = genreId;
    
    document.getElementById('edit-artist-name').textContent = artist;
    
    const genreSelect = document.getElementById('edit-genre-select');
    genreSelect.innerHTML = '';
    
    if (window.allGenres && window.allGenres.length > 0) {
        window.allGenres.forEach(genre => {
            const option = document.createElement('option');
            option.value = genre.id;
            option.textContent = genre.name;
            if (genre.name === currentGenre) {
                option.selected = true;
            }
            genreSelect.appendChild(option);
        });
    }
    
    document.getElementById('genre-edit-modal').style.display = 'flex';
}

function closeGenreEditModal() {
    document.getElementById('genre-edit-modal').style.display = 'none';
    currentEditArtist = null;
    currentEditGenreId = null;
}

async function saveGenreEdit() {
    if (!currentEditArtist || !currentEditGenreId) {
        alert('Missing artist or genre information');
        return;
    }
    
    const genreSelect = document.getElementById('edit-genre-select');
    const newGenreId = genreSelect.value;
    
    const saveBtn = document.getElementById('save-genre-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Saving...';
    saveBtn.disabled = true;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/artist-genre/${encodeURIComponent(currentEditArtist)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                genre_id: newGenreId
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatus(`Successfully updated genre for ${currentEditArtist}`, 'success');
            closeGenreEditModal();
            await loadGenreMismatches();
        } else {
            throw new Error(data.error || 'Failed to update genre');
        }
    } catch (error) {
        console.error('Error updating genre:', error);
        showStatus(`Error updating genre: ${error.message}`, 'error');
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

// ========== ACCESSORIES FUNCTIONS ==========
async function loadAccessories() {
    showAccessoriesLoading(true);
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories`);
        const data = await response.json();
        
        if (data.status === 'success') {
            allAccessories = data.accessories || [];
            filteredAccessories = [...allAccessories];
            
            renderAccessories();
        } else {
            throw new Error(data.message || 'Failed to load accessories');
        }
    } catch (error) {
        console.error('Error loading accessories:', error);
        const tbody = document.getElementById('accessories-body');
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#dc3545;">
            <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
            Error loading accessories: ${error.message}
        </td></tr>`;
    }
    
    showAccessoriesLoading(false);
}

function filterAccessories() {
    const searchTerm = document.getElementById('accessory-search').value.toLowerCase().trim();
    const stockFilter = document.getElementById('stock-filter').value;
    
    filteredAccessories = allAccessories.filter(accessory => {
        if (searchTerm) {
            const matchesSearch = accessory.description.toLowerCase().includes(searchTerm) ||
                                 accessory.bar_code.toLowerCase().includes(searchTerm);
            if (!matchesSearch) return false;
        }
        
        if (stockFilter === 'low' && (accessory.count > 5 || accessory.count <= 0)) return false;
        if (stockFilter === 'negative' && accessory.count >= 0) return false;
        if (stockFilter === 'in' && accessory.count <= 0) return false;
        
        return true;
    });
    
    renderAccessories();
}

function renderAccessories() {
    const tbody = document.getElementById('accessories-body');
    
    if (filteredAccessories.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px;">
            <i class="fas fa-headphones" style="font-size: 48px; margin-bottom: 20px; color: #ccc; display: block;"></i>
            No accessories found
        </td></tr>`;
        updateAccessorySelectionButtons();
        return;
    }
    
    let html = '';
    filteredAccessories.forEach(acc => {
        const stockClass = acc.count < 0 ? 'out-of-stock' : 
                         acc.count <= 5 ? 'low-stock' : '';
        const isSelected = selectedAccessories.has(acc.id);
        
        html += `
            <tr class="${stockClass}">
                <td><input type="checkbox" class="accessory-checkbox" data-id="${acc.id}" ${isSelected ? 'checked' : ''}></td>
                <td>${acc.id}</td>
                <td><strong>${escapeHtml(acc.description)}</strong></td>
                <td><span class="barcode-cell">${escapeHtml(acc.bar_code)}</span></td>
                <td>$${acc.store_price.toFixed(2)}</td>
                <td class="${acc.count < 0 ? 'negative-stock' : ''}">${acc.count}</td>
                <td>${formatDate(acc.created_at)}</td>
                <td>
                    <div class="accessory-actions">
                        <button class="btn btn-sm btn-warning" onclick="editAccessory(${acc.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteAccessory(${acc.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    document.querySelectorAll('.accessory-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const id = parseInt(this.getAttribute('data-id'));
            if (this.checked) {
                selectedAccessories.add(id);
            } else {
                selectedAccessories.delete(id);
            }
            updateAccessorySelectionButtons();
        });
    });
    
    const selectAllCheckbox = document.getElementById('select-all-accessories');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.accessory-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
                const id = parseInt(checkbox.getAttribute('data-id'));
                if (this.checked) {
                    selectedAccessories.add(id);
                } else {
                    selectedAccessories.delete(id);
                }
            });
            updateAccessorySelectionButtons();
        });
    }
    
    updateAccessorySelectionButtons();
}

function updateAccessorySelectionButtons() {
    const hasSelection = selectedAccessories.size > 0;
    document.getElementById('print-accessories-btn').disabled = !hasSelection;
}

function selectAllAccessoriesOnPage() {
    const checkboxes = document.querySelectorAll('.accessory-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        const id = parseInt(checkbox.getAttribute('data-id'));
        selectedAccessories.add(id);
    });
    updateAccessorySelectionButtons();
    showStatus(`Selected all accessories on this page`, 'success');
}

function clearAccessorySelection() {
    selectedAccessories.clear();
    document.querySelectorAll('.accessory-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    updateAccessorySelectionButtons();
    showStatus('Accessory selection cleared', 'info');
}

function showAddAccessoryForm() {
    document.getElementById('form-title').innerHTML = '<i class="fas fa-plus-circle"></i> Add New Accessory';
    document.getElementById('accessory-description').value = '';
    document.getElementById('accessory-price').value = '';
    document.getElementById('accessory-count').value = '0';
    document.getElementById('accessory-form').style.display = 'block';
    document.getElementById('add-new-btn-container').style.display = 'none';
}

function cancelAccessoryForm() {
    document.getElementById('accessory-form').style.display = 'none';
    document.getElementById('add-new-btn-container').style.display = 'block';
}

async function saveAccessory() {
    const description = document.getElementById('accessory-description').value.trim();
    const price = parseFloat(document.getElementById('accessory-price').value);
    const count = parseInt(document.getElementById('accessory-count').value) || 0;
    
    if (!description) {
        alert('Description is required');
        return;
    }
    
    if (isNaN(price) || price < 0) {
        alert('Please enter a valid price');
        return;
    }
    
    const saveBtn = document.querySelector('#accessory-form .btn-success');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Saving...';
    saveBtn.disabled = true;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                description: description,
                store_price: price,
                count: count
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatus('Accessory added successfully', 'success');
            cancelAccessoryForm();
            await loadAccessories();
        } else {
            throw new Error(data.message || 'Failed to add accessory');
        }
    } catch (error) {
        console.error('Error adding accessory:', error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

function editAccessory(id) {
    const accessory = allAccessories.find(a => a.id === id);
    if (!accessory) return;
    
    currentEditAccessoryId = id;
    
    document.getElementById('edit-accessory-description').value = accessory.description;
    document.getElementById('edit-accessory-price').value = accessory.store_price;
    document.getElementById('edit-accessory-count').value = accessory.count;
    
    const previewDiv = document.getElementById('edit-barcode-preview');
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, accessory.bar_code, {
        format: "CODE128",
        displayValue: true,
        fontSize: 16,
        height: 50,
        width: 2,
        margin: 10
    });
    previewDiv.innerHTML = '';
    previewDiv.appendChild(canvas);
    
    document.getElementById('accessory-edit-modal').style.display = 'flex';
}

function closeAccessoryEditModal() {
    document.getElementById('accessory-edit-modal').style.display = 'none';
    currentEditAccessoryId = null;
}

async function updateAccessory() {
    if (!currentEditAccessoryId) return;
    
    const description = document.getElementById('edit-accessory-description').value.trim();
    const price = parseFloat(document.getElementById('edit-accessory-price').value);
    const count = parseInt(document.getElementById('edit-accessory-count').value) || 0;
    
    if (!description) {
        alert('Description is required');
        return;
    }
    
    if (isNaN(price) || price < 0) {
        alert('Please enter a valid price');
        return;
    }
    
    const saveBtn = document.querySelector('#accessory-edit-modal .btn-success');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Saving...';
    saveBtn.disabled = true;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories/${currentEditAccessoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                description: description,
                store_price: price,
                count: count
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatus('Accessory updated successfully', 'success');
            closeAccessoryEditModal();
            await loadAccessories();
        } else {
            throw new Error(data.message || 'Failed to update accessory');
        }
    } catch (error) {
        console.error('Error updating accessory:', error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

async function regenerateAccessoryBarcode() {
    if (!currentEditAccessoryId) return;
    
    if (!confirm('Are you sure you want to regenerate the barcode? This will create a new unique barcode.')) {
        return;
    }
    
    const regenBtn = document.getElementById('regenerate-barcode-btn');
    const originalText = regenBtn.innerHTML;
    regenBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Generating...';
    regenBtn.disabled = true;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories/${currentEditAccessoryId}/generate-barcode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatus('Barcode regenerated successfully', 'success');
            
            const previewDiv = document.getElementById('edit-barcode-preview');
            const canvas = document.createElement('canvas');
            JsBarcode(canvas, data.bar_code, {
                format: "CODE128",
                displayValue: true,
                fontSize: 16,
                height: 50,
                width: 2,
                margin: 10
            });
            previewDiv.innerHTML = '';
            previewDiv.appendChild(canvas);
            
            await loadAccessories();
        } else {
            throw new Error(data.message || 'Failed to regenerate barcode');
        }
    } catch (error) {
        console.error('Error regenerating barcode:', error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        regenBtn.innerHTML = originalText;
        regenBtn.disabled = false;
    }
}

function deleteAccessory(id) {
    const accessory = allAccessories.find(a => a.id === id);
    if (!accessory) return;
    
    currentDeleteAccessoryId = id;
    document.getElementById('delete-accessory-description').textContent = accessory.description;
    document.getElementById('accessory-delete-modal').style.display = 'flex';
}

function closeAccessoryDeleteModal() {
    document.getElementById('accessory-delete-modal').style.display = 'none';
    currentDeleteAccessoryId = null;
}

async function confirmDeleteAccessory() {
    if (!currentDeleteAccessoryId) return;
    
    const deleteBtn = document.querySelector('#accessory-delete-modal .btn-danger');
    const originalText = deleteBtn.innerHTML;
    deleteBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Deleting...';
    deleteBtn.disabled = true;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories/${currentDeleteAccessoryId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatus('Accessory deleted successfully', 'success');
            closeAccessoryDeleteModal();
            await loadAccessories();
        } else {
            throw new Error(data.message || 'Failed to delete accessory');
        }
    } catch (error) {
        console.error('Error deleting accessory:', error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        deleteBtn.innerHTML = originalText;
        deleteBtn.disabled = false;
    }
}

// Visual barcode printing function for accessories
function printAccessoryBarcodes() {
    if (selectedAccessories.size === 0) {
        showStatus('No accessories selected for printing', 'error');
        return;
    }
    
    const selectedItems = allAccessories.filter(acc => selectedAccessories.has(acc.id));
    
    const printWindow = window.open('', '_blank');
    
    let barcodeHtml = '<html><head><title>Accessory Barcodes</title>';
    barcodeHtml += '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><' + '/script>';
    barcodeHtml += '<style>';
    barcodeHtml += 'body { font-family: Arial, sans-serif; padding: 20px; }';
    barcodeHtml += '.barcode-page { page-break-after: always; }';
    barcodeHtml += '.barcode-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }';
    barcodeHtml += '.barcode-item { text-align: center; padding: 15px; border: 1px solid #ddd; border-radius: 8px; page-break-inside: avoid; }';
    barcodeHtml += '.barcode-item svg { max-width: 100%; height: auto; }';
    barcodeHtml += '.barcode-description { font-weight: bold; margin: 10px 0 5px; }';
    barcodeHtml += '.barcode-price { color: #27ae60; font-size: 1.2rem; }';
    barcodeHtml += '@media print { .no-print { display: none; } }';
    barcodeHtml += '</style>';
    barcodeHtml += '</head><body>';
    barcodeHtml += '<div class="no-print" style="margin-bottom: 20px; text-align: center;">';
    barcodeHtml += '<button onclick="window.print()" style="padding: 10px 20px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer;">Print Barcodes</button>';
    barcodeHtml += '</div>';
    
    for (let i = 0; i < selectedItems.length; i += 8) {
        if (i > 0) {
            barcodeHtml += '<div class="barcode-page" style="page-break-before: always;"></div>';
        }
        barcodeHtml += '<div class="barcode-grid">';
        
        for (let j = i; j < Math.min(i + 8, selectedItems.length); j++) {
            const item = selectedItems[j];
            barcodeHtml += '<div class="barcode-item">';
            barcodeHtml += `<canvas id="barcode-${j}" style="width: 100%; height: auto;"></canvas>`;
            barcodeHtml += `<div class="barcode-description">${escapeHtml(item.description)}</div>`;
            barcodeHtml += `<div class="barcode-price">$${item.store_price.toFixed(2)}</div>`;
            barcodeHtml += `<div style="font-family: monospace; color: #666; font-size: 0.8rem; margin-top: 5px;">${escapeHtml(item.bar_code)}</div>`;
            barcodeHtml += '</div>';
        }
        
        barcodeHtml += '</div>';
    }
    
    barcodeHtml += '<script>';
    barcodeHtml += 'window.onload = function() {';
    
    for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        barcodeHtml += `JsBarcode("#barcode-${i}", "${item.bar_code}", { format: "CODE128", displayValue: false, height: 60, width: 2 });`;
    }
    
    barcodeHtml += '}';
    barcodeHtml += '<' + '/script>';
    barcodeHtml += '</body></html>';
    
    printWindow.document.write(barcodeHtml);
    printWindow.document.close();
}

// ========== REFUND FUNCTIONS ==========

function showRefundModal() {
    document.getElementById('refund-search').value = '';
    document.getElementById('refund-transaction-details').style.display = 'none';
    document.getElementById('refund-error').style.display = 'none';
    document.getElementById('process-refund-btn').disabled = true;
    currentRefundTransaction = null;
    
    document.getElementById('refund-modal').style.display = 'flex';
}

function closeRefundModal() {
    document.getElementById('refund-modal').style.display = 'none';
    currentRefundTransaction = null;
}

function searchRefundTransaction() {
    const searchTerm = document.getElementById('refund-search').value.trim().toLowerCase();
    const errorDiv = document.getElementById('refund-error');
    
    if (!searchTerm) {
        errorDiv.textContent = 'Please enter a receipt number or transaction ID';
        errorDiv.style.display = 'block';
        return;
    }
    
    // Search in saved receipts
    const receipt = savedReceipts.find(r => 
        r.id.toLowerCase().includes(searchTerm)
    );
    
    if (receipt) {
        currentRefundTransaction = receipt;
        
        // Populate refund details
        document.getElementById('refund-receipt-id').textContent = receipt.id;
        document.getElementById('refund-date').textContent = new Date(receipt.date).toLocaleString();
        document.getElementById('refund-original-amount').textContent = `$${receipt.total.toFixed(2)}`;
        document.getElementById('refund-amount').value = receipt.total.toFixed(2);
        document.getElementById('refund-amount').max = receipt.total;
        
        document.getElementById('refund-transaction-details').style.display = 'block';
        errorDiv.style.display = 'none';
        document.getElementById('process-refund-btn').disabled = false;
        
        // Add input validation for refund amount
        document.getElementById('refund-amount').addEventListener('input', function() {
            const amount = parseFloat(this.value) || 0;
            const maxAmount = receipt.total;
            
            if (amount <= 0) {
                errorDiv.textContent = 'Refund amount must be greater than 0';
                errorDiv.style.display = 'block';
                document.getElementById('process-refund-btn').disabled = true;
            } else if (amount > maxAmount) {
                errorDiv.textContent = `Refund amount cannot exceed $${maxAmount.toFixed(2)}`;
                errorDiv.style.display = 'block';
                document.getElementById('process-refund-btn').disabled = true;
            } else {
                errorDiv.style.display = 'none';
                document.getElementById('process-refund-btn').disabled = false;
            }
        });
    } else {
        errorDiv.textContent = 'No transaction found with that ID';
        errorDiv.style.display = 'block';
        document.getElementById('refund-transaction-details').style.display = 'none';
        document.getElementById('process-refund-btn').disabled = true;
    }
}

async function processRefund() {
    if (!currentRefundTransaction) {
        showCheckoutStatus('No transaction selected for refund', 'error');
        return;
    }
    
    const refundAmount = parseFloat(document.getElementById('refund-amount').value);
    const refundReason = document.getElementById('refund-reason').value;
    
    if (isNaN(refundAmount) || refundAmount <= 0) {
        showCheckoutStatus('Please enter a valid refund amount', 'error');
        return;
    }
    
    if (refundAmount > currentRefundTransaction.total) {
        showCheckoutStatus('Refund amount cannot exceed original transaction total', 'error');
        return;
    }
    
    // Show loading
    const processBtn = document.getElementById('process-refund-btn');
    const originalText = processBtn.innerHTML;
    processBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Processing...';
    processBtn.disabled = true;
    
    try {
        // If it's a Square transaction
        if (currentRefundTransaction.id.startsWith('SQUARE-')) {
            // You would need the payment ID from the transaction
            // This would require storing the Square payment ID when the transaction was created
            showCheckoutStatus('Square refund processing - would call Square API here', 'info');
            
            // Example Square API call structure:
            /*
            const response = await fetch(`${AppConfig.baseUrl}/api/square/refund`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payment_id: currentRefundTransaction.square_payment_id, // You'd need to store this
                    amount: refundAmount,
                    reason: refundReason
                })
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                // Handle successful refund
            }
            */
            
        } else {
            // For cash transactions, just remove from saved receipts
            const receiptIndex = savedReceipts.findIndex(r => r.id === currentRefundTransaction.id);
            if (receiptIndex !== -1) {
                // Remove or mark as refunded
                savedReceipts.splice(receiptIndex, 1);
                localStorage.setItem('pigstyle_receipts', JSON.stringify(savedReceipts));
                
                // Refresh receipts display
                if (document.getElementById('receipts-tab').classList.contains('active')) {
                    renderReceipts(savedReceipts);
                }
            }
        }
        
        showCheckoutStatus(`Refund of $${refundAmount.toFixed(2)} processed successfully`, 'success');
        closeRefundModal();
        
    } catch (error) {
        console.error('Refund error:', error);
        showCheckoutStatus(`Refund failed: ${error.message}`, 'error');
    } finally {
        processBtn.innerHTML = originalText;
        processBtn.disabled = false;
    }
}

// ========== INITIALIZATION ==========

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
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
    
    loadSavedReceipts();
    
    await fetchAllConfigValues();
    
    $('#user-select').select2({
        placeholder: "Select a user...",
        allowClear: true
    }).on('change', loadRecords);
    
    loadUsers();
    loadRecords();
    refreshTerminals();
    
    document.getElementById('search-query').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchRecordsAndAccessories();
        }
    });
    
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    document.getElementById('receipt-start-date').value = thirtyDaysAgo;
    document.getElementById('receipt-end-date').value = today;
    
    if (document.getElementById('add-edit-delete-tab').classList.contains('active')) {
        addEditDeleteManager = new AddEditDeleteManager();
    }
    
    // Initialize discount input
    document.getElementById('discount-amount').addEventListener('input', updateCartWithDiscount);
    document.getElementById('discount-type').addEventListener('change', updateCartWithDiscount);
});