// Consignor-specific functions
async function loadUserRecords() {
    try {
        const response = await fetch(AppConfig.getUrl('consignorRecords'), {
            method: 'GET',
            headers: AppConfig.getHeaders(),
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            // Update the records table with user-specific data
            updateRecordsTable(data.records);
        }
    } catch (error) {
        console.error('Error loading user records:', error);
    }
}

// Function to update records table
function updateRecordsTable(records) {
    const tableBody = document.getElementById('records-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    records.forEach(record => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.artist || ''}</td>
            <td>${record.title || ''}</td>
            <td>${record.genre_name || ''}</td>
            <td>${record.condition || ''}</td>
            <td>$${(record.store_price || 0).toFixed(2)}</td>
            <td>${record.status_name || ''}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Export for use in other modules
window.ConsignorUtils = {
    loadUserRecords,
    updateRecordsTable
};