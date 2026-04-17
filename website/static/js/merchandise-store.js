// Merchandise Store Front - Display Only (No Cart)
let allAccessories = [];

// Debug mode
let debugMode = true;

function addDebug(message, type = 'info') {
    if (!debugMode) return;
    console.log(`[Merch Debug] ${message}`);
}

async function loadAccessories() {
    const container = document.getElementById('catalogContainer');
    if (!container) return;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/accessories`);
        const data = await response.json();
        
        if (data.status === 'success') {
            allAccessories = data.accessories || [];
            displayAccessories(allAccessories);
            addDebug(`Loaded ${allAccessories.length} accessories`);
        } else {
            throw new Error('Failed to load accessories');
        }
    } catch (error) {
        console.error('Error loading accessories:', error);
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <h2>Failed to Load Merchandise</h2>
                <p>Unable to retrieve merchandise data from the server. Please try again later.</p>
                <button class="retry-btn" onclick="location.reload()">
                    <i class="fas fa-sync-alt"></i> Retry
                </button>
            </div>
        `;
    }
}

function displayAccessories(accessories) {
    const container = document.getElementById('catalogContainer');
    if (!container) return;
    
    if (!accessories || accessories.length === 0) {
        container.innerHTML = '<div class="loading"><p>No merchandise available</p></div>';
        return;
    }
    
    const gallery = document.createElement('div');
    gallery.className = 'merch-gallery';
    
    accessories.forEach(acc => {
        const card = document.createElement('div');
        card.className = 'merch-card';
        
        card.innerHTML = `
            <div class="merch-image">
                ${acc.image_url ? 
                    `<img src="${acc.image_url}" alt="${escapeHtml(acc.title)}" onerror="this.parentElement.classList.add('default-merch-bg'); this.style.display='none'">` : 
                    ''
                }
            </div>
            <div class="merch-info">
                <h3>${escapeHtml(acc.title)}</h3>
                <div class="merch-price">$${acc.store_price.toFixed(2)}</div>
                ${acc.description ? `<div class="merch-description">${escapeHtml(acc.description)}</div>` : ''}
            </div>
        `;
        
        gallery.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(gallery);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    await loadAccessories();
});