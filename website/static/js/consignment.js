 
    // Consignment page specific logic
    document.addEventListener('DOMContentLoaded', async () => {
        await Auth.checkSession();
        
        // Show/hide add record button based on permissions
        const addRecordBtn = document.getElementById('add-record-btn');
        if (addRecordBtn) {
            if (Auth.canAccess('add_records')) {
                addRecordBtn.style.display = 'inline-block';
                addRecordBtn.disabled = false;
            } else {
                addRecordBtn.style.display = 'none';
                addRecordBtn.disabled = true;
            }
        }
        
        // Load user-specific records if logged in as consignor
        if (Auth.isAuthenticated() && Auth.hasPermission('consignor')) {
            await loadUserRecords();
        }
        
        // Show admin controls if admin
        if (Auth.isAuthenticated() && Auth.hasPermission('admin')) {
            showAdminControls();
        }
    });
    
    async function loadUserRecords() {
        try {
            const response = await fetch('http://localhost:5000/api/consignor/records', {
                method: 'GET',
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
    
    function showAdminControls() {
        // Add admin buttons to the page
        const adminControls = document.createElement('div');
        adminControls.className = 'admin-controls';
        adminControls.innerHTML = `
            <button id="process-all-btn" class="admin-button">
                <i class="fas fa-barcode"></i> Process All New Records
            </button>
            <button id="export-data-btn" class="admin-button">
                <i class="fas fa-download"></i> Export Consignment Data
            </button>
        `;
        
        const mainSection = document.querySelector('main');
        if (mainSection) {
            mainSection.insertBefore(adminControls, mainSection.firstChild);
        }
    }
 