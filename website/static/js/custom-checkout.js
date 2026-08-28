// ============================================================
// CUSTOM CHECKOUT - Add custom items to the global cart
// Integrates with the cart.js singleton
// ============================================================

(function() {
    'use strict';

    console.log('🚀 Custom Checkout module loaded');

    // ========== CHECK ADMIN ACCESS ==========
    function isAdmin() {
        try {
            const userData = localStorage.getItem('pigstyle_user');
            if (userData) {
                const user = JSON.parse(userData);
                return user.role === 'admin' || user.role === 'manager';
            }
        } catch {}
        return false;
    }

    // ========== INIT ==========
    window.initCustomCheckout = function() {
        console.log('🔧 initCustomCheckout called');
        const container = document.getElementById('custom-checkout-container');
        
        if (!container) {
            console.error('❌ custom-checkout-container not found');
            return;
        }

        // Check if user is admin
        if (!isAdmin()) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 20px;">🔒</div>
                    <h2 style="color: #333;">Admin Access Required</h2>
                    <p style="color: #666;">Please log in as an admin to use this feature.</p>
                    <button onclick="showPage('login')" style="margin-top: 20px; padding: 10px 30px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">
                        <i class="fas fa-sign-in-alt"></i> Go to Login
                    </button>
                </div>
            `;
            return;
        }

        // Render the page
        container.innerHTML = customCheckoutTemplate();
        
        // Initialize event listeners
        setTimeout(() => {
            initCustomCheckoutEvents();
        }, 100);
    };

    // ========== TEMPLATE ==========
    function customCheckoutTemplate() {
        const itemCount = window.cart ? window.cart.getItemCount() : 0;
        const total = window.cart ? window.cart.getTotal() : 0;
        
        return `
            <div style="display: flex; flex-direction: column; gap: 16px; padding: 20px; max-width: 800px; margin: 0 auto; width: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                    <div>
                        <h2 style="color: #333; margin: 0;"><i class="fas fa-plus-circle" style="color: #17a2b8;"></i> Custom Checkout</h2>
                        <p style="color: #666; margin: 5px 0 0 0;">Add custom items, Bernie donations, or gift cards to your cart</p>
                    </div>
                    <button onclick="window.goToCart()" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-shopping-cart"></i> Cart (${itemCount}) 
                        <span style="font-size: 12px; opacity: 0.8;">$${total.toFixed(2)}</span>
                    </button>
                </div>

                <!-- Status Message -->
                <div id="custom-checkout-status" style="display: none; padding: 12px; border-radius: 8px; font-weight: 500; text-align: center;"></div>

                <!-- Custom Item Form -->
                <div style="background: white; border-radius: 12px; padding: 20px; border: 2px solid #17a2b8;">
                    <h3 style="color: #17a2b8; margin: 0 0 15px 0;"><i class="fas fa-plus-circle"></i> Add Custom Item</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Item Name *</label>
                            <input type="text" id="custom-item-name" placeholder="e.g., Vinyl Cleaning Kit" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Price ($) *</label>
                            <input type="number" id="custom-item-price" placeholder="0.00" step="0.01" min="0.01" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>
                    <div style="margin-top: 12px;">
                        <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Quantity</label>
                        <input type="number" id="custom-item-qty" value="1" min="1" step="1" style="width: 80px; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px;">
                    </div>
                    <button onclick="addCustomItem()" style="margin-top: 15px; padding: 12px 30px; background: #17a2b8; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 15px; width: 100%;">
                        <i class="fas fa-cart-plus"></i> Add to Cart
                    </button>
                </div>

                <!-- Quick Add Buttons -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <button onclick="addBernieItem()" style="padding: 16px; background: #ffc107; color: #333; border: none; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 16px;">
                        <i class="fas fa-donate" style="font-size: 24px; display: block; margin-bottom: 5px;"></i>
                        Bernie ($0.99)
                        <div style="font-size: 12px; font-weight: normal; color: #666;">Adds to Bernie fund</div>
                    </button>
                    <button onclick="showGiftCardModal()" style="padding: 16px; background: #28a745; color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 16px;">
                        <i class="fas fa-gift" style="font-size: 24px; display: block; margin-bottom: 5px;"></i>
                        Gift Card
                        <div style="font-size: 12px; font-weight: normal; color: #d4edda;">Add gift card to cart</div>
                    </button>
                </div>

                <!-- Quick Presets -->
                <div style="background: #f8f9fa; border-radius: 12px; padding: 15px; border: 1px solid #e9ecef;">
                    <div style="font-weight: 600; color: #333; margin-bottom: 10px;">
                        <i class="fas fa-bolt"></i> Quick Presets
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button onclick="addPresetItem('Vinyl Cleaning Kit', 24.99)" style="padding: 8px 16px; background: #e9ecef; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">🧼 Vinyl Kit - $24.99</button>
                        <button onclick="addPresetItem('Record Sleeves (50pk)', 12.99)" style="padding: 8px 16px; background: #e9ecef; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">💿 Sleeves 50pk - $12.99</button>
                        <button onclick="addPresetItem('PigStyle T-Shirt', 19.99)" style="padding: 8px 16px; background: #e9ecef; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">👕 T-Shirt - $19.99</button>
                        <button onclick="addPresetItem('Tote Bag', 14.99)" style="padding: 8px 16px; background: #e9ecef; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">🛍️ Tote - $14.99</button>
                        <button onclick="addPresetItem('Pins (5pk)', 8.99)" style="padding: 8px 16px; background: #e9ecef; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">📌 Pins 5pk - $8.99</button>
                        <button onclick="addPresetItem('Record Weight', 34.99)" style="padding: 8px 16px; background: #e9ecef; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">⚖️ Record Weight - $34.99</button>
                    </div>
                </div>

                <!-- Cart Preview -->
                <div style="background: #f8f9fa; border-radius: 12px; padding: 15px; border: 1px solid #e9ecef; max-height: 250px; overflow-y: auto;">
                    <div style="font-weight: 600; color: #333; margin-bottom: 10px;">
                        <i class="fas fa-shopping-cart"></i> Cart Preview 
                        (<span id="custom-cart-preview-count">0</span> items, <span id="custom-cart-preview-total">$0.00</span>)
                    </div>
                    <div id="custom-cart-preview">
                        <div style="color: #999; text-align: center; padding: 20px; font-size: 14px;">No items in cart yet</div>
                    </div>
                </div>
            </div>

            <!-- Gift Card Modal -->
            <div id="giftcard-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10002; align-items: center; justify-content: center;">
                <div style="background: white; border-radius: 16px; max-width: 400px; width: 95%; padding: 30px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #333;"><i class="fas fa-gift" style="color: #28a745;"></i> Add Gift Card</h2>
                        <button onclick="closeGiftCardModal()" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #999; padding: 0 8px;">&times;</button>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Amount ($)</label>
                        <input type="number" id="giftcard-modal-amount" placeholder="25.00" step="0.01" min="0.01" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 4px;">Recipient Name (optional)</label>
                        <input type="text" id="giftcard-modal-recipient" placeholder="For: John" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>
                    <div id="giftcard-modal-status" style="display: none; padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 10px;"></div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button onclick="closeGiftCardModal()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">Cancel</button>
                        <button onclick="addGiftCardItem()" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                            <i class="fas fa-plus"></i> Add to Cart
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // ========== INIT EVENTS ==========
    function initCustomCheckoutEvents() {
        console.log('🔧 initCustomCheckoutEvents called');
        updateCartPreview();
        updateCartCount();

        // Enter key support for custom item
        document.getElementById('custom-item-name')?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('custom-item-price')?.focus();
            }
        });
        document.getElementById('custom-item-price')?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('custom-item-qty')?.focus();
            }
        });
        document.getElementById('custom-item-qty')?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                addCustomItem();
            }
        });
    }

    // ========== ADD CUSTOM ITEM ==========
    window.addCustomItem = function() {
        const nameInput = document.getElementById('custom-item-name');
        const priceInput = document.getElementById('custom-item-price');
        const qtyInput = document.getElementById('custom-item-qty');
        const statusEl = document.getElementById('custom-checkout-status');

        const name = nameInput?.value?.trim();
        const price = parseFloat(priceInput?.value);
        const qty = parseInt(qtyInput?.value) || 1;

        // Validate
        if (!name) {
            showStatus(statusEl, '⚠️ Please enter an item name.', 'warning');
            nameInput?.focus();
            return;
        }
        if (!price || price <= 0) {
            showStatus(statusEl, '⚠️ Please enter a valid price.', 'warning');
            priceInput?.focus();
            return;
        }

        // Check cart exists
        if (typeof window.cart === 'undefined' || !window.cart.addItem) {
            showStatus(statusEl, '❌ Cart system not available.', 'error');
            return;
        }

        // Add each quantity as a separate item
        for (let i = 0; i < qty; i++) {
            const item = {
                id: 'custom_' + Date.now() + '_' + i,
                type: 'custom',
                title: name + (qty > 1 ? ` (${i+1}/${qty})` : ''),
                artist: 'Custom Item',
                price: price,
                quantity: 1,
                options: { isCustom: true }
            };
            
            window.cart.addItem(item);
        }

        const total = price * qty;
        showStatus(statusEl, `✅ Added ${qty}x "${name}" to cart ($${total.toFixed(2)})`, 'success');
        
        // Clear fields
        if (nameInput) nameInput.value = '';
        if (priceInput) priceInput.value = '';
        if (qtyInput) qtyInput.value = '1';
        nameInput?.focus();

        // Update UI
        updateCartPreview();
        updateCartCount();
        
        // Refresh cart badge if function exists
        if (typeof window.updateCartBadge === 'function') {
            window.updateCartBadge();
        }
    };

    // ========== ADD BERNIE ITEM ==========
    window.addBernieItem = function() {
        if (typeof window.cart === 'undefined' || !window.cart.addItem) {
            const statusEl = document.getElementById('custom-checkout-status');
            showStatus(statusEl, '❌ Cart system not available.', 'error');
            return;
        }

        const item = {
            id: 'bernie_' + Date.now(),
            type: 'bernie',
            title: 'Bernie Campaign Donation',
            artist: 'Bernie Sanders',
            price: 0.99,
            quantity: 1,
            options: { isBernie: true }
        };
        
        window.cart.addItem(item);
        updateCartPreview();
        updateCartCount();
        
        if (typeof window.updateCartBadge === 'function') {
            window.updateCartBadge();
        }
        
        showToast('🌹 Added Bernie donation ($0.99) to cart!');
    };

    // ========== ADD PRESET ITEM ==========
    window.addPresetItem = function(name, price) {
        if (typeof window.cart === 'undefined' || !window.cart.addItem) {
            const statusEl = document.getElementById('custom-checkout-status');
            showStatus(statusEl, '❌ Cart system not available.', 'error');
            return;
        }

        const item = {
            id: 'preset_' + Date.now(),
            type: 'custom',
            title: name,
            artist: 'Merch',
            price: price,
            quantity: 1,
            options: { isCustom: true }
        };
        
        window.cart.addItem(item);
        updateCartPreview();
        updateCartCount();
        
        if (typeof window.updateCartBadge === 'function') {
            window.updateCartBadge();
        }
        
        showToast(`✅ Added "${name}" to cart ($${price.toFixed(2)})`);
    };

    // ========== GIFT CARD ==========
    window.showGiftCardModal = function() {
        document.getElementById('giftcard-modal').style.display = 'flex';
        document.getElementById('giftcard-modal-amount').focus();
    };

    window.closeGiftCardModal = function() {
        document.getElementById('giftcard-modal').style.display = 'none';
    };

    window.addGiftCardItem = function() {
        const amountInput = document.getElementById('giftcard-modal-amount');
        const recipientInput = document.getElementById('giftcard-modal-recipient');
        const statusEl = document.getElementById('giftcard-modal-status');

        const amount = parseFloat(amountInput?.value);
        const recipient = recipientInput?.value?.trim() || 'Bearer';

        if (!amount || amount <= 0) {
            showStatus(statusEl, '⚠️ Please enter a valid amount.', 'warning');
            amountInput?.focus();
            return;
        }

        if (typeof window.cart === 'undefined' || !window.cart.addItem) {
            showStatus(statusEl, '❌ Cart system not available.', 'error');
            return;
        }

        const item = {
            id: 'giftcard_' + Date.now(),
            type: 'giftcard',
            title: `Gift Card - ${recipient}`,
            artist: 'Gift Card',
            price: amount,
            quantity: 1,
            options: { isGiftCard: true, recipient: recipient }
        };
        
        window.cart.addItem(item);
        updateCartPreview();
        updateCartCount();
        
        if (typeof window.updateCartBadge === 'function') {
            window.updateCartBadge();
        }
        
        showToast(`🎁 Added gift card ($${amount.toFixed(2)}) to cart!`);
        closeGiftCardModal();
        
        if (amountInput) amountInput.value = '';
        if (recipientInput) recipientInput.value = '';
    };

    // ========== GO TO CART ==========
    window.goToCart = function() {
        if (typeof showPage === 'function') {
            showPage('cart');
        } else {
            window.location.href = '#cart';
            location.reload();
        }
    };

    // ========== UPDATE CART PREVIEW ==========
    function updateCartPreview() {
        const items = window.cart ? window.cart.getItems() : [];
        const container = document.getElementById('custom-cart-preview');
        const countEl = document.getElementById('custom-cart-preview-count');
        const totalEl = document.getElementById('custom-cart-preview-total');
        
        if (countEl) countEl.textContent = items.length;
        if (totalEl) totalEl.textContent = '$' + (window.cart ? window.cart.getTotal().toFixed(2) : '0.00');

        if (!container) return;

        if (!items || items.length === 0) {
            container.innerHTML = `<div style="color: #999; text-align: center; padding: 20px; font-size: 14px;">No items in cart yet</div>`;
            return;
        }

        let html = '';
        let total = 0;
        items.forEach((item) => {
            const price = item.price || 0;
            const qty = item.quantity || 1;
            const itemTotal = price * qty;
            total += itemTotal;
            
            let icon = '📦';
            if (item.type === 'bernie') icon = '🌹';
            else if (item.type === 'giftcard') icon = '🎁';
            else if (item.type === 'custom') icon = '🛍️';
            
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px;">
                    <span>${icon} ${item.title || 'Item'}</span>
                    <span>${qty}× $${price.toFixed(2)} = $${itemTotal.toFixed(2)}</span>
                </div>
            `;
        });
        html += `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; font-weight: bold; border-top: 2px solid #ddd; margin-top: 4px;">
                <span>Total:</span>
                <span>$${total.toFixed(2)}</span>
            </div>
        `;
        container.innerHTML = html;
    }

    // ========== UPDATE CART COUNT ==========
    function updateCartCount() {
        const count = window.cart ? window.cart.getItemCount() : 0;
        const el = document.getElementById('custom-cart-count');
        if (el) el.textContent = count;
    }

    // ========== HELPERS ==========
    function showStatus(el, message, type = 'info') {
        if (!el) return;
        el.style.display = 'block';
        el.textContent = message;
        el.className = '';
        const colors = {
            success: '#d4edda; color: #155724; border: 1px solid #c3e6cb;',
            error: '#f8d7da; color: #721c24; border: 1px solid #f5c6cb;',
            warning: '#fff3cd; color: #856404; border: 1px solid #ffeeba;',
            info: '#cce5ff; color: #004085; border: 1px solid #b8daff;'
        };
        el.style.background = colors[type] || colors.info;
        el.style.border = '1px solid';
        el.style.padding = '12px';
        el.style.borderRadius = '8px';
        el.style.fontWeight = '500';
        clearTimeout(el._timeout);
        el._timeout = setTimeout(() => {
            el.style.display = 'none';
        }, 4000);
    }

    function showToast(message) {
        // Try the existing toast from cart.js
        if (typeof window.showToast === 'function') {
            window.showToast(message);
            return;
        }
        // Fallback: create a simple toast
        const existing = document.querySelector('.custom-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'custom-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            border-radius: 8px;
            background: #28a745;
            color: white;
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
        }, 4000);
    }

    // ========== LISTEN FOR CART UPDATES ==========
    document.addEventListener('cartUpdated', function() {
        updateCartPreview();
        updateCartCount();
    });

    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            updateCartPreview();
            updateCartCount();
        }
    });

    console.log('✅ Custom Checkout module initialized');
})();