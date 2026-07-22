// ============================================================================
// tab-manager.js - Centralized Tab Management System
// ============================================================================

// Tab Manager Module
const TabManager = (function() {
    // Private variables
    let currentTab = null;
    let tabs = {};
    let initializers = {};
    let cleanupFunctions = {};
    
    // Get active tab from sessionStorage
    function getStoredTab() {
        try {
            return sessionStorage.getItem('activeTab');
        } catch (e) {
            console.warn('Could not read from sessionStorage:', e);
            return null;
        }
    }
    
    // Save active tab to sessionStorage
    function saveStoredTab(tabName) {
        try {
            sessionStorage.setItem('activeTab', tabName);
        } catch (e) {
            console.warn('Could not save to sessionStorage:', e);
        }
    }
    
    // Register tab initializers
    function registerInitializers() {
        // Inventory Ops Tab (formerly Add Records)
        initializers['add-records'] = () => {
            console.log('🔵 TabManager: Initializing Inventory Ops tab');
            if (typeof window.initAddRecordsTab === 'function') {
                window.initAddRecordsTab();
            } else {
                console.warn('⚠️ initAddRecordsTab not found');
            }
        };
        
        // Check Out Tab (removed from UI but kept for compatibility)
        initializers['check-out'] = () => {
            console.log('🔵 TabManager: Initializing Check Out tab');
            if (typeof window.initCheckout === 'function') {
                window.initCheckout();
            } else if (typeof window.initCheckoutTab === 'function') {
                window.initCheckoutTab();
            } else {
                console.warn('⚠️ initCheckout not found');
            }
        };
        
        // Inventory Tab
        initializers['inventory'] = () => {
            console.log('🔵 TabManager: Initializing Inventory tab');
            if (typeof window.initInventoryTab === 'function') {
                window.initInventoryTab();
            } else {
                console.warn('⚠️ initInventoryTab not found');
            }
        };
        
        // Discogs Tab
        initializers['discogs'] = () => {
            console.log('🔵 TabManager: Initializing Discogs tab');
            if (typeof window.initDiscogsTab === 'function') {
                console.log('✅ Found initDiscogsTab function, calling it...');
                window.initDiscogsTab();
            } else {
                console.error('❌ initDiscogsTab function not found!');
                console.log('Available window functions:', Object.keys(window).filter(k => k.toLowerCase().includes('discogs')));
            }
        };
        
        // Discogs Orders Tab
        initializers['discogs-orders'] = () => {
            console.log('🔵 TabManager: Initializing Discogs Orders tab');
            if (typeof window.initDiscogsOrdersTab === 'function') {
                console.log('✅ Found initDiscogsOrdersTab function, calling it...');
                window.initDiscogsOrdersTab();
            } else {
                console.error('❌ initDiscogsOrdersTab function not found!');
                console.log('Available window functions:', Object.keys(window).filter(k => k.toLowerCase().includes('discogs')));
            }
        };
        
        // Accessories Tab
        initializers['accessories'] = () => {
            console.log('🔵 TabManager: Initializing Accessories tab');
            if (typeof window.initAccessoriesTab === 'function') {
                window.initAccessoriesTab();
            } else if (typeof window.loadAccessories === 'function') {
                window.loadAccessories();
            } else {
                console.warn('⚠️ initAccessoriesTab not found');
            }
        };
        
        // Users Tab
        initializers['users'] = () => {
            console.log('🔵 TabManager: Initializing Users tab');
            if (typeof window.initUsersTab === 'function') {
                window.initUsersTab();
            } else if (typeof window.loadUsers === 'function') {
                window.loadUsers();
            } else {
                console.warn('⚠️ initUsersTab not found');
            }
        };
        
        // Admin Config Tab
        initializers['admin-config'] = () => {
            console.log('🔵 TabManager: Initializing Admin Config tab');
            if (typeof window.initAdminConfigTab === 'function') {
                window.initAdminConfigTab();
            } else if (typeof window.loadConfigTables === 'function') {
                window.loadConfigTables();
            } else {
                console.warn('⚠️ initAdminConfigTab not found');
            }
        };
        
        // Price Tags Tab (kept for compatibility)
        initializers['price-tags'] = () => {
            console.log('🔵 TabManager: Initializing Price Tags tab');
            if (typeof window.initPriceTagsTab === 'function') {
                window.initPriceTagsTab();
            } else if (typeof window.loadRecordsForPriceTags === 'function') {
                window.loadRecordsForPriceTags();
            } else {
                console.warn('⚠️ initPriceTagsTab not found');
            }
        };
        
        // Custom Labels Tab
        initializers['custom-labels'] = () => {
            console.log('🔵 TabManager: Initializing Custom Labels tab');
            if (typeof window.initCustomLabelsTab === 'function') {
                window.initCustomLabelsTab();
            } else if (typeof window.customLabelsGeneratePDF === 'function') {
                console.log('✅ Custom labels functions available');
            } else {
                console.warn('⚠️ Custom labels functions not found');
            }
        };
        
        // Orders Tab
        initializers['orders'] = () => {
            console.log('🔵 TabManager: Initializing Orders tab');
            if (typeof window.initOrdersTab === 'function') {
                window.initOrdersTab();
            } else if (typeof window.loadOrders === 'function') {
                window.loadOrders();
            } else {
                console.warn('⚠️ initOrdersTab not found');
            }
        };
        
        // Database Query Tab
        initializers['db-query'] = () => {
            console.log('🔵 TabManager: Initializing Database Query tab');
            if (typeof window.initDbQueryTab === 'function') {
                window.initDbQueryTab();
            } else {
                console.warn('⚠️ initDbQueryTab not found');
            }
        };
        
        // Sticky Notes Tab
        initializers['sticky-notes'] = () => {
            console.log('🔵 TabManager: Initializing Sticky Notes tab');
            if (typeof window.initStickyNotesTab === 'function') {
                window.initStickyNotesTab();
            } else if (typeof window.loadStickyNotes === 'function') {
                window.loadStickyNotes();
            } else {
                console.warn('⚠️ Sticky Notes functions not found');
            }
        };
        
        // Stats Tab
        initializers['stats'] = () => {
            console.log('🔵 TabManager: Initializing Stats tab');
            if (typeof window.initStatsTab === 'function') {
                window.initStatsTab();
            } else {
                console.warn('⚠️ initStatsTab not found');
            }
        };
        
        // Inventory Purchases Tab
        initializers['inventory-purchases'] = () => {
            console.log('🔵 TabManager: Initializing Inventory Purchases tab');
            if (typeof window.initInventoryPurchasesTab === 'function') {
                window.initInventoryPurchasesTab();
            } else if (typeof window.loadInventoryPurchases === 'function') {
                window.loadInventoryPurchases();
            } else {
                console.warn('⚠️ initInventoryPurchasesTab not found');
            }
        };
        
        // ============================================================
        // CREDITORS TAB - NEW
        // ============================================================
        initializers['creditors'] = () => {
            console.log('🔵 TabManager: Initializing Creditors tab');
            if (typeof window.initCreditorsTab === 'function') {
                console.log('✅ Found initCreditorsTab function, calling it...');
                window.initCreditorsTab();
            } else {
                console.warn('⚠️ initCreditorsTab not found - admin-creditors.js may not be loaded');
            }
        };
    }
    
    // Register cleanup functions
    function registerCleanupFunctions() {
        cleanupFunctions = {
            'discogs': () => {
                if (window.closeProgressModal) {
                    window.closeProgressModal();
                }
            },
            'inventory': () => {
                if (window.closeDuplicateRecordModal) {
                    window.closeDuplicateRecordModal();
                }
            },
            'discogs-orders': () => {
                const modal = document.getElementById('discogs-order-modal');
                if (modal) {
                    modal.style.display = 'none';
                }
            }
        };
    }
    
    // Clean up current tab before switching
    function cleanupCurrentTab() {
        if (currentTab && cleanupFunctions[currentTab]) {
            try {
                cleanupFunctions[currentTab]();
                console.log(`🧹 TabManager: Cleaned up ${currentTab}`);
            } catch (error) {
                console.error(`Error cleaning up ${currentTab}:`, error);
            }
        }
    }
    
    // Initialize a specific tab
    function initializeTab(tabName) {
        if (initializers[tabName]) {
            try {
                initializers[tabName]();
                return true;
            } catch (error) {
                console.error(`❌ TabManager: Error initializing ${tabName}:`, error);
                return false;
            }
        } else {
            console.warn(`⚠️ TabManager: No initializer found for ${tabName}`);
            return false;
        }
    }
    
    // Activate a specific tab
    function activateTab(tabName) {
        if (!tabName) return false;
        
        console.log(`🟡 TabManager: Switching to tab: ${tabName}`);
        
        // Find all tab elements and contents
        const tabElements = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        
        // Update tab elements active state
        let tabFound = false;
        tabElements.forEach(tab => {
            const tabId = tab.getAttribute('data-tab');
            if (tabId === tabName) {
                tab.classList.add('active');
                tabFound = true;
                console.log(`✅ TabManager: Activated tab element for ${tabName}`);
            } else {
                tab.classList.remove('active');
            }
        });
        
        if (!tabFound) {
            console.warn(`⚠️ TabManager: Tab element not found for ${tabName}`);
        }
        
        // Update tab contents active state
        let contentFound = false;
        tabContents.forEach(content => {
            const contentId = content.id;
            const expectedId = `${tabName}-tab`;
            if (contentId === expectedId) {
                content.classList.add('active');
                contentFound = true;
                console.log(`✅ TabManager: Activated content for ${expectedId}`);
            } else {
                content.classList.remove('active');
            }
        });
        
        if (!contentFound) {
            console.warn(`⚠️ TabManager: Content element not found for ${tabName}-tab`);
        }
        
        // Clean up previous tab
        cleanupCurrentTab();
        
        // Initialize new tab
        const initSuccess = initializeTab(tabName);
        
        if (initSuccess) {
            currentTab = tabName;
            saveStoredTab(tabName);
            
            // Dispatch custom event for tab change
            const event = new CustomEvent('tabChanged', {
                detail: { tabName: tabName, timestamp: Date.now() }
            });
            document.dispatchEvent(event);
            console.log(`📢 TabManager: Dispatched tabChanged event for ${tabName}`);
        }
        
        return initSuccess;
    }
    
    // Set up tab click handlers
    function setupTabClickHandlers() {
        const tabElements = document.querySelectorAll('.tab');
        
        tabElements.forEach(tab => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                const tabName = this.getAttribute('data-tab');
                console.log(`👆 Tab clicked: ${tabName}`);
                if (tabName && tabName !== currentTab) {
                    activateTab(tabName);
                }
            });
        });
        
        console.log(`✅ TabManager: Set up ${tabElements.length} tab click handlers`);
    }
    
    // Handle hash changes (for deep linking)
    function handleHashChange() {
        const hash = window.location.hash.substring(1);
        if (hash && tabs[hash]) {
            activateTab(hash);
        }
    }
    
    // Get all available tabs
    function getAvailableTabs() {
        const tabElements = document.querySelectorAll('.tab');
        return Array.from(tabElements).map(tab => tab.getAttribute('data-tab'));
    }
    
    // Get current active tab
    function getCurrentTab() {
        return currentTab;
    }
    
    // Check if tab exists
    function tabExists(tabName) {
        const tabsList = getAvailableTabs();
        return tabsList.includes(tabName);
    }
    
    // Public API
    return {
        init: function() {
            console.log('🚀 TabManager: Initializing...');
            
            registerInitializers();
            registerCleanupFunctions();
            
            const availableTabs = getAvailableTabs();
            console.log(`📑 TabManager: Available tabs: ${availableTabs.join(', ')}`);
            
            setupTabClickHandlers();
            
            let initialTab = null;
            const storedTab = getStoredTab();
            if (storedTab && tabExists(storedTab)) {
                initialTab = storedTab;
                console.log(`💾 TabManager: Restoring stored tab: ${initialTab}`);
            }
            
            const hash = window.location.hash.substring(1);
            if (hash && tabExists(hash)) {
                initialTab = hash;
                console.log(`🔗 TabManager: Using hash from URL: ${initialTab}`);
            }
            
            if (!initialTab) {
                const activeTabElement = document.querySelector('.tab.active');
                if (activeTabElement) {
                    initialTab = activeTabElement.getAttribute('data-tab');
                    console.log(`📌 TabManager: Found active tab in DOM: ${initialTab}`);
                }
            }
            
            if (!initialTab && availableTabs.length > 0) {
                initialTab = availableTabs[0];
                console.log(`🎯 TabManager: Using default tab: ${initialTab}`);
            }
            
            if (initialTab) {
                activateTab(initialTab);
            } else {
                console.error('❌ TabManager: No tabs available to activate!');
            }
            
            window.addEventListener('hashchange', handleHashChange);
            console.log('✅ TabManager: Initialization complete');
        },
        
        switchToTab: function(tabName) {
            if (tabExists(tabName)) {
                return activateTab(tabName);
            } else {
                console.error(`❌ TabManager: Tab "${tabName}" does not exist`);
                return false;
            }
        },
        
        getCurrentTab: getCurrentTab,
        getTabs: getAvailableTabs,
        tabExists: tabExists,
        refreshCurrentTab: function() {
            if (currentTab) {
                initializeTab(currentTab);
            }
        },
        
        registerInitializer: function(tabName, initFunction) {
            if (typeof initFunction === 'function') {
                initializers[tabName] = initFunction;
                console.log(`✅ TabManager: Registered initializer for ${tabName}`);
                return true;
            } else {
                console.error(`❌ TabManager: Invalid initializer for ${tabName}`);
                return false;
            }
        },
        
        registerCleanup: function(tabName, cleanupFunction) {
            if (typeof cleanupFunction === 'function') {
                cleanupFunctions[tabName] = cleanupFunction;
                console.log(`✅ TabManager: Registered cleanup for ${tabName}`);
                return true;
            } else {
                console.error(`❌ TabManager: Invalid cleanup for ${tabName}`);
                return false;
            }
        }
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('🟢 DOM fully loaded, initializing TabManager...');
    setTimeout(function() {
        if (window.TabManager) {
            window.TabManager.init();
        } else {
            console.error('❌ TabManager not found!');
        }
    }, 100);
});

// Also try to initialize if DOMContentLoaded already fired
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (window.TabManager && !window.TabManager._initialized) {
            window.TabManager.init();
        }
    });
} else {
    setTimeout(function() {
        if (window.TabManager && !window.TabManager._initialized) {
            window.TabManager.init();
        }
    }, 100);
}

window.TabManager = TabManager;
console.log('✅ tab-manager.js loaded');