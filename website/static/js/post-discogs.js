// Post to Discogs page
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
    let discogsMinMarkdown = -50;  // Minimum markup (floor) - e.g., -50% means 50% off
    let isUpdating = false;

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // ===== FETCH CONFIG PARAMETERS =====
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

            // Fetch DISCOGS_MIN_MARKDOWN (new parameter)
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

    // ===== SAVE CONFIG PARAMETERS =====
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
                console.log('📅 LAST_SEEN_CUTOFF_DATE:', data.config_value);
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

    // ===== CALCULATE DISCOGS PRICE WITH MARKDOWN =====
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
            
            if (isNaN(createdDate.getTime())) {
                return null;
            }

            const today = new Date();
            const daysOld = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
            const weeksOld = Math.floor(daysOld / 7);
            
            // Calculate markup: initial markup - (weeks * weekly step)
            // Clamp to min_markdown (floor)
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

    // ===== UPDATE PRICE INFO DISPLAY =====
    function updatePriceInfo() {
        const info = document.getElementById('price-calc-info');
        if (info) {
            const withPrices = records.filter(r => r._discogsPrice && r._discogsPrice > 0);
            info.textContent = `Markup: ${discogsMarkupPercent}% - ${discogsPriceStep}%/wk (floor: ${discogsMinMarkdown}%) | ${withPrices.length} records have prices`;
        }
    }

    // ===== CALCULATE DISCOGS PRICES FOR ALL RECORDS =====
    function calculateDiscogsPricesForRecords(recordsToCalculate) {
        if (!recordsToCalculate || recordsToCalculate.length === 0) {
            return [];
        }

        console.log(`💰 Calculating Discogs prices for ${recordsToCalculate.length} records...`);
        console.log(`   Initial Markup: ${discogsMarkupPercent}%`);
        console.log(`   Weekly Step: ${discogsPriceStep}%`);
        console.log(`   Min Markdown: ${discogsMinMarkdown}%`);

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

    // ===== UPDATE PRICES (called when parameters change) =====
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

        // Save to server
        await saveDiscogsConfig();

        // Recalculate prices
        records = calculateDiscogsPricesForRecords(records);
        renderRecords();
        updatePriceInfo();

        const withPrices = records.filter(r => r._discogsPrice && r._discogsPrice > 0);
        const withMarkdown = records.filter(r => r._markupPercent && r._markupPercent < 0);
        showStatus(`✅ Prices updated! ${withPrices.length} records have prices (${withMarkdown.length} on markdown)`, 'info');

        const btn = document.getElementById('post-discogs-btn');
        if (btn) {
            if (withPrices.length > 0) {
                btn.disabled = false;
                btn.textContent = `📤 Post All ${withPrices.length} Records to Discogs`;
            } else {
                btn.disabled = true;
                btn.textContent = '📤 No Records with Discogs Prices';
            }
        }

        isUpdating = false;
    };

    // ===== FETCH ALL RECORDS WITH PAGINATION =====
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

    // Load records
    async function loadRecords() {
        const list = document.getElementById('post-discogs-records');
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
                ? `Loaded ${records.length} records (${withPrices.length} with prices, ${withMarkdown.length} on markdown) | Markup: ${discogsMarkupPercent}% -${discogsPriceStep}%/wk (floor: ${discogsMinMarkdown}%)`
                : `Loaded ${records.length} records but NONE have Discogs prices`;
            showStatus(statusMsg, withPrices.length > 0 ? 'info' : 'warning');
            
            const btn = document.getElementById('post-discogs-btn');
            if (btn) {
                if (withPrices.length > 0) {
                    btn.disabled = false;
                    btn.textContent = `📤 Post All ${withPrices.length} Records to Discogs`;
                } else {
                    btn.disabled = true;
                    btn.textContent = '📤 No Records with Discogs Prices';
                }
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
                    <th style="padding: 6px 8px; text-align: center; color: #666; font-size: 10px;">Age</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Location</th>
                </tr>
            </thead>
            <tbody>`;
        
        records.forEach((r) => {
            const hasPrice = r._discogsPrice && r._discogsPrice > 0;
            const discogsPrice = hasPrice ? r._discogsPrice : '—';
            const markup = r._markupPercent || 0;
            const isMarkdown = markup < 0;
            const markupColor = isMarkdown ? '#dc3545' : (markup > 0 ? '#28a745' : '#ffc107');
            const markupText = hasPrice ? (markup > 0 ? `+${markup}%` : markup < 0 ? `${markup}%` : '0%') : '—';
            const rowStyle = hasPrice ? (isMarkdown ? 'background: #fff5f5;' : '') : 'opacity: 0.4;';
            const ageText = hasPrice ? `${r._daysOld}d` : '—';
            
            html += `<tr style="${rowStyle}">
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${r.id}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${r.artist || 'Unknown'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${r.title || 'Unknown'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${r.store_price ? '$' + r.store_price.toFixed(2) : '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: ${hasPrice ? (isMarkdown ? '#dc3545' : '#28a745') : '#999'}; font-weight: 600;">${hasPrice ? '$' + discogsPrice.toFixed(2) : '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center; color: ${hasPrice ? markupColor : '#999'}; font-weight: 600;">${markupText}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center; color: #666; font-size: 10px;">${ageText}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 11px;">${r.location_name || '—'}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // ===== POST ALL RECORDS WITH PROGRESS =====
    window.postDiscogsAll = async function() {
        const postableRecords = records.filter(r => r._discogsPrice && r._discogsPrice > 0);
        
        if (postableRecords.length === 0) {
            alert('No records have a valid Discogs price to post.');
            return;
        }

        const withMarkdown = postableRecords.filter(r => r._markupPercent && r._markupPercent < 0);
        let confirmMsg = `Post ${postableRecords.length} record(s) to Discogs?\n\n`;
        confirmMsg += `Markup: ${discogsMarkupPercent}% - ${discogsPriceStep}%/wk (floor: ${discogsMinMarkdown}%)\n`;
        confirmMsg += `${withMarkdown.length} records will be on markdown (${discogsMinMarkdown}% floor)`;

        if (!confirm(confirmMsg)) {
            return;
        }

        const statusDiv = document.getElementById('post-discogs-status');
        const btn = document.getElementById('post-discogs-btn');
        
        if (btn) btn.disabled = true;

        let success = 0;
        let failed = 0;

        for (let i = 0; i < postableRecords.length; i++) {
            const record = postableRecords[i];
            const current = i + 1;
            const total = postableRecords.length;
            const isMarkdown = record._markupPercent && record._markupPercent < 0;
            const priceColor = isMarkdown ? '#dc3545' : '#28a745';
            
            if (statusDiv) {
                statusDiv.style.display = 'block';
                statusDiv.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 6px; padding: 4px 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span>
                                ⏳ Posting ${current}/${total}: 
                                <strong>${record.artist || 'Unknown'} - ${record.title || 'Unknown'}</strong>
                                (ID: ${record.id}) 
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
                        <div style="font-size: 11px; color: #888;">
                            ✅ ${success} posted | ❌ ${failed} failed
                        </div>
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
            statusDiv.innerHTML = message;
            statusDiv.className = 'status-message status-success';
            if (failed > 0 && success === 0) {
                statusDiv.className = 'status-message status-error';
            } else if (failed > 0) {
                statusDiv.className = 'status-message status-warning';
            }
        }
        
        if (btn) {
            btn.disabled = false;
            btn.textContent = `📤 Post All ${postableRecords.length} Records to Discogs`;
        }
        
        loadRecords();
    };

    // Show status
    function showStatus(message, type) {
        const statusDiv = document.getElementById('post-discogs-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.className = `status-message status-${type}`;
        setTimeout(() => { statusDiv.style.display = 'none'; }, 8000);
    }

    // Init
    window.initPostDiscogs = function() {
        console.log('📀 Post to Discogs initialized - with markdown support');
        
        fetchLastSeenCutoff().then(date => {
            cutoffDate = date;
            console.log('📅 Post Discogs using cutoff date:', cutoffDate || 'None (showing all)');
            loadRecords();
        });
    };
})();