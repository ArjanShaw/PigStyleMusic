// ============================================================
// inventory-purchases.js – Inventory Purchases Management
// ============================================================

let currentPurchasePage = 1;
let purchasePageSize = 50;
let totalPurchases = 0;

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('inventory-purchases-tab');
    if (!container) return;

    // Load purchases when tab is shown
    const tab = document.querySelector('[data-tab="inventory-purchases"]');
    if (tab) {
        tab.addEventListener('click', function() {
            setTimeout(loadPurchases, 100);
        });
    }

    // Setup form submission
    const form = document.getElementById('add-purchase-form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            submitPurchase();
        });
    }

    // Setup cancel button
    const cancelBtn = document.getElementById('cancel-add-purchase');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            clearPurchaseForm();
        });
    }

    // Setup clear filters button
    const clearFilters = document.getElementById('clear-filters-btn');
    if (clearFilters) {
        clearFilters.addEventListener('click', function() {
            document.getElementById('filter-start-date').value = '';
            document.getElementById('filter-end-date').value = '';
            document.getElementById('filter-seller-name').value = '';
            loadPurchases();
        });
    }

    // Setup search form
    const searchForm = document.getElementById('purchases-search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            loadPurchases();
        });
    }

    // Setup pagination
    document.getElementById('purchases-prev-page')?.addEventListener('click', function() {
        if (currentPurchasePage > 1) {
            currentPurchasePage--;
            loadPurchases();
        }
    });

    document.getElementById('purchases-next-page')?.addEventListener('click', function() {
        const totalPages = Math.ceil(totalPurchases / purchasePageSize);
        if (currentPurchasePage < totalPages) {
            currentPurchasePage++;
            loadPurchases();
        }
    });

    document.getElementById('purchases-page-size')?.addEventListener('change', function() {
        purchasePageSize = parseInt(this.value);
        currentPurchasePage = 1;
        loadPurchases();
    });

    // Set default date
    const dateInput = document.getElementById('purchase-date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }

    // Load initial data
    loadPurchases();
    loadPurchaseStats();
});

// ============================================================
// LOAD PURCHASES
// ============================================================

async function loadPurchases() {
    const tbody = document.getElementById('purchases-body');
    const loading = document.getElementById('inventory-purchases-loading');
    
    if (loading) loading.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px;">Loading...</td></tr>';

    const params = new URLSearchParams();
    const startDate = document.getElementById('filter-start-date')?.value;
    const endDate = document.getElementById('filter-end-date')?.value;
    const sellerName = document.getElementById('filter-seller-name')?.value;

    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (sellerName) params.append('seller_name', sellerName);

    params.append('limit', purchasePageSize);
    params.append('offset', (currentPurchasePage - 1) * purchasePageSize);

    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases?${params.toString()}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Please log in as admin to manage inventory purchases');
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (data.status === 'success') {
            totalPurchases = data.total || 0;
            renderPurchases(data.purchases || []);
            updatePagination();
        } else {
            throw new Error(data.error || 'Failed to load purchases');
        }

    } catch (error) {
        console.error('Error loading purchases:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:40px; color:#dc3545;">
                    <i class="fas fa-exclamation-triangle" style="font-size:24px; margin-bottom:10px; display:block;"></i>
                    Error loading purchases: ${error.message}
                </td>
            </tr>
        `;
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function renderPurchases(purchases) {
    const tbody = document.getElementById('purchases-body');
    
    if (!purchases || purchases.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:40px;">
                    <i class="fas fa-box-open" style="font-size:48px; margin-bottom:20px; color:#ccc; display:block;"></i>
                    No inventory purchases found. Record your first purchase above!
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = purchases.map(p => `
        <tr>
            <td>${p.id}</td>
            <td>${formatDate(p.purchase_date)}</td>
            <td>${escapeHtml(p.seller_name || '—')}</td>
            <td>${escapeHtml(p.seller_contact || '—')}</td>
            <td><strong>$${p.amount_spent.toFixed(2)}</strong></td>
            <td>${escapeHtml(p.description || '—')}</td>
            <td>
                ${p.bill_of_sale_path ? 
                    `<a href="${p.bill_of_sale_path}" target="_blank" class="btn btn-small btn-info">
                        <i class="fas fa-file-image"></i> View
                    </a>` : 
                    '<span style="color:#999;">No bill</span>'
                }
            </td>
            <td>
                <div class="table-actions">
                    <button class="table-action-btn" onclick="editPurchase(${p.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="table-action-btn delete-btn" onclick="deletePurchase(${p.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updatePagination() {
    const totalPages = Math.ceil(totalPurchases / purchasePageSize) || 1;
    document.getElementById('purchases-showing').textContent = totalPurchases > 0 ? ((currentPurchasePage - 1) * purchasePageSize + 1) : 0;
    document.getElementById('purchases-total-filtered').textContent = totalPurchases;
    document.getElementById('purchases-total').textContent = totalPurchases;
    document.getElementById('purchases-page-info').textContent = `Page ${currentPurchasePage}`;
    document.getElementById('purchases-prev-page').disabled = currentPurchasePage <= 1;
    document.getElementById('purchases-next-page').disabled = currentPurchasePage >= totalPages;
}

// ============================================================
// SUBMIT PURCHASE
// ============================================================

async function submitPurchase() {
    const form = document.getElementById('add-purchase-form');
    const status = document.getElementById('inventory-purchases-status');
    const loading = document.getElementById('inventory-purchases-loading');

    // Get form data
    const purchaseDate = document.getElementById('purchase-date').value;
    const sellerName = document.getElementById('seller-name').value.trim();
    const sellerContact = document.getElementById('seller-contact').value.trim();
    const amountSpent = parseFloat(document.getElementById('amount-spent').value);
    const description = document.getElementById('purchase-description').value.trim();
    // ===== NEW: Payment account ID =====
    const paymentAccountId = document.getElementById('payment-account-select')?.value || null;
    // ===================================

    // Validation
    if (!purchaseDate) {
        showStatus('Please select a purchase date', 'error');
        return;
    }

    if (isNaN(amountSpent) || amountSpent <= 0) {
        showStatus('Please enter a valid amount greater than 0', 'error');
        return;
    }

    if (!sellerName) {
        showStatus('Please enter the seller name', 'error');
        return;
    }

    const data = {
        purchase_date: purchaseDate,
        seller_name: sellerName,
        seller_contact: sellerContact,
        amount_spent: amountSpent,
        description: description,
        payment_account_id: paymentAccountId  // NEW
    };

    // Handle bill image upload first if present
    const billFile = document.getElementById('bill-image').files[0];
    let billPath = null;

    if (billFile) {
        const formData = new FormData();
        formData.append('bill_image', billFile);
        
        try {
            showStatus('Uploading bill image...', 'info');
            const uploadRes = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/upload-bill`, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            
            const uploadData = await uploadRes.json();
            if (uploadData.status === 'success') {
                billPath = uploadData.file_path;
                showStatus('Bill image uploaded', 'success');
            } else {
                showStatus(`Image upload failed: ${uploadData.error}`, 'error');
                return;
            }
        } catch (error) {
            showStatus(`Image upload error: ${error.message}`, 'error');
            return;
        }
    }

    if (billPath) {
        data.bill_of_sale_path = billPath;
    }

    // Submit purchase
    if (loading) loading.style.display = 'block';
    showStatus('Recording purchase...', 'info');

    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (result.status === 'success') {
            showStatus(`✅ Purchase recorded successfully! (ID: ${result.purchase.id})`, 'success');
            clearPurchaseForm();
            loadPurchases();
            loadPurchaseStats();
        } else {
            throw new Error(result.error || 'Failed to record purchase');
        }

    } catch (error) {
        console.error('Error recording purchase:', error);
        showStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// ============================================================
// EDIT PURCHASE
// ============================================================

function editPurchase(id) {
    // Fetch purchase details and populate modal
    fetch(`${AppConfig.baseUrl}/api/inventory-purchases/${id}`, {
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
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
            document.getElementById('edit-purchase-modal').style.display = 'flex';
        } else {
            alert('Failed to load purchase details');
        }
    })
    .catch(err => {
        console.error('Error loading purchase:', err);
        alert('Error loading purchase details');
    });
}

window.editPurchase = editPurchase;

function closeEditModal() {
    document.getElementById('edit-purchase-modal').style.display = 'none';
}

window.closeEditModal = closeEditModal;

function uploadEditBillImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('bill_image', file);

    fetch(`${AppConfig.baseUrl}/api/inventory-purchases/upload-bill`, {
        method: 'POST',
        credentials: 'include',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            document.getElementById('edit-bill-preview').innerHTML = `
                <p style="color:#28a745; margin-top:10px;">
                    <i class="fas fa-check-circle"></i> Uploaded: ${data.filename}
                </p>
            `;
            // Store the path for update
            document.getElementById('edit-purchase-id').dataset.billPath = data.file_path;
        } else {
            alert('Upload failed: ' + data.error);
        }
    })
    .catch(err => {
        alert('Upload error: ' + err.message);
    });
}

window.uploadEditBillImage = uploadEditBillImage;

async function updatePurchase() {
    const id = document.getElementById('edit-purchase-id').value;
    const data = {
        purchase_date: document.getElementById('edit-purchase-date').value,
        seller_name: document.getElementById('edit-seller-name').value,
        seller_contact: document.getElementById('edit-seller-contact').value,
        amount_spent: parseFloat(document.getElementById('edit-amount-spent').value),
        description: document.getElementById('edit-purchase-description').value
    };

    const billPath = document.getElementById('edit-purchase-id').dataset.billPath;
    if (billPath) {
        data.bill_of_sale_path = billPath;
    }

    if (isNaN(data.amount_spent) || data.amount_spent <= 0) {
        alert('Please enter a valid amount');
        return;
    }

    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/${id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.status === 'success') {
            alert('Purchase updated successfully!');
            closeEditModal();
            loadPurchases();
            loadPurchaseStats();
        } else {
            alert('Error: ' + (result.error || 'Failed to update'));
        }
    } catch (err) {
        console.error('Error updating purchase:', err);
        alert('Error: ' + err.message);
    }
}

window.updatePurchase = updatePurchase;

// ============================================================
// DELETE PURCHASE
// ============================================================

async function deletePurchase(id) {
    if (!confirm('Are you sure you want to delete this purchase record? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/${id}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        const result = await response.json();

        if (result.status === 'success') {
            showStatus('Purchase deleted successfully', 'success');
            loadPurchases();
            loadPurchaseStats();
        } else {
            alert('Error: ' + (result.error || 'Failed to delete'));
        }
    } catch (err) {
        console.error('Error deleting purchase:', err);
        alert('Error: ' + err.message);
    }
}

window.deletePurchase = deletePurchase;

// ============================================================
// STATS
// ============================================================

async function loadPurchaseStats() {
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/summary`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error('Failed to load stats');

        const data = await response.json();

        if (data.status === 'success') {
            document.getElementById('total-spent').textContent = `$${data.summary.total_spent.toFixed(2)}`;
            document.getElementById('month-spent').textContent = `$${data.summary.month_spent.toFixed(2)}`;
            document.getElementById('total-purchases').textContent = data.summary.total_purchases;
            document.getElementById('month-purchases').textContent = data.summary.month_purchases;
        }
    } catch (error) {
        console.error('Error loading purchase stats:', error);
    }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function clearPurchaseForm() {
    document.getElementById('purchase-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('seller-name').value = '';
    document.getElementById('seller-contact').value = '';
    document.getElementById('amount-spent').value = '';
    document.getElementById('purchase-description').value = '';
    document.getElementById('bill-image').value = '';
    document.getElementById('bill-preview').innerHTML = '';
    document.getElementById('payment-account-select').value = ''; // NEW
}

function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('inventory-purchases-status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
    if (type !== 'error') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}

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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// IMAGE PREVIEW FOR BILL UPLOAD
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    const billInput = document.getElementById('bill-image');
    if (billInput) {
        billInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            const preview = document.getElementById('bill-preview');
            if (file) {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = function(ev) {
                        preview.innerHTML = `
                            <div style="margin-top:10px;">
                                <img src="${ev.target.result}" alt="Bill preview" style="max-width:200px; max-height:200px; border-radius:4px; border:1px solid #ddd;">
                                <p style="font-size:12px; color:#666; margin-top:5px;">${file.name}</p>
                            </div>
                        `;
                    };
                    reader.readAsDataURL(file);
                } else {
                    preview.innerHTML = `
                        <div style="margin-top:10px; color:#666;">
                            <i class="fas fa-file-pdf"></i> ${file.name}
                        </div>
                    `;
                }
            } else {
                preview.innerHTML = '';
            }
        });
    }
});