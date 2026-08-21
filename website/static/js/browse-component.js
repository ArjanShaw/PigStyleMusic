// ============================================================
// browse-component.js - Reusable Factory Only
// ============================================================

function createBrowseComponent(containerId, options) {
    options = options || {};
    var statusIds = options.statusIds || '2';
    var defaultNewVinyl = options.defaultNewVinyl || false;
    var requireImage = options.requireImage !== undefined ? options.requireImage : true;
    var orderBy = options.orderBy || 'created_at';
    var orderDir = options.orderDir || 'DESC';

    var records = [];
    var allGenres = [];
    var selectedGenreIds = [];
    var selectedFormatIds = [];
    var currentSearchTerm = '';
    var newVinylActive = defaultNewVinyl;
    var allFormats = [];
    var initialized = false;

    var currentPage = 1;
    var pageSize = 24;
    var totalRecords = 0;
    var totalPages = 1;

    var container = document.getElementById(containerId);
    if (!container) {
        console.error('Browse component: container not found', containerId);
        return null;
    }

    var catalogContainer, searchBox, genreList, formatList, genreDropdown, formatDropdown;
    var statusRow, summaryDiv, clearAllBtn;
    var newVinylBtn;
    var firstBtn, prevBtn, nextBtn, lastBtn, pageInfo, pageSizeSelect, showingSpan, totalSpan;

    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function debounceLocal(fn, delay) {
        var t;
        return function() {
            var args = arguments;
            clearTimeout(t);
            t = setTimeout(function() { fn.apply(null, args); }, delay);
        };
    }

    function getGenreName(genreId) {
        if (!genreId) return null;
        var genre = allGenres.find(function(g) { return g.id === genreId; });
        return genre ? genre.name : null;
    }

    function getFormatName(formatId) {
        if (!formatId) return null;
        var format = allFormats.find(function(f) { return f.id === formatId; });
        return format ? format.name : null;
    }

    function getConditionDisplayName(conditionId) {
        var map = {1: 'Mint', 2: 'Near Mint', 3: 'VG+', 4: 'VG', 5: 'G+', 6: 'G', 7: 'Fair', 8: 'Poor'};
        return map[conditionId] || 'Unknown';
    }

    function getCombinedCondition(discId, sleeveId) {
        var disc = getConditionDisplayName(discId);
        var sleeve = getConditionDisplayName(sleeveId);
        if (disc === sleeve) return disc;
        return disc + '/' + sleeve;
    }

    function isNewVinyl(record) {
        return record.condition_disc_id === 1 && record.condition_sleeve_id === 1;
    }

    function render() {
        container.innerHTML = `
            <div class="browse-container">
                <div class="browse-search-wrapper">
                    <input type="text" id="browseSearchBox_${containerId}" placeholder="Search by artist or record title...">
                </div>
                <div class="browse-filter-section">
                    <div class="browse-filter-group">
                        <button id="browseGenreFilterBtn_${containerId}" class="browse-filter-btn">
                            <i class="fas fa-filter"></i> Genre
                        </button>
                        <div id="browseGenreDropdown_${containerId}" class="browse-filter-checkbox-container">
                            <div class="browse-filter-checkbox-group" id="browseGenreList_${containerId}">
                                <div style="color: #999; text-align: center; padding: 20px; font-size: 12px;">Loading genres...</div>
                            </div>
                            <div class="browse-filter-actions">
                                <button id="browseSelectAllGenres_${containerId}" class="browse-filter-action-btn">All</button>
                                <button id="browseClearAllGenres_${containerId}" class="browse-filter-action-btn">Clear</button>
                                <button id="browseApplyGenres_${containerId}" class="browse-filter-action-btn filter-apply">Apply</button>
                            </div>
                        </div>
                    </div>
                    <div class="browse-filter-group">
                        <button id="browseFormatFilterBtn_${containerId}" class="browse-filter-btn">
                            <i class="fas fa-record-vinyl"></i> Format
                        </button>
                        <div id="browseFormatDropdown_${containerId}" class="browse-filter-checkbox-container">
                            <div class="browse-filter-checkbox-group" id="browseFormatList_${containerId}">
                                <div style="color: #999; text-align: center; padding: 20px; font-size: 12px;">Loading formats...</div>
                            </div>
                            <div class="browse-filter-actions">
                                <button id="browseSelectAllFormats_${containerId}" class="browse-filter-action-btn">All</button>
                                <button id="browseClearAllFormats_${containerId}" class="browse-filter-action-btn">Clear</button>
                                <button id="browseApplyFormats_${containerId}" class="browse-filter-action-btn filter-apply">Apply</button>
                            </div>
                        </div>
                    </div>
                    <button id="browseNewVinylBtn_${containerId}" class="browse-filter-btn ${defaultNewVinyl ? 'active' : ''}">
                        <i class="fas fa-record-vinyl"></i> New Vinyl
                    </button>
                </div>
                <div id="browseFilterStatusRow_${containerId}" class="browse-filter-status-row visible">
                    <div class="browse-filter-summary" id="browseFilterSummary_${containerId}">Loading...</div>
                    <button id="browseClearAllFiltersBtn_${containerId}" class="browse-clear-filters-link">Clear all ✕</button>
                </div>
                <div id="browseCatalogContainer_${containerId}">
                    <div class="browse-loading-indicator">
                        <div class="browse-loading-dots">
                            <div></div><div></div><div></div><div></div>
                        </div>
                        <p style="font-size: 13px;">Loading records...</p>
                    </div>
                </div>
                <div class="browse-pagination-container">
                    <div class="browse-pagination-info">
                        Showing <span id="browseShowingRange_${containerId}">0-0</span> of <span id="browseTotalRecords_${containerId}">0</span> records
                    </div>
                    <div class="browse-pagination-controls">
                        <button id="browseFirstPage_${containerId}" class="browse-pagination-btn" disabled><i class="fas fa-angle-double-left"></i></button>
                        <button id="browsePrevPage_${containerId}" class="browse-pagination-btn" disabled><i class="fas fa-angle-left"></i></button>
                        <span class="browse-page-info" id="browsePageInfo_${containerId}">1 / 1</span>
                        <button id="browseNextPage_${containerId}" class="browse-pagination-btn" disabled><i class="fas fa-angle-right"></i></button>
                        <button id="browseLastPage_${containerId}" class="browse-pagination-btn" disabled><i class="fas fa-angle-double-right"></i></button>
                        <div class="browse-page-size-selector">
                            <label for="browsePageSize_${containerId}">Per page:</label>
                            <select id="browsePageSize_${containerId}">
                                <option value="12">12</option>
                                <option value="24" selected>24</option>
                                <option value="48">48</option>
                                <option value="96">96</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;

        catalogContainer = document.getElementById('browseCatalogContainer_' + containerId);
        searchBox = document.getElementById('browseSearchBox_' + containerId);
        genreList = document.getElementById('browseGenreList_' + containerId);
        formatList = document.getElementById('browseFormatList_' + containerId);
        genreDropdown = document.getElementById('browseGenreDropdown_' + containerId);
        formatDropdown = document.getElementById('browseFormatDropdown_' + containerId);
        statusRow = document.getElementById('browseFilterStatusRow_' + containerId);
        summaryDiv = document.getElementById('browseFilterSummary_' + containerId);
        clearAllBtn = document.getElementById('browseClearAllFiltersBtn_' + containerId);
        newVinylBtn = document.getElementById('browseNewVinylBtn_' + containerId);
        firstBtn = document.getElementById('browseFirstPage_' + containerId);
        prevBtn = document.getElementById('browsePrevPage_' + containerId);
        nextBtn = document.getElementById('browseNextPage_' + containerId);
        lastBtn = document.getElementById('browseLastPage_' + containerId);
        pageInfo = document.getElementById('browsePageInfo_' + containerId);
        pageSizeSelect = document.getElementById('browsePageSize_' + containerId);
        showingSpan = document.getElementById('browseShowingRange_' + containerId);
        totalSpan = document.getElementById('browseTotalRecords_' + containerId);
    }

    function fetchGenres() {
        fetch(AppConfig.baseUrl + '/api/genres')
            .then(function(response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
            .then(function(data) {
                var genres = null;
                if (data && data.genres && Array.isArray(data.genres)) genres = data.genres;
                else if (data && Array.isArray(data)) genres = data;
                allGenres = (genres && genres.length > 0) ? genres : [];
                populateGenreDropdown();
                loadCatalogData();
            })
            .catch(function(e) {
                console.error('Error fetching genres:', e);
                allGenres = [];
                populateGenreDropdown();
                loadCatalogData();
            });
    }

    function fetchFormats() {
        fetch(AppConfig.baseUrl + '/api/formats')
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.status === 'success' && data.formats) {
                    allFormats = data.formats;
                    populateFormatDropdown(allFormats);
                }
            })
            .catch(function(e) { console.error('Error fetching formats:', e); });
    }

    function populateGenreDropdown() {
        if (!genreList) return;
        if (allGenres.length === 0) {
            genreList.innerHTML = '<div style="color: #999; text-align: center; padding: 20px; font-size: 12px;">No genres available</div>';
            return;
        }
        genreList.innerHTML = allGenres.map(function(genre) {
            return '<div class="browse-filter-checkbox-item"><input type="checkbox" id="browse_genre_' + containerId + '_' + genre.id + '" value="' + genre.id + '"><label for="browse_genre_' + containerId + '_' + genre.id + '">' + escapeHtml(genre.name) + '</label></div>';
        }).join('');
        document.querySelectorAll('#' + genreList.id + ' input').forEach(function(cb) {
            if (selectedGenreIds.includes(parseInt(cb.value, 10))) cb.checked = true;
        });
    }

    function populateFormatDropdown(formats) {
        if (!formatList) return;
        if (formats.length === 0) {
            formatList.innerHTML = '<div style="color: #999; text-align: center; padding: 20px; font-size: 12px;">No formats available</div>';
            return;
        }
        formatList.innerHTML = formats.map(function(f) {
            return '<div class="browse-filter-checkbox-item"><input type="checkbox" id="browse_format_' + containerId + '_' + f.id + '" value="' + f.id + '"><label for="browse_format_' + containerId + '_' + f.id + '">' + escapeHtml(f.name) + '</label></div>';
        }).join('');
        document.querySelectorAll('#' + formatList.id + ' input').forEach(function(cb) {
            if (selectedFormatIds.includes(parseInt(cb.value))) cb.checked = true;
        });
    }

    function loadCatalogData() {
        currentSearchTerm = searchBox ? searchBox.value.trim() : '';
        var params = new URLSearchParams();
        params.append('status_ids', statusIds);
        if (currentSearchTerm) params.append('search', currentSearchTerm);
        if (selectedGenreIds.length > 0) params.append('genre_ids', selectedGenreIds.join(','));
        if (selectedFormatIds.length > 0) params.append('format_ids', selectedFormatIds.join(','));
        if (requireImage) params.append('require_image', 'true');
        params.append('order_by', orderBy);
        params.append('order_dir', orderDir);

        var limit = pageSize;
        var offset = (currentPage - 1) * limit;
        params.append('limit', limit);
        params.append('offset', offset);

        fetch(AppConfig.baseUrl + '/config/LAST_SEEN_CUTOFF_DATE')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var cutoffDate = '2026-08-13';
                if (data.config_value) cutoffDate = data.config_value;
                params.append('last_seen_after', cutoffDate);

                var url = AppConfig.baseUrl + '/records?' + params.toString();
                if (catalogContainer) {
                    catalogContainer.innerHTML = '<div class="browse-loading-indicator"><div class="browse-loading-dots"><div></div><div></div><div></div><div></div></div><p style="font-size:13px;">Loading records...</p></div>';
                }
                return fetch(url);
            })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.status === 'success') {
                    var fetched = data.records || [];
                    totalRecords = data.total || fetched.length;
                    totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

                    if (newVinylActive) fetched = fetched.filter(function(r) { return isNewVinyl(r); });
                    records = fetched;
                    displayRecords(records);
                    updateFilterUI();
                    updatePaginationUI();
                } else {
                    throw new Error('API error');
                }
            })
            .catch(function(error) {
                console.error('Error loading catalog:', error);
                if (catalogContainer) {
                    catalogContainer.innerHTML = '<div class="browse-error-message"><i class="fas fa-exclamation-triangle"></i><p>Failed to load records.</p></div>';
                }
            });
    }

    function displayRecords(recordsArray) {
        if (!catalogContainer) return;
        catalogContainer.innerHTML = '';
        if (!recordsArray || recordsArray.length === 0) {
            catalogContainer.innerHTML = '<div class="browse-no-records-message"><i class="fas fa-search"></i><p>No records match your filters.</p></div>';
            return;
        }
        var grid = document.createElement('div');
        grid.className = 'browse-records-grid';
        recordsArray.forEach(function(record) {
            grid.appendChild(createRecordCard(record));
        });
        catalogContainer.appendChild(grid);
    }

    function createRecordCard(record) {
        var card = document.createElement('div');
        card.className = 'browse-record-card';

        var genreName = getGenreName(record.genre_id);
        var combinedCondition = getCombinedCondition(record.condition_disc_id, record.condition_sleeve_id);
        var formatName = getFormatName(record.format_id);

        var imageHtml = record.image_url ?
            '<img src="' + record.image_url + '" alt="' + record.title + '" onerror="this.parentElement.classList.add(\'default-bg\'); this.style.display=\'none\';">' : '';

        var innerHtml = '<div class="browse-record-card-image ' + (!record.image_url ? 'default-bg' : '') + '">' +
            (imageHtml || '<i class="fas fa-music"></i>') +
            '</div><div class="browse-record-card-info">' +
            '<div class="browse-record-card-artist">' + escapeHtml(record.artist) + '</div>' +
            '<div class="browse-record-card-title">' + escapeHtml(record.title) + '</div>' +
            '<div class="browse-record-card-price">$' + parseFloat(record.store_price).toFixed(2) + '</div>' +
            '<span class="browse-record-card-condition">' + escapeHtml(combinedCondition) + '</span>';

        if (genreName) {
            innerHtml += '<div class="browse-record-card-genre"><i class="fas fa-music"></i> ' + escapeHtml(genreName) + '</div>';
        }
        if (formatName) {
            innerHtml += '<div class="browse-record-card-format"><i class="fas fa-record-vinyl"></i> ' + escapeHtml(formatName) + '</div>';
        }
        
        // ============ FIXED: Display location WITHOUT duplicating genre ============
        if (record.location_name) {
            var locationText = record.location_name;
            if (record.location_index !== null && record.location_index !== undefined) {
                locationText += ' - ' + record.location_index;
            }
            innerHtml += '<div class="browse-record-card-location"><i class="fas fa-map-pin"></i> ' + escapeHtml(locationText) + '</div>';
        }

        innerHtml += '</div>';
        card.innerHTML = innerHtml;
        card.addEventListener('click', function() {
            if (typeof openRecordPopup === 'function') openRecordPopup(record);
            else alert('Popup not available.');
        });
        return card;
    }

    function updatePaginationUI() {
        var start = (currentPage - 1) * pageSize + 1;
        var end = Math.min(currentPage * pageSize, totalRecords);
        if (showingSpan) showingSpan.textContent = totalRecords > 0 ? start + '-' + end : '0';
        if (totalSpan) totalSpan.textContent = totalRecords;
        if (pageInfo) pageInfo.textContent = currentPage + ' / ' + totalPages;
        if (firstBtn) firstBtn.disabled = currentPage <= 1;
        if (prevBtn) prevBtn.disabled = currentPage <= 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
        if (lastBtn) lastBtn.disabled = currentPage >= totalPages;
    }

    function updateFilterUI() {
        if (newVinylBtn) {
            if (newVinylActive) newVinylBtn.classList.add('active');
            else newVinylBtn.classList.remove('active');
        }

        var filters = [];
        if (currentSearchTerm) filters.push('Search: "' + currentSearchTerm + '"');
        if (newVinylActive) filters.push('New Vinyl Only');
        if (selectedGenreIds.length > 0) {
            var genreNames = selectedGenreIds.map(function(id) { return getGenreName(id) || 'Unknown'; }).join(', ');
            filters.push('Genre: ' + genreNames);
        }
        if (selectedFormatIds.length > 0) {
            var formatNames = selectedFormatIds.map(function(id) { return getFormatName(id) || 'Format ' + id; }).join(', ');
            filters.push('Format: ' + formatNames);
        }

        if (statusRow) statusRow.classList.add('visible');
        if (summaryDiv) {
            if (filters.length === 0) {
                summaryDiv.innerHTML = 'All Records <span class="result-count-badge">' + totalRecords + ' results</span>';
            } else {
                summaryDiv.innerHTML = filters.join(' · ') + ' <span class="result-count-badge">' + totalRecords + ' results</span>';
            }
        }
    }

    function goToPage(page) {
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        loadCatalogData();
    }

    function bindEvents() {
        if (searchBox) {
            searchBox.addEventListener('input', debounceLocal(function() {
                currentPage = 1;
                loadCatalogData();
            }, 500));
        }

        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', function() {
                selectedGenreIds = [];
                selectedFormatIds = [];
                currentSearchTerm = '';
                newVinylActive = defaultNewVinyl;
                if (searchBox) searchBox.value = '';
                document.querySelectorAll('#' + genreList.id + ' input').forEach(function(cb) { cb.checked = false; });
                document.querySelectorAll('#' + formatList.id + ' input').forEach(function(cb) { cb.checked = false; });
                currentPage = 1;
                loadCatalogData();
            });
        }

        if (newVinylBtn) {
            newVinylBtn.addEventListener('click', function() {
                newVinylActive = !newVinylActive;
                currentPage = 1;
                loadCatalogData();
            });
        }

        var genreBtn = document.getElementById('browseGenreFilterBtn_' + containerId);
        if (genreBtn && genreDropdown) {
            genreBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                genreDropdown.classList.toggle('show');
                if (formatDropdown) formatDropdown.classList.remove('show');
            });
        }

        var formatBtn = document.getElementById('browseFormatFilterBtn_' + containerId);
        if (formatBtn && formatDropdown) {
            formatBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                formatDropdown.classList.toggle('show');
                if (genreDropdown) genreDropdown.classList.remove('show');
            });
        }

        document.addEventListener('click', function(e) {
            if (genreDropdown && !genreDropdown.contains(e.target) && e.target !== genreBtn) genreDropdown.classList.remove('show');
            if (formatDropdown && !formatDropdown.contains(e.target) && e.target !== formatBtn) formatDropdown.classList.remove('show');
        });

        document.getElementById('browseSelectAllGenres_' + containerId)?.addEventListener('click', function() {
            document.querySelectorAll('#' + genreList.id + ' input').forEach(function(cb) { cb.checked = true; });
        });
        document.getElementById('browseClearAllGenres_' + containerId)?.addEventListener('click', function() {
            document.querySelectorAll('#' + genreList.id + ' input').forEach(function(cb) { cb.checked = false; });
        });
        document.getElementById('browseApplyGenres_' + containerId)?.addEventListener('click', function() {
            selectedGenreIds = Array.from(document.querySelectorAll('#' + genreList.id + ' input:checked')).map(function(cb) { return parseInt(cb.value, 10); });
            if (genreDropdown) genreDropdown.classList.remove('show');
            currentPage = 1;
            loadCatalogData();
        });

        document.getElementById('browseSelectAllFormats_' + containerId)?.addEventListener('click', function() {
            document.querySelectorAll('#' + formatList.id + ' input').forEach(function(cb) { cb.checked = true; });
        });
        document.getElementById('browseClearAllFormats_' + containerId)?.addEventListener('click', function() {
            document.querySelectorAll('#' + formatList.id + ' input').forEach(function(cb) { cb.checked = false; });
        });
        document.getElementById('browseApplyFormats_' + containerId)?.addEventListener('click', function() {
            selectedFormatIds = Array.from(document.querySelectorAll('#' + formatList.id + ' input:checked')).map(function(cb) { return parseInt(cb.value); });
            if (formatDropdown) formatDropdown.classList.remove('show');
            currentPage = 1;
            loadCatalogData();
        });

        if (firstBtn) firstBtn.addEventListener('click', function() { goToPage(1); });
        if (prevBtn) prevBtn.addEventListener('click', function() { goToPage(currentPage - 1); });
        if (nextBtn) nextBtn.addEventListener('click', function() { goToPage(currentPage + 1); });
        if (lastBtn) lastBtn.addEventListener('click', function() { goToPage(totalPages); });
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', function() {
                pageSize = parseInt(this.value);
                currentPage = 1;
                loadCatalogData();
            });
        }
    }

    function init() {
        if (initialized) return;
        render();
        fetchFormats();
        fetchGenres();
        bindEvents();
        initialized = true;
    }

    return {
        init: init,
        refresh: loadCatalogData,
        getState: function() {
            return {
                statusIds: statusIds,
                currentPage: currentPage,
                pageSize: pageSize,
                totalRecords: totalRecords,
                totalPages: totalPages
            };
        }
    };
}