// Add Records page
(function() {
    let purchases = [];
    let conditions = [];
    let formats = [];
    let consignors = [];
    let searchResults = [];
    let recentAdditions = [];

    // Defaults
    let defaults = {
        sleeve: null,
        disc: null,
        price: null,
        format: null,
        consignor: 'none'
    };

    // Load purchases
    async function loadPurchases() {
        try {
            const response = await fetch('/api/inventory-purchases', {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.status === 'success') {
                purchases = data.purchases || [];
                const select = document.getElementById('add-purchase-select');
                const currentValue = select.value;
                select.innerHTML = '<option value="">-- Select a purchase --</option>';
                purchases.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    const count = p.record_count !== undefined ? ` (${p.record_count} records)` : '';
                    opt.textContent = `#${p.id} - ${p.seller_name || 'Unknown'}${count}`;
                    select.appendChild(opt);
                });
                if (currentValue && purchases.some(p => p.id == currentValue)) {
                    select.value = currentValue;
                }
                document.getElementById('add-purchase-info').textContent = `${purchases.length} purchases loaded`;
            }
        } catch (err) {
            console.error('Failed to load purchases:', err);
            document.getElementById('add-purchase-info').textContent = 'Error loading purchases';
        }
    }

    // Load conditions
    async function loadConditions() {
        try {
            const response = await fetch('/api/conditions', {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.status === 'success') {
                conditions = data.conditions || [];
                const sleeveSelect = document.getElementById('add-default-sleeve');
                const discSelect = document.getElementById('add-default-disc');
                const opts = '<option value="">Select...</option>' + conditions.map(c => 
                    `<option value="${c.id}">${c.display_name || c.condition_name}</option>`
                ).join('');
                sleeveSelect.innerHTML = opts;
                discSelect.innerHTML = opts;
            }
        } catch (err) {
            console.error('Failed to load conditions:', err);
        }
    }

    // Load formats
    async function loadFormats() {
        try {
            const response = await fetch('/api/formats', {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.status === 'success') {
                formats = data.formats || [];
                const select = document.getElementById('add-default-format');
                select.innerHTML = '<option value="">Select...</option>' + formats.map(f => 
                    `<option value="${f.id}">${f.name}</option>`
                ).join('');
            }
        } catch (err) {
            console.error('Failed to load formats:', err);
        }
    }

    // Load consignors
    async function loadConsignors() {
        try {
            const response = await fetch('/users', {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.status === 'success') {
                consignors = (data.users || []).filter(u => u.role === 'consignor');
                const select = document.getElementById('add-default-consignor');
                select.innerHTML = '<option value="none">None (store)</option>' + consignors.map(c => 
                    `<option value="${c.id}">${c.username}${c.full_name ? ' (' + c.full_name + ')' : ''}</option>`
                ).join('');
            }
        } catch (err) {
            console.error('Failed to load consignors:', err);
        }
    }

    // ===== BIND DEFAULT CHANGE EVENTS =====
    function bindDefaultEvents() {
        const defaultFields = [
            'add-default-sleeve',
            'add-default-disc',
            'add-default-price',
            'add-default-format',
            'add-default-consignor'
        ];
        
        defaultFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', function() {
                    // Re-render results instantly when any default changes
                    if (searchResults.length > 0) {
                        renderResults(searchResults);
                    }
                });
                el.addEventListener('input', function() {
                    // For price input, re-render on every keystroke
                    if (id === 'add-default-price') {
                        if (searchResults.length > 0) {
                            renderResults(searchResults);
                        }
                    }
                });
            }
        });
    }

    // Search Discogs
    window.addRecordsSearch = async function() {
        const purchaseSelect = document.getElementById('add-purchase-select');
        const purchaseId = purchaseSelect.value;
        
        if (!purchaseId) {
            showStatus('Please select a purchase first', 'error');
            return;
        }
        
        const searchInput = document.getElementById('add-search-input');
        const term = searchInput.value.trim();
        
        if (!term) {
            showStatus('Please enter a search term', 'error');
            return;
        }
        
        const resultsDiv = document.getElementById('add-results');
        resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Searching Discogs...</div>';
        
        try {
            const response = await fetch(`/api/discogs/search?q=${encodeURIComponent(term)}`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            
            if (data.status === 'success' && data.results) {
                searchResults = data.results;
                renderResults(searchResults);
                showStatus(`Found ${searchResults.length} results`, 'success');
            } else {
                resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No results found</div>';
                showStatus('No results found', 'warning');
            }
        } catch (err) {
            console.error('Search error:', err);
            resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error searching</div>';
            showStatus('Error searching: ' + err.message, 'error');
        }
    };

    window.addRecordsClear = function() {
        document.getElementById('add-search-input').value = '';
        document.getElementById('add-results').innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Select a purchase and search Discogs</div>';
        searchResults = [];
        showStatus('Cleared', 'info');
    };

    function renderResults(results) {
        const resultsDiv = document.getElementById('add-results');
        if (!results || results.length === 0) {
            resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No results found</div>';
            return;
        }
        
        // Get current defaults (read fresh from DOM each time)
        const defaultSleeve = document.getElementById('add-default-sleeve').value;
        const defaultDisc = document.getElementById('add-default-disc').value;
        const defaultPrice = document.getElementById('add-default-price').value;
        const defaultFormat = document.getElementById('add-default-format').value;
        const defaultConsignor = document.getElementById('add-default-consignor').value;
        
        let html = '';
        results.forEach((record, idx) => {
            const artist = record.artist || 'Unknown';
            const title = record.title || 'Untitled';
            const catalog = record.catalog_number || '—';
            const image = record.image_url || '';
            
            const imgHtml = image ? 
                `<img src="${image}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;">` : 
                `<div style="width:50px;height:50px;background:#e0e0e0;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#bbb;">🎵</div>`;
            
            // Determine which fields to show based on defaults
            // If default is set, field is HIDDEN (disappears instantly)
            const showSleeve = !defaultSleeve;
            const showDisc = !defaultDisc;
            const showPrice = !defaultPrice;
            const showFormat = !defaultFormat;
            const showConsignor = !defaultConsignor || defaultConsignor === 'none';
            
            html += `
                <div style="display: flex; align-items: center; gap: 10px; padding: 8px; border-bottom: 1px solid #f0f0f0; hover:background:#f8f9fa;">
                    <div style="flex: 0 0 50px;">${imgHtml}</div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #333; font-size: 14px;">${artist}</div>
                        <div style="color: #666; font-size: 13px;">${title}</div>
                        <div style="color: #999; font-size: 11px;">Catalog: ${catalog}</div>
                        ${!showPrice ? `<div style="color: #28a745; font-size: 11px; font-weight: 600;">Default Price: $${parseFloat(defaultPrice).toFixed(2)}</div>` : ''}
                        ${!showSleeve ? `<div style="color: #888; font-size: 10px;">Sleeve: ${conditions.find(c => c.id == defaultSleeve)?.display_name || ''}</div>` : ''}
                        ${!showDisc ? `<div style="color: #888; font-size: 10px;">Disc: ${conditions.find(c => c.id == defaultDisc)?.display_name || ''}</div>` : ''}
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                        ${showSleeve ? `
                            <select class="add-sleeve-select" data-index="${idx}" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px;">
                                <option value="">Sleeve</option>
                                ${conditions.map(c => `<option value="${c.id}">${c.display_name || c.condition_name}</option>`).join('')}
                            </select>
                        ` : ''}
                        ${showDisc ? `
                            <select class="add-disc-select" data-index="${idx}" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px;">
                                <option value="">Disc</option>
                                ${conditions.map(c => `<option value="${c.id}">${c.display_name || c.condition_name}</option>`).join('')}
                            </select>
                        ` : ''}
                        ${showPrice ? `
                            <input type="number" class="add-price-input" data-index="${idx}" placeholder="Price" style="width:70px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:11px;">
                        ` : ''}
                        ${showFormat ? `
                            <select class="add-format-select" data-index="${idx}" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px;">
                                <option value="">Format</option>
                                ${formats.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
                            </select>
                        ` : ''}
                        ${showConsignor ? `
                            <select class="add-consignor-select" data-index="${idx}" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px;">
                                <option value="none">None</option>
                                ${consignors.map(c => `<option value="${c.id}">${c.username}</option>`).join('')}
                            </select>
                        ` : ''}
                        <button onclick="addRecord(${idx})" style="padding: 4px 14px; background: #28a745; color: white; border: none; border-radius: 20px; cursor: pointer; font-size: 12px;">
                            <i class="fas fa-plus"></i> Add
                        </button>
                    </div>
                </div>
            `;
        });
        resultsDiv.innerHTML = html;
    }

    window.addRecord = async function(index) {
        const record = searchResults[index];
        if (!record) {
            showStatus('Record not found', 'error');
            return;
        }
        
        const purchaseSelect = document.getElementById('add-purchase-select');
        const purchaseId = purchaseSelect.value;
        
        if (!purchaseId) {
            showStatus('Please select a purchase', 'error');
            return;
        }
        
        // Get current defaults (read fresh)
        const defaultSleeve = document.getElementById('add-default-sleeve').value;
        const defaultDisc = document.getElementById('add-default-disc').value;
        const defaultPrice = document.getElementById('add-default-price').value;
        const defaultFormat = document.getElementById('add-default-format').value;
        const defaultConsignor = document.getElementById('add-default-consignor').value;
        
        const row = document.querySelectorAll('.add-sleeve-select')[index]?.closest('div');
        
        // Use values from fields if they exist, otherwise use defaults
        const sleeveSelect = row?.querySelector('.add-sleeve-select');
        const discSelect = row?.querySelector('.add-disc-select');
        const priceInput = row?.querySelector('.add-price-input');
        const formatSelect = row?.querySelector('.add-format-select');
        const consignorSelect = row?.querySelector('.add-consignor-select');
        
        const sleeveId = sleeveSelect ? parseInt(sleeveSelect.value) : (defaultSleeve ? parseInt(defaultSleeve) : null);
        const discId = discSelect ? parseInt(discSelect.value) : (defaultDisc ? parseInt(defaultDisc) : null);
        const price = priceInput ? parseFloat(priceInput.value) : (defaultPrice ? parseFloat(defaultPrice) : null);
        const formatId = formatSelect ? parseInt(formatSelect.value) : (defaultFormat ? parseInt(defaultFormat) : null);
        const consignorId = consignorSelect && consignorSelect.value !== 'none' ? parseInt(consignorSelect.value) : 
                           (defaultConsignor && defaultConsignor !== 'none' ? parseInt(defaultConsignor) : null);
        
        if (!sleeveId) {
            showStatus('Please select sleeve condition', 'error');
            return;
        }
        if (!discId) {
            showStatus('Please select disc condition', 'error');
            return;
        }
        if (!price || price <= 0) {
            showStatus('Please enter a valid price', 'error');
            return;
        }
        
        // Get current date for last_seen
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        const data = {
            artist: record.artist || 'Unknown',
            title: record.title || 'Unknown',
            catalog_number: record.catalog_number || '',
            image_url: record.image_url || '',
            discogs_genre_raw: record.genre_raw || '',
            condition_sleeve_id: sleeveId,
            condition_disc_id: discId,
            store_price: price,
            consignor_id: consignorId,
            format_id: formatId,
            batch_id: parseInt(purchaseId),
            status_id: 1,
            last_seen: today  // <-- ADD THIS: Set last_seen to current date
        };
        
        try {
            const response = await fetch('/records', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                showStatus(`✅ Added: ${record.artist} - ${record.title}`, 'success');
                addToRecent(record.artist || 'Unknown', record.title || 'Unknown', price);
                searchResults.splice(index, 1);
                renderResults(searchResults);
                loadPurchases();
                setTimeout(() => {
                    const select = document.getElementById('add-purchase-select');
                    if (select) select.value = purchaseId;
                }, 100);
            } else {
                showStatus('❌ Error: ' + (result.error || 'Failed to add'), 'error');
            }
        } catch (err) {
            console.error('Error adding record:', err);
            showStatus('❌ Error: ' + err.message, 'error');
        }
    };

    function addToRecent(artist, title, price) {
        recentAdditions.unshift({
            artist: artist,
            title: title,
            price: price,
            added: new Date().toLocaleTimeString()
        });
        if (recentAdditions.length > 20) {
            recentAdditions.pop();
        }
        renderRecent();
    }

    function renderRecent() {
        const recentDiv = document.getElementById('add-recent');
        if (recentAdditions.length === 0) {
            recentDiv.innerHTML = '<div style="text-align: center; padding: 10px; color: #999;">No records added yet</div>';
            return;
        }
        let html = '';
        recentAdditions.forEach(r => {
            html += `
                <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f5f5f5; font-size: 13px;">
                    <span>${r.artist} - ${r.title}</span>
                    <span style="color: #28a745; font-weight: bold;">$${r.price.toFixed(2)}</span>
                    <span style="color: #999; font-size: 11px;">${r.added}</span>
                </div>
            `;
        });
        recentDiv.innerHTML = html;
    }

    window.addClearRecent = function() {
        recentAdditions = [];
        renderRecent();
    };

    function showStatus(message, type) {
        const statusDiv = document.getElementById('add-status');
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        const colors = {
            success: '#d4edda',
            error: '#f8d7da',
            warning: '#fff3cd',
            info: '#cce5ff'
        };
        const textColors = {
            success: '#155724',
            error: '#721c24',
            warning: '#856404',
            info: '#004085'
        };
        statusDiv.style.background = colors[type] || '#f8f9fa';
        statusDiv.style.color = textColors[type] || '#333';
        statusDiv.style.border = `1px solid ${colors[type] || '#ddd'}`;
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }

    // Enter key to search
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('add-search-input');
        if (searchInput) {
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    window.addRecordsSearch();
                }
            });
        }
    });

    window.initAddRecords = function() {
        console.log('Add Records initialized');
        loadPurchases();
        loadConditions();
        loadFormats();
        loadConsignors();
        bindDefaultEvents(); // <-- Bind events to default fields
    };
})();