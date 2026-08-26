// Checkout page
(function() {
    let cart = [];
    let searchResults = [];
    let currentCheckoutTotal = 0;

    // Load cart from localStorage
    function loadCart() {
        try {
            const data = localStorage.getItem('pigstyle_cart');
            if (data) {
                cart = JSON.parse(data);
            } else {
                cart = [];
            }
        } catch {
            cart = [];
        }
        renderCart();
    }

    // Save cart to localStorage
    function saveCart() {
        localStorage.setItem('pigstyle_cart', JSON.stringify(cart));
        // Update badge
        const badge = document.getElementById('cartBadge');
        if (badge) {
            const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline' : 'none';
        }
        renderCart();
    }

    // Search function
    window.checkoutSearch = async function() {
        const searchInput = document.getElementById('checkout-search');
        const term = searchInput.value.trim();
        
        if (!term) {
            document.getElementById('checkout-results').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Enter a search term</div>';
            return;
        }
        
        const resultsDiv = document.getElementById('checkout-results');
        resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Searching...</div>';
        
        try {
            const response = await fetch(`http://localhost:5000/records?search=${encodeURIComponent(term)}&limit=50`, {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (data.status === 'success' && data.records) {
                searchResults = data.records;
                renderSearchResults(searchResults);
            } else {
                resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No results found</div>';
            }
        } catch (err) {
            console.error('Search error:', err);
            resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error searching</div>';
        }
    };

    window.checkoutClear = function() {
        document.getElementById('checkout-search').value = '';
        document.getElementById('checkout-results').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Search for records to add</div>';
        searchResults = [];
    };

    function renderSearchResults(records) {
        const resultsDiv = document.getElementById('checkout-results');
        if (!records || records.length === 0) {
            resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No results found</div>';
            return;
        }
        
        let html = '';
        records.forEach(record => {
            const price = parseFloat(record.store_price) || 0;
            const inStock = record.status_id === 2 || record.status_id === 1;
            const inCart = cart.some(item => item.id === record.id);
            
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; ${inCart ? 'background: #e8f4fd;' : ''}">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #333; font-size: 14px;">${record.artist || 'Unknown'}</div>
                        <div style="color: #666; font-size: 13px;">${record.title || 'Untitled'}</div>
                        <div style="color: #ff6b6b; font-weight: bold; font-size: 14px;">$${price.toFixed(2)}</div>
                        <div style="font-size: 11px; color: ${inStock ? '#28a745' : '#dc3545'};">${inStock ? '✅ In Stock' : '❌ Out of Stock'}</div>
                    </div>
                    ${inCart ? 
                        `<button onclick="checkoutRemoveFromCart(${record.id})" style="padding: 6px 14px; background: #dc3545; color: white; border: none; border-radius: 20px; cursor: pointer; font-size: 12px;">
                            <i class="fas fa-minus"></i> Remove
                        </button>` :
                        `<button onclick="checkoutAddToCart(${record.id})" style="padding: 6px 14px; background: #28a745; color: white; border: none; border-radius: 20px; cursor: pointer; font-size: 12px;" ${!inStock ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                            <i class="fas fa-plus"></i> Add
                        </button>`
                    }
                </div>
            `;
        });
        resultsDiv.innerHTML = html;
    }

    window.checkoutAddToCart = function(recordId) {
        const record = searchResults.find(r => r.id === recordId);
        if (!record) return;
        
        const existing = cart.find(item => item.id === record.id);
        if (existing) {
            existing.quantity = (existing.quantity || 1) + 1;
        } else {
            cart.push({
                id: record.id,
                artist: record.artist,
                title: record.title,
                price: parseFloat(record.store_price) || 0,
                quantity: 1,
                type: 'record'
            });
        }
        saveCart();
        renderSearchResults(searchResults);
    };

    window.checkoutRemoveFromCart = function(recordId) {
        cart = cart.filter(item => item.id !== recordId);
        saveCart();
        renderSearchResults(searchResults);
    };

    function renderCart() {
        const cartDiv = document.getElementById('checkout-cart-items');
        const countSpan = document.getElementById('checkout-cart-count');
        const totalSpan = document.getElementById('checkout-cart-total');
        const processBtn = document.getElementById('checkout-process-btn');
        
        if (!cart || cart.length === 0) {
            cartDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Cart is empty</div>';
            countSpan.textContent = '0';
            totalSpan.textContent = '$0.00';
            processBtn.disabled = true;
            return;
        }
        
        let total = 0;
        let html = '';
        cart.forEach(item => {
            const itemTotal = (item.price || 0) * (item.quantity || 1);
            total += itemTotal;
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid #f0f0f0;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #333; font-size: 13px;">${item.artist || 'Item'} - ${item.title || ''}</div>
                        <div style="color: #666; font-size: 12px;">$${(item.price || 0).toFixed(2)} × ${item.quantity || 1}</div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button onclick="checkoutUpdateQty(${item.id}, -1)" style="padding: 2px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">-</button>
                        <span style="font-size: 14px; min-width: 20px; text-align: center;">${item.quantity || 1}</span>
                        <button onclick="checkoutUpdateQty(${item.id}, 1)" style="padding: 2px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">+</button>
                        <button onclick="checkoutRemoveFromCart(${item.id})" style="padding: 2px 8px; background: none; border: none; color: #dc3545; cursor: pointer; font-size: 18px;">×</button>
                    </div>
                </div>
            `;
        });
        
        cartDiv.innerHTML = html;
        countSpan.textContent = cart.length;
        totalSpan.textContent = `$${total.toFixed(2)}`;
        currentCheckoutTotal = total;
        processBtn.disabled = false;
    }

    window.checkoutUpdateQty = function(recordId, delta) {
        const item = cart.find(i => i.id === recordId);
        if (item) {
            item.quantity = (item.quantity || 1) + delta;
            if (item.quantity <= 0) {
                cart = cart.filter(i => i.id !== recordId);
            }
            saveCart();
            renderSearchResults(searchResults);
        }
    };

    window.checkoutProcess = function() {
        if (!cart || cart.length === 0) {
            alert('Cart is empty!');
            return;
        }
        
        const total = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
        const items = cart.map(item => `${item.artist || ''} - ${item.title || ''} (x${item.quantity || 1})`).join('\n');
        
        if (confirm(`Checkout ${cart.length} items?\n\n${items}\n\nTotal: $${total.toFixed(2)}`)) {
            // Clear cart
            cart = [];
            saveCart();
            renderSearchResults(searchResults);
            alert('✅ Checkout complete! Thank you for shopping at PigStyle Music.');
        }
    };

    // Enter key to search
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('checkout-search');
        if (searchInput) {
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    window.checkoutSearch();
                }
            });
        }
    });

    window.initCheckout = function() {
        console.log('Checkout initialized');
        loadCart();
        // Auto-search for active records
        document.getElementById('checkout-search').value = '';
        window.checkoutSearch();
    };
})();
