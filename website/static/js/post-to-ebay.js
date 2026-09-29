// ================================================================
// FILE: /static/js/post-to-ebay.js
// Post to eBay page - counts-first, lazy-load records per location
//
// FLOW:
//   1. initPostToEbay  -> GET /api/records/location-counts (auto)
//                         renders the tree immediately
//   2. Expand loc      -> GET /records?location_ids=<id>&... (cached)
//   3. Post loc/bin    -> ensure records loaded, filter by price,
//                         POST each via /api/ebay/list
//
// MARKUP MODEL (shared with Discogs):
//   Initial Markup  : starting markup %, e.g. 40
//   Weekly Step     : markup drops this many points per week, e.g. 2
//   Max Markdown    : maximum discount as a POSITIVE % (0-100), e.g. 50
//                     → internally floor = -MaxMarkdown
//
// CONFIG KEYS (shared with post-discogs.js):
//   PRICING_MARKUP_PERCENT
//   PRICING_PRICE_STEP
//   PRICING_MAX_MARKDOWN
// ================================================================

(function() {
    'use strict';

    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    const EBAY_POST_DELAY_MS = 1000;

    let locationCounts = [];
    let recordsByLocation = new Map();

    let ebayMarkupPercent = null;
    let ebayPriceStep = null;
    let ebayMaxMarkdown = null;

    let isUpdating = false;
    let isPosting = false;
    let cancelPosting = false;
    let isLoadingLocations = false;
    let hasLoadedOnce = false;

    let expandedLocations = new Set();
    let selectedLocations = new Set();
    let expandedSections = new Set();

    // ----------------------------------------------------------------
    // HEADERS / UTIL
    // ----------------------------------------------------------------

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getMarkdownFloor() {
        return -Math.abs(ebayMaxMarkdown);
    }

    // ----------------------------------------------------------------
    // CONFIG
    // ----------------------------------------------------------------

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

    async function fetchEbayConfig() {
        const markup = await fetchRequiredConfig('PRICING_MARKUP_PERCENT');
        const step   = await fetchRequiredConfig('PRICING_PRICE_STEP');
        const maxMd  = await fetchRequiredConfig('PRICING_MAX_MARKDOWN');

        console.log(`📥 Loaded shared pricing config: markup=${markup}, step=${step}, maxMd=${maxMd}`);

        if (maxMd < 0 || maxMd > 100) {
            throw new Error(`Config PRICING_MAX_MARKDOWN must be between 0 and 100 (got ${maxMd})`);
        }
        if (step < 0) {
            throw new Error(`Config PRICING_PRICE_STEP must be >= 0 (got ${step})`);
        }

        ebayMarkupPercent = markup;
        ebayPriceStep     = step;
        ebayMaxMarkdown   = Math.abs(maxMd);

        const markupEl = document.getElementById('ebay-markup-percent');
        if (markupEl) markupEl.value = ebayMarkupPercent;

        const stepEl = document.getElementById('ebay-price-step');
        if (stepEl) stepEl.value = ebayPriceStep;

        const maxEl = document.getElementById('ebay-max-markdown');
        if (maxEl) maxEl.value = ebayMaxMarkdown;

        updatePriceInfo();
    }

    async function saveEbayConfig() {
        await saveOneConfig('PRICING_MARKUP_PERCENT', ebayMarkupPercent);
        await saveOneConfig('PRICING_PRICE_STEP', ebayPriceStep);
        await saveOneConfig('PRICING_MAX_MARKDOWN', ebayMaxMarkdown);
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
        console.log(`✅ Saved ${key} = ${value}`);
    }

    // ----------------------------------------------------------------
    // CONNECT (OAuth)
    // ----------------------------------------------------------------

    window.connectEbay = async function() {
        try {
            const response = await fetch(`${API_BASE}/api/ebay/auth/url`, {
                credentials: 'include',
                headers: getHeaders()
            });
            if (!response.ok) {
                const msg = await response.text();
                showStatus(`❌ Could not get eBay auth URL: ${msg.slice(0, 200)}`, 'error');
                return;
            }
            const data = await response.json();
            if (data.status !== 'success' || !data.auth_url) {
                showStatus('❌ eBay auth URL missing in response', 'error');
                return;
            }
            window.open(data.auth_url, '_blank', 'noopener');
            showStatus('🔗 Opened eBay authorization in a new tab. Complete consent there, then return to this tab.', 'info');
        } catch (err) {
            showStatus(`❌ ${err.message}`, 'error');
        }
    };

    // ----------------------------------------------------------------
    // PRICE CALCULATION
    // ----------------------------------------------------------------

    function calculateEbayPrice(record) {
        if (!record || !record.created_at || !record.store_price || record.store_price <= 0) return null;
        if (record.consignor_id !== null && record.consignor_id !== undefined) return null;

        if (ebayMarkupPercent === null || ebayPriceStep === null || ebayMaxMarkdown === null) {
            throw new Error('eBay config not loaded — cannot calculate price');
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
        let markup = ebayMarkupPercent - (weeksOld * ebayPriceStep);
        markup = Math.max(floor, markup);

        const ebayPrice = record.store_price * (1 + markup / 100);

        return {
            ebay_price: Math.round(ebayPrice * 100) / 100,
            markup_percent: Math.round(markup * 10) / 10,
            days_old: daysOld,
            weeks_old: weeksOld
        };
    }

    function calculateEbayPricesForRecords(recordsToCalculate) {
        if (!recordsToCalculate || recordsToCalculate.length === 0) return [];
        return recordsToCalculate.map(r => {
            const priceData = calculateEbayPrice(r);
            if (priceData) {
                r._ebayPrice     = priceData.ebay_price;
                r._markupPercent = priceData.markup_percent;
                r._daysOld       = priceData.days_old;
                r._weeksOld      = priceData.weeks_old;
            } else {
                r._ebayPrice     = null;
                r._markupPercent = null;
                r._daysOld       = null;
                r._weeksOld      = null;
            }
            return r;
        });
    }

    function updatePriceInfo() {
        const info = document.getElementById('ebay-price-calc-info');
        if (!info) return;
        if (ebayMarkupPercent === null) {
            info.textContent = 'Config not loaded';
            return;
        }
        if (locationCounts.length === 0) {
            info.textContent = `Markup: ${ebayMarkupPercent}% - ${ebayPriceStep}%/wk (max markdown: ${ebayMaxMarkdown}%) | no locations loaded`;
            return;
        }
        const totalEligible = locationCounts.reduce((s, l) => s + (l.record_count || 0), 0);
        info.textContent = `Markup: ${ebayMarkupPercent}% - ${ebayPriceStep}%/wk (max markdown: ${ebayMaxMarkdown}%) | ${totalEligible} eligible records across ${locationCounts.length} locations`;
    }

    window.updateEbayPrices = async function() {
        if (isUpdating) return;
        if (isLoadingLocations) {
            alert('Please wait — locations are still loading.');
            return;
        }

        isUpdating = true;

        try {
            const markupInput = document.getElementById('ebay-markup-percent');
            const stepInput   = document.getElementById('ebay-price-step');
            const maxInput    = document.getElementById('ebay-max-markdown');

            const newMarkup = parseFloat(markupInput.value);
            const newStep   = parseFloat(stepInput.value);
            const newMax    = parseFloat(maxInput.value);

            if (isNaN(newMarkup) || newMarkup < -100 || newMarkup > 200) {
                alert('Initial Markup must be a number between -100 and 200');
                return;
            }
            if (isNaN(newStep) || newStep < 0) {
                alert('Weekly Step must be a positive number');
                return;
            }
            if (isNaN(newMax) || newMax < 0 || newMax > 100) {
                alert('Max Markdown must be a number between 0 and 100');
                return;
            }

            ebayMarkupPercent = newMarkup;
            ebayPriceStep     = newStep;
            ebayMaxMarkdown   = Math.abs(newMax);

            await saveEbayConfig();

            for (const [locId, recs] of recordsByLocation.entries()) {
                recordsByLocation.set(locId, calculateEbayPricesForRecords(recs));
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

    // ----------------------------------------------------------------
    // LOAD LOCATION COUNTS (called from init, no button)
    // ----------------------------------------------------------------

    function showLoadProgressBar(label, loaded, total, extra) {
        const statusDiv = document.getElementById('ebay-status');
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
                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#0064d2,#004a99);transition:width 0.2s ease;"></div>
                </div>
                ${extra ? `<div style="font-size:12px;color:#666;">${extra}</div>` : ''}
            </div>
        `;
    }

    function showLoadError(msg) {
        const statusDiv = document.getElementById('ebay-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message status-error';
        statusDiv.innerHTML = `❌ ${msg}`;
    }

    async function fetchLocationCounts() {
        const url = `${API_BASE}/api/records/location-counts`;
        const response = await fetch(url, {
            credentials: 'include',
            mode: 'cors',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch location counts (HTTP ${response.status})`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || 'Location counts API error');
        return data.data || [];
    }

    /**
     * Loads config + location counts and renders the tree.
     * Called from initPostToEbay(). Safe to call again to refresh.
     */
    async function loadLocations() {
        if (isLoadingLocations) return;
        if (isPosting) {
            console.warn('Skipping load — a post is in progress.');
            return;
        }

        isLoadingLocations = true;

        const list = document.getElementById('ebay-locations');
        if (list) list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">Loading locations...</div>';

        try {
            showLoadProgressBar('⚙️ Loading configuration...', 0, 0, '');
            await fetchEbayConfig();

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

    // ----------------------------------------------------------------
    // LAZY-LOAD RECORDS FOR A LOCATION
    // ----------------------------------------------------------------

    async function ensureRecordsForLocation(locationId) {
        if (recordsByLocation.has(locationId)) {
            return recordsByLocation.get(locationId);
        }

        const url = `${API_BASE}/records?status_ids=2&visible_only=true&hide_consigned=true&location_ids=${locationId}`;
        const response = await fetch(url, {
            credentials: 'include',
            mode: 'cors',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch records for location ${locationId} (HTTP ${response.status})`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || `API error for location ${locationId}`);

        const records = calculateEbayPricesForRecords(data.records || []);
        recordsByLocation.set(locationId, records);
        return records;
    }

    // ----------------------------------------------------------------
    // TREE BUILDING
    // ----------------------------------------------------------------

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

    // ----------------------------------------------------------------
    // RENDER
    // ----------------------------------------------------------------

    function renderRecords() {
        const list = document.getElementById('ebay-locations');
        if (!list) return;

        if (locationCounts.length === 0) {
            list.innerHTML = `<div style="text-align:center;padding:20px;color:#999;">No locations loaded</div>`;
            return;
        }

        const tree = buildTreeFromCounts();
        const totalEligible = locationCounts.reduce((s, l) => s + (l.record_count || 0), 0);

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 8px; background: #f8f9fa; border-radius: 4px;">
                <span style="font-size: 13px; color: #666;">${totalEligible} eligible records across ${locationCounts.length} locations</span>
                <span style="font-size: 12px; color: #888;">${recordsByLocation.size} location(s) expanded</span>
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
                     onclick="ebayToggleBinSection('${baseName}')">
                    <span style="font-size: 16px; margin-right: 10px; color: #333;">${isSectionExpanded ? '▼' : '▶'}</span>
                    <input type="checkbox" style="margin-right: 12px; cursor: pointer; width: 18px; height: 18px;"
                           ${allSelected ? 'checked' : ''}
                           onclick="event.stopPropagation(); ebayToggleAllLocationsInBin('${baseName}')">
                    <span style="flex: 1; font-weight: 700; color: #333; font-size: 16px;">📦 ${baseName}</span>
                    <span style="display: flex; gap: 8px; align-items: center; font-size: 12px; margin-right: 8px;">
                        <span style="background: #e9ecef; padding: 2px 12px; border-radius: 12px; color: #495057; font-weight: 600;">
                            ${totalRecords} records
                        </span>
                        ${anySelected ? `<span style="color: #0064d2; font-weight: 600;">${totalSelected} selected</span>` : ''}
                        ${totalRecords > 0 ? `
                            <button onclick="event.stopPropagation(); ebayPostBinSection('${baseName}')"
                                    style="padding: 4px 16px; background: linear-gradient(135deg, #0064d2 0%, #004a99 100%); color: white; border: none; border-radius: 14px; cursor: pointer; font-size: 12px; font-weight: 600;">
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

        const isExpanded   = expandedLocations.has(locationId);
        const isSelected   = selectedLocations.has(locationId);
        const records      = recordsByLocation.get(locationId);
        const recordsLoaded = !!records;
        const pricedCount  = recordsLoaded
            ? records.filter(r => r._ebayPrice && r._ebayPrice > 0).length
            : null;

        const padLeft      = indent ? 'padding-left: 20px;' : '';
        const borderStyle  = indent ? 'border-top: 1px solid #dee2e6;' : 'border: 1px solid #e9ecef; border-radius: 6px;';
        const marginBottom = indent ? '' : 'margin-bottom: 6px;';
        const bgColor      = isSelected ? '#f0f8ff' : 'white';
        const headerBg     = isExpanded ? '#f8f9fa' : 'white';

        let html = `
            <div style="${borderStyle} ${marginBottom} background: ${bgColor}; ${padLeft}">
                <div style="display: flex; align-items: center; padding: ${indent ? '6px 12px' : '8px 12px'}; cursor: pointer; background: ${headerBg};"
                     onclick="ebayToggleLocation(${locationId})">
                    <span style="font-size: ${indent ? '13px' : '14px'}; margin-right: 8px; color: ${count > 0 ? '#333' : '#999'};">
                        ${isExpanded ? '▼' : '▶'}
                    </span>
                    <input type="checkbox" style="margin-right: 10px; cursor: pointer;"
                           ${isSelected ? 'checked' : ''}
                           onclick="event.stopPropagation(); ebayToggleLocationSelection(${locationId})">
                    <span style="flex: 1; font-weight: ${indent ? '500' : '600'}; color: #333; font-size: ${indent ? '13px' : '14px'};">
                        ${locationName}
                    </span>
                    <span style="display: flex; gap: 6px; align-items: center; font-size: ${indent ? '11px' : '12px'}; margin-right: 8px;">
                        <span style="background: #e9ecef; padding: 1px 10px; border-radius: 10px; color: #495057;">
                            ${count} records
                        </span>
                        ${pricedCount !== null ? `<span style="color: #0064d2; font-weight: 600;">${pricedCount} priced</span>` : ''}
                        ${count > 0 ? `
                            <button onclick="event.stopPropagation(); ebayPostLocation(${locationId})"
                                    style="padding: ${indent ? '2px 12px' : '3px 14px'}; background: ${indent ? '#28a745' : 'linear-gradient(135deg, #0064d2 0%, #004a99 100%)'}; color: white; border: none; border-radius: ${indent ? '10px' : '14px'}; cursor: pointer; font-size: ${indent ? '10px' : '11px'}; font-weight: 600;">
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
                            <th style="padding: ${s.headerPad}; text-align: right; color: #0064d2; font-weight: 600; font-size: ${s.headerFs};">eBay</th>
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
            const hasPrice = r._ebayPrice && r._ebayPrice > 0;
            const ebayPrice = hasPrice ? r._ebayPrice : '—';
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
                    <td style="padding: ${s.pad}; text-align: right; color: ${hasPrice ? (isMarkdown ? '#dc3545' : '#0064d2') : '#999'}; font-weight: 600;">
                        ${hasPrice ? '$' + ebayPrice.toFixed(2) : '—'}
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

    // ----------------------------------------------------------------
    // TOGGLES
    // ----------------------------------------------------------------

    window.ebayToggleBinSection = function(baseName) {
        if (expandedSections.has(baseName)) expandedSections.delete(baseName);
        else expandedSections.add(baseName);
        renderRecords();
    };

    window.ebayToggleAllLocationsInBin = function(baseName) {
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

    window.ebayToggleLocation = async function(locationId) {
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

    window.ebayToggleLocationSelection = function(locationId) {
        if (selectedLocations.has(locationId)) selectedLocations.delete(locationId);
        else selectedLocations.add(locationId);
        renderRecords();
    };

    window.ebayToggleAllLocations = function() {
        const selectAll = document.getElementById('ebay-select-all-locations');
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

    function getLocationCount(locationId) {
        const found = findLocationNode(locationId);
        return found ? (found.loc.record_count || 0) : 0;
    }

    function updateSelectionInfo() {
        const info = document.getElementById('ebay-selection-info');
        if (!info) return;
        let totalRecords = 0;
        for (const id of selectedLocations) {
            totalRecords += getLocationCount(id);
        }
        info.textContent = `${selectedLocations.size} locations selected, ${totalRecords} records`;
    }

    function updateButtons() {
        const postSelectedBtn = document.getElementById('ebay-post-selected-btn');
        const cancelBtn       = document.getElementById('ebay-cancel-post-btn');

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

    // ----------------------------------------------------------------
    // POSTING
    // ----------------------------------------------------------------

    window.ebayPostBinSection = async function(baseName) {
        if (isPosting) return;
        const bin = findBinNode(baseName);
        if (!bin) {
            showStatus(`⚠️ Bin ${baseName} not found`, 'warning');
            return;
        }
        const ids = bin.locations.map(l => l.location_id);
        await collectAndPost(ids, `Bin ${baseName}`);
    };

    window.ebayPostLocation = async function(locationId) {
        if (isPosting) return;
        const found = findLocationNode(locationId);
        if (!found) {
            showStatus(`⚠️ Location ${locationId} not found`, 'warning');
            return;
        }
        const label = found.loc.location_display || found.loc.location_name;
        await collectAndPost([locationId], label);
    };

    window.postSelectedEbayLocations = async function() {
        if (isPosting) return;
        if (selectedLocations.size === 0) {
            showStatus('⚠️ No locations selected', 'warning');
            return;
        }
        const ids = Array.from(selectedLocations);
        await collectAndPost(ids, `${ids.length} selected locations`);
    };

    async function collectAndPost(locationIds, scopeLabel) {
        const statusDiv = document.getElementById('ebay-status');

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
                const eligible = recs.filter(r => r._ebayPrice && r._ebayPrice > 0);
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
            showStatus(`⚠️ No records with eBay prices in ${scopeLabel}`, 'warning');
            return;
        }

        await confirmAndPost(recordsToPost, locationNames, scopeLabel);
    }

    async function confirmAndPost(recordsToPost, locationNames, scopeLabel) {
        const withMarkdown = recordsToPost.filter(r => r._markupPercent && r._markupPercent < 0);
        const estMinutes = ((recordsToPost.length * EBAY_POST_DELAY_MS) / 60000).toFixed(1);
        let confirmMsg = `Post ${recordsToPost.length} record(s) from ${scopeLabel} to eBay?\n\n`;
        confirmMsg += `Locations: ${locationNames.join(', ')}\n`;
        confirmMsg += `Markup: ${ebayMarkupPercent}% - ${ebayPriceStep}%/wk (max markdown: ${ebayMaxMarkdown}%)\n`;
        confirmMsg += `${withMarkdown.length} records will be on markdown\n`;
        confirmMsg += `Estimated time: ~${estMinutes} minutes (${EBAY_POST_DELAY_MS / 1000}s between each)`;
        if (!confirm(confirmMsg)) return;
        await postRecords(recordsToPost);
    }

    window.cancelEbayPosting = function() {
        if (isPosting) {
            cancelPosting = true;
            showStatus('⏹️ Cancelling... Please wait for current record to finish', 'warning');
            const btn = document.getElementById('ebay-cancel-post-btn');
            if (btn) btn.disabled = true;
        }
    };

    async function postRecords(recordsToPost) {
        if (isPosting) return;
        isPosting = true;
        cancelPosting = false;

        const statusDiv = document.getElementById('ebay-status');
        const postSelectedBtn = document.getElementById('ebay-post-selected-btn');
        const cancelBtn = document.getElementById('ebay-cancel-post-btn');

        if (postSelectedBtn) postSelectedBtn.disabled = true;
        if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.style.display = 'inline-block'; }
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
            const priceColor = isMarkdown ? '#dc3545' : '#0064d2';

            if (statusDiv) {
                const remaining = total - i;
                const etaSeconds = Math.max(0, (remaining - 1) * (EBAY_POST_DELAY_MS / 1000));
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
                                <span style="color: ${priceColor}; font-weight: 600;">$${record._ebayPrice.toFixed(2)}</span>
                                ${isMarkdown ? '🔻' : '📈'}
                            </span>
                            <span style="font-size: 12px; color: #666;">${Math.round((current / total) * 100)}%</span>
                        </div>
                        <div style="width: 100%; height: 6px; background: #e9ecef; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${(current / total) * 100}%; height: 100%; background: linear-gradient(90deg, #0064d2, #004a99); transition: width 0.3s ease;"></div>
                        </div>
                        <div style="font-size: 11px; color: #888; display: flex; gap: 15px;">
                            <span>✅ ${success} posted</span>
                            <span>❌ ${failed} failed</span>
                            <span>⏱️ ${etaText}</span>
                            <span>🕒 ${EBAY_POST_DELAY_MS / 1000}s between posts</span>
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
                const ebayPrice = record._ebayPrice;
                if (ebayPrice === null || ebayPrice === undefined) {
                    throw new Error('No computed eBay price');
                }

                const payload = {
                    record_id: record.id,
                    price: ebayPrice,
                    quantity: 1
                };

                const listingResult = await fetch(`${API_BASE}/api/ebay/list`, {
                    method: 'POST',
                    credentials: 'include',
                    mode: 'cors',
                    headers: getHeaders(),
                    body: JSON.stringify(payload)
                });

                const data = await listingResult.json();

                if (listingResult.ok && data.status === 'success') {
                    success++;
                } else {
                    failed++;
                    const errorMsg = data.error || data.message || `HTTP ${listingResult.status}`;
                    errorMessages.push(`Record #${record.id}: ${errorMsg}`);
                    console.error(`Failed to post record ${record.id}:`, data);
                }
            } catch (err) {
                failed++;
                errorMessages.push(`Record #${record.id}: ${err.message || 'Network error'}`);
                console.error('Error posting record:', err);
            }

            if (i < recordsToPost.length - 1 && !cancelPosting) {
                await sleep(EBAY_POST_DELAY_MS);
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
        updateButtons();

        if (hasLoadedOnce) loadLocations();
    }

    function showStatus(message, type) {
        const statusDiv = document.getElementById('ebay-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = message;
        statusDiv.className = `status-message status-${type}`;
        if (type !== 'error' && type !== 'warning') {
            setTimeout(() => { statusDiv.style.display = 'none'; }, 8000);
        }
    }

    // ----------------------------------------------------------------
    // INIT — auto-loads on page entry, no button
    // ----------------------------------------------------------------

    window.initPostToEbay = function() {
        console.log('🛒 Post to eBay initialized (auto-load mode)');

        locationCounts = [];
        recordsByLocation.clear();
        selectedLocations.clear();
        expandedLocations.clear();
        expandedSections.clear();
        isLoadingLocations = false;
        hasLoadedOnce = false;

        const list = document.getElementById('ebay-locations');
        if (list) {
            list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">Loading locations...</div>';
        }

        const statusDiv = document.getElementById('ebay-status');
        if (statusDiv) {
            statusDiv.style.display = 'none';
            statusDiv.innerHTML = '';
        }

        updateButtons();

        loadLocations();
    };

    // Kept for backwards compatibility in case anything else calls it.
    window.loadPostEbayRecords = function() {
        return loadLocations();
    };

})();