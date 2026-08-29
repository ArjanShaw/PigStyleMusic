// Config Keys Management
(function() {
    'use strict';

    // ===== API BASE URL =====
    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    let configs = {};

    // ===== LOAD CONFIG KEYS =====
    function loadConfigKeys() {
        const list = document.getElementById('ck-list');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Loading config keys...</div>';
        
        const statusEl = document.getElementById('ck-status');
        if (statusEl) {
            statusEl.style.display = 'none';
        }
        
        fetch(`${API_BASE}/config`, {
            credentials: 'include',
            mode: 'cors',
            headers: { 'Accept': 'application/json' }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                configs = data.configs || {};
                renderConfigKeys(configs);
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load config'}</div>`;
            }
        })
        .catch(err => {
            console.error('Error loading config keys:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        });
    }

    // ===== RENDER CONFIG KEYS =====
    function renderConfigKeys(configsObject) {
        const list = document.getElementById('ck-list');
        if (!list) return;
        
        const keys = Object.keys(configsObject);
        
        if (keys.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No config keys found</div>';
            return;
        }
        
        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 8px 10px; text-align: left; color: #333; width: 30%;">Key</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333; width: 30%;">Value</th>
                    <th style="padding: 8px 10px; text-align: left; color: #333; width: 25%;">Description</th>
                    <th style="padding: 8px 10px; text-align: center; color: #333; width: 15%;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        // Sort keys alphabetically
        const sortedKeys = keys.sort();
        
        sortedKeys.forEach(key => {
            const config = configsObject[key];
            const value = config && config.value !== undefined && config.value !== null ? config.value : '';
            const description = config && config.description ? config.description : '';
            
            html += `<tr data-key="${key}" style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 10px; color: #333; font-weight: 500; word-break: break-word;">
                    <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${key}</code>
                </td>
                <td style="padding: 8px 10px; color: #333; word-break: break-word;">
                    <input type="text" id="ck-value-${key}" value="${escapeHtml(String(value))}" 
                           style="width: 100%; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; box-sizing: border-box;">
                </td>
                <td style="padding: 8px 10px; color: #666; font-size: 12px; word-break: break-word;">
                    <input type="text" id="ck-desc-${key}" value="${escapeHtml(String(description))}" 
                           style="width: 100%; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; box-sizing: border-box; color: #666;" 
                           placeholder="Description...">
                </td>
                <td style="padding: 8px 10px; text-align: center;">
                    <button onclick="ckUpdate('${key}')" style="padding: 4px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600;">
                        <i class="fas fa-save"></i> Save
                    </button>
                    <button onclick="ckDelete('${key}')" style="padding: 4px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; margin-top: 2px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // ===== ESCAPE HTML =====
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===== ADD CONFIG KEY =====
    window.ckAdd = function() {
        const keyInput = document.getElementById('ck-new-key');
        const valueInput = document.getElementById('ck-new-value');
        const descInput = document.getElementById('ck-new-desc');
        
        const key = keyInput?.value?.trim();
        const value = valueInput?.value?.trim();
        const description = descInput?.value?.trim();
        
        if (!key) {
            showStatus('⚠️ Please enter a config key.', 'warning');
            keyInput?.focus();
            return;
        }
        
        if (!value) {
            showStatus('⚠️ Please enter a value.', 'warning');
            valueInput?.focus();
            return;
        }
        
        fetch(`${API_BASE}/config/${encodeURIComponent(key)}`, {
            method: 'PUT',
            credentials: 'include',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config_value: value })
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                // Also update description if provided
                if (description) {
                    return fetch(`${API_BASE}/config/${encodeURIComponent(key)}`, {
                        method: 'PUT',
                        credentials: 'include',
                        mode: 'cors',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ config_value: value, description: description })
                    });
                }
                return data;
            } else {
                throw new Error(data.error || 'Failed to add config');
            }
        })
        .then(() => {
            showStatus('✅ Config key added successfully!', 'success');
            if (keyInput) keyInput.value = '';
            if (valueInput) valueInput.value = '';
            if (descInput) descInput.value = '';
            loadConfigKeys();
        })
        .catch(err => {
            console.error('Error adding config key:', err);
            showStatus('❌ Error: ' + err.message, 'error');
        });
    };

    // ===== UPDATE CONFIG KEY =====
    window.ckUpdate = function(key) {
        const valueInput = document.getElementById(`ck-value-${key}`);
        const descInput = document.getElementById(`ck-desc-${key}`);
        
        const value = valueInput?.value?.trim();
        const description = descInput?.value?.trim();
        
        if (value === undefined) {
            showStatus('⚠️ Value not found.', 'warning');
            return;
        }
        
        const payload = { config_value: value };
        if (description !== undefined) {
            payload.description = description;
        }
        
        fetch(`${API_BASE}/config/${encodeURIComponent(key)}`, {
            method: 'PUT',
            credentials: 'include',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                showStatus(`✅ Config "${key}" updated successfully!`, 'success');
                loadConfigKeys();
            } else {
                throw new Error(data.error || 'Failed to update config');
            }
        })
        .catch(err => {
            console.error('Error updating config key:', err);
            showStatus('❌ Error: ' + err.message, 'error');
        });
    };

    // ===== DELETE CONFIG KEY =====
    window.ckDelete = function(key) {
        if (!confirm(`Are you sure you want to delete config key "${key}"?`)) {
            return;
        }
        
        fetch(`${API_BASE}/config/${encodeURIComponent(key)}`, {
            method: 'PUT',
            credentials: 'include',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config_value: null })
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                showStatus(`✅ Config "${key}" deleted successfully!`, 'success');
                loadConfigKeys();
            } else {
                throw new Error(data.error || 'Failed to delete config');
            }
        })
        .catch(err => {
            console.error('Error deleting config key:', err);
            showStatus('❌ Error: ' + err.message, 'error');
        });
    };

    // ===== REFRESH =====
    window.ckRefresh = function() {
        loadConfigKeys();
        showStatus('✅ Refreshed', 'success');
    };

    // ===== SHOW STATUS =====
    function showStatus(message, type = 'info') {
        const statusEl = document.getElementById('ck-status');
        if (!statusEl) return;
        
        statusEl.style.display = 'block';
        statusEl.textContent = message;
        
        const colors = {
            success: '#d4edda; color: #155724; border: 1px solid #c3e6cb;',
            error: '#f8d7da; color: #721c24; border: 1px solid #f5c6cb;',
            warning: '#fff3cd; color: #856404; border: 1px solid #ffeeba;',
            info: '#cce5ff; color: #004085; border: 1px solid #b8daff;'
        };
        
        statusEl.style.background = colors[type] || colors.info;
        statusEl.style.border = '1px solid';
        statusEl.style.padding = '8px 12px';
        statusEl.style.borderRadius = '8px';
        
        clearTimeout(statusEl._timeout);
        statusEl._timeout = setTimeout(() => {
            statusEl.style.display = 'none';
        }, 4000);
    }

    // ===== INIT =====
    window.initConfigKeys = function() {
        console.log('Config Keys initialized');
        loadConfigKeys();
    };

    // Also listen for Enter key on add fields
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const active = document.activeElement;
            if (active && ['ck-new-key', 'ck-new-value', 'ck-new-desc'].includes(active.id)) {
                e.preventDefault();
                ckAdd();
            }
        }
    });

})();