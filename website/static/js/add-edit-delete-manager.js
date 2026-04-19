// ============================================================================
// add-edit-delete-manager.js - Add/Edit/Delete Tab Functionality
// ============================================================================

// Genre Predictor Class - Only checks artist_genre table
class GenrePredictor {
    constructor() {
        this.artistGenreCache = {};
    }
    
    async predictGenre(artist) {
        console.log(`GENRE_PREDICTION: Predicting for artist="${artist}"`);
        
        if (artist) {
            const artistGenre = await this.getArtistGenre(artist);
            if (artistGenre) {
                console.log(`GENRE_PREDICTION: Found artist "${artist}" in artist_genre table with genre ID ${artistGenre.genre_id} (${artistGenre.genre_name})`);
                return {
                    local_genre_id: artistGenre.genre_id,
                    local_genre_name: artistGenre.genre_name
                };
            } else {
                console.log(`GENRE_PREDICTION: Artist "${artist}" not found in artist_genre table`);
            }
        }
        
        return null;
    }
    
    async getArtistGenre(artist) {
        if (this.artistGenreCache[artist]) {
            console.log(`🔍 CACHE HIT: Artist "${artist}" found in cache:`, this.artistGenreCache[artist]);
            return this.artistGenreCache[artist];
        }
        console.log(`🔍 CACHE MISS: Artist "${artist}" not in cache, making API call...`);
        
        try {
            const response = await APIUtils.get(`/artist-genre/${encodeURIComponent(artist)}`);
            
            if (response && response.artist && response.genre_id) {
                console.log(`✅ API SUCCESS: Artist "${artist}" found with genre ID ${response.genre_id}`);
                this.artistGenreCache[artist] = {
                    artist: response.artist,
                    genre_id: response.genre_id,
                    genre_name: response.genre_name
                };
                return this.artistGenreCache[artist];
            } else if (response && response.status === 'error' && response.error === 'Artist not found') {
                console.log(`❌ API RESPONSE: Artist "${artist}" not found in database`);
                this.artistGenreCache[artist] = null;
                return null;
            } else {
                console.log(`⚠️ UNEXPECTED API RESPONSE FORMAT:`, response);
                this.artistGenreCache[artist] = null;
                return null;
            }
        } catch (error) {
            console.error(`🔥 ERROR fetching artist genre for "${artist}":`, error);
            return null;
        }
    }

    async saveArtistGenre(artist, genreId, genreName) {
        if (!artist || !genreId) return null;
        
        const existing = await this.getArtistGenre(artist);
        if (existing) {
            console.log(`Artist "${artist}" already has genre ID ${existing.genre_id}, not overwriting`);
            return existing;
        }
        
        try {
            const data = {
                artist: artist,
                genre_id: genreId
            };
            
            const response = await APIUtils.post('/artist-genre', data);
            
            if (response.status === 'success') {
                this.artistGenreCache[artist] = {
                    artist: artist,
                    genre_id: genreId,
                    genre_name: genreName
                };
                console.log(`ARTIST_GENRE: Saved artist "${artist}" -> ${genreName}`);
                return response;
            }
        } catch (error) {
            console.error('Error saving artist genre:', error);
        }
        return null;
    }

    async updateArtistGenre(artist, genreId, genreName) {
        if (!artist || !genreId) return null;
        
        try {
            const data = {
                artist: artist,
                genre_id: genreId
            };
            
            const response = await APIUtils.put(`/artist-genre/${encodeURIComponent(artist)}`, data);
            
            if (response.status === 'success') {
                this.artistGenreCache[artist] = {
                    artist: artist,
                    genre_id: genreId,
                    genre_name: genreName
                };
                console.log(`ARTIST_GENRE: Updated artist "${artist}" -> ${genreName}`);
                return response;
            }
        } catch (error) {
            console.error('Error updating artist genre:', error);
        }
        return null;
    }
}

// Barcode Generator Class - Supports multiple formats
class BarcodeGenerator {
    constructor() {
        this.counters = {
            vinyl_33: 3290,
            vinyl_45: 5000,
            vinyl_78: 6000,
            cd: 3290,
            cassette: 3290
        };
        
        this.prefixes = {
            vinyl_33: '22',
            vinyl_45: '55',
            vinyl_78: '66',
            cd: '33',
            cassette: '44'
        };
        
        this.loadCounters();
    }
    
    loadCounters() {
        try {
            const savedCounters = localStorage.getItem('pigstyle_barcode_counters');
            if (savedCounters) {
                const parsed = JSON.parse(savedCounters);
                this.counters = { ...this.counters, ...parsed };
            }
            console.log('BARCODE: Loaded counters:', this.counters);
        } catch (error) {
            console.warn('BARCODE: Could not load counters:', error);
        }
    }
    
    saveCounters() {
        try {
            localStorage.setItem('pigstyle_barcode_counters', JSON.stringify(this.counters));
        } catch (error) {
            console.warn('BARCODE: Could not save counters:', error);
        }
    }
    
    detectFormat(formatString) {
        if (!formatString) return 'vinyl_33';
        
        const formatLower = formatString.toLowerCase();
        
        if (formatLower.includes('78') || formatLower.includes('shellac')) {
            return 'vinyl_78';
        }
        else if (formatLower.includes('45') || formatLower.includes('single') || formatLower.includes('7"') ||
                 (formatLower.includes('7-inch') && !formatLower.includes('33'))) {
            return 'vinyl_45';
        }
        else if (formatLower.includes('33') || formatLower.includes('lp') || formatLower.includes('12"') ||
                 (formatLower.includes('vinyl') && !formatLower.includes('45') && !formatLower.includes('78'))) {
            return 'vinyl_33';
        }
        else if (formatLower.includes('cd') || formatLower === 'compact disc') {
            return 'cd';
        }
        else if (formatLower.includes('cassette') || formatLower.includes('tape')) {
            return 'cassette';
        }
        else {
            return 'vinyl_33';
        }
    }
    
    generateBarcode(format = 'vinyl_33') {
        const normalizedFormat = this.detectFormat(format);
        const prefix = this.prefixes[normalizedFormat];
        const currentCounter = this.counters[normalizedFormat];
        const sequence = currentCounter.toString().padStart(4, '0');
        const barcode = `${prefix}000000${sequence}`;
        
        console.log(`BARCODE_GENERATED: Format=${normalizedFormat}, Barcode=${barcode}, Sequence=${currentCounter}`);
        
        this.counters[normalizedFormat]++;
        this.saveCounters();
        
        return barcode;
    }
    
    validateBarcode(barcode) {
        if (!barcode || typeof barcode !== 'string') {
            return false;
        }
        return /^\d+$/.test(barcode);
    }
    
    getCurrentCounter(format = 'vinyl_33') {
        const normalizedFormat = this.detectFormat(format);
        return this.counters[normalizedFormat];
    }
    
    resetCounter(format = 'vinyl_33', startFrom = 3290) {
        const normalizedFormat = this.detectFormat(format);
        this.counters[normalizedFormat] = startFrom;
        this.saveCounters();
        console.log(`BARCODE: ${normalizedFormat} counter reset to:`, startFrom);
    }
    
    getFormatFromBarcode(barcode) {
        if (!barcode || typeof barcode !== 'string') {
            return 'Unknown';
        }
        
        const prefix = barcode.substring(0, 2);
        
        switch(prefix) {
            case '22': return '33⅓ RPM Vinyl';
            case '55': return '45 RPM Vinyl';
            case '66': return '78 RPM Vinyl';
            case '33': return 'CD';
            case '44': return 'Cassette';
            default: return 'Vinyl';
        }
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
        this.consignors = [];
        this.genrePredictor = new GenrePredictor();
        this.barcodeGenerator = new BarcodeGenerator();
        this.minimumPrice = 1.99;
        this.selectedConsignorId = null;
        this.autoEstimatePrice = true;
        this.activeBatch = null;
        
        this.init();
    }

    async init() {
        await this.loadMinimumPrice();
        await this.loadStats();
        await this.loadGenres();
        await this.loadConditions();
        await this.loadConsignors();
        await this.checkActiveBatch();
        this.loadSavedSettings();
        this.setupEventListeners();
        this.renderGlobalSettings();
        this.renderBatchSection();
    }

    async checkActiveBatch() {
        try {
            const response = await APIUtils.get('/api/batches/current-active');
            
            if (response.status === 'success' && response.has_active) {
                this.activeBatch = response.batch;
                console.log('Active batch found:', this.activeBatch);
            } else {
                this.activeBatch = null;
            }
        } catch (error) {
            console.error('Error checking active batch:', error);
            this.activeBatch = null;
        }
    }

    renderBatchSection() {
        const searchSection = document.querySelector('.search-section');
        if (!searchSection) return;
        
        let batchSection = document.getElementById('batch-section');
        if (batchSection) {
            batchSection.remove();
        }
        
        batchSection = document.createElement('div');
        batchSection.id = 'batch-section';
        batchSection.style.marginTop = '15px';
        batchSection.style.marginBottom = '15px';
        batchSection.style.borderRadius = '8px';
        batchSection.style.overflow = 'hidden';
        batchSection.style.border = '1px solid #dee2e6';
        
        const header = document.createElement('div');
        
        if (this.activeBatch) {
            header.style.cssText = `
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                color: white;
                padding: 12px 15px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-weight: 500;
            `;
            header.innerHTML = `
                <span><i class="fas fa-layer-group"></i> Active Batch #${this.activeBatch.id} - ${this.activeBatch.seller_name}</span>
                <span class="batch-toggle"><i class="fas fa-chevron-down"></i></span>
            `;
        } else {
            header.style.cssText = `
                background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
                color: white;
                padding: 12px 15px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-weight: 500;
            `;
            header.innerHTML = `
                <span><i class="fas fa-layer-group"></i> No Active Batch</span>
                <span class="batch-toggle"><i class="fas fa-chevron-down"></i></span>
            `;
        }
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: #f8f9fa;
            padding: 15px;
            border-top: 1px solid #dee2e6;
            display: none;
        `;
        
        if (this.activeBatch) {
            content.innerHTML = this.renderActiveBatchContent();
        } else {
            content.innerHTML = this.renderNewBatchContent();
        }
        
        batchSection.appendChild(header);
        batchSection.appendChild(content);
        
        header.addEventListener('click', () => {
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
            header.querySelector('.batch-toggle i').className = isVisible ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        });
        
        const radioGroup = searchSection.querySelector('.radio-group');
        if (radioGroup) {
            radioGroup.after(batchSection);
        } else {
            searchSection.appendChild(batchSection);
        }
        
        this.attachBatchEventListeners();
    }

    renderNewBatchContent() {
        return `
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 0 0 10px 0; color: #333;">Start New Batch</h4>
                <p style="margin: 0 0 15px 0; font-size: 13px; color: #666;">
                    Start a batch to track records from a seller. All records added while the batch is active will be associated with this seller.
                </p>
            </div>
            
            <div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-end;">
                <div style="flex: 2; min-width: 250px;">
                    <label for="batch-seller-name" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-user"></i> Seller Name *
                    </label>
                    <input type="text" 
                           id="batch-seller-name" 
                           class="search-input" 
                           placeholder="Enter seller's full name"
                           style="width: 100%;">
                </div>
                
                <div style="flex: 2; min-width: 250px;">
                    <label for="batch-seller-contact" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-phone-alt"></i> Phone or Email *
                    </label>
                    <input type="text" 
                           id="batch-seller-contact" 
                           class="search-input" 
                           placeholder="Enter phone number or email"
                           style="width: 100%;">
                </div>
                
                <div style="flex: 2; min-width: 300px;">
                    <label for="batch-notes" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-sticky-note"></i> Notes (Optional)
                    </label>
                    <input type="text" 
                           id="batch-notes" 
                           class="search-input" 
                           placeholder="Any additional notes about this batch"
                           style="width: 100%;">
                </div>
                
                <div style="flex: 0 0 auto;">
                    <button class="btn btn-success" id="start-batch-btn">
                        <i class="fas fa-play"></i> Start Batch
                    </button>
                </div>
            </div>
            
            <p style="margin-top: 15px; margin-bottom: 0; font-size: 0.85rem; color: #666; border-top: 1px solid #dee2e6; padding-top: 10px;">
                <i class="fas fa-info-circle"></i> 
                After starting a batch, all records you add will be associated with this seller. Remember to complete the batch when you're done adding records.
            </p>
        `;
    }

    renderActiveBatchContent() {
        if (!this.activeBatch) return '';
        
        return `
            <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="margin: 0; color: #333;">Active Batch #${this.activeBatch.id}</h4>
                    <span class="status-badge batch-active">Active</span>
                </div>
                
                <div style="background: white; padding: 12px; border-radius: 4px; margin-bottom: 15px;">
                    <p style="margin: 5px 0;"><strong>Seller:</strong> ${this.escapeHtml(this.activeBatch.seller_name || '')}</p>
                    <p style="margin: 5px 0;"><strong>Contact:</strong> ${this.escapeHtml(this.activeBatch.seller_contact || '')}</p>
                    <p style="margin: 5px 0;"><strong>Started:</strong> ${new Date(this.activeBatch.start_datetime).toLocaleString()}</p>
                    <p style="margin: 5px 0;"><strong>Records in Batch:</strong> ${this.activeBatch.record_count || 0}</p>
                    ${this.activeBatch.notes ? `<p style="margin: 5px 0;"><strong>Notes:</strong> ${this.escapeHtml(this.activeBatch.notes)}</p>` : ''}
                </div>
                
                <div style="background: #e9ecef; padding: 12px; border-radius: 4px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; font-weight: 500;">
                        <span>Total Store Value:</span>
                        <span>$${(this.activeBatch.total_store_value || 0).toFixed(2)}</span>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn btn-success" id="complete-batch-btn">
                        <i class="fas fa-check-circle"></i> Complete Batch
                    </button>
                    <button class="btn btn-warning" id="print-batch-btn">
                        <i class="fas fa-print"></i> Print Bill of Sale
                    </button>
                    <button class="btn btn-danger" id="cancel-batch-btn">
                        <i class="fas fa-times-circle"></i> Cancel Batch
                    </button>
                </div>
            </div>
        `;
    }

    attachBatchEventListeners() {
        const startBtn = document.getElementById('start-batch-btn');
        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                const name = document.getElementById('batch-seller-name').value.trim();
                const contact = document.getElementById('batch-seller-contact').value.trim();
                const notes = document.getElementById('batch-notes').value.trim();
                
                if (!name) {
                    showMessage('Please enter seller name', 'error');
                    return;
                }
                if (!contact) {
                    showMessage('Please enter seller contact (phone or email)', 'error');
                    return;
                }
                
                await this.startBatch(name, contact, notes);
            });
        }
        
        const completeBtn = document.getElementById('complete-batch-btn');
        if (completeBtn) {
            completeBtn.addEventListener('click', async () => {
                await this.completeBatch();
            });
        }
        
        const printBtn = document.getElementById('print-batch-btn');
        if (printBtn) {
            printBtn.addEventListener('click', async () => {
                if (this.activeBatch) {
                    if (window.batchManager) {
                        window.batchManager.printBatch(this.activeBatch.id);
                    }
                }
            });
        }
        
        const cancelBtn = document.getElementById('cancel-batch-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', async () => {
                if (!this.activeBatch) return;
                
                if (!confirm('WARNING: Cancelling this batch will delete ALL records added during this batch. This action CANNOT be undone. Are you sure?')) {
                    return;
                }
                
                try {
                    const response = await APIUtils.post(`/api/batches/${this.activeBatch.id}/cancel`, {
                        delete_records: true
                    });
                    
                    if (response.status === 'success') {
                        showMessage(`Batch cancelled and ${response.deleted_records || 0} records deleted`, 'warning');
                        this.activeBatch = null;
                        this.renderBatchSection();
                    } else {
                        showMessage('Error cancelling batch: ' + (response.error || 'Unknown error'), 'error');
                    }
                } catch (error) {
                    console.error('Error cancelling batch:', error);
                    showMessage('Error cancelling batch: ' + error.message, 'error');
                }
            });
        }
    }

    async startBatch(name, contact, notes) {
        try {
            const response = await APIUtils.post('/api/batches', {
                seller_name: name,
                seller_contact: contact,
                notes: notes
            });
            
            if (response.status === 'success') {
                showMessage(`Batch #${response.batch_id} started successfully!`, 'success');
                await this.checkActiveBatch();
                this.renderBatchSection();
            } else {
                showMessage('Error starting batch: ' + (response.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error starting batch:', error);
            showMessage('Error starting batch: ' + error.message, 'error');
        }
    }

    async completeBatch() {
        if (!this.activeBatch) return;
        
        if (!confirm('Are you sure you want to complete this batch? This will mark it as finished and records will remain in inventory.')) {
            return;
        }
        
        try {
            const response = await APIUtils.post(`/api/batches/${this.activeBatch.id}/complete`, {});
            
            if (response.status === 'success') {
                showMessage('Batch completed successfully!', 'success');
                this.activeBatch = null;
                this.renderBatchSection();
            } else {
                showMessage('Error completing batch: ' + (response.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error completing batch:', error);
            showMessage('Error completing batch: ' + error.message, 'error');
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    async loadConditions() {
        console.log('LOAD_CONDITIONS: Loading conditions from /api/conditions');
        try {
            const response = await APIUtils.get('/api/conditions');
            if (response && response.conditions) {
                this.conditions = response.conditions;
                console.log('LOAD_CONDITIONS: Conditions loaded successfully:', this.conditions);
            } else {
                console.error('LOAD_CONDITIONS: Invalid response format:', response);
                this.conditions = [];
            }
        } catch (error) {
            console.error('Error loading conditions:', error);
            this.conditions = [];
        }
    }

    async loadConsignors() {
        console.log('LOAD_CONSIGNORS: Starting to load consignors from /users endpoint');
        try {
            const response = await APIUtils.get('/users');
            if (response && response.users) {
                this.consignors = response.users
                    .filter(user => user.role === 'consignor')
                    .sort((a, b) => (a.username || '').localeCompare(b.username || ''));
                console.log('LOAD_CONSIGNORS: Consignors loaded successfully:', this.consignors);
            } else {
                console.error('LOAD_CONSIGNORS: Invalid response format:', response);
                this.consignors = [];
            }
        } catch (error) {
            console.error('Error loading consignors:', error);
            this.consignors = [];
        }
    }

    loadSavedSettings() {
        try {
            const savedConsignor = localStorage.getItem('add_record_consignor_id');
            if (savedConsignor) {
                this.selectedConsignorId = parseInt(savedConsignor);
            }
            
            const savedAutoEstimate = localStorage.getItem('add_record_auto_estimate');
            if (savedAutoEstimate !== null) {
                this.autoEstimatePrice = savedAutoEstimate === 'true';
            }
            
            console.log('LOAD_SETTINGS: Loaded consignor ID:', this.selectedConsignorId);
            console.log('LOAD_SETTINGS: Auto estimate price:', this.autoEstimatePrice);
        } catch (error) {
            console.error('Error loading saved settings:', error);
        }
    }

    saveSettings() {
        try {
            if (this.selectedConsignorId) {
                localStorage.setItem('add_record_consignor_id', this.selectedConsignorId.toString());
            } else {
                localStorage.removeItem('add_record_consignor_id');
            }
            
            localStorage.setItem('add_record_auto_estimate', this.autoEstimatePrice.toString());
            
            console.log('SAVE_SETTINGS: Saved consignor ID:', this.selectedConsignorId);
            console.log('SAVE_SETTINGS: Auto estimate price:', this.autoEstimatePrice);
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    renderGlobalSettings() {
        const searchSection = document.querySelector('.search-section');
        if (!searchSection) return;
        
        let globalSettings = document.getElementById('global-add-settings');
        if (globalSettings) {
            globalSettings.remove();
        }
        
        globalSettings = document.createElement('div');
        globalSettings.id = 'global-add-settings';
        globalSettings.style.marginTop = '15px';
        globalSettings.style.marginBottom = '15px';
        globalSettings.style.borderRadius = '8px';
        globalSettings.style.overflow = 'hidden';
        globalSettings.style.border = '1px solid #dee2e6';
        
        const consignorOptions = this.consignors.map(consignor => {
            const selected = consignor.id === this.selectedConsignorId ? 'selected' : '';
            return `<option value="${consignor.id}" ${selected}>${consignor.username}${consignor.flag_color ? ` (${consignor.flag_color})` : ''}</option>`;
        }).join('');
        
        const header = document.createElement('div');
        header.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 15px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 500;
        `;
        header.innerHTML = `
            <span><i class="fas fa-cog"></i> Default Settings for New Records</span>
            <span class="settings-toggle"><i class="fas fa-chevron-down"></i></span>
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: #f8f9fa;
            padding: 15px;
            border-top: 1px solid #dee2e6;
            display: none;
        `;
        content.innerHTML = `
            <div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-end;">
                <div style="flex: 1; min-width: 200px;">
                    <label for="global-consignor-select" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-user"></i> Default Consignor
                    </label>
                    <select id="global-consignor-select" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; color: #333;">
                        <option value="">No default consignor</option>
                        ${consignorOptions}
                    </select>
                </div>
                <div style="flex: 1; min-width: 200px;">
                    <label style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-calculator"></i> Price Estimation
                    </label>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                            <input type="checkbox" id="auto-estimate-checkbox" ${this.autoEstimatePrice ? 'checked' : ''}>
                            <span>Auto-estimate when conditions change</span>
                        </label>
                    </div>
                    <p style="margin-top: 5px; font-size: 0.8rem; color: #666;">
                        <i class="fas fa-info-circle"></i> When disabled, you can still click "Estimate Price" button
                    </p>
                </div>
                <div style="flex: 0 0 auto;">
                    <button class="btn btn-small" id="clear-defaults-btn" style="background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-undo"></i> Clear Defaults
                    </button>
                </div>
            </div>
            <p style="margin-top: 15px; margin-bottom: 0; font-size: 0.85rem; color: #666; border-top: 1px solid #dee2e6; padding-top: 10px;">
                <i class="fas fa-save"></i> These settings will be automatically applied to all new records until you change them
            </p>
        `;
        
        globalSettings.appendChild(header);
        globalSettings.appendChild(content);
        
        header.addEventListener('click', () => {
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
            header.querySelector('.settings-toggle i').className = isVisible ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        });
        
        const radioGroup = searchSection.querySelector('.radio-group');
        if (radioGroup) {
            radioGroup.after(globalSettings);
        } else {
            searchSection.appendChild(globalSettings);
        }
        
        document.getElementById('global-consignor-select').addEventListener('change', (e) => {
            const value = e.target.value;
            this.selectedConsignorId = value ? parseInt(value) : null;
            this.saveSettings();
            showMessage(`Default consignor updated`, 'success');
        });
        
        document.getElementById('auto-estimate-checkbox').addEventListener('change', (e) => {
            this.autoEstimatePrice = e.target.checked;
            this.saveSettings();
            showMessage(`Auto-estimate ${this.autoEstimatePrice ? 'enabled' : 'disabled'}`, 'success');
        });
        
        document.getElementById('clear-defaults-btn').addEventListener('click', () => {
            this.selectedConsignorId = null;
            this.autoEstimatePrice = true;
            this.saveSettings();
            
            document.getElementById('global-consignor-select').value = '';
            document.getElementById('auto-estimate-checkbox').checked = true;
            
            showMessage('Default settings cleared', 'success');
        });
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

        if (this.currentSearchType === 'add') {
            this.currentResults = await this.searchDiscogs(searchTerm);
        } else {
            this.currentResults = await this.searchDatabase(searchTerm);
        }

        this.displayResults();
    }

    async searchDiscogs(searchTerm) {
        try {
            const response = await APIUtils.get('/api/discogs/search', { q: searchTerm });
            if (response.status === 'success' && response.results) {
                return response.results.map(result => {
                    let artist = result.artist || 'Unknown';
                    let title = result.title || 'Unknown';
                    
                    if (artist === 'Unknown' && title && title.includes(' - ')) {
                        const parts = title.split(' - ');
                        artist = parts[0].trim();
                        title = parts.slice(1).join(' - ').trim();
                    }
                    
                    if (Array.isArray(artist)) {
                        artist = artist[0] || 'Unknown';
                    }
                    
                    return {
                        ...result,
                        artist: artist,
                        title: title
                    };
                });
            }
        } catch (error) {
            console.error('Error searching Discogs:', error);
        }
        return [];
    }

    async searchDatabase(searchTerm) {
        try {
            let params = { 
                q: searchTerm,
                search_field: this.currentSearchField
            };
            
            const response = await APIUtils.get('/records/search', params);
            
            if (response.status === 'success' && response.records) {
                return response.records;
            }
        } catch (error) {
            console.error('Error searching database:', error);
        }
        return [];
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
        const hasActiveBatch = this.activeBatch !== null;
        
        const conditionOptions = this.conditions.map(condition => {
            return `<option value="${condition.id}">${condition.display_name || condition.condition_name}</option>`;
        }).join('');
        
        const genreOptions = this.genres.map(genre => {
            return `<option value="${genre.id}">${genre.genre_name}</option>`;
        }).join('');
        
        const consignorOptions = this.consignors.map(consignor => {
            const selected = consignor.id === this.selectedConsignorId ? 'selected' : '';
            return `<option value="${consignor.id}" ${selected}>${consignor.username}${consignor.flag_color ? ` (${consignor.flag_color})` : ''}</option>`;
        }).join('');
        
        return `
            <h3>Search Results (${resultsCount})</h3>
            
            ${this.currentResults.map((record, index) => {
                let discogsIdentifiers = '';
                if (record.barcode) {
                    if (Array.isArray(record.barcode)) {
                        discogsIdentifiers = record.barcode.join(', ');
                    } else {
                        discogsIdentifiers = record.barcode;
                    }
                }
                
                return `
                    <div class="record-card" data-record-id="${record.discogs_id || record.id}" data-index="${index}" data-artist="${record.artist}" data-format="${record.format || ''}">
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
                                <div class="record-details" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px 15px; margin-top: 8px;">
                                    ${record.year ? `<span><strong>Year:</strong> ${record.year}</span>` : ''}
                                    ${record.genre ? `<span><strong>Discogs Genre:</strong> ${record.genre}</span>` : ''}
                                    ${record.format ? `<span><strong>Format:</strong> ${record.format}</span>` : ''}
                                    ${record.country ? `<span><strong>Country:</strong> ${record.country}</span>` : ''}
                                    ${record.catalog_number ? `<span><strong>Catalog #:</strong> ${record.catalog_number}</span>` : ''}
                                    ${discogsIdentifiers ? `<span style="grid-column: span 2;"><strong>Identifiers:</strong> ${discogsIdentifiers.substring(0, 100)}${discogsIdentifiers.length > 100 ? '...' : ''}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <div id="prediction-container-${record.discogs_id || record.id}" class="genre-prediction-container" style="margin: 10px 0;"></div>
                        
                        <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;">
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                <div>
                                    <label class="form-label">
                                        <i class="fas fa-album"></i> Sleeve Condition *
                                    </label>
                                    <select class="form-control sleeve-condition-select" required>
                                        <option value="">Select sleeve condition...</option>
                                        ${conditionOptions}
                                    </select>
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Auto-sets disc condition
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="form-label">
                                        <i class="fas fa-compact-disc"></i> Disc Condition *
                                    </label>
                                    <select class="form-control disc-condition-select" required>
                                        <option value="">Select disc condition...</option>
                                        ${conditionOptions}
                                    </select>
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Can be changed independently
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="form-label">Genre *</label>
                                    <select class="form-control genre-select" 
                                            required
                                            data-record-id="${record.discogs_id || record.id}">
                                        <option value="">Select genre...</option>
                                        ${genreOptions}
                                    </select>
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Genre will load when conditions are selected
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="form-label">Price ($) *</label>
                                    <input type="number" 
                                           class="form-control price-input" 
                                           step="1" 
                                           min="${this.minimumPrice}" 
                                           placeholder="Min: $${this.minimumPrice.toFixed(2)}" 
                                           required>
                                    <div class="price-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Step: $1.00
                                    </div>
                                    <button class="btn btn-sm btn-info estimate-now-btn" style="margin-top: 5px; font-size: 12px; display: ${this.autoEstimatePrice ? 'none' : 'inline-block'};">
                                        <i class="fas fa-calculator"></i> Estimate Price
                                    </button>
                                </div>
                                
                                <div>
                                    <label class="form-label">
                                        <i class="fas fa-user"></i> Consignor
                                    </label>
                                    <select class="form-control consignor-select">
                                        <option value="">None</option>
                                        ${consignorOptions}
                                    </select>
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Default consignor pre-selected
                                    </div>
                                </div>
                            </div>
                            
                            <div class="barcode-info" style="margin-top: 15px; padding: 10px; background: #e9ecef; border-radius: 4px;">
                                <i class="fas fa-barcode"></i>
                                <span>A numeric PigStyle barcode will be automatically generated when you add this record</span>
                            </div>
                            
                            <div id="calculation-${record.discogs_id || record.id}" class="calculation-container" style="margin-top: 15px;"></div>
                            
                            <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                                <button class="btn btn-primary add-record-btn">
                                    <i class="fas fa-plus"></i> Add to Inventory
                                </button>
                                
                                ${hasActiveBatch ? `
                                    <span class="form-hint" style="margin-left: 10px; font-size: 12px; color: #28a745;">
                                        <i class="fas fa-check-circle"></i> Record will be added to active batch
                                    </span>
                                ` : ''}
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
        
        const getConditionOptions = (recordId, type = 'sleeve') => {
            const record = this.currentResults.find(r => r.id == recordId);
            const conditionId = type === 'sleeve' ? record.condition_sleeve_id : record.condition_disc_id;
            return this.conditions.map(condition => {
                const selected = conditionId == condition.id ? 'selected' : '';
                return `<option value="${condition.id}" ${selected}>${condition.display_name || condition.condition_name}</option>`;
            }).join('');
        };
        
        const getStatusOptions = (recordId) => {
            const record = this.currentResults.find(r => r.id == recordId);
            return this.statuses.map(status => {
                const selected = record && (record.status_name || 'active').toLowerCase() === status ? 'selected' : '';
                return `<option value="${status}" ${selected}>${status.charAt(0).toUpperCase() + status.slice(1)}</option>`;
            }).join('');
        };
        
        const consignorOptions = this.consignors.map(consignor => {
            return `<option value="${consignor.id}">${consignor.username}${consignor.flag_color ? ` (${consignor.flag_color})` : ''}</option>`;
        }).join('');
        
        return `
            <h3>Database Results (${filteredResults.length})</h3>
             
            ${filteredResults.map((record, index) => {
                const statusName = (record.status_name || 'active').toLowerCase();
                const statusClass = statusName.replace(/\s+/g, '-');
                const displayStatus = record.status_name || 'Active';
                
                const currentConsignorId = record.consignor_id || '';
                
                const sleeveCondition = this.conditions.find(c => c.id == record.condition_sleeve_id);
                const discCondition = this.conditions.find(c => c.id == record.condition_disc_id);
                const sleeveDisplay = sleeveCondition ? sleeveCondition.display_name || sleeveCondition.condition_name : 'Not set';
                const discDisplay = discCondition ? discCondition.display_name || discCondition.condition_name : 'Not set';
                
                const locationDisplay = record.location && record.location.trim() !== '' 
                    ? record.location 
                    : '<span style="color: #999;">Not set</span>';
                
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
                                <div class="record-details" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px 15px; margin-top: 8px;">
                                    <span><strong>Barcode:</strong> <span class="barcode-value">${record.barcode || 'None'}</span></span>
                                    <span><strong>Catalog #:</strong> ${record.catalog_number || 'None'}</span>
                                    <span><strong>Price:</strong> $${(record.store_price || 0).toFixed(2)}</span>
                                    <span><strong>Sleeve:</strong> ${sleeveDisplay}</span>
                                    <span><strong>Disc:</strong> ${discDisplay}</span>
                                    <span><strong>Location:</strong> ${locationDisplay}</span>
                                    <span><strong>Status:</strong> <span class="status-badge ${statusClass}">${displayStatus}</span></span>
                                    ${record.consignor_name ? `<span><strong>Consignor:</strong> ${record.consignor_name}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <div id="calculation-${record.id}" class="calculation-container" style="margin: 15px 0;"></div>
                        
                        <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;">
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                <div>
                                    <label class="form-label">Genre</label>
                                    <select class="form-control edit-genre-select" data-record-id="${record.id}">
                                        <option value="">Select genre...</option>
                                        ${getGenreOptions(record.id)}
                                    </select>
                                </div>
                                
                                <div>
                                    <label class="form-label">Sleeve Condition</label>
                                    <select class="form-control edit-sleeve-condition-select" data-record-id="${record.id}">
                                        <option value="">Select sleeve condition...</option>
                                        ${getConditionOptions(record.id, 'sleeve')}
                                    </select>
                                </div>
                                
                                <div>
                                    <label class="form-label">Disc Condition</label>
                                    <select class="form-control edit-disc-condition-select" data-record-id="${record.id}">
                                        <option value="">Select disc condition...</option>
                                        ${getConditionOptions(record.id, 'disc')}
                                    </select>
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Independent from sleeve
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="form-label">Location</label>
                                    <input type="text" 
                                           class="form-control edit-location-input" 
                                           data-record-id="${record.id}"
                                           value="${this.escapeHtml(record.location || '')}" 
                                           placeholder="e.g., bin 1/12, shelf A/3">
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Physical location in store
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="form-label">Price ($)</label>
                                    <input type="number" 
                                           class="form-control edit-price-input" 
                                           data-record-id="${record.id}"
                                           value="${record.store_price || ''}" 
                                           step="1" 
                                           min="${this.minimumPrice}"
                                           placeholder="Min: $${this.minimumPrice.toFixed(2)}">
                                    <div class="price-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Step: $1.00
                                    </div>
                                    <button class="btn btn-sm btn-info edit-estimate-now-btn" style="margin-top: 5px; font-size: 12px; display: ${this.autoEstimatePrice ? 'none' : 'inline-block'};" data-record-id="${record.id}">
                                        <i class="fas fa-calculator"></i> Estimate Price
                                    </button>
                                </div>
                                
                                <div>
                                    <label class="form-label">Consignor</label>
                                    <select class="form-control edit-consignor-select" data-record-id="${record.id}">
                                        <option value="">None</option>
                                        ${consignorOptions.replace(`value="${currentConsignorId}"`, `value="${currentConsignorId}" selected`)}
                                    </select>
                                </div>
                                
                                ${userRole === 'admin' ? `
                                <div>
                                    <label class="form-label">Status</label>
                                    <select class="form-control edit-status-select" data-record-id="${record.id}">
                                        ${getStatusOptions(record.id)}
                                    </select>
                                </div>
                                ` : ''}
                            </div>
                            
                            <div style="display: flex; gap: 10px; margin-top: 20px;">
                                <button class="btn btn-primary save-changes-btn" data-record-id="${record.id}">
                                    <i class="fas fa-save"></i> Save Changes
                                </button>
                                
                                ${userRole === 'admin' ? `
                                    <button class="btn btn-secondary delete-record-btn" data-record-id="${record.id}">
                                        <i class="fas fa-trash"></i> Delete
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        `;
    }

    async loadGenreForRecord(card, artist) {
        if (!artist) return;
        
        const predictionContainer = card.querySelector('.genre-prediction-container');
        const genreSelect = card.querySelector('.genre-select');
        
        if (!genreSelect) return;
        
        predictionContainer.innerHTML = `
            <div class="genre-prediction" style="padding: 10px; background: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px;">
                <i class="fas fa-spinner fa-spin" style="color: #007bff;"></i>
                <span>Checking for artist match...</span>
            </div>
        `;
        
        const prediction = await this.genrePredictor.predictGenre(artist);
        
        if (prediction) {
            const options = genreSelect.options;
            for (let i = 0; i < options.length; i++) {
                if (options[i].value == prediction.local_genre_id) {
                    options[i].selected = true;
                    break;
                }
            }
            
            predictionContainer.innerHTML = `
                <div class="genre-prediction prediction-available" style="padding: 10px; background: #d4edda; border-left: 4px solid #28a745; border-radius: 4px; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-check-circle" style="color: #28a745; font-size: 20px;"></i>
                    <div style="flex: 1;">
                        <strong>✅ Artist Match:</strong> Artist "${artist}" found in database - genre set to ${prediction.local_genre_name}
                    </div>
                </div>
            `;
        } else {
            predictionContainer.innerHTML = `
                <div class="genre-prediction" style="padding: 10px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                    <i class="fas fa-search" style="color: #856404;"></i>
                    <span>No artist match found for '${artist}'. Select a genre manually.</span>
                </div>
            `;
        }
    }

    // ============================================================================
    // DISCOGS PRICE ESTIMATION
    // ============================================================================

    async fetchDiscogsPriceSuggestions(discogsId) {
        try {
            console.log(`📀 Fetching Discogs price suggestions for release ID: ${discogsId}`);
            
            const url = `http://localhost:5000/api/discogs/price-suggestions/${discogsId}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            return {
                success: true,
                data: data,
                request: { url: url, method: 'GET' }
            };
        } catch (error) {
            console.error('Error fetching Discogs price suggestions:', error);
            return { success: false, error: error.message };
        }
    }

    mapConditionToDiscogs(conditionName) {
        const mapping = {
            'Mint': 'Mint (M)',
            'Mint (M)': 'Mint (M)',
            'Near Mint': 'Near Mint (NM or M-)',
            'Near Mint (NM or M-)': 'Near Mint (NM or M-)',
            'Very Good Plus': 'Very Good Plus (VG+)',
            'Very Good Plus (VG+)': 'Very Good Plus (VG+)',
            'Very Good': 'Very Good (VG)',
            'Very Good (VG)': 'Very Good (VG)',
            'Good Plus': 'Good Plus (G+)',
            'Good Plus (G+)': 'Good Plus (G+)',
            'Good': 'Good (G)',
            'Good (G)': 'Good (G)',
            'Fair': 'Fair (F)',
            'Fair (F)': 'Fair (F)',
            'Poor': 'Poor (P)',
            'Poor (P)': 'Poor (P)'
        };
        return mapping[conditionName] || conditionName;
    }

    extractDiscogsPrice(suggestions, conditionName) {
        if (!suggestions) return null;
        
        const discogsCondition = this.mapConditionToDiscogs(conditionName);
        
        if (suggestions[discogsCondition] && suggestions[discogsCondition].value) {
            return parseFloat(suggestions[discogsCondition].value);
        }
        
        const firstKey = Object.keys(suggestions)[0];
        if (firstKey && suggestions[firstKey].value) {
            return parseFloat(suggestions[firstKey].value);
        }
        
        return null;
    }

    // ============================================================================
    // EBAY PRICE ESTIMATION
    // ============================================================================

    async searchEbayListings(query, limit = 50) {
        try {
            console.log(`🛒 Searching eBay for: ${query}`);
            
            const url = `http://localhost:5000/api/ebay/search`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, limit: limit })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            return {
                success: true,
                data: data,
                request: { url: url, method: 'POST', body: { query: query, limit: limit } }
            };
        } catch (error) {
            console.error('Error searching eBay:', error);
            return { success: false, error: error.message };
        }
    }

    extractEbayPriceAndListings(ebayData, condition, formatType = '') {
        const items = ebayData.itemSummaries || [];
        
        if (items.length === 0) {
            return { estimated_price: null, listings: [], summary: {} };
        }
        
        const getMediaKeywords = (format) => {
            const formatLower = format.toLowerCase();
            if (formatLower.includes('cd')) return ['cd', 'compact disc'];
            if (formatLower.includes('cassette')) return ['cassette', 'tape'];
            return ['vinyl', 'lp', 'record', '12"', '7"'];
        };
        
        const mediaKeywords = getMediaKeywords(formatType);
        
        const getConditionTerms = (cond) => {
            const condLower = cond.toLowerCase();
            const mapping = {
                'mint': ['mint', 'new', 'sealed', 'brand new'],
                'near mint': ['near mint', 'nm', 'm-', 'near-mint'],
                'very good plus': ['very good plus', 'vg+', 'vg plus'],
                'very good': ['very good', 'vg'],
                'good plus': ['good plus', 'g+', 'g plus'],
                'good': ['good', 'g'],
                'fair': ['fair', 'f'],
                'poor': ['poor', 'p']
            };
            for (const [key, terms] of Object.entries(mapping)) {
                if (condLower.includes(key)) return terms;
            }
            return [];
        };
        
        const conditionTerms = getConditionTerms(condition);
        
        const processedListings = [];
        for (const item of items) {
            const title = item.title || '';
            const titleLower = title.toLowerCase();
            
            const isCorrectMedia = mediaKeywords.some(keyword => titleLower.includes(keyword));
            if (!isCorrectMedia) continue;
            
            let price = 0;
            if (item.price && item.price.value) price = parseFloat(item.price.value);
            if (price <= 0) continue;
            
            let shippingCost = 0;
            if (item.shippingOptions && item.shippingOptions.length > 0) {
                const shipping = item.shippingOptions[0].shippingCost;
                if (shipping && shipping.value) shippingCost = parseFloat(shipping.value);
            }
            
            const totalPrice = price + shippingCost;
            const itemCondition = (item.condition || '').toLowerCase();
            const matchesCondition = conditionTerms.some(term => itemCondition.includes(term));
            
            processedListings.push({
                title: title,
                price: price,
                shipping: shippingCost,
                total: totalPrice,
                condition: item.condition || 'Unknown',
                url: item.itemWebUrl || '',
                matches_condition: matchesCondition
            });
        }
        
        if (processedListings.length === 0) {
            return { estimated_price: null, listings: [], summary: {} };
        }
        
        processedListings.sort((a, b) => a.total - b.total);
        
        const allTotals = processedListings.map(l => l.total);
        const genericMedian = this.calculateMedian(allTotals);
        
        const conditionListings = processedListings.filter(l => l.matches_condition);
        let conditionMedian = null;
        if (conditionListings.length > 0) {
            const conditionTotals = conditionListings.map(l => l.total);
            conditionMedian = this.calculateMedian(conditionTotals);
        }
        
        const estimatedPrice = conditionMedian !== null ? conditionMedian : genericMedian;
        
        return {
            estimated_price: estimatedPrice,
            listings: processedListings.slice(0, 20),
            summary: {
                total_listings: processedListings.length,
                condition_listings: conditionListings.length,
                generic_median: genericMedian,
                condition_median: conditionMedian,
                price_range: { min: Math.min(...allTotals), max: Math.max(...allTotals) },
                average_price: allTotals.reduce((a, b) => a + b, 0) / allTotals.length
            }
        };
    }

    calculateMedian(numbers) {
        if (numbers.length === 0) return null;
        const sorted = [...numbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
        return sorted[mid];
    }

    getFormatKeyword(formatType) {
        if (!formatType) return 'vinyl';
        const formatLower = formatType.toLowerCase();
        if (formatLower.includes('cd')) return 'cd';
        if (formatLower.includes('cassette')) return 'cassette';
        return 'vinyl';
    }

    roundDownTo99(price) {
        const dollars = Math.floor(price);
        if (dollars === 0) return 0.99;
        return (dollars - 1) + 0.99;
    }

    async estimatePriceFromBothApis(discogsId, conditionName, artist, title, formatType = '') {
        const result = {
            success: false,
            discogs_price: null,
            ebay_price: null,
            final_price: null,
            price_source: null,
            calculation_steps: [],
            discogs_request: null,
            discogs_response: null,
            ebay_request: null,
            ebay_response: null,
            ebay_listings: [],
            ebay_summary: {}
        };

        // Discogs
        if (discogsId) {
            result.calculation_steps.push(`📀 Fetching Discogs price suggestions for release ID: ${discogsId}`);
            result.calculation_steps.push(`🎚️ Selected condition: ${conditionName}`);

            const discogsResult = await this.fetchDiscogsPriceSuggestions(discogsId);
            
            if (discogsResult.request) result.discogs_request = discogsResult.request;
            
            if (discogsResult.success && discogsResult.data) {
                result.discogs_response = discogsResult.data;
                result.calculation_steps.push('✅ Discogs API call successful');
                
                const discogsPrice = this.extractDiscogsPrice(discogsResult.data, conditionName);
                if (discogsPrice) {
                    result.discogs_price = discogsPrice;
                    result.calculation_steps.push(`💰 Discogs advised price for "${conditionName}": $${discogsPrice.toFixed(2)}`);
                } else {
                    result.calculation_steps.push(`⚠️ No price found for condition "${conditionName}" in Discogs suggestions`);
                }
            } else {
                result.calculation_steps.push(`❌ Discogs API call failed`);
            }
        } else {
            result.calculation_steps.push(`⚠️ No Discogs ID available - skipping Discogs`);
        }
        
        // eBay
        const searchQuery = `${artist} ${title} ${this.getFormatKeyword(formatType)}`;
        result.calculation_steps.push(`🛒 Searching eBay for: "${searchQuery}"`);
        
        const ebayResult = await this.searchEbayListings(searchQuery, 50);
        
        if (ebayResult.request) result.ebay_request = ebayResult.request;
        
        if (ebayResult.success && ebayResult.data) {
            result.ebay_response = ebayResult.data;
            result.calculation_steps.push('✅ eBay API call successful');
            
            const ebayAnalysis = this.extractEbayPriceAndListings(ebayResult.data, conditionName, formatType);
            
            if (ebayAnalysis.estimated_price) {
                result.ebay_price = ebayAnalysis.estimated_price;
                result.ebay_listings = ebayAnalysis.listings;
                result.ebay_summary = ebayAnalysis.summary;
                
                if (ebayAnalysis.summary.condition_median) {
                    result.calculation_steps.push(`💰 eBay condition-matched median: $${ebayAnalysis.summary.condition_median.toFixed(2)} (${ebayAnalysis.summary.condition_listings} listings)`);
                } else {
                    result.calculation_steps.push(`💰 eBay generic median: $${ebayAnalysis.summary.generic_median.toFixed(2)} (${ebayAnalysis.summary.total_listings} total listings)`);
                }
            } else {
                result.calculation_steps.push(`⚠️ No valid eBay listings found`);
            }
        } else {
            result.calculation_steps.push(`❌ eBay API call failed`);
        }
        
        // Calculate final price (minimum of both)
        let finalPrice = null;
        let priceSource = null;
        
        if (result.discogs_price !== null && result.ebay_price !== null) {
            finalPrice = Math.min(result.discogs_price, result.ebay_price);
            priceSource = result.discogs_price <= result.ebay_price ? 'discogs' : 'ebay';
            result.calculation_steps.push(`📊 Price comparison: Discogs $${result.discogs_price.toFixed(2)} vs eBay $${result.ebay_price.toFixed(2)}`);
            result.calculation_steps.push(`  → Taking minimum: $${finalPrice.toFixed(2)} (from ${priceSource})`);
        } else if (result.discogs_price !== null) {
            finalPrice = result.discogs_price;
            priceSource = 'discogs';
            result.calculation_steps.push(`📊 Using only Discogs price: $${finalPrice.toFixed(2)}`);
        } else if (result.ebay_price !== null) {
            finalPrice = result.ebay_price;
            priceSource = 'ebay';
            result.calculation_steps.push(`📊 Using only eBay price: $${finalPrice.toFixed(2)}`);
        } else {
            finalPrice = 19.99;
            priceSource = 'fallback';
            result.calculation_steps.push(`⚠️ No price data - using fallback: $${finalPrice.toFixed(2)}`);
        }
        
        // Apply rounding
        const roundedPrice = this.roundDownTo99(finalPrice);
        result.calculation_steps.push(`💰 Applying store pricing rules:`);
        result.calculation_steps.push(`  → Original: $${finalPrice.toFixed(2)}`);
        result.calculation_steps.push(`  → Rounded down to .99: $${roundedPrice.toFixed(2)}`);
        
        const storePrice = Math.max(roundedPrice, this.minimumPrice);
        if (storePrice !== roundedPrice) {
            result.calculation_steps.push(`  → Minimum store price applied ($${this.minimumPrice.toFixed(2)})`);
        }
        
        result.calculation_steps.push(`✨ FINAL ADVISED PRICE: $${storePrice.toFixed(2)}`);
        
        result.final_price = storePrice;
        result.price_source = priceSource;
        result.success = true;
        
        return result;
    }

    async estimatePriceForRecord(record, sleeveConditionId, discConditionId) {
        let conditionForEstimate = '';
        
        if (sleeveConditionId && discConditionId) {
            const sleeveCond = this.conditions.find(c => c.id == sleeveConditionId);
            const discCond = this.conditions.find(c => c.id == discConditionId);
            
            if (sleeveCond && discCond) {
                if (sleeveCond.quality_index >= discCond.quality_index) {
                    conditionForEstimate = sleeveCond.display_name || sleeveCond.condition_name;
                } else {
                    conditionForEstimate = discCond.display_name || discCond.condition_name;
                }
            }
        }
        
        if (!conditionForEstimate) {
            return { success: false, final_price: null, calculation_steps: ['No condition selected'] };
        }
        
        return await this.estimatePriceFromBothApis(
            record.discogs_id, conditionForEstimate, record.artist, record.title, record.format || ''
        );
    }

    async handleSleeveConditionChange(event, isEditMode = false) {
        const selectElement = event.target;
        const card = selectElement.closest('.record-card');
        const recordId = card.getAttribute('data-record-id');
        const sleeveConditionId = selectElement.value;
        
        const discSelect = card.querySelector(isEditMode ? '.edit-disc-condition-select' : '.disc-condition-select');
        
        if (!sleeveConditionId) return;
        
        if (discSelect && !discSelect.value) {
            discSelect.value = sleeveConditionId;
            const changeEvent = new Event('change', { bubbles: true });
            discSelect.dispatchEvent(changeEvent);
        }
        
        const discConditionId = discSelect ? discSelect.value : null;
        
        let record;
        if (isEditMode) {
            record = this.currentResults.find(r => r.id == recordId);
        } else {
            const index = card.getAttribute('data-index');
            record = this.currentResults[index];
        }
        
        if (!record) return;
        
        const artist = card.getAttribute('data-artist') || record.artist;
        await this.loadGenreForRecord(card, artist);
        
        if (sleeveConditionId && discConditionId && this.autoEstimatePrice) {
            await this.estimatePriceAndUpdateUI(record, sleeveConditionId, discConditionId, card, recordId, isEditMode);
        }
    }

    async handleDiscConditionChange(event, isEditMode = false) {
        const selectElement = event.target;
        const card = selectElement.closest('.record-card');
        const recordId = card.getAttribute('data-record-id');
        const discConditionId = selectElement.value;
        
        const sleeveSelect = card.querySelector(isEditMode ? '.edit-sleeve-condition-select' : '.sleeve-condition-select');
        const sleeveConditionId = sleeveSelect ? sleeveSelect.value : null;
        
        if (!discConditionId) return;
        
        let record;
        if (isEditMode) {
            record = this.currentResults.find(r => r.id == recordId);
        } else {
            const index = card.getAttribute('data-index');
            record = this.currentResults[index];
        }
        
        if (!record) return;
        
        const artist = card.getAttribute('data-artist') || record.artist;
        await this.loadGenreForRecord(card, artist);
        
        if (sleeveConditionId && discConditionId && this.autoEstimatePrice) {
            await this.estimatePriceAndUpdateUI(record, sleeveConditionId, discConditionId, card, recordId, isEditMode);
        }
    }

    async handleManualEstimate(recordId, isEditMode = false) {
        const card = document.querySelector(`[data-record-id="${recordId}"]`);
        if (!card) return;
        
        const sleeveSelect = card.querySelector(isEditMode ? '.edit-sleeve-condition-select' : '.sleeve-condition-select');
        const discSelect = card.querySelector(isEditMode ? '.edit-disc-condition-select' : '.disc-condition-select');
        
        const sleeveConditionId = sleeveSelect ? sleeveSelect.value : null;
        const discConditionId = discSelect ? discSelect.value : null;
        
        if (!sleeveConditionId || !discConditionId) {
            showMessage('Please select both sleeve and disc conditions first', 'warning');
            return;
        }
        
        let record;
        if (isEditMode) {
            record = this.currentResults.find(r => r.id == recordId);
        } else {
            const index = card.getAttribute('data-index');
            record = this.currentResults[index];
        }
        
        if (!record) return;
        
        await this.estimatePriceAndUpdateUI(record, sleeveConditionId, discConditionId, card, recordId, isEditMode);
    }

    async estimatePriceAndUpdateUI(record, sleeveConditionId, discConditionId, card, recordId, isEditMode) {
        let priceInput;
        if (isEditMode) {
            priceInput = card.querySelector('.edit-price-input');
        } else {
            priceInput = card.querySelector('.price-input');
        }
        
        if (!priceInput) return;
        
        const hasExistingValue = priceInput.value && priceInput.value.trim() !== '' && !isNaN(parseFloat(priceInput.value));
        const originalValue = priceInput.value;
        priceInput.disabled = true;
        
        const priceContainer = priceInput.parentElement;
        const tempOverlay = document.createElement('div');
        tempOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.1) 100%);
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
        
        const estimate = await this.estimatePriceForRecord(record, sleeveConditionId, discConditionId);
        
        tempOverlay.remove();
        priceInput.disabled = false;
        
        if (estimate.success && estimate.final_price) {
            const finalPrice = estimate.final_price;
            priceInput.value = parseFloat(finalPrice).toFixed(2);
            priceInput.classList.add('price-estimated');
            
            const existingHints = priceInput.parentElement.querySelectorAll('.estimation-hint');
            existingHints.forEach(hint => hint.remove());
            
            const hint = document.createElement('div');
            hint.className = 'estimation-hint';
            hint.style.cssText = 'margin-top: 5px; padding: 8px; background: #e9ecef; border-radius: 4px; font-size: 12px;';
            
            if (hasExistingValue && Math.abs(parseFloat(originalValue) - finalPrice) > 0.01) {
                hint.innerHTML = `
                    <i class="fas fa-lightbulb"></i>
                    <strong>Advised Price:</strong> $${finalPrice.toFixed(2)} (Your entry: $${parseFloat(originalValue).toFixed(2)})
                    <button class="btn btn-small" style="margin-left: 10px; padding: 2px 8px;" onclick="this.closest('.estimation-hint').remove(); this.closest('.form-group').querySelector('input').value = '${originalValue}';">Keep mine</button>
                `;
            } else {
                hint.innerHTML = `<i class="fas fa-bolt"></i> <strong>Advised Price:</strong> $${finalPrice.toFixed(2)} <button class="btn btn-small" style="margin-left: 10px; padding: 2px 8px;" onclick="this.closest('.estimation-hint').remove();">Dismiss</button>`;
            }
            
            priceInput.parentElement.appendChild(hint);
            this.showPriceCalculationDetails(estimate, recordId, finalPrice);
        } else {
            if (!hasExistingValue) priceInput.value = '';
            showMessage('Could not estimate price. Please enter manually.', 'warning');
            this.showPriceCalculationDetails(estimate, recordId, null);
        }
    }

    showPriceCalculationDetails(estimate, recordId, finalPrice) {
        const calculationContainer = document.getElementById(`calculation-${recordId}`);
        if (!calculationContainer) return;
        
        let html = `<div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px;">`;
        
        if (finalPrice !== null) {
            html += `<div style="margin-bottom: 15px; padding: 10px; background: #d4edda; border-radius: 4px;"><strong>💰 Final Advised Price: $${finalPrice.toFixed(2)} (from ${estimate.price_source || 'unknown'})</strong></div>`;
        }
        
        if (estimate.calculation_steps && estimate.calculation_steps.length > 0) {
            html += `<div style="margin-bottom: 15px;"><strong>🧮 Price Calculation Steps:</strong>${estimate.calculation_steps.map(step => `<div style="margin-top: 5px; font-family: monospace; font-size: 12px;">${step}</div>`).join('')}</div>`;
        }
        
        if (estimate.ebay_summary && Object.keys(estimate.ebay_summary).length > 0) {
            html += `<div style="margin-bottom: 15px;"><strong>🛒 eBay Summary:</strong><div style="margin-top: 8px; padding: 10px; background: white; border-radius: 4px;">
                <div>Total Listings: ${estimate.ebay_summary.total_listings || 0}</div>
                <div>Condition-matched: ${estimate.ebay_summary.condition_listings || 0}</div>
                <div>Condition Median: $${(estimate.ebay_summary.condition_median || 0).toFixed(2)}</div>
                <div>Generic Median: $${(estimate.ebay_summary.generic_median || 0).toFixed(2)}</div>
                <div>Price Range: $${(estimate.ebay_summary.price_range?.min || 0).toFixed(2)} - $${(estimate.ebay_summary.price_range?.max || 0).toFixed(2)}</div>
            </div></div>`;
        }
        
        if (estimate.ebay_listings && estimate.ebay_listings.length > 0) {
            html += `<div style="margin-bottom: 15px;"><strong>📊 eBay Listings (${estimate.ebay_listings.length}):</strong>
                <div style="max-height: 300px; overflow-y: auto; margin-top: 8px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <thead><tr style="background: #e9ecef;"><th style="padding: 6px; border: 1px solid #ddd;">Total</th><th style="padding: 6px; border: 1px solid #ddd;">Condition</th><th style="padding: 6px; border: 1px solid #ddd;">Title</th><th style="padding: 6px; border: 1px solid #ddd;">Link</th></tr></thead>
                        <tbody>${estimate.ebay_listings.slice(0, 10).map(listing => `
                            <tr style="${listing.matches_condition ? 'background: #d4edda;' : ''}">
                                <td style="padding: 4px; border: 1px solid #ddd;">$${listing.total.toFixed(2)}</td>
                                <td style="padding: 4px; border: 1px solid #ddd;">${listing.condition}</td>
                                <td style="padding: 4px; border: 1px solid #ddd;">${this.escapeHtml(listing.title.substring(0, 50))}</td>
                                <td style="padding: 4px; border: 1px solid #ddd;"><a href="${listing.url}" target="_blank">View</a></td>
                            </tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>`;
        }
        
        if (estimate.discogs_response) {
            html += `<div style="margin-bottom: 15px;"><strong style="color: #28a745;">📤 Discogs Response:</strong><pre style="background: #e9ecef; padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 11px; max-height: 200px;">${this.escapeHtml(JSON.stringify(estimate.discogs_response, null, 2))}</pre></div>`;
        }
        
        html += `</div>`;
        calculationContainer.innerHTML = html;
    }

    addConditionChangeListeners() {
        document.querySelectorAll('.sleeve-condition-select').forEach(select => {
            select.addEventListener('change', (e) => this.handleSleeveConditionChange(e, false));
        });
        document.querySelectorAll('.disc-condition-select').forEach(select => {
            select.addEventListener('change', (e) => this.handleDiscConditionChange(e, false));
        });
        document.querySelectorAll('.edit-sleeve-condition-select').forEach(select => {
            select.addEventListener('change', (e) => this.handleSleeveConditionChange(e, true));
        });
        document.querySelectorAll('.edit-disc-condition-select').forEach(select => {
            select.addEventListener('change', (e) => this.handleDiscConditionChange(e, true));
        });
        document.querySelectorAll('.estimate-now-btn, .edit-estimate-now-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const card = e.target.closest('.record-card');
                const recordId = card ? card.getAttribute('data-record-id') : e.target.getAttribute('data-record-id');
                const isEdit = button.classList.contains('edit-estimate-now-btn');
                if (recordId) this.handleManualEstimate(recordId, isEdit);
            });
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
        const sleeveConditionSelect = card.querySelector('.sleeve-condition-select');
        const discConditionSelect = card.querySelector('.disc-condition-select');
        const priceInput = card.querySelector('.price-input');
        const consignorSelect = card.querySelector('.consignor-select');
        
        const genreId = genreSelect.value;
        const sleeveConditionId = sleeveConditionSelect.value;
        const discConditionId = discConditionSelect.value;
        const price = parseFloat(priceInput.value);
        const consignorId = consignorSelect ? consignorSelect.value : this.selectedConsignorId;
        
        const errors = [];
        if (!genreId) errors.push('Please select a genre');
        if (!sleeveConditionId) errors.push('Please select a sleeve condition');
        if (!discConditionId) errors.push('Please select a disc condition');
        if (!price || price < this.minimumPrice) errors.push(`Price must be at least $${this.minimumPrice.toFixed(2)}`);
        
        if (errors.length > 0) {
            showMessage(errors.join('. '), 'error');
            return;
        }
        
        const genre = this.genres.find(g => g.id == genreId);
        const genreName = genre ? genre.genre_name : '';
        
        const formatFromDiscogs = discogsRecord.format || '';
        const pigstyleBarcode = this.barcodeGenerator.generateBarcode(formatFromDiscogs);
        
        if (!this.barcodeGenerator.validateBarcode(pigstyleBarcode)) {
            showMessage('Error: Generated barcode is not valid numeric format', 'error');
            return;
        }
        
        const recordData = {
            artist: discogsRecord.artist,
            title: discogsRecord.title,
            barcode: pigstyleBarcode,
            genre_id: parseInt(genreId),
            genre_name: genreName,
            image_url: discogsRecord.image_url || '',
            catalog_number: discogsRecord.catalog_number || '',
            format: discogsRecord.format || 'Vinyl',
            condition_sleeve_id: parseInt(sleeveConditionId),
            condition_disc_id: parseInt(discConditionId),
            store_price: price,
            youtube_url: '',
            consignor_id: consignorId ? parseInt(consignorId) : null,
            status_id: 1,
        };
        
        try {
            const response = await APIUtils.post('/records', recordData);
            
            if (response.status === 'success') {
                let batchMessage = '';
                if (this.activeBatch) {
                    batchMessage = ` (added to active batch #${this.activeBatch.id})`;
                }
                
                showMessage(`Record added successfully! Barcode: ${pigstyleBarcode}. Price: $${price.toFixed(2)}${batchMessage}`, 'success');
                
                if (discogsRecord.artist && genreId) {
                    await this.genrePredictor.saveArtistGenre(discogsRecord.artist, genreId, genreName);
                }
                
                await this.loadStats();
                
                if (this.activeBatch) {
                    await this.checkActiveBatch();
                    this.renderBatchSection();
                }
                
                this.clearResults();
                document.getElementById('searchInput').value = '';
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
        const sleeveConditionSelect = card.querySelector('.edit-sleeve-condition-select');
        const discConditionSelect = card.querySelector('.edit-disc-condition-select');
        const locationInput = card.querySelector('.edit-location-input');
        const priceInput = card.querySelector('.edit-price-input');
        const statusSelect = card.querySelector('.edit-status-select');
        const consignorSelect = card.querySelector('.edit-consignor-select');
        
        const updates = {};
        let genreChanged = false;
        let newGenreId = null;
        let newGenreName = null;
        
        const currentRecord = this.currentResults.find(r => r.id == recordId);
        
        if (genreSelect && genreSelect.value) {
            newGenreId = parseInt(genreSelect.value);
            updates.genre_id = newGenreId;
            if (currentRecord && currentRecord.genre_id != newGenreId) {
                genreChanged = true;
                const genre = this.genres.find(g => g.id == newGenreId);
                newGenreName = genre ? genre.genre_name : '';
            }
        }
        
        if (sleeveConditionSelect && sleeveConditionSelect.value) updates.condition_sleeve_id = parseInt(sleeveConditionSelect.value);
        if (discConditionSelect && discConditionSelect.value) updates.condition_disc_id = parseInt(discConditionSelect.value);
        if (locationInput) updates.location = locationInput.value.trim() || null;
        
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
        
        if (consignorSelect && consignorSelect.value) updates.consignor_id = parseInt(consignorSelect.value);
        else if (consignorSelect && consignorSelect.value === '') updates.consignor_id = null;
        
        if (statusSelect && statusSelect.value) {
            const statusMap = { 'new': 1, 'active': 2, 'sold': 3, 'removed': 4 };
            updates.status_id = statusMap[statusSelect.value] || 2;
        }
        
        if (Object.keys(updates).length === 0) {
            showMessage('No changes to save', 'info');
            return;
        }
        
        try {
            const response = await APIUtils.put(`/records/${recordId}`, updates);
            
            if (response.status === 'success') {
                showMessage(`Record updated successfully!`, 'success');
                
                if (genreChanged && currentRecord && currentRecord.artist && newGenreId) {
                    await this.genrePredictor.updateArtistGenre(currentRecord.artist, newGenreId, newGenreName);
                }
                
                const currentSearch = document.getElementById('searchInput').value;
                if (currentSearch) await this.performSearch(currentSearch);
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
                this.currentResults = this.currentResults.filter(r => r.id != recordId);
                this.displayResults();
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

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'add-edit-delete') {
        if (!window.addEditDeleteManager) {
            window.addEditDeleteManager = new AddEditDeleteManager();
        } else {
            window.addEditDeleteManager.checkActiveBatch();
            window.addEditDeleteManager.renderBatchSection();
        }
    }
});