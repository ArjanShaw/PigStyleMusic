// new_arrivals/new-arrivals.js

(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        const container = document.getElementById('newArrivalsTileContainer');
        if (!container) {
            console.warn('New Arrivals container not found');
            return;
        }

        // Build flip card HTML
        container.innerHTML = `
            <div class="new-arrivals-flip-card" id="newArrivalsFlipCard">
                <div class="front">
                    <span class="new-arrivals-flip-hint"><i class="fas fa-rotate"></i> Tap to flip</span>
                </div>
                <div class="back">
                    <div style="width:100%; height:100%; display:flex; flex-direction:column; padding:15px; box-sizing:border-box; background:white; border-radius:16px; overflow:hidden;">
                        <h2 style="text-align:center; margin:0 0 8px 0; color:#333; border-bottom:2px solid #ff6b6b; padding-bottom:6px; flex-shrink:0;">⭐ New Arrivals</h2>
                        
                        <div style="background: #fff3cd; border: 2px solid #ff6b6b; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(255,107,107,0.2); font-size: 15px; color: #333; display: flex; align-items: center; gap: 12px; flex-shrink:0;">
                            <div style="background: #ff6b6b; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink:0;">
                                <i class="fas fa-calendar-alt"></i>
                            </div>
                            <span style="font-weight: 500; line-height: 1.4;">Every Thursday, our new arrivals bin is refreshed with freshly listed records. Come visit us in-store to discover the latest additions!</span>
                        </div>

                        <div id="newArrivalsRecordsContainer" style="flex:1; min-height:0; overflow-y:auto; width:100%; padding: 5px 0;"></div>
                    </div>
                    <span class="new-arrivals-flip-hint"><i class="fas fa-rotate"></i> Tap to flip back</span>
                </div>
            </div>
        `;

        const flipCard = document.getElementById('newArrivalsFlipCard');

        // Flip logic - ONLY flip when clicking the card itself or the hint, NOT on records
        flipCard.addEventListener('click', function(e) {
            // If clicking on a record card or anything inside it, DON'T flip
            if (e.target.closest('.new-arrivals-record-card') ||
                e.target.closest('.new-arrivals-flip-hint')) {
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

        // ============ LOAD NEW ARRIVALS ============
        function loadNewArrivals() {
            const recordsContainer = document.getElementById('newArrivalsRecordsContainer');
            if (!recordsContainer) return;

            recordsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">Loading records...</div>';

            const url = AppConfig.baseUrl + '/records?location_ids=150,151,152,153&require_image=true&order_by=created_at&order_dir=DESC&limit=24';

            console.log('🔍 Fetching New Arrivals:', url);

            fetch(url)
                .then(response => response.json())
                .then(data => {
                    console.log('📦 New Arrivals Response:', data);
                    
                    if (data.status !== 'success') {
                        recordsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#dc2626;">Error loading records</div>';
                        return;
                    }

                    const records = data.records || [];
                    if (records.length === 0) {
                        recordsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">No new arrivals available</div>';
                        return;
                    }

                    // Display records in a grid
                    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;">';
                    
                    records.forEach(record => {
                        const price = parseFloat(record.store_price || 0).toFixed(2);
                        const image = record.image_url || '';
                        const artist = record.artist || 'Unknown Artist';
                        const title = record.title || 'Unknown Title';
                        
                        html += `
                            <div class="new-arrivals-record-card" 
                                 style="background:#f8f9fa;border-radius:8px;padding:8px;text-align:center;cursor:pointer;border:2px solid transparent;transition:all 0.2s;"
                                 onmouseover="this.style.borderColor='#ff6b6b';this.style.background='#fff5f5';"
                                 onmouseout="this.style.borderColor='transparent';this.style.background='#f8f9fa';"
                                 onclick="event.stopPropagation(); openRecordPopupFromNewArrivals(${record.id})">
                                <div style="aspect-ratio:1;background:#ddd;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center;margin-bottom:6px;">
                                    ${image ? `<img src="${image}" alt="${title}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-music" style="font-size:32px;color:#999;"></i>'}
                                </div>
                                <div style="font-size:12px;font-weight:600;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(artist)}</div>
                                <div style="font-size:11px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(title)}</div>
                                <div style="font-size:14px;font-weight:700;color:#16a34a;">$${price}</div>
                            </div>
                        `;
                    });
                    
                    html += '</div>';
                    recordsContainer.innerHTML = html;
                    console.log('✅ Displayed', records.length, 'new arrivals');
                })
                .catch(error => {
                    console.error('❌ Error loading new arrivals:', error);
                    recordsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#dc2626;">Failed to load records</div>';
                });
        }

        // Helper functions
        function escapeHTML(str) {
            if (!str) return '';
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        // ============ RECORD POPUP FUNCTION ============
        window.openRecordPopupFromNewArrivals = function(recordId) {
            console.log('🔍 Opening popup for record:', recordId);
            
            // Check if openRecordPopup function exists (from the shop page)
            if (typeof openRecordPopup === 'function') {
                // Fetch the full record data
                const url = AppConfig.baseUrl + '/records?search=' + recordId + '&limit=1';
                console.log('📡 Fetching record data:', url);
                
                fetch(url)
                    .then(response => response.json())
                    .then(data => {
                        console.log('📦 Record data:', data);
                        if (data.status === 'success' && data.records && data.records.length > 0) {
                            const record = data.records[0];
                            openRecordPopup(record);
                        } else {
                            console.error('❌ Record not found:', recordId);
                            alert('Record not found. Please try again.');
                        }
                    })
                    .catch(error => {
                        console.error('❌ Error fetching record:', error);
                        alert('Error loading record details.');
                    });
            } else {
                // Fallback: try using the global function from cart.js
                console.warn('⚠️ openRecordPopup not found, trying fallback');
                
                // If we have the record data already in the DOM, we could use it
                // But we'll just use the popup from the browse component if available
                if (window.openRecordPopupFromBrowse) {
                    window.openRecordPopupFromBrowse(recordId);
                } else {
                    // Last resort: show a simple alert
                    alert('Record ID: ' + recordId + '\nCheckout functionality not fully loaded.');
                }
            }
        };

        // ============ LOAD RECORDS ============
        loadNewArrivals();

        // Refresh every 60 seconds
        setInterval(loadNewArrivals, 60000);

        // Initialize flip state
        if (window.flippedState !== undefined) {
            window.flippedState[8] = false;
        } else {
            window.flippedState = [];
            window.flippedState[8] = false;
        }

        console.log('✅ New Arrivals tile initialised (with popup support)');
    });
})();