const pages = {
    home: { title: 'Home', tile: 'home' },
    shop: { title: 'Shop', tile: 'shop' },
    new: { title: 'New', tile: 'new' },
    merch: { title: 'Merch', tile: 'merch' },
    events: { title: 'Events', tile: 'events' },
    connect: { title: 'Connect', tile: 'connect' },
    alerts: { title: 'Alerts', tile: 'alerts' },
    order: { title: 'Order', tile: 'order' },
    cart: { title: 'Cart', tile: 'cart' },
    email: { title: 'Email', tile: 'email' },
    login: { title: 'Login', tile: 'login' }
};

// Default content for pages without a tile
const defaultMessages = {
    shop: 'Browse our vinyl collection',
    new: 'Check out the latest arrivals',
    merch: 'T-shirts, stickers, and more!',
    events: 'Upcoming shows and events',
    connect: 'Get in touch with us',
    alerts: 'Get notified about new releases',
    order: 'Request new vinyl from our distributor',
    cart: 'Your shopping cart (2 items)',
    email: 'Subscribe to our newsletter',
    login: 'Sign in to your account'
};

async function showPage(page, btnElement) {
    const content = document.getElementById('page-content');
    
    // Highlight active button
    document.querySelectorAll('nav button').forEach(btn => {
        btn.classList.remove('active');
    });
    if (btnElement) {
        btnElement.classList.add('active');
    }
    
    // If it's the home page, load the tile
    if (page === 'home') {
        try {
            const response = await fetch('/tiles/home.html');
            const html = await response.text();
            content.innerHTML = html;
            
            // Set up flip card after content loads
            const flipCard = document.getElementById('flipCardHome');
            if (flipCard) {
                flipCard.addEventListener('click', function(e) {
                    if (e.target.closest('a, .social-icons a, .map-container, iframe')) return;
                    this.classList.toggle('flipped');
                });
            }
        } catch (err) {
            content.innerHTML = `
                <div class="simple-page">
                    <h1>Hello World - Home</h1>
                    <p>Welcome to PigStyle Music</p>
                </div>
            `;
        }
        return;
    }
    
    // If it's the shop page, load the shop tile
    if (page === 'shop') {
        try {
            const response = await fetch('/tiles/shop.html');
            const html = await response.text();
            content.innerHTML = html;
            
            // Initialize shop component after content loads
            setTimeout(() => {
                if (typeof ShopComponent !== 'undefined') {
                    ShopComponent.init();
                }
            }, 100);
        } catch (err) {
            content.innerHTML = `
                <div class="simple-page">
                    <h1>Hello World - Shop</h1>
                    <p>Browse our vinyl collection</p>
                </div>
            `;
        }
        return;
    }
    
    // For other pages, show simple message
    const title = page.charAt(0).toUpperCase() + page.slice(1);
    const message = defaultMessages[page] || `Welcome to ${title}`;
    content.innerHTML = `
        <div class="simple-page">
            <h1>Hello World - ${title}</h1>
            <p>${message}</p>
        </div>
    `;
}

// Set Home as active by default and load it
document.addEventListener('DOMContentLoaded', function() {
    const homeBtn = document.querySelector('nav button:first-child');
    if (homeBtn) {
        homeBtn.classList.add('active');
    }
    showPage('home');
});
