// ============================================================
// CONFIRMATION - Handles post-payment confirmation
// ============================================================

(function() {
    'use strict';

    console.log('✅ Confirmation module loaded');

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    // ===== SHOW CONFIRMATION SCREEN =====
    window.showConfirmationScreen = function(orderId, paymentId) {
        console.log('🔵 Showing confirmation screen for order:', orderId);
        
        // Show the confirmation page
        if (typeof showPage === 'function') {
            showPage('confirmation');
        } else {
            console.error('showPage function not found');
            return;
        }
        
        // Reset all states
        const loadingEl = document.getElementById('confirmation-loading');
        const successEl = document.getElementById('confirmation-success');
        const errorEl = document.getElementById('confirmation-error');
        
        if (loadingEl) loadingEl.style.display = 'block';
        if (successEl) successEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
        
        // Call the order complete endpoint
        fetch(`${API_BASE}/api/order/complete`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_id: orderId,
                transaction_id: paymentId || 'square_' + Date.now()
            })
        })
        .then(res => {
            console.log('📥 Order complete response status:', res.status);
            return res.json();
        })
        .then(data => {
            console.log('📥 Order complete data:', data);
            
            // Hide loading
            if (loadingEl) loadingEl.style.display = 'none';
            
            if (data.status === 'success') {
                // Show success
                if (successEl) successEl.style.display = 'block';
                
                // Fill in order details
                const orderNumberEl = document.getElementById('conf-order-number');
                const orderTotalEl = document.getElementById('conf-order-total');
                const orderItemsEl = document.getElementById('conf-order-items');
                const recordsSoldEl = document.getElementById('conf-records-sold');
                
                if (orderNumberEl) orderNumberEl.textContent = data.order_number || 'N/A';
                if (orderTotalEl) orderTotalEl.textContent = '$' + (data.total || 0).toFixed(2);
                if (orderItemsEl) orderItemsEl.textContent = data.item_count || 0;
                if (recordsSoldEl) recordsSoldEl.textContent = data.records_sold || 0;
                
                // Show order items if available
                if (data.items && data.items.length > 0) {
                    const detailsEl = document.getElementById('conf-order-details');
                    const itemsListEl = document.getElementById('conf-order-items-list');
                    if (detailsEl) detailsEl.style.display = 'block';
                    if (itemsListEl) {
                        itemsListEl.innerHTML = data.items.map(item => 
                            `<div style="padding: 4px 0; border-bottom: 1px solid #eee;">${item.artist || ''} - ${item.title || ''} ($${item.price || 0})</div>`
                        ).join('');
                    }
                }
                
                // Clear the cart
                if (window.cart) {
                    window.cart.clear();
                }
                if (typeof window.renderCart === 'function') {
                    window.renderCart();
                }
                if (typeof window.updateCartBadge === 'function') {
                    window.updateCartBadge();
                }
                
                // Clean URL (remove query params)
                window.history.replaceState({}, document.title, window.location.pathname);
                
                // Show toast
                if (typeof window.showToast === 'function') {
                    window.showToast('🎉 Order complete! Thank you!', 'success');
                }
                
            } else {
                // Show error
                if (errorEl) errorEl.style.display = 'block';
                const errorMsgEl = document.getElementById('conf-error-message');
                if (errorMsgEl) {
                    errorMsgEl.textContent = data.error || 'Unknown error occurred. Please contact support.';
                }
            }
        })
        .catch(err => {
            console.error('❌ Order complete error:', err);
            
            // Hide loading, show error
            if (loadingEl) loadingEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'block';
            const errorMsgEl = document.getElementById('conf-error-message');
            if (errorMsgEl) {
                errorMsgEl.textContent = err.message || 'Network error. Please try again.';
            }
        });
    };

    // ===== CHECK FOR SQUARE RETURN ON APP LOAD =====
    window.checkSquareReturn = function() {
        console.log('🔵 [APP] Checking for Square return...');
        
        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('status');
        const orderId = urlParams.get('order_id');
        const paymentId = urlParams.get('payment_id');
        
        console.log(`🔵 [APP] status: ${status}, orderId: ${orderId}`);
        
        // Also check for pending order from cart.js
        if (!orderId && window.pendingOrderId) {
            console.log('🔵 Using pendingOrderId from global:', window.pendingOrderId);
            const tempOrderId = window.pendingOrderId;
            const tempPaymentId = window.pendingPaymentId || paymentId;
            // Clear the global
            window.pendingOrderId = null;
            window.pendingPaymentId = null;
            
            if (tempOrderId) {
                window.showConfirmationScreen(tempOrderId, tempPaymentId);
                return;
            }
        }
        
        if (status === 'completed' && orderId) {
            console.log('✅ [APP] Found completed order:', orderId);
            window.showConfirmationScreen(orderId, paymentId);
        }
    };

    console.log('✅ Confirmation module ready');

})();