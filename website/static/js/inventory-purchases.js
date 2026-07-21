// ============================================================
// inventory-purchases.js - Manage inventory purchases
// ============================================================

let purchaseCurrentPage = 1;
const purchasePageSize = 20;
let purchaseTotal = 0;

// Load inventory purchases on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the inventory purchases tab
    const observer = new MutationObserver(function() {
        const purchasesTab = document.getElementById('inventory-purchases-tab');
        if (purchasesTab && purchasesTab.classList.contains('active')) {
            loadInventoryPurchases();
            loadConsignorsForPurchase();
            loadPurchaseStats();
            observer.disconnect();
        }
    });
    observer.observe(document.getElementById('inventory-purchases-tab') || document.body, {
        attributes: true,
        attributeFilter: ['class']
    });
    
    // Set default date
    const dateInput = document.getElementById('purchase-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    
    // Payment type change handler
    const paymentType = document.getElementById('purchase-payment-type');
    if (paymentType) {
        paymentType.addEventListener('change', function() {
            const consignorGroup = document.getElementById('purchase-consignor-group');
            if (this.value === 'store_credit') {
                consignorGroup.style.display = 'block';
                loadConsignorsForPurchase();
            } else {
                consignorGroup.style.display = 'none';
            }
        });
    }
    
    // Search and filter events
    const searchInput = document.getElementById('purchase-search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            purchaseCurrentPage = 1;
            loadInventoryPurchases();
        });
    }
    
    const filterSelect = document.getElementById('purchase-filter');
    if (filterSelect) {
        filterSelect.addEventListener('change', function() {
            purchaseCurrentPage = 1;
            loadInventoryPurchases();
        });
    }
});

async function loadConsignorsForPurchase() {
    const select = document.getElementById('purchase-consignor');
    if (!select) return;
    try {
        const res = await fetch(`${AppConfig.baseUrl}/users`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            const consignors = data.users.filter(u => u.role === 'consignor');
            select.innerHTML = '<option value="">Select Consignor...</option>';
            consignors.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = u.full_name || u.username;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Failed to load consignors:', e);
    }
}

function previewPurchaseBill(input) {
    const preview = document.getElementById('purchase-bill-preview');
    if (!preview) return;
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" class="purchase-bill-preview" style="max-width:200px; max-height:150px; border-radius:4px; border:1px solid #ddd;">`;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        preview.style.display = 'none';
        preview.innerHTML = '';
    }
}

async function uploadBillImage(file) {
    const formData = new FormData();
    formData.append('bill_image', file);
    
    try {
        const uploadRes = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/upload-bill`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        const uploadData = await uploadRes.json();
        if (uploadData.status === 'success') {
            return uploadData.file_path;
        } else {
            throw new Error(uploadData.error || 'Upload failed');
        }
    } catch (e) {
        console.error('Upload error:', e);
        throw e;
    }
}

async function recordInventoryPurchase() {
    const date = document.getElementById('purchase-date').value;
    const sellerName = document.getElementById('purchase-seller-name').value.trim();
    const sellerContact = document.getElementById('purchase-seller-contact').value.trim();
    const amount = parseFloat(document.getElementById('purchase-amount').value);
    const description = document.getElementById('purchase-description').value.trim();
    const paymentType = document.getElementById('purchase-payment-type').value;
    const paymentAccountId = document.getElementById('purchase-payment-account').value;
    const consignorId = document.getElementById('purchase-consignor').value;
    const billImageInput = document.getElementById('purchase-bill-image');
    const billImage = billImageInput ? billImageInput.files[0] : null;
    
    // Validate
    if (!date) {
        showNotification('Please select a purchase date.', 'error');
        return;
    }
    if (!sellerName) {
        showNotification('Please enter the seller name.', 'error');
        return;
    }
    if (!amount || amount <= 0) {
        showNotification('Please enter a valid amount.', 'error');
        return;
    }
    if (paymentType === 'store_credit' && !consignorId) {
        showNotification('Please select a consignor for store credit.', 'error');
        return;
    }
    
    // Upload bill image if provided
    let billImagePath = null;
    if (billImage) {
        try {
            showNotification('Uploading bill image...', 'info');
            billImagePath = await uploadBillImage(billImage);
            console.log('Bill uploaded:', billImagePath);
        } catch (e) {
            showNotification('Failed to upload bill image: ' + e.message, 'error');
            return;
        }
    }
    
    // Create purchase
    try {
        const data = {
            purchase_date: date,
            seller_name: sellerName,
            seller_contact: sellerContact || null,
            amount_spent: amount,
            description: description || null,
            bill_of_sale_path: billImagePath,
            payment_type: paymentType,
            payment_account_id: paymentAccountId,
            consignor_id: paymentType === 'store_credit' ? parseInt(consignorId) : null
        };
        
        const res = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.status === 'success') {
            // Clear the form
            clearPurchaseForm();
            
            // Show success notification FIRST (before reloading)
            showNotification(`✅ Purchase recorded! (ID: ${result.purchase_id})`, 'success');
            
            // Reload stats
            loadPurchaseStats();
            
            // Reload the table
            loadInventoryPurchases();
            
        } else {
            showNotification('❌ Error: ' + (result.error || 'Failed to record purchase'), 'error');
        }
    } catch (e) {
        showNotification('❌ Error: ' + e.message, 'error');
    }
}

function clearPurchaseForm() {
    document.getElementById('purchase-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('purchase-seller-name').value = '';
    document.getElementById('purchase-seller-contact').value = '';
    document.getElementById('purchase-amount').value = '';
    document.getElementById('purchase-description').value = '';
    document.getElementById('purchase-bill-image').value = '';
    document.getElementById('purchase-payment-type').value = 'cash';
    document.getElementById('purchase-consignor').value = '';
    document.getElementById('purchase-payment-account').value = '1015';
    document.getElementById('purchase-consignor-group').style.display = 'none';
    const preview = document.getElementById('purchase-bill-preview');
    if (preview) {
        preview.style.display = 'none';
        preview.innerHTML = '';
    }
}

function showNotification(message, type = 'info') {
    const alert = document.getElementById('purchase-alert');
    if (!alert) {
        console.warn('Purchase alert element not found');
        return;
    }
    
    // Update the text
    const textSpan = document.getElementById('purchase-alert-text');
    if (textSpan) {
        textSpan.textContent = message;
    } else {
        alert.textContent = message;
    }
    
    alert.className = `status-message ${type}`;
    alert.style.display = 'block';
    
    // Clear any existing timeout
    if (window._purchaseAlertTimeout) {
        clearTimeout(window._purchaseAlertTimeout);
        window._purchaseAlertTimeout = null;
    }
    
    // Auto-hide after 8 seconds for non-error messages
    if (type !== 'error') {
        window._purchaseAlertTimeout = setTimeout(() => {
            alert.style.display = 'none';
        }, 8000);
    }
    
    // Scroll to notification
    alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function dismissNotification() {
    const alert = document.getElementById('purchase-alert');
    if (alert) {
        alert.style.display = 'none';
        if (window._purchaseAlertTimeout) {
            clearTimeout(window._purchaseAlertTimeout);
            window._purchaseAlertTimeout = null;
        }
    }
}

async function loadInventoryPurchases() {
    const body = document.getElementById('purchases-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">Loading purchases...</td></tr>';
    
    const search = document.getElementById('purchase-search')?.value.trim() || '';
    const filter = document.getElementById('purchase-filter')?.value || 'all';
    
    const params = new URLSearchParams();
    params.append('limit', purchasePageSize);
    params.append('offset', (purchaseCurrentPage - 1) * purchasePageSize);
    if (search) params.append('seller_name', search);
    
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases?${params.toString()}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            let purchases = data.purchases || [];
            
            // Apply client-side filters
            if (search) {
                purchases = purchases.filter(p => 
                    (p.seller_name && p.seller_name.toLowerCase().includes(search.toLowerCase())) ||
                    (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
                );
            }
            
            if (filter === 'this_month') {
                const now = new Date();
                const thisMonth = now.getMonth();
                const thisYear = now.getFullYear();
                purchases = purchases.filter(p => {
                    const d = new Date(p.purchase_date);
                    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
                });
            } else if (filter === 'last_month') {
                const now = new Date();
                const lastMonth = now.getMonth() - 1;
                const year = lastMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
                const month = lastMonth < 0 ? 11 : lastMonth;
                purchases = purchases.filter(p => {
                    const d = new Date(p.purchase_date);
                    return d.getMonth() === month && d.getFullYear() === year;
                });
            } else if (filter === 'with_bill') {
                purchases = purchases.filter(p => p.bill_of_sale_path);
            } else if (filter === 'without_bill') {
                purchases = purchases.filter(p => !p.bill_of_sale_path);
            }
            
            purchaseTotal = purchases.length;
            renderPurchases(purchases);
            updatePurchasePagination();
        } else {
            body.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#dc3545;">${data.error || 'Error loading purchases'}</td></tr>`;
        }
    } catch (e) {
        body.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#dc3545;">Error: ${e.message}</td></tr>`;
    }
}

function renderPurchases(purchases) {
    const body = document.getElementById('purchases-body');
    if (!body) return;
    if (!purchases || purchases.length === 0) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">No purchases found.</td></tr>';
        return;
    }
    let html = '';
    purchases.forEach(p => {
        const billHtml = p.bill_of_sale_path ? 
            `<a href="${p.bill_of_sale_path}" target="_blank"><img src="${p.bill_of_sale_path}" class="purchase-bill-thumb" style="max-width:80px; max-height:60px; object-fit:cover; border-radius:4px; border:1px solid #ddd; cursor:pointer;" onerror="this.style.display='none'"></a>` :
            '<span style="color:#999;">No bill</span>';
        
        html += `<tr>
            <td>${p.purchase_date}</td>
            <td><strong>${p.seller_name || 'Unknown'}</strong></td>
            <td>${p.seller_contact || '-'}</td>
            <td style="font-weight:bold; color:#28a745;">$${parseFloat(p.amount_spent).toFixed(2)}</td>
            <td>${p.description || '-'}</td>
            <td>${billHtml}</td>
            <td>
                <button class="btn btn-sm btn-info" onclick="editPurchase(${p.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deletePurchase(${p.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    body.innerHTML = html;
}

function updatePurchasePagination() {
    const totalPages = Math.ceil(purchaseTotal / purchasePageSize);
    // Simple pagination display - just show count
    const info = document.getElementById('purchases-pagination-info');
    if (info) {
        info.textContent = `Showing ${purchaseTotal} purchase${purchaseTotal !== 1 ? 's' : ''}`;
    }
}

async function loadPurchaseStats() {
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/summary`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            const totalEl = document.getElementById('total-purchases-spent');
            const monthEl = document.getElementById('month-purchases-spent');
            const countEl = document.getElementById('total-purchases-count');
            const monthCountEl = document.getElementById('month-purchases-count');
            
            if (totalEl) totalEl.textContent = '$' + data.summary.total_spent.toFixed(2);
            if (monthEl) monthEl.textContent = '$' + data.summary.month_spent.toFixed(2);
            if (countEl) countEl.textContent = data.summary.total_purchases;
            if (monthCountEl) monthCountEl.textContent = data.summary.month_purchases;
        }
    } catch (e) {
        console.error('Failed to load purchase stats:', e);
    }
}

function clearPurchaseSearch() {
    const search = document.getElementById('purchase-search');
    if (search) search.value = '';
    const filter = document.getElementById('purchase-filter');
    if (filter) filter.value = 'all';
    purchaseCurrentPage = 1;
    loadInventoryPurchases();
}

async function deletePurchase(purchaseId) {
    if (!confirm('Are you sure you want to delete this purchase? This will also delete the associated journal entry.')) {
        return;
    }
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/${purchaseId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            showNotification('✅ Purchase deleted successfully.', 'success');
            loadInventoryPurchases();
            loadPurchaseStats();
        } else {
            showNotification('❌ Error: ' + (data.error || 'Failed to delete'), 'error');
        }
    } catch (e) {
        showNotification('❌ Error: ' + e.message, 'error');
    }
}

function editPurchase(purchaseId) {
    fetch(`${AppConfig.baseUrl}/api/inventory-purchases/${purchaseId}`, {
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            const p = data.purchase;
            document.getElementById('edit-purchase-id').value = p.id;
            document.getElementById('edit-purchase-date').value = p.purchase_date;
            document.getElementById('edit-seller-name').value = p.seller_name || '';
            document.getElementById('edit-seller-contact').value = p.seller_contact || '';
            document.getElementById('edit-amount-spent').value = p.amount_spent;
            document.getElementById('edit-purchase-description').value = p.description || '';
            
            if (p.bill_of_sale_path) {
                document.getElementById('edit-bill-preview').innerHTML = `<img src="${p.bill_of_sale_path}" style="max-width:200px; max-height:150px; border-radius:4px; border:1px solid #ddd;">`;
            } else {
                document.getElementById('edit-bill-preview').innerHTML = '';
            }
            
            document.getElementById('edit-purchase-modal').style.display = 'flex';
        }
    })
    .catch(e => {
        showNotification('Error loading purchase: ' + e.message, 'error');
    });
}

function closeEditModal() {
    document.getElementById('edit-purchase-modal').style.display = 'none';
}

async function updatePurchase() {
    const id = document.getElementById('edit-purchase-id').value;
    const purchase_date = document.getElementById('edit-purchase-date').value;
    const seller_name = document.getElementById('edit-seller-name').value.trim();
    const seller_contact = document.getElementById('edit-seller-contact').value.trim();
    const amount_spent = parseFloat(document.getElementById('edit-amount-spent').value);
    const description = document.getElementById('edit-purchase-description').value.trim();
    
    if (!purchase_date || !seller_name || !amount_spent) {
        showNotification('Please fill in all required fields.', 'error');
        return;
    }
    
    try {
        const data = {
            purchase_date,
            seller_name,
            seller_contact: seller_contact || null,
            amount_spent,
            description: description || null
        };
        
        const res = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/${id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.status === 'success') {
            showNotification('✅ Purchase updated successfully.', 'success');
            closeEditModal();
            loadInventoryPurchases();
            loadPurchaseStats();
        } else {
            showNotification('❌ Error: ' + (result.error || 'Failed to update'), 'error');
        }
    } catch (e) {
        showNotification('❌ Error: ' + e.message, 'error');
    }
}

// Make functions globally accessible
window.recordInventoryPurchase = recordInventoryPurchase;
window.clearPurchaseForm = clearPurchaseForm;
window.loadInventoryPurchases = loadInventoryPurchases;
window.clearPurchaseSearch = clearPurchaseSearch;
window.deletePurchase = deletePurchase;
window.editPurchase = editPurchase;
window.previewPurchaseBill = previewPurchaseBill;
window.dismissNotification = dismissNotification;
window.showNotification = showNotification;
window.closeEditModal = closeEditModal;
window.updatePurchase = updatePurchase;