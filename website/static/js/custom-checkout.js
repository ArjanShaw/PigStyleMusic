// ============================================================
// CUSTOM CHECKOUT - Admin checkout with full payment system
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
    let checkoutPaymentEntries = [];
    let checkoutDebtorData = null;
    let squareAvailable = false;
    let availableTerminals = [];
    let squareCheckoutId = null;
    let squarePollInterval = null;
    let currentUserId = null;
    let currentUserName = 'Admin';
    let recordSearchResults = [];
    let recordSearchTimeout = null;
    let recordSearchLoading = false;
    let currentTab = 'records';

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
                        <button onclick="switchTab('checkout')" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-credit-card"></i> Checkout (${itemCount})
                            <span style="font-size: 12px; opacity: 0.8;">$${total.toFixed(2)}</span>
                        </button>
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

            <!-- Checkout Modal (injected dynamically) -->
            <div id="admin-checkout-modal-container"></div>
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
                <div style="max-height: 300px; overflow-y: auto;">
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
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; color: #333; font-size: 16px;">Total:</span>
                        <span style="font-weight: bold; color: #28a745; font-size: 20px;">$${totalDisplay}</span>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <button onclick="clearCart()" style="flex: 1; padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            <i class="fas fa-trash"></i> Clear
                        </button>
                        <button onclick="openAdminCheckout()" style="flex: 2; padding: 10px 24px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 15px;">
                            <i class="fas fa-credit-card"></i> Checkout Now
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
            
            html += `
                <div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid #eee; ${index % 2 === 0 ? 'background: #fafafa;' : ''}"
                     onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='${index % 2 === 0 ? '#fafafa' : 'transparent'}'">
                    
                    <!-- Record Info -->
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: #333; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${record.artist || 'Unknown'} - ${record.title || 'Unknown'}
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
                    
                    <!-- Price & Add Button -->
                    <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                        <span style="font-weight: bold; color: #28a745; font-size: 14px;">${price}</span>
                        <button onclick="addRecordToCart(${record.id})" 
                                style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap;"
                                onmouseover="this.style.background='#218838'" onmouseout="this.style.background='#28a745'">
                            <i class="fas fa-cart-plus"></i> Add
                        </button>
                        <button onclick="addRecordToCart(${record.id}, 2)" 
                                style="padding: 4px 8px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; white-space: nowrap;"
                                onmouseover="this.style.background='#138496'" onmouseout="this.style.background='#17a2b8'">
                            +2
                        </button>
                        <button onclick="addRecordToCart(${record.id}, 5)" 
                                style="padding: 4px 8px; background: #6f42c1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; white-space: nowrap;"
                                onmouseover="this.style.background='#5a32a3'" onmouseout="this.style.background='#6f42c1'">
                            +5
                        </button>
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
        // Security check
        if (!isAdmin()) {
            showToast('🔒 Admin access required.', 'error');
            return;
        }

        // Find the record in search results
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

        // Add to cart
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
        
        // Update UI
        updateCartPreview();
        updateCartCount();
        updateTabCartCount();
        
        // If on checkout tab, refresh it
        if (currentTab === 'checkout') {
            renderCheckoutTab();
        }
        
        if (typeof window.updateCartBadge === 'function') {
            window.updateCartBadge();
        }
    };

    // ========== ADD CUSTOM ITEM ==========
    window.addCustomItem = function() {
        // Security check - only admins can add custom items
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
        updateTabCartCount();
        
        // If on checkout tab, refresh it
        if (currentTab === 'checkout') {
            renderCheckoutTab();
        }
        
        // Refresh cart badge if function exists
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

    // ============================================================
    // ADMIN CHECKOUT SYSTEM (Full payment system)
    // ============================================================

    // ===== OPEN ADMIN CHECKOUT =====
    window.openAdminCheckout = function() {
        console.log('🛒 Opening admin checkout...');
        
        if (!isAdmin()) {
            showToast('🔒 Admin access required.', 'error');
            return;
        }

        if (window.cart.isEmpty()) {
            showToast('Cart is empty!', 'warning');
            return;
        }

        // Switch to checkout tab
        switchTab('checkout');
        
        // Check Square availability
        checkSquareAvailability().then(() => {
            showAdminCheckoutModal();
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
            console.log('📟 Terminals response:', data);
            
            if (data.status === 'success' && data.terminals && data.terminals.length > 0) {
                squareAvailable = true;
                availableTerminals = data.terminals;
                availableTerminals.forEach(t => {
                    console.log(`📟 Terminal: ${t.device_name || 'Unknown'} - ID: ${t.id}`);
                });
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

    // ===== SHOW ADMIN CHECKOUT MODAL =====
    function showAdminCheckoutModal() {
        console.log('🛒 Showing admin checkout modal...');
        
        const items = window.cart.getItems();
        const subtotal = window.cart.getTotal();
        const taxAmount = calculateTax(subtotal);
        const totalWithTax = subtotal + taxAmount;
        
        checkoutItems = items;
        checkoutTotal = totalWithTax;
        checkoutRemaining = totalWithTax;
        checkoutPaymentEntries = [];

        const container = document.getElementById('admin-checkout-modal-container');
        if (!container) return;

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
                <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; font-size: 13px; color: #333;">
                    <span>${icon} ${displayTitle}</span>
                    <span>${qty}× $${price.toFixed(2)} = $${totalPrice.toFixed(2)}</span>
                </div>
            `;
        });

        container.innerHTML = `
            <div id="checkout-payment-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 10002; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.3s ease;">
                <div style="background: white; border-radius: 16px; max-width: 600px; width: 95%; max-height: 90vh; overflow-y: auto; padding: 0; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                    <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 20px; border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: white;"><i class="fas fa-credit-card"></i> Admin Checkout</h3>
                        <button onclick="closeAdminCheckoutModal()" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer;">&times;</button>
                    </div>
                    
                    <div style="padding: 20px;">
                        <!-- Order Summary -->
                        <div style="margin-bottom: 15px; max-height: 150px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 8px;">
                            <div style="font-weight: 600; margin-bottom: 5px; color: #333;">Order Summary (${items.length} items)</div>
                            <div style="font-size: 13px; color: #666;">${itemsHtml}</div>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding: 10px; background: #e8f5e9; border-radius: 8px;">
                            <div>
                                <span style="font-weight: 600; color: #333;">Total Due:</span>
                                <span style="font-size: 13px; color: #666; margin-left: 8px;">(incl. tax)</span>
                            </div>
                            <span id="checkout-total-due" style="font-size: 24px; font-weight: bold; color: #28a745;">$${totalWithTax.toFixed(2)}</span>
                        </div>

                        <!-- Subtotal and Tax Breakdown -->
                        <div style="margin-bottom: 10px; padding: 8px 10px; background: #f8f9fa; border-radius: 6px; font-size: 13px;">
                            <div style="display: flex; justify-content: space-between; color: #666;">
                                <span>Subtotal:</span>
                                <span>$${subtotal.toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; color: #666;">
                                <span>Tax (7%):</span>
                                <span>$${taxAmount.toFixed(2)}</span>
                            </div>
                        </div>

                        <!-- Remaining Balance -->
                        <div style="margin-bottom: 15px; padding: 10px; background: #e9ecef; border-radius: 8px; display: flex; justify-content: space-between;">
                            <span style="font-weight: 600; color: #333;">Remaining:</span>
                            <span id="checkout-remaining" style="font-weight: bold; color: #dc3545;">$${totalWithTax.toFixed(2)}</span>
                        </div>

                        <!-- Debtor Lookup -->
                        <div style="background: #e3f2fd; padding: 12px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #b8daff;">
                            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                <input type="text" id="checkout-debtor-code" placeholder="GIFT-XXXXX or debtor name" style="flex: 2; min-width: 150px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                                <button onclick="lookupDebtorForCheckout()" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Lookup</button>
                            </div>
                            <div id="checkout-debtor-info" style="display: none; margin-top: 8px; padding: 8px; background: white; border-radius: 4px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                                    <span><strong id="checkout-debtor-name">—</strong> <span id="checkout-debtor-type" style="font-size: 12px; color: #666;">(Store Credit)</span></span>
                                    <span style="font-weight: bold; color: #28a745;">Balance: $<span id="checkout-debtor-balance">0.00</span></span>
                                </div>
                                <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                                    <button onclick="applyDebtorToCheckout()" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;"><i class="fas fa-check"></i> Apply Credit</button>
                                    <button onclick="document.getElementById('checkout-debtor-info').style.display='none'" style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                                </div>
                                <div id="checkout-debtor-status" style="font-size: 13px; margin-top: 5px;"></div>
                            </div>
                        </div>

                        <!-- Payment Methods -->
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; font-weight: 600; color: #555; font-size: 13px; margin-bottom: 8px;">Payment Methods</label>
                            
                            <!-- Card Payment (Square) -->
                            <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; margin-bottom: 8px; border: 2px solid #28a745;">
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

                            <!-- POS Terminal Payment -->
                            <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; margin-bottom: 8px; border: 2px solid #6f42c1;">
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
                                <div id="pos-terminal-select" style="margin-top: 5px; display: ${availableTerminals.length > 0 ? 'block' : 'none'};">
                                    <label style="font-size: 12px; color: #555;">Select Terminal:</label>
                                    <select id="pos-device-select" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; width: 100%; margin-top: 2px;">
                                        ${availableTerminals.map(t => `<option value="${t.id}">${t.device_name || t.id}</option>`).join('')}
                                    </select>
                                </div>
                            </div>

                            <!-- Cash Payment -->
                            <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; margin-bottom: 8px; border: 1px solid #ddd;">
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

                            <!-- Gift Card Payment -->
                            <div style="background: #f8f9fa; border-radius: 8px; padding: 10px; margin-bottom: 8px; border: 1px solid #ddd;">
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

                        <button onclick="completeAdminCheckout()" id="checkout-complete-btn" style="width: 100%; margin-top: 15px; padding: 14px; background: #28a745; color: white; border: none; border-radius: 30px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
                            <i class="fas fa-check"></i> Complete Order
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Update UI
        updateAdminCheckoutUI();

        // Close on click outside
        const modal = document.getElementById('checkout-payment-modal');
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    closeAdminCheckoutModal();
                }
            });
        }

        // Escape key
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closeAdminCheckoutModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // ===== CLOSE ADMIN CHECKOUT MODAL =====
    window.closeAdminCheckoutModal = function() {
        const container = document.getElementById('admin-checkout-modal-container');
        if (container) container.innerHTML = '';
        if (squarePollInterval) {
            clearInterval(squarePollInterval);
            squarePollInterval = null;
        }
    };

    // ===== UPDATE ADMIN CHECKOUT UI =====
    function updateAdminCheckoutUI() {
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
            if (summary) summary.style.display = 'none';
            return;
        }

        if (summary) summary.style.display = 'block';
        let html = '';
        checkoutPaymentEntries.forEach((entry, idx) => {
            html += `
                <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee;">
                    <span>${entry.method}</span>
                    <span>$${entry.amount.toFixed(2)}</span>
                    <button onclick="removeAdminPaymentEntry(${idx})" style="background: none; border: none; color: #dc3545; cursor: pointer; font-size: 12px;">×</button>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    // ===== REMOVE PAYMENT ENTRY =====
    window.removeAdminPaymentEntry = function(index) {
        if (index >= 0 && index < checkoutPaymentEntries.length) {
            const entry = checkoutPaymentEntries[index];
            checkoutRemaining += entry.amount;
            checkoutPaymentEntries.splice(index, 1);
            updateAdminCheckoutUI();
        }
    };

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

        addAdminPaymentEntry('Card (Square)', payAmount);
        document.getElementById('card-amount').value = '';
        showCheckoutStatus('💳 Added $' + payAmount.toFixed(2) + ' via Card', 'success');
    };

    // ===== ADD POS PAYMENT =====
    window.addPosPayment = async function() {
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
            showCheckoutStatus('Checking for Square terminals...', 'info');
            await checkSquareAvailability();
            
            if (!squareAvailable || availableTerminals.length === 0) {
                showCheckoutStatus('No Square Terminal available. Please use Card or Cash.', 'error');
                return;
            }
        }

        const select = document.getElementById('pos-device-select');
        let deviceId = null;
        if (select && select.value) {
            deviceId = select.value;
        } else {
            deviceId = availableTerminals[0]?.id;
        }

        if (!deviceId) {
            showCheckoutStatus('No terminal selected. Please select a terminal.', 'warning');
            return;
        }

        if (deviceId.startsWith('device:')) {
            deviceId = deviceId.substring(7);
        }

        if (deviceId.includes(':')) {
            const parts = deviceId.split(':');
            deviceId = parts[parts.length - 1];
        }

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
            const items = window.cart.getItems();
            const recordIds = items.filter(i => i.type === 'record' && i.id).map(i => String(i.id));
            const titles = items.map(i => i.title || 'Item');

            let cleanDeviceId = deviceId;
            if (cleanDeviceId.startsWith('device:')) {
                cleanDeviceId = cleanDeviceId.substring(7);
            }
            cleanDeviceId = cleanDeviceId.trim();

            console.log('📟 Clean device ID:', cleanDeviceId);

            const payload = {
                amount_cents: Math.round(amount * 100),
                record_ids: recordIds.length > 0 ? recordIds : ['1'],
                record_titles: titles.length > 0 ? titles : ['Item'],
                reference_id: 'pos_' + Date.now(),
                device_id: cleanDeviceId
            };

            console.log('📟 Sending to POS payload:', payload);

            const response = await fetch(`${API_BASE}/api/square/terminal/checkout`, {
                method: 'POST',
                credentials: 'include',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const responseText = await response.text();
            console.log('📟 POS response text:', responseText);

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseErr) {
                console.error('❌ Failed to parse POS response:', parseErr);
                if (statusEl) {
                    statusEl.textContent = '❌ Server error: Invalid response from POS API';
                    statusEl.style.color = '#dc3545';
                }
                if (posBtn) posBtn.disabled = false;
                return;
            }

            if (response.ok && data.status === 'success') {
                const checkout = data.checkout;
                squareCheckoutId = checkout.id;

                if (statusEl) {
                    statusEl.textContent = '⏳ Payment request sent. Waiting for customer to complete on POS...';
                    statusEl.style.color = '#17a2b8';
                }

                startPosPolling(checkout.id, amount);
            } else {
                let errorMsg = data.message || data.error || 'Unknown error';
                if (data.missing_fields) {
                    errorMsg = `Missing required fields: ${data.missing_fields.join(', ')}`;
                }
                if (data.errors && Array.isArray(data.errors)) {
                    errorMsg = data.errors.map(e => e.detail || e.message || e).join('; ');
                }
                if (statusEl) {
                    statusEl.textContent = `❌ Failed to send to POS: ${errorMsg}`;
                    statusEl.style.color = '#dc3545';
                }
                console.error('❌ POS error details:', data);
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
        const maxAttempts = 60;

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
                    addAdminPaymentEntry('POS Terminal', amount);
                    if (statusEl) {
                        statusEl.textContent = '✅ Payment completed successfully!';
                        statusEl.style.color = '#28a745';
                    }
                    updateAdminCheckoutUI();
                    setTimeout(() => {
                        if (checkoutRemaining <= 0.01) {
                            completeAdminCheckout();
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

        addAdminPaymentEntry('Cash', amount);
        document.getElementById('cash-amount').value = '';
        showCheckoutStatus('💰 Added $' + amount.toFixed(2) + ' Cash', 'success');
    };

    // ===== ADD PAYMENT ENTRY =====
    function addAdminPaymentEntry(method, amount) {
        checkoutPaymentEntries.push({ method, amount });
        checkoutRemaining -= amount;
        updateAdminCheckoutUI();
    }

    // ===== SET MAX AMOUNTS =====
    window.setMaxCard = function() {
        document.getElementById('card-amount').value = checkoutRemaining.toFixed(2);
    };

    window.setMaxPos = function() {
        document.getElementById('pos-amount').value = checkoutRemaining.toFixed(2);
    };

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

        addAdminPaymentEntry('Gift Card (' + code + ')', amount);
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

        addAdminPaymentEntry('Store Credit (' + checkoutDebtorData.debtor + ')', amount);
        checkoutDebtorData.balance = balance - amount;
        document.getElementById('checkout-debtor-balance').textContent = (balance - amount).toFixed(2);
        document.getElementById('checkout-debtor-status').textContent = '✅ Applied $' + amount.toFixed(2) + '. Remaining: $' + (balance - amount).toFixed(2);
        document.getElementById('checkout-debtor-status').style.color = '#28a745';
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

    // ===== COMPLETE ADMIN CHECKOUT =====
    window.completeAdminCheckout = function() {
        console.log('🛒 Completing admin checkout...');
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
        const subtotal = window.cart.getTotal();
        const taxAmount = calculateTax(subtotal);
        const totalWithTax = subtotal + taxAmount;

        // Verify the paid amount matches total with tax
        const totalPaid = checkoutPaymentEntries.reduce((sum, entry) => sum + entry.amount, 0);
        if (Math.abs(totalPaid - totalWithTax) > 0.01) {
            const missingTax = totalWithTax - totalPaid;
            if (missingTax > 0.01) {
                addAdminPaymentEntry('Tax (7%)', missingTax);
                showCheckoutStatus(`⚠️ Added tax: $${missingTax.toFixed(2)}`, 'warning');
                if (checkoutRemaining > 0.01) {
                    showCheckoutStatus(`⚠️ Please pay remaining: $${checkoutRemaining.toFixed(2)}`, 'warning');
                    return;
                }
            }
        }

        const orderData = {
            items: window.cart.getCheckoutPayload(),
            subtotal: subtotal,
            tax: taxAmount,
            total: totalWithTax,
            shipping: { method: 'pickup', amount: 0 },
            customer_name: currentUserName + ' (Admin)',
            customer_email: '',
            notes: 'Admin checkout - ' + currentUserName + ' (Tax: $' + taxAmount.toFixed(2) + ')',
            payment_entries: checkoutPaymentEntries,
            source: 'admin_checkout'
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
                updateCartPreview();
                updateCartCount();
                updateTabCartCount();
                
                if (currentTab === 'checkout') {
                    renderCheckoutTab();
                }
                
                showCheckoutStatus('✅ Order completed successfully!', 'success');
                
                setTimeout(() => {
                    closeAdminCheckoutModal();
                    showToast('🎉 Order complete! Thank you!', 'success');
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

    // ========== GO TO CART ==========
    window.goToCart = function() {
        if (typeof showPage === 'function') {
            showPage('cart');
        } else {
            window.location.href = '#cart';
            location.reload();
        }
    };

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