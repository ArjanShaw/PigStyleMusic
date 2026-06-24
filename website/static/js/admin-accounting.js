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

// Monthly charts
let monthlyChartsData = [];

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
            
            if (sub === 'dashboard') loadDashboard();
            else if (sub === 'journal') loadJournalEntries();
            else if (sub === 'account-transactions') {
                loadAccountTransactionsSelect();
            }
            else if (sub === 'reconcile') loadReconciliationStatus();
            else if (sub === 'bank') {
                loadBankTransactions();
                checkBankConnection();
                loadAccountSelectsForBank();
                loadBankAccountsForRowDropdowns();
            }
            else if (sub === 'monthly') {
                const now = new Date();
                const endMonth = now.toISOString().slice(0, 7);
                const startMonth = '2026-01';
                const startInput = document.getElementById('monthly-start');
                const endInput = document.getElementById('monthly-end');
                if (!startInput.value) startInput.value = startMonth;
                if (!endInput.value) endInput.value = endMonth;
                if (bankAccounts.length === 0) {
                    loadBankAccountsForRowDropdowns().then(() => {
                        loadMonthlyPerformance();
                    });
                } else {
                    loadMonthlyPerformance();
                }
            }
            else if (sub === 'cash-flow') {
                // Set end month to current
                const now = new Date();
                const endMonth = now.toISOString().slice(0, 7);
                const endInput = document.getElementById('cash-flow-end');
                if (!endInput.value) endInput.value = endMonth;

                // Fetch earliest transaction and set start month
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
                    // Load the chart
                    loadCashFlow();
                })
                .catch(err => {
                    console.error('Failed to fetch earliest transaction:', err);
                    loadCashFlow(); // fallback with current inputs
                });
            }
            else if (sub === 'orders') {
                if (typeof window.loadOrders === 'function') {
                    window.loadOrders();
                    window.loadOrderStats();
                }
            }
        });
    });

    // AUTO‑LOAD when dropdown changes
    document.getElementById('account-transactions-select')?.addEventListener('change', function() {
        accountTxCurrentPage = 1;
        loadAccountTransactions();
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
    document.getElementById('account-tx-date-from').value = firstDay;
    document.getElementById('account-tx-date-to').value = today;

    // Load dashboard by default
    loadDashboard();

    // ---- Handle OAuth redirect from Plaid ----
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
// DASHBOARD (unchanged)
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

// runAccountingSync() removed

// ============================================================
// ACCOUNT DROPDOWNS (unchanged)
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
        console.error('Error loading accounts:', err);
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
        if (data.status === 'success') {
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

// Load accounts for per‑row dropdowns and store globally
async function loadBankAccountsForRowDropdowns() {
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            bankAccounts = data.accounts;
        }
        return data;
    } catch (e) {
        console.error('Failed to load accounts for row dropdowns:', e);
        throw e;
    }
}

// === ACCOUNT TRANSACTIONS DROPDOWN ===
async function loadAccountTransactionsSelect() {
    const select = document.getElementById('account-transactions-select');
    if (!select) return;
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/accounts`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            select.innerHTML = '<option value="">-- Select an account --</option>';
            data.accounts.forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = acc.code + ' - ' + acc.name;
                select.appendChild(opt);
            });
            if (data.accounts.length > 0) {
                select.value = data.accounts[0].id;
                loadAccountTransactions();
            }
        }
    } catch (e) {
        console.error('Failed to load accounts for account transactions:', e);
    }
}

// ============================================================
// JOURNAL ENTRIES (unchanged)
// ============================================================

async function loadJournalEntries() {
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
    document.getElementById('journal-account-filter').value = '';
    document.getElementById('journal-search').value = '';
    journalCurrentPage = 1;
    loadJournalEntries();
}

function exportJournalCSV() {
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
// MANUAL ADJUSTMENTS (unchanged)
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
// RECONCILIATION (unchanged)
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
// REPORTS (unchanged)
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
// BANK TRANSACTIONS (with filter-based bulk apply, no sync)
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

async function loadBankTransactions() {
    const body = document.getElementById('bank-body');
    body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">Loading...</td></tr>';

    const params = new URLSearchParams();
    params.append('page', 1);
    params.append('per_page', 999999);
    
    const filter = document.getElementById('bank-filter').value.trim();
    if (filter) params.append('search', filter);

    const showAll = document.getElementById('bank-show-all')?.checked || false;
    if (!showAll) {
        params.append('unprocessed_only', 'true');
    }

    const sourceFilter = document.getElementById('bank-source-filter')?.value || 'all';
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
            const transactions = data.transactions || [];
            renderBankTransactions(transactions);
            const total = data.total_count || transactions.length;
            const unprocessed = data.unprocessed_count || 0;
            updateBankCounts(unprocessed, total);
            document.getElementById('bank-pagination-info').textContent = `Showing ${transactions.length} entries (${total} total)`;
        } else {
            body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#dc3545;">' + (data.error || 'Error loading transactions') + '</td></tr>';
        }
    } catch (err) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#dc3545;">Error: ' + err.message + '</td></tr>';
    }
}

function renderBankTransactions(transactions) {
    const body = document.getElementById('bank-body');
    if (!transactions || transactions.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">No transactions found.</td></tr>';
        return;
    }
    let html = '';
    transactions.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        const isDebit = amount < 0;
        const formattedAmount = (isDebit ? '-' : '') + '$' + Math.abs(amount).toFixed(2);
        const status = t.status || (t.pending ? 'Pending' : 'Posted');
        const category = t.category || '';
        const processed = t.processed || false;
        const assignedAccountId = t.account_id || null;

        let options = '<option value="">-- Select --</option>';
        bankAccounts.forEach(acc => {
            const selected = (assignedAccountId === acc.id) ? 'selected' : '';
            options += `<option value="${acc.id}" ${selected}>${acc.code} - ${acc.name}</option>`;
        });
        // Add data-source-type so per‑row Apply All can send source_type
        const sourceType = t.source_type || 'bank_transaction';
        const accountHtml = `
            <select class="tx-account-select" id="tx-select-${t.id}" data-source-type="${sourceType}">
                ${options}
            </select>
        `;

        html += `<tr>
            <td>${t.date || ''}</td>
            <td>${t.description || ''}</td>
            <td style="color: ${isDebit ? '#dc3545' : '#28a745'}; font-weight: 600;">${formattedAmount}</td>
            <td>${category}</td>
            <td><span class="status-badge ${status === 'Pending' ? 'warning' : 'active'}">${status}</span></td>
            <td>${accountHtml}</td>
        </tr>`;
    });
    body.innerHTML = html;
}

function updateBankCounts(unprocessed, total) {
    const countEl = document.getElementById('bank-unprocessed-count');
    const labelEl = document.getElementById('bank-count-label');
    const totalEl = document.getElementById('bank-total-count');

    const showAll = document.getElementById('bank-show-all')?.checked || false;
    if (showAll) {
        countEl.textContent = total;
        labelEl.textContent = ' transactions';
        totalEl.textContent = `(${total} total)`;
    } else {
        countEl.textContent = unprocessed;
        labelEl.textContent = ' unprocessed transactions';
        totalEl.textContent = `(${total} total)`;
    }
}

function toggleBankShowAll() {
    loadBankTransactions();
}

function bankSourceFilterChanged() {
    loadBankTransactions();
}

function refreshBankTable() {
    loadBankTransactions();
}

function resetBankFilters() {
    document.getElementById('bank-filter').value = '';
    document.getElementById('bank-show-all').checked = false;
    document.getElementById('bank-source-filter').value = 'all';
    loadBankTransactions();
}

// Apply All (per-row selections) – now includes source_type
async function applyAllSelections() {
    const selects = document.querySelectorAll('#bank-body .tx-account-select');
    const updates = [];
    selects.forEach(sel => {
        const accountId = sel.value;
        if (!accountId) return;
        const idParts = sel.id.split('-');
        if (idParts.length < 3) return;
        const transactionId = idParts.slice(2).join('-');
        const sourceType = sel.dataset.sourceType || 'bank_transaction';
        updates.push({ 
            transaction_id: transactionId, 
            account_id: parseInt(accountId),
            source_type: sourceType
        });
    });

    if (updates.length === 0) {
        alert('No selections to apply. Please select an account for at least one transaction.');
        return;
    }

    if (!confirm(`Apply accounts to ${updates.length} transaction(s)?`)) return;

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/bank/apply-multiple`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert(`✅ ${data.processed} transaction(s) updated.`);
            loadBankTransactions();
        } else {
            alert('❌ Error: ' + (data.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// Bulk Apply – sends filter parameters, not a list of IDs
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

    const showAll = document.getElementById('bank-show-all')?.checked || false;
    const sourceFilter = document.getElementById('bank-source-filter')?.value || 'all';

    statusSpan.textContent = '⏳ Applying...';

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/bank/apply-filter-bulk`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                search: pattern,
                unprocessed_only: !showAll,
                source_type: sourceFilter === 'all' ? null : sourceFilter,
                account_id: accountId
            })
        });

        const data = await res.json();
        if (data.status === 'success') {
            statusSpan.textContent = `✅ ${data.message}`;
            loadBankTransactions();
        } else {
            statusSpan.textContent = '❌ Error: ' + (data.error || 'Unknown');
        }
    } catch (e) {
        statusSpan.textContent = '❌ Error: ' + e.message;
    }
}

// ============================================================
// ACCOUNT TRANSACTIONS (unchanged)
// ============================================================

async function loadAccountTransactions() {
    const body = document.getElementById('account-tx-body');
    const accountId = document.getElementById('account-transactions-select').value;

    if (!accountId) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">Please select an account.</td></tr>';
        return;
    }

    body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">Loading...</td></tr>';

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
            accountTxTotalEntries = data.total;
            renderAccountTransactions(data.entries);
            updateAccountTxPagination();
            updateAccountBalance(accountId);
        } else {
            body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#dc3545;">' + (data.error || 'Error loading transactions') + '</td></tr>';
        }
    } catch (err) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#dc3545;">Error: ' + err.message + '</td></tr>';
    }
}

function renderAccountTransactions(entries) {
    const body = document.getElementById('account-tx-body');
    if (!entries || entries.length === 0) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">No transactions found for this account.</td></tr>';
        return;
    }
    let html = '';
    entries.forEach(e => {
        const debit = e.debit_amount ? '$' + parseFloat(e.debit_amount).toFixed(2) : '';
        const credit = e.credit_amount ? '$' + parseFloat(e.credit_amount).toFixed(2) : '';
        html += `<tr>
            <td>${e.id}</td>
            <td>${e.transaction_date}</td>
            <td>${e.description || ''}</td>
            <td class="debit">${debit}</td>
            <td class="credit">${credit}</td>
            <td>${e.source_type}: ${e.source_id}</td>
            <td><button class="btn btn-sm btn-info" onclick="viewJournalEntry(${e.id})"><i class="fas fa-eye"></i></button></td>
        </tr>`;
    });
    body.innerHTML = html;
}

function updateAccountTxPagination() {
    const totalPages = Math.ceil(accountTxTotalEntries / accountTxPageSize);
    document.getElementById('account-tx-pagination-info').textContent = `Showing ${accountTxTotalEntries} entries (Page ${accountTxCurrentPage} of ${totalPages || 1})`;
    document.getElementById('account-tx-prev').disabled = accountTxCurrentPage <= 1;
    document.getElementById('account-tx-next').disabled = accountTxCurrentPage >= totalPages || totalPages === 0;
    document.getElementById('account-tx-page-info').textContent = `Page ${accountTxCurrentPage}`;
}

async function updateAccountBalance(accountId) {
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/account-balance?account_id=${accountId}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        if (data.status === 'success') {
            const balance = data.balance || 0;
            const display = document.getElementById('account-balance-display');
            const span = display.querySelector('span') || display;
            const cls = balance > 0 ? 'balance-positive' : (balance < 0 ? 'balance-negative' : 'balance-zero');
            span.className = cls;
            span.textContent = (balance >= 0 ? '' : '-') + '$' + Math.abs(balance).toFixed(2);
        }
    } catch (e) {
        console.error('Failed to fetch account balance:', e);
    }
}

function resetAccountTxFilters() {
    document.getElementById('account-tx-date-from').value = '';
    document.getElementById('account-tx-date-to').value = '';
    accountTxCurrentPage = 1;
    loadAccountTransactions();
}

function exportAccountTransactionsCSV() {
    const accountId = document.getElementById('account-transactions-select').value;
    if (!accountId) {
        alert('Please select an account first.');
        return;
    }
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
// MONTHLY PERFORMANCE (unchanged)
// ============================================================

async function loadMonthlyPerformance() {
    const startInput = document.getElementById('monthly-start');
    const endInput = document.getElementById('monthly-end');
    const start = startInput.value;
    const end = endInput.value;
    if (!start || !end) {
        alert('Please select both start and end months.');
        return;
    }

    if (bankAccounts.length === 0) {
        await loadBankAccountsForRowDropdowns();
    }

    const container = document.getElementById('monthly-chart-grid');
    container.innerHTML = '<p class="monthly-loading">Loading...</p>';

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/monthly-performance?start=${start}&end=${end}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to fetch monthly data');
        const data = await res.json();
        if (data.status === 'success') {
            renderMonthlyCharts(data);
        } else {
            container.innerHTML = `<p class="monthly-error">${data.error || 'Error loading data'}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
        console.error('Monthly performance error:', err);
    }
}

function renderMonthlyCharts(data) {
    const { months, account_breakdown } = data;
    const container = document.getElementById('monthly-chart-grid');
    container.innerHTML = '';

    if (!months || months.length === 0) {
        container.innerHTML = '<p class="monthly-loading">No data for the selected range.</p>';
        return;
    }

    const allAccounts = new Set();
    months.forEach(m => {
        const monthData = account_breakdown[m] || {};
        Object.keys(monthData).forEach(acc => allAccounts.add(acc));
    });
    const accountNames = Array.from(allAccounts).sort();

    // Build robust account name -> ID mapping (normalized)
    const accountNameToId = {};
    bankAccounts.forEach(acc => {
        const trimmed = acc.name.trim();
        const norm = trimmed.toLowerCase();
        accountNameToId[norm] = acc.id;
        accountNameToId[trimmed] = acc.id;
    });

    let globalMax = 0;
    months.forEach(m => {
        const monthData = account_breakdown[m] || {};
        accountNames.forEach(acc => {
            const val = monthData[acc] || 0;
            if (val > globalMax) globalMax = val;
        });
    });
    const yMax = Math.ceil(globalMax / 500) * 500 || 100;

    const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6f42c1', '#fd7e14', '#20c997', '#17a2b8', '#e83e8c', '#6c757d'];

    if (window._monthlyCharts) {
        window._monthlyCharts.forEach(chart => chart.destroy());
    }
    window._monthlyCharts = [];

    months.forEach((month, idx) => {
        const monthData = account_breakdown[month] || {};
        const values = accountNames.map(acc => monthData[acc] || 0);
        const labels = accountNames;

        const card = document.createElement('div');
        card.className = 'monthly-chart-card';
        card.innerHTML = `<h4>${month}</h4><canvas id="monthly-chart-${idx}"></canvas>`;
        container.appendChild(card);

        const canvas = card.querySelector('canvas');
        const ctx = canvas.getContext('2d');

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Amount',
                    data: values,
                    backgroundColor: colors.slice(0, labels.length).map(c => c + '80'),
                    borderColor: colors.slice(0, labels.length),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `$${ctx.raw.toFixed(2)}` } }
                },
                scales: {
                    y: { beginAtZero: true, max: yMax, ticks: { callback: (val) => '$' + val } },
                    x: { ticks: { maxRotation: 45, minRotation: 45, font: { size: 10 } } }
                },
                onClick: function(e, elements) {
                    if (elements.length === 0) return;
                    const element = elements[0];
                    const index = element.index;
                    const accountName = this.data.labels[index];
                    const amount = this.data.datasets[0].data[index];
                    if (amount === 0) return;
                    
                    // Normalized lookup
                    const trimmed = accountName.trim();
                    const norm = trimmed.toLowerCase();
                    let accountId = accountNameToId[norm] || accountNameToId[trimmed];
                    if (!accountId) {
                        alert('Account not found: ' + accountName);
                        return;
                    }
                    showMonthlyTransactions(month, accountId, accountName);
                }
            }
        });
        window._monthlyCharts.push(chart);
    });
}

// ============================================================
// MODAL FUNCTIONS (updated for Net bar)
// ============================================================

function closeMonthlyModal() {
    document.getElementById('monthly-tx-modal').classList.remove('active');
}

function showMonthlyTransactions(month, accountId, accountName, excludeOrders = false) {
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
            renderModalTransactions(data.transactions);
        } else {
            body.innerHTML = `<p class="monthly-error">${data.error || 'Failed to load transactions'}</p>`;
        }
    })
    .catch(err => {
        body.innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
        console.error(err);
    });
}

function renderModalTransactions(transactions) {
    const body = document.getElementById('modal-body');
    if (!transactions || transactions.length === 0) {
        body.innerHTML = '<p>No transactions found.</p>';
        return;
    }

    let total = 0;
    let html = `<table>
        <thead><tr><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Amount</th></tr></thead>
        <tbody>`;
    transactions.forEach(tx => {
        const debit = tx.debit_amount || 0;
        const credit = tx.credit_amount || 0;
        const net = debit - credit;
        total += net;
        html += `<tr>
            <td>${tx.transaction_date}</td>
            <td>${tx.description}</td>
            <td class="debit">${debit ? '$' + debit.toFixed(2) : ''}</td>
            <td class="credit">${credit ? '$' + credit.toFixed(2) : ''}</td>
            <td>${net !== 0 ? '$' + net.toFixed(2) : ''}</td>
        </tr>`;
    });
    html += `<tr class="total-row"><td colspan="4">Total</td><td>$${total.toFixed(2)}</td></tr>`;
    html += '</tbody></table>';
    body.innerHTML = html;
}

// ============================================================
// CASH FLOW DETAIL (with Net bar)
// ============================================================

async function loadCashFlow() {
    const startInput = document.getElementById('cash-flow-start');
    const endInput = document.getElementById('cash-flow-end');
    const start = startInput.value;
    const end = endInput.value;
    if (!start || !end) {
        alert('Please select both start and end months.');
        return;
    }

    if (bankAccounts.length === 0) {
        await loadBankAccountsForRowDropdowns();
    }

    const container = document.getElementById('cash-flow-chart-grid');
    container.innerHTML = '<p class="monthly-loading">Loading...</p>';

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/cash-flow-detail?start=${start}&end=${end}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to fetch cash flow data');
        const data = await res.json();
        if (data.status === 'success') {
            renderCashFlowCharts(data);
        } else {
            container.innerHTML = `<p class="monthly-error">${data.error || 'Error loading data'}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
        console.error('Cash flow error:', err);
    }
}

function renderCashFlowCharts(data) {
    const { months, account_breakdown } = data;
    const container = document.getElementById('cash-flow-chart-grid');
    container.innerHTML = '';

    if (!months || months.length === 0) {
        container.innerHTML = '<p class="monthly-loading">No data for the selected range.</p>';
        return;
    }

    // Collect all unique account names
    const allAccounts = new Set();
    months.forEach(m => {
        const monthData = account_breakdown[m] || {};
        Object.keys(monthData).forEach(acc => allAccounts.add(acc));
    });
    const accountNames = Array.from(allAccounts).sort();

    // Build account name -> ID mapping (normalized)
    const accountNameToId = {};
    bankAccounts.forEach(acc => {
        const trimmed = acc.name.trim();
        const norm = trimmed.toLowerCase();
        accountNameToId[norm] = acc.id;
        accountNameToId[trimmed] = acc.id;
    });

    // Determine global max absolute value for y-axis
    let globalMax = 0;
    months.forEach(m => {
        const monthData = account_breakdown[m] || {};
        accountNames.forEach(acc => {
            const val = monthData[acc] || 0;
            if (Math.abs(val) > globalMax) globalMax = Math.abs(val);
        });
        // Also consider net values (sum per month)
        let net = 0;
        accountNames.forEach(acc => {
            net += monthData[acc] || 0;
        });
        if (Math.abs(net) > globalMax) globalMax = Math.abs(net);
    });
    const yMax = Math.ceil(globalMax / 500) * 500 || 100;

    // Destroy old charts
    if (window._cashFlowCharts) {
        window._cashFlowCharts.forEach(chart => chart.destroy());
    }
    window._cashFlowCharts = [];

    months.forEach((month, idx) => {
        const monthData = account_breakdown[month] || {};
        const values = accountNames.map(acc => monthData[acc] || 0);
        const labels = accountNames.slice(); // copy

        // Compute net cash flow for this month
        const net = values.reduce((sum, v) => sum + v, 0);

        // Extend labels and values with "Net"
        labels.push('Net');
        values.push(net);

        // Define bar colors: green for positive, red for negative, purple for Net
        const barColors = values.map((v, i) => {
            if (i === values.length - 1) return 'rgba(111, 66, 193, 0.8)'; // purple for Net
            return v >= 0 ? 'rgba(40, 167, 69, 0.7)' : 'rgba(220, 53, 69, 0.7)';
        });
        const borderColors = values.map((v, i) => {
            if (i === values.length - 1) return '#6f42c1';
            return v >= 0 ? '#28a745' : '#dc3545';
        });

        // Create card
        const card = document.createElement('div');
        card.className = 'monthly-chart-card';
        card.innerHTML = `<h4>${month}</h4><canvas id="cash-flow-chart-${idx}"></canvas>`;
        container.appendChild(card);

        const canvas = card.querySelector('canvas');
        const ctx = canvas.getContext('2d');

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Amount',
                    data: values,
                    backgroundColor: barColors,
                    borderColor: borderColors,
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
                            label: (ctx) => {
                                const val = ctx.raw;
                                return (val >= 0 ? '+' : '-') + '$' + Math.abs(val).toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: yMax,
                        min: -yMax,
                        ticks: { callback: (val) => '$' + val }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            font: { size: 10 }
                        }
                    }
                },
                onClick: function(e, elements) {
                    if (elements.length === 0) return;
                    const element = elements[0];
                    const index = element.index;
                    const label = this.data.labels[index];
                    const amount = this.data.datasets[0].data[index];
                    if (Math.abs(amount) < 0.01) return;

                    if (label === 'Net') {
                        // Show all transactions for this month (all accounts, exclude orders)
                        showMonthlyTransactions(month, null, 'Net Cash Flow', true);
                    } else {
                        // Normalized lookup for account ID
                        const trimmed = label.trim();
                        const norm = trimmed.toLowerCase();
                        let accountId = accountNameToId[norm] || accountNameToId[trimmed];
                        if (!accountId) {
                            alert('Account not found: ' + label);
                            return;
                        }
                        showMonthlyTransactions(month, accountId, label, true);
                    }
                }
            }
        });
        window._cashFlowCharts.push(chart);
    });
}