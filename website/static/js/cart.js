// Cart - Global cart singleton with full checkout
(function() {
    'use strict';

    const STORAGE_KEY = 'pigstyle_cart';
    const API_BASE = 'http://localhost:5000';

    // ===== Cart Storage =====
    function getCart() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    function saveCart(cart) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
        updateBadge();
    }

    // ===== Global Cart Object =====
    window.cart = {
        items: getCart(),

        getItems() {
            return this.items;
        },

        addItem(item) {
            if (!item.title || item.price === undefined) {
                console.warn('Invalid cart item:', item);
                return false;
            }
            
            const existing = this.items.find(i =>
                i.type === item.type &&
                i.id === item.id &&
                JSON.stringify(i.options) === JSON.stringify(item.options || {})
            );
            
            if (existing) {
                existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
            } else {
                item.id = item.id || Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                item.quantity = item.quantity || 1;
                this.items.push(item);
            }
            
            saveCart(this.items);
            return true;
        },

        removeItem(id) {
            this.items = this.items.filter(item => item.id !== id);
            saveCart(this.items);
        },

        updateQuantity(id, quantity) {
            const item = this.items.find(i => i.id === id);
            if (!item) return false;
            
            if (quantity <= 0) {
                this.removeItem(id);
            } else {
                item.quantity = quantity;
                saveCart(this.items);
            }
            return true;
        },

        clear() {
            this.items = [];
            saveCart(this.items);
        },

        getTotal() {
            return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        },

        getItemCount() {
            return this.items.reduce((sum, item) => sum + item.quantity, 0);
        },

        isEmpty() {
            return this.items.length === 0;
        },

        getCheckoutPayload() {
            return this.items.map(item => {
                if (item.type === 'record') {
                    return {
                        copy_id: item.id,
                        artist: item.artist || '',
                        title: item.title,
                        condition: item.condition || 'Unknown',
                        price: item.price,
                        quantity: item.quantity
                    };
                } else if (item.type === 'accessory') {
                    return {
                        accessory_id: item.id,
                        title: item.title,
                        price: item.price,
                        quantity: item.quantity
                    };
                } else {
                    return {
                        title: item.title,
                        price: item.price,
                        quantity: item.quantity
                    };
                }
            });
        }
    };

    // ===== Badge Update =====
    function updateBadge() {
        const count = window.cart.getItemCount();
        const badge = document.getElementById('cartBadge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline' : 'none';
        }
    }

    // ===== Render Cart UI =====
    window.renderCart = function() {
        const container = document.getElementById('cartResponse');
        if (!container) return;
        
        const items = window.cart.getItems();
        
        if (items.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #888;">
                    <div style="margin-bottom: 10px; font-size: 48px;">🛒</div>
                    <p style="font-size: 18px;">Your cart is empty</p>
                    <p style="font-size: 13px; margin-top: 5px;">Start shopping to add items!</p>
                </div>
            `;
            updateBadge();
            return;
        }
        
        let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
        let total = 0;
        
        items.forEach((item) => {
            const itemTotal = (item.price || 0) * (item.quantity || 1);
            total += itemTotal;
            
            html += `
                <div style="display: flex; align-items: center; gap: 12px; background: #f8f8f8; border-radius: 8px; padding: 10px; border: 1px solid #eee;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; color: #333; font-size: 14px;">${item.title || 'Item'}</div>
                        <div style="color: #666; font-size: 12px;">${item.artist || ''} ${item.type ? '[' + item.type + ']' : ''}</div>
                        <div style="color: #ff6b6b; font-weight: bold; font-size: 14px;">$${(item.price || 0).toFixed(2)}</div>
                    </div>
                    <div style="font-weight: bold; color: #333; font-size: 14px; min-width: 70px; text-align: right;">$${itemTotal.toFixed(2)}</div>
                    <button onclick="window.removeCartItem('${item.id}')" style="background: none; border: none; color: #dc3545; font-size: 20px; cursor: pointer; padding: 0 4px;">×</button>
                </div>
            `;
        });
        
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 2px solid #ddd; margin-top: 5px;">
                <span style="font-size: 16px; font-weight: bold; color: #333;">Total:</span>
                <span style="font-size: 24px; font-weight: bold; color: #ff6b6b;">$${total.toFixed(2)}</span>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button onclick="window.clearCart()" style="flex: 1; padding: 10px; background: #dc3545; color: white; border: none; border-radius: 30px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-trash"></i> Clear Cart
                </button>
                <button onclick="window.openCheckout()" style="flex: 2; padding: 10px; background: #28a745; color: white; border: none; border-radius: 30px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-credit-card"></i> Checkout
                </button>
            </div>
        `;
        html += '</div>';
        
        container.innerHTML = html;
        updateBadge();
    };

    // ===== Cart Actions =====
    window.updateCartItem = function(itemId, delta) {
        const items = window.cart.getItems();
        const item = items.find(i => i.id === itemId);
        if (item) {
            const newQty = (item.quantity || 1) + delta;
            if (newQty <= 0) {
                window.cart.removeItem(itemId);
            } else {
                window.cart.updateQuantity(itemId, newQty);
            }
            window.renderCart();
        }
    };

    window.removeCartItem = function(itemId) {
        window.cart.removeItem(itemId);
        window.renderCart();
    };

    window.clearCart = function() {
        if (confirm('Are you sure you want to clear your cart?')) {
            window.cart.clear();
            window.renderCart();
        }
    };

    // ===== Get User Role =====
    function getUserRole() {
        try {
            const userData = localStorage.getItem('pigstyle_user');
            if (userData) {
                const user = JSON.parse(userData);
                return user.role || null;
            }
        } catch {}
        return null;
    }

    // ===== CHECKOUT =====
    let checkoutState = {
        totalDue: 0,
        remaining: 0,
        giftCardCode: null,
        giftCardBalance: 0,
        paymentEntries: [],
        selectedItems: [],
        cachedDeviceId: null,
        posCheckoutId: null,
        paymentProcessing: false,
        cardSubmitted: false,
        posSubmitted: false,
        cardConfirmed: false,
        posConfirmed: false
    };

    // ===== Update Remaining Balance =====
    function updateRemaining() {
        const total = checkoutState.totalDue;
        
        const cardAmount = parseFloat(document.getElementById('card-amount').value) || 0;
        const cashAmount = parseFloat(document.getElementById('cash-amount').value) || 0;
        const giftAmount = parseFloat(document.getElementById('giftcard-amount').value) || 0;
        const posAmount = parseFloat(document.getElementById('pos-amount').value) || 0;
        
        const totalPaid = cardAmount + cashAmount + giftAmount + posAmount;
        const remaining = Math.max(0, total - totalPaid);
        
        checkoutState.remaining = remaining;
        document.getElementById('checkout-remaining').textContent = '$' + remaining.toFixed(2);
        document.getElementById('card-amount-display').textContent = cardAmount.toFixed(2);
        document.getElementById('pos-amount-display').textContent = posAmount.toFixed(2);
        
        // Update change display for cash
        const cashAmountVal = parseFloat(document.getElementById('cash-amount').value) || 0;
        const changeDisplay = document.getElementById('change-display-container');
        const changeAmount = document.getElementById('change-amount');
        if (cashAmountVal > total) {
            changeDisplay.style.display = 'block';
            changeAmount.textContent = (cashAmountVal - total).toFixed(2);
        } else {
            changeDisplay.style.display = 'none';
        }
        
        updatePaymentSummary();
        updateButtons();
    }

    // ===== Payment Summary =====
    function updatePaymentSummary() {
        const cardAmount = parseFloat(document.getElementById('card-amount').value) || 0;
        const cashAmount = parseFloat(document.getElementById('cash-amount').value) || 0;
        const giftAmount = parseFloat(document.getElementById('giftcard-amount').value) || 0;
        const posAmount = parseFloat(document.getElementById('pos-amount').value) || 0;
        
        const entries = [];
        if (cardAmount > 0) entries.push({ method: 'Card (Square)', amount: cardAmount });
        if (cashAmount > 0) entries.push({ method: 'Cash', amount: cashAmount });
        if (giftAmount > 0) entries.push({ method: 'Gift Card', amount: giftAmount });
        if (posAmount > 0) entries.push({ method: 'POS Request', amount: posAmount });
        
        const summaryDiv = document.getElementById('payment-summary');
        const listDiv = document.getElementById('payment-entries-list');
        
        if (entries.length > 0) {
            summaryDiv.style.display = 'block';
            let html = '';
            entries.forEach(entry => {
                html += `<div style="display: flex; justify-content: space-between; padding: 2px 0;">
                    <span>${entry.method}</span>
                    <span style="font-weight: 600;">$${entry.amount.toFixed(2)}</span>
                </div>`;
            });
            listDiv.innerHTML = html;
        } else {
            summaryDiv.style.display = 'none';
        }
    }

    // ===== Update Buttons =====
    function updateButtons() {
        const isAdmin = getUserRole() === 'admin';
        
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            if (isAdmin) {
                submitBtn.style.display = 'inline-block';
                if (checkoutState.paymentProcessing) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '⏳ Submitting...';
                } else if (checkoutState.cardSubmitted || checkoutState.posSubmitted) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fas fa-check"></i> Submitted';
                } else {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
                }
            } else {
                submitBtn.style.display = 'none';
            }
        }
        
        const completeBtn = document.getElementById('checkout-complete-btn');
        if (completeBtn) {
            if (isAdmin) {
                completeBtn.style.display = 'inline-block';
                completeBtn.disabled = false;
                completeBtn.innerHTML = '<i class="fas fa-check"></i> Complete';
            } else {
                completeBtn.style.display = 'none';
            }
        }
    }

    // ===== OPEN CHECKOUT =====
    window.openCheckout = function() {
        console.log('🛒 Opening checkout...');
        
        if (window.cart.isEmpty()) {
            showToast('Your cart is empty!', 'warning');
            return;
        }

        const isAdmin = getUserRole() === 'admin';
        
        const items = window.cart.getItems();
        const total = window.cart.getTotal();
        
        checkoutState.selectedItems = items;
        checkoutState.totalDue = total;
        checkoutState.remaining = total;
        checkoutState.paymentEntries = [];
        checkoutState.cachedDeviceId = null;
        checkoutState.posCheckoutId = null;
        checkoutState.paymentProcessing = false;
        checkoutState.cardSubmitted = false;
        checkoutState.posSubmitted = false;
        checkoutState.cardConfirmed = false;
        checkoutState.posConfirmed = false;

        // Show order summary
        let summaryHtml = '';
        items.forEach(item => {
            const lineTotal = (item.price || 0) * (item.quantity || 1);
            summaryHtml += `
                <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f0f0f0;">
                    <div>
                        <div style="font-weight: 500; font-size: 13px; color: #333;">${item.title}</div>
                        <div style="font-size: 12px; color: #666;">${item.quantity} × $${(item.price || 0).toFixed(2)}</div>
                    </div>
                    <div style="font-weight: 600; font-size: 14px; color: #ff6b6b;">$${lineTotal.toFixed(2)}</div>
                </div>
            `;
        });
        
        const itemsList = document.getElementById('checkout-items-list');
        const totalDue = document.getElementById('checkout-total-due');
        const remaining = document.getElementById('checkout-remaining');
        const modal = document.getElementById('checkout-modal');
        
        const cardPanel = document.getElementById('payment-card');
        const cashPanel = document.getElementById('payment-cash');
        const giftPanel = document.getElementById('payment-giftcard');
        const posPanel = document.getElementById('payment-pos');
        
        if (itemsList) itemsList.innerHTML = summaryHtml;
        if (totalDue) totalDue.textContent = '$' + total.toFixed(2);
        if (remaining) remaining.textContent = '$' + total.toFixed(2);

        document.getElementById('card-amount').value = '';
        document.getElementById('cash-amount').value = '';
        document.getElementById('giftcard-code').value = '';
        document.getElementById('giftcard-amount').value = '';
        document.getElementById('pos-amount').value = '';
        document.getElementById('change-display-container').style.display = 'none';
        document.getElementById('giftcard-info').style.display = 'none';
        document.getElementById('giftcard-apply-section').style.display = 'none';
        document.getElementById('checkout-status').style.display = 'none';
        document.getElementById('payment-summary').style.display = 'none';
        document.getElementById('card-status').style.display = 'none';
        document.getElementById('pos-status').style.display = 'none';

        if (cardPanel) cardPanel.style.display = 'block';
        if (cashPanel) cashPanel.style.display = isAdmin ? 'block' : 'none';
        if (giftPanel) giftPanel.style.display = isAdmin ? 'block' : 'none';
        if (posPanel) posPanel.style.display = isAdmin ? 'block' : 'none';

        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            if (isAdmin) {
                submitBtn.style.display = 'inline-block';
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
            } else {
                submitBtn.style.display = 'none';
            }
        }

        const completeBtn = document.getElementById('checkout-complete-btn');
        if (completeBtn) {
            if (isAdmin) {
                completeBtn.style.display = 'inline-block';
                completeBtn.disabled = false;
                completeBtn.innerHTML = '<i class="fas fa-check"></i> Complete';
            } else {
                completeBtn.style.display = 'none';
            }
        }

        if (modal) {
            modal.style.display = 'flex';
            updateRemaining();
        }
    };

    window.closeCheckoutModal = function() {
        const modal = document.getElementById('checkout-modal');
        if (modal) modal.style.display = 'none';
    };

    // ===== Max Amount Functions =====
    window.setMaxCard = function() {
        const remaining = checkoutState.remaining;
        const cardInput = document.getElementById('card-amount');
        if (cardInput) {
            cardInput.value = remaining.toFixed(2);
            updateRemaining();
        }
    };

    window.setMaxCash = function() {
        const remaining = checkoutState.remaining;
        const cashInput = document.getElementById('cash-amount');
        if (cashInput) {
            cashInput.value = remaining.toFixed(2);
            updateRemaining();
        }
    };

    window.setMaxGift = function() {
        const remaining = checkoutState.remaining;
        const giftBalance = checkoutState.giftCardBalance;
        const amountInput = document.getElementById('giftcard-amount');
        if (amountInput) {
            amountInput.value = Math.min(remaining, giftBalance).toFixed(2);
        }
    };

    window.setMaxPos = function() {
        const remaining = checkoutState.remaining;
        const posInput = document.getElementById('pos-amount');
        if (posInput) {
            posInput.value = remaining.toFixed(2);
            updateRemaining();
        }
    };

    // ===== Gift Card =====
    window.checkGiftCardForPayment = async function() {
        const codeInput = document.getElementById('giftcard-code');
        if (!codeInput) return;
        
        const code = codeInput.value.trim().toUpperCase();
        if (!code) {
            showToast('Please enter a gift card code', 'warning');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/gift-card/balance/${code}`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();

            const infoDiv = document.getElementById('giftcard-info');
            const balanceDisplay = document.getElementById('giftcard-balance-display');
            const applySection = document.getElementById('giftcard-apply-section');

            if (data.status === 'success') {
                const balance = data.balance || 0;
                checkoutState.giftCardCode = code;
                checkoutState.giftCardBalance = balance;
                
                if (infoDiv) infoDiv.style.display = 'block';
                if (balanceDisplay) balanceDisplay.textContent = '$' + balance.toFixed(2);
                if (applySection) applySection.style.display = balance > 0 ? 'block' : 'none';
                
                if (balance > 0) {
                    const amountInput = document.getElementById('giftcard-amount');
                    if (amountInput) {
                        amountInput.value = Math.min(balance, checkoutState.remaining).toFixed(2);
                    }
                    showToast('✅ Gift card balance: $' + balance.toFixed(2), 'success');
                } else {
                    showToast('⚠️ Gift card has no balance', 'warning');
                }
            } else {
                showToast('❌ Gift card not found', 'error');
            }
        } catch (err) {
            console.error('Error checking gift card:', err);
            showToast('❌ Error checking gift card', 'error');
        }
    };

    window.setGiftCardAmount = function(type) {
        const balance = checkoutState.giftCardBalance;
        const remaining = checkoutState.remaining;
        let amount = 0;
        
        if (type === 'full') {
            amount = Math.min(balance, remaining);
        } else if (type === 'half') {
            amount = Math.min(balance / 2, remaining);
        }
        
        const amountInput = document.getElementById('giftcard-amount');
        if (amountInput) amountInput.value = amount.toFixed(2);
    };

    window.applyGiftCardToCart = async function() {
        const amount = parseFloat(document.getElementById('giftcard-amount').value);
        if (!amount || amount <= 0) {
            showToast('Please enter a valid amount', 'warning');
            return;
        }

        if (amount > checkoutState.giftCardBalance) {
            showToast('Amount exceeds gift card balance', 'warning');
            return;
        }

        if (amount > checkoutState.remaining) {
            showToast('Amount exceeds remaining balance', 'warning');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/gift-card/redeem`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: checkoutState.giftCardCode,
                    purchase_amount: amount
                })
            });
            const data = await response.json();

            if (data.status === 'success') {
                checkoutState.remaining -= amount;
                checkoutState.giftCardBalance -= amount;
                checkoutState.paymentEntries.push({
                    method: 'Gift Card',
                    amount: amount
                });
                
                document.getElementById('checkout-remaining').textContent = '$' + checkoutState.remaining.toFixed(2);
                document.getElementById('giftcard-balance-display').textContent = '$' + checkoutState.giftCardBalance.toFixed(2);
                
                if (checkoutState.giftCardBalance <= 0) {
                    document.getElementById('giftcard-apply-section').style.display = 'none';
                    document.getElementById('giftcard-info').style.display = 'none';
                }
                
                if (checkoutState.remaining <= 0.01) {
                    showToast('✅ Gift card covers the full amount!', 'success');
                } else {
                    showToast('✅ Applied $' + amount.toFixed(2) + ' from gift card. Remaining: $' + checkoutState.remaining.toFixed(2), 'success');
                }
                updateRemaining();
            } else {
                showToast('❌ Error applying gift card: ' + (data.error || 'Unknown error'), 'error');
            }
        } catch (err) {
            console.error('Error applying gift card:', err);
            showToast('❌ Network error applying gift card', 'error');
        }
    };

    // ===== SUBMIT PAYMENT =====
    window.submitPayment = async function() {
        if (checkoutState.paymentProcessing) {
            showToast('⏳ Payment already in progress...', 'warning');
            return;
        }

        const isAdmin = getUserRole() === 'admin';
        
        if (!isAdmin) {
            showToast('❌ Online checkout uses automatic card payment', 'warning');
            return;
        }

        const cardAmount = parseFloat(document.getElementById('card-amount').value) || 0;
        const posAmount = parseFloat(document.getElementById('pos-amount').value) || 0;
        const cashAmount = parseFloat(document.getElementById('cash-amount').value) || 0;
        const giftAmount = parseFloat(document.getElementById('giftcard-amount').value) || 0;

        if (cardAmount === 0 && posAmount === 0) {
            showToast('Enter a Card or POS amount to submit', 'warning');
            return;
        }

        const paymentEntries = [];
        if (cardAmount > 0) paymentEntries.push({ method: 'Card (Square)', amount: cardAmount });
        if (cashAmount > 0) paymentEntries.push({ method: 'Cash', amount: cashAmount });
        if (giftAmount > 0) paymentEntries.push({ method: 'Gift Card', amount: giftAmount });
        if (posAmount > 0) paymentEntries.push({ method: 'POS Request', amount: posAmount });

        checkoutState.paymentProcessing = true;
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ Submitting...';
        }

        let cardSent = false;
        let posSent = false;

        // ===== SEND CARD TO SQUARE (Payment Link) =====
        if (cardAmount > 0) {
            cardSent = true;
            showToast('💳 Opening Square payment link...', 'info');
            
            const payload = {
                items: window.cart.getCheckoutPayload(),
                subtotal: checkoutState.totalDue,
                total: checkoutState.totalDue,
                tax: 0,
                shipping: { method: 'pickup', amount: 0 },
                customer_name: 'Walk-in Customer',
                customer_email: '',
                notes: 'Checkout from cart',
                payment_entries: paymentEntries
            };

            try {
                const response = await fetch(`${API_BASE}/api/checkout/process`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(payload)
                });
                
                const data = await response.json();

                if (data.status === 'success' && data.checkout_url) {
                    checkoutState.cardSubmitted = true;
                    document.getElementById('card-status').style.display = 'block';
                    document.getElementById('card-status').textContent = '⏳ Waiting for payment...';
                    document.getElementById('card-status').style.color = '#17a2b8';
                    
                    window.open(data.checkout_url, '_blank');
                    
                    pollSquarePayment(data.order_id || data.square_order_id);
                } else {
                    showToast('❌ Card payment failed: ' + (data.error || 'Unknown error'), 'error');
                    checkoutState.paymentProcessing = false;
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
                    }
                }
            } catch (err) {
                console.error('Card payment error:', err);
                showToast('❌ Error: ' + err.message, 'error');
                checkoutState.paymentProcessing = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
                }
            }
        }

        // ===== SEND POS TO TERMINAL =====
        if (posAmount > 0) {
            posSent = true;
            showToast('📟 Sending to POS terminal...', 'info');
            
            try {
                let deviceId = checkoutState.cachedDeviceId;
                
                if (!deviceId) {
                    const terminalsResponse = await fetch(`${API_BASE}/api/square/terminals`, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include'
                    });
                    
                    const terminalsData = await terminalsResponse.json();
                    
                    if (terminalsData.status !== 'success' || !terminalsData.terminals || terminalsData.terminals.length === 0) {
                        showToast('❌ No Square terminals available', 'error');
                        checkoutState.paymentProcessing = false;
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
                        }
                        return;
                    }
                    
                    for (const terminal of terminalsData.terminals) {
                        if (terminal.status === 'ONLINE') {
                            deviceId = terminal.id;
                            break;
                        }
                    }
                    
                    if (!deviceId) {
                        deviceId = terminalsData.terminals[0].id;
                    }
                    
                    checkoutState.cachedDeviceId = deviceId;
                }
                
                const cleanDeviceId = deviceId.replace('device:', '');
                
                const cartItems = window.cart.getItems();
                const recordIds = cartItems.map(item => item.id || item.copy_id).filter(id => id);
                const recordTitles = cartItems.map(item => item.title || 'Record');
                
                const payload = {
                    amount_cents: Math.round(posAmount * 100),
                    record_ids: recordIds,
                    record_titles: recordTitles,
                    reference_id: 'cart_' + Date.now(),
                    device_id: cleanDeviceId
                };

                const response = await fetch(`${API_BASE}/api/square/terminal/checkout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(payload)
                });
                
                const data = await response.json();

                if (data.status === 'success') {
                    const checkoutId = data.checkout?.id || 'unknown';
                    checkoutState.posCheckoutId = checkoutId;
                    checkoutState.posSubmitted = true;
                    
                    document.getElementById('pos-status').style.display = 'block';
                    document.getElementById('pos-status').textContent = '⏳ Waiting for terminal...';
                    document.getElementById('pos-status').style.color = '#6f42c1';
                    
                    showToast('✅ POS request sent! Waiting for payment on terminal...', 'success');
                    
                    pollPOSStatus(checkoutId);
                } else {
                    const errorMsg = data.message || data.error || data.details || 'Unknown error';
                    showToast('❌ POS request failed: ' + errorMsg, 'error');
                    checkoutState.paymentProcessing = false;
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
                    }
                }
            } catch (err) {
                console.error('POS payment error:', err);
                showToast('❌ Error sending POS request: ' + err.message, 'error');
                checkoutState.paymentProcessing = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
                }
            }
        }

        if (submitBtn && (cardSent || posSent)) {
            submitBtn.innerHTML = '<i class="fas fa-check"></i> Submitted';
            submitBtn.disabled = true;
        }
    };

    // ===== Poll POS Status =====
    function pollPOSStatus(checkoutId) {
        let attempts = 0;
        const maxAttempts = 60;
        let completed = false;
        
        const statusDiv = document.getElementById('checkout-status');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.textContent = '⏳ Waiting for POS terminal payment...';
            statusDiv.className = 'status-message status-info';
        }
        
        const checkStatus = setInterval(() => {
            attempts++;
            
            fetch(`${API_BASE}/api/square/terminal/checkout/${checkoutId}/status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success' && data.checkout) {
                    const status = data.checkout.status;
                    if (status === 'COMPLETED') {
                        clearInterval(checkStatus);
                        completed = true;
                        checkoutState.posConfirmed = true;
                        document.getElementById('pos-status').textContent = '✅ Payment confirmed!';
                        document.getElementById('pos-status').style.color = '#28a745';
                        showToast('✅ POS payment completed! Press Complete to finish.', 'success');
                        
                        checkoutState.paymentProcessing = false;
                        
                        if (statusDiv) {
                            statusDiv.textContent = '✅ Payment confirmed! Press Complete to finish.';
                            statusDiv.className = 'status-message status-success';
                        }
                        updateButtons();
                    } else if (status === 'CANCELED') {
                        clearInterval(checkStatus);
                        completed = true;
                        document.getElementById('pos-status').textContent = '❌ Payment cancelled';
                        document.getElementById('pos-status').style.color = '#dc3545';
                        showToast('❌ POS payment cancelled', 'error');
                        checkoutState.paymentProcessing = false;
                        const submitBtn = document.getElementById('submit-btn');
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
                        }
                        updateButtons();
                    } else if (status === 'PENDING') {
                        if (statusDiv) {
                            const dots = '.'.repeat((attempts % 4));
                            statusDiv.textContent = '⏳ Waiting for POS terminal payment' + dots;
                            statusDiv.className = 'status-message status-info';
                        }
                    }
                }
                
                if (attempts >= maxAttempts && !completed) {
                    clearInterval(checkStatus);
                    showToast('⏳ POS payment still pending - check terminal', 'warning');
                    checkoutState.paymentProcessing = false;
                    const submitBtn = document.getElementById('submit-btn');
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
                    }
                    updateButtons();
                }
            })
            .catch(err => {
                console.error('Error checking POS status:', err);
            });
        }, 3000);
    }

    // ===== Poll Square Payment =====
    function pollSquarePayment(orderId) {
        let attempts = 0;
        const maxAttempts = 60;
        let completed = false;
        
        const statusDiv = document.getElementById('checkout-status');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.textContent = '⏳ Waiting for Square payment...';
            statusDiv.className = 'status-message status-info';
        }
        
        const checkStatus = setInterval(() => {
            attempts++;
            
            fetch(`${API_BASE}/api/checkout/status/${orderId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success' && data.payment_status === 'paid') {
                    clearInterval(checkStatus);
                    completed = true;
                    checkoutState.cardConfirmed = true;
                    document.getElementById('card-status').textContent = '✅ Payment confirmed!';
                    document.getElementById('card-status').style.color = '#28a745';
                    showToast('✅ Square payment completed! Press Complete to finish.', 'success');
                    
                    checkoutState.paymentProcessing = false;
                    
                    if (statusDiv) {
                        statusDiv.textContent = '✅ Payment confirmed! Press Complete to finish.';
                        statusDiv.className = 'status-message status-success';
                    }
                    updateButtons();
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkStatus);
                    showToast('⏳ Square payment still pending - check your browser', 'warning');
                    checkoutState.paymentProcessing = false;
                    const submitBtn = document.getElementById('submit-btn');
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
                    }
                    updateButtons();
                }
            })
            .catch(err => {
                console.error('Error checking Square status:', err);
            });
        }, 5000);
    }

    // ===== COMPLETE ORDER =====
    window.completeOrder = async function() {
        const isAdmin = getUserRole() === 'admin';
        
        // Non-admin cannot manually complete
        if (!isAdmin) {
            showToast('❌ Order will auto-complete when payment is confirmed', 'warning');
            return;
        }

        // Check if remaining is 0
        if (checkoutState.remaining > 0.01) {
            showToast('Please cover the full amount with payment methods', 'warning');
            return;
        }

        // Collect payment entries
        const cardAmount = parseFloat(document.getElementById('card-amount').value) || 0;
        const cashAmount = parseFloat(document.getElementById('cash-amount').value) || 0;
        const giftAmount = parseFloat(document.getElementById('giftcard-amount').value) || 0;
        const posAmount = parseFloat(document.getElementById('pos-amount').value) || 0;
        
        const paymentEntries = [];
        if (cardAmount > 0) paymentEntries.push({ method: 'Card (Square)', amount: cardAmount });
        if (cashAmount > 0) paymentEntries.push({ method: 'Cash', amount: cashAmount });
        if (giftAmount > 0) paymentEntries.push({ method: 'Gift Card', amount: giftAmount });
        if (posAmount > 0) paymentEntries.push({ method: 'POS Request', amount: posAmount });

        if (paymentEntries.length === 0) {
            showToast('Please enter at least one payment method', 'warning');
            return;
        }

        // If card submitted but not confirmed, warn admin
        if (checkoutState.cardSubmitted && !checkoutState.cardConfirmed) {
            if (!confirm('⚠️ Card payment has not been confirmed. Complete anyway?')) {
                return;
            }
        }
        
        if (checkoutState.posSubmitted && !checkoutState.posConfirmed) {
            if (!confirm('⚠️ POS payment has not been confirmed. Complete anyway?')) {
                return;
            }
        }

        // ===== MARK RECORDS AS SOLD =====
        // Get the cart items - only records should be marked as sold
        const cartItems = window.cart.getItems();
        const recordIds = cartItems
            .filter(item => item.type === 'record' && item.id)
            .map(item => item.id);

        if (recordIds.length === 0) {
            showToast('No records in cart to mark as sold', 'warning');
            return;
        }

        // Show processing status
        const statusDiv = document.getElementById('checkout-status');
        statusDiv.style.display = 'block';
        statusDiv.textContent = '⏳ Marking records as sold...';
        statusDiv.className = 'status-message status-info';

        // Update each record to status_id = 3 (in-store sold)
        let soldCount = 0;
        let failedCount = 0;

        for (const recordId of recordIds) {
            try {
                const response = await fetch(`${API_BASE}/records/${recordId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        status_id: 3,
                        date_sold: new Date().toISOString().split('T')[0]
                    })
                });

                if (response.ok) {
                    soldCount++;
                } else {
                    failedCount++;
                    console.error(`Failed to update record ${recordId}`);
                }
            } catch (err) {
                failedCount++;
                console.error(`Error updating record ${recordId}:`, err);
            }
        }

        if (soldCount > 0) {
            window.cart.clear();
            window.renderCart();
            
            statusDiv.textContent = `✅ ${soldCount} record(s) marked as sold! ${failedCount > 0 ? `(${failedCount} failed)` : ''}`;
            statusDiv.className = 'status-message status-success';
            
            showToast(`✅ ${soldCount} record(s) sold!`, 'success');
            
            setTimeout(() => {
                closeCheckoutModal();
            }, 2000);
        } else {
            statusDiv.textContent = '❌ Failed to mark records as sold. Please try again.';
            statusDiv.className = 'status-message status-error';
            showToast('❌ Failed to complete order', 'error');
        }
    };

    // ===== Toast Helper =====
    function showToast(message, type = 'success') {
        const existing = document.querySelector('.checkout-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'checkout-toast';
        const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8';
        const textColor = type === 'warning' ? '#333' : 'white';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            border-radius: 8px;
            background: ${bgColor};
            color: ${textColor};
            font-weight: 600;
            z-index: 10000;
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
        }, 5000);
    }

    // ===== Update Badge =====
    window.updateCartBadge = updateBadge;

    // ===== Init =====
    window.initCart = function() {
        console.log('🛒 Cart initialized with', window.cart.getItemCount(), 'items');
        updateBadge();
        window.renderCart();
    };

    updateBadge();
    console.log('🛒 Cart global ready. Items:', window.cart.getItemCount());

})();
