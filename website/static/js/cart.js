// Cart - Global cart singleton with full checkout
(function() {
    'use strict';

    const STORAGE_KEY = 'pigstyle_cart';
    const API_BASE = '';
    const SHIPPING_COST = 5.70;

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
        
        const isAdmin = getUserRole() === 'admin';
        
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

    // ===== GET USER ROLE =====
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

    // ===== OPEN CHECKOUT =====
    window.openCheckout = function() {
        const isAdmin = getUserRole() === 'admin';
        
        if (window.cart.isEmpty()) {
            showToast('Your cart is empty!', 'warning');
            return;
        }

        if (isAdmin) {
            openAdminCheckout();
        } else {
            openGuestCheckoutModal();
        }
    };

    // ===== GUEST CHECKOUT MODAL =====
    function openGuestCheckoutModal() {
        const total = window.cart.getTotal();
        const modal = document.createElement('div');
        modal.id = 'guest-checkout-modal';
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
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; max-width: 450px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 30px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #333; font-size: 24px;">🛒 Checkout</h2>
                    <button onclick="closeGuestCheckoutModal()" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #999; padding: 0 8px;">&times;</button>
                </div>
                
                <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 14px; color: #666; margin-bottom: 5px;">
                        <span>Subtotal</span>
                        <span>$${total.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 14px; color: #666; margin-bottom: 5px;" id="guest-shipping-display">
                        <span>Shipping</span>
                        <span id="guest-shipping-amount">$0.00</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; color: #333; border-top: 2px solid #ddd; padding-top: 10px;">
                        <span>Total</span>
                        <span id="guest-total-amount">$${total.toFixed(2)}</span>
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 600; color: #555; margin-bottom: 8px;">Delivery Method</label>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="selectGuestShipping('pickup')" id="guest-pickup-btn" style="flex: 1; padding: 12px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                            <i class="fas fa-store"></i> Pickup In-Store
                        </button>
                        <button onclick="selectGuestShipping('shipping')" id="guest-shipping-btn" style="flex: 1; padding: 12px; background: #e9ecef; color: #333; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                            <i class="fas fa-truck"></i> Ship ($${SHIPPING_COST.toFixed(2)})
                        </button>
                    </div>
                </div>
                
                <div id="guest-address-section" style="display: none; margin-bottom: 20px;">
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Full Name</label>
                        <input type="text" id="guest-name" placeholder="John Doe" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Email</label>
                        <input type="email" id="guest-email" placeholder="john@example.com" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Address Line 1</label>
                        <input type="text" id="guest-address1" placeholder="123 Main St" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Address Line 2 (optional)</label>
                        <input type="text" id="guest-address2" placeholder="Apt 4B" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div style="margin-bottom: 10px;">
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">City</label>
                            <input type="text" id="guest-city" placeholder="Loveland" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div style="margin-bottom: 10px;">
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">State</label>
                            <input type="text" id="guest-state" placeholder="CO" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">ZIP Code</label>
                        <input type="text" id="guest-zip" placeholder="80537" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                </div>
                
                <div id="guest-status" style="display: none; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px;"></div>
                
                <button onclick="processGuestCheckout()" id="guest-checkout-btn" style="width: 100%; padding: 14px; background: #28a745; color: white; border: none; border-radius: 30px; font-size: 16px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-credit-card"></i> Pay with Card
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close on click outside
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeGuestCheckoutModal();
            }
        });
        
        // Escape key to close
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closeGuestCheckoutModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        // Default to pickup
        selectGuestShipping('pickup');
    }

    window.closeGuestCheckoutModal = function() {
        const modal = document.getElementById('guest-checkout-modal');
        if (modal) modal.remove();
    };

    let guestShippingMethod = 'pickup';
    let guestTotal = 0;

    window.selectGuestShipping = function(method) {
        guestShippingMethod = method;
        const total = window.cart.getTotal();
        const pickupBtn = document.getElementById('guest-pickup-btn');
        const shippingBtn = document.getElementById('guest-shipping-btn');
        const addressSection = document.getElementById('guest-address-section');
        const shippingDisplay = document.getElementById('guest-shipping-display');
        const shippingAmount = document.getElementById('guest-shipping-amount');
        const totalDisplay = document.getElementById('guest-total-amount');
        
        if (method === 'pickup') {
            pickupBtn.style.background = '#28a745';
            pickupBtn.style.color = 'white';
            shippingBtn.style.background = '#e9ecef';
            shippingBtn.style.color = '#333';
            addressSection.style.display = 'none';
            shippingAmount.textContent = '$0.00';
            guestTotal = total;
            totalDisplay.textContent = '$' + total.toFixed(2);
        } else {
            shippingBtn.style.background = '#28a745';
            shippingBtn.style.color = 'white';
            pickupBtn.style.background = '#e9ecef';
            pickupBtn.style.color = '#333';
            addressSection.style.display = 'block';
            const shippingCost = SHIPPING_COST;
            shippingAmount.textContent = '$' + shippingCost.toFixed(2);
            guestTotal = total + shippingCost;
            totalDisplay.textContent = '$' + guestTotal.toFixed(2);
        }
    };

    window.processGuestCheckout = async function() {
        const statusDiv = document.getElementById('guest-status');
        const btn = document.getElementById('guest-checkout-btn');
        
        if (window.cart.isEmpty()) {
            showToast('Your cart is empty!', 'warning');
            return;
        }

        // Validate address if shipping
        if (guestShippingMethod === 'shipping') {
            const name = document.getElementById('guest-name').value.trim();
            const email = document.getElementById('guest-email').value.trim();
            const address1 = document.getElementById('guest-address1').value.trim();
            const city = document.getElementById('guest-city').value.trim();
            const state = document.getElementById('guest-state').value.trim();
            const zip = document.getElementById('guest-zip').value.trim();
            
            if (!name) {
                statusDiv.style.display = 'block';
                statusDiv.textContent = '❌ Please enter your full name';
                statusDiv.className = 'status-message status-error';
                return;
            }
            if (!email || !email.includes('@')) {
                statusDiv.style.display = 'block';
                statusDiv.textContent = '❌ Please enter a valid email';
                statusDiv.className = 'status-message status-error';
                return;
            }
            if (!address1) {
                statusDiv.style.display = 'block';
                statusDiv.textContent = '❌ Please enter your address';
                statusDiv.className = 'status-message status-error';
                return;
            }
            if (!city || !state || !zip) {
                statusDiv.style.display = 'block';
                statusDiv.textContent = '❌ Please enter city, state, and ZIP';
                statusDiv.className = 'status-message status-error';
                return;
            }
        }

        statusDiv.style.display = 'block';
        statusDiv.textContent = '⏳ Processing...';
        statusDiv.className = 'status-message status-info';
        btn.disabled = true;

        const items = window.cart.getItems();
        const payload = window.cart.getCheckoutPayload();
        const total = guestTotal;

        const requestBody = {
            items: payload,
            subtotal: window.cart.getTotal(),
            total: total,
            tax: 0,
            shipping: {
                method: guestShippingMethod,
                amount: guestShippingMethod === 'shipping' ? SHIPPING_COST : 0
            },
            customer_name: guestShippingMethod === 'shipping' ? document.getElementById('guest-name').value.trim() : 'Guest',
            customer_email: guestShippingMethod === 'shipping' ? document.getElementById('guest-email').value.trim() : '',
            address: guestShippingMethod === 'shipping' ? document.getElementById('guest-address1').value.trim() : '',
            apt: guestShippingMethod === 'shipping' ? document.getElementById('guest-address2').value.trim() : '',
            city: guestShippingMethod === 'shipping' ? document.getElementById('guest-city').value.trim() : '',
            state: guestShippingMethod === 'shipping' ? document.getElementById('guest-state').value.trim() : '',
            zip: guestShippingMethod === 'shipping' ? document.getElementById('guest-zip').value.trim() : '',
            notes: 'Guest checkout from cart',
            payment_entries: [{ method: 'Card (Square)', amount: total }]
        };

        try {
            const response = await fetch(`${API_BASE}/api/checkout/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();

            if (data.status === 'success' && data.checkout_url) {
                // Store the order ID for when the customer returns
                sessionStorage.setItem('pending_order_id', data.order_id);
                sessionStorage.setItem('pending_order_number', data.order_number);
                
                window.cart.clear();
                window.renderCart();
                closeGuestCheckoutModal();
                
                // Redirect to Square
                window.location.href = data.checkout_url;
            } else {
                statusDiv.textContent = '❌ Payment failed: ' + (data.error || 'Unknown error');
                statusDiv.className = 'status-message status-error';
                btn.disabled = false;
            }
        } catch (err) {
            console.error('Checkout error:', err);
            statusDiv.textContent = '❌ Error: ' + err.message;
            statusDiv.className = 'status-message status-error';
            btn.disabled = false;
        }
    };

    // ===== CHECK FOR PAYMENT REDIRECT =====
    function checkPaymentRedirect() {
        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('status');
        const orderId = urlParams.get('order_id');
        
        console.log('status:', status);
        console.log('orderId:', orderId);

        if (status === 'completed' && orderId) {

            console.log('✅ Completing order:', orderId);


            // Clean the URL (remove the query params)
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Show processing message
            showConfirmationModal('⏳', 'Processing your order...', 'Please wait while we confirm your payment.');
            
            // Call the order complete endpoint
            fetch(`${API_BASE}/api/order/complete`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: orderId,
                    transaction_id: ''
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    showConfirmationModal('🎉', 'Order Placed Successfully!', 
                        'Thank you for your order! You will receive a confirmation email shortly.');
                } else {
                    showConfirmationModal('⚠️', 'Order Received', 
                        'Your order was placed, but we\'re having trouble confirming it. Please contact us if you don\'t receive a confirmation email.');
                }
            })
            .catch(err => {
                console.error('Error completing order:', err);
                showConfirmationModal('⚠️', 'Order Received', 
                    'Your order was placed, but we\'re having trouble confirming it. Please contact us if you don\'t receive a confirmation email.');
            });
        }
    }

    // ===== CONFIRMATION MODAL =====
    function showConfirmationModal(emoji, title, message) {
        // Remove any existing confirmation modal
        const existing = document.getElementById('order-confirmation-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'order-confirmation-modal';
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
        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; max-width: 450px; width: 90%; padding: 40px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <div style="font-size: 64px; margin-bottom: 15px;">${emoji}</div>
                <h2 style="margin: 0 0 10px 0; color: #333; font-size: 24px;">${title}</h2>
                <p style="color: #666; margin-bottom: 25px; font-size: 15px; line-height: 1.5;">${message}</p>
                <button onclick="document.getElementById('order-confirmation-modal').remove(); window.location.href='/?page=home'" 
                        style="padding: 12px 40px; background: #28a745; color: white; border: none; border-radius: 30px; cursor: pointer; font-weight: 600; font-size: 16px;">
                    Continue Shopping
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // ===== ADMIN CHECKOUT =====
    function openAdminCheckout() {
        // ... (admin checkout logic from existing code)
    }

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

    // ===== Init =====
    window.updateCartBadge = updateBadge;

    window.initCart = function() {
        console.log('🛒 Cart initialized with', window.cart.getItemCount(), 'items');
        updateBadge();
        window.renderCart();
        
        // Check if we're returning from a payment
        checkPaymentRedirect();
    };

    // Check on page load if not initialized yet
    if (document.readyState === 'complete') {
        checkPaymentRedirect();
    } else {
        document.addEventListener('DOMContentLoaded', checkPaymentRedirect);
    }

    updateBadge();
    console.log('🛒 Cart global ready. Items:', window.cart.getItemCount());

})();
