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
// Custom Sale Price Functions (NEW)
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

function validateConsignorCommission(item) {
    if (item.consignor_id && item.consignor_id !== 1) {
        if (!item.commission_rate && item.commission_rate !== 0) {
            throw new Error(
                `Consignor item missing commission rate: ${item.artist || 'Unknown'} - ${item.title || 'Unknown'} (ID: ${item.id})`
            );
        }
        if (isNaN(parseFloat(item.commission_rate))) {
            throw new Error(
                `Invalid commission rate for consignor item: ${item.artist || 'Unknown'} - ${item.title || 'Unknown'} (Rate: ${item.commission_rate})`
            );
        }
    }
}

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
// VCP-8370 Thermal Printer Functions
// ============================================================================

function isWebUSBSupported() {
    return navigator.usb !== undefined;
}

async function connectVCP8370() {
    try {
        if (!isWebUSBSupported()) {
            throw new Error('WebUSB not supported. Use Chrome/Edge for thermal printing.');
        }

        const vendorId = await getConfigValue('PRINTER_VENDOR_ID');
        const productId = await getConfigValue('PRINTER_PRODUCT_ID');
        
        let filters = [];
        
        if (vendorId && productId) {
            filters.push({ 
                vendorId: parseInt(vendorId, 16), 
                productId: parseInt(productId, 16) 
            });
            console.log(`Using configured vendor ID: ${vendorId}, product ID: ${productId}`);
        } else {
            filters = [
                { vendorId: 0x0416 },
                { vendorId: 0x067B },
                { vendorId: 0x1A86 },
                { vendorId: 0x10C4 },
                { vendorId: 0x0403 },
                { vendorId: 0x0557 },
            ];
        }

        console.log('Requesting USB device with filters:', filters);
        
        const device = await navigator.usb.requestDevice({ filters });
        
        console.log('Device selected:', {
            vendorId: '0x' + device.vendorId.toString(16),
            productId: '0x' + device.productId.toString(16),
            manufacturer: device.manufacturerName,
            product: device.productName
        });
        
        try {
            await device.open();
            console.log('Device opened successfully');
        } catch (openError) {
            console.error('Failed to open device:', openError);
            if (openError.message.includes('Access denied')) {
                throw new Error(
                    'Cannot access the printer due to permission issues.\n\n' +
                    'Please run the fix_printer_permissions.sh script again.'
                );
            }
            throw openError;
        }
        
        if (device.configuration === null) {
            console.log('No configuration, selecting configuration 1');
            await device.selectConfiguration(1);
        }
        
        let outEndpoint = null;
        let interfaceNumber = null;
        
        for (const iface of device.configuration.interfaces) {
            console.log(`Checking interface ${iface.interfaceNumber}`);
            
            for (const alt of iface.alternates) {
                console.log(`  Alternate setting ${alt.alternateSetting}, endpoints:`, alt.endpoints.length);
                
                for (const endpoint of alt.endpoints) {
                    console.log(`    Endpoint: address=${endpoint.endpointNumber}, direction=${endpoint.direction}, type=${endpoint.type}, packetSize=${endpoint.packetSize}`);
                    
                    if (endpoint.direction === 'out') {
                        outEndpoint = endpoint;
                        interfaceNumber = iface.interfaceNumber;
                        console.log(`✅ Found OUT endpoint: ${endpoint.endpointNumber} on interface ${interfaceNumber}`);
                        break;
                    }
                }
                if (outEndpoint) break;
            }
            if (outEndpoint) break;
        }
        
        if (!outEndpoint) {
            throw new Error('No OUT endpoint found on printer. Make sure the printer is connected and powered on.');
        }
        
        try {
            await device.claimInterface(interfaceNumber);
            console.log(`Interface ${interfaceNumber} claimed`);
        } catch (claimError) {
            console.error('Failed to claim interface:', claimError);
            if (claimError.message.includes('Unable to claim interface')) {
                throw new Error(
                    'Cannot claim printer interface - it is already in use.\n\n' +
                    'Run this command in terminal:\n' +
                    'sudo modprobe -r usblp\n\n' +
                    'Then unplug and replug the printer.'
                );
            }
            throw claimError;
        }
        
        return { device, endpointNumber: outEndpoint.endpointNumber };
        
    } catch (error) {
        console.error('Connection failed:', error);
        throw error;
    }
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
        if (!line.trim()) {
            commands.push(PrinterCommands.LF);
            continue;
        }
        
        if (line.startsWith('=') && line.length > 5) {
            commands.push(PrinterCommands.ALIGN_CENTER);
            commands.push(PrinterCommands.BOLD_ON);
            commands.push(line.substring(0, charsPerLine));
            commands.push(PrinterCommands.BOLD_OFF);
            commands.push(PrinterCommands.LF);
        } 
        else if (line.startsWith('-')) {
            commands.push(PrinterCommands.ALIGN_LEFT);
            commands.push(line.substring(0, charsPerLine));
            commands.push(PrinterCommands.LF);
        }
        else if (line.includes('TOTAL:')) {
            commands.push(PrinterCommands.ALIGN_CENTER);
            commands.push(PrinterCommands.BOLD_ON);
            commands.push(line.substring(0, charsPerLine));
            commands.push(PrinterCommands.BOLD_OFF);
            commands.push(PrinterCommands.LF);
        }
        else if (line.includes('THANK YOU') || line.includes('Thank you')) {
            commands.push(PrinterCommands.ALIGN_CENTER);
            commands.push(line.substring(0, charsPerLine));
            commands.push(PrinterCommands.LF);
            commands.push(PrinterCommands.LF);
        }
        else if (line.includes('Receipt #:') || line.includes('Date:') || line.includes('Cashier:')) {
            commands.push(PrinterCommands.ALIGN_LEFT);
            commands.push(line.substring(0, charsPerLine));
            commands.push(PrinterCommands.LF);
        }
        else {
            commands.push(PrinterCommands.ALIGN_LEFT);
            commands.push(line.substring(0, charsPerLine));
            commands.push(PrinterCommands.LF);
        }
    }
    
    commands.push(PrinterCommands.LF);
    commands.push(PrinterCommands.LF);
    
    if (cutPaper !== 'false') {
        commands.push(PrinterCommands.CUT);
    }
    
    if (openDrawer !== 'false') {
        commands.push(PrinterCommands.OPEN_DRAWER);
    }
    
    const commandString = commands.join('');
    return encoder.encode(commandString);
}

window.printToVCP8370 = async function(receiptText) {
    console.log('🖨️ Attempting to print to VCP-8370...');
    console.log('Receipt text length:', receiptText.length);
    
    try {
        const statusEl = document.getElementById('printer-status');
        if (statusEl) {
            statusEl.innerHTML = '🔌 Please select your VCP-8370 printer from the popup...';
            statusEl.style.color = '#007bff';
        }
        
        const { device, endpointNumber } = await connectVCP8370();
        
        if (statusEl) {
            statusEl.innerHTML = '✅ Connected! Sending receipt...';
            statusEl.style.color = '#28a745';
        }
        
        const escposData = await formatReceiptAsESCPOS(receiptText);
        
        console.log('ESC/POS data size:', escposData.length, 'bytes');
        
        const chunkSize = 64;
        for (let i = 0; i < escposData.length; i += chunkSize) {
            const chunk = escposData.slice(i, Math.min(i + chunkSize, escposData.length));
            await device.transferOut(endpointNumber, chunk);
            
            await new Promise(resolve => setTimeout(resolve, 20));
            
            if (statusEl && escposData.length > 256 && i % 256 === 0) {
                const percent = Math.round((i / escposData.length) * 100);
                statusEl.innerHTML = `✅ Printing... ${percent}%`;
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await device.close();
        
        if (statusEl) {
            statusEl.innerHTML = '✅ Receipt printed successfully!';
            statusEl.style.color = '#28a745';
            setTimeout(() => {
                statusEl.innerHTML = '';
            }, 3000);
        }
        
        console.log('✅ VCP-8370 printing successful');
        return true;
        
    } catch (error) {
        console.error('❌ VCP-8370 printing failed:', error);
        
        const statusEl = document.getElementById('printer-status');
        if (statusEl) {
            statusEl.innerHTML = `❌ Thermal printer error: ${error.message}`;
            statusEl.style.color = '#dc3545';
        }
        
        throw error;
    }
};

window.testVCP8370Printer = async function() {
    const storeName = await getConfigValue('STORE_NAME');
    const storeAddress = await getConfigValue('STORE_ADDRESS');
    const storePhone = await getConfigValue('STORE_PHONE');
    const charsPerLine = await getConfigValue('PRINTER_CHARS_PER_LINE');
    
    const testReceipt = 
''.padEnd(charsPerLine, '=') + '\n' +
centerText(storeName, charsPerLine) + '\n' +
centerText(storeAddress, charsPerLine) + '\n' +
centerText(storePhone, charsPerLine) + '\n' +
''.padEnd(charsPerLine, '=') + '\n' +
'\n' +
`Receipt #: TEST-${Date.now()}\n` +
`Date: ${new Date().toLocaleString()}\n` +
`Cashier: Test User\n` +
`Payment: TEST\n` +
'\n' +
''.padEnd(charsPerLine, '-') + '\n' +
'TEST ITEM 1' + ' '.repeat(charsPerLine - 11 - 6) + '$10.00\n' +
'TEST ITEM 2' + ' '.repeat(charsPerLine - 11 - 6) + '$15.00\n' +
''.padEnd(charsPerLine, '-') + '\n' +
'Subtotal:' + ' '.repeat(charsPerLine - 9 - 6) + '$25.00\n' +
'Tax:' + ' '.repeat(charsPerLine - 4 - 6) + '$1.88\n' +
''.padEnd(charsPerLine, '=') + '\n' +
'TOTAL:' + ' '.repeat(charsPerLine - 6 - 6) + '$26.88\n' +
''.padEnd(charsPerLine, '=') + '\n' +
'\n' +
centerText('Thank you for testing!', charsPerLine) + '\n' +
''.padEnd(charsPerLine, '=') + '\n';
    
    showCheckoutStatus('Testing VCP-8370 printer...', 'info');
    try {
        const thermalSuccess = await printToVCP8370(testReceipt);
        showCheckoutStatus('Test receipt sent to VCP-8370 printer!', 'success');
    } catch (error) {
        showCheckoutStatus(`Thermal printer failed: ${error.message}`, 'error');
    }
};

window.printToThermalPrinter = async function(receiptText) {
    console.log('printToThermalPrinter called with text length:', receiptText.length);
    
    try {
        console.log('Attempting to print to VCP-8370...');
        const success = await printToVCP8370(receiptText);
        console.log('✅ Successfully printed to VCP-8370');
        return true;
    } catch (error) {
        console.log('⚠️ VCP-8370 failed:', error.message);
        showPrintableReceipt(receiptText);
        throw error;
    }
};

function showPrintableReceipt(receiptText) {
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
// Discogs Sell Button Function (No confirmation popup, No receipt printing)
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
            
            // Save receipt to database (for record keeping)
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
// Square Payment Functions (condensed - same as before)
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
    
    if (availableTerminals.length === 1) {
        const onlineTerminals = availableTerminals.filter(t => t.status === 'ONLINE');
        if (onlineTerminals.length === 0) {
            showCheckoutStatus('No online terminals available. Please check terminal connection.', 'error');
            return;
        }
        
        let singleTerminalId = availableTerminals[0].id;
        if (singleTerminalId && singleTerminalId.startsWith('device:')) {
            singleTerminalId = singleTerminalId.replace('device:', '');
        }
        selectedTerminalId = singleTerminalId;
        
        pendingCartCheckout = {
            items: [...checkoutCart],
            type: 'cart',
            discount: { ...currentDiscount },
            customSalePrice: currentCustomSalePrice
        };
        
        initiateCartTerminalCheckout();
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
        discount: { ...currentDiscount },
        customSalePrice: currentCustomSalePrice
    };
    
    renderTerminalSelectionModal();
};

// Keep all existing Square payment functions (they remain the same)
// ... (Square payment functions continue here)

// ============================================================================
// Cash Payment Functions (with custom sale price support)
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
                    validateConsignorCommission(item);
                    
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
            
            const receiptText = await formatReceiptForPrinter(transaction);
            await window.printToThermalPrinter(receiptText);
            
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
// Receipt Formatting (updated with custom sale price)
// ============================================================================

async function formatReceiptForPrinter(transaction) {
    const storeName = transaction.storeName || await getConfigValue('STORE_NAME');
    const storeAddress = transaction.storeAddress || await getConfigValue('STORE_ADDRESS');
    const storePhone = transaction.storePhone || await getConfigValue('STORE_PHONE');
    const footer = transaction.footer || await getConfigValue('RECEIPT_FOOTER');
    const charsPerLine = await getConfigValue('PRINTER_CHARS_PER_LINE');
    
    let receipt = '';
    
    receipt += ''.padEnd(charsPerLine, '=') + '\n';
    
    const nameLine = centerText(storeName, charsPerLine);
    receipt += nameLine + '\n';
    
    const addressLine = centerText(storeAddress, charsPerLine);
    receipt += addressLine + '\n';
    
    const phoneLine = centerText(storePhone, charsPerLine);
    receipt += phoneLine + '\n';
    
    receipt += ''.padEnd(charsPerLine, '=') + '\n';
    receipt += '\n';
    
    receipt += `Receipt #: ${transaction.id}\n`;
    receipt += `Date: ${new Date(transaction.date).toLocaleString()}\n`;
    receipt += `Cashier: ${transaction.cashier || 'Admin'}\n`;
    receipt += `Payment: ${transaction.paymentMethod || 'Cash'}\n`;
    receipt += '\n';
    
    receipt += ''.padEnd(charsPerLine, '-') + '\n';
    
    transaction.items.forEach(item => {
        let description = '';
        if (item.type === 'custom') {
            description = item.note || 'Custom Item';
            if (item.bern_it) {
                description = '🔥 ' + description + ' (BERN IT)';
            }
        } else {
            description = `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`;
        }
        
        const price = (item.actual_sale_price || item.store_price || 0);
        const priceStr = `$${price.toFixed(2)}`;
        
        const maxDescLength = charsPerLine - priceStr.length - 1;
        let shortDesc = description;
        if (description.length > maxDescLength) {
            shortDesc = description.substring(0, maxDescLength - 3) + '...';
        }
        
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
    receipt += ''.padEnd(charsPerLine, '=') + '\n';
    receipt += '\n';
    
    if (transaction.bernDonation && transaction.bernDonation > 0) {
        receipt += ''.padEnd(charsPerLine, '-') + '\n';
        receipt += centerText('🔥 BERN IT DONATION 🔥', charsPerLine) + '\n';
        receipt += centerText(`$${transaction.bernDonation.toFixed(2)} added to BERN fund`, charsPerLine) + '\n';
        receipt += ''.padEnd(charsPerLine, '-') + '\n';
        receipt += '\n';
    }
    
    if (transaction.paymentMethod === 'Cash' && transaction.change > 0) {
        const tenderedStr = `$${(transaction.tendered || 0).toFixed(2)}`;
        receipt += `Tendered:${' '.repeat(charsPerLine - 9 - tenderedStr.length)}${tenderedStr}\n`;
        
        const changeStr = `$${(transaction.change || 0).toFixed(2)}`;
        receipt += `Change:${' '.repeat(charsPerLine - 7 - changeStr.length)}${changeStr}\n`;
        receipt += '\n';
    }
    
    if (transaction.isDiscogsSale) {
        receipt += centerText('🎵 DISCOGS SALE 🎵', charsPerLine) + '\n';
        receipt += '\n';
    }
    
    receipt += centerText(footer, charsPerLine) + '\n';
    receipt += ''.padEnd(charsPerLine, '=') + '\n';
    
    return receipt;
}

// ============================================================================
// Gift Card Payment Functions (condensed)
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
            
            const receiptText = await formatReceiptForPrinter(transaction);
            await window.printToThermalPrinter(receiptText);
            
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

console.log('✅ checkout.js loaded with VCP-8370 printer support, custom sale price, and Discogs sell button (no confirmation popup)');