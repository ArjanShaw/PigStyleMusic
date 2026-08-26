// Alerts page - subscription form
(function() {
    window.createAlert = async function() {
        const email = document.getElementById('alertEmail').value.trim();
        const artist = document.getElementById('alertArtist').value.trim();
        const title = document.getElementById('alertTitle').value.trim();
        const statusDiv = document.getElementById('alertStatus');
        
        if (!email) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter your email</span>';
            return;
        }
        if (!email.includes('@') || !email.includes('.')) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter a valid email</span>';
            return;
        }
        if (!artist) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter an artist name</span>';
            return;
        }
        
        statusDiv.innerHTML = '<span style="color:#666;">⏳ Subscribing...</span>';
        
        try {
            const response = await fetch('http://localhost:5000/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: email,
                    artist: artist,
                    title: title || undefined
                })
            });
            
            const data = await response.json();
            console.log('Alert response:', data);
            
            if (data.status === 'success') {
                statusDiv.innerHTML = '<span style="color:#28a745;">✅ Subscribed! You\'ll be notified when records arrive.</span>';
                document.getElementById('alertEmail').value = '';
                document.getElementById('alertArtist').value = '';
                document.getElementById('alertTitle').value = '';
            } else {
                statusDiv.innerHTML = '<span style="color:#dc3545;">❌ Error: ' + (data.error || 'Failed to subscribe') + '</span>';
            }
        } catch(err) {
            console.error('Error creating alert:', err);
            statusDiv.innerHTML = '<span style="color:#dc3545;">❌ Network error. Please try again.</span>';
        }
    };

    window.initAlerts = function() {
        console.log('Alerts initialized');
    };
})();
