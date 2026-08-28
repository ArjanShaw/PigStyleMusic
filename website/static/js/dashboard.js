// Dashboard page
(function() {
    function getUser() {
        try {
            const data = localStorage.getItem('pigstyle_user');
            if (data) {
                return JSON.parse(data);
            }
        } catch {}
        return null;
    }

    async function loadDashboardStats() {
        const user = getUser();
        if (!user || !user.logged_in) {
            return;
        }

        try {
            // Load user records
            const response = await fetch(`/records/user/${user.user_id}`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            
            if (data.status === 'success' && data.records) {
                const records = data.records;
                
                // Calculate stats
                let totalSpent = 0;
                let monthSpent = 0;
                let totalPurchases = 0;
                let monthPurchases = 0;
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();

                records.forEach(record => {
                    const price = parseFloat(record.store_price) || 0;
                    totalSpent += price;
                    totalPurchases++;

                    // Check if record was added this month
                    const createdDate = new Date(record.created_at);
                    if (createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear) {
                        monthSpent += price;
                        monthPurchases++;
                    }
                });

                // Update UI
                document.getElementById('dash-total-spent').textContent = `$${totalSpent.toFixed(2)}`;
                document.getElementById('dash-month-spent').textContent = `$${monthSpent.toFixed(2)}`;
                document.getElementById('dash-total-purchases').textContent = totalPurchases;
                document.getElementById('dash-month-purchases').textContent = monthPurchases;

                // Commission rate
                const commissionResponse = await fetch('/api/commission-rate', {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
                const commissionData = await commissionResponse.json();
                if (commissionData.status === 'success') {
                    document.getElementById('dash-commission-rate').textContent = `${commissionData.commission_rate || 20}%`;
                }

                // Recent activity
                const sorted = records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                const recent = sorted.slice(0, 5);
                const activityDiv = document.getElementById('dash-recent-activity');
                if (recent.length > 0) {
                    let html = '';
                    recent.forEach(r => {
                        const date = new Date(r.created_at);
                        const dateStr = date.toLocaleDateString();
                        html += `<div style="padding: 6px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between;">
                            <span>${r.artist || 'Unknown'} - ${r.title || 'Untitled'}</span>
                            <span style="color: #999; font-size: 12px;">${dateStr}</span>
                        </div>`;
                    });
                    activityDiv.innerHTML = html;
                } else {
                    activityDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No records found</div>';
                }
            }
        } catch (err) {
            console.error('Error loading dashboard stats:', err);
        }
    }

    window.initDashboard = function() {
        console.log('Dashboard initialized');
        const user = getUser();
        if (user && user.logged_in) {
            const userInfo = document.getElementById('dashboardUser');
            if (userInfo) {
                userInfo.textContent = `Welcome back, ${user.full_name || user.username}! (${user.role})`;
            }
            loadDashboardStats();
        } else {
            document.getElementById('dashboardUser').textContent = 'Please log in to view dashboard';
        }
    };
})();
