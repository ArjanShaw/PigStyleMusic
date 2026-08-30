// ============================================================
// CUSTOM CHECKOUT - Admin checkout with integrated payments
// ADMIN ONLY - Restricted to admin/manager roles
// Integrates with the global cart singleton
// ============================================================

(function() {
    'use strict';

    console.log('🚀 Custom Checkout module loaded');

    // ===== API BASE URL =====
    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    // ===== TAX RATE =====
    const TAX_RATE = 0.07; // 7% sales tax

    // ===== CHECK ADMIN ACCESS =====
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

    // ===== CALCULATE TAX =====
    function calculateTax(subtotal) {
        return Math.round(subtotal * TAX_RATE * 100) / 100;
    }

    // ===== CHECKOUT STATE =====
    let checkoutItems = [];
    let checkoutTotal = 0;
    let checkoutRemaining = 0;
    let squareAvailable = false;
    let availableTerminals = [];
    let squareCheckoutId = null;
    let squarePollInterval = null;
    let currentUserId = null;
    let currentUserName = 'Admin';
    let recordSearchResults = [];
    let recordSearchTimeout = null;
    let currentTab = 'records';
    let recordSearchLoading = false;  // FIXED: Added missing variable

    // ===== GET USER =====
    function getUser() {
        try {
            const userData = localStorage.getItem('pigstyle_user');
            if (userData) {
                const user = JSON.parse(userData);
                currentUserId = user.id;
                currentUserName = user.full_name || user.username || 'Admin';
                return user;
            }
        } catch {}
        return null;
    }

    // ========== INIT ==========
    window.initCustomCheckout = function() {
        console.log('🔧 initCustomCheckout called');
        const container = document.getElementById('custom-checkout-container');
        
        if (!container) {
            console.error('❌ custom-checkout-container not found');
            return;
        }

        // Get user info
        getUser();

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
            // Check Square availability in background
            checkSquareAvailability();
        }, 100);
    };

    // ========== TEMPLATE ==========
    function customCheckoutTemplate() {
        const itemCount = window.cart ? window.cart.getItemCount() : 0;
        const total = window.cart ? window.cart.getTotal() : 0;
        
        return `
            <div style="display: flex; flex-direction: column; gap: 16px; padding: 20px; max-width: 1100px; margin: 0 auto; width: 100%;">
                <!-- Admin Badge -->
                <div style="background: #28a745; color: white; padding: 8px 16px; border-radius: 8px; text-align: center; font-size: 13px; font-weight: 600;">
                    <i class="fas fa-shield-alt"></i> Admin Mode - Custom Checkout
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <h2 style="color: #333; margin: 0;"><i class="fas fa-plus-circle" style="color: #17a2b8;"></i> Custom Checkout</h2>
                        <p style="color: #666; margin: 5px 0 0 0;">Add records or custom items, then checkout with all payment methods</p>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span style="color: #666; font-size: 13px;">👤 ${currentUserName}</span>
                    </div>
                </div>

                <!-- Status Message -->
                <div id="custom-checkout-status" style="display: none; padding: 12px; border-radius: 8px; font-weight: 500; text-align: center;"></div>

                <!-- Tabs -->
                <div style="display: flex; gap: 4px; border-bottom: 2px solid #ddd; padding-bottom: 0;">
                    <button onclick="switchTab('records')" id="tab-records" class="custom-tab" style="padding: 10px 24px; background: #6f42c1; color: white; border: none; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; font-size: 14px;">
                        <i class="fas fa-search"></i> Find Records
                    </button>
                    <button onclick="switchTab('custom')" id="tab-custom" class="custom-tab" style="padding: 10px 24px; background: #e9ecef; color: #333; border: none; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; font-size: 14px;">
                        <i class="fas fa-plus-circle"></i> Custom Items
                    </button>
                    <button onclick="switchTab('checkout')" id="tab-checkout" class="custom-tab" style="padding: 10px 24px; background: #e9ecef; color: #333; border: none; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; font-size: 14px;">
                        <i class="fas fa-shopping-cart"></i> Cart (<span id="tab-cart-count">${itemCount}</span>)
                        <span style="font-size: 12px; opacity: 0.8; margin-left: 4px;">$${total.toFixed(2)}</span>
                    </button>
                </div>

                <!-- Tab Content -->
                <div id="tab-content" style="min-height: 400px;">
                    <!-- Records Tab (default) -->
                    <div id="tab-records-content" style="display: block;">
                        ${recordsTabTemplate()}
                    </div>
                    <!-- Custom Tab -->
                    <div id="tab-custom-content" style="display: none;">
                        ${customTabTemplate()}
                    </div>
                    <!-- Checkout Tab -->
                    <div id="tab-checkout-content" style="display: none;">
                        ${checkoutTabTemplate()}
                    </div>
                </div>
            </div>

            <!-- Gift Card Modal (for creating gift cards) -->
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

    // ===== RECORDS TAB TEMPLATE =====
    function recordsTabTemplate() {
        return `
            <div style="background: white; border-radius: 12px; padding: 20px; border: 2px solid #6f42c1;">
                <h3 style="color: #6f42c1; margin: 0 0 15px 0;"><i class="fas fa-search"></i> Find Records</h3>
                <p style="color: #666; font-size: 13px; margin: 0 0 12px 0;">Search by barcode, ID, artist, or title</p>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="record-search-input" placeholder="Barcode, ID, artist, or title..." style="flex: 1; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    <button onclick="searchRecords()" id="record-search-btn" style="padding: 10px 20px; background: #6f42c1; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                        <i class="fas fa-search"></i>
                    </button>
                </div>
                <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
                    <button onclick="clearRecordSearch()" style="padding: 4px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Clear</button>
                    <span id="record-search-count" style="font-size: 12px; color: #666; align-self: center;"></span>
                </div>
                <div id="record-search-loading" style="display: none; text-align: center; padding: 20px; color: #666;">
                    <i class="fas fa-spinner fa-spin"></i> Searching...
                </div>
                <div id="record-search-results" style="max-height: 400px; overflow-y: auto; margin-top: 10px; border-top: 1px solid #eee; padding-top: 10px;">
                    <div style="color: #999; text-align: center; padding: 20px; font-size: 13px;">Enter a search term above</div>
                </div>
            </div>
        `;
    }

    // ===== CUSTOM TAB TEMPLATE =====
    function customTabTemplate() {
        return `
            <div style="display: flex; flex-direction: column; gap: 12px;">
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
            </div>
        `;
    }

    // ===== CHECKOUT TAB TEMPLATE =====
    function checkoutTabTemplate() {
        const items = window.cart ? window.cart.getItems() : [];
        const subtotal = window.cart ? window.cart.getTotal() : 0;
        const taxAmount = calculateTax(subtotal);
        const totalWithTax = subtotal + taxAmount;
        
        if (!items || items.length === 0) {
            return `
                <div style="background: #f8f9fa; border-radius: 12px; padding: 40px; text-align: center; border: 1px solid #e9ecef;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🛒</div>
                    <h3 style="color: #333; margin: 0 0 8px 0;">Cart is Empty</h3>
                    <p style="color: #666;">Add items from the Records or Custom tabs first.</p>
                </div>
            `;
        }

        let itemsHtml = '';
        items.forEach(item => {
            const price = item.price || 0;
            const qty = item.quantity || 1;
            const totalPrice = price * qty;
            let icon = '📦';
            if (item.type === 'bernie') icon = '🌹';
            else if (item.type === 'giftcard') icon = '🎁';
            else if (item.type === 'custom') icon = '🛍️';
            else if (item.type === 'record') icon = '🎵';
            
            const displayTitle = item.type === 'record' ? `${item.artist || ''} - ${item.title || ''}` : item.title || 'Item';
            
            itemsHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #eee; background: white;">
                    <div style="flex: 1; min-width: 0;">
                        <span style="font-weight: 500; color: #333; font-size: 14px;">${icon} ${displayTitle}</span>
                        ${item.type === 'record' ? `<span style="color: #888; font-size: 11px; margin-left: 8px;">ID: ${item.original_id || item.id}</span>` : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
                        <span style="color: #666; font-size: 13px;">${qty}× $${price.toFixed(2)}</span>
                        <span style="font-weight: bold; color: #333; font-size: 14px; min-width: 60px; text-align: right;">$${totalPrice.toFixed(2)}</span>
                        <button onclick="removeCartItem('${item.id}')" style="background: none; border: none; color: #dc3545; font-size: 18px; cursor: pointer; padding: 0 4px;">×</button>
                    </div>
                </div>
            `;
        });

        const taxDisplay = taxAmount > 0 ? taxAmount.toFixed(2) : '0.00';
        const totalDisplay = totalWithTax > 0 ? totalWithTax.toFixed(2) : '0.00';

        return `
            <div style="background: white; border-radius: 12px; border: 2px solid #28a745; overflow: hidden;">
                <div style="background: #28a745; color: white; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; font-size: 15px;"><i class="fas fa-shopping-cart"></i> Cart Summary</span>
                    <span style="font-weight: 600; font-size: 15px;">${items.length} items</span>
                </div>
                <div style="max-height: 250px; overflow-y: auto;">
                    ${itemsHtml}
                </div>
                <div style="padding: 16px 20px; border-top: 2px solid #eee; background: #f8f9fa;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
                        <span style="color: #666;">Subtotal:</span>
                        <span style="font-weight: 500; color: #333;">$${subtotal.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #e9ecef; padding-bottom: 8px; margin-bottom: 8px;">
                        <span style="color: #666;">Tax (7%):</span>
                        <span style="font-weight: 500; color: #333;">$${taxDisplay}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <span style="font-weight: 600; color: #333; font-size: 16px;">Total:</span>
                        <span style="font-weight: bold; color: #28a745; font-size: 20px;">$${totalDisplay}</span>
                    </div>
                    
                    <!-- Payment Method Selection -->
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 6px;">Payment Method</label>
                        <select id="payment-method-select" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; background: white;">
                            <option value="cash">Cash</option>
                            <option value="card">Card (Square)</option>
                            <option value="pos">POS Terminal</option>
                            <option value="giftcard">Gift Card</option>
                            <option value="store_credit">Store Credit</option>
                        </select>
                    </div>

                    <!-- Payment Amount Input -->
                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                        <input type="number" id="payment-amount" placeholder="0.00" step="0.01" min="0.01" 
                               style="flex: 1; padding: 10px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px; box-sizing: border-box;">
                        <button onclick="setFullPaymentAmount()" style="padding: 10px 16px; background: #17a2b8; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                            Full Amount
                        </button>
                    </div>

                    <!-- Payment Execute Button -->
                    <button onclick="executePayment()" id="payment-execute-btn" 
                            style="width: 100%; padding: 14px; background: #28a745; color: white; border: none; border-radius: 30px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
                        <i class="fas fa-credit-card"></i> Pay Now
                    </button>

                    <!-- Error Display -->
                    <div id="payment-error" style="display: none; margin-top: 10px; padding: 12px; background: #f8d7da; color: #721c24; border: 2px solid #f5c6cb; border-radius: 8px; font-weight: 500;">
                        <i class="fas fa-exclamation-circle"></i> <span id="payment-error-text"></span>
                    </div>

                    <!-- Status Display -->
                    <div id="payment-status" style="display: none; margin-top: 10px; padding: 12px; border-radius: 8px; font-weight: 500;">
                        <i class="fas fa-spinner fa-spin"></i> <span id="payment-status-text">Processing...</span>
                    </div>

                    <!-- Clear Cart Button -->
                    <div style="margin-top: 10px;">
                        <button onclick="clearCart()" style="width: 100%; padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            <i class="fas fa-trash"></i> Clear Cart
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // ===== SWITCH TAB =====
    window.switchTab = function(tab) {
        currentTab = tab;
        
        // Update tab buttons
        document.querySelectorAll('.custom-tab').forEach(btn => {
            btn.style.background = '#e9ecef';
            btn.style.color = '#333';
        });
        
        const activeTab = document.getElementById('tab-' + tab);
        if (activeTab) {
            activeTab.style.background = '#6f42c1';
            activeTab.style.color = 'white';
        }
        
        // Update content
        document.querySelectorAll('#tab-content > div').forEach(div => {
            div.style.display = 'none';
        });
        
        const content = document.getElementById('tab-' + tab + '-content');
        if (content) {
            content.style.display = 'block';
        }
        
        // If switching to checkout, refresh the cart display
        if (tab === 'checkout') {
            renderCheckoutTab();
        }
        
        // If switching to records, focus search
        if (tab === 'records') {
            setTimeout(() => {
                document.getElementById('record-search-input')?.focus();
            }, 100);
        }
    };

    // ===== RENDER CHECKOUT TAB =====
    function renderCheckoutTab() {
        const container = document.getElementById('tab-checkout-content');
        if (!container) return;
        container.innerHTML = checkoutTabTemplate();
        updateTabCartCount();
        
        // Set default payment amount to full total
        setFullPaymentAmount();
    }

    // ===== UPDATE TAB CART COUNT =====
    function updateTabCartCount() {
        const count = window.cart ? window.cart.getItemCount() : 0;
        const el = document.getElementById('tab-cart-count');
        if (el) el.textContent = count;
    }

    // ========== INIT EVENTS ==========
    function initCustomCheckoutEvents() {
        console.log('🔧 initCustomCheckoutEvents called');
        
        // Set default tab
        switchTab('records');

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

        // Enter key support for record search
        document.getElementById('record-search-input')?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchRecords();
            }
        });

        // Real-time search with debounce (500ms)
        document.getElementById('record-search-input')?.addEventListener('input', function(e) {
            clearTimeout(recordSearchTimeout);
            const query = e.target.value.trim();
            if (query.length >= 2) {
                recordSearchTimeout = setTimeout(function() {
                    searchRecords();
                }, 500);
            } else if (query.length === 0) {
                clearRecordSearch();
            }
        });

        // Listen for cart updates
        document.addEventListener('cartUpdated', function() {
            updateCartPreview();
            updateCartCount();
            updateTabCartCount();
            // If on checkout tab, refresh it
            if (currentTab === 'checkout') {
                renderCheckoutTab();
            }
        });
    }

    // ========== RECORD SEARCH ==========
    window.searchRecords = async function() {
        const input = document.getElementById('record-search-input');
        const query = input?.value?.trim();
        
        if (!query) {
            clearRecordSearch();
            return;
        }

        const resultsContainer = document.getElementById('record-search-results');
        const loadingEl = document.getElementById('record-search-loading');
        const countEl = document.getElementById('record-search-count');
        
        if (!resultsContainer) return;

        // Show loading
        recordSearchLoading = true;
        if (loadingEl) loadingEl.style.display = 'block';
        resultsContainer.innerHTML = '';
        if (countEl) countEl.textContent = '';

        try {
            const response = await fetch(`${API_BASE}/records/search?q=${encodeURIComponent(query)}`, {
                credentials: 'include',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            if (data.status === 'success') {
                recordSearchResults = data.records || [];
                renderSearchResults(recordSearchResults);
                if (countEl) countEl.textContent = `${recordSearchResults.length} found`;
                
                // AUTO-ADD: If only 1 result, add it directly to cart
                if (recordSearchResults.length === 1) {
                    console.log('🎯 Single result found - auto-adding to cart');
                    const record = recordSearchResults[0];
                    const price = parseFloat(record.store_price) || 0;
                    if (price > 0) {
                        const isDuplicate = checkDuplicateInCart(record);
                        if (isDuplicate) {
                            showToast(`⚠️ "${record.artist} - ${record.title}" is already in the cart.`, 'warning');
                        } else {
                            addRecordToCart(record.id);
                            setTimeout(() => {
                                clearRecordSearch();
                            }, 500);
                        }
                    } else {
                        showToast('⚠️ This record has no price set.', 'warning');
                    }
                }
            } else {
                resultsContainer.innerHTML = `<div style="color: #dc3545; text-align: center; padding: 10px; font-size: 13px;">Error: ${data.error || 'Search failed'}</div>`;
            }
        } catch (err) {
            console.error('Search error:', err);
            resultsContainer.innerHTML = `<div style="color: #dc3545; text-align: center; padding: 10px; font-size: 13px;">Error: ${err.message}</div>`;
        } finally {
            recordSearchLoading = false;
            if (loadingEl) loadingEl.style.display = 'none';
        }
    };

    // ===== CHECK DUPLICATE IN CART =====
    function checkDuplicateInCart(record) {
        const items = window.cart ? window.cart.getItems() : [];
        return items.some(item => {
            if (item.type === 'record') {
                if (item.original_id === record.id) return true;
                if (item.barcode && record.barcode && item.barcode === record.barcode) return true;
                if (item.artist === record.artist && item.title === record.title) return true;
            }
            return false;
        });
    }

    // ========== RENDER SEARCH RESULTS ==========
    function renderSearchResults(records) {
        const container = document.getElementById('record-search-results');
        if (!container) return;

        if (!records || records.length === 0) {
            container.innerHTML = `<div style="color: #999; text-align: center; padding: 20px; font-size: 13px;">No records found</div>`;
            return;
        }

        let html = '';
        records.forEach((record, index) => {
            const price = record.store_price ? '$' + parseFloat(record.store_price).toFixed(2) : '—';
            const condition = record.sleeve_condition_name || record.condition || 'Unknown';
            const status = record.status_name || 'Unknown';
            const inCart = checkDuplicateInCart(record);
            
            html += `
                <div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid #eee; ${index % 2 === 0 ? 'background: #fafafa;' : ''}"
                     onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='${index % 2 === 0 ? '#fafafa' : 'transparent'}'">
                    
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: #333; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${record.artist || 'Unknown'} - ${record.title || 'Unknown'}
                            ${inCart ? `<span style="color: #ff6b6b; font-size: 11px; margin-left: 6px;">(in cart)</span>` : ''}
                        </div>
                        <div style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px; color: #666; margin-top: 2px;">
                            <span><strong>ID:</strong> ${record.id}</span>
                            ${record.barcode ? `<span><strong>Barcode:</strong> ${record.barcode}</span>` : ''}
                            ${record.catalog_number ? `<span><strong>Catalog:</strong> ${record.catalog_number}</span>` : ''}
                            <span><strong>Condition:</strong> ${condition}</span>
                            <span><strong>Status:</strong> ${status}</span>
                            ${record.location_name ? `<span><strong>Location:</strong> ${record.location_name}</span>` : ''}
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                        <span style="font-weight: bold; color: #28a745; font-size: 14px;">${price}</span>
                        ${inCart ? `
                            <span style="color: #ff6b6b; font-size: 12px; font-weight: 600;">Already in cart</span>
                        ` : `
                            <button onclick="addRecordToCart(${record.id})" 
                                    style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap;">
                                <i class="fas fa-cart-plus"></i> Add
                            </button>
                            <button onclick="addRecordToCart(${record.id}, 2)" 
                                    style="padding: 4px 8px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; white-space: nowrap;">
                                +2
                            </button>
                            <button onclick="addRecordToCart(${record.id}, 5)" 
                                    style="padding: 4px 8px; background: #6f42c1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; white-space: nowrap;">
                                +5
                            </button>
                        `}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // ========== CLEAR RECORD SEARCH ==========
    window.clearRecordSearch = function() {
        const input = document.getElementById('record-search-input');
        if (input) input.value = '';
        
        const container = document.getElementById('record-search-results');
        if (container) {
            container.innerHTML = `<div style="color: #999; text-align: center; padding: 20px; font-size: 13px;">Enter a search term above</div>`;
        }
        
        const countEl = document.getElementById('record-search-count');
        if (countEl) countEl.textContent = '';
        
        recordSearchResults = [];
    };

    // ========== ADD RECORD TO CART ==========
    window.addRecordToCart = function(recordId, quantity = 1) {
        if (!isAdmin()) {
            showToast('🔒 Admin access required.', 'error');
            return;
        }

        const record = recordSearchResults.find(r => r.id === recordId);
        if (!record) {
            showToast('⚠️ Record not found in search results.', 'warning');
            return;
        }

        if (typeof window.cart === 'undefined' || !window.cart.addItem) {
            showToast('❌ Cart system not available.', 'error');
            return;
        }

        const price = parseFloat(record.store_price) || 0;
        if (price <= 0) {
            showToast('⚠️ This record has no price set.', 'warning');
            return;
        }

        if (checkDuplicateInCart(record)) {
            showToast(`⚠️ "${record.artist} - ${record.title}" is already in the cart.`, 'warning');
            return;
        }

        for (let i = 0; i < quantity; i++) {
            const item = {
                id: record.id + '_' + Date.now() + '_' + i,
                type: 'record',
                title: record.title || 'Unknown Title',
                artist: record.artist || 'Unknown Artist',
                price: price,
                quantity: 1,
                condition: record.sleeve_condition_name || record.condition || 'Unknown',
                barcode: record.barcode || '',
                catalog_number: record.catalog_number || '',
                original_id: record.id
            };
            
            window.cart.addItem(item);
        }

        const total = price * quantity;
        showToast(`✅ Added ${quantity}x "${record.artist} - ${record.title}" to cart ($${total.toFixed(2)})`, 'success');
        
        updateCartPreview();
        updateCartCount();
        updateTabCartCount();
        
        if (currentTab === 'checkout') {
            renderCheckoutTab();
        }
        
        if (typeof window.updateCartBadge === 'function') {
            window.updateCartBadge();
        }
    };

    // ========== ADD CUSTOM ITEM ==========
    window.addCustomItem = function() {
        if (!isAdmin()) {
            const statusEl = document.getElementById('custom-checkout-status');
            showStatus(statusEl, '🔒 Admin access required to add custom items.', 'error');
            return;
        }

        const nameInput = document.getElementById('custom-item-name');
        const priceInput = document.getElementById('custom-item-price');
        const qtyInput = document.getElementById('custom-item-qty');
        const statusEl = document.getElementById('custom-checkout-status');

        const name = nameInput?.value?.trim();
        const price = parseFloat(priceInput?.value);
        const qty = parseInt(qtyInput?.value) || 1;

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

        if (typeof window.cart === 'undefined' || !window.cart.addItem) {
            showStatus(statusEl, '❌ Cart system not available.', 'error');
            return;
        }

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
        
        if (nameInput) nameInput.value = '';
        if (priceInput) priceInput.value = '';
        if (qtyInput) qtyInput.value = '1';
        nameInput?.focus();

        updateCartPreview();
        updateCartCount();
        updateTabCartCount();
        
        if (currentTab === 'checkout') {
            renderCheckoutTab();
        }
        
        if (typeof window.updateCartBadge === 'function') {
            window.updateCartBadge();
        }
    };

    // ========== ADD BERNIE ITEM ==========
    window.addBernieItem = function() {
        if (!isAdmin()) {
            showToast('🔒 Admin access required to add Bernie donations.');
            return;
        }

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
        updateTabCartCount();
        
        if (currentTab === 'checkout') {
            renderCheckoutTab();
        }
        
        if (typeof window.updateCartBadge === 'function') {
            window.updateCartBadge();
        }
        
        showToast('🌹 Added Bernie donation ($0.99) to cart!');
    };

    // ========== GIFT CARD (for adding to cart) ==========
    window.showGiftCardModal = function() {
        if (!isAdmin()) {
            showToast('🔒 Admin access required to add gift cards.');
            return;
        }
        document.getElementById('giftcard-modal').style.display = 'flex';
        document.getElementById('giftcard-modal-amount').focus();
    };

    window.closeGiftCardModal = function() {
        document.getElementById('giftcard-modal').style.display = 'none';
    };

    window.addGiftCardItem = function() {
        if (!isAdmin()) {
            showToast('🔒 Admin access required to add gift cards.');
            closeGiftCardModal();
            return;
        }

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
        updateTabCartCount();
        
        if (currentTab === 'checkout') {
            renderCheckoutTab();
        }
        
        if (typeof window.updateCartBadge === 'function') {
            window.updateCartBadge();
        }
        
        showToast(`🎁 Added gift card ($${amount.toFixed(2)}) to cart!`);
        closeGiftCardModal();
        
        if (amountInput) amountInput.value = '';
        if (recipientInput) recipientInput.value = '';
    };

    // ========== REMOVE CART ITEM ==========
    window.removeCartItem = function(itemId) {
        if (typeof window.cart !== 'undefined') {
            window.cart.removeItem(itemId);
            updateCartPreview();
            updateCartCount();
            updateTabCartCount();
            if (currentTab === 'checkout') {
                renderCheckoutTab();
            }
        }
    };

    // ========== CLEAR CART ==========
    window.clearCart = function() {
        if (confirm('Are you sure you want to clear your cart?')) {
            if (typeof window.cart !== 'undefined') {
                window.cart.clear();
                updateCartPreview();
                updateCartCount();
                updateTabCartCount();
                if (currentTab === 'checkout') {
                    renderCheckoutTab();
                }
            }
        }
    };

    // ========== UPDATE CART PREVIEW ==========
    function updateCartPreview() {
        const items = window.cart ? window.cart.getItems() : [];
        const container = document.getElementById('custom-cart-preview');
        const countEl = document.getElementById('custom-cart-preview-count');
        const totalEl = document.getElementById('custom-cart-preview-total');
        
        if (countEl) countEl.textContent = items.length + ' items';
        if (totalEl) totalEl.textContent = '$' + (window.cart ? window.cart.getTotal().toFixed(2) : '0.00');

        if (!container) return;

        if (!items || items.length === 0) {
            container.innerHTML = `<div style="color: #999; text-align: center; padding: 20px; font-size: 14px;">No items in cart yet</div>`;
            return;
        }

        let html = '';
        items.forEach((item) => {
            const price = item.price || 0;
            const qty = item.quantity || 1;
            const itemTotal = price * qty;
            
            let icon = '📦';
            if (item.type === 'bernie') icon = '🌹';
            else if (item.type === 'giftcard') icon = '🎁';
            else if (item.type === 'custom') icon = '🛍️';
            else if (item.type === 'record') icon = '🎵';
            
            const displayTitle = item.type === 'record' ? `${item.artist || ''} - ${item.title || ''}` : item.title || 'Item';
            
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px; color: #333;">
                    <span>${icon} ${displayTitle}</span>
                    <span>${qty}× $${price.toFixed(2)} = $${itemTotal.toFixed(2)}</span>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    // ========== UPDATE CART COUNT ==========
    function updateCartCount() {
        const count = window.cart ? window.cart.getItemCount() : 0;
        const el = document.getElementById('custom-cart-count');
        if (el) el.textContent = count;
        updateTabCartCount();
    }

    // ========== SET FULL PAYMENT AMOUNT ==========
    window.setFullPaymentAmount = function() {
        const items = window.cart ? window.cart.getItems() : [];
        if (!items || items.length === 0) return;
        
        const subtotal = window.cart.getTotal();
        const taxAmount = calculateTax(subtotal);
        const totalWithTax = subtotal + taxAmount;
        
        const input = document.getElementById('payment-amount');
        if (input) {
            input.value = totalWithTax.toFixed(2);
        }
    };

    // ========== CHECK SQUARE AVAILABILITY ==========
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
            console.log('📟 Terminals response:', data);
            
            if (data.status === 'success' && data.terminals && data.terminals.length > 0) {
                squareAvailable = true;
                availableTerminals = data.terminals;
                console.log(`✅ ${availableTerminals.length} Square terminals available`);
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

    // ========== EXECUTE PAYMENT ==========
    window.executePayment = async function() {
        const errorEl = document.getElementById('payment-error');
        const errorText = document.getElementById('payment-error-text');
        const statusEl = document.getElementById('payment-status');
        const statusText = document.getElementById('payment-status-text');
        const btn = document.getElementById('payment-execute-btn');
        
        // Hide previous errors
        if (errorEl) errorEl.style.display = 'none';
        if (statusEl) statusEl.style.display = 'none';
        
        // Get payment details
        const methodSelect = document.getElementById('payment-method-select');
        const amountInput = document.getElementById('payment-amount');
        
        const method = methodSelect?.value || 'cash';
        const amount = parseFloat(amountInput?.value);
        
        // Validate
        if (!amount || amount <= 0) {
            showPaymentError('Please enter a valid payment amount.');
            return;
        }
        
        // Get cart totals
        const items = window.cart ? window.cart.getItems() : [];
        if (!items || items.length === 0) {
            showPaymentError('Cart is empty. Add items before checking out.');
            return;
        }
        
        const subtotal = window.cart.getTotal();
        const taxAmount = calculateTax(subtotal);
        const totalWithTax = subtotal + taxAmount;
        
        // Check if amount matches total (allow small tolerance)
        if (Math.abs(amount - totalWithTax) > 0.01) {
            showPaymentError(`Amount ($${amount.toFixed(2)}) does not match total ($${totalWithTax.toFixed(2)}). Please enter the correct amount.`);
            return;
        }
        
        // Show processing status
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = '#cce5ff';
            statusEl.style.color = '#004085';
            statusEl.style.border = '1px solid #b8daff';
            if (statusText) statusText.textContent = 'Processing payment...';
        }
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Processing...';
            btn.style.opacity = '0.6';
        }
        
        try {
            // Route to the appropriate payment handler
            let success = false;
            
            switch (method) {
                case 'cash':
                    success = await processCashPayment(amount, items, totalWithTax);
                    break;
                case 'card':
                    success = await processCardPayment(amount, items, totalWithTax);
                    break;
                case 'pos':
                    success = await processPosPayment(amount, items, totalWithTax);
                    break;
                case 'giftcard':
                    success = await processGiftCardPayment(amount, items, totalWithTax);
                    break;
                case 'store_credit':
                    success = await processStoreCreditPayment(amount, items, totalWithTax);
                    break;
                default:
                    showPaymentError('Unknown payment method.');
                    return;
            }
            
            if (success) {
                // Clear cart and update UI
                window.cart.clear();
                updateCartPreview();
                updateCartCount();
                updateTabCartCount();
                renderCheckoutTab();
                
                if (statusEl) {
                    statusEl.style.background = '#d4edda';
                    statusEl.style.color = '#155724';
                    statusEl.style.border = '1px solid #c3e6cb';
                    if (statusText) statusText.textContent = '✅ Payment successful! Order complete.';
                }
                
                showToast('🎉 Payment successful! Order complete.', 'success');
            }
            
        } catch (err) {
            console.error('Payment error:', err);
            showPaymentError(err.message || 'Payment failed. Please try again.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '<i class="fas fa-credit-card"></i> Pay Now';
                btn.style.opacity = '1';
            }
        }
    };

    // ===== SHOW PAYMENT ERROR =====
    function showPaymentError(message) {
        const errorEl = document.getElementById('payment-error');
        const errorText = document.getElementById('payment-error-text');
        const statusEl = document.getElementById('payment-status');
        
        if (statusEl) statusEl.style.display = 'none';
        
        if (errorEl && errorText) {
            errorText.textContent = message;
            errorEl.style.display = 'block';
        }
    }

    // ===== PROCESS CASH PAYMENT =====
    async function processCashPayment(amount, items, total) {
        console.log('💰 Processing cash payment:', amount);
        
        // For cash, we just record the order
        const recordIds = items
            .filter(item => item.type === 'record' && item.original_id)
            .map(item => item.original_id);
        
        const orderData = {
            items: window.cart.getCheckoutPayload(),
            subtotal: window.cart.getTotal(),
            tax: calculateTax(window.cart.getTotal()),
            total: total,
            shipping: { method: 'pickup', amount: 0 },
            customer_name: currentUserName + ' (Admin - Cash)',
            customer_email: '',
            notes: `Admin checkout - ${currentUserName} - Cash payment`,
            payment_entries: [{ method: 'Cash', amount: amount }],
            source: 'admin_checkout_cash',
            record_ids: recordIds
        };
        
        return await submitOrder(orderData);
    }

    // ===== PROCESS CARD PAYMENT (Square) =====
    async function processCardPayment(amount, items, total) {
        console.log('💳 Processing card payment:', amount);
        
        // Check Square availability
        const available = await checkSquareAvailability();
        if (!available) {
            throw new Error('Square payment is not available. Please use another payment method.');
        }
        
        const recordIds = items
            .filter(item => item.type === 'record' && item.original_id)
            .map(item => item.original_id);
        
        // Create Square payment link
        const payload = {
            amount: amount,
            purpose: 'checkout',
            item_name: `PigStyle Music Order - ${currentUserName}`,
            metadata: {
                order_id: 'order_' + Date.now(),
                admin: currentUserName,
                items: JSON.stringify(items.map(i => ({ title: i.title, price: i.price })))
            },
            redirect_path: '/?status=completed'
        };
        
        try {
            const response = await fetch(`${API_BASE}/api/square/create-payment-link`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success' && data.checkout_url) {
                // Open Square checkout in new window
                window.open(data.checkout_url, '_blank');
                showToast('💳 Square checkout opened in new window. Complete payment there.', 'info');
                return true;
            } else {
                throw new Error(data.error || 'Failed to create Square payment link');
            }
        } catch (err) {
            console.error('Square payment error:', err);
            throw new Error(`Square payment failed: ${err.message}`);
        }
    }

    // ===== PROCESS POS PAYMENT =====
    async function processPosPayment(amount, items, total) {
        console.log('📟 Processing POS payment:', amount);
        
        // Check Square availability
        const available = await checkSquareAvailability();
        if (!available) {
            throw new Error('No Square POS terminals available. Please check Square terminal connectivity.');
        }
        
        if (!availableTerminals || availableTerminals.length === 0) {
            throw new Error('No POS terminals found. Please check Square terminal connectivity.');
        }
        
        // Use the first available terminal
        let deviceId = availableTerminals[0]?.id;
        if (!deviceId) {
            throw new Error('No POS terminal ID found.');
        }
        
        console.log('📟 Using device ID:', deviceId);
        
        const recordIds = items
            .filter(item => item.type === 'record' && item.original_id)
            .map(item => item.original_id);
        
        const titles = items.map(item => item.title || 'Item');
        
        const payload = {
            amount_cents: Math.round(amount * 100),
            record_ids: recordIds.length > 0 ? recordIds : ['1'],
            record_titles: titles.length > 0 ? titles : ['Item'],
            reference_id: 'pos_' + Date.now(),
            device_id: deviceId
        };
        
        console.log('📟 Sending POS payload:', payload);
        
        try {
            const response = await fetch(`${API_BASE}/api/square/terminal/checkout`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.status === 401 || response.status === 403) {
                throw new Error('Authentication failed. Please log in as admin and try again.');
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success' && data.checkout) {
                const checkoutId = data.checkout.id;
                showToast('📟 Payment request sent to POS terminal. Complete payment on the device.', 'info');
                
                // Wait for POS completion
                const result = await waitForPosCompletion(checkoutId);
                if (result) {
                    // Order completed on POS, now submit the order
                    const orderData = {
                        items: window.cart.getCheckoutPayload(),
                        subtotal: window.cart.getTotal(),
                        tax: calculateTax(window.cart.getTotal()),
                        total: total,
                        shipping: { method: 'pickup', amount: 0 },
                        customer_name: currentUserName + ' (Admin - POS)',
                        customer_email: '',
                        notes: `Admin checkout - ${currentUserName} - POS payment (terminal: ${deviceId})`,
                        payment_entries: [{ method: 'POS Terminal', amount: amount }],
                        source: 'admin_checkout_pos',
                        record_ids: recordIds
                    };
                    return await submitOrder(orderData);
                } else {
                    throw new Error('POS payment was not completed.');
                }
            } else {
                throw new Error(data.message || data.error || 'Failed to create POS checkout');
            }
        } catch (err) {
            console.error('POS payment error:', err);
            throw new Error(`POS payment failed: ${err.message}`);
        }
    }

    // ===== WAIT FOR POS COMPLETION =====
    function waitForPosCompletion(checkoutId, timeout = 120000) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = timeout / 2000;
            let lastStatus = '';
            
            const interval = setInterval(async () => {
                attempts++;
                
                try {
                    const response = await fetch(`${API_BASE}/api/square/terminal/checkout/${checkoutId}/status`, {
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    
                    if (!response.ok) {
                        console.warn('POS status check failed:', response.status);
                        return;
                    }
                    
                    const data = await response.json();
                    
                    if (data.status !== 'success' || !data.checkout) {
                        return;
                    }
                    
                    const status = data.checkout.status;
                    
                    // Only log status changes
                    if (status !== lastStatus) {
                        console.log(`📟 POS status: ${status} (attempt ${attempts}/${maxAttempts})`);
                        lastStatus = status;
                    }
                    
                    if (status === 'COMPLETED') {
                        clearInterval(interval);
                        resolve(true);
                    } else if (status === 'CANCELED') {
                        clearInterval(interval);
                        reject(new Error('POS payment was canceled on the terminal.'));
                    } else if (status === 'FAILED') {
                        clearInterval(interval);
                        reject(new Error('POS payment failed on the terminal.'));
                    }
                    
                    if (attempts >= maxAttempts) {
                        clearInterval(interval);
                        reject(new Error('POS payment timed out. Please check the terminal.'));
                    }
                } catch (err) {
                    console.warn('POS polling error:', err.message);
                    // Don't reject immediately - network errors might be temporary
                    if (attempts > 5) {
                        console.error('POS polling failed repeatedly:', err);
                    }
                }
            }, 2000);
        });
    }

    // ===== PROCESS GIFT CARD PAYMENT =====
    async function processGiftCardPayment(amount, items, total) {
        console.log('🎁 Processing gift card payment:', amount);
        
        // Prompt for gift card code
        const code = prompt('Enter gift card code:');
        if (!code || code.trim() === '') {
            throw new Error('Gift card code is required.');
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/gift-card/balance/${encodeURIComponent(code.trim().toUpperCase())}`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error('Gift card not found or invalid.');
            }
            
            const data = await response.json();
            
            if (data.status !== 'success') {
                throw new Error(data.error || 'Invalid gift card.');
            }
            
            const balance = data.balance || 0;
            
            if (balance < amount) {
                throw new Error(`Insufficient balance on gift card. Available: $${balance.toFixed(2)}`);
            }
            
            // Redeem the gift card
            const redeemResponse = await fetch(`${API_BASE}/api/gift-card/redeem`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code.trim().toUpperCase(),
                    purchase_amount: amount,
                    order_id: 'order_' + Date.now()
                })
            });
            
            if (!redeemResponse.ok) {
                const errData = await redeemResponse.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to redeem gift card.');
            }
            
            const redeemData = await redeemResponse.json();
            
            if (redeemData.status === 'success') {
                const recordIds = items
                    .filter(item => item.type === 'record' && item.original_id)
                    .map(item => item.original_id);
                
                const orderData = {
                    items: window.cart.getCheckoutPayload(),
                    subtotal: window.cart.getTotal(),
                    tax: calculateTax(window.cart.getTotal()),
                    total: total,
                    shipping: { method: 'pickup', amount: 0 },
                    customer_name: currentUserName + ' (Admin - Gift Card)',
                    customer_email: '',
                    notes: `Admin checkout - ${currentUserName} - Gift Card payment (${code})`,
                    payment_entries: [{ method: 'Gift Card', amount: amount }],
                    source: 'admin_checkout_giftcard',
                    record_ids: recordIds
                };
                return await submitOrder(orderData);
            } else {
                throw new Error(redeemData.error || 'Gift card redemption failed.');
            }
        } catch (err) {
            console.error('Gift card payment error:', err);
            throw new Error(`Gift card payment failed: ${err.message}`);
        }
    }

    // ===== PROCESS STORE CREDIT PAYMENT =====
    async function processStoreCreditPayment(amount, items, total) {
        console.log('🏦 Processing store credit payment:', amount);
        
        // Prompt for debtor name
        const debtorName = prompt('Enter debtor name:');
        if (!debtorName || debtorName.trim() === '') {
            throw new Error('Debtor name is required.');
        }
        
        try {
            // Look up debtor
            const lookupResponse = await fetch(`${API_BASE}/api/debtor/lookup`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: debtorName.trim().toUpperCase() })
            });
            
            if (!lookupResponse.ok) {
                const errData = await lookupResponse.json().catch(() => ({}));
                throw new Error(errData.error || 'Debtor not found.');
            }
            
            const lookupData = await lookupResponse.json();
            
            if (lookupData.status !== 'success') {
                throw new Error(lookupData.error || 'Debtor lookup failed.');
            }
            
            const balance = lookupData.balance || 0;
            
            if (balance < amount) {
                throw new Error(`Insufficient store credit. Available: $${balance.toFixed(2)}`);
            }
            
            // Redeem store credit
            const redeemResponse = await fetch(`${API_BASE}/api/debtor/redeem`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: debtorName.trim().toUpperCase(),
                    amount: amount,
                    description: `Purchase by ${currentUserName}`
                })
            });
            
            if (!redeemResponse.ok) {
                const errData = await redeemResponse.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to redeem store credit.');
            }
            
            const redeemData = await redeemResponse.json();
            
            if (redeemData.status === 'success') {
                const recordIds = items
                    .filter(item => item.type === 'record' && item.original_id)
                    .map(item => item.original_id);
                
                const orderData = {
                    items: window.cart.getCheckoutPayload(),
                    subtotal: window.cart.getTotal(),
                    tax: calculateTax(window.cart.getTotal()),
                    total: total,
                    shipping: { method: 'pickup', amount: 0 },
                    customer_name: currentUserName + ' (Admin - Store Credit)',
                    customer_email: '',
                    notes: `Admin checkout - ${currentUserName} - Store Credit payment (${debtorName})`,
                    payment_entries: [{ method: 'Store Credit', amount: amount }],
                    source: 'admin_checkout_store_credit',
                    record_ids: recordIds
                };
                return await submitOrder(orderData);
            } else {
                throw new Error(redeemData.error || 'Store credit redemption failed.');
            }
        } catch (err) {
            console.error('Store credit payment error:', err);
            throw new Error(`Store credit payment failed: ${err.message}`);
        }
    }

    // ===== SUBMIT ORDER =====
    async function submitOrder(orderData) {
        try {
            console.log('📦 Submitting order:', orderData);
            
            const response = await fetch(`${API_BASE}/api/checkout/process`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                // Mark records as sold
                if (orderData.record_ids && orderData.record_ids.length > 0) {
                    try {
                        await fetch(`${API_BASE}/api/order/complete`, {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                order_id: data.order_id,
                                transaction_id: 'admin_checkout_' + Date.now()
                            })
                        });
                    } catch (err) {
                        console.warn('Could not mark records as sold:', err);
                    }
                }
                return true;
            } else {
                throw new Error(data.error || 'Order submission failed.');
            }
        } catch (err) {
            console.error('Order submission error:', err);
            throw new Error(`Order submission failed: ${err.message}`);
        }
    }

    // ========== HELPERS ==========
    function showStatus(el, message, type = 'info') {
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
        el.style.padding = '12px';
        el.style.borderRadius = '8px';
        el.style.fontWeight = '500';
        clearTimeout(el._timeout);
        el._timeout = setTimeout(() => {
            el.style.display = 'none';
        }, 4000);
    }

    function showToast(message, type = 'success') {
        const existing = document.querySelector('.custom-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'custom-toast';
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
        }, 4000);
    }

    // ========== LISTEN FOR CART UPDATES ==========
    document.addEventListener('cartUpdated', function() {
        updateCartPreview();
        updateCartCount();
        updateTabCartCount();
        if (currentTab === 'checkout') {
            renderCheckoutTab();
        }
    });

    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            updateCartPreview();
            updateCartCount();
            updateTabCartCount();
            if (currentTab === 'checkout') {
                renderCheckoutTab();
            }
        }
    });

    console.log('✅ Custom Checkout module initialized');
})();