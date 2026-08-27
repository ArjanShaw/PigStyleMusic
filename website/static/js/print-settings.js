// Print Settings page
(function() {
    const API_BASE = 'http://localhost:5000';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Print settings keys and their defaults
    const PRINT_KEYS = [
        { key: 'LABEL_WIDTH_MM', default: 63.5, description: 'Width of each price tag label in millimeters' },
        { key: 'LABEL_HEIGHT_MM', default: 33.9, description: 'Height of each price tag label in millimeters' },
        { key: 'LEFT_MARGIN_MM', default: 11.1, description: 'Left margin from page edge to first label (mm)' },
        { key: 'GUTTER_SPACING_MM', default: 3.2, description: 'Space between labels horizontally (mm)' },
        { key: 'TOP_MARGIN_MM', default: 12.7, description: 'Top margin from page edge to first label (mm)' },
        { key: 'PRICE_FONT_SIZE', default: 12, description: 'Font size for price text (points)' },
        { key: 'TEXT_FONT_SIZE', default: 8, description: 'Font size for artist/genre/consignor text (points)' },
        { key: 'ARTIST_LABEL_FONT_SIZE', default: 10, description: 'Font size for artist labels (points)' },
        { key: 'BARCODE_HEIGHT', default: 25, description: 'Height of barcode in millimeters' },
        { key: 'PRINT_BORDERS', default: 'false', description: 'Print borders around labels (true/false)' },
        { key: 'PRICE_Y_POS', default: 16, description: 'Vertical position of price from top of label (mm)' },
        { key: 'BARCODE_Y_POS', default: 10, description: 'Vertical position of barcode from top of label (mm)' },
        { key: 'INFO_Y_POS', default: 22, description: 'Vertical position of info text from top of label (mm)' }
    ];

    // Load print settings
    async function loadPrintSettings() {
        const body = document.getElementById('ps-body');
        if (!body) return;
        
        body.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #888;">Loading...</td></tr>';
        
        try {
            const configs = {};
            for (const item of PRINT_KEYS) {
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
            
            renderPrintSettings(configs);
        } catch (err) {
            console.error('Error loading print settings:', err);
            body.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</td></tr>`;
        }
    }

    // Render print settings
    function renderPrintSettings(configs) {
        const body = document.getElementById('ps-body');
        if (!body) return;
        
        let html = '';
        PRINT_KEYS.forEach(item => {
            const value = configs[item.key] !== undefined ? configs[item.key] : item.default;
            const isBoolean = item.key === 'PRINT_BORDERS';
            
            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">
                    <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${item.key}</code>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">
                    ${isBoolean ? `
                        <select id="ps-${item.key}" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <option value="true" ${value === 'true' ? 'selected' : ''}>True</option>
                            <option value="false" ${value === 'false' ? 'selected' : ''}>False</option>
                        </select>
                    ` : `
                        <input type="number" id="ps-${item.key}" value="${value}" step="0.1" min="0" style="width: 100px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;">
                    `}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${item.description}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="psSave('${item.key}')" style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-save"></i> Save
                    </button>
                </td>
            </tr>`;
        });
        
        body.innerHTML = html;
    }

    // Save a single setting
    window.psSave = async function(key) {
        const input = document.getElementById(`ps-${key}`);
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
    window.psRefresh = function() {
        loadPrintSettings();
        showStatus('✅ Settings refreshed', 'success');
    };

    // Reset to defaults
    window.psResetDefaults = async function() {
        if (!confirm('Reset all print settings to default values?')) return;
        
        const body = document.getElementById('ps-body');
        body.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #888;">Resetting...</td></tr>';
        
        try {
            for (const item of PRINT_KEYS) {
                await fetch(`${API_BASE}/config/${item.key}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: getHeaders(),
                    body: JSON.stringify({ config_value: String(item.default) })
                });
            }
            
            showStatus('✅ All print settings reset to defaults', 'success');
            loadPrintSettings();
        } catch (err) {
            console.error('Error resetting settings:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
            loadPrintSettings();
        }
    };

    // Show status
    function showStatus(message, type) {
        const statusDiv = document.getElementById('ps-status');
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
    window.initPrintSettings = function() {
        console.log('Print Settings initialized');
        loadPrintSettings();
    };
})();
