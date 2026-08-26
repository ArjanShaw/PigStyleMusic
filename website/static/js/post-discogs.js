// Post to Discogs page
(function() {
    let records = [];
    let locations = [];

    const API_BASE = 'http://localhost:5000';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Load locations
    async function loadLocations() {
        const select = document.getElementById('post-discogs-location-filter');
        if (!select) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/locations`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.status === 'success') {
                locations = data.locations || [];
                select.innerHTML = '<option value="all">-- All (no filter) --</option><option value="all_with_location">-- All with Location --</option>';
                locations.forEach(loc => {
                    const opt = document.createElement('option');
                    opt.value = loc.id;
                    opt.textContent = loc.name;
                    select.appendChild(opt);
                });
            }
        } catch (err) {
            console.error('Error loading locations:', err);
        }
    }

    // Load records
    async function loadRecords() {
        const list = document.getElementById('post-discogs-records');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        const locationFilter = document.getElementById('post-discogs-location-filter');
        const lastSeen = document.getElementById('post-last-seen-cutoff');
        
        const locationValue = locationFilter ? locationFilter.value : 'all';
        const lastSeenValue = lastSeen ? lastSeen.value : '';
        
        try {
            let url = `${API_BASE}/records?status_ids=2&limit=500`;
            if (locationValue === 'all_with_location') {
                url += '&require_location=true';
            } else if (locationValue !== 'all') {
                url += `&location_id=${locationValue}`;
            }
            if (lastSeenValue) {
                url += `&last_seen_after=${lastSeenValue}`;
            }
            
            const response = await fetch(url, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                records = data.records || [];
                renderRecords();
                showStatus(`Loaded ${records.length} records`, 'info');
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading records:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Render records
    function renderRecords() {
        const list = document.getElementById('post-discogs-records');
        if (!list) return;
        
        if (records.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No records found</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: center; width: 40px;">
                        <input type="checkbox" id="post-select-all" onchange="postToggleAll()">
                    </th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Artist</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Title</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Store Price</th>
                    <th style="padding: 6px 8px; text-align: right; color: #28a745; font-weight: 600;">Discogs Price</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Markup</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Location</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Action</th>
                </tr>
            </thead>
            <tbody>`;
        
        records.forEach((r, idx) => {
            const discogsPrice = r._discogsPrice || '—';
            const markup = r._markupPercent || 0;
            const markupColor = markup > 0 ? '#28a745' : markup < 0 ? '#dc3545' : '#ffc107';
            const markupText = markup > 0 ? `+${markup}%` : markup < 0 ? `${markup}%` : '0%';
            
            html += `<tr>
                <td style="padding: 6px 8px; text-align: center;">
                    <input type="checkbox" class="post-record-check" data-index="${idx}" onchange="postUpdateCount()">
                </td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${r.id}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${r.artist || 'Unknown'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${r.title || 'Unknown'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${r.store_price ? '$' + r.store_price.toFixed(2) : '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #28a745; font-weight: 600;">${discogsPrice !== '—' ? '$' + discogsPrice.toFixed(2) : '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center; color: ${markupColor}; font-weight: 600;">${discogsPrice !== '—' ? markupText : '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 11px;">${r.location_name || '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">
                    ${discogsPrice !== '—' ? 
                        `<button onclick="postSingleRecord(${r.id})" style="padding: 4px 12px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            <i class="fas fa-share"></i> Post
                        </button>` : 
                        '<span style="color: #999;">—</span>'
                    }
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
        updateCount();
    }

    // Selection functions
    window.postToggleAll = function() {
        const selectAll = document.getElementById('post-select-all');
        if (!selectAll) return;
        const checked = selectAll.checked;
        document.querySelectorAll('.post-record-check').forEach(cb => cb.checked = checked);
        updateCount();
    };

    window.postUpdateCount = function() {
        updateCount();
    };

    function updateCount() {
        const checked = document.querySelectorAll('.post-record-check:checked');
        const btn = document.getElementById('post-discogs-btn');
        if (!btn) return;
        if (checked.length > 0) {
            btn.textContent = `📤 Post ${checked.length} Selected to Discogs`;
            btn.disabled = false;
        } else {
            btn.textContent = '📤 Post Selected to Discogs';
            btn.disabled = true;
        }
    }

    // Post single record
    window.postSingleRecord = async function(recordId) {
        const record = records.find(r => r.id === recordId);
        if (!record) {
            alert('Record not found');
            return;
        }

        const location = prompt('Enter location for this record (e.g., "Bin 24 | Left Top"):');
        if (location === null) return;
        if (!location.trim()) {
            alert('Location is required.');
            return;
        }

        const discogsPrice = record._discogsPrice;
        if (!discogsPrice) {
            alert('No Discogs price calculated for this record.');
            return;
        }

        if (!confirm(`Post "${record.artist} - ${record.title}" to Discogs?\n\nStore Price: $${record.store_price}\nDiscogs Price: $${discogsPrice.toFixed(2)}\nLocation: ${location}`)) {
            return;
        }

        const statusDiv = document.getElementById('post-discogs-status');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.textContent = '⏳ Posting to Discogs...';
            statusDiv.className = 'status-message status-info';
        }

        try {
            // Update location
            await fetch(`${API_BASE}/records/${recordId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ location: location })
            });

            // Create listing
            const listingData = {
                record: {
                    id: recordId,
                    artist: record.artist || 'Unknown',
                    title: record.title || 'Unknown',
                    catalog_number: record.catalog_number || '',
                    media_condition: record.disc_condition_name || 'Very Good Plus (VG+)',
                    sleeve_condition: record.sleeve_condition_name || 'Very Good Plus (VG+)',
                    price: discogsPrice,
                    notes: record.notes || '',
                    location: location
                }
            };

            const listingResult = await fetch(`${API_BASE}/api/discogs/create-listing-single`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify(listingData)
            });
            const data = await listingResult.json();

            if (data.success) {
                if (statusDiv) {
                    statusDiv.textContent = `✅ Successfully posted "${record.artist} - ${record.title}" to Discogs!`;
                    statusDiv.className = 'status-message status-success';
                }
                loadRecords();
            } else {
                if (statusDiv) {
                    statusDiv.textContent = `❌ Error: ${data.error || 'Failed to post'}`;
                    statusDiv.className = 'status-message status-error';
                }
            }
        } catch (err) {
            console.error('Error posting record:', err);
            if (statusDiv) {
                statusDiv.textContent = `❌ Error: ${err.message}`;
                statusDiv.className = 'status-message status-error';
            }
        }
    };

    // Post selected
    window.postDiscogsSelected = async function() {
        const checked = document.querySelectorAll('.post-record-check:checked');
        if (checked.length === 0) {
            alert('Please select at least one record.');
            return;
        }

        const selectedIds = [];
        checked.forEach(cb => {
            const idx = parseInt(cb.dataset.index);
            if (!isNaN(idx) && records[idx]) {
                selectedIds.push(records[idx].id);
            }
        });

        if (selectedIds.length === 0) {
            alert('No valid records selected.');
            return;
        }

        const location = prompt('Enter location for these records (e.g., "Bin 24 | Left Top"):');
        if (location === null) return;
        if (!location.trim()) {
            alert('Location is required.');
            return;
        }

        if (!confirm(`Post ${selectedIds.length} record(s) to Discogs?\n\nLocation: ${location}`)) {
            return;
        }

        const statusDiv = document.getElementById('post-discogs-status');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.textContent = '⏳ Posting to Discogs...';
            statusDiv.className = 'status-message status-info';
        }

        let success = 0;
        let failed = 0;

        for (const id of selectedIds) {
            try {
                const record = records.find(r => r.id === id);
                if (!record) {
                    failed++;
                    continue;
                }

                const discogsPrice = record._discogsPrice;
                if (!discogsPrice) {
                    failed++;
                    continue;
                }

                // Update location
                await fetch(`${API_BASE}/records/${id}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: getHeaders(),
                    body: JSON.stringify({ location: location })
                });

                // Create listing
                const listingData = {
                    record: {
                        id: id,
                        artist: record.artist || 'Unknown',
                        title: record.title || 'Unknown',
                        catalog_number: record.catalog_number || '',
                        media_condition: record.disc_condition_name || 'Very Good Plus (VG+)',
                        sleeve_condition: record.sleeve_condition_name || 'Very Good Plus (VG+)',
                        price: discogsPrice,
                        notes: record.notes || '',
                        location: location
                    }
                };

                const listingResult = await fetch(`${API_BASE}/api/discogs/create-listing-single`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: getHeaders(),
                    body: JSON.stringify(listingData)
                });
                const data = await listingResult.json();

                if (data.success) {
                    success++;
                } else {
                    failed++;
                }
            } catch (err) {
                console.error('Error posting record:', err);
                failed++;
            }
        }

        if (statusDiv) {
            statusDiv.textContent = `✅ ${success} posted, ❌ ${failed} failed`;
            statusDiv.className = 'status-message status-success';
            if (failed > 0 && success === 0) {
                statusDiv.className = 'status-message status-error';
            } else if (failed > 0) {
                statusDiv.className = 'status-message status-warning';
            }
        }
        
        loadRecords();
    };

    // Refresh
    window.postDiscogsRefresh = function() {
        loadRecords();
    };

    // Apply last seen filter
    window.postApplyLastSeen = function() {
        loadRecords();
    };

    window.postClearLastSeen = function() {
        const input = document.getElementById('post-last-seen-cutoff');
        if (input) input.value = '';
        loadRecords();
    };

    // Show status
    function showStatus(message, type) {
        const statusDiv = document.getElementById('post-discogs-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.className = `status-message status-${type}`;
        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

    // Init
    window.initPostDiscogs = function() {
        console.log('Post to Discogs initialized');
        
        // Check if elements exist before adding listeners
        const locationFilter = document.getElementById('post-discogs-location-filter');
        if (locationFilter) {
            locationFilter.addEventListener('change', loadRecords);
        }
        
        const lastSeenInput = document.getElementById('post-last-seen-cutoff');
        if (lastSeenInput) {
            lastSeenInput.addEventListener('change', loadRecords);
        }
        
        loadLocations();
        loadRecords();
    };
})();
