// new_arrivals/new-arrivals.js

(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        const container = document.getElementById('newArrivalsTileContainer');
        if (!container) {
            console.warn('New Arrivals container not found');
            return;
        }

        // Build flip card HTML: front with image, back with "Coming soon" message
        container.innerHTML = `
            <div class="new-arrivals-flip-card" id="newArrivalsFlipCard">
                <div class="front">
                    <span class="new-arrivals-flip-hint"><i class="fas fa-rotate"></i> Tap to flip</span>
                </div>
                <div class="back">
                    <div style="text-align:center; color:#888; font-size:1.2rem; padding:20px;">
                        <i class="fas fa-box-open" style="font-size:3rem; display:block; margin-bottom:15px; color:#ccc;"></i>
                        <p>New arrivals coming soon!</p>
                        <p style="font-size:0.9rem; color:#999;">(Back content will be added later)</p>
                    </div>
                    <span class="new-arrivals-flip-hint"><i class="fas fa-rotate"></i> Tap to flip back</span>
                </div>
            </div>
        `;

        const flipCard = document.getElementById('newArrivalsFlipCard');

        // ----- Flip logic: click on card toggles flip -----
        flipCard.addEventListener('click', function(e) {
            // Don't flip if clicking on the hint itself (it's already a click target)
            if (e.target.closest('.new-arrivals-flip-hint')) return;
            this.classList.toggle('flipped');
            // Update global flippedState if it exists (for navigation persistence)
            if (window.flippedState !== undefined) {
                window.flippedState[8] = this.classList.contains('flipped');
            }
        });

        // Allow flip via hint clicks (stop propagation to avoid double flip)
        const hints = flipCard.querySelectorAll('.new-arrivals-flip-hint');
        hints.forEach(hint => {
            hint.addEventListener('click', function(e) {
                e.stopPropagation();
                const card = this.closest('.new-arrivals-flip-card');
                if (card) {
                    card.classList.toggle('flipped');
                    if (window.flippedState !== undefined) {
                        window.flippedState[8] = card.classList.contains('flipped');
                    }
                }
            });
        });

        // Initialize flip state for this tile (index 8)
        if (window.flippedState !== undefined) {
            window.flippedState[8] = false;
        } else {
            window.flippedState = [];
            window.flippedState[8] = false;
        }

        console.log('✅ New Arrivals tile initialised (front image + empty back)');
    });
})();