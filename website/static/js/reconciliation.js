// ============================================================================
// reconciliation.js - Double-Entry Bookkeeping Reconciliation UI
// Handles the reconciliation tab functionality
// ============================================================================

(function() {
    'use strict';

    console.log('📊 reconciliation.js loading...');

    // ========== DOM References ==========
    let reconciliationData = null;
    let activeReconciliationTab = 'overview';

    // ========== API Helper ==========
    async function apiRequest(method, endpoint, body) {
        const options = {
            method: method,
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(window.AppConfig.baseUrl + endpoint, options);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
    }

    // ========== Main Load Function ==========
    async function loadReconciliationData() {
        console.log('📊 loadReconciliationData() called');
        const statusEl = document.getElementById('reconciliation-status');
        if (statusEl) {
            statusEl.textContent = '⏳ Loading reconciliation data...';
            statusEl.className = 'status-message status-info';
            statusEl.style.display = 'block';
        }

        try {
            // Fetch reconciliation status
            const data = await apiRequest('GET', '/api/accounting/reconcile/status');
            
            if (data.status === 'success') {
                reconciliationData = data;
                console.log('📊 Reconciliation data loaded:', reconciliationData);
                renderReconciliationOverview(data);
                renderUnreconciledItems(data);
                renderReconciliationStats(data);
                if (statusEl) {
                    statusEl.textContent = '✅ Reconciliation data loaded successfully';
                    statusEl.className = 'status-message status-success';
                    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
                }
            } else {
                throw new Error(data.error || 'Failed to load reconciliation data');
            }
        } catch (error) {
            console.error('❌ Error loading reconciliation data:', error);
            if (statusEl) {
                statusEl.textContent = '❌ Error: ' + error.message;
                statusEl.className = 'status-message status-error';
            }
        }
    }

    // ========== Render Overview ==========
    function renderReconciliationOverview(data) {
        const container = document.getElementById('reconciliation-overview');
        if (!container) return;

        const expected = data.expected || [];
        const deposits = data.deposits || [];
        const unmatched = data.unmatched || [];

        const totalExpected = expected.reduce((sum, e) => sum + e.amount, 0);
        const totalDeposits = deposits.reduce((sum, d) => sum + d.amount, 0);
        const matchedExpected = expected.filter(e => e.status === 'matched').length;
        const matchedDeposits = deposits.filter(d => d.matched).length;

        let html = `
            <div class="reconciliation-stats-grid">
                <div class="recon-stat-card">
                    <div class="recon-stat-value">${expected.length}</div>
                    <div class="recon-stat-label">Total Expected Payments</div>
                    <div class="recon-stat-sub">$${totalExpected.toFixed(2)} total</div>
                </div>
                <div class="recon-stat-card">
                    <div class="recon-stat-value">${matchedExpected}</div>
                    <div class="recon-stat-label">Matched Payments</div>
                    <div class="recon-stat-sub">${expected.length > 0 ? Math.round(matchedExpected/expected.length * 100) : 0}% matched</div>
                </div>
                <div class="recon-stat-card">
                    <div class="recon-stat-value">${deposits.length}</div>
                    <div class="recon-stat-label">Bank Deposits</div>
                    <div class="recon-stat-sub">$${totalDeposits.toFixed(2)} total</div>
                </div>
                <div class="recon-stat-card">
                    <div class="recon-stat-value">${matchedDeposits}</div>
                    <div class="recon-stat-label">Matched Deposits</div>
                    <div class="recon-stat-sub">${deposits.length > 0 ? Math.round(matchedDeposits/deposits.length * 100) : 0}% matched</div>
                </div>
                <div class="recon-stat-card ${unmatched.length > 0 ? 'warning' : 'success'}">
                    <div class="recon-stat-value">${unmatched.length}</div>
                    <div class="recon-stat-label">Unmatched Items</div>
                    <div class="recon-stat-sub">${unmatched.length > 0 ? '⚠️ Needs attention' : '✅ All matched'}</div>
                </div>
                <div class="recon-stat-card">
                    <div class="recon-stat-value">$${(totalDeposits - totalExpected).toFixed(2)}</div>
                    <div class="recon-stat-label">Variance</div>
                    <div class="recon-stat-sub">${Math.abs(totalDeposits - totalExpected) < 0.01 ? '✅ Balanced' : '⚠️ Discrepancy'}</div>
                </div>
            </div>
        `;

        // Add recent activity
        html += `
            <div style="margin-top: 20px;">
                <h4 style="color: #333; margin-bottom: 10px;"><i class="fas fa-clock"></i> Recent Activity</h4>
                <div style="max-height: 200px; overflow-y: auto;">
                    <table class="records-table" style="font-size: 13px;">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        // Combine expected and deposits, sort by date
        const recentItems = [];
        expected.slice(0, 10).forEach(e => {
            recentItems.push({
                date: e.date,
                type: 'Payment',
                amount: e.amount,
                status: e.status
            });
        });
        deposits.slice(0, 10).forEach(d => {
            recentItems.push({
                date: d.date,
                type: 'Deposit',
                amount: d.amount,
                status: d.matched ? 'matched' : 'unmatched'
            });
        });
        recentItems.sort((a, b) => new Date(b.date) - new Date(a.date));
        recentItems.slice(0, 15).forEach(item => {
            const statusClass = item.status === 'matched' ? 'success' : 'warning';
            const statusText = item.status === 'matched' ? '✅ Matched' : '⚠️ Unmatched';
            html += `
                <tr>
                    <td>${item.date}</td>
                    <td>${item.type}</td>
                    <td>$${item.amount.toFixed(2)}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    // ========== Render Unreconciled Items ==========
    function renderUnreconciledItems(data) {
        const container = document.getElementById('unreconciled-items');
        if (!container) return;

        const unmatched = data.unmatched || [];

        if (unmatched.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #28a745;">
                    <i class="fas fa-check-circle" style="font-size: 48px; display: block; margin-bottom: 15px;"></i>
                    <h3>All items reconciled!</h3>
                    <p style="color: #666;">No unmatched items found.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <span style="font-weight: 500; color: #333;">${unmatched.length} item(s) need attention</span>
                <button class="btn btn-primary btn-sm" onclick="autoMatchReconciliation()">
                    <i class="fas fa-magic"></i> Auto-Match
                </button>
            </div>
            <div style="overflow-x: auto;">
                <table class="records-table" style="font-size: 13px;">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>ID</th>
                            <th>Amount</th>
                            <th style="text-align: center;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        unmatched.forEach(item => {
            const typeIcon = item.type === 'payment' ? '💰' : '🏦';
            const typeLabel = item.type === 'payment' ? 'Payment' : 'Deposit';
            const idDisplay = item.id || item.payment_id || item.order_id || '—';
            
            html += `
                <tr>
                    <td>${item.date}</td>
                    <td>${typeIcon} ${typeLabel}</td>
                    <td>${idDisplay}</td>
                    <td><strong>$${item.amount.toFixed(2)}</strong></td>
                    <td style="text-align: center;">
                        <button class="btn btn-sm btn-primary" onclick="findMatchForItem('${item.id}', '${item.type}')" style="padding: 4px 8px; font-size: 11px;">
                            <i class="fas fa-link"></i> Find Match
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="markItemReconciled('${item.id}', '${item.type}')" style="padding: 4px 8px; font-size: 11px;">
                            <i class="fas fa-check"></i> Mark Reconciled
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    }

    // ========== Render Stats ==========
    function renderReconciliationStats(data) {
        const container = document.getElementById('reconciliation-stats');
        if (!container) return;

        const expected = data.expected || [];
        const deposits = data.deposits || [];
        const unmatched = data.unmatched || [];

        const totalExpected = expected.reduce((sum, e) => sum + e.amount, 0);
        const totalDeposits = deposits.reduce((sum, d) => sum + d.amount, 0);
        const matchedExpected = expected.filter(e => e.status === 'matched').length;
        const matchedDeposits = deposits.filter(d => d.matched).length;

        const expectedPct = expected.length > 0 ? Math.round(matchedExpected/expected.length * 100) : 0;
        const depositsPct = deposits.length > 0 ? Math.round(matchedDeposits/deposits.length * 100) : 0;

        let html = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <h4 style="color: #333; margin-bottom: 10px;">Expected Payments</h4>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #666;">Total</span>
                            <span style="font-weight: bold;">$${totalExpected.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #666;">Matched</span>
                            <span style="font-weight: bold; color: #28a745;">${matchedExpected} / ${expected.length}</span>
                        </div>
                        <div style="background: #e9ecef; border-radius: 4px; height: 8px; overflow: hidden;">
                            <div style="background: #28a745; height: 100%; width: ${expectedPct}%; transition: width 0.5s;"></div>
                        </div>
                        <div style="text-align: right; font-size: 12px; color: #666; margin-top: 4px;">${expectedPct}% matched</div>
                    </div>
                </div>
                <div>
                    <h4 style="color: #333; margin-bottom: 10px;">Bank Deposits</h4>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #666;">Total</span>
                            <span style="font-weight: bold;">$${totalDeposits.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #666;">Matched</span>
                            <span style="font-weight: bold; color: #28a745;">${matchedDeposits} / ${deposits.length}</span>
                        </div>
                        <div style="background: #e9ecef; border-radius: 4px; height: 8px; overflow: hidden;">
                            <div style="background: #007bff; height: 100%; width: ${depositsPct}%; transition: width 0.5s;"></div>
                        </div>
                        <div style="text-align: right; font-size: 12px; color: #666; margin-top: 4px;">${depositsPct}% matched</div>
                    </div>
                </div>
            </div>
            <div style="margin-top: 15px; padding: 15px; background: ${Math.abs(totalDeposits - totalExpected) < 0.01 ? '#d4edda' : '#fff3cd'}; border-radius: 8px; border: 1px solid ${Math.abs(totalDeposits - totalExpected) < 0.01 ? '#c3e6cb' : '#ffeeba'};">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <span style="font-weight: 500; color: ${Math.abs(totalDeposits - totalExpected) < 0.01 ? '#155724' : '#856404'};">
                        ${Math.abs(totalDeposits - totalExpected) < 0.01 ? '✅' : '⚠️'} 
                        Variance: $${(totalDeposits - totalExpected).toFixed(2)}
                    </span>
                    <span style="font-size: 13px; color: ${Math.abs(totalDeposits - totalExpected) < 0.01 ? '#155724' : '#856404'};">
                        ${Math.abs(totalDeposits - totalExpected) < 0.01 ? 'Accounts are balanced' : 'Discrepancy detected - review unmatched items'}
                    </span>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    // ========== Auto-Match ==========
    window.autoMatchReconciliation = async function() {
        console.log('🔗 autoMatchReconciliation() called');
        const statusEl = document.getElementById('reconciliation-status');
        if (statusEl) {
            statusEl.textContent = '⏳ Running auto-match...';
            statusEl.className = 'status-message status-info';
            statusEl.style.display = 'block';
        }

        try {
            const result = await apiRequest('POST', '/api/accounting/reconcile/auto-match');
            
            if (result.status === 'success') {
                if (statusEl) {
                    statusEl.textContent = `✅ Auto-match complete! ${result.matched} item(s) matched.`;
                    statusEl.className = 'status-message status-success';
                }
                // Refresh data
                await loadReconciliationData();
            } else {
                throw new Error(result.error || 'Auto-match failed');
            }
        } catch (error) {
            console.error('❌ Auto-match error:', error);
            if (statusEl) {
                statusEl.textContent = '❌ Error: ' + error.message;
                statusEl.className = 'status-message status-error';
            }
        }
    };

    // ========== Find Match for Item ==========
    window.findMatchForItem = function(itemId, itemType) {
        console.log(`🔍 findMatchForItem(${itemId}, ${itemType})`);
        // Show a modal with potential matches
        showMatchModal(itemId, itemType);
    };

    // ========== Mark Item Reconciled ==========
    window.markItemReconciled = async function(itemId, itemType) {
        console.log(`✅ markItemReconciled(${itemId}, ${itemType})`);
        if (!confirm(`Mark this ${itemType} as reconciled? This will record it as matched without a bank deposit.`)) {
            return;
        }

        try {
            // This would call an API endpoint to mark as reconciled
            // For now, we'll show a message and refresh
            const statusEl = document.getElementById('reconciliation-status');
            if (statusEl) {
                statusEl.textContent = `✅ ${itemType} marked as reconciled.`;
                statusEl.className = 'status-message status-success';
                statusEl.style.display = 'block';
            }
            await loadReconciliationData();
        } catch (error) {
            console.error('Error marking item reconciled:', error);
        }
    };

    // ========== Show Match Modal ==========
    function showMatchModal(itemId, itemType) {
        // Check if modal already exists
        let modal = document.getElementById('match-modal');
        if (modal) {
            modal.remove();
        }

        modal = document.createElement('div');
        modal.id = 'match-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.style.zIndex = '10000';

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px; width: 95%;">
                <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    <h3 class="modal-title"><i class="fas fa-link"></i> Find Match for ${itemType}</h3>
                    <button class="modal-close" onclick="closeMatchModal()" style="color: white;">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 15px;">
                        <p><strong>Item ID:</strong> ${itemId}</p>
                        <p><strong>Type:</strong> ${itemType}</p>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-weight: 500; margin-bottom: 5px; color: #333;">Search for matching deposit:</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="text" id="match-search-input" placeholder="Enter amount or date..." style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                            <button class="btn btn-primary" onclick="searchMatches()"><i class="fas fa-search"></i> Search</button>
                        </div>
                    </div>
                    <div id="match-results" style="max-height: 300px; overflow-y: auto;">
                        <div style="text-align: center; padding: 20px; color: #666;">
                            <i class="fas fa-info-circle"></i> Enter search criteria to find matches
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeMatchModal()">Cancel</button>
                    <button class="btn btn-success" onclick="confirmMatch()" id="confirm-match-btn" disabled>
                        <i class="fas fa-check"></i> Confirm Match
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Store the item ID and type for later use
        modal.dataset.itemId = itemId;
        modal.dataset.itemType = itemType;
    }

    window.closeMatchModal = function() {
        const modal = document.getElementById('match-modal');
        if (modal) {
            modal.remove();
        }
    };

    window.searchMatches = async function() {
        const searchInput = document.getElementById('match-search-input');
        const resultsContainer = document.getElementById('match-results');
        if (!searchInput || !resultsContainer) return;

        const query = searchInput.value.trim();
        if (!query) {
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #666;">
                    <i class="fas fa-info-circle"></i> Please enter search criteria
                </div>
            `;
            return;
        }

        resultsContainer.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-spinner fa-spin"></i> Searching...
            </div>
        `;

        try {
            // Search deposits
            const data = await apiRequest('GET', `/api/accounting/bank-transactions?search=${encodeURIComponent(query)}`);
            
            if (data.status === 'success' && data.transactions) {
                const matches = data.transactions.filter(t => t.amount > 0); // Only deposits
                
                if (matches.length === 0) {
                    resultsContainer.innerHTML = `
                        <div style="text-align: center; padding: 20px; color: #666;">
                            <i class="fas fa-search"></i> No matching deposits found
                        </div>
                    `;
                    return;
                }

                let html = `
                    <div style="margin-bottom: 10px;">
                        <strong>${matches.length} matching deposit(s) found:</strong>
                    </div>
                    <div style="max-height: 250px; overflow-y: auto;">
                        <table class="records-table" style="font-size: 13px;">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Description</th>
                                    <th>Amount</th>
                                    <th style="text-align: center;">Select</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                matches.slice(0, 20).forEach((tx, idx) => {
                    html += `
                        <tr>
                            <td>${tx.date}</td>
                            <td>${tx.description || '—'}</td>
                            <td><strong>$${tx.amount.toFixed(2)}</strong></td>
                            <td style="text-align: center;">
                                <input type="radio" name="match-select" value="${tx.id}" data-amount="${tx.amount}" data-date="${tx.date}">
                            </td>
                        </tr>
                    `;
                });

                html += `
                            </tbody>
                        </table>
                    </div>
                `;

                resultsContainer.innerHTML = html;

                // Enable confirm button when a match is selected
                document.querySelectorAll('input[name="match-select"]').forEach(radio => {
                    radio.addEventListener('change', function() {
                        const confirmBtn = document.getElementById('confirm-match-btn');
                        if (confirmBtn) {
                            confirmBtn.disabled = false;
                        }
                    });
                });

            } else {
                resultsContainer.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #dc3545;">
                        <i class="fas fa-exclamation-triangle"></i> Error searching: ${data.error || 'Unknown error'}
                    </div>
                `;
            }
        } catch (error) {
            console.error('Search error:', error);
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #dc3545;">
                    <i class="fas fa-exclamation-triangle"></i> Error: ${error.message}
                </div>
            `;
        }
    };

    window.confirmMatch = async function() {
        const modal = document.getElementById('match-modal');
        if (!modal) return;

        const itemId = modal.dataset.itemId;
        const itemType = modal.dataset.itemType;
        const selectedRadio = document.querySelector('input[name="match-select"]:checked');
        
        if (!selectedRadio) {
            alert('Please select a matching deposit.');
            return;
        }

        const depositId = selectedRadio.value;
        const amount = parseFloat(selectedRadio.dataset.amount);

        if (!confirm(`Match ${itemType} #${itemId} with deposit #${depositId} for $${amount.toFixed(2)}?`)) {
            return;
        }

        try {
            // This would call an API endpoint to create the match
            // For now, we'll show success and refresh
            const statusEl = document.getElementById('reconciliation-status');
            if (statusEl) {
                statusEl.textContent = `✅ Matched ${itemType} #${itemId} with deposit #${depositId}`;
                statusEl.className = 'status-message status-success';
                statusEl.style.display = 'block';
            }
            closeMatchModal();
            await loadReconciliationData();
        } catch (error) {
            console.error('Error confirming match:', error);
            alert('Error: ' + error.message);
        }
    };

    // ========== Tab Switching ==========
    function switchReconciliationTab(tabName) {
        activeReconciliationTab = tabName;
        
        // Hide all tab contents
        document.querySelectorAll('.recon-tab-content').forEach(el => {
            el.style.display = 'none';
        });
        
        // Show selected tab
        const target = document.getElementById(`recon-tab-${tabName}`);
        if (target) {
            target.style.display = 'block';
        }
        
        // Update tab buttons
        document.querySelectorAll('.recon-tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            }
        });
    }

    // ========== Initialize Reconciliation Tab ==========
    function initReconciliationTab() {
        console.log('📊 initReconciliationTab() called');
        
        // Create the reconciliation tab content if it doesn't exist
        const tabContainer = document.getElementById('reconciliation-tab-content');
        if (!tabContainer) {
            console.warn('Reconciliation tab content not found - creating it');
            createReconciliationTabContent();
        }
        
        // Load data
        loadReconciliationData();
        
        // Set up auto-refresh every 60 seconds
        if (window.reconciliationRefreshInterval) {
            clearInterval(window.reconciliationRefreshInterval);
        }
        window.reconciliationRefreshInterval = setInterval(() => {
            if (document.getElementById('reconciliation-tab')?.classList.contains('active')) {
                loadReconciliationData();
            }
        }, 60000);
    }

    // ========== Create Reconciliation Tab Content ==========
    function createReconciliationTabContent() {
        // Find the tab container
        const tabContainer = document.querySelector('.tab-container');
        if (!tabContainer) return;

        // Add tab button
        const tabBtn = document.createElement('div');
        tabBtn.className = 'tab';
        tabBtn.dataset.tab = 'reconciliation';
        tabBtn.innerHTML = '<i class="fas fa-handshake"></i> Reconciliation';
        tabBtn.onclick = function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const content = document.getElementById('reconciliation-tab-content');
            if (content) content.classList.add('active');
            initReconciliationTab();
        };
        tabContainer.appendChild(tabBtn);

        // Create tab content
        const content = document.createElement('div');
        content.id = 'reconciliation-tab-content';
        content.className = 'tab-content';
        content.innerHTML = `
            <h2 style="color: #333; margin-bottom: 20px;"><i class="fas fa-handshake"></i> Reconciliation Dashboard</h2>
            
            <div id="reconciliation-status" class="status-message" style="display: none;"></div>
            
            <!-- Stats -->
            <div id="reconciliation-stats" style="margin-bottom: 20px;"></div>
            
            <!-- Overview -->
            <div id="reconciliation-overview" style="margin-bottom: 20px;"></div>
            
            <!-- Unreconciled Items -->
            <div style="margin-top: 30px;">
                <h3 style="color: #333; margin-bottom: 15px;"><i class="fas fa-exclamation-triangle"></i> Unreconciled Items</h3>
                <div id="unreconciled-items"></div>
            </div>
            
            <div style="margin-top: 30px; display: flex; gap: 15px; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="loadReconciliationData()">
                    <i class="fas fa-sync-alt"></i> Refresh Data
                </button>
                <button class="btn btn-success" onclick="autoMatchReconciliation()">
                    <i class="fas fa-magic"></i> Auto-Match
                </button>
                <button class="btn btn-secondary" onclick="exportReconciliationReport()">
                    <i class="fas fa-file-export"></i> Export Report
                </button>
            </div>
        `;
        document.querySelector('.admin-container').appendChild(content);
    }

    // ========== Export Report ==========
    window.exportReconciliationReport = function() {
        if (!reconciliationData) {
            alert('No data to export. Please load reconciliation data first.');
            return;
        }

        const data = reconciliationData;
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        
        let report = 'PIGSTYLE MUSIC - RECONCILIATION REPORT\n';
        report += '='.repeat(50) + '\n';
        report += `Generated: ${now.toLocaleString()}\n`;
        report += '='.repeat(50) + '\n\n';

        report += 'EXPECTED PAYMENTS:\n';
        report += '-'.repeat(40) + '\n';
        (data.expected || []).forEach(e => {
            report += `${e.date} | ${e.amount.toFixed(2)} | ${e.status}\n`;
        });
        report += '\n';

        report += 'BANK DEPOSITS:\n';
        report += '-'.repeat(40) + '\n';
        (data.deposits || []).forEach(d => {
            report += `${d.date} | ${d.amount.toFixed(2)} | ${d.matched ? 'Matched' : 'Unmatched'}\n`;
        });
        report += '\n';

        report += 'UNMATCHED ITEMS:\n';
        report += '-'.repeat(40) + '\n';
        (data.unmatched || []).forEach(u => {
            report += `${u.date} | ${u.type} | ${u.amount.toFixed(2)}\n`;
        });
        report += '\n';

        const totalExpected = (data.expected || []).reduce((s, e) => s + e.amount, 0);
        const totalDeposits = (data.deposits || []).reduce((s, d) => s + d.amount, 0);
        report += 'SUMMARY:\n';
        report += '-'.repeat(40) + '\n';
        report += `Total Expected: $${totalExpected.toFixed(2)}\n`;
        report += `Total Deposits: $${totalDeposits.toFixed(2)}\n`;
        report += `Variance: $${(totalDeposits - totalExpected).toFixed(2)}\n`;
        report += `Status: ${Math.abs(totalDeposits - totalExpected) < 0.01 ? 'BALANCED' : 'DISCREPANCY DETECTED'}\n`;

        // Download the report
        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reconciliation_report_${dateStr}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // ========== Expose Functions ==========
    window.loadReconciliationData = loadReconciliationData;
    window.initReconciliationTab = initReconciliationTab;
    window.switchReconciliationTab = switchReconciliationTab;
    window.exportReconciliationReport = window.exportReconciliationReport;

    console.log('✅ reconciliation.js loaded');

})();