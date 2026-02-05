// streaming.js - PigStyle Records Streaming Station
console.log('PigStyle Streaming loaded!');

// ========== GLOBAL VARIABLES ==========
let allRecords = [];
let filteredRecords = [];
let currentTrackIndex = 0;
let youtubePlayer = null;
let youtubeAPILoaded = false;
let allGenres = [];
let selectedGenres = new Set();
let lastAddedDate = null;
let showNewAdditionsOnly = false;
let isInitialLoad = true; // Track if this is the first load

// ========== INITIALIZATION ==========

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing streaming station...');
    
    // Setup UI event listeners
    setupUI();
    
    // Load YouTube API first
    loadYouTubeAPI();
    
    // Load records from API after YouTube API is ready
    setTimeout(loadRecords, 1000);
});

// ========== YOUTUBE PLAYER ==========

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

// This is called by YouTube API when it's ready
window.onYouTubeIframeAPIReady = function() {
    youtubeAPILoaded = true;
    console.log('YouTube API ready!');
    
    // If we already have filtered records, load the first track
    if (filteredRecords.length > 0 && isInitialLoad) {
        console.log('Loading first track after YouTube API ready');
        loadCurrentYouTubeTrack();
    }
};

// ========== CORE FUNCTIONS ==========

async function loadRecords() {
    try {
        console.log('Loading records from API...');
        
        // Use the API utility function
        const records = await pigstyleAPI.loadRandomRecords(500, true);
        
        if (records && records.length > 0) {
            allRecords = records;
            console.log(`Loaded ${allRecords.length} records`);
            
            // Extract unique genres
            extractUniqueGenres();
            
            // Setup genre checkboxes
            setupGenreCheckboxes();
            
            // Initialize tabs
            initTabs();
            
            // Show player
            document.getElementById('loading').style.display = 'none';
            document.getElementById('playerContent').style.display = 'block';
            
            // Start playing
            applyGenreFilter();
            
        } else {
            throw new Error('No records returned from API');
        }
        
    } catch (error) {
        console.error('Error loading records:', error);
        showError(`Failed to load records: ${error.message}`);
    }
}

function extractUniqueGenres() {
    const genreSet = new Set();
    
    allRecords.forEach(record => {
        if (record.genre_name && record.youtube_url) {
            const hasYouTube = record.youtube_url.includes('youtube.com') || 
                               record.youtube_url.includes('youtu.be');
            if (hasYouTube) {
                genreSet.add(record.genre_name);
            }
        }
    });
    
    allGenres = Array.from(genreSet).sort();
    console.log(`Found ${allGenres.length} genres with YouTube videos`);
    
    // Select all genres by default
    selectedGenres = new Set(allGenres);
}

function setupGenreCheckboxes() {
    const container = document.getElementById('genreCheckboxContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    const header = document.createElement('div');
    header.className = 'filter-checkbox-header';
    header.innerHTML = '<h3>Filter by Genre</h3>';
    container.appendChild(header);
    
    const group = document.createElement('div');
    group.className = 'filter-checkbox-group';
    
    allGenres.forEach(genre => {
        const checkboxId = `genre-${genre.replace(/\s+/g, '-').toLowerCase()}`;
        
        const item = document.createElement('div');
        item.className = 'filter-checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.value = genre;
        checkbox.checked = true;
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedGenres.add(genre);
            } else {
                selectedGenres.delete(genre);
            }
            applyGenreFilter();
            saveSelections();
        });
        
        const label = document.createElement('label');
        label.htmlFor = checkboxId;
        label.textContent = genre;
        
        item.appendChild(checkbox);
        item.appendChild(label);
        group.appendChild(item);
    });
    
    container.appendChild(group);
    
    const actions = document.createElement('div');
    actions.className = 'filter-actions';
    
    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'filter-action-btn filter-select-all';
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.addEventListener('click', () => {
        selectedGenres = new Set(allGenres);
        updateCheckboxes();
        applyGenreFilter();
        saveSelections();
    });
    
    const deselectAllBtn = document.createElement('button');
    deselectAllBtn.className = 'filter-action-btn filter-deselect-all';
    deselectAllBtn.textContent = 'Deselect All';
    deselectAllBtn.addEventListener('click', () => {
        selectedGenres.clear();
        updateCheckboxes();
        applyGenreFilter();
        saveSelections();
    });
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'filter-action-btn filter-apply';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
        container.classList.remove('show');
        const genreToggleBtn = document.getElementById('genreToggleBtn');
        if (genreToggleBtn) genreToggleBtn.classList.remove('active');
    });
    
    actions.appendChild(selectAllBtn);
    actions.appendChild(deselectAllBtn);
    actions.appendChild(closeBtn);
    container.appendChild(actions);
}

function updateCheckboxes() {
    allGenres.forEach(genre => {
        const checkbox = document.getElementById(`genre-${genre.replace(/\s+/g, '-').toLowerCase()}`);
        if (checkbox) {
            checkbox.checked = selectedGenres.has(genre);
        }
    });
}

function applyGenreFilter() {
    console.log('Applying filter for genres:', Array.from(selectedGenres));
    isInitialLoad = false; // No longer the initial load
    
    if (selectedGenres.size === 0) {
        filteredRecords = [];
        showNoTracksMessage();
    } else {
        filteredRecords = allRecords.filter(record => {
            if (!record.youtube_url || 
                (!record.youtube_url.includes('youtube.com') && 
                 !record.youtube_url.includes('youtu.be'))) {
                return false;
            }
            
            if (!record.genre_name || !selectedGenres.has(record.genre_name)) {
                return false;
            }
            
            if (showNewAdditionsOnly) {
                // Check if this record is a new addition
                if (!record.created_at) return false;
                if (!lastAddedDate) {
                    // Find the most recent date
                    findLastAddedDate();
                }
                const recordDate = new Date(record.created_at);
                const recordDateOnly = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
                if (recordDateOnly.getTime() !== lastAddedDate.getTime()) {
                    return false;
                }
            }
            
            return true;
        });
        
        console.log(`Filtered to ${filteredRecords.length} tracks`);
        
        if (filteredRecords.length > 0) {
            currentTrackIndex = 0;
            
            // Load the YouTube track immediately
            loadCurrentYouTubeTrack();
        } else {
            showNoTracksMessage();
        }
    }
}

function findLastAddedDate() {
    let latestDate = null;
    
    allRecords.forEach(record => {
        if (record.created_at) {
            const recordDate = new Date(record.created_at);
            const dateOnly = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
            
            if (!latestDate || dateOnly > latestDate) {
                latestDate = dateOnly;
            }
        }
    });
    
    lastAddedDate = latestDate;
    console.log('Last added date:', lastAddedDate);
    return latestDate;
}

// ========== TRACK PLAYBACK ==========

function loadCurrentYouTubeTrack() {
    if (filteredRecords.length === 0) return;
    
    const currentRecord = filteredRecords[currentTrackIndex];
    const youtubeId = extractYouTubeId(currentRecord.youtube_url);
    
    console.log(`Playing track ${currentTrackIndex + 1}/${filteredRecords.length}:`, 
                currentRecord.artist, '-', currentRecord.title);
    
    // Update track info
    document.getElementById('trackTitle').textContent = currentRecord.title || 'Unknown Title';
    document.getElementById('trackArtist').textContent = currentRecord.artist || 'Unknown Artist';
    
    const priceElement = document.getElementById('trackPrice');
    if (priceElement && currentRecord.store_price) {
        priceElement.textContent = `Price: $${parseFloat(currentRecord.store_price).toFixed(2)}`;
    }
    
    // Update record info tab if active
    if (document.querySelector('#info-tab')?.classList.contains('active')) {
        loadRecordInfo();
    }
    
    if (!youtubeId) {
        document.getElementById('youtube-player').innerHTML = `
            <div style="padding: 40px; text-align: center; color: white;">
                <h3>No YouTube Video Available</h3>
                <p>${currentRecord.artist} - ${currentRecord.title}</p>
                <p>Auto-playing next track in 5 seconds...</p>
            </div>
        `;
        setTimeout(playNextTrack, 5000);
        return;
    }
    
    document.getElementById('youtube-player').innerHTML = '<div id="player"></div>';
    
    if (youtubePlayer) {
        youtubePlayer.destroy();
    }
    
    // Force autoplay by setting muted if autoplay is blocked
    const playerVars = {
        'autoplay': 1,
        'controls': 1,
        'rel': 0,
        'modestbranding': 1,
        'showinfo': 0
    };
    
    // On initial load, try muted autoplay which works better
    if (isInitialLoad) {
        playerVars.mute = 1;
    }
    
    youtubePlayer = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: youtubeId,
        playerVars: playerVars,
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function extractYouTubeId(url) {
    if (!url) return null;
    
    const patterns = [
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
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

function onPlayerReady(event) {
    console.log('YouTube player ready, starting playback...');
    
    // Try to unmute and play
    try {
        event.target.unMute();
        event.target.playVideo();
    } catch (error) {
        console.log('Could not unmute, trying to play anyway...');
        event.target.playVideo();
    }
}

function onPlayerStateChange(event) {
    if (event.data === 0) { // ENDED
        console.log('Video ended, playing next track...');
        playNextTrack();
    }
    
    if (event.data === 1) { // PLAYING
        console.log('Video started playing');
        isInitialLoad = false;
    }
    
    if (event.data === 3) { // BUFFERING
        console.log('Video buffering...');
    }
    
    if (event.data === 2) { // PAUSED
        console.log('Video paused');
    }
    
    if (event.data === 5) { // VIDEO CUED
        console.log('Video cued');
    }
}

function onPlayerError(event) {
    console.error('YouTube player error:', event.data);
    // Try to play next track on error
    setTimeout(playNextTrack, 3000);
}

function playPreviousTrack() {
    if (filteredRecords.length === 0) return;
    currentTrackIndex = (currentTrackIndex - 1 + filteredRecords.length) % filteredRecords.length;
    loadCurrentYouTubeTrack();
}

function playNextTrack() {
    if (filteredRecords.length === 0) return;
    currentTrackIndex = (currentTrackIndex + 1) % filteredRecords.length;
    loadCurrentYouTubeTrack();
}

// ... [REST OF THE CODE REMAINS THE SAME AS PREVIOUS VERSION] ...

// ========== ERROR HANDLING ==========

function showError(message) {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.innerHTML = `
            <div style="padding: 40px; text-align: center; color: white;">
                <h3>Error Loading Records</h3>
                <p>${message}</p>
                <button onclick="location.reload()" style="padding: 10px 20px; background: #ff4081; color: white; border: none; border-radius: 5px;">
                    Retry
                </button>
            </div>
        `;
    }
}

function showNoTracksMessage() {
    const youtubePlayerElement = document.getElementById('youtube-player');
    if (youtubePlayerElement) {
        youtubePlayerElement.innerHTML = `
            <div style="padding: 40px; text-align: center; color: white;">
                <h3>No Tracks Found</h3>
                <p>No YouTube videos found for selected genres.</p>
                <p>Try selecting different genres.</p>
            </div>
        `;
    }
    
    document.getElementById('trackTitle').textContent = 'No Tracks Available';
    document.getElementById('trackArtist').textContent = 'Select genres to see tracks';
    document.getElementById('trackPrice').textContent = '';
}

// ========== LOCAL STORAGE ==========

function saveSelections() {
    const genresToSave = Array.from(selectedGenres);
    localStorage.setItem('pigstyleStreamingGenres', JSON.stringify(genresToSave));
}

function loadSavedSelections() {
    const savedGenres = localStorage.getItem('pigstyleStreamingGenres');
    if (savedGenres) {
        try {
            const parsedGenres = JSON.parse(savedGenres);
            if (Array.isArray(parsedGenres)) {
                const validGenres = parsedGenres.filter(genre => allGenres.includes(genre));
                if (validGenres.length > 0) {
                    selectedGenres = new Set(validGenres);
                }
            }
        } catch (e) {
            console.error('Error loading saved genres:', e);
        }
    }
}

// ========== UI SETUP ==========

function setupUI() {
    // Genre toggle button
    const genreToggleBtn = document.getElementById('genreToggleBtn');
    if (genreToggleBtn) {
        genreToggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const container = document.getElementById('genreCheckboxContainer');
            const btn = document.getElementById('genreToggleBtn');
            
            if (container) container.classList.toggle('show');
            if (btn) btn.classList.toggle('active');
            
            // Ensure only one filter panel is open at a time
            const newAdditionsBtn = document.getElementById('newAdditionsToggleBtn');
            if (newAdditionsBtn) newAdditionsBtn.classList.remove('active');
        });
    }
    
    // New additions toggle button
    const newAdditionsToggleBtn = document.getElementById('newAdditionsToggleBtn');
    if (newAdditionsToggleBtn) {
        newAdditionsToggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            showNewAdditionsOnly = !showNewAdditionsOnly;
            
            if (showNewAdditionsOnly) {
                newAdditionsToggleBtn.classList.add('active');
                newAdditionsToggleBtn.innerHTML = '<i class="fas fa-clock"></i> Showing New Additions';
            } else {
                newAdditionsToggleBtn.classList.remove('active');
                newAdditionsToggleBtn.innerHTML = '<i class="fas fa-clock"></i> Show New Additions';
            }
            
            // Close genre filter if open
            const container = document.getElementById('genreCheckboxContainer');
            const genreBtn = document.getElementById('genreToggleBtn');
            if (container) container.classList.remove('show');
            if (genreBtn) genreBtn.classList.remove('active');
            
            applyGenreFilter();
        });
    }
    
    // Close genre filter when clicking outside
    document.addEventListener('click', (e) => {
        const container = document.getElementById('genreCheckboxContainer');
        const genreBtn = document.getElementById('genreToggleBtn');
        
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

// ========== TAB MANAGEMENT ==========

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
        
        // If switching to info tab, load current track info
        if (tabId === 'info-tab' && filteredRecords.length > 0) {
            loadRecordInfo();
        }
    }
}

function loadRecordInfo() {
    const container = document.getElementById('recordInfoContainer');
    if (!container) return;
    
    if (filteredRecords.length === 0 || currentTrackIndex >= filteredRecords.length) {
        container.innerHTML = '<div class="record-info-loading">No record information available</div>';
        return;
    }
    
    const record = filteredRecords[currentTrackIndex];
    if (!record) {
        container.innerHTML = '<div class="record-info-loading">No record information available</div>';
        return;
    }
    
    const artist = record.artist || 'Unknown Artist';
    const title = record.title || 'Unknown Title';
    const imageUrl = record.image_url || '/static/images/default-record.jpg';
    const genre = record.genre_name || 'Unknown Genre';
    const price = record.store_price ? `$${parseFloat(record.store_price).toFixed(2)}` : 'Price N/A';
    const condition = record.condition || '';
    const description = record.description || '';
    const createdAt = record.created_at || '';
    
    // Format date
    let formattedDate = '';
    if (createdAt) {
        const date = new Date(createdAt);
        formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    
    // Check if it's a new addition
    const isNewAddition = (() => {
        if (!createdAt || !lastAddedDate) return false;
        const recordDate = new Date(createdAt);
        const recordDateOnly = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
        return recordDateOnly.getTime() === lastAddedDate.getTime();
    })();
    
    // Escape HTML
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
    
    container.innerHTML = `
        <div class="record-info-card">
            <div class="record-info-image">
                <img src="${imageUrl}" alt="${escapeHtml(title)}" onerror="this.src='/static/images/default-record.jpg'">
            </div>
            <div class="record-info-details">
                <h3>${escapeHtml(title)}</h3>
                <p class="record-info-artist">${escapeHtml(artist)}</p>
                <p class="record-info-price">${price}</p>
                <p class="record-info-genre">${escapeHtml(genre)}</p>
                
                ${isNewAddition ? `
                    <p class="record-info-new-addition">New Addition</p>
                ` : ''}
                
                ${formattedDate ? `
                    <p class="record-info-date">Added: ${formattedDate}</p>
                ` : ''}
                
                ${condition ? `
                    <p class="record-condition">Condition: ${condition}</p>
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

// ========== SCALE CONTROLS ==========

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
    
    const scalePercent = document.getElementById('scalePercent');
    if (scalePercent) {
        scalePercent.textContent = `${Math.round(currentScale * 100)}%`;
    }
    
    localStorage.setItem('pigstyleStreamingScale', currentScale);
}

function loadSavedScale() {
    const savedScale = localStorage.getItem('pigstyleStreamingScale');
    if (savedScale) {
        currentScale = parseFloat(savedScale);
        currentScale = Math.max(0.5, Math.min(2.0, currentScale));
        setTimeout(() => applyScale(), 500);
    }
}

// Make functions available globally
window.playPreviousTrack = playPreviousTrack;
window.playNextTrack = playNextTrack;
window.scaleDown = scaleDown;
window.scaleUp = scaleUp;
window.resetScale = resetScale;