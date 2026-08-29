// Config Keys page
(function() {
    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Load all config keys
    async function loadConfigKeys() {
        const list = document.getElementById('ck-list');
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
                renderConfigKeys(configs);
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading config keys:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Render config keys
    function renderConfigKeys(configs) {
        const list = document.getElementById('ck-list');
        if (!list) return;
        
        if (!configs || configs.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No config keys found</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333; width: 200px;">Key</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Value</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Description</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333; width: 120px;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        configs.forEach(config => {
            const key = config.config_key || config.key;
            const value = config.config_value || config.value || '';
            const description = config.description || '';
            
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">
                    <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${key}</code>
                </td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">
                    <input type="text" id="ck-val-${key.replace(/[^a-zA-Z0-9]/g, '_')}" value="${value}" style="width: 100%; min-width: 100px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                </td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${description}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="ckUpdate('${key}')" style="padding: 3px 10px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px; margin-right: 4px;">
                        <i class="fas fa-save"></i>
                    </button>
                    <button onclick="ckDelete('${key}')" style="padding: 3px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // Add new config key
    window.ckAdd = async function() {
        const key = document.getElementById('ck-new-key').value.trim();
        const value = document.getElementById('ck-new-value').value.trim();
        const description = document.getElementById('ck-new-desc').value.trim();
        
        if (!key) {
            showStatus('Config key is required', 'error');
            return;
        }
        if (!value) {
            showStatus('Config value is required', 'error');
            return;
        }
        
        const btn = document.querySelector('#ck-add-btn');
        const originalText = btn ? btn.innerHTML : 'Add';
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;
        }
        
        try {
            const response = await fetch(`${API_BASE}/config`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({
                    config_key: key,
                    config_value: value,
                    description: description
                })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                showStatus(`✅ Config key "${key}" added`, 'success');
                document.getElementById('ck-new-key').value = '';
                document.getElementById('ck-new-value').value = '';
                document.getElementById('ck-new-desc').value = '';
                loadConfigKeys();
            } else {
                showStatus(`❌ Error: ${data.error || 'Failed to add'}`, 'error');
            }
        } catch (err) {
            console.error('Error adding config key:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    };

    // Update config key
    window.ckUpdate = async function(key) {
        const inputId = `ck-val-${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const input = document.getElementById(inputId);
        if (!input) return;
        
        const value = input.value.trim();
        const button = input.closest('tr').querySelector('button:first-child');
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
                showStatus(`✅ ${key} updated`, 'success');
                button.innerHTML = '✅';
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.disabled = false;
                }, 1500);
            } else {
                throw new Error(data.error || 'Failed to update');
            }
        } catch (err) {
            console.error('Error updating config key:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
            button.innerHTML = originalText;
            button.disabled = false;
        }
    };

    // Delete config key
    window.ckDelete = async function(key) {
        if (!confirm(`Delete config key "${key}"? This cannot be undone.`)) return;
        
        try {
            const response = await fetch(`${API_BASE}/config/${key}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                showStatus(`✅ Config key "${key}" deleted`, 'success');
                loadConfigKeys();
            } else {
                showStatus(`❌ Error: ${data.error || 'Failed to delete'}`, 'error');
            }
        } catch (err) {
            console.error('Error deleting config key:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
        }
    };

    // Refresh
    window.ckRefresh = function() {
        loadConfigKeys();
        showStatus('✅ Config keys refreshed', 'success');
    };

    // Show status
    function showStatus(message, type) {
        const statusDiv = document.getElementById('ck-status');
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

    // Enter key for add fields
    document.addEventListener('DOMContentLoaded', function() {
        const fields = ['ck-new-key', 'ck-new-value', 'ck-new-desc'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        ckAdd();
                    }
                });
            }
        });
    });

    // Init
    window.initConfigKeys = function() {
        console.log('Config Keys initialized');
        loadConfigKeys();
    };
})();
