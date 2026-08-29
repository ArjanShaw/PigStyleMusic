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
    const SHIPPING_COST = 5.70; // Flat shipping rate

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
    let publicCheckoutSubtotal = 0;
    let publicCheckoutTax = 0;
    let publicCheckoutShipping = 0;
    let publicCheckoutTotal = 0;
    let publicCheckoutRemaining = 0;
    let publicCheckoutPaymentEntries = [];
    let publicSquareAvailable = false;
    let publicCheckoutId = null;
    let publicPollInterval = null;
    let publicCheckoutData = {
        customerName: '',
        customerEmail: '',
        shippingMethod: 'pickup',
        address: {
            line1: '',
            line2: '',
            city: '',
            state: '',
            zip: '',
            country: 'USA'
        }
    };
    let publicOrderId = null;
    let publicSquareCheckoutUrl = null;

    // ===== OPEN PUBLIC CHECKOUT =====
    window.openPublicCheckout = function() {
        console.log('🛒 Opening public checkout...');
        
        if (window.cart.isEmpty()) {
            window.showToast('Your cart is empty!', 'warning');
            return;
        }

        // Reset checkout data
        publicCheckoutData = {
            customerName: '',
            customerEmail: '',
            shippingMethod: 'pickup',
            address: {
                line1: '',
                line2: '',
                city: '',
                state: '',
                zip: '',
                country: 'USA'
            }
        };
        publicCheckoutPaymentEntries = [];
        publicOrderId = null;
        publicSquareCheckoutUrl = null;

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
        
        publicCheckoutItems = items;
        publicCheckoutSubtotal = subtotal;
        publicCheckoutShipping = 0;
        publicCheckoutTax = calculateTax(subtotal);
        publicCheckoutTotal = subtotal + publicCheckoutTax;
        publicCheckoutRemaining = publicCheckoutTotal;

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
            overflow-y: auto;
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
            <div style="background: white; border-radius: 16px; max-width: 550px; width: 95%; max-height: 95vh; overflow-y: auto; padding: 0; box-shadow: 0 20px 60px rgba(0,0,0,0.3); margin: 20px auto;">
                <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 20px; border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 1;">
                    <h3 style="margin: 0; color: white;"><i class="fas fa-credit-card"></i> Checkout</h3>
                    <button onclick="closePublicCheckoutModal()" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer;">&times;</button>
                </div>
                
                <div style="padding: 20px;">
                    <!-- Order Summary -->
                    <div style="margin-bottom: 15px; max-height: 120px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 8px;">
                        <div style="font-weight: 600; margin-bottom: 5px; color: #333;">Order Summary (${items.length} items)</div>
                        <div style="font-size: 13px; color: #666;">${itemsHtml}</div>
                    </div>

                    <!-- Customer Information -->
                    <div style="margin-bottom: 15px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                        <div style="font-weight: 600; color: #333; font-size: 14px; margin-bottom: 8px;"><i class="fas fa-user"></i> Contact Information</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div style="grid-column: 1 / -1;">
                                <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 3px;">Full Name *</label>
                                <input type="text" id="public-customer-name" placeholder="Your name" style="width: 100%; padding: 8px 10px; border: 2px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                            </div>
                            <div style="grid-column: 1 / -1;">
                                <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 3px;">Email (for confirmation)</label>
                                <input type="email" id="public-customer-email" placeholder="your@email.com" style="width: 100%; padding: 8px 10px; border: 2px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                            </div>
                        </div>
                    </div>

                    <!-- Shipping Method -->
                    <div style="margin-bottom: 15px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                        <div style="font-weight: 600; color: #333; font-size: 14px; margin-bottom: 8px;"><i class="fas fa-truck"></i> Delivery Method</div>
                        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 8px 14px; background: white; border-radius: 6px; border: 2px solid #28a745; flex: 1; min-width: 120px;">
                                <input type="radio" name="shipping-method" value="pickup" checked onchange="updatePublicShipping()">
                                <span style="font-weight: 500;">📦 Pick up in store</span>
                                <span style="color: #28a745; font-size: 12px; font-weight: 600;">Free</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 8px 14px; background: white; border-radius: 6px; border: 2px solid #ddd; flex: 1; min-width: 120px;" id="shipping-label">
                                <input type="radio" name="shipping-method" value="shipping" onchange="updatePublicShipping()">
                                <span style="font-weight: 500;">🚚 Ship to me</span>
                                <span style="color: #fd7e14; font-size: 12px; font-weight: 600;">+ $${SHIPPING_COST.toFixed(2)}</span>
                            </label>
                        </div>
                    </div>

                    <!-- Shipping Address (hidden by default) -->
                    <div id="public-shipping-address" style="display: none; margin-bottom: 15px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                        <div style="font-weight: 600; color: #333; font-size: 14px; margin-bottom: 8px;"><i class="fas fa-map-pin"></i> Shipping Address</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div style="grid-column: 1 / -1;">
                                <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 3px;">Street Address *</label>
                                <input type="text" id="public-address-line1" placeholder="123 Main St" style="width: 100%; padding: 8px 10px; border: 2px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                            </div>
                            <div style="grid-column: 1 / -1;">
                                <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 3px;">Apartment / Suite</label>
                                <input type="text" id="public-address-line2" placeholder="Apt 4B" style="width: 100%; padding: 8px 10px; border: 2px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 3px;">City *</label>
                                <input type="text" id="public-address-city" placeholder="Loveland" style="width: 100%; padding: 8px 10px; border: 2px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 3px;">State *</label>
                                <input type="text" id="public-address-state" placeholder="CO" style="width: 100%; padding: 8px 10px; border: 2px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 3px;">ZIP Code *</label>
                                <input type="text" id="public-address-zip" placeholder="80538" style="width: 100%; padding: 8px 10px; border: 2px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; font-weight: 600; color: #555; font-size: 12px; margin-bottom: 3px;">Country</label>
                                <input type="text" id="public-address-country" value="USA" style="width: 100%; padding: 8px 10px; border: 2px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                            </div>
                        </div>
                    </div>

                    <!-- Order Totals -->
                    <div style="margin-bottom: 15px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
                            <span style="color: #666;">Subtotal:</span>
                            <span id="public-display-subtotal" style="font-weight: 500;">$${publicCheckoutSubtotal.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
                            <span style="color: #666;">Shipping:</span>
                            <span id="public-display-shipping" style="font-weight: 500;">$0.00</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #e9ecef; padding-bottom: 8px; margin-bottom: 8px;">
                            <span style="color: #666;">Tax (7%):</span>
                            <span id="public-display-tax" style="font-weight: 500;">$${publicCheckoutTax.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600; color: #333; font-size: 16px;">Total:</span>
                            <span id="public-display-total" style="font-weight: bold; color: #28a745; font-size: 22px;">$${publicCheckoutTotal.toFixed(2)}</span>
                        </div>
                    </div>

                    <!-- Payment Method -->
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
                                <span id="public-charge-amount" style="font-weight: bold; color: #28a745; font-size: 15px;">$${publicCheckoutRemaining.toFixed(2)}</span>
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

    // ===== UPDATE SHIPPING =====
    window.updatePublicShipping = function() {
        const shippingRadios = document.querySelectorAll('input[name="shipping-method"]');
        let selectedMethod = 'pickup';
        shippingRadios.forEach(r => {
            if (r.checked) selectedMethod = r.value;
        });

        const addressDiv = document.getElementById('public-shipping-address');
        const shippingLabel = document.getElementById('shipping-label');

        if (selectedMethod === 'shipping') {
            addressDiv.style.display = 'block';
            if (shippingLabel) shippingLabel.style.borderColor = '#fd7e14';
            publicCheckoutShipping = SHIPPING_COST;
        } else {
            addressDiv.style.display = 'none';
            if (shippingLabel) shippingLabel.style.borderColor = '#ddd';
            publicCheckoutShipping = 0;
        }

        publicCheckoutData.shippingMethod = selectedMethod;
        publicCheckoutTotal = publicCheckoutSubtotal + publicCheckoutTax + publicCheckoutShipping;
        publicCheckoutRemaining = publicCheckoutTotal;

        updatePublicCheckoutUI();
    };

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
        // Update totals display
        const subtotalEl = document.getElementById('public-display-subtotal');
        const shippingEl = document.getElementById('public-display-shipping');
        const taxEl = document.getElementById('public-display-tax');
        const totalEl = document.getElementById('public-display-total');
        const chargeEl = document.getElementById('public-charge-amount');

        if (subtotalEl) subtotalEl.textContent = '$' + publicCheckoutSubtotal.toFixed(2);
        if (shippingEl) shippingEl.textContent = '$' + publicCheckoutShipping.toFixed(2);
        if (taxEl) taxEl.textContent = '$' + publicCheckoutTax.toFixed(2);
        if (totalEl) totalEl.textContent = '$' + publicCheckoutTotal.toFixed(2);
        if (chargeEl) chargeEl.textContent = '$' + publicCheckoutRemaining.toFixed(2);

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

        // Gather customer info first
        const nameInput = document.getElementById('public-customer-name');
        const emailInput = document.getElementById('public-customer-email');
        const name = nameInput ? nameInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';

        if (!name) {
            showPublicCheckoutStatus('⚠️ Please enter your name before paying.', 'warning');
            nameInput?.focus();
            return;
        }

        // Validate address if shipping
        if (publicCheckoutData.shippingMethod === 'shipping') {
            const line1 = document.getElementById('public-address-line1');
            const city = document.getElementById('public-address-city');
            const state = document.getElementById('public-address-state');
            const zip = document.getElementById('public-address-zip');

            if (!line1 || !line1.value.trim()) {
                showPublicCheckoutStatus('⚠️ Please enter your street address.', 'warning');
                line1?.focus();
                return;
            }
            if (!city || !city.value.trim()) {
                showPublicCheckoutStatus('⚠️ Please enter your city.', 'warning');
                city?.focus();
                return;
            }
            if (!state || !state.value.trim()) {
                showPublicCheckoutStatus('⚠️ Please enter your state.', 'warning');
                state?.focus();
                return;
            }
            if (!zip || !zip.value.trim()) {
                showPublicCheckoutStatus('⚠️ Please enter your ZIP code.', 'warning');
                zip?.focus();
                return;
            }

            publicCheckoutData.address.line1 = line1.value.trim();
            publicCheckoutData.address.line2 = document.getElementById('public-address-line2')?.value.trim() || '';
            publicCheckoutData.address.city = city.value.trim();
            publicCheckoutData.address.state = state.value.trim();
            publicCheckoutData.address.zip = zip.value.trim();
            publicCheckoutData.address.country = document.getElementById('public-address-country')?.value.trim() || 'USA';
        }

        publicCheckoutData.customerName = name;
        publicCheckoutData.customerEmail = email;

        // Disable the button to prevent double click
        const btn = document.getElementById('public-card-pay-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Creating payment...';
        }

        const statusEl = document.getElementById('public-card-status');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = '⏳ Creating payment link...';
            statusEl.style.color = '#17a2b8';
        }

        // Create order and get Square payment link
        const items = window.cart.getItems();
        const subtotal = window.cart.getTotal();
        const taxAmount = calculateTax(subtotal);
        const totalWithTaxAndShipping = subtotal + taxAmount + publicCheckoutShipping;

        const orderData = {
            items: window.cart.getCheckoutPayload(),
            subtotal: subtotal,
            tax: taxAmount,
            total: totalWithTaxAndShipping,
            shipping: {
                method: publicCheckoutData.shippingMethod,
                amount: publicCheckoutShipping
            },
            customer_name: publicCheckoutData.customerName,
            customer_email: publicCheckoutData.customerEmail,
            address: publicCheckoutData.shippingMethod === 'shipping' ? publicCheckoutData.address : null,
            notes: publicCheckoutData.shippingMethod === 'shipping' ? 
                'Shipped to: ' + publicCheckoutData.address.line1 + ', ' + publicCheckoutData.address.city + ', ' + publicCheckoutData.address.state + ' ' + publicCheckoutData.address.zip : 
                'Pickup in store',
            source: 'public_checkout'
        };

        console.log('📦 Creating order with Square payment:', orderData);

        fetch(`${API_BASE}/api/checkout/process`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                // Store order info for later
                publicOrderId = data.order_id;
                publicSquareCheckoutUrl = data.checkout_url;
                
                // Add payment entry (will be confirmed after Square redirect)
                addPublicPaymentEntry('Credit Card', payAmount);
                
                if (statusEl) {
                    statusEl.textContent = '✅ Payment link created! Redirecting to Square...';
                    statusEl.style.color = '#28a745';
                }
                
                // Redirect to Square checkout
                setTimeout(() => {
                    window.location.href = data.checkout_url;
                }, 1000);
                
            } else {
                showPublicCheckoutStatus('❌ Failed to create payment: ' + (data.error || 'Unknown error'), 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = `Pay $${publicCheckoutRemaining.toFixed(2)} with Card`;
                }
                if (statusEl) {
                    statusEl.textContent = '❌ Failed to create payment link';
                    statusEl.style.color = '#dc3545';
                }
            }
        })
        .catch(err => {
            console.error('❌ Payment creation error:', err);
            showPublicCheckoutStatus('❌ Error: ' + err.message, 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = `Pay $${publicCheckoutRemaining.toFixed(2)} with Card`;
            }
            if (statusEl) {
                statusEl.textContent = '❌ Error creating payment';
                statusEl.style.color = '#dc3545';
            }
        });
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
        // This is now handled by the Square redirect
        // The user is redirected to Square, and after payment they come back
        // The order completion is handled by the /api/order/complete endpoint
        console.log('🛒 Checkout should be completed via Square redirect');
        showPublicCheckoutStatus('Please complete payment on the Square page.', 'info');
    };

    // ===== CHECK FOR SQUARE RETURN =====
    function checkSquareReturn() {
        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('status');
        const orderId = urlParams.get('order_id');
        const paymentId = urlParams.get('payment_id');

        if (status === 'completed' && orderId) {
            console.log('✅ Square payment completed for order:', orderId);
            
            // Call order complete endpoint
            fetch(`${API_BASE}/api/order/complete`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: orderId,
                    transaction_id: paymentId || 'square_' + Date.now()
                })
            })
            .then(res => res.json())
            .then(data => {
                console.log('📥 Order complete response:', data);
                window.cart.clear();
                window.renderCart();
                window.showToast('🎉 Order complete! Thank you!', 'success');
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
            })
            .catch(err => {
                console.error('❌ Order complete error:', err);
                window.showToast('⚠️ Payment completed but order confirmation failed. Please contact support.', 'error');
            });
        }
    }

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
        // Check if returning from Square
        checkSquareReturn();
    };

    // ===== EXPOSE TO WINDOW =====
    window.cart = window.cart;
    window.renderCart = window.renderCart;
    window.updateCartBadge = window.updateCartBadge;
    window.removeCartItem = window.removeCartItem;
    window.clearCart = window.clearCart;
    window.openPublicCheckout = window.openPublicCheckout;
    window.closePublicCheckoutModal = window.closePublicCheckoutModal;
    window.updatePublicShipping = window.updatePublicShipping;

    // ===== AUTO-INIT ON LOAD =====
    console.log('🛒 Cart module loaded');

    if (document.getElementById('cartResponse')) {
        setTimeout(function() {
            window.renderCart();
        }, 500);
    }

})();