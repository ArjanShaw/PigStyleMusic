// ============================================================================
// discogs.js - Location-based bulk posting to Discogs with Markup Rules
// ============================================================================

let currentLocationRecords = [];
let discogsFilteredRecords = [];
let currentLocation = null;
let currentLocationPrefix = null;
let isLoading = false;
let cancelResolve = false;

// Last Seen Filter
let lastSeenCutoffDate = null;

// DOM Elements
let tableBody = null;
let discogsLocationSelect = null;
let discogsPostButton = null;
let discogsStatusMessage = null;
let discogsSearchInput = null;
let discogsSearchButton = null;
let lastSeenCutoffDateInput = null;
let applyLastSeenFilterBtn = null;

// Modal elements
let progressModal = null;
let modalTitle = null;
let modalProgressBar = null;
let modalProgressText = null;
let modalLog = null;
let modalCancelBtn = null;

// Chart variables
let markupCurveChart = null;
let markupDistributionChart = null;
let ageDistributionChart = null;
let markupChartsLoaded = false;

// ============================================================================
// Helper: Check if record has a consignor
// ============================================================================

function hasConsignor(record) {
    return (record.consignor_id && record.consignor_id !== 1 && record.consignor_id !== null);
}

// ============================================================================
// Helper: Get last seen cutoff date
// ============================================================================

function getLastSeenCutoffDate() {
    if (lastSeenCutoffDateInput && lastSeenCutoffDateInput.value) {
        return lastSeenCutoffDateInput.value;
    }
    // Default: 30 days ago
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
}

// ============================================================================
// Helper: Check if record meets last_seen filter
// ============================================================================

function meetsLastSeenFilter(record) {
    const cutoffDate = getLastSeenCutoffDate();
    if (!cutoffDate) return true;
    if (!record.last_seen) return false;
    try {
        const lastSeenDate = record.last_seen.split('T')[0];
        return lastSeenDate >= cutoffDate;
    } catch (e) {
        console.warn('Error parsing last_seen date:', record.last_seen, e);
        return false;
    }
}

// ============================================================================
// Helper: Format last_seen date for display
// ============================================================================

function formatLastSeen(lastSeen) {
    if (!lastSeen) return '<span style="color: #dc3545;">Never</span>';
    try {
        const lastSeenDate = new Date(lastSeen);
        const today = new Date();
        const daysSince = Math.floor((today - lastSeenDate) / (1000 * 60 * 60 * 24));
        const cutoffDate = getLastSeenCutoffDate();
        if (cutoffDate) {
            const cutoffDateObj = new Date(cutoffDate);
            if (lastSeenDate < cutoffDateObj) {
                return `<span style="color: #dc3545;" title="Before cutoff date">${daysSince} days ago (⚠️)</span>`;
            }
        }
        if (daysSince === 0) return '<span style="color: #28a745;">Today</span>';
        if (daysSince === 1) return '<span style="color: #28a745;">Yesterday</span>';
        if (daysSince <= 7) return `<span style="color: #ffc107;">${daysSince} days ago</span>`;
        if (daysSince <= 30) return `<span style="color: #fd7e14;">${daysSince} days ago</span>`;
        return `<span style="color: #dc3545;">${daysSince} days ago</span>`;
    } catch (e) {
        return lastSeen;
    }
}

// ============================================================================
// Create Progress Modal
// ============================================================================

function createProgressModal() {
    if (document.getElementById('discogs-progress-modal')) return;
    const modalHtml = `
        <div id="discogs-progress-modal" class="modal-overlay" style="display: none; z-index: 10001;">
            <div class="modal-content" style="max-width: 600px; width: 90%; background: white; border-radius: 8px;">
                <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 20px; border-radius: 8px 8px 0 0;">
                    <h3 id="modal-title" style="margin: 0; color: white;">Processing</h3>
                    <button class="modal-close" onclick="closeProgressModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; float: right;">&times;</button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span>Progress:</span>
                            <span id="modal-progress-percent">0%</span>
                        </div>
                        <div style="width: 100%; height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden;">
                            <div id="modal-progress-bar" style="width: 0%; height: 100%; background: #007bff; transition: width 0.3s;"></div>
                        </div>
                    </div>
                    <div id="modal-log" style="height: 300px; overflow-y: auto; background: #1e1e1e; border-radius: 4px; padding: 10px; font-family: monospace; font-size: 12px; color: #d4d4d4;"></div>
                </div>
                <div class="modal-footer" style="padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #ddd; border-radius: 0 0 8px 8px; display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="modal-cancel-btn" class="btn btn-danger">Cancel</button>
                    <button id="modal-close-btn" class="btn btn-secondary" onclick="closeProgressModal()">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    progressModal = document.getElementById('discogs-progress-modal');
    modalTitle = document.getElementById('modal-title');
    modalProgressBar = document.getElementById('modal-progress-bar');
    modalProgressText = document.getElementById('modal-progress-percent');
    modalLog = document.getElementById('modal-log');
    modalCancelBtn = document.getElementById('modal-cancel-btn');
}

function openProgressModal(title) {
    createProgressModal();
    if (!progressModal) return;
    modalTitle.textContent = title;
    modalProgressBar.style.width = '0%';
    if (modalProgressText) modalProgressText.textContent = '0%';
    if (modalLog) modalLog.innerHTML = '';
    progressModal.style.display = 'flex';
    cancelResolve = false;
    if (modalCancelBtn) {
        modalCancelBtn.onclick = () => {
            cancelResolve = true;
            appendToModalLog('⚠️ Cancelling... Please wait for current item to complete.', 'warning');
            modalCancelBtn.disabled = true;
            modalCancelBtn.textContent = 'Cancelling...';
        };
        modalCancelBtn.disabled = false;
        modalCancelBtn.textContent = 'Cancel';
    }
}

function closeProgressModal() {
    if (progressModal) progressModal.style.display = 'none';
    cancelResolve = false;
    if (modalCancelBtn) {
        modalCancelBtn.disabled = false;
        modalCancelBtn.textContent = 'Cancel';
    }
}

function updateModalProgress(current, total) {
    if (!modalProgressBar) return;
    const percent = Math.round((current / total) * 100);
    modalProgressBar.style.width = percent + '%';
    if (modalProgressText) modalProgressText.textContent = percent + '%';
}

function appendToModalLog(message, type) {
    if (!modalLog) return;
    type = type || 'info';
    const colors = {
        success: '#4ec9b0',
        error: '#f48771',
        warning: '#ce9178',
        info: '#9cdcfe'
    };
    const logEntry = document.createElement('div');
    logEntry.style.marginBottom = '4px';
    logEntry.style.padding = '2px 0';
    logEntry.style.color = colors[type] || colors.info;
    logEntry.style.fontFamily = 'monospace';
    logEntry.style.fontSize = '12px';
    logEntry.innerHTML = message;
    modalLog.appendChild(logEntry);
    modalLog.scrollTop = modalLog.scrollHeight;
}

// ============================================================================
// Toggle Markup Rules Collapsible Section
// ============================================================================

window.toggleMarkupRules = function() {
    const content = document.getElementById('markup-rules-content');
    const icon = document.getElementById('markup-rules-toggle-icon');
    if (!content || !icon) {
        console.error('Markup rules elements not found');
        return;
    }
    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
        loadMarkupRules();
    } else {
        content.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
};

// ============================================================================
// Toggle Markup Charts Collapsible Section
// ============================================================================

window.toggleMarkupCharts = function() {
    const content = document.getElementById('markup-charts-content');
    const icon = document.getElementById('markup-charts-toggle-icon');
    if (!content || !icon) {
        console.error('Markup charts elements not found');
        return;
    }
    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
        setTimeout(loadMarkupAnalysisCharts, 300);
    } else {
        content.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
};

// ============================================================================
// Batch Markup Calculation (Replaces per-record calls)
// ============================================================================

async function calculateMarkupBatch(records) {
    if (!records || records.length === 0) {
        return [];
    }

    try {
        const response = await fetch(window.AppConfig.baseUrl + '/api/discogs/calculate-markup-batch', {
            method: 'POST',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ records: records })
        });

        const result = await response.json();

        if (result.status === 'success') {
            return result.results; // Array of {id, discogs_price, markup_percent, days_old}
        } else {
            console.error('Batch markup error:', result.error);
            return [];
        }
    } catch (error) {
        console.error('Error in batch markup:', error);
        return [];
    }
}

// ============================================================================
// Markup Analysis Charts
// ============================================================================

async function loadMarkupAnalysisCharts() {
    try {
        // --- Get current cutoff date ---
        const cutoffInput = document.getElementById('last-seen-cutoff-date');
        let cutoff = '';
        if (cutoffInput && cutoffInput.value) {
            cutoff = cutoffInput.value;
        } else {
            // fallback to default (30 days ago)
            const date = new Date();
            date.setDate(date.getDate() - 30);
            cutoff = date.toISOString().split('T')[0];
        }

        const url = window.AppConfig.baseUrl + '/api/markup-analysis?cutoff=' + cutoff;
        const response = await fetch(url, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        if (!response.ok) throw new Error('Failed to load markup analysis data');
        const data = await response.json();
        if (data.status === 'success') {
            renderMarkupCurveChart(data);
            renderMarkupDistributionChart(data);
            renderAgeDistributionChart(data);
            const countEl = document.getElementById('chart-record-count');
            if (countEl) {
                countEl.textContent = `📊 ${data.active_records_count || 0} active records analyzed (cutoff: ${data.cutoff_date || 'N/A'}) | ${data.rules_count || 0} markup rules applied`;
            }
            markupChartsLoaded = true;
        } else {
            console.error('Error loading markup analysis:', data.error);
            showDiscogsStatus('Error loading markup charts: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error loading markup analysis:', error);
        showDiscogsStatus('Error loading markup charts: ' + error.message, 'error');
    }
}

async function refreshMarkupCharts() {
    try {
        const cutoffInput = document.getElementById('last-seen-cutoff-date');
        let cutoff = '';
        if (cutoffInput && cutoffInput.value) {
            cutoff = cutoffInput.value;
        } else {
            const date = new Date();
            date.setDate(date.getDate() - 30);
            cutoff = date.toISOString().split('T')[0];
        }

        const url = window.AppConfig.baseUrl + '/api/markup-analysis?cutoff=' + cutoff;
        const response = await fetch(url, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        if (!response.ok) throw new Error('Failed to refresh markup analysis data');
        const data = await response.json();
        if (data.status === 'success') {
            renderMarkupCurveChart(data);
            renderMarkupDistributionChart(data);
            renderAgeDistributionChart(data);
            const countEl = document.getElementById('chart-record-count');
            if (countEl) {
                countEl.textContent = `📊 ${data.active_records_count || 0} active records analyzed (cutoff: ${data.cutoff_date || 'N/A'}) | ${data.rules_count || 0} markup rules applied`;
            }
        }
    } catch (error) {
        console.error('Error refreshing markup charts:', error);
    }
}

function renderMarkupCurveChart(data) {
    const canvas = document.getElementById('markup-curve-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (markupCurveChart) {
        markupCurveChart.destroy();
        markupCurveChart = null;
    }
    const points = data.curve_points || [];
    const days = points.map(p => p.days);
    const markups = points.map(p => p.markup_percent);
    if (days.length === 0) {
        markupCurveChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['No Data'],
                datasets: [{
                    label: 'Markup %',
                    data: [0],
                    borderColor: '#ccc',
                    backgroundColor: 'rgba(200,200,200,0.1)',
                    borderWidth: 2,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    x: { title: { display: true, text: 'No markup rules configured' } },
                    y: { title: { display: true, text: 'Markup %' } }
                }
            }
        });
        return;
    }
    const minMarkup = Math.min(...markups);
    const maxMarkup = Math.max(...markups);
    const yPadding = Math.max(5, Math.abs(maxMarkup - minMarkup) * 0.1);
    const xMax = data.chart_max_days || Math.max(...days);
    let xStepSize = 30;
    if (xMax > 730) xStepSize = 90;
    else if (xMax > 365) xStepSize = 60;
    const day365Point = points.find(p => p.days === 365);
    markupCurveChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: days,
            datasets: [{
                label: 'Markup %',
                data: markups,
                borderColor: '#007bff',
                backgroundColor: 'rgba(0,123,255,0.1)',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 5,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Markup: ${context.parsed.y}% at ${context.parsed.x} days`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    min: 0,
                    max: xMax,
                    title: { display: true, text: 'Days Since Created' },
                    ticks: {
                        stepSize: xStepSize,
                        callback: function(value) {
                            if (value === 0) return '0';
                            if (value === 365) return '365d';
                            return value + 'd';
                        }
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                y: {
                    min: minMarkup - yPadding,
                    max: maxMarkup + yPadding,
                    title: { display: true, text: 'Markup %' },
                    ticks: { callback: function(value) { return value + '%'; }, stepSize: 5 },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            }
        }
    });
    if (day365Point && markupCurveChart) {
        const originalAfterDraw = markupCurveChart.afterDraw || function() {};
        markupCurveChart.afterDraw = function(chart) {
            if (typeof originalAfterDraw === 'function') originalAfterDraw(chart);
            const ctx = chart.ctx;
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;
            if (365 > xScale.max) return;
            const xPos = xScale.getPixelForValue(365);
            const yPos = yScale.getPixelForValue(day365Point.markup_percent);
            if (xPos >= 0 && xPos <= chart.width && yPos >= 0 && yPos <= chart.height) {
                ctx.save();
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = 'rgba(255,0,0,0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(xPos, yScale.top);
                ctx.lineTo(xPos, yScale.bottom);
                ctx.stroke();
                ctx.restore();
                ctx.save();
                ctx.fillStyle = 'rgba(255,0,0,0.7)';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('365d', xPos, yScale.top - 5);
                ctx.restore();
                ctx.save();
                ctx.beginPath();
                ctx.arc(xPos, yPos, 6, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(255,0,0,0.8)';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
                ctx.save();
                ctx.fillStyle = 'rgba(255,0,0,0.9)';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'left';
                ctx.fillText(`${day365Point.markup_percent}%`, xPos + 8, yPos - 4);
                ctx.restore();
            }
        };
        setTimeout(function() {
            if (markupCurveChart) markupCurveChart.draw();
        }, 100);
    }
}

function renderMarkupDistributionChart(data) {
    const canvas = document.getElementById('markup-distribution-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (markupDistributionChart) {
        markupDistributionChart.destroy();
        markupDistributionChart = null;
    }
    const distribution = data.distribution || {};
    if (Object.keys(distribution).length === 0) {
        markupDistributionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['No Data'],
                datasets: [{
                    label: 'Records',
                    data: [0],
                    backgroundColor: ['#ccc'],
                    borderColor: ['#999'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    x: { title: { display: true, text: 'No active records found' } },
                    y: { title: { display: true, text: 'Number of Records' } }
                }
            }
        });
        return;
    }
    const sortedKeys = Object.keys(distribution).sort((a, b) => parseFloat(a) - parseFloat(b));
    const labels = sortedKeys;
    const counts = sortedKeys.map(key => distribution[key]);
    const totalRecords = data.active_records_count || 0;
    const colors = labels.map(label => {
        const value = parseFloat(label);
        if (value > 0) return 'rgba(40,167,69,0.8)';
        if (value < 0) return 'rgba(220,53,69,0.8)';
        return 'rgba(255,193,7,0.8)';
    });
    markupDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Records',
                data: counts,
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('0.8', '1')),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const count = context.parsed.y;
                            const pct = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0;
                            return `${count} records (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Markup %' },
                    ticks: { maxRotation: 45, minRotation: 45 }
                },
                y: {
                    title: { display: true, text: 'Number of Records' },
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

function renderAgeDistributionChart(data) {
    const canvas = document.getElementById('age-distribution-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ageDistributionChart) {
        ageDistributionChart.destroy();
        ageDistributionChart = null;
    }
    const ageData = data.age_distribution || {};
    if (Object.keys(ageData).length === 0) {
        ageDistributionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['No Data'],
                datasets: [{
                    label: 'Records',
                    data: [0],
                    backgroundColor: ['#ccc'],
                    borderColor: ['#999'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    x: { title: { display: true, text: 'No age data available' } },
                    y: { title: { display: true, text: 'Number of Records' } }
                }
            }
        });
        return;
    }
    const sortedKeys = Object.keys(ageData).sort((a, b) => parseInt(a) - parseInt(b));
    const labels = sortedKeys.map(key => {
        const parts = key.split('-');
        if (parts.length === 2) return `${parts[0]}-${parts[1]}d`;
        return key + 'd';
    });
    const counts = sortedKeys.map(key => ageData[key]);
    const totalRecords = data.active_records_count || 0;
    const colors = sortedKeys.map((_, index) => `rgba(23,162,184,${0.6 + (index / sortedKeys.length) * 0.3})`);
    ageDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Records',
                data: counts,
                backgroundColor: colors,
                borderColor: 'rgba(23,162,184,1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const count = context.parsed.y;
                            const pct = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0;
                            return `${count} records (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Age Cohort (days)' },
                    ticks: { maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 10 }
                },
                y: {
                    title: { display: true, text: 'Number of Records' },
                    beginAtZero: true,
                    ticks: { stepSize: 1, precision: 0 }
                }
            }
        }
    });
    const statsEl = document.getElementById('age-chart-stats');
    if (statsEl && data.age_stats) {
        statsEl.textContent = `| Avg: ${data.age_stats.avg_days}d | Min: ${data.age_stats.min_days} | Max: ${data.age_stats.max_days}`;
    }
}

// ============================================================================
// Last Seen Filter Handlers
// ============================================================================

function applyLastSeenFilter() {
    if (lastSeenCutoffDateInput) {
        lastSeenCutoffDate = lastSeenCutoffDateInput.value;
    }
    console.log(`📅 Last seen cutoff date set to: ${lastSeenCutoffDate || 'none'}`);
    if (currentLocationRecords.length > 0) {
        applyDiscogsSearchFilter();
    }
    showDiscogsStatus(`Last seen filter set to: ${lastSeenCutoffDate || 'disabled'}`, 'info');
}

// ============================================================================
// Load unique locations from records (stripped of counters)
// ============================================================================

async function loadLocations() {
    console.log('📍 Loading locations from API...');
    try {
        const url = window.AppConfig.baseUrl + '/api/locations';
        const response = await fetch(url, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data.status === 'success') {
            renderLocationSelect(data.locations);
            console.log('✅ Loaded ' + data.locations.length + ' bins/locations');
        } else {
            throw new Error(data.error || 'Failed to load locations');
        }
    } catch (error) {
        console.error('Error loading locations:', error);
        renderLocationSelect([]);
        showDiscogsStatus('Warning: Could not load locations - ' + error.message, 'warning');
    }
}

function renderLocationSelect(locations) {
    if (!discogsLocationSelect) {
        console.error('locationSelect element not found!');
        return;
    }
    discogsLocationSelect.innerHTML = '<option value="">-- Select a bin/location --</option>';
    if (!locations || locations.length === 0) {
        discogsLocationSelect.innerHTML = '<option value="">-- No locations found --</option>';
        return;
    }
    locations.forEach(function(location) {
        const option = document.createElement('option');
        option.value = location;
        option.textContent = location;
        discogsLocationSelect.appendChild(option);
    });
}

// ============================================================================
// Load records by location (entire bin - all counters)
// ============================================================================

async function loadLocationRecords() {
    const selectedLocation = discogsLocationSelect ? discogsLocationSelect.value : null;
    if (!selectedLocation) {
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;">Select a bin/location to view records</td></tr>';
        }
        if (discogsPostButton) {
            discogsPostButton.disabled = true;
            discogsPostButton.style.opacity = '0.5';
            discogsPostButton.innerHTML = '<i class="fab fa-discogs"></i> Post to Discogs';
        }
        return;
    }
    currentLocation = selectedLocation;
    isLoading = true;
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-pulse"></i> Loading records...</td></tr>';
    }
    try {
        const url = window.AppConfig.baseUrl + '/api/records/by-location?location=' + encodeURIComponent(selectedLocation);
        const response = await fetch(url, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data.status === 'success') {
            currentLocationRecords = data.records || [];
            console.log('✅ Loaded ' + currentLocationRecords.length + ' records from bin "' + selectedLocation + '"');
            if (currentLocationRecords.length > 0) {
                console.log('Sample record location:', currentLocationRecords[0].location);
            }
            applyDiscogsSearchFilter();
            if (discogsPostButton) {
                discogsPostButton.disabled = false;
                discogsPostButton.style.opacity = '1';
                const eligibleCount = discogsFilteredRecords.filter(function(r) {
                    return r.status_id === 2 && !hasConsignor(r) && meetsLastSeenFilter(r);
                }).length;
                discogsPostButton.innerHTML = '<i class="fab fa-discogs"></i> Post Entire "' + selectedLocation + '" (' + eligibleCount + ' of ' + discogsFilteredRecords.length + ' records)';
            }
        } else {
            throw new Error(data.error || 'Failed to load records');
        }
    } catch (error) {
        console.error('Error loading location records:', error);
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px; color: #dc3545;">Error: ' + error.message + '</td></tr>';
        }
        if (discogsPostButton) {
            discogsPostButton.disabled = true;
            discogsPostButton.style.opacity = '0.5';
            discogsPostButton.innerHTML = '<i class="fab fa-discogs"></i> Post to Discogs';
        }
    } finally {
        isLoading = false;
    }
}

// ============================================================================
// Apply search filter to current location records
// ============================================================================

function applyDiscogsSearchFilter() {
    const searchTerm = (discogsSearchInput && discogsSearchInput.value) ? discogsSearchInput.value.trim().toLowerCase() : '';
    if (searchTerm) {
        discogsFilteredRecords = currentLocationRecords.filter(function(record) {
            const matchesArtist = record.artist && record.artist.toLowerCase().indexOf(searchTerm) !== -1;
            const matchesTitle = record.title && record.title.toLowerCase().indexOf(searchTerm) !== -1;
            const matchesCatalog = record.catalog_number && record.catalog_number.toLowerCase().indexOf(searchTerm) !== -1;
            return matchesArtist || matchesTitle || matchesCatalog;
        });
    } else {
        discogsFilteredRecords = currentLocationRecords.slice();
    }
    renderDiscogsTable();
    if (discogsPostButton && currentLocation) {
        const eligibleCount = discogsFilteredRecords.filter(function(r) {
            return r.status_id === 2 && !hasConsignor(r) && meetsLastSeenFilter(r);
        }).length;
        discogsPostButton.innerHTML = '<i class="fab fa-discogs"></i> Post Entire "' + currentLocation + '" (' + eligibleCount + ' of ' + discogsFilteredRecords.length + ' records)';
        discogsPostButton.disabled = (eligibleCount === 0);
        discogsPostButton.style.opacity = (eligibleCount === 0) ? '0.5' : '1';
    }
    if (discogsStatusMessage && currentLocation) {
        const searchInfo = searchTerm ? ' (matching "' + searchTerm + '")' : '';
        discogsStatusMessage.innerHTML = '📍 Bin: ' + currentLocation + ' | ' + discogsFilteredRecords.length + ' record(s) found in this bin' + searchInfo;
        discogsStatusMessage.className = 'status-message status-info';
        discogsStatusMessage.style.display = 'block';
        setTimeout(function() { if (discogsStatusMessage) discogsStatusMessage.style.display = 'none'; }, 3000);
    }
}

// ============================================================================
// Clear search filter
// ============================================================================

window.clearDiscogsSearch = function() {
    if (discogsSearchInput) {
        discogsSearchInput.value = '';
    }
    applyDiscogsSearchFilter();
};

// ============================================================================
// Render table from discogsFilteredRecords (USES BATCH ENDPOINT)
// ============================================================================

async function renderDiscogsTable() {
    if (!tableBody) return;
    if (discogsFilteredRecords.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;">' + (currentLocation ? 'No records found in this bin.' : 'Select a bin above') + '</td></tr>';
        return;
    }

    // 1. Build list of records that need price calculation
    const priceRequests = [];
    const recordMap = {};
    for (const record of discogsFilteredRecords) {
        recordMap[record.id] = record;
        const canPost = (record.status_id === 2);
        const hasConsignorFlag = hasConsignor(record);
        const meetsLastSeen = meetsLastSeenFilter(record);
        if (canPost && !hasConsignorFlag && meetsLastSeen && record.created_at) {
            priceRequests.push({
                id: record.id,
                created_at: record.created_at,
                store_price: record.store_price
            });
        }
    }

    // 2. Fetch all prices in ONE batch call
    let pricesMap = {};
    let errorsMap = {};
    if (priceRequests.length > 0) {
        const batchResults = await calculateMarkupBatch(priceRequests);
        batchResults.forEach(item => {
            if (item.id) {
                if (item.error) {
                    errorsMap[item.id] = item.error;
                } else {
                    pricesMap[item.id] = item;
                }
            }
        });
    }

    // 3. Build the HTML table
    let html = '';
    let processedCount = 0;
    for (const record of discogsFilteredRecords) {
        let imageUrl = record.image_url && record.image_url !== '' && record.image_url !== 'None' ? record.image_url : null;
        const canPost = (record.status_id === 2);
        const hasConsignorFlag = hasConsignor(record);
        const meetsLastSeen = meetsLastSeenFilter(record);
        let discogsPrice = null;
        let markupPercent = null;
        let priceError = null;
        if (canPost) {
            if (hasConsignorFlag) {
                discogsPrice = record.store_price;
                markupPercent = 0;
                priceError = 'Consignor item - cannot auto-post';
            } else if (!meetsLastSeen) {
                priceError = 'Last seen before cutoff date';
            } else if (!record.created_at) {
                priceError = 'Missing creation date';
            } else {
                const cached = pricesMap[record.id];
                if (cached) {
                    discogsPrice = cached.discogs_price;
                    markupPercent = cached.markup_percent;
                } else {
                    priceError = errorsMap[record.id] || 'Failed to calculate price';
                }
            }
        }
        const displayDiscogsPrice = discogsPrice ? '$' + discogsPrice.toFixed(2) : '—';
        const markupClass = (markupPercent > 0) ? 'positive' : ((markupPercent < 0) ? 'negative' : 'zero');
        const displayMarkup = (markupPercent !== null) ? (markupPercent > 0 ? '+' : '') + markupPercent + '%' : '—';
        const displayLocation = record.location || '—';
        const shortLocation = displayLocation.length > 30 ? displayLocation.substring(0, 27) + '...' : displayLocation;
        const lastSeenDisplay = formatLastSeen(record.last_seen);
        const consignorBadge = hasConsignorFlag ? '<span style="display: inline-block; background: #ffc107; color: #333; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 5px;" title="Consignor item - cannot auto-post">👤 Consignor</span>' : '';
        const lastSeenWarning = (!meetsLastSeen && record.last_seen) ? '<span style="display: inline-block; background: #dc3545; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 5px;" title="Last seen before cutoff date">⚠️ Old</span>' : '';
        const noLastSeenWarning = (!record.last_seen) ? '<span style="display: inline-block; background: #6c757d; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 5px;" title="Never scanned">⚠️ Never</span>' : '';
        html += '<tr style="' + ((!meetsLastSeen && record.last_seen) ? 'background: #fff0f0;' : (hasConsignorFlag ? 'background: #fff8e7;' : '')) + '">';
        html += '<td style="text-align: center;">' + (imageUrl ? '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(record.artist) + '" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">' : '<div style="width: 40px; height: 40px; background: #e0e0e0; border-radius: 4px; display: inline-block;"></div>') + '</td>';
        html += '<td>' + (record.id || '—') + consignorBadge + lastSeenWarning + noLastSeenWarning + '</td>';
        html += '<td><strong>' + escapeHtml(record.artist) + '</strong></td>';
        html += '<td>' + escapeHtml(record.title) + '</td>';
        html += '<td>' + (record.catalog_number || '—') + '</td>';
        html += '<td>' + (record.disc_condition_name || record.sleeve_condition_name || '—') + '</td>';
        html += '<td>' + (record.sleeve_condition_name || '—') + '</td>';
        html += '<td>' + (record.store_price ? '$' + parseFloat(record.store_price).toFixed(2) : '—') + '</td>';
        html += '<td class="discogs-price-cell" style="' + (discogsPrice ? 'color: #28a745; font-weight: bold;' : 'color: #999;') + '">' + displayDiscogsPrice + (priceError ? '<div style="font-size: 10px; color: #dc3545;">⚠️ ' + priceError + '</div>' : '') + '</td>';
        html += '<td class="markup-cell ' + markupClass + '">' + displayMarkup + '</td>';
        html += '<td style="font-size: 11px;">' + lastSeenDisplay + '</td>';
        html += '<td title="' + escapeHtml(displayLocation) + '" style="font-size: 12px;">' + escapeHtml(shortLocation) + '</td>';
        html += '<td style="text-align: center;">';
        if (canPost && discogsPrice && !hasConsignorFlag && meetsLastSeen) {
            html += '<button class="post-single-btn" data-record-id="' + record.id + '" data-artist="' + escapeHtml(record.artist) + '" data-title="' + escapeHtml(record.title) + '" data-price="' + record.store_price + '" data-discogs-price="' + discogsPrice + '" data-markup-percent="' + markupPercent + '" data-media-condition="' + (record.disc_condition_name || '') + '" data-sleeve-condition="' + (record.sleeve_condition_name || '') + '" data-catalog="' + escapeHtml(record.catalog_number || '') + '" data-location="' + escapeHtml(record.location || '') + '" data-notes="' + escapeHtml(record.notes || '') + '" data-has-consignor="false"><i class="fab fa-discogs"></i> Post</button>';
        } else if (canPost && hasConsignorFlag) {
            html += '<span style="color: #ffc107; font-size: 11px;" title="Consignor items must be posted manually on Discogs"><i class="fas fa-user"></i> Manual only</span>';
        } else if (canPost && !meetsLastSeen) {
            html += '<span style="color: #dc3545; font-size: 11px;" title="Last seen before cutoff date"><i class="fas fa-calendar-alt"></i> Too old</span>';
        } else if (canPost && !discogsPrice) {
            html += '<span style="color: #dc3545; font-size: 11px;">⚠️ No price</span>';
        } else {
            html += '<span style="color: #999;">—</span>';
        }
        html += '</td>';
        html += '</tr>';
        processedCount++;
        if (processedCount % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    tableBody.innerHTML = html;
    document.querySelectorAll('.post-single-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            postSingleRecordToDiscogs(
                parseInt(this.dataset.recordId),
                this.dataset.artist,
                this.dataset.title,
                parseFloat(this.dataset.price),
                parseFloat(this.dataset.discogsPrice),
                parseFloat(this.dataset.markupPercent),
                this.dataset.mediaCondition,
                this.dataset.sleeveCondition,
                this.dataset.catalog,
                this.dataset.location,
                this.dataset.notes,
                this.dataset.hasConsignor === 'true'
            );
        });
    });
}

// ============================================================================
// Post Single Record to Discogs - WITH RETRIES
// ============================================================================

window.postSingleRecordToDiscogs = async function(recordId, artist, title, price, discogsPrice, markupPercent, mediaCondition, sleeveCondition, catalogNumber, location, notes, hasConsignorFlag) {
    console.log('postSingleRecordToDiscogs called', { recordId, artist, title, price, discogsPrice });
    if (hasConsignorFlag) {
        showDiscogsStatus('Consignor items cannot be auto-posted to Discogs. Must be posted manually.', 'error');
        return;
    }
    if (!recordId || !mediaCondition || !sleeveCondition || !price || !discogsPrice) {
        showDiscogsStatus('Missing required information', 'error');
        return;
    }
    if (!confirm('📋 Post "' + artist + ' - ' + title + '" to Discogs?\n\nStore Price: $' + price + '\nDiscogs Price: $' + discogsPrice + ' (' + (markupPercent > 0 ? '+' : '') + markupPercent + '%)\nMedia: ' + mediaCondition + '\nSleeve: ' + sleeveCondition)) {
        return;
    }
    openProgressModal('Posting to Discogs: ' + artist + ' - ' + title);
    appendToModalLog('🚀 Starting to post "' + artist + ' - ' + title + '" to Discogs...', 'info');
    appendToModalLog('💰 Store Price: $' + price, 'info');
    appendToModalLog('💰 Discogs Price: $' + discogsPrice + ' (' + (markupPercent > 0 ? '+' : '') + markupPercent + '%)', 'info');
    appendToModalLog('📀 Media Condition: ' + mediaCondition, 'info');
    appendToModalLog('📀 Sleeve Condition: ' + sleeveCondition, 'info');
    if (location) appendToModalLog('📍 Location: ' + location, 'info');
    appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');

    let success = false;
    let lastError = null;
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (attempt > 1) {
            appendToModalLog('🔄 Retry attempt ' + attempt + ' of ' + maxRetries + '...', 'warning');
            const waitTime = 3000 * Math.pow(2, attempt - 1);
            appendToModalLog('   Waiting ' + (waitTime / 1000) + ' seconds before retry...', 'info');
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        const listingData = {
            record: {
                id: recordId,
                artist: artist,
                title: title,
                catalog_number: catalogNumber || '',
                media_condition: mediaCondition,
                sleeve_condition: sleeveCondition,
                price: discogsPrice,
                notes: notes || '',
                location: location || ''
            }
        };
        try {
            appendToModalLog('📤 Sending to Discogs API (attempt ' + attempt + ')...', 'info');
            const response = await fetch(window.AppConfig.baseUrl + '/api/discogs/create-listing-single', {
                method: 'POST',
                credentials: 'include',
                headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(listingData)
            });
            const result = await response.json();
            if (result.success) {
                success = true;
                let discogsUrl = result.listing_url;
                if (!discogsUrl && result.listing_id) {
                    discogsUrl = 'https://www.discogs.com/sell/item/' + result.listing_id;
                }
                appendToModalLog('✅ SUCCESS! Record posted to Discogs!', 'success');
                appendToModalLog('🔗 Discogs URL: ' + discogsUrl, 'success');
                appendToModalLog('🆔 Listing ID: ' + result.listing_id, 'info');
                appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'success');
                showDiscogsStatusWithLink('✅ Successfully posted "' + artist + ' - ' + title + '" to Discogs!', discogsUrl, 'success');
                await loadLocationRecords();
                break;
            } else {
                lastError = result.error || 'Unknown error';
                appendToModalLog('❌ Attempt ' + attempt + ' failed: ' + lastError, 'error');
                if (!result.error || (!result.error.includes('too quickly') && !result.error.includes('rate') && !result.error.includes('timeout'))) {
                    appendToModalLog('   ⚠️ Non-retryable error, stopping attempts', 'warning');
                    break;
                }
            }
        } catch (error) {
            lastError = error.message;
            appendToModalLog('❌ Attempt ' + attempt + ' failed: ' + error.message, 'error');
            console.error('Fetch error:', error);
        }
    }
    if (!success) {
        appendToModalLog('❌ PERMANENT FAILURE after ' + maxRetries + ' attempts: ' + lastError, 'error');
        showDiscogsStatus('Error: ' + lastError, 'error');
    }
    setTimeout(function() { closeProgressModal(); }, 2000);
};

// ============================================================================
// Bulk Post All Records in Current Bin (USES BATCH ENDPOINT)
// ============================================================================

async function bulkPostToDiscogs() {
    const eligibleRecords = discogsFilteredRecords.filter(function(r) {
        return r.status_id === 2 && !hasConsignor(r) && meetsLastSeenFilter(r);
    });
    const consignorCount = discogsFilteredRecords.filter(function(r) {
        return r.status_id === 2 && hasConsignor(r);
    }).length;
    const lastSeenFilteredCount = discogsFilteredRecords.filter(function(r) {
        return r.status_id === 2 && !hasConsignor(r) && !meetsLastSeenFilter(r);
    }).length;
    if (eligibleRecords.length === 0) {
        let msg = 'No eligible records to post. ';
        if (consignorCount > 0) msg += `${consignorCount} consignor item(s) skipped. `;
        if (lastSeenFilteredCount > 0) msg += `${lastSeenFilteredCount} record(s) skipped due to last_seen filter.`;
        showDiscogsStatus(msg, 'warning');
        return;
    }
    const totalTimeMinutes = Math.ceil(eligibleRecords.length * 3 / 60);
    let confirmMessage = `📋 Post ${eligibleRecords.length} store record(s) from bin "${currentLocation}" to Discogs?\n\n`;
    if (consignorCount > 0) confirmMessage += `⚠️ ${consignorCount} consignor item(s) will be SKIPPED (cannot auto-post)\n`;
    if (lastSeenFilteredCount > 0) confirmMessage += `⚠️ ${lastSeenFilteredCount} record(s) will be SKIPPED (last_seen before cutoff)\n`;
    confirmMessage += `⏱️ Estimated total time: ~${totalTimeMinutes} minute(s)\n\nContinue?`;
    if (!confirm(confirmMessage)) return;

    openProgressModal('Posting ' + eligibleRecords.length + ' Records from Bin "' + currentLocation + '" to Discogs');
    appendToModalLog('🚀 Starting bulk post for ' + eligibleRecords.length + ' store records from bin "' + currentLocation + '"...', 'info');
    if (consignorCount > 0) appendToModalLog('⚠️ Skipping ' + consignorCount + ' consignor item(s) (cannot auto-post)', 'warning');
    if (lastSeenFilteredCount > 0) appendToModalLog(`⚠️ Skipping ${lastSeenFilteredCount} record(s) (last_seen before cutoff date)`, 'warning');
    appendToModalLog('⏱️ 3-second delay between requests for reliability', 'warning');
    appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');

    // --- 1. BATCH FETCH ALL MARKUPS ---
    const priceRequests = eligibleRecords.map(r => ({
        id: r.id,
        created_at: r.created_at,
        store_price: r.store_price
    }));
    let pricesMap = {};
    let errorsMap = {};
    if (priceRequests.length > 0) {
        const batchResults = await calculateMarkupBatch(priceRequests);
        batchResults.forEach(item => {
            if (item.id) {
                if (item.error) {
                    errorsMap[item.id] = item.error;
                } else {
                    pricesMap[item.id] = item;
                }
            }
        });
    }

    let posted = 0;
    let failed = 0;
    let skipped = 0;
    const failedRecords = [];

    for (let i = 0; i < eligibleRecords.length; i++) {
        if (cancelResolve) {
            appendToModalLog('⏹️ Operation cancelled by user.', 'warning');
            break;
        }
        const record = eligibleRecords[i];
        updateModalProgress(i + 1, eligibleRecords.length);
        if (!record.created_at) {
            skipped++;
            appendToModalLog(`[${i+1}/${eligibleRecords.length}] ⚠️ "${record.artist} - ${record.title}" - Missing creation date, skipping`, 'warning');
            continue;
        }
        if (!record.disc_condition_name && !record.sleeve_condition_name) {
            skipped++;
            appendToModalLog(`[${i+1}/${eligibleRecords.length}] ⚠️ "${record.artist} - ${record.title}" - Missing condition, skipping`, 'warning');
            continue;
        }
        const markupInfo = pricesMap[record.id];
        if (!markupInfo) {
            const errorMsg = errorsMap[record.id] || 'Failed to calculate markup';
            failed++;
            failedRecords.push(`${record.artist} - ${record.title}: ${errorMsg}`);
            appendToModalLog(`   ❌ Cannot post: ${errorMsg}`, 'error');
            continue;
        }
        appendToModalLog(`[${i+1}/${eligibleRecords.length}] 📀 "${record.artist} - ${record.title}"`, 'info');
        appendToModalLog(`   💰 Store: $${record.store_price} → Discogs: $${markupInfo.discogs_price} (+${markupInfo.markup_percent}%)`, 'info');

        let success = false;
        let lastError = null;
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (cancelResolve) break;
            if (attempt > 1) {
                appendToModalLog(`   🔄 RETRY ${attempt}/${maxRetries}...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
            }
            const listingData = {
                record: {
                    id: record.id,
                    artist: record.artist,
                    title: record.title,
                    catalog_number: record.catalog_number || '',
                    media_condition: record.disc_condition_name || record.sleeve_condition_name,
                    sleeve_condition: record.sleeve_condition_name || record.disc_condition_name,
                    price: markupInfo.discogs_price,
                    notes: record.notes || '',
                    location: record.location || ''
                }
            };
            try {
                const postResponse = await fetch(window.AppConfig.baseUrl + '/api/discogs/create-listing-single', {
                    method: 'POST',
                    credentials: 'include',
                    headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(listingData)
                });
                const result = await postResponse.json();
                if (result.success) {
                    success = true;
                    posted++;
                    appendToModalLog(`   ✅ POSTED! Listing ID: ${result.listing_id}`, 'success');
                    break;
                } else {
                    lastError = result.error || 'Unknown error';
                    appendToModalLog(`   ❌ Attempt ${attempt} failed: ${lastError}`, 'error');
                    if (!result.error || (!result.error.includes('too quickly') && !result.error.includes('rate'))) {
                        break;
                    }
                }
            } catch (err) {
                lastError = err.message;
                appendToModalLog(`   ❌ Attempt ${attempt} error: ${err.message}`, 'error');
            }
        }
        if (!success) {
            failed++;
            failedRecords.push(`${record.artist} - ${record.title}: ${lastError}`);
            appendToModalLog(`   ❌ PERMANENT FAILURE after ${maxRetries} attempts`, 'error');
        }
        if (i < eligibleRecords.length - 1 && !cancelResolve) {
            appendToModalLog(`   ⏳ Waiting 3 seconds...`, 'info');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
    appendToModalLog('📊 FINAL RESULTS:', 'info');
    appendToModalLog(`   ✅ Successfully posted: ${posted}`, 'success');
    appendToModalLog(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
    appendToModalLog(`   ⚠️ Skipped (missing data): ${skipped}`, 'warning');
    if (consignorCount > 0) appendToModalLog(`   👤 Consignor items skipped: ${consignorCount}`, 'warning');
    if (lastSeenFilteredCount > 0) appendToModalLog(`   📅 Last seen filter skipped: ${lastSeenFilteredCount}`, 'warning');
    if (failedRecords.length > 0 && failedRecords.length <= 20) {
        appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'warning');
        appendToModalLog('❌ FAILED RECORDS:', 'warning');
        for (const failedRecord of failedRecords) {
            appendToModalLog(`   • ${failedRecord}`, 'error');
        }
    } else if (failedRecords.length > 20) {
        appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'warning');
        appendToModalLog(`❌ ${failedRecords.length} records failed. Check console for details.`, 'error');
    }
    if (posted > 0) {
        appendToModalLog('🔄 Reloading location data...', 'info');
        await loadLocationRecords();
        appendToModalLog('✅ Data refreshed', 'success');
    }
    if (posted > 0 && failed === 0 && skipped === 0) {
        showDiscogsStatus('✅ Successfully posted ALL ' + posted + ' store records from bin "' + currentLocation + '" to Discogs!', 'success');
    } else if (posted > 0) {
        showDiscogsStatus(`⚠️ Posted ${posted} records, ${failed} failed, ${skipped} skipped. Check log.`, 'warning');
    } else {
        showDiscogsStatus('❌ Failed to post any records. Check log.', 'error');
    }
}

// ============================================================================
// REPOST ENTIRE STORE TO DISCOGS (USES BATCH ENDPOINT)
// ============================================================================

window.repostEntireStoreToDiscogs = async function() {
    console.log('🔄 Reposting entire store to Discogs...');
    showDiscogsStatus('Loading all active store records from the entire store...', 'info');
    try {
        const url = window.AppConfig.baseUrl + '/records/status/2';
        const response = await fetch(url, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || 'Failed to load records');
        const allActiveRecords = data.records || [];
        const eligibleRecords = allActiveRecords.filter(record => {
            const hasConsignorFlag = hasConsignor(record);
            return record.location && record.location.trim() !== '' && record.location !== 'null' && record.location !== 'None' && !hasConsignorFlag && meetsLastSeenFilter(record);
        });
        const skippedNoLocation = allActiveRecords.filter(r => (!r.location || r.location.trim() === '')).length;
        const skippedConsignor = allActiveRecords.filter(r => hasConsignor(r)).length;
        const skippedLastSeen = allActiveRecords.filter(r => {
            return r.location && r.location.trim() !== '' && !hasConsignor(r) && !meetsLastSeenFilter(r);
        }).length;
        if (eligibleRecords.length === 0) {
            let msg = `No eligible store records found. `;
            if (skippedNoLocation > 0) msg += `${skippedNoLocation} record(s) have no location. `;
            if (skippedConsignor > 0) msg += `${skippedConsignor} consignor record(s) cannot be auto-posted. `;
            if (skippedLastSeen > 0) msg += `${skippedLastSeen} record(s) skipped due to last_seen filter.`;
            showDiscogsStatus(msg, 'warning');
            return;
        }
        const totalTimeHours = Math.ceil(eligibleRecords.length * 3 / 3600);
        let confirmMsg = `📋 REPOST ENTIRE STORE to Discogs?\n\n`;
        confirmMsg += `Store records with location AND recent last_seen: ${eligibleRecords.length}\n`;
        confirmMsg += `Skipped (no location): ${skippedNoLocation}\n`;
        confirmMsg += `Skipped (consignor items): ${skippedConsignor}\n`;
        confirmMsg += `Skipped (last_seen before cutoff): ${skippedLastSeen}\n`;
        confirmMsg += `⚠️ Each record takes ~3 seconds\n`;
        confirmMsg += `⏱️ Estimated time: ~${totalTimeHours} hour(s)\n\n`;
        confirmMsg += `Continue?`;
        if (!confirm(confirmMsg)) return;

        openProgressModal('Reposting ' + eligibleRecords.length + ' Store Records from Entire Store');
        appendToModalLog('🚀 Starting REPOST ENTIRE STORE for ' + eligibleRecords.length + ' store records...', 'info');
        appendToModalLog(`⚠️ Skipped ${skippedNoLocation} record(s) with missing location`, 'warning');
        appendToModalLog(`⚠️ Skipped ${skippedConsignor} consignor item(s) (cannot auto-post)`, 'warning');
        appendToModalLog(`⚠️ Skipped ${skippedLastSeen} record(s) (last_seen before cutoff date)`, 'warning');
        appendToModalLog('⏱️ Validating and posting in one pass (3 seconds per record)', 'info');
        appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');

        const priceRequests = eligibleRecords.map(r => ({
            id: r.id,
            created_at: r.created_at,
            store_price: r.store_price
        }));
        let pricesMap = {};
        let errorsMap = {};
        if (priceRequests.length > 0) {
            const batchResults = await calculateMarkupBatch(priceRequests);
            batchResults.forEach(item => {
                if (item.id) {
                    if (item.error) {
                        errorsMap[item.id] = item.error;
                    } else {
                        pricesMap[item.id] = item;
                    }
                }
            });
        }

        let posted = 0;
        let failed = 0;
        let skipped = 0;
        const failedRecords = [];

        for (let i = 0; i < eligibleRecords.length; i++) {
            if (cancelResolve) {
                appendToModalLog('⏹️ Operation cancelled by user.', 'warning');
                break;
            }
            const record = eligibleRecords[i];
            updateModalProgress(i + 1, eligibleRecords.length);
            if (!record.created_at) {
                skipped++;
                appendToModalLog(`[${i+1}/${eligibleRecords.length}] ⚠️ "${record.artist} - ${record.title}" - Missing creation date, skipping`, 'warning');
                continue;
            }
            if (!record.disc_condition_name && !record.sleeve_condition_name) {
                skipped++;
                appendToModalLog(`[${i+1}/${eligibleRecords.length}] ⚠️ "${record.artist} - ${record.title}" - Missing condition, skipping`, 'warning');
                continue;
            }
            const markupInfo = pricesMap[record.id];
            if (!markupInfo) {
                const errorMsg = errorsMap[record.id] || 'Failed to calculate markup';
                failed++;
                failedRecords.push(`${record.artist} - ${record.title}: ${errorMsg}`);
                appendToModalLog(`   ❌ Cannot post: ${errorMsg}`, 'error');
                continue;
            }
            appendToModalLog(`[${i+1}/${eligibleRecords.length}] 📀 "${record.artist} - ${record.title}"`, 'info');
            appendToModalLog(`   💰 Store: $${record.store_price} → Discogs: $${markupInfo.discogs_price} (+${markupInfo.markup_percent}%)`, 'info');

            let success = false;
            let lastError = null;
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                if (cancelResolve) break;
                if (attempt > 1) {
                    appendToModalLog(`   🔄 RETRY ${attempt}/${maxRetries}...`, 'warning');
                    await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
                }
                const listingData = {
                    record: {
                        id: record.id,
                        artist: record.artist,
                        title: record.title,
                        catalog_number: record.catalog_number || '',
                        media_condition: record.disc_condition_name || record.sleeve_condition_name,
                        sleeve_condition: record.sleeve_condition_name || record.disc_condition_name,
                        price: markupInfo.discogs_price,
                        notes: record.notes || '',
                        location: record.location || ''
                    }
                };
                try {
                    const postResponse = await fetch(window.AppConfig.baseUrl + '/api/discogs/create-listing-single', {
                        method: 'POST',
                        credentials: 'include',
                        headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(listingData)
                    });
                    const result = await postResponse.json();
                    if (result.success) {
                        success = true;
                        posted++;
                        appendToModalLog(`   ✅ POSTED! Listing ID: ${result.listing_id}`, 'success');
                        break;
                    } else {
                        lastError = result.error || 'Unknown error';
                        appendToModalLog(`   ❌ Attempt ${attempt} failed: ${lastError}`, 'error');
                        if (!result.error || (!result.error.includes('too quickly') && !result.error.includes('rate'))) {
                            break;
                        }
                    }
                } catch (err) {
                    lastError = err.message;
                    appendToModalLog(`   ❌ Attempt ${attempt} error: ${err.message}`, 'error');
                }
            }
            if (!success) {
                failed++;
                failedRecords.push(`${record.artist} - ${record.title}: ${lastError}`);
                appendToModalLog(`   ❌ PERMANENT FAILURE after ${maxRetries} attempts`, 'error');
            }
            if (i < eligibleRecords.length - 1 && !cancelResolve) {
                appendToModalLog(`   ⏳ Waiting 3 seconds...`, 'info');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
        appendToModalLog('📊 FINAL RESULTS - ENTIRE STORE REPOST:', 'info');
        appendToModalLog(`   ✅ Successfully posted: ${posted}`, 'success');
        appendToModalLog(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
        appendToModalLog(`   ⚠️ Skipped (missing data): ${skipped}`, 'warning');
        appendToModalLog(`   📊 Total processed: ${posted + failed + skipped} of ${eligibleRecords.length}`, 'info');
        if (failedRecords.length > 0 && failedRecords.length <= 20) {
            appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'warning');
            appendToModalLog('❌ FAILED RECORDS:', 'warning');
            for (const failedRecord of failedRecords) {
                appendToModalLog(`   • ${failedRecord}`, 'error');
            }
        } else if (failedRecords.length > 20) {
            appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'warning');
            appendToModalLog(`❌ ${failedRecords.length} records failed. Check console for details.`, 'error');
        }
        if (posted > 0) {
            showDiscogsStatus(`✅ Reposted ${posted} store records. ${failed} failed, ${skipped} skipped.`, posted === eligibleRecords.length ? 'success' : 'warning');
        } else {
            showDiscogsStatus(`❌ Failed to repost any records. Check log for details.`, 'error');
        }
    } catch (error) {
        console.error('Error in repostEntireStoreToDiscogs:', error);
        showDiscogsStatus('Error: ' + error.message, 'error');
        if (progressModal && progressModal.style.display === 'flex') {
            appendToModalLog('❌ FATAL ERROR: ' + error.message, 'error');
        }
    }
};

// ============================================================================
// POST NEW RECORDS (status_id = 1) TO DISCOGS AND MARK ACTIVE
// ============================================================================

window.postNewRecordsToDiscogs = async function() {
    console.log('📦 Posting all new records (status_id=1) to Discogs...');
    showDiscogsStatus('Loading all new records (status_id=1)...', 'info');

    try {
        // 1. Fetch all records with status_id = 1
        const url = window.AppConfig.baseUrl + '/records/status/1';
        const response = await fetch(url, {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.error || 'Failed to load new records');

        const newRecords = data.records || [];
        if (newRecords.length === 0) {
            showDiscogsStatus('No new records (status_id=1) found.', 'warning');
            return;
        }

        // 2. Filter out consignor records (can't auto-post)
        const eligibleRecords = newRecords.filter(record => {
            const hasConsignor = record.consignor_id && record.consignor_id !== 1 && record.consignor_id !== null;
            return !hasConsignor;
        });

        const consignorSkipped = newRecords.length - eligibleRecords.length;
        if (eligibleRecords.length === 0) {
            showDiscogsStatus(`All ${newRecords.length} new records belong to consignors. Cannot auto-post.`, 'warning');
            return;
        }

        // 3. Prompt for location (ONCE)
        const locationString = prompt(
            `Enter the location for these ${eligibleRecords.length} new records.\n` +
            `Example: "home crate 1" or "Store wall A"\n\n` +
            `The location will be appended with a rank number, e.g. "home crate 1 | rank 1"\n` +
            `The last posted record will be rank 1, the first posted will be rank ${eligibleRecords.length}.`
        );
        if (locationString === null || locationString.trim() === '') {
            showDiscogsStatus('Location prompt cancelled or empty. Aborting.', 'warning');
            return;
        }
        const baseLocation = locationString.trim();

        // 4. Confirm
        const confirmMsg = `📦 Post ${eligibleRecords.length} new record(s) to Discogs and mark them Active?\n\n` +
                           `Total new records: ${newRecords.length}\n` +
                           `Consignor records (skipped): ${consignorSkipped}\n` +
                           `Location base: "${baseLocation}"\n` +
                           `Ranks: 1 (last posted) to ${eligibleRecords.length} (first posted)\n\n` +
                           `⏱️ Estimated time: ~${Math.ceil(eligibleRecords.length * 3 / 60)} minute(s)\n\n` +
                           `Continue?`;
        if (!confirm(confirmMsg)) return;

        // 5. Open progress modal
        openProgressModal('Posting New Records to Discogs');
        appendToModalLog(`🚀 Starting to post ${eligibleRecords.length} new records to Discogs...`, 'info');
        appendToModalLog(`📍 Location base: "${baseLocation}" (ranks will be assigned in reverse order)`, 'info');
        if (consignorSkipped > 0) {
            appendToModalLog(`⚠️ Skipping ${consignorSkipped} consignor record(s) (cannot auto-post)`, 'warning');
        }
        appendToModalLog('⏱️ 3-second delay between requests for reliability', 'warning');
        appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');

        // 6. Batch calculate markups
        const priceRequests = eligibleRecords.map(r => ({
            id: r.id,
            created_at: r.created_at,
            store_price: r.store_price
        }));
        let pricesMap = {};
        let errorsMap = {};
        if (priceRequests.length > 0) {
            const batchResults = await calculateMarkupBatch(priceRequests);
            batchResults.forEach(item => {
                if (item.id) {
                    if (item.error) {
                        errorsMap[item.id] = item.error;
                    } else {
                        pricesMap[item.id] = item;
                    }
                }
            });
        }

        // 7. Post each record with retries, collecting successful IDs in order
        let posted = 0, failed = 0, skipped = 0;
        const failedRecords = [];
        const postedIds = []; // in order of processing (first posted first)

        for (let i = 0; i < eligibleRecords.length; i++) {
            if (cancelResolve) {
                appendToModalLog('⏹️ Operation cancelled by user.', 'warning');
                break;
            }
            const record = eligibleRecords[i];
            updateModalProgress(i + 1, eligibleRecords.length);

            if (!record.created_at || !record.disc_condition_name || !record.sleeve_condition_name) {
                skipped++;
                appendToModalLog(`[${i+1}/${eligibleRecords.length}] ⚠️ "${record.artist} - ${record.title}" - Missing data, skipping`, 'warning');
                continue;
            }

            const markupInfo = pricesMap[record.id];
            if (!markupInfo) {
                const errorMsg = errorsMap[record.id] || 'Failed to calculate markup';
                failed++;
                failedRecords.push(`${record.artist} - ${record.title}: ${errorMsg}`);
                appendToModalLog(`   ❌ Cannot post: ${errorMsg}`, 'error');
                continue;
            }

            appendToModalLog(`[${i+1}/${eligibleRecords.length}] 📀 "${record.artist} - ${record.title}"`, 'info');
            appendToModalLog(`   💰 Store: $${record.store_price} → Discogs: $${markupInfo.discogs_price} (+${markupInfo.markup_percent}%)`, 'info');

            let success = false;
            let lastError = null;
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                if (cancelResolve) break;
                if (attempt > 1) {
                    appendToModalLog(`   🔄 RETRY ${attempt}/${maxRetries}...`, 'warning');
                    await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
                }
                const listingData = {
                    record: {
                        id: record.id,
                        artist: record.artist,
                        title: record.title,
                        catalog_number: record.catalog_number || '',
                        media_condition: record.disc_condition_name || record.sleeve_condition_name,
                        sleeve_condition: record.sleeve_condition_name || record.disc_condition_name,
                        price: markupInfo.discogs_price,
                        notes: record.notes || '',
                        location: record.location || ''
                    }
                };
                try {
                    const postResponse = await fetch(window.AppConfig.baseUrl + '/api/discogs/create-listing-single', {
                        method: 'POST',
                        credentials: 'include',
                        headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(listingData)
                    });
                    const result = await postResponse.json();
                    if (result.success) {
                        success = true;
                        posted++;
                        postedIds.push(record.id); // collect in processing order
                        appendToModalLog(`   ✅ POSTED! Listing ID: ${result.listing_id}`, 'success');
                        break;
                    } else {
                        lastError = result.error || 'Unknown error';
                        appendToModalLog(`   ❌ Attempt ${attempt} failed: ${lastError}`, 'error');
                        if (!result.error || (!result.error.includes('too quickly') && !result.error.includes('rate'))) {
                            break;
                        }
                    }
                } catch (err) {
                    lastError = err.message;
                    appendToModalLog(`   ❌ Attempt ${attempt} error: ${err.message}`, 'error');
                }
            }
            if (!success) {
                failed++;
                failedRecords.push(`${record.artist} - ${record.title}: ${lastError}`);
                appendToModalLog(`   ❌ PERMANENT FAILURE after ${maxRetries} attempts`, 'error');
            }
            if (i < eligibleRecords.length - 1 && !cancelResolve) {
                appendToModalLog(`   ⏳ Waiting 3 seconds...`, 'info');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        // 8. If any records were posted, assign ranks in reverse order (last posted → rank 1)
        if (postedIds.length > 0) {
            appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
            appendToModalLog(`📍 Assigning locations to ${postedIds.length} posted records...`, 'info');

            // Reverse the array so that the last posted comes first
            const reversedIds = [...postedIds].reverse();
            let rank = 0;
            for (const recordId of reversedIds) {
                rank++;
                const locationWithRank = `${baseLocation} | rank ${rank}`;
                try {
                    const updateResponse = await fetch(`${window.AppConfig.baseUrl}/records/${recordId}`, {
                        method: 'PUT',
                        credentials: 'include',
                        headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ location: locationWithRank })
                    });
                    if (!updateResponse.ok) throw new Error('HTTP ' + updateResponse.status);
                    const updateData = await updateResponse.json();
                    if (updateData.status !== 'success') throw new Error(updateData.error || 'Failed to update location');
                    appendToModalLog(`   ✅ Record ${recordId} → location: "${locationWithRank}"`, 'success');
                } catch (err) {
                    appendToModalLog(`   ❌ Failed to update location for record ${recordId}: ${err.message}`, 'error');
                }
            }
            appendToModalLog(`✅ Location assignments complete.`, 'success');
        }

        // 9. Mark posted records as Active (status_id = 2)
        if (postedIds.length > 0) {
            appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
            appendToModalLog(`🔄 Marking ${postedIds.length} posted records as Active (status_id=2)...`, 'info');
            try {
                const updateResponse = await fetch(window.AppConfig.baseUrl + '/records/update-status', {
                    method: 'POST',
                    credentials: 'include',
                    headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        record_ids: postedIds,
                        status_id: 2
                    })
                });
                if (!updateResponse.ok) throw new Error('HTTP ' + updateResponse.status);
                const updateData = await updateResponse.json();
                if (updateData.status === 'success') {
                    appendToModalLog(`✅ Successfully marked ${updateData.updated_count} records as Active`, 'success');
                } else {
                    throw new Error(updateData.error || 'Failed to update status');
                }
            } catch (err) {
                appendToModalLog(`❌ Failed to mark records as Active: ${err.message}`, 'error');
            }
        }

        // 10. Final summary
        appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
        appendToModalLog('📊 FINAL RESULTS - NEW RECORDS POST:', 'info');
        appendToModalLog(`   ✅ Successfully posted: ${posted}`, 'success');
        appendToModalLog(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
        appendToModalLog(`   ⚠️ Skipped (missing data): ${skipped}`, 'warning');
        if (consignorSkipped > 0) appendToModalLog(`   👤 Consignor items skipped: ${consignorSkipped}`, 'warning');
        if (postedIds.length > 0) {
            appendToModalLog(`   📍 Locations assigned to ${postedIds.length} records with base: "${baseLocation}"`, 'info');
        }
        if (failedRecords.length > 0 && failedRecords.length <= 20) {
            appendToModalLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'warning');
            appendToModalLog('❌ FAILED RECORDS:', 'warning');
            for (const failedRecord of failedRecords) {
                appendToModalLog(`   • ${failedRecord}`, 'error');
            }
        } else if (failedRecords.length > 20) {
            appendToModalLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'warning');
            appendToModalLog(`❌ ${failedRecords.length} records failed. Check console for details.`, 'error');
        }

        if (posted > 0 && failed === 0 && skipped === 0) {
            showDiscogsStatus(`✅ Successfully posted ALL ${posted} new records to Discogs, assigned locations, and marked Active!`, 'success');
        } else if (posted > 0) {
            showDiscogsStatus(`⚠️ Posted ${posted} new records, ${failed} failed, ${skipped} skipped. Check log.`, 'warning');
        } else {
            showDiscogsStatus('❌ Failed to post any new records. Check log.', 'error');
        }

        // Refresh location data if a location is selected
        if (currentLocation) {
            await loadLocationRecords();
        }

    } catch (error) {
        console.error('Error in postNewRecordsToDiscogs:', error);
        showDiscogsStatus('Error: ' + error.message, 'error');
        if (progressModal && progressModal.style.display === 'flex') {
            appendToModalLog('❌ FATAL ERROR: ' + error.message, 'error');
        }
    } finally {
        setTimeout(closeProgressModal, 2000);
    }
};

// ============================================================================
// Show status messages
// ============================================================================

function showDiscogsStatusWithLink(message, url, type) {
    const el = document.getElementById('discogs-status-message');
    if (!el) {
        console.log('Status (no element):', message);
        return;
    }
    type = type || 'success';
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const linkHtml = url ? '<br><a href="' + url + '" target="_blank" style="color: #007bff; text-decoration: underline;"><i class="fab fa-discogs"></i> View on Discogs</a>' : '';
    el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message) + linkHtml;
    el.className = 'status-message status-' + type;
    el.style.display = 'block';
    setTimeout(function() { if (el) el.style.display = 'none'; }, 15000);
}

function showDiscogsStatus(message, type) {
    const el = document.getElementById('discogs-status-message');
    if (!el) {
        console.log('Status (no element):', message);
        return;
    }
    type = type || 'info';
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    el.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
    el.className = 'status-message status-' + type;
    el.style.display = 'block';
    setTimeout(function() { if (el) el.style.display = 'none'; }, 8000);
}

// ============================================================================
// Escape HTML
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============================================================================
// Config Management
// ============================================================================

async function loadDiscogsConfig() {
    try {
        const markupInput = document.getElementById('discogs-markup');
        if (!markupInput) return;
        const response = await fetch(window.AppConfig.baseUrl + '/config/DISCOGS_MARKUP_PERCENT', {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        if (response.ok) {
            const data = await response.json();
            if (data.config_value) markupInput.value = data.config_value;
        }
    } catch (error) {
        console.error('Error loading Discogs config:', error);
    }
}

window.saveDiscogsConfig = async function() {
    const markupInput = document.getElementById('discogs-markup');
    const configStatus = document.getElementById('config-status');
    if (!markupInput) return;
    configStatus.innerHTML = 'Saving...';
    configStatus.style.color = '#ffc107';
    try {
        const response = await fetch(window.AppConfig.baseUrl + '/config/DISCOGS_MARKUP_PERCENT', {
            method: 'PUT',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ config_value: markupInput.value })
        });
        if (response.ok) {
            configStatus.innerHTML = '✅ Saved!';
            configStatus.style.color = '#28a745';
            setTimeout(function() { configStatus.innerHTML = ''; }, 3000);
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        configStatus.innerHTML = '❌ Save failed';
        configStatus.style.color = '#dc3545';
        setTimeout(function() { configStatus.innerHTML = ''; }, 3000);
    }
};

// ============================================================================
// Markup Rules Management (with debug logging)
// ============================================================================

async function loadMarkupRules() {
    try {
        console.log('loadMarkupRules called');
        const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules', {
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                renderMarkupRules(data.rules);
            }
        }
    } catch (error) {
        console.error('Error loading markup rules:', error);
    }
}

function renderMarkupRules(rules) {
    const tbody = document.getElementById('markup-rules-body');
    const warning = document.getElementById('no-rules-warning');
    if (!tbody) return;
    if (!rules || rules.length === 0) {
        tbody.innerHTML = '<td><td colspan="4" style="padding: 30px; text-align: center; color: #999;">⚠️ No rules configured. Add your first rule above.</td></tr>';
        if (warning) warning.style.display = 'block';
        return;
    }
    if (warning) warning.style.display = 'none';
    rules.sort(function(a, b) { return a.days_old - b.days_old; });
    let html = '';
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        html += '<tr style="border-bottom: 1px solid #dee2e6;">';
        html += '<td style="padding: 12px;">' + rule.days_old + '+ days</td>';
        html += '<td style="padding: 12px;"><input type="number" id="rule-percent-' + rule.id + '" value="' + rule.markup_percent + '" step="1" style="width: 80px; padding: 6px; border: 1px solid #ddd; border-radius: 4px;"><span>%</span></td>';
        html += '<td style="padding: 12px;"><input type="text" id="rule-desc-' + rule.id + '" value="' + escapeHtml(rule.description || '') + '" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;"></td>';
        html += '<td style="padding: 12px;">';
        html += '<button class="btn btn-sm btn-info" onclick="updateMarkupRule(' + rule.id + ')" style="padding: 4px 8px; margin-right: 5px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-save"></i></button> ';
        html += '<button class="btn btn-sm btn-danger" onclick="deleteMarkupRule(' + rule.id + ')" style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i></button>';
        html += '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

window.addMarkupRule = async function() {
    console.log('addMarkupRule called');
    const daysInput = document.getElementById('new-rule-days');
    const percentInput = document.getElementById('new-rule-percent');
    const descInput = document.getElementById('new-rule-desc');
    if (!daysInput || !percentInput || !descInput) {
        console.error('Markup rule input elements not found');
        showDiscogsStatus('Error: Input fields not found. Please refresh the page.', 'error');
        return;
    }
    const days_old = parseInt(daysInput.value);
    const markup_percent = parseFloat(percentInput.value);
    const description = descInput.value;
    if (isNaN(days_old) || isNaN(markup_percent)) {
        showDiscogsStatus('Please enter valid days and percentage', 'error');
        return;
    }
    try {
        const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules', {
            method: 'POST',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ days_old: days_old, markup_percent: markup_percent, description: description })
        });
        if (response.ok) {
            showDiscogsStatus('Markup rule added successfully', 'success');
            daysInput.value = '';
            percentInput.value = '';
            descInput.value = '';
            loadMarkupRules();
            if (currentLocation) {
                await loadLocationRecords();
            }
        } else {
            const error = await response.json();
            showDiscogsStatus('Error: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('addMarkupRule error:', error);
        showDiscogsStatus('Error: ' + error.message, 'error');
    }
};

window.updateMarkupRule = async function(ruleId) {
    console.log('updateMarkupRule called for rule', ruleId);
    const percentInput = document.getElementById('rule-percent-' + ruleId);
    const descInput = document.getElementById('rule-desc-' + ruleId);
    if (!percentInput || !descInput) {
        console.error('Update input elements not found');
        showDiscogsStatus('Error: Input fields not found. Please refresh.', 'error');
        return;
    }
    const markup_percent = parseFloat(percentInput.value);
    const description = descInput.value;
    if (isNaN(markup_percent)) {
        showDiscogsStatus('Please enter a valid percentage', 'error');
        return;
    }
    try {
        const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules/' + ruleId, {
            method: 'PUT',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ markup_percent: markup_percent, description: description })
        });
        if (response.ok) {
            showDiscogsStatus('Markup rule updated successfully', 'success');
            loadMarkupRules();
            if (currentLocation) {
                await loadLocationRecords();
            }
        } else {
            const error = await response.json();
            showDiscogsStatus('Error: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('updateMarkupRule error:', error);
        showDiscogsStatus('Error: ' + error.message, 'error');
    }
};

window.deleteMarkupRule = async function(ruleId) {
    console.log('deleteMarkupRule called for rule', ruleId);
    if (!confirm('Are you sure you want to delete this markup rule?')) return;
    try {
        const response = await fetch(window.AppConfig.baseUrl + '/api/markup-rules/' + ruleId, {
            method: 'DELETE',
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : {}
        });
        if (response.ok) {
            showDiscogsStatus('Markup rule deleted successfully', 'success');
            loadMarkupRules();
            if (currentLocation) {
                await loadLocationRecords();
            }
        } else {
            const error = await response.json();
            showDiscogsStatus('Error: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('deleteMarkupRule error:', error);
        showDiscogsStatus('Error: ' + error.message, 'error');
    }
};

window.closeProgressModal = closeProgressModal;
window.refreshDiscogsLocations = loadLocations;

// ============================================================================
// Initialize default cutoff date (30 days ago)
// ============================================================================

function initializeLastSeenDate() {
    if (lastSeenCutoffDateInput) {
        const date = new Date();
        date.setDate(date.getDate() - 30);
        const defaultDate = date.toISOString().split('T')[0];
        lastSeenCutoffDateInput.value = defaultDate;
        lastSeenCutoffDate = defaultDate;
        console.log(`📅 Default last seen cutoff date set to: ${defaultDate} (30 days ago)`);
    }
}

// ============================================================================
// Initialization
// ============================================================================

window.initDiscogsTab = function() {
    console.log('🎵 Initializing Discogs Tab...');
    tableBody = document.getElementById('combined-inventory-body');
    discogsLocationSelect = document.getElementById('discogs-location-select');
    discogsPostButton = document.getElementById('post-location-button');
    discogsStatusMessage = document.getElementById('discogs-status-message');
    discogsSearchInput = document.getElementById('discogs-search-input');
    discogsSearchButton = document.getElementById('discogs-search-button');
    lastSeenCutoffDateInput = document.getElementById('last-seen-cutoff-date');
    applyLastSeenFilterBtn = document.getElementById('apply-last-seen-filter');
    if (!tableBody) {
        console.error('Table body element not found!');
        return;
    }
    if (!discogsLocationSelect) {
        console.error('Location select element not found!');
        return;
    }
    initializeLastSeenDate();
    if (applyLastSeenFilterBtn) {
        applyLastSeenFilterBtn.onclick = function() {
            applyLastSeenFilter();
        };
    }
    discogsLocationSelect.onchange = function() {
        console.log('Location changed to:', discogsLocationSelect.value);
        loadLocationRecords();
    };
    if (discogsSearchButton) {
        discogsSearchButton.onclick = function() {
            applyDiscogsSearchFilter();
        };
    }
    if (discogsSearchInput) {
        discogsSearchInput.onkeyup = function(e) {
            if (e.key === 'Enter') {
                applyDiscogsSearchFilter();
            }
        };
    }
    if (discogsPostButton) {
        discogsPostButton.onclick = function() {
            bulkPostToDiscogs();
        };
        discogsPostButton.disabled = true;
        discogsPostButton.style.opacity = '0.5';
        discogsPostButton.innerHTML = '<i class="fab fa-discogs"></i> Post to Discogs';
    }
    loadLocations();
    loadMarkupRules();
    const chartsContent = document.getElementById('markup-charts-content');
    if (chartsContent && chartsContent.style.display === 'block') {
        setTimeout(loadMarkupAnalysisCharts, 500);
    }
    tableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;">Select a bin/location to view records</td></tr>';
    console.log('✅ Discogs Tab initialized');
};

// ============================================================================
// Tab Activation Handler
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tabName === 'discogs') {
        console.log('🎵 Discogs tab activated, initializing...');
        setTimeout(window.initDiscogsTab, 100);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const discogsTab = document.querySelector('.tab[data-tab="discogs"]');
    if (discogsTab && discogsTab.classList.contains('active')) {
        setTimeout(window.initDiscogsTab, 200);
    }
});

console.log('✅ discogs.js loaded - Location-based bulk posting with last_seen filter, consignor items SKIPPED');
console.log('✅ Markup analysis charts loaded (3 charts: Curve, Distribution, Age Distribution)');
console.log('✅ postNewRecordsToDiscogs() updated - prompts for location, assigns ranks in reverse order, and marks Active');