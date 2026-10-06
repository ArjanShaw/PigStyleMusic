// ============================================================
// accounting.js – Accounting Module, single-source aggregation
//
// Data flow:
//   loadAllTransactions()  ->  allTransactions[]
//                          ->  monthlyAggregate{}
//                          ->  every tab renders from memory
//
// No calls to /api/accounting/monthly-pl
// No calls to /api/accounting/monthly-account-transactions
// One raw endpoint: /api/accounting/bank-transactions-full
// ============================================================

console.log('[ACCOUNTING] Script started loading');

// ===== API BASE URL =====
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000' 
    : 'https://www.pigstylemusic.com';

// ===== GLOBAL VARIABLES =====
let bankAccounts = [];
let journalCurrentPage = 1;
const journalPageSize = 20;
let journalTotalEntries = 0;
let currentSearchTerm = '';
let currentFilter = 'all';

// ===== SINGLE SOURCE OF TRUTH =====
// Populated once by loadAllTransactions().
// Every view derives from these two.
let allTransactions = [];       // raw rows from /api/accounting/bank-transactions-full
let monthlyAggregate = {};      // { 'YYYY-MM': { '<account_id>': { name, code, total, transactions[] } } }

// Monthly P&L chart page state
let monthlyPLMonths = [];       // derived from monthlyAggregate keys
let monthlyPLCurrentPage = 0;
let monthlyPLChartInstances = {};

// ============================================================
// TOAST NOTIFICATION
// ============================================================

function showToast(message, type = 'success') {
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
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
        max-width: 400px;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

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
// SINGLE FETCH + SINGLE AGGREGATION
// ============================================================

/**
 * Fetch every bank transaction once and populate allTransactions
 * and monthlyAggregate. Every view reads from these two from here on.
 */
async function loadAllTransactions() {
    console.log('[ACCT] Loading all bank transactions...');
    try {
        const url = `${API_BASE}/api/accounting/bank-transactions-full?filter=all`;
        const response = await fetch(url, {
            credentials: 'include',
            mode: 'cors'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.status !== 'success') {
            throw new Error(data.error || 'Failed to load transactions');
        }

        allTransactions = data.transactions || [];
        monthlyAggregate = aggregateByMonthAndAccount(allTransactions);
        monthlyPLMonths = Object.keys(monthlyAggregate).sort().reverse();

        console.log(
            `[ACCT] Loaded ${allTransactions.length} transactions across ` +
            `${monthlyPLMonths.length} months`
        );

        return true;
    } catch (err) {
        console.error('[ACCT] loadAllTransactions failed:', err);
        allTransactions = [];
        monthlyAggregate = {};
        monthlyPLMonths = [];
        throw err;
    }
}

/**
 * Aggregate the flat transaction list into per-month, per-account buckets.
 *
 * Bucket key is the post_to account id (as a string). Only posted rows
 * (post_to !== null) contribute to an account's total. Unposted rows
 * live only in allTransactions and are shown on the Transactions tab,
 * but they don't belong to any account yet.
 *
 * @param {Array} transactions - raw rows from bank-transactions-full
 * @returns {Object} months[YYYY-MM][accountId] = { name, code, total, transactions[] }
 */
function aggregateByMonthAndAccount(transactions) {
    const months = {};

    for (const tx of transactions) {
        if (!tx.transaction_date) continue;

        // transaction_date is 'YYYY-MM-DD' — slice off the day.
        const month = String(tx.transaction_date).slice(0, 7);
        if (!month) continue;

        // Skip unposted rows — they don't belong to an account yet.
        if (tx.post_to === null || tx.post_to === undefined) continue;

        const accountId = String(tx.post_to);

        if (!months[month]) months[month] = {};
        if (!months[month][accountId]) {
            months[month][accountId] = {
                account_id: tx.post_to,
                name: tx.post_to_account_name || 'Unknown',
                code: tx.post_to_account_code || '',
                total: 0,
                transactions: []
            };
        }

        months[month][accountId].total += Number(tx.amount) || 0;
        months[month][accountId].transactions.push(tx);
    }

    return months;
}

// ============================================================
// LOAD ACCOUNTS
// ============================================================

async function loadAccounts() {
    console.log('[ACCOUNTS] Loading accounts...');
    try {
        const response = await fetch(`${API_BASE}/api/accounting/accounts`, {
            credentials: 'include',
            mode: 'cors'
        });
        if (!response.ok) throw new Error('Failed to load accounts');
        const data = await response.json();
        if (data.status === 'success') {
            bankAccounts = data.accounts || [];
            console.log('[ACCOUNTS] Loaded', bankAccounts.length, 'accounts');
            populateBulkAccountSelect();
            return bankAccounts;
        }
        return [];
    } catch (err) {
        console.error('[ACCOUNTS] Error:', err);
        return [];
    }
}

function populateBulkAccountSelect() {
    const select = document.getElementById('bulk-account-select');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">Select Account</option>';

    bankAccounts.forEach(acc => {
        const selected = acc.id == currentValue ? 'selected' : '';
        select.innerHTML += `<option value="${acc.id}" ${selected}>${acc.code} - ${acc.name}</option>`;
    });
}

// ============================================================
// TRANSACTIONS TAB (in-memory filtering)
// ============================================================

function loadTransactions() {
    console.log('[TRANSACTIONS] Rendering from in-memory data...');
    const list = document.getElementById('transactions-list');
    if (!list) return;

    const filter = document.getElementById('unposted-filter')?.value || 'all';
    const search = document.getElementById('transaction-search')?.value.trim() || '';
    currentFilter = filter;
    currentSearchTerm = search;

    let rows = allTransactions;

    if (filter === 'unposted') {
        rows = rows.filter(tx => tx.post_to === null || tx.post_to === undefined);
    } else if (filter === 'posted') {
        rows = rows.filter(tx => tx.post_to !== null && tx.post_to !== undefined);
    }

    if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(tx =>
            (tx.description || '').toLowerCase().includes(s) ||
            (tx.additional_info || '').toLowerCase().includes(s)
        );
    }

    // Newest first for display
    rows = [...rows].sort((a, b) => {
        const da = String(a.transaction_date || '');
        const db = String(b.transaction_date || '');
        if (da !== db) return db.localeCompare(da);
        return (b.id || 0) - (a.id || 0);
    });

    renderTransactions(rows);
    updateBulkAssignSection(rows);
}

function renderTransactions(transactions) {
    const list = document.getElementById('transactions-list');
    if (!list) return;

    if (!transactions || transactions.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No transactions found</div>';
        return;
    }

    let accountOptions = '<option value="">Select Account</option>';
    bankAccounts.forEach(acc => {
        accountOptions += `<option value="${acc.id}">${acc.code} - ${acc.name}</option>`;
    });

    let html = '';
    transactions.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0;
        const isDebit = amount < 0;
        const formattedAmount = (isDebit ? '-' : '') + '$' + Math.abs(amount).toFixed(2);
        const isProcessed = tx.post_to !== null && tx.post_to !== undefined;
        const statusColor = isProcessed ? '#28a745' : '#dc3545';
        const statusText = isProcessed ? '✅ Posted' : '⏳ Unposted';

        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; ${isProcessed ? 'background: #f0fff4;' : 'background: #fff5f5;'}">
                <div style="flex: 1; min-width: 150px;">
                    <div style="font-weight: 600; color: #333; font-size: 13px;">${tx.description || 'No description'}</div>
                    <div style="color: #666; font-size: 12px;">${tx.transaction_date || ''} • ID: ${tx.id}</div>
                    ${tx.post_to_account_name ? `<div style="color: #888; font-size: 11px;">Posted to: ${tx.post_to_account_name}</div>` : ''}
                </div>
                <div style="text-align: right; margin-right: 10px; min-width: 100px;">
                    <div style="font-weight: bold; color: ${isDebit ? '#dc3545' : '#28a745'}; font-size: 14px;">${formattedAmount}</div>
                    <div style="font-size: 11px; color: ${statusColor};">${statusText}</div>
                </div>
                <div style="min-width: 180px; margin-left: 10px;">
                    <select class="post-to-select" data-transaction-id="${tx.id}" ${isProcessed ? 'disabled' : ''} style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; color: #000; background: #fff; width: 100%;">
                        ${accountOptions}
                    </select>
                    ${!isProcessed ? `<button class="assign-btn" data-transaction-id="${tx.id}" style="margin-top: 2px; padding: 2px 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; width: 100%;">Assign</button>` : ''}
                </div>
            </div>
        `;
    });
    list.innerHTML = html;

    document.querySelectorAll('.assign-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const transactionId = this.dataset.transactionId;
            const select = document.querySelector(`.post-to-select[data-transaction-id="${transactionId}"]`);
            if (select && select.value) {
                assignSingleTransaction(transactionId, select.value);
            } else {
                showToast('Please select an account first.', 'warning');
            }
        });
    });

    document.querySelectorAll('.post-to-select').forEach(select => {
        select.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && this.value) {
                const transactionId = this.dataset.transactionId;
                assignSingleTransaction(transactionId, this.value);
            }
        });
    });
}

function updateBulkAssignSection(transactions) {
    const section = document.getElementById('bulk-assign-section');
    const countSpan = document.getElementById('bulk-count');
    if (!section || !countSpan) return;

    const unposted = transactions.filter(tx => tx.post_to === null || tx.post_to === undefined);

    if (unposted.length > 0 && currentSearchTerm) {
        section.style.display = 'flex';
        countSpan.textContent = unposted.length;
    } else {
        section.style.display = 'none';
    }
}

// ============================================================
// ASSIGN FUNCTIONS
// ============================================================

async function assignSingleTransaction(transactionId, accountId) {
    if (!accountId) {
        showToast('Please select an account.', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/accounting/bank/assign-single`, {
            method: 'POST',
            credentials: 'include',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transaction_id: parseInt(transactionId),
                post_to: parseInt(accountId)
            })
        });

        const result = await response.json();

        if (result.status === 'success') {
            showToast(`✅ Transaction assigned to ${result.account_name || 'account'}`, 'success');
            // Refresh the single source of truth, then re-render
            await loadAllTransactions();
            loadTransactions();
        } else {
            showToast('Error: ' + (result.error || 'Failed to assign'), 'error');
        }
    } catch (err) {
        console.error('[ASSIGN] Error:', err);
        showToast('Error: ' + err.message, 'error');
    }
}

async function bulkAssignAccount() {
    const select = document.getElementById('bulk-account-select');
    const accountId = select?.value;

    if (!accountId) {
        showToast('Please select an account to assign.', 'warning');
        return;
    }

    if (!currentSearchTerm) {
        showToast('Please enter a search term first.', 'warning');
        return;
    }

    const accountName = select.options[select.selectedIndex]?.text || 'selected account';
    if (!confirm(`Assign all unposted transactions matching "${currentSearchTerm}" to ${accountName}?`)) {
        return;
    }

    try {
        // Use the in-memory set — no fetch needed
        const searchLower = currentSearchTerm.toLowerCase();
        const unpostedTransactions = allTransactions.filter(tx => {
            if (tx.post_to !== null && tx.post_to !== undefined) return false;
            const d = (tx.description || '').toLowerCase();
            const a = (tx.additional_info || '').toLowerCase();
            return d.includes(searchLower) || a.includes(searchLower);
        });

        if (unpostedTransactions.length === 0) {
            showToast('No unposted transactions found to assign.', 'warning');
            return;
        }

        const updates = unpostedTransactions.map(tx => ({
            transaction_id: tx.id,
            post_to: parseInt(accountId)
        }));

        const updateResponse = await fetch(`${API_BASE}/api/accounting/bank/bulk-assign`, {
            method: 'POST',
            credentials: 'include',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });

        const result = await updateResponse.json();

        if (result.status === 'success') {
            showToast(`✅ ${result.processed} transactions assigned successfully`, 'success');
            await loadAllTransactions();
            loadTransactions();
            document.getElementById('bulk-assign-section').style.display = 'none';
            select.value = '';
        } else {
            showToast('Error: ' + (result.error || 'Failed to assign'), 'error');
        }
    } catch (err) {
        console.error('[BULK] Error:', err);
        showToast('Error: ' + err.message, 'error');
    }
}

function cancelBulkAssign() {
    document.getElementById('bulk-assign-section').style.display = 'none';
    document.getElementById('bulk-account-select').value = '';
}

// ============================================================
// ACCOUNTS TAB
// ============================================================

async function loadAccountsList() {
    console.log('[ACCOUNTS] Loading accounts list...');
    const list = document.getElementById('accounts-list');
    if (!list) return;

    list.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Loading...</div>';

    try {
        const response = await fetch(`${API_BASE}/api/accounting/accounts`, {
            credentials: 'include',
            mode: 'cors'
        });
        if (!response.ok) throw new Error('Failed to load accounts');
        const data = await response.json();

        if (data.status === 'success') {
            renderAccounts(data.accounts || []);
        } else {
            list.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">Error loading accounts</div>';
        }
    } catch (err) {
        console.error('[ACCOUNTS] Error:', err);
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">Error: ' + err.message + '</div>';
    }
}

function renderAccounts(accounts) {
    const list = document.getElementById('accounts-list');
    if (!list) return;

    if (!accounts || accounts.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No accounts found</div>';
        return;
    }

    const typeColors = {
        asset: '#cce5ff',
        liability: '#fff3cd',
        equity: '#d4edda',
        revenue: '#cce5ff',
        expense: '#f8d7da'
    };

    let html = '';
    accounts.forEach(acc => {
        const typeColor = typeColors[acc.type] || '#f8f9fa';
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f0f0f0;">
                <div>
                    <div style="font-weight: 600; color: #333; font-size: 13px;">${acc.code} - ${acc.name}</div>
                    <div style="font-size: 11px; color: #666;">${acc.type}</div>
                </div>
                <div>
                    <span style="padding: 2px 12px; border-radius: 12px; font-size: 11px; background: ${typeColor}; color: #333;">${acc.type}</span>
                </div>
            </div>
        `;
    });
    list.innerHTML = html;
}

function showAddAccountModal() {
    document.getElementById('add-account-modal').style.display = 'flex';
    document.getElementById('account-form-id').value = '';
    document.getElementById('account-form-code').value = '';
    document.getElementById('account-form-name').value = '';
    document.getElementById('account-form-type').value = '';
    document.getElementById('add-account-modal-title').textContent = 'Add Account';
    document.getElementById('save-account-btn').textContent = 'Save';
}

async function saveAccount() {
    const id = document.getElementById('account-form-id').value;
    const code = document.getElementById('account-form-code').value.trim();
    const name = document.getElementById('account-form-name').value.trim();
    const type = document.getElementById('account-form-type').value;

    if (!code || !name || !type) {
        showToast('Code, Name, and Type are required.', 'error');
        return;
    }

    try {
        const url = id ? `${API_BASE}/api/accounting/accounts/${id}` : `${API_BASE}/api/accounting/accounts`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            credentials: 'include',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, name, type, description: '' })
        });
        const data = await response.json();

        if (data.status === 'success') {
            showToast(id ? 'Account updated' : 'Account created', 'success');
            document.getElementById('add-account-modal').style.display = 'none';
            loadAccountsList();
            loadAccounts();
        } else {
            showToast('Error: ' + (data.error || 'Failed to save'), 'error');
        }
    } catch (err) {
        console.error('[ACCOUNTS] Error:', err);
        showToast('Error: ' + err.message, 'error');
    }
}

// ============================================================
// JOURNAL TAB
// ============================================================

async function loadJournalEntries() {
    console.log('[JOURNAL] Loading journal entries...');
    const list = document.getElementById('journal-list');
    if (!list) return;

    list.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Loading...</div>';

    const search = document.getElementById('journal-search')?.value.trim() || '';

    try {
        const params = new URLSearchParams();
        params.append('page', journalCurrentPage);
        params.append('per_page', journalPageSize);
        if (search) params.append('search', search);

        const response = await fetch(`${API_BASE}/api/accounting/journal?${params.toString()}`, {
            credentials: 'include',
            mode: 'cors'
        });
        if (!response.ok) throw new Error('Failed to load journal');
        const data = await response.json();

        if (data.status === 'success') {
            journalTotalEntries = data.total || 0;
            renderJournalEntries(data.entries || []);
        } else {
            list.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">Error loading journal</div>';
        }
    } catch (err) {
        console.error('[JOURNAL] Error:', err);
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">Error: ' + err.message + '</div>';
    }
}

function renderJournalEntries(entries) {
    const list = document.getElementById('journal-list');
    if (!list) return;

    if (!entries || entries.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No journal entries found</div>';
        return;
    }

    let html = '';
    entries.forEach(e => {
        const debitAmount = e.debit_amount ? '$' + parseFloat(e.debit_amount).toFixed(2) : '';
        const creditAmount = e.credit_amount ? '$' + parseFloat(e.credit_amount).toFixed(2) : '';
        const diff = (e.debit_amount || 0) - (e.credit_amount || 0);

        html += `
            <div style="display: flex; flex-wrap: wrap; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; ${Math.abs(diff) > 0.01 ? 'background: #fff5f5;' : ''}">
                <div style="flex: 1; min-width: 150px;">
                    <div style="font-weight: 600; color: #333; font-size: 13px;">#${e.id}</div>
                    <div style="color: #666; font-size: 12px;">${e.transaction_date || ''}</div>
                </div>
                <div style="flex: 2; min-width: 150px;">
                    <div style="color: #333; font-size: 13px;">${e.description || ''}</div>
                    <div style="color: #888; font-size: 11px;">${e.source_type}: ${e.source_id}</div>
                </div>
                <div style="flex: 1; min-width: 100px;">
                    ${e.debit_account ? `<div style="color: #28a745; font-size: 12px;">${e.debit_account}</div>` : ''}
                    ${debitAmount ? `<div style="color: #28a745; font-weight: bold;">${debitAmount}</div>` : ''}
                </div>
                <div style="flex: 1; min-width: 100px;">
                    ${e.credit_account ? `<div style="color: #dc3545; font-size: 12px;">${e.credit_account}</div>` : ''}
                    ${creditAmount ? `<div style="color: #dc3545; font-weight: bold;">${creditAmount}</div>` : ''}
                </div>
                ${Math.abs(diff) > 0.01 ? `<div style="color: #dc3545; font-size: 11px; font-weight: 600;">⚖️ $${diff.toFixed(2)}</div>` : ''}
            </div>
        `;
    });
    list.innerHTML = html;
}

function resetJournalFilters() {
    document.getElementById('journal-search').value = '';
    journalCurrentPage = 1;
    loadJournalEntries();
}

// ============================================================
// BALANCE TAB
// ============================================================

async function loadBalances() {
    console.log('[BALANCE] Loading balances...');
    const list = document.getElementById('balance-list');
    if (!list) return;

    list.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Loading...</div>';

    try {
        const response = await fetch(`${API_BASE}/api/accounting/balances`, {
            credentials: 'include',
            mode: 'cors'
        });
        if (!response.ok) throw new Error('Failed to load balances');
        const data = await response.json();

        if (data.status === 'success') {
            renderBalances(data.balances || []);
        } else {
            list.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">Error loading balances</div>';
        }
    } catch (err) {
        console.error('[BALANCE] Error:', err);
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">Error: ' + err.message + '</div>';
    }
}

function renderBalances(balances) {
    const list = document.getElementById('balance-list');
    if (!list) return;

    if (!balances || balances.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No balances found</div>';
        return;
    }

    const types = {
        asset: { label: 'ASSETS', color: '#28a745', items: [] },
        liability: { label: 'LIABILITIES', color: '#dc3545', items: [] },
        equity: { label: 'EQUITY', color: '#6f42c1', items: [] },
        revenue: { label: 'REVENUE', color: '#007bff', items: [] },
        expense: { label: 'EXPENSES', color: '#fd7e14', items: [] }
    };

    balances.forEach(b => {
        const type = b.type || 'asset';
        if (types[type]) types[type].items.push(b);
    });

    let html = '';
    Object.keys(types).forEach(key => {
        const group = types[key];
        if (group.items.length === 0) return;

        html += `<div style="font-weight: 700; color: ${group.color}; padding: 8px 12px; border-bottom: 2px solid ${group.color}; margin-top: 5px;">${group.label}</div>`;

        group.items.forEach(item => {
            const balance = item.balance || 0;
            const balanceColor = balance >= 0 ? '#28a745' : '#dc3545';
            html += `
                <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #f0f0f0; padding-left: 24px;">
                    <span style="color: #333; font-size: 13px;">${item.code} - ${item.name}</span>
                    <span style="font-weight: 600; color: ${balanceColor};">$${balance.toFixed(2)}</span>
                </div>
            `;
        });
    });

    list.innerHTML = html || '<div style="text-align: center; padding: 40px; color: #999;">No balances found</div>';
}

// ============================================================
// MONTHLY P&L BAR CHARTS (from monthlyAggregate)
// ============================================================

function loadMonthlyPLBarChart() {
    console.log('[MONTHLY-PL] Rendering from aggregate');
    renderMonthlyPLChartsPage();
}

function renderMonthlyPLChartsPage() {
    const container = document.getElementById('monthly-pl-bar-chart-container');
    if (!container) return;

    if (!monthlyPLMonths || monthlyPLMonths.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:40px; color:#666;">No data available.</p>';
        return;
    }

    const startIndex = monthlyPLCurrentPage * 6;
    const endIndex = Math.min(startIndex + 6, monthlyPLMonths.length);
    const visibleMonths = monthlyPLMonths.slice(startIndex, endIndex);

    if (visibleMonths.length === 0) {
        if (monthlyPLCurrentPage > 0) {
            monthlyPLCurrentPage--;
            renderMonthlyPLChartsPage();
        }
        return;
    }

    const totalPages = Math.ceil(monthlyPLMonths.length / 6);
    const isFirstPage = monthlyPLCurrentPage === 0;
    const isLastPage = monthlyPLCurrentPage >= totalPages - 1;

    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 10px 15px; background: #f8f9fa; border-radius: 8px;">
            <div>
                <span style="font-weight: 600; color: #000;">Monthly P&L</span>
                <span style="color: #666; margin-left: 10px; font-size: 13px;">Showing ${startIndex + 1}-${Math.min(endIndex, monthlyPLMonths.length)} of ${monthlyPLMonths.length} months</span>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="monthly-pl-prev" ${isFirstPage ? 'disabled' : ''} style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: ${isFirstPage ? 'not-allowed' : 'pointer'}; color: ${isFirstPage ? '#999' : '#000'};">
                    <i class="fas fa-chevron-left"></i> Newer
                </button>
                <button id="monthly-pl-next" ${isLastPage ? 'disabled' : ''} style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: ${isLastPage ? 'not-allowed' : 'pointer'}; color: ${isLastPage ? '#999' : '#000'};">
                    Older <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; margin-bottom: 20px;">
    `;

    visibleMonths.forEach((month, index) => {
        const accounts = monthlyAggregate[month] || {};
        const acctList = Object.values(accounts);

        const revenueItems = acctList.filter(a => a.total > 0);
        const expenseItems = acctList.filter(a => a.total < 0);

        const totalRevenue = revenueItems.reduce((s, a) => s + a.total, 0);
        const totalExpenses = expenseItems.reduce((s, a) => s + a.total, 0);
        const netIncome = totalRevenue + totalExpenses;

        const chartIndex = startIndex + index;

        html += `
            <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; position: relative; min-height: 420px;">
                <div style="text-align: center; font-weight: 600; font-size: 16px; color: #000; margin-bottom: 10px;">${month}</div>
                <div style="text-align: center; font-size: 12px; color: #666; margin-bottom: 10px;">
                    Revenue: <span style="color:#28a745;font-weight:bold;">$${totalRevenue.toFixed(2)}</span> | 
                    Expenses: <span style="color:#dc3545;font-weight:bold;">$${Math.abs(totalExpenses).toFixed(2)}</span> | 
                    Net: <span style="font-weight: bold; color: ${netIncome >= 0 ? '#28a745' : '#dc3545'};">${netIncome >= 0 ? '+' : ''}$${netIncome.toFixed(2)}</span>
                </div>
                <div style="position: relative; height: 300px;">
                    <canvas id="monthly-pl-chart-${chartIndex}"></canvas>
                </div>
                <div style="text-align: center; font-size: 11px; color: #999; margin-top: 5px;">
                    Click bar for details
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;

    // Destroy old chart instances
    Object.keys(monthlyPLChartInstances).forEach(key => {
        if (monthlyPLChartInstances[key]) {
            monthlyPLChartInstances[key].destroy();
            delete monthlyPLChartInstances[key];
        }
    });

    setTimeout(() => {
        visibleMonths.forEach((month, index) => {
            const accounts = monthlyAggregate[month] || {};
            const acctList = Object.values(accounts);

            const revenueItems = acctList.filter(a => a.total > 0);
            const expenseItems = acctList.filter(a => a.total < 0);

            const totalRevenue = revenueItems.reduce((s, a) => s + a.total, 0);
            const totalExpenses = expenseItems.reduce((s, a) => s + a.total, 0);
            const netIncome = totalRevenue + totalExpenses;

            const labels = [];
            const values = [];
            const colors = [];
            // Parallel array so we can look up the account on click
            const clickTargets = [];  // { account_id } or null for net income

            revenueItems.forEach(a => {
                let label = a.name;
                if (label.length > 15) label = label.substring(0, 13) + '...';
                labels.push(label);
                values.push(a.total);
                colors.push('rgba(40, 167, 69, 0.85)');
                clickTargets.push({ account_id: a.account_id });
            });

            expenseItems.forEach(a => {
                let label = a.name;
                if (label.length > 15) label = label.substring(0, 13) + '...';
                labels.push(label);
                values.push(a.total);
                colors.push('rgba(220, 53, 69, 0.75)');
                clickTargets.push({ account_id: a.account_id });
            });

            labels.push('Net Income');
            values.push(netIncome);
            colors.push(netIncome >= 0 ? 'rgba(40, 167, 69, 0.95)' : 'rgba(220, 53, 69, 0.95)');
            clickTargets.push(null);

            const chartIndex = startIndex + index;
            const canvasId = `monthly-pl-chart-${chartIndex}`;
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            const ctx = canvas.getContext('2d');

            const chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Amount',
                        data: values,
                        backgroundColor: colors,
                        borderColor: colors.map(c => c.replace(/[\d.]+\)$/, '1)')),
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
                                label: function(context) {
                                    const val = context.raw;
                                    return (val >= 0 ? '+' : '') + '$' + Math.abs(val).toFixed(2);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) { return '$' + value; },
                                font: { size: 9 }
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 30,
                                minRotation: 30,
                                font: { size: 7 }
                            }
                        }
                    },
                    onClick: function(e, elements) {
                        if (elements.length === 0) return;
                        const element = elements[0];
                        const idx = element.index;
                        const target = clickTargets[idx];

                        if (target === null) {
                            // Net Income bar — show all transactions for the month
                            showMonthlyTransactions(month, null, 'All Transactions');
                            return;
                        }

                        const accountId = target.account_id;
                        const bucket = monthlyAggregate[month]?.[String(accountId)];
                        const accountName = bucket ? bucket.name : 'Unknown';
                        showMonthlyTransactions(month, accountId, accountName);
                    }
                }
            });

            monthlyPLChartInstances[chartIndex] = chart;
        });

        // Pagination listeners
        const prevBtn = document.getElementById('monthly-pl-prev');
        const nextBtn = document.getElementById('monthly-pl-next');

        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (monthlyPLCurrentPage > 0) {
                    monthlyPLCurrentPage--;
                    renderMonthlyPLChartsPage();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                const totalPages = Math.ceil(monthlyPLMonths.length / 6);
                if (monthlyPLCurrentPage < totalPages - 1) {
                    monthlyPLCurrentPage++;
                    renderMonthlyPLChartsPage();
                }
            });
        }

    }, 100);
}

// ============================================================
// MONTHLY TRANSACTIONS MODAL
// ============================================================
// Reads from monthlyAggregate. No fetch. No account_name string filter.
// The set of transactions shown is exactly the set that produced
// the bar's total — so they cannot disagree.
// ============================================================

function showMonthlyTransactions(month, accountId, accountName) {
    const modal = document.getElementById('monthly-tx-modal');
    const body = document.getElementById('modal-body');
    const title = document.getElementById('modal-title');

    if (!modal || !body || !title) {
        showToast('Error: Modal elements not found', 'error');
        return;
    }

    // Build a nice date-range label for the modal title
    const [year, monthNumber] = month.split('-');
    const firstDay = new Date(parseInt(year), parseInt(monthNumber) - 1, 1);
    const lastDay = new Date(parseInt(year), parseInt(monthNumber), 0);
    const fmt = d => String(d.getMonth() + 1).padStart(2, '0') + '/' +
                     String(d.getDate()).padStart(2, '0') + '/' +
                     String(d.getFullYear()).slice(2);
    const dateRange = fmt(firstDay) + ' - ' + fmt(lastDay);

    title.textContent = `${accountName} - ${dateRange}`;
    modal.style.display = 'flex';

    // Collect rows
    let rows = [];
    const accountsInMonth = monthlyAggregate[month] || {};

    if (accountId === null || accountId === undefined) {
        // "All Transactions" for the month
        for (const bucket of Object.values(accountsInMonth)) {
            rows = rows.concat(bucket.transactions);
        }
    } else {
        const bucket = accountsInMonth[String(accountId)];
        if (bucket) rows = bucket.transactions.slice();
    }

    // Sort newest first
    rows.sort((a, b) => {
        const da = String(a.transaction_date || '');
        const db = String(b.transaction_date || '');
        if (da !== db) return db.localeCompare(da);
        return (b.id || 0) - (a.id || 0);
    });

    renderModalTransactions(rows, accountName, dateRange);
}

function renderModalTransactions(transactions, accountName, dateRange) {
    const body = document.getElementById('modal-body');
    if (!body) return;

    if (!transactions || transactions.length === 0) {
        body.innerHTML = '<p style="color: #000;">No transactions found for this period.</p>';
        return;
    }

    let total = 0;
    transactions.forEach(tx => { total += Number(tx.amount) || 0; });

    let html = `
        <div style="background: #f8f9fa; padding: 12px 16px; border-radius: 4px; margin-bottom: 15px; display: flex; gap: 20px; flex-wrap: wrap; align-items: center; color: #000;">
            <div style="color: #000;"><strong style="color: #000;">Account:</strong> ${accountName || 'All Accounts'}</div>
            <div style="color: #000;"><strong style="color: #000;">Period:</strong> ${dateRange}</div>
            <div style="color: #000;"><strong style="color: #000;">Transactions:</strong> ${transactions.length}</div>
            <div style="color: #000;"><strong style="color: #000;">Total:</strong> <span style="font-weight:bold;color:${total >= 0 ? '#28a745' : '#dc3545'};">${total >= 0 ? '+' : ''}$${total.toFixed(2)}</span></div>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:14px; color:#000; background:#fff;">
            <thead>
                <tr style="background:#f8f9fa; color:#000;">
                    <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Date</th>
                    <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Description</th>
                    <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Account</th>
                    <th style="padding:8px 12px; text-align:right; border-bottom:2px solid #ddd; color:#000;">Amount</th>
                </tr>
            </thead>
            <tbody style="color: #000;">`;

    transactions.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        const isPositive = amt > 0;
        const sign = amt > 0 ? '+' : (amt < 0 ? '-' : '');
        const amtStr = amt !== 0 ? '$' + Math.abs(amt).toFixed(2) : '';

        html += `<tr style="border-bottom:1px solid #eee; color:#000;">
            <td style="padding:8px 12px; white-space:nowrap; color:#000;">${tx.transaction_date || ''}</td>
            <td style="padding:8px 12px; color:#000;">${tx.description || ''}</td>
            <td style="padding:8px 12px; color:#000;">${tx.post_to_account_name || ''}</td>
            <td style="padding:8px 12px; text-align:right; font-weight:600; color: ${isPositive ? '#28a745' : '#dc3545'};">${sign}${amtStr}</td>
        </tr>`;
    });

    html += `<tr class="total-row" style="font-weight:bold; background:#f0f0f0; color:#000;">
        <td colspan="3" style="padding:8px 12px; color:#000;"><strong style="color:#000;">Total</strong></td>
        <td style="padding:8px 12px; text-align:right; color:${total >= 0 ? '#28a745' : '#dc3545'};">${total >= 0 ? '+' : ''}${total !== 0 ? '$' + total.toFixed(2) : ''}</td>
    </tr>`;
    html += '</tbody></table>';

    body.innerHTML = html;
}

function closeMonthlyModal() {
    document.getElementById('monthly-tx-modal').style.display = 'none';
}

// ============================================================
// INITIALIZATION
// ============================================================

async function initAccounting() {
    console.log('[INIT] initAccounting called');

    const container = document.getElementById('accounting-container');
    if (!container) {
        console.error('[INIT] Container not found');
        return;
    }

    // Tab switching
    document.querySelectorAll('#accounting-sub-tabs .sub-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const sub = this.dataset.subtab;
            console.log('[INIT] Tab clicked:', sub);

            document.querySelectorAll('#accounting-sub-tabs .sub-tab').forEach(t => {
                t.style.background = '#e9ecef';
                t.style.color = '#333';
            });
            this.style.background = '#007bff';
            this.style.color = 'white';

            document.querySelectorAll('.sub-tab-content').forEach(c => c.style.display = 'none');
            const target = document.getElementById('sub-' + sub);
            if (target) target.style.display = 'flex';

            if (sub === 'transactions') {
                loadTransactions();
            } else if (sub === 'accounts') {
                loadAccountsList();
            } else if (sub === 'journal') {
                loadJournalEntries();
            } else if (sub === 'balance') {
                loadBalances();
            } else if (sub === 'monthly-pl') {
                loadMonthlyPLBarChart();
            }
        });
    });

    // Search button
    document.getElementById('search-btn')?.addEventListener('click', function() {
        loadTransactions();
    });

    document.getElementById('transaction-search')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loadTransactions();
        }
    });

    document.getElementById('clear-search-btn')?.addEventListener('click', function() {
        document.getElementById('transaction-search').value = '';
        document.getElementById('bulk-assign-section').style.display = 'none';
        loadTransactions();
    });

    document.getElementById('refresh-btn')?.addEventListener('click', async function() {
        await loadAllTransactions();
        loadTransactions();
    });

    document.getElementById('unposted-filter')?.addEventListener('change', function() {
        loadTransactions();
    });

    // Bulk Assign
    document.getElementById('bulk-assign-btn')?.addEventListener('click', function() {
        bulkAssignAccount();
    });

    document.getElementById('bulk-cancel-btn')?.addEventListener('click', function() {
        cancelBulkAssign();
    });

    // Add Account modal
    document.getElementById('add-account-btn')?.addEventListener('click', function() {
        showAddAccountModal();
    });

    document.getElementById('close-add-account-modal')?.addEventListener('click', function() {
        document.getElementById('add-account-modal').style.display = 'none';
    });

    document.getElementById('save-account-btn')?.addEventListener('click', function() {
        saveAccount();
    });

    // Click outside modal to close
    document.getElementById('add-account-modal')?.addEventListener('click', function(e) {
        if (e.target === this) this.style.display = 'none';
    });

    document.getElementById('monthly-tx-modal')?.addEventListener('click', function(e) {
        if (e.target === this) this.style.display = 'none';
    });

    // Load everything once
    try {
        await loadAccounts();
        await loadAllTransactions();
        loadTransactions();
    } catch (err) {
        console.error('[INIT] Failed to initialize:', err);
        showToast('Failed to load accounting data: ' + err.message, 'error');
    }

    console.log('[INIT] Initialization complete');
}

// Expose globally so app.js can call it
window.initAccounting = initAccounting;