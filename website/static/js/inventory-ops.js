// ============================================================================
// inventory-ops.js - Unified Inventory Operations (Refactored)
// Modes: Add Record, Scan/Locate, Post to Discogs, Delete, Checkout, Discogs Orders, Refund
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
    const setActiveBtn = document.getElementById('set-active-btn');
    const cancelRangeBtn = document.getElementById('cancel-range-btn');

    // ========== Mode Control Panels ==========
    const paramsPurchasePanel = document.getElementById('params-purchase-panel');
    const scanLocationBuilder = document.getElementById('scan-location-builder');
    const filterGroup = document.getElementById('filter-group');
    const discogsFilters = document.getElementById('discogs-filters');
    const discogsMarkupUi = document.getElementById('discogs-markup-ui');
    const deleteFilters = document.getElementById('delete-filters');
    const checkoutFilters = document.getElementById('checkout-filters');
    const discogsOrdersFilters = document.getElementById('discogs-orders-filters');

    // ========== Draft Purchase Panel Elements ==========
    const draftPanelBody = document.getElementById('params-purchase-body');
    const draftToggleIcon = document.getElementById('params-purchase-toggle-icon');
    const draftFormSection = document.getElementById('draft-form-section');
    const activeDraftSection = document.getElementById('active-draft-section');
    const draftSellerName = document.getElementById('draft-seller-name');
    const draftSellerContact = document.getElementById('draft-seller-contact');
    const draftDescription = document.getElementById('draft-description');
    const draftDisplaySeller = document.getElementById('draft-display-seller');
    const draftDisplayContact = document.getElementById('draft-display-contact');
    const draftDisplayDescription = document.getElementById('draft-display-description');
    const draftDisplayId = document.getElementById('draft-display-id');
    const draftLinkedCount = document.getElementById('draft-linked-count');
    const draftOfferAmount = document.getElementById('draft-offer-amount');
    const draftStatusMessage = document.getElementById('draft-status-message');
    const draftActionStatus = document.getElementById('draft-action-status');

    // ========== Scan Location Builder Elements ==========
    const scanGenreSelect = document.getElementById('scan-genre');
    const scanNewGenreInput = document.getElementById('scan-new-genre-input');
    const scanAddGenreBtn = document.getElementById('scan-add-genre-btn');
    const scanGenreStatus = document.getElementById('scan-genre-status');
    const scanMainLocationType = document.getElementById('scan-main-location-type');
    const scanMainLocationNumber = document.getElementById('scan-main-location-number');
    const scanSublocation = document.getElementById('scan-sublocation');
    const scanCustomSublocationContainer = document.getElementById('scan-custom-sublocation-container');
    const scanCustomSublocation = document.getElementById('scan-custom-sublocation');
    const scanLocationPreview = document.getElementById('scan-location-preview');
    const scanCounterDisplay = document.getElementById('scan-counter-display');
    const scanResetCounterBtn = document.getElementById('scan-reset-counter-btn');

    // ========== Discogs Elements ==========
    const discogsLocationSelect = document.getElementById('discogs-location-select');
    const discogsStatusMessage = document.getElementById('discogs-status-message');
    const lastSeenCutoffDateInput = document.getElementById('last-seen-cutoff-date');
    const applyLastSeenFilterBtn = document.getElementById('apply-last-seen-filter');

    // ========== Delete Mode Elements ==========
    const deleteStatusFilter = document.getElementById('delete-status-filter');

    // ========== Checkout Elements ==========
    const checkoutShowSelectedBtn = document.getElementById('checkout-show-selected-btn');
    const checkoutShowAllBtn = document.getElementById('checkout-show-all-btn');

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

    let recentScans = [];
    const MAX_RECENT_SCANS = 10;
    let scanCounter = 0;

    // ========== Draft Purchase State ==========
    let activeDraft = null;
    let draftLinkedRecordIds = [];
    let draftPanelExpanded = true;

    // ========== Audio ==========
    let audioContext = null;

    // ========== Mode Panel Configuration ==========
    const MODE_PANELS = {
        add: {
            panels: ['paramsPurchasePanel'],
            visible: true
        },
        scan: {
            panels: ['scanLocationBuilder'],
            visible: true
        },
        discogs: {
            panels: ['filterGroup', 'discogsFilters', 'discogsMarkupUi'],
            visible: true
        },
        delete: {
            panels: ['filterGroup', 'deleteFilters'],
            visible: true
        },
        checkout: {
            panels: ['filterGroup', 'checkoutFilters'],
            visible: true
        },
        discogs_orders: {
            panels: ['filterGroup', 'discogsOrdersFilters'],
            visible: true
        },
        refund: {
            panels: ['filterGroup'],
            visible: true
        }
    };

    // Panel visibility map
    const panelElements = {
        paramsPurchasePanel: paramsPurchasePanel,
        scanLocationBuilder: scanLocationBuilder,
        filterGroup: filterGroup,
        discogsFilters: discogsFilters,
        discogsMarkupUi: discogsMarkupUi,
        deleteFilters: deleteFilters,
        checkoutFilters: checkoutFilters,
        discogsOrdersFilters: discogsOrdersFilters
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
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    }

    function showToast(message, type) {
        console.log(`🍞 TOAST [${type}]: ${message}`);
        showStatus(message, type);
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

    function getStatusName(statusId) {
        const map = { 1: 'New', 2: 'Active', 3: 'Sold', 4: 'Sold on Discogs' };
        return map[statusId] || 'Unknown';
    }

    function getStatusClass(statusId) {
        const map = { 1: 'new', 2: 'active', 3: 'sold', 4: 'discogs' };
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

    function playSound(type) {
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContext.state === 'suspended') audioContext.resume();

            const configs = {
                beep: { freq: 800, duration: 200, type: 'sine', gain: 0.3 },
                error: { freq: 220, duration: 600, type: 'sawtooth', gain: 0.4 },
                success: { freq: 523.25, duration: 200, type: 'sine', gain: 0.2, notes: [523.25, 659.25, 783.99] }
            };

            const config = configs[type];
            if (!config) return;

            if (config.notes) {
                config.notes.forEach((freq, i) => {
                    setTimeout(() => {
                        const osc = audioContext.createOscillator();
                        const gain = audioContext.createGain();
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
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
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

    // ========== Helper: Download receipt as .txt ==========
    function downloadReceipt(text, filename = 'receipt.txt') {
        console.log(`📄 downloadReceipt: filename=${filename}, text length=${text.length}`);
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
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
        console.log(`🌐 apiRequest: ${method} ${endpoint}`, body || '');
        const options = {
            method: method,
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }
        const res = await fetch(window.AppConfig.baseUrl + endpoint, options);
        if (!res.ok) throw new Error(`HTTP ${res.status} on ${method} ${endpoint}`);
        return res.json();
    }

    // ========== Config Loaders ==========
    async function loadMinimumPrice() {
        const data = await apiRequest('GET', '/config/MIN_STORE_PRICE');
        minimumPrice = parseFloat(data.config_value);
    }

    async function loadStorePriceMultiplier() {
        const data = await apiRequest('GET', '/config/STORE_PRICE_ESTIMATED_MULTIPLIER');
        storePriceMultiplier = parseFloat(data.config_value);
    }

    async function loadConditions() {
        const data = await apiRequest('GET', '/api/conditions');
        conditions = data.conditions;
    }

    async function loadConsignors() {
        const data = await apiRequest('GET', '/users');
        consignors = data.users.filter(u => u.role === 'consignor');
        consignorMap = {};
        data.users.forEach(u => { consignorMap[u.id] = { initials: u.initials || '', name: u.full_name || u.username }; });
    }

    async function loadAccounts() {
        try {
            const data = await apiRequest('GET', '/api/accounting/accounts');
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
            const data = await apiRequest('GET', '/api/genres');
            genres = data.genres || [];
        } catch (e) {
            console.warn('Could not load genres:', e);
            genres = [];
        }
    }

    async function loadStats() {
        const total = await apiRequest('GET', '/records/count');
        document.getElementById('total-records').textContent = total.count;
        const newCount = await apiRequest('GET', '/records/count?status_id=1');
        document.getElementById('new-records-count').textContent = newCount.count;

        const lastRecordData = await apiRequest('GET', '/records?limit=1&order_by=created_at&order=desc');
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

        const commission = await apiRequest('GET', '/api/commission-rate');
        document.getElementById('commission-rate').textContent = commission.commission_rate_percent;
    }

    // ========== Default Parameters ==========
    function toggleDefaultParams() {
        // This is now handled by toggleParamsPurchasePanel
        toggleParamsPurchasePanel();
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
        const sleeveId = defaultSleeveSelect ? parseInt(defaultSleeveSelect.value) : null;
        const discId = defaultDiscSelect ? parseInt(defaultDiscSelect.value) : null;
        const price = defaultPriceInput ? parseFloat(defaultPriceInput.value) : null;
        const consignorId = defaultConsignorSelect ? parseInt(defaultConsignorSelect.value) : null;

        defaultParams = {
            sleeveConditionId: sleeveId || null,
            discConditionId: discId || null,
            price: price || null,
            consignorId: consignorId || null
        };
        defaultParamsActive = true;
        saveDefaultParamsToStorage();

        const rows = document.querySelectorAll('.btn-add-record-from-search');
        if (rows.length === 0) {
            updateDefaultParamsStatus('No search results to apply defaults to', 'warning');
            return;
        }

        rows.forEach(btn => {
            const row = btn.closest('tr');
            if (!row) return;
            const sleeveSelect = row.querySelector('.sleeve-condition-select');
            const discSelect = row.querySelector('.disc-condition-select');
            const priceInput = row.querySelector('.price-input');
            const consignorSelect = row.querySelector('.consignor-select');

            if (sleeveSelect && defaultParams.sleeveConditionId) sleeveSelect.value = defaultParams.sleeveConditionId;
            if (discSelect && defaultParams.discConditionId) discSelect.value = defaultParams.discConditionId;
            if (priceInput && defaultParams.price) priceInput.value = defaultParams.price;
            if (consignorSelect && defaultParams.consignorId) consignorSelect.value = defaultParams.consignorId;
        });

        updateDefaultParamsStatus(`Defaults applied to ${rows.length} search results`, 'success');
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
        const el = document.getElementById('default-params-status');
        if (!el) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        el.className = 'status-message status-' + type;
        el.style.display = 'block';
        setTimeout(() => { if (el) el.style.display = 'none'; }, 5000);
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
            const currentVal = defaultSleeveSelect.value;
            defaultSleeveSelect.innerHTML = '<option value="">Select...</option>';
            conditions.forEach(c => {
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
            conditions.forEach(c => {
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
            consignors.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.username + (c.full_name ? ` (${c.full_name})` : '');
                defaultConsignorSelect.appendChild(opt);
            });
            if (currentVal) defaultConsignorSelect.value = currentVal;
        }
    }

    // ========== UNIFIED MODE PANEL MANAGEMENT ==========
    function showPanelsForMode(mode) {
        // Hide all panels first
        for (const key in panelElements) {
            const element = panelElements[key];
            if (element) {
                element.style.display = 'none';
            }
        }

        // Show panels for the current mode
        const modeConfig = MODE_PANELS[mode];
        if (modeConfig) {
            modeConfig.panels.forEach(panelKey => {
                const element = panelElements[panelKey];
                if (element) {
                    element.style.display = 'block';
                }
            });
        }

        // Special handling for scan mode - populate genres
        if (mode === 'scan' && scanLocationBuilder) {
            populateScanGenreDropdown();
            updateScanLocationPreview();
            updateScanCounter();
        }

        // Special handling for discogs mode - show markup UI
        if (mode === 'discogs' && discogsMarkupUi) {
            discogsMarkupUi.style.display = 'block';
        }

        // Search placeholder - controlled by mode
        if (searchInput) {
            const placeholders = {
                'add': 'Search Discogs...',
                'scan': 'Scan barcode here...',
                'discogs': 'Search within records...',
                'delete': 'Search records...',
                'checkout': 'Search records...',
                'discogs_orders': 'Search orders...',
                'refund': 'Search sold records by artist, title, or barcode...'
            };
            searchInput.placeholder = placeholders[mode] || 'Search...';
        }

        // Update Complete button
        updateCompleteButton(mode);

        // Load draft if in add mode
        if (mode === 'add' && !activeDraft) {
            loadActiveDraft();
        }
    }

    function updateCompleteButton(mode) {
        if (!completeActionBtn) return;

        if (mode === 'add') {
            completeActionBtn.style.display = 'none';
        } else if (mode === 'refund') {
            completeActionBtn.style.display = '';
            completeActionBtn.textContent = '💰 Process Refund';
        } else if (mode === 'scan') {
            completeActionBtn.style.display = '';
            completeActionBtn.textContent = '📍 Apply Location';
        } else if (mode === 'discogs') {
            completeActionBtn.style.display = '';
            completeActionBtn.textContent = '📤 Post to Discogs';
        } else if (mode === 'delete') {
            completeActionBtn.style.display = '';
            completeActionBtn.textContent = '🗑️ Delete Selected';
        } else if (mode === 'checkout') {
            completeActionBtn.style.display = '';
            completeActionBtn.textContent = '🛒 Checkout';
        } else if (mode === 'discogs_orders') {
            completeActionBtn.style.display = '';
            completeActionBtn.textContent = '📦 Mark Sold';
        } else {
            completeActionBtn.style.display = 'none';
        }
    }

    // ========== Unified Record Loader ==========
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
                showAllStatuses = false,
                format = null,
                excludeBatch = false
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
                if (format) {
                    params.append('format', format);
                }
                if (excludeBatch) {
                    params.append('exclude_batch', 'true');
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

            if (mode === 'discogs' && lastSeenCutoffDate) {
                const before = records.length;
                records = records.filter(r => meetsLastSeenFilter(r));
                console.log(`🔵 loadRecords: last-seen filter reduced from ${before} to ${records.length}`);
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
            if (excludeBatch) statusMsg += ` (excluding linked records)`;
            showStatus(statusMsg, 'info');
            updateSelectionCount();

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

    // ========== Discogs Locations ==========
    async function loadDiscogsLocations() {
        console.log('📍 Loading discogs locations...');
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
        discogsLocationSelect.innerHTML = `
            <option value="all">-- All (no filter) --</option>
            <option value="all_with_location">-- All with Location --</option>
        `;
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

    // ========== Discogs Prices ==========
    async function populateDiscogsPrices(records) {
        // Only run in discogs mode
        if (currentSearchMode !== 'discogs') {
            console.log('💰 populateDiscogsPrices: skipping - not in discogs mode');
            return;
        }

        console.log(`💰 populateDiscogsPrices: received ${records.length} records`);
        if (!records || records.length === 0) {
            console.log('💰 populateDiscogsPrices: no records, returning');
            return;
        }

        const eligibleRecords = records.filter(r => {
            const eligible = r.status_id === 2 && !hasConsignor(r) && meetsLastSeenFilter(r) && r.created_at;
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

        renderTablePage();
        updateSelectionCount();
    }

    // ========== Price Estimation ==========
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
            const data = await apiRequest('POST', '/api/price-estimate-v3', {
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

    // ========== Discogs Orders ==========
    async function loadDiscogsOrdersList(status, dateFrom, dateTo, search) {
        console.log(`📦 loadDiscogsOrdersList() called with: status=${status || 'all'}, dateFrom=${dateFrom}, dateTo=${dateTo}, search=${search}`);
        try {
            let url = window.AppConfig.baseUrl + '/api/discogs/orders?per_page=200';
            
            if (status && status !== '') {
                url += `&status=${encodeURIComponent(status)}`;
            }
            if (dateFrom) {
                url += `&date_from=${encodeURIComponent(dateFrom)}`;
            }
            if (dateTo) {
                url += `&date_to=${encodeURIComponent(dateTo)}`;
            }
            if (search && search.trim() !== '') {
                url += `&search=${encodeURIComponent(search.trim())}`;
            }
            
            url += `&all=true`;

            console.log(`📦 Fetching orders from: ${url}`);

            const response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
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
            ordersList.sort((a, b) => {
                const dateA = new Date(a.created_at);
                const dateB = new Date(b.created_at);
                return dateB - dateA;
            });
            console.log(`📦 Loaded ${ordersList.length} orders (newest first)`);

            if (discogsOrderSelect) {
                discogsOrderSelect.innerHTML = '<option value="">-- Select an order --</option>';
                for (const order of ordersList) {
                    const option = document.createElement('option');
                    option.value = order.order_id || order.id;
                    const buyer = order.buyer_username || order.buyer_name || 'Unknown buyer';
                    const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '';
                    const total = order.total_amount ? `$${order.total_amount.toFixed(2)}` : '';
                    const itemCount = order.items ? order.items.length : 0;
                    option.textContent = `${order.order_id} - ${buyer} ${date} ${total} (${itemCount} items)`;
                    discogsOrderSelect.appendChild(option);
                }
            }

            updateDiscogsOrdersStatus(`✅ Loaded ${ordersList.length} orders`, 'success');

        } catch (error) {
            console.error('❌ Error loading orders:', error);
            updateDiscogsOrdersStatus(`❌ Error: ${error.message}`, 'error');
        }
    }

    async function applyDiscogsOrdersFilters() {
        const status = document.getElementById('discogs-orders-status-filter')?.value || '';
        const dateFrom = document.getElementById('discogs-orders-date-from')?.value || '';
        const dateTo = document.getElementById('discogs-orders-date-to')?.value || '';
        const search = document.getElementById('discogs-orders-search')?.value || '';
        
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
        const termLower = term.toLowerCase().trim();
        const filtered = ordersList.filter(order => {
            const buyer = (order.buyer_username || order.buyer_name || '').toLowerCase();
            const email = (order.buyer_email || '').toLowerCase();
            return buyer.includes(termLower) || email.includes(termLower);
        });
        if (discogsOrderSelect) {
            discogsOrderSelect.innerHTML = '<option value="">-- Select an order --</option>';
            for (const order of filtered) {
                const option = document.createElement('option');
                option.value = order.order_id || order.id;
                const buyer = order.buyer_username || order.buyer_name || 'Unknown buyer';
                const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '';
                const total = order.total_amount ? `$${order.total_amount.toFixed(2)}` : '';
                const itemCount = order.items ? order.items.length : 0;
                option.textContent = `${order.order_id} - ${buyer} ${date} ${total} (${itemCount} items)`;
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
            updateDiscogsOrdersStatus(`🔍 Found ${filtered.length} orders matching "${term}"`, 'info');
        }
    }

    // ========== loadOrderItems ==========
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
            const url = window.AppConfig.baseUrl + '/api/discogs/orders/' + orderId;
            const response = await fetch(url, {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
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

            const enrichedItems = [];
            for (const item of items) {
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

    async function markRecordSoldOnDiscogs(recordId) {
        if (!recordId) {
            showStatus('No record ID provided.', 'error');
            return;
        }
        
        if (!confirm(`Mark record #${recordId} as sold on Discogs?\n\nThis will:\n- Search Discogs orders for this record\n- Auto-fetch the sale price\n- Mark the record as sold (status_id=4)\n- Set the sale date to today`)) {
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
                showStatus(`✅ Record #${recordId} marked as sold on Discogs for $${price}`, 'success');
                playSound('success');
                
                if (currentSearchMode === 'discogs_orders' && selectedOrderId) {
                    await loadOrderItems(selectedOrderId);
                } else {
                    renderTablePage();
                    updateSelectionCount();
                }
            } else {
                showStatus(`❌ Error: ${data.error || 'Failed to mark record as sold'}`, 'error');
                playSound('error');
            }
        } catch (error) {
            console.error('Error marking record sold on Discogs:', error);
            showStatus('❌ Error: ' + error.message, 'error');
            playSound('error');
        }
    }

    async function processDiscogsOrder() {
        const items = filteredRecords;
        if (items.length === 0) {
            showStatus('No items to process.', 'warning');
            return;
        }

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
                const response = await fetch(window.AppConfig.baseUrl + '/api/records/mark-sold-on-discogs', {
                    method: 'POST',
                    credentials: 'include',
                    headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        record_id: recordId,
                        sale_price: salePrice,
                        discogs_order_id: orderId
                    })
                });
                const data = await response.json();
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

        showStatus(`✅ ${posted} marked sold, ${failed} failed.`, posted > 0 ? 'success' : 'error');
        if (selectedOrderId) {
            await loadOrderItems(selectedOrderId);
        }
    }

    // ========== REFUND MODE ==========
    async function processRefund() {
        const selected = getSelectedRecords();
        if (selected.length === 0) {
            showStatus('No records selected. Please select a range using "from" and "to" buttons.', 'warning');
            return;
        }

        const soldRecords = selected.filter(r => r.status_id === 3 || r.status_id === 4);
        if (soldRecords.length === 0) {
            showStatus('No sold records selected. Only records with status "Sold" or "Sold on Discogs" can be refunded.', 'warning');
            return;
        }

        if (soldRecords.length < selected.length) {
            const nonSold = selected.length - soldRecords.length;
            if (!confirm(`${nonSold} selected record(s) are not sold and will be skipped. Continue with ${soldRecords.length} sold record(s)?`)) {
                return;
            }
        }

        const totalAmount = soldRecords.reduce((sum, r) => sum + (r.store_price || 0), 0);
        showRefundModal(soldRecords, totalAmount);
    }

    function showRefundModal(records, totalAmount) {
        const existingModal = document.getElementById('refund-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'refund-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; width: 95%;">
                <div class="modal-header" style="background: #dc3545; color: white;">
                    <h3 class="modal-title"><i class="fas fa-undo-alt"></i> Process Refund</h3>
                    <button class="modal-close" onclick="closeRefundModal()" style="color: white;">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>${records.length}</strong> record(s) selected for refund.</p>
                    <div style="margin-bottom: 15px; max-height: 150px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 13px;">
                        ${records.map(r => `<div>${escapeHtml(r.artist)} - ${escapeHtml(r.title)} (${getStatusName(r.status_id)}) - $${(r.store_price || 0).toFixed(2)}</div>`).join('')}
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="refund-amount" style="display:block; font-weight:500; margin-bottom:4px;">Refund Amount ($)</label>
                        <input type="number" id="refund-amount" class="form-control" step="0.01" min="0.01" value="${totalAmount.toFixed(2)}" style="width:100%; padding:8px; font-size:16px;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="refund-method" style="display:block; font-weight:500; margin-bottom:4px;">Refund Method</label>
                        <select id="refund-method" class="form-control" style="width:100%; padding:8px;">
                            <option value="cash">Cash</option>
                            <option value="square">Square</option>
                            <option value="discogs">Discogs</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="refund-reason" style="display:block; font-weight:500; margin-bottom:4px;">Reason (optional)</label>
                        <input type="text" id="refund-reason" class="form-control" placeholder="e.g., Customer returned item" style="width:100%; padding:8px;">
                    </div>
                    <div id="refund-status" style="margin-top:10px; display:none;"></div>
                </div>
                <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;">
                    <button class="btn btn-secondary" onclick="closeRefundModal()">Cancel</button>
                    <button class="btn btn-danger" id="refund-confirm-btn">
                        <i class="fas fa-undo-alt"></i> Process Refund
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        setTimeout(() => {
            const amountInput = document.getElementById('refund-amount');
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
        const modal = document.getElementById('refund-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.remove();
        }
    }

    async function confirmRefund(records) {
        const amountInput = document.getElementById('refund-amount');
        const methodSelect = document.getElementById('refund-method');
        const reasonInput = document.getElementById('refund-reason');
        const statusDiv = document.getElementById('refund-status');
        const confirmBtn = document.getElementById('refund-confirm-btn');

        const amount = parseFloat(amountInput.value);
        const method = methodSelect.value;
        const reason = reasonInput.value.trim() || 'Customer refund';

        if (isNaN(amount) || amount <= 0) {
            showRefundStatus('Please enter a valid refund amount.', 'error');
            return;
        }

        const recordSummary = records.map(r => `${r.artist} - ${r.title}`).join('\n');
        if (!confirm(`Process refund for ${records.length} record(s)?\n\n${recordSummary}\n\nAmount: $${amount.toFixed(2)}\nMethod: ${method}\nReason: ${reason}\n\n⚠️ Records will be DELETED from the database.`)) {
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing...';
        showRefundStatus('⏳ Processing refund...', 'info');

        try {
            const recordIds = records.map(r => r.id);
            const result = await apiRequest('POST', '/api/refund/process', {
                record_ids: recordIds,
                amount: amount,
                method: method,
                reason: reason
            });

            if (result.status === 'success') {
                showRefundStatus(`✅ ${result.message}`, 'success');
                playSound('success');
                const refundedIds = new Set(recordIds);
                filteredRecords = filteredRecords.filter(r => !refundedIds.has(r.id));
                allRecords = allRecords.filter(r => !refundedIds.has(r.id));
                totalRecords = filteredRecords.length;
                currentPage = 1;
                renderPagination();
                renderTablePage();
                updateSelectionCount();
                cancelRangeSelection();
                setTimeout(closeRefundModal, 1500);
            } else {
                showRefundStatus(`❌ Error: ${result.error || 'Unknown error'}`, 'error');
                playSound('error');
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Process Refund';
            }
        } catch (error) {
            showRefundStatus(`❌ Error: ${error.message}`, 'error');
            playSound('error');
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Process Refund';
        }
    }

    function showRefundStatus(message, type) {
        const el = document.getElementById('refund-status');
        if (!el) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        el.className = 'status-message status-' + type;
        el.style.display = 'block';
    }

    // ========== RENDER TABLE PAGE ==========
    function renderTablePage() {
        console.log(`🔄 renderTablePage() – mode: ${currentSearchMode}, records: ${filteredRecords.length}`);
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredRecords.length);
        const pageRecords = filteredRecords.slice(start, end);

        let theadHtml = '';
        
        if (currentSearchMode === 'add') {
            const isSearchResult = currentMode === 'search' && currentResults.length > 0;
            if (isSearchResult) {
                const showDefaultInputs = !defaultParamsActive;
                const condOptions = conditions.map(c =>
                    `<option value="${c.id}">${c.display_name || c.condition_name}</option>`
                ).join('');
                const consignorOptions = consignors.map(c =>
                    `<option value="${c.id}" ${c.id === selectedConsignorId ? 'selected' : ''}>${c.username}</option>`
                ).join('');

                if (showDefaultInputs) {
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
                            <th>Consignor</th>
                            <th>Notes</th>
                            <th>Action</th>
                        </tr>
                    `;
                } else {
                    theadHtml = `
                        <tr>
                            <th style="width:60px;">Range</th>
                            <th style="width:60px;">Image</th>
                            <th>Artist</th>
                            <th>Title</th>
                            <th>Catalog #</th>
                            <th>Action</th>
                        </tr>
                    `;
                }
            } else {
                theadHtml = `
                    <tr>
                        <th style="width:100px;">Range</th>
                        <th>ID</th>
                        <th>Artist</th>
                        <th>Title</th>
                        <th>Price</th>
                        <th>Catalog #</th>
                        <th>Sleeve</th>
                        <th>Disc</th>
                        <th>Barcode</th>
                        <th>Created At</th>
                    </tr>
                `;
            }
        } else if (currentSearchMode === 'scan') {
            theadHtml = `
                <tr>
                    <th style="width:100px;">Range</th>
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
                    <th style="width:100px;">Range</th>
                    <th>ID</th>
                    <th>Artist</th>
                    <th>Title</th>
                    <th>Price</th>
                    <th>Status</th>
                </tr>
            `;
        } else if (currentSearchMode === 'checkout') {
            theadHtml = `
                <tr>
                    <th style="width:100px;">Range</th>
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
                    <th>Action</th>
                </tr>
            `;
        } else if (currentSearchMode === 'refund') {
            theadHtml = `
                <tr>
                    <th style="width:100px;">Range</th>
                    <th>ID</th>
                    <th>Artist</th>
                    <th>Title</th>
                    <th>Sale Price</th>
                    <th>Status</th>
                    <th>Date Sold</th>
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
            const colCount = currentSearchMode === 'discogs_orders' ? 10 :
                             (currentSearchMode === 'refund' ? 7 :
                             (currentSearchMode === 'add' ? (currentMode === 'search' ? 11 : 10) :
                             (currentSearchMode === 'scan' ? 7 :
                             (currentSearchMode === 'discogs' ? 13 :
                             (currentSearchMode === 'delete' ? 6 : 7)))));
            tbodyHtml = `<tr><td colspan="${colCount}" style="text-align:center;padding:40px;">${msg}</td></tr>`;
        } else {
            pageRecords.forEach((record, idx) => {
                const globalIndex = start + idx;
                const isSelected = (rangeFromIndex !== null && rangeToIndex !== null &&
                                    globalIndex >= Math.min(rangeFromIndex, rangeToIndex) &&
                                    globalIndex <= Math.max(rangeFromIndex, rangeToIndex));

                let rowClass = isSelected ? 'record-selected' : '';
                let rangeButtons = '';
                const showRange = currentSearchMode !== 'discogs_orders';
                
                if (showRange) {
                    if (!isRangeMode) {
                        rangeButtons = `
                            <button class="btn-from" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button>
                            <span style="color:#999; margin:0 4px;">to</span>
                        `;
                    } else {
                        if (rangeFromIndex === globalIndex && rangeToIndex === globalIndex) {
                            rangeButtons = `
                                <span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">FROM ✓</span>
                                <span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">TO ✓</span>
                            `;
                        } else if (rangeFromIndex === globalIndex) {
                            rangeButtons = `
                                <span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">FROM ✓</span>
                                <button class="btn-to" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>
                            `;
                        } else if (rangeToIndex === globalIndex) {
                            rangeButtons = `
                                <button class="btn-from" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button>
                                <span style="background:#28a745; color:white; padding:2px 6px; border-radius:3px; font-size:11px;">TO ✓</span>
                            `;
                        } else {
                            rangeButtons = `
                                <button class="btn-from" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">from</button>
                                <button class="btn-to" data-index="${globalIndex}" style="padding:2px 6px; font-size:11px; background:#28a745; color:white; border:none; border-radius:3px; cursor:pointer;">to</button>
                            `;
                        }
                    }
                }

                let rowHtml = `<tr class="${rowClass}" data-index="${globalIndex}">`;

                if (currentSearchMode === 'add' && currentMode === 'search' && currentResults.length > 0) {
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
                        `<img src="${escapeHtml(imageUrl)}" style="width:80px; height:80px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="expandImage('${escapeHtml(imageUrl)}', '${escapeHtml(artist)} - ${escapeHtml(title)}')" title="Click to expand">` :
                        `<div style="width:80px; height:80px; background:#eee; border-radius:4px;"></div>`;

                    const showDefaultInputs = !defaultParamsActive;

                    rowHtml += `<td style="text-align:center; white-space:nowrap;">${rangeButtons}</td>`;
                    rowHtml += `<td style="text-align:center;">${imageHtml}</td>`;
                    rowHtml += `<td>${escapeHtml(artist)}</td>`;
                    rowHtml += `<td>${escapeHtml(title)}</td>`;
                    rowHtml += `<td>${escapeHtml(catalog)}</td>`;
                    
                    if (showDefaultInputs) {
                        rowHtml += `
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
                                <select class="consignor-select" style="width:100px; padding:4px;">
                                    <option value="">None</option>
                                    ${consignorOptions}
                                </select>
                            </td>
                            <td>
                                <input type="text" class="notes-input" placeholder="Optional note..." style="width:120px; padding:4px; font-size:12px;">
                            </td>
                        `;
                    } else {
                        const def = getDefaultParamsForRecord();
                        const sleeveName = def.sleeveConditionId ? conditions.find(c => c.id === def.sleeveConditionId)?.display_name || '—' : '—';
                        const discName = def.discConditionId ? conditions.find(c => c.id === def.discConditionId)?.display_name || '—' : '—';
                        const priceDisplay = def.price ? `$${def.price}` : '—';
                        const consignorDisplay = def.consignorId ? consignors.find(c => c.id === def.consignorId)?.username || 'None' : 'None';
                        
                        rowHtml += `
                            <td style="font-size:12px; color:#666;" title="Using defaults">S: ${escapeHtml(sleeveName)}</td>
                            <td style="font-size:12px; color:#666;" title="Using defaults">D: ${escapeHtml(discName)}</td>
                            <td style="font-size:12px; color:#666;" title="Using defaults">${priceDisplay}</td>
                            <td style="font-size:12px; color:#666;" title="Using defaults">${escapeHtml(consignorDisplay)}</td>
                            <td>
                                <input type="text" class="notes-input" placeholder="Optional note..." style="width:120px; padding:4px; font-size:12px;">
                            </td>
                        `;
                    }
                    
                    rowHtml += `
                        <td>
                            <button class="btn-add-record-from-search" data-index="${globalIndex}" style="background:#28a745; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">
                                <i class="fas fa-plus"></i> Add
                            </button>
                        </td>
                    `;
                } else if (currentSearchMode === 'add' && currentMode !== 'search') {
                    const id = record.id;
                    const artist = record.artist || 'Unknown';
                    const title = record.title || 'Unknown';
                    const price = record.store_price ? `$${record.store_price.toFixed(2)}` : 'N/A';
                    const catalog = record.catalog_number || '—';
                    const sleeveCondition = record.sleeve_condition_name || '—';
                    const discCondition = record.disc_condition_name || '—';
                    const barcode = record.barcode || record.id;
                    const created = record.created_at ? new Date(record.created_at).toLocaleString() : 'Unknown';
                    
                    rowHtml += `
                        <td style="text-align:center; white-space:nowrap;">${rangeButtons}</td>
                        <td>${id}</td>
                        <td>${escapeHtml(artist)}</td>
                        <td>${escapeHtml(title)}</td>
                        <td>${price}</td>
                        <td>${escapeHtml(catalog)}</td>
                        <td>${escapeHtml(sleeveCondition)}</td>
                        <td>${escapeHtml(discCondition)}</td>
                        <td><span class="barcode-value">${barcode}</span></td>
                        <td>${created}</td>
                    `;
                } else if (currentSearchMode === 'scan') {
                    const id = record.id;
                    const artist = record.artist || 'Unknown';
                    const title = record.title || 'Unknown';
                    const price = record.store_price ? `$${record.store_price.toFixed(2)}` : 'N/A';
                    const barcode = record.barcode || record.id;
                    const lastSeen = record.last_seen ? new Date(record.last_seen).toLocaleDateString() : 'Never';
                    rowHtml += `
                        <td style="text-align:center; white-space:nowrap;">${rangeButtons}</td>
                        <td>${id}</td>
                        <td>${escapeHtml(artist)}</td>
                        <td>${escapeHtml(title)}</td>
                        <td>${price}</td>
                        <td><span class="barcode-value">${barcode}</span></td>
                        <td>${lastSeen}</td>
                    `;
                } else if (currentSearchMode === 'discogs') {
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

                    const imgHtml = imageUrl ? 
                        `<img src="${escapeHtml(imageUrl)}" style="width:80px; height:80px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="expandImage('${escapeHtml(imageUrl)}', '${escapeHtml(artist)} - ${escapeHtml(title)}')" title="Click to expand">` : 
                        '<div style="width:80px; height:80px; background:#e0e0e0; border-radius:4px;"></div>';

                    rowHtml += `
                        <td style="text-align:center; white-space:nowrap;">${rangeButtons}</td>
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
                        <td style="text-align:center; white-space:nowrap;">${rangeButtons}</td>
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
                    
                    let actionHtml;
                    if (checkoutViewMode === 'list') {
                        actionHtml = `<button class="btn btn-sm btn-danger remove-checkout-item" data-record-id="${record.id}"><i class="fas fa-minus"></i> Remove</button>`;
                    } else {
                        if (inSelected) {
                            actionHtml = `<button class="btn btn-sm btn-danger remove-checkout-item" data-record-id="${record.id}"><i class="fas fa-minus"></i> Remove</button>`;
                        } else {
                            actionHtml = `<button class="btn btn-sm btn-success add-checkout-item" data-record-id="${record.id}"><i class="fas fa-plus"></i> Add</button>`;
                        }
                    }
                    
                    const isCustom = record.isCustom === true;
                    const customBadge = isCustom ? '<span class="status-badge" style="background:#17a2b8; color:white; margin-left:5px;">Custom</span>' : '';
                    
                    rowHtml += `
                        <td style="text-align:center; white-space:nowrap;">${rangeButtons}</td>
                        <td>${id}${customBadge}</td>
                        <td>${escapeHtml(artist)}</td>
                        <td>${escapeHtml(title)}</td>
                        <td>${price}</td>
                        <td><span class="barcode-value">${barcode}</span></td>
                        <td>${actionHtml}</td>
                    `;
                } else if (currentSearchMode === 'discogs_orders') {
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

                    let actionButton = '';
                    if (pigstyleId && recordStatus !== 3 && recordStatus !== 4) {
                        actionButton = `
                            <button class="btn btn-sm btn-success mark-discogs-sold-btn" 
                                    data-record-id="${pigstyleId}"
                                    style="padding:2px 6px; font-size:11px; margin-top:4px;">
                                <i class="fab fa-discogs"></i> Mark Sold
                            </button>
                        `;
                    }

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
                        <td>${actionButton}</td>
                    `;
                } else if (currentSearchMode === 'refund') {
                    const id = record.id;
                    const artist = record.artist || 'Unknown';
                    const title = record.title || 'Unknown';
                    const price = record.store_price ? `$${record.store_price.toFixed(2)}` : 'N/A';
                    const statusName = getStatusName(record.status_id);
                    const statusClass = getStatusClass(record.status_id);
                    const dateSold = record.date_sold ? new Date(record.date_sold).toLocaleDateString() : 'Unknown';
                    
                    rowHtml += `
                        <td style="text-align:center; white-space:nowrap;">${rangeButtons}</td>
                        <td>${id}</td>
                        <td>${escapeHtml(artist)}</td>
                        <td>${escapeHtml(title)}</td>
                        <td>${price}</td>
                        <td><span class="status-badge ${statusClass}">${statusName}</span></td>
                        <td>${dateSold}</td>
                    `;
                }

                rowHtml += `</tr>`;
                tbodyHtml += rowHtml;
            });
        }
        recordsTableBody.innerHTML = tbodyHtml;

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

        if (currentSearchMode === 'add' && currentMode === 'search' && currentResults.length > 0) {
            document.querySelectorAll('.btn-add-record-from-search').forEach(btn => {
                btn.addEventListener('click', function() {
                    const index = parseInt(this.dataset.index);
                    const row = this.closest('tr');
                    const record = currentResults[index];
                    if (record) addRecordFromDiscogs(row, record);
                });
            });

            if (!defaultParamsActive) {
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
        }

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

        if (currentSearchMode === 'discogs_orders') {
            document.querySelectorAll('.pigstyle-id-input').forEach(input => {
                input.addEventListener('change', function() {
                    const row = this.closest('tr');
                    const index = parseInt(row.dataset.index);
                    const item = filteredRecords[index];
                    if (item) {
                        const val = this.value.trim();
                        const newId = parseInt(val);
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
                        const barcode = prompt('Enter or scan barcode:');
                        if (barcode && barcode.trim().length > 0) {
                            input.value = barcode.trim();
                            const event = new Event('change');
                            input.dispatchEvent(event);
                            lookupBarcodeForOrderItem(input, barcode.trim());
                        }
                    }
                });
            });

            document.querySelectorAll('.mark-discogs-sold-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const recordId = parseInt(this.dataset.recordId);
                    markRecordSoldOnDiscogs(recordId);
                });
            });
        }

        updateSelectionCount();

        // Update draft linked count if in Add mode
        if (currentSearchMode === 'add') {
            updateDraftLinkedCount();
        }
    }

    // ========== Helper: lookup barcode for order item ==========
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
                const item = filteredRecords[index];
                if (item) {
                    item.pigstyle_id = record.id;
                    item.barcode = record.barcode;
                    item.catalog_number = record.catalog_number;
                    item.record_status_id = record.status_id;
                    renderTablePage();
                }
                playSound('success');
                showStatus(`✅ Record #${record.id} assigned to this order item.`, 'success');
            } else if (data.records && data.records.length > 1) {
                showStatus(`⚠️ Multiple records (${data.records.length}) found for barcode. Please be more specific.`, 'warning');
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

    // ========== Scan Location Builder Functions ==========
    function populateScanGenreDropdown() {
        if (!scanGenreSelect) return;
        const currentVal = scanGenreSelect.value;
        scanGenreSelect.innerHTML = '<option value="">-- Select Genre --</option>';
        genres.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = g;
            scanGenreSelect.appendChild(opt);
        });
        if (currentVal && genres.includes(currentVal)) {
            scanGenreSelect.value = currentVal;
        }
        updateScanLocationPreview();
    }

    function updateScanLocationPreview() {
        const genre = scanGenreSelect ? scanGenreSelect.value : '';
        const mainType = scanMainLocationType ? scanMainLocationType.value : 'Bin';
        const mainNumber = scanMainLocationNumber ? scanMainLocationNumber.value : '1';
        const sublocation = scanSublocation ? scanSublocation.value : '';

        let mainLocation = mainType + ' ' + mainNumber;
        let sublocStr = '';
        if (sublocation === 'CUSTOM') {
            sublocStr = scanCustomSublocation ? scanCustomSublocation.value.trim() : 'Custom';
        } else if (sublocation && sublocation !== 'NA') {
            const names = { 'LT': 'Left Top', 'RT': 'Right Top', 'LB': 'Left Bottom', 'RB': 'Right Bottom' };
            sublocStr = names[sublocation] || '';
        }

        let parts = [];
        if (genre) parts.push(genre);
        if (mainLocation) parts.push(mainLocation);
        if (sublocStr) parts.push(sublocStr);

        if (scanLocationPreview) {
            scanLocationPreview.textContent = parts.join(' | ') || '--';
        }

        updateScanCounter();

        const hasGenre = !!genre;
        const hasSublocation = sublocation && sublocation !== '';
        const isValid = hasGenre && hasSublocation;
        const hasRecords = filteredRecords.length > 0;

        if (completeActionBtn) {
            completeActionBtn.disabled = !(isValid && hasRecords);
            if (!isValid) {
                completeActionBtn.title = 'Genre and sublocation are required';
            } else if (!hasRecords) {
                completeActionBtn.title = 'No records scanned yet';
            } else {
                completeActionBtn.title = 'Apply location to all scanned records';
            }
        }
    }

    function updateScanCounter() {
        if (scanCounterDisplay) {
            scanCounterDisplay.textContent = scanCounter || filteredRecords.length;
        }
    }

    function resetScanCounter() {
        scanCounter = 0;
        updateScanCounter();
    }

    function applyScanLocation() {
        const records = filteredRecords;
        if (records.length === 0) {
            showStatus('No scanned records to process.', 'warning');
            return;
        }

        const genre = scanGenreSelect ? scanGenreSelect.value : '';
        const mainType = scanMainLocationType ? scanMainLocationType.value : 'Bin';
        const mainNumber = scanMainLocationNumber ? scanMainLocationNumber.value : '1';
        const sublocation = scanSublocation ? scanSublocation.value : '';

        if (!genre) {
            showStatus('Please select or add a genre.', 'warning');
            return;
        }
        if (!sublocation) {
            showStatus('Please select a sublocation.', 'warning');
            return;
        }

        let mainLocation = mainType + ' ' + mainNumber;
        let sublocStr = '';
        if (sublocation === 'CUSTOM') {
            const custom = scanCustomSublocation ? scanCustomSublocation.value.trim() : '';
            if (!custom) {
                showStatus('Please enter custom sublocation text.', 'warning');
                return;
            }
            sublocStr = custom;
        } else if (sublocation !== 'NA') {
            const names = { 'LT': 'Left Top', 'RT': 'Right Top', 'LB': 'Left Bottom', 'RB': 'Right Bottom' };
            sublocStr = names[sublocation] || '';
        }

        const today = getLocalMSTDate();

        let updated = 0;
        for (let i = records.length - 1; i >= 0; i--) {
            const record = records[i];
            const counter = records.length - i;
            let parts = [];
            if (genre) parts.push(genre);
            if (mainLocation) parts.push(mainLocation);
            if (sublocStr) parts.push(sublocStr);
            parts.push(String(counter));
            const locationString = parts.join(' | ');

            try {
                apiRequest('PUT', '/records/' + record.id, {
                    location: locationString,
                    last_seen: today
                }).then(() => {
                    record.location = locationString;
                    record.last_seen = today;
                }).catch(e => {
                    console.error('Failed to update record', record.id, e);
                });
                updated++;
            } catch (e) {
                console.error('Failed to update record', record.id, e);
            }
        }

        if (updated > 0) {
            const firstRecord = records[0];
            const firstCounter = records.length;
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

        showStatus(`✅ Applied location to ${updated} of ${records.length} scanned records.`, 'success');
        playSound('success');
        resetScanCounter();
        updateScanLocationPreview();
    }

    // ========== Custom Item Modal ==========
    let customItemModal = null;

    function showCustomItemModal() {
        if (customItemModal) {
            customItemModal.remove();
            customItemModal = null;
        }

        customItemModal = document.createElement('div');
        customItemModal.id = 'custom-item-modal';
        customItemModal.className = 'modal-overlay';
        customItemModal.style.display = 'flex';
        customItemModal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; width: 95%;">
                <div class="modal-header" style="background: #17a2b8; color: white;">
                    <h3 class="modal-title"><i class="fas fa-plus-circle"></i> Add Custom Item</h3>
                    <button class="modal-close" onclick="closeCustomItemModal()" style="color: white; font-size: 28px; background: none; border: none; cursor: pointer;">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 15px;">
                        <label for="custom-item-desc" style="display:block; font-weight:500; margin-bottom:4px;">Description *</label>
                        <input type="text" id="custom-item-desc" class="form-control" placeholder="e.g., Merchandise, Gift Card, etc." style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="custom-item-price" style="display:block; font-weight:500; margin-bottom:4px;">Price ($) *</label>
                        <input type="number" id="custom-item-price" class="form-control" step="0.01" min="0.01" placeholder="0.00" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                    </div>
                    <div id="custom-item-status" style="margin-top:10px; display:none;"></div>
                </div>
                <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;">
                    <button class="btn btn-secondary" onclick="closeCustomItemModal()" style="padding:8px 16px; border:none; border-radius:4px; cursor:pointer; background:#6c757d; color:white;">Cancel</button>
                    <button class="btn btn-success" id="custom-item-add-btn" style="padding:8px 16px; border:none; border-radius:4px; cursor:pointer; background:#28a745; color:white;"><i class="fas fa-check"></i> Add to Checkout</button>
                </div>
            </div>
        `;
        document.body.appendChild(customItemModal);

        setTimeout(() => {
            const descInput = document.getElementById('custom-item-desc');
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

        const customItem = {
            id: -Date.now(),
            artist: 'Custom',
            title: desc,
            store_price: price,
            barcode: 'CUSTOM',
            isCustom: true
        };

        checkoutSelectedItems.push(customItem);
        showStatus(`Added custom item: "${desc}" for $${price.toFixed(2)}`, 'success');
        closeCustomItemModal();

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

    // ========== Bernie Item ==========
    function addBernieItem() {
        const bernieItem = {
            id: -Date.now() - 1,
            artist: 'Bernie',
            title: 'Bern It',
            store_price: 0.99,
            barcode: null,
            isCustom: true,
            isBernie: true
        };

        checkoutSelectedItems.push(bernieItem);
        showStatus(`Added Bernie donation: "Bern It" for $0.99`, 'success');
        playSound('success');

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
        const consignorSelect = row.querySelector('.consignor-select');
        const sleeveSelect = row.querySelector('.sleeve-condition-select');
        const discSelect = row.querySelector('.disc-condition-select');
        const notesInput = row.querySelector('.notes-input');

        let price = null;
        let consignorId = null;
        let sleeveId = null;
        let discId = null;
        let notes = notesInput ? notesInput.value.trim() : '';

        if (defaultParamsActive) {
            sleeveId = defaultParams.sleeveConditionId;
            discId = defaultParams.discConditionId;
            price = defaultParams.price;
            consignorId = defaultParams.consignorId;
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

        if (!sleeveId || !discId) {
            showStatus('Please select sleeve and disc conditions (or set defaults)', 'warning');
            return;
        }
        if (!price || price <= 0) {
            showStatus('Please enter a valid price (or set a default)', 'warning');
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
            consignor_id: consignorId,
            status_id: 1,
            notes: notes
        };

        // If there's an active draft, link the record to it via batch_id
        if (activeDraft && activeDraft.id) {
            recordData.batch_id = activeDraft.id;
            console.log(`🔗 Linking record to draft #${activeDraft.id} via batch_id`);
        }

        const result = await apiRequest('POST', '/records', recordData);
        showStatus(`✅ Record #${result.record.id} added successfully!`, 'success');
        
        // If linked to draft, add to linked records list
        if (activeDraft && activeDraft.id) {
            draftLinkedRecordIds.push(result.record.id);
            updateDraftLinkedCount();
        }
        
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
        
        clearSearch();
        await loadRecords({ statusIds: [1], mode: 'add', excludeBatch: true });
        await loadStats();
    }

    // ========== CONSOLIDATED SEARCH ==========
    function performSearch(term) {
        if (!term) { clearSearch(); return; }
        const mode = currentSearchMode;

        if (mode === 'add') {
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
        const termLower = term.trim().toLowerCase();
        const isNumeric = /^\d+$/.test(termLower);

        let source = [];
        if (currentSearchMode === 'checkout') {
            source = allRecords;
        } else if (currentSearchMode === 'delete') {
            source = allRecords;
        }

        if (!source || source.length === 0) {
            showStatus('No records loaded. Please wait or refresh.', 'warning');
            return;
        }

        let filtered;
        if (isNumeric) {
            const numericTerm = termLower;
            filtered = source.filter(r => {
                const idMatch = r.id && r.id.toString() === numericTerm;
                const barcodeMatch = r.barcode && r.barcode.trim().toLowerCase() === numericTerm;
                return idMatch || barcodeMatch;
            });
            if (filtered.length === 0) {
                filtered = source.filter(r => {
                    const artistMatch = r.artist && r.artist.toLowerCase().includes(numericTerm);
                    const titleMatch = r.title && r.title.toLowerCase().includes(numericTerm);
                    const catalogMatch = r.catalog_number && r.catalog_number.toLowerCase().includes(numericTerm);
                    return artistMatch || titleMatch || catalogMatch;
                });
            }
        } else {
            filtered = source.filter(r => {
                const artistMatch = r.artist && r.artist.toLowerCase().includes(termLower);
                const titleMatch = r.title && r.title.toLowerCase().includes(termLower);
                const catalogMatch = r.catalog_number && r.catalog_number.toLowerCase().includes(termLower);
                const barcodeMatch = r.barcode && r.barcode.trim().toLowerCase().includes(termLower);
                const idMatch = r.id && r.id.toString().includes(termLower);
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
            showStatus(`Found ${totalRecords} records matching "${term}"`, 'info');
        } else if (currentSearchMode === 'delete') {
            filteredRecords = filtered;
            totalRecords = filtered.length;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus(`Found ${totalRecords} records matching "${term}"`, 'info');
        }

        updateSelectionCount();
    }

    // ========== SCAN MODE with Duplicate Scoring ==========
    function getArtistSortKey(artistName) {
        if (!artistName) return '';
        let name = artistName.trim();
        name = name.replace(/^the\s+/i, '');
        const numberMap = {
            '10,000': 'ten thousand',
            '10000': 'ten thousand',
            '1000': 'one thousand',
            '100': 'one hundred'
        };
        const numberMatch = name.match(/^(\d{1,5}(?:,\d{3})?)\s+/);
        if (numberMatch) {
            const numberStr = numberMatch[1];
            if (numberMap[numberStr]) {
                name = numberMap[numberStr] + ' ' + name.substring(numberMatch[0].length);
            }
        }
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
            const serialized = recentScans.map(s => ({
                recordId: s.record.id,
                artist: s.record.artist,
                location: s.location,
                timestamp: s.timestamp
            }));
            localStorage.setItem('recentScans', JSON.stringify(serialized));
        } catch (e) {}
    }

    function loadRecentScansFromStorage() {
        try {
            const stored = localStorage.getItem('recentScans');
            if (stored) {
                const parsed = JSON.parse(stored);
                recentScans = parsed.map(item => ({
                    record: { id: item.recordId, artist: item.artist || 'Unknown' },
                    location: item.location,
                    timestamp: item.timestamp
                }));
                console.log(`📋 Loaded ${recentScans.length} recent scans from storage`);
            }
        } catch (e) {
            console.warn('Could not load recent scans from storage:', e);
        }
    }

    async function performScanSearch(term) {
        try {
            const data = await apiRequest('GET', '/records/search?q=' + encodeURIComponent(term));
            if (!data.records || !data.records.length) {
                playSound('error');
                showStatus('No record found with that barcode or ID', 'error');
                if (searchInput) searchInput.value = '';
                return;
            }

            const records = data.records;

            if (records.length === 1) {
                const record = records[0];
                await processScannedRecord(record);
                return;
            }

            const recentScansList = recentScans.map(s => ({
                artist: s.record.artist,
                sortKey: getArtistSortKey(s.record.artist)
            }));

            const scored = records.map(record => ({
                record: record,
                score: calculateMatchScore(record, recentScansList)
            }));

            scored.sort((a, b) => b.score - a.score);

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
                console.log(`🎯 High confidence auto-select: ${selectedRecord.artist} - ${selectedRecord.title} (score ${bestScore})`);
            } else if (bestScore > AUTO_SELECT_SCORE && (bestScore - secondScore) > AUTO_SELECT_GAP) {
                selectedRecord = best.record;
                confidence = 'medium';
                console.log(`🎯 Medium confidence auto-select: ${selectedRecord.artist} - ${selectedRecord.title} (score ${bestScore})`);
            }

            if (selectedRecord) {
                playSound('success');
                showStatus(`🎯 Auto-selected: ${selectedRecord.artist} - ${selectedRecord.title} (${confidence} confidence)`, 'success');
                await processScannedRecord(selectedRecord);
                return;
            }

            playSound('error');
            showStatus(`⚠️ Multiple records (${records.length}) found for barcode. Confidence too low to auto-select. Please use a unique barcode or ID.`, 'error');
            if (searchInput) searchInput.value = '';

        } catch (error) {
            playSound('error');
            showStatus(`Error scanning: ${error.message}`, 'error');
            console.error('Scan search error:', error);
            if (searchInput) searchInput.value = '';
        }
    }

    async function processScannedRecord(record) {
        const existing = filteredRecords.find(r => r.id === record.id);
        if (existing) {
            const today = getLocalMSTDate();
            existing.last_seen = today;
            renderPagination();
            renderTablePage();
            playSound('success');
            showStatus(`✅ Updated last_seen for #${record.id}: ${record.artist} - ${record.title}`, 'success');
            if (searchInput) searchInput.value = '';
            addToRecentScans(record, record.location || '');
            return;
        }

        filteredRecords.unshift(record);
        totalRecords = filteredRecords.length;
        currentPage = 1;
        renderPagination();
        renderTablePage();
        playSound('success');
        showStatus(`✅ Added #${record.id}: ${record.artist} - ${record.title}`, 'success');
        updateSelectionCount();
        if (searchInput) searchInput.value = '';
        addToRecentScans(record, record.location || '');
        updateScanCounter();
    }

    // ========== Discogs search, etc. ==========
    async function performDiscogsSearch(term) {
        currentMode = 'search';
        recordsTableBody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Searching Discogs...</td></tr>`;
        try {
            const formatFilterEl = document.getElementById('discogs-format-filter');
            const format = formatFilterEl ? formatFilterEl.value : 'all';
            
            const data = await apiRequest('GET', '/api/discogs/search?q=' + encodeURIComponent(term) + (format && format !== 'all' ? '&format=' + encodeURIComponent(format) : ''));
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

    async function performRefundSearch(term) {
        try {
            const data = await apiRequest('GET', '/records/search?q=' + encodeURIComponent(term));
            if (!data.records || !data.records.length) {
                playSound('error');
                showStatus('No sold record found with that search term', 'error');
                return;
            }
            const soldRecords = data.records.filter(r => r.status_id === 3 || r.status_id === 4);
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
            showStatus(`Found ${totalRecords} sold record(s)`, 'success');
            updateSelectionCount();
        } catch (error) {
            playSound('error');
            showStatus(`Error searching: ${error.message}`, 'error');
            console.error('Refund search error:', error);
        }
    }

    function performDiscogsFilterSearch(term) {
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
    }

    function clearSearch() {
        searchInput.value = '';
        if (currentSearchMode === 'add') {
            currentMode = 'inventory';
            currentResults = [];
            loadRecords({ statusIds: [1], mode: 'add', excludeBatch: true });
        } else if (currentSearchMode === 'scan') {
            // keep list
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

    // ========== Image Expand ==========
    window.expandImage = function(imageUrl, title) {
        if (!imageUrl) return;
        
        const existingModal = document.getElementById('image-expand-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'image-expand-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.style.background = 'rgba(0,0,0,0.85)';
        modal.style.zIndex = '10000';
        modal.innerHTML = `
            <div style="max-width: 90vw; max-height: 90vh; position: relative; display: flex; flex-direction: column; align-items: center;">
                <button onclick="document.getElementById('image-expand-modal').remove()" 
                        style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 24px; cursor: pointer; z-index: 10;">
                    ×
                </button>
                ${title ? `<div style="color: white; font-size: 16px; padding: 10px; text-align: center; background: rgba(0,0,0,0.5); border-radius: 8px; margin-bottom: 10px; max-width: 100%;">${escapeHtml(title)}</div>` : ''}
                <img src="${escapeHtml(imageUrl)}" 
                     style="max-width: 90vw; max-height: 80vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 30px rgba(0,0,0,0.5);">
                <div style="color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 10px;">Click outside to close</div>
            </div>
        `;
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

    // ========== Last Seen Filter ==========
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
            const result = await apiRequest('POST', '/api/discogs/create-listing-single', listingData);
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

    // ========== Discogs Post Modal ==========
    function showDiscogsPostModal() {
        const records = getSelectedRecords();
        if (records.length === 0) {
            showDiscogsStatus('No records selected. Please select a range using "from" and "to" buttons.', 'warning');
            return;
        }

        const existingModal = document.getElementById('discogs-post-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'discogs-post-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px; width: 95%;">
                <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    <h3 class="modal-title"><i class="fab fa-discogs"></i> Post Records to Discogs</h3>
                    <button class="modal-close" onclick="closeDiscogsPostModal()" style="color: white;">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 15px;">
                        <p><strong>${records.length}</strong> record(s) selected for posting.</p>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label for="discogs-post-location" style="display:block; font-weight:600; margin-bottom:4px;">
                            <i class="fas fa-map-marker-alt"></i> Location <span style="color:#dc3545;">*</span>
                        </label>
                        <input type="text" id="discogs-post-location" class="form-control" 
                               placeholder="e.g., Bin 24 | Left Top" 
                               style="width:100%; padding:10px; font-size:16px; border:1px solid #ddd; border-radius:4px;">
                        <p style="font-size:12px; color:#666; margin-top:5px;">
                            <i class="fas fa-info-circle"></i> This location will be saved to all selected records before posting.
                        </p>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="font-weight:600;">Progress</span>
                            <span id="discogs-post-progress-text">0%</span>
                        </div>
                        <div style="width:100%; height:24px; background:#e9ecef; border-radius:12px; overflow:hidden;">
                            <div id="discogs-post-progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #28a745, #20c997); transition:width 0.3s ease; border-radius:12px;"></div>
                        </div>
                    </div>

                    <div style="margin-bottom:15px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:600;"><i class="fas fa-list"></i> Status Log</span>
                            <span id="discogs-post-log-count" style="font-size:12px; color:#666;">0 / ${records.length}</span>
                        </div>
                        <div id="discogs-post-log" style="max-height:200px; overflow-y:auto; background:#f8f9fa; border:1px solid #ddd; border-radius:4px; padding:10px; font-family:monospace; font-size:13px; margin-top:5px;">
                            <div style="color:#999; text-align:center; padding:20px;">Ready to start posting...</div>
                        </div>
                    </div>

                    <div id="discogs-post-status" style="margin-top:10px; display:none;"></div>
                </div>
                <div class="modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:15px 20px; border-top:1px solid #ddd;">
                    <button class="btn btn-secondary" id="discogs-post-cancel-btn" onclick="closeDiscogsPostModal()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    <button class="btn btn-success" id="discogs-post-start-btn">
                        <i class="fab fa-discogs"></i> Start Posting
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        setTimeout(() => {
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

        updateDiscogsPostLog('info', '📋 Ready to post ' + records.length + ' records. Enter location and click Start.');
    }

    function closeDiscogsPostModal() {
        const modal = document.getElementById('discogs-post-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.remove();
        }
        isPosting = false;
        postProgress = 0;
        postResults = [];
    }

    function updateDiscogsPostProgress(current, total) {
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        postProgress = percent;
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
        if (placeholder) {
            placeholder.remove();
        }

        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.style.padding = '4px 0';
        entry.style.borderBottom = '1px solid #f0f0f0';
        entry.style.fontSize = '12px';

        let color = '#333';
        let icon = 'ℹ️';
        if (type === 'success') { color = '#28a745'; icon = '✅'; }
        else if (type === 'error') { color = '#dc3545'; icon = '❌'; }
        else if (type === 'warning') { color = '#ffc107'; icon = '⚠️'; }
        else { color = '#007bff'; icon = 'ℹ️'; }

        entry.innerHTML = `<span style="color:#999;">[${timestamp}]</span> <span style="color:${color};">${icon} ${escapeHtml(message)}</span>`;
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;

        const entries = logContainer.querySelectorAll('div:not([style*="color:#999"])');
        if (logCount) {
            const total = document.querySelector('#discogs-post-progress-text')?.textContent?.replace('%', '') || '0';
            logCount.textContent = `${entries.length} / ${Math.round((postProgress / 100) * (entries.length || 1))}`;
        }
    }

    function showDiscogsPostStatus(message, type) {
        const el = document.getElementById('discogs-post-status');
        if (el) {
            el.textContent = message;
            el.className = `status-message status-${type}`;
            el.style.display = 'block';
        }
    }

    async function startDiscogsPosting(records) {
        if (isPosting) return;
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
        if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Posting...'; }
        if (cancelBtn) { cancelBtn.disabled = true; }

        isPosting = true;
        postResults = [];
        let successCount = 0;
        let failCount = 0;

        updateDiscogsPostLog('info', '📍 Location set to: ' + location);
        updateDiscogsPostLog('info', '🚀 Starting to post ' + records.length + ' records...');

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const current = i + 1;

            updateDiscogsPostProgress(current, records.length);

            try {
                updateDiscogsPostLog('info', `📝 Updating location for #${record.id}: ${record.artist} - ${record.title}`);
                await apiRequest('PUT', '/records/' + record.id, { location: location });

                updateDiscogsPostLog('info', `💰 Calculating price for #${record.id}...`);
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

                updateDiscogsPostLog('info', `📤 Posting #${record.id}: ${record.artist} - ${record.title} at $${discogsPrice}...`);
                
                const listingData = {
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

                const result = await apiRequest('POST', '/api/discogs/create-listing-single', listingData);

                if (result.success) {
                    successCount++;
                    updateDiscogsPostLog('success', `✅ #${record.id}: ${record.artist} - ${record.title} posted successfully!`);
                } else {
                    throw new Error(result.error || 'Discogs API returned error');
                }

            } catch (error) {
                failCount++;
                updateDiscogsPostLog('error', `❌ #${record.id}: ${record.artist} - ${record.title} failed - ${error.message}`);
                console.error('Error posting record #' + record.id, error);
            }

            if (i < records.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        isPosting = false;
        updateDiscogsPostProgress(records.length, records.length);

        const summary = `✅ ${successCount} posted successfully, ❌ ${failCount} failed.`;
        updateDiscogsPostLog('info', '📊 ' + summary);

        if (failCount === 0) {
            showDiscogsPostStatus(`🎉 All ${records.length} records posted successfully!`, 'success');
            playSound('success');
        } else if (successCount > 0) {
            showDiscogsPostStatus(`⚠️ ${successCount} posted, ${failCount} failed. Check log for details.`, 'warning');
            playSound('error');
        } else {
            showDiscogsPostStatus(`❌ All ${records.length} records failed to post.`, 'error');
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
                await apiRequest('DELETE', '/records/' + record.id);
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

    // ========== SET ACTIVE - REMOVED ==========
    // The Set Active button has been removed. Records are set to Active when a draft is accepted.

    // ========== Print Price Tags ==========
    function printPriceTags() {
        let records = [];
        
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
        const record = allRecords.find(r => r.id === recordId);
        if (!record) return;
        if (!checkoutSelectedItems.some(r => r.id === recordId)) {
            checkoutSelectedItems.push(record);
            showStatus(`Added "${record.artist} - ${record.title}" to checkout`, 'success');
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
        } else {
            showStatus('Record already in checkout list', 'info');
        }
    }

    function removeFromCheckout(recordId) {
        const index = checkoutSelectedItems.findIndex(r => r.id === recordId);
        if (index !== -1) {
            const removed = checkoutSelectedItems.splice(index, 1)[0];
            showStatus(`Removed "${removed.artist} - ${removed.title}" from checkout`, 'info');
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
                filteredRecords = [];
                totalRecords = 0;
                renderPagination();
                renderTablePage();
            }
        }
    }

    // ========== Square Payment Processing ==========
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
                    device_id: deviceId
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
        const maxAttempts = 60;

        squarePollInterval = setInterval(async () => {
            attempts++;
            try {
                const response = await fetch(window.AppConfig.baseUrl + `/api/square/terminal/checkout/${checkoutId}/status`, {
                    credentials: 'include',
                    headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
                });
                const data = await response.json();
                if (data.status !== 'success') {
                    return;
                }

                const checkout = data.checkout;
                const status = checkout.status;

                if (status === 'COMPLETED') {
                    clearInterval(squarePollInterval);
                    squarePollInterval = null;
                    statusDiv.textContent = '✅ Payment completed successfully!';
                    statusDiv.className = 'status-message status-success';
                    await completeCheckout();
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
            }
        }, 2000);
    }
  
    async function completeCheckout() {
        if (checkoutRemaining > 0.01) {
            showCheckoutStatus('Remaining balance not covered', 'error');
            return;
        }

        const selected = checkoutSelectedItems;
        if (selected.length === 0) return;

        const today = getLocalMSTDate();
        let success = 0;
        let bernieTotal = 0;
        let consignorTransactions = [];

        const regularRecords = [];
        const bernieItems = [];
        const consignorRecords = [];

        for (const record of selected) {
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

        bernieTotal = bernieItems.reduce((sum, r) => sum + (r.store_price || 0), 0);

        for (const record of regularRecords) {
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

        for (const record of consignorRecords) {
            try {
                let consignorName = 'Unknown Consignor';
                try {
                    const userRes = await apiRequest('GET', '/users/' + record.consignor_id);
                    if (userRes && userRes.id) {
                        consignorName = userRes.full_name || userRes.username || 'Consignor-' + record.consignor_id;
                    }
                } catch (userErr) {
                    console.warn('Could not fetch consignor name for ID:', record.consignor_id, userErr);
                    consignorName = 'Consignor-' + record.consignor_id;
                }

                const salePrice = record.store_price || 0;
                const commissionRate = record.commission_rate || 0.3;
                const consignorShare = salePrice * (1 - commissionRate);
                const storeCommission = salePrice * commissionRate;

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

        for (const tx of consignorTransactions) {
            try {
                const accountsRes = await apiRequest('GET', '/api/accounting/accounts');
                const accounts = accountsRes.accounts || [];
                const cashAccount = accounts.find(a => a.code === '1015');
                const revenueAccount = accounts.find(a => a.code === '4000');
                const payableAccount = accounts.find(a => a.code === '2015');

                if (!cashAccount || !revenueAccount || !payableAccount) {
                    console.error('Required accounts not found for consignor transaction');
                    showCheckoutStatus('Error: Required accounts not found', 'error');
                    continue;
                }

                const entryData = {
                    date: today,
                    description: `${tx.consignor_name} | ISSUE | Record #${tx.record_id} sold - $${tx.sale_price.toFixed(2)} (${(tx.commission_rate * 100).toFixed(0)}% commission)`,
                    lines: [
                        { account_id: cashAccount.id, debit: tx.sale_price, credit: 0 },
                        { account_id: revenueAccount.id, debit: 0, credit: tx.store_commission },
                        { account_id: payableAccount.id, debit: 0, credit: tx.consignor_share }
                    ]
                };
                const result = await apiRequest('POST', '/api/accounting/manual', entryData);
                if (result.status === 'success') {
                    console.log(`✅ Consignor ${tx.consignor_name} credited $${tx.consignor_share.toFixed(2)}`);
                } else {
                    console.error('Failed to create consignor journal entry:', result.error);
                }
            } catch (err) {
                console.error('Error processing consignor transaction:', err);
            }
        }

        if (bernieTotal > 0) {
            try {
                const accountsRes = await apiRequest('GET', '/api/accounting/accounts');
                const accounts = accountsRes.accounts || [];

                const paymentMethod = checkoutPaymentEntries.length > 0 ? checkoutPaymentEntries[0].method : 'Cash';
                const accountMap = {
                    'Cash': '1015',
                    'Card (Square)': '1030',
                    'Gift Card': '1015',
                    'Store Credit': '1015'
                };
                const accountCode = accountMap[paymentMethod] || '1015';

                const cashAccount = accounts.find(a => a.code === accountCode);
                const payableAccount = accounts.find(a => a.code === '2015');

                if (cashAccount && payableAccount) {
                    const entryData = {
                        date: today,
                        description: `BERNIE | ISSUE | Donation - $${bernieTotal.toFixed(2)} (${bernieItems.length} items)`,
                        lines: [
                            { account_id: cashAccount.id, debit: bernieTotal, credit: 0 },
                            { account_id: payableAccount.id, debit: 0, credit: bernieTotal }
                        ]
                    };
                    const result = await apiRequest('POST', '/api/accounting/manual', entryData);
                    if (result.status === 'success') {
                        console.log(`✅ Bernie donation journal entry created: $${bernieTotal.toFixed(2)}`);
                    } else {
                        console.error('Failed to create Bernie journal entry:', result.error);
                    }
                }
            } catch (err) {
                console.error('Error processing Bernie donation:', err);
            }
        }

        let receiptError = null;
        let receiptDownloaded = false;

        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        let receipt = 'PigStyle Music\n';
        receipt += '====================\n';
        receipt += `${dateStr} ${timeStr}\n\n`;
        receipt += 'ITEMS:\n';
        receipt += '--------------------\n';

        let subtotal = 0;
        for (const item of selected) {
            const price = item.store_price || 0;
            const desc = item.isCustom ? item.title : `${item.artist} - ${item.title}`;
            if (item.isBernie) {
                receipt += `[Bernie] ${desc.padEnd(25)}$${price.toFixed(2)}\n`;
            } else if (item.consignor_id && item.consignor_id !== 1) {
                receipt += `[Consignor] ${desc.padEnd(25)}$${price.toFixed(2)}\n`;
            } else {
                receipt += `${desc.padEnd(25)}$${price.toFixed(2)}\n`;
            }
            subtotal += price;
        }

        const taxRate = 0.08;
        const tax = subtotal * taxRate;
        const grandTotal = subtotal + tax;

        receipt += '--------------------\n';
        receipt += `${'Subtotal'.padEnd(25)}$${subtotal.toFixed(2)}\n`;
        receipt += `${'Tax'.padEnd(25)}$${tax.toFixed(2)}\n`;
        receipt += `${'Total'.padEnd(25)}$${grandTotal.toFixed(2)}\n\n`;

        receipt += 'PAYMENT:\n';
        receipt += '--------------------\n';
        let totalPaid = 0;
        for (const entry of checkoutPaymentEntries) {
            receipt += `${entry.method.padEnd(25)}$${entry.amount.toFixed(2)}\n`;
            totalPaid += entry.amount;
        }
        if (totalPaid < grandTotal) {
            receipt += `${'Unpaid'.padEnd(25)}$${(grandTotal - totalPaid).toFixed(2)}\n`;
        }
        receipt += '--------------------\n';

        receipt += 'Thank you!\n';
        receipt += 'PigStyle Music\n';
        receipt += 'Come back soon!\n\n\n\n';

        const filename = `receipt_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.txt`;

        try {
            downloadReceipt(receipt, filename);
            receiptDownloaded = true;
        } catch (error) {
            receiptError = error.message || 'Download error';
            console.error('Receipt download error:', error);
        }

        const consignorCount = consignorTransactions.length;
        const consignorTotal = consignorTransactions.reduce((sum, t) => sum + t.consignor_share, 0);

        let statusMsg = `${success} records marked as sold`;
        if (consignorCount > 0) {
            statusMsg += `, ${consignorCount} consignor(s) credited $${consignorTotal.toFixed(2)}`;
        }
        if (bernieTotal > 0) {
            statusMsg += `, Bernie donations: $${bernieTotal.toFixed(2)}`;
        }

        if (receiptDownloaded) {
            statusMsg += ' ✅ Receipt downloaded.';
        } else if (receiptError) {
            statusMsg += ` ⚠️ Receipt could not be downloaded (${receiptError}). Purchase completed anyway.`;
        }

        showCheckoutStatus('✅ ' + statusMsg, receiptError ? 'warning' : 'success');

        checkoutSelectedItems = [];
        checkoutViewMode = 'list';
        checkoutPaymentEntries = [];
        checkoutRemaining = 0;

        const modal = document.getElementById('checkout-payment-modal');
        if (modal) {
            modal.style.display = 'none';
        }

        filteredRecords = [];
        totalRecords = 0;
        renderPagination();
        renderTablePage();

        if (checkoutShowSelectedBtn) {
            checkoutShowSelectedBtn.textContent = `Checkout List (0)`;
        }
        updateSelectionCount();

        playSound('success');
    }

    // ========== Show Checkout Modal (with unified debtor lookup) ==========
    let checkoutDebtorData = null;

    function showCheckoutModal() {
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

        const orderId = generateOrderId();

        let modal = document.createElement('div');
        modal.id = 'checkout-payment-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 550px; width: 95%;">
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
                    
                    <div style="background: #e3f2fd; padding: 12px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #b8daff;">
                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            <input type="text" id="checkout-debtor-code" placeholder="GIFT-XXXXX or debtor name" style="flex: 2; min-width: 150px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <button class="btn btn-sm btn-primary" onclick="lookupDebtorForCheckout()" style="padding: 6px 12px;">
                                <i class="fas fa-search"></i> Lookup
                            </button>
                        </div>
                        <div id="checkout-debtor-info" style="display: none; margin-top: 8px; padding: 8px; background: white; border-radius: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                                <span><strong id="checkout-debtor-name">—</strong> <span id="checkout-debtor-type" style="font-size: 12px; color: #666;">(Store Credit)</span></span>
                                <span style="font-weight: bold; color: #28a745;">Balance: $<span id="checkout-debtor-balance">0.00</span></span>
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                                <button class="btn btn-sm btn-success" onclick="applyDebtorToCheckout()" style="padding: 6px 12px;">
                                    <i class="fas fa-check"></i> Apply Credit
                                </button>
                                <button class="btn btn-sm btn-secondary" onclick="document.getElementById('checkout-debtor-info').style.display='none'">
                                    <i class="fas fa-times"></i> Cancel
                                </button>
                            </div>
                            <div id="checkout-debtor-status" style="font-size: 13px; margin-top: 5px;"></div>
                        </div>
                        <div style="font-size: 12px; color: #666; margin-top: 6px;">
                            <i class="fas fa-info-circle"></i> Enter a gift card code (GIFT-XXXXX) or a store credit debtor name. Click Apply to use the balance.
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin: 10px 0;">
                        <input type="number" id="checkout-payment-amount" class="form-control" placeholder="Amount" step="0.01" min="0" style="flex: 1; min-width: 100px;">
                        <select id="checkout-payment-method" class="form-control" style="flex: 1; min-width: 120px;">
                            <option value="Cash" selected>Cash</option>
                            <option value="Card (Square)">Card (Square)</option>
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
                showCheckoutStatus('Square POS is not available. Please use Cash.', 'error');
                return;
            }

            addPaymentEntry(method, amount);
        };

        document.getElementById('checkout-complete-payment').onclick = function() {
            if (checkoutRemaining > 0.01) {
                showCheckoutStatus('Remaining balance not covered', 'error');
                return;
            }
            const methodSelect3 = document.getElementById('checkout-payment-method');
            const method = methodSelect3.value;
            if (method === 'Card (Square)') {
                processSquarePayment();
            } else {
                completeCheckout();
            }
        };

        modal.style.display = 'flex';
        updateCheckoutCompleteButton();

        const statusDiv = document.getElementById('checkout-square-status');
        if (statusDiv) {
            statusDiv.style.display = 'none';
            statusDiv.textContent = '';
        }
    }

    // ========== Add Payment Entry ==========
    function addPaymentEntry(method, amount) {
        if (amount > checkoutRemaining && checkoutRemaining > 0) {
            // allow overpayment
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

    // ========== UNIFIED DEBTOR LOOKUP FOR CHECKOUT ==========

    async function lookupDebtorForCheckout() {
        const input = document.getElementById('checkout-debtor-code');
        const infoDiv = document.getElementById('checkout-debtor-info');
        const statusEl = document.getElementById('checkout-debtor-status');
        const nameEl = document.getElementById('checkout-debtor-name');
        const typeEl = document.getElementById('checkout-debtor-type');
        const balanceEl = document.getElementById('checkout-debtor-balance');
        
        if (!input) return;
        
        const code = input.value.trim().toUpperCase();
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
            const response = await fetch(`${AppConfig.baseUrl}/api/debtor/lookup`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: code })
            });
            
            const data = await response.json();
            
            if (data.status === 'success' && data.balance !== undefined) {
                checkoutDebtorData = data;
                const balance = data.balance || 0;
                const isGiftCard = data.is_gift_card;
                const isBernie = data.is_bernie;
                
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
                    statusEl.textContent = `✅ Balance available: $${balance.toFixed(2)}. Click Apply to use it.`;
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

    // ========== APPLY DEBTOR TO CHECKOUT (Auto-Apply) ==========

    async function applyDebtorToCheckout() {
        if (!checkoutDebtorData) {
            showCheckoutStatus('Please lookup a debtor first.', 'error');
            return;
        }
        
        const statusEl = document.getElementById('checkout-debtor-status');
        const balance = checkoutDebtorData.balance;
        
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
        
        const amount = Math.min(balance, checkoutRemaining);
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/debtor/redeem`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: checkoutDebtorData.debtor,
                    amount: amount,
                    description: `Checkout redemption - ${checkoutSelectedItems.length} items`
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                const method = checkoutDebtorData.is_gift_card ? 'Gift Card' : 'Store Credit';
                addPaymentEntry(method + ' (' + checkoutDebtorData.debtor + ')', amount);
                
                checkoutDebtorData.balance -= amount;
                document.getElementById('checkout-debtor-balance').textContent = checkoutDebtorData.balance.toFixed(2);
                
                if (checkoutDebtorData.balance <= 0.01) {
                    statusEl.textContent = `✅ Applied $${amount.toFixed(2)} from ${checkoutDebtorData.debtor}. Card is now empty.`;
                    statusEl.style.color = '#28a745';
                    setTimeout(() => {
                        document.getElementById('checkout-debtor-info').style.display = 'none';
                    }, 2000);
                } else {
                    statusEl.textContent = `✅ Applied $${amount.toFixed(2)} from ${checkoutDebtorData.debtor}. Remaining balance: $${checkoutDebtorData.balance.toFixed(2)}`;
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
        const mode = currentSearchMode;
        console.log(`🔵 handleCompleteAction called for mode: ${mode}`);
        if (mode === 'add') {
            showStatus('Use Print or Set Active buttons.', 'info');
        } else if (mode === 'scan') {
            applyScanLocation();
        } else if (mode === 'discogs') {
            console.log(`🔵 handleCompleteAction: calling showDiscogsPostModal`);
            showDiscogsPostModal();
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
        } else if (mode === 'refund') {
            processRefund();
        } else {
            showStatus('No action available for this mode', 'warning');
        }
    }

    // ========== DRAFT PURCHASE FUNCTIONS ==========

    function updateDraftLinkedCount() {
        if (draftLinkedCount) {
            draftLinkedCount.textContent = draftLinkedRecordIds.length;
        }
    }

    async function loadActiveDraft() {
        console.log('📋 loadActiveDraft: loading active draft...');
        try {
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/draft', {
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            const data = await response.json();
            console.log('📋 loadActiveDraft: response received', data);
            
            if (data.status === 'success' && data.draft) {
                activeDraft = data.draft;
                draftLinkedRecordIds = data.draft.record_ids || [];
                console.log(`📋 loadActiveDraft: active draft found ID: ${activeDraft.id}, records: ${draftLinkedRecordIds.length}`);
                showActiveDraftUI();
                updateDraftLinkedCount();
            } else {
                activeDraft = null;
                draftLinkedRecordIds = [];
                console.log('📋 loadActiveDraft: no active draft found');
                showDraftFormUI();
                updateDraftLinkedCount();
            }
        } catch (error) {
            console.error('❌ loadActiveDraft error:', error);
            activeDraft = null;
            draftLinkedRecordIds = [];
            showDraftFormUI();
            updateDraftLinkedCount();
        }
    }

    function showDraftFormUI() {
        console.log('📋 showDraftFormUI: showing draft form');
        if (draftFormSection) {
            draftFormSection.style.display = 'block';
        }
        if (activeDraftSection) {
            activeDraftSection.style.display = 'none';
        }
        if (draftSellerName) draftSellerName.value = '';
        if (draftSellerContact) draftSellerContact.value = '';
        if (draftDescription) draftDescription.value = '';
    }

    function showActiveDraftUI() {
        console.log('📋 showActiveDraftUI: showing active draft');
        if (draftFormSection) {
            draftFormSection.style.display = 'none';
        }
        if (activeDraftSection) {
            activeDraftSection.style.display = 'block';
        }
        if (draftDisplaySeller && activeDraft) {
            draftDisplaySeller.textContent = activeDraft.seller_name || '—';
        }
        if (draftDisplayContact && activeDraft) {
            draftDisplayContact.textContent = activeDraft.seller_contact || '—';
        }
        if (draftDisplayDescription && activeDraft) {
            draftDisplayDescription.textContent = activeDraft.description || '—';
        }
        if (draftDisplayId && activeDraft) {
            draftDisplayId.textContent = activeDraft.id || '—';
        }
        updateDraftLinkedCount();
    }

    function toggleParamsPurchasePanel() {
        console.log('📋 toggleParamsPurchasePanel called');
        const body = document.getElementById('params-purchase-body');
        const icon = document.getElementById('params-purchase-toggle-icon');
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

    async function createDraftPurchase() {
        console.log('📋 createDraftPurchase: START');
        const sellerName = draftSellerName ? draftSellerName.value.trim() : '';
        const sellerContact = draftSellerContact ? draftSellerContact.value.trim() : '';
        const description = draftDescription ? draftDescription.value.trim() : '';
        
        console.log(`📋 createDraftPurchase: sellerName="${sellerName}", contact="${sellerContact}", description="${description}"`);
        
        if (!sellerName) {
            console.log('❌ createDraftPurchase: seller name required');
            showToast('Please enter the seller name.', 'error');
            showDraftStatus('Please enter the seller name.', 'error');
            return;
        }
        if (!description) {
            console.log('❌ createDraftPurchase: description required');
            showToast('Please enter a description of the items.', 'error');
            showDraftStatus('Please enter a description of the items.', 'error');
            return;
        }
        
        const requestBody = {
            seller_name: sellerName,
            seller_contact: sellerContact,
            description: description
        };
        console.log('📋 createDraftPurchase: request body', requestBody);
        
        try {
            console.log('📋 createDraftPurchase: sending POST to /api/purchases/draft');
            const response = await fetch(window.AppConfig.baseUrl + '/api/purchases/draft', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            console.log(`📋 createDraftPurchase: response status ${response.status}`);
            
            const data = await response.json();
            console.log('📋 createDraftPurchase: response data', data);
            
            if (data.status === 'success') {
                activeDraft = data.draft;
                draftLinkedRecordIds = [];
                showActiveDraftUI();
                updateDraftLinkedCount();
                showToast('✅ Draft purchase created successfully! Receipt downloaded.', 'success');
                showDraftStatus('✅ Draft purchase created successfully! Receipt downloaded.', 'success');
                playSound('success');
                
                const receiptText = generateDraftReceipt(activeDraft);
                console.log(`📋 createDraftPurchase: receipt length ${receiptText.length}, downloading...`);
                downloadReceipt(receiptText, `draft_receipt_${activeDraft.id}.txt`);
                console.log('📋 createDraftPurchase: receipt downloaded');
            } else {
                console.error('❌ createDraftPurchase: API returned error', data);
                showToast('❌ Error: ' + (data.error || 'Unknown error'), 'error');
                showDraftStatus('❌ Error: ' + (data.error || 'Unknown error'), 'error');
                playSound('error');
            }
        } catch (error) {
            console.error('❌ createDraftPurchase: exception caught', error);
            showToast('❌ Error: ' + error.message, 'error');
            showDraftStatus('❌ Error: ' + error.message, 'error');
            playSound('error');
        }
        console.log('📋 createDraftPurchase: END');
    }

    function generateDraftReceipt(draft) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        let receipt = 'PIGSTYLE MUSIC\n';
        receipt += '====================\n';
        receipt += 'DRAFT PURCHASE RECEIPT\n';
        receipt += `${dateStr} ${timeStr}\n\n`;
        receipt += `Draft ID: ${draft.id}\n`;
        receipt += `Seller: ${draft.seller_name}\n`;
        if (draft.seller_contact) {
            receipt += `Contact: ${draft.seller_contact}\n`;
        }
        receipt += `Description: ${draft.description}\n`;
        receipt += '\n';
        receipt += 'This is a draft receipt for items received.\n';
        receipt += 'Records will be added and final offer will be determined.\n\n';
        receipt += '---\n';
        receipt += 'PigStyle Music\n';
        receipt += 'Thank you!\n';
        
        return receipt;
    }

    async function acceptDraftWithSignature() {
        console.log('📋 acceptDraftWithSignature: START');
        console.log('📋 acceptDraftWithSignature: activeDraft =', activeDraft);
        console.log('📋 acceptDraftWithSignature: draftLinkedRecordIds =', draftLinkedRecordIds);
        
        if (!activeDraft) {
            console.log('❌ acceptDraftWithSignature: no active draft');
            showToast('No active draft to accept.', 'error');
            showDraftStatus('No active draft to accept.', 'error');
            return;
        }
        
        const offerAmount = draftOfferAmount ? parseFloat(draftOfferAmount.value) : 0;
        console.log(`📋 acceptDraftWithSignature: offerAmount = ${offerAmount}, raw value = "${draftOfferAmount ? draftOfferAmount.value : 'null'}"`);
        
        if (isNaN(offerAmount) || offerAmount <= 0) {
            console.log('❌ acceptDraftWithSignature: invalid offer amount');
            showToast('Please enter a valid offer amount.', 'error');
            showDraftStatus('Please enter a valid offer amount.', 'error');
            return;
        }
        
        if (draftLinkedRecordIds.length === 0) {
            console.log('❌ acceptDraftWithSignature: no records linked');
            showToast('No records linked to this draft. Add records first.', 'error');
            showDraftStatus('No records linked to this draft. Add records first.', 'error');
            return;
        }
        
        const signatureMethod = confirm('Square POS signature? Click OK for Square POS, Cancel for Print & Upload.');
        console.log(`📋 acceptDraftWithSignature: signatureMethod = ${signatureMethod ? 'square' : 'upload'}`);
        
        const requestBody = {
            offer_amount: offerAmount,
            signature_method: signatureMethod ? 'square' : 'upload',
            record_ids: draftLinkedRecordIds
        };
        console.log('📋 acceptDraftWithSignature: request body', requestBody);
        
        try {
            console.log(`📋 acceptDraftWithSignature: sending PUT to /api/purchases/draft/${activeDraft.id}`);
            const response = await fetch(window.AppConfig.baseUrl + `/api/purchases/draft/${activeDraft.id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            console.log(`📋 acceptDraftWithSignature: response status ${response.status}`);
            
            const data = await response.json();
            console.log('📋 acceptDraftWithSignature: response data', data);
            
            if (data.status === 'success') {
                // Get the record IDs from the response
                const recordIds = data.record_ids || draftLinkedRecordIds;
                
                // Generate price tags PDF
                console.log('📋 acceptDraftWithSignature: generating price tags for', recordIds.length, 'records');
                const recordsToPrint = [];
                for (const id of recordIds) {
                    const record = filteredRecords.find(r => r.id === id) || allRecords.find(r => r.id === id);
                    if (record) {
                        recordsToPrint.push(record);
                    }
                }
                
                if (recordsToPrint.length > 0) {
                    await generatePDF(recordsToPrint);
                    console.log('📋 acceptDraftWithSignature: price tags generated');
                    showToast(`📄 Price tags generated for ${recordsToPrint.length} records.`, 'success');
                }
                
                showToast(`✅ Draft accepted! Offer: $${offerAmount.toFixed(2)}`, 'success');
                showDraftStatus(`✅ Draft accepted! Offer: $${offerAmount.toFixed(2)}`, 'success');
                playSound('success');
                
                if (signatureMethod) {
                    console.log('📋 acceptDraftWithSignature: sending to Square POS');
                    await sendBillToSquarePOS(activeDraft, offerAmount, draftLinkedRecordIds);
                } else {
                    console.log('📋 acceptDraftWithSignature: generating bill of sale');
                    const billText = generateBillOfSale(activeDraft, offerAmount, draftLinkedRecordIds);
                    downloadReceipt(billText, `bill_of_sale_${activeDraft.id}.txt`);
                    showToast('📄 Bill of Sale downloaded. Have customer sign, take photo, and upload.', 'info');
                    showDraftStatus('📄 Bill of Sale downloaded. Have customer sign, take photo, and upload.', 'info');
                }
                
                activeDraft = null;
                draftLinkedRecordIds = [];
                showDraftFormUI();
                updateDraftLinkedCount();
                if (draftOfferAmount) draftOfferAmount.value = '';
                
                // Reload records - exclude batch records
                await loadRecords({ statusIds: [1], mode: 'add', excludeBatch: true });
            } else {
                console.error('❌ acceptDraftWithSignature: API returned error', data);
                showToast('❌ Error: ' + (data.error || 'Unknown error'), 'error');
                showDraftStatus('❌ Error: ' + (data.error || 'Unknown error'), 'error');
                playSound('error');
            }
        } catch (error) {
            console.error('❌ acceptDraftWithSignature: exception caught', error);
            showToast('❌ Error: ' + error.message, 'error');
            showDraftStatus('❌ Error: ' + error.message, 'error');
            playSound('error');
        }
        console.log('📋 acceptDraftWithSignature: END');
    }

    async function sendBillToSquarePOS(draft, offerAmount, recordIds) {
        try {
            const recordDetails = [];
            for (const id of recordIds) {
                const record = filteredRecords.find(r => r.id === id) || allRecords.find(r => r.id === id);
                if (record) {
                    recordDetails.push({
                        id: record.id,
                        artist: record.artist || 'Unknown',
                        title: record.title || 'Unknown',
                        price: record.store_price || 0
                    });
                }
            }
            
            console.log('📋 sendBillToSquarePOS: sending request');
            const response = await fetch(window.AppConfig.baseUrl + '/api/square/bill-of-sale', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    draft_id: draft.id,
                    seller_name: draft.seller_name,
                    offer_amount: offerAmount,
                    records: recordDetails,
                    signature_method: 'square'
                })
            });
            const data = await response.json();
            console.log('📋 sendBillToSquarePOS: response', data);
            
            if (data.status === 'success') {
                showToast('✅ Bill of Sale sent to Square POS. Customer can sign on terminal.', 'success');
                showDraftStatus('✅ Bill of Sale sent to Square POS. Customer can sign on terminal.', 'success');
                playSound('success');
            } else {
                showToast('⚠️ Could not send to Square POS: ' + (data.error || 'Unknown error'), 'warning');
                showDraftStatus('⚠️ Could not send to Square POS: ' + (data.error || 'Unknown error'), 'warning');
            }
        } catch (error) {
            console.error('Error sending to Square POS:', error);
            showToast('⚠️ Could not send to Square POS: ' + error.message, 'warning');
            showDraftStatus('⚠️ Could not send to Square POS: ' + error.message, 'warning');
        }
    }

    function generateBillOfSale(draft, offerAmount, recordIds) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        let bill = 'PIGSTYLE MUSIC\n';
        bill += '====================\n';
        bill += 'BILL OF SALE\n';
        bill += `${dateStr} ${timeStr}\n\n`;
        bill += `Draft ID: ${draft.id}\n`;
        bill += `Seller: ${draft.seller_name}\n`;
        if (draft.seller_contact) {
            bill += `Contact: ${draft.seller_contact}\n`;
        }
        bill += `Description: ${draft.description}\n`;
        bill += '\n';
        bill += 'ITEMS:\n';
        bill += '--------------------\n';
        
        let totalValue = 0;
        for (const id of recordIds) {
            const record = filteredRecords.find(r => r.id === id) || allRecords.find(r => r.id === id);
            if (record) {
                const price = record.store_price || 0;
                const itemLine = `${record.artist} - ${record.title}`;
                const padding = Math.max(1, 30 - itemLine.length);
                bill += itemLine;
                bill += ' '.repeat(padding);
                bill += `$${price.toFixed(2)}\n`;
                totalValue += price;
            }
        }
        
        bill += '--------------------\n';
        bill += `${'Total Value'.padEnd(25)} $${totalValue.toFixed(2)}\n`;
        bill += `${'Offer Amount'.padEnd(25)} $${offerAmount.toFixed(2)}\n`;
        bill += '\n';
        bill += 'Seller Signature: ____________________\n';
        bill += 'Store Rep: ____________________\n';
        bill += '\n';
        bill += '---\n';
        bill += 'PigStyle Music\n';
        bill += 'Thank you for your business!\n';
        
        return bill;
    }

    async function declineDraft() {
        console.log('📋 declineDraft: START');
        console.log('📋 declineDraft: activeDraft =', activeDraft);
        
        if (!activeDraft) {
            console.log('❌ declineDraft: no active draft');
            showToast('No active draft to decline.', 'error');
            showDraftStatus('No active draft to decline.', 'error');
            return;
        }
        
        if (!confirm(`Decline this draft? This will delete ALL ${draftLinkedRecordIds.length} linked records. This cannot be undone.`)) {
            console.log('📋 declineDraft: cancelled by user');
            return;
        }
        
        try {
            console.log(`📋 declineDraft: sending DELETE to /api/purchases/draft/${activeDraft.id}`);
            const response = await fetch(window.AppConfig.baseUrl + `/api/purchases/draft/${activeDraft.id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
            });
            console.log(`📋 declineDraft: response status ${response.status}`);
            
            const data = await response.json();
            console.log('📋 declineDraft: response data', data);
            
            if (data.status === 'success') {
                showToast(`✅ Draft declined. ${data.deleted_count || 0} records deleted.`, 'success');
                showDraftStatus(`✅ Draft declined. ${data.deleted_count || 0} records deleted.`, 'success');
                playSound('success');
                
                activeDraft = null;
                draftLinkedRecordIds = [];
                showDraftFormUI();
                updateDraftLinkedCount();
                if (draftOfferAmount) draftOfferAmount.value = '';
                
                await loadRecords({ statusIds: [1], mode: 'add', excludeBatch: true });
            } else {
                console.error('❌ declineDraft: API returned error', data);
                showToast('❌ Error: ' + (data.error || 'Unknown error'), 'error');
                showDraftStatus('❌ Error: ' + (data.error || 'Unknown error'), 'error');
                playSound('error');
            }
        } catch (error) {
            console.error('❌ declineDraft: exception caught', error);
            showToast('❌ Error: ' + error.message, 'error');
            showDraftStatus('❌ Error: ' + error.message, 'error');
            playSound('error');
        }
        console.log('📋 declineDraft: END');
    }

    function showDraftStatus(message, type) {
        const el = draftStatusMessage || document.getElementById('draft-status-message');
        if (!el) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        el.className = `status-message status-${type}`;
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    }

    function clearDraftForm() {
        if (draftSellerName) draftSellerName.value = '';
        if (draftSellerContact) draftSellerContact.value = '';
        if (draftDescription) draftDescription.value = '';
        const statusEl = document.getElementById('draft-status-message');
        if (statusEl) statusEl.style.display = 'none';
    }

    // ========== Pagination ==========
    function renderPagination() {
        const paginationEl = document.querySelector('.pagination');
        if (paginationEl) paginationEl.style.display = 'flex';
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

    // ========== Unified Selection Logic ==========
    function getSelectedRecords() {
        if (currentSearchMode === 'checkout') {
            return checkoutSelectedItems.slice();
        }
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
        const hasSelection = (rangeFromIndex !== null && rangeToIndex !== null && count > 0);

        const isAddMode = mode === 'add';
        const isRefundMode = mode === 'refund';
        
        // Set Active button is REMOVED - no longer needed
        
        if (isAddMode) {
            const hasTargets = hasSelection || hasRecords;
            printBtn.disabled = !hasTargets;
            if (hasSelection) {
                printBtn.textContent = `🖨️ Print (${count} selected)`;
            } else {
                printBtn.textContent = '🖨️ Print (all)';
            }
            printBtn.style.display = '';
        } else {
            printBtn.style.display = 'none';
        }

        // Complete button is controlled by showPanelsForMode
        // Only update disabled state and text here
        if (completeActionBtn && mode !== 'add') {
            if (mode === 'scan') {
                const genre = scanGenreSelect ? scanGenreSelect.value : '';
                const sublocation = scanSublocation ? scanSublocation.value : '';
                const isValid = genre && sublocation && hasRecords;
                completeActionBtn.disabled = !isValid;
            } else if (mode === 'discogs') {
                completeActionBtn.disabled = !hasSelection;
            } else if (mode === 'delete') {
                completeActionBtn.disabled = !hasSelection;
            } else if (mode === 'checkout') {
                completeActionBtn.disabled = checkoutSelectedItems.length === 0;
            } else if (mode === 'discogs_orders') {
                const hasOrder = selectedOrderId !== null;
                const hasItems = filteredRecords.length > 0;
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
        const totalPages = Math.ceil(totalRecords / pageSize) || 1;
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
        console.log(`📄 generatePDF: generating PDF for ${records.length} records`);
        const { jsPDF } = window.jspdf;

        const labelWidthMM = parseFloat((await apiRequest('GET', '/config/LABEL_WIDTH_MM')).config_value);
        const labelHeightMM = parseFloat((await apiRequest('GET', '/config/LABEL_HEIGHT_MM')).config_value);
        const leftMarginMM = parseFloat((await apiRequest('GET', '/config/LEFT_MARGIN_MM')).config_value);
        const gutterSpacingMM = parseFloat((await apiRequest('GET', '/config/GUTTER_SPACING_MM')).config_value);
        const topMarginMM = parseFloat((await apiRequest('GET', '/config/TOP_MARGIN_MM')).config_value);
        const priceFontSize = parseInt((await apiRequest('GET', '/config/PRICE_FONT_SIZE')).config_value);
        const textFontSize = parseInt((await apiRequest('GET', '/config/TEXT_FONT_SIZE')).config_value);
        const barcodeHeightMM = parseFloat((await apiRequest('GET', '/config/BARCODE_HEIGHT')).config_value);
        const printBorders = (await apiRequest('GET', '/config/PRINT_BORDERS')).config_value === 'true';
        const priceYPosMM = parseFloat((await apiRequest('GET', '/config/PRICE_Y_POS')).config_value);
        const barcodeYPosMM = parseFloat((await apiRequest('GET', '/config/BARCODE_Y_POS')).config_value);
        const infoYPosMM = parseFloat((await apiRequest('GET', '/config/INFO_Y_POS')).config_value);

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
        console.log(`📄 generatePDF: PDF generated with ${records.length} labels`);
        showStatus(`PDF generated with ${records.length} labels`, 'success');
    }

    // ========== MODE CHANGE ==========
    function onModeChange() {
        const newMode = searchModeSelect.value;
        currentSearchMode = newMode;
        console.log(`🔄 onModeChange: switching to ${newMode}`);

        cancelRangeSelection();

        if (newMode === 'add') {
            currentMode = 'inventory';
            currentResults = [];
            loadRecords({ statusIds: [1], mode: 'add', excludeBatch: true });
            populateDefaultParamSelects();
        } else if (newMode === 'scan') {
            filteredRecords = [];
            totalRecords = 0;
            currentPage = 1;
            renderPagination();
            renderTablePage();
            showStatus('Scan mode: Scan barcodes to build the list.', 'info');
            resetScanCounter();
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
            allRecords = [];
            loadRecords({ statusIds: [1,2], mode: 'delete' }).then(() => {
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
            loadRecords({ statusIds: [2], mode: 'checkout' }).then(() => {
                checkoutViewMode = 'list';
                filteredRecords = checkoutSelectedItems.slice();
                totalRecords = filteredRecords.length;
                currentPage = 1;
                renderPagination();
                renderTablePage();
                updateSelectionCount();
            });
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
            if (search) {
                search.value = '';
            }
            
            const statusFilter = document.getElementById('discogs-orders-status-filter');
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

        // Update panels based on mode
        showPanelsForMode(newMode);
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
        await loadGenres();

        populateDefaultParamSelects();

        // Set up event listeners for the scan location builder
        if (scanGenreSelect) {
            scanGenreSelect.addEventListener('change', updateScanLocationPreview);
        }
        if (scanMainLocationType) {
            scanMainLocationType.addEventListener('change', updateScanLocationPreview);
        }
        if (scanMainLocationNumber) {
            scanMainLocationNumber.addEventListener('input', updateScanLocationPreview);
        }
        if (scanSublocation) {
            scanSublocation.addEventListener('change', function() {
                const customContainer = document.getElementById('scan-custom-sublocation-container');
                if (this.value === 'CUSTOM') {
                    if (customContainer) customContainer.style.display = 'block';
                } else {
                    if (customContainer) customContainer.style.display = 'none';
                }
                updateScanLocationPreview();
            });
        }
        if (scanCustomSublocation) {
            scanCustomSublocation.addEventListener('input', updateScanLocationPreview);
        }
        if (scanAddGenreBtn) {
            scanAddGenreBtn.addEventListener('click', function() {
                const genreName = scanNewGenreInput ? scanNewGenreInput.value.trim() : '';
                if (!genreName) {
                    showScanGenreStatus('Please enter a genre name.', 'warning');
                    return;
                }
                const formattedName = genreName.split(' ').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                ).join(' ');
                
                if (genres.includes(formattedName)) {
                    showScanGenreStatus(`Genre "${formattedName}" already exists.`, 'warning');
                    if (scanGenreSelect) scanGenreSelect.value = formattedName;
                    if (scanNewGenreInput) scanNewGenreInput.value = '';
                    updateScanLocationPreview();
                    return;
                }
                
                genres.push(formattedName);
                genres.sort();
                
                if (scanGenreSelect) {
                    const currentVal = scanGenreSelect.value;
                    scanGenreSelect.innerHTML = '<option value="">-- Select Genre --</option>';
                    genres.forEach(g => {
                        const opt = document.createElement('option');
                        opt.value = g;
                        opt.textContent = g;
                        scanGenreSelect.appendChild(opt);
                    });
                    scanGenreSelect.value = formattedName;
                }
                if (scanNewGenreInput) scanNewGenreInput.value = '';
                showScanGenreStatus(`✅ Genre "${formattedName}" added.`, 'success');
                playSound('success');
                updateScanLocationPreview();
            });
        }
        if (scanNewGenreInput) {
            scanNewGenreInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (scanAddGenreBtn) scanAddGenreBtn.click();
                }
            });
        }
        if (scanResetCounterBtn) {
            scanResetCounterBtn.addEventListener('click', resetScanCounter);
        }

        searchModeSelect.addEventListener('change', onModeChange);

        let searchButton = document.getElementById('searchButton');
        if (!searchButton) {
            searchButton = document.createElement('button');
            searchButton.id = 'searchButton';
            searchButton.type = 'button';
            searchButton.className = 'btn btn-primary';
            searchButton.innerHTML = '<i class="fas fa-search"></i> Search';
            searchButton.style.marginLeft = '8px';
            const parent = searchInput.parentNode;
            if (parent) {
                parent.insertBefore(searchButton, clearSearchBtn);
                console.log('✅ Search button created and inserted.');
            } else {
                console.error('❌ Could not find parent for searchInput.');
            }
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

        printBtn.addEventListener('click', printPriceTags);

        // Set Active button is REMOVED
        setActiveBtn.style.display = 'none';

        const oldGlobalBtn = document.getElementById('global-set-active-btn');
        if (oldGlobalBtn) oldGlobalBtn.remove();

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
                applyDiscogsOrdersFilters();
            });
        }

        loadRecentScansFromStorage();

        currentSearchMode = searchModeSelect.value;
        onModeChange();

        _initialized = true;
        console.log('✅ inventory-ops.js initialized');
    }

    function showScanGenreStatus(message, type) {
        const el = document.getElementById('scan-genre-status');
        if (!el) return;
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
        el.className = `status-message status-${type}`;
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 3000);
    }

    // ========== AUTO-INITIALIZE ==========
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            if (!_initialized) init();
        });
    } else {
        if (!_initialized) init();
    }

    // ========== Expose globals ==========
    window.refreshDiscogsLocations = loadDiscogsLocations;
    window.initAddRecordsTab = init;

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

    // Draft functions exposed to global scope
    window.toggleDraftPanel = toggleParamsPurchasePanel;
    window.createDraftPurchase = createDraftPurchase;
    window.acceptDraftWithSignature = acceptDraftWithSignature;
    window.declineDraft = declineDraft;
    window.clearDraftForm = clearDraftForm;

})();