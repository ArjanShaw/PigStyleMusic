// ============================================================
// admin-accounting.js – Accounting Module (COMPLETE)
// ============================================================

let journalCurrentPage = 1;
const journalPageSize = 20;
let journalTotalEntries = 0;
let currentReportData = null;

// Global list of accounts for bank dropdowns
let bankAccounts = [];

// Chart instances
let plChartInstance = null;
let bsChartInstance = null;
let expandedChartInstance = null;
let isExpanded = false;

// Chart data cache for breakdown modal
let bsChartData = null;
let bsMonths = [];
let allBSData = null;

// Account name to ID mapping
let accountNameToId = {};

// Track which chart type is currently open for breakdown
let currentBreakdownChartType = 'pl';
let currentBreakdownMonth = '';
let currentBreakdownMonths = [];
let currentBreakdownMonthIndex = -1;

// Bank accounts for dropdowns (cached)
let cachedAccounts = [];

// Monthly P&L charts
let monthlyPLCharts = [];
let monthlyPLData = [];

// Custom P&L chart instance
let customPLChartInstance = null;
let currentCustomPLData = null;

// Balance sheet chart instance
let balanceChartInstance = null;
let currentBalanceData = null;

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

function reconnectPlaid(source, label) {
    console.log(`[PLAID] Reconnecting ${source}...`);
    
    let endpoint;
    let exchangeEndpoint;
    
    if (source === 'fnbo') {
        endpoint = `${AppConfig.baseUrl}/api/plaid/create-link-token`;
        exchangeEndpoint = `${AppConfig.baseUrl}/api/plaid/exchange`;
    } else if (source === 'paypal') {
        endpoint = `${AppConfig.baseUrl}/api/plaid/paypal/create-link-token`;
        exchangeEndpoint = `${AppConfig.baseUrl}/api/plaid/paypal/exchange`;
    } else {
        showToast('Unknown source', 'error');
        return;
    }

    console.log(`[PLAID] endpoint: ${endpoint}`);
    console.log(`[PLAID] exchangeEndpoint: ${exchangeEndpoint}`);
    showToast(`Connecting to ${label}...`, 'info');

    fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
    })
    .then(res => {
        console.log(`[PLAID] link token response status: ${res.status}`);
        return res.json();
    })
    .then(data => {
        console.log(`[PLAID] link token response:`, data);
        if (!data.link_token) {
            console.error(`[PLAID] No link_token in response`);
            showToast(`Failed to get link token: ${data.error || 'Unknown error'}`, 'error');
            return;
        }

        const handler = Plaid.create({
            token: data.link_token,
            onSuccess: async (public_token, metadata) => {
                console.log(`[PLAID] Plaid onSuccess called. public_token present: ${!!public_token}`);
                console.log(`[PLAID] metadata:`, metadata);
                showToast(`Exchanging token for ${label}...`, 'info');
                console.log(`[PLAID] Sending exchange request to ${exchangeEndpoint}`);
                const exchangeRes = await fetch(exchangeEndpoint, {
                    method: 'POST',
                    credentials: 'include',
                    headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ public_token })
                });
                console.log(`[PLAID] exchange response status: ${exchangeRes.status}`);
                const exchangeData = await exchangeRes.json();
                console.log(`[PLAID] exchange response body:`, exchangeData);
                if (exchangeData.status === 'success') {
                    console.log(`[PLAID] exchange successful for ${label}`);
                    showToast(`${label} reconnected successfully!`, 'success');
                    refreshAllBalances();
                    loadBankTransactions();
                } else {
                    console.error(`[PLAID] exchange failed:`, exchangeData);
                    showToast(`Failed to exchange token: ${exchangeData.error || 'Unknown error'}`, 'error');
                }
            },
            onExit: (err, metadata) => {
                console.log(`[PLAID] Plaid onExit called. err:`, err);
                console.log(`[PLAID] metadata:`, metadata);
                if (err) {
                    showToast(`Plaid error: ${err.display_message || err.error_message || 'User cancelled'}`, 'error');
                } else {
                    showToast('Reconnection cancelled', 'warning');
                }
            }
        });
        console.log(`[PLAID] Plaid handler created, calling open()`);
        handler.open();
    })
    .catch(err => {
        console.error(`[PLAID] fetch error for ${endpoint}:`, err);
        showToast(`Error: ${err.message}`, 'error');
    });
}

// ============================================================
// EXTERNAL BALANCE CARDS
// ============================================================

async function getSquareBalance() {
    console.log('[BALANCES] Fetching Square balance...');
    const res = await fetch(`${AppConfig.baseUrl}/api/accounting/external/square/balance`, {
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    console.log('[BALANCES] Square balance response:', data);
    if (data.status === 'success') {
        return data.balance ?? 0;
    }
    const err = new Error(data.error || 'Unknown Square error');
    err.plaidError = data;
    throw err;
}

async function getPlaidBalance(source) {
    console.log(`[BALANCES] Fetching ${source} balance from Plaid...`);
    const res = await fetch(`${AppConfig.baseUrl}/api/accounting/external/plaid/balance?source=${source}`, {
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
    });
    
    if (!res.ok) {
        let errorData;
        try {
            errorData = await res.json();
        } catch (e) {
            errorData = { error: `HTTP ${res.status}` };
        }
        console.log(`[BALANCES] ${source} balance error response:`, errorData);
        const err = new Error(errorData.error || 'Unknown error');
        err.plaidError = errorData;
        throw err;
    }
    
    const data = await res.json();
    console.log(`[BALANCES] ${source} balance response:`, data);
    if (data.status === 'success') {
        return data.balance ?? 0;
    }
    const err = new Error(data.error || 'Unknown error');
    err.plaidError = data;
    throw err;
}

async function refreshAllBalances() {
    console.log('[BALANCES] Refreshing all external account balances...');

    // Show loading state
    const cardIds = ['balance-square', 'balance-fnbo', 'balance-paypal', 'balance-total-assets'];
    cardIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = 'Loading...';
    });

    const sources = [
        { id: 'balance-square', label: 'Square', fetcher: getSquareBalance, source: 'square' },
        { id: 'balance-fnbo', label: 'FNBO', fetcher: () => getPlaidBalance('fnbo'), source: 'fnbo' },
        { id: 'balance-paypal', label: 'PayPal', fetcher: () => getPlaidBalance('paypal'), source: 'paypal' }
    ];

    let anyError = false;
    const results = [];

    for (const src of sources) {
        const el = document.getElementById(src.id);
        try {
            const balance = await src.fetcher();
            results.push({ id: src.id, balance, error: null });
            if (el) {
                el.textContent = formatCurrency(balance);
                el.style.color = balance >= 0 ? '#28a745' : '#dc3545';
            }
        } catch (error) {
            anyError = true;
            const errorMsg = error.message || 'Unknown error';
            console.error(`[BALANCES] Error from ${src.label}:`, error);

            results.push({ id: src.id, balance: null, error: errorMsg });

            if (el) {
                el.textContent = '⚠️ Error';
                el.style.color = '#dc3545';
            }

            showToast(`${src.label} error: ${errorMsg}`, 'error');
        }
    }

    // Update total assets
    const totalEl = document.getElementById('balance-total-assets');
    if (totalEl) {
        const validBalances = results
            .filter(r => r.error === null && r.balance !== null)
            .map(r => r.balance);
        if (validBalances.length === 0) {
            totalEl.textContent = '⚠️ Error';
            totalEl.style.color = '#dc3545';
        } else {
            const totalAssets = validBalances.reduce((sum, b) => sum + b, 0);
            totalEl.textContent = formatCurrency(totalAssets);
            totalEl.style.color = '#6f42c1';
        }
    }

    console.log('[BALANCES] Balance refresh complete', results);
}

function formatCurrency(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) {
        return '$0.00';
    }
    const sign = amount >= 0 ? '' : '-';
    return sign + '$' + Math.abs(amount).toFixed(2);
}

function loadAccountBalances() {
    console.log('[BALANCES] Loading external balances for Import tab');
    refreshAllBalances();
}

// ============================================================
// PAYPAL PLAID CONNECTION (initial)
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
                    refreshAllBalances();
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
            cachedAccounts = data.accounts;

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

            populateBulkAccountSelect();
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
// BULK ACCOUNT ASSIGNMENT
// ============================================================

function populateBulkAccountSelect() {
    const accountSelect = document.getElementById('bulk-account-select');
    const selectedCheckboxes = document.querySelectorAll('#bank-body .tx-select:checked');

    if (selectedCheckboxes.length === 0) {
        accountSelect.style.display = 'none';
        accountSelect.innerHTML = '<option value="">Select Account</option>';
        return;
    }

    accountSelect.style.display = 'inline-block';

    let hasPositive = false;
    let hasNegative = false;
    let hasMixed = false;

    selectedCheckboxes.forEach(cb => {
        const txId = cb.dataset.txId;
        const select = document.querySelector(`.post-select[data-tx-id="${txId}"]`);
        if (select) {
            const amount = parseFloat(select.dataset.amount || 0);
            if (amount > 0) hasPositive = true;
            if (amount < 0) hasNegative = true;
        }
    });

    if (hasPositive && hasNegative) {
        hasMixed = true;
    }

    const currentValue = accountSelect.value;
    let optionsHtml = '<option value="">Select Account</option>';
    const accountsToShow = cachedAccounts.filter(acc => {
        if (hasMixed) return true;
        if (hasPositive) return acc.type === 'revenue';
        if (hasNegative) return (acc.type === 'expense' || acc.type === 'revenue' || acc.type === 'liability');
        return false;
    });

    accountsToShow.forEach(acc => {
        const selected = acc.id == currentValue ? 'selected' : '';
        optionsHtml += `<option value="${acc.id}" ${selected}>${acc.code} - ${acc.name}</option>`;
    });

    accountSelect.innerHTML = optionsHtml;
}

function bulkAssignAccount() {
    const accountSelect = document.getElementById('bulk-account-select');
    const selectedAccount = accountSelect.value;

    if (!selectedAccount) {
        showToast('Please select an account to assign.', 'warning');
        return;
    }

    const selectedCheckboxes = document.querySelectorAll('#bank-body .tx-select:checked');

    if (selectedCheckboxes.length === 0) {
        showToast('Please select at least one transaction.', 'warning');
        return;
    }

    if (!confirm(`Assign account to ${selectedCheckboxes.length} selected transaction(s)?`)) {
        return;
    }

    let assignedCount = 0;
    selectedCheckboxes.forEach(cb => {
        const txId = cb.dataset.txId;
        const row = cb.closest('tr');
        const select = row ? row.querySelector('.post-select') : null;
        if (select) {
            select.value = selectedAccount;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.classList.add('changed');
            assignedCount++;
        }
    });

    showToast(`Account assigned to ${assignedCount} transaction(s)`, 'success');

    accountSelect.value = '';
    document.getElementById('select-all-tx').checked = false;
    document.querySelectorAll('#bank-body .tx-select:checked').forEach(cb => cb.checked = false);
    populateBulkAccountSelect();
}

// ============================================================
// RECONCILIATION – PAIRS SUMMARY (NO SLIDER)
// ============================================================

let selectedPairId = null;

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

        // Fetch all timeline data for each pair (no date filters)
        const pairPromises = pairs.map(async (p) => {
            const params = new URLSearchParams();
            params.append('account1', p.account_a_id);
            params.append('account2', p.account_b_id);
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
// RECONCILIATION – TIMELINE (NO SLIDER)
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

    const resultDiv = document.getElementById('reconcile-result');
    resultDiv.innerHTML = '<p style="color: #000; text-align: center; padding: 20px;">Loading...</p>';

    try {
        const params = new URLSearchParams();
        params.append('account1', account1);
        params.append('account2', account2);

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
        resultDiv.innerHTML = `<p style="color: #000;">No transactions found for these accounts.</p>`;
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
    
    // Add unbalanced filter
    const unbalancedOnly = document.getElementById('journal-unbalanced-only').checked;
    if (unbalancedOnly) {
        params.append('unbalanced_only', 'true');
    }

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
        const diff = e.difference || 0;
        const diffColor = Math.abs(diff) > 0.01 ? '#dc3545' : '#28a745';
        html += `<tr>
            <td>${e.id}</td>
            <td>${e.transaction_date}</td>
            <td>${e.description || ''}</td>
            <td>${e.debit_account || ''}</td>
            <td class="debit">${e.debit_amount ? '$' + parseFloat(e.debit_amount).toFixed(2) : ''}</td>
            <td>${e.credit_account || ''}</td>
            <td class="credit">${e.credit_amount ? '$' + parseFloat(e.credit_amount).toFixed(2) : ''}</td>
            <td>${e.source_type}: ${e.source_id}</td>
            <td>
                <button class="btn btn-sm btn-info" onclick="viewJournalEntry(${e.id})"><i class="fas fa-eye"></i></button>
                ${Math.abs(diff) > 0.01 ? `<span style="color:#dc3545;font-size:11px;margin-left:5px;">⚖️ $${diff.toFixed(2)}</span>` : ''}
            </td>
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
    document.getElementById('journal-unbalanced-only').checked = false;
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
            let csv = 'ID,Date,Description,Debit Account,Debit Amount,Credit Account,Credit Amount,Source,Difference\n';
            data.entries.forEach(e => {
                const diff = (e.debit_amount || 0) - (e.credit_amount || 0);
                csv += `${e.id},${e.transaction_date},"${(e.description||'').replace(/"/g,'""')}","${e.debit_account||''}",${e.debit_amount||0},"${e.credit_account||''}",${e.credit_amount||0},${e.source_type}:${e.source_id},${diff.toFixed(2)}\n`;
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
// BANK TRANSACTION BULK POSTING
// ============================================================

async function bulkPostTransactions() {
    const selects = document.querySelectorAll('#bank-body .post-select');
    const updates = [];
    let changedCount = 0;

    selects.forEach(select => {
        const initialValue = select.dataset.initialAccount || '';
        const currentValue = select.value;

        if (currentValue && currentValue !== initialValue && select.classList.contains('changed')) {
            changedCount++;
            const txId = select.dataset.txId;
            const sourceType = select.dataset.sourceType;
            const processed = select.dataset.processed === 'true';

            const amount = parseFloat(select.dataset.amount || 0);
            const date = select.dataset.date || '';

            updates.push({
                transaction_id: txId,
                source_type: sourceType,
                target_account_id: parseInt(currentValue),
                is_update: processed,
                amount: amount,
                date: date
            });
        }
    });

    if (updates.length === 0) {
        showToast('No account changes detected. Select different accounts to post.', 'warning');
        return;
    }

    const statusEl = document.getElementById('post-status');
    const postBtn = document.getElementById('post-updates-btn');
    postBtn.disabled = true;
    postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
    statusEl.textContent = `Posting ${updates.length} changed transaction(s)...`;

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/bank/apply-multiple`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });

        const data = await res.json();

        if (data.status === 'success') {
            const msg = `✅ ${data.processed} posted, ${data.created || 0} created, ${data.updated || 0} updated`;
            showToast(msg, 'success');
            statusEl.textContent = msg;

            if (data.errors && data.errors.length > 0) {
                console.error('[BANK] Errors:', data.errors);
                statusEl.textContent += ` ⚠️ ${data.errors.length} error(s)`;
                showToast(`⚠️ ${data.errors.length} transaction(s) failed. Check console.`, 'warning');
            }

            setTimeout(() => {
                loadBankTransactions();
                refreshAllBalances();
            }, 1000);
        } else {
            const errorMsg = data.error || data.message || 'Unknown error';
            showToast('❌ Error: ' + errorMsg, 'error');
            statusEl.textContent = '❌ ' + errorMsg;
            console.error('[BANK] Server error:', data);
        }
    } catch (err) {
        console.error('[BANK] Bulk post error:', err);
        showToast('❌ Error: ' + err.message, 'error');
        statusEl.textContent = '❌ ' + err.message;
    } finally {
        postBtn.disabled = false;
        postBtn.innerHTML = '<i class="fas fa-check-double"></i> Post Updates';
    }
}

function clearAllSelections() {
    document.querySelectorAll('#bank-body .post-select').forEach(select => {
        select.value = select.dataset.initialAccount || '';
        select.classList.remove('changed');
    });
    document.querySelectorAll('#bank-body .tx-select').forEach(cb => {
        cb.checked = false;
    });
    document.getElementById('select-all-tx').checked = false;
    document.getElementById('post-status').textContent = '';
    populateBulkAccountSelect();
    showToast('All selections cleared', 'info');
}

// ============================================================
// IMPORT (BANK) TRANSACTIONS
// ============================================================

async function loadBankTransactions() {
    console.log('[BANK] Loading transactions');
    const body = document.getElementById('bank-body');
    body.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px;">Loading...</td></tr>';

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

        if (res.status === 400) {
            const data = await res.json();
            if (data.needs_connection) {
                if (confirm('PayPal not connected. Would you like to connect your PayPal account via Plaid?')) {
                    connectPayPalPlaid();
                }
                body.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px;">PayPal not connected. Please connect your account.</td></tr>';
                return;
            }
            body.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#dc3545;">${data.error || 'Error'}</td></tr>`;
            return;
        }

        if (!res.ok) throw new Error('Failed to load transactions');
        const data = await res.json();

        if (data.status === 'success') {
            console.log('[BANK] Loaded', data.transactions.length, 'transactions');

            if (cachedAccounts.length === 0) {
                await loadAccountSelects();
            }

            renderBankTransactions(data.transactions);
            updateBankCounts(data.unprocessed_count, data.total_count);
            document.getElementById('bank-pagination-info').textContent = `Showing ${data.transactions.length} entries (${data.total_count} total)`;
        } else {
            body.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#dc3545;">${data.error || 'Error'}</td></tr>`;
        }
    } catch (err) {
        console.error('[BANK] Error:', err);
        body.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#dc3545;">Error: ${err.message}</td></tr>`;
    }
}

function renderBankTransactions(transactions) {
    const body = document.getElementById('bank-body');
    if (!transactions || transactions.length === 0) {
        body.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px;">No transactions found.</td></tr>';
        return;
    }

    let html = '';
    let selectIndex = 0;

    html += `<thead>
        <tr>
            <th><input type="checkbox" id="select-all-tx"></th>
            <th>ID</th>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Category</th>
            <th>Status</th>
            <th>Post To</th>
        </tr>
    </thead><tbody>`;

    transactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        const isDebit = amount < 0;
        const formattedAmount = (isDebit ? '-' : '') + '$' + Math.abs(amount).toFixed(2);
        const statusText = t.processed ? '✅ Posted' : '⏳ Unposted';
        const rowClass = t.processed ? 'bank-row-posted' : 'bank-row-unposted';
        const sourceType = t.source_type || 'unknown';
        const txId = t.id;
        const isProcessed = t.processed || false;

        // ===== UPDATED FILTER LOGIC =====
        // For positive amounts: show Revenue accounts
        // For negative amounts: show Expense, Liability, AND certain Asset accounts
        const filteredAccounts = cachedAccounts.filter(acc => {
            if (amount > 0) {
                // Positive = revenue/inflow
                return acc.type === 'revenue';
            }
            if (amount < 0) {
                // Negative = expense/outflow
                // Allow Expense, Liability
                if (acc.type === 'expense' || acc.type === 'liability') return true;
                // Allow Asset accounts that are prepaids (1055), inventory (1050, 1051), or other asset purchases
                // This covers: Prepaid Rent, Inventory, and any other asset that might be purchased
                if (acc.type === 'asset') {
                    // Allow specific asset codes for purchases
                    const allowedAssetCodes = ['1050', '1051', '1055', '1056', '1057', '1058', '1059'];
                    if (allowedAssetCodes.includes(acc.code)) return true;
                    // Also allow by name pattern
                    if (acc.name && (acc.name.includes('Prepaid') || acc.name.includes('Inventory') || acc.name.includes('Equipment') || acc.name.includes('Leasehold'))) {
                        return true;
                    }
                }
                return false;
            }
            return false;
        });

        let optionsHtml = '<option value="">Select Account</option>';
        filteredAccounts.forEach(acc => {
            optionsHtml += `<option value="${acc.id}">${acc.code} - ${acc.name}</option>`;
        });

        let initialAccount = '';
        if (isProcessed && t.account_id) {
            initialAccount = t.account_id;
        }

        const dataAttrs = `data-tx-id="${txId}" data-source-type="${sourceType}" data-processed="${isProcessed}" data-initial-account="${initialAccount}" data-amount="${amount}" data-date="${t.date || ''}"`;

        const checkboxDisabled = isProcessed ? 'disabled' : '';

        html += `<tr class="${rowClass}">
            <td><input type="checkbox" class="tx-select" data-tx-id="${txId}" ${checkboxDisabled}></td>
            <td style="font-size:11px; color:#666; font-family:monospace;">${txId}</td>
            <td>${t.date || ''}</td>
            <td>${t.description || ''}</td>
            <td style="color: ${isDebit ? '#dc3545' : '#28a745'}; font-weight: 600;">${formattedAmount}</td>
            <td>${t.category || ''}</td>
            <td>${statusText}</td>
            <td>
                <select class="post-select" ${dataAttrs} style="min-width:120px; padding:4px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px; color:#000; background:#fff;">
                    ${optionsHtml}
                </select>
                ${isProcessed ? '<span style="font-size:11px; color:#28a745; margin-left:5px;">(update)</span>' : ''}
            </td>
        </tr>`;
        selectIndex++;
    });

    html += '</tbody>';
    body.innerHTML = html;

    document.querySelectorAll('#bank-body .post-select').forEach(select => {
        const initialAccount = select.dataset.initialAccount || '';
        if (initialAccount) {
            select.value = initialAccount;
        }

        select.addEventListener('change', function() {
            const initial = this.dataset.initialAccount || '';
            if (this.value && this.value !== initial) {
                this.classList.add('changed');
            } else {
                this.classList.remove('changed');
            }
            document.getElementById('select-all-tx').checked = false;
        });
    });

    populateBulkAccountSelect();
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
// CUSTOM P&L TAB
// ============================================================

function initCustomPL() {
    console.log('[CUSTOM-PL] Initializing Custom P&L tab');
    
    // Set default date range: Jan 2025 to current month
    const now = new Date();
    const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    
    const startInput = document.getElementById('custom-pl-start');
    const endInput = document.getElementById('custom-pl-end');
    
    // Default start: January 2025
    if (!startInput.value) {
        startInput.value = '2025-01';
    }
    if (!endInput.value) {
        endInput.value = currentMonth;
    }
    
    // Add event listeners for auto-load
    startInput.addEventListener('change', loadCustomPL);
    endInput.addEventListener('change', loadCustomPL);
    document.getElementById('custom-pl-show-bar-chart').addEventListener('change', loadCustomPL);
    
    // Load initial data
    loadCustomPL();
}

async function loadCustomPL() {
    console.log('[CUSTOM-PL] Loading P&L data...');
    const container = document.getElementById('custom-pl-result');
    container.innerHTML = '<p class="text-muted" style="color:#666;">Loading...</p>';
    
    const start = document.getElementById('custom-pl-start').value;
    const end = document.getElementById('custom-pl-end').value;
    const showBarChart = document.getElementById('custom-pl-show-bar-chart').checked;
    
    if (!start || !end) {
        container.innerHTML = '<p class="text-muted" style="color:#666;">Please select both start and end dates.</p>';
        return;
    }
    
    // Convert month to date range
    const startDate = new Date(start + '-01');
    const endDate = new Date(end + '-01');
    const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = lastDay.toISOString().slice(0, 10);
    
    try {
        const res = await fetch(
            `${AppConfig.baseUrl}/api/accounting/reports?type=pll&date_from=${startStr}&date_to=${endStr}`,
            {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
            }
        );
        
        if (!res.ok) throw new Error('Failed to generate P&L');
        const data = await res.json();
        
        if (data.status === 'success') {
            currentCustomPLData = data;
            
            if (showBarChart) {
                renderCustomPLBarChart(data);
            } else {
                renderCustomPLTable(data);
            }
        } else {
            container.innerHTML = `<p class="text-muted" style="color:#dc3545;">${data.error || 'Error loading P&L'}</p>`;
        }
    } catch (err) {
        console.error('[CUSTOM-PL] Error:', err);
        container.innerHTML = `<p class="text-muted" style="color:#dc3545;">Error: ${err.message}</p>`;
    }
}

function renderCustomPLTable(data) {
    const container = document.getElementById('custom-pl-result');
    if (!data.report || data.report.length === 0) {
        container.innerHTML = '<p class="text-muted" style="color:#666;">No data for this period.</p>';
        return;
    }
    
    // Separate revenue and expenses
    const revenueItems = [];
    const expenseItems = [];
    let totalRevenue = 0;
    let totalExpenses = 0;
    
    data.report.forEach(item => {
        const name = item.Account || '';
        const balance = item.Balance || 0;
        const isRevenue = name.toLowerCase().includes('revenue') || 
                          name.toLowerCase().includes('sales') || 
                          name.toLowerCase().includes('income') ||
                          name.includes('4000') || name.includes('4001') || name.includes('4003');
        
        if (isRevenue && balance > 0) {
            revenueItems.push(item);
            totalRevenue += balance;
        } else if (!isRevenue && balance < 0) {
            expenseItems.push({...item, Balance: Math.abs(balance)});
            totalExpenses += Math.abs(balance);
        } else {
            // Other accounts - put in appropriate section
            if (balance > 0) {
                revenueItems.push(item);
                totalRevenue += balance;
            } else if (balance < 0) {
                expenseItems.push({...item, Balance: Math.abs(balance)});
                totalExpenses += Math.abs(balance);
            }
        }
    });
    
    const netProfit = totalRevenue - totalExpenses;
    const dateRange = `${document.getElementById('custom-pl-start').value} to ${document.getElementById('custom-pl-end').value}`;
    
    let html = `
        <div style="margin-bottom:15px; padding:10px; background:#f8f9fa; border-radius:4px; color:#000;">
            <strong>Period:</strong> ${dateRange}
            <span style="margin-left:20px;"><strong>Total Revenue:</strong> <span style="color:#28a745;">$${totalRevenue.toFixed(2)}</span></span>
            <span style="margin-left:20px;"><strong>Total Expenses:</strong> <span style="color:#dc3545;">$${totalExpenses.toFixed(2)}</span></span>
            <span style="margin-left:20px;"><strong>Net Profit:</strong> <span style="color:${netProfit >= 0 ? '#28a745' : '#dc3545'};font-weight:bold;">$${netProfit.toFixed(2)}</span></span>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:14px; color:#000;">
            <thead>
                <tr style="background:#f8f9fa;">
                    <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Account</th>
                    <th style="padding:8px 12px; text-align:right; border-bottom:2px solid #ddd; color:#000;">Balance</th>
                </tr>
            </thead>
            <tbody>
                <tr style="background:#e8f5e9; font-weight:bold;">
                    <td style="padding:8px 12px; color:#000;">REVENUE</td>
                    <td style="padding:8px 12px; text-align:right; color:#28a745;">$${totalRevenue.toFixed(2)}</td>
                </tr>
    `;
    
    revenueItems.forEach(item => {
        const balance = item.Balance || 0;
        html += `<tr>
            <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#000;">${item.Account}</td>
            <td style="padding:8px 12px; text-align:right; border-bottom:1px solid #eee; color:#28a745;">$${balance.toFixed(2)}</td>
        </tr>`;
    });
    
    html += `
                <tr style="background:#ffebee; font-weight:bold;">
                    <td style="padding:8px 12px; color:#000;">EXPENSES</td>
                    <td style="padding:8px 12px; text-align:right; color:#dc3545;">$${totalExpenses.toFixed(2)}</td>
                </tr>
    `;
    
    expenseItems.forEach(item => {
        const balance = Math.abs(item.Balance || 0);
        html += `<tr>
            <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#000;">${item.Account}</td>
            <td style="padding:8px 12px; text-align:right; border-bottom:1px solid #eee; color:#dc3545;">$${balance.toFixed(2)}</td>
        </tr>`;
    });
    
    html += `
                <tr style="background:#e3f2fd; font-weight:bold;">
                    <td style="padding:8px 12px; color:#000;">NET PROFIT</td>
                    <td style="padding:8px 12px; text-align:right; color:${netProfit >= 0 ? '#28a745' : '#dc3545'};">$${netProfit.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

function renderCustomPLBarChart(data) {
    const container = document.getElementById('custom-pl-result');
    if (!data.report || data.report.length === 0) {
        container.innerHTML = '<p class="text-muted" style="color:#666;">No data for this period.</p>';
        return;
    }
    
    // Extract accounts and balances
    const accountNames = data.report.map(item => item.Account);
    const accountValues = data.report.map(item => item.Balance || 0);
    
    // Determine colors
    const revenueKeywords = ['revenue', 'sales', 'income'];
    const expenseKeywords = ['cogs', 'expense', 'cost', 'shipping', 'fees', 'rent', 'utilities', 'insurance', 'advertising', 'software', 'supplies', 'equipment', 'leasehold', 'improvements'];
    
    const colors = accountNames.map(name => {
        const lower = name.toLowerCase();
        if (revenueKeywords.some(k => lower.includes(k))) {
            return 'rgba(40, 167, 69, 0.85)'; // Green - Revenue
        }
        if (expenseKeywords.some(k => lower.includes(k))) {
            return 'rgba(220, 53, 69, 0.75)'; // Red - Expenses
        }
        return 'rgba(108, 117, 125, 0.7)'; // Gray - Other
    });
    
    const dateRange = `${document.getElementById('custom-pl-start').value} to ${document.getElementById('custom-pl-end').value}`;
    
    container.innerHTML = `
        <div style="margin-top: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div style="font-size: 14px; color: #000; font-weight: 600;">Profit & Loss - ${dateRange}</div>
                <div style="font-size: 12px; color: #666;">
                    ${data.summary || ''}
                </div>
            </div>
            <div style="position: relative; height: 400px;">
                <canvas id="custom-pl-chart"></canvas>
            </div>
            <div style="text-align: center; font-size: 11px; color: #999; margin-top: 10px;">
                Click bar for details
            </div>
        </div>
    `;
    
    // Render the chart
    setTimeout(() => {
        const canvas = document.getElementById('custom-pl-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (customPLChartInstance) {
            customPLChartInstance.destroy();
            customPLChartInstance = null;
        }
        
        customPLChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: accountNames,
                datasets: [{
                    label: 'Balance',
                    data: accountValues,
                    backgroundColor: colors,
                    borderColor: colors.map(c => c.replace('0.85', '1').replace('0.75', '1').replace('0.7', '1')),
                    borderWidth: 1
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
                                return (val >= 0 ? '+' : '') + '$' + val.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value;
                            },
                            font: { size: 10 }
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            font: { size: 9 }
                        }
                    }
                },
                onClick: function(e, elements) {
                    if (elements.length === 0) return;
                    const element = elements[0];
                    const index = element.index;
                    const label = accountNames[index];
                    
                    // Try to find the account ID
                    const trimmed = label.trim();
                    const norm = trimmed.toLowerCase();
                    let accountId = accountNameToId[norm] || accountNameToId[trimmed];
                    if (!accountId) {
                        const found = bankAccounts.find(a => a.name === trimmed);
                        if (found) accountId = found.id;
                    }
                    
                    if (accountId) {
                        showMonthlyTransactions('all', accountId, label, true);
                    } else {
                        showMonthlyTransactions('all', null, label, true);
                    }
                }
            }
        });
    }, 100);
}

function exportCustomPLCSV() {
    console.log('[CUSTOM-PL] Exporting CSV');
    if (!currentCustomPLData || !currentCustomPLData.report) {
        alert('Please load P&L data first.');
        return;
    }
    
    const headers = Object.keys(currentCustomPLData.report[0]);
    let csv = headers.join(',') + '\n';
    currentCustomPLData.report.forEach(row => {
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
    a.download = `pl_${document.getElementById('custom-pl-start').value}_to_${document.getElementById('custom-pl-end').value}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// ============================================================
// BALANCE SHEET TAB
// ============================================================

function initBalanceSheet() {
    console.log('[BALANCE] Initializing Balance Sheet tab');
    
    // Set default date range: Jan 2025 to current month
    const now = new Date();
    const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    
    const startInput = document.getElementById('balance-start');
    const endInput = document.getElementById('balance-end');
    
    if (!startInput.value) {
        startInput.value = '2025-01';
    }
    if (!endInput.value) {
        endInput.value = currentMonth;
    }
    
    // Add event listeners for auto-load
    startInput.addEventListener('change', loadBalanceSheet);
    endInput.addEventListener('change', loadBalanceSheet);
    
    // Load initial data
    loadBalanceSheet();
}


async function loadBalanceSheet() {
    console.log('[BALANCE] Loading Balance Sheet data...');
    const container = document.getElementById('balance-result');
    container.innerHTML = '<p class="text-muted" style="color:#666;">Loading...</p>';
    
    const url = `${AppConfig.baseUrl}/api/accounting/balance-sheet-v2`;
    console.log('[BALANCE] REQUEST URL:', url);
    
    try {
        const res = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        
        console.log('[BALANCE] RESPONSE STATUS:', res.status);
        
        if (!res.ok) throw new Error('Failed to generate Balance Sheet');
        const data = await res.json();
        
        console.log('[BALANCE] RESPONSE PAYLOAD:', JSON.stringify(data, null, 2));
        
        if (data.status === 'success') {
            currentBalanceData = data;
            renderBalanceSheet(data);
        } else {
            container.innerHTML = `<p class="text-muted" style="color:#dc3545;">${data.error || 'Error loading Balance Sheet'}</p>`;
        }
    } catch (err) {
        console.error('[BALANCE] Error:', err);
        container.innerHTML = `<p class="text-muted" style="color:#dc3545;">Error: ${err.message}</p>`;
    }
}

function renderBalanceSheet(data) {
    const container = document.getElementById('balance-result');
    if (!data.report || data.report.length === 0) {
        container.innerHTML = '<p class="text-muted" style="color:#666;">No data for this period.</p>';
        return;
    }
    
    let html = `<table style="width:100%; border-collapse:collapse; font-size:14px; color:#000;">
        <thead>
            <tr style="background:#f8f9fa;">
                <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Account</th>
                <th style="padding:8px 12px; text-align:right; border-bottom:2px solid #ddd; color:#000;">Balance</th>
            </tr>
        </thead>
        <tbody>`;
    
    data.report.forEach(item => {
        const balance = item.balance || 0;
        const name = item.name || '';
        
        html += `<tr>
            <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#000;">${name}</td>
            <td style="padding:8px 12px; text-align:right; border-bottom:1px solid #eee; color:#000;">$${balance.toFixed(2)}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}


function exportBalanceCSV() {
    console.log('[BALANCE] Exporting CSV');
    if (!currentBalanceData || !currentBalanceData.report) {
        alert('Please load Balance Sheet data first.');
        return;
    }
    
    const headers = Object.keys(currentBalanceData.report[0]);
    let csv = headers.join(',') + '\n';
    currentBalanceData.report.forEach(row => {
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
    a.download = `balance_${document.getElementById('balance-start').value}_to_${document.getElementById('balance-end').value}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// ============================================================
// MONTHLY P&L BAR CHARTS - Last 6 Complete Months
// ============================================================

async function loadMonthlyPLBarChart() {
    console.log('[MONTHLY-PL] Loading bar charts for last 6 months...');
    const container = document.getElementById('monthly-pl-bar-chart-container');
    if (!container) {
        console.error('[MONTHLY-PL] Container not found');
        return;
    }

    container.innerHTML = '<div style="text-align: center; font-size: 14px; color: #666; padding: 40px;">Loading charts...</div>';

    try {
        // Get last 6 complete months
        const months = getLastSixCompleteMonths();
        console.log('[MONTHLY-PL] Months to fetch:', months);
        
        // Fetch data for each month
        const allData = [];
        for (const month of months) {
            const dateFrom = `${month.year}-${String(month.month).padStart(2, '0')}-01`;
            const lastDay = new Date(month.year, month.month, 0).getDate();
            const dateTo = `${month.year}-${String(month.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            
            console.log(`[MONTHLY-PL] Fetching ${month.label} (${dateFrom} to ${dateTo})...`);
            
            const res = await fetch(
                `${AppConfig.baseUrl}/api/accounting/reports?type=pll&date_from=${dateFrom}&date_to=${dateTo}`,
                {
                    credentials: 'include',
                    headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
                }
            );
            
            if (!res.ok) throw new Error(`Failed to fetch data for ${month.label}`);
            const data = await res.json();
            
            if (data.status === 'success' && data.report) {
                allData.push({
                    month: month,
                    report: data.report,
                    summary: data.summary
                });
            } else {
                allData.push({
                    month: month,
                    report: [],
                    summary: 'No data'
                });
            }
        }
        
        monthlyPLData = allData;
        renderMonthlyPLBarCharts(allData);
        
    } catch (err) {
        console.error('[MONTHLY-PL] Error:', err);
        container.innerHTML = `<p style="text-align:center; padding:40px; color:#dc3545;">Error: ${err.message}</p>`;
    }
}

function getLastSixCompleteMonths() {
    const now = new Date();
    const months = [];
    
    let year = now.getFullYear();
    let month = now.getMonth();
    
    for (let i = 0; i < 6; i++) {
        let targetYear = year;
        let targetMonth = month - 1 - i;
        
        while (targetMonth < 0) {
            targetMonth += 12;
            targetYear -= 1;
        }
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const label = `${monthNames[targetMonth]} ${targetYear}`;
        
        months.push({
            year: targetYear,
            month: targetMonth + 1,
            label: label,
            index: i
        });
    }
    
    console.log('[MONTHLY-PL] Last 6 complete months:', months);
    return months;
}

function renderMonthlyPLBarCharts(allData) {
    console.log('[MONTHLY-PL] Rendering bar charts...');
    const container = document.getElementById('monthly-pl-bar-chart-container');
    if (!container) return;

    // Define expense account codes
    const expenseCodePrefixes = ['5000', '5010', '5020', '5040', '6010', '6011', '6013', '6014', '6020', '6030', '6080', '6090', '6100', '1850'];
    const revenueCodePrefixes = ['4000', '4001', '4003', '4090'];

    // Build the HTML - 6 charts in a grid
    let gridHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; margin-bottom: 20px;">
    `;

    allData.forEach((monthData, index) => {
        const { month, report, summary } = monthData;
        
        // Process data for this month
        const accountNames = [];
        const adjustedValues = [];
        
        report.forEach(item => {
            const name = item.Account;
            const value = item.Balance || 0;
            accountNames.push(name);
            
            const code = name.split(' ')[0];
            const isExpense = expenseCodePrefixes.includes(code);
            const isRevenue = revenueCodePrefixes.includes(code);
            
            if (isExpense) {
                // Expenses should be negative
                adjustedValues.push(value > 0 ? -value : value);
            } else if (isRevenue) {
                // Revenue stays as is
                adjustedValues.push(value);
            } else {
                adjustedValues.push(value);
            }
        });
        
        // Calculate Net Income
        let netIncome = 0;
        adjustedValues.forEach(val => netIncome += val);
        
        // Add Net Income as the last bar
        const allLabels = [...accountNames, 'Net Income'];
        const allValues = [...adjustedValues, netIncome];

        // Colors
        const revenueKeywords = ['revenue', 'sales', 'income'];
        const expenseKeywords = ['cogs', 'expense', 'cost', 'shipping', 'fees', 'rent', 'utilities', 'insurance', 'advertising', 'software', 'supplies', 'equipment', 'leasehold', 'improvements'];
        
        const colors = allLabels.map(name => {
            const lower = name.toLowerCase();
            if (name === 'Net Income') {
                return netIncome >= 0 ? 'rgba(40, 167, 69, 0.95)' : 'rgba(220, 53, 69, 0.95)';
            }
            if (revenueKeywords.some(k => lower.includes(k))) {
                return 'rgba(40, 167, 69, 0.85)';
            }
            if (expenseKeywords.some(k => lower.includes(k))) {
                return 'rgba(220, 53, 69, 0.75)';
            }
            return 'rgba(108, 117, 125, 0.7)';
        });

        gridHtml += `
            <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; position: relative; min-height: 400px;">
                <div style="text-align: center; font-weight: 600; font-size: 16px; color: #000; margin-bottom: 10px;">${month.label}</div>
                <div style="text-align: center; font-size: 12px; color: #666; margin-bottom: 10px;">
                    Net: <span style="font-weight: bold; color: ${netIncome >= 0 ? '#28a745' : '#dc3545'};">${netIncome >= 0 ? '+' : ''}$${netIncome.toFixed(2)}</span>
                </div>
                <div style="position: relative; height: 280px;">
                    <canvas id="monthly-pl-chart-${index}"></canvas>
                </div>
                <div style="text-align: center; font-size: 11px; color: #999; margin-top: 5px; cursor: pointer;" onclick="showMonthlyTransactions('${month.year}-${String(month.month).padStart(2, '0')}', null, 'All Transactions', true)">
                    Click bar for details
                </div>
            </div>
        `;
    });

    gridHtml += '</div>';
    container.innerHTML = gridHtml;

    // Render each chart
    setTimeout(() => {
        allData.forEach((monthData, index) => {
            const { month, report } = monthData;
            
            const accountNames = [];
            const adjustedValues = [];
            
            report.forEach(item => {
                const name = item.Account;
                const value = item.Balance || 0;
                accountNames.push(name);
                
                const code = name.split(' ')[0];
                const isExpense = expenseCodePrefixes.includes(code);
                const isRevenue = revenueCodePrefixes.includes(code);
                
                if (isExpense) {
                    adjustedValues.push(value > 0 ? -value : value);
                } else if (isRevenue) {
                    adjustedValues.push(value);
                } else {
                    adjustedValues.push(value);
                }
            });
            
            let netIncome = 0;
            adjustedValues.forEach(val => netIncome += val);
            
            const allLabels = [...accountNames, 'Net Income'];
            const allValues = [...adjustedValues, netIncome];

            const revenueKeywords = ['revenue', 'sales', 'income'];
            const expenseKeywords = ['cogs', 'expense', 'cost', 'shipping', 'fees', 'rent', 'utilities', 'insurance', 'advertising', 'software', 'supplies', 'equipment', 'leasehold', 'improvements'];
            
            const colors = allLabels.map(name => {
                const lower = name.toLowerCase();
                if (name === 'Net Income') {
                    return netIncome >= 0 ? 'rgba(40, 167, 69, 0.95)' : 'rgba(220, 53, 69, 0.95)';
                }
                if (revenueKeywords.some(k => lower.includes(k))) {
                    return 'rgba(40, 167, 69, 0.85)';
                }
                if (expenseKeywords.some(k => lower.includes(k))) {
                    return 'rgba(220, 53, 69, 0.75)';
                }
                return 'rgba(108, 117, 125, 0.7)';
            });

            const canvasId = `monthly-pl-chart-${index}`;
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            
            if (window[`_monthlyPLChart_${index}`]) {
                window[`_monthlyPLChart_${index}`].destroy();
                window[`_monthlyPLChart_${index}`] = null;
            }

            const chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: allLabels,
                    datasets: [{
                        label: 'Amount',
                        data: allValues,
                        backgroundColor: colors,
                        borderColor: colors.map(c => c.replace('0.85', '1').replace('0.75', '1').replace('0.95', '1').replace('0.7', '1')),
                        borderWidth: 1
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
                                    return (val >= 0 ? '+' : '') + '$' + val.toFixed(2);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '$' + value;
                                },
                                font: { size: 9 }
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45,
                                font: { size: 8 }
                            }
                        }
                    },
                    onClick: function(e, elements) {
                        if (elements.length === 0) return;
                        const element = elements[0];
                        const idx = element.index;
                        const label = allLabels[idx];
                        const monthKey = `${month.year}-${String(month.month).padStart(2, '0')}`;
                        
                        document.getElementById('monthly-tx-modal')?.classList.remove('active');
                        
                        if (label === 'Net Income') {
                            showMonthlyTransactions(monthKey, null, 'All Transactions', true);
                            return;
                        }
                        
                        if (label.includes('COGS') || label.includes('Cost of Goods Sold')) {
                            showCOGSCalculation(monthKey);
                            return;
                        }
                        
                        const trimmed = label.trim();
                        const norm = trimmed.toLowerCase();
                        let accountId = accountNameToId[norm] || accountNameToId[trimmed];
                        if (!accountId) {
                            const found = bankAccounts.find(a => a.name === trimmed);
                            if (found) accountId = found.id;
                        }
                        
                        if (accountId) {
                            showMonthlyTransactions(monthKey, accountId, label, true);
                        } else {
                            showMonthlyTransactions(monthKey, null, label, true);
                        }
                    }
                }
            });

            window[`_monthlyPLChart_${index}`] = chart;
        });
    }, 100);
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
            cachedAccounts = data.accounts;
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
// TRANSACTION BALANCE TAB
// ============================================================

async function loadTransactionBalance() {
    const tbody = document.getElementById('unbalanced-accounts-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Loading...</td></tr>';

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/unbalanced-accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to load unbalanced accounts');
        const data = await res.json();
        if (data.status === 'success') {
            renderUnbalancedAccounts(data.accounts);
        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#dc3545;">${data.error || 'Error'}</td></tr>`;
        }
    } catch (err) {
        console.error('[TRANSACTION BALANCE] Error:', err);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#dc3545;">Error: ${err.message}</td></tr>`;
    }
}

function renderUnbalancedAccounts(accounts) {
    const tbody = document.getElementById('unbalanced-accounts-body');
    if (!accounts || accounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">All accounts are balanced.</td></tr>';
        return;
    }

    let html = '';
    accounts.forEach(acc => {
        const accountId = acc.account_id || acc.id;
        const accountCode = acc.code || '';
        const accountName = acc.name || '';
        const unbalancedCount = acc.unbalanced_count || 0;
        
        html += `<tr>
            <td>${accountCode}</td>
            <td>${accountName}</td>
            <td>${unbalancedCount}</td>
            <td>
                <button class="btn btn-sm btn-info" onclick="showUnbalancedTransactions(${accountId}, '${accountCode} - ${accountName}')">
                    <i class="fas fa-eye"></i> View
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

async function showUnbalancedTransactions(accountId, accountName) {
    console.log('[UNBALANCED DETAIL] Called with:', { accountId, accountName });
    
    if (!accountId || accountId === 'undefined') {
        console.error('[UNBALANCED DETAIL] accountId is undefined or null');
        showToast('Error: Account ID is missing', 'error');
        return;
    }
    
    const detailContainer = document.getElementById('unbalanced-detail-container');
    const detailBody = document.getElementById('unbalanced-detail-body');
    const titleSpan = document.getElementById('selected-account-name');
    titleSpan.textContent = accountName || 'Unknown Account';
    detailContainer.style.display = 'block';
    detailBody.innerHTML = '<p>Loading...</p>';

    try {
        const url = `${AppConfig.baseUrl}/api/accounting/unbalanced-transactions?account_id=${accountId}`;
        console.log('[UNBALANCED DETAIL] Fetching URL:', url);
        
        const res = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (!res.ok) throw new Error('Failed to load transactions');
        const data = await res.json();
        
        if (data.status === 'success') {
            renderUnbalancedTransactionsDetail(data.transactions, accountName);
        } else {
            detailBody.innerHTML = `<p style="color:#dc3545;">${data.error || 'Error loading transactions'}</p>`;
        }
    } catch (err) {
        console.error('[UNBALANCED DETAIL] Error:', err);
        detailBody.innerHTML = `<p style="color:#dc3545;">Error: ${err.message}</p>`;
    }
}

function renderUnbalancedTransactionsDetail(transactions, accountName) {
    const detailBody = document.getElementById('unbalanced-detail-body');
    if (!transactions || transactions.length === 0) {
        detailBody.innerHTML = '<p style="color:#000;">No unbalanced entries found for this account.</p>';
        return;
    }

    let html = `<table style="width:100%; border-collapse:collapse; color:#000; background:#fff;">
        <thead>
            <tr style="background:#f8f9fa;">
                <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Entry ID</th>
                <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Date</th>
                <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Description</th>
                <th style="padding:8px 12px; text-align:right; border-bottom:2px solid #ddd; color:#000;">Total Debits</th>
                <th style="padding:8px 12px; text-align:right; border-bottom:2px solid #ddd; color:#000;">Total Credits</th>
                <th style="padding:8px 12px; text-align:right; border-bottom:2px solid #ddd; color:#000;">Difference</th>
                <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Source</th>
                <th style="padding:8px 12px; text-align:center; border-bottom:2px solid #ddd; color:#000;">Action</th>
            </tr>
        </thead>
        <tbody>`;
        
    transactions.forEach(entry => {
        const diff = (entry.total_debits || 0) - (entry.total_credits || 0);
        const isUnbalanced = Math.abs(diff) > 0.01;
        const diffColor = isUnbalanced ? '#dc3545' : '#28a745';
        const diffSign = diff > 0 ? '+' : '';
        
        html += `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:8px 12px; color:#000;">${entry.id}</td>
            <td style="padding:8px 12px; color:#000;">${entry.transaction_date || ''}</td>
            <td style="padding:8px 12px; color:#000;">${entry.description || ''}</td>
            <td style="padding:8px 12px; text-align:right; color:#28a745; font-weight:600;">$${(entry.total_debits || 0).toFixed(2)}</td>
            <td style="padding:8px 12px; text-align:right; color:#dc3545; font-weight:600;">$${(entry.total_credits || 0).toFixed(2)}</td>
            <td style="padding:8px 12px; text-align:right; color:${diffColor}; font-weight:600;">${diffSign}$${Math.abs(diff).toFixed(2)}</td>
            <td style="padding:8px 12px; color:#000;">${entry.source_type || ''}: ${entry.source_id || ''}</td>
            <td style="padding:8px 12px; text-align:center;">
                <button class="btn btn-sm btn-danger" onclick="unpostTransaction(${entry.id})" style="padding:4px 10px; font-size:12px; background:#dc3545; color:white; border:none; border-radius:4px; cursor:pointer;">
                    <i class="fas fa-undo"></i> Unpost
                </button>
            </td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    detailBody.innerHTML = html;
}

function closeUnbalancedDetail() {
    document.getElementById('unbalanced-detail-container').style.display = 'none';
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
            return res.json();
        })
        .then(data => {
            console.log('[MODAL] 11. Data received from API:');
            console.log('[MODAL] 11a. Data status:', data.status);
            console.log('[MODAL] 11b. Data transactions count:', data.transactions ? data.transactions.length : 0);

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
            body.innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
        });

        console.log('[MODAL] ===== SHOW MONTHLY TRANSACTIONS END =====');
    } catch (err) {
        console.error('[MODAL] ❌ CRITICAL ERROR in showMonthlyTransactions:', err);
        showToast('Error: ' + err.message, 'error');
    }
}

function renderModalTransactions(transactions, accountName, dateRange, accountId = null) {
    console.log('[MODAL] ==================================================');
    console.log('[MODAL] RENDER MODAL TRANSACTIONS CALLED');
    console.log('[MODAL] Input transactions count:', transactions ? transactions.length : 0);

    const body = document.getElementById('modal-body');
    if (!body) {
        console.error('[MODAL] ❌ Body not found for rendering!');
        return;
    }

    if (!transactions || transactions.length === 0) {
        console.log('[MODAL] No transactions to render');
        body.innerHTML = '<p>No transactions found for this period.</p>';
        return;
    }

    const grouped = {};
    transactions.forEach(tx => {
        const key = tx.journal_entry_id || tx.source_id || tx.id;
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

    const isRevenueAccount = accountName &&
        (accountName.toLowerCase().includes('revenue') ||
         accountName.toLowerCase().includes('sales') ||
         accountName.toLowerCase().includes('income'));

    let total = 0;
    groupedList.forEach(g => {
        total += g.net;
    });

    let displayTotal = isRevenueAccount ? -total : total;

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

    groupedList.forEach(g => {
        let displayAmount = g.net;
        if (isRevenueAccount) {
            displayAmount = -g.net;
        }
        const isPositive = displayAmount > 0;
        const amountClass = isPositive ? 'debit' : (displayAmount < 0 ? 'credit' : '');
        const displayAmountStr = displayAmount !== 0 ? '$' + Math.abs(displayAmount).toFixed(2) : '';
        const sign = displayAmount > 0 ? '+' : (displayAmount < 0 ? '-' : '');

        const entryId = g.journal_entry_id || g.source_id;

        html += `<tr>
            <td style="white-space:nowrap;">${g.transaction_date}</td>
            <td>${g.description || ''}</td>
            <td>${g.account_name || ''}</td>
            <td style="text-align:right; font-weight:600;" class="${amountClass}">${sign}${displayAmountStr}</td>
            <td style="text-align:center;">${entryId ? `<button class="btn btn-sm btn-warning" onclick="unpostTransaction(${typeof entryId === 'string' ? `'${entryId}'` : entryId})"><i class="fas fa-undo"></i></button>` : ''}</td>
        </tr>`;
    });

    html += `<tr class="total-row">
        <td colspan="3"><strong>Total</strong></td>
        <td style="text-align:right; font-weight:bold;color:${displayTotal >= 0 ? '#28a745' : '#dc3545'};">${displayTotal >= 0 ? '+' : ''}${displayTotal !== 0 ? '$' + displayTotal.toFixed(2) : ''}</td>
        <td></td>
    </tr>`;
    html += '</tbody></table>';
    body.innerHTML = html;
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

        const labelsWithIds = labels.map((label, i) => {
            const trimmed = label.trim();
            const norm = trimmed.toLowerCase();
            let accountId = accountNameToId[norm] || accountNameToId[trimmed] || null;

            if (!accountId) {
                const found = bankAccounts.find(a => a.name === trimmed);
                if (found) accountId = found.id;
            }

            const isCOGS = label === 'COGS' || label === 'Cost of Goods Sold';

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

        if (filtered.length === 0) {
            document.getElementById('breakdown-chart-container').innerHTML = '<p style="text-align:center; padding:40px; color:#333;">No data for this month.</p>';
            return;
        }

        const canvas = document.getElementById('breakdown-chart-canvas');

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
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value;
                            }
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                },
                onClick: function(e, elements) {
                    if (elements.length === 0) return;

                    const element = elements[0];
                    const index = element.index;
                    const item = filtered[index];

                    if (Math.abs(item.value) < 0.01) return;

                    document.getElementById('monthly-tx-modal')?.classList.remove('active');

                    if (item.isCOGS) {
                        showCOGSCalculation(month);
                        return;
                    }

                    const excludeOrders = chartType === 'pl';

                    if (item.accountId) {
                        showMonthlyTransactions(month, item.accountId, item.label, excludeOrders);
                    } else {
                        const trimmed = item.label.trim();
                        const norm = trimmed.toLowerCase();
                        const accountId = accountNameToId[norm] || accountNameToId[trimmed];
                        if (accountId) {
                            showMonthlyTransactions(month, accountId, item.label, excludeOrders);
                        } else {
                            showMonthlyTransactions(month, null, item.label, excludeOrders);
                        }
                    }
                }
            }
        });

        window._breakdownChart = chart;

        modal.classList.add('active');

    } catch (err) {
        console.error('[BREAKDOWN] ❌ CRITICAL ERROR:', err);
        showToast('Error: ' + err.message, 'error');
    }
}

// ============================================================
// BALANCE SHEET LINE CHART RENDERER
// ============================================================

function renderLineChart(canvasId, data, options = {}) {
    console.log('[CHART] RENDER LINE CHART START');
    console.log('[CHART] Canvas ID:', canvasId);

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error('[CHART] ❌ Canvas not found:', canvasId);
        return null;
    }

    const ctx = canvas.getContext('2d');
    const { months, account_breakdown } = data;

    if (!months || months.length === 0) {
        console.log('[CHART] No data to display');
        return null;
    }

    const allAccountNames = new Set();
    months.forEach(m => {
        const monthData = account_breakdown[m] || {};
        Object.keys(monthData).forEach(acc => allAccountNames.add(acc));
    });

    let chartInstance = null;

    if (window[canvasId + 'Instance']) {
        window[canvasId + 'Instance'].destroy();
        window[canvasId + 'Instance'] = null;
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const labels = months.map(m => {
        const [year, month] = m.split('-');
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    });

    const accountNames = Array.from(allAccountNames).sort();

    const netLabel = accountNames.find(name => name === 'Net' || name === 'Net Income' || name === 'Net Cash');

    const regularAccounts = accountNames.filter(name => name !== netLabel);

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

    const datasets = [];
    let revenueCount = 0;
    let expenseCount = 0;
    let otherCount = 0;

    const revenueColors = ['#28a745', '#20c997', '#8bc34a', '#4caf50', '#009688'];
    const expenseColors = ['#dc3545', '#e74c3c', '#ff6b6b', '#c0392b', '#e67e22'];
    const otherColors = ['#007bff', '#17a2b8', '#6f42c1', '#fd7e14', '#e83e8c', '#6c757d', '#0dcaf0', '#d63384'];

    const lineDashStyles = [
        [], [5, 5], [2, 4], [10, 5, 2, 5], [8, 4, 2, 4], [3, 3]
    ];

    const pointStyles = ['circle', 'rect', 'triangle', 'diamond', 'cross', 'crossRot', 'star', 'line', 'dash'];

    sortedAccounts.forEach((accountName, idx) => {
        const values = months.map(m => {
            const monthData = account_breakdown[m] || {};
            return monthData[accountName] || 0;
        });

        if (values.every(v => Math.abs(v) < 0.01)) {
            return;
        }

        const aLower = accountName.toLowerCase();
        const isRevenue = revenueKeywords.some(k => aLower.includes(k));
        const isExpense = expenseKeywords.some(k => aLower.includes(k));

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
        } else if (isExpense) {
            borderColor = expenseColors[colorIdx];
            backgroundColor = borderColor + '40';
            borderDash = lineDashStyles[(styleIdx + 2) % lineDashStyles.length];
            borderWidth = 3;
            pointStyle = pointStyles[(styleIdx + 3) % pointStyles.length];
            pointRadius = 5;
            expenseCount++;
        } else {
            borderColor = otherColors[colorIdx % otherColors.length];
            backgroundColor = borderColor + '40';
            borderDash = lineDashStyles[(styleIdx + 1) % lineDashStyles.length];
            borderWidth = 3;
            pointStyle = pointStyles[(styleIdx + 5) % pointStyles.length];
            pointRadius = 5;
            otherCount++;
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
        }
    }

    if (datasets.length === 0) {
        console.log('[CHART] No data to display after filtering');
        return null;
    }

    let maxVal = 0;
    datasets.forEach(ds => {
        ds.data.forEach(v => {
            if (Math.abs(v) > maxVal) maxVal = Math.abs(v);
        });
    });
    const yMax = Math.ceil((maxVal * 1.25) / 100) * 100 || 100;

    if (canvasId === 'bs-chart') {
        bsChartData = data;
        bsMonths = months;
        allBSData = data;
    }

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
                    }
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

    window[canvasId + 'Instance'] = chart;

    if (canvasId === 'bs-chart') {
        bsChartInstance = chart;
    }

    // Add x-axis click handler for Balance Sheet
    if (canvasId === 'bs-chart') {
        canvas.addEventListener('click', function(e) {
            try {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const chartInstance = window[canvasId + 'Instance'] || Chart.getChart(canvas);
                if (!chartInstance) return;

                const chartArea = chartInstance.chartArea;
                if (!chartArea) return;

                const chartHeight = chartArea.bottom - chartArea.top;
                const yPos = (y - chartArea.top) / chartHeight;

                if (yPos < 0.8 || yPos > 1.1) return;

                const xScale = chartInstance.scales.x;
                if (!xScale) return;

                const pixelsPerTick = (xScale.right - xScale.left) / (months.length || 1);
                const clickedIndex = Math.round((x - xScale.left) / pixelsPerTick);

                if (clickedIndex >= 0 && clickedIndex < months.length) {
                    const month = months[clickedIndex];

                    document.getElementById('monthly-tx-modal')?.classList.remove('active');

                    const dataToUse = bsChartData;
                    if (dataToUse) {
                        showMonthBreakdownModal(month, dataToUse, options.type || 'balancesheet');
                    }
                }
            } catch (err) {
                console.error('[CHART-X] Error in click handler:', err);
            }
        });
    }

    return chart;
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

            if (sub === 'transactions') {
                loadBankTransactions();
                loadAccountBalances();
            }
            else if (sub === 'accounts') {
                loadAccountsList();
            }
            else if (sub === 'journal') {
                loadJournalEntries();
            }
            else if (sub === 'transaction-balance') {
                console.log('[INIT] Transaction Balance tab selected');
                loadTransactionBalance();
            }
            else if (sub === 'reconcile') {
                loadReconcileAccountSelects();
                loadReconcilePairsSummary();
            }
            else if (sub === 'custom-pl') {
                console.log('[INIT] Custom P&L tab selected');
                initCustomPL();
            }
            else if (sub === 'balance') {
                console.log('[INIT] Balance tab selected');
                initBalanceSheet();
            }
            else if (sub === 'monthly-pl') {
                console.log('[INIT] Monthly P&L tab selected');
                loadMonthlyPLBarChart();
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

    // Load import (bank) by default
    loadBankTransactions();
    loadAccountBalances();

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
                loadAccountBalances();
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

    // Bulk Post button
    document.getElementById('post-updates-btn')?.addEventListener('click', function() {
        bulkPostTransactions();
    });

    // Clear selections button
    document.getElementById('clear-selections-btn')?.addEventListener('click', function() {
        clearAllSelections();
    });

    // Select all checkbox
    document.getElementById('select-all-tx')?.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('#bank-body .tx-select:not(:disabled)');
        checkboxes.forEach(cb => cb.checked = this.checked);
        populateBulkAccountSelect();
    });

    // Bulk Assign Account button
    document.getElementById('bulk-assign-btn')?.addEventListener('click', function() {
        bulkAssignAccount();
    });

    // Bulk account select - show/hide based on selection
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('tx-select')) {
            populateBulkAccountSelect();
        }
    });

    console.log('[INIT] Initialization complete');
});