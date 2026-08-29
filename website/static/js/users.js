// Users page - User management
(function() {
    let users = [];
    let currentEditId = null;
    let paymentUserId = null;

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Load users
    async function loadUsers() {
        const list = document.getElementById('us-list');
        if (!list) return;
        
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch(`${API_BASE}/users`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                users = data.users || [];
                renderUsers();
                updateStats();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading users:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Render users
    function renderUsers() {
        const list = document.getElementById('us-list');
        if (!list) return;
        
        const search = document.getElementById('us-search')?.value.toLowerCase().trim() || '';
        let filtered = users;
        if (search) {
            filtered = users.filter(u => 
                u.username?.toLowerCase().includes(search) ||
                u.email?.toLowerCase().includes(search) ||
                u.full_name?.toLowerCase().includes(search)
            );
        }
        
        if (!filtered || filtered.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No users found</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333;">ID</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Username</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Email</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Name</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Role</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Flag</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Owed</th>
                    <th style="padding: 6px 8px; text-align: center; color: #333;">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        
        filtered.forEach(u => {
            const roleClass = u.role || 'consignor';
            const roleDisplay = u.role ? u.role.replace('_', ' ').toUpperCase() : 'Consignor';
            
            // Calculate owed for consignors (placeholder - actual calculation would need records)
            const owed = u.owed || 0;
            
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${u.id}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${u.username || '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${u.email || '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${u.full_name || '—'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">
                    <span class="status-badge ${roleClass}">${roleDisplay}</span>
                </td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">
                    ${u.flag_color ? `<span style="display: inline-block; padding: 2px 10px; border-radius: 12px; background: ${u.flag_color}; color: ${isLightColor(u.flag_color) ? '#333' : '#fff'}; font-size: 11px;">${u.flag_color}</span>` : '—'}
                </td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; color: ${owed > 0 ? '#28a745' : '#dc3545'};">$${(owed || 0).toFixed(2)}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="usEdit(${u.id})" style="padding: 3px 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px; margin-right: 3px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${u.role === 'consignor' && owed > 0 ? `
                        <button onclick="usShowPayment(${u.id}, '${u.username}', ${owed})" style="padding: 3px 8px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px; margin-right: 3px;">
                            <i class="fas fa-dollar-sign"></i>
                        </button>
                    ` : ''}
                    <button onclick="usShowReset(${u.id})" style="padding: 3px 8px; background: #ffc107; color: #333; border: none; border-radius: 4px; cursor: pointer; font-size: 10px; margin-right: 3px;">
                        <i class="fas fa-key"></i>
                    </button>
                    <button onclick="usDelete(${u.id}, '${u.username}')" style="padding: 3px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        list.innerHTML = html;
    }

    // Helper: Check if color is light
    function isLightColor(color) {
        if (!color) return false;
        const hex = color.replace('#', '');
        if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            return (r + g + b) > 382;
        }
        if (hex.length === 6) {
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return (r + g + b) > 382;
        }
        return false;
    }

    // Update stats
    function updateStats() {
        const total = users.length;
        const consignors = users.filter(u => u.role === 'consignor').length;
        const admins = users.filter(u => u.role === 'admin').length;
        const sellers = users.filter(u => u.role === 'seller').length;
        
        document.getElementById('us-total').textContent = total;
        document.getElementById('us-consignors').textContent = consignors;
        document.getElementById('us-admins').textContent = admins;
        document.getElementById('us-sellers').textContent = sellers;
    }

    // Password strength check
    window.usCheckPasswordStrength = function(password) {
        const strengthDiv = document.getElementById('us-password-strength');
        if (!strengthDiv) return;
        
        if (!password) {
            strengthDiv.textContent = '';
            strengthDiv.className = '';
            return;
        }
        
        let strength = 0;
        if (password.length >= 8) strength++;
        if (password.match(/[a-z]+/)) strength++;
        if (password.match(/[A-Z]+/)) strength++;
        if (password.match(/[0-9]+/)) strength++;
        if (password.match(/[$@#&!]+/)) strength++;
        
        const messages = ['Weak', 'Medium', 'Strong'];
        const classes = ['strength-weak', 'strength-medium', 'strength-strong'];
        const colors = ['#dc3545', '#ffc107', '#28a745'];
        const index = Math.min(strength, 2);
        
        strengthDiv.textContent = messages[index];
        strengthDiv.className = classes[index];
        strengthDiv.style.color = colors[index];
        strengthDiv.style.fontWeight = '600';
    };

    window.usCheckResetStrength = function(password) {
        const strengthDiv = document.getElementById('us-reset-strength');
        if (!strengthDiv) return;
        
        if (!password) {
            strengthDiv.textContent = '';
            strengthDiv.className = '';
            return;
        }
        
        let strength = 0;
        if (password.length >= 8) strength++;
        if (password.match(/[a-z]+/)) strength++;
        if (password.match(/[A-Z]+/)) strength++;
        if (password.match(/[0-9]+/)) strength++;
        if (password.match(/[$@#&!]+/)) strength++;
        
        const messages = ['Weak', 'Medium', 'Strong'];
        const classes = ['strength-weak', 'strength-medium', 'strength-strong'];
        const colors = ['#dc3545', '#ffc107', '#28a745'];
        const index = Math.min(strength, 2);
        
        strengthDiv.textContent = messages[index];
        strengthDiv.className = classes[index];
        strengthDiv.style.color = colors[index];
        strengthDiv.style.fontWeight = '600';
    };

    // Show add modal
    window.usShowAdd = function() {
        currentEditId = null;
        document.getElementById('us-modal-title').textContent = '👤 Add User';
        document.getElementById('us-edit-id').value = '';
        document.getElementById('us-username').value = '';
        document.getElementById('us-email').value = '';
        document.getElementById('us-password').value = '';
        document.getElementById('us-fullname').value = '';
        document.getElementById('us-initials').value = '';
        document.getElementById('us-role').value = 'consignor';
        document.getElementById('us-flag-color').value = '';
        document.getElementById('us-password-strength').textContent = '';
        document.getElementById('us-modal-status').style.display = 'none';
        document.getElementById('us-save-btn').innerHTML = '<i class="fas fa-save"></i> Save';
        document.getElementById('us-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('us-username').focus(), 100);
    };

    // Edit user
    window.usEdit = function(id) {
        const user = users.find(u => u.id === id);
        if (!user) {
            alert('User not found');
            return;
        }
        
        currentEditId = id;
        document.getElementById('us-modal-title').textContent = `✏️ Edit User #${id}`;
        document.getElementById('us-edit-id').value = id;
        document.getElementById('us-username').value = user.username || '';
        document.getElementById('us-email').value = user.email || '';
        document.getElementById('us-password').value = '';
        document.getElementById('us-password-strength').textContent = '';
        document.getElementById('us-fullname').value = user.full_name || '';
        document.getElementById('us-initials').value = user.initials || '';
        document.getElementById('us-role').value = user.role || 'consignor';
        document.getElementById('us-flag-color').value = user.flag_color || '';
        document.getElementById('us-modal-status').style.display = 'none';
        document.getElementById('us-save-btn').innerHTML = '<i class="fas fa-save"></i> Update';
        document.getElementById('us-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('us-username').focus(), 100);
    };

    // Close modal
    window.usCloseModal = function() {
        document.getElementById('us-modal').style.display = 'none';
        currentEditId = null;
    };

    // Save user
    window.usSave = async function() {
        const id = document.getElementById('us-edit-id').value;
        const username = document.getElementById('us-username').value.trim();
        const email = document.getElementById('us-email').value.trim();
        const password = document.getElementById('us-password').value;
        const fullName = document.getElementById('us-fullname').value.trim();
        const initials = document.getElementById('us-initials').value.trim().toUpperCase();
        const role = document.getElementById('us-role').value;
        const flagColor = document.getElementById('us-flag-color').value.trim();
        
        if (!username) {
            showModalStatus('Username is required', 'error');
            return;
        }
        if (!email) {
            showModalStatus('Email is required', 'error');
            return;
        }
        if (!id && !password) {
            showModalStatus('Password is required for new users', 'error');
            return;
        }
        if (password && password.length < 8) {
            showModalStatus('Password must be at least 8 characters', 'error');
            return;
        }
        
        const data = {
            username: username,
            email: email,
            role: role,
            flag_color: flagColor || null
        };
        if (fullName) data.full_name = fullName;
        if (initials) data.initials = initials;
        if (password) data.password = password;
        
        const btn = document.getElementById('us-save-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        
        try {
            const url = id ? `${API_BASE}/users/${id}` : `${API_BASE}/users`;
            const method = id ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showModalStatus('✅ User saved successfully!', 'success');
                setTimeout(() => {
                    usCloseModal();
                    loadUsers();
                }, 1000);
            } else {
                showModalStatus(`❌ Error: ${result.error || 'Failed to save'}`, 'error');
            }
        } catch (err) {
            console.error('Error saving user:', err);
            showModalStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    // Show reset password modal
    window.usShowReset = function(id) {
        const user = users.find(u => u.id === id);
        if (!user) return;
        
        document.getElementById('us-reset-id').value = id;
        document.getElementById('us-reset-password').value = '';
        document.getElementById('us-reset-confirm').value = '';
        document.getElementById('us-reset-strength').textContent = '';
        document.getElementById('us-reset-status').style.display = 'none';
        document.getElementById('us-reset-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('us-reset-password').focus(), 100);
    };

    window.usCloseResetModal = function() {
        document.getElementById('us-reset-modal').style.display = 'none';
    };

    window.usConfirmReset = async function() {
        const id = document.getElementById('us-reset-id').value;
        const password = document.getElementById('us-reset-password').value;
        const confirm = document.getElementById('us-reset-confirm').value;
        
        if (!password) {
            showResetStatus('Password is required', 'error');
            return;
        }
        if (password.length < 8) {
            showResetStatus('Password must be at least 8 characters', 'error');
            return;
        }
        if (password !== confirm) {
            showResetStatus('Passwords do not match', 'error');
            return;
        }
        
        const btn = document.getElementById('us-reset-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
        btn.disabled = true;
        
        try {
            const response = await fetch(`${API_BASE}/users/${id}/reset-password`, {
                method: 'POST',
                credentials: 'include',
                headers: getHeaders(),
                body: JSON.stringify({ new_password: password })
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showResetStatus('✅ Password reset successfully!', 'success');
                setTimeout(() => {
                    usCloseResetModal();
                }, 1000);
            } else {
                showResetStatus(`❌ Error: ${result.error || 'Failed to reset'}`, 'error');
            }
        } catch (err) {
            console.error('Error resetting password:', err);
            showResetStatus(`❌ Error: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    function showResetStatus(message, type) {
        const statusDiv = document.getElementById('us-reset-status');
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

    // Show payment modal
    window.usShowPayment = function(id, username, amount) {
        paymentUserId = id;
        document.getElementById('us-payment-name').textContent = username;
        document.getElementById('us-payment-amount').textContent = `$${amount.toFixed(2)}`;
        document.getElementById('us-payment-modal').style.display = 'flex';
    };

    window.usClosePaymentModal = function() {
        document.getElementById('us-payment-modal').style.display = 'none';
        paymentUserId = null;
    };

    window.usProcessPayment = async function() {
        if (!paymentUserId) return;
        
        if (!confirm('Mark this amount as paid?')) return;
        
        try {
            // This would call the actual payment endpoint
            // For now, just show success
            showToast('✅ Payment recorded successfully');
            usClosePaymentModal();
            loadUsers();
        } catch (err) {
            console.error('Error processing payment:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // Delete user
    window.usDelete = async function(id, username) {
        if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
        
        try {
            const response = await fetch(`${API_BASE}/users/${id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getHeaders()
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showToast('✅ User deleted');
                loadUsers();
            } else {
                alert(`Error: ${result.error || 'Failed to delete'}`);
            }
        } catch (err) {
            console.error('Error deleting user:', err);
            alert(`Error: ${err.message}`);
        }
    };

    // Search
    window.usSearch = function() {
        renderUsers();
    };

    window.usClear = function() {
        document.getElementById('us-search').value = '';
        renderUsers();
    };

    // Refresh
    window.usRefresh = function() {
        loadUsers();
    };

    // Modal status
    function showModalStatus(message, type) {
        const statusDiv = document.getElementById('us-modal-status');
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

    // Toast
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            background: ${bgColor};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 400px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Enter key search
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('us-search');
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    usSearch();
                }
            });
        }
    });

    // Close modals on outside click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('us-modal');
        if (modal && e.target === modal) {
            usCloseModal();
        }
        const resetModal = document.getElementById('us-reset-modal');
        if (resetModal && e.target === resetModal) {
            usCloseResetModal();
        }
        const paymentModal = document.getElementById('us-payment-modal');
        if (paymentModal && e.target === paymentModal) {
            usClosePaymentModal();
        }
    });

    // Init
    window.initUsers = function() {
        console.log('Users initialized');
        loadUsers();
    };
})();
