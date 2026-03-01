// static/js/db-query.js

// Database Query Tool Module
const DBQuery = {
    schema: null,
    queryHistory: [],
    currentResults: null,
    selectedTable: null,
    
    init: function() {
        console.log('Initializing DB Query module...');
        this.loadSchema();
        this.setupEventListeners();
    },
    
    setupEventListeners: function() {
        const queryArea = document.getElementById('sql-query');
        if (queryArea) {
            queryArea.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    this.executeQuery();
                }
            });
        }
    },
    
    loadSchema: async function() {
        const treeContainer = document.getElementById('schema-tree');
        if (!treeContainer) return;
        
        treeContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;"><i class="fas fa-spinner fa-spin"></i><p>Loading schema...</p></div>';
        
        try {
            // First check if user is logged in and is admin
            const authCheck = await this.checkAdminStatus();
            if (!authCheck.isAdmin) {
                treeContainer.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #dc3545;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>${authCheck.message || 'Admin access required'}</p>
                        <p style="font-size: 12px; margin-top: 10px;">
                            <a href="/login" style="color: #007bff;">Login as admin</a>
                        </p>
                    </div>
                `;
                return;
            }
            
            const response = await fetch(`${AppConfig.baseUrl}/api/admin/db-schema`, {
                method: 'GET',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            if (response.status === 403) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Admin access required');
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                this.schema = data.schema;
                this.renderSchemaTree();
                this.populateTableSelect();
            } else {
                throw new Error(data.message || 'Failed to load schema');
            }
        } catch (error) {
            console.error('Error loading schema:', error);
            treeContainer.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #dc3545; margin-bottom: 15px;"></i>
                    <p style="color: #dc3545; font-weight: bold;">Error loading schema</p>
                    <p style="color: #666; margin-top: 10px;">${error.message}</p>
                    <button class="btn btn-primary btn-small" onclick="DBQuery.loadSchema()" style="margin-top: 15px;">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;
        }
    },
    
    checkAdminStatus: async function() {
        try {
            const response = await fetch(`${AppConfig.baseUrl}/session/check`, {
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
            });
            
            if (response.ok) {
                const data = await response.json();
                return {
                    isAdmin: data.user?.role === 'admin',
                    message: data.user?.role === 'admin' ? 'Admin access granted' : 'Admin access required'
                };
            }
        } catch (error) {
            console.error('Error checking admin status:', error);
        }
        
        return { isAdmin: false, message: 'Unable to verify admin status' };
    },
    
    renderSchemaTree: function() {
        const treeContainer = document.getElementById('schema-tree');
        if (!treeContainer) return;
        
        if (!this.schema || !this.schema.tables || Object.keys(this.schema.tables).length === 0) {
            treeContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No tables found in database</div>';
            return;
        }
        
        let html = '';
        const sortedTables = Object.keys(this.schema.tables).sort();
        
        sortedTables.forEach(tableName => {
            const columns = this.schema.tables[tableName];
            html += `
                <div class="db-tree-item">
                    <div class="db-tree-table" onclick="DBQuery.toggleTableColumns('${tableName}')" id="table-${tableName}">
                        <i class="fas fa-table"></i>
                        <span>${tableName}</span>
                        <span style="margin-left: auto; font-size: 11px; color: #666;">${columns.length} cols</span>
                    </div>
                    <div class="db-tree-columns" id="columns-${tableName}" style="display: none;">
            `;
            
            columns.forEach(column => {
                const isPrimary = column.is_primary ? ' <span style="color: #ffc107;" title="Primary Key">🔑</span>' : '';
                html += `
                    <div class="db-tree-column" onclick="DBQuery.insertColumnName('${column.column_name}')" title="Click to insert '${column.column_name}' in query">
                        <i class="fas fa-columns"></i>
                        <span>${column.column_name}${isPrimary}</span>
                        <span class="column-type">${column.data_type}${column.is_nullable === 'YES' ? ' NULL' : ''}</span>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });
        
        treeContainer.innerHTML = html;
    },
    
    toggleTableColumns: function(tableName) {
        const columnsDiv = document.getElementById(`columns-${tableName}`);
        const tableDiv = document.getElementById(`table-${tableName}`);
        
        if (!columnsDiv || !tableDiv) return;
        
        if (columnsDiv.style.display === 'none' || columnsDiv.style.display === '') {
            columnsDiv.style.display = 'block';
            tableDiv.classList.add('expanded');
        } else {
            columnsDiv.style.display = 'none';
            tableDiv.classList.remove('expanded');
        }
    },
    
    insertColumnName: function(columnName) {
        const queryArea = document.getElementById('sql-query');
        if (!queryArea) return;
        
        const cursorPos = queryArea.selectionStart;
        const textBefore = queryArea.value.substring(0, cursorPos);
        const textAfter = queryArea.value.substring(cursorPos);
        
        queryArea.value = textBefore + columnName + textAfter;
        queryArea.focus();
        queryArea.selectionStart = cursorPos + columnName.length;
        queryArea.selectionEnd = cursorPos + columnName.length;
    },
    
    refreshSchema: function() {
        this.loadSchema();
    },
    
    executeQuery: async function() {
        const query = document.getElementById('sql-query').value.trim();
        if (!query) {
            this.showResults('Please enter a query', 'warning');
            return;
        }
        
        // Add to history
        this.queryHistory.unshift({
            query: query,
            timestamp: new Date().toISOString()
        });
        if (this.queryHistory.length > 50) this.queryHistory.pop();
        
        const historyCount = document.getElementById('query-history-count');
        if (historyCount) {
            historyCount.textContent = this.queryHistory.length;
        }
        
        // Show loading
        const resultsDiv = document.getElementById('query-results');
        if (!resultsDiv) return;
        
        resultsDiv.innerHTML = `
            <div class="loading" style="padding: 20px;">
                <div class="loading-spinner"></div>
                <p>Executing query...</p>
            </div>
        `;
        
        try {
            const response = await fetch(`${AppConfig.baseUrl}/api/admin/execute-query`, {
                method: 'POST',
                credentials: 'include',
                headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ query: query })
            });
            
            if (response.status === 403) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Admin access required');
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                this.displayResults(data);
            } else {
                this.showResults(data.message || 'Query failed', 'error');
            }
        } catch (error) {
            console.error('Error executing query:', error);
            this.showResults(`Error: ${error.message}`, 'error');
        }
    },
    
    displayResults: function(data) {
        const resultsDiv = document.getElementById('query-results');
        const statsEl = document.getElementById('results-stats');
        
        if (!resultsDiv || !statsEl) return;
        
        if (data.query_type === 'SELECT' && data.results && data.results.length > 0) {
            // Display SELECT results in a table with horizontal scroll
            const columns = Object.keys(data.results[0]);
            let html = `
                <div class="db-results-table-container">
                    <table class="db-results-table">
                        <thead>
                            <tr>
                                ${columns.map(col => `<th>${col}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            data.results.forEach(row => {
                html += '<tr>';
                columns.forEach(col => {
                    let value = row[col];
                    if (value === null || value === undefined) {
                        value = '<span style="color: #999; font-style: italic;">NULL</span>';
                    } else if (typeof value === 'object') {
                        try {
                            value = JSON.stringify(value);
                        } catch (e) {
                            value = String(value);
                        }
                    }
                    // Truncate very long values but keep them in one line for scrolling
                    const stringValue = String(value);
                    const displayValue = stringValue.length > 100 ? stringValue.substring(0, 100) + '…' : stringValue;
                    html += `<td title="${stringValue.replace(/"/g, '&quot;')}">${displayValue}</td>`;
                });
                html += '</tr>';
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            
            resultsDiv.innerHTML = html;
            statsEl.innerHTML = `<i class="fas fa-check-circle" style="color: #28a745;"></i> ${data.results.length} rows returned in ${data.execution_time}ms`;
            
        } else {
            // Display message for non-SELECT queries
            const message = data.message || 'Query executed successfully';
            const affectedRows = data.affected_rows ? ` (${data.affected_rows} rows affected)` : '';
            const lastId = data.last_insert_id ? `, Last ID: ${data.last_insert_id}` : '';
            
            resultsDiv.innerHTML = `
                <div class="db-message success">
                    <i class="fas fa-check-circle"></i>
                    <div>
                        <strong>Success:</strong> ${message}${affectedRows}${lastId}
                        ${data.execution_time ? `<br><small>Execution time: ${data.execution_time}ms</small>` : ''}
                    </div>
                </div>
            `;
            
            statsEl.innerHTML = `<i class="fas fa-check-circle" style="color: #28a745;"></i> ${data.affected_rows || 0} rows affected`;
        }
        
        // Add to results for potential export
        this.currentResults = data;
    },
    
    showResults: function(message, type = 'info') {
        const resultsDiv = document.getElementById('query-results');
        const statsEl = document.getElementById('results-stats');
        
        if (!resultsDiv || !statsEl) return;
        
        const icons = {
            info: 'fa-info-circle',
            success: 'fa-check-circle',
            warning: 'fa-exclamation-triangle',
            error: 'fa-times-circle'
        };
        
        const colors = {
            info: '#17a2b8',
            success: '#28a745',
            warning: '#ffc107',
            error: '#dc3545'
        };
        
        resultsDiv.innerHTML = `
            <div class="db-message" style="border-left: 4px solid ${colors[type]}; background: ${type === 'error' ? '#f8d7da' : type === 'warning' ? '#fff3cd' : '#e3f2fd'};">
                <i class="fas ${icons[type]}" style="color: ${colors[type]};"></i>
                <span>${message}</span>
            </div>
        `;
        
        statsEl.innerHTML = `<i class="fas ${icons[type]}" style="color: ${colors[type]};"></i> ${message}`;
    },
    
    formatQuery: function() {
        const queryArea = document.getElementById('sql-query');
        if (!queryArea) return;
        
        let query = queryArea.value.trim();
        
        // Basic SQL formatting
        const keywords = ['SELECT', 'FROM', 'WHERE', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 
                         'SET', 'VALUES', 'ORDER BY', 'GROUP BY', 'HAVING', 'JOIN', 
                         'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'LIMIT'];
        
        keywords.forEach(keyword => {
            const regex = new RegExp(keyword, 'gi');
            query = query.replace(regex, '\n' + keyword.toUpperCase());
        });
        
        // Clean up multiple newlines
        query = query.replace(/\n\s*\n/g, '\n');
        
        queryArea.value = query;
    },
    
    populateTableSelect: function() {
        const select = document.getElementById('builder-table');
        if (!select || !this.schema || !this.schema.tables) return;
        
        let options = '<option value="">Select a table...</option>';
        Object.keys(this.schema.tables).sort().forEach(table => {
            options += `<option value="${table}">${table}</option>`;
        });
        
        select.innerHTML = options;
    },
    
    showQueryBuilder: function() {
        const builder = document.getElementById('query-builder');
        if (builder) {
            builder.style.display = 'block';
        }
    },
    
    hideQueryBuilder: function() {
        const builder = document.getElementById('query-builder');
        if (builder) {
            builder.style.display = 'none';
        }
    },
    
    updateBuilderFields: function() {
        const operation = document.getElementById('builder-operation');
        const table = document.getElementById('builder-table');
        
        if (!operation || !table) return;
        
        // Hide all optional fields first
        const fields = ['builder-columns-field', 'builder-values-field', 'builder-where-field', 'builder-set-field'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        // Show relevant fields based on operation
        switch(operation.value) {
            case 'select':
                document.getElementById('builder-where-field').style.display = 'block';
                break;
            case 'insert':
                document.getElementById('builder-columns-field').style.display = 'block';
                document.getElementById('builder-values-field').style.display = 'block';
                break;
            case 'update':
                document.getElementById('builder-set-field').style.display = 'block';
                document.getElementById('builder-where-field').style.display = 'block';
                break;
            case 'delete':
                document.getElementById('builder-where-field').style.display = 'block';
                break;
        }
        
        // Update preview if table is selected
        if (table.value) {
            this.updateBuilderPreview();
        }
    },
    
    updateBuilderPreview: function() {
        const operation = document.getElementById('builder-operation');
        const table = document.getElementById('builder-table');
        const columns = document.getElementById('builder-columns');
        const values = document.getElementById('builder-values');
        const where = document.getElementById('builder-where');
        const set = document.getElementById('builder-set');
        
        if (!operation || !table) return;
        
        let preview = '';
        
        switch(operation.value) {
            case 'select':
                preview = `SELECT * FROM ${table.value}`;
                if (where && where.value) preview += `\nWHERE ${where.value}`;
                preview += ';';
                break;
            case 'insert':
                preview = `INSERT INTO ${table.value}`;
                if (columns && columns.value) preview += `\n(${columns.value})`;
                if (values && values.value) preview += `\nVALUES (${values.value});`;
                break;
            case 'update':
                preview = `UPDATE ${table.value}`;
                if (set && set.value) preview += `\nSET ${set.value}`;
                if (where && where.value) preview += `\nWHERE ${where.value};`;
                break;
            case 'delete':
                preview = `DELETE FROM ${table.value}`;
                if (where && where.value) preview += `\nWHERE ${where.value};`;
                else preview += '; -- WARNING: No WHERE clause!';
                break;
        }
        
        const previewEl = document.getElementById('builder-preview');
        if (previewEl) {
            previewEl.textContent = preview;
        }
    },
    
    buildQuery: function() {
        const preview = document.getElementById('builder-preview');
        if (preview && preview.textContent) {
            document.getElementById('sql-query').value = preview.textContent;
            this.hideQueryBuilder();
        }
    }
};

// Initialize when the tab is switched to
function switchTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab
    const selectedTab = document.getElementById(`${tabId}-tab`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Update active tab styling
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Find and highlight the clicked tab
    const tabs = document.querySelectorAll('.tab');
    for (let tab of tabs) {
        if (tab.textContent.includes(tabId.replace('-', ' ')) || 
            tab.innerHTML.includes(tabId)) {
            tab.classList.add('active');
            break;
        }
    }
    
    // Initialize DB Query tab if selected
    if (tabId === 'db-query') {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            DBQuery.init();
        }, 100);
    }
}

// Make functions globally available
window.DBQuery = DBQuery;
window.refreshSchema = () => DBQuery.refreshSchema();
window.executeQuery = () => DBQuery.executeQuery();
window.formatQuery = () => DBQuery.formatQuery();
window.handleQueryKeydown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        DBQuery.executeQuery();
    }
};
window.showQueryBuilder = () => DBQuery.showQueryBuilder();
window.hideQueryBuilder = () => DBQuery.hideQueryBuilder();
window.updateBuilderFields = () => DBQuery.updateBuilderFields();
window.buildQuery = () => DBQuery.buildQuery();

console.log('DB Query module loaded with API endpoints:', {
    schema: `${AppConfig.baseUrl}/api/admin/db-schema`,
    execute: `${AppConfig.baseUrl}/api/admin/execute-query`
});