// ============================================================================
// checkout.js - Check Out Tab Functionality
// ============================================================================

// Shopping Cart Variables
let checkoutCart = [];
let pendingCartCheckout = null;
let currentDiscount = {
    amount: 0,
    type: 'percentage',
    value: 0
};
let currentSearchResults = [];
let availableTerminals = [];
let selectedTerminalId = null;
let activeCheckoutId = null;
let square_payment_sessions = {}; // Track payment sessions

// Make ALL functions globally available immediately
(function() {
    // ============================================================================
    // Utility Functions
    // ============================================================================
    
    window.showCheckoutStatus = function(message, type = 'info') {
        const statusEl = document.getElementById('checkout-status-message');
        if (!statusEl) return;
        
        statusEl.textContent = message;
        statusEl.className = `status-message status-${type}`;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    };

    window.showCheckoutLoading = function(show) {
        const loadingEl = document.getElementById('checkout-loading');
        if (loadingEl) {
            loadingEl.style.display = show ? 'flex' : 'none';
        }
    };

    window.escapeHtml = function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    window.getStatusText = function(statusId) {
        const statusMap = {
            1: 'Inactive',
            2: 'Active',
            3: 'Sold',
            4: 'Removed'
        };
        return statusMap[statusId] || 'Unknown';
    };

    window.getConfigValue = function(key) {
        if (typeof window.dbConfigValues !== 'undefined' && window.dbConfigValues[key]) {
            return window.dbConfigValues[key].value;
        }
        return null;
    };

    // ============================================================================
    // Terminal Management
    // ============================================================================

    window.refreshTerminals = async function() {
        const terminalList = document.getElementById('terminal-list');
        if (!terminalList) return;
        
        terminalList.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="loading-spinner" style="width: 30px; height: 30px;"></div><p>Loading terminals...</p></div>';
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/square/terminals`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Terminal fetch error:', response.status, errorText);
                terminalList.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">
                    <i class="fas fa-exclamation-circle" style="font-size: 24px; margin-bottom: 10px;"></i>
                    <p>Error ${response.status}: ${response.statusText}</p>
                    <p style="font-size: 12px;">${errorText.substring(0, 100)}</p>
                </div>`;
                return;
            }
            
            const data = await response.json();
            if (data.status === 'success') {
                availableTerminals = data.terminals || [];
                renderTerminalList(availableTerminals);
            } else {
                terminalList.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">
                    <i class="fas fa-exclamation-circle" style="font-size: 24px; margin-bottom: 10px;"></i>
                    <p>Error: ${data.message || 'Unknown error'}</p>
                </div>`;
            }
        } catch (error) {
            console.error('Error refreshing terminals:', error);
            terminalList.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">
                <i class="fas fa-exclamation-circle" style="font-size: 24px; margin-bottom: 10px;"></i>
                <p>Error: ${error.message}</p>
            </div>`;
        }
    };

    function renderTerminalList(terminals) {
        const terminalList = document.getElementById('terminal-list');
        if (!terminalList) return;
        
        if (terminals.length === 0) {
            terminalList.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #666;">
                    <i class="fas fa-square" style="font-size: 24px; margin-bottom: 10px; color: #ccc;"></i>
                    <p>No Square Terminals found</p>
                    <small>Make sure your terminal is registered and online</small>
                </div>
            `;
            return;
        }
        
        let html = '';
        terminals.forEach(terminal => {
            let displayId = terminal.id;
            let storeId = terminal.id;
            
            if (storeId && storeId.startsWith('device:')) {
                storeId = storeId.replace('device:', '');
            }
            
            const isOnline = terminal.status === 'ONLINE';
            const isSelected = selectedTerminalId === storeId;
            
            html += `
                <div class="terminal-item ${isSelected ? 'selected' : ''}" onclick="selectTerminal('${storeId}')">
                    <div class="terminal-icon">
                        <i class="fas fa-square"></i>
                    </div>
                    <div class="terminal-details">
                        <div class="terminal-name">${escapeHtml(terminal.device_name) || 'Square Terminal'}</div>
                        <div class="terminal-id">ID: ${escapeHtml(displayId)}</div>
                    </div>
                    <div class="terminal-status ${isOnline ? 'online' : 'offline'}">
                        ${isOnline ? 'Online' : 'Offline'}
                    </div>
                </div>
            `;
        });
        
        terminalList.innerHTML = html;
        
        if (terminals.length === 1) {
            let singleTerminalId = terminals[0].id;
            if (singleTerminalId && singleTerminalId.startsWith('device:')) {
                singleTerminalId = singleTerminalId.replace('device:', '');
            }
            selectedTerminalId = singleTerminalId;
        }
    }

    window.selectTerminal = function(terminalId) {
        selectedTerminalId = terminalId;
        renderTerminalList(availableTerminals);
    };

    // ============================================================================
    // Custom Item Functions
    // ============================================================================

    window.addCustomItemToCart = function() {
        const note = document.getElementById('custom-note')?.value.trim();
        const price = parseFloat(document.getElementById('custom-price')?.value);
        
        if (!note) {
            showCheckoutStatus('Please enter a description for the custom item', 'error');
            document.getElementById('custom-note')?.focus();
            return;
        }
        
        if (isNaN(price) || price <= 0) {
            showCheckoutStatus('Please enter a valid price greater than 0', 'error');
            document.getElementById('custom-price')?.focus();
            return;
        }
        
        const customItem = {
            id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'custom',
            note: note,
            description: note,
            store_price: price,
            custom_note: note,
            timestamp: Date.now()
        };
        
        checkoutCart.push(customItem);
        
        document.getElementById('custom-note').value = '';
        document.getElementById('custom-price').value = '';
        
        updateCartDisplay();
        showCheckoutStatus(`Added custom item: "${note.substring(0, 30)}${note.length > 30 ? '...' : ''}" - $${price.toFixed(2)}`, 'success');
    };

    window.removeCustomItemFromCart = function(itemId) {
        const index = checkoutCart.findIndex(item => item.type === 'custom' && item.id === itemId);
        if (index !== -1) {
            const removed = checkoutCart.splice(index, 1)[0];
            updateCartDisplay();
            showCheckoutStatus(`Removed custom item: "${removed.note}"`, 'info');
        }
    };

    // ============================================================================
    // Search Functions
    // ============================================================================

    window.searchRecordsAndAccessories = async function() {
        console.log('searchRecordsAndAccessories called');
        const query = document.getElementById('search-query')?.value.trim();
        if (!query) {
            showCheckoutStatus('Please enter a search term', 'error');
            return;
        }
        
        const activeOnly = document.getElementById('filter-active')?.checked || false;
        const barcodeOnly = document.getElementById('filter-barcode')?.checked || false;
        
        showCheckoutLoading(true);
        
        try {
            // Search records
            let recordsUrl = `${AppConfig.baseUrl}/records/search?q=${encodeURIComponent(query)}`;
            const recordsResponse = await fetch(recordsUrl, { credentials: 'include' });
            
            if (!recordsResponse.ok) {
                throw new Error(`Records search failed: ${recordsResponse.status}`);
            }
            const recordsData = await recordsResponse.json();
            
            if (recordsData.status !== 'success') {
                throw new Error(recordsData.error || 'Records search failed');
            }
            
            // Get accessories
            const accessoriesUrl = `${AppConfig.baseUrl}/accessories`;
            const accessoriesResponse = await fetch(accessoriesUrl, { credentials: 'include' });
            
            if (!accessoriesResponse.ok) {
                throw new Error(`Accessories fetch failed: ${accessoriesResponse.status}`);
            }
            const accessoriesData = await accessoriesResponse.json();
            
            if (accessoriesData.status !== 'success') {
                throw new Error(accessoriesData.error || 'Accessories fetch failed');
            }
            
            let records = recordsData.records || [];
            let accessories = [];
            
            const allAcc = accessoriesData.accessories || [];
            const queryLower = query.toLowerCase();
            accessories = allAcc.filter(acc => {
                if (acc.bar_code && acc.bar_code.toLowerCase().includes(queryLower)) {
                    return true;
                }
                if (acc.description && acc.description.toLowerCase().includes(queryLower)) {
                    return true;
                }
                return false;
            });
            
            if (activeOnly) {
                records = records.filter(r => r.status_id === 2);
            }
            
            if (barcodeOnly) {
                records = records.filter(r => r.barcode && r.barcode.toLowerCase().includes(query.toLowerCase()));
                accessories = accessories.filter(acc => acc.bar_code && acc.bar_code.toLowerCase().includes(query.toLowerCase()));
            }
            
            const transformedAccessories = accessories.map(acc => ({
                id: `acc_${acc.id}`,
                original_id: acc.id,
                type: 'accessory',
                artist: null,
                title: null,
                description: acc.description,
                store_price: acc.store_price,
                catalog_number: null,
                genre_name: 'Accessory',
                barcode: acc.bar_code,
                consignor_id: null,
                status_id: 2,
                count: acc.count,
                created_at: acc.created_at
            }));
            
            currentSearchResults = [...records, ...transformedAccessories];
            currentSearchResults.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            renderSearchResults(currentSearchResults);
            
            showCheckoutStatus(`Found ${records.length} records and ${accessories.length} accessories`, 'success');
        } catch (error) {
            console.error('Error searching:', error);
            showCheckoutStatus(`Error searching items: ${error.message}`, 'error');
        } finally {
            showCheckoutLoading(false);
        }
    };

    function renderSearchResults(results) {
        const container = document.getElementById('search-results');
        const resultCountEl = document.getElementById('search-result-count');
        const displayedResultsEl = document.getElementById('displayed-results');
        
        if (!container) return;
        
        if (resultCountEl) resultCountEl.textContent = results.length;
        if (displayedResultsEl) displayedResultsEl.textContent = results.length;
        
        if (results.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-search" style="font-size: 48px; margin-bottom: 20px; color: #ccc;"></i>
                    <p>No items found matching your search</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        results.forEach(item => {
            const inCart = checkoutCart.some(cartItem => {
                if (item.type === 'accessory') {
                    return cartItem.type === 'accessory' && cartItem.original_id === item.original_id;
                } else {
                    return cartItem.id === item.id;
                }
            });
            
            if (item.type === 'accessory') {
                const stockDisplay = item.count < 0 ? 
                    `<span class="stock-negative">(Stock: ${item.count})</span>` : 
                    `<span class="stock-positive">(Stock: ${item.count})</span>`;
                
                html += `
                    <div class="search-result-item" style="border-left: 4px solid #9b59b6;">
                        <div class="result-details">
                            <div class="result-artist">
                                <span class="accessory-badge">ACCESSORY</span>
                                ${escapeHtml(item.description) || 'Unknown Accessory'}
                                <span class="stock-indicator ${item.count < 0 ? 'stock-negative' : 'stock-positive'}">${stockDisplay}</span>
                            </div>
                            <div class="result-meta">
                                <span class="result-barcode"><i class="fas fa-barcode"></i> ${escapeHtml(item.barcode)}</span>
                            </div>
                        </div>
                        <div class="result-price">$${(item.store_price || 0).toFixed(2)}</div>
                        <div class="result-actions">
                            ${inCart ? 
                                `<button class="btn btn-secondary btn-sm" onclick="removeAccessoryFromCart(${item.original_id})">
                                    <i class="fas fa-minus"></i> Remove
                                </button>` :
                                `<button class="btn btn-cart btn-sm" onclick="addAccessoryToCart(${item.original_id}, '${escapeHtml(item.description)}', ${item.store_price})">
                                    <i class="fas fa-cart-plus"></i> Add to Cart
                                </button>`
                            }
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="search-result-item">
                        <div class="result-details">
                            <div class="result-artist">${escapeHtml(item.artist) || 'Unknown Artist'}</div>
                            <div class="result-title">${escapeHtml(item.title) || 'Unknown Title'}</div>
                            <div class="result-meta">
                                <span class="result-catalog">${escapeHtml(item.catalog_number) || 'No catalog'}</span>
                                ${item.barcode ? `<span class="result-barcode"><i class="fas fa-barcode"></i> ${escapeHtml(item.barcode)}</span>` : ''}
                                <span>Status: ${getStatusText(item.status_id)}</span>
                            </div>
                        </div>
                        <div class="result-price">$${(item.store_price || 0).toFixed(2)}</div>
                        <div class="result-actions">
                            ${item.status_id === 3 ? 
                                '<span class="sold-badge"><i class="fas fa-check-circle"></i> Sold</span>' : 
                                item.status_id === 2 ?
                                (inCart ? 
                                    `<button class="btn btn-secondary btn-sm" onclick="removeFromCart(${item.id})">
                                        <i class="fas fa-minus"></i> Remove
                                    </button>` :
                                    `<button class="btn btn-cart btn-sm" onclick="addToCartFromData(${item.id})">
                                        <i class="fas fa-cart-plus"></i> Add to Cart
                                    </button>`
                                ) :
                                '<span class="inactive-badge">Not Active</span>'
                            }
                        </div>
                    </div>
                `;
            }
        });
        
        container.innerHTML = html;
        updateCartDisplay();
    }

    // ============================================================================
    // Cart Functions
    // ============================================================================

    window.addAccessoryToCart = function(id, description, price) {
        if (checkoutCart.some(item => item.type === 'accessory' && item.original_id === id)) {
            showCheckoutStatus('Item already in cart', 'info');
            return;
        }
        
        const cartItem = {
            id: `acc_${id}`,
            original_id: id,
            type: 'accessory',
            description: description,
            store_price: price,
            barcode: ''
        };
        
        checkoutCart.push(cartItem);
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus(`Added "${description}" to cart`, 'success');
    };

    window.removeAccessoryFromCart = function(originalId) {
        const index = checkoutCart.findIndex(item => item.type === 'accessory' && item.original_id === originalId);
        if (index !== -1) {
            const removed = checkoutCart.splice(index, 1)[0];
            updateCartDisplay();
            searchRecordsAndAccessories();
            showCheckoutStatus(`Removed "${removed.description}" from cart`, 'info');
        }
    };

    window.addToCartFromData = function(recordId) {
        const record = currentSearchResults.find(r => r.id === recordId);
        if (record && record.type !== 'accessory') {
            addToCart(record);
        }
    };

    function addToCart(record) {
        if (checkoutCart.some(item => item.id === record.id)) {
            showCheckoutStatus('Item already in cart', 'info');
            return;
        }
        
        checkoutCart.push(record);
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus(`Added "${record.title}" to cart`, 'success');
    }

    window.removeFromCart = function(recordId) {
        const recordIndex = checkoutCart.findIndex(item => item.id === recordId);
        if (recordIndex !== -1) {
            const removed = checkoutCart.splice(recordIndex, 1)[0];
            updateCartDisplay();
            searchRecordsAndAccessories();
            showCheckoutStatus(`Removed "${removed.title}" from cart`, 'info');
        }
    };

    window.clearCart = function() {
        if (checkoutCart.length === 0) return;
        
        if (confirm('Are you sure you want to clear the cart?')) {
            checkoutCart = [];
            currentDiscount = { amount: 0, type: 'percentage', value: 0 };
            const discountAmount = document.getElementById('discount-amount');
            const discountType = document.getElementById('discount-type');
            if (discountAmount) discountAmount.value = '';
            if (discountType) discountType.value = 'percentage';
            updateCartDisplay();
            searchRecordsAndAccessories();
            showCheckoutStatus('Cart cleared', 'info');
        }
    };

    window.updateCartWithDiscount = function() {
        const discountAmount = parseFloat(document.getElementById('discount-amount')?.value) || 0;
        const discountType = document.getElementById('discount-type')?.value || 'percentage';
        const errorDiv = document.getElementById('discount-error');
        
        if (discountAmount < 0) {
            if (errorDiv) {
                errorDiv.textContent = 'Discount cannot be negative';
                errorDiv.style.display = 'block';
            }
            return;
        }
        
        if (discountType === 'percentage' && discountAmount > 100) {
            if (errorDiv) {
                errorDiv.textContent = 'Percentage discount cannot exceed 100%';
                errorDiv.style.display = 'block';
            }
            return;
        }
        
        currentDiscount = {
            amount: discountAmount,
            type: discountType,
            value: 0
        };
        
        if (errorDiv) errorDiv.style.display = 'none';
        updateCartDisplay();
    };

    function calculateTotalsWithDiscount() {
        let subtotal = 0;
        checkoutCart.forEach(item => {
            const price = parseFloat(item.store_price);
            subtotal += price;
        });
        
        let discountValue = 0;
        const discountRow = document.getElementById('discount-row');
        const discountDisplay = document.getElementById('discount-display');
        const errorDiv = document.getElementById('discount-error');
        
        if (currentDiscount.amount > 0) {
            if (currentDiscount.type === 'percentage') {
                discountValue = subtotal * (currentDiscount.amount / 100);
                
                if (discountValue > subtotal) {
                    if (errorDiv) {
                        errorDiv.textContent = 'Discount cannot exceed subtotal';
                        errorDiv.style.display = 'block';
                    }
                    currentDiscount.value = 0;
                    if (discountRow) discountRow.style.display = 'none';
                    return subtotal;
                }
                
                currentDiscount.value = discountValue;
                if (discountDisplay) discountDisplay.textContent = `-$${discountValue.toFixed(2)} (${currentDiscount.amount}%)`;
                if (discountRow) discountRow.style.display = 'flex';
                
            } else {
                if (currentDiscount.amount <= subtotal) {
                    discountValue = currentDiscount.amount;
                    currentDiscount.value = discountValue;
                    if (discountDisplay) discountDisplay.textContent = `-$${discountValue.toFixed(2)}`;
                    if (discountRow) discountRow.style.display = 'flex';
                } else {
                    if (errorDiv) {
                        errorDiv.textContent = 'Fixed discount cannot exceed subtotal';
                        errorDiv.style.display = 'block';
                    }
                    currentDiscount.value = 0;
                    if (discountRow) discountRow.style.display = 'none';
                }
            }
        } else {
            if (discountRow) discountRow.style.display = 'none';
            currentDiscount.value = 0;
        }
        
        return subtotal - discountValue;
    }

    function updateCartDisplay() {
        const cartSection = document.getElementById('shopping-cart-section');
        const cartItems = document.getElementById('cart-items');
        const cartCount = document.getElementById('cart-item-count');
        const cartSubtotal = document.getElementById('cart-subtotal');
        const cartTax = document.getElementById('cart-tax');
        const cartTotal = document.getElementById('cart-total');
        const squareBtn = document.getElementById('checkout-square-btn');
        const taxRateDisplay = document.getElementById('tax-rate-display');
        
        if (checkoutCart.length === 0) {
            if (cartSection) cartSection.style.display = 'none';
            if (squareBtn) squareBtn.disabled = true;
            return;
        }
        
        if (cartSection) cartSection.style.display = 'block';
        if (cartCount) cartCount.textContent = `${checkoutCart.length} item${checkoutCart.length !== 1 ? 's' : ''}`;
        
        let subtotal = 0;
        checkoutCart.forEach(item => {
            const price = parseFloat(item.store_price);
            subtotal += price;
        });
        
        const discountedSubtotal = calculateTotalsWithDiscount();
        
        const taxEnabled = getConfigValue('TAX_ENABLED') === 'true';
        const taxRate = taxEnabled ? (parseFloat(getConfigValue('TAX_RATE')) / 100) : 0;
        
        if (taxRateDisplay) taxRateDisplay.textContent = (taxRate * 100).toFixed(1);
        
        const tax = discountedSubtotal * taxRate;
        const total = discountedSubtotal + tax;
        
        if (cartSubtotal) cartSubtotal.textContent = `$${discountedSubtotal.toFixed(2)}`;
        if (cartTax) cartTax.textContent = `$${tax.toFixed(2)}`;
        if (cartTotal) cartTotal.textContent = `$${total.toFixed(2)}`;
        
        if (squareBtn) squareBtn.disabled = availableTerminals.length === 0;
        
        let cartHtml = '';
        checkoutCart.forEach(item => {
            if (item.type === 'accessory') {
                cartHtml += `
                    <div class="cart-item" style="border-left: 4px solid #9b59b6;">
                        <div class="cart-item-details">
                            <div class="cart-item-artist">
                                <span class="accessory-badge">ACC</span>
                                ${escapeHtml(item.description) || 'Unknown Accessory'}
                            </div>
                            <div class="cart-item-meta">${escapeHtml(item.barcode) || 'No barcode'}</div>
                        </div>
                        <div class="cart-item-price">$${(item.store_price || 0).toFixed(2)}</div>
                        <div class="cart-item-remove" onclick="removeAccessoryFromCart(${item.original_id})">
                            <i class="fas fa-times"></i>
                        </div>
                    </div>
                `;
            } else if (item.type === 'custom') {
                cartHtml += `
                    <div class="cart-item" style="border-left: 4px solid #ffd700; background: linear-gradient(135deg, #fff9e6 0%, #fff 100%);">
                        <div class="cart-item-details">
                            <div class="cart-item-artist">
                                <span class="accessory-badge" style="background: #ffd700; color: #333;">CUSTOM</span>
                                ${escapeHtml(item.note) || 'Custom Item'}
                            </div>
                            <div class="cart-item-meta">
                                <i class="fas fa-pencil-alt"></i> Manual entry
                            </div>
                        </div>
                        <div class="cart-item-price">$${(item.store_price || 0).toFixed(2)}</div>
                        <div class="cart-item-remove" onclick="removeCustomItemFromCart('${item.id}')">
                            <i class="fas fa-times"></i>
                        </div>
                    </div>
                `;
            } else {
                const price = parseFloat(item.store_price) || 0;
                cartHtml += `
                    <div class="cart-item">
                        <div class="cart-item-details">
                            <div class="cart-item-artist">${escapeHtml(item.artist) || 'Unknown Artist'}</div>
                            <div class="cart-item-title">${escapeHtml(item.title) || 'Unknown Title'}</div>
                            <div class="cart-item-meta">${escapeHtml(item.catalog_number) || 'No catalog'}</div>
                        </div>
                        <div class="cart-item-price">$${price.toFixed(2)}</div>
                        <div class="cart-item-remove" onclick="removeFromCart(${item.id})">
                            <i class="fas fa-times"></i>
                        </div>
                    </div>
                `;
            }
        });
        
        if (cartItems) cartItems.innerHTML = cartHtml;
    }

    // ============================================================================
    // Square Payment Functions
    // ============================================================================

    window.processSquarePayment = function() {
        if (checkoutCart.length === 0) {
            showCheckoutStatus('Cart is empty', 'error');
            return;
        }
        
        if (availableTerminals.length === 0) {
            showCheckoutStatus('No Square Terminals available. Please refresh terminals.', 'error');
            return;
        }
        
        const onlineTerminals = availableTerminals.filter(t => t.status === 'ONLINE');
        if (onlineTerminals.length === 0) {
            showCheckoutStatus('No online terminals available. Please check terminal connection.', 'error');
            return;
        }
        
        pendingCartCheckout = {
            items: [...checkoutCart],
            type: 'cart',
            discount: { ...currentDiscount }
        };
        
        renderTerminalSelectionModal();
    };

    function renderTerminalSelectionModal() {
        const onlineTerminals = availableTerminals.filter(t => t.status === 'ONLINE');
        const selectionList = document.getElementById('terminal-selection-list');
        const modal = document.getElementById('terminal-selection-modal');
        
        if (!selectionList || !modal) return;
        
        let html = '<h4>Select Terminal</h4>';
        
        onlineTerminals.forEach(terminal => {
            let terminalId = terminal.id;
            if (terminalId && terminalId.startsWith('device:')) {
                terminalId = terminalId.replace('device:', '');
            }
            
            html += `
                <div class="terminal-device" onclick="selectTerminalForCheckout('${terminalId}')">
                    <input type="radio" name="terminal" value="${terminalId}" ${selectedTerminalId === terminalId ? 'checked' : ''}>
                    <div class="terminal-device-info">
                        <div class="terminal-device-name">${escapeHtml(terminal.device_name) || 'Square Terminal'}</div>
                        <div class="terminal-device-status online">Online</div>
                    </div>
                </div>
            `;
        });
        
        selectionList.innerHTML = html;
        
        if (selectedTerminalId && onlineTerminals.some(t => {
            let tid = t.id;
            if (tid && tid.startsWith('device:')) {
                tid = tid.replace('device:', '');
            }
            return tid === selectedTerminalId;
        })) {
            document.getElementById('confirm-terminal-btn').disabled = false;
        } else {
            document.getElementById('confirm-terminal-btn').disabled = true;
        }
        
        modal.style.display = 'flex';
    }

    window.selectTerminalForCheckout = function(terminalId) {
        selectedTerminalId = terminalId;
        
        document.querySelectorAll('input[name="terminal"]').forEach(radio => {
            radio.checked = radio.value === terminalId;
        });
        
        document.getElementById('confirm-terminal-btn').disabled = false;
    };

    window.closeTerminalSelectionModal = function() {
        const modal = document.getElementById('terminal-selection-modal');
        if (modal) modal.style.display = 'none';
    };

    function startPollingCheckoutStatus(checkoutId) {
        console.log('Starting to poll for checkout status:', checkoutId);
        
        const pollInterval = setInterval(async () => {
            try {
                const url = `${AppConfig.baseUrl}/api/square/terminal/checkout/${checkoutId}/status`;
                
                const response = await fetch(url, { credentials: 'include' });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Status check failed: ${response.status} - ${errorText}`);
                }
                
                const data = await response.json();
                
                if (data.status !== 'success') {
                    throw new Error(data.error || 'Failed to get checkout status');
                }
                
                const checkout = data.checkout;
                const status = checkout.status;
                
                console.log(`Checkout ${checkoutId} status:`, status);
                
                if (square_payment_sessions[checkoutId]) {
                    square_payment_sessions[checkoutId].status = status;
                    
                    if (status === 'COMPLETED') {
                        if (!checkout.payment_ids || checkout.payment_ids.length === 0) {
                            throw new Error('Checkout completed but no payment ID found');
                        }
                        
                        const paymentId = checkout.payment_ids[0];
                        square_payment_sessions[checkoutId].payment_id = paymentId;
                        console.log('✅ Payment ID captured:', paymentId);
                        
                        clearInterval(pollInterval);
                        
                        if (pendingCartCheckout) {
                            showCheckoutStatus('Payment completed! Processing...', 'success');
                            
                            setTimeout(async () => {
                                await processSquarePaymentSuccess();
                                closeTerminalCheckoutModal();
                            }, 1000);
                        }
                    }
                }
            } catch (error) {
                console.error('Error polling checkout status:', error);
                if (error.message.includes('404') || error.message.includes('500')) {
                    clearInterval(pollInterval);
                }
            }
        }, 3000);
        
        if (square_payment_sessions[checkoutId]) {
            square_payment_sessions[checkoutId].pollInterval = pollInterval;
        }
        
        setTimeout(() => {
            clearInterval(pollInterval);
            console.log('Stopped polling for checkout:', checkoutId);
        }, 300000);
    }

    window.initiateCartTerminalCheckout = async function() {
        if (!pendingCartCheckout) {
            showCheckoutStatus('No items selected for checkout', 'error');
            closeTerminalSelectionModal();
            return;
        }
        
        if (!selectedTerminalId) {
            showCheckoutStatus('Please select a terminal', 'error');
            return;
        }
        
        const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
        const amountCents = Math.round(total * 100);
        const recordIds = pendingCartCheckout.items.map(item => 
            item.type === 'accessory' ? `acc_${item.original_id}` : 
            item.type === 'custom' ? `custom_${item.id}` : item.id
        );
        const recordTitles = pendingCartCheckout.items.map(item => 
            item.type === 'accessory' ? item.description : 
            item.type === 'custom' ? item.note : item.title
        );
        
        closeTerminalSelectionModal();
        
        const modalBody = document.getElementById('terminal-checkout-body');
        const modal = document.getElementById('terminal-checkout-modal');
        
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="payment-status">
                    <div class="payment-status-icon processing">
                        <i class="fas fa-spinner fa-pulse"></i>
                    </div>
                    <div class="payment-status-message">Creating Terminal Checkout...</div>
                    <div class="payment-status-detail">Amount: $${total.toFixed(2)}</div>
                    <div class="payment-status-detail">Please wait while we prepare the terminal</div>
                </div>
            `;
        }
        if (modal) modal.style.display = 'flex';
        
        try {
            const requestBody = {
                amount_cents: amountCents,
                record_ids: recordIds,
                record_titles: recordTitles,
                device_id: selectedTerminalId
            };
            
            console.log('Sending checkout request:', requestBody);
            
            const response = await fetch(`${AppConfig.baseUrl}/api/square/terminal/checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(requestBody)
            });
            
            const responseText = await response.text();
            console.log('Response status:', response.status);
            console.log('Response body:', responseText);
            
            if (!response.ok) {
                let errorMessage = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.message || errorData.error || errorMessage;
                } catch (e) {
                    if (responseText) errorMessage = responseText;
                }
                throw new Error(errorMessage);
            }
            
            const data = JSON.parse(responseText);
            
            if (data.status !== 'success') {
                throw new Error(data.message || 'Failed to create checkout');
            }
            
            const checkout = data.checkout;
            activeCheckoutId = checkout.id;
            
            square_payment_sessions[activeCheckoutId] = {
                record_ids: recordIds,
                amount: total,
                status: 'CREATED',
                payment_id: null,
                checkout_data: checkout
            };
            
            startPollingCheckoutStatus(activeCheckoutId);
            
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="payment-status">
                        <div class="payment-status-icon processing">
                            <i class="fas fa-credit-card"></i>
                        </div>
                        <div class="payment-status-message">Checkout Created</div>
                        <div class="payment-status-detail">Amount: $${total.toFixed(2)}</div>
                        <div class="payment-status-detail">Please complete payment on the Square Terminal</div>
                        <div class="payment-status-detail" style="margin-top: 20px; font-weight: bold;">Waiting for payment...</div>
                    </div>
                `;
            }
            
        } catch (error) {
            console.error('Checkout error:', error);
            
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="payment-status">
                        <div class="payment-status-icon error">
                            <i class="fas fa-times-circle"></i>
                        </div>
                        <div class="payment-status-message">Checkout Failed</div>
                        <div class="payment-status-detail">${error.message}</div>
                        <button class="btn btn-primary" onclick="closeTerminalCheckoutModal()" style="margin-top: 20px;">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                `;
            }
            
            showCheckoutStatus(`Checkout failed: ${error.message}`, 'error');
        }
    };

    window.completeSquarePayment = async function() {
        if (!pendingCartCheckout) {
            showCheckoutStatus('No pending checkout found', 'error');
            return;
        }
        
        await processSquarePaymentSuccess();
        
        const modalBody = document.getElementById('terminal-checkout-body');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="payment-status">
                    <div class="payment-status-icon success">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="payment-status-message">Payment Recorded Successfully!</div>
                    <div class="payment-status-detail">Records have been updated to sold status</div>
                    <button class="btn btn-success" onclick="closeTerminalCheckoutModal()" style="margin-top: 20px;">
                        <i class="fas fa-check"></i> Done
                    </button>
                </div>
            `;
        }
        
        showCheckoutStatus('Payment completed successfully!', 'success');
    };

    async function processSquarePaymentSuccess() {
        showCheckoutLoading(true);
        
        let successCount = 0;
        let errorCount = 0;
        const soldItems = [];
        const consignorPayments = {};
        let squarePaymentId = null;
        
        if (activeCheckoutId) {
            console.log('Checking for payment ID for checkout:', activeCheckoutId);
            
            if (!square_payment_sessions || !square_payment_sessions[activeCheckoutId]) {
                throw new Error('No checkout session found');
            }
            
            squarePaymentId = square_payment_sessions[activeCheckoutId].payment_id;
            
            if (!squarePaymentId) {
                const url = `${AppConfig.baseUrl}/api/square/terminal/checkout/${activeCheckoutId}/status`;
                
                const response = await fetch(url, { credentials: 'include' });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to get checkout status: ${response.status} - ${errorText}`);
                }
                
                const data = await response.json();
                if (data.status !== 'success') {
                    throw new Error(data.error || 'Failed to get checkout status');
                }
                
                const checkout = data.checkout;
                if (checkout.status !== 'COMPLETED') {
                    throw new Error(`Checkout not completed. Status: ${checkout.status}`);
                }
                
                if (!checkout.payment_ids || checkout.payment_ids.length === 0) {
                    throw new Error('Checkout completed but no payment ID found');
                }
                
                squarePaymentId = checkout.payment_ids[0];
                square_payment_sessions[activeCheckoutId].payment_id = squarePaymentId;
            }
            
            console.log('Payment ID verified:', squarePaymentId);
        } else {
            throw new Error('No active checkout ID found');
        }
        
        for (const item of pendingCartCheckout.items) {
            if (item.type === 'accessory') {
                try {
                    const getResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`, {
                        credentials: 'include'
                    });
                    if (!getResponse.ok) {
                        throw new Error(`Failed to get accessory: ${getResponse.status}`);
                    }
                    const getData = await getResponse.json();
                    
                    if (getData.status !== 'success') {
                        throw new Error(getData.error || 'Failed to get accessory');
                    }
                    
                    const accessory = getData.accessory;
                    const newCount = accessory.count - 1;
                    
                    const updateResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                            count: newCount
                        })
                    });
                    
                    if (!updateResponse.ok) {
                        throw new Error(`Failed to update accessory: ${updateResponse.status}`);
                    }
                    
                    const updateData = await updateResponse.json();
                    if (updateData.status !== 'success') {
                        throw new Error(updateData.error || 'Failed to update accessory');
                    }
                    
                    successCount++;
                    soldItems.push({
                        ...item,
                        description: accessory.description,
                        store_price: accessory.store_price
                    });
                    
                } catch (error) {
                    console.error(`Error updating accessory ${item.original_id}:`, error);
                    errorCount++;
                    throw error;
                }
            } else if (item.type === 'custom') {
                successCount++;
                soldItems.push({
                    ...item,
                    description: item.note || 'Custom Item',
                    store_price: item.store_price
                });
            } else {
                try {
                    const response = await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                            status_id: 3
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Failed to update record: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    if (data.status !== 'success') {
                        throw new Error(data.error || 'Failed to update record');
                    }
                    
                    successCount++;
                    soldItems.push(item);
                    
                    if (item.consignor_id) {
                        const commissionRate = item.commission_rate || 20;
                        const consignorShare = item.store_price * (1 - (commissionRate / 100));
                        
                        if (!consignorPayments[item.consignor_id]) {
                            consignorPayments[item.consignor_id] = 0;
                        }
                        consignorPayments[item.consignor_id] += consignorShare;
                    }
                } catch (error) {
                    console.error(`Error updating record ${item.id}:`, error);
                    errorCount++;
                    throw error;
                }
            }
        }
        
        if (Object.keys(consignorPayments).length > 0) {
            let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
            for (const [consignorId, amount] of Object.entries(consignorPayments)) {
                storedOwed[consignorId] = (storedOwed[consignorId] || 0) + amount;
            }
            localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
            if (typeof window.consignorOwedAmounts !== 'undefined') {
                window.consignorOwedAmounts = storedOwed;
            }
        }
        
        if (successCount > 0) {
            let cashierName = 'Admin';
            try {
                const userData = localStorage.getItem('user');
                if (userData) {
                    const user = JSON.parse(userData);
                    cashierName = user.username || 'Admin';
                }
            } catch (e) {
                console.error('Error parsing user data:', e);
            }
            
            const subtotal = pendingCartCheckout.items.reduce((sum, item) => sum + (parseFloat(item.store_price) || 0), 0);
            
            const taxEnabled = getConfigValue('TAX_ENABLED') === 'true';
            const taxRate = taxEnabled ? (parseFloat(getConfigValue('TAX_RATE')) / 100) : 0;
            
            const discount = pendingCartCheckout.discount ? pendingCartCheckout.discount.value || 0 : 0;
            const discountedSubtotal = subtotal - discount;
            const tax = discountedSubtotal * taxRate;
            const total = discountedSubtotal + tax;
            
            const transaction = {
                id: `SQUARE-${Date.now()}`,
                square_payment_id: squarePaymentId,
                date: new Date().toISOString(),
                items: [...soldItems],
                subtotal: discountedSubtotal,
                discount: discount,
                discountType: pendingCartCheckout.discount ? pendingCartCheckout.discount.type : null,
                discountAmount: pendingCartCheckout.discount ? pendingCartCheckout.discount.amount : 0,
                tax: tax,
                taxRate: taxRate * 100,
                total: total,
                paymentMethod: 'Square Terminal',
                cashier: cashierName,
                storeName: getConfigValue('STORE_NAME') || 'PigStyle Music',
                storeAddress: getConfigValue('STORE_ADDRESS') || '',
                storePhone: getConfigValue('STORE_PHONE') || '',
                footer: getConfigValue('RECEIPT_FOOTER') || 'Thank you for your purchase!',
                consignorPayments: consignorPayments
            };
            
            if (typeof window.saveReceipt === 'function') {
                await window.saveReceipt(transaction);
            }
            
            const receiptText = formatReceiptForPrinter(transaction);
            if (typeof window.printToThermalPrinter === 'function') {
                window.printToThermalPrinter(receiptText);
            }
            
            checkoutCart = [];
            currentDiscount = { amount: 0, type: 'percentage', value: 0 };
            const discountAmount = document.getElementById('discount-amount');
            const discountType = document.getElementById('discount-type');
            if (discountAmount) discountAmount.value = '';
            if (discountType) discountType.value = 'percentage';
            updateCartDisplay();
            searchRecordsAndAccessories();
            
            showCheckoutStatus(`Successfully sold ${successCount} items`, 'success');
        } else {
            throw new Error('No items were successfully processed');
        }
        
        showCheckoutLoading(false);
        pendingCartCheckout = null;
    }

    window.cancelTerminalCheckout = async function() {
        if (!activeCheckoutId) {
            showCheckoutStatus('No active checkout to cancel', 'info');
            return;
        }
        
        if (square_payment_sessions[activeCheckoutId] && square_payment_sessions[activeCheckoutId].pollInterval) {
            clearInterval(square_payment_sessions[activeCheckoutId].pollInterval);
        }
        
        const modalBody = document.getElementById('terminal-checkout-body');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="payment-status">
                    <div class="payment-status-icon processing">
                        <i class="fas fa-spinner fa-pulse"></i>
                    </div>
                    <div class="payment-status-message">Cancelling checkout...</div>
                </div>
            `;
        }
        
        try {
            console.log('Original checkout ID:', activeCheckoutId);
            
            const url = `${AppConfig.baseUrl}/api/square/terminal/checkout/${activeCheckoutId}/cancel`;
            console.log('Sending cancel request to:', url);
            
            const response = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({})
            });
            
            console.log('Cancel response status:', response.status);
            
            const responseText = await response.text();
            console.log('Cancel response body:', responseText);
            
            if (!response.ok) {
                let errorMessage = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.message || errorData.error || errorMessage;
                } catch (e) {
                    if (responseText) errorMessage = responseText;
                }
                throw new Error(errorMessage);
            }
            
            const data = JSON.parse(responseText);
            
            if (data.status !== 'success') {
                throw new Error(data.message || 'Failed to cancel checkout');
            }
            
            showCheckoutStatus('Checkout cancelled successfully', 'success');
            
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="payment-status">
                        <div class="payment-status-icon success">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="payment-status-message">Checkout Cancelled Successfully</div>
                        <button class="btn btn-primary" onclick="closeTerminalCheckoutModal()" style="margin-top: 20px;">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                `;
            }
            
            if (square_payment_sessions[activeCheckoutId]) {
                delete square_payment_sessions[activeCheckoutId];
            }
            
            activeCheckoutId = null;
            
        } catch (error) {
            console.error('Cancel checkout error:', error);
            
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="payment-status">
                        <div class="payment-status-icon error">
                            <i class="fas fa-times-circle"></i>
                        </div>
                        <div class="payment-status-message">Failed to Cancel Checkout</div>
                        <div class="payment-status-detail">${error.message}</div>
                        <div class="payment-status-detail" style="font-size: 12px; margin-top: 10px;">
                            Checkout ID: ${escapeHtml(activeCheckoutId)}
                        </div>
                        <button class="btn btn-primary" onclick="closeTerminalCheckoutModal()" style="margin-top: 20px;">
                            <i class="fas fa-times"></i> Close
                        </button>
                        <button class="btn btn-secondary" onclick="cancelTerminalCheckout()" style="margin-top: 10px;">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    </div>
                `;
            }
            
            showCheckoutStatus(`Failed to cancel: ${error.message}`, 'error');
        }
    };

    window.closeTerminalCheckoutModal = function() {
        const modal = document.getElementById('terminal-checkout-modal');
        if (modal) modal.style.display = 'none';
        
        if (activeCheckoutId && square_payment_sessions[activeCheckoutId] && square_payment_sessions[activeCheckoutId].pollInterval) {
            clearInterval(square_payment_sessions[activeCheckoutId].pollInterval);
        }
        
        activeCheckoutId = null;
    };

    // ============================================================================
    // Cash Payment Functions
    // ============================================================================

    window.showTenderModal = function() {
        if (checkoutCart.length === 0) {
            showCheckoutStatus('Cart is empty', 'error');
            return;
        }
        
        const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
        
        const tenderTotalDue = document.getElementById('tender-total-due');
        const tenderAmount = document.getElementById('tender-amount');
        const changeDisplay = document.getElementById('change-display-container');
        const completeBtn = document.getElementById('complete-payment-btn');
        const modal = document.getElementById('tender-modal');
        
        if (tenderTotalDue) tenderTotalDue.textContent = `$${total.toFixed(2)}`;
        if (tenderAmount) {
            tenderAmount.value = '';
            tenderAmount.removeEventListener('input', handleTenderInput);
            tenderAmount.addEventListener('input', handleTenderInput);
        }
        if (changeDisplay) changeDisplay.style.display = 'none';
        if (completeBtn) completeBtn.disabled = true;
        
        if (modal) modal.style.display = 'flex';
        if (tenderAmount) tenderAmount.focus();
    };

    function handleTenderInput(e) {
        const tendered = parseFloat(e.target.value) || 0;
        const total = parseFloat(document.getElementById('tender-total-due')?.textContent.replace('$', '') || '0');
        const changeDisplay = document.getElementById('change-display-container');
        const changeAmount = document.getElementById('change-amount');
        const completeBtn = document.getElementById('complete-payment-btn');
        
        if (tendered >= total) {
            const change = tendered - total;
            if (changeAmount) changeAmount.textContent = `$${change.toFixed(2)}`;
            if (changeDisplay) changeDisplay.style.display = 'block';
            if (completeBtn) completeBtn.disabled = false;
        } else {
            if (changeDisplay) changeDisplay.style.display = 'none';
            if (completeBtn) completeBtn.disabled = true;
        }
    }

    window.closeTenderModal = function() {
        const modal = document.getElementById('tender-modal');
        if (modal) modal.style.display = 'none';
    };

    window.processCashPayment = async function() {
        const tendered = parseFloat(document.getElementById('tender-amount')?.value) || 0;
        const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
        
        if (tendered < total) {
            showCheckoutStatus('Insufficient payment', 'error');
            return;
        }
        
        const change = tendered - total;
        
        closeTenderModal();
        showCheckoutLoading(true);
        
        let successCount = 0;
        let errorCount = 0;
        const soldItems = [];
        const consignorPayments = {};
        
        try {
            for (const item of checkoutCart) {
                if (item.type === 'accessory') {
                    try {
                        const getResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`, {
                            credentials: 'include'
                        });
                        if (!getResponse.ok) {
                            throw new Error(`Failed to get accessory: ${getResponse.status}`);
                        }
                        const getData = await getResponse.json();
                        
                        if (getData.status !== 'success') {
                            throw new Error(getData.error || 'Failed to get accessory');
                        }
                        
                        const accessory = getData.accessory;
                        const newCount = accessory.count - 1;
                        
                        const updateResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            credentials: 'include',
                            body: JSON.stringify({
                                count: newCount
                            })
                        });
                        
                        if (!updateResponse.ok) {
                            throw new Error(`Failed to update accessory: ${updateResponse.status}`);
                        }
                        
                        const updateData = await updateResponse.json();
                        if (updateData.status !== 'success') {
                            throw new Error(updateData.error || 'Failed to update accessory');
                        }
                        
                        successCount++;
                        soldItems.push({
                            ...item,
                            description: accessory.description,
                            store_price: accessory.store_price
                        });
                        
                    } catch (error) {
                        console.error(`Error updating accessory ${item.original_id}:`, error);
                        errorCount++;
                        throw error;
                    }
                } else if (item.type === 'custom') {
                    successCount++;
                    soldItems.push({
                        ...item,
                        description: item.note || 'Custom Item',
                        store_price: item.store_price
                    });
                } else {
                    try {
                        const response = await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            credentials: 'include',
                            body: JSON.stringify({
                                status_id: 3
                            })
                        });
                        
                        if (!response.ok) {
                            throw new Error(`Failed to update record: ${response.status}`);
                        }
                        
                        const data = await response.json();
                        if (data.status !== 'success') {
                            throw new Error(data.error || 'Failed to update record');
                        }
                        
                        successCount++;
                        soldItems.push(item);
                        
                        if (item.consignor_id) {
                            const commissionRate = item.commission_rate || 20;
                            const consignorShare = item.store_price * (1 - (commissionRate / 100));
                            
                            if (!consignorPayments[item.consignor_id]) {
                                consignorPayments[item.consignor_id] = 0;
                            }
                            consignorPayments[item.consignor_id] += consignorShare;
                        }
                    } catch (error) {
                        console.error(`Error updating record ${item.id}:`, error);
                        errorCount++;
                        throw error;
                    }
                }
            }
            
            if (Object.keys(consignorPayments).length > 0) {
                let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
                for (const [consignorId, amount] of Object.entries(consignorPayments)) {
                    storedOwed[consignorId] = (storedOwed[consignorId] || 0) + amount;
                }
                localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
                if (typeof window.consignorOwedAmounts !== 'undefined') {
                    window.consignorOwedAmounts = storedOwed;
                }
            }
            
            if (successCount > 0) {
                let cashierName = 'Admin';
                try {
                    const userData = localStorage.getItem('user');
                    if (userData) {
                        const user = JSON.parse(userData);
                        cashierName = user.username || 'Admin';
                    }
                } catch (e) {
                    console.error('Error parsing user data:', e);
                }
                
                const subtotal = checkoutCart.reduce((sum, item) => sum + (parseFloat(item.store_price) || 0), 0);
                
                const taxEnabled = getConfigValue('TAX_ENABLED') === 'true';
                const taxRate = taxEnabled ? (parseFloat(getConfigValue('TAX_RATE')) / 100) : 0;
                
                const discount = currentDiscount.value || 0;
                const discountedSubtotal = subtotal - discount;
                const tax = discountedSubtotal * taxRate;
                
                // Clean and validate all item data
                const cleanedItems = soldItems.map(item => ({
                    id: item.id || null,
                    type: item.type || 'record',
                    artist: item.artist || null,
                    title: item.title || null,
                    description: item.description || item.note || null,
                    note: item.note || null,
                    store_price: parseFloat(item.store_price) || 0,
                    catalog_number: item.catalog_number || null,
                    barcode: item.barcode || null,
                    consignor_id: item.consignor_id || null,
                    original_id: item.original_id || null
                }));
                
                const transaction = {
                    id: `CASH-${Date.now()}`,
                    date: new Date().toISOString(),
                    items: cleanedItems,
                    subtotal: parseFloat(discountedSubtotal) || 0,
                    discount: parseFloat(discount) || 0,
                    discountType: currentDiscount.type,
                    discountAmount: parseFloat(currentDiscount.amount) || 0,
                    tax: parseFloat(tax) || 0,
                    taxRate: parseFloat(taxRate * 100) || 0,
                    total: parseFloat(total) || 0,
                    tendered: parseFloat(tendered) || 0,
                    change: parseFloat(change) || 0,
                    paymentMethod: 'Cash',
                    cashier: cashierName || 'Admin',
                    storeName: getConfigValue('STORE_NAME') || 'PigStyle Music',
                    storeAddress: getConfigValue('STORE_ADDRESS') || '',
                    storePhone: getConfigValue('STORE_PHONE') || '',
                    footer: getConfigValue('RECEIPT_FOOTER') || 'Thank you for your purchase!',
                    consignorPayments: consignorPayments || {}
                };
                
                console.log('Saving receipt to database:', transaction.id);
                if (typeof window.saveReceipt === 'function') {
                    await window.saveReceipt(transaction);
                    console.log('Receipt saved successfully');
                } else {
                    console.error('saveReceipt function not found');
                }
                
                console.log('Attempting to print receipt to thermal printer...');
                const receiptText = formatReceiptForPrinter(transaction);
                
                // Always show receipt modal regardless of printer status
                showPrintableReceipt(receiptText);
                
                // Try to print to thermal printer if function exists
                if (typeof window.printToThermalPrinter === 'function') {
                    try {
                        await window.printToThermalPrinter(receiptText);
                        console.log('Receipt sent to printer');
                    } catch (printError) {
                        console.error('Failed to print receipt:', printError);
                    }
                }
                
                checkoutCart = [];
                currentDiscount = { amount: 0, type: 'percentage', value: 0 };
                const discountAmount = document.getElementById('discount-amount');
                const discountType = document.getElementById('discount-type');
                if (discountAmount) discountAmount.value = '';
                if (discountType) discountType.value = 'percentage';
                updateCartDisplay();
                searchRecordsAndAccessories();
                
                showCheckoutStatus(`Successfully sold ${successCount} items. Receipt displayed.`, 'success');
            } else {
                throw new Error('No items were successfully processed');
            }
        } catch (error) {
            console.error('Error processing payment:', error);
            showCheckoutStatus(`Payment failed: ${error.message}`, 'error');
        } finally {
            showCheckoutLoading(false);
        }
    };

    // Function to show receipt in a printable modal
    function showPrintableReceipt(receiptText) {
        // Create or get the receipt modal
        let modal = document.getElementById('printable-receipt-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'printable-receipt-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px; width: 90%;">
                    <div class="modal-header">
                        <h3 class="modal-title">Receipt</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').style.display='none'">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; font-size: 14px; line-height: 1.5;" id="receipt-content-display">
                            ${escapeHtml(receiptText).replace(/\n/g, '<br>')}
                        </div>
                        <p style="color: #666; font-size: 12px; margin-top: 15px; text-align: center;">
                            <i class="fas fa-info-circle"></i> You can print this receipt using your browser's print function.
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="window.print()">
                            <i class="fas fa-print"></i> Browser Print
                        </button>
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').style.display='none'">
                            Close
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            const contentDiv = modal.querySelector('#receipt-content-display');
            if (contentDiv) {
                contentDiv.innerHTML = escapeHtml(receiptText).replace(/\n/g, '<br>');
            }
        }
        
        modal.style.display = 'flex';
    }

    function formatReceiptForPrinter(transaction) {
        const storeName = transaction.storeName || 'PigStyle Music';
        const storeAddress = transaction.storeAddress || '';
        const storePhone = transaction.storePhone || '';
        const footer = transaction.footer || 'Thank you for your purchase!';
        
        let receipt = '';
        receipt += ''.padStart(32, '=') + '\n';
        receipt += centerText(storeName, 32) + '\n';
        if (storeAddress) receipt += centerText(storeAddress, 32) + '\n';
        if (storePhone) receipt += centerText(storePhone, 32) + '\n';
        receipt += ''.padStart(32, '=') + '\n\n';
        
        receipt += `Receipt #: ${transaction.id}\n`;
        receipt += `Date: ${new Date(transaction.date).toLocaleString()}\n`;
        receipt += `Cashier: ${transaction.cashier || 'Admin'}\n`;
        receipt += `Payment: ${transaction.paymentMethod || 'Cash'}\n\n`;
        
        receipt += ''.padStart(32, '-') + '\n';
        
        transaction.items.forEach(item => {
            let description = '';
            if (item.type === 'accessory') {
                description = item.description || 'Accessory';
            } else if (item.type === 'custom') {
                description = item.note || 'Custom Item';
            } else {
                description = `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`;
            }
            
            const price = item.store_price || 0;
            const shortDesc = description.length > 20 ? description.substring(0, 18) + '..' : description;
            receipt += `${shortDesc.padEnd(20)} $${price.toFixed(2).padStart(8)}\n`;
        });
        
        receipt += ''.padStart(32, '-') + '\n';
        receipt += `Subtotal:${''.padStart(14)} $${(transaction.subtotal || 0).toFixed(2).padStart(8)}\n`;
        
        if (transaction.discount && transaction.discount > 0) {
            const discountText = transaction.discountType === 'percentage' ? 
                `Discount (${transaction.discountAmount}%):` : 'Discount:';
            receipt += `${discountText.padEnd(22)} -$${(transaction.discount || 0).toFixed(2).padStart(8)}\n`;
        }
        
        receipt += `Tax (${transaction.taxRate || 0}%):${''.padStart(12)} $${(transaction.tax || 0).toFixed(2).padStart(8)}\n`;
        receipt += ''.padStart(32, '=') + '\n';
        receipt += `TOTAL:${''.padStart(16)} $${(transaction.total || 0).toFixed(2).padStart(8)}\n`;
        receipt += ''.padStart(32, '=') + '\n\n';
        
        if (transaction.paymentMethod === 'Cash' && transaction.change > 0) {
            receipt += `Tendered: $${(transaction.tendered || 0).toFixed(2)}\n`;
            receipt += `Change: $${(transaction.change || 0).toFixed(2)}\n\n`;
        }
        
        if (transaction.square_payment_id) {
            receipt += `Square ID: ${transaction.square_payment_id}\n\n`;
        }
        
        receipt += centerText(footer, 32) + '\n';
        receipt += ''.padStart(32, '=') + '\n';
        
        return receipt;
    }

    function centerText(text, width) {
        const padding = Math.max(0, width - text.length);
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    }

    // ============================================================================
    // Print Function (Modified to always show modal)
    // ============================================================================

    window.printToThermalPrinter = function(text) {
        console.log('Thermal print requested, but no printer connected');
        console.log('Receipt text:', text);
        
        // Show the receipt in a modal instead of pretending to print
        showPrintableReceipt(text);
        
        // Return false to indicate printing wasn't actually done
        return false;
    };

    // ============================================================================
    // Event Listeners
    // ============================================================================

    document.addEventListener('tabChanged', function(e) {
        if (e.detail.tabName === 'check-out') {
            const searchResults = document.getElementById('search-results');
            if (searchResults && currentSearchResults.length === 0) {
                searchResults.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <i class="fas fa-search" style="font-size: 48px; margin-bottom: 20px; color: #ccc;"></i>
                        <p>Enter a search term to find records or accessories</p>
                    </div>
                `;
            }
            refreshTerminals();
        }
    });

    // Add Enter key support for search
    document.addEventListener('keypress', function(e) {
        if (e.target.id === 'search-query' && e.key === 'Enter') {
            e.preventDefault();
            searchRecordsAndAccessories();
        }
    });

    console.log('✅ checkout.js loaded and functions exposed globally');
})();