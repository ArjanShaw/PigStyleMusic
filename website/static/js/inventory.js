// ============================================================================
// inventory.js - Inventory Management Tab with Collapsible Builder & Scan History
// ============================================================================

// State management for location counters
let locationCounters = {};

// Current location components
let currentGenre = '';
let currentMainLocation = 'Bin';
let currentMainNumber = '1';
let currentCustomLocation = '';
let currentSublocation = '';
let currentCounter = 1;

// Available genres
let availableGenres = [];

// DOM Elements
let barcodeInput = null;
let genreSelect = null;
let mainLocationType = null;
let mainLocationNumber = null;
let customLocationInput = null;
let sublocationSelect = null;
let counterDisplay = null;
let scanResultDiv = null;
let locationPreview = null;
let addGenreInput = null;
let addGenreBtn = null;
let toggleBuilderBtn = null;
let locationBuilderSection = null;
let scanHistoryContainer = null;

// Audio context
let audioContext = null;

// Scanner state
let modalElement = null;
let currentModalRecords = [];
let isModalActive = false;
let currentSelectedRecord = null;
let modalKeyHandler = null;

// Recent scan history for display and suggestions
let recentScans = []; // Stores { record, timestamp, location }
const MAX_RECENT_SCANS = 10;
let currentDisplayIndex = 0;
let historyScrollInterval = null;

// Sublocation display names
const SUBLOCATION_NAMES = {
    'LT': 'Left Top',
    'RT': 'Right Top',
    'LB': 'Left Bottom',
    'RB': 'Right Bottom'
};

const SUBLOCATION_ICONS = {
    'LT': '↖️',
    'RT': '↗️',
    'LB': '↙️',
    'RB': '↘️'
};

// ============================================================================
// Helper Functions
// ============================================================================

function getMainLocationString() {
    if (mainLocationType && mainLocationType.value === 'Custom') {
        return customLocationInput ? customLocationInput.value.trim() : '';
    }
    const locationType = mainLocationType ? mainLocationType.value : 'Bin';
    const number = mainLocationNumber ? mainLocationNumber.value.trim() : '1';
    return `${locationType} ${number}`;
}

function buildLocationString() {
    const parts = [];
    
    if (currentGenre && currentGenre !== '') {
        parts.push(currentGenre);
    }
    
    const mainLocation = getMainLocationString();
    if (mainLocation) {
        parts.push(mainLocation);
    }
    
    if (currentSublocation && SUBLOCATION_NAMES[currentSublocation]) {
        parts.push(`${SUBLOCATION_ICONS[currentSublocation]} ${SUBLOCATION_NAMES[currentSublocation]}`);
    }
    
    parts.push(String(currentCounter));
    
    return parts.join(' | ');
}

function updateLocationPreview() {
    if (locationPreview) {
        const previewString = buildLocationString();
        locationPreview.textContent = previewString || '--';
    }
}

function getTargetArtistLetter() {
    const mainLocation = getMainLocationString().toLowerCase();
    const letterMatch = mainLocation.match(/\b([a-z])\b/);
    if (letterMatch) {
        return letterMatch[1].toUpperCase();
    }
    return null;
}

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

function addToRecentScans(record, locationString) {
    // Don't add duplicates in a row
    if (recentScans.length > 0 && recentScans[0].record.id === record.id) {
        return;
    }
    
    recentScans.unshift({ 
        record: record,
        location: locationString,
        timestamp: Date.now()
    });
    
    // Keep only last MAX_RECENT_SCANS
    if (recentScans.length > MAX_RECENT_SCANS) {
        recentScans.pop();
    }
    
    renderScanHistory();
    console.log('Recent scans:', recentScans.map(s => `${s.record.artist} - ${s.record.title}`));
}

function renderScanHistory() {
    if (!scanHistoryContainer) return;
    
    if (recentScans.length === 0) {
        scanHistoryContainer.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #999;">
                <i class="fas fa-camera" style="font-size: 48px; margin-bottom: 10px; display: block;"></i>
                <p>No scans yet. Scan barcodes to see history.</p>
            </div>
        `;
        return;
    }
    
    let html = '<div style="display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto;">';
    
    recentScans.forEach((scan, idx) => {
        const record = scan.record;
        const imageUrl = record.image_url && record.image_url !== '' && record.image_url !== 'None' 
            ? record.image_url 
            : null;
        
        html += `
            <div style="display: flex; align-items: center; gap: 12px; padding: 10px; background: ${idx === 0 ? '#e3f2fd' : '#f8f9fa'}; border-radius: 8px; border-left: 3px solid ${idx === 0 ? '#2196f3' : '#ddd'};">
                <div style="flex-shrink: 0;">
                    ${imageUrl ? 
                        `<img src="${imageUrl}" alt="${record.artist}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">` :
                        `<div style="width: 50px; height: 50px; background: #e0e0e0; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #999;"><i class="fas fa-record-vinyl"></i></div>`
                    }
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHtml(record.artist)} - ${escapeHtml(record.title)}
                    </div>
                    <div style="font-size: 11px; color: #666; margin-top: 2px;">
                        <i class="fas fa-map-marker-alt"></i> ${escapeHtml(scan.location)}
                    </div>
                    <div style="font-size: 10px; color: #999;">
                        ${new Date(scan.timestamp).toLocaleTimeString()}
                    </div>
                </div>
                <div style="flex-shrink: 0; font-size: 20px; color: #28a745;">
                    <i class="fas fa-check-circle"></i>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    scanHistoryContainer.innerHTML = html;
}

function calculateMatchScore(record, recentScansList) {
    if (recentScansList.length === 0) return 0;
    
    const recordSortKey = getArtistSortKey(record.artist);
    let score = 0;
    
    // Weight more recent scans higher
    for (let i = 0; i < recentScansList.length; i++) {
        const recent = recentScansList[i];
        const weight = Math.pow(0.5, i); // 1.0, 0.5, 0.25, 0.125, 0.0625
        
        if (recent.sortKey === recordSortKey) {
            score += 100 * weight; // Same letter = high score
        }
        
        // Partial match bonus: if artist name contains similar words
        const recentArtistLower = recent.artist.toLowerCase();
        const recordArtistLower = record.artist.toLowerCase();
        
        // Check for same first word (common for bands like "The Beatles" -> "beatles")
        const recentFirstWord = recentArtistLower.replace(/^the\s+/, '').split(' ')[0];
        const recordFirstWord = recordArtistLower.replace(/^the\s+/, '').split(' ')[0];
        
        if (recentFirstWord === recordFirstWord && recentFirstWord.length > 2) {
            score += 30 * weight;
        }
    }
    
    // Bonus for active status
    if (record.status_id === 2) {
        score += 50;
    }
    
    // Penalty for sold status
    if (record.status_id === 3) {
        score -= 100;
    }
    
    return score;
}

// ============================================================================
// Audio Functions
// ============================================================================

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playBeep(frequency = 800, duration = 200, type = 'sine') {
    try {
        initAudio();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + duration / 1000);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (error) {
        console.warn('Could not play beep:', error);
    }
}

// ============================================================================
// Counter Management
// ============================================================================

function getCurrentCounter() {
    return currentCounter;
}

function incrementCounter() {
    currentCounter++;
    if (counterDisplay) {
        counterDisplay.textContent = currentCounter;
    }
    updateLocationPreview();
}

function resetCounter() {
    currentCounter = 1;
    if (counterDisplay) {
        counterDisplay.textContent = currentCounter;
    }
    updateLocationPreview();
    showScanResult(`Counter reset to 1`, 'info');
    if (barcodeInput) barcodeInput.focus();
}

// ============================================================================
// Collapsible Builder Toggle
// ============================================================================

function toggleLocationBuilder() {
    if (locationBuilderSection) {
        const isVisible = locationBuilderSection.style.display !== 'none';
        locationBuilderSection.style.display = isVisible ? 'none' : 'block';
        if (toggleBuilderBtn) {
            const icon = toggleBuilderBtn.querySelector('i');
            if (icon) {
                icon.className = isVisible ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
            }
            toggleBuilderBtn.querySelector('span').textContent = isVisible ? 'Show Location Builder' : 'Hide Location Builder';
        }
    }
}

// ============================================================================
// Genre Management
// ============================================================================

async function loadGenres() {
    console.log('📀 Loading genres from API...');
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/genres`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load genres: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            availableGenres = data.genres || [];
            console.log(`📀 Loaded ${availableGenres.length} genres`);
            renderGenreSelect();
        } else {
            throw new Error(data.error || 'Failed to load genres');
        }
    } catch (error) {
        console.error('Error loading genres:', error);
        availableGenres = [];
        renderGenreSelect();
        showScanResult(`Warning: Could not load genres - ${error.message}`, 'warning');
    }
}

function renderGenreSelect() {
    if (!genreSelect) return;
    
    const currentValue = genreSelect.value;
    genreSelect.innerHTML = '<option value="">-- No Genre --</option>';
    
    availableGenres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        if (currentValue === genre) {
            option.selected = true;
        }
        genreSelect.appendChild(option);
    });
}

function onGenreChange() {
    currentGenre = genreSelect ? genreSelect.value : '';
    console.log(`🎵 Genre changed to: "${currentGenre}"`);
    updateLocationPreview();
}

async function addCustomGenre() {
    const genreName = addGenreInput ? addGenreInput.value.trim() : '';
    if (!genreName) {
        showScanResult('Please enter a genre name', 'warning');
        return;
    }
    
    const formattedName = genreName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    
    if (availableGenres.includes(formattedName)) {
        showScanResult(`Genre "${formattedName}" already exists`, 'warning');
        if (genreSelect) {
            genreSelect.value = formattedName;
            currentGenre = formattedName;
            updateLocationPreview();
        }
        return;
    }
    
    availableGenres.push(formattedName);
    availableGenres.sort();
    renderGenreSelect();
    
    if (genreSelect) {
        genreSelect.value = formattedName;
        currentGenre = formattedName;
    }
    
    if (addGenreInput) addGenreInput.value = '';
    
    updateLocationPreview();
    showScanResult(`✅ Genre "${formattedName}" added`, 'success');
}

// ============================================================================
// Location Type Handlers
// ============================================================================

function onMainLocationTypeChange() {
    const isCustom = mainLocationType && mainLocationType.value === 'Custom';
    if (customLocationInput) {
        customLocationInput.style.display = isCustom ? 'block' : 'none';
    }
    if (mainLocationNumber) {
        mainLocationNumber.style.display = isCustom ? 'none' : 'block';
    }
    updateLocationPreview();
}

function onMainLocationNumberChange() {
    updateLocationPreview();
}

function onCustomLocationChange() {
    updateLocationPreview();
}

function onSublocationChange() {
    currentSublocation = sublocationSelect ? sublocationSelect.value : '';
    updateLocationPreview();
}

// ============================================================================
// Duplicate Record Modal Functions
// ============================================================================

function closeDuplicateRecordModal() {
    if (modalKeyHandler) {
        document.removeEventListener('keydown', modalKeyHandler);
        modalKeyHandler = null;
    }
    
    if (modalElement) {
        modalElement.style.display = 'none';
    }
    
    isModalActive = false;
    currentModalRecords = [];
    currentSelectedRecord = null;
    
    if (barcodeInput) {
        barcodeInput.disabled = false;
        barcodeInput.focus();
    }
}

function selectRecord(record) {
    document.querySelectorAll('.record-selection-card').forEach(card => {
        const cardRecordId = parseInt(card.getAttribute('data-record-id'));
        if (cardRecordId === record.id) {
            card.classList.add('selected');
            card.style.border = '2px solid #2196f3';
            card.style.background = '#e3f2fd';
            
            const badge = card.querySelector('.selection-badge');
            if (badge) {
                badge.innerHTML = '<i class="fas fa-check-circle"></i> SELECTED - Press ENTER to confirm';
                badge.style.background = '#2196f3';
                badge.style.color = 'white';
            }
        } else {
            card.classList.remove('selected');
            card.style.border = '2px solid #ddd';
            card.style.background = 'white';
            
            const badge = card.querySelector('.selection-badge');
            if (badge) {
                badge.innerHTML = 'Click to select';
                badge.style.background = '#e0e0e0';
                badge.style.color = '#666';
            }
        }
    });
    
    currentSelectedRecord = record;
    playBeep(600, 100, 'sine');
}

function confirmAndProcess() {
    if (currentSelectedRecord) {
        console.log('Confirming selection:', currentSelectedRecord.id);
        processSelectedRecord(currentSelectedRecord, currentModalRecords[0]?.barcode || '').then(() => {
            closeDuplicateRecordModal();
        }).catch(error => {
            console.error('Error processing record:', error);
            showScanResult(`❌ Error: ${error.message}`, 'error');
        });
    }
}

function showDuplicateRecordModal(records, originalBarcode, autoSelectedRecord = null) {
    modalElement = document.getElementById('duplicate-record-modal');
    if (!modalElement) {
        console.error('Duplicate record modal not found!');
        return;
    }
    
    if (modalKeyHandler) {
        document.removeEventListener('keydown', modalKeyHandler);
        modalKeyHandler = null;
    }
    
    isModalActive = true;
    currentModalRecords = records;
    
    // Create recentScansList for scoring
    const recentScansList = recentScans.map(s => ({ artist: s.record.artist, sortKey: getArtistSortKey(s.record.artist) }));
    
    // Sort records by match score with recent scans
    const scoredRecords = records.map(record => ({
        record: record,
        score: calculateMatchScore(record, recentScansList)
    }));
    
    scoredRecords.sort((a, b) => b.score - a.score);
    const sortedRecords = scoredRecords.map(s => s.record);
    const bestMatch = sortedRecords[0];
    const bestScore = scoredRecords[0].score;
    const secondScore = scoredRecords.length > 1 ? scoredRecords[1].score : 0;
    
    // Auto-select if confidence is high enough
    let selectedRecord = null;
    let autoSelected = false;
    
    if (autoSelectedRecord) {
        selectedRecord = autoSelectedRecord;
        autoSelected = true;
    } else if (bestScore > 80 && (bestScore - secondScore) > 30) {
        selectedRecord = bestMatch;
        autoSelected = true;
        console.log('Auto-selected record due to high confidence:', selectedRecord.id, 'score:', bestScore);
    } else if (sortedRecords.length === 1) {
        selectedRecord = sortedRecords[0];
        autoSelected = true;
    } else {
        selectedRecord = bestMatch;
    }
    
    currentSelectedRecord = selectedRecord;
    
    const barcodeDisplay = document.getElementById('dup-barcode-display');
    const countDisplay = document.getElementById('dup-count-display');
    
    if (barcodeDisplay) barcodeDisplay.textContent = originalBarcode;
    if (countDisplay) countDisplay.textContent = records.length;
    
    const listContainer = document.getElementById('duplicate-records-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    // If auto-selected with high confidence, process immediately without modal
    if (autoSelected && bestScore > 80 && records.length > 1) {
        console.log('🚀 Auto-selecting with high confidence, skipping modal');
        playBeep(880, 150, 'sine');
        showScanResult(`🎯 Auto-selected: ${selectedRecord.artist} - ${selectedRecord.title} (matches recent pattern)`, 'success');
        
        processSelectedRecord(selectedRecord, originalBarcode).then(() => {
            isModalActive = false;
            currentModalRecords = [];
            currentSelectedRecord = null;
        }).catch(error => {
            console.error('Error processing auto-selected record:', error);
            showScanResult(`❌ Error: ${error.message}`, 'error');
            showDuplicateRecordModal(records, originalBarcode, null);
        });
        return;
    }
    
    // Show modal for manual selection
    let instructionText = '';
    if (autoSelected) {
        instructionText = `<strong>Suggested record pre-selected</strong> - Press ENTER to confirm, or click another record`;
    } else {
        instructionText = `<strong>Multiple matches found</strong> - Click a record, then press ENTER`;
    }
    
    // Add instruction banner
    const instructionBanner = document.createElement('div');
    instructionBanner.style.cssText = `
        margin-bottom: 15px;
        padding: 12px;
        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
        border-radius: 8px;
        text-align: center;
        color: white;
        font-weight: bold;
    `;
    instructionBanner.innerHTML = `
        <i class="fas fa-info-circle"></i> 
        ${instructionText}
    `;
    listContainer.appendChild(instructionBanner);
    
    // Create card grid
    const gridContainer = document.createElement('div');
    gridContainer.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 15px;
        margin-top: 10px;
        max-height: 450px;
        overflow-y: auto;
        padding: 5px;
    `;
    
    sortedRecords.forEach((record, idx) => {
        const isActive = record.status_id === 2;
        const artistSortKey = getArtistSortKey(record.artist);
        const isSelected = currentSelectedRecord && currentSelectedRecord.id === record.id;
        const matchScore = scoredRecords.find(s => s.record.id === record.id)?.score || 0;
        
        let imageUrl = null;
        if (record.image_url && record.image_url !== '' && record.image_url !== 'None') {
            imageUrl = record.image_url;
        }
        
        const card = document.createElement('div');
        card.className = 'record-selection-card';
        if (isSelected) card.classList.add('selected');
        card.setAttribute('data-record-id', record.id);
        card.style.cssText = `
            background: ${isSelected ? '#e3f2fd' : 'white'};
            border: 2px solid ${isSelected ? '#2196f3' : '#ddd'};
            border-radius: 10px;
            padding: 12px;
            transition: all 0.2s ease;
            cursor: pointer;
            position: relative;
            ${!isActive ? 'opacity: 0.6;' : ''}
        `;
        
        card.onclick = () => {
            selectRecord(record);
        };
        
        card.onmouseenter = () => {
            if (!isSelected) {
                card.style.borderColor = '#999';
                card.style.transform = 'translateY(-2px)';
                card.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
            }
        };
        card.onmouseleave = () => {
            if (!isSelected) {
                card.style.borderColor = '#ddd';
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = 'none';
            }
        };
        
        // Match confidence badge
        if (matchScore > 50) {
            const matchBadge = document.createElement('div');
            matchBadge.style.cssText = `
                position: absolute;
                top: -8px;
                right: -8px;
                background: ${matchScore > 80 ? '#28a745' : '#ffc107'};
                color: ${matchScore > 80 ? 'white' : '#333'};
                padding: 4px 8px;
                border-radius: 20px;
                font-size: 10px;
                font-weight: bold;
                z-index: 1;
            `;
            matchBadge.innerHTML = matchScore > 80 ? '🎯 HIGH MATCH' : '👍 MATCH';
            card.appendChild(matchBadge);
        }
        
        if (imageUrl) {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = `${record.artist || 'Unknown'} - ${record.title || 'Unknown'}`;
            img.style.cssText = `
                width: 100%;
                height: 160px;
                object-fit: cover;
                border-radius: 6px;
                background: #f0f0f0;
                margin-bottom: 10px;
            `;
            img.onerror = () => {
                img.style.display = 'none';
                const noImg = document.createElement('div');
                noImg.style.cssText = `
                    width: 100%;
                    height: 160px;
                    background: #f0f0f0;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 10px;
                    color: #999;
                `;
                noImg.innerHTML = '<i class="fas fa-record-vinyl" style="font-size: 50px;"></i>';
                card.insertBefore(noImg, img);
                img.remove();
            };
            card.appendChild(img);
        } else {
            const noImg = document.createElement('div');
            noImg.style.cssText = `
                width: 100%;
                height: 160px;
                background: #f0f0f0;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 10px;
                color: #999;
            `;
            noImg.innerHTML = '<i class="fas fa-record-vinyl" style="font-size: 50px;"></i>';
            card.appendChild(noImg);
        }
        
        const title = document.createElement('div');
        title.style.cssText = `
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 5px;
            color: #333;
            line-height: 1.3;
        `;
        title.textContent = `${record.artist || 'Unknown'} - ${(record.title || 'Unknown').substring(0, 45)}${(record.title || '').length > 45 ? '...' : ''}`;
        card.appendChild(title);
        
        const details = document.createElement('div');
        details.style.cssText = `
            font-size: 11px;
            color: #666;
            margin-top: 5px;
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
        `;
        
        let statusText = '';
        if (record.status_id === 1) statusText = '📋 New';
        else if (record.status_id === 2) statusText = '✅ Active';
        else if (record.status_id === 3) statusText = '💰 Sold';
        else statusText = '❓ Unknown';
        
        details.innerHTML = `
            <span>ID: #${record.id}</span>
            <span>${statusText}</span>
            <span>${record.store_price ? `$${parseFloat(record.store_price).toFixed(2)}` : 'Price N/A'}</span>
            <span>Section: ${artistSortKey}</span>
        `;
        card.appendChild(details);
        
        const badge = document.createElement('div');
        badge.className = 'selection-badge';
        badge.style.cssText = `
            margin-top: 10px;
            background: ${isSelected ? '#2196f3' : '#e0e0e0'};
            color: ${isSelected ? 'white' : '#666'};
            padding: 5px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: bold;
            text-align: center;
        `;
        badge.innerHTML = isSelected ? '<i class="fas fa-check-circle"></i> SELECTED - Press ENTER' : 'Click to select';
        card.appendChild(badge);
        
        gridContainer.appendChild(card);
    });
    
    listContainer.appendChild(gridContainer);
    
    const footerInstruction = document.createElement('div');
    footerInstruction.style.cssText = `
        margin-top: 15px;
        padding: 10px;
        background: #f8f9fa;
        border-radius: 8px;
        text-align: center;
        font-size: 12px;
        color: #666;
        border-left: 3px solid #ffc107;
    `;
    footerInstruction.innerHTML = `
        <i class="fas fa-keyboard"></i> 
        <strong>Press ENTER</strong> to confirm the selected record
    `;
    listContainer.appendChild(footerInstruction);
    
    modalElement.style.display = 'flex';
    
    modalKeyHandler = (e) => {
        if (!isModalActive) return;
        
        if (e.key === 'Enter') {
            e.preventDefault();
            console.log('Enter pressed, confirming selection');
            confirmAndProcess();
        }
    };
    
    document.addEventListener('keydown', modalKeyHandler);
    
    if (barcodeInput) {
        barcodeInput.disabled = false;
        setTimeout(() => {
            barcodeInput.focus();
        }, 100);
    }
    
    playBeep(1000, 400, 'sine');
}

// ============================================================================
// Scan Processing
// ============================================================================
async function processScan(barcode, fromQueue = false) {
    console.log(`Processing scan: ${barcode}, modalActive: ${isModalActive}`);
    
    if (isModalActive) {
        playBeep(600, 150, 'sine');
        showScanResult(`⚠️ Multiple records found. Select one, then press ENTER.`, 'warning');
        if (barcodeInput) barcodeInput.value = '';
        return;
    }
    
    if (barcodeInput) barcodeInput.value = '';
    showScanResult(`Scanning barcode: ${barcode}...`, 'info');
    
    try {
        const searchResponse = await fetch(`${AppConfig.baseUrl}/records/search?q=${encodeURIComponent(barcode)}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            }
        });
        
        if (!searchResponse.ok) {
            throw new Error(`Search failed: ${searchResponse.status}`);
        }
        
        const searchData = await searchResponse.json();
        
        if (searchData.status !== 'success') {
            throw new Error(searchData.error || 'Search failed');
        }
        
        const records = searchData.records || [];
        
        // API now returns exact matches only for numeric queries (ID or exact barcode)
        // No need for additional filtering
        if (records.length === 0) {
            playBeep(400, 500, 'sawtooth');
            throw new Error(`No record found with barcode or ID: ${barcode}`);
        }
        
        // Handle multiple records (should be rare now, but keep for safety)
        if (records.length > 1) {
            console.log(`Found ${records.length} records, checking for duplicates...`);
            
            const recentScansList = recentScans.map(s => ({ 
                artist: s.record.artist, 
                sortKey: getArtistSortKey(s.record.artist) 
            }));
            
            const scoredMatches = records.map(record => ({
                record: record,
                score: calculateMatchScore(record, recentScansList)
            }));
            scoredMatches.sort((a, b) => b.score - a.score);
            
            const bestMatch = scoredMatches[0];
            const bestScore = bestMatch.score;
            const secondScore = scoredMatches.length > 1 ? scoredMatches[1].score : 0;
            
            if (bestScore > 100 && (bestScore - secondScore) > 40) {
                console.log('🚀 HIGH CONFIDENCE - auto-selecting without modal');
                playBeep(880, 150, 'sine');
                showScanResult(`🎯 Auto-selected: ${bestMatch.record.artist} - ${bestMatch.record.title} (matches recent pattern)`, 'success');
                await processSelectedRecord(bestMatch.record, barcode);
                return;
            }
            
            playBeep(1000, 400, 'sine');
            showScanResult(`⚠️ ${records.length} records found. Select one, then press ENTER.`, 'warning');
            showDuplicateRecordModal(records, barcode, bestMatch.record);
            return;
        }
        
        // Single record found - process it
        await processSelectedRecord(records[0], barcode);
        
    } catch (error) {
        console.error('Scan error:', error);
        playBeep(400, 500, 'sawtooth');
        showScanResult(`❌ Error: ${error.message}`, 'error');
        
        setTimeout(() => {
            if (barcodeInput) barcodeInput.focus();
        }, 100);
    }
}


async function processSelectedRecord(record, barcode) {
    console.log(`Processing record #${record.id}: "${record.artist} - ${record.title}"`);
    
    if (record.status_id === 3) {
        playBeep(400, 500, 'sawtooth');
        showScanResult(`⚠️ Record #${record.id} is already SOLD. Cannot update location.`, 'warning');
        setTimeout(() => {
            if (barcodeInput) barcodeInput.focus();
        }, 100);
        return;
    }
    
    const locationString = buildLocationString();
    const todayDate = new Date().toISOString().split('T')[0];
    
    console.log(`Updating record #${record.id}: location="${locationString}", last_seen="${todayDate}"`);
    
    const updateResponse = await fetch(`${AppConfig.baseUrl}/records/${record.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            location: locationString,
            last_seen: todayDate
        })
    });
    
    if (!updateResponse.ok) {
        let errorMessage = `Update failed: ${updateResponse.status}`;
        try {
            const errorData = await updateResponse.json();
            if (errorData.error) errorMessage = errorData.error;
        } catch(e) {}
        throw new Error(errorMessage);
    }
    
    const updateData = await updateResponse.json();
    
    if (updateData.status !== 'success') {
        throw new Error(updateData.error || 'Update failed');
    }
    
    // Add to recent scans with the location that was just applied
    addToRecentScans(record, locationString);
    
    incrementCounter();
    playBeep(880, 100, 'sine');
    setTimeout(() => playBeep(440, 100, 'sine'), 100);
    
    const artist = record.artist || 'Unknown';
    const title = record.title || 'Unknown';
    showScanResult(
        `✅ Record #${record.id}: "${artist} - ${title}"\n   → Location: ${locationString}\n   → Last seen: ${todayDate}`,
        'success'
    );
    
    setTimeout(() => {
        if (barcodeInput) barcodeInput.focus();
    }, 100);
}

// ============================================================================
// UI Helpers
// ============================================================================

function showScanResult(message, type = 'info') {
    if (!scanResultDiv) return;
    
    scanResultDiv.style.display = 'block';
    scanResultDiv.innerHTML = message.replace(/\n/g, '<br>');
    scanResultDiv.style.color = '#000000';
    
    const colors = {
        success: 'rgba(40, 167, 69, 0.2)',
        error: 'rgba(220, 53, 69, 0.2)',
        warning: 'rgba(255, 193, 7, 0.2)',
        info: 'rgba(23, 162, 184, 0.2)'
    };
    scanResultDiv.style.backgroundColor = colors[type] || colors.info;
    scanResultDiv.style.borderLeft = `4px solid ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8'}`;
    
    if (type !== 'error') {
        setTimeout(() => {
            if (scanResultDiv && scanResultDiv.style.display === 'block') {
                scanResultDiv.style.display = 'none';
            }
        }, 5000);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Initialization
// ============================================================================

function initInventoryTab() {
    console.log('📦 Initializing Inventory Tab...');
    
    barcodeInput = document.getElementById('inventory-barcode-input');
    genreSelect = document.getElementById('genre-select');
    mainLocationType = document.getElementById('main-location-type');
    mainLocationNumber = document.getElementById('main-location-number');
    customLocationInput = document.getElementById('custom-location-input');
    sublocationSelect = document.getElementById('sublocation');
    counterDisplay = document.getElementById('counter-display');
    scanResultDiv = document.getElementById('scan-result');
    locationPreview = document.getElementById('location-preview');
    addGenreInput = document.getElementById('add-genre-input');
    addGenreBtn = document.getElementById('add-genre-btn');
    toggleBuilderBtn = document.getElementById('toggle-builder-btn');
    locationBuilderSection = document.getElementById('location-builder-section');
    scanHistoryContainer = document.getElementById('scan-history-container');
    modalElement = document.getElementById('duplicate-record-modal');
    
    if (!barcodeInput) {
        console.error('Inventory tab elements not found');
        return;
    }
    
    loadGenres();
    
    currentCounter = 1;
    if (counterDisplay) counterDisplay.textContent = currentCounter;
    
    if (genreSelect) genreSelect.addEventListener('change', onGenreChange);
    if (mainLocationType) mainLocationType.addEventListener('change', onMainLocationTypeChange);
    if (mainLocationNumber) mainLocationNumber.addEventListener('input', onMainLocationNumberChange);
    if (customLocationInput) customLocationInput.addEventListener('input', onCustomLocationChange);
    if (sublocationSelect) sublocationSelect.addEventListener('change', onSublocationChange);
    if (addGenreBtn) addGenreBtn.addEventListener('click', addCustomGenre);
    if (addGenreInput) addGenreInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCustomGenre();
    });
    if (toggleBuilderBtn) toggleBuilderBtn.addEventListener('click', toggleLocationBuilder);
    
    if (barcodeInput) {
        barcodeInput.addEventListener('keypress', onBarcodeEnter);
    }
    
    onMainLocationTypeChange();
    updateLocationPreview();
    
    // Reset state
    isModalActive = false;
    currentModalRecords = [];
    currentSelectedRecord = null;
    recentScans = [];
    
    renderScanHistory();
    
    // Default: location builder visible
    if (locationBuilderSection) {
        locationBuilderSection.style.display = 'block';
    }
    if (toggleBuilderBtn) {
        const icon = toggleBuilderBtn.querySelector('i');
        if (icon) icon.className = 'fas fa-chevron-up';
        toggleBuilderBtn.querySelector('span').textContent = 'Hide Location Builder';
    }
    
    barcodeInput.focus();
    
    console.log('✅ Inventory Tab initialized with collapsible builder and scan history');
}

function onBarcodeEnter(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const barcode = barcodeInput.value.trim();
        if (barcode) {
            processScan(barcode);
        }
    }
}

// ============================================================================
// Expose Global Functions
// ============================================================================

window.initInventoryTab = initInventoryTab;
window.resetCounter = resetCounter;
window.closeDuplicateRecordModal = closeDuplicateRecordModal;
window.toggleLocationBuilder = toggleLocationBuilder;

// ============================================================================
// Tab Activation
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'inventory') {
        if (modalKeyHandler) {
            document.removeEventListener('keydown', modalKeyHandler);
            modalKeyHandler = null;
        }
        isModalActive = false;
        currentModalRecords = [];
        currentSelectedRecord = null;
        if (modalElement) {
            modalElement.style.display = 'none';
        }
        setTimeout(initInventoryTab, 100);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const inventoryTab = document.querySelector('.tab[data-tab="inventory"]');
    if (inventoryTab && inventoryTab.classList.contains('active')) {
        setTimeout(initInventoryTab, 200);
    }
});

console.log('✅ inventory.js loaded with collapsible builder and scan history');