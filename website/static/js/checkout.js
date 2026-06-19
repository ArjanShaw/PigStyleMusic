// ============================================================================
// checkout.js - Check Out Tab Functionality with Custom Sale Price
// ============================================================================

// Shopping Cart Variables
let checkoutCart = [];
let pendingCartCheckout = null;
let currentDiscount = {
    amount: 0,
    type: 'percentage',
    value: 0
};
let currentCustomSalePrice = null; // NEW: Custom sale price override
let currentSearchResults = [];
let availableTerminals = [];
let selectedTerminalId = null;
let activeCheckoutId = null;
let square_payment_sessions = {}; // Track payment sessions
let squarePaymentResolve = null; // For Promise-based completion

// Gift Card Variables
let currentGiftCard = null;
let currentCartTotal = 0;

// ESC/POS commands for VCP-8370
const ESC = '\x1B';
const GS = '\x1D';

const PrinterCommands = {
    INIT: ESC + '@',
    LF: '\x0A',
    CUT: GS + 'V' + '\x01',
    OPEN_DRAWER: ESC + 'p' + '\x00' + '\x19' + '\xFA',
    BOLD_ON: ESC + 'E' + '\x01',
    BOLD_OFF: ESC + 'E' + '\x00',
    ALIGN_LEFT: ESC + 'a' + '\x00',
    ALIGN_CENTER: ESC + 'a' + '\x01',
    ALIGN_RIGHT: ESC + 'a' + '\x02',
    LINE_SPACING_30: ESC + '3' + '\x1E',
    LINE_SPACING_NORMAL: ESC + '2'
};

// Helper function to get local MST date (not UTC)
function getLocalMSTDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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
        3: 'Sold (Store)',
        4: 'Sold (Discogs)'
    };
    return statusMap[statusId] || 'Unknown';
};

// ============================================================================
// Helper Functions for Order Creation
// ============================================================================

// Generate a UUID v4 style ID for the order
function generateOrderId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Create an order via the backend
async function createOrderForTransaction(transaction, paymentSource, externalTransactionId = null) {
    const orderId = generateOrderId();
    const dateStr = new Date().toISOString();
    
    const channelMap = {
        'cash': 'manual',
        'square': 'square_pos',
        'giftcard': 'manual',
        'discogs': 'discogs',
        'paypal': 'discogs'
    };
    const channel = channelMap[paymentSource] || 'manual';
    const orderNumber = `${channel.toUpperCase()}-${Date.now()}`;
    
    const orderData = {
        id: orderId,
        order_number: orderNumber,
        customer_name: transaction.customerName || 'Walk-in Customer',
        customer_email: transaction.customerEmail || '',
        shipping_method: 'pickup',
        shipping_cost: 0,
        subtotal: transaction.subtotal || 0,
        tax: transaction.tax || 0,
        total: transaction.total || 0,
        payment_status: 'paid',
        order_status: 'completed',
        created_at: dateStr,
        updated_at: dateStr,
        channel: channel,
        is_accounted: 0,
        external_order_id: externalTransactionId || null
    };
    
    const payload = {
        order: orderData,
        items: transaction.items.map(item => ({
            record_id: item.type === 'custom' ? null : (item.id || null),
            record_title: item.type === 'custom' ? (item.note || item.description || 'Custom Item') : (item.title || 'Unknown Title'),
            record_artist: item.type === 'custom' ? null : (item.artist || 'Unknown Artist'),
            record_condition: item.type === 'custom' ? null : (item.condition || null),
            price_at_time: item.actual_sale_price || item.store_price || 0
        })),
        payment: {
            source: paymentSource,
            gross_amount: transaction.total || 0, // in dollars; backend converts to cents
            transaction_date: dateStr,
            external_transaction_id: externalTransactionId || null
        }
    };
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/checkout/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Order creation failed: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        if (data.status !== 'success') {
            throw new Error(data.error || 'Failed to create order');
        }
        
        return { success: true, orderId, orderNumber };
    } catch (error) {
        console.error('Order creation error:', error);
        throw error;
    }
}

// ============================================================================
// Custom Sale Price Functions
// ============================================================================

window.updateCartWithCustomPrice = function() {
    const customPriceInput = document.getElementById('custom-sale-price');
    if (!customPriceInput) return;
    
    const customPrice = parseFloat(customPriceInput.value);
    
    if (isNaN(customPrice) || customPrice <= 0) {
        currentCustomSalePrice = null;
        // Clear discount when custom price is cleared
        if (currentDiscount.amount !== 0) {
            currentDiscount = { amount: 0, type: 'percentage', value: 0 };
            const discountAmount = document.getElementById('discount-amount');
            if (discountAmount) discountAmount.value = '';
        }
    } else {
        currentCustomSalePrice = customPrice;
        // Clear discount when custom price is set
        if (currentDiscount.amount !== 0) {
            currentDiscount = { amount: 0, type: 'percentage', value: 0 };
            const discountAmount = document.getElementById('discount-amount');
            if (discountAmount) discountAmount.value = '';
        }
    }
    
    updateCartDisplay();
};

window.clearCustomSalePrice = function() {
    const customPriceInput = document.getElementById('custom-sale-price');
    if (customPriceInput) {
        customPriceInput.value = '';
    }
    currentCustomSalePrice = null;
    updateCartDisplay();
    showCheckoutStatus('Custom sale price cleared', 'info');
};

// ============================================================================
// Validation Functions
// ============================================================================

function validateItemPrice(item) {
    const price = parseFloat(item.store_price);
    if (isNaN(price) || price <= 0) {
        throw new Error(
            `Invalid or missing price for item: ${item.artist || item.description || item.note || 'Unknown'} (Price: ${item.store_price})`
        );
    }
    return price;
}

async function validateTaxRate() {
    const taxRateStr = await getConfigValue('TAX_RATE');
    if (!taxRateStr && taxRateStr !== 0) {
        throw new Error('TAX_RATE configuration value is missing');
    }
    
    const taxRate = parseFloat(taxRateStr);
    if (isNaN(taxRate)) {
        throw new Error(`Invalid TAX_RATE configuration value: ${taxRateStr}`);
    }
    
    return taxRate / 100;
}

// ============================================================================
// VCP-8370 Thermal Printer Functions (kept for future use)
// ============================================================================

function isWebUSBSupported() {
    return navigator.usb !== undefined;
}

async function connectVCP8370() {
    // Kept for future use
    console.log('Printer connection function (not used remotely)');
    return null;
}

async function formatReceiptAsESCPOS(receiptText) {
    // Kept for future use
    console.log('Receipt formatting skipped');
    return new Uint8Array(0);
}

window.printToVCP8370 = async function(receiptText) {
    console.log('🖨️ Printer printing disabled (remote work)');
    return true;
};

window.printToThermalPrinter = async function(receiptText) {
    console.log('🖨️ Thermal printer disabled (remote work)');
    return true;
};

function showPrintableReceipt(receiptText) {
    // Function kept but not called – disabled to prevent popup
    console.log('Receipt popup disabled (remote work)');
}

function centerText(text, width) {
    if (!text) return ''.padEnd(width, ' ');
    
    text = String(text);
    const padding = Math.max(0, width - text.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    const result = ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    
    if (result.length !== width) {
        return result.substring(0, width);
    }
    
    return result;
}

// ============================================================================
// Square Payment Modal Functions
// ============================================================================

function showSquarePaymentModal(amount, terminalName) {
    const modal = document.getElementById('square-payment-modal');
    if (!modal) return;
    
    // Reset modal to waiting state
    const statusIcon = document.getElementById('square-status-icon');
    const statusMessage = document.getElementById('square-status-message');
    const statusDetail = document.getElementById('square-status-detail');
    const statusText = document.getElementById('square-modal-status-text');
    const amountDisplay = document.getElementById('square-modal-amount');
    const terminalDisplay = document.getElementById('square-modal-terminal');
    const forceBtn = document.getElementById('square-force-complete-btn');
    
    if (statusIcon) {
        statusIcon.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
        statusIcon.style.color = '#ffc107';
    }
    if (statusMessage) statusMessage.textContent = 'Waiting for payment on terminal...';
    if (statusDetail) statusDetail.textContent = 'Please complete payment on the Square Terminal';
    if (statusText) {
        statusText.textContent = 'Waiting...';
        statusText.style.color = '#ffc107';
    }
    if (amountDisplay) amountDisplay.textContent = `$${amount.toFixed(2)}`;
    if (terminalDisplay) terminalDisplay.textContent = terminalName || '--';
    if (forceBtn) {
        forceBtn.disabled = false;
        forceBtn.style.opacity = '1';
    }
    
    // Show the modal
    modal.style.display = 'flex';
}

function updateSquarePaymentModal(status, message, detail) {
    const statusIcon = document.getElementById('square-status-icon');
    const statusMessage = document.getElementById('square-status-message');
    const statusDetail = document.getElementById('square-status-detail');
    const statusText = document.getElementById('square-modal-status-text');
    
    if (statusIcon) {
        if (status === 'processing') {
            statusIcon.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
            statusIcon.style.color = '#ffc107';
        } else if (status === 'completed') {
            statusIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
            statusIcon.style.color = '#28a745';
        } else if (status === 'error') {
            statusIcon.innerHTML = '<i class="fas fa-times-circle"></i>';
            statusIcon.style.color = '#dc3545';
        } else if (status === 'force') {
            statusIcon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
            statusIcon.style.color = '#ffc107';
        } else {
            statusIcon.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
            statusIcon.style.color = '#ffc107';
        }
    }
    
    if (statusMessage) statusMessage.textContent = message || 'Processing...';
    if (statusDetail) statusDetail.textContent = detail || '';
    if (statusText) {
        statusText.textContent = status === 'completed' ? '✅ Completed' : 
                                status === 'error' ? '❌ Error' : 
                                status === 'force' ? '⚠️ Force Complete' : '⏳ Waiting...';
        statusText.style.color = status === 'completed' ? '#28a745' : 
                                 status === 'error' ? '#dc3545' : 
                                 status === 'force' ? '#856404' : '#ffc107';
    }
}

function closeSquarePaymentModal() {
    const modal = document.getElementById('square-payment-modal');
    if (modal) modal.style.display = 'none';
    
    // Clear any active checkout
    if (activeCheckoutId && square_payment_sessions[activeCheckoutId] && square_payment_sessions[activeCheckoutId].pollInterval) {
        clearInterval(square_payment_sessions[activeCheckoutId].pollInterval);
    }
    
    activeCheckoutId = null;
}

// ============================================================================
// Terminal Management (Square)
// ============================================================================

window.refreshTerminals = async function() {
    const terminalList = document.getElementById('terminal-list');
    const terminalSection = document.querySelector('.terminal-management');
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
            
            if (terminalSection) {
                if (availableTerminals.length === 1) {
                    terminalSection.style.display = 'none';
                } else {
                    terminalSection.style.display = 'block';
                }
            }
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
    const bernIt = document.getElementById('custom-bern-it')?.checked || false;
    
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
        timestamp: Date.now(),
        bern_it: bernIt
    };
    
    checkoutCart.push(customItem);
    
    document.getElementById('custom-note').value = '';
    document.getElementById('custom-price').value = '';
    document.getElementById('custom-bern-it').checked = false;
    
    updateCartDisplay();
    
    let message = `Added custom item: "${note.substring(0, 30)}${note.length > 30 ? '...' : ''}" - $${price.toFixed(2)}`;
    if (bernIt) {
        message += ` (🔥 BERN IT - donation)`;
    }
    showCheckoutStatus(message, 'success');
};

window.removeCustomItemFromCart = function(itemId) {
    const index = checkoutCart.findIndex(item => item.type === 'custom' && item.id === itemId);
    if (index !== -1) {
        const removed = checkoutCart.splice(index, 1)[0];
        updateCartDisplay();
        showCheckoutStatus(`Removed custom item: "${removed.note}"`, 'info');
    }
};

async function updateBernFund(amount) {
    try {
        const currentResponse = await fetch(`${AppConfig.baseUrl}/config/BERN_FUND`, {
            credentials: 'include'
        });
        let currentAmount = 0;
        
        if (currentResponse.ok) {
            const data = await currentResponse.json();
            if (data.config_value) {
                currentAmount = parseFloat(data.config_value) || 0;
            }
        }
        
        const newAmount = currentAmount + amount;
        
        await fetch(`${AppConfig.baseUrl}/config/BERN_FUND`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ config_value: newAmount.toString() })
        });
        
        console.log(`🔥 BERN fund updated: $${currentAmount.toFixed(2)} → $${newAmount.toFixed(2)}`);
        
    } catch (error) {
        console.error('Error updating BERN fund:', error);
    }
}

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
        let recordsUrl = `${AppConfig.baseUrl}/records/search?q=${encodeURIComponent(query)}`;
        const recordsResponse = await fetch(recordsUrl, { credentials: 'include' });
        
        if (!recordsResponse.ok) {
            throw new Error(`Records search failed: ${recordsResponse.status}`);
        }
        const recordsData = await recordsResponse.json();
        
        if (recordsData.status !== 'success') {
            throw new Error(recordsData.error || 'Records search failed');
        }
        
        let records = recordsData.records || [];
        
        if (activeOnly) {
            records = records.filter(r => r.status_id === 2);
        }
        
        if (barcodeOnly) {
            records = records.filter(r => r.barcode && r.barcode.toLowerCase().includes(query.toLowerCase()));
        }
        
        currentSearchResults = [...records];
        currentSearchResults.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        renderSearchResults(currentSearchResults);
        
        showCheckoutStatus(`Found ${records.length} records`, 'success');
        
        const isNumericQuery = /^\d+$/.test(query);
        if (isNumericQuery && currentSearchResults.length === 1) {
            const singleItem = currentSearchResults[0];
            
            const alreadyInCart = checkoutCart.some(cartItem => cartItem.id === singleItem.id);
            
            if (!alreadyInCart) {
                if (singleItem.status_id === 2) {
                    addToCart(singleItem);
                    showCheckoutStatus(`Auto-added: ${singleItem.artist} - ${singleItem.title}`, 'success');
                } else if (singleItem.status_id === 3 || singleItem.status_id === 4) {
                    showCheckoutStatus(`Item is already sold`, 'warning');
                } else {
                    showCheckoutStatus(`Item is not active`, 'warning');
                }
            } else {
                showCheckoutStatus(`Item already in cart`, 'info');
            }
        }
        
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
        const inCart = checkoutCart.some(cartItem => cartItem.id === item.id);
        
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
                    ${item.status_id === 3 || item.status_id === 4 ? 
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
    });
    
    container.innerHTML = html;
    updateCartDisplay();
}

// ============================================================================
// Cart Functions
// ============================================================================

window.addToCartFromData = function(recordId) {
    const record = currentSearchResults.find(r => r.id === recordId);
    if (record) {
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
        currentCustomSalePrice = null;
        const discountAmount = document.getElementById('discount-amount');
        const discountType = document.getElementById('discount-type');
        const customPriceInput = document.getElementById('custom-sale-price');
        if (discountAmount) discountAmount.value = '';
        if (discountType) discountType.value = 'percentage';
        if (customPriceInput) customPriceInput.value = '';
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus('Cart cleared', 'info');
    }
};

window.updateCartWithDiscount = function() {
    // Clear custom sale price when using discount
    if (currentCustomSalePrice !== null) {
        const customPriceInput = document.getElementById('custom-sale-price');
        if (customPriceInput) customPriceInput.value = '';
        currentCustomSalePrice = null;
    }
    
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

function calculateTotals() {
    let originalSubtotal = 0;
    checkoutCart.forEach(item => {
        const price = validateItemPrice(item);
        originalSubtotal += price;
    });
    
    let discountedSubtotal = originalSubtotal;
    let discountValue = 0;
    const discountRow = document.getElementById('discount-row');
    const discountDisplay = document.getElementById('cart-discount');
    const errorDiv = document.getElementById('discount-error');
    const customPriceRow = document.getElementById('custom-price-row');
    const customPriceDisplay = document.getElementById('cart-custom-price');
    const savingsDisplay = document.getElementById('savings-display');
    
    // Check if custom sale price is set
    if (currentCustomSalePrice !== null && currentCustomSalePrice > 0) {
        discountedSubtotal = currentCustomSalePrice;
        if (customPriceRow) customPriceRow.style.display = 'flex';
        if (customPriceDisplay) customPriceDisplay.textContent = `$${currentCustomSalePrice.toFixed(2)}`;
        if (discountRow) discountRow.style.display = 'none';
        
        const savings = originalSubtotal - currentCustomSalePrice;
        if (savings > 0 && savingsDisplay) {
            savingsDisplay.innerHTML = `<i class="fas fa-tag"></i> Savings: $${savings.toFixed(2)} (${((savings / originalSubtotal) * 100).toFixed(1)}% off)`;
        } else if (savingsDisplay) {
            savingsDisplay.innerHTML = '';
        }
    } else {
        if (customPriceRow) customPriceRow.style.display = 'none';
        
        if (currentDiscount.amount > 0) {
            if (currentDiscount.type === 'percentage') {
                discountValue = originalSubtotal * (currentDiscount.amount / 100);
                
                if (discountValue > originalSubtotal) {
                    if (errorDiv) {
                        errorDiv.textContent = 'Discount cannot exceed subtotal';
                        errorDiv.style.display = 'block';
                    }
                    currentDiscount.value = 0;
                    if (discountRow) discountRow.style.display = 'none';
                    discountedSubtotal = originalSubtotal;
                } else {
                    currentDiscount.value = discountValue;
                    discountedSubtotal = originalSubtotal - discountValue;
                    if (discountDisplay) discountDisplay.textContent = `-$${discountValue.toFixed(2)} (${currentDiscount.amount}%)`;
                    if (discountRow) discountRow.style.display = 'flex';
                }
            } else {
                if (currentDiscount.amount <= originalSubtotal) {
                    discountValue = currentDiscount.amount;
                    currentDiscount.value = discountValue;
                    discountedSubtotal = originalSubtotal - discountValue;
                    if (discountDisplay) discountDisplay.textContent = `-$${discountValue.toFixed(2)}`;
                    if (discountRow) discountRow.style.display = 'flex';
                } else {
                    if (errorDiv) {
                        errorDiv.textContent = 'Fixed discount cannot exceed subtotal';
                        errorDiv.style.display = 'block';
                    }
                    currentDiscount.value = 0;
                    if (discountRow) discountRow.style.display = 'none';
                    discountedSubtotal = originalSubtotal;
                }
            }
        } else {
            if (discountRow) discountRow.style.display = 'none';
            currentDiscount.value = 0;
        }
        
        if (savingsDisplay && discountValue > 0) {
            savingsDisplay.innerHTML = `<i class="fas fa-tag"></i> Discount: $${discountValue.toFixed(2)} (${((discountValue / originalSubtotal) * 100).toFixed(1)}% off)`;
        } else if (savingsDisplay) {
            savingsDisplay.innerHTML = '';
        }
    }
    
    return {
        originalSubtotal: originalSubtotal,
        discountedSubtotal: discountedSubtotal,
        discountValue: discountValue
    };
}

async function updateCartDisplay() {
    const cartSection = document.getElementById('shopping-cart-section');
    const cartItems = document.getElementById('cart-items');
    const cartCount = document.getElementById('cart-item-count');
    const cartOriginalSubtotal = document.getElementById('cart-original-subtotal');
    const cartTax = document.getElementById('cart-tax');
    const cartTotal = document.getElementById('cart-total');
    const squareBtn = document.getElementById('checkout-square-btn');
    const discogsBtn = document.getElementById('checkout-discogs-btn');
    const taxRateDisplay = document.getElementById('tax-rate-display');
    
    if (checkoutCart.length === 0) {
        if (cartSection) cartSection.style.display = 'none';
        if (squareBtn) squareBtn.disabled = true;
        if (discogsBtn) discogsBtn.disabled = true;
        return;
    }
    
    if (cartSection) cartSection.style.display = 'block';
    if (cartCount) cartCount.textContent = `${checkoutCart.length} item${checkoutCart.length !== 1 ? 's' : ''}`;
    
    const { originalSubtotal, discountedSubtotal } = calculateTotals();
    
    const taxRate = await validateTaxRate();
    
    if (taxRateDisplay) taxRateDisplay.textContent = (taxRate * 100).toFixed(1);
    
    const tax = discountedSubtotal * taxRate;
    const total = discountedSubtotal + tax;
    
    if (cartOriginalSubtotal) cartOriginalSubtotal.textContent = `$${originalSubtotal.toFixed(2)}`;
    if (cartTax) cartTax.textContent = `$${tax.toFixed(2)}`;
    if (cartTotal) cartTotal.textContent = `$${total.toFixed(2)}`;
    
    if (squareBtn) squareBtn.disabled = false;
    if (discogsBtn) discogsBtn.disabled = false;
    
    currentCartTotal = total;
    
    let cartHtml = '';
    checkoutCart.forEach(item => {
        if (item.type === 'custom') {
            let bernBadge = '';
            if (item.bern_it) {
                bernBadge = `<div class="cart-item-meta" style="font-size: 11px; color: #e67e22;"><i class="fas fa-fire"></i> 🔥 BERN IT - Donation</div>`;
            }
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
                        ${bernBadge}
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
// Square Terminal Payment Functions
// ============================================================================

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
                
                if (status === 'PENDING') {
                    updateSquarePaymentModal('processing', 'Waiting for payment...', 'Please complete payment on the Square Terminal');
                } else if (status === 'COMPLETED') {
                    updateSquarePaymentModal('completed', 'Payment Confirmed!', 'Processing sale...');
                    
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
                            closeSquarePaymentModal();
                        }, 1000);
                    }
                } else if (status === 'FAILED' || status === 'CANCELED') {
                    updateSquarePaymentModal('error', `Payment ${status}`, 'Please try again');
                    clearInterval(pollInterval);
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

// ============================================================================
// Square Payment - Main Functions
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
    
    // Get the total amount
    const totalEl = document.getElementById('cart-total');
    const total = parseFloat(totalEl?.textContent.replace('$', '') || '0');
    
    // Get terminal name
    let terminalName = 'Square Terminal';
    if (availableTerminals.length === 1) {
        terminalName = availableTerminals[0].device_name || 'Square Terminal';
    }
    
    // SHOW THE MODAL BEFORE CHECKOUT
    showSquarePaymentModal(total, terminalName);
    
    // Save cart items for later
    pendingCartCheckout = {
        items: [...checkoutCart],
        type: 'cart',
        discount: { ...currentDiscount },
        customSalePrice: currentCustomSalePrice
    };
    
    // Handle terminal selection
    if (availableTerminals.length === 1) {
        let singleTerminalId = availableTerminals[0].id;
        if (singleTerminalId && singleTerminalId.startsWith('device:')) {
            singleTerminalId = singleTerminalId.replace('device:', '');
        }
        selectedTerminalId = singleTerminalId;
        initiateCartTerminalCheckout();
    } else {
        renderTerminalSelectionModal();
    }
};

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
    
    // Update modal: Creating checkout
    updateSquarePaymentModal('processing', 'Creating checkout on terminal...', 'Please wait');
    
    const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
    const amountCents = Math.round(total * 100);
    const recordIds = pendingCartCheckout.items.map(item => 
        item.type === 'custom' ? `custom_${item.id}` : item.id
    );
    const recordTitles = pendingCartCheckout.items.map(item => 
        item.type === 'custom' ? item.note : item.title
    );
    
    closeTerminalSelectionModal();
    
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
        
        // Update modal: Waiting for payment
        updateSquarePaymentModal('processing', 'Waiting for payment on terminal...', `Amount: $${total.toFixed(2)}`);
        
        startPollingCheckoutStatus(activeCheckoutId);
        
    } catch (error) {
        console.error('Checkout error:', error);
        // Update modal: Error
        updateSquarePaymentModal('error', 'Checkout Failed', error.message);
        showCheckoutStatus(`Checkout failed: ${error.message}`, 'error');
    }
};

window.forceCompleteSquarePayment = async function() {
    if (!activeCheckoutId) {
        showCheckoutStatus('No active checkout to complete', 'error');
        return;
    }
    
    if (!pendingCartCheckout) {
        showCheckoutStatus('No pending cart checkout found', 'error');
        return;
    }
    
    // Update modal: Force complete in progress
    updateSquarePaymentModal('force', 'Force completing sale...', 'Marking sale as completed manually');
    
    try {
        if (square_payment_sessions[activeCheckoutId] && square_payment_sessions[activeCheckoutId].pollInterval) {
            clearInterval(square_payment_sessions[activeCheckoutId].pollInterval);
        }
        
        const manualPaymentId = `MANUAL-${Date.now()}`;
        square_payment_sessions[activeCheckoutId].payment_id = manualPaymentId;
        square_payment_sessions[activeCheckoutId].status = 'COMPLETED';
        
        await processSquarePaymentSuccess();
        updateSquarePaymentModal('completed', 'Sale Completed!', 'Records have been marked as sold');
        setTimeout(closeSquarePaymentModal, 1500);
        showCheckoutStatus('Sale completed successfully!', 'success');
        
    } catch (error) {
        console.error('Error completing sale:', error);
        updateSquarePaymentModal('error', 'Completion Failed', error.message);
        showCheckoutStatus(`Failed to complete sale: ${error.message}`, 'error');
    }
};

window.cancelSquarePayment = function() {
    if (!activeCheckoutId) {
        showCheckoutStatus('No active checkout to cancel', 'info');
        closeSquarePaymentModal();
        return;
    }
    
    if (square_payment_sessions[activeCheckoutId] && square_payment_sessions[activeCheckoutId].pollInterval) {
        clearInterval(square_payment_sessions[activeCheckoutId].pollInterval);
    }
    
    // Update modal: Cancelling
    updateSquarePaymentModal('processing', 'Cancelling checkout...', 'Please wait');
    
    // Call the existing cancel function
    cancelTerminalCheckout();
};

window.cancelTerminalCheckout = async function() {
    if (!activeCheckoutId) {
        showCheckoutStatus('No active checkout to cancel', 'info');
        closeSquarePaymentModal();
        return;
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
        updateSquarePaymentModal('completed', 'Cancelled', 'Checkout has been cancelled');
        setTimeout(closeSquarePaymentModal, 1000);
        
        if (square_payment_sessions[activeCheckoutId]) {
            delete square_payment_sessions[activeCheckoutId];
        }
        
        activeCheckoutId = null;
        
    } catch (error) {
        console.error('Cancel checkout error:', error);
        updateSquarePaymentModal('error', 'Failed to Cancel', error.message);
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

window.completeSquarePayment = async function() {
    if (!pendingCartCheckout) {
        showCheckoutStatus('No pending checkout found', 'error');
        return;
    }
    
    await processSquarePaymentSuccess();
    closeSquarePaymentModal();
    showCheckoutStatus('Payment completed successfully!', 'success');
};

async function processSquarePaymentSuccess() {
    showCheckoutLoading(true);
    
    let successCount = 0;
    let errorCount = 0;
    const soldItems = [];
    const consignorPayments = {};
    let squarePaymentId = null;
    let bernTotal = 0;
    
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
    
    const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
    const originalSubtotal = parseFloat(document.getElementById('cart-original-subtotal')?.textContent.replace('$', '') || '0');
    const { discountedSubtotal } = calculateTotals();
    const tax = discountedSubtotal * (await validateTaxRate());

    // ========== Create order before updating records ==========
    const orderTransaction = {
        customerName: 'Walk-in Customer',
        subtotal: discountedSubtotal,
        tax: tax,
        total: total,
        items: pendingCartCheckout.items.map(item => ({
            ...item,
            actual_sale_price: item.type === 'custom' ? item.store_price : 
                (parseFloat(item.store_price) / (originalSubtotal || 1)) * discountedSubtotal
        }))
    };

    try {
        await createOrderForTransaction(orderTransaction, 'square', squarePaymentId);
    } catch (orderError) {
        showCheckoutStatus(`Order creation failed: ${orderError.message}`, 'error');
        showCheckoutLoading(false);
        throw orderError;
    }
    // ========== End of order creation ==========

    for (const item of pendingCartCheckout.items) {
        if (item.type === 'custom') {
            successCount++;
            soldItems.push({
                ...item,
                description: item.note || 'Custom Item',
                store_price: item.store_price
            });
            
            if (item.bern_it) {
                bernTotal += item.store_price;
            }
        } else {
            try {
                const todayMST = getLocalMSTDate();
                
                const itemStorePrice = parseFloat(item.store_price) || 0;
                let proportionalActualPrice;
                
                if (currentCustomSalePrice !== null && currentCustomSalePrice > 0) {
                    proportionalActualPrice = (itemStorePrice / originalSubtotal) * currentCustomSalePrice;
                } else {
                    proportionalActualPrice = (itemStorePrice / originalSubtotal) * discountedSubtotal;
                }
                
                const response = await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        status_id: 3,
                        date_sold: todayMST,
                        actual_sale_price: proportionalActualPrice
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
                soldItems.push({
                    ...item,
                    actual_sale_price: proportionalActualPrice
                });
                
                if (item.consignor_id && item.consignor_id !== 1) {
                    const commissionRate = parseFloat(item.commission_rate);
                    if (isNaN(commissionRate)) {
                        throw new Error(`Invalid commission rate for consignor item: ${item.artist} - ${item.title}`);
                    }
                    const consignorShare = proportionalActualPrice * (1 - (commissionRate / 100));
                    
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
    
    if (bernTotal > 0) {
        await updateBernFund(bernTotal);
        showCheckoutStatus(`🔥 Added $${bernTotal.toFixed(2)} to BERN fund!`, 'success');
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
        
        const taxRate = await validateTaxRate();
        const discount = currentDiscount.value || 0;
        const tax = discountedSubtotal * taxRate;
        
        const transaction = {
            id: `SQUARE-${Date.now()}`,
            square_payment_id: squarePaymentId,
            date: new Date().toISOString(),
            items: soldItems,
            originalSubtotal: originalSubtotal,
            subtotal: discountedSubtotal,
            discount: discount,
            discountType: currentDiscount.type,
            discountAmount: currentDiscount.amount,
            customSalePrice: currentCustomSalePrice,
            tax: tax,
            taxRate: taxRate * 100,
            total: total,
            paymentMethod: 'Square Terminal',
            cashier: cashierName,
            storeName: await getConfigValue('STORE_NAME'),
            storeAddress: await getConfigValue('STORE_ADDRESS'),
            storePhone: await getConfigValue('STORE_PHONE'),
            footer: await getConfigValue('RECEIPT_FOOTER'),
            consignorPayments: consignorPayments,
            bernDonation: bernTotal
        };
        
        if (typeof window.saveReceipt === 'function') {
            await window.saveReceipt(transaction);
        }
        
        // ===== RECEIPT PRINTING DISABLED (remote work) =====
        // const receiptText = await formatReceiptForPrinter(transaction);
        // await window.printToThermalPrinter(receiptText);
        console.log('Receipt skipped while working remotely');
        // ================================================
        
        checkoutCart = [];
        currentDiscount = { amount: 0, type: 'percentage', value: 0 };
        currentCustomSalePrice = null;
        const discountAmount = document.getElementById('discount-amount');
        const discountType = document.getElementById('discount-type');
        const customPriceInput = document.getElementById('custom-sale-price');
        if (discountAmount) discountAmount.value = '';
        if (discountType) discountType.value = 'percentage';
        if (customPriceInput) customPriceInput.value = '';
        updateCartDisplay();
        searchRecordsAndAccessories();
        
        showCheckoutStatus(`Successfully sold ${successCount} items via Square Terminal`, 'success');
    } else {
        throw new Error('No items were successfully processed');
    }
    
    showCheckoutLoading(false);
    pendingCartCheckout = null;
}

// ============================================================================
// Discogs Sale Function
// ============================================================================

window.processDiscogsSale = async function() {
    if (checkoutCart.length === 0) {
        showCheckoutStatus('Cart is empty', 'error');
        return;
    }
    
    // Filter out custom items (can't sell custom items on Discogs)
    const recordItems = checkoutCart.filter(item => item.type !== 'custom');
    const customItems = checkoutCart.filter(item => item.type === 'custom');
    
    if (recordItems.length === 0) {
        showCheckoutStatus('No records in cart to mark as Discogs sold', 'error');
        return;
    }
    
    if (customItems.length > 0) {
        showCheckoutStatus(`Note: ${customItems.length} custom item(s) will remain in cart (cannot be marked as Discogs sold)`, 'warning');
    }
    
    showCheckoutLoading(true);
    
    const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
    const originalSubtotal = parseFloat(document.getElementById('cart-original-subtotal')?.textContent.replace('$', '') || '0');
    const { discountedSubtotal } = calculateTotals();
    const tax = discountedSubtotal * (await validateTaxRate());
    
    // ========== Create order before updating records ==========
    const orderTransaction = {
        customerName: 'Discogs Buyer',
        subtotal: discountedSubtotal,
        tax: tax,
        total: total,
        items: recordItems.map(item => ({
            ...item,
            actual_sale_price: (parseFloat(item.store_price) / (originalSubtotal || 1)) * discountedSubtotal
        }))
    };

    try {
        await createOrderForTransaction(orderTransaction, 'discogs', null);
    } catch (orderError) {
        showCheckoutStatus(`Order creation failed: ${orderError.message}`, 'error');
        showCheckoutLoading(false);
        return;
    }
    // ========== End of order creation ==========
    
    let successCount = 0;
    let errorCount = 0;
    const soldItems = [];
    const consignorPayments = {};
    let bernTotal = 0;
    
    try {
        for (const item of recordItems) {
            try {
                const todayMST = getLocalMSTDate();
                
                // Calculate proportional actual sale price based on item's contribution to original subtotal
                const itemStorePrice = parseFloat(item.store_price) || 0;
                let proportionalActualPrice;
                
                if (currentCustomSalePrice !== null && currentCustomSalePrice > 0) {
                    // Use custom sale price proportionally
                    proportionalActualPrice = (itemStorePrice / originalSubtotal) * currentCustomSalePrice;
                } else {
                    // Use discounted total proportionally
                    proportionalActualPrice = (itemStorePrice / originalSubtotal) * discountedSubtotal;
                }
                
                const response = await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        status_id: 4,
                        date_sold: todayMST,
                        actual_sale_price: proportionalActualPrice
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
                soldItems.push({
                    ...item,
                    actual_sale_price: proportionalActualPrice
                });
                
                if (item.consignor_id && item.consignor_id !== 1) {
                    const commissionRate = parseFloat(item.commission_rate);
                    if (isNaN(commissionRate)) {
                        throw new Error(`Invalid commission rate for consignor item: ${item.artist} - ${item.title}`);
                    }
                    const consignorShare = proportionalActualPrice * (1 - (commissionRate / 100));
                    
                    if (!consignorPayments[item.consignor_id]) {
                        consignorPayments[item.consignor_id] = 0;
                    }
                    consignorPayments[item.consignor_id] += consignorShare;
                }
            } catch (error) {
                console.error(`Error updating record ${item.id}:`, error);
                errorCount++;
                showCheckoutStatus(`Failed to update ${item.artist} - ${item.title}: ${error.message}`, 'error');
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
            
            const taxRate = await validateTaxRate();
            const discount = currentDiscount.value || 0;
            const tax = discountedSubtotal * taxRate;
            
            const transaction = {
                id: `DISCOGS-${Date.now()}`,
                date: new Date().toISOString(),
                items: soldItems,
                originalSubtotal: originalSubtotal,
                subtotal: discountedSubtotal,
                discount: discount,
                discountType: currentDiscount.type,
                discountAmount: currentDiscount.amount,
                customSalePrice: currentCustomSalePrice,
                tax: tax,
                taxRate: taxRate * 100,
                total: total,
                paymentMethod: 'Discogs',
                cashier: cashierName,
                storeName: await getConfigValue('STORE_NAME'),
                storeAddress: await getConfigValue('STORE_ADDRESS'),
                storePhone: await getConfigValue('STORE_PHONE'),
                footer: await getConfigValue('RECEIPT_FOOTER'),
                consignorPayments: consignorPayments,
                isDiscogsSale: true
            };
            
            // Save receipt to database (for record keeping) - NO PHYSICAL PRINT
            if (typeof window.saveReceipt === 'function') {
                await window.saveReceipt(transaction);
                console.log('Discogs sale recorded in database, receipt ID:', transaction.id);
            }
            
            // IMPORTANT: NO RECEIPT PRINTING FOR DISCOGS SALES
            
            // Remove sold items from cart (keep custom items)
            checkoutCart = checkoutCart.filter(item => item.type === 'custom');
            
            // Reset discount and custom price
            currentDiscount = { amount: 0, type: 'percentage', value: 0 };
            currentCustomSalePrice = null;
            const discountAmount = document.getElementById('discount-amount');
            const discountType = document.getElementById('discount-type');
            const customPriceInput = document.getElementById('custom-sale-price');
            if (discountAmount) discountAmount.value = '';
            if (discountType) discountType.value = 'percentage';
            if (customPriceInput) customPriceInput.value = '';
            updateCartDisplay();
            searchRecordsAndAccessories();
            
            showCheckoutStatus(`✅ Successfully marked ${successCount} record(s) as sold on Discogs!${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
        }
        
        if (errorCount > 0) {
            showCheckoutStatus(`⚠️ ${successCount} sold, ${errorCount} failed. Check console for details.`, 'warning');
        }
        
    } catch (error) {
        console.error('Error processing Discogs sale:', error);
        showCheckoutStatus(`Failed: ${error.message}`, 'error');
    } finally {
        showCheckoutLoading(false);
    }
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
    let bernTotal = 0;
    
    const originalSubtotal = parseFloat(document.getElementById('cart-original-subtotal')?.textContent.replace('$', '') || '0');
    const { discountedSubtotal } = calculateTotals();
    const tax = discountedSubtotal * (await validateTaxRate());
    
    // ========== Create order before updating records ==========
    const orderTransaction = {
        customerName: 'Walk-in Customer',
        subtotal: discountedSubtotal,
        tax: tax,
        total: total,
        items: checkoutCart.map(item => ({
            ...item,
            actual_sale_price: item.type === 'custom' ? item.store_price : 
                (parseFloat(item.store_price) / (originalSubtotal || 1)) * discountedSubtotal
        }))
    };

    try {
        await createOrderForTransaction(orderTransaction, 'cash', null);
    } catch (orderError) {
        showCheckoutStatus(`Order creation failed: ${orderError.message}`, 'error');
        showCheckoutLoading(false);
        return;
    }
    // ========== End of order creation ==========
    
    try {
        for (const item of checkoutCart) {
            if (item.type === 'custom') {
                successCount++;
                soldItems.push({
                    ...item,
                    description: item.note || 'Custom Item',
                    store_price: item.store_price
                });
                
                if (item.bern_it) {
                    bernTotal += item.store_price;
                }
            } else {
                try {
                    
                    const todayMST = getLocalMSTDate();
                    
                    const itemStorePrice = parseFloat(item.store_price) || 0;
                    let proportionalActualPrice;
                    
                    if (currentCustomSalePrice !== null && currentCustomSalePrice > 0) {
                        proportionalActualPrice = (itemStorePrice / originalSubtotal) * currentCustomSalePrice;
                    } else {
                        proportionalActualPrice = (itemStorePrice / originalSubtotal) * discountedSubtotal;
                    }
                    
                    const response = await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                            status_id: 3,
                            date_sold: todayMST,
                            actual_sale_price: proportionalActualPrice
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
                    soldItems.push({
                        ...item,
                        actual_sale_price: proportionalActualPrice
                    });
                    
                    if (item.consignor_id && item.consignor_id !== 1) {
                        const commissionRate = parseFloat(item.commission_rate);
                        if (isNaN(commissionRate)) {
                            throw new Error(`Invalid commission rate for consignor item: ${item.artist} - ${item.title}`);
                        }
                        const consignorShare = proportionalActualPrice * (1 - (commissionRate / 100));
                        
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
        
        if (bernTotal > 0) {
            await updateBernFund(bernTotal);
            showCheckoutStatus(`🔥 Added $${bernTotal.toFixed(2)} to BERN fund!`, 'success');
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
            
            const taxRate = await validateTaxRate();
            const discount = currentDiscount.value || 0;
            const tax = discountedSubtotal * taxRate;
            
            const cleanedItems = soldItems.map(item => ({
                id: item.id || null,
                type: item.type || 'record',
                artist: item.artist || null,
                title: item.title || null,
                description: item.description || item.note || null,
                note: item.note || null,
                store_price: parseFloat(item.store_price) || 0,
                actual_sale_price: item.actual_sale_price || null,
                catalog_number: item.catalog_number || null,
                barcode: item.barcode || null,
                consignor_id: item.consignor_id || null,
                original_id: item.original_id || null,
                bern_it: item.bern_it || false
            }));
            
            const transaction = {
                id: `CASH-${Date.now()}`,
                date: new Date().toISOString(),
                items: cleanedItems,
                originalSubtotal: originalSubtotal,
                subtotal: discountedSubtotal,
                discount: discount,
                discountType: currentDiscount.type,
                discountAmount: currentDiscount.amount,
                customSalePrice: currentCustomSalePrice,
                tax: tax,
                taxRate: taxRate * 100,
                total: total,
                tendered: tendered,
                change: change,
                paymentMethod: 'Cash',
                cashier: cashierName,
                storeName: await getConfigValue('STORE_NAME'),
                storeAddress: await getConfigValue('STORE_ADDRESS'),
                storePhone: await getConfigValue('STORE_PHONE'),
                footer: await getConfigValue('RECEIPT_FOOTER'),
                consignorPayments: consignorPayments,
                bernDonation: bernTotal
            };
            
            if (typeof window.saveReceipt === 'function') {
                await window.saveReceipt(transaction);
            }
            
            // ===== RECEIPT PRINTING DISABLED (remote work) =====
            // const receiptText = await formatReceiptForPrinter(transaction);
            // await window.printToThermalPrinter(receiptText);
            console.log('Receipt skipped while working remotely');
            // ================================================
            
            checkoutCart = [];
            currentDiscount = { amount: 0, type: 'percentage', value: 0 };
            currentCustomSalePrice = null;
            const discountAmount = document.getElementById('discount-amount');
            const discountType = document.getElementById('discount-type');
            const customPriceInput = document.getElementById('custom-sale-price');
            if (discountAmount) discountAmount.value = '';
            if (discountType) discountType.value = 'percentage';
            if (customPriceInput) customPriceInput.value = '';
            updateCartDisplay();
            searchRecordsAndAccessories();
            
            showCheckoutStatus(`Successfully sold ${successCount} items.`, 'success');
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

// ============================================================================
// Gift Card Payment Functions
// ============================================================================

window.showGiftCardModal = function() {
    if (checkoutCart.length === 0) {
        showCheckoutStatus('Cart is empty', 'error');
        return;
    }
    
    const totalEl = document.getElementById('cart-total');
    currentCartTotal = parseFloat(totalEl?.textContent.replace('$', '') || '0');
    
    const totalDueEl = document.getElementById('giftcard-total-due');
    if (totalDueEl) totalDueEl.textContent = `$${currentCartTotal.toFixed(2)}`;
    
    const codeInput = document.getElementById('giftcard-code');
    if (codeInput) codeInput.value = '';
    
    const infoDiv = document.getElementById('giftcard-info');
    if (infoDiv) infoDiv.style.display = 'none';
    
    const applySection = document.getElementById('giftcard-apply-section');
    if (applySection) applySection.style.display = 'none';
    
    const resultDiv = document.getElementById('giftcard-result');
    if (resultDiv) resultDiv.style.display = 'none';
    
    currentGiftCard = null;
    
    const modal = document.getElementById('giftcard-modal');
    if (modal) modal.style.display = 'flex';
    
    if (codeInput) setTimeout(() => codeInput.focus(), 100);
};

window.closeGiftCardModal = function() {
    const modal = document.getElementById('giftcard-modal');
    if (modal) modal.style.display = 'none';
    currentGiftCard = null;
};

window.checkGiftCardForPayment = async function() {
    const codeInput = document.getElementById('giftcard-code');
    const code = codeInput?.value.trim() || '';
    const resultDiv = document.getElementById('giftcard-result');
    const infoDiv = document.getElementById('giftcard-info');
    const applySection = document.getElementById('giftcard-apply-section');
    
    if (!code) {
        if (resultDiv) {
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '<span style="color: #ffc107;">Please enter a gift card code</span>';
        }
        return;
    }
    
    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<span><i class="fas fa-spinner fa-spin"></i> Checking...</span>';
    }
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/gift-cards/${encodeURIComponent(code)}`, {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success && data.card) {
            currentGiftCard = data.card;
            
            const idDisplay = document.getElementById('giftcard-id-display');
            const balanceDisplay = document.getElementById('giftcard-balance-display');
            if (idDisplay) idDisplay.textContent = currentGiftCard.id;
            if (balanceDisplay) balanceDisplay.textContent = `$${currentGiftCard.balance.toFixed(2)}`;
            
            if (infoDiv) infoDiv.style.display = 'block';
            
            if (currentGiftCard.balance >= currentCartTotal) {
                if (applySection) applySection.style.display = 'block';
                const amountInput = document.getElementById('giftcard-amount');
                if (amountInput) amountInput.value = currentCartTotal.toFixed(2);
                if (resultDiv) resultDiv.innerHTML = '<span style="color: #28a745;">✓ Card has sufficient balance</span>';
            } else if (currentGiftCard.balance > 0) {
                if (applySection) applySection.style.display = 'block';
                const amountInput = document.getElementById('giftcard-amount');
                if (amountInput) amountInput.value = currentGiftCard.balance.toFixed(2);
                if (resultDiv) resultDiv.innerHTML = `<span style="color: #ffc107;">⚠️ Partial balance: $${currentGiftCard.balance.toFixed(2)}. Remaining balance will need another payment method.</span>`;
            } else {
                if (applySection) applySection.style.display = 'none';
                if (resultDiv) resultDiv.innerHTML = '<span style="color: #dc3545;">This gift card has $0 balance</span>';
            }
        } else {
            if (resultDiv) resultDiv.innerHTML = '<span style="color: #dc3545;">Gift card not found</span>';
            if (infoDiv) infoDiv.style.display = 'none';
            if (applySection) applySection.style.display = 'none';
            currentGiftCard = null;
        }
    } catch (error) {
        console.error('Error checking gift card:', error);
        if (resultDiv) resultDiv.innerHTML = `<span style="color: #dc3545;">Error: ${error.message}</span>`;
    }
};

window.setGiftCardAmount = function(type) {
    const amountInput = document.getElementById('giftcard-amount');
    if (!amountInput || !currentGiftCard) return;
    
    if (type === 'full') {
        amountInput.value = Math.min(currentCartTotal, currentGiftCard.balance).toFixed(2);
    } else if (type === 'half') {
        const halfAmount = Math.min(currentCartTotal, currentGiftCard.balance) / 2;
        amountInput.value = halfAmount.toFixed(2);
    }
};

window.applyGiftCardToCart = async function() {
    if (!currentGiftCard) {
        showCheckoutStatus('No gift card selected', 'error');
        return;
    }
    
    const amountInput = document.getElementById('giftcard-amount');
    const amount = parseFloat(amountInput?.value || '0');
    const resultDiv = document.getElementById('giftcard-result');
    
    if (isNaN(amount) || amount <= 0) {
        if (resultDiv) {
            resultDiv.innerHTML = '<span style="color: #ffc107;">Please enter a valid amount</span>';
        }
        return;
    }
    
    if (amount > currentGiftCard.balance) {
        if (resultDiv) {
            resultDiv.innerHTML = '<span style="color: #dc3545;">Amount exceeds gift card balance</span>';
        }
        return;
    }
    
    if (amount > currentCartTotal) {
        if (resultDiv) {
            resultDiv.innerHTML = '<span style="color: #ffc107;">Amount exceeds cart total. Using full cart amount instead.</span>';
        }
        const adjustedAmount = currentCartTotal;
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/gift-cards/${currentGiftCard.id}/redeem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ amount: adjustedAmount })
            });
            
            const data = await response.json();
            
            if (data.success) {
                closeGiftCardModal();
                showCheckoutStatus(`Gift card applied: $${adjustedAmount.toFixed(2)}. Cart total is now $0.00`, 'success');
                await completeCheckoutWithGiftCard(adjustedAmount);
            } else {
                showCheckoutStatus(`Error: ${data.error}`, 'error');
            }
        } catch (error) {
            showCheckoutStatus(`Error: ${error.message}`, 'error');
        }
        return;
    }
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/gift-cards/${currentGiftCard.id}/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ amount: amount })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const remaining = currentCartTotal - amount;
            closeGiftCardModal();
            
            if (remaining <= 0.01) {
                showCheckoutStatus(`Gift card applied: $${amount.toFixed(2)}. Cart total is now $0.00`, 'success');
                await completeCheckoutWithGiftCard(amount);
            } else {
                showCheckoutStatus(`Gift card applied: $${amount.toFixed(2)}. Remaining balance: $${remaining.toFixed(2)}. Please select another payment method.`, 'success');
                updateCartTotalAfterGiftCard(remaining);
            }
        } else {
            showCheckoutStatus(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error applying gift card:', error);
        showCheckoutStatus(`Error: ${error.message}`, 'error');
    }
};

async function completeCheckoutWithGiftCard(amountPaid) {
    showCheckoutLoading(true);
    
    let successCount = 0;
    let errorCount = 0;
    const soldItems = [];
    const consignorPayments = {};
    let bernTotal = 0;
    
    const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
    const originalSubtotal = parseFloat(document.getElementById('cart-original-subtotal')?.textContent.replace('$', '') || '0');
    const { discountedSubtotal } = calculateTotals();
    const tax = discountedSubtotal * (await validateTaxRate());
    
    // ========== Create order before updating records ==========
    const orderTransaction = {
        customerName: 'Walk-in Customer',
        subtotal: discountedSubtotal,
        tax: tax,
        total: total,
        items: checkoutCart.map(item => ({
            ...item,
            actual_sale_price: item.type === 'custom' ? item.store_price : 
                (parseFloat(item.store_price) / (originalSubtotal || 1)) * discountedSubtotal
        }))
    };

    try {
        const giftCardId = currentGiftCard?.id || null;
        await createOrderForTransaction(orderTransaction, 'giftcard', giftCardId);
    } catch (orderError) {
        showCheckoutStatus(`Order creation failed: ${orderError.message}`, 'error');
        showCheckoutLoading(false);
        return;
    }
    // ========== End of order creation ==========

    try {
        for (const item of checkoutCart) {
            if (item.type === 'custom') {
                successCount++;
                soldItems.push(item);
                
                if (item.bern_it) {
                    bernTotal += item.store_price;
                }
            } else {
                try {
                    const todayMST = getLocalMSTDate();
                    
                    const itemStorePrice = parseFloat(item.store_price) || 0;
                    let proportionalActualPrice;
                    
                    if (currentCustomSalePrice !== null && currentCustomSalePrice > 0) {
                        proportionalActualPrice = (itemStorePrice / originalSubtotal) * currentCustomSalePrice;
                    } else {
                        proportionalActualPrice = (itemStorePrice / originalSubtotal) * discountedSubtotal;
                    }
                    
                    await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ 
                            status_id: 3,
                            date_sold: todayMST,
                            actual_sale_price: proportionalActualPrice
                        })
                    });
                    
                    successCount++;
                    soldItems.push({
                        ...item,
                        actual_sale_price: proportionalActualPrice
                    });
                    
                    if (item.consignor_id && item.consignor_id !== 1) {
                        const commissionRate = parseFloat(item.commission_rate);
                        const consignorShare = proportionalActualPrice * (1 - (commissionRate / 100));
                        consignorPayments[item.consignor_id] = (consignorPayments[item.consignor_id] || 0) + consignorShare;
                    }
                } catch (error) {
                    errorCount++;
                    throw error;
                }
            }
        }
        
        if (bernTotal > 0) {
            await updateBernFund(bernTotal);
            showCheckoutStatus(`🔥 Added $${bernTotal.toFixed(2)} to BERN fund!`, 'success');
        }
        
        if (successCount > 0) {
            let cashierName = 'Admin';
            try {
                const userData = localStorage.getItem('user');
                if (userData) {
                    const user = JSON.parse(userData);
                    cashierName = user.username || 'Admin';
                }
            } catch (e) {}
            
            const taxRate = await validateTaxRate();
            const discount = currentDiscount.value || 0;
            const tax = discountedSubtotal * taxRate;
            
            const transaction = {
                id: `GIFT-${Date.now()}`,
                date: new Date().toISOString(),
                items: soldItems,
                originalSubtotal: originalSubtotal,
                subtotal: discountedSubtotal,
                discount: discount,
                discountType: currentDiscount.type,
                discountAmount: currentDiscount.amount,
                customSalePrice: currentCustomSalePrice,
                tax: tax,
                taxRate: taxRate * 100,
                total: total,
                giftCardPaid: amountPaid,
                paymentMethod: 'Gift Card',
                cashier: cashierName,
                storeName: await getConfigValue('STORE_NAME'),
                storeAddress: await getConfigValue('STORE_ADDRESS'),
                storePhone: await getConfigValue('STORE_PHONE'),
                footer: await getConfigValue('RECEIPT_FOOTER'),
                consignorPayments: consignorPayments,
                bernDonation: bernTotal
            };
            
            if (typeof window.saveReceipt === 'function') {
                await window.saveReceipt(transaction);
            }
            
            // ===== RECEIPT PRINTING DISABLED (remote work) =====
            // const receiptText = await formatReceiptForPrinter(transaction);
            // await window.printToThermalPrinter(receiptText);
            console.log('Receipt skipped while working remotely');
            // ================================================
            
            checkoutCart = [];
            currentDiscount = { amount: 0, type: 'percentage', value: 0 };
            currentCustomSalePrice = null;
            const discountAmount = document.getElementById('discount-amount');
            const discountType = document.getElementById('discount-type');
            const customPriceInput = document.getElementById('custom-sale-price');
            if (discountAmount) discountAmount.value = '';
            if (discountType) discountType.value = 'percentage';
            if (customPriceInput) customPriceInput.value = '';
            updateCartDisplay();
            searchRecordsAndAccessories();
            
            showCheckoutStatus(`Successfully sold ${successCount} items with Gift Card`, 'success');
        }
    } catch (error) {
        showCheckoutStatus(`Payment failed: ${error.message}`, 'error');
    } finally {
        showCheckoutLoading(false);
    }
}

function updateCartTotalAfterGiftCard(remainingAmount) {
    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.textContent = `$${remainingAmount.toFixed(2)}`;
    currentCartTotal = remainingAmount;
}

// ============================================================================
// Receipt Formatting (kept for future use, but not called)
// ============================================================================

async function formatReceiptForPrinter(transaction) {
    // Function kept but not called – returns empty string
    console.log('Receipt formatting skipped (remote work)');
    return '';
}

// ============================================================================
// Event Listeners
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'check-out') {
        const searchResults = document.getElementById('search-results');
        if (searchResults && currentSearchResults.length === 0) {
            searchResults.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-search" style="font-size: 48px; margin-bottom: 20px; color: #ccc;"></i>
                    <p>Enter a search term to find records</p>
                </div>
            `;
        }
        refreshTerminals();
    }
});

document.addEventListener('keypress', function(e) {
    if (e.target.id === 'search-query' && e.key === 'Enter') {
        e.preventDefault();
        searchRecordsAndAccessories();
    }
});

window.printToVCP8370 = printToVCP8370;
window.printToThermalPrinter = printToThermalPrinter;

console.log('✅ checkout.js loaded with VCP-8370 printer support, custom sale price, and Discogs sell button (no confirmation popup, no receipt printing)');