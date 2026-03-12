// users.js - Clean version with flag color support, Seller type, password reset, and sold records details

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
        
        // Show/hide fields based on role
        toggleSellerFields('consignor');
    };
    
    // New function to toggle field requirements based on role
    window.toggleSellerFields = function(role) {
        const emailField = document.getElementById('new-email');
        const passwordField = document.getElementById('new-password');
        const emailLabel = document.querySelector('label[for="new-email"]');
        const passwordLabel = document.querySelector('label[for="new-password"]');
        
        if (role === 'seller') {
            // For sellers, only username is mandatory, others are optional
            if (emailField) {
                emailField.required = false;
                emailField.placeholder = 'Email (optional for sellers)';
            }
            if (passwordField) {
                passwordField.required = false;
                passwordField.placeholder = 'Password (optional for sellers)';
            }
            
            // Add visual indicator to labels
            if (emailLabel && !emailLabel.innerHTML.includes('(optional)')) {
                emailLabel.innerHTML = emailLabel.innerHTML.replace(' *', ' <span class="optional-badge" style="font-size: 11px; color: #ffd700; font-weight: normal;">(optional)</span>');
            }
            if (passwordLabel && !passwordLabel.innerHTML.includes('(optional)')) {
                passwordLabel.innerHTML = passwordLabel.innerHTML.replace(' *', ' <span class="optional-badge" style="font-size: 11px; color: #ffd700; font-weight: normal;">(optional)</span>');
            }
        } else {
            // For other roles, restore normal requirements
            if (emailField) {
                emailField.required = true;
                emailField.placeholder = 'Enter email';
            }
            if (passwordField) {
                passwordField.required = true;
                passwordField.placeholder = 'Enter password';
            }
            
            // Restore asterisks
            if (emailLabel) {
                emailLabel.innerHTML = emailLabel.innerHTML.replace(/ <span class="optional-badge".*<\/span>/, '') + ' *';
            }
            if (passwordLabel) {
                passwordLabel.innerHTML = passwordLabel.innerHTML.replace(/ <span class="optional-badge".*<\/span>/, '') + ' *';
            }
        }
    };
    
    window.createUser = async function() {
        const username = document.getElementById('new-username').value.trim();
        const email = document.getElementById('new-email').value.trim();
        const password = document.getElementById('new-password').value;
        const fullName = document.getElementById('new-fullname').value.trim();
        const initials = document.getElementById('new-initials').value.trim().toUpperCase();
        const role = document.getElementById('new-role').value;
        const flagColor = document.getElementById('new-flag-color').value.trim();
        
        if (!username) {
            alert('Username is required');
            return;
        }
        
        // Validation based on role
        if (role !== 'seller') {
            if (!email) {
                alert('Email is required for this role');
                return;
            }
            if (!password) {
                alert('Password is required for this role');
                return;
            }
        }
        
        // Email validation only if email is provided
        if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            alert('Please enter a valid email address');
            return;
        }
        
        // Password validation only if password is provided
        if (password && password.length < 8) {
            alert('Password must be at least 8 characters long');
            return;
        }
        
        const loading = document.getElementById('users-loading');
        loading.style.display = 'block';
        
        try {
            const userData = {
                username: username,
                role: role,
                flag_color: flagColor || null
            };
            
            // Only add optional fields if they have values
            if (email) userData.email = email;
            if (password) userData.password = password;
            if (fullName) userData.full_name = fullName;
            if (initials) userData.initials = initials;
            
            const response = await fetch(`${AppConfig.baseUrl}/users`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData)
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                alert(`Seller "${username}" created successfully!`);
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
            
            // FIXED: commissionRate is stored as a fraction (0.1 = 10%)
            // Consignor gets (1 - commissionRate) of the price
            const consignorShare = storePrice * (1 - commissionRate);
            totalOwed += consignorShare;
        }
        
        return totalOwed;
    }
    
    // FIXED: showSoldRecordsDetails function with correct consignor credit calculation
    window.showSoldRecordsDetails = function(consignorId, consignorName) {
        const consignorRecords = allRecords.filter(record => {
            return record.consignor_id == consignorId && record.status_id === 3;
        });
        
        // Sort by sold date (most recent first) if available
        consignorRecords.sort((a, b) => {
            const dateA = a.sold_date || a.updated_at || a.created_at;
            const dateB = b.sold_date || b.updated_at || b.created_at;
            return new Date(dateB) - new Date(dateA);
        });
        
        // Calculate total owed
        let totalOwed = 0;
        consignorRecords.forEach(record => {
            const storePrice = Number(record.store_price);
            const commissionRate = Number(record.commission_rate);
            
            if (!isNaN(storePrice) && !isNaN(commissionRate)) {
                // FIXED: commissionRate is a fraction (0.1 = 10%)
                // Consignor gets (1 - commissionRate) of the price
                totalOwed += storePrice * (1 - commissionRate);
            }
        });
        
        // Build HTML for the modal
        let recordsHtml = '';
        
        if (consignorRecords.length === 0) {
            recordsHtml = '<tr><td colspan="8" style="text-align: center; padding: 30px;">No sold records found for this consignor</td></tr>';
        } else {
            consignorRecords.forEach(record => {
                const storePrice = Number(record.store_price);
                const commissionRate = Number(record.commission_rate);
                
                // FIXED: Calculate correctly - commissionRate is a fraction
                const storeCut = storePrice * commissionRate;           // Store gets commissionRate (e.g., 0.1 = 10%)
                const consignorShare = storePrice * (1 - commissionRate); // Consignor gets the rest
                
                const soldDate = record.sold_date || record.updated_at || record.created_at;
                const formattedDate = soldDate ? new Date(soldDate).toLocaleDateString() : 'Unknown';
                
                recordsHtml += `
                    <tr>
                        <td>${escapeHtml(record.artist || 'Unknown')}</td>
                        <td>${escapeHtml(record.title || 'Unknown')}</td>
                        <td>${escapeHtml(record.catalog_number || '—')}</td>
                        <td>$${storePrice.toFixed(2)}</td>
                        <td>${(commissionRate * 100).toFixed(1)}%</td>  <!-- FIXED: Multiply by 100 for display -->
                        <td>$${storeCut.toFixed(2)}</td>
                        <td>$${consignorShare.toFixed(2)}</td>
                        <td>${formattedDate}</td>
                    </tr>
                `;
            });
        }
        
        const modalHtml = `
            <div id="sold-records-modal" class="modal-overlay" style="display: flex;">
                <div class="modal-content" style="max-width: 900px; width: 90%; background: white;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 20px; border-radius: 8px 8px 0 0;">
                        <h3 class="modal-title" style="margin: 0; color: white;">
                            <i class="fas fa-receipt"></i> Sold Records for ${escapeHtml(consignorName)}
                        </h3>
                        <button class="modal-close" onclick="closeSoldRecordsModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer;">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px; background: white; max-height: 500px; overflow-y: auto;">
                        <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>Total Records Sold:</strong> ${consignorRecords.length}
                            </div>
                            <div>
                                <strong>Total Owed:</strong> <span style="color: #28a745; font-size: 18px;">$${totalOwed.toFixed(2)}</span>
                            </div>
                        </div>
                        <table class="records-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 10px; text-align: left;">Artist</th>
                                    <th style="padding: 10px; text-align: left;">Title</th>
                                    <th style="padding: 10px; text-align: left;">Catalog #</th>
                                    <th style="padding: 10px; text-align: left;">Price</th>
                                    <th style="padding: 10px; text-align: left;">Commission</th>
                                    <th style="padding: 10px; text-align: left;">Store Cut</th>
                                    <th style="padding: 10px; text-align: left;">Consignor Cut</th>
                                    <th style="padding: 10px; text-align: left;">Sold Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recordsHtml}
                            </tbody>
                        </table>
                    </div>
                    <div class="modal-footer" style="padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #ddd; border-radius: 0 0 8px 8px; display: flex; gap: 10px; justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="closeSoldRecordsModal()" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove any existing modal
        const existingModal = document.getElementById('sold-records-modal');
        if (existingModal) existingModal.remove();
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    };
    
    window.closeSoldRecordsModal = function() {
        const modal = document.getElementById('sold-records-modal');
        if (modal) modal.remove();
    };
    
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
                            // FIXED: commissionRate is a fraction
                            totalAdminCommission += storePrice * commissionRate;
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
            let roleClass = '';
            if (u.role === 'admin') roleClass = 'admin';
            else if (u.role === 'youtube_linker') roleClass = 'youtube_linker';
            else if (u.role === 'seller') roleClass = 'seller';
            else roleClass = 'consignor';
            
            html += `<tr>
                <td>${u.id}</td>
                <td>${escapeHtml(u.username)}</td>
                <td>${escapeHtml(u.email) || '<span style="color: #999;">—</span>'}</td>
                <td>${escapeHtml(u.full_name) || '<span style="color: #999;">—</span>'}</td>
                <td>${escapeHtml(u.initials) || '<span style="color: #999;">—</span>'}</td>
                <td><span class="role-badge ${roleClass}">${u.role.replace('_', ' ')}</span></td>
                <td>
                    ${u.flag_color ? `<span class="flag-badge" style="${getFlagColorStyle(u.flag_color)}">${u.flag_color}</span>` : '<span style="color: #999;">—</span>'}
                </td>
                <td>$${u.owed.toFixed(2)}</td>
                <td>
                    ${u.recordsSold > 0 ? 
                        `<a href="#" onclick="showSoldRecordsDetails(${u.id}, '${escapeHtml(u.username)}'); return false;" style="color: #007bff; text-decoration: underline; cursor: pointer;">
                            ${u.recordsSold}
                        </a>` : 
                        '0'
                    }
                </td>
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
                                <label for="edit-email" style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">Email ${user.role === 'seller' ? '<span class="optional-badge" style="font-size: 11px; color: #666; font-weight: normal;">(optional)</span>' : '*'}</label>
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
                                <select id="edit-role" onchange="toggleEditSellerFields(this.value)" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;">
                                    <option value="consignor" ${user.role === 'consignor' ? 'selected' : ''}>Consignor</option>
                                    <option value="seller" ${user.role === 'seller' ? 'selected' : ''}>Seller</option>
                                    <option value="youtube_linker" ${user.role === 'youtube_linker' ? 'selected' : ''}>YouTube Linker</option>
                                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                                </select>
                            </div>
                            <div class="user-form-group">
                                <label for="edit-flag-color" style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">Flag Color</label>
                                <input type="text" id="edit-flag-color" value="${escapeHtml(user.flag_color)}" placeholder="e.g., blue, #ff0000, white_yellow" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;">
                                <p class="hint" style="font-size: 12px; color: #666; margin-top: 5px;">
                                    <i class="fas fa-info-circle"></i> Enter any color name or hex code
                                </p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #ddd; border-radius: 0 0 8px 8px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end;">
                        <button class="btn btn-info" onclick="showResetPasswordModal(${userId})" style="padding: 8px 16px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            <i class="fas fa-key"></i> Reset Password
                        </button>
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
    };
    
    // New function to show password reset modal
    window.showResetPasswordModal = function(userId) {
        const user = usersList.find(u => u.id == userId);
        if (!user) return;
        
        const modalHtml = `
            <div id="reset-password-modal" class="modal-overlay" style="display: flex;">
                <div class="modal-content" style="max-width: 400px; background: white;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 20px; border-radius: 8px 8px 0 0;">
                        <h3 class="modal-title" style="margin: 0; color: white;"><i class="fas fa-key"></i> Reset Password for ${escapeHtml(user.username)}</h3>
                        <button class="modal-close" onclick="closeResetPasswordModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer;">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px; background: white;">
                        <div class="user-form-group">
                            <label for="reset-password" style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">New Password *</label>
                            <input type="password" id="reset-password" placeholder="Enter new password" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;" onkeyup="checkResetPasswordStrength(this.value)">
                            <div id="reset-password-strength" class="password-strength" style="color: #666;"></div>
                        </div>
                        <div class="user-form-group" style="margin-top: 15px;">
                            <label for="confirm-reset-password" style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">Confirm Password *</label>
                            <input type="password" id="confirm-reset-password" placeholder="Confirm new password" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;">
                        </div>
                    </div>
                    <div class="modal-footer" style="padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #ddd; border-radius: 0 0 8px 8px; display: flex; gap: 10px; justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="closeResetPasswordModal()" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                        <button class="btn btn-warning" onclick="confirmResetPassword(${userId})" style="padding: 8px 16px; background: #ffc107; color: #333; border: none; border-radius: 4px; cursor: pointer;">
                            <i class="fas fa-key"></i> Reset Password
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove any existing reset modal
        const existingModal = document.getElementById('reset-password-modal');
        if (existingModal) existingModal.remove();
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    };
    
    window.checkResetPasswordStrength = function(password) {
        const strengthDiv = document.getElementById('reset-password-strength');
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
    };
    
    window.closeResetPasswordModal = function() {
        const modal = document.getElementById('reset-password-modal');
        if (modal) modal.remove();
    };
    
    window.confirmResetPassword = async function(userId) {
        const password = document.getElementById('reset-password').value;
        const confirmPassword = document.getElementById('confirm-reset-password').value;
        
        if (!password) {
            alert('Password is required');
            return;
        }
        
        if (password.length < 8) {
            alert('Password must be at least 8 characters long');
            return;
        }
        
        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        
        const loading = document.getElementById('users-loading');
        loading.style.display = 'block';
        
        try {
            // Use the dedicated password reset endpoint
            const response = await fetch(`${AppConfig.baseUrl}/users/${userId}/reset-password`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    new_password: password
                })
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
                showStatus('Password reset successfully!', 'success');
                window.closeResetPasswordModal();
            } else {
                throw new Error(data.error || 'Failed to reset password');
            }
        } catch (error) {
            console.error('Error resetting password:', error);
            alert(`Error: ${error.message}`);
        } finally {
            loading.style.display = 'none';
        }
    };
    
    window.toggleEditSellerFields = function(role) {
        const emailField = document.getElementById('edit-email');
        const emailLabel = document.querySelector('label[for="edit-email"]');
        
        if (role === 'seller') {
            if (emailField) {
                emailField.required = false;
                emailField.placeholder = 'Email (optional for sellers)';
            }
            if (emailLabel && !emailLabel.innerHTML.includes('(optional)')) {
                emailLabel.innerHTML = emailLabel.innerHTML.replace('*', '<span class="optional-badge" style="font-size: 11px; color: #666; font-weight: normal;">(optional)</span>');
            }
        } else {
            if (emailField) {
                emailField.required = true;
                emailField.placeholder = 'Enter email';
            }
            if (emailLabel) {
                emailLabel.innerHTML = emailLabel.innerHTML.replace(/<span class="optional-badge".*<\/span>/, '*');
            }
        }
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
        
        if (!username) {
            alert('Username is required');
            return;
        }
        
        // Email validation only if email is provided and role requires it
        if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            alert('Please enter a valid email address');
            return;
        }
        
        const loading = document.getElementById('users-loading');
        loading.style.display = 'block';
        
        try {
            const updateData = {
                username: username,
                role: role,
                flag_color: flagColor || null
            };
            
            // Only add optional fields if they have values
            if (email) updateData.email = email;
            if (fullName) updateData.full_name = fullName;
            if (initials) updateData.initials = initials;
            
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
                                // FIXED: commissionRate is a fraction
                                totalAdminCommission += storePrice * commissionRate;
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
            console.log('UsersModule initialized with Seller support, password reset, and sold records details');
            
            // Add role change listener to the new role select
            const roleSelect = document.getElementById('new-role');
            if (roleSelect) {
                // Add seller option if not present
                let sellerOption = roleSelect.querySelector('option[value="seller"]');
                if (!sellerOption) {
                    const option = document.createElement('option');
                    option.value = 'seller';
                    option.textContent = 'Seller';
                    roleSelect.appendChild(option);
                }
                
                roleSelect.addEventListener('change', function() {
                    window.toggleSellerFields(this.value);
                });
            }
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