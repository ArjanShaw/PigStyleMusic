// ================================================================
// FILE: /static/js/locations-admin.js
// Locations admin - tree view, add child, add root, clear records,
// delete location, with per-location record counts.
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

    // Build a nested tree from the flat /api/locations response.
    // Each node carries `record_count` (own records) and `subtree_count`
    // (own + all descendants), both populated from the API.
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
                subtree_count: r.record_count || 0,   // updated below
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

        // Compute subtree_count bottom-up
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

    function renderNode(node, depth) {
        const indent = depth * 20;
        const isParent = node.children.length > 0;

        // Direct records at this location
        const directCount = node.record_count;
        // Records at this location + all descendants
        const subtreeCount = node.subtree_count;
        // For a leaf, directCount === subtreeCount.
        // For a parent, show both when they differ.

        // Delete is disabled if the location has any records assigned
        // (direct) OR any children. The backend enforces the same rule.
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

        let countBadge = '';
        if (isParent) {
            if (subtreeCount === 0) {
                countBadge = `
                    <span style="background: #e9ecef; padding: 1px 8px; border-radius: 10px; font-size: 10px; color: #666;">
                        0 records
                    </span>
                `;
            } else {
                const directPart = directCount > 0
                    ? `${directCount} here`
                    : '';
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

        let html = `
            <div data-loc-id="${node.id}"
                 style="padding: 6px 8px 6px ${8 + indent}px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 8px;">
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

    // Cache the current tree so clear/delete can look up display names.
    let currentTreeById = {};

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

            const { total, leaves } = countNodes(roots);

            const countEl = document.getElementById('locations-admin-count');
            const rootsEl = document.getElementById('locations-admin-roots');
            const leavesEl = document.getElementById('locations-admin-leaves');
            if (countEl) countEl.textContent = total;
            if (rootsEl) rootsEl.textContent = roots.length;
            if (leavesEl) leavesEl.textContent = leaves;

            if (roots.length === 0) {
                treeEl.innerHTML = '<div style="text-align: center; padding: 30px; color: #999;">No locations found.</div>';
                return;
            }

            let html = '';
            roots.forEach(r => {
                html += renderNode(r, 0);
            });
            treeEl.innerHTML = html;

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

        // Client-side guard (mirrors the backend rule):
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

    window.initLocationsAdmin = function() {
        console.log('🗺️ Locations admin initialized');
        loadLocations();
    };

})();