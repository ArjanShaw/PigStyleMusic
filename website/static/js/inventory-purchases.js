// ============================================================================
// inventory-purchases.js - Inventory Purchases Tab Functionality
// ============================================================================

(function() {
    'use strict';
    
    console.log('📦 inventory-purchases.js loading...');
    
    let currentPage = 1;
    let pageSize = 25;
    let totalRecords = 0;
    let currentPurchases = [];
    let currentFilter = {
        start_date: '',
        end_date: '',
        seller_name: ''
    };
    
    // DOM Elements
    let purchasesBody = null;
    let totalSpentSpan = null;
    let monthSpentSpan = null;
    let totalPurchasesSpan = null;
    let monthPurchasesSpan = null;
    let loadingDiv = null;
    let statusMessageDiv = null;
    
    // ============================================================================
    // Initialization
    // ============================================================================
    
    async function initInventoryPurchasesTab() {
        console.log('📦 Initializing Inventory Purchases Tab...');
        
        // Get DOM elements
        purchasesBody = document.getElementById('purchases-body');
        totalSpentSpan = document.getElementById('total-spent');
        monthSpentSpan = document.getElementById('month-spent');
        totalPurchasesSpan = document.getElementById('total-purchases');
        monthPurchasesSpan = document.getElementById('month-purchases');
        loadingDiv = document.getElementById('inventory-purchases-loading');
        statusMessageDiv = document.getElementById('inventory-purchases-status');
        
        // Load summary and data
        await loadSummary();
        await loadPurchases();
        
        // Setup event listeners
        setupEventListeners();
        
        console.log('✅ Inventory Purchases Tab initialized');
    }
    
    function setupEventListeners() {
        // Search form
        const searchForm = document.getElementById('purchases-search-form');
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                applyFilters();
            });
        }
        
        // Clear filters button
        const clearFiltersBtn = document.getElementById('clear-filters-btn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', clearFilters);
        }
        
        // Add purchase form
        const addForm = document.getElementById('add-purchase-form');
        if (addForm) {
            addForm.addEventListener('submit', (e) => {
                e.preventDefault();
                createPurchase();
            });
        }
        
        // Bill image upload
        const billImageInput = document.getElementById('bill-image');
        if (billImageInput) {
            billImageInput.addEventListener('change', uploadBillImage);
        }
        
        // Cancel form button
        const cancelBtn = document.getElementById('cancel-add-purchase');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', resetAddForm);
        }
        
        // Pagination
        const prevPageBtn = document.getElementById('purchases-prev-page');
        const nextPageBtn = document.getElementById('purchases-next-page');
        
        if (prevPageBtn) prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
        if (nextPageBtn) nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
        
        const pageSizeSelect = document.getElementById('purchases-page-size');
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', (e) => {
                pageSize = parseInt(e.target.value);
                currentPage = 1;
                loadPurchases();
            });
        }
    }
    
    // ============================================================================
    // Data Loading
    // ============================================================================
    
    async function loadSummary() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/summary`, {
                credentials: 'include',
                headers: AppConfig.getHeaders()
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    if (totalSpentSpan) totalSpentSpan.textContent = `$${data.summary.total_spent.toFixed(2)}`;
                    if (monthSpentSpan) monthSpentSpan.textContent = `$${data.summary.month_spent.toFixed(2)}`;
                    if (totalPurchasesSpan) totalPurchasesSpan.textContent = data.summary.total_purchases;
                    if (monthPurchasesSpan) monthPurchasesSpan.textContent = data.summary.month_purchases;
                }
            }
        } catch (error) {
            console.error('Error loading summary:', error);
        }
    }
    
    async function loadPurchases() {
        if (loadingDiv) loadingDiv.style.display = 'block';
        
        try {
            // Build query string
            const params = new URLSearchParams();
            params.append('limit', pageSize);
            params.append('offset', (currentPage - 1) * pageSize);
            
            if (currentFilter.start_date) params.append('start_date', currentFilter.start_date);
            if (currentFilter.end_date) params.append('end_date', currentFilter.end_date);
            if (currentFilter.seller_name) params.append('seller_name', currentFilter.seller_name);
            
            const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases?${params.toString()}`, {
                credentials: 'include',
                headers: AppConfig.getHeaders()
            });
            
            if (!response.ok) throw new Error('Failed to load purchases');
            
            const data = await response.json();
            
            if (data.status === 'success') {
                currentPurchases = data.purchases;
                totalRecords = data.total;
                renderPurchasesTable();
                updatePagination();
            } else {
                throw new Error(data.error || 'Failed to load purchases');
            }
            
        } catch (error) {
            console.error('Error loading purchases:', error);
            showStatus('Error loading purchases: ' + error.message, 'error');
            if (purchasesBody) {
                purchasesBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px;">Error loading purchases: ${error.message}</td></tr>`;
            }
        } finally {
            if (loadingDiv) loadingDiv.style.display = 'none';
        }
    }
    
    // ============================================================================
    // Rendering
    // ============================================================================
    
    function renderPurchasesTable() {
        if (!purchasesBody) return;
        
        if (currentPurchases.length === 0) {
            purchasesBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px;">No inventory purchases found</td></tr>`;
            return;
        }
        
        let html = '';
        currentPurchases.forEach(purchase => {
            const hasBill = purchase.bill_of_sale_path && purchase.bill_of_sale_path !== '';
            
            html += `
                <tr data-purchase-id="${purchase.id}">
                    <td>${purchase.id}</td>
                    <td>${formatDate(purchase.purchase_date)}</td>
                    <td>${escapeHtml(purchase.seller_name || '—')}</td>
                    <td>${escapeHtml(purchase.seller_contact || '—')}</td>
                    <td><strong>$${purchase.amount_spent.toFixed(2)}</strong></td>
                    <td style="max-width: 250px;">${escapeHtml(purchase.description || '—')}</td>
                    <td>
                        ${hasBill ? 
                            `<a href="${purchase.bill_of_sale_path}" target="_blank" class="bill-link" style="color: #007bff; text-decoration: none;">
                                <i class="fas fa-file-image"></i> View Bill
                            </a>` : 
                            '<span style="color: #999;">—</span>'
                        }
                    </td>
                    <td>
                        <div class="table-actions">
                            <button class="table-action-btn" onclick="window.editPurchase(${purchase.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="table-action-btn delete-btn" onclick="window.deletePurchase(${purchase.id})" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        purchasesBody.innerHTML = html;
    }
    
    function updatePagination() {
        const totalPages = Math.ceil(totalRecords / pageSize);
        const startRecord = (currentPage - 1) * pageSize + 1;
        const endRecord = Math.min(currentPage * pageSize, totalRecords);
        
        const pageInfoSpan = document.getElementById('purchases-page-info');
        if (pageInfoSpan) {
            pageInfoSpan.textContent = `Page ${currentPage} of ${totalPages || 1}`;
        }
        
        const showingSpan = document.getElementById('purchases-showing');
        if (showingSpan) {
            showingSpan.textContent = `${startRecord}-${endRecord}`;
        }
        
        const totalSpan = document.getElementById('purchases-total');
        if (totalSpan) {
            totalSpan.textContent = totalRecords;
        }
        
        const prevBtn = document.getElementById('purchases-prev-page');
        const nextBtn = document.getElementById('purchases-next-page');
        
        if (prevBtn) prevBtn.disabled = currentPage <= 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    }
    
    function goToPage(page) {
        const totalPages = Math.ceil(totalRecords / pageSize);
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        if (page === currentPage) return;
        
        currentPage = page;
        loadPurchases();
    }
    
    // ============================================================================
    // Filter Functions
    // ============================================================================
    
    function applyFilters() {
        const startDate = document.getElementById('filter-start-date')?.value || '';
        const endDate = document.getElementById('filter-end-date')?.value || '';
        const sellerName = document.getElementById('filter-seller-name')?.value || '';
        
        currentFilter = { start_date: startDate, end_date: endDate, seller_name: sellerName };
        currentPage = 1;
        loadPurchases();
    }
    
    function clearFilters() {
        const startDateInput = document.getElementById('filter-start-date');
        const endDateInput = document.getElementById('filter-end-date');
        const sellerNameInput = document.getElementById('filter-seller-name');
        
        if (startDateInput) startDateInput.value = '';
        if (endDateInput) endDateInput.value = '';
        if (sellerNameInput) sellerNameInput.value = '';
        
        currentFilter = { start_date: '', end_date: '', seller_name: '' };
        currentPage = 1;
        loadPurchases();
    }
    
    // ============================================================================
    // Create/Edit/Delete Functions
    // ============================================================================
    
    let currentBillPath = '';
    
    async function uploadBillImage(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('bill_image', file);
        
        showStatus('Uploading image...', 'info');
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/upload-bill`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                currentBillPath = data.file_path;
                const previewDiv = document.getElementById('bill-preview');
                if (previewDiv) {
                    previewDiv.innerHTML = `
                        <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; padding: 10px; margin-top: 10px;">
                            <i class="fas fa-check-circle" style="color: #28a745;"></i>
                            File uploaded: ${data.filename}
                            <button type="button" class="btn btn-sm btn-secondary" onclick="clearBillImage()" style="margin-left: 10px;">Remove</button>
                        </div>
                    `;
                }
                showStatus('Bill of sale uploaded successfully', 'success');
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('Upload error:', error);
            showStatus('Error uploading file: ' + error.message, 'error');
        }
    }
    
    window.clearBillImage = function() {
        currentBillPath = '';
        const previewDiv = document.getElementById('bill-preview');
        if (previewDiv) previewDiv.innerHTML = '';
        const fileInput = document.getElementById('bill-image');
        if (fileInput) fileInput.value = '';
        showStatus('Bill image cleared', 'info');
    };
    
    async function createPurchase() {
        const purchaseDate = document.getElementById('purchase-date')?.value || new Date().toISOString().split('T')[0];
        const sellerName = document.getElementById('seller-name')?.value || '';
        const sellerContact = document.getElementById('seller-contact')?.value || '';
        const amountSpent = parseFloat(document.getElementById('amount-spent')?.value || '0');
        const description = document.getElementById('purchase-description')?.value || '';
        
        if (!amountSpent || amountSpent <= 0) {
            showStatus('Please enter a valid amount spent', 'error');
            return;
        }
        
        const data = {
            purchase_date: purchaseDate,
            seller_name: sellerName,
            seller_contact: sellerContact,
            amount_spent: amountSpent,
            description: description,
            bill_of_sale_path: currentBillPath
        };
        
        showStatus('Saving purchase...', 'info');
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders(),
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                showStatus('Purchase recorded successfully!', 'success');
                resetAddForm();
                await loadSummary();
                await loadPurchases();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Create error:', error);
            showStatus('Error creating purchase: ' + error.message, 'error');
        }
    }
    
    window.editPurchase = async function(purchaseId) {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/${purchaseId}`, {
                credentials: 'include',
                headers: AppConfig.getHeaders()
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                const purchase = result.purchase;
                
                // Populate edit form
                document.getElementById('edit-purchase-id').value = purchase.id;
                document.getElementById('edit-purchase-date').value = purchase.purchase_date;
                document.getElementById('edit-seller-name').value = purchase.seller_name || '';
                document.getElementById('edit-seller-contact').value = purchase.seller_contact || '';
                document.getElementById('edit-amount-spent').value = purchase.amount_spent;
                document.getElementById('edit-purchase-description').value = purchase.description || '';
                
                // Show existing bill preview
                const editBillPreview = document.getElementById('edit-bill-preview');
                if (purchase.bill_of_sale_path) {
                    editBillPreview.innerHTML = `
                        <div style="background: #cce5ff; border: 1px solid #b8daff; border-radius: 4px; padding: 10px; margin-bottom: 10px;">
                            <i class="fas fa-file-image"></i> Current bill: 
                            <a href="${purchase.bill_of_sale_path}" target="_blank">View Bill</a>
                            <button type="button" class="btn btn-sm btn-secondary" onclick="removeCurrentBill()" style="margin-left: 10px;">Remove</button>
                        </div>
                    `;
                    window.currentEditBillPath = purchase.bill_of_sale_path;
                } else {
                    editBillPreview.innerHTML = '';
                    window.currentEditBillPath = '';
                }
                
                document.getElementById('edit-purchase-modal').style.display = 'flex';
            }
        } catch (error) {
            showStatus('Error loading purchase: ' + error.message, 'error');
        }
    };
    
    window.updatePurchase = async function() {
        const purchaseId = document.getElementById('edit-purchase-id').value;
        const purchaseDate = document.getElementById('edit-purchase-date').value;
        const sellerName = document.getElementById('edit-seller-name').value;
        const sellerContact = document.getElementById('edit-seller-contact').value;
        const amountSpent = parseFloat(document.getElementById('edit-amount-spent').value);
        const description = document.getElementById('edit-purchase-description').value;
        
        if (!amountSpent || amountSpent <= 0) {
            showStatus('Please enter a valid amount spent', 'error');
            return;
        }
        
        const data = {
            purchase_date: purchaseDate,
            seller_name: sellerName,
            seller_contact: sellerContact,
            amount_spent: amountSpent,
            description: description,
            bill_of_sale_path: window.currentEditBillPath
        };
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/${purchaseId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: AppConfig.getHeaders(),
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                showStatus('Purchase updated successfully!', 'success');
                closeEditModal();
                await loadSummary();
                await loadPurchases();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            showStatus('Error updating purchase: ' + error.message, 'error');
        }
    };
    
    window.removeCurrentBill = function() {
        window.currentEditBillPath = '';
        const editBillPreview = document.getElementById('edit-bill-preview');
        editBillPreview.innerHTML = '<div class="info-message" style="background: #fff3cd; padding: 10px; border-radius: 4px;">Bill removed. You can upload a new one.</div>';
    };
    
    window.uploadEditBillImage = async function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('bill_image', file);
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/upload-bill`, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                window.currentEditBillPath = data.file_path;
                const previewDiv = document.getElementById('edit-bill-preview');
                previewDiv.innerHTML = `
                    <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; padding: 10px; margin-bottom: 10px;">
                        <i class="fas fa-check-circle" style="color: #28a745;"></i>
                        New bill uploaded: ${data.filename}
                        <button type="button" class="btn btn-sm btn-secondary" onclick="removeCurrentBill()" style="margin-left: 10px;">Remove</button>
                    </div>
                `;
                showStatus('New bill uploaded', 'success');
            }
        } catch (error) {
            showStatus('Upload error: ' + error.message, 'error');
        }
    };
    
    window.deletePurchase = async function(purchaseId) {
        if (!confirm('Are you sure you want to delete this purchase? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/${purchaseId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: AppConfig.getHeaders()
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                showStatus('Purchase deleted successfully', 'success');
                await loadSummary();
                await loadPurchases();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            showStatus('Error deleting purchase: ' + error.message, 'error');
        }
    };
    
    function resetAddForm() {
        document.getElementById('purchase-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('seller-name').value = '';
        document.getElementById('seller-contact').value = '';
        document.getElementById('amount-spent').value = '';
        document.getElementById('purchase-description').value = '';
        clearBillImage();
    }
    
    function closeEditModal() {
        document.getElementById('edit-purchase-modal').style.display = 'none';
        window.currentEditBillPath = '';
    }
    
    // ============================================================================
    // Utility Functions
    // ============================================================================
    
    function formatDate(dateStr) {
        if (!dateStr) return '—';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString();
        } catch {
            return dateStr;
        }
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function showStatus(message, type = 'info') {
        if (!statusMessageDiv) return;
        
        statusMessageDiv.textContent = message;
        statusMessageDiv.className = `status-message status-${type}`;
        statusMessageDiv.style.display = 'block';
        
        setTimeout(() => {
            if (statusMessageDiv) {
                statusMessageDiv.style.display = 'none';
            }
        }, 5000);
    }
    
    // ============================================================================
    // Global Exports
    // ============================================================================
    
    window.initInventoryPurchasesTab = initInventoryPurchasesTab;
    window.editPurchase = editPurchase;
    window.deletePurchase = deletePurchase;
    window.updatePurchase = updatePurchase;
    window.closeEditModal = closeEditModal;
    window.uploadEditBillImage = uploadEditBillImage;
    window.removeCurrentBill = removeCurrentBill;
    window.clearBillImage = clearBillImage;
    
    console.log('✅ inventory-purchases.js loaded');
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInventoryPurchasesTab);
    } else {
        initInventoryPurchasesTab();
    }
})();