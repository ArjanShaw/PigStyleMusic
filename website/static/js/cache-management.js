// Cache Management page
(function() {
    const API_BASE = '';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Load cache info
    async function loadCacheInfo() {
        try {
            const response = await fetch(`${API_BASE}/config`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                const configs = data.configs || [];
                const keys = configs.map(c => c.config_key || c.key);
                
                document.getElementById('cm-count').textContent = keys.length;
                document.getElementById('cm-status-text').textContent = '✅ Active';
                document.getElementById('cm-status-text').style.color = '#28a745';
                document.getElementById('cm-last-updated').textContent = new Date().toLocaleString();
                
                renderCacheKeys(keys);
            }
        } catch (err) {
            console.error('Error loading cache info:', err);
            document.getElementById('cm-status-text').textContent = '⚠️ Error';
            document.getElementById('cm-status-text').style.color = '#dc3545';
        }
    }

    // Render cache keys
    function renderCacheKeys(keys) {
        const list = document.getElementById('cm-keys-list');
        if (!list) return;
        
        if (!keys || keys.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No config keys cached</div>';
            return;
        }
        
        let html = '';
        keys.forEach(key => {
            html += `<div style="padding: 4px 8px; border-bottom: 1px solid #f5f5f5; font-size: 12px; color: #333;">
                <code>${key}</code>
            </div>`;
        });
        list.innerHTML = html;
    }

    // Clear cache
    window.cmClearCache = async function() {
        if (!confirm('Clear the configuration cache? This will require reloading all config values.')) return;
        
        const btn = document.querySelector('#cm-clear-btn');
        const originalText = btn ? btn.innerHTML : 'Clear Cache';
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Clearing...';
            btn.disabled = true;
        }
        
        try {
            // Clear localStorage config cache
            if (typeof localStorage !== 'undefined') {
                const keys = Object.keys(localStorage);
                keys.forEach(key => {
                    if (key.startsWith('config_') || key === 'configCache' || key === 'pigstyle_config') {
                        localStorage.removeItem(key);
                    }
                });
            }
            
            // Also clear any in-memory cache
            if (typeof window.configCache !== 'undefined') {
                window.configCache = {};
            }
            if (typeof window.dbConfigValues !== 'undefined') {
                window.dbConfigValues = {};
            }
            
            showStatus('✅ Cache cleared successfully', 'success');
            document.getElementById('cm-status-text').textContent = '🔄 Cache Cleared';
            document.getElementById('cm-status-text').style.color = '#ffc107';
            document.getElementById('cm-count').textContent = '0';
            document.getElementById('cm-last-updated').textContent = new Date().toLocaleString();
            document.getElementById('cm-keys-list').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Cache cleared, reload to repopulate</div>';
            
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } catch (err) {
            console.error('Error clearing cache:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    };

    // Refresh cache
    window.cmRefreshCache = async function() {
        const btn = document.querySelector('#cm-refresh-btn');
        const originalText = btn ? btn.innerHTML : 'Refresh Cache';
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
            btn.disabled = true;
        }
        
        try {
            // Clear first
            if (typeof localStorage !== 'undefined') {
                const keys = Object.keys(localStorage);
                keys.forEach(key => {
                    if (key.startsWith('config_') || key === 'configCache' || key === 'pigstyle_config') {
                        localStorage.removeItem(key);
                    }
                });
            }
            if (typeof window.configCache !== 'undefined') {
                window.configCache = {};
            }
            if (typeof window.dbConfigValues !== 'undefined') {
                window.dbConfigValues = {};
            }
            
            // Reload config
            const response = await fetch(`${API_BASE}/config`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                const configs = data.configs || [];
                const keys = configs.map(c => c.config_key || c.key);
                
                // Store in memory
                if (typeof window.dbConfigValues !== 'undefined') {
                    configs.forEach(c => {
                        const key = c.config_key || c.key;
                        window.dbConfigValues[key] = {
                            value: c.config_value || c.value,
                            description: c.description || ''
                        };
                    });
                }
                
                showStatus('✅ Cache refreshed successfully', 'success');
                document.getElementById('cm-count').textContent = keys.length;
                document.getElementById('cm-status-text').textContent = '✅ Active';
                document.getElementById('cm-status-text').style.color = '#28a745';
                document.getElementById('cm-last-updated').textContent = new Date().toLocaleString();
                renderCacheKeys(keys);
            } else {
                showStatus(`❌ Error: ${data.error || 'Failed to refresh'}`, 'error');
            }
        } catch (err) {
            console.error('Error refreshing cache:', err);
            showStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    };

    // Reload page
    window.cmReloadPage = function() {
        location.reload();
    };

    // Show status
    function showStatus(message, type) {
        const statusDiv = document.getElementById('cm-status');
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
    window.initCacheManagement = function() {
        console.log('Cache Management initialized');
        loadCacheInfo();
    };
})();
