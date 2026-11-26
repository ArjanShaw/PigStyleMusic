// Events page - loads calendar events
(function() {
    'use strict';

    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    // Format string "2026-12-02" or "2026-12-02T..." directly to "Wed, Dec 2, 2026"
    // without using timezone conversions.
    function formatDateString(dateStr) {
        if (!dateStr) return '';
        
        // Grab just the YYYY-MM-DD part
        const datePart = dateStr.split('T')[0]; 
        const parts = datePart.split('-');
        
        if (parts.length !== 3) return dateStr; // Fallback if formatting is weird
        
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
        const day = parseInt(parts[2], 10);
        
        // Create a date object using local time (year, month, day) so it doesn't roll back
        const d = new Date(year, month, day);
        
        return d.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });
    }

    window.loadEvents = async function() {
        try {
            // Added a timestamp to bust the cache so you always get fresh data
            const response = await fetch(`${API_BASE}/api/events?t=${Date.now()}`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            let html = '<div style="padding:5px 0;">';
            
            if (data.status === 'success' && data.events && data.events.length > 0) {
                data.events.forEach(function(event) {
                    const formattedDate = formatDateString(event.event_date);
                    const isWeekly = event.repeat_type === 'weekly';
                    
                    // Extract the day of the week for the "occurs every" text
                    const dayOfWeek = formattedDate.split(',')[0];
                    
                    html += `
                        <div style="background:#f8f8f8;border-radius:8px;padding:18px;margin-bottom:15px;border:1px solid #eee;">
                            <div style="font-weight:bold;color:#333;font-size:20px;margin-bottom:8px;">${event.title || 'Untitled Event'}</div>
                            <div style="color:#666;font-size:15px;margin-bottom:6px;">
                                📅 ${formattedDate}
                            </div>
                            ${isWeekly ? `<div style="color:#17a2b8;font-size:14px;margin-bottom:10px;">🔄 Weekly event - occurs every ${dayOfWeek}</div>` : ''}
                            
                            <div style="display:flex; gap:15px; align-items:flex-start; margin-top:6px;">
                                ${event.image_url ? `
                                <div style="flex-shrink:0;">
                                    <img src="${event.image_url}" alt="Event image" style="max-width:200px; max-height:300px; border-radius:6px; object-fit:contain; width:100%; border:1px solid #eee;">
                                </div>
                                ` : ''}
                                ${event.description ? `
                                <div style="flex:1; color:#555; font-size:15px; line-height:1.6; min-width:0;">
                                    ${event.description.replace(/\n/g, '<br>')}
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                });
            } else {
                html += '<div style="text-align:center;padding:40px;color:#888;font-size:16px;">📅 No upcoming events</div>';
            }
            html += '</div>';
            
            const container = document.getElementById('eventsResponse');
            if (container) container.innerHTML = html;
        } catch(err) {
            console.error('❌ Error loading events:', err);
            const container = document.getElementById('eventsResponse');
            if (container) container.innerHTML = `<div style="color:#dc3545;padding:20px;text-align:center;">❌ Error loading events: ${err.message}</div>`;
        }
    };

    window.initEvents = function() {
        setTimeout(window.loadEvents, 200);
    };

    // Auto-initialize if page is already loaded
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        const pageContent = document.getElementById('page-content');
        if (pageContent && pageContent.querySelector('#eventsResponse')) {
            window.initEvents();
        }
    }

})();