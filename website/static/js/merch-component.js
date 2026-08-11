// ============================================================
// merch-component.js - Merch & Gifts Tile
// ============================================================

var merchInitialized = false;
var lastGiftCardData = null;
var giftCardInitialized = false;

function initMerchComponent() {
    if (merchInitialized) return;
    merchInitialized = true;
    
    // Load merchandise
    loadMerchandise();
    
    // Initialize gift card functionality
    initGiftCardPage();
}

// ============================================================
// MERCHANDISE SECTION
// ============================================================

function loadMerchandise() {
    if (typeof loadAccessories === 'function') {
        loadAccessories();
    } else {
        console.warn('loadAccessories function not found.');
        var container = document.getElementById('catalogContainer');
        if (container) {
            container.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i><p>Merchandise store not available.</p></div>';
        }
    }
}

// ============================================================
// GIFT CARD SECTION
// ============================================================

function initGiftCardPage() {
    if (giftCardInitialized) return;
    giftCardInitialized = true;
    
    console.log('🎁 Initializing Gift Card page...');
    
    // Amount presets
    document.querySelectorAll('.amount-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.amount-btn').forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
            document.getElementById('gc-custom-amount').value = '';
        });
    });
    
    document.getElementById('gc-custom-amount').addEventListener('input', function() {
        if (this.value) {
            document.querySelectorAll('.amount-btn').forEach(function(b) { b.classList.remove('active'); });
        }
    });
    
    document.getElementById('gc-pay-btn').addEventListener('click', createGiftCardPayment);
    
    document.getElementById('gc-custom-amount').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') createGiftCardPayment();
    });
    
    // Balance check
    document.getElementById('gc-check-btn').addEventListener('click', checkGiftCardBalance);
    document.getElementById('gc-check-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') checkGiftCardBalance();
    });
    
    // Check for Square redirect
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    const transactionId = params.get('transactionId');
    
    if (orderId) {
        fetch(AppConfig.baseUrl + '/api/square/order-payment/' + orderId, { credentials: 'include' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.payment_id) {
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);
                    confirmPayment(data.payment_id, null);
                }
            })
            .catch(function(err) { console.error('Error:', err); });
    } else if (transactionId) {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        confirmPayment(transactionId, null);
    }
}

function getSelectedAmount() {
    let amount = 0;
    const activePreset = document.querySelector('.amount-btn.active');
    if (activePreset) {
        amount = parseFloat(activePreset.dataset.amount);
    }
    const customAmount = parseFloat(document.getElementById('gc-custom-amount').value);
    if (customAmount && customAmount > 0) {
        amount = customAmount;
    }
    return amount;
}

async function createGiftCardPayment() {
    const amount = getSelectedAmount();
    const recipient = document.getElementById('gc-recipient').value.trim();
    const sender = document.getElementById('gc-sender').value.trim();
    const message = document.getElementById('gc-message').value.trim();
    const statusEl = document.getElementById('gc-status');
    const btn = document.getElementById('gc-pay-btn');
    
    if (!amount || amount <= 0) {
        statusEl.textContent = '❌ Please select or enter a valid amount';
        statusEl.className = 'status-message error';
        return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating payment link...';
    statusEl.className = 'status-message';
    statusEl.style.display = 'none';
    
    try {
        const redirectUrl = window.location.origin + '/#merch';
        const apiUrl = AppConfig.baseUrl + '/api/square/create-payment-link';
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                amount: amount,
                purpose: 'gift_card',
                item_name: 'PigStyle Music Gift Card',
                redirect_url: redirectUrl,
                metadata: {
                    recipient: recipient,
                    sender: sender,
                    message: message
                }
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            statusEl.textContent = 'Redirecting to Square checkout...';
            statusEl.className = 'status-message info';
            window.location.href = data.checkout_url;
        } else {
            statusEl.textContent = '❌ ' + (data.error || 'Failed to create payment link');
            statusEl.className = 'status-message error';
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-credit-card"></i> Pay with Square';
        }
    } catch (err) {
        console.error('Payment error:', err);
        statusEl.textContent = '❌ Error: ' + err.message;
        statusEl.className = 'status-message error';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-credit-card"></i> Pay with Square';
    }
}

async function confirmPayment(paymentId, giftCardId) {
    const modal = document.getElementById('payment-modal');
    const loadingEl = document.getElementById('payment-loading');
    const resultEl = document.getElementById('payment-result');
    const errorEl = document.getElementById('payment-error');
    const statusEl = document.getElementById('payment-status');
    const errorMessageEl = document.getElementById('payment-error-message');
    
    modal.classList.add('active');
    loadingEl.style.display = 'block';
    resultEl.style.display = 'none';
    errorEl.style.display = 'none';
    statusEl.textContent = '⏳ Processing...';
    
    try {
        const metadataUrl = AppConfig.baseUrl + '/api/square/payment-metadata/' + paymentId;
        const metadataResponse = await fetch(metadataUrl, { credentials: 'include' });
        
        if (!metadataResponse.ok) {
            throw new Error('Metadata fetch failed: ' + metadataResponse.status);
        }
        
        const metadataData = await metadataResponse.json();
        
        const confirmUrl = AppConfig.baseUrl + '/api/payment/confirm';
        const confirmResponse = await fetch(confirmUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                payment_id: paymentId,
                metadata: metadataData.metadata || {},
                gift_card_id: giftCardId
            })
        });
        
        if (!confirmResponse.ok) {
            throw new Error('Confirmation failed: ' + confirmResponse.status);
        }
        
        const data = await confirmResponse.json();
        
        loadingEl.style.display = 'none';
        
        if (data.status === 'success' && data.purpose === 'gift_card') {
            lastGiftCardData = data;
            resultEl.style.display = 'block';
            statusEl.textContent = '✅ Gift Card Issued!';
            statusEl.style.color = 'white';
            
            document.getElementById('gift-card-amount').textContent = '$' + data.amount.toFixed(2);
            document.getElementById('gift-card-id').textContent = data.gift_card_id;
            
            const recipient = data.recipient || metadataData.metadata?.recipient || '';
            document.getElementById('gift-card-recipient').textContent = recipient ? 'For: ' + recipient : '';
            
            if (typeof JsBarcode !== 'undefined') {
                JsBarcode('#payment-barcode', data.gift_card_id, {
                    format: 'CODE128',
                    width: 2,
                    height: 80,
                    displayValue: true,
                    fontSize: 18,
                    font: 'monospace',
                    textAlign: 'center',
                    textPosition: 'bottom',
                    textMargin: 5,
                    background: '#ffffff',
                    lineColor: '#000000'
                });
            }
            
            document.getElementById('print-postcard-btn').style.display = 'inline-flex';
            document.getElementById('download-pdf-btn').style.display = 'inline-flex';
            
        } else {
            errorEl.style.display = 'block';
            errorMessageEl.textContent = data.error || 'Payment confirmation failed';
            statusEl.textContent = '❌ Payment Failed';
        }
    } catch (err) {
        console.error('Confirmation error:', err);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorMessageEl.textContent = err.message || 'Network error. Please contact the store.';
        statusEl.textContent = '❌ Error';
    }
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.remove('active');
    document.getElementById('payment-loading').style.display = 'block';
    document.getElementById('payment-result').style.display = 'none';
    document.getElementById('payment-error').style.display = 'none';
    document.getElementById('print-postcard-btn').style.display = 'none';
    document.getElementById('download-pdf-btn').style.display = 'none';
}

function generateGiftCardPostcard(giftCardId, amount, recipient, sender, message) {
    if (typeof window.jspdf === 'undefined') {
        console.warn('jsPDF not loaded. Using fallback.');
        return null;
    }
    
    const doc = new window.jspdf.jsPDF('landscape', 'mm', 'a6');
    const pageWidth = 148;
    const pageHeight = 105;
    
    doc.setFillColor(255, 248, 235);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    doc.setDrawColor(200, 180, 150);
    doc.setLineWidth(0.8);
    doc.rect(3, 3, pageWidth - 6, pageHeight - 6);
    doc.setDrawColor(220, 200, 170);
    doc.setLineWidth(0.3);
    doc.rect(6, 6, pageWidth - 12, pageHeight - 12);
    
    doc.setFontSize(24);
    doc.setTextColor(200, 50, 50);
    doc.setFont('helvetica', 'bold');
    doc.text('PIGSTYLE MUSIC', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('GIFT CARD', pageWidth / 2, 28, { align: 'center' });
    
    doc.setDrawColor(200, 180, 150);
    doc.setLineWidth(0.3);
    doc.line(30, 33, pageWidth - 30, 33);
    
    doc.setFontSize(30);
    doc.setTextColor(40, 167, 69);
    doc.setFont('helvetica', 'bold');
    doc.text('$' + amount.toFixed(2), pageWidth / 2, 52, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.setFont('helvetica', 'normal');
    if (recipient) {
        doc.text('For: ' + recipient, pageWidth / 2, 63, { align: 'center' });
    }
    if (sender) {
        doc.text('From: ' + sender, pageWidth / 2, 71, { align: 'center' });
    }
    
    let messageY = 79;
    if (message) {
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.setFont('helvetica', 'italic');
        const lines = doc.splitTextToSize('"' + message + '"', 120);
        let y = 79;
        lines.forEach(function(line) {
            doc.text(line, pageWidth / 2, y, { align: 'center' });
            y += 4.5;
        });
        messageY = y;
    } else {
        messageY = 79;
    }
    
    const barcodeY = message ? Math.min(messageY + 8, 88) : 85;
    
    if (typeof JsBarcode !== 'undefined') {
        const barcodeCanvas = document.createElement('canvas');
        barcodeCanvas.width = 400;
        barcodeCanvas.height = 100;
        JsBarcode(barcodeCanvas, giftCardId, {
            format: 'CODE128',
            width: 1.8,
            height: 50,
            displayValue: true,
            fontSize: 14,
            font: 'monospace',
            background: '#fff8eb',
            lineColor: '#000000',
            textAlign: 'center',
            textPosition: 'bottom',
            textMargin: 3
        });
        
        const barcodeDataUrl = barcodeCanvas.toDataURL('image/png');
        const barcodeWidth = 85;
        const barcodeHeight = (barcodeCanvas.height / barcodeCanvas.width) * barcodeWidth;
        const barcodeX = (pageWidth - barcodeWidth) / 2;
        doc.addImage(barcodeDataUrl, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeight);
        
        const footerY = barcodeY + barcodeHeight + 5;
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.setFont('helvetica', 'normal');
        doc.text('Scan at checkout to redeem. Not exchangeable for cash.', pageWidth / 2, footerY, { align: 'center' });
        
        doc.setFontSize(6);
        doc.setTextColor(180, 180, 180);
        doc.text('ID: ' + giftCardId, pageWidth / 2, footerY + 4, { align: 'center' });
    }
    
    return doc;
}

function downloadGiftCardPDF() {
    if (!lastGiftCardData) {
        alert('No gift card data available.');
        return;
    }
    try {
        const data = lastGiftCardData;
        const recipient = document.getElementById('gc-recipient').value.trim();
        const sender = document.getElementById('gc-sender').value.trim();
        const message = document.getElementById('gc-message').value.trim();
        const doc = generateGiftCardPostcard(
            data.gift_card_id,
            data.amount,
            recipient || data.recipient || '',
            sender || data.sender || '',
            message || data.message || ''
        );
        if (doc) {
            doc.save('gift-card-' + data.gift_card_id + '.pdf');
        } else {
            alert('Error generating PDF.');
        }
    } catch (err) {
        console.error('Download error:', err);
        alert('Error generating PDF: ' + err.message);
    }
}

function printGiftCardPostcard() {
    if (!lastGiftCardData) {
        alert('No gift card data available.');
        return;
    }
    try {
        const data = lastGiftCardData;
        const recipient = document.getElementById('gc-recipient').value.trim();
        const sender = document.getElementById('gc-sender').value.trim();
        const message = document.getElementById('gc-message').value.trim();
        const doc = generateGiftCardPostcard(
            data.gift_card_id,
            data.amount,
            recipient || data.recipient || '',
            sender || data.sender || '',
            message || data.message || ''
        );
        if (doc) {
            const pdfBlob = doc.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            const printWindow = window.open(pdfUrl);
            if (printWindow) {
                printWindow.onload = function() {
                    printWindow.print();
                };
            } else {
                doc.save('gift-card-' + data.gift_card_id + '.pdf');
                alert('Please open the downloaded PDF and print it.');
            }
        } else {
            alert('Error generating PDF for printing.');
        }
    } catch (err) {
        console.error('Print error:', err);
        alert('Error generating PDF for printing: ' + err.message);
    }
}

async function checkGiftCardBalance() {
    const input = document.getElementById('gc-check-input');
    const resultDiv = document.getElementById('gc-balance-result');
    
    if (!input || !resultDiv) return;
    
    const code = input.value.trim().toUpperCase();
    if (!code) {
        resultDiv.textContent = '⚠️ Please enter a gift card code';
        resultDiv.className = 'balance-result show';
        resultDiv.style.color = '#ffc107';
        return;
    }
    
    const giftCode = code.startsWith('GIFT-') ? code : 'GIFT-' + code;
    
    try {
        const response = await fetch(AppConfig.baseUrl + '/api/debtor/lookup', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: giftCode })
        });
        
        const data = await response.json();
        
        resultDiv.className = 'balance-result show';
        
        if (data.status === 'success' && data.balance !== undefined) {
            const balance = data.balance || 0;
            const isActive = balance > 0;
            
            resultDiv.innerHTML = '<div style="font-size: 14px; color: #ccc;">' +
                '<strong>' + giftCode + '</strong><br>' +
                'Balance: <span style="color: ' + (isActive ? '#4caf50' : '#dc3545') + '; font-weight: bold;">$' + balance.toFixed(2) + '</span><br>' +
                '<span style="font-size: 12px; color: #666;">' + (isActive ? '✅ Active' : '⚠️ No balance') + '</span>' +
                '</div>';
            resultDiv.style.background = isActive ? 'rgba(40,167,69,0.1)' : 'rgba(220,53,69,0.1)';
        } else {
            resultDiv.textContent = '⚠️ Gift card not found: ' + giftCode;
            resultDiv.style.background = 'rgba(220,53,69,0.1)';
        }
    } catch (error) {
        console.error('Error checking gift card:', error);
        resultDiv.textContent = '❌ Error checking balance';
        resultDiv.className = 'balance-result show';
        resultDiv.style.background = 'rgba(220,53,69,0.1)';
    }
}