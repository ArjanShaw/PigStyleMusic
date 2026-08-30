// New Sealed Records component - Bin 36 and Wall Display West /2
function initNew() {
    console.log('⭐ New Sealed Records initialized');
    
    if (typeof window.RecordsComponent !== 'undefined') {
        window.newComponent = new window.RecordsComponent({
            containerId: 'newCatalogContainer',
            title: 'New Sealed Records',
            idPrefix: 'new',
            borderColor: '#28a745',  // Green for sealed/new
            badgeText: 'SEALED',
            badgeColor: '#28a745',
            buttonColor: '#28a745',
            buttonTextColor: 'white',
            locationIds: [154, 155, 156, 157],  // Bin 36/1, 36/2, 36/3, Wall Display West /2
            statusId: 2,  // ACTIVE status
            searchInputId: 'newSearchInput',
            showCondition: true,
            showLocation: true
        });
        window.newComponent.init();
    } else {
        console.error('RecordsComponent not loaded');
    }
}

// Global search functions for new sealed records
window.newSearch = function() {
    if (window.newComponent) {
        window.newComponent.performSearch();
    }
};

window.newClearSearch = function() {
    if (window.newComponent) {
        window.newComponent.clearSearch();
    }
};

window.initNew = initNew;