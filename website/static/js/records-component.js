/**
 * Reusable Records Component
 * Used by both Shop and New Arrivals with different configs
 */

const API_BASE = 'http://localhost:5000';

class RecordsComponent {
    constructor(config) {
        this.config = {
            containerId: config.containerId || 'catalogContainer',
            title: config.title || 'Records',
            pageSize: config.pageSize || 24,
            currentPage: 1,
            totalRecords: 0,
            totalPages: 0,
            // Filter parameters
            locationId: config.locationId || null,
            statusId: config.statusId || null,
            // Styling
            borderColor: config.borderColor || '#ff6b6b',
            badgeText: config.badgeText || null,
            badgeColor: config.badgeColor || '#ff6b6b',
            buttonColor: config.buttonColor || '#ff6b6b',
            buttonTextColor: config.buttonTextColor || 'white',
            // Callbacks
            onAddToCart: config.onAddToCart || null
        };
        
        // Use unique IDs for pagination elements
        this.idPrefix = config.idPrefix || 'records';
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        
        console.log(`📀 ${this.config.title} component initializing...`);
        this.loadRecords();
        this.bindEvents();
    }

    bindEvents() {
        // Pagination buttons
        const firstPage = document.getElementById(`${this.idPrefix}FirstPage`);
        if (firstPage) {
            firstPage.addEventListener('click', () => this.goToPage(1));
        }
        
        const prevPage = document.getElementById(`${this.idPrefix}PrevPage`);
        if (prevPage) {
            prevPage.addEventListener('click', () => this.prevPage());
        }
        
        const nextPage = document.getElementById(`${this.idPrefix}NextPage`);
        if (nextPage) {
            nextPage.addEventListener('click', () => this.nextPage());
        }
        
        const lastPage = document.getElementById(`${this.idPrefix}LastPage`);
        if (lastPage) {
            lastPage.addEventListener('click', () => this.goToPage(this.totalPages));
        }
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
                page: this.currentPage,
                limit: this.config.pageSize
            });
            
            // Add filters if specified
            if (this.config.locationId) {
                params.append('location_id', this.config.locationId);
            }
            if (this.config.statusId) {
                params.append('status_id', this.config.statusId);
            }

            const response = await fetch(`${API_BASE}/records?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();

            if (data.status === 'success' && data.records) {
                this.totalRecords = data.pagination?.total || data.records.length;
                this.totalPages = data.pagination?.total_pages || 1;
                this.renderRecords(data.records);
                this.updatePagination();
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
                    <button onclick="this.loadRecords()" style="margin-top: 10px; padding: 8px 20px; border: none; border-radius: 4px; background: ${this.config.borderColor}; color: ${this.config.buttonTextColor}; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    renderRecords(records) {
        const container = document.getElementById(this.config.containerId);
        if (!container) return;

        if (!records || records.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #888;">
                    <div style="margin-bottom: 10px;">📀</div>
                    <p>No ${this.config.title.toLowerCase()} found</p>
                </div>
            `;
            return;
        }

        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; padding: 10px 0;">';
        records.forEach(record => {
            const price = parseFloat(record.store_price) || 0;
            const inStock = record.status_id === 2 || record.status_id === 1;
            
            html += `
                <div style="background: white; border-radius: 8px; overflow: hidden; border: 2px solid ${this.config.borderColor}; padding: 12px; cursor: pointer; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.08);" 
                     onclick="window.${this.idPrefix}Component.openCheckoutModal(${JSON.stringify(record).replace(/"/g, '&quot;')})">
                    <div style="height: 120px; display: flex; align-items: center; justify-content: center; background: #f5f5f5; border-radius: 4px; margin-bottom: 8px; position: relative;">
                        ${record.image_url ? 
                            `<img src="${record.image_url}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                            `<span style="font-size: 32px; color: #ddd;">🎵</span>`
                        }
                        ${this.config.badgeText ? `
                            <div style="position: absolute; top: 8px; right: 8px; background: ${this.config.badgeColor}; color: #333; padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: bold;">
                                ${this.config.badgeText}
                            </div>
                        ` : ''}
                    </div>
                    <div style="font-weight: bold; color: #333; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${record.artist || 'Unknown Artist'}</div>
                    <div style="color: #666; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${record.title || 'Untitled'}</div>
                    <div style="color: #ff6b6b; font-size: 16px; font-weight: bold; margin-top: 4px;">$${price.toFixed(2)}</div>
                    <div style="font-size: 10px; color: ${inStock ? '#28a745' : '#dc3545'}; margin-top: 2px;">${inStock ? '✅ In Stock' : '❌ Out of Stock'}</div>
                    ${this.config.locationId ? '<div style="font-size: 9px; color: #999; margin-top: 2px;">📍 Loveland</div>' : ''}
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    openCheckoutModal(record) {
        const modal = document.createElement('div');
        modal.id = `${this.idPrefix}CheckoutModal`;
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
        `;
        
        const price = parseFloat(record.store_price) || 0;
        const inStock = record.status_id === 2 || record.status_id === 1;
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 30px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #333; font-size: 24px;">${record.artist}</h2>
                    <button onclick="window.${this.idPrefix}Component.closeCheckoutModal()" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #999; padding: 0 8px;">&times;</button>
                </div>
                
                <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                    <div style="flex: 0 0 120px; height: 120px; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; justify-content: center; position: relative;">
                        ${record.image_url ? 
                            `<img src="${record.image_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">` : 
                            `<span style="font-size: 40px; color: #ddd;">🎵</span>`
                        }
                        ${this.config.badgeText ? `
                            <div style="position: absolute; top: -8px; right: -8px; background: ${this.config.badgeColor}; color: #333; padding: 2px 12px; border-radius: 12px; font-size: 11px; font-weight: bold;">
                                ${this.config.badgeText}
                            </div>
                        ` : ''}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 18px; font-weight: bold; color: #333;">${record.title}</div>
                        <div style="color: #666; margin: 4px 0;">${record.condition || 'Unknown Condition'}</div>
                        <div style="color: #666; font-size: 14px;">${record.format_name || 'Unknown Format'}</div>
                        ${this.config.locationId ? '<div style="color: #666; font-size: 14px;">📍 Loveland Store</div>' : ''}
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
                        <button onclick="window.${this.idPrefix}Component.addToCart(${record.id}, '${record.artist}', '${record.title}', ${price})" 
                                style="width: 100%; padding: 14px; background: ${this.config.buttonColor}; color: ${this.config.buttonTextColor}; border: none; border-radius: 30px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
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
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeCheckoutModal();
            }
        });
    }

    closeCheckoutModal() {
        const modal = document.getElementById(`${this.idPrefix}CheckoutModal`);
        if (modal) {
            modal.remove();
        }
    }

    addToCart(id, artist, title, price) {
        alert(`🛒 Added to cart:\n${artist} - ${title}\n$${price.toFixed(2)}`);
        this.closeCheckoutModal();
        console.log('Added to cart:', { id, artist, title, price });
        
        if (this.config.onAddToCart) {
            this.config.onAddToCart(id, artist, title, price);
        }
    }

    updatePagination() {
        const total = this.totalRecords;
        const start = (this.currentPage - 1) * this.config.pageSize + 1;
        const end = Math.min(this.currentPage * this.config.pageSize, total);

        const showingRange = document.getElementById(`${this.idPrefix}ShowingRange`);
        if (showingRange) showingRange.textContent = total > 0 ? `${start}-${end}` : '0-0';
        
        const totalRecords = document.getElementById(`${this.idPrefix}TotalRecords`);
        if (totalRecords) totalRecords.textContent = total;
        
        const pageInfo = document.getElementById(`${this.idPrefix}PageInfo`);
        if (pageInfo) pageInfo.textContent = `${this.currentPage} / ${this.totalPages || 1}`;

        const firstPage = document.getElementById(`${this.idPrefix}FirstPage`);
        if (firstPage) firstPage.disabled = this.currentPage <= 1;
        
        const prevPage = document.getElementById(`${this.idPrefix}PrevPage`);
        if (prevPage) prevPage.disabled = this.currentPage <= 1;
        
        const nextPage = document.getElementById(`${this.idPrefix}NextPage`);
        if (nextPage) nextPage.disabled = this.currentPage >= this.totalPages;
        
        const lastPage = document.getElementById(`${this.idPrefix}LastPage`);
        if (lastPage) lastPage.disabled = this.currentPage >= this.totalPages;
    }

    goToPage(page) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.loadRecords();
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.loadRecords();
        }
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.loadRecords();
        }
    }
}

// Add CSS animation for modal
const recordsStyle = document.createElement('style');
recordsStyle.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
`;
document.head.appendChild(recordsStyle);
