// Shop component
function initShop() {
    console.log('🛒 Shop initialized');
    
    if (typeof window.RecordsComponent !== 'undefined') {
        window.shopComponent = new window.RecordsComponent({
            containerId: 'shopCatalogContainer',
            title: 'Shop',
            idPrefix: 'shop',
            borderColor: '#ff6b6b',
            buttonColor: '#ff6b6b',
            buttonTextColor: 'white',
            searchInputId: 'shopSearchInput',
            statusId: 2,
            showCondition: true,
            showLocation: true,
            onAddToCart: function(record) {
                if (window.cart) {
                    window.cart.addItem({
                        id: record.id,
                        type: 'record',
                        title: record.artist + ' - ' + record.title,
                        price: parseFloat(record.store_price) || 0,
                        quantity: 1,
                        artist: record.artist,
                        condition: record.condition || 'Unknown'
                    });
                    if (typeof updateCartUI === 'function') {
                        updateCartUI();
                    }
                    if (typeof closeRecordModal === 'function') {
                        closeRecordModal();
                    }
                    showToast('✅ Added to cart: ' + record.artist + ' - ' + record.title);
                }
            }
        });
        window.shopComponent.init();
    } else {
        console.error('RecordsComponent not loaded');
    }
}

function showToast(message) {
    const existing = document.querySelector('.shop-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'shop-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: #28a745;
        color: white;
        border-radius: 8px;
        z-index: 10001;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        max-width: 400px;
        animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.initShop = initShop;
window.showToast = showToast;