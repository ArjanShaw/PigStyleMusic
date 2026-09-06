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
                
                // Mark all as read when loading the page
                await markAllFeedbackRead();
                
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

    // Mark all feedback as read
    window.markAllFeedbackRead = async function() {
        try {
            const response = await fetch(`${API_BASE}/api/feedback/mark-all-read`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
            const result = await response.json();
            if (result.status === 'success') {
                console.log('✅ All feedback marked as read');
                showToast('✅ All feedback marked as read');
                // Update local data
                feedbackItems.forEach(item => item.notified = 1);
                renderFeedback();
            }
        } catch (err) {
            console.error('Error marking all feedback as read:', err);
            showToast('❌ Error marking all as read', 'error');
        }
    };

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
            const name = (item.name || '').toLowerCase();
            
            return content.includes(term) || 
                   contact.includes(term) || 
                   name.includes(term);
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
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Name</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Content</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Contact</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Created</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        pageData.forEach(item => {
            const contentPreview = item.content ? item.content.substring(0, 100) + (item.content.length > 100 ? '...' : '') : '—';
            const isNew = item.notified === 0 || item.notified === false || item.notified === null;
            
            html += `<tr style="${isNew ? 'background: #fff3cd;' : ''}">
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${item.id}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${item.name || 'Anonymous'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${contentPreview}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${item.contact_info || '—'}</td>
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
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        searchTimeout = setTimeout(() => {
            const searchTerm = document.getElementById('fb-search')?.value || '';
            applyLocalFilters(searchTerm);
            currentPage = 1;
            renderFeedback();
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
            if (!item.notified) {
                await markFeedbackRead(id);
                item.notified = 1;
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
        const isRead = item.notified === 1 || item.notified === true;
        
        body.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">ID</label>
                    <div style="color: #333; font-weight: 600;">#${item.id}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Status</label>
                    <div style="color: #333;">
                        <span class="status-badge ${isRead ? 'read' : 'new'}">${isRead ? 'Read' : 'New'}</span>
                    </div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Name</label>
                    <div style="color: #333; background: #f8f9fa; padding: 8px 12px; border-radius: 4px;">${item.name || 'Anonymous'}</div>
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
            </div>
        `;
    }

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

    // Delete feedback
    window.fbDelete = async function(id) {
        const item = feedbackItems.find(f => f.id === id);
        if (!item) return;
        
        const name = item.name || 'anonymous';
        if (!confirm(`Delete feedback from ${name}? This cannot be undone.`)) return;
        
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

    // Delete from modal
    window.fbDeleteFromModal = function() {
        const id = document.getElementById('fb-view-id').value;
        if (id) {
            fbCloseModal();
            setTimeout(() => fbDelete(parseInt(id)), 300);
        }
    };

    // Clear search
    window.fbClearSearch = function() {
        document.getElementById('fb-search').value = '';
        currentPage = 1;
        applyLocalFilters('');
        renderFeedback();
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

    // Export CSV
    window.fbExportCSV = function() {
        if (!feedbackItems || feedbackItems.length === 0) {
            showToast('No feedback to export', 'info');
            return;
        }
        
        let csv = 'ID,Name,Content,Contact,Created,Read\n';
        feedbackItems.forEach(item => {
            const readStatus = item.notified ? 'Read' : 'New';
            csv += `${item.id},"${(item.name || 'Anonymous').replace(/"/g, '""')}","${(item.content || '').replace(/"/g, '""')}","${(item.contact_info || '').replace(/"/g, '""')}",${item.created_at || ''},${readStatus}\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `feedback_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast('✅ CSV exported successfully');
    };

    // Initialize search with instant updates
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('fb-search');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearch);
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    if (searchTimeout) {
                        clearTimeout(searchTimeout);
                        searchTimeout = null;
                    }
                    const searchTerm = this.value || '';
                    applyLocalFilters(searchTerm);
                    currentPage = 1;
                    renderFeedback();
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