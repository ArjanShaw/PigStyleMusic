// Consignor Overview — shows a consignor's records, sales, earnings, and payouts
(function() {
    'use strict';

    // ===== API BASE =====
    function getAPIBase() {
        return window.location.hostname === 'localhost'
            ? 'http://localhost:5000'
            : 'https://www.pigstylemusic.com';
    }
    const API_BASE = getAPIBase();

    let coData = null;
    let coFilter = 'all';

    function getUser() {
        try {
            const raw = localStorage.getItem('pigstyle_user');
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    function money(cents) {
        const n = (Number(cents) || 0) / 100;
        return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function rateText(rate) {
        if (rate === null || rate === undefined || rate === '') return 'null';
        return String(rate);
    }

    async function loadOverview() {
        const user = getUser();
        if (!user || !user.logged_in) return;
        try {
            const res = await fetch(API_BASE + '/api/consignor/summary', {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed');
            coData = data;
            renderOverview();
        } catch (err) {
            console.error('Consignor overview load failed:', err);
            const body = document.getElementById('co-tab-content');
            if (body) body.innerHTML = '<tr><td colspan="5" class="co-empty">Failed to load: ' + err.message + '</td></tr>';
        }
    }

    function renderOverview() {
        const user = getUser();
        const uName = (user && (user.full_name || user.username)) || 'Consignor';
        const uEl = document.getElementById('coUser');
        if (uEl) uEl.textContent = 'Welcome back, ' + uName;

        const active = coData.on_consignment || {};
        const sold   = coData.sold || {};
        const pay    = coData.payouts || {};

        const totalSalesCents = sold.gross_cents || 0;
        const commissionCents = sold.commission_cents || 0;
        const earnedCents = Math.max(0, totalSalesCents - commissionCents);
        const paidCents = pay.paid_cents || 0;
        const owedCents = earnedCents - paidCents;

        setText('co-ov-on-consignment', active.count || 0);
        setText('co-ov-sold', sold.count || 0);
        setText('co-ov-unsold', active.count || 0);
        setText('co-ov-sales', money(totalSalesCents));
        setText('co-ov-commission', money(commissionCents));
        setText('co-ov-earned', money(earnedCents));
        setText('co-ov-owed', money(owedCents));

        const lpEl = document.getElementById('coLastPayout');
        if (lpEl) {
            lpEl.textContent = pay.last_payout_date
                ? 'Last payout: ' + pay.last_payout_date
                : 'No payouts yet';
        }

        renderRecords();
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function renderRecords() {
        const body = document.getElementById('co-tab-content');
        if (!body || !coData) return;

        const activeRows = (coData.on_consignment && coData.on_consignment.records) || [];
        const soldRows = (coData.sold && coData.sold.records) || [];

        const activeMapped = activeRows.map(function(r) {
            return {
                id: r.id,
                artist: r.artist,
                title: r.title,
                store_price_cents: r.store_price_cents,
                commission_rate: r.commission_rate,
                status_name: 'Active',
                sold: false
            };
        });
        const soldMapped = soldRows.map(function(r) {
            return {
                id: r.id,
                artist: r.artist,
                title: r.title,
                store_price_cents: r.store_price_cents,
                commission_rate: r.commission_rate,
                status_name: r.status_name || 'Sold',
                sold: true
            };
        });

        let rows = [];
        if (coFilter === 'sold') {
            rows = soldMapped;
        } else if (coFilter === 'active') {
            rows = activeMapped;
        } else {
            rows = activeMapped.concat(soldMapped);
        }

        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="5" class="co-empty">No records.</td></tr>';
            return;
        }

        body.innerHTML = rows.map(function(r) {
            const statusColor = r.sold ? '#28a745' : '#007bff';
            return ''
                + '<tr>'
                +   '<td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;color:#333;">' + esc(r.artist || 'Unknown') + '</td>'
                +   '<td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;color:#333;">' + esc(r.title || 'Untitled') + '</td>'
                +   '<td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:#333;">' + money(r.store_price_cents) + '</td>'
                +   '<td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:#333;">' + esc(rateText(r.commission_rate)) + '</td>'
                +   '<td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;color:' + statusColor + ';font-weight:600;">' + esc(r.status_name) + '</td>'
                + '</tr>';
        }).join('');
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function showTab(tabName) {
        const overview = document.getElementById('co-tab-overview');
        const records = document.getElementById('co-tab-records');
        if (!overview || !records) return;

        if (tabName === 'overview') {
            overview.style.display = 'flex';
            records.style.display = 'none';
        } else {
            overview.style.display = 'none';
            records.style.display = 'flex';
        }

        document.querySelectorAll('.co-tab').forEach(function(tab) {
            tab.classList.toggle('co-tab-active', tab.dataset.tab === tabName);
        });
    }

    function setFilter(filter) {
        coFilter = filter;
        document.querySelectorAll('.co-filter').forEach(function(btn) {
            if (btn.dataset.filter === filter) {
                btn.style.background = '#6d4fc6';
                btn.style.color = 'white';
                btn.style.borderColor = '#6d4fc6';
            } else {
                btn.style.background = 'white';
                btn.style.color = '#666';
                btn.style.borderColor = '#ddd';
            }
        });
        renderRecords();
    }

    function wireEvents() {
        document.querySelectorAll('.co-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                showTab(this.dataset.tab);
            });
        });
        document.querySelectorAll('.co-filter').forEach(function(btn) {
            btn.addEventListener('click', function() {
                setFilter(this.dataset.filter);
            });
        });
    }

    window.initConsignorOverview = function() {
        console.log('💿 Consignor overview init');
        console.log('🔧 API Base:', API_BASE);
        coData = null;
        coFilter = 'all';
        showTab('overview');
        setFilter('all');
        wireEvents();
        loadOverview();
    };
})();