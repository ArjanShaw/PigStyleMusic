// admin/events/events.js
// Admin CRUD for events – uses AppConfig.baseUrl

// Helper to get API URL
function getApiBase() {
    if (typeof AppConfig !== 'undefined' && AppConfig.baseUrl) {
        return AppConfig.baseUrl;
    }
    return ''; // fallback to relative
}

function loadEventsAdmin() {
    const tbody = document.getElementById('events-admin-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    const url = getApiBase() + '/api/events';
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                let html = '';
                data.events.forEach(ev => {
                    const imageHtml = ev.image_url ? `<img src="${ev.image_url}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;">` : '—';
                    const recurring = ev.is_recurring ? `🔁 ${ev.repeat_type}` : '—';
                    html += `
                        <tr>
                            <td>${ev.id}</td>
                            <td>${imageHtml}</td>
                            <td><strong>${escapeHtml(ev.title)}</strong></td>
                            <td>${new Date(ev.event_date).toLocaleString()}</td>
                            <td>${escapeHtml(ev.description || '')}</td>
                            <td>${ev.rsvp_count || 0}</td>
                            <td>${recurring}</td>
                            <td>
                                <button class="btn btn-sm btn-primary" onclick="editEvent(${ev.id})"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-sm btn-danger" onclick="deleteEvent(${ev.id})"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html || '<tr><td colspan="8" style="text-align:center; padding:20px;">No events found.</td></tr>';
            } else {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#dc3545;">Failed to load events.</td></tr>';
            }
        })
        .catch(() => {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#dc3545;">Error loading events.</td></tr>';
        });
}

function saveEvent() {
    const id = document.getElementById('event-id').value;
    const title = document.getElementById('event-title').value.trim();
    const event_date = document.getElementById('event-date').value;
    const description = document.getElementById('event-description').value.trim();
    const image_url = document.getElementById('event-image-url').value;
    const repeat_type = document.getElementById('event-repeat-type').value;
    const repeat_interval = parseInt(document.getElementById('event-repeat-interval').value) || 1;
    const repeat_end_date = document.getElementById('event-repeat-end-date').value || null;
    const repeat_day_of_week = parseInt(document.getElementById('event-repeat-day-of-week').value) || null;
    const repeat_week_of_month = parseInt(document.getElementById('event-repeat-week-of-month').value) || null;
    const is_recurring = document.getElementById('event-is-recurring').checked ? 1 : 0;

    if (!title || !event_date) {
        showEventStatus('Title and Date are required.', 'error');
        return;
    }

    const base = getApiBase();
    const url = id ? `${base}/api/events/${id}` : `${base}/api/events`;
    const method = id ? 'PUT' : 'POST';
    const payload = { title, event_date, description, image_url, repeat_type, repeat_interval, repeat_end_date, repeat_day_of_week, repeat_week_of_month, is_recurring };

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            showEventStatus('Event saved successfully.', 'success');
            clearEventForm();
            loadEventsAdmin();
        } else {
            showEventStatus(data.error || 'Save failed.', 'error');
        }
    })
    .catch(() => showEventStatus('Network error.', 'error'));
}

function deleteEvent(id) {
    if (!confirm('Are you sure you want to delete this event?')) return;
    const base = getApiBase();
    fetch(`${base}/api/events/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                loadEventsAdmin();
                showEventStatus('Event deleted.', 'success');
            } else {
                showEventStatus('Delete failed.', 'error');
            }
        })
        .catch(() => showEventStatus('Network error.', 'error'));
}

function editEvent(id) {
    const base = getApiBase();
    fetch(`${base}/api/events/${id}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                const ev = data.event;
                document.getElementById('event-id').value = ev.id;
                document.getElementById('event-title').value = ev.title;
                document.getElementById('event-date').value = ev.event_date.slice(0, 16);
                document.getElementById('event-description').value = ev.description || '';
                document.getElementById('event-image-url').value = ev.image_url || '';
                document.getElementById('event-repeat-type').value = ev.repeat_type || 'none';
                document.getElementById('event-repeat-interval').value = ev.repeat_interval || 1;
                document.getElementById('event-repeat-end-date').value = ev.repeat_end_date ? ev.repeat_end_date.slice(0, 10) : '';
                document.getElementById('event-repeat-day-of-week').value = ev.repeat_day_of_week || '';
                document.getElementById('event-repeat-week-of-month').value = ev.repeat_week_of_month || '';
                document.getElementById('event-is-recurring').checked = ev.is_recurring ? true : false;
                document.getElementById('event-form-title').textContent = 'Edit Event';
                document.getElementById('event-submit-btn').textContent = 'Update Event';
                if (ev.image_url) {
                    document.getElementById('event-image-preview').style.display = 'block';
                    document.getElementById('event-image-preview-img').src = ev.image_url;
                }
            }
        });
}

function clearEventForm() {
    document.getElementById('event-id').value = '';
    document.getElementById('event-title').value = '';
    document.getElementById('event-date').value = '';
    document.getElementById('event-description').value = '';
    document.getElementById('event-image-url').value = '';
    document.getElementById('event-repeat-type').value = 'none';
    document.getElementById('event-repeat-interval').value = 1;
    document.getElementById('event-repeat-end-date').value = '';
    document.getElementById('event-repeat-day-of-week').value = '';
    document.getElementById('event-repeat-week-of-month').value = '';
    document.getElementById('event-is-recurring').checked = false;
    document.getElementById('event-form-title').textContent = 'Add New Event';
    document.getElementById('event-submit-btn').textContent = 'Save Event';
    document.getElementById('event-image-preview').style.display = 'none';
    document.getElementById('event-image-preview-img').src = '';
    document.getElementById('event-form-status').style.display = 'none';
}

function uploadEventImage(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('event-image-preview').style.display = 'block';
        document.getElementById('event-image-preview-img').src = e.target.result;
        // For demo, store base64 in hidden field.
        // In production, you should upload to server and set image_url to the returned URL.
        document.getElementById('event-image-url').value = e.target.result;
    };
    reader.readAsDataURL(file);
}

function removeEventImage() {
    document.getElementById('event-image-preview').style.display = 'none';
    document.getElementById('event-image-preview-img').src = '';
    document.getElementById('event-image-url').value = '';
    document.getElementById('event-image-upload').value = '';
}

function showEventStatus(msg, type) {
    const el = document.getElementById('event-form-status');
    el.textContent = msg;
    el.className = 'status-message status-' + type;
    el.style.display = 'block';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Expose functions globally
window.loadEventsAdmin = loadEventsAdmin;
window.saveEvent = saveEvent;
window.deleteEvent = deleteEvent;
window.editEvent = editEvent;
window.clearEventForm = clearEventForm;
window.uploadEventImage = uploadEventImage;
window.removeEventImage = removeEventImage;
window.showEventStatus = showEventStatus;
window.escapeHtml = escapeHtml;

console.log('✅ events.js loaded (with AppConfig.baseUrl support)');