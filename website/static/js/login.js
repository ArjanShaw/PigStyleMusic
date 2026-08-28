// Login page
(function() {
    window.handleLogin = async function() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        const statusDiv = document.getElementById('loginStatus');
        
        if (!username) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter your username</span>';
            return;
        }
        if (!password) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter your password</span>';
            return;
        }
        
        statusDiv.innerHTML = '<span style="color:#666;">⏳ Logging in...</span>';
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',  // <-- THIS WAS MISSING
                body: JSON.stringify({ 
                    username: username,
                    password: password
                })
            });
            
            const data = await response.json();
            console.log('Login response:', data);
            
            if (data.status === 'success' && data.user) {
                // Store user data with role from response
                localStorage.setItem('pigstyle_user', JSON.stringify({
                    logged_in: true,
                    username: data.user.username || username,
                    role: data.user.role || 'user',
                    user_id: data.user.id || data.user.user_id,
                    full_name: data.user.full_name || username
                }));
                
                statusDiv.innerHTML = '<span style="color:#28a745;">✅ Login successful! Menu updated.</span>';
                document.getElementById('loginUsername').value = '';
                document.getElementById('loginPassword').value = '';
                
                // Update menu
                if (typeof updateMenu === 'function') {
                    updateMenu();
                }
                
                // If on login page, go home
                const content = document.getElementById('page-content');
                if (content && content.querySelector('#loginResponse')) {
                    showPage('home');
                }
            } else {
                statusDiv.innerHTML = '<span style="color:#dc3545;">❌ ' + (data.error || 'Invalid credentials') + '</span>';
            }
        } catch(err) {
            console.error('Error logging in:', err);
            statusDiv.innerHTML = '<span style="color:#dc3545;">❌ Network error. Please try again.</span>';
        }
    };

    window.initLogin = function() {
        console.log('Login initialized');
    };
})();
