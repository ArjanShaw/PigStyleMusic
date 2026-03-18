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
        
        // Only check artist_genre table
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
        // Check cache first
        if (this.artistGenreCache[artist]) {
            console.log(`🔍 CACHE HIT: Artist "${artist}" found in cache:`, this.artistGenreCache[artist]);
            return this.artistGenreCache[artist];
        }
        console.log(`🔍 CACHE MISS: Artist "${artist}" not in cache, making API call...`);
        
        try {
            console.log(`📡 API CALL: GET /artist-genre/${encodeURIComponent(artist)}`);
            const response = await APIUtils.get(
                `/artist-genre/${encodeURIComponent(artist)}`
            );
            
            console.log(`📡 API RESPONSE:`, response);
            console.log(`📡 Response type:`, typeof response);
            console.log(`📡 Response keys:`, Object.keys(response));
            
            // Check if the response has artist data (success case)
            if (response && response.artist && response.genre_id) {
                console.log(`✅ API SUCCESS: Artist "${artist}" found with genre ID ${response.genre_id}`);
                console.log(`✅ Genre data:`, {
                    artist: response.artist,
                    genre_id: response.genre_id,
                    genre_name: response.genre_name
                });
                
                this.artistGenreCache[artist] = {
                    artist: response.artist,
                    genre_id: response.genre_id,
                    genre_name: response.genre_name
                };
                return this.artistGenreCache[artist];
                
            } 
            // Check if it's an error response (artist not found)
            else if (response && response.status === 'error' && response.error === 'Artist not found') {
                console.log(`❌ API RESPONSE: Artist "${artist}" not found in database`);
                this.artistGenreCache[artist] = null;
                return null;
                
            } 
            // Any other response format
            else {
                console.log(`⚠️ UNEXPECTED API RESPONSE FORMAT:`, response);
                this.artistGenreCache[artist] = null;
                return null;
            }
            
        } catch (error) {
            console.error(`🔥 ERROR fetching artist genre for "${artist}":`, error);
            console.error(`🔥 Error message:`, error.message);
            console.error(`🔥 Error stack:`, error.stack);
            return null;
        }
    }

    async saveArtistGenre(artist, genreId, genreName) {
        if (!artist || !genreId) return null;
        
        // First check if artist already has a genre
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
        this.consignors = [];
        this.genrePredictor = new GenrePredictor();
        this.barcodeGenerator = new BarcodeGenerator();
        this.commissionRate = 0.20;
        this.minimumPrice = 1.99;
        this.selectedConsignorId = null;
        this.selectedCommissionRate = 20.0;
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
                <span><i class="fas fa-layer-group"></i> Active Batch #${this.activeBatch.id} - ${this.activeBatch.seller_name} (${this.activeBatch.offer_percentage}%)</span>
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
                <span><i class="fas fa-layer-group"></i> No Active Batch - Start a new batch to track seller information</span>
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
                
                <div style="flex: 1; min-width: 150px;">
                    <label for="batch-offer-percentage" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-percent"></i> Offer Percentage (%)
                    </label>
                    <input type="number" 
                           id="batch-offer-percentage" 
                           class="search-input" 
                           value="50"
                           min="0" 
                           max="100"
                           step="5"
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
                    <p style="margin: 5px 0;"><strong>Offer Percentage:</strong> ${this.activeBatch.offer_percentage || 0}%</p>
                    <p style="margin: 5px 0;"><strong>Started:</strong> ${new Date(this.activeBatch.start_datetime).toLocaleString()}</p>
                    <p style="margin: 5px 0;"><strong>Records in Batch:</strong> ${this.activeBatch.record_count || 0}</p>
                    ${this.activeBatch.notes ? `<p style="margin: 5px 0;"><strong>Notes:</strong> ${this.escapeHtml(this.activeBatch.notes)}</p>` : ''}
                </div>
                
                <div style="background: #e9ecef; padding: 12px; border-radius: 4px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; font-weight: 500;">
                        <span>Total Store Value:</span>
                        <span>$${(this.activeBatch.total_store_value || 0).toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-weight: 700; color: #28a745; font-size: 1.2rem;">
                        <span>Total Offer Amount:</span>
                        <span>$${(this.activeBatch.total_offer_amount || 0).toFixed(2)}</span>
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
                const percentage = parseFloat(document.getElementById('batch-offer-percentage').value);
                const notes = document.getElementById('batch-notes').value.trim();
                
                if (!name) {
                    showMessage('Please enter seller name', 'error');
                    return;
                }
                if (!contact) {
                    showMessage('Please enter seller contact (phone or email)', 'error');
                    return;
                }
                if (isNaN(percentage) || percentage < 0 || percentage > 100) {
                    showMessage('Please enter a valid percentage (0-100)', 'error');
                    return;
                }
                
                await this.startBatch(name, contact, percentage, notes);
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
                    } else {
                        // If batchManager not loaded, load it temporarily
                        const response = await APIUtils.get(`/api/batches/${this.activeBatch.id}/print`);
                        if (response.status === 'success' && response.print_data) {
                            this.generateBillOfSale(response.print_data);
                        }
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
                
                if (!confirm('FINAL WARNING: This will permanently delete records. Type "DELETE" to confirm.')) {
                    return;
                }
                
                const confirmation = prompt('Type "DELETE" to confirm permanent deletion of all records in this batch:');
                if (confirmation !== 'DELETE') {
                    showMessage('Cancellation aborted - incorrect confirmation', 'warning');
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

    async startBatch(name, contact, percentage, notes) {
        try {
            const response = await APIUtils.post('/api/batches', {
                seller_name: name,
                seller_contact: contact,
                offer_percentage: percentage,
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

    generateBillOfSale(printData) {
        const printWindow = window.open('', '_blank');
        const today = new Date().toLocaleDateString();
        
        let itemsHtml = '';
        printData.items.forEach((item, index) => {
            itemsHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${index + 1}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${this.escapeHtml(item.artist)} - ${this.escapeHtml(item.title)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${(item.store_price || 0).toFixed(2)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${(item.offer_price || 0).toFixed(2)}</td>
                </tr>
            `;
        });

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bill of Sale - Batch #${printData.batch_id}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .header h1 { margin-bottom: 5px; color: #333; }
                    .header h2 { margin-top: 0; color: #666; font-weight: normal; }
                    .seller-info { margin-bottom: 30px; padding: 15px; background: #f5f5f5; border-radius: 5px; }
                    .seller-info p { margin: 5px 0; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                    th { background: #333; color: white; padding: 10px; text-align: left; }
                    td { padding: 10px; border-bottom: 1px solid #ddd; }
                    .totals { text-align: right; margin-bottom: 40px; }
                    .totals p { font-size: 16px; margin: 5px 0; }
                    .totals .total-offer { font-size: 20px; font-weight: bold; color: #28a745; }
                    .signature-section { margin-top: 50px; }
                    .signature-line { display: flex; justify-content: space-between; margin-top: 30px; }
                    .signature-item { width: 45%; }
                    .signature-item .line { border-bottom: 1px solid #000; margin-top: 5px; width: 100%; }
                    .footer { margin-top: 30px; font-size: 12px; color: #666; text-align: center; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>PIGSTYLE MUSIC</h1>
                    <h2>BILL OF SALE</h2>
                    <p>Batch #${printData.batch_id} | Date: ${today}</p>
                </div>
                
                <div class="seller-info">
                    <h3>Seller Information:</h3>
                    <p><strong>Name:</strong> ${this.escapeHtml(printData.seller_name || '')}</p>
                    <p><strong>Contact:</strong> ${this.escapeHtml(printData.seller_contact || '')}</p>
                    <p><strong>Offer Percentage:</strong> ${printData.offer_percentage || 0}% of store price</p>
                    <p><strong>Batch Date:</strong> ${new Date(printData.start_date).toLocaleDateString()}</p>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Item</th>
                            <th>Store Price</th>
                            <th>Offer Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
                
                <div class="totals">
                    <p><strong>Total Store Value:</strong> $${printData.total_store_value.toFixed(2)}</p>
                    <p class="total-offer"><strong>Total Offer Amount:</strong> $${printData.total_offer_amount.toFixed(2)}</p>
                </div>
                
                <div class="signature-section">
                    <p>I, <strong>${this.escapeHtml(printData.seller_name || '')}</strong>, agree to sell the above items to PigStyle Music for the total amount of <strong>$${printData.total_offer_amount.toFixed(2)}</strong>.</p>
                    
                    <div class="signature-line">
                        <div class="signature-item">
                            <p>Seller Signature:</p>
                            <div class="line"></div>
                        </div>
                        <div class="signature-item">
                            <p>Date:</p>
                            <div class="line"></div>
                        </div>
                    </div>
                    
                    <div class="signature-line">
                        <div class="signature-item">
                            <p>PigStyle Representative:</p>
                            <div class="line"></div>
                        </div>
                        <div class="signature-item">
                            <p>Date:</p>
                            <div class="line"></div>
                        </div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>This document serves as a bill of sale for the items listed above. The seller agrees to transfer ownership of these items to PigStyle Music in exchange for the total offer amount.</p>
                </div>
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
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

            const commissionResponse = await APIUtils.get('/api/commission-rate');
            this.commissionRate = commissionResponse.commission_rate / 100;
            document.getElementById('commission-rate').textContent = 
                `${commissionResponse.commission_rate}%`;

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

    async loadConditions() {
        console.log('LOAD_CONDITIONS: Loading conditions from /api/conditions');
        try {
            const response = await APIUtils.get('/api/conditions');
            console.log('LOAD_CONDITIONS: Raw API response:', response);
            
            if (response && response.conditions) {
                this.conditions = response.conditions;
                console.log('LOAD_CONDITIONS: Conditions loaded successfully:', this.conditions);
            } else {
                console.error('LOAD_CONDITIONS: Invalid response format:', response);
                this.conditions = [];
            }
        } catch (error) {
            console.error('Error loading conditions:', error);
            this.conditions = [
                { id: 1, condition_name: 'Mint (M)', display_name: 'Mint (M)', abbreviation: 'M', quality_index: 0 },
                { id: 2, condition_name: 'Near Mint (NM or M-)', display_name: 'Near Mint (NM or M-)', abbreviation: 'NM', quality_index: 1 },
                { id: 3, condition_name: 'Very Good Plus (VG+)', display_name: 'Very Good Plus (VG+)', abbreviation: 'VG+', quality_index: 2 },
                { id: 4, condition_name: 'Very Good (VG)', display_name: 'Very Good (VG)', abbreviation: 'VG', quality_index: 3 },
                { id: 5, condition_name: 'Good Plus (G+)', display_name: 'Good Plus (G+)', abbreviation: 'G+', quality_index: 4 },
                { id: 6, condition_name: 'Good (G)', display_name: 'Good (G)', abbreviation: 'G', quality_index: 5 },
                { id: 7, condition_name: 'Fair (F)', display_name: 'Fair (F)', abbreviation: 'F', quality_index: 6 },
                { id: 8, condition_name: 'Poor (P)', display_name: 'Poor (P)', abbreviation: 'P', quality_index: 7 }
            ];
            console.log('LOAD_CONDITIONS: Using fallback conditions:', this.conditions);
        }
    }

    async loadConsignors() {
        console.log('LOAD_CONSIGNORS: Starting to load consignors from /users endpoint');
        try {
            const response = await APIUtils.get('/users');
            console.log('LOAD_CONSIGNORS: Raw API response:', response);
            
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
            
            const savedCommission = localStorage.getItem('add_record_commission_rate');
            if (savedCommission) {
                this.selectedCommissionRate = parseFloat(savedCommission);
            }
            
            const savedAutoEstimate = localStorage.getItem('add_record_auto_estimate');
            if (savedAutoEstimate !== null) {
                this.autoEstimatePrice = savedAutoEstimate === 'true';
            }
            
            console.log('LOAD_SETTINGS: Loaded consignor ID:', this.selectedConsignorId);
            console.log('LOAD_SETTINGS: Loaded commission rate:', this.selectedCommissionRate);
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
            
            localStorage.setItem('add_record_commission_rate', this.selectedCommissionRate.toString());
            localStorage.setItem('add_record_auto_estimate', this.autoEstimatePrice.toString());
            
            console.log('SAVE_SETTINGS: Saved consignor ID:', this.selectedConsignorId);
            console.log('SAVE_SETTINGS: Saved commission rate:', this.selectedCommissionRate);
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
                <div style="flex: 1; min-width: 150px;">
                    <label for="global-commission-input" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-percentage"></i> Default Consignment Rate (%)
                    </label>
                    <div style="display: flex; gap: 5px;">
                        <input type="number" 
                               id="global-commission-input" 
                               value="${this.selectedCommissionRate}" 
                               step="10" 
                               min="0" 
                               max="100"
                               style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; color: #333;">
                        <button class="btn btn-small" id="apply-commission-btn" style="background: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                            <i class="fas fa-check"></i> Set
                        </button>
                    </div>
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
        
        document.getElementById('apply-commission-btn').addEventListener('click', () => {
            const input = document.getElementById('global-commission-input');
            const value = parseFloat(input.value);
            if (!isNaN(value) && value >= 0 && value <= 100) {
                this.selectedCommissionRate = value;
                this.saveSettings();
                showMessage(`Default commission rate set to ${value}%`, 'success');
            } else {
                showMessage('Please enter a valid percentage (0-100)', 'error');
            }
        });
        
        document.getElementById('auto-estimate-checkbox').addEventListener('change', (e) => {
            this.autoEstimatePrice = e.target.checked;
            this.saveSettings();
            showMessage(`Auto-estimate ${this.autoEstimatePrice ? 'enabled' : 'disabled'}`, 'success');
        });
        
        document.getElementById('clear-defaults-btn').addEventListener('click', () => {
            this.selectedConsignorId = null;
            this.selectedCommissionRate = 20.0;
            this.autoEstimatePrice = true;
            this.saveSettings();
            
            document.getElementById('global-consignor-select').value = '';
            document.getElementById('global-commission-input').value = '20.0';
            document.getElementById('auto-estimate-checkbox').checked = true;
            
            showMessage('Default settings cleared (commission reset to 20%, auto-estimate enabled)', 'success');
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

        console.log('PERFORM_SEARCH: Starting search for:', searchTerm);
        console.log('PERFORM_SEARCH: Search type:', this.currentSearchType);
        console.log('PERFORM_SEARCH: Search field:', this.currentSearchField);
        console.log('PERFORM_SEARCH: Current genres:', this.genres);
        console.log('PERFORM_SEARCH: Current conditions:', this.conditions);
        console.log('PERFORM_SEARCH: Current consignors:', this.consignors);

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
                // Log the exact artist strings from Discogs for debugging
                response.results.forEach(record => {
                    console.log(`Discogs artist string: "${record.artist}" (length: ${record.artist.length})`);
                });
                
                // Return results without predictions - they will be loaded when conditions are selected
                return response.results;
            }
        } catch (error) {
            console.error('Error searching Discogs:', error);
        }
        
        return []; // Return empty array on error, no mock data
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
        
        const findGenreIndex = (genreId) => {
            if (!this.genres || !genreId) return -1;
            return this.genres.findIndex(g => g.id == genreId);
        };
        
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
        
        const user = JSON.parse(localStorage.getItem('user')) || {};
        
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
                    <div class="record-card" data-record-id="${record.discogs_id || record.id}" data-index="${index}" data-artist="${record.artist}">
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
                                
                                <div>
                                    <label class="form-label">
                                        <i class="fas fa-percentage"></i> Consignment Rate (%)
                                    </label>
                                    <input type="number" 
                                           class="form-control commission-input" 
                                           value="${this.selectedCommissionRate}" 
                                           step="10" 
                                           min="0" 
                                           max="100"
                                           placeholder="Commission %">
                                    <div class="price-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Store's cut (step: 10%)
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
                
                const lastSeen = record.last_seen ? new Date(record.last_seen).toLocaleString() : 'Never';
                
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
                                    <span><strong>Commission:</strong> ${((record.commission_rate || this.commissionRate) * 100).toFixed(1)}%</span>
                                    <span><strong>Sleeve:</strong> ${sleeveDisplay}</span>
                                    <span><strong>Disc:</strong> ${discDisplay}</span>
                                    <span><strong>Status:</strong> <span class="status-badge ${statusClass}">${displayStatus}</span></span>
                                    <span><strong>Last Seen:</strong> ${lastSeen}</span>
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
                                
                                <div>
                                    <label class="form-label">Commission (%)</label>
                                    <input type="number" 
                                           class="form-control edit-commission-input" 
                                           data-record-id="${record.id}"
                                           value="${((record.commission_rate || this.commissionRate) * 100).toFixed(1)}" 
                                           step="10" 
                                           min="0" 
                                           max="100"
                                           placeholder="Commission %">
                                    <div class="price-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Store's cut (step: 10%)
                                    </div>
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
        
        // Show loading state
        predictionContainer.innerHTML = `
            <div class="genre-prediction" style="padding: 10px; background: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px;">
                <i class="fas fa-spinner fa-spin" style="color: #007bff;"></i>
                <span>Checking for artist match...</span>
            </div>
        `;
        
        const prediction = await this.genrePredictor.predictGenre(artist);
        
        if (prediction) {
            // Find and select the genre in the dropdown
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

    async estimatePriceForRecord(record, sleeveConditionId, discConditionId) {
        console.log('ESTIMATE_PRICE: Estimating price for', record.artist, '-', record.title, 
                    'Sleeve Condition ID:', sleeveConditionId, 'Disc Condition ID:', discConditionId);
        
        let conditionForEstimate = '';
        if (sleeveConditionId && discConditionId) {
            const sleeveCond = this.conditions.find(c => c.id == sleeveConditionId);
            const discCond = this.conditions.find(c => c.id == discConditionId);
            
            if (sleeveCond && discCond) {
                if (sleeveCond.quality_index >= discCond.quality_index) {
                    conditionForEstimate = sleeveCond.condition_name;
                } else {
                    conditionForEstimate = discCond.condition_name;
                }
            } else if (sleeveCond) {
                conditionForEstimate = sleeveCond.condition_name;
            } else if (discCond) {
                conditionForEstimate = discCond.condition_name;
            }
        } else if (sleeveConditionId) {
            const sleeveCond = this.conditions.find(c => c.id == sleeveConditionId);
            conditionForEstimate = sleeveCond ? sleeveCond.condition_name : '';
        } else if (discConditionId) {
            const discCond = this.conditions.find(c => c.id == discConditionId);
            conditionForEstimate = discCond ? discCond.condition_name : '';
        }
        
        if (!conditionForEstimate) {
            return { success: false, error: 'No condition selected' };
        }
            
        try {
            const response = await APIUtils.post('/api/price-estimate', {
                artist: record.artist,
                title: record.title,
                condition: conditionForEstimate,
                discogs_genre: record.genre || '',
                discogs_id: record.discogs_id || ''
            });
            
            console.log('ESTIMATE_PRICE: API response received');
            
            return response;
        } catch (error) {
            console.error('Error estimating price:', error);
            return { success: false };
        }
    }

    async handleSleeveConditionChange(event, isEditMode = false) {
        const selectElement = event.target;
        const card = selectElement.closest('.record-card');
        const recordId = card.getAttribute('data-record-id');
        const sleeveConditionId = selectElement.value;
        
        const discSelect = card.querySelector(isEditMode ? '.edit-disc-condition-select' : '.disc-condition-select');
        
        if (!sleeveConditionId) {
            return;
        }
        
        if (discSelect && !discSelect.value) {
            discSelect.value = sleeveConditionId;
            console.log(`AUTO-SET: Disc condition set to match sleeve (ID: ${sleeveConditionId})`);
            
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
        
        if (!record) {
            console.error('HANDLE_SLEEVE_CONDITION_CHANGE: Record not found');
            return;
        }
        
        // Load genre when condition is selected (always, regardless of auto-estimate checkbox)
        const artist = card.getAttribute('data-artist') || record.artist;
        await this.loadGenreForRecord(card, artist);
        
        // Only estimate price if auto-estimate is enabled
        if (sleeveConditionId && discConditionId && this.autoEstimatePrice) {
            console.log('Auto-estimating price (enabled)');
            await this.estimatePriceAndUpdateUI(record, sleeveConditionId, discConditionId, card, recordId, isEditMode);
        } else {
            console.log('Price estimation skipped (auto-estimate disabled)');
        }
    }

    async handleDiscConditionChange(event, isEditMode = false) {
        const selectElement = event.target;
        const card = selectElement.closest('.record-card');
        const recordId = card.getAttribute('data-record-id');
        const discConditionId = selectElement.value;
        
        const sleeveSelect = card.querySelector(isEditMode ? '.edit-sleeve-condition-select' : '.sleeve-condition-select');
        const sleeveConditionId = sleeveSelect ? sleeveSelect.value : null;
        
        if (!discConditionId) {
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
            console.error('HANDLE_DISC_CONDITION_CHANGE: Record not found');
            return;
        }
        
        // Load genre when condition is selected (always, regardless of auto-estimate checkbox)
        const artist = card.getAttribute('data-artist') || record.artist;
        await this.loadGenreForRecord(card, artist);
        
        // Only estimate price if auto-estimate is enabled
        if (sleeveConditionId && discConditionId && this.autoEstimatePrice) {
            console.log('Auto-estimating price (enabled)');
            await this.estimatePriceAndUpdateUI(record, sleeveConditionId, discConditionId, card, recordId, isEditMode);
        } else {
            console.log('Price estimation skipped (auto-estimate disabled)');
        }
    }

    async handleManualEstimate(recordId, isEditMode = false) {
        console.log('Manual estimate requested for record:', recordId);
        
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
        
        if (!record) {
            console.error('Record not found for manual estimate');
            return;
        }
        
        await this.estimatePriceAndUpdateUI(record, sleeveConditionId, discConditionId, card, recordId, isEditMode);
    }

    async estimatePriceAndUpdateUI(record, sleeveConditionId, discConditionId, card, recordId, isEditMode) {
        let priceInput;
        if (isEditMode) {
            priceInput = card.querySelector('.edit-price-input');
        } else {
            priceInput = card.querySelector('.price-input');
        }
        
        if (!priceInput) {
            console.error('PRICE_ESTIMATE: Price input not found');
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
        
        const estimate = await this.estimatePriceForRecord(record, sleeveConditionId, discConditionId);
        
        tempOverlay.remove();
        priceInput.disabled = false;
        
        if (estimate.success || estimate.estimated_price || estimate.calculation || estimate.price) {
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
                
                this.showExpandableCalculationDetails(record, sleeveConditionId, discConditionId, estimate, recordId, finalPrice);
                
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

    showExpandableCalculationDetails(record, sleeveConditionId, discConditionId, estimate, recordId, finalPrice) {
        const calculationContainer = document.getElementById(`calculation-${recordId}`);
        
        if (!calculationContainer) {
            console.error('Calculation container not found for ID:', `calculation-${recordId}`);
            return;
        }
        
        const sleeveCond = this.conditions.find(c => c.id == sleeveConditionId);
        const discCond = this.conditions.find(c => c.id == discConditionId);
        const sleeveName = sleeveCond ? sleeveCond.display_name || sleeveCond.condition_name : 'Unknown';
        const discName = discCond ? discCond.display_name || discCond.condition_name : 'Unknown';
        
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
                    <div><strong>Conditions:</strong> Sleeve: ${sleeveName} | Disc: ${discName}</div>
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
            const searchQuery = estimate.search_query || estimate.ebay_summary.search_query || `${record.artist} ${record.title} vinyl`;
            
            calculationHTML += `
                <div class="ebay-summary" style="margin-top: 15px;">
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
        
        document.querySelectorAll('.estimate-now-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const card = e.target.closest('.record-card');
                const recordId = card.getAttribute('data-record-id');
                this.handleManualEstimate(recordId, false);
            });
        });
        
        document.querySelectorAll('.edit-estimate-now-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const recordId = e.target.getAttribute('data-record-id');
                this.handleManualEstimate(recordId, true);
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
        const commissionInput = card.querySelector('.commission-input');
        
        const genreId = genreSelect.value;
        const sleeveConditionId = sleeveConditionSelect.value;
        const discConditionId = discConditionSelect.value;
        const price = parseFloat(priceInput.value);
        const consignorId = consignorSelect ? consignorSelect.value : this.selectedConsignorId;
        const commissionRate = commissionInput ? parseFloat(commissionInput.value) / 100 : this.selectedCommissionRate / 100;
        
        const errors = [];
        if (!genreId) errors.push('Please select a genre');
        if (!sleeveConditionId) errors.push('Please select a sleeve condition');
        if (!discConditionId) errors.push('Please select a disc condition');
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
        console.log('Sleeve Condition ID:', sleeveConditionId);
        console.log('Disc Condition ID:', discConditionId);
        console.log('Final Price:', price);
        console.log('Consignor ID (from dropdown):', consignorId);
        console.log('Commission Rate (from dropdown):', commissionRate);
        
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
            commission_rate: commissionRate,
            status_id: 1,
        };
        
        console.log('Sending to /records endpoint:', recordData);
        
        try {
            const response = await APIUtils.post('/records', recordData);
            
            if (response.status === 'success') {
                let batchMessage = '';
                if (this.activeBatch) {
                    batchMessage = ` (added to active batch #${this.activeBatch.id})`;
                }
                
                showMessage(`Record added successfully! Barcode: ${pigstyleBarcode}. Price: $${price.toFixed(2)}${batchMessage}`, 'success');
                
                // Save artist to artist_genre table if it doesn't exist
                if (discogsRecord.artist && genreId) {
                    await this.genrePredictor.saveArtistGenre(discogsRecord.artist, genreId, genreName);
                }
                
                await this.loadStats();
                
                // Refresh active batch stats if there is one
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
        const priceInput = card.querySelector('.edit-price-input');
        const statusSelect = card.querySelector('.edit-status-select');
        const consignorSelect = card.querySelector('.edit-consignor-select');
        const commissionInput = card.querySelector('.edit-commission-input');
        
        const updates = {};
        
        if (genreSelect && genreSelect.value) {
            updates.genre_id = parseInt(genreSelect.value);
        }
        
        if (sleeveConditionSelect && sleeveConditionSelect.value) {
            updates.condition_sleeve_id = parseInt(sleeveConditionSelect.value);
        }
        
        if (discConditionSelect && discConditionSelect.value) {
            updates.condition_disc_id = parseInt(discConditionSelect.value);
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
        
        if (consignorSelect && consignorSelect.value) {
            updates.consignor_id = parseInt(consignorSelect.value);
        } else if (consignorSelect && consignorSelect.value === '') {
            updates.consignor_id = null;
        }
        
        if (commissionInput && commissionInput.value) {
            const commissionRate = parseFloat(commissionInput.value) / 100;
            if (!isNaN(commissionRate) && commissionRate >= 0 && commissionRate <= 1) {
                updates.commission_rate = commissionRate;
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
                let updatedPrice = updates.store_price;
                
                if (response.record && response.record.store_price) {
                    updatedPrice = response.record.store_price;
                } else if (response.store_price) {
                    updatedPrice = response.store_price;
                } else if (response.data && response.data.store_price) {
                    updatedPrice = response.data.store_price;
                }
                
                showMessage(`Record updated successfully! Price: $${(updatedPrice || 0).toFixed(2)}`, 'success');
                
                const currentSearch = document.getElementById('searchInput').value;
                if (currentSearch) {
                    await this.performSearch(currentSearch);
                }
                await this.loadStats();
            } else {
                showMessage(`Error: ${response.error || response.message || 'Failed to update record'}`, 'error');
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