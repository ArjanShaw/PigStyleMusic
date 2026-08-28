// Events page - loads calendar events
(function() {
    window.loadEvents = async function() {
        try {
            const response = await fetch('/api/events');
            const data = await response.json();
            console.log('Events response:', data);
            
            let html = '<div style="padding:5px 0;">';
            
            if (data.status === 'success' && data.events && data.events.length > 0) {
                data.events.forEach(function(event) {
                    const eventDate = new Date(event.date).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                    });
                    html += `
                        <div style="background:#f8f8f8;border-radius:8px;padding:15px;margin-bottom:12px;border:1px solid #eee;">
                            <div style="font-weight:bold;color:#333;font-size:16px;">${event.title || 'Untitled Event'}</div>
                            <div style="color:#666;font-size:13px;margin:4px 0;">📅 ${eventDate}</div>
                            ${event.description ? `<div style="color:#888;font-size:13px;">${event.description}</div>` : ''}
                            ${event.location ? `<div style="color:#888;font-size:12px;margin-top:4px;">📍 ${event.location}</div>` : ''}
                            <div style="margin-top:8px;">
                                <span style="font-size:12px;color:#28a745;">✅ ${event.rsvp_count || 0} attending</span>
                            </div>
                        </div>
                    `;
                });
            } else {
                html += '<div style="text-align:center;padding:40px;color:#888;">📅 No upcoming events</div>';
            }
            html += '</div>';
            
            const container = document.getElementById('eventsResponse');
            if (container) {
                container.innerHTML = html;
            }
        } catch(err) {
            console.error('Error loading events:', err);
            const container = document.getElementById('eventsResponse');
            if (container) {
                container.innerHTML = '<div style="color:red;padding:20px;text-align:center;">Error loading events: ' + err.message + '</div>';
            }
        }
    };

    window.initEvents = function() {
        console.log('Events initialized');
        setTimeout(function() { window.loadEvents(); }, 200);
    };
})();
