// Unaccounted Records tile
//
// Three views scoped to a tracked location subtree (default: N-2, id 241):
//   All              — every active (status 2) record currently in the subtree
//   Unaccounted      — was in the subtree at the last scan (last_seen <= scanDate)
//                      but was NOT seen in the newest scan (last_seen < scanDate)
//                      and has not been sold
//   Sold since scan  — sold (status 3/4/5) with date_sold > scanDate
//
// "Scan date" = MAX(last_seen) among active (status 2) records currently in
// the tracked subtree. Assumes bulk scanning writes the same last_seen date
// to every record picked up in a pass. Moves between sublocations within the
// subtree do not affect last_seen, so they never create false positives.
//
// Backend endpoints used:
//   GET /api/locations                        (resolve subtree ids)
//   GET /records?status_ids=2&location_ids=…  (active records)
//   GET /records?status_ids=3,4,5&location_ids=…
//
(function() {
    'use strict';

    console.log('🔍 Unaccounted Records module loaded');

    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    // Active = in inventory; Sold = 3/4/5
    const ACTIVE_STATUS = 2;
    const SOLD_STATUSES = [3, 4, 5];

    let rootId = 241;
    let subtreeIds = [];
    let activeRecords = [];
    let soldRecords = [];
    let scanDate = null;
    let currentView = 'unaccounted';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function dateOnly(v) {
        if (!v) return null;
        const s = String(v);
        const part = s.includes('T') ? s.split('T')[0] : s.split(' ')[0];
        return /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : null;
    }

    function daysAgo(dateStr) {
        const d = dateOnly(dateStr);
        if (!d) return null;
        const then = new Date(d + 'T00:00:00');
        if (isNaN(then.getTime())) return null;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const diff = Math.floor((now - then) / (1000 * 60 * 60 * 24));
        return diff >= 0 ? diff : 0;
    }

    // ---------- Subtree resolution ----------

    async function loadSubtreeIds() {
        const resp = await fetch(`${API_BASE}/api/locations`, {
            credentials: 'include',
            headers: getHeaders()
        });
        if (!resp.ok) throw new Error(`locations HTTP ${resp.status}`);
        const data = await resp.json();
        if (data.status !== 'success') throw new Error(data.error || 'locations failed');

        const rows = data.locations || [];
        const byParent = new Map();
        rows.forEach(r => {
            if (!byParent.has(r.parent_id)) byParent.set(r.parent_id, []);
            byParent.get(r.parent_id).push(r.id);
        });

        const ids = [];
        const stack = [rootId];
        const seen = new Set();
        while (stack.length) {
            const id = stack.pop();
            if (seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
            const children = byParent.get(id) || [];
            children.forEach(c => stack.push(c));
        }

        subtreeIds = ids;

        const rootRow = rows.find(r => r.id === rootId);
        const label = document.getElementById('ur-scope-label');
        if (label && rootRow) {
            label.textContent =
                `Scope: ${rootRow.display_name} and all sub-locations ` +
                `(${subtreeIds.length} location${subtreeIds.length === 1 ? '' : 's'}).`;
        }
    }

    // ---------- Data load ----------

    async function fetchRecords(statusIds) {
        const params = new URLSearchParams();
        params.set('status_ids', statusIds.join(','));
        params.set('location_ids', subtreeIds.join(','));
        params.set('order_by', 'created_at');
        params.set('order_dir', 'ASC');

        const resp = await fetch(`${API_BASE}/records?${params.toString()}`, {
            credentials: 'include',
            headers: getHeaders()
        });
        if (!resp.ok) throw new Error(`records HTTP ${resp.status}`);
        const data = await resp.json();
        if (data.status !== 'success') throw new Error(data.error || 'records failed');
        return data.records || [];
    }

    async function loadAll() {
        const list = document.getElementById('ur-list');
        if (list) list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';

        try {
            await loadSubtreeIds();
            if (subtreeIds.length === 0) {
                throw new Error(`No locations found under root id ${rootId}`);
            }

            const [active, sold] = await Promise.all([
                fetchRecords([ACTIVE_STATUS]),
                fetchRecords(SOLD_STATUSES)
            ]);

            activeRecords = active;
            soldRecords = sold;

            // Scan date = max last_seen among active records still in subtree
            let maxDate = null;
            activeRecords.forEach(r => {
                const d = dateOnly(r.last_seen);
                if (d && (!maxDate || d > maxDate)) maxDate = d;
            });
            scanDate = maxDate;

            updateStats();
            renderTable();
        } catch (err) {
            console.error('Unaccounted load error:', err);
            if (list) {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${escapeHtml(err.message)}</div>`;
            }
        }
    }

    // ---------- Classification ----------

    function isUnaccounted(rec) {
        if (!scanDate) return false;
        const l = dateOnly(rec.last_seen);
        if (!l) return false;
        // Seen on the scan date means the pass picked it up — accounted.
        if (l >= scanDate) return false;
        // Older last_seen: in the subtree at some earlier point, not seen
        // in the latest pass. If not sold, it's missing.
        return true;
    }

    function isSoldSinceScan(rec) {
        if (!scanDate) return false;
        const d = dateOnly(rec.date_sold);
        if (!d) return false;
        return d > scanDate;
    }

    function rowsForView() {
        if (currentView === 'unaccounted') {
            return activeRecords.filter(isUnaccounted);
        }
        if (currentView === 'sold') {
            return soldRecords.filter(isSoldSinceScan);
        }
        return activeRecords.slice();
    }

    // ---------- Stats ----------

    function updateStats() {
        const totalEl = document.getElementById('ur-total-active');
        const unacEl = document.getElementById('ur-total-unaccounted');
        const soldEl = document.getElementById('ur-total-sold');
        const scanEl = document.getElementById('ur-scan-date');

        if (totalEl) totalEl.textContent = activeRecords.length;
        if (unacEl) unacEl.textContent = activeRecords.filter(isUnaccounted).length;
        if (soldEl) soldEl.textContent = soldRecords.filter(isSoldSinceScan).length;
        if (scanEl) scanEl.textContent = scanDate || '—';
    }

    // ---------- Render ----------

    function renderTable() {
        const list = document.getElementById('ur-list');
        if (!list) return;

        const search = (document.getElementById('ur-search')?.value || '').toLowerCase().trim();

        let rows = rowsForView();
        if (search) {
            rows = rows.filter(r =>
                (r.artist || '').toLowerCase().includes(search) ||
                (r.title || '').toLowerCase().includes(search) ||
                String(r.id).includes(search)
            );
        }

        if (rows.length === 0) {
            list.innerHTML = emptyMessage();
            return;
        }

        // Sort: for "all"/"unaccounted", oldest created first; for "sold", newest sold first
        rows.sort((a, b) => {
            if (currentView === 'sold') {
                const da = dateOnly(a.date_sold) || '';
                const db = dateOnly(b.date_sold) || '';
                return db.localeCompare(da);
            }
            const ca = dateOnly(a.created_at) || '';
            const cb = dateOnly(b.created_at) || '';
            if (ca !== cb) return ca.localeCompare(cb);
            return (a.id || 0) - (b.id || 0);
        });

        const showSoldCols = currentView === 'sold';

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Artist</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Title</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Location</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Date Added</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Days Old</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Last Seen</th>
                    ${showSoldCols ? '<th style="padding: 6px 8px; text-align: left; color: #333;">Sold</th>' : ''}
                </tr>
            </thead>
            <tbody>`;

        rows.forEach(r => {
            const age = daysAgo(r.created_at);
            const ageColor = age == null ? '#999' : age > 30 ? '#dc3545' : age > 7 ? '#ffc107' : '#666';
            const createdTxt = dateOnly(r.created_at) || '—';
            const lastSeenTxt = dateOnly(r.last_seen);
            const lastSeenCell = lastSeenTxt
                ? escapeHtml(lastSeenTxt)
                : '<span style="color:#dc3545;font-weight:600;">never</span>';
            const soldTxt = showSoldCols ? (dateOnly(r.date_sold) || '—') : '';
            const locTxt = r.location_display || r.location_name || '—';

            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-family: monospace;">#${escapeHtml(r.id)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${escapeHtml(r.artist || '—')}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(r.title || '—')}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #555; font-size: 12px;">${escapeHtml(locTxt)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${escapeHtml(createdTxt)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: ${ageColor}; font-weight: 600;">${age == null ? '—' : age}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${lastSeenCell}</td>
                ${showSoldCols ? `<td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #6f42c1; font-weight: 600; font-size: 12px;">${escapeHtml(soldTxt)}</td>` : ''}
            </tr>`;
        });

        html += '</tbody></table>';
        list.innerHTML = html;
    }

    function emptyMessage() {
        if (currentView === 'unaccounted') {
            return '<div style="text-align: center; padding: 20px; color: #28a745; font-weight: 600;"><i class="fas fa-check-circle"></i> Nothing unaccounted — every active record in scope was seen in the latest scan.</div>';
        }
        if (currentView === 'sold') {
            return '<div style="text-align: center; padding: 20px; color: #999;">No records sold since the last scan.</div>';
        }
        return '<div style="text-align: center; padding: 20px; color: #999;">No active records in this scope.</div>';
    }

    // ---------- View switching ----------

    function styleTabs() {
        const tabs = ['all', 'unaccounted', 'sold'];
        tabs.forEach(t => {
            const btn = document.getElementById(`ur-tab-${t}`);
            if (!btn) return;
            const active = t === currentView;
            btn.style.background = active ? '#007bff' : 'white';
            btn.style.color = active ? 'white' : '#333';
        });
    }

    window.urSetView = function(view) {
        if (!['all', 'unaccounted', 'sold'].includes(view)) return;
        currentView = view;
        styleTabs();
        renderTable();
    };

    window.urRefresh = function() {
        loadAll();
    };

    window.urSearch = function() {
        renderTable();
    };

    window.urClearSearch = function() {
        const input = document.getElementById('ur-search');
        if (input) input.value = '';
        renderTable();
    };

    window.initUnaccountedRecords = function() {
        console.log('🔍 Unaccounted Records initialized');

        const wrapper = document.querySelector('[data-root-id]');
        if (wrapper) {
            const parsed = parseInt(wrapper.dataset.rootId, 10);
            if (!isNaN(parsed) && parsed > 0) rootId = parsed;
        }

        currentView = 'unaccounted';
        styleTabs();
        loadAll();

        const searchInput = document.getElementById('ur-search');
        if (searchInput && !searchInput.dataset.wired) {
            searchInput.dataset.wired = '1';
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') window.urSearch();
            });
        }
    };
})();