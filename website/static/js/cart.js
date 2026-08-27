// Cart - Global cart singleton with checkout
(function() {
    // ===== Cart Storage =====
    const STORAGE_KEY = 'pigstyle_cart';

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
        
        items.forEach((item, index) => {
            const itemTotal = (item.price || 0) * (item.quantity || 1);
            total += itemTotal;
            
            html += `
                <div style="display: flex; align-items: center; gap: 12px; background: #f8f8f8; border-radius: 8px; padding: 10px; border: 1px solid #eee;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; color: #333; font-size: 14px;">${item.title || 'Item'}</div>
                        <div style="color: #666; font-size: 12px;">${item.artist || ''} ${item.type ? '[' + item.type + ']' : ''}</div>
                        <div style="color: #ff6b6b; font-weight: bold; font-size: 14px;">$${(item.price || 0).toFixed(2)}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button onclick="window.updateCartItem(${index}, -1)" style="padding: 2px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">-</button>
                        <span style="font-size: 14px; min-width: 20px; text-align: center;">${item.quantity || 1}</span>
                        <button onclick="window.updateCartItem(${index}, 1)" style="padding: 2px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">+</button>
                    </div>
                    <div style="font-weight: bold; color: #333; font-size: 14px; min-width: 60px; text-align: right;">$${itemTotal.toFixed(2)}</div>
                    <button onclick="window.removeCartItem(${index})" style="background: none; border: none; color: #dc3545; font-size: 20px; cursor: pointer;">×</button>
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
                <button onclick="window.checkoutCart()" style="flex: 2; padding: 10px; background: #28a745; color: white; border: none; border-radius: 30px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-credit-card"></i> Checkout
                </button>
            </div>
        `;
        html += '</div>';
        
        container.innerHTML = html;
        updateBadge();
    };

    // ===== Cart Actions =====
    window.updateCartItem = function(index, delta) {
        const items = window.cart.getItems();
        if (items[index]) {
            const newQty = (items[index].quantity || 1) + delta;
            if (newQty <= 0) {
                window.cart.removeItem(items[index].id);
            } else {
                window.cart.updateQuantity(items[index].id, newQty);
            }
            window.renderCart();
        }
    };

    window.removeCartItem = function(index) {
        const items = window.cart.getItems();
        if (items[index]) {
            window.cart.removeItem(items[index].id);
            window.renderCart();
        }
    };

    window.clearCart = function() {
        if (confirm('Are you sure you want to clear your cart?')) {
            window.cart.clear();
            window.renderCart();
        }
    };

    // ===== CHECKOUT =====
    window.checkoutCart = async function() {
        if (window.cart.isEmpty()) {
            alert('Your cart is empty!');
            return;
        }

        const items = window.cart.getItems();
        const total = window.cart.getTotal();
        const count = window.cart.getItemCount();

        // Build order summary
        let summary = '🛒 Order Summary\n\n';
        items.forEach(item => {
            const lineTotal = (item.price || 0) * (item.quantity || 1);
            summary += `${item.title} x${item.quantity} = $${lineTotal.toFixed(2)}\n`;
        });
        summary += `\nTotal: $${total.toFixed(2)}`;
        summary += `\nItems: ${count}`;

        // Show confirmation
        if (!confirm(summary + '\n\nProceed to checkout?')) {
            return;
        }

        const payload = {
            items: window.cart.getCheckoutPayload(),
            subtotal: total,
            total: total,
            item_type: 'mixed'
        };

        try {
            const response = await fetch('http://localhost:5000/api/checkout/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.status === 'success' && data.checkout_url) {
                // Redirect to payment page
                window.location.href = data.checkout_url;
            } else if (data.status === 'success') {
                // Checkout complete - clear cart
                window.cart.clear();
                window.renderCart();
                alert('✅ Order placed successfully! Thank you for shopping at PigStyle Music.');
            } else {
                alert('❌ Checkout failed: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Checkout error:', err);
            alert('❌ Error during checkout: ' + err.message + '\n\nPlease try again or contact the store.');
        }
    };

    // ===== Update Badge (exposed for other pages) =====
    window.updateCartBadge = updateBadge;

    // ===== Init =====
    window.initCart = function() {
        console.log('🛒 Cart initialized with', window.cart.getItemCount(), 'items');
        updateBadge();
        window.renderCart();
    };

    // Auto-init when script loads
    updateBadge();
    console.log('🛒 Cart global ready. Items:', window.cart.getItemCount());

})();
