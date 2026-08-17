// ============================================================
// browse-component.js - Shop Tile with Pagination + Genre IDs
// ============================================================

var browseRecords = [];
var browseAllGenres = [];          // [{ id, name }, ...]
var browseSelectedGenreIds = [];   // array of genre IDs (numbers)
var browseSelectedFormatIds = [];
var browseCurrentSearchTerm = '';
var browseNewVinylActive = false;
var browseAllFormats = [];
var browseInitialized = false;

// ---- Pagination state ----
var browseCurrentPage = 1;
var browsePageSize = 20;
var browseTotalRecords = 0;
var browseTotalPages = 1;

function initBrowseComponent() {
    if (browseInitialized) return;
    browseInitialized = true;
    
    fetchBrowseFormats();
    fetchBrowseGenres();   // <-- loads genres and then records
    setupBrowseEventListeners();
    setupPaginationEventListeners();
}

// ============== fetch genres from the normalized table ==============
function fetchBrowseGenres() {
    fetch(AppConfig.baseUrl + '/api/genres')
        .then(function(response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(function(data) {
            console.log('📦 Genres API response:', data);
            
            var genres = null;
            if (data && data.genres && Array.isArray(data.genres)) {
                genres = data.genres;
            } else if (data && Array.isArray(data)) {
                genres = data;
            }
            
            if (genres && genres.length > 0) {
                browseAllGenres = genres;
                console.log('✅ Loaded ' + browseAllGenres.length + ' genres');
            } else {
                console.warn('⚠️ No genres found, using empty list');
                browseAllGenres = [];
            }
            
            populateBrowseGenreDropdown();
            loadBrowseCatalogData();
        })
        .catch(function(e) {
            console.error('❌ Error fetching genres:', e);
            browseAllGenres = [];
            populateBrowseGenreDropdown();
            loadBrowseCatalogData();
        });
}

function getBrowseGenreName(genreId) {
    if (!genreId) return null;
    var genre = browseAllGenres.find(function(g) { return g.id === genreId; });
    return genre ? genre.name : null;
}

function setupBrowseEventListeners() {
    document.getElementById('browseClearAllFiltersBtn')?.addEventListener('click', function() { 
        browseSelectedGenreIds = []; 
        browseSelectedFormatIds = [];
        browseCurrentSearchTerm = ''; 
        browseNewVinylActive = false; 
        browseCurrentPage = 1;
        document.getElementById('browseSearchBox').value = ''; 
        document.querySelectorAll('#browseGenreList input').forEach(function(cb) { cb.checked = false; });
        document.querySelectorAll('#browseFormatList input').forEach(function(cb) { cb.checked = false; });
        loadBrowseCatalogData(); 
    });
    
    // REMOVED: browseNewArrivalsBtn event listener
    
    document.getElementById('browseNewVinylBtn')?.addEventListener('click', function() { 
        browseNewVinylActive = !browseNewVinylActive; 
        browseCurrentPage = 1;
        loadBrowseCatalogData(); 
    });
    
    document.getElementById('browseSearchBox')?.addEventListener('input', debounce(function() { 
        browseCurrentSearchTerm = document.getElementById('browseSearchBox').value.trim();
        browseCurrentPage = 1;
        loadBrowseCatalogData(); 
    }, 500));
    
    // Genre dropdown
    var genreBtn = document.getElementById('browseGenreFilterBtn');
    var genreDropdown = document.getElementById('browseGenreDropdown');
    genreBtn?.addEventListener('click', function(e) { 
        e.stopPropagation(); 
        genreDropdown.classList.toggle('show'); 
        document.getElementById('browseFormatDropdown')?.classList.remove('show');
    });
    
    // Format dropdown
    var formatBtn = document.getElementById('browseFormatFilterBtn');
    var formatDropdown = document.getElementById('browseFormatDropdown');
    formatBtn?.addEventListener('click', function(e) { 
        e.stopPropagation(); 
        formatDropdown.classList.toggle('show');
        document.getElementById('browseGenreDropdown')?.classList.remove('show');
    });
    
    document.addEventListener('click', function(e) { 
        if (!genreDropdown?.contains(e.target) && e.target !== genreBtn) 
            genreDropdown?.classList.remove('show');
        if (!formatDropdown?.contains(e.target) && e.target !== formatBtn)
            formatDropdown?.classList.remove('show');
    });
    
    document.getElementById('browseSelectAllGenres')?.addEventListener('click', function() { 
        document.querySelectorAll('#browseGenreList input').forEach(function(cb) { cb.checked = true; }); 
    });
    
    document.getElementById('browseClearAllGenres')?.addEventListener('click', function() { 
        document.querySelectorAll('#browseGenreList input').forEach(function(cb) { cb.checked = false; }); 
    });
    
    document.getElementById('browseApplyGenres')?.addEventListener('click', function() { 
        browseSelectedGenreIds = Array.from(document.querySelectorAll('#browseGenreList input:checked')).map(function(cb) { return parseInt(cb.value, 10); }); 
        genreDropdown.classList.remove('show'); 
        browseCurrentPage = 1;
        loadBrowseCatalogData(); 
    });
    
    document.getElementById('browseSelectAllFormats')?.addEventListener('click', function() { 
        document.querySelectorAll('#browseFormatList input').forEach(function(cb) { cb.checked = true; }); 
    });
    
    document.getElementById('browseClearAllFormats')?.addEventListener('click', function() { 
        document.querySelectorAll('#browseFormatList input').forEach(function(cb) { cb.checked = false; }); 
    });
    
    document.getElementById('browseApplyFormats')?.addEventListener('click', function() { 
        browseSelectedFormatIds = Array.from(document.querySelectorAll('#browseFormatList input:checked')).map(function(cb) { return parseInt(cb.value); });
        formatDropdown.classList.remove('show'); 
        browseCurrentPage = 1;
        loadBrowseCatalogData(); 
    });
}

function setupPaginationEventListeners() {
    document.getElementById('browseFirstPage')?.addEventListener('click', function() { goToBrowsePage(1); });
    document.getElementById('browsePrevPage')?.addEventListener('click', function() { goToBrowsePage(browseCurrentPage - 1); });
    document.getElementById('browseNextPage')?.addEventListener('click', function() { goToBrowsePage(browseCurrentPage + 1); });
    document.getElementById('browseLastPage')?.addEventListener('click', function() { goToBrowsePage(browseTotalPages); });
    document.getElementById('browsePageSize')?.addEventListener('change', function() {
        browsePageSize = parseInt(this.value);
        browseCurrentPage = 1;
        loadBrowseCatalogData();
    });
}

function goToBrowsePage(page) {
    if (page < 1 || page > browseTotalPages) return;
    browseCurrentPage = page;
    loadBrowseCatalogData();
}

function fetchBrowseFormats() {
    fetch(AppConfig.baseUrl + '/api/formats')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.status === 'success' && data.formats) {
                browseAllFormats = data.formats;
                populateBrowseFormatDropdown(browseAllFormats);
            }
        })
        .catch(function(e) { console.error('Error fetching formats:', e); });
}

function getBrowseFormatName(formatId) {
    if (!formatId) return null;
    var format = browseAllFormats.find(function(f) { return f.id === formatId; });
    return format ? format.name : null;
}

function getBrowseConditionDisplayName(conditionId) {
    var map = {1: 'Mint', 2: 'Near Mint', 3: 'VG+', 4: 'VG', 5: 'G+', 6: 'G', 7: 'Fair', 8: 'Poor'};
    return map[conditionId] || 'Unknown';
}

function getBrowseCombinedCondition(discId, sleeveId) {
    var disc = getBrowseConditionDisplayName(discId);
    var sleeve = getBrowseConditionDisplayName(sleeveId);
    if (disc === sleeve) return disc;
    return disc + '/' + sleeve;
}

function isBrowseNewVinyl(record) {
    return record.condition_disc_id === 1 && record.condition_sleeve_id === 1;
}

function displayBrowseRecords(records) {
    var container = document.getElementById('browseCatalogContainer');
    container.innerHTML = '';
    
    if (!records || records.length === 0) {
        container.innerHTML = '<div class="browse-no-records-message"><i class="fas fa-search"></i><p>No records match your filters.</p></div>';
        return;
    }
    
    var grid = document.createElement('div');
    grid.className = 'browse-records-grid';
    records.forEach(function(record) {
        grid.appendChild(createBrowseRecordCard(record));
    });
    container.appendChild(grid);
}

// ============== LOAD CATALOG DATA (no New Arrivals date filter) ==============
function loadBrowseCatalogData() {
    browseCurrentSearchTerm = document.getElementById('browseSearchBox')?.value.trim() || '';
    
    var params = new URLSearchParams();
    params.append('status_ids', '2');
    
    if (browseCurrentSearchTerm) {
        params.append('search', browseCurrentSearchTerm);
    }
    
    // ---- Genre filter: send genre IDs ----
    if (browseSelectedGenreIds.length > 0) {
        params.append('genre_ids', browseSelectedGenreIds.join(','));
    }
    
    if (browseSelectedFormatIds.length > 0) {
        params.append('format_ids', browseSelectedFormatIds.join(','));
    }
    
    // ---- REMOVED: Date filter (created_after) ----
    // No date filter – show all records.
    
    params.append('require_image', 'true');
    params.append('order_by', 'created_at');
    params.append('order_dir', 'DESC');
    
    // ---- Pagination parameters ----
    var limit = browsePageSize;
    var offset = (browseCurrentPage - 1) * limit;
    params.append('limit', limit);
    params.append('offset', offset);
    
    // ---- Last seen cutoff ----
    fetch(AppConfig.baseUrl + '/config/LAST_SEEN_CUTOFF_DATE')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var cutoffDate = '2026-08-13';
            if (data.config_value) {
                cutoffDate = data.config_value;
            }
            params.append('last_seen_after', cutoffDate);
            
            var url = AppConfig.baseUrl + '/records?' + params.toString();
            document.getElementById('browseCatalogContainer').innerHTML = 
                '<div class="browse-loading-indicator"><div class="browse-loading-dots"><div></div><div></div><div></div><div></div></div><p style="font-size:13px;">Loading records...</p></div>';
            
            return fetch(url);
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.status === 'success') {
                var records = data.records || [];
                browseTotalRecords = data.total || records.length;
                browseTotalPages = Math.max(1, Math.ceil(browseTotalRecords / browsePageSize));
                
                if (browseNewVinylActive) {
                    records = records.filter(function(r) { return isBrowseNewVinyl(r); });
                }
                browseRecords = records;
                
                displayBrowseRecords(browseRecords);
                updateBrowseFilterUI();
                updatePaginationUI();
            }
        })
        .catch(function(error) {
            console.error('Error loading catalog:', error);
            document.getElementById('browseCatalogContainer').innerHTML = 
                '<div class="browse-error-message"><i class="fas fa-exclamation-triangle"></i><p>Failed to load records.</p></div>';
        });
}

function updatePaginationUI() {
    var start = (browseCurrentPage - 1) * browsePageSize + 1;
    var end = Math.min(browseCurrentPage * browsePageSize, browseTotalRecords);
    var showingSpan = document.getElementById('browseShowingRange');
    var totalSpan = document.getElementById('browseTotalRecords');
    var pageInfo = document.getElementById('browsePageInfo');
    
    if (showingSpan) {
        showingSpan.textContent = browseTotalRecords > 0 ? start + '-' + end : '0';
    }
    if (totalSpan) {
        totalSpan.textContent = browseTotalRecords;
    }
    if (pageInfo) {
        pageInfo.textContent = browseCurrentPage + ' / ' + browseTotalPages;
    }
    
    document.getElementById('browseFirstPage').disabled = browseCurrentPage <= 1;
    document.getElementById('browsePrevPage').disabled = browseCurrentPage <= 1;
    document.getElementById('browseNextPage').disabled = browseCurrentPage >= browseTotalPages;
    document.getElementById('browseLastPage').disabled = browseCurrentPage >= browseTotalPages;
}

function populateBrowseGenreDropdown() {
    var genreList = document.getElementById('browseGenreList');
    if (!genreList) return;
    if (browseAllGenres.length === 0) {
        genreList.innerHTML = '<div style="color: #999; text-align: center; padding: 20px; font-size: 12px;">No genres available</div>';
        return;
    }
    genreList.innerHTML = browseAllGenres.map(function(genre) {
        return '<div class="browse-filter-checkbox-item"><input type="checkbox" id="browse_genre_' + genre.id + '" value="' + genre.id + '"><label for="browse_genre_' + genre.id + '">' + escapeBrowseHtml(genre.name) + '</label></div>';
    }).join('');
    document.querySelectorAll('#browseGenreList input').forEach(function(cb) {
        if (browseSelectedGenreIds.includes(parseInt(cb.value, 10))) cb.checked = true;
    });
}

function populateBrowseFormatDropdown(formats) {
    var formatList = document.getElementById('browseFormatList');
    if (!formatList) return;
    if (formats.length === 0) {
        formatList.innerHTML = '<div style="color: #999; text-align: center; padding: 20px; font-size: 12px;">No formats available</div>';
        return;
    }
    formatList.innerHTML = formats.map(function(f) {
        return '<div class="browse-filter-checkbox-item"><input type="checkbox" id="browse_format_' + f.id + '" value="' + f.id + '"><label for="browse_format_' + f.id + '">' + escapeBrowseHtml(f.name) + '</label></div>';
    }).join('');
    document.querySelectorAll('#browseFormatList input').forEach(function(cb) {
        if (browseSelectedFormatIds.includes(parseInt(cb.value))) cb.checked = true;
    });
}

// ============== UPDATED: no "New Arrivals" button ==============
function updateBrowseFilterUI() {
    var vinylBtn = document.getElementById('browseNewVinylBtn');
    
    if (browseNewVinylActive) vinylBtn.classList.add('active');
    else vinylBtn.classList.remove('active');
    
    var filters = [];
    if (browseCurrentSearchTerm) filters.push('Search: "' + browseCurrentSearchTerm + '"');
    if (browseNewVinylActive) filters.push('New Vinyl Only');
    if (browseSelectedGenreIds.length > 0) {
        var genreNames = browseSelectedGenreIds.map(function(id) { return getBrowseGenreName(id) || 'Unknown'; }).join(', ');
        filters.push('Genre: ' + genreNames);
    }
    if (browseSelectedFormatIds.length > 0) {
        var formatNames = browseSelectedFormatIds.map(function(id) { return getBrowseFormatName(id) || 'Format ' + id; }).join(', ');
        filters.push('Format: ' + formatNames);
    }
    
    var statusRow = document.getElementById('browseFilterStatusRow');
    var summaryDiv = document.getElementById('browseFilterSummary');
    
    if (filters.length === 0) {
        statusRow.classList.add('visible');
        summaryDiv.innerHTML = 'All Records <span class="result-count-badge">' + browseTotalRecords + ' results</span>';
    } else {
        statusRow.classList.add('visible');
        summaryDiv.innerHTML = filters.join(' · ') + ' <span class="result-count-badge">' + browseTotalRecords + ' results</span>';
    }
}

function createBrowseRecordCard(record) {
    var card = document.createElement('div');
    card.className = 'browse-record-card';
    
    var genreName = getBrowseGenreName(record.genre_id);
    var combinedCondition = getBrowseCombinedCondition(record.condition_disc_id, record.condition_sleeve_id);
    var formatName = getBrowseFormatName(record.format_id);
    
    var imageHtml = record.image_url ? 
        '<img src="' + record.image_url + '" alt="' + record.title + '" onerror="this.parentElement.classList.add(\'default-bg\'); this.style.display=\'none\';">' : '';
    
    var innerHtml = '<div class="browse-record-card-image ' + (!record.image_url ? 'default-bg' : '') + '">' + 
        (imageHtml || '<i class="fas fa-music"></i>') + 
    '</div><div class="browse-record-card-info">' +
        '<div class="browse-record-card-artist">' + escapeBrowseHtml(record.artist) + '</div>' +
        '<div class="browse-record-card-title">' + escapeBrowseHtml(record.title) + '</div>' +
        '<div class="browse-record-card-price">$' + parseFloat(record.store_price).toFixed(2) + '</div>' +
        '<span class="browse-record-card-condition">' + escapeBrowseHtml(combinedCondition) + '</span>';
    
    if (genreName) {
        innerHtml += '<div class="browse-record-card-genre"><i class="fas fa-music"></i> ' + escapeBrowseHtml(genreName) + '</div>';
    }
    
    if (formatName) {
        innerHtml += '<div class="browse-record-card-format"><i class="fas fa-record-vinyl"></i> ' + escapeBrowseHtml(formatName) + '</div>';
    }
    
    if (record.location_name) {
        var locationText = record.location_name;
        if (record.location_index !== null && record.location_index !== undefined) {
            locationText += ' - ' + record.location_index;
        }
        innerHtml += '<div class="browse-record-card-location"><i class="fas fa-map-pin"></i> ' + escapeBrowseHtml(locationText) + '</div>';
    }
    
    innerHtml += '</div>';
    
    card.innerHTML = innerHtml;
    card.addEventListener('click', function() { 
        if (typeof openRecordPopup === 'function') {
            openRecordPopup(record);
        } else {
            alert('Popup not available. Please refresh the page.');
        }
    });
    return card;
}

function escapeBrowseHtml(text) { 
    if(!text) return ''; 
    var div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

function debounce(fn, delay) { 
    var t; 
    return function() { 
        var args = arguments;
        clearTimeout(t); 
        t = setTimeout(function() { fn.apply(null, args); }, delay); 
    }; 
}