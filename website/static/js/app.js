// Load records function
async function loadRecords() {
    try {
        const response = await fetch('http://localhost:5000/records');
        const data = await response.json();
        console.log('Records response:', data);
        
        let html = '';
        if (data.records && data.records.length > 0) {
            data.records.forEach(function(record) {
                html += '<div style="padding:4px 8px;border-bottom:1px solid #eee;">' + 
                        (record.artist || 'Unknown') + ' - ' + 
                        (record.title || 'Untitled') + 
                        ' ($' + (record.store_price || '0') + ')' +
                        '</div>';
            });
        } else {
            html = '<div>No records found</div>';
        }
        
        document.getElementById('recordResponse').innerHTML = html;
    } catch(err) {
        document.getElementById('recordResponse').innerHTML = '<div style="color:red;">Error: ' + err.message + '</div>';
        console.error('Error loading records:', err);
    }
}

// Page navigation
async function showPage(page, btnElement) {
    document.querySelectorAll('nav button').forEach(function(btn) {
        btn.classList.remove('active');
    });
    if (btnElement) {
        btnElement.classList.add('active');
    }
    
    var content = document.getElementById('page-content');
    try {
        var response = await fetch('/tiles/' + page + '.html');
        var html = await response.text();
        content.innerHTML = html;
        
        document.querySelectorAll('.flip-hint').forEach(function(hint) {
            hint.onclick = function(e) {
                e.stopPropagation();
                var card = this.closest('.flip-card');
                if (card) {
                    card.classList.toggle('flipped');
                }
            };
        });
        
        // If shop page, load records automatically
        if (page === 'shop') {
            setTimeout(loadRecords, 200);
        }
        
    } catch(err) {
        content.innerHTML = '<div class="simple-page"><h1>Error</h1><p>Failed to load page</p></div>';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    var homeBtn = document.querySelector('nav button:first-child');
    if (homeBtn) {
        homeBtn.classList.add('active');
    }
    showPage('home');
});
