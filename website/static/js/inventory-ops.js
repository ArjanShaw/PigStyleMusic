// ============================================================================
// inventory-ops.js - Unified Inventory Operations
// Uses one-container-per-mode visibility
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
    const printBtn = document.getElementById('print-btn');
    const cancelRangeBtn = document.getElementById('cancel-range-btn');

    // ========== Mode containers ==========
    const addModeContainer = document.getElementById('add-mode-container');
    const scanModeContainer = document.getElementById('scan-mode-container');
    const discogsModeContainer = document.getElementById('discogs-mode-container');
    const deleteModeContainer = document.getElementById('delete-mode-container');
    const checkoutModeContainer = document.getElementById('checkout-mode-container');
    const discogsOrdersModeContainer = document.getElementById('discogs-orders-mode-container');
    const refundModeContainer = document.getElementById('refund-mode-container');

    // ========== NEW: Scan Location Elements ==========
    const scanGenreSelect = document.getElementById('scan-genre-select');
    const scanFormatSelect = document.getElementById('scan-format-select');
    const scanAreaSelect = document.getElementById('scan-area-select');
    const scanSublocationSelect = document.getElementById('scan-sublocation-select');
    const scanInput = document.getElementById('scan-input');
    const scanSubmitBtn = document.getElementById('scan-submit-btn');
    const scanLocationDisplay = document.getElementById('scan-location-display');
    const scanIndexDisplay = document.getElementById('scan-index-display');
    const recentScansList = document.getElementById('recent-scans-list');
    const lastScanDisplay = document.getElementById('last-scan-display');

    // ========== NEW: Filter Elements ==========
    const filterLastSeen = document.getElementById('filter-last-seen');
    const filterGenre = document.getElementById('filter-genre');
    const filterFormat = document.getElementById('filter-format');
    const filterArea = document.getElementById('filter-area');
    const filterSublocation = document.getElementById('filter-sublocation');
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');

    // ========== Domain Management Elements ==========
    const genresList = document.getElementById('genres-list');
    const newGenreInput = document.getElementById('new-genre');
    const addGenreBtn = document.getElementById('add-genre-btn');
    const formatsList = document.getElementById('formats-list');
    const newFormatInput = document.getElementById('new-format');
    const addFormatBtn = document.getElementById('add-format-btn');
    const areasList = document.getElementById('areas-list');
    const newAreaInput = document.getElementById('new-area');
    const addAreaBtn = document.getElementById('add-area-btn');
    const sublocationsList = document.getElementById('sublocations-list');
    const sublocationAreaFilter = document.getElementById('sublocation-area-filter');
    const newSublocationArea = document.getElementById('new-sublocation-area');
    const newSublocationName = document.getElementById('new-sublocation-name');
    const newSublocationAbbr = document.getElementById('new-sublocation-abbr');
    const addSublocationBtn = document.getElementById('add-sublocation-btn');

    // ========== Other DOM Elements ==========
    const discogsLocationSelect = document.getElementById('discogs-location-select');
    const discogsStatusMessage = document.getElementById('discogs-status-message');
    const lastSeenCutoffDateInput = document.getElementById('last-seen-cutoff-date');
    const applyLastSeenFilterBtn = document.getElementById('apply-last-seen-filter');

    const deleteStatusFilter = document.getElementById('delete-status-filter');

    const checkoutShowSelectedBtn = document.getElementById('checkout-show-selected-btn');
    const checkoutShowAllBtn = document.getElementById('checkout-show-all-btn');

    const discogsOrderSelect = document.getElementById('discogs-order-select');
    const discogsOrdersRefreshBtn = document.getElementById('discogs-orders-refresh-btn');
    const discogsOrdersStatus = document.getElementById('discogs-orders-status');
    const discogsOrdersStatusFilter = document.getElementById('discogs-orders-status-filter');
    const discogsOrdersApplyFiltersBtn = document.getElementById('discogs-orders-apply-filters-btn');
    const discogsOrdersDateFrom = document.getElementById('discogs-orders-date-from');
    const discogsOrdersDateTo = document.getElementById('discogs-orders-date-to');
    const discogsOrdersSearch = document.getElementById('discogs-orders-search');

    const defaultSleeveSelect = document.getElementById('default-sleeve-condition');
    const defaultDiscSelect = document.getElementById('default-disc-condition');
    const defaultPriceInput = document.getElementById('default-price');
    const defaultConsignorSelect = document.getElementById('default-consignor');

    const purchasesContainer = document.getElementById('purchases-container');
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
    let formats = [];
    let areas = [];
    let sublocations = [];
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

    let lastSubmittedLocation = localStorage.getItem('lastSubmittedLocation') || null;
    let checkoutSelectedItems = [];
    let checkoutViewMode = 'list';
    let checkoutRemaining = 0;
    let checkoutPaymentEntries = [];
    let checkoutTotal = 0;

    let currentLocationRecords = [];
    let discogsFilteredRecords = [];
    let currentLocation = null;
    let lastSeenCutoffDate = null;

    let ordersList = [];
    let currentOrderItems = [];
    let selectedOrderId = null;
    let ordersStatusFilter = '';

    let squareAvailable = false;
    let squareCheckoutId = null;
    let squarePollInterval = null;
    let availableTerminals = [];

    let markupCurveChart = null;
    let markupDistributionChart = null;
    let ageDistributionChart = null;

    let isPosting = false;
    let postProgress = 0;
    let postResults = [];

    let defaultParams = {
        sleeveConditionId: null,
        discConditionId: null,
        price: null,
        consignorId: null
    };
    let defaultParamsActive = false;

    // ========== NEW: Scan Session State ==========
    let scanSession = {
        genre_id: null,
        format_id: null,
        area_id: null,
        sublocation_id: null,
        location_index: 1,
        is_ready: false
    };

    let recentScans = [];
    const MAX_RECENT_SCANS = 10;

    // ========== Purchase State ==========
    let selectedPurchaseId = null;
    let currentPurchaseRecords = [];

    // ========== Audio ==========
    let audioContext = null;

    // ========== Mode Container Mapping ==========
    const modeContainers = {
        'add': addModeContainer,
        'scan': scanModeContainer,
        'discogs': discogsModeContainer,
        'delete': deleteModeContainer,
        'checkout': checkoutModeContainer,
        'discogs_orders': discogsOrdersModeContainer,
        'refund': refundModeContainer
    };

    // ========== Helper Functions ==========
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
        setTimeout(function() { el.style.display = 'none'; }, 5000);
    }

    function showToast(message, type) {
        console.log('🍞 TOAST [' + type + ']: ' + message);
        showStatus(message, type);
    }

    function showDiscogsStatus(message, type) {
        var el = document.getElementById('discogs-status-message');
        if (!el) return;
        type = type || 'info';
        var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        el.className = 'status-message status-' + type;
        el.style.display = 'block';
        setTimeout(function() { if (el) el.style.display = 'none'; }, 8000);
    }

    function updateDiscogsOrdersStatus(message, type) {
        if (!discogsOrdersStatus) return;
        type = type || 'info';
        var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        discogsOrdersStatus.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        discogsOrdersStatus.className = 'status-message status-' + type;
        discogsOrdersStatus.style.display = 'block';
        setTimeout(function() {
            if (discogsOrdersStatus) discogsOrdersStatus.style.display = 'none';
        }, 8000);
    }

    function getStatusName(statusId) {
        var map = { 1: 'New', 2: 'Active', 3: 'Sold', 4: 'Sold on Discogs' };
        return map[statusId] || 'Unknown';
    }

    function getStatusClass(statusId) {
        var map = { 1: 'new', 2: 'active', 3: 'sold', 4: 'discogs' };
        return map[statusId] || '';
    }

    function generateOrderId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function getLocalMSTDate() {
        var now = new Date();
        var year = now.getFullYear();
        var month = String(now.getMonth() + 1).padStart(2, '0');
        var day = String(now.getDate()).padStart(2, '0');
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
        var cutoffDate = getLastSeenCutoffDate();
        if (!cutoffDate) return true;
        if (!record.last_seen) return false;
        try {
            var lastSeenDate = record.last_seen.split('T')[0];
            return lastSeenDate >= cutoffDate;
        } catch (e) {
            return false;
        }
    }

    function formatLastSeen(lastSeen) {
        if (!lastSeen) return '<span style="color: #dc3545;">Never</span>';
        try {
            var lastSeenDate = new Date(lastSeen);
            var today = new Date();
            var daysSince = Math.floor((today - lastSeenDate) / (1000 * 60 * 60 * 24));
            var cutoffDate = getLastSeenCutoffDate();
            if (cutoffDate) {
                var cutoffDateObj = new Date(cutoffDate);
                if (lastSeenDate < cutoffDateObj) {
                    return '<span style="color: #dc3545;" title="Before cutoff date">' + daysSince + ' days ago (⚠️)</span>';
                }
            }
            if (daysSince === 0) return '<span style="color: #28a745;">Today</span>';
            if (daysSince === 1) return '<span style="color: #28a745;">Yesterday</span>';
            if (daysSince <= 7) return '<span style="color: #ffc107;">' + daysSince + ' days ago</span>';
            if (daysSince <= 30) return '<span style="color: #fd7e14;">' + daysSince + ' days ago</span>';
            return '<span style="color: #dc3545;">' + daysSince + ' days ago</span>';
        } catch (e) {
            return lastSeen;
        }
    }

    function playSound(type) {
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContext.state === 'suspended') audioContext.resume();

            var configs = {
                beep: { freq: 800, duration: 200, type: 'sine', gain: 0.3 },
                error: { freq: 220, duration: 600, type: 'sawtooth', gain: 0.4 },
                success: { freq: 523.25, duration: 200, type: 'sine', gain: 0.2, notes: [523.25, 659.25, 783.99] }
            };

            var config = configs[type];
            if (!config) return;

            if (config.notes) {
                config.notes.forEach(function(freq, i) {
                    setTimeout(function() {
                        var osc = audioContext.createOscillator();
                        var gain = audioContext.createGain();
                        osc.connect(gain);
                        gain.connect(audioContext.destination);
                        osc.frequency.value = freq;
                        osc.type = config.type;
                        gain.gain.setValueAtTime(config.gain, audioContext.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + config.duration / 1000);
                        osc.start();
                        osc.stop(audioContext.currentTime + config.duration / 1000);
                    }, i * 100);
                });
            } else {
                var osc = audioContext.createOscillator();
                var gain = audioContext.createGain();
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.frequency.value = config.freq;
                osc.type = config.type;
                gain.gain.setValueAtTime(config.gain, audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + config.duration / 1000);
                osc.start();
                osc.stop(audioContext.currentTime + config.duration / 1000);
            }
        } catch (e) { console.warn('Sound error:', e); }
    }

    function downloadReceipt(text, filename) {
        filename = filename || 'receipt.txt';
        console.log('📄 downloadReceipt: filename=' + filename + ', text length=' + text.length);
        var blob = new Blob([text], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('✅ downloadReceipt: file downloaded');
    }

    // ========== Consolidated API ==========
    async function apiRequest(method, endpoint, body) {
        console.log('🌐 apiRequest: ' + method + ' ' + endpoint, body || '');
        var options = {
            method: method,
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }
        var res = await fetch(window.AppConfig.baseUrl + endpoint, options);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' on ' + method + ' ' + endpoint);
        return res.json();
    }

    // ========== Config Loaders ==========
    async function loadMinimumPrice() {
        var data = await apiRequest('GET', '/config/MIN_STORE_PRICE');
        minimumPrice = parseFloat(data.config_value);
    }

    async function loadStorePriceMultiplier() {
        var data = await apiRequest('GET', '/config/STORE_PRICE_ESTIMATED_MULTIPLIER');
        storePriceMultiplier = parseFloat(data.config_value);
    }

    async function loadConditions() {
        var data = await apiRequest('GET', '/api/conditions');
        conditions = data.conditions;
    }

    async function loadConsignors() {
        var data = await apiRequest('GET', '/users');
        consignors = data.users.filter(function(u) { return u.role === 'consignor'; });
        consignorMap = {};
        data.users.forEach(function(u) { consignorMap[u.id] = { initials: u.initials || '', name: u.full_name || u.username }; });
    }

    async function loadAccounts() {
        try {
            var data = await apiRequest('GET', '/api/accounting/accounts');
            accounts = data.accounts || [];
            accounts = accounts.filter(function(acc) { return acc && acc.code && acc.name; });
            console.log('✅ Loaded accounts:', accounts.length);
        } catch (e) {
            console.warn('Could not load accounts:', e);
            accounts = [];
        }
    }

    async function loadStats() {
        var total = await apiRequest('GET', '/records/count');
        document.getElementById('total-records').textContent = total.count;
        var newCount = await apiRequest('GET', '/records/count?status_id=1');
        document.getElementById('new-records-count').textContent = newCount.count;

        var lastRecordData = await apiRequest('GET', '/records?limit=1&order_by=created_at&order=desc');
        var lastRecord = lastRecordData.records && lastRecordData.records.length > 0 ? lastRecordData.records[0] : null;
        if (lastRecord) {
            var artist = lastRecord.artist || 'Unknown';
            var title = lastRecord.title || 'Unknown';
            var price = lastRecord.store_price ? '$' + lastRecord.store_price.toFixed(2) : '';
            var shortArtist = artist.length > 20 ? artist.substring(0, 20) + '…' : artist;
            var shortTitle = title.length > 20 ? title.substring(0, 20) + '…' : title;
            var display = shortArtist + ' - ' + shortTitle;
            if (price) display += ' - ' + price;
            document.getElementById('last-added-record').textContent = display;
        } else {
            document.getElementById('last-added-record').textContent = 'None';
        }

        var commission = await apiRequest('GET', '/api/commission-rate');
        document.getElementById('commission-rate').textContent = commission.commission_rate_percent;
    }

    // ========== NEW: Domain Data Loading ==========

    async function loadGenres() {
        try {
            var data = await apiRequest('GET', '/api/genres');
            genres = data.genres || [];
            console.log('✅ Loaded genres:', genres.length);
        } catch (e) {
            console.warn('Could not load genres:', e);
            genres = [];
        }
    }

    async function loadFormats() {
        try {
            var data = await apiRequest('GET', '/api/formats');
            formats = data.formats || [];
            console.log('✅ Loaded formats:', formats.length);
        } catch (e) {
            console.warn('Could not load formats:', e);
            formats = [];
        }
    }

    async function loadAreas() {
        try {
            var data = await apiRequest('GET', '/api/areas');
            areas = data.areas || [];
            console.log('✅ Loaded areas:', areas.length);
        } catch (e) {
            console.warn('Could not load areas:', e);
            areas = [];
        }
    }

    async function loadSublocations(areaId) {
        try {
            var url = '/api/sublocations';
            if (areaId) {
                url += '?area_id=' + areaId;
            }
            var data = await apiRequest('GET', url);
            sublocations = data.sublocations || [];
            console.log('✅ Loaded sublocations:', sublocations.length);
        } catch (e) {
            console.warn('Could not load sublocations:', e);
            sublocations = [];
        }
    }

    async function loadAllDomainData() {
        await Promise.all([
            loadGenres(),
            loadFormats(),
            loadAreas(),
            loadSublocations()
        ]);
        populateScanDropdowns();
        populateFilterDropdowns();
        populateDomainManagementLists();
    }

    // ========== NEW: Scan Session Management ==========

    function resetScanSession() {
        scanSession = {
            genre_id: null,
            format_id: null,
            area_id: null,
            sublocation_id: null,
            location_index: 1,
            is_ready: false
        };

        if (scanGenreSelect) scanGenreSelect.value = '';
        if (scanFormatSelect) scanFormatSelect.value = '';
        if (scanAreaSelect) scanAreaSelect.value = '';
        if (scanSublocationSelect) {
            scanSublocationSelect.innerHTML = '<option value="">-- Select Sublocation --</option>';
        }

        if (scanInput) scanInput.disabled = true;
        if (scanSubmitBtn) scanSubmitBtn.disabled = true;

        updateScanPreview();
        renderRecentScans();

        showStatus('📍 Please select genre, format, area, and sublocation to start scanning', 'info');
    }

    function onScanSelectionChange() {
        const genre_id = scanGenreSelect ? parseInt(scanGenreSelect.value) : null;
        const format_id = scanFormatSelect ? parseInt(scanFormatSelect.value) : null;
        const area_id = scanAreaSelect ? parseInt(scanAreaSelect.value) : null;
        const sublocation_id = scanSublocationSelect ? parseInt(scanSublocationSelect.value) : null;

        scanSession.genre_id = genre_id;
        scanSession.format_id = format_id;
        scanSession.area_id = area_id;
        scanSession.sublocation_id = sublocation_id;

        if (area_id) {
            populateSublocationDropdown(area_id);
        }

        const allSelected = genre_id && format_id && area_id && sublocation_id;
        scanSession.is_ready = allSelected;

        if (scanInput) scanInput.disabled = !allSelected;
        if (scanSubmitBtn) scanSubmitBtn.disabled = !allSelected;

        if (allSelected) {
            scanSession.location_index = 1;
        }

        updateScanPreview();

        if (allSelected) {
            showStatus('✅ Ready to scan! Location index: ' + scanSession.location_index, 'success');
        } else {
            showStatus('⚠️ Please select all location components', 'warning');
        }
    }

    function updateScanPreview() {
        if (!scanLocationDisplay || !scanIndexDisplay) return;

        if (scanSession.is_ready) {
            const genre = genres.find(g => g.id === scanSession.genre_id);
            const format = formats.find(f => f.id === scanSession.format_id);
            const area = areas.find(a => a.id === scanSession.area_id);
            const sublocation = sublocations.find(s => s.id === scanSession.sublocation_id);

            const locationStr = [
                genre ? genre.name : '?',
                format ? format.name : '?',
                area ? area.name : '?',
                sublocation ? sublocation.name : '?'
            ].join(' | ');

            scanLocationDisplay.textContent = locationStr;
            scanLocationDisplay.style.color = '#28a745';
            scanIndexDisplay.textContent = '📍 Index: ' + scanSession.location_index;
            scanIndexDisplay.style.color = '#28a745';
        } else {
            scanLocationDisplay.textContent = '-- Please select all location components --';
            scanLocationDisplay.style.color = '#dc3545';
            scanIndexDisplay.textContent = '📍 Index: 0';
            scanIndexDisplay.style.color = '#dc3545';
        }
    }

    async function populateSublocationDropdown(areaId) {
        if (!scanSublocationSelect) return;
        
        await loadSublocations(areaId);
        const filtered = sublocations.filter(s => s.area_id === areaId);
        
        scanSublocationSelect.innerHTML = '<option value="">-- Select Sublocation --</option>';
        filtered.forEach(function(s) {
            var opt = document.createElement('option');
            opt.value = s.id;
            var label = s.name;
            if (s.abbreviation) label += ' (' + s.abbreviation + ')';
            opt.textContent = label;
            scanSublocationSelect.appendChild(opt);
        });
    }

    // ========== NEW: Scan Execution ==========

    async function performScanSearch(term) {
        if (!scanSession.is_ready) {
            showStatus('⚠️ Please select genre, format, area, and sublocation first', 'warning');
            return;
        }

        try {
            var data = await apiRequest('GET', '/records/search?q=' + encodeURIComponent(term));
            if (!data.records || !data.records.length) {
                playSound('error');
                showStatus('No record found with that barcode or ID', 'error');
                if (searchInput) searchInput.value = '';
                return;
            }

            var records = data.records;

            if (records.length === 1) {
                var record = records[0];
                await processScannedRecord(record);
                return;
            }

            var record = records[0];
            showStatus('⚠️ Multiple records found, selecting the first: ' + record.artist + ' - ' + record.title, 'warning');
            await processScannedRecord(record);

        } catch (error) {
            playSound('error');
            showStatus('Error scanning: ' + error.message, 'error');
            console.error('Scan search error:', error);
            if (searchInput) searchInput.value = '';
        }
    }

    async function processScannedRecord(record) {
        var existing = filteredRecords.find(function(r) { return r.id === record.id; });
        if (existing) {
            var today = getLocalMSTDate();
            existing.last_seen = today;
            if (!existing.genre_id && scanSession.genre_id) {
                existing.genre_id = scanSession.genre_id;
                existing.format_id = scanSession.format_id;
                existing.area_id = scanSession.area_id;
                existing.sublocation_id = scanSession.sublocation_id;
                existing.location_index = scanSession.location_index;
                try {
                    await apiRequest('PUT', '/records/' + record.id, {
                        genre_id: scanSession.genre_id,
                        format_id: scanSession.format_id,
                        area_id: scanSession.area_id,
                        sublocation_id: scanSession.sublocation_id,
                        location_index: scanSession.location_index,
                        last_seen: today
                    });
                } catch (e) {
                    console.warn('Could not update record location:', e);
                }
            }
            renderPagination();
            renderTablePage();
            playSound('success');
            showStatus('✅ Updated last_seen for #' + record.id + ': ' + record.artist + ' - ' + record.title, 'success');
            if (searchInput) searchInput.value = '';
            addToRecentScans(record);
            scanSession.location_index++;
            updateScanPreview();
            return;
        }

        record.genre_id = scanSession.genre_id;
        record.format_id = scanSession.format_id;
        record.area_id = scanSession.area_id;
        record.sublocation_id = scanSession.sublocation_id;
        record.location_index = scanSession.location_index;
        record.last_seen = getLocalMSTDate();

        try {
            await apiRequest('PUT', '/records/' + record.id, {
                genre_id: scanSession.genre_id,
                format_id: scanSession.format_id,
                area_id: scanSession.area_id,
                sublocation_id: scanSession.sublocation_id,
                location_index: scanSession.location_index,
                last_seen: record.last_seen
            });
        } catch (e) {
            console.warn('Could not update record location:', e);
        }

        filteredRecords.unshift(record);
        totalRecords = filteredRecords.length;
        currentPage = 1;
        renderPagination();
        renderTablePage();
        playSound('success');
        showStatus('✅ Added #' + record.id + ': ' + record.artist + ' - ' + record.title + ' at index ' + scanSession.location_index, 'success');
        updateSelectionCount();
        if (searchInput) searchInput.value = '';
        addToRecentScans(record);
        scanSession.location_index++;
        updateScanPreview();
    }

    // ========== NEW: Recent Scans ==========

    function addToRecentScans(record) {
        const genre = genres.find(g => g.id === scanSession.genre_id);
        const format = formats.find(f => f.id === scanSession.format_id);
        const area = areas.find(a => a.id === scanSession.area_id);
        const sublocation = sublocations.find(s => s.id === scanSession.sublocation_id);

        const scanEntry = {
            record_id: record.id,
            artist: record.artist,
            title: record.title,
            genre: genre ? genre.name : 'Unknown',
            format: format ? format.name : 'Unknown',
            area: area ? area.name : 'Unknown',
            sublocation: sublocation ? sublocation.name : 'Unknown',
            index: record.location_index || scanSession.location_index - 1,
            timestamp: new Date().toLocaleString()
        };

        recentScans = recentScans.filter(s => s.record_id !== record.id);
        recentScans.unshift(scanEntry);
        
        if (recentScans.length > MAX_RECENT_SCANS) {
            recentScans = recentScans.slice(0, MAX_RECENT_SCANS);
        }

        renderRecentScans();
    }

    function renderRecentScans() {
        if (!recentScansList) return;

        if (recentScans.length === 0) {
            recentScansList.innerHTML = '<div class="no-recent-scans">No recent scans</div>';
            if (lastScanDisplay) {
                lastScanDisplay.textContent = 'Last: --';
            }
            return;
        }

        var html = '';
        recentScans.forEach(function(s, i) {
            var isFirst = i === 0;
            var cls = isFirst ? 'recent-scan-item recent-scan-last' : 'recent-scan-item';
            var locationStr = [s.genre, s.format, s.area, s.sublocation].filter(Boolean).join(' | ');
            html += '<div class="' + cls + '">';
            html += '<span class="scan-index-badge">#' + s.index + '</span>';
            html += '<span class="scan-artist">' + escapeHtml(s.artist) + '</span>';
            html += '<span class="scan-title">' + escapeHtml(s.title) + '</span>';
            html += '<span class="scan-location">' + escapeHtml(locationStr) + '</span>';
            html += '<span class="scan-time">' + s.timestamp + '</span>';
            html += '</div>';
        });

        recentScansList.innerHTML = html;

        if (lastScanDisplay && recentScans.length > 0) {
            var last = recentScans[0];
            var locStr = [last.genre, last.format, last.area, last.sublocation].filter(Boolean).join(' | ');
            lastScanDisplay.textContent = 'Last: ' + locStr + ' #' + last.index;
        }
    }

    // ========== NEW: Domain Management ==========

    function populateDomainManagementLists() {
        renderGenresList();
        renderFormatsList();
        renderAreasList();
        renderSublocationsList();
        populateSublocationAreaFilter();
    }

    function renderGenresList() {
        if (!genresList) return;
        if (genres.length === 0) {
            genresList.innerHTML = '<div class="empty-message">No genres defined. Add one below.</div>';
            return;
        }
        var html = '<table class="domain-table"><thead><tr><th>Name</th><th>In Use</th><th>Actions</th></tr></thead><tbody>';
        genres.forEach(function(g) {
            var count = filteredRecords.filter(r => r.genre_id === g.id).length;
            var inUse = count > 0;
            html += '<tr>';
            html += '<td>' + escapeHtml(g.name) + '</td>';
            html += '<td>' + (inUse ? '✅ ' + count + ' records' : '—') + '</td>';
            html += '<td>';
            html += '<button class="btn btn-sm btn-danger" onclick="window.deleteGenre(' + g.id + ')" ' + (inUse ? 'disabled' : '') + '><i class="fas fa-trash"></i></button>';
            html += '</td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        genresList.innerHTML = html;
    }

    function renderFormatsList() {
        if (!formatsList) return;
        if (formats.length === 0) {
            formatsList.innerHTML = '<div class="empty-message">No formats defined. Add one below.</div>';
            return;
        }
        var html = '<table class="domain-table"><thead><tr><th>Name</th><th>In Use</th><th>Actions</th></tr></thead><tbody>';
        formats.forEach(function(f) {
            var count = filteredRecords.filter(r => r.format_id === f.id).length;
            var inUse = count > 0;
            html += '<tr>';
            html += '<td>' + escapeHtml(f.name) + '</td>';
            html += '<td>' + (inUse ? '✅ ' + count + ' records' : '—') + '</td>';
            html += '<td>';
            html += '<button class="btn btn-sm btn-danger" onclick="window.deleteFormat(' + f.id + ')" ' + (inUse ? 'disabled' : '') + '><i class="fas fa-trash"></i></button>';
            html += '</td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        formatsList.innerHTML = html;
    }

    function renderAreasList() {
        if (!areasList) return;
        if (areas.length === 0) {
            areasList.innerHTML = '<div class="empty-message">No areas defined. Add one below.</div>';
            return;
        }
        var html = '<table class="domain-table"><thead><tr><th>Name</th><th>Sublocations</th><th>In Use</th><th>Actions</th></tr></thead><tbody>';
        areas.forEach(function(a) {
            var subCount = sublocations.filter(s => s.area_id === a.id).length;
            var count = filteredRecords.filter(r => r.area_id === a.id).length;
            var inUse = count > 0;
            html += '<tr>';
            html += '<td>' + escapeHtml(a.name) + '</td>';
            html += '<td>' + subCount + '</td>';
            html += '<td>' + (inUse ? '✅ ' + count + ' records' : '—') + '</td>';
            html += '<td>';
            html += '<button class="btn btn-sm btn-danger" onclick="window.deleteArea(' + a.id + ')" ' + (inUse || subCount > 0 ? 'disabled' : '') + '><i class="fas fa-trash"></i></button>';
            html += '</td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        areasList.innerHTML = html;
    }

    function renderSublocationsList() {
        if (!sublocationsList) return;
        var filtered = sublocations;
        var areaFilter = sublocationAreaFilter ? parseInt(sublocationAreaFilter.value) : null;
        if (areaFilter) {
            filtered = sublocations.filter(s => s.area_id === areaFilter);
        }

        if (filtered.length === 0) {
            sublocationsList.innerHTML = '<div class="empty-message">No sublocations for this area. Add one below.</div>';
            return;
        }

        var html = '<table class="domain-table"><thead><tr><th>Area</th><th>Name</th><th>Abbreviation</th><th>In Use</th><th>Actions</th></tr></thead><tbody>';
        filtered.forEach(function(s) {
            var area = areas.find(a => a.id === s.area_id);
            var count = filteredRecords.filter(r => r.sublocation_id === s.id).length;
            var inUse = count > 0;
            html += '<tr>';
            html += '<td>' + (area ? escapeHtml(area.name) : '?') + '</td>';
            html += '<td>' + escapeHtml(s.name) + '</td>';
            html += '<td>' + escapeHtml(s.abbreviation || '—') + '</td>';
            html += '<td>' + (inUse ? '✅ ' + count + ' records' : '—') + '</td>';
            html += '<td>';
            html += '<button class="btn btn-sm btn-danger" onclick="window.deleteSublocation(' + s.id + ')" ' + (inUse ? 'disabled' : '') + '><i class="fas fa-trash"></i></button>';
            html += '</td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        sublocationsList.innerHTML = html;
    }

    function populateSublocationAreaFilter() {
        if (!sublocationAreaFilter) return;
        var currentVal = sublocationAreaFilter.value;
        sublocationAreaFilter.innerHTML = '<option value="">All Areas</option>';
        areas.forEach(function(a) {
            var opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = a.name;
            sublocationAreaFilter.appendChild(opt);
        });
        if (currentVal) sublocationAreaFilter.value = currentVal;
    }

    // ========== NEW: Domain CRUD Functions ==========

    window.addGenre = async function() {
        if (!newGenreInput) return;
        var name = newGenreInput.value.trim();
        if (!name) {
            showStatus('Please enter a genre name', 'warning');
            return;
        }
        try {
            var result = await apiRequest('POST', '/api/genres', { name: name });
            if (result.status === 'success') {
                newGenreInput.value = '';
                await loadGenres();
                populateScanDropdowns();
                populateFilterDropdowns();
                renderGenresList();
                showStatus('✅ Genre "' + name + '" added', 'success');
            } else {
                showStatus('❌ ' + (result.error || 'Failed to add genre'), 'error');
            }
        } catch (e) {
            showStatus('❌ Error: ' + e.message, 'error');
        }
    };

    window.deleteGenre = async function(id) {
        if (!confirm('Delete this genre? It will be removed from all records.')) return;
        try {
            var result = await apiRequest('DELETE', '/api/genres/' + id);
            if (result.status === 'success') {
                await loadGenres();
                populateScanDropdowns();
                populateFilterDropdowns();
                renderGenresList();
                showStatus('✅ Genre deleted', 'success');
            } else {
                showStatus('❌ ' + (result.error || 'Failed to delete genre'), 'error');
            }
        } catch (e) {
            showStatus('❌ Error: ' + e.message, 'error');
        }
    };

    window.addFormat = async function() {
        if (!newFormatInput) return;
        var name = newFormatInput.value.trim();
        if (!name) {
            showStatus('Please enter a format name', 'warning');
            return;
        }
        try {
            var result = await apiRequest('POST', '/api/formats', { name: name });
            if (result.status === 'success') {
                newFormatInput.value = '';
                await loadFormats();
                populateScanDropdowns();
                populateFilterDropdowns();
                renderFormatsList();
                showStatus('✅ Format "' + name + '" added', 'success');
            } else {
                showStatus('❌ ' + (result.error || 'Failed to add format'), 'error');
            }
        } catch (e) {
            showStatus('❌ Error: ' + e.message, 'error');
        }
    };

    window.deleteFormat = async function(id) {
        if (!confirm('Delete this format? It will be removed from all records.')) return;
        try {
            var result = await apiRequest('DELETE', '/api/formats/' + id);
            if (result.status === 'success') {
                await loadFormats();
                populateScanDropdowns();
                populateFilterDropdowns();
                renderFormatsList();
                showStatus('✅ Format deleted', 'success');
            } else {
                showStatus('❌ ' + (result.error || 'Failed to delete format'), 'error');
            }
        } catch (e) {
            showStatus('❌ Error: ' + e.message, 'error');
        }
    };

    window.addArea = async function() {
        if (!newAreaInput) return;
        var name = newAreaInput.value.trim();
        if (!name) {
            showStatus('Please enter an area name', 'warning');
            return;
        }
        try {
            var result = await apiRequest('POST', '/api/areas', { name: name });
            if (result.status === 'success') {
                newAreaInput.value = '';
                await loadAreas();
                populateScanDropdowns();
                populateFilterDropdowns();
                renderAreasList();
                showStatus('✅ Area "' + name + '" added', 'success');
            } else {
                showStatus('❌ ' + (result.error || 'Failed to add area'), 'error');
            }
        } catch (e) {
            showStatus('❌ Error: ' + e.message, 'error');
        }
    };

    window.deleteArea = async function(id) {
        if (!confirm('Delete this area? It will be removed from all records.')) return;
        try {
            var result = await apiRequest('DELETE', '/api/areas/' + id);
            if (result.status === 'success') {
                await loadAreas();
                populateScanDropdowns();
                populateFilterDropdowns();
                renderAreasList();
                showStatus('✅ Area deleted', 'success');
            } else {
                showStatus('❌ ' + (result.error || 'Failed to delete area'), 'error');
            }
        } catch (e) {
            showStatus('❌ Error: ' + e.message, 'error');
        }
    };

    window.addSublocation = async function() {
        if (!newSublocationArea || !newSublocationName) return;
        var area_id = parseInt(newSublocationArea.value);
        var name = newSublocationName.value.trim();
        var abbreviation = newSublocationAbbr ? newSublocationAbbr.value.trim() : '';
        if (!area_id) {
            showStatus('Please select an area', 'warning');
            return;
        }
        if (!name) {
            showStatus('Please enter a sublocation name', 'warning');
            return;
        }
        try {
            var result = await apiRequest('POST', '/api/sublocations', {
                area_id: area_id,
                name: name,
                abbreviation: abbreviation
            });
            if (result.status === 'success') {
                newSublocationName.value = '';
                if (newSublocationAbbr) newSublocationAbbr.value = '';
                await loadSublocations();
                populateScanDropdowns();
                populateFilterDropdowns();
                renderSublocationsList();
                showStatus('✅ Sublocation "' + name + '" added', 'success');
            } else {
                showStatus('❌ ' + (result.error || 'Failed to add sublocation'), 'error');
            }
        } catch (e) {
            showStatus('❌ Error: ' + e.message, 'error');
        }
    };

    window.deleteSublocation = async function(id) {
        if (!confirm('Delete this sublocation? It will be removed from all records.')) return;
        try {
            var result = await apiRequest('DELETE', '/api/sublocations/' + id);
            if (result.status === 'success') {
                await loadSublocations();
                populateScanDropdowns();
                populateFilterDropdowns();
                renderSublocationsList();
                showStatus('✅ Sublocation deleted', 'success');
            } else {
                showStatus('❌ ' + (result.error || 'Failed to delete sublocation'), 'error');
            }
        } catch (e) {
            showStatus('❌ Error: ' + e.message, 'error');
        }
    };

    // ========== NEW: Populate Dropdowns ==========

    function populateScanDropdowns() {
        if (scanGenreSelect) {
            var currentVal = scanGenreSelect.value;
            scanGenreSelect.innerHTML = '<option value="">-- Select Genre --</option>';
            genres.forEach(function(g) {
                var opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.name;
                scanGenreSelect.appendChild(opt);
            });
            if (currentVal) scanGenreSelect.value = currentVal;
        }

        if (scanFormatSelect) {
            var currentVal = scanFormatSelect.value;
            scanFormatSelect.innerHTML = '<option value="">-- Select Format --</option>';
            formats.forEach(function(f) {
                var opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.name;
                scanFormatSelect.appendChild(opt);
            });
            if (currentVal) scanFormatSelect.value = currentVal;
        }

        if (scanAreaSelect) {
            var currentVal = scanAreaSelect.value;
            scanAreaSelect.innerHTML = '<option value="">-- Select Area --</option>';
            areas.forEach(function(a) {
                var opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.name;
                scanAreaSelect.appendChild(opt);
            });
            if (currentVal) scanAreaSelect.value = currentVal;
        }
    }

    function populateFilterDropdowns() {
        if (filterGenre) {
            var currentVal = filterGenre.value;
            filterGenre.innerHTML = '<option value="">All Genres</option>';
            genres.forEach(function(g) {
                var opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.name;
                filterGenre.appendChild(opt);
            });
            if (currentVal) filterGenre.value = currentVal;
        }

        if (filterFormat) {
            var currentVal = filterFormat.value;
            filterFormat.innerHTML = '<option value="">All Formats</option>';
            formats.forEach(function(f) {
                var opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.name;
                filterFormat.appendChild(opt);
            });
            if (currentVal) filterFormat.value = currentVal;
        }

        if (filterArea) {
            var currentVal = filterArea.value;
            filterArea.innerHTML = '<option value="">All Areas</option>';
            areas.forEach(function(a) {
                var opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.name;
                filterArea.appendChild(opt);
            });
            if (currentVal) filterArea.value = currentVal;
        }

        if (filterSublocation) {
            var areaId = filterArea ? parseInt(filterArea.value) : null;
            var currentVal = filterSublocation.value;
            filterSublocation.innerHTML = '<option value="">All Sublocations</option>';
            var filtered = sublocations;
            if (areaId) {
                filtered = sublocations.filter(s => s.area_id === areaId);
            }
            filtered.forEach(function(s) {
                var opt = document.createElement('option');
                opt.value = s.id;
                var label = s.name;
                if (s.abbreviation) label += ' (' + s.abbreviation + ')';
                opt.textContent = label;
                filterSublocation.appendChild(opt);
            });
            if (currentVal) filterSublocation.value = currentVal;
        }
    }

    // ========== NEW: Filter Functions ==========

    async function applyFilters() {
        var params = new URLSearchParams();
        
        if (filterLastSeen && filterLastSeen.value) {
            params.append('last_seen_after', filterLastSeen.value);
        }
        if (filterGenre && filterGenre.value) {
            params.append('genre_id', filterGenre.value);
        }
        if (filterFormat && filterFormat.value) {
            params.append('format_id', filterFormat.value);
        }
        if (filterArea && filterArea.value) {
            params.append('area_id', filterArea.value);
        }
        if (filterSublocation && filterSublocation.value) {
            params.append('sublocation_id', filterSublocation.value);
        }
        
        var url = '/api/records/filter?' + params.toString();
        
        try {
            var response = await fetch(window.AppConfig.baseUrl + url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            var data = await response.json();
            
            if (data.status === 'success') {
                filteredRecords = data.records || [];
                totalRecords = filteredRecords.length;
                currentPage = 1;
                renderPagination();
                renderTablePage();
                showStatus('🔍 Found ' + totalRecords + ' records matching filters', 'info');
            } else {
                showStatus('❌ Error: ' + (data.error || 'Failed to apply filters'), 'error');
            }
        } catch (e) {
            showStatus('❌ Error: ' + e.message, 'error');
        }
    }

    function clearFilters() {
        if (filterLastSeen) filterLastSeen.value = '';
        if (filterGenre) filterGenre.value = '';
        if (filterFormat) filterFormat.value = '';
        if (filterArea) filterArea.value = '';
        if (filterSublocation) filterSublocation.value = '';
        
        loadRecords({ mode: currentSearchMode });
        showStatus('🧹 Filters cleared', 'info');
    }

    // ========== Default Parameters ==========
    function toggleDefaultParams() {
        toggleDefaultParamsSub();
    }

    function loadDefaultParamsFromStorage() {
        try {
            var stored = localStorage.getItem('defaultParams');
            if (stored) {
                var params = JSON.parse(stored);
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
                defaultParams = params;
                defaultParamsActive = true;
                updateDefaultParamsStatus('Defaults loaded from storage', 'info');
            }
        } catch (e) {
            console.warn('Could not load default params from storage:', e);
        }
    }

    function saveDefaultParamsToStorage() {
        try {
            localStorage.setItem('defaultParams', JSON.stringify(defaultParams));
        } catch (e) {
            console.warn('Could not save default params to storage:', e);
        }
    }

    function applyDefaultParams() {
        var sleeveId = defaultSleeveSelect ? parseInt(defaultSleeveSelect.value) : null;
        var discId = defaultDiscSelect ? parseInt(defaultDiscSelect.value) : null;
        var price = defaultPriceInput ? parseFloat(defaultPriceInput.value) : null;
        var consignorId = defaultConsignorSelect ? parseInt(defaultConsignorSelect.value) : null;

        defaultParams = {
            sleeveConditionId: sleeveId || null,
            discConditionId: discId || null,
            price: price || null,
            consignorId: consignorId || null
        };
        defaultParamsActive = true;
        saveDefaultParamsToStorage();

        var rows = document.querySelectorAll('.btn-add-record-from-search');
        if (rows.length === 0) {
            updateDefaultParamsStatus('No search results to apply defaults to', 'warning');
            return;
        }

        rows.forEach(function(btn) {
            var row = btn.closest('tr');
            if (!row) return;
            var sleeveSelect = row.querySelector('.sleeve-condition-select');
            var discSelect = row.querySelector('.disc-condition-select');
            var priceInput = row.querySelector('.price-input');
            var consignorSelect = row.querySelector('.consignor-select');

            if (sleeveSelect && defaultParams.sleeveConditionId) sleeveSelect.value = defaultParams.sleeveConditionId;
            if (discSelect && defaultParams.discConditionId) discSelect.value = defaultParams.discConditionId;
            if (priceInput && defaultParams.price) priceInput.value = defaultParams.price;
            if (consignorSelect && defaultParams.consignorId) consignorSelect.value = defaultParams.consignorId;
        });

        updateDefaultParamsStatus('Defaults applied to ' + rows.length + ' search results', 'success');
        renderTablePage();
    }

    function clearDefaultParams() {
        defaultParams = {
            sleeveConditionId: null,
            discConditionId: null,
            price: null,
            consignorId: null
        };
        defaultParamsActive = false;
        if (defaultSleeveSelect) defaultSleeveSelect.value = '';
        if (defaultDiscSelect) defaultDiscSelect.value = '';
        if (defaultPriceInput) defaultPriceInput.value = '';
        if (defaultConsignorSelect) defaultConsignorSelect.value = '';
        localStorage.removeItem('defaultParams');
        updateDefaultParamsStatus('Defaults cleared', 'info');
        renderTablePage();
    }

    function updateDefaultParamsStatus(message, type) {
        var el = document.getElementById('default-params-status');
        if (!el) return;
        type = type || 'info';
        var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        el.className = 'status-message status-' + type;
        el.style.display = 'block';
        setTimeout(function() { if (el) el.style.display = 'none'; }, 5000);
    }

    function getDefaultParamsForRecord() {
        return {
            sleeveConditionId: defaultParams.sleeveConditionId || null,
            discConditionId: defaultParams.discConditionId || null,
            price: defaultParams.price || null,
            consignorId: defaultParams.consignorId || null
        };
    }

    function populateDefaultParamSelects() {
        if (defaultSleeveSelect) {
            var currentVal = defaultSleeveSelect.value;
            defaultSleeveSelect.innerHTML = '<option value="">Select...</option>';
            conditions.forEach(function(c) {
                var opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.display_name || c.condition_name;
                defaultSleeveSelect.appendChild(opt);
            });
            if (currentVal) defaultSleeveSelect.value = currentVal;
        }
        if (defaultDiscSelect) {
            var currentVal = defaultDiscSelect.value;
            defaultDiscSelect.innerHTML = '<option value="">Select...</option>';
            conditions.forEach(function(c) {
                var opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.display_name || c.condition_name;
                defaultDiscSelect.appendChild(opt);
            });
            if (currentVal) defaultDiscSelect.value = currentVal;
        }
        if (defaultConsignorSelect) {
            var currentVal = defaultConsignorSelect.value;
            defaultConsignorSelect.innerHTML = '<option value="">None</option>';
            consignors.forEach(function(c) {
                var opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.username + (c.full_name ? ' (' + c.full_name + ')' : '');
                defaultConsignorSelect.appendChild(opt);
            });
            if (currentVal) defaultConsignorSelect.value = currentVal;
        }
    }

    // ========== New Visibility Function ==========
    function setActiveMode(mode) {
        Object.values(modeContainers).forEach(container => {
            if (container) container.style.display = 'none';
        });

        const activeContainer = modeContainers[mode];
        if (activeContainer) {
            activeContainer.style.display = 'block';
        } else {
            console.warn('No container found for mode:', mode);
        }

        if (mode === 'scan') {
            resetScanSession();
            loadAllDomainData();
        }

        if (mode === 'add') {
            loadAllDomainData();
        }
    }

    // ========== Toggle Functions for Purchase Table and Metadata ==========

    let purchaseTableExpanded = true;
    let metadataExpanded = true;

    function togglePurchaseTable() {
        const body = document.getElementById('purchase-table-body');
        const icon = document.getElementById('purchase-table-toggle-icon');
        if (!body || !icon) return;

        purchaseTableExpanded = !purchaseTableExpanded;
        if (purchaseTableExpanded) {
            body.classList.add('expanded');
            body.style.display = 'block';
            icon.classList.remove('collapsed');
            icon.style.transform = 'rotate(0deg)';
        } else {
            body.classList.remove('expanded');
            body.style.display = 'none';
            icon.classList.add('collapsed');
            icon.style.transform = 'rotate(-90deg)';
        }
    }

    function toggleMetadataPanel() {
        const body = document.getElementById('metadata-body');
        const icon = document.getElementById('metadata-toggle-icon');
        if (!body || !icon) return;

        metadataExpanded = !metadataExpanded;
        if (metadataExpanded) {
            body.style.display = 'block';
            icon.style.transform = 'rotate(0deg)';
        } else {
            body.style.display = 'none';
            icon.style.transform = 'rotate(-90deg)';
        }
    }

    // ========== Purchase Functions ==========

    function clearPurchaseSelection() {
        selectedPurchaseId = null;
        if (metadataPanel) metadataPanel.style.display = 'none';
        loadPurchasesTable();
        filteredRecords = [];
        totalRecords = 0;
        currentPurchaseRecords = [];
        renderPagination();
        renderTablePage();
        showStatus('Purchase deselected.', 'info');
    }

    // ========== Unified Record Loader ==========
    async function loadRecords(options) {
        options = options || {};
        console.log('🔵 loadRecords called with options:', options);
        try {
            var {
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
                batchId = null
            } = options;

            var url = '/records';
            var params = new URLSearchParams();

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
                if (format) {
                    params.append('format', format);
                }
                if (excludeBatch) {
                    params.append('exclude_batch', 'true');
                }
                if (batchId) {
                    params.append('batch_id', batchId);
                }
            }

            var queryString = params.toString();
            var fullUrl = window.AppConfig.baseUrl + url + (queryString ? '?' + queryString : '');
            console.log('🔵 loadRecords: fetching ' + fullUrl);

            var response = await fetch(fullUrl, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            var data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to load records');

            var records = data.records || [];
            console.log('🔵 loadRecords: API returned ' + records.length + ' records');

            if (location && search && filterBySearch) {
                var term = search.toLowerCase();
                var before = records.length;
                records = records.filter(function(r) {
                    return (r.artist && r.artist.toLowerCase().includes(term)) ||
                           (r.title && r.title.toLowerCase().includes(term)) ||
                           (r.barcode && r.barcode.toLowerCase().includes(term)) ||
                           (r.catalog_number && r.catalog_number.toLowerCase().includes(term));
                });
                console.log('🔵 loadRecords: location search filtered from ' + before + ' to ' + records.length);
            }

            if (!location && search && !filterBySearch) {
                var term = search.toLowerCase();
                var before = records.length;
                records = records.filter(function(r) {
                    return (r.artist && r.artist.toLowerCase().includes(term)) ||
                           (r.title && r.title.toLowerCase().includes(term)) ||
                           (r.barcode && r.barcode.toLowerCase().includes(term)) ||
                           (r.catalog_number && r.catalog_number.toLowerCase().includes(term));
                });
                console.log('🔵 loadRecords: client search filtered from ' + before + ' to ' + records.length);
            }

            if (mode === 'discogs' && lastSeenCutoffDate) {
                var before = records.length;
                records = records.filter(function(r) { return meetsLastSeenFilter(r); });
                console.log('🔵 loadRecords: last-seen filter reduced from ' + before + ' to ' + records.length);
            }

            allRecords = records;
            filteredRecords = records;
            totalRecords = filteredRecords.length;
            currentPage = 1;
            currentMode = mode || 'inventory';

            if (mode === 'add' && !search) {
                currentResults = [];
            }

            console.log('🔵 loadRecords: about to render with ' + filteredRecords.length + ' records');
            renderPagination();
            renderTablePage();

            var statusMsg = 'Showing ' + totalRecords + ' records';
            if (statusIds && statusIds.length === 1) statusMsg += ' with status_id=' + statusIds[0];
            else if (statusIds && statusIds.length > 1) statusMsg += ' with status_ids ' + statusIds.join(', ');
            if (location) statusMsg += ' in location "' + location + '"';
            if (search) statusMsg += ' matching "' + search + '"';
            if (excludeBatch) statusMsg += ' (excluding linked records)';
            if (batchId) statusMsg += ' (purchase ' + batchId + ')';
            showStatus(statusMsg, 'info');
            updateSelectionCount();

            if (mode === 'discogs') {
                if (location) {
                    currentLocationRecords = records;
                }
                console.log('🔵 loadRecords: calling populateDiscogsPrices for ' + records.length + ' records');
                await populateDiscogsPrices(records);
            }

            if (currentSearchMode === 'scan' || currentSearchMode === 'add') {
                renderGenresList();
                renderFormatsList();
                renderAreasList();
                renderSublocationsList();
            }

            return records;
        } catch (error) {
            console.error('❌ loadRecords error:', error);
            showStatus('Error loading records: ' + error.message, 'error');
            return [];
        }
    }

    // ========== PURCHASES TABLE FUNCTIONS ==========

    async function loadPurchasesTable() {
        console.log('📋 loadPurchasesTable: fetching purchases...');
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/drafts', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to load purchases');

            const purchases = data.drafts || [];
            if (!purchasesBody) return;

            const badge = document.getElementById('purchase-table-badge');
            if (badge) {
                badge.textContent = '(' + purchases.length + ' total)';
            }

            if (purchases.length === 0) {
                purchasesBody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999;">No purchases found. Click "New" to create one.</td></tr>';
                return;
            }

            let html = '';
            purchases.forEach(p => {
                const isSelected = (p.draft_id == selectedPurchaseId);
                const shouldHide = (selectedPurchaseId !== null && p.draft_id != selectedPurchaseId);
                const displayStyle = shouldHide ? 'display:none;' : '';
                html += `<tr class="${isSelected ? 'record-selected' : ''}" data-id="${p.draft_id}" onclick="selectPurchase(${p.draft_id})" style="cursor:pointer; ${displayStyle}">`;
                html += `<td>${p.draft_id}</td>`;
                html += `<td>${escapeHtml(p.seller_name)}</td>`;
                html += `<td><span class="status-badge ${p.status === 'complete' ? 'paid' : 'draft'}">${p.status}</span></td>`;
                html += `<td>${p.record_count || 0}</td>`;
                html += `<td>${p.offer_amount ? '$' + p.offer_amount.toFixed(2) : '—'}</td>`;
                html += `<td>${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>`;
                html += `<td>${p.bill_of_sale_path ? '<i class="fas fa-file-pdf" style="color:#28a745;"></i>' : '<i class="fas fa-times" style="color:#999;"></i>'}</td>`;
                html += `<td><button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deletePurchase(${p.draft_id})"><i class="fas fa-trash"></i></button></td>`;
                html += `</tr>`;
            });
            purchasesBody.innerHTML = html;

            if (selectedPurchaseId) {
                const row = purchasesBody.querySelector(`tr[data-id="${selectedPurchaseId}"]`);
                if (row) row.classList.add('record-selected');
            }
        } catch (error) {
            console.error('Error loading purchases:', error);
            showStatus('Error loading purchases: ' + error.message, 'error');
        }
    }

    async function selectPurchase(id) {
        console.log('📋 selectPurchase: ' + id);
        selectedPurchaseId = id;

        await loadPurchasesTable();

        if (metadataPanel) metadataPanel.style.display = 'block';
        if (purchaseIdDisplay) purchaseIdDisplay.textContent = '#' + id;

        metadataExpanded = true;
        const metadataBody = document.getElementById('metadata-body');
        const metadataIcon = document.getElementById('metadata-toggle-icon');
        if (metadataBody) metadataBody.style.display = 'block';
        if (metadataIcon) metadataIcon.style.transform = 'rotate(0deg)';

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/draft/' + id, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success' || !data.draft) throw new Error(data.error || 'Purchase not found');

            const draft = data.draft;
            if (editPurchaseId) editPurchaseId.value = draft.draft_id;
            if (editSellerName) editSellerName.value = draft.seller_name || '';
            if (editSellerContact) editSellerContact.value = draft.seller_contact || '';
            if (editDescription) editDescription.value = draft.description || '';
            if (editStatus) editStatus.value = draft.status || 'draft';

            const billPath = draft.bill_of_sale_path;
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
                if (draft.status === 'draft' && draft.record_count > 0) {
                    acceptDraftBtn.style.display = 'inline-block';
                } else {
                    acceptDraftBtn.style.display = 'none';
                }
            }

            if (deletePurchaseBtn) {
                deletePurchaseBtn.disabled = (draft.status === 'complete');
            }

            await loadRecordsForPurchase(id);

            showStatus('Selected purchase: ' + draft.seller_name + ' (' + (draft.record_count || 0) + ' records)', 'info');

        } catch (error) {
            console.error('Error loading purchase metadata:', error);
            showStatus('Error loading purchase: ' + error.message, 'error');
        }
    }

    async function loadRecordsForPurchase(purchaseId) {
        console.log('📋 loadRecordsForPurchase:', purchaseId);
        try {
            await loadRecords({
                batchId: purchaseId,
                excludeBatch: false,
                mode: 'add',
                bypassDateFilter: true
            });
            currentPurchaseRecords = filteredRecords.slice();
            await loadPurchasesTable();
        } catch (error) {
            console.error('Error loading records for purchase:', error);
            filteredRecords = [];
            totalRecords = 0;
            currentPurchaseRecords = [];
            renderPagination();
            renderTablePage();
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

    async function deletePurchase(id) {
        if (!confirm(`Are you sure you want to delete purchase #${id} and all its linked records? This cannot be undone.`)) return;

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/draft/' + id, {
                method: 'DELETE',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Delete failed');

            showStatus('✅ Purchase deleted.', 'success');
            if (selectedPurchaseId == id) {
                selectedPurchaseId = null;
                if (metadataPanel) metadataPanel.style.display = 'none';
                filteredRecords = [];
                totalRecords = 0;
                currentPurchaseRecords = [];
                renderPagination();
                renderTablePage();
            }
            await loadPurchasesTable();
        } catch (error) {
            showStatus('Error deleting purchase: ' + error.message, 'error');
        }
    }

    function deleteSelectedPurchase() {
        const id = editPurchaseId ? editPurchaseId.value : null;
        if (id) deletePurchase(parseInt(id));
    }

    async function createNewPurchase() {
        const sellerName = prompt('Enter seller name:');
        if (!sellerName) return;
        const contact = prompt('Enter contact (phone/email) [optional]:') || '';
        const description = prompt('Enter description [optional]:') || '';

        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/draft', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seller_name: sellerName, seller_contact: contact, description: description })
            });
            const data = await response.json();
            if (data.status !== 'success') throw new Error(data.error || 'Failed to create purchase');

            showStatus('✅ New purchase created.', 'success');
            await loadPurchasesTable();
            if (data.draft_id) {
                await selectPurchase(data.draft_id);
            }
        } catch (error) {
            showStatus('Error creating purchase: ' + error.message, 'error');
        }
    }

    async function acceptDraft() {
        if (!selectedPurchaseId) {
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
            await processAcceptDraft(selectedPurchaseId, offerAmount);
            return;
        }

        const offerAmount = parseFloat(offerAmountInput.value);
        if (isNaN(offerAmount) || offerAmount <= 0) {
            showToast('Please enter a valid offer amount in the metadata panel.', 'error');
            return;
        }

        await processAcceptDraft(selectedPurchaseId, offerAmount);
    }

    async function processAcceptDraft(purchaseId, offerAmount) {
        if (!purchaseId) {
            showToast('No purchase selected.', 'error');
            return;
        }

        let draft;
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/draft/' + purchaseId, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            if (data.status !== 'success' || !data.draft) throw new Error(data.error || 'Purchase not found');
            draft = data.draft;
        } catch (error) {
            showToast('Error fetching purchase: ' + error.message, 'error');
            return;
        }

        if (draft.status === 'complete') {
            showToast('This purchase is already complete.', 'warning');
            return;
        }

        const recordIds = currentPurchaseRecords.map(function(r) { return r.id; });
        if (recordIds.length === 0) {
            showToast('No records linked to this purchase.', 'error');
            return;
        }

        const signatureMethod = confirm('Square POS signature? Click OK for Square POS, Cancel for Print & Upload.');
        console.log('📋 acceptDraft: signatureMethod = ' + (signatureMethod ? 'square' : 'upload'));

        const requestBody = {
            offer_amount: offerAmount,
            signature_method: signatureMethod ? 'square' : 'upload',
            record_ids: recordIds
        };

        try {
            console.log('📋 acceptDraft: sending PUT to /api/purchases/draft/' + purchaseId);
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/draft/' + purchaseId, {
                method: 'PUT',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const data = await response.json();
            console.log('📋 acceptDraft: response', data);

            if (data.status === 'success') {
                if (currentPurchaseRecords.length > 0) {
                    await generatePDF(currentPurchaseRecords);
                    showToast('📄 Price tags generated for ' + currentPurchaseRecords.length + ' records.', 'success');
                }

                showToast('✅ Draft accepted! Offer: $' + offerAmount.toFixed(2), 'success');
                playSound('success');

                if (signatureMethod) {
                    await sendBillToSquarePOS(draft, offerAmount, currentPurchaseRecords);
                } else {
                    var billText = generateBillOfSale(draft, offerAmount, currentPurchaseRecords);
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

    async function sendBillToSquarePOS(draft, offerAmount, records) {
        try {
            var recordDetails = records.map(function(r) {
                return {
                    id: r.id,
                    artist: r.artist || 'Unknown',
                    title: r.title || 'Unknown',
                    price: r.store_price || 0
                };
            });

            console.log('📋 sendBillToSquarePOS: sending request');
            var response = await fetch(window.AppConfig.baseUrl + '/api/square/bill-of-sale', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    draft_id: draft.draft_id,
                    seller_name: draft.seller_name || '',
                    offer_amount: offerAmount,
                    records: recordDetails,
                    signature_method: 'square'
                })
            });
            var data = await response.json();
            console.log('📋 sendBillToSquarePOS: response', data);

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

    function generateBillOfSale(draft, offerAmount, records) {
        var now = new Date();
        var dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        var bill = 'PIGSTYLE MUSIC\n';
        bill += '====================\n';
        bill += 'BILL OF SALE\n';
        bill += dateStr + ' ' + timeStr + '\n\n';
        bill += 'Purchase #: ' + draft.draft_id + '\n';
        bill += 'Seller: ' + (draft.seller_name || '—') + '\n';
        if (draft.seller_contact) {
            bill += 'Contact: ' + draft.seller_contact + '\n';
        }
        bill += 'Description: ' + (draft.description || '—') + '\n';
        bill += '\n';
        bill += 'ITEMS:\n';
        bill += '--------------------\n';

        var totalValue = 0;
        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var price = record.store_price || 0;
            var itemLine = record.artist + ' - ' + record.title;
            var padding = Math.max(1, 30 - itemLine.length);
            bill += itemLine;
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

    function refreshPurchases() {
        loadPurchasesTable();
        showToast('🔄 Purchases refreshed.', 'info');
    }

    // ========== DISCOGS LOCATIONS ==========
    async function loadDiscogsLocations() {
        console.log('📍 Loading discogs locations...');
        try {
            var data = await apiRequest('GET', '/api/locations');
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
            var option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            discogsLocationSelect.appendChild(option);
        });
    }

    function refreshDiscogsRecords() {
        var selectedValue = discogsLocationSelect ? discogsLocationSelect.value : null;
        var baseOptions = { mode: 'discogs' };

        console.log('🔄 refreshDiscogsRecords: selectedValue = ' + selectedValue);
        if (!selectedValue || selectedValue === 'all') {
            loadRecords({ showAllStatuses: true, mode: 'discogs' });
        } else if (selectedValue === 'all_with_location') {
            loadRecords({ showAllStatuses: true, requireLocation: true, mode: 'discogs' });
        } else {
            currentLocation = selectedValue;
            loadRecords({ showAllStatuses: true, location: selectedValue, mode: 'discogs' });
        }
    }

    // ========== Discogs Prices ==========
    async function populateDiscogsPrices(records) {
        if (currentSearchMode !== 'discogs') {
            console.log('💰 populateDiscogsPrices: skipping - not in discogs mode');
            return;
        }

        console.log('💰 populateDiscogsPrices: received ' + records.length + ' records');
        if (!records || records.length === 0) {
            console.log('💰 populateDiscogsPrices: no records, returning');
            return;
        }

        var eligibleRecords = records.filter(function(r) {
            return r.status_id === 2 && !hasConsignor(r) && meetsLastSeenFilter(r) && r.created_at;
        });
        console.log('💰 populateDiscogsPrices: ' + eligibleRecords.length + ' eligible out of ' + records.length);

        if (eligibleRecords.length === 0) {
            console.log('💰 No eligible records, skipping price calculation');
            return;
        }

        var priceRequests = eligibleRecords.map(function(r) {
            return {
                id: r.id,
                created_at: r.created_at,
                store_price: r.store_price
            };
        });

        var pricesMap = {};
        try {
            var batchResults = await calculateMarkupBatch(priceRequests);
            console.log('💰 populateDiscogsPrices: got ' + batchResults.length + ' price results');
            batchResults.forEach(function(item) {
                if (item.id) {
                    pricesMap[item.id] = item;
                }
            });
        } catch (error) {
            console.error('💰 populateDiscogsPrices: error calculating prices:', error);
            return;
        }

        var updatedCount = 0;
        records.forEach(function(record) {
            if (pricesMap[record.id]) {
                record._discogsPrice = pricesMap[record.id].discogs_price;
                record._markupPercent = pricesMap[record.id].markup_percent;
                updatedCount++;
            } else {
                record._discogsPrice = null;
                record._markupPercent = null;
            }
        });
        console.log('💰 populateDiscogsPrices: updated ' + updatedCount + ' records with price data');

        renderTablePage();
        updateSelectionCount();
    }

    // ========== Price Estimation ==========
    async function estimatePriceForRow(row, catalogNumber) {
        var sleeveSelect = row.querySelector('.sleeve-condition-select');
        var discSelect = row.querySelector('.disc-condition-select');
        var priceInput = row.querySelector('.price-input');

        var sleeveId = parseInt(sleeveSelect.value);
        var discId = parseInt(discSelect.value);
        if (!sleeveId || !discId) return;

        var sleeve = conditions.find(function(c) { return c.id === sleeveId; });
        var disc = conditions.find(function(c) { return c.id === discId; });
        if (!sleeve || !disc) return;

        try {
            var data = await apiRequest('POST', '/api/price-estimate-v3', {
                catalog_number: catalogNumber || '',
                media_condition: disc.display_name || disc.condition_name,
                sleeve_condition: sleeve.display_name || sleeve.condition_name
            });
            if (data.status === 'success' && data.estimated_price) {
                var price = data.estimated_price;
                if (storePriceMultiplier) price = price * storePriceMultiplier;
                var dollars = Math.floor(price);
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
            var result = await apiRequest('POST', '/api/discogs/calculate-markup-batch', { records: records });
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

    // ========== Discogs Orders ==========
    async function loadDiscogsOrdersList(status, dateFrom, dateTo, search) {
        console.log('📦 loadDiscogsOrdersList() called with: status=' + (status || 'all') + ', dateFrom=' + dateFrom + ', dateTo=' + dateTo + ', search=' + search);
        try {
            var url = window.AppConfig.baseUrl + '/api/discogs/orders?per_page=200';
            
            if (status && status !== '') {
                url += '&status=' + encodeURIComponent(status);
            }
            if (dateFrom) {
                url += '&date_from=' + encodeURIComponent(dateFrom);
            }
            if (dateTo) {
                url += '&date_to=' + encodeURIComponent(dateTo);
            }
            if (search && search.trim() !== '') {
                url += '&search=' + encodeURIComponent(search.trim());
            }
            
            url += '&all=true';

            console.log('📦 Fetching orders from: ' + url);

            var response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });

            if (!response.ok) {
                var errorMsg = 'HTTP ' + response.status;
                try {
                    var errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                } catch (e) {}
                throw new Error(errorMsg);
            }

            var data = await response.json();
            if (data.status !== 'success') {
                throw new Error(data.error || 'Failed to load orders');
            }

            ordersList = data.orders || [];
            ordersList.sort(function(a, b) {
                var dateA = new Date(a.created_at);
                var dateB = new Date(b.created_at);
                return dateB - dateA;
            });
            console.log('📦 Loaded ' + ordersList.length + ' orders (newest first)');

            if (discogsOrderSelect) {
                discogsOrderSelect.innerHTML = '<option value="">-- Select an order --</option>';
                for (var i = 0; i < ordersList.length; i++) {
                    var order = ordersList[i];
                    var option = document.createElement('option');
                    option.value = order.order_id || order.id;
                    var buyer = order.buyer_username || order.buyer_name || 'Unknown buyer';
                    var date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '';
                    var total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '';
                    var itemCount = order.items ? order.items.length : 0;
                    option.textContent = order.order_id + ' - ' + buyer + ' ' + date + ' ' + total + ' (' + itemCount + ' items)';
                    discogsOrderSelect.appendChild(option);
                }
            }

            updateDiscogsOrdersStatus('✅ Loaded ' + ordersList.length + ' orders', 'success');

        } catch (error) {
            console.error('❌ Error loading orders:', error);
            updateDiscogsOrdersStatus('❌ Error: ' + error.message, 'error');
        }
    }

    async function applyDiscogsOrdersFilters() {
        var status = document.getElementById('discogs-orders-status-filter')?.value || '';
        var dateFrom = document.getElementById('discogs-orders-date-from')?.value || '';
        var dateTo = document.getElementById('discogs-orders-date-to')?.value || '';
        var search = document.getElementById('discogs-orders-search')?.value || '';
        
        ordersStatusFilter = status;
        
        await loadDiscogsOrdersList(status, dateFrom, dateTo, search);
        
        if (discogsOrderSelect) {
            discogsOrderSelect.value = '';
        }
        selectedOrderId = null;
        currentOrderItems = [];
        filteredRecords = [];
        totalRecords = 0;
        currentPage = 1;
        renderPagination();
        renderTablePage();
        updateSelectionCount();
    }

    function refreshDiscogsOrders() {
        var dateFrom = document.getElementById('discogs-orders-date-from');
        var dateTo = document.getElementById('discogs-orders-date-to');
        var search = document.getElementById('discogs-orders-search');
        
        if (!dateFrom.value) {
            var thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            dateFrom.value = thirtyDaysAgo.toISOString().split('T')[0];
        }
        if (!dateTo.value) {
            dateTo.value = new Date().toISOString().split('T')[0];
        }
        
        if (search) {
            search.value = '';
        }
        
        applyDiscogsOrdersFilters();
    }

    function performDiscogsOrdersSearch(term) {
        if (!term) {
            applyDiscogsOrdersFilters();
            return;
        }
        var termLower = term.toLowerCase().trim();
        var filtered = ordersList.filter(function(order) {
            var buyer = (order.buyer_username || order.buyer_name || '').toLowerCase();
            var email = (order.buyer_email || '').toLowerCase();
            return buyer.includes(termLower) || email.includes(termLower);
        });
        if (discogsOrderSelect) {
            discogsOrderSelect.innerHTML = '<option value="">-- Select an order --</option>';
            for (var i = 0; i < filtered.length; i++) {
                var order = filtered[i];
                var option = document.createElement('option');
                option.value = order.order_id || order.id;
                var buyer = order.buyer_username || order.buyer_name || 'Unknown buyer';
                var date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '';
                var total = order.total_amount ? '$' + order.total_amount.toFixed(2) : '';
                var itemCount = order.items ? order.items.length : 0;
                option.textContent = order.order_id + ' - ' + buyer + ' ' + date + ' ' + total + ' (' + itemCount + ' items)';
                discogsOrderSelect.appendChild(option);
            }
            discogsOrderSelect.value = '';
            selectedOrderId = null;
            currentOrderItems = [];
            filteredRecords = [];
            totalRecords = 0;
            renderPagination();
            renderTablePage();
            updateSelectionCount();
            updateDiscogsOrdersStatus('🔍 Found ' + filtered.length + ' orders matching "' + term + '"', 'info');
        }
    }

    // ========== loadOrderItems ==========
    async function loadOrderItems(orderId) {
        console.log('📦 loadOrderItems() for order ' + orderId);
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
            var url = window.AppConfig.baseUrl + '/api/discogs/orders/' + orderId;
            var response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });

            if (!response.ok) {
                var errorMsg = 'HTTP ' + response.status;
                try {
                    var errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                } catch (e) {}
                throw new Error(errorMsg);
            }

            var data = await response.json();
            if (data.status !== 'success' || !data.order) {
                throw new Error(data.error || 'Failed to load order details');
            }

            var order = data.order;
            var items = order.items || [];

            var enrichedItems = [];
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var pigstyleId = null;
                
                if (item.condition_comments) {
                    var match = item.condition_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                    if (match) pigstyleId = parseInt(match[1], 10);
                }
                if (!pigstyleId && item.private_comments) {
                    var match = item.private_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                    if (match) pigstyleId = parseInt(match[1], 10);
                }
                if (!pigstyleId && item.release_description) {
                    var match = item.release_description.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
                    if (match) pigstyleId = parseInt(match[1], 10);
                }

                var record = null;
                var recordStatus = null;
                var barcode = null;
                var catalog = null;
                if (pigstyleId) {
                    try {
                        var recRes = await fetch(window.AppConfig.baseUrl + '/records/' + pigstyleId, {
                            credentials: 'include',
                            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
                        });
                        if (recRes.ok) {
                            var recData = await recRes.json();
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

            currentOrderItems = enrichedItems;
            filteredRecords = enrichedItems;
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            updateSelectionCount();
            updateDiscogsOrdersStatus('✅ Order ' + orderId + ': ' + enrichedItems.length + ' items loaded', 'success');

        } catch (error) {
            console.error('❌ Error loading order items:', error);
            currentOrderItems = [];
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            updateDiscogsOrdersStatus('❌ Error: ' + error.message, 'error');
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
            var response = await fetch(window.AppConfig.baseUrl + '/api/records/' + recordId + '/mark-discogs-sold', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                }
            });
            
            var data = await response.json();
            
            if (data.status === 'success') {
                var price = data.record ? data.record.store_price : 'unknown';
                showStatus('✅ Record #' + recordId + ' marked as sold on Discogs for $' + price, 'success');
                playSound('success');
                
                if (currentSearchMode === 'discogs_orders' && selectedOrderId) {
                    await loadOrderItems(selectedOrderId);
                } else {
                    renderTablePage();
                    updateSelectionCount();
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

    async function processDiscogsOrder() {
        var items = filteredRecords;
        if (items.length === 0) {
            showStatus('No items to process.', 'warning');
            return;
        }

        var validItems = items.filter(function(item) { return item.pigstyle_id && !isNaN(item.pigstyle_id); });
        if (validItems.length === 0) {
            showStatus('No items have a valid PigStyle ID. Please assign IDs first.', 'warning');
            return;
        }

        var confirmMsg = 'Mark ' + validItems.length + ' item(s) as sold on Discogs?\n\nThis will:\n- Mark each record as sold (status_id=4)\n- Set the sale price from the order\n- Link the Discogs order ID';
        if (!confirm(confirmMsg)) return;

        var posted = 0;
        var failed = 0;
        for (var i = 0; i < validItems.length; i++) {
            var item = validItems[i];
            var recordId = item.pigstyle_id;
            var salePrice = item.price;
            var orderId = selectedOrderId;

            try {
                var response = await fetch(window.AppConfig.baseUrl + '/api/records/mark-sold-on-discogs', {
                    method: 'POST',
                    credentials: 'include',
                    headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        record_id: recordId,
                        sale_price: salePrice,
                        discogs_order_id: orderId
                    })
                });
                var data = await response.json();
                if (data.status === 'success') {
                    posted++;
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

        showStatus('✅ ' + posted + ' marked sold, ' + failed + ' failed.', posted > 0 ? 'success' : 'error');
        if (selectedOrderId) {
            await loadOrderItems(selectedOrderId);
        }
    }

    // ========== REFUND MODE ==========
    async function processRefund() {
        var selected = getSelectedRecords();
        if (selected.length === 0) {
            showStatus('No records selected. Please select a range using "from" and "to" buttons.', 'warning');
            return;
        }

        var soldRecords = selected.filter(function(r) { return r.status_id === 3 || r.status_id === 4; });
        if (soldRecords.length === 0) {
            showStatus('No sold records selected. Only records with status "Sold" or "Sold on Discogs" can be refunded.', 'warning');
            return;
        }

        if (soldRecords.length < selected.length) {
            var nonSold = selected.length - soldRecords.length;
            if (!confirm(nonSold + ' selected record(s) are not sold and will be skipped. Continue with ' + soldRecords.length + ' sold record(s)?')) {
                return;
            }
        }

        var totalAmount = soldRecords.reduce(function(sum, r) { return sum + (r.store_price || 0); }, 0);
        showRefundModal(soldRecords, totalAmount);
    }

    function showRefundModal(records, totalAmount) {
        var existingModal = document.getElementById('refund-modal');
        if (existingModal) {
            existingModal.remove();
        }

        var modal = document.createElement('div');
        modal.id = 'refund-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = '<div class="modal-content" style="max-width: 500px; width: 95%;"><div class="modal-header" style="background: #dc3545; color: white;"><h3 class="modal-title"><i class="fas fa-undo-alt"></i> Process Refund</h3><button class="modal-close" onclick="closeRefundModal()" style="color: white;">&times;</button></div><div class="modal-body"><p><strong>' + records.length + '</strong> record(s) selected for refund.</p><div style="margin-bottom: 15px; max-height: 150px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 13px;">' + records.map(function(r) { return '<div>' + escapeHtml(r.artist) + ' - ' + escapeHtml(r.title) + ' (' + getStatusName(r.status_id) + ') - $' + (r.store_price || 0).toFixed(2) + '</div>'; }).join('') + '</div><div style="margin-bottom: 15px;"><label for="refund-amount" style="display:block; font-weight:500; margin-bottom:4px;">Refund Amount ($)</label><input type="number" id="refund-amount" class="form-control" step="0.01" min="0.01" value="' + totalAmount.toFixed(2) + '" style="width:100%; padding:8px; font-size:16px;"></div><div style="margin-bottom: 15px;"><label for="refund-method" style="display:block; font-weight:500; margin-bottom:4px;">Refund Method</label><select id="refund-method" class="form-control" style="width:100%; padding:8px;"><option value="cash">Cash</option><option value="square">Square</option><option value="discogs">Discogs</option></select></div><div style="margin-bottom: 15px;"><label for="refund-reason" style="display:block; font-weight:500; margin-bottom:4px;">Reason (optional)</label><input type="text" id="refund-reason" class="form-control" placeholder="e.g., Customer returned item" style="width:100%; padding:8px;"></div><div id="refund-status" style="margin-top:10px; display:none;"></div></div><div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;"><button class="btn btn-secondary" onclick="closeRefundModal()">Cancel</button><button class="btn btn-danger" id="refund-confirm-btn"><i class="fas fa-undo-alt"></i> Process Refund</button></div></div>';
        document.body.appendChild(modal);

        setTimeout(function() {
            var amountInput = document.getElementById('refund-amount');
            if (amountInput) amountInput.focus();
        }, 200);

        document.getElementById('refund-confirm-btn').addEventListener('click', function() {
            confirmRefund(records);
        });

        document.getElementById('refund-amount').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('refund-confirm-btn').click();
            }
        });
    }

    function closeRefundModal() {
        var modal = document.getElementById('refund-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.remove();
        }
    }

    async function confirmRefund(records) {
        var amountInput = document.getElementById('refund-amount');
        var methodSelect = document.getElementById('refund-method');
        var reasonInput = document.getElementById('refund-reason');
        var statusDiv = document.getElementById('refund-status');
        var confirmBtn = document.getElementById('refund-confirm-btn');

        var amount = parseFloat(amountInput.value);
        var method = methodSelect.value;
        var reason = reasonInput.value.trim() || 'Customer refund';

        if (isNaN(amount) || amount <= 0) {
            showRefundStatus('Please enter a valid refund amount.', 'error');
            return;
        }

        var recordSummary = records.map(function(r) { return r.artist + ' - ' + r.title; }).join('\n');
        if (!confirm('Process refund for ' + records.length + ' record(s)?\n\n' + recordSummary + '\n\nAmount: $' + amount.toFixed(2) + '\nMethod: ' + method + '\nReason: ' + reason + '\n\n⚠️ Records will be DELETED from the database.')) {
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing...';
        showRefundStatus('⏳ Processing refund...', 'info');

        try {
            var recordIds = records.map(function(r) { return r.id; });
            var result = await apiRequest('POST', '/api/refund/process', {
                record_ids: recordIds,
                amount: amount,
                method: method,
                reason: reason
            });

            if (result.status === 'success') {
                showRefundStatus('✅ ' + result.message, 'success');
                playSound('success');
                var refundedIds = new Set(recordIds);
                filteredRecords = filteredRecords.filter(function(r) { return !refundedIds.has(r.id); });
                allRecords = allRecords.filter(function(r) { return !refundedIds.has(r.id); });
                totalRecords = filteredRecords.length;
                currentPage = 1;
                renderPagination();
                renderTablePage();
                updateSelectionCount();
                cancelRangeSelection();
                setTimeout(closeRefundModal, 1500);
            } else {
                showRefundStatus('❌ Error: ' + (result.error || 'Unknown error'), 'error');
                playSound('error');
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Process Refund';
            }
        } catch (error) {
            showRefundStatus('❌ Error: ' + error.message, 'error');
            playSound('error');
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Process Refund';
        }
    }

    function showRefundStatus(message, type) {
        var el = document.getElementById('refund-status');
        if (!el) return;
        type = type || 'info';
        var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        el.className = 'status-message status-' + type;
        el.style.display = 'block';
    }

    // ========== RENDER TABLE PAGE ==========
    function renderTablePage() {
        console.log('🔄 renderTablePage() – mode: ' + currentSearchMode + ', records: ' + filteredRecords.length);
        var start = (currentPage - 1) * pageSize;
        var end = Math.min(start + pageSize, filteredRecords.length);
        var pageRecords = filteredRecords.slice(start, end);

        var theadHtml = '';
        
        if (currentSearchMode === 'add') {
            var isSearchResult = currentMode === 'search' && currentResults.length > 0;
            if (isSearchResult) {
                var showDefaultInputs = !defaultParamsActive;
                var condOptions = conditions.map(function(c) {
                    return '<option value="' + c.id + '">' + (c.display_name || c.condition_name) + '</option>';
                }).join('');
                var consignorOptions = consignors.map(function(c) {
                    return '<option value="' + c.id + '" ' + (c.id === selectedConsignorId ? 'selected' : '') + '>' + c.username + '</option>';
                }).join('');

                if (showDefaultInputs) {
                    theadHtml = '<tr><th style="width:60px;">Range</th><th style="width:60px;">Image</th><th>Artist</th><th>Title</th><th>Catalog #</th><th>Sleeve</th><th>Disc</th><th>Price</th><th>Consignor</th><th>Notes</th><th>Action</th></tr>';
                } else {
                    theadHtml = '<tr><th style="width:60px;">Range</th><th style="width:60px;">Image</th><th>Artist</th><th>Title</th><th>Catalog #</th><th>Action</th></tr>';
                }
            } else {
                if (selectedPurchaseId && currentPurchaseRecords.length > 0) {
                    theadHtml = '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Catalog #</th><th>Sleeve</th><th>Disc</th><th>Barcode</th><th>Created At</th><th>Action</th></tr>';
                } else {
                    theadHtml = '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Catalog #</th><th>Sleeve</th><th>Disc</th><th>Barcode</th><th>Created At</th></tr>';
                }
            }
        } else if (currentSearchMode === 'scan') {
            theadHtml = '<tr><th style="width:60px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Genre</th><th>Format</th><th>Area</th><th>Sublocation</th><th>Index</th><th>Price</th><th>Barcode</th><th>Last Seen</th></tr>';
        } else if (currentSearchMode === 'discogs') {
            theadHtml = '<tr><th style="width:60px;">Range</th><th>Image</th><th>ID</th><th>Artist</th><th>Title</th><th>Catalog #</th><th>Media Cond</th><th>Sleeve Cond</th><th>Store Price</th><th>Discogs Price</th><th>Markup %</th><th>Location</th><th>Post</th></tr>';
        } else if (currentSearchMode === 'delete') {
            theadHtml = '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Status</th></tr>';
        } else if (currentSearchMode === 'checkout') {
            theadHtml = '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Barcode</th><th>Action</th></tr>';
        } else if (currentSearchMode === 'discogs_orders') {
            theadHtml = '<tr><th>#</th><th>Artist</th><th>Title</th><th>Catalog</th><th>Barcode</th><th>Price</th><th>Condition</th><th>PigStyle ID</th><th>Status</th><th>Action</th></tr>';
        } else if (currentSearchMode === 'refund') {
            theadHtml = '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Sale Price</th><th>Status</th><th>Date Sold</th></tr>';
        }

        recordsTableHead.innerHTML = theadHtml;

        var tbodyHtml = '';

        if (pageRecords.length === 0) {
            var msg = 'No records found';
            if (currentSearchMode === 'add' && currentMode !== 'search') {
                if (selectedPurchaseId) {
                    msg = 'No records linked to this purchase. Search Discogs to add records.';
                } else {
                    msg = 'No purchase selected. Click a row in the purchases table above.';
                }
            }
            if (currentSearchMode === 'scan') {
                if (!scanSession.is_ready) {
                    msg = '⚠️ Please select genre, format, area, and sublocation to start scanning.';
                } else {
                    msg = 'Scan barcodes to add records. Current location index: ' + scanSession.location_index;
                }
            }
            if (currentSearchMode === 'discogs') msg = 'No records found. Check filters or add records in "Add Record" mode.';
            if (currentSearchMode === 'delete') msg = 'No records to delete.';
            if (currentSearchMode === 'refund') msg = 'No sold records found. Search by artist, title, or barcode to find sold records.';
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
            var colCount = currentSearchMode === 'discogs_orders' ? 10 :
                             (currentSearchMode === 'refund' ? 7 :
                             (currentSearchMode === 'add' ? (currentMode === 'search' ? 11 : (selectedPurchaseId ? 11 : 10)) :
                             (currentSearchMode === 'scan' ? 12 :
                             (currentSearchMode === 'discogs' ? 13 :
                             (currentSearchMode === 'delete' ? 6 : 7)))));
            tbodyHtml = '<tr><td colspan="' + colCount + '" style="text-align:center;padding:40px;">' + msg + '</td></tr>';
        } else {
            for (var idx = 0; idx < pageRecords.length; idx++) {
                var record = pageRecords[idx];
                var globalIndex = start + idx;
                var isSelected = (rangeFromIndex !== null && rangeToIndex !== null &&
                                    globalIndex >= Math.min(rangeFromIndex, rangeToIndex) &&
                                    globalIndex <= Math.max(rangeFromIndex, rangeToIndex));

                var rowClass = isSelected ? 'record-selected' : '';
                var rangeButtons = '';
                var showRange = currentSearchMode !== 'discogs_orders';
                
                if (showRange) {
                    if (!isRangeMode) {
                        rangeButtons = '<button class="btn-from" data-index="' + globalIndex + '" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button><span style="color:#999; margin:0 4px;">to</span>';
                    } else {
                        if (rangeFromIndex === globalIndex && rangeToIndex === globalIndex) {
                            rangeButtons = '<span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">FROM ✓</span><span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">TO ✓</span>';
                        } else if (rangeFromIndex === globalIndex) {
                            rangeButtons = '<span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">FROM ✓</span><button class="btn-to" data-index="' + globalIndex + '" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>';
                        } else if (rangeToIndex === globalIndex) {
                            rangeButtons = '<button class="btn-from" data-index="' + globalIndex + '" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button><span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">TO ✓</span>';
                        } else {
                            rangeButtons = '<button class="btn-from" data-index="' + globalIndex + '" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button><button class="btn-to" data-index="' + globalIndex + '" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>';
                        }
                    }
                }

                var rowHtml = '<tr class="' + rowClass + '" data-index="' + globalIndex + '">';

                if (currentSearchMode === 'add' && currentMode === 'search' && currentResults.length > 0) {
                    var artist = record.artist || 'Unknown';
                    var title = record.title || 'Unknown';
                    var catalog = record.catalog_number || '';
                    var condOptions = conditions.map(function(c) {
                        return '<option value="' + c.id + '">' + (c.display_name || c.condition_name) + '</option>';
                    }).join('');
                    var consignorOptions = consignors.map(function(c) {
                        return '<option value="' + c.id + '" ' + (c.id === selectedConsignorId ? 'selected' : '') + '>' + c.username + '</option>';
                    }).join('');

                    var imageUrl = record.image_url || record.thumb || '';
                    var imageHtml = imageUrl ?
                        '<img src="' + escapeHtml(imageUrl) + '" style="width:80px; height:80px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="expandImage(\'' + escapeHtml(imageUrl) + '\', \'' + escapeHtml(artist) + ' - ' + escapeHtml(title) + '\')" title="Click to expand">' :
                        '<div style="width:80px; height:80px; background:#eee; border-radius:4px;"></div>';

                    var showDefaultInputs = !defaultParamsActive;

                    rowHtml += '<td style="text-align:center; white-space:nowrap;">' + rangeButtons + '</td>';
                    rowHtml += '<td style="text-align:center;">' + imageHtml + '</td>';
                    rowHtml += '<td>' + escapeHtml(artist) + '</td>';
                    rowHtml += '<td>' + escapeHtml(title) + '</td>';
                    rowHtml += '<td>' + escapeHtml(catalog) + '</td>';
                    
                    if (showDefaultInputs) {
                        rowHtml += '<td><select class="sleeve-condition-select" style="width:100px; padding:4px;"><option value="">Select...</option>' + condOptions + '</select></td>';
                        rowHtml += '<td><select class="disc-condition-select" style="width:100px; padding:4px;"><option value="">Select...</option>' + condOptions + '</select></td>';
                        rowHtml += '<td><input type="number" class="price-input" step="1" min="' + (minimumPrice !== null ? minimumPrice : 0) + '" value="" style="width:80px; padding:4px;"></td>';
                        rowHtml += '<td><select class="consignor-select" style="width:100px; padding:4px;"><option value="">None</option>' + consignorOptions + '</select></td>';
                        rowHtml += '<td><input type="text" class="notes-input" placeholder="Optional note..." style="width:120px; padding:4px; font-size:12px;"></td>';
                    } else {
                        var def = getDefaultParamsForRecord();
                        var sleeveName = def.sleeveConditionId ? (conditions.find(function(c) { return c.id === def.sleeveConditionId; })?.display_name || '—') : '—';
                        var discName = def.discConditionId ? (conditions.find(function(c) { return c.id === def.discConditionId; })?.display_name || '—') : '—';
                        var priceDisplay = def.price ? '$' + def.price : '—';
                        var consignorDisplay = def.consignorId ? (consignors.find(function(c) { return c.id === def.consignorId; })?.username || 'None') : 'None';
                        
                        rowHtml += '<td style="font-size:12px; color:#666;" title="Using defaults">S: ' + escapeHtml(sleeveName) + '</td>';
                        rowHtml += '<td style="font-size:12px; color:#666;" title="Using defaults">D: ' + escapeHtml(discName) + '</td>';
                        rowHtml += '<td style="font-size:12px; color:#666;" title="Using defaults">' + priceDisplay + '</td>';
                        rowHtml += '<td style="font-size:12px; color:#666;" title="Using defaults">' + escapeHtml(consignorDisplay) + '</td>';
                        rowHtml += '<td><input type="text" class="notes-input" placeholder="Optional note..." style="width:120px; padding:4px; font-size:12px;"></td>';
                    }
                    
                    rowHtml += '<td><button class="btn-add-record-from-search" data-index="' + globalIndex + '" style="background:#28a745; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;"><i class="fas fa-plus"></i> Add</button></td>';
                } else if (currentSearchMode === 'add' && currentMode !== 'search') {
                    var id = record.id;
                    var artist = record.artist || 'Unknown';
                    var title = record.title || 'Unknown';
                    var price = record.store_price ? '$' + record.store_price.toFixed(2) : 'N/A';
                    var catalog = record.catalog_number || '—';
                    var sleeveCondition = record.sleeve_condition_name || '—';
                    var discCondition = record.disc_condition_name || '—';
                    var barcode = record.barcode || record.id;
                    var created = record.created_at ? new Date(record.created_at).toLocaleString() : 'Unknown';
                    
                    rowHtml += '<td style="text-align:center; white-space:nowrap;">' + rangeButtons + '</td>';
                    rowHtml += '<td>' + id + '</td>';
                    rowHtml += '<td>' + escapeHtml(artist) + '</td>';
                    rowHtml += '<td>' + escapeHtml(title) + '</td>';
                    rowHtml += '<td>' + price + '</td>';
                    rowHtml += '<td>' + escapeHtml(catalog) + '</td>';
                    rowHtml += '<td>' + escapeHtml(sleeveCondition) + '</td>';
                    rowHtml += '<td>' + escapeHtml(discCondition) + '</td>';
                    rowHtml += '<td><span class="barcode-value">' + barcode + '</span></td>';
                    rowHtml += '<td>' + created + '</td>';
                    
                    if (selectedPurchaseId) {
                        rowHtml += '<td><button class="btn btn-sm btn-danger" onclick="removeRecordFromPurchase(' + id + ')"><i class="fas fa-times"></i></button></td>';
                    } else {
                        rowHtml += '<td></td>';
                    }
                } else if (currentSearchMode === 'scan') {
                    var id = record.id;
                    var artist = record.artist || 'Unknown';
                    var title = record.title || 'Unknown';
                    var price = record.store_price ? '$' + record.store_price.toFixed(2) : 'N/A';
                    var barcode = record.barcode || record.id;
                    var lastSeen = record.last_seen ? new Date(record.last_seen).toLocaleDateString() : 'Never';
                    
                    var genreName = record.genre_name || '—';
                    var formatName = record.format_name || '—';
                    var areaName = record.area_name || '—';
                    var sublocationName = record.sublocation_name || '—';
                    var locationIndex = record.location_index || '—';
                    
                    rowHtml += '<td style="text-align:center; white-space:nowrap;">' + rangeButtons + '</td>';
                    rowHtml += '<td>' + id + '</td>';
                    rowHtml += '<td>' + escapeHtml(artist) + '</td>';
                    rowHtml += '<td>' + escapeHtml(title) + '</td>';
                    rowHtml += '<td>' + escapeHtml(genreName) + '</td>';
                    rowHtml += '<td>' + escapeHtml(formatName) + '</td>';
                    rowHtml += '<td>' + escapeHtml(areaName) + '</td>';
                    rowHtml += '<td>' + escapeHtml(sublocationName) + '</td>';
                    rowHtml += '<td>' + locationIndex + '</td>';
                    rowHtml += '<td>' + price + '</td>';
                    rowHtml += '<td><span class="barcode-value">' + barcode + '</span></td>';
                    rowHtml += '<td>' + lastSeen + '</td>';
                } else if (currentSearchMode === 'discogs') {
                    var id = record.id;
                    var artist = record.artist || 'Unknown';
                    var title = record.title || 'Unknown';
                    var catalog = record.catalog_number || '—';
                    var mediaCond = record.disc_condition_name || '—';
                    var sleeveCond = record.sleeve_condition_name || '—';
                    var storePrice = record.store_price ? '$' + parseFloat(record.store_price).toFixed(2) : '—';
                    var imageUrl = record.image_url && record.image_url !== '' && record.image_url !== 'None' ? record.image_url : null;
                    var location = record.location || '—';
                    var discogsPrice = record._discogsPrice !== undefined ? record._discogsPrice : null;
                    var markupPercent = record._markupPercent !== undefined ? record._markupPercent : null;
                    var displayDiscogsPrice = discogsPrice ? '$' + discogsPrice.toFixed(2) : '—';
                    var markupClass = (markupPercent > 0) ? 'positive' : ((markupPercent < 0) ? 'negative' : 'zero');
                    var displayMarkup = (markupPercent !== null) ? (markupPercent > 0 ? '+' : '') + markupPercent + '%' : '—';

                    var imgHtml = imageUrl ? 
                        '<img src="' + escapeHtml(imageUrl) + '" style="width:80px; height:80px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="expandImage(\'' + escapeHtml(imageUrl) + '\', \'' + escapeHtml(artist) + ' - ' + escapeHtml(title) + '\')" title="Click to expand">' : 
                        '<div style="width:80px; height:80px; background:#e0e0e0; border-radius:4px;"></div>';

                    rowHtml += '<td style="text-align:center; white-space:nowrap;">' + rangeButtons + '</td>';
                    rowHtml += '<td style="text-align:center;">' + imgHtml + '</td>';
                    rowHtml += '<td>' + id + '</td>';
                    rowHtml += '<td><strong>' + escapeHtml(artist) + '</strong></td>';
                    rowHtml += '<td>' + escapeHtml(title) + '</td>';
                    rowHtml += '<td>' + escapeHtml(catalog) + '</td>';
                    rowHtml += '<td>' + escapeHtml(mediaCond) + '</td>';
                    rowHtml += '<td>' + escapeHtml(sleeveCond) + '</td>';
                    rowHtml += '<td>' + storePrice + '</td>';
                    rowHtml += '<td class="discogs-price-cell" style="' + (discogsPrice ? 'color: #28a745; font-weight: bold;' : 'color: #999;') + '">' + displayDiscogsPrice + '</td>';
                    rowHtml += '<td class="markup-cell ' + markupClass + '">' + displayMarkup + '</td>';
                    rowHtml += '<td title="' + escapeHtml(location) + '" style="font-size: 12px;">' + escapeHtml(location.length > 30 ? location.substring(0,27)+'...' : location) + '</td>';
                    rowHtml += '<td style="text-align: center;">' + (discogsPrice ? '<button class="post-single-btn" data-record-id="' + record.id + '" data-artist="' + escapeHtml(artist) + '" data-title="' + escapeHtml(title) + '" data-price="' + record.store_price + '" data-discogs-price="' + discogsPrice + '" data-markup-percent="' + markupPercent + '" data-media-condition="' + mediaCond + '" data-sleeve-condition="' + sleeveCond + '" data-catalog="' + escapeHtml(catalog) + '" data-location="' + escapeHtml(location) + '" data-notes="' + escapeHtml(record.notes || '') + '"><i class="fab fa-discogs"></i> Post</button>' : '<span style="color: #999;">—</span>') + '</td>';
                } else if (currentSearchMode === 'delete') {
                    var id = record.id;
                    var artist = record.artist || 'Unknown';
                    var title = record.title || 'Unknown';
                    var price = record.store_price ? '$' + record.store_price.toFixed(2) : 'N/A';
                    var statusName = getStatusName(record.status_id);
                    var statusClass = getStatusClass(record.status_id);
                    rowHtml += '<td style="text-align:center; white-space:nowrap;">' + rangeButtons + '</td>';
                    rowHtml += '<td>' + id + '</td>';
                    rowHtml += '<td>' + escapeHtml(artist) + '</td>';
                    rowHtml += '<td>' + escapeHtml(title) + '</td>';
                    rowHtml += '<td>' + price + '</td>';
                    rowHtml += '<td><span class="status-badge ' + statusClass + '">' + statusName + '</span></td>';
                } else if (currentSearchMode === 'checkout') {
                    var id = record.id;
                    var artist = record.artist || 'Unknown';
                    var title = record.title || 'Unknown';
                    var price = record.store_price ? '$' + record.store_price.toFixed(2) : 'N/A';
                    var barcode = record.barcode || record.id;
                    var inSelected = checkoutSelectedItems.some(function(r) { return r.id === record.id; });
                    
                    var actionHtml;
                    if (checkoutViewMode === 'list') {
                        actionHtml = '<button class="btn btn-sm btn-danger remove-checkout-item" data-record-id="' + record.id + '"><i class="fas fa-minus"></i> Remove</button>';
                    } else {
                        if (inSelected) {
                            actionHtml = '<button class="btn btn-sm btn-danger remove-checkout-item" data-record-id="' + record.id + '"><i class="fas fa-minus"></i> Remove</button>';
                        } else {
                            actionHtml = '<button class="btn btn-sm btn-success add-checkout-item" data-record-id="' + record.id + '"><i class="fas fa-plus"></i> Add</button>';
                        }
                    }
                    
                    var isCustom = record.isCustom === true;
                    var customBadge = isCustom ? '<span class="status-badge" style="background:#17a2b8; color:white; margin-left:5px;">Custom</span>' : '';
                    
                    rowHtml += '<td style="text-align:center; white-space:nowrap;">' + rangeButtons + '</td>';
                    rowHtml += '<td>' + id + customBadge + '</td>';
                    rowHtml += '<td>' + escapeHtml(artist) + '</td>';
                    rowHtml += '<td>' + escapeHtml(title) + '</td>';
                    rowHtml += '<td>' + price + '</td>';
                    rowHtml += '<td><span class="barcode-value">' + barcode + '</span></td>';
                    rowHtml += '<td>' + actionHtml + '</td>';
                } else if (currentSearchMode === 'discogs_orders') {
                    var orderItem = record;
                    var idxNum = globalIndex + 1;
                    var artist = orderItem.artist || 'Unknown';
                    var title = orderItem.title || 'Unknown';
                    var catalog = orderItem.catalog_number || '—';
                    var barcode = orderItem.barcode || '—';
                    var price = orderItem.price || 0;
                    var condition = orderItem.media_condition || '—';
                    var pigstyleId = orderItem.pigstyle_id || '';
                    var recordStatus = orderItem.record_status_id;
                    var statusText = '—';
                    var statusClass = '';
                    if (recordStatus === 2) { statusText = 'Active'; statusClass = 'active'; }
                    else if (recordStatus === 3 || recordStatus === 4) { statusText = 'Sold'; statusClass = 'sold'; }
                    else if (recordStatus === 1) { statusText = 'New'; statusClass = 'new'; }
                    else { statusText = 'Not found'; statusClass = ''; }

                    var actionButton = '';
                    if (pigstyleId && recordStatus !== 3 && recordStatus !== 4) {
                        actionButton = '<button class="btn btn-sm btn-success mark-discogs-sold-btn" data-record-id="' + pigstyleId + '" style="padding:2px 6px; font-size:11px; margin-top:4px;"><i class="fab fa-discogs"></i> Mark Sold</button>';
                    }

                    rowHtml += '<td>' + idxNum + '</td>';
                    rowHtml += '<td>' + escapeHtml(artist) + '</td>';
                    rowHtml += '<td>' + escapeHtml(title) + '</td>';
                    rowHtml += '<td>' + escapeHtml(catalog) + '</td>';
                    rowHtml += '<td>' + escapeHtml(barcode) + '</td>';
                    rowHtml += '<td>$' + price.toFixed(2) + '</td>';
                    rowHtml += '<td>' + escapeHtml(condition) + '</td>';
                    rowHtml += '<td><input type="text" class="pigstyle-id-input" value="' + escapeHtml(pigstyleId) + '" placeholder="ID or barcode" style="width:100px; padding:4px; border:1px solid #ddd; border-radius:4px;"><button class="btn btn-sm btn-secondary scan-pigstyle-btn" style="padding:2px 6px; font-size:12px;"><i class="fas fa-qrcode"></i></button></td>';
                    rowHtml += '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>';
                    rowHtml += '<td>' + actionButton + '</td>';
                } else if (currentSearchMode === 'refund') {
                    var id = record.id;
                    var artist = record.artist || 'Unknown';
                    var title = record.title || 'Unknown';
                    var price = record.store_price ? '$' + record.store_price.toFixed(2) : 'N/A';
                    var statusName = getStatusName(record.status_id);
                    var statusClass = getStatusClass(record.status_id);
                    var dateSold = record.date_sold ? new Date(record.date_sold).toLocaleDateString() : 'Unknown';
                    
                    rowHtml += '<td style="text-align:center; white-space:nowrap;">' + rangeButtons + '</td>';
                    rowHtml += '<td>' + id + '</td>';
                    rowHtml += '<td>' + escapeHtml(artist) + '</td>';
                    rowHtml += '<td>' + escapeHtml(title) + '</td>';
                    rowHtml += '<td>' + price + '</td>';
                    rowHtml += '<td><span class="status-badge ' + statusClass + '">' + statusName + '</span></td>';
                    rowHtml += '<td>' + dateSold + '</td>';
                }

                rowHtml += '</tr>';
                tbodyHtml += rowHtml;
            }
        }
        recordsTableBody.innerHTML = tbodyHtml;

        document.querySelectorAll('.btn-from').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var index = parseInt(this.dataset.index);
                startRangeFrom(index);
            });
        });
        document.querySelectorAll('.btn-to').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var index = parseInt(this.dataset.index);
                endRangeTo(index);
            });
        });

        if (currentSearchMode === 'add' && currentMode === 'search' && currentResults.length > 0) {
            document.querySelectorAll('.btn-add-record-from-search').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var index = parseInt(this.dataset.index);
                    var row = this.closest('tr');
                    var record = currentResults[index];
                    if (record) addRecordFromDiscogs(row, record);
                });
            });

            if (!defaultParamsActive) {
                document.querySelectorAll('.sleeve-condition-select').forEach(function(sel) {
                    sel.addEventListener('change', function() {
                        var row = this.closest('tr');
                        var discSelect = row.querySelector('.disc-condition-select');
                        if (this.value) discSelect.value = this.value;
                        var catalog = row.querySelector('td:nth-child(4)')?.textContent?.trim() || '';
                        estimatePriceForRow(row, catalog);
                    });
                });
                document.querySelectorAll('.disc-condition-select').forEach(function(sel) {
                    sel.addEventListener('change', function() {
                        var row = this.closest('tr');
                        var catalog = row.querySelector('td:nth-child(4)')?.textContent?.trim() || '';
                        estimatePriceForRow(row, catalog);
                    });
                });
            }
        }

        if (currentSearchMode === 'discogs') {
            document.querySelectorAll('.post-single-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    var recordId = parseInt(this.dataset.recordId);
                    var artist = this.dataset.artist;
                    var title = this.dataset.title;
                    var price = parseFloat(this.dataset.price);
                    var discogsPrice = parseFloat(this.dataset.discogsPrice);
                    var markupPercent = parseFloat(this.dataset.markupPercent);
                    var mediaCondition = this.dataset.mediaCondition;
                    var sleeveCondition = this.dataset.sleeveCondition;
                    var catalog = this.dataset.catalog;
                    var location = this.dataset.location;
                    var notes = this.dataset.notes;
                    postSingleRecordToDiscogs(recordId, artist, title, price, discogsPrice, markupPercent, mediaCondition, sleeveCondition, catalog, location, notes);
                });
            });
        }

        if (currentSearchMode === 'checkout') {
            document.querySelectorAll('.add-checkout-item').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var recordId = parseInt(this.dataset.recordId);
                    addToCheckout(recordId);
                });
            });
            document.querySelectorAll('.remove-checkout-item').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var recordId = parseInt(this.dataset.recordId);
                    removeFromCheckout(recordId);
                });
            });
        }

        if (currentSearchMode === 'discogs_orders') {
            document.querySelectorAll('.pigstyle-id-input').forEach(function(input) {
                input.addEventListener('change', function() {
                    var row = this.closest('tr');
                    var index = parseInt(row.dataset.index);
                    var item = filteredRecords[index];
                    if (item) {
                        var val = this.value.trim();
                        var newId = parseInt(val);
                        if (!isNaN(newId)) {
                            item.pigstyle_id = newId;
                            fetchRecordForOrderItem(item, row);
                        } else {
                            item.pigstyle_id = null;
                        }
                    }
                });
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        var val = this.value.trim();
                        if (val.length > 0) {
                            lookupBarcodeForOrderItem(this, val);
                        }
                    }
                });
            });

            document.querySelectorAll('.scan-pigstyle-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var input = this.closest('td').querySelector('.pigstyle-id-input');
                    if (input) {
                        var barcode = prompt('Enter or scan barcode:');
                        if (barcode && barcode.trim().length > 0) {
                            input.value = barcode.trim();
                            var event = new Event('change');
                            input.dispatchEvent(event);
                            lookupBarcodeForOrderItem(input, barcode.trim());
                        }
                    }
                });
            });

            document.querySelectorAll('.mark-discogs-sold-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var recordId = parseInt(this.dataset.recordId);
                    markRecordSoldOnDiscogs(recordId);
                });
            });
        }

        updateSelectionCount();
    }

    // ========== Remove Record from Purchase ==========
    async function removeRecordFromPurchase(recordId) {
        if (!selectedPurchaseId) {
            showStatus('No purchase selected.', 'error');
            return;
        }
        if (!confirm('Remove this record from the purchase? The record will still exist but will no longer be linked to purchase #' + selectedPurchaseId + '.')) {
            return;
        }
        try {
            await apiRequest('PUT', '/records/' + recordId, { batch_id: null });
            showStatus('✅ Record removed from purchase.', 'success');
            await loadRecordsForPurchase(selectedPurchaseId);
            await loadPurchasesTable();
        } catch (error) {
            showStatus('Error removing record: ' + error.message, 'error');
        }
    }

    // ========== Helper: lookup barcode for order item ==========
    async function lookupBarcodeForOrderItem(input, barcode) {
        try {
            var data = await apiRequest('GET', '/records/search?q=' + encodeURIComponent(barcode));
            if (data.status === 'success' && data.records && data.records.length === 1) {
                var record = data.records[0];
                input.value = record.id;
                var event = new Event('change');
                input.dispatchEvent(event);
                var row = input.closest('tr');
                var index = parseInt(row.dataset.index);
                var item = filteredRecords[index];
                if (item) {
                    item.pigstyle_id = record.id;
                    item.barcode = record.barcode;
                    item.catalog_number = record.catalog_number;
                    item.record_status_id = record.status_id;
                    renderTablePage();
                }
                playSound('success');
                showStatus('✅ Record #' + record.id + ' assigned to this order item.', 'success');
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

    // ========== Helper: fetch record details for order item ==========
    async function fetchRecordForOrderItem(item, row) {
        if (!item.pigstyle_id) return;
        try {
            var response = await fetch(window.AppConfig.baseUrl + '/records/' + item.pigstyle_id, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (response.ok) {
                var record = await response.json();
                item.barcode = record.barcode || null;
                item.catalog_number = record.catalog_number || null;
                item.record_status_id = record.status_id;
                var cells = row.querySelectorAll('td');
                if (cells.length >= 5) {
                    cells[4].textContent = item.barcode || '—';
                    cells[3].textContent = item.catalog_number || '—';
                    var statusCell = cells[8];
                    var statusText = '—';
                    var statusClass = '';
                    if (item.record_status_id === 2) { statusText = 'Active'; statusClass = 'active'; }
                    else if (item.record_status_id === 3 || item.record_status_id === 4) { statusText = 'Sold'; statusClass = 'sold'; }
                    else if (item.record_status_id === 1) { statusText = 'New'; statusClass = 'new'; }
                    else { statusText = 'Not found'; statusClass = ''; }
                    statusCell.innerHTML = '<span class="status-badge ' + statusClass + '">' + statusText + '</span>';
                }
            }
        } catch (error) {
            console.warn('Could not fetch record details:', error);
        }
    }

    // ========== Custom Item Modal ==========
    var customItemModal = null;

    function showCustomItemModal() {
        if (customItemModal) {
            customItemModal.remove();
            customItemModal = null;
        }

        customItemModal = document.createElement('div');
        customItemModal.id = 'custom-item-modal';
        customItemModal.className = 'modal-overlay';
        customItemModal.style.display = 'flex';
        customItemModal.innerHTML = '<div class="modal-content" style="max-width: 400px; width: 95%;"><div class="modal-header" style="background: #17a2b8; color: white;"><h3 class="modal-title"><i class="fas fa-plus-circle"></i> Add Custom Item</h3><button class="modal-close" onclick="closeCustomItemModal()" style="color: white; font-size: 28px; background: none; border: none; cursor: pointer;">&times;</button></div><div class="modal-body"><div style="margin-bottom: 15px;"><label for="custom-item-desc" style="display:block; font-weight:500; margin-bottom:4px;">Description *</label><input type="text" id="custom-item-desc" class="form-control" placeholder="e.g., Merchandise, Gift Card, etc." style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;"></div><div style="margin-bottom: 15px;"><label for="custom-item-price" style="display:block; font-weight:500; margin-bottom:4px;">Price ($) *</label><input type="number" id="custom-item-price" class="form-control" step="0.01" min="0.01" placeholder="0.00" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;"></div><div id="custom-item-status" style="margin-top:10px; display:none;"></div></div><div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;"><button class="btn btn-secondary" onclick="closeCustomItemModal()" style="padding:8px 16px; border:none; border-radius:4px; cursor:pointer; background:#6c757d; color:white;">Cancel</button><button class="btn btn-success" id="custom-item-add-btn" style="padding:8px 16px; border:none; border-radius:4px; cursor:pointer; background:#28a745; color:white;"><i class="fas fa-check"></i> Add to Checkout</button></div></div>';
        document.body.appendChild(customItemModal);

        setTimeout(function() {
            var descInput = document.getElementById('custom-item-desc');
            if (descInput) descInput.focus();
        }, 100);

        document.getElementById('custom-item-add-btn').addEventListener('click', function() {
            addCustomItemFromModal();
        });

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

        customItemModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeCustomItemModal();
            }
        });
    }

    function closeCustomItemModal() {
        if (customItemModal) {
            customItemModal.remove();
            customItemModal = null;
        }
    }

    function addCustomItemFromModal() {
        var descInput = document.getElementById('custom-item-desc');
        var priceInput = document.getElementById('custom-item-price');
        var statusDiv = document.getElementById('custom-item-status');

        function showStatusMsg(msg, type) {
            if (statusDiv) {
                statusDiv.textContent = msg;
                statusDiv.className = 'status-message status-' + type;
                statusDiv.style.display = 'block';
            } else {
                showStatus(msg, type);
            }
        }

        var desc = descInput.value.trim();
        var price = parseFloat(priceInput.value);

        if (!desc) {
            showStatusMsg('Please enter a description.', 'warning');
            return;
        }
        if (isNaN(price) || price <= 0) {
            showStatusMsg('Please enter a valid price greater than 0.', 'warning');
            return;
        }

        var customItem = {
            id: -Date.now(),
            artist: 'Custom',
            title: desc,
            store_price: price,
            barcode: 'CUSTOM',
            isCustom: true
        };

        checkoutSelectedItems.push(customItem);
        showStatusMsg('Added custom item: "' + desc + '" for $' + price.toFixed(2), 'success');
        closeCustomItemModal();

        checkoutViewMode = 'list';
        filteredRecords = checkoutSelectedItems.slice();
        totalRecords = filteredRecords.length;
        currentPage = 1;
        renderPagination();
        renderTablePage();
        updateSelectionCount();
        if (checkoutShowSelectedBtn) {
            checkoutShowSelectedBtn.textContent = 'Checkout List (' + checkoutSelectedItems.length + ')';
        }
    }

    // ========== Bernie Item ==========
    function addBernieItem() {
        var bernieItem = {
            id: -Date.now() - 1,
            artist: 'Bernie',
            title: 'Bern It',
            store_price: 0.99,
            barcode: null,
            isCustom: true,
            isBernie: true
        };

        checkoutSelectedItems.push(bernieItem);
        showStatus('Added Bernie donation: "Bern It" for $0.99', 'success');
        playSound('success');

        checkoutViewMode = 'list';
        filteredRecords = checkoutSelectedItems.slice();
        totalRecords = filteredRecords.length;
        currentPage = 1;
        renderPagination();
        renderTablePage();
        updateSelectionCount();
        if (checkoutShowSelectedBtn) {
            checkoutShowSelectedBtn.textContent = 'Checkout List (' + checkoutSelectedItems.length + ')';
        }
    }

    // ========== Range Selection ==========
    function startRangeFrom(index) {
        console.log('🔵 startRangeFrom: index=' + index);
        rangeFromIndex = index;
        rangeToIndex = index;
        isRangeMode = true;
        renderTablePage();
        var selected = getSelectedRecords();
        showStatus('Selected ' + selected.length + ' record(s)', 'info');
        updateSelectionCount();
    }

    function endRangeTo(index) {
        console.log('🔵 endRangeTo: index=' + index);
        if (rangeFromIndex === null) {
            showStatus('Select "from" first', 'warning');
            return;
        }
        rangeToIndex = index;
        renderTablePage();
        var selected = getSelectedRecords();
        showStatus('Selected ' + selected.length + ' record(s)', 'success');
        updateSelectionCount();
    }

    function cancelRangeSelection() {
        console.log('🔵 cancelRangeSelection');
        rangeFromIndex = null;
        rangeToIndex = null;
        isRangeMode = false;
        renderTablePage();
        updateSelectionCount();
        showStatus('Selection cleared', 'info');
    }

    // ========== Add Record from Discogs ==========
    async function addRecordFromDiscogs(row, discogsRecord) {
        if (!selectedPurchaseId) {
            showStatus('⚠️ Please select a purchase from the table before adding records.', 'error');
            playSound('error');
            return;
        }

        var priceInput = row.querySelector('.price-input');
        var consignorSelect = row.querySelector('.consignor-select');
        var sleeveSelect = row.querySelector('.sleeve-condition-select');
        var discSelect = row.querySelector('.disc-condition-select');
        var notesInput = row.querySelector('.notes-input');

        var price = null;
        var consignorId = null;
        var sleeveId = null;
        var discId = null;
        var notes = notesInput ? notesInput.value.trim() : '';

        if (defaultParamsActive) {
            sleeveId = defaultParams.sleeveConditionId;
            discId = defaultParams.discConditionId;
            price = defaultParams.price;
            consignorId = defaultParams.consignorId;
        }

        if (priceInput && priceInput.value) {
            var val = parseFloat(priceInput.value);
            if (!isNaN(val) && val > 0) price = val;
        }
        if (consignorSelect && consignorSelect.value) {
            var val = parseInt(consignorSelect.value);
            if (!isNaN(val)) consignorId = val;
        }
        if (sleeveSelect && sleeveSelect.value) {
            var val = parseInt(sleeveSelect.value);
            if (!isNaN(val)) sleeveId = val;
        }
        if (discSelect && discSelect.value) {
            var val = parseInt(discSelect.value);
            if (!isNaN(val)) discId = val;
        }

        if (!sleeveId || !discId) {
            showStatus('Please select sleeve and disc conditions (or set defaults)', 'warning');
            return;
        }
        if (!price || price <= 0) {
            showStatus('Please enter a valid price (or set a default)', 'warning');
            return;
        }

        var recordData = {
            artist: discogsRecord.artist,
            title: discogsRecord.title,
            discogs_genre_raw: discogsRecord.genre_raw || '',
            image_url: discogsRecord.image_url || '',
            catalog_number: discogsRecord.catalog_number || '',
            condition_sleeve_id: sleeveId,
            condition_disc_id: discId,
            store_price: price,
            consignor_id: consignorId,
            status_id: 1,
            notes: notes,
            batch_id: selectedPurchaseId
        };

        var result = await apiRequest('POST', '/records', recordData);
        showStatus('✅ Record #' + result.record.id + ' added successfully to purchase #' + selectedPurchaseId + '!', 'success');
        
        await loadRecordsForPurchase(selectedPurchaseId);
        await loadPurchasesTable();
        
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
        
        clearSearch();
        await loadStats();
    }

    // ========== CONSOLIDATED SEARCH ==========
    function performSearch(term) {
        if (!term) { clearSearch(); return; }
        var mode = currentSearchMode;

        if (mode === 'add') {
            if (!selectedPurchaseId) {
                showStatus('⚠️ Please select a purchase from the table before searching.', 'error');
                playSound('error');
                return;
            }
            performDiscogsSearch(term);
            return;
        } else if (mode === 'scan') {
            performScanSearch(term);
            return;
        } else if (mode === 'refund') {
            performRefundSearch(term);
            return;
        } else if (mode === 'discogs') {
            performDiscogsFilterSearch(term);
            return;
        } else if (mode === 'delete') {
            performDeleteSearch(term);
            return;
        } else if (mode === 'checkout') {
            performLocalSearch(term);
            return;
        } else if (mode === 'discogs_orders') {
            performDiscogsOrdersSearch(term);
            return;
        }

        showStatus('No search available for this mode', 'info');
    }

    // ========== Unified Local Search (Delete & Checkout) ==========
    function performLocalSearch(term) {
        var termLower = term.trim().toLowerCase();
        var isNumeric = /^\d+$/.test(termLower);

        var source = [];
        if (currentSearchMode === 'checkout') {
            source = allRecords;
        } else if (currentSearchMode === 'delete') {
            source = allRecords;
        }

        if (!source || source.length === 0) {
            showStatus('No records loaded. Please wait or refresh.', 'warning');
            return;
        }

        var filtered;
        if (isNumeric) {
            var numericTerm = termLower;
            filtered = source.filter(function(r) {
                var idMatch = r.id && r.id.toString() === numericTerm;
                var barcodeMatch = r.barcode && r.barcode.trim().toLowerCase() === numericTerm;
                return idMatch || barcodeMatch;
            });
            if (filtered.length === 0) {
                filtered = source.filter(function(r) {
                    var artistMatch = r.artist && r.artist.toLowerCase().includes(numericTerm);
                    var titleMatch = r.title && r.title.toLowerCase().includes(numericTerm);
                    var catalogMatch = r.catalog_number && r.catalog_number.toLowerCase().includes(numericTerm);
                    return artistMatch || titleMatch || catalogMatch;
                });
            }
        } else {
            filtered = source.filter(function(r) {
                var artistMatch = r.artist && r.artist.toLowerCase().includes(termLower);
                var titleMatch = r.title && r.title.toLowerCase().includes(termLower);
                var catalogMatch = r.catalog_number && r.catalog_number.toLowerCase().includes(termLower);
                var barcodeMatch = r.barcode && r.barcode.trim().toLowerCase().includes(termLower);
                var idMatch = r.id && r.id.toString().includes(termLower);
                return artistMatch || titleMatch || catalogMatch || barcodeMatch || idMatch;
            });
        }

        if (currentSearchMode === 'checkout') {
            checkoutViewMode = 'search';
            filteredRecords = filtered;
            totalRecords = filtered.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Found ' + totalRecords + ' records matching "' + term + '"', 'info');
        } else if (currentSearchMode === 'delete') {
            filteredRecords = filtered;
            totalRecords = filtered.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Found ' + totalRecords + ' records matching "' + term + '"', 'info');
        }

        updateSelectionCount();
    }

    // ========== Discogs search ==========
    async function performDiscogsSearch(term) {
        currentMode = 'search';
        recordsTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Searching Discogs...</td></tr>';
        try {
            var formatFilterEl = document.getElementById('discogs-format-filter');
            var format = formatFilterEl ? formatFilterEl.value : 'all';
            
            var data = await apiRequest('GET', '/api/discogs/search?q=' + encodeURIComponent(term) + (format && format !== 'all' ? '&format=' + encodeURIComponent(format) : ''));
            if (!data.results || !data.results.length) {
                recordsTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;">No Discogs results found</td></tr>';
                return;
            }
            currentResults = data.results.map(function(r) {
                var artist = r.artist || 'Unknown';
                var title = r.title || 'Unknown';
                if (artist === 'Unknown' && title.includes(' - ')) {
                    var parts = title.split(' - ');
                    artist = parts[0].trim();
                    title = parts.slice(1).join(' - ').trim();
                }
                if (Array.isArray(artist)) artist = artist[0] || 'Unknown';
                return { ...r, artist: artist, title: title };
            });
            filteredRecords = currentResults.slice();
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Found ' + totalRecords + ' Discogs results', 'success');
        } catch (error) {
            console.error('Discogs search error:', error);
            recordsTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;">Error searching Discogs: ' + error.message + '</td></tr>';
        }
    }

    async function performRefundSearch(term) {
        try {
            var data = await apiRequest('GET', '/records/search?q=' + encodeURIComponent(term));
            if (!data.records || !data.records.length) {
                playSound('error');
                showStatus('No sold record found with that search term', 'error');
                return;
            }
            var soldRecords = data.records.filter(function(r) { return r.status_id === 3 || r.status_id === 4; });
            if (soldRecords.length === 0) {
                playSound('error');
                showStatus('No sold records found matching that term', 'error');
                return;
            }
            filteredRecords = soldRecords;
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            playSound('success');
            showStatus('Found ' + totalRecords + ' sold record(s)', 'success');
            updateSelectionCount();
        } catch (error) {
            playSound('error');
            showStatus('Error searching: ' + error.message, 'error');
            console.error('Refund search error:', error);
        }
    }

    function performDiscogsFilterSearch(term) {
        var termLower = term.toLowerCase();
        var source = currentLocationRecords.length > 0 ? currentLocationRecords : allRecords;
        var filtered = source.filter(function(r) {
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
        showStatus('Found ' + totalRecords + ' records matching "' + term + '"', 'info');
    }

    function performDeleteSearch(term) {
        applyDeleteFilter();
    }

    function clearSearch() {
        searchInput.value = '';
        if (currentSearchMode === 'add') {
            currentMode = 'inventory';
            currentResults = [];
            if (selectedPurchaseId) {
                loadRecordsForPurchase(selectedPurchaseId);
            } else {
                filteredRecords = [];
                totalRecords = 0;
                currentPage = 1;
                renderPagination();
                renderTablePage();
            }
        } else if (currentSearchMode === 'scan') {
            // keep list - don't clear scanned records
        } else if (currentSearchMode === 'refund') {
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Search cleared', 'info');
        } else if (currentSearchMode === 'discogs') {
            refreshDiscogsRecords();
        } else if (currentSearchMode === 'delete') {
            applyDeleteFilter();
        } else if (currentSearchMode === 'checkout') {
            checkoutViewMode = 'list';
            filteredRecords = checkoutSelectedItems.slice();
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Showing checkout list', 'info');
            updateSelectionCount();
        } else if (currentSearchMode === 'discogs_orders') {
            if (discogsOrderSelect) discogsOrderSelect.value = '';
            selectedOrderId = null;
            currentOrderItems = [];
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            applyDiscogsOrdersFilters();
        }
        showStatus('Search cleared', 'info');
        
        if (searchInput) {
            searchInput.focus();
        }
    }

    function applyDiscogsSearchFilter() {
        var searchTerm = searchInput.value.trim().toLowerCase();
        var records = currentLocationRecords.length > 0 ? currentLocationRecords : allRecords;
        records = records.filter(function(r) {
            return r.status_id === 2 && !hasConsignor(r) && meetsLastSeenFilter(r) && r.created_at && r.location && r.location.trim() !== '';
        });
        if (searchTerm) {
            records = records.filter(function(r) {
                var matchesArtist = r.artist && r.artist.toLowerCase().indexOf(searchTerm) !== -1;
                var matchesTitle = r.title && r.title.toLowerCase().indexOf(searchTerm) !== -1;
                var matchesCatalog = r.catalog_number && r.catalog_number.toLowerCase().indexOf(searchTerm) !== -1;
                var matchesBarcode = r.barcode && r.barcode.toLowerCase().indexOf(searchTerm) !== -1;
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

    // ========== Image Expand ==========
    window.expandImage = function(imageUrl, title) {
        if (!imageUrl) return;
        
        var existingModal = document.getElementById('image-expand-modal');
        if (existingModal) {
            existingModal.remove();
        }

        var modal = document.createElement('div');
        modal.id = 'image-expand-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.style.background = 'rgba(0,0,0,0.85)';
        modal.style.zIndex = '10000';
        modal.innerHTML = '<div style="max-width: 90vw; max-height: 90vh; position: relative; display: flex; flex-direction: column; align-items: center;"><button onclick="document.getElementById(\'image-expand-modal\').remove()" style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 24px; cursor: pointer; z-index: 10;">×</button>' + (title ? '<div style="color: white; font-size: 16px; padding: 10px; text-align: center; background: rgba(0,0,0,0.5); border-radius: 8px; margin-bottom: 10px; max-width: 100%;">' + escapeHtml(title) + '</div>' : '') + '<img src="' + escapeHtml(imageUrl) + '" style="max-width: 90vw; max-height: 80vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 30px rgba(0,0,0,0.5);"><div style="color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 10px;">Click outside to close</div></div>';
        document.body.appendChild(modal);

        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
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

    // ========== Markup Rules ==========
    window.toggleMarkupRules = function() {
        var content = document.getElementById('markup-rules-content');
        var icon = document.getElementById('markup-rules-toggle-icon');
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
        var content = document.getElementById('markup-charts-content');
        var icon = document.getElementById('markup-charts-toggle-icon');
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
            var data = await apiRequest('GET', '/api/markup-rules');
            if (data.status === 'success') {
                renderMarkupRules(data.rules);
            }
        } catch (error) {
            console.error('Error loading markup rules:', error);
        }
    }

    function renderMarkupRules(rules) {
        var tbody = document.getElementById('markup-rules-body');
        if (!tbody) return;
        if (!rules || rules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 30px; text-align: center; color: #999;">⚠️ No rules configured. Add your first rule above.</td></tr>';
            return;
        }
        rules.sort(function(a, b) { return a.days_old - b.days_old; });
        var html = '';
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
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
        var daysInput = document.getElementById('new-rule-days');
        var percentInput = document.getElementById('new-rule-percent');
        var descInput = document.getElementById('new-rule-desc');
        if (!daysInput || !percentInput || !descInput) return;
        var days_old = parseInt(daysInput.value);
        var markup_percent = parseFloat(percentInput.value);
        var description = descInput.value;
        if (isNaN(days_old) || isNaN(markup_percent)) {
            showDiscogsStatus('Please enter valid days and percentage', 'error');
            return;
        }
        try {
            var result = await apiRequest('POST', '/api/markup-rules', {
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
        var percentInput = document.getElementById('rule-percent-' + ruleId);
        var descInput = document.getElementById('rule-desc-' + ruleId);
        if (!percentInput || !descInput) return;
        var markup_percent = parseFloat(percentInput.value);
        var description = descInput.value;
        if (isNaN(markup_percent)) {
            showDiscogsStatus('Please enter a valid percentage', 'error');
            return;
        }
        try {
            var result = await apiRequest('PUT', '/api/markup-rules/' + ruleId, {
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
            var result = await apiRequest('DELETE', '/api/markup-rules/' + ruleId);
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

    // ========== Markup Analysis Charts ==========
    async function loadMarkupAnalysisCharts() {
        try {
            var cutoffInput = document.getElementById('last-seen-cutoff-date');
            var cutoff = '';
            if (cutoffInput && cutoffInput.value) {
                cutoff = cutoffInput.value;
            } else {
                cutoff = '';
            }
            var url = window.AppConfig.baseUrl + '/api/markup-analysis' + (cutoff ? '?cutoff=' + cutoff : '');
            var response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (!response.ok) throw new Error('Failed to load markup analysis data');
            var data = await response.json();
            if (data.status === 'success') {
                renderMarkupCurveChart(data);
                renderMarkupDistributionChart(data);
                renderAgeDistributionChart(data);
                var countEl = document.getElementById('chart-record-count');
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
        var canvas = document.getElementById('markup-curve-chart');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        if (markupCurveChart) { markupCurveChart.destroy(); markupCurveChart = null; }
        var points = data.curve_points || [];
        if (points.length === 0) {
            markupCurveChart = new Chart(ctx, {
                type: 'line',
                data: { labels: ['No Data'], datasets: [{ label: 'Markup %', data: [0], borderColor: '#ccc', backgroundColor: 'rgba(200,200,200,0.1)', borderWidth: 2, pointRadius: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        var days = points.map(function(p) { return p.days; });
        var markups = points.map(function(p) { return p.markup_percent; });
        var minMarkup = Math.min.apply(null, markups);
        var maxMarkup = Math.max.apply(null, markups);
        var yPadding = Math.max(5, Math.abs(maxMarkup - minMarkup) * 0.1);
        var xMax = data.chart_max_days || Math.max.apply(null, days);
        var xStepSize = 30;
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
        var canvas = document.getElementById('markup-distribution-chart');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        if (markupDistributionChart) { markupDistributionChart.destroy(); markupDistributionChart = null; }
        var distribution = data.distribution || {};
        if (Object.keys(distribution).length === 0) {
            markupDistributionChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: ['No Data'], datasets: [{ label: 'Records', data: [0], backgroundColor: ['#ccc'], borderColor: ['#999'], borderWidth: 1 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        var sortedKeys = Object.keys(distribution).sort(function(a, b) { return parseFloat(a) - parseFloat(b); });
        var labels = sortedKeys;
        var counts = sortedKeys.map(function(key) { return distribution[key]; });
        var totalRecords = data.active_records_count || 0;
        var colors = labels.map(function(label) {
            var value = parseFloat(label);
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
                                var count = context.parsed.y;
                                var pct = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0;
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
        var canvas = document.getElementById('age-distribution-chart');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        if (ageDistributionChart) { ageDistributionChart.destroy(); ageDistributionChart = null; }
        var ageData = data.age_distribution || {};
        if (Object.keys(ageData).length === 0) {
            ageDistributionChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: ['No Data'], datasets: [{ label: 'Records', data: [0], backgroundColor: ['#ccc'], borderColor: ['#999'], borderWidth: 1 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
            return;
        }
        var sortedKeys = Object.keys(ageData).sort(function(a, b) { return parseInt(a) - parseInt(b); });
        var labels = sortedKeys.map(function(key) {
            var parts = key.split('-');
            if (parts.length === 2) return parts[0] + '-' + parts[1] + 'd';
            return key + 'd';
        });
        var counts = sortedKeys.map(function(key) { return ageData[key]; });
        var totalRecords = data.active_records_count || 0;
        var colors = sortedKeys.map(function(_, index) {
            return 'rgba(23,162,184,' + (0.6 + (index / sortedKeys.length) * 0.3) + ')';
        });
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
                                var count = context.parsed.y;
                                var pct = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0;
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
        var statsEl = document.getElementById('age-chart-stats');
        if (statsEl && data.age_stats) {
            statsEl.textContent = '| Avg: ' + data.age_stats.avg_days + 'd | Min: ' + data.age_stats.min_days + ' | Max: ' + data.age_stats.max_days;
        }
    }

    // ========== Last Seen Filter ==========
    function applyLastSeenFilter() {
        if (lastSeenCutoffDateInput) {
            lastSeenCutoffDate = lastSeenCutoffDateInput.value;
        } else {
            lastSeenCutoffDate = null;
        }
        console.log('📅 Last seen cutoff date set to: ' + (lastSeenCutoffDate || 'none'));
        refreshDiscogsRecords();
        showDiscogsStatus('Last seen filter set to: ' + (lastSeenCutoffDate || 'disabled'), 'info');
        loadMarkupAnalysisCharts();
    }

    // ========== Post Single Record to Discogs ==========
    async function postSingleRecordToDiscogs(recordId, artist, title, price, discogsPrice, markupPercent, mediaCondition, sleeveCondition, catalogNumber, location, notes) {
        if (!recordId || !mediaCondition || !sleeveCondition || !price || !discogsPrice) {
            showDiscogsStatus('Missing required information', 'error');
            return;
        }
        if (!confirm('📋 Post "' + artist + ' - ' + title + '" to Discogs?\n\nStore Price: $' + price + '\nDiscogs Price: $' + discogsPrice + ' (' + (markupPercent > 0 ? '+' : '') + markupPercent + '%)\nMedia: ' + mediaCondition + '\nSleeve: ' + sleeveCondition)) {
            return;
        }

        var listingData = {
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
            var result = await apiRequest('POST', '/api/discogs/create-listing-single', listingData);
            if (result.success) {
                var discogsUrl = result.listing_url;
                if (!discogsUrl && result.listing_id) {
                    discogsUrl = 'https://www.discogs.com/sell/item/' + result.listing_id;
                }
                showDiscogsStatus('✅ Successfully posted "' + artist + ' - ' + title + '" to Discogs! ' + (discogsUrl ? '<a href="' + discogsUrl + '" target="_blank">View</a>' : ''), 'success');
                refreshDiscogsRecords();
            } else {
                showDiscogsStatus('Error: ' + result.error, 'error');
            }
        } catch (error) {
            showDiscogsStatus('Error: ' + error.message, 'error');
        }
    }

    // ========== Discogs Post Modal ==========
    function showDiscogsPostModal() {
        var records = getSelectedRecords();
        if (records.length === 0) {
            showDiscogsStatus('No records selected. Please select a range using "from" and "to" buttons.', 'warning');
            return;
        }

        var existingModal = document.getElementById('discogs-post-modal');
        if (existingModal) {
            existingModal.remove();
        }

        var modal = document.createElement('div');
        modal.id = 'discogs-post-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = '<div class="modal-content" style="max-width: 600px; width: 95%;"><div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;"><h3 class="modal-title"><i class="fab fa-discogs"></i> Post Records to Discogs</h3><button class="modal-close" onclick="closeDiscogsPostModal()" style="color: white;">&times;</button></div><div class="modal-body"><div style="margin-bottom: 15px;"><p><strong>' + records.length + '</strong> record(s) selected for posting.</p></div><div style="margin-bottom: 20px;"><label for="discogs-post-location" style="display:block; font-weight:600; margin-bottom:4px;"><i class="fas fa-map-marker-alt"></i> Location <span style="color:#dc3545;">*</span></label><input type="text" id="discogs-post-location" class="form-control" placeholder="e.g., Bin 24 | Left Top" style="width:100%; padding:10px; font-size:16px; border:1px solid #ddd; border-radius:4px;"><p style="font-size:12px; color:#666; margin-top:5px;"><i class="fas fa-info-circle"></i> This location will be saved to all selected records before posting.</p></div><div style="margin-bottom: 20px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><span style="font-weight:600;">Progress</span><span id="discogs-post-progress-text">0%</span></div><div style="width:100%; height:24px; background:#e9ecef; border-radius:12px; overflow:hidden;"><div id="discogs-post-progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #28a745, #20c997); transition:width 0.3s ease; border-radius:12px;"></div></div></div><div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:600;"><i class="fas fa-list"></i> Status Log</span><span id="discogs-post-log-count" style="font-size:12px; color:#666;">0 / ' + records.length + '</span></div><div id="discogs-post-log" style="max-height:200px; overflow-y:auto; background:#f8f9fa; border:1px solid #ddd; border-radius:4px; padding:10px; font-family:monospace; font-size:13px; margin-top:5px;"><div style="color:#999; text-align:center; padding:20px;">Ready to start posting...</div></div></div><div id="discogs-post-status" style="margin-top:10px; display:none;"></div></div><div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;"><button class="btn btn-secondary" id="discogs-post-cancel-btn" onclick="closeDiscogsPostModal()"><i class="fas fa-times"></i> Cancel</button><button class="btn btn-success" id="discogs-post-start-btn"><i class="fab fa-discogs"></i> Start Posting</button></div></div>';
        document.body.appendChild(modal);

        setTimeout(function() {
            var locationInput = document.getElementById('discogs-post-location');
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

        updateDiscogsPostLog('info', '📋 Ready to post ' + records.length + ' records. Enter location and click Start.');
    }

    function closeDiscogsPostModal() {
        var modal = document.getElementById('discogs-post-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.remove();
        }
        isPosting = false;
        postProgress = 0;
        postResults = [];
    }

    function updateDiscogsPostProgress(current, total) {
        var percent = total > 0 ? Math.round((current / total) * 100) : 0;
        postProgress = percent;
        var bar = document.getElementById('discogs-post-progress-bar');
        var text = document.getElementById('discogs-post-progress-text');
        if (bar) bar.style.width = percent + '%';
        if (text) text.textContent = percent + '%';
    }

    function updateDiscogsPostLog(type, message) {
        var logContainer = document.getElementById('discogs-post-log');
        var logCount = document.getElementById('discogs-post-log-count');
        if (!logContainer) return;

        var placeholder = logContainer.querySelector('div[style*="color:#999"]');
        if (placeholder) {
            placeholder.remove();
        }

        var timestamp = new Date().toLocaleTimeString();
        var entry = document.createElement('div');
        entry.style.padding = '4px 0';
        entry.style.borderBottom = '1px solid #f0f0f0';
        entry.style.fontSize = '12px';

        var color = '#333';
        var icon = 'ℹ️';
        if (type === 'success') { color = '#28a745'; icon = '✅'; }
        else if (type === 'error') { color = '#dc3545'; icon = '❌'; }
        else if (type === 'warning') { color = '#ffc107'; icon = '⚠️'; }
        else { color = '#007bff'; icon = 'ℹ️'; }

        entry.innerHTML = '<span style="color:#999;">[' + timestamp + ']</span> <span style="color:' + color + ';">' + icon + ' ' + escapeHtml(message) + '</span>';
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;

        var entries = logContainer.querySelectorAll('div:not([style*="color:#999"])');
        if (logCount) {
            var total = document.querySelector('#discogs-post-progress-text')?.textContent?.replace('%', '') || '0';
            logCount.textContent = entries.length + ' / ' + Math.round((postProgress / 100) * (entries.length || 1));
        }
    }

    function showDiscogsPostStatus(message, type) {
        var el = document.getElementById('discogs-post-status');
        if (el) {
            el.textContent = message;
            el.className = 'status-message status-' + type;
            el.style.display = 'block';
        }
    }

    async function startDiscogsPosting(records) {
        if (isPosting) return;
        if (records.length === 0) {
            showDiscogsPostStatus('No records selected.', 'error');
            return;
        }

        var locationInput = document.getElementById('discogs-post-location');
        var location = locationInput ? locationInput.value.trim() : '';

        if (!location) {
            showDiscogsPostStatus('Please enter a location before posting.', 'error');
            locationInput.focus();
            return;
        }

        var startBtn = document.getElementById('discogs-post-start-btn');
        var cancelBtn = document.getElementById('discogs-post-cancel-btn');
        if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Posting...'; }
        if (cancelBtn) { cancelBtn.disabled = true; }

        isPosting = true;
        postResults = [];
        var successCount = 0;
        var failCount = 0;

        updateDiscogsPostLog('info', '📍 Location set to: ' + location);
        updateDiscogsPostLog('info', '🚀 Starting to post ' + records.length + ' records...');

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var current = i + 1;

            updateDiscogsPostProgress(current, records.length);

            try {
                updateDiscogsPostLog('info', '📝 Updating location for #' + record.id + ': ' + record.artist + ' - ' + record.title);
                await apiRequest('PUT', '/records/' + record.id, { location: location });

                updateDiscogsPostLog('info', '💰 Calculating price for #' + record.id + '...');
                var priceRequests = [{
                    id: record.id,
                    created_at: record.created_at,
                    store_price: record.store_price
                }];
                var batchResults = await calculateMarkupBatch(priceRequests);
                
                var discogsPrice = null;
                var markupPercent = null;
                if (batchResults.length > 0 && batchResults[0].id) {
                    discogsPrice = batchResults[0].discogs_price;
                    markupPercent = batchResults[0].markup_percent;
                }

                if (!discogsPrice) {
                    throw new Error('Could not calculate Discogs price');
                }

                updateDiscogsPostLog('info', '📤 Posting #' + record.id + ': ' + record.artist + ' - ' + record.title + ' at $' + discogsPrice + '...');
                
                var listingData = {
                    record: {
                        id: record.id,
                        artist: record.artist,
                        title: record.title,
                        catalog_number: record.catalog_number || '',
                        media_condition: record.disc_condition_name || record.sleeve_condition_name || 'Very Good Plus (VG+)',
                        sleeve_condition: record.sleeve_condition_name || record.disc_condition_name || 'Very Good Plus (VG+)',
                        price: discogsPrice,
                        notes: record.notes || '',
                        location: location
                    }
                };

                var result = await apiRequest('POST', '/api/discogs/create-listing-single', listingData);

                if (result.success) {
                    successCount++;
                    updateDiscogsPostLog('success', '✅ #' + record.id + ': ' + record.artist + ' - ' + record.title + ' posted successfully!');
                } else {
                    throw new Error(result.error || 'Discogs API returned error');
                }

            } catch (error) {
                failCount++;
                updateDiscogsPostLog('error', '❌ #' + record.id + ': ' + record.artist + ' - ' + record.title + ' failed - ' + error.message);
                console.error('Error posting record #' + record.id, error);
            }

            if (i < records.length - 1) {
                await new Promise(function(resolve) { setTimeout(resolve, 2000); });
            }
        }

        isPosting = false;
        updateDiscogsPostProgress(records.length, records.length);

        var summary = '✅ ' + successCount + ' posted successfully, ❌ ' + failCount + ' failed.';
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

        if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Start Posting'; }
        if (cancelBtn) { cancelBtn.disabled = false; }

        refreshDiscogsRecords();
    }

    // ========== Post Selected Records ==========
    async function postSelectedRecords() {
        showDiscogsPostModal();
    }

    // ========== Delete Selected ==========
    async function deleteSelected() {
        var records = getSelectedRecords();
        console.log('🗑️ deleteSelected: selected ' + records.length + ' records out of ' + filteredRecords.length + ' total filtered');
        if (records.length === 0) {
            showStatus('No records selected. Please select a range using "from" and "to" buttons.', 'warning');
            return;
        }
        if (!confirm('Delete ' + records.length + ' record(s) permanently? This cannot be undone.')) {
            return;
        }
        var deleted = 0;
        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            try {
                await apiRequest('DELETE', '/records/' + record.id);
                deleted++;
            } catch (e) {
                console.error('Delete failed for record', record.id, e);
            }
        }
        showStatus('Deleted ' + deleted + ' of ' + records.length + ' records', 'success');
        await loadRecords({ statusIds: [1,2], mode: 'delete' });
        cancelRangeSelection();
    }

    // ========== Apply Delete Filter ==========
    function applyDeleteFilter() {
        var statusFilter = deleteStatusFilter ? deleteStatusFilter.value : '1,2';
        var searchTerm = searchInput.value.trim().toLowerCase();
        var statuses = statusFilter.split(',').map(function(s) { return parseInt(s.trim()); }).filter(function(s) { return !isNaN(s); });
        if (statuses.length === 0) statuses = [1,2];
        loadRecords({ statusIds: statuses, mode: 'delete', search: searchTerm });
    }

    // ========== Print Price Tags ==========
    function printPriceTags() {
        var records = [];
        
        if (rangeFromIndex !== null && rangeToIndex !== null) {
            records = getSelectedRecords();
        }
        
        if (records.length === 0) {
            records = filteredRecords;
        }
        
        if (records.length === 0) {
            showStatus('No records to print.', 'warning');
            return;
        }
        generatePDF(records);
    }

    // ========== Checkout functions ==========
    function addToCheckout(recordId) {
        console.log('🛒 addToCheckout called with recordId: ' + recordId);
        var record = allRecords.find(function(r) { return r.id === recordId; });
        if (!record) {
            console.warn('🛒 Record ' + recordId + ' not found in allRecords');
            return;
        }
        console.log('🛒 Found record: ' + record.artist + ' - ' + record.title);
        
        if (!checkoutSelectedItems.some(function(r) { return r.id === recordId; })) {
            checkoutSelectedItems.push(record);
            console.log('🛒 Added to checkout. Now ' + checkoutSelectedItems.length + ' items.');
            showStatus('Added "' + record.artist + ' - ' + record.title + '" to checkout', 'success');
            checkoutViewMode = 'list';
            filteredRecords = checkoutSelectedItems.slice();
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            updateSelectionCount();
            if (checkoutShowSelectedBtn) {
                checkoutShowSelectedBtn.textContent = 'Checkout List (' + checkoutSelectedItems.length + ')';
            }
        } else {
            console.log('🛒 Record ' + recordId + ' already in checkout');
            showStatus('Record already in checkout list', 'info');
        }
    }

    function removeFromCheckout(recordId) {
        console.log('🛒 removeFromCheckout called with recordId: ' + recordId);
        var index = checkoutSelectedItems.findIndex(function(r) { return r.id === recordId; });
        if (index !== -1) {
            var removed = checkoutSelectedItems.splice(index, 1)[0];
            console.log('🛒 Removed ' + removed.artist + ' - ' + removed.title + ' from checkout. Now ' + checkoutSelectedItems.length + ' items.');
            showStatus('Removed "' + removed.artist + ' - ' + removed.title + '" from checkout', 'info');
            filteredRecords = checkoutSelectedItems.slice();
            totalRecords = filteredRecords.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            updateSelectionCount();
            if (checkoutShowSelectedBtn) {
                checkoutShowSelectedBtn.textContent = 'Checkout List (' + checkoutSelectedItems.length + ')';
            }
            if (checkoutSelectedItems.length === 0) {
                filteredRecords = [];
                totalRecords = 0;
                renderPagination();
                renderTablePage();
            }
        } else {
            console.warn('🛒 Record ' + recordId + ' not found in checkout');
        }
    }

    // ========== Square Payment Processing ==========
    async function checkSquareAvailability() {
        try {
            var response = await fetch(window.AppConfig.baseUrl + '/api/square/terminals', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            if (!response.ok) throw new Error('Failed to fetch terminals');
            var data = await response.json();
            squareAvailable = data.terminals && data.terminals.length > 0;
            availableTerminals = data.terminals || [];
            console.log('📟 Square terminals available: ' + squareAvailable + ', terminals:', availableTerminals);
        } catch (error) {
            console.warn('Square not available:', error);
            squareAvailable = false;
            availableTerminals = [];
        }
        return squareAvailable;
    }

    async function processSquarePayment() {
        var statusDiv = document.getElementById('checkout-square-status');
        var completeBtn = document.getElementById('checkout-complete-payment');
        if (!statusDiv) return;

        completeBtn.disabled = true;
        completeBtn.textContent = 'Processing...';

        statusDiv.style.display = 'block';
        statusDiv.className = 'status-message status-info';
        statusDiv.textContent = '⏳ Sending payment request to Square Terminal...';

        try {
            if (!squareAvailable || availableTerminals.length === 0) {
                await checkSquareAvailability();
                if (!squareAvailable || availableTerminals.length === 0) {
                    throw new Error('No Square Terminal available. Please use Cash or Gift Card.');
                }
            }

            var deviceId = availableTerminals[0].id;
            console.log('Using Square Terminal device ID:', deviceId);

            var records = checkoutSelectedItems;
            var totalCents = Math.round(checkoutTotal * 100);
            var recordIds = records.map(function(r) { return r.id; });
            var titles = records.map(function(r) { return r.artist + ' - ' + r.title; });

            var squareAmount = checkoutTotal;
            addPaymentEntry('Card (Square)', squareAmount);

            var response = await fetch(window.AppConfig.baseUrl + '/api/square/terminal/checkout', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount_cents: totalCents,
                    record_ids: recordIds,
                    record_titles: titles,
                    reference_id: generateOrderId(),
                    device_id: deviceId
                })
            });

            var data = await response.json();
            if (data.status !== 'success') {
                if (checkoutPaymentEntries.length > 0) {
                    var lastEntry = checkoutPaymentEntries[checkoutPaymentEntries.length - 1];
                    if (lastEntry.method === 'Card (Square)') {
                        checkoutPaymentEntries.pop();
                        checkoutRemaining += lastEntry.amount;
                        document.getElementById('checkout-remaining').textContent = checkoutRemaining.toFixed(2);
                        renderCheckoutEntries();
                        updateCheckoutCompleteButton();
                    }
                }
                throw new Error(data.message || 'Failed to create Square checkout');
            }

            var checkout = data.checkout;
            squareCheckoutId = checkout.id;

            statusDiv.textContent = '💳 Payment request sent to POS. Waiting for customer to complete payment...';
            statusDiv.className = 'status-message status-info';

            startPollingSquareStatus(checkout.id);

        } catch (error) {
            console.error('Square checkout error:', error);
            statusDiv.textContent = '❌ Error: ' + error.message;
            statusDiv.className = 'status-message status-error';
            completeBtn.disabled = false;
            completeBtn.textContent = 'Complete Payment';
        }
    }

    function startPollingSquareStatus(checkoutId) {
        if (squarePollInterval) {
            clearInterval(squarePollInterval);
        }

        var statusDiv = document.getElementById('checkout-square-status');
        var attempts = 0;
        var maxAttempts = 60;

        squarePollInterval = setInterval(async function() {
            attempts++;
            try {
                var response = await fetch(window.AppConfig.baseUrl + '/api/square/terminal/checkout/' + checkoutId + '/status', {
                    credentials: 'include',
                    headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
                });
                var data = await response.json();
                if (data.status !== 'success') {
                    return;
                }

                var checkout = data.checkout;
                var status = checkout.status;

                if (status === 'COMPLETED') {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    statusDiv.textContent = '✅ Payment completed successfully!';
                    statusDiv.className = 'status-message status-success';
                    await completeCheckout();
                    setTimeout(function() {
                        var modal = document.getElementById('checkout-payment-modal');
                        if (modal) modal.style.display = 'none';
                    }, 1500);
                } else if (status === 'CANCELED' || status === 'FAILED') {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    statusDiv.textContent = '❌ Payment ' + status.toLowerCase() + '. Please try again.';
                    statusDiv.className = 'status-message status-error';
                    var completeBtn = document.getElementById('checkout-complete-payment');
                    completeBtn.disabled = false;
                    completeBtn.textContent = 'Complete Payment';
                } else if (status === 'PENDING' || status === 'IN_PROGRESS') {
                    statusDiv.textContent = '⏳ Waiting for payment... (' + attempts + 's)';
                    statusDiv.className = 'status-message status-info';
                }

                if (attempts >= maxAttempts) {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    statusDiv.textContent = '⏰ Payment timed out. Please try again.';
                    statusDiv.className = 'status-message status-warning';
                    var completeBtn = document.getElementById('checkout-complete-payment');
                    completeBtn.disabled = false;
                    completeBtn.textContent = 'Complete Payment';
                }

            } catch (error) {
                console.warn('Polling error:', error);
            }
        }, 2000);
    }

    // ========== Complete Checkout with Sale Recording ==========
    async function completeCheckout() {
        console.log('🛒 completeCheckout called');
        console.log('🛒 checkoutRemaining: ' + checkoutRemaining);
        console.log('🛒 checkoutSelectedItems length: ' + checkoutSelectedItems.length);
        
        if (checkoutRemaining > 0.01) {
            console.log('🛒 Remaining balance not covered');
            showCheckoutStatus('Remaining balance not covered', 'error');
            return;
        }

        var selected = checkoutSelectedItems;
        if (selected.length === 0) {
            console.log('🛒 No items in checkout');
            return;
        }
        console.log('🛒 Processing ' + selected.length + ' items');

        var today = getLocalMSTDate();
        var success = 0;
        var bernieTotal = 0;
        var consignorTransactions = [];

        var regularRecords = [];
        var bernieItems = [];
        var consignorRecords = [];

        for (var i = 0; i < selected.length; i++) {
            var record = selected[i];
            if (record.isBernie === true) {
                bernieItems.push(record);
            } else if (record.isCustom === true) {
                // Skip other custom items
            } else if (record.consignor_id && record.consignor_id !== 1 && record.consignor_id !== null) {
                consignorRecords.push(record);
            } else {
                regularRecords.push(record);
            }
        }

        bernieTotal = bernieItems.reduce(function(sum, r) { return sum + (r.store_price || 0); }, 0);
        console.log('🛒 Bernie total: ' + bernieTotal);
        console.log('🛒 Regular records: ' + regularRecords.length);
        console.log('🛒 Consignor records: ' + consignorRecords.length);

        var orderId = generateOrderId();
        var totalAmount = 0;

        var paymentMethod = checkoutPaymentEntries.length > 0 ? checkoutPaymentEntries[0].method : 'Cash';
        var paymentMethodMap = {
            'Cash': 'cash',
            'Card (Square)': 'square',
            'Gift Card': 'giftcard',
            'Store Credit': 'store_credit'
        };
        var salePaymentMethod = paymentMethodMap[paymentMethod] || 'cash';
        
        for (var i = 0; i < selected.length; i++) {
            totalAmount += (selected[i].store_price || 0);
        }

        var saleItems = selected.map(function(item) {
            return {
                id: item.id,
                artist: item.artist || 'Custom',
                title: item.title || 'Item',
                price: item.store_price || 0,
                isCustom: item.isCustom || false,
                isBernie: item.isBernie || false,
                consignor_id: item.consignor_id || null
            };
        });

        try {
            console.log('🛒 Creating sale journal entry for order:', orderId, 'total:', totalAmount);
            var saleResult = await apiRequest('POST', '/api/accounting/sale', {
                order_id: orderId,
                payment_method: salePaymentMethod,
                total_amount: totalAmount,
                items: saleItems,
                transaction_date: today
            });
            if (saleResult.status === 'success') {
                console.log('✅ Sale journal entry created:', saleResult.entry_id);
            } else {
                console.warn('⚠️ Failed to create sale journal entry:', saleResult.error);
            }
        } catch (err) {
            console.error('❌ Error creating sale journal entry:', err);
        }

        for (var i = 0; i < regularRecords.length; i++) {
            var record = regularRecords[i];
            try {
                await apiRequest('PUT', '/records/' + record.id, {
                    status_id: 3,
                    date_sold: today,
                    actual_sale_price: record.store_price
                });
                success++;
            } catch (err) {
                console.error('Failed to update record', record.id, err);
            }
        }

        for (var i = 0; i < consignorRecords.length; i++) {
            var record = consignorRecords[i];
            try {
                var consignorName = 'Unknown Consignor';
                try {
                    var userRes = await apiRequest('GET', '/users/' + record.consignor_id);
                    if (userRes && userRes.id) {
                        consignorName = userRes.full_name || userRes.username || 'Consignor-' + record.consignor_id;
                    }
                } catch (userErr) {
                    console.warn('Could not fetch consignor name for ID:', record.consignor_id, userErr);
                    consignorName = 'Consignor-' + record.consignor_id;
                }

                var salePrice = record.store_price || 0;
                var commissionRate = record.commission_rate || 0.3;
                var consignorShare = salePrice * (1 - commissionRate);
                var storeCommission = salePrice * commissionRate;

                consignorTransactions.push({
                    record_id: record.id,
                    consignor_id: record.consignor_id,
                    consignor_name: consignorName,
                    sale_price: salePrice,
                    commission_rate: commissionRate,
                    consignor_share: consignorShare,
                    store_commission: storeCommission
                });

                await apiRequest('PUT', '/records/' + record.id, {
                    status_id: 3,
                    date_sold: today,
                    actual_sale_price: salePrice
                });
                success++;

            } catch (err) {
                console.error('Failed to process consignor record', record.id, err);
            }
        }

        for (var i = 0; i < consignorTransactions.length; i++) {
            var tx = consignorTransactions[i];
            try {
                var accountsRes = await apiRequest('GET', '/api/accounting/accounts');
                var accounts = accountsRes.accounts || [];
                var cashAccount = accounts.find(function(a) { return a.code === '1015'; });
                var revenueAccount = accounts.find(function(a) { return a.code === '4000'; });
                var payableAccount = accounts.find(function(a) { return a.code === '2015'; });

                if (!cashAccount || !revenueAccount || !payableAccount) {
                    console.error('Required accounts not found for consignor transaction');
                    showCheckoutStatus('Error: Required accounts not found', 'error');
                    continue;
                }

                var entryData = {
                    date: today,
                    description: tx.consignor_name + ' | ISSUE | Record #' + tx.record_id + ' sold - $' + tx.sale_price.toFixed(2) + ' (' + (tx.commission_rate * 100).toFixed(0) + '% commission)',
                    lines: [
                        { account_id: cashAccount.id, debit: tx.sale_price, credit: 0 },
                        { account_id: revenueAccount.id, debit: 0, credit: tx.store_commission },
                        { account_id: payableAccount.id, debit: 0, credit: tx.consignor_share }
                    ]
                };
                var result = await apiRequest('POST', '/api/accounting/manual', entryData);
                if (result.status === 'success') {
                    console.log('✅ Consignor ' + tx.consignor_name + ' credited $' + tx.consignor_share.toFixed(2));
                } else {
                    console.error('Failed to create consignor journal entry:', result.error);
                }
            } catch (err) {
                console.error('Error processing consignor transaction:', err);
            }
        }

        if (bernieTotal > 0) {
            try {
                var accountsRes = await apiRequest('GET', '/api/accounting/accounts');
                var accounts = accountsRes.accounts || [];

                var paymentMethod2 = checkoutPaymentEntries.length > 0 ? checkoutPaymentEntries[0].method : 'Cash';
                var accountMap = {
                    'Cash': '1015',
                    'Card (Square)': '1030',
                    'Gift Card': '1015',
                    'Store Credit': '1015'
                };
                var accountCode = accountMap[paymentMethod2] || '1015';

                var cashAccount = accounts.find(function(a) { return a.code === accountCode; });
                var payableAccount = accounts.find(function(a) { return a.code === '2015'; });

                if (cashAccount && payableAccount) {
                    var entryData = {
                        date: today,
                        description: 'BERNIE | ISSUE | Donation - $' + bernieTotal.toFixed(2) + ' (' + bernieItems.length + ' items)',
                        lines: [
                            { account_id: cashAccount.id, debit: bernieTotal, credit: 0 },
                            { account_id: payableAccount.id, debit: 0, credit: bernieTotal }
                        ]
                    };
                    var result = await apiRequest('POST', '/api/accounting/manual', entryData);
                    if (result.status === 'success') {
                        console.log('✅ Bernie donation journal entry created: $' + bernieTotal.toFixed(2));
                    } else {
                        console.error('Failed to create Bernie journal entry:', result.error);
                    }
                }
            } catch (err) {
                console.error('Error processing Bernie donation:', err);
            }
        }

        var receiptError = null;
        var receiptDownloaded = false;

        var now = new Date();
        var dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        var receipt = 'PigStyle Music\n';
        receipt += '====================\n';
        receipt += dateStr + ' ' + timeStr + '\n';
        receipt += 'Order: ' + orderId + '\n\n';
        receipt += 'ITEMS:\n';
        receipt += '--------------------\n';

        var subtotal = 0;
        for (var i = 0; i < selected.length; i++) {
            var item = selected[i];
            var price = item.store_price || 0;
            var desc = item.isCustom ? item.title : item.artist + ' - ' + item.title;
            if (item.isBernie) {
                receipt += '[Bernie] ' + desc.padEnd(25) + '$' + price.toFixed(2) + '\n';
            } else if (item.consignor_id && item.consignor_id !== 1) {
                receipt += '[Consignor] ' + desc.padEnd(25) + '$' + price.toFixed(2) + '\n';
            } else {
                receipt += desc.padEnd(25) + '$' + price.toFixed(2) + '\n';
            }
            subtotal += price;
        }

        var taxRate = 0.08;
        var tax = subtotal * taxRate;
        var grandTotal = subtotal + tax;

        receipt += '--------------------\n';
        receipt += 'Subtotal'.padEnd(25) + '$' + subtotal.toFixed(2) + '\n';
        receipt += 'Tax'.padEnd(25) + '$' + tax.toFixed(2) + '\n';
        receipt += 'Total'.padEnd(25) + '$' + grandTotal.toFixed(2) + '\n\n';

        receipt += 'PAYMENT:\n';
        receipt += '--------------------\n';
        var totalPaid = 0;
        for (var i = 0; i < checkoutPaymentEntries.length; i++) {
            var entry = checkoutPaymentEntries[i];
            receipt += entry.method.padEnd(25) + '$' + entry.amount.toFixed(2) + '\n';
            totalPaid += entry.amount;
        }
        if (totalPaid < grandTotal) {
            receipt += 'Unpaid'.padEnd(25) + '$' + (grandTotal - totalPaid).toFixed(2) + '\n';
        }
        receipt += '--------------------\n';

        receipt += 'Thank you!\n';
        receipt += 'PigStyle Music\n';
        receipt += 'Come back soon!\n\n\n\n';

        var filename = 'receipt_' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + '.txt';

        try {
            downloadReceipt(receipt, filename);
            receiptDownloaded = true;
        } catch (error) {
            receiptError = error.message || 'Download error';
            console.error('Receipt download error:', error);
        }

        var consignorCount = consignorTransactions.length;
        var consignorTotal = consignorTransactions.reduce(function(sum, t) { return sum + t.consignor_share; }, 0);

        var statusMsg = success + ' records marked as sold';
        if (consignorCount > 0) {
            statusMsg += ', ' + consignorCount + ' consignor(s) credited $' + consignorTotal.toFixed(2);
        }
        if (bernieTotal > 0) {
            statusMsg += ', Bernie donations: $' + bernieTotal.toFixed(2);
        }

        if (receiptDownloaded) {
            statusMsg += ' ✅ Receipt downloaded.';
        } else if (receiptError) {
            statusMsg += ' ⚠️ Receipt could not be downloaded (' + receiptError + '). Purchase completed anyway.';
        }

        showCheckoutStatus('✅ ' + statusMsg, receiptError ? 'warning' : 'success');

        checkoutSelectedItems = [];
        checkoutViewMode = 'list';
        checkoutPaymentEntries = [];
        checkoutRemaining = 0;

        var modal = document.getElementById('checkout-payment-modal');
        if (modal) {
            modal.style.display = 'none';
        }

        filteredRecords = [];
        totalRecords = 0;
        renderPagination();
        renderTablePage();

        if (checkoutShowSelectedBtn) {
            checkoutShowSelectedBtn.textContent = 'Checkout List (0)';
        }
        updateSelectionCount();

        playSound('success');
        console.log('🛒 completeCheckout finished successfully');
    }

    // ========== Show Checkout Modal ==========
    function showCheckoutModal() {
        console.log('🛒 showCheckoutModal called');
        console.log('🛒 checkoutSelectedItems length: ' + checkoutSelectedItems.length);
        console.log('🛒 checkoutSelectedItems:', checkoutSelectedItems);
        
        var oldModal = document.getElementById('checkout-payment-modal');
        if (oldModal) {
            console.log('🛒 Removing existing modal');
            oldModal.parentNode.removeChild(oldModal);
        }

        var selected = checkoutSelectedItems;
        if (selected.length === 0) { 
            console.log('🛒 No items in checkout');
            showStatus('No records in checkout list', 'warning'); 
            return; 
        }
        
        var total = selected.reduce(function(sum, r) { return sum + (r.store_price || 0); }, 0);
        var tax = total * 0.08;
        var grandTotal = total + tax;
        console.log('🛒 Total: ' + total + ', Tax: ' + tax + ', Grand Total: ' + grandTotal);
        
        checkoutTotal = grandTotal;
        checkoutRemaining = grandTotal;
        checkoutPaymentEntries = [];

        var orderId = generateOrderId();

        var modal = document.createElement('div');
        modal.id = 'checkout-payment-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = '<div class="modal-content" style="max-width: 550px; width: 95%;"><div class="modal-header" style="background: #007bff; color: white;"><h3 class="modal-title"><i class="fas fa-shopping-cart"></i> Checkout</h3><button class="modal-close" onclick="document.getElementById(\'checkout-payment-modal\').style.display=\'none\'" style="color: white;">&times;</button></div><div class="modal-body"><p><strong>' + selected.length + '</strong> item(s) selected.</p><div style="font-size: 20px; font-weight: bold; margin: 10px 0;">Total: $' + grandTotal.toFixed(2) + '</div><div style="font-size: 16px; margin: 10px 0; color: #28a745;">Remaining: $<span id="checkout-remaining">' + grandTotal.toFixed(2) + '</span></div><div style="background: #e3f2fd; padding: 12px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #b8daff;"><div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;"><input type="text" id="checkout-debtor-code" placeholder="GIFT-XXXXX or debtor name" style="flex: 2; min-width: 150px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"><button class="btn btn-sm btn-primary" onclick="lookupDebtorForCheckout()" style="padding: 6px 12px;"><i class="fas fa-search"></i> Lookup</button></div><div id="checkout-debtor-info" style="display: none; margin-top: 8px; padding: 8px; background: white; border-radius: 4px;"><div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;"><span><strong id="checkout-debtor-name">—</strong> <span id="checkout-debtor-type" style="font-size: 12px; color: #666;">(Store Credit)</span></span><span style="font-weight: bold; color: #28a745;">Balance: $<span id="checkout-debtor-balance">0.00</span></span></div><div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;"><button class="btn btn-sm btn-success" onclick="applyDebtorToCheckout()" style="padding: 6px 12px;"><i class="fas fa-check"></i> Apply Credit</button><button class="btn btn-sm btn-secondary" onclick="document.getElementById(\'checkout-debtor-info\').style.display=\'none\'"><i class="fas fa-times"></i> Cancel</button></div><div id="checkout-debtor-status" style="font-size: 13px; margin-top: 5px;"></div></div><div style="font-size: 12px; color: #666; margin-top: 6px;"><i class="fas fa-info-circle"></i> Enter a gift card code (GIFT-XXXXX) or a store credit debtor name. Click Apply to use the balance.</div></div><div style="display: flex; gap: 10px; flex-wrap: wrap; margin: 10px 0;"><input type="number" id="checkout-payment-amount" class="form-control" placeholder="Amount" step="0.01" min="0" style="flex: 1; min-width: 100px;"><select id="checkout-payment-method" class="form-control" style="flex: 1; min-width: 120px;"><option value="Cash" selected>Cash</option><option value="Card (Square)">Card (Square)</option></select></div><button class="btn btn-primary" id="checkout-add-payment" style="background: #007bff; color: white;"><i class="fas fa-plus"></i> Add Payment</button></div><div id="checkout-square-warning" style="display:none; padding:8px; background:#fff3cd; border-radius:4px; margin-bottom:10px;">⚠️ Square POS is not available. Card option is disabled.</div><div id="checkout-square-status" style="margin-top:10px; padding:10px; border-radius:4px; display:none; background:#f8f9fa; border:1px solid #ddd;"></div><div id="checkout-payment-entries" style="max-height: 150px; overflow-y: auto; margin: 10px 0;"></div><div id="checkout-payment-status" style="margin-top: 10px; display: none;"></div><button class="btn btn-success" id="checkout-complete-payment" style="width: 100%; margin-top: 10px;" disabled>Complete Payment</button></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById(\'checkout-payment-modal\').style.display=\'none\'">Cancel</button></div></div>';
        document.body.appendChild(modal);
        console.log('🛒 Modal created and appended');

        checkSquareAvailability().then(function(avail) {
            var methodSelect = document.getElementById('checkout-payment-method');
            var cardOption = methodSelect.querySelector('option[value="Card (Square)"]');
            var warning = document.getElementById('checkout-square-warning');
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

        document.getElementById('checkout-add-payment').onclick = function() {
            var amountInput = document.getElementById('checkout-payment-amount');
            var methodSelect2 = document.getElementById('checkout-payment-method');
            var amount = parseFloat(amountInput.value);
            if (isNaN(amount) || amount <= 0) {
                amount = checkoutRemaining;
                if (amount <= 0) {
                    showCheckoutStatus('No remaining balance to pay.', 'error');
                    return;
                }
                amountInput.value = amount.toFixed(2);
            }
            var method = methodSelect2.value;

            if (method === 'Card (Square)' && !squareAvailable) {
                showCheckoutStatus('Square POS is not available. Please use Cash.', 'error');
                return;
            }

            addPaymentEntry(method, amount);
        };

        document.getElementById('checkout-complete-payment').onclick = function() {
            console.log('🛒 Complete Payment button clicked');
            if (checkoutRemaining > 0.01) {
                console.log('🛒 Remaining: ' + checkoutRemaining);
                showCheckoutStatus('Remaining balance not covered', 'error');
                return;
            }
            var methodSelect3 = document.getElementById('checkout-payment-method');
            var method = methodSelect3.value;
            console.log('🛒 Payment method: ' + method);
            if (method === 'Card (Square)') {
                processSquarePayment();
            } else {
                completeCheckout();
            }
        };

        modal.style.display = 'flex';
        updateCheckoutCompleteButton();

        var statusDiv = document.getElementById('checkout-square-status');
        if (statusDiv) {
            statusDiv.style.display = 'none';
            statusDiv.textContent = '';
        }
        console.log('🛒 showCheckoutModal finished');
    }

    // ========== Add Payment Entry ==========
    function addPaymentEntry(method, amount) {
        console.log('💳 addPaymentEntry: ' + method + ' $' + amount);
        if (amount > checkoutRemaining && checkoutRemaining > 0) {
            // allow overpayment
        }
        checkoutPaymentEntries.push({ method: method, amount: amount });
        checkoutRemaining -= amount;
        document.getElementById('checkout-remaining').textContent = checkoutRemaining.toFixed(2);
        renderCheckoutEntries();
        updateCheckoutCompleteButton();
        showCheckoutStatus('Added $' + amount.toFixed(2) + ' ' + method, 'success');
        document.getElementById('checkout-payment-amount').value = '';
    }

    function renderCheckoutEntries() {
        var container = document.getElementById('checkout-payment-entries');
        if (!container) return;
        if (checkoutPaymentEntries.length === 0) {
            container.innerHTML = '<div style="color: #999; text-align: center; padding: 10px;">No payments added yet.</div>';
            return;
        }
        var html = '';
        checkoutPaymentEntries.forEach(function(entry, idx) {
            html += '<div style="display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #eee;"><span>' + entry.method + '</span><span>$' + entry.amount.toFixed(2) + '</span><button class="btn btn-sm btn-danger checkout-remove-entry" data-index="' + idx + '" style="padding: 2px 6px;"><i class="fas fa-times"></i></button></div>';
        });
        container.innerHTML = html;

        container.querySelectorAll('.checkout-remove-entry').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var index = parseInt(this.dataset.index);
                removeCheckoutEntry(index);
            });
        });
    }

    function removeCheckoutEntry(index) {
        var entry = checkoutPaymentEntries[index];
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
        var btn = document.getElementById('checkout-complete-payment');
        if (btn) {
            btn.disabled = checkoutRemaining > 0.01;
        }
    }

    function showCheckoutStatus(message, type) {
        var el = document.getElementById('checkout-payment-status');
        if (el) {
            el.textContent = message;
            el.className = 'status-message status-' + type;
            el.style.display = 'block';
        }
    }

    // ========== UNIFIED DEBTOR LOOKUP FOR CHECKOUT ==========

    var checkoutDebtorData = null;

    async function lookupDebtorForCheckout() {
        var input = document.getElementById('checkout-debtor-code');
        var infoDiv = document.getElementById('checkout-debtor-info');
        var statusEl = document.getElementById('checkout-debtor-status');
        var nameEl = document.getElementById('checkout-debtor-name');
        var typeEl = document.getElementById('checkout-debtor-type');
        var balanceEl = document.getElementById('checkout-debtor-balance');
        
        if (!input) return;
        
        var code = input.value.trim().toUpperCase();
        if (!code) {
            if (statusEl) {
                statusEl.textContent = '⚠️ Please enter a code or name.';
                statusEl.style.color = '#856404';
            }
            return;
        }
        
        statusEl.textContent = '⏳ Looking up...';
        statusEl.style.color = '#666';
        
        try {
            var response = await fetch(window.AppConfig.baseUrl + '/api/debtor/lookup', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: code })
            });
            
            var data = await response.json();
            
            if (data.status === 'success' && data.balance !== undefined) {
                checkoutDebtorData = data;
                var balance = data.balance || 0;
                var isGiftCard = data.is_gift_card;
                var isBernie = data.is_bernie;
                
                infoDiv.style.display = 'block';
                nameEl.textContent = data.debtor;
                
                if (isGiftCard) {
                    typeEl.textContent = '🎁 Gift Card';
                } else if (isBernie) {
                    typeEl.textContent = '🌹 Bernie Fund (Cannot redeem)';
                } else {
                    typeEl.textContent = '💰 Store Credit';
                }
                
                balanceEl.textContent = balance.toFixed(2);
                balanceEl.style.color = balance > 0 ? '#28a745' : '#dc3545';
                
                if (balance <= 0) {
                    statusEl.textContent = '⚠️ This account has no balance.';
                    statusEl.style.color = '#856404';
                } else if (isBernie) {
                    statusEl.textContent = '⚠️ Bernie funds cannot be redeemed for purchases. Use the Donate button in Creditors.';
                    statusEl.style.color = '#856404';
                } else {
                    statusEl.textContent = '✅ Balance available: $' + balance.toFixed(2) + '. Click Apply to use it.';
                    statusEl.style.color = '#28a745';
                }
            } else {
                infoDiv.style.display = 'block';
                statusEl.textContent = '❌ Not found. Check the code or name.';
                statusEl.style.color = '#dc3545';
                checkoutDebtorData = null;
            }
        } catch (error) {
            console.error('Error looking up debtor:', error);
            statusEl.textContent = '❌ Error: ' + error.message;
            statusEl.style.color = '#dc3545';
            checkoutDebtorData = null;
        }
    }

    // ========== APPLY DEBTOR TO CHECKOUT ==========

    async function applyDebtorToCheckout() {
        if (!checkoutDebtorData) {
            showCheckoutStatus('Please lookup a debtor first.', 'error');
            return;
        }
        
        var statusEl = document.getElementById('checkout-debtor-status');
        var balance = checkoutDebtorData.balance;
        
        if (balance <= 0) {
            statusEl.textContent = '⚠️ This account has no balance.';
            statusEl.style.color = '#856404';
            return;
        }
        
        if (checkoutRemaining <= 0.01) {
            statusEl.textContent = '⚠️ No remaining balance to pay.';
            statusEl.style.color = '#856404';
            return;
        }
        
        var amount = Math.min(balance, checkoutRemaining);
        
        try {
            var response = await fetch(window.AppConfig.baseUrl + '/api/debtor/redeem', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: checkoutDebtorData.debtor,
                    amount: amount,
                    description: 'Checkout redemption - ' + checkoutSelectedItems.length + ' items'
                })
            });
            
            var data = await response.json();
            
            if (data.status === 'success') {
                var method = checkoutDebtorData.is_gift_card ? 'Gift Card' : 'Store Credit';
                addPaymentEntry(method + ' (' + checkoutDebtorData.debtor + ')', amount);
                
                checkoutDebtorData.balance -= amount;
                document.getElementById('checkout-debtor-balance').textContent = checkoutDebtorData.balance.toFixed(2);
                
                if (checkoutDebtorData.balance <= 0.01) {
                    statusEl.textContent = '✅ Applied $' + amount.toFixed(2) + ' from ' + checkoutDebtorData.debtor + '. Card is now empty.';
                    statusEl.style.color = '#28a745';
                    setTimeout(function() {
                        document.getElementById('checkout-debtor-info').style.display = 'none';
                    }, 2000);
                } else {
                    statusEl.textContent = '✅ Applied $' + amount.toFixed(2) + ' from ' + checkoutDebtorData.debtor + '. Remaining balance: $' + checkoutDebtorData.balance.toFixed(2);
                    statusEl.style.color = '#28a745';
                }
                
                if (checkoutRemaining <= 0.01) {
                    updateCheckoutCompleteButton();
                }
                
            } else {
                statusEl.textContent = '❌ ' + (data.error || 'Failed to redeem');
                statusEl.style.color = '#dc3545';
            }
        } catch (error) {
            console.error('Error redeeming debtor:', error);
            statusEl.textContent = '❌ Error: ' + error.message;
            statusEl.style.color = '#dc3545';
        }
    }

    // ========== Complete Action Handler ==========
    function handleCompleteAction() {
        var mode = currentSearchMode;
        console.log('🔵 handleCompleteAction called for mode: ' + mode);
        
        if (mode === 'add') {
            console.log('🔵 Add mode - showing info');
            showStatus('Use Print button.', 'info');
        } else if (mode === 'scan') {
            console.log('🔵 Scan mode - applying location');
            applyScanLocation();
        } else if (mode === 'discogs') {
            console.log('🔵 Discogs mode - showing post modal');
            showDiscogsPostModal();
        } else if (mode === 'delete') {
            console.log('🔵 Delete mode - deleting selected');
            deleteSelected();
        } else if (mode === 'checkout') {
            console.log('🔵 Checkout mode - showing checkout modal');
            if (checkoutSelectedItems.length === 0) {
                showStatus('No items in checkout.', 'warning');
                return;
            }
            showCheckoutModal();
        } else if (mode === 'discogs_orders') {
            console.log('🔵 Discogs Orders mode - processing order');
            processDiscogsOrder();
        } else if (mode === 'refund') {
            console.log('🔵 Refund mode - processing refund');
            processRefund();
        } else {
            console.log('🔵 Unknown mode: ' + mode);
            showStatus('No action available for this mode', 'warning');
        }
    }

    // ========== NEW: Apply Scan Location ==========
    async function applyScanLocation() {
        var records = filteredRecords;
        if (records.length === 0) {
            showStatus('No scanned records to process.', 'warning');
            return;
        }

        if (!scanSession.is_ready) {
            showStatus('⚠️ Please select genre, format, area, and sublocation first', 'warning');
            return;
        }

        var recordIds = records.map(function(r) { return r.id; });
        var startIndex = scanSession.location_index - records.length;

        try {
            var result = await apiRequest('POST', '/api/scan/apply-location', {
                record_ids: recordIds,
                genre_id: scanSession.genre_id,
                format_id: scanSession.format_id,
                area_id: scanSession.area_id,
                sublocation_id: scanSession.sublocation_id,
                location_index_start: startIndex > 0 ? startIndex : 1
            });

            if (result.status === 'success') {
                showStatus('✅ Applied location to ' + result.updated_count + ' records', 'success');
                playSound('success');
                
                filteredRecords = [];
                totalRecords = 0;
                currentPage = 1;
                renderPagination();
                renderTablePage();
                updateSelectionCount();
                
                scanSession.location_index = 1;
                updateScanPreview();
            } else {
                showStatus('❌ ' + (result.error || 'Failed to apply location'), 'error');
                playSound('error');
            }
        } catch (error) {
            showStatus('❌ Error: ' + error.message, 'error');
            playSound('error');
        }
    }

    // ========== Pagination ==========
    function renderPagination() {
        var paginationEl = document.querySelector('.pagination');
        if (paginationEl) paginationEl.style.display = 'flex';
        var totalPages = Math.ceil(totalRecords / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        var start = (currentPage - 1) * pageSize + 1;
        var end = Math.min(currentPage * pageSize, totalRecords);
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

    // ========== Unified Selection Logic ==========
    function getSelectedRecords() {
        if (currentSearchMode === 'checkout') {
            return checkoutSelectedItems.slice();
        }
        if (rangeFromIndex === null || rangeToIndex === null) {
            console.log('🔍 getSelectedRecords: no range selected');
            return [];
        }
        var start = Math.min(rangeFromIndex, rangeToIndex);
        var end = Math.max(rangeFromIndex, rangeToIndex);
        var data = getCurrentData();
        var selected = data.slice(start, end + 1);
        console.log('🔍 getSelectedRecords: start=' + start + ', end=' + end + ', selected=' + selected.length);
        return selected;
    }

    function updateSelectionCount() {
        var selected = getSelectedRecords();
        var count = selected.length;
        selectedCountSpan.textContent = count;

        var mode = currentSearchMode;
        var hasRecords = filteredRecords.length > 0;
        var hasSelection = (rangeFromIndex !== null && rangeToIndex !== null && count > 0);

        var isAddMode = mode === 'add';
        var isRefundMode = mode === 'refund';
        
        if (isAddMode) {
            var hasTargets = hasSelection || hasRecords;
            printBtn.disabled = !hasTargets;
            if (hasSelection) {
                printBtn.textContent = '🖨️ Print (' + count + ' selected)';
            } else {
                printBtn.textContent = '🖨️ Print (all)';
            }
            printBtn.style.display = '';
        } else {
            printBtn.style.display = 'none';
        }

        if (completeActionBtn && mode !== 'add') {
            if (mode === 'scan') {
                completeActionBtn.disabled = !(scanSession.is_ready && hasRecords);
            } else if (mode === 'discogs') {
                completeActionBtn.disabled = !hasSelection;
            } else if (mode === 'delete') {
                completeActionBtn.disabled = !hasSelection;
            } else if (mode === 'checkout') {
                completeActionBtn.disabled = checkoutSelectedItems.length === 0;
                console.log('🔘 updateSelectionCount: checkout mode, disabled=' + completeActionBtn.disabled + ', items=' + checkoutSelectedItems.length);
            } else if (mode === 'discogs_orders') {
                var hasOrder = selectedOrderId !== null;
                var hasItems = filteredRecords.length > 0;
                completeActionBtn.disabled = !(hasOrder && hasItems);
            } else if (mode === 'refund') {
                completeActionBtn.disabled = !hasSelection;
            }
        }

        cancelRangeBtn.style.display = (rangeFromIndex !== null && rangeToIndex !== null) ? 'inline-block' : 'none';
    }

    function applyFilters() {
        if (currentSearchMode === 'scan' || currentSearchMode === 'discogs' || currentSearchMode === 'delete' || currentSearchMode === 'checkout' || currentSearchMode === 'discogs_orders' || currentSearchMode === 'refund') {
            return;
        }
        if (currentMode === 'search') {
            filteredRecords = currentResults.slice();
        } else {
            filteredRecords = allRecords.slice();
        }
        totalRecords = filteredRecords.length;
        var totalPages = Math.ceil(totalRecords / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        renderPagination();
        renderTablePage();
    }

    // ========== PDF Generation ==========
    async function generatePDF(records) {
        if (!records.length) { 
            console.log('📄 generatePDF: no records to print');
            return; 
        }
        console.log('📄 generatePDF: generating PDF for ' + records.length + ' records');
        var jsPDF = window.jspdf.jsPDF;

        var labelWidthMM = parseFloat((await apiRequest('GET', '/config/LABEL_WIDTH_MM')).config_value);
        var labelHeightMM = parseFloat((await apiRequest('GET', '/config/LABEL_HEIGHT_MM')).config_value);
        var leftMarginMM = parseFloat((await apiRequest('GET', '/config/LEFT_MARGIN_MM')).config_value);
        var gutterSpacingMM = parseFloat((await apiRequest('GET', '/config/GUTTER_SPACING_MM')).config_value);
        var topMarginMM = parseFloat((await apiRequest('GET', '/config/TOP_MARGIN_MM')).config_value);
        var priceFontSize = parseInt((await apiRequest('GET', '/config/PRICE_FONT_SIZE')).config_value);
        var textFontSize = parseInt((await apiRequest('GET', '/config/TEXT_FONT_SIZE')).config_value);
        var barcodeHeightMM = parseFloat((await apiRequest('GET', '/config/BARCODE_HEIGHT')).config_value);
        var printBorders = (await apiRequest('GET', '/config/PRINT_BORDERS')).config_value === 'true';
        var priceYPosMM = parseFloat((await apiRequest('GET', '/config/PRICE_Y_POS')).config_value);
        var barcodeYPosMM = parseFloat((await apiRequest('GET', '/config/BARCODE_Y_POS')).config_value);
        var infoYPosMM = parseFloat((await apiRequest('GET', '/config/INFO_Y_POS')).config_value);

        var mmToPt = 2.83465;
        var labelWidthPt = labelWidthMM * mmToPt;
        var labelHeightPt = labelHeightMM * mmToPt;
        var leftMarginPt = leftMarginMM * mmToPt;
        var gutterSpacingPt = gutterSpacingMM * mmToPt;
        var topMarginPt = topMarginMM * mmToPt;
        var barcodeHeightPt = barcodeHeightMM * mmToPt;

        var doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
        var rows = 15, cols = 4, labelsPerPage = rows * cols;
        var currentLabel = 0, pageNumber = 0;

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var pageIndex = currentLabel % labelsPerPage;
            var pageNum = Math.floor(currentLabel / labelsPerPage);
            if (pageNum > pageNumber) { doc.addPage(); pageNumber = pageNum; }

            var row = Math.floor(pageIndex / cols);
            var col = pageIndex % cols;
            var x = leftMarginPt + col * (labelWidthPt + gutterSpacingPt);
            var y = topMarginPt + row * labelHeightPt;

            if (printBorders) {
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.rect(x, y, labelWidthPt, labelHeightPt);
            }

            var genre = (record.discogs_genre_raw || '').split(',')[0].trim();
            var consignor = record.consignor_id && consignorMap[record.consignor_id] ? consignorMap[record.consignor_id].initials : '';
            var infoText = record.artist || 'Unknown';
            if (genre) infoText = genre + ' | ' + infoText;
            if (consignor) infoText += ' (' + consignor + ')';

            doc.setFontSize(textFontSize);
            doc.setFont('helvetica', 'normal');
            var displayText = infoText;
            var maxWidth = labelWidthPt - 10;
            if (doc.getTextWidth(displayText) > maxWidth) {
                while (doc.getTextWidth(displayText + '…') > maxWidth && displayText.length > 0) displayText = displayText.slice(0, -1);
                displayText += '…';
            }
            var infoWidth = doc.getTextWidth(displayText);
            doc.text(displayText, x + (labelWidthPt - infoWidth)/2, y + infoYPosMM * mmToPt);

            var priceText = '$' + (record.store_price || 0).toFixed(2);
            doc.setFontSize(priceFontSize);
            doc.setFont('helvetica', 'bold');
            var priceWidth = doc.getTextWidth(priceText);
            doc.text(priceText, x + (labelWidthPt - priceWidth)/2, y + priceYPosMM * mmToPt);

            var barcodeNum = record.barcode || record.id;
            if (barcodeNum) {
                var canvas = document.createElement('canvas');
                JsBarcode(canvas, barcodeNum.toString(), { format: 'CODE128', displayValue: false, height: 30, width: 2, margin: 0 });
                var barcodeData = canvas.toDataURL('image/png');
                var barcodeWidth = 40;
                doc.addImage(barcodeData, 'PNG', x + (labelWidthPt - barcodeWidth)/2, y + barcodeYPosMM * mmToPt, barcodeWidth, barcodeHeightPt);
            }
            currentLabel++;
        }

        var pdfBlob = doc.output('blob');
        var pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
        console.log('📄 generatePDF: PDF generated with ' + records.length + ' labels');
        showStatus('PDF generated with ' + records.length + ' labels', 'success');
    }

    // ========== MODE CHANGE ==========
    function onModeChange() {
        var newMode = searchModeSelect.value;
        currentSearchMode = newMode;
        console.log('🔄 onModeChange: switching to ' + newMode);

        cancelRangeSelection();

        setActiveMode(newMode);

        if (newMode !== 'add') {
            if (selectedPurchaseId) {
                clearPurchaseSelection();
            }
            if (metadataPanel) metadataPanel.style.display = 'none';
        }

        if (newMode === 'add') {
            currentMode = 'inventory';
            currentResults = [];
            populateDefaultParamSelects();
            loadPurchasesTable();
            if (!selectedPurchaseId) {
                clearPurchaseSelection();
            }
            loadAllDomainData();
        } else if (newMode === 'scan') {
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('📍 Scan mode: Select location components, then scan barcodes.', 'info');
            resetScanSession();
            loadAllDomainData();
        } else if (newMode === 'discogs') {
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showDiscogsStatus('Showing all records. Use filters to narrow down.', 'info');
            console.log('🔄 onModeChange: loading discogs records');
            loadRecords({ showAllStatuses: true, mode: 'discogs' });
            loadDiscogsLocations();
            var rulesContent = document.getElementById('markup-rules-content');
            if (rulesContent && rulesContent.style.display === 'block') {
                loadMarkupRules();
            }
            var chartsContent = document.getElementById('markup-charts-content');
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
            allRecords = [];
            loadRecords({ statusIds: [1,2], mode: 'delete' }).then(function() {
                renderTablePage();
            });
        } else if (newMode === 'refund') {
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Refund mode: Search sold records (status 3 or 4) to refund.', 'info');
            allRecords = [];
            loadRecords({ statusIds: [3, 4], mode: 'refund' });
        } else if (newMode === 'checkout') {
            checkoutSelectedItems = [];
            checkoutViewMode = 'list';
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Checkout mode: Search to add records, or use "Custom Item".', 'info');
            console.log('🔄 onModeChange: loading records for checkout');
            loadRecords({ statusIds: [2], mode: 'checkout' }).then(function() {
                checkoutViewMode = 'list';
                filteredRecords = checkoutSelectedItems.slice();
                totalRecords = filteredRecords.length;
                currentPage = 1;
                renderPagination();
                renderTablePage();
                updateSelectionCount();
                console.log('🔄 Checkout loaded: ' + checkoutSelectedItems.length + ' items');
            });
            if (checkoutShowSelectedBtn) {
                checkoutShowSelectedBtn.style.display = 'inline-block';
                checkoutShowSelectedBtn.textContent = 'Checkout List (0)';
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
            
            var dateFrom = document.getElementById('discogs-orders-date-from');
            var dateTo = document.getElementById('discogs-orders-date-to');
            if (dateFrom && !dateFrom.value) {
                var thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                dateFrom.value = thirtyDaysAgo.toISOString().split('T')[0];
            }
            if (dateTo && !dateTo.value) {
                dateTo.value = new Date().toISOString().split('T')[0];
            }
            
            var search = document.getElementById('discogs-orders-search');
            if (search) {
                search.value = '';
            }
            
            var statusFilter = document.getElementById('discogs-orders-status-filter');
            if (statusFilter) {
                statusFilter.value = 'Payment Received';
            }
            
            applyDiscogsOrdersFilters();
            
            if (discogsOrderSelect) {
                discogsOrderSelect.value = '';
            }
            selectedOrderId = null;
            currentOrderItems = [];
        }

        updateSelectionCount();
        renderTablePage();
    }

    function initializeLastSeenDate() {
        if (lastSeenCutoffDateInput) {
            lastSeenCutoffDateInput.value = '';
            lastSeenCutoffDate = null;
        }
    }

    // ========== Init ==========
    async function init() {
        console.log('🔄 inventory-ops: Initializing...');

        if (_initialized) {
            console.log('🔄 inventory-ops: Already initialized, skipping duplicate init');
            return;
        }

        console.log('📥 Loading minimum price...');
        await loadMinimumPrice();
        console.log('📥 Loading store price multiplier...');
        await loadStorePriceMultiplier();
        console.log('📥 Loading conditions...');
        await loadConditions();
        console.log('📥 Loading consignors...');
        await loadConsignors();
        console.log('📥 Loading accounts...');
        await loadAccounts();
        console.log('📥 Loading stats...');
        await loadStats();
        console.log('📥 Loading domain data...');
        await loadAllDomainData();

        console.log('📥 Populating default param selects...');
        populateDefaultParamSelects();

        // Set up scan dropdown event listeners
        if (scanGenreSelect) scanGenreSelect.addEventListener('change', onScanSelectionChange);
        if (scanFormatSelect) scanFormatSelect.addEventListener('change', onScanSelectionChange);
        if (scanAreaSelect) scanAreaSelect.addEventListener('change', onScanSelectionChange);
        if (scanSublocationSelect) scanSublocationSelect.addEventListener('change', onScanSelectionChange);

        // Set up scan input
        if (scanInput) {
            scanInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var term = this.value.trim();
                    if (term) {
                        performScanSearch(term);
                    }
                }
            });
        }

        if (scanSubmitBtn) {
            scanSubmitBtn.addEventListener('click', function() {
                var term = scanInput ? scanInput.value.trim() : '';
                if (term) {
                    performScanSearch(term);
                }
            });
        }

        // Set up filter buttons
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', applyFilters);
        }
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', clearFilters);
        }

        // Set up domain management buttons
        if (addGenreBtn) {
            addGenreBtn.addEventListener('click', window.addGenre);
        }
        if (addFormatBtn) {
            addFormatBtn.addEventListener('click', window.addFormat);
        }
        if (addAreaBtn) {
            addAreaBtn.addEventListener('click', window.addArea);
        }
        if (addSublocationBtn) {
            addSublocationBtn.addEventListener('click', window.addSublocation);
        }

        // Area filter for sublocations
        if (sublocationAreaFilter) {
            sublocationAreaFilter.addEventListener('change', function() {
                renderSublocationsList();
            });
        }

        // New sublocation area dropdown
        if (newSublocationArea) {
            areas.forEach(function(a) {
                var opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.name;
                newSublocationArea.appendChild(opt);
            });
        }

        // Filter area change - update sublocation dropdown
        if (filterArea) {
            filterArea.addEventListener('change', function() {
                populateFilterDropdowns();
            });
        }

        searchModeSelect.addEventListener('change', onModeChange);

        var searchButton = document.getElementById('searchButton');
        if (!searchButton) {
            searchButton = document.createElement('button');
            searchButton.id = 'searchButton';
            searchButton.type = 'button';
            searchButton.className = 'btn btn-primary';
            searchButton.innerHTML = '<i class="fas fa-search"></i> Search';
            searchButton.style.marginLeft = '8px';
            var parent = searchInput.parentNode;
            if (parent) {
                parent.insertBefore(searchButton, clearSearchBtn);
                console.log('✅ Search button created and inserted.');
            } else {
                console.error('❌ Could not find parent for searchInput.');
            }
        }

        searchButton.addEventListener('click', function() {
            var term = searchInput.value.trim();
            performSearch(term);
        });

        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var term = this.value.trim();
                performSearch(term);
            }
        });

        clearSearchBtn.addEventListener('click', clearSearch);

        pageSizeSelect.addEventListener('change', function() {
            pageSize = parseInt(this.value);
            currentPage = 1;
            applyFilters();
        });
        currentPageInput.addEventListener('change', function() {
            var page = parseInt(this.value);
            var totalPages = Math.ceil(totalRecords / pageSize) || 1;
            if (isNaN(page) || page < 1) page = 1;
            if (page > totalPages) page = totalPages;
            currentPage = page;
            renderPagination();
            renderTablePage();
        });
        firstPageBtn.addEventListener('click', function() { currentPage = 1; renderPagination(); renderTablePage(); });
        prevPageBtn.addEventListener('click', function() { if (currentPage > 1) { currentPage--; renderPagination(); renderTablePage(); } });
        nextPageBtn.addEventListener('click', function() { var totalPages = Math.ceil(totalRecords / pageSize) || 1; if (currentPage < totalPages) { currentPage++; renderPagination(); renderTablePage(); } });
        lastPageBtn.addEventListener('click', function() { var totalPages = Math.ceil(totalRecords / pageSize) || 1; currentPage = totalPages; renderPagination(); renderTablePage(); });

        printBtn.addEventListener('click', printPriceTags);

        var oldGlobalBtn = document.getElementById('global-set-active-btn');
        if (oldGlobalBtn) oldGlobalBtn.remove();

        completeActionBtn.addEventListener('click', handleCompleteAction);
        console.log('🔘 completeActionBtn click handler attached in init');

        await loadPurchasesTable();

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

        var checkoutStatusFilter = document.getElementById('checkout-status-filter');
        if (checkoutStatusFilter) {
            checkoutStatusFilter.addEventListener('change', function() {
                loadRecords({ statusIds: [2], mode: 'checkout' });
            });
        }

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
                var orderId = this.value;
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
                console.log('📦 Status filter changed to: ' + (ordersStatusFilter || 'all'));
                applyDiscogsOrdersFilters();
            });
        }

        currentSearchMode = searchModeSelect.value;
        onModeChange();

        _initialized = true;
        console.log('✅ inventory-ops.js initialized');
    }

    // ========== EXPOSE INIT FUNCTION FOR TABMANAGER ==========
    window.initAddRecordsTab = function() {
        console.log('🔵 TabManager called initAddRecordsTab');
        if (!_initialized) {
            init();
        } else {
            console.log('🔄 initAddRecordsTab: already initialized');
        }
    };

    window.initInventoryOpsTab = window.initAddRecordsTab;

    console.log('✅ initAddRecordsTab exposed to window');

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(function() {
            if (!_initialized) {
                console.log('🔄 Auto-initializing inventory-ops (fallback)');
                init();
            }
        }, 1000);
    }

    // ========== Expose all globals ==========
    window.refreshDiscogsLocations = loadDiscogsLocations;
    window.closeDiscogsPostModal = closeDiscogsPostModal;
    window.showDiscogsPostModal = showDiscogsPostModal;
    window.closeRefundModal = closeRefundModal;
    window.lookupDebtorForCheckout = lookupDebtorForCheckout;
    window.applyDebtorToCheckout = applyDebtorToCheckout;
    window.addPaymentEntry = addPaymentEntry;
    window.removeCheckoutEntry = removeCheckoutEntry;
    window.completeCheckout = completeCheckout;
    window.addToCheckout = addToCheckout;
    window.removeFromCheckout = removeFromCheckout;
    window.checkSquareAvailability = checkSquareAvailability;
    window.processSquarePayment = processSquarePayment;
    window.showCustomItemModal = showCustomItemModal;
    window.closeCustomItemModal = closeCustomItemModal;
    window.addBernieItem = addBernieItem;
    window.toggleInventorySetupPanel = toggleInventorySetupPanel;
    window.toggleDefaultParamsSub = toggleDefaultParamsSub;
    window.togglePurchaseSub = togglePurchaseSub;
    window.selectPurchase = selectPurchase;
    window.savePurchaseMetadata = savePurchaseMetadata;
    window.uploadBillForPurchase = uploadBillForPurchase;
    window.deletePurchase = deletePurchase;
    window.deleteSelectedPurchase = deleteSelectedPurchase;
    window.clearPurchaseSelection = clearPurchaseSelection;
    window.createNewPurchase = createNewPurchase;
    window.acceptDraft = acceptDraft;
    window.refreshPurchases = refreshPurchases;
    window.loadPurchasesTable = loadPurchasesTable;
    window.showCheckoutModal = showCheckoutModal;
    window.removeRecordFromPurchase = removeRecordFromPurchase;
    window.togglePurchaseTable = togglePurchaseTable;
    window.toggleMetadataPanel = toggleMetadataPanel;

    // Expose domain management functions
    window.addGenre = addGenre;
    window.deleteGenre = deleteGenre;
    window.addFormat = addFormat;
    window.deleteFormat = deleteFormat;
    window.addArea = addArea;
    window.deleteArea = deleteArea;
    window.addSublocation = addSublocation;
    window.deleteSublocation = deleteSublocation;

    window.applyDefaultParams = applyDefaultParams;
    window.clearDefaultParams = clearDefaultParams;

    console.log('✅ All functions exposed to window');
    console.log('✅ applyDefaultParams and clearDefaultParams are now globally available.');

})();