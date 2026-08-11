// ============================================================
// events-component.js - Events Tile (Google Calendar)
// ============================================================

var eventsInitialized = false;

function initEventsComponent() {
    if (eventsInitialized) return;
    eventsInitialized = true;
    
    // The calendar is already in the HTML, nothing else to initialize
    // But we could add any additional event tracking or functionality here
    console.log('📅 Events calendar loaded');
}