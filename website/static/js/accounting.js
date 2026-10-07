// ============================================================
// accounting.js – Accounting Module
//
// DATA MODEL
// ----------
// Two source endpoints:
//   1. /api/accounting/bank-transactions-full  → bank rows (dollars, signed)
//   2. /api/accounting/manual-entries          → manual journal entries (cents)
//
// Every raw row is normalized into a flat list of "postings":
//
//   { id, transaction_date, description, additional_info,
//     account_id, delta, direction, source }
//
// where:
//   account_id  = the account this posting affects
//   delta       = signed dollar change to that account's balance
//                 (positive = increase, negative = decrease)
//   direction   = 'in' | 'out' — for display only
//   source      = 'bank' | 'journal_manual'
//
// BANK ROW  (raw: post_from=bank, post_to=category, amount signed)
//   For a positive raw amount (money entered the bank):
//       posting 1 → account = bank,     delta = +raw (bank increased)
//       posting 2 → account = category, delta = +raw (category increased)
//   For a negative raw amount (money left the bank):
//       posting 1 → account = bank,     delta = raw  (bank decreased, raw is negative)
//       posting 2 → account = category, delta = -raw (category increased)
//
// MANUAL ENTRY  (raw: post_from=source, post_to=dest, amount positive cents)
//   posting 1 → account = post_to,   delta = +dollars (destination increased)
//   posting 2 → account = post_from, delta = -dollars (source decreased)
//
// DERIVED VIEWS
// -------------
//   computeBalances()            → sum delta per account (natural-balance convention:
//                                   expense balances read positive when expenses grew)
//   aggregateByMonthAndAccount() → bucket by account_id, apply P&L sign
//                                   (revenue/asset: +1, expense/liability/equity: -1)
//
// MODAL DISPLAY
// -------------
//   The monthly P&L modal shows transactions with a P&L-convention sign:
//   expense postings display as negative, revenue postings as positive.
//   The Balance tab retains the natural-balance convention (positive when healthy).
//
// Retired endpoints:
//   /api/accounting/monthly-pl
//   /api/accounting/monthly-account-transactions
//   /api/accounting/balances
// ============================================================

console.log('[ACCOUNTING] Script started loading');

// ===== API BASE URL =====
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000' 
    : 'https://www.pigstylemusic.com';

// ===== CONSTANTS =====
const PREPAID_RENT_ACCOUNT_ID = 52;

// ===== GLOBAL VARIABLES =====
let bankAccounts = [];
let journalCurrentPage = 1;
const journalPageSize = 20;
let journalTotalEntries = 0;
let currentSearchTerm = '';
let currentFilter = 'all';

// Expanded-state tracking for the Balance tab
const expandedBalanceAccounts = new Set();

// ===== SINGLE SOURCE OF TRUTH =====
let allTransactions = [];       // flat list of postings
let rawBankRows = [];           // original bank rows (untransformed) for the Transactions tab
let monthlyAggregate = {};      // { 'YYYY-MM': { '<account_id>': { name, code, type, total, transactions[] } } }

// Monthly P&L chart page state
let monthlyPLMonths = [];
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
// FETCH + NORMALIZE
// ============================================================

async function loadAllTransactions() {
    console.log('[ACCT] Loading bank transactions and manual entries...');

    const [bankResult, manualResult] = await Promise.allSettled([
        fetchBankTransactions(),
        fetchManualEntries()
    ]);

    rawBankRows = bankResult.status === 'fulfilled' ? bankResult.value : [];
    const rawManualRows = manualResult.status === 'fulfilled' ? manualResult.value : [];

    if (bankResult.status === 'rejected') {
        console.error('[ACCT] bank fetch failed:', bankResult.reason);
    }
    if (manualResult.status === 'rejected') {
        console.error('[ACCT] manual fetch failed:', manualResult.reason);
    }

    const bankPostings = normalizeBankTransactions(rawBankRows);
    const manualPostings = normalizeManualEntries(rawManualRows);

    allTransactions = [...bankPostings, ...manualPostings];
    monthlyAggregate = aggregateByMonthAndAccount(allTransactions);
    monthlyPLMonths = Object.keys(monthlyAggregate).sort().reverse();

    console.log(
        `[ACCT] Loaded ${rawBankRows.length} bank rows + ${rawManualRows.length} manual entries ` +
        `= ${allTransactions.length} postings across ${monthlyPLMonths.length} months`
    );

    return allTransactions;
}

async function fetchBankTransactions() {
    const url = `${API_BASE}/api/accounting/bank-transactions-full?filter=all`;
    const response = await fetch(url, { credentials: 'include', mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.status !== 'success') {
        throw new Error(data.error || 'Failed to load bank transactions');
    }
    return data.transactions || [];
}

async function fetchManualEntries() {
    const url = `${API_BASE}/api/accounting/manual-entries`;
    const response = await fetch(url, { credentials: 'include', mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.status !== 'success') {
        throw new Error(data.error || 'Failed to load manual entries');
    }
    return data.entries || [];
}

/**
 * Turn each bank row into up to two postings.
 * - Always produce a posting for the bank account (post_from) with the signed raw amount.
 * - If the row has a category assigned (post_to != null), produce a posting for the
 *   category account with a positive amount (money arrived at the category).
 */
function normalizeBankTransactions(rows) {
    const postings = [];
    for (const tx of rows) {
        const rawAmount = Number(tx.amount) || 0;
        const absAmount = Math.abs(rawAmount);
        const direction = rawAmount >= 0 ? 'in' : 'out';
        const baseId = `bank_${tx.id}`;

        // Bank side: the bank's balance changes by the signed raw amount.
        if (tx.post_from !== null && tx.post_from !== undefined) {
            postings.push({
                id: `${baseId}_bank`,
                bank_transaction_id: tx.id,
                transaction_date: tx.transaction_date,
                description: tx.description || '',
                additional_info: tx.additional_info || '',
                account_id: tx.post_from,
                delta: rawAmount,
                direction: direction,
                source: 'bank',
                is_bank_side: true
            });
        }

        // Category side: the category always increases by abs(rawAmount).
        if (tx.post_to !== null && tx.post_to !== undefined) {
            postings.push({
                id: `${baseId}_cat`,
                bank_transaction_id: tx.id,
                transaction_date: tx.transaction_date,
                description: tx.description || '',
                additional_info: tx.additional_info || '',
                account_id: tx.post_to,
                delta: absAmount,
                direction: 'in',
                source: 'bank',
                is_bank_side: false
            });
        }
    }
    return postings;
}

/**
 * Turn each manual journal entry into two postings:
 * one for the destination account (increases) and one for the source (decreases).
 *
 * Account 52 (Prepaid Rent) is skipped, matching the legacy monthly-pl behavior.
 */
function normalizeManualEntries(entries) {
    const postings = [];
    for (const e of entries) {
        if (!e.transaction_date) continue;
        const cents = Number(e.amount) || 0;
        const dollars = cents / 100.0;
        if (dollars === 0) continue;
        const baseId = `manual_${e.id}`;

        if (e.post_to && Number(e.post_to) !== PREPAID_RENT_ACCOUNT_ID) {
            postings.push({
                id: `${baseId}_to`,
                manual_id: e.id,
                transaction_date: e.transaction_date,
                description: e.description || '',
                additional_info: `Manual entry #${e.id}`,
                account_id: e.post_to,
                delta: dollars,
                direction: 'in',
                source: 'journal_manual'
            });
        }
        if (e.post_from && Number(e.post_from) !== PREPAID_RENT_ACCOUNT_ID) {
            postings.push({
                id: `${baseId}_from`,
                manual_id: e.id,
                transaction_date: e.transaction_date,
                description: e.description || '',
                additional_info: `Manual entry #${e.id}`,
                account_id: e.post_from,
                delta: -dollars,
                direction: 'out',
                source: 'journal_manual'
            });
        }
    }
    return postings;
}

/**
 * Aggregate postings into month + account buckets.
 *
 * The bucket's `total` is signed according to the account's P&L direction:
 *   revenue, asset            → +1  (revenue up, asset up → positive)
 *   expense, liability, equity → -1  (expense up → negative)
 */
function aggregateByMonthAndAccount(postings) {
    const accountMeta = {};
    for (const acc of bankAccounts) {
        const type = acc.type || 'asset';
        let sign = 1;
        if (type === 'expense' || type === 'liability' || type === 'equity') sign = -1;
        else sign = 1;
        accountMeta[String(acc.id)] = { type, sign };
    }

    const months = {};

    for (const p of postings) {
        if (!p.transaction_date) continue;
        const month = String(p.transaction_date).slice(0, 7);
        if (!month) continue;

        const accountId = String(p.account_id);
        const meta = accountMeta[accountId] || { type: 'unknown', sign: 1 };

        if (!months[month]) months[month] = {};
        if (!months[month][accountId]) {
            const acc = bankAccounts.find(a => String(a.id) === accountId);
            months[month][accountId] = {
                account_id: p.account_id,
                name: acc ? acc.name : 'Unknown',
                code: acc ? acc.code : '',
                type: meta.type,
                total: 0,
                transactions: []
            };
        }

        months[month][accountId].total += meta.sign * p.delta;
        months[month][accountId].transactions.push(p);
    }

    return months;
}

// ============================================================
// COMPUTE ACCOUNT BALANCES (natural-balance convention)
// ============================================================
// Balances are the sum of deltas per account. The natural-balance
// convention means every account reads positive when "healthy":
//   asset     → positive when the asset grew
//   expense   → positive when the expense grew
//   liability → positive when the obligation grew
//   equity    → positive when capital grew
//   revenue   → positive when revenue was earned
// ============================================================

function computeBalances(postings, accounts) {
    const byId = {};
    for (const acc of accounts) {
        byId[String(acc.id)] = {
            id: acc.id,
            code: acc.code,
            name: acc.name,
            type: acc.type || 'asset',
            balance: 0,
            transactions: []
        };
    }

    for (const p of postings) {
        const key = String(p.account_id);
        const a = byId[key];
        if (!a) continue;
        a.balance += Number(p.delta) || 0;
        a.transactions.push({
            transaction_date: p.transaction_date,
            description: p.description,
            additional_info: p.additional_info,
            amount: Math.abs(Number(p.delta) || 0),
            signed_delta: Number(p.delta) || 0,
            direction: p.direction,
            source: p.source
        });
    }

    for (const acc of Object.values(byId)) {
        acc.transactions.sort((a, b) => {
            const da = String(a.transaction_date || '');
            const db = String(b.transaction_date || '');
            if (da !== db) return db.localeCompare(da);
            return String(b.description).localeCompare(String(a.description));
        });
    }

    return Object.values(byId).sort((a, b) =>
        String(a.code).localeCompare(String(b.code))
    );
}

// ============================================================
// LOAD ACCOUNTS
// ============================================================

async function loadAccounts() {
    console.log('[ACCOUNTS] Loading accounts...');
    try {
        const response = await fetch(`${API_BASE}/api/accounting/accounts`, {
            credentials: 'include', mode: 'cors'
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
// TRANSACTIONS TAB
// ============================================================

function loadTransactions() {
    console.log('[TRANSACTIONS] Rendering from raw bank rows...');
    const list = document.getElementById('transactions-list');
    if (!list) return;

    const filter = document.getElementById('unposted-filter')?.value || 'all';
    const search = document.getElementById('transaction-search')?.value.trim() || '';
    currentFilter = filter;
    currentSearchTerm = search;

    let rows = rawBankRows.slice();

    const isPosted = tx => tx.post_to !== null && tx.post_to !== undefined;

    if (filter === 'unposted') {
        rows = rows.filter(tx => !isPosted(tx));
    } else if (filter === 'posted') {
        rows = rows.filter(tx => isPosted(tx));
    }

    if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(tx =>
            (tx.description || '').toLowerCase().includes(s) ||
            (tx.additional_info || '').toLowerCase().includes(s)
        );
    }

    rows.sort((a, b) => {
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
        const rawAmt = Number(tx.amount) || 0;
        const isDebit = rawAmt < 0;
        const formattedAmount = (isDebit ? '-' : '+') + '$' + Math.abs(rawAmt).toFixed(2);

        const isProcessed = tx.post_to !== null && tx.post_to !== undefined;
        const statusColor = isProcessed ? '#28a745' : '#dc3545';
        const statusText = isProcessed ? '✅ Posted' : '⏳ Unposted';

        const postedToName = isProcessed ? tx.post_to_account_name : null;

        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; ${isProcessed ? 'background: #f0fff4;' : 'background: #fff5f5;'}">
                <div style="flex: 1; min-width: 150px;">
                    <div style="font-weight: 600; color: #333; font-size: 13px;">${tx.description || 'No description'}</div>
                    <div style="color: #666; font-size: 12px;">${tx.transaction_date || ''} • ID: ${tx.id}</div>
                    ${postedToName ? `<div style="color: #888; font-size: 11px;">Posted to: ${postedToName}</div>` : ''}
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

    const unposted = transactions.filter(tx =>
        tx.post_to === null || tx.post_to === undefined
    );

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
            method: 'POST', credentials: 'include', mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transaction_id: parseInt(transactionId),
                post_to: parseInt(accountId)
            })
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast(`✅ Transaction assigned to ${result.account_name || 'account'}`, 'success');
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
    if (!accountId) { showToast('Please select an account to assign.', 'warning'); return; }
    if (!currentSearchTerm) { showToast('Please enter a search term first.', 'warning'); return; }

    const accountName = select.options[select.selectedIndex]?.text || 'selected account';
    if (!confirm(`Assign all unposted transactions matching "${currentSearchTerm}" to ${accountName}?`)) return;

    try {
        const searchLower = currentSearchTerm.toLowerCase();
        const unpostedTransactions = rawBankRows.filter(tx => {
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
            method: 'POST', credentials: 'include', mode: 'cors',
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
    const list = document.getElementById('accounts-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Loading...</div>';
    try {
        const response = await fetch(`${API_BASE}/api/accounting/accounts`, {
            credentials: 'include', mode: 'cors'
        });
        if (!response.ok) throw new Error('Failed to load accounts');
        const data = await response.json();
        if (data.status === 'success') {
            renderAccounts(data.accounts || []);
        } else {
            list.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">Error loading accounts</div>';
        }
    } catch (err) {
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
        asset: '#cce5ff', liability: '#fff3cd', equity: '#d4edda',
        revenue: '#cce5ff', expense: '#f8d7da'
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
    if (!code || !name || !type) { showToast('Code, Name, and Type are required.', 'error'); return; }
    try {
        const url = id ? `${API_BASE}/api/accounting/accounts/${id}` : `${API_BASE}/api/accounting/accounts`;
        const method = id ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method, credentials: 'include', mode: 'cors',
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
            credentials: 'include', mode: 'cors'
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
// BALANCE TAB (expandable)
// ============================================================

function loadBalances() {
    console.log('[BALANCE] Computing from in-memory postings...');
    const list = document.getElementById('balance-list');
    if (!list) return;

    if (!allTransactions || allTransactions.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No data loaded yet. Try the Refresh button.</div>';
        return;
    }

    const balances = computeBalances(allTransactions, bankAccounts);
    renderBalances(balances);
}

window.toggleBalanceAccount = function(accountId) {
    const key = String(accountId);
    if (expandedBalanceAccounts.has(key)) {
        expandedBalanceAccounts.delete(key);
    } else {
        expandedBalanceAccounts.add(key);
    }
    loadBalances();
};

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

    let html = `
        <div style="background: #f8f9fa; padding: 10px 16px; border-radius: 6px; margin-bottom: 12px; font-size: 12px; color: #666; border-left: 3px solid #6c757d;">
            ℹ️ <strong>Balances shown reflect net movement in recorded data.</strong>
            Opening balances are not included, so bank and cash figures represent
            change since the earliest loaded transaction, not current account value.
            Click any account to expand and see its transactions.
        </div>
    `;

    Object.keys(types).forEach(key => {
        const group = types[key];
        if (group.items.length === 0) return;

        html += `<div style="font-weight: 700; color: ${group.color}; padding: 8px 12px; border-bottom: 2px solid ${group.color}; margin-top: 5px;">${group.label}</div>`;

        group.items.forEach(item => {
            const balance = item.balance || 0;
            const balanceColor = balance >= 0 ? '#28a745' : '#dc3545';
            const key = String(item.id);
            const isExpanded = expandedBalanceAccounts.has(key);
            const txCount = item.transactions ? item.transactions.length : 0;
            const chevron = isExpanded ? '▾' : '▸';

            html += `
                <div style="border-bottom: 1px solid #f0f0f0;">
                    <div onclick="toggleBalanceAccount(${item.id})"
                         style="display: flex; justify-content: space-between; align-items: center; padding: 6px 12px 6px 24px; cursor: pointer; transition: background 0.15s;"
                         onmouseover="this.style.background='#f8f9fa'"
                         onmouseout="this.style.background='transparent'">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="color: #999; font-size: 11px; width: 12px; display: inline-block;">${chevron}</span>
                            <span style="color: #333; font-size: 13px;">${item.code} - ${item.name}</span>
                            <span style="color: #aaa; font-size: 11px;">(${txCount})</span>
                        </div>
                        <span style="font-weight: 600; color: ${balanceColor};">$${balance.toFixed(2)}</span>
                    </div>
            `;

            if (isExpanded) {
                if (txCount === 0) {
                    html += `<div style="padding: 10px 24px 14px 44px; color: #999; font-size: 12px; font-style: italic;">No transactions for this account.</div>`;
                } else {
                    html += `
                        <div style="padding: 4px 12px 10px 44px; background: #fafafa;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                                <thead>
                                    <tr style="border-bottom: 1px solid #e0e0e0;">
                                        <th style="text-align: left; padding: 4px 6px; color: #666; font-weight: 600;">Date</th>
                                        <th style="text-align: left; padding: 4px 6px; color: #666; font-weight: 600;">Description</th>
                                        <th style="text-align: left; padding: 4px 6px; color: #666; font-weight: 600;">Source</th>
                                        <th style="text-align: center; padding: 4px 6px; color: #666; font-weight: 600;">Dir</th>
                                        <th style="text-align: right; padding: 4px 6px; color: #666; font-weight: 600;">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;

                    item.transactions.forEach(tx => {
                        const signedDelta = Number(tx.signed_delta) || 0;
                        const amtColor = signedDelta >= 0 ? '#28a745' : '#dc3545';
                        const amtStr = (signedDelta >= 0 ? '+' : '-') + '$' + Math.abs(signedDelta).toFixed(2);
                        const sourceLabel = tx.source === 'journal_manual' ? 'Manual' : 'Bank';
                        const dirLabel = tx.direction === 'in' ? '→ in' : '← out';
                        const dirColor = tx.direction === 'in' ? '#28a745' : '#dc3545';

                        html += `
                            <tr style="border-bottom: 1px solid #eee;">
                                <td style="padding: 4px 6px; color: #333; white-space: nowrap;">${tx.transaction_date || ''}</td>
                                <td style="padding: 4px 6px; color: #333;">${tx.description || ''}</td>
                                <td style="padding: 4px 6px; color: #888;">${sourceLabel}</td>
                                <td style="padding: 4px 6px; text-align: center; color: ${dirColor};">${dirLabel}</td>
                                <td style="padding: 4px 6px; text-align: right; font-weight: 600; color: ${amtColor};">${amtStr}</td>
                            </tr>
                        `;
                    });

                    html += `
                                </tbody>
                            </table>
                        </div>
                    `;
                }
            }

            html += `</div>`;
        });
    });

    list.innerHTML = html;
}

// ============================================================
// MONTHLY P&L BAR CHARTS
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
        const plAccounts = acctList.filter(a => a.type === 'revenue' || a.type === 'expense');
        const revenueItems = plAccounts.filter(a => a.total > 0);
        const expenseItems = plAccounts.filter(a => a.total < 0);
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
            const plAccounts = acctList.filter(a => a.type === 'revenue' || a.type === 'expense');
            const revenueItems = plAccounts.filter(a => a.total > 0);
            const expenseItems = plAccounts.filter(a => a.total < 0);
            const totalRevenue = revenueItems.reduce((s, a) => s + a.total, 0);
            const totalExpenses = expenseItems.reduce((s, a) => s + a.total, 0);
            const netIncome = totalRevenue + totalExpenses;

            const labels = [], values = [], colors = [], clickTargets = [];

            revenueItems.forEach(a => {
                let label = a.name;
                if (label.length > 15) label = label.substring(0, 13) + '...';
                labels.push(label); values.push(a.total);
                colors.push('rgba(40, 167, 69, 0.85)');
                clickTargets.push({ account_id: a.account_id });
            });

            expenseItems.forEach(a => {
                let label = a.name;
                if (label.length > 15) label = label.substring(0, 13) + '...';
                labels.push(label); values.push(a.total);
                colors.push('rgba(220, 53, 69, 0.75)');
                clickTargets.push({ account_id: a.account_id });
            });

            labels.push('Net Income'); values.push(netIncome);
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
                            ticks: { callback: v => '$' + v, font: { size: 9 } }
                        },
                        x: {
                            ticks: { maxRotation: 30, minRotation: 30, font: { size: 7 } }
                        }
                    },
                    onClick: function(e, elements) {
                        if (elements.length === 0) return;
                        const idx = elements[0].index;
                        const target = clickTargets[idx];
                        if (target === null) {
                            showMonthlyTransactions(month, null, 'P&L Transactions');
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

        const prevBtn = document.getElementById('monthly-pl-prev');
        const nextBtn = document.getElementById('monthly-pl-next');
        if (prevBtn) prevBtn.addEventListener('click', function() {
            if (monthlyPLCurrentPage > 0) { monthlyPLCurrentPage--; renderMonthlyPLChartsPage(); }
        });
        if (nextBtn) nextBtn.addEventListener('click', function() {
            const totalPages = Math.ceil(monthlyPLMonths.length / 6);
            if (monthlyPLCurrentPage < totalPages - 1) { monthlyPLCurrentPage++; renderMonthlyPLChartsPage(); }
        });
    }, 100);
}

// ============================================================
// MONTHLY TRANSACTIONS MODAL
// ============================================================
// Displays transactions with a P&L-convention sign:
//   revenue → positive
//   expense → negative
//   asset/liability/equity → natural sign (rarely shown here)
//
// The sign flip for expenses is applied at display time via _displaySign.
// ============================================================

function showMonthlyTransactions(month, accountId, accountName) {
    const modal = document.getElementById('monthly-tx-modal');
    const body = document.getElementById('modal-body');
    const title = document.getElementById('modal-title');
    if (!modal || !body || !title) {
        showToast('Error: Modal elements not found', 'error');
        return;
    }

    const [year, monthNumber] = month.split('-');
    const firstDay = new Date(parseInt(year), parseInt(monthNumber) - 1, 1);
    const lastDay = new Date(parseInt(year), parseInt(monthNumber), 0);
    const fmt = d => String(d.getMonth() + 1).padStart(2, '0') + '/' +
                     String(d.getDate()).padStart(2, '0') + '/' +
                     String(d.getFullYear()).slice(2);
    const dateRange = fmt(firstDay) + ' - ' + fmt(lastDay);
    title.textContent = `${accountName} - ${dateRange}`;
    modal.style.display = 'flex';

    let rows = [];
    const accountsInMonth = monthlyAggregate[month] || {};

    if (accountId === null || accountId === undefined) {
        // P&L Transactions modal: concat all revenue + expense buckets.
        // Apply the P&L sign per bucket's account type.
        for (const bucket of Object.values(accountsInMonth)) {
            if (bucket.type === 'revenue' || bucket.type === 'expense') {
                const sign = (bucket.type === 'expense') ? -1 : 1;
                for (const tx of bucket.transactions) {
                    rows.push({ ...tx, _displaySign: sign });
                }
            }
        }
    } else {
        const bucket = accountsInMonth[String(accountId)];
        if (bucket) {
            const isCreditNormal = (bucket.type === 'expense' ||
                                    bucket.type === 'liability' ||
                                    bucket.type === 'equity');
            const sign = isCreditNormal ? -1 : 1;
            for (const tx of bucket.transactions) {
                rows.push({ ...tx, _displaySign: sign });
            }
        }
    }

    rows.sort((a, b) => {
        const da = String(a.transaction_date || '');
        const db = String(b.transaction_date || '');
        if (da !== db) return db.localeCompare(da);
        return String(b.id).localeCompare(String(a.id));
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

    // Total in display convention
    let total = 0;
    transactions.forEach(tx => {
        total += (Number(tx.delta) || 0) * (tx._displaySign || 1);
    });

    const totalSign = total >= 0 ? '+' : '-';
    const totalColor = total >= 0 ? '#28a745' : '#dc3545';

    let html = `
        <div style="background: #f8f9fa; padding: 12px 16px; border-radius: 4px; margin-bottom: 15px; display: flex; gap: 20px; flex-wrap: wrap; align-items: center; color: #000;">
            <div style="color: #000;"><strong style="color: #000;">Account:</strong> ${accountName || 'All Accounts'}</div>
            <div style="color: #000;"><strong style="color: #000;">Period:</strong> ${dateRange}</div>
            <div style="color: #000;"><strong style="color: #000;">Transactions:</strong> ${transactions.length}</div>
            <div style="color: #000;"><strong style="color: #000;">Total:</strong> <span style="font-weight:bold;color:${totalColor};">${totalSign}$${Math.abs(total).toFixed(2)}</span></div>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:14px; color:#000; background:#fff;">
            <thead>
                <tr style="background:#f8f9fa; color:#000;">
                    <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Date</th>
                    <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Description</th>
                    <th style="padding:8px 12px; text-align:left; border-bottom:2px solid #ddd; color:#000;">Source</th>
                    <th style="padding:8px 12px; text-align:right; border-bottom:2px solid #ddd; color:#000;">Amount</th>
                </tr>
            </thead>
            <tbody style="color: #000;">`;

    transactions.forEach(tx => {
        const rawDelta = Number(tx.delta) || 0;
        const displayDelta = rawDelta * (tx._displaySign || 1);
        const isPositive = displayDelta >= 0;
        const sign = isPositive ? '+' : '-';
        const amtStr = '$' + Math.abs(displayDelta).toFixed(2);
        const sourceLabel = tx.source === 'journal_manual' ? 'Manual' : 'Bank';

        html += `<tr style="border-bottom:1px solid #eee; color:#000;">
            <td style="padding:8px 12px; white-space:nowrap; color:#000;">${tx.transaction_date || ''}</td>
            <td style="padding:8px 12px; color:#000;">${tx.description || ''}</td>
            <td style="padding:8px 12px; color:#000;">${sourceLabel}</td>
            <td style="padding:8px 12px; text-align:right; font-weight:600; color: ${isPositive ? '#28a745' : '#dc3545'};">${sign}${amtStr}</td>
        </tr>`;
    });

    html += `<tr class="total-row" style="font-weight:bold; background:#f0f0f0; color:#000;">
        <td colspan="3" style="padding:8px 12px; color:#000;"><strong style="color:#000;">Total</strong></td>
        <td style="padding:8px 12px; text-align:right; color:${totalColor};">${totalSign}$${Math.abs(total).toFixed(2)}</td>
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
    if (!container) { console.error('[INIT] Container not found'); return; }

    document.querySelectorAll('#accounting-sub-tabs .sub-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const sub = this.dataset.subtab;
            document.querySelectorAll('#accounting-sub-tabs .sub-tab').forEach(t => {
                t.style.background = '#e9ecef'; t.style.color = '#333';
            });
            this.style.background = '#007bff'; this.style.color = 'white';
            document.querySelectorAll('.sub-tab-content').forEach(c => c.style.display = 'none');
            const target = document.getElementById('sub-' + sub);
            if (target) target.style.display = 'flex';

            if (sub === 'transactions') loadTransactions();
            else if (sub === 'accounts') loadAccountsList();
            else if (sub === 'journal') loadJournalEntries();
            else if (sub === 'balance') loadBalances();
            else if (sub === 'monthly-pl') loadMonthlyPLBarChart();
        });
    });

    document.getElementById('search-btn')?.addEventListener('click', () => loadTransactions());
    document.getElementById('transaction-search')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') loadTransactions();
    });
    document.getElementById('clear-search-btn')?.addEventListener('click', function() {
        document.getElementById('transaction-search').value = '';
        document.getElementById('bulk-assign-section').style.display = 'none';
        loadTransactions();
    });

    document.getElementById('refresh-btn')?.addEventListener('click', async function() {
        await loadAllTransactions();
        loadTransactions();
        loadBalances();
    });

    document.getElementById('unposted-filter')?.addEventListener('change', () => loadTransactions());
    document.getElementById('bulk-assign-btn')?.addEventListener('click', () => bulkAssignAccount());
    document.getElementById('bulk-cancel-btn')?.addEventListener('click', () => cancelBulkAssign());
    document.getElementById('add-account-btn')?.addEventListener('click', () => showAddAccountModal());
    document.getElementById('close-add-account-modal')?.addEventListener('click', function() {
        document.getElementById('add-account-modal').style.display = 'none';
    });
    document.getElementById('save-account-btn')?.addEventListener('click', () => saveAccount());
    document.getElementById('add-account-modal')?.addEventListener('click', function(e) {
        if (e.target === this) this.style.display = 'none';
    });
    document.getElementById('monthly-tx-modal')?.addEventListener('click', function(e) {
        if (e.target === this) this.style.display = 'none';
    });

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

window.initAccounting = initAccounting;