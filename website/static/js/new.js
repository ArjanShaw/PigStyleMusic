// New Sealed Records component - Bin 36 and Wall Display West /2
function initNew() {
    console.log('⭐ New Sealed Records initialized');
    
    if (typeof window.RecordsComponent !== 'undefined') {
        window.newComponent = new window.RecordsComponent({
            containerId: 'newCatalogContainer',
            title: 'New Sealed Records',
            idPrefix: 'new',
            borderColor: '#28a745',
            badgeText: 'SEALED',
            badgeColor: '#28a745',
            buttonColor: '#28a745',
            buttonTextColor: 'white',
            locationIds: '154,155,156,157',
            statusId: 2,
            genreIds: null,
            formatIds: null,
            searchInputId: 'newSearchInput',
            showCondition: true,
            showLocation: true,
            showEmptyCard: true
        });
        window.newComponent.init();
    } else {
        console.error('RecordsComponent not loaded');
    }
}

// Random modal for the empty card
window.showRandomModal = function() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 16px; max-width: 400px; width: 90%; padding: 30px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div style="font-size: 48px; margin-bottom: 10px;">🐷</div>
            <h2 style="color: #333; margin: 0 0 10px 0;">Coming Soon!</h2>
            <p style="color: #666; margin: 0 0 20px 0;">This feature is under development.</p>
            <button onclick="this.closest('div[style]').remove()" style="padding: 10px 30px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">
                Close
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
};

// ===== NEW SEALED GENRE FILTER FUNCTIONS =====
window.newSetGenre = function(genreId) {
    if (window.newComponent) window.newComponent.setGenre(genreId);
};

// ===== NEW SEALED FORMAT FILTER FUNCTIONS =====
window.newSetFormats = function(formatIds) {
    if (window.newComponent) window.newComponent.setFormats(formatIds);
};

// ===== NEW SEALED CLEAR ALL FILTERS =====
window.newClearFilters = function() {
    if (window.newComponent) {
        const genreSelect = document.getElementById('newGenreSelect');
        if (genreSelect) genreSelect.value = '';
        
        window.newComponent.setGenre(null);
        window.newComponent.setFormats([]);
    }
};

// Legacy alias used elsewhere
window.newClearGenreFilter = function() {
    window.newClearFilters();
};

window.newSearch = function() {
    if (window.newComponent) window.newComponent.performSearch();
};

window.newClearSearch = function() {
    if (window.newComponent) window.newComponent.clearSearch();
};

window.initNew = initNew;