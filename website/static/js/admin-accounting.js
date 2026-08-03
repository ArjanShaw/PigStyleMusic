// ============================================================
// admin-accounting.js – Accounting Module
// ============================================================

let journalCurrentPage = 1;
const journalPageSize = 20;
let journalTotalEntries = 0;
let currentReportData = null;

// Global list of accounts for bank dropdowns
let bankAccounts = [];

// Chart instances
let plChartInstance = null;
let cashFlowChartInstance = null;
let bsChartInstance = null;
let expandedChartInstance = null;
let isExpanded = false;

// Chart data cache for breakdown modal
let plChartData = null;
let cashFlowChartData = null;
let bsChartData = null;
let plMonths = [];
let cashFlowMonths = [];
let bsMonths = [];
let allPLData = null;
let allCashFlowData = null;
let allBSData = null;

// Account name to ID mapping
let accountNameToId = {};

// Track which chart type is currently open for breakdown
let currentBreakdownChartType = 'pl';
let currentBreakdownMonth = '';
let currentBreakdownMonths = [];
let currentBreakdownMonthIndex = -1;

// Reconciliation slider instance
let reconcileSlider = null;
let reconcileMinDate = null;
let reconcileMaxDate = null;
let selectedPairId = null;

// ============================================================
// TOAST NOTIFICATION
// ============================================================

function showToast(message, type = 'success') {
    console.log('[TOAST]', type, message);
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        background: ${type === 'success' ? '#28a745' : '#17a2b8'};
        max-width: 400px;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add animation styles if not present
if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

// ============================================================
// DATE FORMATTING UTILITY
// ============================================================

function formatReconDate(dateStr) {
    if (!dateStr) return '—';
    try {
        let date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            const parts = dateStr.split('T')[0].split('-');
            if (parts.length === 3) {
                date = new Date(parts[0], parts[1] - 1, parts[2]);
            }
        }
        if (isNaN(date.getTime())) return dateStr;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    } catch (e) {
        return dateStr;
    }
}

// ============================================================
// PAYPAL PLAID CONNECTION
// ============================================================

async function connectPayPalPlaid() {
    console.log('[PLAID] Connecting PayPal');
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/plaid/paypal/create-link-token`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        
        if (!data.link_token) {
            alert('Failed to get link token: ' + (data.error || 'Unknown error'));
            return;
        }
        
        const handler = Plaid.create({
            token: data.link_token,
            onSuccess: async (public_token, metadata) => {
                console.log('[PLAID] PayPal connection success');
                
                const exchangeRes = await fetch(`${AppConfig.baseUrl}/api/plaid/paypal/exchange`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ public_token })
                });
                const exchangeData = await exchangeRes.json();
                if (exchangeData.status === 'success') {
                    showToast('PayPal connected successfully!', 'success');
                    loadBankTransactions();
                } else {
                    alert('Failed to connect PayPal: ' + (exchangeData.error || 'Unknown error'));
                }
            },
            onExit: (err, metadata) => {
                if (err) {
                    console.error('[PLAID] PayPal exit error:', err);
                    alert('Error: ' + (err.display_message || err.error_message || 'Unknown error'));
                }
            }
        });
        handler.open();
    } catch (e) {
        console.error('[PLAID] PayPal error:', e);
        alert('Failed to initiate PayPal connection: ' + e.message);
    }
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[INIT] DOM loaded');
    const accountingContainer = document.getElementById('accounting-container');
    if (!accountingContainer) {
        console.error('[INIT] No accounting container found');
        return;
    }
    console.log('[INIT] Accounting container found');

    // Sub-tab switching
    document.querySelectorAll('#accounting-sub-tabs .sub-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const sub = this.dataset.subtab;
            console.log('[INIT] Tab clicked:', sub);
            document.querySelectorAll('#accounting-sub-tabs .sub-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('#accounting-container .sub-tab-content').forEach(c => c.classList.remove('active'));
            const target = document.getElementById('sub-' + sub);
            if (target) target.classList.add('active');

            if (sub === 'import') {
                loadBankTransactions();
            }
            else if (sub === 'accounts') {
                loadAccountsList();
            }
            else if (sub === 'journal') {
                loadJournalEntries();
            }
            else if (sub === 'reconcile') {
                loadReconcileAccountSelects();
                loadReconcilePairsSummary();
            }
            else if (sub === 'cash-flow') {
                console.log('[INIT] Cash Flow tab selected');
                const now = new Date();
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                const endInput = document.getElementById('cash-flow-end');
                if (!endInput.value) endInput.value = nextMonth.toISOString().slice(0, 7);
                const startInput = document.getElementById('cash-flow-start');
                if (!startInput.value) {
                    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                    startInput.value = startDate.toISOString().slice(0, 7);
                }
                if (bankAccounts.length === 0) {
                    loadBankAccountsForRowDropdowns().then(() => {
                        loadCashFlow();
                    });
                } else {
                    loadCashFlow();
                }
            }
            else if (sub === 'monthly-pl') {
                console.log('[INIT] Monthly P&L tab selected');
                const now = new Date();
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                const endInput = document.getElementById('pl-end');
                if (!endInput.value) endInput.value = nextMonth.toISOString().slice(0, 7);
                const startInput = document.getElementById('pl-start');
                if (!startInput.value) {
                    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                    startInput.value = startDate.toISOString().slice(0, 7);
                }
                if (bankAccounts.length === 0) {
                    loadBankAccountsForRowDropdowns().then(() => {
                        loadMonthlyPL();
                    });
                } else {
                    loadMonthlyPL();
                }
            }
            else if (sub === 'balance-sheet') {
                console.log('[INIT] Balance Sheet tab selected');
                const now = new Date();
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                const endInput = document.getElementById('bs-end');
                if (!endInput.value) endInput.value = nextMonth.toISOString().slice(0, 7);
                const startInput = document.getElementById('bs-start');
                if (!startInput.value) {
                    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                    startInput.value = startDate.toISOString().slice(0, 7);
                }
                if (bankAccounts.length === 0) {
                    loadBankAccountsForRowDropdowns().then(() => {
                        loadBalanceSheet();
                    });
                } else {
                    loadBalanceSheet();
                }
            }
            else if (sub === 'reports') {
                // nothing to auto-load
            }
        });
    });

    // Pagination for journal
    document.getElementById('journal-prev')?.addEventListener('click', () => {
        if (journalCurrentPage > 1) { journalCurrentPage--; loadJournalEntries(); }
    });
    document.getElementById('journal-next')?.addEventListener('click', () => {
        const totalPages = Math.ceil(journalTotalEntries / journalPageSize);
        if (journalCurrentPage < totalPages) { journalCurrentPage++; loadJournalEntries(); }
    });

    // Load accounts into dropdowns
    loadAccountSelects();

    // Load default date range for reports
    const today = new Date().toISOString().split('T')[0];
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    document.getElementById('report-date-from').value = firstDay;
    document.getElementById('report-date-to').value = today;

    // Load import (bank) by default
    loadBankTransactions();

    // ---- Handle OAuth redirect from Plaid ----
    const urlParams = new URLSearchParams(window.location.search);
    const publicToken = urlParams.get('public_token');
    if (publicToken) {
        console.log('[INIT] Plaid OAuth redirect detected');
        fetch('/api/plaid/exchange', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({public_token: publicToken})
        })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                alert('Bank connected successfully!');
                window.history.replaceState({}, document.title, window.location.pathname);
                loadBankTransactions();
            } else {
                alert('Failed to connect bank: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(err => {
            alert('Error: ' + err.message);
        });
    }

    // ---- Import (Bank) Tab: Search button and Enter key ----
    document.getElementById('bank-search-btn')?.addEventListener('click', function() {
        console.log('[BANK] Search button clicked');
        loadBankTransactions();
    });

    document.getElementById('bank-filter')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            console.log('[BANK] Enter key pressed in search');
            loadBankTransactions();
        }
    });

    // Auto-load when source or view filter changes
    document.getElementById('bank-source')?.addEventListener('change', function() {
        loadBankTransactions();
    });
    document.getElementById('bank-view-filter')?.addEventListener('change', function() {
        loadBankTransactions();
    });

    // Accounts tab - add account form
    document.getElementById('add-account-btn')?.addEventListener('click', function() {
        console.log('[INIT] Add account button clicked');
        document.getElementById('add-account-modal').classList.add('active');
    });

    document.getElementById('close-add-account-modal')?.addEventListener('click', function() {
        console.log('[INIT] Close add account modal');
        document.getElementById('add-account-modal').classList.remove('active');
    });

    document.getElementById('save-account-btn')?.addEventListener('click', function() {
        console.log('[INIT] Save account button clicked');
        saveAccount();
    });

    // Close modal on overlay
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                console.log('[INIT] Modal overlay clicked, closing');
                this.classList.remove('active');
            }
        });
    });

    // Save reconcile pair button
    document.getElementById('save-reconcile-pair-btn')?.addEventListener('click', async function() {
        const name = document.getElementById('reconcile-pair-name').value.trim();
        const description = document.getElementById('reconcile-pair-description').value.trim();
        const accountA = document.getElementById('reconcile-pair-account-a').value;
        const accountB = document.getElementById('reconcile-pair-account-b').value;
        if (!accountA || !accountB) {
            alert('Please select both accounts.');
            return;
        }
        if (accountA === accountB) {
            alert('Accounts must be different.');
            return;
        }
        try {
            const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/pairs`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_a_id: parseInt(accountA), account_b_id: parseInt(accountB), name, description })
            });
            const data = await res.json();
            if (data.status === 'success') {
                document.getElementById('reconcile-pair-modal').classList.remove('active');
                loadReconcilePairsSummary();
            } else {
                alert(data.error || 'Failed to add pair.');
            }
        } catch (err) {
            console.error(err);
            alert('Error adding pair.');
        }
    });

    // Save edit reconcile pair button
    document.getElementById('save-reconcile-edit-btn')?.addEventListener('click', async function() {
        const id = document.getElementById('reconcile-edit-id').value;
        const name = document.getElementById('reconcile-edit-name').value.trim();
        const description = document.getElementById('reconcile-edit-description').value.trim();
        if (!name) {
            alert('Name is required.');
            return;
        }
        try {
            const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/pairs/${id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description })
            });
            const data = await res.json();
            if (data.status === 'success') {
                document.getElementById('reconcile-edit-modal').classList.remove('active');
                loadReconcilePairsSummary();
            } else {
                alert(data.error || 'Failed to update pair.');
            }
        } catch (err) {
            console.error(err);
            alert('Error updating pair.');
        }
    });

    console.log('[INIT] Initialization complete');
});

// ============================================================
// ACCOUNT DROPDOWNS
// ============================================================

async function loadAccountSelects() {
    console.log('[ACCOUNTS] Loading account dropdowns');
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to load accounts');
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[ACCOUNTS] Loaded', data.accounts.length, 'accounts');
            const selects = document.querySelectorAll('.manual-account, #journal-account-filter');
            selects.forEach(sel => {
                const currentVal = sel.value;
                sel.innerHTML = '<option value="">Select Account</option>';
                data.accounts.forEach(acc => {
                    const opt = document.createElement('option');
                    opt.value = acc.id;
                    opt.textContent = acc.code + ' - ' + acc.name;
                    sel.appendChild(opt);
                });
                sel.value = currentVal;
            });
        }
    } catch (err) {
        console.error('[ACCOUNTS] Error loading accounts:', err);
    }
}

async function loadReconcileAccountSelects() {
    console.log('[RECONCILE] Loading account dropdowns for add pair modal');
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to load accounts');
        const data = await res.json();
        if (data.status === 'success') {
            const selA = document.getElementById('reconcile-pair-account-a');
            const selB = document.getElementById('reconcile-pair-account-b');
            if (selA && selB) {
                selA.innerHTML = '<option value="">Select Account</option>';
                selB.innerHTML = '<option value="">Select Account</option>';
                data.accounts.forEach(acc => {
                    const optA = document.createElement('option');
                    optA.value = acc.id;
                    optA.textContent = acc.code + ' - ' + acc.name;
                    selA.appendChild(optA);
                    const optB = document.createElement('option');
                    optB.value = acc.id;
                    optB.textContent = acc.code + ' - ' + acc.name;
                    selB.appendChild(optB);
                });
            }
        }
    } catch (err) {
        console.error('[RECONCILE] Error loading accounts:', err);
    }
}

// ============================================================
// RECONCILIATION – DATE RANGE SLIDER
// ============================================================

async function loadReconcileDateRange(account1, account2, callback) {
    console.log('[RECONCILE] Loading date range for accounts:', account1, account2);
    try {
        const params = new URLSearchParams({ account1, account2 });
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/date-range?${params.toString()}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to fetch date range');
        const data = await res.json();
        if (data.status === 'success') {
            const minDate = data.min_date;
            const maxDate = data.max_date;
            reconcileMinDate = new Date(minDate);
            reconcileMaxDate = new Date(maxDate);
            initReconcileSlider(reconcileMinDate, reconcileMaxDate);
            if (callback) callback();
        } else {
            showToast('Error loading date range: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (err) {
        console.error('[RECONCILE] Error loading date range:', err);
        showToast('Error loading date range: ' + err.message, 'error');
    }
}

function initReconcileSlider(minDate, maxDate) {
    const sliderContainer = document.getElementById('reconcile-slider');
    if (!sliderContainer) return;

    if (typeof noUiSlider === 'undefined') {
        console.error('[RECONCILE] noUiSlider library not loaded');
        showToast('Slider library not loaded. Please refresh.', 'error');
        return;
    }

    if (reconcileSlider) {
        reconcileSlider.destroy();
        reconcileSlider = null;
    }

    const minTimestamp = minDate.getTime();
    const maxTimestamp = maxDate.getTime();

    noUiSlider.create(sliderContainer, {
        start: [minTimestamp, maxTimestamp],
        connect: true,
        range: {
            'min': minTimestamp,
            'max': maxTimestamp
        },
        step: 86400000,
        format: {
            to: function(value) {
                return Math.round(value);
            },
            from: function(value) {
                return Number(value);
            }
        }
    });

    reconcileSlider = sliderContainer.noUiSlider;

    sliderContainer.noUiSlider.on('update', function(values, handle) {
        const leftTimestamp = parseInt(values[0]);
        const rightTimestamp = parseInt(values[1]);
        const leftDate = new Date(leftTimestamp);
        const rightDate = new Date(rightTimestamp);
        const startLabel = document.getElementById('reconcile-date-start-label');
        const endLabel = document.getElementById('reconcile-date-end-label');
        if (startLabel) startLabel.textContent = formatReconDate(leftDate.toISOString().split('T')[0]);
        if (endLabel) endLabel.textContent = formatReconDate(rightDate.toISOString().split('T')[0]);
    });

    sliderContainer.noUiSlider.on('change', function() {
        loadReconcilePairsSummary();
        const selectedRow = document.querySelector('#reconcile-pairs-body tr.selected-row');
        if (selectedRow) {
            const accountA = parseInt(selectedRow.dataset.accountA);
            const accountB = parseInt(selectedRow.dataset.accountB);
            loadReconciliationTimeline(accountA, accountB);
        }
    });
}

function getReconcileDateRange() {
    if (!reconcileSlider) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return { start: thirtyDaysAgo.toISOString().split('T')[0], end: now.toISOString().split('T')[0] };
    }
    const values = reconcileSlider.get();
    const startDate = new Date(parseInt(values[0]));
    const endDate = new Date(parseInt(values[1]));
    return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
    };
}

// ============================================================
// RECONCILIATION – PAIRS SUMMARY
// ============================================================

async function loadReconcilePairsSummary() {
    const tbody = document.getElementById('reconcile-pairs-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#000;">Loading pairs...</td></tr>';

    try {
        const pairsRes = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/pairs`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!pairsRes.ok) throw new Error('Failed to fetch pairs');
        const pairsData = await pairsRes.json();
        if (pairsData.status !== 'success') {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#dc3545;">${pairsData.error || 'Error'}</td></tr>`;
            return;
        }
        const pairs = pairsData.pairs;
        if (!pairs || pairs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#000;">No saved pairs found. Add one using the button above.</td></tr>';
            return;
        }

        const dateRange = getReconcileDateRange();
        const start = dateRange.start;
        const end = dateRange.end;

        const pairPromises = pairs.map(async (p) => {
            const params = new URLSearchParams();
            params.append('account1', p.account_a_id);
            params.append('account2', p.account_b_id);
            if (start) params.append('start', start);
            if (end) params.append('end', end);
            const timelineRes = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/timeline?${params.toString()}`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            const timelineData = await timelineRes.json();
            let netA = 0, netB = 0;
            if (timelineData.status === 'success' && timelineData.entries) {
                timelineData.entries.forEach(entry => {
                    if (entry.account_name === p.account_a_name) {
                        netA += entry.amount || 0;
                    } else if (entry.account_name === p.account_b_name) {
                        netB += entry.amount || 0;
                    }
                });
            }
            const diff = netA + netB;
            return {
                ...p,
                net_a: netA,
                net_b: netB,
                difference: diff
            };
        });

        const pairSummaries = await Promise.all(pairPromises);
        renderPairsSummary(pairSummaries);

        const firstRow = document.querySelector('#reconcile-pairs-body tr[data-pair-id]');
        if (firstRow) {
            firstRow.classList.add('selected-row');
            selectedPairId = parseInt(firstRow.dataset.pairId);
            const accountA = parseInt(firstRow.dataset.accountA);
            const accountB = parseInt(firstRow.dataset.accountB);
            loadReconciliationTimeline(accountA, accountB);
        }

    } catch (err) {
        console.error('[RECONCILE] Error loading pairs summary:', err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#dc3545;">Error: ${err.message}</td></tr>`;
    }
}

function renderPairsSummary(pairSummaries) {
    const tbody = document.getElementById('reconcile-pairs-body');
    if (!tbody) return;
    if (!pairSummaries || pairSummaries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#000;">No pairs found.</td></tr>';
        return;
    }

    let html = '';
    pairSummaries.forEach(p => {
        const diff = p.difference || 0;
        const diffClass = Math.abs(diff) < 0.01 ? 'reconcile-amount-positive' : (diff > 0 ? 'reconcile-amount-positive' : 'reconcile-amount-negative');
        const sign = diff > 0 ? '+' : '';
        const rowClass = (selectedPairId === p.id) ? 'selected-row' : '';
        const desc = p.description || '';
        html += `<tr class="${rowClass}" data-pair-id="${p.id}" data-account-a="${p.account_a_id}" data-account-b="${p.account_b_id}" style="cursor:pointer;">
            <td style="color:#000;">${p.account_a_name}</td>
            <td style="color:#000;">${p.account_b_name}</td>
            <td style="color:#000;">${desc}</td>
            <td style="color:#000;" class="${diffClass}">${sign}${diff.toFixed(2)}</td>
            <td style="color:#000;">
                <button class="btn btn-sm btn-info" onclick="event.stopPropagation(); editPair(${p.id})">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll('tr[data-pair-id]').forEach(row => {
        row.addEventListener('click', function(e) {
            if (e.target.closest('button')) return;
            document.querySelectorAll('#reconcile-pairs-body tr').forEach(r => r.classList.remove('selected-row'));
            this.classList.add('selected-row');
            selectedPairId = parseInt(this.dataset.pairId);
            const accountA = parseInt(this.dataset.accountA);
            const accountB = parseInt(this.dataset.accountB);
            loadReconciliationTimeline(accountA, accountB);
        });
    });
}

// ============================================================
// RECONCILIATION – TIMELINE
// ============================================================

async function loadReconciliationTimeline(account1, account2) {
    if (!account1 || !account2) {
        const selectedRow = document.querySelector('#reconcile-pairs-body tr.selected-row');
        if (selectedRow) {
            account1 = parseInt(selectedRow.dataset.accountA);
            account2 = parseInt(selectedRow.dataset.accountB);
        } else {
            const firstRow = document.querySelector('#reconcile-pairs-body tr[data-pair-id]');
            if (firstRow) {
                account1 = parseInt(firstRow.dataset.accountA);
                account2 = parseInt(firstRow.dataset.accountB);
                firstRow.classList.add('selected-row');
                selectedPairId = parseInt(firstRow.dataset.pairId);
            } else {
                document.getElementById('reconcile-result').innerHTML = '<p class="text-muted" style="color: #000;">No pair selected.</p>';
                return;
            }
        }
    }

    if (!reconcileSlider) {
        await loadReconcileDateRange(account1, account2);
    }

    const dateRange = getReconcileDateRange();
    const start = dateRange.start;
    const end = dateRange.end;

    const resultDiv = document.getElementById('reconcile-result');
    resultDiv.innerHTML = '<p style="color: #000; text-align: center; padding: 20px;">Loading...</p>';

    try {
        const params = new URLSearchParams();
        params.append('account1', account1);
        params.append('account2', account2);
        if (start) params.append('start', start);
        if (end) params.append('end', end);

        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/timeline?${params.toString()}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to fetch reconciliation data');
        const data = await res.json();
        if (data.status === 'success') {
            renderReconciliationTimeline(data);
        } else {
            resultDiv.innerHTML = `<p style="color: #dc3545;">Error: ${data.error || 'Unknown error'}</p>`;
        }
    } catch (err) {
        console.error('[RECONCILE] Error:', err);
        resultDiv.innerHTML = `<p style="color: #dc3545;">Error: ${err.message}</p>`;
    }
}

function renderReconciliationTimeline(data) {
    const resultDiv = document.getElementById('reconcile-result');
    const entries = data.entries || [];
    const account1Name = data.account1_name || 'Account A';
    const account2Name = data.account2_name || 'Account B';

    if (entries.length === 0) {
        resultDiv.innerHTML = `<p style="color: #000;">No transactions found for these accounts and date range.</p>`;
        return;
    }

    let html = `<table class="journal-table" style="width:100%;">
        <thead>
            <tr>
                <th style="color:#000;">Date</th>
                <th style="color:#000;">Account</th>
                <th style="color:#000;">Amount</th>
                <th style="color:#000;">Description</th>
            </tr>
        </thead>
        <tbody>`;

    entries.forEach(entry => {
        const amount = entry.amount;
        const amountClass = amount >= 0 ? 'reconcile-amount-positive' : 'reconcile-amount-negative';
        const displayAmount = (amount >= 0 ? '+' : '') + amount.toFixed(2);

        html += `<tr>
            <td style="color:#000;">${entry.date}</td>
            <td style="color:#000;">${entry.account_name}</td>
            <td style="color:#000;" class="${amountClass}">$${displayAmount}</td>
            <td style="color:#000;">${entry.description}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    resultDiv.innerHTML = html;
}

// ============================================================
// RECONCILIATION – ADD / DELETE / EDIT PAIR
// ============================================================

function showAddPairModal() {
    loadReconcileAccountSelects();
    document.getElementById('reconcile-pair-name').value = '';
    document.getElementById('reconcile-pair-description').value = '';
    document.getElementById('reconcile-pair-modal').classList.add('active');
}

async function editPair(pairId) {
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/pairs`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to fetch pairs');
        const data = await res.json();
        if (data.status === 'success') {
            const pair = data.pairs.find(p => p.id === pairId);
            if (!pair) {
                alert('Pair not found.');
                return;
            }
            document.getElementById('reconcile-edit-id').value = pair.id;
            document.getElementById('reconcile-edit-name').value = pair.name || '';
            document.getElementById('reconcile-edit-description').value = pair.description || '';
            document.getElementById('reconcile-edit-modal').classList.add('active');
        }
    } catch (err) {
        console.error(err);
        alert('Error loading pair details.');
    }
}

async function deleteSelectedPair() {
    const selectedRow = document.querySelector('#reconcile-pairs-body tr.selected-row');
    if (!selectedRow) {
        alert('Please select a pair to delete.');
        return;
    }
    const pairId = parseInt(selectedRow.dataset.pairId);
    if (!confirm('Delete this pair?')) return;
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/pairs/${pairId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (res.ok) {
            selectedPairId = null;
            loadReconcilePairsSummary();
        } else {
            alert('Failed to delete pair.');
        }
    } catch (err) {
        console.error(err);
        alert('Error deleting pair.');
    }
}

// ============================================================
// JOURNAL ENTRIES
// ============================================================

async function loadJournalEntries() {
    console.log('[JOURNAL] Loading journal entries');
    const body = document.getElementById('journal-body');
    body.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px;">Loading...</td></tr>';

    const params = new URLSearchParams();
    params.append('page', journalCurrentPage);
    params.append('per_page', journalPageSize);
    const account = document.getElementById('journal-account-filter').value;
    if (account) params.append('account_id', account);
    const search = document.getElementById('journal-search').value.trim();
    if (search) params.append('search', search);

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/journal?${params.toString()}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to load journal');
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[JOURNAL] Loaded', data.entries.length, 'entries, total:', data.total);
            journalTotalEntries = data.total;
            renderJournal(data.entries);
            updateJournalPagination();
        } else {
            console.error('[JOURNAL] Error:', data.error);
            body.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px; color:#dc3545;">' + (data.error || 'Error loading journal') + '</td></tr>';
        }
    } catch (err) {
        console.error('[JOURNAL] Error:', err);
        body.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px; color:#dc3545;">Error: ' + err.message + '</td></tr>';
    }
}

function renderJournal(entries) {
    console.log('[JOURNAL] Rendering', entries.length, 'entries');
    const body = document.getElementById('journal-body');
    if (!entries || entries.length === 0) {
        body.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px;">No entries found.</td></tr>';
        return;
    }
    let html = '';
    entries.forEach(e => {
        html += `<tr>
            <td>${e.id}</td>
            <td>${e.transaction_date}</td>
            <td>${e.description || ''}</td>
            <td>${e.debit_account || ''}</td>
            <td class="debit">${e.debit_amount ? '$' + parseFloat(e.debit_amount).toFixed(2) : ''}</td>
            <td>${e.credit_account || ''}</td>
            <td class="credit">${e.credit_amount ? '$' + parseFloat(e.credit_amount).toFixed(2) : ''}</td>
            <td>${e.source_type}: ${e.source_id}</td>
            <td><button class="btn btn-sm btn-info" onclick="viewJournalEntry(${e.id})"><i class="fas fa-eye"></i></button></td>
        </tr>`;
    });
    body.innerHTML = html;
}

function updateJournalPagination() {
    const totalPages = Math.ceil(journalTotalEntries / journalPageSize);
    document.getElementById('journal-pagination-info').textContent = `Showing ${journalTotalEntries} entries (Page ${journalCurrentPage} of ${totalPages || 1})`;
    document.getElementById('journal-prev').disabled = journalCurrentPage <= 1;
    document.getElementById('journal-next').disabled = journalCurrentPage >= totalPages || totalPages === 0;
    document.getElementById('journal-page-info').textContent = `Page ${journalCurrentPage}`;
}

function resetJournalFilters() {
    console.log('[JOURNAL] Resetting filters');
    document.getElementById('journal-account-filter').value = '';
    document.getElementById('journal-search').value = '';
    journalCurrentPage = 1;
    loadJournalEntries();
}

function exportJournalCSV() {
    console.log('[JOURNAL] Exporting CSV');
    const params = new URLSearchParams();
    params.append('page', 1);
    params.append('per_page', 9999);
    const account = document.getElementById('journal-account-filter').value;
    if (account) params.append('account_id', account);
    const search = document.getElementById('journal-search').value.trim();
    if (search) params.append('search', search);

    fetch(`${AppConfig.baseUrl}/api/accounting/journal?${params.toString()}`, {
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success' && data.entries) {
            console.log('[JOURNAL] Exporting', data.entries.length, 'entries');
            let csv = 'ID,Date,Description,Debit Account,Debit Amount,Credit Account,Credit Amount,Source\n';
            data.entries.forEach(e => {
                csv += `${e.id},${e.transaction_date},"${(e.description||'').replace(/"/g,'""')}","${e.debit_account||''}",${e.debit_amount||0},"${e.credit_account||''}",${e.credit_amount||0},${e.source_type}:${e.source_id}\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'journal_export.csv';
            a.click();
            window.URL.revokeObjectURL(url);
        }
    }).catch(console.error);
}

function viewJournalEntry(entryId) {
    console.log('[JOURNAL] Viewing entry:', entryId);
    alert('View details for journal entry #' + entryId + ' (modal to be implemented)');
}

// ============================================================
// IMPORT (BANK) TRANSACTIONS
// ============================================================

async function loadBankTransactions() {
    console.log('[BANK] Loading transactions');
    const body = document.getElementById('bank-body');
    body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">Loading...</td></tr>';

    const source = document.getElementById('bank-source').value;
    const search = document.getElementById('bank-filter').value.trim();
    const viewFilter = document.getElementById('bank-view-filter')?.value || 'unposted';

    const sourceMap = {
        'fnbo': 'fnbo',
        'bluevine': 'bluevine',
        'square': 'square',
        'paypal': 'paypal'
    };
    
    const endpoint = sourceMap[source] || source;
    
    let url = `${AppConfig.baseUrl}/api/accounting/bank/${endpoint}`;
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    
    if (viewFilter === 'unposted') {
        params.append('unprocessed_only', 'true');
    } else if (viewFilter === 'posted') {
        params.append('unprocessed_only', 'false');
    }
    
    if (params.toString()) url += '?' + params.toString();

    try {
        const res = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        // Handle PayPal needing connection
        if (res.status === 400) {
            const data = await res.json();
            if (data.needs_connection) {
                if (confirm('PayPal not connected. Would you like to connect your PayPal account via Plaid?')) {
                    connectPayPalPlaid();
                }
                body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">PayPal not connected. Please connect your account.</td></tr>';
                return;
            }
            body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">${data.error || 'Error'}</td></tr>`;
            return;
        }
        
        if (!res.ok) throw new Error('Failed to load transactions');
        const data = await res.json();

        if (data.status === 'success') {
            console.log('[BANK] Loaded', data.transactions.length, 'transactions');
            renderBankTransactions(data.transactions);
            updateBankCounts(data.unprocessed_count, data.total_count);
            document.getElementById('bank-pagination-info').textContent = `Showing ${data.transactions.length} entries (${data.total_count} total)`;
        } else {
            body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">${data.error || 'Error'}</td></tr>`;
        }
    } catch (err) {
        console.error('[BANK] Error:', err);
        body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">Error: ${err.message}</td></tr>`;
    }
}

function renderBankTransactions(transactions) {
    const body = document.getElementById('bank-body');
    if (!transactions || transactions.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">No transactions found.</td></tr>';
        return;
    }
    let html = '';
    transactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        const isDebit = amount < 0;
        const formattedAmount = (isDebit ? '-' : '') + '$' + Math.abs(amount).toFixed(2);
        const statusText = t.processed ? '✅ Posted' : '⏳ Unposted';
        const rowClass = t.processed ? 'bank-row-posted' : 'bank-row-unposted';
        html += `<tr class="${rowClass}">
            <td>${t.date || ''}</td>
            <td>${t.description || ''}</td>
            <td style="color: ${isDebit ? '#dc3545' : '#28a745'}; font-weight: 600;">${formattedAmount}</td>
            <td>${t.category || ''}</td>
            <td>${statusText}</td>
        </tr>`;
    });
    body.innerHTML = html;
}

function updateBankCounts(unprocessed, total) {
    const countEl = document.getElementById('bank-unprocessed-count');
    const labelEl = document.getElementById('bank-count-label');
    const totalEl = document.getElementById('bank-total-count');
    const viewFilter = document.getElementById('bank-view-filter')?.value || 'unposted';
    if (viewFilter === 'posted') {
        countEl.textContent = total - unprocessed;
        labelEl.textContent = ' posted transactions';
        totalEl.textContent = `(${total} total)`;
    } else if (viewFilter === 'all') {
        countEl.textContent = total;
        labelEl.textContent = ' transactions';
        totalEl.textContent = `(${total} total)`;
    } else {
        countEl.textContent = unprocessed;
        labelEl.textContent = ' unprocessed transactions';
        totalEl.textContent = `(${total} total)`;
    }
}

// ============================================================
// REPORTS
// ============================================================

async function runReport() {
    console.log('[REPORTS] Generating report');
    const reportType = document.getElementById('report-type').value;
    const dateFrom = document.getElementById('report-date-from').value;
    const dateTo = document.getElementById('report-date-to').value;
    const container = document.getElementById('report-result');
    container.innerHTML = '<p class="text-muted">Loading...</p>';

    try {
        const params = new URLSearchParams({ type: reportType });
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reports?${params.toString()}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to generate report');
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[REPORTS] Report generated, type:', reportType);
            currentReportData = data;
            renderReport(data, reportType);
        } else {
            console.error('[REPORTS] Error:', data.error);
            container.innerHTML = '<p class="text-muted" style="color:#dc3545;">' + (data.error || 'Error generating report') + '</p>';
        }
    } catch (err) {
        console.error('[REPORTS] Error:', err);
        container.innerHTML = '<p class="text-muted" style="color:#dc3545;">Error: ' + err.message + '</p>';
    }
}

function renderReport(data, type) {
    console.log('[REPORTS] Rendering report, type:', type);
    const container = document.getElementById('report-result');
    if (!data.report || data.report.length === 0) {
        container.innerHTML = '<p class="text-muted">No data for this report.</p>';
        return;
    }
    let html = '<table><thead><tr>';
    const headers = Object.keys(data.report[0]);
    headers.forEach(h => html += `<th>${h}</th>`);
    html += '</tr></thead><tbody>';
    data.report.forEach(row => {
        html += '<tr>';
        headers.forEach(h => {
            let val = row[h];
            if (typeof val === 'number') val = val.toFixed(2);
            html += `<td>${val !== null && val !== undefined ? val : ''}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    if (data.summary) {
        html += `<div style="margin-top:15px; background:#f0f0f0; padding:10px; border-radius:4px; color:#000;" class="summary-text">
            <strong>Summary:</strong> ${data.summary}
        </div>`;
    }
    container.innerHTML = html;
}

function exportReportCSV() {
    console.log('[REPORTS] Exporting CSV');
    if (!currentReportData || !currentReportData.report) {
        alert('Please generate a report first.');
        return;
    }
    const headers = Object.keys(currentReportData.report[0]);
    let csv = headers.join(',') + '\n';
    currentReportData.report.forEach(row => {
        const vals = headers.map(h => {
            let v = row[h];
            if (typeof v === 'string' && v.includes(',')) v = '"' + v + '"';
            return v;
        });
        csv += vals.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

// ============================================================
// ACCOUNTS TAB - CRUD OPERATIONS
// ============================================================

async function loadAccountsList() {
    console.log('[ACCOUNTS] Loading accounts list');
    const body = document.getElementById('accounts-body');
    body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">Loading accounts...</td></tr>';

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to load accounts');
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[ACCOUNTS] Loaded', data.accounts.length, 'accounts');
            renderAccounts(data.accounts);
        } else {
            console.error('[ACCOUNTS] Error:', data.error);
            body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">' + (data.error || 'Error loading accounts') + '</td></tr>';
        }
    } catch (err) {
        console.error('[ACCOUNTS] Error:', err);
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">Error: ' + err.message + '</td></tr>';
    }
}

function renderAccounts(accounts) {
    console.log('[ACCOUNTS] Rendering', accounts.length, 'accounts');
    const body = document.getElementById('accounts-body');
    if (!accounts || accounts.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">No accounts found.</td></tr>';
        return;
    }
    let html = '';
    accounts.forEach(acc => {
        html += `<tr>
            <td>${acc.id}</td>
            <td>${acc.code}</td>
            <td>${acc.name}</td>
            <td><span class="status-badge ${acc.type}">${acc.type}</span></td>
            <td>
                <button class="btn btn-sm btn-info" onclick="editAccount(${acc.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteAccount(${acc.id}, '${acc.code} - ${acc.name}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    body.innerHTML = html;
}

function showAddAccountModal() {
    console.log('[ACCOUNTS] Showing add account modal');
    document.getElementById('add-account-modal').classList.add('active');
    document.getElementById('account-form-id').value = '';
    document.getElementById('account-form-code').value = '';
    document.getElementById('account-form-name').value = '';
    document.getElementById('account-form-type').value = '';
    document.getElementById('account-form-description').value = '';
    document.getElementById('add-account-modal-title').textContent = 'Add New Account';
    document.getElementById('save-account-btn').textContent = 'Save Account';
}

async function editAccount(accountId) {
    console.log('[ACCOUNTS] Editing account:', accountId);
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            const account = data.accounts.find(a => a.id === accountId);
            if (account) {
                console.log('[ACCOUNTS] Found account:', account.code, account.name);
                document.getElementById('add-account-modal').classList.add('active');
                document.getElementById('account-form-id').value = account.id;
                document.getElementById('account-form-code').value = account.code;
                document.getElementById('account-form-name').value = account.name;
                document.getElementById('account-form-type').value = account.type;
                document.getElementById('account-form-description').value = account.description || '';
                document.getElementById('add-account-modal-title').textContent = 'Edit Account';
                document.getElementById('save-account-btn').textContent = 'Update Account';
            }
        }
    } catch (e) {
        console.error('[ACCOUNTS] Error loading account details:', e);
        showToast('Error loading account details', 'error');
    }
}

async function saveAccount() {
    const id = document.getElementById('account-form-id').value;
    const code = document.getElementById('account-form-code').value.trim();
    const name = document.getElementById('account-form-name').value.trim();
    const type = document.getElementById('account-form-type').value;
    const description = document.getElementById('account-form-description').value.trim();

    console.log('[ACCOUNTS] Saving account:', id ? 'update' : 'create', code, name);

    if (!code || !name || !type) {
        showToast('Code, Name, and Type are required.', 'error');
        return;
    }

    const data = { code, name, type, description: description || null };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${AppConfig.baseUrl}/api/accounting/accounts/${id}` : `${AppConfig.baseUrl}/api/accounting/accounts`;

    try {
        const res = await fetch(url, {
            method: method,
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.status === 'success') {
            console.log('[ACCOUNTS] Saved successfully');
            showToast(id ? 'Account updated successfully' : 'Account created successfully', 'success');
            document.getElementById('add-account-modal').classList.remove('active');
            loadAccountsList();
            loadAccountSelects();
        } else {
            console.error('[ACCOUNTS] Error saving:', result.error);
            showToast('Error: ' + (result.error || 'Failed to save account'), 'error');
        }
    } catch (e) {
        console.error('[ACCOUNTS] Error:', e);
        showToast('Error: ' + e.message, 'error');
    }
}

async function deleteAccount(accountId, accountName) {
    console.log('[ACCOUNTS] Deleting account:', accountId, accountName);
    
    if (!confirm(`⚠️ Delete account "${accountName}"?\n\nThis will delete the account and UNPOST all associated transactions.\n\nAre you sure?`)) {
        console.log('[ACCOUNTS] Delete cancelled');
        return;
    }

    try {
        const deleteRes = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts/${accountId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        const result = await deleteRes.json();
        if (result.status === 'success') {
            console.log('[ACCOUNTS] Deleted successfully, unposted:', result.unposted_count);
            showToast(`Account "${accountName}" deleted successfully. ${result.unposted_count || 0} transaction(s) unposted.`, 'success');
            loadAccountsList();
            loadAccountSelects();
        } else {
            console.error('[ACCOUNTS] Error deleting:', result.error);
            showToast('Error: ' + (result.error || 'Failed to delete account'), 'error');
        }
    } catch (e) {
        console.error('[ACCOUNTS] Error:', e);
        showToast('Error: ' + e.message, 'error');
    }
}

// ============================================================
// MODAL FUNCTIONS
// ============================================================

function closeMonthlyModal() {
    console.log('[MODAL] Closing monthly modal');
    document.getElementById('monthly-tx-modal').classList.remove('active');
}

function showMonthlyTransactions(month, accountId, accountName, excludeOrders = false, accountCode = null) {
    console.log('[MODAL] ==================================================');
    console.log('[MODAL] SHOW MONTHLY TRANSACTIONS CALLED');
    console.log('[MODAL] Parameters:', { month, accountId, accountName, excludeOrders, accountCode });
    console.log('[MODAL] ==================================================');

    try {
        const modal = document.getElementById('monthly-tx-modal');
        console.log('[MODAL] 1. Modal element:', modal ? 'FOUND' : 'MISSING', modal);

        if (!modal) {
            console.error('[MODAL] ❌ Modal element not found!');
            showToast('Error: Modal element not found', 'error');
            return;
        }

        const body = document.getElementById('modal-body');
        console.log('[MODAL] 2. Body element:', body ? 'FOUND' : 'MISSING', body);

        if (!body) {
            console.error('[MODAL] ❌ Body element not found!');
            showToast('Error: Modal body not found', 'error');
            return;
        }

        const title = document.getElementById('modal-title');
        console.log('[MODAL] 3. Title element:', title ? 'FOUND' : 'MISSING', title);

        if (!title) {
            console.error('[MODAL] ❌ Title element not found!');
            showToast('Error: Modal title not found', 'error');
            return;
        }

        const [year, monthNum] = month.split('-');
        const firstDay = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const lastDay = new Date(parseInt(year), parseInt(monthNum), 0);
        const formatDate = (d) => {
            const y = String(d.getFullYear()).slice(2);
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${m}/${day}/${y}`;
        };
        const dateRange = `${formatDate(firstDay)} - ${formatDate(lastDay)}`;

        const idDisplay = accountId ? ` (ID: ${accountId})` : (accountCode ? ` (Code: ${accountCode})` : '');
        const displayName = `${accountName}${idDisplay} - ${dateRange}`;
        title.textContent = displayName;
        console.log('[MODAL] 4. Title set to:', title.textContent);

        body.innerHTML = '<div class="modal-loading">Loading transactions...</div>';
        console.log('[MODAL] 5. Body set to loading state');

        modal.classList.add('active');
        console.log('[MODAL] 6. Active class added, modal should be visible');
        console.log('[MODAL] 7. Modal classes after add:', modal.className);
        console.log('[MODAL] 8. Modal style.display:', modal.style.display);

        let url = `${AppConfig.baseUrl}/api/accounting/monthly-account-transactions?month=${month}`;
        if (accountId) {
            url += `&account_id=${accountId}`;
        }
        if (excludeOrders) {
            url += '&exclude_orders=true';
        }
        console.log('[MODAL] 9. Fetching URL:', url);

        fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        })
        .then(res => {
            console.log('[MODAL] 10. Fetch response status:', res.status);
            console.log('[MODAL] 10a. Fetch response ok:', res.ok);
            return res.json();
        })
        .then(data => {
            console.log('[MODAL] 11. Data received from API:');
            console.log('[MODAL] 11a. Data status:', data.status);
            console.log('[MODAL] 11b. Data transactions count:', data.transactions ? data.transactions.length : 0);
            console.log('[MODAL] 11c. Full data sample (first 2):', data.transactions ? data.transactions.slice(0, 2) : 'none');

            if (data.status === 'success' && data.transactions) {
                console.log('[MODAL] 12. Success! Loading', data.transactions.length, 'transactions');
                renderModalTransactions(data.transactions, accountName, dateRange, accountId);
            } else {
                console.error('[MODAL] ❌ Error in response:', data.error || 'Unknown error');
                body.innerHTML = `<p class="monthly-error">${data.error || 'Failed to load transactions'}</p>`;
            }
        })
        .catch(err => {
            console.error('[MODAL] ❌ Fetch error:', err);
            console.error('[MODAL] Error stack:', err.stack);
            body.innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
        });

        console.log('[MODAL] ===== SHOW MONTHLY TRANSACTIONS END =====');
    } catch (err) {
        console.error('[MODAL] ❌ CRITICAL ERROR in showMonthlyTransactions:', err);
        console.error('[MODAL] Stack:', err.stack);
        showToast('Error: ' + err.message, 'error');
    }
}

function renderModalTransactions(transactions, accountName, dateRange, accountId = null) {
    console.log('[MODAL] ==================================================');
    console.log('[MODAL] RENDER MODAL TRANSACTIONS CALLED');
    console.log('[MODAL] Input transactions count:', transactions ? transactions.length : 0);
    console.log('[MODAL] accountName:', accountName);
    console.log('[MODAL] dateRange:', dateRange);
    console.log('[MODAL] accountId:', accountId);
    console.log('[MODAL] ==================================================');

    const body = document.getElementById('modal-body');
    if (!body) {
        console.error('[MODAL] ❌ Body not found for rendering!');
        return;
    }
    console.log('[MODAL] Body element found');

    if (!transactions || transactions.length === 0) {
        console.log('[MODAL] No transactions to render');
        body.innerHTML = '<p>No transactions found for this period.</p>';
        return;
    }

    console.log('[MODAL] Transaction details:');
    transactions.forEach((tx, idx) => {
        console.log(`[MODAL]   ${idx}:`, {
            journal_entry_id: tx.journal_entry_id,
            date: tx.transaction_date,
            description: tx.description,
            account: tx.account_name,
            debit: tx.debit_amount,
            credit: tx.credit_amount,
            source_id: tx.source_id,
            source_type: tx.source_type
        });
    });

    const grouped = {};
    transactions.forEach(tx => {
        const key = tx.journal_entry_id || tx.source_id || tx.id;
        console.log('[MODAL] Grouping tx with key:', key, 'journal_entry_id:', tx.journal_entry_id);
        if (!grouped[key]) {
            grouped[key] = {
                transaction_date: tx.transaction_date,
                description: tx.description || '',
                account_name: tx.account_name || '',
                net: 0,
                entries: [],
                journal_entry_id: tx.journal_entry_id || null,
                source_id: tx.source_id || null
            };
        }
        grouped[key].net += (tx.debit_amount || 0) - (tx.credit_amount || 0);
        grouped[key].entries.push(tx);
    });

    const groupedList = Object.values(grouped);
    console.log('[MODAL] Grouped into', groupedList.length, 'entries');

    const isRevenueAccount = accountName &&
        (accountName.toLowerCase().includes('revenue') ||
         accountName.toLowerCase().includes('sales') ||
         accountName.toLowerCase().includes('income'));
    console.log('[MODAL] isRevenueAccount:', isRevenueAccount);

    let total = 0;
    groupedList.forEach(g => {
        total += g.net;
    });

    let displayTotal = isRevenueAccount ? -total : total;
    console.log('[MODAL] Total net amount:', total, 'displayTotal:', displayTotal);

    let html = `<div class="modal-summary">
        <div class="summary-item"><strong>Account:</strong> ${accountName || 'All Accounts'}${accountId ? ` (ID: ${accountId})` : ''}</div>
        <div class="summary-item"><strong>Period:</strong> ${dateRange}</div>
        <div class="summary-item"><strong>Transactions:</strong> ${groupedList.length}</div>
        <div class="summary-item"><strong>Total:</strong> <span style="font-weight:bold;color:${displayTotal >= 0 ? '#28a745' : '#dc3545'};">${displayTotal >= 0 ? '+' : ''}$${displayTotal.toFixed(2)}</span></div>
    </div>`;

    html += `<table>
        <thead><tr>
            <th style="width:90px; min-width:80px; white-space:nowrap;">Date</th>
            <th>Description</th>
            <th>Account</th>
            <th style="text-align:right; width:100px;">Amount</th>
            <th style="width:90px; text-align:center;">Actions</th>
        </tr></thead>
        <tbody>`;

    let rowCount = 0;
    groupedList.forEach(g => {
        rowCount++;

        let displayAmount = g.net;
        if (isRevenueAccount) {
            displayAmount = -g.net;
        }
        const isPositive = displayAmount > 0;
        const amountClass = isPositive ? 'debit' : (displayAmount < 0 ? 'credit' : '');
        const displayAmountStr = displayAmount !== 0 ? '$' + Math.abs(displayAmount).toFixed(2) : '';
        const sign = displayAmount > 0 ? '+' : (displayAmount < 0 ? '-' : '');

        const entryId = g.journal_entry_id || g.source_id;
        console.log('[MODAL] Row entryId:', entryId, 'journal_entry_id:', g.journal_entry_id, 'source_id:', g.source_id);

        html += `<tr>
            <td style="white-space:nowrap;">${g.transaction_date}</td>
            <td>${g.description || ''}</td>
            <td>${g.account_name || ''}</td>
            <td style="text-align:right; font-weight:600;" class="${amountClass}">${sign}${displayAmountStr}</td>
            <td style="text-align:center;">${entryId ? `<button class="btn btn-sm btn-warning" onclick="unpostTransaction(${typeof entryId === 'string' ? `'${entryId}'` : entryId})"><i class="fas fa-undo"></i></button>` : ''}</td>
        </tr>`;
    });

    console.log('[MODAL] Rendered', rowCount, 'rows in the table');

    html += `<tr class="total-row">
        <td colspan="3"><strong>Total</strong></td>
        <td style="text-align:right; font-weight:bold;color:${displayTotal >= 0 ? '#28a745' : '#dc3545'};">${displayTotal >= 0 ? '+' : ''}${displayTotal !== 0 ? '$' + displayTotal.toFixed(2) : ''}</td>
        <td></td>
    </tr>`;
    html += '</tbody></table>';
    body.innerHTML = html;
    console.log('[MODAL] Render complete - HTML length:', html.length);
    console.log('[MODAL] ==================================================');
}

async function unpostTransaction(entryId) {
    console.log('[MODAL] Unposting transaction:', entryId);

    if (!confirm(`Are you sure you want to unpost journal entry #${entryId}?\n\nThis will delete the journal entry and, if it was a bank transaction, mark it as unprocessed.`)) {
        return;
    }

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/journal/${entryId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[MODAL] Unposted successfully');
            showToast(`✅ Journal entry #${entryId} unposted successfully.`, 'success');
            const modalBody = document.getElementById('modal-body');
            if (modalBody) {
                modalBody.innerHTML = '<div class="modal-loading">Reloading...</div>';
                const title = document.getElementById('modal-title');
                if (title) {
                    const titleText = title.textContent;
                    const match = titleText.match(/^(.+?)\s*\(ID:\s*(\d+)\)?\s*-\s*(.+)$/);
                    if (match) {
                        const accountName = match[1].trim();
                        const accountId = match[2] ? parseInt(match[2]) : null;
                        const dateRange = match[3].trim();
                        const dateMatch = dateRange.match(/(\d{2})\/(\d{2})\/(\d{2})/);
                        if (dateMatch) {
                            const month = `20${dateMatch[3]}-${dateMatch[1]}`;
                            showMonthlyTransactions(month, accountId, accountName, true);
                        }
                    }
                }
            }
        } else {
            console.error('[MODAL] Error unposting:', data.error);
            showToast('❌ Error: ' + (data.error || 'Failed to unpost'), 'error');
        }
    } catch (e) {
        console.error('[MODAL] Error:', e);
        showToast('❌ Error: ' + e.message, 'error');
    }
}

// ============================================================
// COGS CALCULATION MODAL
// ============================================================

function showCOGSCalculation(month) {
    console.log('[COGS] ===== SHOW COGS CALCULATION START =====');
    console.log('[COGS] Month:', month);

    try {
        const modal = document.getElementById('monthly-tx-modal');
        const body = document.getElementById('modal-body');
        const title = document.getElementById('modal-title');

        if (!modal || !body || !title) {
            console.error('[COGS] Modal elements not found');
            showToast('Error: Modal elements not found', 'error');
            return;
        }

        const [year, monthNum] = month.split('-');
        const firstDay = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const lastDay = new Date(parseInt(year), parseInt(monthNum), 0);
        const formatDate = (d) => {
            const y = String(d.getFullYear()).slice(2);
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${m}/${day}/${y}`;
        };
        const dateRange = `${formatDate(firstDay)} - ${formatDate(lastDay)}`;

        title.textContent = `COGS Calculation - ${dateRange}`;
        body.innerHTML = '<div class="modal-loading">Loading COGS calculation...</div>';
        modal.classList.add('active');

        const url = `${AppConfig.baseUrl}/api/accounting/cogs-calculation?month=${month}`;
        console.log('[COGS] Fetching URL:', url);

        fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        })
        .then(res => {
            console.log('[COGS] Fetch response status:', res.status);
            return res.json();
        })
        .then(data => {
            console.log('[COGS] Data received:', data);
            if (data.status === 'success') {
                renderCOGSCalculation(data, dateRange);
            } else {
                console.error('[COGS] Error:', data.error);
                body.innerHTML = `<p class="monthly-error">${data.error || 'Failed to load COGS calculation'}</p>`;
            }
        })
        .catch(err => {
            console.error('[COGS] Fetch error:', err);
            body.innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
        });

        console.log('[COGS] ===== SHOW COGS CALCULATION END =====');
    } catch (err) {
        console.error('[COGS] CRITICAL ERROR:', err);
        showToast('Error: ' + err.message, 'error');
    }
}

function renderCOGSCalculation(data, dateRange) {
    console.log('[COGS] Rendering COGS calculation');
    const body = document.getElementById('modal-body');
    if (!body) return;

    const { total_cogs, records, batch_allocations } = data;

    let html = `<div class="modal-summary">
        <div class="summary-item"><strong>COGS Calculation</strong></div>
        <div class="summary-item"><strong>Period:</strong> ${dateRange}</div>
        <div class="summary-item"><strong>Total COGS:</strong> <span style="color:#dc3545;font-weight:bold;">$${total_cogs.toFixed(2)}</span></div>
    </div>`;

    html += `<h4 style="margin:15px 0 10px 0; color:#000;">Records Sold</h4>`;
    if (records && records.length > 0) {
        html += `<table>
            <thead><tr>
                <th>ID</th>
                <th>Artist</th>
                <th>Title</th>
                <th style="text-align:right;">Sale Price</th>
                <th style="text-align:right;">COGS</th>
            </tr></thead>
            <tbody>`;
        let recordTotal = 0;
        records.forEach(r => {
            recordTotal += r.cogs || 0;
            html += `<tr>
                <td>${r.id}</td>
                <td>${r.artist || ''}</td>
                <td>${r.title || ''}</td>
                <td style="text-align:right;">$${(r.sale_price || 0).toFixed(2)}</td>
                <td style="text-align:right; color:#dc3545;">$${(r.cogs || 0).toFixed(2)}</td>
            </tr>`;
        });
        html += `<tr class="total-row">
            <td colspan="4" style="text-align:right;"><strong>Total Records COGS</strong></td>
            <td style="text-align:right; color:#dc3545;"><strong>$${recordTotal.toFixed(2)}</strong></td>
        </tr>`;
        html += '</tbody></table>';
    } else {
        html += '<p class="text-muted">No records sold this month.</p>';
    }

    html += `<h4 style="margin:15px 0 10px 0; color:#000;">Batch Allocations</h4>`;
    if (batch_allocations && batch_allocations.length > 0) {
        html += `<table>
            <thead><tr>
                <th>Batch ID</th>
                <th>Total Cost</th>
                <th style="text-align:right;">Allocated COGS</th>
            </tr></thead>
            <tbody>`;
        let batchTotal = 0;
        batch_allocations.forEach(b => {
            batchTotal += b.allocated || 0;
            html += `<tr>
                <td>${b.batch_id}</td>
                <td>$${(b.total_cost || 0).toFixed(2)}</td>
                <td style="text-align:right; color:#dc3545;">$${(b.allocated || 0).toFixed(2)}</td>
            </tr>`;
        });
        html += `<tr class="total-row">
            <td colspan="2" style="text-align:right;"><strong>Total Batch COGS</strong></td>
            <td style="text-align:right; color:#dc3545;"><strong>$${batchTotal.toFixed(2)}</strong></td>
        </tr>`;
        html += '</tbody></table>';
    } else {
        html += '<p class="text-muted">No batch allocations this month.</p>';
    }

    const assumedTotal = total_cogs - (records?.reduce((sum, r) => sum + (r.cogs || 0), 0) || 0) - (batch_allocations?.reduce((sum, b) => sum + (b.allocated || 0), 0) || 0);
    if (assumedTotal > 0.01) {
        html += `<div style="margin-top:15px; padding:10px; background:#fff3cd; border-radius:4px; color:#856404;">
            <strong>⚠️ Assumption-based COGS:</strong> $${assumedTotal.toFixed(2)} (records without batch allocation used assumption rates)
        </div>`;
    }

    body.innerHTML = html;
}

// ============================================================
// MONTH BREAKDOWN MODAL (Bar Chart) with Navigation
// ============================================================

function showMonthBreakdownModal(month, chartData, chartType) {
    console.log('[BREAKDOWN] ===== SHOW MONTH BREAKDOWN START =====');
    console.log('[BREAKDOWN] 1. Called with:', { month, chartType });

    try {
        const modal = document.getElementById('breakdown-modal');
        console.log('[BREAKDOWN] 2. Modal element:', modal);

        if (!modal) {
            console.error('[BREAKDOWN] ❌ Modal element not found!');
            showToast('Error: Modal element not found', 'error');
            return;
        }

        const body = document.getElementById('breakdown-modal-body');
        console.log('[BREAKDOWN] 3. Body element:', body);

        if (!body) {
            console.error('[BREAKDOWN] ❌ Body element not found!');
            showToast('Error: Modal body not found', 'error');
            return;
        }

        const title = document.getElementById('breakdown-modal-title');
        console.log('[BREAKDOWN] 4. Title element:', title);

        if (!title) {
            console.error('[BREAKDOWN] ❌ Title element not found!');
            showToast('Error: Modal title not found', 'error');
            return;
        }

        currentBreakdownMonths = chartData.months || [];
        currentBreakdownMonthIndex = currentBreakdownMonths.indexOf(month);
        currentBreakdownChartType = chartType;
        currentBreakdownMonth = month;

        const [year, monthNum] = month.split('-');
        const firstDay = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const lastDay = new Date(parseInt(year), parseInt(monthNum), 0);
        const formatDate = (d) => {
            const y = String(d.getFullYear()).slice(2);
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${m}/${day}/${y}`;
        };
        const dateRange = `${formatDate(firstDay)} - ${formatDate(lastDay)}`;

        const totalMonths = currentBreakdownMonths.length;
        const navHtml = `
            <div style="display:flex; align-items:center; gap:15px; margin-bottom:15px; justify-content:center; flex-wrap:wrap;">
                <button class="btn btn-sm btn-secondary" id="breakdown-prev-month" ${currentBreakdownMonthIndex <= 0 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i> Prev
                </button>
                <span style="font-size:16px; font-weight:600; color:#000;">${dateRange}</span>
                <span style="font-size:14px; color:#333;">(${currentBreakdownMonthIndex + 1} of ${totalMonths})</span>
                <button class="btn btn-sm btn-secondary" id="breakdown-next-month" ${currentBreakdownMonthIndex >= totalMonths - 1 ? 'disabled' : ''}>
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div id="breakdown-chart-container" style="min-height: 450px; width: 100%; position: relative; background: white; border-radius: 8px; padding: 10px;">
                <canvas id="breakdown-chart-canvas"></canvas>
            </div>
            <div class="breakdown-bar-click-hint" style="font-size: 13px; color: #555; text-align: center; margin-top: 12px; font-style: italic;">
                Click any bar to see transactions
            </div>
        `;

        body.innerHTML = navHtml;

        document.getElementById('breakdown-prev-month')?.addEventListener('click', function() {
            if (currentBreakdownMonthIndex > 0) {
                const newMonth = currentBreakdownMonths[currentBreakdownMonthIndex - 1];
                document.getElementById('monthly-tx-modal')?.classList.remove('active');
                showMonthBreakdownModal(newMonth, chartData, chartType);
            }
        });

        document.getElementById('breakdown-next-month')?.addEventListener('click', function() {
            if (currentBreakdownMonthIndex < currentBreakdownMonths.length - 1) {
                const newMonth = currentBreakdownMonths[currentBreakdownMonthIndex + 1];
                document.getElementById('monthly-tx-modal')?.classList.remove('active');
                showMonthBreakdownModal(newMonth, chartData, chartType);
            }
        });

        const monthData = chartData.account_breakdown[month] || {};
        console.log('[BREAKDOWN] 6. Month data:', monthData);

        const netLabel = Object.keys(monthData).find(name =>
            name === 'Net' || name === 'Net Income' || name === 'Net Cash'
        );
        const cogsLabel = Object.keys(monthData).find(name =>
            name === 'COGS' || name === 'Cost of Goods Sold'
        );

        let labels = Object.keys(monthData).filter(name =>
            name !== netLabel && name !== cogsLabel
        ).sort();
        if (cogsLabel) labels.push(cogsLabel);
        if (netLabel) labels.push(netLabel);

        const values = labels.map(k => monthData[k] || 0);
        console.log('[BREAKDOWN] 7. Labels:', labels.length, 'Values:', values.length);

        const labelsWithIds = labels.map((label, i) => {
            const trimmed = label.trim();
            const norm = trimmed.toLowerCase();
            let accountId = accountNameToId[norm] || accountNameToId[trimmed] || null;

            if (!accountId) {
                const found = bankAccounts.find(a => a.name === trimmed);
                if (found) accountId = found.id;
            }

            const isCOGS = label === 'COGS' || label === 'Cost of Goods Sold';

            console.log('[BREAKDOWN] Mapping label:', label, '-> accountId:', accountId, 'isCOGS:', isCOGS);

            return {
                label: label,
                value: values[i] || 0,
                accountId: isCOGS ? null : accountId,
                isCOGS: isCOGS
            };
        });

        const filtered = labelsWithIds.filter(item =>
            Math.abs(item.value) > 0.01 || item.isCOGS || item.label === netLabel
        );
        console.log('[BREAKDOWN] 8. Filtered to', filtered.length, 'items');
        console.log('[BREAKDOWN] Filtered items:', filtered.map(f => ({ label: f.label, accountId: f.accountId, isCOGS: f.isCOGS, value: f.value })));

        if (filtered.length === 0) {
            document.getElementById('breakdown-chart-container').innerHTML = '<p style="text-align:center; padding:40px; color:#333;">No data for this month.</p>';
            return;
        }

        const canvas = document.getElementById('breakdown-chart-canvas');
        console.log('[BREAKDOWN] 9. Canvas element:', canvas);

        if (!canvas) {
            console.error('[BREAKDOWN] ❌ Canvas not found!');
            document.getElementById('breakdown-chart-container').innerHTML = '<p style="text-align:center; padding:40px; color:#dc3545;">Error: Canvas not found</p>';
            return;
        }

        const ctx = canvas.getContext('2d');

        if (window._breakdownChart) {
            window._breakdownChart.destroy();
            window._breakdownChart = null;
        }

        const barColors = filtered.map(item => {
            if (item.label === netLabel) {
                return 'rgba(111, 66, 193, 0.85)';
            }
            if (item.isCOGS) {
                return 'rgba(220, 53, 69, 0.85)';
            }
            return item.value >= 0 ? 'rgba(40, 167, 69, 0.75)' : 'rgba(220, 53, 69, 0.75)';
        });
        const borderColors = filtered.map(item => {
            if (item.label === netLabel) {
                return '#6f42c1';
            }
            if (item.isCOGS) {
                return '#dc3545';
            }
            return item.value >= 0 ? '#28a745' : '#dc3545';
        });

        console.log('[BREAKDOWN] 10. Creating bar chart with', filtered.length, 'bars');

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: filtered.map(item => item.label),
                datasets: [{
                    label: 'Amount',
                    data: filtered.map(item => item.value),
                    backgroundColor: barColors,
                    borderColor: borderColors,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const val = ctx.raw;
                                return (val >= 0 ? '+' : '-') + '$' + Math.abs(val).toFixed(2);
                            }
                        },
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value;
                            },
                            font: { size: 13, weight: 'bold' }
                        },
                        grid: {
                            color: 'rgba(0,0,0,0.08)'
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            font: { size: 13, weight: 'bold' }
                        },
                        grid: {
                            display: false
                        }
                    }
                },
                onClick: function(e, elements) {
                    console.log('[BREAKDOWN] Bar chart click, elements:', elements.length);
                    if (elements.length === 0) return;

                    const element = elements[0];
                    const index = element.index;
                    const item = filtered[index];

                    console.log('[BREAKDOWN] Bar clicked:', item.label, 'value:', item.value, 'accountId:', item.accountId, 'isCOGS:', item.isCOGS);

                    if (Math.abs(item.value) < 0.01) {
                        console.log('[BREAKDOWN] Value too small, ignoring');
                        return;
                    }

                    document.getElementById('monthly-tx-modal')?.classList.remove('active');

                    if (item.isCOGS) {
                        console.log('[BREAKDOWN] COGS bar clicked - showing COGS calculation');
                        showCOGSCalculation(month);
                        return;
                    }

                    const excludeOrders = chartType === 'pl';

                    if (item.accountId) {
                        console.log('[BREAKDOWN] Using account ID:', item.accountId);
                        showMonthlyTransactions(month, item.accountId, item.label, excludeOrders);
                    } else {
                        const trimmed = item.label.trim();
                        const norm = trimmed.toLowerCase();
                        const accountId = accountNameToId[norm] || accountNameToId[trimmed];
                        if (accountId) {
                            console.log('[BREAKDOWN] Found account ID by name:', accountId);
                            showMonthlyTransactions(month, accountId, item.label, excludeOrders);
                        } else {
                            console.log('[BREAKDOWN] No account ID found - showing all transactions');
                            showMonthlyTransactions(month, null, item.label, excludeOrders);
                        }
                    }
                }
            }
        });

        window._breakdownChart = chart;
        console.log('[BREAKDOWN] 11. Chart created successfully');

        modal.classList.add('active');
        console.log('[BREAKDOWN] 12. Modal activated');
        console.log('[BREAKDOWN] ===== SHOW MONTH BREAKDOWN END =====');

    } catch (err) {
        console.error('[BREAKDOWN] ❌ CRITICAL ERROR:', err);
        console.error('[BREAKDOWN] Stack:', err.stack);
        showToast('Error: ' + err.message, 'error');
    }
}

// ============================================================
// SHARED LINE CHART RENDERER
// ============================================================

function renderLineChart(canvasId, data, options = {}) {
    console.log('[CHART] ==================================================');
    console.log('[CHART] RENDER LINE CHART START');
    console.log('[CHART] Canvas ID:', canvasId);
    console.log('[CHART] Options:', options);
    console.log('[CHART] Data status:', data.status);
    console.log('[CHART] Months count:', data.months ? data.months.length : 0);
    console.log('[CHART] Account breakdown keys:', data.account_breakdown ? Object.keys(data.account_breakdown).length : 0);

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error('[CHART] ❌ Canvas not found:', canvasId);
        return null;
    }
    console.log('[CHART] Canvas element found');

    const ctx = canvas.getContext('2d');
    const { months, account_breakdown } = data;
    console.log('[CHART] Months:', months ? months.length : 0);
    console.log('[CHART] Account breakdown keys:', account_breakdown ? Object.keys(account_breakdown).length : 0);

    if (!months || months.length === 0) {
        console.log('[CHART] No data to display');
        return null;
    }

    console.log('[CHART] Months list:', months);

    const allAccountNames = new Set();
    months.forEach(m => {
        const monthData = account_breakdown[m] || {};
        Object.keys(monthData).forEach(acc => allAccountNames.add(acc));
    });
    console.log('[CHART] All account names in data:', Array.from(allAccountNames).sort());

    let chartInstance = null;
    
    if (window[canvasId + 'Instance']) {
        console.log('[CHART] Destroying existing chart instance');
        window[canvasId + 'Instance'].destroy();
        window[canvasId + 'Instance'] = null;
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const labels = months.map(m => {
        const [year, month] = m.split('-');
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    });
    console.log('[CHART] Labels:', labels);

    const accountNames = Array.from(allAccountNames).sort();
    console.log('[CHART] All accounts (sorted):', accountNames);

    const netLabel = accountNames.find(name => name === 'Net' || name === 'Net Income' || name === 'Net Cash');
    console.log('[CHART] Net label:', netLabel);

    const regularAccounts = accountNames.filter(name => name !== netLabel);
    console.log('[CHART] Regular accounts (non-Net):', regularAccounts);

    const revenueKeywords = ['revenue', 'sales', 'income', 'shipping', 'fees', 'gift'];
    const expenseKeywords = ['cogs', 'expense', 'cost', 'postage', 'rent', 'utilities', 'payroll', 'amortization', 'insurance', 'supplies'];

    const sortedAccounts = [...regularAccounts].sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        const aIsRevenue = revenueKeywords.some(k => aLower.includes(k));
        const bIsRevenue = revenueKeywords.some(k => bLower.includes(k));
        const aIsExpense = expenseKeywords.some(k => aLower.includes(k));
        const bIsExpense = expenseKeywords.some(k => bLower.includes(k));

        if (aIsRevenue && !bIsRevenue) return -1;
        if (!aIsRevenue && bIsRevenue) return 1;
        if (aIsExpense && !bIsExpense) return 1;
        if (!aIsExpense && bIsExpense) return -1;
        return a.localeCompare(b);
    });
    console.log('[CHART] Sorted accounts (revenue first, then expenses):', sortedAccounts);

    const datasets = [];
    let revenueCount = 0;
    let expenseCount = 0;
    let otherCount = 0;

    const revenueColors = ['#28a745', '#20c997', '#8bc34a', '#4caf50', '#009688'];
    const expenseColors = ['#dc3545', '#e74c3c', '#ff6b6b', '#c0392b', '#e67e22'];
    const otherColors = ['#007bff', '#17a2b8', '#6f42c1', '#fd7e14', '#e83e8c', '#6c757d', '#0dcaf0', '#d63384'];

    const lineDashStyles = [
        [],           // solid
        [5, 5],       // dashed
        [2, 4],       // dotted
        [10, 5, 2, 5], // dash-dot
        [8, 4, 2, 4], // dash-dot-dot
        [3, 3],       // short dash
    ];

    const pointStyles = ['circle', 'rect', 'triangle', 'diamond', 'cross', 'crossRot', 'star', 'line', 'dash'];

    console.log('[CHART] Building datasets for', sortedAccounts.length, 'accounts');

    sortedAccounts.forEach((accountName, idx) => {
        const values = months.map(m => {
            const monthData = account_breakdown[m] || {};
            return monthData[accountName] || 0;
        });

        console.log(`[CHART] Account "${accountName}" values:`, values);

        if (values.every(v => Math.abs(v) < 0.01)) {
            console.log(`[CHART] Skipping zero account: "${accountName}" (all values < 0.01)`);
            return;
        }

        console.log(`[CHART] Processing account with values: "${accountName}" ->`, values);

        const aLower = accountName.toLowerCase();
        const isRevenue = revenueKeywords.some(k => aLower.includes(k));
        const isExpense = expenseKeywords.some(k => aLower.includes(k));
        console.log(`[CHART] Account "${accountName}" - isRevenue: ${isRevenue}, isExpense: ${isExpense}`);

        let borderColor, backgroundColor, borderDash, borderWidth, pointStyle, pointRadius;

        const styleIdx = idx % 6;
        const colorIdx = isRevenue ? revenueCount % revenueColors.length :
                         isExpense ? expenseCount % expenseColors.length :
                         otherCount % otherColors.length;

        if (isRevenue) {
            borderColor = revenueColors[colorIdx];
            backgroundColor = borderColor + '40';
            borderDash = lineDashStyles[styleIdx % lineDashStyles.length];
            borderWidth = 3;
            pointStyle = pointStyles[styleIdx % pointStyles.length];
            pointRadius = 5;
            revenueCount++;
            console.log(`[CHART] Account "${accountName}" classified as REVENUE, color: ${borderColor}`);
        } else if (isExpense) {
            borderColor = expenseColors[colorIdx];
            backgroundColor = borderColor + '40';
            borderDash = lineDashStyles[(styleIdx + 2) % lineDashStyles.length];
            borderWidth = 3;
            pointStyle = pointStyles[(styleIdx + 3) % pointStyles.length];
            pointRadius = 5;
            expenseCount++;
            console.log(`[CHART] Account "${accountName}" classified as EXPENSE, color: ${borderColor}`);
        } else {
            borderColor = otherColors[colorIdx % otherColors.length];
            backgroundColor = borderColor + '40';
            borderDash = lineDashStyles[(styleIdx + 1) % lineDashStyles.length];
            borderWidth = 3;
            pointStyle = pointStyles[(styleIdx + 5) % pointStyles.length];
            pointRadius = 5;
            otherCount++;
            console.log(`[CHART] Account "${accountName}" classified as OTHER, color: ${borderColor}`);
        }

        datasets.push({
            label: accountName,
            data: values,
            borderColor: borderColor,
            backgroundColor: backgroundColor,
            borderDash: borderDash,
            borderWidth: borderWidth,
            pointStyle: pointStyle,
            pointRadius: pointRadius,
            pointHoverRadius: 8,
            pointHoverBorderWidth: 3,
            fill: false,
            tension: 0,
            hidden: false
        });
    });

    if (netLabel) {
        const netValues = months.map(m => {
            const monthData = account_breakdown[m] || {};
            return monthData[netLabel] || 0;
        });
        console.log(`[CHART] Net "${netLabel}" values:`, netValues);

        if (!netValues.every(v => Math.abs(v) < 0.01)) {
            datasets.push({
                label: netLabel,
                data: netValues,
                borderColor: '#6f42c1',
                backgroundColor: '#6f42c130',
                borderDash: [],
                borderWidth: 5,
                pointStyle: 'diamond',
                pointRadius: 7,
                pointHoverRadius: 11,
                pointBackgroundColor: '#6f42c1',
                pointBorderColor: 'white',
                pointBorderWidth: 3,
                fill: false,
                tension: 0,
                hidden: false
            });
            console.log(`[CHART] Added Net dataset: "${netLabel}"`);
        }
    }

    if (datasets.length === 0) {
        console.log('[CHART] No data to display after filtering');
        return null;
    }
    console.log('[CHART] Total datasets built:', datasets.length);
    console.log('[CHART] Dataset labels:', datasets.map(d => d.label));

    let maxVal = 0;
    datasets.forEach(ds => {
        ds.data.forEach(v => {
            if (Math.abs(v) > maxVal) maxVal = Math.abs(v);
        });
    });
    const yMax = Math.ceil((maxVal * 1.25) / 100) * 100 || 100;
    console.log('[CHART] Y-axis max:', yMax);

    const isPL = options.type === 'pl';
    console.log('[CHART] Chart type:', isPL ? 'P&L' : (options.type === 'balancesheet' ? 'Balance Sheet' : 'Cash Flow'));

    if (canvasId === 'pl-chart') {
        plChartData = data;
        plMonths = months;
        allPLData = data;
        console.log('[CHART] Stored plChartData');
    } else if (canvasId === 'cash-flow-chart') {
        cashFlowChartData = data;
        cashFlowMonths = months;
        allCashFlowData = data;
        console.log('[CHART] Stored cashFlowChartData');
    } else if (canvasId === 'bs-chart') {
        bsChartData = data;
        bsMonths = months;
        allBSData = data;
        console.log('[CHART] Stored bsChartData');
    }

    console.log('[CHART] Creating Chart.js instance...');

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        pointStyle: false,
                        padding: 20,
                        font: { size: 13, weight: 'bold' },
                        color: '#000000',
                        boxWidth: 16,
                        boxHeight: 16
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            const label = context.dataset.label || '';
                            const sign = val >= 0 ? '+' : '';
                            const ds = context.dataset;
                            const dashInfo = ds.borderDash && ds.borderDash.length > 0 ? ' [dashed]' : '';
                            return `${label}${dashInfo}: ${sign}$${Math.abs(val).toFixed(2)}`;
                        }
                    },
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 }
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: { size: 13, weight: 'bold' },
                        color: '#000000'
                    },
                    grid: {
                        display: true,
                        drawBorder: true,
                        color: 'rgba(0,0,0,0.2)'
                    }
                },
                y: {
                    beginAtZero: true,
                    max: yMax,
                    min: -yMax,
                    ticks: {
                        callback: function(value) {
                            return '$' + value;
                        },
                        font: { size: 13, weight: 'bold' },
                        color: '#000000'
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.15)',
                        drawBorder: true
                    }
                }
            }
        }
    });
    console.log('[CHART] Chart.js instance created');
    console.log('[CHART] Chart data datasets:', chart.data.datasets.length);

    window[canvasId + 'Instance'] = chart;

    if (canvasId === 'pl-chart') {
        plChartInstance = chart;
        console.log('[CHART] Set plChartInstance');
    } else if (canvasId === 'cash-flow-chart') {
        cashFlowChartInstance = chart;
        console.log('[CHART] Set cashFlowChartInstance');
    } else if (canvasId === 'bs-chart') {
        bsChartInstance = chart;
        console.log('[CHART] Set bsChartInstance');
    }

    console.log('[CHART] Adding x-axis click handler');

    canvas.addEventListener('click', function(e) {
        console.log('[CHART-X] Canvas click detected');
        try {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const chartInstance = window[canvasId + 'Instance'] || Chart.getChart(canvas);
            if (!chartInstance) {
                console.log('[CHART-X] No chart instance found');
                return;
            }

            const chartArea = chartInstance.chartArea;
            if (!chartArea) {
                console.log('[CHART-X] No chart area found');
                return;
            }

            const chartHeight = chartArea.bottom - chartArea.top;
            const yPos = (y - chartArea.top) / chartHeight;

            if (yPos < 0.8 || yPos > 1.1) {
                console.log('[CHART-X] Click not on x-axis (yPos:', yPos, ')');
                return;
            }

            console.log('[CHART-X] Click on x-axis!');

            const xScale = chartInstance.scales.x;
            if (!xScale) {
                console.log('[CHART-X] No x scale found');
                return;
            }

            const pixelsPerTick = (xScale.right - xScale.left) / (months.length || 1);
            const clickedIndex = Math.round((x - xScale.left) / pixelsPerTick);

            console.log('[CHART-X] Clicked index:', clickedIndex, 'months length:', months.length);

            if (clickedIndex >= 0 && clickedIndex < months.length) {
                const month = months[clickedIndex];
                console.log('[CHART-X] ✅ Month detected:', month);

                document.getElementById('monthly-tx-modal')?.classList.remove('active');

                const dataToUse = canvasId === 'pl-chart' ? plChartData :
                                 canvasId === 'cash-flow-chart' ? cashFlowChartData :
                                 bsChartData;
                if (dataToUse) {
                    console.log('[CHART-X] Showing breakdown for month:', month);
                    showMonthBreakdownModal(month, dataToUse, options.type || 'pl');
                } else {
                    console.warn('[CHART-X] No chart data available for breakdown');
                    showToast('No data available for this month', 'warning');
                }
            } else {
                console.log('[CHART-X] Index out of range:', clickedIndex);
            }
        } catch (err) {
            console.error('[CHART-X] Error in click handler:', err);
        }
    });
    console.log('[CHART-X] Click handler attached');

    if (canvasId === 'cash-flow-chart') {
        canvas.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            console.log('[CHART] Double-click detected, expanding');
            expandChart(canvasId);
        });
        console.log('[CHART] Double-click expand attached for cash flow');
    }

    console.log('[CHART] ==================================================');
    console.log('[CHART] RENDER LINE CHART END');
    return chart;
}

// ============================================================
// EXPAND CHART (Full Screen) - Cash Flow only
// ============================================================

function expandChart(canvasId) {
    console.log('[EXPAND] Expanding chart:', canvasId);

    if (canvasId !== 'cash-flow-chart') {
        console.log('[EXPAND] Only Cash Flow chart can be expanded');
        return;
    }

    if (isExpanded) {
        collapseChart();
        return;
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error('[EXPAND] Canvas not found:', canvasId);
        return;
    }

    const chart = window[canvasId + 'Instance'] || Chart.getChart(canvas);
    if (!chart) {
        console.error('[EXPAND] Chart not found for canvas:', canvasId);
        return;
    }

    isExpanded = true;

    const container = document.createElement('div');
    container.id = 'expanded-chart-container';

    container.innerHTML = `
        <div class="chart-header">
            <h3>Cash Flow - Expanded</h3>
            <button class="btn btn-secondary" onclick="collapseChart()">
                <i class="fas fa-times"></i> Close
            </button>
        </div>
        <div class="chart-body">
            <canvas id="expanded-chart-canvas"></canvas>
        </div>
    `;

    document.body.appendChild(container);

    const newCanvas = document.getElementById('expanded-chart-canvas');
    const newCtx = newCanvas.getContext('2d');

    const expandedChart = new Chart(newCtx, {
        type: 'line',
        data: chart.data,
        options: {
            ...chart.options,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                ...chart.options.plugins,
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        pointStyle: false,
                        padding: 25,
                        font: { size: 15, weight: 'bold' },
                        color: '#000000',
                        boxWidth: 18,
                        boxHeight: 18
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            const label = context.dataset.label || '';
                            const sign = val >= 0 ? '+' : '';
                            const ds = context.dataset;
                            const dashInfo = ds.borderDash && ds.borderDash.length > 0 ? ' [dashed]' : '';
                            return `${label}${dashInfo}: ${sign}$${Math.abs(val).toFixed(2)}`;
                        }
                    },
                    titleFont: { size: 16, weight: 'bold' },
                    bodyFont: { size: 15 }
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: { size: 15, weight: 'bold' },
                        color: '#000000'
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.2)'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value;
                        },
                        font: { size: 15, weight: 'bold' },
                        color: '#000000'
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.15)'
                    }
                }
            }
        }
    });

    window._expandedChart = expandedChart;

    const resizeObserver = new ResizeObserver(() => {
        if (expandedChart) expandedChart.resize();
    });
    const chartBody = container.querySelector('.chart-body');
    if (chartBody) {
        resizeObserver.observe(chartBody);
    }
    window._expandedResizeObserver = resizeObserver;

    console.log('[EXPAND] Chart expanded');
}

function collapseChart() {
    console.log('[EXPAND] Collapsing chart');
    isExpanded = false;

    if (window._expandedChart) {
        window._expandedChart.destroy();
        window._expandedChart = null;
    }

    if (window._expandedResizeObserver) {
        window._expandedResizeObserver.disconnect();
        window._expandedResizeObserver = null;
    }

    const container = document.getElementById('expanded-chart-container');
    if (container) {
        container.remove();
    }

    if (cashFlowChartInstance) {
        try { cashFlowChartInstance.resize(); } catch(e) {}
    }

    console.log('[EXPAND] Chart collapsed');
}

// ============================================================
// CASH FLOW
// ============================================================

async function loadCashFlow() {
    console.log('[CASHFLOW] ===== LOAD CASH FLOW START =====');

    const startInput = document.getElementById('cash-flow-start');
    const endInput = document.getElementById('cash-flow-end');
    const start = startInput.value;
    const end = endInput.value;
    console.log('[CASHFLOW] Start month:', start);
    console.log('[CASHFLOW] End month:', end);

    if (!start || !end) {
        alert('Please select both start and end months.');
        return;
    }

    if (bankAccounts.length === 0) {
        console.log('[CASHFLOW] Loading bank accounts');
        await loadBankAccountsForRowDropdowns();
    }

    try {
        const startDate = new Date(start + '-01');
        const endDate = new Date(end + '-01');
        const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
        const startStr = startDate.toISOString().slice(0, 10);
        const endStr = lastDay.toISOString().slice(0, 10);

        console.log('[CASHFLOW] Fetching data from API with start:', startStr, 'end:', endStr);
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/cash-flow-detail?start=${startStr}&end=${endStr}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to fetch cash flow data');
        const data = await res.json();
        console.log('[CASHFLOW] API response:', data);

        if (data.status === 'success') {
            console.log('[CASHFLOW] Data loaded, months:', data.months ? data.months.length : 0);

            allCashFlowData = data;
            cashFlowMonths = data.months || [];

            const dateRangeEl = document.getElementById('cash-flow-date-range');
            if (dateRangeEl && cashFlowMonths.length > 0) {
                const formatMonth = (m) => {
                    const [year, month] = m.split('-');
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${monthNames[parseInt(month) - 1]} ${year}`;
                };
                dateRangeEl.textContent = `Showing ${formatMonth(cashFlowMonths[0])} to ${formatMonth(cashFlowMonths[cashFlowMonths.length - 1])}`;
                dateRangeEl.style.display = 'block';
            }

            renderLineChart('cash-flow-chart', data, { type: 'cashflow' });
        } else {
            console.error('[CASHFLOW] Error:', data.error);
            document.getElementById('cash-flow-chart-container').innerHTML = `<p class="monthly-error">${data.error || 'Error loading data'}</p>`;
        }
    } catch (err) {
        console.error('[CASHFLOW] Error:', err);
        document.getElementById('cash-flow-chart-container').innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
    }
    console.log('[CASHFLOW] ===== LOAD CASH FLOW END =====');
}

// ============================================================
// MONTHLY P&L
// ============================================================

async function loadMonthlyPL() {
    console.log('[MONTHLY-PL] ==================================================');
    console.log('[MONTHLY-PL] LOAD MONTHLY P&L START');
    console.log('[MONTHLY-PL] Timestamp:', new Date().toISOString());

    const startInput = document.getElementById('pl-start');
    const endInput = document.getElementById('pl-end');

    console.log('[MONTHLY-PL] Start input element:', startInput);
    console.log('[MONTHLY-PL] End input element:', endInput);
    console.log('[MONTHLY-PL] Start input value:', startInput ? startInput.value : 'NULL');
    console.log('[MONTHLY-PL] End input value:', endInput ? endInput.value : 'NULL');

    const start = startInput ? startInput.value : '';
    const end = endInput ? endInput.value : '';

    console.log('[MONTHLY-PL] Start month:', start);
    console.log('[MONTHLY-PL] End month:', end);

    if (!start || !end) {
        console.log('[MONTHLY-PL] ❌ Missing start or end month. Start:', start, 'End:', end);
        alert('Please select both start and end months.');
        return;
    }

    if (bankAccounts.length === 0) {
        console.log('[MONTHLY-PL] Loading bank accounts');
        await loadBankAccountsForRowDropdowns();
        console.log('[MONTHLY-PL] Bank accounts loaded, count:', bankAccounts.length);
    }

    try {
        console.log('[MONTHLY-PL] Converting months to dates...');
        const startDate = new Date(start + '-01');
        const endDate = new Date(end + '-01');
        const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);

        console.log('[MONTHLY-PL] startDate:', startDate.toISOString());
        console.log('[MONTHLY-PL] endDate:', endDate.toISOString());
        console.log('[MONTHLY-PL] lastDay:', lastDay.toISOString());

        const startStr = startDate.toISOString().slice(0, 10);
        const endStr = lastDay.toISOString().slice(0, 10);

        console.log('[MONTHLY-PL] ✅ Calculated start date:', startStr);
        console.log('[MONTHLY-PL] ✅ Calculated end date:', endStr);

        const url = `${AppConfig.baseUrl}/api/accounting/monthly-pl?start=${startStr}&end=${endStr}`;
        console.log('[MONTHLY-PL] 🔗 Fetching URL:', url);

        const res = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });

        console.log('[MONTHLY-PL] 📡 Fetch response status:', res.status);
        console.log('[MONTHLY-PL] 📡 Fetch response ok:', res.ok);

        if (!res.ok) {
            console.error('[MONTHLY-PL] ❌ Fetch failed with status:', res.status);
            throw new Error('Failed to fetch P&L data');
        }

        const data = await res.json();
        console.log('[MONTHLY-PL] 📦 Data received:');
        console.log('[MONTHLY-PL]   - status:', data.status);
        console.log('[MONTHLY-PL]   - months count:', data.months ? data.months.length : 0);
        console.log('[MONTHLY-PL]   - months:', data.months ? JSON.stringify(data.months) : 'none');
        console.log('[MONTHLY-PL]   - account_breakdown keys:', data.account_breakdown ? Object.keys(data.account_breakdown) : 'none');

        if (data.account_breakdown && data.account_breakdown['2026-07']) {
            console.log('[MONTHLY-PL] ✅ July 2026 data found:');
            console.log('[MONTHLY-PL]   - July accounts:', Object.keys(data.account_breakdown['2026-07']));
            console.log('[MONTHLY-PL]   - July values:', JSON.stringify(data.account_breakdown['2026-07'], null, 2));
        } else {
            console.log('[MONTHLY-PL] ❌ July 2026 data NOT FOUND in API response');
            console.log('[MONTHLY-PL] Available months:', data.months ? data.months.join(', ') : 'none');
        }

        if (data.status === 'success') {
            console.log('[MONTHLY-PL] ✅ Data loaded successfully');

            allPLData = data;
            plMonths = data.months || [];
            console.log('[MONTHLY-PL] Stored plMonths:', plMonths);

            const dateRangeEl = document.getElementById('pl-date-range');
            if (dateRangeEl && plMonths.length > 0) {
                const formatMonth = (m) => {
                    const [year, month] = m.split('-');
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${monthNames[parseInt(month) - 1]} ${year}`;
                };
                const displayText = `Showing ${formatMonth(plMonths[0])} to ${formatMonth(plMonths[plMonths.length - 1])}`;
                dateRangeEl.textContent = displayText;
                dateRangeEl.style.display = 'block';
                console.log('[MONTHLY-PL] Date range label set to:', displayText);
            } else {
                console.log('[MONTHLY-PL] ⚠️ No months to display in date range label');
            }

            console.log('[MONTHLY-PL] 📊 Calling renderLineChart with data');
            console.log('[MONTHLY-PL] Data months count:', data.months ? data.months.length : 0);
            renderLineChart('pl-chart', data, { type: 'pl' });
            console.log('[MONTHLY-PL] renderLineChart called successfully');

        } else {
            console.error('[MONTHLY-PL] ❌ API returned error status:', data.error);
            document.getElementById('pl-chart-container').innerHTML = `<p class="monthly-error">${data.error || 'Error loading data'}</p>`;
        }
    } catch (err) {
        console.error('[MONTHLY-PL] ❌ CRITICAL ERROR:', err);
        console.error('[MONTHLY-PL] Error stack:', err.stack);
        document.getElementById('pl-chart-container').innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
    }
    console.log('[MONTHLY-PL] ===== LOAD MONTHLY P&L END =====');
}

// ============================================================
// BALANCE SHEET
// ============================================================

async function loadBalanceSheet() {
    console.log('[BALANCE-SHEET] ==================================================');
    console.log('[BALANCE-SHEET] LOAD BALANCE SHEET START');
    console.log('[BALANCE-SHEET] Timestamp:', new Date().toISOString());

    const startInput = document.getElementById('bs-start');
    const endInput = document.getElementById('bs-end');

    console.log('[BALANCE-SHEET] Start input element:', startInput);
    console.log('[BALANCE-SHEET] End input element:', endInput);
    console.log('[BALANCE-SHEET] Start input value:', startInput ? startInput.value : 'NULL');
    console.log('[BALANCE-SHEET] End input value:', endInput ? endInput.value : 'NULL');

    const start = startInput ? startInput.value : '';
    const end = endInput ? endInput.value : '';

    console.log('[BALANCE-SHEET] Start month:', start);
    console.log('[BALANCE-SHEET] End month:', end);

    if (!start || !end) {
        console.log('[BALANCE-SHEET] ❌ Missing start or end month. Start:', start, 'End:', end);
        alert('Please select both start and end months.');
        return;
    }

    if (bankAccounts.length === 0) {
        console.log('[BALANCE-SHEET] Loading bank accounts');
        await loadBankAccountsForRowDropdowns();
        console.log('[BALANCE-SHEET] Bank accounts loaded, count:', bankAccounts.length);
    }

    try {
        console.log('[BALANCE-SHEET] Converting months to dates...');
        const startDate = new Date(start + '-01');
        const endDate = new Date(end + '-01');
        const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);

        console.log('[BALANCE-SHEET] startDate:', startDate.toISOString());
        console.log('[BALANCE-SHEET] endDate:', endDate.toISOString());
        console.log('[BALANCE-SHEET] lastDay:', lastDay.toISOString());

        const startStr = startDate.toISOString().slice(0, 10);
        const endStr = lastDay.toISOString().slice(0, 10);

        console.log('[BALANCE-SHEET] ✅ Calculated start date:', startStr);
        console.log('[BALANCE-SHEET] ✅ Calculated end date:', endStr);

        const url = `${AppConfig.baseUrl}/api/accounting/balance-sheet?start=${startStr}&end=${endStr}`;
        console.log('[BALANCE-SHEET] 🔗 Fetching URL:', url);

        const res = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });

        console.log('[BALANCE-SHEET] 📡 Fetch response status:', res.status);
        console.log('[BALANCE-SHEET] 📡 Fetch response ok:', res.ok);

        if (!res.ok) {
            console.error('[BALANCE-SHEET] ❌ Fetch failed with status:', res.status);
            throw new Error('Failed to fetch Balance Sheet data');
        }

        const data = await res.json();
        console.log('[BALANCE-SHEET] 📦 Data received:');
        console.log('[BALANCE-SHEET]   - status:', data.status);
        console.log('[BALANCE-SHEET]   - months count:', data.months ? data.months.length : 0);
        console.log('[BALANCE-SHEET]   - months:', data.months ? JSON.stringify(data.months) : 'none');
        console.log('[BALANCE-SHEET]   - account_breakdown keys:', data.account_breakdown ? Object.keys(data.account_breakdown) : 'none');

        if (data.account_breakdown && data.account_breakdown['2026-07']) {
            console.log('[BALANCE-SHEET] ✅ July 2026 data found:');
            console.log('[BALANCE-SHEET]   - July accounts:', Object.keys(data.account_breakdown['2026-07']));
            console.log('[BALANCE-SHEET]   - July values:', JSON.stringify(data.account_breakdown['2026-07'], null, 2));
        } else {
            console.log('[BALANCE-SHEET] ❌ July 2026 data NOT FOUND in API response');
            console.log('[BALANCE-SHEET] Available months:', data.months ? data.months.join(', ') : 'none');
        }

        if (data.status === 'success') {
            console.log('[BALANCE-SHEET] ✅ Data loaded successfully');

            allBSData = data;
            bsMonths = data.months || [];
            console.log('[BALANCE-SHEET] Stored bsMonths:', bsMonths);

            const dateRangeEl = document.getElementById('bs-date-range');
            if (dateRangeEl && bsMonths.length > 0) {
                const formatMonth = (m) => {
                    const [year, month] = m.split('-');
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${monthNames[parseInt(month) - 1]} ${year}`;
                };
                const displayText = `Showing ${formatMonth(bsMonths[0])} to ${formatMonth(bsMonths[bsMonths.length - 1])}`;
                dateRangeEl.textContent = displayText;
                dateRangeEl.style.display = 'block';
                console.log('[BALANCE-SHEET] Date range label set to:', displayText);
            } else {
                console.log('[BALANCE-SHEET] ⚠️ No months to display in date range label');
            }

            console.log('[BALANCE-SHEET] 📊 Calling renderLineChart with data');
            console.log('[BALANCE-SHEET] Data months count:', data.months ? data.months.length : 0);
            renderLineChart('bs-chart', data, { type: 'balancesheet' });
            console.log('[BALANCE-SHEET] renderLineChart called successfully');

        } else {
            console.error('[BALANCE-SHEET] ❌ API returned error status:', data.error);
            document.getElementById('bs-chart-container').innerHTML = `<p class="monthly-error">${data.error || 'Error loading data'}</p>`;
        }
    } catch (err) {
        console.error('[BALANCE-SHEET] ❌ CRITICAL ERROR:', err);
        console.error('[BALANCE-SHEET] Error stack:', err.stack);
        document.getElementById('bs-chart-container').innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
    }
    console.log('[BALANCE-SHEET] ===== LOAD BALANCE SHEET END =====');
}

// ============================================================
// LOAD BANK ACCOUNTS FOR ROW DROPDOWNS
// ============================================================

async function loadBankAccountsForRowDropdowns() {
    console.log('[BANK] Loading accounts for row dropdowns');
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            bankAccounts = data.accounts;
            accountNameToId = {};
            bankAccounts.forEach(acc => {
                const trimmed = acc.name.trim();
                const norm = trimmed.toLowerCase();
                accountNameToId[norm] = acc.id;
                accountNameToId[trimmed] = acc.id;
                accountNameToId[acc.code] = acc.id;
            });
            console.log('[BANK] Loaded', bankAccounts.length, 'accounts for row dropdowns');
        }
        return data;
    } catch (e) {
        console.error('[BANK] Failed to load accounts for row dropdowns:', e);
        throw e;
    }
}