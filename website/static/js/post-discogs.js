// ================================================================
// FILE: /static/js/post-discogs.js
// Post to Discogs page - Location-based display with section grouping
// Fixed: Bin sorting by numeric value
// Added: Section grouping (Bin 1 → Bin 1 LT, RT, LB, RB → records)
// ================================================================

(function() {
    'use strict';

    // ===== API BASE URL =====
    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    let records = [];
    let cutoffDate = null;
    let discogsMarkupPercent = 20;
    let discogsPriceStep = 2;
    let discogsMinMarkdown = -50;
    let isUpdating = false;
    let isPosting = false;
    let cancelPosting = false;
    
    // Location display state
    let expandedLocations = new Set();
    let selectedLocations = new Set();
    let expandedSections = new Set();

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // ===== FETCH CONFIG PARAMETERS (UNCHANGED) =====
    async function fetchDiscogsConfig() {
        try {
            let response = await fetch(`${API_BASE}/config/DISCOGS_MARKUP_PERCENT`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.config_value) {
                    discogsMarkupPercent = parseFloat(data.config_value);
                    document.getElementById('discogs-markup-percent').value = discogsMarkupPercent;
                }
            }

            response = await fetch(`${API_BASE}/config/DISCOGS_PRICE_STEP`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.config_value) {
                    discogsPriceStep = parseFloat(data.config_value);
                    document.getElementById('discogs-price-step').value = discogsPriceStep;
                }
            }

            response = await fetch(`${API_BASE}/config/DISCOGS_MIN_MARKDOWN`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.config_value !== null && data.config_value !== undefined) {
                    discogsMinMarkdown = parseFloat(data.config_value);
                    document.getElementById('discogs-min-markdown').value = discogsMinMarkdown;
                }
            }

            updatePriceInfo();
            return true;
        } catch (err) {
            console.warn('Error fetching Discogs config, using defaults:', err);
            return false;
        }
    }

    // ===== SAVE CONFIG PARAMETERS (UNCHANGED) =====
    async function saveDiscogsConfig() {
        try {
            let response = await fetch(`${API_BASE}/config/DISCOGS_MARKUP_PERCENT`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ config_value: discogsMarkupPercent })
            });
            
            if (!response.ok) {
                console.warn('Failed to save DISCOGS_MARKUP_PERCENT');
            }

            response = await fetch(`${API_BASE}/config/DISCOGS_PRICE_STEP`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ config_value: discogsPriceStep })
            });
            
            if (!response.ok) {
                console.warn('Failed to save DISCOGS_PRICE_STEP');
            }

            response = await fetch(`${API_BASE}/config/DISCOGS_MIN_MARKDOWN`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ config_value: discogsMinMarkdown })
            });
            
            if (!response.ok) {
                console.warn('Failed to save DISCOGS_MIN_MARKDOWN');
            }

            return true;
        } catch (err) {
            console.error('Error saving Discogs config:', err);
            return false;
        }
    }

    // ===== FETCH LAST_SEEN_CUTOFF_DATE FROM CONFIG (UNCHANGED) =====
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
                console.log('📅 LAST_SEEN_CUTOFF_DATE:', data.config_value);
                return data.config_value;
            }
            return null;
        } catch (err) {
            console.warn('Error fetching LAST_SEEN_CUTOFF_DATE:', err);
            return null;
        }
    }

    // ===== CHECK IF RECORD SHOULD BE VISIBLE (UNCHANGED) =====
    function isRecordVisible(record) {
        if (!cutoffDate) return true;
        if (!record.last_seen) return false;
        let lastSeenDate = record.last_seen;
        if (typeof lastSeenDate === 'string' && lastSeenDate.includes('T')) {
            lastSeenDate = lastSeenDate.split('T')[0];
        }
        return lastSeenDate >= cutoffDate;
    }

    // ===== CALCULATE DISCOGS PRICE WITH MARKDOWN (UNCHANGED) =====
    function calculateDiscogsPrice(record) {
        if (!record || !record.created_at || !record.store_price || record.store_price <= 0) {
            return null;
        }

        try {
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
            
            let markup = discogsMarkupPercent - (weeksOld * discogsPriceStep);
            markup = Math.max(discogsMinMarkdown, markup);
            
            const discogsPrice = record.store_price * (1 + markup / 100);
            
            return {
                discogs_price: Math.round(discogsPrice * 100) / 100,
                markup_percent: Math.round(markup * 10) / 10,
                days_old: daysOld,
                weeks_old: weeksOld
            };
        } catch (err) {
            console.error('Error calculating Discogs price for record', record.id, err);
            return null;
        }
    }

    // ===== UPDATE PRICE INFO DISPLAY (UNCHANGED) =====
    function updatePriceInfo() {
        const info = document.getElementById('price-calc-info');
        if (info) {
            const withPrices = records.filter(r => r._discogsPrice && r._discogsPrice > 0);
            info.textContent = `Markup: ${discogsMarkupPercent}% - ${discogsPriceStep}%/wk (floor: ${discogsMinMarkdown}%) | ${withPrices.length} records have prices`;
        }
    }

    // ===== CALCULATE DISCOGS PRICES FOR ALL RECORDS (UNCHANGED) =====
    function calculateDiscogsPricesForRecords(recordsToCalculate) {
        if (!recordsToCalculate || recordsToCalculate.length === 0) {
            return [];
        }

        console.log(`💰 Calculating Discogs prices for ${recordsToCalculate.length} records...`);

        return recordsToCalculate.map(r => {
            const priceData = calculateDiscogsPrice(r);
            if (priceData) {
                r._discogsPrice = priceData.discogs_price;
                r._markupPercent = priceData.markup_percent;
                r._daysOld = priceData.days_old;
                r._weeksOld = priceData.weeks_old;
            } else {
                r._discogsPrice = null;
                r._markupPercent = null;
                r._daysOld = null;
                r._weeksOld = null;
            }
            return r;
        });
    }

    // ===== UPDATE PRICES (called when parameters change) - UNCHANGED =====
    window.updateDiscogsPrices = async function() {
        if (isUpdating) return;
        isUpdating = true;

        const markupInput = document.getElementById('discogs-markup-percent');
        const stepInput = document.getElementById('discogs-price-step');
        const minInput = document.getElementById('discogs-min-markdown');
        
        const newMarkup = parseFloat(markupInput.value);
        const newStep = parseFloat(stepInput.value);
        const newMin = parseFloat(minInput.value);
        
        if (isNaN(newMarkup) || newMarkup < -100) {
            alert('Initial Markup must be a number (-100 to 200)');
            isUpdating = false;
            return;
        }
        if (isNaN(newStep) || newStep < 0) {
            alert('Weekly Step must be a positive number');
            isUpdating = false;
            return;
        }
        if (isNaN(newMin) || newMin > 0 || newMin < -100) {
            alert('Min Markdown must be between -100 and 0');
            isUpdating = false;
            return;
        }

        discogsMarkupPercent = newMarkup;
        discogsPriceStep = newStep;
        discogsMinMarkdown = newMin;

        await saveDiscogsConfig();

        records = calculateDiscogsPricesForRecords(records);
        renderRecords();
        updatePriceInfo();

        const withPrices = records.filter(r => r._discogsPrice && r._discogsPrice > 0);
        const withMarkdown = records.filter(r => r._markupPercent && r._markupPercent < 0);
        showStatus(`✅ Prices updated! ${withPrices.length} records have prices (${withMarkdown.length} on markdown)`, 'info');

        updateButtons();

        isUpdating = false;
    };

    // ===== FETCH ALL RECORDS WITH PAGINATION (UNCHANGED) =====
    async function fetchAllRecords() {
        let allRecords = [];
        let page = 1;
        const perPage = 100;
        let hasMore = true;

        console.log('📊 Fetching all records with pagination...');

        while (hasMore) {
            try {
                let url = `${API_BASE}/records?status_ids=2&limit=${perPage}&offset=${(page - 1) * perPage}`;
                
                if (cutoffDate) {
                    url += `&last_seen_after=${cutoffDate}`;
                }

                console.log(`📄 Fetching page ${page}...`);

                const response = await fetch(url, {
                    credentials: 'include',
                    mode: 'cors',
                    headers: getHeaders()
                });

                if (!response.ok) {
                    console.error(`Failed to fetch page ${page}:`, response.status);
                    break;
                }

                const data = await response.json();
                
                if (data.status === 'success') {
                    const records = data.records || [];
                    const total = data.total || 0;
                    
                    allRecords = allRecords.concat(records);
                    console.log(`📄 Page ${page}: ${records.length} records (total: ${allRecords.length}/${total})`);
                    
                    if (allRecords.length >= total || records.length < perPage) {
                        hasMore = false;
                        console.log(`✅ Fetched all ${allRecords.length} records`);
                    } else {
                        page++;
                    }
                } else {
                    console.error('API error:', data.error);
                    hasMore = false;
                }
            } catch (err) {
                console.error('Error fetching records page:', err);
                hasMore = false;
            }
        }

        return allRecords;
    }

    // ===== LOAD RECORDS (UNCHANGED) =====
    async function loadRecords() {
        const list = document.getElementById('post-discogs-locations');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading records...</div>';
        
        try {
            await fetchDiscogsConfig();
            
            let fetchedRecords = await fetchAllRecords();
            
            if (fetchedRecords.length === 0) {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #999;">
                    No records found${cutoffDate ? ` (seen after ${cutoffDate})` : ''}
                </div>`;
                return;
            }

            if (cutoffDate) {
                const beforeFilter = fetchedRecords.length;
                fetchedRecords = fetchedRecords.filter(record => isRecordVisible(record));
                console.log(`📅 Client-side cutoff filter: ${beforeFilter} → ${fetchedRecords.length} records`);
            }
            
            records = calculateDiscogsPricesForRecords(fetchedRecords);
            renderRecords();
            updatePriceInfo();
            
            const withPrices = records.filter(r => r._discogsPrice && r._discogsPrice > 0);
            const withMarkdown = records.filter(r => r._markupPercent && r._markupPercent < 0);
            const statusMsg = withPrices.length > 0 
                ? `Loaded ${records.length} records (${withPrices.length} with prices, ${withMarkdown.length} on markdown)`
                : `Loaded ${records.length} records but NONE have Discogs prices`;
            showStatus(statusMsg, withPrices.length > 0 ? 'info' : 'warning');
            
            updateButtons();

        } catch (err) {
            console.error('Error loading records:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // ===== EXTRACT BIN NUMBER FROM LOCATION NAME =====
    function extractBinNumber(locationName) {
        const match = locationName.match(/Bin\s*(\d+)/i);
        if (match) {
            return parseInt(match[1], 10);
        }
        return null;
    }

    // ===== EXTRACT BIN SECTION (LT, RT, LB, RB) =====
    function extractBinSection(locationName) {
        const match = locationName.match(/Bin\s*\d+\s*([A-Z]{2})/i);
        if (match) {
            return match[1].toUpperCase();
        }
        return null;
    }

    // ===== IS THIS A BIN LOCATION? =====
    function isBinLocation(locationName) {
        return /Bin\s*\d+/i.test(locationName);
    }

    // ===== GET BIN BASE NAME (without LT/RT/LB/RB) =====
    function getBinBaseName(locationName) {
        const match = locationName.match(/(Bin\s*\d+)/i);
        if (match) {
            return match[1];
        }
        return locationName;
    }

    // ===== SORT BIN SECTIONS (LT, RT, LB, RB order) =====
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

    // ===== GROUP RECORDS BY LOCATION WITH SECTION HIERARCHY =====
    function groupRecordsByLocation(recordsArray) {
        const groups = {};
        const binSections = {};
        
        for (const r of recordsArray) {
            const locationId = r.location_id || 0;
            const locationName = r.location_name || 'Unknown Location';
            
            if (!groups[locationId]) {
                groups[locationId] = {
                    location_id: locationId,
                    location_name: locationName,
                    records: []
                };
            }
            groups[locationId].records.push(r);
            
            // Track bin sections for bin grouping
            if (isBinLocation(locationName)) {
                const baseName = getBinBaseName(locationName);
                const section = extractBinSection(locationName);
                if (!binSections[baseName]) {
                    binSections[baseName] = {
                        base_name: baseName,
                        sections: []
                    };
                }
                if (section) {
                    binSections[baseName].sections.push({
                        section: section,
                        location_id: locationId,
                        location_name: locationName,
                        record_count: groups[locationId].records.length
                    });
                }
            }
        }
        
        // Sort sections within each bin
        for (const baseName in binSections) {
            binSections[baseName].sections = sortBinSections(binSections[baseName].sections);
        }
        
        // Build result: first list all bin sections, then non-bin locations
        const result = [];
        const nonBinGroups = [];
        
        for (const locationId in groups) {
            const group = groups[locationId];
            if (isBinLocation(group.location_name)) {
                result.push(group);
            } else {
                nonBinGroups.push(group);
            }
        }
        
        // Sort bin groups by numeric bin number
        result.sort((a, b) => {
            const numA = extractBinNumber(a.location_name);
            const numB = extractBinNumber(b.location_name);
            if (numA !== null && numB !== null) return numA - numB;
            if (numA !== null) return -1;
            if (numB !== null) return 1;
            return a.location_name.localeCompare(b.location_name);
        });
        
        // Sort non-bin groups alphabetically
        nonBinGroups.sort((a, b) => {
            return a.location_name.localeCompare(b.location_name);
        });
        
        // Combine: bins first (with their section structure), then non-bins
        // For bins, we need to group them by base name
        const groupedBins = {};
        for (const group of result) {
            const baseName = getBinBaseName(group.location_name);
            if (!groupedBins[baseName]) {
                groupedBins[baseName] = {
                    base_name: baseName,
                    locations: []
                };
            }
            groupedBins[baseName].locations.push(group);
        }
        
        // Sort bin groups by number
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
            finalResult.push({
                is_bin_section: true,
                base_name: key,
                locations: groupedBins[key].locations
            });
        }
        
        // Add non-bin locations
        for (const group of nonBinGroups) {
            finalResult.push({
                is_bin_section: false,
                location_id: group.location_id,
                location_name: group.location_name,
                records: group.records
            });
        }
        
        return finalResult;
    }

    // ===== RENDER RECORDS - LOCATION-BASED WITH SECTION HIERARCHY =====
    function renderRecords() {
        const list = document.getElementById('post-discogs-locations');
        if (!list) return;
        
        if (records.length === 0) {
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #999;">
                No records found${cutoffDate ? ` (seen after ${cutoffDate})` : ''}
            </div>`;
            return;
        }

        const locationGroups = groupRecordsByLocation(records);
        
        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 8px; background: #f8f9fa; border-radius: 4px;">
                <span style="font-size: 13px; color: #666;">
                    ${records.length} total records
                </span>
                <span style="font-size: 12px; color: #888;">
                    ${records.filter(r => r._discogsPrice && r._discogsPrice > 0).length} priced
                </span>
            </div>
        `;

        for (const group of locationGroups) {
            if (group.is_bin_section) {
                // === RENDER BIN SECTION (e.g., Bin 1 with LT, RT, LB, RB) ===
                const baseName = group.base_name;
                const locations = group.locations;
                const totalRecords = locations.reduce((sum, loc) => sum + loc.records.length, 0);
                const isSectionExpanded = expandedSections.has(baseName);
                
                // Check if any location in this bin is selected
                const isSelected = locations.some(loc => selectedLocations.has(loc.location_id));
                const allSelected = locations.every(loc => selectedLocations.has(loc.location_id));
                
                html += `
                    <div style="border: 2px solid #6c757d; border-radius: 8px; margin-bottom: 10px; background: ${isSelected ? '#f0f8ff' : 'white'};">
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
                                ${locations.some(l => l.records.some(r => r._discogsPrice && r._discogsPrice > 0)) ? `
                                    <button onclick="event.stopPropagation(); postBinSection('${baseName}')" 
                                            style="padding: 4px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 14px; cursor: pointer; font-size: 12px; font-weight: 600;">
                                        📤 Post This Bin
                                    </button>
                                ` : ''}
                            </span>
                        </div>
                `;

                // Render each location within the bin (LT, RT, LB, RB)
                if (isSectionExpanded) {
                    for (const loc of locations) {
                        const locationId = loc.location_id;
                        const locationName = loc.location_name;
                        const locationRecords = loc.records;
                        const isExpanded = expandedLocations.has(locationId);
                        const isLocSelected = selectedLocations.has(locationId);
                        const withPrices = locationRecords.filter(r => r._discogsPrice && r._discogsPrice > 0);
                        
                        html += `
                            <div style="border-top: 1px solid #dee2e6; padding-left: 20px; background: ${isLocSelected ? '#f8f9fa' : 'white'};">
                                <div style="display: flex; align-items: center; padding: 6px 12px; cursor: pointer;"
                                     onclick="toggleLocation(${locationId})">
                                    <span style="font-size: 13px; margin-right: 8px; color: ${locationRecords.length > 0 ? '#333' : '#999'};">
                                        ${isExpanded ? '▼' : '▶'}
                                    </span>
                                    <input type="checkbox" style="margin-right: 10px; cursor: pointer;" 
                                           ${isLocSelected ? 'checked' : ''} 
                                           onclick="event.stopPropagation(); toggleLocationSelection(${locationId})">
                                    <span style="flex: 1; font-weight: 500; color: #333; font-size: 13px;">
                                        ${locationName}
                                    </span>
                                    <span style="display: flex; gap: 6px; align-items: center; font-size: 11px; margin-right: 8px;">
                                        <span style="background: #e9ecef; padding: 1px 10px; border-radius: 10px; color: #495057;">
                                            ${locationRecords.length} records
                                        </span>
                                        ${withPrices.length > 0 ? `
                                            <button onclick="event.stopPropagation(); postLocation(${locationId})" 
                                                    style="padding: 2px 12px; background: #28a745; color: white; border: none; border-radius: 10px; cursor: pointer; font-size: 10px; font-weight: 600;">
                                                Post
                                            </button>
                                        ` : ''}
                                    </span>
                                </div>
                        `;

                        // Individual records table
                        if (isExpanded) {
                            html += `
                                <div style="padding: 6px 12px 10px 40px; border-top: 1px solid #f0f0f0; overflow-x: auto;">
                                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                        <thead>
                                            <tr style="background: #f1f3f5; border-bottom: 2px solid #dee2e6;">
                                                <th style="padding: 3px 6px; text-align: left; color: #495057; font-weight: 600;">ID</th>
                                                <th style="padding: 3px 6px; text-align: left; color: #495057; font-weight: 600;">Artist</th>
                                                <th style="padding: 3px 6px; text-align: left; color: #495057; font-weight: 600;">Title</th>
                                                <th style="padding: 3px 6px; text-align: right; color: #495057; font-weight: 600;">Store</th>
                                                <th style="padding: 3px 6px; text-align: right; color: #28a745; font-weight: 600;">Discogs</th>
                                                <th style="padding: 3px 6px; text-align: center; color: #495057; font-weight: 600;">Markup</th>
                                                <th style="padding: 3px 6px; text-align: center; color: #495057; font-weight: 600;">Age</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                            `;

                            const sortedRecords = [...locationRecords].sort((a, b) => {
                                if (a.location_index && b.location_index) {
                                    return a.location_index - b.location_index;
                                }
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
                                        <td style="padding: 3px 6px; color: #666; font-size: 10px;">${r.id}</td>
                                        <td style="padding: 3px 6px; color: #333;">${r.artist || 'Unknown'}</td>
                                        <td style="padding: 3px 6px; color: #333;">${r.title || 'Unknown'}</td>
                                        <td style="padding: 3px 6px; text-align: right; color: #666;">${r.store_price ? '$' + r.store_price.toFixed(2) : '—'}</td>
                                        <td style="padding: 3px 6px; text-align: right; color: ${hasPrice ? (isMarkdown ? '#dc3545' : '#28a745') : '#999'}; font-weight: 600;">
                                            ${hasPrice ? '$' + discogsPrice.toFixed(2) : '—'}
                                        </td>
                                        <td style="padding: 3px 6px; text-align: center; color: ${hasPrice ? markupColor : '#999'}; font-weight: 600;">
                                            ${markupText}
                                        </td>
                                        <td style="padding: 3px 6px; text-align: center; color: #999; font-size: 9px;">${ageText}</td>
                                    </tr>
                                `;
                            }

                            html += `
                                        </tbody>
                                    </table>
                                </div>
                            `;
                        }

                        html += `</div>`;
                    }
                }

                html += `</div>`;
                
            } else {
                // === RENDER NON-BIN LOCATION (Walls, Displays, etc.) ===
                const locationId = group.location_id;
                const locationName = group.location_name;
                const locationRecords = group.records;
                const isExpanded = expandedLocations.has(locationId);
                const isSelected = selectedLocations.has(locationId);
                const withPrices = locationRecords.filter(r => r._discogsPrice && r._discogsPrice > 0);
                
                html += `
                    <div style="border: 1px solid #e9ecef; border-radius: 6px; margin-bottom: 6px; background: ${isSelected ? '#f0f8ff' : 'white'};">
                        <div style="display: flex; align-items: center; padding: 8px 12px; cursor: pointer; background: ${isExpanded ? '#f8f9fa' : 'white'}; border-radius: ${isExpanded ? '6px 6px 0 0' : '6px'};"
                             onclick="toggleLocation(${locationId})">
                            <span style="font-size: 14px; margin-right: 8px; color: ${locationRecords.length > 0 ? '#333' : '#999'};">
                                ${isExpanded ? '▼' : '▶'}
                            </span>
                            <input type="checkbox" style="margin-right: 10px; cursor: pointer;" 
                                   ${isSelected ? 'checked' : ''} 
                                   onclick="event.stopPropagation(); toggleLocationSelection(${locationId})">
                            <span style="flex: 1; font-weight: 600; color: #333; font-size: 14px;">
                                ${locationName}
                            </span>
                            <span style="display: flex; gap: 6px; align-items: center; font-size: 12px; margin-right: 8px;">
                                <span style="background: #e9ecef; padding: 2px 10px; border-radius: 12px; color: #495057;">
                                    ${locationRecords.length} records
                                </span>
                                ${withPrices.length > 0 ? `
                                    <button onclick="event.stopPropagation(); postLocation(${locationId})" 
                                            style="padding: 3px 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 14px; cursor: pointer; font-size: 11px; font-weight: 600;">
                                        📤 Post
                                    </button>
                                ` : ''}
                            </span>
                        </div>
                `;

                if (isExpanded) {
                    html += `
                        <div style="padding: 10px 12px 12px 36px; border-top: 1px solid #e9ecef; overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                                <thead>
                                    <tr style="background: #f1f3f5; border-bottom: 2px solid #dee2e6;">
                                        <th style="padding: 4px 8px; text-align: left; color: #495057; font-weight: 600; font-size: 11px;">ID</th>
                                        <th style="padding: 4px 8px; text-align: left; color: #495057; font-weight: 600; font-size: 11px;">Artist</th>
                                        <th style="padding: 4px 8px; text-align: left; color: #495057; font-weight: 600; font-size: 11px;">Title</th>
                                        <th style="padding: 4px 8px; text-align: right; color: #495057; font-weight: 600; font-size: 11px;">Store</th>
                                        <th style="padding: 4px 8px; text-align: right; color: #28a745; font-weight: 600; font-size: 11px;">Discogs</th>
                                        <th style="padding: 4px 8px; text-align: center; color: #495057; font-weight: 600; font-size: 11px;">Markup</th>
                                        <th style="padding: 4px 8px; text-align: center; color: #495057; font-weight: 600; font-size: 11px;">Age</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;

                    const sortedRecords = [...locationRecords].sort((a, b) => {
                        if (a.location_index && b.location_index) {
                            return a.location_index - b.location_index;
                        }
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
                                <td style="padding: 4px 8px; color: #666; font-size: 11px;">${r.id}</td>
                                <td style="padding: 4px 8px; color: #333;">${r.artist || 'Unknown'}</td>
                                <td style="padding: 4px 8px; color: #333;">${r.title || 'Unknown'}</td>
                                <td style="padding: 4px 8px; text-align: right; color: #666;">${r.store_price ? '$' + r.store_price.toFixed(2) : '—'}</td>
                                <td style="padding: 4px 8px; text-align: right; color: ${hasPrice ? (isMarkdown ? '#dc3545' : '#28a745') : '#999'}; font-weight: 600;">
                                    ${hasPrice ? '$' + discogsPrice.toFixed(2) : '—'}
                                </td>
                                <td style="padding: 4px 8px; text-align: center; color: ${hasPrice ? markupColor : '#999'}; font-weight: 600;">
                                    ${markupText}
                                </td>
                                <td style="padding: 4px 8px; text-align: center; color: #999; font-size: 10px;">${ageText}</td>
                            </tr>
                        `;
                    }

                    html += `
                                </tbody>
                            </table>
                        </div>
                    `;
                }

                html += `</div>`;
            }
        }

        list.innerHTML = html;
        updateSelectionInfo();
        updateButtons();
    }

    // ===== TOGGLE BIN SECTION EXPANSION =====
    window.toggleBinSection = function(baseName) {
        if (expandedSections.has(baseName)) {
            expandedSections.delete(baseName);
        } else {
            expandedSections.add(baseName);
        }
        renderRecords();
    };

    // ===== TOGGLE ALL LOCATIONS IN A BIN =====
    window.toggleAllLocationsInBin = function(baseName) {
        // Find all locations in this bin
        const allLocations = [];
        for (const group of groupRecordsByLocation(records)) {
            if (group.is_bin_section && group.base_name === baseName) {
                for (const loc of group.locations) {
                    allLocations.push(loc.location_id);
                }
                break;
            }
        }
        
        // Check if all are selected
        const allSelected = allLocations.every(id => selectedLocations.has(id));
        
        if (allSelected) {
            for (const id of allLocations) {
                selectedLocations.delete(id);
            }
        } else {
            for (const id of allLocations) {
                selectedLocations.add(id);
            }
        }
        
        renderRecords();
        updateSelectionInfo();
        updateButtons();
    };

    // ===== POST ENTIRE BIN SECTION =====
    window.postBinSection = async function(baseName) {
        if (isPosting) return;
        
        // Find all locations in this bin
        let recordsToPost = [];
        let locationNames = [];
        for (const group of groupRecordsByLocation(records)) {
            if (group.is_bin_section && group.base_name === baseName) {
                for (const loc of group.locations) {
                    const withPrices = loc.records.filter(r => r._discogsPrice && r._discogsPrice > 0);
                    recordsToPost = recordsToPost.concat(withPrices);
                    locationNames.push(loc.location_name);
                }
                break;
            }
        }
        
        if (recordsToPost.length === 0) {
            showStatus(`⚠️ No records with Discogs prices in ${baseName}`, 'warning');
            return;
        }

        const withMarkdown = recordsToPost.filter(r => r._markupPercent && r._markupPercent < 0);
        let confirmMsg = `Post ${recordsToPost.length} record(s) from ${baseName} to Discogs?\n\n`;
        confirmMsg += `Locations: ${locationNames.join(', ')}\n`;
        confirmMsg += `Markup: ${discogsMarkupPercent}% - ${discogsPriceStep}%/wk (floor: ${discogsMinMarkdown}%)\n`;
        confirmMsg += `${withMarkdown.length} records will be on markdown (${discogsMinMarkdown}% floor)`;

        if (!confirm(confirmMsg)) return;

        await postRecords(recordsToPost);
    };

    // ===== TOGGLE LOCATION EXPANSION =====
    window.toggleLocation = function(locationId) {
        if (expandedLocations.has(locationId)) {
            expandedLocations.delete(locationId);
        } else {
            expandedLocations.add(locationId);
        }
        renderRecords();
    };

    // ===== TOGGLE LOCATION SELECTION =====
    window.toggleLocationSelection = function(locationId) {
        if (selectedLocations.has(locationId)) {
            selectedLocations.delete(locationId);
        } else {
            selectedLocations.add(locationId);
        }
        renderRecords();
        updateSelectionInfo();
        updateButtons();
    };

    // ===== TOGGLE ALL LOCATIONS =====
    window.toggleAllLocations = function() {
        const selectAll = document.getElementById('select-all-locations');
        const isChecked = selectAll.checked;
        
        if (isChecked) {
            const locationIds = new Set();
            for (const r of records) {
                if (r.location_id) {
                    locationIds.add(r.location_id);
                }
            }
            selectedLocations = locationIds;
        } else {
            selectedLocations.clear();
        }
        
        renderRecords();
        updateSelectionInfo();
        updateButtons();
    };

    // ===== UPDATE SELECTION INFO =====
    function updateSelectionInfo() {
        const info = document.getElementById('selection-info');
        if (!info) return;
        
        let selectedCount = selectedLocations.size;
        let recordCount = 0;
        
        for (const locationId of selectedLocations) {
            const group = groupRecordsByLocation(records).find(g => {
                if (g.is_bin_section) {
                    return g.locations.some(l => l.location_id === locationId);
                }
                return g.location_id === locationId;
            });
            if (group) {
                if (group.is_bin_section) {
                    for (const loc of group.locations) {
                        if (loc.location_id === locationId) {
                            recordCount += loc.records.length;
                        }
                    }
                } else {
                    recordCount += group.records.length;
                }
            }
        }
        
        info.textContent = `${selectedCount} locations selected, ${recordCount} records`;
    }

    // ===== UPDATE BUTTONS =====
    function updateButtons() {
        const postSelectedBtn = document.getElementById('post-selected-btn');
        const cancelBtn = document.getElementById('cancel-post-btn');
        
        let selectedPriced = 0;
        for (const locationId of selectedLocations) {
            const group = groupRecordsByLocation(records).find(g => {
                if (g.is_bin_section) {
                    return g.locations.some(l => l.location_id === locationId);
                }
                return g.location_id === locationId;
            });
            if (group) {
                if (group.is_bin_section) {
                    for (const loc of group.locations) {
                        if (loc.location_id === locationId) {
                            selectedPriced += loc.records.filter(r => r._discogsPrice && r._discogsPrice > 0).length;
                        }
                    }
                } else {
                    selectedPriced += group.records.filter(r => r._discogsPrice && r._discogsPrice > 0).length;
                }
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

    // ===== POST SELECTED LOCATIONS =====
    window.postSelectedLocations = async function() {
        if (isPosting) return;
        if (selectedLocations.size === 0) {
            showStatus('⚠️ No locations selected', 'warning');
            return;
        }

        let recordsToPost = [];
        let locationNames = [];
        for (const locationId of selectedLocations) {
            const group = groupRecordsByLocation(records).find(g => {
                if (g.is_bin_section) {
                    return g.locations.some(l => l.location_id === locationId);
                }
                return g.location_id === locationId;
            });
            if (group) {
                if (group.is_bin_section) {
                    for (const loc of group.locations) {
                        if (loc.location_id === locationId) {
                            const withPrices = loc.records.filter(r => r._discogsPrice && r._discogsPrice > 0);
                            recordsToPost = recordsToPost.concat(withPrices);
                            locationNames.push(loc.location_name);
                        }
                    }
                } else {
                    const withPrices = group.records.filter(r => r._discogsPrice && r._discogsPrice > 0);
                    recordsToPost = recordsToPost.concat(withPrices);
                    locationNames.push(group.location_name);
                }
            }
        }

        if (recordsToPost.length === 0) {
            showStatus('⚠️ No records with Discogs prices in selected locations', 'warning');
            return;
        }

        const withMarkdown = recordsToPost.filter(r => r._markupPercent && r._markupPercent < 0);
        let confirmMsg = `Post ${recordsToPost.length} record(s) from ${selectedLocations.size} selected location(s) to Discogs?\n\n`;
        confirmMsg += `Locations: ${locationNames.join(', ')}\n`;
        confirmMsg += `Markup: ${discogsMarkupPercent}% - ${discogsPriceStep}%/wk (floor: ${discogsMinMarkdown}%)\n`;
        confirmMsg += `${withMarkdown.length} records will be on markdown (${discogsMinMarkdown}% floor)`;

        if (!confirm(confirmMsg)) return;

        await postRecords(recordsToPost);
    };

    // ===== POST A SINGLE LOCATION =====
    window.postLocation = async function(locationId) {
        if (isPosting) return;
        
        let recordsToPost = [];
        let locationName = '';
        
        const group = groupRecordsByLocation(records).find(g => {
            if (g.is_bin_section) {
                return g.locations.some(l => l.location_id === locationId);
            }
            return g.location_id === locationId;
        });
        if (!group) return;
        
        if (group.is_bin_section) {
            for (const loc of group.locations) {
                if (loc.location_id === locationId) {
                    const withPrices = loc.records.filter(r => r._discogsPrice && r._discogsPrice > 0);
                    recordsToPost = recordsToPost.concat(withPrices);
                    locationName = loc.location_name;
                    break;
                }
            }
        } else {
            const withPrices = group.records.filter(r => r._discogsPrice && r._discogsPrice > 0);
            recordsToPost = recordsToPost.concat(withPrices);
            locationName = group.location_name;
        }
        
        if (recordsToPost.length === 0) {
            showStatus(`⚠️ No records with Discogs prices in ${locationName}`, 'warning');
            return;
        }

        const withMarkdown = recordsToPost.filter(r => r._markupPercent && r._markupPercent < 0);
        let confirmMsg = `Post ${recordsToPost.length} record(s) from ${locationName} to Discogs?\n\n`;
        confirmMsg += `Markup: ${discogsMarkupPercent}% - ${discogsPriceStep}%/wk (floor: ${discogsMinMarkdown}%)\n`;
        confirmMsg += `${withMarkdown.length} records will be on markdown (${discogsMinMarkdown}% floor)`;

        if (!confirm(confirmMsg)) return;

        await postRecords(recordsToPost);
    };

    // ===== CANCEL POSTING =====
    window.cancelPosting = function() {
        if (isPosting) {
            cancelPosting = true;
            showStatus('⏹️ Cancelling... Please wait for current record to finish', 'warning');
            document.getElementById('cancel-post-btn').disabled = true;
        }
    };

    // ===== POST RECORDS WITH PROGRESS =====
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
                const recordLocation = record.location_name || '';

                await fetch(`${API_BASE}/records/${record.id}`, {
                    method: 'PUT',
                    credentials: 'include',
                    mode: 'cors',
                    headers: getHeaders(),
                    body: JSON.stringify({ location: recordLocation })
                });

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
                        location: recordLocation
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
                await new Promise(resolve => setTimeout(resolve, 1000));
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
        
        loadRecords();
    }

    // ===== SHOW STATUS =====
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

    // ===== INIT =====
    window.initPostDiscogs = function() {
        console.log('📀 Post to Discogs initialized - Location-based display with section grouping');
        
        fetchLastSeenCutoff().then(date => {
            cutoffDate = date;
            console.log('📅 Post Discogs using cutoff date:', cutoffDate || 'None (showing all)');
            loadRecords();
        });
    };

})();