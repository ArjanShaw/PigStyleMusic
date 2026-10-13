// Order page - record request form
(function() {
    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    window.createOrder = async function() {
        const contact = document.getElementById('orderContact').value.trim();
        const artist = document.getElementById('orderArtist').value.trim();
        const title = document.getElementById('orderTitle').value.trim();
        const format = document.getElementById('orderFormat').value;
        const statusDiv = document.getElementById('orderStatus');

        if (!contact) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter your email or phone number</span>';
            return;
        }

        const isEmail = contact.includes('@') && contact.includes('.');
        const isPhone = /^[\d\s\-\(\)\+\.]{7,}$/.test(contact);

        if (!isEmail && !isPhone) {
            statusDiv.innerHTML = '<span style="color:#dc3545;">⚠️ Please enter a valid email or phone number</span>';
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
            const response = await fetch(`${API_BASE}/api/record-orders`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contact: contact,
                    artist: artist,
                    title: title,
                    format: format || null
                })
            });

            const data = await response.json();
            console.log('Order response:', data);

            if (data.status === 'success') {
                statusDiv.innerHTML = '<span style="color:#28a745;">✅ Order request placed! We\'ll notify you when it arrives.</span>';
                document.getElementById('orderContact').value = '';
                document.getElementById('orderArtist').value = '';
                document.getElementById('orderTitle').value = '';
                document.getElementById('orderFormat').value = '';
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