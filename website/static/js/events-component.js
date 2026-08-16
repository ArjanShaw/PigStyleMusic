// ============================================================
// events-component.js - Events Tile (Public)
// Displays upcoming events with RSVP button
// ============================================================

var eventsInitialized = false;

function loadEvents() {
    const listEl = document.getElementById('eventsList');
    if (!listEl) return;

    listEl.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Loading events...</div>';

    const apiUrl = (typeof AppConfig !== 'undefined' && AppConfig.baseUrl)
        ? AppConfig.baseUrl + '/api/events'
        : '/api/events';

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success' && data.events.length) {
                let html = '';
                data.events.forEach(ev => {
                    const date = new Date(ev.event_date);
                    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const rsvpCount = ev.rsvp_count || 0;

                    const imageHtml = ev.image_url
                        ? `<img src="${ev.image_url}" alt="${ev.title}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; margin-right: 12px; flex-shrink: 0;">`
                        : '';

                    html += `
                        <div class="event-card" data-event-id="${ev.id}" style="background:#f5f5f5; border-radius:8px; padding:12px; margin-bottom:10px; box-shadow:0 1px 4px rgba(0,0,0,0.06); border-left:4px solid #ff6b6b; display:flex; align-items:center; gap:12px;">
                            ${imageHtml}
                            <div style="flex:1; min-width:0;">
                                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:5px;">
                                    <strong style="font-size:1.05rem; color:#333;">${escapeHtml(ev.title)}</strong>
                                    <span style="background:#ff6b6b; color:white; padding:2px 12px; border-radius:12px; font-size:0.75rem; white-space:nowrap;">${dateStr}</span>
                                </div>
                                ${ev.description ? `<p style="margin:6px 0 0; color:#555; font-size:0.9rem;">${escapeHtml(ev.description)}</p>` : ''}
                                <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:5px;">
                                    <div style="font-size:0.8rem; color:#888;">
                                        🕐 ${timeStr}
                                        ${ev.is_recurring ? ' &nbsp;🔁 Recurring' : ''}
                                        <span class="rsvp-count-display" style="margin-left:10px;">👥 ${rsvpCount} RSVPs</span>
                                    </div>
                                    <button class="rsvp-btn" data-event-id="${ev.id}" style="background:#ff6b6b; color:white; border:none; border-radius:20px; padding:4px 16px; font-size:0.8rem; cursor:pointer; transition:all 0.2s;">
                                        <i class="fas fa-user-plus"></i> RSVP
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                });
                listEl.innerHTML = html;

                document.querySelectorAll('.rsvp-btn').forEach(btn => {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const eventId = this.dataset.eventId;
                        handleRSVP(eventId, this);
                    });
                });
            } else {
                listEl.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">No upcoming events found.</div>';
            }
        })
        .catch(error => {
            console.error('Error loading events:', error);
            listEl.innerHTML = '<div style="text-align:center; color:#ff6b6b; padding:20px;">Failed to load events. Please try again later.</div>';
        });
}

async function handleRSVP(eventId, button) {
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    button.style.opacity = '0.7';

    const apiUrl = (typeof AppConfig !== 'undefined' && AppConfig.baseUrl)
        ? AppConfig.baseUrl + `/api/events/${eventId}/rsvp`
        : `/api/events/${eventId}/rsvp`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        if (data.status === 'success') {
            const card = button.closest('.event-card');
            const countDisplay = card.querySelector('.rsvp-count-display');
            if (countDisplay) {
                countDisplay.textContent = `👥 ${data.rsvp_count} RSVPs`;
            }
            button.innerHTML = '✅ RSVPed!';
            button.style.background = '#28a745';
            button.disabled = true;
            setTimeout(() => {
                button.innerHTML = '<i class="fas fa-user-plus"></i> RSVP';
                button.style.background = '#ff6b6b';
                button.disabled = false;
            }, 3000);
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (error) {
        console.error('RSVP error:', error);
        button.innerHTML = '❌ Failed';
        button.style.background = '#dc3545';
        setTimeout(() => {
            button.innerHTML = '<i class="fas fa-user-plus"></i> RSVP';
            button.style.background = '#ff6b6b';
            button.disabled = false;
        }, 3000);
    }
}

function initEventsComponent() {
    if (eventsInitialized) return;
    eventsInitialized = true;
    loadEvents();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEventsComponent);
} else {
    initEventsComponent();
}

// Refresh every 5 minutes
setInterval(() => {
    if (document.getElementById('eventsList')) {
        loadEvents();
    }
}, 5 * 60 * 1000);