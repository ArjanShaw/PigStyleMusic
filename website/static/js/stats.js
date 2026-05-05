// Stats Dashboard JavaScript

let charts = {};

async function loadStatsData() {
    console.log('📊 loadStatsData() called');
    const errorDiv = document.getElementById('stats-error');
    if (errorDiv) errorDiv.style.display = 'none';
    
    try {
        if (typeof AppConfig === 'undefined') {
            throw new Error('AppConfig not loaded');
        }
        
        // Fetch all stats
        const [topArtistsRes, salesOverTimeRes, topGenresRes] = await Promise.all([
            fetch(AppConfig.baseUrl + '/api/stats/top-artists', {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
            }),
            fetch(AppConfig.baseUrl + '/api/stats/sales-over-time-daily', {
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
        const topGenres = await topGenresRes.json();
        
        console.log('📊 Top Artists:', topArtists);
        console.log('📊 Sales Over Time:', salesOverTime);
        console.log('📊 Top Genres:', topGenres);
        
        if (topArtists.status !== 'success') {
            throw new Error('Top artists: ' + (topArtists.error || 'Unknown error'));
        }
        if (salesOverTime.status !== 'success') {
            throw new Error('Sales over time: ' + (salesOverTime.error || 'Unknown error'));
        }
        
        // Render charts
        renderTopArtistsChart(topArtists);
        renderSalesOverTimeChart(salesOverTime);
        
        // Handle genre chart - filter out Unknown
        if (topGenres.status === 'success' && topGenres.genres && topGenres.genres.length > 0) {
            renderTopGenresChart(topGenres);
        } else {
            console.log('No genre data to display');
            const genreCanvas = document.getElementById('topGenresChart');
            if (genreCanvas && genreCanvas.parentElement) {
                const container = genreCanvas.parentElement;
                if (container && !container.querySelector('.no-genre-data')) {
                    const msg = document.createElement('p');
                    msg.className = 'no-genre-data';
                    msg.style.textAlign = 'center';
                    msg.style.color = '#999';
                    msg.style.padding = '40px';
                    msg.innerHTML = 'No genre data available. Genres are pulled from Discogs when adding records.';
                    container.appendChild(msg);
                }
            }
        }
        
        console.log('✅ Charts rendered successfully');
        
    } catch (error) {
        console.error('❌ Error loading stats data:', error);
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error: ' + error.message;
        }
    }
}

function renderTopArtistsChart(data) {
    const canvas = document.getElementById('topArtistsChart');
    if (!canvas) return;
    
    if (charts.topArtists) {
        charts.topArtists.destroy();
    }
    
    if (!data.artists || data.artists.length === 0) {
        canvas.style.display = 'none';
        return;
    }
    
    charts.topArtists = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: data.artists,
            datasets: [{
                label: 'Copies Sold',
                data: data.sales,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Copies Sold'
                    }
                },
                x: {
                    ticks: {
                        autoSkip: true,
                        maxRotation: 45,
                        minRotation: 45
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
                            return 'Copies Sold: ' + context.raw;
                        }
                    }
                }
            }
        }
    });
}

function renderSalesOverTimeChart(data) {
    const canvas = document.getElementById('salesOverTimeChart');
    if (!canvas) return;
    
    if (charts.salesOverTime) {
        charts.salesOverTime.destroy();
    }
    
    if (!data.dates || data.dates.length === 0) {
        canvas.style.display = 'none';
        return;
    }
    
    charts.salesOverTime = new Chart(canvas, {
        type: 'line',
        data: {
            labels: data.dates,
            datasets: [
                {
                    label: 'Sales Revenue ($)',
                    data: data.revenue,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    fill: true,
                    tension: 0,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: 'rgba(75, 192, 192, 1)'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
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
                            return 'Revenue: $' + context.raw.toFixed(2);
                        }
                    }
                }
            }
        }
    });
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

// Load stats when the stats tab is shown
document.addEventListener('DOMContentLoaded', function() {
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