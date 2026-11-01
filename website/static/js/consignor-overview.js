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
    let coTab  = 'active';

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
            const content = document.getElementById('co-tab-content');
            if (content) content.innerHTML = '<div class="co-empty">Failed to load overview: ' + err.message + '</div>';
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

        setText('co-active-count', active.count || 0);
        setText('co-active-value', money(active.value_cents));
        setText('co-sold-count',   sold.count || 0);
        setText('co-sold-gross',   money(sold.gross_cents));
        setText('co-earned',       money(sold.commission_cents));
        setText('co-owed',         money(pay.owed_cents));
        setText('co-paid',         money(pay.paid_cents) + ' paid');

        const lpEl = document.getElementById('coLastPayout');
        if (lpEl) {
            lpEl.textContent = pay.last_payout_date
                ? 'Last payout: ' + pay.last_payout_date
                : 'No payouts yet';
        }

        renderTab();
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function renderTab() {
        const content = document.getElementById('co-tab-content');
        if (!content || !coData) return;

        document.querySelectorAll('.co-tab').forEach(tab => {
            tab.classList.toggle('co-tab-active', tab.dataset.tab === coTab);
        });

        let rows = [];
        if (coTab === 'active') {
            rows = (coData.on_consignment && coData.on_consignment.records) || [];
            content.innerHTML = rows.length ? rows.map(r => `
                <div class="co-row">
                    <div>
                        <div class="co-title">${esc(r.artist || 'Unknown')} — ${esc(r.title || 'Untitled')}</div>
                        <div class="co-sub">${esc(r.catalog_number || '')} ${r.condition ? '· ' + esc(r.condition) : ''}</div>
                    </div>
                    <div style="font-weight:700;color:#333;">${money(r.store_price_cents)}</div>
                </div>
            `).join('') : '<div class="co-empty">No records currently on consignment.</div>';
        } else if (coTab === 'sold') {
            rows = (coData.sold && coData.sold.records) || [];
            content.innerHTML = rows.length ? rows.map(r => `
                <div class="co-row">
                    <div>
                        <div class="co-title">${esc(r.artist || 'Unknown')} — ${esc(r.title || 'Untitled')}</div>
                        <div class="co-sub">Sold ${esc(r.date_sold || '—')} · ${esc(r.status_name || '')}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700;color:#333;">${money(r.store_price_cents)}</div>
                        <div style="font-size:11px;color:#28a745;">you: ${money(r.commission_cents)}</div>
                    </div>
                </div>
            `).join('') : '<div class="co-empty">No sales yet.</div>';
        } else {
            const payouts = (coData.payouts && coData.payouts.records) || [];
            content.innerHTML = payouts.length ? payouts.map(p => `
                <div class="co-row">
                    <div>
                        <div class="co-title">${money(p.amount_cents)}</div>
                        <div class="co-sub">${esc(p.description || 'Payout')}</div>
                    </div>
                    <div style="font-size:12px;color:#999;">${esc(p.transaction_date || '')}</div>
                </div>
            `).join('') : '<div class="co-empty">No payouts recorded yet.</div>';
        }
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function wireTabs() {
        document.querySelectorAll('.co-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                coTab = this.dataset.tab;
                renderTab();
            });
        });
    }

    window.initConsignorOverview = function() {
        console.log('💿 Consignor overview init');
        console.log('🔧 API Base:', API_BASE);
        coTab = 'active';
        coData = null;
        wireTabs();
        loadOverview();
    };
})();