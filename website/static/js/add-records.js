// ============================================================================
// add-records.js - Add Records tab with unified table for Discogs search and inventory
// Combines Discogs search, record creation, record table with pagination,
// range selection, PDF generation, batch COGS, and status updates.
// ============================================================================

(function() {
    'use strict';

    console.log('🏷️ add-records.js loading...');

    // ========== DOM Elements ==========
    let searchFieldSelect = document.getElementById('searchField');
    let searchInput = document.getElementById('searchInput');
    let searchForm = document.getElementById('searchForm');
    let clearSearchBtn = document.getElementById('clearSearch');

    // Record table elements
    let recordsTableHead = document.getElementById('records-table-head');
    let recordsTableBody = document.getElementById('records-table-body');
    let totalRecordsSpan = document.getElementById('record-total-count');
    let statusFilterSelect = document.getElementById('record-status-filter');
    let pageSizeSelect = document.getElementById('record-page-size');
    let currentPageInput = document.getElementById('record-current-page');
    let totalPagesSpan = document.getElementById('record-total-pages');
    let showingStartSpan = document.getElementById('record-showing-start');
    let showingEndSpan = document.getElementById('record-showing-end');
    let totalFilteredSpan = document.getElementById('record-total-filtered');
    let firstPageBtn = document.getElementById('record-first-page');
    let prevPageBtn = document.getElementById('record-prev-page');
    let nextPageBtn = document.getElementById('record-next-page');
    let lastPageBtn = document.getElementById('record-last-page');

    // Selection & print
    let selectedCountSpan = document.getElementById('selected-count');
    let printSelectedBtn = document.getElementById('print-selected-btn');
    let cancelRangeBtn = document.getElementById('cancel-range-btn');

    // Batch COGS
    let batchCogsAmount = document.getElementById('batch-cogs-amount');
    let applyBatchCogsBtn = document.getElementById('apply-batch-cogs-btn');
    let batchCogsResultDiv = document.getElementById('batch-cogs-result');

    // ========== State ==========
    let currentSearchField = 'all';
    let currentResults = [];
    let conditions = [];
    let consignors = [];
    let minimumPrice = null;
    let selectedConsignorId = null;
    let defaultSleeveConditionId = null;
    let defaultDiscConditionId = null;
    let defaultNotes = null;
    let defaultCogs = null;
    let autoEstimatePrice = true;
    let storePriceMultiplier = null;
    let consignorMap = {};
    let _initialized = false;

    // Record table state
    let allRecords = [];
    let filteredRecords = [];
    let currentPage = 1;
    let pageSize = 50;
    let totalRecords = 0;
    let currentFilterStatus = '1'; // default: new records

    // Mode: 'inventory' or 'search'
    let currentMode = 'inventory';

    // Range selection state
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

    // ========== API Wrappers – no error handling ==========
    async function apiGet(endpoint) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} on GET ${endpoint}: ${res.statusText}`);
        return res.json();
    }

    async function apiPost(endpoint, body) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} on POST ${endpoint}: ${res.statusText}`);
        return res.json();
    }

    async function apiPut(endpoint, body) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            method: 'PUT',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} on PUT ${endpoint}: ${res.statusText}`);
        return res.json();
    }

    async function apiDelete(endpoint) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            method: 'DELETE',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} on DELETE ${endpoint}: ${res.statusText}`);
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

    // ========== Load records for table ==========
    async function loadRecords() {
        const data = await apiGet('/records');
        allRecords = data.records || [];
        allRecords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        applyFilters();
    }

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
        printSelectedBtn.disabled = count === 0 || currentMode !== 'inventory';
        cancelRangeBtn.style.display = (rangeFromIndex !== null && rangeToIndex !== null) ? 'inline-block' : 'none';
    }

    // ========== Price Estimation ==========
    async function estimatePriceForRow(row, catalogNumber) {
        const sleeveSelect = row.querySelector('.sleeve-condition-select');
        const discSelect = row.querySelector('.disc-condition-select');
        const priceInput = row.querySelector('.price-input');

        const sleeveId = parseInt(sleeveSelect.value);
        const discId = parseInt(discSelect.value);
        if (!sleeveId || !discId) return;

        // Get condition names
        const sleeve = conditions.find(c => c.id === sleeveId);
        const disc = conditions.find(c => c.id === discId);
        if (!sleeve || !disc) return;

        // Call price estimate endpoint
        try {
            const data = await apiPost('/api/price-estimate-v3', {
                catalog_number: catalogNumber || '',
                media_condition: disc.display_name || disc.condition_name,
                sleeve_condition: sleeve.display_name || sleeve.condition_name
            });
            if (data.status === 'success' && data.estimated_price) {
                let price = data.estimated_price;
                // Apply multiplier and rounding logic (match existing pattern)
                if (storePriceMultiplier) {
                    price = price * storePriceMultiplier;
                }
                // Round to nearest dollar minus 0.01 (e.g., 9.99)
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
        console.log(`🔄 renderTablePage() called – mode: ${currentMode}, records: ${filteredRecords.length}`);
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredRecords.length);
        const pageRecords = filteredRecords.slice(start, end);
        console.log(`📄 Rendering page ${currentPage}, rows ${start+1}–${end} (${pageRecords.length} items)`);

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
                    <th>Created</th>
                    <th>Artist</th>
                    <th>Title</th>
                    <th>Price</th>
                    <th>COGS</th>
                    <th>Catalog #</th>
                    <th>Sleeve</th>
                    <th>Disc</th>
                    <th>Barcode</th>
                    <th>Consignor</th>
                    <th>Status</th>
                </tr>
            `;
        }
        recordsTableHead.innerHTML = theadHtml;

        let tbodyHtml = '';
        if (pageRecords.length === 0) {
            tbodyHtml = `<tr><td colspan="13" style="text-align:center;padding:40px;">No records found</td></tr>`;
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
                    const created = record.created_at ? new Date(record.created_at).toLocaleDateString() : 'Unknown';
                    const artist = record.artist || 'Unknown';
                    const title = record.title || 'Unknown';
                    const price = record.store_price ? `$${record.store_price.toFixed(2)}` : 'N/A';
                    const cogs = record.cogs ? `$${record.cogs.toFixed(2)}` : '—';
                    const catalog = record.catalog_number || '—';
                    const sleeve = record.sleeve_condition_name || '—';
                    const disc = record.disc_condition_name || '—';
                    const barcode = record.barcode || record.id;
                    const consignor = record.consignor_id && consignorMap[record.consignor_id] ? consignorMap[record.consignor_id].initials : '—';
                    const statusClass = getStatusClass(record.status_id);
                    const statusName = getStatusName(record.status_id);

                    rowHtml += `
                        <td style="text-align:center;">${fromButton} ${toButton}</td>
                        <td>${id}</td>
                        <td>${created}</td>
                        <td>${escapeHtml(artist)}</td>
                        <td>${escapeHtml(title)}</td>
                        <td>${price}</td>
                        <td>${cogs}</td>
                        <td>${escapeHtml(catalog)}</td>
                        <td>${escapeHtml(sleeve)}</td>
                        <td>${escapeHtml(disc)}</td>
                        <td><span class="barcode-value">${barcode}</span></td>
                        <td>${escapeHtml(consignor)}</td>
                        <td><span class="status-badge ${statusClass}">${statusName}</span></td>
                    `;
                }

                rowHtml += `</tr>`;
                tbodyHtml += rowHtml;
            });
        }
        recordsTableBody.innerHTML = tbodyHtml;
        console.log(`✅ Table rendered with ${pageRecords.length} rows`);

        // Attach event listeners for range buttons
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

        // Attach "Add" buttons in search mode
        document.querySelectorAll('.btn-add-record-from-search').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                const row = this.closest('tr');
                const record = currentResults[index];
                if (record) addRecordFromDiscogs(row, record);
            });
        });

        // ----- Search mode: condition sync and price estimation -----
        if (currentMode === 'search') {
            document.querySelectorAll('.sleeve-condition-select').forEach(sel => {
                sel.addEventListener('change', function() {
                    const row = this.closest('tr');
                    const discSelect = row.querySelector('.disc-condition-select');
                    // Set disc to same value
                    if (this.value) {
                        discSelect.value = this.value;
                    }
                    // Trigger price estimation
                    const catalogInput = row.querySelector('td:nth-child(4)'); // Catalog # is 4th column (0-index)
                    const catalog = catalogInput ? catalogInput.textContent.trim() : '';
                    estimatePriceForRow(row, catalog);
                });
            });

            document.querySelectorAll('.disc-condition-select').forEach(sel => {
                sel.addEventListener('change', function() {
                    const row = this.closest('tr');
                    const catalogInput = row.querySelector('td:nth-child(4)');
                    const catalog = catalogInput ? catalogInput.textContent.trim() : '';
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
        showStatus(`From record selected. Click "to" on another record to select range.`, 'info');
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

    // ========== Search ==========
    async function performSearch(searchTerm) {
        if (!searchTerm) { clearSearch(); return; }
        console.log('🔍 performSearch called with term:', searchTerm);
        currentMode = 'search';
        recordsTableBody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Searching...</td></tr>`;

        const data = await apiGet('/api/discogs/search?q=' + encodeURIComponent(searchTerm));
        console.log('📦 Discogs API response:', data);

        if (!data.results || !data.results.length) {
            console.warn('⚠️ No results found in response');
            recordsTableBody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:40px;">No results found</td></tr>`;
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

        console.log(`✅ Mapped ${currentResults.length} results`);
        filteredRecords = currentResults.slice();
        totalRecords = filteredRecords.length;
        currentPage = 1;
        renderPagination();
        renderTablePage();
        console.log(`📋 Table updated with ${totalRecords} rows`);
        showStatus(`Found ${totalRecords} results`, 'success');
    }

    function clearSearch() {
        currentMode = 'inventory';
        currentResults = [];
        searchInput.value = '';
        applyFilters();
        showStatus('Search cleared, showing inventory', 'info');
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
        const newRecord = result.record;
        showStatus(`✅ Record #${newRecord.id} added successfully!`, 'success');
        clearSearch();
        await loadRecords();
        await loadStats();
    }

    // ========== Print Selected ==========
    function printSelected() {
        const selected = getSelectedRecords();
        if (selected.length === 0) {
            showStatus('No records selected', 'warning');
            return;
        }
        if (currentMode !== 'inventory') {
            showStatus('Printing is only available for inventory records', 'warning');
            return;
        }
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

    // ========== Batch COGS ==========
    async function applyBatchCOGS() {
        const amount = parseFloat(batchCogsAmount.value);
        if (!amount || amount <= 0) {
            showStatus('Please enter a valid COGS amount', 'warning');
            return;
        }
        const selected = getSelectedRecords();
        if (selected.length === 0) {
            showStatus('No records selected. Use "from" and "to" to select records.', 'warning');
            return;
        }
        const recordIds = selected.map(r => r.id);
        const result = await apiPost('/api/cogs/batch', {
            batch_cogs: amount,
            record_ids: recordIds
        });
        await loadRecords();
        batchCogsResultDiv.innerHTML = `
            <div style="background:#d4edda;border:1px solid #c3e6cb;border-radius:5px;padding:10px;margin-top:10px;">
                <strong>✅ Batch COGS Applied</strong><br>
                Records: ${result.records_updated}<br>
                Total COGS: $${result.total_cogs_sum.toFixed(2)}
            </div>
        `;
        setTimeout(() => { batchCogsResultDiv.innerHTML = ''; }, 5000);
        batchCogsAmount.value = '';
        showStatus(`Batch COGS applied to ${result.records_updated} records`, 'success');
    }

    // ========== Init ==========
    async function init() {
        console.log('🔄 add-records: Initializing...');

        if (_initialized) {
            console.log('🔄 add-records: Already initialized, reloading data...');
            await loadMinimumPrice();
            await loadStorePriceMultiplier();
            await loadConditions();
            await loadConsignors();
            await loadRecords();
            await loadStats();
            return;
        }

        await loadMinimumPrice();
        await loadStorePriceMultiplier();
        await loadConditions();
        await loadConsignors();
        await loadRecords();
        await loadStats();

        // Search event listeners
        searchFieldSelect.addEventListener('change', function() {
            currentSearchField = this.value;
        });
        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const term = searchInput.value.trim();
            if (term) performSearch(term);
        });
        clearSearchBtn.addEventListener('click', function() {
            clearSearch();
        });

        // Record table filter & pagination
        statusFilterSelect.addEventListener('change', function() {
            currentFilterStatus = this.value;
            currentPage = 1;
            if (currentMode === 'inventory') {
                applyFilters();
            } else {
                currentMode = 'inventory';
                applyFilters();
            }
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

        // Selection & Print
        printSelectedBtn.addEventListener('click', printSelected);
        cancelRangeBtn.addEventListener('click', cancelRangeSelection);

        // Batch COGS
        applyBatchCogsBtn.addEventListener('click', applyBatchCOGS);

        // Initial render
        clearSearch();

        _initialized = true;
        console.log('✅ add-records.js initialized (first time)');
    }

    window.initAddRecordsTab = init;
    if (window.TabManager && window.TabManager.registerInitializer) {
        window.TabManager.registerInitializer('add-records', init);
        console.log('✅ add-records: Registered initializer with TabManager');
    } else {
        console.log('⚠️ add-records: TabManager not available for registration; will rely on direct global call.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            const addRecordsTab = document.querySelector('.tab[data-tab="add-records"]');
            if (addRecordsTab && addRecordsTab.classList.contains('active')) {
                init();
            } else {
                console.log('⏳ add-records: Tab not active, waiting for switch...');
            }
        });
    } else {
        const addRecordsTab = document.querySelector('.tab[data-tab="add-records"]');
        if (addRecordsTab && addRecordsTab.classList.contains('active')) {
            init();
        } else {
            console.log('⏳ add-records: Tab not active, waiting for switch...');
        }
    }

})();