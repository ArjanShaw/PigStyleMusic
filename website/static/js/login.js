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
            const response = await fetch('http://localhost:5000/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username: username,
                    password: password
                })
            });
            
            const data = await response.json();
            console.log('Login response:', data);
            
            if (data.status === 'success') {
                statusDiv.innerHTML = '<span style="color:#28a745;">✅ Login successful! Redirecting...</span>';
                setTimeout(function() {
                    window.location.href = '/dashboard';
                }, 1000);
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
