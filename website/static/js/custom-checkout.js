// ============================================================
// CUSTOM CHECKOUT - Admin checkout with integrated payments
// ADMIN ONLY - Restricted to admin/manager roles
// RETURNS: direction decided by the RECORD's status_id.
//   status_id 2       -> 'sale'
//   status_id 3,4,5   -> 'return'
// Cart titles truncate at 75 chars so price/remove buttons
// never fall off the right panel.
// Cash-only refunds. Return-to-stock defaults true.
// Backend: /api/returns/process + /api/returns/complete
// ============================================================

(function() {
    'use strict';

    console.log('🚀 Custom Checkout module loaded (status-aware sale/return)');

    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    let TAX_RATE = 0.07;

    const storeSettings = {
        STORE_NAME: 'PigStyle Music',
        STORE_ADDRESS: '100 E 3rd St, Loveland, CO 80537',
        STORE_PHONE: '(970) 492-5630',
        RECEIPT_FOOTER: 'Thank you for shopping at PigStyle Music!',
        TAX_RATE: 7.5,
        TAX_ENABLED: 'true'
    };

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

    function calculateTax(subtotal) {
        if (storeSettings.TAX_ENABLED === 'false') return 0;
        return Math.round(subtotal * TAX_RATE * 100) / 100;
    }

    async function loadStoreSettings() {
        const keys = ['STORE_NAME', 'STORE_ADDRESS', 'STORE_PHONE', 'RECEIPT_FOOTER', 'TAX_RATE', 'TAX_ENABLED'];
        for (const key of keys) {
            try {
                const response = await fetch(`${API_BASE}/config/${key}`, {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.config_value !== null && data.config_value !== undefined) {
                        storeSettings[key] = data.config_value;
                    }
                }
            } catch (e) {
                console.warn(`⚠️ Could not load store setting ${key}:`, e.message);
            }
        }
        const parsed = parseFloat(storeSettings.TAX_RATE);
        if (!isNaN(parsed) && parsed > 0) TAX_RATE = parsed / 100;
        console.log('🏪 Store settings loaded:', storeSettings, 'TAX_RATE =', TAX_RATE);
    }

    // ===== STATE =====
    let squareAvailable = false;
    let availableTerminals = [];
    let currentUserId = null;
    let currentUserName = 'Admin';
    let recordSearchResults = [];
    let recordSearchTimeout = null;
    let recordSearchLoading = false;
    let selectedPaymentMethod = 'cash';
    let posCheckoutId = null;
    let posPollInterval = null;
    let posInProgress = false;
    let posPendingAmount = 0;
    let posAwaitingManualComplete = false;
    let discountPercent = 0;
    let discountAmount = 0;
    let cashReceived = 0;
    let giftCardApplied = 0;
    let outstandingBalance = 0;
    let paymentEntries = [];
    let isPaymentComplete = false;
    let isProcessingPayment = false;
    let lastOrderId = null;

    let customItemMode = 'sale';
    let returnToStockDefault = true;

    const CART_TITLE_MAX_LEN = 75;

    function truncateCartTitle(text, maxLen) {
        maxLen = maxLen || CART_TITLE_MAX_LEN;
        if (!text) return '';
        const s = String(text);
        if (s.length <= maxLen) return s;
        return s.substring(0, maxLen - 1) + '…';
    }

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

    function getSaleItems() {
        const items = window.cart ? window.cart.getItems() : [];
        return items.filter(i => (i.direction || 'sale') === 'sale');
    }
    function getReturnItems() {
        const items = window.cart ? window.cart.getItems() : [];
        return items.filter(i => i.direction === 'return');
    }
    function getSaleSubtotal() {
        return getSaleItems().reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
    }
    function getReturnSubtotal() {
        return getReturnItems().reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
    }

    function computeTotals() {
        const saleSub = getSaleSubtotal();
        const returnSub = getReturnSubtotal();
        const saleTax = calculateTax(saleSub);
        const returnTax = calculateTax(returnSub);
        const saleGross = saleSub + saleTax;

        let discTotal = 0;
        if (discountPercent > 0) discTotal = saleGross * (discountPercent / 100);
        else if (discountAmount > 0) discTotal = Math.min(discountAmount, saleGross);

        const saleTotal = Math.max(0, saleGross - discTotal);
        const returnTotal = returnSub + returnTax;
        const netTotal = saleTotal - returnTotal;
        return { saleSub, returnSub, saleTax, returnTax, discTotal, saleTotal, returnTotal, netTotal };
    }

    function classifyRecord(record) {
        if (!record) return 'sale';
        const sid = Number(record.status_id);
        if (sid === 3 || sid === 4 || sid === 5) return 'return';
        return 'sale';
    }

    // ========== INIT ==========
    window.initCustomCheckout = function() {
        console.log('🔧 initCustomCheckout called');
        const container = document.getElementById('custom-checkout-container');
        if (!container) { console.error('❌ custom-checkout-container not found'); return; }

        getUser();
        if (!isAdmin()) {
            container.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;">
                    <div style="font-size:48px;margin-bottom:20px;">🔒</div>
                    <h2 style="color:#333;">Admin Access Required</h2>
                    <p style="color:#666;">Please log in as an admin to use this feature.</p>
                    <button onclick="showPage('login')" style="margin-top:20px;padding:10px 30px;background:#007bff;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px;">
                        <i class="fas fa-sign-in-alt"></i> Go to Login
                    </button>
                </div>`;
            return;
        }

        cashReceived = 0; giftCardApplied = 0; outstandingBalance = 0;
        paymentEntries = []; isPaymentComplete = false;
        discountPercent = 0; discountAmount = 0;
        posInProgress = false; posCheckoutId = null; posPendingAmount = 0;
        posAwaitingManualComplete = false; isProcessingPayment = false;
        customItemMode = 'sale';

        container.innerHTML = customCheckoutTemplate();
        loadStoreSettings().then(() => {
            setTimeout(() => {
                initCustomCheckoutEvents();
                checkSquareAvailability();
                renderCheckoutPanel();
            }, 100);
        });
    };

    // ========== TEMPLATE ==========
    function customCheckoutTemplate() {
        return `
            <div style="display:flex;flex-direction:column;gap:16px;padding:20px;max-width:1400px;margin:0 auto;width:100%;">
                <div style="background:#28a745;color:white;padding:8px 16px;border-radius:8px;text-align:center;font-size:13px;font-weight:600;">
                    <i class="fas fa-shield-alt"></i> Admin Mode - Custom Checkout (Sales & Returns)
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                    <div>
                        <h2 style="color:#333;margin:0;"><i class="fas fa-plus-circle" style="color:#17a2b8;"></i> Custom Checkout</h2>
                        <p style="color:#666;margin:5px 0 0 0;">Status decides sale vs return — sold records come back as returns automatically.</p>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <span style="color:#666;font-size:13px;">👤 ${currentUserName}</span>
                    </div>
                </div>

                <div id="custom-checkout-status" style="display:none;padding:12px;border-radius:8px;font-weight:500;text-align:center;"></div>

                <div class="cc-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">
                    <div style="display:flex;flex-direction:column;gap:16px;">
                        ${recordsSectionTemplate()}
                        ${customSectionTemplate()}
                    </div>
                    <div class="cc-sticky" style="position:sticky;top:16px;">
                        <div id="checkout-panel">${checkoutPanelTemplate()}</div>
                    </div>
                </div>
            </div>

            <div id="pos-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10003;align-items:center;justify-content:center;">
                <div style="background:white;border-radius:16px;max-width:450px;width:95%;padding:30px;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;">
                    <div style="font-size:48px;margin-bottom:16px;">📟</div>
                    <h2 style="margin:0 0 8px 0;color:#333;">Processing POS Payment</h2>
                    <p id="pos-modal-status" style="color:#666;margin-bottom:20px;">Sending request to terminal...</p>
                    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                        <button onclick="cancelPosPayment()" style="padding:12px 30px;background:#dc3545;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;"><i class="fas fa-times"></i> Cancel</button>
                        <button onclick="retryPosPayment()" id="pos-retry-btn" style="display:none;padding:12px 30px;background:#17a2b8;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;"><i class="fas fa-sync"></i> Retry</button>
                        <button onclick="hidePosModal()" id="pos-close-btn" style="padding:12px 30px;background:#6c757d;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;"><i class="fas fa-check"></i> Done</button>
                    </div>
                    <div id="pos-modal-error" style="display:none;margin-top:12px;padding:12px;background:#f8d7da;color:#721c24;border-radius:8px;font-size:13px;"></div>
                </div>
            </div>

            <div id="discount-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10004;align-items:center;justify-content:center;">
                <div style="background:white;border-radius:16px;max-width:400px;width:95%;padding:30px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px;">
                        <h2 style="margin:0;color:#333;"><i class="fas fa-tags" style="color:#ffc107;"></i> Apply Discount</h2>
                        <button onclick="closeDiscountModal()" style="background:none;border:none;font-size:28px;cursor:pointer;color:#999;padding:0 8px;">&times;</button>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block;font-weight:600;color:#555;font-size:13px;margin-bottom:4px;">Discount Type</label>
                        <div style="display:flex;gap:8px;">
                            <button onclick="selectDiscountType('percent')" id="disc-type-percent" style="flex:1;padding:8px;background:#17a2b8;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Percentage</button>
                            <button onclick="selectDiscountType('amount')" id="disc-type-amount" style="flex:1;padding:8px;background:#e9ecef;color:#333;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Fixed Amount</button>
                        </div>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block;font-weight:600;color:#555;font-size:13px;margin-bottom:4px;" id="discount-label">Discount Percentage (%)</label>
                        <input type="number" id="discount-value" placeholder="10" step="0.01" min="0" style="width:100%;padding:10px;border:2px solid #ddd;border-radius:8px;font-size:16px;box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block;font-weight:600;color:#555;font-size:13px;margin-bottom:4px;">Reason (optional)</label>
                        <input type="text" id="discount-reason" placeholder="e.g., Customer appreciation" style="width:100%;padding:10px;border:2px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
                    </div>
                    <div id="discount-preview" style="display:none;padding:10px;background:#e9ecef;border-radius:8px;font-size:13px;margin-bottom:10px;text-align:center;"></div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button onclick="clearDiscount()" style="padding:10px 20px;background:#dc3545;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Remove</button>
                        <button onclick="closeDiscountModal()" style="padding:10px 20px;background:#6c757d;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Cancel</button>
                        <button onclick="applyDiscount()" style="padding:10px 20px;background:#ffc107;color:#333;border:none;border-radius:8px;cursor:pointer;font-weight:600;"><i class="fas fa-check"></i> Apply</button>
                    </div>
                </div>
            </div>
        `;
    }

    function recordsSectionTemplate() {
        return `
            <div style="background:white;border-radius:12px;padding:20px;border:2px solid #6f42c1;">
                <h3 style="color:#6f42c1;margin:0 0 15px 0;"><i class="fas fa-search"></i> Find Records</h3>
                <p style="color:#666;font-size:13px;margin:0 0 12px 0;">
                    Search any record (active or sold). Sold records are added as <strong style="color:#dc3545;">returns</strong>.
                </p>
                <div style="display:flex;gap:8px;">
                    <input type="text" id="record-search-input" placeholder="Barcode, ID, artist, or title..." style="flex:1;padding:10px;border:2px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
                    <button onclick="searchRecords()" id="record-search-btn" style="padding:10px 20px;background:#6f42c1;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;"><i class="fas fa-search"></i></button>
                </div>
                <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
                    <button onclick="clearRecordSearch()" style="padding:4px 12px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Clear</button>
                    <span id="record-search-count" style="font-size:12px;color:#666;align-self:center;"></span>
                </div>
                <div id="record-search-loading" style="display:none;text-align:center;padding:20px;color:#666;">
                    <i class="fas fa-spinner fa-spin"></i> Searching...
                </div>
                <div id="record-search-results" style="max-height:300px;overflow-y:auto;margin-top:10px;border-top:1px solid #eee;padding-top:10px;">
                    <div style="color:#999;text-align:center;padding:20px;font-size:13px;">Enter a search term above</div>
                </div>
            </div>
        `;
    }

    function customSectionTemplate() {
        return `
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div style="background:white;border-radius:12px;padding:20px;border:2px solid #17a2b8;">
                    <h3 style="color:#17a2b8;margin:0 0 15px 0;"><i class="fas fa-plus-circle"></i> Add Custom Item</h3>
                    <div style="display:flex;gap:8px;margin-bottom:12px;">
                        <button onclick="switchCustomMode('sale')" id="custom-tab-sale" style="flex:1;padding:8px;background:#17a2b8;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;"><i class="fas fa-tag"></i> Sale Item</button>
                        <button onclick="switchCustomMode('return')" id="custom-tab-return" style="flex:1;padding:8px;background:#e9ecef;color:#333;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;"><i class="fas fa-undo"></i> Return Item</button>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <div>
                            <label style="display:block;font-weight:600;color:#555;font-size:13px;margin-bottom:4px;">Item Name *</label>
                            <input type="text" id="custom-item-name" placeholder="e.g., Vinyl Cleaning Kit" style="width:100%;padding:10px;border:2px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="display:block;font-weight:600;color:#555;font-size:13px;margin-bottom:4px;">Price ($) *</label>
                            <input type="number" id="custom-item-price" placeholder="0.00" step="0.01" min="0.01" style="width:100%;padding:10px;border:2px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
                        </div>
                    </div>
                    <div style="margin-top:12px;">
                        <label style="display:block;font-weight:600;color:#555;font-size:13px;margin-bottom:4px;">Quantity</label>
                        <input type="number" id="custom-item-qty" value="1" min="1" step="1" style="width:80px;padding:10px;border:2px solid #ddd;border-radius:8px;font-size:14px;">
                    </div>
                    <button onclick="addCustomItem()" style="margin-top:15px;padding:12px 30px;background:#17a2b8;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;width:100%;">
                        <i class="fas fa-cart-plus"></i> Add to Cart
                    </button>
                </div>

                <div>
                    <button onclick="addBernieItem()" style="width:100%;padding:16px;background:#ffc107;color:#333;border:none;border-radius:12px;cursor:pointer;font-weight:600;font-size:16px;">
                        <i class="fas fa-donate" style="font-size:24px;display:block;margin-bottom:5px;"></i>
                        Bernie ($0.99)
                        <div style="font-size:12px;font-weight:normal;color:#666;">Adds to Bernie fund</div>
                    </button>
                </div>
            </div>
        `;
    }

    function checkoutPanelTemplate() {
        const totals = computeTotals();
        const saleItems = getSaleItems();
        const returnItems = getReturnItems();
        const hasAny = saleItems.length > 0 || returnItems.length > 0;

        if (!hasAny) {
            return `
                <div style="background:#f8f9fa;border-radius:12px;padding:40px;text-align:center;border:1px solid #e9ecef;">
                    <div style="font-size:48px;margin-bottom:16px;">🛒</div>
                    <h3 style="color:#333;margin:0 0 8px 0;">Cart is Empty</h3>
                    <p style="color:#666;">Add sale or return items from the left panel.</p>
                </div>`;
        }

        const saleItemsHtml = renderCartTable(saleItems);
        const returnItemsHtml = renderCartTable(returnItems);
        const isPureReturn = saleItems.length === 0 && returnItems.length > 0;

        const netLabel = totals.netTotal > 0.01 ? 'Amount Due:' : (totals.netTotal < -0.01 ? 'Refund Owed:' : 'Net:');
        const netColor = totals.netTotal > 0.01 ? '#28a745' : (totals.netTotal < -0.01 ? '#dc3545' : '#333');
        const netAbs = Math.abs(totals.netTotal).toFixed(2);

        const showCash = selectedPaymentMethod === 'cash';
        const showCard = selectedPaymentMethod === 'card' && !isPureReturn;
        const showPos = selectedPaymentMethod === 'pos' && !isPureReturn;
        const showGiftCard = selectedPaymentMethod === 'giftcard' && !isPureReturn;

        let paymentMethodButtons = '';
        if (!isPureReturn) {
            paymentMethodButtons = `
                <button onclick="selectPaymentMethod('cash')" id="pm-cash" class="payment-method-btn" style="padding:8px 16px;background:#28a745;color:white;border:2px solid #28a745;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">💵 Cash</button>
                <button onclick="selectPaymentMethod('card')" id="pm-card" class="payment-method-btn" style="padding:8px 16px;background:white;color:#333;border:2px solid #ddd;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">💳 Card</button>
                <button onclick="selectPaymentMethod('pos')" id="pm-pos" class="payment-method-btn" style="padding:8px 16px;background:white;color:#333;border:2px solid #ddd;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">📟 POS</button>
                <button onclick="selectPaymentMethod('giftcard')" id="pm-giftcard" class="payment-method-btn" style="padding:8px 16px;background:white;color:#333;border:2px solid #ddd;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">🎁 Gift Card</button>
            `;
        }

        return `
            <div style="background:white;border-radius:12px;border:2px solid #28a745;overflow:hidden;">
                <div style="background:#28a745;color:white;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:600;font-size:15px;"><i class="fas fa-shopping-cart"></i> Cart Summary</span>
                    <span style="font-weight:600;font-size:15px;">${saleItems.length + returnItems.length} items</span>
                </div>

                ${saleItems.length > 0 ? `
                <div style="background:#f8fff8;border-top:2px solid #28a745;">
                    <div style="padding:8px 20px;font-weight:700;color:#28a745;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">
                        <i class="fas fa-tag"></i> Sales (${saleItems.length})
                    </div>
                    <div style="max-height:180px;overflow-y:auto;">${saleItemsHtml}</div>
                </div>` : ''}

                ${returnItems.length > 0 ? `
                <div style="background:#fff8f8;border-top:2px solid #dc3545;">
                    <div style="padding:8px 20px;font-weight:700;color:#dc3545;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">
                        <i class="fas fa-undo"></i> Returns (${returnItems.length})
                    </div>
                    <div style="max-height:180px;overflow-y:auto;">${returnItemsHtml}</div>
                </div>` : ''}

                <div style="padding:16px 20px;border-top:2px solid #eee;background:#f8f9fa;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                        <span style="color:#666;">Sales Subtotal:</span>
                        <span style="font-weight:500;color:#28a745;">$${totals.saleSub.toFixed(2)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                        <span style="color:#666;">Sales Tax (${(TAX_RATE * 100).toFixed(2)}%):</span>
                        <span style="font-weight:500;color:#333;">$${totals.saleTax.toFixed(2)}</span>
                    </div>
                    ${totals.discTotal > 0 ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;color:#dc3545;">
                        <span style="font-weight:600;">Discount:</span>
                        <span style="font-weight:600;">-$${totals.discTotal.toFixed(2)}</span>
                    </div>` : ''}

                    ${returnItems.length > 0 ? `
                    <div style="border-top:1px dashed #ddd;margin:6px 0;"></div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                        <span style="color:#666;">Return Subtotal:</span>
                        <span style="font-weight:500;color:#dc3545;">-$${totals.returnSub.toFixed(2)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                        <span style="color:#666;">Return Tax (${(TAX_RATE * 100).toFixed(2)}%):</span>
                        <span style="font-weight:500;color:#dc3545;">-$${totals.returnTax.toFixed(2)}</span>
                    </div>` : ''}

                    ${giftCardApplied > 0 ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;color:#6f42c1;">
                        <span style="font-weight:600;">🎁 Gift Card Applied:</span>
                        <span style="font-weight:600;">-$${giftCardApplied.toFixed(2)}</span>
                    </div>` : ''}
                    ${cashReceived > 0 ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;color:#28a745;">
                        <span style="font-weight:600;">Cash Paid:</span>
                        <span style="font-weight:600;">-$${cashReceived.toFixed(2)}</span>
                    </div>` : ''}

                    <div style="border-bottom:1px solid #e9ecef;padding-bottom:8px;margin-bottom:8px;"></div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <span style="font-weight:600;color:#333;font-size:16px;">${netLabel}</span>
                        <span style="font-weight:bold;color:${netColor};font-size:20px;">${totals.netTotal < -0.01 ? '-' : ''}$${netAbs}</span>
                    </div>

                    <div style="margin-bottom:12px;">
                        <button onclick="showDiscountModal()" style="padding:8px 16px;background:#ffc107;color:#333;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;width:100%;">
                            <i class="fas fa-tags"></i> ${totals.discTotal > 0 ? 'Update Discount' : 'Apply Discount (sales only)'}
                        </button>
                        ${totals.discTotal > 0 ? `<div style="text-align:center;margin-top:4px;font-size:12px;color:#28a745;">✓ Discount applied</div>` : ''}
                    </div>

                    ${!isPureReturn ? `
                    <div style="margin-bottom:12px;">
                        <label style="display:block;font-weight:600;color:#555;font-size:13px;margin-bottom:6px;">Payment Method</label>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">${paymentMethodButtons}</div>
                    </div>` : `
                    <div style="margin-bottom:12px;padding:12px;background:#fff3cd;color:#856404;border-radius:8px;font-size:13px;text-align:center;">
                        <i class="fas fa-money-bill-wave"></i> Pure return — cash refund only
                    </div>`}

                    ${showCash && totals.netTotal > 0.01 ? `
                    <div id="cash-payment-section" style="margin-bottom:12px;">
                        <label style="display:block;font-weight:600;color:#555;font-size:13px;margin-bottom:4px;">Cash Amount Received</label>
                        <input type="number" id="cash-amount" placeholder="0.00" step="0.01" min="0" style="width:100%;padding:10px;border:2px solid #ddd;border-radius:8px;font-size:16px;box-sizing:border-box;">
                        <div id="cash-change-display" style="margin-top:6px;font-size:14px;color:#666;text-align:center;"></div>
                    </div>` : ''}

                    ${showCard ? `
                    <div style="margin-bottom:12px;padding:12px;background:#e8f0fe;border-radius:8px;text-align:center;color:#004085;">
                        <i class="fas fa-credit-card" style="font-size:24px;display:block;margin-bottom:8px;"></i>
                        <div style="font-weight:600;">Card Payment</div>
                        <div style="font-size:13px;margin-top:4px;">Click "Complete Payment" to open Square checkout</div>
                    </div>` : ''}

                    ${showPos ? `
                    <div id="pos-payment-section" style="margin-bottom:12px;">
                        <div style="padding:12px;background:#f8f9fa;border-radius:8px;text-align:center;border:1px solid #ddd;">
                            <i class="fas fa-print" style="font-size:24px;display:block;margin-bottom:8px;color:#6f42c1;"></i>
                            <div style="font-weight:600;">POS Terminal</div>
                            <div style="font-size:13px;margin-top:4px;color:#666;">Click "Send to POS" to charge the terminal</div>
                            <div id="pos-status-text" style="font-size:12px;color:#17a2b8;margin-top:4px;">
                                ${availableTerminals.length > 0 ? `✅ ${availableTerminals.length} terminal(s) available` : '⏳ Checking terminals...'}
                            </div>
                        </div>
                        <button onclick="sendToPos()" id="send-to-pos-btn" style="width:100%;margin-top:8px;padding:12px;background:#6f42c1;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;">
                            <i class="fas fa-paper-plane"></i> Send to POS
                        </button>
                        <div id="pos-pending-note" style="display:${posAwaitingManualComplete ? 'block' : 'none'};margin-top:8px;padding:8px;background:#fff3cd;color:#856404;border-radius:6px;font-size:12px;text-align:center;">
                            ⏳ POS request sent. Waiting for terminal...
                        </div>
                    </div>` : ''}

                    ${showGiftCard ? `
                    <div style="margin-bottom:12px;">
                        <label style="display:block;font-weight:600;color:#555;font-size:13px;margin-bottom:4px;">Gift Card Code</label>
                        <div style="display:flex;gap:8px;">
                            <input type="text" id="giftcard-code" placeholder="Scan or enter code..." style="flex:1;padding:10px;border:2px solid #ddd;border-radius:8px;font-size:14px;font-family:monospace;text-transform:uppercase;box-sizing:border-box;">
                            <button onclick="applyGiftCard()" id="apply-giftcard-btn" style="padding:10px 20px;background:#6f42c1;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;white-space:nowrap;">
                                <i class="fas fa-check"></i> Apply
                            </button>
                        </div>
                        <div id="giftcard-status" style="margin-top:6px;font-size:13px;color:#666;"></div>
                    </div>` : ''}

                    <button onclick="executePayment()" id="payment-execute-btn" style="width:100%;padding:14px;background:${isPureReturn ? '#dc3545' : '#28a745'};color:white;border:none;border-radius:30px;font-size:16px;font-weight:600;cursor:pointer;transition:all 0.3s;">
                        <i class="fas fa-check-circle"></i> ${isPureReturn ? 'Complete Return' : (saleItems.length && returnItems.length ? 'Complete Transaction' : 'Complete Payment')}
                    </button>

                    <div id="payment-error" style="display:none;margin-top:10px;padding:12px;background:#f8d7da;color:#721c24;border:2px solid #f5c6cb;border-radius:8px;font-weight:500;">
                        <i class="fas fa-exclamation-circle"></i> <span id="payment-error-text"></span>
                    </div>

                    <div id="payment-status" style="display:none;margin-top:10px;padding:12px;border-radius:8px;font-weight:500;">
                        <i class="fas fa-spinner fa-spin"></i> <span id="payment-status-text">Processing...</span>
                    </div>

                    <div style="margin-top:10px;">
                        <button onclick="clearCart()" style="width:100%;padding:8px 16px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">
                            <i class="fas fa-trash"></i> Clear Cart
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderCartTable(items) {
        if (!items.length) return '';
        let html = '';
        items.forEach(item => {
            const price = Number(item.price) || 0;
            const qty = Number(item.quantity) || 1;
            const totalPrice = price * qty;
            const isReturn = item.direction === 'return';

            let icon = '📦';
            if (item.type === 'bernie') icon = '🌹';
            else if (item.type === 'custom') icon = isReturn ? '↩️' : '🛍️';
            else if (item.type === 'record') icon = '🎵';

            const fullTitle = item.type === 'record'
                ? `${item.artist || 'Unknown Artist'} - ${item.title || 'Unknown Title'}`
                : (item.title || 'Item');
            const displayTitle = truncateCartTitle(fullTitle);

            const returnBadge = isReturn
                ? `<span class="cc-return-tag" style="margin-left:6px;flex-shrink:0;">RETURN</span>`
                : '';
            const stockBadge = isReturn && item.type === 'record'
                ? (item.return_to_stock
                    ? `<span class="cc-restock-tag" style="margin-left:6px;flex-shrink:0;">→ restock</span>`
                    : `<span class="cc-writeoff-tag" style="margin-left:6px;flex-shrink:0;">→ write-off</span>`)
                : '';
            const idBadge = item.type === 'record'
                ? `<span style="color:#888;font-size:11px;margin-left:8px;flex-shrink:0;">ID: ${item.original_id || item.id}</span>`
                : '';

            html += `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #eee;background:white;gap:8px;">
                    <div style="flex:1;min-width:0;display:flex;align-items:center;gap:4px;overflow:hidden;">
                        <span style="font-weight:500;color:#333;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;" title="${fullTitle.replace(/"/g, '&quot;')}">
                            ${icon} ${displayTitle}
                        </span>
                        ${returnBadge}${stockBadge}${idBadge}
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
                        <span style="color:#666;font-size:13px;white-space:nowrap;">${qty}× $${price.toFixed(2)}</span>
                        <span style="font-weight:bold;color:${isReturn ? '#dc3545' : '#333'};font-size:14px;min-width:60px;text-align:right;">
                            ${isReturn ? '-' : ''}$${totalPrice.toFixed(2)}
                        </span>
                        <button onclick="removeCartItem('${item.id}')" style="background:none;border:none;color:#dc3545;font-size:18px;cursor:pointer;padding:0 4px;">×</button>
                    </div>
                </div>
            `;
        });
        return html;
    }

    window.switchCustomMode = function(mode) {
        customItemMode = mode;
        const saleTab = document.getElementById('custom-tab-sale');
        const returnTab = document.getElementById('custom-tab-return');
        if (mode === 'sale') {
            saleTab.style.background = '#17a2b8';
            saleTab.style.color = 'white';
            returnTab.style.background = '#e9ecef';
            returnTab.style.color = '#333';
        } else {
            returnTab.style.background = '#dc3545';
            returnTab.style.color = 'white';
            saleTab.style.background = '#e9ecef';
            saleTab.style.color = '#333';
        }
    };

    window.selectPaymentMethod = function(method) {
        selectedPaymentMethod = method;
        document.querySelectorAll('.payment-method-btn').forEach(btn => {
            btn.style.background = 'white';
            btn.style.color = '#333';
            btn.style.border = '2px solid #ddd';
        });
        const activeBtn = document.getElementById('pm-' + method);
        if (activeBtn) {
            activeBtn.style.background = '#28a745';
            activeBtn.style.color = 'white';
            activeBtn.style.border = '2px solid #28a745';
        }
        if (method === 'pos') checkSquareAvailability();
        renderCheckoutPanel();
        setTimeout(() => {
            const btn = document.getElementById('pm-' + method);
            if (btn) {
                btn.style.background = '#28a745';
                btn.style.color = 'white';
                btn.style.border = '2px solid #28a745';
            }
        }, 50);
    };

    function updateCashDisplay() {
        const changeDisplay = document.getElementById('cash-change-display');
        const input = document.getElementById('cash-amount');
        if (!changeDisplay) return;
        const totals = computeTotals();
        const remaining = Math.max(0, totals.netTotal - giftCardApplied - cashReceived);
        const cashAmount = parseFloat(input?.value) || 0;
        if (totals.netTotal <= 0) { changeDisplay.textContent = ''; return; }
        if (cashAmount > 0) {
            if (cashAmount >= remaining) {
                changeDisplay.textContent = `💵 Change: $${(cashAmount - remaining).toFixed(2)}`;
                changeDisplay.style.color = '#28a745';
            } else {
                changeDisplay.textContent = `💵 Cash received: $${cashAmount.toFixed(2)} (Remaining: $${remaining.toFixed(2)})`;
                changeDisplay.style.color = '#17a2b8';
            }
        } else {
            changeDisplay.textContent = '';
        }
    }

    let discountType = 'percent';

    window.showDiscountModal = function() {
        document.getElementById('discount-modal').style.display = 'flex';
        document.getElementById('discount-value').focus();
        updateDiscountPreview();
    };
    window.closeDiscountModal = function() {
        document.getElementById('discount-modal').style.display = 'none';
    };
    window.selectDiscountType = function(type) {
        discountType = type;
        const percentBtn = document.getElementById('disc-type-percent');
        const amountBtn = document.getElementById('disc-type-amount');
        const label = document.getElementById('discount-label');
        if (type === 'percent') {
            percentBtn.style.background = '#17a2b8';
            percentBtn.style.color = 'white';
            amountBtn.style.background = '#e9ecef';
            amountBtn.style.color = '#333';
            label.textContent = 'Discount Percentage (%)';
        } else {
            amountBtn.style.background = '#17a2b8';
            amountBtn.style.color = 'white';
            percentBtn.style.background = '#e9ecef';
            percentBtn.style.color = '#333';
            label.textContent = 'Discount Amount ($)';
        }
        updateDiscountPreview();
    };

    function updateDiscountPreview() {
        const valueInput = document.getElementById('discount-value');
        const preview = document.getElementById('discount-preview');
        const value = parseFloat(valueInput?.value) || 0;
        if (!preview) return;
        if (value <= 0) { preview.style.display = 'none'; return; }
        const saleSub = getSaleSubtotal();
        if (saleSub <= 0) {
            preview.style.display = 'block';
            preview.innerHTML = '⚠️ Discounts apply to sales only. No sale items in cart.';
            return;
        }
        const saleTax = calculateTax(saleSub);
        const originalTotal = saleSub + saleTax;
        let discountApplied = 0, newTotal = originalTotal;
        if (discountType === 'percent') {
            discountApplied = originalTotal * (value / 100);
            newTotal = originalTotal - discountApplied;
            preview.innerHTML = `<strong>${value}% off sales</strong> = -$${discountApplied.toFixed(2)}<br>New sale total: <strong>$${newTotal.toFixed(2)}</strong>`;
        } else {
            discountApplied = Math.min(value, originalTotal);
            newTotal = originalTotal - discountApplied;
            preview.innerHTML = `<strong>$${value.toFixed(2)} off sales</strong> = -$${discountApplied.toFixed(2)}<br>New sale total: <strong>$${newTotal.toFixed(2)}</strong>`;
        }
        preview.style.display = 'block';
    }

    window.applyDiscount = function() {
        const valueInput = document.getElementById('discount-value');
        const reasonInput = document.getElementById('discount-reason');
        const value = parseFloat(valueInput?.value) || 0;
        if (value <= 0) { showToast('Please enter a discount value.', 'warning'); return; }
        const saleSub = getSaleSubtotal();
        if (saleSub <= 0) { showToast('Discounts apply to sales only.', 'warning'); return; }
        const saleTax = calculateTax(saleSub);
        const originalTotal = saleSub + saleTax;
        if (discountType === 'percent') {
            if (value > 100) { showToast('Percentage cannot exceed 100%', 'warning'); return; }
            discountPercent = value;
            discountAmount = 0;
        } else {
            if (value > originalTotal) { showToast(`Discount cannot exceed sale total $${originalTotal.toFixed(2)}`, 'warning'); return; }
            discountAmount = value;
            discountPercent = 0;
        }
        const reason = reasonInput?.value?.trim() || 'Discount applied';
        showToast(`✅ ${discountType === 'percent' ? value + '%' : '$' + value.toFixed(2)} discount applied: ${reason}`, 'success');
        cashReceived = 0;
        paymentEntries = [];
        closeDiscountModal();
        renderCheckoutPanel();
        setTimeout(() => selectPaymentMethod(selectedPaymentMethod), 50);
    };

    window.clearDiscount = function() {
        discountPercent = 0;
        discountAmount = 0;
        cashReceived = 0;
        paymentEntries = [];
        closeDiscountModal();
        renderCheckoutPanel();
        setTimeout(() => selectPaymentMethod(selectedPaymentMethod), 50);
        showToast('Discount removed.', 'info');
    };

    function renderCheckoutPanel() {
        const container = document.getElementById('checkout-panel');
        if (!container) return;
        container.innerHTML = checkoutPanelTemplate();
        updateCashDisplay();
        const cashInput = document.getElementById('cash-amount');
        if (cashInput) {
            cashInput.addEventListener('input', updateCashDisplay);
            cashInput.addEventListener('change', updateCashDisplay);
        }
        const giftCardInput = document.getElementById('giftcard-code');
        if (giftCardInput) {
            giftCardInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); applyGiftCard(); }
            });
        }
        const statusEl = document.getElementById('payment-status');
        const errorEl = document.getElementById('payment-error');
        if (statusEl) statusEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
    }

    function initCustomCheckoutEvents() {
        document.getElementById('custom-item-name')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('custom-item-price')?.focus();
        });
        document.getElementById('custom-item-price')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('custom-item-qty')?.focus();
        });
        document.getElementById('custom-item-qty')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') addCustomItem();
        });
        document.getElementById('record-search-input')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); searchRecords(); }
        });
        document.getElementById('record-search-input')?.addEventListener('input', e => {
            clearTimeout(recordSearchTimeout);
            const query = e.target.value.trim();
            if (query.length >= 2) {
                recordSearchTimeout = setTimeout(() => { searchRecords(); }, 500);
            } else if (query.length === 0) {
                clearRecordSearch();
            }
        });
        document.addEventListener('cartUpdated', () => { renderCheckoutPanel(); });
    }

    window.searchRecords = async function() {
        const input = document.getElementById('record-search-input');
        const query = input?.value?.trim();
        if (!query) { clearRecordSearch(); return; }

        const resultsContainer = document.getElementById('record-search-results');
        const loadingEl = document.getElementById('record-search-loading');
        const countEl = document.getElementById('record-search-count');
        if (!resultsContainer) return;

        recordSearchLoading = true;
        if (loadingEl) loadingEl.style.display = 'block';
        resultsContainer.innerHTML = '';
        if (countEl) countEl.textContent = '';

        const url = `${API_BASE}/records?search=${encodeURIComponent(query)}&status_ids=2,3,4,5&limit=50`;

        try {
            const response = await fetch(url, {
                credentials: 'include',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.status === 'success') {
                recordSearchResults = data.records || [];
                renderSearchResults(recordSearchResults);
                if (countEl) countEl.textContent = `${recordSearchResults.length} found`;

                if (recordSearchResults.length === 1) {
                    const record = recordSearchResults[0];
                    const price = parseFloat(record.store_price) || 0;
                    if (price > 0) {
                        if (checkDuplicateInCart(record)) {
                            showToast(`⚠️ "${record.artist} - ${record.title}" is already in the cart.`, 'warning');
                        } else {
                            addRecordToCart(record.id);
                            setTimeout(() => clearRecordSearch(), 500);
                        }
                    } else {
                        showToast('⚠️ This record has no price set.', 'warning');
                    }
                }
            } else {
                resultsContainer.innerHTML = `<div style="color:#dc3545;text-align:center;padding:10px;font-size:13px;">Error: ${data.error || 'Search failed'}</div>`;
            }
        } catch (err) {
            console.error('Search error:', err);
            resultsContainer.innerHTML = `<div style="color:#dc3545;text-align:center;padding:10px;font-size:13px;">Error: ${err.message}</div>`;
        } finally {
            recordSearchLoading = false;
            if (loadingEl) loadingEl.style.display = 'none';
        }
    };

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

    function renderSearchResults(records) {
        const container = document.getElementById('record-search-results');
        if (!container) return;
        if (!records || records.length === 0) {
            container.innerHTML = `<div style="color:#999;text-align:center;padding:20px;font-size:13px;">No records found</div>`;
            return;
        }

        let html = '';
        records.forEach((record, index) => {
            const price = record.store_price ? '$' + parseFloat(record.store_price).toFixed(2) : '—';
            const condition = record.sleeve_condition_name || record.condition || 'Unknown';
            const status = record.status_name || 'Unknown';
            const inCart = checkDuplicateInCart(record);
            const dateSold = record.date_sold || '';
            const direction = classifyRecord(record);
            const isReturn = direction === 'return';

            const statusBadge = isReturn
                ? `<span style="background:#dc3545;color:white;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:700;text-transform:uppercase;">${status}</span>`
                : '';

            html += `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid #eee;${index % 2 === 0 ? 'background:#fafafa;' : ''}"
                     onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='${index % 2 === 0 ? '#fafafa' : 'transparent'}'">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;color:#333;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${record.artist || 'Unknown'} - ${record.title || 'Unknown'}
                            ${inCart ? `<span style="color:#ff6b6b;font-size:11px;margin-left:6px;">(in cart)</span>` : ''}
                            ${statusBadge}
                        </div>
                        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:#666;margin-top:2px;">
                            <span><strong>ID:</strong> ${record.id}</span>
                            ${record.barcode ? `<span><strong>Barcode:</strong> ${record.barcode}</span>` : ''}
                            <span><strong>Cond:</strong> ${condition}</span>
                            ${dateSold ? `<span><strong>Sold:</strong> ${dateSold}</span>` : ''}
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                        <span style="font-weight:bold;color:${isReturn ? '#dc3545' : '#28a745'};font-size:14px;">${price}</span>
                        ${inCart
                            ? `<span style="color:#ff6b6b;font-size:12px;font-weight:600;">In cart</span>`
                            : `<button onclick="addRecordToCart(${record.id})" style="padding:4px 12px;background:${isReturn ? '#dc3545' : '#28a745'};color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;">
                                  <i class="fas fa-cart-plus"></i> ${isReturn ? 'Return' : 'Add'}
                               </button>`
                        }
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    window.clearRecordSearch = function() {
        const input = document.getElementById('record-search-input');
        if (input) input.value = '';
        const container = document.getElementById('record-search-results');
        if (container) {
            container.innerHTML = `<div style="color:#999;text-align:center;padding:20px;font-size:13px;">Enter a search term above</div>`;
        }
        const countEl = document.getElementById('record-search-count');
        if (countEl) countEl.textContent = '';
        recordSearchResults = [];
    };

    window.addRecordToCart = function(recordId, quantity = 1) {
        if (!isAdmin()) { showToast('🔒 Admin access required.', 'error'); return; }
        const record = recordSearchResults.find(r => r.id === recordId);
        if (!record) { showToast('⚠️ Record not found in search results.', 'warning'); return; }
        if (typeof window.cart === 'undefined' || !window.cart.addItem) {
            showToast('❌ Cart system not available.', 'error'); return;
        }
        const price = parseFloat(record.store_price) || 0;
        if (price <= 0) { showToast('⚠️ This record has no price set.', 'warning'); return; }
        if (checkDuplicateInCart(record)) {
            showToast(`⚠️ "${record.artist} - ${record.title}" is already in the cart.`, 'warning'); return;
        }

        const direction = classifyRecord(record);
        const isReturn = direction === 'return';

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
                original_id: record.id,
                direction: direction,
                return_to_stock: isReturn ? returnToStockDefault : undefined
            };
            window.cart.addItem(item);
        }
        const total = price * quantity;
        showToast(
            isReturn
                ? `↩️ Added return: ${quantity}x "${record.artist} - ${record.title}" (-$${total.toFixed(2)})`
                : `✅ Added ${quantity}x "${record.artist} - ${record.title}" ($${total.toFixed(2)})`,
            isReturn ? 'warning' : 'success'
        );
        renderCheckoutPanel();
        if (typeof window.updateCartBadge === 'function') window.updateCartBadge();
    };

    window.addCustomItem = function() {
        if (!isAdmin()) {
            showStatus(document.getElementById('custom-checkout-status'), '🔒 Admin access required.', 'error');
            return;
        }
        const nameInput = document.getElementById('custom-item-name');
        const priceInput = document.getElementById('custom-item-price');
        const qtyInput = document.getElementById('custom-item-qty');
        const statusEl = document.getElementById('custom-checkout-status');

        const name = nameInput?.value?.trim();
        const price = parseFloat(priceInput?.value);
        const qty = parseInt(qtyInput?.value) || 1;

        if (!name) { showStatus(statusEl, '⚠️ Please enter an item name.', 'warning'); nameInput?.focus(); return; }
        if (!price || price <= 0) { showStatus(statusEl, '⚠️ Please enter a valid price.', 'warning'); priceInput?.focus(); return; }
        if (typeof window.cart === 'undefined' || !window.cart.addItem) {
            showStatus(statusEl, '❌ Cart system not available.', 'error'); return;
        }

        const isReturn = customItemMode === 'return';
        for (let i = 0; i < qty; i++) {
            const item = {
                id: 'custom_' + (isReturn ? 'ret_' : '') + Date.now() + '_' + i,
                type: 'custom',
                title: name + (qty > 1 ? ` (${i+1}/${qty})` : ''),
                artist: isReturn ? 'Custom Return' : 'Custom Item',
                price: price,
                quantity: 1,
                direction: isReturn ? 'return' : 'sale',
                options: { isCustom: true, isReturn }
            };
            window.cart.addItem(item);
        }
        const total = price * qty;
        showStatus(
            statusEl,
            isReturn ? `↩️ Added ${qty}x return "${name}" (-$${total.toFixed(2)})` : `✅ Added ${qty}x "${name}" ($${total.toFixed(2)})`,
            isReturn ? 'warning' : 'success'
        );
        if (nameInput) nameInput.value = '';
        if (priceInput) priceInput.value = '';
        if (qtyInput) qtyInput.value = '1';
        nameInput?.focus();
        renderCheckoutPanel();
        if (typeof window.updateCartBadge === 'function') window.updateCartBadge();
    };

    window.addBernieItem = function() {
        if (!isAdmin()) { showToast('🔒 Admin access required.'); return; }
        if (typeof window.cart === 'undefined' || !window.cart.addItem) {
            showStatus(document.getElementById('custom-checkout-status'), '❌ Cart system not available.', 'error'); return;
        }
        const item = {
            id: 'bernie_' + Date.now(),
            type: 'bernie',
            title: 'Bernie Campaign Donation',
            artist: 'Bernie Sanders',
            price: 0.99,
            quantity: 1,
            direction: 'sale',
            options: { isBernie: true }
        };
        window.cart.addItem(item);
        renderCheckoutPanel();
        if (typeof window.updateCartBadge === 'function') window.updateCartBadge();
        showToast('🌹 Added Bernie donation ($0.99) to cart!');
    };

    window.removeCartItem = function(itemId) {
        if (typeof window.cart !== 'undefined') {
            window.cart.removeItem(itemId);
            renderCheckoutPanel();
        }
    };

    window.clearCart = function() {
        if (confirm('Clear the entire cart (sales + returns)?')) {
            if (typeof window.cart !== 'undefined') {
                window.cart.clear();
                cashReceived = 0;
                giftCardApplied = 0;
                outstandingBalance = 0;
                paymentEntries = [];
                discountPercent = 0;
                discountAmount = 0;
                posPendingAmount = 0;
                posAwaitingManualComplete = false;
                renderCheckoutPanel();
            }
        }
    };

    window.applyGiftCard = async function() {
        const input = document.getElementById('giftcard-code');
        const statusEl = document.getElementById('giftcard-status');
        const code = (input?.value || '').trim().toUpperCase();
        if (!code) { if (statusEl) { statusEl.textContent = '⚠️ Enter a gift card code'; statusEl.style.color = '#856404'; } return; }

        const totals = computeTotals();
        const remaining = Math.max(0, totals.netTotal - giftCardApplied - cashReceived);
        if (remaining <= 0.01) { if (statusEl) { statusEl.textContent = '✅ Nothing left to cover'; statusEl.style.color = '#28a745'; } return; }

        if (statusEl) { statusEl.textContent = '⏳ Checking balance...'; statusEl.style.color = '#666'; }

        let balance = 0;
        try {
            const balRes = await fetch(`${API_BASE}/api/gift-card/balance/${encodeURIComponent(code)}`, {
                credentials: 'include', headers: { 'Content-Type': 'application/json' }
            });
            const balData = await balRes.json();
            if (balData.status !== 'success') {
                if (statusEl) { statusEl.textContent = `❌ ${balData.error || 'Card not found'}`; statusEl.style.color = '#dc3545'; }
                return;
            }
            balance = parseFloat(balData.balance) || 0;
            if (balance <= 0) {
                if (statusEl) { statusEl.textContent = '❌ Card has no balance'; statusEl.style.color = '#dc3545'; }
                return;
            }
        } catch (err) {
            if (statusEl) { statusEl.textContent = `❌ Error: ${err.message}`; statusEl.style.color = '#dc3545'; }
            return;
        }

        const amountToApply = Math.min(balance, remaining);
        const amountToApplyRounded = Math.round(amountToApply * 100) / 100;

        if (statusEl) { statusEl.textContent = `⏳ Redeeming $${amountToApplyRounded.toFixed(2)}...`; statusEl.style.color = '#666'; }

        try {
            const redeemRes = await fetch(`${API_BASE}/api/gift-card/redeem`, {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code, purchase_amount: amountToApplyRounded })
            });
            const redeemData = await redeemRes.json();
            if (redeemData.status !== 'success') {
                if (statusEl) { statusEl.textContent = `❌ ${redeemData.error || 'Redemption failed'}`; statusEl.style.color = '#dc3545'; }
                return;
            }
            const applied = parseFloat(redeemData.applied_amount) || amountToApplyRounded;
            giftCardApplied += applied;
            if (input) input.value = '';
            renderCheckoutPanel();
            setTimeout(() => selectPaymentMethod(selectedPaymentMethod), 50);
            setTimeout(() => {
                const newStatus = document.getElementById('giftcard-status');
                if (newStatus) {
                    newStatus.textContent = `✅ Applied $${applied.toFixed(2)} from ${code}. Remaining: $${(parseFloat(redeemData.new_balance) || 0).toFixed(2)}`;
                    newStatus.style.color = '#28a745';
                }
            }, 120);
        } catch (err) {
            if (statusEl) { statusEl.textContent = `❌ Error: ${err.message}`; statusEl.style.color = '#dc3545'; }
        }
    };

    async function checkSquareAvailability() {
        try {
            const response = await fetch(`${API_BASE}/api/square/terminals`, {
                credentials: 'include', headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) { squareAvailable = false; availableTerminals = []; return false; }
            const data = await response.json();
            if (data.status === 'success' && data.terminals && data.terminals.length > 0) {
                squareAvailable = true;
                availableTerminals = data.terminals;
                const statusText = document.getElementById('pos-status-text');
                if (statusText) { statusText.innerHTML = `✅ ${availableTerminals.length} terminal(s) available`; statusText.style.color = '#28a745'; }
                return true;
            } else {
                squareAvailable = false; availableTerminals = [];
                const statusText = document.getElementById('pos-status-text');
                if (statusText) { statusText.innerHTML = '❌ No terminals available'; statusText.style.color = '#dc3545'; }
                return false;
            }
        } catch { squareAvailable = false; availableTerminals = []; return false; }
    }

    window.sendToPos = async function() {
        if (posInProgress) { showToast('⏳ POS request already in progress...', 'warning'); return; }
        const totals = computeTotals();
        if (totals.netTotal <= 0) { showToast('Nothing to send to POS (net is 0 or refund).', 'warning'); return; }
        const available = await checkSquareAvailability();
        if (!available || !availableTerminals || availableTerminals.length === 0) {
            showToast('No POS terminals available.', 'error'); return;
        }
        let deviceId = availableTerminals[0]?.id;
        if (!deviceId) { showToast('No POS terminal ID found.', 'error'); return; }
        if (deviceId.startsWith('device:')) deviceId = deviceId.substring(7);

        const saleItems = getSaleItems();
        const recordIds = saleItems.filter(i => i.type === 'record' && i.original_id).map(i => i.original_id);
        const titles = saleItems.map(i => i.title || 'Item');

        const payload = {
            amount_cents: Math.round(totals.netTotal * 100),
            record_ids: recordIds.length > 0 ? recordIds : ['1'],
            record_titles: titles.length > 0 ? titles : ['Item'],
            reference_id: 'pos_' + Date.now(),
            device_id: deviceId
        };

        posInProgress = true;
        posPendingAmount = totals.netTotal;
        posAwaitingManualComplete = false;
        const sendBtn = document.getElementById('send-to-pos-btn');
        if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }
        showPosModal('Sending request to terminal...', false);

        try {
            const response = await fetch(`${API_BASE}/api/square/terminal/checkout`, {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.status === 401 || response.status === 403) throw new Error('Authentication failed.');
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.status === 'success' && data.checkout) {
                const checkoutId = data.checkout.id;
                posCheckoutId = checkoutId;
                posAwaitingManualComplete = true;
                const pendingNote = document.getElementById('pos-pending-note');
                if (pendingNote) pendingNote.style.display = 'block';
                showPosModal('Payment request sent. Waiting for terminal...', false);

                waitForPosCompletion(checkoutId).then((completed) => {
                    posInProgress = false;
                    posAwaitingManualComplete = false;
                    hidePosModal();
                    if (completed) {
                        paymentEntries.push({ method: 'POS Terminal', amount: posPendingAmount });
                        cashReceived += posPendingAmount;
                        posPendingAmount = 0;
                        renderCheckoutPanel();
                        setTimeout(() => selectPaymentMethod(selectedPaymentMethod), 50);
                    }
                }).catch((err) => {
                    posInProgress = false;
                    posAwaitingManualComplete = false;
                    console.warn('POS polling ended:', err.message);
                    const pendingNote = document.getElementById('pos-pending-note');
                    if (pendingNote) {
                        pendingNote.style.display = 'block';
                        pendingNote.innerHTML = `⚠️ POS did not confirm. Retry, or click Complete to force close as paid.`;
                    }
                    const btn = document.getElementById('send-to-pos-btn');
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send to POS'; }
                });
                if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send to POS (again)'; }
                return true;
            }
            throw new Error(data.message || data.error || 'Failed to create POS checkout');
        } catch (err) {
            posInProgress = false; posPendingAmount = 0; posAwaitingManualComplete = false;
            console.error('Send to POS error:', err);
            showPosModal(err.message || 'POS request failed.', true);
            if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send to POS'; }
            return false;
        }
    };

    window.executePayment = async function() {
        if (isProcessingPayment) { showToast('⏳ Payment already in progress...', 'warning'); return; }

        const saleItems = getSaleItems();
        const returnItems = getReturnItems();
        const totals = computeTotals();

        if (saleItems.length === 0 && returnItems.length === 0) {
            showPaymentError('Cart is empty. Add items before checking out.'); return;
        }

        if (selectedPaymentMethod === 'cash' && totals.netTotal > 0.01) {
            const cashInput = document.getElementById('cash-amount');
            const typedCash = parseFloat(cashInput?.value) || 0;
            if (typedCash > 0) {
                paymentEntries = paymentEntries.filter(e => e.method !== 'Cash');
                const stillOwed = Math.max(0, totals.netTotal - giftCardApplied);
                cashReceived = Math.min(typedCash, stillOwed);
                paymentEntries.push({ method: 'Cash', amount: cashReceived });
            }
        }

        if (selectedPaymentMethod === 'pos' && posPendingAmount > 0 && posAwaitingManualComplete) {
            if (posPollInterval) { clearInterval(posPollInterval); posPollInterval = null; }
            paymentEntries.push({ method: 'POS Terminal (forced)', amount: posPendingAmount });
            cashReceived += posPendingAmount;
            posPendingAmount = 0;
            posAwaitingManualComplete = false;
            posInProgress = false;
            hidePosModal();
        }

        if (returnItems.length === 0) {
            return submitOrderWithPayments(saleItems);
        }
        return submitReturnOrMixed(saleItems, returnItems);
    };

    async function submitOrderWithPayments(saleItems) {
        isProcessingPayment = true;
        const statusEl = document.getElementById('payment-status');
        const statusText = document.getElementById('payment-status-text');
        const btn = document.getElementById('payment-execute-btn');
        const totals = computeTotals();

        let entries = paymentEntries.length > 0 ? [...paymentEntries] : [];
        const entriesSum = entries.reduce((s, e) => s + (e.amount || 0), 0);
        const totalCovered = entriesSum + giftCardApplied;
        const shortfall = Math.round((totals.saleTotal - totalCovered) * 100) / 100;
        if (Math.abs(shortfall) > 0.01 && shortfall > 0) {
            const methodLabel = { cash: 'Cash', card: 'Card (Square)', pos: 'POS Terminal (forced)' }[selectedPaymentMethod] || 'Other';
            entries.push({ method: methodLabel, amount: shortfall });
        }

        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = '#cce5ff';
            statusEl.style.color = '#004085';
            statusEl.style.border = '1px solid #b8daff';
            if (statusText) statusText.textContent = 'Processing payment...';
        }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Processing...'; btn.style.opacity = '0.6'; }

        try {
            const recordIds = saleItems.filter(i => i.type === 'record' && i.original_id).map(i => i.original_id);
            const notesEntries = [...entries];
            if (giftCardApplied > 0) notesEntries.unshift({ method: 'Gift Card', amount: giftCardApplied });
            const notesString = `Admin checkout - ${currentUserName} - Payment entries: ${notesEntries.map(e => `${e.method}: $${e.amount.toFixed(2)}`).join(', ')}`;

            const orderData = {
                items: window.cart.getCheckoutPayload().filter(i => (i.direction || 'sale') === 'sale'),
                subtotal: totals.saleSub,
                tax: totals.saleTax,
                total: totals.saleTotal,
                shipping: { method: 'pickup', amount: 0 },
                customer_name: currentUserName + ' (Admin)',
                customer_email: '',
                notes: notesString,
                payment_entries: entries,
                source: 'admin_checkout',
                record_ids: recordIds,
                discount_percent: discountPercent,
                discount_amount: discountAmount,
                cash_received: cashReceived,
                gift_card_applied: giftCardApplied,
                remaining_balance: 0
            };

            const result = await submitOrder(orderData);
            if (result.success) {
                lastOrderId = result.orderId;
                try {
                    const receiptText = buildReceiptText(saleItems, [], entries, totals.saleTotal, result.orderId);
                    const filename = buildReceiptFilename();
                    downloadReceipt(receiptText, filename);
                } catch (receiptErr) {
                    console.error('❌ Receipt generation failed:', receiptErr);
                    showToast('⚠️ Receipt could not be downloaded: ' + receiptErr.message, 'warning');
                }
                window.cart.clear();
                cashReceived = 0; giftCardApplied = 0; outstandingBalance = 0;
                paymentEntries = []; discountPercent = 0; discountAmount = 0;
                posPendingAmount = 0; posAwaitingManualComplete = false;
                isPaymentComplete = true;
                renderCheckoutPanel();
                if (statusEl) {
                    statusEl.style.background = '#d4edda';
                    statusEl.style.color = '#155724';
                    statusEl.style.border = '1px solid #c3e6cb';
                    if (statusText) statusText.textContent = '✅ Payment successful! Order complete.';
                }
                showToast('🎉 Payment successful! Receipt downloaded.', 'success');
            }
        } catch (err) {
            console.error('Payment error:', err);
            showPaymentError(err.message || 'Payment failed. Please try again.');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> Complete Payment'; btn.style.opacity = '1'; }
            isProcessingPayment = false;
        }
    }

    async function submitReturnOrMixed(saleItems, returnItems) {
        isProcessingPayment = true;
        const statusEl = document.getElementById('payment-status');
        const statusText = document.getElementById('payment-status-text');
        const btn = document.getElementById('payment-execute-btn');
        const totals = computeTotals();

        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = '#cce5ff';
            statusEl.style.color = '#004085';
            statusEl.style.border = '1px solid #b8daff';
            if (statusText) statusText.textContent = (returnItems.length && saleItems.length) ? 'Processing combined transaction...' : 'Processing return...';
        }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Processing...'; btn.style.opacity = '0.6'; }

        try {
            const salePayload = saleItems.map(i => ({
                id: i.id, type: i.type, title: i.title, artist: i.artist,
                price: Number(i.price) || 0, quantity: Number(i.quantity) || 1,
                original_id: i.original_id, condition: i.condition, direction: 'sale'
            }));
            const returnPayload = returnItems.map(i => ({
                id: i.id, type: i.type, title: i.title, artist: i.artist,
                price: Number(i.price) || 0, quantity: Number(i.quantity) || 1,
                original_id: i.original_id, condition: i.condition,
                direction: 'return', return_to_stock: i.return_to_stock !== false
            }));

            const transactionType = saleItems.length > 0 ? 'mixed' : 'return';

            const basePayload = {
                transaction_type: transactionType,
                sale_items: salePayload,
                return_items: returnPayload,
                customer_name: currentUserName + ' (Admin)',
                refund_method: 'cash',
                discount_percent: discountPercent,
                discount_amount: discountAmount,
                sale_tax: totals.saleTax,
                return_tax: totals.returnTax
            };

            const processRes = await fetch(`${API_BASE}/api/returns/process`, {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(basePayload)
            });
            const processData = await processRes.json();
            if (!processRes.ok || processData.status !== 'success') {
                throw new Error(processData.error || `Process failed (HTTP ${processRes.status})`);
            }

            const completePayload = Object.assign({}, basePayload, {
                return_id: processData.return_id,
                order_id: processData.order_id,
                order_number: processData.order_number,
                return_number: processData.return_number
            });
            const completeRes = await fetch(`${API_BASE}/api/returns/complete`, {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(completePayload)
            });
            const completeData = await completeRes.json();
            if (!completeRes.ok || completeData.status !== 'success') {
                throw new Error(completeData.error || `Complete failed (HTTP ${completeRes.status})`);
            }

            try {
                const receiptText = buildReceiptText(saleItems, returnItems, paymentEntries, totals.netTotal, completeData.order_id || completeData.return_id);
                const filename = buildReceiptFilename();
                downloadReceipt(receiptText, filename);
            } catch (receiptErr) {
                console.error('❌ Receipt generation failed:', receiptErr);
                showToast('⚠️ Receipt could not be downloaded: ' + receiptErr.message, 'warning');
            }

            window.cart.clear();
            cashReceived = 0; giftCardApplied = 0; outstandingBalance = 0;
            paymentEntries = []; discountPercent = 0; discountAmount = 0;
            posPendingAmount = 0; posAwaitingManualComplete = false;
            isPaymentComplete = true;
            renderCheckoutPanel();

            if (statusEl) {
                statusEl.style.background = '#d4edda';
                statusEl.style.color = '#155724';
                statusEl.style.border = '1px solid #c3e6cb';
                if (statusText) statusText.textContent = completeData.refunded
                    ? `✅ Return complete. Refunded $${completeData.refunded_amount.toFixed(2)}.`
                    : `✅ Transaction complete.`;
            }
            showToast(
                completeData.refunded
                    ? `↩️ Return complete. Refunded $${completeData.refunded_amount.toFixed(2)} in cash.`
                    : `🎉 Transaction complete!`,
                'success'
            );
        } catch (err) {
            console.error('Return error:', err);
            showPaymentError(err.message || 'Return failed. Please try again.');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> Complete'; btn.style.opacity = '1'; }
            isProcessingPayment = false;
        }
    }

    function buildReceiptText(saleItems, returnItems, entries, netTotal, transactionId) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const storeName = storeSettings.STORE_NAME || 'PigStyle Music';
        const storeAddress = storeSettings.STORE_ADDRESS || '';
        const storePhone = storeSettings.STORE_PHONE || '';
        const footer = storeSettings.RECEIPT_FOOTER || 'Thank you!';

        const saleSub = saleItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
        const returnSub = returnItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
        const saleTax = calculateTax(saleSub);
        const returnTax = calculateTax(returnSub);

        let discTotal = 0;
        if (discountPercent > 0) discTotal = (saleSub + saleTax) * (discountPercent / 100);
        else if (discountAmount > 0) discTotal = Math.min(discountAmount, saleSub + saleTax);

        const saleTotal = Math.max(0, saleSub + saleTax - discTotal);
        const returnTotal = returnSub + returnTax;
        const finalNet = typeof netTotal === 'number' ? netTotal : saleTotal - returnTotal;

        let r = '';
        r += `${storeName}\n`;
        if (storeAddress) r += `${storeAddress}\n`;
        if (storePhone) r += `${storePhone}\n`;
        r += '====================================\n';
        r += `${dateStr}  ${timeStr}\n`;
        if (transactionId) r += `Txn: ${transactionId}\n`;
        r += '\n';

        function fmtLine(desc, qty, price, lineTotal, tag) {
            const maxDescLen = 38;
            let d = (tag ? `[${tag}] ` : '') + desc;
            if (d.length > maxDescLen) d = d.substring(0, maxDescLen - 1) + '…';
            const qtyStr = qty > 1 ? `${qty}x ` : '';
            let out = `${d}\n`;
            out += `    ${qtyStr}@ $${price.toFixed(2)}${' '.repeat(Math.max(1, 30 - qtyStr.length - price.toFixed(2).length))}$${lineTotal.toFixed(2)}\n`;
            return out;
        }

        if (saleItems.length > 0) {
            r += 'SALES:\n------------------------------------\n';
            saleItems.forEach(item => {
                const qty = item.quantity || 1;
                const price = item.price || 0;
                let desc, tag = '';
                if (item.type === 'bernie') { tag = 'Bernie'; desc = item.title || 'Donation'; }
                else if (item.type === 'custom') { tag = 'Custom'; desc = item.title || 'Custom Item'; }
                else { desc = `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`; }
                r += fmtLine(desc, qty, price, qty * price, tag);
            });
            r += '------------------------------------\n';
            r += `Subtotal:${' '.repeat(20)}$${saleSub.toFixed(2)}\n`;
            if (saleTax > 0) r += `Tax (${(TAX_RATE * 100).toFixed(2)}%):${' '.repeat(Math.max(1, 20 - (TAX_RATE * 100).toFixed(2).length))}$${saleTax.toFixed(2)}\n`;
            if (discTotal > 0) r += `Discount:${' '.repeat(18)}-$${discTotal.toFixed(2)}\n`;
            r += `Sale Total:${' '.repeat(18)}$${saleTotal.toFixed(2)}\n\n`;
        }

        if (returnItems.length > 0) {
            r += 'RETURNS:\n------------------------------------\n';
            returnItems.forEach(item => {
                const qty = item.quantity || 1;
                const price = item.price || 0;
                let desc;
                if (item.type === 'custom') desc = item.title || 'Custom Return';
                else desc = `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`;
                r += fmtLine(desc, qty, price, qty * price, 'Return');
            });
            r += '------------------------------------\n';
            r += `Return Subtotal:${' '.repeat(13)}-$${returnSub.toFixed(2)}\n`;
            if (returnTax > 0) r += `Return Tax:${' '.repeat(18)}-$${returnTax.toFixed(2)}\n`;
            r += `Return Total:${' '.repeat(16)}-$${returnTotal.toFixed(2)}\n\n`;
        }

        r += '====================================\n';
        if (finalNet < -0.01) {
            r += `NET REFUND:${' '.repeat(18)}-$${Math.abs(finalNet).toFixed(2)}\n`;
            r += `Refund Method: CASH\n`;
        } else if (finalNet > 0.01) {
            r += `NET DUE:${' '.repeat(21)}$${finalNet.toFixed(2)}\n\nPAYMENT:\n------------------------------------\n`;
            let totalPaid = 0;
            entries.forEach(entry => {
                const label = entry.method || 'Payment';
                r += `${label}${' '.repeat(Math.max(1, 28 - label.length))}$${entry.amount.toFixed(2)}\n`;
                totalPaid += entry.amount;
            });
            if (Math.abs(totalPaid - finalNet) > 0.01) {
                if (totalPaid < finalNet) r += `Unpaid:${' '.repeat(21)}$${(finalNet - totalPaid).toFixed(2)}\n`;
                else r += `Change:${' '.repeat(21)}$${(totalPaid - finalNet).toFixed(2)}\n`;
            }
        } else {
            r += `NET: $0.00\n`;
        }
        r += '\n' + `${footer}\n\nServed by: ${currentUserName}\n\n\n\n`;
        return r;
    }

    function buildReceiptFilename() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        return `receipt_${y}${m}${d}_${hh}${mm}${ss}.txt`;
    }

    function downloadReceipt(text, filename) {
        filename = filename || 'receipt.txt';
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function submitOrder(orderData) {
        console.log('📦 Submitting sale order:', orderData);
        const response = await fetch(`${API_BASE}/api/checkout/process`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}`);
        }
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || 'Order submission failed.');

        const completeRes = await fetch(`${API_BASE}/api/order/complete`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: data.order_id, transaction_id: 'admin_checkout_' + Date.now() })
        });
        const completeBody = await completeRes.json().catch(() => ({}));
        if (!completeRes.ok) {
            throw new Error(`Order complete failed (HTTP ${completeRes.status}): ${completeBody.error || completeBody.message || 'unknown error'}`);
        }
        return { success: true, orderId: data.order_id };
    }

    function showPaymentError(message) {
        const errorEl = document.getElementById('payment-error');
        const errorText = document.getElementById('payment-error-text');
        const statusEl = document.getElementById('payment-status');
        if (statusEl) statusEl.style.display = 'none';
        if (errorEl && errorText) { errorText.textContent = message; errorEl.style.display = 'block'; }
        const btn = document.getElementById('payment-execute-btn');
        if (btn && !btn.disabled) btn.innerHTML = '<i class="fas fa-check-circle"></i> Complete';
        isProcessingPayment = false;
    }

    function showPosModal(message, isError) {
        const modal = document.getElementById('pos-modal');
        const statusEl = document.getElementById('pos-modal-status');
        const errorEl = document.getElementById('pos-modal-error');
        const retryBtn = document.getElementById('pos-retry-btn');
        const controls = document.getElementById('pos-controls');
        if (modal) modal.style.display = 'flex';
        if (statusEl) statusEl.textContent = message;
        if (controls) controls.style.display = 'flex';
        if (isError) {
            if (errorEl) { errorEl.style.display = 'block'; errorEl.textContent = message; }
            if (retryBtn) retryBtn.style.display = 'inline-block';
        } else {
            if (errorEl) errorEl.style.display = 'none';
            if (retryBtn) retryBtn.style.display = 'none';
        }
    }

    window.hidePosModal = function() {
        const modal = document.getElementById('pos-modal');
        if (modal) modal.style.display = 'none';
    };

    window.cancelPosPayment = async function() {
        const cancelId = posCheckoutId;
        if (posPollInterval) { clearInterval(posPollInterval); posPollInterval = null; }
        posInProgress = false; posCheckoutId = null; posAwaitingManualComplete = false; isProcessingPayment = false;
        window.hidePosModal();
        const controls = document.getElementById('pos-controls');
        if (controls) controls.style.display = 'none';
        const statusEl = document.getElementById('payment-status');
        const errorEl = document.getElementById('payment-error');
        if (statusEl) statusEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
        const execBtn = document.getElementById('payment-execute-btn');
        if (execBtn) { execBtn.disabled = false; execBtn.innerHTML = '<i class="fas fa-check-circle"></i> Complete'; execBtn.style.opacity = '1'; }
        if (cancelId) {
            try {
                const response = await fetch(`${API_BASE}/api/square/terminal/checkout/${cancelId}/cancel`, {
                    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }
                });
                if (response.ok) showToast('POS payment cancelled.', 'warning');
                else showToast('Failed to cancel POS payment.', 'error');
            } catch { showToast('Error cancelling POS payment.', 'error'); }
        } else {
            showToast('POS payment cancelled.', 'warning');
        }
        renderCheckoutPanel();
        setTimeout(() => selectPaymentMethod(selectedPaymentMethod), 50);
    };

    window.retryPosPayment = function() {
        const statusEl = document.getElementById('payment-status');
        const errorEl = document.getElementById('payment-error');
        if (statusEl) statusEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
        const btn = document.getElementById('payment-execute-btn');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> Complete'; btn.style.opacity = '1'; }
        window.hidePosModal();
        window.sendToPos();
    };

    function waitForPosCompletion(checkoutId, timeout = 120000) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = timeout / 2000;
            let lastStatus = '';
            if (posPollInterval) { clearInterval(posPollInterval); posPollInterval = null; }
            posPollInterval = setInterval(async () => {
                attempts++;
                try {
                    const response = await fetch(`${API_BASE}/api/square/terminal/checkout/${checkoutId}/status`, {
                        credentials: 'include', headers: { 'Content-Type': 'application/json' }
                    });
                    if (!response.ok) return;
                    const data = await response.json();
                    if (data.status !== 'success' || !data.checkout) return;
                    const status = data.checkout.status;
                    if (status !== lastStatus) { lastStatus = status; showPosModal(`POS status: ${status}...`, false); }
                    if (status === 'COMPLETED') { clearInterval(posPollInterval); posPollInterval = null; resolve(true); }
                    else if (status === 'CANCELED') { clearInterval(posPollInterval); posPollInterval = null; reject(new Error('Canceled')); }
                    else if (status === 'FAILED') { clearInterval(posPollInterval); posPollInterval = null; reject(new Error('Failed')); }
                    if (attempts >= maxAttempts) { clearInterval(posPollInterval); posPollInterval = null; reject(new Error('Timed out')); }
                } catch (err) { if (attempts > 5) console.error('POS polling failed:', err); }
            }, 2000);
        });
    }

    function showStatus(el, message, type = 'info') {
        if (!el) return;
        el.style.display = 'block';
        el.textContent = message;
        const colors = {
            success: '#d4edda; color: #155724; border: 1px solid #c3e6cb;',
            error:   '#f8d7da; color: #721c24; border: 1px solid #f5c6cb;',
            warning: '#fff3cd; color: #856404; border: 1px solid #ffeeba;',
            info:    '#cce5ff; color: #004085; border: 1px solid #b8daff;'
        };
        el.style.background = colors[type] || colors.info;
        el.style.border = '1px solid';
        el.style.padding = '12px';
        el.style.borderRadius = '8px';
        el.style.fontWeight = '500';
        clearTimeout(el._timeout);
        el._timeout = setTimeout(() => { el.style.display = 'none'; }, 4000);
    }

    function showToast(message, type = 'success') {
        const existing = document.querySelector('.custom-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'custom-toast';
        const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8';
        const textColor = type === 'warning' ? '#333' : 'white';
        toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; padding: 12px 24px;
            border-radius: 8px; background: ${bgColor}; color: ${textColor};
            font-weight: 600; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 400px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    document.addEventListener('cartUpdated', () => { renderCheckoutPanel(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderCheckoutPanel(); });

    console.log('✅ Custom Checkout module initialized (status-aware, truncated cart titles, journal_entries_simple)');
})();