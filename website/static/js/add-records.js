// ============================================================================
// add-records.js - Single tab for adding records and printing price tags
// Combines Discogs search, record creation, print queue, PDF generation,
// batch COGS assignment, and status updates.
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

    // Print queue elements
    let queueContent = document.getElementById('queue-content');
    let queueCountSpan = document.getElementById('queue-count');
    let printQueueCountSpan = document.getElementById('print-queue-count');
    let clearQueueBtn = document.getElementById('clear-queue-btn');
    let printQueueBtn = document.getElementById('print-queue-btn');
    let markActiveQueueBtn = document.getElementById('mark-active-queue-btn');
    let cancelRangeBtn = document.getElementById('cancel-range-btn');
    let bulkDeleteQueueBtn = document.getElementById('bulk-delete-queue-btn');
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
    let printQueue = [];
    let fromIndex = null;
    let toIndex = null;
    let isRangeMode = false;
    let consignorMap = {};

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

    // ========== API Wrappers (no try/catch) ==========
    async function apiGet(endpoint) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.error || 'API error');
        return data;
    }

    async function apiPost(endpoint, body) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.error || 'API error');
        return data;
    }

    async function apiPut(endpoint, body) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            method: 'PUT',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.error || 'API error');
        return data;
    }

    async function apiDelete(endpoint) {
        const res = await fetch(window.AppConfig.baseUrl + endpoint, {
            method: 'DELETE',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.error || 'API error');
        return data;
    }

    // ========== Load configs ==========
    async function loadMinimumPrice() {
        const data = await apiGet('/config/MIN_STORE_PRICE');
        minimumPrice = parseFloat(data.config_value);
        if (isNaN(minimumPrice)) throw new Error('MIN_STORE_PRICE is not a number');
    }

    async function loadStorePriceMultiplier() {
        const data = await apiGet('/config/STORE_PRICE_ESTIMATED_MULTIPLIER');
        storePriceMultiplier = parseFloat(data.config_value);
        if (isNaN(storePriceMultiplier)) throw new Error('STORE_PRICE_ESTIMATED_MULTIPLIER is not a number');
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
        document.getElementById('total-records').textContent = total.count || 0;
        const newCount = await apiGet('/records/count?status_id=1');
        document.getElementById('new-records-count').textContent = newCount.count || 0;
        const capacity = await apiGet('/config/STORE_CAPACITY');
        const fill = ((total.count || 0) / parseInt(capacity.config_value) * 100).toFixed(1);
        document.getElementById('store-fill').textContent = fill + '%';
        const commission = await apiGet('/api/commission-rate');
        document.getElementById('commission-rate').textContent = commission.commission_rate_percent || 'N/A';
    }

    // ========== Search ==========
    async function performSearch(searchTerm) {
        if (!searchTerm) { clearResults(); return; }
        resultsContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><p>Searching...</p></div>';

        // Always search Discogs
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
                                <input type="number" class="form-control price-input" step="1" ${minimumPrice ? `min="${minimumPrice}"` : ''} placeholder="Price">
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
        // Add record
        document.querySelectorAll('.add-record-btn').forEach(btn => {
            btn.addEventListener('click', async function(e) {
                const card = this.closest('.record-card');
                const idx = parseInt(card.dataset.index);
                const record = currentResults[idx];
                await addRecordFromDiscogs(card, record, false);
            });
        });
        // Add & Print
        document.querySelectorAll('.add-and-print-btn').forEach(btn => {
            btn.addEventListener('click', async function(e) {
                const card = this.closest('.record-card');
                const idx = parseInt(card.dataset.index);
                const record = currentResults[idx];
                await addRecordFromDiscogs(card, record, true);
            });
        });
        // Estimate
        document.querySelectorAll('.estimate-now-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                const card = this.closest('.record-card');
                const idx = parseInt(card.dataset.index);
                const record = currentResults[idx];
                manualEstimate(record, card);
            });
        });
        // Condition mirroring
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
        // No original sleeve checkbox
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

        if (!sleeveId || !discId) throw new Error('Please select both sleeve and disc conditions');
        if (isNaN(price) || (minimumPrice !== null && price < minimumPrice)) {
            throw new Error(`Price must be at least $${minimumPrice ? minimumPrice.toFixed(2) : '0'}`);
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
        showStatus(`Record #${newRecord.id} added successfully!`, 'success');

        if (printImmediately) {
            addToQueue(newRecord);
            showStatus(`Added to print queue (${printQueue.length} items)`, 'info');
        }
        await loadStats();
    }

    // ========== Price Estimation (using /api/price-estimate-v3) ==========
    async function estimatePrice(record, sleeveId, discId, card) {
        if (storePriceMultiplier === null) throw new Error('Store price multiplier not loaded');
        if (minimumPrice === null) throw new Error('Minimum price not loaded');

        const sleeveCond = conditions.find(c => c.id === sleeveId);
        const discCond = conditions.find(c => c.id === discId);
        if (!sleeveCond || !discCond) throw new Error('Invalid condition');

        const catalogNumber = card.dataset.catalog || record.catalog_number || '';
        if (!catalogNumber) throw new Error('Catalog number required for estimation');

        const data = await apiPost('/api/price-estimate-v3', {
            catalog_number: catalogNumber,
            media_condition: discCond.display_name || discCond.condition_name,
            sleeve_condition: sleeveCond.display_name || sleeveCond.condition_name
        });

        const estimated = data.estimated_price;
        if (!estimated) throw new Error('No estimated price returned');

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
        if (!sleeve.value || !disc.value) throw new Error('Please select both conditions');
        await estimatePrice(record, sleeve.value, disc.value, card);
    }

    // ========== Print Queue Management ==========
    function addToQueue(record) {
        if (!printQueue.some(r => r.id === record.id)) {
            printQueue.push(record);
            updateQueueDisplay();
        }
    }

    function removeFromQueue(index) {
        printQueue.splice(index, 1);
        updateQueueDisplay();
    }

    function clearQueue() {
        if (confirm(`Clear ${printQueue.length} records from queue?`)) {
            printQueue = [];
            updateQueueDisplay();
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
            queueContent.innerHTML = `<div class="queue-empty"><i class="fas fa-inbox" style="font-size:24px;margin-bottom:10px;opacity:0.5;"></i><p>No records in queue</p></div>`;
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
        queueContent.innerHTML = html;
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
        if (isNaN(amount) || amount <= 0) throw new Error('Enter a valid positive amount');
        if (!printQueue.length) throw new Error('Queue is empty');

        const result = await apiPost('/api/cogs/batch', {
            batch_cogs: amount,
            record_ids: printQueue.map(r => r.id)
        });

        // Update local records
        result.updated_records.forEach(upd => {
            const q = printQueue.find(r => r.id === upd.id);
            if (q) q.cogs = upd.cogs;
        });
        updateQueueDisplay();
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
        if (!printQueue.length) throw new Error('Queue is empty');
        const ids = printQueue.map(r => r.id);
        const result = await apiPost('/records/update-status', { record_ids: ids, status_id: 2 });
        printQueue = [];
        updateQueueDisplay();
        showStatus(`Marked ${result.updated_count} records as Active`, 'success');
        await loadStats();
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
        await loadStats();
        showStatus(`Deleted ${deleted} records, ${failed} failed`, deleted > 0 ? 'success' : 'error');
    }

    // ========== Range Selection (for queue) ==========
    function startRangeFrom(index) {
        fromIndex = index;
        toIndex = null;
        isRangeMode = true;
        renderQueueTable();
    }

    function endRangeTo(index) {
        if (fromIndex === null) { showStatus('Select "from" first', 'warning'); return; }
        toIndex = index;
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        let added = 0;
        for (let i = start; i <= end; i++) {
            const record = currentResults[i];
            if (record && !printQueue.some(r => r.id === record.id)) {
                printQueue.push(record);
                added++;
            }
        }
        fromIndex = null;
        toIndex = null;
        isRangeMode = false;
        updateQueueDisplay();
        renderQueueTable();
        showStatus(`Added ${added} records to queue`, 'success');
    }

    function cancelRangeSelection() {
        fromIndex = null;
        toIndex = null;
        isRangeMode = false;
        renderQueueTable();
        showStatus('Range selection cancelled', 'info');
    }

    function renderQueueTable() {
        // This would re-render the search results with from/to indicators – simplified for now.
        // For brevity, we'll just re-run displayResults.
        displayResults();
    }

    // ========== Init ==========
    async function init() {
        await loadMinimumPrice();
        await loadStorePriceMultiplier();
        await loadConditions();
        await loadConsignors();
        await loadStats();

        // Setup event listeners
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

        // Queue buttons
        clearQueueBtn.addEventListener('click', clearQueue);
        printQueueBtn.addEventListener('click', () => generatePDF(printQueue));
        markActiveQueueBtn.addEventListener('click', markQueueAsActive);
        cancelRangeBtn.addEventListener('click', cancelRangeSelection);
        bulkDeleteQueueBtn.addEventListener('click', deleteSelectedFromQueue);
        applyBatchCogsBtn.addEventListener('click', applyBatchCOGS);

        // Expose queue functions globally for inline buttons
        window.addRecordsMoveInQueue = moveInQueue;
        window.addRecordsRemoveFromQueue = removeFromQueue;
        window.addRecordsClearQueue = clearQueue;

        // Range selection functions
        window.addRecordsStartRangeFrom = startRangeFrom;
        window.addRecordsEndRangeTo = endRangeTo;
        window.addRecordsCancelRange = cancelRangeSelection;

        // Initial state
        clearResults();
        updateQueueDisplay();

        console.log('✅ add-records.js initialized');
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();