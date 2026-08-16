// admin/db_query/db-query.js
// Database Query Tool – functions for admin db-query tab

// ---- Helper: get API base ----
function getApiBase() {
    return (typeof AppConfig !== 'undefined' && AppConfig.baseUrl) ? AppConfig.baseUrl : '';
}

// ---- Refresh schema tree ----
function refreshSchema() {
    const tree = document.getElementById('schema-tree');
    tree.innerHTML = '<div style="text-align:center; padding:20px; color:#666;"><i class="fas fa-spinner fa-spin"></i><p>Loading schema...</p></div>';

    const url = getApiBase() + '/api/admin/db-schema';
    fetch(url, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (data.status !== 'success') {
                tree.innerHTML = `<div style="color:#dc3545; padding:20px;">Error: ${data.message || 'Failed to load schema'}</div>`;
                return;
            }
            const schema = data.schema;
            let html = '<ul style="list-style:none; padding:0; margin:0;">';
            for (const [table, columns] of Object.entries(schema.tables)) {
                html += `<li><strong>${table}</strong><ul style="list-style:none; padding-left:20px; margin:5px 0;">`;
                columns.forEach(col => {
                    const pk = col.is_primary ? ' 🔑' : '';
                    html += `<li>${col.column_name} (${col.data_type})${pk}</li>`;
                });
                html += '</ul></li>';
            }
            html += '</ul>';
            tree.innerHTML = html;

            // Also populate table dropdown in builder
            const tableSelect = document.getElementById('builder-table');
            if (tableSelect) {
                tableSelect.innerHTML = '<option value="">Select a table...</option>';
                for (const table of Object.keys(schema.tables)) {
                    tableSelect.innerHTML += `<option value="${table}">${table}</option>`;
                }
            }
        })
        .catch(err => {
            tree.innerHTML = `<div style="color:#dc3545; padding:20px;">Error loading schema: ${err.message}</div>`;
        });
}

// ---- Execute query ----
function executeQuery() {
    const queryEl = document.getElementById('sql-query');
    const query = queryEl.value.trim();
    const resultsEl = document.getElementById('query-results');
    const statsEl = document.getElementById('results-stats');

    if (!query) {
        resultsEl.innerHTML = '<div class="db-message">Please enter a SQL query.</div>';
        return;
    }

    statsEl.textContent = 'Executing...';
    resultsEl.innerHTML = '<div style="text-align:center; padding:20px; color:#666;"><i class="fas fa-spinner fa-spin"></i><p>Running query...</p></div>';

    const url = getApiBase() + '/api/admin/execute-query';
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query })
    })
        .then(res => res.json())
        .then(data => {
            if (data.status !== 'success') {
                statsEl.textContent = 'Error';
                resultsEl.innerHTML = `<div style="color:#dc3545; padding:20px;">${data.message || 'Query failed'}</div>`;
                return;
            }

            statsEl.textContent = `Rows: ${data.row_count || data.affected_rows || 0} | Time: ${data.execution_time || 0}ms`;

            if (data.query_type === 'SELECT' || data.query_type === 'PRAGMA') {
                const rows = data.results || [];
                if (rows.length === 0) {
                    resultsEl.innerHTML = '<div class="db-message">Query returned 0 rows.</div>';
                    return;
                }
                let tableHtml = '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
                // Header
                tableHtml += '<thead><tr>';
                const cols = Object.keys(rows[0]);
                cols.forEach(col => {
                    tableHtml += `<th style="border:1px solid #ddd; padding:6px; background:#f5f5f5; text-align:left;">${col}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';
                rows.forEach(row => {
                    tableHtml += '<tr>';
                    cols.forEach(col => {
                        const val = row[col] !== undefined && row[col] !== null ? row[col] : '';
                        tableHtml += `<td style="border:1px solid #ddd; padding:6px;">${val}</td>`;
                    });
                    tableHtml += '</tr>';
                });
                tableHtml += '</tbody></table>';
                resultsEl.innerHTML = tableHtml;
            } else {
                // INSERT / UPDATE / DELETE
                resultsEl.innerHTML = `<div style="color:#28a745; padding:20px;">${data.message || 'Query executed successfully'}<br>Affected rows: ${data.affected_rows || 0}</div>`;
            }

            // Update history count
            const historyEl = document.getElementById('query-history-count');
            if (historyEl) {
                let count = parseInt(historyEl.textContent) || 0;
                historyEl.textContent = count + 1;
            }
        })
        .catch(err => {
            statsEl.textContent = 'Error';
            resultsEl.innerHTML = `<div style="color:#dc3545; padding:20px;">Network error: ${err.message}</div>`;
        });
}

// ---- Format query (basic) ----
function formatQuery() {
    const el = document.getElementById('sql-query');
    if (!el) return;
    let sql = el.value.trim();
    // Simple formatting – split by keywords
    const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 'SET', 'VALUES', 'AND', 'OR'];
    let formatted = sql;
    keywords.forEach(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        formatted = formatted.replace(regex, `\n${kw.toUpperCase()}`);
    });
    // Clean extra newlines
    formatted = formatted.replace(/\n\s*\n/g, '\n');
    el.value = formatted.trim();
}

// ---- Handle Ctrl+Enter ----
function handleQueryKeydown(event) {
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        executeQuery();
    }
}

// ---- Query Builder ----
function updateBuilderFields() {
    const operation = document.getElementById('builder-operation').value;
    const colsField = document.getElementById('builder-columns-field');
    const valuesField = document.getElementById('builder-values-field');
    const whereField = document.getElementById('builder-where-field');
    const setField = document.getElementById('builder-set-field');

    // Hide all first
    colsField.style.display = 'none';
    valuesField.style.display = 'none';
    whereField.style.display = 'none';
    setField.style.display = 'none';

    if (operation === 'select') {
        colsField.style.display = 'block';
        whereField.style.display = 'block';
    } else if (operation === 'insert') {
        colsField.style.display = 'block';
        valuesField.style.display = 'block';
    } else if (operation === 'update') {
        setField.style.display = 'block';
        whereField.style.display = 'block';
    } else if (operation === 'delete') {
        whereField.style.display = 'block';
    }
}

function buildQuery() {
    const operation = document.getElementById('builder-operation').value;
    const table = document.getElementById('builder-table').value;
    if (!table) {
        alert('Please select a table.');
        return;
    }

    let query = '';
    const preview = document.getElementById('builder-preview');

    if (operation === 'select') {
        const cols = document.getElementById('builder-columns').value.trim() || '*';
        const where = document.getElementById('builder-where').value.trim();
        query = `SELECT ${cols} FROM ${table}`;
        if (where) query += ` WHERE ${where}`;
    } else if (operation === 'insert') {
        const cols = document.getElementById('builder-columns').value.trim();
        const vals = document.getElementById('builder-values').value.trim();
        if (!cols || !vals) {
            alert('Columns and Values are required for INSERT.');
            return;
        }
        query = `INSERT INTO ${table} (${cols}) VALUES (${vals})`;
    } else if (operation === 'update') {
        const set = document.getElementById('builder-set').value.trim();
        const where = document.getElementById('builder-where').value.trim();
        if (!set) {
            alert('SET clause is required for UPDATE.');
            return;
        }
        query = `UPDATE ${table} SET ${set}`;
        if (where) query += ` WHERE ${where}`;
    } else if (operation === 'delete') {
        const where = document.getElementById('builder-where').value.trim();
        if (!where) {
            alert('WHERE clause is required for DELETE.');
            return;
        }
        query = `DELETE FROM ${table} WHERE ${where}`;
    }

    preview.textContent = query;
    document.getElementById('sql-query').value = query;
}

function hideQueryBuilder() {
    document.getElementById('query-builder').style.display = 'none';
}

// ---- Show builder (if needed) ----
function showQueryBuilder() {
    document.getElementById('query-builder').style.display = 'block';
    updateBuilderFields();
}

// ---- Auto-load schema when tab is activated ----
document.addEventListener('DOMContentLoaded', function() {
    // If the db-query tab is active, load schema
    if (document.getElementById('db-query-tab') && document.getElementById('db-query-tab').classList.contains('active')) {
        refreshSchema();
    }
});

// Expose functions globally
window.refreshSchema = refreshSchema;
window.executeQuery = executeQuery;
window.formatQuery = formatQuery;
window.handleQueryKeydown = handleQueryKeydown;
window.updateBuilderFields = updateBuilderFields;
window.buildQuery = buildQuery;
window.hideQueryBuilder = hideQueryBuilder;
window.showQueryBuilder = showQueryBuilder;

console.log('✅ db-query.js loaded');