// Post to Discogs page
(function() {
    'use strict';

    // ===== API BASE URL =====
    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    let records = [];
    let cutoffDate = null;

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // ===== FETCH LAST_SEEN_CUTOFF_DATE FROM CONFIG =====
    async function fetchLastSeenCutoff() {
        try {
            const response = await fetch(`${API_BASE}/config/LAST_SEEN_CUTOFF_DATE`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                console.warn('Could not fetch LAST_SEEN_CUTOFF_DATE, using default');
                return null;
            }
            
            const data = await response.json();
            if (data.status === 'success' && data.config_value) {
                console.log('📅 Post Discogs - LAST_SEEN_CUTOFF_DATE:', data.config_value);
                return data.config_value;
            }
            return null;
        } catch (err) {
            console.warn('Error fetching LAST_SEEN_CUTOFF_DATE:', err);
            return null;
        }
    }

    // ===== CHECK IF RECORD SHOULD BE VISIBLE =====
    function isRecordVisible(record) {
        if (!cutoffDate) {
            return true;
        }
        if (!record.last_seen) {
            return false;
        }
        let lastSeenDate = record.last_seen;
        if (typeof lastSeenDate === 'string') {
            if (lastSeenDate.includes('T')) {
                lastSeenDate = lastSeenDate.split('T')[0];
            }
        }
        return lastSeenDate >= cutoffDate;
    }

    // Load records
    async function loadRecords() {
        const list = document.getElementById('post-discogs-records');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            let url = `${API_BASE}/records?status_ids=2&limit=500`;
            
            if (cutoffDate) {
                url += `&last_seen_after=${cutoffDate}`;
                console.log('📅 Post Discogs - Adding last_seen_after filter:', cutoffDate);
            }
            
            const response = await fetch(url, {
                credentials: 'include',
                mode: 'cors',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                let fetchedRecords = data.records || [];
                
                if (cutoffDate) {
                    const beforeFilter = fetchedRecords.length;
                    fetchedRecords = fetchedRecords.filter(record => isRecordVisible(record));
                    console.log(`📅 Post Discogs - Client-side cutoff filter: ${beforeFilter} → ${fetchedRecords.length} records`);
                }
                
                records = fetchedRecords;
                renderRecords();
                showStatus(`Loaded ${records.length} records`, 'info');
                
                // Enable/disable post button based on records count
                const btn = document.getElementById('post-discogs-btn');
                if (btn) {
                    btn.disabled = records.length === 0;
                }
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading records:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Render records (NO checkboxes)
    function renderRecords() {
        const list = document.getElementById('post-discogs-records');
        if (!list) return;
        
        if (records.length === 0) {
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #999;">
                No records found${cutoffDate ? ` (seen after ${cutoffDate})` : ''}
            </div>`;
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Artist</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Title</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Store Price</th>
                    <th style="padding: 6px 8px; text-align: right; color: #28a745; font-weight: 600;">Discogs Price</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Markup</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Location</th>
                </tr>
            </thead>
            <tbody>`;
        
        records.forEach((r) => {
            const discogsPrice = r._discogsPrice || '—';
            const markup = r._markupPercent || 0;
            const markupColor = markup > 0 ? '#28a745' : markup < 0 ? '#dc3545' : '#ffc107';
            const markupText = markup > 0 ? `+${markup}%` : markup < 0 ? `${markup}%` : '0%';
            
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${r.id}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${r.artist || 'Unknown'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${r.title || 'Unknown'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${r.store_price ? '$' + r.store_price.toFixed(2) : '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #28a745; font-weight: 600;">${discogsPrice !== '—' ? '$' + discogsPrice.toFixed(2) : '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center; color: ${markupColor}; font-weight: 600;">${discogsPrice !== '—' ? markupText : '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 11px;">${r.location_name || '—'}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
        
        // Update button text with record count
        const btn = document.getElementById('post-discogs-btn');
        if (btn) {
            btn.textContent = `📤 Post All ${records.length} Records to Discogs`;
            btn.disabled = false;
        }
    }

    // Post ALL records to Discogs
    window.postDiscogsAll = async function() {
        if (records.length === 0) {
            alert('No records to post.');
            return;
        }

        const location = prompt('Enter location for these records (e.g., "Bin 24 | Left Top"):');
        if (location === null) return;
        if (!location.trim()) {
            alert('Location is required.');
            return;
        }

        // Filter to only records with a Discogs price
        const postableRecords = records.filter(r => r._discogsPrice && r._discogsPrice > 0);
        
        if (postableRecords.length === 0) {
            alert('No records have a valid Discogs price to post.');
            return;
        }

        if (!confirm(`Post ${postableRecords.length} record(s) to Discogs?\n\nLocation: ${location}`)) {
            return;
        }

        const statusDiv = document.getElementById('post-discogs-status');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.textContent = `⏳ Posting ${postableRecords.length} records to Discogs...`;
            statusDiv.className = 'status-message status-info';
        }

        // Disable button during posting
        const btn = document.getElementById('post-discogs-btn');
        if (btn) btn.disabled = true;

        let success = 0;
        let failed = 0;
        let skipped = 0;

        for (const record of postableRecords) {
            try {
                const discogsPrice = record._discogsPrice;
                if (!discogsPrice) {
                    skipped++;
                    continue;
                }

                // Update location
                await fetch(`${API_BASE}/records/${record.id}`, {
                    method: 'PUT',
                    credentials: 'include',
                    mode: 'cors',
                    headers: getHeaders(),
                    body: JSON.stringify({ location: location })
                });

                // Create listing
                const listingData = {
                    record: {
                        id: record.id,
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
                    mode: 'cors',
                    headers: getHeaders(),
                    body: JSON.stringify(listingData)
                });
                const data = await listingResult.json();

                if (data.success) {
                    success++;
                } else {
                    failed++;
                    console.error(`Failed to post record ${record.id}:`, data.error);
                }
            } catch (err) {
                console.error('Error posting record:', err);
                failed++;
            }
        }

        if (statusDiv) {
            let message = `✅ ${success} posted`;
            if (failed > 0) message += `, ❌ ${failed} failed`;
            if (skipped > 0) message += `, ⏭️ ${skipped} skipped (no price)`;
            statusDiv.textContent = message;
            statusDiv.className = 'status-message status-success';
            if (failed > 0 && success === 0) {
                statusDiv.className = 'status-message status-error';
            } else if (failed > 0) {
                statusDiv.className = 'status-message status-warning';
            }
        }
        
        // Re-enable button
        if (btn) btn.disabled = false;
        
        // Reload records to reflect changes
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
        console.log('📀 Post to Discogs initialized - NO CHECKBOXES');
        
        // Fetch cutoff date first, then load records
        fetchLastSeenCutoff().then(date => {
            cutoffDate = date;
            console.log('📅 Post Discogs using cutoff date:', cutoffDate || 'None (showing all)');
            loadRecords();
        });
    };
})();