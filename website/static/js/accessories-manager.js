// Accessories Management for Admin Panel with Image Upload
let currentAccessories = [];

// Make functions global
window.loadAccessories = loadAccessories;
window.createAccessory = createAccessory;
window.clearAccessoryForm = clearAccessoryForm;
window.editAccessory = editAccessory;
window.updateAccessory = updateAccessory;
window.deleteAccessory = deleteAccessory;
window.regenerateAccessoryBarcode = regenerateAccessoryBarcode;
window.searchAccessories = searchAccessories;
window.uploadAccessoryImage = uploadAccessoryImage;
window.previewImage = previewImage;

async function loadAccessories() {
    console.log('🟢 Loading accessories...');
    const tbody = document.getElementById('accessories-body');
    const loading = document.getElementById('accessories-loading');
    
    if (!tbody) {
        console.error('❌ accessories-body element not found');
        return;
    }
    
    if (loading) loading.style.display = 'block';
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.status === 'success') {
            currentAccessories = data.accessories || [];
            renderAccessoriesTable(currentAccessories);
            updateAccessoryStats(currentAccessories);
            console.log(`✅ Loaded ${currentAccessories.length} accessories`);
        } else {
            throw new Error(data.error || 'Failed to load accessories');
        }
        
    } catch (error) {
        console.error('Error loading accessories:', error);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:40px; color: #dc3545;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
                        Error loading accessories: ${error.message}
                    </td>
                </tr>
            `;
        }
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function renderAccessoriesTable(accessories) {
    const tbody = document.getElementById('accessories-body');
    
    if (!tbody) return;
    
    if (!accessories || accessories.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:40px;">
                    <i class="fas fa-box-open" style="font-size: 48px; margin-bottom: 20px; color: #ccc; display: block;"></i>
                    No accessories found. Click "Create Accessory" to add your first item.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = accessories.map(acc => `
        <tr>
            <td>${acc.id}</td>
            <td>
                ${acc.image_url ? 
                    `<img src="${acc.image_url}" alt="${escapeHtml(acc.title)}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;" onerror="this.style.display='none'">` : 
                    '<div style="width: 50px; height: 50px; background: #f8f9fa; border-radius: 4px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-image" style="color: #ccc;"></i></div>'
                }
            </td>
            <td style="max-width: 200px;">
                <strong>${escapeHtml(acc.title)}</strong>
            </td>
            <td style="max-width: 300px;">${escapeHtml(acc.description || '—')}</td>
            <td><strong style="color: #28a745;">$${acc.store_price.toFixed(2)}</strong></td>
            <td><code class="barcode-value">${acc.bar_code}</code></td>
            <td>
                <span class="status-badge ${acc.status_id === 1 ? 'active' : 'removed'}">
                    ${acc.status_id === 1 ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div class="table-actions">
                    <button class="table-action-btn" onclick="editAccessory(${acc.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="table-action-btn" onclick="regenerateAccessoryBarcode(${acc.id})" title="Regenerate Barcode">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="table-action-btn delete-btn" onclick="deleteAccessory(${acc.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateAccessoryStats(accessories) {
    const total = accessories.length;
    const active = accessories.filter(a => a.status_id === 1).length;
    const avgPrice = accessories.reduce((sum, a) => sum + a.store_price, 0) / (total || 1);
    
    const totalEl = document.getElementById('total-accessories');
    const activeEl = document.getElementById('active-accessories');
    const avgEl = document.getElementById('avg-accessory-price');
    
    if (totalEl) totalEl.textContent = total;
    if (activeEl) activeEl.textContent = active;
    if (avgEl) avgEl.textContent = `$${avgPrice.toFixed(2)}`;
}

function previewImage(input) {
    const preview = document.getElementById('image-preview');
    const file = input.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 150px; border-radius: 8px;">`;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }
}

async function uploadAccessoryImage(accessoryId = null) {
    const fileInput = document.getElementById('accessory-image-file');
    const file = fileInput.files[0];
    
    if (!file) {
        showStatusMessage('Please select an image file first', 'error');
        return null;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    if (accessoryId) {
        formData.append('accessory_id', accessoryId);
    }
    
    try {
        showStatusMessage('Uploading image...', 'info');
        
        const response = await fetch(`${AppConfig.baseUrl}/accessories/upload-image`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showStatusMessage('Image uploaded successfully!', 'success');
            
            const imageUrlInput = document.getElementById('accessory-image-url');
            if (imageUrlInput) {
                imageUrlInput.value = result.image_url;
            }
            
            fileInput.value = '';
            const preview = document.getElementById('image-preview');
            if (preview) {
                preview.innerHTML = '';
                preview.style.display = 'none';
            }
            
            return result.image_url;
        } else {
            throw new Error(result.error || 'Upload failed');
        }
        
    } catch (error) {
        console.error('Error uploading image:', error);
        showStatusMessage(`Error: ${error.message}`, 'error');
        return null;
    }
}

async function createAccessory() {
    console.log('🟢 createAccessory called');
    const title = document.getElementById('accessory-title')?.value.trim();
    const price = parseFloat(document.getElementById('accessory-price')?.value);
    const description = document.getElementById('accessory-description')?.value.trim();
    const image_url = document.getElementById('accessory-image-url')?.value.trim();
    
    if (!title) {
        showStatusMessage('Please enter a title', 'error');
        return;
    }
    
    if (isNaN(price) || price <= 0) {
        showStatusMessage('Please enter a valid price greater than 0', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ title, price, description, image_url })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showStatusMessage('Accessory created successfully!', 'success');
            clearAccessoryForm();
            loadAccessories();
        } else {
            throw new Error(result.error || 'Failed to create accessory');
        }
        
    } catch (error) {
        console.error('Error creating accessory:', error);
        showStatusMessage(`Error: ${error.message}`, 'error');
    }
}

function clearAccessoryForm() {
    console.log('🟢 clearAccessoryForm called');
    const title = document.getElementById('accessory-title');
    const price = document.getElementById('accessory-price');
    const description = document.getElementById('accessory-description');
    const imageUrl = document.getElementById('accessory-image-url');
    const fileInput = document.getElementById('accessory-image-file');
    const preview = document.getElementById('image-preview');
    
    if (title) title.value = '';
    if (price) price.value = '';
    if (description) description.value = '';
    if (imageUrl) imageUrl.value = '';
    if (fileInput) fileInput.value = '';
    if (preview) {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }
    
    // Reset button to create mode
    const createBtn = document.querySelector('#accessories-tab .btn-success');
    if (createBtn && createBtn.getAttribute('data-update-id')) {
        createBtn.innerHTML = '<i class="fas fa-save"></i> Create Accessory';
        createBtn.onclick = () => createAccessory();
        createBtn.removeAttribute('data-update-id');
    }
    
    // Remove cancel button if exists
    const cancelBtn = document.getElementById('cancel-update-btn');
    if (cancelBtn) cancelBtn.remove();
}

function editAccessory(id) {
    console.log('🟢 editAccessory called for id:', id);
    const accessory = currentAccessories.find(a => a.id === id);
    if (!accessory) return;
    
    const titleInput = document.getElementById('accessory-title');
    const priceInput = document.getElementById('accessory-price');
    const descInput = document.getElementById('accessory-description');
    const imageInput = document.getElementById('accessory-image-url');
    const fileInput = document.getElementById('accessory-image-file');
    const preview = document.getElementById('image-preview');
    
    if (titleInput) titleInput.value = accessory.title;
    if (priceInput) priceInput.value = accessory.store_price;
    if (descInput) descInput.value = accessory.description || '';
    if (imageInput) imageInput.value = accessory.image_url || '';
    
    if (fileInput) fileInput.value = '';
    if (preview) {
        if (accessory.image_url) {
            preview.innerHTML = `<img src="${accessory.image_url}" style="max-width: 100%; max-height: 150px; border-radius: 8px;">`;
            preview.style.display = 'block';
        } else {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }
    }
    
    const createBtn = document.querySelector('#accessories-tab .btn-success');
    if (createBtn) {
        createBtn.innerHTML = '<i class="fas fa-save"></i> Update Accessory';
        createBtn.onclick = () => updateAccessory(id);
        createBtn.setAttribute('data-update-id', id);
    }
    
    if (!document.getElementById('cancel-update-btn')) {
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancel-update-btn';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel';
        cancelBtn.onclick = () => {
            clearAccessoryForm();
        };
        if (createBtn && createBtn.parentNode) {
            createBtn.parentNode.appendChild(cancelBtn);
        }
    }
    
    const formSection = document.querySelector('#accessories-tab .user-form-section');
    if (formSection) formSection.scrollIntoView({ behavior: 'smooth' });
}

async function updateAccessory(id) {
    console.log('🟢 updateAccessory called for id:', id);
    const title = document.getElementById('accessory-title')?.value.trim();
    const price = parseFloat(document.getElementById('accessory-price')?.value);
    const description = document.getElementById('accessory-description')?.value.trim();
    const image_url = document.getElementById('accessory-image-url')?.value.trim();
    
    if (!title) {
        showStatusMessage('Please enter a title', 'error');
        return;
    }
    
    if (isNaN(price) || price <= 0) {
        showStatusMessage('Please enter a valid price greater than 0', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories/${id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ title, price, description, image_url })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showStatusMessage('Accessory updated successfully!', 'success');
            clearAccessoryForm();
            loadAccessories();
        } else {
            throw new Error(result.error || 'Failed to update accessory');
        }
        
    } catch (error) {
        console.error('Error updating accessory:', error);
        showStatusMessage(`Error: ${error.message}`, 'error');
    }
}

async function deleteAccessory(id) {
    console.log('🟢 deleteAccessory called for id:', id);
    const accessory = currentAccessories.find(a => a.id === id);
    if (!accessory) return;
    
    if (!confirm(`Are you sure you want to delete "${accessory.title}"? This will mark it as inactive.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories/${id}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showStatusMessage('Accessory deleted successfully!', 'success');
            loadAccessories();
        } else {
            throw new Error(result.error || 'Failed to delete accessory');
        }
        
    } catch (error) {
        console.error('Error deleting accessory:', error);
        showStatusMessage(`Error: ${error.message}`, 'error');
    }
}

async function regenerateAccessoryBarcode(id) {
    console.log('🟢 regenerateAccessoryBarcode called for id:', id);
    if (!confirm('Regenerate barcode for this accessory? The old barcode will no longer work.')) {
        return;
    }
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories/regenerate-barcode/${id}`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showStatusMessage(`New barcode generated: ${result.new_barcode}`, 'success');
            loadAccessories();
        } else {
            throw new Error(result.error || 'Failed to regenerate barcode');
        }
        
    } catch (error) {
        console.error('Error regenerating barcode:', error);
        showStatusMessage(`Error: ${error.message}`, 'error');
    }
}

async function searchAccessories() {
    console.log('🟢 searchAccessories called');
    const query = document.getElementById('accessory-search')?.value.trim();
    
    if (!query) {
        loadAccessories();
        return;
    }
    
    const tbody = document.getElementById('accessories-body');
    const loading = document.getElementById('accessories-loading');
    
    if (loading) loading.style.display = 'block';
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories/search?q=${encodeURIComponent(query)}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.status === 'success') {
            renderAccessoriesTable(data.accessories);
            showStatusMessage(`Found ${data.count} results for "${query}"`, 'success');
        } else {
            throw new Error(data.error || 'Search failed');
        }
        
    } catch (error) {
        console.error('Error searching accessories:', error);
        showStatusMessage(`Error: ${error.message}`, 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// FIXED: No recursion - direct alert fallback
function showStatusMessage(message, type) {
    console.log(`${type.toUpperCase()}: ${message}`);
    
    // Try to use existing showStatus if available (from utils.js)
    if (typeof window.showStatus === 'function' && window.showStatus !== showStatusMessage) {
        window.showStatus(message, type);
        return;
    }
    
    // Fallback: create a temporary status div
    let statusDiv = document.getElementById('accessories-status');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'accessories-status';
        statusDiv.style.cssText = 'position: fixed; top: 80px; right: 20px; z-index: 10000; padding: 12px 20px; border-radius: 8px; font-size: 14px; display: none;';
        document.body.appendChild(statusDiv);
    }
    
    // Set colors based on type
    if (type === 'error') {
        statusDiv.style.backgroundColor = '#dc3545';
        statusDiv.style.color = 'white';
    } else if (type === 'success') {
        statusDiv.style.backgroundColor = '#28a745';
        statusDiv.style.color = 'white';
    } else {
        statusDiv.style.backgroundColor = '#17a2b8';
        statusDiv.style.color = 'white';
    }
    
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

// Auto-load when tab is shown
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        const accessoriesTab = document.querySelector('#accessories-tab');
        if (accessoriesTab && accessoriesTab.style.display !== 'none') {
            loadAccessories();
        }
    });
}