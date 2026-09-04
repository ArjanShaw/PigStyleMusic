// ============================================================
// CART - Global cart singleton for public/guest checkout
// Inline checkout on cart page
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
                        copy_id: item.original_id || item.id,
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

    // ===== SHIPPING STATE =====
    let publicCheckoutShipping = 0;
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

    // ===== RENDER CART PAGE WITH INLINE CHECKOUT =====
    window.renderCart = function() {
        const container = document.getElementById('cartResponse');
        if (!container) {
            console.warn('⚠️ cartResponse container not found');
            return;
        }
        
        const items = window.cart.getItems();
        
        if (items.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #888;">
                    <div style="margin-bottom: 20px; font-size: 64px;">🛒</div>
                    <h2 style="color: #333; margin-bottom: 10px;">Your cart is empty</h2>
                    <p style="font-size: 16px; margin-bottom: 20px;">Start shopping to add items!</p>
                    <a href="/shop" style="display: inline-block; padding: 12px 30px; background: #28a745; color: white; text-decoration: none; border-radius: 30px; font-weight: 600;">
                        <i class="fas fa-store"></i> Continue Shopping
                    </a>
                </div>
            `;
            updateBadge();
            return;
        }
        
        // Calculate totals
        const subtotal = window.cart.getTotal();
        const taxAmount = calculateTax(subtotal);
        const shippingCost = publicCheckoutShipping || 0;
        const totalWithTax = subtotal + taxAmount + shippingCost;
        
        let itemsHtml = '';
        items.forEach((item) => {
            const price = item.price || 0;
            const qty = item.quantity || 1;
            const itemTotal = price * qty;
            
            let icon = '📦';
            if (item.type === 'bernie') icon = '🌹';
            else if (item.type === 'giftcard') icon = '🎁';
            else if (item.type === 'custom') icon = '🛍️';
            
            let displayTitle = item.title || 'Item';
            if (item.type === 'record' && item.artist) {
                displayTitle = item.artist + ' - ' + item.title;
            }
            
            itemsHtml += `
                <div style="display: flex; align-items: center; gap: 12px; background: #f8f8f8; border-radius: 8px; padding: 10px 14px; border: 1px solid #eee;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: bold; color: #333; font-size: 14px;">${icon} ${displayTitle}</div>
                        <div style="color: #666; font-size: 12px;">${item.type === 'record' ? '📀 ' + (item.condition || 'Unknown') : ''}</div>
                        <div style="color: #ff6b6b; font-weight: bold; font-size: 14px;">$${(item.price || 0).toFixed(2)} × ${item.quantity || 1}</div>
                    </div>
                    <div style="font-weight: bold; color: #333; font-size: 14px; min-width: 70px; text-align: right;">$${itemTotal.toFixed(2)}</div>
                    <button onclick="window.removeCartItem('${item.id}')" style="background: none; border: none; color: #dc3545; font-size: 20px; cursor: pointer; padding: 0 4px;">×</button>
                </div>
            `;
        });

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 20px; width: 100%; max-width: 900px; margin: 0 auto; padding: 10px 0;">
                <h2 style="color: #333; margin: 0; font-size: 24px;">
                    <i class="fas fa-shopping-cart" style="color: #28a745;"></i> Your Cart
                    <span style="font-size: 14px; color: #666; font-weight: normal;">(${items.length} items)</span>
                </h2>
                
                <!-- Cart Items -->
                <div style="display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; padding-right: 5px;">
                    ${itemsHtml}
                </div>
                
                <!-- Order Totals -->
                <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; border: 1px solid #e9ecef;">
                    <div style="display: flex; justify-content: space-between; padding: 6px 0;">
                        <span style="color: #666;">Subtotal:</span>
                        <span style="font-weight: 500; color: #333;">$${subtotal.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0;">
                        <span style="color: #666;">Shipping:</span>
                        <span id="inline-display-shipping" style="font-weight: 500; color: #333;">$${shippingCost.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e9ecef; padding-bottom: 10px; margin-bottom: 10px;">
                        <span style="color: #666;">Tax (7%):</span>
                        <span style="font-weight: 500; color: #333;">$${taxAmount.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 18px; font-weight: bold; color: #333;">Total:</span>
                        <span id="inline-display-total" style="font-size: 28px; font-weight: bold; color: #28a745;">$${totalWithTax.toFixed(2)}</span>
                    </div>
                </div>
                
                <!-- Customer Information -->
                <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; border: 1px solid #e9ecef;">
                    <div style="font-weight: 600; color: #333; font-size: 15px; margin-bottom: 12px;"><i class="fas fa-user"></i> Contact Information</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div style="grid-column: 1 / -1;">
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Full Name *</label>
                            <input type="text" id="inline-customer-name" placeholder="Your name" style="width: 100%; padding: 10px 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Email (for confirmation)</label>
                            <input type="email" id="inline-customer-email" placeholder="your@email.com" style="width: 100%; padding: 10px 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>
                </div>
                
                <!-- Delivery Method -->
                <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; border: 1px solid #e9ecef;">
                    <div style="font-weight: 600; color: #333; font-size: 15px; margin-bottom: 12px;"><i class="fas fa-truck"></i> Delivery Method</div>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 10px 16px; background: white; border-radius: 8px; border: 2px solid #28a745; flex: 1; min-width: 140px;">
                            <input type="radio" name="inline-shipping-method" value="pickup" checked onchange="updateInlineShipping()">
                            <span style="font-weight: 500; color: #333;">📦 Pick up in store</span>
                            <span style="color: #28a745; font-size: 12px; font-weight: 600;">Free</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 10px 16px; background: white; border-radius: 8px; border: 2px solid #ddd; flex: 1; min-width: 140px;" id="inline-shipping-label">
                            <input type="radio" name="inline-shipping-method" value="shipping" onchange="updateInlineShipping()">
                            <span style="font-weight: 500; color: #333;">🚚 Ship to me</span>
                            <span style="color: #fd7e14; font-size: 12px; font-weight: 600;">+ $${SHIPPING_COST.toFixed(2)}</span>
                        </label>
                    </div>
                </div>
                
                <!-- Shipping Address (hidden by default) -->
                <div id="inline-shipping-address" style="display: none; background: #f8f9fa; border-radius: 12px; padding: 20px; border: 1px solid #e9ecef;">
                    <div style="font-weight: 600; color: #333; font-size: 15px; margin-bottom: 12px;"><i class="fas fa-map-pin"></i> Shipping Address</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div style="grid-column: 1 / -1;">
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Street Address *</label>
                            <input type="text" id="inline-address-line1" placeholder="123 Main St" style="width: 100%; padding: 10px 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Apartment / Suite</label>
                            <input type="text" id="inline-address-line2" placeholder="Apt 4B" style="width: 100%; padding: 10px 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">City *</label>
                            <input type="text" id="inline-address-city" placeholder="Loveland" style="width: 100%; padding: 10px 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">State *</label>
                            <input type="text" id="inline-address-state" placeholder="CO" style="width: 100%; padding: 10px 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">ZIP Code *</label>
                            <input type="text" id="inline-address-zip" placeholder="80538" style="width: 100%; padding: 10px 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Country</label>
                            <input type="text" id="inline-address-country" value="USA" style="width: 100%; padding: 10px 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>
                </div>
                
                <!-- Payment -->
                <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; border: 2px solid #28a745;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span style="font-weight: 600; color: #333; font-size: 15px;"><i class="fas fa-credit-card" style="color: #17a2b8;"></i> Payment</span>
                        <span style="font-size: 12px; color: #6c757d;">Secure via Square</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: white; border-radius: 8px;">
                        <span style="color: #666; font-size: 14px;">Amount to charge:</span>
                        <span id="inline-charge-amount" style="font-weight: bold; color: #28a745; font-size: 20px;">$${totalWithTax.toFixed(2)}</span>
                    </div>
                    <button onclick="processInlinePayment()" id="inline-pay-btn" style="width: 100%; margin-top: 12px; padding: 14px; background: #28a745; color: white; border: none; border-radius: 30px; cursor: pointer; font-weight: 600; font-size: 16px;">
                        <i class="fas fa-credit-card"></i> Pay $${totalWithTax.toFixed(2)} with Card
                    </button>
                    <div id="inline-payment-status" style="margin-top: 8px; font-size: 13px; color: #6c757d; display: none;"></div>
                </div>
                
                <!-- Status Message -->
                <div id="inline-checkout-status" style="display: none; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 500;"></div>
                
                <!-- Cart Actions -->
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button onclick="window.clearCart()" style="padding: 10px 24px; background: #dc3545; color: white; border: none; border-radius: 30px; font-size: 14px; font-weight: 600; cursor: pointer;">
                        <i class="fas fa-trash"></i> Clear Cart
                    </button>
                    <a href="/shop" style="padding: 10px 24px; background: #6c757d; color: white; text-decoration: none; border-radius: 30px; font-size: 14px; font-weight: 600;">
                        <i class="fas fa-store"></i> Continue Shopping
                    </a>
                </div>
            </div>
        `;
        
        updateBadge();
        
        // Add event listeners for shipping method
        document.querySelectorAll('input[name="inline-shipping-method"]').forEach(el => {
            el.addEventListener('change', updateInlineShipping);
        });
        
        // Enter key support for customer name
        const nameInput = document.getElementById('inline-customer-name');
        if (nameInput) {
            nameInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    document.getElementById('inline-customer-email')?.focus();
                }
            });
        }
        
        const emailInput = document.getElementById('inline-customer-email');
        if (emailInput) {
            emailInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    processInlinePayment();
                }
            });
        }
        
        // Update shipping display
        updateInlineShipping();
    };

    // ===== UPDATE INLINE SHIPPING =====
    window.updateInlineShipping = function() {
        const shippingRadios = document.querySelectorAll('input[name="inline-shipping-method"]');
        let selectedMethod = 'pickup';
        shippingRadios.forEach(r => {
            if (r.checked) selectedMethod = r.value;
        });

        const addressDiv = document.getElementById('inline-shipping-address');
        const shippingLabel = document.getElementById('inline-shipping-label');

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
        
        // Update totals
        const items = window.cart.getItems();
        if (items.length > 0) {
            const subtotal = window.cart.getTotal();
            const taxAmount = calculateTax(subtotal);
            const totalWithTax = subtotal + taxAmount + publicCheckoutShipping;
            
            const shippingEl = document.getElementById('inline-display-shipping');
            const totalEl = document.getElementById('inline-display-total');
            const chargeEl = document.getElementById('inline-charge-amount');
            const payBtn = document.getElementById('inline-pay-btn');
            
            if (shippingEl) shippingEl.textContent = '$' + publicCheckoutShipping.toFixed(2);
            if (totalEl) totalEl.textContent = '$' + totalWithTax.toFixed(2);
            if (chargeEl) chargeEl.textContent = '$' + totalWithTax.toFixed(2);
            if (payBtn) payBtn.textContent = `Pay $${totalWithTax.toFixed(2)} with Card`;
        }
    };

    // ===== PROCESS INLINE PAYMENT =====
    window.processInlinePayment = function() {
        const items = window.cart.getItems();
        if (items.length === 0) {
            showInlineStatus('Your cart is empty.', 'warning');
            return;
        }
        
        const subtotal = window.cart.getTotal();
        const taxAmount = calculateTax(subtotal);
        const totalWithTax = subtotal + taxAmount + publicCheckoutShipping;
        
        // Gather customer info
        const nameInput = document.getElementById('inline-customer-name');
        const emailInput = document.getElementById('inline-customer-email');
        const name = nameInput ? nameInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';

        if (!name) {
            showInlineStatus('⚠️ Please enter your name.', 'warning');
            nameInput?.focus();
            return;
        }

        // Validate address if shipping
        if (publicCheckoutData.shippingMethod === 'shipping') {
            const line1 = document.getElementById('inline-address-line1');
            const city = document.getElementById('inline-address-city');
            const state = document.getElementById('inline-address-state');
            const zip = document.getElementById('inline-address-zip');

            if (!line1 || !line1.value.trim()) {
                showInlineStatus('⚠️ Please enter your street address.', 'warning');
                line1?.focus();
                return;
            }
            if (!city || !city.value.trim()) {
                showInlineStatus('⚠️ Please enter your city.', 'warning');
                city?.focus();
                return;
            }
            if (!state || !state.value.trim()) {
                showInlineStatus('⚠️ Please enter your state.', 'warning');
                state?.focus();
                return;
            }
            if (!zip || !zip.value.trim()) {
                showInlineStatus('⚠️ Please enter your ZIP code.', 'warning');
                zip?.focus();
                return;
            }

            publicCheckoutData.address.line1 = line1.value.trim();
            publicCheckoutData.address.line2 = document.getElementById('inline-address-line2')?.value.trim() || '';
            publicCheckoutData.address.city = city.value.trim();
            publicCheckoutData.address.state = state.value.trim();
            publicCheckoutData.address.zip = zip.value.trim();
            publicCheckoutData.address.country = document.getElementById('inline-address-country')?.value.trim() || 'USA';
        }

        publicCheckoutData.customerName = name;
        publicCheckoutData.customerEmail = email;

        // Disable button
        const btn = document.getElementById('inline-pay-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Creating payment...';
        }

        const statusEl = document.getElementById('inline-payment-status');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = '⏳ Creating payment link...';
            statusEl.style.color = '#17a2b8';
        }

        const orderData = {
            items: window.cart.getCheckoutPayload(),
            item_type: 'record',
            subtotal: subtotal,
            tax: taxAmount,
            total: totalWithTax,
            shipping: {
                method: publicCheckoutData.shippingMethod,
                amount: publicCheckoutShipping
            },
            customer_name: publicCheckoutData.customerName,
            customer_email: publicCheckoutData.customerEmail,
            address: publicCheckoutData.shippingMethod === 'shipping' ? publicCheckoutData.address.line1 : '',
            apt: publicCheckoutData.shippingMethod === 'shipping' ? publicCheckoutData.address.line2 : '',
            city: publicCheckoutData.shippingMethod === 'shipping' ? publicCheckoutData.address.city : '',
            state: publicCheckoutData.shippingMethod === 'shipping' ? publicCheckoutData.address.state : '',
            zip: publicCheckoutData.shippingMethod === 'shipping' ? publicCheckoutData.address.zip : '',
            country: publicCheckoutData.shippingMethod === 'shipping' ? publicCheckoutData.address.country : 'USA',
            notes: publicCheckoutData.shippingMethod === 'shipping' ? 
                'Shipped to: ' + publicCheckoutData.address.line1 + ', ' + publicCheckoutData.address.city + ', ' + publicCheckoutData.address.state + ' ' + publicCheckoutData.address.zip : 
                'Pickup in store',
            source: 'public_checkout'
        };

        console.log('📦 Order data:', orderData);

        fetch(`${API_BASE}/api/checkout/process`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        })
        .then(res => res.json())
        .then(data => {
            console.log('📦 /api/checkout/process response:', data);
            
            if (data.status === 'success') {
                publicOrderId = data.order_id;
                publicSquareCheckoutUrl = data.checkout_url;
                
                if (statusEl) {
                    statusEl.textContent = '✅ Payment link created! Redirecting to Square...';
                    statusEl.style.color = '#28a745';
                }
                
                // Redirect to Square checkout
                setTimeout(() => {
                    window.location.href = data.checkout_url;
                }, 1000);
                
            } else {
                showInlineStatus('❌ Failed to create payment: ' + (data.error || 'Unknown error'), 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = `Pay $${totalWithTax.toFixed(2)} with Card`;
                }
                if (statusEl) {
                    statusEl.textContent = '❌ Failed to create payment link';
                    statusEl.style.color = '#dc3545';
                }
            }
        })
        .catch(err => {
            console.error('❌ Payment creation error:', err);
            showInlineStatus('❌ Error: ' + err.message, 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = `Pay $${totalWithTax.toFixed(2)} with Card`;
            }
            if (statusEl) {
                statusEl.textContent = '❌ Error creating payment';
                statusEl.style.color = '#dc3545';
            }
        });
    };

    // ===== SHOW INLINE STATUS =====
    function showInlineStatus(message, type = 'info') {
        const el = document.getElementById('inline-checkout-status');
        if (!el) return;
        el.style.display = 'block';
        el.textContent = message;
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
        el.style.background = colors[type] || '#f8f9fa';
        el.style.color = textColors[type] || '#333';
        el.style.border = `1px solid ${colors[type] || '#ddd'}`;
        el.style.padding = '12px';
        el.style.borderRadius = '8px';
        clearTimeout(el._timeout);
        el._timeout = setTimeout(() => {
            el.style.display = 'none';
        }, 5000);
    }

    // ===== CHECK FOR SQUARE RETURN =====
    function checkSquareReturn() {
        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('status');
        const orderId = urlParams.get('order_id');
        const paymentId = urlParams.get('payment_id');

        console.log(`🔵 URL Params - status: ${status}, orderId: ${orderId}, paymentId: ${paymentId}`);

        if (status === 'completed' && orderId) {
            console.log('✅ Square payment completed for order:', orderId);
            
            // Show status
            const statusDiv = document.getElementById('inline-checkout-status');
            if (statusDiv) {
                statusDiv.style.display = 'block';
                statusDiv.textContent = '⏳ Confirming your order...';
                statusDiv.style.background = '#cce5ff';
                statusDiv.style.color = '#004085';
                statusDiv.style.border = '1px solid #b8daff';
            }
            
            const payload = {
                order_id: orderId,
                transaction_id: paymentId || 'square_' + Date.now()
            };
            
            console.log('📦 Calling /api/order/complete with payload:', payload);
            
            // Call order complete endpoint to mark records as sold
            fetch(`${API_BASE}/api/order/complete`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .then(data => {
                console.log('📥 Order complete response:', data);
                
                if (data.status === 'success') {
                    // Clear cart and update UI
                    window.cart.clear();
                    window.renderCart();
                    
                    // Show success message
                    if (statusDiv) {
                        statusDiv.textContent = '✅ Order complete! Thank you for your purchase!';
                        statusDiv.style.background = '#d4edda';
                        statusDiv.style.color = '#155724';
                        statusDiv.style.border = '1px solid #c3e6cb';
                    }
                    
                    if (typeof window.showToast === 'function') {
                        window.showToast('🎉 Order complete! Thank you!', 'success');
                    }
                    
                    // Clean URL (remove query params)
                    window.history.replaceState({}, document.title, window.location.pathname);
                } else {
                    console.error('❌ Order completion failed:', data.error);
                    if (statusDiv) {
                        statusDiv.textContent = '⚠️ ' + (data.error || 'Order confirmation failed. Please contact support.');
                        statusDiv.style.background = '#fff3cd';
                        statusDiv.style.color = '#856404';
                        statusDiv.style.border = '1px solid #ffeeba';
                    }
                    if (typeof window.showToast === 'function') {
                        window.showToast('⚠️ ' + (data.error || 'Order confirmation failed. Please contact support.'), 'error');
                    }
                }
            })
            .catch(err => {
                console.error('❌ Order complete error:', err);
                if (statusDiv) {
                    statusDiv.textContent = '⚠️ Error: ' + err.message;
                    statusDiv.style.background = '#f8d7da';
                    statusDiv.style.color = '#721c24';
                    statusDiv.style.border = '1px solid #f5c6cb';
                }
                if (typeof window.showToast === 'function') {
                    window.showToast('⚠️ Error: ' + err.message, 'error');
                }
            });
        } else {
            console.log('🔵 No completed order found in URL params.');
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
    window.updateInlineShipping = window.updateInlineShipping;
    window.processInlinePayment = window.processInlinePayment;
    window.checkSquareReturn = checkSquareReturn;

    // ===== AUTO-INIT ON LOAD =====
    console.log('🛒 Cart module loaded');

    if (document.getElementById('cartResponse')) {
        setTimeout(function() {
            window.renderCart();
        }, 500);
    }

})();