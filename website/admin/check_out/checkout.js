// ============================================================
// checkout.js - Standalone Checkout Module
// ============================================================

(function() {
    'use strict';

    console.log('🛒 checkout.js loading...');

    // ========== DOM Elements ==========
    const searchInput = document.getElementById('checkout-search-input');
    const searchBtn = document.getElementById('checkout-search-btn');
    const clearBtn = document.getElementById('checkout-clear-btn');
    const customBtn = document.getElementById('checkout-custom-btn');
    const bernieBtn = document.getElementById('checkout-bernie-btn');
    const resultsContainer = document.getElementById('checkout-results-container');
    const resultsCount = document.getElementById('checkout-results-count');
    const cartItemsContainer = document.getElementById('checkout-cart-items');
    const cartCount = document.getElementById('checkout-cart-count');
    const subtotalEl = document.getElementById('checkout-subtotal');
    const taxEl = document.getElementById('checkout-tax');
    const totalEl = document.getElementById('checkout-total');
    const checkoutBtn = document.getElementById('checkout-checkout-btn');
    const clearCartBtn = document.getElementById('checkout-clear-cart-btn');
    const cartSummary = document.getElementById('checkout-cart-summary');
    const statusMessage = document.getElementById('checkout-status-message');

    // Search checkboxes
    const searchBarcode = document.getElementById('search-barcode');
    const searchArtist = document.getElementById('search-artist');
    const searchTitle = document.getElementById('search-title');

    // ========== State ==========
    let cart = [];
    let currentResults = [];
    let isProcessing = false;
    let isInitialized = false;

    // Checkout state
    let checkoutTotal = 0;
    let checkoutRemaining = 0;
    let checkoutPaymentEntries = [];
    let squareAvailable = false;
    let availableTerminals = [];
    let squareCheckoutId = null;
    let squarePollInterval = null;
    let checkoutDebtorData = null;
    let selectedGiftCardCode = null;
    let selectedGiftCardBalance = 0;

    // ========== Helper Functions ==========
    function getBaseUrl() {
        if (typeof AppConfig !== 'undefined' && AppConfig.baseUrl) {
            return AppConfig.baseUrl;
        }
        return '';
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatCurrency(amount) {
        if (amount === undefined || amount === null) return '$0.00';
        return '$' + parseFloat(amount).toFixed(2);
    }

    function getStatusName(statusId) {
        const map = { 1: 'New', 2: 'Active', 3: 'Sold', 4: 'Sold on Discogs', 5: 'Sold Online' };
        return map[statusId] || 'Unknown';
    }

    function showStatus(message, type) {
        if (!statusMessage) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        statusMessage.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        statusMessage.className = 'status-message ' + type;
        statusMessage.style.display = 'block';
        clearTimeout(statusMessage._timeout);
        statusMessage._timeout = setTimeout(function() {
            statusMessage.style.display = 'none';
        }, 5000);
    }

    function getLocalMSTDate() {
        var now = new Date();
        var year = now.getFullYear();
        var month = String(now.getMonth() + 1).padStart(2, '0');
        var day = String(now.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function generateOrderId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ========== API Helpers ==========
    async function apiRequest(method, endpoint, body) {
        const baseUrl = getBaseUrl();
        const options = {
            method: method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(baseUrl + endpoint, options);
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ' on ' + method + ' ' + endpoint);
        }
        return response.json();
    }

    // ========== Search ==========
    function performSearch() {
        const query = searchInput.value.trim();
        if (!query) {
            showStatus('Please enter a search term.', 'warning');
            return;
        }

        const useBarcode = searchBarcode.checked;
        const useArtist = searchArtist.checked;
        const useTitle = searchTitle.checked;

        if (!useBarcode && !useArtist && !useTitle) {
            showStatus('Please select at least one search option.', 'warning');
            return;
        }

        resultsContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#999;"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

        let searchType = 'barcode';
        if (!useBarcode) {
            if (useArtist && useTitle) searchType = 'artist_title';
            else if (useArtist) searchType = 'artist';
            else if (useTitle) searchType = 'title';
        }

        const baseUrl = getBaseUrl();
        let url = baseUrl + '/records?limit=50';

        if (useBarcode) {
            // Barcode search: exact match on barcode OR id
            url = baseUrl + '/records?search=' + encodeURIComponent(query) + '&limit=50';
        } else {
            // Artist/Title search: partial match
            if (useArtist && useTitle) {
                url = baseUrl + '/records?artist=' + encodeURIComponent(query) + '&title=' + encodeURIComponent(query) + '&limit=50';
            } else if (useArtist) {
                url = baseUrl + '/records?artist=' + encodeURIComponent(query) + '&limit=50';
            } else if (useTitle) {
                url = baseUrl + '/records?title=' + encodeURIComponent(query) + '&limit=50';
            }
        }

        // Also include active and new records only (status_id 1 and 2)
        url += '&status_ids=1,2';

        fetch(url, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                let records = data.records || [];

                // If barcode search, filter for exact match on barcode OR id
                if (useBarcode) {
                    const queryLower = query.toLowerCase();
                    records = records.filter(r => {
                        const barcode = (r.barcode || '').toLowerCase();
                        const id = String(r.id || '');
                        return barcode === queryLower || id === queryLower;
                    });
                }

                // Remove already sold records
                records = records.filter(r => r.status_id !== 3 && r.status_id !== 5);

                currentResults = records;
                renderResults(records);
            } else {
                showStatus('Search failed: ' + (data.error || 'Unknown error'), 'error');
                resultsContainer.innerHTML = '<div class="no-results"><i class="fas fa-exclamation-triangle" style="font-size:36px;display:block;margin-bottom:10px;color:#dc3545;"></i><p>Search failed</p></div>';
            }
        })
        .catch(err => {
            console.error('Search error:', err);
            showStatus('Search error: ' + err.message, 'error');
            resultsContainer.innerHTML = '<div class="no-results"><i class="fas fa-exclamation-triangle" style="font-size:36px;display:block;margin-bottom:10px;color:#dc3545;"></i><p>Error searching</p></div>';
        });
    }

    function renderResults(records) {
        if (!records || records.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results"><i class="fas fa-search" style="font-size:36px;display:block;margin-bottom:10px;color:#ccc;"></i><p>No matching records found.</p></div>';
            resultsCount.textContent = '0 results';
            return;
        }

        let html = '<table class="results-table"><thead><tr>';
        html += '<th>ID</th><th>Artist</th><th>Title</th><th>Condition</th><th>Price</th><th>Action</th>';
        html += '</tr></thead><tbody>';

        records.forEach(r => {
            const inCart = cart.some(item => item.id === r.id);
            const price = r.store_price || 0;
            const condition = r.sleeve_condition_name || r.disc_condition_name || 'Unknown';

            html += '<tr>';
            html += '<td class="result-id">#' + r.id + '</td>';
            html += '<td class="result-artist">' + escapeHtml(r.artist || 'Unknown') + '</td>';
            html += '<td class="result-title">' + escapeHtml(r.title || 'Unknown') + '</td>';
            html += '<td><span class="result-condition">' + escapeHtml(condition) + '</span></td>';
            html += '<td class="result-price">' + formatCurrency(price) + '</td>';
            html += '<td>';
            if (inCart) {
                html += '<button class="add-to-cart-btn" disabled style="background:#6c757d;">In Cart</button>';
            } else {
                html += '<button class="add-to-cart-btn" data-id="' + r.id + '" data-artist="' + escapeHtml(r.artist || 'Unknown') + '" data-title="' + escapeHtml(r.title || 'Unknown') + '" data-price="' + price + '" data-condition="' + escapeHtml(condition) + '"><i class="fas fa-plus"></i> Add</button>';
            }
            html += '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        resultsContainer.innerHTML = html;
        resultsCount.textContent = records.length + ' result' + (records.length > 1 ? 's' : '');

        // Add event listeners to "Add" buttons
        resultsContainer.querySelectorAll('.add-to-cart-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                const artist = this.dataset.artist;
                const title = this.dataset.title;
                const price = parseFloat(this.dataset.price);
                const condition = this.dataset.condition;
                addToCart({ id, artist, title, price, condition });
            });
        });
    }

    // ========== Cart Functions ==========
    function addToCart(record) {
        // Check if already in cart
        if (cart.some(item => item.id === record.id)) {
            showStatus('Item already in cart.', 'warning');
            return;
        }

        cart.push({
            id: record.id,
            artist: record.artist,
            title: record.title,
            price: record.price,
            condition: record.condition,
            type: 'record'
        });

        renderCart();
        updateCartSummary();
        showStatus('Added "' + record.artist + ' - ' + record.title + '" to cart.', 'success');
    }

    function removeFromCart(index) {
        const item = cart[index];
        cart.splice(index, 1);
        renderCart();
        updateCartSummary();
        // Re-render results to update "In Cart" status
        if (currentResults.length > 0) {
            renderResults(currentResults);
        }
        showStatus('Removed "' + item.artist + ' - ' + item.title + '" from cart.', 'info');
    }

    function clearCart() {
        if (cart.length === 0) return;
        if (!confirm('Clear all items from cart?')) return;
        cart = [];
        renderCart();
        updateCartSummary();
        if (currentResults.length > 0) {
            renderResults(currentResults);
        }
        showStatus('Cart cleared.', 'info');
    }

    function renderCart() {
        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<div class="empty-cart-message"><i class="fas fa-shopping-cart" style="font-size:36px;display:block;margin-bottom:10px;color:#ccc;"></i><p>Cart is empty. Add items from search results.</p></div>';
            cartCount.textContent = '(0 items)';
            clearCartBtn.style.display = 'none';
            cartSummary.style.display = 'none';
            return;
        }

        let html = '';
        cart.forEach((item, index) => {
            html += '<div class="cart-item">';
            html += '<div class="cart-item-info">';
            html += '<span class="cart-item-title">' + escapeHtml(item.artist) + ' - ' + escapeHtml(item.title);
            html += ' <span class="item-type">' + escapeHtml(item.condition || '') + '</span>';
            html += '</span>';
            html += '</div>';
            html += '<span class="cart-item-price">' + formatCurrency(item.price) + '</span>';
            html += '<button class="cart-item-remove" data-index="' + index + '" title="Remove"><i class="fas fa-times"></i></button>';
            html += '</div>';
        });

        cartItemsContainer.innerHTML = html;
        cartCount.textContent = '(' + cart.length + ' item' + (cart.length > 1 ? 's' : '') + ')';
        clearCartBtn.style.display = 'inline-flex';
        cartSummary.style.display = 'block';

        // Add remove event listeners
        cartItemsContainer.querySelectorAll('.cart-item-remove').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                removeFromCart(index);
            });
        });
    }

    function updateCartSummary() {
        const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
        const tax = subtotal * 0.08;
        const total = subtotal + tax;

        subtotalEl.textContent = formatCurrency(subtotal);
        taxEl.textContent = formatCurrency(tax);
        totalEl.textContent = formatCurrency(total);

        checkoutBtn.disabled = cart.length === 0;
    }

    // ========== Custom Item ==========
    function addBernie() {
        const bernieItem = {
            id: 'bernie_' + Date.now(),
            artist: 'Bernie Sanders',
            title: 'Campaign Donation',
            price: 0.99,
            condition: 'Donation',
            type: 'bernie'
        };
        addToCart(bernieItem);
    }

    function showCustomModal() {
        document.getElementById('custom-item-name').value = '';
        document.getElementById('custom-item-price').value = '';
        document.getElementById('custom-item-status').style.display = 'none';
        document.getElementById('checkout-custom-modal').style.display = 'flex';
        document.getElementById('custom-item-name').focus();
    }

    function closeCustomModal() {
        document.getElementById('checkout-custom-modal').style.display = 'none';
    }

    function addCustomItem() {
        const name = document.getElementById('custom-item-name').value.trim();
        const price = parseFloat(document.getElementById('custom-item-price').value);

        if (!name) {
            showCustomStatus('Please enter an item name.', 'error');
            return;
        }
        if (!price || price <= 0) {
            showCustomStatus('Please enter a valid price.', 'error');
            return;
        }

        const customItem = {
            id: 'custom_' + Date.now(),
            artist: 'Custom Item',
            title: name,
            price: price,
            condition: 'Custom',
            type: 'custom'
        };

        addToCart(customItem);
        closeCustomModal();
    }

    function showCustomStatus(message, type) {
        const el = document.getElementById('custom-item-status');
        el.textContent = message;
        el.className = 'status-message status-' + type;
        el.style.display = 'block';
    }

    // ========== Square Terminal ==========
    async function checkSquareAvailability() {
        try {
            const data = await apiRequest('GET', '/api/square/terminals');
            squareAvailable = data.terminals && data.terminals.length > 0;
            availableTerminals = data.terminals || [];
            console.log('📟 Square terminals available:', squareAvailable);
            return squareAvailable;
        } catch (error) {
            console.warn('Square not available:', error);
            squareAvailable = false;
            availableTerminals = [];
            return false;
        }
    }

    // ========== Payment Methods ==========
    function showPaymentMethodModal() {
        const total = parseFloat(totalEl.textContent.replace('$', ''));
        if (total === 0) {
            showStatus('Cart is empty.', 'warning');
            return;
        }

        checkoutTotal = total;
        checkoutRemaining = total;
        checkoutPaymentEntries = [];

        document.getElementById('payment-method-total').textContent = formatCurrency(total);
        document.getElementById('checkout-payment-method-modal').style.display = 'flex';

        // Check Square availability
        checkSquareAvailability().then(avail => {
            const squareBtn = document.getElementById('payment-method-square');
            if (!avail) {
                squareBtn.style.opacity = '0.5';
                squareBtn.title = 'Square Terminal not available';
                squareBtn.disabled = true;
            } else {
                squareBtn.style.opacity = '1';
                squareBtn.title = '';
                squareBtn.disabled = false;
            }
        });
    }

    function closePaymentMethodModal() {
        document.getElementById('checkout-payment-method-modal').style.display = 'none';
    }

    function selectPaymentMethod(method) {
        closePaymentMethodModal();

        switch (method) {
            case 'cash':
                showTenderModal();
                break;
            case 'square':
                processSquarePayment();
                break;
            case 'giftcard':
                showGiftCardModal();
                break;
            case 'store_credit':
                showStoreCreditModal();
                break;
            default:
                showStatus('Unknown payment method.', 'error');
        }
    }

    // ========== Cash Payment ==========
    function showTenderModal() {
        const total = parseFloat(totalEl.textContent.replace('$', ''));
        document.getElementById('checkout-tender-total').textContent = formatCurrency(total);
        document.getElementById('checkout-tender-amount').value = '';
        document.getElementById('checkout-change-container').style.display = 'none';
        document.getElementById('checkout-tender-complete').disabled = true;
        document.getElementById('checkout-tender-modal').style.display = 'flex';
        document.getElementById('checkout-tender-amount').focus();
    }

    function closeTenderModal() {
        document.getElementById('checkout-tender-modal').style.display = 'none';
    }

    function processCashPayment() {
        const amountInput = document.getElementById('checkout-tender-amount');
        const received = parseFloat(amountInput.value) || 0;
        const total = parseFloat(totalEl.textContent.replace('$', ''));

        if (received < total) {
            showStatus('Amount received is less than total due.', 'error');
            return;
        }

        const change = received - total;
        closeTenderModal();

        // Complete sale with cash payment
        completeSale('cash', { amount: received, change: change });
    }

    // ========== Gift Card Payment ==========
    function showGiftCardModal() {
        const total = parseFloat(totalEl.textContent.replace('$', ''));
        document.getElementById('checkout-giftcard-total').textContent = formatCurrency(total);
        document.getElementById('checkout-giftcard-code').value = '';
        document.getElementById('checkout-giftcard-info').style.display = 'none';
        document.getElementById('checkout-giftcard-apply').style.display = 'none';
        document.getElementById('checkout-giftcard-result').style.display = 'none';
        document.getElementById('checkout-giftcard-modal').style.display = 'flex';
        document.getElementById('checkout-giftcard-code').focus();
        selectedGiftCardCode = null;
        selectedGiftCardBalance = 0;
    }

    function closeGiftCardModal() {
        document.getElementById('checkout-giftcard-modal').style.display = 'none';
    }

    async function checkGiftCard() {
        const code = document.getElementById('checkout-giftcard-code').value.trim().toUpperCase();
        if (!code) {
            showGiftCardStatus('Please enter a gift card code.', 'warning');
            return;
        }

        try {
            const data = await apiRequest('GET', '/api/gift-card/balance/' + encodeURIComponent(code));

            if (data.status === 'success') {
                const balance = data.balance || 0;
                selectedGiftCardCode = code;
                selectedGiftCardBalance = balance;

                document.getElementById('checkout-giftcard-id').textContent = code;
                document.getElementById('checkout-giftcard-balance').textContent = formatCurrency(balance);
                document.getElementById('checkout-giftcard-info').style.display = 'block';

                if (balance > 0) {
                    document.getElementById('checkout-giftcard-apply').style.display = 'block';
                    const total = parseFloat(totalEl.textContent.replace('$', ''));
                    document.getElementById('checkout-giftcard-amount').value = Math.min(balance, total).toFixed(2);
                } else {
                    document.getElementById('checkout-giftcard-apply').style.display = 'none';
                    showGiftCardStatus('Gift card has zero balance.', 'warning');
                }
            } else {
                showGiftCardStatus('Gift card not found.', 'error');
            }
        } catch (error) {
            console.error('Error checking gift card:', error);
            showGiftCardStatus('Error checking gift card: ' + error.message, 'error');
        }
    }

    function setGiftCardAmount(type) {
        const amountInput = document.getElementById('checkout-giftcard-amount');
        const total = parseFloat(totalEl.textContent.replace('$', ''));
        if (type === 'full') {
            amountInput.value = Math.min(selectedGiftCardBalance, total).toFixed(2);
        } else if (type === 'half') {
            amountInput.value = Math.min(selectedGiftCardBalance / 2, total).toFixed(2);
        }
    }

    async function applyGiftCard() {
        if (!selectedGiftCardCode) {
            showGiftCardStatus('Please check a gift card first.', 'warning');
            return;
        }

        const amount = parseFloat(document.getElementById('checkout-giftcard-amount').value);
        if (!amount || amount <= 0) {
            showGiftCardStatus('Please enter a valid amount.', 'warning');
            return;
        }

        if (amount > selectedGiftCardBalance) {
            showGiftCardStatus('Amount exceeds gift card balance.', 'error');
            return;
        }

        try {
            const data = await apiRequest('POST', '/api/gift-card/redeem', {
                code: selectedGiftCardCode,
                purchase_amount: amount
            });

            if (data.status === 'success') {
                const resultDiv = document.getElementById('checkout-giftcard-result');
                resultDiv.style.display = 'block';
                resultDiv.style.padding = '10px';
                resultDiv.style.borderRadius = '4px';
                resultDiv.style.background = '#d4edda';
                resultDiv.style.color = '#155724';
                resultDiv.innerHTML = '✅ Applied $' + amount.toFixed(2) + ' from gift card. New balance: ' + formatCurrency(data.new_balance || 0);

                // Close modal and complete sale
                setTimeout(() => {
                    closeGiftCardModal();
                    completeSale('giftcard', { amount: amount });
                }, 1000);
            } else {
                showGiftCardStatus('Error: ' + (data.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error applying gift card:', error);
            showGiftCardStatus('Error: ' + error.message, 'error');
        }
    }

    function showGiftCardStatus(message, type) {
        const el = document.getElementById('checkout-giftcard-result');
        el.style.display = 'block';
        el.textContent = message;
        el.className = 'status-message status-' + type;
        el.style.padding = '10px';
        el.style.borderRadius = '4px';
        el.style.marginTop = '10px';
    }

    // ========== Store Credit ==========
    function showStoreCreditModal() {
        const debtorName = prompt('Enter debtor name or gift card code:');
        if (!debtorName) return;

        lookupDebtor(debtorName);
    }

    async function lookupDebtor(name) {
        try {
            const data = await apiRequest('POST', '/api/debtor/lookup', { name: name });

            if (data.status === 'success' && data.balance > 0) {
                const total = parseFloat(totalEl.textContent.replace('$', ''));
                const amount = Math.min(data.balance, total);

                if (!confirm('Apply $' + amount.toFixed(2) + ' from ' + data.debtor + '\'s store credit?')) return;

                const redeemData = await apiRequest('POST', '/api/debtor/redeem', {
                    name: data.debtor,
                    amount: amount,
                    description: 'Checkout redemption - ' + cart.length + ' items'
                });

                if (redeemData.status === 'success') {
                    completeSale('store_credit', { amount: amount, debtor: data.debtor });
                } else {
                    showStatus('Error: ' + (redeemData.error || 'Failed to redeem'), 'error');
                }
            } else {
                showStatus(data.error || 'No balance found for this debtor.', 'warning');
            }
        } catch (error) {
            console.error('Error looking up debtor:', error);
            showStatus('Error: ' + error.message, 'error');
        }
    }

    // ========== Square Payment ==========
    async function processSquarePayment() {
        if (!squareAvailable) {
            await checkSquareAvailability();
            if (!squareAvailable) {
                showStatus('No Square Terminal available. Please use Cash or Gift Card.', 'error');
                return;
            }
        }

        const total = parseFloat(totalEl.textContent.replace('$', ''));
        const totalCents = Math.round(total * 100);
        const records = cart.filter(item => item.type === 'record');
        const recordIds = records.map(r => r.id);
        const titles = records.map(r => r.artist + ' - ' + r.title);

        // Open Square modal
        document.getElementById('square-modal-amount').textContent = formatCurrency(total);
        document.getElementById('square-modal-terminal').textContent = availableTerminals.length > 0 ? availableTerminals[0].device_name || 'Square Terminal' : '--';
        document.getElementById('square-modal-status-text').textContent = 'Waiting...';
        document.getElementById('square-modal-status-text').style.color = '#ffc107';
        document.getElementById('square-status-message').textContent = 'Waiting for payment on terminal...';
        document.getElementById('square-status-detail').textContent = 'Please complete payment on the Square Terminal';
        document.getElementById('square-status-icon').innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
        document.getElementById('square-status-icon').style.color = '#ffc107';
        document.getElementById('square-force-warning').style.display = 'none';
        document.getElementById('checkout-square-modal').style.display = 'flex';

        try {
            const deviceId = availableTerminals.length > 0 ? availableTerminals[0].id : null;
            if (!deviceId) {
                throw new Error('No Square Terminal device found.');
            }

            const data = await apiRequest('POST', '/api/square/terminal/checkout', {
                amount_cents: totalCents,
                record_ids: recordIds,
                record_titles: titles,
                reference_id: generateOrderId(),
                device_id: deviceId
            });

            if (data.status !== 'success') {
                throw new Error(data.message || 'Failed to create Square checkout');
            }

            const checkout = data.checkout;
            squareCheckoutId = checkout.id;

            document.getElementById('square-status-message').textContent = '💳 Payment request sent to POS';
            document.getElementById('square-status-detail').textContent = 'Waiting for customer to complete payment...';

            startPollingSquareStatus(checkout.id);

        } catch (error) {
            console.error('Square checkout error:', error);
            document.getElementById('square-status-message').textContent = '❌ Error';
            document.getElementById('square-status-detail').textContent = error.message;
            document.getElementById('square-status-icon').innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
            document.getElementById('square-status-icon').style.color = '#dc3545';
            document.getElementById('square-modal-status-text').textContent = 'Failed';
            document.getElementById('square-modal-status-text').style.color = '#dc3545';
        }
    }

    function startPollingSquareStatus(checkoutId) {
        if (squarePollInterval) {
            clearInterval(squarePollInterval);
        }

        let attempts = 0;
        const maxAttempts = 60;

        squarePollInterval = setInterval(async function() {
            attempts++;
            try {
                const data = await apiRequest('GET', '/api/square/terminal/checkout/' + checkoutId + '/status');

                if (data.status !== 'success') return;

                const checkout = data.checkout;
                const status = checkout.status;

                if (status === 'COMPLETED') {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    document.getElementById('square-status-message').textContent = '✅ Payment completed successfully!';
                    document.getElementById('square-status-icon').innerHTML = '<i class="fas fa-check-circle"></i>';
                    document.getElementById('square-status-icon').style.color = '#28a745';
                    document.getElementById('square-modal-status-text').textContent = 'Completed';
                    document.getElementById('square-modal-status-text').style.color = '#28a745';
                    document.getElementById('square-status-detail').textContent = 'Processing sale...';

                    setTimeout(() => {
                        document.getElementById('checkout-square-modal').style.display = 'none';
                        completeSale('square');
                    }, 1500);

                } else if (status === 'CANCELED' || status === 'FAILED') {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    document.getElementById('square-status-message').textContent = '❌ Payment ' + status.toLowerCase();
                    document.getElementById('square-status-icon').innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                    document.getElementById('square-status-icon').style.color = '#dc3545';
                    document.getElementById('square-modal-status-text').textContent = status;
                    document.getElementById('square-modal-status-text').style.color = '#dc3545';
                    document.getElementById('square-status-detail').textContent = 'Please try again.';

                } else if (status === 'PENDING' || status === 'IN_PROGRESS') {
                    document.getElementById('square-status-detail').textContent = 'Waiting for payment... (' + attempts + 's)';
                    document.getElementById('square-modal-status-text').textContent = 'Processing...';
                }

                if (attempts >= maxAttempts) {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    document.getElementById('square-status-message').textContent = '⏰ Payment timed out';
                    document.getElementById('square-status-icon').innerHTML = '<i class="fas fa-clock"></i>';
                    document.getElementById('square-status-icon').style.color = '#ffc107';
                    document.getElementById('square-modal-status-text').textContent = 'Timed Out';
                    document.getElementById('square-modal-status-text').style.color = '#ffc107';
                    document.getElementById('square-status-detail').textContent = 'Please try again.';
                }

            } catch (error) {
                console.warn('Polling error:', error);
            }
        }, 2000);
    }

    function closeSquareModal() {
        if (squarePollInterval) {
            clearInterval(squarePollInterval);
            squarePollInterval = null;
        }
        document.getElementById('checkout-square-modal').style.display = 'none';
    }

    function forceCompleteSquare() {
        if (!confirm('Force complete the sale without terminal confirmation? Use only if customer has already paid.')) return;
        closeSquareModal();
        completeSale('square');
    }

    function cancelSquarePayment() {
        if (squareCheckoutId) {
            apiRequest('POST', '/api/square/terminal/checkout/' + squareCheckoutId + '/cancel')
                .catch(err => console.warn('Cancel error:', err));
        }
        closeSquareModal();
        showStatus('Square payment cancelled.', 'info');
    }

    // ========== Complete Sale ==========
    async function completeSale(paymentMethod, paymentDetails) {
        if (isProcessing) return;
        if (cart.length === 0) {
            showStatus('Cart is empty.', 'warning');
            return;
        }

        isProcessing = true;
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        try {
            const recordItems = cart.filter(item => item.type === 'record');
            const customItems = cart.filter(item => item.type === 'custom' || item.type === 'bernie');
            const recordIds = recordItems.map(item => item.id);
            const total = parseFloat(totalEl.textContent.replace('$', ''));

            // Mark records as sold
            if (recordIds.length > 0) {
                const updateData = await apiRequest('POST', '/records/update-status', {
                    record_ids: recordIds,
                    status_id: 3
                });
                if (updateData.status !== 'success') {
                    throw new Error('Failed to mark records as sold: ' + (updateData.error || 'Unknown error'));
                }
            }

            // Create sale journal entry
            const saleItems = cart.map(item => ({
                id: item.id,
                artist: item.artist || 'Custom',
                title: item.title || 'Item',
                price: item.price || 0,
                isCustom: item.type === 'custom' || item.type === 'bernie',
                consignor_id: null
            }));

            try {
                await apiRequest('POST', '/api/accounting/sale', {
                    order_id: generateOrderId(),
                    payment_method: paymentMethod,
                    total_amount: total,
                    items: saleItems,
                    transaction_date: getLocalMSTDate()
                });
            } catch (err) {
                console.warn('Sale journal entry failed:', err);
                // Continue anyway
            }

            // Generate receipt
            generateReceipt(cart, paymentMethod, paymentDetails, total);

            // Clear cart
            cart = [];
            renderCart();
            updateCartSummary();

            if (currentResults.length > 0) {
                renderResults(currentResults);
            }

            showStatus('✅ Sale completed! ' + recordItems.length + ' records sold via ' + paymentMethod, 'success');

        } catch (error) {
            console.error('Sale error:', error);
            showStatus('❌ Error completing sale: ' + error.message, 'error');
        } finally {
            isProcessing = false;
            checkoutBtn.disabled = cart.length === 0;
            checkoutBtn.innerHTML = '<i class="fas fa-credit-card"></i> Checkout';
        }
    }

    // ========== Receipt ==========
    function generateReceipt(items, paymentMethod, paymentDetails, total) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const orderId = generateOrderId();

        let receipt = 'PigStyle Music\n';
        receipt += '====================\n';
        receipt += dateStr + ' ' + timeStr + '\n';
        receipt += 'Order: ' + orderId + '\n\n';
        receipt += 'ITEMS:\n';
        receipt += '--------------------\n';

        let subtotal = 0;
        items.forEach(item => {
            const price = item.price || 0;
            const desc = item.type === 'bernie' ? '[Bernie] ' + item.title : (item.artist + ' - ' + item.title);
            receipt += desc.padEnd(30) + '$' + price.toFixed(2) + '\n';
            subtotal += price;
        });

        const tax = subtotal * 0.08;
        const grandTotal = subtotal + tax;

        receipt += '--------------------\n';
        receipt += 'Subtotal'.padEnd(30) + '$' + subtotal.toFixed(2) + '\n';
        receipt += 'Tax'.padEnd(30) + '$' + tax.toFixed(2) + '\n';
        receipt += 'Total'.padEnd(30) + '$' + grandTotal.toFixed(2) + '\n\n';

        receipt += 'PAYMENT:\n';
        receipt += '--------------------\n';
        let paymentLabel = paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1);
        if (paymentMethod === 'store_credit') {
            paymentLabel = 'Store Credit';
        } else if (paymentMethod === 'giftcard') {
            paymentLabel = 'Gift Card';
        } else if (paymentMethod === 'square') {
            paymentLabel = 'Card (Square)';
        }
        receipt += paymentLabel.padEnd(30) + '$' + grandTotal.toFixed(2) + '\n';

        if (paymentMethod === 'cash' && paymentDetails) {
            receipt += 'Amount Received'.padEnd(30) + '$' + (paymentDetails.amount || 0).toFixed(2) + '\n';
            receipt += 'Change'.padEnd(30) + '$' + (paymentDetails.change || 0).toFixed(2) + '\n';
        }

        receipt += '--------------------\n\n';
        receipt += 'Thank you!\n';
        receipt += 'PigStyle Music\n';
        receipt += 'Come back soon!\n\n\n\n';

        // Download receipt
        const filename = 'receipt_' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + '.txt';
        downloadReceipt(receipt, filename);
    }

    function downloadReceipt(text, filename) {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('✅ Receipt downloaded:', filename);
    }

    // ========== Clear Search ==========
    function clearSearch() {
        searchInput.value = '';
        resultsContainer.innerHTML = '<div class="no-results"><i class="fas fa-search" style="font-size:36px;display:block;margin-bottom:10px;color:#ccc;"></i><p>Search for records to add to cart</p></div>';
        resultsCount.textContent = '0 results';
        currentResults = [];
    }

    // ========== Init ==========
    function init() {
        if (isInitialized) return;
        isInitialized = true;

        console.log('🔄 Initializing Checkout...');

        // Search
        if (searchBtn) searchBtn.addEventListener('click', performSearch);
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') performSearch();
            });
        }
        if (clearBtn) clearBtn.addEventListener('click', clearSearch);

        // Cart
        if (checkoutBtn) checkoutBtn.addEventListener('click', showPaymentMethodModal);
        if (clearCartBtn) clearCartBtn.addEventListener('click', clearCart);

        // Custom Items
        if (customBtn) customBtn.addEventListener('click', showCustomModal);
        if (bernieBtn) bernieBtn.addEventListener('click', addBernie);

        // Render initial state
        renderCart();
        updateCartSummary();

        console.log('✅ Checkout initialized.');
    }

    // ========== Expose Public API ==========
    window.checkout = {
        init: init,
        performSearch: performSearch,
        clearSearch: clearSearch,
        addToCart: addToCart,
        removeFromCart: removeFromCart,
        clearCart: clearCart,
        addBernie: addBernie,
        showCustomModal: showCustomModal,
        closeCustomModal: closeCustomModal,
        addCustomItem: addCustomItem,
        showPaymentMethodModal: showPaymentMethodModal,
        closePaymentMethodModal: closePaymentMethodModal,
        selectPaymentMethod: selectPaymentMethod,
        showTenderModal: showTenderModal,
        closeTenderModal: closeTenderModal,
        processCashPayment: processCashPayment,
        showGiftCardModal: showGiftCardModal,
        closeGiftCardModal: closeGiftCardModal,
        checkGiftCard: checkGiftCard,
        setGiftCardAmount: setGiftCardAmount,
        applyGiftCard: applyGiftCard,
        showStoreCreditModal: showStoreCreditModal,
        processSquarePayment: processSquarePayment,
        closeSquareModal: closeSquareModal,
        forceCompleteSquare: forceCompleteSquare,
        cancelSquarePayment: cancelSquarePayment,
        completeSale: completeSale,
        getCart: function() { return cart; },
        getTotal: function() { return parseFloat(totalEl.textContent.replace('$', '')); }
    };

    // Auto-init when DOM is ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 100);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

    console.log('✅ checkout.js loaded, API exposed via window.checkout');

})();