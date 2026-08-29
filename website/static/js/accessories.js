// Accessories page
(function() {
    let accessories = [];
    let currentEditId = null;

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Load accessories
    async function loadAccessories(searchTerm) {
        const list = document.getElementById('acc-list');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            let url = `${API_BASE}/accessories?limit=500`;
            if (searchTerm && searchTerm.trim()) {
                url += `&search=${encodeURIComponent(searchTerm.trim())}`;
            }
            
            const response = await fetch(url, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                accessories = data.items || data.accessories || [];
                renderAccessories(accessories);
                updateStats(accessories);
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading accessories:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Render accessories
    function renderAccessories(items) {
        const list = document.getElementById('acc-list');
        if (!list) return;
        
        if (!items || items.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No accessories found</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Title</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Description</th>
                    <th style="padding: 8px 10px; text-align: right; color: #333;">Price</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        items.forEach(item => {
            const statusClass = item.status === 'active' ? 'active' : 'inactive';
            const statusText = item.status === 'active' ? '✅ Active' : '⛔ Inactive';
            
            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${item.id}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">
                    ${item.image_url ? `<img src="${item.image_url}" style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px; margin-right: 8px; vertical-align: middle;">` : ''}
                    ${item.title || 'Unknown'}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.description || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; color: #28a745; font-weight: 600;">$${(item.price || 0).toFixed(2)}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="accEdit(${item.id})" style="padding: 4px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="accDelete(${item.id})" style="padding: 4px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // Update stats
    function updateStats(items) {
        const total = items.length;
        const active = items.filter(i => i.status === 'active').length;
        const inactive = items.filter(i => i.status === 'inactive').length;
        const avgPrice = total > 0 ? items.reduce((sum, i) => sum + (i.price || 0), 0) / total : 0;
        
        document.getElementById('acc-total').textContent = total;
        document.getElementById('acc-active').textContent = active;
        document.getElementById('acc-inactive').textContent = inactive;
        document.getElementById('acc-avg-price').textContent = `$${avgPrice.toFixed(2)}`;
    }

    // Show add modal
    window.accShowAdd = function() {
        currentEditId = null;
        document.getElementById('acc-modal-title').textContent = '➕ Add Accessory';
        document.getElementById('acc-edit-id').value = '';
        document.getElementById('acc-title').value = '';
        document.getElementById('acc-price').value = '';
        document.getElementById('acc-description').value = '';
        document.getElementById('acc-image').value = '';
        document.getElementById('acc-status').value = 'active';
        document.getElementById('acc-modal-status').style.display = 'none';
        document.getElementById('acc-save-btn').innerHTML = '<i class="fas fa-save"></i> Save';
        document.getElementById('acc-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('acc-title').focus(), 100);
    };

    // Edit accessory
    window.accEdit = function(id) {
        const item = accessories.find(a => a.id === id);
        if (!item) {
            alert('Accessory not found');
            return;
        }
        
        currentEditId = id;
        document.getElementById('acc-modal-title').textContent = `✏️ Edit Accessory #${id}`;
        document.getElementById('acc-edit-id').value = id;
        document.getElementById('acc-title').value = item.title || '';
        document.getElementById('acc-price').value = item.price || '';
        document.getElementById('acc-description').value = item.description || '';
        document.getElementById('acc-image').value = item.image_url || '';
        document.getElementById('acc-status').value = item.status || 'active';
        document.getElementById('acc-modal-status').style.display = 'none';
        document.getElementById('acc-save-btn').innerHTML = '<i class="fas fa-save"></i> Update';
        document.getElementById('acc-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('acc-title').focus(), 100);
    };

    // Close modal
    window.accCloseModal = function() {
        document.getElementById('acc-modal').style.display = 'none';
        currentEditId = null;
    };

    // Save accessory
    window.accSave = async function() {
        const id = document.getElementById('acc-edit-id').value;
        const title = document.getElementById('acc-title').value.trim();
        const price = parseFloat(document.getElementById('acc-price').value);
        const description = document.getElementById('acc-description').value.trim();
        const imageUrl = document.getElementById('acc-image').value.trim();
        const status = document.getElementById('acc-status').value;
        
        if (!title) {
            showModalStatus('Title is required', 'error');
            return;
        }
        if (!price || price <= 0) {
            showModalStatus('Please enter a valid price', 'error');
            return;
        }
        
        const data = {
            title: title,
            price: price,
            description: description || null,
            image_url: imageUrl || null,
            status: status
        };
        
        const btn = document.getElementById('acc-save-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        
        try {
            const url = id ? `${API_BASE}/accessories/${id}` : `${API_BASE}/accessories`;
            const method = id ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showModalStatus('✅ Accessory saved successfully!', 'success');
                setTimeout(() => {
                    accCloseModal();
                    loadAccessories(document.getElementById('acc-search').value);
                }, 1000);
            } else {
                showModalStatus(`❌ Error: ${result.error || 'Failed to save'}`, 'error');
            }
        } catch (err) {
            console.error('Error saving accessory:', err);
            showModalStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    // Delete accessory
    window.accDelete = async function(id) {
        const item = accessories.find(a => a.id === id);
        if (!item) {
            alert('Accessory not found');
            return;
        }
        
        if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/accessories/${id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getHeaders()
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showToast('✅ Accessory deleted successfully');
                loadAccessories(document.getElementById('acc-search').value);
            } else {
                alert(`Error: ${result.error || 'Failed to delete'}`);
            }
        } catch (err) {
            console.error('Error deleting accessory:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // Show modal status
    function showModalStatus(message, type) {
        const statusDiv = document.getElementById('acc-modal-status');
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        const colors = {
            success: '#d4edda',
            error: '#f8d7da',
            warning: '#fff3cd',
            info: '#cce5ff'
        };
        const textColors = {
            success: '#155724',
            error: '#721c24',
            warning: '#856404',
            info: '#004085'
        };
        statusDiv.style.background = colors[type] || '#f8f9fa';
        statusDiv.style.color = textColors[type] || '#333';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

    // Toast notification
    function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            background: #28a745;
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Search
    window.accSearch = function() {
        const searchInput = document.getElementById('acc-search');
        loadAccessories(searchInput.value);
    };

    window.accClear = function() {
        document.getElementById('acc-search').value = '';
        loadAccessories('');
    };

    window.accRefresh = function() {
        loadAccessories(document.getElementById('acc-search').value);
    };

    // Enter key search
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('acc-search');
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    accSearch();
                }
            });
        }
    });

    // Close modal on outside click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('acc-modal');
        if (modal && e.target === modal) {
            accCloseModal();
        }
    });

    // Init
    window.initAccessories = function() {
        console.log('Accessories initialized');
        loadAccessories('');
    };
})();
