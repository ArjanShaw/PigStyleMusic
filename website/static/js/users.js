// ============================================================================
// users.js - Users Tab Functionality (formerly consignors.js)
// ============================================================================

// User Management Variables
let usersList = [];
let consignorOwedAmounts = {};

// Password strength checker
function checkPasswordStrength(password) {
    const strengthDiv = document.getElementById('password-strength');
    if (!strengthDiv) return;
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]+/)) strength++;
    if (password.match(/[A-Z]+/)) strength++;
    if (password.match(/[0-9]+/)) strength++;
    if (password.match(/[$@#&!]+/)) strength++;
    
    switch(strength) {
        case 0:
        case 1:
            strengthDiv.innerHTML = 'Weak password';
            strengthDiv.className = 'password-strength strength-weak';
            break;
        case 2:
        case 3:
            strengthDiv.innerHTML = 'Medium password';
            strengthDiv.className = 'password-strength strength-medium';
            break;
        case 4:
        case 5:
            strengthDiv.innerHTML = 'Strong password';
            strengthDiv.className = 'password-strength strength-strong';
            break;
    }
}

// Clear user form
function clearUserForm() {
    document.getElementById('new-username').value = '';
    document.getElementById('new-email').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('new-fullname').value = '';
    document.getElementById('new-initials').value = '';
    document.getElementById('new-role').value = 'consignor';
    document.getElementById('password-strength').innerHTML = '';
}

// Create new user
async function createUser() {
    const username = document.getElementById('new-username').value.trim();
    const email = document.getElementById('new-email').value.trim();
    const password = document.getElementById('new-password').value;
    const fullName = document.getElementById('new-fullname').value.trim();
    const initials = document.getElementById('new-initials').value.trim().toUpperCase();
    const role = document.getElementById('new-role').value;
    
    // Validation
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
            clearUserForm();
            loadUsers();
        } else {
            alert(`Error: ${data.error || 'Failed to create user'}`);
        }
    } catch (error) {
        console.error('Error creating user:', error);
        alert(`Error: ${error.message}`);
    } finally {
        loading.style.display = 'none';
    }
}

async function loadUsers() {
    const tbody = document.getElementById('users-body');
    const loading = document.getElementById('users-loading');
    loading.style.display = 'block';
    
    try {
        const url = `${AppConfig.baseUrl}/users`;
        const response = await fetch(url, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        let users = data.users || [];
        
        let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
        consignorOwedAmounts = storedOwed;
        
        let totalAdminCommission = 0;
        if (typeof savedReceipts !== 'undefined') {
            savedReceipts.forEach(receipt => {
                if (receipt.consignorPayments) {
                    receipt.items.forEach(item => {
                        if (item.consignor_id && item.type !== 'accessory' && item.type !== 'custom') {
                            const commissionRate = item.commission_rate || 10;
                            totalAdminCommission += item.store_price * (commissionRate / 100);
                        }
                    });
                }
            });
        }
        
        usersList = users.map(u => ({
            id: u.id,
            username: u.username || 'Unknown',
            email: u.email || '',
            full_name: u.full_name || '',
            initials: u.initials || (u.username ? u.username.substring(0,2).toUpperCase() : '??'),
            role: u.role || 'consignor',
            owed: storedOwed[u.id] || 0,
            recordsSold: allRecords ? allRecords.filter(r => r.consignor_id == u.id && r.status_id === 3).length : 0
        }));
        
        renderUsers(usersList);
        updateUserStats(totalAdminCommission);
        
    } catch (error) {
        console.error('Error loading users:', error);
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: #dc3545;">Error loading users: ${error.message}</td></tr>`;
    } finally {
        loading.style.display = 'none';
    }
}

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

// Payment Modal Functions
let currentPaymentUserId = null;
let currentPaymentAmount = 0;

function showPaymentModal(userId, username, amount) {
    if (amount <= 0) {
        alert('This user has no owed amount to clear.');
        return;
    }
    currentPaymentUserId = userId;
    currentPaymentAmount = amount;
    document.getElementById('payment-user-name').textContent = username;
    document.getElementById('payment-amount').textContent = `$${amount.toFixed(2)}`;
    document.getElementById('payment-modal').style.display = 'flex';
}

function closePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
    currentPaymentUserId = null;
    currentPaymentAmount = 0;
}

async function processPayment() {
    if (!currentPaymentUserId) return;
    
    let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
    delete storedOwed[currentPaymentUserId];
    localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
    
    consignorOwedAmounts = storedOwed;
    const user = usersList.find(u => u.id == currentPaymentUserId);
    if (user) {
        user.owed = 0;
    }
    
    renderUsers(usersList);
    
    let totalAdminCommission = 0;
    if (typeof savedReceipts !== 'undefined') {
        savedReceipts.forEach(receipt => {
            if (receipt.consignorPayments) {
                receipt.items.forEach(item => {
                    if (item.consignor_id && item.type !== 'accessory' && item.type !== 'custom') {
                        const commissionRate = item.commission_rate || 10;
                        totalAdminCommission += item.store_price * (commissionRate / 100);
                    }
                });
            }
        });
    }
    updateUserStats(totalAdminCommission);
    
    closePaymentModal();
    showStatus(`Payment cleared for ${user?.username}`, 'success');
}

async function deleteUser(userId, username) {
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
            credentials: 'include',  // Important: This sends cookies/session
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        // Check if response is OK before trying to parse JSON
        if (!response.ok) {
            const text = await response.text();
            console.error('Delete response:', response.status, text);
            
            // Try to parse error message if it's JSON
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
            
            let storedOwed = JSON.parse(localStorage.getItem('consignor_owed') || '{}');
            delete storedOwed[userId];
            localStorage.setItem('consignor_owed', JSON.stringify(storedOwed));
            
            updateUserStats(0);
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
}

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'users') {
        loadUsers();
    }
});