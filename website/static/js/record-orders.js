// Record Orders page — customer vinyl request management
(function() {
    let orders = [];
    let filteredOrders = [];
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

    // ---- Status display helpers ----
    const STATUS_LABELS = {
        'pending':    'Pending',
        'processing': 'Processing',
        'ordered':    'Ordered',
        'received':   'Received',
        'cancelled':  'Cancelled'
    };

    function statusClass(status) {
        return status || 'pending';
    }

    function statusText(status) {
        return STATUS_LABELS[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : '—');
    }

    // ============ LOAD ============
    async function loadOrders() {
        const list = document.getElementById('ro-list');
        if (!list) return;

        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';

        try {
            const response = await fetch(`${API_BASE}/api/record-orders?per_page=500`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();

            if (data.status === 'success') {
                orders = data.orders || [];
                await markAllOrdersRead();
                applyLocalFilters(document.getElementById('ro-search')?.value || '');
                renderOrders();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading record orders:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // ============ MARK ALL READ ============
    window.roMarkAllRead = async function() {
        await markAllOrdersRead();
        showToast('✅ All record requests marked as read');
        // Refresh local state so badges update
        orders = orders.map(o => ({ ...o, notified: true }));
        renderOrders();
    };

    async function markAllOrdersRead() {
        try {
            await fetch(`${API_BASE}/api/record-orders/mark-all-read`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
        } catch (err) {
            console.error('Error marking all record orders as read:', err);
        }
    }

    async function markOrderRead(id) {
        try {
            await fetch(`${API_BASE}/api/record-orders/${id}/mark-read`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
        } catch (err) {
            console.error('Error marking record order read:', err);
        }
    }

    // ============ LOCAL FILTER ============
    function applyLocalFilters(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            filteredOrders = [...orders];
            return;
        }
        const term = searchTerm.toLowerCase().trim();
        filteredOrders = orders.filter(order => {
            const contact = (order.email || '').toLowerCase();
            const artist  = (order.artist || '').toLowerCase();
            const title   = (order.title || '').toLowerCase();
            const format  = (order.format || '').toLowerCase();
            const status  = (order.status || '').toLowerCase();
            return contact.includes(term) ||
                   artist.includes(term) ||
                   title.includes(term) ||
                   format.includes(term) ||
                   status.includes(term);
        });
    }

    // ============ RENDER TABLE ============
    function renderOrders() {
        const list = document.getElementById('ro-list');
        if (!list) return;

        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredOrders.length);
        const pageData = filteredOrders.slice(start, end);

        if (!pageData || pageData.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No record requests found</div>';
            updatePagination();
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">#</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Contact</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Artist</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Title</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Format</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Read</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Requested</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;

        pageData.forEach((order, idx) => {
            const cls = statusClass(order.status);
            const label = statusText(order.status);
            const isRead = order.notified === true;
            const readClass = isRead ? 'read' : 'unread';
            const readText = isRead ? 'Read' : '🔔 New';

            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${start + idx + 1}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(order.email) || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(order.artist) || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(order.title) || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${escapeHtml(order.format) || '<span style="color:#999;">Any</span>'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${cls}">${label}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${readClass}">${readText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="roView(${order.id})" style="padding: 4px 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        list.innerHTML = html;
        updatePagination();
    }

    // ============ PAGINATION ============
    function updatePagination() {
        const total = filteredOrders.length;
        const totalPages = Math.ceil(total / pageSize) || 1;

        const pageInfo = document.getElementById('ro-page-info');
        const prevBtn = document.getElementById('ro-prev-page');
        const nextBtn = document.getElementById('ro-next-page');
        const totalRecords = document.getElementById('ro-total-records');

        if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        if (prevBtn) prevBtn.disabled = currentPage <= 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
        if (totalRecords) totalRecords.textContent = filteredOrders.length;
    }

    // ============ SEARCH ============
    function handleSearch() {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            applyLocalFilters(document.getElementById('ro-search')?.value || '');
            currentPage = 1;
            renderOrders();
        }, 300);
    }

    // ============ VIEW ============
    window.roView = async function(id) {
        currentViewId = id;
        document.getElementById('ro-modal-title').textContent = `📦 Request #${id}`;
        document.getElementById('ro-view-id').value = id;
        document.getElementById('ro-modal-body').innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        document.getElementById('ro-modal-status').style.display = 'none';
        document.getElementById('ro-modal').style.display = 'flex';

        try {
            const order = orders.find(o => o.id === id);
            if (!order) {
                document.getElementById('ro-modal-body').innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Request not found</div>';
                return;
            }

            if (order.notified !== true) {
                await markOrderRead(id);
                order.notified = true;
                renderOrders();
            }

            renderOrderDetails(order);
        } catch (err) {
            console.error('Error viewing record order:', err);
            document.getElementById('ro-modal-body').innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    };

    function renderOrderDetails(order) {
        const body = document.getElementById('ro-modal-body');

        const statusOptions = ['pending', 'processing', 'ordered', 'received', 'cancelled'];
        let statusSelect = `<select id="ro-status-select" style="width: 100%; padding: 8px; border: 2px solid #ddd; border-radius: 8px;">`;
        statusOptions.forEach(s => {
            const selected = s === order.status ? 'selected' : '';
            statusSelect += `<option value="${s}" ${selected}>${statusText(s)}</option>`;
        });
        statusSelect += `</select>`;

        body.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div style="grid-column: 1 / -1;">
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Contact</label>
                    <div style="color: #333;">${escapeHtml(order.email) || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Artist</label>
                    <div style="color: #333;">${escapeHtml(order.artist) || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Title</label>
                    <div style="color: #333;">${escapeHtml(order.title) || '—'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Format</label>
                    <div style="color: #333;">${escapeHtml(order.format) || '<span style="color:#999;">Any format</span>'}</div>
                </div>
                <div>
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Requested</label>
                    <div style="color: #333;">${order.created_at ? new Date(order.created_at).toLocaleString() : '—'}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 2px;">Status</label>
                    ${statusSelect}
                </div>
            </div>
        `;
    }

    // ============ UPDATE STATUS ============
    window.roUpdateStatus = async function() {
        const id = document.getElementById('ro-view-id').value;
        const status = document.getElementById('ro-status-select')?.value;
        if (!id || !status) return;

        const order = orders.find(o => o.id == id);
        if (!order) return;

        if (order.status === status) {
            showModalStatus('No change to status', 'info');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/record-orders/${id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ status: status })
            });
            const result = await response.json();

            if (result.status === 'success') {
                showModalStatus('✅ Status updated!', 'success');
                order.status = status;
                renderOrders();
                setTimeout(() => roCloseModal(), 800);
            } else {
                showModalStatus(`❌ Error: ${result.error || 'Failed to update'}`, 'error');
            }
        } catch (err) {
            console.error('Error updating record order:', err);
            showModalStatus(`❌ Error: ${err.message}`, 'error');
        }
    };

    // ============ DELETE ============
    window.roDeleteOrder = async function() {
        const id = document.getElementById('ro-view-id').value;
        if (!id) return;

        if (!confirm(`Delete request #${id}? This cannot be undone.`)) return;

        const btn = document.getElementById('ro-delete-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Deleting...'; }

        try {
            const response = await fetch(`${API_BASE}/api/record-orders/${id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getHeaders()
            });
            const result = await response.json();

            if (result.status === 'success') {
                orders = orders.filter(o => o.id != id);
                applyLocalFilters(document.getElementById('ro-search')?.value || '');
                renderOrders();
                roCloseModal();
                showToast('🗑️ Request deleted');
            } else {
                showModalStatus(`❌ Error: ${result.error || 'Failed to delete'}`, 'error');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash"></i> Delete'; }
            }
        } catch (err) {
            console.error('Error deleting record order:', err);
            showModalStatus(`❌ Error: ${err.message}`, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash"></i> Delete'; }
        }
    };

    // ============ EXPORT CSV ============
    window.roExportCSV = function() {
        const rows = filteredOrders.length ? filteredOrders : orders;
        if (!rows.length) {
            showToast('No orders to export', 'warning');
            return;
        }

        const headers = ['ID', 'Contact', 'Artist', 'Title', 'Format', 'Status', 'Notified', 'Requested'];
        const csvLines = [headers.join(',')];

        rows.forEach(o => {
            const line = [
                o.id,
                csvCell(o.email),
                csvCell(o.artist),
                csvCell(o.title),
                csvCell(o.format),
                csvCell(o.status),
                o.notified ? 'yes' : 'no',
                csvCell(o.created_at)
            ].join(',');
            csvLines.push(line);
        });

        const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `record-orders-${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`📥 Exported ${rows.length} request(s)`);
    };

    function csvCell(val) {
        if (val === null || val === undefined) return '';
        const s = String(val);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    }

    // ============ CLEAR SEARCH ============
    window.roClearSearch = function() {
        const input = document.getElementById('ro-search');
        if (input) input.value = '';
        currentPage = 1;
        applyLocalFilters('');
        renderOrders();
    };

    // ============ PAGINATION CONTROLS ============
    window.roPrevPage = function() {
        if (currentPage > 1) {
            currentPage--;
            renderOrders();
        }
    };

    window.roNextPage = function() {
        const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
        if (currentPage < totalPages) {
            currentPage++;
            renderOrders();
        }
    };

    // ============ MODAL ============
    window.roCloseModal = function() {
        document.getElementById('ro-modal').style.display = 'none';
        currentViewId = null;
        const btn = document.getElementById('ro-delete-btn');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash"></i> Delete'; }
    };

    function showModalStatus(message, type) {
        const statusDiv = document.getElementById('ro-modal-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        const colors = {
            success: '#d4edda', error: '#f8d7da',
            warning: '#fff3cd', info: '#cce5ff'
        };
        const textColors = {
            success: '#155724', error: '#721c24',
            warning: '#856404', info: '#004085'
        };
        statusDiv.style.background = colors[type] || '#f8f9fa';
        statusDiv.style.color = textColors[type] || '#333';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

    // ============ HELPERS ============
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? '#28a745'
                      : type === 'error' ? '#dc3545'
                      : type === 'info' ? '#17a2b8'
                      : '#ffc107';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            background: ${bgColor};
            color: ${type === 'warning' ? '#333' : 'white'};
            border-radius: 8px;
            z-index: 10002;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 400px;
            font-size: 14px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ============ INIT ============
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('ro-search');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearch);
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    if (searchTimeout) { clearTimeout(searchTimeout); searchTimeout = null; }
                    applyLocalFilters(this.value || '');
                    currentPage = 1;
                    renderOrders();
                }
            });
        }
    });

    document.addEventListener('click', function(e) {
        const modal = document.getElementById('ro-modal');
        if (modal && e.target === modal) roCloseModal();
    });

    window.initRecordOrders = function() {
        console.log('Record Orders initialized');
        currentPage = 1;
        loadOrders();
    };
})();