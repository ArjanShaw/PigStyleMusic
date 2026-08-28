// Accounting page
(function() {
    let currentTab = 'transactions';
    let accounts = [];
    let journalPage = 1;
    const journalPageSize = 20;

    // Tab switching
    document.addEventListener('click', function(e) {
        const tab = e.target.closest('.acc-tab');
        if (tab) {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.acc-tab').forEach(t => {
                t.style.background = '#e9ecef';
                t.style.color = '#333';
            });
            tab.style.background = '#007bff';
            tab.style.color = 'white';
            
            document.querySelectorAll('.acc-tab-content').forEach(c => c.style.display = 'none');
            const content = document.getElementById('acc-' + tabName);
            if (content) content.style.display = 'flex';
            
            currentTab = tabName;
            
            // Load data for tab
            if (tabName === 'transactions') accLoadTransactions();
            else if (tabName === 'accounts') accLoadAccounts();
            else if (tabName === 'journal') accLoadJournal();
            else if (tabName === 'balance') accLoadBalance();
            else if (tabName === 'monthly') accLoadMonthlyPL();
        }
    });

    // ===== TRANSACTIONS =====
    window.accLoadTransactions = async function() {
        const list = document.getElementById('acc-transactions-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        const filter = document.getElementById('acc-filter').value;
        const search = document.getElementById('acc-search').value.trim();
        
        try {
            let url = '/api/accounting/bank-transactions-full';
            const params = new URLSearchParams();
            if (filter === 'unposted') params.append('filter', 'unposted');
            else if (filter === 'posted') params.append('filter', 'posted');
            else params.append('filter', 'all');
            if (search) params.append('search', search);
            
            const query = params.toString();
            if (query) url += '?' + query;
            
            const response = await fetch(url, { credentials: 'include' });
            const data = await response.json();
            
            if (data.status === 'success') {
                renderTransactions(data.transactions || []);
            } else {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error loading transactions</div>';
            }
        } catch (err) {
            console.error('Error loading transactions:', err);
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ' + err.message + '</div>';
        }
    };

    function renderTransactions(transactions) {
        const list = document.getElementById('acc-transactions-list');
        if (!transactions || transactions.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No transactions found</div>';
            return;
        }
        
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
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #333; font-size: 13px;">${tx.description || 'No description'}</div>
                        <div style="color: #666; font-size: 12px;">${tx.transaction_date || ''} • ID: ${tx.id}</div>
                    </div>
                    <div style="text-align: right; margin-right: 15px;">
                        <div style="font-weight: bold; color: ${isDebit ? '#dc3545' : '#28a745'}; font-size: 14px;">${formattedAmount}</div>
                        <div style="font-size: 11px; color: ${statusColor};">${statusText}</div>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
    }

    window.accSearch = function() {
        accLoadTransactions();
    };

    window.accClearSearch = function() {
        document.getElementById('acc-search').value = '';
        accLoadTransactions();
    };

    window.accRefresh = function() {
        accLoadTransactions();
    };

    // ===== ACCOUNTS =====
    window.accLoadAccounts = async function() {
        const list = document.getElementById('acc-accounts-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch('/api/accounting/accounts', { credentials: 'include' });
            const data = await response.json();
            
            if (data.status === 'success') {
                accounts = data.accounts || [];
                renderAccounts(accounts);
            } else {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error loading accounts</div>';
            }
        } catch (err) {
            console.error('Error loading accounts:', err);
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ' + err.message + '</div>';
        }
    };

    function renderAccounts(accounts) {
        const list = document.getElementById('acc-accounts-list');
        if (!accounts || accounts.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No accounts found</div>';
            return;
        }
        
        let html = '';
        accounts.forEach(acc => {
            const typeColors = {
                asset: '#cce5ff',
                liability: '#fff3cd',
                equity: '#d4edda',
                revenue: '#cce5ff',
                expense: '#f8d7da'
            };
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

    window.accShowAddAccount = function() {
        document.getElementById('acc-add-account-modal').style.display = 'flex';
        document.getElementById('acc-account-code').value = '';
        document.getElementById('acc-account-name').value = '';
        document.getElementById('acc-account-type').value = 'asset';
    };

    window.accCloseModal = function() {
        document.getElementById('acc-add-account-modal').style.display = 'none';
    };

    window.accSaveAccount = async function() {
        const code = document.getElementById('acc-account-code').value.trim();
        const name = document.getElementById('acc-account-name').value.trim();
        const type = document.getElementById('acc-account-type').value;
        
        if (!code || !name) {
            alert('Please enter both code and name');
            return;
        }
        
        try {
            const response = await fetch('/api/accounting/accounts', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, name, type, description: '' })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                accCloseModal();
                accLoadAccounts();
                alert('Account created successfully!');
            } else {
                alert('Error: ' + (data.error || 'Failed to create account'));
            }
        } catch (err) {
            console.error('Error creating account:', err);
            alert('Error: ' + err.message);
        }
    };

    // ===== JOURNAL =====
    window.accLoadJournal = async function() {
        const list = document.getElementById('acc-journal-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        const search = document.getElementById('acc-journal-search').value.trim();
        
        try {
            const params = new URLSearchParams();
            params.append('page', journalPage);
            params.append('per_page', journalPageSize);
            if (search) params.append('search', search);
            
            const response = await fetch(`/api/accounting/journal?${params.toString()}`, { credentials: 'include' });
            const data = await response.json();
            
            if (data.status === 'success') {
                renderJournal(data.entries || []);
            } else {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error loading journal</div>';
            }
        } catch (err) {
            console.error('Error loading journal:', err);
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ' + err.message + '</div>';
        }
    };

    function renderJournal(entries) {
        const list = document.getElementById('acc-journal-list');
        if (!entries || entries.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No journal entries found</div>';
            return;
        }
        
        let html = '';
        entries.forEach(e => {
            const debitAmount = e.debit_amount ? '$' + parseFloat(e.debit_amount).toFixed(2) : '';
            const creditAmount = e.credit_amount ? '$' + parseFloat(e.credit_amount).toFixed(2) : '';
            const diff = (e.debit_amount || 0) - (e.credit_amount || 0);
            const diffColor = Math.abs(diff) > 0.01 ? '#dc3545' : '#28a745';
            
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

    window.accResetJournal = function() {
        document.getElementById('acc-journal-search').value = '';
        journalPage = 1;
        accLoadJournal();
    };

    // ===== BALANCE =====
    window.accLoadBalance = async function() {
        const list = document.getElementById('acc-balance-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch('/api/accounting/balances', { credentials: 'include' });
            const data = await response.json();
            
            if (data.status === 'success') {
                renderBalances(data.balances || []);
            } else {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error loading balances</div>';
            }
        } catch (err) {
            console.error('Error loading balances:', err);
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ' + err.message + '</div>';
        }
    };

    function renderBalances(balances) {
        const list = document.getElementById('acc-balance-list');
        if (!balances || balances.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No balances found</div>';
            return;
        }
        
        // Group by type
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
        
        list.innerHTML = html || '<div style="text-align: center; padding: 20px; color: #999;">No balances found</div>';
    }

    // ===== MONTHLY P&L =====
    window.accLoadMonthlyPL = async function() {
        const list = document.getElementById('acc-monthly-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch('/api/accounting/monthly-pl', { credentials: 'include' });
            const data = await response.json();
            
            if (data.status === 'success') {
                renderMonthlyPL(data.data || []);
            } else {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error loading monthly P&L</div>';
            }
        } catch (err) {
            console.error('Error loading monthly P&L:', err);
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ' + err.message + '</div>';
        }
    };

    function renderMonthlyPL(data) {
        const list = document.getElementById('acc-monthly-list');
        if (!data || data.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No monthly data found</div>';
            return;
        }
        
        // Group by month
        const months = {};
        data.forEach(item => {
            if (!months[item.month]) {
                months[item.month] = { revenue: 0, expenses: 0, items: [] };
            }
            if (item.type === 'revenue') {
                months[item.month].revenue += item.balance || 0;
            } else if (item.type === 'expense') {
                months[item.month].expenses += item.balance || 0;
            }
            months[item.month].items.push(item);
        });
        
        const sortedMonths = Object.keys(months).sort().reverse();
        
        let html = '';
        sortedMonths.forEach(month => {
            const m = months[month];
            const net = m.revenue + m.expenses;
            const netColor = net >= 0 ? '#28a745' : '#dc3545';
            
            html += `
                <div style="border: 1px solid #eee; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-weight: 700; color: #333; font-size: 15px;">${month}</div>
                        <div>
                            <span style="color: #28a745; font-weight: 600;">$${m.revenue.toFixed(2)}</span>
                            <span style="color: #dc3545; font-weight: 600; margin: 0 8px;">/</span>
                            <span style="color: #dc3545; font-weight: 600;">$${Math.abs(m.expenses).toFixed(2)}</span>
                            <span style="font-weight: 600; color: ${netColor}; margin-left: 12px;">Net: $${net.toFixed(2)}</span>
                        </div>
                    </div>
                    <div style="font-size: 11px; color: #666; margin-top: 4px;">
                        ${m.items.map(item => `${item.name}: $${(item.balance || 0).toFixed(2)}`).join(' • ')}
                    </div>
                </div>
            `;
        });
        
        list.innerHTML = html;
    }

    // ===== INIT =====
    window.initAccounting = function() {
        console.log('Accounting initialized');
        accLoadTransactions();
    };

    // Close modal on outside click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('acc-add-account-modal');
        if (modal && e.target === modal) {
            accCloseModal();
        }
    });

})();
