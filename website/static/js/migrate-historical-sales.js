// ============================================================================
// migrate-historical-sales.js - One-Time Data Migration Script
// Imports historical sales from Square and Discogs exports
// ============================================================================

(function() {
    'use strict';

    console.log('📊 migrate-historical-sales.js loading...');

    // ========== API Helper ==========
    async function apiRequest(method, endpoint, body) {
        const options = {
            method: method,
            credentials: 'include',
            headers: window.AppConfig.getHeaders ? window.AppConfig.getHeaders() : { 'Content-Type': 'application/json' }
        };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(window.AppConfig.baseUrl + endpoint, options);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
    }

    // ========== Parse Date Helpers ==========
    function parseDate(dateStr) {
        if (!dateStr) return null;
        
        // Try various formats
        const formats = [
            /^(\d{4})-(\d{2})-(\d{2})/,           // YYYY-MM-DD
            /^(\d{2})\/(\d{2})\/(\d{4})/,           // MM/DD/YYYY
            /^(\d{2})\/(\d{2})\/(\d{2})/,           // MM/DD/YY
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,       // M/D/YYYY
            /^(\d{4})(\d{2})(\d{2})/                // YYYYMMDD
        ];

        for (const format of formats) {
            const match = dateStr.match(format);
            if (match) {
                if (format === formats[0]) {
                    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
                } else if (format === formats[1] || format === formats[3]) {
                    return new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
                } else if (format === formats[2]) {
                    const year = parseInt(match[3]) + (parseInt(match[3]) < 70 ? 2000 : 1900);
                    return new Date(year, parseInt(match[1]) - 1, parseInt(match[2]));
                } else if (format === formats[4]) {
                    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
                }
            }
        }

        // Try native parsing
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date;
        }

        return null;
    }

    function formatDateForAPI(date) {
        if (!date) return null;
        if (typeof date === 'string') return date;
        return date.toISOString().split('T')[0];
    }

    // ========== Parse Square Sales Export ==========
    function parseSquareSalesExport(csvText) {
        console.log('📊 parseSquareSalesExport() called, text length:', csvText.length);

        return new Promise((resolve, reject) => {
            if (typeof Papa === 'undefined') {
                reject(new Error('PapaParse library not loaded. Please include papaparse.min.js'));
                return;
            }

            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                trimHeaders: true,
                complete: function(results) {
                    console.log('📊 Square CSV parsed:', results.data.length, 'rows');
                    
                    if (results.errors && results.errors.length > 0) {
                        console.warn('CSV parsing errors:', results.errors);
                    }

                    const sales = [];
                    const seenIds = new Set();

                    results.data.forEach(row => {
                        // Look for sale data in various columns
                        const saleId = row['Transaction ID'] || row['Payment ID'] || row['Order ID'] || row['ID'];
                        const dateStr = row['Date'] || row['Created At'] || row['Transaction Date'] || row['Settlement Date'];
                        const amount = parseFloat(row['Amount'] || row['Total'] || row['Gross Amount'] || 0);
                        const description = row['Description'] || row['Note'] || row['Memo'] || '';
                        const paymentMethod = row['Payment Method'] || row['Method'] || row['Type'] || 'square';
                        const customerName = row['Customer'] || row['Buyer'] || row['Customer Name'] || '';
                        const itemDescription = row['Item'] || row['Product'] || row['Description'] || '';
                        const catalogNumber = row['Catalog Number'] || row['SKU'] || row['Item Code'] || '';

                        // Skip rows without sale ID or zero amount
                        if (!saleId || amount === 0) return;
                        if (seenIds.has(saleId)) return;
                        seenIds.add(saleId);

                        // Parse date
                        const date = parseDate(dateStr);
                        if (!date) {
                            console.warn('Could not parse date:', dateStr);
                            return;
                        }

                        // Map payment method
                        const methodMap = {
                            'cash': 'cash',
                            'square': 'square',
                            'paypal': 'paypal',
                            'discogs': 'discogs',
                            'gift card': 'giftcard',
                            'store credit': 'store_credit'
                        };
                        const method = methodMap[paymentMethod.toLowerCase()] || 'square';

                        sales.push({
                            id: saleId,
                            date: formatDateForAPI(date),
                            amount: amount,
                            description: description || itemDescription || 'Sale',
                            payment_method: method,
                            customer_name: customerName,
                            catalog_number: catalogNumber,
                            raw: row
                        });
                    });

                    console.log('📊 Found', sales.length, 'sales records');
                    resolve(sales);
                },
                error: function(error) {
                    reject(new Error('CSV parsing error: ' + error.message));
                }
            });
        });
    }

    // ========== Parse Discogs Sales Export ==========
    function parseDiscogsSalesExport(csvText) {
        console.log('📊 parseDiscogsSalesExport() called, text length:', csvText.length);

        return new Promise((resolve, reject) => {
            if (typeof Papa === 'undefined') {
                reject(new Error('PapaParse library not loaded. Please include papaparse.min.js'));
                return;
            }

            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                trimHeaders: true,
                complete: function(results) {
                    console.log('📊 Discogs CSV parsed:', results.data.length, 'rows');
                    
                    if (results.errors && results.errors.length > 0) {
                        console.warn('CSV parsing errors:', results.errors);
                    }

                    const sales = [];
                    const seenIds = new Set();

                    results.data.forEach(row => {
                        // Look for sale data in various columns
                        const saleId = row['Order ID'] || row['Order #'] || row['ID'];
                        const dateStr = row['Date'] || row['Order Date'] || row['Created At'] || row['Payment Date'];
                        const amount = parseFloat(row['Amount'] || row['Total'] || row['Price'] || 0);
                        const description = row['Description'] || row['Item'] || row['Release'] || '';
                        const buyerName = row['Buyer'] || row['Username'] || row['Customer'] || '';
                        const catalogNumber = row['Catalog #'] || row['Catalog Number'] || row['SKU'] || '';
                        const orderStatus = row['Status'] || row['Order Status'] || '';

                        // Skip rows without sale ID or zero amount
                        if (!saleId || amount === 0) return;
                        if (seenIds.has(saleId)) return;
                        seenIds.add(saleId);

                        // Parse date
                        const date = parseDate(dateStr);
                        if (!date) {
                            console.warn('Could not parse date:', dateStr);
                            return;
                        }

                        sales.push({
                            id: saleId,
                            date: formatDateForAPI(date),
                            amount: amount,
                            description: description || 'Discogs Sale',
                            payment_method: 'discogs',
                            customer_name: buyerName,
                            catalog_number: catalogNumber,
                            order_status: orderStatus,
                            raw: row
                        });
                    });

                    console.log('📊 Found', sales.length, 'Discogs sales records');
                    resolve(sales);
                },
                error: function(error) {
                    reject(new Error('CSV parsing error: ' + error.message));
                }
            });
        });
    }

    // ========== Process Historical Sales ==========
    async function processHistoricalSales(sales, options = {}) {
        console.log('📊 processHistoricalSales() called with', sales.length, 'sales');

        const {
            createEntries = true,
            dryRun = false,
            batchSize = 10,
            onProgress = null
        } = options;

        const results = [];
        let processed = 0;
        let created = 0;
        let skipped = 0;
        let failed = 0;

        for (let i = 0; i < sales.length; i += batchSize) {
            const batch = sales.slice(i, i + batchSize);
            
            for (const sale of batch) {
                processed++;
                
                try {
                    if (dryRun) {
                        // Just log what would be created
                        console.log(`[DRY RUN] Would create sale entry: ${sale.id} - $${sale.amount}`);
                        results.push({
                            success: true,
                            sale: sale,
                            dryRun: true,
                            message: 'Dry run - would create entry'
                        });
                        continue;
                    }

                    // Check if sale already exists
                    const existing = await checkExistingSale(sale.id);
                    if (existing) {
                        console.log(`Sale ${sale.id} already exists, skipping`);
                        skipped++;
                        results.push({
                            success: true,
                            sale: sale,
                            skipped: true,
                            message: 'Already exists'
                        });
                        continue;
                    }

                    // Create the sale entry
                    const result = await createHistoricalSaleEntry(sale);
                    if (result.success) {
                        created++;
                        results.push({
                            success: true,
                            sale: sale,
                            result: result,
                            message: 'Created successfully'
                        });
                    } else {
                        failed++;
                        results.push({
                            success: false,
                            sale: sale,
                            error: result.error,
                            message: 'Failed: ' + result.error
                        });
                    }

                } catch (error) {
                    failed++;
                    console.error(`Error processing sale ${sale.id}:`, error);
                    results.push({
                        success: false,
                        sale: sale,
                        error: error.message,
                        message: 'Error: ' + error.message
                    });
                }

                // Report progress
                if (onProgress) {
                    onProgress({
                        processed: processed,
                        total: sales.length,
                        created: created,
                        skipped: skipped,
                        failed: failed,
                        percent: Math.round((processed / sales.length) * 100)
                    });
                }

                // Small delay to avoid rate limiting
                if (!dryRun) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }

        return {
            total: sales.length,
            processed: processed,
            created: created,
            skipped: skipped,
            failed: failed,
            results: results
        };
    }

    // ========== Check Existing Sale ==========
    async function checkExistingSale(saleId) {
        try {
            const data = await apiRequest('GET', `/api/accounting/journal?search=${encodeURIComponent(saleId)}&per_page=1`);
            if (data.status === 'success' && data.entries && data.entries.length > 0) {
                // Check if any entry has this source_id
                for (const entry of data.entries) {
                    if (entry.source_id === saleId && entry.source_type === 'order') {
                        return entry;
                    }
                }
            }
            return null;
        } catch (error) {
            console.warn('Error checking existing sale:', error);
            return null;
        }
    }

    // ========== Create Historical Sale Entry ==========
    async function createHistoricalSaleEntry(sale) {
        try {
            // Map payment method to account codes
            const accountMap = {
                'cash': { debit: '1015', credit: '4001' },
                'square': { debit: '1030', credit: '4000' },
                'paypal': { debit: '1020', credit: '4003' },
                'discogs': { debit: '1020', credit: '4003' },
                'giftcard': { debit: '2015', credit: '4001' },
                'store_credit': { debit: '2015', credit: '4001' }
            };

            const mapping = accountMap[sale.payment_method] || accountMap['square'];

            // Get account IDs
            const accounts = await apiRequest('GET', '/api/accounting/accounts');
            const debitAccount = accounts.accounts.find(a => a.code === mapping.debit);
            const creditAccount = accounts.accounts.find(a => a.code === mapping.credit);

            if (!debitAccount || !creditAccount) {
                throw new Error(`Accounts not found: ${mapping.debit} or ${mapping.credit}`);
            }

            // Create the journal entry
            const entryData = {
                date: sale.date,
                description: `Historical Sale - ${sale.description || 'Sale'} - ${sale.id}`,
                source_type: 'order',
                source_id: sale.id,
                lines: [
                    { account_id: debitAccount.id, debit: sale.amount, credit: 0 },
                    { account_id: creditAccount.id, debit: 0, credit: sale.amount }
                ]
            };

            const result = await apiRequest('POST', '/api/accounting/manual', entryData);
            
            if (result.status === 'success') {
                return {
                    success: true,
                    entry_id: result.entry_id,
                    sale: sale
                };
            } else {
                throw new Error(result.error || 'Failed to create entry');
            }

        } catch (error) {
            console.error('Error creating historical sale entry:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ========== UI Functions ==========
    function showMigrationUI() {
        // Check if UI already exists
        let container = document.getElementById('migration-container');
        if (container) {
            container.style.display = 'block';
            return;
        }

        // Find a place to put it
        const reconTab = document.getElementById('reconciliation-tab-content');
        if (!reconTab) {
            // Create standalone UI
            container = document.createElement('div');
            container.id = 'migration-container';
            container.style.cssText = 'max-width: 800px; margin: 20px auto; padding: 20px; background: white; border-radius: 8px; border: 1px solid #ddd;';
            document.body.appendChild(container);
        } else {
            container = document.createElement('div');
            container.id = 'migration-container';
            reconTab.appendChild(container);
        }

        container.innerHTML = `
            <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border-radius: 8px; border: 1px solid #ffeeba;">
                <h3 style="color: #856404; margin-bottom: 15px;">
                    <i class="fas fa-history"></i> Historical Sales Migration
                </h3>
                <p style="color: #856404; margin-bottom: 15px;">
                    <strong>⚠️ One-time migration tool.</strong> Import historical sales from Square or Discogs exports.
                    This will create journal entries for past sales.
                </p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
                        <h4 style="color: #333;"><i class="fab fa-square"></i> Square Export</h4>
                        <p style="color: #666; font-size: 13px;">Upload Square transaction CSV</p>
                        <input type="file" id="square-export-upload" accept=".csv" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        <button class="btn btn-primary btn-sm" onclick="window.importSquareHistorical()" style="margin-top: 10px; width: 100%;">
                            <i class="fas fa-upload"></i> Import Square Sales
                        </button>
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
                        <h4 style="color: #333;"><i class="fab fa-discogs"></i> Discogs Export</h4>
                        <p style="color: #666; font-size: 13px;">Upload Discogs order CSV</p>
                        <input type="file" id="discogs-export-upload" accept=".csv" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        <button class="btn btn-primary btn-sm" onclick="window.importDiscogsHistorical()" style="margin-top: 10px; width: 100%;">
                            <i class="fas fa-upload"></i> Import Discogs Sales
                        </button>
                    </div>
                </div>

                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn btn-secondary" onclick="window.runDryRun()">
                        <i class="fas fa-flask"></i> Dry Run (Preview Only)
                    </button>
                    <button class="btn btn-danger" onclick="window.clearMigrationData()">
                        <i class="fas fa-trash"></i> Clear Migration Data
                    </button>
                </div>

                <div id="migration-status" class="status-message" style="display: none; margin-top: 15px;"></div>
                
                <div id="migration-progress" style="display: none; margin-top: 15px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span id="migration-progress-text">0%</span>
                        <span id="migration-progress-count">0 / 0</span>
                    </div>
                    <div style="background: #e9ecef; border-radius: 8px; height: 20px; overflow: hidden;">
                        <div id="migration-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #28a745, #20c997); transition: width 0.3s;"></div>
                    </div>
                </div>

                <div id="migration-results" style="display: none; margin-top: 15px; max-height: 400px; overflow-y: auto;"></div>
            </div>
        `;

        container.style.display = 'block';
    }

    // ========== Import Handlers ==========
    window.importSquareHistorical = async function() {
        const fileInput = document.getElementById('square-export-upload');
        const statusEl = document.getElementById('migration-status');
        
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            showMigrationStatus('Please select a Square CSV file.', 'warning');
            return;
        }

        const file = fileInput.files[0];
        showMigrationStatus('⏳ Parsing Square CSV...', 'info');

        try {
            const reader = new FileReader();
            const csvText = await new Promise((resolve, reject) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            });

            const sales = await parseSquareSalesExport(csvText);
            if (sales.length === 0) {
                showMigrationStatus('No sales found in CSV.', 'warning');
                return;
            }

            // Store sales for processing
            window._migrationSales = sales;
            window._migrationType = 'square';
            
            showMigrationStatus(`Found ${sales.length} sales. Click "Run Migration" to import.`, 'success');
            showMigrationProgress(0, sales.length);

            // Show preview
            showMigrationPreview(sales);

        } catch (error) {
            showMigrationStatus('❌ Error: ' + error.message, 'error');
            console.error(error);
        }
    };

    window.importDiscogsHistorical = async function() {
        const fileInput = document.getElementById('discogs-export-upload');
        const statusEl = document.getElementById('migration-status');
        
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            showMigrationStatus('Please select a Discogs CSV file.', 'warning');
            return;
        }

        const file = fileInput.files[0];
        showMigrationStatus('⏳ Parsing Discogs CSV...', 'info');

        try {
            const reader = new FileReader();
            const csvText = await new Promise((resolve, reject) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            });

            const sales = await parseDiscogsSalesExport(csvText);
            if (sales.length === 0) {
                showMigrationStatus('No sales found in CSV.', 'warning');
                return;
            }

            window._migrationSales = sales;
            window._migrationType = 'discogs';
            
            showMigrationStatus(`Found ${sales.length} sales. Click "Run Migration" to import.`, 'success');
            showMigrationProgress(0, sales.length);

            // Show preview
            showMigrationPreview(sales);

        } catch (error) {
            showMigrationStatus('❌ Error: ' + error.message, 'error');
            console.error(error);
        }
    };

    // ========== Show Migration Preview ==========
    function showMigrationPreview(sales) {
        const resultsEl = document.getElementById('migration-results');
        if (!resultsEl) return;

        const previewSales = sales.slice(0, 50);
        let html = `
            <div style="margin-bottom: 10px;">
                <strong>Preview (first ${previewSales.length} of ${sales.length}):</strong>
            </div>
            <div style="max-height: 300px; overflow-y: auto;">
                <table class="records-table" style="font-size: 12px;">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Payment Method</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        previewSales.forEach(sale => {
            html += `
                <tr>
                    <td>${sale.id}</td>
                    <td>${sale.date}</td>
                    <td>$${sale.amount.toFixed(2)}</td>
                    <td>${sale.payment_method}</td>
                    <td>${sale.description || '—'}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
            <div style="margin-top: 10px;">
                <button class="btn btn-success" onclick="window.runMigration()">
                    <i class="fas fa-play"></i> Run Migration (${sales.length} sales)
                </button>
                <button class="btn btn-secondary" onclick="window.runDryRun()">
                    <i class="fas fa-flask"></i> Dry Run
                </button>
            </div>
        `;

        resultsEl.style.display = 'block';
        resultsEl.innerHTML = html;
    }

    // ========== Run Migration ==========
    window.runMigration = async function() {
        const sales = window._migrationSales;
        if (!sales || sales.length === 0) {
            showMigrationStatus('No sales data to migrate. Please import a CSV first.', 'warning');
            return;
        }

        if (!confirm(`Are you sure you want to migrate ${sales.length} historical sales?\n\nThis will create journal entries for each sale.`)) {
            return;
        }

        showMigrationStatus('⏳ Running migration...', 'info');
        showMigrationProgress(0, sales.length);

        try {
            const result = await processHistoricalSales(sales, {
                dryRun: false,
                onProgress: function(progress) {
                    showMigrationProgress(progress.percent, sales.length);
                    showMigrationStatus(
                        `⏳ Processing... ${progress.processed}/${progress.total} | Created: ${progress.created} | Skipped: ${progress.skipped} | Failed: ${progress.failed}`,
                        'info'
                    );
                }
            });

            // Show results
            showMigrationResults(result);
            
            if (result.failed === 0) {
                showMigrationStatus(`✅ Migration complete! ${result.created} entries created.`, 'success');
            } else {
                showMigrationStatus(`⚠️ Migration complete with ${result.failed} failures. ${result.created} created.`, 'warning');
            }

        } catch (error) {
            showMigrationStatus('❌ Error: ' + error.message, 'error');
            console.error(error);
        }
    };

    // ========== Dry Run ==========
    window.runDryRun = async function() {
        const sales = window._migrationSales;
        if (!sales || sales.length === 0) {
            showMigrationStatus('No sales data to preview. Please import a CSV first.', 'warning');
            return;
        }

        showMigrationStatus(`⏳ Running dry run for ${sales.length} sales...`, 'info');
        showMigrationProgress(0, sales.length);

        try {
            const result = await processHistoricalSales(sales, {
                dryRun: true,
                onProgress: function(progress) {
                    showMigrationProgress(progress.percent, sales.length);
                }
            });

            showMigrationStatus(`✅ Dry run complete. Would create ${result.processed} entries.`, 'success');
            showMigrationResults(result);

        } catch (error) {
            showMigrationStatus('❌ Error: ' + error.message, 'error');
            console.error(error);
        }
    };

    // ========== Show Migration Results ==========
    function showMigrationResults(result) {
        const resultsEl = document.getElementById('migration-results');
        if (!resultsEl) return;

        let html = `
            <div style="margin-bottom: 15px;">
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
                    <div style="background: #d4edda; padding: 10px; border-radius: 4px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold; color: #155724;">${result.created}</div>
                        <div style="font-size: 12px; color: #155724;">Created</div>
                    </div>
                    <div style="background: #fff3cd; padding: 10px; border-radius: 4px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold; color: #856404;">${result.skipped}</div>
                        <div style="font-size: 12px; color: #856404;">Skipped</div>
                    </div>
                    <div style="background: #f8d7da; padding: 10px; border-radius: 4px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold; color: #721c24;">${result.failed}</div>
                        <div style="font-size: 12px; color: #721c24;">Failed</div>
                    </div>
                    <div style="background: #cce5ff; padding: 10px; border-radius: 4px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold; color: #004085;">${result.total}</div>
                        <div style="font-size: 12px; color: #004085;">Total</div>
                    </div>
                </div>
            </div>
        `;

        // Show failed entries if any
        const failedEntries = result.results.filter(r => !r.success);
        if (failedEntries.length > 0) {
            html += `
                <div style="margin-bottom: 10px;">
                    <strong style="color: #dc3545;">Failed Entries (${failedEntries.length}):</strong>
                </div>
                <div style="max-height: 200px; overflow-y: auto;">
                    <table class="records-table" style="font-size: 12px;">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Error</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            failedEntries.forEach(r => {
                html += `
                    <tr>
                        <td>${r.sale ? r.sale.id : 'Unknown'}</td>
                        <td style="color: #dc3545;">${r.error || r.message || 'Unknown error'}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }

        // Show dry run preview
        if (result.results.length > 0 && result.results[0].dryRun) {
            html += `
                <div style="margin-top: 15px; padding: 10px; background: #cce5ff; border-radius: 4px;">
                    <strong>Dry Run Mode:</strong> No entries were actually created.
                </div>
            `;
        }

        resultsEl.style.display = 'block';
        resultsEl.innerHTML = html;
    }

    // ========== UI Helpers ==========
    function showMigrationStatus(message, type) {
        const el = document.getElementById('migration-status');
        if (!el) return;
        
        type = type || 'info';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = (icons[type] || 'ℹ️') + ' ' + message;
        el.className = 'status-message status-' + type;
        el.style.display = 'block';
    }

    function showMigrationProgress(percent, total) {
        const container = document.getElementById('migration-progress');
        const bar = document.getElementById('migration-progress-bar');
        const text = document.getElementById('migration-progress-text');
        const count = document.getElementById('migration-progress-count');

        if (!container) return;

        container.style.display = 'block';
        
        if (bar) bar.style.width = Math.min(percent, 100) + '%';
        if (text) text.textContent = Math.round(percent) + '%';
        if (count) count.textContent = Math.round((percent / 100) * total) + ' / ' + total;
    }

    window.clearMigrationData = function() {
        window._migrationSales = null;
        window._migrationType = null;
        
        const resultsEl = document.getElementById('migration-results');
        if (resultsEl) {
            resultsEl.style.display = 'none';
            resultsEl.innerHTML = '';
        }
        
        const progressEl = document.getElementById('migration-progress');
        if (progressEl) {
            progressEl.style.display = 'none';
        }
        
        showMigrationStatus('Migration data cleared.', 'info');
    };

    // ========== Initialize ==========
    function initMigration() {
        console.log('📊 initMigration() called');
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                showMigrationUI();
            });
        } else {
            showMigrationUI();
        }
    }

    // ========== Expose Functions ==========
    window.parseSquareSalesExport = parseSquareSalesExport;
    window.parseDiscogsSalesExport = parseDiscogsSalesExport;
    window.processHistoricalSales = processHistoricalSales;
    window.createHistoricalSaleEntry = createHistoricalSaleEntry;
    window.initMigration = initMigration;
    window.showMigrationUI = showMigrationUI;

    // Auto-initialize if reconciliation tab is available
    if (document.getElementById('reconciliation-tab-content')) {
        setTimeout(initMigration, 800);
    }

    console.log('✅ migrate-historical-sales.js loaded');

})();