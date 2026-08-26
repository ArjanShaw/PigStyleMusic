// Email List page
(function() {
    window.subscribeEmail = async function() {
        const email = document.getElementById('emailInput').value.trim();
        const statusDiv = document.getElementById('emailStatus');
        
        if (!email) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter your email</span>';
            return;
        }
        if (!email.includes('@') || !email.includes('.')) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter a valid email</span>';
            return;
        }
        
        statusDiv.innerHTML = '<span style="color:#666;">⏳ Subscribing...</span>';
        
        try {
            const response = await fetch('http://localhost:5000/api/email-list/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });
            
            const data = await response.json();
            console.log('Email subscription response:', data);
            
            if (data.status === 'success') {
                if (data.already_subscribed) {
                    statusDiv.innerHTML = '<span style="color:#856404;">📧 You\'re already subscribed!</span>';
                } else {
                    statusDiv.innerHTML = '<span style="color:#28a745;">✅ Subscribed! Check your email for updates.</span>';
                    document.getElementById('emailInput').value = '';
                }
            } else {
                statusDiv.innerHTML = '<span style="color:#dc3545;">❌ Error: ' + (data.error || 'Failed to subscribe') + '</span>';
            }
        } catch(err) {
            console.error('Error subscribing:', err);
            statusDiv.innerHTML = '<span style="color:#dc3545;">❌ Network error. Please try again.</span>';
        }
    };

    window.initEmail = function() {
        console.log('Email list initialized');
    };
})();
