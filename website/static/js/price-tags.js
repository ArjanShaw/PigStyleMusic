// ============================================================================
// price-tags.js - Price Tags Tab Functionality
// ============================================================================

(function() {
    'use strict';
    
    console.log('🏷️ price-tags.js IIFE loading...');

    // Global variables (now inside IIFE scope)
    let currentPage = 1;
    let pageSize = 100;
    let totalRecords = 0;
    let filteredRecords = [];
    let allRecords = [];
    let currentFilter = 'all'; // 'all', 'new', 'active', 'sold'
    let printQueue = [];
    let fromIndex = null; // Range selection start index
    let isRangeMode = false; // Range selection mode active
    let toIndex = null; // Range selection end index

    // DOM Elements
    let recordsBody = null;
    let totalRecordsSpan = null;
    let inactiveRecordsSpan = null;
    let activeRecordsSpan = null;
    let soldRecordsSpan = null;
    let currentPageInput = null;
    let totalPagesSpan = null;
    let showingStartSpan = null;
    let showingEndSpan = null;
    let totalFilteredSpan = null;
    let statusFilterSelect = null;
    let userSelect = null;
    let loadingDiv = null;
    let statusMessageDiv = null;
    let queueCountSpan = null;
    let printQueueCountSpan = null;
    let queueContentDiv = null;
    let clearQueueBtn = null;
    let printQueueBtn = null;
    let markActiveQueueBtn = null;
    let cancelRangeBtn = null;

    // Consignor mapping for initials
    let consignorMap = {};

    // ============================================================================
    // Initialization
    // ============================================================================

    async function initPriceTagsTab() {
        console.log('🏷️ Initializing Price Tags Tab...');
        
        // Get DOM elements
        recordsBody = document.getElementById('records-body');
        totalRecordsSpan = document.getElementById('total-records-print');
        inactiveRecordsSpan = document.getElementById('inactive-records');
        activeRecordsSpan = document.getElementById('active-records');
        soldRecordsSpan = document.getElementById('sold-records');
        currentPageInput = document.getElementById('current-page');
        totalPagesSpan = document.getElementById('total-pages');
        showingStartSpan = document.getElementById('showing-start');
        showingEndSpan = document.getElementById('showing-end');
        totalFilteredSpan = document.getElementById('total-filtered');
        statusFilterSelect = document.getElementById('status-filter');
        userSelect = document.getElementById('user-select');
        loadingDiv = document.getElementById('loading');
        statusMessageDiv = document.getElementById('status-message');
        queueCountSpan = document.getElementById('queue-count');
        printQueueCountSpan = document.getElementById('print-queue-count');
        queueContentDiv = document.getElementById('queue-content');
        clearQueueBtn = document.getElementById('clear-queue-btn');
        printQueueBtn = document.getElementById('print-queue-btn');
        markActiveQueueBtn = document.getElementById('mark-active-queue-btn');
        cancelRangeBtn = document.getElementById('cancel-range-btn');
        
        // Hide printing position controls if they exist (remove from DOM)
        const positionControls = document.querySelector('.print-position-controls');
        if (positionControls) {
            positionControls.style.display = 'none';
        }
        
        // Also hide any individual elements related to print position
        const startRowInput = document.getElementById('print-start-row');
        const startColInput = document.getElementById('print-start-col');
        const updatePositionBtn = document.getElementById('update-position-btn');
        
        if (startRowInput && startRowInput.closest('.form-group')) {
            startRowInput.closest('.form-group').style.display = 'none';
        }
        if (startColInput && startColInput.closest('.form-group')) {
            startColInput.closest('.form-group').style.display = 'none';
        }
        if (updatePositionBtn) {
            updatePositionBtn.style.display = 'none';
        }
        
        // Load consignors for initials display
        await loadConsignors();
        
        // Load records
        await loadRecordsForPriceTags();
        
        // Setup event listeners
        setupPriceTagsEventListeners();
        
        console.log('✅ Price Tags Tab initialized');
    }

    // Load consignors for initials
    async function loadConsignors() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/users`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.users) {
                    consignorMap = {};
                    data.users.forEach(user => {
                        consignorMap[user.id] = {
                            initials: user.initials || '',
                            name: user.full_name || user.username
                        };
                    });
                    console.log('✅ Loaded consignors for initials:', Object.keys(consignorMap).length);
                }
            }
        } catch (error) {
            console.error('Error loading consignors:', error);
        }
    }

    // Setup event listeners
    function setupPriceTagsEventListeners() {
        // Status filter change
        if (statusFilterSelect) {
            statusFilterSelect.addEventListener('change', () => {
                currentFilter = statusFilterSelect.value;
                currentPage = 1;
                filterAndRenderRecords();
            });
        }
        
        // User filter change
        if (userSelect) {
            userSelect.addEventListener('change', () => {
                currentPage = 1;
                filterAndRenderRecords();
            });
        }
        
        // Page navigation
        const firstPageBtn = document.getElementById('first-page-btn');
        const prevPageBtn = document.getElementById('prev-page-btn');
        const nextPageBtn = document.getElementById('next-page-btn');
        const lastPageBtn = document.getElementById('last-page-btn');
        
        if (firstPageBtn) firstPageBtn.addEventListener('click', () => goToPage(1));
        if (prevPageBtn) prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
        if (nextPageBtn) nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
        if (lastPageBtn) lastPageBtn.addEventListener('click', () => goToPage(getTotalPages()));
        
        if (currentPageInput) {
            currentPageInput.addEventListener('change', () => {
                const page = parseInt(currentPageInput.value);
                if (!isNaN(page) && page >= 1 && page <= getTotalPages()) {
                    goToPage(page);
                } else {
                    currentPageInput.value = currentPage;
                }
            });
        }
        
        // Page size change
        const pageSizeSelect = document.getElementById('page-size');
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', (e) => {
                pageSize = parseInt(e.target.value);
                currentPage = 1;
                filterAndRenderRecords();
            });
        }
        
        // Queue buttons
        if (clearQueueBtn) clearQueueBtn.addEventListener('click', clearQueue);
        if (printQueueBtn) printQueueBtn.addEventListener('click', () => generatePDF(printQueue));
        if (markActiveQueueBtn) markActiveQueueBtn.addEventListener('click', markQueueAsActive);
        if (cancelRangeBtn) cancelRangeBtn.addEventListener('click', cancelRangeSelection);
        
        // Locator search
        const locatorSearch = document.getElementById('record-locator-search');
        if (locatorSearch) {
            locatorSearch.addEventListener('input', debounce(locateRecord, 300));
        }
    }

    // ============================================================================
    // Record Loading and Filtering
    // ============================================================================

    async function loadRecordsForPriceTags() {
        if (loadingDiv) loadingDiv.style.display = 'block';
        
        try {
            console.log('================== LOADING RECORDS FOR PRICE TAGS ==================');
            
            const url = `${AppConfig.baseUrl}/records`;
            console.log('📡 API Call:', url);
            
            const response = await fetch(url, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('📡 Response Status:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📡 Response Status from API:', data.status);
            console.log('📡 Total records from API:', data.count);
            
            if (data.status === 'success' && data.records) {
                allRecords = data.records;
                console.log('✅ Loaded', allRecords.length, 'total records');
                
                // Sort by created_at (newest first) for display
                allRecords.sort((a, b) => {
                    const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
                    const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
                    return dateB - dateA;
                });
                
                console.log('📅 Records sorted by created_at (newest first)');
                
                // Update stats using API counts for accuracy
                await updateStats();
                
                // Populate user filter dropdown
                await populateUserFilter();
                
                // Filter and render
                filterAndRenderRecords();
                
            } else {
                throw new Error(data.error || 'Failed to load records');
            }
            
        } catch (error) {
            console.error('❌ Error loading records:', error);
            if (statusMessageDiv) {
                showStatus('Error loading records: ' + error.message, 'error');
            }
            if (recordsBody) {
                recordsBody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:40px;">Error loading records: ${error.message}</td></tr>`;
            }
        } finally {
            if (loadingDiv) loadingDiv.style.display = 'none';
        }
    }

    // FIXED: Use API counts instead of filtering allRecords
    async function updateStats() {
        try {
            // Get total count
            const totalResponse = await fetch(`${AppConfig.baseUrl}/records/count`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                }
            });
            
            if (totalResponse.ok) {
                const totalData = await totalResponse.json();
                const total = totalData.count || 0;
                if (totalRecordsSpan) totalRecordsSpan.textContent = total;
                console.log(`📊 Total records: ${total}`);
            }
            
            // Get NEW records count (status_id = 1)
            const newResponse = await fetch(`${AppConfig.baseUrl}/records/count?status_id=1`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                }
            });
            
            if (newResponse.ok) {
                const newData = await newResponse.json();
                const newCount = newData.count || 0;
                if (inactiveRecordsSpan) inactiveRecordsSpan.textContent = newCount;
                console.log(`📊 New records (status_id=1): ${newCount}`);
            }
            
            // Get ACTIVE records count (status_id = 2)
            const activeResponse = await fetch(`${AppConfig.baseUrl}/records/count?status_id=2`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                }
            });
            
            if (activeResponse.ok) {
                const activeData = await activeResponse.json();
                const activeCount = activeData.count || 0;
                if (activeRecordsSpan) activeRecordsSpan.textContent = activeCount;
                console.log(`📊 Active records (status_id=2): ${activeCount}`);
            }
            
            // Get SOLD records count (status_id = 3)
            const soldResponse = await fetch(`${AppConfig.baseUrl}/records/count?status_id=3`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                }
            });
            
            if (soldResponse.ok) {
                const soldData = await soldResponse.json();
                const soldCount = soldData.count || 0;
                if (soldRecordsSpan) soldRecordsSpan.textContent = soldCount;
                console.log(`📊 Sold records (status_id=3): ${soldCount}`);
            }
            
        } catch (error) {
            console.error('Error fetching fresh stats:', error);
            // Fallback to local filtering
            const total = allRecords.length;
            const inactive = allRecords.filter(r => r.status_id === 1).length;
            const active = allRecords.filter(r => r.status_id === 2).length;
            const sold = allRecords.filter(r => r.status_id === 3).length;
            
            if (totalRecordsSpan) totalRecordsSpan.textContent = total;
            if (inactiveRecordsSpan) inactiveRecordsSpan.textContent = inactive;
            if (activeRecordsSpan) activeRecordsSpan.textContent = active;
            if (soldRecordsSpan) soldRecordsSpan.textContent = sold;
        }
    }

    function filterAndRenderRecords() {
        console.log('================== FILTERING RECORDS ==================');
        
        let filtered = [...allRecords];
        
        // Apply status filter
        const statusMap = {
            'all': null,
            'new': 1,
            'active': 2,
            'sold': 3
        };
        
        const statusId = statusMap[currentFilter];
        console.log('Current filter:', currentFilter);
        console.log('Status ID mapping:', statusId);
        console.log('Total records before filter:', filtered.length);
        
        if (statusId !== null) {
            filtered = filtered.filter(record => record.status_id === statusId);
            console.log('After status filter:', filtered.length, 'records');
        } else {
            console.log('No status filter, all', filtered.length, 'records');
        }
        
        // Apply user filter (consignor)
        const selectedUserId = userSelect ? userSelect.value : 'all';
        if (selectedUserId !== 'all') {
            filtered = filtered.filter(record => record.consignor_id == selectedUserId);
            console.log('After user filter:', filtered.length, 'records');
        }
        
        filteredRecords = filtered;
        
        // Sort by created_at (newest first)
        filteredRecords.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
            const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
            return dateB - dateA;
        });
        
        totalRecords = filteredRecords.length;
        updatePagination();
        renderRecords();
    }

    async function populateUserFilter() {
        if (!userSelect) return;
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/users`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.users) {
                    const consignors = data.users.filter(u => u.role === 'consignor');
                    
                    let options = '<option value="all">All Users</option>';
                    consignors.forEach(consignor => {
                        options += `<option value="${consignor.id}">${consignor.full_name || consignor.username}${consignor.initials ? ` (${consignor.initials})` : ''}</option>`;
                    });
                    
                    userSelect.innerHTML = options;
                    console.log('✅ Populated user filter with', consignors.length, 'consignors');
                }
            }
        } catch (error) {
            console.error('Error populating user filter:', error);
        }
    }

    // ============================================================================
    // Pagination
    // ============================================================================

    function getTotalPages() {
        return Math.ceil(totalRecords / pageSize) || 1;
    }

    function updatePagination() {
        const totalPages = getTotalPages();
        
        if (totalPagesSpan) totalPagesSpan.textContent = totalPages;
        if (currentPageInput) currentPageInput.value = currentPage;
        
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalRecords);
        
        if (showingStartSpan) showingStartSpan.textContent = start;
        if (showingEndSpan) showingEndSpan.textContent = end;
        if (totalFilteredSpan) totalFilteredSpan.textContent = totalRecords;
        
        // Update button states
        const firstPageBtn = document.getElementById('first-page-btn');
        const prevPageBtn = document.getElementById('prev-page-btn');
        const nextPageBtn = document.getElementById('next-page-btn');
        const lastPageBtn = document.getElementById('last-page-btn');
        
        if (firstPageBtn) firstPageBtn.disabled = currentPage === 1;
        if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
        if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages;
        if (lastPageBtn) lastPageBtn.disabled = currentPage === totalPages;
    }

    function goToPage(page) {
        const totalPages = getTotalPages();
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        if (page === currentPage) return;
        
        currentPage = page;
        renderRecords();
        updatePagination();
        
        // Scroll to top of table
        const container = document.querySelector('.records-table-container');
        if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ============================================================================
    // Range Selection Functions
    // ============================================================================

    function startRangeFrom(index) {
        fromIndex = index;
        toIndex = null;
        isRangeMode = true;
        renderRecords();
        showStatus(`From record selected. Click "to" on another record to select range.`, 'info');
    }

    function endRangeTo(index) {
        if (fromIndex === null) {
            showStatus('Please click "from" on a record first', 'warning');
            return;
        }
        toIndex = index;
        addRangeToQueue(fromIndex, toIndex);
        fromIndex = null;
        toIndex = null;
        isRangeMode = false;
        renderRecords();
    }

    function addRangeToQueue(startIndex, endIndex) {
        const start = Math.min(startIndex, endIndex);
        const end = Math.max(startIndex, endIndex);
        let addedCount = 0;
        
        for (let i = start; i <= end; i++) {
            const record = filteredRecords[i];
            if (record && !printQueue.some(r => r.id === record.id)) {
                printQueue.push(record);
                addedCount++;
            }
        }
        
        updateQueueDisplay();
        showStatus(`Added ${addedCount} records to print queue`, 'success');
    }

    function cancelRangeSelection() {
        fromIndex = null;
        toIndex = null;
        isRangeMode = false;
        renderRecords();
        showStatus('Range selection cancelled', 'info');
    }

    // ============================================================================
    // Render Records Table
    // ============================================================================

    function renderRecords() {
        console.log('================== RENDERING PAGE ==================');
        console.log('Current page:', currentPage);
        console.log('Page size:', pageSize);
        console.log('Total filtered records:', filteredRecords.length);
        
        if (!recordsBody) return;
        
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredRecords.length);
        const pageRecords = filteredRecords.slice(start, end);
        
        console.log('Rendering records', start+1, 'to', end, `(${pageRecords.length} records on this page)`);
        
        if (pageRecords.length === 0) {
            recordsBody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:40px;">No records found</td></tr>';
            return;
        }
        
        let html = '';
        
        pageRecords.forEach((record, idx) => {
            const globalIndex = start + idx;
            const statusClass = getStatusClass(record.status_id);
            const statusName = getStatusName(record.status_id);
            const dateCreated = record.created_at ? new Date(record.created_at).toLocaleDateString() : 'Unknown';
            const price = record.store_price ? `$${record.store_price.toFixed(2)}` : 'N/A';
            const genre = record.discogs_genre_raw ? record.discogs_genre_raw.split(',')[0].trim().substring(0, 30) : '—';
            const isInQueue = printQueue.some(q => q.id === record.id);
            const queuePosition = printQueue.findIndex(q => q.id === record.id);
            
            // Get consignor initials
            let consignorDisplay = '';
            if (record.consignor_id && consignorMap[record.consignor_id]) {
                consignorDisplay = consignorMap[record.consignor_id].initials || consignorMap[record.consignor_id].name;
            }
            
            // Range selection highlighting
            let rowClass = '';
            if (isInQueue) rowClass = 'record-in-queue';
            if (fromIndex === globalIndex) rowClass += ' range-from';
            if (toIndex === globalIndex) rowClass += ' range-to';
            
            // Check if this row is between from and to
            if (fromIndex !== null && toIndex !== null) {
                const min = Math.min(fromIndex, toIndex);
                const max = Math.max(fromIndex, toIndex);
                if (globalIndex > min && globalIndex < max) {
                    rowClass += ' range-middle';
                }
            }
            
            html += `
                <tr class="${rowClass}" data-record-id="${record.id}" data-global-index="${globalIndex}">
                    <td style="text-align: center; width: 80px;">
                        ${!isRangeMode ? 
                            `<button class="btn-from" onclick="window.priceTagsStartRangeFrom(${globalIndex})" style="padding: 4px 8px; font-size: 11px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">
                                <i class="fas fa-arrow-right"></i> from
                            </button>` : 
                            fromIndex === globalIndex ? 
                            `<span style="background: #28a745; color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px;">FROM ✓</span>` :
                            toIndex === globalIndex ?
                            `<span style="background: #dc3545; color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px;">TO ✓</span>` :
                            `<button class="btn-to" onclick="window.priceTagsEndRangeTo(${globalIndex})" style="padding: 4px 8px; font-size: 11px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">
                                <i class="fas fa-arrow-left"></i> to
                            </button>`
                        }
                    </td>
                    <td style="width: 60px;">${record.id}</td>
                    <td style="width: 100px;">${dateCreated}</td>
                    <td>${escapeHtml(record.artist || 'Unknown')}</td>
                    <td>${escapeHtml(record.title || 'Unknown')}</td>
                    <td style="width: 80px;">${price}</td>
                    <td style="width: 100px;">${escapeHtml(record.catalog_number || '—')}</td>
                    <td style="width: 120px;">${escapeHtml(genre)}</td>
                    <td style="width: 120px;"><span class="barcode-value">${record.barcode || '—'}</span></td>
                    <td style="width: 80px;">${escapeHtml(consignorDisplay) || '—'}</td>
                    <td style="width: 100px;"><span class="status-badge ${statusClass}">${statusName}</span></td>
                    <td style="width: 60px; text-align: center;">
                        ${isInQueue ? 
                            `<span class="queue-badge" style="background: #28a745; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px;">#${queuePosition + 1}</span>` : 
                            `<button class="btn-add-queue" onclick="window.priceTagsAddToQueue(${record.id})" style="background: none; border: none; color: #28a745; cursor: pointer; font-size: 16px;">
                                <i class="fas fa-plus-circle"></i>
                            </button>`
                        }
                    </td>
                 </tr>
            `;
        });
        
        recordsBody.innerHTML = html;
        console.log('================== RENDER COMPLETE ==================');
    }

    function getStatusClass(statusId) {
        switch(statusId) {
            case 1: return 'new';
            case 2: return 'active';
            case 3: return 'sold';
            case 4: return 'removed';
            default: return '';
        }
    }

    function getStatusName(statusId) {
        switch(statusId) {
            case 1: return 'New';
            case 2: return 'Active';
            case 3: return 'Sold';
            case 4: return 'Removed';
            default: return 'Unknown';
        }
    }

    // ============================================================================
    // Print Queue Management
    // ============================================================================

    function addToQueue(recordId) {
        const record = filteredRecords.find(r => r.id === recordId);
        if (!record) {
            showStatus('Record not found', 'error');
            return;
        }
        
        if (!printQueue.some(r => r.id === record.id)) {
            printQueue.push(record);
            updateQueueDisplay();
            renderRecords(); // Re-render to show queue badge
            showStatus(`Added "${record.artist} - ${record.title}" to print queue`, 'success');
        } else {
            showStatus(`Record already in queue`, 'warning');
        }
    }

    function addAllOnPageToQueue() {
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredRecords.length);
        let addedCount = 0;
        
        for (let i = start; i < end; i++) {
            const record = filteredRecords[i];
            if (record && !printQueue.some(r => r.id === record.id)) {
                printQueue.push(record);
                addedCount++;
            }
        }
        
        updateQueueDisplay();
        renderRecords(); // Re-render to show queue badges
        showStatus(`Added ${addedCount} records from current page to print queue`, 'success');
    }

    function removeFromQueue(index) {
        const removed = printQueue.splice(index, 1)[0];
        updateQueueDisplay();
        renderRecords(); // Re-render to update badges
        showStatus(`Removed "${removed.artist} - ${removed.title}" from queue`, 'info');
    }

    function clearQueue() {
        if (printQueue.length === 0) return;
        
        if (confirm(`Clear ${printQueue.length} records from print queue?`)) {
            printQueue = [];
            updateQueueDisplay();
            renderRecords(); // Re-render to clear badges
            showStatus('Print queue cleared', 'info');
        }
    }

    function moveInQueue(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= printQueue.length) return;
        
        [printQueue[index], printQueue[newIndex]] = [printQueue[newIndex], printQueue[index]];
        updateQueueDisplay();
    }

    function updateQueueDisplay() {
        const count = printQueue.length;
        
        if (queueCountSpan) queueCountSpan.textContent = count;
        if (printQueueCountSpan) printQueueCountSpan.textContent = count;
        
        if (clearQueueBtn) clearQueueBtn.disabled = count === 0;
        if (printQueueBtn) printQueueBtn.disabled = count === 0;
        if (markActiveQueueBtn) markActiveQueueBtn.disabled = false;
        
        if (!queueContentDiv) return;
        
        if (count === 0) {
            queueContentDiv.innerHTML = `
                <div class="queue-empty" id="queue-empty">
                    <i class="fas fa-inbox" style="font-size: 24px; margin-bottom: 10px; opacity: 0.5;"></i>
                    <p>No records in print queue</p>
                    <p style="font-size: 12px;">Click "Add to Queue" (+) or use "from/to" to select ranges</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        printQueue.forEach((record, idx) => {
            const price = record.store_price ? `$${record.store_price.toFixed(2)}` : 'N/A';
            const genre = record.discogs_genre_raw ? record.discogs_genre_raw.split(',')[0].trim().substring(0, 25) : '';
            
            html += `
                <div class="queue-item" data-queue-index="${idx}">
                    <div class="queue-item-number">${idx + 1}</div>
                    <div class="queue-item-info">
                        <div class="queue-item-title">${escapeHtml(record.artist)} - ${escapeHtml(record.title)}</div>
                        <div class="queue-item-details">
                            <span>Price: ${price}</span>
                            ${genre ? `<span>Genre: ${escapeHtml(genre)}</span>` : ''}
                            <span>Barcode: ${record.barcode || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="queue-item-controls">
                        <button class="queue-item-move" onclick="window.priceTagsMoveInQueue(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>
                            <i class="fas fa-arrow-up"></i>
                        </button>
                        <button class="queue-item-move" onclick="window.priceTagsMoveInQueue(${idx}, 1)" ${idx === printQueue.length - 1 ? 'disabled' : ''}>
                            <i class="fas fa-arrow-down"></i>
                        </button>
                        <button class="queue-item-remove" onclick="window.priceTagsRemoveFromQueue(${idx})">
                            <i class="fas fa-trash"></i> Remove
                        </button>
                    </div>
                </div>
            `;
        });
        
        queueContentDiv.innerHTML = html;
    }

    // ============================================================================
    // PDF Generation (always starts at row 1, col 1)
    // ============================================================================

    async function generatePDF(records) {
        const { jsPDF } = window.jspdf;
        
        console.log('📄 Generating Price Tags PDF');
        console.log(`📍 Always starting at: Row 1, Col 1 (top-left corner)`);
        console.log(`📊 Total records: ${records.length}`);
        
        try {
            // Get configuration values
            const labelWidthMM = await getConfigValue('LABEL_WIDTH_MM');
            const labelHeightMM = await getConfigValue('LABEL_HEIGHT_MM');
            const leftMarginMM = await getConfigValue('LEFT_MARGIN_MM');
            const gutterSpacingMM = await getConfigValue('GUTTER_SPACING_MM');
            const topMarginMM = await getConfigValue('TOP_MARGIN_MM');
            const priceFontSize = await getConfigValue('PRICE_FONT_SIZE');
            const textFontSize = await getConfigValue('TEXT_FONT_SIZE');
            const barcodeHeightMM = await getConfigValue('BARCODE_HEIGHT');
            const printBorders = await getConfigValue('PRINT_BORDERS');
            const priceYPosMM = await getConfigValue('PRICE_Y_POS');
            const barcodeYPosMM = await getConfigValue('BARCODE_Y_POS');
            const infoYPosMM = await getConfigValue('INFO_Y_POS');
            
            const mmToPt = 2.83465;
            const labelWidthPt = parseFloat(labelWidthMM) * mmToPt;
            const labelHeightPt = parseFloat(labelHeightMM) * mmToPt;
            const leftMarginPt = parseFloat(leftMarginMM) * mmToPt;
            const gutterSpacingPt = parseFloat(gutterSpacingMM) * mmToPt;
            const topMarginPt = parseFloat(topMarginMM) * mmToPt;
            const barcodeHeightPt = parseFloat(barcodeHeightMM) * mmToPt;
            
            const priceYPosPt = parseFloat(priceYPosMM) * mmToPt;
            const barcodeYPosPt = parseFloat(barcodeYPosMM) * mmToPt;
            const infoYPosPt = parseFloat(infoYPosMM) * mmToPt;
            
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'pt',
                format: 'letter'
            });
            
            const rows = 15;
            const cols = 4;
            const labelsPerPage = rows * cols;
            
            // Always start at position 0 (row 1, col 1)
            let currentLabel = 0;
            let pageNumber = 0;
            
            for (let i = 0; i < records.length; i++) {
                const record = records[i];
                if (!record) continue;
                
                const pageIndex = currentLabel % labelsPerPage;
                const pageNum = Math.floor(currentLabel / labelsPerPage);
                
                if (pageNum > pageNumber) {
                    doc.addPage();
                    pageNumber = pageNum;
                }
                
                const row = Math.floor(pageIndex / cols);
                const col = pageIndex % cols;
                
                const x = leftMarginPt + (col * (labelWidthPt + gutterSpacingPt));
                const y = topMarginPt + (row * labelHeightPt);
                
                if (printBorders === 'true' || printBorders === true) {
                    doc.setDrawColor(0);
                    doc.setLineWidth(0.5);
                    doc.rect(x, y, labelWidthPt, labelHeightPt);
                }
                
                let consignorInitials = '';
                if (record.consignor_id && consignorMap[record.consignor_id]) {
                    consignorInitials = consignorMap[record.consignor_id].initials || '';
                }
                
                const artist = record.artist || 'Unknown';
                const genre = record.discogs_genre_raw ? record.discogs_genre_raw.split(',')[0].trim() : '';
                const genreDisplay = genre.substring(0, 30);
                const initialsText = consignorInitials ? ` (${consignorInitials})` : '';
                let infoText = '';
                
                if (genreDisplay) {
                    infoText = `${genreDisplay} | ${artist}${initialsText}`;
                } else {
                    infoText = `${artist}${initialsText}`;
                }
                
                doc.setFontSize(parseInt(textFontSize));
                doc.setFont('helvetica', 'normal');
                
                let displayText = infoText;
                const maxWidth = labelWidthPt - 10;
                if (doc.getTextWidth(displayText) > maxWidth) {
                    while (doc.getTextWidth(displayText + '…') > maxWidth && displayText.length > 0) {
                        displayText = displayText.slice(0, -1);
                    }
                    displayText += '…';
                }
                
                const infoWidth = doc.getTextWidth(displayText);
                const infoX = x + (labelWidthPt - infoWidth) / 2;
                const infoY = y + infoYPosPt;
                doc.text(displayText, infoX, infoY);
                
                const price = record.store_price || 0;
                const priceText = `$${price.toFixed(2)}`;
                doc.setFontSize(parseInt(priceFontSize));
                doc.setFont('helvetica', 'bold');
                
                const priceWidth = doc.getTextWidth(priceText);
                const priceX = x + (labelWidthPt - priceWidth) / 2;
                const priceY = y + priceYPosPt;
                doc.text(priceText, priceX, priceY);
                
                const barcodeNum = record.barcode;
                if (barcodeNum) {
                    try {
                        const canvas = document.createElement('canvas');
                        JsBarcode(canvas, barcodeNum, {
                            format: "CODE128",
                            displayValue: false,
                            height: 30,
                            width: 2,
                            margin: 0
                        });
                        
                        const barcodeData = canvas.toDataURL('image/png');
                        const barcodeWidth = 40;
                        const barcodeX = x + (labelWidthPt - barcodeWidth) / 2;
                        const barcodeY = y + barcodeYPosPt;
                        
                        doc.addImage(barcodeData, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeightPt);
                    } catch (barcodeError) {
                        console.error('Error generating barcode:', barcodeError);
                    }
                }
                
                currentLabel++;
            }
            
            console.log(`✅ Generated ${currentLabel} labels starting at position (1, 1)`);
            
            // Open PDF in new window for printing
            const pdfBlob = doc.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
            
            showStatus(`Generated PDF with ${currentLabel} price tags`, 'success');
            
        } catch (error) {
            console.error('PDF generation failed:', error);
            showStatus('Error generating PDF: ' + error.message, 'error');
            throw error;
        }
    }

    async function getConfigValue(key) {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/config/${key}`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.config_value;
            }
        } catch (error) {
            console.warn(`Error fetching config ${key}:`, error);
        }
        
        // Return defaults
        const defaults = {
            'LABEL_WIDTH_MM': '101.6',
            'LABEL_HEIGHT_MM': '50.8',
            'LEFT_MARGIN_MM': '12.7',
            'GUTTER_SPACING_MM': '3.175',
            'TOP_MARGIN_MM': '12.7',
            'PRICE_FONT_SIZE': '24',
            'TEXT_FONT_SIZE': '10',
            'BARCODE_HEIGHT': '12',
            'PRINT_BORDERS': 'true',
            'PRICE_Y_POS': '18',
            'BARCODE_Y_POS': '35',
            'INFO_Y_POS': '8'
        };
        
        return defaults[key] || '';
    }

    // ============================================================================
    // Mark as Active - Direct, No Popup
    // ============================================================================

    async function markQueueAsActive() {
        if (printQueue.length === 0) {
            showStatus('No records in queue to mark as active', 'warning');
            return;
        }
        
        if (loadingDiv) loadingDiv.style.display = 'block';
        
        try {
            const recordIds = printQueue.map(r => r.id);
            
            const response = await fetch(`${AppConfig.baseUrl}/records/update-status`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    record_ids: recordIds,
                    status_id: 2  // Active status
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                showStatus(`Successfully marked ${data.updated_count} records as Active`, 'success');
                
                // Update printQueue records status and clear queue
                printQueue.forEach(record => {
                    record.status_id = 2;
                });
                printQueue = [];
                updateQueueDisplay();
                renderRecords();
                
                // Reload records to reflect changes
                await loadRecordsForPriceTags();
            } else {
                throw new Error(data.error || 'Failed to update status');
            }
            
        } catch (error) {
            console.error('Error marking records as active:', error);
            showStatus('Error marking records as active: ' + error.message, 'error');
        } finally {
            if (loadingDiv) loadingDiv.style.display = 'none';
        }
    }

    // ============================================================================
    // Locator Functionality
    // ============================================================================

    let currentMatchIndex = -1;
    let matchRows = [];

    function locateRecord() {
        const searchInput = document.getElementById('record-locator-search');
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const matchCountSpan = document.getElementById('match-count');
        
        // Clear previous highlights
        clearLocatorHighlight();
        
        if (!searchTerm) {
            if (matchCountSpan) matchCountSpan.textContent = '0';
            currentMatchIndex = -1;
            matchRows = [];
            return;
        }
        
        // Find matching rows
        const rows = document.querySelectorAll('#records-body tr');
        matchRows = [];
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 5) {
                const artist = cells[3]?.textContent.toLowerCase() || '';
                const title = cells[4]?.textContent.toLowerCase() || '';
                const barcode = cells[8]?.textContent.toLowerCase() || '';
                
                if (artist.includes(searchTerm) || title.includes(searchTerm) || barcode.includes(searchTerm)) {
                    matchRows.push(row);
                    row.classList.add('record-locator-match');
                }
            }
        });
        
        if (matchCountSpan) matchCountSpan.textContent = matchRows.length;
        
        if (matchRows.length > 0) {
            currentMatchIndex = 0;
            highlightCurrentMatch();
        } else {
            currentMatchIndex = -1;
        }
    }

    function highlightCurrentMatch() {
        matchRows.forEach(row => row.classList.remove('record-locator-current'));
        
        if (currentMatchIndex >= 0 && currentMatchIndex < matchRows.length) {
            const currentRow = matchRows[currentMatchIndex];
            currentRow.classList.add('record-locator-current');
            currentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function findNextMatch() {
        if (matchRows.length === 0) return;
        
        currentMatchIndex = (currentMatchIndex + 1) % matchRows.length;
        highlightCurrentMatch();
    }

    function clearLocatorHighlight() {
        const rows = document.querySelectorAll('#records-body tr');
        rows.forEach(row => {
            row.classList.remove('record-locator-match');
            row.classList.remove('record-locator-current');
        });
        matchRows = [];
        currentMatchIndex = -1;
        
        const matchCountSpan = document.getElementById('match-count');
        if (matchCountSpan) matchCountSpan.textContent = '0';
    }

    // ============================================================================
    // Utility Functions
    // ============================================================================

    function showStatus(message, type = 'info') {
        if (!statusMessageDiv) return;
        
        statusMessageDiv.textContent = message;
        statusMessageDiv.className = `status-message status-${type}`;
        statusMessageDiv.style.display = 'block';
        
        setTimeout(() => {
            if (statusMessageDiv) {
                statusMessageDiv.style.display = 'none';
            }
        }, 5000);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============================================================================
    // Global Exports
    // ============================================================================

    // Core functions
    window.initPriceTagsTab = initPriceTagsTab;
    window.loadRecordsForPriceTags = loadRecordsForPriceTags;
    window.loadConsignorsForPriceTags = loadConsignors;
    
    // Queue management
    window.priceTagsAddToQueue = addToQueue;
    window.addAllOnPageToQueue = addAllOnPageToQueue;
    window.priceTagsRemoveFromQueue = removeFromQueue;
    window.priceTagsMoveInQueue = moveInQueue;
    window.clearQueue = clearQueue;
    
    // Range selection
    window.priceTagsStartRangeFrom = startRangeFrom;
    window.priceTagsEndRangeTo = endRangeTo;
    window.cancelRangeSelection = cancelRangeSelection;
    
    // Status and printing
    window.markQueueAsActive = markQueueAsActive;
    window.generatePDF = generatePDF;
    
    // Navigation and locate
    window.goToPage = goToPage;
    window.findNextMatch = findNextMatch;
    window.clearLocatorHighlight = clearLocatorHighlight;

    console.log('✅ price-tags.js loaded - Range selection restored, printing always starts at top-left, user filter fully functional');
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPriceTagsTab);
    } else {
        initPriceTagsTab();
    }
})();