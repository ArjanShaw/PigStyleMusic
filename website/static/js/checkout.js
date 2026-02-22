// ============================================================================
// checkout.js - Check Out Tab Functionality
// ============================================================================

// Shopping Cart Variables
let checkoutCart = [];
let pendingCartCheckout = null;
let currentDiscount = {
    amount: 0,
    type: 'fixed',
    value: 0
};
let currentSearchResults = [];
let availableTerminals = [];
let selectedTerminalId = null;
let activeCheckoutId = null;

// Terminal Management
async function refreshTerminals() {
    const terminalList = document.getElementById('terminal-list');
    terminalList.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="loading-spinner" style="width: 30px; height: 30px;"></div><p>Loading terminals...</p></div>';
    
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
}

function renderTerminalList(terminals) {
    const terminalList = document.getElementById('terminal-list');
    
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

function selectTerminal(terminalId) {
    selectedTerminalId = terminalId;
    renderTerminalList(availableTerminals);
}

// Custom Item Functions
function addCustomItemToCart() {
    const note = document.getElementById('custom-note').value.trim();
    const price = parseFloat(document.getElementById('custom-price').value);
    
    if (!note) {
        showCheckoutStatus('Please enter a description for the custom item', 'error');
        document.getElementById('custom-note').focus();
        return;
    }
    
    if (isNaN(price) || price <= 0) {
        showCheckoutStatus('Please enter a valid price greater than 0', 'error');
        document.getElementById('custom-price').focus();
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
}

function removeCustomItemFromCart(itemId) {
    const index = checkoutCart.findIndex(item => item.type === 'custom' && item.id === itemId);
    if (index !== -1) {
        const removed = checkoutCart.splice(index, 1)[0];
        updateCartDisplay();
        showCheckoutStatus(`Removed custom item: "${removed.note}"`, 'info');
    }
}

// Search Functions
async function searchRecordsAndAccessories() {
    const query = document.getElementById('search-query').value.trim();
    if (!query) {
        showCheckoutStatus('Please enter a search term', 'error');
        return;
    }
    
    const activeOnly = document.getElementById('filter-active').checked;
    const barcodeOnly = document.getElementById('filter-barcode').checked;
    
    showCheckoutLoading(true);
    
    try {
        let recordsUrl = `${AppConfig.baseUrl}/records/search?q=${encodeURIComponent(query)}`;
        const recordsResponse = await fetch(recordsUrl);
        const recordsData = await recordsResponse.json();
        
        const accessoriesUrl = `${AppConfig.baseUrl}/accessories`;
        const accessoriesResponse = await fetch(accessoriesUrl);
        const accessoriesData = await accessoriesResponse.json();
        
        let records = [];
        let accessories = [];
        
        if (recordsData.status === 'success') {
            records = recordsData.records || [];
        }
        
        if (accessoriesData.status === 'success') {
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
        }
        
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
        showCheckoutStatus('Error searching items', 'error');
    }
    
    showCheckoutLoading(false);
}

function renderSearchResults(results) {
    const container = document.getElementById('search-results');
    document.getElementById('search-result-count').textContent = results.length;
    document.getElementById('displayed-results').textContent = results.length;
    
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
            const consignorInfo = consignorCache[item.consignor_id] || { username: 'None', initials: '' };
            
            html += `
                <div class="search-result-item">
                    <div class="result-details">
                        <div class="result-artist">${escapeHtml(item.artist) || 'Unknown Artist'}</div>
                        <div class="result-title">${escapeHtml(item.title) || 'Unknown Title'}</div>
                        <div class="result-meta">
                            <span class="result-catalog">${escapeHtml(item.catalog_number) || 'No catalog'}</span>
                            ${item.barcode ? `<span class="result-barcode"><i class="fas fa-barcode"></i> ${escapeHtml(item.barcode)}</span>` : ''}
                            <span>Status: ${getStatusText(item.status_id)}</span>
                            ${item.consignor_id ? `<span><i class="fas fa-user"></i> ${escapeHtml(consignorInfo.username)}</span>` : ''}
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

// Cart Functions
function addAccessoryToCart(id, description, price) {
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
        barcode: allAccessories ? (allAccessories.find(a => a.id === id)?.bar_code || '') : ''
    };
    
    checkoutCart.push(cartItem);
    
    updateCartDisplay();
    searchRecordsAndAccessories();
    showCheckoutStatus(`Added "${description}" to cart`, 'success');
}

function removeAccessoryFromCart(originalId) {
    const index = checkoutCart.findIndex(item => item.type === 'accessory' && item.original_id === originalId);
    if (index !== -1) {
        const removed = checkoutCart.splice(index, 1)[0];
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus(`Removed "${removed.description}" from cart`, 'info');
    }
}

function addToCartFromData(recordId) {
    const record = currentSearchResults.find(r => r.id === recordId) || 
                  allRecords.find(r => r.id === recordId);
    if (record && record.type !== 'accessory') {
        addToCart(record);
    }
}

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

function removeFromCart(recordId) {
    const recordIndex = checkoutCart.findIndex(item => item.id === recordId);
    if (recordIndex !== -1) {
        const removed = checkoutCart.splice(recordIndex, 1)[0];
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus(`Removed "${removed.title}" from cart`, 'info');
    }
}

function clearCart() {
    if (checkoutCart.length === 0) return;
    
    if (confirm('Are you sure you want to clear the cart?')) {
        checkoutCart = [];
        currentDiscount = { amount: 0, type: 'fixed', value: 0 };
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus('Cart cleared', 'info');
    }
}

function updateCartWithDiscount() {
    const discountAmount = parseFloat(document.getElementById('discount-amount').value) || 0;
    const discountType = document.getElementById('discount-type').value;
    const errorDiv = document.getElementById('discount-error');
    
    currentDiscount = {
        amount: discountAmount,
        type: discountType,
        value: 0
    };
    
    errorDiv.style.display = 'none';
    
    updateCartDisplay();
}

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
            if (currentDiscount.amount <= 100) {
                discountValue = subtotal * (currentDiscount.amount / 100);
            } else {
                errorDiv.textContent = 'Percentage discount cannot exceed 100%';
                errorDiv.style.display = 'block';
                currentDiscount.value = 0;
                discountRow.style.display = 'none';
            }
        } else {
            if (currentDiscount.amount <= subtotal) {
                discountValue = currentDiscount.amount;
            } else {
                errorDiv.textContent = 'Fixed discount cannot exceed subtotal';
                errorDiv.style.display = 'block';
                currentDiscount.value = 0;
                discountRow.style.display = 'none';
            }
        }
        
        if (discountValue > 0) {
            currentDiscount.value = discountValue;
            discountDisplay.textContent = `-$${discountValue.toFixed(2)}`;
            discountRow.style.display = 'flex';
        }
    } else {
        discountRow.style.display = 'none';
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
    
    if (checkoutCart.length === 0) {
        cartSection.style.display = 'none';
        squareBtn.disabled = true;
        return;
    }
    
    cartSection.style.display = 'block';
    cartCount.textContent = `${checkoutCart.length} item${checkoutCart.length !== 1 ? 's' : ''}`;
    
    let subtotal = 0;
    checkoutCart.forEach(item => {
        const price = parseFloat(item.store_price);
        subtotal += price;
    });
    
    const discountedSubtotal = calculateTotalsWithDiscount();
    
    let taxRate = 0;
    try {
        taxRate = getConfigValue('TAX_ENABLED') ? (parseFloat(getConfigValue('TAX_RATE')) / 100) : 0;
    } catch (e) {
        console.log('Tax config not found, using 0');
    }
    
    const tax = discountedSubtotal * taxRate;
    const total = discountedSubtotal + tax;
    
    cartSubtotal.textContent = `$${discountedSubtotal.toFixed(2)}`;
    cartTax.textContent = `$${tax.toFixed(2)}`;
    cartTotal.textContent = `$${total.toFixed(2)}`;
    
    squareBtn.disabled = availableTerminals.length === 0;
    
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
    
    cartItems.innerHTML = cartHtml;
}

// Square Payment Functions
function processSquarePayment() {
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
}

function renderTerminalSelectionModal() {
    const onlineTerminals = availableTerminals.filter(t => t.status === 'ONLINE');
    
    const selectionList = document.getElementById('terminal-selection-list');
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
    
    document.getElementById('terminal-selection-modal').style.display = 'flex';
}

function selectTerminalForCheckout(terminalId) {
    selectedTerminalId = terminalId;
    
    document.querySelectorAll('input[name="terminal"]').forEach(radio => {
        radio.checked = radio.value === terminalId;
    });
    
    document.getElementById('confirm-terminal-btn').disabled = false;
}

function closeTerminalSelectionModal() {
    document.getElementById('terminal-selection-modal').style.display = 'none';
}

async function initiateCartTerminalCheckout() {
    if (!pendingCartCheckout) {
        showCheckoutStatus('No items selected for checkout', 'error');
        closeTerminalSelectionModal();
        return;
    }
    
    if (!selectedTerminalId) {
        showCheckoutStatus('Please select a terminal', 'error');
        return;
    }
    
    const total = parseFloat(document.getElementById('cart-total').textContent.replace('$', ''));
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
    document.getElementById('terminal-checkout-modal').style.display = 'flex';
    
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
        
        if (data.status === 'success') {
            const checkout = data.checkout;
            activeCheckoutId = checkout.id;
            
            modalBody.innerHTML = `
                <div class="payment-status">
                    <div class="payment-status-icon processing">
                        <i class="fas fa-credit-card"></i>
                    </div>
                    <div class="payment-status-message">Checkout Created</div>
                    <div class="payment-status-detail">Amount: $${total.toFixed(2)}</div>
                    <div class="payment-status-detail">Please complete payment on the Square Terminal</div>
                    <div class="payment-status-detail" style="margin-top: 20px; font-weight: bold;">After payment is complete, click below to update record status</div>
                    <button class="btn btn-success" onclick="completeSquarePayment()" style="margin-top: 20px;">
                        <i class="fas fa-check-circle"></i> Payment Complete - Update Records
                    </button>
                    <button class="btn btn-warning" onclick="cancelTerminalCheckout()" style="margin-top: 10px;">
                        <i class="fas fa-times"></i> Cancel Payment
                    </button>
                </div>
            `;
        } else {
            throw new Error(data.message || 'Failed to create checkout');
        }
    } catch (error) {
        console.error('Checkout error:', error);
        
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
        
        showCheckoutStatus(`Checkout failed: ${error.message}`, 'error');
    }
}

async function completeSquarePayment() {
    if (!pendingCartCheckout) {
        showCheckoutStatus('No pending checkout found', 'error');
        return;
    }
    
    await processSquarePaymentSuccess();
    
    const modalBody = document.getElementById('terminal-checkout-body');
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
    
    showCheckoutStatus('Payment completed successfully!', 'success');
}

async function processSquarePaymentSuccess() {
    showCheckoutLoading(true);
    
    let successCount = 0;
    let errorCount = 0;
    const soldItems = [];
    const consignorPayments = {};
    
    for (const item of pendingCartCheckout.items) {
        if (item.type === 'accessory') {
            try {
                const getResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`);
                const getData = await getResponse.json();
                
                if (getData.status === 'success') {
                    const accessory = getData.accessory;
                    const newCount = accessory.count - 1;
                    
                    const updateResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            count: newCount
                        })
                    });
                    
                    if (updateResponse.ok) {
                        const updateData = await updateResponse.json();
                        if (updateData.status === 'success') {
                            successCount++;
                            soldItems.push({
                                ...item,
                                description: accessory.description,
                                store_price: accessory.store_price
                            });
                        } else {
                            errorCount++;
                        }
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error updating accessory ${item.original_id}:`, error);
                errorCount++;
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
                    body: JSON.stringify({
                        status_id: 3
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success') {
                        successCount++;
                        soldItems.push(item);
                        
                        if (item.consignor_id) {
                            const commissionRate = item.commission_rate || 10;
                            const consignorShare = item.store_price * (1 - (commissionRate / 100));
                            
                            if (!consignorPayments[item.consignor_id]) {
                                consignorPayments[item.consignor_id] = 0;
                            }
                            consignorPayments[item.consignor_id] += consignorShare;
                        }
                        
                        const recordIndex = allRecords.findIndex(r => r.id === item.id);
                        if (recordIndex !== -1) {
                            allRecords[recordIndex].status_id = 3;
                        }
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error updating record ${item.id}:`, error);
                errorCount++;
            }
        }
    }
    
    if (Object.keys(consignorPayments).length > 0) {
        let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
        for (const [consignorId, amount] of Object.entries(consignorPayments)) {
            storedOwed[consignorId] = (storedOwed[consignorId] || 0) + amount;
        }
        localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
        consignorOwedAmounts = storedOwed;
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
        let taxRate = 0;
        try {
            taxRate = getConfigValue('TAX_ENABLED') ? (getConfigValue('TAX_RATE') / 100) : 0;
        } catch (e) {
            console.log('Tax config not found, using 0');
        }
        
        const discount = pendingCartCheckout.discount ? pendingCartCheckout.discount.value || 0 : 0;
        const discountedSubtotal = subtotal - discount;
        const tax = discountedSubtotal * taxRate;
        const total = discountedSubtotal + tax;
        
        const transaction = {
            id: `SQUARE-${Date.now()}`,
            date: new Date(),
            items: [...soldItems],
            subtotal: discountedSubtotal,
            discount: discount,
            tax: tax,
            taxRate: taxRate * 100,
            total: total,
            paymentMethod: 'Square Terminal',
            cashier: cashierName,
            storeName: dbConfigValues['STORE_NAME'] ? dbConfigValues['STORE_NAME'].value : 'PigStyle Music',
            storeAddress: dbConfigValues['STORE_ADDRESS'] ? dbConfigValues['STORE_ADDRESS'].value : '',
            storePhone: dbConfigValues['STORE_PHONE'] ? dbConfigValues['STORE_PHONE'].value : '',
            footer: dbConfigValues['RECEIPT_FOOTER'] ? dbConfigValues['RECEIPT_FOOTER'].value : 'Thank you for your purchase!',
            consignorPayments: consignorPayments
        };
        
        saveReceipt(transaction);
        
        const receiptText = formatReceiptForPrinter(transaction);
        printToThermalPrinter(receiptText);
        
        checkoutCart = [];
        currentDiscount = { amount: 0, type: 'fixed', value: 0 };
        updateCartDisplay();
        searchRecordsAndAccessories();
        
        showCheckoutStatus(`Successfully sold ${successCount} items${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
    } else {
        showCheckoutStatus(`Failed to process sale: ${errorCount} errors`, 'error');
    }
    
    showCheckoutLoading(false);
    pendingCartCheckout = null;
}

async function cancelTerminalCheckout() {
    if (!activeCheckoutId) {
        showCheckoutStatus('No active checkout to cancel', 'info');
        return;
    }
    
    const modalBody = document.getElementById('terminal-checkout-body');
    modalBody.innerHTML = `
        <div class="payment-status">
            <div class="payment-status-icon processing">
                <i class="fas fa-spinner fa-pulse"></i>
            </div>
            <div class="payment-status-message">Cancelling checkout...</div>
        </div>
    `;
    
    try {
        console.log('Original checkout ID:', activeCheckoutId);
        
        const checkoutIdToUse = `termapia:${activeCheckoutId}`;
        console.log('Using checkout ID with prefix:', checkoutIdToUse);
        
        const encodedId = encodeURIComponent(checkoutIdToUse);
        const url = `${AppConfig.baseUrl}/api/square/terminal/checkout/${encodedId}/cancel`;
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
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            data = { message: responseText };
        }
        
        if (response.ok) {
            if (data.status === 'success') {
                showCheckoutStatus('Checkout cancelled successfully', 'success');
                
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
                
                activeCheckoutId = null;
            } else {
                throw new Error(data.message || 'Failed to cancel checkout');
            }
        } else {
            let errorMessage = `Error ${response.status}: ${response.statusText}`;
            if (data.message) {
                errorMessage = data.message;
            }
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error('Cancel checkout error:', error);
        
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
        
        showCheckoutStatus(`Failed to cancel: ${error.message}`, 'error');
    }
}

function closeTerminalCheckoutModal() {
    document.getElementById('terminal-checkout-modal').style.display = 'none';
    activeCheckoutId = null;
}

// Cash Payment Functions
function showTenderModal() {
    if (checkoutCart.length === 0) {
        showCheckoutStatus('Cart is empty', 'error');
        return;
    }
    
    const total = parseFloat(document.getElementById('cart-total').textContent.replace('$', ''));
    
    document.getElementById('tender-total-due').textContent = `$${total.toFixed(2)}`;
    document.getElementById('tender-amount').value = '';
    document.getElementById('change-display-container').style.display = 'none';
    document.getElementById('complete-payment-btn').disabled = true;
    
    document.getElementById('tender-modal').style.display = 'flex';
    document.getElementById('tender-amount').focus();
    
    document.getElementById('tender-amount').addEventListener('input', function(e) {
        const tendered = parseFloat(e.target.value) || 0;
        const total = parseFloat(document.getElementById('tender-total-due').textContent.replace('$', ''));
        
        if (tendered >= total) {
            const change = tendered - total;
            document.getElementById('change-amount').textContent = `$${change.toFixed(2)}`;
            document.getElementById('change-display-container').style.display = 'block';
            document.getElementById('complete-payment-btn').disabled = false;
        } else {
            document.getElementById('change-display-container').style.display = 'none';
            document.getElementById('complete-payment-btn').disabled = true;
        }
    });
}

function closeTenderModal() {
    document.getElementById('tender-modal').style.display = 'none';
}

async function processCashPayment() {
    const tendered = parseFloat(document.getElementById('tender-amount').value) || 0;
    const total = parseFloat(document.getElementById('cart-total').textContent.replace('$', ''));
    
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
    
    for (const item of checkoutCart) {
        if (item.type === 'accessory') {
            try {
                const getResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`);
                const getData = await getResponse.json();
                
                if (getData.status === 'success') {
                    const accessory = getData.accessory;
                    const newCount = accessory.count - 1;
                    
                    const updateResponse = await fetch(`${AppConfig.baseUrl}/accessories/${item.original_id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            count: newCount
                        })
                    });
                    
                    if (updateResponse.ok) {
                        const updateData = await updateResponse.json();
                        if (updateData.status === 'success') {
                            successCount++;
                            soldItems.push({
                                ...item,
                                description: accessory.description,
                                store_price: accessory.store_price
                            });
                        } else {
                            errorCount++;
                        }
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error updating accessory ${item.original_id}:`, error);
                errorCount++;
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
                    body: JSON.stringify({
                        status_id: 3
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success') {
                        successCount++;
                        soldItems.push(item);
                        
                        if (item.consignor_id) {
                            const commissionRate = item.commission_rate || 10;
                            const consignorShare = item.store_price * (1 - (commissionRate / 100));
                            
                            if (!consignorPayments[item.consignor_id]) {
                                consignorPayments[item.consignor_id] = 0;
                            }
                            consignorPayments[item.consignor_id] += consignorShare;
                        }
                        
                        const recordIndex = allRecords.findIndex(r => r.id === item.id);
                        if (recordIndex !== -1) {
                            allRecords[recordIndex].status_id = 3;
                        }
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error updating record ${item.id}:`, error);
                errorCount++;
            }
        }
    }
    
    if (Object.keys(consignorPayments).length > 0) {
        let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
        for (const [consignorId, amount] of Object.entries(consignorPayments)) {
            storedOwed[consignorId] = (storedOwed[consignorId] || 0) + amount;
        }
        localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
        consignorOwedAmounts = storedOwed;
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
        let taxRate = 0;
        try {
            taxRate = getConfigValue('TAX_ENABLED') ? (getConfigValue('TAX_RATE') / 100) : 0;
        } catch (e) {
            console.log('Tax config not found, using 0');
        }
        
        const discount = currentDiscount.value || 0;
        const discountedSubtotal = subtotal - discount;
        const tax = discountedSubtotal * taxRate;
        
        const transaction = {
            id: `CASH-${Date.now()}`,
            date: new Date(),
            items: [...soldItems],
            subtotal: discountedSubtotal,
            discount: discount,
            tax: tax,
            taxRate: taxRate * 100,
            total: total,
            tendered: tendered,
            change: change,
            paymentMethod: 'Cash',
            cashier: cashierName,
            storeName: dbConfigValues['STORE_NAME'] ? dbConfigValues['STORE_NAME'].value : 'PigStyle Music',
            storeAddress: dbConfigValues['STORE_ADDRESS'] ? dbConfigValues['STORE_ADDRESS'].value : '',
            storePhone: dbConfigValues['STORE_PHONE'] ? dbConfigValues['STORE_PHONE'].value : '',
            footer: dbConfigValues['RECEIPT_FOOTER'] ? dbConfigValues['RECEIPT_FOOTER'].value : 'Thank you for your purchase!',
            consignorPayments: consignorPayments
        };
        
        saveReceipt(transaction);
        
        const receiptText = formatReceiptForPrinter(transaction);
        printToThermalPrinter(receiptText);
        
        checkoutCart = [];
        currentDiscount = { amount: 0, type: 'fixed', value: 0 };
        updateCartDisplay();
        searchRecordsAndAccessories();
        
        showCheckoutStatus(`Successfully sold ${successCount} items${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
    } else {
        showCheckoutStatus(`Failed to process sale: ${errorCount} errors`, 'error');
    }
    
    showCheckoutLoading(false);
}

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'check-out') {
        const searchResults = document.getElementById('search-results');
        if (currentSearchResults.length === 0) {
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