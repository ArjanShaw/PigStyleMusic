// Scan/Locate page
(function() {
    'use strict';

    let locations = [];
    let recentlyScanned = [];
    const MAX_RECENT = 10;
    const STORAGE_KEY = 'pigstyle_recent_scans';

    // ===== API BASE URL =====
    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // ===== LOAD RECENT SCANS FROM LOCALSTORAGE =====
    function loadRecentScans() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                recentlyScanned = JSON.parse(stored);
                console.log(`📋 Loaded ${recentlyScanned.length} recent scans from storage`);
                return recentlyScanned;
            }
        } catch (err) {
            console.error('Error loading recent scans:', err);
        }
        return [];
    }

    // ===== SAVE RECENT SCANS TO LOCALSTORAGE =====
    function saveRecentScans() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(recentlyScanned));
            console.log(`💾 Saved ${recentlyScanned.length} recent scans to storage`);
        } catch (err) {
            console.error('Error saving recent scans:', err);
        }
    }

    // ===== LOAD LAST 10 RECORDS BY LAST_SEEN =====
    async function loadLastSeenRecords() {
        const list = document.getElementById('scan-records-list');
        if (!list) return;

        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading records...</div>';

        try {
            // Get the last 10 records by last_seen (status_id = 2 for active)
            const response = await fetch(`${API_BASE}/records?status_ids=2&limit=10&order_by=last_seen&order_dir=DESC`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();

            if (data.status === 'success' && data.records && data.records.length > 0) {
                // Store in recentlyScanned
                recentlyScanned = data.records.map(r => ({
                    id: r.id,
                    artist: r.artist || 'Unknown',
                    title: r.title || 'Unknown',
                    last_seen: r.last_seen,
                    location_name: r.location_name || 'No location',
                    location_id: r.location_id
                }));
                saveRecentScans();
                renderRecords();
            } else {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No records found</div>';
            }
        } catch (err) {
            console.error('Error loading last seen records:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // ===== RENDER RECORDS =====
    function renderRecords() {
        const list = document.getElementById('scan-records-list');
        if (!list) return;

        if (!recentlyScanned || recentlyScanned.length === 0) {
            list.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #999;">
                    <div style="font-size: 24px; margin-bottom: 8px;">📋</div>
                    <p>No records found</p>
                    <p style="font-size: 12px;">Scan a record to add it to this list</p>
                </div>
            `;
            return;
        }

        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                        <th style="padding: 6px 8px; text-align: left; color: #333; width: 40px;">#</th>
                        <th style="padding: 6px 8px; text-align: left; color: #333;">Artist</th>
                        <th style="padding: 6px 8px; text-align: left; color: #333;">Title</th>
                        <th style="padding: 6px 8px; text-align: left; color: #333;">Location</th>
                        <th style="padding: 6px 8px; text-align: right; color: #333;">Last Seen</th>
                    </tr>
                </thead>
                <tbody>
        `;

        recentlyScanned.forEach((r, i) => {
            const locationName = r.location_name || '—';
            const lastSeen = r.last_seen ? new Date(r.last_seen).toLocaleDateString() : '—';
            html += `
                <tr style="border-bottom: 1px solid #f0f0f0; ${i % 2 === 0 ? 'background: #fafafa;' : ''}">
                    <td style="padding: 6px 8px; color: #999; font-size: 12px;">${i + 1}</td>
                    <td style="padding: 6px 8px; color: #333;">${r.artist}</td>
                    <td style="padding: 6px 8px; color: #333;">${r.title}</td>
                    <td style="padding: 6px 8px; color: #28a745; font-weight: 500;">📍 ${locationName}</td>
                    <td style="padding: 6px 8px; text-align: right; color: #666; font-size: 12px;">${lastSeen}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
            <div style="padding: 8px 8px 0 8px; color: #999; font-size: 11px; text-align: right;">
                Showing ${recentlyScanned.length} records
            </div>
        `;

        list.innerHTML = html;
    }

    // ===== UPDATE COUNTER =====
    function updateCounter() {
        const counter = document.getElementById('scan-counter-display');
        if (counter) counter.textContent = recentlyScanned.length;
    }

    // ===== LOAD LOCATIONS =====
    async function loadLocations() {
        const select = document.getElementById('scan-location-select');
        if (!select) return;

        try {
            const response = await fetch(`${API_BASE}/api/locations`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.status === 'success') {
                locations = data.locations || [];
                select.innerHTML = '<option value="">-- Select Location --</option>';
                locations.forEach(loc => {
                    const opt = document.createElement('option');
                    opt.value = loc.id;
                    opt.textContent = loc.name;
                    select.appendChild(opt);
                });
                // Try to restore last selected location
                const savedLocation = localStorage.getItem('pigstyle_scan_location');
                if (savedLocation && locations.some(l => l.id == savedLocation)) {
                    select.value = savedLocation;
                }
                updateLocationPreview();
            }
        } catch (err) {
            console.error('Error loading locations:', err);
        }
    }

    // ===== UPDATE LOCATION PREVIEW =====
    function updateLocationPreview() {
        const select = document.getElementById('scan-location-select');
        const display = document.getElementById('scan-location-display');
        const input = document.getElementById('scan-input');
        const btn = document.getElementById('scan-submit-btn');

        if (!select || !display || !input || !btn) return;

        const locationId = parseInt(select.value);
        const loc = locations.find(l => l.id === locationId);

        if (loc) {
            display.textContent = `📍 ${loc.name}`;
            display.style.color = '#28a745';
            input.disabled = false;
            btn.disabled = false;
            // Save selected location
            localStorage.setItem('pigstyle_scan_location', String(locationId));
        } else {
            display.textContent = 'No location selected';
            display.style.color = '#dc3545';
            input.disabled = true;
            btn.disabled = true;
        }
    }

    // ===== PERFORM SCAN =====
    async function performScan(term) {
        const select = document.getElementById('scan-location-select');
        if (!select) return;

        const locationId = parseInt(select.value);
        if (!locationId) {
            showStatus('Please select a location first', 'warning');
            return;
        }

        const statusDiv = document.getElementById('scan-status');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.textContent = '⏳ Searching...';
            statusDiv.className = 'status-message status-info';
        }

        try {
            const response = await fetch(`${API_BASE}/records/search?q=${encodeURIComponent(term)}`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();

            if (data.status === 'success' && data.records && data.records.length > 0) {
                const record = data.records[0];
                await processScannedRecord(record, locationId);
            } else {
                if (statusDiv) {
                    statusDiv.textContent = '❌ No record found';
                    statusDiv.className = 'status-message status-error';
                }
                playSound('error');
            }
        } catch (err) {
            console.error('Scan error:', err);
            if (statusDiv) {
                statusDiv.textContent = `❌ Error: ${err.message}`;
                statusDiv.className = 'status-message status-error';
            }
        }

        const input = document.getElementById('scan-input');
        if (input) {
            input.value = '';
            input.focus();
        }
    }

    // ===== PROCESS SCANNED RECORD =====
    async function processScannedRecord(record, locationId) {
        const statusDiv = document.getElementById('scan-status');
        const today = new Date().toISOString().split('T')[0];

        try {
            // Get current max location_index for this location
            let maxIndex = 0;
            try {
                const indexResponse = await fetch(`${API_BASE}/records?location_id=${locationId}&limit=1&order_by=location_index&order_dir=DESC`, {
                    credentials: 'include',
                    headers: getHeaders()
                });
                const indexData = await indexResponse.json();
                if (indexData.status === 'success' && indexData.records && indexData.records.length > 0) {
                    maxIndex = parseInt(indexData.records[0].location_index) || 0;
                }
            } catch (e) {
                console.warn('Could not get max location index, starting at 0');
            }

            const newIndex = maxIndex + 1;

            const response = await fetch(`${API_BASE}/records/${record.id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({
                    location_id: locationId,
                    location_index: newIndex,
                    last_seen: today
                })
            });
            const data = await response.json();

            if (data.status === 'success') {
                // Get location name
                const loc = locations.find(l => l.id === locationId);
                const locationName = loc ? loc.name : 'Unknown';

                // Add to recent list (at the top)
                const scanEntry = {
                    id: record.id,
                    artist: record.artist || 'Unknown',
                    title: record.title || 'Unknown',
                    last_seen: today,
                    location_name: locationName,
                    location_id: locationId
                };

                // Remove if already exists (based on id)
                recentlyScanned = recentlyScanned.filter(r => r.id !== record.id);
                // Add to front
                recentlyScanned.unshift(scanEntry);
                // Keep only MAX_RECENT
                if (recentlyScanned.length > MAX_RECENT) {
                    recentlyScanned = recentlyScanned.slice(0, MAX_RECENT);
                }
                saveRecentScans();
                renderRecords();
                updateCounter();

                if (statusDiv) {
                    statusDiv.textContent = `✅ #${record.id}: ${record.artist} - ${record.title} → ${locationName} (Index: ${newIndex})`;
                    statusDiv.className = 'status-message status-success';
                }
                playSound('success');
            } else {
                if (statusDiv) {
                    statusDiv.textContent = `❌ Error updating record`;
                    statusDiv.className = 'status-message status-error';
                }
            }
        } catch (err) {
            console.error('Error processing record:', err);
            if (statusDiv) {
                statusDiv.textContent = `❌ Error: ${err.message}`;
                statusDiv.className = 'status-message status-error';
            }
            playSound('error');
        }
    }

    // ===== SHOW STATUS =====
    function showStatus(message, type) {
        const statusDiv = document.getElementById('scan-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.className = `status-message status-${type}`;
        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

    // ===== PLAY SOUND =====
    function playSound(type) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = type === 'success' ? 523.25 : 220;
            osc.type = 'sine';
            gain.gain.value = 0.15;
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
        } catch (e) {}
    }

    // ===== REFRESH =====
    window.scanRefresh = function() {
        loadLastSeenRecords();
        showStatus('🔄 Refreshed', 'info');
    };

    // ===== CLEAR RECENT =====
    window.scanClearRecent = function() {
        if (confirm('Clear recent scans list?')) {
            recentlyScanned = [];
            saveRecentScans();
            renderRecords();
            updateCounter();
            showStatus('🗑️ Recent scans cleared', 'info');
        }
    };

    // ===== INIT =====
    window.initScan = function() {
        console.log('🔍 Scan/Locate initialized');
        
        // Load recent scans from storage
        loadRecentScans();
        
        // Load locations
        loadLocations();
        
        // Load last 10 records by last_seen
        loadLastSeenRecords();
        
        // Render UI
        renderRecords();
        updateCounter();

        // Bind events
        const locationSelect = document.getElementById('scan-location-select');
        const submitBtn = document.getElementById('scan-submit-btn');
        const scanInput = document.getElementById('scan-input');

        if (locationSelect) {
            locationSelect.addEventListener('change', updateLocationPreview);
        }

        if (submitBtn) {
            submitBtn.addEventListener('click', function() {
                if (scanInput && scanInput.value.trim()) {
                    performScan(scanInput.value.trim());
                }
            });
        }

        if (scanInput) {
            scanInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && this.value.trim()) {
                    performScan(this.value.trim());
                }
            });
            // Focus the input after a short delay
            setTimeout(() => scanInput.focus(), 300);
        }

        // Add refresh button if it doesn't exist
        const actionsDiv = document.querySelector('.scan-actions');
        if (actionsDiv) {
            const refreshBtn = document.createElement('button');
            refreshBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh';
            refreshBtn.onclick = window.scanRefresh;
            refreshBtn.style.cssText = 'padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; margin-right: 8px;';
            actionsDiv.prepend(refreshBtn);

            const clearBtn = document.createElement('button');
            clearBtn.innerHTML = '<i class="fas fa-trash"></i> Clear Recent';
            clearBtn.onclick = window.scanClearRecent;
            clearBtn.style.cssText = 'padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;';
            actionsDiv.appendChild(clearBtn);
        }
    };

})();