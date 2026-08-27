// System Info page
(function() {
    const API_BASE = 'http://localhost:5000';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    const PRINT_KEYS = [
        'LABEL_WIDTH_MM', 'LABEL_HEIGHT_MM', 'LEFT_MARGIN_MM', 'GUTTER_SPACING_MM',
        'TOP_MARGIN_MM', 'PRICE_FONT_SIZE', 'TEXT_FONT_SIZE', 'ARTIST_LABEL_FONT_SIZE',
        'BARCODE_HEIGHT', 'PRINT_BORDERS', 'PRICE_Y_POS', 'BARCODE_Y_POS', 'INFO_Y_POS'
    ];

    const STORE_KEYS = [
        'TAX_RATE', 'TAX_ENABLED', 'STORE_NAME', 'STORE_ADDRESS',
        'STORE_PHONE', 'RECEIPT_FOOTER', 'STORE_CAPACITY', 'MIN_STORE_PRICE'
    ];

    // Load system info
    async function loadSystemInfo() {
        const list = document.getElementById('si-list');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch(`${API_BASE}/config`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                const configs = data.configs || [];
                updateStats(configs);
                renderSystemInfo(configs);
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading system info:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Update stats
    function updateStats(configs) {
        const total = configs.length;
        let printCount = 0;
        let storeCount = 0;
        let otherCount = 0;
        
        configs.forEach(c => {
            const key = c.config_key || c.key;
            if (PRINT_KEYS.includes(key)) printCount++;
            else if (STORE_KEYS.includes(key)) storeCount++;
            else otherCount++;
        });
        
        document.getElementById('si-total-configs').textContent = total;
        document.getElementById('si-print-configs').textContent = printCount;
        document.getElementById('si-store-configs').textContent = storeCount;
        document.getElementById('si-other-configs').textContent = otherCount;
    }

    // Render system info
    function renderSystemInfo(configs) {
        const list = document.getElementById('si-list');
        if (!list) return;
        
        if (!configs || configs.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No configs found</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333; width: 200px;">Key</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Value</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Description</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333; width: 80px;">Category</th>
                </tr>
            </thead>
            <tbody>`;
        
        configs.forEach(config => {
            const key = config.config_key || config.key;
            const value = config.config_value || config.value || '';
            const description = config.description || '';
            
            let category = 'Other';
            let categoryColor = '#6c757d';
            if (PRINT_KEYS.includes(key)) {
                category = 'Print';
                categoryColor = '#007bff';
            } else if (STORE_KEYS.includes(key)) {
                category = 'Store';
                categoryColor = '#28a745';
            }
            
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">
                    <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${key}</code>
                </td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${value}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${description}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">
                    <span style="background: ${categoryColor}; color: white; padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: 600;">${category}</span>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // Export CSV
    window.siExport = async function() {
        try {
            const response = await fetch(`${API_BASE}/config`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                const configs = data.configs || [];
                
                let csv = 'Key,Value,Description\n';
                configs.forEach(c => {
                    const key = c.config_key || c.key;
                    const value = c.config_value || c.value || '';
                    const desc = c.description || '';
                    csv += `${key},"${value}","${desc}"\n`;
                });
                
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `system_config_${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
                showStatus('✅ Config exported to CSV', 'success');
            }
        } catch (err) {
            console.error('Error exporting config:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
        }
    };

    // Refresh
    window.siRefresh = function() {
        loadSystemInfo();
        showStatus('✅ System info refreshed', 'success');
    };

    // Show status
    function showStatus(message, type) {
        const statusDiv = document.getElementById('si-status');
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
    window.initSystemInfo = function() {
        console.log('System Info initialized');
        loadSystemInfo();
    };
})();
