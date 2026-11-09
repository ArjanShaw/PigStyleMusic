// Unaccounted Records tile
//
// Views scoped to a tracked location subtree (default: N-2, id 241):
//   All          — every active (status 2) record currently in the subtree
//   Unaccounted  — was in the subtree at the last scan (last_seen <= scanDate)
//                  but was NOT seen in the newest scan (last_seen < scanDate)
//                  and has not been sold
//   Missing      — active records with records.missing = 1
//   Reorder      — distinct artist/title pairs built from
//                    (a) active records flagged missing = 1, plus
//                    (b) sold records (status 3/4/5) whose location_id is
//                        inside the tracked subtree
//                  One row per unique artist/title with per-source counts.
//
// "Scan date" = MAX(last_seen) among active (status 2) records currently in
// the tracked subtree. Assumes bulk scanning writes the same last_seen date
// to every record picked up in a pass. Moves between sublocations within the
// subtree do not affect last_seen, so they never create false positives.
//
// Every row on All / Unaccounted / Missing has a "Missing" toggle that flips
// records.missing between 0 and 1 via PUT /records/:id. Toggling refreshes
// the current view in place. The Reorder view is an aggregate and has no
// per-row toggle.
//
// Backend endpoints used:
//   GET  /api/locations                        (resolve subtree ids)
//   GET  /records?status_ids=2&location_ids=…  (active records)
//   GET  /records?status_ids=3,4,5&location_ids=…
//   PUT  /records/:id                          (toggle missing flag)
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
    let busyRecords = new Set();   // record ids with an in-flight missing toggle

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

    function isMissing(rec) {
        return rec && (rec.missing === 1 || rec.missing === true || rec.missing === '1');
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

    // ---------- Reorder aggregation ----------
    //
    // Distinct (artist, title) pairs drawn from:
    //   - active records flagged missing = 1 (already subtree-scoped)
    //   - sold records (status 3/4/5) whose location_id is in the subtree
    //     (the sold fetch is already scoped via location_ids=<subtree>, so
    //      everything in soldRecords qualifies)
    //
    // Returns an array of { artist, title, missing, sold, total } sorted by
    // total desc, then artist asc, then title asc.
    //
    function buildReorderRows() {
        const map = new Map();

        function key(artist, title) {
            return `${(artist || '').trim().toLowerCase()}\u0000${(title || '').trim().toLowerCase()}`;
        }

        function bump(rec, field) {
            const artist = (rec.artist || '').trim() || 'Unknown';
            const title = (rec.title || '').trim() || 'Unknown';
            const k = key(artist, title);

            let row = map.get(k);
            if (!row) {
                row = { artist, title, missing: 0, sold: 0, total: 0 };
                map.set(k, row);
            }
            row[field] += 1;
            row.total += 1;
        }

        // (a) Active records flagged missing
        activeRecords.forEach(rec => {
            if (isMissing(rec)) bump(rec, 'missing');
        });

        // (b) Sold records already scoped to the subtree by the query
        soldRecords.forEach(rec => {
            bump(rec, 'sold');
        });

        const rows = Array.from(map.values());
        rows.sort((a, b) => {
            if (b.total !== a.total) return b.total - a.total;
            const ac = a.artist.toLowerCase();
            const bc = b.artist.toLowerCase();
            if (ac !== bc) return ac.localeCompare(bc);
            return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        });
        return rows;
    }

    function rowsForView() {
        if (currentView === 'unaccounted') {
            return activeRecords.filter(isUnaccounted);
        }
        if (currentView === 'missing') {
            return activeRecords.filter(isMissing);
        }
        return activeRecords.slice();
    }

    // ---------- Stats ----------

    function updateStats() {
        const totalEl = document.getElementById('ur-total-active');
        const unacEl = document.getElementById('ur-total-unaccounted');
        const missingEl = document.getElementById('ur-total-missing');
        const reorderEl = document.getElementById('ur-total-reorder');
        const scanEl = document.getElementById('ur-scan-date');

        if (totalEl) totalEl.textContent = activeRecords.length;
        if (unacEl) unacEl.textContent = activeRecords.filter(isUnaccounted).length;
        if (missingEl) missingEl.textContent = activeRecords.filter(isMissing).length;
        if (reorderEl) reorderEl.textContent = buildReorderRows().length;
        if (scanEl) scanEl.textContent = scanDate || '—';
    }

    // ---------- Missing toggle ----------

    async function toggleMissing(recordId) {
        if (busyRecords.has(recordId)) return;

        const rec = activeRecords.find(r => r.id === recordId);
        if (!rec) return;

        const next = isMissing(rec) ? 0 : 1;

        busyRecords.add(recordId);
        renderTable();

        try {
            const resp = await fetch(`${API_BASE}/records/${recordId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ missing: next })
            });

            if (!resp.ok) {
                const text = await resp.text().catch(() => '');
                throw new Error(`HTTP ${resp.status}${text ? ': ' + text.slice(0, 200) : ''}`);
            }

            const data = await resp.json().catch(() => ({}));
            if (data.status && data.status !== 'success') {
                throw new Error(data.error || 'update failed');
            }

            rec.missing = next;
            updateStats();
        } catch (err) {
            console.error(`Missing toggle failed for record #${recordId}:`, err);
            alert(`Could not update missing flag for record #${recordId}:\n${err.message}`);
        } finally {
            busyRecords.delete(recordId);
            renderTable();
        }
    }

    // ---------- Render: per-record views ----------

    function missingToggleHtml(rec) {
        const on = isMissing(rec);
        const busy = busyRecords.has(rec.id);

        if (busy) {
            return `<button disabled
                        style="padding: 4px 10px; border-radius: 12px; border: 1px solid #ddd;
                               background: #f8f9fa; color: #999; font-size: 11px; font-weight: 600;
                               cursor: wait;">
                        <i class="fas fa-spinner fa-spin"></i>
                    </button>`;
        }

        if (on) {
            return `<button onclick="urToggleMissing(${rec.id})" title="Unflag missing"
                        style="padding: 4px 10px; border-radius: 12px; border: 1px solid #fd7e14;
                               background: #fd7e14; color: white; font-size: 11px; font-weight: 700;
                               cursor: pointer;">
                        Missing
                    </button>`;
        }

        return `<button onclick="urToggleMissing(${rec.id})" title="Flag as missing"
                    style="padding: 4px 10px; border-radius: 12px; border: 1px solid #ddd;
                           background: white; color: #888; font-size: 11px; font-weight: 600;
                           cursor: pointer;">
                    Missing
                </button>`;
    }

    function renderRecordTable(rows) {
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
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Missing</th>
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
            const locTxt = r.location_display || r.location_name || '—';
            const rowBg = isMissing(r) ? '#fff4e6' : 'transparent';

            html += `<tr style="background: ${rowBg};">
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-family: monospace;">#${escapeHtml(r.id)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${escapeHtml(r.artist || '—')}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(r.title || '—')}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #555; font-size: 12px;">${escapeHtml(locTxt)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${escapeHtml(createdTxt)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: ${ageColor}; font-weight: 600;">${age == null ? '—' : age}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${lastSeenCell}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">${missingToggleHtml(r)}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        return html;
    }

    // ---------- Render: reorder view ----------

    function renderReorderTable(rows) {
        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Artist</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Title</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Missing</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Sold</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Total</th>
                </tr>
            </thead>
            <tbody>`;

        rows.forEach(r => {
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${escapeHtml(r.artist)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(r.title)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: ${r.missing ? '#fd7e14' : '#999'}; font-weight: 600;">${r.missing}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: ${r.sold ? '#6f42c1' : '#999'}; font-weight: 600;">${r.sold}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-weight: 700;">${r.total}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        return html;
    }

    // ---------- Render entry point ----------

    function renderTable() {
        const list = document.getElementById('ur-list');
        if (!list) return;

        const search = (document.getElementById('ur-search')?.value || '').toLowerCase().trim();

        // ---- Reorder view ----
        if (currentView === 'reorder') {
            let rows = buildReorderRows();
            if (search) {
                rows = rows.filter(r =>
                    r.artist.toLowerCase().includes(search) ||
                    r.title.toLowerCase().includes(search)
                );
            }
            if (rows.length === 0) {
                list.innerHTML = emptyMessage();
                return;
            }
            list.innerHTML = renderReorderTable(rows);
            return;
        }

        // ---- Per-record views ----
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

        rows.sort((a, b) => {
            const ca = dateOnly(a.created_at) || '';
            const cb = dateOnly(b.created_at) || '';
            if (ca !== cb) return ca.localeCompare(cb);
            return (a.id || 0) - (b.id || 0);
        });

        list.innerHTML = renderRecordTable(rows);
    }

    function emptyMessage() {
        if (currentView === 'unaccounted') {
            return '<div style="text-align: center; padding: 20px; color: #28a745; font-weight: 600;"><i class="fas fa-check-circle"></i> Nothing unaccounted — every active record in scope was seen in the latest scan.</div>';
        }
        if (currentView === 'missing') {
            return '<div style="text-align: center; padding: 20px; color: #999;">No records are flagged as missing in this scope.</div>';
        }
        if (currentView === 'reorder') {
            return '<div style="text-align: center; padding: 20px; color: #999;">Nothing to reorder — no missing or sold records in this scope.</div>';
        }
        return '<div style="text-align: center; padding: 20px; color: #999;">No active records in this scope.</div>';
    }

    // ---------- View switching ----------

    function styleTabs() {
        const tabs = ['all', 'unaccounted', 'missing', 'reorder'];
        tabs.forEach(t => {
            const btn = document.getElementById(`ur-tab-${t}`);
            if (!btn) return;
            const active = t === currentView;
            btn.style.background = active ? '#007bff' : 'white';
            btn.style.color = active ? 'white' : '#333';
        });
    }

    window.urSetView = function(view) {
        if (!['all', 'unaccounted', 'missing', 'reorder'].includes(view)) return;
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

    window.urToggleMissing = function(recordId) {
        toggleMissing(recordId);
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