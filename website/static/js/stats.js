// Stats Dashboard JavaScript

let charts = {};
let currentArtistPage = 1;
let currentPerPage = 50;
let currentArtistSearch = '';
let allArtistsData = [];

async function loadStatsData() {
    console.log('📊 loadStatsData() called');
    const errorDiv = document.getElementById('stats-error');
    if (errorDiv) errorDiv.style.display = 'none';
    
    try {
        if (typeof AppConfig === 'undefined') {
            throw new Error('AppConfig not loaded');
        }
        
        // Fetch all stats
        const [topArtistsRes, salesOverTimeRes, salesDiscogsTimeRes, topGenresRes] = await Promise.all([
            fetch(AppConfig.baseUrl + '/api/stats/top-artists', {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
            }),
            fetch(AppConfig.baseUrl + '/api/stats/sales-over-time-daily', {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
            }),
            fetch(AppConfig.baseUrl + '/api/stats/sales-over-time-discogs', {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
            }),
            fetch(AppConfig.baseUrl + '/api/stats/top-genres', {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
            })
        ]);
        
        const topArtists = await topArtistsRes.json();
        const salesOverTime = await salesOverTimeRes.json();
        const salesDiscogsTime = await salesDiscogsTimeRes.json();
        const topGenres = await topGenresRes.json();
        
        console.log('📊 Top Artists:', topArtists);
        console.log('📊 Sales Over Time (Store):', salesOverTime);
        console.log('📊 Sales Over Time (Discogs):', salesDiscogsTime);
        console.log('📊 Top Genres:', topGenres);
        
        if (topArtists.status !== 'success') {
            throw new Error('Top artists: ' + (topArtists.error || 'Unknown error'));
        }
        if (salesOverTime.status !== 'success') {
            throw new Error('Sales over time: ' + (salesOverTime.error || 'Unknown error'));
        }
        if (salesDiscogsTime.status !== 'success') {
            console.warn('Discogs sales data not available, using empty data');
        }
        
        // Render charts
        renderSalesOverTimeChart(salesOverTime, salesDiscogsTime);
        renderTopGenresChart(topGenres);
        
        // Load artist table (replaces the bar chart)
        loadArtistsTable(topArtists);
        
        console.log('✅ Charts and table rendered successfully');
        
    } catch (error) {
        console.error('❌ Error loading stats data:', error);
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error: ' + error.message;
        }
    }
}

function renderTopGenresChart(data) {
    const canvas = document.getElementById('topGenresChart');
    if (!canvas) return;
    
    if (charts.topGenres) {
        charts.topGenres.destroy();
    }
    
    if (!data.genres || data.genres.length === 0) {
        canvas.style.display = 'none';
        return;
    }
    
    // Filter out "Unknown" genre
    const filteredGenres = [];
    const filteredSales = [];
    
    for (let i = 0; i < data.genres.length; i++) {
        if (data.genres[i] !== 'Unknown') {
            filteredGenres.push(data.genres[i]);
            filteredSales.push(data.sales[i]);
        }
    }
    
    // If after filtering there are no genres, show a message
    if (filteredGenres.length === 0) {
        canvas.style.display = 'none';
        const container = canvas.parentElement;
        const existingMsg = container.querySelector('.no-genre-data');
        if (!existingMsg) {
            const msg = document.createElement('p');
            msg.className = 'no-genre-data';
            msg.style.textAlign = 'center';
            msg.style.color = '#999';
            msg.style.padding = '40px';
            msg.innerHTML = 'No genre data available. Add Discogs genres when adding records.';
            container.appendChild(msg);
        }
        return;
    }
    
    // Remove any "no data" message if it exists
    const container = canvas.parentElement;
    const existingMsg = container.querySelector('.no-genre-data');
    if (existingMsg) existingMsg.remove();
    
    canvas.style.display = 'block';
    
    charts.topGenres = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: filteredGenres,
            datasets: [{
                label: 'Units Sold',
                data: filteredSales,
                backgroundColor: 'rgba(255, 159, 64, 0.6)',
                borderColor: 'rgba(255, 159, 64, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Copies Sold'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Units Sold: ' + context.raw;
                        }
                    }
                }
            }
        }
    });
}

function renderSalesOverTimeChart(storeData, discogsData) {
    const canvas = document.getElementById('salesOverTimeChart');
    if (!canvas) return;
    
    if (charts.salesOverTime) {
        charts.salesOverTime.destroy();
    }
    
    // If no store data, show empty
    if (!storeData.dates || storeData.dates.length === 0) {
        canvas.style.display = 'none';
        return;
    }
    
    canvas.style.display = 'block';
    
    // COLLECT ALL DATES from both datasets
    const allDatesSet = new Set();
    
    // Add store dates
    storeData.dates.forEach(date => allDatesSet.add(date));
    
    // Add discogs dates (if available)
    if (discogsData && discogsData.status === 'success' && discogsData.dates) {
        discogsData.dates.forEach(date => allDatesSet.add(date));
    }
    
    // Sort dates chronologically
    const allDates = Array.from(allDatesSet).sort();
    
    console.log('📊 All dates for chart:', allDates);
    
    // Create maps for quick lookup
    const storeRevenueMap = new Map();
    for (let i = 0; i < storeData.dates.length; i++) {
        storeRevenueMap.set(storeData.dates[i], parseFloat(storeData.revenue[i]) || 0);
    }
    
    const discogsRevenueMap = new Map();
    if (discogsData && discogsData.status === 'success' && discogsData.dates) {
        for (let i = 0; i < discogsData.dates.length; i++) {
            discogsRevenueMap.set(discogsData.dates[i], parseFloat(discogsData.revenue[i]) || 0);
        }
    }
    
    // Build aligned arrays for all dates
    const alignedStoreRevenue = [];
    const alignedDiscogsRevenue = [];
    const alignedCombinedRevenue = [];
    
    for (const date of allDates) {
        const storeVal = storeRevenueMap.get(date) || 0;
        const discogsVal = discogsRevenueMap.get(date) || 0;
        alignedStoreRevenue.push(storeVal);
        alignedDiscogsRevenue.push(discogsVal);
        alignedCombinedRevenue.push(storeVal + discogsVal);
    }
    
    console.log('📊 Aligned data:', {
        dates: allDates,
        storeRevenue: alignedStoreRevenue,
        discogsRevenue: alignedDiscogsRevenue
    });
    
    // Create datasets
    const datasets = [
        {
            label: 'Store Sales ($)',
            data: alignedStoreRevenue,
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            fill: false,
            tension: 0.1,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: 'rgba(75, 192, 192, 1)'
        },
        {
            label: 'Discogs Sales ($)',
            data: alignedDiscogsRevenue,
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            fill: false,
            tension: 0.1,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: 'rgba(255, 99, 132, 1)'
        },
        {
            label: 'Combined Total ($)',
            data: alignedCombinedRevenue,
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.05)',
            fill: true,
            tension: 0.1,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 2
        }
    ];
    
    charts.salesOverTime = new Chart(canvas, {
        type: 'line',
        data: {
            labels: allDates,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Revenue ($)'
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Date'
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 15
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            let value = context.raw;
                            return label + ': $' + value.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

// NEW FUNCTION: Load artists into table
function loadArtistsTable(data) {
    const tbody = document.getElementById('artistsTableBody');
    if (!tbody) {
        console.error('artistsTableBody element not found');
        return;
    }
    
    try {
        if (data && data.artists && data.sales) {
            // Remove asterisks from artist names
            allArtistsData = data.artists.map((artist, idx) => ({
                artist: artist.replace(/\*/g, '').trim(),
                copies_sold: data.sales[idx]
            }));
        }
        
        if (allArtistsData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="padding: 20px; text-align: center;">No artist data available</td></tr>';
            return;
        }
        
        // Apply search filter
        let filteredArtists = allArtistsData;
        if (currentArtistSearch) {
            filteredArtists = allArtistsData.filter(a => 
                a.artist.toLowerCase().includes(currentArtistSearch.toLowerCase())
            );
        }
        
        // Sort by copies sold descending
        filteredArtists.sort((a, b) => b.copies_sold - a.copies_sold);
        
        // Paginate
        const start = (currentArtistPage - 1) * currentPerPage;
        const end = start + currentPerPage;
        const paginatedArtists = filteredArtists.slice(start, end);
        const totalPages = Math.ceil(filteredArtists.length / currentPerPage);
        
        // Update total artists count in summary card
        const totalArtistsElem = document.getElementById('totalArtistsCount');
        if (totalArtistsElem) {
            totalArtistsElem.textContent = filteredArtists.length;
        }
        
        // Render table
        if (paginatedArtists.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="padding: 20px; text-align: center;">No artists found</td></tr>';
        } else {
            tbody.innerHTML = paginatedArtists.map((artist, idx) => {
                const rank = start + idx + 1;
                return `
                    <tr>
                        <td style="padding: 6px 8px;">${rank}</td>
                        <td style="padding: 6px 8px;">${escapeHtml(artist.artist)}</td>
                        <td style="padding: 6px 8px; text-align: right; font-weight: 600;">${artist.copies_sold}</td>
                    </tr>
                `;
            }).join('');
        }
        
        // Update pagination controls
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        const pageInfo = document.getElementById('pageInfo');
        const perPageSelect = document.getElementById('artistsPerPage');
        
        if (prevBtn) prevBtn.disabled = currentArtistPage === 1;
        if (nextBtn) nextBtn.disabled = currentArtistPage === totalPages || totalPages === 0;
        if (pageInfo) pageInfo.textContent = `Page ${currentArtistPage} of ${totalPages || 1}`;
        if (perPageSelect) perPageSelect.value = currentPerPage;
        
    } catch (error) {
        console.error('Error loading artists table:', error);
        tbody.innerHTML = '<tr><td colspan="3" style="padding: 20px; text-align: center; color: red;">Error loading artists</td></tr>';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Setup event listeners for artist table
function setupArtistTableListeners() {
    const searchBtn = document.getElementById('searchArtistBtn');
    const clearBtn = document.getElementById('clearSearchBtn');
    const searchInput = document.getElementById('artistSearchInput');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const perPageSelect = document.getElementById('artistsPerPage');
    
    if (searchBtn) {
        searchBtn.onclick = () => {
            currentArtistSearch = searchInput.value.trim();
            currentArtistPage = 1;
            // Reload data with search filter
            fetchArtistsAndReload();
        };
    }
    
    if (clearBtn) {
        clearBtn.onclick = () => {
            if (searchInput) searchInput.value = '';
            currentArtistSearch = '';
            currentArtistPage = 1;
            fetchArtistsAndReload();
        };
    }
    
    if (searchInput) {
        searchInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                currentArtistSearch = searchInput.value.trim();
                currentArtistPage = 1;
                fetchArtistsAndReload();
            }
        };
    }
    
    if (prevBtn) {
        prevBtn.onclick = () => {
            if (currentArtistPage > 1) {
                currentArtistPage--;
                fetchArtistsAndReload();
            }
        };
    }
    
    if (nextBtn) {
        nextBtn.onclick = () => {
            currentArtistPage++;
            fetchArtistsAndReload();
        };
    }
    
    if (perPageSelect) {
        perPageSelect.onchange = () => {
            currentPerPage = parseInt(perPageSelect.value);
            currentArtistPage = 1;
            fetchArtistsAndReload();
        };
    }
}

async function fetchArtistsAndReload() {
    try {
        const response = await fetch(AppConfig.baseUrl + '/api/stats/top-artists', {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.status === 'success') {
            loadArtistsTable(data);
        }
    } catch (error) {
        console.error('Error fetching artists:', error);
    }
}

// Load stats when the stats tab is shown
document.addEventListener('DOMContentLoaded', function() {
    // Setup artist table listeners
    setupArtistTableListeners();
    
    var statsTab = document.querySelector('.tab[data-tab="stats"]');
    if (statsTab) {
        statsTab.addEventListener('click', function() {
            setTimeout(loadStatsData, 100);
        });
    }
    
    var activeTab = document.querySelector('.tab.active');
    if (activeTab && activeTab.getAttribute('data-tab') === 'stats') {
        setTimeout(loadStatsData, 200);
    }
    
    if (window.location.hash === '#stats') {
        setTimeout(loadStatsData, 200);
    }
});