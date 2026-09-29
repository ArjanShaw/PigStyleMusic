// ================================================================
// FILE: /static/js/post-discogs.js
// Post to Discogs page - counts-first, lazy-load records per location
//
// FLOW:
//   1. initPostDiscogs -> GET /api/records/location-counts (auto)
//                         renders the tree immediately
//   2. Expand loc      -> GET /records?location_ids=<id>&... (cached)
//   3. Post loc/bin    -> ensure records loaded, filter by price,
//                         POST each via /api/discogs/create-listing-single
//
// MARKUP MODEL (shared with eBay):
//   PRICING_MARKUP_PERCENT : positive % above store price (e.g. 40)
//   PRICING_PRICE_STEP     : positive %/wk drop          (e.g. 2)
//   PRICING_MAX_MARKDOWN   : positive % floor below store(e.g. 50)
//   Effective markup = markup_start - (weeks_old * step), floored at -max_md.
//   Price = store_price * (1 + markup/100)
//   When markup < 0, price is below store price (markdown).
//
// CONFIG SAVES INDEPENDENTLY OF LOADED RECORDS.
// CONFIG LOADS ON INIT AND POPULATES THE INPUTS.
// DISCOGS POSTING: 3-second delay between listings to respect rate limits.
//
// FEATURE 1: Records are fetched with visible_only=true (per-bin last_seen).
// FEATURE 2: Locations are hierarchical. Display uses location_display
//            (composed "Bin 20/RT" on the server).
// FEATURE 3: Consigned records (consignor_id IS NOT NULL) are excluded
//            from the posting pipeline entirely.
// ================================================================

(function() {
    'use strict';

    // ===== API BASE URL =====
    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    // ===== DISCOGS RATE LIMIT DELAY =====
    const DISCOGS_POST_DELAY_MS = 3000;

    // ===== STATE =====
    let locationCounts = [];                 // raw rows from /api/records/location-counts
    let recordsByLocation = new Map();       // location_id -> priced records[]

    let discogsMarkupPercent = null;
    let discogsPriceStep = null;
    let discogsMaxMarkdown = null;

    let isUpdating = false;
    let isPosting = false;
    let cancelPosting = false;
    let isLoadingLocations = false;
    let hasLoadedOnce = false;

    // Location display state
    let expandedLocations = new Set();
    let selectedLocations = new Set();
    let expandedSections = new Set();

    // ===== HEADERS / UTIL =====

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function buildLocationDisplay(record) {
        const name = record.location_display || record.location_name || 'Unknown Location';
        const idx = record.location_index;
        if (idx === null || idx === undefined || idx === '') {
            return name;
        }
        return `${name} (#${idx})`;
    }

    function getMarkdownFloor() {
        return -Math.abs(discogsMaxMarkdown);
    }

    // ===== CONFIG =====

    async function fetchRequiredConfig(key) {
        const response = await fetch(`${API_BASE}/config/${key}`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Config ${key} not available (HTTP ${response.status})`);
        }

        const data = await response.json();

        if (data.status !== 'success') {
            throw new Error(`Config ${key} returned non-success status`);
        }

        if (data.config_value === null || data.config_value === undefined || data.config_value === '') {
            throw new Error(`Config ${key} is missing in app_config`);
        }

        const parsed = parseFloat(data.config_value);
        if (isNaN(parsed)) {
            throw new Error(`Config ${key} is not a valid number (got "${data.config_value}")`);
        }

        return parsed;
    }

    async function fetchDiscogsConfig() {
        const markup = await fetchRequiredConfig('PRICING_MARKUP_PERCENT');
        const step   = await fetchRequiredConfig('PRICING_PRICE_STEP');
        const maxMd  = await fetchRequiredConfig('PRICING_MAX_MARKDOWN');

        console.log(`📥 Loaded shared pricing config: markup=${markup}, step=${step}, maxMd=${maxMd}`);

        if (markup < 0 || markup > 200) {
            throw new Error(`Config PRICING_MARKUP_PERCENT must be between 0 and 200 (got ${markup})`);
        }
        if (maxMd < 0 || maxMd > 100) {
            throw new Error(`Config PRICING_MAX_MARKDOWN must be between 0 and 100 (got ${maxMd})`);
        }
        if (step < 0) {
            throw new Error(`Config PRICING_PRICE_STEP must be >= 0 (got ${step})`);
        }

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
        if (data.status !== 'success') {
            throw new Error(`Failed to save ${key}: ${data.error || 'unknown error'}`);
        }

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

    // ===== PRICE CALCULATION =====
    //
    // markup_percent starts at +PRICING_MARKUP_PERCENT (positive).
    // Each week subtracts PRICING_PRICE_STEP.
    // Floors at -PRICING_MAX_MARKDOWN.
    // Final price = store_price * (1 + markup_percent/100).
    //
    function calculateDiscogsPrice(record) {
        if (!record || !record.created_at || !record.store_price || record.store_price <= 0) {
            return null;
        }

        if (record.consignor_id !== null && record.consignor_id !== undefined) {
            return null;
        }

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
        if (!recordsToCalculate || recordsToCalculate.length === 0) {
            return [];
        }
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
        if (discogsMarkupPercent === null) {
            info.textContent = 'Config not loaded';
            return;
        }
        if (locationCounts.length === 0) {
            info.textContent = `Markup: +${discogsMarkupPercent}% -${discogsPriceStep}%/wk (floor -${discogsMaxMarkdown}%) | no locations loaded`;
            return;
        }
        const totalEligible = locationCounts.reduce((s, l) => s + (l.record_count || 0), 0);
        info.textContent = `Markup: +${discogsMarkupPercent}% -${discogsPriceStep}%/wk (floor -${discogsMaxMarkdown}%) | ${totalEligible} eligible records across ${locationCounts.length} locations`;
    }

    // ===== UPDATE PRICES =====

    window.updateDiscogsPrices = async function() {
        if (isUpdating) return;
        if (isLoadingLocations) {
            alert('Please wait — locations are still loading.');
            return;
        }

        isUpdating = true;

        try {
            const markupInput = document.getElementById('discogs-markup-percent');
            const stepInput   = document.getElementById('discogs-price-step');
            const maxInput    = document.getElementById('discogs-max-markdown');

            const newMarkup = parseFloat(markupInput.value);
            const newStep   = parseFloat(stepInput.value);
            const newMax    = parseFloat(maxInput.value);

            if (isNaN(newMarkup) || newMarkup < 0 || newMarkup > 200) {
                alert('Initial Markup must be between 0 and 200 (% above store price)');
                return;
            }
            if (isNaN(newStep) || newStep < 0 || newStep > 50) {
                alert('Weekly Step must be between 0 and 50 (%/wk drop)');
                return;
            }
            if (isNaN(newMax) || newMax < 0 || newMax > 100) {
                alert('Max Markdown must be between 0 and 100 (% floor below store)');
                return;
            }

            discogsMarkupPercent = newMarkup;
            discogsPriceStep     = newStep;
            discogsMaxMarkdown   = Math.abs(newMax);

            await saveDiscogsConfig();

            for (const [locId, recs] of recordsByLocation.entries()) {
                recordsByLocation.set(locId, calculateDiscogsPricesForRecords(recs));
            }

            if (recordsByLocation.size > 0) {
                renderRecords();
                showStatus(`✅ Settings saved. Recalculated ${recordsByLocation.size} cached location(s).`, 'info');
            } else {
                showStatus('✅ Settings saved. Expand a location to load records.', 'info');
            }

            updatePriceInfo();
            updateButtons();

        } catch (err) {
            console.error('Update prices error:', err);
            showStatus(`❌ ${err.message}`, 'error');
        } finally {
            isUpdating = false;
        }
    };

    // ===== PROGRESS UI =====

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

    function showLoadError(msg) {
        const statusDiv = document.getElementById('post-discogs-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message status-error';
        statusDiv.innerHTML = `❌ ${msg}`;
    }

    // ===== FETCH LOCATION COUNTS =====

    async function fetchLocationCounts() {
        const url = `${API_BASE}/api/records/location-counts`;
        const response = await fetch(url, {
            credentials: 'include',
            mode: 'cors',
            headers: getHeaders()
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch location counts (HTTP ${response.status})`);
        }
        const data = await response.json();
        if (data.status !== 'success') {
            throw new Error(data.error || 'Location counts API error');
        }
        return data.data || [];
    }

    // ===== LOAD LOCATIONS (auto-called from init) =====

    async function loadLocations() {
        if (isLoadingLocations) return;
        if (isPosting) {
            console.warn('Skipping load — a post is in progress.');
            return;
        }

        isLoadingLocations = true;

        const list = document.getElementById('post-discogs-locations');
        if (list) {
            list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">Loading locations...</div>';
        }

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

            renderRecords();
            updatePriceInfo();

            const totalEligible = locationCounts.reduce((s, l) => s + (l.record_count || 0), 0);
            showStatus(
                `✅ Loaded ${locationCounts.length} locations (${totalEligible} eligible records). Expand a location to load its records.`,
                'info'
            );

            hasLoadedOnce = true;
            updateButtons();

        } catch (err) {
            console.error('❌ Error loading location counts:', err);
            showLoadError(err.message || 'Failed to load locations');
            if (list) {
                list.innerHTML = `<div style="text-align:center;padding:20px;color:#dc3545;">Error: ${err.message}</div>`;
            }
        } finally {
            isLoadingLocations = false;
        }
    }

    // ===== LAZY-LOAD RECORDS FOR A LOCATION =====

    async function ensureRecordsForLocation(locationId) {
        if (recordsByLocation.has(locationId)) {
            return recordsByLocation.get(locationId);
        }

        // Feature 1: visible_only  |  Feature 3: hide_consigned
        const url = `${API_BASE}/records?status_ids=2&visible_only=true&hide_consigned=true&location_ids=${locationId}`;
        const response = await fetch(url, {
            credentials: 'include',
            mode: 'cors',
            headers: getHeaders()
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch records for location ${locationId} (HTTP ${response.status})`);
        }
        const data = await response.json();
        if (data.status !== 'success') {
            throw new Error(data.error || `API error for location ${locationId}`);
        }

        const records = calculateDiscogsPricesForRecords(data.records || []);
        recordsByLocation.set(locationId, records);
        return records;
    }

    // ===== TREE HELPERS =====

    function extractBinNumber(locationName) {
        const match = locationName.match(/Bin\s*(\d+)/i);
        if (match) return parseInt(match[1], 10);
        return null;
    }

    function extractBinSection(locationName) {
        const match = locationName.match(/Bin\s*\d+\s*([A-Z]{2})/i);
        if (match) return match[1].toUpperCase();
        return null;
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

    /**
     * Build display tree from location-counts rows.
     * Returns array of nodes:
     *   { is_bin_section: true,  base_name, total_count, locations: [ {location_id, location_name, location_display, record_count, section} ] }
     *   { is_bin_section: false, location_id, location_name, location_display, record_count }
     */
    function buildTreeFromCounts() {
        const binSections = {};
        const standalone  = [];

        for (const row of locationCounts) {
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

        for (const key in binSections) {
            sortBinSections(binSections[key].locations);
        }

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
            result.push({
                is_bin_section: true,
                base_name:      key,
                total_count:    total,
                locations:      bin.locations,
            });
        }
        for (const s of standalone) {
            result.push(s);
        }
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

    // ===== RENDER =====

    function renderRecords() {
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
            if (node.is_bin_section) {
                html += renderBinNode(node);
            } else {
                html += renderStandaloneNode(node);
            }
        }

        list.innerHTML = html;
        updateSelectionInfo();
        updateButtons();
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
            for (const loc of locations) {
                html += renderLocationRow(loc, true);
            }
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
                html += `
                    <div style="padding: 12px 20px; font-size: 12px; color: #666; border-top: 1px solid #f0f0f0;">
                        ⏳ Loading records...
                    </div>
                `;
            } else if (records.length === 0) {
                html += `
                    <div style="padding: 12px 20px; font-size: 12px; color: #999; border-top: 1px solid #f0f0f0;">
                        No eligible records in this location.
                    </div>
                `;
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

    // ===== TOGGLES =====

    window.toggleBinSection = function(baseName) {
        if (expandedSections.has(baseName)) expandedSections.delete(baseName);
        else expandedSections.add(baseName);
        renderRecords();
    };

    window.toggleAllLocationsInBin = function(baseName) {
        const bin = findBinNode(baseName);
        if (!bin) return;
        const ids = bin.locations.map(l => l.location_id);
        const allSelected = ids.every(id => selectedLocations.has(id));
        if (allSelected) {
            for (const id of ids) selectedLocations.delete(id);
        } else {
            for (const id of ids) selectedLocations.add(id);
        }
        renderRecords();
    };

    window.toggleLocation = async function(locationId) {
        if (expandedLocations.has(locationId)) {
            expandedLocations.delete(locationId);
            renderRecords();
            return;
        }
        expandedLocations.add(locationId);
        renderRecords();

        if (!recordsByLocation.has(locationId)) {
            try {
                await ensureRecordsForLocation(locationId);
            } catch (err) {
                console.error(`Failed to load records for location ${locationId}:`, err);
                showStatus(`❌ Could not load records for location ${locationId}: ${err.message}`, 'error');
            }
            renderRecords();
        }
    };

    window.toggleLocationSelection = function(locationId) {
        if (selectedLocations.has(locationId)) selectedLocations.delete(locationId);
        else selectedLocations.add(locationId);
        renderRecords();
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
        renderRecords();
    };

    function updateSelectionInfo() {
        const info = document.getElementById('selection-info');
        if (!info) return;
        let totalRecords = 0;
        for (const id of selectedLocations) {
            totalRecords += getLocationCount(id);
        }
        info.textContent = `${selectedLocations.size} locations selected, ${totalRecords} records`;
    }

    function updateButtons() {
        const postSelectedBtn = document.getElementById('post-selected-btn');
        const cancelBtn       = document.getElementById('cancel-post-btn');

        let selectedRecords = 0;
        for (const id of selectedLocations) {
            selectedRecords += getLocationCount(id);
        }

        if (postSelectedBtn) {
            postSelectedBtn.disabled = selectedLocations.size === 0 || selectedRecords === 0 || isPosting;
            if (selectedRecords > 0) {
                postSelectedBtn.textContent = `📤 Post Selected (${selectedRecords} records)`;
            } else {
                postSelectedBtn.textContent = '📤 Post Selected';
            }
            postSelectedBtn.style.display = isPosting ? 'none' : 'inline-block';
        }

        if (cancelBtn) {
            cancelBtn.style.display = isPosting ? 'inline-block' : 'none';
            cancelBtn.disabled = !isPosting;
        }
    }

    // ===== POSTING =====

    window.postBinSection = async function(baseName) {
        if (isPosting) return;
        const bin = findBinNode(baseName);
        if (!bin) {
            showStatus(`⚠️ Bin ${baseName} not found`, 'warning');
            return;
        }
        const ids = bin.locations.map(l => l.location_id);
        await collectAndPost(ids, `Bin ${baseName}`);
    };

    window.postLocation = async function(locationId) {
        if (isPosting) return;
        const found = findLocationNode(locationId);
        if (!found) {
            showStatus(`⚠️ Location ${locationId} not found`, 'warning');
            return;
        }
        const label = found.loc.location_display || found.loc.location_name;
        await collectAndPost([locationId], label);
    };

    window.postSelectedLocations = async function() {
        if (isPosting) return;
        if (selectedLocations.size === 0) {
            showStatus('⚠️ No locations selected', 'warning');
            return;
        }
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
            showStatus(`❌ ${err.message}`, 'error');
            return;
        }

        renderRecords();

        if (recordsToPost.length === 0) {
            showStatus(`⚠️ No records with Discogs prices in ${scopeLabel}`, 'warning');
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
            showStatus('⏹️ Cancelling... Please wait for current record to finish', 'warning');
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
        if (cancelBtn) {
            cancelBtn.disabled = false;
            cancelBtn.style.display = 'inline-block';
        }
        updateButtons();

        let success = 0;
        let failed = 0;
        let errorMessages = [];

        for (let i = 0; i < recordsToPost.length; i++) {
            if (cancelPosting) {
                showStatus(`⏹️ Cancelled. ${success} posted, ${failed} failed (${recordsToPost.length - i} records skipped)`, 'warning');
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
                const etaText = etaSeconds > 60
                    ? `~${Math.ceil(etaSeconds / 60)} min left`
                    : `~${Math.ceil(etaSeconds)}s left`;

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
                if (discogsPrice === null || discogsPrice === undefined) {
                    throw new Error('No computed Discogs price');
                }

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
            if (cancelPosting) {
                message = `⏹️ Cancelled. ${success} posted, ${failed} failed`;
            }
            statusDiv.innerHTML = message;
            statusDiv.className = failed > 0 || cancelPosting ? 'status-message status-warning' : 'status-message status-success';
            if (failed === 0 && !cancelPosting) {
                setTimeout(() => { statusDiv.style.display = 'none'; }, 8000);
            }
        }

        isPosting = false;
        if (postSelectedBtn) postSelectedBtn.disabled = false;
        if (cancelBtn) {
            cancelBtn.disabled = true;
            cancelBtn.style.display = 'none';
        }
        updateButtons();

        if (hasLoadedOnce) loadLocations();
    }

    // ===== STATUS =====

    function showStatus(message, type) {
        const statusDiv = document.getElementById('post-discogs-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = message;
        statusDiv.className = `status-message status-${type}`;
        if (type !== 'error' && type !== 'warning') {
            setTimeout(() => { statusDiv.style.display = 'none'; }, 8000);
        }
    }

    // ===== INIT — auto-loads on page entry, no button =====

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
        if (list) {
            list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">Loading locations...</div>';
        }

        const statusDiv = document.getElementById('post-discogs-status');
        if (statusDiv) {
            statusDiv.style.display = 'none';
            statusDiv.innerHTML = '';
        }

        updateButtons();

        loadLocations();
    };

    // Kept for backwards compatibility in case anything else calls it.
    window.loadPostDiscogsRecords = function() {
        return loadLocations();
    };

})();