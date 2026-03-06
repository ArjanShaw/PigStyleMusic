// ============================================================================
// tab-manager.js - SINGLE SOURCE OF TRUTH for tab management
// ============================================================================

const TabManager = {
    // Registry of tab initialization functions
    tabInitializers: {
        'add-edit-delete': () => {
            console.log('🔵 TabManager: Initializing Add/Edit/Delete tab');
            if (typeof window.addEditDeleteManager !== 'undefined') {
                // Add/Edit/Delete tab has no specific init function
            }
        },
        
        'check-out': () => {
            console.log('🔵 TabManager: Initializing Check Out tab');
            
            // Reset search results if empty
            const searchResults = document.getElementById('search-results');
            if (searchResults && (!window.currentSearchResults || window.currentSearchResults.length === 0)) {
                searchResults.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <i class="fas fa-search" style="font-size: 48px; margin-bottom: 20px; color: #ccc;"></i>
                        <p>Enter a search term to find records or accessories</p>
                    </div>
                `;
            }
            
            // Refresh terminals if function exists
            if (typeof window.refreshTerminals === 'function') {
                console.log('🔄 TabManager: Refreshing terminals');
                window.refreshTerminals();
            } else {
                console.warn('⚠️ TabManager: refreshTerminals function not found');
            }
        },
        
        'receipts': () => {
            console.log('🔵 TabManager: Initializing Receipts tab');
            
            if (typeof window.initializeReceiptsTab === 'function') {
                console.log('🔄 TabManager: Calling initializeReceiptsTab()');
                window.initializeReceiptsTab();
            } else {
                console.warn('⚠️ TabManager: initializeReceiptsTab function not found');
                // Fallback to search receipts
                if (typeof window.searchReceipts === 'function') {
                    window.searchReceipts(1);
                }
            }
        },
        
        'users': () => {
            console.log('🔵 TabManager: Initializing Users tab');
            
            if (typeof window.loadUsers === 'function') {
                console.log('🔄 TabManager: Calling loadUsers()');
                window.loadUsers();
            } else {
                console.error('❌ TabManager: loadUsers function not found!');
                
                // Show error in users table
                const usersBody = document.getElementById('users-body');
                if (usersBody) {
                    usersBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: #dc3545; padding: 40px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i><br>
                        <strong>ERROR: loadUsers function not found</strong><br>
                        <small>Check browser console for details</small>
                    </td></tr>`;
                }
            }
        },
        
        'artists': () => {
            console.log('🔵 TabManager: Initializing Artists tab');
            
            if (typeof window.loadArtists === 'function') {
                console.log('🔄 TabManager: Calling loadArtists()');
                window.loadArtists();
            } else {
                console.error('❌ TabManager: loadArtists function not found');
            }
        },
        
        'accessories': () => {
            console.log('🔵 TabManager: Initializing Accessories tab');
            
            if (typeof window.loadAccessories === 'function') {
                console.log('🔄 TabManager: Calling loadAccessories()');
                window.loadAccessories();
            } else {
                console.error('❌ TabManager: loadAccessories function not found');
            }
        },
        
        'price-checker': () => {
            console.log('🔵 TabManager: Initializing Price Checker tab');
            // Price checker initializes on its own
        },
        
        'admin-config': () => {
            console.log('🔵 TabManager: Initializing Admin Config tab');
            
            if (typeof window.loadConfigTables === 'function') {
                console.log('🔄 TabManager: Calling loadConfigTables()');
                window.loadConfigTables();
            } else {
                console.error('❌ TabManager: loadConfigTables function not found');
            }
        },
        
        'price-tags': () => {
            console.log('🔵 TabManager: Initializing Price Tags tab');
            
            if (typeof window.loadConsignorsForPriceTags === 'function') {
                console.log('🔄 TabManager: Calling loadConsignorsForPriceTags()');
                window.loadConsignorsForPriceTags();
            } else {
                console.warn('⚠️ TabManager: loadConsignorsForPriceTags not found');
            }
            
            if (typeof window.loadRecordsForPriceTags === 'function') {
                console.log('🔄 TabManager: Calling loadRecordsForPriceTags()');
                window.loadRecordsForPriceTags();
            } else {
                console.warn('⚠️ TabManager: loadRecordsForPriceTags not found');
            }
        },
        
        'orders': () => {
            console.log('🔵 TabManager: Initializing Orders tab');
            
            if (typeof window.loadOrders === 'function') {
                console.log('🔄 TabManager: Calling loadOrders()');
                window.loadOrders();
            } else {
                console.error('❌ TabManager: loadOrders function not found');
                
                // Show error in orders table
                const ordersBody = document.getElementById('orders-body');
                if (ordersBody) {
                    ordersBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: #dc3545; padding: 40px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i><br>
                        <strong>ERROR: loadOrders function not found</strong><br>
                        <small>Check if admin-orders.js is loaded correctly</small>
                    </td></tr>`;
                }
            }
        },
        
        'db-query': () => {
            console.log('🔵 TabManager: Initializing Database Query tab');
            
            if (typeof window.loadSchema === 'function') {
                console.log('🔄 TabManager: Calling loadSchema()');
                window.loadSchema();
            } else {
                console.log('ℹ️ TabManager: loadSchema will be called by db-query.js');
            }
        },
        
        'discogs': () => {
            console.log('🔵 TabManager: Initializing Discogs tab');
            
            if (typeof window.loadDiscogsInventory === 'function') {
                console.log('🔄 TabManager: Calling loadDiscogsInventory()');
                window.loadDiscogsInventory();
            } else {
                console.error('❌ TabManager: loadDiscogsInventory function not found');
                
                // Show error in discogs table
                const discogsBody = document.getElementById('discogs-inventory-body');
                if (discogsBody) {
                    discogsBody.innerHTML = `<tr><td colspan="12" style="text-align:center; color: #dc3545; padding: 40px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i><br>
                        <strong>ERROR: loadDiscogsInventory function not found</strong><br>
                        <small>Check if discogs.js is loaded correctly</small>
                    </td></tr>`;
                }
            }
        }
    },
    
    // Single function to switch tabs
    switchTab(tabName) {
        console.log(`🟡 TabManager: Switching to tab: ${tabName}`);
        
        // Update UI - remove active class from all tabs and content
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Find and activate the clicked tab (using data-tab attribute)
        const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (tab) {
            tab.classList.add('active');
            console.log(`✅ TabManager: Activated tab element for ${tabName}`);
        } else {
            console.warn(`⚠️ TabManager: No tab element found with data-tab="${tabName}"`);
        }
        
        // Find and activate the content
        const content = document.getElementById(`${tabName}-tab`);
        if (content) {
            content.classList.add('active');
            console.log(`✅ TabManager: Activated content for ${tabName}-tab`);
        } else {
            console.warn(`⚠️ TabManager: No content element found with id="${tabName}-tab"`);
        }
        
        // Run initializer if it exists
        const initializer = this.tabInitializers[tabName];
        if (initializer) {
            console.log(`🟢 TabManager: Found initializer for ${tabName}, executing...`);
            initializer();
        } else {
            console.warn(`⚠️ TabManager: No initializer found for tab: ${tabName}`);
        }
        
        // Store current tab in sessionStorage
        sessionStorage.setItem('currentTab', tabName);
        console.log(`💾 TabManager: Saved tab ${tabName} to sessionStorage`);
        
        // Update URL hash (optional)
        window.location.hash = tabName;
        
        // Dispatch event for any modules that need to know about tab changes
        const event = new CustomEvent('tabChanged', { 
            detail: { tabName: tabName } 
        });
        document.dispatchEvent(event);
        console.log(`📢 TabManager: Dispatched tabChanged event for ${tabName}`);
    },
    
    // Attach click handlers to all tabs
    attachClickHandlers() {
        console.log('🔵 TabManager: Attaching click handlers to tabs');
        
        const tabs = document.querySelectorAll('.tab');
        console.log(`Found ${tabs.length} tabs to attach handlers to`);
        
        // Use bind to ensure 'this' context in handler
        const handleTabClick = (event) => {
            const tab = event.currentTarget;
            const tabName = tab.getAttribute('data-tab');
            
            if (tabName) {
                console.log(`👆 Tab clicked: ${tabName}`);
                this.switchTab(tabName);
            } else {
                console.error('❌ Tab clicked but has no data-tab attribute');
            }
        };
        
        tabs.forEach((tab, index) => {
            // Remove any existing click handlers (to prevent duplicates)
            tab.removeEventListener('click', handleTabClick);
            
            // Add new click handler
            tab.addEventListener('click', handleTabClick);
            
            console.log(`✅ Attached click handler to tab ${index + 1}:`, tab.getAttribute('data-tab'));
        });
        
        // Store the handler for potential cleanup (optional)
        this.clickHandler = handleTabClick;
    },
    
    // Initialize based on saved preference or default
    init() {
        console.log('🟢 TabManager: Initializing...');
        
        // First, attach click handlers to all tabs
        this.attachClickHandlers();
        
        // Determine which tab to show initially
        
        // 1. Check URL hash first (highest priority)
        const hash = window.location.hash.substring(1);
        if (hash) {
            console.log(`🔗 TabManager: Found URL hash: ${hash}`);
            
            const tabElement = document.querySelector(`.tab[data-tab="${hash}"]`);
            if (tabElement) {
                console.log(`✅ TabManager: URL hash matches a tab, switching to ${hash}`);
                this.switchTab(hash);
                return;
            } else {
                console.warn(`⚠️ TabManager: URL hash "${hash}" doesn't match any tab`);
            }
        }
        
        // 2. Check saved tab in sessionStorage
        const savedTab = sessionStorage.getItem('currentTab');
        if (savedTab) {
            console.log(`🔄 TabManager: Found saved tab: ${savedTab}`);
            
            const tabElement = document.querySelector(`.tab[data-tab="${savedTab}"]`);
            if (tabElement) {
                console.log(`✅ TabManager: Saved tab matches, switching to ${savedTab}`);
                this.switchTab(savedTab);
                return;
            } else {
                console.warn(`⚠️ TabManager: Saved tab "${savedTab}" not found`);
            }
        }
        
        // 3. Default to first tab
        const firstTab = document.querySelector('.tab');
        if (firstTab) {
            const tabName = firstTab.getAttribute('data-tab');
            console.log(`📌 TabManager: Defaulting to first tab: ${tabName}`);
            this.switchTab(tabName);
        } else {
            console.error('❌ TabManager: No tabs found in document');
        }
    }
};

// Make TabManager globally available
window.TabManager = TabManager;

console.log('✅ tab-manager.js loaded successfully');