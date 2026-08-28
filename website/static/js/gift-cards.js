// Gift Cards page
(function() {
    let giftCards = [];
    let filteredCards = [];

    const API_BASE = '';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Load gift cards
    async function loadGiftCards() {
        const list = document.getElementById('gc-list');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch(`${API_BASE}/api/gift-card/list`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                giftCards = data.cards || [];
                filteredCards = [...giftCards];
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

    // Render gift cards
    function renderGiftCards() {
        const list = document.getElementById('gc-list');
        if (!list) return;
        
        const search = document.getElementById('gc-search')?.value.toLowerCase().trim() || '';
        let display = filteredCards;
        if (search) {
            display = filteredCards.filter(c => 
                c.code?.toLowerCase().includes(search) ||
                c.recipient_name?.toLowerCase().includes(search)
            );
        }
        
        if (!display || display.length === 0) {
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
        
        display.forEach(card => {
            const statusText = card.balance > 0 ? '✅ Active' : '⛔ Used';
            const statusColor = card.balance > 0 ? '#28a745' : '#dc3545';
            
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-family: monospace; font-size: 12px;">${card.code || '—'}</td>
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

    // Update stats
    function updateStats() {
        const total = giftCards.length;
        const active = giftCards.filter(c => c.balance > 0).length;
        const totalValue = giftCards.reduce((sum, c) => sum + (c.card_value || 0), 0);
        
        document.getElementById('gc-total').textContent = total;
        document.getElementById('gc-active').textContent = active;
        document.getElementById('gc-total-value').textContent = `$${totalValue.toFixed(2)}`;
    }

    // Show create modal
    window.gcShowCreate = function() {
        document.getElementById('gc-value').value = '';
        document.getElementById('gc-recipient').value = '';
        document.getElementById('gc-notes').value = '';
        document.getElementById('gc-status').style.display = 'none';
        document.getElementById('gc-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('gc-value').focus(), 100);
    };

    window.gcCloseModal = function() {
        document.getElementById('gc-modal').style.display = 'none';
    };

    // Create gift card
    window.gcCreate = async function() {
        const value = parseFloat(document.getElementById('gc-value').value);
        const recipient = document.getElementById('gc-recipient').value.trim();
        const notes = document.getElementById('gc-notes').value.trim();
        
        if (!value || value <= 0) {
            showStatus('Please enter a valid card value', 'error');
            return;
        }
        if (!recipient) {
            showStatus('Recipient name is required', 'error');
            return;
        }
        
        const btn = document.getElementById('gc-btn');
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
                showStatus(`✅ Gift card created! Code: ${code}`, 'success');
                setTimeout(() => {
                    gcCloseModal();
                    loadGiftCards();
                }, 1500);
            } else {
                showStatus(`❌ Error: ${data.error || 'Failed to create'}`, 'error');
            }
        } catch (err) {
            console.error('Error creating gift card:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    // Search
    window.gcSearch = function() {
        renderGiftCards();
    };

    window.gcClear = function() {
        document.getElementById('gc-search').value = '';
        renderGiftCards();
    };

    // Refresh
    window.gcRefresh = function() {
        loadGiftCards();
    };

    // Show status
    function showStatus(message, type) {
        const statusDiv = document.getElementById('gc-status');
        if (!statusDiv) return;
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

    // Close modal on outside click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('gc-modal');
        if (modal && e.target === modal) {
            gcCloseModal();
        }
    });

    // Init
    window.initGiftCards = function() {
        console.log('Gift Cards initialized');
        loadGiftCards();
    };
})();
