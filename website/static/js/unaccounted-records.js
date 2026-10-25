// Unaccounted Records tile
// Loaded by index.html + INIT_MAP in app.js as 'unaccounted-records' -> 'initUnaccountedRecords'
// Uses existing GET /records (NOT /api/records — that path 404s).
(function() {
    'use strict';

    console.log('🔍 Unaccounted Records module loaded');

    let allRecords = [];
    let unaccounted = [];
    let cutoffDate = null;

    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

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
        if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return null;
        return part;
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

    function recomputeUnaccounted() {
        let maxRescan = null;
        allRecords.forEach(r => {
            if (r.status_id === 3 || r.status_id === 4) return;
            const c = dateOnly(r.created_at);
            const l = dateOnly(r.last_seen);
            if (c && l && l > c) {
                if (!maxRescan || l > maxRescan) maxRescan = l;
            }
        });
        cutoffDate = maxRescan;

        unaccounted = allRecords.filter(r => {
            if (r.status_id === 3 || r.status_id === 4) return false;
            const c = dateOnly(r.created_at);
            const l = dateOnly(r.last_seen);
            if (!l) return true;
            if (!c) return true;
            const isUnscanned = l <= c;
            if (!isUnscanned) return false;
            if (cutoffDate && c > cutoffDate) return false;
            return true;
        });

        unaccounted.sort((a, b) => {
            const ca = dateOnly(a.created_at) || '';
            const cb = dateOnly(b.created_at) || '';
            if (ca < cb) return -1;
            if (ca > cb) return 1;
            return (a.id || 0) - (b.id || 0);
        });
    }

    async function loadUnaccounted() {
        const list = document.getElementById('ur-list');
        if (!list) return;
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        try {
            const url = `${API_BASE}/records?status_ids=2&order_by=created_at&order_dir=ASC`;
            const response = await fetch(url, { credentials: 'include', headers: getHeaders() });
            const data = await response.json();

            if (data.status === 'success') {
                allRecords = data.records || [];
                recomputeUnaccounted();
                renderTable();
                updateStats();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${escapeHtml(data.error || 'Failed to load')}</div>`;
            }
        } catch (err) {
            console.error('Error loading unaccounted records:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${escapeHtml(err.message)}</div>`;
        }
    }

    function renderTable() {
        const list = document.getElementById('ur-list');
        if (!list) return;

        const search = (document.getElementById('ur-search')?.value || '').toLowerCase().trim();

        let filtered = unaccounted;
        if (search) {
            filtered = unaccounted.filter(r =>
                (r.artist || '').toLowerCase().includes(search) ||
                (r.title || '').toLowerCase().includes(search) ||
                String(r.id).includes(search)
            );
        }

        if (!filtered || filtered.length === 0) {
            if (unaccounted.length === 0) {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #28a745; font-weight: 600;"><i class="fas fa-check-circle"></i> No unaccounted records — everything has been scanned!</div>';
            } else {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No records match your search</div>';
            }
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Artist</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Title</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Date Added</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Days Old</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Last Seen</th>
                </tr>
            </thead>
            <tbody>`;

        filtered.forEach(r => {
            const age = daysAgo(r.created_at);
            const ageColor = age == null ? '#999' : age > 30 ? '#dc3545' : age > 7 ? '#ffc107' : '#666';
            const createdTxt = dateOnly(r.created_at) || '—';
            const lastSeenTxt = dateOnly(r.last_seen);
            const lastSeenCell = lastSeenTxt
                ? escapeHtml(lastSeenTxt)
                : '<span style="color:#dc3545;font-weight:600;">never</span>';

            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-family: monospace;">#${escapeHtml(r.id)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${escapeHtml(r.artist || '—')}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(r.title || '—')}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${escapeHtml(createdTxt)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: ${ageColor}; font-weight: 600;">${age == null ? '—' : age}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${lastSeenCell}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        list.innerHTML = html;
    }

    function updateStats() {
        const totalEl = document.getElementById('ur-total-unaccounted');
        const cutoffEl = document.getElementById('ur-cutoff-date');
        const oldestEl = document.getElementById('ur-oldest-days');

        if (totalEl) totalEl.textContent = unaccounted.length;
        if (cutoffEl) cutoffEl.textContent = cutoffDate || '—';

        if (oldestEl) {
            let oldest = 0;
            unaccounted.forEach(r => {
                const d = daysAgo(r.created_at);
                if (d != null && d > oldest) oldest = d;
            });
            oldestEl.textContent = oldest;
        }
    }

    window.urRefresh = function() {
        loadUnaccounted();
    };

    window.urSearch = function() {
        renderTable();
    };

    window.urClearSearch = function() {
        const input = document.getElementById('ur-search');
        if (input) input.value = '';
        renderTable();
    };

    // app.js INIT_MAP['unaccounted-records'] -> 'initUnaccountedRecords'
    window.initUnaccountedRecords = function() {
        console.log('🔍 Unaccounted Records initialized');
        loadUnaccounted();

        const searchInput = document.getElementById('ur-search');
        if (searchInput && !searchInput.dataset.wired) {
            searchInput.dataset.wired = '1';
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') window.urSearch();
            });
        }
    };
})();