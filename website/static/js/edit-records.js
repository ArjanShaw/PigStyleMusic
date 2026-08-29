// Edit Records page
(function() {
    let records = [];
    let conditions = [];
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

    // Load conditions
    async function loadConditions() {
        try {
            const response = await fetch(`${API_BASE}/api/conditions`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.status === 'success') {
                conditions = data.conditions || [];
                populateConditionSelects();
            }
        } catch (err) {
            console.error('Error loading conditions:', err);
        }
    }

    function populateConditionSelects() {
        const sleeveSelect = document.getElementById('er-edit-sleeve');
        const discSelect = document.getElementById('er-edit-disc');
        if (!sleeveSelect || !discSelect) return;
        
        const opts = '<option value="">Select...</option>' + 
            conditions.map(c => `<option value="${c.id}">${c.display_name || c.condition_name}</option>`).join('');
        sleeveSelect.innerHTML = opts;
        discSelect.innerHTML = opts;
    }

    // Load records
    async function loadRecords(searchTerm) {
        const list = document.getElementById('er-records-list');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            let url = `${API_BASE}/records?limit=500`;
            if (searchTerm && searchTerm.trim()) {
                url += `&search=${encodeURIComponent(searchTerm.trim())}`;
            }
            
            const response = await fetch(url, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                records = data.records || [];
                renderRecords(records);
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading records:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Render records
    function renderRecords(recordsList) {
        const list = document.getElementById('er-records-list');
        if (!list) return;
        
        if (!recordsList || recordsList.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No records found</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Artist</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Title</th>
                    <th style="padding: 8px 10px; text-align: right; color: #333;">Price</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Barcode</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        recordsList.forEach(r => {
            const statusMap = { 1: 'New', 2: 'Active', 3: 'Sold', 4: 'Discogs' };
            const statusText = statusMap[r.status_id] || 'Unknown';
            const statusClass = r.status_id === 2 ? 'active' : r.status_id === 3 ? 'sold' : r.status_id === 1 ? 'new' : '';
            
            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${r.id}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${r.artist || 'Unknown'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${r.title || 'Unknown'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${r.store_price ? '$' + r.store_price.toFixed(2) : '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-family: monospace; font-size: 11px;">${r.barcode || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="erOpenEdit(${r.id})" style="padding: 4px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // Open edit modal
    window.erOpenEdit = function(recordId) {
        const record = records.find(r => r.id === recordId);
        if (!record) {
            alert('Record not found');
            return;
        }
        
        currentEditId = recordId;
        document.getElementById('er-edit-id').value = recordId;
        document.getElementById('er-modal-title').textContent = `✏️ Edit Record #${recordId}`;
        document.getElementById('er-edit-artist').value = record.artist || '';
        document.getElementById('er-edit-title').value = record.title || '';
        document.getElementById('er-edit-price').value = record.store_price || '';
        document.getElementById('er-edit-status').value = record.status_id || 1;
        document.getElementById('er-edit-catalog').value = record.catalog_number || '';
        document.getElementById('er-edit-location').value = record.location || '';
        document.getElementById('er-edit-notes').value = record.notes || '';
        
        // Set condition selects
        const sleeveSelect = document.getElementById('er-edit-sleeve');
        const discSelect = document.getElementById('er-edit-disc');
        if (sleeveSelect) sleeveSelect.value = record.condition_sleeve_id || '';
        if (discSelect) discSelect.value = record.condition_disc_id || '';
        
        document.getElementById('er-edit-status-msg').style.display = 'none';
        document.getElementById('er-edit-modal').style.display = 'flex';
    };

    window.erCloseModal = function() {
        document.getElementById('er-edit-modal').style.display = 'none';
        currentEditId = null;
    };

    window.erSaveRecord = async function() {
        const id = document.getElementById('er-edit-id').value;
        const artist = document.getElementById('er-edit-artist').value.trim();
        const title = document.getElementById('er-edit-title').value.trim();
        const price = parseFloat(document.getElementById('er-edit-price').value);
        const statusId = parseInt(document.getElementById('er-edit-status').value);
        const sleeveId = document.getElementById('er-edit-sleeve').value;
        const discId = document.getElementById('er-edit-disc').value;
        const catalog = document.getElementById('er-edit-catalog').value.trim();
        const location = document.getElementById('er-edit-location').value.trim();
        const notes = document.getElementById('er-edit-notes').value.trim();
        
        if (!artist || !title) {
            showEditStatus('Artist and Title are required', 'error');
            return;
        }
        
        const data = {
            artist: artist,
            title: title,
            status_id: statusId,
            catalog_number: catalog || null,
            location: location || null,
            notes: notes || null
        };
        
        if (!isNaN(price) && price > 0) data.store_price = price;
        if (sleeveId) data.condition_sleeve_id = parseInt(sleeveId);
        if (discId) data.condition_disc_id = parseInt(discId);
        
        const btn = document.getElementById('er-save-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        
        try {
            const response = await fetch(`${API_BASE}/records/${id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showEditStatus('✅ Record updated successfully!', 'success');
                setTimeout(() => {
                    erCloseModal();
                    loadRecords(document.getElementById('er-search').value);
                }, 1000);
            } else {
                showEditStatus(`❌ Error: ${result.error || 'Failed to update'}`, 'error');
            }
        } catch (err) {
            console.error('Error saving record:', err);
            showEditStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    function showEditStatus(message, type) {
        const statusDiv = document.getElementById('er-edit-status-msg');
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

    // Search
    window.erSearch = function() {
        const searchInput = document.getElementById('er-search');
        loadRecords(searchInput.value);
    };

    window.erClear = function() {
        document.getElementById('er-search').value = '';
        loadRecords('');
    };

    window.erRefresh = function() {
        loadRecords(document.getElementById('er-search').value);
    };

    // Enter key search
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('er-search');
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    erSearch();
                }
            });
        }
    });

    // Close modal on outside click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('er-edit-modal');
        if (modal && e.target === modal) {
            erCloseModal();
        }
    });

    // Init
    window.initEditRecords = function() {
        console.log('Edit Records initialized');
        loadConditions();
        loadRecords('');
    };
})();
