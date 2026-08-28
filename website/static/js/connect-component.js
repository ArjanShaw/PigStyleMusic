// ============================================================
// connect-component.js - Connect Tile (Contact Form)
// ============================================================

var connectInitialized = false;

function initConnectComponent() {
    if (connectInitialized) return;
    connectInitialized = true;
    
    setupConnectForm();
}

function setupConnectForm() {
    const feedbackForm = document.getElementById('connectForm');
    const feedbackContent = document.getElementById('connectFeedback');
    const messageDiv = document.getElementById('connectMessage');
    const nameInput = document.getElementById('connectName');
    const contactInfoInput = document.getElementById('connectContact');
    
    if (!feedbackForm) return;
    
    function getCombinedContactInfo() {
        const name = nameInput ? nameInput.value.trim() : '';
        const contact = contactInfoInput ? contactInfoInput.value.trim() : '';
        
        if (name && contact) {
            return name + ' | ' + contact;
        } else if (name) {
            return name;
        } else if (contact) {
            return contact;
        }
        return '';
    }
    
    feedbackForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (messageDiv) {
            messageDiv.className = 'message';
            messageDiv.style.display = 'none';
        }
        
        const content = feedbackContent ? feedbackContent.value.trim() : '';
        const combinedContactInfo = getCombinedContactInfo();
        
        if (!content) {
            showConnectMessage('Please enter your message', 'error');
            return;
        }
        
        const payload = {
            type_of_feedback: 'general',
            content: content,
            contact_info: combinedContactInfo
        };
        
        try {
            const isLocalhost = window.location.hostname === 'localhost' || 
                              window.location.hostname === '127.0.0.1';
            const apiUrl = isLocalhost 
                ? window.AppConfig ? window.AppConfig.baseUrl + '/api/feedback' : 'http://localhost:5000/api/feedback'
                : 'https://' + window.location.hostname + '/api/feedback';
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                showConnectMessage('Thank you for your message!', 'success');
                feedbackForm.reset();
            } else {
                showConnectMessage('Error: ' + (result.error || 'Something went wrong'), 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showConnectMessage('Network error. Please try again.', 'error');
        }
    });
}

function showConnectMessage(text, type) {
    const messageDiv = document.getElementById('connectMessage');
    if (!messageDiv) return;
    
    messageDiv.textContent = text;
    messageDiv.className = 'message ' + type;
    messageDiv.style.display = 'block';
    setTimeout(function() {
        messageDiv.style.display = 'none';
    }, 5000);
}