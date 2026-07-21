// ============================================================
// admin-accounting.js – Accounting Module (final)
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
let expandedChartInstance = null;
let isExpanded = false;

// Chart data cache for breakdown modal
let plChartData = null;
let cashFlowChartData = null;
let plMonths = [];
let cashFlowMonths = [];
let allPLData = null;
let allCashFlowData = null;

// Account name to ID mapping
let accountNameToId = {};

// Track which chart type is currently open for breakdown
let currentBreakdownChartType = 'pl';
let currentBreakdownMonth = '';
let currentBreakdownMonths = [];
let currentBreakdownMonthIndex = -1;

// Range selector state
let plRangeStart = 0;
let plRangeEnd = 0;
let cashFlowRangeStart = 0;
let cashFlowRangeEnd = 0;
const DEFAULT_MONTHS = 6;

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
// RANGE SELECTOR - SCROLLBAR DATE RANGE
// ============================================================

function initRangeSelector(containerId, chartId, type) {
    console.log('[RANGE] Initializing range selector for', type);
    
    // Check if range selector already exists
    const existing = document.getElementById(`range-${type}`);
    if (existing) {
        console.log('[RANGE] Range selector already exists');
        return;
    }
    
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('[RANGE] Container not found:', containerId);
        return;
    }
    
    // Create range selector
    const rangeDiv = document.createElement('div');
    rangeDiv.id = `range-${type}`;
    rangeDiv.style.cssText = `
        margin-bottom: 15px;
        padding: 10px 15px;
        background: #f8f9fa;
        border-radius: 6px;
        border: 1px solid #e9ecef;
    `;
    
    rangeDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:13px; color:#666; font-weight:500;">
                <i class="fas fa-calendar-alt"></i> Date Range:
                <span id="range-label-${type}" style="font-weight:600; color:#333;"></span>
            </span>
            <span style="font-size:12px; color:#999;">Drag to adjust range</span>
        </div>
        <div id="range-slider-wrapper-${type}" style="position:relative; padding:0 5px;">
            <input type="range" id="range-slider-start-${type}" min="0" max="100" value="0" step="1" style="width:100%;">
            <div style="display:flex; justify-content:space-between; font-size:10px; color:#999; margin-top:2px;">
                <span id="range-start-label-${type}">Earliest</span>
                <span id="range-end-label-${type}">Latest</span>
            </div>
        </div>
    `;
    
    container.insertBefore(rangeDiv, container.firstChild);
    
    // Store range state
    const startSlider = document.getElementById(`range-slider-start-${type}`);
    const endSlider = document.createElement('input');
    endSlider.type = 'range';
    endSlider.id = `range-slider-end-${type}`;
    endSlider.min = 0;
    endSlider.max = 100;
    endSlider.value = 100;
    endSlider.step = 1;
    endSlider.style.cssText = 'width:100%; margin-top:5px;';
    document.getElementById(`range-slider-wrapper-${type}`).appendChild(endSlider);
    
    // Add event listeners
    startSlider.addEventListener('input', function() {
        updateRangeSelector(type);
    });
    endSlider.addEventListener('input', function() {
        updateRangeSelector(type);
    });
    
    // Store references
    window[`rangeStart_${type}`] = startSlider;
    window[`rangeEnd_${type}`] = endSlider;
    
    console.log('[RANGE] Range selector initialized for', type);
}

function updateRangeSelector(type) {
    const startSlider = window[`rangeStart_${type}`];
    const endSlider = window[`rangeEnd_${type}`];
    if (!startSlider || !endSlider) return;
    
    const startVal = parseInt(startSlider.value);
    const endVal = parseInt(endSlider.value);
    
    // Ensure start < end
    if (startVal >= endVal) {
        if (event && event.target === startSlider) {
            endSlider.value = Math.min(100, startVal + 5);
        } else {
            startSlider.value = Math.max(0, endVal - 5);
        }
    }
    
    const finalStart = parseInt(startSlider.value);
    const finalEnd = parseInt(endSlider.value);
    
    // Store for chart rendering
    if (type === 'pl') {
        plRangeStart = finalStart;
        plRangeEnd = finalEnd;
    } else if (type === 'cashflow') {
        cashFlowRangeStart = finalStart;
        cashFlowRangeEnd = finalEnd;
    }
    
    updateRangeLabel(type);
    renderFilteredChart(type);
}

function updateRangeLabel(type) {
    const months = type === 'pl' ? plMonths : cashFlowMonths;
    const labelEl = document.getElementById(`range-label-${type}`);
    const startLabel = document.getElementById(`range-start-label-${type}`);
    const endLabel = document.getElementById(`range-end-label-${type}`);
    
    if (!labelEl || !months || months.length === 0) return;
    
    const startIdx = Math.floor((plRangeStart / 100) * (months.length - 1));
    const endIdx = Math.floor((plRangeEnd / 100) * (months.length - 1));
    const clampedStart = Math.max(0, Math.min(months.length - 1, startIdx));
    const clampedEnd = Math.max(0, Math.min(months.length - 1, endIdx));
    
    const formatMonth = (m) => {
        const [year, month] = m.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    };
    
    labelEl.textContent = `${formatMonth(months[clampedStart])} - ${formatMonth(months[clampedEnd])}`;
    if (startLabel) startLabel.textContent = formatMonth(months[clampedStart]);
    if (endLabel) endLabel.textContent = formatMonth(months[clampedEnd]);
}

function renderFilteredChart(type) {
    const months = type === 'pl' ? plMonths : cashFlowMonths;
    const data = type === 'pl' ? allPLData : allCashFlowData;
    
    if (!months || months.length === 0 || !data) {
        console.log('[RANGE] No data to render filtered chart');
        return;
    }
    
    const startIdx = Math.floor((plRangeStart / 100) * (months.length - 1));
    const endIdx = Math.floor((plRangeEnd / 100) * (months.length - 1));
    const clampedStart = Math.max(0, Math.min(months.length - 1, startIdx));
    const clampedEnd = Math.max(0, Math.min(months.length - 1, endIdx));
    
    const filteredMonths = months.slice(clampedStart, clampedEnd + 1);
    const filteredData = {};
    filteredMonths.forEach(m => {
        filteredData[m] = data.account_breakdown[m] || {};
    });
    
    const filteredChartData = {
        months: filteredMonths,
        account_breakdown: filteredData
    };
    
    const canvasId = type === 'pl' ? 'pl-chart' : 'cash-flow-chart';
    const chartType = type === 'pl' ? 'pl' : 'cashflow';
    
    // Update date range display
    const dateRangeEl = document.getElementById(type === 'pl' ? 'pl-date-range' : 'cash-flow-date-range');
    if (dateRangeEl) {
        const formatMonth = (m) => {
            const [year, month] = m.split('-');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${monthNames[parseInt(month) - 1]} ${year}`;
        };
        dateRangeEl.textContent = `Showing ${formatMonth(filteredMonths[0])} to ${formatMonth(filteredMonths[filteredMonths.length - 1])}`;
        dateRangeEl.style.display = 'block';
    }
    
    renderLineChart(canvasId, filteredChartData, { type: chartType });
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
                if (bankAccounts.length === 0) {
                    loadBankAccountsForRowDropdowns().then(() => {
                        loadMonthlyPL();
                    });
                } else {
                    loadMonthlyPL();
                }
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

    // Manual entry – auto‑balance check
    document.addEventListener('input', function(e) {
        if (e.target.closest('.manual-entry-row')) {
            updateManualBalance();
        }
    });

    // Load accounts into dropdowns
    loadAccountSelects();

    // Load default date range for reports
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

    // ---- Bank Tab: Search button and Enter key - NO AUTO-TRIGGERS ----
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

    // Close modal on overlay - only if clicking the backdrop itself
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
// BANK TRANSACTIONS - UPDATED (NO AUTO-TRIGGERS)
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
    console.log('[BANK] Loading bank transactions (manual search)');
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

// ============================================================
// applyAllSelections - UPDATED to handle both unprocessed AND posted transactions
// ============================================================

async function applyAllSelections() {
    console.log('[BANK] Applying all selections (including posted transactions for reassignment)');
    const sourceFilter = document.getElementById('bank-source-filter')?.value || 'plaid';
    let sourceAccountId = null;
    if (sourceFilter === 'plaid') {
        sourceAccountId = 21;
    } else if (sourceFilter === 'historic') {
        sourceAccountId = 1;
    } else {
        showToast('Please select a specific source (Live Plaid or Historic CSV)', 'warning');
        return;
    }

    const bulkDestinationId = document.getElementById('bank-bulk-destination')?.value || null;

    const rows = document.querySelectorAll('#bank-body tr');
    const updates = [];
    let skippedCount = 0;
    let processedCount = 0;
    let unprocessedCount = 0;

    rows.forEach(row => {
        const targetSelect = row.querySelector('.tx-target-select');
        if (!targetSelect) return;
        
        const txId = targetSelect.dataset.txId;
        const processed = targetSelect.dataset.processed === 'true';
        
        let destinationId = targetSelect.value;
        if (bulkDestinationId) {
            destinationId = bulkDestinationId;
            targetSelect.value = bulkDestinationId;
        }
        
        if (!destinationId) {
            skippedCount++;
            return;
        }

        const update = {
            transaction_id: txId,
            source_account_id: sourceAccountId,
            target_account_id: parseInt(destinationId),
            source_type: sourceFilter === 'plaid' ? 'plaid' : 'historic',
            is_update: processed
        };
        
        if (processed) {
            processedCount++;
        } else {
            unprocessedCount++;
        }
        
        updates.push(update);
    });

    if (updates.length === 0) {
        if (skippedCount > 0) {
            showToast(`No transactions with destinations selected. ${skippedCount} transaction(s) skipped.`, 'warning');
        } else {
            showToast('No transactions found.', 'warning');
        }
        return;
    }

    const message = `Apply ${updates.length} transaction(s)?\n- ${unprocessedCount} new (unposted)\n- ${processedCount} updates (reassigning posted)\n${skippedCount} skipped (no destination selected)`;
    if (!confirm(message)) {
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
            showToast(`✅ ${data.processed} transaction(s) processed. ${data.updated || 0} updated, ${data.created || 0} new. ${skippedCount} skipped.`, 'success');
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
    
    html += `<h4 style="margin:15px 0 10px 0; color:#333;">Records Sold</h4>`;
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
    
    html += `<h4 style="margin:15px 0 10px 0; color:#333;">Batch Allocations</h4>`;
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
                <span style="font-size:16px; font-weight:600; color:#333;">${dateRange}</span>
                <span style="font-size:14px; color:#666;">(${currentBreakdownMonthIndex + 1} of ${totalMonths})</span>
                <button class="btn btn-sm btn-secondary" id="breakdown-next-month" ${currentBreakdownMonthIndex >= totalMonths - 1 ? 'disabled' : ''}>
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div id="breakdown-chart-container" style="min-height: 450px; width: 100%; position: relative; background: white; border-radius: 8px; padding: 10px;">
                <canvas id="breakdown-chart-canvas"></canvas>
            </div>
            <div class="breakdown-bar-click-hint" style="font-size: 13px; color: #666; text-align: center; margin-top: 12px; font-style: italic;">
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
            document.getElementById('breakdown-chart-container').innerHTML = '<p style="text-align:center; padding:40px; color:#666;">No data for this month.</p>';
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
    console.log('[CHART] ===== RENDER LINE CHART START =====');
    console.log('[CHART] Canvas ID:', canvasId);
    console.log('[CHART] Options:', options);
    
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

    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        console.log('[CHART] Destroying existing chart');
        existingChart.destroy();
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const labels = months.map(m => {
        const [year, month] = m.split('-');
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    });
    console.log('[CHART] Labels:', labels);

    const allAccounts = new Set();
    months.forEach(m => {
        const monthData = account_breakdown[m] || {};
        Object.keys(monthData).forEach(acc => allAccounts.add(acc));
    });
    
    const accountNames = Array.from(allAccounts).sort();
    console.log('[CHART] All accounts:', accountNames);
    
    const netLabel = accountNames.find(name => name === 'Net' || name === 'Net Income' || name === 'Net Cash');
    console.log('[CHART] Net label:', netLabel);
    
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
    console.log('[CHART] Sorted accounts:', sortedAccounts);

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

    sortedAccounts.forEach((accountName, idx) => {
        const values = months.map(m => {
            const monthData = account_breakdown[m] || {};
            return monthData[accountName] || 0;
        });
        
        if (values.every(v => Math.abs(v) < 0.01)) {
            console.log('[CHART] Skipping zero account:', accountName);
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
            borderWidth = 2;
            pointStyle = pointStyles[styleIdx % pointStyles.length];
            pointRadius = 4;
            revenueCount++;
        } else if (isExpense) {
            borderColor = expenseColors[colorIdx];
            backgroundColor = borderColor + '40';
            borderDash = lineDashStyles[(styleIdx + 2) % lineDashStyles.length];
            borderWidth = 2;
            pointStyle = pointStyles[(styleIdx + 3) % pointStyles.length];
            pointRadius = 4;
            expenseCount++;
        } else {
            borderColor = otherColors[colorIdx % otherColors.length];
            backgroundColor = borderColor + '40';
            borderDash = lineDashStyles[(styleIdx + 1) % lineDashStyles.length];
            borderWidth = 2;
            pointStyle = pointStyles[(styleIdx + 5) % pointStyles.length];
            pointRadius = 4;
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
            pointHoverRadius: 7,
            pointHoverBorderWidth: 2,
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
                borderWidth: 4,
                pointStyle: 'diamond',
                pointRadius: 6,
                pointHoverRadius: 10,
                pointBackgroundColor: '#6f42c1',
                pointBorderColor: 'white',
                pointBorderWidth: 2,
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
    console.log('[CHART] Total datasets:', datasets.length);

    let maxVal = 0;
    datasets.forEach(ds => {
        ds.data.forEach(v => {
            if (Math.abs(v) > maxVal) maxVal = Math.abs(v);
        });
    });
    const yMax = Math.ceil((maxVal * 1.25) / 100) * 100 || 100;
    console.log('[CHART] Y-axis max:', yMax);

    const isPL = options.type === 'pl';
    console.log('[CHART] Chart type:', isPL ? 'P&L' : 'Cash Flow');

    if (canvasId === 'pl-chart') {
        plChartData = data;
        plMonths = months;
        allPLData = data;
        
        // Initialize range selector if not already done
        if (!document.getElementById('range-pl')) {
            console.log('[CHART] Initializing range selector for P&L');
            // Check if we have the container
            const container = document.getElementById('pl-chart-container');
            if (container) {
                initRangeSelector('pl-chart-container', 'pl-chart', 'pl');
            }
        }
        updateRangeLabel('pl');
        
    } else if (canvasId === 'cash-flow-chart') {
        cashFlowChartData = data;
        cashFlowMonths = months;
        allCashFlowData = data;
        
        if (!document.getElementById('range-cashflow')) {
            console.log('[CHART] Initializing range selector for Cash Flow');
            const container = document.getElementById('cash-flow-chart-container');
            if (container) {
                initRangeSelector('cash-flow-chart-container', 'cash-flow-chart', 'cashflow');
            }
        }
        updateRangeLabel('cashflow');
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
                        font: { size: 11 },
                        boxWidth: 14,
                        boxHeight: 14
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
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 }
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
            }
        }
    });
    console.log('[CHART] Chart instance created');

    if (canvasId === 'pl-chart') {
        plChartInstance = chart;
    } else if (canvasId === 'cash-flow-chart') {
        cashFlowChartInstance = chart;
    }

    // X-axis click handler
    console.log('[CHART] Adding x-axis click handler');
    
    canvas.addEventListener('click', function(e) {
        console.log('[CHART-X] Canvas click detected');
        try {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const chartInstance = Chart.getChart(canvas);
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
                
                const dataToUse = canvasId === 'pl-chart' ? plChartData : cashFlowChartData;
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
    }

    console.log('[CHART] ===== RENDER LINE CHART END =====');
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

    const chart = Chart.getChart(canvas);
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
                        font: { size: 14, weight: 'bold' },
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
    
    if (bankAccounts.length === 0) {
        console.log('[CASHFLOW] Loading bank accounts');
        await loadBankAccountsForRowDropdowns();
    }

    // Get all available data from API (no date filters)
    try {
        console.log('[CASHFLOW] Fetching all data from API');
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/cash-flow-detail`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to fetch cash flow data');
        const data = await res.json();
        console.log('[CASHFLOW] API response:', data);
        
        if (data.status === 'success') {
            console.log('[CASHFLOW] Data loaded, months:', data.months ? data.months.length : 0);
            
            // Store full data
            allCashFlowData = data;
            cashFlowMonths = data.months || [];
            
            // Set range to show last 6 months by default
            const totalMonths = cashFlowMonths.length;
            const defaultStart = Math.max(0, totalMonths - DEFAULT_MONTHS);
            cashFlowRangeStart = Math.round((defaultStart / Math.max(1, totalMonths - 1)) * 100);
            cashFlowRangeEnd = 100;
            
            // Update range label and render
            const dateRangeEl = document.getElementById('cash-flow-date-range');
            if (dateRangeEl && cashFlowMonths.length > 0) {
                const formatMonth = (m) => {
                    const [year, month] = m.split('-');
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${monthNames[parseInt(month) - 1]} ${year}`;
                };
                const startIdx = Math.max(0, defaultStart);
                const endIdx = cashFlowMonths.length - 1;
                dateRangeEl.textContent = `Showing ${formatMonth(cashFlowMonths[startIdx])} to ${formatMonth(cashFlowMonths[endIdx])}`;
                dateRangeEl.style.display = 'block';
            }
            
            renderFilteredChart('cashflow');
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
    console.log('[MONTHLY-PL] ===== LOAD MONTHLY P&L START =====');
    
    if (bankAccounts.length === 0) {
        console.log('[MONTHLY-PL] Loading bank accounts');
        await loadBankAccountsForRowDropdowns();
    }

    // Get all available data from API (no date filters)
    try {
        console.log('[MONTHLY-PL] Fetching all data from API');
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/monthly-pl`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        if (!res.ok) throw new Error('Failed to fetch P&L data');
        const data = await res.json();
        console.log('[MONTHLY-PL] API response:', data);
        
        if (data.status === 'success') {
            console.log('[MONTHLY-PL] Data loaded, months:', data.months ? data.months.length : 0);
            
            // Store full data
            allPLData = data;
            plMonths = data.months || [];
            
            // Set range to show last 6 months by default
            const totalMonths = plMonths.length;
            const defaultStart = Math.max(0, totalMonths - DEFAULT_MONTHS);
            plRangeStart = Math.round((defaultStart / Math.max(1, totalMonths - 1)) * 100);
            plRangeEnd = 100;
            
            // Update range label and render
            const dateRangeEl = document.getElementById('pl-date-range');
            if (dateRangeEl && plMonths.length > 0) {
                const formatMonth = (m) => {
                    const [year, month] = m.split('-');
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${monthNames[parseInt(month) - 1]} ${year}`;
                };
                const startIdx = Math.max(0, defaultStart);
                const endIdx = plMonths.length - 1;
                dateRangeEl.textContent = `Showing ${formatMonth(plMonths[startIdx])} to ${formatMonth(plMonths[endIdx])}`;
                dateRangeEl.style.display = 'block';
            }
            
            renderFilteredChart('pl');
        } else {
            console.error('[MONTHLY-PL] Error:', data.error);
            document.getElementById('pl-chart-container').innerHTML = `<p class="monthly-error">${data.error || 'Error loading data'}</p>`;
        }
    } catch (err) {
        console.error('[MONTHLY-PL] Error:', err);
        document.getElementById('pl-chart-container').innerHTML = `<p class="monthly-error">Error: ${err.message}</p>`;
    }
    console.log('[MONTHLY-PL] ===== LOAD MONTHLY P&L END =====');
}