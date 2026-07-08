// ============================================================================
// inventory-ops.js - Unified Inventory Operations
// Combines Discogs search/add, inventory search, selection, print, delete,
// checkout, and COGS/purchase recording.
// ============================================================================

(function() {
    'use strict';

    console.log('📦 inventory-ops.js loading...');

    // ========== DOM Elements ==========
    const searchModeSelect = document.getElementById('searchMode');
    const searchFieldSelect = document.getElementById('searchField');
    const searchInput = document.getElementById('searchInput');
    const searchForm = document.getElementById('searchForm');
    const clearSearchBtn = document.getElementById('clearSearch');

    const recordsTableHead = document.getElementById('records-table-head');
    const recordsTableBody = document.getElementById('records-table-body');
    const statusFilterSelect = document.getElementById('record-status-filter');
    const pageSizeSelect = document.getElementById('record-page-size');
    const currentPageInput = document.getElementById('record-current-page');
    const totalPagesSpan = document.getElementById('record-total-pages');
    const showingStartSpan = document.getElementById('record-showing-start');
    const showingEndSpan = document.getElementById('record-showing-end');
    const totalFilteredSpan = document.getElementById('record-total-filtered');
    const firstPageBtn = document.getElementById('record-first-page');
    const prevPageBtn = document.getElementById('record-prev-page');
    const nextPageBtn = document.getElementById('record-next-page');
    const lastPageBtn = document.getElementById('record-last-page');

    const selectedCountSpan = document.getElementById('selected-count');
    const printSelectedBtn = document.getElementById('print-selected-btn');
    const cogsBtn = document.getElementById('cogs-btn');
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    const checkoutSelectedBtn = document.getElementById('checkout-selected-btn');
    const cancelRangeBtn = document.getElementById('cancel-range-btn');

    // ========== State ==========
    let currentSearchMode = 'checkout';
    let currentSearchField = 'all';
    let currentResults = [];
    let conditions = [];
    let consignors = [];
    let minimumPrice = null;
    let selectedConsignorId = null;
    let storePriceMultiplier = null;
    let consignorMap = {};
    let accounts = []; // for payment account dropdown
    let _initialized = false;

    let allRecords = [];
    let filteredRecords = [];
    let currentPage = 1;
    let pageSize = 50;
    let totalRecords = 0;
    let currentFilterStatus = '1';

    let currentMode = 'inventory';
    let rangeFromIndex = null;
    let rangeToIndex = null;
    let isRangeMode = false;

    // ========== Helpers ==========
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showStatus(message, type) {
        const el = document.getElementById('status-message');
        if (!el) return;
        el.textContent = message;
        el.className = 'status-message status-' + (type || 'info');
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    }

    function getStatusName(statusId) {
        const map = { 1: 'New', 2: 'Active', 3: 'Sold', 4: 'Removed' };
        return map[statusId] || 'Unknown';
    }

    function getStatusClass(statusId) {
        const map = { 1: 'new', 2: 'active', 3: 'sold', 4: 'removed' };
        return map[statusId] || '';
    }

    function generateOrderId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function getLocalMSTDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ========== API Wrappers ==========
    async function apiGet(endpoint) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} on GET ${endpoint}`);
        return res.json();
    }

    async function apiPost(endpoint, body) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} on POST ${endpoint}`);
        return res.json();
    }

    async function apiPut(endpoint, body) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            method: 'PUT',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} on PUT ${endpoint}`);
        return res.json();
    }

    async function apiDelete(endpoint) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} on DELETE ${endpoint}`);
        return res.json();
    }

    // ========== Load configs ==========
    async function loadMinimumPrice() {
        const data = await apiGet('/config/MIN_STORE_PRICE');
        minimumPrice = parseFloat(data.config_value);
    }

    async function loadStorePriceMultiplier() {
        const data = await apiGet('/config/STORE_PRICE_ESTIMATED_MULTIPLIER');
        storePriceMultiplier = parseFloat(data.config_value);
    }

    async function loadConditions() {
        const data = await apiGet('/api/conditions');
        conditions = data.conditions;
    }

    async function loadConsignors() {
        const data = await apiGet('/users');
        consignors = data.users.filter(u => u.role === 'consignor');
        consignorMap = {};
        data.users.forEach(u => { consignorMap[u.id] = { initials: u.initials || '', name: u.full_name || u.username }; });
    }

    async function loadAccounts() {
        try {
            const data = await apiGet('/api/accounting/accounts');
            accounts = data.accounts || [];
        } catch (e) {
            console.warn('Could not load accounts:', e);
            accounts = [];
        }
    }

    async function loadStats() {
        const total = await apiGet('/records/count');
        document.getElementById('total-records').textContent = total.count;
        const newCount = await apiGet('/records/count?status_id=1');
        document.getElementById('new-records-count').textContent = newCount.count;

        const lastRecordData = await apiGet('/records?limit=1&order_by=created_at&order=desc');
        const lastRecord = lastRecordData.records && lastRecordData.records.length > 0 ? lastRecordData.records[0] : null;
        if (lastRecord) {
            const artist = lastRecord.artist || 'Unknown';
            const title = lastRecord.title || 'Unknown';
            const price = lastRecord.store_price ? `$${lastRecord.store_price.toFixed(2)}` : '';
            const shortArtist = artist.length > 20 ? artist.substring(0, 20) + '…' : artist;
            const shortTitle = title.length > 20 ? title.substring(0, 20) + '…' : title;
            let display = `${shortArtist} - ${shortTitle}`;
            if (price) display += ` - ${price}`;
            document.getElementById('last-added-record').textContent = display;
        } else {
            document.getElementById('last-added-record').textContent = 'None';
        }

        const commission = await apiGet('/api/commission-rate');
        document.getElementById('commission-rate').textContent = commission.commission_rate_percent;
    }

    async function loadRecords() {
        const data = await apiGet('/records');
        allRecords = data.records || [];
        allRecords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        applyFilters();
    }

    // ========== Data & Selection ==========
    function applyFilters() {
        if (currentMode === 'search') {
            filteredRecords = currentResults.slice();
        } else {
            const statusFilter = currentFilterStatus;
            if (statusFilter === 'all') {
                filteredRecords = allRecords.slice();
            } else {
                const statusId = parseInt(statusFilter);
                filteredRecords = allRecords.filter(r => r.status_id === statusId);
            }
        }
        totalRecords = filteredRecords.length;
        const totalPages = Math.ceil(totalRecords / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        renderPagination();
        renderTablePage();
    }

    function renderPagination() {
        const totalPages = Math.ceil(totalRecords / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalRecords);
        showingStartSpan.textContent = start;
        showingEndSpan.textContent = end;
        totalFilteredSpan.textContent = totalRecords;
        totalPagesSpan.textContent = totalPages;
        currentPageInput.value = currentPage;
        firstPageBtn.disabled = currentPage === 1;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages;
        lastPageBtn.disabled = currentPage === totalPages;
    }

    function getCurrentData() {
        return filteredRecords;
    }

    function getSelectedRecords() {
        if (rangeFromIndex === null || rangeToIndex === null) return [];
        const start = Math.min(rangeFromIndex, rangeToIndex);
        const end = Math.max(rangeFromIndex, rangeToIndex);
        const data = getCurrentData();
        return data.slice(start, end + 1);
    }

    function updateSelectionCount() {
        const selected = getSelectedRecords();
        const count = selected.length;
        selectedCountSpan.textContent = count;
        const isCheckoutMode = currentSearchMode === 'checkout' && currentMode === 'inventory';
        printSelectedBtn.disabled = count === 0 || !isCheckoutMode;
        cogsBtn.disabled = count === 0 || !isCheckoutMode;
        deleteSelectedBtn.disabled = count === 0 || !isCheckoutMode;
        checkoutSelectedBtn.disabled = count === 0 || !isCheckoutMode;
        cancelRangeBtn.style.display = (rangeFromIndex !== null && rangeToIndex !== null) ? 'inline-block' : 'none';
    }

    // ========== Price Estimation (Add mode) ==========
    async function estimatePriceForRow(row, catalogNumber) {
        const sleeveSelect = row.querySelector('.sleeve-condition-select');
        const discSelect = row.querySelector('.disc-condition-select');
        const priceInput = row.querySelector('.price-input');

        const sleeveId = parseInt(sleeveSelect.value);
        const discId = parseInt(discSelect.value);
        if (!sleeveId || !discId) return;

        const sleeve = conditions.find(c => c.id === sleeveId);
        const disc = conditions.find(c => c.id === discId);
        if (!sleeve || !disc) return;

        try {
            const data = await apiPost('/api/price-estimate-v3', {
                catalog_number: catalogNumber || '',
                media_condition: disc.display_name || disc.condition_name,
                sleeve_condition: sleeve.display_name || sleeve.condition_name
            });
            if (data.status === 'success' && data.estimated_price) {
                let price = data.estimated_price;
                if (storePriceMultiplier) price = price * storePriceMultiplier;
                const dollars = Math.floor(price);
                price = dollars < 1 ? 0.99 : (dollars - 1) + 0.99;
                if (minimumPrice !== null && price < minimumPrice) price = minimumPrice;
                priceInput.value = price.toFixed(2);
                priceInput.classList.add('price-estimated');
            }
        } catch (e) {
            console.warn('Price estimation failed:', e);
        }
    }

    // ========== Render Table ==========
    function renderTablePage() {
        console.log(`🔄 renderTablePage() – mode: ${currentMode}, records: ${filteredRecords.length}`);
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredRecords.length);
        const pageRecords = filteredRecords.slice(start, end);

        let theadHtml = '';
        if (currentMode === 'search') {
            const condOptions = conditions.map(c =>
                `<option value="${c.id}">${c.display_name || c.condition_name}</option>`
            ).join('');
            const consignorOptions = consignors.map(c =>
                `<option value="${c.id}" ${c.id === selectedConsignorId ? 'selected' : ''}>${c.username}</option>`
            ).join('');

            theadHtml = `
                <tr>
                    <th style="width:60px;">Range</th>
                    <th>Artist</th>
                    <th>Title</th>
                    <th>Catalog #</th>
                    <th>Sleeve</th>
                    <th>Disc</th>
                    <th>Price</th>
                    <th>COGS</th>
                    <th>Consignor</th>
                    <th>Action</th>
                </tr>
            `;
        } else {
            theadHtml = `
                <tr>
                    <th style="width:60px;">Range</th>
                    <th>ID</th>
                    <th>Artist</th>
                    <th>Title</th>
                    <th>Price</th>
                    <th>Barcode</th>
                </tr>
            `;
        }
        recordsTableHead.innerHTML = theadHtml;

        let tbodyHtml = '';
        if (pageRecords.length === 0) {
            tbodyHtml = `<tr><td colspan="10" style="text-align:center;padding:40px;">No records found</td></tr>`;
        } else {
            const data = getCurrentData();
            pageRecords.forEach((record, idx) => {
                const globalIndex = start + idx;
                const isSelected = (rangeFromIndex !== null && rangeToIndex !== null &&
                                    globalIndex >= Math.min(rangeFromIndex, rangeToIndex) &&
                                    globalIndex <= Math.max(rangeFromIndex, rangeToIndex));

                let rowClass = isSelected ? 'record-selected' : '';
                let fromButton, toButton;
                if (!isRangeMode) {
                    fromButton = `<button class="btn-from" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button>`;
                    toButton = `<span style="color:#999;">to</span>`;
                } else {
                    if (rangeFromIndex === globalIndex) {
                        fromButton = `<span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">FROM ✓</span>`;
                        toButton = `<button class="btn-to" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>`;
                    } else if (rangeToIndex === globalIndex) {
                        fromButton = `<button class="btn-from" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button>`;
                        toButton = `<span style="background:#dc3545; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">TO ✓</span>`;
                    } else {
                        fromButton = `<button class="btn-from" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button>`;
                        toButton = `<button class="btn-to" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>`;
                    }
                }

                let rowHtml = `<tr class="${rowClass}" data-index="${globalIndex}">`;

                if (currentMode === 'search') {
                    const artist = record.artist || 'Unknown';
                    const title = record.title || 'Unknown';
                    const catalog = record.catalog_number || '';
                    const condOptions = conditions.map(c =>
                        `<option value="${c.id}">${c.display_name || c.condition_name}</option>`
                    ).join('');
                    const consignorOptions = consignors.map(c =>
                        `<option value="${c.id}" ${c.id === selectedConsignorId ? 'selected' : ''}>${c.username}</option>`
                    ).join('');

                    rowHtml += `
                        <td style="text-align:center;">${fromButton} ${toButton}</td>
                        <td>${escapeHtml(artist)}</td>
                        <td>${escapeHtml(title)}</td>
                        <td>${escapeHtml(catalog)}</td>
                        <td>
                            <select class="sleeve-condition-select" style="width:100px; padding:4px;">
                                <option value="">Select...</option>
                                ${condOptions}
                            </select>
                        </td>
                        <td>
                            <select class="disc-condition-select" style="width:100px; padding:4px;">
                                <option value="">Select...</option>
                                ${condOptions}
                            </select>
                        </td>
                        <td>
                            <input type="number" class="price-input" step="1" min="${minimumPrice !== null ? minimumPrice : 0}" value="" style="width:80px; padding:4px;">
                        </td>
                        <td>
                            <input type="number" class="cogs-input" step="0.01" min="0" value="" style="width:80px; padding:4px;">
                        </td>
                        <td>
                            <select class="consignor-select" style="width:100px; padding:4px;">
                                <option value="">None</option>
                                ${consignorOptions}
                            </select>
                        </td>
                        <td>
                            <button class="btn-add-record-from-search" data-index="${globalIndex}" style="background:#28a745; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">
                                <i class="fas fa-plus"></i> Add
                            </button>
                        </td>
                    `;
                } else {
                    const id = record.id;
                    const artist = record.artist || 'Unknown';
                    const title = record.title || 'Unknown';
                    const price = record.store_price ? `$${record.store_price.toFixed(2)}` : 'N/A';
                    const barcode = record.barcode || record.id;

                    rowHtml += `
                        <td style="text-align:center;">${fromButton} ${toButton}</td>
                        <td>${id}</td>
                        <td>${escapeHtml(artist)}</td>
                        <td>${escapeHtml(title)}</td>
                        <td>${price}</td>
                        <td><span class="barcode-value">${barcode}</span></td>
                    `;
                }

                rowHtml += `</tr>`;
                tbodyHtml += rowHtml;
            });
        }
        recordsTableBody.innerHTML = tbodyHtml;

        // Attach event listeners
        document.querySelectorAll('.btn-from').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                startRangeFrom(index);
            });
        });
        document.querySelectorAll('.btn-to').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                endRangeTo(index);
            });
        });

        // Add buttons (only in search mode)
        document.querySelectorAll('.btn-add-record-from-search').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                const row = this.closest('tr');
                const record = currentResults[index];
                if (record) addRecordFromDiscogs(row, record);
            });
        });

        // Condition change events (search mode only)
        if (currentMode === 'search') {
            document.querySelectorAll('.sleeve-condition-select').forEach(sel => {
                sel.addEventListener('change', function() {
                    const row = this.closest('tr');
                    const discSelect = row.querySelector('.disc-condition-select');
                    if (this.value) discSelect.value = this.value;
                    const catalog = row.querySelector('td:nth-child(4)')?.textContent?.trim() || '';
                    estimatePriceForRow(row, catalog);
                });
            });
            document.querySelectorAll('.disc-condition-select').forEach(sel => {
                sel.addEventListener('change', function() {
                    const row = this.closest('tr');
                    const catalog = row.querySelector('td:nth-child(4)')?.textContent?.trim() || '';
                    estimatePriceForRow(row, catalog);
                });
            });
        }

        updateSelectionCount();
    }

    // ========== Range Selection ==========
    function startRangeFrom(index) {
        rangeFromIndex = index;
        rangeToIndex = null;
        isRangeMode = true;
        renderTablePage();
        showStatus('From record selected. Click "to" on another record to select range.', 'info');
    }

    function endRangeTo(index) {
        if (rangeFromIndex === null) {
            showStatus('Select "from" first', 'warning');
            return;
        }
        rangeToIndex = index;
        renderTablePage();
        const selected = getSelectedRecords();
        showStatus(`Selected ${selected.length} records`, 'success');
        updateSelectionCount();
    }

    function cancelRangeSelection() {
        rangeFromIndex = null;
        rangeToIndex = null;
        isRangeMode = false;
        renderTablePage();
        updateSelectionCount();
        showStatus('Selection cleared', 'info');
    }

    // ========== Add Record from Discogs ==========
    async function addRecordFromDiscogs(row, discogsRecord) {
        const priceInput = row.querySelector('.price-input');
        const cogsInput = row.querySelector('.cogs-input');
        const consignorSelect = row.querySelector('.consignor-select');
        const sleeveSelect = row.querySelector('.sleeve-condition-select');
        const discSelect = row.querySelector('.disc-condition-select');

        const price = parseFloat(priceInput.value);
        const cogs = cogsInput.value ? parseFloat(cogsInput.value) : null;
        const consignorId = consignorSelect.value ? parseInt(consignorSelect.value) : null;
        const sleeveId = parseInt(sleeveSelect.value);
        const discId = parseInt(discSelect.value);

        if (!sleeveId || !discId) {
            showStatus('Please select sleeve and disc conditions', 'warning');
            return;
        }
        if (!price || price <= 0) {
            showStatus('Please enter a valid price', 'warning');
            return;
        }

        const recordData = {
            artist: discogsRecord.artist,
            title: discogsRecord.title,
            discogs_genre_raw: discogsRecord.genre_raw || '',
            image_url: discogsRecord.image_url || '',
            catalog_number: discogsRecord.catalog_number || '',
            condition_sleeve_id: sleeveId,
            condition_disc_id: discId,
            store_price: price,
            cogs: cogs,
            consignor_id: consignorId,
            status_id: 1,
            notes: null
        };

        const result = await apiPost('/records', recordData);
        showStatus(`✅ Record #${result.record.id} added successfully!`, 'success');
        clearSearch();
        await loadRecords();
        await loadStats();
    }

    // ========== Search Logic ==========
    async function performSearch(term) {
        if (!term) { clearSearch(); return; }
        const mode = searchModeSelect.value; // 'add' or 'checkout'

        if (mode === 'add') {
            // Discogs search
            currentMode = 'search';
            recordsTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Searching Discogs...</td></tr>`;
            try {
                const data = await apiGet('/api/discogs/search?q=' + encodeURIComponent(term));
                console.log('📦 Discogs response:', data);
                if (!data.results || !data.results.length) {
                    recordsTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;">No Discogs results found</td></tr>`;
                    return;
                }
                currentResults = data.results.map(r => {
                    let artist = r.artist || 'Unknown';
                    let title = r.title || 'Unknown';
                    if (artist === 'Unknown' && title.includes(' - ')) {
                        const parts = title.split(' - ');
                        artist = parts[0].trim();
                        title = parts.slice(1).join(' - ').trim();
                    }
                    if (Array.isArray(artist)) artist = artist[0] || 'Unknown';
                    return { ...r, artist, title };
                });
                filteredRecords = currentResults.slice();
                totalRecords = filteredRecords.length;
                currentPage = 1;
                renderPagination();
                renderTablePage();
                showStatus(`Found ${totalRecords} Discogs results`, 'success');
            } catch (error) {
                console.error('Discogs search error:', error);
                recordsTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;">Error searching Discogs: ${error.message}</td></tr>`;
            }
        } else {
            // Checkout mode: search local DB
            currentMode = 'inventory';
            recordsTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Searching inventory...</td></tr>`;
            try {
                const data = await apiGet('/records/search?q=' + encodeURIComponent(term));
                if (!data.records || !data.records.length) {
                    recordsTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;">No records found in inventory</td></tr>`;
                    return;
                }
                const recs = data.records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                allRecords = recs;
                applyFilters();
                showStatus(`Found ${totalRecords} inventory records`, 'success');
            } catch (error) {
                console.error('Inventory search error:', error);
                recordsTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;">Error searching inventory: ${error.message}</td></tr>`;
            }
        }
    }

    function clearSearch() {
        searchInput.value = '';
        currentMode = 'inventory';
        currentResults = [];
        loadRecords();
        showStatus('Search cleared', 'info');
    }

    // ========== Print Selected (no COGS modal) ==========
    function printSelected() {
        const selected = getSelectedRecords();
        if (selected.length === 0) { showStatus('No records selected', 'warning'); return; }
        generatePDF(selected);
    }

    // ========== PDF Generation ==========
    async function generatePDF(records) {
        if (!records.length) { showStatus('No records to print', 'warning'); return; }
        const { jsPDF } = window.jspdf;

        const labelWidthMM = parseFloat((await apiGet('/config/LABEL_WIDTH_MM')).config_value);
        const labelHeightMM = parseFloat((await apiGet('/config/LABEL_HEIGHT_MM')).config_value);
        const leftMarginMM = parseFloat((await apiGet('/config/LEFT_MARGIN_MM')).config_value);
        const gutterSpacingMM = parseFloat((await apiGet('/config/GUTTER_SPACING_MM')).config_value);
        const topMarginMM = parseFloat((await apiGet('/config/TOP_MARGIN_MM')).config_value);
        const priceFontSize = parseInt((await apiGet('/config/PRICE_FONT_SIZE')).config_value);
        const textFontSize = parseInt((await apiGet('/config/TEXT_FONT_SIZE')).config_value);
        const barcodeHeightMM = parseFloat((await apiGet('/config/BARCODE_HEIGHT')).config_value);
        const printBorders = (await apiGet('/config/PRINT_BORDERS')).config_value === 'true';
        const priceYPosMM = parseFloat((await apiGet('/config/PRICE_Y_POS')).config_value);
        const barcodeYPosMM = parseFloat((await apiGet('/config/BARCODE_Y_POS')).config_value);
        const infoYPosMM = parseFloat((await apiGet('/config/INFO_Y_POS')).config_value);

        const mmToPt = 2.83465;
        const labelWidthPt = labelWidthMM * mmToPt;
        const labelHeightPt = labelHeightMM * mmToPt;
        const leftMarginPt = leftMarginMM * mmToPt;
        const gutterSpacingPt = gutterSpacingMM * mmToPt;
        const topMarginPt = topMarginMM * mmToPt;
        const barcodeHeightPt = barcodeHeightMM * mmToPt;

        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
        const rows = 15, cols = 4, labelsPerPage = rows * cols;
        let currentLabel = 0, pageNumber = 0;

        for (const record of records) {
            const pageIndex = currentLabel % labelsPerPage;
            const pageNum = Math.floor(currentLabel / labelsPerPage);
            if (pageNum > pageNumber) { doc.addPage(); pageNumber = pageNum; }

            const row = Math.floor(pageIndex / cols);
            const col = pageIndex % cols;
            const x = leftMarginPt + col * (labelWidthPt + gutterSpacingPt);
            const y = topMarginPt + row * labelHeightPt;

            if (printBorders) {
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.rect(x, y, labelWidthPt, labelHeightPt);
            }

            const genre = (record.discogs_genre_raw || '').split(',')[0].trim();
            const consignor = record.consignor_id && consignorMap[record.consignor_id] ? consignorMap[record.consignor_id].initials : '';
            let infoText = record.artist || 'Unknown';
            if (genre) infoText = genre + ' | ' + infoText;
            if (consignor) infoText += ' (' + consignor + ')';

            doc.setFontSize(textFontSize);
            doc.setFont('helvetica', 'normal');
            let displayText = infoText;
            const maxWidth = labelWidthPt - 10;
            if (doc.getTextWidth(displayText) > maxWidth) {
                while (doc.getTextWidth(displayText + '…') > maxWidth && displayText.length > 0) displayText = displayText.slice(0, -1);
                displayText += '…';
            }
            const infoWidth = doc.getTextWidth(displayText);
            doc.text(displayText, x + (labelWidthPt - infoWidth)/2, y + infoYPosMM * mmToPt);

            const priceText = '$' + (record.store_price || 0).toFixed(2);
            doc.setFontSize(priceFontSize);
            doc.setFont('helvetica', 'bold');
            const priceWidth = doc.getTextWidth(priceText);
            doc.text(priceText, x + (labelWidthPt - priceWidth)/2, y + priceYPosMM * mmToPt);

            const barcodeNum = record.barcode || record.id;
            if (barcodeNum) {
                const canvas = document.createElement('canvas');
                JsBarcode(canvas, barcodeNum.toString(), { format: 'CODE128', displayValue: false, height: 30, width: 2, margin: 0 });
                const barcodeData = canvas.toDataURL('image/png');
                const barcodeWidth = 40;
                doc.addImage(barcodeData, 'PNG', x + (labelWidthPt - barcodeWidth)/2, y + barcodeYPosMM * mmToPt, barcodeWidth, barcodeHeightPt);
            }
            currentLabel++;
        }

        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
        showStatus(`PDF generated with ${records.length} labels`, 'success');
    }

    // ========== Delete Selected ==========
    async function deleteSelected() {
        const selected = getSelectedRecords();
        if (selected.length === 0) { showStatus('No records selected', 'warning'); return; }
        if (!confirm(`Delete ${selected.length} record(s) permanently? This cannot be undone.`)) return;
        showStatus(`Deleting ${selected.length} records...`, 'info');
        let deleted = 0;
        for (const record of selected) {
            try {
                await apiDelete('/records/' + record.id);
                deleted++;
            } catch (e) {
                console.error('Delete failed for record', record.id, e);
            }
        }
        await loadRecords();
        await loadStats();
        showStatus(`Deleted ${deleted} of ${selected.length} records`, deleted > 0 ? 'success' : 'error');
        cancelRangeSelection();
    }

    // ========== COGS / Purchase Modal ==========
    function showCogsPurchaseModal() {
        const selected = getSelectedRecords();
        if (selected.length === 0) {
            showStatus('Please select records first', 'warning');
            return;
        }

        let modal = document.getElementById('cogs-purchase-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'cogs-purchase-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 600px; width: 95%;">
                    <div class="modal-header" style="background: #17a2b8; color: white;">
                        <h3 class="modal-title"><i class="fas fa-dollar-sign"></i> Record Purchase & Apply COGS</h3>
                        <button class="modal-close" onclick="document.getElementById('cogs-purchase-modal').style.display='none'" style="color: white;">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p><strong>${selected.length}</strong> record(s) selected. Enter the purchase details below.</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div>
                                <label for="cogs-purchase-date" style="display:block; font-weight:500; margin-bottom:4px;">Purchase Date *</label>
                                <input type="date" id="cogs-purchase-date" class="form-control" style="width:100%; padding:8px;">
                            </div>
                            <div>
                                <label for="cogs-seller-name" style="display:block; font-weight:500; margin-bottom:4px;">Seller Name *</label>
                                <input type="text" id="cogs-seller-name" class="form-control" placeholder="e.g., John's Records" style="width:100%; padding:8px;">
                            </div>
                            <div>
                                <label for="cogs-seller-contact" style="display:block; font-weight:500; margin-bottom:4px;">Seller Contact</label>
                                <input type="text" id="cogs-seller-contact" class="form-control" placeholder="Email or Phone" style="width:100%; padding:8px;">
                            </div>
                            <div>
                                <label for="cogs-amount-spent" style="display:block; font-weight:500; margin-bottom:4px;">Amount Spent ($) *</label>
                                <input type="number" id="cogs-amount-spent" step="0.01" min="0.01" class="form-control" placeholder="0.00" style="width:100%; padding:8px;">
                            </div>
                            <div style="grid-column: 1 / -1;">
                                <label for="cogs-payment-account" style="display:block; font-weight:500; margin-bottom:4px;">Payment Account</label>
                                <select id="cogs-payment-account" class="form-control" style="width:100%; padding:8px;">
                                    <option value="">-- Select how you paid --</option>
                                </select>
                            </div>
                            <div style="grid-column: 1 / -1;">
                                <label for="cogs-description" style="display:block; font-weight:500; margin-bottom:4px;">Description</label>
                                <textarea id="cogs-description" rows="3" class="form-control" placeholder="What was purchased? (e.g., 50 records from estate sale)" style="width:100%; padding:8px;"></textarea>
                            </div>
                            <div style="grid-column: 1 / -1;">
                                <label for="cogs-bill-image" style="display:block; font-weight:500; margin-bottom:4px;">Bill of Sale (Image)</label>
                                <input type="file" id="cogs-bill-image" accept="image/*,application/pdf" style="width:100%; padding:8px;">
                                <div id="cogs-bill-preview" style="margin-top:8px;"></div>
                            </div>
                        </div>
                        <div id="cogs-purchase-status" style="margin-top:10px; padding:8px; border-radius:4px; display:none;"></div>
                    </div>
                    <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;">
                        <button class="btn btn-secondary" onclick="document.getElementById('cogs-purchase-modal').style.display='none'">Cancel</button>
                        <button class="btn btn-success" id="cogs-submit-btn"><i class="fas fa-check"></i> Apply COGS & Record Purchase</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Set default date
        const dateInput = document.getElementById('cogs-purchase-date');
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
        }

        // Populate payment account dropdown
        const accountSelect = document.getElementById('cogs-payment-account');
        if (accountSelect) {
            accountSelect.innerHTML = '<option value="">-- Select how you paid --</option>';
            accounts.forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.code;  // use code as identifier, will be sent as payment_account_id
                opt.textContent = `${acc.code} - ${acc.name}`;
                accountSelect.appendChild(opt);
            });
        }

        // Reset preview
        document.getElementById('cogs-bill-preview').innerHTML = '';

        // Show modal
        modal.style.display = 'flex';

        // Remove old listeners to avoid duplicates
        const submitBtn = document.getElementById('cogs-submit-btn');
        const newSubmit = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmit, submitBtn);

        newSubmit.addEventListener('click', async function() {
            await handleCogsPurchaseSubmit();
        });

        // File preview
        const fileInput = document.getElementById('cogs-bill-image');
        const previewDiv = document.getElementById('cogs-bill-preview');
        fileInput.onchange = function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = function(ev) {
                        previewDiv.innerHTML = `
                            <img src="${ev.target.result}" alt="Bill preview" style="max-width:200px; max-height:200px; border-radius:4px; border:1px solid #ddd;">
                            <p style="font-size:12px; color:#666; margin-top:5px;">${file.name}</p>
                        `;
                    };
                    reader.readAsDataURL(file);
                } else {
                    previewDiv.innerHTML = `<p style="color:#666;"><i class="fas fa-file-pdf"></i> ${file.name}</p>`;
                }
            } else {
                previewDiv.innerHTML = '';
            }
        };
    }

    async function handleCogsPurchaseSubmit() {
        const statusDiv = document.getElementById('cogs-purchase-status');
        const submitBtn = document.getElementById('cogs-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        // Gather data
        const purchaseDate = document.getElementById('cogs-purchase-date').value;
        const sellerName = document.getElementById('cogs-seller-name').value.trim();
        const sellerContact = document.getElementById('cogs-seller-contact').value.trim();
        const amountSpent = parseFloat(document.getElementById('cogs-amount-spent').value);
        const paymentAccount = document.getElementById('cogs-payment-account').value;
        const description = document.getElementById('cogs-description').value.trim();
        const billFile = document.getElementById('cogs-bill-image').files[0];

        // Validate
        if (!purchaseDate) { showCogsStatus('Please select a purchase date', 'error'); submitBtn.disabled=false; submitBtn.innerHTML='<i class="fas fa-check"></i> Apply COGS & Record Purchase'; return; }
        if (!sellerName) { showCogsStatus('Please enter seller name', 'error'); submitBtn.disabled=false; submitBtn.innerHTML='<i class="fas fa-check"></i> Apply COGS & Record Purchase'; return; }
        if (isNaN(amountSpent) || amountSpent <= 0) { showCogsStatus('Please enter a valid amount greater than 0', 'error'); submitBtn.disabled=false; submitBtn.innerHTML='<i class="fas fa-check"></i> Apply COGS & Record Purchase'; return; }

        // Get selected records again (they might have changed)
        const selected = getSelectedRecords();
        if (selected.length === 0) {
            showCogsStatus('No records selected. Please select records first.', 'error');
            submitBtn.disabled=false; submitBtn.innerHTML='<i class="fas fa-check"></i> Apply COGS & Record Purchase';
            return;
        }

        let billPath = null;
        if (billFile) {
            const formData = new FormData();
            formData.append('bill_image', billFile);
            try {
                const uploadRes = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases/upload-bill`, {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                });
                const uploadData = await uploadRes.json();
                if (uploadData.status === 'success') {
                    billPath = uploadData.file_path;
                } else {
                    showCogsStatus(`Image upload failed: ${uploadData.error}`, 'error');
                    submitBtn.disabled=false; submitBtn.innerHTML='<i class="fas fa-check"></i> Apply COGS & Record Purchase';
                    return;
                }
            } catch (err) {
                showCogsStatus(`Image upload error: ${err.message}`, 'error');
                submitBtn.disabled=false; submitBtn.innerHTML='<i class="fas fa-check"></i> Apply COGS & Record Purchase';
                return;
            }
        }

        // Build purchase data
        const purchaseData = {
            purchase_date: purchaseDate,
            seller_name: sellerName,
            seller_contact: sellerContact,
            amount_spent: amountSpent,
            description: description,
            payment_account_id: paymentAccount || null,
            bill_of_sale_path: billPath
        };

        try {
            // 1. Create purchase record
            const createResponse = await fetch(`${AppConfig.baseUrl}/api/inventory-purchases`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify(purchaseData)
            });
            const createResult = await createResponse.json();
            if (createResult.status !== 'success') {
                throw new Error(createResult.error || 'Failed to record purchase');
            }
            const purchaseId = createResult.purchase.id;

            // 2. Apply batch COGS
            const recordIds = selected.map(r => r.id);
            const cogsResponse = await fetch(`${AppConfig.baseUrl}/api/cogs/batch`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    batch_cogs: amountSpent,
                    record_ids: recordIds
                })
            });
            const cogsResult = await cogsResponse.json();
            if (cogsResult.status !== 'success') {
                throw new Error(cogsResult.error || 'Failed to apply COGS');
            }

            // Success
            showCogsStatus(`✅ Purchase #${purchaseId} recorded and COGS applied to ${cogsResult.records_updated} records.`, 'success');
            setTimeout(() => {
                document.getElementById('cogs-purchase-modal').style.display = 'none';
                // Refresh table
                loadRecords();
                // Reset selection?
                cancelRangeSelection();
            }, 1500);

        } catch (error) {
            showCogsStatus(`❌ Error: ${error.message}`, 'error');
            console.error('COGS purchase error:', error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-check"></i> Apply COGS & Record Purchase';
        }
    }

    function showCogsStatus(message, type = 'info') {
        const el = document.getElementById('cogs-purchase-status');
        if (!el) return;
        el.textContent = message;
        el.className = `status-message status-${type}`;
        el.style.display = 'block';
    }

    // ========== Checkout Modal ==========
    function showCheckoutModal() {
        const selected = getSelectedRecords();
        if (selected.length === 0) { showStatus('No records selected', 'warning'); return; }

        const subtotal = selected.reduce((sum, r) => sum + (r.store_price || 0), 0);
        const taxRate = parseFloat(window.dbConfigValues?.TAX_RATE?.value || 0) / 100;
        const tax = subtotal * taxRate;
        const total = subtotal + tax;

        let modal = document.getElementById('checkout-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'checkout-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 600px; width: 90%;">
                    <div class="modal-header" style="background: #007bff; color: white;">
                        <h3 class="modal-title"><i class="fas fa-shopping-cart"></i> Checkout</h3>
                        <button class="modal-close" onclick="document.getElementById('checkout-modal').style.display='none'" style="color: white;">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div id="checkout-items-list" style="max-height: 200px; overflow-y: auto; margin-bottom: 15px;"></div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-weight: bold;">
                            <div>Subtotal:</div><div id="checkout-subtotal" style="text-align: right;">$0.00</div>
                            <div>Tax (${(taxRate*100).toFixed(1)}%):</div><div id="checkout-tax" style="text-align: right;">$0.00</div>
                            <div style="font-size: 1.2em;">Total:</div><div id="checkout-total" style="text-align: right; font-size: 1.2em;">$0.00</div>
                        </div>
                        <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                            <button class="btn btn-cash" id="checkout-cash-btn" style="background: #28a745; color: white;"><i class="fas fa-money-bill-wave"></i> Cash</button>
                            <button class="btn btn-square" id="checkout-square-btn" style="background: #6f42c1; color: white;"><i class="fas fa-square"></i> Square</button>
                            <button class="btn btn-giftcard" id="checkout-giftcard-btn" style="background: #ff6b6b; color: white;"><i class="fas fa-gift"></i> Gift Card</button>
                        </div>
                        <div id="checkout-status" style="margin-top: 10px; text-align: center; color: #666;"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('checkout-modal').style.display='none'">Cancel</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const list = document.getElementById('checkout-items-list');
        let html = '<ul style="list-style:none; padding:0;">';
        selected.forEach(r => {
            html += `<li style="padding:4px 0; border-bottom:1px solid #eee;">${escapeHtml(r.artist)} - ${escapeHtml(r.title)} - $${(r.store_price||0).toFixed(2)}</li>`;
        });
        html += '</ul>';
        list.innerHTML = html;
        document.getElementById('checkout-subtotal').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('checkout-tax').textContent = `$${tax.toFixed(2)}`;
        document.getElementById('checkout-total').textContent = `$${total.toFixed(2)}`;

        document.getElementById('checkout-cash-btn').onclick = () => processCashCheckout(selected, total, subtotal, tax);
        document.getElementById('checkout-square-btn').onclick = () => processSquareCheckout(selected, total);
        document.getElementById('checkout-giftcard-btn').onclick = () => processGiftCardCheckout(selected, total);

        modal.style.display = 'flex';
    }

    // ========== Payment Handlers ==========
    async function processCashCheckout(records, total, subtotal, tax) {
        const tenderStr = prompt('Enter amount tendered:', total.toFixed(2));
        if (tenderStr === null) return;
        const tendered = parseFloat(tenderStr);
        if (isNaN(tendered) || tendered < total) {
            showStatus('Insufficient payment', 'error');
            return;
        }
        const change = tendered - total;
        await completeSale(records, 'cash', { tendered, change });
        document.getElementById('checkout-modal').style.display = 'none';
        showStatus(`Cash sale completed. Change: $${change.toFixed(2)}`, 'success');
    }

    async function processSquareCheckout(records, total) {
        await completeSale(records, 'square', { external_transaction_id: 'SQUARE-' + Date.now() });
        document.getElementById('checkout-modal').style.display = 'none';
        showStatus('Square sale completed (simulated)', 'success');
    }

    async function processGiftCardCheckout(records, total) {
        const code = prompt('Enter gift card code:');
        if (!code) return;
        await completeSale(records, 'giftcard', { external_transaction_id: 'GIFT-' + code });
        document.getElementById('checkout-modal').style.display = 'none';
        showStatus('Gift card sale completed (simulated)', 'success');
    }

    async function completeSale(records, paymentSource, extra = {}) {
        const dateStr = new Date().toISOString();
        const orderId = generateOrderId();
        const orderNumber = `SALE-${Date.now()}`;
        const subtotal = records.reduce((s, r) => s + (r.store_price || 0), 0);
        const taxRate = parseFloat(window.dbConfigValues?.TAX_RATE?.value || 0) / 100;
        const tax = subtotal * taxRate;
        const total = subtotal + tax;

        const orderData = {
            id: orderId,
            order_number: orderNumber,
            customer_name: 'Walk-in Customer',
            customer_email: '',
            shipping_method: 'pickup',
            shipping_cost: 0,
            subtotal: subtotal,
            tax: tax,
            total: total,
            payment_status: 'paid',
            order_status: 'completed',
            created_at: dateStr,
            updated_at: dateStr,
            channel: paymentSource === 'square' ? 'square_pos' : paymentSource === 'discogs' ? 'discogs' : 'manual',
            is_accounted: 0,
            external_order_id: extra.external_transaction_id || null
        };

        const items = records.map(r => ({
            record_id: r.id,
            record_title: r.title || 'Unknown Title',
            record_artist: r.artist || 'Unknown Artist',
            record_condition: r.condition || null,
            price_at_time: r.store_price || 0
        }));

        const payment = {
            source: paymentSource,
            gross_amount: total,
            transaction_date: dateStr,
            external_transaction_id: extra.external_transaction_id || null
        };

        const payload = { order: orderData, items, payment };

        try {
            const response = await fetch(`${window.AppConfig.baseUrl}/api/checkout/create-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(`Order creation failed: ${response.status}`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.error || 'Order creation failed');
        } catch (error) {
            console.error('Order creation error:', error);
            showStatus('Order creation failed: ' + error.message, 'error');
            return;
        }

        const todayMST = getLocalMSTDate();
        let success = 0;
        for (const record of records) {
            try {
                await apiPut('/records/' + record.id, {
                    status_id: 3,
                    date_sold: todayMST,
                    actual_sale_price: record.store_price
                });
                success++;
            } catch (e) {
                console.error('Failed to update record', record.id, e);
            }
        }
        showStatus(`${success} of ${records.length} records marked as sold`, 'success');
        await loadRecords();
        cancelRangeSelection();
    }

    // ========== Init ==========
    async function init() {
        console.log('🔄 inventory-ops: Initializing...');

        if (_initialized) {
            await loadMinimumPrice();
            await loadStorePriceMultiplier();
            await loadConditions();
            await loadConsignors();
            await loadAccounts();
            await loadRecords();
            await loadStats();
            return;
        }

        await loadMinimumPrice();
        await loadStorePriceMultiplier();
        await loadConditions();
        await loadConsignors();
        await loadAccounts();
        await loadRecords();
        await loadStats();

        // Search – prevent tab switching
        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const term = searchInput.value.trim();
            if (term) performSearch(term);
        });
        clearSearchBtn.addEventListener('click', clearSearch);

        statusFilterSelect.addEventListener('change', function() {
            currentFilterStatus = this.value;
            currentPage = 1;
            if (currentMode === 'inventory') applyFilters();
            else { currentMode = 'inventory'; applyFilters(); }
        });
        pageSizeSelect.addEventListener('change', function() {
            pageSize = parseInt(this.value);
            currentPage = 1;
            applyFilters();
        });
        currentPageInput.addEventListener('change', function() {
            let page = parseInt(this.value);
            const totalPages = Math.ceil(totalRecords / pageSize) || 1;
            if (isNaN(page) || page < 1) page = 1;
            if (page > totalPages) page = totalPages;
            currentPage = page;
            renderPagination();
            renderTablePage();
        });
        firstPageBtn.addEventListener('click', () => { currentPage = 1; renderPagination(); renderTablePage(); });
        prevPageBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPagination(); renderTablePage(); } });
        nextPageBtn.addEventListener('click', () => { const totalPages = Math.ceil(totalRecords / pageSize) || 1; if (currentPage < totalPages) { currentPage++; renderPagination(); renderTablePage(); } });
        lastPageBtn.addEventListener('click', () => { const totalPages = Math.ceil(totalRecords / pageSize) || 1; currentPage = totalPages; renderPagination(); renderTablePage(); });

        // Toolbar buttons
        printSelectedBtn.addEventListener('click', printSelected);
        cogsBtn.addEventListener('click', showCogsPurchaseModal);
        deleteSelectedBtn.addEventListener('click', deleteSelected);
        checkoutSelectedBtn.addEventListener('click', showCheckoutModal);
        cancelRangeBtn.addEventListener('click', cancelRangeSelection);

        clearSearch();

        _initialized = true;
        console.log('✅ inventory-ops.js initialized');
    }

    window.initAddRecordsTab = init;
})();