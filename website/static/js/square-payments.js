// Square Payments Integration
const SquarePayments = (function() {
    let squareSdk = null;
    let cardPayment = null;
    let applicationId = null;
    let locationId = null;
    
    // Load Square SDK - Production only
    async function loadSquareSdk() {
        return new Promise((resolve, reject) => {
            if (window.Square) {
                resolve(window.Square);
                return;
            }
            
            // ALWAYS use production SDK URL
            const sdkUrl = 'https://web.squarecdn.com/v1/square.js';
            
            const script = document.createElement('script');
            script.src = sdkUrl;
            script.onload = () => resolve(window.Square);
            script.onerror = () => reject(new Error('Failed to load Square SDK'));
            document.head.appendChild(script);
        });
    }
    
    // Initialize payment form
    async function initializePaymentForm(config) {
        const { amount, recordId, recordTitle, shippingAddress, onSuccess, onError } = config;
        
        try {
            // Get Square configuration from server
            const configResponse = await fetch(`${AppConfig.baseUrl}/config/square`);
            const configData = await configResponse.json();
            
            if (configData.status !== 'success') {
                throw new Error('Failed to load Square configuration');
            }
            
            applicationId = configData.application_id;
            locationId = configData.location_id;
            
            console.log('Square configured for PRODUCTION environment');
            console.log('App ID:', applicationId);
            console.log('Location ID:', locationId);
            
            // Load Square SDK
            squareSdk = await loadSquareSdk();
            
            // Initialize payments object
            const payments = squareSdk.payments(applicationId, locationId);
            
            // Create card payment form
            const card = await payments.card();
            await card.attach('#square-payment-form');
            
            // Add pay button
            const formDiv = document.getElementById('square-payment-form');
            
            // Clear any existing button
            const existingButton = document.getElementById('square-pay-button');
            if (existingButton) {
                existingButton.remove();
            }
            
            const payButton = document.createElement('button');
            payButton.id = 'square-pay-button';
            payButton.className = 'square-pay-button';
            payButton.textContent = `Pay $${amount.toFixed(2)}`;
            payButton.style.cssText = `
                width: 100%;
                padding: 12px;
                background: #28a745;
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                margin-top: 10px;
            `;
            formDiv.appendChild(payButton);
            
            // Handle payment
            payButton.addEventListener('click', async (e) => {
                e.preventDefault();
                
                try {
                    // Validate shipping address
                    const name = shippingAddress.name?.value;
                    const address = shippingAddress.addressLine1?.value;
                    const city = shippingAddress.city?.value;
                    const state = shippingAddress.state?.value;
                    const zip = shippingAddress.zip?.value;
                    
                    if (!name || !address || !city || !state || !zip) {
                        onError('Please fill in all shipping fields');
                        return;
                    }
                    
                    payButton.disabled = true;
                    payButton.textContent = 'Processing...';
                    
                    // Tokenize payment method
                    const tokenResult = await card.tokenize();
                    
                    if (tokenResult.status === 'OK') {
                        // Send payment to server
                        const paymentResponse = await fetch(`${AppConfig.baseUrl}/api/square/online-payment`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                token: tokenResult.token,
                                amount: amount,
                                record_id: recordId,
                                record_title: recordTitle,
                                shipping_address: {
                                    name: name,
                                    address_line1: address,
                                    city: city,
                                    state: state,
                                    zip: zip
                                }
                            })
                        });
                        
                        const result = await paymentResponse.json();
                        
                        if (result.status === 'success') {
                            onSuccess(result);
                        } else {
                            onError(result.error || 'Payment failed');
                            payButton.disabled = false;
                            payButton.textContent = `Pay $${amount.toFixed(2)}`;
                        }
                    } else {
                        onError('Payment tokenization failed: ' + (tokenResult.errors || []).map(e => e.message).join(', '));
                        payButton.disabled = false;
                        payButton.textContent = `Pay $${amount.toFixed(2)}`;
                    }
                } catch (error) {
                    console.error('Payment error:', error);
                    onError(error.message);
                    payButton.disabled = false;
                    payButton.textContent = `Pay $${amount.toFixed(2)}`;
                }
            });
            
        } catch (error) {
            console.error('Square initialization error:', error);
            onError(error.message);
        }
    }
    
    return {
        initializePaymentForm
    };
})();

// Make globally available
window.SquarePayments = SquarePayments;