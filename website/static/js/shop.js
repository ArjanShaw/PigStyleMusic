/**
 * Shop Component - Simplified
 */

const API_BASE = 'http://localhost:5000';

const ShopComponent = {
    currentPage: 1,
    pageSize: 24,
    totalRecords: 0,
    totalPages: 0,
    isInitialized: false,

    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        
        console.log('🛒 Shop component initializing...');
        this.loadRecords();
    },

    async loadRecords() {
        const container = document.getElementById('browseCatalogContainer');
        if (!container) {
            console.error('Catalog container not found');
            return;
        }

        // Show loading
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #888;">
                <div style="margin-bottom: 10px;">⏳</div>
                <p>Loading records...</p>
            </div>
        `;

        try {
            const response = await fetch(`${API_BASE}/records?page=${this.currentPage}&limit=${this.pageSize}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Records data:', data);

            if (data.status === 'success' && data.records) {
                this.totalRecords = data.pagination?.total || data.records.length;
                this.totalPages = data.pagination?.total_pages || 1;
                this.renderRecords(data.records);
                this.updatePagination();
            } else {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #888;">
                        <div style="margin-bottom: 10px;">📀</div>
                        <p>No records found</p>
                    </div>
                `;
            }
        } catch (err) {
            console.error('Failed to load records:', err);
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #dc3545;">
                    <div style="margin-bottom: 10px;">❌</div>
                    <p>Failed to load records: ${err.message}</p>
                    <button onclick="ShopComponent.loadRecords()" style="margin-top: 10px; padding: 8px 20px; border: none; border-radius: 4px; background: #ff6b6b; color: white; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    },

    renderRecords(records) {
        const container = document.getElementById('browseCatalogContainer');
        if (!container) return;

        if (!records || records.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #888;">
                    <div style="margin-bottom: 10px;">📀</div>
                    <p>No records found</p>
                </div>
            `;
            return;
        }

        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; padding: 10px 0;">';
        records.forEach(record => {
            const price = parseFloat(record.store_price) || 0;
            const inStock = record.status_id === 2 || record.status_id === 1;
            
            html += `
                <div style="background: white; border-radius: 8px; overflow: hidden; border: 1px solid #eee; padding: 12px; cursor: pointer; transition: all 0.3s;" 
                     onclick="alert('Record: ${record.artist} - ${record.title}')">
                    <div style="height: 120px; display: flex; align-items: center; justify-content: center; background: #f5f5f5; border-radius: 4px; margin-bottom: 8px;">
                        ${record.image_url ? 
                            `<img src="${record.image_url}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                            `<span style="font-size: 32px; color: #ddd;">🎵</span>`
                        }
                    </div>
                    <div style="font-weight: bold; color: #333; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${record.artist || 'Unknown Artist'}</div>
                    <div style="color: #666; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${record.title || 'Untitled'}</div>
                    <div style="color: #ff6b6b; font-size: 16px; font-weight: bold; margin-top: 4px;">$${price.toFixed(2)}</div>
                    <div style="font-size: 10px; color: ${inStock ? '#28a745' : '#dc3545'}; margin-top: 2px;">${inStock ? '✅ In Stock' : '❌ Out of Stock'}</div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    updatePagination() {
        const total = this.totalRecords;
        const start = (this.currentPage - 1) * this.pageSize + 1;
        const end = Math.min(this.currentPage * this.pageSize, total);

        const showingRange = document.getElementById('browseShowingRange');
        if (showingRange) showingRange.textContent = total > 0 ? `${start}-${end}` : '0-0';
        
        const totalRecords = document.getElementById('browseTotalRecords');
        if (totalRecords) totalRecords.textContent = total;
        
        const pageInfo = document.getElementById('browsePageInfo');
        if (pageInfo) pageInfo.textContent = `${this.currentPage} / ${this.totalPages || 1}`;

        const firstPage = document.getElementById('browseFirstPage');
        if (firstPage) firstPage.disabled = this.currentPage <= 1;
        
        const prevPage = document.getElementById('browsePrevPage');
        if (prevPage) prevPage.disabled = this.currentPage <= 1;
        
        const nextPage = document.getElementById('browseNextPage');
        if (nextPage) nextPage.disabled = this.currentPage >= this.totalPages;
        
        const lastPage = document.getElementById('browseLastPage');
        if (lastPage) lastPage.disabled = this.currentPage >= this.totalPages;
    },

    goToPage(page) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.loadRecords();
    },

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.loadRecords();
        }
    },

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.loadRecords();
        }
    }
};
