// events-component.js - Events Tile (Public)
// Expanded recurring events, compact cards, and clickable RSVP count.

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
                // --- Expand recurring events ---
                const expandedEvents = [];
                const now = new Date();
                const oneYearLater = new Date(now);
                oneYearLater.setFullYear(now.getFullYear() + 1);

                data.events.forEach(ev => {
                    const repeatType = ev.repeat_type || 'none';
                    const baseDate = new Date(ev.event_date);
                    
                    if (repeatType === 'none') {
                        expandedEvents.push({ ...ev });
                        return;
                    }

                    let current = new Date(baseDate);
                    if (current < now) current = new Date(now);

                    let count = 0;
                    const maxOccurrences = 52;

                    while (current <= oneYearLater && count < maxOccurrences) {
                        const occurrence = { ...ev };
                        occurrence.event_date = current.toISOString();
                        expandedEvents.push(occurrence);
                        count++;

                        if (repeatType === 'daily') current.setDate(current.getDate() + 1);
                        else if (repeatType === 'weekly') current.setDate(current.getDate() + 7);
                        else if (repeatType === 'monthly') current.setMonth(current.getMonth() + 1);
                        else break;
                    }
                });

                expandedEvents.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

                // --- Render compact cards ---
                let html = '';
                expandedEvents.forEach(ev => {
                    const date = new Date(ev.event_date);
                    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const rsvpCount = ev.rsvp_count || 0;
                    const isRecurring = ev.repeat_type && ev.repeat_type !== 'none';

                    const imageHtml = ev.image_url
                        ? `<div style="display:flex; align-items:stretch; flex-shrink:0; height:140px; width:140px;">
                            <img src="${ev.image_url}" alt="${ev.title}" style="
                                height:100%;
                                width:100%;
                                object-fit:cover;
                                border-radius:12px 0 0 12px;
                            ">
                        </div>`
                        : '';

                    html += `
                        <div class="event-card" data-event-id="${ev.id}" style="
                            display:flex;
                            align-items:stretch;
                            background:#f5f5f5;
                            border-radius:12px;
                            margin-bottom:12px;
                            box-shadow:0 2px 8px rgba(0,0,0,0.08);
                            border-left:6px solid #ff6b6b;
                            overflow:hidden;
                            height:140px;
                        ">
                            ${imageHtml}
                            <div style="
                                flex:1;
                                padding:10px 16px;
                                display:flex;
                                flex-direction:column;
                                justify-content:center;
                                overflow:hidden;
                            ">
                                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
                                    <strong style="font-size:1rem; color:#333; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(ev.title)}</strong>
                                    <span style="background:#ff6b6b; color:white; padding:2px 10px; border-radius:16px; font-size:0.7rem; white-space:nowrap;">${dateStr}</span>
                                </div>
                                ${ev.description ? `<p style="margin:4px 0 0; color:#555; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(ev.description)}</p>` : ''}
                                <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
                                    <div style="font-size:0.75rem; color:#888;">
                                        🕐 ${timeStr}
                                        ${isRecurring ? ' &nbsp;🔁 Recurring' : ''}
                                        <span class="rsvp-count-display" data-event-id="${ev.id}" style="cursor:pointer; margin-left:8px; color:#007bff; text-decoration:underline; font-weight:500;">
                                            👥 ${rsvpCount}
                                        </span>
                                    </div>
                                    <button class="rsvp-btn" data-event-id="${ev.id}" style="
                                        background:#ff6b6b;
                                        color:white;
                                        border:none;
                                        border-radius:20px;
                                        padding:4px 14px;
                                        font-size:0.75rem;
                                        cursor:pointer;
                                        transition:all 0.2s;
                                        font-weight:600;
                                    ">
                                        <i class="fas fa-user-plus"></i> RSVP
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                });

                listEl.innerHTML = html;

                // --- Attach event listeners ---
                document.querySelectorAll('.rsvp-btn').forEach(btn => {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const eventId = this.dataset.eventId;
                        const card = this.closest('.event-card');
                        const titleEl = card.querySelector('strong');
                        const eventTitle = titleEl ? titleEl.textContent : 'Event';
                        if (typeof openRsvpModal === 'function') {
                            openRsvpModal(eventId, eventTitle);
                        } else {
                            console.warn('openRsvpModal not defined');
                        }
                    });
                });

                document.querySelectorAll('.rsvp-count-display').forEach(el => {
                    el.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const eventId = this.dataset.eventId;
                        if (eventId) {
                            if (typeof showRsvpList === 'function') {
                                showRsvpList(eventId);
                            } else {
                                console.warn('showRsvpList not defined');
                            }
                        } else {
                            console.warn('No eventId found on RSVP count element');
                        }
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