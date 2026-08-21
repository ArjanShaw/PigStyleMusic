// admin/events/events.js – with parent_event_id support for overrides
// Includes credentials: 'include' for authentication

function getApiBase() {
    if (typeof AppConfig !== 'undefined' && AppConfig.baseUrl) {
        return AppConfig.baseUrl;
    }
    return '';
}

// ===== POPULATE PARENT DROPDOWN =====
function populateParentDropdown(events) {
    const select = document.getElementById('event-parent-select');
    if (!select) return;
    
    // Clear existing options (keep first one)
    select.innerHTML = '<option value="">-- Select a recurring event --</option>';
    
    // Find all recurring events (parent_event_id is null or 0)
    const recurringEvents = events.filter(e => 
        e.repeat_type && e.repeat_type !== 'none' && 
        (!e.parent_event_id || e.parent_event_id === 0)
    );
    
    recurringEvents.forEach(e => {
        const option = document.createElement('option');
        option.value = e.id;
        option.textContent = `#${e.id} - ${e.title} (${e.repeat_type})`;
        select.appendChild(option);
    });
}

// ===== LOAD EVENTS =====
function loadEventsAdmin() {
    const tbody = document.getElementById('events-admin-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    const url = getApiBase() + '/api/events';
    fetch(url, {
        credentials: 'include',
        headers: {
            'Accept': 'application/json'
        }
    })
        .then(res => {
            if (res.status === 401) {
                throw new Error('Session expired. Please refresh the page and login again.');
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                // Populate the parent dropdown with recurring events
                populateParentDropdown(data.events);
                
                let html = '';
                data.events.forEach(ev => {
                    const imageHtml = ev.image_url ? `<img src="${ev.image_url}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;">` : '—';
                    
                    // Determine event type
                    const isOverride = ev.parent_event_id !== null && ev.parent_event_id !== undefined && ev.parent_event_id !== 0;
                    const isRecurring = ev.repeat_type && ev.repeat_type !== 'none' && !isOverride;
                    
                    let typeHtml = '—';
                    if (isOverride) {
                        typeHtml = `<span style="color: #ffc107; font-weight: 600;">🔁 Override</span>`;
                    } else if (isRecurring) {
                        typeHtml = `<span style="color: #28a745; font-weight: 600;">🔄 ${ev.repeat_type}</span>`;
                    }
                    
                    html += `
                        <tr style="${isOverride ? 'background: #fff8e1;' : ''}">
                            <td>${ev.id}${isOverride ? ' <span style="font-size:10px; color:#999;">(override)</span>' : ''}</td>
                            <td>${imageHtml}</td>
                            <td><strong>${escapeHtml(ev.title)}</strong></td>
                            <td>${new Date(ev.event_date).toLocaleString()}</td>
                            <td>${escapeHtml(ev.description || '').substring(0, 50)}${(ev.description || '').length > 50 ? '...' : ''}</td>
                            <td>${ev.rsvp_count || 0}</td>
                            <td>${typeHtml}</td>
                            <td>
                                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                                    <button class="btn btn-sm btn-primary" onclick="editEvent(${ev.id})" title="Edit"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-sm btn-secondary" onclick="duplicateEvent(${ev.id})" title="Duplicate"><i class="fas fa-copy"></i></button>
                                    ${!isOverride && isRecurring ? `<button class="btn btn-sm btn-warning" onclick="createOverride(${ev.id})" title="Create Override"><i class="fas fa-pen"></i></button>` : ''}
                                    <button class="btn btn-sm btn-danger" onclick="deleteEvent(${ev.id})" title="Delete"><i class="fas fa-trash"></i></button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html || '<tr><td colspan="8" style="text-align:center; padding:20px;">No events found.</td></tr>';
            } else {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#dc3545;">Failed to load events.</td></tr>';
            }
        })
        .catch((err) => {
            console.error('Load events error:', err);
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#dc3545;">Error loading events: ${err.message}</td></tr>`;
        });
}

// ===== SAVE EVENT =====
function saveEvent() {
    const id = document.getElementById('event-id').value;
    const title = document.getElementById('event-title').value.trim();
    const event_date = document.getElementById('event-date').value;
    const description = document.getElementById('event-description').value.trim();
    const image_url = document.getElementById('event-image-url').value;
    const repeat_type = document.getElementById('event-repeat-type').value;
    const parent_select = document.getElementById('event-parent-select');
    const parent_event_id = parent_select ? parent_select.value : '';
    const existing_parent = document.getElementById('event-parent-id').value;

    if (!title || !event_date) {
        showEventStatus('Title and Date are required.', 'error');
        return;
    }

    const payload = {
        title,
        event_date,
        description,
        image_url,
        repeat_type
    };

    // If parent is selected from dropdown OR hidden field has parent_id (for editing overrides)
    const finalParentId = parent_event_id || existing_parent;
    if (finalParentId) {
        payload.parent_event_id = parseInt(finalParentId);
        payload.repeat_type = 'none'; // Overrides should never be recurring
    }

    const base = getApiBase();
    const url = id ? `${base}/api/events/${id}` : `${base}/api/events`;
    const method = id ? 'PUT' : 'POST';

    console.log('Saving event:', { url, method, payload });

    fetch(url, {
        method: method,
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (res.status === 401) {
            throw new Error('Session expired. Please refresh the page and login again.');
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    })
    .then(data => {
        if (data.status === 'success') {
            showEventStatus('Event saved successfully.', 'success');
            clearEventForm();
            loadEventsAdmin();
        } else {
            showEventStatus(data.error || 'Save failed.', 'error');
        }
    })
    .catch(err => {
        console.error('Save error:', err);
        showEventStatus('Error: ' + err.message, 'error');
    });
}

// ===== DELETE EVENT =====
function deleteEvent(id) {
    if (!confirm('Are you sure you want to delete this event?')) return;
    const base = getApiBase();
    fetch(`${base}/api/events/${id}`, { 
        method: 'DELETE',
        credentials: 'include'
    })
        .then(res => {
            if (res.status === 401) {
                throw new Error('Session expired. Please refresh and login again.');
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                loadEventsAdmin();
                showEventStatus('Event deleted.', 'success');
            } else {
                showEventStatus('Delete failed.', 'error');
            }
        })
        .catch(err => {
            console.error('Delete error:', err);
            showEventStatus('Error: ' + err.message, 'error');
        });
}

// ===== EDIT EVENT =====
function editEvent(id) {
    const base = getApiBase();
    fetch(`${base}/api/events/${id}`, {
        credentials: 'include'
    })
        .then(res => {
            if (res.status === 401) {
                throw new Error('Session expired. Please refresh and login again.');
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                const ev = data.event;
                const isOverride = ev.parent_event_id !== null && ev.parent_event_id !== undefined && ev.parent_event_id !== 0;
                
                document.getElementById('event-id').value = ev.id;
                document.getElementById('event-title').value = ev.title;
                document.getElementById('event-date').value = ev.event_date.slice(0, 16);
                document.getElementById('event-description').value = ev.description || '';
                document.getElementById('event-image-url').value = ev.image_url || '';
                document.getElementById('event-repeat-type').value = ev.repeat_type || 'none';
                
                // Handle parent_event_id
                if (isOverride) {
                    document.getElementById('event-parent-id').value = ev.parent_event_id;
                    document.getElementById('override-info-group').style.display = 'block';
                    document.getElementById('override-parent-id-display').textContent = ev.parent_event_id;
                    document.getElementById('event-form-title').textContent = 'Edit Override';
                    document.getElementById('event-submit-btn').textContent = 'Update Override';
                    // Disable repeat type for overrides
                    document.getElementById('event-repeat-type').disabled = true;
                    document.getElementById('event-repeat-type').value = 'none';
                    // Hide the parent dropdown since we're editing an override
                    document.getElementById('parent-event-group').style.display = 'none';
                } else {
                    document.getElementById('event-parent-id').value = '';
                    document.getElementById('override-info-group').style.display = 'none';
                    document.getElementById('event-form-title').textContent = 'Edit Event';
                    document.getElementById('event-submit-btn').textContent = 'Update Event';
                    document.getElementById('event-repeat-type').disabled = false;
                    // Show parent dropdown if repeat type is 'none'
                    const parentGroup = document.getElementById('parent-event-group');
                    if (ev.repeat_type === 'none' || !ev.repeat_type) {
                        parentGroup.style.display = 'block';
                    } else {
                        parentGroup.style.display = 'none';
                    }
                }
                
                if (ev.image_url) {
                    document.getElementById('event-image-preview').style.display = 'block';
                    document.getElementById('event-image-preview-img').src = ev.image_url;
                }
                
                document.querySelector('.user-form-section').scrollIntoView({ behavior: 'smooth' });
            }
        })
        .catch(err => {
            console.error('Edit error:', err);
            showEventStatus('Failed to load event: ' + err.message, 'error');
        });
}

// ===== CREATE OVERRIDE (from button) =====
function createOverride(parentId) {
    const base = getApiBase();
    fetch(`${base}/api/events/${parentId}`, {
        credentials: 'include'
    })
        .then(res => {
            if (res.status === 401) {
                throw new Error('Session expired. Please refresh and login again.');
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                const ev = data.event;
                
                // Clear the form
                clearEventForm();
                
                // Set as override
                document.getElementById('event-parent-id').value = parentId;
                document.getElementById('event-title').value = ev.title;
                // Set date to next occurrence if in the past
                const nextDate = new Date(ev.event_date);
                if (nextDate < new Date()) {
                    if (ev.repeat_type === 'weekly') {
                        nextDate.setDate(nextDate.getDate() + 7);
                    } else if (ev.repeat_type === 'monthly') {
                        nextDate.setMonth(nextDate.getMonth() + 1);
                    }
                }
                document.getElementById('event-date').value = nextDate.toISOString().slice(0, 16);
                document.getElementById('event-description').value = ev.description || '';
                document.getElementById('event-image-url').value = ev.image_url || '';
                document.getElementById('event-repeat-type').value = 'none';
                document.getElementById('event-repeat-type').disabled = true;
                
                // Show override info
                document.getElementById('override-info-group').style.display = 'block';
                document.getElementById('override-parent-id-display').textContent = parentId;
                document.getElementById('event-form-title').textContent = 'Create Override';
                document.getElementById('event-submit-btn').textContent = 'Save Override';
                // Hide parent dropdown since we're creating from button
                document.getElementById('parent-event-group').style.display = 'none';
                
                if (ev.image_url) {
                    document.getElementById('event-image-preview').style.display = 'block';
                    document.getElementById('event-image-preview-img').src = ev.image_url;
                }
                
                document.querySelector('.user-form-section').scrollIntoView({ behavior: 'smooth' });
                
                showEventStatus('Creating override for event #' + parentId + '. Edit details as needed.', 'info');
            }
        })
        .catch(err => {
            console.error('Create override error:', err);
            showEventStatus('Failed to load parent event: ' + err.message, 'error');
        });
}

// ===== REMOVE OVERRIDE =====
function removeOverride() {
    if (!confirm('Remove this override and revert to the base event?')) return;
    
    const id = document.getElementById('event-id').value;
    if (!id) return;
    
    const base = getApiBase();
    fetch(`${base}/api/events/${id}`, { 
        method: 'DELETE',
        credentials: 'include'
    })
        .then(res => {
            if (res.status === 401) {
                throw new Error('Session expired. Please refresh and login again.');
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                showEventStatus('Override removed, reverted to base event.', 'success');
                clearEventForm();
                loadEventsAdmin();
            } else {
                showEventStatus('Failed to remove override.', 'error');
            }
        })
        .catch(err => {
            console.error('Remove override error:', err);
            showEventStatus('Error: ' + err.message, 'error');
        });
}

// ===== DUPLICATE EVENT =====
function duplicateEvent(id) {
    const base = getApiBase();
    fetch(`${base}/api/events/${id}`, {
        credentials: 'include'
    })
        .then(res => {
            if (res.status === 401) {
                throw new Error('Session expired. Please refresh and login again.');
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                const ev = data.event;
                const isOverride = ev.parent_event_id !== null && ev.parent_event_id !== undefined && ev.parent_event_id !== 0;
                
                clearEventForm();
                document.getElementById('event-title').value = 'Copy of ' + ev.title;
                document.getElementById('event-date').value = ev.event_date.slice(0, 16);
                document.getElementById('event-description').value = ev.description || '';
                document.getElementById('event-image-url').value = ev.image_url || '';
                document.getElementById('event-repeat-type').value = isOverride ? 'none' : (ev.repeat_type || 'none');
                document.getElementById('event-repeat-type').disabled = isOverride;
                
                if (isOverride) {
                    document.getElementById('event-parent-id').value = '';
                    document.getElementById('override-info-group').style.display = 'none';
                    document.getElementById('parent-event-group').style.display = 'none';
                    showEventStatus('Duplicating an override - created as a new event.', 'info');
                } else {
                    // Show parent dropdown if repeat type is 'none'
                    const parentGroup = document.getElementById('parent-event-group');
                    if (ev.repeat_type === 'none' || !ev.repeat_type) {
                        parentGroup.style.display = 'block';
                    } else {
                        parentGroup.style.display = 'none';
                    }
                }
                
                document.getElementById('event-form-title').textContent = 'Duplicate Event';
                document.getElementById('event-submit-btn').textContent = 'Save as New Event';
                if (ev.image_url) {
                    document.getElementById('event-image-preview').style.display = 'block';
                    document.getElementById('event-image-preview-img').src = ev.image_url;
                }
                document.querySelector('.user-form-section').scrollIntoView({ behavior: 'smooth' });
            }
        })
        .catch(err => {
            console.error('Duplicate error:', err);
            showEventStatus('Failed to load event: ' + err.message, 'error');
        });
}

// ===== CLEAR FORM =====
function clearEventForm() {
    document.getElementById('event-id').value = '';
    document.getElementById('event-parent-id').value = '';
    document.getElementById('event-title').value = '';
    document.getElementById('event-date').value = '';
    document.getElementById('event-description').value = '';
    document.getElementById('event-image-url').value = '';
    document.getElementById('event-repeat-type').value = 'none';
    document.getElementById('event-repeat-type').disabled = false;
    document.getElementById('event-form-title').textContent = 'Add New Event';
    document.getElementById('event-submit-btn').textContent = 'Save Event';
    document.getElementById('event-image-preview').style.display = 'none';
    document.getElementById('event-image-preview-img').src = '';
    document.getElementById('event-form-status').style.display = 'none';
    document.getElementById('override-info-group').style.display = 'none';
    document.getElementById('override-parent-id-display').textContent = '';
    document.getElementById('parent-event-group').style.display = 'none';
    document.getElementById('event-parent-select').value = '';
}

// ===== IMAGE UPLOAD =====
function uploadEventImage(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showEventStatus('Image too large. Maximum size is 5MB.', 'error');
        input.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('event-image-preview').style.display = 'block';
        document.getElementById('event-image-preview-img').src = e.target.result;
        document.getElementById('event-image-url').value = e.target.result;
    };
    reader.onerror = function() {
        showEventStatus('Failed to read image file.', 'error');
    };
    reader.readAsDataURL(file);
}

function removeEventImage() {
    document.getElementById('event-image-preview').style.display = 'none';
    document.getElementById('event-image-preview-img').src = '';
    document.getElementById('event-image-url').value = '';
    document.getElementById('event-image-upload').value = '';
}

// ===== STATUS MESSAGES =====
function showEventStatus(msg, type) {
    const el = document.getElementById('event-form-status');
    el.textContent = msg;
    el.className = 'status-message status-' + type;
    el.style.display = 'block';
    
    // Auto-hide after 5 seconds for success/info messages
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => {
                el.style.display = 'none';
                el.style.opacity = '1';
            }, 500);
        }, 5000);
    }
}

// ===== HELPERS =====
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showRecurringEvents() {
    // Filter the table to show only recurring events
    const rows = document.querySelectorAll('#events-admin-body tr');
    let count = 0;
    rows.forEach(row => {
        const typeCell = row.querySelector('td:nth-child(7)');
        if (typeCell) {
            const isRecurring = typeCell.textContent.includes('🔄');
            row.style.display = isRecurring ? '' : 'none';
            if (isRecurring) count++;
        }
    });
    showEventStatus(`Showing ${count} recurring events. Click Refresh to show all.`, 'info');
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', function() {
    // Load events
    if (document.getElementById('events-admin-body')) {
        loadEventsAdmin();
    }
    
    // Show/hide parent dropdown based on repeat type
    const repeatSelect = document.getElementById('event-repeat-type');
    const parentGroup = document.getElementById('parent-event-group');
    
    if (repeatSelect && parentGroup) {
        repeatSelect.addEventListener('change', function() {
            if (this.value === 'none') {
                // Show parent dropdown only when "None" is selected
                // and we're not editing an override
                const isOverride = document.getElementById('event-parent-id').value !== '';
                if (!isOverride) {
                    parentGroup.style.display = 'block';
                }
            } else {
                parentGroup.style.display = 'none';
                document.getElementById('event-parent-select').value = '';
            }
        });
    }
});

// Also re-load when the events tab is clicked
document.addEventListener('tabChanged', function(e) {
    if (e.detail && e.detail.tab === 'events') {
        loadEventsAdmin();
    }
});

// Expose functions globally
window.loadEventsAdmin = loadEventsAdmin;
window.saveEvent = saveEvent;
window.deleteEvent = deleteEvent;
window.editEvent = editEvent;
window.createOverride = createOverride;
window.removeOverride = removeOverride;
window.duplicateEvent = duplicateEvent;
window.clearEventForm = clearEventForm;
window.uploadEventImage = uploadEventImage;
window.removeEventImage = removeEventImage;
window.showEventStatus = showEventStatus;
window.showRecurringEvents = showRecurringEvents;
window.escapeHtml = escapeHtml;
window.populateParentDropdown = populateParentDropdown;

console.log('✅ events.js loaded (with parent_event_id support and Option 1 dropdown)');