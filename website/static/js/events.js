// Events page - loads calendar events
(function() {
    'use strict';

    // Add API_BASE detection
    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    window.loadEvents = async function() {
        try {
            // Use full URL with API_BASE
            const response = await fetch(`${API_BASE}/api/events`, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('📅 Events response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📅 Events data:', data);
            
            let html = '<div style="padding:5px 0;">';
            
            if (data.status === 'success' && data.events && data.events.length > 0) {
                data.events.forEach(function(event) {
                    const eventDate = new Date(event.event_date || event.date).toLocaleDateString('en-US', { 
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
                            ${event.image_url ? `<div style="margin-top:6px;"><img src="${event.image_url}" alt="Event image" style="max-width:100%;max-height:120px;border-radius:4px;"></div>` : ''}
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
            console.error('❌ Error loading events:', err);
            const container = document.getElementById('eventsResponse');
            if (container) {
                container.innerHTML = `<div style="color:#dc3545;padding:20px;text-align:center;">Error loading events: ${err.message}</div>`;
            }
        }
    };

    window.initEvents = function() {
        console.log('📅 Events initialized with API_BASE:', API_BASE);
        // Load events after a short delay to ensure DOM is ready
        setTimeout(function() { 
            window.loadEvents(); 
        }, 200);
    };

    // Auto-initialize if page is already loaded
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        const pageContent = document.getElementById('page-content');
        if (pageContent && pageContent.querySelector('#eventsResponse')) {
            console.log('📅 Auto-initializing Events');
            window.initEvents();
        }
    }

    console.log('📅 Events script loaded');
})();