// ================================================================
// FILE: /static/js/post-to-ebay.js
// Post to eBay page - counts-first, lazy-load records per location
//
// Tree is built from /api/locations using parent_id, so any level
// of the hierarchy can be posted (root, parent, leaf).
// ================================================================

(function() {
    'use strict';

    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    const EBAY_POST_DELAY_MS = 1000;

    let locationTree = [];
    let locationById = {};
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

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
        const totalEligible = locationTree.reduce((s, n) => s + n.subtree_count, 0);
        info.textContent = `Markup: ${ebayMarkupPercent}% - ${ebayPriceStep}%/wk (max markdown: ${ebayMaxMarkdown}%) | ${totalEligible} eligible records across ${Object.keys(locationById).length} locations`;
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
    // LOAD LOCATIONS
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

    async function fetchLocationRows() {
        const url = `${API_BASE}/api/locations`;
        const response = await fetch(url, {
            credentials: 'include',
            mode: 'cors',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`Failed to fetch locations (HTTP ${response.status})`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || 'Locations API error');
        return data.locations || [];
    }

    function buildLocationTree(rows) {
        const byId = {};
        rows.forEach(r => {
            byId[r.id] = {
                id: r.id,
                name: r.name,
                display_name: r.display_name || r.name,
                parent_id: r.parent_id,
                parent_name: r.parent_name,
                record_count: r.record_count || 0,
                subtree_count: r.record_count || 0,
                children: []
            };
        });

        const roots = [];
        rows.forEach(r => {
            const node = byId[r.id];
            if (r.parent_id && byId[r.parent_id]) {
                byId[r.parent_id].children.push(node);
            } else {
                roots.push(node);
            }
        });

        function sortSiblings(nodes) {
            nodes.sort((a, b) =>
                a.display_name.localeCompare(b.display_name, undefined, { numeric: true })
            );
            nodes.forEach(n => sortSiblings(n.children));
        }
        sortSiblings(roots);

        function computeSubtree(nodes) {
            nodes.forEach(n => {
                computeSubtree(n.children);
                n.subtree_count = n.record_count +
                    n.children.reduce((sum, c) => sum + c.subtree_count, 0);
            });
        }
        computeSubtree(roots);

        return { roots, byId };
    }

    function findNode(id) {
        return locationById[id] || null;
    }

    function collectSubtreeIds(node) {
        const ids = [];
        function walk(n) {
            ids.push(n.id);
            n.children.forEach(walk);
        }
        walk(node);
        return ids;
    }

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

            showLoadProgressBar('📥 Loading locations...', 0, 0, '');
            const rows = await fetchLocationRows();
            const { roots, byId } = buildLocationTree(rows);
            locationTree = roots;
            locationById = byId;

            recordsByLocation.clear();
            selectedLocations = new Set([...selectedLocations].filter(id => byId[id]));
            expandedLocations = new Set([...expandedLocations].filter(id => byId[id]));

            if (locationTree.length === 0) {
                if (list) list.innerHTML = `<div style="text-align:center;padding:20px;color:#999;">No locations found</div>`;
                showLoadProgressBar('✅ Loaded (empty)', 0, 0, '');
                return;
            }

            renderRecords();
            updatePriceInfo();

            const totalEligible = locationTree.reduce((s, n) => s + n.subtree_count, 0);
            showStatus(
                `✅ Loaded ${Object.keys(locationById).length} locations (${totalEligible} eligible records). Expand any level to load its records.`,
                'info'
            );

            hasLoadedOnce = true;
            updateButtons();

        } catch (err) {
            console.error('❌ Error loading locations:', err);
            showLoadError(err.message || 'Failed to load locations');
            if (list) {
                list.innerHTML = `<div style="text-align:center;padding:20px;color:#dc3545;">Error: ${escapeHtml(err.message)}</div>`;
            }
        } finally {
            isLoadingLocations = false;
        }
    }

    // ----------------------------------------------------------------
    // LAZY-LOAD RECORDS
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

    async function ensureRecordsForSubtree(node, progress) {
        const leaves = [];
        function collectLeaves(n) {
            if (n.children.length === 0) leaves.push(n);
            else n.children.forEach(collectLeaves);
        }
        collectLeaves(node);

        const all = [];
        for (let i = 0; i < leaves.length; i++) {
            const leaf = leaves[i];
            const recs = await ensureRecordsForLocation(leaf.id);
            all.push(...recs);
            if (progress) progress(i + 1, leaves.length, leaf.display_name);
        }
        return all;
    }

    // ----------------------------------------------------------------
    // RENDER
    // ----------------------------------------------------------------

    function renderRecords() {
        const list = document.getElementById('ebay-locations');
        if (!list) return;

        if (locationTree.length === 0) {
            list.innerHTML = `<div style="text-align:center;padding:20px;color:#999;">No locations loaded</div>`;
            return;
        }

        const totalEligible = locationTree.reduce((s, n) => s + n.subtree_count, 0);
        const totalLocations = Object.keys(locationById).length;

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 8px; background: #f8f9fa; border-radius: 4px;">
                <span style="font-size: 13px; color: #666;">${totalEligible} eligible records across ${totalLocations} locations</span>
                <span style="font-size: 12px; color: #888;">${recordsByLocation.size} location(s) loaded</span>
            </div>
        `;

        for (const node of locationTree) html += renderNode(node, 0);

        list.innerHTML = html;
        updateSelectionInfo();
        updateButtons();
    }

    function renderNode(node, depth) {
        const isLeaf = node.children.length === 0;
        if (isLeaf) return renderLeafRow(node, depth);
        return renderParentNode(node, depth);
    }

    function renderParentNode(node, depth) {
        const isExpanded = expandedLocations.has(node.id);
        const subtreeRecords = node.subtree_count;
        const directRecords = node.record_count;

        const nodeIds = collectSubtreeIds(node);
        const allSelected = nodeIds.length > 0 && nodeIds.every(id => selectedLocations.has(id));
        const anySelected = nodeIds.some(id => selectedLocations.has(id));
        const totalSelectedRecords = nodeIds
            .filter(id => selectedLocations.has(id))
            .reduce((s, id) => s + (findNode(id)?.subtree_count || 0), 0);

        const indent = depth * 16;
        const childLabel = node.children.length === 1 ? 'child' : 'children';

        let html = `
            <div style="border: 2px solid #6c757d; border-radius: 8px; margin-bottom: 8px; margin-left: ${indent}px; background: ${anySelected ? '#f0f8ff' : 'white'};">
                <div style="display: flex; align-items: center; padding: 10px 14px; cursor: pointer; background: ${isExpanded ? '#e9ecef' : 'white'}; border-radius: ${isExpanded ? '8px 8px 0 0' : '8px'};"
                     onclick="ebayToggleLocation(${node.id})">
                    <span style="font-size: 14px; margin-right: 10px; color: #333;">
                        ${isExpanded ? '▼' : '▶'}
                    </span>
                    <input type="checkbox"
                           style="margin-right: 12px; cursor: pointer; width: 16px; height: 16px;"
                           ${allSelected ? 'checked' : ''}
                           onclick="event.stopPropagation(); ebayToggleLocationSelection(${node.id})">
                    <span style="flex: 1; font-weight: 700; color: #333; font-size: 15px;">
                        📦 ${escapeHtml(node.display_name)}
                    </span>
                    <span style="display: flex; gap: 8px; align-items: center; font-size: 12px; margin-right: 8px;">
                        <span style="background: #e9ecef; padding: 2px 10px; border-radius: 12px; color: #495057; font-weight: 600;">
                            ${node.children.length} ${childLabel}
                        </span>
                        <span style="background: #e3f2fd; padding: 2px 12px; border-radius: 12px; color: #0d47a1; font-weight: 600;">
                            ${directRecords > 0 ? directRecords + ' here · ' : ''}${subtreeRecords} total
                        </span>
                        ${anySelected ? `<span style="color: #0064d2; font-weight: 600;">${totalSelectedRecords} selected</span>` : ''}
                        ${subtreeRecords > 0 ? `
                            <button onclick="event.stopPropagation(); ebayPostLocation(${node.id})"
                                    style="padding: 4px 16px; background: linear-gradient(135deg, #0064d2 0%, #004a99 100%); color: white; border: none; border-radius: 14px; cursor: pointer; font-size: 12px; font-weight: 600;">
                                📤 Post
                            </button>
                        ` : ''}
                    </span>
                </div>
        `;

        if (isExpanded) {
            for (const child of node.children) html += renderNode(child, depth + 1);
        }

        html += `</div>`;
        return html;
    }

    function renderLeafRow(node, depth) {
        const locationId = node.id;
        const count = node.record_count || 0;

        const isExpanded   = expandedLocations.has(locationId);
        const isSelected   = selectedLocations.has(locationId);
        const records      = recordsByLocation.get(locationId);
        const recordsLoaded = !!records;
        const pricedCount  = recordsLoaded
            ? records.filter(r => r._ebayPrice && r._ebayPrice > 0).length
            : null;

        const indent = depth * 16;

        let html = `
            <div style="border: 1px solid #e9ecef; border-radius: 6px; margin-bottom: 6px; margin-left: ${indent}px; background: ${isSelected ? '#f0f8ff' : 'white'};">
                <div style="display: flex; align-items: center; padding: 8px 12px; cursor: pointer; background: ${isExpanded ? '#f8f9fa' : 'white'};"
                     onclick="ebayToggleLocation(${locationId})">
                    <span style="font-size: 13px; margin-right: 8px; color: ${count > 0 ? '#333' : '#999'};">
                        ${isExpanded ? '▼' : '▶'}
                    </span>
                    <input type="checkbox" style="margin-right: 10px; cursor: pointer;"
                           ${isSelected ? 'checked' : ''}
                           onclick="event.stopPropagation(); ebayToggleLocationSelection(${locationId})">
                    <span style="flex: 1; font-weight: 500; color: #333; font-size: 13px;">
                        📍 ${escapeHtml(node.display_name)}
                    </span>
                    <span style="display: flex; gap: 6px; align-items: center; font-size: 12px; margin-right: 8px;">
                        <span style="background: #e9ecef; padding: 1px 10px; border-radius: 10px; color: #495057;">
                            ${count} records
                        </span>
                        ${pricedCount !== null ? `<span style="color: #0064d2; font-weight: 600;">${pricedCount} priced</span>` : ''}
                        ${count > 0 ? `
                            <button onclick="event.stopPropagation(); ebayPostLocation(${locationId})"
                                    style="padding: 3px 14px; background: #28a745; color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 11px; font-weight: 600;">
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
                html += renderRecordsTable(records);
            }
        }

        html += `</div>`;
        return html;
    }

    function renderRecordsTable(locationRecords) {
        const s = { pad: '4px 8px', fs: '12px', idFs: '11px', ageFs: '10px', headerPad: '4px 8px', headerFs: '11px' };

        let html = `
            <div style="padding: 10px 12px 12px 36px; border-top: 1px solid #f0f0f0; overflow-x: auto;">
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
                    <td style="padding: ${s.pad}; color: #333;">${escapeHtml(r.artist || 'Unknown')}</td>
                    <td style="padding: ${s.pad}; color: #333;">${escapeHtml(r.title || 'Unknown')}</td>
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

    window.ebayToggleLocation = async function(locationId) {
        const node = findNode(locationId);
        if (!node) return;

        if (expandedLocations.has(locationId)) {
            expandedLocations.delete(locationId);
            renderRecords();
            return;
        }
        expandedLocations.add(locationId);
        renderRecords();

        if (node.children.length > 0) {
            const leaves = [];
            (function collect(n) {
                if (n.children.length === 0) leaves.push(n);
                else n.children.forEach(collect);
            })(node);

            const missing = leaves.filter(l => !recordsByLocation.has(l.id));
            if (missing.length > 0) {
                showStatus(`⏳ Loading ${missing.length} leaf location(s) under ${escapeHtml(node.display_name)}...`, 'info');
                try {
                    for (const leaf of missing) {
                        await ensureRecordsForLocation(leaf.id);
                    }
                } catch (err) {
                    showStatus(`❌ ${err.message}`, 'error');
                }
                renderRecords();
            }
        } else if (!recordsByLocation.has(locationId)) {
            try {
                await ensureRecordsForLocation(locationId);
            } catch (err) {
                showStatus(`❌ Could not load records for location ${locationId}: ${err.message}`, 'error');
            }
            renderRecords();
        }
    };

    window.ebayToggleLocationSelection = function(locationId) {
        const node = findNode(locationId);
        if (!node) return;

        const ids = collectSubtreeIds(node);
        const allSelected = ids.every(id => selectedLocations.has(id));

        if (allSelected) {
            ids.forEach(id => selectedLocations.delete(id));
        } else {
            ids.forEach(id => selectedLocations.add(id));
        }
        renderRecords();
    };

    window.ebayToggleAllLocations = function() {
        const selectAll = document.getElementById('ebay-select-all-locations');
        const isChecked = selectAll.checked;
        if (isChecked) {
            Object.keys(locationById).forEach(id => selectedLocations.add(Number(id)));
        } else {
            selectedLocations.clear();
        }
        renderRecords();
    };

    function updateSelectionInfo() {
        const info = document.getElementById('ebay-selection-info');
        if (!info) return;

        let totalRecords = 0;
        for (const id of selectedLocations) {
            const node = findNode(id);
            if (!node) continue;
            let coveredByAncestor = false;
            let p = node.parent_id;
            while (p) {
                if (selectedLocations.has(p)) { coveredByAncestor = true; break; }
                const pn = findNode(p);
                p = pn ? pn.parent_id : null;
            }
            if (!coveredByAncestor) totalRecords += node.subtree_count;
        }
        info.textContent = `${selectedLocations.size} locations selected, ${totalRecords} records`;
    }

    function updateButtons() {
        const postSelectedBtn = document.getElementById('ebay-post-selected-btn');
        const cancelBtn       = document.getElementById('ebay-cancel-post-btn');

        let selectedRecords = 0;
        for (const id of selectedLocations) {
            const node = findNode(id);
            if (!node) continue;
            let coveredByAncestor = false;
            let p = node.parent_id;
            while (p) {
                if (selectedLocations.has(p)) { coveredByAncestor = true; break; }
                const pn = findNode(p);
                p = pn ? pn.parent_id : null;
            }
            if (!coveredByAncestor) selectedRecords += node.subtree_count;
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

    window.ebayPostLocation = async function(locationId) {
        if (isPosting) return;
        const node = findNode(locationId);
        if (!node) {
            showStatus(`⚠️ Location ${locationId} not found`, 'warning');
            return;
        }
        await collectAndPost([node], node.display_name);
    };

    window.postSelectedEbayLocations = async function() {
        if (isPosting) return;
        if (selectedLocations.size === 0) {
            showStatus('⚠️ No locations selected', 'warning');
            return;
        }

        const roots = [];
        for (const id of selectedLocations) {
            const node = findNode(id);
            if (!node) continue;
            let coveredByAncestor = false;
            let p = node.parent_id;
            while (p) {
                if (selectedLocations.has(p)) { coveredByAncestor = true; break; }
                const pn = findNode(p);
                p = pn ? pn.parent_id : null;
            }
            if (!coveredByAncestor) roots.push(node);
        }

        const label = roots.length === 1 ? roots[0].display_name : `${roots.length} selected locations`;
        await collectAndPost(roots, label);
    };

    async function collectAndPost(nodes, scopeLabel) {
        const statusDiv = document.getElementById('ebay-status');

        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.className = 'status-message status-info';
            statusDiv.innerHTML = `⏳ Loading records under ${escapeHtml(scopeLabel)}...`;
        }

        const recordsToPost = [];
        const locationNames = [];

        try {
            for (const node of nodes) {
                locationNames.push(node.display_name);
                const recs = await ensureRecordsForSubtree(node, (done, total, leafName) => {
                    if (statusDiv) {
                        statusDiv.style.display = 'block';
                        statusDiv.className = 'status-message status-info';
                        statusDiv.innerHTML = `⏳ Loading ${done}/${total}: ${escapeHtml(leafName)}`;
                    }
                });
                const eligible = recs.filter(r => r._ebayPrice && r._ebayPrice > 0);
                recordsToPost.push(...eligible);
            }
        } catch (err) {
            console.error('Failed loading records for post:', err);
            showStatus(`❌ ${err.message}`, 'error');
            return;
        }

        renderRecords();

        if (recordsToPost.length === 0) {
            showStatus(`⚠️ No records with eBay prices in ${escapeHtml(scopeLabel)}`, 'warning');
            return;
        }

        await confirmAndPost(recordsToPost, locationNames, scopeLabel);
    }

    async function confirmAndPost(recordsToPost, locationNames, scopeLabel) {
        const withMarkdown = recordsToPost.filter(r => r._markupPercent && r._markupPercent < 0);
        const estMinutes = ((recordsToPost.length * EBAY_POST_DELAY_MS) / 60000).toFixed(1);
        let confirmMsg = `Post ${recordsToPost.length} record(s) from ${scopeLabel} to eBay?\n\n`;
        confirmMsg += `Locations: ${locationNames.slice(0, 5).join(', ')}${locationNames.length > 5 ? ` (+${locationNames.length - 5} more)` : ''}\n`;
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
        let postedListings = [];

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
                                <strong>${escapeHtml(record.artist || 'Unknown')} - ${escapeHtml(record.title || 'Unknown')}</strong>
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
                        ${postedListings.length > 0 ? `
                            <div style="font-size: 11px; color: #555; background: #f0f8ff; padding: 4px 8px; border-radius: 4px; max-height: 100px; overflow-y: auto; border: 1px solid #d0e3f5;">
                                ${postedListings.slice(-5).map(l =>
                                    `✅ <strong>#${l.id}</strong> <a href="${l.url}" target="_blank" rel="noopener" style="color: #0064d2; text-decoration: none;">${l.url}</a>`
                                ).join('<br>')}
                            </div>
                        ` : ''}
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
                    if (data.listing_url) {
                        postedListings.push({
                            id: record.id,
                            artist: record.artist,
                            title: record.title,
                            url: data.listing_url
                        });
                    }
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
            if (postedListings.length > 0) {
                message += `<br><br><div style="font-size: 12px; background: #f0f8ff; padding: 8px 12px; border-radius: 4px; max-height: 200px; overflow-y: auto; text-align: left; border: 1px solid #d0e3f5;">
                    <strong>Listings posted:</strong><br>${postedListings.map(l =>
                        `✅ <strong>#${l.id}</strong> <a href="${l.url}" target="_blank" rel="noopener" style="color: #0064d2;">${l.url}</a>`
                    ).join('<br>')}
                </div>`;
            }
            if (cancelPosting) message = `⏹️ Cancelled. ${success} posted, ${failed} failed`;
            statusDiv.innerHTML = message;
            statusDiv.className = failed > 0 || cancelPosting ? 'status-message status-warning' : 'status-message status-success';
            if (failed === 0 && !cancelPosting) {
                setTimeout(() => { statusDiv.style.display = 'none'; }, 15000);
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

    window.initPostToEbay = function() {
        console.log('🛒 Post to eBay initialized (auto-load mode)');

        locationTree = [];
        locationById = {};
        recordsByLocation.clear();
        selectedLocations.clear();
        expandedLocations.clear();
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

    window.loadPostEbayRecords = function() {
        return loadLocations();
    };

})();