// Email List page - Admin management of newsletter subscribers
(function() {
    let subscribers = [];
    let filteredSubscribers = [];
    let currentPage = 1;
    const pageSize = 50;

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Load subscribers
    async function loadSubscribers() {
        const list = document.getElementById('el-list');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const searchTerm = document.getElementById('el-search')?.value || '';
            
            let url = `${API_BASE}/api/admin/email-list?limit=500`;
            if (searchTerm) {
                url += `&search=${encodeURIComponent(searchTerm)}`;
            }
            
            console.log('📋 Fetching email list from:', url);
            
            const response = await fetch(url, {
                credentials: 'include',
                headers: getHeaders()
            });
            
            console.log('📋 Response status:', response.status);
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response:', text.substring(0, 200));
                throw new Error(`Server returned non-JSON response (status: ${response.status})`);
            }
            
            const data = await response.json();
            console.log('📋 Email list data:', data);
            
            if (data.status === 'success') {
                subscribers = data.subscribers || [];
                filteredSubscribers = [...subscribers];
                renderSubscribers();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading subscribers:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Render subscribers
    function renderSubscribers() {
        const list = document.getElementById('el-list');
        if (!list) return;
        
        const search = document.getElementById('el-search')?.value.toLowerCase().trim() || '';
        let display = filteredSubscribers;
        if (search) {
            display = filteredSubscribers.filter(s => 
                (s.email || '').toLowerCase().includes(search)
            );
        }
        
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, display.length);
        const pageData = display.slice(start, end);
        
        if (!pageData || pageData.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No subscribers found</div>';
            updatePagination(display.length);
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Email</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Subscribed Date</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        pageData.forEach((sub, idx) => {
            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${sub.id}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${sub.email || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${sub.created_at ? new Date(sub.created_at).toLocaleString() : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="elDelete(${sub.id})" style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
        updatePagination(display.length);
    }

    // Update pagination
    function updatePagination(total) {
        const totalPages = Math.ceil(total / pageSize) || 1;
        
        const pageInfo = document.getElementById('el-page-info');
        const prevBtn = document.getElementById('el-prev-page');
        const nextBtn = document.getElementById('el-next-page');
        const totalRecords = document.getElementById('el-total-records');
        
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
            totalRecords.textContent = total;
        }
    }

    // Search
    window.elSearch = function() {
        currentPage = 1;
        renderSubscribers();
    };

    window.elClearSearch = function() {
        document.getElementById('el-search').value = '';
        currentPage = 1;
        renderSubscribers();
    };

    // Refresh
    window.elRefresh = function() {
        loadSubscribers();
    };

    // Pagination
    window.elPrevPage = function() {
        if (currentPage > 1) {
            currentPage--;
            renderSubscribers();
        }
    };

    window.elNextPage = function() {
        const total = document.getElementById('el-total-records')?.textContent || 0;
        const totalPages = Math.ceil(parseInt(total) / pageSize) || 1;
        if (currentPage < totalPages) {
            currentPage++;
            renderSubscribers();
        }
    };

    // Delete subscriber
    window.elDelete = async function(id) {
        const sub = subscribers.find(s => s.id === id);
        if (!sub) {
            showToast('Subscriber not found', 'error');
            return;
        }
        
        if (!confirm(`Delete subscriber "${sub.email}"? This cannot be undone.`)) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/admin/email-list/${id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getHeaders()
            });
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response:', text.substring(0, 200));
                throw new Error('Server returned non-JSON response');
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                showToast(`✅ ${data.message || 'Subscriber deleted'}`, 'success');
                loadSubscribers();
            } else {
                showToast(`❌ Error: ${data.error || 'Failed to delete'}`, 'error');
            }
        } catch (err) {
            console.error('Error deleting subscriber:', err);
            showToast(`❌ Error: ${err.message}`, 'error');
        }
    };

    // Export CSV
    window.elExportCSV = function() {
        if (subscribers.length === 0) {
            showToast('No subscribers to export', 'info');
            return;
        }
        
        try {
            // Use window.open to trigger download directly
            const url = `${API_BASE}/api/admin/email-list/export`;
            window.open(url, '_blank');
            showToast('✅ CSV export started');
        } catch (err) {
            console.error('Error exporting CSV:', err);
            showToast(`❌ Error: ${err.message}`, 'error');
        }
    };

    // Toast notification
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

    // Enter key search
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('el-search');
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    elSearch();
                }
            });
        }
    });

    // Init
    window.initEmailList = function() {
        console.log('📋 Email List initialized with API_BASE:', API_BASE);
        loadSubscribers();
    };
})();