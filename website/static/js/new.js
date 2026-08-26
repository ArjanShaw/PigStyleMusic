// New Arrivals - uses shared records component with location filter
function initNew() {
    console.log('New arrivals initialized');
    window.loadRecords(1, { 
        containerId: 'newRecordResponse', 
        title: 'new arrivals',
        locationId: 150 
    });
}
