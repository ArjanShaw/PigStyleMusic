// New Arrivals component - Bin 35 only
function initNewArrivals() {
    console.log('⭐ New Arrivals initialized');
    
    if (typeof window.RecordsComponent !== 'undefined') {
        window.newArrivalsComponent = new window.RecordsComponent({
            containerId: 'newArrivalsCatalogContainer',
            title: 'New Arrivals',
            idPrefix: 'newArrivals',
            borderColor: '#ffd93d',
            badgeText: 'NEW',
            badgeColor: '#ffd93d',
            buttonColor: '#ffd93d',
            buttonTextColor: '#333',
            locationIds: [150, 151, 152, 153],  // Bin 35 LT, RT, LB, RB
            statusId: 2,  // NEW status
            searchInputId: 'newArrivalsSearchInput',
            showCondition: true,
            showLocation: true  
        });
        window.newArrivalsComponent.init();
    } else {
        console.error('RecordsComponent not loaded');
    }
}

// Global search functions for new arrivals
window.newArrivalsSearch = function() {
    if (window.newArrivalsComponent) {
        window.newArrivalsComponent.performSearch();
    }
};

window.newArrivalsClearSearch = function() {
    if (window.newArrivalsComponent) {
        window.newArrivalsComponent.clearSearch();
    }
};

window.initNewArrivals = initNewArrivals;