/**
 * Shop Component - Uses reusable RecordsComponent
 */

// Create shop component instance
const shopComponent = new RecordsComponent({
    containerId: 'shopCatalogContainer',
    title: 'Shop',
    idPrefix: 'shop',
    borderColor: '#ff6b6b',
    buttonColor: '#ff6b6b',
    buttonTextColor: 'white'
});

// Make it globally accessible
window.ShopComponent = shopComponent;
