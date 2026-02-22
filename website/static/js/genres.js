// ============================================================================
// genres.js - Genres Tab Functionality
// ============================================================================

// Genre mismatches variables
let allMismatches = [];
let filteredMismatches = [];
let mismatchesCurrentPage = 1;
let mismatchesPageSize = 25;
let mismatchesTotalPages = 1;

// Genre edit variables
let currentEditArtist = null;
let currentEditGenreId = null;

async function loadGenreMismatches() {
    showGenresLoading(true);
    
    try {
        const artistGenreUrl = `${AppConfig.baseUrl}/artist-genre`;
        const artistGenreResponse = await fetch(artistGenreUrl);
        
        if (!artistGenreResponse.ok) {
            throw new Error(`Failed to fetch artist-genre data: ${artistGenreResponse.status}`);
        }
        
        const artistGenres = await artistGenreResponse.json();
        
        const recordsUrl = `${AppConfig.baseUrl}/records`;
        const recordsResponse = await fetch(recordsUrl);
        const recordsData = await recordsResponse.json();
        
        const genresUrl = `${AppConfig.baseUrl}/genres`;
        const genresResponse = await fetch(genresUrl);
        const genresData = await genresResponse.json();
        
        window.allGenres = [];
        if (genresData.status === 'success') {
            window.allGenres = genresData.genres || [];
        }
        
        if (recordsData.status === 'success') {
            const records = recordsData.records || [];
            
            const expectedGenreMap = new Map();
            const artistGenreIdMap = new Map();
            
            if (Array.isArray(artistGenres)) {
                artistGenres.forEach(item => {
                    const artist = item.artist;
                    const genre = item.genre_name;
                    const genreId = item.genre_id;
                    
                    if (artist && genre && !expectedGenreMap.has(artist)) {
                        expectedGenreMap.set(artist, genre);
                        artistGenreIdMap.set(artist, genreId);
                    }
                });
            }
            
            const mismatchMap = new Map();
            
            records.forEach(record => {
                if (!record.artist) return;
                
                const artist = record.artist.trim();
                const recordGenre = record.genre_name || record.genre || 'Unknown';
                
                if (expectedGenreMap.has(artist)) {
                    const expectedGenre = expectedGenreMap.get(artist);
                    const genreId = artistGenreIdMap.get(artist);
                    
                    if (recordGenre !== expectedGenre) {
                        if (!mismatchMap.has(artist)) {
                            mismatchMap.set(artist, {
                                artist: artist,
                                expectedGenre: expectedGenre,
                                genreId: genreId,
                                mismatchedRecords: []
                            });
                        }
                        
                        mismatchMap.get(artist).mismatchedRecords.push({
                            title: record.title || 'Unknown',
                            genre: recordGenre,
                            catalog: record.catalog_number || 'N/A'
                        });
                    }
                }
            });
            
            allMismatches = Array.from(mismatchMap.values())
                .filter(m => m.mismatchedRecords.length > 0)
                .sort((a, b) => b.mismatchedRecords.length - a.mismatchedRecords.length);
            
            filteredMismatches = [...allMismatches];
            
            document.getElementById('total-mismatch-artists').textContent = allMismatches.length;
            const totalMismatchRecords = allMismatches.reduce((sum, m) => sum + m.mismatchedRecords.length, 0);
            document.getElementById('total-mismatch-records').textContent = totalMismatchRecords;
            
            populateGenreFilterFromMismatches();
            
            mismatchesCurrentPage = 1;
            
            renderMismatches();
        } else {
            throw new Error('Failed to fetch records');
        }
    } catch (error) {
        console.error('Error loading genre mismatches:', error);
        const tbody = document.getElementById('genre-mismatches-body');
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">
            <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
            Error loading genre mismatches: ${error.message}
        </td></tr>`;
    }
    
    showGenresLoading(false);
}

function populateGenreFilterFromMismatches() {
    const genreSet = new Set();
    allMismatches.forEach(m => {
        genreSet.add(m.expectedGenre);
    });
    
    const genreFilter = document.getElementById('genre-filter-select');
    const currentValue = genreFilter.value;
    
    const sortedGenres = Array.from(genreSet).sort();
    
    genreFilter.innerHTML = '<option value="all">All Genres</option>';
    
    sortedGenres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        genreFilter.appendChild(option);
    });
    
    if (currentValue !== 'all' && sortedGenres.includes(currentValue)) {
        genreFilter.value = currentValue;
    }
}

function filterGenreMismatches() {
    const searchTerm = document.getElementById('genre-mismatch-search').value.toLowerCase().trim();
    const selectedGenre = document.getElementById('genre-filter-select').value;
    
    filteredMismatches = allMismatches.filter(mismatch => {
        if (searchTerm && !mismatch.artist.toLowerCase().includes(searchTerm)) {
            return false;
        }
        
        if (selectedGenre !== 'all' && mismatch.expectedGenre !== selectedGenre) {
            return false;
        }
        
        return true;
    });
    
    mismatchesCurrentPage = 1;
    renderMismatches();
}

function renderMismatches() {
    const tbody = document.getElementById('genre-mismatches-body');
    
    if (filteredMismatches.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px;">
            <i class="fas fa-check-circle" style="font-size: 48px; margin-bottom: 20px; color: #28a745; display: block;"></i>
            No genre mismatches found!
        </td></tr>`;
        updateMismatchesPagination();
        return;
    }
    
    const startIndex = (mismatchesCurrentPage - 1) * mismatchesPageSize;
    const endIndex = Math.min(startIndex + mismatchesPageSize, filteredMismatches.length);
    const pageMismatches = filteredMismatches.slice(startIndex, endIndex);
    
    let html = '';
    pageMismatches.forEach(mismatch => {
        let recordsHtml = '';
        mismatch.mismatchedRecords.slice(0, 3).forEach(record => {
            recordsHtml += `<div style="font-size: 0.9em; color: #666; margin: 2px 0;">
                <i class="fas fa-times" style="color: #dc3545; margin-right: 5px;"></i>
                ${escapeHtml(record.title)} (Genre: ${escapeHtml(record.genre)})
            </div>`;
        });
        if (mismatch.mismatchedRecords.length > 3) {
            recordsHtml += `<div style="font-size: 0.9em; color: #666;">...and ${mismatch.mismatchedRecords.length - 3} more</div>`;
        }
        
        html += `
            <tr>
                <td><strong>${escapeHtml(mismatch.artist)}</strong></td>
                <td><span class="badge" style="background: #28a745; color: white; padding: 3px 8px; border-radius: 12px;">${escapeHtml(mismatch.expectedGenre)}</span></td>
                <td>${recordsHtml}</td>
                <td style="text-align: center;"><span class="badge" style="background: #dc3545; color: white; padding: 3px 8px; border-radius: 12px;">${mismatch.mismatchedRecords.length}</span></td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="showGenreEditModal('${escapeHtml(mismatch.artist)}', '${escapeHtml(mismatch.expectedGenre)}', ${mismatch.genreId})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    updateMismatchesPagination();
}

function updateMismatchesPagination() {
    mismatchesTotalPages = Math.ceil(filteredMismatches.length / mismatchesPageSize);
    if (mismatchesTotalPages === 0) mismatchesTotalPages = 1;
    
    document.getElementById('mismatches-current-page').textContent = mismatchesCurrentPage;
    document.getElementById('mismatches-total-pages').textContent = mismatchesTotalPages;
    
    document.getElementById('mismatches-first-btn').disabled = mismatchesCurrentPage === 1;
    document.getElementById('mismatches-prev-btn').disabled = mismatchesCurrentPage === 1;
    document.getElementById('mismatches-next-btn').disabled = mismatchesCurrentPage === mismatchesTotalPages;
    document.getElementById('mismatches-last-btn').disabled = mismatchesCurrentPage === mismatchesTotalPages;
}

function goToMismatchesPage(direction) {
    if (direction === 'first') {
        mismatchesCurrentPage = 1;
    } else if (direction === 'prev') {
        mismatchesCurrentPage = Math.max(1, mismatchesCurrentPage - 1);
    } else if (direction === 'next') {
        mismatchesCurrentPage = Math.min(mismatchesTotalPages, mismatchesCurrentPage + 1);
    } else if (direction === 'last') {
        mismatchesCurrentPage = mismatchesTotalPages;
    }
    
    renderMismatches();
}

function changeMismatchesPageSize(newSize) {
    mismatchesPageSize = newSize;
    mismatchesCurrentPage = 1;
    renderMismatches();
}

function showGenreEditModal(artist, currentGenre, genreId) {
    currentEditArtist = artist;
    currentEditGenreId = genreId;
    
    document.getElementById('edit-artist-name').textContent = artist;
    
    const genreSelect = document.getElementById('edit-genre-select');
    genreSelect.innerHTML = '';
    
    if (window.allGenres && window.allGenres.length > 0) {
        window.allGenres.forEach(genre => {
            const option = document.createElement('option');
            option.value = genre.id;
            option.textContent = genre.genre_name;
            if (genre.genre_name === currentGenre) {
                option.selected = true;
            }
            genreSelect.appendChild(option);
        });
    }
    
    document.getElementById('genre-edit-modal').style.display = 'flex';
}

function closeGenreEditModal() {
    document.getElementById('genre-edit-modal').style.display = 'none';
    currentEditArtist = null;
    currentEditGenreId = null;
}

async function saveGenreEdit() {
    if (!currentEditArtist || !currentEditGenreId) {
        alert('Missing artist or genre information');
        return;
    }
    
    const genreSelect = document.getElementById('edit-genre-select');
    const newGenreId = genreSelect.value;
    
    const saveBtn = document.getElementById('save-genre-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Saving...';
    saveBtn.disabled = true;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/artist-genre/${encodeURIComponent(currentEditArtist)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                genre_id: newGenreId
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showStatus(`Successfully updated genre for ${currentEditArtist}`, 'success');
            closeGenreEditModal();
            await loadGenreMismatches();
        } else {
            throw new Error(data.error || 'Failed to update genre');
        }
    } catch (error) {
        console.error('Error updating genre:', error);
        showStatus(`Error updating genre: ${error.message}`, 'error');
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'genres') {
        loadGenreMismatches();
    }
});