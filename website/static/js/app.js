// Page navigation
async function showPage(page, btnElement) {
    document.querySelectorAll('nav button').forEach(function(btn) {
        btn.classList.remove('active');
    });
    if (btnElement) {
        btnElement.classList.add('active');
    }
    
    var content = document.getElementById('page-content');
    try {
        var response = await fetch('/tiles/' + page + '.html');
        var html = await response.text();
        content.innerHTML = html;
        
        document.querySelectorAll('.flip-hint').forEach(function(hint) {
            hint.onclick = function(e) {
                e.stopPropagation();
                var card = this.closest('.flip-card');
                if (card) {
                    card.classList.toggle('flipped');
                }
            };
        });
        
        // Initialize page-specific functionality
        if (page === 'shop' && typeof initShop === 'function') {
            initShop();
        }
        if (page === 'new' && typeof initNew === 'function') {
            initNew();
        }
        if (page === 'merch' && typeof initMerch === 'function') {
            initMerch();
        }
        if (page === 'events' && typeof initEvents === 'function') {
            initEvents();
        }
        if (page === 'connect' && typeof initConnect === 'function') {
            initConnect();
        }
        if (page === 'alerts' && typeof initAlerts === 'function') {
            initAlerts();
        }
        if (page === 'order' && typeof initOrder === 'function') {
            initOrder();
        }
        if (page === 'cart' && typeof initCart === 'function') {
            initCart();
        }
        if (page === 'email' && typeof initEmail === 'function') {
            initEmail();
        }
        if (page === 'login' && typeof initLogin === 'function') {
            initLogin();
        }
        
    } catch(err) {
        content.innerHTML = '<div class="simple-page"><h1>Error</h1><p>Failed to load page</p></div>';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    var homeBtn = document.querySelector('nav button:first-child');
    if (homeBtn) {
        homeBtn.classList.add('active');
    }
    showPage('home');
});
