// ============================================================================
// artists.js - Artists Tab Functionality
// ============================================================================

// Artists Variables
let allArtists = [];
let filteredArtists = [];
let artistsCurrentPage = 1;
let artistsPageSize = 50;
let artistsTotalPages = 1;
let selectedArtists = new Set();

async function loadArtists() {
    showArtistsLoading(true);
    
    try {
        const recordsUrl = `${AppConfig.baseUrl}/records`;
        const recordsResponse = await fetch(recordsUrl);
        const recordsData = await recordsResponse.json();
        
        if (recordsData.status === 'success') {
            const records = recordsData.records || [];
            
            const artistMap = new Map();
            
            records.forEach(record => {
                if (!record.artist) return;
                
                const artistName = record.artist.trim();
                
                if (!artistMap.has(artistName)) {
                    artistMap.set(artistName, {
                        name: artistName,
                        recordCount: 0
                    });
                }
                
                const artistData = artistMap.get(artistName);
                artistData.recordCount++;
            });
            
            allArtists = Array.from(artistMap.values())
                .sort((a, b) => b.recordCount - a.recordCount);
            
            filteredArtists = [...allArtists];
            
            artistsCurrentPage = 1;
            
            renderArtists();
            
            document.getElementById('total-artists-count').textContent = allArtists.length;
        }
    } catch (error) {
        console.error('Error loading artists:', error);
        const tbody = document.getElementById('artists-body');
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#dc3545;">
            <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
            Error loading artists: ${error.message}
        </td></tr>`;
    }
    
    showArtistsLoading(false);
}

function filterArtists() {
    const searchTerm = document.getElementById('artist-search').value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredArtists = [...allArtists];
    } else {
        filteredArtists = allArtists.filter(artist => 
            artist.name.toLowerCase().includes(searchTerm)
        );
    }
    
    artistsCurrentPage = 1;
    renderArtists();
}

function renderArtists() {
    const tbody = document.getElementById('artists-body');
    
    if (filteredArtists.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px;">
            <i class="fas fa-music" style="font-size: 48px; margin-bottom: 20px; color: #ccc; display: block;"></i>
            No artists found
        </td></tr>`;
        updateArtistsPagination();
        return;
    }
    
    const startIndex = (artistsCurrentPage - 1) * artistsPageSize;
    const endIndex = Math.min(startIndex + artistsPageSize, filteredArtists.length);
    const pageArtists = filteredArtists.slice(startIndex, endIndex);
    
    let html = '';
    pageArtists.forEach((artist, index) => {
        const globalIndex = startIndex + index + 1;
        const isSelected = selectedArtists.has(artist.name);
        
        html += `
            <tr>
                <td><input type="checkbox" class="artist-checkbox" data-artist="${escapeHtml(artist.name)}" ${isSelected ? 'checked' : ''}></td>
                <td>${globalIndex}</td>
                <td><strong>${escapeHtml(artist.name)}</strong></td>
                <td style="text-align: center;"><span class="badge" style="background: #3498db; color: white; padding: 3px 8px; border-radius: 12px;">${artist.recordCount}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="searchArtistRecords('${escapeHtml(artist.name)}')">
                        <i class="fas fa-search"></i> View Records
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    document.querySelectorAll('.artist-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const artistName = this.getAttribute('data-artist');
            if (this.checked) {
                selectedArtists.add(artistName);
            } else {
                selectedArtists.delete(artistName);
            }
            updateArtistButtonStates();
        });
    });
    
    const selectAllCheckbox = document.getElementById('select-all-artists');
    selectAllCheckbox.checked = false;
    selectAllCheckbox.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.artist-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
            const artistName = checkbox.getAttribute('data-artist');
            if (this.checked) {
                selectedArtists.add(artistName);
            } else {
                selectedArtists.delete(artistName);
            }
        });
        updateArtistButtonStates();
    });
    
    updateArtistsPagination();
}

function updateArtistsPagination() {
    artistsTotalPages = Math.ceil(filteredArtists.length / artistsPageSize);
    if (artistsTotalPages === 0) artistsTotalPages = 1;
    
    document.getElementById('artists-current-page').textContent = artistsCurrentPage;
    document.getElementById('artists-total-pages').textContent = artistsTotalPages;
    
    document.getElementById('artists-first-btn').disabled = artistsCurrentPage === 1;
    document.getElementById('artists-prev-btn').disabled = artistsCurrentPage === 1;
    document.getElementById('artists-next-btn').disabled = artistsCurrentPage === artistsTotalPages;
    document.getElementById('artists-last-btn').disabled = artistsCurrentPage === artistsTotalPages;
    
    updateArtistButtonStates();
}

function updateArtistButtonStates() {
    const hasSelection = selectedArtists.size > 0;
    document.getElementById('print-artists-btn').disabled = !hasSelection;
}

function goToArtistsPage(direction) {
    if (direction === 'first') {
        artistsCurrentPage = 1;
    } else if (direction === 'prev') {
        artistsCurrentPage = Math.max(1, artistsCurrentPage - 1);
    } else if (direction === 'next') {
        artistsCurrentPage = Math.min(artistsTotalPages, artistsCurrentPage + 1);
    } else if (direction === 'last') {
        artistsCurrentPage = artistsTotalPages;
    }
    
    renderArtists();
}

function changeArtistsPageSize(newSize) {
    artistsPageSize = newSize;
    artistsCurrentPage = 1;
    renderArtists();
}

function selectTopArtists() {
    const batchSize = parseInt(document.getElementById('artist-batch-size').value) || 10;
    
    selectedArtists.clear();
    
    const topArtists = allArtists.slice(0, batchSize);
    
    topArtists.forEach(artist => {
        selectedArtists.add(artist.name);
    });
    
    renderArtists();
    
    if (topArtists.length > 0) {
        showStatus(`Selected top ${topArtists.length} artists by record count`, 'success');
    } else {
        showStatus('No artists available to select', 'info');
    }
}

function selectAllArtistsOnPage() {
    const startIndex = (artistsCurrentPage - 1) * artistsPageSize;
    const endIndex = Math.min(startIndex + artistsPageSize, filteredArtists.length);
    const pageArtists = filteredArtists.slice(startIndex, endIndex);
    
    pageArtists.forEach(artist => {
        selectedArtists.add(artist.name);
    });
    
    renderArtists();
    
    showStatus(`Selected all ${pageArtists.length} artists on this page`, 'success');
}

function clearArtistSelection() {
    selectedArtists.clear();
    renderArtists();
    showStatus('Artist selection cleared', 'info');
}

function searchArtistRecords(artistName) {
    switchTab('check-out');
    
    const searchInput = document.getElementById('search-query');
    searchInput.value = artistName;
    
    document.getElementById('filter-barcode').checked = false;
    
    searchRecordsAndAccessories();
}

function showPrintArtistsConfirmation() {
    if (selectedArtists.size === 0) {
        showStatus('No artists selected for printing', 'error');
        return;
    }
    
    const selectedArtistsList = allArtists.filter(artist => selectedArtists.has(artist.name));
    
    document.getElementById('print-artists-count').textContent = selectedArtistsList.length;
    
    const summaryList = document.getElementById('print-artists-summary-list');
    let summaryHtml = '';
    selectedArtistsList.slice(0, 10).forEach(artist => {
        summaryHtml += `<li>${escapeHtml(artist.name)} (${artist.recordCount} records)</li>`;
    });
    if (selectedArtistsList.length > 10) {
        summaryHtml += `<li>...and ${selectedArtistsList.length - 10} more</li>`;
    }
    summaryList.innerHTML = summaryHtml;
    
    document.getElementById('print-artists-confirmation-modal').style.display = 'flex';
}

function closePrintArtistsConfirmation() {
    document.getElementById('print-artists-confirmation-modal').style.display = 'none';
}

async function confirmPrintArtists() {
    closePrintArtistsConfirmation();
    showLoading(true);
    
    const selectedArtistsList = allArtists.filter(artist => selectedArtists.has(artist.name));
    
    if (selectedArtistsList.length === 0) {
        showStatus('No artists selected', 'error');
        showLoading(false);
        return;
    }
    
    await fetchAllConfigValues();
    
    const dummyRecords = selectedArtistsList.map(artist => ({
        artist: artist.name,
        title: 'ARTIST LABEL',
        store_price: 0,
        genre_name: 'Artist',
        barcode: null,
        consignor_id: null
    }));
    
    const pdfBlob = await generatePDF(dummyRecords);
    
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artist_labels_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showStatus(`PDF generated for ${selectedArtistsList.length} artists`, 'success');
    showLoading(false);
}

// Initialize when tab is activated
document.addEventListener('tabChanged', function(e) {
    if (e.detail.tabName === 'artists') {
        loadArtists();
    }
});