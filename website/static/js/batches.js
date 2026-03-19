// ============================================================================
// batches.js - Batch Management Tab Functionality
// ============================================================================

class BatchManager {
    constructor() {
        this.batches = [];
        this.filteredBatches = [];
        this.currentPage = 1;
        this.pageSize = 20;
        this.totalPages = 1;
        this.statusFilter = 'all';
        this.searchTerm = '';
        this.editingPercentage = null; // Track which batch is being edited
        
        this.init();
    }

    async init() {
        await this.loadStats();
        await this.loadBatches();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Status filter change
        const statusFilter = document.getElementById('batch-status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                this.statusFilter = statusFilter.value;
                this.currentPage = 1;
                this.filterBatches();
            });
        }

        // Search input
        const searchInput = document.getElementById('batch-search');
        if (searchInput) {
            searchInput.addEventListener('keyup', () => {
                this.searchTerm = searchInput.value.toLowerCase();
                this.currentPage = 1;
                this.filterBatches();
            });
        }

        // Page size change
        const pageSize = document.getElementById('batches-page-size');
        if (pageSize) {
            pageSize.addEventListener('change', () => {
                this.pageSize = parseInt(pageSize.value);
                this.currentPage = 1;
                this.renderTable();
            });
        }
        
        // Close percentage editor when clicking outside
        document.addEventListener('click', (e) => {
            if (this.editingPercentage && !e.target.closest('.percentage-edit')) {
                this.cancelPercentageEdit();
            }
        });
    }

    async loadStats() {
        try {
            const response = await APIUtils.get('/api/batches/stats');
            
            if (response.status === 'success' && response.stats) {
                document.getElementById('total-batches').textContent = response.stats.total_batches || 0;
                document.getElementById('active-batches').textContent = response.stats.active_batches || 0;
                document.getElementById('completed-batches').textContent = response.stats.completed_batches || 0;
                document.getElementById('records-in-batches').textContent = response.stats.total_records_in_batches || 0;
            }
        } catch (error) {
            console.error('Error loading batch stats:', error);
        }
    }

    async loadBatches() {
        this.showLoading(true);
        
        try {
            const params = {};
            if (this.statusFilter !== 'all') {
                params.status = this.statusFilter;
            }
            if (this.searchTerm) {
                params.search = this.searchTerm;
            }
            
            const response = await APIUtils.get('/api/batches', params);
            
            if (response.status === 'success') {
                this.batches = response.batches || [];
                this.filteredBatches = [...this.batches];
                this.totalPages = Math.ceil(this.filteredBatches.length / this.pageSize) || 1;
                this.renderTable();
            } else {
                showMessage('Error loading batches: ' + (response.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error loading batches:', error);
            showMessage('Error loading batches: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    filterBatches() {
        this.filteredBatches = this.batches.filter(batch => {
            // Status filter
            if (this.statusFilter !== 'all' && batch.status !== this.statusFilter) {
                return false;
            }
            
            // Search filter
            if (this.searchTerm) {
                const searchLower = this.searchTerm.toLowerCase();
                return (batch.seller_name && batch.seller_name.toLowerCase().includes(searchLower)) ||
                       (batch.seller_contact && batch.seller_contact.toLowerCase().includes(searchLower)) ||
                       (batch.notes && batch.notes.toLowerCase().includes(searchLower));
            }
            
            return true;
        });
        
        this.totalPages = Math.ceil(this.filteredBatches.length / this.pageSize) || 1;
        this.currentPage = 1;
        this.renderTable();
        this.updatePaginationControls();
    }

    renderTable() {
        const tbody = document.getElementById('batches-body');
        if (!tbody) return;
        
        if (this.filteredBatches.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:40px;">No batches found</td></tr>`;
            this.updatePaginationControls();
            return;
        }
        
        const start = (this.currentPage - 1) * this.pageSize;
        const end = Math.min(start + this.pageSize, this.filteredBatches.length);
        const pageBatches = this.filteredBatches.slice(start, end);
        
        let html = '';
        pageBatches.forEach(batch => {
            const startDate = batch.start_datetime ? new Date(batch.start_datetime).toLocaleString() : 'N/A';
            const endDate = batch.end_datetime ? new Date(batch.end_datetime).toLocaleString() : '—';
            
            const statusClass = `batch-${batch.status}`;
            const statusDisplay = batch.status ? batch.status.charAt(0).toUpperCase() + batch.status.slice(1) : 'Unknown';
            
            // Calculate offer amounts
            const totalStoreValue = batch.total_store_value || 0;
            const offerPercentage = batch.offer_percentage || 0;
            const totalOfferAmount = (totalStoreValue * offerPercentage / 100) || 0;
            
            // Check if this batch is being edited
            const isEditing = this.editingPercentage === batch.id;
            
            html += `
                <tr>
                    <td>${batch.id}</td>
                    <td>${this.escapeHtml(batch.seller_name || '')}</td>
                    <td>${this.escapeHtml(batch.seller_contact || '')}</td>
                    <td>
                        ${isEditing ? 
                            `<div class="percentage-edit">
                                <input type="number" 
                                       id="edit-percentage-${batch.id}" 
                                       value="${offerPercentage}" 
                                       min="0" 
                                       max="100" 
                                       step="5" 
                                       style="width: 60px; padding: 4px; border: 1px solid #007bff; border-radius: 4px;">
                                <button class="btn btn-small btn-success" onclick="window.batchManager.savePercentage(${batch.id})" style="padding: 4px 8px; margin-left: 4px;">
                                    <i class="fas fa-check"></i>
                                </button>
                                <button class="btn btn-small btn-secondary" onclick="window.batchManager.cancelPercentageEdit()" style="padding: 4px 8px;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>` : 
                            `<span onclick="window.batchManager.editPercentage(${batch.id})" style="cursor: pointer; padding: 4px 8px; display: inline-block; border-radius: 4px;" title="Click to edit">
                                ${offerPercentage}% <i class="fas fa-pencil-alt" style="font-size: 10px; margin-left: 4px; color: #666;"></i>
                            </span>`
                        }
                    </td>
                    <td>${batch.record_count || 0}</td>
                    <td>$${(totalStoreValue).toFixed(2)}</td>
                    <td>$${totalOfferAmount.toFixed(2)}</td>
                    <td>${startDate}</td>
                    <td>${endDate}</td>
                    <td><span class="status-badge ${statusClass}">${statusDisplay}</span></td>
                    <td>
                        <div class="table-actions">
                            <button class="table-action-btn view-batch-btn" title="View Details" onclick="window.batchManager.viewBatch(${batch.id})">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="table-action-btn print-batch-btn" title="Print Bill of Sale" onclick="window.batchManager.printBatch(${batch.id})">
                                <i class="fas fa-print"></i>
                            </button>
                            ${batch.status === 'active' ? `
                                <button class="table-action-btn" style="color: #28a745;" title="Complete Batch" onclick="window.batchManager.completeBatch(${batch.id})">
                                    <i class="fas fa-check-circle"></i>
                                </button>
                            ` : ''}
                            ${batch.status !== 'cancelled' ? `
                                <button class="table-action-btn delete-btn" title="Cancel Batch" onclick="window.batchManager.cancelBatch(${batch.id})">
                                    <i class="fas fa-times-circle"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        this.updatePaginationControls();
    }

    editPercentage(batchId) {
        this.editingPercentage = batchId;
        this.renderTable();
    }

    cancelPercentageEdit() {
        this.editingPercentage = null;
        this.renderTable();
    }

    async savePercentage(batchId) {
        const input = document.getElementById(`edit-percentage-${batchId}`);
        if (!input) return;
        
        const newPercentage = parseFloat(input.value);
        if (isNaN(newPercentage) || newPercentage < 0 || newPercentage > 100) {
            showMessage('Please enter a valid percentage (0-100)', 'error');
            return;
        }
        
        try {
            const response = await APIUtils.put(`/api/batches/${batchId}`, {
                offer_percentage: newPercentage
            });
            
            if (response.status === 'success') {
                showMessage('Batch percentage updated successfully!', 'success');
                this.editingPercentage = null;
                await this.loadBatches(); // Reload to get updated data
            } else {
                showMessage('Error updating batch: ' + (response.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error updating batch:', error);
            showMessage('Error updating batch: ' + error.message, 'error');
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updatePaginationControls() {
        const totalFiltered = this.filteredBatches.length;
        const start = (this.currentPage - 1) * this.pageSize + 1;
        const end = Math.min(start + this.pageSize - 1, totalFiltered);
        
        document.getElementById('batches-current-page').value = this.currentPage;
        document.getElementById('batches-total-pages').textContent = this.totalPages;
        
        document.getElementById('batches-first-btn').disabled = this.currentPage <= 1;
        document.getElementById('batches-prev-btn').disabled = this.currentPage <= 1;
        document.getElementById('batches-next-btn').disabled = this.currentPage >= this.totalPages;
        document.getElementById('batches-last-btn').disabled = this.currentPage >= this.totalPages;
    }

    showLoading(show) {
        const loading = document.getElementById('batches-loading');
        if (loading) {
            loading.style.display = show ? 'block' : 'none';
        }
    }

    async viewBatch(batchId) {
        try {
            const response = await APIUtils.get(`/api/batches/${batchId}`);
            
            if (response.status === 'success' && response.batch) {
                this.showBatchDetails(response.batch);
            } else {
                showMessage('Error loading batch details: ' + (response.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error loading batch details:', error);
            showMessage('Error loading batch details: ' + error.message, 'error');
        }
    }

    showBatchDetails(batch) {
        // Create modal for batch details
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        
        const startDate = batch.start_datetime ? new Date(batch.start_datetime).toLocaleString() : 'N/A';
        const endDate = batch.end_datetime ? new Date(batch.end_datetime).toLocaleString() : 'Not completed';
        
        // Calculate offer amounts
        const totalStoreValue = batch.total_store_value || 0;
        const offerPercentage = batch.offer_percentage || 0;
        const totalOfferAmount = (totalStoreValue * offerPercentage / 100) || 0;
        
        let recordsHtml = '';
        if (batch.records && batch.records.length > 0) {
            batch.records.forEach((record, index) => {
                const offerPrice = (record.store_price * offerPercentage / 100) || 0;
                recordsHtml += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${this.escapeHtml(record.artist)}</td>
                        <td>${this.escapeHtml(record.title)}</td>
                        <td>${record.catalog_number || '—'}</td>
                        <td>$${(record.store_price || 0).toFixed(2)}</td>
                        <td>$${offerPrice.toFixed(2)}</td>
                    </tr>
                `;
            });
        } else {
            recordsHtml = '<tr><td colspan="6" style="text-align:center;">No records in this batch</td></tr>';
        }
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h3 class="modal-title"><i class="fas fa-layer-group"></i> Batch #${batch.id} Details</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <div>
                            <strong>Seller:</strong> ${this.escapeHtml(batch.seller_name || '')}
                        </div>
                        <div>
                            <strong>Contact:</strong> ${this.escapeHtml(batch.seller_contact || '')}
                        </div>
                        <div>
                            <strong>Offer %:</strong> ${offerPercentage}%
                        </div>
                        <div>
                            <strong>Start Date:</strong> ${startDate}
                        </div>
                        <div>
                            <strong>End Date:</strong> ${endDate}
                        </div>
                        <div>
                            <strong>Status:</strong> 
                            <span class="status-badge batch-${batch.status}">${batch.status}</span>
                        </div>
                    </div>
                    
                    <h4>Records in Batch (${batch.records ? batch.records.length : 0})</h4>
                    <div style="max-height: 400px; overflow-y: auto;">
                        <table class="records-table" style="width: 100%;">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Artist</th>
                                    <th>Title</th>
                                    <th>Catalog #</th>
                                    <th>Store Price</th>
                                    <th>Offer Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recordsHtml}
                            </tbody>
                            ${batch.records && batch.records.length > 0 ? `
                                <tfoot style="font-weight: bold; background: #f8f9fa;">
                                    <tr>
                                        <td colspan="4" style="text-align: right;">Totals:</td>
                                        <td>$${totalStoreValue.toFixed(2)}</td>
                                        <td>$${totalOfferAmount.toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            ` : ''}
                        </table>
                    </div>
                    
                    ${batch.notes ? `
                        <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                            <strong>Notes:</strong>
                            <p>${this.escapeHtml(batch.notes)}</p>
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    <button class="btn btn-success" onclick="window.batchManager.printBatch(${batch.id}); this.closest('.modal-overlay').remove()">
                        <i class="fas fa-print"></i> Print Bill of Sale
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    async printBatch(batchId) {
        try {
            const response = await APIUtils.get(`/api/batches/${batchId}/print`);
            
            if (response.status === 'success' && response.print_data) {
                this.generateBillOfSale(response.print_data);
            } else {
                showMessage('Error getting batch print data: ' + (response.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error printing batch:', error);
            showMessage('Error printing batch: ' + error.message, 'error');
        }
    }

    generateBillOfSale(printData) {
        const printWindow = window.open('', '_blank');
        const today = new Date().toLocaleDateString();
        
        // Calculate totals
        const totalStoreValue = printData.total_store_value || 0;
        const offerPercentage = printData.offer_percentage || 0;
        const totalOfferAmount = printData.total_offer_amount || (totalStoreValue * offerPercentage / 100);
        
        // Generate items HTML for the detailed pages
        let itemsHtml = '';
        printData.items.forEach((item, index) => {
            const offerPrice = item.offer_price || (item.store_price * offerPercentage / 100) || 0;
            itemsHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${index + 1}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${this.escapeHtml(item.artist)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${this.escapeHtml(item.title)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.catalog_number || '—'}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${offerPrice.toFixed(2)}</td>
                </tr>
            `;
        });

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bill of Sale - Batch #${printData.batch_id}</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 0; 
                        padding: 20px;
                        line-height: 1.6; 
                    }
                    .page {
                        page-break-after: always;
                        min-height: 100vh;
                        padding: 20px;
                        box-sizing: border-box;
                    }
                    .page:last-child {
                        page-break-after: auto;
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 30px; 
                    }
                    .header h1 { 
                        margin-bottom: 5px; 
                        color: #333; 
                        font-size: 24px;
                    }
                    .header h2 { 
                        margin-top: 0; 
                        color: #666; 
                        font-weight: normal; 
                        font-size: 18px;
                    }
                    .seller-info { 
                        margin-bottom: 30px; 
                        padding: 15px; 
                        background: #f5f5f5; 
                        border-radius: 5px; 
                    }
                    .seller-info p { 
                        margin: 5px 0; 
                    }
                    table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        margin-bottom: 30px; 
                        font-size: 12px;
                    }
                    th { 
                        background: #333; 
                        color: white; 
                        padding: 10px; 
                        text-align: left; 
                        font-size: 12px;
                    }
                    td { 
                        padding: 8px; 
                        border-bottom: 1px solid #ddd; 
                    }
                    .totals { 
                        text-align: right; 
                        margin: 30px 0;
                        padding: 15px;
                        background: #f8f9fa;
                        border-radius: 5px;
                    }
                    .totals p { 
                        font-size: 16px; 
                        margin: 5px 0; 
                    }
                    .totals .total-offer { 
                        font-size: 24px; 
                        font-weight: bold; 
                        color: #28a745; 
                    }
                    .totals .total-store {
                        font-size: 16px;
                        color: #666;
                    }
                    .ownership-declaration { 
                        margin: 40px 0; 
                        padding: 20px; 
                        background: #f0f7ff; 
                        border-left: 4px solid #007bff;
                        border-radius: 4px;
                    }
                    .ownership-declaration h3 { 
                        margin-top: 0; 
                        color: #007bff; 
                    }
                    .ownership-declaration p { 
                        margin: 10px 0; 
                    }
                    .signature-section { 
                        margin-top: 50px; 
                    }
                    .signature-line { 
                        display: flex; 
                        justify-content: space-between; 
                        margin-top: 30px; 
                    }
                    .signature-item { 
                        width: 45%; 
                    }
                    .signature-item .line { 
                        border-bottom: 1px solid #000; 
                        margin-top: 5px; 
                        width: 100%; 
                        height: 20px;
                    }
                    .footer { 
                        margin-top: 30px; 
                        font-size: 10px; 
                        color: #666; 
                        text-align: center; 
                        border-top: 1px solid #ddd;
                        padding-top: 10px;
                    }
                    .page-number {
                        text-align: center;
                        font-size: 10px;
                        color: #999;
                        margin-top: 20px;
                    }
                    .summary-box {
                        background: #f8f9fa;
                        border: 2px solid #28a745;
                        border-radius: 8px;
                        padding: 20px;
                        margin: 30px 0;
                        text-align: center;
                    }
                    .summary-box .amount {
                        font-size: 36px;
                        font-weight: bold;
                        color: #28a745;
                    }
                    .items-header {
                        margin: 20px 0 10px 0;
                        padding-bottom: 5px;
                        border-bottom: 2px solid #333;
                    }
                    @media print {
                        body { margin: 0; padding: 0; }
                        .page { page-break-after: always; }
                    }
                </style>
            </head>
            <body>
                <!-- PAGE 1: Summary and Declaration -->
                <div class="page">
                    <div class="header">
                        <h1>PIGSTYLE MUSIC</h1>
                        <h2>BILL OF SALE AND OWNERSHIP DECLARATION</h2>
                        <p>Batch #${printData.batch_id} | Date: ${today}</p>
                    </div>
                    
                    <div class="seller-info">
                        <h3>Seller Information:</h3>
                        <p><strong>Name:</strong> ${this.escapeHtml(printData.seller_name || '')}</p>
                        <p><strong>Contact:</strong> ${this.escapeHtml(printData.seller_contact || '')}</p>
                        <p><strong>Batch Date:</strong> ${new Date(printData.start_date).toLocaleDateString()}</p>
                        <p><strong>Offer Percentage:</strong> ${offerPercentage}% of store price</p>
                    </div>
                    
                    <div class="summary-box">
                        <p style="font-size: 18px; margin: 0 0 10px 0;">Total Store Value</p>
                        <p class="total-store" style="font-size: 24px; margin: 0 0 20px 0;">$${totalStoreValue.toFixed(2)}</p>
                        <p style="font-size: 18px; margin: 0 0 10px 0;">Total Offer Amount</p>
                        <p class="amount">$${totalOfferAmount.toFixed(2)}</p>
                    </div>
                    
                    <div class="ownership-declaration">
                        <h3>OWNERSHIP DECLARATION</h3>
                        <p>I, <strong>${this.escapeHtml(printData.seller_name || '')}</strong>, hereby declare and warrant that:</p>
                        <p>1. I am the lawful owner of the records listed on the following pages and have full legal authority to sell them.</p>
                        <p>2. All items are free and clear of any liens, claims, or encumbrances.</p>
                        <p>3. To the best of my knowledge, these items are authentic and not counterfeit or stolen property.</p>
                        <p>4. I have the right to transfer full ownership of these items to PigStyle Music.</p>
                        <p>5. I agree to indemnify and hold PigStyle Music harmless from any claims arising from the sale of these items.</p>
                    </div>
                    
                    <div class="signature-section">
                        <p>I agree to sell the above items to PigStyle Music for the total amount of <strong>$${totalOfferAmount.toFixed(2)}</strong> and declare that all information provided is true and accurate.</p>
                        
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
                        <p>This document serves as a bill of sale and legal declaration of ownership. A detailed list of items follows on the next page(s).</p>
                    </div>
                    
                    <div class="page-number">Page 1</div>
                </div>
                
                <!-- PAGE 2: Detailed Item List -->
                <div class="page">
                    <div class="header">
                        <h2>Detailed Item List - Batch #${printData.batch_id}</h2>
                        <p>Seller: ${this.escapeHtml(printData.seller_name || '')}</p>
                    </div>
                    
                    <div class="items-header">
                        <h3>Items in this Batch (${printData.items.length} total)</h3>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Artist</th>
                                <th>Title</th>
                                <th>Catalog #</th>
                                <th>Offer Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                    
                    <div class="totals">
                        <p><strong>Total Items:</strong> ${printData.items.length}</p>
                        <p><strong>Total Offer Amount:</strong> <span class="total-offer">$${totalOfferAmount.toFixed(2)}</span></p>
                    </div>
                    
                    <div class="footer">
                        <p>This page is part of the Bill of Sale for Batch #${printData.batch_id}</p>
                    </div>
                    
                    <div class="page-number">Page 2</div>
                </div>
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }

    async completeBatch(batchId) {
        if (!confirm('Are you sure you want to complete this batch? This will mark it as finished and records will remain in inventory.')) {
            return;
        }
        
        try {
            const response = await APIUtils.post(`/api/batches/${batchId}/complete`, {});
            
            if (response.status === 'success') {
                showMessage('Batch completed successfully!', 'success');
                await this.loadBatches();
                await this.loadStats();
            } else {
                showMessage('Error completing batch: ' + (response.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error completing batch:', error);
            showMessage('Error completing batch: ' + error.message, 'error');
        }
    }

    async cancelBatch(batchId) {
        if (!confirm('WARNING: Cancelling this batch will delete ALL records that were added during this batch. This action CANNOT be undone. Are you sure?')) {
            return;
        }
        
        if (!confirm('FINAL WARNING: This will permanently delete records from the database. Type "DELETE" in the prompt to confirm.')) {
            return;
        }
        
        const confirmation = prompt('Type "DELETE" to confirm permanent deletion of all records in this batch:');
        if (confirmation !== 'DELETE') {
            showMessage('Cancellation aborted - incorrect confirmation', 'warning');
            return;
        }
        
        try {
            const response = await APIUtils.post(`/api/batches/${batchId}/cancel`, {
                delete_records: true
            });
            
            if (response.status === 'success') {
                showMessage(`Batch cancelled and ${response.deleted_records || 0} records deleted`, 'warning');
                await this.loadBatches();
                await this.loadStats();
            } else {
                showMessage('Error cancelling batch: ' + (response.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error cancelling batch:', error);
            showMessage('Error cancelling batch: ' + error.message, 'error');
        }
    }

    goToPage(page) {
        page = parseInt(page);
        if (isNaN(page) || page < 1 || page > this.totalPages) {
            this.currentPage = Math.max(1, Math.min(this.totalPages, page || 1));
        } else {
            this.currentPage = page;
        }
        this.renderTable();
    }

    changePageSize(size) {
        this.pageSize = size;
        this.totalPages = Math.ceil(this.filteredBatches.length / this.pageSize) || 1;
        this.currentPage = 1;
        this.renderTable();
    }
}

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'batches') {
        if (!window.batchManager) {
            window.batchManager = new BatchManager();
        } else {
            window.batchManager.loadBatches();
            window.batchManager.loadStats();
        }
    }
});

// Global functions for HTML onclick handlers
function goToBatchesPage(page) {
    if (window.batchManager) {
        window.batchManager.goToPage(page);
    }
}

function changeBatchesPageSize(size) {
    if (window.batchManager) {
        window.batchManager.changePageSize(size);
    }
}

function filterBatches() {
    if (window.batchManager) {
        window.batchManager.filterBatches();
    }
}

function loadBatches() {
    if (window.batchManager) {
        window.batchManager.loadBatches();
    }
}