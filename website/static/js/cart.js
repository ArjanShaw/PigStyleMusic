// ============================================================
// CART - Global cart singleton for public/guest checkout
// Simplified checkout with basic payment options
// ============================================================

(function() {
    'use strict';

    console.log('🛒 Cart module loading...');

    // ===== API BASE URL =====
    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    // ===== TAX RATE =====
    const TAX_RATE = 0.07; // 7% sales tax

    // ===== CALCULATE TAX =====
    function calculateTax(subtotal) {
        return Math.round(subtotal * TAX_RATE * 100) / 100;
    }

    // ===== STORAGE KEY =====
    const STORAGE_KEY = 'pigstyle_cart';

    // ===== GET CART FROM LOCALSTORAGE =====
    function getCart() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    // ===== SAVE CART TO LOCALSTORAGE =====
    function saveCart(cart) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
        updateBadge();
        document.dispatchEvent(new CustomEvent('cartUpdated'));
    }

    // ===== UPDATE BADGE =====
    function updateBadge() {
        const count = window.cart ? window.cart.getItemCount() : 0;
        const badge = document.getElementById('cartBadge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline' : 'none';
        }
    }

    // ===== GLOBAL CART OBJECT =====
    window.cart = {
        items: getCart(),

        getItems() {
            return this.items;
        },

        addItem(item) {
            console.log('🛒 Adding item to cart:', item);
            
            if (!item || !item.title || item.price === undefined) {
                console.warn('⚠️ Invalid cart item:', item);
                return false;
            }
            
            const existing = this.items.find(i =>
                i.type === item.type &&
                i.id === item.id
            );
            
            if (existing) {
                existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
                console.log(`🛒 Updated quantity for ${item.title}: ${existing.quantity}`);
            } else {
                if (!item.id) {
                    item.id = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                }
                item.quantity = item.quantity || 1;
                this.items.push(item);
                console.log(`🛒 Added new item: ${item.title}`);
            }
            
            saveCart(this.items);
            
            if (typeof window.renderCart === 'function') {
                window.renderCart();
            }
            
            return true;
        },

        removeItem(id) {
            console.log(`🛒 Removing item: ${id}`);
            this.items = this.items.filter(item => item.id !== id);
            saveCart(this.items);
            if (typeof window.renderCart === 'function') {
                window.renderCart();
            }
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
            console.log('🛒 Clearing cart');
            this.items = [];
            saveCart(this.items);
            if (typeof window.renderCart === 'function') {
                window.renderCart();
            }
        },

        getTotal() {
            return this.items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
        },

        getItemCount() {
            return this.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
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

    // ===== RENDER CART UI =====
    window.renderCart = function() {
        const container = document.getElementById('cartResponse');
        if (!container) {
            console.warn('⚠️ cartResponse container not found');
            return;
        }
        
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
            
            let icon = '📦';
            if (item.type === 'bernie') icon = '🌹';
            else if (item.type === 'giftcard') icon = '🎁';
            else if (item.type === 'custom') icon = '🛍️';
            
            html += `
                <div style="display: flex; align-items: center; gap: 12px; background: #f8f8f8; border-radius: 8px; padding: 10px; border: 1px solid #eee;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; color: #333; font-size: 14px;">${icon} ${item.title || 'Item'}</div>
                        <div style="color: #666; font-size: 12px;">${item.artist || ''} ${item.type ? '[' + item.type + ']' : ''}</div>
                        <div style="color: #ff6b6b; font-weight: bold; font-size: 14px;">$${(item.price || 0).toFixed(2)} × ${item.quantity || 1}</div>
                    </div>
                    <div style="font-weight: bold; color: #333; font-size: 14px; min-width: 70px; text-align: right;">$${itemTotal.toFixed(2)}</div>
                    <button onclick="window.removeCartItem('${item.id}')" style="background: none; border: none; color: #dc3545; font-size: 20px; cursor: pointer; padding: 0 4px;">×</button>
                </div>
            `;
        });
        
        // Calculate tax
        const taxAmount = calculateTax(total);
        const totalWithTax = total + taxAmount;
        
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 2px solid #ddd; margin-top: 5px;">
                <span style="font-size: 16px; font-weight: bold; color: #333;">Subtotal:</span>
                <span style="font-size: 20px; font-weight: bold; color: #333;">$${total.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #e9ecef; padding-bottom: 8px;">
                <span style="font-size: 14px; color: #666;">Tax (7%):</span>
                <span style="font-size: 14px; color: #666;">$${taxAmount.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 5px;">
                <span style="font-size: 18px; font-weight: bold; color: #333;">Total:</span>
                <span style="font-size: 28px; font-weight: bold; color: #28a745;">$${totalWithTax.toFixed(2)}</span>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button onclick="window.clearCart()" style="flex: 1; padding: 10px; background: #dc3545; color: white; border: none; border-radius: 30px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-trash"></i> Clear Cart
                </button>
                <button onclick="window.openPublicCheckout()" style="flex: 2; padding: 10px; background: #28a745; color: white; border: none; border-radius: 30px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-credit-card"></i> Checkout
                </button>
            </div>
        `;
        html += '</div>';
        
        container.innerHTML = html;
        updateBadge();
    };

    // ============================================================
    // PUBLIC CHECKOUT - Simplified for customers (Card only)
    // ============================================================

    let publicCheckoutItems = [];
    let publicCheckoutTotal = 0;
    let publicCheckoutTax = 0;
    let publicCheckoutRemaining = 0;
    let publicCheckoutPaymentEntries = [];
    let publicSquareAvailable = false;
    let publicCheckoutId = null;
    let publicPollInterval = null;

    // ===== OPEN PUBLIC CHECKOUT =====
    window.openPublicCheckout = function() {
        console.log('🛒 Opening public checkout...');
        
        if (window.cart.isEmpty()) {
            window.showToast('Your cart is empty!', 'warning');
            return;
        }

        checkPublicSquareAvailability().then(() => {
            showPublicCheckoutModal();
        });
    };

    // ===== CHECK SQUARE AVAILABILITY =====
    async function checkPublicSquareAvailability() {
        try {
            console.log('📟 Checking Square availability...');
            const response = await fetch(`${API_BASE}/api/square/terminals`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.terminals && data.terminals.length > 0) {
                    publicSquareAvailable = true;
                    return true;
                }
            }
            publicSquareAvailable = false;
            return false;
        } catch (err) {
            console.warn('⚠️ Square check failed:', err.message);
            publicSquareAvailable = false;
            return false;
        }
    }

    // ===== SHOW PUBLIC CHECKOUT MODAL =====
    function showPublicCheckoutModal() {
        console.log('🛒 Showing public checkout modal...');
        
        const items = window.cart.getItems();
        const subtotal = window.cart.getTotal();
        const taxAmount = calculateTax(subtotal);
        const totalWithTax = subtotal + taxAmount;
        
        publicCheckoutItems = items;
        publicCheckoutTotal = totalWithTax;
        publicCheckoutTax = taxAmount;
        publicCheckoutRemaining = totalWithTax;
        publicCheckoutPaymentEntries = [];

        // Remove existing modal
        const existing = document.getElementById('public-checkout-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'public-checkout-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 10002;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
        `;

        let itemsHtml = '';
        items.forEach(item => {
            const price = item.price || 0;
            const qty = item.quantity || 1;
            const totalPrice = price * qty;
            let icon = '📦';
            if (item.type === 'bernie') icon = '🌹';
            else if (item.type === 'giftcard') icon = '🎁';
            else if (item.type === 'custom') icon = '🛍️';
            itemsHtml += `
                <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; font-size: 13px;">
                    <span>${icon} ${item.title}</span>
                    <span>${qty}× $${price.toFixed(2)} = $${totalPrice.toFixed(2)}</span>
                </div>
            `;
        });

        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; max-width: 500px; width: 95%; max-height: 90vh; overflow-y: auto; padding: 0; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 20px; border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: white;"><i class="fas fa-credit-card"></i> Checkout</h3>
                    <button onclick="closePublicCheckoutModal()" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer;">&times;</button>
                </div>
                
                <div style="padding: 20px;">
                    <!-- Order Summary -->
                    <div style="margin-bottom: 15px; max-height: 150px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 8px;">
                        <div style="font-weight: 600; margin-bottom: 5px; color: #333;">Order Summary (${items.length} items)</div>
                        <div style="font-size: 13px; color: #666;">${itemsHtml}</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding: 8px 10px; background: #f8f9fa; border-radius: 6px;">
                        <div style="color: #666; font-size: 13px;">Subtotal:</div>
                        <div style="color: #333; font-weight: 500;">$${subtotal.toFixed(2)}</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding: 8px 10px; background: #f8f9fa; border-radius: 6px; border-bottom: 1px solid #e9ecef;">
                        <div style="color: #666; font-size: 13px;">Tax (7%):</div>
                        <div style="color: #333; font-weight: 500;">$${taxAmount.toFixed(2)}</div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding: 10px; background: #e8f5e9; border-radius: 8px;">
                        <span style="font-weight: 600; color: #333;">Total Due:</span>
                        <span id="public-total-due" style="font-size: 24px; font-weight: bold; color: #28a745;">$${totalWithTax.toFixed(2)}</span>
                    </div>

                    <!-- Payment Methods -->
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 8px;">Payment</label>
                        
                        <!-- Card Payment (Square) - Only payment method -->
                        <div style="background: #f8f9fa; border-radius: 8px; padding: 12px; border: 2px solid #28a745;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 600; color: #333;"><i class="fas fa-credit-card" style="color: #17a2b8;"></i> Credit Card</span>
                                <span style="font-size: 12px; color: #6c757d;">Secure payment via Square</span>
                            </div>
                            <div style="margin-top: 8px; display: flex; gap: 8px;">
                                <span style="color: #666; font-size: 13px;">Amount to charge:</span>
                                <span style="font-weight: bold; color: #28a745; font-size: 15px;">$${publicCheckoutRemaining.toFixed(2)}</span>
                            </div>
                            <button onclick="addPublicCardPayment()" id="public-card-pay-btn" style="width: 100%; margin-top: 8px; padding: 10px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">
                                <i class="fas fa-credit-card"></i> Pay $${publicCheckoutRemaining.toFixed(2)} with Card
                            </button>
                            <div id="public-card-status" style="margin-top: 5px; font-size: 12px; color: #6c757d; display: none;"></div>
                        </div>
                    </div>

                    <div id="public-checkout-status" style="margin-top: 10px; display: none; padding: 10px; border-radius: 8px; font-size: 13px;"></div>

                    <button onclick="completePublicCheckout()" id="public-checkout-complete-btn" style="width: 100%; margin-top: 15px; padding: 14px; background: #28a745; color: white; border: none; border-radius: 30px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
                        <i class="fas fa-check"></i> Complete Order
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.style.display = 'flex';

        // Close on click outside
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closePublicCheckoutModal();
            }
        });

        // Escape key
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closePublicCheckoutModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        updatePublicCheckoutUI();
    }

    // ===== CLOSE PUBLIC CHECKOUT MODAL =====
    window.closePublicCheckoutModal = function() {
        const modal = document.getElementById('public-checkout-modal');
        if (modal) modal.remove();
        if (publicPollInterval) {
            clearInterval(publicPollInterval);
            publicPollInterval = null;
        }
    };

    // ===== UPDATE PUBLIC CHECKOUT UI =====
    function updatePublicCheckoutUI() {
        const remainingEl = document.getElementById('public-remaining');
        if (remainingEl) remainingEl.textContent = '$' + publicCheckoutRemaining.toFixed(2);
        
        const totalEl = document.getElementById('public-total-due');
        if (totalEl) totalEl.textContent = '$' + publicCheckoutTotal.toFixed(2);
        
        const completeBtn = document.getElementById('public-checkout-complete-btn');
        if (completeBtn) {
            completeBtn.disabled = publicCheckoutRemaining > 0.01;
            completeBtn.style.opacity = publicCheckoutRemaining > 0.01 ? '0.5' : '1';
            completeBtn.textContent = publicCheckoutRemaining > 0.01 ? 
                'Remaining: $' + publicCheckoutRemaining.toFixed(2) : 
                '✅ Complete Order';
        }

        // Update card pay button
        const cardPayBtn = document.getElementById('public-card-pay-btn');
        if (cardPayBtn) {
            cardPayBtn.textContent = `Pay $${publicCheckoutRemaining.toFixed(2)} with Card`;
            cardPayBtn.disabled = publicCheckoutRemaining <= 0.01;
        }
    }

    // ===== ADD PUBLIC CARD PAYMENT =====
    window.addPublicCardPayment = function() {
        const payAmount = publicCheckoutRemaining;
        
        if (payAmount <= 0) {
            showPublicCheckoutStatus('No remaining balance to pay.', 'warning');
            return;
        }

        if (!publicSquareAvailable) {
            showPublicCheckoutStatus('Square payment is not available. Please try again later.', 'error');
            return;
        }

        // Disable the button to prevent double click
        const btn = document.getElementById('public-card-pay-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Processing...';
        }

        const statusEl = document.getElementById('public-card-status');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = '⏳ Processing payment...';
            statusEl.style.color = '#17a2b8';
        }

        // Simulate card payment processing
        setTimeout(() => {
            addPublicPaymentEntry('Credit Card', payAmount);
            if (statusEl) {
                statusEl.textContent = '✅ Payment successful!';
                statusEl.style.color = '#28a745';
            }
            if (btn) {
                btn.disabled = false;
                btn.textContent = `Pay $${publicCheckoutRemaining.toFixed(2)} with Card`;
            }
            updatePublicCheckoutUI();
            
            if (publicCheckoutRemaining <= 0.01) {
                setTimeout(() => {
                    completePublicCheckout();
                }, 500);
            }
        }, 1500);
    };

    // ===== ADD PUBLIC PAYMENT ENTRY =====
    function addPublicPaymentEntry(method, amount) {
        publicCheckoutPaymentEntries.push({ method, amount });
        publicCheckoutRemaining -= amount;
        updatePublicCheckoutUI();
    }

    // ===== SHOW PUBLIC CHECKOUT STATUS =====
    function showPublicCheckoutStatus(message, type = 'info') {
        const el = document.getElementById('public-checkout-status');
        if (!el) return;
        el.style.display = 'block';
        el.textContent = message;
        const colors = {
            success: '#d4edda; color: #155724; border: 1px solid #c3e6cb;',
            error: '#f8d7da; color: #721c24; border: 1px solid #f5c6cb;',
            warning: '#fff3cd; color: #856404; border: 1px solid #ffeeba;',
            info: '#cce5ff; color: #004085; border: 1px solid #b8daff;'
        };
        el.style.background = colors[type] || colors.info;
        el.style.border = '1px solid';
        el.style.padding = '10px';
        el.style.borderRadius = '8px';
        clearTimeout(el._timeout);
        el._timeout = setTimeout(() => {
            el.style.display = 'none';
        }, 4000);
    }

    // ===== COMPLETE PUBLIC CHECKOUT =====
    window.completePublicCheckout = function() {
        console.log('🛒 Completing public checkout...');

        if (publicCheckoutRemaining > 0.01) {
            showPublicCheckoutStatus('⚠️ Please pay the remaining balance.', 'warning');
            return;
        }

        if (publicCheckoutPaymentEntries.length === 0) {
            showPublicCheckoutStatus('⚠️ No payments added.', 'warning');
            return;
        }

        const items = window.cart.getItems();
        const subtotal = window.cart.getTotal();
        const taxAmount = calculateTax(subtotal);
        const totalWithTax = subtotal + taxAmount;

        // Disable complete button
        const completeBtn = document.getElementById('public-checkout-complete-btn');
        if (completeBtn) {
            completeBtn.disabled = true;
            completeBtn.textContent = '⏳ Processing...';
        }

        const orderData = {
            items: window.cart.getCheckoutPayload(),
            subtotal: subtotal,
            tax: taxAmount,
            total: totalWithTax,
            shipping: { method: 'pickup', amount: 0 },
            customer_name: 'Customer',
            customer_email: '',
            notes: 'Public checkout (Tax: $' + taxAmount.toFixed(2) + ')',
            payment_entries: publicCheckoutPaymentEntries,
            source: 'public_checkout'
        };

        showPublicCheckoutStatus('⏳ Processing order...', 'info');

        fetch(`${API_BASE}/api/checkout/process`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                window.cart.clear();
                window.renderCart();
                
                showPublicCheckoutStatus('✅ Order completed successfully!', 'success');
                
                setTimeout(() => {
                    closePublicCheckoutModal();
                    window.showToast('🎉 Order complete! Thank you!', 'success');
                }, 1500);
            } else {
                showPublicCheckoutStatus('❌ Order failed: ' + (data.error || 'Unknown error'), 'error');
                if (completeBtn) {
                    completeBtn.disabled = false;
                    completeBtn.textContent = '✅ Complete Order';
                }
            }
        })
        .catch(err => {
            console.error('❌ Checkout error:', err);
            showPublicCheckoutStatus('❌ Error: ' + err.message, 'error');
            if (completeBtn) {
                completeBtn.disabled = false;
                completeBtn.textContent = '✅ Complete Order';
            }
        });
    };

    // ===== TOAST =====
    window.showToast = function(message, type = 'success') {
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
    };

    // ===== CART ACTIONS =====
    window.removeCartItem = function(itemId) {
        window.cart.removeItem(itemId);
    };

    window.clearCart = function() {
        if (confirm('Are you sure you want to clear your cart?')) {
            window.cart.clear();
        }
    };

    // ===== UPDATE CART BADGE =====
    window.updateCartBadge = updateBadge;

    // ===== INIT CART =====
    window.initCart = function() {
        console.log('🛒 Cart initialized with', window.cart.getItemCount(), 'items');
        updateBadge();
        window.renderCart();
    };

    // ===== EXPOSE TO WINDOW =====
    window.cart = window.cart;
    window.renderCart = window.renderCart;
    window.updateCartBadge = window.updateCartBadge;
    window.removeCartItem = window.removeCartItem;
    window.clearCart = window.clearCart;
    window.openPublicCheckout = window.openPublicCheckout;
    window.closePublicCheckoutModal = window.closePublicCheckoutModal;

    // ===== AUTO-INIT ON LOAD =====
    console.log('🛒 Cart module loaded');

    if (document.getElementById('cartResponse')) {
        setTimeout(function() {
            window.renderCart();
        }, 500);
    }

})();