// ================================================================
// FILE: /static/js/discogs.js
// Discogs hub — Post to Discogs + Discogs Orders in one module
// ================================================================
(function() {
    'use strict';

    // ===== API BASE URL =====
    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    // ===== SHARED HELPERS =====
    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function showHubStatus(message, type) {
        const postStatus = document.getElementById('post-discogs-status');
        const ordersStatus = document.getElementById('discogs-orders-status-msg');
        const postPanel = document.getElementById('discogs-panel-post');

        const onPostTab = postPanel && postPanel.style.display !== 'none';
        const target = onPostTab ? (postStatus || ordersStatus) : (ordersStatus || postStatus);
        if (!target) return;

        target.style.display = 'block';
        target.className = `status-message status-${type}`;
        target.innerHTML = message;
        if (type !== 'error' && type !== 'warning') {
            setTimeout(() => { target.style.display = 'none'; }, 8000);
        }
    }

    // ================================================================
    // ================  POST TO DISCOGS  =============================
    // ================================================================

    const DISCOGS_POST_DELAY_MS = 3000;

    let locationCounts = [];
    let recordsByLocation = new Map();

    let discogsMarkupPercent = null;
    let discogsPriceStep = null;
    let discogsMaxMarkdown = null;

    let isUpdating = false;
    let isPosting = false;
    let cancelPosting = false;
    let isLoadingLocations = false;
    let hasLoadedOnce = false;

    let expandedLocations = new Set();
    let selectedLocations = new Set();
    let expandedSections = new Set();

    // ---------- Post: helpers ----------
    function buildLocationDisplay(record) {
        const name = record.location_display || record.location_name || 'Unknown Location';
        const idx = record.location_index;
        if (idx === null || idx === undefined || idx === '') return name;
        return `${name} (#${idx})`;
    }

    function getMarkdownFloor() {
        return -Math.abs(discogsMaxMarkdown);
    }

    // ---------- Post: config ----------
    async function fetchRequiredConfig(key) {
        const response = await fetch(`${API_BASE}/config/${key}`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Config ${key} not available (HTTP ${response.status})`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(`Config ${key} returned non-success status`);
        if (data.config_value === null || data.config_value === undefined || data.config_value === '') {
            throw new Error(`Config ${key} is missing in app_config`);
        }
        const parsed = parseFloat(data.config_value);
        if (isNaN(parsed)) throw new Error(`Config ${key} is not a valid number (got "${data.config_value}")`);
        return parsed;
    }

    async function fetchDiscogsConfig() {
        const markup = await fetchRequiredConfig('PRICING_MARKUP_PERCENT');
        const step   = await fetchRequiredConfig('PRICING_PRICE_STEP');
        const maxMd  = await fetchRequiredConfig('PRICING_MAX_MARKDOWN');

        console.log(`📥 Loaded shared pricing config: markup=${markup}, step=${step}, maxMd=${maxMd}`);

        if (markup < 0 || markup > 200) throw new Error(`Config PRICING_MARKUP_PERCENT must be between 0 and 200 (got ${markup})`);
        if (maxMd < 0 || maxMd > 100) throw new Error(`Config PRICING_MAX_MARKDOWN must be between 0 and 100 (got ${maxMd})`);
        if (step < 0) throw new Error(`Config PRICING_PRICE_STEP must be >= 0 (got ${step})`);

        discogsMarkupPercent = markup;
        discogsPriceStep     = step;
        discogsMaxMarkdown   = Math.abs(maxMd);

        const markupEl = document.getElementById('discogs-markup-percent');
        if (markupEl) markupEl.value = discogsMarkupPercent;
        const stepEl = document.getElementById('discogs-price-step');
        if (stepEl) stepEl.value = discogsPriceStep;
        const maxEl = document.getElementById('discogs-max-markdown');
        if (maxEl) maxEl.value = discogsMaxMarkdown;

        updatePriceInfo();
    }

    async function saveDiscogsConfig() {
        await saveOneConfig('PRICING_MARKUP_PERCENT', discogsMarkupPercent);
        await saveOneConfig('PRICING_PRICE_STEP', discogsPriceStep);
        await saveOneConfig('PRICING_MAX_MARKDOWN', discogsMaxMarkdown);
    }

    async function saveOneConfig(key, value) {
        const response = await fetch(`${API_BASE}/config/${key}`, {
            method: 'PUT',
            credentials: 'include',
            headers: getHeaders(),
            body: JSON.stringify({ config_value: value })
        });
        if (!response.ok) {
            let detail = '';
            try { detail = (await response.json()).error || ''; } catch (_) {}
            throw new Error(`Failed to save ${key} (HTTP ${response.status}) ${detail}`);
        }
        const data = await response.json();
        if (data.status !== 'success') throw new Error(`Failed to save ${key}: ${data.error || 'unknown error'}`);
        if (data.config_value !== undefined && data.config_value !== null) {
            const stored = parseFloat(data.config_value);
            if (isNaN(stored) || Math.abs(stored - value) > 0.001) {
                throw new Error(`Server stored ${key}=${data.config_value}, expected ${value}`);
            }
            console.log(`✅ Saved ${key} = ${stored}`);
        } else {
            console.log(`✅ Saved ${key} = ${value} (server did not echo value)`);
        }
    }

    // ---------- Post: price calc ----------
    function calculateDiscogsPrice(record) {
        if (!record || !record.created_at || !record.store_price || record.store_price <= 0) return null;
        if (record.consignor_id !== null && record.consignor_id !== undefined) return null;

        if (discogsMarkupPercent === null || discogsPriceStep === null || discogsMaxMarkdown === null) {
            throw new Error('Discogs config not loaded — cannot calculate price');
        }

        let createdDate;
        if (typeof record.created_at === 'string') {
            createdDate = new Date(record.created_at.split('T')[0]);
        } else {
            createdDate = new Date(record.created_at);
        }
        if (isNaN(createdDate.getTime())) return null;

        const today = new Date();
        const daysOld = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
        const weeksOld = Math.floor(daysOld / 7);

        const floor = getMarkdownFloor();
        let markup = discogsMarkupPercent - (weeksOld * discogsPriceStep);
        markup = Math.max(floor, markup);

        const discogsPrice = record.store_price * (1 + markup / 100);

        return {
            discogs_price: Math.round(discogsPrice * 100) / 100,
            markup_percent: Math.round(markup * 10) / 10,
            days_old: daysOld,
            weeks_old: weeksOld
        };
    }

    function calculateDiscogsPricesForRecords(recordsToCalculate) {
        if (!recordsToCalculate || recordsToCalculate.length === 0) return [];
        return recordsToCalculate.map(r => {
            const priceData = calculateDiscogsPrice(r);
            if (priceData) {
                r._discogsPrice  = priceData.discogs_price;
                r._markupPercent = priceData.markup_percent;
                r._daysOld       = priceData.days_old;
                r._weeksOld      = priceData.weeks_old;
            } else {
                r._discogsPrice  = null;
                r._markupPercent = null;
                r._daysOld       = null;
                r._weeksOld      = null;
            }
            return r;
        });
    }

    function updatePriceInfo() {
        const info = document.getElementById('price-calc-info');
        if (!info) return;
        if (discogsMarkupPercent === null) { info.textContent = 'Config not loaded'; return; }
        if (locationCounts.length === 0) {
            info.textContent = `Markup: +${discogsMarkupPercent}% -${discogsPriceStep}%/wk (floor -${discogsMaxMarkdown}%) | no locations loaded`;
            return;
        }
        const totalEligible = locationCounts.reduce((s, l) => s + (l.record_count || 0), 0);
        info.textContent = `Markup: +${discogsMarkupPercent}% -${discogsPriceStep}%/wk (floor -${discogsMaxMarkdown}%) | ${totalEligible} eligible records across ${locationCounts.length} locations`;
    }

    // ---------- Post: update prices button ----------
    window.updateDiscogsPrices = async function() {
        if (isUpdating) return;
        if (isLoadingLocations) { alert('Please wait — locations are still loading.'); return; }

        isUpdating = true;
        try {
            const markupInput = document.getElementById('discogs-markup-percent');
            const stepInput   = document.getElementById('discogs-price-step');
            const maxInput    = document.getElementById('discogs-max-markdown');

            const newMarkup = parseFloat(markupInput.value);
            const newStep   = parseFloat(stepInput.value);
            const newMax    = parseFloat(maxInput.value);

            if (isNaN(newMarkup) || newMarkup < 0 || newMarkup > 200) { alert('Initial Markup must be between 0 and 200 (% above store price)'); return; }
            if (isNaN(newStep) || newStep < 0 || newStep > 50) { alert('Weekly Step must be between 0 and 50 (%/wk drop)'); return; }
            if (isNaN(newMax) || newMax < 0 || newMax > 100) { alert('Max Markdown must be between 0 and 100 (% floor below store)'); return; }

            discogsMarkupPercent = newMarkup;
            discogsPriceStep     = newStep;
            discogsMaxMarkdown   = Math.abs(newMax);

            await saveDiscogsConfig();

            for (const [locId, recs] of recordsByLocation.entries()) {
                recordsByLocation.set(locId, calculateDiscogsPricesForRecords(recs));
            }

            if (recordsByLocation.size > 0) {
                renderPostRecords();
                showPostStatus(`✅ Settings saved. Recalculated ${recordsByLocation.size} cached location(s).`, 'info');
            } else {
                showPostStatus('✅ Settings saved. Expand a location to load records.', 'info');
            }

            updatePriceInfo();
            updatePostButtons();
        } catch (err) {
            console.error('Update prices error:', err);
            showPostStatus(`❌ ${err.message}`, 'error');
        } finally {
            isUpdating = false;
        }
    };

    // ---------- Post: progress UI ----------
    function showLoadProgressBar(label, loaded, total, extra) {
        const statusDiv = document.getElementById('post-discogs-status');
        if (!statusDiv) return;
        const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message status-info';
        statusDiv.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span>${label}</span>
                    <span style="font-weight:600;">${loaded}${total ? ' / ' + total : ''}${total ? ' (' + pct + '%)' : ''}</span>
                </div>
                <div style="width:100%;height:8px;background:#e9ecef;border-radius:4px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#667eea,#764ba2);transition:width 0.2s ease;"></div>
                </div>
                ${extra ? `<div style="font-size:12px;color:#666;">${extra}</div>` : ''}
            </div>
        `;
    }

    function showPostStatus(message, type) {
        const statusDiv = document.getElementById('post-discogs-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = message;
        statusDiv.className = `status-message status-${type}`;
        if (type !== 'error' && type !== 'warning') {
            setTimeout(() => { statusDiv.style.display = 'none'; }, 8000);
        }
    }

    function showLoadError(msg) {
        const statusDiv = document.getElementById('post-discogs-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message status-error';
        statusDiv.innerHTML = `❌ ${msg}`;
    }

    // ---------- Post: fetch location counts (from /api/locations) ----------
    async function fetchLocationCounts() {
        const url = `${API_BASE}/api/locations`;
        const response = await fetch(url, {
            credentials: 'include',
            mode: 'cors',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch locations (HTTP ${response.status})`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || 'Locations API error');

        const rows = data.locations || [];
        // Drop empty top-level parent rows (containers only, no records of their own).
        // Keep anything with records or anything that is a child.
        return rows
            .filter(r => (r.record_count || 0) > 0 || (r.parent_id !== null && r.parent_id !== undefined))
            .map(r => ({
                location_id: r.id,
                location_name: r.name,
                location_parent_id: r.parent_id,
                location_parent_name: r.parent_name,
                location_display: r.display_name || r.name,
                record_count: r.record_count || 0,
            }));
    }

    async function loadLocations() {
        if (isLoadingLocations) return;
        if (isPosting) { console.warn('Skipping load — a post is in progress.'); return; }

        isLoadingLocations = true;
        const list = document.getElementById('post-discogs-locations');
        if (list) list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">Loading locations...</div>';

        try {
            showLoadProgressBar('⚙️ Loading configuration...', 0, 0, '');
            await fetchDiscogsConfig();

            showLoadProgressBar('📥 Loading location counts...', 0, 0, '');
            locationCounts = await fetchLocationCounts();
            recordsByLocation.clear();

            if (locationCounts.length === 0) {
                if (list) list.innerHTML = `<div style="text-align:center;padding:20px;color:#999;">No locations found</div>`;
                showLoadProgressBar('✅ Loaded (empty)', 0, 0, '');
                return;
            }

            renderPostRecords();
            updatePriceInfo();

            const totalEligible = locationCounts.reduce((s, l) => s + (l.record_count || 0), 0);
            showPostStatus(
                `✅ Loaded ${locationCounts.length} locations (${totalEligible} eligible records). Expand a location to load its records.`,
                'info'
            );

            hasLoadedOnce = true;
            updatePostButtons();
        } catch (err) {
            console.error('❌ Error loading location counts:', err);
            showLoadError(err.message || 'Failed to load locations');
            if (list) list.innerHTML = `<div style="text-align:center;padding:20px;color:#dc3545;">Error: ${err.message}</div>`;
        } finally {
            isLoadingLocations = false;
        }
    }

    // ---------- Post: lazy-load records ----------
    async function ensureRecordsForLocation(locationId) {
        if (recordsByLocation.has(locationId)) return recordsByLocation.get(locationId);

        const url = `${API_BASE}/records?status_ids=2&visible_only=true&hide_consigned=true&location_ids=${locationId}`;
        const response = await fetch(url, {
            credentials: 'include',
            mode: 'cors',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch records for location ${locationId} (HTTP ${response.status})`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || `API error for location ${locationId}`);

        const records = calculateDiscogsPricesForRecords(data.records || []);
        recordsByLocation.set(locationId, records);
        return records;
    }

    // ---------- Post: tree helpers ----------
    function extractBinNumber(locationName) {
        const match = locationName.match(/Bin\s*(\d+)/i);
        return match ? parseInt(match[1], 10) : null;
    }

    function extractBinSection(locationName) {
        const match = locationName.match(/Bin\s*\d+\s*([A-Z]{2})/i);
        return match ? match[1].toUpperCase() : null;
    }

    function isBinLocation(locationName) {
        return /Bin\s*\d+/i.test(locationName);
    }

    function sortBinSections(sections) {
        const order = ['LT', 'RT', 'LB', 'RB'];
        return sections.sort((a, b) => {
            const ia = order.indexOf(a.section);
            const ib = order.indexOf(b.section);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
    }

    function buildTreeFromCounts() {
        const binSections = {};
        const standalone  = [];

        // Track which locations are parents of other locations. Any row
        // whose id shows up as a parent_id is a container, not a leaf,
        // and must not be rendered as a standalone leaf.
        const parentIds = new Set();
        for (const row of locationCounts) {
            if (row.location_parent_id !== null && row.location_parent_id !== undefined) {
                parentIds.add(row.location_parent_id);
            }
        }

        for (const row of locationCounts) {
            // Skip rows that are themselves parents of other locations.
            if (parentIds.has(row.location_id)) continue;

            const parentName = row.location_parent_name;
            const leafName   = row.location_name;

            if (parentName && isBinLocation(parentName)) {
                const baseName = parentName;
                if (!binSections[baseName]) {
                    binSections[baseName] = { base_name: baseName, locations: [] };
                }
                binSections[baseName].locations.push({
                    location_id:      row.location_id,
                    location_name:    leafName,
                    location_display: row.location_display,
                    record_count:     row.record_count || 0,
                    section:          extractBinSection(`${baseName}/${leafName}`) || leafName.toUpperCase(),
                });
            } else {
                standalone.push({
                    is_bin_section:   false,
                    location_id:      row.location_id,
                    location_name:    row.location_name,
                    location_display: row.location_display,
                    record_count:     row.record_count || 0,
                });
            }
        }

        for (const key in binSections) sortBinSections(binSections[key].locations);

        const sortedBinKeys = Object.keys(binSections).sort((a, b) => {
            const na = extractBinNumber(a);
            const nb = extractBinNumber(b);
            if (na !== null && nb !== null) return na - nb;
            if (na !== null) return -1;
            if (nb !== null) return 1;
            return a.localeCompare(b);
        });

        standalone.sort((a, b) => a.location_display.localeCompare(b.location_display));

        const result = [];
        for (const key of sortedBinKeys) {
            const bin = binSections[key];
            const total = bin.locations.reduce((s, l) => s + (l.record_count || 0), 0);
            result.push({ is_bin_section: true, base_name: key, total_count: total, locations: bin.locations });
        }
        for (const s of standalone) result.push(s);
        return result;
    }

    function findBinNode(baseName) {
        const tree = buildTreeFromCounts();
        return tree.find(n => n.is_bin_section && n.base_name === baseName);
    }

    function findLocationNode(locationId) {
        const tree = buildTreeFromCounts();
        for (const node of tree) {
            if (node.is_bin_section) {
                const loc = node.locations.find(l => l.location_id === locationId);
                if (loc) return { parent: node, loc };
            } else if (node.location_id === locationId) {
                return { parent: null, loc: node };
            }
        }
        return null;
    }

    function getLocationCount(locationId) {
        const found = findLocationNode(locationId);
        return found ? (found.loc.record_count || 0) : 0;
    }

    // ---------- Post: render ----------
    function renderPostRecords() {
        const list = document.getElementById('post-discogs-locations');
        if (!list) return;

        if (locationCounts.length === 0) {
            list.innerHTML = `<div style="text-align:center;padding:20px;color:#999;">No locations loaded</div>`;
            return;
        }

        const tree = buildTreeFromCounts();
        const totalEligible = locationCounts.reduce((s, l) => s + (l.record_count || 0), 0);

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 8px; background: #f8f9fa; border-radius: 4px;">
                <span style="font-size: 13px; color: #666;">
                    ${totalEligible} eligible records across ${locationCounts.length} locations
                </span>
                <span style="font-size: 12px; color: #888;">
                    ${recordsByLocation.size} location(s) expanded
                </span>
            </div>
        `;

        for (const node of tree) {
            if (node.is_bin_section) html += renderBinNode(node);
            else html += renderStandaloneNode(node);
        }

        list.innerHTML = html;
        updatePostSelectionInfo();
        updatePostButtons();
    }

    function renderBinNode(node) {
        const baseName = node.base_name;
        const locations = node.locations;
        const totalRecords = node.total_count;
        const isSectionExpanded = expandedSections.has(baseName);

        const allSelected = locations.length > 0 && locations.every(l => selectedLocations.has(l.location_id));
        const anySelected = locations.some(l => selectedLocations.has(l.location_id));
        const totalSelected = locations.filter(l => selectedLocations.has(l.location_id))
                                      .reduce((s, l) => s + (l.record_count || 0), 0);

        let html = `
            <div style="border: 2px solid #6c757d; border-radius: 8px; margin-bottom: 10px; background: ${anySelected ? '#f0f8ff' : 'white'};">
                <div style="display: flex; align-items: center; padding: 10px 14px; cursor: pointer; background: ${isSectionExpanded ? '#e9ecef' : 'white'}; border-radius: ${isSectionExpanded ? '8px 8px 0 0' : '8px'};"
                     onclick="toggleBinSection('${baseName}')">
                    <span style="font-size: 16px; margin-right: 10px; color: #333;">
                        ${isSectionExpanded ? '▼' : '▶'}
                    </span>
                    <input type="checkbox" style="margin-right: 12px; cursor: pointer; width: 18px; height: 18px;"
                           ${allSelected ? 'checked' : ''}
                           onclick="event.stopPropagation(); toggleAllLocationsInBin('${baseName}')">
                    <span style="flex: 1; font-weight: 700; color: #333; font-size: 16px;">
                        📦 ${baseName}
                    </span>
                    <span style="display: flex; gap: 8px; align-items: center; font-size: 12px; margin-right: 8px;">
                        <span style="background: #e9ecef; padding: 2px 12px; border-radius: 12px; color: #495057; font-weight: 600;">
                            ${totalRecords} records
                        </span>
                        ${anySelected ? `<span style="color: #667eea; font-weight: 600;">${totalSelected} selected</span>` : ''}
                        ${totalRecords > 0 ? `
                            <button onclick="event.stopPropagation(); postBinSection('${baseName}')"
                                    style="padding: 4px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 14px; cursor: pointer; font-size: 12px; font-weight: 600;">
                                📤 Post This Bin
                            </button>
                        ` : ''}
                    </span>
                </div>
        `;

        if (isSectionExpanded) {
            for (const loc of locations) html += renderLocationRow(loc, true);
        }
        html += `</div>`;
        return html;
    }

    function renderStandaloneNode(node) {
        return renderLocationRow(node, false);
    }

    function renderLocationRow(loc, indent) {
        const locationId   = loc.location_id;
        const locationName = loc.location_display;
        const count        = loc.record_count || 0;

        const isExpanded    = expandedLocations.has(locationId);
        const isSelected    = selectedLocations.has(locationId);
        const records       = recordsByLocation.get(locationId);
        const recordsLoaded = !!records;
        const pricedCount   = recordsLoaded
            ? records.filter(r => r._discogsPrice && r._discogsPrice > 0).length
            : null;

        const padLeft      = indent ? 'padding-left: 20px;' : '';
        const borderStyle  = indent ? 'border-top: 1px solid #dee2e6;' : 'border: 1px solid #e9ecef; border-radius: 6px;';
        const marginBottom = indent ? '' : 'margin-bottom: 6px;';
        const bgColor      = isSelected ? '#f0f8ff' : 'white';
        const headerBg     = isExpanded ? '#f8f9fa' : 'white';

        let html = `
            <div style="${borderStyle} ${marginBottom} background: ${bgColor}; ${padLeft}">
                <div style="display: flex; align-items: center; padding: ${indent ? '6px 12px' : '8px 12px'}; cursor: pointer; background: ${headerBg};"
                     onclick="toggleLocation(${locationId})">
                    <span style="font-size: ${indent ? '13px' : '14px'}; margin-right: 8px; color: ${count > 0 ? '#333' : '#999'};">
                        ${isExpanded ? '▼' : '▶'}
                    </span>
                    <input type="checkbox" style="margin-right: 10px; cursor: pointer;"
                           ${isSelected ? 'checked' : ''}
                           onclick="event.stopPropagation(); toggleLocationSelection(${locationId})">
                    <span style="flex: 1; font-weight: ${indent ? '500' : '600'}; color: #333; font-size: ${indent ? '13px' : '14px'};">
                        ${locationName}
                    </span>
                    <span style="display: flex; gap: 6px; align-items: center; font-size: ${indent ? '11px' : '12px'}; margin-right: 8px;">
                        <span style="background: #e9ecef; padding: 1px 10px; border-radius: 10px; color: #495057;">
                            ${count} records
                        </span>
                        ${pricedCount !== null ? `<span style="color: #667eea; font-weight: 600;">${pricedCount} priced</span>` : ''}
                        ${count > 0 ? `
                            <button onclick="event.stopPropagation(); postLocation(${locationId})"
                                    style="padding: ${indent ? '2px 12px' : '3px 14px'}; background: ${indent ? '#28a745' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}; color: white; border: none; border-radius: ${indent ? '10px' : '14px'}; cursor: pointer; font-size: ${indent ? '10px' : '11px'}; font-weight: 600;">
                                📤 Post
                            </button>
                        ` : ''}
                    </span>
                </div>
        `;

        if (isExpanded) {
            if (!recordsLoaded) {
                html += `<div style="padding: 12px 20px; font-size: 12px; color: #666; border-top: 1px solid #f0f0f0;">⏳ Loading records...</div>`;
            } else if (records.length === 0) {
                html += `<div style="padding: 12px 20px; font-size: 12px; color: #999; border-top: 1px solid #f0f0f0;">No eligible records in this location.</div>`;
            } else {
                html += renderRecordsTable(records, indent ? 'small' : 'normal');
            }
        }

        html += `</div>`;
        return html;
    }

    function renderRecordsTable(locationRecords, size) {
        const s = size === 'small'
            ? { pad: '3px 6px', fs: '11px', idFs: '10px', ageFs: '9px', headerPad: '3px 6px', headerFs: '11px' }
            : { pad: '4px 8px', fs: '12px', idFs: '11px', ageFs: '10px', headerPad: '4px 8px', headerFs: '11px' };

        let html = `
            <div style="padding: ${size === 'small' ? '6px 12px 10px 40px' : '10px 12px 12px 36px'}; border-top: 1px solid #f0f0f0; overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: ${s.fs};">
                    <thead>
                        <tr style="background: #f1f3f5; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: ${s.headerPad}; text-align: left; color: #495057; font-weight: 600; font-size: ${s.headerFs};">ID</th>
                            <th style="padding: ${s.headerPad}; text-align: left; color: #495057; font-weight: 600; font-size: ${s.headerFs};">Artist</th>
                            <th style="padding: ${s.headerPad}; text-align: left; color: #495057; font-weight: 600; font-size: ${s.headerFs};">Title</th>
                            <th style="padding: ${s.headerPad}; text-align: right; color: #495057; font-weight: 600; font-size: ${s.headerFs};">Store</th>
                            <th style="padding: ${s.headerPad}; text-align: right; color: #28a745; font-weight: 600; font-size: ${s.headerFs};">Discogs</th>
                            <th style="padding: ${s.headerPad}; text-align: center; color: #495057; font-weight: 600; font-size: ${s.headerFs};">Markup</th>
                            <th style="padding: ${s.headerPad}; text-align: center; color: #495057; font-weight: 600; font-size: ${s.headerFs};">Age</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        const sortedRecords = [...locationRecords].sort((a, b) => {
            if (a.location_index && b.location_index) return a.location_index - b.location_index;
            return (a.artist || '').localeCompare(b.artist || '');
        });

        for (const r of sortedRecords) {
            const hasPrice = r._discogsPrice && r._discogsPrice > 0;
            const discogsPrice = hasPrice ? r._discogsPrice : '—';
            const markup = r._markupPercent || 0;
            const isMarkdown = markup < 0;
            const markupColor = isMarkdown ? '#dc3545' : (markup > 0 ? '#28a745' : '#ffc107');
            const markupText = hasPrice ? (markup > 0 ? `+${markup}%` : markup < 0 ? `${markup}%` : '0%') : '—';
            const rowStyle = hasPrice ? (isMarkdown ? 'background: #fff5f5;' : '') : 'opacity: 0.4;';
            const ageText = hasPrice ? `${r._daysOld}d` : '—';

            html += `
                <tr style="${rowStyle} border-bottom: 1px solid #f0f0f0;">
                    <td style="padding: ${s.pad}; color: #666; font-size: ${s.idFs};">${r.id}</td>
                    <td style="padding: ${s.pad}; color: #333;">${r.artist || 'Unknown'}</td>
                    <td style="padding: ${s.pad}; color: #333;">${r.title || 'Unknown'}</td>
                    <td style="padding: ${s.pad}; text-align: right; color: #666;">${r.store_price ? '$' + r.store_price.toFixed(2) : '—'}</td>
                    <td style="padding: ${s.pad}; text-align: right; color: ${hasPrice ? (isMarkdown ? '#dc3545' : '#28a745') : '#999'}; font-weight: 600;">
                        ${hasPrice ? '$' + discogsPrice.toFixed(2) : '—'}
                    </td>
                    <td style="padding: ${s.pad}; text-align: center; color: ${hasPrice ? markupColor : '#999'}; font-weight: 600;">
                        ${markupText}
                    </td>
                    <td style="padding: ${s.pad}; text-align: center; color: #999; font-size: ${s.ageFs};">${ageText}</td>
                </tr>
            `;
        }

        html += `</tbody></table></div>`;
        return html;
    }

    // ---------- Post: toggles ----------
    window.toggleBinSection = function(baseName) {
        if (expandedSections.has(baseName)) expandedSections.delete(baseName);
        else expandedSections.add(baseName);
        renderPostRecords();
    };

    window.toggleAllLocationsInBin = function(baseName) {
        const bin = findBinNode(baseName);
        if (!bin) return;
        const ids = bin.locations.map(l => l.location_id);
        const allSelected = ids.every(id => selectedLocations.has(id));
        if (allSelected) { for (const id of ids) selectedLocations.delete(id); }
        else { for (const id of ids) selectedLocations.add(id); }
        renderPostRecords();
    };

    window.toggleLocation = async function(locationId) {
        if (expandedLocations.has(locationId)) {
            expandedLocations.delete(locationId);
            renderPostRecords();
            return;
        }
        expandedLocations.add(locationId);
        renderPostRecords();

        if (!recordsByLocation.has(locationId)) {
            try {
                await ensureRecordsForLocation(locationId);
            } catch (err) {
                console.error(`Failed to load records for location ${locationId}:`, err);
                showPostStatus(`❌ Could not load records for location ${locationId}: ${err.message}`, 'error');
            }
            renderPostRecords();
        }
    };

    window.toggleLocationSelection = function(locationId) {
        if (selectedLocations.has(locationId)) selectedLocations.delete(locationId);
        else selectedLocations.add(locationId);
        renderPostRecords();
    };

    window.toggleAllLocations = function() {
        const selectAll = document.getElementById('select-all-locations');
        const isChecked = selectAll.checked;
        if (isChecked) {
            const tree = buildTreeFromCounts();
            for (const node of tree) {
                if (node.is_bin_section) {
                    for (const loc of node.locations) selectedLocations.add(loc.location_id);
                } else {
                    selectedLocations.add(node.location_id);
                }
            }
        } else {
            selectedLocations.clear();
        }
        renderPostRecords();
    };

    function updatePostSelectionInfo() {
        const info = document.getElementById('selection-info');
        if (!info) return;
        let totalRecords = 0;
        for (const id of selectedLocations) totalRecords += getLocationCount(id);
        info.textContent = `${selectedLocations.size} locations selected, ${totalRecords} records`;
    }

    function updatePostButtons() {
        const postSelectedBtn = document.getElementById('post-selected-btn');
        const cancelBtn       = document.getElementById('cancel-post-btn');

        let selectedRecords = 0;
        for (const id of selectedLocations) selectedRecords += getLocationCount(id);

        if (postSelectedBtn) {
            postSelectedBtn.disabled = selectedLocations.size === 0 || selectedRecords === 0 || isPosting;
            postSelectedBtn.textContent = selectedRecords > 0
                ? `📤 Post Selected (${selectedRecords} records)`
                : '📤 Post Selected';
            postSelectedBtn.style.display = isPosting ? 'none' : 'inline-block';
        }
        if (cancelBtn) {
            cancelBtn.style.display = isPosting ? 'inline-block' : 'none';
            cancelBtn.disabled = !isPosting;
        }
    }

    // ---------- Post: posting ----------
    window.postBinSection = async function(baseName) {
        if (isPosting) return;
        const bin = findBinNode(baseName);
        if (!bin) { showPostStatus(`⚠️ Bin ${baseName} not found`, 'warning'); return; }
        const ids = bin.locations.map(l => l.location_id);
        await collectAndPost(ids, `Bin ${baseName}`);
    };

    window.postLocation = async function(locationId) {
        if (isPosting) return;
        const found = findLocationNode(locationId);
        if (!found) { showPostStatus(`⚠️ Location ${locationId} not found`, 'warning'); return; }
        const label = found.loc.location_display || found.loc.location_name;
        await collectAndPost([locationId], label);
    };

    window.postSelectedLocations = async function() {
        if (isPosting) return;
        if (selectedLocations.size === 0) { showPostStatus('⚠️ No locations selected', 'warning'); return; }
        const ids = Array.from(selectedLocations);
        await collectAndPost(ids, `${ids.length} selected locations`);
    };

    async function collectAndPost(locationIds, scopeLabel) {
        const statusDiv = document.getElementById('post-discogs-status');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.className = 'status-message status-info';
            statusDiv.innerHTML = `⏳ Loading records for ${locationIds.length} location(s)...`;
        }

        let recordsToPost = [];
        let locationNames = [];

        try {
            for (const id of locationIds) {
                const recs = await ensureRecordsForLocation(id);
                const eligible = recs.filter(r => r._discogsPrice && r._discogsPrice > 0);
                recordsToPost.push(...eligible);
                const found = findLocationNode(id);
                if (found) locationNames.push(found.loc.location_display || found.loc.location_name);
            }
        } catch (err) {
            console.error('Failed loading records for post:', err);
            showPostStatus(`❌ ${err.message}`, 'error');
            return;
        }

        renderPostRecords();

        if (recordsToPost.length === 0) {
            showPostStatus(`⚠️ No records with Discogs prices in ${scopeLabel}`, 'warning');
            return;
        }

        await confirmAndPost(recordsToPost, locationNames, scopeLabel);
    }

    async function confirmAndPost(recordsToPost, locationNames, scopeLabel) {
        const withMarkdown = recordsToPost.filter(r => r._markupPercent && r._markupPercent < 0);
        const estMinutes = ((recordsToPost.length * DISCOGS_POST_DELAY_MS) / 60000).toFixed(1);
        let confirmMsg = `Post ${recordsToPost.length} record(s) from ${scopeLabel} to Discogs?\n\n`;
        confirmMsg += `Locations: ${locationNames.join(', ')}\n`;
        confirmMsg += `Markup: +${discogsMarkupPercent}% -${discogsPriceStep}%/wk (floor -${discogsMaxMarkdown}%)\n`;
        confirmMsg += `${withMarkdown.length} records will be on markdown\n`;
        confirmMsg += `Estimated time: ~${estMinutes} minutes (${DISCOGS_POST_DELAY_MS / 1000}s between each)`;
        if (!confirm(confirmMsg)) return;
        await postRecords(recordsToPost);
    }

    window.cancelPosting = function() {
        if (isPosting) {
            cancelPosting = true;
            showPostStatus('⏹️ Cancelling... Please wait for current record to finish', 'warning');
            const btn = document.getElementById('cancel-post-btn');
            if (btn) btn.disabled = true;
        }
    };

    async function postRecords(recordsToPost) {
        if (isPosting) return;
        isPosting = true;
        cancelPosting = false;

        const statusDiv = document.getElementById('post-discogs-status');
        const postSelectedBtn = document.getElementById('post-selected-btn');
        const cancelBtn = document.getElementById('cancel-post-btn');

        if (postSelectedBtn) postSelectedBtn.disabled = true;
        if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.style.display = 'inline-block'; }
        updatePostButtons();

        let success = 0;
        let failed = 0;
        let errorMessages = [];

        for (let i = 0; i < recordsToPost.length; i++) {
            if (cancelPosting) {
                showPostStatus(`⏹️ Cancelled. ${success} posted, ${failed} failed (${recordsToPost.length - i} records skipped)`, 'warning');
                break;
            }

            const record = recordsToPost[i];
            const current = i + 1;
            const total = recordsToPost.length;
            const isMarkdown = record._markupPercent && record._markupPercent < 0;
            const priceColor = isMarkdown ? '#dc3545' : '#28a745';

            if (statusDiv) {
                const remaining = total - i;
                const etaSeconds = Math.max(0, (remaining - 1) * (DISCOGS_POST_DELAY_MS / 1000));
                const etaText = etaSeconds > 60 ? `~${Math.ceil(etaSeconds / 60)} min left` : `~${Math.ceil(etaSeconds)}s left`;

                statusDiv.style.display = 'block';
                statusDiv.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 6px; padding: 4px 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
                            <span>
                                ⏳ ${current}/${total}: 
                                <strong>${record.artist || 'Unknown'} - ${record.title || 'Unknown'}</strong>
                                <span style="color: ${priceColor}; font-weight: 600;">$${record._discogsPrice.toFixed(2)}</span>
                                ${isMarkdown ? '🔻' : '📈'}
                            </span>
                            <span style="font-size: 12px; color: #666;">
                                ${Math.round((current / total) * 100)}%
                            </span>
                        </div>
                        <div style="width: 100%; height: 6px; background: #e9ecef; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${(current / total) * 100}%; height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); transition: width 0.3s ease;"></div>
                        </div>
                        <div style="font-size: 11px; color: #888; display: flex; gap: 15px;">
                            <span>✅ ${success} posted</span>
                            <span>❌ ${failed} failed</span>
                            <span>⏱️ ${etaText}</span>
                            <span>🕒 ${DISCOGS_POST_DELAY_MS / 1000}s between posts</span>
                            ${cancelPosting ? '<span style="color: #dc3545;">⏹️ Cancelling...</span>' : ''}
                        </div>
                        ${errorMessages.length > 0 ? `
                            <div style="font-size: 11px; color: #dc3545; background: #fff5f5; padding: 4px 8px; border-radius: 4px; max-height: 80px; overflow-y: auto;">
                                ${errorMessages.slice(-3).join('<br>')}
                            </div>
                        ` : ''}
                    </div>
                `;
                statusDiv.className = 'status-message status-info';
            }

            try {
                const discogsPrice = record._discogsPrice;
                if (discogsPrice === null || discogsPrice === undefined) throw new Error('No computed Discogs price');

                const locationDisplay = buildLocationDisplay(record);

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
                        location: locationDisplay,
                        discogs_release_id: record.discogs_release_id || null,
                        format_id: record.format_id || null
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
                    const errorMsg = data.error || data.message || 'Unknown error';
                    errorMessages.push(`Record #${record.id}: ${errorMsg}`);
                    console.error(`Failed to post record ${record.id}:`, data);
                }
            } catch (err) {
                failed++;
                const errorMsg = err.message || 'Network error';
                errorMessages.push(`Record #${record.id}: ${errorMsg}`);
                console.error('Error posting record:', err);
            }

            if (i < recordsToPost.length - 1 && !cancelPosting) {
                await sleep(DISCOGS_POST_DELAY_MS);
            }
        }

        if (statusDiv) {
            let message = `✅ ${success} posted`;
            if (failed > 0) {
                message += `, ❌ ${failed} failed`;
                if (errorMessages.length > 0) {
                    message += `<br><br><div style="font-size: 12px; color: #dc3545; background: #fff5f5; padding: 8px 12px; border-radius: 4px; max-height: 150px; overflow-y: auto; text-align: left;">
                        <strong>Error details:</strong><br>${errorMessages.join('<br>')}
                    </div>`;
                }
            }
            if (cancelPosting) message = `⏹️ Cancelled. ${success} posted, ${failed} failed`;
            statusDiv.innerHTML = message;
            statusDiv.className = failed > 0 || cancelPosting ? 'status-message status-warning' : 'status-message status-success';
            if (failed === 0 && !cancelPosting) {
                setTimeout(() => { statusDiv.style.display = 'none'; }, 8000);
            }
        }

        isPosting = false;
        if (postSelectedBtn) postSelectedBtn.disabled = false;
        if (cancelBtn) { cancelBtn.disabled = true; cancelBtn.style.display = 'none'; }
        updatePostButtons();

        if (hasLoadedOnce) loadLocations();
    }

    // ================================================================
    // ================  DISCOGS ORDERS  ==============================
    // ================================================================

    let orders = [];
    let orderItems = [];
    let selectedOrderId = null;
    let viewingAllOrders = true;
    let selectedLabelPosition = 'LT';
    let labelPdfFile = null;

    // ---------- Orders: bulk mark sold ----------
    window.discogsBulkMarkPaidOrdersSold = async function() {
        console.log('🎯 discogsBulkMarkPaidOrdersSold called');
        if (!confirm(
            'Mark every record in "Payment Received" Discogs orders as sold?\n\n' +
            'This will set each record to Sold on Discogs and update its store_price ' +
            'to the Discogs sale price.'
        )) return;

        const tableDiv = document.getElementById('discogs-orders-table');
        const statusDiv = document.getElementById('discogs-orders-status-msg');
        const originalHtml = tableDiv ? tableDiv.innerHTML : '';

        const startTime = Date.now();
        let dots = 0;

        if (!document.getElementById('discogsSpinStyle')) {
            const style = document.createElement('style');
            style.id = 'discogsSpinStyle';
            style.textContent = '@keyframes discogsSpin { to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }

        if (tableDiv) {
            tableDiv.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 20px;gap:14px;">
                    <div style="width:56px;height:56px;border:5px solid #e9ecef;border-top-color:#28a745;border-radius:50%;animation:discogsSpin 0.9s linear infinite;"></div>
                    <div style="font-size:16px;font-weight:600;color:#333;">Scanning Payment Received orders…</div>
                    <div style="font-size:13px;color:#666;">Fetching orders from Discogs and matching PIGSTYLE IDs</div>
                    <div id="bulk-elapsed" style="font-size:12px;color:#999;">Elapsed: 0s</div>
                    <div style="font-size:11px;color:#aaa;max-width:420px;text-align:center;line-height:1.5;">
                        Please don't close this tab.
                    </div>
                </div>
            `;
        }

        const progressInterval = setInterval(() => {
            const el = document.getElementById('bulk-elapsed');
            if (el) {
                const secs = Math.floor((Date.now() - startTime) / 1000);
                dots = (dots + 1) % 4;
                el.textContent = `Elapsed: ${secs}s ${'.'.repeat(dots)}`;
            }
        }, 1000);

        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.className = 'status-message status-info';
            statusDiv.textContent = '⏳ Working… please wait';
        }

        try {
            const response = await fetch(`${API_BASE}/api/discogs/bulk-mark-paid-orders-sold`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });

            const data = await response.json();
            clearInterval(progressInterval);

            if (data.status === 'success') {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const details = data.details || [];
                const interesting = details.filter(d =>
                    d.result === 'marked_sold' || d.result === 'not_found'
                );

                let html = `
                    <div style="padding:24px;max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:14px;">
                        <div style="font-size:22px;font-weight:700;color:#28a745;text-align:center;">
                            ✅ Bulk Action Complete
                        </div>
                        <div style="font-size:13px;color:#888;text-align:center;">
                            Finished in ${elapsed}s · Scanned ${data.orders_scanned || 0} order(s)
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:6px;">
                            <div style="background:#e7f5ea;padding:12px 16px;border-radius:8px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#28a745;font-weight:700;">Marked Sold</div>
                                <div style="font-size:24px;font-weight:700;color:#28a745;">${data.marked}</div>
                            </div>
                            <div style="background:#fff4e5;padding:12px 16px;border-radius:8px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#e67e22;font-weight:700;">Already Sold</div>
                                <div style="font-size:24px;font-weight:700;color:#e67e22;">${data.skipped}</div>
                            </div>
                            <div style="background:#fdecea;padding:12px 16px;border-radius:8px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#c0392b;font-weight:700;">Not In DB</div>
                                <div style="font-size:24px;font-weight:700;color:#c0392b;">${data.not_found}</div>
                            </div>
                            <div style="background:#eef1f5;padding:12px 16px;border-radius:8px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#5a6673;font-weight:700;">No PIGSTYLE ID</div>
                                <div style="font-size:24px;font-weight:700;color:#5a6673;">${data.no_pigstyle}</div>
                            </div>
                        </div>
                `;

                if (interesting.length > 0) {
                    html += `
                        <details style="margin-top:8px;">
                            <summary style="cursor:pointer;font-size:13px;color:#555;font-weight:600;padding:8px 0;">
                                Show details (${interesting.length})
                            </summary>
                            <div style="max-height:300px;overflow-y:auto;border:1px solid #eee;border-radius:6px;margin-top:6px;">
                                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                                    <thead>
                                        <tr style="background:#f8f9fa;position:sticky;top:0;">
                                            <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;">PigStyle ID</th>
                                            <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;">Order</th>
                                            <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;">Result</th>
                                            <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;">Info</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${interesting.map(d => {
                                            const color = d.result === 'marked_sold' ? '#28a745' : '#c0392b';
                                            const label = d.result === 'marked_sold' ? '✅ Sold' : '❌ Not found';
                                            const info = d.result === 'marked_sold'
                                                ? `${d.artist || ''} - ${d.title || ''} ($${(d.sale_price || 0).toFixed(2)})`
                                                : 'PIGSTYLE ID missing from records table';
                                            return `<tr>
                                                <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;font-family:monospace;">${d.pigstyle_id}</td>
                                                <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#666;">${d.order_id || '—'}</td>
                                                <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:${color};font-weight:600;">${label}</td>
                                                <td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#555;">${info}</td>
                                            </tr>`;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    `;
                }

                html += `
                        <div style="display:flex;gap:10px;justify-content:center;margin-top:10px;">
                            <button onclick="discogsOrdersApplyFilters()" 
                                    style="padding:10px 24px;background:#007bff;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                                🔄 Reload Orders
                            </button>
                        </div>
                    </div>
                `;

                if (tableDiv) tableDiv.innerHTML = html;

                if (statusDiv) {
                    statusDiv.style.display = 'block';
                    statusDiv.className = 'status-message status-success';
                    statusDiv.textContent = `✅ Marked ${data.marked} sold · ${data.skipped} already sold · ${data.not_found} not in DB · ${data.no_pigstyle} without PIGSTYLE ID`;
                }
            } else {
                if (tableDiv) tableDiv.innerHTML = originalHtml;
                const msg = data.error || data.message || 'Bulk action failed';
                if (statusDiv) {
                    statusDiv.style.display = 'block';
                    statusDiv.className = 'status-message status-error';
                    statusDiv.textContent = `❌ ${msg}`;
                }
            }
        } catch (err) {
            clearInterval(progressInterval);
            if (tableDiv) tableDiv.innerHTML = originalHtml;
            const statusDiv2 = document.getElementById('discogs-orders-status-msg');
            if (statusDiv2) {
                statusDiv2.style.display = 'block';
                statusDiv2.className = 'status-message status-error';
                statusDiv2.textContent = `❌ Error: ${err.message}`;
            }
            console.error('Bulk mark sold error:', err);
        }
    };

    // ---------- Orders: load ----------
    async function loadOrders() {
        const status = document.getElementById('discogs-orders-status');
        const dateFrom = document.getElementById('discogs-orders-date-from');
        const dateTo = document.getElementById('discogs-orders-date-to');
        const search = document.getElementById('discogs-orders-search');

        const tableDiv = document.getElementById('discogs-orders-table');
        if (!tableDiv) return;

        tableDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading orders...</div>';

        try {
            let url = `${API_BASE}/api/discogs/orders?per_page=200`;
            if (status && status.value) url += `&status=${encodeURIComponent(status.value)}`;
            if (dateFrom && dateFrom.value) url += `&date_from=${encodeURIComponent(dateFrom.value)}`;
            if (dateTo && dateTo.value) url += `&date_to=${encodeURIComponent(dateTo.value)}`;
            if (search && search.value) url += `&search=${encodeURIComponent(search.value)}`;
            url += '&all=true';

            console.log('🔍 Fetching orders from:', url);

            const response = await fetch(url, { credentials: 'include', headers: getHeaders() });
            const data = await response.json();

            if (data.status === 'success') {
                orders = data.orders || [];
                orders.sort((a, b) => {
                    const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
                    const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
                    return dateB - dateA;
                });
                viewingAllOrders = true;
                renderOrdersTable();
                showOrdersStatus(`✅ Loaded ${orders.length} orders (latest first)`, 'success');
            } else {
                const errorMsg = data.error || data.message || 'Failed to load orders';
                console.error('❌ API Error:', errorMsg);
                tableDiv.innerHTML = `
                    <div style="text-align: center; padding: 30px 20px; color: #dc3545;">
                        <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
                        <div style="font-weight: 600; margin-bottom: 8px;">Error Loading Orders</div>
                        <div style="color: #666; font-size: 14px;">${errorMsg}</div>
                        <div style="margin-top: 15px; font-size: 12px; color: #999;">
                            Check that DISCOGS_USER_TOKEN is properly configured in the server environment.
                        </div>
                        <button onclick="discogsOrdersApplyFilters()" style="margin-top: 15px; padding: 8px 24px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            <i class="fas fa-sync"></i> Retry
                        </button>
                    </div>
                `;
                showOrdersStatus(`❌ ${errorMsg}`, 'error');
            }
        } catch (err) {
            console.error('❌ Fetch error:', err);
            tableDiv.innerHTML = `
                <div style="text-align: center; padding: 30px 20px; color: #dc3545;">
                    <div style="font-size: 48px; margin-bottom: 10px;">🔌</div>
                    <div style="font-weight: 600; margin-bottom: 8px;">Connection Error</div>
                    <div style="color: #666; font-size: 14px;">${err.message}</div>
                    <div style="margin-top: 15px; font-size: 12px; color: #999;">
                        Could not connect to the server. Please check your internet connection.
                    </div>
                    <button onclick="discogsOrdersApplyFilters()" style="margin-top: 15px; padding: 8px 24px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-sync"></i> Retry
                    </button>
                </div>
            `;
            showOrdersStatus(`❌ Error: ${err.message}`, 'error');
        }
    }

    // ---------- Orders: render table ----------
    function renderOrdersTable() {
        const tableDiv = document.getElementById('discogs-orders-table');
        const container = document.getElementById('discogs-orders-container');
        if (!tableDiv || !container) return;

        let displayOrders = orders;
        if (!viewingAllOrders && selectedOrderId) {
            displayOrders = orders.filter(o => (o.order_id || o.id) === selectedOrderId);
        }

        if (!viewingAllOrders && selectedOrderId) {
            container.style.flex = '0.5';
            container.style.maxHeight = '200px';
        } else {
            container.style.flex = '2';
            container.style.maxHeight = 'none';
        }

        if (displayOrders.length === 0) {
            tableDiv.innerHTML = viewingAllOrders
                ? '<div style="text-align: center; padding: 20px; color: #999;">No orders found</div>'
                : '<div style="text-align: center; padding: 20px; color: #999;">Order not found</div>';
            return;
        }

        let html = `<div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 10px; background: #f8f9fa; border-bottom: 2px solid #ddd; position: sticky; top: 0; z-index: 5;">
            <span style="font-weight: 600; color: #333;">
                ${viewingAllOrders ? `📋 All Orders (${displayOrders.length})` : `📋 Order #${selectedOrderId}`}
            </span>
            ${!viewingAllOrders ? 
                `<button onclick="discogsShowAllOrders()" style="padding: 4px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    <i class="fas fa-arrow-left"></i> Back to All Orders
                </button>` : ''
            }
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 5px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Order ID</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Buyer</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Date</th>
                    <th style="padding: 8px 10px; text-align: right; color: #333;">Total</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Items</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Action</th>
                </tr>
            </thead>
            <tbody>`;

        displayOrders.forEach((order, index) => {
            const statusColor = order.status === 'Payment Received' ? '#28a745' :
                              order.status === 'Shipped' ? '#007bff' :
                              order.status === 'Delivered' ? '#17a2b8' :
                              order.status === 'Cancelled' ? '#dc3545' :
                              order.status === 'Refunded' ? '#ffc107' : '#6c757d';

            const rowBg = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
            const isSelected = selectedOrderId === (order.order_id || order.id) && !viewingAllOrders;

            let dateDisplay = '—';
            if (order.created_at) {
                const date = new Date(order.created_at);
                const now = new Date();
                const diffMs = now - date;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);

                if (diffMins < 1) dateDisplay = 'Just now';
                else if (diffMins < 60) dateDisplay = `${diffMins}m ago`;
                else if (diffHours < 24) dateDisplay = `${diffHours}h ago`;
                else if (diffDays < 7) dateDisplay = `${diffDays}d ago`;
                else dateDisplay = date.toLocaleDateString();
            }

            html += `<tr style="background: ${rowBg}; ${isSelected ? 'border-left: 3px solid #007bff;' : ''}">
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: ${isSelected ? '600' : 'normal'};">
                    ${order.order_id || order.id}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">
                    ${order.buyer_username || order.buyer_name || 'Unknown'}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">
                    ${dateDisplay}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-weight: 500;">
                    ${order.total_amount ? '$' + order.total_amount.toFixed(2) : '—'}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; color: #555;">
                    ${order.items ? order.items.length : 0}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; background: ${statusColor}20; color: ${statusColor}; font-size: 11px; font-weight: 500;">
                        ${order.status || 'Unknown'}
                    </span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    ${viewingAllOrders ? 
                        `<button onclick="discogsSelectOrder('${order.order_id || order.id}')" style="padding: 4px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            <i class="fas fa-eye"></i> View Items
                        </button>` :
                        `<span style="color: #28a745; font-weight: 500; font-size: 11px;">✓ Viewing</span>`
                    }
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        tableDiv.innerHTML = html;

        if (!viewingAllOrders && selectedOrderId) {
            setTimeout(() => {
                const itemsSection = document.getElementById('discogs-order-items-section');
                if (itemsSection) itemsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }

    // ---------- Orders: select ----------
    window.discogsSelectOrder = function(orderId) {
        selectedOrderId = orderId;
        viewingAllOrders = false;

        const order = orders.find(o => (o.order_id || o.id) === orderId);
        if (order) {
            const summaryEl = document.getElementById('discogs-order-summary');
            if (summaryEl) {
                const buyer = order.buyer_username || order.buyer_name || 'Unknown';
                const total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '—';
                const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '—';
                summaryEl.textContent = `${buyer} | ${order.items ? order.items.length : 0} items | Total: ${total} | ${date}`;
            }

            const itemsSection = document.getElementById('discogs-order-items-section');
            if (itemsSection) itemsSection.style.display = 'block';

            loadOrderItems(orderId);
        }

        renderOrdersTable();
    };

    window.discogsShowAllOrders = function() {
        viewingAllOrders = true;
        selectedOrderId = null;

        const itemsSection = document.getElementById('discogs-order-items-section');
        if (itemsSection) itemsSection.style.display = 'none';

        const itemsDiv = document.getElementById('discogs-order-items');
        if (itemsDiv) {
            itemsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Select an order to view items</div>';
        }

        renderOrdersTable();
        showOrdersStatus('📋 Showing all orders', 'success');
    };

    // ---------- Orders: load items ----------
    async function loadOrderItems(orderId) {
        const list = document.getElementById('discogs-order-items');
        if (!list) return;

        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading items...</div>';

        try {
            const response = await fetch(`${API_BASE}/api/discogs/orders/${orderId}`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();

            if (data.status === 'success' && data.order) {
                const order = data.order;
                const items = order.items || [];

                const enriched = items.map(item => {
                    let pigstyleId = null;
                    if (item.condition_comments || item.private_comments) {
                        const comments = (item.condition_comments || '') + ' ' + (item.private_comments || '');
                        const match = comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                        if (match) pigstyleId = parseInt(match[1]);
                    }
                    return {
                        ...item,
                        pigstyle_id: pigstyleId,
                        record_status_id: item.record_status_id ?? null,
                        artist: item.artist || 'Unknown',
                        title: item.title || 'Unknown',
                        price: item.price || 0
                    };
                });

                orderItems = enriched;
                renderOrderItems(orderItems);

                const summaryEl = document.getElementById('discogs-order-summary');
                if (summaryEl) {
                    const buyer = order.buyer_username || order.buyer_name || 'Unknown';
                    const total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '—';
                    const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '—';
                    summaryEl.textContent = `${buyer} | ${orderItems.length} items | Total: ${total} | ${date}`;
                }

                showOrdersStatus(`✅ ${orderItems.length} items loaded for order #${orderId}`, 'success');
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error loading order items</div>`;
                showOrdersStatus(`❌ Error loading order items`, 'error');
            }
        } catch (err) {
            console.error('Error loading order items:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
            showOrdersStatus(`❌ Error: ${err.message}`, 'error');
        }
    }

    // ---------- Orders: render items ----------
    function renderOrderItems(items) {
        const list = document.getElementById('discogs-order-items');
        if (!list) return;

        if (items.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No items in this order</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333;">#</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Artist</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Title</th>
                    <th style="padding: 8px 10px; text-align: right; color: #333;">Price</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333;">Condition</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">PigStyle ID</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333;">Action</th>
                </tr>
            </thead>
            <tbody>`;

        items.forEach((item, idx) => {
            const statusText = item.record_status_id === 2 ? 'Active' :
                              item.record_status_id === 3 || item.record_status_id === 4 ? 'Sold' :
                              item.record_status_id === 1 ? 'New' : '—';
            const statusColor = item.record_status_id === 2 ? '#28a745' :
                               item.record_status_id === 3 || item.record_status_id === 4 ? '#dc3545' :
                               item.record_status_id === 1 ? '#17a2b8' : '#6c757d';

            const isSold = item.record_status_id === 3 || item.record_status_id === 4;

            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${idx + 1}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${item.artist}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">${item.title}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; color: #333;">$${item.price.toFixed(2)}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${item.media_condition || '—'}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    ${item.pigstyle_id ? 
                        `<span style="color: #28a745; font-weight: 600;">${item.pigstyle_id}</span>` : 
                        '<span style="color: #999;">—</span>'
                    }
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; background: ${statusColor}20; color: ${statusColor}; font-size: 11px; font-weight: 500;">
                        ${statusText}
                    </span>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    ${item.pigstyle_id && !isSold ? 
                        `<button onclick="discogsMarkSold(${item.pigstyle_id}, ${idx})" style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                            <i class="fas fa-check"></i> Mark Sold
                        </button>` :
                        isSold ?
                        `<span style="color: #28a745; font-weight: 500; font-size: 11px;">✓ Sold</span>` :
                        ''
                    }
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // ---------- Orders: mark single sold ----------
    window.discogsMarkSold = async function(recordId, itemIndex) {
        if (!confirm(`Mark record #${recordId} as sold on Discogs?`)) return;

        try {
            const response = await fetch(`${API_BASE}/api/records/${recordId}/mark-discogs-sold`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();

            if (data.status === 'success') {
                showOrdersStatus(`✅ Record #${recordId} marked as sold on Discogs`, 'success');
                if (orderItems[itemIndex]) {
                    orderItems[itemIndex].record_status_id = 4;
                    renderOrderItems(orderItems);
                    renderOrdersTable();
                }
            } else {
                showOrdersStatus(`❌ Error: ${data.error || 'Failed to mark as sold'}`, 'error');
            }
        } catch (err) {
            console.error('Error marking sold:', err);
            showOrdersStatus(`❌ Error: ${err.message}`, 'error');
        }
    };

    // ---------- Orders: shipping label ----------
    window.discogsPrintShippingLabel = function() {
        if (!selectedOrderId) { showOrdersStatus('⚠️ Please select an order first', 'error'); return; }

        const order = orders.find(o => (o.order_id || o.id) === selectedOrderId);
        if (!order) { showOrdersStatus('⚠️ Order not found', 'error'); return; }

        document.getElementById('discogs-label-order-id').textContent = selectedOrderId;
        document.getElementById('discogs-label-buyer').textContent = order.buyer_username || order.buyer_name || 'Unknown';
        document.getElementById('discogs-label-items').textContent = orderItems.length + ' items';

        selectedLabelPosition = 'LT';
        document.querySelectorAll('[id^="discogs-pos-"]').forEach(btn => {
            btn.style.border = '2px solid #ddd';
            btn.style.background = 'white';
        });
        document.getElementById('discogs-pos-LT').style.border = '2px solid #007bff';
        document.getElementById('discogs-pos-LT').style.background = '#e7f3ff';

        document.getElementById('discogs-label-pdf').value = '';
        labelPdfFile = null;

        document.getElementById('discogs-shipping-modal').style.display = 'flex';
    };

    window.discogsCloseShippingModal = function() {
        document.getElementById('discogs-shipping-modal').style.display = 'none';
    };

    window.discogsSelectLabelPosition = function(position) {
        selectedLabelPosition = position;
        document.querySelectorAll('[id^="discogs-pos-"]').forEach(btn => {
            btn.style.border = '2px solid #ddd';
            btn.style.background = 'white';
        });
        document.getElementById(`discogs-pos-${position}`).style.border = '2px solid #007bff';
        document.getElementById(`discogs-pos-${position}`).style.background = '#e7f3ff';
    };

    window.discogsPrintLabel = async function() {
        const fileInput = document.getElementById('discogs-label-pdf');
        if (!fileInput.files || fileInput.files.length === 0) {
            showOrdersStatus('⚠️ Please upload a PDF label file', 'error');
            return;
        }

        try {
            showOrdersStatus('📄 Preparing label for printing...', 'success');

            const file = fileInput.files[0];
            const fileUrl = URL.createObjectURL(file);

            const order = orders.find(o => (o.order_id || o.id) === selectedOrderId);
            const buyer = order ? order.buyer_username || order.buyer_name || 'Unknown' : 'Unknown';

            const positionStyles = {
                'LT': { top: '0', left: '0' },
                'RT': { top: '0', right: '0' },
                'LB': { bottom: '0', left: '0' },
                'RB': { bottom: '0', right: '0' }
            };

            const pos = positionStyles[selectedLabelPosition];

            const printWindow = window.open('', '_blank', 'width=800,height=600');

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Shipping Label - Order #${selectedOrderId}</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { background: white; margin: 0; padding: 0; width: 100%; height: 100%; }
                        .page-container { width: 8.5in; height: 11in; margin: 0 auto; position: relative; background: white; }
                        .label-container {
                            position: absolute; width: 4.25in; height: 5.5in;
                            ${pos.top !== undefined ? `top: ${pos.top};` : ''}
                            ${pos.bottom !== undefined ? `bottom: ${pos.bottom};` : ''}
                            ${pos.left !== undefined ? `left: ${pos.left};` : ''}
                            ${pos.right !== undefined ? `right: ${pos.right};` : ''}
                            border: 1px dashed #ccc;
                            display: flex; align-items: center; justify-content: center;
                            background: white; padding: 10px; overflow: hidden;
                        }
                        .label-container iframe { width: 100%; height: 100%; border: none; background: white; }
                        .label-info {
                            position: absolute; bottom: 10px; left: 10px;
                            font-size: 10px; color: #999; font-family: Arial, sans-serif;
                            background: rgba(255,255,255,0.9); padding: 2px 8px; border-radius: 4px;
                        }
                        .label-position {
                            position: absolute; top: 10px; right: 10px;
                            font-size: 10px; color: #999; font-family: Arial, sans-serif;
                            background: rgba(255,255,255,0.9); padding: 2px 8px; border-radius: 4px;
                        }
                        @media print {
                            body { margin: 0; padding: 0; }
                            .page-container { margin: 0; }
                            .label-container { border: none; }
                            .label-info, .label-position { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="page-container">
                        <div class="label-container">
                            <iframe src="${fileUrl}"></iframe>
                        </div>
                        <div class="label-info">Order #${selectedOrderId} | ${buyer}</div>
                        <div class="label-position">Position: ${selectedLabelPosition}</div>
                    </div>
                    <script>
                        window.onload = function() {
                            setTimeout(function() { window.print(); }, 1000);
                        };
                    <\/script>
                </body>
                </html>
            `);

            printWindow.document.close();

            showOrdersStatus(`✅ Label ready for printing - Order #${selectedOrderId} at position ${selectedLabelPosition}`, 'success');

            setTimeout(() => {
                document.getElementById('discogs-shipping-modal').style.display = 'none';
            }, 2000);
        } catch (err) {
            console.error('Error preparing label:', err);
            showOrdersStatus(`❌ Error preparing label: ${err.message}`, 'error');
        }
    };

    // ---------- Orders: status helper ----------
    function showOrdersStatus(message, type) {
        const statusDiv = document.getElementById('discogs-orders-status-msg');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.className = `status-message status-${type}`;
        if (window._discogsOrdersStatusTimeout) clearTimeout(window._discogsOrdersStatusTimeout);
        window._discogsOrdersStatusTimeout = setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }

    window.discogsOrdersApplyFilters = function() {
        viewingAllOrders = true;
        selectedOrderId = null;
        const itemsSection = document.getElementById('discogs-order-items-section');
        if (itemsSection) itemsSection.style.display = 'none';
        loadOrders();
    };

    // ================================================================
    // ================  TAB SWITCHER  ================================
    // ================================================================

    let ordersInited = false;

    window.discogsHubTab = function(which) {
        const postPanel   = document.getElementById('discogs-panel-post');
        const ordersPanel = document.getElementById('discogs-panel-orders');
        const postBtn     = document.getElementById('discogs-tab-post');
        const ordersBtn   = document.getElementById('discogs-tab-orders');

        if (!postPanel || !ordersPanel || !postBtn || !ordersBtn) return;

        if (which === 'post') {
            postPanel.style.display = 'flex';
            ordersPanel.style.display = 'none';

            postBtn.style.background = 'white';
            postBtn.style.color = '#333';
            postBtn.style.borderBottom = '2px solid #667eea';

            ordersBtn.style.background = '#e9ecef';
            ordersBtn.style.color = '#666';
            ordersBtn.style.borderBottom = '2px solid transparent';

            if (typeof window.initPostDiscogs === 'function') window.initPostDiscogs();
        } else {
            postPanel.style.display = 'none';
            ordersPanel.style.display = 'flex';

            ordersBtn.style.background = 'white';
            ordersBtn.style.color = '#333';
            ordersBtn.style.borderBottom = '2px solid #667eea';

            postBtn.style.background = '#e9ecef';
            postBtn.style.color = '#666';
            postBtn.style.borderBottom = '2px solid transparent';

            if (!ordersInited && typeof window.initDiscogsOrders === 'function') {
                ordersInited = true;
                window.initDiscogsOrders();
            }
        }
    };

    // ================================================================
    // ================  PUBLIC INIT FUNCTIONS  =======================
    // ================================================================

    window.initPostDiscogs = function() {
        console.log('📀 Post to Discogs initialized (auto-load mode)');

        locationCounts = [];
        recordsByLocation.clear();
        selectedLocations.clear();
        expandedLocations.clear();
        expandedSections.clear();
        isLoadingLocations = false;
        hasLoadedOnce = false;

        const list = document.getElementById('post-discogs-locations');
        if (list) list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">Loading locations...</div>';

        const statusDiv = document.getElementById('post-discogs-status');
        if (statusDiv) { statusDiv.style.display = 'none'; statusDiv.innerHTML = ''; }

        updatePostButtons();
        loadLocations();
    };

    window.loadPostDiscogsRecords = function() {
        return loadLocations();
    };

    window.initDiscogsOrders = function() {
        console.log('📦 Discogs Orders initialized');

        const dateFrom = document.getElementById('discogs-orders-date-from');
        const dateTo = document.getElementById('discogs-orders-date-to');

        if (dateFrom && !dateFrom.value) {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            dateFrom.value = d.toISOString().split('T')[0];
        }
        if (dateTo && !dateTo.value) {
            dateTo.value = new Date().toISOString().split('T')[0];
        }

        const modal = document.getElementById('discogs-shipping-modal');
        if (modal && !modal._discogsWired) {
            modal.addEventListener('click', function(e) {
                if (e.target === this) window.discogsCloseShippingModal();
            });
            modal._discogsWired = true;
        }

        loadOrders();
    };

    window.initDiscogsHub = function() {
        console.log('📀 Discogs Hub initialized');
        ordersInited = false;
        window.discogsHubTab('post');
    };
})();