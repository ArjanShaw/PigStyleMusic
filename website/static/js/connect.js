// Connect page - contact form
(function() {
    window.sendConnectMessage = async function() {
        const name = document.getElementById('connectName').value.trim();
        const email = document.getElementById('connectEmail').value.trim();
        const message = document.getElementById('connectMessage').value.trim();
        const statusDiv = document.getElementById('connectStatus');
        
        if (!name) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter your name</span>';
            return;
        }
        if (!email) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter your email</span>';
            return;
        }
        if (!email.includes('@') || !email.includes('.')) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter a valid email</span>';
            return;
        }
        if (!message) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter a message</span>';
            return;
        }
        
        statusDiv.innerHTML = '<span style="color:#666;">⏳ Sending...</span>';
        
        try {
            const response = await fetch('http://localhost:5000/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: name,
                    email: email,
                    content: message,
                    type_of_feedback: 'general'
                })
            });
            
            const data = await response.json();
            console.log('Feedback response:', data);
            
            if (data.status === 'success') {
                statusDiv.innerHTML = '<span style="color:#28a745;">✅ Message sent! Thank you for reaching out.</span>';
                document.getElementById('connectName').value = '';
                document.getElementById('connectEmail').value = '';
                document.getElementById('connectMessage').value = '';
            } else {
                statusDiv.innerHTML = '<span style="color:#dc3545;">❌ Error: ' + (data.error || 'Failed to send message') + '</span>';
            }
        } catch(err) {
            console.error('Error sending message:', err);
            statusDiv.innerHTML = '<span style="color:#dc3545;">❌ Network error. Please try again.</span>';
        }
    };

    window.initConnect = function() {
        console.log('Connect initialized');
    };
})();
