// ============================================================
// gift-cards.js – Gift Card Management (Uses Debtor System)
// ============================================================

/**
 * Check a gift card balance
 * Uses the debtor lookup API
 */
async function checkGiftCardBalance() {
    const codeInput = document.getElementById('gc-check-code');
    const resultDiv = document.getElementById('gc-balance-result');
    
    if (!codeInput || !resultDiv) return;
    
    const code = codeInput.value.trim().toUpperCase();
    if (!code) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '⚠️ Please enter a gift card code';
        resultDiv.style.background = 'rgba(255,193,7,0.3)';
        return;
    }
    
    // Ensure code starts with GIFT-
    const giftCode = code.startsWith('GIFT-') ? code : 'GIFT-' + code;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/debtor/lookup`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: giftCode })
        });
        
        const data = await response.json();
        
        resultDiv.style.display = 'block';
        
        if (data.status === 'success' && data.balance !== undefined) {
            const balance = data.balance || 0;
            const isActive = balance > 0;
            
            resultDiv.innerHTML = `
                <div style="font-size: 14px; color: #333;">
                    <strong>${giftCode}</strong>
                    <br>
                    Balance: <span style="color: ${isActive ? '#28a745' : '#dc3545'}; font-weight: bold;">$${balance.toFixed(2)}</span>
                    <br>
                    <span style="font-size: 12px; color: #666;">${isActive ? '✅ Active' : '⚠️ No balance'}</span>
                </div>
            `;
            resultDiv.style.background = isActive ? 'rgba(40,167,69,0.15)' : 'rgba(220,53,69,0.15)';
        } else {
            resultDiv.innerHTML = `⚠️ Gift card not found: ${giftCode}`;
            resultDiv.style.background = 'rgba(220,53,69,0.15)';
        }
    } catch (error) {
        console.error('Error checking gift card:', error);
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '❌ Error checking balance';
        resultDiv.style.background = 'rgba(220,53,69,0.15)';
    }
}

/**
 * Check gift card for payment (during checkout)
 * Uses the debtor lookup API
 */
async function checkGiftCardForPayment() {
    const codeInput = document.getElementById('giftcard-code');
    const infoDiv = document.getElementById('giftcard-info');
    const balanceDisplay = document.getElementById('giftcard-balance-display');
    const idDisplay = document.getElementById('giftcard-id-display');
    const applySection = document.getElementById('giftcard-apply-section');
    const resultDiv = document.getElementById('giftcard-result');
    
    if (!codeInput) return;
    
    const code = codeInput.value.trim().toUpperCase();
    if (!code) {
        showGiftCardResult('Please enter a gift card code.', 'error');
        return;
    }
    
    // Ensure code starts with GIFT-
    const giftCode = code.startsWith('GIFT-') ? code : 'GIFT-' + code;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/debtor/lookup`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: giftCode })
        });
        
        const data = await response.json();
        
        if (data.status === 'success' && data.balance !== undefined) {
            const balance = data.balance || 0;
            
            if (balance <= 0) {
                showGiftCardResult(`❌ Gift card ${giftCode} has no balance.`, 'error');
                return;
            }
            
            // Show gift card info
            infoDiv.style.display = 'block';
            idDisplay.textContent = giftCode;
            balanceDisplay.textContent = '$' + balance.toFixed(2);
            
            // Show apply section
            applySection.style.display = 'block';
            document.getElementById('giftcard-amount').value = balance.toFixed(2);
            
            // Store the gift card data for later use
            window._giftCardData = {
                code: giftCode,
                balance: balance
            };
            
            resultDiv.style.display = 'none';
            
        } else {
            showGiftCardResult(`❌ Gift card not found: ${giftCode}`, 'error');
        }
    } catch (error) {
        console.error('Error checking gift card:', error);
        showGiftCardResult('❌ Error checking gift card: ' + error.message, 'error');
    }
}

function showGiftCardResult(message, type) {
    const resultDiv = document.getElementById('giftcard-result');
    if (!resultDiv) return;
    
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = message;
    resultDiv.className = 'status-message status-' + type;
}

/**
 * Apply gift card to cart (during checkout)
 */
async function applyGiftCardToCart() {
    const amountInput = document.getElementById('giftcard-amount');
    const resultDiv = document.getElementById('giftcard-result');
    const giftCardData = window._giftCardData;
    
    if (!giftCardData) {
        showGiftCardResult('Please check a gift card first.', 'error');
        return;
    }
    
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) {
        showGiftCardResult('Please enter a valid amount.', 'error');
        return;
    }
    
    if (amount > giftCardData.balance) {
        showGiftCardResult(`❌ Amount exceeds balance. Available: $${giftCardData.balance.toFixed(2)}`, 'error');
        return;
    }
    
    // Add payment entry to checkout
    if (typeof addPaymentEntry === 'function') {
        addPaymentEntry('Gift Card', amount);
    } else {
        showGiftCardResult('❌ Checkout not initialized.', 'error');
        return;
    }
    
    // Close the gift card modal
    closeGiftCardModal();
    
    if (typeof showToast === 'function') {
        showToast(`✅ Applied $${amount.toFixed(2)} from gift card ${giftCardData.code}`, 'success');
    }
}

function setGiftCardAmount(type) {
    const amountInput = document.getElementById('giftcard-amount');
    const giftCardData = window._giftCardData;
    
    if (!giftCardData || !amountInput) return;
    
    if (type === 'full') {
        amountInput.value = giftCardData.balance.toFixed(2);
    } else if (type === 'half') {
        amountInput.value = (giftCardData.balance / 2).toFixed(2);
    }
}

function closeGiftCardModal() {
    const modal = document.getElementById('giftcard-modal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// CREATE GIFT CARD (Admin Only - In Store)
// ============================================================

async function createGiftCard() {
    const amount = parseFloat(document.getElementById('gc-amount')?.value || '0');
    const recipient = document.getElementById('gc-recipient')?.value?.trim() || '';
    const statusEl = document.getElementById('gc-status');
    
    if (!amount || amount <= 0) {
        if (statusEl) {
            statusEl.textContent = '❌ Please enter a valid amount';
            statusEl.style.color = '#dc3545';
        }
        return;
    }
    
    if (statusEl) {
        statusEl.textContent = '⏳ Creating gift card...';
        statusEl.style.color = '#666';
    }
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/gift-card/create`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: amount,
                payment_method: 'cash',
                recipient: recipient
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            if (statusEl) {
                const recipientDisplay = recipient || 'Bearer';
                statusEl.textContent = `✅ Gift card ${data.gift_card_id} created for ${recipientDisplay} - $${amount.toFixed(2)}`;
                statusEl.style.color = '#28a745';
            }
            
            // Generate and print the gift card postcard
            if (typeof generateGiftCardPostcard === 'function') {
                const doc = generateGiftCardPostcard(
                    data.gift_card_id,
                    data.amount,
                    recipient || '',
                    '',
                    ''
                );
                doc.save(`gift-card-${data.gift_card_id}.pdf`);
            } else {
                // Fallback: show alert
                const recipientDisplay = recipient || 'Bearer';
                alert(`Gift card created: ${data.gift_card_id}\nRecipient: ${recipientDisplay}\nAmount: $${data.amount.toFixed(2)}`);
            }
            
            document.getElementById('gc-amount').value = '';
            document.getElementById('gc-recipient').value = '';
            if (typeof loadCreditorsList === 'function') loadCreditorsList();
            if (typeof loadTotalOwed === 'function') loadTotalOwed();
            
        } else {
            if (statusEl) {
                statusEl.textContent = '❌ ' + (data.error || 'Failed to create gift card');
                statusEl.style.color = '#dc3545';
            }
        }
    } catch (error) {
        console.error('Error creating gift card:', error);
        if (statusEl) {
            statusEl.textContent = '❌ Error: ' + error.message;
            statusEl.style.color = '#dc3545';
        }
    }
}