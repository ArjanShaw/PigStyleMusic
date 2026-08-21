// events-component.js - Events Tile (Public)
// 3‑column layout: Image | Title+Desc+RSVP link | Date+Buttons.
// Supports recurring events with parent_event_id overrides

var eventsInitialized = false;

// --- Helper: download .ics file ---
function downloadICS(event, occurrenceDate) {
    const dt = new Date(occurrenceDate);
    const formatICSDate = (d) => {
        return d.getUTCFullYear() +
            String(d.getUTCMonth() + 1).padStart(2, '0') +
            String(d.getUTCDate()).padStart(2, '0') + 'T' +
            String(d.getUTCHours()).padStart(2, '0') +
            String(d.getUTCMinutes()).padStart(2, '0') +
            String(d.getUTCSeconds()).padStart(2, '0') + 'Z';
    };

    const dtstart = formatICSDate(dt);
    const dtend = formatICSDate(new Date(dt.getTime() + 2 * 60 * 60 * 1000));

    const title = event.title || 'Event';
    const desc = event.description || '';

    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//PigStyle Music//Events//EN',
        'BEGIN:VEVENT',
        'UID:' + event.id + '-' + dtstart + '@pigstylemusic.com',
        'DTSTAMP:' + formatICSDate(new Date()),
        'DTSTART:' + dtstart,
        'DTEND:' + dtend,
        'SUMMARY:' + title.replace(/,/g, '\\,').replace(/;/g, '\\;'),
        'DESCRIPTION:' + desc.replace(/,/g, '\\,').replace(/;/g, '\\;'),
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'event.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

// ===== MAIN LOAD EVENTS FUNCTION =====

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
                const expandedEvents = [];
                const now = new Date();
                const maxDays = 90;
                const limit = 20;

                data.events.forEach(ev => {
                    const repeatType = ev.repeat_type || 'none';
                    const baseDate = new Date(ev.event_date);
                    
                    // Check if this is an override
                    const isOverride = ev.parent_event_id !== null && ev.parent_event_id !== undefined && ev.parent_event_id !== 0;
                    
                    // If it's a single event or override, just add it
                    if (repeatType === 'none' || isOverride) {
                        expandedEvents.push({ ...ev });
                        return;
                    }

                    // It's a recurring event - generate future dates
                    let current = new Date(Math.max(baseDate, now));
                    let count = 0;

                    while (count < limit) {
                        const diffDays = (current - now) / (1000 * 60 * 60 * 24);
                        if (diffDays > maxDays) break;

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

                // Sort by date and remove duplicates (events with same ID and date)
                const uniqueEvents = [];
                const seen = new Set();
                expandedEvents.forEach(ev => {
                    const key = ev.id + '_' + ev.event_date;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueEvents.push(ev);
                    }
                });
                uniqueEvents.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

                // --- Build HTML via array ---
                const htmlParts = [];
                uniqueEvents.forEach(ev => {
                    const date = new Date(ev.event_date);
                    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const rsvpCount = ev.rsvp_count || 0;
                    
                    // Check if this is an override
                    const isOverride = ev.parent_event_id !== null && ev.parent_event_id !== undefined && ev.parent_event_id !== 0;

                    // Override badge for public view
                    const overrideBadge = isOverride 
                        ? `<span style="font-size:0.55rem; background:#ffc107; color:#333; padding:1px 6px; border-radius:8px; margin-left:4px; display:inline-block; vertical-align:middle;">⭐ Special</span>` 
                        : '';

                    // Column 1: Image
                    const imageHtml = ev.image_url
                        ? `<div style="flex:0 0 140px; height:140px; overflow:hidden;">
                            <img src="${ev.image_url}" alt="${ev.title}" style="
                                width:100%;
                                height:100%;
                                object-fit:cover;
                            ">
                        </div>`
                        : '';

                    // Column 2: Title + Description (top), RSVP link (bottom left)
                    const contentHtml = `
                        <div style="flex:1; padding:8px 12px; display:flex; flex-direction:column; justify-content:space-between; overflow:hidden; min-width:0;">
                            <div>
                                <strong style="font-size:1rem; color:#333; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">
                                    ${escapeHtml(ev.title)}${overrideBadge}
                                </strong>
                                ${ev.description ? `<p style="margin:4px 0 0; color:#555; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(ev.description)}</p>` : ''}
                            </div>
                            <span class="rsvp-count-display" data-event-id="${ev.id}" style="cursor:pointer; color:#007bff; text-decoration:underline; font-weight:500; font-size:0.8rem; align-self:flex-start; margin-top:4px;">
                                👥 ${rsvpCount} RSVPs
                            </span>
                        </div>
                    `;

                    // Column 3: Date/Time badge, Calendar, RSVP
                    const dateBadge = `<div style="
                        width:100%;
                        background:#ff6b6b;
                        color:white;
                        border-radius:20px;
                        padding:5px 0;
                        font-size:0.7rem;
                        font-weight:600;
                        text-align:center;
                    ">${dateStr} ${timeStr}</div>`;

                    const calBtn = `<button class="cal-btn" data-event='${JSON.stringify(ev).replace(/'/g, "&#39;")}' data-date="${ev.event_date}" style="
                        width:100%;
                        background:#6c757d;
                        color:white;
                        border:none;
                        border-radius:20px;
                        padding:5px 0;
                        font-size:0.7rem;
                        cursor:pointer;
                        transition:all 0.2s;
                        font-weight:600;
                        text-align:center;
                    ">
                        <i class="fas fa-calendar-plus"></i> Calendar
                    </button>`;

                    const rsvpBtn = `<button class="rsvp-btn" data-event-id="${ev.id}" style="
                        width:100%;
                        background:#ff6b6b;
                        color:white;
                        border:none;
                        border-radius:20px;
                        padding:5px 0;
                        font-size:0.7rem;
                        cursor:pointer;
                        transition:all 0.2s;
                        font-weight:600;
                        text-align:center;
                    ">
                        <i class="fas fa-user-plus"></i> RSVP
                    </button>`;

                    const rightColumnHtml = `
                        <div style="flex:0 0 160px; padding:6px 10px 6px 0; display:flex; flex-direction:column; justify-content:center; align-items:stretch; gap:4px;">
                            ${dateBadge}
                            ${calBtn}
                            ${rsvpBtn}
                        </div>
                    `;

                    // Different border color for overrides
                    const borderColor = isOverride ? '#ffc107' : '#ff6b6b';

                    htmlParts.push(`
                        <div class="event-card" data-event-id="${ev.id}" data-parent-id="${ev.parent_event_id || ''}" style="
                            display:flex;
                            align-items:stretch;
                            background:#f5f5f5;
                            border-radius:12px;
                            margin-bottom:12px;
                            box-shadow:0 2px 8px rgba(0,0,0,0.08);
                            border-left:6px solid ${borderColor};
                            overflow:hidden;
                            height:140px;
                        ">
                            ${imageHtml}
                            ${contentHtml}
                            ${rightColumnHtml}
                        </div>
                    `);
                });

                listEl.innerHTML = htmlParts.join('');

                // --- Attach event listeners ---
                document.querySelectorAll('.rsvp-btn').forEach(btn => {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const eventId = this.dataset.eventId;
                        const card = this.closest('.event-card');
                        const titleEl = card.querySelector('strong');
                        const eventTitle = titleEl ? titleEl.textContent.replace('⭐ Special', '').trim() : 'Event';
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
                        }
                    });
                });

                document.querySelectorAll('.cal-btn').forEach(btn => {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const eventData = this.dataset.event;
                        const date = this.dataset.date;
                        if (eventData && date) {
                            try {
                                const ev = JSON.parse(eventData);
                                downloadICS(ev, date);
                            } catch (err) {
                                console.error('Calendar error:', err);
                            }
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

// ===== INITIALIZATION =====

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

// ===== RSVP FUNCTIONS (from main HTML) =====

// These functions are already defined in your index.html's inline script
// but we keep them here as fallbacks

function openRsvpModal(eventId, eventTitle) {
    // This should be defined in the main HTML
    if (typeof window.openRsvpModal === 'function') {
        window.openRsvpModal(eventId, eventTitle);
    } else {
        console.log('RSVP for:', eventTitle, '(ID: ' + eventId + ')');
        alert('RSVP functionality: ' + eventTitle);
    }
}

function showRsvpList(eventId) {
    // This should be defined in the main HTML
    if (typeof window.showRsvpList === 'function') {
        window.showRsvpList(eventId);
    } else {
        console.log('Show RSVPs for event:', eventId);
        alert('RSVP list for event #' + eventId);
    }
}

// Auto-initialize
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

// Export functions to window for debugging
window.loadEvents = loadEvents;
window.downloadICS = downloadICS;