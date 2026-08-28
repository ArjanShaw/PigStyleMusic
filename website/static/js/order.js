// Order page - record request form
(function() {
    window.createOrder = async function() {
        const email = document.getElementById('orderEmail').value.trim();
        const artist = document.getElementById('orderArtist').value.trim();
        const title = document.getElementById('orderTitle').value.trim();
        const statusDiv = document.getElementById('orderStatus');
        
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
        if (!title) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter an album title</span>';
            return;
        }
        
        statusDiv.innerHTML = '<span style="color:#666;">⏳ Submitting request...</span>';
        
        try {
            const response = await fetch('/api/record-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: email,
                    artist: artist,
                    title: title
                })
            });
            
            const data = await response.json();
            console.log('Order response:', data);
            
            if (data.status === 'success') {
                statusDiv.innerHTML = '<span style="color:#28a745;">✅ Order request placed! We\'ll notify you when it arrives.</span>';
                document.getElementById('orderEmail').value = '';
                document.getElementById('orderArtist').value = '';
                document.getElementById('orderTitle').value = '';
            } else {
                statusDiv.innerHTML = '<span style="color:#dc3545;">❌ Error: ' + (data.error || 'Failed to place order') + '</span>';
            }
        } catch(err) {
            console.error('Error creating order:', err);
            statusDiv.innerHTML = '<span style="color:#dc3545;">❌ Network error. Please try again.</span>';
        }
    };

    window.initOrder = function() {
        console.log('Order initialized');
    };
})();
