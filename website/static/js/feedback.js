// Feedback page
(function() {
    let feedbackItems = [];
    let filteredItems = [];
    let currentPage = 1;
    const pageSize = 50;
    let currentViewId = null;
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

    // Load feedback
    async function loadFeedback() {
        const list = document.getElementById('fb-list');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const searchTerm = document.getElementById('fb-search')?.value || '';
            
            let url = `${API_BASE}/api/feedback?limit=500`;
            if (searchTerm) {
                url += `&search=${encodeURIComponent(searchTerm)}`;
            }
            
            const response = await fetch(url, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                feedbackItems = data.feedback || [];
                
                // Apply local search filter for instant updates
                applyLocalFilters(searchTerm);
                
                renderFeedback();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading feedback:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Apply local filters (instant search)
    function applyLocalFilters(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            filteredItems = [...feedbackItems];
            return;
        }
        
        const term = searchTerm.toLowerCase().trim();
        filteredItems = feedbackItems.filter(item => {
            const content = (item.content || '').toLowerCase();
            const contact = (item.contact_info || '').toLowerCase();
            const type = (item.type_of_feedback || '').toLowerCase();
            const event = (item.event_name || '').toLowerCase();
            
            return content.includes(term) || 
                   contact.includes(term) || 
                   type.includes(term) || 
                   event.includes(term);
        });
    }

    // Render feedback
    function renderFeedback() {
        const list = document.getElementById('fb-list');
        if (!list) return;
        
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredItems.length);
        const pageData = filteredItems.slice(start, end);
        
        if (!pageData || pageData.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No feedback found</div>';
            updatePagination();
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Type</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Content</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Contact</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Created</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        pageData.forEach(item => {
            const statusClass = item.status === 'new' ? 'new' :
                               item.status === 'read' ? 'read' :
                               item.status === 'responded' ? 'responded' :
                               item.status === 'archived' ? 'archived' : '';
            const statusText = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : '—';
            const typeText = item.type_of_feedback ? item.type_of_feedback.charAt(0).toUpperCase() + item.type_of_feedback.slice(1) : '—';
            const contentPreview = item.content ? item.content.substring(0, 100) + (item.content.length > 100 ? '...' : '') : '—';
            
            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${item.id}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">
                    <span class="status-badge ${item.type_of_feedback || 'general'}">${typeText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${contentPreview}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${item.contact_info || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="fbView(${item.id})" style="padding: 4px 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="fbDelete(${item.id})" style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
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
        const total = filteredItems.length;
        const totalPages = Math.ceil(total / pageSize) || 1;
        
        const pageInfo = document.getElementById('fb-page-info');
        const prevBtn = document.getElementById('fb-prev-page');
        const nextBtn = document.getElementById('fb-next-page');
        const totalRecords = document.getElementById('fb-total-records');
        
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
            totalRecords.textContent = filteredItems.length;
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
            const searchTerm = document.getElementById('fb-search')?.value || '';
            
            // Apply local filter instantly
            applyLocalFilters(searchTerm);
            currentPage = 1;
            renderFeedback();
            
            // Also fetch from server with search term (debounced)
            loadFeedback();
        }, 300);
    }

    // View feedback
    window.fbView = async function(id) {
        currentViewId = id;
        document.getElementById('fb-modal-title').textContent = `💬 Feedback #${id}`;
        document.getElementById('fb-view-id').value = id;
        document.getElementById('fb-modal-body').innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        document.getElementById('fb-modal-status').style.display = 'none';
        document.getElementById('fb-modal').style.display = 'flex';
        
        try {
            const item = feedbackItems.find(f => f.id === id);
            if (!item) {
                document.getElementById('fb-modal-body').innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Feedback not found</div>';
                return;
            }
            
            // Mark as read if new
            if (item.status === 'new') {
                await markFeedbackRead(id);
                item.status = 'read';
                renderFeedback();
            }
            
            renderFeedbackDetails(item);
        } catch (err) {
            console.error('Error viewing feedback:', err);
            document.getElementById('fb-modal-body').innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    };

    // Render feedback details
    function renderFeedbackDetails(item) {
        const body = document.getElementById('fb-modal-body');
        
        const statusOptions = ['new', 'read', 'responded', 'archived'];
        let statusSelect = `<select id="fb-status-select" style="width: 100%; padding: 8px; border: 2px solid #ddd; border-radius: 8px;">`;
        statusOptions.forEach(s => {
            const selected = s === item.status ? 'selected' : '';
            statusSelect += `<option value="${s}" ${selected}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`;
        });
        statusSelect += `</select>`;
        
        body.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Type</label>
                    <div style="color: #333; font-weight: 600;">${item.type_of_feedback ? item.type_of_feedback.charAt(0).toUpperCase() + item.type_of_feedback.slice(1) : '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Status</label>
                    ${statusSelect}
                </div>
                <div style="grid-column: 1 / -1;">
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Content</label>
                    <div style="color: #333; background: #f8f9fa; padding: 12px; border-radius: 4px; white-space: pre-wrap;">${item.content || 'No content'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Contact Info</label>
                    <div style="color: #333;">${item.contact_info || 'Not provided'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Created</label>
                    <div style="color: #333;">${item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</div>
                </div>
                ${item.event_name ? `
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Event</label>
                    <div style="color: #333;">${item.event_name}</div>
                </div>
                ` : ''}
                ${item.updated_at ? `
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Last Updated</label>
                    <div style="color: #333;">${new Date(item.updated_at).toLocaleString()}</div>
                </div>
                ` : ''}
            </div>
        `;
    }

    // Update status
    window.fbUpdateStatus = async function() {
        const id = document.getElementById('fb-view-id').value;
        const status = document.getElementById('fb-status-select')?.value;
        if (!id || !status) return;
        
        const item = feedbackItems.find(f => f.id == id);
        if (!item) return;
        
        if (item.status === status) {
            showModalStatus('No change to status', 'info');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/feedback/${id}/status`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ status: status })
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showModalStatus('✅ Feedback status updated!', 'success');
                item.status = status;
                renderFeedback();
                setTimeout(() => {
                    fbCloseModal();
                }, 1000);
            } else {
                showModalStatus(`❌ Error: ${result.error || 'Failed to update'}`, 'error');
            }
        } catch (err) {
            console.error('Error updating feedback:', err);
            showModalStatus(`❌ Error: ${err.message}`, 'error');
        }
    };

    // Mark as read
    async function markFeedbackRead(id) {
        try {
            await fetch(`${API_BASE}/api/feedback/${id}/mark-read`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
        } catch (err) {
            console.error('Error marking read:', err);
        }
    }

    // Mark all as read
    window.fbMarkAllRead = async function() {
        const newCount = feedbackItems.filter(f => f.status === 'new').length;
        if (newCount === 0) {
            showToast('No new feedback to mark', 'info');
            return;
        }
        
        if (!confirm(`Mark all ${newCount} feedback items as read?`)) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/feedback/mark-all-read`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showToast('✅ All feedback marked as read');
                feedbackItems.forEach(f => { if (f.status === 'new') f.status = 'read'; });
                renderFeedback();
            } else {
                alert(`Error: ${result.error || 'Failed to mark all as read'}`);
            }
        } catch (err) {
            console.error('Error marking all as read:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // Delete feedback
    window.fbDelete = async function(id) {
        const item = feedbackItems.find(f => f.id === id);
        if (!item) return;
        
        if (!confirm(`Delete this feedback item from ${item.contact_info || 'anonymous'}? This cannot be undone.`)) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/feedback/${id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getHeaders()
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showToast('✅ Feedback deleted');
                feedbackItems = feedbackItems.filter(f => f.id !== id);
                filteredItems = filteredItems.filter(f => f.id !== id);
                renderFeedback();
                if (currentViewId == id) {
                    fbCloseModal();
                }
            } else {
                alert(`Error: ${result.error || 'Failed to delete'}`);
            }
        } catch (err) {
            console.error('Error deleting feedback:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // Export CSV
    window.fbExportCSV = function() {
        if (feedbackItems.length === 0) {
            showToast('No feedback to export', 'info');
            return;
        }
        
        let csv = 'ID,Type,Content,Contact,Status,Created,Event\n';
        feedbackItems.forEach(f => {
            csv += `${f.id},${f.type_of_feedback || ''},"${(f.content || '').replace(/"/g,'""')}","${f.contact_info || ''}",${f.status || ''},${f.created_at || ''},${f.event_name || ''}\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `feedback_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('✅ CSV exported');
    };

    // Clear search
    window.fbClearSearch = function() {
        document.getElementById('fb-search').value = '';
        currentPage = 1;
        loadFeedback();
    };

    // Pagination
    window.fbPrevPage = function() {
        if (currentPage > 1) {
            currentPage--;
            renderFeedback();
        }
    };

    window.fbNextPage = function() {
        const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
        if (currentPage < totalPages) {
            currentPage++;
            renderFeedback();
        }
    };

    // Close modal
    window.fbCloseModal = function() {
        document.getElementById('fb-modal').style.display = 'none';
        currentViewId = null;
    };

    // Modal status
    function showModalStatus(message, type) {
        const statusDiv = document.getElementById('fb-modal-status');
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
        const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'info' ? '#17a2b8' : '#ffc107';
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
        const searchInput = document.getElementById('fb-search');
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
                    renderFeedback();
                    loadFeedback();
                }
            });
        }
    });

    // Close modal on outside click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('fb-modal');
        if (modal && e.target === modal) {
            fbCloseModal();
        }
    });

    // Init
    window.initFeedback = function() {
        console.log('Feedback initialized');
        loadFeedback();
    };
})();