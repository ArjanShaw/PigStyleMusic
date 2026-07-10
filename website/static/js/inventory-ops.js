// ============================================================================
// inventory-ops.js - Unified Inventory Operations
// Modes: Add Record, Scan/Locate, Post to Discogs, Delete, Checkout, Discogs Orders
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
    const completeActionBtn = document.getElementById('complete-action-btn');
    const cogsBtn = document.getElementById('cogs-btn');
    const printBtn = document.getElementById('print-btn');
    const setActiveBtn = document.getElementById('set-active-btn');
    const cancelRangeBtn = document.getElementById('cancel-range-btn');

    // Discogs UI elements
    const discogsUi = document.getElementById('filter-group');
    const discogsLocationSelect = document.getElementById('discogs-location-select');
    const discogsStatusMessage = document.getElementById('discogs-status-message');
    const lastSeenCutoffDateInput = document.getElementById('last-seen-cutoff-date');
    const applyLastSeenFilterBtn = document.getElementById('apply-last-seen-filter');

    // Delete mode filters
    const deleteStatusFilter = document.getElementById('delete-status-filter');

    // Checkout filters – we keep the element but hide the status dropdown
    const checkoutFilters = document.getElementById('checkout-filters');
    const checkoutShowSelectedBtn = document.getElementById('checkout-show-selected-btn');
    const checkoutShowAllBtn = document.getElementById('checkout-show-all-btn');

    // Discogs Orders filters
    const discogsOrderSelect = document.getElementById('discogs-order-select');
    const discogsOrdersRefreshBtn = document.getElementById('discogs-orders-refresh-btn');
    const discogsOrdersStatus = document.getElementById('discogs-orders-status');
    const discogsOrdersStatusFilter = document.getElementById('discogs-orders-status-filter');

    // ========== State ==========
    let currentSearchMode = 'add';
    let currentResults = [];
    let conditions = [];
    let consignors = [];
    let minimumPrice = null;
    let selectedConsignorId = null;
    let storePriceMultiplier = null;
    let consignorMap = {};
    let accounts = [];
    let genres = [];
    let _initialized = false;

    let allRecords = [];
    let filteredRecords = [];
    let currentPage = 1;
    let pageSize = 50;
    let totalRecords = 0;

    let currentMode = 'inventory';
    let rangeFromIndex = null;
    let rangeToIndex = null;
    let isRangeMode = false;

    // Scan state
    let lastSubmittedLocation = localStorage.getItem('lastSubmittedLocation') || null;

    // Checkout state
    let checkoutSelectedItems = [];
    let checkoutViewMode = 'list'; // 'list' = show checkout items, 'search' = show search results
    let checkoutRemaining = 0;
    let checkoutPaymentEntries = [];
    let checkoutTotal = 0;

    // Discogs state
    let currentLocationRecords = [];
    let discogsFilteredRecords = [];
    let currentLocation = null;
    let lastSeenCutoffDate = null;

    // Discogs Orders state
    let ordersList = [];
    let currentOrderItems = [];
    let selectedOrderId = null;
    let ordersStatusFilter = '';

    // Square state
    let squareAvailable = false;
    let squareCheckoutId = null;
    let squarePollInterval = null;
    let availableTerminals = [];

    // Chart variables
    let markupCurveChart = null;
    let markupDistributionChart = null;
    let ageDistributionChart = null;

    // ========== Audio ==========
    let audioContext = null;

    function initAudio() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playBeep(frequency = 800, duration = 200, type = 'sine') {
        try {
            initAudio();
            if (audioContext.state === 'suspended') audioContext.resume();
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.frequency.value = frequency;
            osc.type = type;
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + duration / 1000);
            osc.start();
            osc.stop(audioContext.currentTime + duration / 1000);
        } catch (e) { console.warn('Beep error:', e); }
    }

    function playErrorSound() {
        try {
            initAudio();
            if (audioContext.state === 'suspended') audioContext.resume();
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.frequency.value = 220;
            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.4, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.6);
            osc.start();
            osc.stop(audioContext.currentTime + 0.6);
        } catch (e) { console.warn('Error sound error:', e); }
    }

    function playSuccessSound() {
        try {
            initAudio();
            if (audioContext.state === 'suspended') audioContext.resume();
            const notes = [523.25, 659.25, 783.99];
            notes.forEach((freq, i) => {
                setTimeout(() => {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    osc.connect(gain);
                    gain.connect(audioContext.destination);
                    osc.frequency.value = freq;
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.2);
                    osc.start();
                    osc.stop(audioContext.currentTime + 0.2);
                }, i * 100);
            });
        } catch (e) { console.warn('Success sound error:', e); }
    }

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

    function showDiscogsStatus(message, type) {
        const el = document.getElementById('discogs-status-message');
        if (!el) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        el.className = 'status-message status-' + type;
        el.style.display = 'block';
        setTimeout(() => { if (el) el.style.display = 'none'; }, 8000);
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

    function formatLastSeen(lastSeen) {
        if (!lastSeen) return '<span style="color: #dc3545;">Never</span>';
        try {
            const lastSeenDate = new Date(lastSeen);
            const today = new Date();
            const daysSince = Math.floor((today - lastSeenDate) / (1000 * 60 * 60 * 24));
            const cutoffDate = getLastSeenCutoffDate();
            if (cutoffDate) {
                const cutoffDateObj = new Date(cutoffDate);
                if (lastSeenDate < cutoffDateObj) {
                    return `<span style="color: #dc3545;" title="Before cutoff date">${daysSince} days ago (⚠️)</span>`;
                }
            }
            if (daysSince === 0) return '<span style="color: #28a745;">Today</span>';
            if (daysSince === 1) return '<span style="color: #28a745;">Yesterday</span>';
            if (daysSince <= 7) return `<span style="color: #ffc107;">${daysSince} days ago</span>`;
            if (daysSince <= 30) return `<span style="color: #fd7e14;">${daysSince} days ago</span>`;
            return `<span style="color: #dc3545;">${daysSince} days ago</span>`;
        } catch (e) {
            return lastSeen;
        }
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
            accounts = accounts.filter(acc => acc && acc.code && acc.name);
            console.log('✅ Loaded accounts:', accounts.length);
        } catch (e) {
            console.warn('Could not load accounts:', e);
            accounts = [];
        }
    }

    async function loadGenres() {
        try {
            const data = await apiGet('/api/genres');
            genres = data.genres || [];
        } catch (e) {
            console.warn('Could not load genres:', e);
            genres = [];
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

    // ========== UNIFIED RECORD LOADER ==========
    async function loadRecords(options = {}) {
        console.log('🔵 loadRecords called with options:', options);
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
                showAllStatuses = false
            } = options;

            let url = '/records';
            let params = new URLSearchParams();

            if (location) {
                url = '/api/records/by-location';
                params.append('location', location);
            } else {
                if (showAllStatuses) {
                    // no status filter
                } else if (statusIds && statusIds.length > 0) {
                    params.append('status_ids', statusIds.join(','));
                }
                if (requireImage) params.append('require_image', 'true');
                if (requireLocation) params.append('require_location', 'true');
                if (excludeOldNoLocation) params.append('exclude_old_no_location', 'true');
                if (bypassDateFilter && !createdAfter) {
                    params.append('bypass_date_filter', 'true');
                }
                if (createdAfter) {
                    params.append('created_after', createdAfter);
                }
                if (limit) params.append('limit', limit);
                if (random) params.append('random', 'true');
                if (hasYoutube) params.append('has_youtube', 'true');
                if (search && filterBySearch) {
                    params.append('search', search);
                }
            }

            const queryString = params.toString();
            const fullUrl = window.AppConfig.baseUrl + url + (queryString ? '?' + queryString : '');
            console.log(`🔵 loadRecords: fetching ${fullUrl}`);

            const response = await fetch(fullUrl, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to load records');

            let records = data.records || [];
            console.log(`🔵 loadRecords: API returned ${records.length} records`);

            if (location && search && filterBySearch) {
                const term = search.toLowerCase();
                const before = records.length;
                records = records.filter(r =>
                    (r.artist && r.artist.toLowerCase().includes(term)) ||
                    (r.title && r.title.toLowerCase().includes(term)) ||
                    (r.barcode && r.barcode.toLowerCase().includes(term)) ||
                    (r.catalog_number && r.catalog_number.toLowerCase().includes(term))
                );
                console.log(`🔵 loadRecords: location search filtered from ${before} to ${records.length}`);
            }

            if (!location && search && !filterBySearch) {
                const term = search.toLowerCase();
                const before = records.length;
                records = records.filter(r =>
                    (r.artist && r.artist.toLowerCase().includes(term)) ||
                    (r.title && r.title.toLowerCase().includes(term)) ||
                    (r.barcode && r.barcode.toLowerCase().includes(term)) ||
                    (r.catalog_number && r.catalog_number.toLowerCase().includes(term))
                );
                console.log(`🔵 loadRecords: client search filtered from ${before} to ${records.length}`);
            }

            // Only apply last‑seen filter if cutoff is actually set
            if (mode === 'discogs' && lastSeenCutoffDate) {
                const before = records.length;
                records = records.filter(r => meetsLastSeenFilter(r));
                console.log(`🔵 loadRecords: last‑seen filter reduced from ${before} to ${records.length}`);
            }

            allRecords = records;
            filteredRecords = records;
            totalRecords = filteredRecords.length;
            currentPage = 1;
            currentMode = mode || 'inventory';

            if (mode === 'add' && !search) {
                currentResults = [];
            }

            console.log(`🔵 loadRecords: about to render with ${filteredRecords.length} records`);
            renderPagination();
            renderTablePage();

            let statusMsg = `Showing ${totalRecords} records`;
            if (statusIds && statusIds.length === 1) statusMsg += ` with status_id=${statusIds[0]}`;
            else if (statusIds && statusIds.length > 1) statusMsg += ` with status_ids ${statusIds.join(', ')}`;
            if (location) statusMsg += ` in location "${location}"`;
            if (search) statusMsg += ` matching "${search}"`;
            showStatus(statusMsg, 'info');
            updateSelectionCount();
            updateFilterVisibility();

            if (mode === 'discogs') {
                if (location) {
                    currentLocationRecords = records;
                }
                console.log(`🔵 loadRecords: calling populateDiscogsPrices for ${records.length} records`);
                await populateDiscogsPrices(records);
            }

            return records;
        } catch (error) {
            console.error('❌ loadRecords error:', error);
            showStatus('Error loading records: ' + error.message, 'error');
            return [];
        }
    }

    // ========== Load Discogs Locations (kept separate) ==========
    async function loadDiscogsLocations() {
        console.log('📍 Loading discogs locations...');
        try {
            const url = window.AppConfig.baseUrl + '/api/locations';
            const response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
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
        discogsLocationSelect.innerHTML = `
            <option value="all">-- All (no filter) --</option>
            <option value="all_with_location">-- All with Location --</option>
        `;
        if (!locations || locations.length === 0) {
            return;
        }
        locations.forEach(function(location) {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            discogsLocationSelect.appendChild(option);
        });
    }

    // ========== Refresh Discogs records based on location dropdown ==========
    function refreshDiscogsRecords() {
        const selectedValue = discogsLocationSelect ? discogsLocationSelect.value : null;
        const baseOptions = { mode: 'discogs' };

        console.log(`🔄 refreshDiscogsRecords: selectedValue = ${selectedValue}`);
        if (!selectedValue || selectedValue === 'all') {
            loadRecords({ showAllStatuses: true, ...baseOptions });
        } else if (selectedValue === 'all_with_location') {
            loadRecords({ showAllStatuses: true, requireLocation: true, ...baseOptions });
        } else {
            currentLocation = selectedValue;
            loadRecords({ showAllStatuses: true, location: selectedValue, ...baseOptions });
        }
    }

    // ========== Populate Discogs Prices (does NOT reset filteredRecords) ==========
    async function populateDiscogsPrices(records) {
        console.log(`💰 populateDiscogsPrices: received ${records.length} records`);
        if (!records || records.length === 0) {
            console.log('💰 populateDiscogsPrices: no records, returning');
            return;
        }

        // Filter only eligible records (status_id=2, no consignor, meets last_seen, has created_at)
        const eligibleRecords = records.filter(r => {
            const eligible = r.status_id === 2 && !hasConsignor(r) && meetsLastSeenFilter(r) && r.created_at;
            if (eligible) {
                console.log(`💰 Eligible record ${r.id}: ${r.artist} - ${r.title}`);
            }
            return eligible;
        });
        console.log(`💰 populateDiscogsPrices: ${eligibleRecords.length} eligible out of ${records.length}`);

        if (eligibleRecords.length === 0) {
            console.log('💰 No eligible records, skipping price calculation');
            return;
        }

        const priceRequests = eligibleRecords.map(r => ({
            id: r.id,
            created_at: r.created_at,
            store_price: r.store_price
        }));

        let pricesMap = {};
        try {
            const batchResults = await calculateMarkupBatch(priceRequests);
            console.log(`💰 populateDiscogsPrices: got ${batchResults.length} price results`);
            batchResults.forEach(item => {
                if (item.id) {
                    pricesMap[item.id] = item;
                }
            });
        } catch (error) {
            console.error('💰 populateDiscogsPrices: error calculating prices:', error);
            return;
        }

        // Update records with price data (do NOT change filteredRecords)
        let updatedCount = 0;
        records.forEach(record => {
            if (pricesMap[record.id]) {
                record._discogsPrice = pricesMap[record.id].discogs_price;
                record._markupPercent = pricesMap[record.id].markup_percent;
                updatedCount++;
            } else {
                record._discogsPrice = null;
                record._markupPercent = null;
            }
        });
        console.log(`💰 populateDiscogsPrices: updated ${updatedCount} records with price data`);

        // Re-render the table to show the new price columns (but keep filteredRecords unchanged)
        renderTablePage();
        updateSelectionCount();
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

    // ========== Batch Markup Calculation ==========
    async function calculateMarkupBatch(records) {
        if (!records || records.length === 0) return [];
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/discogs/calculate-markup-batch', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: records })
            });
            const result = await response.json();
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

    // ========== Load Discogs Orders List (with status filter) ==========
    async function loadDiscogsOrdersList(status) {
        console.log(`📦 loadDiscogsOrdersList() called with status: ${status || 'all'}`);
        try {
            let url = `${AppConfig.baseUrl}/api/discogs/orders?per_page=200`;
            if (status) {
                url += `&status=${encodeURIComponent(status)}`;
            }
            console.log(`📦 Fetching orders from: ${url}`);

            const response = await fetch(url, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });

            if (!response.ok) {
                let errorMsg = `HTTP ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                } catch (e) {}
                throw new Error(errorMsg);
            }

            const data = await response.json();
            if (data.status !== 'success') {
                throw new Error(data.error || 'Failed to load orders');
            }

            ordersList = data.orders || [];
            console.log(`📦 Loaded ${ordersList.length} orders`);

            // Populate dropdown
            if (discogsOrderSelect) {
                discogsOrderSelect.innerHTML = '<option value="">-- Select an order --</option>';
                for (const order of ordersList) {
                    const option = document.createElement('option');
                    option.value = order.order_id || order.id;
                    const buyer = order.buyer_username || order.buyer_name || 'Unknown buyer';
                    const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '';
                    const total = order.total_amount ? `$${order.total_amount.toFixed(2)}` : '';
                    option.textContent = `${order.order_id} - ${buyer} ${date} ${total}`;
                    discogsOrderSelect.appendChild(option);
                }
            }

            updateDiscogsOrdersStatus(`✅ Loaded ${ordersList.length} orders`, 'success');

        } catch (error) {
            console.error('❌ Error loading orders:', error);
            updateDiscogsOrdersStatus(`❌ Error: ${error.message}`, 'error');
        }
    }

    // ========== Load Order Items ==========
    async function loadOrderItems(orderId) {
        console.log(`📦 loadOrderItems() for order ${orderId}`);
        if (!orderId) {
            currentOrderItems = [];
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            return;
        }

        try {
            const url = `${AppConfig.baseUrl}/api/discogs/orders/${orderId}`;
            const response = await fetch(url, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });

            if (!response.ok) {
                let errorMsg = `HTTP ${response.status}`;
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

            // Enrich items with PigStyle ID and record lookup
            const enrichedItems = [];
            for (const item of items) {
                // Extract PigStyle ID from condition_comments or private_comments
                let pigstyleId = null;
                if (item.condition_comments) {
                    const match = item.condition_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                    if (match) pigstyleId = parseInt(match[1], 10);
                }
                if (!pigstyleId && item.private_comments) {
                    const match = item.private_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                    if (match) pigstyleId = parseInt(match[1], 10);
                }

                let record = null;
                let recordStatus = null;
                let barcode = null;
                let catalog = null;
                if (pigstyleId) {
                    // Look up the record in the local database
                    try {
                        const recRes = await fetch(`${AppConfig.baseUrl}/records/${pigstyleId}`, {
                            credentials: 'include',
                            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
                        });
                        if (recRes.ok) {
                            const recData = await recRes.json();
                            record = recData;
                            recordStatus = recData.status_id;
                            barcode = recData.barcode || null;
                            catalog = recData.catalog_number || null;
                        } else {
                            recordStatus = null; // not found
                        }
                    } catch (e) {
                        console.warn(`Could not fetch record ${pigstyleId}:`, e);
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
                    quantity: item.quantity || 1
                });
            }

            currentOrderItems = enrichedItems;
            filteredRecords = enrichedItems;
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            updateSelectionCount();
            updateDiscogsOrdersStatus(`✅ Order ${orderId}: ${enrichedItems.length} items loaded`, 'success');

        } catch (error) {
            console.error('❌ Error loading order items:', error);
            currentOrderItems = [];
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            updateDiscogsOrdersStatus(`❌ Error: ${error.message}`, 'error');
        }
    }

    // ========== Process Discogs Order (Mark Sold) ==========
    async function processDiscogsOrder() {
        const items = filteredRecords;
        if (items.length === 0) {
            showStatus('No items to process.', 'warning');
            return;
        }

        // Collect items with valid PigStyle ID
        const validItems = items.filter(item => item.pigstyle_id && !isNaN(item.pigstyle_id));
        if (validItems.length === 0) {
            showStatus('No items have a valid PigStyle ID. Please assign IDs first.', 'warning');
            return;
        }

        const confirmMsg = `Mark ${validItems.length} item(s) as sold on Discogs?\n\nThis will:\n- Mark each record as sold (status_id=4)\n- Set the sale price from the order\n- Link the Discogs order ID`;
        if (!confirm(confirmMsg)) return;

        let posted = 0;
        let failed = 0;
        for (const item of validItems) {
            const recordId = item.pigstyle_id;
            const salePrice = item.price;
            const orderId = selectedOrderId;

            try {
                const response = await fetch(`${AppConfig.baseUrl}/api/records/mark-sold-on-discogs`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        record_id: recordId,
                        sale_price: salePrice,
                        discogs_order_id: orderId
                    })
                });
                const data = await response.json();
                if (data.status === 'success') {
                    posted++;
                    // Update the item's status
                    item.record_status_id = 4;
                } else {
                    failed++;
                    console.error('Failed to mark sold:', data.error);
                }
            } catch (error) {
                failed++;
                console.error('Error marking sold:', error);
            }
        }

        showStatus(`✅ ${posted} marked sold, ${failed} failed.`, posted > 0 ? 'success' : 'error');
        // Refresh order items to reflect new statuses
        if (selectedOrderId) {
            await loadOrderItems(selectedOrderId);
        }
    }

    // ========== Helpers for Discogs Orders ==========
    function updateDiscogsOrdersStatus(message, type) {
        if (!discogsOrdersStatus) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        discogsOrdersStatus.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        discogsOrdersStatus.className = `status-message status-${type}`;
        discogsOrdersStatus.style.display = 'block';
        setTimeout(() => {
            if (discogsOrdersStatus) discogsOrdersStatus.style.display = 'none';
        }, 8000);
    }

    // ========== Render Table ==========
    function renderTablePage() {
        console.log(`🔄 renderTablePage() – mode: ${currentSearchMode}, records: ${filteredRecords.length}`);
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredRecords.length);
        const pageRecords = filteredRecords.slice(start, end);

        let theadHtml = '';
        if (currentSearchMode === 'add') {
            const isSearchResult = currentMode === 'search' && currentResults.length > 0;
            if (isSearchResult) {
                const condOptions = conditions.map(c =>
                    `<option value="${c.id}">${c.display_name || c.condition_name}</option>`
                ).join('');
                const consignorOptions = consignors.map(c =>
                    `<option value="${c.id}" ${c.id === selectedConsignorId ? 'selected' : ''}>${c.username}</option>`
                ).join('');

                theadHtml = `
                    <tr>
                        <th style="width:60px;">Range</th>
                        <th style="width:60px;">Image</th>
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
                        <th>COGS</th>
                        <th>Catalog #</th>
                        <th>Barcode</th>
                        <th>Created At</th>
                    </tr>
                `;
            }
        } else if (currentSearchMode === 'scan') {
            theadHtml = `
                <tr>
                    <th>ID</th>
                    <th>Artist</th>
                    <th>Title</th>
                    <th>Price</th>
                    <th>Barcode</th>
                    <th>Last Seen</th>
                </tr>
            `;
        } else if (currentSearchMode === 'discogs') {
            theadHtml = `
                <tr>
                    <th style="width:60px;">Range</th>
                    <th>Image</th>
                    <th>ID</th>
                    <th>Artist</th>
                    <th>Title</th>
                    <th>Catalog #</th>
                    <th>Media Cond</th>
                    <th>Sleeve Cond</th>
                    <th>Store Price</th>
                    <th>Discogs Price</th>
                    <th>Markup %</th>
                    <th>Location</th>
                    <th>Post</th>
                </tr>
            `;
        } else if (currentSearchMode === 'delete') {
            theadHtml = `
                <tr>
                    <th style="width:60px;">Range</th>
                    <th>ID</th>
                    <th>Artist</th>
                    <th>Title</th>
                    <th>Price</th>
                    <th>Status</th>
                </tr>
            `;
        } else if (currentSearchMode === 'checkout') {
            // Checkout: always show ID, Artist, Title, Price, Barcode, Action
            theadHtml = `
                <tr>
                    <th>ID</th>
                    <th>Artist</th>
                    <th>Title</th>
                    <th>Price</th>
                    <th>Barcode</th>
                    <th>Action</th>
                </tr>
            `;
        } else if (currentSearchMode === 'discogs_orders') {
            theadHtml = `
                <tr>
                    <th>#</th>
                    <th>Artist</th>
                    <th>Title</th>
                    <th>Catalog</th>
                    <th>Barcode</th>
                    <th>Price</th>
                    <th>Condition</th>
                    <th>PigStyle ID</th>
                    <th>Status</th>
                </tr>
            `;
        }
        recordsTableHead.innerHTML = theadHtml;

        let tbodyHtml = '';
        if (pageRecords.length === 0) {
            let msg = 'No records found';
            if (currentSearchMode === 'add' && currentMode !== 'search') msg = 'No new records (status_id=1). Search Discogs to add records.';
            if (currentSearchMode === 'scan') msg = 'Scan barcodes to add records.';
            if (currentSearchMode === 'discogs') msg = 'No records found. Check filters or add records in "Add Record" mode.';
            if (currentSearchMode === 'delete') msg = 'No records to delete.';
            if (currentSearchMode === 'checkout') {
                if (checkoutViewMode === 'list') {
                    msg = checkoutSelectedItems.length === 0 ? 'No records in checkout. Search to add records.' : 'No records in checkout.';
                } else {
                    msg = 'No records match your search. Try a different term.';
                }
            }
            if (currentSearchMode === 'discogs_orders') {
                if (ordersList.length === 0) msg = 'No Discogs orders found. Click Refresh Orders.';
                else if (!selectedOrderId) msg = 'Select an order from the dropdown.';
                else msg = 'This order has no items.';
            }
            const colCount = currentSearchMode === 'discogs_orders' ? 9 :
                             (currentSearchMode === 'add' ? (currentMode === 'search' ? 11 : 9) :
                             (currentSearchMode === 'scan' ? 6 :
                             (currentSearchMode === 'discogs' ? 13 :
                             (currentSearchMode === 'delete' ? 6 : 6))));
            tbodyHtml = `<tr><td colspan="${colCount}" style="text-align:center;padding:40px;">${msg}</td></tr>`;
        } else {
            const data = getCurrentData();
            pageRecords.forEach((record, idx) => {
                const globalIndex = start + idx;
                const isSelected = (rangeFromIndex !== null && rangeToIndex !== null &&
                                    globalIndex >= Math.min(rangeFromIndex, rangeToIndex) &&
                                    globalIndex <= Math.max(rangeFromIndex, rangeToIndex));

                let rowClass = isSelected ? 'record-selected' : '';
                let fromButton, toButton;
                const showRange = (currentSearchMode === 'add' && currentMode === 'search') ||
                                  currentSearchMode === 'discogs' ||
                                  currentSearchMode === 'delete';
                if (!showRange) {
                    fromButton = '';
                    toButton = '';
                } else if (!isRangeMode) {
                    fromButton = `<button class="btn-from" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button>`;
                    toButton = `<span style="color:#999;">to</span>`;
                } else {
                    if (rangeFromIndex === globalIndex && rangeToIndex === globalIndex) {
                        fromButton = `<span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">FROM ✓</span>`;
                        toButton = `<span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">TO ✓</span>`;
                    } else if (rangeFromIndex === globalIndex) {
                        fromButton = `<span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">FROM ✓</span>`;
                        toButton = `<button class="btn-to" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>`;
                    } else if (rangeToIndex === globalIndex) {
                        fromButton = `<button class="btn-from" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button>`;
                        toButton = `<span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">TO ✓</span>`;
                    } else {
                        fromButton = `<button class="btn-from" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button>`;
                        toButton = `<button class="btn-to" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>`;
                    }
                }

                let rowHtml = `<tr class="${rowClass}" data-index="${globalIndex}">`;

                if (currentSearchMode === 'add') {
                    if (currentMode === 'search' && currentResults.length > 0) {
                        const artist = record.artist || 'Unknown';
                        const title = record.title || 'Unknown';
                        const catalog = record.catalog_number || '';
                        const condOptions = conditions.map(c =>
                            `<option value="${c.id}">${c.display_name || c.condition_name}</option>`
                        ).join('');
                        const consignorOptions = consignors.map(c =>
                            `<option value="${c.id}" ${c.id === selectedConsignorId ? 'selected' : ''}>${c.username}</option>`
                        ).join('');

                        const imageUrl = record.image_url || record.thumb || '';
                        const imageHtml = imageUrl ?
                            `<img src="${escapeHtml(imageUrl)}" style="width:80px; height:80px; object-fit:cover; border-radius:4px;">` :
                            `<div style="width:80px; height:80px; background:#eee; border-radius:4px;"></div>`;

                        rowHtml += `
                            <td style="text-align:center;">${fromButton} ${toButton}</td>
                            <td style="text-align:center;">${imageHtml}</td>
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
                        const cogs = record.cogs ? `$${record.cogs.toFixed(2)}` : '—';
                        const catalog = record.catalog_number || '—';
                        const barcode = record.barcode || record.id;
                        const created = record.created_at ? new Date(record.created_at).toLocaleString() : 'Unknown';
                        rowHtml += `
                            <td style="text-align:center;">${fromButton} ${toButton}</td>
                            <td>${id}</td>
                            <td>${escapeHtml(artist)}</td>
                            <td>${escapeHtml(title)}</td>
                            <td>${price}</td>
                            <td>${cogs}</td>
                            <td>${escapeHtml(catalog)}</td>
                            <td><span class="barcode-value">${barcode}</span></td>
                            <td>${created}</td>
                        `;
                    }
                } else if (currentSearchMode === 'scan') {
                    const id = record.id;
                    const artist = record.artist || 'Unknown';
                    const title = record.title || 'Unknown';
                    const price = record.store_price ? `$${record.store_price.toFixed(2)}` : 'N/A';
                    const barcode = record.barcode || record.id;
                    const lastSeen = record.last_seen ? new Date(record.last_seen).toLocaleDateString() : 'Never';
                    rowHtml += `
                        <td>${id}</td>
                        <td>${escapeHtml(artist)}</td>
                        <td>${escapeHtml(title)}</td>
                        <td>${price}</td>
                        <td><span class="barcode-value">${barcode}</span></td>
                        <td>${lastSeen}</td>
                    `;
                } else if (currentSearchMode === 'discogs') {
                    // Show ALL records – location may be missing
                    const id = record.id;
                    const artist = record.artist || 'Unknown';
                    const title = record.title || 'Unknown';
                    const catalog = record.catalog_number || '—';
                    const mediaCond = record.disc_condition_name || '—';
                    const sleeveCond = record.sleeve_condition_name || '—';
                    const storePrice = record.store_price ? `$${parseFloat(record.store_price).toFixed(2)}` : '—';
                    const imageUrl = record.image_url && record.image_url !== '' && record.image_url !== 'None' ? record.image_url : null;
                    const location = record.location || '—';
                    const discogsPrice = record._discogsPrice !== undefined ? record._discogsPrice : null;
                    const markupPercent = record._markupPercent !== undefined ? record._markupPercent : null;
                    const displayDiscogsPrice = discogsPrice ? '$' + discogsPrice.toFixed(2) : '—';
                    const markupClass = (markupPercent > 0) ? 'positive' : ((markupPercent < 0) ? 'negative' : 'zero');
                    const displayMarkup = (markupPercent !== null) ? (markupPercent > 0 ? '+' : '') + markupPercent + '%' : '—';

                    const imgHtml = imageUrl ? `<img src="${escapeHtml(imageUrl)}" style="width:80px; height:80px; object-fit:cover; border-radius:4px;">` : '<div style="width:80px; height:80px; background:#e0e0e0; border-radius:4px;"></div>';

                    rowHtml += `
                        <td style="text-align:center;">${fromButton} ${toButton}</td>
                        <td style="text-align:center;">${imgHtml}</td>
                        <td>${id}</td>
                        <td><strong>${escapeHtml(artist)}</strong></td>
                        <td>${escapeHtml(title)}</td>
                        <td>${escapeHtml(catalog)}</td>
                        <td>${escapeHtml(mediaCond)}</td>
                        <td>${escapeHtml(sleeveCond)}</td>
                        <td>${storePrice}</td>
                        <td class="discogs-price-cell" style="${discogsPrice ? 'color: #28a745; font-weight: bold;' : 'color: #999;'}">${displayDiscogsPrice}</td>
                        <td class="markup-cell ${markupClass}">${displayMarkup}</td>
                        <td title="${escapeHtml(location)}" style="font-size: 12px;">${escapeHtml(location.length > 30 ? location.substring(0,27)+'...' : location)}</td>
                        <td style="text-align: center;">
                            ${discogsPrice ? `<button class="post-single-btn" data-record-id="${record.id}" data-artist="${escapeHtml(artist)}" data-title="${escapeHtml(title)}" data-price="${record.store_price}" data-discogs-price="${discogsPrice}" data-markup-percent="${markupPercent}" data-media-condition="${mediaCond}" data-sleeve-condition="${sleeveCond}" data-catalog="${escapeHtml(catalog)}" data-location="${escapeHtml(location)}" data-notes="${escapeHtml(record.notes || '')}"><i class="fab fa-discogs"></i> Post</button>` :
                                    '<span style="color: #999;">—</span>'}
                        </td>
                    `;
                } else if (currentSearchMode === 'delete') {
                    const id = record.id;
                    const artist = record.artist || 'Unknown';
                    const title = record.title || 'Unknown';
                    const price = record.store_price ? `$${record.store_price.toFixed(2)}` : 'N/A';
                    const statusName = getStatusName(record.status_id);
                    const statusClass = getStatusClass(record.status_id);
                    rowHtml += `
                        <td style="text-align:center;">${fromButton} ${toButton}</td>
                        <td>${id}</td>
                        <td>${escapeHtml(artist)}</td>
                        <td>${escapeHtml(title)}</td>
                        <td>${price}</td>
                        <td><span class="status-badge ${statusClass}">${statusName}</span></td>
                    `;
                } else if (currentSearchMode === 'checkout') {
                    const id = record.id;
                    const artist = record.artist || 'Unknown';
                    const title = record.title || 'Unknown';
                    const price = record.store_price ? `$${record.store_price.toFixed(2)}` : 'N/A';
                    const barcode = record.barcode || record.id;
                    const inSelected = checkoutSelectedItems.some(r => r.id === record.id);
                    // In checkout, we always show Add/Remove, but if we're in 'list' view, we show Remove for items in list,
                    // and if we're in 'search' view, we show Add for items not in list.
                    let actionHtml;
                    if (checkoutViewMode === 'list') {
                        // List view: only show Remove for items in the list (all records in filteredRecords are in checkout)
                        actionHtml = `<button class="btn btn-sm btn-danger remove-checkout-item" data-record-id="${record.id}"><i class="fas fa-minus"></i> Remove</button>`;
                    } else {
                        // Search view: show Add if not already in checkout, else Remove
                        if (inSelected) {
                            actionHtml = `<button class="btn btn-sm btn-danger remove-checkout-item" data-record-id="${record.id}"><i class="fas fa-minus"></i> Remove</button>`;
                        } else {
                            actionHtml = `<button class="btn btn-sm btn-success add-checkout-item" data-record-id="${record.id}"><i class="fas fa-plus"></i> Add</button>`;
                        }
                    }
                    // Show custom badge for custom items
                    const isCustom = record.isCustom === true;
                    const customBadge = isCustom ? '<span class="status-badge" style="background:#17a2b8; color:white; margin-left:5px;">Custom</span>' : '';
                    rowHtml += `
                        <td>${id}${customBadge}</td>
                        <td>${escapeHtml(artist)}</td>
                        <td>${escapeHtml(title)}</td>
                        <td>${price}</td>
                        <td><span class="barcode-value">${barcode}</span></td>
                        <td>${actionHtml}</td>
                    `;
                } else if (currentSearchMode === 'discogs_orders') {
                    // Render order item row with editable PigStyle ID
                    const orderItem = record;
                    const idxNum = globalIndex + 1;
                    const artist = orderItem.artist || 'Unknown';
                    const title = orderItem.title || 'Unknown';
                    const catalog = orderItem.catalog_number || '—';
                    const barcode = orderItem.barcode || '—';
                    const price = orderItem.price || 0;
                    const condition = orderItem.media_condition || '—';
                    const pigstyleId = orderItem.pigstyle_id || '';
                    const recordStatus = orderItem.record_status_id;
                    let statusText = '—';
                    let statusClass = '';
                    if (recordStatus === 2) { statusText = 'Active'; statusClass = 'active'; }
                    else if (recordStatus === 3 || recordStatus === 4) { statusText = 'Sold'; statusClass = 'sold'; }
                    else if (recordStatus === 1) { statusText = 'New'; statusClass = 'new'; }
                    else { statusText = 'Not found'; statusClass = ''; }

                    rowHtml += `
                        <td>${idxNum}</td>
                        <td>${escapeHtml(artist)}</td>
                        <td>${escapeHtml(title)}</td>
                        <td>${escapeHtml(catalog)}</td>
                        <td>${escapeHtml(barcode)}</td>
                        <td>$${price.toFixed(2)}</td>
                        <td>${escapeHtml(condition)}</td>
                        <td>
                            <input type="text" class="pigstyle-id-input" value="${escapeHtml(pigstyleId)}" 
                                   placeholder="ID or barcode" style="width:100px; padding:4px; border:1px solid #ddd; border-radius:4px;">
                            <button class="btn btn-sm btn-secondary scan-pigstyle-btn" style="padding:2px 6px; font-size:12px;">
                                <i class="fas fa-qrcode"></i>
                            </button>
                        </td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    `;
                }

                rowHtml += `</tr>`;
                tbodyHtml += rowHtml;
            });
        }
        recordsTableBody.innerHTML = tbodyHtml;

        // Attach event listeners for range buttons (if any)
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

        // Attach event listeners for add buttons (add mode)
        if (currentSearchMode === 'add' && currentMode === 'search' && currentResults.length > 0) {
            document.querySelectorAll('.btn-add-record-from-search').forEach(btn => {
                btn.addEventListener('click', function() {
                    const index = parseInt(this.dataset.index);
                    const row = this.closest('tr');
                    const record = currentResults[index];
                    if (record) addRecordFromDiscogs(row, record);
                });
            });

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

        // Single post buttons (Discogs mode)
        if (currentSearchMode === 'discogs') {
            document.querySelectorAll('.post-single-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const recordId = parseInt(this.dataset.recordId);
                    const artist = this.dataset.artist;
                    const title = this.dataset.title;
                    const price = parseFloat(this.dataset.price);
                    const discogsPrice = parseFloat(this.dataset.discogsPrice);
                    const markupPercent = parseFloat(this.dataset.markupPercent);
                    const mediaCondition = this.dataset.mediaCondition;
                    const sleeveCondition = this.dataset.sleeveCondition;
                    const catalog = this.dataset.catalog;
                    const location = this.dataset.location;
                    const notes = this.dataset.notes;
                    postSingleRecordToDiscogs(recordId, artist, title, price, discogsPrice, markupPercent, mediaCondition, sleeveCondition, catalog, location, notes);
                });
            });
        }

        // Checkout mode Add/Remove buttons
        if (currentSearchMode === 'checkout') {
            document.querySelectorAll('.add-checkout-item').forEach(btn => {
                btn.addEventListener('click', function() {
                    const recordId = parseInt(this.dataset.recordId);
                    addToCheckout(recordId);
                });
            });
            document.querySelectorAll('.remove-checkout-item').forEach(btn => {
                btn.addEventListener('click', function() {
                    const recordId = parseInt(this.dataset.recordId);
                    removeFromCheckout(recordId);
                });
            });
        }

        // Discogs Orders mode: attach event listeners for PigStyle ID inputs and scan buttons
        if (currentSearchMode === 'discogs_orders') {
            document.querySelectorAll('.pigstyle-id-input').forEach(input => {
                // On blur, update the pigstyle_id in the data
                input.addEventListener('change', function() {
                    const row = this.closest('tr');
                    const index = parseInt(row.dataset.index);
                    const item = filteredRecords[index];
                    if (item) {
                        const val = this.value.trim();
                        // Try to parse as integer
                        const newId = parseInt(val);
                        if (!isNaN(newId)) {
                            item.pigstyle_id = newId;
                            // Also try to fetch record details (barcode, catalog, status)
                            fetchRecordForOrderItem(item, row);
                        } else {
                            item.pigstyle_id = null;
                        }
                    }
                });
                // On enter, trigger lookup for barcode
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = this.value.trim();
                        if (val.length > 0) {
                            lookupBarcodeForOrderItem(this, val);
                        }
                    }
                });
            });

            document.querySelectorAll('.scan-pigstyle-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const input = this.closest('td').querySelector('.pigstyle-id-input');
                    if (input) {
                        // Simulate barcode scan: focus the input and prompt for barcode
                        const barcode = prompt('Enter or scan barcode:');
                        if (barcode && barcode.trim().length > 0) {
                            input.value = barcode.trim();
                            // Trigger change event
                            const event = new Event('change');
                            input.dispatchEvent(event);
                            // Also trigger lookup
                            lookupBarcodeForOrderItem(input, barcode.trim());
                        }
                    }
                });
            });
        }

        updateSelectionCount();
        updateFilterVisibility();
    }

    // ========== Helper to lookup barcode for order item ==========
    async function lookupBarcodeForOrderItem(input, barcode) {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/records/search?q=${encodeURIComponent(barcode)}`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            if (!response.ok) {
                showStatus('Error searching barcode.', 'error');
                return;
            }
            const data = await response.json();
            if (data.status === 'success' && data.records && data.records.length === 1) {
                const record = data.records[0];
                // Update the input with the record ID
                input.value = record.id;
                // Trigger change event to update the item
                const event = new Event('change');
                input.dispatchEvent(event);
                // Also update the row display (barcode, catalog, status) via fetchRecordForOrderItem
                const row = input.closest('tr');
                const index = parseInt(row.dataset.index);
                const item = filteredRecords[index];
                if (item) {
                    item.pigstyle_id = record.id;
                    item.barcode = record.barcode;
                    item.catalog_number = record.catalog_number;
                    item.record_status_id = record.status_id;
                    // Re-render the row (or just the barcode, catalog, status cells)
                    // For simplicity, re-render the table
                    renderTablePage();
                }
                playSuccessSound();
                showStatus(`✅ Record #${record.id} assigned to this order item.`, 'success');
            } else if (data.records && data.records.length > 1) {
                showStatus(`⚠️ Multiple records (${data.records.length}) found for barcode. Please be more specific.`, 'warning');
            } else {
                showStatus('❌ No record found for this barcode.', 'error');
                playErrorSound();
            }
        } catch (error) {
            console.error('Barcode lookup error:', error);
            showStatus('Error looking up barcode.', 'error');
        }
    }

    // ========== Helper to fetch record details for an order item ==========
    async function fetchRecordForOrderItem(item, row) {
        if (!item.pigstyle_id) return;
        try {
            const response = await fetch(`${AppConfig.baseUrl}/records/${item.pigstyle_id}`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            if (response.ok) {
                const record = await response.json();
                item.barcode = record.barcode || null;
                item.catalog_number = record.catalog_number || null;
                item.record_status_id = record.status_id;
                // Update the row cells
                const cells = row.querySelectorAll('td');
                if (cells.length >= 5) {
                    cells[4].textContent = item.barcode || '—'; // barcode column
                    cells[3].textContent = item.catalog_number || '—'; // catalog column
                    // status column
                    const statusCell = cells[8];
                    let statusText = '—';
                    let statusClass = '';
                    if (item.record_status_id === 2) { statusText = 'Active'; statusClass = 'active'; }
                    else if (item.record_status_id === 3 || item.record_status_id === 4) { statusText = 'Sold'; statusClass = 'sold'; }
                    else if (item.record_status_id === 1) { statusText = 'New'; statusClass = 'new'; }
                    else { statusText = 'Not found'; statusClass = ''; }
                    statusCell.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
                }
            }
        } catch (error) {
            console.warn('Could not fetch record details:', error);
        }
    }

    // ========== Update filter visibility ==========
    function updateFilterVisibility() {
        const isDiscogsMode = currentSearchMode === 'discogs';
        const isDeleteMode = currentSearchMode === 'delete';
        const isCheckoutMode = currentSearchMode === 'checkout';
        const isAddMode = currentSearchMode === 'add';
        const isDiscogsOrdersMode = currentSearchMode === 'discogs_orders';

        if (discogsUi) {
            discogsUi.style.display = (isDiscogsMode || isDeleteMode || isCheckoutMode || isDiscogsOrdersMode) ? 'block' : 'none';
        }
        const markupUi = document.getElementById('discogs-markup-ui');
        if (markupUi) {
            markupUi.style.display = isDiscogsMode ? 'block' : 'none';
        }
        const discogsFilters = document.getElementById('discogs-filters');
        if (discogsFilters) {
            discogsFilters.style.display = isDiscogsMode ? 'block' : 'none';
        }
        const deleteFilters = document.getElementById('delete-filters');
        if (deleteFilters) {
            deleteFilters.style.display = isDeleteMode ? 'block' : 'none';
            if (deleteStatusFilter) {
                deleteStatusFilter.innerHTML = `
                    <option value="1">New</option>
                    <option value="2">Active</option>
                `;
            }
        }
        // Checkout filters: hide the status dropdown, keep the show selected buttons
        if (checkoutFilters) {
            const statusFilterEl = document.getElementById('checkout-status-filter');
            if (statusFilterEl) {
                statusFilterEl.style.display = 'none';
            }
            checkoutFilters.style.display = isCheckoutMode ? 'block' : 'none';
        }
        if (checkoutShowSelectedBtn && checkoutShowAllBtn) {
            // We'll repurpose them: Show Selected = show checkout list, Show All = show all active records (but we use search)
            checkoutShowSelectedBtn.style.display = isCheckoutMode ? 'inline-block' : 'none';
            checkoutShowAllBtn.style.display = isCheckoutMode ? 'inline-block' : 'none';
            if (isCheckoutMode) {
                checkoutShowSelectedBtn.textContent = `Checkout List (${checkoutSelectedItems.length})`;
                checkoutShowAllBtn.textContent = 'Search Results';
                // We'll add click handlers to switch views
                checkoutShowSelectedBtn.onclick = function() {
                    checkoutViewMode = 'list';
                    filteredRecords = checkoutSelectedItems.slice();
                    totalRecords = filteredRecords.length;
                    currentPage = 1;
                    renderPagination();
                    renderTablePage();
                    updateSelectionCount();
                };
                checkoutShowAllBtn.onclick = function() {
                    // Show all active records (but we don't have a dedicated "all" list, we'll trigger search with empty term? Better to reload active records)
                    // Actually we want to show the full inventory, but we can load active records again.
                    loadRecords({ statusIds: [2], mode: 'checkout' });
                    checkoutViewMode = 'search'; // but we are showing all records, not search results; we can treat as search view.
                    // We'll set filteredRecords = allRecords, but allRecords is already loaded.
                    filteredRecords = allRecords.slice();
                    totalRecords = filteredRecords.length;
                    currentPage = 1;
                    renderPagination();
                    renderTablePage();
                    updateSelectionCount();
                };
            }
        }

        // Discogs Orders filters
        const ordersFilters = document.getElementById('discogs-orders-filters');
        if (ordersFilters) {
            ordersFilters.style.display = isDiscogsOrdersMode ? 'block' : 'none';
        }

        cogsBtn.style.display = isAddMode ? '' : 'none';
        printBtn.style.display = isAddMode ? '' : 'none';
        setActiveBtn.style.display = isAddMode ? '' : 'none';
        completeActionBtn.style.display = isAddMode ? 'none' : '';

        // Show/Hide custom item button (only in checkout mode)
        let customBtn = document.getElementById('custom-item-btn');
        if (isCheckoutMode) {
            if (!customBtn) {
                customBtn = document.createElement('button');
                customBtn.id = 'custom-item-btn';
                customBtn.className = 'btn btn-info';
                customBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Custom Item';
                customBtn.addEventListener('click', showCustomItemModal);
                // Insert after completeActionBtn
                completeActionBtn.parentNode.insertBefore(customBtn, completeActionBtn.nextSibling);
            }
            customBtn.style.display = 'inline-block';
        } else {
            if (customBtn) customBtn.style.display = 'none';
        }
    }

    // ========== Custom Item Modal ==========
    let customItemModal = null;

    function showCustomItemModal() {
        // Remove existing modal if any
        if (customItemModal) {
            customItemModal.remove();
            customItemModal = null;
        }

        // Build modal
        customItemModal = document.createElement('div');
        customItemModal.className = 'modal-overlay';
        customItemModal.style.display = 'flex';
        customItemModal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; width: 95%;">
                <div class="modal-header" style="background: #17a2b8; color: white;">
                    <h3 class="modal-title"><i class="fas fa-plus-circle"></i> Add Custom Item</h3>
                    <button class="modal-close" onclick="document.getElementById('custom-item-modal').style.display='none'" style="color: white;">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 15px;">
                        <label for="custom-item-desc" style="display:block; font-weight:500; margin-bottom:4px;">Description *</label>
                        <input type="text" id="custom-item-desc" class="form-control" placeholder="e.g., Merchandise, Gift Card, etc." style="width:100%; padding:8px;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="custom-item-price" style="display:block; font-weight:500; margin-bottom:4px;">Price ($) *</label>
                        <input type="number" id="custom-item-price" class="form-control" step="0.01" min="0.01" placeholder="0.00" style="width:100%; padding:8px;">
                    </div>
                    <div id="custom-item-status" style="margin-top:10px; display:none;"></div>
                </div>
                <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;">
                    <button class="btn btn-secondary" onclick="closeCustomItemModal()">Cancel</button>
                    <button class="btn btn-success" id="custom-item-add-btn"><i class="fas fa-check"></i> Add to Checkout</button>
                </div>
            </div>
        `;
        customItemModal.id = 'custom-item-modal';
        document.body.appendChild(customItemModal);

        // Focus on description field
        setTimeout(() => {
            const descInput = document.getElementById('custom-item-desc');
            if (descInput) descInput.focus();
        }, 100);

        // Add button click
        document.getElementById('custom-item-add-btn').addEventListener('click', function() {
            addCustomItemFromModal();
        });

        // Enter key on fields
        document.getElementById('custom-item-desc').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('custom-item-price').focus();
            }
        });
        document.getElementById('custom-item-price').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCustomItemFromModal();
            }
        });
    }

    function closeCustomItemModal() {
        if (customItemModal) {
            customItemModal.style.display = 'none';
            customItemModal.remove();
            customItemModal = null;
        }
    }

    function addCustomItemFromModal() {
        const descInput = document.getElementById('custom-item-desc');
        const priceInput = document.getElementById('custom-item-price');
        const statusDiv = document.getElementById('custom-item-status');

        function showStatus(msg, type) {
            if (statusDiv) {
                statusDiv.textContent = msg;
                statusDiv.className = `status-message status-${type}`;
                statusDiv.style.display = 'block';
            } else {
                showStatus(msg, type);
            }
        }

        const desc = descInput.value.trim();
        const price = parseFloat(priceInput.value);

        if (!desc) {
            showStatus('Please enter a description.', 'warning');
            return;
        }
        if (isNaN(price) || price <= 0) {
            showStatus('Please enter a valid price greater than 0.', 'warning');
            return;
        }

        // Create custom item
        const customItem = {
            id: -Date.now(), // negative to avoid collisions
            artist: 'Custom',
            title: desc,
            store_price: price,
            barcode: 'CUSTOM',
            isCustom: true
        };

        // Add to checkout
        checkoutSelectedItems.push(customItem);
        showStatus(`Added custom item: "${desc}" for $${price.toFixed(2)}`, 'success');
        closeCustomItemModal();

        // Switch to list view and render
        checkoutViewMode = 'list';
        filteredRecords = checkoutSelectedItems.slice();
        totalRecords = filteredRecords.length;
        currentPage = 1;
        renderPagination();
        renderTablePage();
        updateSelectionCount();
        if (checkoutShowSelectedBtn) {
            checkoutShowSelectedBtn.textContent = `Checkout List (${checkoutSelectedItems.length})`;
        }
    }

    // ========== Range Selection ==========
    function startRangeFrom(index) {
        console.log(`🔵 startRangeFrom: index=${index}`);
        rangeFromIndex = index;
        rangeToIndex = index;
        isRangeMode = true;
        renderTablePage();
        const selected = getSelectedRecords();
        showStatus(`Selected ${selected.length} record(s)`, 'info');
        updateSelectionCount();
    }

    function endRangeTo(index) {
        console.log(`🔵 endRangeTo: index=${index}`);
        if (rangeFromIndex === null) {
            showStatus('Select "from" first', 'warning');
            return;
        }
        rangeToIndex = index;
        renderTablePage();
        const selected = getSelectedRecords();
        showStatus(`Selected ${selected.length} record(s)`, 'success');
        updateSelectionCount();
    }

    function cancelRangeSelection() {
        console.log(`🔵 cancelRangeSelection`);
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
        await loadRecords({ statusIds: [1], mode: 'add' });
        await loadStats();
    }

    // ========== Search Logic ==========
    function performSearch(term) {
        if (!term) { clearSearch(); return; }
        const mode = currentSearchMode;

        if (mode === 'add') {
            performDiscogsSearch(term);
        } else if (mode === 'scan') {
            performScanSearch(term);
        } else if (mode === 'checkout') {
            const termStr = term.trim();
            const termLower = termStr.toLowerCase();
            const isNumeric = /^\d+$/.test(termStr);

            let filtered;
            if (isNumeric) {
                // Numeric search: exact matches only on ID and barcode
                filtered = allRecords.filter(r => {
                    const idMatch = r.id && r.id.toString() === termStr;
                    const barcodeMatch = r.barcode && r.barcode.trim().toLowerCase() === termLower;
                    return idMatch || barcodeMatch;
                });
                // If no exact match found, fall back to partial matches on other fields
                if (filtered.length === 0) {
                    filtered = allRecords.filter(r => {
                        const artistMatch = r.artist && r.artist.toLowerCase().includes(termLower);
                        const titleMatch = r.title && r.title.toLowerCase().includes(termLower);
                        const catalogMatch = r.catalog_number && r.catalog_number.toLowerCase().includes(termLower);
                        return artistMatch || titleMatch || catalogMatch;
                    });
                }
            } else {
                // Non-numeric: partial matches on artist, title, catalog_number (barcode and ID are less likely for text)
                filtered = allRecords.filter(r => {
                    const artistMatch = r.artist && r.artist.toLowerCase().includes(termLower);
                    const titleMatch = r.title && r.title.toLowerCase().includes(termLower);
                    const catalogMatch = r.catalog_number && r.catalog_number.toLowerCase().includes(termLower);
                    const barcodeMatch = r.barcode && r.barcode.trim().toLowerCase() === termLower;
                    const idMatch = r.id && r.id.toString() === termStr;
                    return artistMatch || titleMatch || catalogMatch || barcodeMatch || idMatch;
                });
            }

            checkoutViewMode = 'search';
            filteredRecords = filtered;
            totalRecords = filtered.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus(`Found ${totalRecords} records matching "${term}"`, 'info');
            updateSelectionCount();
        } else if (mode === 'discogs') {
            const termLower = term.toLowerCase();
            let source = currentLocationRecords.length > 0 ? currentLocationRecords : allRecords;
            const filtered = source.filter(r => {
                return (r.artist && r.artist.toLowerCase().indexOf(termLower) !== -1) ||
                       (r.title && r.title.toLowerCase().indexOf(termLower) !== -1) ||
                       (r.barcode && r.barcode.toLowerCase().indexOf(termLower) !== -1) ||
                       (r.catalog_number && r.catalog_number.toLowerCase().indexOf(termLower) !== -1);
            });
            filteredRecords = filtered;
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus(`Found ${totalRecords} records matching "${term}"`, 'info');
        } else if (mode === 'delete') {
            const termLower = term.toLowerCase();
            const filtered = allRecords.filter(r => {
                return (r.artist && r.artist.toLowerCase().indexOf(termLower) !== -1) ||
                       (r.title && r.title.toLowerCase().indexOf(termLower) !== -1) ||
                       (r.barcode && r.barcode.toLowerCase().indexOf(termLower) !== -1) ||
                       (r.catalog_number && r.catalog_number.toLowerCase().indexOf(termLower) !== -1);
            });
            filteredRecords = filtered;
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus(`Found ${totalRecords} records matching "${term}"`, 'info');
        }
    }

    async function performDiscogsSearch(term) {
        currentMode = 'search';
        recordsTableBody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Searching Discogs...</td></tr>`;
        try {
            const data = await apiGet('/api/discogs/search?q=' + encodeURIComponent(term));
            if (!data.results || !data.results.length) {
                recordsTableBody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;">No Discogs results found</td></tr>`;
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
            recordsTableBody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;">Error searching Discogs: ${error.message}</td></tr>`;
        }
    }

    async function performScanSearch(term) {
        try {
            const data = await apiGet('/records/search?q=' + encodeURIComponent(term));
            if (!data.records || !data.records.length) {
                playErrorSound();
                showStatus('No record found with that barcode or ID', 'error');
                if (searchInput) searchInput.value = '';
                return;
            }

            const records = data.records;
            if (records.length > 1) {
                playErrorSound();
                showStatus(`Multiple records (${records.length}) found. Please use a unique barcode.`, 'error');
                if (searchInput) searchInput.value = '';
                return;
            }

            const record = records[0];
            const existing = filteredRecords.find(r => r.id === record.id);
            if (existing) {
                const today = getLocalMSTDate();
                existing.last_seen = today;
                filteredRecords.sort((a, b) => {
                    const aDate = a.last_seen ? new Date(a.last_seen) : new Date(0);
                    const bDate = b.last_seen ? new Date(b.last_seen) : new Date(0);
                    return bDate - aDate;
                });
                renderPagination();
                renderTablePage();
                playSuccessSound();
                showStatus(`✅ Updated last_seen for #${record.id}: ${record.artist} - ${record.title}`, 'success');
                if (searchInput) searchInput.value = '';
                return;
            }

            filteredRecords.push(record);
            filteredRecords.sort((a, b) => {
                const aDate = a.last_seen ? new Date(a.last_seen) : new Date(0);
                const bDate = b.last_seen ? new Date(b.last_seen) : new Date(0);
                return bDate - aDate;
            });
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            playSuccessSound();
            showStatus(`✅ Added #${record.id}: ${record.artist} - ${record.title}`, 'success');
            updateSelectionCount();
            if (searchInput) searchInput.value = '';
        } catch (error) {
            playErrorSound();
            showStatus(`Error scanning: ${error.message}`, 'error');
            console.error('Scan search error:', error);
            if (searchInput) searchInput.value = '';
        }
    }

    function clearSearch() {
        searchInput.value = '';
        if (currentSearchMode === 'add') {
            currentMode = 'inventory';
            currentResults = [];
            loadRecords({ statusIds: [1], mode: 'add' });
        } else if (currentSearchMode === 'scan') {
            // keep list
        } else if (currentSearchMode === 'discogs') {
            refreshDiscogsRecords();
        } else if (currentSearchMode === 'delete') {
            applyDeleteFilter();
        } else if (currentSearchMode === 'checkout') {
            // Go back to checkout list view
            checkoutViewMode = 'list';
            filteredRecords = checkoutSelectedItems.slice();
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Showing checkout list', 'info');
            updateSelectionCount();
        } else if (currentSearchMode === 'discogs_orders') {
            // Clear the order selection
            if (discogsOrderSelect) discogsOrderSelect.value = '';
            selectedOrderId = null;
            currentOrderItems = [];
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            // Reload orders list with current status filter
            loadDiscogsOrdersList(ordersStatusFilter);
        }
        showStatus('Search cleared', 'info');
    }

    // ========== Discogs-specific functions ==========
    function applyDiscogsSearchFilter() {
        const searchTerm = searchInput.value.trim().toLowerCase();
        let records = currentLocationRecords.length > 0 ? currentLocationRecords : allRecords;
        records = records.filter(r => {
            return r.status_id === 2 && !hasConsignor(r) && meetsLastSeenFilter(r) && r.created_at && r.location && r.location.trim() !== '';
        });
        if (searchTerm) {
            records = records.filter(r => {
                const matchesArtist = r.artist && r.artist.toLowerCase().indexOf(searchTerm) !== -1;
                const matchesTitle = r.title && r.title.toLowerCase().indexOf(searchTerm) !== -1;
                const matchesCatalog = r.catalog_number && r.catalog_number.toLowerCase().indexOf(searchTerm) !== -1;
                const matchesBarcode = r.barcode && r.barcode.toLowerCase().indexOf(searchTerm) !== -1;
                return matchesArtist || matchesTitle || matchesCatalog || matchesBarcode;
            });
        }
        discogsFilteredRecords = records;
        filteredRecords = discogsFilteredRecords;
        totalRecords = filteredRecords.length;
        currentPage = 1;
        renderPagination();
        renderTablePage();
        updateSelectionCount();
        populateDiscogsPrices(filteredRecords);
    }

    // ========== Discogs UI toggle functions ==========
    window.toggleMarkupRules = function() {
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
    };

    window.toggleMarkupCharts = function() {
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
    };

    // ========== Markup Rules Management ==========
    async function loadMarkupRules() {
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    renderMarkupRules(data.rules);
                }
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
        rules.sort((a, b) => a.days_old - b.days_old);
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
            const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days_old: days_old, markup_percent: markup_percent, description: description })
            });
            if (response.ok) {
                showDiscogsStatus('Markup rule added successfully', 'success');
                daysInput.value = '';
                percentInput.value = '';
                descInput.value = '';
                loadMarkupRules();
                refreshDiscogsRecords();
            } else {
                const error = await response.json();
                showDiscogsStatus('Error: ' + error.error, 'error');
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
            const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules/' + ruleId, {
                method: 'PUT',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markup_percent: markup_percent, description: description })
            });
            if (response.ok) {
                showDiscogsStatus('Markup rule updated successfully', 'success');
                loadMarkupRules();
                refreshDiscogsRecords();
            } else {
                const error = await response.json();
                showDiscogsStatus('Error: ' + error.error, 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    };

    window.deleteMarkupRule = async function(ruleId) {
        if (!confirm('Are you sure you want to delete this markup rule?')) return;
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules/' + ruleId, {
                method: 'DELETE',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (response.ok) {
                showDiscogsStatus('Markup rule deleted successfully', 'success');
                loadMarkupRules();
                refreshDiscogsRecords();
            } else {
                const error = await response.json();
                showDiscogsStatus('Error: ' + error.error, 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    };

    // ========== Markup Analysis Charts ==========
    async function loadMarkupAnalysisCharts() {
        try {
            const cutoffInput = document.getElementById('last-seen-cutoff-date');
            let cutoff = '';
            if (cutoffInput && cutoffInput.value) {
                cutoff = cutoffInput.value;
            } else {
                cutoff = '';
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
                    countEl.textContent = `📊 ${data.active_records_count || 0} active records analyzed (cutoff: ${data.cutoff_date || 'N/A'}) | ${data.rules_count || 0} markup rules applied`;
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
        if (markupCurveChart) { markupCurveChart.destroy(); markupCurveChart = null; }
        const points = data.curve_points || [];
        if (points.length === 0) {
            markupCurveChart = new Chart(ctx, {
                type: 'line',
                data: { labels: ['No Data'], datasets: [{ label: 'Markup %', data: [0], borderColor: '#ccc', backgroundColor: 'rgba(200,200,200,0.1)', borderWidth: 2, pointRadius: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        const days = points.map(p => p.days);
        const markups = points.map(p => p.markup_percent);
        const minMarkup = Math.min(...markups);
        const maxMarkup = Math.max(...markups);
        const yPadding = Math.max(5, Math.abs(maxMarkup - minMarkup) * 0.1);
        const xMax = data.chart_max_days || Math.max(...days);
        let xStepSize = 30;
        if (xMax > 730) xStepSize = 90;
        else if (xMax > 365) xStepSize = 60;
        markupCurveChart = new Chart(ctx, {
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
                                return `Markup: ${context.parsed.y}% at ${context.parsed.x} days`;
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
        if (markupDistributionChart) { markupDistributionChart.destroy(); markupDistributionChart = null; }
        const distribution = data.distribution || {};
        if (Object.keys(distribution).length === 0) {
            markupDistributionChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: ['No Data'], datasets: [{ label: 'Records', data: [0], backgroundColor: ['#ccc'], borderColor: ['#999'], borderWidth: 1 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        const sortedKeys = Object.keys(distribution).sort((a, b) => parseFloat(a) - parseFloat(b));
        const labels = sortedKeys;
        const counts = sortedKeys.map(key => distribution[key]);
        const totalRecords = data.active_records_count || 0;
        const colors = labels.map(label => {
            const value = parseFloat(label);
            if (value > 0) return 'rgba(40,167,69,0.8)';
            if (value < 0) return 'rgba(220,53,69,0.8)';
            return 'rgba(255,193,7,0.8)';
        });
        markupDistributionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Records',
                    data: counts,
                    backgroundColor: colors,
                    borderColor: colors.map(c => c.replace('0.8', '1')),
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
                                return `${count} records (${pct}%)`;
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
        if (ageDistributionChart) { ageDistributionChart.destroy(); ageDistributionChart = null; }
        const ageData = data.age_distribution || {};
        if (Object.keys(ageData).length === 0) {
            ageDistributionChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: ['No Data'], datasets: [{ label: 'Records', data: [0], backgroundColor: ['#ccc'], borderColor: ['#999'], borderWidth: 1 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        const sortedKeys = Object.keys(ageData).sort((a, b) => parseInt(a) - parseInt(b));
        const labels = sortedKeys.map(key => {
            const parts = key.split('-');
            if (parts.length === 2) return `${parts[0]}-${parts[1]}d`;
            return key + 'd';
        });
        const counts = sortedKeys.map(key => ageData[key]);
        const totalRecords = data.active_records_count || 0;
        const colors = sortedKeys.map((_, index) => `rgba(23,162,184,${0.6 + (index / sortedKeys.length) * 0.3})`);
        ageDistributionChart = new Chart(ctx, {
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
                                return `${count} records (${pct}%)`;
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
            statsEl.textContent = `| Avg: ${data.age_stats.avg_days}d | Min: ${data.age_stats.min_days} | Max: ${data.age_stats.max_days}`;
        }
    }

    // ========== Last Seen Filter (Discogs) ==========
    function applyLastSeenFilter() {
        if (lastSeenCutoffDateInput) {
            lastSeenCutoffDate = lastSeenCutoffDateInput.value;
        } else {
            lastSeenCutoffDate = null;
        }
        console.log(`📅 Last seen cutoff date set to: ${lastSeenCutoffDate || 'none'}`);
        refreshDiscogsRecords();
        showDiscogsStatus(`Last seen filter set to: ${lastSeenCutoffDate || 'disabled'}`, 'info');
        loadMarkupAnalysisCharts();
    }

    // ========== Post Single Record to Discogs ==========
    async function postSingleRecordToDiscogs(recordId, artist, title, price, discogsPrice, markupPercent, mediaCondition, sleeveCondition, catalogNumber, location, notes) {
        if (!recordId || !mediaCondition || !sleeveCondition || !price || !discogsPrice) {
            showDiscogsStatus('Missing required information', 'error');
            return;
        }
        if (!confirm(`📋 Post "${artist} - ${title}" to Discogs?\n\nStore Price: $${price}\nDiscogs Price: $${discogsPrice} (${markupPercent > 0 ? '+' : ''}${markupPercent}%)\nMedia: ${mediaCondition}\nSleeve: ${sleeveCondition}`)) {
            return;
        }

        const listingData = {
            record: {
                id: recordId,
                artist: artist,
                title: title,
                catalog_number: catalogNumber || '',
                media_condition: mediaCondition,
                sleeve_condition: sleeveCondition,
                price: discogsPrice,
                notes: notes || '',
                location: location || ''
            }
        };

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/discogs/create-listing-single', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify(listingData)
            });
            const result = await response.json();
            if (result.success) {
                let discogsUrl = result.listing_url;
                if (!discogsUrl && result.listing_id) {
                    discogsUrl = 'https://www.discogs.com/sell/item/' + result.listing_id;
                }
                showDiscogsStatus(`✅ Successfully posted "${artist} - ${title}" to Discogs! ${discogsUrl ? '<a href="' + discogsUrl + '" target="_blank">View</a>' : ''}`, 'success');
                refreshDiscogsRecords();
            } else {
                showDiscogsStatus('Error: ' + result.error, 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    }

    // ========== Post Selected Records (Discogs mode) ==========
    async function postSelectedRecords() {
        const records = getSelectedRecords();  // use unified range selection
        console.log(`📋 postSelectedRecords: selected ${records.length} records out of ${filteredRecords.length} total filtered`);
        if (records.length === 0) {
            showDiscogsStatus('No records selected. Please select a range using "from" and "to" buttons.', 'warning');
            return;
        }
        const totalTimeMinutes = Math.ceil(records.length * 3 / 60);
        let confirmMsg = `📋 Post ${records.length} record(s) to Discogs?\n\n`;
        confirmMsg += `⏱️ Estimated time: ~${totalTimeMinutes} minute(s)\n\nContinue?`;
        if (!confirm(confirmMsg)) return;

        let posted = 0, failed = 0;
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            console.log(`📋 Processing record ${i+1}/${records.length}: ID ${record.id} - ${record.artist} - ${record.title}`);
            const priceRequests = [{
                id: record.id,
                created_at: record.created_at,
                store_price: record.store_price
            }];
            const batchResults = await calculateMarkupBatch(priceRequests);
            let discogsPrice = null;
            let markupPercent = null;
            if (batchResults.length > 0) {
                const item = batchResults[0];
                if (item.id) {
                    discogsPrice = item.discogs_price;
                    markupPercent = item.markup_percent;
                }
            }
            if (!discogsPrice) {
                failed++;
                showDiscogsStatus(`Failed to calculate price for "${record.artist} - ${record.title}"`, 'error');
                continue;
            }
            const listingData = {
                record: {
                    id: record.id,
                    artist: record.artist,
                    title: record.title,
                    catalog_number: record.catalog_number || '',
                    media_condition: record.disc_condition_name || record.sleeve_condition_name,
                    sleeve_condition: record.sleeve_condition_name || record.disc_condition_name,
                    price: discogsPrice,
                    notes: record.notes || '',
                    location: record.location || ''
                }
            };
            try {
                const response = await fetch(window.AppConfig.baseUrl + '/api/discogs/create-listing-single', {
                    method: 'POST',
                    credentials: 'include',
                    headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                    body: JSON.stringify(listingData)
                });
                const result = await response.json();
                if (result.success) {
                    posted++;
                    showDiscogsStatus(`✅ Posted #${record.id}: ${record.artist} - ${record.title}`, 'success');
                } else {
                    failed++;
                    showDiscogsStatus(`❌ Failed #${record.id}: ${result.error}`, 'error');
                }
            } catch (error) {
                failed++;
                showDiscogsStatus(`❌ Error posting #${record.id}: ${error.message}`, 'error');
            }
            if (i < records.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        showDiscogsStatus(`📊 Done: ${posted} posted, ${failed} failed.`, posted > 0 ? 'success' : 'error');
        refreshDiscogsRecords();
    }

    // ========== Delete Selected ==========
    async function deleteSelected() {
        const records = getSelectedRecords();
        console.log(`🗑️ deleteSelected: selected ${records.length} records out of ${filteredRecords.length} total filtered`);
        if (records.length === 0) {
            showStatus('No records selected. Please select a range using "from" and "to" buttons.', 'warning');
            return;
        }
        if (!confirm(`Delete ${records.length} record(s) permanently? This cannot be undone.`)) {
            return;
        }
        let deleted = 0;
        for (const record of records) {
            try {
                await apiDelete('/records/' + record.id);
                deleted++;
            } catch (e) {
                console.error('Delete failed for record', record.id, e);
            }
        }
        showStatus(`Deleted ${deleted} of ${records.length} records`, 'success');
        await loadRecords({ statusIds: [1,2], mode: 'delete' });
        cancelRangeSelection();
    }

    // ========== Apply Delete Filter ==========
    function applyDeleteFilter() {
        const statusFilter = deleteStatusFilter ? deleteStatusFilter.value : '1,2';
        const searchTerm = searchInput.value.trim().toLowerCase();
        let statuses = statusFilter.split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s));
        if (statuses.length === 0) statuses = [1,2];
        loadRecords({ statusIds: statuses, mode: 'delete', search: searchTerm });
    }

    // ========== COGS Modal ==========
    function showCogsModal() {
        const records = filteredRecords;
        if (records.length === 0) {
            showStatus('No records to apply COGS to.', 'warning');
            return;
        }

        let modal = document.getElementById('cogs-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'cogs-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 600px; width: 95%;">
                    <div class="modal-header" style="background: #17a2b8; color: white;">
                        <h3 class="modal-title"><i class="fas fa-dollar-sign"></i> Apply COGS</h3>
                        <button class="modal-close" onclick="document.getElementById('cogs-modal').style.display='none'" style="color: white;">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p><strong>${records.length}</strong> record(s) selected.</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div>
                                <label for="cogs-seller-name" style="display:block; font-weight:500; margin-bottom:4px;">Seller Name *</label>
                                <input type="text" id="cogs-seller-name" class="form-control" placeholder="e.g., John's Records" style="width:100%; padding:8px;">
                            </div>
                            <div>
                                <label for="cogs-seller-contact" style="display:block; font-weight:500; margin-bottom:4px;">Seller Contact</label>
                                <input type="text" id="cogs-seller-contact" class="form-control" placeholder="Email or Phone" style="width:100%; padding:8px;">
                            </div>
                            <div style="grid-column: 1 / -1;">
                                <label for="cogs-amount-spent" style="display:block; font-weight:500; margin-bottom:4px;">Amount Spent ($) *</label>
                                <input type="number" id="cogs-amount-spent" step="0.01" min="0.01" class="form-control" placeholder="0.00" style="width:100%; padding:8px;">
                            </div>
                            <div style="grid-column: 1 / -1;">
                                <label for="cogs-payment-account" style="display:block; font-weight:500; margin-bottom:4px;">Payment Account *</label>
                                <select id="cogs-payment-account" class="form-control" style="width:100%; padding:8px;">
                                    <option value="">-- Select how you paid --</option>
                                </select>
                            </div>
                            <!-- NEW: Payment Type selection -->
                            <div style="grid-column: 1 / -1;">
                                <label style="display:block; font-weight:500; margin-bottom:4px;">Payment Type:</label>
                                <div style="display:flex; gap:20px;">
                                    <label><input type="radio" name="cogs_payment_type" value="cash" checked> Cash</label>
                                    <label><input type="radio" name="cogs_payment_type" value="store_credit"> Store Credit</label>
                                </div>
                            </div>
                            <!-- Store credit consignor selection (hidden by default) -->
                            <div id="cogs-consignor-section" style="grid-column:1/-1; display:none;">
                                <label for="cogs-consignor" style="display:block; font-weight:500; margin-bottom:4px;">Consignor (to receive store credit) *</label>
                                <select id="cogs-consignor" class="form-control" style="width:100%; padding:8px;">
                                    <option value="">-- Select consignor --</option>
                                </select>
                                <p style="margin-top:8px; font-size:13px; color:#666;">
                                    Store credit amount: <strong><span id="cogs-store-credit-amount">$0.00</span></strong> 
                                    (x<span id="cogs-multiplier-display">1.5</span> multiplier)
                                </p>
                            </div>
                            <div style="grid-column: 1 / -1;">
                                <label for="cogs-description" style="display:block; font-weight:500; margin-bottom:4px;">Description</label>
                                <textarea id="cogs-description" rows="2" class="form-control" placeholder="Optional notes about this purchase" style="width:100%; padding:8px;"></textarea>
                            </div>
                            <div style="grid-column: 1 / -1;">
                                <label for="cogs-bill-image" style="display:block; font-weight:500; margin-bottom:4px;">Bill of Sale (Image)</label>
                                <input type="file" id="cogs-bill-image" accept="image/*,application/pdf" style="width:100%; padding:8px;">
                                <div id="cogs-bill-preview" style="margin-top:8px;"></div>
                            </div>
                        </div>
                        <div id="cogs-status" style="margin-top:10px; padding:8px; border-radius:4px; display:none;"></div>
                    </div>
                    <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;">
                        <button class="btn btn-secondary" onclick="document.getElementById('cogs-modal').style.display='none'">Cancel</button>
                        <button class="btn btn-success" id="cogs-apply-btn" disabled><i class="fas fa-check"></i> Apply COGS</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Populate account dropdown
        const accountSelect = document.getElementById('cogs-payment-account');
        if (accountSelect) {
            accountSelect.innerHTML = '<option value="">-- Select how you paid --</option>';
            accounts.forEach(acc => {
                if (acc && acc.code && acc.name) {
                    const opt = document.createElement('option');
                    opt.value = acc.code;
                    opt.textContent = `${acc.code} - ${acc.name}`;
                    accountSelect.appendChild(opt);
                }
            });
        }

        // Populate consignor dropdown
        const consignorSelect = document.getElementById('cogs-consignor');
        if (consignorSelect) {
            consignorSelect.innerHTML = '<option value="">-- Select consignor --</option>';
            consignors.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.username + (c.full_name ? ` (${c.full_name})` : '');
                consignorSelect.appendChild(opt);
            });
        }

        // Toggle consignor section based on payment type
        const radios = document.querySelectorAll('input[name="cogs_payment_type"]');
        radios.forEach(radio => {
            radio.addEventListener('change', function() {
                const isStoreCredit = this.value === 'store_credit';
                document.getElementById('cogs-consignor-section').style.display = isStoreCredit ? 'block' : 'none';
                if (isStoreCredit) {
                    // Fetch multiplier from config or use default
                    fetch('/api/config/STORE_CREDIT_MULTIPLIER', { credentials: 'include' })
                        .then(res => res.json())
                        .then(data => {
                            const multiplier = parseFloat(data.config_value) || 1.5;
                            document.getElementById('cogs-multiplier-display').textContent = multiplier;
                            updateCreditAmount(multiplier);
                        })
                        .catch(() => {
                            const multiplier = 1.5;
                            document.getElementById('cogs-multiplier-display').textContent = multiplier;
                            updateCreditAmount(multiplier);
                        });
                }
            });
        });

        // Update credit amount when amount changes
        const amountInput = document.getElementById('cogs-amount-spent');
        amountInput.addEventListener('input', function() {
            const paymentType = document.querySelector('input[name="cogs_payment_type"]:checked');
            if (paymentType && paymentType.value === 'store_credit') {
                const amount = parseFloat(this.value) || 0;
                const multiplier = parseFloat(document.getElementById('cogs-multiplier-display').textContent) || 1.5;
                document.getElementById('cogs-store-credit-amount').textContent = '$' + (amount * multiplier).toFixed(2);
            }
        });

        function updateCreditAmount(multiplier) {
            const amount = parseFloat(amountInput.value) || 0;
            document.getElementById('cogs-store-credit-amount').textContent = '$' + (amount * multiplier).toFixed(2);
        }

        // File preview logic (unchanged)
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

        // Validation for apply button
        function validateForm() {
            const btn = document.getElementById('cogs-apply-btn');
            if (!btn) return;
            const sellerName = document.getElementById('cogs-seller-name').value.trim();
            const amount = parseFloat(amountInput.value);
            const paymentType = document.querySelector('input[name="cogs_payment_type"]:checked');
            let valid = sellerName && !isNaN(amount) && amount > 0;
            if (paymentType && paymentType.value === 'store_credit') {
                const consignor = document.getElementById('cogs-consignor').value;
                valid = valid && consignor;
            } else {
                const account = document.getElementById('cogs-payment-account').value;
                valid = valid && account;
            }
            btn.disabled = !valid;
        }

        document.getElementById('cogs-seller-name').addEventListener('input', validateForm);
        amountInput.addEventListener('input', validateForm);
        document.getElementById('cogs-payment-account').addEventListener('change', validateForm);
        document.getElementById('cogs-consignor').addEventListener('change', validateForm);
        document.querySelectorAll('input[name="cogs_payment_type"]').forEach(r => r.addEventListener('change', validateForm));

        validateForm();

        // Replace apply button to avoid duplicate listeners
        const applyBtn = document.getElementById('cogs-apply-btn');
        const newApply = applyBtn.cloneNode(true);
        applyBtn.parentNode.replaceChild(newApply, applyBtn);
        newApply.addEventListener('click', function() {
            handleCogsApply();
        });

        modal.style.display = 'flex';
    }

    // ========== COGS Apply Handler ==========
    async function handleCogsApply() {
        const statusDiv = document.getElementById('cogs-status');
        const applyBtn = document.getElementById('cogs-apply-btn');

        function showCogsStatusMsg(msg, type) {
            if (statusDiv) {
                statusDiv.textContent = msg;
                statusDiv.className = `status-message status-${type}`;
                statusDiv.style.display = 'block';
            } else {
                showStatus(msg, type);
            }
        }

        if (applyBtn) applyBtn.disabled = true;

        const records = filteredRecords;
        if (records.length === 0) {
            showCogsStatusMsg('No records to apply COGS to.', 'error');
            if (applyBtn) applyBtn.disabled = false;
            return;
        }

        const sellerNameEl = document.getElementById('cogs-seller-name');
        const sellerContactEl = document.getElementById('cogs-seller-contact');
        const amountEl = document.getElementById('cogs-amount-spent');
        const accountEl = document.getElementById('cogs-payment-account');
        const descEl = document.getElementById('cogs-description');
        const billFileEl = document.getElementById('cogs-bill-image');
        const paymentTypeRadio = document.querySelector('input[name="cogs_payment_type"]:checked');
        const consignorSelect = document.getElementById('cogs-consignor');

        if (!sellerNameEl || !amountEl) {
            showCogsStatusMsg('Form elements missing.', 'error');
            if (applyBtn) applyBtn.disabled = false;
            return;
        }

        const sellerName = sellerNameEl.value.trim();
        const sellerContact = sellerContactEl ? sellerContactEl.value.trim() : '';
        const amountSpent = parseFloat(amountEl.value);
        const description = descEl ? descEl.value.trim() : '';
        const billFile = billFileEl ? billFileEl.files[0] : null;
        const paymentType = paymentTypeRadio ? paymentTypeRadio.value : 'cash';
        const consignorId = consignorSelect ? consignorSelect.value : null;

        if (!sellerName) {
            showCogsStatusMsg('Seller name is required.', 'error');
            if (applyBtn) applyBtn.disabled = false;
            return;
        }
        if (isNaN(amountSpent) || amountSpent <= 0) {
            showCogsStatusMsg('Please enter a valid amount greater than 0.', 'error');
            if (applyBtn) applyBtn.disabled = false;
            return;
        }
        if (paymentType === 'cash') {
            const paymentAccount = accountEl ? accountEl.value : '';
            if (!paymentAccount) {
                showCogsStatusMsg('Please select a payment account for cash.', 'error');
                if (applyBtn) applyBtn.disabled = false;
                return;
            }
        } else if (paymentType === 'store_credit') {
            if (!consignorId) {
                showCogsStatusMsg('Please select a consignor for store credit.', 'error');
                if (applyBtn) applyBtn.disabled = false;
                return;
            }
        }

        // Upload bill image if present
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
                    showCogsStatusMsg(`Image upload failed: ${uploadData.error}`, 'error');
                    if (applyBtn) applyBtn.disabled = false;
                    return;
                }
            } catch (err) {
                showCogsStatusMsg(`Image upload error: ${err.message}`, 'error');
                if (applyBtn) applyBtn.disabled = false;
                return;
            }
        }

        const purchaseData = {
            purchase_date: new Date().toISOString().split('T')[0],
            seller_name: sellerName,
            seller_contact: sellerContact,
            amount_spent: amountSpent,
            description: description,
            payment_account_id: paymentType === 'cash' ? accountEl.value : null,
            payment_type: paymentType,
            consignor_id: paymentType === 'store_credit' ? consignorId : null,
            bill_of_sale_path: billPath
        };

        try {
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
            const purchaseId = createResult.purchase_id;

            // Apply COGS to records
            const recordIds = records.map(r => r.id);
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

            let msg = `✅ Purchase #${purchaseId} recorded and COGS applied to ${cogsResult.records_updated} records.`;
            if (paymentType === 'store_credit') {
                msg += ` Store credit issued to consignor.`;
            }
            showCogsStatusMsg(msg, 'success');
            await loadRecords({ statusIds: [1], mode: 'add' });
            setTimeout(() => {
                const modal = document.getElementById('cogs-modal');
                if (modal) modal.style.display = 'none';
            }, 1500);

        } catch (error) {
            showCogsStatusMsg(`❌ Error: ${error.message}`, 'error');
            console.error('COGS apply error:', error);
        } finally {
            if (applyBtn) applyBtn.disabled = false;
        }
    }

    // ========== Print (Add mode) ==========
    function printPriceTags() {
        const records = filteredRecords;
        if (records.length === 0) {
            showStatus('No records to print.', 'warning');
            return;
        }
        generatePDF(records);
    }

    // ========== Set Active (Add mode) ==========
    async function setActive() {
        const records = filteredRecords;
        if (records.length === 0) {
            showStatus('No records to set active.', 'warning');
            return;
        }
        if (!confirm(`Set ${records.length} new record(s) to Active (status_id=2)? This cannot be undone.`)) {
            return;
        }
        let updated = 0;
        for (const record of records) {
            try {
                await apiPut('/records/' + record.id, { status_id: 2 });
                updated++;
            } catch (e) {
                console.error('Failed to update record', record.id, e);
            }
        }
        showStatus(`✅ ${updated} records set to Active.`, 'success');
        await loadRecords({ statusIds: [1], mode: 'add' });
    }

    // ========== Checkout functions ==========
    function addToCheckout(recordId) {
        const record = allRecords.find(r => r.id === recordId);
        if (!record) return;
        if (!checkoutSelectedItems.some(r => r.id === recordId)) {
            checkoutSelectedItems.push(record);
            showStatus(`Added "${record.artist} - ${record.title}" to checkout`, 'success');
            // Switch to list view
            checkoutViewMode = 'list';
            filteredRecords = checkoutSelectedItems.slice();
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            updateSelectionCount();
            // Update button text
            if (checkoutShowSelectedBtn) {
                checkoutShowSelectedBtn.textContent = `Checkout List (${checkoutSelectedItems.length})`;
            }
        } else {
            showStatus('Record already in checkout list', 'info');
        }
    }

    function removeFromCheckout(recordId) {
        const index = checkoutSelectedItems.findIndex(r => r.id === recordId);
        if (index !== -1) {
            const removed = checkoutSelectedItems.splice(index, 1)[0];
            showStatus(`Removed "${removed.artist} - ${removed.title}" from checkout`, 'info');
            // Stay in list view
            filteredRecords = checkoutSelectedItems.slice();
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            updateSelectionCount();
            if (checkoutShowSelectedBtn) {
                checkoutShowSelectedBtn.textContent = `Checkout List (${checkoutSelectedItems.length})`;
            }
            if (checkoutSelectedItems.length === 0) {
                // If list is empty, show empty message
                filteredRecords = [];
                totalRecords = 0;
                renderPagination();
                renderTablePage();
            }
        }
    }

    function showCheckoutSelected() {
        checkoutViewMode = 'list';
        filteredRecords = checkoutSelectedItems.slice();
        totalRecords = filteredRecords.length;
        currentPage = 1;
        renderPagination();
        renderTablePage();
        if (checkoutShowSelectedBtn) {
            checkoutShowSelectedBtn.textContent = `Checkout List (${checkoutSelectedItems.length})`;
        }
        checkoutShowSelectedBtn.style.display = 'none';
        checkoutShowAllBtn.style.display = 'inline-block';
        updateSelectionCount();
    }

    function showCheckoutAll() {
        // Show all active records (search view)
        checkoutViewMode = 'search';
        filteredRecords = allRecords.slice();
        totalRecords = filteredRecords.length;
        currentPage = 1;
        renderPagination();
        renderTablePage();
        if (checkoutShowSelectedBtn) {
            checkoutShowSelectedBtn.textContent = `Checkout List (${checkoutSelectedItems.length})`;
        }
        checkoutShowSelectedBtn.style.display = 'inline-block';
        checkoutShowAllBtn.style.display = 'none';
        updateSelectionCount();
    }

    function applyCheckoutFilter() {
        // Not used anymore; we use search
    }

    // ========== Checkout Modal with Square Polling ==========
    async function checkSquareAvailability() {
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/square/terminals', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (!response.ok) throw new Error('Failed to fetch terminals');
            const data = await response.json();
            squareAvailable = data.terminals && data.terminals.length > 0;
            availableTerminals = data.terminals || [];
            console.log(`📟 Square terminals available: ${squareAvailable}, terminals:`, availableTerminals);
        } catch (error) {
            console.warn('Square not available:', error);
            squareAvailable = false;
            availableTerminals = [];
        }
        return squareAvailable;
    }

    // ========== Square Payment Processing (updated to use first available terminal) ==========
    async function processSquarePayment() {
        const statusDiv = document.getElementById('checkout-square-status');
        const completeBtn = document.getElementById('checkout-complete-payment');
        if (!statusDiv) return;

        completeBtn.disabled = true;
        completeBtn.textContent = 'Processing...';

        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message status-info';
        statusDiv.textContent = '⏳ Sending payment request to Square Terminal...';

        try {
            // Get the first available terminal ID
            if (!squareAvailable || availableTerminals.length === 0) {
                await checkSquareAvailability();
                if (!squareAvailable || availableTerminals.length === 0) {
                    throw new Error('No Square Terminal available. Please use Cash or Gift Card.');
                }
            }

            const deviceId = availableTerminals[0].id;
            console.log('Using Square Terminal device ID:', deviceId);

            const records = checkoutSelectedItems;
            const totalCents = Math.round(checkoutTotal * 100);
            const recordIds = records.map(r => r.id);
            const titles = records.map(r => `${r.artist} - ${r.title}`);

            const response = await fetch(window.AppConfig.baseUrl + '/api/square/terminal/checkout', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount_cents: totalCents,
                    record_ids: recordIds,
                    record_titles: titles,
                    reference_id: generateOrderId(),
                    device_id: deviceId  // explicitly pass the device ID
                })
            });

            const data = await response.json();
            if (data.status !== 'success') {
                throw new Error(data.message || 'Failed to create Square checkout');
            }

            const checkout = data.checkout;
            squareCheckoutId = checkout.id;

            statusDiv.textContent = '💳 Payment request sent to POS. Waiting for customer to complete payment...';
            statusDiv.className = 'status-message status-info';

            startPollingSquareStatus(checkout.id);

        } catch (error) {
            console.error('Square checkout error:', error);
            statusDiv.textContent = `❌ Error: ${error.message}`;
            statusDiv.className = 'status-message status-error';
            completeBtn.disabled = false;
            completeBtn.textContent = 'Complete Payment';
        }
    }

    function startPollingSquareStatus(checkoutId) {
        if (squarePollInterval) {
            clearInterval(squarePollInterval);
        }

        const statusDiv = document.getElementById('checkout-square-status');
        let attempts = 0;
        const maxAttempts = 60; // 2 minutes at 2s intervals

        squarePollInterval = setInterval(async () => {
            attempts++;
            try {
                const response = await fetch(window.AppConfig.baseUrl + `/api/square/terminal/checkout/${checkoutId}/status`, {
                    credentials: 'include',
                    headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
                });
                const data = await response.json();
                if (data.status !== 'success') {
                    // Continue polling on error
                    return;
                }

                const checkout = data.checkout;
                const status = checkout.status;

                if (status === 'COMPLETED') {
                    // Payment successful
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    statusDiv.textContent = '✅ Payment completed successfully!';
                    statusDiv.className = 'status-message status-success';
                    // Mark records as sold
                    await completeCheckout();
                    // Close modal after delay
                    setTimeout(() => {
                        const modal = document.getElementById('checkout-payment-modal');
                        if (modal) modal.style.display = 'none';
                    }, 1500);
                } else if (status === 'CANCELED' || status === 'FAILED') {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    statusDiv.textContent = `❌ Payment ${status.toLowerCase()}. Please try again.`;
                    statusDiv.className = 'status-message status-error';
                    const completeBtn = document.getElementById('checkout-complete-payment');
                    completeBtn.disabled = false;
                    completeBtn.textContent = 'Complete Payment';
                } else if (status === 'PENDING' || status === 'IN_PROGRESS') {
                    statusDiv.textContent = `⏳ Waiting for payment... (${attempts}s)`;
                    statusDiv.className = 'status-message status-info';
                }

                // Timeout
                if (attempts >= maxAttempts) {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    statusDiv.textContent = '⏰ Payment timed out. Please try again.';
                    statusDiv.className = 'status-message status-warning';
                    const completeBtn = document.getElementById('checkout-complete-payment');
                    completeBtn.disabled = false;
                    completeBtn.textContent = 'Complete Payment';
                }

            } catch (error) {
                console.warn('Polling error:', error);
                // Continue polling
            }
        }, 2000);
    }

    // ========== Checkout Complete ==========
    function completeCheckout() {
        if (checkoutRemaining > 0.01) {
            showCheckoutStatus('Remaining balance not covered', 'error');
            return;
        }
        const selected = checkoutSelectedItems;
        if (selected.length === 0) return;
        const today = getLocalMSTDate();
        let success = 0;
        for (const record of selected) {
            // Skip custom items – they are not real records
            if (record.isCustom === true) {
                continue;
            }
            try {
                apiPut('/records/' + record.id, {
                    status_id: 3,
                    date_sold: today,
                    actual_sale_price: record.store_price
                }).then(() => {
                    success++;
                }).catch(err => {
                    console.error('Failed to update record', record.id, err);
                });
            } catch (e) {
                console.error('Failed to update record', record.id, e);
            }
        }
        setTimeout(() => {
            showCheckoutStatus(`${success} of ${selected.filter(r => !r.isCustom).length} records marked as sold`, 'success');
            checkoutSelectedItems = [];
            checkoutViewMode = 'list';
            checkoutPaymentEntries = [];
            checkoutRemaining = 0;
            const modal = document.getElementById('checkout-payment-modal');
            if (modal) modal.style.display = 'none';
            filteredRecords = [];
            totalRecords = 0;
            renderPagination();
            renderTablePage();
            if (checkoutShowSelectedBtn) {
                checkoutShowSelectedBtn.textContent = `Checkout List (0)`;
            }
            updateSelectionCount();
        }, 500);
    }

    // ========== Show Checkout Modal ==========
    function showCheckoutModal() {
        // Remove any existing modal to avoid stale listeners
        const oldModal = document.getElementById('checkout-payment-modal');
        if (oldModal) {
            oldModal.parentNode.removeChild(oldModal);
        }

        const selected = checkoutSelectedItems;
        if (selected.length === 0) { showStatus('No records in checkout list', 'warning'); return; }
        const total = selected.reduce((sum, r) => sum + (r.store_price || 0), 0);
        const tax = total * 0.08;
        const grandTotal = total + tax;
        checkoutTotal = grandTotal;
        checkoutRemaining = grandTotal;
        checkoutPaymentEntries = [];

        // Generate temporary order ID for store credit redemption
        const orderId = generateOrderId();

        let modal = document.createElement('div');
        modal.id = 'checkout-payment-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; width: 95%;">
                <div class="modal-header" style="background: #007bff; color: white;">
                    <h3 class="modal-title"><i class="fas fa-shopping-cart"></i> Checkout</h3>
                    <button class="modal-close" onclick="document.getElementById('checkout-payment-modal').style.display='none'" style="color: white;">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>${selected.length}</strong> item(s) selected.</p>
                    <div style="font-size: 20px; font-weight: bold; margin: 10px 0;">
                        Total: $${grandTotal.toFixed(2)}
                    </div>
                    <div style="font-size: 16px; margin: 10px 0; color: #28a745;">
                        Remaining: $<span id="checkout-remaining">${grandTotal.toFixed(2)}</span>
                    </div>
                    <div id="store-credit-info" style="display:none; background: #e3f2fd; padding:10px; border-radius:4px; margin-bottom:10px;">
                        Available store credit: <strong id="store-credit-balance-display">$0.00</strong>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin: 15px 0;">
                        <input type="number" id="checkout-payment-amount" class="form-control" placeholder="Amount" step="0.01" min="0" style="flex: 1; min-width: 100px;">
                        <select id="checkout-payment-method" class="form-control" style="flex: 1; min-width: 120px;">
                            <option value="Cash">Cash</option>
                            <option value="Card (Square)" selected>Card (Square)</option>
                            <option value="Gift Card">Gift Card</option>
                            <option value="Store Credit">Store Credit</option>
                        </select>
                        <button class="btn btn-primary" id="checkout-add-payment" style="background: #007bff; color: white;"><i class="fas fa-plus"></i> Add Payment</button>
                    </div>
                    <div id="checkout-square-warning" style="display:none; padding:8px; background:#fff3cd; border-radius:4px; margin-bottom:10px;">
                        ⚠️ Square POS is not available. Card option is disabled.
                    </div>
                    <div id="checkout-square-status" style="margin-top:10px; padding:10px; border-radius:4px; display:none; background:#f8f9fa; border:1px solid #ddd;"></div>
                    <div id="checkout-payment-entries" style="max-height: 150px; overflow-y: auto; margin: 10px 0;"></div>
                    <div id="checkout-payment-status" style="margin-top: 10px; display: none;"></div>
                    <button class="btn btn-success" id="checkout-complete-payment" style="width: 100%; margin-top: 10px;" disabled>Complete Payment</button>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('checkout-payment-modal').style.display='none'">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Check Square availability
        checkSquareAvailability().then(avail => {
            const methodSelect = document.getElementById('checkout-payment-method');
            const cardOption = methodSelect.querySelector('option[value="Card (Square)"]');
            const warning = document.getElementById('checkout-square-warning');
            if (!avail) {
                if (cardOption) cardOption.disabled = true;
                if (warning) warning.style.display = 'block';
                if (methodSelect.value === 'Card (Square)') methodSelect.value = 'Cash';
            } else {
                if (cardOption) cardOption.disabled = false;
                if (warning) warning.style.display = 'none';
            }
        });

        document.getElementById('checkout-remaining').textContent = checkoutRemaining.toFixed(2);
        renderCheckoutEntries();

        // Store credit handling
        const methodSelect = document.getElementById('checkout-payment-method');
        const storeCreditInfo = document.getElementById('store-credit-info');
        const balanceDisplay = document.getElementById('store-credit-balance-display');

        methodSelect.addEventListener('change', function() {
            if (this.value === 'Store Credit') {
                storeCreditInfo.style.display = 'block';
                fetch('/api/store-credit/balance', { credentials: 'include' })
                    .then(res => res.json())
                    .then(data => {
                        if (data.balance !== undefined) {
                            balanceDisplay.textContent = '$' + parseFloat(data.balance).toFixed(2);
                        }
                    })
                    .catch(() => {
                        balanceDisplay.textContent = 'Error loading balance';
                    });
            } else {
                storeCreditInfo.style.display = 'none';
            }
        });

        // Add payment button
        document.getElementById('checkout-add-payment').onclick = function() {
            const amountInput = document.getElementById('checkout-payment-amount');
            const methodSelect2 = document.getElementById('checkout-payment-method');
            let amount = parseFloat(amountInput.value);
            if (isNaN(amount) || amount <= 0) {
                amount = checkoutRemaining;
                if (amount <= 0) {
                    showCheckoutStatus('No remaining balance to pay.', 'error');
                    return;
                }
                amountInput.value = amount.toFixed(2);
            }
            const method = methodSelect2.value;

            if (method === 'Card (Square)' && !squareAvailable) {
                showCheckoutStatus('Square POS is not available. Please use Cash or Gift Card.', 'error');
                return;
            }

            if (method === 'Store Credit') {
                // Redeem store credit
                fetch('/api/store-credit/redeem', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: amount, order_id: orderId })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        addPaymentEntry('Store Credit', amount);
                        balanceDisplay.textContent = '$' + parseFloat(data.new_balance).toFixed(2);
                    } else {
                        showCheckoutStatus(data.error || 'Redemption failed', 'error');
                    }
                })
                .catch(err => {
                    showCheckoutStatus('Error: ' + err.message, 'error');
                });
                return;
            }

            if (method === 'Gift Card') {
                const code = prompt('Enter gift card code:');
                if (!code) return;
                fetch(`${AppConfig.baseUrl}/api/gift-cards/${encodeURIComponent(code)}`, {
                    credentials: 'include'
                })
                .then(res => res.json())
                .then(data => {
                    if (!data.success || !data.card) {
                        throw new Error('Gift card not found');
                    }
                    if (data.card.balance < amount) {
                        throw new Error(`Insufficient balance: $${data.card.balance.toFixed(2)}`);
                    }
                    return fetch(`${AppConfig.baseUrl}/api/gift-cards/${data.card.id}/redeem`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount: amount })
                    });
                })
                .then(res => res.json())
                .then(data => {
                    if (!data.success) {
                        throw new Error(data.error || 'Failed to redeem gift card');
                    }
                    addPaymentEntry('Gift Card', amount);
                })
                .catch(err => {
                    showCheckoutStatus(err.message, 'error');
                });
                return;
            }

            // Cash or Card (Square) – we just add the entry; Square will be processed later
            addPaymentEntry(method, amount);
        };

        // Complete button
        document.getElementById('checkout-complete-payment').onclick = function() {
            if (checkoutRemaining > 0.01) {
                showCheckoutStatus('Remaining balance not covered', 'error');
                return;
            }
            // Determine if we need Square
            const methodSelect3 = document.getElementById('checkout-payment-method');
            const method = methodSelect3.value;
            if (method === 'Card (Square)') {
                // Process Square payment
                processSquarePayment();
            } else {
                // Cash or Gift Card (already redeemed) – complete directly
                completeCheckout();
            }
        };

        modal.style.display = 'flex';
        updateCheckoutCompleteButton();

        // Reset square status
        const statusDiv = document.getElementById('checkout-square-status');
        if (statusDiv) {
            statusDiv.style.display = 'none';
            statusDiv.textContent = '';
        }
    }

    // ========== Add Payment Entry (for Cash/Gift Card/Store Credit) ==========
    function addPaymentEntry(method, amount) {
        if (amount > checkoutRemaining && checkoutRemaining > 0) {
            // allow overpayment, change will be displayed
        }
        checkoutPaymentEntries.push({ method: method, amount: amount });
        checkoutRemaining -= amount;
        document.getElementById('checkout-remaining').textContent = checkoutRemaining.toFixed(2);
        renderCheckoutEntries();
        updateCheckoutCompleteButton();
        showCheckoutStatus(`Added $${amount.toFixed(2)} ${method}`, 'success');
        document.getElementById('checkout-payment-amount').value = '';
    }

    function renderCheckoutEntries() {
        const container = document.getElementById('checkout-payment-entries');
        if (!container) return;
        if (checkoutPaymentEntries.length === 0) {
            container.innerHTML = '<div style="color: #999; text-align: center; padding: 10px;">No payments added yet.</div>';
            return;
        }
        let html = '';
        checkoutPaymentEntries.forEach((entry, idx) => {
            html += `
                <div style="display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #eee;">
                    <span>${entry.method}</span>
                    <span>$${entry.amount.toFixed(2)}</span>
                    <button class="btn btn-sm btn-danger checkout-remove-entry" data-index="${idx}" style="padding: 2px 6px;"><i class="fas fa-times"></i></button>
                </div>
            `;
        });
        container.innerHTML = html;

        container.querySelectorAll('.checkout-remove-entry').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                removeCheckoutEntry(index);
            });
        });
    }

    function removeCheckoutEntry(index) {
        const entry = checkoutPaymentEntries[index];
        if (entry) {
            checkoutRemaining += entry.amount;
            checkoutPaymentEntries.splice(index, 1);
            document.getElementById('checkout-remaining').textContent = checkoutRemaining.toFixed(2);
            renderCheckoutEntries();
            updateCheckoutCompleteButton();
            showCheckoutStatus('Payment entry removed', 'info');
        }
    }

    function updateCheckoutCompleteButton() {
        const btn = document.getElementById('checkout-complete-payment');
        if (btn) {
            btn.disabled = checkoutRemaining > 0.01;
        }
    }

    function showCheckoutStatus(message, type) {
        const el = document.getElementById('checkout-payment-status');
        if (el) {
            el.textContent = message;
            el.className = `status-message status-${type}`;
            el.style.display = 'block';
        }
    }

    // ========== Complete Action Handler ==========
    function handleCompleteAction() {
        const mode = currentSearchMode;
        console.log(`🔵 handleCompleteAction called for mode: ${mode}`);
        if (mode === 'add') {
            showStatus('Use COGS, Print, or Set Active buttons.', 'info');
        } else if (mode === 'scan') {
            showCompleteScanModal();
        } else if (mode === 'discogs') {
            console.log(`🔵 handleCompleteAction: calling postSelectedRecords`);
            postSelectedRecords();
        } else if (mode === 'delete') {
            deleteSelected();
        } else if (mode === 'checkout') {
            if (checkoutSelectedItems.length === 0) {
                showStatus('No items in checkout.', 'warning');
                return;
            }
            showCheckoutModal();
        } else if (mode === 'discogs_orders') {
            processDiscogsOrder();
        } else {
            showStatus('No action available for this mode', 'warning');
        }
    }

    // ========== Complete Scan Modal ==========
    function showCompleteScanModal() {
        const records = filteredRecords;
        if (records.length === 0) {
            showStatus('No scanned records to process', 'warning');
            return;
        }

        const sorted = [...records].sort((a, b) => {
            const aDate = a.last_seen ? new Date(a.last_seen) : new Date(0);
            const bDate = b.last_seen ? new Date(b.last_seen) : new Date(0);
            return aDate - bDate;
        });
        const counterMap = {};
        sorted.forEach((r, idx) => {
            counterMap[r.id] = idx + 1;
        });

        let modal = document.getElementById('complete-scan-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'complete-scan-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 600px; width: 95%;">
                    <div class="modal-header" style="background: #28a745; color: white;">
                        <h3 class="modal-title"><i class="fas fa-check-double"></i> Complete Scan</h3>
                        <button class="modal-close" onclick="document.getElementById('complete-scan-modal').style.display='none'" style="color: white;">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p><strong>${records.length}</strong> record(s) scanned. Set the location for all scanned records.</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div style="grid-column: 1 / -1;">
                                <label for="scan-genre" style="display:block; font-weight:500; margin-bottom:4px;">Genre *</label>
                                <select id="scan-genre" class="form-control" style="width:100%; padding:8px;">
                                    <option value="">-- Select Genre --</option>
                                </select>
                            </div>
                            <div>
                                <label for="scan-main-location-type" style="display:block; font-weight:500; margin-bottom:4px;">Main Location Type</label>
                                <select id="scan-main-location-type" class="form-control" style="width:100%; padding:8px;">
                                    <option value="Bin">📦 Bin</option>
                                    <option value="Display">🖼️ Display</option>
                                    <option value="Wall">🧱 Wall</option>
                                    <option value="Custom">✏️ Custom</option>
                                </select>
                            </div>
                            <div>
                                <label for="scan-main-location-number" style="display:block; font-weight:500; margin-bottom:4px;">Number/Identifier</label>
                                <input type="text" id="scan-main-location-number" class="form-control" value="1" style="width:100%; padding:8px;">
                            </div>
                            <div style="grid-column: 1 / -1;">
                                <label for="scan-sublocation" style="display:block; font-weight:500; margin-bottom:4px;">Sublocation</label>
                                <select id="scan-sublocation" class="form-control" style="width:100%; padding:8px;">
                                    <option value="LT">↖️ Left Top</option>
                                    <option value="RT">↗️ Right Top</option>
                                    <option value="LB">↙️ Left Bottom</option>
                                    <option value="RB">↘️ Right Bottom</option>
                                    <option value="NA">⚪ N/A</option>
                                    <option value="CUSTOM">✏️ Custom</option>
                                </select>
                            </div>
                            <div style="grid-column: 1 / -1; display: none;" id="scan-custom-sublocation-container">
                                <label for="scan-custom-sublocation" style="display:block; font-weight:500; margin-bottom:4px;">Custom Sublocation</label>
                                <input type="text" id="scan-custom-sublocation" class="form-control" placeholder="e.g., Shelf 3" style="width:100%; padding:8px;">
                            </div>
                        </div>
                        <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                            <strong>Location Preview:</strong> <span id="scan-location-preview" style="font-weight: bold; color: #007bff;">--</span>
                        </div>
                        <div id="scan-status" style="margin-top:10px; padding:8px; border-radius:4px; display:none;"></div>
                    </div>
                    <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;">
                        <button class="btn btn-secondary" onclick="document.getElementById('complete-scan-modal').style.display='none'">Cancel</button>
                        <button class="btn btn-success" id="scan-submit-btn"><i class="fas fa-check"></i> Apply Location</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const genreSelect = document.getElementById('scan-genre');
        if (genreSelect) {
            if (genres.length === 0) {
                loadGenres().then(() => {
                    genreSelect.innerHTML = '<option value="">-- Select Genre --</option>';
                    genres.forEach(g => {
                        const opt = document.createElement('option');
                        opt.value = g;
                        opt.textContent = g;
                        genreSelect.appendChild(opt);
                    });
                });
            } else {
                genreSelect.innerHTML = '<option value="">-- Select Genre --</option>';
                genres.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g;
                    opt.textContent = g;
                    genreSelect.appendChild(opt);
                });
            }
        }

        const prediction = getLocationPrediction(lastSubmittedLocation);
        if (prediction) {
            const mainType = document.getElementById('scan-main-location-type');
            const mainNumber = document.getElementById('scan-main-location-number');
            const sublocation = document.getElementById('scan-sublocation');
            if (mainType) mainType.value = prediction.mainType || 'Bin';
            if (mainNumber) mainNumber.value = prediction.mainNumber || '1';
            if (sublocation) sublocation.value = prediction.sublocation || 'LT';
            if (prediction.genre && genreSelect) genreSelect.value = prediction.genre;
        } else {
            const mainType = document.getElementById('scan-main-location-type');
            const mainNumber = document.getElementById('scan-main-location-number');
            const sublocation = document.getElementById('scan-sublocation');
            if (mainType) mainType.value = 'Bin';
            if (mainNumber) mainNumber.value = '1';
            if (sublocation) sublocation.value = 'LT';
        }

        const sublocationSelect = document.getElementById('scan-sublocation');
        const customContainer = document.getElementById('scan-custom-sublocation-container');
        const customInput = document.getElementById('scan-custom-sublocation');
        sublocationSelect.onchange = function() {
            customContainer.style.display = this.value === 'CUSTOM' ? 'block' : 'none';
            updateScanLocationPreview();
        };
        if (customInput) {
            customInput.oninput = updateScanLocationPreview;
        }
        document.querySelectorAll('#scan-genre, #scan-main-location-type, #scan-main-location-number, #scan-sublocation').forEach(el => {
            el.addEventListener('change', updateScanLocationPreview);
            el.addEventListener('input', updateScanLocationPreview);
        });

        updateScanLocationPreview();
        modal.style.display = 'flex';

        const submitBtn = document.getElementById('scan-submit-btn');
        const newSubmit = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmit, submitBtn);
        newSubmit.addEventListener('click', async function() {
            await handleScanSubmit(counterMap);
        });
    }

    function updateScanLocationPreview() {
        const genre = document.getElementById('scan-genre')?.value || '';
        const mainType = document.getElementById('scan-main-location-type')?.value || 'Bin';
        const mainNumber = document.getElementById('scan-main-location-number')?.value || '1';
        const sublocation = document.getElementById('scan-sublocation')?.value || 'LT';

        let mainLocation = mainType + ' ' + mainNumber;
        let sublocStr = '';
        if (sublocation === 'CUSTOM') {
            sublocStr = document.getElementById('scan-custom-sublocation')?.value.trim() || 'Custom';
        } else if (sublocation !== 'NA') {
            const names = { 'LT': 'Left Top', 'RT': 'Right Top', 'LB': 'Left Bottom', 'RB': 'Right Bottom' };
            sublocStr = names[sublocation] || '';
        }

        let parts = [];
        if (genre) parts.push(genre);
        if (mainLocation) parts.push(mainLocation);
        if (sublocStr) parts.push(sublocStr);

        const preview = document.getElementById('scan-location-preview');
        if (preview) preview.textContent = parts.join(' | ') || '--';
    }

    function getLocationPrediction(lastLocation) {
        if (!lastLocation) return null;
        const parts = lastLocation.split(' | ').map(s => s.trim());
        let genre = '', mainType = 'Bin', mainNumber = '1', sublocation = 'LT';

        parts.forEach(p => {
            if (p.match(/^(Bin|Display|Wall)\s+\S+$/i)) {
                const match = p.match(/^(Bin|Display|Wall)\s+(\S+)$/i);
                if (match) { mainType = match[1]; mainNumber = match[2]; }
            } else if (p.match(/^(LT|RT|LB|RB|NA|CUSTOM)$/i)) {
                sublocation = p;
            } else if (!p.match(/^(Bin|Display|Wall|LT|RT|LB|RB|NA|CUSTOM|\d+)/i)) {
                genre = p;
            }
        });

        const sequence = ['LT', 'RT', 'LB', 'RB'];
        let idx = sequence.indexOf(sublocation);
        if (idx !== -1) {
            if (idx < sequence.length - 1) {
                sublocation = sequence[idx + 1];
            } else {
                sublocation = sequence[0];
                const num = parseInt(mainNumber) || 1;
                mainNumber = String(num + 1);
            }
        } else {
            sublocation = 'LT';
        }
        return { genre, mainType, mainNumber, sublocation };
    }

    async function handleScanSubmit(counterMap) {
        const records = filteredRecords;
        if (records.length === 0) {
            showScanStatus('No records to update.', 'error');
            return;
        }

        const genre = document.getElementById('scan-genre')?.value || '';
        const mainType = document.getElementById('scan-main-location-type')?.value || 'Bin';
        const mainNumber = document.getElementById('scan-main-location-number')?.value || '1';
        const sublocation = document.getElementById('scan-sublocation')?.value || 'LT';

        if (!genre) {
            showScanStatus('Please select a genre', 'error');
            return;
        }

        let mainLocation = mainType + ' ' + mainNumber;
        let sublocStr = '';
        if (sublocation === 'CUSTOM') {
            const custom = document.getElementById('scan-custom-sublocation')?.value.trim();
            if (!custom) {
                showScanStatus('Please enter custom sublocation text', 'error');
                return;
            }
            sublocStr = custom;
        } else if (sublocation !== 'NA') {
            const names = { 'LT': 'Left Top', 'RT': 'Right Top', 'LB': 'Left Bottom', 'RB': 'Right Bottom' };
            sublocStr = names[sublocation] || '';
        }

        const today = getLocalMSTDate();

        const submitBtn = document.getElementById('scan-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

        let updated = 0;
        for (const record of records) {
            const counter = counterMap[record.id] || 1;
            let parts = [];
            if (genre) parts.push(genre);
            if (mainLocation) parts.push(mainLocation);
            if (sublocStr) parts.push(sublocStr);
            parts.push(String(counter));
            const locationString = parts.join(' | ');

            try {
                await apiPut('/records/' + record.id, {
                    location: locationString,
                    last_seen: today
                });
                updated++;
            } catch (e) {
                console.error('Failed to update record', record.id, e);
            }
        }

        if (updated > 0) {
            const firstRecord = records[0];
            const firstCounter = counterMap[firstRecord.id] || 1;
            let firstParts = [];
            if (genre) firstParts.push(genre);
            if (mainLocation) firstParts.push(mainLocation);
            if (sublocStr) firstParts.push(sublocStr);
            firstParts.push(String(firstCounter));
            lastSubmittedLocation = firstParts.join(' | ');
            localStorage.setItem('lastSubmittedLocation', lastSubmittedLocation);
        }

        filteredRecords = [];
        totalRecords = 0;
        currentPage = 1;
        renderPagination();
        renderTablePage();

        showScanStatus(`✅ Updated ${updated} of ${records.length} records with location.`, 'success');
        playSuccessSound();

        setTimeout(() => {
            document.getElementById('complete-scan-modal').style.display = 'none';
        }, 1500);

        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Apply Location';
    }

    function showScanStatus(message, type = 'info') {
        const el = document.getElementById('scan-status');
        if (!el) return;
        el.textContent = message;
        el.className = `status-message status-${type}`;
        el.style.display = 'block';
    }

    // ========== Mode Change Handler ==========
    function onModeChange() {
        const newMode = searchModeSelect.value;
        currentSearchMode = newMode;
        console.log(`🔄 onModeChange: switching to ${newMode}`);

        if (newMode === 'add') {
            currentMode = 'inventory';
            currentResults = [];
            loadRecords({ statusIds: [1], mode: 'add' });
            searchInput.placeholder = 'Search Discogs...';
        } else if (newMode === 'scan') {
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Scan mode: Scan barcodes to build the list.', 'info');
            searchInput.placeholder = 'Scan barcode here...';
        } else if (newMode === 'discogs') {
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showDiscogsStatus('Showing all records. Use filters to narrow down.', 'info');
            searchInput.placeholder = 'Search within records...';
            console.log('🔄 onModeChange: loading discogs records');
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
            initializeLastSeenDate();
        } else if (newMode === 'delete') {
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Delete mode: Use filters to find records to delete.', 'info');
            searchInput.placeholder = 'Search records...';
            allRecords = [];
            loadRecords({ statusIds: [1,2], mode: 'delete' });
        } else if (newMode === 'checkout') {
            // Load active records into allRecords, but show empty checkout list
            checkoutSelectedItems = [];
            checkoutViewMode = 'list';
            filteredRecords = []; // start empty
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Checkout mode: Search to add records, or use "Custom Item".', 'info');
            searchInput.placeholder = 'Search records...';
            // Load active records for searching
            loadRecords({ statusIds: [2], mode: 'checkout' }).then(() => {
                // After loading, we keep filteredRecords empty (list view)
                checkoutViewMode = 'list';
                filteredRecords = checkoutSelectedItems.slice();
                totalRecords = filteredRecords.length;
                currentPage = 1;
                renderPagination();
                renderTablePage();
                updateSelectionCount();
            });
            // Update button visibility
            if (checkoutShowSelectedBtn) {
                checkoutShowSelectedBtn.style.display = 'inline-block';
                checkoutShowSelectedBtn.textContent = `Checkout List (0)`;
                checkoutShowSelectedBtn.onclick = function() {
                    checkoutViewMode = 'list';
                    filteredRecords = checkoutSelectedItems.slice();
                    totalRecords = filteredRecords.length;
                    currentPage = 1;
                    renderPagination();
                    renderTablePage();
                    updateSelectionCount();
                };
            }
            if (checkoutShowAllBtn) {
                checkoutShowAllBtn.style.display = 'inline-block';
                checkoutShowAllBtn.textContent = 'Search Results';
                checkoutShowAllBtn.onclick = function() {
                    // Show all active records (search view)
                    checkoutViewMode = 'search';
                    filteredRecords = allRecords.slice();
                    totalRecords = filteredRecords.length;
                    currentPage = 1;
                    renderPagination();
                    renderTablePage();
                    updateSelectionCount();
                };
            }
        } else if (newMode === 'discogs_orders') {
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Discogs Orders mode: Select an order to fulfill.', 'info');
            searchInput.placeholder = 'Search orders... (coming soon)';
            // Load orders list with current status filter
            loadDiscogsOrdersList(ordersStatusFilter);
            // Clear any previous selection
            if (discogsOrderSelect) discogsOrderSelect.value = '';
            selectedOrderId = null;
            currentOrderItems = [];
        }

        updateSelectionCount();
        updateFilterVisibility();
        renderTablePage();
    }

    function initializeLastSeenDate() {
        if (lastSeenCutoffDateInput) {
            lastSeenCutoffDateInput.value = '';
            lastSeenCutoffDate = null;
        }
    }

    // ========== Pagination ==========
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

    // ========== UNIFIED SELECTION LOGIC ==========
    function getSelectedRecords() {
        // Checkout mode uses its own list
        if (currentSearchMode === 'checkout') {
            return checkoutSelectedItems.slice();
        }
        // All other modes use the range selection
        if (rangeFromIndex === null || rangeToIndex === null) {
            console.log('🔍 getSelectedRecords: no range selected');
            return [];
        }
        const start = Math.min(rangeFromIndex, rangeToIndex);
        const end = Math.max(rangeFromIndex, rangeToIndex);
        const data = getCurrentData();
        const selected = data.slice(start, end + 1);
        console.log(`🔍 getSelectedRecords: start=${start}, end=${end}, selected=${selected.length}`);
        return selected;
    }

    function updateSelectionCount() {
        const selected = getSelectedRecords();
        const count = selected.length;
        selectedCountSpan.textContent = count;

        const mode = currentSearchMode;
        const hasRecords = filteredRecords.length > 0;

        if (mode === 'add') {
            cogsBtn.disabled = !hasRecords;
            printBtn.disabled = !hasRecords;
            setActiveBtn.disabled = !hasRecords;
            completeActionBtn.style.display = 'none';
        } else {
            cogsBtn.style.display = 'none';
            printBtn.style.display = 'none';
            setActiveBtn.style.display = 'none';
            completeActionBtn.style.display = '';
        }

        let actionLabel = 'Complete';
        if (mode === 'add') {
            // already handled
        } else if (mode === 'scan') {
            completeActionBtn.disabled = !hasRecords;
            actionLabel = 'Complete Scan';
        } else if (mode === 'discogs') {
            const hasSelection = (rangeFromIndex !== null && rangeToIndex !== null && count > 0);
            completeActionBtn.disabled = !hasSelection;
            actionLabel = `Post ${count} selected to Discogs`;
            console.log(`🔄 updateSelectionCount: discogs mode, hasSelection=${hasSelection}, count=${count}, btn disabled=${completeActionBtn.disabled}`);
        } else if (mode === 'delete') {
            const hasSelection = (rangeFromIndex !== null && rangeToIndex !== null && count > 0);
            completeActionBtn.disabled = !hasSelection;
            actionLabel = `Delete ${count} selected`;
            console.log(`🔄 updateSelectionCount: delete mode, hasSelection=${hasSelection}, count=${count}, btn disabled=${completeActionBtn.disabled}`);
        } else if (mode === 'checkout') {
            completeActionBtn.disabled = checkoutSelectedItems.length === 0;
            actionLabel = `Checkout ${checkoutSelectedItems.length} items`;
        } else if (mode === 'discogs_orders') {
            // Enable only if an order is selected and there are items
            const hasOrder = selectedOrderId !== null;
            const hasItems = filteredRecords.length > 0;
            completeActionBtn.disabled = !(hasOrder && hasItems);
            actionLabel = `Mark ${filteredRecords.length} items sold`;
        }

        if (mode !== 'add') {
            completeActionBtn.textContent = actionLabel;
        }

        cancelRangeBtn.style.display = (rangeFromIndex !== null && rangeToIndex !== null) ? 'inline-block' : 'none';
    }

    function applyFilters() {
        if (currentSearchMode === 'scan' || currentSearchMode === 'discogs' || currentSearchMode === 'delete' || currentSearchMode === 'checkout' || currentSearchMode === 'discogs_orders') {
            return;
        }
        if (currentMode === 'search') {
            filteredRecords = currentResults.slice();
        } else {
            filteredRecords = allRecords.slice();
        }
        totalRecords = filteredRecords.length;
        const totalPages = Math.ceil(totalRecords / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        renderPagination();
        renderTablePage();
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

    // ========== Init ==========
    async function init() {
        console.log('🔄 inventory-ops: Initializing...');

        if (_initialized) {
            await loadMinimumPrice();
            await loadStorePriceMultiplier();
            await loadConditions();
            await loadConsignors();
            await loadAccounts();
            await loadStats();
            return;
        }

        await loadMinimumPrice();
        await loadStorePriceMultiplier();
        await loadConditions();
        await loadConsignors();
        await loadAccounts();
        await loadStats();

        searchModeSelect.addEventListener('change', onModeChange);

        // ========== SEARCH BUTTON ==========
        let searchButton = document.getElementById('searchButton');
        if (!searchButton) {
            searchButton = document.createElement('button');
            searchButton.id = 'searchButton';
            searchButton.type = 'button';
            searchButton.className = 'btn btn-primary';
            searchButton.innerHTML = '<i class="fas fa-search"></i> Search';
            searchButton.style.marginLeft = '8px';
            const parent = searchInput.parentNode;
            parent.insertBefore(searchButton, clearSearchBtn);
        }

        searchButton.addEventListener('click', function() {
            const term = searchInput.value.trim();
            performSearch(term);
        });

        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const term = this.value.trim();
                performSearch(term);
            }
        });

        clearSearchBtn.addEventListener('click', clearSearch);

        // Scan mode only: immediate input handling
        searchInput.addEventListener('input', function() {
            if (currentSearchMode === 'scan') {
                const term = this.value.trim();
                if (term.length > 2) {
                    performScanSearch(term);
                } else if (term.length === 0) {
                    filteredRecords = [];
                    totalRecords = 0;
                    currentPage = 1;
                    renderPagination();
                    renderTablePage();
                    updateSelectionCount();
                }
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

        cogsBtn.addEventListener('click', showCogsModal);
        printBtn.addEventListener('click', printPriceTags);
        setActiveBtn.addEventListener('click', setActive);
        completeActionBtn.addEventListener('click', handleCompleteAction);
        cancelRangeBtn.addEventListener('click', cancelRangeSelection);

        if (discogsLocationSelect) {
            discogsLocationSelect.addEventListener('change', function() {
                refreshDiscogsRecords();
            });
        }

        if (applyLastSeenFilterBtn) {
            applyLastSeenFilterBtn.addEventListener('click', function() {
                applyLastSeenFilter();
            });
        }

        if (deleteStatusFilter) {
            deleteStatusFilter.addEventListener('change', function() {
                applyDeleteFilter();
            });
        }

        const checkoutStatusFilter = document.getElementById('checkout-status-filter');
        if (checkoutStatusFilter) {
            checkoutStatusFilter.addEventListener('change', function() {
                loadRecords({ statusIds: [2], mode: 'checkout' });
            });
        }
        // We handle checkout buttons in onModeChange

        // Discogs Orders: refresh button, order select, and status filter
        if (discogsOrdersRefreshBtn) {
            discogsOrdersRefreshBtn.addEventListener('click', function() {
                loadDiscogsOrdersList(ordersStatusFilter);
            });
        }
        if (discogsOrderSelect) {
            discogsOrderSelect.addEventListener('change', function() {
                const orderId = this.value;
                selectedOrderId = orderId || null;
                if (orderId) {
                    loadOrderItems(orderId);
                } else {
                    currentOrderItems = [];
                    filteredRecords = [];
                    totalRecords = 0;
                    currentPage = 1;
                    renderPagination();
                    renderTablePage();
                }
                updateSelectionCount();
            });
        }
        if (discogsOrdersStatusFilter) {
            discogsOrdersStatusFilter.addEventListener('change', function() {
                ordersStatusFilter = this.value || '';
                console.log(`📦 Status filter changed to: ${ordersStatusFilter || 'all'}`);
                loadDiscogsOrdersList(ordersStatusFilter);
                if (discogsOrderSelect) discogsOrderSelect.value = '';
                selectedOrderId = null;
                currentOrderItems = [];
                filteredRecords = [];
                totalRecords = 0;
                currentPage = 1;
                renderPagination();
                renderTablePage();
            });
        }

        currentSearchMode = searchModeSelect.value;
        onModeChange();

        _initialized = true;
        console.log('✅ inventory-ops.js initialized');
    }

    window.refreshDiscogsLocations = loadDiscogsLocations;
    window.initAddRecordsTab = init;

})();