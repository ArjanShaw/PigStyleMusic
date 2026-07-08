// ============================================================================
// add-records.js - Add Records tab with paginated record table and print queue
// Combines Discogs search, record creation, record table with pagination,
// range selection (from/to), print queue management, PDF generation,
// batch COGS, and status updates.
// NO ERROR HANDLING / NO FALLBACKS
// ============================================================================

(function() {
    'use strict';

    console.log('🏷️ add-records.js loading...');

    // ========== DOM Elements ==========
    let searchFieldSelect = document.getElementById('searchField');
    let searchInput = document.getElementById('searchInput');
    let searchForm = document.getElementById('searchForm');
    let clearSearchBtn = document.getElementById('clearSearch');
    let resultsContainer = document.getElementById('results-container');

    // Record table elements
    let recordsTableBody = document.getElementById('records-table-body');
    let recordTableContainer = document.getElementById('record-table-container');
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

    // Print queue elements
    let queueCountSpan = document.getElementById('queue-count');
    let printQueueCountSpan = document.getElementById('print-queue-count');
    let printQueueBtn = document.getElementById('print-queue-btn');
    let clearQueueBtn = document.getElementById('clear-queue-btn');
    let markActiveQueueBtn = document.getElementById('mark-active-queue-btn');
    let bulkDeleteQueueBtn = document.getElementById('bulk-delete-queue-btn');
    let batchCogsAmount = document.getElementById('batch-cogs-amount');
    let applyBatchCogsBtn = document.getElementById('apply-batch-cogs-btn');
    let batchCogsResultDiv = document.getElementById('batch-cogs-result');
    let queueContentDiv = document.getElementById('queue-content');

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
    let printQueue = [];
    let consignorMap = {};
    let _initialized = false;

    // Record table state
    let allRecords = [];
    let filteredRecords = [];
    let currentPage = 1;
    let pageSize = 50;
    let totalRecords = 0;
    let currentFilterStatus = '1'; // default: new records

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

        // Fetch last added record with compact display
        const lastRecordData = await apiGet('/records?limit=1&order_by=created_at&order=desc');
        const lastRecord = lastRecordData.records && lastRecordData.records.length > 0 ? lastRecordData.records[0] : null;
        if (lastRecord) {
            const artist = lastRecord.artist || 'Unknown';
            const title = lastRecord.title || 'Unknown';
            const price = lastRecord.store_price ? `$${lastRecord.store_price.toFixed(2)}` : '';
            // Truncate artist and title to 20 chars each for compact display
            const shortArtist = artist.length > 20 ? artist.substring(0, 20) + '…' : artist;
            const shortTitle = title.length > 20 ? title.substring(0, 20) + '…' : title;
            let display = `${shortArtist} - ${shortTitle}`;
            if (price) display += ` - ${price}`;
            document.getElementById('last-added-record').textContent = display;
        } else {
            document.getElementById('last-added-record').textContent = 'None';
        }

        const capacity = await apiGet('/config/STORE_CAPACITY');
        const fill = (total.count / parseInt(capacity.config_value) * 100).toFixed(1);
        document.getElementById('store-fill').textContent = fill + '%';
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
        const statusFilter = currentFilterStatus;
        if (statusFilter === 'all') {
            filteredRecords = allRecords.slice();
        } else {
            const statusId = parseInt(statusFilter);
            filteredRecords = allRecords.filter(r => r.status_id === statusId);
        }
        totalRecords = filteredRecords.length;
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

    function renderTablePage() {
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredRecords.length);
        const pageRecords = filteredRecords.slice(start, end);
        let html = '';
        if (pageRecords.length === 0) {
            html = `<tr><td colspan="13" style="text-align:center;padding:40px;">No records found</td></tr>`;
        } else {
            pageRecords.forEach((record, idx) => {
                const globalIndex = start + idx;
                const inQueue = printQueue.some(r => r.id === record.id);
                const queuePos = printQueue.findIndex(r => r.id === record.id);
                const statusClass = getStatusClass(record.status_id);
                const statusName = getStatusName(record.status_id);
                const genre = record.discogs_genre_raw ? record.discogs_genre_raw.split(',')[0].trim() : '';
                const consignor = record.consignor_id && consignorMap[record.consignor_id] ? consignorMap[record.consignor_id].initials : '';
                const price = record.store_price ? `$${record.store_price.toFixed(2)}` : 'N/A';
                const cogs = record.cogs ? `$${record.cogs.toFixed(2)}` : '—';
                const profit = (record.store_price && record.cogs) ? `$${(record.store_price - record.cogs).toFixed(2)}` : '—';
                const dateCreated = record.created_at ? new Date(record.created_at).toLocaleDateString() : 'Unknown';

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

                html += `
                    <tr>
                        <td style="width:80px; text-align:center;">
                            ${fromButton}
                            ${toButton}
                        </td>
                        <td>${record.id}</td>
                        <td>${dateCreated}</td>
                        <td>${escapeHtml(record.artist || 'Unknown')}</td>
                        <td>${escapeHtml(record.title || 'Unknown')}</td>
                        <td>${price}</td>
                        <td>${cogs}</td>
                        <td>${profit}</td>
                        <td>${escapeHtml(record.catalog_number || '—')}</td>
                        <td>${escapeHtml(genre)}</td>
                        <td><span class="barcode-value">${record.barcode || record.id}</span></td>
                        <td>${escapeHtml(consignor) || '—'}</td>
                        <td><span class="status-badge ${statusClass}">${statusName}</span></td>
                        <td>
                            ${inQueue ?
                                `<span class="queue-badge" style="background:#28a745;color:white;padding:2px 6px;border-radius:10px;font-size:10px;">#${queuePos+1}</span>` :
                                `<button class="btn-add-queue" data-id="${record.id}" style="background:none;border:none;color:#28a745;cursor:pointer;font-size:16px;" title="Add to queue"><i class="fas fa-plus-circle"></i></button>`
                            }
                        </td>
                    </tr>
                `;
            });
        }
        recordsTableBody.innerHTML = html;

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
        document.querySelectorAll('.btn-add-queue').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                const record = allRecords.find(r => r.id === id);
                if (record && !printQueue.some(r => r.id === id)) {
                    printQueue.push(record);
                    updateQueueDisplay();
                    renderTablePage();
                }
            });
        });
    }

    // ========== Range Selection Functions ==========
    function startRangeFrom(index) {
        rangeFromIndex = index;
        rangeToIndex = null;
        isRangeMode = true;
        document.getElementById('cancel-range-btn').style.display = 'inline-block';
        renderTablePage();
        showStatus(`From record selected. Click "to" on another record to select range.`, 'info');
    }

    function endRangeTo(index) {
        if (rangeFromIndex === null) {
            showStatus('Select "from" first', 'warning');
            return;
        }
        rangeToIndex = index;
        const start = Math.min(rangeFromIndex, rangeToIndex);
        const end = Math.max(rangeFromIndex, rangeToIndex);
        let added = 0;
        for (let i = start; i <= end; i++) {
            const record = filteredRecords[i];
            if (record && !printQueue.some(r => r.id === record.id)) {
                printQueue.push(record);
                added++;
            }
        }
        rangeFromIndex = null;
        rangeToIndex = null;
        isRangeMode = false;
        document.getElementById('cancel-range-btn').style.display = 'none';
        updateQueueDisplay();
        renderTablePage();
        showStatus(`Added ${added} records to queue`, 'success');
    }

    function cancelRangeSelection() {
        rangeFromIndex = null;
        rangeToIndex = null;
        isRangeMode = false;
        document.getElementById('cancel-range-btn').style.display = 'none';
        renderTablePage();
        showStatus('Range selection cancelled', 'info');
    }

    // ========== Search ==========
    async function performSearch(searchTerm) {
        if (!searchTerm) { clearResults(); return; }
        resultsContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><p>Searching...</p></div>';

        const data = await apiGet('/api/discogs/search?q=' + encodeURIComponent(searchTerm));
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
        displayResults();
    }

    function clearResults() {
        currentResults = [];
        resultsContainer.innerHTML = `
            <div class="loading">
                <i class="fas fa-search"></i>
                <p>Search for records to get started</p>
                <p><small>Enter a search term above</small></p>
            </div>
        `;
    }

    // ========== Display Results ==========
    function displayResults() {
        if (!currentResults.length) {
            resultsContainer.innerHTML = `<div class="loading"><i class="fas fa-search"></i><p>No results found</p></div>`;
            return;
        }
        resultsContainer.innerHTML = renderDiscogsResults();
        attachResultEventListeners();
    }

    function renderDiscogsResults() {
        const condOptions = conditions.map(c =>
            `<option value="${c.id}">${c.display_name || c.condition_name}</option>`
        ).join('');
        const consignorOptions = consignors.map(c =>
            `<option value="${c.id}" ${c.id === selectedConsignorId ? 'selected' : ''}>${c.username}${c.flag_color ? ' ('+c.flag_color+')' : ''}</option>`
        ).join('');

        let html = `<h3>Discogs Results (${currentResults.length})</h3>`;
        currentResults.forEach((record, idx) => {
            const discogsGenreRaw = record.genre_raw || '';
            const catalogNumber = record.catalog_number || '';
            const defaultSleeve = defaultSleeveConditionId || '';
            const defaultDisc = defaultDiscConditionId || '';
            const defaultNotesVal = defaultNotes || '';
            const defaultCogsVal = defaultCogs !== null ? defaultCogs.toFixed(2) : '';
            html += `
                <div class="record-card" data-record-id="${record.discogs_id || record.id}" data-index="${idx}" data-artist="${record.artist}" data-catalog="${catalogNumber}" data-title="${record.title}">
                    <div class="record-header">
                        ${record.image_url ? `<img src="${record.image_url}" alt="${record.artist} - ${record.title}" class="record-image" onerror="this.src='https://via.placeholder.com/100x100/333/666?text=No+Image'">` :
                            `<div class="record-image" style="background:#333;display:flex;align-items:center;justify-content:center;"><i class="fas fa-record-vinyl" style="font-size:40px;color:#666;"></i></div>`}
                        <div class="record-info">
                            <div class="record-title">${record.artist} - ${record.title}</div>
                            <div class="record-details">
                                ${record.year ? `<span><strong>Year:</strong> ${record.year}</span>` : ''}
                                ${discogsGenreRaw ? `<span><strong>Discogs Genre:</strong> ${discogsGenreRaw}</span>` : ''}
                                ${record.format ? `<span><strong>Format:</strong> ${record.format}</span>` : ''}
                                ${catalogNumber ? `<span><strong>Catalog #:</strong> ${catalogNumber}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="margin:15px 0;padding:15px;background:#f8f9fa;border-radius:8px;border:1px solid #dee2e6;">
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;">
                            <div>
                                <label class="form-label">Sleeve Condition *</label>
                                <select class="form-control sleeve-condition-select" data-default="${defaultSleeve}">
                                    <option value="">Select...</option>
                                    ${condOptions}
                                </select>
                            </div>
                            <div>
                                <label class="form-label">Disc Condition *</label>
                                <select class="form-control disc-condition-select" data-default="${defaultDisc}">
                                    <option value="">Select...</option>
                                    ${condOptions}
                                </select>
                            </div>
                            <div>
                                <label class="form-label">Price ($) *</label>
                                <input type="number" class="form-control price-input" step="1" ${minimumPrice !== null ? `min="${minimumPrice}"` : ''} placeholder="Price">
                                <button class="btn btn-sm btn-info estimate-now-btn" style="margin-top:5px;font-size:12px;display:${autoEstimatePrice?'none':'inline-block'};">
                                    <i class="fas fa-calculator"></i> Estimate
                                </button>
                            </div>
                            <div>
                                <label class="form-label">COGS ($)</label>
                                <input type="number" class="form-control cogs-input" step="0.01" min="0" value="${defaultCogsVal}" placeholder="Optional">
                            </div>
                            <div>
                                <label class="form-label">Consignor</label>
                                <select class="form-control consignor-select">
                                    <option value="">None</option>
                                    ${consignorOptions}
                                </select>
                            </div>
                            <div>
                                <label class="form-label">Notes</label>
                                <textarea class="form-control notes-input" rows="2">${escapeHtml(defaultNotesVal)}</textarea>
                            </div>
                            <div>
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                    <input type="checkbox" class="no-original-sleeve-checkbox">
                                    <span>No original sleeve</span>
                                </label>
                            </div>
                        </div>
                        <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap;">
                            <button class="btn btn-primary add-record-btn"><i class="fas fa-plus"></i> Add to Inventory</button>
                            <button class="btn btn-success add-and-print-btn"><i class="fas fa-print"></i> Add & Print</button>
                        </div>
                    </div>
                </div>
            `;
        });
        return html;
    }

    // ========== Attach Event Listeners to Results ==========
    function attachResultEventListeners() {
        document.querySelectorAll('.add-record-btn').forEach(btn => {
            btn.addEventListener('click', async function(e) {
                const card = this.closest('.record-card');
                const idx = parseInt(card.dataset.index);
                const record = currentResults[idx];
                await addRecordFromDiscogs(card, record, false);
            });
        });
        document.querySelectorAll('.add-and-print-btn').forEach(btn => {
            btn.addEventListener('click', async function(e) {
                const card = this.closest('.record-card');
                const idx = parseInt(card.dataset.index);
                const record = currentResults[idx];
                await addRecordFromDiscogs(card, record, true);
            });
        });
        document.querySelectorAll('.estimate-now-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                const card = this.closest('.record-card');
                const idx = parseInt(card.dataset.index);
                const record = currentResults[idx];
                manualEstimate(record, card);
            });
        });
        document.querySelectorAll('.sleeve-condition-select').forEach(sel => {
            sel.addEventListener('change', function(e) {
                const card = this.closest('.record-card');
                const discSelect = card.querySelector('.disc-condition-select');
                if (this.value) discSelect.value = this.value;
                const discEvent = new Event('change', { bubbles: true });
                discSelect.dispatchEvent(discEvent);
            });
        });
        document.querySelectorAll('.disc-condition-select').forEach(sel => {
            sel.addEventListener('change', function(e) {
                const card = this.closest('.record-card');
                const sleeve = card.querySelector('.sleeve-condition-select');
                const disc = this;
                if (sleeve.value && disc.value && autoEstimatePrice && storePriceMultiplier !== null) {
                    const idx = parseInt(card.dataset.index);
                    const record = currentResults[idx];
                    if (record) estimatePrice(record, sleeve.value, disc.value, card);
                }
            });
        });
        document.querySelectorAll('.no-original-sleeve-checkbox').forEach(cb => {
            cb.addEventListener('change', function(e) {
                const card = this.closest('.record-card');
                const notes = card.querySelector('.notes-input');
                const tag = '[NO ORIGINAL SLEEVE]';
                if (this.checked) {
                    if (!notes.value.includes(tag)) notes.value = notes.value ? tag + '\n' + notes.value : tag;
                } else {
                    notes.value = notes.value.replace(tag, '').replace(/^\n+/, '').replace(/\n+$/, '');
                }
            });
        });
    }

    // ========== Add Record from Discogs ==========
    async function addRecordFromDiscogs(card, discogsRecord, printImmediately) {
        const sleeveSelect = card.querySelector('.sleeve-condition-select');
        const discSelect = card.querySelector('.disc-condition-select');
        const priceInput = card.querySelector('.price-input');
        const cogsInput = card.querySelector('.cogs-input');
        const consignorSelect = card.querySelector('.consignor-select');
        const notesInput = card.querySelector('.notes-input');
        const noSleeveCheck = card.querySelector('.no-original-sleeve-checkbox');

        const sleeveId = parseInt(sleeveSelect.value);
        const discId = parseInt(discSelect.value);
        const price = parseFloat(priceInput.value);
        const cogs = cogsInput.value ? parseFloat(cogsInput.value) : null;
        const consignorId = consignorSelect.value ? parseInt(consignorSelect.value) : null;
        let notes = notesInput.value.trim();
        if (noSleeveCheck.checked && !notes.includes('[NO ORIGINAL SLEEVE]')) {
            notes = notes ? '[NO ORIGINAL SLEEVE]\n' + notes : '[NO ORIGINAL SLEEVE]';
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
            notes: notes || null
        };

        const result = await apiPost('/records', recordData);
        const newRecord = result.record;
        showStatus(`✅ Record #${newRecord.id} added successfully!`, 'success');
        await loadRecords();
        await loadStats();
        if (printImmediately) {
            if (!printQueue.some(r => r.id === newRecord.id)) {
                printQueue.push(newRecord);
                updateQueueDisplay();
                renderTablePage();
            }
            showStatus(`Added to print queue (${printQueue.length} items)`, 'info');
        }
    }

    // ========== Price Estimation ==========
    async function estimatePrice(record, sleeveId, discId, card) {
        const sleeveInt = parseInt(sleeveId);
        const discInt = parseInt(discId);
        const catalogNumber = card.dataset.catalog || record.catalog_number || '';
        const data = await apiPost('/api/price-estimate-v3', {
            catalog_number: catalogNumber,
            media_condition: conditions.find(c => c.id === discInt).display_name || conditions.find(c => c.id === discInt).condition_name,
            sleeve_condition: conditions.find(c => c.id === sleeveInt).display_name || conditions.find(c => c.id === sleeveInt).condition_name
        });
        const estimated = data.estimated_price;
        let finalPrice = estimated * storePriceMultiplier;
        const dollars = Math.floor(finalPrice);
        finalPrice = dollars < 1 ? 0.99 : (dollars - 1) + 0.99;
        finalPrice = Math.max(finalPrice, minimumPrice);
        const priceInput = card.querySelector('.price-input');
        priceInput.value = finalPrice.toFixed(2);
        priceInput.classList.add('price-estimated');
    }

    async function manualEstimate(record, card) {
        const sleeve = card.querySelector('.sleeve-condition-select');
        const disc = card.querySelector('.disc-condition-select');
        estimatePrice(record, sleeve.value, disc.value, card);
    }

    // ========== Print Queue Management ==========
    function addToQueue(record) {
        if (!printQueue.some(r => r.id === record.id)) {
            printQueue.push(record);
            updateQueueDisplay();
            renderTablePage();
        }
    }

    function removeFromQueue(index) {
        printQueue.splice(index, 1);
        updateQueueDisplay();
        renderTablePage();
    }

    function clearQueue() {
        if (confirm(`Clear ${printQueue.length} records from queue?`)) {
            printQueue = [];
            updateQueueDisplay();
            renderTablePage();
        }
    }

    function moveInQueue(index, direction) {
        const newIdx = index + direction;
        if (newIdx < 0 || newIdx >= printQueue.length) return;
        [printQueue[index], printQueue[newIdx]] = [printQueue[newIdx], printQueue[index]];
        updateQueueDisplay();
    }

    function updateQueueDisplay() {
        const count = printQueue.length;
        queueCountSpan.textContent = count;
        printQueueCountSpan.textContent = count;
        clearQueueBtn.disabled = count === 0;
        printQueueBtn.disabled = count === 0;
        bulkDeleteQueueBtn.disabled = count === 0;

        if (count === 0) {
            queueContentDiv.innerHTML = `<div class="queue-empty"><i class="fas fa-inbox" style="font-size:24px;margin-bottom:10px;opacity:0.5;"></i><p>No records in print queue</p></div>`;
            return;
        }
        let html = '';
        printQueue.forEach((r, i) => {
            html += `
                <div class="queue-item">
                    <div class="queue-item-number">${i+1}</div>
                    <div class="queue-item-info">
                        <div class="queue-item-title">${escapeHtml(r.artist)} - ${escapeHtml(r.title)}</div>
                        <div class="queue-item-details">
                            <span>Price: $${(r.store_price||0).toFixed(2)}</span>
                            <span>COGS: ${r.cogs ? '$'+r.cogs.toFixed(2) : '—'}</span>
                        </div>
                    </div>
                    <div>
                        <button class="queue-item-move" onclick="window.addRecordsMoveInQueue(${i},-1)" ${i===0?'disabled':''}><i class="fas fa-arrow-up"></i></button>
                        <button class="queue-item-move" onclick="window.addRecordsMoveInQueue(${i},1)" ${i===printQueue.length-1?'disabled':''}><i class="fas fa-arrow-down"></i></button>
                        <button class="queue-item-remove" onclick="window.addRecordsRemoveFromQueue(${i})"><i class="fas fa-trash"></i> Remove</button>
                    </div>
                </div>
            `;
        });
        queueContentDiv.innerHTML = html;
    }

    window.addRecordsMoveInQueue = moveInQueue;
    window.addRecordsRemoveFromQueue = removeFromQueue;
    window.addRecordsClearQueue = clearQueue;

    // ========== PDF Generation ==========
    async function generatePDF(records) {
        if (!records.length) { showStatus('Queue is empty', 'warning'); return; }
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
        const result = await apiPost('/api/cogs/batch', {
            batch_cogs: amount,
            record_ids: printQueue.map(r => r.id)
        });
        result.updated_records.forEach(upd => {
            const q = printQueue.find(r => r.id === upd.id);
            if (q) q.cogs = upd.cogs;
        });
        updateQueueDisplay();
        renderTablePage();
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

    // ========== Mark Queue as Active ==========
    async function markQueueAsActive() {
        const ids = printQueue.map(r => r.id);
        const result = await apiPost('/records/update-status', { record_ids: ids, status_id: 2 });
        printQueue = [];
        updateQueueDisplay();
        await loadRecords();
        await loadStats();
        showStatus(`Marked ${result.updated_count} records as Active`, 'success');
    }

    // ========== Bulk Delete from Queue ==========
    async function deleteSelectedFromQueue() {
        if (!printQueue.length) return;
        if (!confirm(`Delete ${printQueue.length} records permanently?`)) return;
        let deleted = 0, failed = 0;
        for (const record of printQueue) {
            try {
                await apiDelete('/records/' + record.id);
                deleted++;
            } catch (e) {
                failed++;
                console.error('Delete failed for record', record.id, e);
            }
        }
        printQueue = [];
        updateQueueDisplay();
        await loadRecords();
        await loadStats();
        showStatus(`Deleted ${deleted} records, ${failed} failed`, deleted > 0 ? 'success' : 'error');
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
            searchInput.value = '';
            clearResults();
        });

        // Record table filter & pagination
        statusFilterSelect.addEventListener('change', function() {
            currentFilterStatus = this.value;
            currentPage = 1;
            applyFilters();
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

        // Queue buttons
        clearQueueBtn.addEventListener('click', clearQueue);
        printQueueBtn.addEventListener('click', () => generatePDF(printQueue));
        markActiveQueueBtn.addEventListener('click', markQueueAsActive);
        bulkDeleteQueueBtn.addEventListener('click', deleteSelectedFromQueue);
        applyBatchCogsBtn.addEventListener('click', applyBatchCOGS);

        // Expose queue functions globally
        window.addRecordsMoveInQueue = moveInQueue;
        window.addRecordsRemoveFromQueue = removeFromQueue;
        window.addRecordsClearQueue = clearQueue;

        // Cancel range button (already in HTML, we need to wire it)
        document.getElementById('cancel-range-btn').addEventListener('click', cancelRangeSelection);

        clearResults();
        updateQueueDisplay();

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