// new_arrivals/new-arrivals.js

(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        const container = document.getElementById('newArrivalsTileContainer');
        if (!container) {
            console.warn('New Arrivals container not found');
            return;
        }

        // Build flip card HTML: front with image, back with heading, banner, and browse component
        container.innerHTML = `
            <div class="new-arrivals-flip-card" id="newArrivalsFlipCard">
                <div class="front">
                    <span class="new-arrivals-flip-hint"><i class="fas fa-rotate"></i> Tap to flip</span>
                </div>
                <div class="back">
                    <div style="width:100%; height:100%; display:flex; flex-direction:column; padding:15px; box-sizing:border-box; background:white; border-radius:16px; overflow:hidden;">
                        <!-- HEADING -->
                        <h2 style="text-align:center; margin:0 0 8px 0; color:#333; border-bottom:2px solid #ff6b6b; padding-bottom:6px; flex-shrink:0;">⭐ New Arrivals</h2>
                        
                        <!-- PROMINENT NOTIFICATION BANNER -->
                        <div style="background: #fff3cd; border: 2px solid #ff6b6b; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(255,107,107,0.2); font-size: 15px; color: #333; display: flex; align-items: center; gap: 12px; flex-shrink:0;">
                            <div style="background: #ff6b6b; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink:0;">
                                <i class="fas fa-calendar-alt"></i>
                            </div>
                            <span style="font-weight: 500; line-height: 1.4;">Every Thursday, our new arrivals bin is refreshed with freshly listed records. Come visit us in-store to discover the latest additions!</span>
                        </div>

                        <!-- BROWSE COMPONENT CONTAINER -->
                        <div id="newArrivalsBrowseContainer" style="flex:1; min-height:0; overflow:hidden; width:100%;"></div>
                    </div>
                    <span class="new-arrivals-flip-hint"><i class="fas fa-rotate"></i> Tap to flip back</span>
                </div>
            </div>
        `;

        const flipCard = document.getElementById('newArrivalsFlipCard');

        // ----- Flip logic -----
        flipCard.addEventListener('click', function(e) {
            // Prevent flip if clicking on interactive elements inside the back
            if (e.target.closest('.browse-record-card') ||
                e.target.closest('.new-arrivals-flip-hint') ||
                e.target.closest('button, a, input, select, .browse-filter-btn, .browse-pagination-btn, .browse-filter-checkbox-item, .browse-filter-action-btn')) {
                return;
            }
            this.classList.toggle('flipped');
            if (window.flippedState) {
                window.flippedState[8] = this.classList.contains('flipped');
            }
        });

        const hints = flipCard.querySelectorAll('.new-arrivals-flip-hint');
        hints.forEach(hint => {
            hint.addEventListener('click', function(e) {
                e.stopPropagation();
                const card = this.closest('.new-arrivals-flip-card');
                if (card) {
                    card.classList.toggle('flipped');
                    if (window.flippedState) {
                        window.flippedState[8] = card.classList.contains('flipped');
                    }
                }
            });
        });

        // ----- Initialize the browse component inside the back -----
        function initBrowse() {
            if (typeof createBrowseComponent === 'function') {
                var browseContainer = document.getElementById('newArrivalsBrowseContainer');
                if (browseContainer) {
                    var newArrivalsBrowse = createBrowseComponent('newArrivalsBrowseContainer', {
                        statusIds: '1',
                        defaultNewVinyl: false,
                        requireImage: true,
                        orderBy: 'created_at',
                        orderDir: 'DESC'
                    });
                    newArrivalsBrowse.init();
                    console.log('✅ New Arrivals browse component initialised.');
                } else {
                    console.warn('newArrivalsBrowseContainer not found – retrying...');
                    setTimeout(initBrowse, 100);
                }
            } else {
                console.warn('createBrowseComponent not available – retrying...');
                setTimeout(initBrowse, 100);
            }
        }

        // Try to initialise immediately, but retry if needed
        initBrowse();

        // Initialize flip state for this tile (index 8)
        if (window.flippedState !== undefined) {
            window.flippedState[8] = false;
        } else {
            window.flippedState = [];
            window.flippedState[8] = false;
        }

        console.log('✅ New Arrivals tile initialised (front image + browse component on back)');
    });
})();