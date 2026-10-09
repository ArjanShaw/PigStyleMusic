// ================================================================
// FILE: /static/js/discogs.js
// Discogs Orders tile — self-contained, loads orders on demand
// ================================================================

(function() {
    'use strict';

    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    // Orders-related state
    let discogsOrders = [];
    let discogsCurrentOrderId = null;

    // Shipping label modal state
    let discogsSelectedLabelPosition = 'LT';
    let discogsPendingLabelOrder = null;

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatMoney(v) {
        const n = Number(v);
        if (!isFinite(n)) return '—';
        return '$' + n.toFixed(2);
    }

    function formatDate(s) {
        if (!s) return '—';
        try {
            const d = new Date(s);
            if (isNaN(d.getTime())) return s;
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (_) {
            return s;
        }
    }

    // ----------------------------------------------------------------
    // STATUS MESSAGE
    // ----------------------------------------------------------------

    function showDiscogsOrdersStatus(message, type) {
        const el = document.getElementById('discogs-orders-status-msg');
        if (!el) return;
        const colors = {
            info:    { bg: '#e7f3ff', color: '#0d47a1', border: '#b3d9ff' },
            success: { bg: '#e8f5e9', color: '#1b5e20', border: '#a5d6a7' },
            warning: { bg: '#fff8e1', color: '#7a4f01', border: '#ffe082' },
            error:   { bg: '#ffebee', color: '#b71c1c', border: '#ef9a9a' },
        };
        const c = colors[type] || colors.info;
        el.style.display = 'block';
        el.style.background = c.bg;
        el.style.color = c.color;
        el.style.border = `1px solid ${c.border}`;
        el.innerHTML = message;
        if (type === 'success' || type === 'info') {
            setTimeout(() => { el.style.display = 'none'; }, 6000);
        }
    }

    function setLoadInfo(text) {
        const el = document.getElementById('discogs-load-orders-info');
        if (el) el.textContent = text;
    }

    // ----------------------------------------------------------------
    // ORDERS LOAD / RENDER
    // ----------------------------------------------------------------

    window.discogsLoadOrders = async function() {
        const table = document.getElementById('discogs-orders-table');
        const btn = document.getElementById('discogs-load-orders-btn');

        if (table) {
            table.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">Loading orders...</div>';
        }
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Loading...';
        }
        setLoadInfo('Fetching orders from Discogs...');

        try {
            const resp = await fetch(`${API_BASE}/api/discogs/orders?all=true`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await resp.json();

            if (!resp.ok || data.status !== 'success') {
                throw new Error(data.error || `HTTP ${resp.status}`);
            }

            discogsOrders = data.orders || [];
            renderDiscogsOrders();

            setLoadInfo(`✅ Loaded ${discogsOrders.length} order(s).`);
            showDiscogsOrdersStatus(`✅ Loaded ${discogsOrders.length} order(s).`, 'success');
        } catch (err) {
            console.error('Failed to load Discogs orders:', err);
            if (table) {
                table.innerHTML = `<div style="text-align:center;padding:20px;color:#dc3545;">Failed to load orders: ${escapeHtml(err.message)}</div>`;
            }
            setLoadInfo(`❌ ${err.message}`);
            showDiscogsOrdersStatus(`❌ ${escapeHtml(err.message)}`, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '📥 Load Orders';
            }
        }
    };

    // Button click entry point (bound via addEventListener in init)
    window.discogsLoadOrdersClick = function() {
        window.discogsLoadOrders();
    };

    function renderDiscogsOrders() {
        const table = document.getElementById('discogs-orders-table');
        if (!table) return;

        const statusFilter = (document.getElementById('discogs-orders-status')?.value || '').trim();
        const dateFrom = document.getElementById('discogs-orders-date-from')?.value || '';
        const dateTo = document.getElementById('discogs-orders-date-to')?.value || '';
        const search = (document.getElementById('discogs-orders-search')?.value || '').trim().toLowerCase();

        let filtered = discogsOrders.slice();

        if (statusFilter) {
            filtered = filtered.filter(o => (o.status || '') === statusFilter);
        }
        if (dateFrom) {
            filtered = filtered.filter(o => (o.created || '').slice(0, 10) >= dateFrom);
        }
        if (dateTo) {
            filtered = filtered.filter(o => (o.created || '').slice(0, 10) <= dateTo);
        }
        if (search) {
            filtered = filtered.filter(o => {
                const buyer = (o.buyer?.username || '').toLowerCase();
                const name = (o.buyer?.name || '').toLowerCase();
                return buyer.includes(search) || name.includes(search);
            });
        }

        if (filtered.length === 0) {
            table.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">No orders match the current filters.</div>';
            return;
        }

        let html = `
            <table style="width:100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background:#f1f3f5; border-bottom:2px solid #dee2e6;">
                        <th style="padding:8px; text-align:left; color:#495057;">Order</th>
                        <th style="padding:8px; text-align:left; color:#495057;">Buyer</th>
                        <th style="padding:8px; text-align:left; color:#495057;">Date</th>
                        <th style="padding:8px; text-align:left; color:#495057;">Status</th>
                        <th style="padding:8px; text-align:right; color:#495057;">Total</th>
                        <th style="padding:8px; text-align:center; color:#495057;">Items</th>
                        <th style="padding:8px; text-align:center; color:#495057;">Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const o of filtered) {
            const buyer = o.buyer?.username || o.buyer?.name || '—';
            const orderId = o.id || o.order_id || '';
            const status = o.status || '—';
            const total = o.total?.value != null ? formatMoney(o.total.value) : '—';
            const items = (o.items || []).length;
            const created = formatDate(o.created);

            html += `
                <tr style="border-bottom:1px solid #f0f0f0;">
                    <td style="padding:8px; color:#333; font-weight:600;">#${escapeHtml(String(orderId))}</td>
                    <td style="padding:8px; color:#333;">${escapeHtml(buyer)}</td>
                    <td style="padding:8px; color:#666;">${escapeHtml(created)}</td>
                    <td style="padding:8px; color:#333;">${escapeHtml(status)}</td>
                    <td style="padding:8px; text-align:right; color:#0064d2; font-weight:600;">${total}</td>
                    <td style="padding:8px; text-align:center; color:#666;">${items}</td>
                    <td style="padding:8px; text-align:center;">
                        <button onclick="discogsViewOrder('${escapeHtml(String(orderId))}')"
                                style="padding:4px 12px; background:#667eea; color:white; border:none; border-radius:14px; cursor:pointer; font-size:12px; font-weight:600;">
                            View
                        </button>
                    </td>
                </tr>
            `;
        }

        html += '</tbody></table>';
        table.innerHTML = html;
    }

    // ----------------------------------------------------------------
    // ORDER DETAIL
    // ----------------------------------------------------------------

    window.discogsViewOrder = async function(orderId) {
        const section = document.getElementById('discogs-order-items-section');
        const itemsEl = document.getElementById('discogs-order-items');
        const summaryEl = document.getElementById('discogs-order-summary');

        if (!section || !itemsEl) return;

        section.style.display = 'block';
        itemsEl.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">Loading order items...</div>';
        if (summaryEl) summaryEl.textContent = '';

        try {
            const resp = await fetch(`${API_BASE}/api/discogs/orders/${encodeURIComponent(orderId)}`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await resp.json();

            if (!resp.ok || data.status !== 'success') {
                throw new Error(data.error || `HTTP ${resp.status}`);
            }

            const order = data.order || {};
            discogsCurrentOrderId = orderId;
            discogsPendingLabelOrder = order;

            renderDiscogsOrderItems(order);
        } catch (err) {
            console.error('Failed to load order detail:', err);
            itemsEl.innerHTML = `<div style="text-align:center;padding:20px;color:#dc3545;">Failed to load order: ${escapeHtml(err.message)}</div>`;
        }
    };

    function renderDiscogsOrderItems(order) {
        const itemsEl = document.getElementById('discogs-order-items');
        const summaryEl = document.getElementById('discogs-order-summary');
        if (!itemsEl) return;

        const items = order.items || [];
        const buyer = order.buyer?.username || order.buyer?.name || '—';
        const total = order.total?.value != null ? formatMoney(order.total.value) : '—';

        if (summaryEl) {
            summaryEl.textContent = `${buyer} · ${items.length} item(s) · ${total}`;
        }

        if (items.length === 0) {
            itemsEl.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">No items on this order.</div>';
            return;
        }

        let html = `
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                    <tr style="background:#f1f3f5; border-bottom:2px solid #dee2e6;">
                        <th style="padding:6px; text-align:left; color:#495057;">Release</th>
                        <th style="padding:6px; text-align:left; color:#495057;">Condition</th>
                        <th style="padding:6px; text-align:right; color:#495057;">Price</th>
                        <th style="padding:6px; text-align:center; color:#495057;">PigStyle ID</th>
                        <th style="padding:6px; text-align:center; color:#495057;">Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const item of items) {
            const release = item.release?.description || item.title || '—';
            const condition = item.condition || '—';
            const price = item.price != null ? formatMoney(item.price) : '—';
            const pigId = item.pigstyle_id != null ? item.pigstyle_id : '—';
            const recStatus = item.record_status_id;

            let statusBadge = '<span style="color:#999;">—</span>';
            if (recStatus === 3 || recStatus === 4) {
                statusBadge = '<span style="background:#e8f5e9; color:#1b5e20; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;">Sold</span>';
            } else if (recStatus === 2) {
                statusBadge = '<span style="background:#e3f2fd; color:#0d47a1; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;">Active</span>';
            } else if (recStatus != null) {
                statusBadge = `<span style="background:#eee; color:#333; padding:2px 8px; border-radius:10px; font-size:11px;">${escapeHtml(String(recStatus))}</span>`;
            }

            html += `
                <tr style="border-bottom:1px solid #f0f0f0;">
                    <td style="padding:6px; color:#333;">${escapeHtml(release)}</td>
                    <td style="padding:6px; color:#666;">${escapeHtml(condition)}</td>
                    <td style="padding:6px; text-align:right; color:#0064d2; font-weight:600;">${price}</td>
                    <td style="padding:6px; text-align:center; color:#666;">${escapeHtml(String(pigId))}</td>
                    <td style="padding:6px; text-align:center;">${statusBadge}</td>
                </tr>
            `;
        }

        html += '</tbody></table>';
        itemsEl.innerHTML = html;
    }

    window.discogsShowAllOrders = function() {
        const section = document.getElementById('discogs-order-items-section');
        if (section) section.style.display = 'none';
        discogsCurrentOrderId = null;
    };

    window.discogsOrdersApplyFilters = function() {
        renderDiscogsOrders();
    };

    // ----------------------------------------------------------------
    // BULK MARK PAID ORDERS SOLD
    // ----------------------------------------------------------------

    window.discogsBulkMarkPaidOrdersSold = async function() {
        if (!confirm('Mark all records in Payment Received orders as sold on Discogs?')) return;

        showDiscogsOrdersStatus('⏳ Marking paid orders as sold...', 'info');

        try {
            const resp = await fetch(`${API_BASE}/api/discogs/bulk-mark-paid-orders-sold`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await resp.json();

            if (!resp.ok || data.status !== 'success') {
                throw new Error(data.error || `HTTP ${resp.status}`);
            }

            const msg = `✅ Marked ${data.marked || 0} record(s) as sold. Skipped ${data.skipped || 0}, not found ${data.not_found || 0}.`;
            showDiscogsOrdersStatus(msg, 'success');
            window.discogsLoadOrders();
        } catch (err) {
            console.error('Bulk mark sold failed:', err);
            showDiscogsOrdersStatus(`❌ ${escapeHtml(err.message)}`, 'error');
        }
    };

    // ----------------------------------------------------------------
    // SHIPPING LABEL MODAL
    // ----------------------------------------------------------------

    window.discogsPrintShippingLabel = function() {
        const modal = document.getElementById('discogs-shipping-modal');
        if (!modal) return;

        const order = discogsPendingLabelOrder;
        if (!order) {
            showDiscogsOrdersStatus('⚠️ Open an order before generating a shipping label.', 'warning');
            return;
        }

        const orderIdEl = document.getElementById('discogs-label-order-id');
        const buyerEl   = document.getElementById('discogs-label-buyer');
        const itemsEl   = document.getElementById('discogs-label-items');

        const orderId = order.id || order.order_id || discogsCurrentOrderId || '—';
        const buyer = order.buyer?.username || order.buyer?.name || '—';
        const items = (order.items || []).length;

        if (orderIdEl) orderIdEl.textContent = orderId;
        if (buyerEl) buyerEl.textContent = buyer;
        if (itemsEl) itemsEl.textContent = `${items} item(s)`;

        modal.style.display = 'flex';
    };

    window.discogsCloseShippingModal = function() {
        const modal = document.getElementById('discogs-shipping-modal');
        if (modal) modal.style.display = 'none';
    };

    window.discogsSelectLabelPosition = function(pos) {
        discogsSelectedLabelPosition = pos;
        ['LT', 'RT', 'LB', 'RB'].forEach(p => {
            const btn = document.getElementById(`discogs-pos-${p}`);
            if (!btn) return;
            if (p === pos) {
                btn.style.border = '2px solid #007bff';
                btn.style.background = '#e7f3ff';
            } else {
                btn.style.border = '2px solid #ddd';
                btn.style.background = 'white';
            }
        });
    };

    window.discogsPrintLabel = function() {
        const fileInput = document.getElementById('discogs-label-pdf');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            alert('Please upload a PDF label first.');
            return;
        }

        alert(`Label position: ${discogsSelectedLabelPosition}\nFile: ${fileInput.files[0].name}\n\n(Print pipeline to be wired up server-side.)`);
    };

    // ----------------------------------------------------------------
    // INIT — wires button + modal once the tile is in the DOM
    // ----------------------------------------------------------------

    function wireTile() {
        const loadBtn = document.getElementById('discogs-load-orders-btn');
        if (loadBtn && !loadBtn._wired) {
            loadBtn._wired = true;
            loadBtn.addEventListener('click', function(e) {
                e.preventDefault();
                window.discogsLoadOrders();
            });
        }

        const modal = document.getElementById('discogs-shipping-modal');
        if (modal && !modal._wired) {
            modal._wired = true;
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    window.discogsCloseShippingModal();
                }
            });
        }
    }

    // app.js calls window.initDiscogsHub when the tile renders.
    window.initDiscogsHub = function() {
        console.log('📦 Discogs tile init');
        wireTile();
        // Do not auto-load; user clicks the button.
    };

    // Alias so other code paths can call it too.
    window.initDiscogsOrders = function() {
        console.log('📦 Discogs Orders tile initialized (auto-load)');
        wireTile();
        window.discogsLoadOrders();
    };

    console.log('✅ discogs.js loaded');
})();