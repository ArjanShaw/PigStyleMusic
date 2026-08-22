// ============================================================================
// inventory-ops.js - Unified Inventory Operations (REFACTORED)
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
    const printBtn = document.getElementById('print-btn');
    const cancelRangeBtn = document.getElementById('cancel-range-btn');

    // ========== Mode containers ==========
    const addModeContainer = document.getElementById('mode-container-add');
    const scanModeContainer = document.getElementById('mode-container-scan');
    const discogsModeContainer = document.getElementById('mode-container-discogs');
    const discogsOrdersModeContainer = document.getElementById('mode-container-discogs_orders');

    // ========== Scan Location Elements ==========
    const scanLocationSelect = document.getElementById('scan-location-select');
    const scanInput = document.getElementById('scan-input');
    const scanSubmitBtn = document.getElementById('scan-submit-btn');
    const scanLocationDisplay = document.getElementById('scan-location-display');
    const scanIndexDisplay = document.getElementById('scan-index-display');
    const recentScansList = document.getElementById('recent-scans-list');
    const lastScanDisplay = document.getElementById('last-scan-display');

    // ========== Discogs Elements ==========
    const discogsLocationSelect = document.getElementById('discogs-location-select');
    const discogsStatusMessage = document.getElementById('discogs-status-message');
    const lastSeenCutoffDateInput = document.getElementById('last-seen-cutoff-date');
    const applyLastSeenFilterBtn = document.getElementById('apply-last-seen-filter');

    // ========== Discogs Orders Elements ==========
    const discogsOrderSelect = document.getElementById('discogs-order-select');
    const discogsOrdersRefreshBtn = document.getElementById('discogs-orders-refresh-btn');
    const discogsOrdersStatus = document.getElementById('discogs-orders-status');
    const discogsOrdersStatusFilter = document.getElementById('discogs-orders-status-filter');
    const discogsOrdersApplyFiltersBtn = document.getElementById('discogs-orders-apply-filters-btn');
    const discogsOrdersDateFrom = document.getElementById('discogs-orders-date-from');
    const discogsOrdersDateTo = document.getElementById('discogs-orders-date-to');
    const discogsOrdersSearch = document.getElementById('discogs-orders-search');

    // ========== Default Params Elements ==========
    const defaultSleeveSelect = document.getElementById('default-sleeve-condition');
    const defaultDiscSelect = document.getElementById('default-disc-condition');
    const defaultPriceInput = document.getElementById('default-price');
    const defaultConsignorSelect = document.getElementById('default-consignor');
    const defaultFormatSelect = document.getElementById('default-format');
    const defaultPurchaseSelect = document.getElementById('default-purchase');

    // ========== Purchase Table Elements ==========
    const purchasesBody = document.getElementById('purchases-body');
    const metadataPanel = document.getElementById('purchase-metadata-panel');
    const editPurchaseId = document.getElementById('edit-purchase-id');
    const editSellerName = document.getElementById('edit-seller-name');
    const editSellerContact = document.getElementById('edit-seller-contact');
    const editDescription = document.getElementById('edit-description');
    const editStatus = document.getElementById('edit-status');
    const editBillUpload = document.getElementById('edit-bill-upload');
    const editBillPreview = document.getElementById('edit-bill-preview');
    const purchaseIdDisplay = document.getElementById('purchase-id-display');
    const deletePurchaseBtn = document.getElementById('delete-purchase-btn');
    const acceptDraftBtn = document.getElementById('accept-draft-btn');

    // ========== Current Purchase Display ==========
    const currentPurchaseDisplay = document.getElementById('current-purchase-display');
    const currentPurchaseName = document.getElementById('current-purchase-name');
    const currentPurchaseIdSpan = document.getElementById('current-purchase-id');

    // ============================================================
    // STATE MANAGEMENT - Single source of truth
    // ============================================================
    const state = {
        // Core data
        allRecords: [],
        filteredRecords: [],
        currentResults: [],
        totalRecords: 0,

        // Selection (separate from filtered view)
        selection: {
            fromIndex: null,
            toIndex: null,
            isActive: false
        },

        // UI state
        currentPage: 1,
        pageSize: 50,
        currentSearchMode: 'add',
        currentMode: 'inventory',

        // Purchase context
        selectedPurchaseId: null,
        currentPurchaseRecords: [],

        // Discogs
        currentLocationRecords: [],
        ordersList: [],
        currentOrderItems: [],
        selectedOrderId: null,
        lastSeenCutoffDate: null,

        // Scan
        recentScans: [],
        scanIndex: 0,
        scanCounter: 0,

        // Default params
        defaultParams: {
            sleeveConditionId: null,
            discConditionId: null,
            price: null,
            consignorId: null,
            formatId: null,
            purchaseId: null
        },
        defaultParamsActive: false,

        // Domain data
        conditions: [],
        consignors: [],
        consignorMap: {},
        genres: [],
        formats: [],
        locations: [],
        locationMap: {},
        minimumPrice: null,
        storePriceMultiplier: null,

        // Charts
        markupCurveChart: null,
        markupDistributionChart: null,
        ageDistributionChart: null,

        // Posting
        isPosting: false,
        postProgress: 0,
        postResults: [],

        // Audio
        audioContext: null,

        // Init flag
        initialized: false,

        // Render cache to prevent duplicate renders
        lastRenderHash: null
    };

    // Constants
    const MAX_RECENT_SCANS = 10;
    const modeContainers = {
        'add': addModeContainer,
        'scan': scanModeContainer,
        'discogs': discogsModeContainer,
        'discogs_orders': discogsOrdersModeContainer
    };

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getRecordDisplay(record) {
        if (!record) {
            throw new Error('getRecordDisplay: record is null or undefined');
        }
        const artist = record.artist && record.artist.trim() ? record.artist.trim() : null;
        const title = record.title && record.title.trim() ? record.title.trim() : null;
        if (!artist) {
            throw new Error('getRecordDisplay: artist is missing for record ID ' + record.id);
        }
        if (!title) {
            throw new Error('getRecordDisplay: title is missing for record ID ' + record.id);
        }
        return artist + ' - ' + title;
    }

    function getShortRecordDisplay(record, maxLength) {
        maxLength = maxLength || 40;
        const display = getRecordDisplay(record);
        if (display.length > maxLength) {
            return display.substring(0, maxLength - 3) + '…';
        }
        return display;
    }

    function getLocationDisplay(locationId) {
        if (!locationId) return '—';
        const loc = state.locationMap[locationId];
        if (!loc) return '—';
        if (loc.genre_name) {
            return loc.genre_name + ' - ' + loc.name;
        }
        return loc.name;
    }

    function getLocationById(id) {
        return state.locationMap[id] || null;
    }

    function getStatusClass(statusId) {
        const map = { 1: 'new', 2: 'active', 3: 'sold', 4: 'discogs' };
        return map[statusId] || '';
    }

    function getLocalMSTDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function hasConsignor(record) {
        return (record.consignor_id && record.consignor_id !== 1 && record.consignor_id !== null);
    }

    function getLastSeenCutoffDate() {
        if (lastSeenCutoffDateInput && lastSeenCutoffDateInput.value) {
            return lastSeenCutoffDateInput.value;
        }
        return null;
    }

    function meetsLastSeenFilter(record) {
        const cutoffDate = getLastSeenCutoffDate();
        if (!cutoffDate) return true;
        if (!record.last_seen) return false;
        try {
            const lastSeenDate = record.last_seen.split('T')[0];
            return lastSeenDate >= cutoffDate;
        } catch (e) {
            return false;
        }
    }

    function showStatus(message, type) {
        const el = document.getElementById('status-message');
        if (!el) return;
        el.textContent = message;
        el.className = 'status-message status-' + (type || 'info');
        el.style.display = 'block';
        setTimeout(function() { el.style.display = 'none'; }, 5000);
    }

    function showToast(message, type) {
        console.log('🍞 TOAST [' + type + ']: ' + message);
        showStatus(message, type);
    }

    function showDiscogsStatus(message, type) {
        if (!discogsStatusMessage) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        discogsStatusMessage.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        discogsStatusMessage.className = 'status-message status-' + type;
        discogsStatusMessage.style.display = 'block';
        setTimeout(function() { if (discogsStatusMessage) discogsStatusMessage.style.display = 'none'; }, 8000);
    }

    function updateDiscogsOrdersStatus(message, type) {
        if (!discogsOrdersStatus) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        discogsOrdersStatus.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        discogsOrdersStatus.className = 'status-message status-' + type;
        discogsOrdersStatus.style.display = 'block';
        setTimeout(function() {
            if (discogsOrdersStatus) discogsOrdersStatus.style.display = 'none';
        }, 8000);
    }

    function playSound(type) {
        try {
            if (!state.audioContext) {
                state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (state.audioContext.state === 'suspended') state.audioContext.resume();

            const configs = {
                beep: { freq: 800, duration: 200, type: 'sine', gain: 0.3 },
                error: { freq: 220, duration: 600, type: 'sawtooth', gain: 0.4 },
                success: { freq: 523.25, duration: 200, type: 'sine', gain: 0.2, notes: [523.25, 659.25, 783.99] }
            };

            const config = configs[type];
            if (!config) return;

            if (config.notes) {
                config.notes.forEach(function(freq, i) {
                    setTimeout(function() {
                        const osc = state.audioContext.createOscillator();
                        const gain = state.audioContext.createGain();
                        osc.connect(gain);
                        gain.connect(state.audioContext.destination);
                        osc.frequency.value = freq;
                        osc.type = config.type;
                        gain.gain.setValueAtTime(config.gain, state.audioContext.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.00001, state.audioContext.currentTime + config.duration / 1000);
                        osc.start();
                        osc.stop(state.audioContext.currentTime + config.duration / 1000);
                    }, i * 100);
                });
            } else {
                const osc = state.audioContext.createOscillator();
                const gain = state.audioContext.createGain();
                osc.connect(gain);
                gain.connect(state.audioContext.destination);
                osc.frequency.value = config.freq;
                osc.type = config.type;
                gain.gain.setValueAtTime(config.gain, state.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.00001, state.audioContext.currentTime + config.duration / 1000);
                osc.start();
                osc.stop(state.audioContext.currentTime + config.duration / 1000);
            }
        } catch (e) { console.warn('Sound error:', e); }
    }

    function downloadReceipt(text, filename) {
        filename = filename || 'receipt.txt';
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ============================================================
    // API REQUEST
    // ============================================================

    async function apiRequest(method, endpoint, body) {
        console.log('🌐 apiRequest: ' + method + ' ' + endpoint);
        const options = {
            method: method,
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }
        const res = await fetch(window.AppConfig.baseUrl + endpoint, options);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' on ' + method + ' ' + endpoint);
        return res.json();
    }

    // ============================================================
    // DOMAIN DATA LOADERS
    // ============================================================

    async function loadMinimumPrice() {
        const data = await apiRequest('GET', '/config/MIN_STORE_PRICE');
        state.minimumPrice = parseFloat(data.config_value);
    }

    async function loadStorePriceMultiplier() {
        const data = await apiRequest('GET', '/config/STORE_PRICE_ESTIMATED_MULTIPLIER');
        state.storePriceMultiplier = parseFloat(data.config_value);
    }

    async function loadConditions() {
        const data = await apiRequest('GET', '/api/conditions');
        state.conditions = data.conditions;
    }

    async function loadConsignors() {
        const data = await apiRequest('GET', '/users');
        state.consignors = data.users.filter(function(u) { return u.role === 'consignor'; });
        state.consignorMap = {};
        data.users.forEach(function(u) { state.consignorMap[u.id] = { initials: u.initials || '', name: u.full_name || u.username }; });
    }

    async function loadGenres() {
        try {
            const data = await apiRequest('GET', '/api/genres');
            state.genres = data.genres || [];
            window._genreMap = {};
            state.genres.forEach(function(g) {
                window._genreMap[g.id] = g.name;
            });
        } catch (e) {
            console.warn('Could not load genres:', e);
            state.genres = [];
            window._genreMap = {};
        }
    }

    async function loadFormats() {
        try {
            const data = await apiRequest('GET', '/api/formats');
            state.formats = data.formats || [];
        } catch (e) {
            console.warn('Could not load formats:', e);
            state.formats = [];
        }
    }

    async function loadLocations() {
        try {
            const data = await apiRequest('GET', '/api/locations');
            const rawLocations = data.locations || [];
            state.locationMap = {};
            rawLocations.forEach(function(loc) {
                const genreName = window._genreMap && window._genreMap[loc.genre_id] ? window._genreMap[loc.genre_id] : null;
                state.locationMap[loc.id] = {
                    id: loc.id,
                    name: loc.name,
                    genre_id: loc.genre_id,
                    genre_name: genreName
                };
            });
            state.locations = rawLocations;
            populateLocationDropdown(rawLocations);
        } catch (e) {
            console.warn('Could not load locations:', e);
            state.locations = [];
            state.locationMap = {};
        }
    }

    function populateLocationDropdown(locationsList) {
        if (!scanLocationSelect) return;
        const currentVal = scanLocationSelect.value;
        scanLocationSelect.innerHTML = '<option value="">-- Select Location --</option>';
        if (!locationsList || locationsList.length === 0) return;
        locationsList.forEach(function(loc) {
            const opt = document.createElement('option');
            opt.value = loc.id;
            let displayName = loc.name;
            const locData = state.locationMap[loc.id];
            if (locData && locData.genre_name) {
                displayName = locData.genre_name + ' - ' + loc.name;
            }
            opt.textContent = displayName;
            scanLocationSelect.appendChild(opt);
        });
        if (currentVal) scanLocationSelect.value = currentVal;
        updateScanLocationPreview();
    }

    async function loadStats() {
        const total = await apiRequest('GET', '/records/count');
        document.getElementById('total-records').textContent = total.count;
        const newCount = await apiRequest('GET', '/records/count?status_id=1');
        document.getElementById('new-records-count').textContent = newCount.count;

        const lastRecordData = await apiRequest('GET', '/records?limit=1&order_by=created_at&order=desc');
        const lastRecord = lastRecordData.records && lastRecordData.records.length > 0 ? lastRecordData.records[0] : null;
        if (lastRecord) {
            const display = getShortRecordDisplay(lastRecord, 45);
            const price = lastRecord.store_price ? ' - $' + lastRecord.store_price.toFixed(2) : '';
            document.getElementById('last-added-record').textContent = display + price;
        } else {
            document.getElementById('last-added-record').textContent = 'None';
        }

        const commission = await apiRequest('GET', '/api/commission-rate');
        document.getElementById('commission-rate').textContent = commission.commission_rate_percent;
    }

    // ============================================================
    // SELECTION MANAGEMENT
    // ============================================================

    function getSelectedRecords() {
        if (state.selection.fromIndex === null || state.selection.toIndex === null) {
            return [];
        }
        const start = Math.min(state.selection.fromIndex, state.selection.toIndex);
        const end = Math.max(state.selection.fromIndex, state.selection.toIndex);
        return state.filteredRecords.slice(start, end + 1);
    }

    function setSelection(from, to) {
        state.selection.fromIndex = from;
        state.selection.toIndex = to;
        state.selection.isActive = true;
        render();
    }

    function clearSelection() {
        state.selection.fromIndex = null;
        state.selection.toIndex = null;
        state.selection.isActive = false;
        render();
    }

    function startRangeFrom(index) {
        setSelection(index, index);
        const selected = getSelectedRecords();
        showStatus('Selected ' + selected.length + ' record(s)', 'info');
    }

    function endRangeTo(index) {
        if (state.selection.fromIndex === null) {
            showStatus('Select "from" first', 'warning');
            return;
        }
        setSelection(state.selection.fromIndex, index);
        const selected = getSelectedRecords();
        showStatus('Selected ' + selected.length + ' record(s)', 'success');
    }

    function cancelRangeSelection() {
        clearSelection();
        showStatus('Selection cleared', 'info');
    }

    function updateSelectionCount() {
        const selected = getSelectedRecords();
        const count = selected.length;
        selectedCountSpan.textContent = count;

        const hasRecords = state.filteredRecords.length > 0;
        const hasSelection = state.selection.isActive && count > 0;

        if (state.currentSearchMode === 'add') {
            printBtn.disabled = !(hasSelection || hasRecords);
            if (hasSelection) {
                printBtn.textContent = '🖨️ Print (' + count + ' selected)';
            } else {
                printBtn.textContent = '🖨️ Print (all)';
            }
            printBtn.style.display = '';
        } else {
            printBtn.style.display = 'none';
        }

        cancelRangeBtn.style.display = state.selection.isActive ? 'inline-block' : 'none';
    }

    // ============================================================
    // PAGINATION
    // ============================================================

    function renderPagination() {
        const totalPages = Math.ceil(state.totalRecords / state.pageSize) || 1;
        if (state.currentPage > totalPages) state.currentPage = totalPages;
        if (state.currentPage < 1) state.currentPage = 1;

        const start = (state.currentPage - 1) * state.pageSize + 1;
        const end = Math.min(state.currentPage * state.pageSize, state.totalRecords);

        showingStartSpan.textContent = start;
        showingEndSpan.textContent = end;
        totalFilteredSpan.textContent = state.totalRecords;
        totalPagesSpan.textContent = totalPages;
        currentPageInput.value = state.currentPage;

        firstPageBtn.disabled = state.currentPage === 1;
        prevPageBtn.disabled = state.currentPage === 1;
        nextPageBtn.disabled = state.currentPage === totalPages;
        lastPageBtn.disabled = state.currentPage === totalPages;
    }

    function getCurrentPageData() {
        const start = (state.currentPage - 1) * state.pageSize;
        const end = Math.min(start + state.pageSize, state.filteredRecords.length);
        return state.filteredRecords.slice(start, end);
    }

    // ============================================================
    // RENDER - Single entry point for all UI updates
    // ============================================================

    function render() {
        // Prevent duplicate renders
        const renderHash = JSON.stringify({
            records: state.filteredRecords.slice((state.currentPage - 1) * state.pageSize, state.currentPage * state.pageSize).map(r => r.id),
            page: state.currentPage,
            pageSize: state.pageSize,
            mode: state.currentSearchMode,
            selection: state.selection
        });

        if (renderHash === state.lastRenderHash) {
            return;
        }
        state.lastRenderHash = renderHash;

        renderPagination();
        renderTablePage();
        updateSelectionCount();
        updateScanCounter();
    }

    // ============================================================
    // RENDER TABLE PAGE
    // ============================================================

    function renderTablePage() {
        const pageRecords = getCurrentPageData();
        const mode = state.currentSearchMode;
        const isSearchResult = state.currentMode === 'search' && state.currentResults.length > 0;

        // Build table header
        let theadHtml = buildTableHeader(mode, isSearchResult);
        recordsTableHead.innerHTML = theadHtml;

        // Build table body
        let tbodyHtml = '';
        if (pageRecords.length === 0) {
            tbodyHtml = buildEmptyStateMessage(mode);
        } else {
            for (let idx = 0; idx < pageRecords.length; idx++) {
                const globalIndex = (state.currentPage - 1) * state.pageSize + idx;
                const record = pageRecords[idx];
                const isSelected = state.selection.isActive &&
                    globalIndex >= Math.min(state.selection.fromIndex, state.selection.toIndex) &&
                    globalIndex <= Math.max(state.selection.fromIndex, state.selection.toIndex);

                tbodyHtml += buildRowHtml(record, globalIndex, isSelected, mode, isSearchResult);
            }
        }
        recordsTableBody.innerHTML = tbodyHtml;

        // Attach event listeners via delegation (handled by the click delegate below)
        // But we need to re-attach inline onclick handlers for buttons that were added via HTML
        attachRowEventListeners();
    }

    function buildTableHeader(mode, isSearchResult) {
        if (mode === 'add') {
            if (isSearchResult) {
                let html = '<tr><th style="width:60px;">Range</th><th style="width:60px;">Image</th><th>Artist</th><th>Title</th><th>Catalog #</th>';
                if (!state.defaultParamsActive || !state.defaultParams.sleeveConditionId) html += '<th>Sleeve</th>';
                if (!state.defaultParamsActive || !state.defaultParams.discConditionId) html += '<th>Disc</th>';
                if (!state.defaultParamsActive || !state.defaultParams.price) html += '<th>Price</th>';
                if (!state.defaultParamsActive || !state.defaultParams.consignorId) html += '<th>Consignor</th>';
                if (!state.defaultParamsActive || !state.defaultParams.formatId) html += '<th>Format</th>';
                html += '<th>Notes</th><th>Action</th></tr>';
                return html;
            } else {
                if (state.selectedPurchaseId && state.currentPurchaseRecords.length > 0) {
                    return '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Catalog #</th><th>Sleeve</th><th>Disc</th><th>Barcode</th><th>Created At</th><th>Action</th></tr>';
                } else {
                    return '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Catalog #</th><th>Sleeve</th><th>Disc</th><th>Barcode</th><th>Created At</th></tr>';
                }
            }
        } else if (mode === 'scan') {
            return '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Barcode</th><th>Last Seen</th></tr>';
        } else if (mode === 'discogs') {
            return '<tr><th style="width:60px;">Range</th><th>Image</th><th>ID</th><th>Artist</th><th>Title</th><th>Catalog #</th><th>Media Cond</th><th>Sleeve Cond</th><th>Store Price</th><th>Discogs Price</th><th>Markup %</th><th>Location</th><th>Post</th></tr>';
        } else if (mode === 'discogs_orders') {
            return '<tr><th>#</th><th>Artist</th><th>Title</th><th>Catalog</th><th>Barcode</th><th>Price</th><th>Condition</th><th>PigStyle ID</th><th>Status</th><th>Action</th></tr>';
        }
        return '';
    }

    function buildEmptyStateMessage(mode) {
        let msg = 'No records found';
        if (mode === 'add' && state.currentMode !== 'search') {
            if (state.selectedPurchaseId) {
                msg = 'No records linked to this purchase. Search Discogs to add records.';
            } else {
                msg = 'No purchase selected. Click a row in the purchases table above.';
            }
        }
        if (mode === 'scan') msg = 'Select a location and scan barcodes to add records.';
        if (mode === 'discogs') msg = 'No records found. Check filters or add records in "Add Record" mode.';
        if (mode === 'discogs_orders') {
            if (state.ordersList.length === 0) msg = 'No Discogs orders found. Click Refresh Orders.';
            else if (!state.selectedOrderId) msg = 'Select an order from the dropdown.';
            else msg = 'This order has no items.';
        }
        const colCount = mode === 'discogs_orders' ? 10 :
            (mode === 'add' ? (state.currentMode === 'search' ? 12 : (state.selectedPurchaseId ? 11 : 10)) :
                (mode === 'scan' ? 7 : (mode === 'discogs' ? 13 : 7)));
        return '<tr><td colspan="' + colCount + '" style="text-align:center;padding:40px;">' + msg + '</td></tr>';
    }

    function buildRowHtml(record, globalIndex, isSelected, mode, isSearchResult) {
        const rowClass = isSelected ? 'record-selected' : '';
        let rowHtml = '<tr class="' + rowClass + '" data-index="' + globalIndex + '">';

        // Range buttons
        const rangeButtons = buildRangeButtons(globalIndex);
        rowHtml += '<td style="text-align:center; white-space:nowrap;">' + rangeButtons + '</td>';

        if (mode === 'add' && isSearchResult) {
            rowHtml += buildSearchResultRow(record);
        } else if (mode === 'add' && !isSearchResult) {
            rowHtml += buildInventoryRow(record);
        } else if (mode === 'scan') {
            rowHtml += buildScanRow(record);
        } else if (mode === 'discogs') {
            rowHtml += buildDiscogsRow(record);
        } else if (mode === 'discogs_orders') {
            rowHtml += buildDiscogsOrderRow(record, globalIndex);
        }

        rowHtml += '</tr>';
        return rowHtml;
    }

    function buildRangeButtons(index) {
        if (state.currentSearchMode === 'discogs_orders') return '';

        if (!state.selection.isActive) {
            return '<button class="btn-from" data-index="' + index + '" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button><span style="color:#999; margin:0 4px;">to</span>';
        }

        if (state.selection.fromIndex === index && state.selection.toIndex === index) {
            return '<span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">FROM ✓</span><span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">TO ✓</span>';
        }
        if (state.selection.fromIndex === index) {
            return '<span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">FROM ✓</span><button class="btn-to" data-index="' + index + '" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>';
        }
        if (state.selection.toIndex === index) {
            return '<button class="btn-from" data-index="' + index + '" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button><span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">TO ✓</span>';
        }
        return '<button class="btn-from" data-index="' + index + '" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button><button class="btn-to" data-index="' + index + '" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>';
    }

    function buildSearchResultRow(record) {
        const artist = record.artist || 'Unknown';
        const title = record.title || 'Unknown';
        const catalog = record.catalog_number || '';
        const imageUrl = record.image_url || record.thumb || '';

        const condOptions = state.conditions.map(function(c) {
            return '<option value="' + c.id + '">' + (c.display_name || c.condition_name) + '</option>';
        }).join('');

        const consignorOptions = state.consignors.map(function(c) {
            return '<option value="' + c.id + '">' + c.username + '</option>';
        }).join('');

        const formatOptions = state.formats.map(function(f) {
            return '<option value="' + f.id + '">' + f.name + '</option>';
        }).join('');

        let html = '';
        const imageHtml = imageUrl ?
            '<img src="' + escapeHtml(imageUrl) + '" style="width:80px; height:80px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="expandImage(\'' + escapeHtml(imageUrl) + '\', \'' + escapeHtml(artist) + ' - ' + escapeHtml(title) + '\')" title="Click to expand">' :
            '<div style="width:80px; height:80px; background:#eee; border-radius:4px;"></div>';

        html += '<td style="text-align:center;">' + imageHtml + '</td>';
        html += '<td>' + escapeHtml(artist) + '</td>';
        html += '<td>' + escapeHtml(title) + '</td>';
        html += '<td>' + escapeHtml(catalog) + '</td>';

        if (!state.defaultParamsActive || !state.defaultParams.sleeveConditionId) {
            html += '<td><select class="sleeve-condition-select" style="width:100px; padding:4px;"><option value="">Select...</option>' + condOptions + '</select></td>';
        }
        if (!state.defaultParamsActive || !state.defaultParams.discConditionId) {
            html += '<td><select class="disc-condition-select" style="width:100px; padding:4px;"><option value="">Select...</option>' + condOptions + '</select></td>';
        }
        if (!state.defaultParamsActive || !state.defaultParams.price) {
            html += '<td><input type="number" class="price-input" step="1" min="' + (state.minimumPrice !== null ? state.minimumPrice : 0) + '" value="" style="width:80px; padding:4px;"></td>';
        }
        if (!state.defaultParamsActive || !state.defaultParams.consignorId) {
            html += '<td><select class="consignor-select" style="width:100px; padding:4px;"><option value="">None</option>' + consignorOptions + '</select></td>';
        }
        if (!state.defaultParamsActive || !state.defaultParams.formatId) {
            html += '<td><select class="format-select" style="width:100px; padding:4px;"><option value="">Select...</option>' + formatOptions + '</select></td>';
        }
        html += '<td><input type="text" class="notes-input" placeholder="Optional note..." style="width:120px; padding:4px; font-size:12px;"></td>';
        html += '<td><button class="btn-add-record-from-search" data-index="' + globalIndex + '" style="background:#28a745; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;"><i class="fas fa-plus"></i> Add</button></td>';

        return html;
    }

    function buildInventoryRow(record) {
        const display = getRecordDisplay(record);
        const price = record.store_price ? '$' + record.store_price.toFixed(2) : 'N/A';
        const catalog = record.catalog_number || '—';
        const sleeveCondition = record.sleeve_condition_name || '—';
        const discCondition = record.disc_condition_name || '—';
        const barcode = record.barcode || record.id;
        const created = record.created_at ? new Date(record.created_at).toLocaleString() : 'Unknown';

        let html = '';
        html += '<td>' + record.id + '</td>';
        html += '<td>' + escapeHtml(display) + '</td>';
        html += '<td>' + price + '</td>';
        html += '<td>' + escapeHtml(catalog) + '</td>';
        html += '<td>' + escapeHtml(sleeveCondition) + '</td>';
        html += '<td>' + escapeHtml(discCondition) + '</td>';
        html += '<td><span class="barcode-value">' + barcode + '</span></td>';
        html += '<td>' + created + '</td>';

        if (state.selectedPurchaseId) {
            html += '<td><button class="btn btn-sm btn-danger" onclick="removeRecordFromPurchase(' + record.id + ')"><i class="fas fa-times"></i></button></td>';
        } else {
            html += '<td></td>';
        }

        return html;
    }

    function buildScanRow(record) {
        const display = getRecordDisplay(record);
        const price = record.store_price ? '$' + record.store_price.toFixed(2) : 'N/A';
        const barcode = record.barcode || record.id;
        const lastSeen = record.last_seen ? new Date(record.last_seen).toLocaleDateString() : 'Never';

        let html = '';
        html += '<td>' + record.id + '</td>';
        html += '<td>' + escapeHtml(display) + '</td>';
        html += '<td>' + price + '</td>';
        html += '<td><span class="barcode-value">' + barcode + '</span></td>';
        html += '<td>' + lastSeen + '</td>';
        return html;
    }

    function buildDiscogsRow(record) {
        const display = getRecordDisplay(record);
        const catalog = record.catalog_number || '—';
        const mediaCond = record.disc_condition_name || '—';
        const sleeveCond = record.sleeve_condition_name || '—';
        const storePrice = record.store_price ? '$' + parseFloat(record.store_price).toFixed(2) : '—';
        const imageUrl = record.image_url && record.image_url !== '' && record.image_url !== 'None' ? record.image_url : null;
        const locationDisplay = getLocationDisplay(record.location_id);
        const discogsPrice = record._discogsPrice !== undefined ? record._discogsPrice : null;
        const markupPercent = record._markupPercent !== undefined ? record._markupPercent : null;
        const displayDiscogsPrice = discogsPrice ? '$' + discogsPrice.toFixed(2) : '—';
        const markupClass = (markupPercent > 0) ? 'positive' : ((markupPercent < 0) ? 'negative' : 'zero');
        const displayMarkup = (markupPercent !== null) ? (markupPercent > 0 ? '+' : '') + markupPercent + '%' : '—';

        const imgHtml = imageUrl ?
            '<img src="' + escapeHtml(imageUrl) + '" style="width:80px; height:80px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="expandImage(\'' + escapeHtml(imageUrl) + '\', \'' + escapeHtml(display) + '\')" title="Click to expand">' :
            '<div style="width:80px; height:80px; background:#e0e0e0; border-radius:4px;"></div>';

        let html = '';
        html += '<td style="text-align:center;">' + imgHtml + '</td>';
        html += '<td>' + record.id + '</td>';
        html += '<td><strong>' + escapeHtml(display) + '</strong></td>';
        html += '<td>' + escapeHtml(catalog) + '</td>';
        html += '<td>' + escapeHtml(mediaCond) + '</td>';
        html += '<td>' + escapeHtml(sleeveCond) + '</td>';
        html += '<td>' + storePrice + '</td>';
        html += '<td class="discogs-price-cell" style="' + (discogsPrice ? 'color: #28a745; font-weight: bold;' : 'color: #999;') + '">' + displayDiscogsPrice + '</td>';
        html += '<td class="markup-cell ' + markupClass + '">' + displayMarkup + '</td>';
        html += '<td title="' + escapeHtml(locationDisplay) + '" style="font-size: 12px;">' + escapeHtml(locationDisplay.length > 30 ? locationDisplay.substring(0, 27) + '...' : locationDisplay) + '</td>';
        html += '<td style="text-align: center;">' + (discogsPrice ? '<button class="post-single-btn" data-record-id="' + record.id + '" data-display="' + escapeHtml(display) + '" data-price="' + record.store_price + '" data-discogs-price="' + discogsPrice + '" data-markup-percent="' + markupPercent + '" data-media-condition="' + mediaCond + '" data-sleeve-condition="' + sleeveCond + '" data-catalog="' + escapeHtml(catalog) + '" data-location="' + escapeHtml(locationDisplay) + '" data-notes="' + escapeHtml(record.notes || '') + '"><i class="fab fa-discogs"></i> Post</button>' : '<span style="color: #999;">—</span>') + '</td>';

        return html;
    }

    function buildDiscogsOrderRow(orderItem, globalIndex) {
        const idxNum = globalIndex + 1;
        const display = getRecordDisplay(orderItem);
        const catalog = orderItem.catalog_number || '—';
        const barcode = orderItem.barcode || '—';
        const price = orderItem.price || 0;
        const condition = orderItem.media_condition || '—';
        const pigstyleId = orderItem.pigstyle_id || '';
        const recordStatus = orderItem.record_status_id;
        let statusText = '—';
        let statusClass = '';
        if (recordStatus === 2) { statusText = 'Active'; statusClass = 'active'; } else if (recordStatus === 3 || recordStatus === 4) { statusText = 'Sold'; statusClass = 'sold'; } else if (recordStatus === 1) { statusText = 'New'; statusClass = 'new'; } else { statusText = 'Not found'; statusClass = ''; }

        let actionButton = '';
        if (pigstyleId && recordStatus !== 3 && recordStatus !== 4) {
            actionButton = '<button class="btn btn-sm btn-success mark-discogs-sold-btn" data-record-id="' + pigstyleId + '" style="padding:2px 6px; font-size:11px; margin-top:4px;"><i class="fab fa-discogs"></i> Mark Sold</button>';
        }

        let html = '';
        html += '<td>' + idxNum + '</td>';
        html += '<td>' + escapeHtml(display) + '</td>';
        html += '<td>' + escapeHtml(catalog) + '</td>';
        html += '<td>' + escapeHtml(barcode) + '</td>';
        html += '<td>$' + price.toFixed(2) + '</td>';
        html += '<td>' + escapeHtml(condition) + '</td>';
        html += '<td><input type="text" class="pigstyle-id-input" value="' + escapeHtml(pigstyleId) + '" placeholder="ID or barcode" style="width:100px; padding:4px; border:1px solid #ddd; border-radius:4px;"><button class="btn btn-sm btn-secondary scan-pigstyle-btn" style="padding:2px 6px; font-size:12px;"><i class="fas fa-qrcode"></i></button></td>';
        html += '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>';
        html += '<td>' + actionButton + '</td>';

        return html;
    }

    // ============================================================
    // EVENT DELEGATION - Single listener for all row interactions
    // ============================================================

    function attachRowEventListeners() {
        // The actual event listeners are attached via delegation in the init function
        // This function is called after each render to ensure inline onclick handlers work
        // For buttons that need dynamic behavior, we use data attributes and delegation
    }

    // ============================================================
    // DISCOGS PRICES
    // ============================================================

    async function calculateMarkupBatch(records) {
        if (!records || records.length === 0) return [];
        try {
            const result = await apiRequest('POST', '/api/discogs/calculate-markup-batch', { records: records });
            if (result.status === 'success') {
                return result.results;
            } else {
                console.error('Batch markup error:', result.error);
                return [];
            }
        } catch (error) {
            console.error('Error in batch markup:', error);
            return [];
        }
    }

    async function populateDiscogsPrices(records) {
        if (state.currentSearchMode !== 'discogs') return;
        if (!records || records.length === 0) return;

        const eligibleRecords = records.filter(function(r) {
            return r.status_id === 2 && !hasConsignor(r) && meetsLastSeenFilter(r) && r.created_at;
        });

        if (eligibleRecords.length === 0) return;

        const priceRequests = eligibleRecords.map(function(r) {
            return {
                id: r.id,
                created_at: r.created_at,
                store_price: r.store_price
            };
        });

        const pricesMap = {};
        try {
            const batchResults = await calculateMarkupBatch(priceRequests);
            batchResults.forEach(function(item) {
                if (item.id) {
                    pricesMap[item.id] = item;
                }
            });
        } catch (error) {
            console.error('Error calculating prices:', error);
            return;
        }

        records.forEach(function(record) {
            if (pricesMap[record.id]) {
                record._discogsPrice = pricesMap[record.id].discogs_price;
                record._markupPercent = pricesMap[record.id].markup_percent;
            } else {
                record._discogsPrice = null;
                record._markupPercent = null;
            }
        });

        render();
    }

    // ============================================================
    // SCAN FUNCTIONS
    // ============================================================

    function updateScanLocationPreview() {
        const locationId = scanLocationSelect ? parseInt(scanLocationSelect.value) : null;
        const locData = locationId ? getLocationById(locationId) : null;
        const displayName = locData ? (locData.genre_name ? locData.genre_name + ' - ' + locData.name : locData.name) : '-- Please select a location --';

        if (scanLocationDisplay) {
            scanLocationDisplay.textContent = displayName;
        }

        if (scanIndexDisplay) {
            scanIndexDisplay.textContent = '📍 Index: ' + state.scanIndex;
        }

        const allSelected = locationId;
        if (scanInput) scanInput.disabled = !allSelected;
        if (scanSubmitBtn) scanSubmitBtn.disabled = !allSelected;
    }

    function updateScanCounter() {
        const counterEl = document.getElementById('scan-counter-display');
        if (counterEl) {
            counterEl.textContent = state.scanCounter || state.filteredRecords.length;
        }
    }

    function resetScanCounter() {
        state.scanCounter = 0;
        state.scanIndex = 0;
        updateScanCounter();
        if (scanIndexDisplay) {
            scanIndexDisplay.textContent = '📍 Index: 0';
        }
        updateScanLocationPreview();
    }

    function addToRecentScans(record, locationString) {
        if (state.recentScans.length > 0 && state.recentScans[0].record.id === record.id) {
            return;
        }

        const recordCopy = {
            id: record.id,
            artist: record.artist,
            title: record.title,
            barcode: record.barcode || '',
            catalog_number: record.catalog_number || '',
            store_price: record.store_price || 0,
            status_id: record.status_id || null,
            location_id: record.location_id || null,
            location_index: record.location_index || null,
            last_seen: record.last_seen || null,
            image_url: record.image_url || ''
        };

        state.recentScans.unshift({
            record: recordCopy,
            location: locationString,
            timestamp: Date.now()
        });

        if (state.recentScans.length > MAX_RECENT_SCANS) {
            state.recentScans.pop();
        }

        try {
            const serialized = state.recentScans.map(function(s) {
                return {
                    recordId: s.record.id,
                    artist: s.record.artist,
                    title: s.record.title,
                    location: s.location,
                    timestamp: s.timestamp
                };
            });
            localStorage.setItem('recentScans', JSON.stringify(serialized));
        } catch (e) {
            console.warn('Could not save recent scans:', e);
        }

        updateRecentScansUI();
    }

    function loadRecentScansFromStorage() {
        try {
            const stored = localStorage.getItem('recentScans');
            if (stored) {
                const parsed = JSON.parse(stored);
                state.recentScans = parsed.map(function(item) {
                    return {
                        record: {
                            id: item.recordId,
                            artist: item.artist || 'Unknown Artist',
                            title: item.title || 'Unknown Title'
                        },
                        location: item.location || '',
                        timestamp: item.timestamp
                    };
                });
            }
        } catch (e) {
            console.warn('Could not load recent scans from storage:', e);
        }
    }

    function updateRecentScansUI() {
        if (!recentScansList) return;

        if (state.recentScans.length === 0) {
            recentScansList.innerHTML = '<div class="no-recent-scans">No recent scans</div>';
            if (lastScanDisplay) lastScanDisplay.textContent = 'Last: --';
            return;
        }

        let html = '';
        state.recentScans.forEach(function(scan, index) {
            const isLast = index === 0;
            const record = scan.record;
            const display = getRecordDisplay(record);
            const location = scan.location || '—';
            const time = scan.timestamp ? new Date(scan.timestamp).toLocaleTimeString() : '';

            html += '<div class="recent-scan-item ' + (isLast ? 'recent-scan-last' : '') + '">';
            html += '<span class="scan-index-badge">#' + (index + 1) + '</span>';
            html += '<span class="scan-artist-title">' + escapeHtml(display) + '</span>';
            html += '<span class="scan-location">' + escapeHtml(location) + '</span>';
            if (time) {
                html += '<span class="scan-time">' + time + '</span>';
            }
            html += '</div>';
        });
        recentScansList.innerHTML = html;

        if (lastScanDisplay && state.recentScans.length > 0) {
            const last = state.recentScans[0];
            const display = getRecordDisplay(last.record);
            lastScanDisplay.textContent = 'Last: ' + escapeHtml(display);
        }
    }

    function getArtistSortKey(artistName) {
        if (!artistName) return '';
        let name = artistName.trim();
        name = name.replace(/^the\s+/i, '');
        return name.charAt(0).toUpperCase();
    }

    function calculateMatchScore(record, recentScansList) {
        if (!recentScansList || recentScansList.length === 0) return 0;
        const recordSortKey = getArtistSortKey(record.artist);
        let score = 0;
        for (let i = 0; i < recentScansList.length; i++) {
            const recent = recentScansList[i];
            const weight = Math.pow(0.5, i);
            if (recent.sortKey === recordSortKey) {
                score += 100 * weight;
            }
            const recentArtistLower = recent.artist.toLowerCase();
            const recordArtistLower = record.artist.toLowerCase();
            const recentFirstWord = recentArtistLower.replace(/^the\s+/, '').split(' ')[0];
            const recordFirstWord = recordArtistLower.replace(/^the\s+/, '').split(' ')[0];
            if (recentFirstWord === recordFirstWord && recentFirstWord.length > 2) {
                score += 30 * weight;
            }
        }
        if (record.status_id === 2) score += 50;
        if (record.status_id === 3) score -= 100;
        return score;
    }

    async function performScanSearch(term) {
        const locationId = scanLocationSelect ? parseInt(scanLocationSelect.value) : null;
        const locData = locationId ? getLocationById(locationId) : null;
        const locationDisplay = locData ? (locData.genre_name ? locData.genre_name + ' - ' + locData.name : locData.name) : null;

        if (!locationId || !locationDisplay) {
            showStatus('Please select a location before scanning.', 'warning');
            playSound('error');
            return;
        }

        try {
            const data = await apiRequest('GET', '/records/search?q=' + encodeURIComponent(term));
            if (!data.records || !data.records.length) {
                playSound('error');
                showStatus('No record found with that barcode or ID', 'error');
                if (scanInput) scanInput.value = '';
                return;
            }

            const records = data.records;

            if (records.length === 1) {
                await processScannedRecord(records[0]);
                return;
            }

            const recentScansList = state.recentScans.map(function(s) {
                return {
                    artist: s.record.artist,
                    sortKey: getArtistSortKey(s.record.artist)
                };
            });

            const scored = records.map(function(record) {
                return {
                    record: record,
                    score: calculateMatchScore(record, recentScansList)
                };
            });

            scored.sort(function(a, b) { return b.score - a.score; });

            const best = scored[0];
            const secondBest = scored.length > 1 ? scored[1] : null;
            const bestScore = best.score;
            const secondScore = secondBest ? secondBest.score : 0;

            const HIGH_CONFIDENCE_SCORE = 100;
            const GAP_THRESHOLD = 40;
            const AUTO_SELECT_SCORE = 80;
            const AUTO_SELECT_GAP = 30;

            let selectedRecord = null;
            let confidence = 'low';

            if (bestScore > HIGH_CONFIDENCE_SCORE && (bestScore - secondScore) > GAP_THRESHOLD) {
                selectedRecord = best.record;
                confidence = 'high';
            } else if (bestScore > AUTO_SELECT_SCORE && (bestScore - secondScore) > AUTO_SELECT_GAP) {
                selectedRecord = best.record;
                confidence = 'medium';
            }

            if (selectedRecord) {
                playSound('success');
                const display = getShortRecordDisplay(selectedRecord, 30);
                showStatus('🎯 Auto-selected: ' + display + ' (' + confidence + ' confidence)', 'success');
                await processScannedRecord(selectedRecord);
                return;
            }

            playSound('error');
            showStatus('⚠️ Multiple records (' + records.length + ') found. Please use a unique barcode or ID.', 'error');
            if (scanInput) scanInput.value = '';

        } catch (error) {
            playSound('error');
            showStatus('Error scanning: ' + error.message, 'error');
            console.error('Scan search error:', error);
            if (scanInput) scanInput.value = '';
        }
    }

    async function processScannedRecord(record) {
        const locationId = scanLocationSelect ? parseInt(scanLocationSelect.value) : null;
        const locData = locationId ? getLocationById(locationId) : null;
        const locationDisplay = locData ? (locData.genre_name ? locData.genre_name + ' - ' + locData.name : locData.name) : '';

        const existing = state.filteredRecords.find(function(r) { return r.id === record.id; });
        const today = getLocalMSTDate();
        const index = state.scanIndex + 1;

        if (existing) {
            try {
                await apiRequest('PUT', '/records/' + record.id, {
                    location_id: locationId,
                    location_index: existing.location_index || index,
                    last_seen: today
                });
                existing.last_seen = today;
                existing.location_name = locationDisplay;
                existing.location_id = locationId;

                render();
                playSound('success');
                const display = getShortRecordDisplay(record, 30);
                showStatus('✅ Updated #' + record.id + ': ' + display, 'success');
                if (scanInput) scanInput.value = '';
                addToRecentScans(record, locationDisplay || record.location_name || '');
                return;
            } catch (error) {
                showStatus('Error updating record: ' + error.message, 'error');
                playSound('error');
                return;
            }
        }

        try {
            await apiRequest('PUT', '/records/' + record.id, {
                location_id: locationId,
                location_index: index,
                last_seen: today
            });

            record.location_id = locationId;
            record.location_index = index;
            record.last_seen = today;
            record.location_name = locationDisplay;

            state.filteredRecords.unshift(record);
            state.totalRecords = state.filteredRecords.length;
            state.scanIndex = index;
            state.currentPage = 1;

            render();
            playSound('success');
            const display = getShortRecordDisplay(record, 30);
            showStatus('✅ Added #' + record.id + ': ' + display, 'success');
            if (scanInput) scanInput.value = '';
            addToRecentScans(record, locationDisplay || '');
            updateScanLocationPreview();

        } catch (error) {
            showStatus('Error adding record: ' + error.message, 'error');
            playSound('error');
        }
    }

    // ============================================================
    // LOAD RECORDS
    // ============================================================

    async function loadRecords(options) {
        options = options || {};
        try {
            const {
                statusIds,
                location,
                search,
                mode,
                requireImage = false,
                requireLocation = false,
                excludeOldNoLocation = false,
                bypassDateFilter = true,
                createdAfter,
                limit,
                random = false,
                hasYoutube = false,
                filterBySearch = true,
                showAllStatuses = false,
                format = null,
                excludeBatch = false,
                batchId = null,
                locationId = null
            } = options;

            let url = '/records';
            const params = new URLSearchParams();

            if (locationId) {
                url = '/api/records/by-location';
                params.append('location_id', locationId);
            } else {
                if (!showAllStatuses && statusIds && statusIds.length > 0) {
                    params.append('status_ids', statusIds.join(','));
                }
                if (requireImage) params.append('require_image', 'true');
                if (requireLocation) params.append('require_location', 'true');
                if (excludeOldNoLocation) params.append('exclude_old_no_location', 'true');
                if (bypassDateFilter && !createdAfter) params.append('bypass_date_filter', 'true');
                if (createdAfter) params.append('created_after', createdAfter);
                if (limit) params.append('limit', limit);
                if (random) params.append('random', 'true');
                if (hasYoutube) params.append('has_youtube', 'true');
                if (search && filterBySearch) params.append('search', search);
                if (format) params.append('format', format);
                if (excludeBatch) params.append('exclude_batch', 'true');
                if (batchId) params.append('batch_id', batchId);
            }

            const queryString = params.toString();
            const fullUrl = window.AppConfig.baseUrl + url + (queryString ? '?' + queryString : '');

            const response = await fetch(fullUrl, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to load records');

            let records = data.records || [];

            if (location && search && filterBySearch) {
                const term = search.toLowerCase();
                records = records.filter(function(r) {
                    return (r.artist && r.artist.toLowerCase().includes(term)) ||
                        (r.title && r.title.toLowerCase().includes(term)) ||
                        (r.barcode && r.barcode.toLowerCase().includes(term)) ||
                        (r.catalog_number && r.catalog_number.toLowerCase().includes(term));
                });
            }

            if (!location && search && !filterBySearch) {
                const term = search.toLowerCase();
                records = records.filter(function(r) {
                    return (r.artist && r.artist.toLowerCase().includes(term)) ||
                        (r.title && r.title.toLowerCase().includes(term)) ||
                        (r.barcode && r.barcode.toLowerCase().includes(term)) ||
                        (r.catalog_number && r.catalog_number.toLowerCase().includes(term));
                });
            }

            if (mode === 'discogs' && state.lastSeenCutoffDate) {
                records = records.filter(function(r) { return meetsLastSeenFilter(r); });
            }

            // Update state
            state.allRecords = records;
            state.filteredRecords = records;
            state.totalRecords = state.filteredRecords.length;
            state.currentPage = 1;
            state.currentMode = mode || 'inventory';

            if (mode === 'add' && !search) {
                state.currentResults = [];
            }

            if (mode === 'discogs' && location) {
                state.currentLocationRecords = records;
                await populateDiscogsPrices(records);
            }

            // Single render
            render();

            // Status message
            let statusMsg = 'Showing ' + state.totalRecords + ' records';
            if (statusIds && statusIds.length === 1) statusMsg += ' with status_id=' + statusIds[0];
            else if (statusIds && statusIds.length > 1) statusMsg += ' with status_ids ' + statusIds.join(', ');
            if (location) statusMsg += ' in location "' + location + '"';
            if (search) statusMsg += ' matching "' + search + '"';
            if (excludeBatch) statusMsg += ' (excluding linked records)';
            if (batchId) statusMsg += ' (purchase ' + batchId + ')';
            showStatus(statusMsg, 'info');

            return records;
        } catch (error) {
            console.error('❌ loadRecords error:', error);
            showStatus('Error loading records: ' + error.message, 'error');
            return [];
        }
    }

    // ============================================================
    // PURCHASE FUNCTIONS (abbreviated for space)
    // ============================================================

    async function loadPurchasesTable() {
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/inventory-purchases', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to load purchases');

            const purchases = data.purchases || [];
            if (!purchasesBody) return;

            const badge = document.getElementById('purchase-table-badge');
            if (badge) {
                badge.textContent = '(' + purchases.length + ' total)';
            }

            if (purchases.length === 0) {
                purchasesBody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999;">No purchases found. Click "New" to create one.</td></tr>';
                populateDefaultPurchaseDropdown();
                return;
            }

            let html = '';
            purchases.forEach(p => {
                const isSelected = (p.id == state.selectedPurchaseId);
                html += `<tr class="${isSelected ? 'record-selected' : ''}" data-id="${p.id}">`;
                html += `<td>${p.id}</td>`;
                html += `<td>${escapeHtml(p.seller_name)}</td>`;
                html += `<td><span class="status-badge ${p.status === 'complete' ? 'paid' : 'draft'}">${p.status}</span></td>`;
                html += `<td>${p.record_count || 0}</td>`;
                html += `<td>${p.amount_spent && p.amount_spent > 0 ? '$' + p.amount_spent.toFixed(2) : '—'}</td>`;
                html += `<td>${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>`;
                html += `<td>${p.bill_of_sale_path ? '<i class="fas fa-file-pdf" style="color:#28a745;"></i>' : '<i class="fas fa-times" style="color:#999;"></i>'}</td>`;
                html += `<td><button class="btn btn-sm btn-danger" onclick="deletePurchase(${p.id})"><i class="fas fa-trash"></i></button></td>`;
                html += `</tr>`;
            });
            purchasesBody.innerHTML = html;

            populateDefaultPurchaseDropdown();

            if (state.selectedPurchaseId) {
                const row = purchasesBody.querySelector(`tr[data-id="${state.selectedPurchaseId}"]`);
                if (row) row.classList.add('record-selected');

                if (currentPurchaseDisplay) {
                    currentPurchaseDisplay.style.display = 'block';
                    const sellerName = row?.querySelector('td:nth-child(2)')?.textContent || 'Unknown';
                    if (currentPurchaseName) currentPurchaseName.textContent = sellerName;
                    if (currentPurchaseIdSpan) currentPurchaseIdSpan.textContent = '(#' + state.selectedPurchaseId + ')';
                }
            } else {
                if (currentPurchaseDisplay) currentPurchaseDisplay.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading purchases:', error);
            showStatus('Error loading purchases: ' + error.message, 'error');
        }
    }

    async function selectPurchase(id) {
        state.selectedPurchaseId = id;
        await loadPurchasesTable();

        if (metadataPanel) metadataPanel.style.display = 'block';
        if (purchaseIdDisplay) purchaseIdDisplay.textContent = '#' + id;

        if (currentPurchaseDisplay) {
            currentPurchaseDisplay.style.display = 'block';
            const row = document.querySelector(`#purchases-body tr[data-id="${id}"]`);
            if (row) {
                const sellerName = row.querySelector('td:nth-child(2)')?.textContent || 'Unknown';
                if (currentPurchaseName) currentPurchaseName.textContent = sellerName;
                if (currentPurchaseIdSpan) currentPurchaseIdSpan.textContent = '(#' + id + ')';
            }
        }

        if (defaultPurchaseSelect) defaultPurchaseSelect.value = id;

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + id, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success' || !data.purchase) throw new Error(data.error || 'Purchase not found');

            const purchase = data.purchase;
            if (editPurchaseId) editPurchaseId.value = purchase.id;
            if (editSellerName) editSellerName.value = purchase.seller_name || '';
            if (editSellerContact) editSellerContact.value = purchase.seller_contact || '';
            if (editDescription) editDescription.value = purchase.description || '';
            if (editStatus) editStatus.value = purchase.status || 'draft';

            const billPath = purchase.bill_of_sale_path;
            if (editBillPreview) {
                if (billPath) {
                    const fullUrl = window.AppConfig.baseUrl + '/' + billPath.replace(/^\/+/, '');
                    if (billPath.toLowerCase().endsWith('.pdf')) {
                        editBillPreview.innerHTML = `<a href="${fullUrl}" target="_blank"><i class="fas fa-file-pdf"></i> View PDF</a>`;
                    } else {
                        editBillPreview.innerHTML = `<img src="${fullUrl}" style="max-height:100px;border-radius:4px;border:1px solid #ddd;">`;
                    }
                } else {
                    editBillPreview.innerHTML = '<span style="color:#999;">No bill uploaded</span>';
                }
            }

            if (editBillUpload) editBillUpload.value = '';

            if (acceptDraftBtn) {
                acceptDraftBtn.style.display = (purchase.status === 'draft' && purchase.record_count > 0) ? 'inline-block' : 'none';
            }

            if (deletePurchaseBtn) {
                deletePurchaseBtn.disabled = (purchase.status === 'complete');
            }

            await loadRecordsForPurchase(id);
            showStatus('Selected purchase: ' + purchase.seller_name + ' (' + (purchase.record_count || 0) + ' records)', 'info');

        } catch (error) {
            console.error('Error loading purchase metadata:', error);
            showStatus('Error loading purchase: ' + error.message, 'error');
        }
    }

    async function loadRecordsForPurchase(purchaseId) {
        try {
            await loadRecords({
                batchId: purchaseId,
                excludeBatch: false,
                mode: 'add',
                bypassDateFilter: true
            });
            state.currentPurchaseRecords = state.filteredRecords.slice();
            await loadPurchasesTable();
        } catch (error) {
            console.error('Error loading records for purchase:', error);
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPurchaseRecords = [];
            render();
        }
    }

    // ============================================================
    // DISCOGS ORDERS
    // ============================================================

    async function loadDiscogsOrdersList(status, dateFrom, dateTo, search) {
        try {
            let url = window.AppConfig.baseUrl + '/api/discogs/orders?per_page=200';
            if (status && status !== '') url += '&status=' + encodeURIComponent(status);
            if (dateFrom) url += '&date_from=' + encodeURIComponent(dateFrom);
            if (dateTo) url += '&date_to=' + encodeURIComponent(dateTo);
            if (search && search.trim() !== '') url += '&search=' + encodeURIComponent(search.trim());
            url += '&all=true';

            const response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });

            if (!response.ok) {
                let errorMsg = 'HTTP ' + response.status;
                try {
                    const errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                } catch (e) {}
                throw new Error(errorMsg);
            }

            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to load orders');

            state.ordersList = data.orders || [];
            state.ordersList.sort(function(a, b) {
                return new Date(b.created_at) - new Date(a.created_at);
            });

            if (discogsOrderSelect) {
                discogsOrderSelect.innerHTML = '<option value="">-- Select an order --</option>';
                for (let i = 0; i < state.ordersList.length; i++) {
                    const order = state.ordersList[i];
                    const option = document.createElement('option');
                    option.value = order.order_id || order.id;
                    const buyer = order.buyer_username || order.buyer_name || 'Unknown buyer';
                    const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '';
                    const total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '';
                    const itemCount = order.items ? order.items.length : 0;
                    option.textContent = order.order_id + ' - ' + buyer + ' ' + date + ' ' + total + ' (' + itemCount + ' items)';
                    discogsOrderSelect.appendChild(option);
                }
            }

            updateDiscogsOrdersStatus('✅ Loaded ' + state.ordersList.length + ' orders', 'success');

        } catch (error) {
            console.error('❌ Error loading orders:', error);
            updateDiscogsOrdersStatus('❌ Error: ' + error.message, 'error');
        }
    }

    // ============================================================
    // IMAGE EXPAND
    // ============================================================

    window.expandImage = function(imageUrl, title) {
        if (!imageUrl) return;

        const existingModal = document.getElementById('image-expand-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'image-expand-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.style.background = 'rgba(0,0,0,0.85)';
        modal.style.zIndex = '10000';
        modal.innerHTML = '<div style="max-width: 90vw; max-height: 90vh; position: relative; display: flex; flex-direction: column; align-items: center;"><button onclick="document.getElementById(\'image-expand-modal\').remove()" style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 24px; cursor: pointer; z-index: 10;">×</button>' + (title ? '<div style="color: white; font-size: 16px; padding: 10px; text-align: center; background: rgba(0,0,0,0.5); border-radius: 8px; margin-bottom: 10px; max-width: 100%;">' + escapeHtml(title) + '</div>' : '') + '<img src="' + escapeHtml(imageUrl) + '" style="max-width: 90vw; max-height: 80vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 30px rgba(0,0,0,0.5);"><div style="color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 10px;">Click outside to close</div></div>';
        document.body.appendChild(modal);

        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.remove();
        });

        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                if (document.getElementById('image-expand-modal')) {
                    document.getElementById('image-expand-modal').remove();
                }
                document.removeEventListener('keydown', escHandler);
            }
        });
    };

    // ============================================================
    // TOGGLE FUNCTIONS
    // ============================================================

    function toggleInventorySetupPanel() {
        const body = document.getElementById('inventory-setup-body');
        const icon = document.getElementById('inventory-setup-toggle-icon');
        if (!body || !icon) return;
        if (body.classList.contains('expanded')) {
            body.classList.remove('expanded');
            body.style.display = 'none';
            icon.classList.add('collapsed');
        } else {
            body.classList.add('expanded');
            body.style.display = 'block';
            icon.classList.remove('collapsed');
        }
    }

    function toggleDefaultParamsSub() {
        const body = document.getElementById('default-params-sub-body');
        const icon = document.getElementById('default-params-sub-toggle');
        if (!body || !icon) return;
        if (body.classList.contains('expanded')) {
            body.classList.remove('expanded');
            body.style.display = 'none';
            icon.classList.add('collapsed');
        } else {
            body.classList.add('expanded');
            body.style.display = 'block';
            icon.classList.remove('collapsed');
        }
    }

    function togglePurchaseTable() {
        const body = document.getElementById('purchase-table-body');
        const icon = document.getElementById('purchase-table-toggle-icon');
        if (!body || !icon) return;
        if (body.classList.contains('expanded')) {
            body.classList.remove('expanded');
            body.style.display = 'none';
            icon.classList.add('collapsed');
        } else {
            body.classList.add('expanded');
            body.style.display = 'block';
            icon.classList.remove('collapsed');
        }
    }

    function toggleMetadataPanel() {
        const body = document.getElementById('metadata-body');
        const icon = document.getElementById('metadata-toggle-icon');
        if (!body || !icon) return;
        if (body.style.display === 'none' || body.style.display === '') {
            body.style.display = 'block';
            icon.style.transform = 'rotate(0deg)';
        } else {
            body.style.display = 'none';
            icon.style.transform = 'rotate(-90deg)';
        }
    }

    function toggleMarkupRules() {
        const content = document.getElementById('markup-rules-content');
        const icon = document.getElementById('markup-rules-toggle-icon');
        if (!content || !icon) return;
        if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
            loadMarkupRules();
        } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
        }
    }

    function toggleMarkupCharts() {
        const content = document.getElementById('markup-charts-content');
        const icon = document.getElementById('markup-charts-toggle-icon');
        if (!content || !icon) return;
        if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
            setTimeout(loadMarkupAnalysisCharts, 300);
        } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
        }
    }

    // ============================================================
    // MARKUP RULES
    // ============================================================

    async function loadMarkupRules() {
        try {
            const data = await apiRequest('GET', '/api/markup-rules');
            if (data.status === 'success') {
                renderMarkupRules(data.rules);
            }
        } catch (error) {
            console.error('Error loading markup rules:', error);
        }
    }

    function renderMarkupRules(rules) {
        const tbody = document.getElementById('markup-rules-body');
        if (!tbody) return;
        if (!rules || rules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 30px; text-align: center; color: #999;">⚠️ No rules configured. Add your first rule above.</td></tr>';
            return;
        }
        rules.sort(function(a, b) { return a.days_old - b.days_old; });
        let html = '';
        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            html += '<tr style="border-bottom: 1px solid #dee2e6;">';
            html += '<td style="padding: 12px;">' + rule.days_old + '+ days</td>';
            html += '<td style="padding: 12px;"><input type="number" id="rule-percent-' + rule.id + '" value="' + rule.markup_percent + '" step="1" style="width: 80px; padding: 6px; border: 1px solid #ddd; border-radius: 4px;"><span>%</span></td>';
            html += '<td style="padding: 12px;"><input type="text" id="rule-desc-' + rule.id + '" value="' + escapeHtml(rule.description || '') + '" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;"></td>';
            html += '<td style="padding: 12px;">';
            html += '<button class="btn btn-sm btn-info" onclick="updateMarkupRule(' + rule.id + ')" style="padding: 4px 8px; margin-right: 5px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-save"></i></button> ';
            html += '<button class="btn btn-sm btn-danger" onclick="deleteMarkupRule(' + rule.id + ')" style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i></button>';
            html += '</td>';
            html += '</tr>';
        }
        tbody.innerHTML = html;
    }

    window.addMarkupRule = async function() {
        const daysInput = document.getElementById('new-rule-days');
        const percentInput = document.getElementById('new-rule-percent');
        const descInput = document.getElementById('new-rule-desc');
        if (!daysInput || !percentInput || !descInput) return;
        const days_old = parseInt(daysInput.value);
        const markup_percent = parseFloat(percentInput.value);
        const description = descInput.value;
        if (isNaN(days_old) || isNaN(markup_percent)) {
            showDiscogsStatus('Please enter valid days and percentage', 'error');
            return;
        }
        try {
            const result = await apiRequest('POST', '/api/markup-rules', {
                days_old: days_old,
                markup_percent: markup_percent,
                description: description
            });
            if (result.status === 'success') {
                showDiscogsStatus('Markup rule added successfully', 'success');
                daysInput.value = '';
                percentInput.value = '';
                descInput.value = '';
                loadMarkupRules();
                refreshDiscogsRecords();
            } else {
                showDiscogsStatus('Error: ' + (result.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    };

    window.updateMarkupRule = async function(ruleId) {
        const percentInput = document.getElementById('rule-percent-' + ruleId);
        const descInput = document.getElementById('rule-desc-' + ruleId);
        if (!percentInput || !descInput) return;
        const markup_percent = parseFloat(percentInput.value);
        const description = descInput.value;
        if (isNaN(markup_percent)) {
            showDiscogsStatus('Please enter a valid percentage', 'error');
            return;
        }
        try {
            const result = await apiRequest('PUT', '/api/markup-rules/' + ruleId, {
                markup_percent: markup_percent,
                description: description
            });
            if (result.status === 'success') {
                showDiscogsStatus('Markup rule updated successfully', 'success');
                loadMarkupRules();
                refreshDiscogsRecords();
            } else {
                showDiscogsStatus('Error: ' + (result.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    };

    window.deleteMarkupRule = async function(ruleId) {
        if (!confirm('Are you sure you want to delete this markup rule?')) return;
        try {
            const result = await apiRequest('DELETE', '/api/markup-rules/' + ruleId);
            if (result.status === 'success') {
                showDiscogsStatus('Markup rule deleted successfully', 'success');
                loadMarkupRules();
                refreshDiscogsRecords();
            } else {
                showDiscogsStatus('Error: ' + (result.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    };

    // ============================================================
    // MARKUP ANALYSIS CHARTS
    // ============================================================

    async function loadMarkupAnalysisCharts() {
        try {
            const cutoffInput = document.getElementById('last-seen-cutoff-date');
            let cutoff = '';
            if (cutoffInput && cutoffInput.value) {
                cutoff = cutoffInput.value;
            }
            const url = window.AppConfig.baseUrl + '/api/markup-analysis' + (cutoff ? '?cutoff=' + cutoff : '');
            const response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (!response.ok) throw new Error('Failed to load markup analysis data');
            const data = await response.json();
            if (data.status === 'success') {
                renderMarkupCurveChart(data);
                renderMarkupDistributionChart(data);
                renderAgeDistributionChart(data);
                const countEl = document.getElementById('chart-record-count');
                if (countEl) {
                    countEl.textContent = '📊 ' + (data.active_records_count || 0) + ' active records analyzed (cutoff: ' + (data.cutoff_date || 'N/A') + ') | ' + (data.rules_count || 0) + ' markup rules applied';
                }
            } else {
                console.error('Error loading markup analysis:', data.error);
                showDiscogsStatus('Error loading markup charts: ' + (data.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error loading markup analysis:', error);
            showDiscogsStatus('Error loading markup charts: ' + error.message, 'error');
        }
    }

    function renderMarkupCurveChart(data) {
        const canvas = document.getElementById('markup-curve-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (state.markupCurveChart) { state.markupCurveChart.destroy();
            state.markupCurveChart = null; }
        const points = data.curve_points || [];
        if (points.length === 0) {
            state.markupCurveChart = new Chart(ctx, {
                type: 'line',
                data: { labels: ['No Data'], datasets: [{ label: 'Markup %', data: [0], borderColor: '#ccc', backgroundColor: 'rgba(200,200,200,0.1)', borderWidth: 2, pointRadius: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        const days = points.map(function(p) { return p.days; });
        const markups = points.map(function(p) { return p.markup_percent; });
        const minMarkup = Math.min.apply(null, markups);
        const maxMarkup = Math.max.apply(null, markups);
        const yPadding = Math.max(5, Math.abs(maxMarkup - minMarkup) * 0.1);
        const xMax = data.chart_max_days || Math.max.apply(null, days);
        let xStepSize = 30;
        if (xMax > 730) xStepSize = 90;
        else if (xMax > 365) xStepSize = 60;

        state.markupCurveChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: days,
                datasets: [{
                    label: 'Markup %',
                    data: markups,
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0,123,255,0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Markup: ' + context.parsed.y + '% at ' + context.parsed.x + ' days';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        min: 0,
                        max: xMax,
                        title: { display: true, text: 'Days Since Created' },
                        ticks: {
                            stepSize: xStepSize,
                            callback: function(value) {
                                if (value === 0) return '0';
                                if (value === 365) return '365d';
                                return value + 'd';
                            }
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    y: {
                        min: minMarkup - yPadding,
                        max: maxMarkup + yPadding,
                        title: { display: true, text: 'Markup %' },
                        ticks: { callback: function(value) { return value + '%'; }, stepSize: 5 },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    }
                }
            }
        });
    }

    function renderMarkupDistributionChart(data) {
        const canvas = document.getElementById('markup-distribution-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (state.markupDistributionChart) { state.markupDistributionChart.destroy();
            state.markupDistributionChart = null; }
        const distribution = data.distribution || {};
        if (Object.keys(distribution).length === 0) {
            state.markupDistributionChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: ['No Data'], datasets: [{ label: 'Records', data: [0], backgroundColor: ['#ccc'], borderColor: ['#999'], borderWidth: 1 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        const sortedKeys = Object.keys(distribution).sort(function(a, b) { return parseFloat(a) - parseFloat(b); });
        const labels = sortedKeys;
        const counts = sortedKeys.map(function(key) { return distribution[key]; });
        const totalRecords = data.active_records_count || 0;
        const colors = labels.map(function(label) {
            const value = parseFloat(label);
            if (value > 0) return 'rgba(40,167,69,0.8)';
            if (value < 0) return 'rgba(220,53,69,0.8)';
            return 'rgba(255,193,7,0.8)';
        });

        state.markupDistributionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Records',
                    data: counts,
                    backgroundColor: colors,
                    borderColor: colors.map(function(c) { return c.replace('0.8', '1'); }),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const count = context.parsed.y;
                                const pct = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0;
                                return count + ' records (' + pct + '%)';
                            }
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Markup %' }, ticks: { maxRotation: 45, minRotation: 45 } },
                    y: { title: { display: true, text: 'Number of Records' }, beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    function renderAgeDistributionChart(data) {
        const canvas = document.getElementById('age-distribution-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (state.ageDistributionChart) { state.ageDistributionChart.destroy();
            state.ageDistributionChart = null; }
        const ageData = data.age_distribution || {};
        if (Object.keys(ageData).length === 0) {
            state.ageDistributionChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: ['No Data'], datasets: [{ label: 'Records', data: [0], backgroundColor: ['#ccc'], borderColor: ['#999'], borderWidth: 1 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        const sortedKeys = Object.keys(ageData).sort(function(a, b) { return parseInt(a) - parseInt(b); });
        const labels = sortedKeys.map(function(key) {
            const parts = key.split('-');
            if (parts.length === 2) return parts[0] + '-' + parts[1] + 'd';
            return key + 'd';
        });
        const counts = sortedKeys.map(function(key) { return ageData[key]; });
        const totalRecords = data.active_records_count || 0;
        const colors = sortedKeys.map(function(_, index) {
            return 'rgba(23,162,184,' + (0.6 + (index / sortedKeys.length) * 0.3) + ')';
        });

        state.ageDistributionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Records',
                    data: counts,
                    backgroundColor: colors,
                    borderColor: 'rgba(23,162,184,1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const count = context.parsed.y;
                                const pct = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0;
                                return count + ' records (' + pct + '%)';
                            }
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Age Cohort (days)' }, ticks: { maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 10 } },
                    y: { title: { display: true, text: 'Number of Records' }, beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
                }
            }
        });
        const statsEl = document.getElementById('age-chart-stats');
        if (statsEl && data.age_stats) {
            statsEl.textContent = '| Avg: ' + data.age_stats.avg_days + 'd | Min: ' + data.age_stats.min_days + ' | Max: ' + data.age_stats.max_days;
        }
    }

    // ============================================================
    // MODE CHANGE
    // ============================================================

    function setActiveMode(mode) {
        Object.values(modeContainers).forEach(container => {
            if (container) container.style.display = 'none';
        });
        const activeContainer = modeContainers[mode];
        if (activeContainer) {
            activeContainer.style.display = 'block';
        }
    }

    function onModeChange() {
        const newMode = searchModeSelect.value;
        state.currentSearchMode = newMode;

        clearSelection();
        setActiveMode(newMode);

        if (newMode !== 'add') {
            if (state.selectedPurchaseId) {
                clearPurchaseSelection();
            }
            if (metadataPanel) metadataPanel.style.display = 'none';
        }

        if (newMode === 'add') {
            state.currentMode = 'inventory';
            state.currentResults = [];
            populateDefaultParamSelects();
            loadPurchasesTable();
            if (!state.selectedPurchaseId) {
                clearPurchaseSelection();
            }
        } else if (newMode === 'scan') {
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            showStatus('Scan mode: Select a location and scan barcodes to build the list.', 'info');
            resetScanCounter();
            loadLocations();
            updateScanLocationPreview();
        } else if (newMode === 'discogs') {
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            showDiscogsStatus('Showing all records. Use filters to narrow down.', 'info');
            loadRecords({ showAllStatuses: true, mode: 'discogs' });
            loadDiscogsLocations();
            const rulesContent = document.getElementById('markup-rules-content');
            if (rulesContent && rulesContent.style.display === 'block') {
                loadMarkupRules();
            }
            const chartsContent = document.getElementById('markup-charts-content');
            if (chartsContent && chartsContent.style.display === 'block') {
                setTimeout(loadMarkupAnalysisCharts, 300);
            }
            if (lastSeenCutoffDateInput) {
                lastSeenCutoffDateInput.value = '';
                state.lastSeenCutoffDate = null;
            }
        } else if (newMode === 'discogs_orders') {
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            showStatus('Discogs Orders mode: Select an order to fulfill.', 'info');

            const dateFrom = document.getElementById('discogs-orders-date-from');
            const dateTo = document.getElementById('discogs-orders-date-to');
            if (dateFrom && !dateFrom.value) {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                dateFrom.value = thirtyDaysAgo.toISOString().split('T')[0];
            }
            if (dateTo && !dateTo.value) {
                dateTo.value = new Date().toISOString().split('T')[0];
            }

            const search = document.getElementById('discogs-orders-search');
            if (search) search.value = '';

            const statusFilter = document.getElementById('discogs-orders-status-filter');
            if (statusFilter) statusFilter.value = 'Payment Received';

            applyDiscogsOrdersFilters();

            if (discogsOrderSelect) discogsOrderSelect.value = '';
            state.selectedOrderId = null;
            state.currentOrderItems = [];
        }

        updateSelectionCount();
        render();
    }

    // ============================================================
    // DISCOGS LOCATIONS
    // ============================================================

    async function loadDiscogsLocations() {
        try {
            const data = await apiRequest('GET', '/api/locations');
            if (data.status === 'success') {
                renderDiscogsLocationSelect(data.locations);
            } else {
                throw new Error(data.error || 'Failed to load locations');
            }
        } catch (error) {
            console.error('Error loading locations:', error);
            renderDiscogsLocationSelect([]);
            showDiscogsStatus('Warning: Could not load locations - ' + error.message, 'warning');
        }
    }

    function renderDiscogsLocationSelect(locations) {
        if (!discogsLocationSelect) return;
        discogsLocationSelect.innerHTML = '<option value="all">-- All (no filter) --</option><option value="all_with_location">-- All with Location --</option>';
        if (!locations || locations.length === 0) return;
        locations.forEach(function(location) {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            discogsLocationSelect.appendChild(option);
        });
    }

    function refreshDiscogsRecords() {
        const selectedValue = discogsLocationSelect ? discogsLocationSelect.value : null;
        if (!selectedValue || selectedValue === 'all') {
            loadRecords({ showAllStatuses: true, mode: 'discogs' });
        } else if (selectedValue === 'all_with_location') {
            loadRecords({ showAllStatuses: true, requireLocation: true, mode: 'discogs' });
        } else {
            loadRecords({ showAllStatuses: true, location: selectedValue, mode: 'discogs' });
        }
    }

    // ============================================================
    // DEFAULT PARAMETERS
    // ============================================================

    function populateDefaultParamSelects() {
        if (defaultSleeveSelect) {
            const currentVal = defaultSleeveSelect.value;
            defaultSleeveSelect.innerHTML = '<option value="">Select...</option>';
            state.conditions.forEach(function(c) {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.display_name || c.condition_name;
                defaultSleeveSelect.appendChild(opt);
            });
            if (currentVal) defaultSleeveSelect.value = currentVal;
        }
        if (defaultDiscSelect) {
            const currentVal = defaultDiscSelect.value;
            defaultDiscSelect.innerHTML = '<option value="">Select...</option>';
            state.conditions.forEach(function(c) {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.display_name || c.condition_name;
                defaultDiscSelect.appendChild(opt);
            });
            if (currentVal) defaultDiscSelect.value = currentVal;
        }
        if (defaultConsignorSelect) {
            const currentVal = defaultConsignorSelect.value;
            defaultConsignorSelect.innerHTML = '<option value="">None</option>';
            state.consignors.forEach(function(c) {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.username + (c.full_name ? ' (' + c.full_name + ')' : '');
                defaultConsignorSelect.appendChild(opt);
            });
            if (currentVal) defaultConsignorSelect.value = currentVal;
        }
        if (defaultFormatSelect) {
            const currentVal = defaultFormatSelect.value;
            defaultFormatSelect.innerHTML = '<option value="">Select...</option>';
            state.formats.forEach(function(f) {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.name;
                defaultFormatSelect.appendChild(opt);
            });
            if (currentVal) defaultFormatSelect.value = currentVal;
        }
        loadDefaultParamsFromStorage();
    }

    function loadDefaultParamsFromStorage() {
        try {
            const stored = localStorage.getItem('defaultParams');
            if (stored) {
                const params = JSON.parse(stored);
                if (params.sleeveConditionId && defaultSleeveSelect) {
                    defaultSleeveSelect.value = params.sleeveConditionId;
                }
                if (params.discConditionId && defaultDiscSelect) {
                    defaultDiscSelect.value = params.discConditionId;
                }
                if (params.price && defaultPriceInput) {
                    defaultPriceInput.value = params.price;
                }
                if (params.consignorId && defaultConsignorSelect) {
                    defaultConsignorSelect.value = params.consignorId;
                }
                if (params.formatId && defaultFormatSelect) {
                    defaultFormatSelect.value = params.formatId;
                }
                if (params.purchaseId && defaultPurchaseSelect) {
                    defaultPurchaseSelect.value = params.purchaseId;
                }
                state.defaultParams = params;
                state.defaultParamsActive = true;
            }
        } catch (e) {
            console.warn('Could not load default params from storage:', e);
        }
    }

    function saveDefaultParamsToStorage() {
        try {
            localStorage.setItem('defaultParams', JSON.stringify(state.defaultParams));
        } catch (e) {
            console.warn('Could not save default params to storage:', e);
        }
    }

    function applyDefaultParams() {
        const sleeveId = defaultSleeveSelect ? parseInt(defaultSleeveSelect.value) : null;
        const discId = defaultDiscSelect ? parseInt(defaultDiscSelect.value) : null;
        const price = defaultPriceInput ? parseFloat(defaultPriceInput.value) : null;
        const consignorId = defaultConsignorSelect ? parseInt(defaultConsignorSelect.value) : null;
        const formatId = defaultFormatSelect ? parseInt(defaultFormatSelect.value) : null;
        const purchaseId = defaultPurchaseSelect ? parseInt(defaultPurchaseSelect.value) : null;

        state.defaultParams = {
            sleeveConditionId: sleeveId || null,
            discConditionId: discId || null,
            price: price || null,
            consignorId: consignorId || null,
            formatId: formatId || null,
            purchaseId: purchaseId || null
        };
        state.defaultParamsActive = true;
        saveDefaultParamsToStorage();

        if (purchaseId) {
            selectPurchase(purchaseId);
        }

        const rows = document.querySelectorAll('.btn-add-record-from-search');
        if (rows.length === 0) {
            updateDefaultParamsStatus('No search results to apply defaults to', 'warning');
            return;
        }

        rows.forEach(function(btn) {
            const row = btn.closest('tr');
            if (!row) return;
            const sleeveSelect = row.querySelector('.sleeve-condition-select');
            const discSelect = row.querySelector('.disc-condition-select');
            const priceInput = row.querySelector('.price-input');
            const consignorSelect = row.querySelector('.consignor-select');
            const formatSelect = row.querySelector('.format-select');

            if (sleeveSelect && state.defaultParams.sleeveConditionId) sleeveSelect.value = state.defaultParams.sleeveConditionId;
            if (discSelect && state.defaultParams.discConditionId) discSelect.value = state.defaultParams.discConditionId;
            if (priceInput && state.defaultParams.price) priceInput.value = state.defaultParams.price;
            if (consignorSelect && state.defaultParams.consignorId) consignorSelect.value = state.defaultParams.consignorId;
            if (formatSelect && state.defaultParams.formatId) formatSelect.value = state.defaultParams.formatId;
        });

        updateDefaultParamsStatus('Defaults applied to ' + rows.length + ' search results', 'success');
        render();
    }

    function clearDefaultParams() {
        state.defaultParams = {
            sleeveConditionId: null,
            discConditionId: null,
            price: null,
            consignorId: null,
            formatId: null,
            purchaseId: null
        };
        state.defaultParamsActive = false;
        if (defaultSleeveSelect) defaultSleeveSelect.value = '';
        if (defaultDiscSelect) defaultDiscSelect.value = '';
        if (defaultPriceInput) defaultPriceInput.value = '';
        if (defaultConsignorSelect) defaultConsignorSelect.value = '';
        if (defaultFormatSelect) defaultFormatSelect.value = '';
        if (defaultPurchaseSelect) defaultPurchaseSelect.value = '';
        localStorage.removeItem('defaultParams');
        updateDefaultParamsStatus('Defaults cleared', 'info');
        render();
    }

    function updateDefaultParamsStatus(message, type) {
        const el = document.getElementById('default-params-status');
        if (!el) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        el.className = 'status-message status-' + type;
        el.style.display = 'block';
        setTimeout(function() { if (el) el.style.display = 'none'; }, 5000);
    }

    function populateDefaultPurchaseDropdown() {
        if (!defaultPurchaseSelect) return;
        const currentVal = defaultPurchaseSelect.value;
        defaultPurchaseSelect.innerHTML = '<option value="">Select a purchase...</option>';

        const purchaseRows = document.querySelectorAll('#purchases-body tr');
        if (purchaseRows.length === 0) return;

        purchaseRows.forEach(function(row) {
            const id = row.dataset.id;
            if (!id) return;
            const sellerName = row.querySelector('td:nth-child(2)')?.textContent || 'Unknown';
            const statusEl = row.querySelector('.status-badge');
            const status = statusEl ? statusEl.textContent : 'draft';
            const option = document.createElement('option');
            option.value = id;
            option.textContent = '#' + id + ' - ' + sellerName + ' (' + status + ')';
            defaultPurchaseSelect.appendChild(option);
        });

        if (currentVal) defaultPurchaseSelect.value = currentVal;
    }

    // ============================================================
    // PURCHASE HELPER FUNCTIONS
    // ============================================================

    function clearPurchaseSelection() {
        state.selectedPurchaseId = null;
        if (metadataPanel) metadataPanel.style.display = 'none';
        if (currentPurchaseDisplay) currentPurchaseDisplay.style.display = 'none';
        if (defaultPurchaseSelect) defaultPurchaseSelect.value = '';
        loadPurchasesTable();
        state.filteredRecords = [];
        state.totalRecords = 0;
        state.currentPurchaseRecords = [];
        render();
        showStatus('Purchase deselected.', 'info');
    }

    async function createNewPurchase() {
        const sellerName = prompt('Enter seller name:');
        if (!sellerName) return;
        const contact = prompt('Enter contact (phone/email) [optional]:') || '';
        const description = prompt('Enter description [optional]:') || '';

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seller_name: sellerName, seller_contact: contact, description: description })
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to create purchase');

            showStatus('✅ New purchase created.', 'success');
            await loadPurchasesTable();
            if (data.id) {
                await selectPurchase(data.id);
            }
        } catch (error) {
            showStatus('Error creating purchase: ' + error.message, 'error');
        }
    }

    async function deletePurchase(id) {
        if (!confirm('Are you sure you want to delete purchase #' + id + ' and all its linked records? This cannot be undone.')) return;

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + id, {
                method: 'DELETE',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Delete failed');

            showStatus('✅ Purchase deleted.', 'success');
            if (state.selectedPurchaseId == id) {
                state.selectedPurchaseId = null;
                if (metadataPanel) metadataPanel.style.display = 'none';
                if (currentPurchaseDisplay) currentPurchaseDisplay.style.display = 'none';
                state.filteredRecords = [];
                state.totalRecords = 0;
                state.currentPurchaseRecords = [];
                render();
            }
            await loadPurchasesTable();
        } catch (error) {
            showStatus('Error deleting purchase: ' + error.message, 'error');
            console.error('Delete error:', error);
        }
    }

    async function savePurchaseMetadata() {
        const id = editPurchaseId ? editPurchaseId.value : null;
        if (!id) { showStatus('No purchase selected.', 'error'); return; }

        const sellerName = editSellerName ? editSellerName.value.trim() : '';
        const sellerContact = editSellerContact ? editSellerContact.value.trim() : '';
        const description = editDescription ? editDescription.value.trim() : '';
        const status = editStatus ? editStatus.value : 'draft';

        if (!sellerName) {
            showStatus('Seller name is required.', 'error');
            return;
        }

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + id, {
                method: 'PUT',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seller_name: sellerName, seller_contact: sellerContact, description, status })
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to update');

            showStatus('✅ Purchase metadata updated.', 'success');
            await loadPurchasesTable();
            await selectPurchase(parseInt(id));
        } catch (error) {
            showStatus('Error updating purchase: ' + error.message, 'error');
        }
    }

    async function uploadBillForPurchase() {
        if (!editBillUpload) return;
        const file = editBillUpload.files[0];
        if (!file) return;

        const id = editPurchaseId ? editPurchaseId.value : null;
        if (!id) { showStatus('No purchase selected.', 'error'); return; }

        const formData = new FormData();
        formData.append('bill_image', file);
        formData.append('purchase_id', id);

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + id + '/bill', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Upload failed');

            showStatus('✅ Bill uploaded successfully.', 'success');
            await selectPurchase(parseInt(id));
            if (editBillUpload) editBillUpload.value = '';
        } catch (error) {
            showStatus('Error uploading bill: ' + error.message, 'error');
        }
    }

    async function removeRecordFromPurchase(recordId) {
        if (!state.selectedPurchaseId) {
            showStatus('No purchase selected.', 'error');
            return;
        }
        if (!confirm('Remove this record from the purchase? The record will still exist but will no longer be linked to purchase #' + state.selectedPurchaseId + '.')) {
            return;
        }
        try {
            await apiRequest('PUT', '/records/' + recordId, { batch_id: null });
            showStatus('✅ Record removed from purchase.', 'success');
            await loadRecordsForPurchase(state.selectedPurchaseId);
            await loadPurchasesTable();
        } catch (error) {
            showStatus('Error removing record: ' + error.message, 'error');
        }
    }

    // ============================================================
    // DISCOGS ORDERS FILTERS
    // ============================================================

    async function applyDiscogsOrdersFilters() {
        const status = document.getElementById('discogs-orders-status-filter')?.value || '';
        const dateFrom = document.getElementById('discogs-orders-date-from')?.value || '';
        const dateTo = document.getElementById('discogs-orders-date-to')?.value || '';
        const search = document.getElementById('discogs-orders-search')?.value || '';

        await loadDiscogsOrdersList(status, dateFrom, dateTo, search);

        if (discogsOrderSelect) {
            discogsOrderSelect.value = '';
        }
        state.selectedOrderId = null;
        state.currentOrderItems = [];
        state.filteredRecords = [];
        state.totalRecords = 0;
        state.currentPage = 1;
        render();
    }

    function refreshDiscogsOrders() {
        const dateFrom = document.getElementById('discogs-orders-date-from');
        const dateTo = document.getElementById('discogs-orders-date-to');
        const search = document.getElementById('discogs-orders-search');

        if (!dateFrom.value) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            dateFrom.value = thirtyDaysAgo.toISOString().split('T')[0];
        }
        if (!dateTo.value) {
            dateTo.value = new Date().toISOString().split('T')[0];
        }
        if (search) search.value = '';

        applyDiscogsOrdersFilters();
    }

    async function loadOrderItems(orderId) {
        if (!orderId) {
            state.currentOrderItems = [];
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            return;
        }

        try {
            const url = window.AppConfig.baseUrl + '/api/discogs/orders/' + orderId;
            const response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });

            if (!response.ok) {
                let errorMsg = 'HTTP ' + response.status;
                try {
                    const errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                } catch (e) {}
                throw new Error(errorMsg);
            }

            const data = await response.json();
            if (data.status !== 'success' || !data.order) {
                throw new Error(data.error || 'Failed to load order details');
            }

            const order = data.order;
            const items = order.items || [];

            const enrichedItems = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                let pigstyleId = null;

                if (item.condition_comments) {
                    const match = item.condition_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                    if (match) pigstyleId = parseInt(match[1], 10);
                }
                if (!pigstyleId && item.private_comments) {
                    const match = item.private_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                    if (match) pigstyleId = parseInt(match[1], 10);
                }
                if (!pigstyleId && item.release_description) {
                    const match = item.release_description.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                    if (match) pigstyleId = parseInt(match[1], 10);
                }

                let record = null;
                let recordStatus = null;
                let barcode = null;
                let catalog = null;
                if (pigstyleId) {
                    try {
                        const recRes = await fetch(window.AppConfig.baseUrl + '/records/' + pigstyleId, {
                            credentials: 'include',
                            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
                        });
                        if (recRes.ok) {
                            const recData = await recRes.json();
                            record = recData;
                            recordStatus = recData.status_id;
                            barcode = recData.barcode || null;
                            catalog = recData.catalog_number || null;
                        } else {
                            recordStatus = null;
                        }
                    } catch (e) {
                        console.warn('Could not fetch record ' + pigstyleId + ':', e);
                        recordStatus = null;
                    }
                }

                enrichedItems.push({
                    ...item,
                    pigstyle_id: pigstyleId,
                    record: record,
                    record_status_id: recordStatus,
                    barcode: barcode || item.barcode || null,
                    catalog_number: catalog || item.catalog_number || null,
                    artist: item.artist || 'Unknown',
                    title: item.title || 'Unknown',
                    price: item.price || 0,
                    media_condition: item.media_condition || '—',
                    quantity: item.quantity || 1,
                    condition_comments: item.condition_comments || '',
                    private_comments: item.private_comments || ''
                });
            }

            state.currentOrderItems = enrichedItems;
            state.filteredRecords = enrichedItems;
            state.totalRecords = state.filteredRecords.length;
            state.currentPage = 1;
            render();
            updateDiscogsOrdersStatus('✅ Order ' + orderId + ': ' + enrichedItems.length + ' items loaded', 'success');

        } catch (error) {
            console.error('❌ Error loading order items:', error);
            state.currentOrderItems = [];
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            updateDiscogsOrdersStatus('❌ Error: ' + error.message, 'error');
        }
    }

    // ============================================================
    // POST TO DISCOGS
    // ============================================================

    async function postSingleRecordToDiscogs(recordId, display, price, discogsPrice, markupPercent, mediaCondition, sleeveCondition, catalogNumber, location, notes) {
        if (!recordId || !mediaCondition || !sleeveCondition || !price || !discogsPrice) {
            showDiscogsStatus('Missing required information', 'error');
            return;
        }
        if (!confirm('📋 Post "' + display + '" to Discogs?\n\nStore Price: $' + price + '\nDiscogs Price: $' + discogsPrice + ' (' + (markupPercent > 0 ? '+' : '') + markupPercent + '%)\nMedia: ' + mediaCondition + '\nSleeve: ' + sleeveCondition)) {
            return;
        }

        const listingData = {
            record: {
                id: recordId,
                artist: display.split(' - ')[0] || 'Unknown',
                title: display.split(' - ').slice(1).join(' - ') || 'Unknown',
                catalog_number: catalogNumber || '',
                media_condition: mediaCondition,
                sleeve_condition: sleeveCondition,
                price: discogsPrice,
                notes: notes || '',
                location: location || ''
            }
        };

        try {
            const result = await apiRequest('POST', '/api/discogs/create-listing-single', listingData);
            if (result.success) {
                let discogsUrl = result.listing_url;
                if (!discogsUrl && result.listing_id) {
                    discogsUrl = 'https://www.discogs.com/sell/item/' + result.listing_id;
                }
                showDiscogsStatus('✅ Successfully posted "' + display + '" to Discogs! ' + (discogsUrl ? '<a href="' + discogsUrl + '" target="_blank">View</a>' : ''), 'success');
                refreshDiscogsRecords();
            } else {
                showDiscogsStatus('Error: ' + result.error, 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    }

    function showDiscogsPostModal() {
        const records = getSelectedRecords();
        if (records.length === 0) {
            showDiscogsStatus('No records selected. Please select a range using "from" and "to" buttons.', 'warning');
            return;
        }

        const existingModal = document.getElementById('discogs-post-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'discogs-post-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = '<div class="modal-content" style="max-width: 600px; width: 95%;"><div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;"><h3 class="modal-title"><i class="fab fa-discogs"></i> Post Records to Discogs</h3><button class="modal-close" onclick="closeDiscogsPostModal()" style="color: white;">&times;</button></div><div class="modal-body"><div style="margin-bottom: 15px;"><p><strong>' + records.length + '</strong> record(s) selected for posting.</p></div><div style="margin-bottom: 20px;"><label for="discogs-post-location" style="display:block; font-weight:600; margin-bottom:4px;"><i class="fas fa-map-marker-alt"></i> Location <span style="color:#dc3545;">*</span></label><input type="text" id="discogs-post-location" class="form-control" placeholder="e.g., Bin 24 | Left Top" style="width:100%; padding:10px; font-size:16px; border:1px solid #ddd; border-radius:4px;"><p style="font-size:12px; color:#666; margin-top:5px;"><i class="fas fa-info-circle"></i> This location will be saved to all selected records before posting.</p></div><div style="margin-bottom: 20px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><span style="font-weight:600;">Progress</span><span id="discogs-post-progress-text">0%</span></div><div style="width:100%; height:24px; background:#e9ecef; border-radius:12px; overflow:hidden;"><div id="discogs-post-progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #28a745, #20c997); transition:width 0.3s ease; border-radius:12px;"></div></div></div><div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:600;"><i class="fas fa-list"></i> Status Log</span><span id="discogs-post-log-count" style="font-size:12px; color:#666;">0 / ' + records.length + '</span></div><div id="discogs-post-log" style="max-height:200px; overflow-y:auto; background:#f8f9fa; border:1px solid #ddd; border-radius:4px; padding:10px; font-family:monospace; font-size:13px; margin-top:5px;"><div style="color:#999; text-align:center; padding:20px;">Ready to start posting...</div></div></div><div id="discogs-post-status" style="margin-top:10px; display:none;"></div></div><div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;"><button class="btn btn-secondary" id="discogs-post-cancel-btn" onclick="closeDiscogsPostModal()"><i class="fas fa-times"></i> Cancel</button><button class="btn btn-success" id="discogs-post-start-btn"><i class="fab fa-discogs"></i> Start Posting</button></div></div>';
        document.body.appendChild(modal);

        setTimeout(function() {
            const locationInput = document.getElementById('discogs-post-location');
            if (locationInput) locationInput.focus();
        }, 200);

        document.getElementById('discogs-post-start-btn').addEventListener('click', function() {
            startDiscogsPosting(records);
        });

        document.getElementById('discogs-post-location').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('discogs-post-start-btn').click();
            }
        });
    }

    function closeDiscogsPostModal() {
        const modal = document.getElementById('discogs-post-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.remove();
        }
        state.isPosting = false;
        state.postProgress = 0;
        state.postResults = [];
    }

    async function startDiscogsPosting(records) {
        if (state.isPosting) return;
        if (records.length === 0) {
            showDiscogsPostStatus('No records selected.', 'error');
            return;
        }

        const locationInput = document.getElementById('discogs-post-location');
        const location = locationInput ? locationInput.value.trim() : '';

        if (!location) {
            showDiscogsPostStatus('Please enter a location before posting.', 'error');
            locationInput.focus();
            return;
        }

        const startBtn = document.getElementById('discogs-post-start-btn');
        const cancelBtn = document.getElementById('discogs-post-cancel-btn');
        if (startBtn) { startBtn.disabled = true;
            startBtn.textContent = 'Posting...'; }
        if (cancelBtn) { cancelBtn.disabled = true; }

        state.isPosting = true;
        state.postResults = [];
        let successCount = 0;
        let failCount = 0;

        updateDiscogsPostLog('info', '📍 Location set to: ' + location);
        updateDiscogsPostLog('info', '🚀 Starting to post ' + records.length + ' records...');

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const current = i + 1;

            updateDiscogsPostProgress(current, records.length);

            try {
                const display = getShortRecordDisplay(record, 30);
                updateDiscogsPostLog('info', '📝 Updating location for #' + record.id + ': ' + display);
                await apiRequest('PUT', '/records/' + record.id, { location: location });

                updateDiscogsPostLog('info', '💰 Calculating price for #' + record.id + '...');
                const priceRequests = [{
                    id: record.id,
                    created_at: record.created_at,
                    store_price: record.store_price
                }];
                const batchResults = await calculateMarkupBatch(priceRequests);

                let discogsPrice = null;
                let markupPercent = null;
                if (batchResults.length > 0 && batchResults[0].id) {
                    discogsPrice = batchResults[0].discogs_price;
                    markupPercent = batchResults[0].markup_percent;
                }

                if (!discogsPrice) {
                    throw new Error('Could not calculate Discogs price');
                }

                updateDiscogsPostLog('info', '📤 Posting #' + record.id + ': ' + display + ' at $' + discogsPrice + '...');

                const listingData = {
                    record: {
                        id: record.id,
                        artist: record.artist || 'Unknown',
                        title: record.title || 'Unknown',
                        catalog_number: record.catalog_number || '',
                        media_condition: record.disc_condition_name || record.sleeve_condition_name || 'Very Good Plus (VG+)',
                        sleeve_condition: record.sleeve_condition_name || record.disc_condition_name || 'Very Good Plus (VG+)',
                        price: discogsPrice,
                        notes: record.notes || '',
                        location: location
                    }
                };

                const result = await apiRequest('POST', '/api/discogs/create-listing-single', listingData);

                if (result.success) {
                    successCount++;
                    updateDiscogsPostLog('success', '✅ #' + record.id + ': ' + display + ' posted successfully!');
                } else {
                    throw new Error(result.error || 'Discogs API returned error');
                }

            } catch (error) {
                failCount++;
                const display = getShortRecordDisplay(record, 30);
                updateDiscogsPostLog('error', '❌ #' + record.id + ': ' + display + ' failed - ' + error.message);
                console.error('Error posting record #' + record.id, error);
            }

            if (i < records.length - 1) {
                await new Promise(function(resolve) { setTimeout(resolve, 2000); });
            }
        }

        state.isPosting = false;
        updateDiscogsPostProgress(records.length, records.length);

        const summary = '✅ ' + successCount + ' posted successfully, ❌ ' + failCount + ' failed.';
        updateDiscogsPostLog('info', '📊 ' + summary);

        if (failCount === 0) {
            showDiscogsPostStatus('🎉 All ' + records.length + ' records posted successfully!', 'success');
            playSound('success');
        } else if (successCount > 0) {
            showDiscogsPostStatus('⚠️ ' + successCount + ' posted, ' + failCount + ' failed. Check log for details.', 'warning');
            playSound('error');
        } else {
            showDiscogsPostStatus('❌ All ' + records.length + ' records failed to post.', 'error');
            playSound('error');
        }

        if (startBtn) { startBtn.disabled = false;
            startBtn.textContent = 'Start Posting'; }
        if (cancelBtn) { cancelBtn.disabled = false; }

        refreshDiscogsRecords();
    }

    function updateDiscogsPostProgress(current, total) {
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        state.postProgress = percent;
        const bar = document.getElementById('discogs-post-progress-bar');
        const text = document.getElementById('discogs-post-progress-text');
        if (bar) bar.style.width = percent + '%';
        if (text) text.textContent = percent + '%';
    }

    function updateDiscogsPostLog(type, message) {
        const logContainer = document.getElementById('discogs-post-log');
        const logCount = document.getElementById('discogs-post-log-count');
        if (!logContainer) return;

        const placeholder = logContainer.querySelector('div[style*="color:#999"]');
        if (placeholder) placeholder.remove();

        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.style.padding = '4px 0';
        entry.style.borderBottom = '1px solid #f0f0f0';
        entry.style.fontSize = '12px';

        let color = '#333';
        let icon = 'ℹ️';
        if (type === 'success') { color = '#28a745';
            icon = '✅'; } else if (type === 'error') { color = '#dc3545';
            icon = '❌'; } else if (type === 'warning') { color = '#ffc107';
            icon = '⚠️'; } else { color = '#007bff';
            icon = 'ℹ️'; }

        entry.innerHTML = '<span style="color:#999;">[' + timestamp + ']</span> <span style="color:' + color + ';">' + icon + ' ' + escapeHtml(message) + '</span>';
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function showDiscogsPostStatus(message, type) {
        const el = document.getElementById('discogs-post-status');
        if (el) {
            el.textContent = message;
            el.className = 'status-message status-' + type;
            el.style.display = 'block';
        }
    }

    // ============================================================
    // PRINT PRICE TAGS
    // ============================================================

    async function printPriceTags() {
        let records = [];

        if (state.selection.isActive) {
            records = getSelectedRecords();
        }

        if (records.length === 0) {
            records = state.filteredRecords;
        }

        if (records.length === 0) {
            showStatus('No records to print.', 'warning');
            return;
        }

        if (window.LabelPrinter) {
            await window.LabelPrinter.generatePriceTags(records);
        } else {
            showStatus('LabelPrinter not loaded. Please refresh the page.', 'error');
            console.error('LabelPrinter not available');
        }
    }

    // ============================================================
    // SEARCH
    // ============================================================

    async function performDiscogsSearch(term) {
        state.currentMode = 'search';
        recordsTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Searching Discogs...</td></tr>';
        try {
            const formatFilterEl = document.getElementById('discogs-format-filter');
            const format = formatFilterEl ? formatFilterEl.value : 'all';

            const data = await apiRequest('GET', '/api/discogs/search?q=' + encodeURIComponent(term) + (format && format !== 'all' ? '&format=' + encodeURIComponent(format) : ''));
            if (!data.results || !data.results.length) {
                recordsTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;">No Discogs results found</td></tr>';
                return;
            }
            state.currentResults = data.results.map(function(r) {
                let artist = r.artist || 'Unknown';
                let title = r.title || 'Unknown';
                if (artist === 'Unknown' && title.includes(' - ')) {
                    const parts = title.split(' - ');
                    artist = parts[0].trim();
                    title = parts.slice(1).join(' - ').trim();
                }
                if (Array.isArray(artist)) artist = artist[0] || 'Unknown';
                return { ...r, artist: artist, title: title };
            });
            state.filteredRecords = state.currentResults.slice();
            state.totalRecords = state.filteredRecords.length;
            state.currentPage = 1;
            render();
            showStatus('Found ' + state.totalRecords + ' Discogs results', 'success');
        } catch (error) {
            console.error('Discogs search error:', error);
            recordsTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;">Error searching Discogs: ' + error.message + '</td></tr>';
        }
    }

    function performSearch(term) {
        if (!term) { clearSearch(); return; }
        const mode = state.currentSearchMode;

        if (mode === 'add') {
            if (!state.selectedPurchaseId) {
                showStatus('⚠️ Please select a purchase from the table before searching.', 'error');
                playSound('error');
                return;
            }
            performDiscogsSearch(term);
            return;
        } else if (mode === 'scan') {
            performScanSearch(term);
            return;
        } else if (mode === 'discogs') {
            performDiscogsFilterSearch(term);
            return;
        } else if (mode === 'discogs_orders') {
            performDiscogsOrdersSearch(term);
            return;
        }

        showStatus('No search available for this mode', 'info');
    }

    function performDiscogsFilterSearch(term) {
        const termLower = term.toLowerCase();
        const source = state.currentLocationRecords.length > 0 ? state.currentLocationRecords : state.allRecords;
        const filtered = source.filter(function(r) {
            return (r.artist && r.artist.toLowerCase().indexOf(termLower) !== -1) ||
                (r.title && r.title.toLowerCase().indexOf(termLower) !== -1) ||
                (r.barcode && r.barcode.toLowerCase().indexOf(termLower) !== -1) ||
                (r.catalog_number && r.catalog_number.toLowerCase().indexOf(termLower) !== -1);
        });
        state.filteredRecords = filtered;
        state.totalRecords = state.filteredRecords.length;
        state.currentPage = 1;
        render();
        showStatus('Found ' + state.totalRecords + ' records matching "' + term + '"', 'info');
    }

    function performDiscogsOrdersSearch(term) {
        if (!term) {
            applyDiscogsOrdersFilters();
            return;
        }
        const termLower = term.toLowerCase().trim();
        const filtered = state.ordersList.filter(function(order) {
            const buyer = (order.buyer_username || order.buyer_name || '').toLowerCase();
            const email = (order.buyer_email || '').toLowerCase();
            return buyer.includes(termLower) || email.includes(termLower);
        });
        if (discogsOrderSelect) {
            discogsOrderSelect.innerHTML = '<option value="">-- Select an order --</option>';
            for (let i = 0; i < filtered.length; i++) {
                const order = filtered[i];
                const option = document.createElement('option');
                option.value = order.order_id || order.id;
                const buyer = order.buyer_username || order.buyer_name || 'Unknown buyer';
                const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '';
                const total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '';
                const itemCount = order.items ? order.items.length : 0;
                option.textContent = order.order_id + ' - ' + buyer + ' ' + date + ' ' + total + ' (' + itemCount + ' items)';
                discogsOrderSelect.appendChild(option);
            }
            discogsOrderSelect.value = '';
            state.selectedOrderId = null;
            state.currentOrderItems = [];
            state.filteredRecords = [];
            state.totalRecords = 0;
            render();
            updateDiscogsOrdersStatus('🔍 Found ' + filtered.length + ' orders matching "' + term + '"', 'info');
        }
    }

    function clearSearch() {
        searchInput.value = '';
        if (state.currentSearchMode === 'add') {
            state.currentMode = 'inventory';
            state.currentResults = [];
            if (state.selectedPurchaseId) {
                loadRecordsForPurchase(state.selectedPurchaseId);
            } else {
                state.filteredRecords = [];
                state.totalRecords = 0;
                state.currentPage = 1;
                render();
            }
        } else if (state.currentSearchMode === 'discogs') {
            refreshDiscogsRecords();
        } else if (state.currentSearchMode === 'discogs_orders') {
            if (discogsOrderSelect) discogsOrderSelect.value = '';
            state.selectedOrderId = null;
            state.currentOrderItems = [];
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            applyDiscogsOrdersFilters();
        }
        showStatus('Search cleared', 'info');
        if (searchInput) searchInput.focus();
    }

    function applyLastSeenFilter() {
        if (lastSeenCutoffDateInput) {
            state.lastSeenCutoffDate = lastSeenCutoffDateInput.value;
        } else {
            state.lastSeenCutoffDate = null;
        }
        refreshDiscogsRecords();
        showDiscogsStatus('Last seen filter set to: ' + (state.lastSeenCutoffDate || 'disabled'), 'info');
        loadMarkupAnalysisCharts();
    }

    // ============================================================
    // DOMAIN MANAGEMENT
    // ============================================================

    async function loadDomainGenres() {
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/genres', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status === 'success') {
                state.genres = data.genres || [];
                renderDomainGenres(state.genres);
            }
        } catch (error) {
            console.error('Error loading genres:', error);
        }
    }

    function renderDomainGenres(genresList) {
        const container = document.getElementById('genres-list');
        if (!container) return;
        if (!genresList || genresList.length === 0) {
            container.innerHTML = '<div class="empty-message">No genres found.</div>';
            return;
        }
        let html = '<table class="domain-table"><thead><tr><th>ID</th><th>Name</th><th>Actions</th></tr></thead><tbody>';
        genresList.forEach(function(g) {
            html += '<tr>';
            html += '<td>' + g.id + '</td>';
            html += '<td>' + escapeHtml(g.name) + '</td>';
            html += '<td><button class="btn btn-sm btn-danger" onclick="deleteDomainGenre(' + g.id + ', \'' + escapeHtml(g.name) + '\')"><i class="fas fa-trash"></i></button></td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    async function loadDomainFormats() {
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/formats', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status === 'success') {
                renderDomainFormats(data.formats || []);
            }
        } catch (error) {
            console.error('Error loading formats:', error);
        }
    }

    function renderDomainFormats(formatsList) {
        const container = document.getElementById('formats-list');
        if (!container) return;
        if (!formatsList || formatsList.length === 0) {
            container.innerHTML = '<div class="empty-message">No formats found.</div>';
            return;
        }
        let html = '<table class="domain-table"><thead><tr><th>ID</th><th>Name</th><th>Actions</th></tr></thead><tbody>';
        formatsList.forEach(function(f) {
            html += '<tr>';
            html += '<td>' + f.id + '</td>';
            html += '<td>' + escapeHtml(f.name) + '</td>';
            html += '<td><button class="btn btn-sm btn-danger" onclick="deleteDomainFormat(' + f.id + ', \'' + escapeHtml(f.name) + '\')"><i class="fas fa-trash"></i></button></td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    async function deleteDomainGenre(id, name) {
        showStatus('Genre management is no longer available.', 'info');
    }

    async function deleteDomainFormat(id, name) {
        showStatus('Format management is no longer available.', 'info');
    }

    // ============================================================
    // BILL MODAL
    // ============================================================

    function openBillModal() {
        const container = document.getElementById('bill-preview-container');
        if (!container) return;

        const billPath = container.dataset.billPath || '';
        const billType = container.dataset.billType || '';

        const modal = document.getElementById('bill-modal');
        const modalImg = document.getElementById('bill-modal-image');
        const modalPlaceholder = document.getElementById('bill-modal-placeholder');
        const modalPdf = document.getElementById('bill-modal-pdf');
        const modalPdfIframe = document.getElementById('bill-modal-pdf-iframe');
        const modalFilename = document.getElementById('bill-modal-filename');
        const downloadLink = document.getElementById('bill-modal-download');

        if (!modal) return;

        modalImg.style.display = 'none';
        modalPdf.style.display = 'none';
        modalPlaceholder.style.display = 'none';
        downloadLink.style.display = 'none';
        modalImg.src = '';
        modalPdfIframe.src = '';

        if (!billPath) {
            modalPlaceholder.style.display = 'block';
            modalPlaceholder.innerHTML = '<i class="fas fa-receipt" style="font-size: 48px; display: block; margin-bottom: 15px;"></i>No bill of sale uploaded for this draft.';
            modal.style.display = 'flex';
            return;
        }

        const filename = billPath.split('/').pop();
        modalFilename.textContent = 'File: ' + filename;

        downloadLink.href = billPath;
        downloadLink.download = filename;
        downloadLink.style.display = 'inline-block';

        if (billType === 'pdf' || billPath.toLowerCase().endsWith('.pdf')) {
            modalPdf.style.display = 'block';
            modalPdfIframe.src = billPath;
            modalPlaceholder.style.display = 'none';
            modalImg.style.display = 'none';
        } else {
            modalImg.src = billPath;
            modalImg.style.display = 'block';
            modalImg.onerror = function() {
                this.style.display = 'none';
                modalPlaceholder.style.display = 'block';
                modalPlaceholder.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size: 48px; display: block; margin-bottom: 15px; color: #dc3545;"></i>Could not load image. The file may be missing or corrupted.';
            };
            modalPdf.style.display = 'none';
            modalPlaceholder.style.display = 'none';
        }

        modal.style.display = 'flex';
    }

    function closeBillModal() {
        const modal = document.getElementById('bill-modal');
        if (modal) {
            modal.style.display = 'none';
            const iframe = document.getElementById('bill-modal-pdf-iframe');
            if (iframe) iframe.src = '';
        }
    }

    // ============================================================
    // SETUP DOMAIN MANAGEMENT HANDLERS
    // ============================================================

    function setupDomainManagementHandlers() {
        const domainAddFormatBtn = document.getElementById('add-format-btn');
        if (domainAddFormatBtn) {
            domainAddFormatBtn.addEventListener('click', async function() {
                const inputField = document.getElementById('new-format');
                if (!inputField) return;
                const formatName = inputField.value.trim();
                if (!formatName) {
                    showStatus('Please enter a format name.', 'warning');
                    inputField.focus();
                    return;
                }
                try {
                    const response = await fetch(window.AppConfig.baseUrl + '/api/formats', {
                        method: 'POST',
                        credentials: 'include',
                        headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: formatName })
                    });
                    const data = await response.json();
                    if (data.status !== 'success') {
                        throw new Error(data.error || 'Server rejected format');
                    }
                    inputField.value = '';
                    showStatus('✅ Format "' + formatName + '" added!', 'success');
                    playSound('success');
                    loadDomainFormats();
                } catch (error) {
                    console.error('Error adding format:', error);
                    showStatus('❌ Failed to add format: ' + error.message, 'error');
                    playSound('error');
                }
            });
        }

        if (scanLocationSelect) {
            scanLocationSelect.addEventListener('change', function() {
                updateScanLocationPreview();
            });
        }

        if (scanSubmitBtn) {
            scanSubmitBtn.addEventListener('click', function() {
                const term = scanInput ? scanInput.value.trim() : '';
                if (term) performScanSearch(term);
            });
        }

        if (scanInput) {
            scanInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const term = this.value.trim();
                    if (term) performScanSearch(term);
                }
            });
        }

        if (defaultFormatSelect) {
            defaultFormatSelect.addEventListener('change', function() {
                state.defaultParams.formatId = parseInt(this.value) || null;
                saveDefaultParamsToStorage();
                render();
            });
        }

        if (defaultPurchaseSelect) {
            defaultPurchaseSelect.addEventListener('change', function() {
                const purchaseId = parseInt(this.value);
                if (purchaseId) {
                    state.defaultParams.purchaseId = purchaseId;
                    saveDefaultParamsToStorage();
                    selectPurchase(purchaseId);
                } else {
                    state.defaultParams.purchaseId = null;
                    saveDefaultParamsToStorage();
                    clearPurchaseSelection();
                }
            });
        }
    }

    // ============================================================
    // ACCEPT DRAFT
    // ============================================================

    async function acceptDraft() {
        if (!state.selectedPurchaseId) {
            showToast('No purchase selected.', 'error');
            return;
        }

        const offerAmountInput = document.getElementById('draft-offer-amount');
        if (!offerAmountInput) {
            const amount = prompt('Enter offer amount ($):');
            if (amount === null) return;
            const offerAmount = parseFloat(amount);
            if (isNaN(offerAmount) || offerAmount <= 0) {
                showToast('Please enter a valid offer amount.', 'error');
                return;
            }
            await processAcceptDraft(state.selectedPurchaseId, offerAmount);
            return;
        }

        const offerAmount = parseFloat(offerAmountInput.value);
        if (isNaN(offerAmount) || offerAmount <= 0) {
            showToast('Please enter a valid offer amount in the metadata panel.', 'error');
            return;
        }

        await processAcceptDraft(state.selectedPurchaseId, offerAmount);
    }

    async function processAcceptDraft(purchaseId, offerAmount) {
        if (!purchaseId) {
            showToast('No purchase selected.', 'error');
            return;
        }

        let purchase;
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + purchaseId, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success' || !data.purchase) throw new Error(data.error || 'Purchase not found');
            purchase = data.purchase;
        } catch (error) {
            showToast('Error fetching purchase: ' + error.message, 'error');
            return;
        }

        if (purchase.status === 'complete') {
            showToast('This purchase is already complete.', 'warning');
            return;
        }

        const recordIds = state.currentPurchaseRecords.map(function(r) { return r.id; });
        if (recordIds.length === 0) {
            showToast('No records linked to this purchase.', 'error');
            return;
        }

        const signatureMethod = confirm('Square POS signature? Click OK for Square POS, Cancel for Print & Upload.');

        const requestBody = {
            offer_amount: offerAmount,
            signature_method: signatureMethod ? 'square' : 'upload',
            record_ids: recordIds
        };

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + purchaseId, {
                method: 'PUT',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const data = await response.json();

            if (data.status === 'success') {
                if (state.currentPurchaseRecords.length > 0) {
                    if (window.LabelPrinter) {
                        await window.LabelPrinter.generatePriceTags(state.currentPurchaseRecords, {
                            title: 'Price Tags - Purchase #' + purchaseId
                        });
                    } else {
                        console.warn('LabelPrinter not loaded, cannot generate PDF');
                    }
                    showToast('📄 Price tags generated for ' + state.currentPurchaseRecords.length + ' records.', 'success');
                }

                showToast('✅ Draft accepted! Offer: $' + offerAmount.toFixed(2), 'success');
                playSound('success');

                if (signatureMethod) {
                    await sendBillToSquarePOS(purchase, offerAmount, state.currentPurchaseRecords);
                } else {
                    const billText = generateBillOfSale(purchase, offerAmount, state.currentPurchaseRecords);
                    downloadReceipt(billText, 'bill_of_sale_' + purchaseId + '.txt');
                    showToast('📄 Bill of Sale downloaded. Have customer sign, take photo, and upload.', 'info');
                }

                await loadPurchasesTable();
                await selectPurchase(purchaseId);
            } else {
                showToast('❌ Error: ' + (data.error || 'Unknown error'), 'error');
                playSound('error');
            }
        } catch (error) {
            console.error('❌ acceptDraft error:', error);
            showToast('❌ Error: ' + error.message, 'error');
            playSound('error');
        }
    }

    async function sendBillToSquarePOS(purchase, offerAmount, records) {
        try {
            const recordDetails = records.map(function(r) {
                return {
                    id: r.id,
                    artist: r.artist || 'Unknown',
                    title: r.title || 'Unknown',
                    price: r.store_price || 0
                };
            });

            const response = await fetch(window.AppConfig.baseUrl + '/api/square/bill-of-sale', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    draft_id: purchase.id,
                    seller_name: purchase.seller_name || '',
                    offer_amount: offerAmount,
                    records: recordDetails,
                    signature_method: 'square'
                })
            });
            const data = await response.json();

            if (data.status === 'success') {
                showToast('✅ Bill of Sale sent to Square POS. Customer can sign on terminal.', 'success');
                playSound('success');
            } else {
                showToast('⚠️ Could not send to Square POS: ' + (data.error || 'Unknown error'), 'warning');
            }
        } catch (error) {
            console.error('Error sending to Square POS:', error);
            showToast('⚠️ Could not send to Square POS: ' + error.message, 'warning');
        }
    }

    function generateBillOfSale(purchase, offerAmount, records) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        let bill = 'PIGSTYLE MUSIC\n';
        bill += '====================\n';
        bill += 'BILL OF SALE\n';
        bill += dateStr + ' ' + timeStr + '\n\n';
        bill += 'Purchase #: ' + purchase.id + '\n';
        bill += 'Seller: ' + (purchase.seller_name || '—') + '\n';
        if (purchase.seller_contact) {
            bill += 'Contact: ' + purchase.seller_contact + '\n';
        }
        bill += 'Description: ' + (purchase.description || '—') + '\n';
        bill += '\n';
        bill += 'ITEMS:\n';
        bill += '--------------------\n';

        let totalValue = 0;
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const price = record.store_price || 0;
            const display = getRecordDisplay(record);
            const padding = Math.max(1, 30 - display.length);
            bill += display;
            bill += ' '.repeat(padding);
            bill += '$' + price.toFixed(2) + '\n';
            totalValue += price;
        }

        bill += '--------------------\n';
        bill += 'Total Value'.padEnd(25) + ' $' + totalValue.toFixed(2) + '\n';
        bill += 'Offer Amount'.padEnd(25) + ' $' + offerAmount.toFixed(2) + '\n';
        bill += '\n';
        bill += 'Seller Signature: ____________________\n';
        bill += 'Store Rep: ____________________\n';
        bill += '\n';
        bill += '---\n';
        bill += 'PigStyle Music\n';
        bill += 'Thank you for your business!\n';

        return bill;
    }

    // ============================================================
    // INITIALIZATION - Single entry point
    // ============================================================

    let initialized = false;

    async function init() {
        if (initialized) {
            console.log('🔄 inventory-ops: Already initialized, skipping.');
            return;
        }
        initialized = true;

        console.log('🔄 inventory-ops: Initializing...');

        // Load all data
        await loadMinimumPrice();
        await loadStorePriceMultiplier();
        await loadConditions();
        await loadConsignors();
        await loadGenres();
        await loadFormats();
        await loadLocations();
        await loadStats();

        populateDefaultParamSelects();

        updateScanLocationPreview();
        loadRecentScansFromStorage();
        updateRecentScansUI();

        setupDomainManagementHandlers();

        loadDomainGenres();
        loadDomainFormats();

        // ===== Event Listeners =// ============================================================================
// inventory-ops.js - Unified Inventory Operations (REFACTORED)
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
    const printBtn = document.getElementById('print-btn');
    const cancelRangeBtn = document.getElementById('cancel-range-btn');

    // ========== Mode containers ==========
    const addModeContainer = document.getElementById('mode-container-add');
    const scanModeContainer = document.getElementById('mode-container-scan');
    const discogsModeContainer = document.getElementById('mode-container-discogs');
    const discogsOrdersModeContainer = document.getElementById('mode-container-discogs_orders');

    // ========== Scan Location Elements ==========
    const scanLocationSelect = document.getElementById('scan-location-select');
    const scanInput = document.getElementById('scan-input');
    const scanSubmitBtn = document.getElementById('scan-submit-btn');
    const scanLocationDisplay = document.getElementById('scan-location-display');
    const scanIndexDisplay = document.getElementById('scan-index-display');
    const recentScansList = document.getElementById('recent-scans-list');
    const lastScanDisplay = document.getElementById('last-scan-display');

    // ========== Discogs Elements ==========
    const discogsLocationSelect = document.getElementById('discogs-location-select');
    const discogsStatusMessage = document.getElementById('discogs-status-message');
    const lastSeenCutoffDateInput = document.getElementById('last-seen-cutoff-date');
    const applyLastSeenFilterBtn = document.getElementById('apply-last-seen-filter');

    // ========== Discogs Orders Elements ==========
    const discogsOrderSelect = document.getElementById('discogs-order-select');
    const discogsOrdersRefreshBtn = document.getElementById('discogs-orders-refresh-btn');
    const discogsOrdersStatus = document.getElementById('discogs-orders-status');
    const discogsOrdersStatusFilter = document.getElementById('discogs-orders-status-filter');
    const discogsOrdersApplyFiltersBtn = document.getElementById('discogs-orders-apply-filters-btn');
    const discogsOrdersDateFrom = document.getElementById('discogs-orders-date-from');
    const discogsOrdersDateTo = document.getElementById('discogs-orders-date-to');
    const discogsOrdersSearch = document.getElementById('discogs-orders-search');

    // ========== Default Params Elements ==========
    const defaultSleeveSelect = document.getElementById('default-sleeve-condition');
    const defaultDiscSelect = document.getElementById('default-disc-condition');
    const defaultPriceInput = document.getElementById('default-price');
    const defaultConsignorSelect = document.getElementById('default-consignor');
    const defaultFormatSelect = document.getElementById('default-format');
    const defaultPurchaseSelect = document.getElementById('default-purchase');

    // ========== Purchase Table Elements ==========
    const purchasesBody = document.getElementById('purchases-body');
    const metadataPanel = document.getElementById('purchase-metadata-panel');
    const editPurchaseId = document.getElementById('edit-purchase-id');
    const editSellerName = document.getElementById('edit-seller-name');
    const editSellerContact = document.getElementById('edit-seller-contact');
    const editDescription = document.getElementById('edit-description');
    const editStatus = document.getElementById('edit-status');
    const editBillUpload = document.getElementById('edit-bill-upload');
    const editBillPreview = document.getElementById('edit-bill-preview');
    const purchaseIdDisplay = document.getElementById('purchase-id-display');
    const deletePurchaseBtn = document.getElementById('delete-purchase-btn');
    const acceptDraftBtn = document.getElementById('accept-draft-btn');

    // ========== Current Purchase Display ==========
    const currentPurchaseDisplay = document.getElementById('current-purchase-display');
    const currentPurchaseName = document.getElementById('current-purchase-name');
    const currentPurchaseIdSpan = document.getElementById('current-purchase-id');

    // ============================================================
    // STATE MANAGEMENT - Single source of truth
    // ============================================================
    const state = {
        // Core data
        allRecords: [],
        filteredRecords: [],
        currentResults: [],
        totalRecords: 0,

        // Selection (separate from filtered view)
        selection: {
            fromIndex: null,
            toIndex: null,
            isActive: false
        },

        // UI state
        currentPage: 1,
        pageSize: 50,
        currentSearchMode: 'add',
        currentMode: 'inventory',

        // Purchase context
        selectedPurchaseId: null,
        currentPurchaseRecords: [],

        // Discogs
        currentLocationRecords: [],
        ordersList: [],
        currentOrderItems: [],
        selectedOrderId: null,
        lastSeenCutoffDate: null,

        // Scan
        recentScans: [],
        scanIndex: 0,
        scanCounter: 0,

        // Default params
        defaultParams: {
            sleeveConditionId: null,
            discConditionId: null,
            price: null,
            consignorId: null,
            formatId: null,
            purchaseId: null
        },
        defaultParamsActive: false,

        // Domain data
        conditions: [],
        consignors: [],
        consignorMap: {},
        genres: [],
        formats: [],
        locations: [],
        locationMap: {},
        minimumPrice: null,
        storePriceMultiplier: null,

        // Charts
        markupCurveChart: null,
        markupDistributionChart: null,
        ageDistributionChart: null,

        // Posting
        isPosting: false,
        postProgress: 0,
        postResults: [],

        // Audio
        audioContext: null,

        // Init flag
        initialized: false,

        // Render cache to prevent duplicate renders
        lastRenderHash: null
    };

    // Constants
    const MAX_RECENT_SCANS = 10;
    const modeContainers = {
        'add': addModeContainer,
        'scan': scanModeContainer,
        'discogs': discogsModeContainer,
        'discogs_orders': discogsOrdersModeContainer
    };

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getRecordDisplay(record) {
        if (!record) {
            throw new Error('getRecordDisplay: record is null or undefined');
        }
        const artist = record.artist && record.artist.trim() ? record.artist.trim() : null;
        const title = record.title && record.title.trim() ? record.title.trim() : null;
        if (!artist) {
            throw new Error('getRecordDisplay: artist is missing for record ID ' + record.id);
        }
        if (!title) {
            throw new Error('getRecordDisplay: title is missing for record ID ' + record.id);
        }
        return artist + ' - ' + title;
    }

    function getShortRecordDisplay(record, maxLength) {
        maxLength = maxLength || 40;
        const display = getRecordDisplay(record);
        if (display.length > maxLength) {
            return display.substring(0, maxLength - 3) + '…';
        }
        return display;
    }

    function getLocationDisplay(locationId) {
        if (!locationId) return '—';
        const loc = state.locationMap[locationId];
        if (!loc) return '—';
        if (loc.genre_name) {
            return loc.genre_name + ' - ' + loc.name;
        }
        return loc.name;
    }

    function getLocationById(id) {
        return state.locationMap[id] || null;
    }

    function getStatusClass(statusId) {
        const map = { 1: 'new', 2: 'active', 3: 'sold', 4: 'discogs' };
        return map[statusId] || '';
    }

    function getLocalMSTDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function hasConsignor(record) {
        return (record.consignor_id && record.consignor_id !== 1 && record.consignor_id !== null);
    }

    function getLastSeenCutoffDate() {
        if (lastSeenCutoffDateInput && lastSeenCutoffDateInput.value) {
            return lastSeenCutoffDateInput.value;
        }
        return null;
    }

    function meetsLastSeenFilter(record) {
        const cutoffDate = getLastSeenCutoffDate();
        if (!cutoffDate) return true;
        if (!record.last_seen) return false;
        try {
            const lastSeenDate = record.last_seen.split('T')[0];
            return lastSeenDate >= cutoffDate;
        } catch (e) {
            return false;
        }
    }

    function showStatus(message, type) {
        const el = document.getElementById('status-message');
        if (!el) return;
        el.textContent = message;
        el.className = 'status-message status-' + (type || 'info');
        el.style.display = 'block';
        setTimeout(function() { el.style.display = 'none'; }, 5000);
    }

    function showToast(message, type) {
        console.log('🍞 TOAST [' + type + ']: ' + message);
        showStatus(message, type);
    }

    function showDiscogsStatus(message, type) {
        if (!discogsStatusMessage) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        discogsStatusMessage.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        discogsStatusMessage.className = 'status-message status-' + type;
        discogsStatusMessage.style.display = 'block';
        setTimeout(function() { if (discogsStatusMessage) discogsStatusMessage.style.display = 'none'; }, 8000);
    }

    function updateDiscogsOrdersStatus(message, type) {
        if (!discogsOrdersStatus) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        discogsOrdersStatus.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        discogsOrdersStatus.className = 'status-message status-' + type;
        discogsOrdersStatus.style.display = 'block';
        setTimeout(function() {
            if (discogsOrdersStatus) discogsOrdersStatus.style.display = 'none';
        }, 8000);
    }

    function playSound(type) {
        try {
            if (!state.audioContext) {
                state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (state.audioContext.state === 'suspended') state.audioContext.resume();

            const configs = {
                beep: { freq: 800, duration: 200, type: 'sine', gain: 0.3 },
                error: { freq: 220, duration: 600, type: 'sawtooth', gain: 0.4 },
                success: { freq: 523.25, duration: 200, type: 'sine', gain: 0.2, notes: [523.25, 659.25, 783.99] }
            };

            const config = configs[type];
            if (!config) return;

            if (config.notes) {
                config.notes.forEach(function(freq, i) {
                    setTimeout(function() {
                        const osc = state.audioContext.createOscillator();
                        const gain = state.audioContext.createGain();
                        osc.connect(gain);
                        gain.connect(state.audioContext.destination);
                        osc.frequency.value = freq;
                        osc.type = config.type;
                        gain.gain.setValueAtTime(config.gain, state.audioContext.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.00001, state.audioContext.currentTime + config.duration / 1000);
                        osc.start();
                        osc.stop(state.audioContext.currentTime + config.duration / 1000);
                    }, i * 100);
                });
            } else {
                const osc = state.audioContext.createOscillator();
                const gain = state.audioContext.createGain();
                osc.connect(gain);
                gain.connect(state.audioContext.destination);
                osc.frequency.value = config.freq;
                osc.type = config.type;
                gain.gain.setValueAtTime(config.gain, state.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.00001, state.audioContext.currentTime + config.duration / 1000);
                osc.start();
                osc.stop(state.audioContext.currentTime + config.duration / 1000);
            }
        } catch (e) { console.warn('Sound error:', e); }
    }

    function downloadReceipt(text, filename) {
        filename = filename || 'receipt.txt';
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ============================================================
    // API REQUEST
    // ============================================================

    async function apiRequest(method, endpoint, body) {
        console.log('🌐 apiRequest: ' + method + ' ' + endpoint);
        const options = {
            method: method,
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }
        const res = await fetch(window.AppConfig.baseUrl + endpoint, options);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' on ' + method + ' ' + endpoint);
        return res.json();
    }

    // ============================================================
    // DOMAIN DATA LOADERS
    // ============================================================

    async function loadMinimumPrice() {
        const data = await apiRequest('GET', '/config/MIN_STORE_PRICE');
        state.minimumPrice = parseFloat(data.config_value);
    }

    async function loadStorePriceMultiplier() {
        const data = await apiRequest('GET', '/config/STORE_PRICE_ESTIMATED_MULTIPLIER');
        state.storePriceMultiplier = parseFloat(data.config_value);
    }

    async function loadConditions() {
        const data = await apiRequest('GET', '/api/conditions');
        state.conditions = data.conditions;
    }

    async function loadConsignors() {
        const data = await apiRequest('GET', '/users');
        state.consignors = data.users.filter(function(u) { return u.role === 'consignor'; });
        state.consignorMap = {};
        data.users.forEach(function(u) { state.consignorMap[u.id] = { initials: u.initials || '', name: u.full_name || u.username }; });
    }

    async function loadGenres() {
        try {
            const data = await apiRequest('GET', '/api/genres');
            state.genres = data.genres || [];
            window._genreMap = {};
            state.genres.forEach(function(g) {
                window._genreMap[g.id] = g.name;
            });
        } catch (e) {
            console.warn('Could not load genres:', e);
            state.genres = [];
            window._genreMap = {};
        }
    }

    async function loadFormats() {
        try {
            const data = await apiRequest('GET', '/api/formats');
            state.formats = data.formats || [];
        } catch (e) {
            console.warn('Could not load formats:', e);
            state.formats = [];
        }
    }

    async function loadLocations() {
        try {
            const data = await apiRequest('GET', '/api/locations');
            const rawLocations = data.locations || [];
            state.locationMap = {};
            rawLocations.forEach(function(loc) {
                const genreName = window._genreMap && window._genreMap[loc.genre_id] ? window._genreMap[loc.genre_id] : null;
                state.locationMap[loc.id] = {
                    id: loc.id,
                    name: loc.name,
                    genre_id: loc.genre_id,
                    genre_name: genreName
                };
            });
            state.locations = rawLocations;
            populateLocationDropdown(rawLocations);
        } catch (e) {
            console.warn('Could not load locations:', e);
            state.locations = [];
            state.locationMap = {};
        }
    }

    function populateLocationDropdown(locationsList) {
        if (!scanLocationSelect) return;
        const currentVal = scanLocationSelect.value;
        scanLocationSelect.innerHTML = '<option value="">-- Select Location --</option>';
        if (!locationsList || locationsList.length === 0) return;
        locationsList.forEach(function(loc) {
            const opt = document.createElement('option');
            opt.value = loc.id;
            let displayName = loc.name;
            const locData = state.locationMap[loc.id];
            if (locData && locData.genre_name) {
                displayName = locData.genre_name + ' - ' + loc.name;
            }
            opt.textContent = displayName;
            scanLocationSelect.appendChild(opt);
        });
        if (currentVal) scanLocationSelect.value = currentVal;
        updateScanLocationPreview();
    }

    async function loadStats() {
        const total = await apiRequest('GET', '/records/count');
        document.getElementById('total-records').textContent = total.count;
        const newCount = await apiRequest('GET', '/records/count?status_id=1');
        document.getElementById('new-records-count').textContent = newCount.count;

        const lastRecordData = await apiRequest('GET', '/records?limit=1&order_by=created_at&order=desc');
        const lastRecord = lastRecordData.records && lastRecordData.records.length > 0 ? lastRecordData.records[0] : null;
        if (lastRecord) {
            const display = getShortRecordDisplay(lastRecord, 45);
            const price = lastRecord.store_price ? ' - $' + lastRecord.store_price.toFixed(2) : '';
            document.getElementById('last-added-record').textContent = display + price;
        } else {
            document.getElementById('last-added-record').textContent = 'None';
        }

        const commission = await apiRequest('GET', '/api/commission-rate');
        document.getElementById('commission-rate').textContent = commission.commission_rate_percent;
    }

    // ============================================================
    // SELECTION MANAGEMENT
    // ============================================================

    function getSelectedRecords() {
        if (state.selection.fromIndex === null || state.selection.toIndex === null) {
            return [];
        }
        const start = Math.min(state.selection.fromIndex, state.selection.toIndex);
        const end = Math.max(state.selection.fromIndex, state.selection.toIndex);
        return state.filteredRecords.slice(start, end + 1);
    }

    function setSelection(from, to) {
        state.selection.fromIndex = from;
        state.selection.toIndex = to;
        state.selection.isActive = true;
        render();
    }

    function clearSelection() {
        state.selection.fromIndex = null;
        state.selection.toIndex = null;
        state.selection.isActive = false;
        render();
    }

    function startRangeFrom(index) {
        setSelection(index, index);
        const selected = getSelectedRecords();
        showStatus('Selected ' + selected.length + ' record(s)', 'info');
    }

    function endRangeTo(index) {
        if (state.selection.fromIndex === null) {
            showStatus('Select "from" first', 'warning');
            return;
        }
        setSelection(state.selection.fromIndex, index);
        const selected = getSelectedRecords();
        showStatus('Selected ' + selected.length + ' record(s)', 'success');
    }

    function cancelRangeSelection() {
        clearSelection();
        showStatus('Selection cleared', 'info');
    }

    function updateSelectionCount() {
        const selected = getSelectedRecords();
        const count = selected.length;
        selectedCountSpan.textContent = count;

        const hasRecords = state.filteredRecords.length > 0;
        const hasSelection = state.selection.isActive && count > 0;

        if (state.currentSearchMode === 'add') {
            printBtn.disabled = !(hasSelection || hasRecords);
            if (hasSelection) {
                printBtn.textContent = '🖨️ Print (' + count + ' selected)';
            } else {
                printBtn.textContent = '🖨️ Print (all)';
            }
            printBtn.style.display = '';
        } else {
            printBtn.style.display = 'none';
        }

        cancelRangeBtn.style.display = state.selection.isActive ? 'inline-block' : 'none';
    }

    // ============================================================
    // PAGINATION
    // ============================================================

    function renderPagination() {
        const totalPages = Math.ceil(state.totalRecords / state.pageSize) || 1;
        if (state.currentPage > totalPages) state.currentPage = totalPages;
        if (state.currentPage < 1) state.currentPage = 1;

        const start = (state.currentPage - 1) * state.pageSize + 1;
        const end = Math.min(state.currentPage * state.pageSize, state.totalRecords);

        showingStartSpan.textContent = start;
        showingEndSpan.textContent = end;
        totalFilteredSpan.textContent = state.totalRecords;
        totalPagesSpan.textContent = totalPages;
        currentPageInput.value = state.currentPage;

        firstPageBtn.disabled = state.currentPage === 1;
        prevPageBtn.disabled = state.currentPage === 1;
        nextPageBtn.disabled = state.currentPage === totalPages;
        lastPageBtn.disabled = state.currentPage === totalPages;
    }

    function getCurrentPageData() {
        const start = (state.currentPage - 1) * state.pageSize;
        const end = Math.min(start + state.pageSize, state.filteredRecords.length);
        return state.filteredRecords.slice(start, end);
    }

    // ============================================================
    // RENDER - Single entry point for all UI updates
    // ============================================================

    function render() {
        // Prevent duplicate renders
        const renderHash = JSON.stringify({
            records: state.filteredRecords.slice((state.currentPage - 1) * state.pageSize, state.currentPage * state.pageSize).map(r => r.id),
            page: state.currentPage,
            pageSize: state.pageSize,
            mode: state.currentSearchMode,
            selection: state.selection
        });

        if (renderHash === state.lastRenderHash) {
            return;
        }
        state.lastRenderHash = renderHash;

        renderPagination();
        renderTablePage();
        updateSelectionCount();
        updateScanCounter();
    }

    // ============================================================
    // RENDER TABLE PAGE
    // ============================================================

    function renderTablePage() {
        const pageRecords = getCurrentPageData();
        const mode = state.currentSearchMode;
        const isSearchResult = state.currentMode === 'search' && state.currentResults.length > 0;

        // Build table header
        let theadHtml = buildTableHeader(mode, isSearchResult);
        recordsTableHead.innerHTML = theadHtml;

        // Build table body
        let tbodyHtml = '';
        if (pageRecords.length === 0) {
            tbodyHtml = buildEmptyStateMessage(mode);
        } else {
            for (let idx = 0; idx < pageRecords.length; idx++) {
                const globalIndex = (state.currentPage - 1) * state.pageSize + idx;
                const record = pageRecords[idx];
                const isSelected = state.selection.isActive &&
                    globalIndex >= Math.min(state.selection.fromIndex, state.selection.toIndex) &&
                    globalIndex <= Math.max(state.selection.fromIndex, state.selection.toIndex);

                tbodyHtml += buildRowHtml(record, globalIndex, isSelected, mode, isSearchResult);
            }
        }
        recordsTableBody.innerHTML = tbodyHtml;

        // Attach event listeners via delegation (handled by the click delegate below)
        // But we need to re-attach inline onclick handlers for buttons that were added via HTML
        attachRowEventListeners();
    }

    function buildTableHeader(mode, isSearchResult) {
        if (mode === 'add') {
            if (isSearchResult) {
                let html = '<tr><th style="width:60px;">Range</th><th style="width:60px;">Image</th><th>Artist</th><th>Title</th><th>Catalog #</th>';
                if (!state.defaultParamsActive || !state.defaultParams.sleeveConditionId) html += '<th>Sleeve</th>';
                if (!state.defaultParamsActive || !state.defaultParams.discConditionId) html += '<th>Disc</th>';
                if (!state.defaultParamsActive || !state.defaultParams.price) html += '<th>Price</th>';
                if (!state.defaultParamsActive || !state.defaultParams.consignorId) html += '<th>Consignor</th>';
                if (!state.defaultParamsActive || !state.defaultParams.formatId) html += '<th>Format</th>';
                html += '<th>Notes</th><th>Action</th></tr>';
                return html;
            } else {
                if (state.selectedPurchaseId && state.currentPurchaseRecords.length > 0) {
                    return '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Catalog #</th><th>Sleeve</th><th>Disc</th><th>Barcode</th><th>Created At</th><th>Action</th></tr>';
                } else {
                    return '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Catalog #</th><th>Sleeve</th><th>Disc</th><th>Barcode</th><th>Created At</th></tr>';
                }
            }
        } else if (mode === 'scan') {
            return '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Barcode</th><th>Last Seen</th></tr>';
        } else if (mode === 'discogs') {
            return '<tr><th style="width:60px;">Range</th><th>Image</th><th>ID</th><th>Artist</th><th>Title</th><th>Catalog #</th><th>Media Cond</th><th>Sleeve Cond</th><th>Store Price</th><th>Discogs Price</th><th>Markup %</th><th>Location</th><th>Post</th></tr>';
        } else if (mode === 'discogs_orders') {
            return '<tr><th>#</th><th>Artist</th><th>Title</th><th>Catalog</th><th>Barcode</th><th>Price</th><th>Condition</th><th>PigStyle ID</th><th>Status</th><th>Action</th></tr>';
        }
        return '';
    }

    function buildEmptyStateMessage(mode) {
        let msg = 'No records found';
        if (mode === 'add' && state.currentMode !== 'search') {
            if (state.selectedPurchaseId) {
                msg = 'No records linked to this purchase. Search Discogs to add records.';
            } else {
                msg = 'No purchase selected. Click a row in the purchases table above.';
            }
        }
        if (mode === 'scan') msg = 'Select a location and scan barcodes to add records.';
        if (mode === 'discogs') msg = 'No records found. Check filters or add records in "Add Record" mode.';
        if (mode === 'discogs_orders') {
            if (state.ordersList.length === 0) msg = 'No Discogs orders found. Click Refresh Orders.';
            else if (!state.selectedOrderId) msg = 'Select an order from the dropdown.';
            else msg = 'This order has no items.';
        }
        const colCount = mode === 'discogs_orders' ? 10 :
            (mode === 'add' ? (state.currentMode === 'search' ? 12 : (state.selectedPurchaseId ? 11 : 10)) :
                (mode === 'scan' ? 7 : (mode === 'discogs' ? 13 : 7)));
        return '<tr><td colspan="' + colCount + '" style="text-align:center;padding:40px;">' + msg + '</td></tr>';
    }

    function buildRowHtml(record, globalIndex, isSelected, mode, isSearchResult) {
        const rowClass = isSelected ? 'record-selected' : '';
        let rowHtml = '<tr class="' + rowClass + '" data-index="' + globalIndex + '">';

        // Range buttons
        const rangeButtons = buildRangeButtons(globalIndex);
        rowHtml += '<td style="text-align:center; white-space:nowrap;">' + rangeButtons + '</td>';

        if (mode === 'add' && isSearchResult) {
            rowHtml += buildSearchResultRow(record);
        } else if (mode === 'add' && !isSearchResult) {
            rowHtml += buildInventoryRow(record);
        } else if (mode === 'scan') {
            rowHtml += buildScanRow(record);
        } else if (mode === 'discogs') {
            rowHtml += buildDiscogsRow(record);
        } else if (mode === 'discogs_orders') {
            rowHtml += buildDiscogsOrderRow(record, globalIndex);
        }

        rowHtml += '</tr>';
        return rowHtml;
    }

    function buildRangeButtons(index) {
        if (state.currentSearchMode === 'discogs_orders') return '';

        if (!state.selection.isActive) {
            return '<button class="btn-from" data-index="' + index + '" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button><span style="color:#999; margin:0 4px;">to</span>';
        }

        if (state.selection.fromIndex === index && state.selection.toIndex === index) {
            return '<span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">FROM ✓</span><span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">TO ✓</span>';
        }
        if (state.selection.fromIndex === index) {
            return '<span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">FROM ✓</span><button class="btn-to" data-index="' + index + '" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>';
        }
        if (state.selection.toIndex === index) {
            return '<button class="btn-from" data-index="' + index + '" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button><span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">TO ✓</span>';
        }
        return '<button class="btn-from" data-index="' + index + '" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button><button class="btn-to" data-index="' + index + '" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>';
    }

    function buildSearchResultRow(record) {
        const artist = record.artist || 'Unknown';
        const title = record.title || 'Unknown';
        const catalog = record.catalog_number || '';
        const imageUrl = record.image_url || record.thumb || '';

        const condOptions = state.conditions.map(function(c) {
            return '<option value="' + c.id + '">' + (c.display_name || c.condition_name) + '</option>';
        }).join('');

        const consignorOptions = state.consignors.map(function(c) {
            return '<option value="' + c.id + '">' + c.username + '</option>';
        }).join('');

        const formatOptions = state.formats.map(function(f) {
            return '<option value="' + f.id + '">' + f.name + '</option>';
        }).join('');

        let html = '';
        const imageHtml = imageUrl ?
            '<img src="' + escapeHtml(imageUrl) + '" style="width:80px; height:80px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="expandImage(\'' + escapeHtml(imageUrl) + '\', \'' + escapeHtml(artist) + ' - ' + escapeHtml(title) + '\')" title="Click to expand">' :
            '<div style="width:80px; height:80px; background:#eee; border-radius:4px;"></div>';

        html += '<td style="text-align:center;">' + imageHtml + '</td>';
        html += '<td>' + escapeHtml(artist) + '</td>';
        html += '<td>' + escapeHtml(title) + '</td>';
        html += '<td>' + escapeHtml(catalog) + '</td>';

        if (!state.defaultParamsActive || !state.defaultParams.sleeveConditionId) {
            html += '<td><select class="sleeve-condition-select" style="width:100px; padding:4px;"><option value="">Select...</option>' + condOptions + '</select></td>';
        }
        if (!state.defaultParamsActive || !state.defaultParams.discConditionId) {
            html += '<td><select class="disc-condition-select" style="width:100px; padding:4px;"><option value="">Select...</option>' + condOptions + '</select></td>';
        }
        if (!state.defaultParamsActive || !state.defaultParams.price) {
            html += '<td><input type="number" class="price-input" step="1" min="' + (state.minimumPrice !== null ? state.minimumPrice : 0) + '" value="" style="width:80px; padding:4px;"></td>';
        }
        if (!state.defaultParamsActive || !state.defaultParams.consignorId) {
            html += '<td><select class="consignor-select" style="width:100px; padding:4px;"><option value="">None</option>' + consignorOptions + '</select></td>';
        }
        if (!state.defaultParamsActive || !state.defaultParams.formatId) {
            html += '<td><select class="format-select" style="width:100px; padding:4px;"><option value="">Select...</option>' + formatOptions + '</select></td>';
        }
        html += '<td><input type="text" class="notes-input" placeholder="Optional note..." style="width:120px; padding:4px; font-size:12px;"></td>';
        html += '<td><button class="btn-add-record-from-search" data-index="' + globalIndex + '" style="background:#28a745; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;"><i class="fas fa-plus"></i> Add</button></td>';

        return html;
    }

    function buildInventoryRow(record) {
        const display = getRecordDisplay(record);
        const price = record.store_price ? '$' + record.store_price.toFixed(2) : 'N/A';
        const catalog = record.catalog_number || '—';
        const sleeveCondition = record.sleeve_condition_name || '—';
        const discCondition = record.disc_condition_name || '—';
        const barcode = record.barcode || record.id;
        const created = record.created_at ? new Date(record.created_at).toLocaleString() : 'Unknown';

        let html = '';
        html += '<td>' + record.id + '</td>';
        html += '<td>' + escapeHtml(display) + '</td>';
        html += '<td>' + price + '</td>';
        html += '<td>' + escapeHtml(catalog) + '</td>';
        html += '<td>' + escapeHtml(sleeveCondition) + '</td>';
        html += '<td>' + escapeHtml(discCondition) + '</td>';
        html += '<td><span class="barcode-value">' + barcode + '</span></td>';
        html += '<td>' + created + '</td>';

        if (state.selectedPurchaseId) {
            html += '<td><button class="btn btn-sm btn-danger" onclick="removeRecordFromPurchase(' + record.id + ')"><i class="fas fa-times"></i></button></td>';
        } else {
            html += '<td></td>';
        }

        return html;
    }

    function buildScanRow(record) {
        const display = getRecordDisplay(record);
        const price = record.store_price ? '$' + record.store_price.toFixed(2) : 'N/A';
        const barcode = record.barcode || record.id;
        const lastSeen = record.last_seen ? new Date(record.last_seen).toLocaleDateString() : 'Never';

        let html = '';
        html += '<td>' + record.id + '</td>';
        html += '<td>' + escapeHtml(display) + '</td>';
        html += '<td>' + price + '</td>';
        html += '<td><span class="barcode-value">' + barcode + '</span></td>';
        html += '<td>' + lastSeen + '</td>';
        return html;
    }

    function buildDiscogsRow(record) {
        const display = getRecordDisplay(record);
        const catalog = record.catalog_number || '—';
        const mediaCond = record.disc_condition_name || '—';
        const sleeveCond = record.sleeve_condition_name || '—';
        const storePrice = record.store_price ? '$' + parseFloat(record.store_price).toFixed(2) : '—';
        const imageUrl = record.image_url && record.image_url !== '' && record.image_url !== 'None' ? record.image_url : null;
        const locationDisplay = getLocationDisplay(record.location_id);
        const discogsPrice = record._discogsPrice !== undefined ? record._discogsPrice : null;
        const markupPercent = record._markupPercent !== undefined ? record._markupPercent : null;
        const displayDiscogsPrice = discogsPrice ? '$' + discogsPrice.toFixed(2) : '—';
        const markupClass = (markupPercent > 0) ? 'positive' : ((markupPercent < 0) ? 'negative' : 'zero');
        const displayMarkup = (markupPercent !== null) ? (markupPercent > 0 ? '+' : '') + markupPercent + '%' : '—';

        const imgHtml = imageUrl ?
            '<img src="' + escapeHtml(imageUrl) + '" style="width:80px; height:80px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="expandImage(\'' + escapeHtml(imageUrl) + '\', \'' + escapeHtml(display) + '\')" title="Click to expand">' :
            '<div style="width:80px; height:80px; background:#e0e0e0; border-radius:4px;"></div>';

        let html = '';
        html += '<td style="text-align:center;">' + imgHtml + '</td>';
        html += '<td>' + record.id + '</td>';
        html += '<td><strong>' + escapeHtml(display) + '</strong></td>';
        html += '<td>' + escapeHtml(catalog) + '</td>';
        html += '<td>' + escapeHtml(mediaCond) + '</td>';
        html += '<td>' + escapeHtml(sleeveCond) + '</td>';
        html += '<td>' + storePrice + '</td>';
        html += '<td class="discogs-price-cell" style="' + (discogsPrice ? 'color: #28a745; font-weight: bold;' : 'color: #999;') + '">' + displayDiscogsPrice + '</td>';
        html += '<td class="markup-cell ' + markupClass + '">' + displayMarkup + '</td>';
        html += '<td title="' + escapeHtml(locationDisplay) + '" style="font-size: 12px;">' + escapeHtml(locationDisplay.length > 30 ? locationDisplay.substring(0, 27) + '...' : locationDisplay) + '</td>';
        html += '<td style="text-align: center;">' + (discogsPrice ? '<button class="post-single-btn" data-record-id="' + record.id + '" data-display="' + escapeHtml(display) + '" data-price="' + record.store_price + '" data-discogs-price="' + discogsPrice + '" data-markup-percent="' + markupPercent + '" data-media-condition="' + mediaCond + '" data-sleeve-condition="' + sleeveCond + '" data-catalog="' + escapeHtml(catalog) + '" data-location="' + escapeHtml(locationDisplay) + '" data-notes="' + escapeHtml(record.notes || '') + '"><i class="fab fa-discogs"></i> Post</button>' : '<span style="color: #999;">—</span>') + '</td>';

        return html;
    }

    function buildDiscogsOrderRow(orderItem, globalIndex) {
        const idxNum = globalIndex + 1;
        const display = getRecordDisplay(orderItem);
        const catalog = orderItem.catalog_number || '—';
        const barcode = orderItem.barcode || '—';
        const price = orderItem.price || 0;
        const condition = orderItem.media_condition || '—';
        const pigstyleId = orderItem.pigstyle_id || '';
        const recordStatus = orderItem.record_status_id;
        let statusText = '—';
        let statusClass = '';
        if (recordStatus === 2) { statusText = 'Active'; statusClass = 'active'; } else if (recordStatus === 3 || recordStatus === 4) { statusText = 'Sold'; statusClass = 'sold'; } else if (recordStatus === 1) { statusText = 'New'; statusClass = 'new'; } else { statusText = 'Not found'; statusClass = ''; }

        let actionButton = '';
        if (pigstyleId && recordStatus !== 3 && recordStatus !== 4) {
            actionButton = '<button class="btn btn-sm btn-success mark-discogs-sold-btn" data-record-id="' + pigstyleId + '" style="padding:2px 6px; font-size:11px; margin-top:4px;"><i class="fab fa-discogs"></i> Mark Sold</button>';
        }

        let html = '';
        html += '<td>' + idxNum + '</td>';
        html += '<td>' + escapeHtml(display) + '</td>';
        html += '<td>' + escapeHtml(catalog) + '</td>';
        html += '<td>' + escapeHtml(barcode) + '</td>';
        html += '<td>$' + price.toFixed(2) + '</td>';
        html += '<td>' + escapeHtml(condition) + '</td>';
        html += '<td><input type="text" class="pigstyle-id-input" value="' + escapeHtml(pigstyleId) + '" placeholder="ID or barcode" style="width:100px; padding:4px; border:1px solid #ddd; border-radius:4px;"><button class="btn btn-sm btn-secondary scan-pigstyle-btn" style="padding:2px 6px; font-size:12px;"><i class="fas fa-qrcode"></i></button></td>';
        html += '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>';
        html += '<td>' + actionButton + '</td>';

        return html;
    }

    // ============================================================
    // EVENT DELEGATION - Single listener for all row interactions
    // ============================================================

    function attachRowEventListeners() {
        // The actual event listeners are attached via delegation in the init function
        // This function is called after each render to ensure inline onclick handlers work
        // For buttons that need dynamic behavior, we use data attributes and delegation
    }

    // ============================================================
    // DISCOGS PRICES
    // ============================================================

    async function calculateMarkupBatch(records) {
        if (!records || records.length === 0) return [];
        try {
            const result = await apiRequest('POST', '/api/discogs/calculate-markup-batch', { records: records });
            if (result.status === 'success') {
                return result.results;
            } else {
                console.error('Batch markup error:', result.error);
                return [];
            }
        } catch (error) {
            console.error('Error in batch markup:', error);
            return [];
        }
    }

    async function populateDiscogsPrices(records) {
        if (state.currentSearchMode !== 'discogs') return;
        if (!records || records.length === 0) return;

        const eligibleRecords = records.filter(function(r) {
            return r.status_id === 2 && !hasConsignor(r) && meetsLastSeenFilter(r) && r.created_at;
        });

        if (eligibleRecords.length === 0) return;

        const priceRequests = eligibleRecords.map(function(r) {
            return {
                id: r.id,
                created_at: r.created_at,
                store_price: r.store_price
            };
        });

        const pricesMap = {};
        try {
            const batchResults = await calculateMarkupBatch(priceRequests);
            batchResults.forEach(function(item) {
                if (item.id) {
                    pricesMap[item.id] = item;
                }
            });
        } catch (error) {
            console.error('Error calculating prices:', error);
            return;
        }

        records.forEach(function(record) {
            if (pricesMap[record.id]) {
                record._discogsPrice = pricesMap[record.id].discogs_price;
                record._markupPercent = pricesMap[record.id].markup_percent;
            } else {
                record._discogsPrice = null;
                record._markupPercent = null;
            }
        });

        render();
    }

    // ============================================================
    // SCAN FUNCTIONS
    // ============================================================

    function updateScanLocationPreview() {
        const locationId = scanLocationSelect ? parseInt(scanLocationSelect.value) : null;
        const locData = locationId ? getLocationById(locationId) : null;
        const displayName = locData ? (locData.genre_name ? locData.genre_name + ' - ' + locData.name : locData.name) : '-- Please select a location --';

        if (scanLocationDisplay) {
            scanLocationDisplay.textContent = displayName;
        }

        if (scanIndexDisplay) {
            scanIndexDisplay.textContent = '📍 Index: ' + state.scanIndex;
        }

        const allSelected = locationId;
        if (scanInput) scanInput.disabled = !allSelected;
        if (scanSubmitBtn) scanSubmitBtn.disabled = !allSelected;
    }

    function updateScanCounter() {
        const counterEl = document.getElementById('scan-counter-display');
        if (counterEl) {
            counterEl.textContent = state.scanCounter || state.filteredRecords.length;
        }
    }

    function resetScanCounter() {
        state.scanCounter = 0;
        state.scanIndex = 0;
        updateScanCounter();
        if (scanIndexDisplay) {
            scanIndexDisplay.textContent = '📍 Index: 0';
        }
        updateScanLocationPreview();
    }

    function addToRecentScans(record, locationString) {
        if (state.recentScans.length > 0 && state.recentScans[0].record.id === record.id) {
            return;
        }

        const recordCopy = {
            id: record.id,
            artist: record.artist,
            title: record.title,
            barcode: record.barcode || '',
            catalog_number: record.catalog_number || '',
            store_price: record.store_price || 0,
            status_id: record.status_id || null,
            location_id: record.location_id || null,
            location_index: record.location_index || null,
            last_seen: record.last_seen || null,
            image_url: record.image_url || ''
        };

        state.recentScans.unshift({
            record: recordCopy,
            location: locationString,
            timestamp: Date.now()
        });

        if (state.recentScans.length > MAX_RECENT_SCANS) {
            state.recentScans.pop();
        }

        try {
            const serialized = state.recentScans.map(function(s) {
                return {
                    recordId: s.record.id,
                    artist: s.record.artist,
                    title: s.record.title,
                    location: s.location,
                    timestamp: s.timestamp
                };
            });
            localStorage.setItem('recentScans', JSON.stringify(serialized));
        } catch (e) {
            console.warn('Could not save recent scans:', e);
        }

        updateRecentScansUI();
    }

    function loadRecentScansFromStorage() {
        try {
            const stored = localStorage.getItem('recentScans');
            if (stored) {
                const parsed = JSON.parse(stored);
                state.recentScans = parsed.map(function(item) {
                    return {
                        record: {
                            id: item.recordId,
                            artist: item.artist || 'Unknown Artist',
                            title: item.title || 'Unknown Title'
                        },
                        location: item.location || '',
                        timestamp: item.timestamp
                    };
                });
            }
        } catch (e) {
            console.warn('Could not load recent scans from storage:', e);
        }
    }

    function updateRecentScansUI() {
        if (!recentScansList) return;

        if (state.recentScans.length === 0) {
            recentScansList.innerHTML = '<div class="no-recent-scans">No recent scans</div>';
            if (lastScanDisplay) lastScanDisplay.textContent = 'Last: --';
            return;
        }

        let html = '';
        state.recentScans.forEach(function(scan, index) {
            const isLast = index === 0;
            const record = scan.record;
            const display = getRecordDisplay(record);
            const location = scan.location || '—';
            const time = scan.timestamp ? new Date(scan.timestamp).toLocaleTimeString() : '';

            html += '<div class="recent-scan-item ' + (isLast ? 'recent-scan-last' : '') + '">';
            html += '<span class="scan-index-badge">#' + (index + 1) + '</span>';
            html += '<span class="scan-artist-title">' + escapeHtml(display) + '</span>';
            html += '<span class="scan-location">' + escapeHtml(location) + '</span>';
            if (time) {
                html += '<span class="scan-time">' + time + '</span>';
            }
            html += '</div>';
        });
        recentScansList.innerHTML = html;

        if (lastScanDisplay && state.recentScans.length > 0) {
            const last = state.recentScans[0];
            const display = getRecordDisplay(last.record);
            lastScanDisplay.textContent = 'Last: ' + escapeHtml(display);
        }
    }

    function getArtistSortKey(artistName) {
        if (!artistName) return '';
        let name = artistName.trim();
        name = name.replace(/^the\s+/i, '');
        return name.charAt(0).toUpperCase();
    }

    function calculateMatchScore(record, recentScansList) {
        if (!recentScansList || recentScansList.length === 0) return 0;
        const recordSortKey = getArtistSortKey(record.artist);
        let score = 0;
        for (let i = 0; i < recentScansList.length; i++) {
            const recent = recentScansList[i];
            const weight = Math.pow(0.5, i);
            if (recent.sortKey === recordSortKey) {
                score += 100 * weight;
            }
            const recentArtistLower = recent.artist.toLowerCase();
            const recordArtistLower = record.artist.toLowerCase();
            const recentFirstWord = recentArtistLower.replace(/^the\s+/, '').split(' ')[0];
            const recordFirstWord = recordArtistLower.replace(/^the\s+/, '').split(' ')[0];
            if (recentFirstWord === recordFirstWord && recentFirstWord.length > 2) {
                score += 30 * weight;
            }
        }
        if (record.status_id === 2) score += 50;
        if (record.status_id === 3) score -= 100;
        return score;
    }

    async function performScanSearch(term) {
        const locationId = scanLocationSelect ? parseInt(scanLocationSelect.value) : null;
        const locData = locationId ? getLocationById(locationId) : null;
        const locationDisplay = locData ? (locData.genre_name ? locData.genre_name + ' - ' + locData.name : locData.name) : null;

        if (!locationId || !locationDisplay) {
            showStatus('Please select a location before scanning.', 'warning');
            playSound('error');
            return;
        }

        try {
            const data = await apiRequest('GET', '/records/search?q=' + encodeURIComponent(term));
            if (!data.records || !data.records.length) {
                playSound('error');
                showStatus('No record found with that barcode or ID', 'error');
                if (scanInput) scanInput.value = '';
                return;
            }

            const records = data.records;

            if (records.length === 1) {
                await processScannedRecord(records[0]);
                return;
            }

            const recentScansList = state.recentScans.map(function(s) {
                return {
                    artist: s.record.artist,
                    sortKey: getArtistSortKey(s.record.artist)
                };
            });

            const scored = records.map(function(record) {
                return {
                    record: record,
                    score: calculateMatchScore(record, recentScansList)
                };
            });

            scored.sort(function(a, b) { return b.score - a.score; });

            const best = scored[0];
            const secondBest = scored.length > 1 ? scored[1] : null;
            const bestScore = best.score;
            const secondScore = secondBest ? secondBest.score : 0;

            const HIGH_CONFIDENCE_SCORE = 100;
            const GAP_THRESHOLD = 40;
            const AUTO_SELECT_SCORE = 80;
            const AUTO_SELECT_GAP = 30;

            let selectedRecord = null;
            let confidence = 'low';

            if (bestScore > HIGH_CONFIDENCE_SCORE && (bestScore - secondScore) > GAP_THRESHOLD) {
                selectedRecord = best.record;
                confidence = 'high';
            } else if (bestScore > AUTO_SELECT_SCORE && (bestScore - secondScore) > AUTO_SELECT_GAP) {
                selectedRecord = best.record;
                confidence = 'medium';
            }

            if (selectedRecord) {
                playSound('success');
                const display = getShortRecordDisplay(selectedRecord, 30);
                showStatus('🎯 Auto-selected: ' + display + ' (' + confidence + ' confidence)', 'success');
                await processScannedRecord(selectedRecord);
                return;
            }

            playSound('error');
            showStatus('⚠️ Multiple records (' + records.length + ') found. Please use a unique barcode or ID.', 'error');
            if (scanInput) scanInput.value = '';

        } catch (error) {
            playSound('error');
            showStatus('Error scanning: ' + error.message, 'error');
            console.error('Scan search error:', error);
            if (scanInput) scanInput.value = '';
        }
    }

    async function processScannedRecord(record) {
        const locationId = scanLocationSelect ? parseInt(scanLocationSelect.value) : null;
        const locData = locationId ? getLocationById(locationId) : null;
        const locationDisplay = locData ? (locData.genre_name ? locData.genre_name + ' - ' + locData.name : locData.name) : '';

        const existing = state.filteredRecords.find(function(r) { return r.id === record.id; });
        const today = getLocalMSTDate();
        const index = state.scanIndex + 1;

        if (existing) {
            try {
                await apiRequest('PUT', '/records/' + record.id, {
                    location_id: locationId,
                    location_index: existing.location_index || index,
                    last_seen: today
                });
                existing.last_seen = today;
                existing.location_name = locationDisplay;
                existing.location_id = locationId;

                render();
                playSound('success');
                const display = getShortRecordDisplay(record, 30);
                showStatus('✅ Updated #' + record.id + ': ' + display, 'success');
                if (scanInput) scanInput.value = '';
                addToRecentScans(record, locationDisplay || record.location_name || '');
                return;
            } catch (error) {
                showStatus('Error updating record: ' + error.message, 'error');
                playSound('error');
                return;
            }
        }

        try {
            await apiRequest('PUT', '/records/' + record.id, {
                location_id: locationId,
                location_index: index,
                last_seen: today
            });

            record.location_id = locationId;
            record.location_index = index;
            record.last_seen = today;
            record.location_name = locationDisplay;

            state.filteredRecords.unshift(record);
            state.totalRecords = state.filteredRecords.length;
            state.scanIndex = index;
            state.currentPage = 1;

            render();
            playSound('success');
            const display = getShortRecordDisplay(record, 30);
            showStatus('✅ Added #' + record.id + ': ' + display, 'success');
            if (scanInput) scanInput.value = '';
            addToRecentScans(record, locationDisplay || '');
            updateScanLocationPreview();

        } catch (error) {
            showStatus('Error adding record: ' + error.message, 'error');
            playSound('error');
        }
    }

    // ============================================================
    // LOAD RECORDS
    // ============================================================

    async function loadRecords(options) {
        options = options || {};
        try {
            const {
                statusIds,
                location,
                search,
                mode,
                requireImage = false,
                requireLocation = false,
                excludeOldNoLocation = false,
                bypassDateFilter = true,
                createdAfter,
                limit,
                random = false,
                hasYoutube = false,
                filterBySearch = true,
                showAllStatuses = false,
                format = null,
                excludeBatch = false,
                batchId = null,
                locationId = null
            } = options;

            let url = '/records';
            const params = new URLSearchParams();

            if (locationId) {
                url = '/api/records/by-location';
                params.append('location_id', locationId);
            } else {
                if (!showAllStatuses && statusIds && statusIds.length > 0) {
                    params.append('status_ids', statusIds.join(','));
                }
                if (requireImage) params.append('require_image', 'true');
                if (requireLocation) params.append('require_location', 'true');
                if (excludeOldNoLocation) params.append('exclude_old_no_location', 'true');
                if (bypassDateFilter && !createdAfter) params.append('bypass_date_filter', 'true');
                if (createdAfter) params.append('created_after', createdAfter);
                if (limit) params.append('limit', limit);
                if (random) params.append('random', 'true');
                if (hasYoutube) params.append('has_youtube', 'true');
                if (search && filterBySearch) params.append('search', search);
                if (format) params.append('format', format);
                if (excludeBatch) params.append('exclude_batch', 'true');
                if (batchId) params.append('batch_id', batchId);
            }

            const queryString = params.toString();
            const fullUrl = window.AppConfig.baseUrl + url + (queryString ? '?' + queryString : '');

            const response = await fetch(fullUrl, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to load records');

            let records = data.records || [];

            if (location && search && filterBySearch) {
                const term = search.toLowerCase();
                records = records.filter(function(r) {
                    return (r.artist && r.artist.toLowerCase().includes(term)) ||
                        (r.title && r.title.toLowerCase().includes(term)) ||
                        (r.barcode && r.barcode.toLowerCase().includes(term)) ||
                        (r.catalog_number && r.catalog_number.toLowerCase().includes(term));
                });
            }

            if (!location && search && !filterBySearch) {
                const term = search.toLowerCase();
                records = records.filter(function(r) {
                    return (r.artist && r.artist.toLowerCase().includes(term)) ||
                        (r.title && r.title.toLowerCase().includes(term)) ||
                        (r.barcode && r.barcode.toLowerCase().includes(term)) ||
                        (r.catalog_number && r.catalog_number.toLowerCase().includes(term));
                });
            }

            if (mode === 'discogs' && state.lastSeenCutoffDate) {
                records = records.filter(function(r) { return meetsLastSeenFilter(r); });
            }

            // Update state
            state.allRecords = records;
            state.filteredRecords = records;
            state.totalRecords = state.filteredRecords.length;
            state.currentPage = 1;
            state.currentMode = mode || 'inventory';

            if (mode === 'add' && !search) {
                state.currentResults = [];
            }

            if (mode === 'discogs' && location) {
                state.currentLocationRecords = records;
                await populateDiscogsPrices(records);
            }

            // Single render
            render();

            // Status message
            let statusMsg = 'Showing ' + state.totalRecords + ' records';
            if (statusIds && statusIds.length === 1) statusMsg += ' with status_id=' + statusIds[0];
            else if (statusIds && statusIds.length > 1) statusMsg += ' with status_ids ' + statusIds.join(', ');
            if (location) statusMsg += ' in location "' + location + '"';
            if (search) statusMsg += ' matching "' + search + '"';
            if (excludeBatch) statusMsg += ' (excluding linked records)';
            if (batchId) statusMsg += ' (purchase ' + batchId + ')';
            showStatus(statusMsg, 'info');

            return records;
        } catch (error) {
            console.error('❌ loadRecords error:', error);
            showStatus('Error loading records: ' + error.message, 'error');
            return [];
        }
    }

    // ============================================================
    // PURCHASE FUNCTIONS (abbreviated for space)
    // ============================================================

    async function loadPurchasesTable() {
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/inventory-purchases', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to load purchases');

            const purchases = data.purchases || [];
            if (!purchasesBody) return;

            const badge = document.getElementById('purchase-table-badge');
            if (badge) {
                badge.textContent = '(' + purchases.length + ' total)';
            }

            if (purchases.length === 0) {
                purchasesBody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999;">No purchases found. Click "New" to create one.</td></tr>';
                populateDefaultPurchaseDropdown();
                return;
            }

            let html = '';
            purchases.forEach(p => {
                const isSelected = (p.id == state.selectedPurchaseId);
                html += `<tr class="${isSelected ? 'record-selected' : ''}" data-id="${p.id}">`;
                html += `<td>${p.id}</td>`;
                html += `<td>${escapeHtml(p.seller_name)}</td>`;
                html += `<td><span class="status-badge ${p.status === 'complete' ? 'paid' : 'draft'}">${p.status}</span></td>`;
                html += `<td>${p.record_count || 0}</td>`;
                html += `<td>${p.amount_spent && p.amount_spent > 0 ? '$' + p.amount_spent.toFixed(2) : '—'}</td>`;
                html += `<td>${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>`;
                html += `<td>${p.bill_of_sale_path ? '<i class="fas fa-file-pdf" style="color:#28a745;"></i>' : '<i class="fas fa-times" style="color:#999;"></i>'}</td>`;
                html += `<td><button class="btn btn-sm btn-danger" onclick="deletePurchase(${p.id})"><i class="fas fa-trash"></i></button></td>`;
                html += `</tr>`;
            });
            purchasesBody.innerHTML = html;

            populateDefaultPurchaseDropdown();

            if (state.selectedPurchaseId) {
                const row = purchasesBody.querySelector(`tr[data-id="${state.selectedPurchaseId}"]`);
                if (row) row.classList.add('record-selected');

                if (currentPurchaseDisplay) {
                    currentPurchaseDisplay.style.display = 'block';
                    const sellerName = row?.querySelector('td:nth-child(2)')?.textContent || 'Unknown';
                    if (currentPurchaseName) currentPurchaseName.textContent = sellerName;
                    if (currentPurchaseIdSpan) currentPurchaseIdSpan.textContent = '(#' + state.selectedPurchaseId + ')';
                }
            } else {
                if (currentPurchaseDisplay) currentPurchaseDisplay.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading purchases:', error);
            showStatus('Error loading purchases: ' + error.message, 'error');
        }
    }

    async function selectPurchase(id) {
        state.selectedPurchaseId = id;
        await loadPurchasesTable();

        if (metadataPanel) metadataPanel.style.display = 'block';
        if (purchaseIdDisplay) purchaseIdDisplay.textContent = '#' + id;

        if (currentPurchaseDisplay) {
            currentPurchaseDisplay.style.display = 'block';
            const row = document.querySelector(`#purchases-body tr[data-id="${id}"]`);
            if (row) {
                const sellerName = row.querySelector('td:nth-child(2)')?.textContent || 'Unknown';
                if (currentPurchaseName) currentPurchaseName.textContent = sellerName;
                if (currentPurchaseIdSpan) currentPurchaseIdSpan.textContent = '(#' + id + ')';
            }
        }

        if (defaultPurchaseSelect) defaultPurchaseSelect.value = id;

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + id, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success' || !data.purchase) throw new Error(data.error || 'Purchase not found');

            const purchase = data.purchase;
            if (editPurchaseId) editPurchaseId.value = purchase.id;
            if (editSellerName) editSellerName.value = purchase.seller_name || '';
            if (editSellerContact) editSellerContact.value = purchase.seller_contact || '';
            if (editDescription) editDescription.value = purchase.description || '';
            if (editStatus) editStatus.value = purchase.status || 'draft';

            const billPath = purchase.bill_of_sale_path;
            if (editBillPreview) {
                if (billPath) {
                    const fullUrl = window.AppConfig.baseUrl + '/' + billPath.replace(/^\/+/, '');
                    if (billPath.toLowerCase().endsWith('.pdf')) {
                        editBillPreview.innerHTML = `<a href="${fullUrl}" target="_blank"><i class="fas fa-file-pdf"></i> View PDF</a>`;
                    } else {
                        editBillPreview.innerHTML = `<img src="${fullUrl}" style="max-height:100px;border-radius:4px;border:1px solid #ddd;">`;
                    }
                } else {
                    editBillPreview.innerHTML = '<span style="color:#999;">No bill uploaded</span>';
                }
            }

            if (editBillUpload) editBillUpload.value = '';

            if (acceptDraftBtn) {
                acceptDraftBtn.style.display = (purchase.status === 'draft' && purchase.record_count > 0) ? 'inline-block' : 'none';
            }

            if (deletePurchaseBtn) {
                deletePurchaseBtn.disabled = (purchase.status === 'complete');
            }

            await loadRecordsForPurchase(id);
            showStatus('Selected purchase: ' + purchase.seller_name + ' (' + (purchase.record_count || 0) + ' records)', 'info');

        } catch (error) {
            console.error('Error loading purchase metadata:', error);
            showStatus('Error loading purchase: ' + error.message, 'error');
        }
    }

    async function loadRecordsForPurchase(purchaseId) {
        try {
            await loadRecords({
                batchId: purchaseId,
                excludeBatch: false,
                mode: 'add',
                bypassDateFilter: true
            });
            state.currentPurchaseRecords = state.filteredRecords.slice();
            await loadPurchasesTable();
        } catch (error) {
            console.error('Error loading records for purchase:', error);
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPurchaseRecords = [];
            render();
        }
    }

    // ============================================================
    // DISCOGS ORDERS
    // ============================================================

    async function loadDiscogsOrdersList(status, dateFrom, dateTo, search) {
        try {
            let url = window.AppConfig.baseUrl + '/api/discogs/orders?per_page=200';
            if (status && status !== '') url += '&status=' + encodeURIComponent(status);
            if (dateFrom) url += '&date_from=' + encodeURIComponent(dateFrom);
            if (dateTo) url += '&date_to=' + encodeURIComponent(dateTo);
            if (search && search.trim() !== '') url += '&search=' + encodeURIComponent(search.trim());
            url += '&all=true';

            const response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });

            if (!response.ok) {
                let errorMsg = 'HTTP ' + response.status;
                try {
                    const errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                } catch (e) {}
                throw new Error(errorMsg);
            }

            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to load orders');

            state.ordersList = data.orders || [];
            state.ordersList.sort(function(a, b) {
                return new Date(b.created_at) - new Date(a.created_at);
            });

            if (discogsOrderSelect) {
                discogsOrderSelect.innerHTML = '<option value="">-- Select an order --</option>';
                for (let i = 0; i < state.ordersList.length; i++) {
                    const order = state.ordersList[i];
                    const option = document.createElement('option');
                    option.value = order.order_id || order.id;
                    const buyer = order.buyer_username || order.buyer_name || 'Unknown buyer';
                    const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '';
                    const total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '';
                    const itemCount = order.items ? order.items.length : 0;
                    option.textContent = order.order_id + ' - ' + buyer + ' ' + date + ' ' + total + ' (' + itemCount + ' items)';
                    discogsOrderSelect.appendChild(option);
                }
            }

            updateDiscogsOrdersStatus('✅ Loaded ' + state.ordersList.length + ' orders', 'success');

        } catch (error) {
            console.error('❌ Error loading orders:', error);
            updateDiscogsOrdersStatus('❌ Error: ' + error.message, 'error');
        }
    }

    // ============================================================
    // IMAGE EXPAND
    // ============================================================

    window.expandImage = function(imageUrl, title) {
        if (!imageUrl) return;

        const existingModal = document.getElementById('image-expand-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'image-expand-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.style.background = 'rgba(0,0,0,0.85)';
        modal.style.zIndex = '10000';
        modal.innerHTML = '<div style="max-width: 90vw; max-height: 90vh; position: relative; display: flex; flex-direction: column; align-items: center;"><button onclick="document.getElementById(\'image-expand-modal\').remove()" style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 24px; cursor: pointer; z-index: 10;">×</button>' + (title ? '<div style="color: white; font-size: 16px; padding: 10px; text-align: center; background: rgba(0,0,0,0.5); border-radius: 8px; margin-bottom: 10px; max-width: 100%;">' + escapeHtml(title) + '</div>' : '') + '<img src="' + escapeHtml(imageUrl) + '" style="max-width: 90vw; max-height: 80vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 30px rgba(0,0,0,0.5);"><div style="color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 10px;">Click outside to close</div></div>';
        document.body.appendChild(modal);

        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.remove();
        });

        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                if (document.getElementById('image-expand-modal')) {
                    document.getElementById('image-expand-modal').remove();
                }
                document.removeEventListener('keydown', escHandler);
            }
        });
    };

    // ============================================================
    // TOGGLE FUNCTIONS
    // ============================================================

    function toggleInventorySetupPanel() {
        const body = document.getElementById('inventory-setup-body');
        const icon = document.getElementById('inventory-setup-toggle-icon');
        if (!body || !icon) return;
        if (body.classList.contains('expanded')) {
            body.classList.remove('expanded');
            body.style.display = 'none';
            icon.classList.add('collapsed');
        } else {
            body.classList.add('expanded');
            body.style.display = 'block';
            icon.classList.remove('collapsed');
        }
    }

    function toggleDefaultParamsSub() {
        const body = document.getElementById('default-params-sub-body');
        const icon = document.getElementById('default-params-sub-toggle');
        if (!body || !icon) return;
        if (body.classList.contains('expanded')) {
            body.classList.remove('expanded');
            body.style.display = 'none';
            icon.classList.add('collapsed');
        } else {
            body.classList.add('expanded');
            body.style.display = 'block';
            icon.classList.remove('collapsed');
        }
    }

    function togglePurchaseTable() {
        const body = document.getElementById('purchase-table-body');
        const icon = document.getElementById('purchase-table-toggle-icon');
        if (!body || !icon) return;
        if (body.classList.contains('expanded')) {
            body.classList.remove('expanded');
            body.style.display = 'none';
            icon.classList.add('collapsed');
        } else {
            body.classList.add('expanded');
            body.style.display = 'block';
            icon.classList.remove('collapsed');
        }
    }

    function toggleMetadataPanel() {
        const body = document.getElementById('metadata-body');
        const icon = document.getElementById('metadata-toggle-icon');
        if (!body || !icon) return;
        if (body.style.display === 'none' || body.style.display === '') {
            body.style.display = 'block';
            icon.style.transform = 'rotate(0deg)';
        } else {
            body.style.display = 'none';
            icon.style.transform = 'rotate(-90deg)';
        }
    }

    function toggleMarkupRules() {
        const content = document.getElementById('markup-rules-content');
        const icon = document.getElementById('markup-rules-toggle-icon');
        if (!content || !icon) return;
        if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
            loadMarkupRules();
        } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
        }
    }

    function toggleMarkupCharts() {
        const content = document.getElementById('markup-charts-content');
        const icon = document.getElementById('markup-charts-toggle-icon');
        if (!content || !icon) return;
        if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
            setTimeout(loadMarkupAnalysisCharts, 300);
        } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
        }
    }

    // ============================================================
    // MARKUP RULES
    // ============================================================

    async function loadMarkupRules() {
        try {
            const data = await apiRequest('GET', '/api/markup-rules');
            if (data.status === 'success') {
                renderMarkupRules(data.rules);
            }
        } catch (error) {
            console.error('Error loading markup rules:', error);
        }
    }

    function renderMarkupRules(rules) {
        const tbody = document.getElementById('markup-rules-body');
        if (!tbody) return;
        if (!rules || rules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 30px; text-align: center; color: #999;">⚠️ No rules configured. Add your first rule above.</td></tr>';
            return;
        }
        rules.sort(function(a, b) { return a.days_old - b.days_old; });
        let html = '';
        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            html += '<tr style="border-bottom: 1px solid #dee2e6;">';
            html += '<td style="padding: 12px;">' + rule.days_old + '+ days</td>';
            html += '<td style="padding: 12px;"><input type="number" id="rule-percent-' + rule.id + '" value="' + rule.markup_percent + '" step="1" style="width: 80px; padding: 6px; border: 1px solid #ddd; border-radius: 4px;"><span>%</span></td>';
            html += '<td style="padding: 12px;"><input type="text" id="rule-desc-' + rule.id + '" value="' + escapeHtml(rule.description || '') + '" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;"></td>';
            html += '<td style="padding: 12px;">';
            html += '<button class="btn btn-sm btn-info" onclick="updateMarkupRule(' + rule.id + ')" style="padding: 4px 8px; margin-right: 5px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-save"></i></button> ';
            html += '<button class="btn btn-sm btn-danger" onclick="deleteMarkupRule(' + rule.id + ')" style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i></button>';
            html += '</td>';
            html += '</tr>';
        }
        tbody.innerHTML = html;
    }

    window.addMarkupRule = async function() {
        const daysInput = document.getElementById('new-rule-days');
        const percentInput = document.getElementById('new-rule-percent');
        const descInput = document.getElementById('new-rule-desc');
        if (!daysInput || !percentInput || !descInput) return;
        const days_old = parseInt(daysInput.value);
        const markup_percent = parseFloat(percentInput.value);
        const description = descInput.value;
        if (isNaN(days_old) || isNaN(markup_percent)) {
            showDiscogsStatus('Please enter valid days and percentage', 'error');
            return;
        }
        try {
            const result = await apiRequest('POST', '/api/markup-rules', {
                days_old: days_old,
                markup_percent: markup_percent,
                description: description
            });
            if (result.status === 'success') {
                showDiscogsStatus('Markup rule added successfully', 'success');
                daysInput.value = '';
                percentInput.value = '';
                descInput.value = '';
                loadMarkupRules();
                refreshDiscogsRecords();
            } else {
                showDiscogsStatus('Error: ' + (result.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    };

    window.updateMarkupRule = async function(ruleId) {
        const percentInput = document.getElementById('rule-percent-' + ruleId);
        const descInput = document.getElementById('rule-desc-' + ruleId);
        if (!percentInput || !descInput) return;
        const markup_percent = parseFloat(percentInput.value);
        const description = descInput.value;
        if (isNaN(markup_percent)) {
            showDiscogsStatus('Please enter a valid percentage', 'error');
            return;
        }
        try {
            const result = await apiRequest('PUT', '/api/markup-rules/' + ruleId, {
                markup_percent: markup_percent,
                description: description
            });
            if (result.status === 'success') {
                showDiscogsStatus('Markup rule updated successfully', 'success');
                loadMarkupRules();
                refreshDiscogsRecords();
            } else {
                showDiscogsStatus('Error: ' + (result.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    };

    window.deleteMarkupRule = async function(ruleId) {
        if (!confirm('Are you sure you want to delete this markup rule?')) return;
        try {
            const result = await apiRequest('DELETE', '/api/markup-rules/' + ruleId);
            if (result.status === 'success') {
                showDiscogsStatus('Markup rule deleted successfully', 'success');
                loadMarkupRules();
                refreshDiscogsRecords();
            } else {
                showDiscogsStatus('Error: ' + (result.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    };

    // ============================================================
    // MARKUP ANALYSIS CHARTS
    // ============================================================

    async function loadMarkupAnalysisCharts() {
        try {
            const cutoffInput = document.getElementById('last-seen-cutoff-date');
            let cutoff = '';
            if (cutoffInput && cutoffInput.value) {
                cutoff = cutoffInput.value;
            }
            const url = window.AppConfig.baseUrl + '/api/markup-analysis' + (cutoff ? '?cutoff=' + cutoff : '');
            const response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (!response.ok) throw new Error('Failed to load markup analysis data');
            const data = await response.json();
            if (data.status === 'success') {
                renderMarkupCurveChart(data);
                renderMarkupDistributionChart(data);
                renderAgeDistributionChart(data);
                const countEl = document.getElementById('chart-record-count');
                if (countEl) {
                    countEl.textContent = '📊 ' + (data.active_records_count || 0) + ' active records analyzed (cutoff: ' + (data.cutoff_date || 'N/A') + ') | ' + (data.rules_count || 0) + ' markup rules applied';
                }
            } else {
                console.error('Error loading markup analysis:', data.error);
                showDiscogsStatus('Error loading markup charts: ' + (data.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Error loading markup analysis:', error);
            showDiscogsStatus('Error loading markup charts: ' + error.message, 'error');
        }
    }

    function renderMarkupCurveChart(data) {
        const canvas = document.getElementById('markup-curve-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (state.markupCurveChart) { state.markupCurveChart.destroy();
            state.markupCurveChart = null; }
        const points = data.curve_points || [];
        if (points.length === 0) {
            state.markupCurveChart = new Chart(ctx, {
                type: 'line',
                data: { labels: ['No Data'], datasets: [{ label: 'Markup %', data: [0], borderColor: '#ccc', backgroundColor: 'rgba(200,200,200,0.1)', borderWidth: 2, pointRadius: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        const days = points.map(function(p) { return p.days; });
        const markups = points.map(function(p) { return p.markup_percent; });
        const minMarkup = Math.min.apply(null, markups);
        const maxMarkup = Math.max.apply(null, markups);
        const yPadding = Math.max(5, Math.abs(maxMarkup - minMarkup) * 0.1);
        const xMax = data.chart_max_days || Math.max.apply(null, days);
        let xStepSize = 30;
        if (xMax > 730) xStepSize = 90;
        else if (xMax > 365) xStepSize = 60;

        state.markupCurveChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: days,
                datasets: [{
                    label: 'Markup %',
                    data: markups,
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0,123,255,0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Markup: ' + context.parsed.y + '% at ' + context.parsed.x + ' days';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        min: 0,
                        max: xMax,
                        title: { display: true, text: 'Days Since Created' },
                        ticks: {
                            stepSize: xStepSize,
                            callback: function(value) {
                                if (value === 0) return '0';
                                if (value === 365) return '365d';
                                return value + 'd';
                            }
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    y: {
                        min: minMarkup - yPadding,
                        max: maxMarkup + yPadding,
                        title: { display: true, text: 'Markup %' },
                        ticks: { callback: function(value) { return value + '%'; }, stepSize: 5 },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    }
                }
            }
        });
    }

    function renderMarkupDistributionChart(data) {
        const canvas = document.getElementById('markup-distribution-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (state.markupDistributionChart) { state.markupDistributionChart.destroy();
            state.markupDistributionChart = null; }
        const distribution = data.distribution || {};
        if (Object.keys(distribution).length === 0) {
            state.markupDistributionChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: ['No Data'], datasets: [{ label: 'Records', data: [0], backgroundColor: ['#ccc'], borderColor: ['#999'], borderWidth: 1 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        const sortedKeys = Object.keys(distribution).sort(function(a, b) { return parseFloat(a) - parseFloat(b); });
        const labels = sortedKeys;
        const counts = sortedKeys.map(function(key) { return distribution[key]; });
        const totalRecords = data.active_records_count || 0;
        const colors = labels.map(function(label) {
            const value = parseFloat(label);
            if (value > 0) return 'rgba(40,167,69,0.8)';
            if (value < 0) return 'rgba(220,53,69,0.8)';
            return 'rgba(255,193,7,0.8)';
        });

        state.markupDistributionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Records',
                    data: counts,
                    backgroundColor: colors,
                    borderColor: colors.map(function(c) { return c.replace('0.8', '1'); }),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const count = context.parsed.y;
                                const pct = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0;
                                return count + ' records (' + pct + '%)';
                            }
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Markup %' }, ticks: { maxRotation: 45, minRotation: 45 } },
                    y: { title: { display: true, text: 'Number of Records' }, beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    function renderAgeDistributionChart(data) {
        const canvas = document.getElementById('age-distribution-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (state.ageDistributionChart) { state.ageDistributionChart.destroy();
            state.ageDistributionChart = null; }
        const ageData = data.age_distribution || {};
        if (Object.keys(ageData).length === 0) {
            state.ageDistributionChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: ['No Data'], datasets: [{ label: 'Records', data: [0], backgroundColor: ['#ccc'], borderColor: ['#999'], borderWidth: 1 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        const sortedKeys = Object.keys(ageData).sort(function(a, b) { return parseInt(a) - parseInt(b); });
        const labels = sortedKeys.map(function(key) {
            const parts = key.split('-');
            if (parts.length === 2) return parts[0] + '-' + parts[1] + 'd';
            return key + 'd';
        });
        const counts = sortedKeys.map(function(key) { return ageData[key]; });
        const totalRecords = data.active_records_count || 0;
        const colors = sortedKeys.map(function(_, index) {
            return 'rgba(23,162,184,' + (0.6 + (index / sortedKeys.length) * 0.3) + ')';
        });

        state.ageDistributionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Records',
                    data: counts,
                    backgroundColor: colors,
                    borderColor: 'rgba(23,162,184,1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const count = context.parsed.y;
                                const pct = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0;
                                return count + ' records (' + pct + '%)';
                            }
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Age Cohort (days)' }, ticks: { maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 10 } },
                    y: { title: { display: true, text: 'Number of Records' }, beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
                }
            }
        });
        const statsEl = document.getElementById('age-chart-stats');
        if (statsEl && data.age_stats) {
            statsEl.textContent = '| Avg: ' + data.age_stats.avg_days + 'd | Min: ' + data.age_stats.min_days + ' | Max: ' + data.age_stats.max_days;
        }
    }

    // ============================================================
    // MODE CHANGE
    // ============================================================

    function setActiveMode(mode) {
        Object.values(modeContainers).forEach(container => {
            if (container) container.style.display = 'none';
        });
        const activeContainer = modeContainers[mode];
        if (activeContainer) {
            activeContainer.style.display = 'block';
        }
    }

    function onModeChange() {
        const newMode = searchModeSelect.value;
        state.currentSearchMode = newMode;

        clearSelection();
        setActiveMode(newMode);

        if (newMode !== 'add') {
            if (state.selectedPurchaseId) {
                clearPurchaseSelection();
            }
            if (metadataPanel) metadataPanel.style.display = 'none';
        }

        if (newMode === 'add') {
            state.currentMode = 'inventory';
            state.currentResults = [];
            populateDefaultParamSelects();
            loadPurchasesTable();
            if (!state.selectedPurchaseId) {
                clearPurchaseSelection();
            }
        } else if (newMode === 'scan') {
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            showStatus('Scan mode: Select a location and scan barcodes to build the list.', 'info');
            resetScanCounter();
            loadLocations();
            updateScanLocationPreview();
        } else if (newMode === 'discogs') {
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            showDiscogsStatus('Showing all records. Use filters to narrow down.', 'info');
            loadRecords({ showAllStatuses: true, mode: 'discogs' });
            loadDiscogsLocations();
            const rulesContent = document.getElementById('markup-rules-content');
            if (rulesContent && rulesContent.style.display === 'block') {
                loadMarkupRules();
            }
            const chartsContent = document.getElementById('markup-charts-content');
            if (chartsContent && chartsContent.style.display === 'block') {
                setTimeout(loadMarkupAnalysisCharts, 300);
            }
            if (lastSeenCutoffDateInput) {
                lastSeenCutoffDateInput.value = '';
                state.lastSeenCutoffDate = null;
            }
        } else if (newMode === 'discogs_orders') {
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            showStatus('Discogs Orders mode: Select an order to fulfill.', 'info');

            const dateFrom = document.getElementById('discogs-orders-date-from');
            const dateTo = document.getElementById('discogs-orders-date-to');
            if (dateFrom && !dateFrom.value) {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                dateFrom.value = thirtyDaysAgo.toISOString().split('T')[0];
            }
            if (dateTo && !dateTo.value) {
                dateTo.value = new Date().toISOString().split('T')[0];
            }

            const search = document.getElementById('discogs-orders-search');
            if (search) search.value = '';

            const statusFilter = document.getElementById('discogs-orders-status-filter');
            if (statusFilter) statusFilter.value = 'Payment Received';

            applyDiscogsOrdersFilters();

            if (discogsOrderSelect) discogsOrderSelect.value = '';
            state.selectedOrderId = null;
            state.currentOrderItems = [];
        }

        updateSelectionCount();
        render();
    }

    // ============================================================
    // DISCOGS LOCATIONS
    // ============================================================

    async function loadDiscogsLocations() {
        try {
            const data = await apiRequest('GET', '/api/locations');
            if (data.status === 'success') {
                renderDiscogsLocationSelect(data.locations);
            } else {
                throw new Error(data.error || 'Failed to load locations');
            }
        } catch (error) {
            console.error('Error loading locations:', error);
            renderDiscogsLocationSelect([]);
            showDiscogsStatus('Warning: Could not load locations - ' + error.message, 'warning');
        }
    }

    function renderDiscogsLocationSelect(locations) {
        if (!discogsLocationSelect) return;
        discogsLocationSelect.innerHTML = '<option value="all">-- All (no filter) --</option><option value="all_with_location">-- All with Location --</option>';
        if (!locations || locations.length === 0) return;
        locations.forEach(function(location) {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            discogsLocationSelect.appendChild(option);
        });
    }

    function refreshDiscogsRecords() {
        const selectedValue = discogsLocationSelect ? discogsLocationSelect.value : null;
        if (!selectedValue || selectedValue === 'all') {
            loadRecords({ showAllStatuses: true, mode: 'discogs' });
        } else if (selectedValue === 'all_with_location') {
            loadRecords({ showAllStatuses: true, requireLocation: true, mode: 'discogs' });
        } else {
            loadRecords({ showAllStatuses: true, location: selectedValue, mode: 'discogs' });
        }
    }

    // ============================================================
    // DEFAULT PARAMETERS
    // ============================================================

    function populateDefaultParamSelects() {
        if (defaultSleeveSelect) {
            const currentVal = defaultSleeveSelect.value;
            defaultSleeveSelect.innerHTML = '<option value="">Select...</option>';
            state.conditions.forEach(function(c) {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.display_name || c.condition_name;
                defaultSleeveSelect.appendChild(opt);
            });
            if (currentVal) defaultSleeveSelect.value = currentVal;
        }
        if (defaultDiscSelect) {
            const currentVal = defaultDiscSelect.value;
            defaultDiscSelect.innerHTML = '<option value="">Select...</option>';
            state.conditions.forEach(function(c) {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.display_name || c.condition_name;
                defaultDiscSelect.appendChild(opt);
            });
            if (currentVal) defaultDiscSelect.value = currentVal;
        }
        if (defaultConsignorSelect) {
            const currentVal = defaultConsignorSelect.value;
            defaultConsignorSelect.innerHTML = '<option value="">None</option>';
            state.consignors.forEach(function(c) {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.username + (c.full_name ? ' (' + c.full_name + ')' : '');
                defaultConsignorSelect.appendChild(opt);
            });
            if (currentVal) defaultConsignorSelect.value = currentVal;
        }
        if (defaultFormatSelect) {
            const currentVal = defaultFormatSelect.value;
            defaultFormatSelect.innerHTML = '<option value="">Select...</option>';
            state.formats.forEach(function(f) {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.name;
                defaultFormatSelect.appendChild(opt);
            });
            if (currentVal) defaultFormatSelect.value = currentVal;
        }
        loadDefaultParamsFromStorage();
    }

    function loadDefaultParamsFromStorage() {
        try {
            const stored = localStorage.getItem('defaultParams');
            if (stored) {
                const params = JSON.parse(stored);
                if (params.sleeveConditionId && defaultSleeveSelect) {
                    defaultSleeveSelect.value = params.sleeveConditionId;
                }
                if (params.discConditionId && defaultDiscSelect) {
                    defaultDiscSelect.value = params.discConditionId;
                }
                if (params.price && defaultPriceInput) {
                    defaultPriceInput.value = params.price;
                }
                if (params.consignorId && defaultConsignorSelect) {
                    defaultConsignorSelect.value = params.consignorId;
                }
                if (params.formatId && defaultFormatSelect) {
                    defaultFormatSelect.value = params.formatId;
                }
                if (params.purchaseId && defaultPurchaseSelect) {
                    defaultPurchaseSelect.value = params.purchaseId;
                }
                state.defaultParams = params;
                state.defaultParamsActive = true;
            }
        } catch (e) {
            console.warn('Could not load default params from storage:', e);
        }
    }

    function saveDefaultParamsToStorage() {
        try {
            localStorage.setItem('defaultParams', JSON.stringify(state.defaultParams));
        } catch (e) {
            console.warn('Could not save default params to storage:', e);
        }
    }

    function applyDefaultParams() {
        const sleeveId = defaultSleeveSelect ? parseInt(defaultSleeveSelect.value) : null;
        const discId = defaultDiscSelect ? parseInt(defaultDiscSelect.value) : null;
        const price = defaultPriceInput ? parseFloat(defaultPriceInput.value) : null;
        const consignorId = defaultConsignorSelect ? parseInt(defaultConsignorSelect.value) : null;
        const formatId = defaultFormatSelect ? parseInt(defaultFormatSelect.value) : null;
        const purchaseId = defaultPurchaseSelect ? parseInt(defaultPurchaseSelect.value) : null;

        state.defaultParams = {
            sleeveConditionId: sleeveId || null,
            discConditionId: discId || null,
            price: price || null,
            consignorId: consignorId || null,
            formatId: formatId || null,
            purchaseId: purchaseId || null
        };
        state.defaultParamsActive = true;
        saveDefaultParamsToStorage();

        if (purchaseId) {
            selectPurchase(purchaseId);
        }

        const rows = document.querySelectorAll('.btn-add-record-from-search');
        if (rows.length === 0) {
            updateDefaultParamsStatus('No search results to apply defaults to', 'warning');
            return;
        }

        rows.forEach(function(btn) {
            const row = btn.closest('tr');
            if (!row) return;
            const sleeveSelect = row.querySelector('.sleeve-condition-select');
            const discSelect = row.querySelector('.disc-condition-select');
            const priceInput = row.querySelector('.price-input');
            const consignorSelect = row.querySelector('.consignor-select');
            const formatSelect = row.querySelector('.format-select');

            if (sleeveSelect && state.defaultParams.sleeveConditionId) sleeveSelect.value = state.defaultParams.sleeveConditionId;
            if (discSelect && state.defaultParams.discConditionId) discSelect.value = state.defaultParams.discConditionId;
            if (priceInput && state.defaultParams.price) priceInput.value = state.defaultParams.price;
            if (consignorSelect && state.defaultParams.consignorId) consignorSelect.value = state.defaultParams.consignorId;
            if (formatSelect && state.defaultParams.formatId) formatSelect.value = state.defaultParams.formatId;
        });

        updateDefaultParamsStatus('Defaults applied to ' + rows.length + ' search results', 'success');
        render();
    }

    function clearDefaultParams() {
        state.defaultParams = {
            sleeveConditionId: null,
            discConditionId: null,
            price: null,
            consignorId: null,
            formatId: null,
            purchaseId: null
        };
        state.defaultParamsActive = false;
        if (defaultSleeveSelect) defaultSleeveSelect.value = '';
        if (defaultDiscSelect) defaultDiscSelect.value = '';
        if (defaultPriceInput) defaultPriceInput.value = '';
        if (defaultConsignorSelect) defaultConsignorSelect.value = '';
        if (defaultFormatSelect) defaultFormatSelect.value = '';
        if (defaultPurchaseSelect) defaultPurchaseSelect.value = '';
        localStorage.removeItem('defaultParams');
        updateDefaultParamsStatus('Defaults cleared', 'info');
        render();
    }

    function updateDefaultParamsStatus(message, type) {
        const el = document.getElementById('default-params-status');
        if (!el) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        el.className = 'status-message status-' + type;
        el.style.display = 'block';
        setTimeout(function() { if (el) el.style.display = 'none'; }, 5000);
    }

    function populateDefaultPurchaseDropdown() {
        if (!defaultPurchaseSelect) return;
        const currentVal = defaultPurchaseSelect.value;
        defaultPurchaseSelect.innerHTML = '<option value="">Select a purchase...</option>';

        const purchaseRows = document.querySelectorAll('#purchases-body tr');
        if (purchaseRows.length === 0) return;

        purchaseRows.forEach(function(row) {
            const id = row.dataset.id;
            if (!id) return;
            const sellerName = row.querySelector('td:nth-child(2)')?.textContent || 'Unknown';
            const statusEl = row.querySelector('.status-badge');
            const status = statusEl ? statusEl.textContent : 'draft';
            const option = document.createElement('option');
            option.value = id;
            option.textContent = '#' + id + ' - ' + sellerName + ' (' + status + ')';
            defaultPurchaseSelect.appendChild(option);
        });

        if (currentVal) defaultPurchaseSelect.value = currentVal;
    }

    // ============================================================
    // PURCHASE HELPER FUNCTIONS
    // ============================================================

    function clearPurchaseSelection() {
        state.selectedPurchaseId = null;
        if (metadataPanel) metadataPanel.style.display = 'none';
        if (currentPurchaseDisplay) currentPurchaseDisplay.style.display = 'none';
        if (defaultPurchaseSelect) defaultPurchaseSelect.value = '';
        loadPurchasesTable();
        state.filteredRecords = [];
        state.totalRecords = 0;
        state.currentPurchaseRecords = [];
        render();
        showStatus('Purchase deselected.', 'info');
    }

    async function createNewPurchase() {
        const sellerName = prompt('Enter seller name:');
        if (!sellerName) return;
        const contact = prompt('Enter contact (phone/email) [optional]:') || '';
        const description = prompt('Enter description [optional]:') || '';

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seller_name: sellerName, seller_contact: contact, description: description })
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to create purchase');

            showStatus('✅ New purchase created.', 'success');
            await loadPurchasesTable();
            if (data.id) {
                await selectPurchase(data.id);
            }
        } catch (error) {
            showStatus('Error creating purchase: ' + error.message, 'error');
        }
    }

    async function deletePurchase(id) {
        if (!confirm('Are you sure you want to delete purchase #' + id + ' and all its linked records? This cannot be undone.')) return;

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + id, {
                method: 'DELETE',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Delete failed');

            showStatus('✅ Purchase deleted.', 'success');
            if (state.selectedPurchaseId == id) {
                state.selectedPurchaseId = null;
                if (metadataPanel) metadataPanel.style.display = 'none';
                if (currentPurchaseDisplay) currentPurchaseDisplay.style.display = 'none';
                state.filteredRecords = [];
                state.totalRecords = 0;
                state.currentPurchaseRecords = [];
                render();
            }
            await loadPurchasesTable();
        } catch (error) {
            showStatus('Error deleting purchase: ' + error.message, 'error');
            console.error('Delete error:', error);
        }
    }

    async function savePurchaseMetadata() {
        const id = editPurchaseId ? editPurchaseId.value : null;
        if (!id) { showStatus('No purchase selected.', 'error'); return; }

        const sellerName = editSellerName ? editSellerName.value.trim() : '';
        const sellerContact = editSellerContact ? editSellerContact.value.trim() : '';
        const description = editDescription ? editDescription.value.trim() : '';
        const status = editStatus ? editStatus.value : 'draft';

        if (!sellerName) {
            showStatus('Seller name is required.', 'error');
            return;
        }

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + id, {
                method: 'PUT',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seller_name: sellerName, seller_contact: sellerContact, description, status })
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to update');

            showStatus('✅ Purchase metadata updated.', 'success');
            await loadPurchasesTable();
            await selectPurchase(parseInt(id));
        } catch (error) {
            showStatus('Error updating purchase: ' + error.message, 'error');
        }
    }

    async function uploadBillForPurchase() {
        if (!editBillUpload) return;
        const file = editBillUpload.files[0];
        if (!file) return;

        const id = editPurchaseId ? editPurchaseId.value : null;
        if (!id) { showStatus('No purchase selected.', 'error'); return; }

        const formData = new FormData();
        formData.append('bill_image', file);
        formData.append('purchase_id', id);

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + id + '/bill', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Upload failed');

            showStatus('✅ Bill uploaded successfully.', 'success');
            await selectPurchase(parseInt(id));
            if (editBillUpload) editBillUpload.value = '';
        } catch (error) {
            showStatus('Error uploading bill: ' + error.message, 'error');
        }
    }

    async function removeRecordFromPurchase(recordId) {
        if (!state.selectedPurchaseId) {
            showStatus('No purchase selected.', 'error');
            return;
        }
        if (!confirm('Remove this record from the purchase? The record will still exist but will no longer be linked to purchase #' + state.selectedPurchaseId + '.')) {
            return;
        }
        try {
            await apiRequest('PUT', '/records/' + recordId, { batch_id: null });
            showStatus('✅ Record removed from purchase.', 'success');
            await loadRecordsForPurchase(state.selectedPurchaseId);
            await loadPurchasesTable();
        } catch (error) {
            showStatus('Error removing record: ' + error.message, 'error');
        }
    }

    // ============================================================
    // DISCOGS ORDERS FILTERS
    // ============================================================

    async function applyDiscogsOrdersFilters() {
        const status = document.getElementById('discogs-orders-status-filter')?.value || '';
        const dateFrom = document.getElementById('discogs-orders-date-from')?.value || '';
        const dateTo = document.getElementById('discogs-orders-date-to')?.value || '';
        const search = document.getElementById('discogs-orders-search')?.value || '';

        await loadDiscogsOrdersList(status, dateFrom, dateTo, search);

        if (discogsOrderSelect) {
            discogsOrderSelect.value = '';
        }
        state.selectedOrderId = null;
        state.currentOrderItems = [];
        state.filteredRecords = [];
        state.totalRecords = 0;
        state.currentPage = 1;
        render();
    }

    function refreshDiscogsOrders() {
        const dateFrom = document.getElementById('discogs-orders-date-from');
        const dateTo = document.getElementById('discogs-orders-date-to');
        const search = document.getElementById('discogs-orders-search');

        if (!dateFrom.value) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            dateFrom.value = thirtyDaysAgo.toISOString().split('T')[0];
        }
        if (!dateTo.value) {
            dateTo.value = new Date().toISOString().split('T')[0];
        }
        if (search) search.value = '';

        applyDiscogsOrdersFilters();
    }

    async function loadOrderItems(orderId) {
        if (!orderId) {
            state.currentOrderItems = [];
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            return;
        }

        try {
            const url = window.AppConfig.baseUrl + '/api/discogs/orders/' + orderId;
            const response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });

            if (!response.ok) {
                let errorMsg = 'HTTP ' + response.status;
                try {
                    const errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                } catch (e) {}
                throw new Error(errorMsg);
            }

            const data = await response.json();
            if (data.status !== 'success' || !data.order) {
                throw new Error(data.error || 'Failed to load order details');
            }

            const order = data.order;
            const items = order.items || [];

            const enrichedItems = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                let pigstyleId = null;

                if (item.condition_comments) {
                    const match = item.condition_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                    if (match) pigstyleId = parseInt(match[1], 10);
                }
                if (!pigstyleId && item.private_comments) {
                    const match = item.private_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                    if (match) pigstyleId = parseInt(match[1], 10);
                }
                if (!pigstyleId && item.release_description) {
                    const match = item.release_description.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                    if (match) pigstyleId = parseInt(match[1], 10);
                }

                let record = null;
                let recordStatus = null;
                let barcode = null;
                let catalog = null;
                if (pigstyleId) {
                    try {
                        const recRes = await fetch(window.AppConfig.baseUrl + '/records/' + pigstyleId, {
                            credentials: 'include',
                            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
                        });
                        if (recRes.ok) {
                            const recData = await recRes.json();
                            record = recData;
                            recordStatus = recData.status_id;
                            barcode = recData.barcode || null;
                            catalog = recData.catalog_number || null;
                        } else {
                            recordStatus = null;
                        }
                    } catch (e) {
                        console.warn('Could not fetch record ' + pigstyleId + ':', e);
                        recordStatus = null;
                    }
                }

                enrichedItems.push({
                    ...item,
                    pigstyle_id: pigstyleId,
                    record: record,
                    record_status_id: recordStatus,
                    barcode: barcode || item.barcode || null,
                    catalog_number: catalog || item.catalog_number || null,
                    artist: item.artist || 'Unknown',
                    title: item.title || 'Unknown',
                    price: item.price || 0,
                    media_condition: item.media_condition || '—',
                    quantity: item.quantity || 1,
                    condition_comments: item.condition_comments || '',
                    private_comments: item.private_comments || ''
                });
            }

            state.currentOrderItems = enrichedItems;
            state.filteredRecords = enrichedItems;
            state.totalRecords = state.filteredRecords.length;
            state.currentPage = 1;
            render();
            updateDiscogsOrdersStatus('✅ Order ' + orderId + ': ' + enrichedItems.length + ' items loaded', 'success');

        } catch (error) {
            console.error('❌ Error loading order items:', error);
            state.currentOrderItems = [];
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            updateDiscogsOrdersStatus('❌ Error: ' + error.message, 'error');
        }
    }

    // ============================================================
    // POST TO DISCOGS
    // ============================================================

    async function postSingleRecordToDiscogs(recordId, display, price, discogsPrice, markupPercent, mediaCondition, sleeveCondition, catalogNumber, location, notes) {
        if (!recordId || !mediaCondition || !sleeveCondition || !price || !discogsPrice) {
            showDiscogsStatus('Missing required information', 'error');
            return;
        }
        if (!confirm('📋 Post "' + display + '" to Discogs?\n\nStore Price: $' + price + '\nDiscogs Price: $' + discogsPrice + ' (' + (markupPercent > 0 ? '+' : '') + markupPercent + '%)\nMedia: ' + mediaCondition + '\nSleeve: ' + sleeveCondition)) {
            return;
        }

        const listingData = {
            record: {
                id: recordId,
                artist: display.split(' - ')[0] || 'Unknown',
                title: display.split(' - ').slice(1).join(' - ') || 'Unknown',
                catalog_number: catalogNumber || '',
                media_condition: mediaCondition,
                sleeve_condition: sleeveCondition,
                price: discogsPrice,
                notes: notes || '',
                location: location || ''
            }
        };

        try {
            const result = await apiRequest('POST', '/api/discogs/create-listing-single', listingData);
            if (result.success) {
                let discogsUrl = result.listing_url;
                if (!discogsUrl && result.listing_id) {
                    discogsUrl = 'https://www.discogs.com/sell/item/' + result.listing_id;
                }
                showDiscogsStatus('✅ Successfully posted "' + display + '" to Discogs! ' + (discogsUrl ? '<a href="' + discogsUrl + '" target="_blank">View</a>' : ''), 'success');
                refreshDiscogsRecords();
            } else {
                showDiscogsStatus('Error: ' + result.error, 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    }

    function showDiscogsPostModal() {
        const records = getSelectedRecords();
        if (records.length === 0) {
            showDiscogsStatus('No records selected. Please select a range using "from" and "to" buttons.', 'warning');
            return;
        }

        const existingModal = document.getElementById('discogs-post-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'discogs-post-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = '<div class="modal-content" style="max-width: 600px; width: 95%;"><div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;"><h3 class="modal-title"><i class="fab fa-discogs"></i> Post Records to Discogs</h3><button class="modal-close" onclick="closeDiscogsPostModal()" style="color: white;">&times;</button></div><div class="modal-body"><div style="margin-bottom: 15px;"><p><strong>' + records.length + '</strong> record(s) selected for posting.</p></div><div style="margin-bottom: 20px;"><label for="discogs-post-location" style="display:block; font-weight:600; margin-bottom:4px;"><i class="fas fa-map-marker-alt"></i> Location <span style="color:#dc3545;">*</span></label><input type="text" id="discogs-post-location" class="form-control" placeholder="e.g., Bin 24 | Left Top" style="width:100%; padding:10px; font-size:16px; border:1px solid #ddd; border-radius:4px;"><p style="font-size:12px; color:#666; margin-top:5px;"><i class="fas fa-info-circle"></i> This location will be saved to all selected records before posting.</p></div><div style="margin-bottom: 20px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><span style="font-weight:600;">Progress</span><span id="discogs-post-progress-text">0%</span></div><div style="width:100%; height:24px; background:#e9ecef; border-radius:12px; overflow:hidden;"><div id="discogs-post-progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #28a745, #20c997); transition:width 0.3s ease; border-radius:12px;"></div></div></div><div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:600;"><i class="fas fa-list"></i> Status Log</span><span id="discogs-post-log-count" style="font-size:12px; color:#666;">0 / ' + records.length + '</span></div><div id="discogs-post-log" style="max-height:200px; overflow-y:auto; background:#f8f9fa; border:1px solid #ddd; border-radius:4px; padding:10px; font-family:monospace; font-size:13px; margin-top:5px;"><div style="color:#999; text-align:center; padding:20px;">Ready to start posting...</div></div></div><div id="discogs-post-status" style="margin-top:10px; display:none;"></div></div><div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;"><button class="btn btn-secondary" id="discogs-post-cancel-btn" onclick="closeDiscogsPostModal()"><i class="fas fa-times"></i> Cancel</button><button class="btn btn-success" id="discogs-post-start-btn"><i class="fab fa-discogs"></i> Start Posting</button></div></div>';
        document.body.appendChild(modal);

        setTimeout(function() {
            const locationInput = document.getElementById('discogs-post-location');
            if (locationInput) locationInput.focus();
        }, 200);

        document.getElementById('discogs-post-start-btn').addEventListener('click', function() {
            startDiscogsPosting(records);
        });

        document.getElementById('discogs-post-location').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('discogs-post-start-btn').click();
            }
        });
    }

    function closeDiscogsPostModal() {
        const modal = document.getElementById('discogs-post-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.remove();
        }
        state.isPosting = false;
        state.postProgress = 0;
        state.postResults = [];
    }

    async function startDiscogsPosting(records) {
        if (state.isPosting) return;
        if (records.length === 0) {
            showDiscogsPostStatus('No records selected.', 'error');
            return;
        }

        const locationInput = document.getElementById('discogs-post-location');
        const location = locationInput ? locationInput.value.trim() : '';

        if (!location) {
            showDiscogsPostStatus('Please enter a location before posting.', 'error');
            locationInput.focus();
            return;
        }

        const startBtn = document.getElementById('discogs-post-start-btn');
        const cancelBtn = document.getElementById('discogs-post-cancel-btn');
        if (startBtn) { startBtn.disabled = true;
            startBtn.textContent = 'Posting...'; }
        if (cancelBtn) { cancelBtn.disabled = true; }

        state.isPosting = true;
        state.postResults = [];
        let successCount = 0;
        let failCount = 0;

        updateDiscogsPostLog('info', '📍 Location set to: ' + location);
        updateDiscogsPostLog('info', '🚀 Starting to post ' + records.length + ' records...');

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const current = i + 1;

            updateDiscogsPostProgress(current, records.length);

            try {
                const display = getShortRecordDisplay(record, 30);
                updateDiscogsPostLog('info', '📝 Updating location for #' + record.id + ': ' + display);
                await apiRequest('PUT', '/records/' + record.id, { location: location });

                updateDiscogsPostLog('info', '💰 Calculating price for #' + record.id + '...');
                const priceRequests = [{
                    id: record.id,
                    created_at: record.created_at,
                    store_price: record.store_price
                }];
                const batchResults = await calculateMarkupBatch(priceRequests);

                let discogsPrice = null;
                let markupPercent = null;
                if (batchResults.length > 0 && batchResults[0].id) {
                    discogsPrice = batchResults[0].discogs_price;
                    markupPercent = batchResults[0].markup_percent;
                }

                if (!discogsPrice) {
                    throw new Error('Could not calculate Discogs price');
                }

                updateDiscogsPostLog('info', '📤 Posting #' + record.id + ': ' + display + ' at $' + discogsPrice + '...');

                const listingData = {
                    record: {
                        id: record.id,
                        artist: record.artist || 'Unknown',
                        title: record.title || 'Unknown',
                        catalog_number: record.catalog_number || '',
                        media_condition: record.disc_condition_name || record.sleeve_condition_name || 'Very Good Plus (VG+)',
                        sleeve_condition: record.sleeve_condition_name || record.disc_condition_name || 'Very Good Plus (VG+)',
                        price: discogsPrice,
                        notes: record.notes || '',
                        location: location
                    }
                };

                const result = await apiRequest('POST', '/api/discogs/create-listing-single', listingData);

                if (result.success) {
                    successCount++;
                    updateDiscogsPostLog('success', '✅ #' + record.id + ': ' + display + ' posted successfully!');
                } else {
                    throw new Error(result.error || 'Discogs API returned error');
                }

            } catch (error) {
                failCount++;
                const display = getShortRecordDisplay(record, 30);
                updateDiscogsPostLog('error', '❌ #' + record.id + ': ' + display + ' failed - ' + error.message);
                console.error('Error posting record #' + record.id, error);
            }

            if (i < records.length - 1) {
                await new Promise(function(resolve) { setTimeout(resolve, 2000); });
            }
        }

        state.isPosting = false;
        updateDiscogsPostProgress(records.length, records.length);

        const summary = '✅ ' + successCount + ' posted successfully, ❌ ' + failCount + ' failed.';
        updateDiscogsPostLog('info', '📊 ' + summary);

        if (failCount === 0) {
            showDiscogsPostStatus('🎉 All ' + records.length + ' records posted successfully!', 'success');
            playSound('success');
        } else if (successCount > 0) {
            showDiscogsPostStatus('⚠️ ' + successCount + ' posted, ' + failCount + ' failed. Check log for details.', 'warning');
            playSound('error');
        } else {
            showDiscogsPostStatus('❌ All ' + records.length + ' records failed to post.', 'error');
            playSound('error');
        }

        if (startBtn) { startBtn.disabled = false;
            startBtn.textContent = 'Start Posting'; }
        if (cancelBtn) { cancelBtn.disabled = false; }

        refreshDiscogsRecords();
    }

    function updateDiscogsPostProgress(current, total) {
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        state.postProgress = percent;
        const bar = document.getElementById('discogs-post-progress-bar');
        const text = document.getElementById('discogs-post-progress-text');
        if (bar) bar.style.width = percent + '%';
        if (text) text.textContent = percent + '%';
    }

    function updateDiscogsPostLog(type, message) {
        const logContainer = document.getElementById('discogs-post-log');
        const logCount = document.getElementById('discogs-post-log-count');
        if (!logContainer) return;

        const placeholder = logContainer.querySelector('div[style*="color:#999"]');
        if (placeholder) placeholder.remove();

        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.style.padding = '4px 0';
        entry.style.borderBottom = '1px solid #f0f0f0';
        entry.style.fontSize = '12px';

        let color = '#333';
        let icon = 'ℹ️';
        if (type === 'success') { color = '#28a745';
            icon = '✅'; } else if (type === 'error') { color = '#dc3545';
            icon = '❌'; } else if (type === 'warning') { color = '#ffc107';
            icon = '⚠️'; } else { color = '#007bff';
            icon = 'ℹ️'; }

        entry.innerHTML = '<span style="color:#999;">[' + timestamp + ']</span> <span style="color:' + color + ';">' + icon + ' ' + escapeHtml(message) + '</span>';
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function showDiscogsPostStatus(message, type) {
        const el = document.getElementById('discogs-post-status');
        if (el) {
            el.textContent = message;
            el.className = 'status-message status-' + type;
            el.style.display = 'block';
        }
    }

    // ============================================================
    // PRINT PRICE TAGS
    // ============================================================

    async function printPriceTags() {
        let records = [];

        if (state.selection.isActive) {
            records = getSelectedRecords();
        }

        if (records.length === 0) {
            records = state.filteredRecords;
        }

        if (records.length === 0) {
            showStatus('No records to print.', 'warning');
            return;
        }

        if (window.LabelPrinter) {
            await window.LabelPrinter.generatePriceTags(records);
        } else {
            showStatus('LabelPrinter not loaded. Please refresh the page.', 'error');
            console.error('LabelPrinter not available');
        }
    }

    // ============================================================
    // SEARCH
    // ============================================================

    async function performDiscogsSearch(term) {
        state.currentMode = 'search';
        recordsTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Searching Discogs...</td></tr>';
        try {
            const formatFilterEl = document.getElementById('discogs-format-filter');
            const format = formatFilterEl ? formatFilterEl.value : 'all';

            const data = await apiRequest('GET', '/api/discogs/search?q=' + encodeURIComponent(term) + (format && format !== 'all' ? '&format=' + encodeURIComponent(format) : ''));
            if (!data.results || !data.results.length) {
                recordsTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;">No Discogs results found</td></tr>';
                return;
            }
            state.currentResults = data.results.map(function(r) {
                let artist = r.artist || 'Unknown';
                let title = r.title || 'Unknown';
                if (artist === 'Unknown' && title.includes(' - ')) {
                    const parts = title.split(' - ');
                    artist = parts[0].trim();
                    title = parts.slice(1).join(' - ').trim();
                }
                if (Array.isArray(artist)) artist = artist[0] || 'Unknown';
                return { ...r, artist: artist, title: title };
            });
            state.filteredRecords = state.currentResults.slice();
            state.totalRecords = state.filteredRecords.length;
            state.currentPage = 1;
            render();
            showStatus('Found ' + state.totalRecords + ' Discogs results', 'success');
        } catch (error) {
            console.error('Discogs search error:', error);
            recordsTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;">Error searching Discogs: ' + error.message + '</td></tr>';
        }
    }

    function performSearch(term) {
        if (!term) { clearSearch(); return; }
        const mode = state.currentSearchMode;

        if (mode === 'add') {
            if (!state.selectedPurchaseId) {
                showStatus('⚠️ Please select a purchase from the table before searching.', 'error');
                playSound('error');
                return;
            }
            performDiscogsSearch(term);
            return;
        } else if (mode === 'scan') {
            performScanSearch(term);
            return;
        } else if (mode === 'discogs') {
            performDiscogsFilterSearch(term);
            return;
        } else if (mode === 'discogs_orders') {
            performDiscogsOrdersSearch(term);
            return;
        }

        showStatus('No search available for this mode', 'info');
    }

    function performDiscogsFilterSearch(term) {
        const termLower = term.toLowerCase();
        const source = state.currentLocationRecords.length > 0 ? state.currentLocationRecords : state.allRecords;
        const filtered = source.filter(function(r) {
            return (r.artist && r.artist.toLowerCase().indexOf(termLower) !== -1) ||
                (r.title && r.title.toLowerCase().indexOf(termLower) !== -1) ||
                (r.barcode && r.barcode.toLowerCase().indexOf(termLower) !== -1) ||
                (r.catalog_number && r.catalog_number.toLowerCase().indexOf(termLower) !== -1);
        });
        state.filteredRecords = filtered;
        state.totalRecords = state.filteredRecords.length;
        state.currentPage = 1;
        render();
        showStatus('Found ' + state.totalRecords + ' records matching "' + term + '"', 'info');
    }

    function performDiscogsOrdersSearch(term) {
        if (!term) {
            applyDiscogsOrdersFilters();
            return;
        }
        const termLower = term.toLowerCase().trim();
        const filtered = state.ordersList.filter(function(order) {
            const buyer = (order.buyer_username || order.buyer_name || '').toLowerCase();
            const email = (order.buyer_email || '').toLowerCase();
            return buyer.includes(termLower) || email.includes(termLower);
        });
        if (discogsOrderSelect) {
            discogsOrderSelect.innerHTML = '<option value="">-- Select an order --</option>';
            for (let i = 0; i < filtered.length; i++) {
                const order = filtered[i];
                const option = document.createElement('option');
                option.value = order.order_id || order.id;
                const buyer = order.buyer_username || order.buyer_name || 'Unknown buyer';
                const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '';
                const total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '';
                const itemCount = order.items ? order.items.length : 0;
                option.textContent = order.order_id + ' - ' + buyer + ' ' + date + ' ' + total + ' (' + itemCount + ' items)';
                discogsOrderSelect.appendChild(option);
            }
            discogsOrderSelect.value = '';
            state.selectedOrderId = null;
            state.currentOrderItems = [];
            state.filteredRecords = [];
            state.totalRecords = 0;
            render();
            updateDiscogsOrdersStatus('🔍 Found ' + filtered.length + ' orders matching "' + term + '"', 'info');
        }
    }

    function clearSearch() {
        searchInput.value = '';
        if (state.currentSearchMode === 'add') {
            state.currentMode = 'inventory';
            state.currentResults = [];
            if (state.selectedPurchaseId) {
                loadRecordsForPurchase(state.selectedPurchaseId);
            } else {
                state.filteredRecords = [];
                state.totalRecords = 0;
                state.currentPage = 1;
                render();
            }
        } else if (state.currentSearchMode === 'discogs') {
            refreshDiscogsRecords();
        } else if (state.currentSearchMode === 'discogs_orders') {
            if (discogsOrderSelect) discogsOrderSelect.value = '';
            state.selectedOrderId = null;
            state.currentOrderItems = [];
            state.filteredRecords = [];
            state.totalRecords = 0;
            state.currentPage = 1;
            render();
            applyDiscogsOrdersFilters();
        }
        showStatus('Search cleared', 'info');
        if (searchInput) searchInput.focus();
    }

    function applyLastSeenFilter() {
        if (lastSeenCutoffDateInput) {
            state.lastSeenCutoffDate = lastSeenCutoffDateInput.value;
        } else {
            state.lastSeenCutoffDate = null;
        }
        refreshDiscogsRecords();
        showDiscogsStatus('Last seen filter set to: ' + (state.lastSeenCutoffDate || 'disabled'), 'info');
        loadMarkupAnalysisCharts();
    }

    // ============================================================
    // DOMAIN MANAGEMENT
    // ============================================================

    async function loadDomainGenres() {
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/genres', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status === 'success') {
                state.genres = data.genres || [];
                renderDomainGenres(state.genres);
            }
        } catch (error) {
            console.error('Error loading genres:', error);
        }
    }

    function renderDomainGenres(genresList) {
        const container = document.getElementById('genres-list');
        if (!container) return;
        if (!genresList || genresList.length === 0) {
            container.innerHTML = '<div class="empty-message">No genres found.</div>';
            return;
        }
        let html = '<table class="domain-table"><thead><tr><th>ID</th><th>Name</th><th>Actions</th></tr></thead><tbody>';
        genresList.forEach(function(g) {
            html += '<tr>';
            html += '<td>' + g.id + '</td>';
            html += '<td>' + escapeHtml(g.name) + '</td>';
            html += '<td><button class="btn btn-sm btn-danger" onclick="deleteDomainGenre(' + g.id + ', \'' + escapeHtml(g.name) + '\')"><i class="fas fa-trash"></i></button></td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    async function loadDomainFormats() {
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/formats', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status === 'success') {
                renderDomainFormats(data.formats || []);
            }
        } catch (error) {
            console.error('Error loading formats:', error);
        }
    }

    function renderDomainFormats(formatsList) {
        const container = document.getElementById('formats-list');
        if (!container) return;
        if (!formatsList || formatsList.length === 0) {
            container.innerHTML = '<div class="empty-message">No formats found.</div>';
            return;
        }
        let html = '<table class="domain-table"><thead><tr><th>ID</th><th>Name</th><th>Actions</th></tr></thead><tbody>';
        formatsList.forEach(function(f) {
            html += '<tr>';
            html += '<td>' + f.id + '</td>';
            html += '<td>' + escapeHtml(f.name) + '</td>';
            html += '<td><button class="btn btn-sm btn-danger" onclick="deleteDomainFormat(' + f.id + ', \'' + escapeHtml(f.name) + '\')"><i class="fas fa-trash"></i></button></td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    async function deleteDomainGenre(id, name) {
        showStatus('Genre management is no longer available.', 'info');
    }

    async function deleteDomainFormat(id, name) {
        showStatus('Format management is no longer available.', 'info');
    }

    // ============================================================
    // BILL MODAL
    // ============================================================

    function openBillModal() {
        const container = document.getElementById('bill-preview-container');
        if (!container) return;

        const billPath = container.dataset.billPath || '';
        const billType = container.dataset.billType || '';

        const modal = document.getElementById('bill-modal');
        const modalImg = document.getElementById('bill-modal-image');
        const modalPlaceholder = document.getElementById('bill-modal-placeholder');
        const modalPdf = document.getElementById('bill-modal-pdf');
        const modalPdfIframe = document.getElementById('bill-modal-pdf-iframe');
        const modalFilename = document.getElementById('bill-modal-filename');
        const downloadLink = document.getElementById('bill-modal-download');

        if (!modal) return;

        modalImg.style.display = 'none';
        modalPdf.style.display = 'none';
        modalPlaceholder.style.display = 'none';
        downloadLink.style.display = 'none';
        modalImg.src = '';
        modalPdfIframe.src = '';

        if (!billPath) {
            modalPlaceholder.style.display = 'block';
            modalPlaceholder.innerHTML = '<i class="fas fa-receipt" style="font-size: 48px; display: block; margin-bottom: 15px;"></i>No bill of sale uploaded for this draft.';
            modal.style.display = 'flex';
            return;
        }

        const filename = billPath.split('/').pop();
        modalFilename.textContent = 'File: ' + filename;

        downloadLink.href = billPath;
        downloadLink.download = filename;
        downloadLink.style.display = 'inline-block';

        if (billType === 'pdf' || billPath.toLowerCase().endsWith('.pdf')) {
            modalPdf.style.display = 'block';
            modalPdfIframe.src = billPath;
            modalPlaceholder.style.display = 'none';
            modalImg.style.display = 'none';
        } else {
            modalImg.src = billPath;
            modalImg.style.display = 'block';
            modalImg.onerror = function() {
                this.style.display = 'none';
                modalPlaceholder.style.display = 'block';
                modalPlaceholder.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size: 48px; display: block; margin-bottom: 15px; color: #dc3545;"></i>Could not load image. The file may be missing or corrupted.';
            };
            modalPdf.style.display = 'none';
            modalPlaceholder.style.display = 'none';
        }

        modal.style.display = 'flex';
    }

    function closeBillModal() {
        const modal = document.getElementById('bill-modal');
        if (modal) {
            modal.style.display = 'none';
            const iframe = document.getElementById('bill-modal-pdf-iframe');
            if (iframe) iframe.src = '';
        }
    }

    // ============================================================
    // SETUP DOMAIN MANAGEMENT HANDLERS
    // ============================================================

    function setupDomainManagementHandlers() {
        const domainAddFormatBtn = document.getElementById('add-format-btn');
        if (domainAddFormatBtn) {
            domainAddFormatBtn.addEventListener('click', async function() {
                const inputField = document.getElementById('new-format');
                if (!inputField) return;
                const formatName = inputField.value.trim();
                if (!formatName) {
                    showStatus('Please enter a format name.', 'warning');
                    inputField.focus();
                    return;
                }
                try {
                    const response = await fetch(window.AppConfig.baseUrl + '/api/formats', {
                        method: 'POST',
                        credentials: 'include',
                        headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: formatName })
                    });
                    const data = await response.json();
                    if (data.status !== 'success') {
                        throw new Error(data.error || 'Server rejected format');
                    }
                    inputField.value = '';
                    showStatus('✅ Format "' + formatName + '" added!', 'success');
                    playSound('success');
                    loadDomainFormats();
                } catch (error) {
                    console.error('Error adding format:', error);
                    showStatus('❌ Failed to add format: ' + error.message, 'error');
                    playSound('error');
                }
            });
        }

        if (scanLocationSelect) {
            scanLocationSelect.addEventListener('change', function() {
                updateScanLocationPreview();
            });
        }

        if (scanSubmitBtn) {
            scanSubmitBtn.addEventListener('click', function() {
                const term = scanInput ? scanInput.value.trim() : '';
                if (term) performScanSearch(term);
            });
        }

        if (scanInput) {
            scanInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const term = this.value.trim();
                    if (term) performScanSearch(term);
                }
            });
        }

        if (defaultFormatSelect) {
            defaultFormatSelect.addEventListener('change', function() {
                state.defaultParams.formatId = parseInt(this.value) || null;
                saveDefaultParamsToStorage();
                render();
            });
        }

        if (defaultPurchaseSelect) {
            defaultPurchaseSelect.addEventListener('change', function() {
                const purchaseId = parseInt(this.value);
                if (purchaseId) {
                    state.defaultParams.purchaseId = purchaseId;
                    saveDefaultParamsToStorage();
                    selectPurchase(purchaseId);
                } else {
                    state.defaultParams.purchaseId = null;
                    saveDefaultParamsToStorage();
                    clearPurchaseSelection();
                }
            });
        }
    }

    // ============================================================
    // ACCEPT DRAFT
    // ============================================================

    async function acceptDraft() {
        if (!state.selectedPurchaseId) {
            showToast('No purchase selected.', 'error');
            return;
        }

        const offerAmountInput = document.getElementById('draft-offer-amount');
        if (!offerAmountInput) {
            const amount = prompt('Enter offer amount ($):');
            if (amount === null) return;
            const offerAmount = parseFloat(amount);
            if (isNaN(offerAmount) || offerAmount <= 0) {
                showToast('Please enter a valid offer amount.', 'error');
                return;
            }
            await processAcceptDraft(state.selectedPurchaseId, offerAmount);
            return;
        }

        const offerAmount = parseFloat(offerAmountInput.value);
        if (isNaN(offerAmount) || offerAmount <= 0) {
            showToast('Please enter a valid offer amount in the metadata panel.', 'error');
            return;
        }

        await processAcceptDraft(state.selectedPurchaseId, offerAmount);
    }

    async function processAcceptDraft(purchaseId, offerAmount) {
        if (!purchaseId) {
            showToast('No purchase selected.', 'error');
            return;
        }

        let purchase;
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + purchaseId, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success' || !data.purchase) throw new Error(data.error || 'Purchase not found');
            purchase = data.purchase;
        } catch (error) {
            showToast('Error fetching purchase: ' + error.message, 'error');
            return;
        }

        if (purchase.status === 'complete') {
            showToast('This purchase is already complete.', 'warning');
            return;
        }

        const recordIds = state.currentPurchaseRecords.map(function(r) { return r.id; });
        if (recordIds.length === 0) {
            showToast('No records linked to this purchase.', 'error');
            return;
        }

        const signatureMethod = confirm('Square POS signature? Click OK for Square POS, Cancel for Print & Upload.');

        const requestBody = {
            offer_amount: offerAmount,
            signature_method: signatureMethod ? 'square' : 'upload',
            record_ids: recordIds
        };

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + purchaseId, {
                method: 'PUT',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const data = await response.json();

            if (data.status === 'success') {
                if (state.currentPurchaseRecords.length > 0) {
                    if (window.LabelPrinter) {
                        await window.LabelPrinter.generatePriceTags(state.currentPurchaseRecords, {
                            title: 'Price Tags - Purchase #' + purchaseId
                        });
                    } else {
                        console.warn('LabelPrinter not loaded, cannot generate PDF');
                    }
                    showToast('📄 Price tags generated for ' + state.currentPurchaseRecords.length + ' records.', 'success');
                }

                showToast('✅ Draft accepted! Offer: $' + offerAmount.toFixed(2), 'success');
                playSound('success');

                if (signatureMethod) {
                    await sendBillToSquarePOS(purchase, offerAmount, state.currentPurchaseRecords);
                } else {
                    const billText = generateBillOfSale(purchase, offerAmount, state.currentPurchaseRecords);
                    downloadReceipt(billText, 'bill_of_sale_' + purchaseId + '.txt');
                    showToast('📄 Bill of Sale downloaded. Have customer sign, take photo, and upload.', 'info');
                }

                await loadPurchasesTable();
                await selectPurchase(purchaseId);
            } else {
                showToast('❌ Error: ' + (data.error || 'Unknown error'), 'error');
                playSound('error');
            }
        } catch (error) {
            console.error('❌ acceptDraft error:', error);
            showToast('❌ Error: ' + error.message, 'error');
            playSound('error');
        }
    }

    async function sendBillToSquarePOS(purchase, offerAmount, records) {
        try {
            const recordDetails = records.map(function(r) {
                return {
                    id: r.id,
                    artist: r.artist || 'Unknown',
                    title: r.title || 'Unknown',
                    price: r.store_price || 0
                };
            });

            const response = await fetch(window.AppConfig.baseUrl + '/api/square/bill-of-sale', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    draft_id: purchase.id,
                    seller_name: purchase.seller_name || '',
                    offer_amount: offerAmount,
                    records: recordDetails,
                    signature_method: 'square'
                })
            });
            const data = await response.json();

            if (data.status === 'success') {
                showToast('✅ Bill of Sale sent to Square POS. Customer can sign on terminal.', 'success');
                playSound('success');
            } else {
                showToast('⚠️ Could not send to Square POS: ' + (data.error || 'Unknown error'), 'warning');
            }
        } catch (error) {
            console.error('Error sending to Square POS:', error);
            showToast('⚠️ Could not send to Square POS: ' + error.message, 'warning');
        }
    }

    function generateBillOfSale(purchase, offerAmount, records) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        let bill = 'PIGSTYLE MUSIC\n';
        bill += '====================\n';
        bill += 'BILL OF SALE\n';
        bill += dateStr + ' ' + timeStr + '\n\n';
        bill += 'Purchase #: ' + purchase.id + '\n';
        bill += 'Seller: ' + (purchase.seller_name || '—') + '\n';
        if (purchase.seller_contact) {
            bill += 'Contact: ' + purchase.seller_contact + '\n';
        }
        bill += 'Description: ' + (purchase.description || '—') + '\n';
        bill += '\n';
        bill += 'ITEMS:\n';
        bill += '--------------------\n';

        let totalValue = 0;
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const price = record.store_price || 0;
            const display = getRecordDisplay(record);
            const padding = Math.max(1, 30 - display.length);
            bill += display;
            bill += ' '.repeat(padding);
            bill += '$' + price.toFixed(2) + '\n';
            totalValue += price;
        }

        bill += '--------------------\n';
        bill += 'Total Value'.padEnd(25) + ' $' + totalValue.toFixed(2) + '\n';
        bill += 'Offer Amount'.padEnd(25) + ' $' + offerAmount.toFixed(2) + '\n';
        bill += '\n';
        bill += 'Seller Signature: ____________________\n';
        bill += 'Store Rep: ____________________\n';
        bill += '\n';
        bill += '---\n';
        bill += 'PigStyle Music\n';
        bill += 'Thank you for your business!\n';

        return bill;
    }

    // ============================================================
    // INITIALIZATION - Single entry point
    // ============================================================

    let initialized = false;

    async function init() {
        if (initialized) {
            console.log('🔄 inventory-ops: Already initialized, skipping.');
            return;
        }
        initialized = true;

        console.log('🔄 inventory-ops: Initializing...');

        // Load all data
        await loadMinimumPrice();
        await loadStorePriceMultiplier();
        await loadConditions();
        await loadConsignors();
        await loadGenres();
        await loadFormats();
        await loadLocations();
        await loadStats();

        populateDefaultParamSelects();

        updateScanLocationPreview();
        loadRecentScansFromStorage();
        updateRecentScansUI();

        setupDomainManagementHandlers();

        loadDomainGenres();
        loadDomainFormats();

        // ===== Event Listeners =====

        // Search mode change
        searchModeSelect.addEventListener('change', onModeChange);

        // Search button
        const searchButton = document.getElementById('searchButton');
        if (searchButton) {
            searchButton.addEventListener('click', function() {
                const term = searchInput.value.trim();
                performSearch(term);
            });
        }

        // Search input enter key
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const term = this.value.trim();
                performSearch(term);
            }
        });

        // Clear search
        clearSearchBtn.addEventListener('click', clearSearch);

        // Pagination
        pageSizeSelect.addEventListener('change', function() {
            state.pageSize = parseInt(this.value);
            state.currentPage = 1;
            render();
        });

        currentPageInput.addEventListener('change', function() {
            const page = parseInt(this.value);
            const totalPages = Math.ceil(state.totalRecords / state.pageSize) || 1;
            if (isNaN(page) || page < 1) page = 1;
            if (page > totalPages) page = totalPages;
            state.currentPage = page;
            render();
        });

        firstPageBtn.addEventListener('click', function() { state.currentPage = 1;
            render(); });
        prevPageBtn.addEventListener('click', function() { if (state.currentPage > 1) { state.currentPage--;
                render(); } });
        nextPageBtn.addEventListener('click', function() { const totalPages = Math.ceil(state.totalRecords / state.pageSize) || 1; if (state.currentPage < totalPages) { state.currentPage++;
                render(); } });
        lastPageBtn.addEventListener('click', function() { const totalPages = Math.ceil(state.totalRecords / state.pageSize) || 1;
            state.currentPage = totalPages;
            render(); });

        // Print button
        printBtn.addEventListener('click', printPriceTags);

        // Cancel range button
        cancelRangeBtn.addEventListener('click', cancelRangeSelection);

        // ===== Event Delegation for Row Actions =====
        // Attach once to the table body for all row interactions
        recordsTableBody.addEventListener('click', function(e) {
            // From button
            const fromBtn = e.target.closest('.btn-from');
            if (fromBtn) {
                const index = parseInt(fromBtn.dataset.index);
                startRangeFrom(index);
                return;
            }

            // To button
            const toBtn = e.target.closest('.btn-to');
            if (toBtn) {
                const index = parseInt(toBtn.dataset.index);
                endRangeTo(index);
                return;
            }

            // Add record from search
            const addBtn = e.target.closest('.btn-add-record-from-search');
            if (addBtn) {
                const index = parseInt(addBtn.dataset.index);
                const row = addBtn.closest('tr');
                const record = state.currentResults[index];
                if (record) addRecordFromDiscogs(row, record);
                return;
            }

            // Post single record to Discogs
            const postBtn = e.target.closest('.post-single-btn');
            if (postBtn) {
                e.preventDefault();
                const recordId = parseInt(postBtn.dataset.recordId);
                const display = postBtn.dataset.display || '';
                const price = parseFloat(postBtn.dataset.price);
                const discogsPrice = parseFloat(postBtn.dataset.discogsPrice);
                const markupPercent = parseFloat(postBtn.dataset.markupPercent);
                const mediaCondition = postBtn.dataset.mediaCondition;
                const sleeveCondition = postBtn.dataset.sleeveCondition;
                const catalog = postBtn.dataset.catalog;
                const location = postBtn.dataset.location;
                const notes = postBtn.dataset.notes;
                postSingleRecordToDiscogs(recordId, display, price, discogsPrice, markupPercent, mediaCondition, sleeveCondition, catalog, location, notes);
                return;
            }

            // Mark Discogs sold
            const markBtn = e.target.closest('.mark-discogs-sold-btn');
            if (markBtn) {
                const recordId = parseInt(markBtn.dataset.recordId);
                markRecordSoldOnDiscogs(recordId);
                return;
            }

            // PigStyle ID input - scan button
            const scanPigBtn = e.target.closest('.scan-pigstyle-btn');
            if (scanPigBtn) {
                const input = scanPigBtn.closest('td').querySelector('.pigstyle-id-input');
                if (input) {
                    const barcode = prompt('Enter or scan barcode:');
                    if (barcode && barcode.trim().length > 0) {
                        input.value = barcode.trim();
                        const event = new Event('change');
                        input.dispatchEvent(event);
                        lookupBarcodeForOrderItem(input, barcode.trim());
                    }
                }
                return;
            }
        });

        // PigStyle ID input - change and keydown events (delegated)
        recordsTableBody.addEventListener('change', function(e) {
            const input = e.target.closest('.pigstyle-id-input');
            if (input) {
                const row = input.closest('tr');
                const index = parseInt(row.dataset.index);
                const item = state.filteredRecords[index];
                if (item) {
                    const val = input.value.trim();
                    const newId = parseInt(val);
                    if (!isNaN(newId)) {
                        item.pigstyle_id = newId;
                        fetchRecordForOrderItem(item, row);
                    } else {
                        item.pigstyle_id = null;
                    }
                }
            }
        });

        recordsTableBody.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const input = e.target.closest('.pigstyle-id-input');
                if (input) {
                    e.preventDefault();
                    const val = input.value.trim();
                    if (val.length > 0) {
                        lookupBarcodeForOrderItem(input, val);
                    }
                }
            }
        });

        // Discogs location select
        if (discogsLocationSelect) {
            discogsLocationSelect.addEventListener('change', function() {
                refreshDiscogsRecords();
            });
        }

        // Last seen filter
        if (applyLastSeenFilterBtn) {
            applyLastSeenFilterBtn.addEventListener('click', function() {
                applyLastSeenFilter();
            });
        }

        // Discogs Orders filters
        if (discogsOrdersApplyFiltersBtn) {
            discogsOrdersApplyFiltersBtn.addEventListener('click', function() {
                applyDiscogsOrdersFilters();
            });
        }

        if (discogsOrdersRefreshBtn) {
            discogsOrdersRefreshBtn.addEventListener('click', function() {
                refreshDiscogsOrders();
            });
        }

        if (discogsOrdersSearch) {
            discogsOrdersSearch.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyDiscogsOrdersFilters();
                }
            });
        }

        if (discogsOrderSelect) {
            discogsOrderSelect.addEventListener('change', function() {
                const orderId = this.value;
                state.selectedOrderId = orderId || null;
                if (orderId) {
                    loadOrderItems(orderId);
                } else {
                    state.currentOrderItems = [];
                    state.filteredRecords = [];
                    state.totalRecords = 0;
                    state.currentPage = 1;
                    render();
                }
                updateSelectionCount();
            });
        }

        if (discogsOrdersStatusFilter) {
            discogsOrdersStatusFilter.addEventListener('change', function() {
                applyDiscogsOrdersFilters();
            });
        }

        // Load purchases and set initial mode
        await loadPurchasesTable();

        state.currentSearchMode = searchModeSelect.value;
        onModeChange();

        console.log('✅ inventory-ops.js initialized');
    }

    // ============================================================
    // ADD RECORD FROM DISCOGS
    // ============================================================

    async function addRecordFromDiscogs(row, discogsRecord) {
        if (!state.selectedPurchaseId) {
            showStatus('⚠️ Please select a purchase from the table before adding records.', 'error');
            playSound('error');
            return;
        }

        const priceInput = row.querySelector('.price-input');
        const consignorSelect = row.querySelector('.consignor-select');
        const sleeveSelect = row.querySelector('.sleeve-condition-select');
        const discSelect = row.querySelector('.disc-condition-select');
        const formatSelect = row.querySelector('.format-select');
        const notesInput = row.querySelector('.notes-input');

        let price = null;
        let consignorId = null;
        let sleeveId = null;
        let discId = null;
        let formatId = null;
        const notes = notesInput ? notesInput.value.trim() : '';

        if (state.defaultParamsActive) {
            sleeveId = state.defaultParams.sleeveConditionId;
            discId = state.defaultParams.discConditionId;
            price = state.defaultParams.price;
            consignorId = state.defaultParams.consignorId;
            formatId = state.defaultParams.formatId;
        }

        if (priceInput && priceInput.value) {
            const val = parseFloat(priceInput.value);
            if (!isNaN(val) && val > 0) price = val;
        }
        if (consignorSelect && consignorSelect.value) {
            const val = parseInt(consignorSelect.value);
            if (!isNaN(val)) consignorId = val;
        }
        if (sleeveSelect && sleeveSelect.value) {
            const val = parseInt(sleeveSelect.value);
            if (!isNaN(val)) sleeveId = val;
        }
        if (discSelect && discSelect.value) {
            const val = parseInt(discSelect.value);
            if (!isNaN(val)) discId = val;
        }
        if (formatSelect && formatSelect.value) {
            const val = parseInt(formatSelect.value);
            if (!isNaN(val)) formatId = val;
        }

        if (!sleeveId || !discId) {
            showStatus('Please select sleeve and disc conditions (or set defaults)', 'warning');
            return;
        }
        if (!price || price <= 0) {
            showStatus('Please enter a valid price (or set a default)', 'warning');
            return;
        }

        const display = getRecordDisplay(discogsRecord);

        const recordData = {
            artist: discogsRecord.artist || 'Unknown',
            title: discogsRecord.title || 'Unknown',
            discogs_genre_raw: discogsRecord.genre_raw || '',
            image_url: discogsRecord.image_url || '',
            catalog_number: discogsRecord.catalog_number || '',
            condition_sleeve_id: sleeveId,
            condition_disc_id: discId,
            store_price: price,
            consignor_id: consignorId,
            status_id: 1,
            notes: notes,
            batch_id: state.selectedPurchaseId,
            format_id: formatId
        };

        const result = await apiRequest('POST', '/records', recordData);
        const recordDisplay = result.record ? getShortRecordDisplay(result.record, 30) : 'Record';
        showStatus('✅ ' + recordDisplay + ' added successfully to purchase #' + state.selectedPurchaseId + '!', 'success');

        await loadRecordsForPurchase(state.selectedPurchaseId);
        await loadPurchasesTable();

        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }

        clearSearch();
        await loadStats();
    }

    // ============================================================
    // HELPER: Lookup barcode for order item
    // ============================================================

    async function lookupBarcodeForOrderItem(input, barcode) {
        try {
            const data = await apiRequest('GET', '/records/search?q=' + encodeURIComponent(barcode));
            if (data.status === 'success' && data.records && data.records.length === 1) {
                const record = data.records[0];
                input.value = record.id;
                const event = new Event('change');
                input.dispatchEvent(event);
                const row = input.closest('tr');
                const index = parseInt(row.dataset.index);
                const item = state.filteredRecords[index];
                if (item) {
                    item.pigstyle_id = record.id;
                    item.barcode = record.barcode;
                    item.catalog_number = record.catalog_number;
                    item.record_status_id = record.status_id;
                    render();
                }
                playSound('success');
                const display = getShortRecordDisplay(record, 30);
                showStatus('✅ Record #' + record.id + ' (' + display + ') assigned to this order item.', 'success');
            } else if (data.records && data.records.length > 1) {
                showStatus('⚠️ Multiple records (' + data.records.length + ') found for barcode. Please be more specific.', 'warning');
            } else {
                showStatus('❌ No record found for this barcode.', 'error');
                playSound('error');
            }
        } catch (error) {
            console.error('Barcode lookup error:', error);
            showStatus('Error looking up barcode.', 'error');
        }
    }

    async function fetchRecordForOrderItem(item, row) {
        if (!item.pigstyle_id) return;
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/records/' + item.pigstyle_id, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (response.ok) {
                const record = await response.json();
                item.barcode = record.barcode || null;
                item.catalog_number = record.catalog_number || null;
                item.record_status_id = record.status_id;
                const cells = row.querySelectorAll('td');
                if (cells.length >= 5) {
                    cells[4].textContent = item.barcode || '—';
                    cells[3].textContent = item.catalog_number || '—';
                    const statusCell = cells[8];
                    let statusText = '—';
                    let statusClass = '';
                    if (item.record_status_id === 2) { statusText = 'Active';
                        statusClass = 'active'; } else if (item.record_status_id === 3 || item.record_status_id === 4) { statusText = 'Sold';
                        statusClass = 'sold'; } else if (item.record_status_id === 1) { statusText = 'New';
                        statusClass = 'new'; } else { statusText = 'Not found';
                        statusClass = ''; }
                    statusCell.innerHTML = '<span class="status-badge ' + statusClass + '">' + statusText + '</span>';
                }
            }
        } catch (error) {
            console.warn('Could not fetch record details:', error);
        }
    }

    async function markRecordSoldOnDiscogs(recordId) {
        if (!recordId) {
            showStatus('No record ID provided.', 'error');
            return;
        }

        if (!confirm('Mark record #' + recordId + ' as sold on Discogs?\n\nThis will:\n- Search Discogs orders for this record\n- Auto-fetch the sale price\n- Mark the record as sold (status_id=4)\n- Set the sale date to today')) {
            return;
        }

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/records/' + recordId + '/mark-discogs-sold', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.status === 'success') {
                const price = data.record ? data.record.store_price : 'unknown';
                const display = getShortRecordDisplay(data.record || { id: recordId }, 30);
                showStatus('✅ Record #' + recordId + ' (' + display + ') marked as sold on Discogs for $' + price, 'success');
                playSound('success');

                if (state.currentSearchMode === 'discogs_orders' && state.selectedOrderId) {
                    await loadOrderItems(state.selectedOrderId);
                } else {
                    render();
                }
            } else {
                showStatus('❌ Error: ' + (data.error || 'Failed to mark record as sold'), 'error');
                playSound('error');
            }
        } catch (error) {
            console.error('Error marking record sold on Discogs:', error);
            showStatus('❌ Error: ' + error.message, 'error');
            playSound('error');
        }
    }

    // ============================================================
    // EXPOSE GLOBALS
    // ============================================================

    window.getRecordDisplay = getRecordDisplay;
    window.getShortRecordDisplay = getShortRecordDisplay;
    window.expandImage = window.expandImage;

    window.selectPurchase = selectPurchase;
    window.savePurchaseMetadata = savePurchaseMetadata;
    window.uploadBillForPurchase = uploadBillForPurchase;
    window.deletePurchase = deletePurchase;
    window.clearPurchaseSelection = clearPurchaseSelection;
    window.createNewPurchase = createNewPurchase;
    window.acceptDraft = acceptDraft;
    window.refreshPurchases = loadPurchasesTable;
    window.loadPurchasesTable = loadPurchasesTable;
    window.removeRecordFromPurchase = removeRecordFromPurchase;
    window.togglePurchaseTable = togglePurchaseTable;
    window.toggleMetadataPanel = toggleMetadataPanel;

    window.toggleInventorySetupPanel = toggleInventorySetupPanel;
    window.toggleDefaultParamsSub = toggleDefaultParamsSub;
    window.applyDefaultParams = applyDefaultParams;
    window.clearDefaultParams = clearDefaultParams;

    window.refreshDiscogsLocations = loadDiscogsLocations;
    window.showDiscogsPostModal = showDiscogsPostModal;
    window.closeDiscogsPostModal = closeDiscogsPostModal;

    window.loadDomainGenres = loadDomainGenres;
    window.loadDomainFormats = loadDomainFormats;
    window.deleteDomainGenre = deleteDomainGenre;
    window.deleteDomainFormat = deleteDomainFormat;

    window.openBillModal = openBillModal;
    window.closeBillModal = closeBillModal;

    window.addMarkupRule = window.addMarkupRule;
    window.updateMarkupRule = window.updateMarkupRule;
    window.deleteMarkupRule = window.deleteMarkupRule;

    window.initAddRecordsTab = function() {
        console.log('🔵 TabManager called initAddRecordsTab');
        if (!initialized) {
            init();
        } else {
            console.log('🔄 initAddRecordsTab: already initialized');
        }
    };

    window.initInventoryOpsTab = window.initAddRecordsTab;

    // ============================================================
    // AUTO-INIT
    // ============================================================

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(function() {
            if (!initialized) {
                console.log('🔄 Auto-initializing inventory-ops (fallback)');
                init();
            }
        }, 1000);
    }

    console.log('✅ All functions exposed to window');
    console.log('✅ applyDefaultParams and clearDefaultParams are now globally available.');

})();====

        // Search mode change
        searchModeSelect.addEventListener('change', onModeChange);

        // Search button
        const searchButton = document.getElementById('searchButton');
        if (searchButton) {
            searchButton.addEventListener('click', function() {
                const term = searchInput.value.trim();
                performSearch(term);
            });
        }

        // Search input enter key
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const term = this.value.trim();
                performSearch(term);
            }
        });

        // Clear search
        clearSearchBtn.addEventListener('click', clearSearch);

        // Pagination
        pageSizeSelect.addEventListener('change', function() {
            state.pageSize = parseInt(this.value);
            state.currentPage = 1;
            render();
        });

        currentPageInput.addEventListener('change', function() {
            const page = parseInt(this.value);
            const totalPages = Math.ceil(state.totalRecords / state.pageSize) || 1;
            if (isNaN(page) || page < 1) page = 1;
            if (page > totalPages) page = totalPages;
            state.currentPage = page;
            render();
        });

        firstPageBtn.addEventListener('click', function() { state.currentPage = 1;
            render(); });
        prevPageBtn.addEventListener('click', function() { if (state.currentPage > 1) { state.currentPage--;
                render(); } });
        nextPageBtn.addEventListener('click', function() { const totalPages = Math.ceil(state.totalRecords / state.pageSize) || 1; if (state.currentPage < totalPages) { state.currentPage++;
                render(); } });
        lastPageBtn.addEventListener('click', function() { const totalPages = Math.ceil(state.totalRecords / state.pageSize) || 1;
            state.currentPage = totalPages;
            render(); });

        // Print button
        printBtn.addEventListener('click', printPriceTags);

        // Cancel range button
        cancelRangeBtn.addEventListener('click', cancelRangeSelection);

        // ===== Event Delegation for Row Actions =====
        // Attach once to the table body for all row interactions
        recordsTableBody.addEventListener('click', function(e) {
            // From button
            const fromBtn = e.target.closest('.btn-from');
            if (fromBtn) {
                const index = parseInt(fromBtn.dataset.index);
                startRangeFrom(index);
                return;
            }

            // To button
            const toBtn = e.target.closest('.btn-to');
            if (toBtn) {
                const index = parseInt(toBtn.dataset.index);
                endRangeTo(index);
                return;
            }

            // Add record from search
            const addBtn = e.target.closest('.btn-add-record-from-search');
            if (addBtn) {
                const index = parseInt(addBtn.dataset.index);
                const row = addBtn.closest('tr');
                const record = state.currentResults[index];
                if (record) addRecordFromDiscogs(row, record);
                return;
            }

            // Post single record to Discogs
            const postBtn = e.target.closest('.post-single-btn');
            if (postBtn) {
                e.preventDefault();
                const recordId = parseInt(postBtn.dataset.recordId);
                const display = postBtn.dataset.display || '';
                const price = parseFloat(postBtn.dataset.price);
                const discogsPrice = parseFloat(postBtn.dataset.discogsPrice);
                const markupPercent = parseFloat(postBtn.dataset.markupPercent);
                const mediaCondition = postBtn.dataset.mediaCondition;
                const sleeveCondition = postBtn.dataset.sleeveCondition;
                const catalog = postBtn.dataset.catalog;
                const location = postBtn.dataset.location;
                const notes = postBtn.dataset.notes;
                postSingleRecordToDiscogs(recordId, display, price, discogsPrice, markupPercent, mediaCondition, sleeveCondition, catalog, location, notes);
                return;
            }

            // Mark Discogs sold
            const markBtn = e.target.closest('.mark-discogs-sold-btn');
            if (markBtn) {
                const recordId = parseInt(markBtn.dataset.recordId);
                markRecordSoldOnDiscogs(recordId);
                return;
            }

            // PigStyle ID input - scan button
            const scanPigBtn = e.target.closest('.scan-pigstyle-btn');
            if (scanPigBtn) {
                const input = scanPigBtn.closest('td').querySelector('.pigstyle-id-input');
                if (input) {
                    const barcode = prompt('Enter or scan barcode:');
                    if (barcode && barcode.trim().length > 0) {
                        input.value = barcode.trim();
                        const event = new Event('change');
                        input.dispatchEvent(event);
                        lookupBarcodeForOrderItem(input, barcode.trim());
                    }
                }
                return;
            }
        });

        // PigStyle ID input - change and keydown events (delegated)
        recordsTableBody.addEventListener('change', function(e) {
            const input = e.target.closest('.pigstyle-id-input');
            if (input) {
                const row = input.closest('tr');
                const index = parseInt(row.dataset.index);
                const item = state.filteredRecords[index];
                if (item) {
                    const val = input.value.trim();
                    const newId = parseInt(val);
                    if (!isNaN(newId)) {
                        item.pigstyle_id = newId;
                        fetchRecordForOrderItem(item, row);
                    } else {
                        item.pigstyle_id = null;
                    }
                }
            }
        });

        recordsTableBody.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const input = e.target.closest('.pigstyle-id-input');
                if (input) {
                    e.preventDefault();
                    const val = input.value.trim();
                    if (val.length > 0) {
                        lookupBarcodeForOrderItem(input, val);
                    }
                }
            }
        });

        // Discogs location select
        if (discogsLocationSelect) {
            discogsLocationSelect.addEventListener('change', function() {
                refreshDiscogsRecords();
            });
        }

        // Last seen filter
        if (applyLastSeenFilterBtn) {
            applyLastSeenFilterBtn.addEventListener('click', function() {
                applyLastSeenFilter();
            });
        }

        // Discogs Orders filters
        if (discogsOrdersApplyFiltersBtn) {
            discogsOrdersApplyFiltersBtn.addEventListener('click', function() {
                applyDiscogsOrdersFilters();
            });
        }

        if (discogsOrdersRefreshBtn) {
            discogsOrdersRefreshBtn.addEventListener('click', function() {
                refreshDiscogsOrders();
            });
        }

        if (discogsOrdersSearch) {
            discogsOrdersSearch.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyDiscogsOrdersFilters();
                }
            });
        }

        if (discogsOrderSelect) {
            discogsOrderSelect.addEventListener('change', function() {
                const orderId = this.value;
                state.selectedOrderId = orderId || null;
                if (orderId) {
                    loadOrderItems(orderId);
                } else {
                    state.currentOrderItems = [];
                    state.filteredRecords = [];
                    state.totalRecords = 0;
                    state.currentPage = 1;
                    render();
                }
                updateSelectionCount();
            });
        }

        if (discogsOrdersStatusFilter) {
            discogsOrdersStatusFilter.addEventListener('change', function() {
                applyDiscogsOrdersFilters();
            });
        }

        // Load purchases and set initial mode
        await loadPurchasesTable();

        state.currentSearchMode = searchModeSelect.value;
        onModeChange();

        console.log('✅ inventory-ops.js initialized');
    }

    // ============================================================
    // ADD RECORD FROM DISCOGS
    // ============================================================

    async function addRecordFromDiscogs(row, discogsRecord) {
        if (!state.selectedPurchaseId) {
            showStatus('⚠️ Please select a purchase from the table before adding records.', 'error');
            playSound('error');
            return;
        }

        const priceInput = row.querySelector('.price-input');
        const consignorSelect = row.querySelector('.consignor-select');
        const sleeveSelect = row.querySelector('.sleeve-condition-select');
        const discSelect = row.querySelector('.disc-condition-select');
        const formatSelect = row.querySelector('.format-select');
        const notesInput = row.querySelector('.notes-input');

        let price = null;
        let consignorId = null;
        let sleeveId = null;
        let discId = null;
        let formatId = null;
        const notes = notesInput ? notesInput.value.trim() : '';

        if (state.defaultParamsActive) {
            sleeveId = state.defaultParams.sleeveConditionId;
            discId = state.defaultParams.discConditionId;
            price = state.defaultParams.price;
            consignorId = state.defaultParams.consignorId;
            formatId = state.defaultParams.formatId;
        }

        if (priceInput && priceInput.value) {
            const val = parseFloat(priceInput.value);
            if (!isNaN(val) && val > 0) price = val;
        }
        if (consignorSelect && consignorSelect.value) {
            const val = parseInt(consignorSelect.value);
            if (!isNaN(val)) consignorId = val;
        }
        if (sleeveSelect && sleeveSelect.value) {
            const val = parseInt(sleeveSelect.value);
            if (!isNaN(val)) sleeveId = val;
        }
        if (discSelect && discSelect.value) {
            const val = parseInt(discSelect.value);
            if (!isNaN(val)) discId = val;
        }
        if (formatSelect && formatSelect.value) {
            const val = parseInt(formatSelect.value);
            if (!isNaN(val)) formatId = val;
        }

        if (!sleeveId || !discId) {
            showStatus('Please select sleeve and disc conditions (or set defaults)', 'warning');
            return;
        }
        if (!price || price <= 0) {
            showStatus('Please enter a valid price (or set a default)', 'warning');
            return;
        }

        const display = getRecordDisplay(discogsRecord);

        const recordData = {
            artist: discogsRecord.artist || 'Unknown',
            title: discogsRecord.title || 'Unknown',
            discogs_genre_raw: discogsRecord.genre_raw || '',
            image_url: discogsRecord.image_url || '',
            catalog_number: discogsRecord.catalog_number || '',
            condition_sleeve_id: sleeveId,
            condition_disc_id: discId,
            store_price: price,
            consignor_id: consignorId,
            status_id: 1,
            notes: notes,
            batch_id: state.selectedPurchaseId,
            format_id: formatId
        };

        const result = await apiRequest('POST', '/records', recordData);
        const recordDisplay = result.record ? getShortRecordDisplay(result.record, 30) : 'Record';
        showStatus('✅ ' + recordDisplay + ' added successfully to purchase #' + state.selectedPurchaseId + '!', 'success');

        await loadRecordsForPurchase(state.selectedPurchaseId);
        await loadPurchasesTable();

        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }

        clearSearch();
        await loadStats();
    }

    // ============================================================
    // HELPER: Lookup barcode for order item
    // ============================================================

    async function lookupBarcodeForOrderItem(input, barcode) {
        try {
            const data = await apiRequest('GET', '/records/search?q=' + encodeURIComponent(barcode));
            if (data.status === 'success' && data.records && data.records.length === 1) {
                const record = data.records[0];
                input.value = record.id;
                const event = new Event('change');
                input.dispatchEvent(event);
                const row = input.closest('tr');
                const index = parseInt(row.dataset.index);
                const item = state.filteredRecords[index];
                if (item) {
                    item.pigstyle_id = record.id;
                    item.barcode = record.barcode;
                    item.catalog_number = record.catalog_number;
                    item.record_status_id = record.status_id;
                    render();
                }
                playSound('success');
                const display = getShortRecordDisplay(record, 30);
                showStatus('✅ Record #' + record.id + ' (' + display + ') assigned to this order item.', 'success');
            } else if (data.records && data.records.length > 1) {
                showStatus('⚠️ Multiple records (' + data.records.length + ') found for barcode. Please be more specific.', 'warning');
            } else {
                showStatus('❌ No record found for this barcode.', 'error');
                playSound('error');
            }
        } catch (error) {
            console.error('Barcode lookup error:', error);
            showStatus('Error looking up barcode.', 'error');
        }
    }

    async function fetchRecordForOrderItem(item, row) {
        if (!item.pigstyle_id) return;
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/records/' + item.pigstyle_id, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (response.ok) {
                const record = await response.json();
                item.barcode = record.barcode || null;
                item.catalog_number = record.catalog_number || null;
                item.record_status_id = record.status_id;
                const cells = row.querySelectorAll('td');
                if (cells.length >= 5) {
                    cells[4].textContent = item.barcode || '—';
                    cells[3].textContent = item.catalog_number || '—';
                    const statusCell = cells[8];
                    let statusText = '—';
                    let statusClass = '';
                    if (item.record_status_id === 2) { statusText = 'Active';
                        statusClass = 'active'; } else if (item.record_status_id === 3 || item.record_status_id === 4) { statusText = 'Sold';
                        statusClass = 'sold'; } else if (item.record_status_id === 1) { statusText = 'New';
                        statusClass = 'new'; } else { statusText = 'Not found';
                        statusClass = ''; }
                    statusCell.innerHTML = '<span class="status-badge ' + statusClass + '">' + statusText + '</span>';
                }
            }
        } catch (error) {
            console.warn('Could not fetch record details:', error);
        }
    }

    async function markRecordSoldOnDiscogs(recordId) {
        if (!recordId) {
            showStatus('No record ID provided.', 'error');
            return;
        }

        if (!confirm('Mark record #' + recordId + ' as sold on Discogs?\n\nThis will:\n- Search Discogs orders for this record\n- Auto-fetch the sale price\n- Mark the record as sold (status_id=4)\n- Set the sale date to today')) {
            return;
        }

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/records/' + recordId + '/mark-discogs-sold', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.status === 'success') {
                const price = data.record ? data.record.store_price : 'unknown';
                const display = getShortRecordDisplay(data.record || { id: recordId }, 30);
                showStatus('✅ Record #' + recordId + ' (' + display + ') marked as sold on Discogs for $' + price, 'success');
                playSound('success');

                if (state.currentSearchMode === 'discogs_orders' && state.selectedOrderId) {
                    await loadOrderItems(state.selectedOrderId);
                } else {
                    render();
                }
            } else {
                showStatus('❌ Error: ' + (data.error || 'Failed to mark record as sold'), 'error');
                playSound('error');
            }
        } catch (error) {
            console.error('Error marking record sold on Discogs:', error);
            showStatus('❌ Error: ' + error.message, 'error');
            playSound('error');
        }
    }

    // ============================================================
    // EXPOSE GLOBALS
    // ============================================================

    window.getRecordDisplay = getRecordDisplay;
    window.getShortRecordDisplay = getShortRecordDisplay;
    window.expandImage = window.expandImage;

    window.selectPurchase = selectPurchase;
    window.savePurchaseMetadata = savePurchaseMetadata;
    window.uploadBillForPurchase = uploadBillForPurchase;
    window.deletePurchase = deletePurchase;
    window.clearPurchaseSelection = clearPurchaseSelection;
    window.createNewPurchase = createNewPurchase;
    window.acceptDraft = acceptDraft;
    window.refreshPurchases = loadPurchasesTable;
    window.loadPurchasesTable = loadPurchasesTable;
    window.removeRecordFromPurchase = removeRecordFromPurchase;
    window.togglePurchaseTable = togglePurchaseTable;
    window.toggleMetadataPanel = toggleMetadataPanel;

    window.toggleInventorySetupPanel = toggleInventorySetupPanel;
    window.toggleDefaultParamsSub = toggleDefaultParamsSub;
    window.applyDefaultParams = applyDefaultParams;
    window.clearDefaultParams = clearDefaultParams;

    window.refreshDiscogsLocations = loadDiscogsLocations;
    window.showDiscogsPostModal = showDiscogsPostModal;
    window.closeDiscogsPostModal = closeDiscogsPostModal;

    window.loadDomainGenres = loadDomainGenres;
    window.loadDomainFormats = loadDomainFormats;
    window.deleteDomainGenre = deleteDomainGenre;
    window.deleteDomainFormat = deleteDomainFormat;

    window.openBillModal = openBillModal;
    window.closeBillModal = closeBillModal;

    window.addMarkupRule = window.addMarkupRule;
    window.updateMarkupRule = window.updateMarkupRule;
    window.deleteMarkupRule = window.deleteMarkupRule;

    window.initAddRecordsTab = function() {
        console.log('🔵 TabManager called initAddRecordsTab');
        if (!initialized) {
            init();
        } else {
            console.log('🔄 initAddRecordsTab: already initialized');
        }
    };

    window.initInventoryOpsTab = window.initAddRecordsTab;

    // ============================================================
    // AUTO-INIT
    // ============================================================

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(function() {
            if (!initialized) {
                console.log('🔄 Auto-initializing inventory-ops (fallback)');
                init();
            }
        }, 1000);
    }

    console.log('✅ All functions exposed to window');
    console.log('✅ applyDefaultParams and clearDefaultParams are now globally available.');

})();  