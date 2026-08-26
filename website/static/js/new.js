/**
 * New Arrivals Component - Uses reusable RecordsComponent with location filter
 */

// Create new arrivals component instance with location 150 filter
const newComponent = new RecordsComponent({
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

// Make it globally accessible
window.NewComponent = newComponent;
