// New Arrivals - Uses shared records component with location filter
function initNew() {
    console.log('New arrivals initialized');
    
    // Create new arrivals component instance with location 150 filter
    if (typeof window.RecordsComponent !== 'undefined') {
        const newComp = new window.RecordsComponent({
            containerId: 'newCatalogContainer',
            title: 'New Arrivals',
            idPrefix: 'new',
            borderColor: '#ffd93d',
            badgeText: 'NEW',
            badgeColor: '#ffd93d',
            buttonColor: '#ffd93d',
            buttonTextColor: '#333',
            locationId: 150,  // Loveland store
            statusId: 1       // New arrivals
        });
        newComp.init();
    } else {
        console.error('RecordsComponent not loaded');
    }
}

// Make it globally accessible
window.initNew = initNew;
