// ============================================================
// merch-component.js - Merch & Gifts Tile
// ============================================================

var merchInitialized = false;
var lastGiftCardData = null;
var giftCardInitialized = false;
var teeExpanded = false;
var giftCardExpanded = false;

function initMerchComponent() {
    if (merchInitialized) return;
    merchInitialized = true;
    
    // Load merchandise (only Tees, Stickers, Gift Cards)
    loadMerchandise();
    
    // Initialize gift card functionality
    initGiftCardPage();
    
    // Initialize tee functionality
    initTeePage();
}

// ============================================================
// MERCHANDISE SECTION - Only Tees, Stickers, Gift Cards
// ============================================================

function loadMerchandise() {
    // Instead of using the full merchandise store, we'll render just the 3 items
    renderMerchItems();
}

function renderMerchItems() {
    var container = document.getElementById('catalogContainer');
    if (!container) return;
    
    // Create gallery with 3 items: Tee, Sticker, Gift Card
    var gallery = document.createElement('div');
    gallery.className = 'merch-gallery';
    
    // 1. Tee Card
    var teeCard = document.createElement('div');
    teeCard.className = 'merch-card';
    teeCard.setAttribute('onclick', 'toggleTeeCard()');
    teeCard.innerHTML = `
        <div class="merch-image">
            <img src="/static/images/tee-black.png" alt="PigStyle T-Shirt" onerror="this.parentElement.classList.add('default-merch-bg'); this.style.display='none';">
        </div>
        <div class="merch-info">
            <h3>PigStyle T-Shirt</h3>
            <div class="merch-price">$24.99</div>
        </div>
    `;
    gallery.appendChild(teeCard);
    
    // 2. Sticker Card
    var stickerCard = document.createElement('div');
    stickerCard.className = 'merch-card sticker-tile';
    stickerCard.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <span class="sticker-icon"><i class="fas fa-sticky-note"></i></span>
            <div class="sticker-label">Sticker</div>
            <div style="color:rgba(255,255,255,0.7); font-size:0.9rem; margin-top:5px;">$4.99</div>
        </div>
    `;
    gallery.appendChild(stickerCard);
    
    // 3. Gift Card Tile
    var giftCard = document.createElement('div');
    giftCard.className = 'merch-card gift-card-tile';
    giftCard.setAttribute('onclick', 'toggleGiftCard()');
    giftCard.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <span class="gift-card-icon"><i class="fas fa-gift"></i></span>
            <div class="gift-card-label">Gift Cards</div>
        </div>
    `;
    gallery.appendChild(giftCard);
    
    container.innerHTML = '';
    container.appendChild(gallery);
    
    // Add Tee Expanded View
    addTeeExpandedView(container);
    
    // Add Gift Card Expanded View
    addGiftCardExpandedView(container);
}

function addTeeExpandedView(container) {
    var teeExpanded = document.createElement('div');
    teeExpanded.className = 'merch-expanded';
    teeExpanded.id = 'teeExpanded';
    teeExpanded.innerHTML = `
        <div class="section-title"><i class="fas fa-tshirt"></i> PigStyle T-Shirt</div>
        <img src="/static/images/tee-black.png" alt="T-Shirt" class="tee-image" id="teeImage">
        <div class="form-group">
            <label>Color</label>
            <div class="color-options">
                <button class="color-btn black active" data-color="black" onclick="selectTeeColor('black')" title="Black"></button>
                <button class="color-btn yellow" data-color="yellow" onclick="selectTeeColor('yellow')" title="Yellow"></button>
                <button class="color-btn purple" data-color="purple" onclick="selectTeeColor('purple')" title="Purple"></button>
            </div>
        </div>
        <div class="form-group">
            <label for="teeSize">Size</label>
            <select id="teeSize">
                <option value="S">Small (S)</option>
                <option value="M" selected>Medium (M)</option>
                <option value="L">Large (L)</option>
                <option value="XL">Extra Large (XL)</option>
                <option value="XXL">XX Large (XXL)</option>
            </select>
        </div>
        <div class="stock-indicator in-stock" id="teeStock">✅ In Stock</div>
        <button class="close-expanded-btn" onclick="toggleTeeCard()">
            <i class="fas fa-times"></i> Close
        </button>
    `;
    container.appendChild(teeExpanded);
}

function addGiftCardExpandedView(container) {
    var giftExpanded = document.createElement('div');
    giftExpanded.className = 'merch-expanded';
    giftExpanded.id = 'giftCardExpanded';
    giftExpanded.innerHTML = `
        <div class="section-title"><i class="fas fa-gift"></i> Gift Cards</div>
        
        <div class="amount-selector">
            <button class="amount-btn" data-amount="10">$10</button>
            <button class="amount-btn" data-amount="25">$25</button>
            <button class="amount-btn active" data-amount="50">$50</button>
            <button class="amount-btn" data-amount="100">$100</button>
        </div>
        
        <div class="custom-amount">
            <span>$</span>
            <input type="number" id="gc-custom-amount" placeholder="Custom amount" step="1" min="1">
        </div>
        
        <div class="form-group">
            <label for="gc-recipient"><i class="fas fa-user"></i> Recipient Name (optional)</label>
            <input type="text" id="gc-recipient" placeholder="e.g., Jane Doe">
        </div>
        
        <div class="form-group">
            <label for="gc-sender"><i class="fas fa-user"></i> Sender Name (optional)</label>
            <input type="text" id="gc-sender" placeholder="e.g., John Smith">
        </div>
        
        <div class="form-group">
            <label for="gc-message"><i class="fas fa-pencil-alt"></i> Personal Message (optional)</label>
            <textarea id="gc-message" placeholder="Happy Birthday! Enjoy some new vinyl."></textarea>
        </div>
        
        <button class="pay-btn" id="gc-pay-btn">
            <i class="fas fa-credit-card"></i> Pay with Square
        </button>
        
        <div id="gc-status" class="status-message"></div>
        
        <button class="close-expanded-btn" onclick="toggleGiftCard()">
            <i class="fas fa-times"></i> Close
        </button>
    `;
    container.appendChild(giftExpanded);
}

// ============================================================
// TEE FUNCTIONS
// ============================================================

var currentTeeColor = 'black';

function toggleTeeCard() {
    var expanded = document.getElementById('teeExpanded');
    var container = document.getElementById('catalogContainer');
    
    if (expanded.classList.contains('active')) {
        expanded.classList.remove('active');
        // Show the tee card again
        var cards = container.querySelectorAll('.merch-card:not(.gift-card-tile)');
        cards.forEach(function(card) {
            if (card.querySelector('.merch-info h3') && card.querySelector('.merch-info h3').textContent.includes('T-Shirt')) {
                card.style.display = 'flex';
            }
        });
        teeExpanded = false;
    } else {
        expanded.classList.add('active');
        // Hide the tee card
        var cards = container.querySelectorAll('.merch-card:not(.gift-card-tile)');
        cards.forEach(function(card) {
            if (card.querySelector('.merch-info h3') && card.querySelector('.merch-info h3').textContent.includes('T-Shirt')) {
                card.style.display = 'none';
            }
        });
        teeExpanded = true;
        
        // Close gift card if open
        if (giftCardExpanded) {
            var giftExpanded = document.getElementById('giftCardExpanded');
            giftExpanded.classList.remove('active');
            var giftTile = container.querySelector('.merch-card.gift-card-tile');
            if (giftTile) giftTile.style.display = 'flex';
            giftCardExpanded = false;
        }
    }
}

function selectTeeColor(color) {
    currentTeeColor = color;
    var img = document.getElementById('teeImage');
    if (color === 'black') {
        img.src = '/static/images/tee-black.png';
    } else if (color === 'yellow') {
        img.src = '/static/images/tee-yellow.png';
    } else if (color === 'purple') {
        img.src = '/static/images/tee-black.png'; // Fallback - use black for now
    }
    
    // Update active state
    document.querySelectorAll('.color-options .color-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    document.querySelector('.color-options .color-btn.' + color).classList.add('active');
    
    // Update stock (simulated)
    var stockEl = document.getElementById('teeStock');
    var stock = Math.floor(Math.random() * 15) + 1;
    if (stock > 10) {
        stockEl.className = 'stock-indicator in-stock';
        stockEl.textContent = '✅ In Stock (' + stock + ' available)';
    } else if (stock > 0) {
        stockEl.className = 'stock-indicator low-stock';
        stockEl.textContent = '⚠️ Low Stock (' + stock + ' available)';
    } else {
        stockEl.className = 'stock-indicator out-of-stock';
        stockEl.textContent = '❌ Out of Stock';
    }
}

// ============================================================
// GIFT CARD FUNCTIONS
// ============================================================

function toggleGiftCard() {
    var expanded = document.getElementById('giftCardExpanded');
    var container = document.getElementById('catalogContainer');
    var giftTile = container.querySelector('.merch-card.gift-card-tile');
    
    if (expanded.classList.contains('active')) {
        expanded.classList.remove('active');
        if (giftTile) giftTile.style.display = 'flex';
        giftCardExpanded = false;
    } else {
        expanded.classList.add('active');
        if (giftTile) giftTile.style.display = 'none';
        giftCardExpanded = true;
        
        // Close tee if open
        if (teeExpanded) {
            var teeExpandedEl = document.getElementById('teeExpanded');
            teeExpandedEl.classList.remove('active');
            var teeCards = container.querySelectorAll('.merch-card:not(.gift-card-tile)');
            teeCards.forEach(function(card) {
                if (card.querySelector('.merch-info h3') && card.querySelector('.merch-info h3').textContent.includes('T-Shirt')) {
                    card.style.display = 'flex';
                }
            });
            teeExpanded = false;
        }
    }
}

function initGiftCardPage() {
    if (giftCardInitialized) return;
    giftCardInitialized = true;
    
    // Amount presets - use event delegation since buttons are in expanded view
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.gift-card-expanded .amount-btn');
        if (btn) {
            document.querySelectorAll('.gift-card-expanded .amount-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            document.getElementById('gc-custom-amount').value = '';
        }
    });
    
    document.getElementById('gc-custom-amount')?.addEventListener('input', function() {
        if (this.value) {
            document.querySelectorAll('.gift-card-expanded .amount-btn').forEach(function(b) {
                b.classList.remove('active');
            });
        }
    });
    
    document.getElementById('gc-pay-btn')?.addEventListener('click', createGiftCardPayment);
    
    document.getElementById('gc-custom-amount')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') createGiftCardPayment();
    });
}

function initTeePage() {
    // Initialize tee stock
    selectTeeColor('black');
}

function getSelectedAmount() {
    let amount = 0;
    const activePreset = document.querySelector('.gift-card-expanded .amount-btn.active');
    if (activePreset) {
        amount = parseFloat(activePreset.dataset.amount);
    }
    const customAmount = parseFloat(document.getElementById('gc-custom-amount')?.value);
    if (customAmount && customAmount > 0) {
        amount = customAmount;
    }
    return amount;
}

async function createGiftCardPayment() {
    const amount = getSelectedAmount();
    const recipient = document.getElementById('gc-recipient')?.value.trim() || '';
    const sender = document.getElementById('gc-sender')?.value.trim() || '';
    const message = document.getElementById('gc-message')?.value.trim() || '';
    const statusEl = document.getElementById('gc-status');
    const btn = document.getElementById('gc-pay-btn');
    
    if (!amount || amount <= 0) {
        if (statusEl) {
            statusEl.textContent = '❌ Please select or enter a valid amount';
            statusEl.className = 'status-message error';
        }
        return;
    }
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating payment link...';
    }
    if (statusEl) {
        statusEl.className = 'status-message';
        statusEl.style.display = 'none';
    }
    
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
            if (statusEl) {
                statusEl.textContent = 'Redirecting to Square checkout...';
                statusEl.className = 'status-message info';
            }
            window.location.href = data.checkout_url;
        } else {
            if (statusEl) {
                statusEl.textContent = '❌ ' + (data.error || 'Failed to create payment link');
                statusEl.className = 'status-message error';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-credit-card"></i> Pay with Square';
            }
        }
    } catch (err) {
        console.error('Payment error:', err);
        if (statusEl) {
            statusEl.textContent = '❌ Error: ' + err.message;
            statusEl.className = 'status-message error';
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-credit-card"></i> Pay with Square';
        }
    }
}

// ============================================================
// GIFT CARD PAYMENT CONFIRMATION (from merch-component)
// ============================================================

// These functions are called from the modal in index.html
// They need to be accessible globally
window.closePaymentModal = function() {
    var modal = document.getElementById('payment-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    var loadingEl = document.getElementById('payment-loading');
    var resultEl = document.getElementById('payment-result');
    var errorEl = document.getElementById('payment-error');
    var printBtn = document.getElementById('print-postcard-btn');
    var downloadBtn = document.getElementById('download-pdf-btn');
    if (loadingEl) loadingEl.style.display = 'block';
    if (resultEl) resultEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    if (printBtn) printBtn.style.display = 'none';
    if (downloadBtn) downloadBtn.style.display = 'none';
};

window.printGiftCardPostcard = function() {
    // This will be implemented in the full gift card module
    alert('Print functionality coming soon!');
};

window.downloadGiftCardPDF = function() {
    // This will be implemented in the full gift card module
    alert('Download PDF functionality coming soon!');
};