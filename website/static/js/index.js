// ============================================================
// index.js - Main Carousel Navigation & Initialization
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    // Load subscription modal
    if (typeof loadSubscriptionModal === 'function') {
        loadSubscriptionModal();
    }
    
    // ============================================================
    // CAROUSEL NAVIGATION
    // ============================================================
    
    const wrapper = document.getElementById('tilesWrapper');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const miniNavItems = document.querySelectorAll('.mini-nav-item:not(.flip-btn)');
    const tiles = document.querySelectorAll('.tile');
    const totalTiles = tiles.length;
    let currentIndex = 0;
    let isTransitioning = false;
    let touchStartX = 0;
    let touchEndX = 0;
    
    // Track which tiles are flipped
    let flippedState = {};
    
     
    
    function goTo(index) {
        if (isTransitioning || index === currentIndex) return;
        if (index < 0) index = totalTiles - 1;
        if (index >= totalTiles) index = 0;
        
        isTransitioning = true;
        currentIndex = index;
        
        wrapper.style.transform = 'translateX(-' + (index * 100) + '%)';
        
        miniNavItems.forEach(function(item, i) {
            if (i === index) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Unflip any flipped cards when switching tiles
        document.querySelectorAll('.flip-card.flipped').forEach(function(card) {
            card.classList.remove('flipped');
        });
        flippedState = {};
        
        
        setTimeout(function() {
            isTransitioning = false;
        }, 500);
    }
    
    function next() {
        goTo(currentIndex + 1);
    }
    
    function prev() {
        goTo(currentIndex - 1);
    }
    
    // ============================================================
    // FLIP CARD HANDLING
    // ============================================================
    
    document.querySelectorAll('.flip-card').forEach(function(card) {
        // Click on the card front to flip
        card.querySelector('.flip-card-front').addEventListener('click', function(e) {
            // Don't flip if clicking the flip hint or action button
            if (e.target.closest('.flip-hint') || e.target.closest('.front-action')) {
                return;
            }
            
            var tileIndex = parseInt(card.closest('.tile').dataset.index);
            
            // Only flip if not already flipped
            if (!flippedState[tileIndex]) {
                card.classList.add('flipped');
                flippedState[tileIndex] = true;
                
                
                // Initialize tile-specific components when flipped
                initializeTileComponent(tileIndex);
            }
        });
    });
    
    
    
    // ============================================================
    // TILE COMPONENT INITIALIZATION
    // ============================================================
    
    function initializeTileComponent(index) {
        switch(index) {
            case 1: // Shop - Browse
                if (typeof initBrowseComponent === 'function') {
                    setTimeout(initBrowseComponent, 100);
                }
                break;
            case 2: // Merch & Gifts
                if (typeof initMerchComponent === 'function') {
                    setTimeout(initMerchComponent, 100);
                }
                break;
            case 3: // Events - Calendar
                if (typeof initEventsComponent === 'function') {
                    setTimeout(initEventsComponent, 100);
                }
                break;
            case 4: // Connect
                if (typeof initConnectComponent === 'function') {
                    setTimeout(initConnectComponent, 100);
                }
                break;
            case 5: // Record Alerts
                if (typeof initAlertsComponent === 'function') {
                    setTimeout(initAlertsComponent, 100);
                }
                break;
            case 6: // Order Records
                if (typeof initOrderComponent === 'function') {
                    setTimeout(initOrderComponent, 100);
                }
                break;
        }
    }
    
    // ============================================================
    // INITIAL STATE
    // ============================================================
    
   
    // ============================================================
    // ARROW & NAVIGATION EVENTS
    // ============================================================
    
    prevBtn.addEventListener('click', prev);
    nextBtn.addEventListener('click', next);
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowLeft') prev();
        if (e.key === 'ArrowRight') next();
    });
    
    // Touch support
    wrapper.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    wrapper.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        var diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 40) {
            if (diff > 0) next();
            else prev();
        }
    }, { passive: true });
    
    // Mini nav click (excluding flip button)
    miniNavItems.forEach(function(item) {
        item.addEventListener('click', function(e) {
            var index = parseInt(this.dataset.index);
            goTo(index);
        });
    });
    
    // ============================================================
    // STICKY NOTES
    // ============================================================
    
    async function fetchStickyNotes() {
        try {
            var isLocalhost = window.location.hostname === 'localhost' || 
                              window.location.hostname === '127.0.0.1';
            var apiUrl = isLocalhost 
                ? 'http://localhost:5000/api/sticky-notes'
                : 'https://' + window.location.hostname + '/api/sticky-notes';
            
            var response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('API returned ' + response.status);
            }
            
            var data = await response.json();
            
            if (data.status === 'success' && data.notes && data.notes.length > 0) {
                var container = document.querySelector('.sticky-notes-container');
                if (!container) {
                    container = document.createElement('div');
                    container.className = 'sticky-notes-container';
                    document.body.appendChild(container);
                }
                
                container.innerHTML = '';
                
                data.notes.forEach(function(note) {
                    var noteElement = document.createElement('div');
                    noteElement.className = 'sticky-note';
                    noteElement.textContent = note.note_text;
                    container.appendChild(noteElement);
                });
            }
            
        } catch (error) {
            console.error('Error fetching sticky notes:', error);
        }
    }
    
    fetchStickyNotes();
});