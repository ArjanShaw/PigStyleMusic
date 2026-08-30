// Email Subscriptions page
(function() {
    let subscriptions = [];
    let currentEditId = null;
    let currentPage = 1;
    const pageSize = 50;
    let filteredSubscriptions = [];
    let searchTimeout = null;

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Load subscriptions
    async function loadSubscriptions() {
        const list = document.getElementById('es-list');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const searchTerm = document.getElementById('es-search')?.value || '';
            
            let url = `${API_BASE}/api/subscriptions?limit=500`;
            if (searchTerm) {
                url += `&search=${encodeURIComponent(searchTerm)}`;
            }
            
            const response = await fetch(url, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                subscriptions = data.subscriptions || [];
                
                // Apply search filter locally for instant updates
                applyLocalFilters(searchTerm);
                
                renderSubscriptions();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading subscriptions:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Apply local filters (instant search)
    function applyLocalFilters(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            filteredSubscriptions = [...subscriptions];
            return;
        }
        
        const term = searchTerm.toLowerCase().trim();
        filteredSubscriptions = subscriptions.filter(sub => {
            const email = (sub.email || '').toLowerCase();
            const artist = (sub.artist || '').toLowerCase();
            const title = (sub.title || '').toLowerCase();
            const catalog = (sub.catalog_number || '').toLowerCase();
            
            return email.includes(term) || 
                   artist.includes(term) || 
                   title.includes(term) || 
                   catalog.includes(term);
        });
    }

    // Render subscriptions
    function renderSubscriptions() {
        const list = document.getElementById('es-list');
        if (!list) return;
        
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredSubscriptions.length);
        const pageData = filteredSubscriptions.slice(start, end);
        
        if (!pageData || pageData.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No subscriptions found</div>';
            updatePagination();
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Email</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Artist</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Title</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Catalog</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Read</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Created</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        pageData.forEach(sub => {
            const statusClass = sub.is_active ? 'active' : 'inactive';
            const statusText = sub.is_active ? '✅ Active' : '⛔ Inactive';
            const readClass = sub.is_read ? 'read' : 'unread';
            const readText = sub.is_read ? 'Read' : '🔔 New';
            
            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${sub.id}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${sub.email || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${sub.artist || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${sub.title || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-family: monospace; font-size: 11px;">${sub.catalog_number || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${readClass}">${readText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${sub.created_at ? new Date(sub.created_at).toLocaleDateString() : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="esEdit(${sub.id})" style="padding: 4px 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="esToggleStatus(${sub.id})" style="padding: 4px 8px; background: ${sub.is_active ? '#ffc107' : '#28a745'}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;">
                        <i class="fas ${sub.is_active ? 'fa-pause' : 'fa-play'}"></i>
                    </button>
                    <button onclick="esDelete(${sub.id})" style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
        updatePagination();
    }

    // Update pagination
    function updatePagination() {
        const total = filteredSubscriptions.length;
        const totalPages = Math.ceil(total / pageSize) || 1;
        
        const pageInfo = document.getElementById('es-page-info');
        const prevBtn = document.getElementById('es-prev-page');
        const nextBtn = document.getElementById('es-next-page');
        const totalRecords = document.getElementById('es-total-records');
        
        if (pageInfo) {
            pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        }
        if (prevBtn) {
            prevBtn.disabled = currentPage <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = currentPage >= totalPages;
        }
        if (totalRecords) {
            totalRecords.textContent = filteredSubscriptions.length;
        }
    }

    // Handle instant search with debounce
    function handleSearch() {
        // Clear previous timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        // Debounce search to avoid too many API calls
        searchTimeout = setTimeout(() => {
            const searchTerm = document.getElementById('es-search')?.value || '';
            
            // Apply local filter instantly
            applyLocalFilters(searchTerm);
            currentPage = 1;
            renderSubscriptions();
            
            // Also fetch from server with search term (debounced)
            loadSubscriptions();
        }, 300);
    }

    // Show add modal
    window.esShowAdd = function() {
        currentEditId = null;
        document.getElementById('es-modal-title').textContent = '➕ Add Subscription';
        document.getElementById('es-edit-id').value = '';
        document.getElementById('es-email').value = '';
        document.getElementById('es-artist').value = '';
        document.getElementById('es-title').value = '';
        document.getElementById('es-catalog').value = '';
        document.getElementById('es-status').value = '1';
        document.getElementById('es-modal-status').style.display = 'none';
        document.getElementById('es-save-btn').innerHTML = '<i class="fas fa-save"></i> Save';
        document.getElementById('es-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('es-email').focus(), 100);
    };

    // Edit subscription
    window.esEdit = function(id) {
        const sub = subscriptions.find(s => s.id === id);
        if (!sub) {
            alert('Subscription not found');
            return;
        }
        
        currentEditId = id;
        document.getElementById('es-modal-title').textContent = `✏️ Edit Subscription #${id}`;
        document.getElementById('es-edit-id').value = id;
        document.getElementById('es-email').value = sub.email || '';
        document.getElementById('es-artist').value = sub.artist || '';
        document.getElementById('es-title').value = sub.title || '';
        document.getElementById('es-catalog').value = sub.catalog_number || '';
        document.getElementById('es-status').value = sub.is_active ? '1' : '0';
        document.getElementById('es-modal-status').style.display = 'none';
        document.getElementById('es-save-btn').innerHTML = '<i class="fas fa-save"></i> Update';
        document.getElementById('es-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('es-email').focus(), 100);
    };

    // Close modal
    window.esCloseModal = function() {
        document.getElementById('es-modal').style.display = 'none';
        currentEditId = null;
    };

    // Save subscription
    window.esSave = async function() {
        const id = document.getElementById('es-edit-id').value;
        const email = document.getElementById('es-email').value.trim();
        const artist = document.getElementById('es-artist').value.trim();
        const title = document.getElementById('es-title').value.trim();
        const catalog = document.getElementById('es-catalog').value.trim();
        const isActive = document.getElementById('es-status').value === '1';
        
        if (!email) {
            showModalStatus('Email is required', 'error');
            return;
        }
        if (!email.includes('@') || !email.includes('.')) {
            showModalStatus('Please enter a valid email address', 'error');
            return;
        }
        if (!artist && !title && !catalog) {
            showModalStatus('At least one search term (artist, title, or catalog) is required', 'error');
            return;
        }
        
        const data = {
            email: email,
            artist: artist || null,
            title: title || null,
            catalog_number: catalog || null,
            is_active: isActive
        };
        
        const btn = document.getElementById('es-save-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        
        try {
            const url = id ? `${API_BASE}/api/subscriptions/${id}` : `${API_BASE}/api/subscribe`;
            const method = id ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showModalStatus('✅ Subscription saved successfully!', 'success');
                setTimeout(() => {
                    esCloseModal();
                    loadSubscriptions();
                }, 1000);
            } else {
                showModalStatus(`❌ Error: ${result.error || 'Failed to save'}`, 'error');
            }
        } catch (err) {
            console.error('Error saving subscription:', err);
            showModalStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    // Toggle status
    window.esToggleStatus = async function(id) {
        const sub = subscriptions.find(s => s.id === id);
        if (!sub) return;
        
        const newStatus = !sub.is_active;
        const action = newStatus ? 'activate' : 'deactivate';
        
        if (!confirm(`${action} subscription for ${sub.email}?`)) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/subscriptions/${id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ is_active: newStatus })
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showToast(`✅ Subscription ${action}d`);
                loadSubscriptions();
            } else {
                alert(`Error: ${result.error || 'Failed to update'}`);
            }
        } catch (err) {
            console.error('Error toggling status:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // Delete subscription
    window.esDelete = async function(id) {
        const sub = subscriptions.find(s => s.id === id);
        if (!sub) return;
        
        if (!confirm(`Delete subscription for ${sub.email}? This cannot be undone.`)) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/subscriptions/${id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getHeaders()
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showToast('✅ Subscription deleted');
                loadSubscriptions();
            } else {
                alert(`Error: ${result.error || 'Failed to delete'}`);
            }
        } catch (err) {
            console.error('Error deleting subscription:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // Mark all as read
    window.esMarkAllRead = async function() {
        if (!confirm('Mark all subscriptions as read?')) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/subscriptions/mark-all-read`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showToast('✅ All marked as read');
                loadSubscriptions();
            } else {
                alert(`Error: ${result.error || 'Failed to mark all as read'}`);
            }
        } catch (err) {
            console.error('Error marking all as read:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // Clear filters
    window.esClearFilters = function() {
        document.getElementById('es-search').value = '';
        currentPage = 1;
        loadSubscriptions();
    };

    // Pagination
    window.esPrevPage = function() {
        if (currentPage > 1) {
            currentPage--;
            renderSubscriptions();
        }
    };

    window.esNextPage = function() {
        const totalPages = Math.ceil(filteredSubscriptions.length / pageSize) || 1;
        if (currentPage < totalPages) {
            currentPage++;
            renderSubscriptions();
        }
    };

    // Modal status
    function showModalStatus(message, type) {
        const statusDiv = document.getElementById('es-modal-status');
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

    // Toast
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            background: ${bgColor};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 400px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Initialize search with instant updates
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('es-search');
        if (searchInput) {
            // Listen for input events (instant search)
            searchInput.addEventListener('input', handleSearch);
            
            // Also handle enter key for immediate search
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    // Clear timeout and search immediately
                    if (searchTimeout) {
                        clearTimeout(searchTimeout);
                        searchTimeout = null;
                    }
                    const searchTerm = this.value || '';
                    applyLocalFilters(searchTerm);
                    currentPage = 1;
                    renderSubscriptions();
                    loadSubscriptions();
                }
            });
        }
    });

    // Close modal on outside click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('es-modal');
        if (modal && e.target === modal) {
            esCloseModal();
        }
    });

    // Init
    window.initEmailSubscriptions = function() {
        console.log('Email Subscriptions initialized');
        loadSubscriptions();
    };
})();