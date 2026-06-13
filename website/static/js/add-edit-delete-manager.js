// ============================================================================
// add-edit-delete-manager.js - Add/Edit/Delete Tab Functionality
// ============================================================================
// PRICE ESTIMATION: Uses /api/price-estimate-v3 (Discogs-only algorithm)
// SALES HISTORY: Shows artist-level and title-level sales history
// ============================================================================

class AddEditDeleteManager {
    constructor() {
        this.currentSearchType = 'add';
        this.currentSearchField = 'all';
        this.currentResults = [];
        this.conditions = [];
        this.statuses = [];
        this.consignors = [];
        this.minimumPrice = null;
        this.selectedConsignorId = null;
        this.defaultSleeveConditionId = null;
        this.defaultDiscConditionId = null;
        this.defaultNotes = null;
        this.defaultCogs = null;
        this.autoEstimatePrice = true;
        this.storePriceMultiplier = null;
        
        this.init();
    }

    async init() {
        await this.loadMinimumPrice();
        await this.loadStats();
        await this.loadConditions();
        await this.loadConsignors();
        await this.loadStatuses();
        await this.loadStorePriceMultiplier();
        await this.loadCommissionRate();
        this.loadSavedSettings();
        this.setupEventListeners();
        this.renderGlobalSettings();
    }

    async loadStatuses() {
        try {
            const response = await APIUtils.get('/statuses');
            if (response && response.statuses) {
                this.statuses = response.statuses;
                console.log('LOAD_STATUSES: Statuses loaded from database:', this.statuses);
            } else {
                this.statuses = [];
            }
        } catch (error) {
            console.error('Error loading statuses:', error);
            this.statuses = [];
        }
    }

    async loadStorePriceMultiplier() {
        try {
            const response = await APIUtils.get('/config/STORE_PRICE_ESTIMATED_MULTIPLIER');
            if (!response || response.config_value === null) {
                throw new Error('STORE_PRICE_ESTIMATED_MULTIPLIER not configured');
            }
            this.storePriceMultiplier = parseFloat(response.config_value);
            console.log(`STORE_PRICE_MULTIPLIER: Loaded: ${this.storePriceMultiplier}`);
        } catch (error) {
            console.error('Failed to load STORE_PRICE_ESTIMATED_MULTIPLIER:', error);
            showMessage('Store price multiplier not configured. Please set it in Admin Config.', 'error');
            this.storePriceMultiplier = null;
        }
    }

    async saveStorePriceMultiplier() {
        const input = document.getElementById('store-price-multiplier-input');
        if (!input) return;
        
        const multiplier = parseFloat(input.value);
        if (isNaN(multiplier) || multiplier < 0.01 || multiplier > 1.00) {
            showMessage('Ratio must be between 0.01 and 1.00', 'error');
            return;
        }
        
        try {
            const response = await APIUtils.put('/config/STORE_PRICE_ESTIMATED_MULTIPLIER', {
                config_value: multiplier.toString()
            });
            
            if (response.status === 'success') {
                this.storePriceMultiplier = multiplier;
                showMessage(`Store price ratio saved: ${(multiplier * 100).toFixed(0)}%`, 'success');
            } else {
                showMessage('Error saving ratio', 'error');
            }
        } catch (error) {
            console.error('Error saving multiplier:', error);
            showMessage('Error saving ratio', 'error');
        }
    }

    async loadCommissionRate() {
        try {
            const response = await APIUtils.get('/api/commission-rate');
            if (response && response.commission_rate_percent) {
                const commissionElement = document.getElementById('commission-rate');
                if (commissionElement) {
                    commissionElement.textContent = response.commission_rate_percent;
                }
                console.log(`💰 Commission rate loaded: ${response.commission_rate_percent} (${response.store_fill_percentage}% full)`);
            } else {
                throw new Error('Invalid response');
            }
        } catch (error) {
            console.error('Error loading commission rate:', error);
            const commissionElement = document.getElementById('commission-rate');
            if (commissionElement) {
                commissionElement.textContent = 'N/A';
            }
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
            if (!response || response.config_value === null) {
                throw new Error('MIN_STORE_PRICE not configured');
            }
            this.minimumPrice = parseFloat(response.config_value);
            console.log(`MIN_PRICE: Minimum store price loaded: $${this.minimumPrice.toFixed(2)}`);
        } catch (error) {
            console.error('Failed to load MIN_STORE_PRICE:', error);
            showMessage('Minimum store price not configured. Please set it in Admin Config.', 'error');
            this.minimumPrice = null;
        }
    }
    
    async loadStats() {
        try {
            const response = await APIUtils.get('/records/count');
            const recordsCount = response.count || 0;
            document.getElementById('total-records').textContent = recordsCount;
            
            const newResponse = await APIUtils.get('/records/count?status_id=1');
            const newCount = newResponse.count || 0;
            document.getElementById('new-records-count').textContent = newCount;

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
            
            const savedSleeveCondition = localStorage.getItem('add_record_default_sleeve_condition_id');
            if (savedSleeveCondition) {
                this.defaultSleeveConditionId = parseInt(savedSleeveCondition);
                console.log('LOAD_SETTINGS: Loaded default sleeve condition ID:', this.defaultSleeveConditionId);
            }
            
            const savedDiscCondition = localStorage.getItem('add_record_default_disc_condition_id');
            if (savedDiscCondition) {
                this.defaultDiscConditionId = parseInt(savedDiscCondition);
                console.log('LOAD_SETTINGS: Loaded default disc condition ID:', this.defaultDiscConditionId);
            }
            
            const savedDefaultNotes = localStorage.getItem('add_record_default_notes');
            if (savedDefaultNotes !== null) {
                this.defaultNotes = savedDefaultNotes;
                console.log('LOAD_SETTINGS: Loaded default notes:', this.defaultNotes);
            }
            
            const savedDefaultCogs = localStorage.getItem('add_record_default_cogs');
            if (savedDefaultCogs !== null && savedDefaultCogs !== '') {
                this.defaultCogs = parseFloat(savedDefaultCogs);
                console.log('LOAD_SETTINGS: Loaded default COGS:', this.defaultCogs);
            } else {
                this.defaultCogs = null;
            }
            
            const savedAutoEstimate = localStorage.getItem('add_record_auto_estimate');
            if (savedAutoEstimate !== null) {
                this.autoEstimatePrice = savedAutoEstimate === 'true';
            }
            
            console.log('LOAD_SETTINGS: Loaded consignor ID:', this.selectedConsignorId);
            console.log('LOAD_SETTINGS: Auto estimate price:', this.autoEstimatePrice);
            console.log('LOAD_SETTINGS: Default notes:', this.defaultNotes);
            console.log('LOAD_SETTINGS: Default COGS:', this.defaultCogs);
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
            
            if (this.defaultSleeveConditionId) {
                localStorage.setItem('add_record_default_sleeve_condition_id', this.defaultSleeveConditionId.toString());
            } else {
                localStorage.removeItem('add_record_default_sleeve_condition_id');
            }
            
            if (this.defaultDiscConditionId) {
                localStorage.setItem('add_record_default_disc_condition_id', this.defaultDiscConditionId.toString());
            } else {
                localStorage.removeItem('add_record_default_disc_condition_id');
            }
            
            if (this.defaultNotes) {
                localStorage.setItem('add_record_default_notes', this.defaultNotes);
            } else {
                localStorage.removeItem('add_record_default_notes');
            }
            
            if (this.defaultCogs !== null && this.defaultCogs !== '') {
                localStorage.setItem('add_record_default_cogs', this.defaultCogs.toString());
            } else {
                localStorage.removeItem('add_record_default_cogs');
            }
            
            localStorage.setItem('add_record_auto_estimate', this.autoEstimatePrice.toString());
            
            console.log('SAVE_SETTINGS: Saved consignor ID:', this.selectedConsignorId);
            console.log('SAVE_SETTINGS: Saved sleeve condition ID:', this.defaultSleeveConditionId);
            console.log('SAVE_SETTINGS: Saved disc condition ID:', this.defaultDiscConditionId);
            console.log('SAVE_SETTINGS: Saved default notes:', this.defaultNotes);
            console.log('SAVE_SETTINGS: Saved default COGS:', this.defaultCogs);
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
        
        const conditionOptions = this.conditions.map(condition => {
            const selected = condition.id === this.defaultSleeveConditionId ? 'selected' : '';
            return `<option value="${condition.id}" ${selected}>${condition.display_name || condition.condition_name}</option>`;
        }).join('');
        
        const discConditionOptions = this.conditions.map(condition => {
            const selected = condition.id === this.defaultDiscConditionId ? 'selected' : '';
            return `<option value="${condition.id}" ${selected}>${condition.display_name || condition.condition_name}</option>`;
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
            display: block;
        `;
        content.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                <div>
                    <label for="global-consignor-select" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-user"></i> Default Consignor
                    </label>
                    <select id="global-consignor-select" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; color: #333;">
                        <option value="">No default consignor</option>
                        ${consignorOptions}
                    </select>
                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                        Preselected consignor for new records
                    </div>
                </div>
                
                <div>
                    <label for="global-sleeve-condition-select" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-album"></i> Default Sleeve Condition
                    </label>
                    <select id="global-sleeve-condition-select" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; color: #333;">
                        <option value="">No default sleeve condition</option>
                        ${conditionOptions}
                    </select>
                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                        When changed, disc condition automatically mirrors sleeve condition
                    </div>
                </div>
                
                <div>
                    <label for="global-disc-condition-select" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-compact-disc"></i> Default Disc Condition
                    </label>
                    <select id="global-disc-condition-select" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; color: #333;">
                        <option value="">No default disc condition</option>
                        ${discConditionOptions}
                    </select>
                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                        Disc condition mirrors sleeve when sleeve changes
                    </div>
                </div>
                
                <div>
                    <label for="global-default-notes" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-comment"></i> Default Notes / Comment
                    </label>
                    <textarea id="global-default-notes" 
                              rows="2" 
                              style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; color: #333; resize: vertical;"
                              placeholder="Enter default notes for new records...">${this.escapeHtml(this.defaultNotes || '')}</textarea>
                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                        These notes will be pre-filled for every new record
                    </div>
                </div>
                
                <div>
                    <label for="global-default-cogs" style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-dollar-sign"></i> Default COGS (Cost)
                    </label>
                    <input type="number" 
                           id="global-default-cogs" 
                           step="0.01" 
                           min="0" 
                           value="${this.defaultCogs !== null ? this.defaultCogs.toFixed(2) : ''}" 
                           style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; color: #333;"
                           placeholder="Leave empty for no default COGS">
                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                        Optional - Cost of goods sold per record
                    </div>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-calculator"></i> Price Estimation
                    </label>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                            <input type="checkbox" id="auto-estimate-checkbox" ${this.autoEstimatePrice ? 'checked' : ''}>
                            <span>Auto-estimate when conditions change</span>
                        </label>
                    </div>
                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                        When disabled, you can still click "Estimate Price" button
                    </div>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 0.9rem; font-weight: 500; color: #333;">
                        <i class="fas fa-percent"></i> Store Price Ratio
                    </label>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="number" 
                               id="store-price-multiplier-input" 
                               step="0.01" 
                               min="0.01" 
                               max="1.00" 
                               value="${this.storePriceMultiplier ? this.storePriceMultiplier.toFixed(2) : '0.70'}" 
                               style="width: 80px; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px;">
                        <button class="btn btn-small btn-info" id="save-multiplier-btn" style="padding: 4px 10px; font-size: 12px;">
                            <i class="fas fa-save"></i> Save
                        </button>
                    </div>
                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                        Market price × ratio = store price (0.70 = 70%)
                    </div>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #dee2e6;">
                <p style="margin: 0; font-size: 0.85rem; color: #666;">
                    <i class="fas fa-save"></i> These settings will be automatically applied to all new records until you change them
                </p>
                <button class="btn btn-small" id="clear-defaults-btn" style="background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-undo"></i> Clear All Defaults
                </button>
            </div>
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
        
        document.getElementById('global-sleeve-condition-select').addEventListener('change', (e) => {
            const value = e.target.value;
            this.defaultSleeveConditionId = value ? parseInt(value) : null;
            this.saveSettings();
            showMessage(`Default sleeve condition updated`, 'success');
        });
        
        document.getElementById('global-disc-condition-select').addEventListener('change', (e) => {
            const value = e.target.value;
            this.defaultDiscConditionId = value ? parseInt(value) : null;
            this.saveSettings();
            showMessage(`Default disc condition updated`, 'success');
        });
        
        document.getElementById('global-default-notes').addEventListener('change', (e) => {
            this.defaultNotes = e.target.value;
            this.saveSettings();
            showMessage(`Default notes updated`, 'success');
        });
        
        document.getElementById('global-default-cogs').addEventListener('change', (e) => {
            const value = e.target.value;
            if (value === '' || value === null) {
                this.defaultCogs = null;
            } else {
                const cogsValue = parseFloat(value);
                if (!isNaN(cogsValue) && cogsValue >= 0) {
                    this.defaultCogs = cogsValue;
                } else {
                    this.defaultCogs = null;
                }
            }
            this.saveSettings();
            showMessage(`Default COGS updated`, 'success');
        });
        
        document.getElementById('auto-estimate-checkbox').addEventListener('change', (e) => {
            this.autoEstimatePrice = e.target.checked;
            this.saveSettings();
            showMessage(`Auto-estimate ${this.autoEstimatePrice ? 'enabled' : 'disabled'}`, 'success');
        });
        
        const saveMultiplierBtn = document.getElementById('save-multiplier-btn');
        if (saveMultiplierBtn) {
            saveMultiplierBtn.addEventListener('click', () => this.saveStorePriceMultiplier());
        }
        
        document.getElementById('clear-defaults-btn').addEventListener('click', () => {
            this.selectedConsignorId = null;
            this.defaultSleeveConditionId = null;
            this.defaultDiscConditionId = null;
            this.defaultNotes = null;
            this.defaultCogs = null;
            this.autoEstimatePrice = true;
            this.saveSettings();
            
            document.getElementById('global-consignor-select').value = '';
            document.getElementById('global-sleeve-condition-select').value = '';
            document.getElementById('global-disc-condition-select').value = '';
            document.getElementById('global-default-notes').value = '';
            document.getElementById('global-default-cogs').value = '';
            document.getElementById('auto-estimate-checkbox').checked = true;
            
            showMessage('All default settings cleared', 'success');
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
        resultsContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><p>Searching...</p></div>';

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
            const isNumeric = /^\d+$/.test(searchTerm);
            
            let params = { q: searchTerm };
            
            if (this.currentSearchField !== 'all') {
                params.search_field = this.currentSearchField;
            }
            
            if (this.currentSearchField === 'barcode') {
                params.search_field = 'barcode';
                const response = await APIUtils.get('/records/search', params);
                return (response.status === 'success' && response.records) ? response.records : [];
            }
            
            if (isNumeric && this.currentSearchField === 'all') {
                try {
                    const idResponse = await APIUtils.get(`/records/${parseInt(searchTerm)}`);
                    if (idResponse && idResponse.id) {
                        return [idResponse];
                    }
                } catch (error) {
                    console.log('Not found by ID, trying barcode...');
                }
                
                const barcodeParams = { q: searchTerm, search_field: 'barcode' };
                const barcodeResponse = await APIUtils.get('/records/search', barcodeParams);
                if (barcodeResponse.status === 'success' && barcodeResponse.records && barcodeResponse.records.length > 0) {
                    return barcodeResponse.records;
                }
            }
            
            const response = await APIUtils.get('/records/search', params);
            return (response.status === 'success' && response.records) ? response.records : [];
            
        } catch (error) {
            console.error('Error searching database:', error);
            return [];
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
        
        const conditionOptions = this.conditions.map(condition => {
            return `<option value="${condition.id}">${condition.display_name || condition.condition_name}</option>`;
        }).join('');
        
        const consignorOptions = this.consignors.map(consignor => {
            const selected = consignor.id === this.selectedConsignorId ? 'selected' : '';
            return `<option value="${consignor.id}" ${selected}>${consignor.username}${consignor.flag_color ? ` (${consignor.flag_color})` : ''}</option>`;
        }).join('');
        
        const escapedDefaultNotes = this.escapeHtml(this.defaultNotes || '');
        const defaultCogsValue = this.defaultCogs !== null ? this.defaultCogs.toFixed(2) : '';
        
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
                
                const discogsGenreRaw = record.genre_raw || '';
                const catalogNumber = record.catalog_number || '';
                
                const defaultSleeveSelected = this.defaultSleeveConditionId ? this.defaultSleeveConditionId : '';
                const defaultDiscSelected = this.defaultDiscConditionId ? this.defaultDiscConditionId : '';
                
                return `
                    <div class="record-card" data-record-id="${record.discogs_id || record.id}" data-index="${index}" data-artist="${record.artist}" data-format="${record.format || ''}" data-catalog="${catalogNumber}" data-title="${record.title}">
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
                                    ${discogsGenreRaw ? `<span><strong>Discogs Genre:</strong> ${discogsGenreRaw}</span>` : ''}
                                    ${record.format ? `<span><strong>Format:</strong> ${record.format}</span>` : ''}
                                    ${record.country ? `<span><strong>Country:</strong> ${record.country}</span>` : ''}
                                    ${catalogNumber ? `<span><strong>Catalog #:</strong> ${catalogNumber}</span>` : ''}
                                    ${discogsIdentifiers ? `<span style="grid-column: span 2;"><strong>Identifiers:</strong> ${discogsIdentifiers.substring(0, 100)}${discogsIdentifiers.length > 100 ? '...' : ''}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;">
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                <div>
                                    <label class="form-label">
                                        <i class="fas fa-album"></i> Sleeve Condition *
                                    </label>
                                    <select class="form-control sleeve-condition-select" required data-default="${defaultSleeveSelected}">
                                        <option value="">Select sleeve condition...</option>
                                        ${conditionOptions}
                                    </select>
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Disc condition will mirror this selection
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="form-label">
                                        <i class="fas fa-compact-disc"></i> Disc Condition *
                                    </label>
                                    <select class="form-control disc-condition-select" required data-default="${defaultDiscSelected}">
                                        <option value="">Select disc condition...</option>
                                        ${conditionOptions}
                                    </select>
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Mirrors sleeve condition when changed
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="form-label"><i class="fab fa-discogs"></i> Discogs Genre</label>
                                    <div class="form-control" style="background: #f8f9fa; cursor: default; min-height: 38px;">
                                        ${discogsGenreRaw || 'No genre information'}
                                    </div>
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Raw genre from Discogs - will be saved and printed on price tags
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="form-label">Price ($) *</label>
                                    <input type="number" 
                                           class="form-control price-input" 
                                           step="1" 
                                           ${this.minimumPrice ? `min="${this.minimumPrice}" placeholder="Min: $${this.minimumPrice.toFixed(2)}"` : 'placeholder="Enter price"'} 
                                           required
                                           autocomplete="off"
                                           autocomplete="new-password">
                                    <div class="price-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Step: $1.00
                                    </div>
                                    <button class="btn btn-sm btn-info estimate-now-btn" style="margin-top: 5px; font-size: 12px; display: ${this.autoEstimatePrice ? 'none' : 'inline-block'};">
                                        <i class="fas fa-calculator"></i> Estimate Price
                                    </button>
                                </div>
                                
                                <div>
                                    <label class="form-label">
                                        <i class="fas fa-dollar-sign"></i> COGS (Cost) $
                                    </label>
                                    <input type="number" 
                                           class="form-control cogs-input" 
                                           step="0.01" 
                                           min="0" 
                                           value="${defaultCogsValue}"
                                           placeholder="Optional - Cost of goods sold">
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Optional - Your cost for this record
                                    </div>
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
                                        <i class="fas fa-comment"></i> Notes / Comment (optional)
                                    </label>
                                    <textarea class="form-control notes-input" 
                                              rows="2" 
                                              placeholder="Add any notes about this record...&#10;Will be posted to Discogs if you list it later.">${escapedDefaultNotes}</textarea>
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Internal notes and visible on Discogs listing if posted
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="form-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                        <input type="checkbox" class="no-original-sleeve-checkbox">
                                        <i class="fas fa-exclamation-triangle" style="color: #ffc107;"></i>
                                        <span>No original sleeve</span>
                                    </label>
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Adds "[NO ORIGINAL SLEEVE]" to notes
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Price Calculation Container -->
                            <div id="calculation-${record.discogs_id || record.id}" class="calculation-container" style="margin-top: 15px;"></div>
                            
                            <!-- Sales History Container -->
                            <div id="sales-history-${record.discogs_id || record.id}" class="sales-history-container" style="margin-top: 10px;"></div>
                            
                            <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                                <button class="btn btn-primary add-record-btn">
                                    <i class="fas fa-plus"></i> Add to Inventory
                                </button>
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
                const selected = record && (record.status_id == status.id) ? 'selected' : '';
                return `<option value="${status.id}" ${selected}>${status.status_name}</option>`;
            }).join('');
        };
        
        const consignorOptions = this.consignors.map(consignor => {
            return `<option value="${consignor.id}">${consignor.username}${consignor.flag_color ? ` (${consignor.flag_color})` : ''}</option>`;
        }).join('');
        
        return `
            <h3>Database Results (${filteredResults.length})</h3>
             
            ${filteredResults.map((record, index) => {
                const currentConsignorId = record.consignor_id || '';
                const currentCogs = record.cogs !== null && record.cogs !== undefined ? parseFloat(record.cogs).toFixed(2) : '';
                
                const sleeveCondition = this.conditions.find(c => c.id == record.condition_sleeve_id);
                const discCondition = this.conditions.find(c => c.id == record.condition_disc_id);
                const sleeveDisplay = sleeveCondition ? sleeveCondition.display_name || sleeveCondition.condition_name : 'Not set';
                const discDisplay = discCondition ? discCondition.display_name || discCondition.condition_name : 'Not set';
                
                const locationDisplay = record.location && record.location.trim() !== '' 
                    ? record.location 
                    : '<span style="color: #999;">Not set</span>';
                
                const notes = record.notes || '';
                const hasNoOriginalSleeve = notes.includes('[NO ORIGINAL SLEEVE]');
                const notesWithoutTag = notes.replace('[NO ORIGINAL SLEEVE]', '').trim();
                
                const discogsGenreRaw = record.discogs_genre_raw || '';
                
                const notesDisplay = notes ? `
                    <div style="margin-top: 5px; font-size: 12px; color: #666; background: #f8f9fa; padding: 4px 8px; border-radius: 4px;">
                        <i class="fas fa-comment"></i> ${this.escapeHtml(notes)}
                    </div>
                ` : '';
                
                return `
                    <div class="record-card" data-record-id="${record.id}" data-index="${index}" data-catalog="${record.catalog_number || ''}" data-artist="${record.artist}" data-title="${record.title}">
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
                                    <span><strong>Barcode:</strong> <span class="barcode-value">${record.barcode || record.id}</span></span>
                                    <span><strong>Catalog #:</strong> ${record.catalog_number || 'None'}</span>
                                    <span><strong>Price:</strong> $${(record.store_price || 0).toFixed(2)}</span>
                                    <span><strong>COGS:</strong> ${record.cogs ? `$${parseFloat(record.cogs).toFixed(2)}` : 'Not set'}</span>
                                    <span><strong>Sleeve:</strong> ${sleeveDisplay}</span>
                                    <span><strong>Disc:</strong> ${discDisplay}</span>
                                    <span><strong>Location:</strong> ${locationDisplay}</span>
                                    ${discogsGenreRaw ? `<span><strong>Discogs Genre:</strong> ${discogsGenreRaw.substring(0, 50)}${discogsGenreRaw.length > 50 ? '...' : ''}</span>` : ''}
                                </div>
                                ${notesDisplay}
                            </div>
                        </div>
                        
                        <div id="calculation-${record.id}" class="calculation-container" style="margin: 15px 0;"></div>
                        <div id="sales-history-${record.id}" class="sales-history-container" style="margin: 10px 0;"></div>
                        
                        <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;">
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                <div>
                                    <label class="form-label"><i class="fab fa-discogs"></i> Discogs Genre</label>
                                    <div class="form-control" style="background: #f8f9fa; cursor: default; min-height: 38px;">
                                        ${discogsGenreRaw || 'No genre information'}
                                    </div>
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
                                        Mirrors sleeve condition when changed
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="form-label">Location</label>
                                    <input type="text" 
                                           class="form-control edit-location-input" 
                                           data-record-id="${record.id}"
                                           value="${this.escapeHtml(record.location || '')}" 
                                           placeholder="e.g., bin 1/12, shelf A/3">
                                </div>
                                
                                <div>
                                    <label class="form-label">Notes</label>
                                    <textarea class="form-control edit-notes-input" 
                                              data-record-id="${record.id}"
                                              rows="2"
                                              placeholder="Internal notes and Discogs listing comments"
                                              style="resize: vertical;">${this.escapeHtml(notesWithoutTag)}</textarea>
                                </div>
                                
                                <div>
                                    <label class="form-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                        <input type="checkbox" class="edit-no-original-sleeve-checkbox" data-record-id="${record.id}" ${hasNoOriginalSleeve ? 'checked' : ''}>
                                        <i class="fas fa-exclamation-triangle" style="color: #ffc107;"></i>
                                        <span>No original sleeve</span>
                                    </label>
                                </div>
                                
                                <div>
                                    <label class="form-label">Price ($)</label>
                                    <input type="number" 
                                           class="form-control edit-price-input" 
                                           data-record-id="${record.id}"
                                           value="${record.store_price || ''}" 
                                           step="1" 
                                           ${this.minimumPrice ? `min="${this.minimumPrice}" placeholder="Min: $${this.minimumPrice.toFixed(2)}"` : 'placeholder="Enter price"'}
                                           autocomplete="off"
                                           autocomplete="new-password">
                                    <button class="btn btn-sm btn-info edit-estimate-now-btn" style="margin-top: 5px; font-size: 12px; display: ${this.autoEstimatePrice ? 'none' : 'inline-block'};" data-record-id="${record.id}">
                                        <i class="fas fa-calculator"></i> Estimate Price
                                    </button>
                                </div>
                                
                                <div>
                                    <label class="form-label">COGS ($)</label>
                                    <input type="number" 
                                           class="form-control edit-cogs-input" 
                                           data-record-id="${record.id}"
                                           value="${currentCogs}" 
                                           step="0.01" 
                                           min="0"
                                           placeholder="Cost of goods sold">
                                    <div class="form-hint" style="font-size: 11px; color: #666; margin-top: 3px;">
                                        Your cost for this record
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="form-label">Consignor</label>
                                    <select class="form-control edit-consignor-select" data-record-id="${record.id}">
                                        <option value="">None</option>
                                        ${consignorOptions}
                                    </select>
                                </div>
                                
                                ${userRole === 'admin' ? `
                                <div>
                                    <label class="form-label">Status</label>
                                    <select class="form-control edit-status-select" data-record-id="${record.id}">
                                        <option value="">Select status...</option>
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

    async handleSleeveConditionChange(event, isEditMode = false) {
        const selectElement = event.target;
        const card = selectElement.closest('.record-card');
        const recordId = card.getAttribute('data-record-id');
        const sleeveConditionId = selectElement.value;
        
        const discSelect = card.querySelector(isEditMode ? '.edit-disc-condition-select' : '.disc-condition-select');
        
        if (discSelect && sleeveConditionId) {
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
        
        // Fetch sales history when conditions are selected
        if (sleeveConditionId && discConditionId) {
            await this.fetchAndDisplaySalesHistory(record, card);
        }
        
        if (sleeveConditionId && discConditionId && this.autoEstimatePrice && this.storePriceMultiplier !== null) {
            await this.estimatePriceWithNewEndpoint(record, sleeveConditionId, discConditionId, card, recordId, isEditMode);
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
        
        // Fetch sales history when conditions are selected
        if (sleeveConditionId && discConditionId) {
            await this.fetchAndDisplaySalesHistory(record, card);
        }
        
        if (sleeveConditionId && discConditionId && this.autoEstimatePrice && this.storePriceMultiplier !== null) {
            await this.estimatePriceWithNewEndpoint(record, sleeveConditionId, discConditionId, card, recordId, isEditMode);
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
        
        await this.fetchAndDisplaySalesHistory(record, card);
        await this.estimatePriceWithNewEndpoint(record, sleeveConditionId, discConditionId, card, recordId, isEditMode);
    }

    // ============================================================================
    // SALES HISTORY - Artist level + Title level
    // ============================================================================
    async fetchAndDisplaySalesHistory(record, card) {
        const artist = card.getAttribute('data-artist') || record.artist || '';
        const title = card.getAttribute('data-title') || record.title || '';
        
        if (!artist) {
            console.log('Cannot fetch sales history: missing artist');
            return;
        }
        
        const containerId = `sales-history-${record.discogs_id || record.id}`;
        const container = document.getElementById(containerId);
        
        if (!container) return;
        
        // Show loading
        container.innerHTML = '<div style="padding: 10px; background: #f0f0f0; border-radius: 4px; font-size: 12px;"><i class="fas fa-spinner fa-spin"></i> Loading sales history...</div>';
        
        try {
            const response = await APIUtils.post('/api/stats/sales-history', {
                artist: artist,
                title: title
            });
            
            if (response.status === 'success') {
                this.displaySalesHistory(container, response);
            } else {
                container.innerHTML = `<div style="padding: 10px; background: #fff3cd; border-radius: 4px; font-size: 12px; color: #856404;">
                    <i class="fas fa-exclamation-triangle"></i> Error loading sales history: ${response.error || 'Unknown error'}
                </div>`;
            }
        } catch (error) {
            console.error('Error fetching sales history:', error);
            container.innerHTML = `<div style="padding: 10px; background: #f8d7da; border-radius: 4px; font-size: 12px; color: #721c24;">
                <i class="fas fa-exclamation-triangle"></i> Failed to load sales history
            </div>`;
        }
    }
    
    displaySalesHistory(container, data) {
        const artistStats = data.artist_stats;
        const titleStats = data.title_stats;
        const hasTitle = data.title && data.title !== '';
        
        // Artist level stats
        const artistTotalSold = artistStats.total_sold;
        
        if (artistTotalSold === 0) {
            container.innerHTML = `<div style="padding: 10px; background: #e9ecef; border-radius: 4px; font-size: 12px; color: #666;">
                <i class="fas fa-chart-line"></i> No sales history for "${this.escapeHtml(data.artist)}"
            </div>`;
            return;
        }
        
        // Build top titles HTML
        let topTitlesHtml = '';
        if (artistStats.top_titles && artistStats.top_titles.length > 0) {
            topTitlesHtml = '<div style="margin-top: 8px;"><strong>Top Selling Titles:</strong><ul style="margin: 5px 0 0 20px; font-size: 11px;">';
            for (const title of artistStats.top_titles) {
                topTitlesHtml += `<li><strong>${this.escapeHtml(title.title)}</strong>: ${title.sold_count} sold (avg $${title.avg_price})</li>`;
            }
            topTitlesHtml += '</ul></div>';
        }
        
        // Build title-level HTML if title exists
        let titleLevelHtml = '';
        if (hasTitle && titleStats.total_sold > 0) {
            let conditionBreakdownHtml = '';
            if (titleStats.condition_breakdown && titleStats.condition_breakdown.length > 0) {
                conditionBreakdownHtml = '<div style="margin-top: 8px;"><strong>By Condition:</strong><div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px;">';
                for (const cond of titleStats.condition_breakdown) {
                    const percent = Math.round((cond.sold_count / titleStats.total_sold) * 100);
                    conditionBreakdownHtml += `<span style="background: #e9ecef; padding: 2px 8px; border-radius: 12px; font-size: 11px;">
                        ${cond.display_name || cond.condition_name}: ${cond.sold_count} (${percent}%)
                    </span>`;
                }
                conditionBreakdownHtml += '</div></div>';
            }
            
            let recentSalesHtml = '';
            if (titleStats.recent_sales && titleStats.recent_sales.length > 0) {
                recentSalesHtml = '<div style="margin-top: 8px;"><strong>Recent Sales:</strong><ul style="margin: 5px 0 0 20px; font-size: 11px;">';
                for (const sale of titleStats.recent_sales.slice(0, 3)) {
                    recentSalesHtml += `<li>${sale.date_sold}: $${sale.price} (${sale.condition})</li>`;
                }
                if (titleStats.recent_sales.length > 3) {
                    recentSalesHtml += `<li><em>+${titleStats.recent_sales.length - 3} more...</em></li>`;
                }
                recentSalesHtml += '</ul></div>';
            }
            
            titleLevelHtml = `
                <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ccc;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <strong><i class="fas fa-record-vinyl"></i> "${this.escapeHtml(data.title)}"</strong>
                            <span style="margin-left: 8px; font-size: 14px; font-weight: bold; color: #28a745;">${titleStats.total_sold} sold</span>
                        </div>
                        <div style="font-size: 11px; color: #666;">
                            Last sold: ${titleStats.last_sold_date || 'Never'}
                        </div>
                    </div>
                    <div style="margin-top: 8px; display: flex; gap: 15px; flex-wrap: wrap;">
                        <span><strong>Avg Price:</strong> $${titleStats.avg_sold_price || 'N/A'}</span>
                        <span><strong>Price Range:</strong> $${titleStats.min_sold_price || 'N/A'} - $${titleStats.max_sold_price || 'N/A'}</span>
                        <span><strong>Total Revenue:</strong> $${titleStats.total_revenue || '0'}</span>
                    </div>
                    ${conditionBreakdownHtml}
                    ${recentSalesHtml}
                </div>
            `;
        } else if (hasTitle && titleStats.total_sold === 0) {
            titleLevelHtml = `
                <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ccc;">
                    <div style="color: #999; font-size: 12px;">
                        <i class="fas fa-info-circle"></i> No sales yet for "${this.escapeHtml(data.title)}"
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div style="padding: 12px; background: #e8f4fd; border-left: 4px solid #007bff; border-radius: 4px; font-size: 12px;">
                <!-- Artist Level -->
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <strong><i class="fas fa-user"></i> ${this.escapeHtml(data.artist)}</strong>
                            <span style="margin-left: 8px; font-size: 16px; font-weight: bold; color: #28a745;">${artistTotalSold} total sales</span>
                        </div>
                        <div style="font-size: 11px; color: #666;">
                            Last sold: ${artistStats.last_sold_date || 'Never'}
                        </div>
                    </div>
                    <div style="margin-top: 8px; display: flex; gap: 15px; flex-wrap: wrap;">
                        <span><strong>Avg Price:</strong> $${artistStats.avg_sold_price || 'N/A'}</span>
                        <span><strong>Price Range:</strong> $${artistStats.min_sold_price || 'N/A'} - $${artistStats.max_sold_price || 'N/A'}</span>
                        <span><strong>Unique Titles:</strong> ${artistStats.unique_titles}</span>
                        <span><strong>Total Revenue:</strong> $${artistStats.total_revenue || '0'}</span>
                    </div>
                    ${topTitlesHtml}
                </div>
                ${titleLevelHtml}
            </div>
        `;
    }

    // ============================================================================
    // PRICE ESTIMATION - Uses /api/price-estimate-v3
    // ============================================================================
    async estimatePriceWithNewEndpoint(record, sleeveConditionId, discConditionId, card, recordId, isEditMode) {
        let priceInput;
        if (isEditMode) {
            priceInput = card.querySelector('.edit-price-input');
        } else {
            priceInput = card.querySelector('.price-input');
        }
        
        if (!priceInput) return;
        
        if (this.storePriceMultiplier === null) {
            showMessage('Store price multiplier not configured. Please set it in Admin Config.', 'error');
            return;
        }
        
        if (this.minimumPrice === null) {
            showMessage('Minimum store price not configured. Please set it in Admin Config.', 'error');
            return;
        }
        
        // Get condition names from IDs
        const sleeveCond = this.conditions.find(c => c.id == sleeveConditionId);
        const discCond = this.conditions.find(c => c.id == discConditionId);
        
        if (!sleeveCond || !discCond) {
            showMessage('Invalid condition selected', 'error');
            return;
        }
        
        const mediaConditionName = discCond.display_name || discCond.condition_name;
        const sleeveConditionName = sleeveCond.display_name || sleeveCond.condition_name;
        
        // Get catalog number from card
        const catalogNumber = card.getAttribute('data-catalog') || record.catalog_number || '';
        
        if (!catalogNumber) {
            showMessage('Catalog number is required for price estimation', 'error');
            return;
        }
        
        console.log('Estimating price with new endpoint:', {
            catalog_number: catalogNumber,
            media_condition: mediaConditionName,
            sleeve_condition: sleeveConditionName
        });
        
        priceInput.disabled = true;
        
        try {
            const response = await APIUtils.post('/api/price-estimate-v3', {
                catalog_number: catalogNumber,
                media_condition: mediaConditionName,
                sleeve_condition: sleeveConditionName
            });
            
            priceInput.disabled = false;
            
            if (response.status === 'success' && response.estimated_price) {
                const estimatedPrice = response.estimated_price;
                
                // Apply store price multiplier
                let finalPrice = estimatedPrice * this.storePriceMultiplier;
                
                // Round down to .99
                const dollars = Math.floor(finalPrice);
                if (dollars < 1) {
                    finalPrice = 0.99;
                } else {
                    finalPrice = (dollars - 1) + 0.99;
                }
                
                // Apply minimum price
                finalPrice = Math.max(finalPrice, this.minimumPrice);
                
                priceInput.value = finalPrice.toFixed(2);
                priceInput.classList.add('price-estimated');
                
                console.log(`Price estimated: $${finalPrice.toFixed(2)} (base: $${estimatedPrice})`);
            } else {
                showMessage(response.error || 'Price estimation failed. Please enter manually.', 'error');
            }
        } catch (error) {
            priceInput.disabled = false;
            console.error('Price estimate error:', error);
            showMessage('Price estimation failed. Please enter manually.', 'error');
        }
    }

    addConditionChangeListeners() {
        document.querySelectorAll('.sleeve-condition-select').forEach(select => {
            const defaultValue = select.getAttribute('data-default');
            if (defaultValue && defaultValue !== '' && !select.value) {
                select.value = defaultValue;
                const card = select.closest('.record-card');
                const discSelect = card.querySelector('.disc-condition-select');
                if (discSelect && !discSelect.value) {
                    discSelect.value = defaultValue;
                }
            }
            select.addEventListener('change', (e) => this.handleSleeveConditionChange(e, false));
        });
        
        document.querySelectorAll('.disc-condition-select').forEach(select => {
            const defaultValue = select.getAttribute('data-default');
            if (defaultValue && defaultValue !== '' && !select.value) {
                select.value = defaultValue;
            }
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
        
        document.querySelectorAll('.no-original-sleeve-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const card = e.target.closest('.record-card');
                const notesTextarea = card.querySelector('.notes-input');
                const isChecked = e.target.checked;
                
                if (notesTextarea) {
                    let currentNotes = notesTextarea.value;
                    const tag = '[NO ORIGINAL SLEEVE]';
                    
                    if (isChecked) {
                        if (!currentNotes.includes(tag)) {
                            notesTextarea.value = currentNotes ? `${tag}\n${currentNotes}` : tag;
                        }
                    } else {
                        notesTextarea.value = currentNotes.replace(tag, '').replace(/^\n+/, '').replace(/\n+$/, '');
                    }
                }
            });
        });
        
        document.querySelectorAll('.edit-no-original-sleeve-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const card = e.target.closest('.record-card');
                const notesTextarea = card.querySelector('.edit-notes-input');
                const isChecked = e.target.checked;
                
                if (notesTextarea) {
                    let currentNotes = notesTextarea.value;
                    const tag = '[NO ORIGINAL SLEEVE]';
                    
                    if (isChecked) {
                        if (!currentNotes.includes(tag)) {
                            notesTextarea.value = currentNotes ? `${tag}\n${currentNotes}` : tag;
                        }
                    } else {
                        notesTextarea.value = currentNotes.replace(tag, '').replace(/^\n+/, '').replace(/\n+$/, '');
                    }
                }
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
        const sleeveConditionSelect = card.querySelector('.sleeve-condition-select');
        const discConditionSelect = card.querySelector('.disc-condition-select');
        const priceInput = card.querySelector('.price-input');
        const cogsInput = card.querySelector('.cogs-input');
        const consignorSelect = card.querySelector('.consignor-select');
        const notesInput = card.querySelector('.notes-input');
        const noSleeveCheckbox = card.querySelector('.no-original-sleeve-checkbox');
        
        const sleeveConditionId = sleeveConditionSelect.value;
        const discConditionId = discConditionSelect.value;
        const price = parseFloat(priceInput.value);
        const cogs = cogsInput && cogsInput.value ? parseFloat(cogsInput.value) : null;
        const consignorId = consignorSelect ? consignorSelect.value : this.selectedConsignorId;
        let notes = notesInput ? notesInput.value.trim() : '';
        
        if (this.defaultNotes && (!notes || notes === '')) {
            notes = this.defaultNotes;
        }
        
        if (noSleeveCheckbox && noSleeveCheckbox.checked) {
            const tag = '[NO ORIGINAL SLEEVE]';
            if (!notes.includes(tag)) {
                notes = notes ? `${tag}\n${notes}` : tag;
            }
        }
        
        const errors = [];
        if (!sleeveConditionId) errors.push('Please select a sleeve condition');
        if (!discConditionId) errors.push('Please select a disc condition');
        if (isNaN(price)) errors.push('Please enter a price');
        if (this.minimumPrice !== null && price < this.minimumPrice) {
            errors.push(`Price must be at least $${this.minimumPrice.toFixed(2)}`);
        }
        
        if (errors.length > 0) {
            showMessage(errors.join('. '), 'error');
            return;
        }
        
        const discogsGenreRaw = discogsRecord.genre_raw || '';
        
        const recordData = {
            artist: discogsRecord.artist,
            title: discogsRecord.title,
            discogs_genre_raw: discogsGenreRaw,
            image_url: discogsRecord.image_url || '',
            catalog_number: discogsRecord.catalog_number || '',
            condition_sleeve_id: parseInt(sleeveConditionId),
            condition_disc_id: parseInt(discConditionId),
            store_price: price,
            cogs: cogs,
            youtube_url: '',
            consignor_id: consignorId ? parseInt(consignorId) : null,
            status_id: 1,
            notes: notes || null
        };
        
        try {
            const response = await APIUtils.post('/records', recordData);
            
            if (response.status === 'success' && response.record) {
                const recordId = response.record.id;
                
                showMessage(`Record added successfully! Record ID: ${recordId}. Price: $${price.toFixed(2)}${cogs ? ` COGS: $${cogs.toFixed(2)}` : ''}`, 'success');
                
                await this.loadStats();
                
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
        
        const sleeveConditionSelect = card.querySelector('.edit-sleeve-condition-select');
        const discConditionSelect = card.querySelector('.edit-disc-condition-select');
        const locationInput = card.querySelector('.edit-location-input');
        const notesInput = card.querySelector('.edit-notes-input');
        const noSleeveCheckbox = card.querySelector('.edit-no-original-sleeve-checkbox');
        const priceInput = card.querySelector('.edit-price-input');
        const cogsInput = card.querySelector('.edit-cogs-input');
        const statusSelect = card.querySelector('.edit-status-select');
        const consignorSelect = card.querySelector('.edit-consignor-select');
        
        const updates = {};
        
        const currentRecord = this.currentResults.find(r => r.id == recordId);
        
        let notes = notesInput ? notesInput.value.trim() : '';
        if (noSleeveCheckbox && noSleeveCheckbox.checked) {
            const tag = '[NO ORIGINAL SLEEVE]';
            if (!notes.includes(tag)) {
                notes = notes ? `${tag}\n${notes}` : tag;
            }
        } else if (notes) {
            notes = notes.replace('[NO ORIGINAL SLEEVE]', '').replace(/^\n+/, '').replace(/\n+$/, '');
        }
        
        if (sleeveConditionSelect && sleeveConditionSelect.value) updates.condition_sleeve_id = parseInt(sleeveConditionSelect.value);
        if (discConditionSelect && discConditionSelect.value) updates.condition_disc_id = parseInt(discConditionSelect.value);
        if (locationInput) updates.location = locationInput.value.trim() || null;
        if (notes !== undefined && notes !== (currentRecord?.notes || '')) updates.notes = notes || null;
        
        if (priceInput) {
            const price = parseFloat(priceInput.value);
            if (!isNaN(price) && price >= 0) {
                if (this.minimumPrice !== null && price < this.minimumPrice) {
                    showMessage(`Price must be at least $${this.minimumPrice.toFixed(2)}`, 'error');
                    return;
                }
                updates.store_price = price;
            }
        }
        
        if (cogsInput) {
            const cogsValue = cogsInput.value.trim();
            if (cogsValue === '') {
                updates.cogs = null;
            } else {
                const cogs = parseFloat(cogsValue);
                if (!isNaN(cogs) && cogs >= 0) {
                    updates.cogs = cogs;
                }
            }
        }
        
        if (consignorSelect && consignorSelect.value) updates.consignor_id = parseInt(consignorSelect.value);
        else if (consignorSelect && consignorSelect.value === '') updates.consignor_id = null;
        
        if (statusSelect && statusSelect.value) {
            const newStatusId = parseInt(statusSelect.value);
            const oldStatusId = currentRecord?.status_id;
            
            updates.status_id = newStatusId;
            
            if ((newStatusId === 3 || newStatusId === 4) && oldStatusId !== newStatusId) {
                const todayMST = this.getMSTDate();
                updates.date_sold = todayMST;
                console.log(`Status changed to ${newStatusId}, setting date_sold to ${todayMST} (MST)`);
            }
            
            if ((oldStatusId === 3 || oldStatusId === 4) && newStatusId !== oldStatusId) {
                updates.date_sold = null;
                console.log(`Status changed away from sold, clearing date_sold`);
            }
        }
        
        if (Object.keys(updates).length === 0) {
            showMessage('No changes to save', 'info');
            return;
        }
        
        try {
            const response = await APIUtils.put(`/records/${recordId}`, updates);
            
            if (response.status === 'success') {
                showMessage(`Record updated successfully!`, 'success');
                
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

    getMSTDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'add-edit-delete') {
        if (!window.addEditDeleteManager) {
            window.addEditDeleteManager = new AddEditDeleteManager();
        } else {
            window.addEditDeleteManager.loadStorePriceMultiplier();
            window.addEditDeleteManager.loadCommissionRate();
        }
    }
});