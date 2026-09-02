// ============================================================
// accounting.js – Complete Accounting Module with Bar Charts
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

// Monthly P&L charts
let monthlyPLMonths = [];
let monthlyPLAllData = {};
let monthlyPLCurrentPage = 0;
let monthlyPLChartInstances = {};

// ============================================================
// TOAST NOTIFICATION
// ============================================================

function showToast(message, type = 'success') {
    console.log('[TOAST] Called with:', message, type);
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
// TRANSACTIONS TAB
// ============================================================

async function loadTransactions() {
    console.log('[TRANSACTIONS] Loading transactions...');
    const list = document.getElementById('transactions-list');
    if (!list) {
        console.warn('[TRANSACTIONS] transactions-list not found');
        return;
    }
    
    list.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;">Loading...</div>';
    
    const filter = document.getElementById('unposted-filter')?.value || 'all';
    const search = document.getElementById('transaction-search')?.value.trim() || '';
    currentFilter = filter;
    currentSearchTerm = search;
    
    try {
        let url = `${API_BASE}/api/accounting/bank-transactions-full`;
        const params = new URLSearchParams();
        if (filter === 'unposted') params.append('filter', 'unposted');
        else if (filter === 'posted') params.append('filter', 'posted');
        else params.append('filter', 'all');
        if (search) params.append('search', search);
        
        const query = params.toString();
        if (query) url += '?' + query;
        
        const response = await fetch(url, { 
            credentials: 'include',
            mode: 'cors'
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            renderTransactions(data.transactions || []);
            updateBulkAssignSection(data.transactions || []);
        } else {
            list.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">Error loading transactions</div>';
        }
    } catch (err) {
        console.error('[TRANSACTIONS] Error:', err);
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">Error: ' + err.message + '</div>';
    }
}

function renderTransactions(transactions) {
    const list = document.getElementById('transactions-list');
    if (!list) return;
    
    if (!transactions || transactions.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No transactions found</div>';
        return;
    }
    
    // Build account dropdown options
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
    
    // Add event listeners for individual assignment buttons
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
    
    // Allow Enter key on select dropdowns
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
        const url = `${API_BASE}/api/accounting/bank-transactions-full?search=${encodeURIComponent(currentSearchTerm)}&filter=unposted`;
        const response = await fetch(url, { credentials: 'include', mode: 'cors' });
        const data = await response.json();
        
        if (data.status !== 'success' || !data.transactions || data.transactions.length === 0) {
            showToast('No unposted transactions found to assign.', 'warning');
            return;
        }
        
        const unpostedTransactions = data.transactions.filter(tx => tx.post_to === null || tx.post_to === undefined);
        
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
    if (!list) {
        console.warn('[ACCOUNTS] accounts-list not found');
        return;
    }
    
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
    if (!list) {
        console.warn('[JOURNAL] journal-list not found');
        return;
    }
    
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
    if (!list) {
        console.warn('[BALANCE] balance-list not found');
        return;
    }
    
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
        if (types[type]) {
            types[type].items.push(b);
        }
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
// MONTHLY P&L BAR CHARTS
// ============================================================

async function loadMonthlyPLBarChart() {
    console.log('========================================');
    console.log('[MONTHLY-PL] 🔄 Starting loadMonthlyPLBarChart');
    console.log('========================================');
    
    const container = document.getElementById('monthly-pl-bar-chart-container');
    if (!container) {
        console.error('[MONTHLY-PL] ❌ Container not found!');
        return;
    }

    container.innerHTML = '<div style="text-align: center; font-size: 14px; color: #666; padding: 40px;">Loading charts...</div>';

    try {
        const url = `${API_BASE}/api/accounting/monthly-pl`;
        console.log(`[MONTHLY-PL] 📡 Fetching URL: ${url}`);
        
        const response = await fetch(url, {
            credentials: 'include',
            mode: 'cors'
        });

        console.log(`[MONTHLY-PL] 📡 Response status: ${response.status}`);
        
        if (!response.ok) {
            console.error(`[MONTHLY-PL] ❌ HTTP Error: ${response.status}`);
            throw new Error(`Failed to load monthly P&L: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[MONTHLY-PL] 📊 Raw data received:', data);
        console.log(`[MONTHLY-PL] 📊 Total entries: ${data.data ? data.data.length : 0}`);
        
        // ============================================================
        // CHECK FOR RENT ENTRIES IN RAW DATA
        // ============================================================
        const rentEntries = data.data.filter(item => 
            item.name && (item.name.includes('Rent') || item.name.includes('rent'))
        );
        console.log(`[MONTHLY-PL] 🏠 Rent entries found in raw data: ${rentEntries.length}`);
        if (rentEntries.length > 0) {
            console.log('[MONTHLY-PL] 🏠 Rent entries:', rentEntries);
        } else {
            console.warn('[MONTHLY-PL] ⚠️ NO RENT ENTRIES FOUND IN RAW DATA!');
            console.log('[MONTHLY-PL] 🔍 First 5 items:', data.data.slice(0, 5));
        }

        if (data.status === 'success') {
            const groupedByMonth = {};
            data.data.forEach(item => {
                if (!groupedByMonth[item.month]) {
                    groupedByMonth[item.month] = [];
                }
                groupedByMonth[item.month].push(item);
            });

            console.log('[MONTHLY-PL] 📅 Months found:', Object.keys(groupedByMonth).sort());

            // Check each month for rent entries
            Object.keys(groupedByMonth).forEach(month => {
                const items = groupedByMonth[month];
                const rentInMonth = items.filter(i => 
                    i.name && (i.name.includes('Rent') || i.name.includes('rent'))
                );
                if (rentInMonth.length > 0) {
                    console.log(`[MONTHLY-PL] 🏠 Rent entries in ${month}:`, rentInMonth);
                }
            });

            monthlyPLMonths = Object.keys(groupedByMonth).sort().reverse();
            monthlyPLAllData = groupedByMonth;
            monthlyPLCurrentPage = 0;
            
            console.log('[MONTHLY-PL] 📊 monthlyPLMonths:', monthlyPLMonths);
            console.log('[MONTHLY-PL] 📊 monthlyPLAllData keys:', Object.keys(monthlyPLAllData));
            
            renderMonthlyPLChartsPage();
        } else {
            console.error('[MONTHLY-PL] ❌ API returned error status:', data.status);
            container.innerHTML = `<p style="text-align:center; padding:40px; color:#dc3545;">${data.error || 'Error loading data'}</p>`;
        }
        
    } catch (err) {
        console.error('[MONTHLY-PL] ❌ Error:', err);
        container.innerHTML = `<p style="text-align:center; padding:40px; color:#dc3545;">Error: ${err.message}</p>`;
    }
}


function renderMonthlyPLChartsPage() {
    console.log('[MONTHLY-PL] Rendering page', monthlyPLCurrentPage);
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
        const items = monthlyPLAllData[month] || [];
        
        // Use balance sign to determine revenue vs expense
        const revenueItems = items.filter(i => i.balance > 0);
        const expenseItems = items.filter(i => i.balance < 0);
        
        const totalRevenue = revenueItems.reduce((sum, i) => sum + i.balance, 0);
        const totalExpenses = expenseItems.reduce((sum, i) => sum + i.balance, 0);
        const netIncome = totalRevenue + totalExpenses;

        const labels = [];
        const values = [];
        const colors = [];

        revenueItems.forEach(item => {
            labels.push(item.name);
            values.push(item.balance);
            colors.push('rgba(40, 167, 69, 0.85)');
        });

        expenseItems.forEach(item => {
            labels.push(item.name);
            values.push(item.balance);
            colors.push('rgba(220, 53, 69, 0.75)');
        });

        labels.push('Net Income');
        values.push(netIncome);
        colors.push(netIncome >= 0 ? 'rgba(40, 167, 69, 0.95)' : 'rgba(220, 53, 69, 0.95)');

        const chartIndex = startIndex + index;

        html += `
            <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; position: relative; min-height: 400px;">
                <div style="text-align: center; font-weight: 600; font-size: 16px; color: #000; margin-bottom: 10px;">${month}</div>
                <div style="text-align: center; font-size: 12px; color: #666; margin-bottom: 10px;">
                    Revenue: <span style="color:#28a745;font-weight:bold;">$${totalRevenue.toFixed(2)}</span> | 
                    Expenses: <span style="color:#dc3545;font-weight:bold;">$${Math.abs(totalExpenses).toFixed(2)}</span> | 
                    Net: <span style="font-weight: bold; color: ${netIncome >= 0 ? '#28a745' : '#dc3545'};">${netIncome >= 0 ? '+' : ''}$${netIncome.toFixed(2)}</span>
                </div>
                <div style="position: relative; height: 280px;">
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
            const items = monthlyPLAllData[month] || [];
            
            // Use balance sign to determine revenue vs expense
            const revenueItems = items.filter(i => i.balance > 0);
            const expenseItems = items.filter(i => i.balance < 0);
            
            const totalRevenue = revenueItems.reduce((sum, i) => sum + i.balance, 0);
            const totalExpenses = expenseItems.reduce((sum, i) => sum + i.balance, 0);
            const netIncome = totalRevenue + totalExpenses;

            const labels = [];
            const values = [];
            const colors = [];

            revenueItems.forEach(item => {
                labels.push(item.name);
                values.push(item.balance);
                colors.push('rgba(40, 167, 69, 0.85)');
            });

            expenseItems.forEach(item => {
                labels.push(item.name);
                values.push(item.balance);
                colors.push('rgba(220, 53, 69, 0.75)');
            });

            labels.push('Net Income');
            values.push(netIncome);
            colors.push(netIncome >= 0 ? 'rgba(40, 167, 69, 0.95)' : 'rgba(220, 53, 69, 0.95)');

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
                        borderColor: colors.map(c => c.replace('0.85', '1').replace('0.75', '1').replace('0.95', '1')),
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
                        const label = this.data.labels[idx];
                        
                        console.log('[MONTHLY-PL] Bar clicked:', label, 'Month:', month);
                        
                        if (label === 'Net Income') {
                            showMonthlyTransactions(month, null, 'All Transactions', true);
                            return;
                        }
                        
                        const foundAccount = bankAccounts.find(a => a.name === label);
                        if (foundAccount) {
                            showMonthlyTransactions(month, foundAccount.id, label, true);
                        } else {
                            showMonthlyTransactions(month, null, label, true);
                        }
                    }
                }
            });

            monthlyPLChartInstances[chartIndex] = chart;
        });

        // Pagination button event listeners
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


function renderMonthlyPLChartsPage() {
    console.log('========================================');
    console.log('[MONTHLY-PL] 📊 Rendering charts - Page', monthlyPLCurrentPage);
    console.log('========================================');
    
    const container = document.getElementById('monthly-pl-bar-chart-container');
    
    if (!container) {
        console.error('[MONTHLY-PL] ❌ Container not found!');
        return;
    }
    
    if (!monthlyPLMonths || monthlyPLMonths.length === 0) {
        console.warn('[MONTHLY-PL] ⚠️ No months data available');
        container.innerHTML = '<p style="text-align:center; padding:40px; color:#666;">No data available.</p>';
        return;
    }

    console.log(`[MONTHLY-PL] 📅 Available months: ${monthlyPLMonths.join(', ')}`);

    const startIndex = monthlyPLCurrentPage * 6;
    const endIndex = Math.min(startIndex + 6, monthlyPLMonths.length);
    const visibleMonths = monthlyPLMonths.slice(startIndex, endIndex);

    console.log(`[MONTHLY-PL] 📅 Showing months ${startIndex + 1}-${endIndex} of ${monthlyPLMonths.length}: ${visibleMonths.join(', ')}`);

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
        const items = monthlyPLAllData[month] || [];
        
        console.log(`[MONTHLY-PL] 📊 Month ${month}: ${items.length} items`);
        
        // Log rent items for this month
        const rentItems = items.filter(i => 
            i.name && (i.name.includes('Rent') || i.name.includes('rent'))
        );
        if (rentItems.length > 0) {
            console.log(`[MONTHLY-PL] 🏠 Rent items in ${month}:`, rentItems);
        }
        
        // ============================================================
        // FIXED: Exclude Prepaid Rent (code: 1055) from net income
        // ============================================================
        // For chart display: show all items including Prepaid Rent
        const displayRevenue = items.filter(i => i.balance > 0);
        const displayExpense = items.filter(i => i.balance < 0);
        
        // For net income calculation: EXCLUDE Prepaid Rent (asset account 1055)
        const revenueForNet = items.filter(i => i.balance > 0 && i.code !== '1055');
        const expenseForNet = items.filter(i => i.balance < 0);
        
        const totalRevenue = revenueForNet.reduce((sum, i) => sum + i.balance, 0);
        const totalExpenses = expenseForNet.reduce((sum, i) => sum + i.balance, 0);
        const netIncome = totalRevenue + totalExpenses;
        
        console.log(`[MONTHLY-PL] 📊 ${month} - Revenue (for net): ${totalRevenue.toFixed(2)}, Expenses: ${totalExpenses.toFixed(2)}, Net Income: ${netIncome.toFixed(2)}`);
        
        // Build chart labels with display data (includes Prepaid Rent for visual)
        const labels = [];
        const values = [];
        const colors = [];

        displayRevenue.forEach(item => {
            let label = item.name;
            if (label.length > 15) {
                label = label.substring(0, 13) + '...';
            }
            labels.push(label);
            values.push(item.balance);
            colors.push('rgba(40, 167, 69, 0.85)');
        });

        displayExpense.forEach(item => {
            let label = item.name;
            if (label.length > 15) {
                label = label.substring(0, 13) + '...';
            }
            labels.push(label);
            values.push(item.balance);
            colors.push('rgba(220, 53, 69, 0.75)');
        });

        // Add Net Income bar with CORRECTED value
        labels.push('Net Income');
        values.push(netIncome);
        colors.push(netIncome >= 0 ? 'rgba(40, 167, 69, 0.95)' : 'rgba(220, 53, 69, 0.95)');

        const chartIndex = startIndex + index;

        html += `
            <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; position: relative; min-height: 420px;">
                <div style="text-align: center; font-weight: 600; font-size: 16px; color: #000; margin-bottom: 10px;">${month}</div>
                <div style="text-align: center; font-size: 12px; color: #666; margin-bottom: 10px;">
                    Revenue: <span style="color:#28a745;font-weight:bold;">$${totalRevenue.toFixed(2)}</span> | 
                    Expenses: <span style="color:#dc3545;font-weight:bold;">$${Math.abs(totalExpenses).toFixed(2)}</span> | 
                    Net: <span style="font-weight: bold; color: ${netIncome >= 0 ? '#28a745' : '#dc3545'};">${netIncome >= 0 ? '+' : ''}$${netIncome.toFixed(2)}</span>
                    ${rentItems.length > 0 ? `| Rent: <span style="color:#dc3545;font-weight:bold;">$${Math.abs(rentItems.find(i => i.code === '6025')?.balance || 0).toFixed(2)}</span>` : ''}
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
            const items = monthlyPLAllData[month] || [];
            
            // For display: show all items
            const displayRevenue = items.filter(i => i.balance > 0);
            const displayExpense = items.filter(i => i.balance < 0);
            
            // For net income: EXCLUDE Prepaid Rent (code: 1055)
            const revenueForNet = items.filter(i => i.balance > 0 && i.code !== '1055');
            const expenseForNet = items.filter(i => i.balance < 0);
            
            const totalRevenue = revenueForNet.reduce((sum, i) => sum + i.balance, 0);
            const totalExpenses = expenseForNet.reduce((sum, i) => sum + i.balance, 0);
            const netIncome = totalRevenue + totalExpenses;

            const labels = [];
            const values = [];
            const colors = [];

            displayRevenue.forEach(item => {
                let label = item.name;
                if (label.length > 15) {
                    label = label.substring(0, 13) + '...';
                }
                labels.push(label);
                values.push(item.balance);
                colors.push('rgba(40, 167, 69, 0.85)');
            });

            displayExpense.forEach(item => {
                let label = item.name;
                if (label.length > 15) {
                    label = label.substring(0, 13) + '...';
                }
                labels.push(label);
                values.push(item.balance);
                colors.push('rgba(220, 53, 69, 0.75)');
            });

            labels.push('Net Income');
            values.push(netIncome);
            colors.push(netIncome >= 0 ? 'rgba(40, 167, 69, 0.95)' : 'rgba(220, 53, 69, 0.95)');

            const chartIndex = startIndex + index;
            const canvasId = `monthly-pl-chart-${chartIndex}`;
            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                console.warn(`[MONTHLY-PL] ⚠️ Canvas ${canvasId} not found`);
                return;
            }

            console.log(`[MONTHLY-PL] 📊 Creating chart for ${month} with ${labels.length} bars`);
            console.log(`[MONTHLY-PL] 📊 Labels:`, labels);
            console.log(`[MONTHLY-PL] 📊 Values:`, values);

            const ctx = canvas.getContext('2d');
            
            const chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Amount',
                        data: values,
                        backgroundColor: colors,
                        borderColor: colors.map(c => c.replace('0.85', '1').replace('0.75', '1').replace('0.95', '1')),
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
                                callback: function(value) {
                                    return '$' + value;
                                },
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
                        const label = this.data.labels[idx];
                        
                        console.log('[MONTHLY-PL] Bar clicked:', label, 'Month:', month);
                        
                        if (label === 'Net Income') {
                            showMonthlyTransactions(month, null, 'All Transactions', true);
                            return;
                        }
                        
                        const foundAccount = bankAccounts.find(a => a.name === label);
                        if (foundAccount) {
                            showMonthlyTransactions(month, foundAccount.id, label, true);
                        } else {
                            showMonthlyTransactions(month, null, label, true);
                        }
                    }
                }
            });

            monthlyPLChartInstances[chartIndex] = chart;
            console.log(`[MONTHLY-PL] ✅ Chart created for ${month}`);
        });

        // Pagination button event listeners
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

function showMonthlyTransactions(month, accountId, accountName, excludeOrders = false) {
    console.log('[MODAL] Showing monthly transactions:', { month, accountId, accountName });
    
    const modal = document.getElementById('monthly-tx-modal');
    const body = document.getElementById('modal-body');
    const title = document.getElementById('modal-title');
    
    if (!modal || !body || !title) {
        console.error('[MODAL] Modal elements not found');
        showToast('Error: Modal elements not found', 'error');
        return;
    }

    const [year, monthNumber] = month.split('-');
    const firstDay = new Date(parseInt(year), parseInt(monthNumber) - 1, 1);
    const lastDay = new Date(parseInt(year), parseInt(monthNumber), 0);
    
    const formatDate = function(dateValue) {
        const monthVal = String(dateValue.getMonth() + 1).padStart(2, '0');
        const dayVal = String(dateValue.getDate()).padStart(2, '0');
        const yearVal = String(dateValue.getFullYear()).slice(2);
        return monthVal + '/' + dayVal + '/' + yearVal;
    };
    
    const dateRange = formatDate(firstDay) + ' - ' + formatDate(lastDay);
    const displayName = accountName + ' - ' + dateRange;
    title.textContent = displayName;
    
    body.innerHTML = '<div style="text-align: center; padding: 30px; color: #666;">Loading transactions...</div>';
    modal.style.display = 'flex';

    let url = `${API_BASE}/api/accounting/monthly-account-transactions?month=${month}`;
    if (accountId) {
        url = url + '&account_id=' + accountId;
    }
    if (excludeOrders) {
        url = url + '&exclude_orders=true';
    }
    
    console.log('[MODAL] Fetching:', url);
    
    fetch(url, {
        credentials: 'include',
        mode: 'cors'
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success' && data.transactions) {
            renderModalTransactions(data.transactions, accountName, dateRange, accountId);
        } else {
            body.innerHTML = '<p style="color: #dc3545;">' + (data.error || 'Failed to load transactions') + '</p>';
        }
    })
    .catch(error => {
        console.error('[MODAL] Error:', error);
        body.innerHTML = '<p style="color: #dc3545;">Error: ' + error.message + '</p>';
    });
}

function renderModalTransactions(transactions, accountName, dateRange, accountId = null) {
    const body = document.getElementById('modal-body');
    if (!body) return;
    
    if (!transactions || transactions.length === 0) {
        body.innerHTML = '<p style="color: #000;">No transactions found for this period.</p>';
        return;
    }

    let filteredTransactions = transactions;
    if (accountId) {
        const account = bankAccounts.find(a => a.id == accountId);
        if (account) {
            filteredTransactions = transactions.filter(tx => tx.account_name === account.name);
        }
    }

    if (!filteredTransactions || filteredTransactions.length === 0) {
        body.innerHTML = '<p style="color: #000;">No transactions found for this account.</p>';
        return;
    }

    const isRevenueAccount = accountName &&
        (accountName.toLowerCase().includes('revenue') ||
         accountName.toLowerCase().includes('sales') ||
         accountName.toLowerCase().includes('income'));

    let total = 0;
    filteredTransactions.forEach(tx => {
        total += tx.amount || 0;
    });

    let displayTotal = isRevenueAccount ? -total : total;

    let html = `
        <div style="background: #f8f9fa; padding: 12px 16px; border-radius: 4px; margin-bottom: 15px; display: flex; gap: 20px; flex-wrap: wrap; align-items: center; color: #000;">
            <div style="color: #000;"><strong style="color: #000;">Account:</strong> ${accountName || 'All Accounts'}</div>
            <div style="color: #000;"><strong style="color: #000;">Period:</strong> ${dateRange}</div>
            <div style="color: #000;"><strong style="color: #000;">Transactions:</strong> ${filteredTransactions.length}</div>
            <div style="color: #000;"><strong style="color: #000;">Total:</strong> <span style="font-weight:bold;color:${displayTotal >= 0 ? '#28a745' : '#dc3545'};">${displayTotal >= 0 ? '+' : ''}$${displayTotal.toFixed(2)}</span></div>
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

    filteredTransactions.forEach(tx => {
        let displayAmount = tx.amount || 0;
        if (isRevenueAccount) {
            displayAmount = -tx.amount || 0;
        }
        const isPositive = displayAmount > 0;
        const sign = displayAmount > 0 ? '+' : (displayAmount < 0 ? '-' : '');
        const displayAmountStr = displayAmount !== 0 ? '$' + Math.abs(displayAmount).toFixed(2) : '';

        html += `<tr style="border-bottom:1px solid #eee; color:#000;">
            <td style="padding:8px 12px; white-space:nowrap; color:#000;">${tx.transaction_date}</td>
            <td style="padding:8px 12px; color:#000;">${tx.description || ''}</td>
            <td style="padding:8px 12px; color:#000;">${tx.account_name || ''}</td>
            <td style="padding:8px 12px; text-align:right; font-weight:600; color: ${isPositive ? '#28a745' : '#dc3545'};">${sign}${displayAmountStr}</td>
        </tr>`;
    });

    html += `<tr class="total-row" style="font-weight:bold; background:#f0f0f0; color:#000;">
        <td colspan="3" style="padding:8px 12px; color:#000;"><strong style="color:#000;">Total</strong></td>
        <td style="padding:8px 12px; text-align:right; color:${displayTotal >= 0 ? '#28a745' : '#dc3545'};">${displayTotal >= 0 ? '+' : ''}${displayTotal !== 0 ? '$' + displayTotal.toFixed(2) : ''}</td>
    </tr>`;
    html += '</tbody></table>';
    body.innerHTML = html;
}

// ============================================================
// INITIALIZATION
// ============================================================

function initAccounting() {
    console.log('[INIT] initAccounting called');
    
    const container = document.getElementById('accounting-container');
    if (!container) {
        console.error('[INIT] Container not found');
        return;
    }
    console.log('[INIT] Container found');

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
            
            // Load data for tab
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

    document.getElementById('refresh-btn')?.addEventListener('click', function() {
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
        if (e.target === this) {
            this.style.display = 'none';
        }
    });

    document.getElementById('monthly-tx-modal')?.addEventListener('click', function(e) {
        if (e.target === this) {
            this.style.display = 'none';
        }
    });

    // Load initial data
    loadAccounts().then(() => {
        loadTransactions();
    });
    
    console.log('[INIT] Initialization complete');
}

// Expose initAccounting globally so app.js can call it
window.initAccounting = initAccounting;