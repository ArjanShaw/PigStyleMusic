// Email List page
(function() {
    // FIXED: Add API_BASE detection
    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

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
            // FIXED: Use full API URL with API_BASE
            const response = await fetch(`${API_BASE}/api/email-list/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response:', text.substring(0, 200));
                throw new Error('Server returned non-JSON response');
            }
            
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
            if (err.message.includes('404')) {
                statusDiv.innerHTML = '<span style="color:#dc3545;">❌ Server endpoint not found. Please try again later.</span>';
            } else {
                statusDiv.innerHTML = '<span style="color:#dc3545;">❌ Network error. Please try again.</span>';
            }
        }
    };

    window.initEmail = function() {
        console.log('Email list initialized with API_BASE:', API_BASE);
    };
})();