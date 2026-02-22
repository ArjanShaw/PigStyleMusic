// ============================================================================
// config-manager.js - Configuration Management
// ============================================================================

// Fetch all config values from database
async function fetchAllConfigValues() {
    const response = await fetch(`${AppConfig.baseUrl}/config`);
    const data = await response.json();
    
    if (data.status === 'success') {
        dbConfigValues = data.configs || {};
        return dbConfigValues;
    } else {
        throw new Error('Failed to fetch configuration from database');
    }
}

// Get a specific config value
function getConfigValue(key) {
    if (!dbConfigValues[key]) {
        throw new Error(`Configuration key '${key}' not found in database`);
    }
    const value = dbConfigValues[key].value;
    
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value) && value !== '') return parseFloat(value);
    return value;
}

// Update a config value in database
async function updateConfigValue(key, newValue) {
    const response = await fetch(`${AppConfig.baseUrl}/config/${key}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            config_value: String(newValue)
        })
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
        if (!dbConfigValues[key]) {
            dbConfigValues[key] = {
                value: String(newValue),
                description: ''
            };
        } else {
            dbConfigValues[key].value = String(newValue);
        }
        return true;
    } else {
        throw new Error(`Failed to update configuration key '${key}'`);
    }
}

// Delete a config value
async function deleteConfigValue(key) {
    if (!confirm(`Are you sure you want to delete '${key}'? This action cannot be undone.`)) {
        return false;
    }
    
    const response = await fetch(`${AppConfig.baseUrl}/config/${key}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        }
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
        delete dbConfigValues[key];
        return true;
    } else {
        throw new Error(`Failed to delete configuration key '${key}'`);
    }
}

// Add a new config value
async function addConfigValue(key, value, description) {
    const response = await fetch(`${AppConfig.baseUrl}/config`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            config_key: key,
            config_value: String(value),
            description: description
        })
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
        dbConfigValues[key] = {
            value: String(value),
            description: description || ''
        };
        return true;
    } else {
        throw new Error(`Failed to add configuration key '${key}'`);
    }
}

// Load both config tables
async function loadConfigTables() {
    await fetchAllConfigValues();
    
    const printKeys = [
        'LABEL_WIDTH_MM',
        'LABEL_HEIGHT_MM',
        'LEFT_MARGIN_MM',
        'GUTTER_SPACING_MM',
        'TOP_MARGIN_MM',
        'PRICE_FONT_SIZE',
        'TEXT_FONT_SIZE',
        'ARTIST_LABEL_FONT_SIZE',
        'BARCODE_HEIGHT',
        'PRINT_BORDERS',
        'PRICE_Y_POS',
        'BARCODE_Y_POS',
        'INFO_Y_POS'
    ];
    
    const printConfigBody = document.getElementById('print-config-body');
    const generalConfigBody = document.getElementById('general-config-body');
    
    let printHtml = '';
    let generalHtml = '';
    
    const sortedKeys = Object.keys(dbConfigValues).sort();
    
    for (const key of sortedKeys) {
        const config = dbConfigValues[key];
        const value = config.value;
        const description = config.description || '';
        
        const rowHtml = `
            <tr id="config-row-${key.replace(/\./g, '-')}">
                <td><code>${key}</code></td>
                <td>
                    <input type="text" class="config-value-input" data-key="${key}" value="${value}" style="width: 100%; padding: 5px;">
                </td>
                <td>${description}</td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="saveConfigValue('${key}')">
                        <i class="fas fa-save"></i> Save
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteConfigValue('${key}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `;
        
        if (printKeys.includes(key)) {
            printHtml += rowHtml;
        } else {
            generalHtml += rowHtml;
        }
    }
    
    printConfigBody.innerHTML = printHtml || '<tr><td colspan="4" style="text-align:center; padding:20px;">No print settings found</td></tr>';
    generalConfigBody.innerHTML = generalHtml || '<tr><td colspan="4" style="text-align:center; padding:20px;">No general settings found</td></tr>';
    
    updateUIFromConfig();
}

// Add new configuration
async function addNewConfig() {
    const key = document.getElementById('new-config-key').value.trim();
    const value = document.getElementById('new-config-value').value.trim();
    const description = document.getElementById('new-config-description').value.trim();
    
    if (!key || !value) {
        alert('Key and Value are required');
        return;
    }
    
    if (dbConfigValues[key]) {
        alert(`Configuration key '${key}' already exists`);
        return;
    }
    
    const button = event.target;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Adding...';
    button.disabled = true;
    
    try {
        await addConfigValue(key, value, description);
        
        document.getElementById('new-config-key').value = '';
        document.getElementById('new-config-value').value = '';
        document.getElementById('new-config-description').value = '';
        
        await loadConfigTables();
        
        button.innerHTML = '<i class="fas fa-check"></i> Added!';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
        
    } catch (error) {
        button.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
        alert(`Error: ${error.message}`);
    }
}

// Save a specific config value
async function saveConfigValue(key) {
    const input = document.querySelector(`.config-value-input[data-key="${key}"]`);
    const newValue = input.value.trim();
    
    const button = input.closest('tr').querySelector('button.btn-success');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Saving...';
    button.disabled = true;
    
    try {
        await updateConfigValue(key, newValue);
        
        button.innerHTML = '<i class="fas fa-check"></i> Saved!';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
        
        updateUIFromConfig();
        
    } catch (error) {
        button.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
        throw error;
    }
}

// Update UI elements that depend on config values
function updateUIFromConfig() {
    try {
        const taxRate = getConfigValue('TAX_RATE');
        document.getElementById('tax-rate-display').textContent = taxRate;
        
        document.getElementById('commission-rate-display').textContent = 'Per Record';
        document.getElementById('admin-commission-display').textContent = 'Per Record';
        document.getElementById('consignor-commission-display').textContent = 'Per Record';
        
    } catch (error) {
        console.error('Error updating UI from config:', error);
    }
}

// Get admin config values for backward compatibility
function getAdminConfig() {
    let taxRate = 0;
    let taxEnabled = false;
    let commissionRate = 10;
    
    try {
        taxRate = getConfigValue('TAX_RATE');
    } catch (e) {
        console.log('TAX_RATE not found, using default');
    }
    
    try {
        taxEnabled = getConfigValue('TAX_ENABLED');
    } catch (e) {
        console.log('TAX_ENABLED not found, using default false');
    }
    
    try {
        commissionRate = getConfigValue('COMMISSION_RATE');
    } catch (e) {
        console.log('COMMISSION_RATE not found, using default 10');
    }
    
    return {
        taxRate: taxRate,
        taxEnabled: taxEnabled,
        commissionRate: commissionRate,
        storeName: (dbConfigValues['STORE_NAME'] && dbConfigValues['STORE_NAME'].value) || 'PigStyle Music',
        storeAddress: (dbConfigValues['STORE_ADDRESS'] && dbConfigValues['STORE_ADDRESS'].value) || '',
        storePhone: (dbConfigValues['STORE_PHONE'] && dbConfigValues['STORE_PHONE'].value) || '',
        receiptFooter: (dbConfigValues['RECEIPT_FOOTER'] && dbConfigValues['RECEIPT_FOOTER'].value) || 'Thank you for your purchase!',
        autoPrintReceipt: (dbConfigValues['AUTO_PRINT_RECEIPT'] && dbConfigValues['AUTO_PRINT_RECEIPT'].value) || false
    };
}