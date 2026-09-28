// Post to eBay page - STUB
(function() {
    'use strict';

    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://www.pigstylemusic.com';

    console.log('🛒 [POST-TO-EBAY] JS file loaded');
    console.log('🛒 [POST-TO-EBAY] API_BASE:', API_BASE);

    window.initPostToEbay = function() {
        console.log('🛒 [POST-TO-EBAY] initPostToEbay() called');

        const statusEl = document.getElementById('ebay-load-status');
        const contentEl = document.getElementById('ebay-content');

        if (!statusEl || !contentEl) {
            console.error('❌ [POST-TO-EBAY] HTML tile did NOT load — elements missing');
            return;
        }

        console.log('✅ [POST-TO-EBAY] HTML tile loaded — elements found');

        statusEl.textContent = '✅ eBay module loaded (stub — no actions wired)';
        statusEl.style.background = '#d4edda';
        statusEl.style.color = '#155724';

        fetch(`${API_BASE}/api/ebay/auth/url`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(function(res) {
            if (res.ok) {
                console.log('✅ [POST-TO-EBAY] Backend /api/ebay/auth/url reachable');
                statusEl.textContent = '✅ eBay module loaded — backend reachable (stub)';
            } else {
                console.warn('⚠️ [POST-TO-EBAY] Backend responded', res.status);
                statusEl.textContent = `✅ Module loaded — backend responded ${res.status} (stub)`;
                statusEl.style.background = '#fff3cd';
                statusEl.style.color = '#856404';
            }
        })
        .catch(function(err) {
            console.warn('⚠️ [POST-TO-EBAY] Backend not reachable:', err.message);
            statusEl.textContent = '✅ Module loaded — backend unreachable (stub, expected on some envs)';
            statusEl.style.background = '#fff3cd';
            statusEl.style.color = '#856404';
        });

        contentEl.innerHTML = `
            <div style="font-size: 48px;">🛒</div>
            <div style="font-size: 15px;">Post to eBay — coming soon</div>
            <div style="font-size: 12px; color: #bbb;">JS stub loaded. Backend endpoints exist but no UI actions yet.</div>
        `;
    };

    window.resetPostToEbay = function() {
        console.log('🛒 [POST-TO-EBAY] resetPostToEbay() called');
    };

})();