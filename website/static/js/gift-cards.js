// Gift Cards page
(function() {
    let giftCards = [];
    let filteredCards = [];

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

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
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response:', text.substring(0, 200));
                throw new Error('Server returned non-JSON response');
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                giftCards = data.gift_cards || [];
                filteredCards = [...giftCards];
                renderGiftCards();
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
                (c.code || '').toLowerCase().includes(search) ||
                (c.recipient_name || '').toLowerCase().includes(search)
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
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        display.forEach(card => {
            const balance = card.balance || 0;
            const statusText = balance > 0 ? '✅ Active' : '⛔ Used';
            const statusColor = balance > 0 ? '#28a745' : '#dc3545';
            
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-family: monospace; font-size: 12px;">${card.code || '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333;">$${(card.card_value || 0).toFixed(2)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: ${statusColor}; font-weight: 600;">$${(balance).toFixed(2)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${card.recipient_name || '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${card.created_at ? new Date(card.created_at).toLocaleDateString() : '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">
                    <span style="color: ${statusColor};">${statusText}</span>
                </td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="gcDelete('${card.code}')" style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
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
        
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        const code = `GIFT-${timestamp}-${random}`;
        
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
                    code: code,
                    card_value: value,
                    charge_amount: value,
                    recipient_name: recipient,
                    notes: notes || null,
                    payment_method: 'cash'
                })
            });
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response:', text.substring(0, 200));
                throw new Error('Server returned non-JSON response');
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                showStatus(`✅ Gift card created! Code: ${data.code || code}`, 'success');
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

    // Delete gift card - removes all accounting entries
    window.gcDelete = async function(code) {
        if (!code) return;
        
        const card = giftCards.find(c => c.code === code);
        if (!card) {
            showToast('Gift card not found', 'error');
            return;
        }
        
        const balance = card.balance || 0;
        let confirmMsg = `Delete gift card ${code}?`;
        if (balance > 0) {
            confirmMsg += `\n\n⚠️ This card has $${balance.toFixed(2)} remaining balance.\nDeleting will remove all accounting records for this card.`;
        } else {
            confirmMsg += '\n\nThis will remove all accounting records for this card.';
        }
        
        if (!confirm(confirmMsg)) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/gift-card/${encodeURIComponent(code)}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getHeaders()
            });
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response:', text.substring(0, 200));
                throw new Error('Server returned non-JSON response');
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                showToast(`✅ Gift card ${code} deleted successfully`, 'success');
                loadGiftCards();
            } else {
                showToast(`❌ Error: ${data.error || 'Failed to delete'}`, 'error');
            }
        } catch (err) {
            console.error('Error deleting gift card:', err);
            showToast(`❌ Error: ${err.message}`, 'error');
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

    // Toast notification
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'info' ? '#17a2b8' : '#ffc107';
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

    // Close modal on outside click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('gc-modal');
        if (modal && e.target === modal) {
            gcCloseModal();
        }
    });

    // Enter key search
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('gc-search');
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    gcSearch();
                }
            });
        }
    });

    // Init
    window.initGiftCards = function() {
        console.log('Gift Cards initialized');
        loadGiftCards();
    };
})();