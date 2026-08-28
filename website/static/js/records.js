// Shared records component - used by both Shop and New
(function() {
    let currentPage = 1;
    const pageSize = 24;
    let totalRecords = 0;
    let allRecords = [];
    let currentFilter = {};
    let searchTerm = '';

    // Modal functions
    window.openRecordModal = function(record) {
        const price = parseFloat(record.store_price) || 0;
        const inStock = record.status_id === 2 || record.status_id === 1;
        const imageUrl = record.image_url || '';
        
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
                        <div style="color: #666; margin: 4px 0;">${record.condition || 'Unknown Condition'}</div>
                        <div style="color: #666; font-size: 14px;">${record.format_name || 'Unknown Format'}</div>
                        <div style="margin-top: 8px; font-size: 14px; color: ${inStock ? '#28a745' : '#dc3545'};">
                            ${inStock ? '✅ In Stock' : '❌ Out of Stock'}
                        </div>
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
                searchInputId: config.searchInputId || null
            };
            
            this.isInitialized = false;
            this.allData = [];
            this.filteredData = [];
            this.searchTerm = '';
        }

        init() {
            if (this.isInitialized) return;
            this.isInitialized = true;
            
            console.log(`📀 ${this.config.title} component initializing...`);
            this.loadRecords();
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
                console.error('Container not found:', this.config.containerId);
                return;
            }

            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #888;">
                    <div style="margin-bottom: 10px;">⏳</div>
                    <p>Loading ${this.config.title}...</p>
                </div>
            `;

            try {
                const params = new URLSearchParams({
                    page: 1,
                    limit: 500
                });
                
                if (this.config.locationId) {
                    params.append('location_id', this.config.locationId);
                }
                if (this.config.statusId) {
                    params.append('status_ids', this.config.statusId);
                }

                const url = `http://localhost:5000/records?${params.toString()}`;
                console.log(`📀 ${this.config.title} fetching:`, url);
                
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();

                if (data.status === 'success' && data.records) {
                    this.allData = data.records || [];
                    this.filteredData = [...this.allData];
                    this.totalRecords = this.filteredData.length;
                    this.totalPages = Math.ceil(this.totalRecords / this.config.pageSize) || 1;
                    this.currentPage = 1;
                    this.renderPage();
                    this.updatePagination();
                    console.log(`📀 ${this.config.title} loaded ${this.totalRecords} records`);
                } else {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #888;">
                            <div style="margin-bottom: 10px;">📀</div>
                            <p>No ${this.config.title.toLowerCase()} found</p>
                        </div>
                    `;
                }
            } catch (err) {
                console.error('Failed to load records:', err);
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #dc3545;">
                        <div style="margin-bottom: 10px;">❌</div>
                        <p>Failed to load: ${err.message}</p>
                        <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 20px; border: none; border-radius: 4px; background: ${this.config.borderColor}; color: ${this.config.buttonTextColor}; cursor: pointer;">
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
            
            if (!pageData || pageData.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #888;">
                        <div style="margin-bottom: 10px;">🔍</div>
                        <p>No ${this.config.title.toLowerCase()} found</p>
                        ${this.searchTerm ? `<p style="font-size: 12px; color: #999;">Try adjusting your search</p>` : ''}
                    </div>
                `;
                return;
            }

            let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; padding: 10px 0;">';
            pageData.forEach(record => {
                const price = parseFloat(record.store_price) || 0;
                const inStock = record.status_id === 2 || record.status_id === 1;
                const imageUrl = record.image_url || '';
                const recordData = JSON.stringify(record).replace(/"/g, '&quot;');
                
                html += `
                    <div style="background: #f8f8f8; border-radius: 8px; overflow: hidden; border: 2px solid ${this.config.borderColor}; padding: 12px; cursor: pointer; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.08);" 
                         onclick="openRecordModal(${recordData})">
                        <div style="height: 120px; display: flex; align-items: center; justify-content: center; background: #e0e0e0; border-radius: 4px; margin-bottom: 8px; position: relative; overflow: hidden;">
                            ${imageUrl ? 
                                `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : 
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
                        <div style="color: #ff6b6b; font-size: 16px; font-weight: bold; margin-top: 4px;">$${price.toFixed(2)}</div>
                        <div style="font-size: 10px; color: ${inStock ? '#28a745' : '#dc3545'}; margin-top: 2px;">${inStock ? '✅ In Stock' : '❌ Out of Stock'}</div>
                        ${this.config.locationId ? '<div style="font-size: 9px; color: #999; margin-top: 2px;">📍 Loveland</div>' : ''}
                        ${record.barcode ? `<div style="font-size: 8px; color: #999; margin-top: 2px; font-family: monospace;">${record.barcode}</div>` : ''}
                    </div>
                `;
            });
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

})();
