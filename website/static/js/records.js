// Shared records component - used by both Shop and New
(function() {
    'use strict';

    // ===== DETECT ENVIRONMENT =====
    function getApiBase() {
        const hostname = window.location.hostname;
        const port = window.location.port;
        
        if (hostname === 'www.pigstylemusic.com' || hostname === 'pigstylemusic.com') {
            return '';
        }
        
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            if (port === '8000') {
                return 'http://localhost:5000';
            }
            if (port === '5000' || port === '5001') {
                return '';
            }
            return 'http://localhost:5000';
        }
        
        return '';
    }

    const API_BASE = getApiBase();
    console.log('🔧 Records API_BASE:', API_BASE || '(same origin)');

    // ===== FETCH LAST_SEEN_CUTOFF_DATE FROM CONFIG =====
    async function fetchLastSeenCutoff() {
        try {
            const response = await fetch(`${API_BASE}/config/LAST_SEEN_CUTOFF_DATE`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                console.warn('Could not fetch LAST_SEEN_CUTOFF_DATE, using default');
                return null;
            }
            
            const data = await response.json();
            if (data.status === 'success' && data.config_value) {
                console.log('📅 LAST_SEEN_CUTOFF_DATE:', data.config_value);
                return data.config_value;
            }
            return null;
        } catch (err) {
            console.warn('Error fetching LAST_SEEN_CUTOFF_DATE:', err);
            return null;
        }
    }

    // ===== CHECK IF RECORD SHOULD BE VISIBLE =====
    function isRecordVisible(record, cutoffDate) {
        if (!cutoffDate) return true;
        if (!record.last_seen) return false;
        
        let lastSeenDate = record.last_seen;
        if (typeof lastSeenDate === 'string' && lastSeenDate.includes('T')) {
            lastSeenDate = lastSeenDate.split('T')[0];
        }
        return lastSeenDate >= cutoffDate;
    }

    // ===== GET CONDITION DISPLAY NAME =====
    function getConditionDisplay(record) {
        if (record.sleeve_condition_name) return record.sleeve_condition_name;
        if (record.condition) return record.condition;
        if (record.sleeve_display) return record.sleeve_display;
        return 'Unknown';
    }

    // Modal functions
    window.openRecordModal = function(record) {
        const price = parseFloat(record.store_price) || 0;
        const inStock = record.status_id === 2 || record.status_id === 1;
        const imageUrl = record.image_url || '';
        const condition = getConditionDisplay(record);
        const location = record.location_name || '';
        const lastSeen = record.last_seen ? new Date(record.last_seen).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'Never';
        
        const modal = document.createElement('div');
        modal.id = 'recordModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
        `;
        
        const recordData = JSON.stringify(record).replace(/"/g, '&quot;');
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 30px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #333; font-size: 24px;">${record.artist || 'Unknown Artist'}</h2>
                    <button onclick="closeRecordModal()" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #999; padding: 0 8px;">&times;</button>
                </div>
                
                <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                    <div style="flex: 0 0 120px; height: 120px; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        ${imageUrl ? 
                            `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                            `<span style="font-size: 40px; color: #ddd;">🎵</span>`
                        }
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 18px; font-weight: bold; color: #333;">${record.title || 'Untitled'}</div>
                        <div style="color: #666; margin: 4px 0;">${condition}</div>
                        <div style="color: #666; font-size: 14px;">${record.format_name || 'Unknown Format'}</div>
                        ${location ? `<div style="color: #888; font-size: 12px; margin-top: 4px;">📍 ${location}</div>` : ''}
                        ${record.last_seen ? `<div style="color: #888; font-size: 11px; margin-top: 2px;">Last seen: ${lastSeen}</div>` : ''}
                    </div>
                </div>
                
                <div style="border-top: 1px solid #eee; padding-top: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <span style="font-size: 18px; color: #666;">Price</span>
                        <span style="font-size: 28px; font-weight: bold; color: #ff6b6b;">$${price.toFixed(2)}</span>
                    </div>
                    
                    ${inStock ? `
                        <button onclick="window.addRecordToCart(${recordData})" 
                                style="width: 100%; padding: 14px; background: #ff6b6b; color: white; border: none; border-radius: 30px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
                            <i class="fas fa-shopping-cart"></i> Add to Cart
                        </button>
                    ` : `
                        <button disabled style="width: 100%; padding: 14px; background: #ccc; color: #666; border: none; border-radius: 30px; font-size: 16px; font-weight: 600; cursor: not-allowed;">
                            Out of Stock
                        </button>
                    `}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeRecordModal();
            }
        });
        
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closeRecordModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    };

    window.closeRecordModal = function() {
        const modal = document.getElementById('recordModal');
        if (modal) {
            modal.remove();
        }
    };

    // Add record to cart
    window.addRecordToCart = function(record) {
        if (!window.cart) {
            console.error('Cart not initialized');
            alert('Cart not initialized. Please refresh the page.');
            return;
        }
        
        const price = parseFloat(record.store_price) || 0;
        window.cart.addItem({
            id: record.id,
            type: 'record',
            title: record.artist + ' - ' + record.title,
            price: price,
            quantity: 1,
            artist: record.artist,
            condition: record.condition || 'Unknown'
        });
        
        if (typeof window.renderCart === 'function') {
            window.renderCart();
        }
        if (typeof window.updateCartBadge === 'function') {
            window.updateCartBadge();
        }
        
        closeRecordModal();
        
        if (typeof window.showToast === 'function') {
            window.showToast('✅ Added to cart: ' + record.artist + ' - ' + record.title);
        } else {
            alert('Added to cart: ' + record.artist + ' - ' + record.title);
        }
    };

    // RecordsComponent class
    window.RecordsComponent = class RecordsComponent {
        constructor(config) {
            this.config = {
                containerId: config.containerId || 'catalogContainer',
                title: config.title || 'Records',
                pageSize: config.pageSize || 24,
                currentPage: 1,
                totalRecords: 0,
                totalPages: 0,
                locationId: config.locationId || null,
                statusId: config.statusId || null,
                borderColor: config.borderColor || '#ff6b6b',
                badgeText: config.badgeText || null,
                badgeColor: config.badgeColor || '#ff6b6b',
                buttonColor: config.buttonColor || '#ff6b6b',
                buttonTextColor: config.buttonTextColor || 'white',
                onAddToCart: config.onAddToCart || null,
                idPrefix: config.idPrefix || 'records',
                searchInputId: config.searchInputId || null,
                showCondition: config.showCondition || false,
                showLocation: config.showLocation || false,
                showEmptyCard: config.showEmptyCard || false
            };
            
            this.isInitialized = false;
            this.allData = [];
            this.filteredData = [];
            this.searchTerm = '';
            this.cutoffDate = null;
        }

        init() {
            if (this.isInitialized) return;
            this.isInitialized = true;
            
            console.log(`📀 ${this.config.title} component initializing...`);
            
            fetchLastSeenCutoff().then(date => {
                this.cutoffDate = date;
                console.log(`📅 ${this.config.title} using cutoff date:`, this.cutoffDate || 'None (showing all)');
                this.loadRecords();
            });
            
            this.bindEvents();
            this.bindSearchEvents();
        }

        bindEvents() {
            const firstPage = document.getElementById(`${this.config.idPrefix}FirstPage`);
            if (firstPage) {
                firstPage.addEventListener('click', () => this.goToPage(1));
            }
            
            const prevPage = document.getElementById(`${this.config.idPrefix}PrevPage`);
            if (prevPage) {
                prevPage.addEventListener('click', () => this.prevPage());
            }
            
            const nextPage = document.getElementById(`${this.config.idPrefix}NextPage`);
            if (nextPage) {
                nextPage.addEventListener('click', () => this.nextPage());
            }
            
            const lastPage = document.getElementById(`${this.config.idPrefix}LastPage`);
            if (lastPage) {
                lastPage.addEventListener('click', () => this.goToPage(this.totalPages));
            }
        }

        bindSearchEvents() {
            const searchInput = document.getElementById(this.config.searchInputId);
            if (searchInput) {
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        this.performSearch();
                    }
                });
            }
        }

        performSearch() {
            const searchInput = document.getElementById(this.config.searchInputId);
            if (searchInput) {
                this.searchTerm = searchInput.value.trim();
                this.applySearch();
            }
        }

        clearSearch() {
            const searchInput = document.getElementById(this.config.searchInputId);
            if (searchInput) {
                searchInput.value = '';
                this.searchTerm = '';
                this.applySearch();
            }
        }

        applySearch() {
            if (!this.searchTerm) {
                this.filteredData = [...this.allData];
            } else {
                const term = this.searchTerm.toLowerCase().trim();
                const isNumeric = /^\d+$/.test(term);
                
                this.filteredData = this.allData.filter(record => {
                    if (isNumeric && record.id && record.id.toString() === term) {
                        return true;
                    }
                    if (record.barcode && record.barcode.toLowerCase() === term) {
                        return true;
                    }
                    if (record.artist && record.artist.toLowerCase().includes(term)) {
                        return true;
                    }
                    if (record.title && record.title.toLowerCase().includes(term)) {
                        return true;
                    }
                    return false;
                });
            }
            
            this.totalRecords = this.filteredData.length;
            this.currentPage = 1;
            this.totalPages = Math.ceil(this.totalRecords / this.config.pageSize) || 1;
            this.renderPage();
            this.updatePagination();
        }

        async loadRecords() {
            const container = document.getElementById(this.config.containerId);
            if (!container) {
                console.error('❌ Container not found:', this.config.containerId);
                return;
            }

            console.log('📀 ========== LOADING RECORDS ==========');
            console.log('📀 Component:', this.config.title);
            console.log('📀 Container ID:', this.config.containerId);
            console.log('📀 Status Filter:', this.config.statusId || 'None');
            console.log('📀 Location Filter:', this.config.locationId || 'None');
            console.log('📀 Cutoff Date:', this.cutoffDate || 'None (showing all)');
            console.log('📀 Page Size:', this.config.pageSize);

            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #888;">
                    <div style="margin-bottom: 10px;">⏳</div>
                    <p>Loading ${this.config.title}...</p>
                </div>
            `;

            try {
                const params = new URLSearchParams({
                    limit: 1000
                });
                
                if (this.config.locationId) {
                    params.append('location_id', this.config.locationId);
                }
                if (this.config.statusId) {
                    params.append('status_ids', this.config.statusId);
                }
                if (this.cutoffDate) {
                    params.append('last_seen_after', this.cutoffDate);
                    console.log('📀 Adding last_seen_after filter:', this.cutoffDate);
                }

                const url = `${API_BASE}/records?${params.toString()}`;
                console.log('📡 📡 📡 FETCHING RECORDS FROM:', url);

                const response = await fetch(url, {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();

                if (data.status === 'success' && data.records) {
                    let records = data.records || [];
                    
                    if (this.cutoffDate) {
                        const cutoffStr = this.cutoffDate;
                        const beforeFilter = records.length;
                        records = records.filter(record => isRecordVisible(record, cutoffStr));
                        console.log(`📅 Client-side cutoff filter: ${beforeFilter} → ${records.length} records`);
                    }
                    
                    this.allData = records;
                    this.filteredData = [...this.allData];
                    this.totalRecords = this.filteredData.length;
                    this.totalPages = Math.ceil(this.totalRecords / this.config.pageSize) || 1;
                    this.currentPage = 1;
                    
                    console.log('📀 Final data counts:');
                    console.log('  - allData:', this.allData.length);
                    console.log('  - filteredData:', this.filteredData.length);
                    console.log('  - totalRecords:', this.totalRecords);
                    console.log('  - totalPages:', this.totalPages);
                    console.log('📀 ========================================');
                    
                    this.renderPage();
                    this.updatePagination();
                } else {
                    console.warn('⚠️ No records returned or status not success');
                    container.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #888;">
                            <div style="margin-bottom: 10px;">📀</div>
                            <p>No ${this.config.title.toLowerCase()} found</p>
                            <p style="font-size: 12px; color: #999;">Total returned: ${data.total || 0}</p>
                        </div>
                    `;
                }
            } catch (err) {
                console.error('❌ Failed to load records:', err);
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #dc3545;">
                        <div style="margin-bottom: 10px;">❌</div>
                        <p>Failed to load: ${err.message}</p>
                        <button onclick="this.closest('.records-component').loadRecords()" style="margin-top: 10px; padding: 8px 20px; border: none; border-radius: 4px; background: ${this.config.borderColor}; color: ${this.config.buttonTextColor}; cursor: pointer;">
                            Retry
                        </button>
                    </div>
                `;
            }
        }

        renderPage() {
            const container = document.getElementById(this.config.containerId);
            if (!container) return;

            const start = (this.currentPage - 1) * this.config.pageSize;
            const end = Math.min(start + this.config.pageSize, this.filteredData.length);
            const pageData = this.filteredData.slice(start, end);
            
            let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; padding: 10px 0;">';
            
            if (!pageData || pageData.length === 0) {
                html += `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #888;">No ${this.config.title.toLowerCase()} found</div>`;
            } else {
                pageData.forEach(record => {
                    const price = parseFloat(record.store_price) || 0;
                    const imageUrl = record.image_url || '';
                    const recordData = JSON.stringify(record).replace(/"/g, '&quot;');
                    const condition = getConditionDisplay(record);
                    const location = record.location_name || '';
                    
                    html += `
                        <div style="background: #f8f8f8; border-radius: 8px; overflow: hidden; border: 2px solid ${this.config.borderColor}; padding: 12px; cursor: pointer; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.08);" 
                             onclick="openRecordModal(${recordData})">
                            <div style="height: 120px; display: flex; align-items: center; justify-content: center; background: #e0e0e0; border-radius: 4px; margin-bottom: 8px; position: relative; overflow: hidden;">
                                ${imageUrl ? 
                                    `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'font-size: 40px; color: #bbb;\\'>🎵</span>';">` : 
                                    `<span style="font-size: 40px; color: #bbb;">🎵</span>`
                                }
                                ${this.config.badgeText ? `
                                    <div style="position: absolute; top: 8px; right: 8px; background: ${this.config.badgeColor}; color: #333; padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: bold;">
                                        ${this.config.badgeText}
                                    </div>
                                ` : ''}
                            </div>
                            <div style="font-weight: bold; color: #333; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${record.artist || 'Unknown Artist'}</div>
                            <div style="color: #666; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${record.title || 'Untitled'}</div>
                            ${this.config.showCondition ? `<div style="color: #555; font-size: 10px; margin-top: 2px;">📦 ${condition}</div>` : ''}
                            ${this.config.showLocation && location ? `<div style="color: #888; font-size: 10px; margin-top: 1px;">📍 ${location}</div>` : ''}
                            <div style="color: #ff6b6b; font-size: 16px; font-weight: bold; margin-top: 4px;">$${price.toFixed(2)}</div>
                            ${record.barcode ? `<div style="font-size: 8px; color: #999; margin-top: 2px; font-family: monospace;">${record.barcode}</div>` : ''}
                        </div>
                    `;
                });
            }
            
            // ===== ADD EMPTY CARD WITH PIG IMAGE =====
            if (this.config.showEmptyCard) {
                html += `
                    <div onclick="showRandomModal()" style="background: #f8f8f8; border-radius: 8px; overflow: hidden; border: 2px solid ${this.config.borderColor}; padding: 12px; cursor: pointer; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.08); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px;">
                        <img src="/images/pig_delivering_order.png" alt="Request a Record" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'">
                    </div>
                `;
            }
            
            html += '</div>';
            container.innerHTML = html;
        }

        updatePagination() {
            const total = this.totalRecords;
            const start = (this.currentPage - 1) * this.config.pageSize + 1;
            const end = Math.min(this.currentPage * this.config.pageSize, total);

            const showingRange = document.getElementById(`${this.config.idPrefix}ShowingRange`);
            if (showingRange) showingRange.textContent = total > 0 ? `${start}-${end}` : '0-0';
            
            const totalRecords = document.getElementById(`${this.config.idPrefix}TotalRecords`);
            if (totalRecords) totalRecords.textContent = total;
            
            const pageInfo = document.getElementById(`${this.config.idPrefix}PageInfo`);
            if (pageInfo) pageInfo.textContent = `${this.currentPage} / ${this.totalPages || 1}`;

            const firstPage = document.getElementById(`${this.config.idPrefix}FirstPage`);
            if (firstPage) firstPage.disabled = this.currentPage <= 1;
            
            const prevPage = document.getElementById(`${this.config.idPrefix}PrevPage`);
            if (prevPage) prevPage.disabled = this.currentPage <= 1;
            
            const nextPage = document.getElementById(`${this.config.idPrefix}NextPage`);
            if (nextPage) nextPage.disabled = this.currentPage >= this.totalPages;
            
            const lastPage = document.getElementById(`${this.config.idPrefix}LastPage`);
            if (lastPage) lastPage.disabled = this.currentPage >= this.totalPages;
        }

        goToPage(page) {
            if (page < 1 || page > this.totalPages) return;
            this.currentPage = page;
            this.renderPage();
            this.updatePagination();
        }

        nextPage() {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.renderPage();
                this.updatePagination();
            }
        }

        prevPage() {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderPage();
                this.updatePagination();
            }
        }

        reload() {
            fetchLastSeenCutoff().then(date => {
                this.cutoffDate = date;
                this.loadRecords();
            });
        }
    };

    // Global search functions for shop and new
    window.shopSearch = function() {
        if (window.shopComponent) {
            window.shopComponent.performSearch();
        }
    };

    window.shopClearSearch = function() {
        if (window.shopComponent) {
            window.shopComponent.clearSearch();
        }
    };

    window.newSearch = function() {
        if (window.newComponent) {
            window.newComponent.performSearch();
        }
    };

    window.newClearSearch = function() {
        if (window.newComponent) {
            window.newComponent.clearSearch();
        }
    };

    console.log('📀 Records component loaded with API_BASE:', API_BASE || '(same origin)');

})();