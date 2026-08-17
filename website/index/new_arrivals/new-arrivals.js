// new_arrivals/new-arrivals.js

(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        const container = document.getElementById('newArrivalsTileContainer');
        if (!container) {
            console.warn('New Arrivals container not found');
            return;
        }

        // Build flip card HTML: front with image, back with browse component container
        container.innerHTML = `
            <div class="new-arrivals-flip-card" id="newArrivalsFlipCard">
                <div class="front">
                    <span class="new-arrivals-flip-hint"><i class="fas fa-rotate"></i> Tap to flip</span>
                </div>
                <div class="back">
                    <div class="new-arrivals-back-content" style="width:100%; height:100%; display:flex; flex-direction:column; padding:15px; box-sizing:border-box;">
                        <h2 style="text-align:center; margin:0 0 8px 0; color:#333; border-bottom:2px solid #ff6b6b; padding-bottom:6px; flex-shrink:0;">⭐ New Arrivals</h2>
                        <div id="newArrivalsBrowseContainer" style="flex:1; min-height:0; overflow:hidden; width:100%;"></div>
                    </div>
                    <span class="new-arrivals-flip-hint"><i class="fas fa-rotate"></i> Tap to flip back</span>
                </div>
            </div>
        `;

        const flipCard = document.getElementById('newArrivalsFlipCard');

        // ----- Flip logic -----
        flipCard.addEventListener('click', function(e) {
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