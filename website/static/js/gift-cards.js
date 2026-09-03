// Gift Cards page - Link credit to existing barcodes
(function() {
    let giftCards = [];
    let filteredCards = [];
    let barcodeCheckResult = null;
    let isExistingCard = false;

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // ============ Load Gift Cards ============
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

    // ============ Render Gift Cards ============
    function renderGiftCards() {
        const list = document.getElementById('gc-list');
        if (!list) return;
        
        const search = document.getElementById('gc-search')?.value.toLowerCase().trim() || '';
        let display = filteredCards;
        if (search) {
            display = filteredCards.filter(c => 
                (c.code || '').toLowerCase().includes(search) ||
                (c.recipient_name || '').toLowerCase().includes(search) ||
                (c.record_info || '').toLowerCase().includes(search)
            );
        }
        
        if (!display || display.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No gift cards found</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Barcode</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Recipient</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Record</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Credit</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Balance</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Status</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        display.forEach(card => {
            const balance = card.balance || 0;
            const statusText = balance > 0 ? '✅ Active' : '⛔ Used';
            const statusColor = balance > 0 ? '#28a745' : '#dc3545';
            const recipient = card.recipient_name || '—';
            const recordInfo = card.record_info || '—';
            
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-family: monospace; font-size: 12px;">${card.code || '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${recipient}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${recordInfo}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333;">$${(card.card_value || 0).toFixed(2)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: ${statusColor}; font-weight: 600;">$${(balance).toFixed(2)}</td>
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

    // ============ Check Barcode in System ============
    async function checkBarcode(barcode) {
        if (!barcode || barcode.length < 3) {
            return { exists: false, error: 'Barcode too short' };
        }
        
        try {
            // First check via the gift-card balance endpoint (checks if it's already a gift card)
            const balanceResponse = await fetch(`${API_BASE}/api/gift-card/balance/${encodeURIComponent(barcode)}`, {
                credentials: 'include',
                headers: getHeaders()
            });
            
            let isGiftCard = false;
            let balance = 0;
            let recipient = '';
            
            if (balanceResponse.ok) {
                const balanceData = await balanceResponse.json();
                if (balanceData.status === 'success') {
                    isGiftCard = true;
                    balance = balanceData.balance || 0;
                    recipient = balanceData.recipient || '';
                }
            }
            
            if (isGiftCard) {
                return {
                    exists: true,
                    type: 'gift_card',
                    balance: balance,
                    recipient: recipient,
                    message: `⚠️ This barcode already has a gift card with balance $${balance.toFixed(2)}`
                };
            }
            
            // ====== NEW: Check if it's a gift card code format ======
            // Gift card codes usually start with GC- or GIFT-
            const isGiftCardCode = barcode.startsWith('GC-') || barcode.startsWith('GIFT-');
            
            if (isGiftCardCode) {
                return {
                    exists: true,
                    type: 'new_gift_card',
                    message: '✅ Blank gift card barcode - ready to activate',
                    isBlankGiftCard: true
                };
            }
            
            // Check if barcode exists in records table (only for non-gift-card codes)
            const checkResponse = await fetch(`${API_BASE}/api/gift-card/check-barcode`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ code: barcode })
            });
            
            const checkData = await checkResponse.json();
            
            if (checkData.status === 'success' && checkData.exists) {
                return {
                    exists: true,
                    type: 'record',
                    record: checkData.record,
                    message: `✅ Barcode found in inventory: ${checkData.record.artist} - ${checkData.record.title}`
                };
            }
            
            // Barcode not found anywhere - but we'll allow it (it's a new barcode)
            return {
                exists: false,
                available: true,
                type: 'new_barcode',
                message: '✅ New barcode - ready to activate as gift card'
            };
            
        } catch (err) {
            console.error('Error checking barcode:', err);
            return {
                exists: false,
                error: 'Could not verify barcode',
                message: '⚠️ Unable to verify barcode'
            };
        }
    }

    // ============ Show Create Modal ============
    window.gcShowCreate = function() {
        document.getElementById('gc-barcode').value = '';
        document.getElementById('gc-value').value = '';
        document.getElementById('gc-recipient').value = '';
        document.getElementById('gc-notes').value = '';
        document.getElementById('gc-payment-method').value = 'cash';
        document.getElementById('gc-status').style.display = 'none';
        document.getElementById('gc-barcode-status').textContent = '';
        document.getElementById('gc-record-info').style.display = 'none';
        document.getElementById('gc-existing-card').style.display = 'none';
        barcodeCheckResult = null;
        isExistingCard = false;
        document.getElementById('gc-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('gc-barcode').focus(), 100);
    };

    window.gcCloseModal = function() {
        document.getElementById('gc-modal').style.display = 'none';
        barcodeCheckResult = null;
        isExistingCard = false;
    };

    // ============ Scan Barcode ============
    window.gcScanBarcode = function() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showStatus('Camera not supported on this device', 'warning');
            return;
        }
        alert('📷 Please use a barcode scanner app or enter the barcode manually.');
        document.getElementById('gc-barcode').focus();
    };

    // ============ Validate Barcode on Input ============
    async function onBarcodeInput(barcode) {
        const statusDiv = document.getElementById('gc-barcode-status');
        const recordInfoDiv = document.getElementById('gc-record-info');
        const existingCardDiv = document.getElementById('gc-existing-card');
        const recordDetailsDiv = document.getElementById('gc-record-details');
        const existingDetailsDiv = document.getElementById('gc-existing-details');
        
        if (!barcode || barcode.length < 3) {
            statusDiv.textContent = '';
            recordInfoDiv.style.display = 'none';
            existingCardDiv.style.display = 'none';
            barcodeCheckResult = null;
            isExistingCard = false;
            return;
        }
        
        statusDiv.textContent = '⏳ Checking barcode...';
        statusDiv.style.color = '#666';
        
        const result = await checkBarcode(barcode);
        barcodeCheckResult = result;
        
        if (result.error) {
            statusDiv.textContent = result.message || '❌ Error checking barcode';
            statusDiv.style.color = '#dc3545';
            recordInfoDiv.style.display = 'none';
            existingCardDiv.style.display = 'none';
            return;
        }
        
        if (result.type === 'gift_card') {
            // Barcode already has a gift card
            statusDiv.textContent = result.message;
            statusDiv.style.color = '#856404';
            recordInfoDiv.style.display = 'none';
            existingCardDiv.style.display = 'block';
            existingCardDiv.style.background = '#fff3cd';
            existingCardDiv.style.borderLeft = '4px solid #ffc107';
            existingDetailsDiv.innerHTML = `
                <strong>⚠️ Existing Gift Card</strong><br>
                Balance: <strong>$${result.balance.toFixed(2)}</strong><br>
                Recipient: ${result.recipient || 'Unknown'}<br><br>
                <span style="color: #856404;">You can add more credit to this card.</span>
            `;
            isExistingCard = true;
            return;
        }
        
        if (result.type === 'new_gift_card' || result.type === 'new_barcode') {
            // Blank gift card barcode or new barcode - ready to activate
            statusDiv.textContent = result.message;
            statusDiv.style.color = '#28a745';
            existingCardDiv.style.display = 'none';
            recordInfoDiv.style.display = 'block';
            recordInfoDiv.style.background = '#d4edda';
            recordInfoDiv.style.borderLeft = '4px solid #28a745';
            recordDetailsDiv.innerHTML = `
                <strong>✅ Ready to Activate</strong><br>
                Barcode: <strong>${barcode}</strong><br>
                Type: New Gift Card<br>
                <span style="color: #155724;">This barcode will be activated with the credit amount you enter.</span>
            `;
            isExistingCard = false;
            return;
        }
        
        if (result.type === 'record') {
            // Barcode found in records table
            statusDiv.textContent = result.message;
            statusDiv.style.color = '#17a2b8';
            existingCardDiv.style.display = 'none';
            recordInfoDiv.style.display = 'block';
            recordInfoDiv.style.background = '#e8f0fe';
            recordInfoDiv.style.borderLeft = '4px solid #007bff';
            recordDetailsDiv.innerHTML = `
                <strong>✅ Barcode Found in Inventory</strong><br>
                Artist: <strong>${result.record.artist}</strong><br>
                Title: <strong>${result.record.title}</strong><br>
                Status: ${result.record.status_name || 'Active'}<br>
                Store Price: $${(result.record.store_price || 0).toFixed(2)}<br><br>
                <span style="color: #004085;">Credit will be linked to this record's barcode.</span>
            `;
            isExistingCard = false;
            return;
        }
        
        // Barcode not found - but we'll allow it
        statusDiv.textContent = result.message || '✅ New barcode - ready to activate';
        statusDiv.style.color = '#28a745';
        recordInfoDiv.style.display = 'block';
        recordInfoDiv.style.background = '#d4edda';
        recordInfoDiv.style.borderLeft = '4px solid #28a745';
        recordDetailsDiv.innerHTML = `
            <strong>✅ New Barcode</strong><br>
            Barcode: <strong>${barcode}</strong><br>
            <span style="color: #155724;">This barcode will be activated as a new gift card.</span>
        `;
        isExistingCard = false;
    }

    // ============ Create Gift Card (Link Credit to Barcode) ============
    window.gcCreate = async function() {
        const barcode = document.getElementById('gc-barcode').value.trim().toUpperCase();
        const value = parseFloat(document.getElementById('gc-value').value);
        const recipient = document.getElementById('gc-recipient').value.trim();
        const notes = document.getElementById('gc-notes').value.trim();
        const paymentMethod = document.getElementById('gc-payment-method').value;
        
        // Validation
        if (!barcode || barcode.length < 3) {
            showStatus('Please enter a valid barcode', 'error');
            return;
        }
        
        if (!value || value <= 0) {
            showStatus('Please enter a valid credit amount', 'error');
            return;
        }
        
        if (!recipient) {
            showStatus('Recipient name is required', 'error');
            return;
        }
        
        // Check if barcode exists in system (last check before submission)
        const checkResult = await checkBarcode(barcode);
        if (checkResult.type === 'gift_card') {
            // Adding to existing card - confirm
            const confirmAdd = confirm(
                `⚠️ This barcode already has a gift card.\n\n` +
                `Current balance: $${checkResult.balance.toFixed(2)}\n` +
                `Adding: $${value.toFixed(2)}\n` +
                `New balance: $${(checkResult.balance + value).toFixed(2)}\n\n` +
                `Continue?`
            );
            if (!confirmAdd) return;
        } else if (checkResult.type === 'new_gift_card' || checkResult.type === 'new_barcode' || checkResult.type === 'record') {
            // All these are valid - proceed
            // For records, we're linking credit to the record's barcode
            // For new barcodes, we're activating a new gift card
        } else {
            // Should not happen, but just in case
            showStatus('❌ Unable to verify barcode. Please try again.', 'error');
            return;
        }
        
        const btn = document.getElementById('gc-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        btn.disabled = true;
        
        try {
            const response = await fetch(`${API_BASE}/api/gift-card/create`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({
                    code: barcode,
                    card_value: value,
                    charge_amount: value,
                    recipient_name: recipient,
                    notes: notes || null,
                    payment_method: paymentMethod
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
                let message = '';
                if (checkResult.type === 'gift_card') {
                    message = `✅ Added $${value.toFixed(2)} to existing card ${barcode}`;
                } else if (checkResult.type === 'record') {
                    message = `✅ Gift card linked to record barcode: ${barcode}`;
                } else {
                    message = `✅ Gift card ${barcode} activated with $${value.toFixed(2)}`;
                }
                showStatus(message, 'success');
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

    // ============ Delete Gift Card ============
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

    // ============ Print Barcodes ============
    window.gcPrintBarcodes = function() {
        document.getElementById('gc-print-count').value = 10;
        document.getElementById('gc-print-modal').style.display = 'flex';
    };

    window.gcClosePrintModal = function() {
        document.getElementById('gc-print-modal').style.display = 'none';
    };

    window.gcGeneratePrintBarcodes = function() {
        const count = parseInt(document.getElementById('gc-print-count').value) || 10;
        if (count < 1 || count > 100) {
            showToast('Please enter a number between 1 and 100', 'error');
            return;
        }
        
        // Generate barcode codes and open print window
        const codes = [];
        for (let i = 0; i < count; i++) {
            const random = Math.random().toString(36).substring(2, 10).toUpperCase();
            codes.push(`GC-${random}`);
        }
        
        // Open print window
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            showToast('Please allow popups for barcode printing', 'error');
            return;
        }
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Gift Card Barcodes</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .barcode-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
                .barcode-item { text-align: center; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
                .barcode-item .code { font-family: monospace; font-size: 16px; font-weight: bold; margin: 10px 0; }
                .barcode-item .label { font-size: 12px; color: #666; }
                .barcode-item svg { max-width: 200px; height: auto; }
                @media print { .no-print { display: none; } }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        </head>
        <body>
            <h2>PigStyle Music - Gift Card Barcodes</h2>
            <p>Generated: ${new Date().toLocaleDateString()}</p>
            <div class="barcode-grid">`;
        
        codes.forEach(code => {
            html += `
                <div class="barcode-item">
                    <div class="label">Gift Card</div>
                    <svg id="barcode-${code}"></svg>
                    <div class="code">${code}</div>
                </div>`;
        });
        
        html += `
            </div>
            <div class="no-print" style="margin-top: 20px; text-align: center;">
                <button onclick="window.print()" style="padding: 10px 30px; background: #28a745; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">
                    🖨️ Print
                </button>
                <button onclick="window.close()" style="padding: 10px 30px; background: #6c757d; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; margin-left: 10px;">
                    Close
                </button>
            </div>
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    try {
                        const codes = ${JSON.stringify(codes)};
                        codes.forEach(function(code) {
                            const svg = document.getElementById('barcode-' + code);
                            if (svg && typeof JsBarcode !== 'undefined') {
                                JsBarcode(svg, code, {
                                    format: 'CODE128',
                                    width: 2,
                                    height: 60,
                                    displayValue: false,
                                    background: '#ffffff',
                                    lineColor: '#000000'
                                });
                            }
                        });
                    } catch(e) {
                        console.error('Barcode generation error:', e);
                    }
                });
            <\/script>
        </body>
        </html>`;
        
        printWindow.document.write(html);
        printWindow.document.close();
    };

    // ============ Search / Filter ============
    window.gcSearch = function() {
        renderGiftCards();
    };

    window.gcClear = function() {
        document.getElementById('gc-search').value = '';
        renderGiftCards();
    };

    window.gcRefresh = function() {
        loadGiftCards();
    };

    // ============ Status Helpers ============
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
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ============ Event Listeners ============
    document.addEventListener('DOMContentLoaded', function() {
        // Barcode input - real-time validation
        const barcodeInput = document.getElementById('gc-barcode');
        if (barcodeInput) {
            barcodeInput.addEventListener('input', function(e) {
                onBarcodeInput(this.value.trim());
            });
            
            barcodeInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    onBarcodeInput(this.value.trim());
                    document.getElementById('gc-value').focus();
                }
            });
        }

        // Search input
        const searchInput = document.getElementById('gc-search');
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    gcSearch();
                }
            });
        }
    });

    // ============ Close modal on outside click ============
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('gc-modal');
        if (modal && e.target === modal) {
            gcCloseModal();
        }
        const printModal = document.getElementById('gc-print-modal');
        if (printModal && e.target === printModal) {
            gcClosePrintModal();
        }
    });

    // ============ Init ============
    window.initGiftCards = function() {
        console.log('Gift Cards initialized');
        loadGiftCards();
    };

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
})();