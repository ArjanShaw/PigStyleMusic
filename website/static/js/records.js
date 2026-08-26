// Shared records component - used by both Shop and New
(function() {
    let currentPage = 1;
    const pageSize = 24;
    let totalRecords = 0;
    let allRecords = [];
    let currentFilter = {};

    // Modal functions
    window.openRecordModal = function(record) {
        const price = parseFloat(record.store_price) || 0;
        const inStock = record.status_id === 2 || record.status_id === 1;
        const imageUrl = record.image_url || '';
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'recordModal';
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
                    <h2 style="margin: 0; color: #333; font-size: 24px;">${record.artist || 'Unknown Artist'}</h2>
                    <button onclick="closeRecordModal()" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #999; padding: 0 8px;">&times;</button>
                </div>
                
                <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                    <div style="flex: 0 0 120px; height: 120px; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        ${imageUrl ? 
                            `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                            `<span style="font-size: 40px; color: #ddd;">🎵</span>`
                        }
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 18px; font-weight: bold; color: #333;">${record.title || 'Untitled'}</div>
                        <div style="color: #666; margin: 4px 0;">${record.condition || 'Unknown Condition'}</div>
                        <div style="color: #666; font-size: 14px;">${record.format_name || 'Unknown Format'}</div>
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
                        <button onclick="alert('Added to cart: ${record.artist} - ${record.title}')" 
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
        
        // Close on click outside
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeRecordModal();
            }
        });
    };

    window.closeRecordModal = function() {
        const modal = document.getElementById('recordModal');
        if (modal) {
            modal.remove();
        }
    };

    window.loadRecords = async function(page = 1, filter = {}) {
        currentFilter = filter;
        const containerId = filter.containerId || 'recordResponse';
        const title = filter.title || 'records';
        const locationId = filter.locationId || '';
        
        try {
            let url = 'http://localhost:5000/records?page=' + page + '&limit=' + pageSize;
            if (locationId) {
                url += '&location_id=' + locationId;
            }
            
            const response = await fetch(url);
            const data = await response.json();
            console.log('Records response:', data);
            
            totalRecords = data.total || data.records.length;
            allRecords = data.records || [];
            const totalPages = Math.ceil(totalRecords / pageSize);
            
            let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:5px 0;">';
            if (allRecords.length > 0) {
                allRecords.forEach(function(record) {
                    const price = parseFloat(record.store_price) || 0;
                    const inStock = record.status_id === 2 || record.status_id === 1;
                    const imageUrl = record.image_url || '';
                    const recordData = JSON.stringify(record).replace(/"/g, '&quot;');
                    html += '<div style="background:#f8f8f8;border-radius:8px;padding:10px;border:1px solid #eee;cursor:pointer;transition:all 0.2s;" onclick="openRecordModal(' + recordData + ')">';
                    if (imageUrl) {
                        html += '<div style="height:100px;border-radius:4px;margin-bottom:8px;overflow:hidden;background:#e0e0e0;display:flex;align-items:center;justify-content:center;">';
                        html += '<img src="' + imageUrl + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span style=\\\'font-size:30px;color:#bbb;\\\'>🎵</span>\'">';
                        html += '</div>';
                    } else {
                        html += '<div style="height:100px;background:#e0e0e0;border-radius:4px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;font-size:30px;color:#bbb;">🎵</div>';
                    }
                    html += '<div style="font-weight:bold;color:#333;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (record.artist || 'Unknown') + '</div>';
                    html += '<div style="color:#666;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (record.title || 'Untitled') + '</div>';
                    html += '<div style="color:#ff6b6b;font-weight:bold;font-size:15px;margin-top:4px;">$' + price.toFixed(2) + '</div>';
                    html += '<div style="font-size:10px;color:' + (inStock ? '#28a745' : '#dc3545') + ';">' + (inStock ? '✅ In Stock' : '❌ Out of Stock') + '</div>';
                    if (locationId) {
                        html += '<div style="font-size:9px;color:#999;margin-top:2px;">📍 Loveland</div>';
                    }
                    html += '</div>';
                });
            } else {
                html = '<div style="text-align:center;padding:40px;color:#888;">No ' + title + ' found</div>';
            }
            html += '</div>';
            
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid #ddd;margin-top:8px;flex-wrap:wrap;gap:8px;">';
            html += '<div style="font-size:13px;color:#888;">Showing ' + ((page-1)*pageSize+1) + '-' + Math.min(page*pageSize, totalRecords) + ' of ' + totalRecords + ' ' + title + '</div>';
            html += '<div style="display:flex;gap:6px;align-items:center;">';
            html += '<button onclick="loadRecords(1, currentFilter)" style="padding:4px 10px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;" ' + (page <= 1 ? 'disabled' : '') + '><i class="fas fa-angle-double-left"></i></button>';
            html += '<button onclick="loadRecords(' + (page-1) + ', currentFilter)" style="padding:4px 10px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;" ' + (page <= 1 ? 'disabled' : '') + '><i class="fas fa-angle-left"></i></button>';
            html += '<span style="font-size:13px;padding:0 8px;">' + page + ' / ' + totalPages + '</span>';
            html += '<button onclick="loadRecords(' + (page+1) + ', currentFilter)" style="padding:4px 10px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;" ' + (page >= totalPages ? 'disabled' : '') + '><i class="fas fa-angle-right"></i></button>';
            html += '<button onclick="loadRecords(' + totalPages + ', currentFilter)" style="padding:4px 10px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;" ' + (page >= totalPages ? 'disabled' : '') + '><i class="fas fa-angle-double-right"></i></button>';
            html += '</div></div>';
            
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = html;
            } else {
                console.error('Container not found:', containerId);
            }
        } catch(err) {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div style="color:red;padding:20px;text-align:center;">Error: ' + err.message + '</div>';
            }
            console.error('Error loading records:', err);
        }
    };
})();
