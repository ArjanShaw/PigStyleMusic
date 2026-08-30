// Events page - loads calendar events with weekly repeat support
(function() {
    'use strict';

    // Add API_BASE detection
    const API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://www.pigstylemusic.com';

    // Calculate the next occurrence of a weekly event
    function getNextWeeklyDate(eventDateStr) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const eventDate = new Date(eventDateStr);
        eventDate.setHours(0, 0, 0, 0);
        
        // If the event is today or in the future, return the event date
        if (eventDate >= today) {
            return eventDate;
        }
        
        // Calculate days until next occurrence (7 days later)
        const daysDiff = Math.ceil((today - eventDate) / (1000 * 60 * 60 * 24));
        const weeksToAdd = Math.ceil(daysDiff / 7);
        const nextDate = new Date(eventDate);
        nextDate.setDate(nextDate.getDate() + (weeksToAdd * 7));
        
        return nextDate;
    }

    // Format date for display
    function formatEventDate(date) {
        return date.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });
    }

    window.loadEvents = async function() {
        try {
            console.log('📅 Loading events from:', `${API_BASE}/api/events`);
            
            const response = await fetch(`${API_BASE}/api/events`, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('📅 Events response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('📅 Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📅 Events data:', data);
            
            let html = '<div style="padding:5px 0;">';
            
            if (data.status === 'success' && data.events && data.events.length > 0) {
                data.events.forEach(function(event) {
                    let eventDate = new Date(event.event_date);
                    let isWeekly = false;
                    let repeatText = '';
                    let displayDate = eventDate;
                    
                    // Check if event is weekly
                    if (event.repeat_type === 'weekly') {
                        isWeekly = true;
                        displayDate = getNextWeeklyDate(event.event_date);
                        const dayOfWeek = eventDate.toLocaleDateString('en-US', { weekday: 'long' });
                        repeatText = `🔄 Weekly event - occurs every ${dayOfWeek}`;
                    }
                    
                    const formattedDate = formatEventDate(displayDate);
                    const isNextOccurrence = isWeekly && displayDate > eventDate;
                    
                    html += `
                        <div style="background:#f8f8f8;border-radius:8px;padding:18px;margin-bottom:15px;border:1px solid #eee;">
                            <div style="font-weight:bold;color:#333;font-size:20px;margin-bottom:8px;">${event.title || 'Untitled Event'}</div>
                            <div style="color:#666;font-size:15px;margin-bottom:6px;">
                                📅 ${formattedDate}
                                ${isNextOccurrence ? ` <span style="color:#17a2b8;font-size:14px;">(next occurrence)</span>` : ''}
                            </div>
                            ${isWeekly ? `<div style="color:#17a2b8;font-size:14px;margin-bottom:10px;">${repeatText}</div>` : ''}
                            
                            <!-- Image + Description side by side -->
                            <div style="display:flex; gap:15px; align-items:flex-start; margin-top:6px;">
                                ${event.image_url ? `
                                <div style="flex-shrink:0;">
                                    <img src="${event.image_url}" alt="Event image" style="max-width:150px; max-height:150px; border-radius:6px; object-fit:cover; width:150px; border:1px solid #eee;">
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
            if (container) {
                container.innerHTML = html;
            }
        } catch(err) {
            console.error('❌ Error loading events:', err);
            const container = document.getElementById('eventsResponse');
            if (container) {
                container.innerHTML = `<div style="color:#dc3545;padding:20px;text-align:center;font-size:15px;">❌ Error loading events: ${err.message}</div>`;
            }
        }
    };

    window.initEvents = function() {
        console.log('📅 Events initialized with API_BASE:', API_BASE);
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