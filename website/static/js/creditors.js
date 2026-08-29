// Creditors page - Store credit, gift cards, consignors
(function() {
    let debtors = [];
    let giftCards = [];
    let consignors = [];
    let currentTab = 'store-credit';

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Tab switching
    document.addEventListener('click', function(e) {
        const tab = e.target.closest('.cr-tab');
        if (tab) {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.cr-tab').forEach(t => {
                t.style.background = '#e9ecef';
                t.style.color = '#333';
            });
            tab.style.background = '#007bff';
            tab.style.color = 'white';
            
            document.querySelectorAll('.cr-tab-content').forEach(c => c.style.display = 'none');
            const content = document.getElementById('cr-' + tabName);
            if (content) content.style.display = 'flex';
            
            currentTab = tabName;
            
            if (tabName === 'store-credit') loadDebtors();
            else if (tabName === 'gift-cards') loadGiftCards();
            else if (tabName === 'consignors') loadConsignors();
        }
    });

    // ===== STORE CREDIT =====
    async function loadDebtors() {
        const list = document.getElementById('cr-debtors-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch(`${API_BASE}/api/debtor/list`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                debtors = data.debtors || [];
                renderDebtors();
                updateStats();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading debtors:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    function renderDebtors() {
        const list = document.getElementById('cr-debtors-list');
        if (!list) return;
        
        const search = document.getElementById('cr-debtor-search')?.value.toLowerCase().trim() || '';
        let filtered = debtors;
        if (search) {
            filtered = debtors.filter(d => 
                d.debtor && d.debtor.toLowerCase().includes(search)
            );
        }
        
        if (!filtered || filtered.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No creditors found</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Name</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Balance</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Type</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        filtered.forEach(d => {
            const balance = d.balance || 0;
            const isBernie = d.is_bernie || false;
            const isGiftCard = d.is_gift_card || false;
            let typeText = 'Store Credit';
            let typeColor = '#007bff';
            if (isBernie) { typeText = '🌹 Bernie'; typeColor = '#dc3545'; }
            else if (isGiftCard) { typeText = '🎁 Gift Card'; typeColor = '#28a745'; }
            
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${d.debtor || 'Unknown'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: ${balance > 0 ? '#28a745' : '#dc3545'}; font-weight: 600;">$${balance.toFixed(2)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center; color: ${typeColor};">${typeText}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">
                    ${!isBernie && balance > 0 ? `
                        <button onclick="crCashOut('${d.debtor}')" style="padding: 4px 10px; background: #ffc107; color: #333; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;">
                            <i class="fas fa-money-bill-wave"></i> Cash Out
                        </button>
                    ` : ''}
                    <button onclick="crViewHistory('${d.debtor}')" style="padding: 4px 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-history"></i>
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // Cash out
    window.crCashOut = async function(name) {
        const debtor = debtors.find(d => d.debtor === name);
        if (!debtor || debtor.balance <= 0) {
            alert('No balance to cash out');
            return;
        }
        
        const amount = debtor.balance;
        const cashAmount = amount * (2/3);
        
        if (!confirm(`Cash out ${name}?\n\nStore Credit: $${amount.toFixed(2)}\nCash Payout: $${cashAmount.toFixed(2)} (2/3 of credit)`)) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/debtor/cashout`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ 
                    name: name,
                    amount: amount
                })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                showToast(`✅ Cashed out $${cashAmount.toFixed(2)} for ${name}`);
                loadDebtors();
                updateStats();
            } else {
                alert(`Error: ${data.error || 'Failed to cash out'}`);
            }
        } catch (err) {
            console.error('Error cashing out:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // View history
    window.crViewHistory = async function(name) {
        const debtor = debtors.find(d => d.debtor === name);
        if (!debtor) return;
        
        const message = `📋 Transaction History for ${name}\n\nBalance: $${(debtor.balance || 0).toFixed(2)}\nType: ${debtor.is_bernie ? 'Bernie Fund' : debtor.is_gift_card ? 'Gift Card' : 'Store Credit'}`;
        alert(message);
        // Could expand to show full history in a modal
    };

    // Search debtors
    window.crSearchDebtors = function() {
        renderDebtors();
    };

    window.crClearDebtorSearch = function() {
        document.getElementById('cr-debtor-search').value = '';
        renderDebtors();
    };

    // Issue credit modal
    window.crShowIssueCredit = function() {
        document.getElementById('cr-debtor-name').value = '';
        document.getElementById('cr-cash-value').value = '';
        document.getElementById('cr-reason').value = '';
        document.getElementById('cr-credit-preview').textContent = '$0.00';
        document.getElementById('cr-credit-status').style.display = 'none';
        document.getElementById('cr-credit-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('cr-debtor-name').focus(), 100);
    };

    // Update credit preview
    document.addEventListener('input', function(e) {
        if (e.target.id === 'cr-cash-value') {
            const val = parseFloat(e.target.value) || 0;
            const credit = val * 1.5;
            document.getElementById('cr-credit-preview').textContent = `$${credit.toFixed(2)}`;
        }
    });

    // Issue credit
    window.crIssueCredit = async function() {
        const name = document.getElementById('cr-debtor-name').value.trim().toUpperCase();
        const cashValue = parseFloat(document.getElementById('cr-cash-value').value);
        const reason = document.getElementById('cr-reason').value.trim();
        
        if (!name) {
            showCreditStatus('Debtor name is required', 'error');
            return;
        }
        if (!cashValue || cashValue <= 0) {
            showCreditStatus('Please enter a valid cash value', 'error');
            return;
        }
        
        const creditValue = cashValue * 1.5;
        
        const btn = document.getElementById('cr-credit-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Issuing...';
        btn.disabled = true;
        
        try {
            const response = await fetch(`${API_BASE}/api/debtor/issue`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ 
                    name: name,
                    cash_value: cashValue,
                    reason: reason || null
                })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                showCreditStatus(`✅ Issued $${creditValue.toFixed(2)} credit to ${name}`, 'success');
                setTimeout(() => {
                    crCloseCreditModal();
                    loadDebtors();
                    updateStats();
                }, 1000);
            } else {
                showCreditStatus(`❌ Error: ${data.error || 'Failed to issue credit'}`, 'error');
            }
        } catch (err) {
            console.error('Error issuing credit:', err);
            showCreditStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    function showCreditStatus(message, type) {
        const statusDiv = document.getElementById('cr-credit-status');
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        const colors = {
            success: '#d4edda',
            error: '#f8d7da',
            warning: '#fff3cd',
            info: '#cce5ff'
        };
        const textColors = {
            success: '#155724',
            error: '#721c24',
            warning: '#856404',
            info: '#004085'
        };
        statusDiv.style.background = colors[type] || '#f8f9fa';
        statusDiv.style.color = textColors[type] || '#333';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

    window.crCloseCreditModal = function() {
        document.getElementById('cr-credit-modal').style.display = 'none';
    };

    // ===== GIFT CARDS =====
    async function loadGiftCards() {
        const list = document.getElementById('cr-gift-cards-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch(`${API_BASE}/api/gift-card/list`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                giftCards = data.cards || [];
                renderGiftCards();
                updateStats();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading gift cards:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    function renderGiftCards() {
        const list = document.getElementById('cr-gift-cards-list');
        if (!list) return;
        
        if (!giftCards || giftCards.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No gift cards found</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Code</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Value</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Balance</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Recipient</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Created</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Status</th>
                </tr>
            </thead>
            <tbody>`;
        
        giftCards.forEach(card => {
            const statusText = card.balance > 0 ? '✅ Active' : '⛔ Used';
            const statusColor = card.balance > 0 ? '#28a745' : '#dc3545';
            
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-family: monospace;">${card.code || '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333;">$${(card.card_value || 0).toFixed(2)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: ${statusColor}; font-weight: 600;">$${(card.balance || 0).toFixed(2)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${card.recipient_name || '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${card.created_at ? new Date(card.created_at).toLocaleDateString() : '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">
                    <span style="color: ${statusColor};">${statusText}</span>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    window.crRefreshGiftCards = function() {
        loadGiftCards();
    };

    // Create gift card modal
    window.crShowCreateGiftCard = function() {
        document.getElementById('cr-gift-value').value = '';
        document.getElementById('cr-gift-recipient').value = '';
        document.getElementById('cr-gift-notes').value = '';
        document.getElementById('cr-gift-status').style.display = 'none';
        document.getElementById('cr-gift-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('cr-gift-value').focus(), 100);
    };

    window.crCloseGiftModal = function() {
        document.getElementById('cr-gift-modal').style.display = 'none';
    };

    window.crCreateGiftCard = async function() {
        const value = parseFloat(document.getElementById('cr-gift-value').value);
        const recipient = document.getElementById('cr-gift-recipient').value.trim();
        const notes = document.getElementById('cr-gift-notes').value.trim();
        
        if (!value || value <= 0) {
            showGiftStatus('Please enter a valid card value', 'error');
            return;
        }
        if (!recipient) {
            showGiftStatus('Recipient name is required', 'error');
            return;
        }
        
        const btn = document.getElementById('cr-gift-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        btn.disabled = true;
        
        try {
            const response = await fetch(`${API_BASE}/api/gift-card/create`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({
                    card_value: value,
                    recipient_name: recipient,
                    notes: notes || null,
                    payment_method: 'cash'
                })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                const code = data.code || 'GIFT-' + Date.now();
                showGiftStatus(`✅ Gift card created! Code: ${code}`, 'success');
                setTimeout(() => {
                    crCloseGiftModal();
                    loadGiftCards();
                    updateStats();
                }, 1500);
            } else {
                showGiftStatus(`❌ Error: ${data.error || 'Failed to create'}`, 'error');
            }
        } catch (err) {
            console.error('Error creating gift card:', err);
            showGiftStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    function showGiftStatus(message, type) {
        const statusDiv = document.getElementById('cr-gift-status');
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        const colors = {
            success: '#d4edda',
            error: '#f8d7da',
            warning: '#fff3cd',
            info: '#cce5ff'
        };
        const textColors = {
            success: '#155724',
            error: '#721c24',
            warning: '#856404',
            info: '#004085'
        };
        statusDiv.style.background = colors[type] || '#f8f9fa';
        statusDiv.style.color = textColors[type] || '#333';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

    // ===== CONSIGNORS =====
    async function loadConsignors() {
        const list = document.getElementById('cr-consignors-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch(`${API_BASE}/users`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                const allUsers = data.users || [];
                consignors = allUsers.filter(u => u.role === 'consignor');
                renderConsignors();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading consignors:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    function renderConsignors() {
        const list = document.getElementById('cr-consignors-list');
        if (!list) return;
        
        if (!consignors || consignors.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No consignors found</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Username</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Name</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Owed</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Status</th>
                </tr>
            </thead>
            <tbody>`;
        
        consignors.forEach(c => {
            // Calculate owed from records
            const owed = c.owed || 0;
            
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${c.username || '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${c.full_name || '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: ${owed > 0 ? '#28a745' : '#dc3545'}; font-weight: 600;">$${(owed || 0).toFixed(2)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${owed > 0 ? 'active' : 'inactive'}">${owed > 0 ? '💰 Owed' : '✅ Paid'}</span>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // ===== STATS =====
    function updateStats() {
        // Total owed from debtors
        const totalOwed = debtors.reduce((sum, d) => sum + (d.balance || 0), 0);
        const activeDebtors = debtors.filter(d => d.balance > 0 && !d.is_bernie && !d.is_gift_card).length;
        
        // Gift cards count
        const giftCardCount = giftCards.filter(c => c.balance > 0).length;
        
        // Bernie funds
        const bernieFunds = debtors.filter(d => d.is_bernie).reduce((sum, d) => sum + (d.balance || 0), 0);
        
        document.getElementById('cr-total-owed').textContent = `$${totalOwed.toFixed(2)}`;
        document.getElementById('cr-active-debtors').textContent = activeDebtors;
        document.getElementById('cr-gift-cards').textContent = giftCardCount;
        document.getElementById('cr-bernie-funds').textContent = `$${bernieFunds.toFixed(2)}`;
    }

    // ===== TOAST =====
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            background: ${bgColor};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 400px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Enter key search
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('cr-debtor-search');
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    crSearchDebtors();
                }
            });
        }
    });

    // Close modals on outside click
    document.addEventListener('click', function(e) {
        const creditModal = document.getElementById('cr-credit-modal');
        if (creditModal && e.target === creditModal) {
            crCloseCreditModal();
        }
        const giftModal = document.getElementById('cr-gift-modal');
        if (giftModal && e.target === giftModal) {
            crCloseGiftModal();
        }
    });

    // Init
    window.initCreditors = function() {
        console.log('Creditors initialized');
        loadDebtors();
        loadGiftCards();
        loadConsignors();
    };
})();
