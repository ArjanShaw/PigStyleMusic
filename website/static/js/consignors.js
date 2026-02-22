// ============================================================================
// consignors.js - Consignors Tab Functionality
// ============================================================================

// Consignor Management Variables
let consignorsList = [];
let consignorOwedAmounts = {};

async function loadConsignors() {
    const tbody = document.getElementById('consignors-body');
    const loading = document.getElementById('consignors-loading');
    loading.style.display = 'block';
    
    const url = `${AppConfig.baseUrl}/users`;
    const response = await fetch(url);
    const data = await response.json();
    
    let users = data.users || [];
    
    let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
    consignorOwedAmounts = storedOwed;
    
    let totalAdminCommission = 0;
    savedReceipts.forEach(receipt => {
        if (receipt.consignorPayments) {
            receipt.items.forEach(item => {
                if (item.consignor_id && item.type !== 'accessory' && item.type !== 'custom') {
                    const commissionRate = item.commission_rate || 10;
                    totalAdminCommission += item.store_price * (commissionRate / 100);
                }
            });
        }
    });
    
    consignorsList = users.map(u => ({
        id: u.id,
        username: u.username || 'Unknown',
        initials: u.initials || (u.username ? u.username.substring(0,2).toUpperCase() : '??'),
        owed: storedOwed[u.id] || 0,
        recordsSold: allRecords.filter(r => r.consignor_id == u.id && r.status_id === 3).length
    }));
    
    renderConsignors(consignorsList);
    updateConsignorStats(totalAdminCommission);
    
    loading.style.display = 'none';
}

function renderConsignors(consignors) {
    const tbody = document.getElementById('consignors-body');
    if (!consignors.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No consignors found</td></tr>`;
        return;
    }
    let html = '';
    consignors.forEach(c => {
        html += `<tr>
            <td>${c.id}</td>
            <td>${escapeHtml(c.username)}</td>
            <td>${escapeHtml(c.initials)}</td>
            <td>$${c.owed.toFixed(2)}</td>
            <td>${c.recordsSold}</td>
            <td>
                <button class="btn btn-sm btn-success" onclick="showPaymentModal('${c.id}', '${escapeHtml(c.username)}', ${c.owed})">
                    <i class="fas fa-dollar-sign"></i> Clear
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteConsignor('${c.id}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function updateConsignorStats(totalAdminCommission) {
    document.getElementById('total-consignors').textContent = consignorsList.length;
    const totalOwed = consignorsList.reduce((acc, c) => acc + (c.owed || 0), 0);
    document.getElementById('total-credit').textContent = `$${totalOwed.toFixed(2)}`;
    document.getElementById('admin-total-commission').textContent = `$${totalAdminCommission.toFixed(2)}`;
}

// Payment Modal Functions
let currentPaymentUserId = null;
let currentPaymentAmount = 0;

function showPaymentModal(userId, username, amount) {
    if (amount <= 0) {
        alert('This consignor has no owed amount to clear.');
        return;
    }
    currentPaymentUserId = userId;
    currentPaymentAmount = amount;
    document.getElementById('payment-consignor-name').textContent = username;
    document.getElementById('payment-amount').textContent = `$${amount.toFixed(2)}`;
    document.getElementById('payment-modal').style.display = 'flex';
}

function closePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
    currentPaymentUserId = null;
    currentPaymentAmount = 0;
}

async function processPayment() {
    if (!currentPaymentUserId) return;
    
    let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
    delete storedOwed[currentPaymentUserId];
    localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
    
    consignorOwedAmounts = storedOwed;
    const consignor = consignorsList.find(c => c.id == currentPaymentUserId);
    if (consignor) {
        consignor.owed = 0;
    }
    
    renderConsignors(consignorsList);
    
    let totalAdminCommission = 0;
    savedReceipts.forEach(receipt => {
        if (receipt.consignorPayments) {
            receipt.items.forEach(item => {
                if (item.consignor_id && item.type !== 'accessory' && item.type !== 'custom') {
                    const commissionRate = item.commission_rate || 10;
                    totalAdminCommission += item.store_price * (commissionRate / 100);
                }
            });
        }
    });
    updateConsignorStats(totalAdminCommission);
    
    closePaymentModal();
    showStatus(`Payment cleared for ${consignor?.username}`, 'success');
}

async function deleteConsignor(userId) {
    if (!confirm('Are you sure you want to delete this consignor? This action cannot be undone.')) return;
    
    const hasRecords = allRecords.some(r => r.consignor_id == userId);
    if (hasRecords) {
        alert('Cannot delete consignor with existing records. Please reassign or delete records first.');
        return;
    }
    
    const loading = document.getElementById('consignors-loading');
    loading.style.display = 'block';
    
    consignorsList = consignorsList.filter(c => c.id != userId);
    renderConsignors(consignorsList);
    
    let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
    delete storedOwed[userId];
    localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
    
    updateConsignorStats(0);
    showStatus('Consignor deleted', 'success');
    
    loading.style.display = 'none';
}

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'consignors') {
        loadConsignors();
    }
});