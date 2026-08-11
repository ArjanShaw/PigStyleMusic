// ============================================================
// alerts-component.js - Record Alerts Tile (Alert Mode)
// ============================================================

var alertsInitialized = false;

function initAlertsComponent() {
    if (alertsInitialized) return;
    alertsInitialized = true;
    
    setupAlertForm();
}

function setupAlertForm() {
    const form = document.getElementById('alertsForm');
    if (!form) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        handleAlertSubmit();
    });
}

async function handleAlertSubmit() {
    const email = document.getElementById('alertsEmail').value.trim();
    const artist = document.getElementById('alertsArtist').value.trim();
    const title = document.getElementById('alertsTitle').value.trim();
    const statusEl = document.getElementById('alertsStatus');
    const submitBtn = document.getElementById('alertsSubmitBtn');
    
    // Validate email
    if (!email || !email.includes('@') || !email.includes('.')) {
        showAlertStatus('Please enter a valid email address.', 'error');
        return;
    }
    
    // Validate artist
    if (!artist) {
        showAlertStatus('Please enter the artist name.', 'error');
        return;
    }
    
    // Build payload
    const payload = {
        email: email,
        artist: artist,
        title: title || null
    };
    
    // Disable button
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    
    try {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const apiUrl = isLocalhost 
            ? 'http://localhost:5000/api/subscribe'
            : 'https://' + window.location.hostname + '/api/subscribe';
        
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
            showAlertStatus('✅ Subscription created successfully! 💡 You\'ll receive an email when matching records arrive.', 'success');
            
            // Reset form
            document.getElementById('alertsEmail').value = '';
            document.getElementById('alertsArtist').value = '';
            document.getElementById('alertsTitle').value = '';
            
            // Refresh notification bell
            if (typeof checkNotifications === 'function') {
                setTimeout(checkNotifications, 1000);
            }
        } else {
            showAlertStatus(data.error || '❌ Failed to subscribe. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Submit error:', error);
        showAlertStatus('Network error. Please try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-bell"></i> Subscribe';
    }
}

function showAlertStatus(message, type) {
    const statusEl = document.getElementById('alertsStatus');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    statusEl.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(function() {
            statusEl.style.display = 'none';
        }, 6000);
    }
}