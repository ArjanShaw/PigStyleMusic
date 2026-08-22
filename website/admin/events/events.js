// admin/events/events.js – with recurrence expansion (frontend only)

function getApiBase() {
    if (typeof AppConfig !== 'undefined' && AppConfig.baseUrl) {
        return AppConfig.baseUrl;
    }
    return '';
}

// ===== LOAD EVENTS =====
function loadEventsAdmin() {
    const tbody = document.getElementById('events-admin-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    const url = getApiBase() + '/api/events';
    fetch(url, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
    })
    .then(res => {
        if (res.status === 401) throw new Error('Session expired');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    })
    .then(data => {
        if (data.status === 'success') {
            let html = '';
            
            data.events.forEach(ev => {
                const imageHtml = ev.image_url ? `<img src="${ev.image_url}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;">` : '—';
                
                html += `
                    <tr>
                        <td>${ev.id}</td>
                        <td>${imageHtml}</td>
                        <td><strong>${escapeHtml(ev.title)}</strong></td>
                        <td>${new Date(ev.event_date).toLocaleString()}</td>
                        <td>${escapeHtml(ev.description || '').substring(0, 50)}${(ev.description || '').length > 50 ? '...' : ''}</td>
                        <td>${ev.rsvp_count || 0}</td>
                        <td>—</td>
                        <td>—</td>
                        <td>
                            <div style="display:flex; gap:4px; flex-wrap:wrap;">
                                <button class="btn btn-sm btn-primary" onclick="editEvent(${ev.id})" title="Edit"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-sm btn-secondary" onclick="duplicateEvent(${ev.id})" title="Duplicate"><i class="fas fa-copy"></i></button>
                                <button class="btn btn-sm btn-danger" onclick="deleteEvent(${ev.id})" title="Delete"><i class="fas fa-trash"></i></button>
                            </div>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html || '<tr><td colspan="9" style="text-align:center; padding:20px;">No events found.</td></tr>';
        } else {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#dc3545;">Failed to load events.</td></tr>';
        }
    })
    .catch(err => {
        console.error('Load events error:', err);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#dc3545;">Error loading events.</td></tr>';
    });
}

// ===== SAVE EVENT (with recurrence expansion) =====
function saveEvent() {
    const id = document.getElementById('event-id').value;
    const title = document.getElementById('event-title').value.trim();
    const event_date = document.getElementById('event-date').value;
    const description = document.getElementById('event-description').value.trim();
    const image_url = document.getElementById('event-image-url').value;
    const repeat_type = document.getElementById('event-repeat-type').value;

    if (!title || !event_date) {
        showEventStatus('Title and Date are required.', 'error');
        return;
    }

    // If this is a recurring event, generate all instances
    if (!id && repeat_type && repeat_type !== 'none') {
        const dates = generateRecurringDates(event_date, repeat_type);
        
        if (dates.length === 0) {
            showEventStatus('No dates generated for this recurrence.', 'error');
            return;
        }

        // Show progress
        showEventStatus(`Creating ${dates.length} recurring events...`, 'info');
        
        // Create each event one by one
        let created = 0;
        let failed = 0;
        const total = dates.length;
        
        // Disable the button to prevent double-clicking
        const submitBtn = document.getElementById('event-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        
        // Create events sequentially
        function createNext(index) {
            if (index >= dates.length) {
                // All done
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Event';
                
                if (failed === 0) {
                    showEventStatus(`Successfully created ${created} recurring events.`, 'success');
                    clearEventForm();
                    loadEventsAdmin();
                } else {
                    showEventStatus(`Created ${created} events, ${failed} failed. Check console for details.`, 'warning');
                }
                return;
            }
            
            const dateStr = dates[index];
            const payload = {
                title: title,
                event_date: dateStr,
                description: description,
                image_url: image_url
            };
            
            const base = getApiBase();
            fetch(`${base}/api/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            })
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    created++;
                    // Update progress
                    showEventStatus(`Creating events... ${created}/${total}`, 'info');
                } else {
                    failed++;
                    console.error('Failed to create event:', dateStr, data);
                }
                // Continue with next
                createNext(index + 1);
            })
            .catch(err => {
                failed++;
                console.error('Error creating event:', dateStr, err);
                createNext(index + 1);
            });
        }
        
        // Start creating
        createNext(0);
        return;
    }

    // For editing an existing event or single event
    const payload = {
        title,
        event_date,
        description,
        image_url
    };

    const base = getApiBase();
    const url = id ? `${base}/api/events/${id}` : `${base}/api/events`;
    const method = id ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (res.status === 401) throw new Error('Session expired');
        if (!res.ok) throw new Error('HTTP ' + res.status);
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

// ===== GENERATE RECURRING DATES =====
function generateRecurringDates(startDateStr, repeatType) {
    const dates = [];
    const start = new Date(startDateStr);
    const now = new Date();
    const twoYearsLater = new Date(now);
    twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
    
    // If start date is in the past, start from today
    let current = new Date(Math.max(start.getTime(), now.getTime()));
    
    // Adjust to the start date if we're starting from today
    if (current > start) {
        if (repeatType === 'weekly') {
            // Find the next same day of week
            const startDay = start.getDay();
            const currentDay = current.getDay();
            const diff = (startDay - currentDay + 7) % 7;
            if (diff > 0) {
                current.setDate(current.getDate() + diff);
            }
        } else if (repeatType === 'monthly') {
            // Find the next same day of month
            const startDate = start.getDate();
            if (current.getDate() > startDate) {
                current.setMonth(current.getMonth() + 1);
            }
            const targetDate = Math.min(startDate, daysInMonth(current.getFullYear(), current.getMonth()));
            current.setDate(targetDate);
        }
    }
    
    let count = 0;
    const maxCount = 730; // Max 2 years worth of daily events
    
    while (current <= twoYearsLater && count < maxCount) {
        const dateStr = formatDateForInput(current);
        dates.push(dateStr);
        count++;
        
        // Advance to next occurrence
        if (repeatType === 'daily') {
            current.setDate(current.getDate() + 1);
        } else if (repeatType === 'weekly') {
            current.setDate(current.getDate() + 7);
        } else if (repeatType === 'monthly') {
            current.setMonth(current.getMonth() + 1);
            const targetDate = Math.min(start.getDate(), daysInMonth(current.getFullYear(), current.getMonth()));
            current.setDate(targetDate);
        } else {
            break;
        }
    }
    
    return dates;
}

function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
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
        if (res.status === 401) throw new Error('Session expired');
        if (!res.ok) throw new Error('HTTP ' + res.status);
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
        if (res.status === 401) throw new Error('Session expired');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    })
    .then(data => {
        if (data.status === 'success') {
            const ev = data.event;
            
            document.getElementById('event-id').value = ev.id;
            document.getElementById('event-title').value = ev.title;
            document.getElementById('event-date').value = ev.event_date.slice(0, 16);
            document.getElementById('event-description').value = ev.description || '';
            document.getElementById('event-image-url').value = ev.image_url || '';
            document.getElementById('event-repeat-type').value = 'none'; // Always single when editing
            document.getElementById('event-form-title').textContent = 'Edit Event';
            document.getElementById('event-submit-btn').textContent = 'Update Event';
            
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

// ===== DUPLICATE EVENT =====
function duplicateEvent(id) {
    const base = getApiBase();
    fetch(`${base}/api/events/${id}`, {
        credentials: 'include'
    })
    .then(res => {
        if (res.status === 401) throw new Error('Session expired');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    })
    .then(data => {
        if (data.status === 'success') {
            const ev = data.event;
            clearEventForm();
            document.getElementById('event-title').value = 'Copy of ' + ev.title;
            document.getElementById('event-date').value = ev.event_date.slice(0, 16);
            document.getElementById('event-description').value = ev.description || '';
            document.getElementById('event-image-url').value = ev.image_url || '';
            document.getElementById('event-repeat-type').value = 'none'; // Always single when duplicating
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

// ===== IMAGE UPLOAD =====
function uploadEventImage(input) {
    const file = input.files[0];
    if (!file) return;
    
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

// ===== FORM HELPERS =====
function clearEventForm() {
    document.getElementById('event-id').value = '';
    document.getElementById('event-title').value = '';
    document.getElementById('event-date').value = '';
    document.getElementById('event-description').value = '';
    document.getElementById('event-image-url').value = '';
    document.getElementById('event-repeat-type').value = 'none';
    document.getElementById('event-form-title').textContent = 'Add New Event';
    document.getElementById('event-submit-btn').textContent = 'Save Event';
    document.getElementById('event-image-preview').style.display = 'none';
    document.getElementById('event-image-preview-img').src = '';
    document.getElementById('event-form-status').style.display = 'none';
}

function showEventStatus(msg, type) {
    const el = document.getElementById('event-form-status');
    el.textContent = msg;
    el.className = 'status-message status-' + type;
    el.style.display = 'block';
    
    // Don't auto-hide warning messages
    if (type !== 'warning') {
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => {
                el.style.display = 'none';
                el.style.opacity = '1';
            }, 500);
        }, 5000);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== AUTO-LOAD =====
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('events-admin-body')) {
        loadEventsAdmin();
    }
});

// ===== EXPOSE GLOBALLY =====
window.loadEventsAdmin = loadEventsAdmin;
window.saveEvent = saveEvent;
window.deleteEvent = deleteEvent;
window.editEvent = editEvent;
window.duplicateEvent = duplicateEvent;
window.clearEventForm = clearEventForm;
window.uploadEventImage = uploadEventImage;
window.removeEventImage = removeEventImage;
window.showEventStatus = showEventStatus;
window.escapeHtml = escapeHtml;

console.log('✅ events.js loaded (with frontend recurrence expansion)');