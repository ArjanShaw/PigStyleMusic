// streaming.js - Get genres from records, YouTube only with checkbox genre filtering
// Uses API's random order without additional shuffling

console.log('streaming.js loaded!');

// ========== GLOBAL VARIABLES ==========
let allRecords = [];
let filteredRecords = [];
let currentTrackIndex = 0;   // Current position in the current playlist
let youtubePlayer = null;
let youtubeAPILoaded = false;
let allGenres = [];
let selectedGenres = new Set();
let lastAddedDate = null;  // To track the most recent addition date
let showNewAdditionsOnly = false;  // New additions filter state

// ========== YOUTUBE PLAYER FUNCTIONS ==========

// Load YouTube IFrame API
function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) {
        youtubeAPILoaded = true;
        console.log('YouTube API already loaded');
        return;
    }
    
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    
    console.log('Loading YouTube API...');
}

// This function is called by YouTube API when ready
window.onYouTubeIframeAPIReady = function() {
    youtubeAPILoaded = true;
    console.log('YouTube API ready!');
    
    if (filteredRecords.length > 0) {
        loadCurrentYouTubeTrack();
    }
};

// ========== FILTER FUNCTIONS ==========

// Extract unique genres from records - ONLY GENRES WITH YOUTUBE VIDEOS
function extractUniqueGenres(records) {
    const genreSet = new Set();
    
    // Only add genres that have YouTube videos
    records.forEach(record => {
        if (record.genre_name && record.youtube_url) {
            // Check if this record has a YouTube URL
            const hasYouTube = record.youtube_url.includes('youtube.com') || 
                               record.youtube_url.includes('youtu.be');
            
            if (hasYouTube) {
                genreSet.add(record.genre_name);
            }
        }
    });
    
    allGenres = Array.from(genreSet).sort();
    
    console.log(`Extracted ${allGenres.length} unique genres with YouTube videos:`, allGenres);
    return allGenres;
}

// Initialize genre checkboxes
function initGenreCheckboxes() {
    const container = document.getElementById('genreCheckboxContainer');
    
    // Clear loading indicator
    container.innerHTML = '';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'filter-checkbox-header';
    header.innerHTML = '<h3>Filter by Genre</h3>';
    container.appendChild(header);
    
    // Create checkbox group
    const group = document.createElement('div');
    group.className = 'filter-checkbox-group';
    
    // Add checkboxes for each genre that has YouTube videos
    allGenres.forEach(genre => {
        const item = document.createElement('div');
        item.className = 'filter-checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `genre-${genre.replace(/\s+/g, '-').toLowerCase()}`;
        checkbox.value = genre;
        checkbox.checked = selectedGenres.has(genre);
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedGenres.add(genre);
            } else {
                selectedGenres.delete(genre);
            }
            console.log(`Genre ${genre} ${e.target.checked ? 'selected' : 'deselected'}`);
            console.log('Selected genres:', Array.from(selectedGenres));
            
            // Auto-apply filter when checkbox changes
            applyFilters();
            
            // Save selections
            saveSelections();
        });
        
        const label = document.createElement('label');
        label.htmlFor = `genre-${genre.replace(/\s+/g, '-').toLowerCase()}`;
        label.textContent = genre;
        
        item.appendChild(checkbox);
        item.appendChild(label);
        group.appendChild(item);
    });
    
    container.appendChild(group);
    
    // Add action buttons
    const actions = document.createElement('div');
    actions.className = 'filter-actions';
    
    // Select All button
    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'filter-action-btn filter-select-all';
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.addEventListener('click', () => {
        selectedGenres = new Set(allGenres);
        updateCheckboxes();
        applyFilters();
        saveSelections();
        console.log('All genres selected');
    });
    
    // Deselect All button
    const deselectAllBtn = document.createElement('button');
    deselectAllBtn.className = 'filter-action-btn filter-deselect-all';
    deselectAllBtn.textContent = 'Deselect All';
    deselectAllBtn.addEventListener('click', () => {
        selectedGenres.clear();
        updateCheckboxes();
        applyFilters();
        saveSelections();
        console.log('All genres deselected');
    });
    
    // Apply button (just for closing panel)
    const applyBtn = document.createElement('button');
    applyBtn.className = 'filter-action-btn filter-apply';
    applyBtn.textContent = 'Close';
    applyBtn.addEventListener('click', () => {
        document.getElementById('genreCheckboxContainer').classList.remove('show');
        document.getElementById('genreToggleBtn').classList.remove('active');
    });
    
    actions.appendChild(selectAllBtn);
    actions.appendChild(deselectAllBtn);
    actions.appendChild(applyBtn);
    container.appendChild(actions);
}

// Update all checkboxes based on selectedGenres
function updateCheckboxes() {
    allGenres.forEach(genre => {
        const checkbox = document.getElementById(`genre-${genre.replace(/\s+/g, '-').toLowerCase()}`);
        if (checkbox) {
            checkbox.checked = selectedGenres.has(genre);
        }
    });
}

// Find the most recent addition date from all records
function findLastAddedDate(records) {
    let latestDate = null;
    
    records.forEach(record => {
        if (record.created_at) {
            const recordDate = new Date(record.created_at);
            // Only consider date part (not time)
            const dateOnly = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
            
            if (!latestDate || dateOnly > latestDate) {
                latestDate = dateOnly;
            }
        }
    });
    
    lastAddedDate = latestDate;
    console.log('Last added date found:', lastAddedDate);
    
    return latestDate;
}

// Check if a record is a new addition (added on the last addition date)
function isNewAddition(record) {
    if (!lastAddedDate || !record.created_at) {
        return false;
    }
    
    const recordDate = new Date(record.created_at);
    const recordDateOnly = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
    
    return recordDateOnly.getTime() === lastAddedDate.getTime();
}

// Toggle new additions filter
function toggleNewAdditionsFilter() {
    showNewAdditionsOnly = !showNewAdditionsOnly;
    
    // Update button appearance
    const newAdditionsBtn = document.getElementById('newAdditionsToggleBtn');
    if (showNewAdditionsOnly) {
        newAdditionsBtn.classList.add('active');
        newAdditionsBtn.innerHTML = '<i class="fas fa-clock"></i> Showing New Additions';
        console.log('New additions filter: ENABLED');
    } else {
        newAdditionsBtn.classList.remove('active');
        newAdditionsBtn.innerHTML = '<i class="fas fa-clock"></i> Show New Additions';
        console.log('New additions filter: DISABLED');
    }
    
    // Apply filters
    applyFilters();
}

// Apply all active filters
function applyFilters() {
    console.log('Applying filters...');
    console.log('Selected genres:', Array.from(selectedGenres));
    console.log('Show new additions only:', showNewAdditionsOnly);
    
    // Filter records based on selected genres
    if (selectedGenres.size === 0) {
        // If no genres selected, show nothing
        filteredRecords = [];
        console.log('No genres selected, clearing all tracks');
    } else {
        // Filter to records with matching genres
        filteredRecords = allRecords.filter(record => {
            // Must have YouTube URL
            if (!record.youtube_url || 
                (!record.youtube_url.includes('youtube.com') && 
                 !record.youtube_url.includes('youtu.be'))) {
                return false;
            }
            
            // Must have genre and match selected genres
            if (!record.genre_name || !selectedGenres.has(record.genre_name)) {
                return false;
            }
            
            // Apply new additions filter if enabled
            if (showNewAdditionsOnly && !isNewAddition(record)) {
                return false;
            }
            
            return true;
        });
        
        console.log(`Filtered to ${filteredRecords.length} records with current filters`);
        
        // Show message if new additions filter is on but no matches
        if (showNewAdditionsOnly && filteredRecords.length === 0) {
            console.log('No new additions found for selected genres');
        }
    }
    
    // Reset to first track
    currentTrackIndex = 0;
    
    // Load the first track
    if (filteredRecords.length > 0) {
        if (youtubeAPILoaded) {
            loadCurrentYouTubeTrack();
        }
        
        // Show player controls
        document.getElementById('youtubeControls').style.display = 'flex';
    } else {
        // No tracks match the filter
        if (youtubePlayer) {
            youtubePlayer.destroy();
            youtubePlayer = null;
        }
        
        let message = 'No tracks found';
        if (selectedGenres.size > 0) {
            message = 'No YouTube videos found for selected genres';
            if (showNewAdditionsOnly) {
                message = 'No new additions found for selected genres';
            }
        }
        
        document.getElementById('youtube-player').innerHTML = `
            <div style="padding: 40px; text-align: center; color: white;">
                <h3>No Tracks Found</h3>
                <p>${message}.</p>
                <p>Try selecting different genres.</p>
            </div>
        `;
        
        document.getElementById('youtubeControls').style.display = 'none';
        document.getElementById('trackTitle').textContent = 'No Tracks Available';
        document.getElementById('trackArtist').textContent = 'Select genres to see tracks';
        document.getElementById('trackPrice').textContent = '';
    }
    
    // Update info tab if active
    if (document.querySelector('#info-tab').classList.contains('active')) {
        loadRecordInfo(currentTrackIndex);
    }
}

// ========== CORE FUNCTIONS ==========

// Load saved genre selections from localStorage
function loadSavedSelections() {
    const savedGenres = localStorage.getItem('pigstyleStreamingGenres');
    
    if (savedGenres) {
        try {
            const parsedGenres = JSON.parse(savedGenres);
            if (Array.isArray(parsedGenres)) {
                // Only use saved genres that still exist in current data
                const validGenres = parsedGenres.filter(genre => allGenres.includes(genre));
                if (validGenres.length > 0) {
                    selectedGenres = new Set(validGenres);
                    console.log('Loaded saved genre selections:', Array.from(selectedGenres));
                } else {
                    // If saved genres are empty or invalid, default to all genres
                    selectedGenres = new Set(allGenres);
                    console.log('No valid saved genres, defaulting to all genres');
                }
            } else {
                // Invalid saved data, default to all genres
                selectedGenres = new Set(allGenres);
                console.log('Invalid saved data, defaulting to all genres');
            }
        } catch (e) {
            console.error('Error parsing saved genres:', e);
            // Error parsing, default to all genres
            selectedGenres = new Set(allGenres);
            console.log('Error parsing saved data, defaulting to all genres');
        }
    } else {
        // No saved data, default to all genres
        selectedGenres = new Set(allGenres);
        console.log('No saved selections, defaulting to all genres');
    }
}

// Save genre selections to localStorage
function saveSelections() {
    const genresToSave = Array.from(selectedGenres);
    localStorage.setItem('pigstyleStreamingGenres', JSON.stringify(genresToSave));
    console.log('Saved genre selections:', genresToSave);
}

// Start YouTube playback with current genre selections
function startYouTubePlayback() {
    console.log('Starting YouTube playback with selected genres...');
    
    if (youtubePlayer) {
        youtubePlayer.destroy();
        youtubePlayer = null;
    }
    
    // Show player content
    document.getElementById('loading').style.display = 'none';
    document.getElementById('playerContent').style.display = 'block';
    
    // Show YouTube player
    document.getElementById('youtubeContainer').style.display = 'block';
    
    if (!youtubeAPILoaded) {
        loadYouTubeAPI();
    }
    
    // Apply filters
    applyFilters();
}

// Load current YouTube track
function loadCurrentYouTubeTrack() {
    if (filteredRecords.length === 0) return;
    
    const currentRecord = filteredRecords[currentTrackIndex];
    
    // Extract YouTube ID
    const youtubeId = extractYouTubeId(currentRecord.youtube_url);
    
    console.log('=== Loading track ===');
    console.log('Track position:', currentTrackIndex + 1, '/', filteredRecords.length);
    console.log('Artist:', currentRecord.artist);
    console.log('Title:', currentRecord.title);
    console.log('Record ID:', currentRecord.id);
    console.log('YouTube ID:', youtubeId);
    console.log('Genre:', currentRecord.genre_name);
    console.log('Created at:', currentRecord.created_at);
    console.log('Is new addition:', isNewAddition(currentRecord));
    
    // Update track info
    document.getElementById('trackTitle').textContent = currentRecord.title || 'Unknown Title';
    document.getElementById('trackArtist').textContent = currentRecord.artist || 'Unknown Artist';
    
    // Update price
    const priceElement = document.getElementById('trackPrice');
    if (priceElement && currentRecord.store_price) {
        priceElement.textContent = `$${parseFloat(currentRecord.store_price).toFixed(2)}`;
    }
    
    if (!youtubeId) {
        document.getElementById('youtube-player').innerHTML = `
            <div style="padding: 40px; text-align: center; color: white;">
                <h3>No YouTube Video Available</h3>
                <p>Track: ${currentRecord.artist} - ${currentRecord.title}</p>
                <p>YouTube URL: ${currentRecord.youtube_url || 'None'}</p>
                <div style="margin-top: 20px;">
                    <button onclick="playNextTrack()" style="padding: 10px 20px; margin: 10px; background: #f0f0f0; color: #333; border: none; border-radius: 5px;">
                        Next Track
                    </button>
                </div>
            </div>
        `;
        
        setTimeout(playNextTrack, 10000);
        return;
    }
    
    document.getElementById('youtube-player').innerHTML = '<div id="player"></div>';
    
    youtubePlayer = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: youtubeId,
        playerVars: {
            'autoplay': 1,
            'controls': 1,
            'rel': 0,
            'modestbranding': 1,
            'showinfo': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
    
    // Update info tab if it's active
    if (document.querySelector('#info-tab').classList.contains('active')) {
        loadRecordInfo(currentTrackIndex);
    }
}

// YouTube player ready callback
function onPlayerReady(event) {
    console.log('YouTube player ready');
    event.target.playVideo();
}

// YouTube player state change callback
function onPlayerStateChange(event) {
    if (event.data === 0) { // ENDED
        console.log('Video ended, playing next track...');
        playNextTrack();
    }
    
    if (event.data === 1) { // PLAYING
        console.log('Video started playing');
    }
}

// YouTube player error callback
function onPlayerError(event) {
    console.error('YouTube player error:', event.data);
    setTimeout(playNextTrack, 3000);
}

// Extract YouTube ID from URL
function extractYouTubeId(url) {
    if (!url) return null;
    
    const patterns = [
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z09_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    
    return null;
}

// Play previous track
function playPreviousTrack() {
    if (filteredRecords.length === 0) return;
    
    // Move backward
    currentTrackIndex = (currentTrackIndex - 1 + filteredRecords.length) % filteredRecords.length;
    
    console.log('Playing previous track:');
    console.log('New position:', currentTrackIndex);
    
    loadCurrentYouTubeTrack();
}

// Play next track
function playNextTrack() {
    if (filteredRecords.length === 0) return;
    
    // Move forward
    currentTrackIndex = (currentTrackIndex + 1) % filteredRecords.length;
    
    console.log('Playing next track:');
    console.log('New position:', currentTrackIndex);
    
    loadCurrentYouTubeTrack();
}

// Load records from API
async function loadRecordsFromAPI() {
    try {
        console.log('Loading records from API...');
        
        const response = await fetch('https://arjanshaw.pythonanywhere.com/records/random?limit=500&has_youtube=true');
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data && data.status === 'success' && data.records) {
            allRecords = data.records;
            console.log(`Loaded ${allRecords.length} records from API`);
            
            // Find the most recent addition date
            findLastAddedDate(allRecords);
            
            // Extract unique genres from records (only those with YouTube videos)
            extractUniqueGenres(allRecords);
            
            // Load saved selections
            loadSavedSelections();
            
            // Initialize genre checkboxes
            initGenreCheckboxes();
            
            // Update checkboxes based on saved selections
            updateCheckboxes();
            
            // Save selections (in case this is first load)
            saveSelections();
            
            // Start playing based on current selections
            startYouTubePlayback();
            
        } else {
            throw new Error('Invalid response from API');
        }
        
    } catch (error) {
        console.error('Error loading records from API:', error);
        document.getElementById('youtube-player').innerHTML = `
            <div style="padding: 40px; text-align: center; color: white;">
                <h3>Error Loading Records</h3>
                <p>Failed to load from API: ${error.message}</p>
                <p>Make sure your API server at arjanshaw.pythonanywhere.com is running.</p>
            </div>
        `;
    }
}

// ========== TAB MANAGEMENT ==========

// Initialize tab functionality
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            switchTab(tabId, this);
        });
    });
}

function switchTab(tabId, buttonElement) {
    // Update active tab button
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    buttonElement.classList.add('active');
    
    // Hide all tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    
    // Show selected tab
    const selectedPane = document.getElementById(tabId);
    if (selectedPane) {
        selectedPane.classList.add('active');
        
        // If switching to info tab and we have filtered records, load current track info
        if (tabId === 'info-tab' && filteredRecords.length > 0) {
            loadRecordInfo(currentTrackIndex);
        }
    }
}

// Load record information for the info tab
function loadRecordInfo(recordIndex) {
    const container = document.getElementById('recordInfoContainer');
    
    if (filteredRecords.length === 0 || recordIndex >= filteredRecords.length) {
        container.innerHTML = '<div class="no-record-info">No record information available</div>';
        return;
    }
    
    const record = filteredRecords[recordIndex];
    if (!record) {
        container.innerHTML = '<div class="no-record-info">No record information available</div>';
        return;
    }
    
    const artist = record.artist || 'Unknown Artist';
    const title = record.title || 'Unknown Title';
    const imageUrl = record.image_url || 'images/default-record.jpg';
    const genre = record.genre_name || 'Unknown Genre';
    const price = record.store_price ? formatPrice(record.store_price) : 'Price N/A';
    const recordCondition = record.condition || '';
    const description = record.description || '';
    const createdAt = record.created_at || '';
    const isNewAdditionFlag = isNewAddition(record);
    
    const hasCondition = recordCondition && recordCondition.trim() !== '';
    
    let conditionClass = 'record-condition';
    if (hasCondition) {
        const conditionSlug = recordCondition.toLowerCase().replace(/\s+/g, '-');
        conditionClass += ` condition-${conditionSlug}`;
    }
    
    // Format date for display
    let formattedDate = '';
    if (createdAt) {
        const date = new Date(createdAt);
        formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    
    // Escape HTML to prevent XSS
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
    
    container.innerHTML = `
        <div class="record-info-card">
            <div class="record-info-image">
                <img src="${imageUrl}" alt="${escapeHtml(title)}" onerror="this.src='images/default-record.jpg'">
            </div>
            <div class="record-info-details">
                <h3>${escapeHtml(title)}</h3>
                <p class="record-info-artist">${escapeHtml(artist)}</p>
                <p class="record-info-price">${price}</p>
                <p class="record-info-genre">${escapeHtml(genre)}</p>
                
                ${isNewAdditionFlag ? `
                    <p class="record-info-new-addition">New Addition</p>
                ` : ''}
                
                ${formattedDate ? `
                    <p class="record-info-date">Added: ${formattedDate}</p>
                ` : ''}
                
                ${hasCondition ? `
                    <p class="${conditionClass}">Condition: ${recordCondition}</p>
                ` : ''}
                
                ${description ? `
                    <div class="record-info-description">
                        <h4>Description</h4>
                        <p>${escapeHtml(description)}</p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Helper function to format price
function formatPrice(price) {
    if (!price) return 'Price N/A';
    const numPrice = parseFloat(price);
    return isNaN(numPrice) ? 'Price N/A' : `$${numPrice.toFixed(2)}`;
}

// ========== SCALE CONTROLS ==========

// Manual scaling functionality
let currentScale = 1;

function scaleDown() {
    if (currentScale > 0.5) {
        currentScale -= 0.1;
        applyScale();
    }
}

function scaleUp() {
    if (currentScale < 2.0) {
        currentScale += 0.1;
        applyScale();
    }
}

function resetScale() {
    currentScale = 1;
    applyScale();
}

function applyScale() {
    const playerContainer = document.querySelector('.player-container');
    
    if (playerContainer) {
        playerContainer.style.transform = `scale(${currentScale})`;
        playerContainer.style.transformOrigin = 'center';
    }
    
    // Update scale percentage display
    const scalePercent = document.getElementById('scalePercent');
    if (scalePercent) {
        scalePercent.textContent = `${Math.round(currentScale * 100)}%`;
    }
    
    // Save scale preference
    localStorage.setItem('pigstyleStreamingScale', currentScale);
}

// Load saved scale on startup
function loadSavedScale() {
    const savedScale = localStorage.getItem('pigstyleStreamingScale');
    if (savedScale) {
        currentScale = parseFloat(savedScale);
        // Limit scale to reasonable bounds
        currentScale = Math.max(0.5, Math.min(2.0, currentScale));
        setTimeout(() => applyScale(), 500);
    }
}

// ========== UI SETUP ==========

// Setup UI event listeners
function setupUI() {
    // Genre toggle button
    const genreToggleBtn = document.getElementById('genreToggleBtn');
    if (genreToggleBtn) {
        genreToggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const container = document.getElementById('genreCheckboxContainer');
            const btn = document.getElementById('genreToggleBtn');
            
            container.classList.toggle('show');
            btn.classList.toggle('active');
            
            // Ensure only one filter panel is open at a time
            document.getElementById('newAdditionsToggleBtn').classList.remove('active');
        });
    }
    
    // New additions toggle button
    const newAdditionsToggleBtn = document.getElementById('newAdditionsToggleBtn');
    if (newAdditionsToggleBtn) {
        newAdditionsToggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleNewAdditionsFilter();
            
            // Close genre filter if open
            document.getElementById('genreCheckboxContainer').classList.remove('show');
            document.getElementById('genreToggleBtn').classList.remove('active');
        });
    }
    
    // Close genre filter when clicking outside
    document.addEventListener('click', (e) => {
        const container = document.getElementById('genreCheckboxContainer');
        const genreBtn = document.getElementById('genreToggleBtn');
        const newAdditionsBtn = document.getElementById('newAdditionsToggleBtn');
        
        if (container && genreBtn && !container.contains(e.target) && !genreBtn.contains(e.target)) {
            container.classList.remove('show');
            genreBtn.classList.remove('active');
        }
    });
    
    // Previous/Next buttons
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (prevBtn) prevBtn.addEventListener('click', playPreviousTrack);
    if (nextBtn) nextBtn.addEventListener('click', playNextTrack);
    
    // Initialize tabs
    initTabs();
}

// ========== INITIALIZATION ==========

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing...');
    
    // Setup UI
    setupUI();
    
    // Load YouTube API
    loadYouTubeAPI();
    
    // Load records and start playing
    setTimeout(loadRecordsFromAPI, 500);
    
    // Load saved scale
    loadSavedScale();
});

// Make functions available globally
window.playPreviousTrack = playPreviousTrack;
window.playNextTrack = playNextTrack;
window.scaleDown = scaleDown;
window.scaleUp = scaleUp;
window.resetScale = resetScale;