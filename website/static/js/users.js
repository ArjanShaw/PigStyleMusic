// users.js - Clean version with no logging

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
        document.getElementById('password-strength').innerHTML = '';
    };
    
    window.createUser = async function() {
        const username = document.getElementById('new-username').value.trim();
        const email = document.getElementById('new-email').value.trim();
        const password = document.getElementById('new-password').value;
        const fullName = document.getElementById('new-fullname').value.trim();
        const initials = document.getElementById('new-initials').value.trim().toUpperCase();
        const role = document.getElementById('new-role').value;
        
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
                    initials: initials
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
            if (record.store_price === undefined || 
                record.store_price === null || 
                record.commission_rate === undefined || 
                record.commission_rate === null) {
                continue;
            }
            
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
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: #dc3545;">Error loading users: ${error.message}</td></tr>`;
        } finally {
            loading.style.display = 'none';
        }
    };
    
    function renderUsers(users) {
        const tbody = document.getElementById('users-body');
        if (!users.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No users found</td></tr>`;
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
                <td>$${u.owed.toFixed(2)}</td>
                <td>${u.recordsSold}</td>
                <td>
                    ${u.owed > 0 ? `
                        <button class="btn btn-sm btn-success" onclick="showPaymentModal('${u.id}', '${escapeHtml(u.username)}', ${u.owed})">
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