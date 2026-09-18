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
            locationIds: [150, 151, 152, 153],
            statusId: 2,
            genreIds: null,
            formatIds: null,
            maxPrice: null,
            searchInputId: 'newArrivalsSearchInput',
            showCondition: true,
            showLocation: true  
        });
        window.newArrivalsComponent.init();
    } else {
        console.error('RecordsComponent not loaded');
    }
}

// ===== NEW ARRIVALS GENRE FILTER FUNCTIONS =====
window.newArrivalsSetGenre = function(genreId) {
    if (window.newArrivalsComponent) window.newArrivalsComponent.setGenre(genreId);
};

// ===== NEW ARRIVALS FORMAT FILTER FUNCTIONS =====
window.newArrivalsSetFormats = function(formatIds) {
    if (window.newArrivalsComponent) window.newArrivalsComponent.setFormats(formatIds);
};

// ===== NEW ARRIVALS PRICE FILTER FUNCTIONS =====
window.newArrivalsSetMaxPrice = function(price) {
    if (window.newArrivalsComponent) window.newArrivalsComponent.setMaxPrice(price);
};

// ===== NEW ARRIVALS CLEAR ALL FILTERS =====
window.newArrivalsClearFilters = function() {
    if (window.newArrivalsComponent) {
        const genreSelect = document.getElementById('newArrivalsGenreSelect');
        if (genreSelect) genreSelect.value = '';
        
        const maxPriceInput = document.getElementById('newArrivalsMaxPrice');
        if (maxPriceInput) maxPriceInput.value = '';
        
        window.newArrivalsComponent.setGenre(null);
        window.newArrivalsComponent.setFormats([]);
        window.newArrivalsComponent.setMaxPrice(null);
    }
};

window.newArrivalsSearch = function() {
    if (window.newArrivalsComponent) window.newArrivalsComponent.performSearch();
};

window.newArrivalsClearSearch = function() {
    if (window.newArrivalsComponent) window.newArrivalsComponent.clearSearch();
};

window.initNewArrivals = initNewArrivals;