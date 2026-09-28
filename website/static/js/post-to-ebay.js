// ================================================================
// FILE: /static/js/post-to-ebay.js
// Post to eBay page - mirrors post-discogs.js structure
//
// Differences from Discogs:
//   - Connect flow (OAuth) is required before posting
//   - Shorter post delay (eBay's Inventory API is more permissive)
//   - Backend constructs the listing; frontend sends record_id + price
//
// MARKUP MODEL (single source of truth — shared with Discogs):
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

    // eBay rate limit — much more permissive than Discogs
    const EBAY_POST_DELAY_MS = 1000;

    let records = [];
    let ebayMarkupPercent = null;
    let ebayPriceStep = null;
    let ebayMaxMarkdown = null;
    let ebayConnected = false;
    let isUpdating = false;
    let isPosting = false;
    let cancelPosting = false;
    let isLoadingRecords = false;
    let hasLoadedOnce = false;

    let expandedLocations = new Set();
    let selectedLocations = new Set();
    let expandedSections = new Set();

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    function buildLocationDisplay(record) {
        const name = record.location_display || record.location_name || 'Unknown Location';
        const idx = record.location_index;
        if (idx === null || idx === undefined || idx === '') return name;
        return `${name} (#${idx})`;
    }

    function getMarkdownFloor() {
        return -Math.abs(ebayMaxMarkdown);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===== CONFIG (SHARED WITH DISCOGS) =====
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
        const step = await fetchRequiredConfig('PRICING_PRICE_STEP');
        const maxMd = await fetchRequiredConfig('PRICING_MAX_MARKDOWN');

        console.log(`📥 Loaded shared pricing config: markup=${markup}, step=${step}, maxMd=${maxMd}`);

        if (maxMd < 0 || maxMd > 100) {
            throw new Error(`Config PRICING_MAX_MARKDOWN must be between 0 and 100 (got ${maxMd})`);
        }
        if (step < 0) {
            throw new Error(`Config PRICING_PRICE_STEP must be >= 0 (got ${step})`);
        }

        ebayMarkupPercent = markup;
        ebayPriceStep = step;
        ebayMaxMarkdown = Math.abs(maxMd);

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

    // ===== CONNECT STATUS =====
    async function refreshEbayConnectionStatus() {
        const iconEl = document.getElementById('ebay-connection-icon');
        const textEl = document.getElementById('ebay-connection-text');
        const btnEl  = document.getElementById('ebay-connect-btn');

        try {
            const response = await fetch(`${API_BASE}/api/ebay/connection-status`, {
                credentials: 'include',
                headers: getHeaders()
            });
            if (response.ok) {
                const data = await response.json();
                ebayConnected = !!data.connected;

                if (ebayConnected) {
                    if (iconEl) iconEl.textContent = '🟢';
                    if (textEl) textEl.textContent = data.username
                        ? `Connected as ${data.username}`
                        : 'Connected to eBay';
                    if (btnEl) {
                        btnEl.textContent = '🔁 Reconnect';
                        btnEl.style.background = '#6c757d';
                    }
                } else {
                    if (iconEl) iconEl.textContent = '🔴';
                    if (textEl) textEl.textContent = 'Not connected — click Connect eBay to authorize';
                    if (btnEl) {
                        btnEl.textContent = '🔗 Connect eBay';
                        btnEl.style.background = 'linear-gradient(135deg, #0064d2 0%, #004a99 100%)';
                    }
                }
            } else {
                // Endpoint missing (older backend) — report but don't break
                if (iconEl) iconEl.textContent = '⚪';
                if (textEl) textEl.textContent = 'Connection status unavailable (backend endpoint missing)';
            }
        } catch (err) {
            console.warn('eBay connection status check failed:', err);
            if (iconEl) iconEl.textContent = '⚪';
            if (textEl) textEl.textContent = 'Could not reach backend';
        }
    }

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
            // Open in new tab so we stay on the SPA
            window.open(data.auth_url, '_blank', 'noopener');
            showStatus('🔗 Opened eBay authorization in a new tab. Complete consent there, then click "Refresh Status".', 'info');
        } catch (err) {
            showStatus(`❌ ${err.message}`, 'error');
        }
    };

    // ===== PRICE CALCULATION (SHARED MODEL) =====
    function calculateEbayPrice(record) {
        if (!record || !record.created_at || !record.store_price || record.store_price <= 0) return null;

        // Feature 3 parallel: consigned records excluded
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

    function updatePriceInfo() {
        const info = document.getElementById('ebay-price-calc-info');
        if (!info) return;
        if (ebayMarkupPercent === null) {
            info.textContent = 'Config not loaded';
            return;
        }
        if (records.length === 0) {
            info.textContent = `Markup: ${ebayMarkupPercent}% - ${ebayPriceStep}%/wk (max markdown: ${ebayMaxMarkdown}%) | no records loaded`;
            return;
        }
        const withPrices = records.filter(r => r._ebayPrice && r._ebayPrice > 0);
        info.textContent = `Markup: ${ebayMarkupPercent}% - ${ebayPriceStep}%/wk (max markdown: ${ebayMaxMarkdown}%) | ${withPrices.length} records have prices`;
    }

    function calculateEbayPricesForRecords(recordsToCalculate) {
        if (!recordsToCalculate || recordsToCalculate.length === 0) return [];
        console.log(`💰 Calculating eBay prices for ${recordsToCalculate.length} records...`);
        return recordsToCalculate.map(r => {
            const priceData = calculateEbayPrice(r);
            if (priceData) {
                r._ebayPrice = priceData.ebay_price;
                r._markupPercent = priceData.markup_percent;
                r._daysOld = priceData.days_old;
                r._weeksOld = priceData.weeks_old;
            } else {
                r._ebayPrice = null;
                r._markupPercent = null;
                r._daysOld = null;
                r._weeksOld = null;
            }
            return r;
        });
    }

    window.updateEbayPrices = async function() {
        if (isUpdating) return;
        if (isLoadingRecords) {
            alert('Please wait — records are still loading.');
            return;
        }

        isUpdating = true;

        try {
            const markupInput = document.getElementById('ebay-markup-percent');
            const stepInput = document.getElementById('ebay-price-step');
            const maxInput = document.getElementById('ebay-max-markdown');

            const newMarkup = parseFloat(markupInput.value);
            const newStep = parseFloat(stepInput.value);
            const newMax = parseFloat(maxInput.value);

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
            ebayPriceStep = newStep;
            ebayMaxMarkdown = Math.abs(newMax);

            await saveEbayConfig();

            if (records.length > 0) {
                records = calculateEbayPricesForRecords(records);
                renderRecords();

                const withPrices = records.filter(r => r._ebayPrice && r._ebayPrice > 0);
                const withMarkdown = records.filter(r => r._markupPercent && r._markupPercent < 0);
                showStatus(`✅ Settings saved. ${withPrices.length} records priced (${withMarkdown.length} on markdown).`, 'info');
            } else {
                showStatus('✅ Settings saved. Load records to apply.', 'info');
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

    // ===== FETCH RECORDS =====
    async function fetchAllRecords(onProgress) {
        let allRecords = [];
        let page = 1;
        const perPage = 100;
        let hasMore = true;
        let total = 0;

        console.log('📊 Fetching all records with pagination...');

        while (hasMore) {
            const url = `${API_BASE}/records?status_ids=2&visible_only=true&hide_consigned=true&limit=${perPage}&offset=${(page - 1) * perPage}`;
            const response = await fetch(url, {
                credentials: 'include',
                mode: 'cors',
                headers: getHeaders()
            });
            if (!response.ok) throw new Error(`Failed to fetch page ${page} (HTTP ${response.status})`);
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || `API error on page ${page}`);

            const pageRecords = data.records || [];
            total = data.total || 0;
            allRecords = allRecords.concat(pageRecords);

            if (onProgress) onProgress({ page, loaded: allRecords.length, total, finished: false });

            if (allRecords.length >= total || pageRecords.length < perPage) {
                hasMore = false;
            } else {
                page++;
            }
        }

        if (onProgress) onProgress({ page, loaded: allRecords.length, total, finished: true });
        return allRecords;
    }

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

    function updateLoadButtonState(loading) {
        const btn = document.getElementById('ebay-load-records-btn');
        const info = document.getElementById('ebay-load-records-info');
        if (btn) {
            btn.disabled = loading;
            btn.style.opacity = loading ? '0.6' : '1';
            btn.style.cursor = loading ? 'not-allowed' : 'pointer';
            btn.textContent = loading ? '⏳ Loading...' : '📥 Load Records';
        }
        if (info && loading) info.textContent = 'Fetching records from the server...';
    }

    window.loadPostEbayRecords = async function() {
        if (isLoadingRecords) return;
        if (isPosting) {
            alert('Please wait — a post is in progress.');
            return;
        }

        isLoadingRecords = true;
        updateLoadButtonState(true);

        const list = document.getElementById('ebay-locations');
        if (list) list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">Fetching records...</div>';

        try {
            showLoadProgressBar('⚙️ Loading configuration...', 0, 0, '');
            await fetchEbayConfig();

            const fetched = await fetchAllRecords(({ page, loaded, total, finished }) => {
                const label = finished ? '✅ Records fetched' : `📥 Fetching page ${page}...`;
                showLoadProgressBar(label, loaded, total, '');
            });

            if (fetched.length === 0) {
                list.innerHTML = `<div style="text-align:center;padding:20px;color:#999;">No records found</div>`;
                showLoadProgressBar('✅ Loaded (empty)', 0, 0, '');
                return;
            }

            showLoadProgressBar('💰 Calculating prices...', fetched.length, fetched.length, '');
            await sleep(30);

            records = calculateEbayPricesForRecords(fetched);
            renderRecords();
            updatePriceInfo();

            const withPrices = records.filter(r => r._ebayPrice && r._ebayPrice > 0);
            const withMarkdown = records.filter(r => r._markupPercent && r._markupPercent < 0);
            const statusMsg = withPrices.length > 0
                ? `✅ Loaded ${records.length} records (${withPrices.length} with prices, ${withMarkdown.length} on markdown)`
                : `Loaded ${records.length} records but NONE have eBay prices`;
            showStatus(statusMsg, withPrices.length > 0 ? 'info' : 'warning');

            const info = document.getElementById('ebay-load-records-info');
            if (info) info.textContent = `Loaded ${records.length} records. Click again to refresh.`;

            hasLoadedOnce = true;
            updateButtons();

        } catch (err) {
            console.error('❌ Error loading records:', err);
            showLoadError(err.message || 'Failed to load records');
            if (list) {
                list.innerHTML = `<div style="text-align:center;padding:20px;color:#dc3545;">Error: ${err.message}</div>`;
            }
        } finally {
            isLoadingRecords = false;
            updateLoadButtonState(false);
        }
    };

    // ===== LOCATION GROUPING (identical logic to post-discogs) =====
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

    function getBinBaseName(locationName) {
        const match = locationName.match(/(Bin\s*\d+)/i);
        if (match) return match[1];
        return locationName;
    }

    function sortBinSections(sections) {
        const order = ['LT', 'RT', 'LB', 'RB'];
        return sections.sort((a, b) => {
            const indexA = order.indexOf(a.section);
            const indexB = order.indexOf(b.section);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
    }

    function groupRecordsByLocation(recordsArray) {
        const groups = {};
        const binSections = {};

        for (const r of recordsArray) {
            const locationId = r.location_id || 0;
            const locationName = r.location_display || r.location_name || 'Unknown Location';
            if (!groups[locationId]) {
                groups[locationId] = { location_id: locationId, location_name: locationName, records: [] };
            }
            groups[locationId].records.push(r);
            if (isBinLocation(locationName)) {
                const baseName = getBinBaseName(locationName);
                const section = extractBinSection(locationName);
                if (!binSections[baseName]) binSections[baseName] = { base_name: baseName, sections: [] };
                if (section) {
                    binSections[baseName].sections.push({
                        section, location_id: locationId, location_name: locationName,
                        record_count: groups[locationId].records.length
                    });
                }
            }
        }

        for (const baseName in binSections) {
            binSections[baseName].sections = sortBinSections(binSections[baseName].sections);
        }

        const result = [];
        const nonBinGroups = [];
        for (const locationId in groups) {
            const group = groups[locationId];
            if (isBinLocation(group.location_name)) result.push(group);
            else nonBinGroups.push(group);
        }

        result.sort((a, b) => {
            const numA = extractBinNumber(a.location_name);
            const numB = extractBinNumber(b.location_name);
            if (numA !== null && numB !== null) return numA - numB;
            if (numA !== null) return -1;
            if (numB !== null) return 1;
            return a.location_name.localeCompare(b.location_name);
        });

        nonBinGroups.sort((a, b) => a.location_name.localeCompare(b.location_name));

        const groupedBins = {};
        for (const group of result) {
            const baseName = getBinBaseName(group.location_name);
            if (!groupedBins[baseName]) groupedBins[baseName] = { base_name: baseName, locations: [] };
            groupedBins[baseName].locations.push(group);
        }

        const sortedBinKeys = Object.keys(groupedBins).sort((a, b) => {
            const numA = extractBinNumber(a);
            const numB = extractBinNumber(b);
            if (numA !== null && numB !== null) return numA - numB;
            if (numA !== null) return -1;
            if (numB !== null) return 1;
            return a.localeCompare(b);
        });

        const finalResult = [];
        for (const key of sortedBinKeys) {
            finalResult.push({ is_bin_section: true, base_name: key, locations: groupedBins[key].locations });
        }
        for (const group of nonBinGroups) {
            finalResult.push({
                is_bin_section: false, location_id: group.location_id,
                location_name: group.location_name, records: group.records
            });
        }
        return finalResult;
    }

    // ===== RENDER =====
    function renderRecords() {
        const list = document.getElementById('ebay-locations');
        if (!list) return;

        if (records.length === 0) {
            list.innerHTML = `<div style="text-align:center;padding:20px;color:#999;">No records found</div>`;
            return;
        }

        const locationGroups = groupRecordsByLocation(records);

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 8px; background: #f8f9fa; border-radius: 4px;">
                <span style="font-size: 13px; color: #666;">${records.length} total records</span>
                <span style="font-size: 12px; color: #888;">${records.filter(r => r._ebayPrice && r._ebayPrice > 0).length} priced</span>
            </div>
        `;

        for (const group of locationGroups) {
            if (group.is_bin_section) {
                const baseName = group.base_name;
                const locations = group.locations;
                const totalRecords = locations.reduce((sum, loc) => sum + loc.records.length, 0);
                const isSectionExpanded = expandedSections.has(baseName);
                const allSelected = locations.every(loc => selectedLocations.has(loc.location_id));
                const anySelected = locations.some(loc => selectedLocations.has(loc.location_id));

                html += `
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
                                ${locations.some(l => l.records.some(r => r._ebayPrice && r._ebayPrice > 0)) ? `
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
                        const locationId = loc.location_id;
                        const locationName = loc.location_name;
                        const locationRecords = loc.records;
                        const isExpanded = expandedLocations.has(locationId);
                        const isLocSelected = selectedLocations.has(locationId);
                        const withPrices = locationRecords.filter(r => r._ebayPrice && r._ebayPrice > 0);

                        html += `
                            <div style="border-top: 1px solid #dee2e6; padding-left: 20px; background: ${isLocSelected ? '#f8f9fa' : 'white'};">
                                <div style="display: flex; align-items: center; padding: 6px 12px; cursor: pointer;"
                                     onclick="ebayToggleLocation(${locationId})">
                                    <span style="font-size: 13px; margin-right: 8px; color: ${locationRecords.length > 0 ? '#333' : '#999'};">
                                        ${isExpanded ? '▼' : '▶'}
                                    </span>
                                    <input type="checkbox" style="margin-right: 10px; cursor: pointer;"
                                           ${isLocSelected ? 'checked' : ''}
                                           onclick="event.stopPropagation(); ebayToggleLocationSelection(${locationId})">
                                    <span style="flex: 1; font-weight: 500; color: #333; font-size: 13px;">${locationName}</span>
                                    <span style="display: flex; gap: 6px; align-items: center; font-size: 11px; margin-right: 8px;">
                                        <span style="background: #e9ecef; padding: 1px 10px; border-radius: 10px; color: #495057;">
                                            ${locationRecords.length} records
                                        </span>
                                        ${withPrices.length > 0 ? `
                                            <button onclick="event.stopPropagation(); ebayPostLocation(${locationId})"
                                                    style="padding: 2px 12px; background: #28a745; color: white; border: none; border-radius: 10px; cursor: pointer; font-size: 10px; font-weight: 600;">
                                                Post
                                            </button>
                                        ` : ''}
                                    </span>
                                </div>
                        `;

                        if (isExpanded) {
                            html += renderRecordsTable(locationRecords, 'small');
                        }
                        html += `</div>`;
                    }
                }
                html += `</div>`;
            } else {
                const locationId = group.location_id;
                const locationName = group.location_name;
                const locationRecords = group.records;
                const isExpanded = expandedLocations.has(locationId);
                const isSelected = selectedLocations.has(locationId);
                const withPrices = locationRecords.filter(r => r._ebayPrice && r._ebayPrice > 0);

                html += `
                    <div style="border: 1px solid #e9ecef; border-radius: 6px; margin-bottom: 6px; background: ${isSelected ? '#f0f8ff' : 'white'};">
                        <div style="display: flex; align-items: center; padding: 8px 12px; cursor: pointer; background: ${isExpanded ? '#f8f9fa' : 'white'}; border-radius: ${isExpanded ? '6px 6px 0 0' : '6px'};"
                             onclick="ebayToggleLocation(${locationId})">
                            <span style="font-size: 14px; margin-right: 8px; color: ${locationRecords.length > 0 ? '#333' : '#999'};">
                                ${isExpanded ? '▼' : '▶'}
                            </span>
                            <input type="checkbox" style="margin-right: 10px; cursor: pointer;"
                                   ${isSelected ? 'checked' : ''}
                                   onclick="event.stopPropagation(); ebayToggleLocationSelection(${locationId})">
                            <span style="flex: 1; font-weight: 600; color: #333; font-size: 14px;">${locationName}</span>
                            <span style="display: flex; gap: 6px; align-items: center; font-size: 12px; margin-right: 8px;">
                                <span style="background: #e9ecef; padding: 2px 10px; border-radius: 12px; color: #495057;">
                                    ${locationRecords.length} records
                                </span>
                                ${withPrices.length > 0 ? `
                                    <button onclick="event.stopPropagation(); ebayPostLocation(${locationId})"
                                            style="padding: 3px 14px; background: linear-gradient(135deg, #0064d2 0%, #004a99 100%); color: white; border: none; border-radius: 14px; cursor: pointer; font-size: 11px; font-weight: 600;">
                                        📤 Post
                                    </button>
                                ` : ''}
                            </span>
                        </div>
                `;

                if (isExpanded) {
                    html += renderRecordsTable(locationRecords, 'normal');
                }
                html += `</div>`;
            }
        }

        list.innerHTML = html;
        updateSelectionInfo();
        updateButtons();
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

    // ===== TOGGLES =====
    window.ebayToggleBinSection = function(baseName) {
        if (expandedSections.has(baseName)) expandedSections.delete(baseName);
        else expandedSections.add(baseName);
        renderRecords();
    };

    window.ebayToggleAllLocationsInBin = function(baseName) {
        const allLocations = [];
        for (const group of groupRecordsByLocation(records)) {
            if (group.is_bin_section && group.base_name === baseName) {
                for (const loc of group.locations) allLocations.push(loc.location_id);
                break;
            }
        }
        const allSelected = allLocations.every(id => selectedLocations.has(id));
        if (allSelected) {
            for (const id of allLocations) selectedLocations.delete(id);
        } else {
            for (const id of allLocations) selectedLocations.add(id);
        }
        renderRecords();
        updateSelectionInfo();
        updateButtons();
    };

    window.ebayToggleLocation = function(locationId) {
        if (expandedLocations.has(locationId)) expandedLocations.delete(locationId);
        else expandedLocations.add(locationId);
        renderRecords();
    };

    window.ebayToggleLocationSelection = function(locationId) {
        if (selectedLocations.has(locationId)) selectedLocations.delete(locationId);
        else selectedLocations.add(locationId);
        renderRecords();
        updateSelectionInfo();
        updateButtons();
    };

    window.ebayToggleAllLocations = function() {
        const selectAll = document.getElementById('ebay-select-all-locations');
        const isChecked = selectAll.checked;
        if (isChecked) {
            const locationIds = new Set();
            for (const r of records) if (r.location_id) locationIds.add(r.location_id);
            selectedLocations = locationIds;
        } else {
            selectedLocations.clear();
        }
        renderRecords();
        updateSelectionInfo();
        updateButtons();
    };

    function updateSelectionInfo() {
        const info = document.getElementById('ebay-selection-info');
        if (!info) return;
        let recordCount = 0;
        const grouped = groupRecordsByLocation(records);
        for (const locationId of selectedLocations) {
            const group = grouped.find(g => g.is_bin_section
                ? g.locations.some(l => l.location_id === locationId)
                : g.location_id === locationId);
            if (!group) continue;
            if (group.is_bin_section) {
                for (const loc of group.locations) {
                    if (loc.location_id === locationId) recordCount += loc.records.length;
                }
            } else {
                recordCount += group.records.length;
            }
        }
        info.textContent = `${selectedLocations.size} locations selected, ${recordCount} records`;
    }

    function updateButtons() {
        const postSelectedBtn = document.getElementById('ebay-post-selected-btn');
        const cancelBtn = document.getElementById('ebay-cancel-post-btn');

        let selectedPriced = 0;
        const grouped = groupRecordsByLocation(records);
        for (const locationId of selectedLocations) {
            const group = grouped.find(g => g.is_bin_section
                ? g.locations.some(l => l.location_id === locationId)
                : g.location_id === locationId);
            if (!group) continue;
            if (group.is_bin_section) {
                for (const loc of group.locations) {
                    if (loc.location_id === locationId) {
                        selectedPriced += loc.records.filter(r => r._ebayPrice && r._ebayPrice > 0).length;
                    }
                }
            } else {
                selectedPriced += group.records.filter(r => r._ebayPrice && r._ebayPrice > 0).length;
            }
        }

        if (postSelectedBtn) {
            postSelectedBtn.disabled = selectedLocations.size === 0 || selectedPriced === 0 || isPosting;
            if (selectedPriced > 0) {
                postSelectedBtn.textContent = `📤 Post Selected (${selectedPriced} records)`;
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
    window.ebayPostBinSection = async function(baseName) {
        if (isPosting) return;
        let recordsToPost = [];
        let locationNames = [];
        for (const group of groupRecordsByLocation(records)) {
            if (group.is_bin_section && group.base_name === baseName) {
                for (const loc of group.locations) {
                    recordsToPost = recordsToPost.concat(loc.records.filter(r => r._ebayPrice && r._ebayPrice > 0));
                    locationNames.push(loc.location_name);
                }
                break;
            }
        }
        if (recordsToPost.length === 0) {
            showStatus(`⚠️ No records with eBay prices in ${baseName}`, 'warning');
            return;
        }
        await confirmAndPost(recordsToPost, locationNames, baseName);
    };

    window.ebayPostLocation = async function(locationId) {
        if (isPosting) return;
        let recordsToPost = [];
        let locationName = '';
        const group = groupRecordsByLocation(records).find(g => g.is_bin_section
            ? g.locations.some(l => l.location_id === locationId)
            : g.location_id === locationId);
        if (!group) return;
        if (group.is_bin_section) {
            for (const loc of group.locations) {
                if (loc.location_id === locationId) {
                    recordsToPost = loc.records.filter(r => r._ebayPrice && r._ebayPrice > 0);
                    locationName = loc.location_name;
                    break;
                }
            }
        } else {
            recordsToPost = group.records.filter(r => r._ebayPrice && r._ebayPrice > 0);
            locationName = group.location_name;
        }
        if (recordsToPost.length === 0) {
            showStatus(`⚠️ No records with eBay prices in ${locationName}`, 'warning');
            return;
        }
        await confirmAndPost(recordsToPost, [locationName], locationName);
    };

    window.postSelectedEbayLocations = async function() {
        if (isPosting) return;
        if (selectedLocations.size === 0) {
            showStatus('⚠️ No locations selected', 'warning');
            return;
        }
        let recordsToPost = [];
        let locationNames = [];
        const grouped = groupRecordsByLocation(records);
        for (const locationId of selectedLocations) {
            const group = grouped.find(g => g.is_bin_section
                ? g.locations.some(l => l.location_id === locationId)
                : g.location_id === locationId);
            if (!group) continue;
            if (group.is_bin_section) {
                for (const loc of group.locations) {
                    if (loc.location_id === locationId) {
                        recordsToPost = recordsToPost.concat(loc.records.filter(r => r._ebayPrice && r._ebayPrice > 0));
                        locationNames.push(loc.location_name);
                    }
                }
            } else {
                recordsToPost = recordsToPost.concat(group.records.filter(r => r._ebayPrice && r._ebayPrice > 0));
                locationNames.push(group.location_name);
            }
        }
        if (recordsToPost.length === 0) {
            showStatus('⚠️ No records with eBay prices in selected locations', 'warning');
            return;
        }
        await confirmAndPost(recordsToPost, locationNames, `${selectedLocations.size} selected locations`);
    };

    async function confirmAndPost(recordsToPost, locationNames, scopeLabel) {
        if (!ebayConnected) {
            if (!confirm('⚠️ eBay is not connected. Continue anyway? (posting will likely fail)')) return;
        }
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

        if (hasLoadedOnce) window.loadPostEbayRecords();
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

    // ===== INIT =====
    window.initPostToEbay = function() {
        console.log('🛒 Post to eBay initialized (manual load mode)');

        records = [];
        selectedLocations.clear();
        expandedLocations.clear();
        expandedSections.clear();
        isLoadingRecords = false;
        hasLoadedOnce = false;

        const list = document.getElementById('ebay-locations');
        if (list) {
            list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">Click <strong>📥 Load Records</strong> above to fetch records for posting.</div>';
        }

        const statusDiv = document.getElementById('ebay-status');
        if (statusDiv) {
            statusDiv.style.display = 'none';
            statusDiv.innerHTML = '';
        }

        const info = document.getElementById('ebay-load-records-info');
        if (info) info.textContent = 'Click to fetch records from the server. This may take a moment.';

        updateLoadButtonState(false);
        updateButtons();

        refreshEbayConnectionStatus();

        fetchEbayConfig()
            .then(() => console.log('✅ eBay config loaded into inputs'))
            .catch(err => {
                console.error('❌ Failed to load eBay config on init:', err);
                showStatus(`❌ Could not load config: ${err.message}`, 'error');
            });

        updatePriceInfo();
    };

})();