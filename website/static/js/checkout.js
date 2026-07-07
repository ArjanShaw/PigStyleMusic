// ============================================================================
// checkout.js - Check Out Tab Functionality with Edit/Delete
// ============================================================================

// Shopping Cart Variables
let checkoutCart = [];
let pendingCartCheckout = null;
let currentDiscount = {
    amount: 0,
    type: 'percentage',
    value: 0
};
let currentCustomSalePrice = null;
let currentSearchResults = [];
let availableTerminals = [];
let selectedTerminalId = null;
let activeCheckoutId = null;
let square_payment_sessions = {};
let squarePaymentResolve = null;

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
    setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
};

window.showCheckoutLoading = function(show) {
    const loadingEl = document.getElementById('checkout-loading');
    if (loadingEl) loadingEl.style.display = show ? 'flex' : 'none';
};

window.escapeHtml = function(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

window.getStatusText = function(statusId) {
    const map = { 1: 'Inactive', 2: 'Active', 3: 'Sold (Store)', 4: 'Sold (Discogs)' };
    return map[statusId] || 'Unknown';
};

function centerText(text, width) {
    if (!text) return ''.padEnd(width, ' ');
    text = String(text);
    const padding = Math.max(0, width - text.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    const result = ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    return result.substring(0, width);
}

function generateOrderId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

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
            gross_amount: transaction.total || 0,
            transaction_date: dateStr,
            external_transaction_id: externalTransactionId || null
        }
    };
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
    if (data.status !== 'success') throw new Error(data.error || 'Failed to create order');
    return { success: true, orderId, orderNumber };
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
        if (currentDiscount.amount !== 0) {
            currentDiscount = { amount: 0, type: 'percentage', value: 0 };
            const discountAmount = document.getElementById('discount-amount');
            if (discountAmount) discountAmount.value = '';
        }
    } else {
        currentCustomSalePrice = customPrice;
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
    if (customPriceInput) customPriceInput.value = '';
    currentCustomSalePrice = null;
    updateCartDisplay();
    showCheckoutStatus('Custom sale price cleared', 'info');
};

function validateItemPrice(item) {
    const price = parseFloat(item.store_price);
    if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid or missing price for item: ${item.artist || item.description || item.note || 'Unknown'} (Price: ${item.store_price})`);
    }
    return price;
}

async function validateTaxRate() {
    const taxRateStr = await getConfigValue('TAX_RATE');
    if (!taxRateStr && taxRateStr !== 0) throw new Error('TAX_RATE configuration value is missing');
    const taxRate = parseFloat(taxRateStr);
    if (isNaN(taxRate)) throw new Error(`Invalid TAX_RATE configuration value: ${taxRateStr}`);
    return taxRate / 100;
}

// ============================================================================
// VCP-8370 Thermal Printer Functions
// ============================================================================

function isWebUSBSupported() { return navigator.usb !== undefined; }

async function connectVCP8370() {
    if (!isWebUSBSupported()) throw new Error('WebUSB not supported. Use Chrome/Edge for thermal printing.');
    const devices = await navigator.usb.getDevices();
    if (devices.length === 0) throw new Error('No paired printer found. Please pair your printer via Chrome settings.');
    const device = devices[0];
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    let outEndpoint = null;
    let interfaceNumber = null;
    for (const iface of device.configuration.interfaces) {
        for (const alt of iface.alternates) {
            for (const endpoint of alt.endpoints) {
                if (endpoint.direction === 'out') {
                    outEndpoint = endpoint;
                    interfaceNumber = iface.interfaceNumber;
                    break;
                }
            }
            if (outEndpoint) break;
        }
        if (outEndpoint) break;
    }
    if (!outEndpoint) throw new Error('No OUT endpoint found on printer.');
    await device.claimInterface(interfaceNumber);
    return { device, endpointNumber: outEndpoint.endpointNumber };
}

async function formatReceiptAsESCPOS(receiptText) {
    const encoder = new TextEncoder('utf-8');
    let commands = [];
    commands.push(PrinterCommands.INIT);
    commands.push(PrinterCommands.LINE_SPACING_30);
    const charsPerLine = await getConfigValue('PRINTER_CHARS_PER_LINE');
    const cutPaper = await getConfigValue('PRINTER_CUT_PAPER');
    const openDrawer = await getConfigValue('PRINTER_OPEN_DRAWER');
    const lines = receiptText.split('\n');
    for (const line of lines) {
        if (!line.trim()) { commands.push(PrinterCommands.LF); continue; }
        if (line.startsWith('=') && line.length > 5) {
            commands.push(PrinterCommands.ALIGN_CENTER);
            commands.push(PrinterCommands.BOLD_ON);
            commands.push(line.substring(0, charsPerLine));
            commands.push(PrinterCommands.BOLD_OFF);
            commands.push(PrinterCommands.LF);
        } else if (line.startsWith('-')) {
            commands.push(PrinterCommands.ALIGN_LEFT);
            commands.push(line.substring(0, charsPerLine));
            commands.push(PrinterCommands.LF);
        } else if (line.includes('TOTAL:')) {
            commands.push(PrinterCommands.ALIGN_CENTER);
            commands.push(PrinterCommands.BOLD_ON);
            commands.push(line.substring(0, charsPerLine));
            commands.push(PrinterCommands.BOLD_OFF);
            commands.push(PrinterCommands.LF);
        } else if (line.includes('THANK YOU') || line.includes('Thank you')) {
            commands.push(PrinterCommands.ALIGN_CENTER);
            commands.push(line.substring(0, charsPerLine));
            commands.push(PrinterCommands.LF);
            commands.push(PrinterCommands.LF);
        } else {
            commands.push(PrinterCommands.ALIGN_LEFT);
            commands.push(line.substring(0, charsPerLine));
            commands.push(PrinterCommands.LF);
        }
    }
    commands.push(PrinterCommands.LF);
    commands.push(PrinterCommands.LF);
    if (cutPaper !== 'false') commands.push(PrinterCommands.CUT);
    if (openDrawer !== 'false') commands.push(PrinterCommands.OPEN_DRAWER);
    const commandString = commands.join('');
    return encoder.encode(commandString);
}

window.printToVCP8370 = async function(receiptText) {
    const { device, endpointNumber } = await connectVCP8370();
    const escposData = await formatReceiptAsESCPOS(receiptText);
    const chunkSize = 64;
    for (let i = 0; i < escposData.length; i += chunkSize) {
        const chunk = escposData.slice(i, Math.min(i + chunkSize, escposData.length));
        await device.transferOut(endpointNumber, chunk);
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    await device.close();
    return true;
};

window.printToThermalPrinter = async function(receiptText) {
    return printToVCP8370(receiptText);
};

function showPrinterOptionsModal() {
    return new Promise((resolve) => {
        let modal = document.getElementById('printer-options-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'printer-options-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px; width: 90%;">
                    <div class="modal-header" style="background: #ffc107; color: #333;">
                        <h3 class="modal-title"><i class="fas fa-print"></i> Print Receipt</h3>
                        <button class="modal-close" onclick="document.getElementById('printer-options-modal').style.display='none'" style="color: #333;">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="font-size: 16px; margin-bottom: 15px;">Would you like to print a receipt?</p>
                    </div>
                    <div class="modal-footer" style="display: flex; gap: 10px; justify-content: center;">
                        <button class="btn btn-primary" id="printer-print-btn" style="flex: 1; padding: 12px;">
                            <i class="fas fa-print"></i> Print Receipt
                        </button>
                        <button class="btn btn-secondary" id="printer-skip-btn" style="flex: 1; padding: 12px; background: #6c757d; color: white;">
                            <i class="fas fa-times"></i> No Receipt
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        const newPrintBtn = document.createElement('button');
        newPrintBtn.className = 'btn btn-primary';
        newPrintBtn.style.cssText = 'flex:1;padding:12px;';
        newPrintBtn.innerHTML = '<i class="fas fa-print"></i> Print Receipt';
        const newSkipBtn = document.createElement('button');
        newSkipBtn.className = 'btn btn-secondary';
        newSkipBtn.style.cssText = 'flex:1;padding:12px;background:#6c757d;color:white;';
        newSkipBtn.innerHTML = '<i class="fas fa-times"></i> No Receipt';
        const footer = modal.querySelector('.modal-footer');
        footer.innerHTML = '';
        footer.appendChild(newPrintBtn);
        footer.appendChild(newSkipBtn);
        newPrintBtn.addEventListener('click', () => { modal.style.display = 'none'; resolve('print'); });
        newSkipBtn.addEventListener('click', () => { modal.style.display = 'none'; resolve('skip'); });
        modal.querySelector('.modal-close').addEventListener('click', () => { modal.style.display = 'none'; resolve('skip'); });
    });
}

// ============================================================================
// Square Payment Modal Functions
// ============================================================================

function showSquarePaymentModal(amount, terminalName) {
    const modal = document.getElementById('square-payment-modal');
    if (!modal) return;
    document.getElementById('square-status-icon').innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
    document.getElementById('square-status-icon').style.color = '#ffc107';
    document.getElementById('square-status-message').textContent = 'Waiting for payment on terminal...';
    document.getElementById('square-status-detail').textContent = 'Please complete payment on the Square Terminal';
    document.getElementById('square-modal-status-text').textContent = 'Waiting...';
    document.getElementById('square-modal-status-text').style.color = '#ffc107';
    document.getElementById('square-modal-amount').textContent = `$${amount.toFixed(2)}`;
    document.getElementById('square-modal-terminal').textContent = terminalName || '--';
    document.getElementById('square-force-complete-btn').disabled = false;
    document.getElementById('square-force-complete-btn').style.opacity = '1';
    modal.style.display = 'flex';
}

function updateSquarePaymentModal(status, message, detail) {
    const icon = document.getElementById('square-status-icon');
    const statusMsg = document.getElementById('square-status-message');
    const detailEl = document.getElementById('square-status-detail');
    const statusText = document.getElementById('square-modal-status-text');
    if (status === 'processing') {
        icon.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
        icon.style.color = '#ffc107';
    } else if (status === 'completed') {
        icon.innerHTML = '<i class="fas fa-check-circle"></i>';
        icon.style.color = '#28a745';
    } else if (status === 'error') {
        icon.innerHTML = '<i class="fas fa-times-circle"></i>';
        icon.style.color = '#dc3545';
    } else if (status === 'force') {
        icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        icon.style.color = '#ffc107';
    }
    statusMsg.textContent = message || 'Processing...';
    detailEl.textContent = detail || '';
    statusText.textContent = status === 'completed' ? '✅ Completed' : status === 'error' ? '❌ Error' : status === 'force' ? '⚠️ Force Complete' : '⏳ Waiting...';
    statusText.style.color = status === 'completed' ? '#28a745' : status === 'error' ? '#dc3545' : status === 'force' ? '#856404' : '#ffc107';
}

function closeSquarePaymentModal() {
    const modal = document.getElementById('square-payment-modal');
    if (modal) modal.style.display = 'none';
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
    if (!terminalList) return;
    terminalList.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="loading-spinner" style="width: 30px; height: 30px;"></div><p>Loading terminals...</p></div>';
    const response = await fetch(`${AppConfig.baseUrl}/api/square/terminals`, { credentials: 'include' });
    if (!response.ok) {
        const errorText = await response.text();
        terminalList.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;"><i class="fas fa-exclamation-circle"></i> Error ${response.status}: ${errorText}</div>`;
        return;
    }
    const data = await response.json();
    if (data.status === 'success') {
        availableTerminals = data.terminals || [];
        renderTerminalList(availableTerminals);
    } else {
        terminalList.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">${data.message || 'Unknown error'}</div>`;
    }
};

function renderTerminalList(terminals) {
    const terminalList = document.getElementById('terminal-list');
    if (!terminalList) return;
    if (terminals.length === 0) {
        terminalList.innerHTML = `<div style="text-align:center;padding:20px;color:#666;"><i class="fas fa-square" style="font-size:24px;color:#ccc;"></i><p>No Square Terminals found</p></div>`;
        return;
    }
    let html = '';
    terminals.forEach(terminal => {
        let displayId = terminal.id;
        let storeId = terminal.id;
        if (storeId && storeId.startsWith('device:')) storeId = storeId.replace('device:', '');
        const isOnline = terminal.status === 'ONLINE';
        const isSelected = selectedTerminalId === storeId;
        html += `<div class="terminal-item ${isSelected ? 'selected' : ''}" onclick="selectTerminal('${storeId}')">
            <div class="terminal-icon"><i class="fas fa-square"></i></div>
            <div class="terminal-details">
                <div class="terminal-name">${escapeHtml(terminal.device_name) || 'Square Terminal'}</div>
                <div class="terminal-id">ID: ${escapeHtml(displayId)}</div>
            </div>
            <div class="terminal-status ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</div>
        </div>`;
    });
    terminalList.innerHTML = html;
    if (terminals.length === 1) {
        let singleId = terminals[0].id;
        if (singleId && singleId.startsWith('device:')) singleId = singleId.replace('device:', '');
        selectedTerminalId = singleId;
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
    if (!note) { showCheckoutStatus('Please enter a description', 'error'); return; }
    if (isNaN(price) || price <= 0) { showCheckoutStatus('Please enter a valid price', 'error'); return; }
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
    showCheckoutStatus(`Added custom item: "${note.substring(0,30)}${note.length>30?'...':''}" - $${price.toFixed(2)}${bernIt ? ' (🔥 BERN IT)' : ''}`, 'success');
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
    const currentResponse = await fetch(`${AppConfig.baseUrl}/config/BERN_FUND`, { credentials: 'include' });
    let currentAmount = 0;
    if (currentResponse.ok) {
        const data = await currentResponse.json();
        if (data.config_value) currentAmount = parseFloat(data.config_value) || 0;
    }
    const newAmount = currentAmount + amount;
    await fetch(`${AppConfig.baseUrl}/config/BERN_FUND`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_value: newAmount.toString() })
    });
    console.log(`🔥 BERN fund updated: $${currentAmount.toFixed(2)} → $${newAmount.toFixed(2)}`);
}

// ============================================================================
// Search Functions
// ============================================================================

window.searchRecordsAndAccessories = async function() {
    const query = document.getElementById('search-query')?.value.trim();
    if (!query) { showCheckoutStatus('Please enter a search term', 'error'); return; }
    const activeOnly = document.getElementById('filter-active')?.checked || false;
    const barcodeOnly = document.getElementById('filter-barcode')?.checked || false;
    showCheckoutLoading(true);
    try {
        const recordsUrl = `${AppConfig.baseUrl}/records/search?q=${encodeURIComponent(query)}`;
        const recordsResponse = await fetch(recordsUrl, { credentials: 'include' });
        if (!recordsResponse.ok) throw new Error(`Records search failed: ${recordsResponse.status}`);
        const recordsData = await recordsResponse.json();
        if (recordsData.status !== 'success') throw new Error(recordsData.error || 'Records search failed');
        let records = recordsData.records || [];
        if (activeOnly) records = records.filter(r => r.status_id === 2);
        if (barcodeOnly) records = records.filter(r => r.barcode && r.barcode.toLowerCase().includes(query.toLowerCase()));
        currentSearchResults = [...records];
        currentSearchResults.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        renderSearchResults(currentSearchResults);
        showCheckoutStatus(`Found ${records.length} records`, 'success');
        const isNumericQuery = /^\d+$/.test(query);
        if (isNumericQuery && currentSearchResults.length === 1) {
            const singleItem = currentSearchResults[0];
            if (!checkoutCart.some(cartItem => cartItem.id === singleItem.id)) {
                if (singleItem.status_id === 2) {
                    addToCart(singleItem);
                    showCheckoutStatus(`Auto-added: ${singleItem.artist} - ${singleItem.title}`, 'success');
                } else {
                    showCheckoutStatus(`Item is not active`, 'warning');
                }
            } else {
                showCheckoutStatus(`Item already in cart`, 'info');
            }
        }
    } catch (error) {
        showCheckoutStatus(`Error searching: ${error.message}`, 'error');
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
        container.innerHTML = `<div style="text-align:center;padding:40px;color:#666;"><i class="fas fa-search" style="font-size:48px;color:#ccc;"></i><p>No items found</p></div>`;
        return;
    }
    let html = '';
    results.forEach(item => {
        const inCart = checkoutCart.some(cartItem => cartItem.id === item.id);
        const statusName = getStatusText(item.status_id);
        // Edit and Delete buttons
        html += `
            <div class="search-result-item">
                <div class="result-details">
                    <div class="result-artist">${escapeHtml(item.artist) || 'Unknown Artist'}</div>
                    <div class="result-title">${escapeHtml(item.title) || 'Unknown Title'}</div>
                    <div class="result-meta">
                        <span class="result-catalog">${escapeHtml(item.catalog_number) || 'No catalog'}</span>
                        ${item.barcode ? `<span class="result-barcode"><i class="fas fa-barcode"></i> ${escapeHtml(item.barcode)}</span>` : ''}
                        <span>Status: ${statusName}</span>
                    </div>
                </div>
                <div class="result-price">$${(item.store_price || 0).toFixed(2)}</div>
                <div class="result-actions">
                    ${item.status_id === 3 || item.status_id === 4 ? 
                        '<span class="sold-badge"><i class="fas fa-check-circle"></i> Sold</span>' : 
                        item.status_id === 2 ?
                        (inCart ? 
                            `<button class="btn btn-secondary btn-sm" onclick="removeFromCart(${item.id})"><i class="fas fa-minus"></i> Remove</button>` :
                            `<button class="btn btn-cart btn-sm" onclick="addToCartFromData(${item.id})"><i class="fas fa-cart-plus"></i> Add to Cart</button>`
                        ) :
                        '<span class="inactive-badge">Not Active</span>'
                    }
                    <!-- EDIT & DELETE buttons -->
                    <button class="btn btn-info btn-sm" onclick="editRecord(${item.id})" title="Edit Record"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="deleteRecord(${item.id})" title="Delete Record"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
    updateCartDisplay();
}

// ============================================================================
// Edit & Delete Functions (NEW)
// ============================================================================

window.editRecord = async function(recordId) {
    // Find the record in current search results
    const record = currentSearchResults.find(r => r.id === recordId);
    if (!record) { showCheckoutStatus('Record not found', 'error'); return; }
    // Simple prompt-based edit; can be expanded to a modal.
    const newPrice = prompt('New price:', record.store_price);
    if (newPrice === null) return;
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) { showCheckoutStatus('Invalid price', 'error'); return; }
    const newNotes = prompt('New notes:', record.notes || '');
    if (newNotes === null) return;
    const newLocation = prompt('New location:', record.location || '');
    if (newLocation === null) return;
    const updates = {
        store_price: price,
        notes: newNotes || null,
        location: newLocation || null
    };
    try {
        const response = await fetch(`${AppConfig.baseUrl}/records/${recordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || 'Update failed');
        showCheckoutStatus('Record updated successfully', 'success');
        // Refresh search
        const query = document.getElementById('search-query')?.value.trim();
        if (query) searchRecordsAndAccessories();
        else { currentSearchResults = []; renderSearchResults([]); }
    } catch (error) {
        showCheckoutStatus(`Update failed: ${error.message}`, 'error');
    }
};

window.deleteRecord = async function(recordId) {
    if (!confirm('Delete this record permanently?')) return;
    try {
        const response = await fetch(`${AppConfig.baseUrl}/records/${recordId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || 'Delete failed');
        showCheckoutStatus('Record deleted', 'success');
        // Refresh search
        const query = document.getElementById('search-query')?.value.trim();
        if (query) searchRecordsAndAccessories();
        else { currentSearchResults = []; renderSearchResults([]); }
    } catch (error) {
        showCheckoutStatus(`Delete failed: ${error.message}`, 'error');
    }
};

// ============================================================================
// Cart Functions
// ============================================================================

window.addToCartFromData = function(recordId) {
    const record = currentSearchResults.find(r => r.id === recordId);
    if (record) addToCart(record);
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
    if (confirm('Clear cart?')) {
        checkoutCart = [];
        currentDiscount = { amount: 0, type: 'percentage', value: 0 };
        currentCustomSalePrice = null;
        document.getElementById('discount-amount').value = '';
        document.getElementById('discount-type').value = 'percentage';
        document.getElementById('custom-sale-price').value = '';
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus('Cart cleared', 'info');
    }
};

window.updateCartWithDiscount = function() {
    if (currentCustomSalePrice !== null) {
        document.getElementById('custom-sale-price').value = '';
        currentCustomSalePrice = null;
    }
    const discountAmount = parseFloat(document.getElementById('discount-amount')?.value) || 0;
    const discountType = document.getElementById('discount-type')?.value || 'percentage';
    const errorDiv = document.getElementById('discount-error');
    if (discountAmount < 0) { errorDiv.textContent = 'Discount cannot be negative'; errorDiv.style.display = 'block'; return; }
    if (discountType === 'percentage' && discountAmount > 100) { errorDiv.textContent = 'Percentage discount cannot exceed 100%'; errorDiv.style.display = 'block'; return; }
    currentDiscount = { amount: discountAmount, type: discountType, value: 0 };
    errorDiv.style.display = 'none';
    updateCartDisplay();
};

function calculateTotals() {
    let originalSubtotal = 0;
    checkoutCart.forEach(item => { originalSubtotal += validateItemPrice(item); });
    let discountedSubtotal = originalSubtotal;
    let discountValue = 0;
    const discountRow = document.getElementById('discount-row');
    const discountDisplay = document.getElementById('cart-discount');
    const errorDiv = document.getElementById('discount-error');
    const customPriceRow = document.getElementById('custom-price-row');
    const customPriceDisplay = document.getElementById('cart-custom-price');
    const savingsDisplay = document.getElementById('savings-display');

    if (currentCustomSalePrice !== null && currentCustomSalePrice > 0) {
        discountedSubtotal = currentCustomSalePrice;
        customPriceRow.style.display = 'flex';
        customPriceDisplay.textContent = `$${currentCustomSalePrice.toFixed(2)}`;
        discountRow.style.display = 'none';
        const savings = originalSubtotal - currentCustomSalePrice;
        savingsDisplay.innerHTML = savings > 0 ? `<i class="fas fa-tag"></i> Savings: $${savings.toFixed(2)} (${((savings/originalSubtotal)*100).toFixed(1)}% off)` : '';
    } else {
        customPriceRow.style.display = 'none';
        if (currentDiscount.amount > 0) {
            if (currentDiscount.type === 'percentage') {
                discountValue = originalSubtotal * (currentDiscount.amount / 100);
                if (discountValue > originalSubtotal) { errorDiv.textContent = 'Discount exceeds subtotal'; errorDiv.style.display = 'block'; currentDiscount.value = 0; discountRow.style.display = 'none'; discountedSubtotal = originalSubtotal; }
                else { currentDiscount.value = discountValue; discountedSubtotal = originalSubtotal - discountValue; discountDisplay.textContent = `-$${discountValue.toFixed(2)} (${currentDiscount.amount}%)`; discountRow.style.display = 'flex'; }
            } else {
                if (currentDiscount.amount <= originalSubtotal) {
                    discountValue = currentDiscount.amount;
                    currentDiscount.value = discountValue;
                    discountedSubtotal = originalSubtotal - discountValue;
                    discountDisplay.textContent = `-$${discountValue.toFixed(2)}`;
                    discountRow.style.display = 'flex';
                } else { errorDiv.textContent = 'Fixed discount exceeds subtotal'; errorDiv.style.display = 'block'; currentDiscount.value = 0; discountRow.style.display = 'none'; discountedSubtotal = originalSubtotal; }
            }
        } else { discountRow.style.display = 'none'; currentDiscount.value = 0; }
        savingsDisplay.innerHTML = discountValue > 0 ? `<i class="fas fa-tag"></i> Discount: $${discountValue.toFixed(2)} (${((discountValue/originalSubtotal)*100).toFixed(1)}% off)` : '';
    }
    return { originalSubtotal, discountedSubtotal, discountValue };
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
        cartSection.style.display = 'none';
        if (squareBtn) squareBtn.disabled = true;
        if (discogsBtn) discogsBtn.disabled = true;
        return;
    }
    cartSection.style.display = 'block';
    cartCount.textContent = `${checkoutCart.length} item${checkoutCart.length!==1?'s':''}`;

    const { originalSubtotal, discountedSubtotal } = calculateTotals();
    const taxRate = await validateTaxRate();
    taxRateDisplay.textContent = (taxRate * 100).toFixed(1);
    const tax = discountedSubtotal * taxRate;
    const total = discountedSubtotal + tax;

    cartOriginalSubtotal.textContent = `$${originalSubtotal.toFixed(2)}`;
    cartTax.textContent = `$${tax.toFixed(2)}`;
    cartTotal.textContent = `$${total.toFixed(2)}`;
    if (squareBtn) squareBtn.disabled = false;
    if (discogsBtn) discogsBtn.disabled = false;
    currentCartTotal = total;

    let cartHtml = '';
    checkoutCart.forEach(item => {
        if (item.type === 'custom') {
            const bernBadge = item.bern_it ? `<div style="font-size:11px;color:#e67e22;"><i class="fas fa-fire"></i> 🔥 BERN IT</div>` : '';
            cartHtml += `
                <div class="cart-item" style="border-left:4px solid #ffd700;background:linear-gradient(135deg,#fff9e6 0%,#fff 100%);">
                    <div class="cart-item-details">
                        <div class="cart-item-artist"><span class="accessory-badge" style="background:#ffd700;color:#333;">CUSTOM</span> ${escapeHtml(item.note)}</div>
                        <div class="cart-item-meta"><i class="fas fa-pencil-alt"></i> Manual entry</div>
                        ${bernBadge}
                    </div>
                    <div class="cart-item-price">$${(item.store_price||0).toFixed(2)}</div>
                    <div class="cart-item-remove" onclick="removeCustomItemFromCart('${item.id}')"><i class="fas fa-times"></i></div>
                </div>
            `;
        } else {
            cartHtml += `
                <div class="cart-item">
                    <div class="cart-item-details">
                        <div class="cart-item-artist">${escapeHtml(item.artist)}</div>
                        <div class="cart-item-title">${escapeHtml(item.title)}</div>
                        <div class="cart-item-meta">${escapeHtml(item.catalog_number)}</div>
                    </div>
                    <div class="cart-item-price">$${(item.store_price||0).toFixed(2)}</div>
                    <div class="cart-item-remove" onclick="removeFromCart(${item.id})"><i class="fas fa-times"></i></div>
                </div>
            `;
        }
    });
    cartItems.innerHTML = cartHtml;
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
        if (terminalId && terminalId.startsWith('device:')) terminalId = terminalId.replace('device:', '');
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
    const confirmBtn = document.getElementById('confirm-terminal-btn');
    confirmBtn.disabled = !(selectedTerminalId && onlineTerminals.some(t => {
        let tid = t.id;
        if (tid && tid.startsWith('device:')) tid = tid.replace('device:', '');
        return tid === selectedTerminalId;
    }));
    modal.style.display = 'flex';
}

window.selectTerminalForCheckout = function(terminalId) {
    selectedTerminalId = terminalId;
    document.querySelectorAll('input[name="terminal"]').forEach(radio => { radio.checked = radio.value === terminalId; });
    document.getElementById('confirm-terminal-btn').disabled = false;
};

window.closeTerminalSelectionModal = function() {
    document.getElementById('terminal-selection-modal').style.display = 'none';
};

function startPollingCheckoutStatus(checkoutId) {
    const pollInterval = setInterval(async () => {
        const response = await fetch(`${AppConfig.baseUrl}/api/square/terminal/checkout/${checkoutId}/status`, { credentials: 'include' });
        if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || 'Failed to get checkout status');
        const checkout = data.checkout;
        const status = checkout.status;
        if (square_payment_sessions[checkoutId]) {
            square_payment_sessions[checkoutId].status = status;
            if (status === 'PENDING') {
                updateSquarePaymentModal('processing', 'Waiting for payment...', 'Please complete payment on the Square Terminal');
            } else if (status === 'COMPLETED') {
                updateSquarePaymentModal('completed', 'Payment Confirmed!', 'Processing sale...');
                if (!checkout.payment_ids || checkout.payment_ids.length === 0) throw new Error('Checkout completed but no payment ID');
                const paymentId = checkout.payment_ids[0];
                square_payment_sessions[checkoutId].payment_id = paymentId;
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
    }, 3000);
    if (square_payment_sessions[checkoutId]) square_payment_sessions[checkoutId].pollInterval = pollInterval;
    setTimeout(() => clearInterval(pollInterval), 300000);
}

// ============================================================================
// Square Payment - Main Functions
// ============================================================================

window.processSquarePayment = function() {
    if (checkoutCart.length === 0) { showCheckoutStatus('Cart is empty', 'error'); return; }
    if (availableTerminals.length === 0) { showCheckoutStatus('No Square Terminals available', 'error'); return; }
    const onlineTerminals = availableTerminals.filter(t => t.status === 'ONLINE');
    if (onlineTerminals.length === 0) { showCheckoutStatus('No online terminals available', 'error'); return; }
    const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
    let terminalName = 'Square Terminal';
    if (availableTerminals.length === 1) terminalName = availableTerminals[0].device_name || 'Square Terminal';
    showSquarePaymentModal(total, terminalName);
    pendingCartCheckout = { items: [...checkoutCart], type: 'cart', discount: { ...currentDiscount }, customSalePrice: currentCustomSalePrice };
    if (availableTerminals.length === 1) {
        let singleTerminalId = availableTerminals[0].id;
        if (singleTerminalId && singleTerminalId.startsWith('device:')) singleTerminalId = singleTerminalId.replace('device:', '');
        selectedTerminalId = singleTerminalId;
        initiateCartTerminalCheckout();
    } else {
        renderTerminalSelectionModal();
    }
};

window.initiateCartTerminalCheckout = async function() {
    if (!pendingCartCheckout) { showCheckoutStatus('No items selected', 'error'); closeTerminalSelectionModal(); return; }
    if (!selectedTerminalId) { showCheckoutStatus('Please select a terminal', 'error'); return; }
    updateSquarePaymentModal('processing', 'Creating checkout on terminal...', 'Please wait');
    const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
    const amountCents = Math.round(total * 100);
    const recordIds = pendingCartCheckout.items.map(item => item.type === 'custom' ? `custom_${item.id}` : item.id);
    const recordTitles = pendingCartCheckout.items.map(item => item.type === 'custom' ? item.note : item.title);
    closeTerminalSelectionModal();
    const response = await fetch(`${AppConfig.baseUrl}/api/square/terminal/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount_cents: amountCents, record_ids: recordIds, record_titles: recordTitles, device_id: selectedTerminalId })
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    if (data.status !== 'success') throw new Error(data.message || 'Failed to create checkout');
    const checkout = data.checkout;
    activeCheckoutId = checkout.id;
    square_payment_sessions[activeCheckoutId] = { record_ids: recordIds, amount: total, status: 'CREATED', payment_id: null, checkout_data: checkout };
    updateSquarePaymentModal('processing', 'Waiting for payment on terminal...', `Amount: $${total.toFixed(2)}`);
    startPollingCheckoutStatus(activeCheckoutId);
};

window.forceCompleteSquarePayment = async function() {
    if (!activeCheckoutId) { showCheckoutStatus('No active checkout', 'error'); return; }
    if (!pendingCartCheckout) { showCheckoutStatus('No pending cart', 'error'); return; }
    updateSquarePaymentModal('force', 'Force completing sale...', 'Marking sale as completed manually');
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
};

window.cancelSquarePayment = function() {
    if (!activeCheckoutId) { showCheckoutStatus('No active checkout', 'info'); closeSquarePaymentModal(); return; }
    if (square_payment_sessions[activeCheckoutId] && square_payment_sessions[activeCheckoutId].pollInterval) {
        clearInterval(square_payment_sessions[activeCheckoutId].pollInterval);
    }
    updateSquarePaymentModal('processing', 'Cancelling checkout...', 'Please wait');
    cancelTerminalCheckout();
};

window.cancelTerminalCheckout = async function() {
    if (!activeCheckoutId) { showCheckoutStatus('No active checkout', 'info'); closeSquarePaymentModal(); return; }
    const response = await fetch(`${AppConfig.baseUrl}/api/square/terminal/checkout/${activeCheckoutId}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    if (data.status !== 'success') throw new Error(data.message || 'Failed to cancel checkout');
    showCheckoutStatus('Checkout cancelled successfully', 'success');
    updateSquarePaymentModal('completed', 'Cancelled', 'Checkout has been cancelled');
    setTimeout(closeSquarePaymentModal, 1000);
    if (square_payment_sessions[activeCheckoutId]) delete square_payment_sessions[activeCheckoutId];
    activeCheckoutId = null;
};

window.closeTerminalCheckoutModal = function() {
    document.getElementById('terminal-checkout-modal').style.display = 'none';
    if (activeCheckoutId && square_payment_sessions[activeCheckoutId] && square_payment_sessions[activeCheckoutId].pollInterval) {
        clearInterval(square_payment_sessions[activeCheckoutId].pollInterval);
    }
    activeCheckoutId = null;
};

window.completeSquarePayment = async function() {
    if (!pendingCartCheckout) { showCheckoutStatus('No pending checkout', 'error'); return; }
    await processSquarePaymentSuccess();
    closeSquarePaymentModal();
    showCheckoutStatus('Payment completed successfully!', 'success');
};

async function processSquarePaymentSuccess() {
    showCheckoutLoading(true);
    let successCount = 0, errorCount = 0, soldItems = [], consignorPayments = {}, bernTotal = 0;
    let squarePaymentId = null;
    if (activeCheckoutId) {
        if (!square_payment_sessions || !square_payment_sessions[activeCheckoutId]) throw new Error('No checkout session found');
        squarePaymentId = square_payment_sessions[activeCheckoutId].payment_id;
        if (!squarePaymentId) {
            const statusResponse = await fetch(`${AppConfig.baseUrl}/api/square/terminal/checkout/${activeCheckoutId}/status`, { credentials: 'include' });
            if (!statusResponse.ok) throw new Error(`Failed to get checkout status: ${statusResponse.status}`);
            const statusData = await statusResponse.json();
            if (statusData.status !== 'success') throw new Error(statusData.error || 'Failed to get checkout status');
            const checkout = statusData.checkout;
            if (checkout.status !== 'COMPLETED') throw new Error(`Checkout not completed. Status: ${checkout.status}`);
            if (!checkout.payment_ids || checkout.payment_ids.length === 0) throw new Error('Checkout completed but no payment ID');
            squarePaymentId = checkout.payment_ids[0];
            square_payment_sessions[activeCheckoutId].payment_id = squarePaymentId;
        }
    } else {
        throw new Error('No active checkout ID found');
    }
    const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
    const originalSubtotal = parseFloat(document.getElementById('cart-original-subtotal')?.textContent.replace('$', '') || '0');
    const { discountedSubtotal } = calculateTotals();
    const tax = discountedSubtotal * (await validateTaxRate());

    // Create order
    const orderTransaction = {
        customerName: 'Walk-in Customer',
        subtotal: discountedSubtotal,
        tax: tax,
        total: total,
        items: pendingCartCheckout.items.map(item => ({
            ...item,
            actual_sale_price: item.type === 'custom' ? item.store_price : (parseFloat(item.store_price) / (originalSubtotal || 1)) * discountedSubtotal
        }))
    };
    await createOrderForTransaction(orderTransaction, 'square', squarePaymentId);

    // Process each item
    for (const item of pendingCartCheckout.items) {
        if (item.type === 'custom') {
            successCount++;
            soldItems.push({ ...item, description: item.note || 'Custom Item', store_price: item.store_price });
            if (item.bern_it) bernTotal += item.store_price;
        } else {
            const todayMST = getLocalMSTDate();
            const itemPrice = parseFloat(item.store_price) || 0;
            let actualPrice = (itemPrice / originalSubtotal) * (currentCustomSalePrice !== null ? currentCustomSalePrice : discountedSubtotal);
            const updateResponse = await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status_id: 3, date_sold: todayMST, actual_sale_price: actualPrice })
            });
            if (!updateResponse.ok) throw new Error(`Failed to update record: ${updateResponse.status}`);
            const updateData = await updateResponse.json();
            if (updateData.status !== 'success') throw new Error(updateData.error || 'Failed to update record');
            successCount++;
            soldItems.push({ ...item, actual_sale_price: actualPrice });
            if (item.consignor_id && item.consignor_id !== 1) {
                const commissionRate = parseFloat(item.commission_rate);
                if (isNaN(commissionRate)) throw new Error(`Invalid commission rate for consignor item: ${item.artist} - ${item.title}`);
                const consignorShare = actualPrice * (1 - (commissionRate / 100));
                consignorPayments[item.consignor_id] = (consignorPayments[item.consignor_id] || 0) + consignorShare;
            }
        }
    }
    if (bernTotal > 0) await updateBernFund(bernTotal);
    if (Object.keys(consignorPayments).length > 0) {
        let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
        for (const [cid, amt] of Object.entries(consignorPayments)) storedOwed[cid] = (storedOwed[cid] || 0) + amt;
        localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
        if (typeof window.consignorOwedAmounts !== 'undefined') window.consignorOwedAmounts = storedOwed;
    }
    if (successCount > 0) {
        let cashierName = 'Admin';
        try { const user = JSON.parse(localStorage.getItem('user') || '{}'); cashierName = user.username || 'Admin'; } catch(e) {}
        const taxRate = await validateTaxRate();
        const discount = currentDiscount.value || 0;
        const taxAmount = discountedSubtotal * taxRate;
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
            tax: taxAmount,
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
        if (typeof window.saveReceipt === 'function') await window.saveReceipt(transaction);
        // No thermal printer receipt for Square
        checkoutCart = [];
        currentDiscount = { amount: 0, type: 'percentage', value: 0 };
        currentCustomSalePrice = null;
        document.getElementById('discount-amount').value = '';
        document.getElementById('discount-type').value = 'percentage';
        document.getElementById('custom-sale-price').value = '';
        updateCartDisplay();
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
    if (checkoutCart.length === 0) { showCheckoutStatus('Cart is empty', 'error'); return; }
    const recordItems = checkoutCart.filter(item => item.type !== 'custom');
    const customItems = checkoutCart.filter(item => item.type === 'custom');
    if (recordItems.length === 0) { showCheckoutStatus('No records in cart to mark as Discogs sold', 'error'); return; }
    if (customItems.length > 0) showCheckoutStatus(`Note: ${customItems.length} custom item(s) will remain in cart`, 'warning');
    showCheckoutLoading(true);
    const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
    const originalSubtotal = parseFloat(document.getElementById('cart-original-subtotal')?.textContent.replace('$', '') || '0');
    const { discountedSubtotal } = calculateTotals();
    const tax = discountedSubtotal * (await validateTaxRate());

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
    await createOrderForTransaction(orderTransaction, 'discogs', null);

    let successCount = 0, errorCount = 0, soldItems = [], consignorPayments = {}, bernTotal = 0;
    for (const item of recordItems) {
        try {
            const todayMST = getLocalMSTDate();
            const itemPrice = parseFloat(item.store_price) || 0;
            let actualPrice = (itemPrice / originalSubtotal) * (currentCustomSalePrice !== null ? currentCustomSalePrice : discountedSubtotal);
            const updateResponse = await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status_id: 4, date_sold: todayMST, actual_sale_price: actualPrice })
            });
            if (!updateResponse.ok) throw new Error(`Failed to update record: ${updateResponse.status}`);
            const updateData = await updateResponse.json();
            if (updateData.status !== 'success') throw new Error(updateData.error || 'Failed to update record');
            successCount++;
            soldItems.push({ ...item, actual_sale_price: actualPrice });
            if (item.consignor_id && item.consignor_id !== 1) {
                const commissionRate = parseFloat(item.commission_rate);
                if (isNaN(commissionRate)) throw new Error(`Invalid commission rate for consignor item: ${item.artist} - ${item.title}`);
                const consignorShare = actualPrice * (1 - (commissionRate / 100));
                consignorPayments[item.consignor_id] = (consignorPayments[item.consignor_id] || 0) + consignorShare;
            }
        } catch (error) {
            errorCount++;
            showCheckoutStatus(`Failed to update ${item.artist} - ${item.title}: ${error.message}`, 'error');
        }
    }
    if (successCount > 0) {
        let cashierName = 'Admin';
        try { const user = JSON.parse(localStorage.getItem('user') || '{}'); cashierName = user.username || 'Admin'; } catch(e) {}
        const taxRate = await validateTaxRate();
        const discount = currentDiscount.value || 0;
        const taxAmount = discountedSubtotal * taxRate;
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
            tax: taxAmount,
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
        if (typeof window.saveReceipt === 'function') await window.saveReceipt(transaction);
        // No receipt printing for Discogs
        checkoutCart = checkoutCart.filter(item => item.type === 'custom');
        currentDiscount = { amount: 0, type: 'percentage', value: 0 };
        currentCustomSalePrice = null;
        document.getElementById('discount-amount').value = '';
        document.getElementById('discount-type').value = 'percentage';
        document.getElementById('custom-sale-price').value = '';
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus(`✅ Successfully marked ${successCount} record(s) as sold on Discogs!${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
    }
    showCheckoutLoading(false);
};

// ============================================================================
// Cash Payment Functions
// ============================================================================

window.showTenderModal = function() {
    if (checkoutCart.length === 0) { showCheckoutStatus('Cart is empty', 'error'); return; }
    const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
    document.getElementById('tender-total-due').textContent = `$${total.toFixed(2)}`;
    const tenderAmount = document.getElementById('tender-amount');
    tenderAmount.value = '';
    tenderAmount.removeEventListener('input', handleTenderInput);
    tenderAmount.addEventListener('input', handleTenderInput);
    document.getElementById('change-display-container').style.display = 'none';
    document.getElementById('complete-payment-btn').disabled = true;
    document.getElementById('tender-modal').style.display = 'flex';
    tenderAmount.focus();
};

function handleTenderInput(e) {
    const tendered = parseFloat(e.target.value) || 0;
    const total = parseFloat(document.getElementById('tender-total-due')?.textContent.replace('$', '') || '0');
    const changeDisplay = document.getElementById('change-display-container');
    const changeAmount = document.getElementById('change-amount');
    const completeBtn = document.getElementById('complete-payment-btn');
    if (tendered >= total) {
        const change = tendered - total;
        changeAmount.textContent = `$${change.toFixed(2)}`;
        changeDisplay.style.display = 'block';
        completeBtn.disabled = false;
    } else {
        changeDisplay.style.display = 'none';
        completeBtn.disabled = true;
    }
}

window.closeTenderModal = function() {
    document.getElementById('tender-modal').style.display = 'none';
};

window.processCashPayment = async function() {
    const tendered = parseFloat(document.getElementById('tender-amount')?.value) || 0;
    const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
    if (tendered < total) { showCheckoutStatus('Insufficient payment', 'error'); return; }
    const change = tendered - total;
    closeTenderModal();
    showCheckoutLoading(true);

    const originalSubtotal = parseFloat(document.getElementById('cart-original-subtotal')?.textContent.replace('$', '') || '0');
    const { discountedSubtotal } = calculateTotals();
    const tax = discountedSubtotal * (await validateTaxRate());

    const orderTransaction = {
        customerName: 'Walk-in Customer',
        subtotal: discountedSubtotal,
        tax: tax,
        total: total,
        items: checkoutCart.map(item => ({
            ...item,
            actual_sale_price: item.type === 'custom' ? item.store_price : (parseFloat(item.store_price) / (originalSubtotal || 1)) * discountedSubtotal
        }))
    };
    await createOrderForTransaction(orderTransaction, 'cash', null);

    let successCount = 0, errorCount = 0, soldItems = [], consignorPayments = {}, bernTotal = 0;
    for (const item of checkoutCart) {
        if (item.type === 'custom') {
            successCount++;
            soldItems.push({ ...item, description: item.note || 'Custom Item', store_price: item.store_price });
            if (item.bern_it) bernTotal += item.store_price;
        } else {
            const todayMST = getLocalMSTDate();
            const itemPrice = parseFloat(item.store_price) || 0;
            let actualPrice = (itemPrice / originalSubtotal) * (currentCustomSalePrice !== null ? currentCustomSalePrice : discountedSubtotal);
            const updateResponse = await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status_id: 3, date_sold: todayMST, actual_sale_price: actualPrice })
            });
            if (!updateResponse.ok) throw new Error(`Failed to update record: ${updateResponse.status}`);
            const updateData = await updateResponse.json();
            if (updateData.status !== 'success') throw new Error(updateData.error || 'Failed to update record');
            successCount++;
            soldItems.push({ ...item, actual_sale_price: actualPrice });
            if (item.consignor_id && item.consignor_id !== 1) {
                const commissionRate = parseFloat(item.commission_rate);
                if (isNaN(commissionRate)) throw new Error(`Invalid commission rate for consignor item: ${item.artist} - ${item.title}`);
                const consignorShare = actualPrice * (1 - (commissionRate / 100));
                consignorPayments[item.consignor_id] = (consignorPayments[item.consignor_id] || 0) + consignorShare;
            }
        }
    }
    if (bernTotal > 0) await updateBernFund(bernTotal);
    if (Object.keys(consignorPayments).length > 0) {
        let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
        for (const [cid, amt] of Object.entries(consignorPayments)) storedOwed[cid] = (storedOwed[cid] || 0) + amt;
        localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
        if (typeof window.consignorOwedAmounts !== 'undefined') window.consignorOwedAmounts = storedOwed;
    }
    if (successCount > 0) {
        let cashierName = 'Admin';
        try { const user = JSON.parse(localStorage.getItem('user') || '{}'); cashierName = user.username || 'Admin'; } catch(e) {}
        const taxRate = await validateTaxRate();
        const discount = currentDiscount.value || 0;
        const taxAmount = discountedSubtotal * taxRate;
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
            tax: taxAmount,
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
        if (typeof window.saveReceipt === 'function') await window.saveReceipt(transaction);
        const receiptText = await formatReceiptForPrinter(transaction);
        const choice = await showPrinterOptionsModal();
        if (choice === 'print') {
            await window.printToThermalPrinter(receiptText);
            showCheckoutStatus('✅ Receipt printed successfully.', 'success');
        } else {
            showCheckoutStatus('✅ Sale completed without receipt.', 'info');
        }
        checkoutCart = [];
        currentDiscount = { amount: 0, type: 'percentage', value: 0 };
        currentCustomSalePrice = null;
        document.getElementById('discount-amount').value = '';
        document.getElementById('discount-type').value = 'percentage';
        document.getElementById('custom-sale-price').value = '';
        updateCartDisplay();
        showCheckoutStatus(`✅ Sale completed successfully! ${successCount} item(s) sold.`, 'success');
    } else {
        throw new Error('No items were successfully processed');
    }
    showCheckoutLoading(false);
};

// ============================================================================
// Gift Card Payment Functions
// ============================================================================

window.showGiftCardModal = function() {
    if (checkoutCart.length === 0) { showCheckoutStatus('Cart is empty', 'error'); return; }
    const totalEl = document.getElementById('cart-total');
    currentCartTotal = parseFloat(totalEl?.textContent.replace('$', '') || '0');
    document.getElementById('giftcard-total-due').textContent = `$${currentCartTotal.toFixed(2)}`;
    document.getElementById('giftcard-code').value = '';
    document.getElementById('giftcard-info').style.display = 'none';
    document.getElementById('giftcard-apply-section').style.display = 'none';
    document.getElementById('giftcard-result').style.display = 'none';
    currentGiftCard = null;
    document.getElementById('giftcard-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('giftcard-code').focus(), 100);
};

window.closeGiftCardModal = function() {
    document.getElementById('giftcard-modal').style.display = 'none';
    currentGiftCard = null;
};

window.checkGiftCardForPayment = async function() {
    const code = document.getElementById('giftcard-code').value.trim();
    const resultDiv = document.getElementById('giftcard-result');
    const infoDiv = document.getElementById('giftcard-info');
    const applySection = document.getElementById('giftcard-apply-section');
    if (!code) { resultDiv.style.display = 'block'; resultDiv.innerHTML = '<span style="color:#ffc107;">Please enter a gift card code</span>'; return; }
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<span><i class="fas fa-spinner fa-spin"></i> Checking...</span>';
    const response = await fetch(`${AppConfig.baseUrl}/api/gift-cards/${encodeURIComponent(code)}`, { credentials: 'include' });
    const data = await response.json();
    if (data.success && data.card) {
        currentGiftCard = data.card;
        document.getElementById('giftcard-id-display').textContent = currentGiftCard.id;
        document.getElementById('giftcard-balance-display').textContent = `$${currentGiftCard.balance.toFixed(2)}`;
        infoDiv.style.display = 'block';
        if (currentGiftCard.balance >= currentCartTotal) {
            applySection.style.display = 'block';
            document.getElementById('giftcard-amount').value = currentCartTotal.toFixed(2);
            resultDiv.innerHTML = '<span style="color:#28a745;">✓ Card has sufficient balance</span>';
        } else if (currentGiftCard.balance > 0) {
            applySection.style.display = 'block';
            document.getElementById('giftcard-amount').value = currentGiftCard.balance.toFixed(2);
            resultDiv.innerHTML = `<span style="color:#ffc107;">⚠️ Partial balance: $${currentGiftCard.balance.toFixed(2)}. Remaining balance will need another payment method.</span>`;
        } else {
            applySection.style.display = 'none';
            resultDiv.innerHTML = '<span style="color:#dc3545;">This gift card has $0 balance</span>';
        }
    } else {
        resultDiv.innerHTML = '<span style="color:#dc3545;">Gift card not found</span>';
        infoDiv.style.display = 'none';
        applySection.style.display = 'none';
        currentGiftCard = null;
    }
};

window.setGiftCardAmount = function(type) {
    if (!currentGiftCard) return;
    const input = document.getElementById('giftcard-amount');
    if (type === 'full') input.value = Math.min(currentCartTotal, currentGiftCard.balance).toFixed(2);
    else if (type === 'half') input.value = (Math.min(currentCartTotal, currentGiftCard.balance) / 2).toFixed(2);
};

window.applyGiftCardToCart = async function() {
    if (!currentGiftCard) { showCheckoutStatus('No gift card selected', 'error'); return; }
    const amount = parseFloat(document.getElementById('giftcard-amount').value);
    const resultDiv = document.getElementById('giftcard-result');
    if (isNaN(amount) || amount <= 0) { resultDiv.innerHTML = '<span style="color:#ffc107;">Enter a valid amount</span>'; return; }
    if (amount > currentGiftCard.balance) { resultDiv.innerHTML = '<span style="color:#dc3545;">Amount exceeds balance</span>'; return; }
    if (amount > currentCartTotal) {
        resultDiv.innerHTML = '<span style="color:#ffc107;">Amount exceeds cart total. Using full cart amount.</span>';
        const adjusted = currentCartTotal;
        const response = await fetch(`${AppConfig.baseUrl}/api/gift-cards/${currentGiftCard.id}/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ amount: adjusted })
        });
        const data = await response.json();
        if (data.success) {
            closeGiftCardModal();
            showCheckoutStatus(`Gift card applied: $${adjusted.toFixed(2)}. Cart total is now $0.00`, 'success');
            await completeCheckoutWithGiftCard(adjusted);
        } else {
            showCheckoutStatus(`Error: ${data.error}`, 'error');
        }
        return;
    }
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
};

async function completeCheckoutWithGiftCard(amountPaid) {
    showCheckoutLoading(true);
    const total = parseFloat(document.getElementById('cart-total')?.textContent.replace('$', '') || '0');
    const originalSubtotal = parseFloat(document.getElementById('cart-original-subtotal')?.textContent.replace('$', '') || '0');
    const { discountedSubtotal } = calculateTotals();
    const tax = discountedSubtotal * (await validateTaxRate());

    const orderTransaction = {
        customerName: 'Walk-in Customer',
        subtotal: discountedSubtotal,
        tax: tax,
        total: total,
        items: checkoutCart.map(item => ({
            ...item,
            actual_sale_price: item.type === 'custom' ? item.store_price : (parseFloat(item.store_price) / (originalSubtotal || 1)) * discountedSubtotal
        }))
    };
    await createOrderForTransaction(orderTransaction, 'giftcard', currentGiftCard?.id || null);

    let successCount = 0, errorCount = 0, soldItems = [], consignorPayments = {}, bernTotal = 0;
    for (const item of checkoutCart) {
        if (item.type === 'custom') {
            successCount++; soldItems.push(item);
            if (item.bern_it) bernTotal += item.store_price;
        } else {
            const todayMST = getLocalMSTDate();
            const itemPrice = parseFloat(item.store_price) || 0;
            let actualPrice = (itemPrice / originalSubtotal) * (currentCustomSalePrice !== null ? currentCustomSalePrice : discountedSubtotal);
            const updateResponse = await fetch(`${AppConfig.baseUrl}/records/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status_id: 3, date_sold: todayMST, actual_sale_price: actualPrice })
            });
            if (!updateResponse.ok) throw new Error(`Failed to update record: ${updateResponse.status}`);
            const updateData = await updateResponse.json();
            if (updateData.status !== 'success') throw new Error(updateData.error || 'Failed to update record');
            successCount++;
            soldItems.push({ ...item, actual_sale_price: actualPrice });
            if (item.consignor_id && item.consignor_id !== 1) {
                const commissionRate = parseFloat(item.commission_rate);
                const consignorShare = actualPrice * (1 - (commissionRate / 100));
                consignorPayments[item.consignor_id] = (consignorPayments[item.consignor_id] || 0) + consignorShare;
            }
        }
    }
    if (bernTotal > 0) await updateBernFund(bernTotal);
    if (Object.keys(consignorPayments).length > 0) {
        let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
        for (const [cid, amt] of Object.entries(consignorPayments)) storedOwed[cid] = (storedOwed[cid] || 0) + amt;
        localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
    }
    if (successCount > 0) {
        let cashierName = 'Admin';
        try { const user = JSON.parse(localStorage.getItem('user') || '{}'); cashierName = user.username || 'Admin'; } catch(e) {}
        const taxRate = await validateTaxRate();
        const discount = currentDiscount.value || 0;
        const taxAmount = discountedSubtotal * taxRate;
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
            tax: taxAmount,
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
        if (typeof window.saveReceipt === 'function') await window.saveReceipt(transaction);
        // No receipt for gift card
        checkoutCart = [];
        currentDiscount = { amount: 0, type: 'percentage', value: 0 };
        currentCustomSalePrice = null;
        document.getElementById('discount-amount').value = '';
        document.getElementById('discount-type').value = 'percentage';
        document.getElementById('custom-sale-price').value = '';
        updateCartDisplay();
        searchRecordsAndAccessories();
        showCheckoutStatus(`Successfully sold ${successCount} items with Gift Card`, 'success');
    }
    showCheckoutLoading(false);
}

function updateCartTotalAfterGiftCard(remainingAmount) {
    document.getElementById('cart-total').textContent = `$${remainingAmount.toFixed(2)}`;
    currentCartTotal = remainingAmount;
}

// ============================================================================
// Receipt Formatting
// ============================================================================

async function formatReceiptForPrinter(transaction) {
    const storeName = transaction.storeName || await getConfigValue('STORE_NAME');
    const storeAddress = transaction.storeAddress || await getConfigValue('STORE_ADDRESS');
    const storePhone = transaction.storePhone || await getConfigValue('STORE_PHONE');
    const footer = transaction.footer || await getConfigValue('RECEIPT_FOOTER');
    const charsPerLine = await getConfigValue('PRINTER_CHARS_PER_LINE');
    let receipt = '';
    receipt += ''.padEnd(charsPerLine, '=') + '\n';
    receipt += centerText(storeName, charsPerLine) + '\n';
    receipt += centerText(storeAddress, charsPerLine) + '\n';
    receipt += centerText(storePhone, charsPerLine) + '\n';
    receipt += ''.padEnd(charsPerLine, '=') + '\n\n';
    receipt += `Receipt #: ${transaction.id}\n`;
    receipt += `Date: ${new Date(transaction.date).toLocaleString()}\n`;
    receipt += `Cashier: ${transaction.cashier || 'Admin'}\n`;
    receipt += `Payment: ${transaction.paymentMethod || 'Cash'}\n\n`;
    receipt += ''.padEnd(charsPerLine, '-') + '\n';
    transaction.items.forEach(item => {
        let description = '';
        if (item.type === 'custom') {
            description = item.note || 'Custom Item';
            if (item.bern_it) description = '🔥 ' + description + ' (BERN IT)';
        } else {
            description = `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`;
        }
        const price = (item.actual_sale_price || item.store_price || 0);
        const priceStr = `$${price.toFixed(2)}`;
        const maxDescLength = charsPerLine - priceStr.length - 1;
        let shortDesc = description;
        if (description.length > maxDescLength) shortDesc = description.substring(0, maxDescLength - 3) + '...';
        const paddingNeeded = charsPerLine - shortDesc.length - priceStr.length;
        receipt += shortDesc + ' '.repeat(paddingNeeded) + priceStr + '\n';
    });
    receipt += ''.padEnd(charsPerLine, '-') + '\n';
    const originalSubtotalStr = `$${(transaction.originalSubtotal || 0).toFixed(2)}`;
    receipt += `Original Subtotal:${' '.repeat(charsPerLine - 18 - originalSubtotalStr.length)}${originalSubtotalStr}\n`;
    if (transaction.customSalePrice) {
        const customPriceStr = `$${(transaction.customSalePrice || 0).toFixed(2)}`;
        receipt += `Custom Price:${' '.repeat(charsPerLine - 13 - customPriceStr.length)}${customPriceStr}\n`;
    } else if (transaction.discount && transaction.discount > 0) {
        const discountStr = `-$${(transaction.discount || 0).toFixed(2)}`;
        if (transaction.discountType === 'percentage') {
            receipt += `Discount (${transaction.discountAmount}%):${' '.repeat(charsPerLine - 16 - discountStr.length)}${discountStr}\n`;
        } else {
            receipt += `Discount:${' '.repeat(charsPerLine - 9 - discountStr.length)}${discountStr}\n`;
        }
    }
    const subtotalStr = `$${(transaction.subtotal || 0).toFixed(2)}`;
    receipt += `Subtotal:${' '.repeat(charsPerLine - 9 - subtotalStr.length)}${subtotalStr}\n`;
    const taxStr = `$${(transaction.tax || 0).toFixed(2)}`;
    receipt += `Tax (${transaction.taxRate || 0}%):${' '.repeat(charsPerLine - 12 - taxStr.length)}${taxStr}\n`;
    receipt += ''.padEnd(charsPerLine, '=') + '\n';
    const totalStr = `$${(transaction.total || 0).toFixed(2)}`;
    receipt += `TOTAL:${' '.repeat(charsPerLine - 6 - totalStr.length)}${totalStr}\n`;
    receipt += ''.padEnd(charsPerLine, '=') + '\n\n';
    if (transaction.bernDonation && transaction.bernDonation > 0) {
        receipt += ''.padEnd(charsPerLine, '-') + '\n';
        receipt += centerText('🔥 BERN IT DONATION 🔥', charsPerLine) + '\n';
        receipt += centerText(`$${transaction.bernDonation.toFixed(2)} added to BERN fund`, charsPerLine) + '\n';
        receipt += ''.padEnd(charsPerLine, '-') + '\n\n';
    }
    if (transaction.paymentMethod === 'Cash' && transaction.change > 0) {
        const tenderedStr = `$${(transaction.tendered || 0).toFixed(2)}`;
        receipt += `Tendered:${' '.repeat(charsPerLine - 9 - tenderedStr.length)}${tenderedStr}\n`;
        const changeStr = `$${(transaction.change || 0).toFixed(2)}`;
        receipt += `Change:${' '.repeat(charsPerLine - 7 - changeStr.length)}${changeStr}\n\n`;
    }
    if (transaction.square_payment_id) {
        receipt += `Square ID: ${transaction.square_payment_id}\n\n`;
    }
    if (transaction.isDiscogsSale) {
        receipt += centerText('🎵 DISCOGS SALE 🎵', charsPerLine) + '\n\n';
    }
    receipt += centerText(footer, charsPerLine) + '\n';
    receipt += ''.padEnd(charsPerLine, '=') + '\n';
    return receipt;
}

// ============================================================================
// Event Listeners
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'check-out') {
        const searchResults = document.getElementById('search-results');
        if (searchResults && currentSearchResults.length === 0) {
            searchResults.innerHTML = `<div style="text-align:center;padding:40px;color:#666;"><i class="fas fa-search" style="font-size:48px;color:#ccc;"></i><p>Enter a search term to find records</p></div>`;
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

console.log('✅ checkout.js loaded with edit/delete capabilities');