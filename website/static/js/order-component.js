// ============================================================
// order-component.js - Order Records Tile (Order Mode)
// ============================================================

var orderInitialized = false;

function initOrderComponent() {
    if (orderInitialized) return;
    orderInitialized = true;
    
    setupOrderForm();
}

function setupOrderForm() {
    const form = document.getElementById('orderForm');
    if (!form) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        handleOrderSubmit();
    });
}

async function handleOrderSubmit() {
    const email = document.getElementById('orderEmail').value.trim();
    const artist = document.getElementById('orderArtist').value.trim();
    const title = document.getElementById('orderTitle').value.trim();
    const statusEl = document.getElementById('orderStatus');
    const submitBtn = document.getElementById('orderSubmitBtn');
    
    // Validate email
    if (!email || !email.includes('@') || !email.includes('.')) {
        showOrderStatus('Please enter a valid email address.', 'error');
        return;
    }
    
    // Validate artist
    if (!artist) {
        showOrderStatus('Please enter the artist name.', 'error');
        return;
    }
    
    // Validate title (required for order mode)
    if (!title) {
        showOrderStatus('Please enter the record title.', 'error');
        return;
    }
    
    // Build payload
    const payload = {
        email: email,
        artist: artist,
        title: title
    };
    
    // Disable button
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    
    try {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const apiUrl = isLocalhost 
            ? window.AppConfig ? window.AppConfig.baseUrl + '/api/record-orders' : 'http://localhost:5000/api/record-orders'
            : 'https://' + window.location.hostname + '/api/record-orders';
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok && data.status === 'success') {
            showOrderStatus('✅ Order request placed successfully! 💡 We\'ll contact you when this record arrives.', 'success');
            
            // Reset form
            document.getElementById('orderEmail').value = '';
            document.getElementById('orderArtist').value = '';
            document.getElementById('orderTitle').value = '';
        } else {
            showOrderStatus(data.error || '❌ Failed to place order. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Submit error:', error);
        showOrderStatus('Network error. Please try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-box"></i> Place Order Request';
    }
}

function showOrderStatus(message, type) {
    const statusEl = document.getElementById('orderStatus');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = 'order-status ' + type;
    statusEl.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(function() {
            statusEl.style.display = 'none';
        }, 6000);
    }
}