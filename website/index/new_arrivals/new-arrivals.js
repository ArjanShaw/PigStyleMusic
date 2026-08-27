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
                        
                        <!-- Pagination -->
                        <div id="newArrivalsPagination" style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px solid #eee; flex-shrink:0; margin-top:8px;">
                            <div style="font-size:13px; color:#666;">
                                Showing <span id="newArrivalsStart">0</span>-<span id="newArrivalsEnd">0</span> of <span id="newArrivalsTotal">0</span>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button id="newArrivalsPrevBtn" style="padding:4px 12px; border:1px solid #ddd; border-radius:4px; background:white; cursor:pointer; font-size:13px;">← Prev</button>
                                <span id="newArrivalsPageInfo" style="font-size:13px; color:#666; padding:4px 8px;">1 / 1</span>
                                <button id="newArrivalsNextBtn" style="padding:4px 12px; border:1px solid #ddd; border-radius:4px; background:white; cursor:pointer; font-size:13px;">Next →</button>
                            </div>
                            <div>
                                <select id="newArrivalsPageSize" style="padding:4px 8px; border:1px solid #ddd; border-radius:4px; font-size:13px;">
                                    <option value="12">12</option>
                                    <option value="24" selected>24</option>
                                    <option value="48">48</option>
                                    <option value="96">96</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <span class="new-arrivals-flip-hint"><i class="fas fa-rotate"></i> Tap to flip back</span>
                </div>
            </div>
        `;

        const flipCard = document.getElementById('newArrivalsFlipCard');

        // Flip logic
        flipCard.addEventListener('click', function(e) {
            if (e.target.closest('.new-arrivals-record-card') ||
                e.target.closest('.new-arrivals-flip-hint') ||
                e.target.closest('button, select')) {
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

        // ============ PAGINATION STATE ============
        let currentPage = 1;
        let pageSize = 24;
        let totalRecords = 0;
        let allRecords = [];

        // ============ LOAD NEW ARRIVALS ============
        function loadNewArrivals(page) {
            page = page || 1;
            const recordsContainer = document.getElementById('newArrivalsRecordsContainer');
            if (!recordsContainer) return;

            recordsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">Loading records...</div>';

            const offset = (page - 1) * pageSize;
            const url = AppConfig.baseUrl + '/records?location_ids=150,151,152,153&require_image=true&order_by=created_at&order_dir=DESC&limit=' + pageSize + '&offset=' + offset;

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
                    totalRecords = data.total || 0;
                    currentPage = page;
                    allRecords = records;

                    if (records.length === 0 && totalRecords === 0) {
                        recordsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">No new arrivals available</div>';
                        updatePaginationUI();
                        return;
                    }

                    displayRecords(records);
                    updatePaginationUI();
                })
                .catch(error => {
                    console.error('❌ Error loading new arrivals:', error);
                    recordsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#dc2626;">Failed to load records</div>';
                });
        }

        // ============ DISPLAY RECORDS ============
        function displayRecords(records) {
            const recordsContainer = document.getElementById('newArrivalsRecordsContainer');
            if (!recordsContainer) return;

            if (!records || records.length === 0) {
                recordsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">No records found</div>';
                return;
            }

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
        }

        // ============ PAGINATION UI ============
        function updatePaginationUI() {
            const totalPages = Math.ceil(totalRecords / pageSize);
            const start = (currentPage - 1) * pageSize + 1;
            const end = Math.min(currentPage * pageSize, totalRecords);

            document.getElementById('newArrivalsStart').textContent = totalRecords > 0 ? start : 0;
            document.getElementById('newArrivalsEnd').textContent = totalRecords > 0 ? end : 0;
            document.getElementById('newArrivalsTotal').textContent = totalRecords;
            document.getElementById('newArrivalsPageInfo').textContent = currentPage + ' / ' + totalPages;

            document.getElementById('newArrivalsPrevBtn').disabled = currentPage <= 1;
            document.getElementById('newArrivalsNextBtn').disabled = currentPage >= totalPages;
        }

        // ============ PAGINATION EVENTS ============
        function setupPaginationEvents() {
            document.getElementById('newArrivalsPrevBtn').addEventListener('click', function() {
                if (currentPage > 1) {
                    loadNewArrivals(currentPage - 1);
                }
            });

            document.getElementById('newArrivalsNextBtn').addEventListener('click', function() {
                const totalPages = Math.ceil(totalRecords / pageSize);
                if (currentPage < totalPages) {
                    loadNewArrivals(currentPage + 1);
                }
            });

            document.getElementById('newArrivalsPageSize').addEventListener('change', function() {
                pageSize = parseInt(this.value);
                currentPage = 1;
                loadNewArrivals(1);
            });
        }

        // ============ RECORD POPUP ============
        window.openRecordPopupFromNewArrivals = function(recordId) {
            console.log('🔍 Opening popup for record:', recordId);
            
            if (typeof openRecordPopup === 'function') {
                const url = AppConfig.baseUrl + '/records?search=' + recordId + '&limit=1';
                fetch(url)
                    .then(response => response.json())
                    .then(data => {
                        if (data.status === 'success' && data.records && data.records.length > 0) {
                            openRecordPopup(data.records[0]);
                        } else {
                            alert('Record not found.');
                        }
                    })
                    .catch(error => {
                        console.error('❌ Error fetching record:', error);
                        alert('Error loading record details.');
                    });
            } else {
                alert('Record ID: ' + recordId + '\nCheckout not available.');
            }
        };

        // ============ HELPER ============
        function escapeHTML(str) {
            if (!str) return '';
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        // ============ INIT ============
        loadNewArrivals(1);
        setupPaginationEvents();

        // Refresh every 60 seconds
        setInterval(function() {
            loadNewArrivals(currentPage);
        }, 60000);

        if (window.flippedState !== undefined) {
            window.flippedState[8] = false;
        } else {
            window.flippedState = [];
            window.flippedState[8] = false;
        }

        console.log('✅ New Arrivals tile initialised (with pagination)');
    });
})();