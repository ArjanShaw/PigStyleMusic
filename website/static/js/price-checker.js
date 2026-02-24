// Price Checker Module
const PriceChecker = {
    csvData: [],
    results: [],
    
    init: function() {
        this.setupEventListeners();
    },
    
    setupEventListeners: function() {
        const fileInput = document.getElementById('csv-file');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.previewCSV(e.target.files[0]);
            });
        }
    },
    
    downloadTemplate: function() {
        const template = "Artist,Title,Catalog#,Price\nNirvana,Nevermind,DGC-24425,12.99\nPink Floyd,The Dark Side of the Moon,SHVL 804,15.99";
        const blob = new Blob([template], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'price-checker-template.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    },
    
    previewCSV: function(file) {
        if (!file) return;
        
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            preview: 5,
            complete: (results) => {
                const previewBody = document.getElementById('csv-preview-body');
                if (!previewBody) return;
                
                previewBody.innerHTML = '';
                
                results.data.forEach(row => {
                    const tr = document.createElement('tr');
                    
                    // Get values with case-insensitive column names
                    const artist = row.Artist || row.artist || '';
                    const title = row.Title || row.title || '';
                    const catalog = row['Catalog#'] || row.catalog || row.catalog_number || '';
                    const price = parseFloat(row.Price || row.price || 0) || 0;
                    
                    tr.innerHTML = `
                        <td>${artist}</td>
                        <td>${title}</td>
                        <td>${catalog}</td>
                        <td>$${price.toFixed(2)}</td>
                    `;
                    previewBody.appendChild(tr);
                });
                
                const previewDiv = document.getElementById('csv-preview');
                if (previewDiv) {
                    previewDiv.style.display = 'block';
                }
            },
            error: function(error) {
                console.error('CSV Parse Error:', error);
                alert('Error parsing CSV file. Please check the format.');
            }
        });
    },
    
    uploadAndCheckPrices: function() {
        const fileInput = document.getElementById('csv-file');
        const file = fileInput.files[0];
        
        if (!file) {
            alert('Please select a CSV file first');
            return;
        }
        
        // Show loading elements
        document.getElementById('price-checker-loading').style.display = 'block';
        document.getElementById('progress-section').style.display = 'block';
        document.getElementById('results-table-container').style.display = 'none';
        
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                this.csvData = results.data;
                document.getElementById('total-items').textContent = this.csvData.length;
                this.processCSVData();
            },
            error: function(error) {
                console.error('CSV Parse Error:', error);
                alert('Error parsing CSV file. Please check the format.');
                document.getElementById('price-checker-loading').style.display = 'none';
            }
        });
    },
    
    getAdvisedPrice: async function(artist, title, catalog) {
        try {
            // Use the existing price estimation endpoint from your dashboard
            const response = await fetch(`${AppConfig.baseUrl}/api/price-estimate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({
                    artist: artist,
                    title: title,
                    condition: 'Very Good Plus (VG+)', // Default condition for estimation
                    discogs_id: '',
                    catalog_number: catalog
                })
            });
            
            const data = await response.json();
            
            if (data.success || data.estimated_price || data.price) {
                // Extract the advised price
                let advisedPrice = 0;
                let priceSource = 'unknown';
                
                if (data.estimated_price) {
                    advisedPrice = data.estimated_price;
                    priceSource = data.price_source || 'estimated';
                } else if (data.price) {
                    advisedPrice = data.price;
                    priceSource = data.source || 'estimated';
                } else if (data.calculation && data.calculation.length > 0) {
                    // Parse the final price from calculation steps
                    const finalStep = data.calculation[data.calculation.length - 1];
                    const priceMatch = finalStep.match(/\$([\d.]+)/);
                    if (priceMatch) {
                        advisedPrice = parseFloat(priceMatch[1]);
                        priceSource = 'calculated';
                    }
                }
                
                return {
                    found: true,
                    price: advisedPrice,
                    priceSource: priceSource,
                    calculation: data.calculation || [],
                    ebaySummary: data.ebay_summary || null,
                    ebayListings: data.ebay_listings || []
                };
            }
            
            return { found: false };
            
        } catch (error) {
            console.error('Price estimation error:', error);
            return { found: false, error: error.message };
        }
    },
    
    processCSVData: async function() {
        this.results = [];
        let found = 0;
        let totalYourPrice = 0;
        let totalAdvisedPrice = 0;
        
        for (let i = 0; i < this.csvData.length; i++) {
            const row = this.csvData[i];
            
            // Get values with case-insensitive column names
            const artist = row.Artist || row.artist || '';
            const title = row.Title || row.title || '';
            const catalog = row['Catalog#'] || row.catalog || row.catalog_number || '';
            const yourPrice = parseFloat(row.Price || row.price || 0) || 0;
            
            totalYourPrice += yourPrice;
            
            // Update progress
            document.getElementById('progress-count').textContent = `${i + 1}/${this.csvData.length}`;
            document.getElementById('current-item').textContent = `Getting advised price: ${artist} - ${title}`;
            document.getElementById('progress-fill').style.width = `${((i + 1) / this.csvData.length) * 100}%`;
            
            // Get advised price from your existing endpoint
            const priceResult = await this.getAdvisedPrice(artist, title, catalog);
            
            if (priceResult && priceResult.found && priceResult.price > 0) {
                found++;
                
                const advisedPrice = priceResult.price;
                totalAdvisedPrice += advisedPrice;
                const diff = yourPrice - advisedPrice;
                
                this.results.push({
                    artist: artist,
                    title: title,
                    catalog: catalog,
                    yourPrice: yourPrice,
                    advisedPrice: advisedPrice,
                    priceSource: priceResult.priceSource || 'unknown',
                    difference: diff,
                    status: 'Price Available',
                    hasEbayData: !!(priceResult.ebaySummary || priceResult.ebayListings?.length > 0),
                    unique: false
                });
            } else {
                this.results.push({
                    artist: artist,
                    title: title,
                    catalog: catalog,
                    yourPrice: yourPrice,
                    advisedPrice: 0,
                    difference: 0,
                    status: priceResult && priceResult.error ? 'Error getting price' : 'No Price Data',
                    unique: true
                });
            }
            
            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // Update stats
        document.getElementById('found-items').textContent = found;
        document.getElementById('unique-items').textContent = this.results.filter(r => r.unique).length;
        
        // Calculate average difference safely
        const validDiffs = this.results.filter(r => r.advisedPrice > 0).map(r => r.difference);
        const avgDiff = validDiffs.length > 0 
            ? validDiffs.reduce((sum, val) => sum + val, 0) / validDiffs.length 
            : 0;
        document.getElementById('avg-diff').textContent = `$${avgDiff.toFixed(2)}`;
        
        this.displayResults(totalYourPrice, totalAdvisedPrice);
        
        // Hide loading, show results
        document.getElementById('price-checker-loading').style.display = 'none';
        document.getElementById('results-table-container').style.display = 'block';
    },
    
    displayResults: function(totalYourPrice, totalAdvisedPrice) {
        const tbody = document.getElementById('price-checker-body');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        this.results.forEach(r => {
            const tr = document.createElement('tr');
            
            // Determine status class
            let statusClass = 'status-badge ';
            if (r.status.includes('No Price') || r.status.includes('Error')) {
                statusClass += 'not-found';
            } else if (r.unique) {
                statusClass += 'unique';
            } else {
                statusClass += 'found';
            }
            
            // Format difference with sign and class
            let diffDisplay = 'N/A';
            let diffClass = '';
            if (r.advisedPrice > 0) {
                const diff = r.difference;
                diffDisplay = (diff > 0 ? '+' : '') + diff.toFixed(2);
                diffClass = diff > 0 ? 'price-diff-positive' : (diff < 0 ? 'price-diff-negative' : '');
            }
            
            // Add price source indicator
            let priceDisplay = r.advisedPrice > 0 ? '$' + r.advisedPrice.toFixed(2) : 'N/A';
            if (r.priceSource && r.priceSource !== 'unknown' && r.advisedPrice > 0) {
                let sourceIcon = '';
                if (r.priceSource.includes('ebay') || r.hasEbayData) {
                    sourceIcon = '🛒';
                } else if (r.priceSource.includes('discogs')) {
                    sourceIcon = '💿';
                }
                priceDisplay += ` <small style="font-size:10px; color:#666;">${sourceIcon} ${r.priceSource}</small>`;
            }
            
            tr.innerHTML = `
                <td>${this.escapeHtml(r.artist) || 'N/A'}</td>
                <td>${this.escapeHtml(r.title) || 'N/A'}</td>
                <td>${this.escapeHtml(r.catalog) || 'N/A'}</td>
                <td>$${r.yourPrice.toFixed(2)}</td>
                <td>${priceDisplay}</td>
                <td class="${diffClass}">${diffDisplay}</td>
                <td><span class="${statusClass}">${r.status}</span></td>
                <td>${r.hasEbayData ? '<span class="badge" style="background:#28a745; color:white; padding:2px 6px; border-radius:3px;">eBay Data</span>' : '—'}</td>
            `;
            
            tbody.appendChild(tr);
        });
        
        // Add summary row with batch totals
        if (this.results.length > 0) {
            const tr = document.createElement('tr');
            tr.style.background = '#f0f0f0';
            tr.style.fontWeight = 'bold';
            tr.innerHTML = `
                <td colspan="3"><strong>BATCH TOTAL</strong></td>
                <td><strong>$${totalYourPrice.toFixed(2)}</strong></td>
                <td><strong>$${totalAdvisedPrice.toFixed(2)}</strong></td>
                <td><strong class="${totalYourPrice - totalAdvisedPrice > 0 ? 'price-diff-positive' : 'price-diff-negative'}">
                    ${(totalYourPrice - totalAdvisedPrice > 0 ? '+' : '') + (totalYourPrice - totalAdvisedPrice).toFixed(2)}
                </strong></td>
                <td colspan="2"></td>
            `;
            tbody.appendChild(tr);
        }
    },
    
    // Helper to escape HTML and prevent XSS
    escapeHtml: function(text) {
        if (!text) return text;
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    exportResultsToCSV: function() {
        const csvData = this.results.map(r => ({
            Artist: r.artist,
            Title: r.title,
            Catalog: r.catalog,
            'Your Price': r.yourPrice.toFixed(2),
            'Advised Price': r.advisedPrice > 0 ? r.advisedPrice.toFixed(2) : 'N/A',
            Difference: r.advisedPrice > 0 ? (r.difference > 0 ? '+' : '') + r.difference.toFixed(2) : 'N/A',
            Status: r.status,
            'Price Source': r.priceSource || 'N/A',
            'Has eBay Data': r.hasEbayData ? 'Yes' : 'No'
        }));
        
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'price-checker-results.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    },
    
    // Reset the form
    resetForm: function() {
        document.getElementById('csv-file').value = '';
        document.getElementById('csv-preview').style.display = 'none';
        document.getElementById('csv-preview-body').innerHTML = '';
        document.getElementById('progress-section').style.display = 'none';
        document.getElementById('results-table-container').style.display = 'none';
        document.getElementById('price-checker-loading').style.display = 'none';
        this.csvData = [];
        this.results = [];
    }
};

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Price Checker module initializing...');
    
    // Make functions globally accessible
    window.uploadAndCheckPrices = () => PriceChecker.uploadAndCheckPrices();
    window.downloadTemplate = () => PriceChecker.downloadTemplate();
    window.exportResultsToCSV = () => PriceChecker.exportResultsToCSV();
    window.resetPriceChecker = () => PriceChecker.resetForm();
    
    // Initialize the module
    if (typeof PriceChecker !== 'undefined') {
        PriceChecker.init();
        console.log('Price Checker module initialized successfully');
    }
});