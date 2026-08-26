// Merch page - displays merchandise items
(function() {
    let currentPage = 1;
    const pageSize = 24;
    let totalRecords = 0;
    let allMerch = [];

    // Modal functions for merch
    window.openMerchModal = function(item) {
        const price = parseFloat(item.price) || 0;
        const inStock = item.stock > 0 || item.status === 'active';
        const imageUrl = item.image_url || '';
        
        const modal = document.createElement('div');
        modal.id = 'merchModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 30px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #333; font-size: 24px;">${item.name || 'Merch Item'}</h2>
                    <button onclick="closeMerchModal()" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #999; padding: 0 8px;">&times;</button>
                </div>
                
                <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                    <div style="flex: 0 0 120px; height: 120px; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        ${imageUrl ? 
                            `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                            `<span style="font-size: 40px; color: #ddd;">👕</span>`
                        }
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 18px; font-weight: bold; color: #333;">${item.name || 'Untitled'}</div>
                        <div style="color: #666; margin: 4px 0;">${item.category || 'Accessory'}</div>
                        ${item.size ? `<div style="color: #666; font-size: 14px;">Size: ${item.size}</div>` : ''}
                        ${item.color ? `<div style="color: #666; font-size: 14px;">Color: ${item.color}</div>` : ''}
                        <div style="margin-top: 8px; font-size: 14px; color: ${inStock ? '#28a745' : '#dc3545'};">
                            ${inStock ? '✅ In Stock' : '❌ Out of Stock'}
                        </div>
                    </div>
                </div>
                
                <div style="border-top: 1px solid #eee; padding-top: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <span style="font-size: 18px; color: #666;">Price</span>
                        <span style="font-size: 28px; font-weight: bold; color: #ff6b6b;">$${price.toFixed(2)}</span>
                    </div>
                    
                    ${inStock ? `
                        <button onclick="alert('Added to cart: ${item.name}')" 
                                style="width: 100%; padding: 14px; background: #ff6b6b; color: white; border: none; border-radius: 30px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
                            <i class="fas fa-shopping-cart"></i> Add to Cart
                        </button>
                    ` : `
                        <button disabled style="width: 100%; padding: 14px; background: #ccc; color: #666; border: none; border-radius: 30px; font-size: 16px; font-weight: 600; cursor: not-allowed;">
                            Out of Stock
                        </button>
                    `}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeMerchModal();
            }
        });
    };

    window.closeMerchModal = function() {
        const modal = document.getElementById('merchModal');
        if (modal) {
            modal.remove();
        }
    };

    window.loadMerch = async function(page = 1) {
        try {
            const response = await fetch('http://localhost:5000/accessories?page=' + page + '&limit=' + pageSize);
            const data = await response.json();
            console.log('Merch response:', data);
            
            // Handle different response structures
            let items = [];
            if (data.items && Array.isArray(data.items)) {
                items = data.items;
                totalRecords = data.total || items.length;
            } else if (data.data && Array.isArray(data.data)) {
                items = data.data;
                totalRecords = data.total || items.length;
            } else if (data.merch && Array.isArray(data.merch)) {
                items = data.merch;
                totalRecords = data.total || items.length;
            } else if (Array.isArray(data)) {
                items = data;
                totalRecords = items.length;
            } else if (data.records && Array.isArray(data.records)) {
                items = data.records;
                totalRecords = data.total || items.length;
            } else {
                // If no array found, try to find any array property
                for (let key in data) {
                    if (Array.isArray(data[key])) {
                        items = data[key];
                        totalRecords = items.length;
                        break;
                    }
                }
            }
            
            allMerch = items;
            const totalPages = Math.ceil(totalRecords / pageSize) || 1;
            
            let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:5px 0;">';
            if (allMerch.length > 0) {
                allMerch.forEach(function(item) {
                    const price = parseFloat(item.price) || 0;
                    const inStock = item.stock > 0 || item.status === 'active';
                    const imageUrl = item.image_url || '';
                    const itemData = JSON.stringify(item).replace(/"/g, '&quot;');
                    html += '<div style="background:#f8f8f8;border-radius:8px;padding:10px;border:1px solid #eee;cursor:pointer;transition:all 0.2s;" onclick="openMerchModal(' + itemData + ')">';
                    if (imageUrl) {
                        html += '<div style="height:100px;border-radius:4px;margin-bottom:8px;overflow:hidden;background:#e0e0e0;display:flex;align-items:center;justify-content:center;">';
                        html += '<img src="' + imageUrl + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span style=\\\'font-size:30px;color:#bbb;\\\'>👕</span>\'">';
                        html += '</div>';
                    } else {
                        html += '<div style="height:100px;background:#e0e0e0;border-radius:4px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;font-size:30px;color:#bbb;">👕</div>';
                    }
                    html += '<div style="font-weight:bold;color:#333;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (item.name || 'Unknown') + '</div>';
                    html += '<div style="color:#666;font-size:11px;">' + (item.category || 'Accessory') + '</div>';
                    html += '<div style="color:#ff6b6b;font-weight:bold;font-size:15px;margin-top:4px;">$' + price.toFixed(2) + '</div>';
                    html += '<div style="font-size:10px;color:' + (inStock ? '#28a745' : '#dc3545') + ';">' + (inStock ? '✅ In Stock' : '❌ Out of Stock') + '</div>';
                    html += '</div>';
                });
            } else {
                html = '<div style="text-align:center;padding:40px;color:#888;">No merch found</div>';
            }
            html += '</div>';
            
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid #ddd;margin-top:8px;flex-wrap:wrap;gap:8px;">';
            html += '<div style="font-size:13px;color:#888;">Showing ' + ((page-1)*pageSize+1) + '-' + Math.min(page*pageSize, totalRecords) + ' of ' + totalRecords + ' items</div>';
            html += '<div style="display:flex;gap:6px;align-items:center;">';
            html += '<button onclick="loadMerch(1)" style="padding:4px 10px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;" ' + (page <= 1 ? 'disabled' : '') + '><i class="fas fa-angle-double-left"></i></button>';
            html += '<button onclick="loadMerch(' + (page-1) + ')" style="padding:4px 10px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;" ' + (page <= 1 ? 'disabled' : '') + '><i class="fas fa-angle-left"></i></button>';
            html += '<span style="font-size:13px;padding:0 8px;">' + page + ' / ' + totalPages + '</span>';
            html += '<button onclick="loadMerch(' + (page+1) + ')" style="padding:4px 10px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;" ' + (page >= totalPages ? 'disabled' : '') + '><i class="fas fa-angle-right"></i></button>';
            html += '<button onclick="loadMerch(' + totalPages + ')" style="padding:4px 10px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;" ' + (page >= totalPages ? 'disabled' : '') + '><i class="fas fa-angle-double-right"></i></button>';
            html += '</div></div>';
            
            const container = document.getElementById('merchResponse');
            if (container) {
                container.innerHTML = html;
            } else {
                console.error('Container not found: merchResponse');
            }
        } catch(err) {
            const container = document.getElementById('merchResponse');
            if (container) {
                container.innerHTML = '<div style="color:red;padding:20px;text-align:center;">Error: ' + err.message + '</div>';
            }
            console.error('Error loading merch:', err);
        }
    };

    window.initMerch = function() {
        console.log('Merch initialized');
        currentPage = 1;
        setTimeout(function() { window.loadMerch(1); }, 200);
    };
})();
