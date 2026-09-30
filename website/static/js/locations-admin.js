// ================================================================
// FILE: /static/js/locations-admin.js
// Locations admin - tree view, add child, add root, clear records,
// delete location, with per-location record counts and latest last_seen.
//
// Also supports selecting any node (any generation) and posting the
// selected subtree(s) to eBay or Discogs by looping client-side and
// calling the EXISTING single-record endpoints:
//   POST /api/ebay/list
//   POST /api/discogs/create-listing-single
//
// No new backend endpoints are required.
// ================================================================

(function() {
    'use strict';

    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    function showStatus(message, type) {
        const el = document.getElementById('locations-admin-status');
        if (!el) return;
        el.style.display = 'block';
        el.textContent = message;
        el.className = '';
        if (type === 'error') {
            el.style.background = '#fff5f5';
            el.style.color = '#dc3545';
            el.style.border = '1px solid #f5c2c7';
        } else if (type === 'success') {
            el.style.background = '#f0fff4';
            el.style.color = '#28a745';
            el.style.border = '1px solid #c3e6cb';
        } else {
            el.style.background = '#eef4ff';
            el.style.color = '#0d47a1';
            el.style.border = '1px solid #b8d4ff';
        }
    }

    function clearStatus() {
        const el = document.getElementById('locations-admin-status');
        if (!el) return;
        el.style.display = 'none';
        el.textContent = '';
    }

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Build a nested tree from the flat /api/locations response.
    function buildTree(rows) {
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
                latest_last_seen: r.latest_last_seen || null,
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

        return roots;
    }

    function countNodes(roots) {
        let total = 0;
        let leaves = 0;
        function walk(nodes) {
            nodes.forEach(n => {
                total++;
                if (n.children.length === 0) leaves++;
                walk(n.children);
            });
        }
        walk(roots);
        return { total, leaves };
    }

    // ================================================================
    //  PRICING CONFIG (editable inputs)
    // ================================================================

    let pricingConfig = {
        markup: null,
        step: null,
        maxMarkdown: null
    };

    async function fetchRequiredConfig(key) {
        const r = await fetch(`${API_BASE}/config/${key}`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!r.ok) throw new Error(`Config ${key} not available (HTTP ${r.status})`);
        const d = await r.json();
        if (d.status !== 'success') throw new Error(`Config ${key} returned non-success`);
        if (d.config_value === null || d.config_value === undefined || d.config_value === '') {
            throw new Error(`Config ${key} is missing in app_config`);
        }
        const v = parseFloat(d.config_value);
        if (isNaN(v)) throw new Error(`Config ${key} is not a number (got "${d.config_value}")`);
        return v;
    }

    async function loadPricingConfigFromServer() {
        const markup = await fetchRequiredConfig('PRICING_MARKUP_PERCENT');
        const step   = await fetchRequiredConfig('PRICING_PRICE_STEP');
        const maxMd  = await fetchRequiredConfig('PRICING_MAX_MARKDOWN');

        pricingConfig = {
            markup: markup,
            step: step,
            maxMarkdown: Math.abs(maxMd)
        };

        const markupEl = document.getElementById('locations-pricing-markup');
        if (markupEl) markupEl.value = pricingConfig.markup;
        const stepEl = document.getElementById('locations-pricing-step');
        if (stepEl) stepEl.value = pricingConfig.step;
        const maxEl = document.getElementById('locations-pricing-max-markdown');
        if (maxEl) maxEl.value = pricingConfig.maxMarkdown;

        updatePricingInfo();
    }

    async function saveOneConfig(key, value) {
        const r = await fetch(`${API_BASE}/config/${key}`, {
            method: 'PUT',
            credentials: 'include',
            headers: getHeaders(),
            body: JSON.stringify({ config_value: value })
        });
        if (!r.ok) {
            let detail = '';
            try { detail = (await r.json()).error || ''; } catch (_) {}
            throw new Error(`Failed to save ${key} (HTTP ${r.status}) ${detail}`);
        }
        const d = await r.json();
        if (d.status !== 'success') throw new Error(`Failed to save ${key}: ${d.error || 'unknown error'}`);
    }

    async function savePricingConfigToServer() {
        await saveOneConfig('PRICING_MARKUP_PERCENT', pricingConfig.markup);
        await saveOneConfig('PRICING_PRICE_STEP', pricingConfig.step);
        await saveOneConfig('PRICING_MAX_MARKDOWN', pricingConfig.maxMarkdown);
    }

    function updatePricingInfo() {
        const info = document.getElementById('locations-pricing-info');
        if (!info) return;

        if (pricingConfig.markup === null) {
            info.textContent = 'Config not loaded';
            return;
        }

        const totalRecords = Object.values(currentTreeById)
            .reduce((sum, n) => sum + n.record_count, 0);

        info.textContent =
            `Markup: +${pricingConfig.markup}% -${pricingConfig.step}%/wk ` +
            `(floor -${pricingConfig.maxMarkdown}%) | ` +
            `${totalRecords} records across ${Object.keys(currentTreeById).length} locations`;
    }

    window.locationsUpdatePricing = async function() {
        if (isPosting) {
            showStatus('⚠️ Cannot update pricing while posting', 'error');
            return;
        }

        const markupInput = document.getElementById('locations-pricing-markup');
        const stepInput   = document.getElementById('locations-pricing-step');
        const maxInput    = document.getElementById('locations-pricing-max-markdown');

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

        pricingConfig = {
            markup: newMarkup,
            step: newStep,
            maxMarkdown: Math.abs(newMax)
        };

        try {
            showStatus('⚙️ Saving pricing config...', 'info');
            await savePricingConfigToServer();
            updatePricingInfo();
            showStatus('✅ Pricing config saved', 'success');
        } catch (err) {
            showStatus(`❌ ${err.message}`, 'error');
        }
    };

    // ================================================================
    //  SELECTION STATE
    // ================================================================

    let selectedIds = new Set();
    let currentTreeById = {};

    let cancelRequested = false;
    let isPosting = false;

    function collectSubtreeIds(node) {
        const ids = [];
        (function walk(n) {
            ids.push(n.id);
            n.children.forEach(walk);
        })(node);
        return ids;
    }

    function findRootsForSelected() {
        const roots = [];
        for (const id of selectedIds) {
            const node = currentTreeById[id];
            if (!node) continue;
            let covered = false;
            let p = node.parent_id;
            while (p) {
                if (selectedIds.has(p)) { covered = true; break; }
                const pn = currentTreeById[p];
                p = pn ? pn.parent_id : null;
            }
            if (!covered) roots.push(node);
        }
        return roots;
    }

    function totalSelectedRecords() {
        let total = 0;
        for (const node of findRootsForSelected()) total += node.subtree_count;
        return total;
    }

    function getSelectedLeafIds() {
        const leafIds = new Set();
        for (const root of findRootsForSelected()) {
            (function collect(n) {
                if (n.children.length === 0) leafIds.add(n.id);
                else n.children.forEach(collect);
            })(root);
        }
        return [...leafIds];
    }

    // ================================================================
    //  RENDER
    // ================================================================

    function indexTree(roots) {
        const byId = {};
        function walk(nodes) {
            nodes.forEach(n => {
                byId[n.id] = n;
                walk(n.children);
            });
        }
        walk(roots);
        return byId;
    }

    function renderNode(node, depth) {
        const indent = depth * 20;
        const isParent = node.children.length > 0;

        const directCount = node.record_count;
        const subtreeCount = node.subtree_count;

        const latestSeen = node.latest_last_seen
            ? String(node.latest_last_seen).split('T')[0]
            : null;

        const canDelete = directCount === 0 && node.children.length === 0;
        const deleteDisabledAttr = canDelete ? '' : 'disabled';
        const deleteTitle = canDelete
            ? 'Delete this location'
            : (directCount > 0
                ? `Cannot delete: ${directCount} record(s) assigned`
                : 'Cannot delete: has child locations');

        const deleteBg = canDelete ? '#dc3545' : '#ccc';
        const deleteCursor = canDelete ? 'pointer' : 'not-allowed';
        const deleteColor = canDelete ? 'white' : '#666';

        const ids = collectSubtreeIds(node);
        const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id));
        const anySelected = ids.some(id => selectedIds.has(id));

        let countBadge = '';
        if (isParent) {
            if (subtreeCount === 0) {
                countBadge = `
                    <span style="background: #e9ecef; padding: 1px 8px; border-radius: 10px; font-size: 10px; color: #666;">
                        0 records
                    </span>
                `;
            } else {
                const directPart = directCount > 0 ? `${directCount} here` : '';
                const subtreePart = `${subtreeCount} total`;
                countBadge = `
                    <span style="background: #e3f2fd; padding: 1px 8px; border-radius: 10px; font-size: 10px; color: #0d47a1; font-weight: 600;">
                        ${directPart ? directPart + ' · ' : ''}${subtreePart}
                    </span>
                `;
            }
        } else {
            if (directCount > 0) {
                countBadge = `
                    <span style="background: #e8f5e9; padding: 1px 8px; border-radius: 10px; font-size: 10px; color: #1b5e20; font-weight: 600;">
                        ${directCount} record${directCount === 1 ? '' : 's'}
                    </span>
                `;
            } else {
                countBadge = `
                    <span style="background: #f5f5f5; padding: 1px 8px; border-radius: 10px; font-size: 10px; color: #999;">
                        empty
                    </span>
                `;
            }
        }

        let seenBadge = '';
        if (latestSeen) {
            seenBadge = `
                <span title="Most recent last_seen for records at this location"
                      style="background: #fff3e0; padding: 1px 8px; border-radius: 10px; font-size: 10px; color: #e65100; font-weight: 600;">
                    🕒 ${escapeHtml(latestSeen)}
                </span>
            `;
        } else {
            seenBadge = `
                <span title="No last_seen recorded"
                      style="background: #f5f5f5; padding: 1px 8px; border-radius: 10px; font-size: 10px; color: #999;">
                    🕒 —
                </span>
            `;
        }

        let html = `
            <div data-loc-id="${node.id}"
                 style="padding: 6px 8px 6px ${8 + indent}px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 8px; background: ${anySelected ? '#f0f8ff' : 'transparent'};">
                <input type="checkbox"
                       ${allSelected ? 'checked' : ''}
                       onchange="locationsAdminToggleSelect(${node.id})"
                       style="cursor: pointer; width: 15px; height: 15px; margin: 0;">
                <span style="font-size: 14px; color: ${isParent ? '#333' : '#888'};">
                    ${isParent ? '📦' : '📍'}
                </span>
                <span style="font-weight: ${isParent ? '600' : '400'}; color: #333; font-size: 13px;">
                    ${escapeHtml(node.display_name)}
                </span>
                ${isParent ? `
                    <span style="background: #e9ecef; padding: 1px 8px; border-radius: 10px; font-size: 10px; color: #666;">
                        ${node.children.length} child${node.children.length === 1 ? '' : 'ren'}
                    </span>
                ` : ''}
                ${countBadge}
                ${seenBadge}
                <span style="margin-left: auto; color: #999; font-size: 11px; font-family: monospace;">
                    id=${node.id}
                </span>
                <button onclick="locationsAdminAddChild(${node.id})"
                        title="Add a child under this location"
                        style="padding: 2px 10px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600;">
                    + Child
                </button>
                <button onclick="locationsAdminClearRecords(${node.id})"
                        title="Set location_id = NULL for every record at this location and all its descendants"
                        style="padding: 2px 10px; background: #ffc107; color: #333; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600;">
                    Clear
                </button>
                <button onclick="${canDelete ? `locationsAdminDelete(${node.id})` : ''}"
                        ${deleteDisabledAttr}
                        title="${escapeHtml(deleteTitle)}"
                        style="padding: 2px 10px; background: ${deleteBg}; color: ${deleteColor}; border: none; border-radius: 4px; cursor: ${deleteCursor}; font-size: 11px; font-weight: 600;">
                    Delete
                </button>
            </div>
        `;

        node.children.forEach(child => {
            html += renderNode(child, depth + 1);
        });

        return html;
    }

    function updateSelectionUI() {
        const infoEl = document.getElementById('locations-admin-selection-info');
        if (infoEl) {
            const count = selectedIds.size;
            const records = totalSelectedRecords();
            infoEl.textContent = count === 0
                ? 'No locations selected'
                : `${count} location${count === 1 ? '' : 's'} selected · ${records} record${records === 1 ? '' : 's'}`;
        }

        const ebayBtn = document.getElementById('locations-admin-post-ebay');
        const discogsBtn = document.getElementById('locations-admin-post-discogs');
        const clearBtn = document.getElementById('locations-admin-clear-selection');
        const cancelBtn = document.getElementById('locations-admin-cancel-post');

        const disabled = selectedIds.size === 0;
        if (ebayBtn) {
            ebayBtn.disabled = disabled || isPosting;
            ebayBtn.style.opacity = (disabled || isPosting) ? '0.5' : '1';
            ebayBtn.style.cursor = (disabled || isPosting) ? 'not-allowed' : 'pointer';
            ebayBtn.style.display = isPosting ? 'none' : 'inline-block';
        }
        if (discogsBtn) {
            discogsBtn.disabled = disabled || isPosting;
            discogsBtn.style.opacity = (disabled || isPosting) ? '0.5' : '1';
            discogsBtn.style.cursor = (disabled || isPosting) ? 'not-allowed' : 'pointer';
            discogsBtn.style.display = isPosting ? 'none' : 'inline-block';
        }
        if (clearBtn) {
            clearBtn.disabled = disabled || isPosting;
            clearBtn.style.opacity = (disabled || isPosting) ? '0.5' : '1';
            clearBtn.style.cursor = (disabled || isPosting) ? 'not-allowed' : 'pointer';
            clearBtn.style.display = isPosting ? 'none' : 'inline-block';
        }
        if (cancelBtn) {
            cancelBtn.style.display = isPosting ? 'inline-block' : 'none';
            cancelBtn.disabled = !isPosting;
            cancelBtn.textContent = cancelRequested ? '⏹️ Cancelling…' : '⏹️ Cancel Posting';
        }

        const pricingBtn = document.getElementById('locations-pricing-update-btn');
        if (pricingBtn) {
            pricingBtn.disabled = isPosting;
            pricingBtn.style.opacity = isPosting ? '0.5' : '1';
            pricingBtn.style.cursor = isPosting ? 'not-allowed' : 'pointer';
        }
    }

    async function loadLocations() {
        const treeEl = document.getElementById('locations-admin-tree');
        if (!treeEl) return;

        treeEl.innerHTML = '<div style="text-align: center; padding: 30px; color: #999; font-size: 13px;">Loading locations...</div>';

        try {
            const response = await fetch(`${API_BASE}/api/locations`, {
                credentials: 'include',
                headers: getHeaders()
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.status !== 'success') {
                throw new Error(data.error || 'API returned non-success');
            }

            const rows = data.locations || [];
            const roots = buildTree(rows);
            currentTreeById = indexTree(roots);

            selectedIds = new Set([...selectedIds].filter(id => currentTreeById[id]));

            const { total, leaves } = countNodes(roots);

            const countEl = document.getElementById('locations-admin-count');
            const rootsEl = document.getElementById('locations-admin-roots');
            const leavesEl = document.getElementById('locations-admin-leaves');
            if (countEl) countEl.textContent = total;
            if (rootsEl) rootsEl.textContent = roots.length;
            if (leavesEl) leavesEl.textContent = leaves;

            if (roots.length === 0) {
                treeEl.innerHTML = '<div style="text-align: center; padding: 30px; color: #999;">No locations found.</div>';
                updateSelectionUI();
                return;
            }

            let html = '';
            roots.forEach(r => {
                html += renderNode(r, 0);
            });
            treeEl.innerHTML = html;

            updateSelectionUI();
            updatePricingInfo();
            clearStatus();

        } catch (err) {
            console.error('Failed to load locations:', err);
            treeEl.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #dc3545; font-size: 13px;">
                    ❌ Failed to load: ${escapeHtml(err.message)}
                </div>
            `;
            showStatus(`❌ ${err.message}`, 'error');
        }
    }

    async function addLocation(parentId) {
        let parentLabel = 'as a root location';
        if (parentId) {
            const parentNode = currentTreeById[parentId];
            const parentName = parentNode
                ? parentNode.display_name
                : `location #${parentId}`;
            parentLabel = `under ${parentName}`;
        }

        const name = prompt(`Enter name for new location (${parentLabel}):`);
        if (!name || !name.trim()) return;

        try {
            const response = await fetch(`${API_BASE}/api/locations`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({
                    name: name.trim(),
                    parent_id: parentId || null
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                showStatus(`✅ Created "${data.location.display_name}"`, 'success');
                await loadLocations();
            } else {
                showStatus(`❌ ${data.error || 'Failed to create location'}`, 'error');
            }
        } catch (err) {
            showStatus(`❌ ${err.message}`, 'error');
        }
    }

    async function clearRecords(locationId) {
        const node = currentTreeById[locationId];
        const displayName = node ? node.display_name : `location #${locationId}`;

        if (!confirm(
            `Clear all records at "${displayName}" and all its sub-locations?\n\n` +
            `This sets location_id = NULL on those records. The records themselves are not deleted.`
        )) return;

        try {
            const response = await fetch(`${API_BASE}/api/locations/${locationId}/clear-records`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });

            const data = await response.json();

            if (data.status === 'success') {
                showStatus(`✅ Cleared ${data.cleared} record(s) from "${displayName}"`, 'success');
                await loadLocations();
            } else {
                showStatus(`❌ ${data.error || 'Failed to clear records'}`, 'error');
            }
        } catch (err) {
            showStatus(`❌ ${err.message}`, 'error');
        }
    }

    async function deleteLocation(locationId) {
        const node = currentTreeById[locationId];
        const displayName = node ? node.display_name : `location #${locationId}`;

        if (node && (node.record_count > 0 || node.children.length > 0)) {
            showStatus(
                node.record_count > 0
                    ? `❌ Cannot delete "${displayName}": ${node.record_count} record(s) assigned.`
                    : `❌ Cannot delete "${displayName}": has child locations.`,
                'error'
            );
            return;
        }

        if (!confirm(`Delete "${displayName}"?`)) return;

        try {
            const response = await fetch(`${API_BASE}/api/locations/${locationId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getHeaders()
            });

            const data = await response.json();

            if (data.status === 'success') {
                showStatus(`✅ Deleted "${displayName}"`, 'success');
                await loadLocations();
            } else {
                showStatus(`❌ ${data.error || 'Failed to delete location'}`, 'error');
            }
        } catch (err) {
            showStatus(`❌ ${err.message}`, 'error');
        }
    }

    // ================================================================
    //  SELECTION HANDLERS
    // ================================================================

    window.locationsAdminToggleSelect = function(locationId) {
        const node = currentTreeById[locationId];
        if (!node) return;

        const ids = collectSubtreeIds(node);
        const allSelected = ids.every(id => selectedIds.has(id));

        if (allSelected) {
            ids.forEach(id => selectedIds.delete(id));
        } else {
            ids.forEach(id => selectedIds.add(id));
        }

        rerenderFromCache();
    };

    window.locationsAdminClearSelection = function() {
        selectedIds.clear();
        rerenderFromCache();
    };

    window.locationsAdminCancelPost = function() {
        if (isPosting) {
            cancelRequested = true;
            updateSelectionUI();
            showStatus('⏹️ Cancelling… will stop after the current record finishes.', 'error');
        }
    };

    function rerenderFromCache() {
        const treeEl = document.getElementById('locations-admin-tree');
        if (!treeEl) return;
        const roots = Object.values(currentTreeById).filter(n => !n.parent_id || !currentTreeById[n.parent_id]);
        roots.sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { numeric: true }));
        let html = '';
        roots.forEach(r => { html += renderNode(r, 0); });
        treeEl.innerHTML = html;
        updateSelectionUI();
    }

    // ================================================================
    //  PRICE COMPUTATION
    // ================================================================

    function computePrice(storePrice, createdAt) {
        if (!storePrice || storePrice <= 0 || !createdAt) return null;

        if (pricingConfig.markup === null || pricingConfig.step === null || pricingConfig.maxMarkdown === null) {
            throw new Error('Pricing config not loaded');
        }

        let createdDate;
        if (typeof createdAt === 'string') {
            createdDate = new Date(createdAt.split('T')[0].split(' ')[0]);
        } else {
            createdDate = new Date(createdAt);
        }
        if (isNaN(createdDate.getTime())) return null;

        const today = new Date();
        const daysOld = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
        const weeksOld = Math.floor(Math.max(0, daysOld) / 7);

        const floor = -Math.abs(pricingConfig.maxMarkdown);
        let markup = pricingConfig.markup - (weeksOld * pricingConfig.step);
        markup = Math.max(floor, markup);

        return Math.round(storePrice * (1 + markup / 100) * 100) / 100;
    }

    // ================================================================
    //  POST SELECTED - client-side loop, existing endpoints
    // ================================================================

    async function fetchPostableRecordsForLeaves(leafIds) {
        const allRecords = [];
        const seenIds = new Set();

        for (const locId of leafIds) {
            const url = `${API_BASE}/records?status_ids=2&visible_only=true&hide_consigned=true&location_ids=${locId}`;
            const r = await fetch(url, {
                credentials: 'include',
                headers: getHeaders()
            });
            if (!r.ok) throw new Error(`Failed to fetch records for location ${locId} (HTTP ${r.status})`);
            const d = await r.json();
            if (d.status !== 'success') throw new Error(d.error || `API error for location ${locId}`);

            for (const rec of (d.records || [])) {
                if (seenIds.has(rec.id)) continue;
                seenIds.add(rec.id);
                allRecords.push(rec);
            }
        }
        return allRecords;
    }

    async function postSelectedToEbay() {
        if (isPosting) return;

        const leafIds = getSelectedLeafIds();
        if (leafIds.length === 0) {
            showStatus('⚠️ No leaf locations selected', 'error');
            return;
        }

        if (!confirm(
            `Post records from ${selectedIds.size} selected location(s) to eBay?\n\n` +
            `This will resolve to ${leafIds.length} leaf location(s).\n\n` +
            `Continue?`
        )) return;

        const statusPrefix = '🛒 eBay:';
        isPosting = true;
        cancelRequested = false;
        updateSelectionUI();

        try {
            showStatus(`${statusPrefix} Loading pricing config...`, 'info');
            await loadPricingConfigFromServer();

            showStatus(`${statusPrefix} Loading records from ${leafIds.length} leaf location(s)...`, 'info');
            const records = await fetchPostableRecordsForLeaves(leafIds);

            if (records.length === 0) {
                showStatus(`${statusPrefix} No eligible records found in selected locations.`, 'error');
                return;
            }

            let success = 0;
            let failed = 0;
            let skipped = 0;
            const errors = [];

            for (let i = 0; i < records.length; i++) {
                if (cancelRequested) {
                    skipped = records.length - i;
                    break;
                }

                const rec = records[i];
                const price = computePrice(rec.store_price, rec.created_at);

                if (!price) {
                    failed++;
                    errors.push(`Record #${rec.id}: cannot compute price`);
                    continue;
                }

                showStatus(
                    `${statusPrefix} ${i + 1}/${records.length} — posting #${rec.id} (${rec.artist || 'Unknown'} - ${rec.title || 'Unknown'}) @ $${price.toFixed(2)}`,
                    'info'
                );

                try {
                    const r = await fetch(`${API_BASE}/api/ebay/list`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: getHeaders(),
                        body: JSON.stringify({
                            record_id: rec.id,
                            price: price,
                            quantity: 1
                        })
                    });

                    let body = {};
                    try { body = await r.json(); } catch (_) {}

                    if (r.ok && body.status === 'success') {
                        success++;
                    } else {
                        failed++;
                        errors.push(`Record #${rec.id}: ${body.error || body.message || `HTTP ${r.status}`}`);
                    }
                } catch (err) {
                    failed++;
                    errors.push(`Record #${rec.id}: ${err.message}`);
                }

                if (i < records.length - 1 && !cancelRequested) {
                    await sleep(1000);
                }
            }

            const cancelled = cancelRequested;
            let summary;
            if (cancelled) {
                summary = `${statusPrefix} ⏹️ Cancelled. ✅ ${success} posted, ❌ ${failed} failed, ${skipped} skipped.`;
            } else {
                summary = `${statusPrefix} done. ✅ ${success} posted, ❌ ${failed} failed.`;
            }

            showStatus(
                errors.length > 0
                    ? `${summary} First error: ${errors[0]}`
                    : summary,
                (failed > 0 || cancelled) ? 'error' : 'success'
            );

        } catch (err) {
            showStatus(`${statusPrefix} ❌ ${err.message}`, 'error');
        } finally {
            isPosting = false;
            cancelRequested = false;
            updateSelectionUI();
        }
    }

    async function postSelectedToDiscogs() {
        if (isPosting) return;

        const leafIds = getSelectedLeafIds();
        if (leafIds.length === 0) {
            showStatus('⚠️ No leaf locations selected', 'error');
            return;
        }

        if (!confirm(
            `Post records from ${selectedIds.size} selected location(s) to Discogs?\n\n` +
            `This will resolve to ${leafIds.length} leaf location(s).\n\n` +
            `Continue?`
        )) return;

        const statusPrefix = '📀 Discogs:';
        isPosting = true;
        cancelRequested = false;
        updateSelectionUI();

        try {
            showStatus(`${statusPrefix} Loading pricing config...`, 'info');
            await loadPricingConfigFromServer();

            showStatus(`${statusPrefix} Loading records from ${leafIds.length} leaf location(s)...`, 'info');
            const records = await fetchPostableRecordsForLeaves(leafIds);

            if (records.length === 0) {
                showStatus(`${statusPrefix} No eligible records found in selected locations.`, 'error');
                return;
            }

            let success = 0;
            let failed = 0;
            let skipped = 0;
            const errors = [];

            for (let i = 0; i < records.length; i++) {
                if (cancelRequested) {
                    skipped = records.length - i;
                    break;
                }

                const rec = records[i];
                const price = computePrice(rec.store_price, rec.created_at);

                if (!price) {
                    failed++;
                    errors.push(`Record #${rec.id}: cannot compute price`);
                    continue;
                }

                showStatus(
                    `${statusPrefix} ${i + 1}/${records.length} — posting #${rec.id} (${rec.artist || 'Unknown'} - ${rec.title || 'Unknown'}) @ $${price.toFixed(2)}`,
                    'info'
                );

                const payload = {
                    record: {
                        id: rec.id,
                        artist: rec.artist || 'Unknown',
                        title: rec.title || 'Unknown',
                        catalog_number: rec.catalog_number || '',
                        media_condition: rec.disc_condition_name || 'Very Good Plus (VG+)',
                        sleeve_condition: rec.sleeve_condition_name || 'Very Good Plus (VG+)',
                        price: price,
                        notes: rec.notes || '',
                        location: rec.location_display || rec.location_name || '',
                        discogs_release_id: rec.discogs_release_id || null,
                        format_id: rec.format_id || null
                    }
                };

                try {
                    const r = await fetch(`${API_BASE}/api/discogs/create-listing-single`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: getHeaders(),
                        body: JSON.stringify(payload)
                    });

                    let body = {};
                    try { body = await r.json(); } catch (_) {}

                    if (r.ok && body.success) {
                        success++;
                    } else {
                        failed++;
                        errors.push(`Record #${rec.id}: ${body.error || body.message || `HTTP ${r.status}`}`);
                    }
                } catch (err) {
                    failed++;
                    errors.push(`Record #${rec.id}: ${err.message}`);
                }

                if (i < records.length - 1 && !cancelRequested) {
                    await sleep(3000);
                }
            }

            const cancelled = cancelRequested;
            let summary;
            if (cancelled) {
                summary = `${statusPrefix} ⏹️ Cancelled. ✅ ${success} posted, ❌ ${failed} failed, ${skipped} skipped.`;
            } else {
                summary = `${statusPrefix} done. ✅ ${success} posted, ❌ ${failed} failed.`;
            }

            showStatus(
                errors.length > 0
                    ? `${summary} First error: ${errors[0]}`
                    : summary,
                (failed > 0 || cancelled) ? 'error' : 'success'
            );

        } catch (err) {
            showStatus(`${statusPrefix} ❌ ${err.message}`, 'error');
        } finally {
            isPosting = false;
            cancelRequested = false;
            updateSelectionUI();
        }
    }

    // ================================================================
    //  PUBLIC API
    // ================================================================

    window.locationsAdminRefresh = function() {
        loadLocations();
    };

    window.locationsAdminAddChild = function(parentId) {
        addLocation(parentId);
    };

    window.locationsAdminAddRoot = function() {
        addLocation(null);
    };

    window.locationsAdminClearRecords = function(locationId) {
        clearRecords(locationId);
    };

    window.locationsAdminDelete = function(locationId) {
        deleteLocation(locationId);
    };

    window.locationsAdminPostEbay = function() {
        postSelectedToEbay();
    };

    window.locationsAdminPostDiscogs = function() {
        postSelectedToDiscogs();
    };

    window.initLocationsAdmin = async function() {
        console.log('🗺️ Locations admin initialized');
        selectedIds = new Set();
        cancelRequested = false;
        isPosting = false;
        try {
            await loadPricingConfigFromServer();
        } catch (err) {
            console.warn('Could not load pricing config on init:', err.message);
        }
        loadLocations();
    };

})();