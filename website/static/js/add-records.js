// Add Records page
(function() {
    'use strict';

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    console.log('📀 Add Records API_BASE:', API_BASE);

    let purchases = [];
    let conditions = [];
    let formats = [];
    let consignors = [];
    let searchResults = [];
    let recentRecords = [];
    let lastSearchTerm = '';

    const RECENT_LIMIT = 20;

    // ==================== LOADERS ====================

    async function loadPurchases() {
        try {
            const response = await fetch(`${API_BASE}/api/inventory-purchases`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    document.getElementById('add-purchase-info').textContent = '⚠️ Please log in as admin';
                    return;
                }
                if (response.status === 403) {
                    document.getElementById('add-purchase-info').textContent = '⚠️ Admin access required';
                    return;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            if (data.status === 'success') {
                purchases = data.purchases || [];
                const select = document.getElementById('add-purchase-select');
                const currentValue = select.value;
                select.innerHTML = '<option value="">-- Select a purchase --</option>';
                purchases.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    const count = p.record_count !== undefined ? ` (${p.record_count} records)` : '';
                    opt.textContent = `#${p.id} - ${p.seller_name || 'Unknown'}${count}`;
                    select.appendChild(opt);
                });
                if (currentValue && purchases.some(p => p.id == currentValue)) {
                    select.value = currentValue;
                }
                document.getElementById('add-purchase-info').textContent = `${purchases.length} purchases loaded`;
            }
        } catch (err) {
            console.error('Failed to load purchases:', err);
            document.getElementById('add-purchase-info').textContent = 'Error loading purchases';
        }
    }

    async function loadConditions() {
        try {
            const response = await fetch(`${API_BASE}/api/conditions`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.status === 'success') {
                conditions = data.conditions || [];
            }
        } catch (err) {
            console.error('Failed to load conditions:', err);
        }
    }

    async function loadFormats() {
        try {
            const response = await fetch(`${API_BASE}/api/formats`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.status === 'success') {
                formats = data.formats || [];
                const select = document.getElementById('add-search-format');
                if (!select) return;
                select.innerHTML = '<option value="">All Formats</option>' + formats.map(f =>
                    `<option value="${f.name.toLowerCase()}">${f.name}</option>`
                ).join('');
                const vinylOpt = Array.from(select.options).find(o => o.value === 'vinyl');
                if (vinylOpt) select.value = 'vinyl';
            }
        } catch (err) {
            console.error('Failed to load formats:', err);
        }
    }

    async function loadConsignors() {
        try {
            const response = await fetch(`${API_BASE}/users`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.status === 'success') {
                consignors = (data.users || []).filter(u => u.role === 'consignor');
            }
        } catch (err) {
            console.error('Failed to load consignors:', err);
        }
    }

    async function loadRecentRecords() {
        try {
            // status_ids=1,2 → include drafts (1) and active (2)
            const url = `${API_BASE}/records?status_ids=1,2&order_by=id&order_dir=DESC&limit=${RECENT_LIMIT}`;
            const response = await fetch(url, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.status === 'success') {
                recentRecords = data.records || [];
                console.log(`📀 Loaded ${recentRecords.length} recent records (newest id: ${recentRecords[0]?.id ?? 'none'})`);
                renderRecent();
            } else {
                console.error('Failed to load recent records:', data.error);
            }
        } catch (err) {
            console.error('Failed to load recent records:', err);
        }
    }

    // ==================== RECENT TABLE RENDER ====================

    function conditionOptions(selectedId) {
        return conditions.map(c =>
            `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${c.display_name || c.condition_name}</option>`
        ).join('');
    }

    function consignorOptions(selectedId) {
        const noneSel = (!selectedId || selectedId === null) ? 'selected' : '';
        return `<option value="none" ${noneSel}>None (store)</option>` +
            consignors.map(c =>
                `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${c.username}</option>`
            ).join('');
    }

    function renderRecent() {
        const container = document.getElementById('add-recent');
        if (!container) return;

        if (!recentRecords.length) {
            container.innerHTML = '<div style="text-align: center; padding: 10px; color: #999;">No records added yet</div>';
            return;
        }

        const rows = recentRecords.map(rec => {
            const price = (rec.store_price !== null && rec.store_price !== undefined)
                ? Number(rec.store_price).toFixed(2)
                : '';
            return `
                <tr data-record-id="${rec.id}" style="border-bottom: 1px solid #f5f5f5;">
                    <td style="padding: 4px 6px; color: #999; font-size: 11px;">#${rec.id}</td>
                    <td style="padding: 4px 6px; max-width: 220px;">
                        <div style="font-weight: 600; color: #333; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${rec.artist || 'Unknown'}
                        </div>
                        <div style="color: #666; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${rec.title || ''}
                        </div>
                    </td>
                    <td style="padding: 4px 6px;">
                        <select class="recent-sleeve" data-id="${rec.id}"
                            style="padding: 3px 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px; min-width: 130px;">
                            <option value="">—</option>
                            ${conditionOptions(rec.condition_sleeve_id)}
                        </select>
                    </td>
                    <td style="padding: 4px 6px;">
                        <select class="recent-disc" data-id="${rec.id}"
                            style="padding: 3px 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px; min-width: 130px;">
                            <option value="">—</option>
                            ${conditionOptions(rec.condition_disc_id)}
                        </select>
                    </td>
                    <td style="padding: 4px 6px;">
                        <input type="number" step="0.01" class="recent-price" data-id="${rec.id}"
                            value="${price}"
                            style="width: 80px; padding: 3px 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px;">
                    </td>
                    <td style="padding: 4px 6px;">
                        <select class="recent-consignor" data-id="${rec.id}"
                            style="padding: 3px 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px; min-width: 130px;">
                            ${consignorOptions(rec.consignor_id)}
                        </select>
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 1px solid #ddd; background: #f8f9fa;">
                        <th style="text-align: left; padding: 4px 6px; font-size: 10px; color: #888; font-weight: 600;">ID</th>
                        <th style="text-align: left; padding: 4px 6px; font-size: 10px; color: #888; font-weight: 600;">Artist / Title</th>
                        <th style="text-align: left; padding: 4px 6px; font-size: 10px; color: #888; font-weight: 600;">Sleeve</th>
                        <th style="text-align: left; padding: 4px 6px; font-size: 10px; color: #888; font-weight: 600;">Disc</th>
                        <th style="text-align: left; padding: 4px 6px; font-size: 10px; color: #888; font-weight: 600;">Price</th>
                        <th style="text-align: left; padding: 4px 6px; font-size: 10px; color: #888; font-weight: 600;">Consignor</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;

        bindRecentEvents();
    }

    function bindRecentEvents() {
        const container = document.getElementById('add-recent');

        container.querySelectorAll('.recent-sleeve').forEach(el => {
            el.addEventListener('change', () => updateRecentField(el.dataset.id, 'condition_sleeve_id', el.value || null));
        });
        container.querySelectorAll('.recent-disc').forEach(el => {
            el.addEventListener('change', () => updateRecentField(el.dataset.id, 'condition_disc_id', el.value || null));
        });
        container.querySelectorAll('.recent-consignor').forEach(el => {
            el.addEventListener('change', () => {
                const v = el.value;
                updateRecentField(el.dataset.id, 'consignor_id', (v === 'none' || v === '') ? null : v);
            });
        });
        container.querySelectorAll('.recent-price').forEach(el => {
            el.addEventListener('change', () => {
                const v = el.value;
                updateRecentField(el.dataset.id, 'store_price', v === '' ? null : parseFloat(v));
            });
        });
    }

    async function updateRecentField(recordId, field, value) {
        const idNum = parseInt(recordId, 10);
        const body = {};
        if (field === 'store_price') {
            if (value === null || isNaN(value)) {
                showStatus('Price must be a number', 'error');
                return;
            }
            body[field] = value;
        } else if (field === 'consignor_id') {
            body[field] = (value === null || value === 'none') ? null : parseInt(value, 10);
        } else {
            body[field] = value === null ? null : parseInt(value, 10);
        }

        try {
            const response = await fetch(`${API_BASE}/records/${idNum}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (result.status === 'success') {
                const rec = recentRecords.find(r => r.id === idNum);
                if (rec) {
                    if (field === 'store_price') rec.store_price = value;
                    else if (field === 'consignor_id') rec.consignor_id = body[field];
                    else rec[field] = body[field];
                }
                showStatus(`Updated #${idNum} ${field}`, 'success');
            } else {
                showStatus('Update failed: ' + (result.error || 'unknown'), 'error');
            }
        } catch (err) {
            console.error('Update error:', err);
            showStatus('Update error: ' + err.message, 'error');
        }
    }

    // ==================== ENTER KEY: SEARCH THEN ADD-FIRST ====================

    function bindSearchInput() {
        const searchInput = document.getElementById('add-search-input');
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    const currentTerm = searchInput.value.trim();
                    if (searchResults.length > 0 && currentTerm === lastSearchTerm) {
                        window.addRecord(0);
                    } else {
                        window.addRecordsSearch();
                    }
                }
            });
        }

        const searchFormat = document.getElementById('add-search-format');
        if (searchFormat) {
            searchFormat.addEventListener('change', function() {
                const si = document.getElementById('add-search-input');
                if (si && si.value.trim()) {
                    window.addRecordsSearch();
                }
            });
        }
    }

    // ==================== SEARCH ====================

    window.addRecordsSearch = async function() {
        const purchaseSelect = document.getElementById('add-purchase-select');
        const purchaseId = purchaseSelect.value;

        if (!purchaseId) {
            showStatus('Please select a purchase first', 'error');
            return;
        }

        const searchInput = document.getElementById('add-search-input');
        const term = searchInput.value.trim();

        if (!term) {
            showStatus('Please enter a search term', 'error');
            return;
        }

        const formatSelect = document.getElementById('add-search-format');
        const formatFilter = formatSelect ? formatSelect.value : 'all';

        const resultsDiv = document.getElementById('add-results');
        resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Searching Discogs...</div>';

        try {
            const response = await fetch(
                `${API_BASE}/api/discogs/search?q=${encodeURIComponent(term)}&format=${encodeURIComponent(formatFilter || 'all')}`,
                {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            const data = await response.json();

            if (data.status === 'success' && data.results) {
                searchResults = data.results;
                lastSearchTerm = term;
                renderResults(searchResults);
                const formatLabel = formatFilter && formatFilter !== 'all' ? ` [${formatFilter}]` : '';
                showStatus(`Found ${searchResults.length} results${formatLabel} — press Enter to add the first`, 'success');
            } else {
                resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No results found</div>';
                searchResults = [];
                lastSearchTerm = '';
                showStatus('No results found', 'warning');
            }
        } catch (err) {
            console.error('Search error:', err);
            resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error searching</div>';
            searchResults = [];
            lastSearchTerm = '';
            showStatus('Error searching: ' + err.message, 'error');
        }
    };

    window.addRecordsClear = function() {
        document.getElementById('add-search-input').value = '';
        document.getElementById('add-results').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Select a purchase and search Discogs</div>';
        searchResults = [];
        lastSearchTerm = '';
        showStatus('Cleared', 'info');
        const searchInput = document.getElementById('add-search-input');
        if (searchInput) searchInput.focus();
    };

    window.addReloadRecent = function() {
        loadRecentRecords();
    };

    // ==================== SEARCH RESULT RENDER ====================

    function renderResults(results) {
        const resultsDiv = document.getElementById('add-results');
        if (!results || results.length === 0) {
            resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No results found</div>';
            return;
        }

        let html = '';
        results.forEach((record, idx) => {
            const artist = record.artist || 'Unknown';
            const title = record.title || 'Untitled';
            const catalog = record.catalog_number || '—';
            const image = record.image_url || '';
            const hasReleaseId = !!record.discogs_id;

            const imgHtml = image ? 
                `<img src="${image}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;">` : 
                `<div style="width:50px;height:50px;background:#e0e0e0;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#bbb;">🎵</div>`;

            const releaseIdBadge = hasReleaseId 
                ? `<span style="background:#d4edda;color:#155724;font-size:10px;padding:1px 6px;border-radius:4px;margin-left:6px;">Discogs #${record.discogs_id}</span>`
                : `<span style="background:#fff3cd;color:#856404;font-size:10px;padding:1px 6px;border-radius:4px;margin-left:6px;">no release ID</span>`;

            html += `
                <div style="display: flex; align-items: center; gap: 10px; padding: 8px; border-bottom: 1px solid #f0f0f0;">
                    <div style="flex: 0 0 50px;">${imgHtml}</div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #333; font-size: 14px;">${artist}${releaseIdBadge}</div>
                        <div style="color: #666; font-size: 13px;">${title}</div>
                        <div style="color: #999; font-size: 11px;">Catalog: ${catalog}</div>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button onclick="addRecord(${idx})" style="padding: 4px 14px; background: #28a745; color: white; border: none; border-radius: 20px; cursor: pointer; font-size: 12px;">
                            <i class="fas fa-plus"></i> Add
                        </button>
                    </div>
                </div>
            `;
        });
        resultsDiv.innerHTML = html;
    }

    // ==================== ADD RECORD (clone from most recent) ====================

    window.addRecord = async function(index) {
        const record = searchResults[index];
        if (!record) {
            showStatus('Record not found', 'error');
            return;
        }

        const purchaseSelect = document.getElementById('add-purchase-select');
        const purchaseId = purchaseSelect.value;

        if (!purchaseId) {
            showStatus('Please select a purchase', 'error');
            return;
        }

        const template = recentRecords.length > 0 ? recentRecords[0] : null;

        const sleeveId = template ? template.condition_sleeve_id : null;
        const discId = template ? template.condition_disc_id : null;
        const price = template ? template.store_price : null;
        const consignorId = template ? template.consignor_id : null;

        const searchFormatSelect = document.getElementById('add-search-format');
        const formatName = searchFormatSelect ? searchFormatSelect.value : '';
        const matchedFormat = formats.find(f => f.name.toLowerCase() === formatName);
        const formatId = matchedFormat ? matchedFormat.id : null;

        const now = new Date().toISOString();

        const data = {
            artist: record.artist || 'Unknown',
            title: record.title || 'Unknown',
            catalog_number: record.catalog_number || '',
            image_url: record.image_url || '',
            discogs_genre_raw: record.genre_raw || '',
            condition_sleeve_id: sleeveId,
            condition_disc_id: discId,
            store_price: price,
            consignor_id: consignorId,
            format_id: formatId,
            batch_id: parseInt(purchaseId),
            status_id: 1,
            last_seen: now,
            discogs_release_id: record.discogs_id || null
        };

        try {
            const response = await fetch(`${API_BASE}/records`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            if (result.status === 'success') {
                const newId = result.record?.id ?? '(unknown)';
                const releaseNote = record.discogs_id ? ` (Discogs #${record.discogs_id})` : ' (no release ID)';
                showStatus(`✅ Added #${newId}: ${record.artist} - ${record.title}${releaseNote}`, 'success');

                // ===== FORCE REFRESH OF RECENT TABLE FROM DB =====
                // Clear search results
                searchResults = [];
                lastSearchTerm = '';
                document.getElementById('add-results').innerHTML =
                    '<div style="text-align: center; padding: 20px; color: #999;">Select a purchase and search Discogs</div>';

                // Refresh purchases (record counts) and recent table
                loadPurchases();
                setTimeout(() => {
                    const select = document.getElementById('add-purchase-select');
                    if (select) select.value = purchaseId;
                }, 100);

                await loadRecentRecords();

                const searchInput = document.getElementById('add-search-input');
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.focus();
                }
            } else {
                showStatus('❌ Error: ' + (result.error || 'Failed to add'), 'error');
            }
        } catch (err) {
            console.error('Error adding record:', err);
            showStatus('❌ Error: ' + err.message, 'error');
        }
    };

    // ==================== STATUS ====================

    function showStatus(message, type) {
        const statusDiv = document.getElementById('add-status');
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
        statusDiv.style.border = `1px solid ${colors[type] || '#ddd'}`;
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }

    // ==================== INIT (sequential so dropdowns populate first) ====================

    window.initAddRecords = async function() {
        console.log('Add Records initialized');
        await loadConditions();
        await loadConsignors();
        await loadFormats();
        loadPurchases();
        await loadRecentRecords();
        bindSearchInput();

        const searchInput = document.getElementById('add-search-input');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 100);
        }
    };
})();