// Stats page - Sales Analytics Dashboard
(function() {
    let currentTab = 'overview';
    let artists = [];
    let filteredArtists = [];
    let artistPage = 1;
    const artistPageSize = 50;
    let chartInstances = {};

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Tab switching
    document.addEventListener('click', function(e) {
        const tab = e.target.closest('.st-tab');
        if (tab) {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.st-tab').forEach(t => {
                t.style.background = '#e9ecef';
                t.style.color = '#333';
            });
            tab.style.background = '#007bff';
            tab.style.color = 'white';
            
            document.querySelectorAll('.st-tab-content').forEach(c => c.style.display = 'none');
            const content = document.getElementById('st-' + tabName);
            if (content) content.style.display = 'flex';
            
            currentTab = tabName;
            
            // Load data for tab
            if (tabName === 'overview') loadOverview();
            else if (tabName === 'artists') loadArtists();
            else if (tabName === 'genres') loadGenres();
            else if (tabName === 'purchases') loadPurchases();
        }
    });

    // Load overview
    async function loadOverview() {
        try {
            const [stats, salesData, lastSeenData, createdData, genresData] = await Promise.all([
                fetchStats(),
                fetchSalesOverTime(),
                fetchLastSeenDistribution(),
                fetchCreatedAtDistribution(),
                fetchTopGenres()
            ]);
            
            updateStatsCards(stats);
            renderSalesChart(salesData);
            renderLastSeenChart(lastSeenData);
            renderCreatedChart(createdData);
            renderGenresChart(genresData);
        } catch (err) {
            console.error('Error loading overview:', err);
        }
    }

    // Fetch stats
    async function fetchStats() {
        try {
            const response = await fetch(`${API_BASE}/api/stats/sales-over-time?limit=30`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.status === 'success') {
                const sales = data.sales || [];
                const total = sales.reduce((sum, s) => sum + s.total, 0);
                const totalOrders = sales.length;
                const avgOrder = totalOrders > 0 ? total / totalOrders : 0;
                
                // Get top artist
                const artistsRes = await fetch(`${API_BASE}/api/stats/top-artists?limit=1`, {
                    credentials: 'include',
                    headers: getHeaders()
                });
                const artistsData = await artistsRes.json();
                const topArtist = artistsData.status === 'success' && artistsData.artists && artistsData.artists.length > 0 
                    ? artistsData.artists[0].artist : '—';
                
                // Get total records
                const recordsRes = await fetch(`${API_BASE}/records/count`, {
                    credentials: 'include',
                    headers: getHeaders()
                });
                const recordsData = await recordsRes.json();
                const totalRecords = recordsData.count || 0;
                
                return { total, totalOrders, avgOrder, topArtist, totalRecords };
            }
            return { total: 0, totalOrders: 0, avgOrder: 0, topArtist: '—', totalRecords: 0 };
        } catch (err) {
            console.error('Error fetching stats:', err);
            return { total: 0, totalOrders: 0, avgOrder: 0, topArtist: '—', totalRecords: 0 };
        }
    }

    function updateStatsCards(stats) {
        document.getElementById('st-total-sales').textContent = `$${stats.total.toFixed(2)}`;
        document.getElementById('st-total-orders').textContent = stats.totalOrders;
        document.getElementById('st-avg-order').textContent = `$${stats.avgOrder.toFixed(2)}`;
        document.getElementById('st-top-artist').textContent = stats.topArtist;
        document.getElementById('st-total-records').textContent = stats.totalRecords;
    }

    // Fetch sales over time
    async function fetchSalesOverTime() {
        try {
            const response = await fetch(`${API_BASE}/api/stats/sales-over-time?limit=30`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.status === 'success') {
                return data.sales || [];
            }
            return [];
        } catch (err) {
            console.error('Error fetching sales:', err);
            return [];
        }
    }

    function renderSalesChart(data) {
        const canvas = document.getElementById('st-sales-chart');
        if (!canvas) return;
        
        if (chartInstances.sales) {
            chartInstances.sales.destroy();
            delete chartInstances.sales;
        }
        
        if (!data || data.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#999';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No data', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        const labels = data.map(d => d.date);
        const values = data.map(d => d.total);
        
        const ctx = canvas.getContext('2d');
        chartInstances.sales = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sales',
                    data: values,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return '$' + ctx.raw.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value;
                            }
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            font: { size: 8 }
                        }
                    }
                }
            }
        });
    }

    // Fetch last seen distribution
    async function fetchLastSeenDistribution() {
        try {
            const response = await fetch(`${API_BASE}/api/stats/last-seen-distribution`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.status === 'success') {
                return data.distribution || {};
            }
            return {};
        } catch (err) {
            console.error('Error fetching last seen:', err);
            return {};
        }
    }

    function renderLastSeenChart(data) {
        const canvas = document.getElementById('st-lastseen-chart');
        if (!canvas) return;
        
        if (chartInstances.lastseen) {
            chartInstances.lastseen.destroy();
            delete chartInstances.lastseen;
        }
        
        const keys = Object.keys(data);
        if (keys.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#999';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No data', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        const labels = keys.map(k => {
            if (k === '0-30') return '0-30d';
            if (k === '30-60') return '30-60d';
            if (k === '60-90') return '60-90d';
            if (k === '90+') return '90+d';
            return k;
        });
        const values = keys.map(k => data[k]);
        
        const ctx = canvas.getContext('2d');
        chartInstances.lastseen = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Records',
                    data: values,
                    backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    },
                    x: {
                        ticks: { font: { size: 8 } }
                    }
                }
            }
        });
    }

    // Fetch created at distribution
    async function fetchCreatedAtDistribution() {
        try {
            const response = await fetch(`${API_BASE}/api/stats/created-at-distribution`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.status === 'success') {
                return data.distribution || {};
            }
            return {};
        } catch (err) {
            console.error('Error fetching created at:', err);
            return {};
        }
    }

    function renderCreatedChart(data) {
        const canvas = document.getElementById('st-created-chart');
        if (!canvas) return;
        
        if (chartInstances.created) {
            chartInstances.created.destroy();
            delete chartInstances.created;
        }
        
        const keys = Object.keys(data);
        if (keys.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#999';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No data', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        // Take last 12 months
        const sorted = keys.sort();
        const labels = sorted.slice(-12);
        const values = labels.map(k => data[k]);
        
        const ctx = canvas.getContext('2d');
        chartInstances.created = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Records',
                    data: values,
                    backgroundColor: '#17a2b8',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            font: { size: 8 }
                        }
                    }
                }
            }
        });
    }

    // Fetch top genres
    async function fetchTopGenres() {
        try {
            const response = await fetch(`${API_BASE}/api/stats/top-genres?limit=10`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.status === 'success') {
                return data.genres || [];
            }
            return [];
        } catch (err) {
            console.error('Error fetching genres:', err);
            return [];
        }
    }

    function renderGenresChart(data) {
        const canvas = document.getElementById('st-genres-chart');
        if (!canvas) return;
        
        if (chartInstances.genres) {
            chartInstances.genres.destroy();
            delete chartInstances.genres;
        }
        
        if (!data || data.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#999';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No data', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        const labels = data.map(g => g.genre || 'Unknown');
        const values = data.map(g => g.sales || 0);
        
        const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6baa', '#a66bff', '#ff9f43', '#00d2d3', '#ffc312', '#12cbc4'];
        
        const ctx = canvas.getContext('2d');
        chartInstances.genres = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { font: { size: 8 }, boxWidth: 10 }
                    }
                }
            }
        });
    }

    // Load artists
    async function loadArtists() {
        const list = document.getElementById('st-artists-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch(`${API_BASE}/api/stats/top-artists?limit=100`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                artists = data.artists || [];
                filteredArtists = [...artists];
                renderArtists();
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading artists:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    function renderArtists() {
        const list = document.getElementById('st-artists-list');
        if (!list) return;
        
        const start = (artistPage - 1) * artistPageSize;
        const end = Math.min(start + artistPageSize, filteredArtists.length);
        const pageData = filteredArtists.slice(start, end);
        
        if (!pageData || pageData.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No artists found</div>';
            return;
        }

        let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 6px 8px; text-align: left; color: #333;">#</th>
                    <th style="padding: 6px 8px; text-align: left; color: #333;">Artist</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Sold</th>
                    <th style="padding: 6px 8px; text-align: right; color: #333;">Revenue</th>
                </tr>
            </thead>
            <tbody>`;
        
        pageData.forEach((item, idx) => {
            html += `<tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${start + idx + 1}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${item.artist || 'Unknown'}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${item.count || 0}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #28a745;">$${(item.revenue || 0).toFixed(2)}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        
        // Add pagination
        const totalPages = Math.ceil(filteredArtists.length / artistPageSize) || 1;
        html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; margin-top: 5px; border-top: 1px solid #eee;">
            <span style="font-size: 12px; color: #666;">Showing ${start + 1}-${Math.min(end, filteredArtists.length)} of ${filteredArtists.length}</span>
            <div style="display: flex; gap: 5px;">
                <button onclick="stArtistPage(-1)" ${artistPage <= 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} style="padding: 3px 10px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">Prev</button>
                <span style="font-size: 12px; padding: 0 5px;">Page ${artistPage} of ${totalPages}</span>
                <button onclick="stArtistPage(1)" ${artistPage >= totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} style="padding: 3px 10px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">Next</button>
            </div>
        </div>`;
        
        list.innerHTML = html;
    }

    window.stArtistPage = function(delta) {
        const totalPages = Math.ceil(filteredArtists.length / artistPageSize) || 1;
        const newPage = artistPage + delta;
        if (newPage < 1 || newPage > totalPages) return;
        artistPage = newPage;
        renderArtists();
    };

    window.stSearchArtists = function() {
        const search = document.getElementById('st-artist-search').value.toLowerCase().trim();
        if (search) {
            filteredArtists = artists.filter(a => 
                a.artist && a.artist.toLowerCase().includes(search)
            );
        } else {
            filteredArtists = [...artists];
        }
        artistPage = 1;
        renderArtists();
    };

    window.stClearArtistSearch = function() {
        document.getElementById('st-artist-search').value = '';
        filteredArtists = [...artists];
        artistPage = 1;
        renderArtists();
    };

    // Load genres tab
    async function loadGenres() {
        const list = document.getElementById('st-genres-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch(`${API_BASE}/api/stats/top-genres?limit=50`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                const genres = data.genres || [];
                let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                            <th style="padding: 6px 8px; text-align: left; color: #333;">#</th>
                            <th style="padding: 6px 8px; text-align: left; color: #333;">Genre</th>
                            <th style="padding: 6px 8px; text-align: right; color: #333;">Sold</th>
                            <th style="padding: 6px 8px; text-align: right; color: #333;">Revenue</th>
                        </tr>
                    </thead>
                    <tbody>`;
                
                genres.forEach((item, idx) => {
                    html += `<tr>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${idx + 1}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${item.genre || 'Unknown'}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #333;">${item.count || 0}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #28a745;">$${(item.revenue || 0).toFixed(2)}</td>
                    </tr>`;
                });
                
                html += '</tbody></table>';
                list.innerHTML = html;
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading genres:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Load purchases
    async function loadPurchases() {
        const list = document.getElementById('st-purchases-list');
        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading...</div>';
        
        try {
            const response = await fetch(`${API_BASE}/api/inventory-purchases`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                const purchases = data.purchases || [];
                const total = purchases.reduce((sum, p) => sum + (p.amount_spent || 0), 0);
                const avg = purchases.length > 0 ? total / purchases.length : 0;
                
                document.getElementById('st-purchases-total').textContent = `$${total.toFixed(2)}`;
                document.getElementById('st-purchases-avg').textContent = `$${avg.toFixed(2)}`;
                document.getElementById('st-purchases-count').textContent = purchases.length;
                
                let html = `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                            <th style="padding: 6px 8px; text-align: left; color: #333;">ID</th>
                            <th style="padding: 6px 8px; text-align: left; color: #333;">Seller</th>
                            <th style="padding: 6px 8px; text-align: right; color: #333;">Amount</th>
                            <th style="padding: 6px 8px; text-align: center; color: #333;">Records</th>
                            <th style="padding: 6px 8px; text-align: left; color: #333;">Date</th>
                        </tr>
                    </thead>
                    <tbody>`;
                
                purchases.forEach(p => {
                    html += `<tr>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${p.id}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #333;">${p.seller_name || 'Unknown'}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #28a745;">${p.amount_spent ? '$' + p.amount_spent.toFixed(2) : '—'}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: center; color: #333;">${p.record_count || 0}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                    </tr>`;
                });
                
                html += '</tbody></table>';
                list.innerHTML = html;
            } else {
                list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${data.error || 'Failed to load'}</div>`;
            }
        } catch (err) {
            console.error('Error loading purchases:', err);
            list.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${err.message}</div>`;
        }
    }

    // Init
    window.initStats = function() {
        console.log('Stats initialized');
        loadOverview();
    };

    // Load overview on init
    document.addEventListener('DOMContentLoaded', function() {
        // Tab click handler is already set up with event delegation
    });
})();
