// Store Settings page
(function() {
    const API_BASE = 'http://localhost:5000';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Store settings keys and their defaults
    const STORE_KEYS = [
        { key: 'STORE_NAME', default: 'PigStyle Music', description: 'Store name displayed on receipts' },
        { key: 'STORE_ADDRESS', default: '100 E 3rd St, Loveland, CO 80537', description: 'Store address displayed on receipts' },
        { key: 'STORE_PHONE', default: '(970) 492-5630', description: 'Store phone number displayed on receipts' },
        { key: 'RECEIPT_FOOTER', default: 'Thank you for shopping at PigStyle Music!', description: 'Footer message on receipts' },
        { key: 'TAX_RATE', default: 7.5, description: 'Sales tax rate percentage (e.g., 7.5 for 7.5%)' },
        { key: 'TAX_ENABLED', default: 'true', description: 'Enable tax calculation (true/false)' },
        { key: 'STORE_CAPACITY', default: 10000, description: 'Maximum number of records the store can hold' },
        { key: 'MIN_STORE_PRICE', default: 1.99, description: 'Minimum price allowed for store items' }
    ];

    // Load store settings
    async function loadStoreSettings() {
        const body = document.getElementById('ss-body');
        if (!body) return;
        
        body.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #888;">Loading...</td></tr>';
        
        try {
            const configs = {};
            for (const item of STORE_KEYS) {
                try {
                    const response = await fetch(`${API_BASE}/config/${item.key}`, {
                        credentials: 'include',
                        headers: getHeaders()
                    });
                    if (response.ok) {
                        const data = await response.json();
                        configs[item.key] = data.config_value;
                    } else {
                        configs[item.key] = item.default;
                    }
                } catch (e) {
                    configs[item.key] = item.default;
                }
            }
            
            renderStoreSettings(configs);
        } catch (err) {
            console.error('Error loading store settings:', err);
            body.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</td></tr>`;
        }
    }

    // Render store settings
    function renderStoreSettings(configs) {
        const body = document.getElementById('ss-body');
        if (!body) return;
        
        let html = '';
        STORE_KEYS.forEach(item => {
            const value = configs[item.key] !== undefined ? configs[item.key] : item.default;
            const isBoolean = item.key === 'TAX_ENABLED';
            const isText = ['STORE_NAME', 'STORE_ADDRESS', 'RECEIPT_FOOTER'].includes(item.key);
            
            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">
                    <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${item.key}</code>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">
                    ${isBoolean ? `
                        <select id="ss-${item.key}" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <option value="true" ${value === 'true' ? 'selected' : ''}>Enabled</option>
                            <option value="false" ${value === 'false' ? 'selected' : ''}>Disabled</option>
                        </select>
                    ` : isText ? `
                        <input type="text" id="ss-${item.key}" value="${value}" style="width: 100%; min-width: 200px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;">
                    ` : `
                        <input type="number" id="ss-${item.key}" value="${value}" step="0.01" min="0" style="width: 120px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;">
                    `}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${item.description}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="ssSave('${item.key}')" style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-save"></i> Save
                    </button>
                </td>
            </tr>`;
        });
        
        body.innerHTML = html;
    }

    // Save a single setting
    window.ssSave = async function(key) {
        const input = document.getElementById(`ss-${key}`);
        if (!input) return;
        
        const value = input.value.trim();
        const button = input.closest('tr').querySelector('button');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        button.disabled = true;
        
        try {
            const response = await fetch(`${API_BASE}/config/${key}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ config_value: value })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                showStatus(`✅ ${key} saved successfully`, 'success');
                button.innerHTML = '✅';
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.disabled = false;
                }, 1500);
            } else {
                throw new Error(data.error || 'Failed to save');
            }
        } catch (err) {
            console.error('Error saving setting:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
            button.innerHTML = originalText;
            button.disabled = false;
        }
    };

    // Refresh
    window.ssRefresh = function() {
        loadStoreSettings();
        showStatus('✅ Settings refreshed', 'success');
    };

    // Reset to defaults
    window.ssResetDefaults = async function() {
        if (!confirm('Reset all store settings to default values?')) return;
        
        const body = document.getElementById('ss-body');
        body.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #888;">Resetting...</td></tr>';
        
        try {
            for (const item of STORE_KEYS) {
                await fetch(`${API_BASE}/config/${item.key}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: getHeaders(),
                    body: JSON.stringify({ config_value: String(item.default) })
                });
            }
            
            showStatus('✅ All store settings reset to defaults', 'success');
            loadStoreSettings();
        } catch (err) {
            console.error('Error resetting settings:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
            loadStoreSettings();
        }
    };

    // Show status
    function showStatus(message, type) {
        const statusDiv = document.getElementById('ss-status');
        if (!statusDiv) return;
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        const colors = {
            success: '#d4edda',
            error: '#f8d7da',
            warning: '#fff3cd',
            info: '#cce5ff'
        };
        const textColors = {
            success: '#155724',
            error: '#721c24',
            warning: '#856404',
            info: '#004085'
        };
        statusDiv.style.background = colors[type] || '#f8f9fa';
        statusDiv.style.color = textColors[type] || '#333';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
    }

    // Init
    window.initStoreSettings = function() {
        console.log('Store Settings initialized');
        loadStoreSettings();
    };
})();
