// Print Settings page
(function() {
    const API_BASE = 'http://localhost:5000';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // ===== FETCH SINGLE CONFIG VALUE =====
    async function fetchConfigValue(key) {
        try {
            const response = await fetch(`${API_BASE}/config/${key}`, {
                credentials: 'include',
                headers: getHeaders()
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.status !== 'success' || data.config_value === undefined || data.config_value === null) {
                throw new Error(`Config key "${key}" not found in database`);
            }
            return data.config_value;
        } catch (error) {
            throw new Error(`Failed to load config "${key}": ${error.message}`);
        }
    }

    // ===== SAVE SINGLE CONFIG VALUE =====
    async function saveConfigValue(key, value) {
        try {
            const response = await fetch(`${API_BASE}/config/${key}`, {
                method: 'PUT',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ config_value: String(value) })
            });
            const data = await response.json();
            if (data.status !== 'success') {
                throw new Error(data.error || 'Save failed');
            }
            return true;
        } catch (error) {
            throw new Error(`Failed to save config "${key}": ${error.message}`);
        }
    }

    // ===== LOAD PRINT SETTINGS =====
    // Each config key is fetched individually when the table is rendered.
    // The keys are defined here ONLY because the admin UI needs to display
    // a fixed set of config values in a table. This is NOT a list of defaults.
    const PRINT_KEYS = [
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

    async function loadPrintSettings() {
        const body = document.getElementById('ps-body');
        if (!body) return;
        
        body.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #888;">Loading...</td></tr>';
        
        try {
            // Fetch each config individually
            const configs = {};
            for (const key of PRINT_KEYS) {
                try {
                    configs[key] = await fetchConfigValue(key);
                } catch (e) {
                    console.warn(`Could not load ${key}:`, e.message);
                    configs[key] = null;
                }
            }
            renderPrintSettings(configs);
        } catch (err) {
            console.error('Error loading print settings:', err);
            body.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</td></tr>`;
        }
    }

    // ===== RENDER PRINT SETTINGS =====
    function renderPrintSettings(configs) {
        const body = document.getElementById('ps-body');
        if (!body) return;
        
        const descriptions = {
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
            'INFO_Y_POS': 'Vertical position of info text from top of label (mm)'
        };
        
        let html = '';
        for (const key of PRINT_KEYS) {
            const value = configs[key] !== null ? configs[key] : '';
            const isBoolean = key === 'PRINT_BORDERS';
            const desc = descriptions[key] || '';
            
            html += `<tr>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">
                    <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${key}</code>
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #333;">
                    ${isBoolean ? `
                        <select id="ps-${key}" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <option value="true" ${value === 'true' ? 'selected' : ''}>True</option>
                            <option value="false" ${value === 'false' ? 'selected' : ''}>False</option>
                        </select>
                    ` : `
                        <input type="number" id="ps-${key}" value="${value}" step="0.1" min="0" style="width: 100px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;">
                    `}
                </td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${desc}</td>
                <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="psSave('${key}')" style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-save"></i> Save
                    </button>
                </td>
            </tr>`;
        }
        
        body.innerHTML = html;
    }

    // ===== SAVE SINGLE SETTING =====
    window.psSave = async function(key) {
        const input = document.getElementById(`ps-${key}`);
        if (!input) return;
        
        const value = input.value.trim();
        const button = input.closest('tr').querySelector('button');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        button.disabled = true;
        
        try {
            await saveConfigValue(key, value);
            showStatus(`✅ ${key} saved successfully`, 'success');
            button.innerHTML = '✅';
            setTimeout(() => {
                button.innerHTML = originalText;
                button.disabled = false;
            }, 1500);
        } catch (err) {
            console.error('Error saving setting:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
            button.innerHTML = originalText;
            button.disabled = false;
        }
    };

    // ===== REFRESH =====
    window.psRefresh = function() {
        loadPrintSettings();
        showStatus('✅ Settings refreshed', 'success');
    };

    // ===== RESET TO DEFAULTS =====
    window.psResetDefaults = async function() {
        if (!confirm('Reset all print settings to default values?')) return;
        
        const body = document.getElementById('ps-body');
        body.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #888;">Resetting...</td></tr>';
        
        try {
            for (const key of PRINT_KEYS) {
                await saveConfigValue(key, '');
            }
            showStatus('✅ All print settings reset', 'success');
            loadPrintSettings();
        } catch (err) {
            console.error('Error resetting settings:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
            loadPrintSettings();
        }
    };

    // ===== STATUS =====
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

    // ===== INIT =====
    window.initPrintSettings = function() {
        console.log('Print Settings initialized');
        loadPrintSettings();
    };
})();
