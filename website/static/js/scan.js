// Scan/Locate page
(function() {
    let scannedRecords = [];
    let recentScans = [];
    let scanIndex = 0;
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
                updateLocationPreview();
            }
        } catch (err) {
            console.error('Error loading locations:', err);
        }
    }

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
            input.disabled = false;
            btn.disabled = false;
        } else {
            display.textContent = 'No location selected';
            input.disabled = true;
            btn.disabled = true;
        }
    }

    // Perform scan
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

    async function processScannedRecord(record, locationId) {
        const statusDiv = document.getElementById('scan-status');
        const today = new Date().toISOString().split('T')[0];
        scanIndex++;

        try {
            const response = await fetch(`${API_BASE}/records/${record.id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({
                    location_id: locationId,
                    location_index: scanIndex,
                    last_seen: today
                })
            });
            const data = await response.json();

            if (data.status === 'success') {
                record.location_id = locationId;
                record.location_index = scanIndex;
                record.last_seen = today;
                
                scannedRecords.unshift(record);
                renderRecords();
                updateCounter();
                addToRecent(record);
                
                if (statusDiv) {
                    statusDiv.textContent = `✅ Added #${record.id}: ${record.artist} - ${record.title}`;
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

    function renderRecords() {
        const list = document.getElementById('scan-records-list');
        if (!list) return;
        
        if (scannedRecords.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Scan records to build the list</div>';
            return;
        }

        let html = '';
        scannedRecords.forEach((r, i) => {
            html += `
                <div style="display: flex; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid #f0f0f0;">
                    <span style="color: #333; font-size: 13px;">#${i+1} ${r.artist} - ${r.title}</span>
                    <span style="color: #28a745; font-size: 12px;">📍 ${r.location_index || '—'}</span>
                </div>
            `;
        });
        list.innerHTML = html;
    }

    function updateCounter() {
        const counter = document.getElementById('scan-counter-display');
        const index = document.getElementById('scan-index-display');
        if (counter) counter.textContent = scannedRecords.length;
        if (index) index.textContent = `📍 Index: ${scanIndex}`;
    }

    function addToRecent(record) {
        recentScans.unshift({
            id: record.id,
            artist: record.artist,
            title: record.title,
            time: new Date().toLocaleTimeString()
        });
        if (recentScans.length > 10) recentScans.pop();
        renderRecent();
    }

    function renderRecent() {
        const list = document.getElementById('recent-scans-list');
        const last = document.getElementById('last-scan-display');
        if (!list) return;
        
        if (recentScans.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 10px; color: #999;">No recent scans</div>';
            if (last) last.textContent = 'Last: --';
            return;
        }

        let html = '';
        recentScans.forEach((s) => {
            html += `
                <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f5f5f5; font-size: 12px;">
                    <span>${s.artist} - ${s.title}</span>
                    <span style="color: #999;">${s.time}</span>
                </div>
            `;
        });
        list.innerHTML = html;
        if (last) last.textContent = `Last: ${recentScans[0].artist}`;
    }

    function showStatus(message, type) {
        const statusDiv = document.getElementById('scan-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.className = `status-message status-${type}`;
        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

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
        } catch(e) {}
    }

    // Init
    window.initScan = function() {
        console.log('Scan/Locate initialized');
        loadLocations();
        scannedRecords = [];
        recentScans = [];
        scanIndex = 0;
        renderRecords();
        updateCounter();
        renderRecent();
        
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
            scanInput.focus();
        }
    };
})();
