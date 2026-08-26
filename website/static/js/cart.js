// Cart page - displays shopping cart
(function() {
    // Get cart from localStorage
    function getCart() {
        try {
            const cart = localStorage.getItem('pigstyle_cart');
            return cart ? JSON.parse(cart) : [];
        } catch {
            return [];
        }
    }

    // Save cart to localStorage
    function saveCart(cart) {
        localStorage.setItem('pigstyle_cart', JSON.stringify(cart));
        updateCartBadge();
    }

    // Update the cart badge in the navigation
    function updateCartBadge() {
        const cart = getCart();
        const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        const badge = document.getElementById('cartBadge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline' : 'none';
        }
    }

    window.renderCart = function() {
        const container = document.getElementById('cartResponse');
        if (!container) return;
        
        const cart = getCart();
        console.log('Cart items:', cart);
        
        if (!cart || cart.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #888;">
                    <div style="margin-bottom: 10px; font-size: 48px;">🛒</div>
                    <p style="font-size: 18px;">Your cart is empty</p>
                    <p style="font-size: 13px; margin-top: 5px;">Start shopping to add items!</p>
                </div>
            `;
            return;
        }
        
        let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
        let total = 0;
        
        cart.forEach(function(item, index) {
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
                        <button onclick="updateCartItem(${index}, -1)" style="padding: 2px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">-</button>
                        <span style="font-size: 14px; min-width: 20px; text-align: center;">${item.quantity || 1}</span>
                        <button onclick="updateCartItem(${index}, 1)" style="padding: 2px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">+</button>
                    </div>
                    <div style="font-weight: bold; color: #333; font-size: 14px; min-width: 60px; text-align: right;">$${itemTotal.toFixed(2)}</div>
                    <button onclick="removeCartItem(${index})" style="background: none; border: none; color: #dc3545; font-size: 20px; cursor: pointer;">×</button>
                </div>
            `;
        });
        
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 2px solid #ddd; margin-top: 5px;">
                <span style="font-size: 16px; font-weight: bold; color: #333;">Total:</span>
                <span style="font-size: 24px; font-weight: bold; color: #ff6b6b;">$${total.toFixed(2)}</span>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button onclick="clearCart()" style="flex: 1; padding: 10px; background: #dc3545; color: white; border: none; border-radius: 30px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-trash"></i> Clear Cart
                </button>
                <button onclick="checkout()" style="flex: 2; padding: 10px; background: #ff6b6b; color: white; border: none; border-radius: 30px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-check"></i> Proceed to Checkout
                </button>
            </div>
        `;
        html += '</div>';
        
        container.innerHTML = html;
        updateCartBadge();
    };

    window.updateCartItem = function(index, delta) {
        const cart = getCart();
        if (cart[index]) {
            cart[index].quantity = (cart[index].quantity || 1) + delta;
            if (cart[index].quantity <= 0) {
                cart.splice(index, 1);
            }
            saveCart(cart);
            renderCart();
        }
    };

    window.removeCartItem = function(index) {
        const cart = getCart();
        cart.splice(index, 1);
        saveCart(cart);
        renderCart();
    };

    window.clearCart = function() {
        if (confirm('Are you sure you want to clear your cart?')) {
            saveCart([]);
            renderCart();
        }
    };

    window.checkout = function() {
        const cart = getCart();
        if (!cart || cart.length === 0) {
            alert('Your cart is empty!');
            return;
        }
        alert('🛒 Checkout functionality coming soon!\n\nItems: ' + cart.length + '\nTotal: $' + cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0).toFixed(2));
    };

    window.initCart = function() {
        console.log('Cart initialized');
        updateCartBadge();
        renderCart();
    };
})();
