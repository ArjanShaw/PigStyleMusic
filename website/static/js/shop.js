// Shop - uses shared records component
function initShop() {
    console.log('Shop initialized');
    window.loadRecords(1, { 
        containerId: 'recordResponse', 
        title: 'records' 
    });
}
