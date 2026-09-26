// ================================================================
// FILE: /static/js/locations-admin.js
// Locations admin - tree view, add child, add root.
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

    function buildTree(rows) {
        const byId = {};
        rows.forEach(r => {
            byId[r.id] = {
                id: r.id,
                name: r.name,
                display_name: r.display_name || r.name,
                parent_id: r.parent_id,
                parent_name: r.parent_name,
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

        let html = `
            <div data-loc-id="${node.id}"
                 style="padding: 6px 8px 6px ${8 + indent}px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 10px;">
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
                <span style="margin-left: auto; color: #999; font-size: 11px; font-family: monospace;">
                    id=${node.id}
                </span>
                <button onclick="locationsAdminAddChild(${node.id})"
                        title="Add a child under this location"
                        style="padding: 2px 10px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600;">
                    + Child
                </button>
            </div>
        `;

        node.children.forEach(child => {
            html += renderNode(child, depth + 1);
        });

        return html;
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
        const parentLabel = parentId ? `under location #${parentId}` : 'as a root location';
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

    window.locationsAdminRefresh = function() {
        loadLocations();
    };

    window.locationsAdminAddChild = function(parentId) {
        addLocation(parentId);
    };

    window.locationsAdminAddRoot = function() {
        addLocation(null);
    };

    window.initLocationsAdmin = function() {
        console.log('🗺️ Locations admin initialized');
        loadLocations();
    };

})();