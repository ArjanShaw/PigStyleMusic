// ============================================================
// admin-creditors.js – Creditors Tab for Main Admin
// ============================================================

// Current debtor being viewed
let currentDebtor = null;

// ============================================================
// INITIALIZATION
// ============================================================

function initCreditorsTab() {
    console.log('[CREDITORS] Initializing Creditors tab');
    loadCreditorsList();
    loadTotalOwed();

    // Set up event listeners for the Creditors tab
    const lookupBtn = document.querySelector('#creditors-tab .btn-primary');
    if (lookupBtn) {
        const newBtn = lookupBtn.cloneNode(true);
        lookupBtn.parentNode.replaceChild(newBtn, lookupBtn);
        newBtn.addEventListener('click', lookupDebtor);
    }

    // Enter key on lookup input
    const lookupInput = document.getElementById('lookup-debtor-name');
    if (lookupInput) {
        lookupInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                lookupDebtor();
            }
        });
    }

    // Issue credit preview
    const cashValueInput = document.getElementById('issue-cash-value');
    if (cashValueInput) {
        cashValueInput.addEventListener('input', function() {
            const cash = parseFloat(this.value) || 0;
            const credit = cash * 1.5;
            const previewEl = document.getElementById('issue-credit-preview');
            if (previewEl) {
                previewEl.textContent = '$' + credit.toFixed(2);
            }
        });
    }
}

async function loadCreditorsList() {
    console.log('[CREDITORS] Loading creditors list');
    const dropdown = document.getElementById('debtor-dropdown');
    if (!dropdown) return;
    
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/debtor/list`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        
        if (data.status === 'success' && data.debtors) {
            const currentVal = dropdown.value;
            dropdown.innerHTML = '<option value="">-- Select Creditor --</option>';
            data.debtors.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name;
                // USE display_name, NOT name
                opt.textContent = d.display_name || d.name;
                dropdown.appendChild(opt);
            });
            dropdown.value = currentVal;
            
            const activeDebtorsEl = document.getElementById('active-debtors');
            if (activeDebtorsEl) {
                activeDebtorsEl.textContent = data.debtors.length;
            }
        }
    } catch (e) {
        console.error('[CREDITORS] Error loading creditors list:', e);
    }
}

// ============================================================
// LOAD TOTAL OWED
// ============================================================

async function loadTotalOwed() {
    console.log('[CREDITORS] Loading total owed');
    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/accounting/account-balance?account_code=2015`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        const data = await res.json();
        const totalOwedEl = document.getElementById('total-owed');
        if (totalOwedEl && data.status === 'success') {
            totalOwedEl.textContent = '$' + data.balance.toFixed(2);
        }
    } catch (e) {
        console.error('[CREDITORS] Error loading total owed:', e);
    }
}

// ============================================================
// LOOKUP DEBTOR
// ============================================================

async function lookupDebtor() {
    const nameInput = document.getElementById('lookup-debtor-name');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
        showToast('Please enter a debtor name', 'warning');
        return;
    }
    await fetchDebtorData(name);
}

function selectDebtorFromDropdown() {
    const dropdown = document.getElementById('debtor-dropdown');
    const name = dropdown ? dropdown.value : '';
    if (name) {
        const lookupInput = document.getElementById('lookup-debtor-name');
        if (lookupInput) lookupInput.value = name;
        fetchDebtorData(name);
    } else {
        const detailsDiv = document.getElementById('debtor-details');
        if (detailsDiv) detailsDiv.style.display = 'none';
    }
}

// ============================================================
// FETCH DEBTOR DATA
// ============================================================

async function fetchDebtorData(name) {
    console.log('[CREDITORS] Fetching debtor:', name);
    const detailsDiv = document.getElementById('debtor-details');
    if (detailsDiv) detailsDiv.style.display = 'none';

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/debtor/lookup`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();

        if (data.status === 'success') {
            currentDebtor = data;
            renderDebtorDetails(data);
            if (detailsDiv) detailsDiv.style.display = 'block';
        } else {
            showToast(data.error || 'Debtor not found', 'error');
            if (detailsDiv) detailsDiv.style.display = 'none';
        }
    } catch (e) {
        console.error('[CREDITORS] Error fetching debtor:', e);
        showToast('Error fetching debtor data', 'error');
    }
}

// ============================================================
// RENDER DEBTOR DETAILS
// ============================================================

function renderDebtorDetails(data) {
    console.log('[CREDITORS] Rendering debtor details:', data);

    const nameDisplay = document.getElementById('debtor-name-display');
    if (nameDisplay) nameDisplay.textContent = data.debtor;

    const badge = document.getElementById('debtor-type-badge');
    if (badge) {
        if (data.is_gift_card) {
            badge.textContent = '🎁 Gift Card';
            badge.style.background = '#ff6b6b';
            badge.style.color = 'white';
        } else if (data.debtor === 'BERNIE') {
            badge.textContent = '🌹 Bernie Fund';
            badge.style.background = '#28a745';
            badge.style.color = 'white';
        } else {
            badge.textContent = '💰 Store Credit';
            badge.style.background = '#007bff';
            badge.style.color = 'white';
        }
    }

    const balanceEl = document.getElementById('debtor-balance-display');
    const balance = data.balance || 0;
    if (balanceEl) {
        balanceEl.textContent = '$' + balance.toFixed(2);
        balanceEl.style.color = balance >= 0 ? '#28a745' : '#dc3545';
    }

    const cashoutBtn = document.getElementById('cashout-btn');
    const donateBtn = document.getElementById('donate-btn');
    const cashoutInfo = document.getElementById('cashout-info');

    if (data.can_cash_out && balance > 0) {
        if (cashoutBtn) cashoutBtn.style.display = 'inline-block';
        if (cashoutInfo) {
            cashoutInfo.style.display = 'block';
            const cashAmount = balance * (2 / 3);
            const cashoutAmountDisplay = document.getElementById('cashout-amount-display');
            if (cashoutAmountDisplay) {
                cashoutAmountDisplay.textContent = `Cash payout: $${cashAmount.toFixed(2)} (2/3 of credit)`;
            }
        }
    } else {
        if (cashoutBtn) cashoutBtn.style.display = 'none';
        if (cashoutInfo) cashoutInfo.style.display = 'none';
    }

    if (data.debtor === 'BERNIE' && balance > 0) {
        if (donateBtn) donateBtn.style.display = 'inline-block';
    } else {
        if (donateBtn) donateBtn.style.display = 'none';
    }

    // Transaction history
    const body = document.getElementById('debtor-history-body');
    if (body) {
        if (data.entries && data.entries.length > 0) {
            let html = '';
            let runningTotal = 0;
            data.entries.forEach(e => {
                const amount = e.amount || 0;
                runningTotal += amount;
                const sign = amount >= 0 ? '+' : '';
                const color = amount >= 0 ? '#28a745' : '#dc3545';
                let displayDesc = e.description || '';
                // Remove the debtor name prefix for cleaner display
                if (displayDesc.startsWith(data.debtor + ' | ')) {
                    displayDesc = displayDesc.substring(data.debtor.length + 3);
                }
                html += `<tr>
                    <td>${e.transaction_date || ''}</td>
                    <td>${displayDesc || ''}</td>
                    <td style="text-align:right; color:${color}; font-weight:600;">${sign}$${Math.abs(amount).toFixed(2)}</td>
                </tr>`;
            });
            body.innerHTML = html;
        } else {
            body.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#666;">No transactions found.</td></tr>';
        }
    }
}


// ============================================================
// ISSUE STORE CREDIT
// ============================================================

async function issueStoreCredit() {
    const name = document.getElementById('issue-debtor-name')?.value.trim().toUpperCase() || '';
    const cashValue = parseFloat(document.getElementById('issue-cash-value')?.value || '0');
    const reason = document.getElementById('issue-reason')?.value.trim() || '';
    const statusEl = document.getElementById('issue-status');

    if (!name) {
        if (statusEl) {
            statusEl.textContent = '❌ Please enter a debtor name';
            statusEl.style.color = '#dc3545';
        }
        return;
    }
    if (!cashValue || cashValue <= 0) {
        if (statusEl) {
            statusEl.textContent = '❌ Please enter a valid cash value';
            statusEl.style.color = '#dc3545';
        }
        return;
    }
    if (!reason) {
        if (statusEl) {
            statusEl.textContent = '❌ Please enter a reason';
            statusEl.style.color = '#dc3545';
        }
        return;
    }

    const creditValue = cashValue * 1.5;
    if (statusEl) {
        statusEl.textContent = '⏳ Issuing credit...';
        statusEl.style.color = '#666';
    }

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/debtor/issue`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, cash_value: cashValue, reason })
        });
        const data = await res.json();
        if (data.status === 'success') {
            if (statusEl) {
                statusEl.textContent = `✅ Issued $${creditValue.toFixed(2)} store credit to ${name}`;
                statusEl.style.color = '#28a745';
            }
            const nameInput = document.getElementById('issue-debtor-name');
            const cashInput = document.getElementById('issue-cash-value');
            const reasonInput = document.getElementById('issue-reason');
            if (nameInput) nameInput.value = '';
            if (cashInput) cashInput.value = '';
            if (reasonInput) reasonInput.value = '';
            loadCreditorsList();
            loadTotalOwed();
        } else {
            if (statusEl) {
                statusEl.textContent = '❌ ' + (data.error || 'Failed to issue credit');
                statusEl.style.color = '#dc3545';
            }
        }
    } catch (e) {
        console.error('[CREDITORS] Error issuing credit:', e);
        if (statusEl) {
            statusEl.textContent = '❌ Error: ' + e.message;
            statusEl.style.color = '#dc3545';
        }
    }
}

// ============================================================
// CREATE GIFT CARD
// ============================================================

async function createGiftCard() {
    const amount = parseFloat(document.getElementById('gift-card-amount')?.value || '0');
    const paymentMethod = document.getElementById('gift-payment-method')?.value || 'cash';
    const statusEl = document.getElementById('gift-card-status');

    if (!amount || amount <= 0) {
        if (statusEl) {
            statusEl.textContent = '❌ Please enter a valid amount';
            statusEl.style.color = '#dc3545';
        }
        return;
    }

    if (statusEl) {
        statusEl.textContent = '⏳ Creating gift card...';
        statusEl.style.color = '#666';
    }

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/gift-card/create`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: amount,
                payment_method: paymentMethod
            })
        });
        const data = await res.json();
        if (data.status === 'success') {
            if (statusEl) {
                statusEl.textContent = `✅ Gift card ${data.gift_card_id} created for $${amount.toFixed(2)}`;
                statusEl.style.color = '#28a745';
            }
            const amountInput = document.getElementById('gift-card-amount');
            if (amountInput) amountInput.value = '';
            loadCreditorsList();
            loadTotalOwed();
        } else {
            if (statusEl) {
                statusEl.textContent = '❌ ' + (data.error || 'Failed to create gift card');
                statusEl.style.color = '#dc3545';
            }
        }
    } catch (e) {
        console.error('[CREDITORS] Error creating gift card:', e);
        if (statusEl) {
            statusEl.textContent = '❌ Error: ' + e.message;
            statusEl.style.color = '#dc3545';
        }
    }
}

function setGiftAmount(amount) {
    const input = document.getElementById('gift-card-amount');
    if (input) input.value = amount;
}

function clearIssueForm() {
    const nameInput = document.getElementById('issue-debtor-name');
    const cashInput = document.getElementById('issue-cash-value');
    const reasonInput = document.getElementById('issue-reason');
    const statusEl = document.getElementById('issue-status');
    if (nameInput) nameInput.value = '';
    if (cashInput) cashInput.value = '';
    if (reasonInput) reasonInput.value = '';
    if (statusEl) statusEl.textContent = '';
}

// ============================================================
// CASH OUT DEBTOR
// ============================================================

async function cashOutDebtor() {
    if (!currentDebtor) {
        showToast('Please lookup a debtor first', 'warning');
        return;
    }

    if (!currentDebtor.can_cash_out) {
        showToast('This debtor cannot be cashed out', 'error');
        return;
    }

    const cashAmount = currentDebtor.balance * (2 / 3);
    if (cashAmount <= 0) {
        showToast('No balance to cash out', 'warning');
        return;
    }

    if (!confirm(`Cash out ${currentDebtor.debtor}?\n\nCredit balance: $${currentDebtor.balance.toFixed(2)}\nCash payout: $${cashAmount.toFixed(2)}\n\nThis will close their account.`)) {
        return;
    }

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/debtor/cashout`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: currentDebtor.debtor })
        });
        const data = await res.json();
        if (data.status === 'success') {
            showToast(`✅ ${data.message}`, 'success');
            fetchDebtorData(currentDebtor.debtor);
            loadCreditorsList();
            loadTotalOwed();
        } else {
            showToast('❌ ' + (data.error || 'Failed to cash out'), 'error');
        }
    } catch (e) {
        console.error('[CREDITORS] Error cashing out:', e);
        showToast('Error: ' + e.message, 'error');
    }
}

// ============================================================
// DONATE BERNIE
// ============================================================

async function donateBernie() {
    if (!currentDebtor || currentDebtor.debtor !== 'BERNIE') {
        showToast('This is only for Bernie funds', 'warning');
        return;
    }

    const amount = currentDebtor.balance;
    if (amount <= 0) {
        showToast('No balance to donate', 'warning');
        return;
    }

    if (!confirm(`Donate $${amount.toFixed(2)} to Bernie Sanders campaign?\n\nThis will close the Bernie fund.`)) {
        return;
    }

    try {
        const res = await fetch(`${AppConfig.baseUrl}/api/bernie/donate`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount })
        });
        const data = await res.json();
        if (data.status === 'success') {
            showToast(`✅ ${data.message}`, 'success');
            fetchDebtorData('BERNIE');
            loadCreditorsList();
            loadTotalOwed();
        } else {
            showToast('❌ ' + (data.error || 'Failed to donate'), 'error');
        }
    } catch (e) {
        console.error('[CREDITORS] Error donating:', e);
        showToast('Error: ' + e.message, 'error');
    }
}

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
// EXPOSE FUNCTIONS GLOBALLY
// ============================================================

window.initCreditorsTab = initCreditorsTab;
window.loadCreditorsList = loadCreditorsList;
window.loadTotalOwed = loadTotalOwed;
window.lookupDebtor = lookupDebtor;
window.selectDebtorFromDropdown = selectDebtorFromDropdown;
window.fetchDebtorData = fetchDebtorData;
window.renderDebtorDetails = renderDebtorDetails;
window.issueStoreCredit = issueStoreCredit;
window.createGiftCard = createGiftCard;
window.setGiftAmount = setGiftAmount;
window.clearIssueForm = clearIssueForm;
window.cashOutDebtor = cashOutDebtor;
window.donateBernie = donateBernie;
window.showToast = showToast;

console.log('✅ admin-creditors.js loaded');