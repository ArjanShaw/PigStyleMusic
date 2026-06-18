// ============================================================
// admin-accounting.js – Accounting Module
// ============================================================

let journalCurrentPage = 1;
const journalPageSize = 20;
let journalTotalEntries = 0;
let currentReportData = null;

// Bank transactions pagination
let bankCurrentPage = 1;
const bankPageSize = 20;
let bankTotalEntries = 0;
let bankShowAll = false;

// Account transactions pagination
let accountTxCurrentPage = 1;
const accountTxPageSize = 20;
let accountTxTotalEntries = 0;
let currentSelectedAccountId = null;
let currentAccountBalance = 0;

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    const accountingContainer = document.getElementById('accounting-container');
    if (!accountingContainer) return;

    // Sub-tab switching
    document.querySelectorAll('#accounting-sub-tabs .sub-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const sub = this.dataset.subtab;
            document.querySelectorAll('#accounting-sub-tabs .sub-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('#accounting-container .sub-tab-content').forEach(c => c.classList.remove('active'));
            const target = document.getElementById('sub-' + sub);
            if (target) target.classList.add('active');
            
            if (sub === 'dashboard') {
                loadDashboard();
            } else if (sub === 'journal') {
                loadJournalEntries();
            } else if (sub === 'account-transactions') {
                loadAccountSelectsForTransactions();
            } else if (sub === 'reconcile') {
                loadReconciliationStatus();
            } else if (sub === 'bank') {
                loadBankTransactions();
                checkBankConnection();
                loadAccountSelectsForBank();
            } else if (sub === 'orders') {
                if (typeof window.loadOrders === 'function') {
                    window.loadOrders();
                    window.loadOrderStats();
                }
            }
        });
    });

    // Bank upload drag & drop
    const uploadArea = document.getElementById('bank-upload-area');
    const fileInput = document.getElementById('bank-file-input');
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                handleBankUpload(fileInput.files[0]);
            }
        });
        fileInput.addEventListener('change', function() {
            if (this.files.length) handleBankUpload(this.files[0]);
        });
    }

    // Pagination for journal
    document.getElementById('journal-prev')?.addEventListener('click', () => {
        if (journalCurrentPage > 1) { journalCurrentPage--; loadJournalEntries(); }
    });
    document.getElementById('journal-next')?.addEventListener('click', () => {
        const totalPages = Math.ceil(journalTotalEntries / journalPageSize);
        if (journalCurrentPage < totalPages) { journalCurrentPage++; loadJournalEntries(); }
    });

    // Pagination for bank transactions
    document.getElementById('bank-prev')?.addEventListener('click', () => {
        if (bankCurrentPage > 1) { bankCurrentPage--; loadBankTransactions(); }
    });
    document.getElementById('bank-next')?.addEventListener('click', () => {
        const totalPages = Math.ceil(bankTotalEntries / bankPageSize);
        if (bankCurrentPage < totalPages) { bankCurrentPage++; loadBankTransactions(); }
    });

    // Pagination for account transactions
    document.getElementById('account-tx-prev')?.addEventListener('click', () => {
        if (accountTxCurrentPage > 1) { accountTxCurrentPage--; loadAccountTransactions(); }
    });
    document.getElementById('account-tx-next')?.addEventListener('click', () => {
        const totalPages = Math.ceil(accountTxTotalEntries / accountTxPageSize);
        if (accountTxCurrentPage < totalPages) { accountTxCurrentPage++; loadAccountTransactions(); }
    });

    // Account transactions dropdown change
    document.getElementById('account-transactions-select')?.addEventListener('change', function() {
        accountTxCurrentPage = 1;
        loadAccountTransactions();
    });

    // Manual entry – auto‑balance check
    document.addEventListener('input', function(e) {
        if (e.target.closest('.manual-entry-row')) {
            updateManualBalance();
        }
    });

    // Load default date range for reports
    const today = new Date().toISOString().split('T')[0];
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    document.getElementById('report-date-from').value = firstDay;
    document.getElementById('report-date-to').value = today;
    document.getElementById('manual-date').value = today;
    document.getElementById('journal-date-from').value = firstDay;
    document.getElementById('journal-date-to').value = today;
    
    // Bank and Account Transactions - leave date filters empty to show all
    document.getElementById('bank-date-from').value = '';
    document.getElementById('bank-date-to').value = '';
    document.getElementById('account-tx-date-from').value = '';
    document.getElementById('account-tx-date-to').value = '';

    // Load all dropdowns
    loadAccountSelects();
    loadAccountSelectsForTransactions();
    loadAccountSelectsForBank();

    // Load dashboard by default
    loadDashboard();

    // Handle OAuth redirect from Plaid
    const urlParams = new URLSearchParams(window.location.search);
    const publicToken = urlParams.get('public_token');
    if (publicToken) {
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
                checkBankConnection();
                loadBankTransactions();
            } else {
                alert('Failed to connect bank: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(err => {
            alert('Error: ' + err.message);
        });
    }
});

// ============================================================
// DASHBOARD
// ============================================================

async function loadDashboard() {
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/dashboard`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to load dashboard');
        const data = await res.json();
        if (data.status === 'success') {
            document.getElementById('dash-revenue').textContent = '$' + data.revenue.toFixed(2);
            document.getElementById('dash-cogs').textContent = '$' + data.cogs.toFixed(2);
            document.getElementById('dash-net-profit').textContent = '$' + data.net_profit.toFixed(2);
            document.getElementById('dash-pending-sync').textContent = data.pending_sync;
            document.getElementById('dash-unreconciled').textContent = data.unreconciled;
            const container = document.getElementById('dash-recent-journal');
            if (data.recent_entries && data.recent_entries.length) {
                let html = '<table class="journal-table"><thead><tr><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th></tr></thead><tbody>';
                data.recent_entries.forEach(e => {
                    html += `<tr><td>${e.date}</td><td>${e.description}</td><td class="debit">$${e.debit_total.toFixed(2)}</td><td class="credit">$${e.credit_total.toFixed(2)}</td></tr>`;
                });
                html += '</tbody></table>';
                container.innerHTML = html;
            } else {
                container.innerHTML = '<p class="text-muted">No recent entries.</p>';
            }
        }
    } catch (err) {
        console.error('Dashboard error:', err);
    }
}

async function runAccountingSync() {
    const status = document.getElementById('sync-status');
    status.textContent = '⏳ Running sync...';
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/sync`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.status === 'success') {
            status.textContent = '✅ Synced ' + data.processed + ' orders.';
            loadDashboard();
        } else {
            status.textContent = '❌ ' + (data.error || 'Sync failed');
        }
    } catch (err) {
        status.textContent = '❌ Error: ' + err.message;
    }
}

// ============================================================
// ACCOUNT DROPDOWNS
// ============================================================

async function loadAccountSelects() {
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to load accounts');
        const data = await res.json();
        if (data.status === 'success') {
            // Manual entry account dropdowns
            const selects = document.querySelectorAll('.manual-account');
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
            
            // Journal account filter dropdown
            const journalSelect = document.getElementById('journal-account-filter');
            if (journalSelect) {
                const currentVal = journalSelect.value;
                journalSelect.innerHTML = '<option value="">All Accounts</option>';
                data.accounts.forEach(acc => {
                    const opt = document.createElement('option');
                    opt.value = acc.id;
                    opt.textContent = acc.code + ' - ' + acc.name;
                    journalSelect.appendChild(opt);
                });
                journalSelect.value = currentVal;
            }
        }
    } catch (err) {
        console.error('Error loading accounts:', err);
    }
}

async function loadAccountSelectsForTransactions() {
    const select = document.getElementById('account-transactions-select');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Loading accounts... --</option>';
    select.disabled = true;
    
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        
        select.disabled = false;
        
        if (data.status === 'success' && data.accounts && data.accounts.length > 0) {
            const currentVal = select.value;
            select.innerHTML = '<option value="">-- Select an account --</option>';
            data.accounts.forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = acc.code + ' - ' + acc.name + ' (' + acc.type + ')';
                select.appendChild(opt);
            });
            
            if (currentVal && data.accounts.some(a => a.id == currentVal)) {
                select.value = currentVal;
            } else if (data.accounts.length > 0) {
                select.value = data.accounts[0].id;
            }
            
            console.log(`✅ Loaded ${data.accounts.length} accounts into Account Transactions dropdown`);
            
            if (select.value) {
                loadAccountTransactions();
            }
        } else {
            select.innerHTML = '<option value="">-- No accounts found --</option>';
        }
    } catch (e) {
        select.disabled = false;
        select.innerHTML = '<option value="">-- Error loading accounts --</option>';
        console.error('Failed to load accounts for transactions:', e);
    }
}

async function loadAccountSelectsForBank() {
    const select = document.getElementById('bank-apply-account');
    if (!select) return;
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success' && data.accounts) {
            select.innerHTML = '<option value="">Select Account</option>';
            data.accounts.forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = acc.code + ' - ' + acc.name;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Failed to load accounts for bank apply:', e);
    }
}

// ============================================================
// JOURNAL ENTRIES
// ============================================================

async function loadJournalEntries() {
    const body = document.getElementById('journal-body');
    body.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px;">Loading...</td></tr>';

    const params = new URLSearchParams();
    params.append('page', journalCurrentPage);
    params.append('per_page', journalPageSize);
    const from = document.getElementById('journal-date-from').value;
    const to = document.getElementById('journal-date-to').value;
    if (from) params.append('date_from', from);
    if (to) params.append('date_to', to);
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
            journalTotalEntries = data.total;
            renderJournal(data.entries);
            updateJournalPagination();
        } else {
            body.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px; color:#dc3545;">' + (data.error || 'Error loading journal') + '</td></tr>';
        }
    } catch (err) {
        body.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px; color:#dc3545;">Error: ' + err.message + '</td></tr>';
    }
}

function renderJournal(entries) {
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
    document.getElementById('journal-date-from').value = '';
    document.getElementById('journal-date-to').value = '';
    document.getElementById('journal-account-filter').value = '';
    document.getElementById('journal-search').value = '';
    journalCurrentPage = 1;
    loadJournalEntries();
}

function exportJournalCSV() {
    const params = new URLSearchParams();
    params.append('page', 1);
    params.append('per_page', 9999);
    const from = document.getElementById('journal-date-from').value;
    const to = document.getElementById('journal-date-to').value;
    if (from) params.append('date_from', from);
    if (to) params.append('date_to', to);
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
    alert('View details for journal entry #' + entryId + ' (modal to be implemented)');
}

// ============================================================
// ACCOUNT TRANSACTIONS
// ============================================================

async function loadAccountTransactions() {
    const select = document.getElementById('account-transactions-select');
    const accountId = select.value;
    const body = document.getElementById('account-tx-body');
    const balanceDisplay = document.getElementById('account-balance-display');

    if (!accountId) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">Select an account to view transactions.</td></tr>';
        document.getElementById('account-tx-pagination-info').textContent = 'Showing 0 entries';
        document.getElementById('account-tx-prev').disabled = true;
        document.getElementById('account-tx-next').disabled = true;
        document.getElementById('account-tx-page-info').textContent = 'Page 1';
        balanceDisplay.innerHTML = '<span class="balance-zero">$0.00</span>';
        return;
    }

    currentSelectedAccountId = accountId;
    body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">Loading...</td></tr>';

    const params = new URLSearchParams();
    params.append('account_id', accountId);
    params.append('page', accountTxCurrentPage);
    params.append('per_page', accountTxPageSize);
    
    const from = document.getElementById('account-tx-date-from').value;
    const to = document.getElementById('account-tx-date-to').value;
    if (from) params.append('date_from', from);
    if (to) params.append('date_to', to);

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/account-transactions?${params.toString()}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to load account transactions');
        const data = await res.json();
        if (data.status === 'success') {
            accountTxTotalEntries = data.total || 0;
            currentAccountBalance = data.balance || 0;
            renderAccountTransactions(data.transactions || []);
            updateAccountTxPagination();
            updateAccountBalanceDisplay(currentAccountBalance);
        } else {
            body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#dc3545;">' + (data.error || 'Error loading transactions') + '</td></tr>';
        }
    } catch (err) {
        console.error('Error loading account transactions:', err);
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#dc3545;">Error: ' + err.message + '</td></tr>';
    }
}

function renderAccountTransactions(transactions) {
    const body = document.getElementById('account-tx-body');
    if (!transactions || transactions.length === 0) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">No transactions found for this account.</td></tr>';
        return;
    }
    let html = '';
    transactions.forEach(tx => {
        const debitAmount = parseFloat(tx.debit_amount) || 0;
        const creditAmount = parseFloat(tx.credit_amount) || 0;
        
        let displayDebit = '';
        let displayCredit = '';
        
        if (debitAmount > 0) {
            displayDebit = '$' + debitAmount.toFixed(2);
        }
        if (creditAmount > 0) {
            displayCredit = '$' + creditAmount.toFixed(2);
        }
        
        if (debitAmount === 0 && creditAmount === 0) {
            return;
        }
        
        const description = tx.journal_description || tx.description || '';
        const sourceType = tx.source_type || '';
        const sourceId = tx.source_id || '';
        const entryId = tx.journal_entry_id || tx.id || '';
        const date = tx.transaction_date || '';
        
        html += `<tr>
            <td>${entryId}</td>
            <td>${date}</td>
            <td>${description}</td>
            <td class="debit">${displayDebit}</td>
            <td class="credit">${displayCredit}</td>
            <td>${sourceType}: ${sourceId}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteAccountTransaction(${entryId})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    
    if (!html) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">No valid transactions to display.</td></tr>';
    } else {
        body.innerHTML = html;
    }
}

function updateAccountTxPagination() {
    const totalPages = Math.max(1, Math.ceil(accountTxTotalEntries / accountTxPageSize));
    document.getElementById('account-tx-pagination-info').textContent = `Showing ${accountTxTotalEntries} entries (Page ${accountTxCurrentPage} of ${totalPages})`;
    document.getElementById('account-tx-prev').disabled = accountTxCurrentPage <= 1;
    document.getElementById('account-tx-next').disabled = accountTxCurrentPage >= totalPages;
    document.getElementById('account-tx-page-info').textContent = `Page ${accountTxCurrentPage}`;
}

function updateAccountBalanceDisplay(balance) {
    const display = document.getElementById('account-balance-display');
    const formatted = '$' + Math.abs(balance).toFixed(2);
    let className = 'balance-zero';
    if (balance > 0) className = 'balance-positive';
    else if (balance < 0) className = 'balance-negative';
    display.innerHTML = `<span class="${className}">${formatted}</span>`;
}

function resetAccountTxFilters() {
    document.getElementById('account-tx-date-from').value = '';
    document.getElementById('account-tx-date-to').value = '';
    accountTxCurrentPage = 1;
    loadAccountTransactions();
}

function exportAccountTransactionsCSV() {
    if (!currentSelectedAccountId) {
        alert('Please select an account first.');
        return;
    }

    const params = new URLSearchParams();
    params.append('account_id', currentSelectedAccountId);
    params.append('page', 1);
    params.append('per_page', 9999);
    const from = document.getElementById('account-tx-date-from').value;
    const to = document.getElementById('account-tx-date-to').value;
    if (from) params.append('date_from', from);
    if (to) params.append('date_to', to);

    fetch(`${AppConfig.baseUrl}/api/accounting/account-transactions?${params.toString()}`, {
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success' && data.transactions) {
            let csv = 'Date,Description,Debit,Credit,Source\n';
            data.transactions.forEach(tx => {
                csv += `${tx.transaction_date || tx.date || ''},"${(tx.description || tx.journal_description || '').replace(/"/g,'""')}",${tx.debit_amount || 0},${tx.credit_amount || 0},${tx.source_type || ''}\n`;
            });
            csv += `\nAccount Balance,${data.balance || 0}\n`;
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'account_transactions.csv';
            a.click();
            window.URL.revokeObjectURL(url);
        }
    }).catch(console.error);
}

// ============================================================
// DELETE ACCOUNT TRANSACTION
// ============================================================

async function deleteAccountTransaction(entryId) {
    if (!entryId) {
        alert('Invalid transaction ID');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete journal entry #${entryId}? This will remove all lines associated with this entry.`)) {
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
            alert('Transaction deleted successfully');
            loadAccountTransactions();
            loadDashboard();
        } else {
            alert('Error: ' + (data.error || 'Failed to delete transaction'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ============================================================
// MANUAL ADJUSTMENTS
// ============================================================

function addManualLine() {
    const container = document.getElementById('manual-lines-container');
    const row = document.createElement('div');
    row.className = 'manual-entry-row';
    row.innerHTML = `
        <select class="manual-account"><option value="">Select Account</option></select>
        <input type="number" class="manual-debit" placeholder="Debit" step="0.01" min="0">
        <input type="number" class="manual-credit" placeholder="Credit" step="0.01" min="0">
        <button class="btn btn-danger btn-sm" onclick="removeManualLine(this)"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(row);
    const accountsSelect = row.querySelector('.manual-account');
    const template = document.querySelector('.manual-account');
    if (template) {
        accountsSelect.innerHTML = template.innerHTML;
    }
    updateManualBalance();
}

function removeManualLine(btn) {
    const row = btn.closest('.manual-entry-row');
    if (document.querySelectorAll('.manual-entry-row').length > 1) {
        row.remove();
        updateManualBalance();
    } else {
        alert('At least one line is required.');
    }
}

function updateManualBalance() {
    let totalDebit = 0, totalCredit = 0;
    document.querySelectorAll('.manual-entry-row').forEach(row => {
        const d = parseFloat(row.querySelector('.manual-debit').value) || 0;
        const c = parseFloat(row.querySelector('.manual-credit').value) || 0;
        totalDebit += d;
        totalCredit += c;
    });
    const balanceDiv = document.getElementById('manual-balance');
    const diff = totalDebit - totalCredit;
    if (Math.abs(diff) < 0.001) {
        balanceDiv.className = 'balance-indicator balanced';
        balanceDiv.innerHTML = `✅ Balanced: Debits $${totalDebit.toFixed(2)}, Credits $${totalCredit.toFixed(2)}`;
    } else {
        balanceDiv.className = 'balance-indicator unbalanced';
        balanceDiv.innerHTML = `⚠️ Unbalanced: Debits $${totalDebit.toFixed(2)}, Credits $${totalCredit.toFixed(2)} (Difference: $${Math.abs(diff).toFixed(2)})`;
    }
}

async function submitManualEntry() {
    const date = document.getElementById('manual-date').value;
    const description = document.getElementById('manual-description').value.trim();
    if (!date || !description) {
        alert('Date and Description are required.');
        return;
    }
    const lines = [];
    let totalDebit = 0, totalCredit = 0;
    document.querySelectorAll('.manual-entry-row').forEach(row => {
        const account = row.querySelector('.manual-account').value;
        const debit = parseFloat(row.querySelector('.manual-debit').value) || 0;
        const credit = parseFloat(row.querySelector('.manual-credit').value) || 0;
        if (account && (debit > 0 || credit > 0)) {
            lines.push({ account_id: parseInt(account), debit, credit });
            totalDebit += debit;
            totalCredit += credit;
        }
    });
    if (lines.length === 0) {
        alert('At least one valid line is required.');
        return;
    }
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
        alert('Debits and Credits must balance.');
        return;
    }

    const status = document.getElementById('manual-status');
    status.textContent = '⏳ Posting...';
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/manual`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, description, lines })
        });
        const data = await res.json();
        if (data.status === 'success') {
            status.textContent = '✅ Entry posted (ID: ' + data.entry_id + ')';
            document.getElementById('manual-description').value = '';
            document.querySelectorAll('.manual-entry-row').forEach((row, idx) => {
                if (idx > 0) row.remove();
                else {
                    row.querySelector('.manual-account').value = '';
                    row.querySelector('.manual-debit').value = '';
                    row.querySelector('.manual-credit').value = '';
                }
            });
            updateManualBalance();
            loadDashboard();
        } else {
            status.textContent = '❌ ' + (data.error || 'Failed to post');
        }
    } catch (err) {
        status.textContent = '❌ Error: ' + err.message;
    }
}

// ============================================================
// RECONCILIATION
// ============================================================

function handleBankUpload(file) {
    const status = document.getElementById('upload-status');
    status.textContent = '⏳ Uploading and parsing...';
    const reader = new FileReader();
    reader.onload = async function(e) {
        const csv = e.target.result;
        let rows;
        if (typeof Papa !== 'undefined') {
            const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
            rows = parsed.data;
        } else {
            const lines = csv.split('\n').filter(l => l.trim());
            const headers = lines[0].split(',').map(h => h.trim());
            rows = lines.slice(1).map(line => {
                const vals = line.split(',').map(v => v.trim());
                const obj = {};
                headers.forEach((h, i) => obj[h] = vals[i] || '');
                return obj;
            });
        }
        try {
            const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/upload`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bank_account_id: parseInt(document.getElementById('reconcile-bank-account').value),
                    transactions: rows
                })
            });
            const data = await res.json();
            if (data.status === 'success') {
                status.textContent = '✅ Uploaded ' + data.inserted + ' transactions.';
                loadReconciliationStatus();
            } else {
                status.textContent = '❌ ' + (data.error || 'Upload failed');
            }
        } catch (err) {
            status.textContent = '❌ Error: ' + err.message;
        }
    };
    reader.readAsText(file);
}

async function loadReconciliationStatus() {
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/status`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to load reconciliation status');
        const data = await res.json();
        if (data.status === 'success') {
            renderExpectedPayments(data.expected);
            renderBankDeposits(data.deposits);
            renderUnmatched(data.unmatched);
        }
    } catch (err) {
        console.error('Reconciliation load error:', err);
    }
}

function renderExpectedPayments(payments) {
    const container = document.getElementById('expected-payments-list');
    if (!payments || payments.length === 0) {
        container.innerHTML = '<p class="text-muted">No expected payments found.</p>';
        return;
    }
    let html = '';
    payments.forEach(p => {
        html += `<div class="match-row">
            <span>Order ${p.order_id} – ${p.date}</span>
            <span class="amount">$${parseFloat(p.amount).toFixed(2)}</span>
            <span>${p.status}</span>
        </div>`;
    });
    container.innerHTML = html;
}

function renderBankDeposits(deposits) {
    const container = document.getElementById('bank-deposits-list');
    if (!deposits || deposits.length === 0) {
        container.innerHTML = '<p class="text-muted">No bank deposits loaded.</p>';
        return;
    }
    let html = '';
    deposits.forEach(d => {
        html += `<div class="match-row">
            <span>${d.date} – ${d.description || 'Deposit'}</span>
            <span class="amount">$${parseFloat(d.amount).toFixed(2)}</span>
            <span>${d.matched ? '✅ Matched' : '⚠️ Unmatched'}</span>
        </div>`;
    });
    container.innerHTML = html;
}

function renderUnmatched(unmatched) {
    const container = document.getElementById('unmatched-list');
    if (!unmatched || unmatched.length === 0) {
        container.innerHTML = '<p class="text-muted">All matched!</p>';
        return;
    }
    let html = '<table class="journal-table"><thead><tr><th>Type</th><th>Date</th><th>Amount</th><th>Action</th></tr></thead><tbody>';
    unmatched.forEach(u => {
        html += `<tr>
            <td>${u.type}</td>
            <td>${u.date}</td>
            <td>$${parseFloat(u.amount).toFixed(2)}</td>
            <td><button class="btn btn-sm btn-warning" onclick="manualMatch(${u.id})">Match</button></td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

async function runAutoMatch() {
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/auto-match`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert('Auto‑match complete: ' + data.matched + ' matches found.');
            loadReconciliationStatus();
        } else {
            alert('Error: ' + (data.error || 'Auto‑match failed'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function manualMatch(id) {
    alert('Manual match for ID ' + id + ' (to be implemented with a modal)');
}

// ============================================================
// REPORTS
// ============================================================

async function runReport() {
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
            currentReportData = data;
            renderReport(data, reportType);
        } else {
            container.innerHTML = '<p class="text-muted" style="color:#dc3545;">' + (data.error || 'Error generating report') + '</p>';
        }
    } catch (err) {
        container.innerHTML = '<p class="text-muted" style="color:#dc3545;">Error: ' + err.message + '</p>';
    }
}

function renderReport(data, type) {
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
        html += `<div style="margin-top:15px; background:#f0f0f0; padding:10px; border-radius:4px; color:#333;" class="summary-text">
            <strong>Summary:</strong> ${data.summary}
        </div>`;
    }
    container.innerHTML = html;
}

function exportReportCSV() {
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
// BANK TRANSACTIONS
// ============================================================

async function checkBankConnection() {
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/plaid/status`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        const statusEl = document.getElementById('bank-connection-status');
        const connectBtn = document.getElementById('connect-bank-btn');
        if (data.connected) {
            statusEl.innerHTML = '✅ Connected';
            connectBtn.style.display = 'none';
        } else {
            statusEl.innerHTML = '⚠️ Not connected';
            connectBtn.style.display = 'inline-block';
        }
    } catch (e) {
        console.error('Failed to check bank connection:', e);
    }
}

async function connectBank() {
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/plaid/create-link-token`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!data.link_token) {
            alert('Failed to get link token: ' + (data.error || 'Unknown error'));
            return;
        }
        const linkToken = data.link_token;
        const handler = Plaid.create({
            token: linkToken,
            isOAuth: true,
            onSuccess: async (public_token, metadata) => {
                const exchangeRes = await fetch(`${AppConfig.baseUrl}/api/plaid/exchange`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ public_token })
                });
                const exchangeData = await exchangeRes.json();
                if (exchangeData.status === 'success') {
                    alert('Bank connected successfully!');
                    checkBankConnection();
                    loadBankTransactions();
                } else {
                    alert('Failed to connect bank: ' + (exchangeData.error || 'Unknown error'));
                }
            },
            onExit: (err, metadata) => {
                if (err) {
                    alert('Error: ' + (err.display_message || err.error_message || 'Unknown error'));
                }
            }
        });
        handler.open();
    } catch (e) {
        alert('Failed to initiate bank connection: ' + e.message);
    }
}

function toggleBankShowAll() {
    bankShowAll = document.getElementById('bank-show-all').checked;
    bankCurrentPage = 1;
    loadBankTransactions();
}

async function loadBankTransactions() {
    const body = document.getElementById('bank-body');
    body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">Loading...</td></tr>';

    const params = new URLSearchParams();
    params.append('page', bankCurrentPage);
    params.append('per_page', bankPageSize);
    
    // Only add date filters if they have values
    const from = document.getElementById('bank-date-from').value;
    const to = document.getElementById('bank-date-to').value;
    if (from) params.append('date_from', from);
    if (to) params.append('date_to', to);
    
    const filter = document.getElementById('bank-filter').value.trim();
    if (filter) params.append('search', filter);
    
    // Add processed filter - only show unprocessed by default
    if (!bankShowAll) {
        params.append('processed', 'false');
    }

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/bank-transactions?${params.toString()}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to load bank transactions');
        const data = await res.json();
        if (data.status === 'success') {
            bankTotalEntries = data.total || data.transactions?.length || 0;
            renderBankTransactions(data.transactions || []);
            updateBankPagination();
            updateBankCounts(data);
        } else {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">' + (data.error || 'Error loading transactions') + '</td></tr>';
        }
    } catch (err) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">Error: ' + err.message + '</td></tr>';
    }
}

function renderBankTransactions(transactions) {
    const body = document.getElementById('bank-body');
    if (!transactions || transactions.length === 0) {
        if (!bankShowAll) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">🎉 All transactions have been processed! Check "Show all transactions" to view them.</td></tr>';
        } else {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">No transactions found.</td></tr>';
        }
        return;
    }
    let html = '';
    transactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        const isDebit = amount < 0;
        const formattedAmount = (isDebit ? '-' : '') + '$' + Math.abs(amount).toFixed(2);
        const status = t.processed ? '✅ Processed' : '⏳ Pending';
        const statusClass = t.processed ? 'active' : 'warning';
        const category = t.category || '';
        html += `<tr>
            <td>${t.date || ''}</td>
            <td>${t.description || ''}</td>
            <td style="color: ${isDebit ? '#dc3545' : '#28a745'}; font-weight: 600;">${formattedAmount}</td>
            <td>${category}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
        </tr>`;
    });
    body.innerHTML = html;
}

function updateBankCounts(data) {
    const unprocessedCount = document.getElementById('bank-unprocessed-count');
    const totalCount = document.getElementById('bank-total-count');
    if (data.unprocessed_count !== undefined) {
        unprocessedCount.textContent = data.unprocessed_count;
    }
    if (data.total_count !== undefined) {
        totalCount.textContent = `(${data.total_count} total)`;
    }
}

function updateBankPagination() {
    const totalPages = Math.max(1, Math.ceil(bankTotalEntries / bankPageSize));
    document.getElementById('bank-pagination-info').textContent = `Showing ${bankTotalEntries} entries (Page ${bankCurrentPage} of ${totalPages})`;
    document.getElementById('bank-prev').disabled = bankCurrentPage <= 1;
    document.getElementById('bank-next').disabled = bankCurrentPage >= totalPages;
    document.getElementById('bank-page-info').textContent = `Page ${bankCurrentPage}`;
}

function resetBankFilters() {
    document.getElementById('bank-date-from').value = '';
    document.getElementById('bank-date-to').value = '';
    document.getElementById('bank-filter').value = '';
    bankCurrentPage = 1;
    loadBankTransactions();
}

async function syncBankTransactions() {
    const status = document.getElementById('bank-sync-status');
    status.textContent = '⏳ Syncing...';
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/bank/sync`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.status === 'success') {
            status.textContent = '✅ Sync triggered. Refreshing...';
            loadBankTransactions();
        } else {
            status.textContent = '❌ ' + (data.error || 'Sync failed');
        }
    } catch (err) {
        status.textContent = '❌ Error: ' + err.message;
    }
}

// ============================================================
// INTEGRATED FILTER-APPLY
// ============================================================

async function applyFilterToTransactions() {
    const filterInput = document.getElementById('bank-filter');
    const accountSelect = document.getElementById('bank-apply-account');
    const statusSpan = document.getElementById('filter-apply-status');

    const pattern = filterInput.value.trim();
    const accountId = parseInt(accountSelect.value);

    if (!pattern) {
        alert('Please enter a filter pattern (e.g. STAMPS.COM).');
        return;
    }
    if (!accountId) {
        alert('Please select an account to apply.');
        return;
    }

    statusSpan.textContent = '⏳ Fetching transactions...';
    try {
        const params = new URLSearchParams();
        params.append('per_page', 9999);
        params.append('search', pattern);
        // Only get unprocessed transactions
        params.append('processed', 'false');
        const from = document.getElementById('bank-date-from').value;
        const to = document.getElementById('bank-date-to').value;
        if (from) params.append('date_from', from);
        if (to) params.append('date_to', to);
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/bank-transactions?${params.toString()}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status !== 'success') {
            statusSpan.textContent = '❌ Failed to fetch transactions: ' + (data.error || 'Unknown');
            return;
        }
        const transactions = data.transactions || [];
        if (transactions.length === 0) {
            statusSpan.textContent = 'ℹ️ No unprocessed transactions found matching the filter.';
            return;
        }

        const confirmMsg = `Found ${transactions.length} unprocessed transaction(s) matching "${pattern}". Apply them to account "${accountSelect.options[accountSelect.selectedIndex].text}"?`;
        if (!confirm(confirmMsg)) {
            statusSpan.textContent = '⏹️ Cancelled.';
            return;
        }

        statusSpan.textContent = '⏳ Applying...';
        const applyRes = await fetch(`${AppConfig.baseUrl}/api/accounting/bank/apply-filter`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transactions: transactions.map(t => ({
                    id: t.id,
                    date: t.date,
                    amount: t.amount,
                    description: t.description
                })),
                account_id: accountId
            })
        });
        const applyData = await applyRes.json();
        if (applyData.status === 'success') {
            statusSpan.textContent = `✅ ${applyData.message}`;
            loadBankTransactions();
        } else {
            statusSpan.textContent = '❌ Error: ' + (applyData.error || 'Failed');
        }
    } catch (e) {
        statusSpan.textContent = '❌ Error: ' + e.message;
    }
}