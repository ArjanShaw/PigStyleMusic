// New Arrivals component
function initNew() {
    console.log('⭐ New arrivals initialized');
    
    if (typeof window.RecordsComponent !== 'undefined') {
        window.newComponent = new window.RecordsComponent({
            containerId: 'newCatalogContainer',
            title: 'New Arrivals',
            idPrefix: 'new',
            borderColor: '#ffd93d',
            badgeText: 'NEW',
            badgeColor: '#ffd93d',
            buttonColor: '#ffd93d',
            buttonTextColor: '#333',
            locationId: 150,
            statusId: 2,
            searchInputId: 'newSearchInput'
        });
        window.newComponent.init();
    } else {
        console.error('RecordsComponent not loaded');
    }
}

window.initNew = initNew;
