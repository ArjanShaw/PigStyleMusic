// ============================================================
// browse-component.js - Shop Tile (Record Browsing)
// ============================================================

var browseRecords = [];
var browseAvailableGenres = [];
var browseSelectedGenres = [];
var browseSelectedFormatIds = [];
var browseCurrentSearchTerm = '';
var browseNewArrivalsActive = true;
var browseNewVinylActive = false;
var browseAllFormats = [];
var browseInitialized = false;

function initBrowseComponent() {
    if (browseInitialized) return;
    browseInitialized = true;
    
    fetchBrowseFormats();
    loadBrowseCatalogData();
    setupBrowseEventListeners();
}

function setupBrowseEventListeners() {
    document.getElementById('browseClearAllFiltersBtn')?.addEventListener('click', function() { 
        browseSelectedGenres = []; 
        browseSelectedFormatIds = [];
        browseCurrentSearchTerm = ''; 
        browseNewArrivalsActive = true; 
        browseNewVinylActive = false; 
        document.getElementById('browseSearchBox').value = ''; 
        document.querySelectorAll('#browseGenreList input').forEach(function(cb) { cb.checked = false; });
        document.querySelectorAll('#browseFormatList input').forEach(function(cb) { cb.checked = false; });
        loadBrowseCatalogData(); 
    });
    
    document.getElementById('browseNewArrivalsBtn')?.addEventListener('click', function() { 
        browseNewArrivalsActive = !browseNewArrivalsActive; 
        loadBrowseCatalogData(); 
    });
    
    document.getElementById('browseNewVinylBtn')?.addEventListener('click', function() { 
        browseNewVinylActive = !browseNewVinylActive; 
        loadBrowseCatalogData(); 
    });
    
    document.getElementById('browseSearchBox')?.addEventListener('input', debounce(function() { 
        browseCurrentSearchTerm = document.getElementById('browseSearchBox').value.trim();
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
        browseSelectedGenres = Array.from(document.querySelectorAll('#browseGenreList input:checked')).map(function(cb) { return cb.value; }); 
        genreDropdown.classList.remove('show'); 
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
        loadBrowseCatalogData(); 
    });
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

function extractBrowseGenre(discogs_genre_raw) {
    if (!discogs_genre_raw || discogs_genre_raw === 'NULL' || discogs_genre_raw.trim() === '') return null;
    var genres = discogs_genre_raw.split(',').map(function(g) { return g.trim(); });
    return genres[0] || null;
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

function loadBrowseCatalogData() {
    browseCurrentSearchTerm = document.getElementById('browseSearchBox')?.value.trim() || '';
    
    var params = new URLSearchParams();
    params.append('status_ids', '2');
    
    if (browseCurrentSearchTerm) {
        params.append('artist', browseCurrentSearchTerm);
        params.append('title', browseCurrentSearchTerm);
    }
    
    if (browseSelectedGenres.length > 0) {
        params.append('genres', browseSelectedGenres.join(','));
    }
    
    if (browseSelectedFormatIds.length > 0) {
        params.append('format_ids', browseSelectedFormatIds.join(','));
    }
    
    if (browseNewArrivalsActive) {
        var sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        params.append('created_after', sevenDaysAgo.toISOString().split('T')[0]);
    }
    
    params.append('require_image', 'true');
    params.append('order_by', 'created_at');
    params.append('order_dir', 'DESC');
    
    var cutoffDays = 30;
    try {
        var configResponse = fetch(AppConfig.baseUrl + '/config/INVENTORY_CUTOFF_DAYS')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.config_value) {
                    cutoffDays = parseInt(data.config_value) || 30;
                }
                var cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);
                params.append('created_after', cutoffDate.toISOString().split('T')[0]);
                
                var url = AppConfig.baseUrl + '/records?' + params.toString();
                document.getElementById('browseCatalogContainer').innerHTML = '<div class="browse-loading-indicator"><div class="browse-loading-dots"><div></div><div></div><div></div><div></div></div><p style="font-size:13px;">Loading records...</p></div>';
                
                return fetch(url);
            })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.status === 'success') {
                    var records = data.records || [];
                    if (browseNewVinylActive) {
                        records = records.filter(function(r) { return isBrowseNewVinyl(r); });
                    }
                    browseRecords = records;
                    
                    var genreSet = new Set();
                    records.forEach(function(r) {
                        var genre = extractBrowseGenre(r.discogs_genre_raw);
                        if (genre) genreSet.add(genre);
                    });
                    browseAvailableGenres = Array.from(genreSet).sort();
                    populateBrowseGenreDropdown();
                    displayBrowseRecords(browseRecords);
                    updateBrowseFilterUI();
                }
            })
            .catch(function(error) {
                console.error('Error loading catalog:', error);
                document.getElementById('browseCatalogContainer').innerHTML = '<div class="browse-error-message"><i class="fas fa-exclamation-triangle"></i><p>Failed to load records.</p></div>';
            });
    } catch (e) {
        console.warn('Could not fetch INVENTORY_CUTOFF_DAYS, using default 30');
        var cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        params.append('created_after', cutoffDate.toISOString().split('T')[0]);
        
        var url = AppConfig.baseUrl + '/records?' + params.toString();
        document.getElementById('browseCatalogContainer').innerHTML = '<div class="browse-loading-indicator"><div class="browse-loading-dots"><div></div><div></div><div></div><div></div></div><p style="font-size:13px;">Loading records...</p></div>';
        
        fetch(url)
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.status === 'success') {
                    var records = data.records || [];
                    if (browseNewVinylActive) {
                        records = records.filter(function(r) { return isBrowseNewVinyl(r); });
                    }
                    browseRecords = records;
                    
                    var genreSet = new Set();
                    records.forEach(function(r) {
                        var genre = extractBrowseGenre(r.discogs_genre_raw);
                        if (genre) genreSet.add(genre);
                    });
                    browseAvailableGenres = Array.from(genreSet).sort();
                    populateBrowseGenreDropdown();
                    displayBrowseRecords(browseRecords);
                    updateBrowseFilterUI();
                }
            })
            .catch(function(error) {
                console.error('Error loading catalog:', error);
                document.getElementById('browseCatalogContainer').innerHTML = '<div class="browse-error-message"><i class="fas fa-exclamation-triangle"></i><p>Failed to load records.</p></div>';
            });
    }
}

function populateBrowseGenreDropdown() {
    var genreList = document.getElementById('browseGenreList');
    if (!genreList) return;
    if (browseAvailableGenres.length === 0) {
        genreList.innerHTML = '<div style="color: #999; text-align: center; padding: 20px; font-size: 12px;">No genres available</div>';
        return;
    }
    genreList.innerHTML = browseAvailableGenres.map(function(genre) {
        return '<div class="browse-filter-checkbox-item"><input type="checkbox" id="browse_genre_' + escapeBrowseHtml(genre) + '" value="' + escapeBrowseHtml(genre) + '"><label for="browse_genre_' + escapeBrowseHtml(genre) + '">' + escapeBrowseHtml(genre) + '</label></div>';
    }).join('');
    document.querySelectorAll('#browseGenreList input').forEach(function(cb) {
        if (browseSelectedGenres.includes(cb.value)) cb.checked = true;
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

function updateBrowseFilterUI() {
    var arrivalsBtn = document.getElementById('browseNewArrivalsBtn');
    var vinylBtn = document.getElementById('browseNewVinylBtn');
    
    if (browseNewArrivalsActive) {
        arrivalsBtn.classList.add('active');
        arrivalsBtn.innerHTML = '<i class="fas fa-calendar-week"></i> New Arrivals';
    } else {
        arrivalsBtn.classList.remove('active');
        arrivalsBtn.innerHTML = '<i class="fas fa-list"></i> All Records';
    }
    
    if (browseNewVinylActive) vinylBtn.classList.add('active');
    else vinylBtn.classList.remove('active');
    
    var filters = [];
    if (browseCurrentSearchTerm) filters.push('Search: "' + browseCurrentSearchTerm + '"');
    if (browseNewArrivalsActive) filters.push('New Arrivals (last 7 days)');
    if (!browseNewArrivalsActive) filters.push('All Records');
    if (browseNewVinylActive) filters.push('New Vinyl Only');
    if (browseSelectedGenres.length > 0) filters.push('Genre: ' + browseSelectedGenres.join(', '));
    if (browseSelectedFormatIds.length > 0) {
        var formatNames = browseSelectedFormatIds.map(function(id) { return getBrowseFormatName(id) || 'Format ' + id; }).join(', ');
        filters.push('Format: ' + formatNames);
    }
    
    var statusRow = document.getElementById('browseFilterStatusRow');
    var summaryDiv = document.getElementById('browseFilterSummary');
    
    if (filters.length === 0 && browseNewArrivalsActive) {
        statusRow.classList.add('visible');
        summaryDiv.innerHTML = 'New Arrivals (last 7 days) <span class="result-count-badge">' + browseRecords.length + ' results</span>';
    } else if (filters.length === 0 && !browseNewArrivalsActive) {
        statusRow.classList.add('visible');
        summaryDiv.innerHTML = 'All Records <span class="result-count-badge">' + browseRecords.length + ' results</span>';
    } else if (filters.length > 0) {
        statusRow.classList.add('visible');
        summaryDiv.innerHTML = filters.join(' · ') + ' <span class="result-count-badge">' + browseRecords.length + ' results</span>';
    } else {
        statusRow.classList.remove('visible');
    }
}

function createBrowseRecordCard(record) {
    var card = document.createElement('div');
    card.className = 'browse-record-card';
    
    var genre = extractBrowseGenre(record.discogs_genre_raw);
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
    
    if (genre) {
        innerHtml += '<div class="browse-record-card-genre"><i class="fas fa-music"></i> ' + escapeBrowseHtml(genre) + '</div>';
    }
    
    if (formatName) {
        innerHtml += '<div class="browse-record-card-format"><i class="fas fa-record-vinyl"></i> ' + escapeBrowseHtml(formatName) + '</div>';
    }
    
    innerHtml += '</div>';
    
    card.innerHTML = innerHtml;
    card.addEventListener('click', function() { 
        // Use the unified popup for records
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