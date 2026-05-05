// Stats Dashboard JavaScript - Only Active Charts

let charts = {};

async function loadStatsData() {
    console.log('📊 loadStatsData() called');
    const errorDiv = document.getElementById('stats-error');
    if (errorDiv) errorDiv.style.display = 'none';
    
    try {
        if (typeof AppConfig === 'undefined') {
            throw new Error('AppConfig not loaded');
        }
        
        // Fetch only the 3 working stats
        const [topArtistsRes, salesOverTimeRes, topGenresRes] = await Promise.all([
            fetch(AppConfig.baseUrl + '/api/stats/top-artists', {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
            }),
            fetch(AppConfig.baseUrl + '/api/stats/sales-over-time', {
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
        
        if (topArtists.status !== 'success') {
            throw new Error('Top artists: ' + (topArtists.error || 'Unknown error'));
        }
        if (salesOverTime.status !== 'success') {
            throw new Error('Sales over time: ' + (salesOverTime.error || 'Unknown error'));
        }
        if (topGenres.status !== 'success') {
            throw new Error('Top genres: ' + (topGenres.error || 'Unknown error'));
        }
        
        // Render only the 3 active charts
        renderTopArtistsChart(topArtists);
        renderSalesOverTimeChart(salesOverTime);
        renderTopGenresChart(topGenres);
        
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
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Units Sold',
                    data: data.units,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
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
                            return '$' + value.toFixed(0);
                        }
                    }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Units Sold'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
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
    
    charts.topGenres = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: data.genres,
            datasets: [{
                label: 'Units Sold',
                data: data.sales,
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