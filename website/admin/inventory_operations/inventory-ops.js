// ============================================================================
// inventory-ops.js - Unified Inventory Operations
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

    // ========== Current Purchase Display ==========
    const currentPurchaseDisplay = document.getElementById('current-purchase-display');
    const currentPurchaseName = document.getElementById('current-purchase-name');
    const currentPurchaseIdSpan = document.getElementById('current-purchase-id');

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
    let locations = [];
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

    let currentLocationRecords = [];
    let discogsFilteredRecords = [];
    let currentLocation = null;
    let lastSeenCutoffDate = null;

    let ordersList = [];
    let currentOrderItems = [];
    let selectedOrderId = null;
    let ordersStatusFilter = '';

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
        consignorId: null,
        formatId: null,
        purchaseId: null
    };
    let defaultParamsActive = false;

    let recentScans = [];
    const MAX_RECENT_SCANS = 10;
    let scanCounter = 0;
    let scanIndex = 0;
    let selectedLocationId = null;

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
        'discogs_orders': discogsOrdersModeContainer
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

    async function loadGenres() {
        console.log('📥 loadGenres: Fetching genres from server...');
        try {
            var data = await apiRequest('GET', '/api/genres');
            genres = data.genres || [];
            console.log('✅ Loaded ' + genres.length + ' genres from server:', genres);
        } catch (e) {
            console.warn('Could not load genres:', e);
            genres = [];
        }
    }

    async function loadFormats() {
        console.log('📥 loadFormats: Fetching formats from server...');
        try {
            var data = await apiRequest('GET', '/api/formats');
            formats = data.formats || [];
            console.log('✅ Loaded ' + formats.length + ' formats from server:', formats);
        } catch (e) {
            console.warn('Could not load formats:', e);
            formats = [];
        }
    }

    async function loadLocations() {
        console.log('📥 loadLocations: Fetching locations from server...');
        try {
            var data = await apiRequest('GET', '/api/locations');
            locations = data.locations || [];
            console.log('✅ Loaded ' + locations.length + ' locations from server:', locations);
            populateLocationDropdown(locations);
        } catch (e) {
            console.warn('Could not load locations:', e);
            locations = [];
        }
    }

    function populateLocationDropdown(locationsList) {
        console.log('📥 populateLocationDropdown called with:', locationsList);
        if (!scanLocationSelect) {
            console.warn('scanLocationSelect element not found');
            return;
        }
        
        var currentVal = scanLocationSelect.value;
        scanLocationSelect.innerHTML = '<option value="">-- Select Location --</option>';
        
        if (!locationsList || locationsList.length === 0) {
            console.warn('No locations to populate');
            return;
        }
        
        locationsList.forEach(function(loc) {
            var opt = document.createElement('option');
            opt.value = loc.id;
            opt.textContent = loc.name;
            scanLocationSelect.appendChild(opt);
        });
        
        if (currentVal) scanLocationSelect.value = currentVal;
        updateScanLocationPreview();
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
                if (params.formatId && defaultFormatSelect) {
                    defaultFormatSelect.value = params.formatId;
                }
                if (params.purchaseId && defaultPurchaseSelect) {
                    defaultPurchaseSelect.value = params.purchaseId;
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
        var formatId = defaultFormatSelect ? parseInt(defaultFormatSelect.value) : null;
        var purchaseId = defaultPurchaseSelect ? parseInt(defaultPurchaseSelect.value) : null;

        defaultParams = {
            sleeveConditionId: sleeveId || null,
            discConditionId: discId || null,
            price: price || null,
            consignorId: consignorId || null,
            formatId: formatId || null,
            purchaseId: purchaseId || null
        };
        defaultParamsActive = true;
        saveDefaultParamsToStorage();

        if (purchaseId) {
            selectPurchase(purchaseId);
        }

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
            var formatSelect = row.querySelector('.format-select');

            if (sleeveSelect && defaultParams.sleeveConditionId) sleeveSelect.value = defaultParams.sleeveConditionId;
            if (discSelect && defaultParams.discConditionId) discSelect.value = defaultParams.discConditionId;
            if (priceInput && defaultParams.price) priceInput.value = defaultParams.price;
            if (consignorSelect && defaultParams.consignorId) consignorSelect.value = defaultParams.consignorId;
            if (formatSelect && defaultParams.formatId) formatSelect.value = defaultParams.formatId;
        });

        updateDefaultParamsStatus('Defaults applied to ' + rows.length + ' search results', 'success');
        renderTablePage();
    }

    function clearDefaultParams() {
        defaultParams = {
            sleeveConditionId: null,
            discConditionId: null,
            price: null,
            consignorId: null,
            formatId: null,
            purchaseId: null
        };
        defaultParamsActive = false;
        if (defaultSleeveSelect) defaultSleeveSelect.value = '';
        if (defaultDiscSelect) defaultDiscSelect.value = '';
        if (defaultPriceInput) defaultPriceInput.value = '';
        if (defaultConsignorSelect) defaultConsignorSelect.value = '';
        if (defaultFormatSelect) defaultFormatSelect.value = '';
        if (defaultPurchaseSelect) defaultPurchaseSelect.value = '';
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
            consignorId: defaultParams.consignorId || null,
            formatId: defaultParams.formatId || null
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
        if (defaultFormatSelect) {
            var currentVal = defaultFormatSelect.value;
            defaultFormatSelect.innerHTML = '<option value="">Select...</option>';
            formats.forEach(function(f) {
                var opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.name;
                defaultFormatSelect.appendChild(opt);
            });
            if (currentVal) defaultFormatSelect.value = currentVal;
        }
        loadDefaultParamsFromStorage();
    }

    function populateDefaultPurchaseDropdown() {
        if (!defaultPurchaseSelect) return;
        var currentVal = defaultPurchaseSelect.value;
        defaultPurchaseSelect.innerHTML = '<option value="">Select a purchase...</option>';
        
        var purchaseRows = document.querySelectorAll('#purchases-body tr');
        if (purchaseRows.length === 0) {
            console.log('No purchase rows found, will populate after table loads');
            return;
        }
        
        purchaseRows.forEach(function(row) {
            var id = row.dataset.id;
            if (!id) return;
            var sellerName = row.querySelector('td:nth-child(2)')?.textContent || 'Unknown';
            var statusEl = row.querySelector('.status-badge');
            var status = statusEl ? statusEl.textContent : 'draft';
            var option = document.createElement('option');
            option.value = id;
            option.textContent = '#' + id + ' - ' + sellerName + ' (' + status + ')';
            defaultPurchaseSelect.appendChild(option);
        });
        
        if (currentVal) defaultPurchaseSelect.value = currentVal;
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
                batchId = null,
                locationId = null
            } = options;

            var url = '/records';
            var params = new URLSearchParams();

            if (locationId) {
                url = '/api/records/by-location';
                params.append('location_id', locationId);
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
                const isSelected = (p.id == selectedPurchaseId);
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

            if (selectedPurchaseId) {
                const row = purchasesBody.querySelector(`tr[data-id="${selectedPurchaseId}"]`);
                if (row) row.classList.add('record-selected');
                
                if (currentPurchaseDisplay) {
                    currentPurchaseDisplay.style.display = 'block';
                    const sellerName = row?.querySelector('td:nth-child(2)')?.textContent || 'Unknown';
                    if (currentPurchaseName) currentPurchaseName.textContent = sellerName;
                    if (currentPurchaseIdSpan) currentPurchaseIdSpan.textContent = '(#' + selectedPurchaseId + ')';
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
        console.log('📋 selectPurchase: ' + id);
        selectedPurchaseId = id;

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

        if (defaultPurchaseSelect) {
            defaultPurchaseSelect.value = id;
        }

        metadataExpanded = true;
        const metadataBody = document.getElementById('metadata-body');
        const metadataIcon = document.getElementById('metadata-toggle-icon');
        if (metadataBody) metadataBody.style.display = 'block';
        if (metadataIcon) metadataIcon.style.transform = 'rotate(0deg)';

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
                if (purchase.status === 'draft' && purchase.record_count > 0) {
                    acceptDraftBtn.style.display = 'inline-block';
                } else {
                    acceptDraftBtn.style.display = 'none';
                }
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
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + id, {
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
                if (currentPurchaseDisplay) currentPurchaseDisplay.style.display = 'none';
                filteredRecords = [];
                totalRecords = 0;
                currentPurchaseRecords = [];
                renderPagination();
                renderTablePage();
            }
            await loadPurchasesTable();
        } catch (error) {
            showStatus('Error deleting purchase: ' + error.message, 'error');
            console.error('Delete error:', error);
        }
    }

    function deleteSelectedPurchase() {
        const id = editPurchaseId ? editPurchaseId.value : null;
        if (id) deletePurchase(parseInt(id));
    }

    function clearPurchaseSelection() {
        selectedPurchaseId = null;
        if (metadataPanel) metadataPanel.style.display = 'none';
        if (currentPurchaseDisplay) currentPurchaseDisplay.style.display = 'none';
        if (defaultPurchaseSelect) defaultPurchaseSelect.value = '';
        loadPurchasesTable();
        filteredRecords = [];
        totalRecords = 0;
        currentPurchaseRecords = [];
        renderPagination();
        renderTablePage();
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
            console.log('📋 acceptDraft: sending PUT to /api/purchases/' + purchaseId);
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/' + purchaseId, {
                method: 'PUT',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const data = await response.json();
            console.log('📋 acceptDraft: response', data);

            if (data.status === 'success') {
                if (currentPurchaseRecords.length > 0) {
                    // Use the new LabelPrinter to generate price tags
                    if (window.LabelPrinter) {
                        await window.LabelPrinter.generatePriceTags(currentPurchaseRecords, {
                            title: 'Price Tags - Purchase #' + purchaseId
                        });
                    } else {
                        console.warn('LabelPrinter not loaded, cannot generate PDF');
                    }
                    showToast('📄 Price tags generated for ' + currentPurchaseRecords.length + ' records.', 'success');
                }

                showToast('✅ Draft accepted! Offer: $' + offerAmount.toFixed(2), 'success');
                playSound('success');

                if (signatureMethod) {
                    await sendBillToSquarePOS(purchase, offerAmount, currentPurchaseRecords);
                } else {
                    var billText = generateBillOfSale(purchase, offerAmount, currentPurchaseRecords);
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
                    draft_id: purchase.id,
                    seller_name: purchase.seller_name || '',
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

    function generateBillOfSale(purchase, offerAmount, records) {
        var now = new Date();
        var dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        var bill = 'PIGSTYLE MUSIC\n';
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

    // ========== Toggle Functions for Sub-Panels ==========

    function toggleInventorySetupPanel() {
        console.log('📋 toggleInventorySetupPanel called');
        var body = document.getElementById('inventory-setup-body');
        var icon = document.getElementById('inventory-setup-toggle-icon');
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
        console.log('📋 toggleDefaultParamsSub called');
        var body = document.getElementById('default-params-sub-body');
        var icon = document.getElementById('default-params-sub-toggle');
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

    function togglePurchaseSub() {
        console.log('📋 togglePurchaseSub called');
        var body = document.getElementById('purchase-sub-body');
        var icon = document.getElementById('purchase-sub-toggle');
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

    // ========== Discogs Locations ==========
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
                var condOptions = conditions.map(function(c) {
                    return '<option value="' + c.id + '">' + (c.display_name || c.condition_name) + '</option>';
                }).join('');
                var consignorOptions = consignors.map(function(c) {
                    return '<option value="' + c.id + '" ' + (c.id === selectedConsignorId ? 'selected' : '') + '>' + c.username + '</option>';
                }).join('');
                var formatOptions = formats.map(function(f) {
                    return '<option value="' + f.id + '">' + f.name + '</option>';
                }).join('');

                var hideSleeve = defaultParams.sleeveConditionId !== null && defaultParams.sleeveConditionId !== undefined;
                var hideDisc = defaultParams.discConditionId !== null && defaultParams.discConditionId !== undefined;
                var hidePrice = defaultParams.price !== null && defaultParams.price !== undefined;
                var hideConsignor = defaultParams.consignorId !== null && defaultParams.consignorId !== undefined;
                var hideFormat = defaultParams.formatId !== null && defaultParams.formatId !== undefined;

                theadHtml = '<tr><th style="width:60px;">Range</th><th style="width:60px;">Image</th><th>Artist</th><th>Title</th><th>Catalog #</th>';
                if (!hideSleeve) theadHtml += '<th>Sleeve</th>';
                if (!hideDisc) theadHtml += '<th>Disc</th>';
                if (!hidePrice) theadHtml += '<th>Price</th>';
                if (!hideConsignor) theadHtml += '<th>Consignor</th>';
                if (!hideFormat) theadHtml += '<th>Format</th>';
                theadHtml += '<th>Notes</th><th>Action</th></tr>';
            } else {
                if (selectedPurchaseId && currentPurchaseRecords.length > 0) {
                    theadHtml = '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Catalog #</th><th>Sleeve</th><th>Disc</th><th>Barcode</th><th>Created At</th><th>Action</th></tr>';
                } else {
                    theadHtml = '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Catalog #</th><th>Sleeve</th><th>Disc</th><th>Barcode</th><th>Created At</th></tr>';
                }
            }
        } else if (currentSearchMode === 'scan') {
            theadHtml = '<tr><th style="width:100px;">Range</th><th>ID</th><th>Artist</th><th>Title</th><th>Price</th><th>Barcode</th><th>Last Seen</th></tr>';
        } else if (currentSearchMode === 'discogs') {
            theadHtml = '<tr><th style="width:60px;">Range</th><th>Image</th><th>ID</th><th>Artist</th><th>Title</th><th>Catalog #</th><th>Media Cond</th><th>Sleeve Cond</th><th>Store Price</th><th>Discogs Price</th><th>Markup %</th><th>Location</th><th>Post</th></tr>';
        } else if (currentSearchMode === 'discogs_orders') {
            theadHtml = '<tr><th>#</th><th>Artist</th><th>Title</th><th>Catalog</th><th>Barcode</th><th>Price</th><th>Condition</th><th>PigStyle ID</th><th>Status</th><th>Action</th></tr>';
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
            if (currentSearchMode === 'scan') msg = 'Select a location and scan barcodes to add records.';
            if (currentSearchMode === 'discogs') msg = 'No records found. Check filters or add records in "Add Record" mode.';
            if (currentSearchMode === 'discogs_orders') {
                if (ordersList.length === 0) msg = 'No Discogs orders found. Click Refresh Orders.';
                else if (!selectedOrderId) msg = 'Select an order from the dropdown.';
                else msg = 'This order has no items.';
            }
            var colCount = currentSearchMode === 'discogs_orders' ? 10 :
                             (currentSearchMode === 'add' ? (currentMode === 'search' ? 12 : (selectedPurchaseId ? 11 : 10)) :
                             (currentSearchMode === 'scan' ? 7 :
                             (currentSearchMode === 'discogs' ? 13 : 7)));
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
                    
                    var hideSleeve = defaultParams.sleeveConditionId !== null && defaultParams.sleeveConditionId !== undefined;
                    var hideDisc = defaultParams.discConditionId !== null && defaultParams.discConditionId !== undefined;
                    var hidePrice = defaultParams.price !== null && defaultParams.price !== undefined;
                    var hideConsignor = defaultParams.consignorId !== null && defaultParams.consignorId !== undefined;
                    var hideFormat = defaultParams.formatId !== null && defaultParams.formatId !== undefined;

                    var imageUrl = record.image_url || record.thumb || '';
                    var imageHtml = imageUrl ?
                        '<img src="' + escapeHtml(imageUrl) + '" style="width:80px; height:80px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="expandImage(\'' + escapeHtml(imageUrl) + '\', \'' + escapeHtml(artist) + ' - ' + escapeHtml(title) + '\')" title="Click to expand">' :
                        '<div style="width:80px; height:80px; background:#eee; border-radius:4px;"></div>';

                    rowHtml += '<td style="text-align:center; white-space:nowrap;">' + rangeButtons + '</td>';
                    rowHtml += '<td style="text-align:center;">' + imageHtml + '</td>';
                    rowHtml += '<td>' + escapeHtml(artist) + '</td>';
                    rowHtml += '<td>' + escapeHtml(title) + '</td>';
                    rowHtml += '<td>' + escapeHtml(catalog) + '</td>';
                    
                    if (!hideSleeve) {
                        rowHtml += '<td><select class="sleeve-condition-select" style="width:100px; padding:4px;"><option value="">Select...</option>' + condOptions + '</select></td>';
                    }

                    if (!hideDisc) {
                        rowHtml += '<td><select class="disc-condition-select" style="width:100px; padding:4px;"><option value="">Select...</option>' + condOptions + '</select></td>';
                    }

                    if (!hidePrice) {
                        rowHtml += '<td><input type="number" class="price-input" step="1" min="' + (minimumPrice !== null ? minimumPrice : 0) + '" value="" style="width:80px; padding:4px;"></td>';
                    }

                    if (!hideConsignor) {
                        rowHtml += '<td><select class="consignor-select" style="width:100px; padding:4px;"><option value="">None</option>' + consignorOptions + '</select></td>';
                    }

                    if (!hideFormat) {
                        rowHtml += '<td><select class="format-select" style="width:100px; padding:4px;"><option value="">Select...</option>' + formatOptions + '</select></td>';
                    }

                    rowHtml += '<td><input type="text" class="notes-input" placeholder="Optional note..." style="width:120px; padding:4px; font-size:12px;"></td>';
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
                    var locationName = record.location_name || '—';
                    rowHtml += '<td style="text-align:center; white-space:nowrap;">' + rangeButtons + '</td>';
                    rowHtml += '<td>' + id + '</td>';
                    rowHtml += '<td>' + escapeHtml(artist) + '</td>';
                    rowHtml += '<td>' + escapeHtml(title) + '</td>';
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

    // ========== Scan Location Functions ==========
    function updateScanLocationPreview() {
        var locationId = scanLocationSelect ? parseInt(scanLocationSelect.value) : null;
        var locationName = locationId ? locations.find(function(l) { return l.id === locationId; })?.name : '';

        if (scanLocationDisplay) {
            scanLocationDisplay.textContent = locationName || '-- Please select a location --';
        }

        if (scanIndexDisplay) {
            scanIndexDisplay.textContent = '📍 Index: ' + scanIndex;
        }

        var allSelected = locationId;
        if (scanInput) scanInput.disabled = !allSelected;
        if (scanSubmitBtn) scanSubmitBtn.disabled = !allSelected;
    }

    function onScanSelectionChange() {
        updateScanLocationPreview();
    }

    function updateScanCounter() {
        if (document.getElementById('scan-counter-display')) {
            document.getElementById('scan-counter-display').textContent = scanCounter || filteredRecords.length;
        }
    }

    function resetScanCounter() {
        scanCounter = 0;
        scanIndex = 0;
        updateScanCounter();
        if (scanIndexDisplay) {
            scanIndexDisplay.textContent = '📍 Index: 0';
        }
        updateScanLocationPreview();
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
        var formatSelect = row.querySelector('.format-select');
        var notesInput = row.querySelector('.notes-input');

        var price = null;
        var consignorId = null;
        var sleeveId = null;
        var discId = null;
        var formatId = null;
        var notes = notesInput ? notesInput.value.trim() : '';

        if (defaultParamsActive) {
            sleeveId = defaultParams.sleeveConditionId;
            discId = defaultParams.discConditionId;
            price = defaultParams.price;
            consignorId = defaultParams.consignorId;
            formatId = defaultParams.formatId;
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
        if (formatSelect && formatSelect.value) {
            var val = parseInt(formatSelect.value);
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
            batch_id: selectedPurchaseId,
            format_id: formatId
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
        } else if (mode === 'discogs') {
            performDiscogsFilterSearch(term);
            return;
        } else if (mode === 'discogs_orders') {
            performDiscogsOrdersSearch(term);
            return;
        }

        showStatus('No search available for this mode', 'info');
    }

    // ========== SCAN MODE with Duplicate Scoring ==========
    function getArtistSortKey(artistName) {
        if (!artistName) return '';
        var name = artistName.trim();
        name = name.replace(/^the\s+/i, '');
        var numberMap = {
            '10,000': 'ten thousand',
            '10000': 'ten thousand',
            '1000': 'one thousand',
            '100': 'one hundred'
        };
        var numberMatch = name.match(/^(\d{1,5}(?:,\d{3})?)\s+/);
        if (numberMatch) {
            var numberStr = numberMatch[1];
            if (numberMap[numberStr]) {
                name = numberMap[numberStr] + ' ' + name.substring(numberMatch[0].length);
            }
        }
        return name.charAt(0).toUpperCase();
    }

    function calculateMatchScore(record, recentScansList) {
        if (!recentScansList || recentScansList.length === 0) return 0;
        var recordSortKey = getArtistSortKey(record.artist);
        var score = 0;
        for (var i = 0; i < recentScansList.length; i++) {
            var recent = recentScansList[i];
            var weight = Math.pow(0.5, i);
            if (recent.sortKey === recordSortKey) {
                score += 100 * weight;
            }
            var recentArtistLower = recent.artist.toLowerCase();
            var recordArtistLower = record.artist.toLowerCase();
            var recentFirstWord = recentArtistLower.replace(/^the\s+/, '').split(' ')[0];
            var recordFirstWord = recordArtistLower.replace(/^the\s+/, '').split(' ')[0];
            if (recentFirstWord === recordFirstWord && recentFirstWord.length > 2) {
                score += 30 * weight;
            }
        }
        if (record.status_id === 2) {
            score += 50;
        }
        if (record.status_id === 3) {
            score -= 100;
        }
        return score;
    }

    function addToRecentScans(record, locationString) {
        if (recentScans.length > 0 && recentScans[0].record.id === record.id) {
            return;
        }
        recentScans.unshift({
            record: record,
            location: locationString,
            timestamp: Date.now()
        });
        if (recentScans.length > MAX_RECENT_SCANS) {
            recentScans.pop();
        }
        try {
            var serialized = recentScans.map(function(s) {
                return {
                    recordId: s.record.id,
                    artist: s.record.artist,
                    location: s.location,
                    timestamp: s.timestamp
                };
            });
            localStorage.setItem('recentScans', JSON.stringify(serialized));
        } catch (e) {}
    }

    function loadRecentScansFromStorage() {
        try {
            var stored = localStorage.getItem('recentScans');
            if (stored) {
                var parsed = JSON.parse(stored);
                recentScans = parsed.map(function(item) {
                    return {
                        record: { id: item.recordId, artist: item.artist || 'Unknown' },
                        location: item.location,
                        timestamp: item.timestamp
                    };
                });
                console.log('📋 Loaded ' + recentScans.length + ' recent scans from storage');
            }
        } catch (e) {
            console.warn('Could not load recent scans from storage:', e);
        }
    }

    function updateRecentScansUI() {
        if (!recentScansList) return;
        
        if (recentScans.length === 0) {
            recentScansList.innerHTML = '<div class="no-recent-scans">No recent scans</div>';
            if (lastScanDisplay) lastScanDisplay.textContent = 'Last: --';
            return;
        }

        var html = '';
        recentScans.forEach(function(scan, index) {
            var isLast = index === 0;
            var record = scan.record;
            var artist = record.artist || 'Unknown';
            var title = record.title || 'Unknown';
            var location = scan.location || '—';
            var time = scan.timestamp ? new Date(scan.timestamp).toLocaleTimeString() : '';
            
            html += '<div class="recent-scan-item ' + (isLast ? 'recent-scan-last' : '') + '">';
            html += '<span class="scan-index-badge">#' + (index + 1) + '</span>';
            html += '<span class="scan-artist">' + escapeHtml(artist) + '</span>';
            html += '<span class="scan-title">' + escapeHtml(title) + '</span>';
            html += '<span class="scan-location">' + escapeHtml(location) + '</span>';
            if (time) {
                html += '<span class="scan-time">' + time + '</span>';
            }
            html += '</div>';
        });
        recentScansList.innerHTML = html;
        
        if (lastScanDisplay && recentScans.length > 0) {
            var last = recentScans[0];
            var artist = last.record.artist || 'Unknown';
            var title = last.record.title || 'Unknown';
            lastScanDisplay.textContent = 'Last: ' + escapeHtml(artist) + ' - ' + escapeHtml(title);
        }
    }

    async function performScanSearch(term) {
        var locationId = scanLocationSelect ? parseInt(scanLocationSelect.value) : null;
        var locationName = locationId ? locations.find(function(l) { return l.id === locationId; })?.name : '';

        if (!locationId || !locationName) {
            showStatus('Please select a location before scanning.', 'warning');
            playSound('error');
            return;
        }

        try {
            var data = await apiRequest('GET', '/records/search?q=' + encodeURIComponent(term));
            if (!data.records || !data.records.length) {
                playSound('error');
                showStatus('No record found with that barcode or ID', 'error');
                if (scanInput) scanInput.value = '';
                return;
            }

            var records = data.records;

            if (records.length === 1) {
                var record = records[0];
                await processScannedRecord(record);
                return;
            }

            var recentScansList = recentScans.map(function(s) {
                return {
                    artist: s.record.artist,
                    sortKey: getArtistSortKey(s.record.artist)
                };
            });

            var scored = records.map(function(record) {
                return {
                    record: record,
                    score: calculateMatchScore(record, recentScansList)
                };
            });

            scored.sort(function(a, b) { return b.score - a.score; });

            var best = scored[0];
            var secondBest = scored.length > 1 ? scored[1] : null;
            var bestScore = best.score;
            var secondScore = secondBest ? secondBest.score : 0;

            var HIGH_CONFIDENCE_SCORE = 100;
            var GAP_THRESHOLD = 40;
            var AUTO_SELECT_SCORE = 80;
            var AUTO_SELECT_GAP = 30;

            var selectedRecord = null;
            var confidence = 'low';

            if (bestScore > HIGH_CONFIDENCE_SCORE && (bestScore - secondScore) > GAP_THRESHOLD) {
                selectedRecord = best.record;
                confidence = 'high';
                console.log('🎯 High confidence auto-select: ' + selectedRecord.artist + ' - ' + selectedRecord.title + ' (score ' + bestScore + ')');
            } else if (bestScore > AUTO_SELECT_SCORE && (bestScore - secondScore) > AUTO_SELECT_GAP) {
                selectedRecord = best.record;
                confidence = 'medium';
                console.log('🎯 Medium confidence auto-select: ' + selectedRecord.artist + ' - ' + selectedRecord.title + ' (score ' + bestScore + ')');
            }

            if (selectedRecord) {
                playSound('success');
                showStatus('🎯 Auto-selected: ' + selectedRecord.artist + ' - ' + selectedRecord.title + ' (' + confidence + ' confidence)', 'success');
                await processScannedRecord(selectedRecord);
                return;
            }

            playSound('error');
            showStatus('⚠️ Multiple records (' + records.length + ') found for barcode. Confidence too low to auto-select. Please use a unique barcode or ID.', 'error');
            if (scanInput) scanInput.value = '';

        } catch (error) {
            playSound('error');
            showStatus('Error scanning: ' + error.message, 'error');
            console.error('Scan search error:', error);
            if (scanInput) scanInput.value = '';
        }
    }

    async function processScannedRecord(record) {
        var locationId = scanLocationSelect ? parseInt(scanLocationSelect.value) : null;
        var locationName = locationId ? locations.find(function(l) { return l.id === locationId; })?.name : '';

        // Check if record already exists in the scanned list
        var existing = filteredRecords.find(function(r) { return r.id === record.id; });
        
        var today = getLocalMSTDate();
        var index = scanIndex + 1;
        
        if (existing) {
            // Update existing record in database
            try {
                await apiRequest('PUT', '/records/' + record.id, {
                    location_id: locationId,
                    location_index: existing.location_index || index,
                    last_seen: today
                });
                existing.last_seen = today;
                existing.location_name = locationName;
                
                renderPagination();
                renderTablePage();
                playSound('success');
                showStatus('✅ Updated #' + record.id + ': ' + record.artist + ' - ' + record.title, 'success');
                if (scanInput) scanInput.value = '';
                addToRecentScans(record, locationName || record.location_name || '');
                updateRecentScansUI();
                return;
            } catch (error) {
                showStatus('Error updating record: ' + error.message, 'error');
                playSound('error');
                return;
            }
        }

        // New record - add to database with location
        try {
            await apiRequest('PUT', '/records/' + record.id, {
                location_id: locationId,
                location_index: index,
                last_seen: today
            });
            
            // Update the local record object
            record.location_id = locationId;
            record.location_index = index;
            record.last_seen = today;
            record.location_name = locationName;
            
            filteredRecords.unshift(record);
            totalRecords = filteredRecords.length;
            scanIndex = index;
            currentPage = 1;
            
            renderPagination();
            renderTablePage();
            playSound('success');
            showStatus('✅ Added #' + record.id + ': ' + record.artist + ' - ' + record.title, 'success');
            updateSelectionCount();
            if (scanInput) scanInput.value = '';
            addToRecentScans(record, locationName || '');
            updateScanCounter();
            updateRecentScansUI();
            updateScanLocationPreview();
            
        } catch (error) {
            showStatus('Error adding record: ' + error.message, 'error');
            playSound('error');
        }
    }

    // ========== Discogs search, etc. ==========
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
            // keep list
        } else if (currentSearchMode === 'discogs') {
            refreshDiscogsRecords();
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
            return r.status_id === 2 && !hasConsignor(r) && meetsLastSeenFilter(r) && r.created_at && r.location_id && r.location_id !== null;
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

    // ========== Print Price Tags ==========
    async function printPriceTags() {
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

        // Use the new LabelPrinter module
        if (window.LabelPrinter) {
            await window.LabelPrinter.generatePriceTags(records);
        } else {
            showStatus('LabelPrinter not loaded. Please refresh the page.', 'error');
            console.error('LabelPrinter not available');
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

        cancelRangeBtn.style.display = (rangeFromIndex !== null && rangeToIndex !== null) ? 'inline-block' : 'none';
    }

    function applyFilters() {
        if (currentSearchMode === 'scan' || currentSearchMode === 'discogs' || currentSearchMode === 'discogs_orders') {
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
        } else if (newMode === 'scan') {
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Scan mode: Select a location and scan barcodes to build the list.', 'info');
            resetScanCounter();
            loadLocations();
            updateScanLocationPreview();
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

    // ========== DOMAIN MANAGEMENT LOAD FUNCTIONS ==========

    async function loadDomainGenres() {
        try {
            var response = await fetch(window.AppConfig.baseUrl + '/api/genres', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            var data = await response.json();
            if (data.status === 'success') {
                genres = data.genres || [];
                renderDomainGenres(genres);
            }
        } catch (error) {
            console.error('Error loading genres:', error);
        }
    }

    function renderDomainGenres(genresList) {
        var container = document.getElementById('genres-list');
        if (!container) return;
        
        if (!genresList || genresList.length === 0) {
            container.innerHTML = '<div class="empty-message">No genres found.</div>';
            return;
        }
        
        var html = '<table class="domain-table"><thead><tr><th>ID</th><th>Name</th><th>Actions</th></tr></thead><tbody>';
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
            var response = await fetch(window.AppConfig.baseUrl + '/api/formats', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            var data = await response.json();
            if (data.status === 'success') {
                renderDomainFormats(data.formats || []);
            }
        } catch (error) {
            console.error('Error loading formats:', error);
        }
    }

    function renderDomainFormats(formatsList) {
        var container = document.getElementById('formats-list');
        if (!container) return;
        
        if (!formatsList || formatsList.length === 0) {
            container.innerHTML = '<div class="empty-message">No formats found.</div>';
            return;
        }
        
        var html = '<table class="domain-table"><thead><tr><th>ID</th><th>Name</th><th>Actions</th></tr></thead><tbody>';
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

    // ========== DOMAIN MANAGEMENT DELETE FUNCTIONS (REMOVED - no longer needed) ==========
    // These functions are kept for compatibility but do nothing

    async function deleteDomainGenre(id, name) {
        showStatus('Genre management is no longer available.', 'info');
    }

    async function deleteDomainFormat(id, name) {
        showStatus('Format management is no longer available.', 'info');
    }

    // ========== DOMAIN MANAGEMENT ADD HANDLERS ==========
    // Simplified - only handles formats now

    function setupDomainManagementHandlers() {
        // Add Format
        var domainAddFormatBtn = document.getElementById('add-format-btn');
        if (domainAddFormatBtn) {
            domainAddFormatBtn.addEventListener('click', async function() {
                var inputField = document.getElementById('new-format');
                if (!inputField) return;
                
                var formatName = inputField.value.trim();
                if (!formatName) {
                    showStatus('Please enter a format name.', 'warning');
                    inputField.focus();
                    return;
                }
                
                try {
                    var response = await fetch(window.AppConfig.baseUrl + '/api/formats', {
                        method: 'POST',
                        credentials: 'include',
                        headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: formatName })
                    });
                    
                    var data = await response.json();
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

        // Scan location select change
        if (scanLocationSelect) {
            scanLocationSelect.addEventListener('change', function() {
                updateScanLocationPreview();
            });
        }

        // Scan submit
        if (scanSubmitBtn) {
            scanSubmitBtn.addEventListener('click', function() {
                var term = scanInput ? scanInput.value.trim() : '';
                if (term) {
                    performScanSearch(term);
                }
            });
        }

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

        // Default params event listeners
        if (defaultFormatSelect) {
            defaultFormatSelect.addEventListener('change', function() {
                defaultParams.formatId = parseInt(this.value) || null;
                saveDefaultParamsToStorage();
                renderTablePage();
            });
        }

        if (defaultPurchaseSelect) {
            defaultPurchaseSelect.addEventListener('change', function() {
                var purchaseId = parseInt(this.value);
                if (purchaseId) {
                    defaultParams.purchaseId = purchaseId;
                    saveDefaultParamsToStorage();
                    selectPurchase(purchaseId);
                } else {
                    defaultParams.purchaseId = null;
                    saveDefaultParamsToStorage();
                    clearPurchaseSelection();
                }
            });
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
        console.log('📥 Loading genres...');
        await loadGenres();
        console.log('📥 Loading formats...');
        await loadFormats();
        console.log('📥 Loading locations...');
        await loadLocations();

        console.log('📥 Populating default param selects...');
        populateDefaultParamSelects();

        updateScanLocationPreview();
        loadRecentScansFromStorage();
        updateRecentScansUI();

        // Setup Domain Management handlers (simplified)
        setupDomainManagementHandlers();

        // Load Domain Management data
        loadDomainGenres();
        loadDomainFormats();

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

        // Load purchases table first
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

    // ========== BILL MODAL FUNCTIONS ==========

    function openBillModal() {
        var container = document.getElementById('bill-preview-container');
        if (!container) return;
        
        var billPath = container.dataset.billPath || '';
        var billType = container.dataset.billType || '';
        
        var modal = document.getElementById('bill-modal');
        var modalImg = document.getElementById('bill-modal-image');
        var modalPlaceholder = document.getElementById('bill-modal-placeholder');
        var modalPdf = document.getElementById('bill-modal-pdf');
        var modalPdfIframe = document.getElementById('bill-modal-pdf-iframe');
        var modalFilename = document.getElementById('bill-modal-filename');
        var downloadLink = document.getElementById('bill-modal-download');
        
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
        
        var filename = billPath.split('/').pop();
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
        var modal = document.getElementById('bill-modal');
        if (modal) {
            modal.style.display = 'none';
            var iframe = document.getElementById('bill-modal-pdf-iframe');
            if (iframe) {
                iframe.src = '';
            }
        }
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeBillModal();
        }
    });

    document.addEventListener('click', function(e) {
        var modal = document.getElementById('bill-modal');
        if (modal && e.target === modal) {
            closeBillModal();
        }
    });

    window.openBillModal = openBillModal;
    window.closeBillModal = closeBillModal;

    // ========== Expose all globals ==========
    window.refreshDiscogsLocations = loadDiscogsLocations;
    window.closeDiscogsPostModal = closeDiscogsPostModal;
    window.showDiscogsPostModal = showDiscogsPostModal;
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
    window.removeRecordFromPurchase = removeRecordFromPurchase;
    window.togglePurchaseTable = togglePurchaseTable;
    window.toggleMetadataPanel = toggleMetadataPanel;

    window.loadDomainGenres = loadDomainGenres;
    window.loadDomainFormats = loadDomainFormats;
    window.deleteDomainGenre = deleteDomainGenre;
    window.deleteDomainFormat = deleteDomainFormat;

    window.applyDefaultParams = applyDefaultParams;
    window.clearDefaultParams = clearDefaultParams;

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

    console.log('✅ All functions exposed to window');
    console.log('✅ applyDefaultParams and clearDefaultParams are now globally available.');

})();