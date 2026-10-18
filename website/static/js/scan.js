// Scan/Locate page - SINGLE API CALL
(function() {
    'use strict';

    let locations = [];          // ALL locations (parents + leaves)
    let leafLocations = [];      // deepest-generation only (navigable)
    let recentlyScanned = [];
    let locationIndexCache = {}; // Track next index per location
    let locationLastSeen = {};   // location_id -> latest_last_seen (ISO string or null)
    let parentIds = new Set();   // ids that are referenced as parent_id by someone
    const MAX_RECENT = 100;
    const STORAGE_KEY = 'pigstyle_recent_scans';
    const URGENCY_KEY = 'pigstyle_scan_urgency_mode';
    const IGNORE_EMPTY_KEY = 'pigstyle_scan_ignore_empty';

    // Preferred leaf order within a bin. Anything not listed sorts after,
    // alphabetically. Compared case-insensitively on the leaf name.
    const LEAF_ORDER = ['lt', 'rt', 'lb', 'rb'];

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
        } catch (err) {
            console.error('Error saving recent scans:', err);
        }
    }

    // ===== FORMAT TIMESTAMP =====
    function formatTimestamp(timestamp) {
        if (!timestamp) return '—';
        try {
            const date = new Date(timestamp);
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return timestamp;
        }
    }

    // ===== FORMAT RELATIVE TIME =====
    // Compact "how long ago" for the selected-location display.
    // Returns "never" if timestamp is null/undefined.
    function formatRelative(timestamp) {
        if (!timestamp) return 'never';
        let t;
        try {
            t = Date.parse(timestamp);
        } catch (e) {
            return 'never';
        }
        if (isNaN(t)) return 'never';

        const diffMs = Date.now() - t;
        if (diffMs < 0) return 'just now'; // clock skew

        const min = Math.floor(diffMs / 60000);
        if (min < 1) return 'just now';
        if (min < 60) return `${min}m ago`;

        const hrs = Math.floor(min / 60);
        if (hrs < 24) return `${hrs}h ago`;

        const days = Math.floor(hrs / 24);
        if (days < 7) return `${days}d ago`;

        const weeks = Math.floor(days / 7);
        if (weeks < 5) return `${weeks}w ago`;

        const months = Math.floor(days / 30);
        if (months < 12) return `${months}mo ago`;

        const years = Math.floor(days / 365);
        return `${years}y ago`;
    }

    // ===== GET LOCATION DISPLAY =====
    function getLocationDisplay(loc) {
        if (!loc) return '';
        return loc.display_name || loc.name || '';
    }

    // ===== URGENCY MODE STATE =====
    function isUrgencyMode() {
        return localStorage.getItem(URGENCY_KEY) === '1';
    }

    function setUrgencyMode(on) {
        localStorage.setItem(URGENCY_KEY, on ? '1' : '0');
    }

    // ===== IGNORE EMPTY MODE STATE =====
    function isIgnoreEmpty() {
        return localStorage.getItem(IGNORE_EMPTY_KEY) === '1';
    }

    function setIgnoreEmpty(on) {
        localStorage.setItem(IGNORE_EMPTY_KEY, on ? '1' : '0');
    }

    // ===== LOAD LAST RECORDS BY LAST_SEEN =====
    async function loadLastSeenRecords() {
        const list = document.getElementById('scan-records-list');
        if (!list) return;

        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading records...</div>';

        try {
            const response = await fetch(`${API_BASE}/records?status_ids=2&limit=100&order_by=last_seen&order_dir=DESC`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();

            if (data.status === 'success' && data.records && data.records.length > 0) {
                recentlyScanned = data.records.map(r => ({
                    id: r.id,
                    artist: r.artist || 'Unknown',
                    title: r.title || 'Unknown',
                    last_seen: r.last_seen,
                    location_name: r.location_display || r.location_name || 'No location',
                    location_id: r.location_id,
                    barcode: r.barcode
                }));
                
                data.records.forEach(r => {
                    if (r.location_id) {
                        const currentMax = locationIndexCache[r.location_id] || 0;
                        if (r.location_index && r.location_index > currentMax) {
                            locationIndexCache[r.location_id] = r.location_index;
                        }
                    }
                });
                
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
            <div style="max-height: 500px; overflow-y: auto; width: 100%;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead style="position: sticky; top: 0; z-index: 10;">
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
            const lastSeen = formatTimestamp(r.last_seen);
            
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
            </div>
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

    // ===== LEAF NAME / RANK =====
    function getLeafName(loc) {
        if (!loc) return '';
        return String(loc.name || '');
    }

    function leafRank(loc) {
        const leaf = getLeafName(loc).trim().toLowerCase();
        const idx = LEAF_ORDER.indexOf(leaf);
        return idx === -1 ? 99 : idx;
    }

    // ===== NORMAL COMPARATOR =====
    function normalCmp(a, b) {
        const aKey = getLocationDisplay(a);
        const bKey = getLocationDisplay(b);
        const keyCmp = aKey.localeCompare(bKey, undefined, { numeric: true });
        if (keyCmp !== 0) {
            const aParent = a.parent_name || '';
            const bParent = b.parent_name || '';
            if (aParent === bParent) {
                const ra = leafRank(a);
                const rb = leafRank(b);
                if (ra !== rb) return ra - rb;
                return getLeafName(a).localeCompare(getLeafName(b), undefined, { numeric: true });
            }
            return keyCmp;
        }
        return 0;
    }

    // ===== NAVIGABLE LEAF SET (respects ignore-empty) =====
    // Returns the list of leaf locations eligible for selection/navigation
    // under the current settings.
    function getNavigableLocations() {
        if (!isIgnoreEmpty()) return leafLocations;
        return leafLocations.filter(loc => (loc.record_count || 0) > 0);
    }

    // ===== GET LOCATION ORDER (leaves only) =====
    //   Normal  - by composed display_name (numeric bin order), with leaf
    //             sub-order LT, RT, LB, RB inside each bin.
    //   Urgent  - purely by latest_last_seen ascending (oldest first). NULL
    //             (never scanned) sorts first. Ties fall back to normal order.
    //
    // Parents are never navigable — only the deepest generation (leaves).
    // When "ignore empty" is on, empty bins are excluded from both modes.
    function getLocationOrder() {
        const base = [...getNavigableLocations()];

        if (!isUrgencyMode()) {
            return base.sort(normalCmp);
        }

        const seenValue = (loc) => {
            const raw = locationLastSeen[loc.id];
            if (!raw) return -Infinity;
            const t = Date.parse(raw);
            return isNaN(t) ? -Infinity : t;
        };

        return base.sort((a, b) => {
            const sa = seenValue(a);
            const sb = seenValue(b);
            if (sa !== sb) return sa - sb;
            return normalCmp(a, b);
        });
    }

    // ===== REBUILD DROPDOWN =====
    // Re-sorts and repopulates. Preserves the current selection if possible;
    // if the current selection is no longer available (e.g. its bin became
    // empty and "ignore empty" is on), picks the first available location.
    function rebuildLocationSelect() {
        const select = document.getElementById('scan-location-select');
        if (!select) return;

        const currentValue = select.value;
        const sorted = getLocationOrder();

        select.innerHTML = '<option value="">-- Select Location --</option>';
        sorted.forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc.id;
            opt.textContent = getLocationDisplay(loc);
            select.appendChild(opt);
        });

        const stillPresent = currentValue &&
            sorted.some(l => String(l.id) === String(currentValue));

        if (stillPresent) {
            select.value = currentValue;
        } else if (sorted.length > 0) {
            // Current selection is no longer navigable: fall back to first.
            select.value = String(sorted[0].id);
        }

        updateLocationPreview();
        updateNavButtons();
    }

    // ===== JUMP TO TOP OF CURRENT ORDER =====
    // Forces the selection to the first location in the current mode's
    // order (normal → LT/RT/LB/RB; urgent → most urgent). Used when a
    // toggle changes the navigable set so the user lands somewhere
    // deterministic in the new ordering.
    function selectTopOfOrder() {
        const select = document.getElementById('scan-location-select');
        if (!select) return;

        const sorted = getLocationOrder();
        if (sorted.length === 0) {
            select.value = '';
            updateLocationPreview();
            updateNavButtons();
            return;
        }

        select.value = String(sorted[0].id);
        updateLocationPreview();
        updateNavButtons();
    }

    // ===== NAVIGATE TO NEXT/PREVIOUS LOCATION =====
    window.scanNav = function(direction) {
        const select = document.getElementById('scan-location-select');
        if (!select) return;

        const currentId = parseInt(select.value);
        if (!currentId) {
            const sorted = getLocationOrder();
            if (sorted.length > 0) {
                select.value = sorted[0].id;
                updateLocationPreview();
                updateNavButtons();
            }
            return;
        }

        const sorted = getLocationOrder();
        const currentIdx = sorted.findIndex(l => l.id === currentId);
        
        if (currentIdx === -1) return;

        let newIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;

        if (newIdx >= 0 && newIdx < sorted.length) {
            select.value = sorted[newIdx].id;
            updateLocationPreview();
            updateNavButtons();
        }
    };

    // ===== UPDATE NAV BUTTONS =====
    function updateNavButtons() {
        const select = document.getElementById('scan-location-select');
        const prevBtn = document.getElementById('scan-prev-btn');
        const nextBtn = document.getElementById('scan-next-btn');
        
        if (!select || !prevBtn || !nextBtn) return;

        const currentId = parseInt(select.value);
        if (!currentId) {
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }

        const sorted = getLocationOrder();
        const currentIdx = sorted.findIndex(l => l.id === currentId);

        prevBtn.disabled = (currentIdx <= 0);
        nextBtn.disabled = (currentIdx === -1 || currentIdx >= sorted.length - 1);
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

                // Build parent id set. A location is a leaf iff no other
                // location references it as parent_id.
                parentIds = new Set();
                locations.forEach(loc => {
                    if (loc.parent_id !== null && loc.parent_id !== undefined) {
                        parentIds.add(loc.parent_id);
                    }
                });

                leafLocations = locations.filter(loc => !parentIds.has(loc.id));

                locationLastSeen = {};
                locations.forEach(loc => {
                    locationLastSeen[loc.id] = loc.latest_last_seen || null;
                });
                
                // Populate the dropdown (sorted per current mode).
                rebuildLocationSelect();
                
                if (isUrgencyMode()) {
                    // In urgency mode the current location IS the most urgent.
                    // Ignore any previously saved selection.
                    selectTopOfOrder();
                } else {
                    // Normal mode: restore the saved location if it still
                    // exists AND is navigable under current filters.
                    const savedLocation = localStorage.getItem('pigstyle_scan_location');
                    const navigable = getNavigableLocations();
                    if (savedLocation && navigable.some(l => l.id == savedLocation)) {
                        select.value = savedLocation;
                    }
                    updateLocationPreview();
                    updateNavButtons();
                }
            }
        } catch (err) {
            console.error('Error loading locations:', err);
        }
    }

    // ===== UPDATE LOCATION PREVIEW =====
    // Shows "📍 Bin 24/RB · never · 42 rec" in the display span.
    // Falls back to "No location selected" when nothing is chosen.
    function updateLocationPreview() {
        const select = document.getElementById('scan-location-select');
        const display = document.getElementById('scan-location-display');
        const input = document.getElementById('scan-input');
        const btn = document.getElementById('scan-submit-btn');

        if (!select || !display || !input || !btn) return;

        const locationId = parseInt(select.value);
        const loc = locations.find(l => l.id === locationId);

        if (loc) {
            const name = getLocationDisplay(loc);
            const seenRaw = locationLastSeen[loc.id];
            const rel = formatRelative(seenRaw);
            const count = loc.record_count || 0;

            display.textContent = `📍 ${name} · ${rel} · ${count} rec`;

            display.title = seenRaw
                ? `Last scanned: ${formatTimestamp(seenRaw)} · ${count} record(s)`
                : `Never scanned · ${count} record(s)`;

            display.style.color = '#28a745';
            input.disabled = false;
            btn.disabled = false;
            localStorage.setItem('pigstyle_scan_location', String(locationId));
        } else {
            display.textContent = 'No location selected';
            display.title = '';
            display.style.color = '#dc3545';
            input.disabled = true;
            btn.disabled = true;
        }
        
        updateNavButtons();
    }

    // ===== GET NEXT LOCATION INDEX =====
    function getNextLocationIndex(locationId) {
        const currentMax = locationIndexCache[locationId] || 0;
        return currentMax + 1;
    }

    // ===== PERFORM SCAN - SINGLE API CALL =====
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
            statusDiv.textContent = '⏳ Scanning...';
            statusDiv.className = 'status-message status-info';
        }

        const input = document.getElementById('scan-input');
        if (input) input.value = '';

        try {
            const locationIndex = getNextLocationIndex(locationId);
            
            const response = await fetch(`${API_BASE}/api/records/scan-update`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({
                    barcode: term,
                    location_id: locationId,
                    location_index: locationIndex
                })
            });

            const data = await response.json();

            if (data.status === 'success' && data.record) {
                locationIndexCache[locationId] = locationIndex;

                // Just scanned this location: bump its last-seen so urgency
                // order stays live without a full reload.
                locationLastSeen[locationId] = data.record.last_seen || new Date().toISOString();
                
                const composedLocation = data.record.location_display
                    || data.record.location_name
                    || 'Unknown';

                const scanEntry = {
                    id: data.record.id,
                    artist: data.record.artist || 'Unknown',
                    title: data.record.title || 'Unknown',
                    last_seen: data.record.last_seen,
                    location_name: composedLocation,
                    location_id: data.record.location_id,
                    barcode: data.record.barcode || ''
                };

                recentlyScanned = recentlyScanned.filter(r => r.id !== data.record.id);
                recentlyScanned.unshift(scanEntry);
                if (recentlyScanned.length > MAX_RECENT) {
                    recentlyScanned = recentlyScanned.slice(0, MAX_RECENT);
                }
                saveRecentScans();
                renderRecords();
                updateCounter();

                // If urgency mode is on, re-sort so the just-scanned location
                // sinks to the bottom (least urgent). Selection stays put.
                if (isUrgencyMode()) {
                    rebuildLocationSelect();
                } else {
                    // Even in normal mode, the displayed "X ago" should
                    // refresh to "just now" for the current bin.
                    updateLocationPreview();
                }

                const timeStr = new Date(data.record.last_seen).toLocaleString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                if (statusDiv) {
                    statusDiv.textContent = `✅ #${data.record.id}: ${data.record.artist} - ${data.record.title} → ${composedLocation} (Index: ${locationIndex}) at ${timeStr}`;
                    statusDiv.className = 'status-message status-success';
                }
                playSound('success');
            } else {
                if (statusDiv) {
                    statusDiv.textContent = `❌ ${data.error || 'No active record found'}`;
                    statusDiv.className = 'status-message status-error';
                }
                playSound('error');
            }
        } catch (err) {
            console.error('Scan error:', err);
            if (statusDiv) {
                statusDiv.textContent = `❌ ${err.message}`;
                statusDiv.className = 'status-message status-error';
            }
            playSound('error');
        }

        if (input) setTimeout(() => input.focus(), 100);
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
        loadLocations();
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
        
        loadRecentScans();
        loadLocations();
        loadLastSeenRecords();
        renderRecords();
        updateCounter();

        const locationSelect = document.getElementById('scan-location-select');
        const submitBtn = document.getElementById('scan-submit-btn');
        const scanInput = document.getElementById('scan-input');
        const prevBtn = document.getElementById('scan-prev-btn');
        const nextBtn = document.getElementById('scan-next-btn');
        const urgencyToggle = document.getElementById('scan-urgency-toggle');
        const ignoreEmptyToggle = document.getElementById('scan-ignore-empty-toggle');

        if (urgencyToggle) {
            urgencyToggle.checked = isUrgencyMode();
            urgencyToggle.addEventListener('change', function() {
                setUrgencyMode(this.checked);
                // Toggling urgency changes the top-of-order, so jump there
                // in both directions. This keeps the selection deterministic
                // and matches the "Ignore empty" toggle behavior.
                rebuildLocationSelect();
                selectTopOfOrder();
                if (scanInput) scanInput.focus();
            });
        }

        if (ignoreEmptyToggle) {
            ignoreEmptyToggle.checked = isIgnoreEmpty();
            ignoreEmptyToggle.addEventListener('change', function() {
                setIgnoreEmpty(this.checked);
                // Toggling the navigable set changes the top-of-order in
                // both directions. Jump to the first location in the new
                // order (which includes empty bins when unchecked).
                rebuildLocationSelect();
                selectTopOfOrder();
                if (scanInput && !scanInput.disabled) scanInput.focus();
            });
        }

        if (locationSelect) {
            locationSelect.addEventListener('change', function() {
                updateLocationPreview();
                updateNavButtons();
                if (scanInput) scanInput.focus();
            });

            locationSelect.addEventListener('keydown', function(e) {
                const allowed = [
                    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                    'Enter', 'Escape', 'Tab', 'Home', 'End', ' '
                ];
                if (!allowed.includes(e.key)) {
                    e.preventDefault();
                    if (scanInput && !scanInput.disabled) scanInput.focus();
                }
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                window.scanNav('prev');
                if (scanInput) scanInput.focus();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                window.scanNav('next');
                if (scanInput) scanInput.focus();
            });
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
            setTimeout(() => scanInput.focus(), 300);
        }

        [prevBtn, nextBtn].forEach(btn => {
            if (!btn) return;
            btn.addEventListener('keydown', function(e) {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        });

        document.addEventListener('keydown', function(e) {
            const t = e.target;
            if (t === scanInput) return;
            if (t === locationSelect) return;
            if (t === prevBtn || t === nextBtn) return;
            if (t === urgencyToggle) return;
            if (t === ignoreEmptyToggle) return;
            if (e.key.length === 1 || e.key === 'Enter') {
                if (scanInput && !scanInput.disabled) scanInput.focus();
            }
        }, true);

        updateNavButtons();

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