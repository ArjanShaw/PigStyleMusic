// ============================================================
// admin-accounting.js – Accounting Module (final)
// ============================================================

let journalCurrentPage = 1;
const journalPageSize = 20;
let journalTotalEntries = 0;
let currentReportData = null;

// Account Transactions pagination
let accountTxCurrentPage = 1;
const accountTxPageSize = 20;
let accountTxTotalEntries = 0;

// Global list of accounts for bank dropdowns
let bankAccounts = [];

// Chart instances
let plChartInstance = null;
let cashFlowChartInstance = null;
let expandedChartInstance = null;
let isExpanded = false;

// Chart data cache
let plChartData = null;
let cashFlowChartData = null;

// Account name to ID mapping
let accountNameToId = {};

// Color palette for charts
const COLORS = {
    revenue: 'rgba(40, 167, 69, 0.8)',
    revenueBorder: '#28a745',
    expense: 'rgba(220, 53, 69, 0.8)',
    expenseBorder: '#dc3545',
    netIncome: 'rgba(111, 66, 193, 0.9)',
    netIncomeBorder: '#6f42c1',
    other: 'rgba(0, 123, 255, 0.7)',
    otherBorder: '#007bff',
};

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
            
            if (sub === 'journal') loadJournalEntries();
            else if (sub === 'account-transactions') {
                loadAccountTransactionsSelect();
            }
            else if (sub === 'reconcile') loadReconciliationStatus();
            else if (sub === 'bank') {
                loadBankTransactions();
                checkBankConnection();
                loadAccountSelectsForBank();
                loadBankAccountsForRowDropdowns();
                loadBulkDestinationAccounts();
            }
            else if (sub === 'accounts') {
                loadAccountsList();
            }
            else if (sub === 'cash-flow') {
                console.log('[INIT] Cash Flow tab selected');
                const now = new Date();
                const endMonth = now.toISOString().slice(0, 7);
                const endInput = document.getElementById('cash-flow-end');
                if (!endInput.value) endInput.value = endMonth;

                fetch(`${AppConfig.baseUrl}/api/accounting/earliest-transaction`, {
                    credentials: 'include',
                    headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success' && data.earliest) {
                        const earliestDate = new Date(data.earliest);
                        const startMonth = earliestDate.toISOString().slice(0, 7);
                        const startInput = document.getElementById('cash-flow-start');
                        if (!startInput.value) startInput.value = startMonth;
                    }
                    loadCashFlow();
                })
                .catch(err => {
                    console.error('[INIT] Failed to fetch earliest transaction:', err);
                    loadCashFlow();
                });
            }
            else if (sub === 'monthly-pl') {
                console.log('[INIT] Monthly P&L tab selected');
                const now = new Date();
                const endMonth = now.toISOString().slice(0, 7);
                const endInput = document.getElementById('pl-end');
                if (!endInput.value) endInput.value = endMonth;
                const startInput = document.getElementById('pl-start');
                if (!startInput.value) {
                    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                    startInput.value = startDate.toISOString().slice(0, 7);
                }
                loadMonthlyPL();
            }
            else if (sub === 'orders') {
                if (typeof window.loadOrders === 'function') {
                    window.loadOrders();
                    window.loadOrderStats();
                }
            }
            else if (sub === 'reports') {
                // nothing to auto-load, user must click generate
            }
        });
    });

    // AUTO‑LOAD when dropdown changes
    document.getElementById('account-transactions-select')?.addEventListener('change', function() {
        accountTxCurrentPage = 1;
        const accountId = this.value;
        if (accountId) {
            updateAccountDateRange(accountId);
        } else {
            loadAccountTransactions();
        }
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

    // Pagination for account transactions
    document.getElementById('account-tx-prev')?.addEventListener('click', () => {
        if (accountTxCurrentPage > 1) { accountTxCurrentPage--; loadAccountTransactions(); }
    });
    document.getElementById('account-tx-next')?.addEventListener('click', () => {
        const totalPages = Math.ceil(accountTxTotalEntries / accountTxPageSize);
        if (accountTxCurrentPage < totalPages) { accountTxCurrentPage++; loadAccountTransactions(); }
    });

    // Manual entry – auto‑balance check
    document.addEventListener('input', function(e) {
        if (e.target.closest('.manual-entry-row')) {
            updateManualBalance();
        }
    });

    // Load accounts into dropdowns
    loadAccountSelects();

    // Load default date range for reports and account transactions
    const today = new Date().toISOString().split('T')[0];
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    document.getElementById('report-date-from').value = firstDay;
    document.getElementById('report-date-to').value = today;
    document.getElementById('manual-date').value = today;

    // Load journal by default
    loadJournalEntries();

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

    // Bank view filter change
    document.getElementById('bank-view-filter')?.addEventListener('change', function() {
        console.log('[INIT] Bank view filter changed');
        loadBankTransactions();
    });

    // Bank source filter change
    document.getElementById('bank-source-filter')?.addEventListener('change', function() {
        console.log('[INIT] Bank source filter changed');
        loadBankTransactions();
    });

    // Bank search filter - auto-search on input
    document.getElementById('bank-filter')?.addEventListener('input', function() {
        console.log('[INIT] Bank search filter changed');
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

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                console.log('[INIT] Modal overlay clicked, closing');
                this.classList.remove('active');
            }
        });
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

async function loadAccountSelectsForBank() {
    console.log('[BANK] Loading account selects for bank');
    const select = document.getElementById('bank-destination-account');
    if (!select) return;
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[BANK] Loaded', data.accounts.length, 'accounts for bank');
            const currentVal = select.value;
            select.innerHTML = '<option value="">Select Destination</option>';
            data.accounts.forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = acc.code + ' - ' + acc.name;
                select.appendChild(opt);
            });
            select.value = currentVal;
        }
    } catch (e) {
        console.error('[BANK] Failed to load accounts for bank:', e);
    }
}

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
            // Build accountNameToId mapping for cash flow
            accountNameToId = {};
            bankAccounts.forEach(acc => {
                const trimmed = acc.name.trim();
                const norm = trimmed.toLowerCase();
                accountNameToId[norm] = acc.id;
                accountNameToId[trimmed] = acc.id;
            });
            console.log('[BANK] Loaded', bankAccounts.length, 'accounts for row dropdowns');
        }
        return data;
    } catch (e) {
        console.error('[BANK] Failed to load accounts for row dropdowns:', e);
        throw e;
    }
}

async function loadBulkDestinationAccounts() {
    console.log('[BANK] Loading bulk destination accounts');
    const select = document.getElementById('bank-bulk-destination');
    if (!select) return;
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[BANK] Loaded', data.accounts.length, 'accounts for bulk destination');
            const currentVal = select.value;
            select.innerHTML = '<option value="">Bulk Set Destination</option>';
            data.accounts.forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = acc.code + ' - ' + acc.name;
                select.appendChild(opt);
            });
            select.value = currentVal;
        }
    } catch (e) {
        console.error('[BANK] Failed to load bulk destination accounts:', e);
    }
}

// ============================================================
// ACCOUNT TRANSACTIONS – with dynamic date range
// ============================================================

async function loadAccountTransactionsSelect() {
    console.log('[ACCOUNT-TX] Loading account transactions select');
    const select = document.getElementById('account-transactions-select');
    if (!select) return;
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[ACCOUNT-TX] Loaded', data.accounts.length, 'accounts');
            select.innerHTML = '<option value="">-- Select an account --</option>';
            data.accounts.forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = acc.code + ' - ' + acc.name;
                select.appendChild(opt);
            });
            if (data.accounts.length > 0) {
                const firstAccount = data.accounts[0];
                select.value = firstAccount.id;
                await updateAccountDateRange(firstAccount.id);
            }
        }
    } catch (e) {
        console.error('[ACCOUNT-TX] Failed to load accounts for account transactions:', e);
    }
}

async function updateAccountDateRange(accountId) {
    console.log('[ACCOUNT-TX] Updating date range for account:', accountId);
    const fromInput = document.getElementById('account-tx-date-from');
    const toInput = document.getElementById('account-tx-date-to');
    const today = new Date().toISOString().split('T')[0];

    try {
        const res = await fetch(
            `${AppConfig.baseUrl}/api/accounting/account-date-range?account_id=${accountId}`,
            { credentials: 'include', headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {} }
        );
        const data = await res.json();
        if (data.status === 'success' && data.min_date && data.max_date) {
            console.log('[ACCOUNT-TX] Date range:', data.min_date, 'to', data.max_date);
            fromInput.value = data.min_date;
            toInput.value = data.max_date;
        } else {
            console.log('[ACCOUNT-TX] No transactions found, using fallback dates');
            fromInput.value = '2026-02-01';
            toInput.value = today;
        }
    } catch (e) {
        console.error('[ACCOUNT-TX] Failed to fetch account date range:', e);
        fromInput.value = '2026-02-01';
        toInput.value = today;
    }
    await loadAccountTransactions();
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
// MANUAL ADJUSTMENTS
// ============================================================

function addManualLine() {
    console.log('[MANUAL] Adding line');
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
    console.log('[MANUAL] Removing line');
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
    console.log('[MANUAL] Submitting manual entry');
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
        console.log('[MANUAL] Posting entry with', lines.length, 'lines');
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/manual`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, description, lines })
        });
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[MANUAL] Entry posted, ID:', data.entry_id);
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
        } else {
            console.error('[MANUAL] Error posting:', data.error);
            status.textContent = '❌ ' + (data.error || 'Failed to post');
        }
    } catch (err) {
        console.error('[MANUAL] Error:', err);
        status.textContent = '❌ Error: ' + err.message;
    }
}

// ============================================================
// RECONCILIATION
// ============================================================

function handleBankUpload(file) {
    console.log('[RECONCILE] Uploading file:', file.name);
    const status = document.getElementById('upload-status');
    status.textContent = '⏳ Uploading and parsing...';
    const reader = new FileReader();
    reader.onload = async function(e) {
        const csv = e.target.result;
        let rows;
        if (typeof Papa !== 'undefined') {
            const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
            rows = parsed.data;
            console.log('[RECONCILE] Parsed', rows.length, 'rows with Papa');
        } else {
            const lines = csv.split('\n').filter(l => l.trim());
            const headers = lines[0].split(',').map(h => h.trim());
            rows = lines.slice(1).map(line => {
                const vals = line.split(',').map(v => v.trim());
                const obj = {};
                headers.forEach((h, i) => obj[h] = vals[i] || '');
                return obj;
            });
            console.log('[RECONCILE] Parsed', rows.length, 'rows manually');
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
                console.log('[RECONCILE] Uploaded', data.inserted, 'transactions');
                status.textContent = '✅ Uploaded ' + data.inserted + ' transactions.';
                loadReconciliationStatus();
            } else {
                console.error('[RECONCILE] Upload error:', data.error);
                status.textContent = '❌ ' + (data.error || 'Upload failed');
            }
        } catch (err) {
            console.error('[RECONCILE] Error:', err);
            status.textContent = '❌ Error: ' + err.message;
        }
    };
    reader.readAsText(file);
}

async function loadReconciliationStatus() {
    console.log('[RECONCILE] Loading reconciliation status');
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/status`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to load reconciliation status');
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[RECONCILE] Status loaded');
            renderExpectedPayments(data.expected);
            renderBankDeposits(data.deposits);
            renderUnmatched(data.unmatched);
        }
    } catch (err) {
        console.error('[RECONCILE] Error:', err);
    }
}

function renderExpectedPayments(payments) {
    console.log('[RECONCILE] Rendering', payments.length, 'expected payments');
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
    console.log('[RECONCILE] Rendering', deposits.length, 'bank deposits');
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
    console.log('[RECONCILE] Rendering', unmatched.length, 'unmatched');
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
    console.log('[RECONCILE] Running auto-match');
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/reconcile/auto-match`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[RECONCILE] Auto-match complete:', data.matched, 'matches');
            alert('Auto‑match complete: ' + data.matched + ' matches found.');
            loadReconciliationStatus();
        } else {
            console.error('[RECONCILE] Auto-match error:', data.error);
            alert('Error: ' + (data.error || 'Auto‑match failed'));
        }
    } catch (err) {
        console.error('[RECONCILE] Error:', err);
        alert('Error: ' + err.message);
    }
}

function manualMatch(id) {
    console.log('[RECONCILE] Manual match for ID:', id);
    alert('Manual match for ID ' + id + ' (to be implemented with a modal)');
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
        html += `<div style="margin-top:15px; background:#f0f0f0; padding:10px; border-radius:4px; color:#333;" class="summary-text">
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
// BANK TRANSACTIONS – WITH BULK DESTINATION
// ============================================================

async function checkBankConnection() {
    console.log('[BANK] Checking bank connection');
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/plaid/status`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        const statusEl = document.getElementById('bank-connection-status');
        const connectBtn = document.getElementById('connect-bank-btn');
        if (data.connected) {
            console.log('[BANK] Connected');
            statusEl.innerHTML = '✅ Connected';
            connectBtn.style.display = 'none';
        } else {
            console.log('[BANK] Not connected');
            statusEl.innerHTML = '⚠️ Not connected';
            connectBtn.style.display = 'inline-block';
        }
    } catch (e) {
        console.error('[BANK] Failed to check bank connection:', e);
    }
}

async function connectBank() {
    console.log('[BANK] Connecting bank');
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
        console.log('[BANK] Got link token');
        const handler = Plaid.create({
            token: linkToken,
            isOAuth: true,
            onSuccess: async (public_token, metadata) => {
                console.log('[BANK] Plaid success');
                const exchangeRes = await fetch(`${AppConfig.baseUrl}/api/plaid/exchange`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ public_token })
                });
                const exchangeData = await exchangeRes.json();
                if (exchangeData.status === 'success') {
                    console.log('[BANK] Exchange success');
                    alert('Bank connected successfully!');
                    checkBankConnection();
                    loadBankTransactions();
                } else {
                    console.error('[BANK] Exchange error:', exchangeData.error);
                    alert('Failed to connect bank: ' + (exchangeData.error || 'Unknown error'));
                }
            },
            onExit: (err, metadata) => {
                if (err) {
                    console.error('[BANK] Plaid exit error:', err);
                    alert('Error: ' + (err.display_message || err.error_message || 'Unknown error'));
                }
            }
        });
        handler.open();
    } catch (e) {
        console.error('[BANK] Error:', e);
        alert('Failed to initiate bank connection: ' + e.message);
    }
}

async function loadBankTransactions() {
    console.log('[BANK] Loading bank transactions');
    const body = document.getElementById('bank-body');
    body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">Loading...</td></tr>';

    const params = new URLSearchParams();
    params.append('page', 1);
    params.append('per_page', 999999);
    
    const filter = document.getElementById('bank-filter').value.trim();
    if (filter) params.append('search', filter);

    const viewFilter = document.getElementById('bank-view-filter')?.value || 'unposted';
    if (viewFilter === 'unposted') {
        params.append('unprocessed_only', 'true');
    } else if (viewFilter === 'posted') {
        params.append('unprocessed_only', 'false');
    }

    const sourceFilter = document.getElementById('bank-source-filter')?.value || 'plaid';
    if (sourceFilter !== 'all') {
        params.append('source_type', sourceFilter);
    }

    if (bankAccounts.length === 0) {
        await loadBankAccountsForRowDropdowns();
    }

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/bank-transactions?${params.toString()}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to load bank transactions');
        const data = await res.json();
        if (data.status === 'success') {
            let transactions = data.transactions || [];
            
            if (viewFilter === 'posted') {
                transactions = transactions.filter(t => t.processed === true);
            }
            
            console.log('[BANK] Loaded', transactions.length, 'transactions');
            renderBankTransactions(transactions);
            const total = data.total_count || transactions.length;
            const unprocessed = data.unprocessed_count || 0;
            updateBankCounts(unprocessed, total);
            document.getElementById('bank-pagination-info').textContent = `Showing ${transactions.length} entries (${total} total)`;
        } else {
            console.error('[BANK] Error:', data.error);
            body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">' + (data.error || 'Error loading transactions') + '</td></tr>';
        }
    } catch (err) {
        console.error('[BANK] Error:', err);
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">Error: ' + err.message + '</td></tr>';
    }
}

function renderBankTransactions(transactions) {
    console.log('[BANK] Rendering', transactions.length, 'transactions');
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
        const processed = t.processed || false;
        const assignedTargetId = t.account_id || null;
        
        const rowClass = processed ? 'bank-row-posted' : 'bank-row-unposted';
        
        // Destination dropdown - all accounts except cash accounts (exclude 1 and 21)
        const targetOptions = bankAccounts.filter(acc => acc.id != 1 && acc.id != 21);
        let targetHtml = `<select class="tx-target-select" id="tx-target-${t.id}" data-tx-id="${t.id}" data-processed="${processed}">`;
        targetHtml += `<option value="">Select Destination</option>`;
        targetOptions.forEach(acc => {
            const selected = (assignedTargetId == acc.id) ? 'selected' : '';
            targetHtml += `<option value="${acc.id}" ${selected}>${acc.code} - ${acc.name}</option>`;
        });
        targetHtml += '</select>';

        html += `<tr class="${rowClass}" data-tx-id="${t.id}">
            <td>${t.date || ''}</td>
            <td>${t.description || ''}</td>
            <td style="color: ${isDebit ? '#dc3545' : '#28a745'}; font-weight: 600;">${formattedAmount}</td>
            <td>${t.category || ''}</td>
            <td>${targetHtml}</td>
        </tr>`;
    });
    body.innerHTML = html;
    console.log('[BANK] Rendering complete');
}

function updateBankCounts(unprocessed, total) {
    console.log('[BANK] Updating counts: unprocessed=', unprocessed, 'total=', total);
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

async function applyAllSelections() {
    console.log('[BANK] Applying all selections');
    const sourceFilter = document.getElementById('bank-source-filter')?.value || 'plaid';
    let sourceAccountId = null;
    if (sourceFilter === 'plaid') {
        sourceAccountId = 21; // FNBO Bank
    } else if (sourceFilter === 'historic') {
        sourceAccountId = 1; // Bluevine Bank
    } else {
        showToast('Please select a specific source (Live Plaid or Historic CSV)', 'warning');
        return;
    }

    const bulkDestinationId = document.getElementById('bank-bulk-destination')?.value || null;

    const rows = document.querySelectorAll('#bank-body tr');
    const updates = [];
    let skippedCount = 0;

    rows.forEach(row => {
        const targetSelect = row.querySelector('.tx-target-select');
        if (!targetSelect) return;
        
        const txId = targetSelect.dataset.txId;
        const processed = targetSelect.dataset.processed === 'true';
        
        if (processed) return;

        let destinationId = targetSelect.value;
        if (bulkDestinationId) {
            destinationId = bulkDestinationId;
            targetSelect.value = bulkDestinationId;
        }
        
        if (!destinationId) {
            skippedCount++;
            return;
        }

        updates.push({
            transaction_id: txId,
            source_account_id: sourceAccountId,
            target_account_id: parseInt(destinationId),
            source_type: sourceFilter === 'plaid' ? 'plaid' : 'historic'
        });
    });

    if (updates.length === 0) {
        if (skippedCount > 0) {
            showToast(`No transactions with destinations selected. ${skippedCount} transaction(s) skipped.`, 'warning');
        } else {
            showToast('No unprocessed transactions found.', 'warning');
        }
        return;
    }

    console.log('[BANK] Applying', updates.length, 'transactions, skipping', skippedCount);
    if (!confirm(`Apply ${updates.length} transaction(s)? (${skippedCount} skipped - no destination selected)`)) {
        return;
    }

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/bank/apply-multiple`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[BANK] Applied', data.processed, 'transactions');
            showToast(`✅ ${data.processed} transaction(s) posted successfully. ${skippedCount} skipped.`, 'success');
            loadBankTransactions();
        } else {
            console.error('[BANK] Error:', data.error);
            showToast('❌ Error: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (e) {
        console.error('[BANK] Error:', e);
        showToast('❌ Error: ' + e.message, 'error');
    }
}

// ============================================================
// ACCOUNTS TAB - CRUD OPERATIONS
// ============================================================

async function loadAccountsList() {
    console.log('[ACCOUNTS] Loading accounts list');
    const body = document.getElementById('accounts-body');
    body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">Loading accounts...</td></tr>';

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
            body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#dc3545;">' + (data.error || 'Error loading accounts') + '</td></tr>';
        }
    } catch (err) {
        console.error('[ACCOUNTS] Error:', err);
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#dc3545;">Error: ' + err.message + '</td></tr>';
    }
}

function renderAccounts(accounts) {
    console.log('[ACCOUNTS] Rendering', accounts.length, 'accounts');
    const body = document.getElementById('accounts-body');
    if (!accounts || accounts.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">No accounts found.</td></tr>';
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
            loadAccountSelectsForBank();
            loadBankAccountsForRowDropdowns();
            loadBulkDestinationAccounts();
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
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/account-transactions?account_id=${accountId}&page=1&per_page=1`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        const hasTransactions = data.total > 0;

        let message = `Are you sure you want to delete account "${accountName}"?`;
        if (hasTransactions) {
            message = `Account "${accountName}" has ${data.total} posted transaction(s).\n\nDeleting this account will unpost all associated transactions.\n\nAre you sure you want to proceed?`;
        }

        if (!confirm(message)) {
            console.log('[ACCOUNTS] Delete cancelled');
            return;
        }

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
            loadAccountSelectsForBank();
            loadBankAccountsForRowDropdowns();
            loadBulkDestinationAccounts();
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
// ACCOUNT TRANSACTIONS - UPDATED
// ============================================================

async function loadAccountTransactions() {
    console.log('[ACCOUNT-TX] Loading account transactions');
    const body = document.getElementById('account-tx-body');
    const accountId = document.getElementById('account-transactions-select').value;

    if (!accountId) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">Please select an account.</td></tr>';
        return;
    }

    body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">Loading...</td></tr>';

    const params = new URLSearchParams();
    params.append('page', accountTxCurrentPage);
    params.append('per_page', accountTxPageSize);
    params.append('account_id', accountId);
    const from = document.getElementById('account-tx-date-from').value;
    const to = document.getElementById('account-tx-date-to').value;
    if (from) params.append('date_from', from);
    if (to) params.append('date_to', to);

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/journal?${params.toString()}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to load account transactions');
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[ACCOUNT-TX] Loaded', data.entries.length, 'entries, total:', data.total);
            accountTxTotalEntries = data.total;
            renderAccountTransactions(data.entries);
            updateAccountTxPagination();
            updateAccountBalance(accountId);
        } else {
            console.error('[ACCOUNT-TX] Error:', data.error);
            body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#dc3545;">' + (data.error || 'Error loading transactions') + '</td></tr>';
        }
    } catch (err) {
        console.error('[ACCOUNT-TX] Error:', err);
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#dc3545;">Error: ' + err.message + '</td></tr>';
    }
}

function renderAccountTransactions(entries) {
    console.log('[ACCOUNT-TX] Rendering', entries.length, 'entries');
    const body = document.getElementById('account-tx-body');
    if (!entries || entries.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">No transactions found for this account.</td></tr>';
        return;
    }
    let html = '';
    entries.forEach(e => {
        const debit = e.debit_amount ? '$' + parseFloat(e.debit_amount).toFixed(2) : '';
        const credit = e.credit_amount ? '$' + parseFloat(e.credit_amount).toFixed(2) : '';
        const source = e.source_type && e.source_id ? `${e.source_type}: ${e.source_id}` : '';
        html += `<tr>
            <td>${e.id}</td>
            <td>${e.transaction_date}</td>
            <td>${e.description || ''}</td>
            <td class="debit">${debit}</td>
            <td class="credit">${credit}</td>
            <td>${source}</td>
            <td><button class="btn btn-sm btn-warning" onclick="unpostTransaction(${e.id})"><i class="fas fa-undo"></i> Unpost</button></td>
        </tr>`;
    });
    body.innerHTML = html;
}

async function unpostTransaction(entryId) {
    console.log('[ACCOUNT-TX] Unposting transaction:', entryId);
    
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
            console.log('[ACCOUNT-TX] Unposted successfully');
            showToast(`✅ Journal entry #${entryId} unposted successfully. ${data.unposted_count || 0} transaction(s) restored.`, 'success');
            loadAccountTransactions();
            const accountId = document.getElementById('account-transactions-select').value;
            if (accountId) {
                updateAccountBalance(accountId);
            }
        } else {
            console.error('[ACCOUNT-TX] Error unposting:', data.error);
            showToast('❌ Error: ' + (data.error || 'Failed to unpost'), 'error');
        }
    } catch (e) {
        console.error('[ACCOUNT-TX] Error:', e);
        showToast('❌ Error: ' + e.message, 'error');
    }
}

function updateAccountTxPagination() {
    const totalPages = Math.ceil(accountTxTotalEntries / accountTxPageSize);
    document.getElementById('account-tx-pagination-info').textContent = `Showing ${accountTxTotalEntries} entries (Page ${accountTxCurrentPage} of ${totalPages || 1})`;
    document.getElementById('account-tx-prev').disabled = accountTxCurrentPage <= 1;
    document.getElementById('account-tx-next').disabled = accountTxCurrentPage >= totalPages || totalPages === 0;
    document.getElementById('account-tx-page-info').textContent = `Page ${accountTxCurrentPage}`;
}

async function updateAccountBalance(accountId) {
    console.log('[ACCOUNT-TX] Updating balance for account:', accountId);
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/account-balance?account_id=${accountId}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            const balance = data.balance || 0;
            console.log('[ACCOUNT-TX] Balance:', balance);
            const display = document.getElementById('account-balance-display');
            const span = display.querySelector('span') || display;
            const cls = balance > 0 ? 'balance-positive' : (balance < 0 ? 'balance-negative' : 'balance-zero');
            span.className = cls;
            span.textContent = (balance >= 0 ? '' : '-') + '$' + Math.abs(balance).toFixed(2);
        }
    } catch (e) {
        console.error('[ACCOUNT-TX] Failed to fetch account balance:', e);
    }
}

function resetAccountTxFilters() {
    console.log('[ACCOUNT-TX] Resetting filters');
    const accountId = document.getElementById('account-transactions-select').value;
    if (accountId) {
        updateAccountDateRange(accountId);
    } else {
        document.getElementById('account-tx-date-from').value = '';
        document.getElementById('account-tx-date-to').value = '';
        accountTxCurrentPage = 1;
        loadAccountTransactions();
    }
}

function exportAccountTransactionsCSV() {
    const accountId = document.getElementById('account-transactions-select').value;
    if (!accountId) {
        alert('Please select an account first.');
        return;
    }
    console.log('[ACCOUNT-TX] Exporting CSV for account:', accountId);
    const params = new URLSearchParams();
    params.append('page', 1);
    params.append('per_page', 9999);
    params.append('account_id', accountId);
    const from = document.getElementById('account-tx-date-from').value;
    const to = document.getElementById('account-tx-date-to').value;
    if (from) params.append('date_from', from);
    if (to) params.append('date_to', to);

    fetch(`${AppConfig.baseUrl}/api/accounting/journal?${params.toString()}`, {
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success' && data.entries) {
            console.log('[ACCOUNT-TX] Exporting', data.entries.length, 'entries');
            let csv = 'ID,Date,Description,Debit, Credit,Source\n';
            data.entries.forEach(e => {
                csv += `${e.id},${e.transaction_date},"${(e.description||'').replace(/"/g,'""')}",${e.debit_amount||0},${e.credit_amount||0},${e.source_type}:${e.source_id}\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `account_${accountId}_transactions.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        }
    }).catch(console.error);
}

// ============================================================
// MODAL FUNCTIONS
// ============================================================

function closeMonthlyModal() {
    console.log('[MODAL] Closing monthly modal');
    document.getElementById('monthly-tx-modal').classList.remove('active');
}

function showMonthlyTransactions(month, accountId, accountName, excludeOrders = false) {
    console.log('[MODAL] Showing monthly transactions:', month, accountName);
    const modal = document.getElementById('monthly-tx-modal');
    const body = document.getElementById('modal-body');
    const title = document.getElementById('modal-title');
    title.textContent = `${accountName} - ${month}`;
    body.innerHTML = '<div class="modal-loading">Loading transactions...</div>';
    modal.classList.add('active');

    let url = `${AppConfig.baseUrl}/api/accounting/monthly-account-transactions?month=${month}`;
    if (accountId) {
        url += `&account_id=${accountId}`;
    }
    if (excludeOrders) {
        url += '&exclude_orders=true';
    }

    fetch(url, {
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success' && data.transactions) {
            console.log('[MODAL] Loaded', data.transactions.length, 'transactions');
            renderModalTransactions(data.transactions, accountName, month);
        } else {
            console.error('[MODAL] Error:', data.error);
            body.innerHTML = `<p class="monthly-error">${data.error || 'Failed to load transactions'}</p>`;
        }
    })
    .catch(err => {
        console.error('[MODAL] Error:', err);
        body.innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
    });
}

function renderModalTransactions(transactions, accountName, month) {
    console.log('[MODAL] Rendering', transactions.length, 'transactions');
    const body = document.getElementById('modal-body');
    if (!transactions || transactions.length === 0) {
        body.innerHTML = '<p>No transactions found for this period.</p>';
        return;
    }

    let total = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    
    let html = `<div class="modal-summary">
        <div class="summary-item"><strong>Account:</strong> ${accountName || 'All Accounts'}</div>
        <div class="summary-item"><strong>Month:</strong> ${month}</div>
        <div class="summary-item"><strong>Transactions:</strong> ${transactions.length}</div>
    </div>`;
    
    html += `<table>
        <thead><tr>
            <th>Date</th>
            <th>Description</th>
            <th>Account</th>
            <th>Debit</th>
            <th>Credit</th>
            <th>Net</th>
        </tr></thead>
        <tbody>`;
    
    transactions.forEach(tx => {
        const debit = tx.debit_amount || 0;
        const credit = tx.credit_amount || 0;
        const net = debit - credit;
        total += net;
        totalDebit += debit;
        totalCredit += credit;
        
        const netClass = net > 0 ? 'debit' : (net < 0 ? 'credit' : '');
        html += `<tr>
            <td>${tx.transaction_date}</td>
            <td>${tx.description || ''}</td>
            <td>${tx.account_name || ''}</td>
            <td class="debit">${debit ? '$' + debit.toFixed(2) : ''}</td>
            <td class="credit">${credit ? '$' + credit.toFixed(2) : ''}</td>
            <td class="${netClass}">${net !== 0 ? '$' + net.toFixed(2) : ''}</td>
        </tr>`;
    });
    
    html += `<tr class="total-row">
        <td colspan="3"><strong>Totals</strong></td>
        <td class="debit"><strong>$${totalDebit.toFixed(2)}</strong></td>
        <td class="credit"><strong>$${totalCredit.toFixed(2)}</strong></td>
        <td><strong>$${total.toFixed(2)}</strong></td>
    </tr>`;
    html += '</tbody></table>';
    body.innerHTML = html;
}

// ============================================================
// SHARED LINE CHART RENDERER
// ============================================================

function renderLineChart(canvasId, data, options = {}) {
    console.log('[CHART] Rendering line chart:', canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error('[CHART] Canvas not found:', canvasId);
        return null;
    }

    const ctx = canvas.getContext('2d');
    const { months, account_breakdown } = data;
    
    if (!months || months.length === 0) {
        console.log('[CHART] No data to display');
        return null;
    }

    // Destroy existing chart on this canvas
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }

    // Format month labels
    const labels = months.map(m => {
        const [year, month] = m.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    });

    // Get all account names
    const allAccounts = new Set();
    months.forEach(m => {
        const monthData = account_breakdown[m] || {};
        Object.keys(monthData).forEach(acc => allAccounts.add(acc));
    });
    
    const accountNames = Array.from(allAccounts).sort();
    const netLabel = accountNames.find(name => name === 'Net' || name === 'Net Income' || name === 'Net Cash');
    
    // Separate net from regular accounts
    const regularAccounts = accountNames.filter(name => name !== netLabel);
    
    // Build datasets
    const datasets = [];
    const colorPalette = [
        '#28a745', '#dc3545', '#007bff', '#ffc107', '#17a2b8', 
        '#6f42c1', '#fd7e14', '#20c997', '#e83e8c', '#6c757d',
        '#198754', '#0d6efd', '#d63384', '#6610f2', '#0dcaf0'
    ];

    // Determine which accounts are revenue vs expense based on typical naming
    const revenueKeywords = ['revenue', 'sales', 'income', 'shipping', 'fees'];
    const expenseKeywords = ['cogs', 'expense', 'cost', 'postage', 'rent', 'utilities', 'payroll', 'amortization'];
    
    // Sort accounts: revenue first, then expenses, then others
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

    // Build datasets for regular accounts
    sortedAccounts.forEach((accountName, idx) => {
        const values = months.map(m => {
            const monthData = account_breakdown[m] || {};
            return monthData[accountName] || 0;
        });
        
        // Skip accounts with all zeros
        if (values.every(v => Math.abs(v) < 0.01)) return;
        
        const colorIdx = idx % colorPalette.length;
        const baseColor = colorPalette[colorIdx];
        
        // Determine if this is revenue or expense for color coding
        const aLower = accountName.toLowerCase();
        const isRevenue = revenueKeywords.some(k => aLower.includes(k));
        const isExpense = expenseKeywords.some(k => aLower.includes(k));
        
        let borderColor = baseColor;
        if (isRevenue) borderColor = COLORS.revenueBorder;
        else if (isExpense) borderColor = COLORS.expenseBorder;
        
        let backgroundColor = borderColor + '40'; // 25% opacity
        
        datasets.push({
            label: accountName,
            data: values,
            borderColor: borderColor,
            backgroundColor: backgroundColor,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 7,
            fill: false,
            tension: 0.1,
            hidden: values.every(v => Math.abs(v) < 0.01)
        });
    });

    // Add Net Income / Net Cash as a separate dataset with distinct styling
    if (netLabel) {
        const netValues = months.map(m => {
            const monthData = account_breakdown[m] || {};
            return monthData[netLabel] || 0;
        });
        
        if (!netValues.every(v => Math.abs(v) < 0.01)) {
            datasets.push({
                label: netLabel,
                data: netValues,
                borderColor: COLORS.netIncomeBorder,
                backgroundColor: COLORS.netIncomeBorder + '30',
                borderWidth: 3,
                pointRadius: 6,
                pointHoverRadius: 9,
                pointBackgroundColor: COLORS.netIncomeBorder,
                pointBorderColor: 'white',
                pointBorderWidth: 2,
                fill: false,
                tension: 0.1,
                borderDash: [6, 3]
            });
        }
    }

    // If no datasets have data, show message
    if (datasets.length === 0) {
        console.log('[CHART] No data to display after filtering');
        return null;
    }

    // Calculate y-axis max with some padding
    let maxVal = 0;
    datasets.forEach(ds => {
        ds.data.forEach(v => {
            if (Math.abs(v) > maxVal) maxVal = Math.abs(v);
        });
    });
    const yMax = Math.ceil((maxVal * 1.2) / 100) * 100 || 100;

    // Determine if this is P&L or Cash Flow based on options
    const isPL = options.type === 'pl';
    const chartTitle = isPL ? 'Monthly Profit & Loss' : 'Monthly Cash Flow';

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
                        pointStyle: 'circle',
                        padding: 20,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            const label = context.dataset.label || '';
                            const sign = val >= 0 ? '+' : '';
                            return `${label}: ${sign}$${Math.abs(val).toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: { size: 11 }
                    },
                    grid: {
                        display: true,
                        drawBorder: true
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
                        font: { size: 11 }
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.08)',
                        drawBorder: true
                    }
                }
            },
            onClick: function(e, elements) {
                console.log('[CHART] Click on chart, elements:', elements.length);
                if (elements.length === 0) return;
                
                const element = elements[0];
                const datasetIndex = element.datasetIndex;
                const dataIndex = element.index;
                const dataset = this.data.datasets[datasetIndex];
                const accountName = dataset.label;
                const month = months[dataIndex];
                const value = dataset.data[dataIndex];
                
                if (Math.abs(value) < 0.01) return;
                
                console.log('[CHART] Clicked:', accountName, month, value);
                
                // Get account ID
                const trimmed = accountName.trim();
                const norm = trimmed.toLowerCase();
                let accountId = accountNameToId[norm] || accountNameToId[trimmed];
                
                // For Net Income/Net Cash, show all transactions (excluding orders for P&L)
                if (accountName === 'Net Income' || accountName === 'Net Cash' || accountName === netLabel) {
                    showMonthlyTransactions(month, null, accountName, isPL);
                    return;
                }
                
                if (accountId) {
                    showMonthlyTransactions(month, accountId, accountName, isPL);
                } else {
                    // If account not found, show all transactions for the account name
                    showMonthlyTransactions(month, null, accountName, isPL);
                }
            }
        }
    });

    // Store chart reference
    if (canvasId === 'pl-chart') {
        plChartInstance = chart;
        plChartData = data;
    } else if (canvasId === 'cash-flow-chart') {
        cashFlowChartInstance = chart;
        cashFlowChartData = data;
    }

    // Add double-click to expand
    canvas.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        expandChart(canvasId);
    });

    console.log('[CHART] Chart rendered successfully');
    return chart;
}

// ============================================================
// EXPAND CHART (Full Screen)
// ============================================================

function expandChart(canvasId) {
    console.log('[CHART] Expanding chart:', canvasId);
    
    if (isExpanded) {
        collapseChart();
        return;
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Get the chart instance
    const chart = Chart.getChart(canvas);
    if (!chart) return;

    isExpanded = true;
    expandedChartInstance = chart;

    // Create expanded container
    const container = document.createElement('div');
    container.id = 'expanded-chart-container';
    
    container.innerHTML = `
        <div class="chart-header">
            <h3>${chart.options?.plugins?.legend?.labels?.font?.size ? 'Expanded View' : 'Expanded View'}</h3>
            <button class="btn btn-secondary" onclick="collapseChart()">
                <i class="fas fa-times"></i> Close
            </button>
        </div>
        <div class="chart-body">
            <canvas id="expanded-chart-canvas"></canvas>
        </div>
    `;
    
    document.body.appendChild(container);

    // Create new chart on the expanded canvas
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
                        pointStyle: 'circle',
                        padding: 25,
                        font: { size: 14, weight: 'bold' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            const label = context.dataset.label || '';
                            const sign = val >= 0 ? '+' : '';
                            return `${label}: ${sign}$${Math.abs(val).toFixed(2)}`;
                        }
                    },
                    titleFont: { size: 16, weight: 'bold' },
                    bodyFont: { size: 14 }
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: { size: 14, weight: 'bold' }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value;
                        },
                        font: { size: 14, weight: 'bold' }
                    }
                }
            },
            onClick: chart.options.onClick
        }
    });

    // Store expanded chart reference
    window._expandedChart = expandedChart;
    
    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
        if (expandedChart) expandedChart.resize();
    });
    resizeObserver.observe(container.querySelector('.chart-body'));
    window._expandedResizeObserver = resizeObserver;
}

function collapseChart() {
    console.log('[CHART] Collapsing chart');
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
    
    // Resize original charts
    if (plChartInstance) plChartInstance.resize();
    if (cashFlowChartInstance) cashFlowChartInstance.resize();
}

// ============================================================
// CASH FLOW
// ============================================================

async function loadCashFlow() {
    console.log('[CASHFLOW] Loading cash flow');
    const startInput = document.getElementById('cash-flow-start');
    const endInput = document.getElementById('cash-flow-end');
    const start = startInput.value;
    const end = endInput.value;
    console.log('[CASHFLOW] Start:', start, 'End:', end);
    
    if (!start || !end) {
        alert('Please select both start and end months.');
        return;
    }

    if (bankAccounts.length === 0) {
        console.log('[CASHFLOW] Loading bank accounts');
        await loadBankAccountsForRowDropdowns();
    }

    try {
        console.log('[CASHFLOW] Fetching data from API');
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/cash-flow-detail?start=${start}&end=${end}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to fetch cash flow data');
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[CASHFLOW] Data loaded, months:', data.months.length);
            const dateRangeEl = document.getElementById('cash-flow-date-range');
            dateRangeEl.textContent = `Showing from ${start} to ${end}`;
            dateRangeEl.style.display = 'block';
            
            // Render line chart
            renderLineChart('cash-flow-chart', data, { type: 'cashflow' });
        } else {
            console.error('[CASHFLOW] Error:', data.error);
            document.getElementById('cash-flow-chart-container').innerHTML = `<p class="monthly-error">${data.error || 'Error loading data'}</p>`;
        }
    } catch (err) {
        console.error('[CASHFLOW] Error:', err);
        document.getElementById('cash-flow-chart-container').innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
    }
}

// ============================================================
// MONTHLY P&L
// ============================================================

async function loadMonthlyPL() {
    console.log('[MONTHLY-PL] Loading monthly P&L');
    const startInput = document.getElementById('pl-start');
    const endInput = document.getElementById('pl-end');
    const start = startInput.value;
    const end = endInput.value;
    
    if (!start || !end) {
        alert('Please select both start and end months.');
        return;
    }

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/monthly-pl?start=${start}&end=${end}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to fetch P&L data');
        const data = await res.json();
        if (data.status === 'success') {
            console.log('[MONTHLY-PL] Data loaded, months:', data.months.length);
            const dateRangeEl = document.getElementById('pl-date-range');
            dateRangeEl.textContent = `Showing from ${start} to ${end}`;
            dateRangeEl.style.display = 'block';
            
            // Render line chart
            renderLineChart('pl-chart', data, { type: 'pl' });
        } else {
            console.error('[MONTHLY-PL] Error:', data.error);
            document.getElementById('pl-chart-container').innerHTML = `<p class="monthly-error">${data.error || 'Error loading data'}</p>`;
        }
    } catch (err) {
        console.error('[MONTHLY-PL] Error:', err);
        document.getElementById('pl-chart-container').innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
    }
}