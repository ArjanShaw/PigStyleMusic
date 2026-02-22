// ============================================================================
// accessories.js - Accessories Tab Functionality
// ============================================================================

// Accessories variables
let allAccessories = [];
let filteredAccessories = [];
let currentEditAccessoryId = null;
let currentDeleteAccessoryId = null;
let selectedAccessories = new Set();

async function loadAccessories() {
    showAccessoriesLoading(true);
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories`);
        const data = await response.json();
        
        if (data.status === 'success') {
            allAccessories = data.accessories || [];
            filteredAccessories = [...allAccessories];
            
            renderAccessories();
        } else {
            throw new Error(data.message || 'Failed to load accessories');
        }
    } catch (error) {
        console.error('Error loading accessories:', error);
        const tbody = document.getElementById('accessories-body');
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#dc3545;">
            <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
            Error loading accessories: ${error.message}
        </td></tr>`;
    }
    
    showAccessoriesLoading(false);
}

function filterAccessories() {
    const searchTerm = document.getElementById('accessory-search').value.toLowerCase().trim();
    const stockFilter = document.getElementById('stock-filter').value;
    
    filteredAccessories = allAccessories.filter(accessory => {
        if (searchTerm) {
            const matchesSearch = accessory.description.toLowerCase().includes(searchTerm) ||
                                 accessory.bar_code.toLowerCase().includes(searchTerm);
            if (!matchesSearch) return false;
        }
        
        if (stockFilter === 'low' && (accessory.count > 5 || accessory.count <= 0)) return false;
        if (stockFilter === 'negative' && accessory.count >= 0) return false;
        if (stockFilter === 'in' && accessory.count <= 0) return false;
        
        return true;
    });
    
    renderAccessories();
}

function renderAccessories() {
    const tbody = document.getElementById('accessories-body');
    
    if (filteredAccessories.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px;">
            <i class="fas fa-headphones" style="font-size: 48px; margin-bottom: 20px; color: #ccc; display: block;"></i>
            No accessories found
        </td></tr>`;
        updateAccessorySelectionButtons();
        return;
    }
    
    let html = '';
    filteredAccessories.forEach(acc => {
        const stockClass = acc.count < 0 ? 'out-of-stock' : 
                         acc.count <= 5 ? 'low-stock' : '';
        const isSelected = selectedAccessories.has(acc.id);
        
        html += `
            <tr class="${stockClass}">
                <td><input type="checkbox" class="accessory-checkbox" data-id="${acc.id}" ${isSelected ? 'checked' : ''}></td>
                <td>${acc.id}</td>
                <td><strong>${escapeHtml(acc.description)}</strong></td>
                <td><span class="barcode-cell">${escapeHtml(acc.bar_code)}</span></td>
                <td>$${acc.store_price.toFixed(2)}</td>
                <td class="${acc.count < 0 ? 'negative-stock' : ''}">${acc.count}</td>
                <td>${formatDate(acc.created_at)}</td>
                <td>
                    <div class="accessory-actions">
                        <button class="btn btn-sm btn-warning" onclick="editAccessory(${acc.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteAccessory(${acc.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    document.querySelectorAll('.accessory-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const id = parseInt(this.getAttribute('data-id'));
            if (this.checked) {
                selectedAccessories.add(id);
            } else {
                selectedAccessories.delete(id);
            }
            updateAccessorySelectionButtons();
        });
    });
    
    const selectAllCheckbox = document.getElementById('select-all-accessories');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.accessory-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
                const id = parseInt(checkbox.getAttribute('data-id'));
                if (this.checked) {
                    selectedAccessories.add(id);
                } else {
                    selectedAccessories.delete(id);
                }
            });
            updateAccessorySelectionButtons();
        });
    }
    
    updateAccessorySelectionButtons();
}

function updateAccessorySelectionButtons() {
    const hasSelection = selectedAccessories.size > 0;
    document.getElementById('print-accessories-btn').disabled = !hasSelection;
}

function selectAllAccessoriesOnPage() {
    const checkboxes = document.querySelectorAll('.accessory-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        const id = parseInt(checkbox.getAttribute('data-id'));
        selectedAccessories.add(id);
    });
    updateAccessorySelectionButtons();
    showStatus(`Selected all accessories on this page`, 'success');
}

function clearAccessorySelection() {
    selectedAccessories.clear();
    document.querySelectorAll('.accessory-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    updateAccessorySelectionButtons();
    showStatus('Accessory selection cleared', 'info');
}

function showAddAccessoryForm() {
    document.getElementById('form-title').innerHTML = '<i class="fas fa-plus-circle"></i> Add New Accessory';
    document.getElementById('accessory-description').value = '';
    document.getElementById('accessory-price').value = '';
    document.getElementById('accessory-count').value = '0';
    document.getElementById('accessory-form').style.display = 'block';
    document.getElementById('add-new-btn-container').style.display = 'none';
}

function cancelAccessoryForm() {
    document.getElementById('accessory-form').style.display = 'none';
    document.getElementById('add-new-btn-container').style.display = 'block';
}

async function saveAccessory() {
    const description = document.getElementById('accessory-description').value.trim();
    const price = parseFloat(document.getElementById('accessory-price').value);
    const count = parseInt(document.getElementById('accessory-count').value) || 0;
    
    if (!description) {
        alert('Description is required');
        return;
    }
    
    if (isNaN(price) || price < 0) {
        alert('Please enter a valid price');
        return;
    }
    
    const saveBtn = document.querySelector('#accessory-form .btn-success');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Saving...';
    saveBtn.disabled = true;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                description: description,
                store_price: price,
                count: count
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatus('Accessory added successfully', 'success');
            cancelAccessoryForm();
            await loadAccessories();
        } else {
            throw new Error(data.message || 'Failed to add accessory');
        }
    } catch (error) {
        console.error('Error adding accessory:', error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

function editAccessory(id) {
    const accessory = allAccessories.find(a => a.id === id);
    if (!accessory) return;
    
    currentEditAccessoryId = id;
    
    document.getElementById('edit-accessory-description').value = accessory.description;
    document.getElementById('edit-accessory-price').value = accessory.store_price;
    document.getElementById('edit-accessory-count').value = accessory.count;
    
    const previewDiv = document.getElementById('edit-barcode-preview');
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, accessory.bar_code, {
        format: "CODE128",
        displayValue: true,
        fontSize: 16,
        height: 50,
        width: 2,
        margin: 10
    });
    previewDiv.innerHTML = '';
    previewDiv.appendChild(canvas);
    
    document.getElementById('accessory-edit-modal').style.display = 'flex';
}

function closeAccessoryEditModal() {
    document.getElementById('accessory-edit-modal').style.display = 'none';
    currentEditAccessoryId = null;
}

async function updateAccessory() {
    if (!currentEditAccessoryId) return;
    
    const description = document.getElementById('edit-accessory-description').value.trim();
    const price = parseFloat(document.getElementById('edit-accessory-price').value);
    const count = parseInt(document.getElementById('edit-accessory-count').value) || 0;
    
    if (!description) {
        alert('Description is required');
        return;
    }
    
    if (isNaN(price) || price < 0) {
        alert('Please enter a valid price');
        return;
    }
    
    const saveBtn = document.querySelector('#accessory-edit-modal .btn-success');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Saving...';
    saveBtn.disabled = true;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories/${currentEditAccessoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                description: description,
                store_price: price,
                count: count
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatus('Accessory updated successfully', 'success');
            closeAccessoryEditModal();
            await loadAccessories();
        } else {
            throw new Error(data.message || 'Failed to update accessory');
        }
    } catch (error) {
        console.error('Error updating accessory:', error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

async function regenerateAccessoryBarcode() {
    if (!currentEditAccessoryId) return;
    
    if (!confirm('Are you sure you want to regenerate the barcode? This will create a new unique barcode.')) {
        return;
    }
    
    const regenBtn = document.getElementById('regenerate-barcode-btn');
    const originalText = regenBtn.innerHTML;
    regenBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Generating...';
    regenBtn.disabled = true;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories/${currentEditAccessoryId}/generate-barcode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatus('Barcode regenerated successfully', 'success');
            
            const previewDiv = document.getElementById('edit-barcode-preview');
            const canvas = document.createElement('canvas');
            JsBarcode(canvas, data.bar_code, {
                format: "CODE128",
                displayValue: true,
                fontSize: 16,
                height: 50,
                width: 2,
                margin: 10
            });
            previewDiv.innerHTML = '';
            previewDiv.appendChild(canvas);
            
            await loadAccessories();
        } else {
            throw new Error(data.message || 'Failed to regenerate barcode');
        }
    } catch (error) {
        console.error('Error regenerating barcode:', error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        regenBtn.innerHTML = originalText;
        regenBtn.disabled = false;
    }
}

function deleteAccessory(id) {
    const accessory = allAccessories.find(a => a.id === id);
    if (!accessory) return;
    
    currentDeleteAccessoryId = id;
    document.getElementById('delete-accessory-description').textContent = accessory.description;
    document.getElementById('accessory-delete-modal').style.display = 'flex';
}

function closeAccessoryDeleteModal() {
    document.getElementById('accessory-delete-modal').style.display = 'none';
    currentDeleteAccessoryId = null;
}

async function confirmDeleteAccessory() {
    if (!currentDeleteAccessoryId) return;
    
    const deleteBtn = document.querySelector('#accessory-delete-modal .btn-danger');
    const originalText = deleteBtn.innerHTML;
    deleteBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Deleting...';
    deleteBtn.disabled = true;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories/${currentDeleteAccessoryId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatus('Accessory deleted successfully', 'success');
            closeAccessoryDeleteModal();
            await loadAccessories();
        } else {
            throw new Error(data.message || 'Failed to delete accessory');
        }
    } catch (error) {
        console.error('Error deleting accessory:', error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        deleteBtn.innerHTML = originalText;
        deleteBtn.disabled = false;
    }
}

// Visual barcode printing function for accessories
function printAccessoryBarcodes() {
    if (selectedAccessories.size === 0) {
        showStatus('No accessories selected for printing', 'error');
        return;
    }
    
    const selectedItems = allAccessories.filter(acc => selectedAccessories.has(acc.id));
    
    const printWindow = window.open('', '_blank');
    
    let barcodeHtml = '<html><head><title>Accessory Barcodes</title>';
    barcodeHtml += '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><' + '/script>';
    barcodeHtml += '<style>';
    barcodeHtml += 'body { font-family: Arial, sans-serif; padding: 20px; }';
    barcodeHtml += '.barcode-page { page-break-after: always; }';
    barcodeHtml += '.barcode-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }';
    barcodeHtml += '.barcode-item { text-align: center; padding: 15px; border: 1px solid #ddd; border-radius: 8px; page-break-inside: avoid; }';
    barcodeHtml += '.barcode-item svg { max-width: 100%; height: auto; }';
    barcodeHtml += '.barcode-description { font-weight: bold; margin: 10px 0 5px; }';
    barcodeHtml += '.barcode-price { color: #27ae60; font-size: 1.2rem; }';
    barcodeHtml += '@media print { .no-print { display: none; } }';
    barcodeHtml += '</style>';
    barcodeHtml += '</head><body>';
    barcodeHtml += '<div class="no-print" style="margin-bottom: 20px; text-align: center;">';
    barcodeHtml += '<button onclick="window.print()" style="padding: 10px 20px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer;">Print Barcodes</button>';
    barcodeHtml += '</div>';
    
    for (let i = 0; i < selectedItems.length; i += 8) {
        if (i > 0) {
            barcodeHtml += '<div class="barcode-page" style="page-break-before: always;"></div>';
        }
        barcodeHtml += '<div class="barcode-grid">';
        
        for (let j = i; j < Math.min(i + 8, selectedItems.length); j++) {
            const item = selectedItems[j];
            barcodeHtml += '<div class="barcode-item">';
            barcodeHtml += `<canvas id="barcode-${j}" style="width: 100%; height: auto;"></canvas>`;
            barcodeHtml += `<div class="barcode-description">${escapeHtml(item.description)}</div>`;
            barcodeHtml += `<div class="barcode-price">$${item.store_price.toFixed(2)}</div>`;
            barcodeHtml += `<div style="font-family: monospace; color: #666; font-size: 0.8rem; margin-top: 5px;">${escapeHtml(item.bar_code)}</div>`;
            barcodeHtml += '</div>';
        }
        
        barcodeHtml += '</div>';
    }
    
    barcodeHtml += '<script>';
    barcodeHtml += 'window.onload = function() {';
    
    for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        barcodeHtml += `JsBarcode("#barcode-${i}", "${item.bar_code}", { format: "CODE128", displayValue: false, height: 60, width: 2 });`;
    }
    
    barcodeHtml += '}';
    barcodeHtml += '<' + '/script>';
    barcodeHtml += '</body></html>';
    
    printWindow.document.write(barcodeHtml);
    printWindow.document.close();
}

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'accessories') {
        loadAccessories();
    }
});