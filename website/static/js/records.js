// Shared records component - used by both Shop and New
(function() {
    let currentPage = 1;
    const pageSize = 24;
    let totalRecords = 0;
    let allRecords = [];
    let currentFilter = {};

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
                    html += '<div style="background:#f8f8f8;border-radius:8px;padding:10px;border:1px solid #eee;cursor:pointer;transition:all 0.2s;" onclick="alert(\'' + (record.artist || 'Unknown') + ' - ' + (record.title || 'Untitled') + '\')">';
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
