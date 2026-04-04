// ============================================================================
// gift-cards.js - Gift Card Management Functions
// ============================================================================

// Create a new gift card
window.createGiftCard = async function() {
    const amountInput = document.getElementById('gc-amount');
    if (!amountInput) return;
    
    const amount = parseFloat(amountInput.value);
    
    if (isNaN(amount) || amount <= 0) {
        showGiftCardStatus('Please enter a valid amount', 'error');
        return;
    }
    
    const statusEl = document.getElementById('checkout-status-message') || document.getElementById('discogs-status-message');
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/gift-cards`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ amount: amount })
        });
        
        const data = await response.json();
        
        if (data.success) {
            await printGiftCard(data.card);
            showGiftCardStatus(`Gift card ${data.card.id} created: $${data.card.balance.toFixed(2)}`, 'success');
            
            // Clear the amount input to default
            if (amountInput) amountInput.value = '25';
        } else {
            throw new Error(data.error || 'Failed to create gift card');
        }
    } catch (error) {
        console.error('Error creating gift card:', error);
        showGiftCardStatus(`Error: ${error.message}`, 'error');
    }
};

// Print gift card as PDF
async function printGiftCard(card) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    
    // Load and add logo
    const logoUrl = '/static/images/PigStyle.png';
    try {
        const logoImg = await loadImage(logoUrl);
        doc.addImage(logoImg, 'PNG', 215, 40, 100, 100);
    } catch (error) {
        console.warn('Could not load logo:', error);
        // Add text fallback
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('PIGSTYLE MUSIC', 255, 80, { align: 'center' });
    }
    
    // Add title
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('GIFT CARD', 255, 160, { align: 'center' });
    
    // Generate barcode
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, card.id, {
        format: 'CODE128',
        displayValue: true,
        fontSize: 14,
        textMargin: 5,
        height: 50
    });
    const barcodeImg = canvas.toDataURL('image/png');
    doc.addImage(barcodeImg, 'PNG', 155, 190, 200, 60);
    
    // Add amount
    doc.setFontSize(36);
    doc.setFont('helvetica', 'bold');
    doc.text(`$${card.balance.toFixed(2)}`, 255, 290, { align: 'center' });
    
    // Add footer
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('pigstylemusic.com', 255, 330, { align: 'center' });
    
    // Add small instruction text
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Present this card at checkout or enter code online', 255, 360, { align: 'center' });
    
    // Open PDF in new window for printing
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
}

// Check gift card balance
window.checkGiftCardBalance = async function() {
    const codeInput = document.getElementById('gc-check-code');
    const resultDiv = document.getElementById('gc-balance-result');
    
    if (!codeInput || !resultDiv) return;
    
    const code = codeInput.value.trim();
    
    if (!code) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<span style="color: #ffc107;">Please enter a gift card code</span>';
        return;
    }
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/gift-cards/${encodeURIComponent(code)}`, {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        resultDiv.style.display = 'block';
        if (data.success && data.card) {
            resultDiv.innerHTML = `
                <div style="text-align: center;">
                    <div style="font-size: 14px; margin-bottom: 5px;">Gift Card: ${escapeHtml(data.card.id)}</div>
                    <div style="font-size: 28px; font-weight: bold; color: #ffd700;">$${data.card.balance.toFixed(2)}</div>
                    <div style="font-size: 11px; opacity: 0.8;">Created: ${new Date(data.card.created_at).toLocaleDateString()}</div>
                </div>
            `;
        } else {
            resultDiv.innerHTML = '<span style="color: #dc3545;">Gift card not found</span>';
        }
    } catch (error) {
        console.error('Error checking balance:', error);
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `<span style="color: #dc3545;">Error: ${error.message}</span>`;
    }
};

// Helper function to load image
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = url;
    });
}

// Helper function to show status messages
function showGiftCardStatus(message, type) {
    // Try to use existing status message element
    let statusEl = document.getElementById('checkout-status-message');
    if (!statusEl) {
        statusEl = document.getElementById('discogs-status-message');
    }
    if (!statusEl) {
        // Create temporary status element
        statusEl = document.createElement('div');
        statusEl.className = 'status-message';
        const container = document.querySelector('.gift-card-section');
        if (container) {
            container.appendChild(statusEl);
        }
    }
    
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-message status-${type}`;
        statusEl.style.display = 'block';
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    } else {
        // Fallback to alert for critical errors
        if (type === 'error') {
            alert(message);
        } else {
            console.log(message);
        }
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Quick preset amount buttons
window.setGiftCardAmount = function(amount) {
    const amountInput = document.getElementById('gc-amount');
    if (amountInput) {
        amountInput.value = amount;
    }
};

// Initialize gift card section when tab is shown
document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'admin-config') {
        // Gift card section is already in the DOM, nothing to initialize
        console.log('Admin Config tab shown - gift card section ready');
    }
});

console.log('✅ gift-cards.js loaded');