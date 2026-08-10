// ============================================================
// admin-feedback.js - Feedback Management for Admin Panel
// ============================================================

let feedbackData = [];
let feedbackPage = 1;
let feedbackPageSize = 50;

// ============================================================
// MAIN FUNCTIONS
// ============================================================

/**
 * Load feedback from the server with current filters and pagination
 */
async function loadFeedback() {
    console.log('📋 Loading feedback...');
    
    try {
        const status = document.getElementById('feedback-status-filter')?.value || 'all';
        const type = document.getElementById('feedback-type-filter')?.value || 'all';
        const search = document.getElementById('feedback-search')?.value || '';
        
        const params = new URLSearchParams({
            page: feedbackPage,
            per_page: feedbackPageSize,
            status: status,
            type: type,
            search: search
        });
        
        const response = await fetch(`${AppConfig.baseUrl}/api/feedback?${params}`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            feedbackData = data.feedback || [];
            renderFeedbackTable(feedbackData);
            updateFeedbackStats(data);
            updateFeedbackPagination(data);
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Error loading feedback:', error);
        document.getElementById('feedback-body').innerHTML = `
            <tr><td colspan="8" style="text-align:center;padding:40px;color:#dc3545;">
                <i class="fas fa-exclamation-triangle"></i> Error loading feedback: ${escapeHtml(error.message)}
            </td></tr>
        `;
    }
}

/**
 * Render the feedback table with the given data
 */
function renderFeedbackTable(feedback) {
    const tbody = document.getElementById('feedback-body');
    
    if (!feedback || feedback.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8" style="text-align:center;padding:40px;color:#999;">
                <i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:15px;"></i>
                No feedback found
            </td></tr>
        `;
        return;
    }
    
    let html = '';
    feedback.forEach(item => {
        const statusClass = {
            'new': 'status-badge order-unread',
            'read': 'status-badge order-read',
            'responded': 'status-badge order-completed',
            'archived': 'status-badge order-archived'
        }[item.status] || 'status-badge';
        
        const statusLabel = item.status || 'new';
        const typeIcon = {
            'general': '💬',
            'event': '📅',
            'suggestion': '💡',
            'complaint': '⚠️'
        }[item.type_of_feedback] || '📝';
        
        const isNew = item.status === 'new' || item.notified === 0;
        
        html += `
            <tr class="${isNew ? 'order-row-unread' : ''}">
                <td>${item.id}</td>
                <td>${typeIcon} ${escapeHtml(item.type_of_feedback || 'general')}</td>
                <td style="max-width:200px;word-wrap:break-word;">${escapeHtml(item.content || '')}</td>
                <td>${item.contact_info ? escapeHtml(item.contact_info) : '—'}</td>
                <td>${item.event_name ? escapeHtml(item.event_name) : '—'}</td>
                <td><span class="${statusClass}">${escapeHtml(statusLabel)}</span></td>
                <td>${formatDate(item.created_at)}</td>
                <td>
                    <div class="table-actions">
                        <button class="table-action-btn" onclick="viewFeedback(${item.id})" title="View">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${item.status !== 'read' && item.status !== 'responded' ? `
                            <button class="table-action-btn" onclick="markFeedbackRead(${item.id})" title="Mark Read">
                                <i class="fas fa-check"></i>
                            </button>
                        ` : ''}
                        ${item.contact_info ? `
                            <button class="table-action-btn" onclick="replyToFeedback(${item.id})" title="Reply" style="color:#28a745;">
                                <i class="fas fa-reply"></i>
                            </button>
                        ` : ''}
                        <button class="table-action-btn delete-btn" onclick="archiveFeedback(${item.id})" title="Archive">
                            <i class="fas fa-archive"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

/**
 * Update the stats row with counts
 */
function updateFeedbackStats(data) {
    const total = data.total || 0;
    document.getElementById('feedback-total').textContent = total;
    
    // Count statuses from the data
    const feedback = data.feedback || [];
    const newCount = feedback.filter(f => f.status === 'new').length;
    const readCount = feedback.filter(f => f.status === 'read').length;
    const respondedCount = feedback.filter(f => f.status === 'responded').length;
    
    document.getElementById('feedback-new').textContent = newCount;
    document.getElementById('feedback-read').textContent = readCount;
    document.getElementById('feedback-responded').textContent = respondedCount;
}

/**
 * Update pagination controls
 */
function updateFeedbackPagination(data) {
    const total = data.total || 0;
    const totalPages = Math.ceil(total / feedbackPageSize) || 1;
    
    document.getElementById('feedback-showing-start').textContent = Math.min((feedbackPage - 1) * feedbackPageSize + 1, total || 0);
    document.getElementById('feedback-showing-end').textContent = Math.min(feedbackPage * feedbackPageSize, total || 0);
    document.getElementById('feedback-total-filtered').textContent = total;
    document.getElementById('feedback-current-page').textContent = feedbackPage;
    document.getElementById('feedback-total-pages').textContent = totalPages;
    
    document.getElementById('feedback-prev-page').disabled = feedbackPage <= 1;
    document.getElementById('feedback-next-page').disabled = feedbackPage >= totalPages;
}

// ============================================================
// ACTION FUNCTIONS
// ============================================================

/**
 * Mark a single feedback as read
 */
async function markFeedbackRead(id) {
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/feedback/${id}/mark-read`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (response.ok) {
            showNotification('Feedback marked as read', 'success');
            loadFeedback();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to mark as read', 'error');
        }
    } catch (error) {
        console.error('Error marking feedback read:', error);
        showNotification('Error marking as read', 'error');
    }
}

/**
 * Mark all feedback as read
 */
async function markAllFeedbackRead() {
    if (!confirm('Mark all feedback as read?')) return;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/feedback/mark-all-read`, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (response.ok) {
            showNotification('All feedback marked as read', 'success');
            loadFeedback();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to mark all as read', 'error');
        }
    } catch (error) {
        console.error('Error marking all feedback read:', error);
        showNotification('Error marking all as read', 'error');
    }
}

/**
 * Archive a feedback item
 */
async function archiveFeedback(id) {
    if (!confirm('Archive this feedback?')) return;
    
    try {
        const response = await fetch(`${AppConfig.baseUrl}/api/feedback/${id}/status`, {
            method: 'PUT',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {},
            body: JSON.stringify({ status: 'archived' })
        });
        
        if (response.ok) {
            showNotification('Feedback archived', 'success');
            loadFeedback();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to archive', 'error');
        }
    } catch (error) {
        console.error('Error archiving feedback:', error);
        showNotification('Error archiving feedback', 'error');
    }
}

/**
 * Open email client to reply to feedback
 */
function replyToFeedback(id) {
    const item = feedbackData.find(f => f.id === id);
    if (!item || !item.contact_info) {
        showNotification('No contact info available', 'error');
        return;
    }
    
    // Open email client
    const subject = encodeURIComponent(`Re: Feedback from PigStyle Music (ID: ${id})`);
    const body = encodeURIComponent(`\n\n---\nOriginal feedback:\n${item.content}\n---`);
    window.location.href = `mailto:${item.contact_info}?subject=${subject}&body=${body}`;
}

/**
 * View feedback in a modal
 */
function viewFeedback(id) {
    const item = feedbackData.find(f => f.id === id);
    if (!item) {
        showNotification('Feedback not found', 'error');
        return;
    }
    
    // Show modal with feedback details
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.id = 'feedback-detail-modal';
    
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:600px;">
            <div class="modal-header">
                <h3><i class="fas fa-comment"></i> Feedback #${item.id}</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div class="modal-body">
                <div style="margin-bottom:15px;">
                    <strong>Type:</strong> ${escapeHtml(item.type_of_feedback || 'general')}
                </div>
                <div style="margin-bottom:15px;">
                    <strong>Status:</strong> ${escapeHtml(item.status || 'new')}
                </div>
                <div style="margin-bottom:15px;">
                    <strong>Content:</strong><br>
                    <div style="background:#f8f9fa;padding:12px;border-radius:4px;margin-top:5px;white-space:pre-wrap;">${escapeHtml(item.content || '')}</div>
                </div>
                ${item.contact_info ? `
                    <div style="margin-bottom:15px;">
                        <strong>Contact Info:</strong> ${escapeHtml(item.contact_info)}
                    </div>
                ` : ''}
                ${item.event_name ? `
                    <div style="margin-bottom:15px;">
                        <strong>Event:</strong> ${escapeHtml(item.event_name)}
                    </div>
                ` : ''}
                <div style="margin-bottom:15px;">
                    <strong>Created:</strong> ${formatDate(item.created_at)}
                </div>
                ${item.notified !== undefined ? `
                    <div style="margin-bottom:15px;">
                        <strong>Read:</strong> ${item.notified ? '✅ Yes' : '❌ No'}
                    </div>
                ` : ''}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                ${item.contact_info ? `
                    <button class="btn btn-primary" onclick="replyToFeedback(${item.id}); this.closest('.modal-overlay').remove();">
                        <i class="fas fa-reply"></i> Reply
                    </button>
                ` : ''}
                ${item.status !== 'archived' ? `
                    <button class="btn btn-warning" onclick="archiveFeedback(${item.id}); this.closest('.modal-overlay').remove();">
                        <i class="fas fa-archive"></i> Archive
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Close on overlay click
    overlay.addEventListener('click', function(e) {
        if (e.target === this) {
            this.remove();
        }
    });
}

// ============================================================
// FILTER FUNCTIONS
// ============================================================

function applyFeedbackFilters() {
    feedbackPage = 1;
    loadFeedback();
}

function clearFeedbackFilters() {
    document.getElementById('feedback-search').value = '';
    document.getElementById('feedback-status-filter').value = 'all';
    document.getElementById('feedback-type-filter').value = 'all';
    feedbackPage = 1;
    loadFeedback();
}

// ============================================================
// EXPORT FUNCTIONS
// ============================================================

function exportFeedbackCSV() {
    if (!feedbackData || feedbackData.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }
    
    const headers = ['ID', 'Type', 'Content', 'Contact Info', 'Event', 'Status', 'Created', 'Read'];
    let csv = headers.join(',') + '\n';
    
    feedbackData.forEach(item => {
        const row = [
            item.id,
            item.type_of_feedback || 'general',
            `"${(item.content || '').replace(/"/g, '""')}"`,
            `"${(item.contact_info || '').replace(/"/g, '""')}"`,
            `"${(item.event_name || '').replace(/"/g, '""')}"`,
            item.status || 'new',
            item.created_at || '',
            item.notified ? 'Yes' : 'No'
        ];
        csv += row.join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('CSV exported successfully', 'success');
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return dateString;
    }
}

function showNotification(message, type) {
    const n = document.createElement('div');
    n.className = 'notification';
    n.textContent = message;
    n.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
        background: ${type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#28a745'};
        color: ${type === 'warning' ? '#333' : 'white'};
    `;
    document.body.appendChild(n);
    setTimeout(() => {
        n.style.opacity = '0';
        n.style.transition = 'opacity 0.3s';
        setTimeout(() => n.remove(), 300);
    }, 3000);
}

// ============================================================
// PAGINATION EVENT BINDING
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    // Previous page
    document.getElementById('feedback-prev-page')?.addEventListener('click', function() {
        if (feedbackPage > 1) {
            feedbackPage--;
            loadFeedback();
        }
    });
    
    // Next page
    document.getElementById('feedback-next-page')?.addEventListener('click', function() {
        feedbackPage++;
        loadFeedback();
    });
    
    // Page size change
    document.getElementById('feedback-page-size')?.addEventListener('change', function() {
        feedbackPageSize = parseInt(this.value);
        feedbackPage = 1;
        loadFeedback();
    });
    
    // Enter key on search
    document.getElementById('feedback-search')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyFeedbackFilters();
        }
    });
});

// ============================================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ============================================================

window.loadFeedback = loadFeedback;
window.markFeedbackRead = markFeedbackRead;
window.markAllFeedbackRead = markAllFeedbackRead;
window.archiveFeedback = archiveFeedback;
window.replyToFeedback = replyToFeedback;
window.viewFeedback = viewFeedback;
window.applyFeedbackFilters = applyFeedbackFilters;
window.clearFeedbackFilters = clearFeedbackFilters;
window.exportFeedbackCSV = exportFeedbackCSV;

console.log('✅ admin-feedback.js loaded successfully');