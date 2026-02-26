// users.js - Clean version with flag color support

// ============================================================================
// users.js - Users Tab Functionality
// ============================================================================

// Use a namespace to avoid conflicts
const UsersModule = (function() {
    // Private variables
    let usersList = [];
    let allRecords = [];
    
    // Make checkPasswordStrength available globally
    window.checkPasswordStrength = function(password) {
        const strengthDiv = document.getElementById('password-strength');
        if (!strengthDiv) return;
        
        let strength = 0;
        if (password.length >= 8) strength++;
        if (password.match(/[a-z]+/)) strength++;
        if (password.match(/[A-Z]+/)) strength++;
        if (password.match(/[0-9]+/)) strength++;
        if (password.match(/[$@#&!]+/)) strength++;
        
        const strengthMessages = ['Weak password', 'Medium password', 'Strong password'];
        const strengthClasses = ['strength-weak', 'strength-medium', 'strength-strong'];
        const index = Math.min(strength, 2);
        
        strengthDiv.innerHTML = strengthMessages[index];
        strengthDiv.className = `password-strength ${strengthClasses[index]}`;
    };
    
    window.clearUserForm = function() {
        document.getElementById('new-username').value = '';
        document.getElementById('new-email').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('new-fullname').value = '';
        document.getElementById('new-initials').value = '';
        document.getElementById('new-role').value = 'consignor';
        document.getElementById('new-flag-color').value = '';
        document.getElementById('password-strength').innerHTML = '';
    };
    
    window.createUser = async function() {
        const username = document.getElementById('new-username').value.trim();
        const email = document.getElementById('new-email').value.trim();
        const password = document.getElementById('new-password').value;
        const fullName = document.getElementById('new-fullname').value.trim();
        const initials = document.getElementById('new-initials').value.trim().toUpperCase();
        const role = document.getElementById('new-role').value;
        const flagColor = document.getElementById('new-flag-color').value.trim();
        
        if (!username || !email || !password) {
            alert('Username, email, and password are required');
            return;
        }
        
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            alert('Please enter a valid email address');
            return;
        }
        
        if (password.length < 8) {
            alert('Password must be at least 8 characters long');
            return;
        }
        
        const loading = document.getElementById('users-loading');
        loading.style.display = 'block';
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/users`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    email: email,
                    password: password,
                    role: role,
                    full_name: fullName,
                    initials: initials,
                    flag_color: flagColor || null
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                alert(`User created successfully!`);
                window.clearUserForm();
                window.loadUsers();
            } else {
                alert(`Error: ${data.error || 'Failed to create user'}`);
            }
        } catch (error) {
            console.error('Error creating user:', error);
            alert(`Error: ${error.message}`);
        } finally {
            loading.style.display = 'none';
        }
    };
    
    async function loadAllRecords() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/records`, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            allRecords = data.records || [];
            
        } catch (error) {
            console.error('Error loading records:', error);
            allRecords = [];
        }
    }
    
    function calculateOwedFromRecords(consignorId) {
        if (!allRecords || allRecords.length === 0) {
            return 0;
        }
        
        const consignorSoldRecords = allRecords.filter(record => {
            if (record.consignor_id != consignorId) {
                return false;
            }
            if (record.status_id !== 3) {
                return false;
            }
            return true;
        });
        
        let totalOwed = 0;
        
        for (const record of consignorSoldRecords) {
            const storePrice = Number(record.store_price);
            const commissionRate = Number(record.commission_rate);
            
            if (isNaN(storePrice) || isNaN(commissionRate)) {
                continue;
            }
            
            let consignorShare;
            if (commissionRate > 1) {
                consignorShare = storePrice * ((100 - commissionRate) / 100);
            } else {
                consignorShare = storePrice * (1 - commissionRate);
            }
            
            totalOwed += consignorShare;
        }
        
        return totalOwed;
    }
    
    window.loadUsers = async function() {
        const tbody = document.getElementById('users-body');
        const loading = document.getElementById('users-loading');
        loading.style.display = 'block';
        
        try {
            const usersUrl = `${AppConfig.baseUrl}/users`;
            const usersResponse = await fetch(usersUrl, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (!usersResponse.ok) {
                throw new Error(`HTTP error! status: ${usersResponse.status}`);
            }
            
            const usersData = await usersResponse.json();
            const users = usersData.users || [];
            
            await loadAllRecords();
            
            const owedAmounts = {};
            users.forEach(user => {
                if (user.role === 'consignor') {
                    owedAmounts[user.id] = calculateOwedFromRecords(user.id);
                }
            });
            
            usersList = users.map(u => {
                const recordsSold = allRecords.filter(r => 
                    r.consignor_id == u.id && r.status_id === 3
                ).length;
                
                return {
                    id: u.id,
                    username: u.username || '',
                    email: u.email || '',
                    full_name: u.full_name || '',
                    initials: u.initials || '',
                    role: u.role || '',
                    flag_color: u.flag_color || '',
                    owed: u.role === 'consignor' ? (owedAmounts[u.id] || 0) : 0,
                    recordsSold: recordsSold
                };
            });
            
            renderUsers(usersList);
            
            let totalAdminCommission = 0;
            if (allRecords.length > 0) {
                const soldRecords = allRecords.filter(r => r.status_id === 3);
                soldRecords.forEach(record => {
                    if (record.consignor_id && 
                        record.store_price !== undefined && 
                        record.store_price !== null &&
                        record.commission_rate !== undefined && 
                        record.commission_rate !== null) {
                        
                        const storePrice = Number(record.store_price);
                        const commissionRate = Number(record.commission_rate);
                        
                        if (!isNaN(storePrice) && !isNaN(commissionRate)) {
                            if (commissionRate > 1) {
                                totalAdminCommission += storePrice * (commissionRate / 100);
                            } else {
                                totalAdminCommission += storePrice * commissionRate;
                            }
                        }
                    }
                });
            }
            
            updateUserStats(totalAdminCommission);
            
        } catch (error) {
            console.error('Error loading users:', error);
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: #dc3545;">Error loading users: ${error.message}</td></tr>`;
        } finally {
            loading.style.display = 'none';
        }
    };
    
    function getFlagColorStyle(color) {
        if (!color) return '';
        
        // If it's a known color name, use it directly
        const colorMap = {
            'white_yellow': 'background: linear-gradient(135deg, #ffffff 50%, #ffc107 50%); color: #333; border: 1px solid #ddd;',
            'green': 'background-color: #28a745; color: white; border: 1px solid #1e7e34;',
            'blue': 'background-color: #007bff; color: white; border: 1px solid #0056b3;',
            'red': 'background-color: #dc3545; color: white; border: 1px solid #bd2130;',
            'purple': 'background-color: #6f42c1; color: white; border: 1px solid #5a32a3;',
            'orange': 'background-color: #fd7e14; color: white; border: 1px solid #dc6b0d;',
            'yellow': 'background-color: #ffc107; color: #333; border: 1px solid #e0a800;'
        };
        
        // Check if it's a hex color
        if (color.match(/^#[0-9A-Fa-f]{6}$/) || color.match(/^#[0-9A-Fa-f]{3}$/)) {
            return `background-color: ${color}; color: white; border: 1px solid #666;`;
        }
        
        return colorMap[color.toLowerCase()] || `background-color: ${color}; color: white; border: 1px solid #666;`;
    }
    function renderUsers(users) {
        const tbody = document.getElementById('users-body');
        if (!users.length) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">No users found</td></tr>`;
            return;
        }
        
        let html = '';
        users.forEach(u => {
            const roleClass = u.role === 'admin' ? 'admin' : (u.role === 'youtube_linker' ? 'youtube_linker' : 'consignor');
            
            html += `<tr>
                <td>${u.id}</td>
                <td>${escapeHtml(u.username)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${escapeHtml(u.full_name)}</td>
                <td>${escapeHtml(u.initials)}</td>
                <td><span class="role-badge ${roleClass}">${u.role.replace('_', ' ')}</span></td>
                <td>
                    ${escapeHtml(u.flag_color)}
                </td>
                <td>$${u.owed.toFixed(2)}</td>
                <td>${u.recordsSold}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editUser(${u.id})" style="margin-right: 5px;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    ${u.owed > 0 ? `
                        <button class="btn btn-sm btn-success" onclick="showPaymentModal('${u.id}', '${escapeHtml(u.username)}', ${u.owed})" style="margin-right: 5px;">
                            <i class="fas fa-dollar-sign"></i> Pay
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } 
    
    function updateUserStats(totalAdminCommission) {
        document.getElementById('total-users').textContent = usersList.length;
        const totalOwed = usersList.reduce((acc, u) => acc + (u.owed || 0), 0);
        document.getElementById('total-credit').textContent = `$${totalOwed.toFixed(2)}`;
        document.getElementById('admin-total-commission').textContent = `$${totalAdminCommission.toFixed(2)}`;
    }
    
    let currentPaymentUserId = null;
    let currentPaymentAmount = 0;
    
    window.showPaymentModal = function(userId, username, amount) {
        if (amount <= 0) {
            alert('This user has no owed amount to clear.');
            return;
        }
        currentPaymentUserId = userId;
        currentPaymentAmount = amount;
        document.getElementById('payment-user-name').textContent = username;
        document.getElementById('payment-amount').textContent = `$${amount.toFixed(2)}`;
        document.getElementById('payment-modal').style.display = 'flex';
    };
    
    window.closePaymentModal = function() {
        document.getElementById('payment-modal').style.display = 'none';
        currentPaymentUserId = null;
        currentPaymentAmount = 0;
    };
    
    window.processPayment = async function() {
        if (!currentPaymentUserId) return;
        
        const user = usersList.find(u => u.id == currentPaymentUserId);
        
        if (!confirm(`Mark payment of $${currentPaymentAmount.toFixed(2)} for ${user?.username} as paid?`)) {
            return;
        }
        
        alert(`Payment of $${currentPaymentAmount.toFixed(2)} recorded for ${user?.username}`);
        
        window.closePaymentModal();
        await window.loadUsers();
    };
    
    window.editUser = async function(userId) {
        const user = usersList.find(u => u.id == userId);
        if (!user) return;
        
        // Create modal for editing
        const modalHtml = `
            <div id="edit-user-modal" class="modal-overlay" style="display: flex;">
                <div class="modal-content" style="max-width: 500px; background: white;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 20px; border-radius: 8px 8px 0 0;">
                        <h3 class="modal-title" style="margin: 0; color: white;"><i class="fas fa-edit"></i> Edit User: ${escapeHtml(user.username)}</h3>
                        <button class="modal-close" onclick="closeEditUserModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer;">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px; background: white;">
                        <div class="user-form-grid" style="display: grid; grid-template-columns: 1fr; gap: 15px;">
                            <div class="user-form-group">
                                <label for="edit-username" style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">Username *</label>
                                <input type="text" id="edit-username" value="${escapeHtml(user.username)}" placeholder="Enter username" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;">
                            </div>
                            <div class="user-form-group">
                                <label for="edit-email" style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">Email *</label>
                                <input type="email" id="edit-email" value="${escapeHtml(user.email)}" placeholder="Enter email" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;">
                            </div>
                            <div class="user-form-group">
                                <label for="edit-fullname" style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">Full Name</label>
                                <input type="text" id="edit-fullname" value="${escapeHtml(user.full_name)}" placeholder="Enter full name" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;">
                            </div>
                            <div class="user-form-group">
                                <label for="edit-initials" style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">Initials</label>
                                <input type="text" id="edit-initials" value="${escapeHtml(user.initials)}" placeholder="e.g., ADB" maxlength="5" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;">
                            </div>
                            <div class="user-form-group">
                                <label for="edit-role" style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">Role *</label>
                                <select id="edit-role" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;">
                                    <option value="consignor" ${user.role === 'consignor' ? 'selected' : ''}>Consignor</option>
                                    <option value="youtube_linker" ${user.role === 'youtube_linker' ? 'selected' : ''}>YouTube Linker</option>
                                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                                </select>
                            </div>
                            <div class="user-form-group">
                                <label for="edit-flag-color" style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">Flag Color</label>
                                <input type="text" id="edit-flag-color" value="${escapeHtml(user.flag_color)}" placeholder="e.g., blue, #ff0000, white_yellow" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;">
                                <p class="hint" style="font-size: 12px; color: #666; margin-top: 5px;">
                                    <i class="fas fa-info-circle"></i> Enter any color name or hex code (e.g., blue, #ff0000, white_yellow)
                                </p>
                            </div>
                            <div class="user-form-group">
                                <label for="edit-password" style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">New Password (leave blank to keep current)</label>
                                <input type="password" id="edit-password" placeholder="Enter new password" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;">
                                <div id="edit-password-strength" class="password-strength" style="color: #666;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #ddd; border-radius: 0 0 8px 8px; display: flex; gap: 10px; justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="closeEditUserModal()" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                        <button class="btn btn-success" onclick="saveUserEdit(${userId})" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            <i class="fas fa-save"></i> Save Changes
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove any existing edit modal
        const existingModal = document.getElementById('edit-user-modal');
        if (existingModal) existingModal.remove();
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Add password strength listener
        document.getElementById('edit-password').addEventListener('keyup', function() {
            const password = this.value;
            const strengthDiv = document.getElementById('edit-password-strength');
            if (!strengthDiv) return;
            
            if (!password) {
                strengthDiv.innerHTML = '';
                return;
            }
            
            let strength = 0;
            if (password.length >= 8) strength++;
            if (password.match(/[a-z]+/)) strength++;
            if (password.match(/[A-Z]+/)) strength++;
            if (password.match(/[0-9]+/)) strength++;
            if (password.match(/[$@#&!]+/)) strength++;
            
            const strengthMessages = ['Weak password', 'Medium password', 'Strong password'];
            const strengthClasses = ['strength-weak', 'strength-medium', 'strength-strong'];
            const index = Math.min(strength, 2);
            
            strengthDiv.innerHTML = strengthMessages[index];
            strengthDiv.className = `password-strength ${strengthClasses[index]}`;
        });
    };
    
    window.closeEditUserModal = function() {
        const modal = document.getElementById('edit-user-modal');
        if (modal) modal.remove();
    };
    
    window.saveUserEdit = async function(userId) {
        const username = document.getElementById('edit-username').value.trim();
        const email = document.getElementById('edit-email').value.trim();
        const fullName = document.getElementById('edit-fullname').value.trim();
        const initials = document.getElementById('edit-initials').value.trim().toUpperCase();
        const role = document.getElementById('edit-role').value;
        const flagColor = document.getElementById('edit-flag-color').value.trim();
        const password = document.getElementById('edit-password').value;
        
        if (!username || !email) {
            alert('Username and email are required');
            return;
        }
        
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            alert('Please enter a valid email address');
            return;
        }
        
        if (password && password.length < 8) {
            alert('Password must be at least 8 characters long if changing');
            return;
        }
        
        const loading = document.getElementById('users-loading');
        loading.style.display = 'block';
        
        try {
            const updateData = {
                username: username,
                email: email,
                role: role,
                full_name: fullName,
                initials: initials,
                flag_color: flagColor || null
            };
            
            if (password) {
                updateData.password = password;
            }
            
            const response = await fetch(`${AppConfig.baseUrl}/users/${userId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateData)
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                showStatus(`User updated successfully!`, 'success');
                window.closeEditUserModal();
                await window.loadUsers();
            } else {
                alert(`Error: ${data.error || 'Failed to update user'}`);
            }
        } catch (error) {
            console.error('Error updating user:', error);
            alert(`Error: ${error.message}`);
        } finally {
            loading.style.display = 'none';
        }
    };
    
    window.deleteUser = async function(userId, username) {
        if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) return;
        
        const hasRecords = allRecords ? allRecords.some(r => r.consignor_id == userId) : false;
        
        if (hasRecords) {
            alert('Cannot delete user with existing records. Please reassign or delete records first.');
            return;
        }
        
        const loading = document.getElementById('users-loading');
        loading.style.display = 'block';
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/users/${userId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) {
                const text = await response.text();
                try {
                    const errorData = JSON.parse(text);
                    throw new Error(errorData.error || `Server returned ${response.status}`);
                } catch (e) {
                    throw new Error(`Server returned ${response.status}: ${text.substring(0, 100)}`);
                }
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                usersList = usersList.filter(u => u.id != userId);
                renderUsers(usersList);
                
                let totalAdminCommission = 0;
                if (allRecords.length > 0) {
                    const soldRecords = allRecords.filter(r => r.status_id === 3);
                    soldRecords.forEach(record => {
                        if (record.consignor_id && 
                            record.store_price !== undefined && 
                            record.store_price !== null &&
                            record.commission_rate !== undefined && 
                            record.commission_rate !== null) {
                            
                            const storePrice = Number(record.store_price);
                            const commissionRate = Number(record.commission_rate);
                            
                            if (!isNaN(storePrice) && !isNaN(commissionRate)) {
                                if (commissionRate > 1) {
                                    totalAdminCommission += storePrice * (commissionRate / 100);
                                } else {
                                    totalAdminCommission += storePrice * commissionRate;
                                }
                            }
                        }
                    });
                }
                
                updateUserStats(totalAdminCommission);
                showStatus(`User "${username}" deleted`, 'success');
            } else {
                alert(`Error: ${data.error || 'Failed to delete user'}`);
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            alert(`Error: ${error.message}`);
        } finally {
            loading.style.display = 'none';
        }
    };
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function showStatus(message, type = 'info') {
        const existingMessages = document.querySelectorAll('.status-message-popup');
        existingMessages.forEach(el => el.remove());
        
        const statusDiv = document.createElement('div');
        statusDiv.className = `status-message-popup status-${type}`;
        
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#007bff'
        };
        
        statusDiv.innerHTML = `
            <div style="
                position: fixed;
                top: 100px;
                right: 20px;
                background: ${colors[type] || '#007bff'};
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                z-index: 2000;
                display: flex;
                align-items: center;
                gap: 10px;
                max-width: 400px;
                animation: slideIn 0.3s ease;
            ">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(statusDiv);
        
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.remove();
            }
        }, 5000);
    }
    
    return {
        init: function() {
            // Silent init
        }
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    UsersModule.init();
});

document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'users') {
        window.loadUsers();
    }
});