// admin/events/events.js – simplified, uses AppConfig.baseUrl

function getApiBase() {
    if (typeof AppConfig !== 'undefined' && AppConfig.baseUrl) {
        return AppConfig.baseUrl;
    }
    return ''; // fallback to relative (but this will break cross‑origin)
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
                    const recurring = ev.repeat_type && ev.repeat_type !== 'none' ? `🔁 ${ev.repeat_type}` : '—';
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
                                <button class="btn btn-sm btn-secondary" onclick="duplicateEvent(${ev.id})"><i class="fas fa-copy"></i></button>
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

    const base = getApiBase();
    const url = id ? `${base}/api/events/${id}` : `${base}/api/events`;
    const method = id ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => {
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
        showEventStatus('Network error: ' + err.message, 'error');
    });
}

function deleteEvent(id) {
    if (!confirm('Are you sure you want to delete this event?')) return;
    const base = getApiBase();
    fetch(`${base}/api/events/${id}`, { method: 'DELETE' })
        .then(res => {
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
            showEventStatus('Network error: ' + err.message, 'error');
        });
}

function editEvent(id) {
    const base = getApiBase();
    fetch(`${base}/api/events/${id}`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
                document.getElementById('event-repeat-type').value = ev.repeat_type || 'none';
                document.getElementById('event-form-title').textContent = 'Edit Event';
                document.getElementById('event-submit-btn').textContent = 'Update Event';
                if (ev.image_url) {
                    document.getElementById('event-image-preview').style.display = 'block';
                    document.getElementById('event-image-preview-img').src = ev.image_url;
                }
            }
        })
        .catch(err => {
            console.error('Edit error:', err);
            showEventStatus('Failed to load event: ' + err.message, 'error');
        });
}

function duplicateEvent(id) {
    const base = getApiBase();
    fetch(`${base}/api/events/${id}`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                const ev = data.event;
                document.getElementById('event-id').value = '';
                document.getElementById('event-title').value = 'Copy of ' + ev.title;
                document.getElementById('event-date').value = ev.event_date.slice(0, 16);
                document.getElementById('event-description').value = ev.description || '';
                document.getElementById('event-image-url').value = ev.image_url || '';
                document.getElementById('event-repeat-type').value = ev.repeat_type || 'none';
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

function uploadEventImage(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('event-image-preview').style.display = 'block';
        document.getElementById('event-image-preview-img').src = e.target.result;
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

// Auto-load when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('events-admin-body')) {
        loadEventsAdmin();
    }
});

// Expose functions globally
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

console.log('✅ events.js loaded (with AppConfig.baseUrl)');