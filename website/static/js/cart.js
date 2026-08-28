// ============================================================
// CART - Global cart singleton with full checkout
// ============================================================

(function() {
    'use strict';

    console.log('🛒 Cart module loading...');

    // ===== DETECT ENVIRONMENT =====
    function getApiBase() {
        const hostname = window.location.hostname;
        const port = window.location.port;
        
        if (hostname === 'www.pigstylemusic.com' || hostname === 'pigstylemusic.com') {
            return '';
        }
        
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            if (port === '8000') {
                return 'http://localhost:5000';
            }
            if (port === '5000' || port === '5001') {
                return '';
            }
            return 'http://localhost:5000';
        }
        
        return '';
    }

    const API_BASE = getApiBase();
    console.log('🔧 Cart API_BASE:', API_BASE || '(same origin)');

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

    // ============================================================
    // CHECKOUT FUNCTIONALITY
    // ============================================================

    // ===== CHECKOUT STATE =====
    let checkoutItems = [];
    let checkoutTotal = 0;
    let checkoutRemaining = 0;
    let checkoutPaymentEntries = [];
    let checkoutDebtorData = null;
    let squareAvailable = false;
    let availableTerminals = [];
    let squareCheckoutId = null;
    let squarePollInterval = null;

    // ===== OPEN CHECKOUT =====
    window.openCheckout = function() {
        console.log('🛒 Opening checkout...');
        
        if (window.cart.isEmpty()) {
            window.showToast('Your cart is empty!', 'warning');
            return;
        }

        // Check if user is logged in
        let isAdmin = false;
        try {
            const userData = localStorage.getItem('pigstyle_user');
            if (userData) {
                const user = JSON.parse(userData);
                isAdmin = user.role === 'admin' || user.role === 'manager';
            }
        } catch {}

        console.log('👤 Is admin:', isAdmin);

        // Check Square availability
        checkSquareAvailability().then(() => {
            showCheckoutModal(isAdmin);
        });
    };

    // ===== CHECK SQUARE AVAILABILITY =====
    async function checkSquareAvailability() {
        try {
            console.log('📟 Checking Square terminals...');
            const response = await fetch(`${API_BASE}/api/square/terminals`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                console.warn('⚠️ Square terminals API returned', response.status);
                squareAvailable = false;
                availableTerminals = [];
                return false;
            }
            
            const data = await response.json();
            if (data.status === 'success' && data.terminals && data.terminals.length > 0) {
                squareAvailable = true;
                availableTerminals = data.terminals;
                console.log('📟 Square terminals available:', availableTerminals.length);
                return true;
            } else {
                squareAvailable = false;
                availableTerminals = [];
                console.log('📟 No Square terminals found');
                return false;
            }
        } catch (err) {
            console.warn('⚠️ Square check failed:', err.message);
            squareAvailable = false;
            availableTerminals = [];
            return false;
        }
    }

    // ===== SHOW CHECKOUT MODAL =====
    function showCheckoutModal(isAdmin) {
        console.log('🛒 Showing checkout modal...');
        
        const items = window.cart.getItems();
        const total = window.cart.getTotal();
        
        checkoutItems = items;
        checkoutTotal = total;
        checkoutRemaining = total;
        checkoutPaymentEntries = [];

        // Remove existing modal
        const existing = document.getElementById('checkout-payment-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'checkout-payment-modal';
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
            <div style="background: white; border-radius: 16px; max-width: 550px; width: 95%; max-height: 90vh; overflow-y: auto; padding: 0; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 20px; border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: white;"><i class="fas fa-credit-card"></i> Checkout</h3>
                    <button onclick="closeCheckoutModal()" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer;">&times;</button>
                </div>
                
                <div style="padding: 20px;">
                    <!-- Order Summary -->
                    <div style="margin-bottom: 15px; max-height: 150px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 8px;">
                        <div style="font-weight: 600; margin-bottom: 5px; color: #333;">Order Summary (${items.length} items)</div>
                        <div style="font-size: 13px; color: #666;">${itemsHtml}</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding: 10px; background: #e8f5e9; border-radius: 8px;">
                        <span style="font-weight: 600; color: #333;">Total Due:</span>
                        <span id="checkout-total-due" style="font-size: 24px; font-weight: bold; color: #28a745;">$${total.toFixed(2)}</span>
                    </div>

                    <!-- Remaining Balance -->
                    <div style="margin-bottom: 15px; padding: 10px; background: #e9ecef; border-radius: 8px; display: flex; justify-content: space-between;">
                        <span style="font-weight: 600; color: #333;">Remaining:</span>
                        <span id="checkout-remaining" style="font-weight: bold; color: #dc3545;">$${total.toFixed(2)}</span>
                    </div>

                    <!-- Debtor Lookup -->
                    <div style="background: #e3f2fd; padding: 12px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #b8daff;">
                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            <input type="text" id="checkout-debtor-code" placeholder="GIFT-XXXXX or debtor name" style="flex: 2; min-width: 150px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                            <button onclick="window.lookupDebtorForCheckout()" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Lookup</button>
                        </div>
                        <div id="checkout-debtor-info" style="display: none; margin-top: 8px; padding: 8px; background: white; border-radius: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                                <span><strong id="checkout-debtor-name">—</strong> <span id="checkout-debtor-type" style="font-size: 12px; color: #666;">(Store Credit)</span></span>
                                <span style="font-weight: bold; color: #28a745;">Balance: $<span id="checkout-debtor-balance">0.00</span></span>
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                                <button onclick="window.applyDebtorToCheckout()" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;"><i class="fas fa-check"></i> Apply Credit</button>
                                <button onclick="document.getElementById('checkout-debtor-info').style.display='none'" style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                            </div>
                            <div id="checkout-debtor-status" style="font-size: 13px; margin-top: 5px;"></div>
                        </div>
                    </div>

                    <!-- Payment Methods -->
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 8px;">Payment Methods</label>
                        
                        <!-- ===== CARD PAYMENT (Square) ===== -->
                        <div id="payment-card" style="background: #f8f9fa; border-radius: 8px; padding: 10px; margin-bottom: 8px; border: 2px solid #28a745;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 600; color: #333;"><i class="fas fa-credit-card" style="color: #17a2b8;"></i> Card (Square)</span>
                                <span style="font-size: 12px; color: #6c757d;">Charges full remaining</span>
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 5px;">
                                <input type="number" id="card-amount" placeholder="0.00" min="0" step="0.01" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                                <button onclick="setMaxCard()" style="padding: 8px 16px; background: #17a2b8; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">MAX</button>
                                <button onclick="addCardPayment()" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Pay</button>
                            </div>
                            <div id="card-status" style="margin-top: 5px; font-size: 12px; color: #6c757d; display: none;"></div>
                        </div>

                        <!-- ===== POS TERMINAL PAYMENT ===== -->
                        <div id="payment-pos" style="background: #f8f9fa; border-radius: 8px; padding: 10px; margin-bottom: 8px; border: 2px solid #6f42c1;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 600; color: #333;"><i class="fas fa-cash-register" style="color: #6f42c1;"></i> POS Terminal</span>
                                <span style="font-size: 12px; color: #6c757d;">Send to Square POS</span>
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 5px; flex-wrap: wrap;">
                                <input type="number" id="pos-amount" placeholder="0.00" min="0" step="0.01" style="flex: 1; min-width: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                                <button onclick="setMaxPos()" style="padding: 8px 16px; background: #17a2b8; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">MAX</button>
                                <button onclick="addPosPayment()" style="padding: 8px 16px; background: #6f42c1; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                                    <i class="fas fa-cash-register"></i> Send to POS
                                </button>
                            </div>
                            <div id="pos-status" style="margin-top: 5px; font-size: 12px; color: #6c757d; display: none;"></div>
                            <div id="pos-terminal-select" style="margin-top: 5px; display: none;">
                                <label style="font-size: 12px; color: #555;">Select Terminal:</label>
                                <select id="pos-device-select" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; width: 100%; margin-top: 2px;">
                                    ${availableTerminals.map(t => `<option value="${t.id}">${t.device_name || t.id}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <!-- ===== CASH PAYMENT (Admin only) ===== -->
                        <div id="payment-cash" style="background: #f8f9fa; border-radius: 8px; padding: 10px; margin-bottom: 8px; border: 1px solid #ddd; ${!isAdmin ? 'display: none;' : ''}">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 600; color: #333;"><i class="fas fa-money-bill-wave" style="color: #28a745;"></i> Cash</span>
                                <span style="font-size: 12px; color: #6c757d;">Enter amount received</span>
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 5px;">
                                <input type="number" id="cash-amount" placeholder="0.00" min="0" step="0.01" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                                <button onclick="setMaxCash()" style="padding: 8px 16px; background: #17a2b8; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">MAX</button>
                                <button onclick="addCashPayment()" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Pay</button>
                            </div>
                            <div id="cash-status" style="margin-top: 5px; font-size: 12px; color: #6c757d; display: none;"></div>
                        </div>

                        <!-- ===== GIFT CARD PAYMENT ===== -->
                        <div id="payment-giftcard" style="background: #f8f9fa; border-radius: 8px; padding: 10px; margin-bottom: 8px; border: 1px solid #ddd;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 600; color: #333;"><i class="fas fa-gift" style="color: #ffc107;"></i> Gift Card</span>
                                <span style="font-size: 12px; color: #6c757d;">Apply gift card balance</span>
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 5px;">
                                <input type="text" id="giftcard-code" placeholder="GIFT-XXXXX" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; text-transform: uppercase;">
                                <button onclick="checkGiftCardForPayment()" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Check</button>
                            </div>
                            <div id="giftcard-info" style="display: none; background: #d4edda; padding: 8px; border-radius: 6px; margin-top: 5px;">
                                <span style="font-weight: bold; color: #155724;">Balance: $<span id="giftcard-balance-display">0.00</span></span>
                                <button onclick="applyGiftCardPayment()" style="margin-left: 10px; padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Apply</button>
                            </div>
                        </div>
                    </div>

                    <!-- Payment Summary -->
                    <div id="payment-summary" style="margin-top: 10px; display: none; border-top: 1px solid #eee; padding-top: 10px;">
                        <div style="font-weight: 600; color: #333; font-size: 13px; margin-bottom: 5px;">Payment Summary:</div>
                        <div id="payment-entries-list" style="font-size: 12px; color: #666;"></div>
                    </div>

                    <div id="checkout-status" style="margin-top: 10px; display: none; padding: 10px; border-radius: 8px; font-size: 13px;"></div>

                    <button onclick="completeCheckout()" id="checkout-complete-btn" style="width: 100%; margin-top: 15px; padding: 14px; background: #28a745; color: white; border: none; border-radius: 30px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
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
                closeCheckoutModal();
            }
        });

        // Escape key
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closeCheckoutModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // If terminals available, show the select dropdown
        if (availableTerminals.length > 0) {
            const select = document.getElementById('pos-device-select');
            if (select) {
                document.getElementById('pos-terminal-select').style.display = 'block';
            }
        }

        updateCheckoutUI();
    }

    // ===== CLOSE CHECKOUT MODAL =====
    window.closeCheckoutModal = function() {
        const modal = document.getElementById('checkout-payment-modal');
        if (modal) modal.remove();
        if (squarePollInterval) {
            clearInterval(squarePollInterval);
            squarePollInterval = null;
        }
    };

    // ===== UPDATE CHECKOUT UI =====
    function updateCheckoutUI() {
        const remainingEl = document.getElementById('checkout-remaining');
        if (remainingEl) remainingEl.textContent = '$' + checkoutRemaining.toFixed(2);
        
        const totalEl = document.getElementById('checkout-total-due');
        if (totalEl) totalEl.textContent = '$' + checkoutTotal.toFixed(2);
        
        const completeBtn = document.getElementById('checkout-complete-btn');
        if (completeBtn) {
            completeBtn.disabled = checkoutRemaining > 0.01;
            completeBtn.style.opacity = checkoutRemaining > 0.01 ? '0.5' : '1';
            completeBtn.textContent = checkoutRemaining > 0.01 ? 
                'Remaining: $' + checkoutRemaining.toFixed(2) : 
                '✅ Complete Order';
        }

        updatePaymentSummary();
    }

    // ===== UPDATE PAYMENT SUMMARY =====
    function updatePaymentSummary() {
        const container = document.getElementById('payment-entries-list');
        const summary = document.getElementById('payment-summary');
        
        if (!container) return;

        if (checkoutPaymentEntries.length === 0) {
            summary.style.display = 'none';
            return;
        }

        summary.style.display = 'block';
        let html = '';
        checkoutPaymentEntries.forEach((entry, idx) => {
            html += `
                <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee;">
                    <span>${entry.method}</span>
                    <span>$${entry.amount.toFixed(2)}</span>
                    <button onclick="removePaymentEntry(${idx})" style="background: none; border: none; color: #dc3545; cursor: pointer; font-size: 12px;">×</button>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    // ===== ADD CARD PAYMENT =====
    window.addCardPayment = function() {
        const input = document.getElementById('card-amount');
        const amount = parseFloat(input.value);
        
        let payAmount = amount;
        if (!amount || amount <= 0) {
            payAmount = checkoutRemaining;
        }
        
        if (payAmount <= 0) {
            showCheckoutStatus('No remaining balance to pay.', 'warning');
            return;
        }

        if (payAmount > checkoutRemaining) {
            payAmount = checkoutRemaining;
        }

        if (!squareAvailable) {
            showCheckoutStatus('Square POS is not available. Please use Cash or Gift Card.', 'error');
            return;
        }

        addPaymentEntry('Card (Square)', payAmount);
        document.getElementById('card-amount').value = '';
        showCheckoutStatus('💳 Added $' + payAmount.toFixed(2) + ' via Card', 'success');
    };

    // ===== ADD POS PAYMENT =====
    window.addPosPayment = function() {
        const input = document.getElementById('pos-amount');
        const amount = parseFloat(input.value);
        
        let payAmount = amount;
        if (!amount || amount <= 0) {
            payAmount = checkoutRemaining;
        }
        
        if (payAmount <= 0) {
            showCheckoutStatus('No remaining balance to pay.', 'warning');
            return;
        }

        if (payAmount > checkoutRemaining) {
            payAmount = checkoutRemaining;
        }

        if (!squareAvailable || availableTerminals.length === 0) {
            showCheckoutStatus('No Square Terminal available. Please use Card or Cash.', 'error');
            return;
        }

        // Get selected device
        const select = document.getElementById('pos-device-select');
        let deviceId = null;
        if (select) {
            deviceId = select.value;
        } else {
            // Use first available
            deviceId = availableTerminals[0]?.id;
        }

        if (!deviceId) {
            showCheckoutStatus('No terminal selected. Please select a terminal.', 'warning');
            return;
        }

        // Clean device ID (remove 'device:' prefix if present)
        if (deviceId.startsWith('device:')) {
            deviceId = deviceId.substring(7);
        }

        // Send to POS
        sendToPosTerminal(payAmount, deviceId);
    };

    // ===== SEND TO POS TERMINAL =====
    async function sendToPosTerminal(amount, deviceId) {
        const statusEl = document.getElementById('pos-status');
        const posBtn = document.querySelector('#payment-pos button:last-child');
        
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = '⏳ Sending payment request to POS...';
            statusEl.style.color = '#17a2b8';
        }
        if (posBtn) posBtn.disabled = true;

        try {
            // Get record IDs and titles from cart
            const items = window.cart.getItems();
            const recordIds = items.filter(i => i.type === 'record').map(i => i.id);
            const titles = items.map(i => i.title);

            const payload = {
                amount_cents: Math.round(amount * 100),
                record_ids: recordIds,
                record_titles: titles,
                reference_id: 'pos_' + Date.now(),
                device_id: deviceId
            };

            console.log('📟 Sending to POS:', payload);

            const response = await fetch(`${API_BASE}/api/square/terminal/checkout`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            console.log('📟 POS response:', data);

            if (data.status === 'success') {
                const checkout = data.checkout;
                squareCheckoutId = checkout.id;

                if (statusEl) {
                    statusEl.textContent = '⏳ Payment request sent. Waiting for customer to complete on POS...';
                    statusEl.style.color = '#17a2b8';
                }

                // Start polling for status
                startPosPolling(checkout.id, amount);
            } else {
                if (statusEl) {
                    statusEl.textContent = '❌ Failed to send to POS: ' + (data.message || 'Unknown error');
                    statusEl.style.color = '#dc3545';
                }
                if (posBtn) posBtn.disabled = false;
            }
        } catch (err) {
            console.error('❌ POS error:', err);
            if (statusEl) {
                statusEl.textContent = '❌ Error: ' + err.message;
                statusEl.style.color = '#dc3545';
            }
            if (posBtn) posBtn.disabled = false;
        }
    }

    // ===== START POS POLLING =====
    function startPosPolling(checkoutId, amount) {
        if (squarePollInterval) {
            clearInterval(squarePollInterval);
        }

        let attempts = 0;
        const maxAttempts = 60; // 60 seconds timeout

        squarePollInterval = setInterval(async () => {
            attempts++;
            try {
                const response = await fetch(`${API_BASE}/api/square/terminal/checkout/${checkoutId}/status`, {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });

                const data = await response.json();
                if (data.status !== 'success') {
                    return;
                }

                const checkout = data.checkout;
                const status = checkout.status;
                const statusEl = document.getElementById('pos-status');

                console.log(`📟 POS status ${attempts}/${maxAttempts}: ${status}`);

                if (status === 'COMPLETED') {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    
                    // Add payment entry
                    addPaymentEntry('POS Terminal', amount);
                    
                    if (statusEl) {
                        statusEl.textContent = '✅ Payment completed successfully!';
                        statusEl.style.color = '#28a745';
                    }
                    
                    // Enable complete button
                    updateCheckoutUI();
                    
                    // Close modal after delay
                    setTimeout(() => {
                        // Check if remaining balance is paid
                        if (checkoutRemaining <= 0.01) {
                            completeCheckout();
                        }
                    }, 1000);

                } else if (status === 'CANCELED' || status === 'FAILED') {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    
                    if (statusEl) {
                        statusEl.textContent = '❌ Payment ' + status.toLowerCase() + '. Please try again.';
                        statusEl.style.color = '#dc3545';
                    }
                    
                    const posBtn = document.querySelector('#payment-pos button:last-child');
                    if (posBtn) posBtn.disabled = false;

                } else if (status === 'PENDING' || status === 'IN_PROGRESS') {
                    if (statusEl) {
                        statusEl.textContent = `⏳ Waiting for payment on POS... (${attempts}s)`;
                        statusEl.style.color = '#17a2b8';
                    }
                }

                if (attempts >= maxAttempts) {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    
                    if (statusEl) {
                        statusEl.textContent = '⏰ Payment timed out. Please try again.';
                        statusEl.style.color = '#856404';
                    }
                    
                    const posBtn = document.querySelector('#payment-pos button:last-child');
                    if (posBtn) posBtn.disabled = false;
                }

            } catch (err) {
                console.warn('⚠️ POS polling error:', err.message);
            }
        }, 2000);
    }

    // ===== ADD CASH PAYMENT =====
    window.addCashPayment = function() {
        const input = document.getElementById('cash-amount');
        const amount = parseFloat(input.value);
        
        if (!amount || amount <= 0) {
            showCheckoutStatus('Please enter an amount.', 'warning');
            return;
        }

        if (amount > checkoutRemaining) {
            showCheckoutStatus('Amount exceeds remaining balance.', 'warning');
            return;
        }

        addPaymentEntry('Cash', amount);
        document.getElementById('cash-amount').value = '';
        showCheckoutStatus('💰 Added $' + amount.toFixed(2) + ' Cash', 'success');
    };

    // ===== ADD PAYMENT ENTRY =====
    function addPaymentEntry(method, amount) {
        checkoutPaymentEntries.push({ method, amount });
        checkoutRemaining -= amount;
        updateCheckoutUI();
    }

    // ===== REMOVE PAYMENT ENTRY =====
    window.removePaymentEntry = function(index) {
        if (index >= 0 && index < checkoutPaymentEntries.length) {
            const entry = checkoutPaymentEntries[index];
            checkoutRemaining += entry.amount;
            checkoutPaymentEntries.splice(index, 1);
            updateCheckoutUI();
        }
    };

    // ===== SET MAX CARD =====
    window.setMaxCard = function() {
        document.getElementById('card-amount').value = checkoutRemaining.toFixed(2);
    };

    // ===== SET MAX POS =====
    window.setMaxPos = function() {
        document.getElementById('pos-amount').value = checkoutRemaining.toFixed(2);
    };

    // ===== SET MAX CASH =====
    window.setMaxCash = function() {
        document.getElementById('cash-amount').value = checkoutRemaining.toFixed(2);
    };

    // ===== CHECK GIFT CARD =====
    window.checkGiftCardForPayment = function() {
        const input = document.getElementById('giftcard-code');
        const code = input.value.trim().toUpperCase();
        
        if (!code) {
            showCheckoutStatus('Please enter a gift card code.', 'warning');
            return;
        }

        showCheckoutStatus('Checking gift card...', 'info');

        fetch(`${API_BASE}/api/gift-card/balance/${encodeURIComponent(code)}`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                const balance = data.balance || 0;
                document.getElementById('giftcard-balance-display').textContent = balance.toFixed(2);
                document.getElementById('giftcard-info').style.display = 'block';
                document.getElementById('giftcard-info').dataset.code = code;
                document.getElementById('giftcard-info').dataset.balance = balance;
                showCheckoutStatus('✅ Gift card found. Balance: $' + balance.toFixed(2), 'success');
            } else {
                showCheckoutStatus('❌ Gift card not found or invalid.', 'error');
                document.getElementById('giftcard-info').style.display = 'none';
            }
        })
        .catch(err => {
            showCheckoutStatus('❌ Error checking gift card: ' + err.message, 'error');
        });
    };

    // ===== APPLY GIFT CARD PAYMENT =====
    window.applyGiftCardPayment = function() {
        const info = document.getElementById('giftcard-info');
        const code = info.dataset.code;
        const balance = parseFloat(info.dataset.balance || 0);
        
        if (!code || balance <= 0) {
            showCheckoutStatus('No valid gift card to apply.', 'warning');
            return;
        }

        const amount = Math.min(balance, checkoutRemaining);
        if (amount <= 0) {
            showCheckoutStatus('No remaining balance to pay.', 'warning');
            return;
        }

        addPaymentEntry('Gift Card (' + code + ')', amount);
        info.dataset.balance = (balance - amount).toFixed(2);
        document.getElementById('giftcard-balance-display').textContent = (balance - amount).toFixed(2);
        
        if (balance - amount <= 0.01) {
            info.style.display = 'none';
            document.getElementById('giftcard-code').value = '';
            showCheckoutStatus('✅ Gift card fully used.', 'success');
        } else {
            showCheckoutStatus('✅ Applied $' + amount.toFixed(2) + ' from gift card. Remaining: $' + (balance - amount).toFixed(2), 'success');
        }
    };

    // ===== SHOW CHECKOUT STATUS =====
    function showCheckoutStatus(message, type = 'info') {
        const el = document.getElementById('checkout-status');
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

    // ===== COMPLETE CHECKOUT =====
    window.completeCheckout = function() {
        console.log('🛒 Completing checkout...');
        console.log('📊 Payment entries:', checkoutPaymentEntries);
        console.log('💰 Remaining:', checkoutRemaining);

        if (checkoutRemaining > 0.01) {
            showCheckoutStatus('⚠️ Please pay the remaining balance.', 'warning');
            return;
        }

        if (checkoutPaymentEntries.length === 0) {
            showCheckoutStatus('⚠️ No payments added.', 'warning');
            return;
        }

        const items = window.cart.getItems();
        const total = window.cart.getTotal();

        const orderData = {
            items: window.cart.getCheckoutPayload(),
            subtotal: total,
            total: total,
            tax: 0,
            shipping: { method: 'pickup', amount: 0 },
            customer_name: 'Walk-in Customer',
            customer_email: '',
            notes: 'In-store purchase',
            payment_entries: checkoutPaymentEntries
        };

        console.log('📦 Order data:', orderData);

        showCheckoutStatus('⏳ Processing order...', 'info');

        fetch(`${API_BASE}/api/checkout/process`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        })
        .then(res => res.json())
        .then(data => {
            console.log('📥 Order response:', data);
            
            if (data.status === 'success') {
                window.cart.clear();
                window.renderCart();
                
                showCheckoutStatus('✅ Order completed successfully!', 'success');
                
                setTimeout(() => {
                    closeCheckoutModal();
                    window.showToast('🎉 Order complete! Thank you!', 'success');
                }, 1500);
            } else {
                showCheckoutStatus('❌ Order failed: ' + (data.error || 'Unknown error'), 'error');
            }
        })
        .catch(err => {
            console.error('❌ Checkout error:', err);
            showCheckoutStatus('❌ Error: ' + err.message, 'error');
        });
    };

    // ===== DEBTOR FUNCTIONS =====
    window.lookupDebtorForCheckout = function() {
        const input = document.getElementById('checkout-debtor-code');
        const code = input.value.trim().toUpperCase();
        
        if (!code) {
            document.getElementById('checkout-debtor-status').textContent = '⚠️ Please enter a code or name.';
            return;
        }

        fetch(`${API_BASE}/api/debtor/lookup`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: code })
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && data.balance !== undefined) {
                checkoutDebtorData = data;
                document.getElementById('checkout-debtor-info').style.display = 'block';
                document.getElementById('checkout-debtor-name').textContent = data.debtor;
                document.getElementById('checkout-debtor-balance').textContent = data.balance.toFixed(2);
                document.getElementById('checkout-debtor-status').textContent = '✅ Balance: $' + data.balance.toFixed(2);
                document.getElementById('checkout-debtor-status').style.color = '#28a745';
            } else {
                document.getElementById('checkout-debtor-status').textContent = '❌ Not found. Check the code or name.';
                document.getElementById('checkout-debtor-status').style.color = '#dc3545';
                checkoutDebtorData = null;
            }
        })
        .catch(err => {
            document.getElementById('checkout-debtor-status').textContent = '❌ Error: ' + err.message;
            checkoutDebtorData = null;
        });
    };

    window.applyDebtorToCheckout = function() {
        if (!checkoutDebtorData) {
            showCheckoutStatus('Please lookup a debtor first.', 'warning');
            return;
        }

        const balance = checkoutDebtorData.balance || 0;
        if (balance <= 0) {
            showCheckoutStatus('This account has no balance.', 'warning');
            return;
        }

        const amount = Math.min(balance, checkoutRemaining);
        if (amount <= 0) {
            showCheckoutStatus('No remaining balance to pay.', 'warning');
            return;
        }

        addPaymentEntry('Store Credit (' + checkoutDebtorData.debtor + ')', amount);
        checkoutDebtorData.balance = balance - amount;
        document.getElementById('checkout-debtor-balance').textContent = (balance - amount).toFixed(2);
        document.getElementById('checkout-debtor-status').textContent = '✅ Applied $' + amount.toFixed(2) + '. Remaining: $' + (balance - amount).toFixed(2);
        document.getElementById('checkout-debtor-status').style.color = '#28a745';
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
        
        // Check Square availability in background
        checkSquareAvailability();
    };

    // ===== EXPOSE TO WINDOW =====
    window.cart = window.cart;
    window.renderCart = window.renderCart;
    window.updateCartBadge = window.updateCartBadge;
    window.removeCartItem = window.removeCartItem;
    window.clearCart = window.clearCart;
    window.openCheckout = window.openCheckout;
    window.closeCheckoutModal = window.closeCheckoutModal;

    // ===== AUTO-INIT ON LOAD =====
    console.log('🛒 Cart module loaded');

    if (document.getElementById('cartResponse')) {
        setTimeout(function() {
            window.renderCart();
        }, 500);
    }

})();