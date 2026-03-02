// ============================================================================
// config-manager.js - Configuration Management (UPDATED - NO fetchAllConfigValues)
// ============================================================================

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetches all config keys needed for the admin config tables
 * @returns {Promise<Object>} Object with all config values
 */
async function fetchConfigsForTables() {
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
    
    const generalKeys = [
        'TAX_RATE',
        'TAX_ENABLED',
        'STORE_NAME',
        'STORE_ADDRESS',
        'STORE_PHONE',
        'RECEIPT_FOOTER',
        'STORE_CAPACITY',
        'MIN_STORE_PRICE'
    ];
    
    const allKeys = [...new Set([...printKeys, ...generalKeys])];
    
    // Try batch fetch first if available
    if (typeof getConfigValues === 'function') {
        try {
            const configs = await getConfigValues(allKeys);
            return configs;
        } catch (error) {
            console.warn('Batch config fetch failed, falling back to individual fetches:', error);
        }
    }
    
    // Fall back to individual fetches
    const configs = {};
    for (const key of allKeys) {
        try {
            if (typeof getConfigValue === 'function') {
                configs[key] = await getConfigValue(key);
            }
        } catch (error) {
            console.warn(`Could not load config ${key}:`, error.message);
            configs[key] = ''; // Empty string for missing configs
        }
    }
    
    return configs;
}

// ============================================================================
// Load Config Tables
// ============================================================================

/**
 * Load both config tables (print settings and general settings)
 */
async function loadConfigTables() {
    const printConfigBody = document.getElementById('print-config-body');
    const generalConfigBody = document.getElementById('general-config-body');
    
    if (!printConfigBody || !generalConfigBody) {
        console.error('Config table bodies not found');
        return;
    }
    
    // Show loading states
    printConfigBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading print settings...</td></tr>';
    generalConfigBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading general settings...</td></tr>';
    
    try {
        const configs = await fetchConfigsForTables();
        
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
        
        const generalKeys = [
            'TAX_RATE',
            'TAX_ENABLED',
            'STORE_NAME',
            'STORE_ADDRESS',
            'STORE_PHONE',
            'RECEIPT_FOOTER',
            'STORE_CAPACITY',
            'MIN_STORE_PRICE'
        ];
        
        let printHtml = '';
        let generalHtml = '';
        
        // Build print settings table
        for (const key of printKeys) {
            const value = configs[key] !== undefined ? configs[key] : '';
            const description = getDescriptionForKey(key);
            
            printHtml += buildConfigRow(key, value, description);
        }
        
        // Build general settings table
        for (const key of generalKeys) {
            const value = configs[key] !== undefined ? configs[key] : '';
            const description = getDescriptionForKey(key);
            
            generalHtml += buildConfigRow(key, value, description);
        }
        
        printConfigBody.innerHTML = printHtml || '<tr><td colspan="4" style="text-align:center; padding:20px;">No print settings found</td></tr>';
        generalConfigBody.innerHTML = generalHtml || '<tr><td colspan="4" style="text-align:center; padding:20px;">No general settings found</td></tr>';
        
        updateUIFromConfig(configs);
        
    } catch (error) {
        console.error('Error loading config tables:', error);
        printConfigBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#dc3545;">
            <i class="fas fa-exclamation-triangle"></i> Error loading config: ${error.message}
        </td></tr>`;
        generalConfigBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#dc3545;">
            <i class="fas fa-exclamation-triangle"></i> Error loading config: ${error.message}
        </td></tr>`;
    }
}

/**
 * Get a user-friendly description for a config key
 * @param {string} key - The config key
 * @returns {string} Description
 */
function getDescriptionForKey(key) {
    const descriptions = {
        // Print settings
        'LABEL_WIDTH_MM': 'Width of each price tag label in millimeters',
        'LABEL_HEIGHT_MM': 'Height of each price tag label in millimeters',
        'LEFT_MARGIN_MM': 'Left margin from page edge to first label (mm)',
        'GUTTER_SPACING_MM': 'Space between labels horizontally (mm)',
        'TOP_MARGIN_MM': 'Top margin from page edge to first label (mm)',
        'PRICE_FONT_SIZE': 'Font size for price text (points)',
        'TEXT_FONT_SIZE': 'Font size for artist/genre/consignor text (points)',
        'ARTIST_LABEL_FONT_SIZE': 'Font size for artist labels (points)',
        'BARCODE_HEIGHT': 'Height of barcode in millimeters',
        'PRINT_BORDERS': 'Print borders around labels (true/false)',
        'PRICE_Y_POS': 'Vertical position of price from top of label (mm)',
        'BARCODE_Y_POS': 'Vertical position of barcode from top of label (mm)',
        'INFO_Y_POS': 'Vertical position of info text from top of label (mm)',
        
        // General settings
        'TAX_RATE': 'Sales tax rate percentage (e.g., 7.5 for 7.5%)',
        'TAX_ENABLED': 'Enable tax calculation (true/false)',
        'STORE_NAME': 'Store name displayed on receipts',
        'STORE_ADDRESS': 'Store address displayed on receipts',
        'STORE_PHONE': 'Store phone number displayed on receipts',
        'RECEIPT_FOOTER': 'Footer message on receipts',
        'STORE_CAPACITY': 'Maximum number of records the store can hold',
        'MIN_STORE_PRICE': 'Minimum price allowed for store items'
    };
    
    return descriptions[key] || '';
}

/**
 * Build a table row for a config value
 * @param {string} key - Config key
 * @param {string} value - Config value
 * @param {string} description - Config description
 * @returns {string} HTML row
 */
function buildConfigRow(key, value, description) {
    const escapedKey = key.replace(/\./g, '-');
    const displayValue = value !== undefined && value !== null ? value : '';
    
    return `
        <tr id="config-row-${escapedKey}">
            <td><code>${key}</code></td>
            <td>
                <input type="text" class="config-value-input" data-key="${key}" value="${escapeHtml(displayValue)}" style="width: 100%; padding: 5px;">
            </td>
            <td>${escapeHtml(description)}</td>
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
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Config Value Operations
// ============================================================================

/**
 * Save a specific config value
 * @param {string} key - Config key to save
 */
async function saveConfigValue(key) {
    const input = document.querySelector(`.config-value-input[data-key="${key}"]`);
    if (!input) {
        showConfigMessage(`Input for key "${key}" not found`, 'error');
        return;
    }
    
    const newValue = input.value.trim();
    const button = input.closest('tr')?.querySelector('button.btn-success');
    
    if (!button) {
        showConfigMessage('Save button not found', 'error');
        return;
    }
    
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Saving...';
    button.disabled = true;
    
    try {
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
            // Clear the cache for this key in config-value-manager
            if (typeof clearConfigCache === 'function') {
                clearConfigCache(key);
            }
            
            button.innerHTML = '<i class="fas fa-check"></i> Saved!';
            setTimeout(() => {
                button.innerHTML = originalText;
                button.disabled = false;
            }, 2000);
            
            showConfigMessage(`Configuration "${key}" updated successfully`, 'success');
        } else {
            throw new Error(data.error || `Failed to update configuration key '${key}'`);
        }
    } catch (error) {
        console.error(`Error saving config ${key}:`, error);
        button.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
        
        showConfigMessage(`Error saving config: ${error.message}`, 'error');
    }
}

/**
 * Delete a config value
 * @param {string} key - Config key to delete
 */
async function deleteConfigValue(key) {
    if (!confirm(`Are you sure you want to delete '${key}'? This action cannot be undone.`)) {
        return false;
    }
    
    const button = event?.target?.closest('button');
    const originalText = button ? button.innerHTML : 'Delete';
    
    if (button) {
        button.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Deleting...';
        button.disabled = true;
    }
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/config/${key}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            // Clear the cache for this key in config-value-manager
            if (typeof clearConfigCache === 'function') {
                clearConfigCache(key);
            }
            
            // Remove the row from the table
            const rowId = `config-row-${key.replace(/\./g, '-')}`;
            const row = document.getElementById(rowId);
            if (row) {
                row.remove();
            }
            
            showConfigMessage(`Configuration "${key}" deleted successfully`, 'success');
            return true;
        } else {
            throw new Error(data.error || `Failed to delete configuration key '${key}'`);
        }
    } catch (error) {
        console.error(`Error deleting config ${key}:`, error);
        showConfigMessage(`Error deleting config: ${error.message}`, 'error');
        return false;
    } finally {
        if (button) {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }
}

/**
 * Add a new config value
 */
async function addNewConfig() {
    const keyInput = document.getElementById('new-config-key');
    const valueInput = document.getElementById('new-config-value');
    const descInput = document.getElementById('new-config-description');
    const addButton = document.querySelector('#admin-config-tab .btn-success[onclick="addNewConfig()"]');
    
    const key = keyInput?.value.trim();
    const value = valueInput?.value.trim();
    const description = descInput?.value.trim() || '';
    
    if (!key || !value) {
        alert('Key and Value are required');
        return;
    }
    
    // Check if key already exists (we'll let the server validate)
    
    const originalText = addButton ? addButton.innerHTML : 'Add';
    if (addButton) {
        addButton.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Adding...';
        addButton.disabled = true;
    }
    
    try {
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
            // Clear form
            if (keyInput) keyInput.value = '';
            if (valueInput) valueInput.value = '';
            if (descInput) descInput.value = '';
            
            // Clear cache for this key
            if (typeof clearConfigCache === 'function') {
                clearConfigCache(key);
            }
            
            // Reload the config tables to show the new config
            await loadConfigTables();
            
            showConfigMessage(`Configuration "${key}" added successfully`, 'success');
        } else {
            throw new Error(data.error || `Failed to add configuration key '${key}'`);
        }
    } catch (error) {
        console.error(`Error adding config ${key}:`, error);
        showConfigMessage(`Error adding config: ${error.message}`, 'error');
    } finally {
        if (addButton) {
            addButton.innerHTML = originalText;
            addButton.disabled = false;
        }
    }
}

// ============================================================================
// UI Update Functions
// ============================================================================

/**
 * Update UI elements that depend on config values
 * @param {Object} configs - Optional config object to use (otherwise fetches fresh)
 */
async function updateUIFromConfig(configs = null) {
    try {
        let taxRate = 7.5; // Default
        let storeName = 'PigStyle Music';
        
        if (configs) {
            // Use provided configs
            if (configs['TAX_RATE'] !== undefined) taxRate = parseFloat(configs['TAX_RATE']) || 7.5;
            if (configs['STORE_NAME'] !== undefined) storeName = configs['STORE_NAME'];
        } else {
            // Fetch individual configs as needed
            try {
                if (typeof getConfigValue === 'function') {
                    const fetchedTaxRate = await getConfigValue('TAX_RATE');
                    taxRate = parseFloat(fetchedTaxRate) || 7.5;
                    
                    const fetchedStoreName = await getConfigValue('STORE_NAME');
                    storeName = fetchedStoreName || 'PigStyle Music';
                }
            } catch (error) {
                console.warn('Could not fetch configs for UI update:', error);
            }
        }
        
        // Update tax rate display in checkout tab
        const taxRateDisplay = document.getElementById('tax-rate-display');
        if (taxRateDisplay) {
            taxRateDisplay.textContent = taxRate.toFixed(1);
        }
        
        // Update any other UI elements that depend on configs
        
    } catch (error) {
        console.error('Error updating UI from config:', error);
    }
}

// ============================================================================
// Message Display
// ============================================================================

/**
 * Show a status message
 * @param {string} message - Message to display
 * @param {string} type - Message type (success, error, info, warning)
 */
function showConfigMessage(message, type = 'info') {
    // Try to use existing status message elements
    const statusEl = document.getElementById('config-status-message') || 
                     document.getElementById('checkout-status-message') ||
                     document.getElementById('status-message');
    
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-message status-${type}`;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
        return;
    }
    
    // Fallback to alert for errors
    if (type === 'error') {
        alert(`Error: ${message}`);
    } else if (type === 'success') {
        console.log(`✅ ${message}`);
    }
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Clear config cache for a specific key or all keys
 * @param {string} key - Optional specific key to clear
 */
function clearConfigCache(key = null) {
    if (typeof window.clearConfigCache === 'function') {
        window.clearConfigCache(key);
    } else if (typeof window.configCache !== 'undefined') {
        if (key) {
            delete window.configCache[key];
        } else {
            window.configCache = {};
        }
    }
}

// ============================================================================
// Export functions for use in HTML
// ============================================================================

// Make functions globally available
window.loadConfigTables = loadConfigTables;
window.saveConfigValue = saveConfigValue;
window.deleteConfigValue = deleteConfigValue;
window.addNewConfig = addNewConfig;
window.clearConfigCache = clearConfigCache;
window.updateUIFromConfig = updateUIFromConfig;

console.log('✅ config-manager.js loaded (updated - no fetchAllConfigValues)');