import os
from dotenv import load_dotenv
from flask import Flask, send_from_directory, send_file, session, redirect, request, abort
import requests

load_dotenv()

# Create app only if not already created (for local development)
app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'a7f8e9d3c5b1n2m4k6l7j8h9g0f1d3s')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# --- CORRECTED PATHS ---
ADMIN_DIR       = os.path.join(BASE_DIR, 'admin')
INDEX_DIR       = os.path.join(BASE_DIR, 'index')
STATIC_DIR      = os.path.join(BASE_DIR, 'static')
COMPONENTS_DIR  = os.path.join(BASE_DIR, 'index', 'components')
ACCOUNTING_DIR  = os.path.join(BASE_DIR, 'accounting')
CHECKOUT_DIR    = os.path.join(BASE_DIR, 'checkout')
ITEM_MANAGEMENT_DIR = os.path.join(ADMIN_DIR, 'item-management')  # ← NEW

# Track if routes have been registered to prevent duplicates
_routes_registered = False

# ============================================================
# UPDATED is_admin() - Checks API for session status
# ============================================================
def is_admin():
    """Check if user is admin by checking local session first, then API."""
    
    # First check local session (fast path)
    if session.get('logged_in') and session.get('role') == 'admin':
        return True
    
    # If not in local session, try to fetch from the API
    try:
        # Forward cookies to the API
        cookie_header = request.headers.get('Cookie', '')
        
        response = requests.get(
            'http://localhost:5000/session/check',
            headers={
                'Accept': 'application/json',
                'Cookie': cookie_header  # Forward the cookies
            },
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Check if logged in and is admin
            if data.get('logged_in') and data.get('user', {}).get('role') == 'admin':
                # Sync the local session with API session
                user = data.get('user', {})
                session['user_id'] = user.get('id')
                session['username'] = user.get('username')
                session['role'] = user.get('role')
                session['logged_in'] = True
                session['full_name'] = user.get('full_name')
                
                print(f"✅ Session synced from API: {user.get('username')} is admin")
                return True
            elif data.get('logged_in'):
                # User is logged in but not admin
                user = data.get('user', {})
                print(f"ℹ️ User {user.get('username')} is logged in but NOT admin (role: {user.get('role')})")
                return False
        else:
            print(f"⚠️ API session check returned status: {response.status_code}")
            
    except requests.exceptions.ConnectionError:
        print("⚠️ Could not connect to API server at localhost:5000")
    except requests.exceptions.Timeout:
        print("⚠️ API session check timed out")
    except Exception as e:
        print(f"⚠️ Error checking API session: {e}")
    
    return False

def register_routes(application):
    """Register all frontend routes with the given Flask application."""
    global _routes_registered
    
    # Prevent duplicate registration
    if _routes_registered:
        print("⚠️ Routes already registered, skipping duplicate registration")
        return
    
    # ---------- MAIN HTML PAGES ----------
    @application.route('/')
    def index():
        return send_from_directory(INDEX_DIR, 'index.html')

    @application.route('/login', methods=['GET'])
    def login():
        return send_from_directory(INDEX_DIR, 'login.html')

    @application.route('/dashboard')
    def dashboard():
        return send_from_directory(INDEX_DIR, 'dashboard.html')

    @application.route('/payment-confirm')
    def payment_confirm():
        return send_from_directory(INDEX_DIR, 'payment-confirm.html')

    # ---------- ADMIN PAGES ----------
    @application.route('/admin')
    def admin_panel():
        if not is_admin():
            return redirect('/access-denied')
        return send_from_directory(ADMIN_DIR, 'admin.html')

    @application.route('/admin.css')
    def admin_css():
        return send_from_directory(ADMIN_DIR, 'admin.css')

    @application.route('/admin-components/<path:filename>')
    def serve_admin_component(filename):
        if '..' in filename:
            abort(404)
        return send_from_directory(ADMIN_DIR, filename)

    @application.route('/admin/accounting')
    def admin_accounting():
        if not is_admin():
            return redirect('/access-denied')
        return send_from_directory(ACCOUNTING_DIR, 'admin-accounting.html')

    @application.route('/accounting/<path:filename>')
    def serve_accounting(filename):
        return send_from_directory(ACCOUNTING_DIR, filename)

    # ---------- ITEM MANAGEMENT PAGE ----------
    @application.route('/item-management')
    def item_management():
        if not is_admin():
            return redirect('/access-denied')
        
        # File is in admin/item-management/item-management.html
        if os.path.exists(os.path.join(ITEM_MANAGEMENT_DIR, 'item-management.html')):
            return send_from_directory(ITEM_MANAGEMENT_DIR, 'item-management.html')
        
        # Fallback: check if it's directly in admin
        if os.path.exists(os.path.join(ADMIN_DIR, 'item-management.html')):
            return send_from_directory(ADMIN_DIR, 'item-management.html')
        
        # If not found, show helpful error
        return f"""
        <h1>⚠️ item-management.html Not Found</h1>
        <p>Searched in:</p>
        <ul>
            <li>{os.path.join(ITEM_MANAGEMENT_DIR, 'item-management.html')} → {"✅" if os.path.exists(os.path.join(ITEM_MANAGEMENT_DIR, 'item-management.html')) else "❌"}</li>
            <li>{os.path.join(ADMIN_DIR, 'item-management.html')} → {"✅" if os.path.exists(os.path.join(ADMIN_DIR, 'item-management.html')) else "❌"}</li>
        </ul>
        <p><a href="/admin">← Back to Admin Panel</a></p>
        """

    # Serve static assets for item-management (CSS, JS, images)
    @application.route('/item-management/<path:filename>')
    def serve_item_management_asset(filename):
        if not is_admin():
            return redirect('/access-denied')
        
        # Prevent path traversal
        if '..' in filename:
            abort(404)
        
        # Serve from the item-management directory
        return send_from_directory(ITEM_MANAGEMENT_DIR, filename)

    # ---------- CHECKOUT PAGE ----------
    @application.route('/checkout')
    @application.route('/checkout/')
    @application.route('/checkout/checkout.html')
    def checkout():
        return send_from_directory(CHECKOUT_DIR, 'checkout.html')

    @application.route('/checkout/<path:filename>')
    def serve_checkout_asset(filename):
        if '..' in filename:
            abort(404)
        return send_from_directory(CHECKOUT_DIR, filename)

    # ---------- COMPONENTS ----------
    @application.route('/components/<path:filename>')
    def serve_component(filename):
        # Allow HTML and CSS files from components
        if not filename.endswith(('.html', '.css', '.js')):
            abort(404)
        # Prevent path traversal
        if '..' in filename:
            abort(404)
        return send_from_directory(COMPONENTS_DIR, filename)

    # ---------- OTHER PAGES ----------
    @application.route('/access-denied')
    def access_denied():
        return send_from_directory(INDEX_DIR, 'access_denied.html')

    @application.route('/inventory')
    def inventory():
        return send_from_directory(INDEX_DIR, 'inventory.html')

    @application.route('/consignment')
    def consignment():
        return send_from_directory(INDEX_DIR, 'consignment.html')

    @application.route('/youtube-linker')
    def youtube_linker():
        return send_from_directory(INDEX_DIR, 'youtube-linker.html')

    @application.route('/kiosk')
    def kiosk():
        return send_from_directory(INDEX_DIR, 'kiosk.html')

    # ---------- STATIC ----------
    @application.route('/static/<path:path>')
    def serve_static(path):
        return send_from_directory(STATIC_DIR, path)

    @application.route('/js/<path:path>')
    def serve_js(path):
        return send_from_directory(os.path.join(STATIC_DIR, 'js'), path)

    @application.route('/css/<path:path>')
    def serve_css(path):
        return send_from_directory(os.path.join(STATIC_DIR, 'css'), path)

    @application.route('/images/<path:path>')
    def serve_images(path):
        return send_from_directory(os.path.join(STATIC_DIR, 'images'), path)

    @application.route('/fonts/<path:path>')
    def serve_fonts(path):
        return send_from_directory(os.path.join(STATIC_DIR, 'fonts'), path)

    # ---------- DEBUG ----------
    @application.route('/debug')
    def debug():
        return f"""
        <h1>Debug Info</h1>
        <h2>Paths:</h2>
        <ul>
            <li>BASE_DIR: {BASE_DIR} → exists? {os.path.exists(BASE_DIR)}</li>
            <li>ADMIN_DIR: {ADMIN_DIR} → exists? {os.path.exists(ADMIN_DIR)}</li>
            <li>CHECKOUT_DIR: {CHECKOUT_DIR} → exists? {os.path.exists(CHECKOUT_DIR)}</li>
            <li>INDEX_DIR: {INDEX_DIR} → exists? {os.path.exists(INDEX_DIR)}</li>
            <li>STATIC_DIR: {STATIC_DIR} → exists? {os.path.exists(STATIC_DIR)}</li>
            <li>COMPONENTS_DIR: {COMPONENTS_DIR} → exists? {os.path.exists(COMPONENTS_DIR)}</li>
            <li>ITEM_MANAGEMENT_DIR: {ITEM_MANAGEMENT_DIR} → exists? {os.path.exists(ITEM_MANAGEMENT_DIR)}</li>
        </ul>
        <h2>Session:</h2>
        <pre>{dict(session)}</pre>
        <h2>Cookies:</h2>
        <pre>{dict(request.cookies)}</pre>
        <h2>Routes:</h2>
        <p>Total routes: {len(application.url_map._rules)}</p>
        <h2>is_admin() result:</h2>
        <p>Is admin? <strong>{is_admin()}</strong></p>
        <h2>Item Management File:</h2>
        <p>{os.path.join(ITEM_MANAGEMENT_DIR, 'item-management.html')} → {"✅ EXISTS" if os.path.exists(os.path.join(ITEM_MANAGEMENT_DIR, 'item-management.html')) else "❌ NOT FOUND"}</p>
        """

    # ---------- DEBUG SESSION ----------
    @application.route('/debug-session')
    def debug_session():
        """Debug endpoint to check session status."""
        # Try to refresh session from API
        is_admin_result = is_admin()
        
        # Check if item-management file exists
        item_mgmt_exists = os.path.exists(os.path.join(ITEM_MANAGEMENT_DIR, 'item-management.html'))
        
        return {
            'status': 'success',
            'local_session': dict(session),
            'is_admin': is_admin_result,
            'cookies_received': dict(request.cookies),
            'session_keys': list(session.keys()),
            'item_management_file_exists': item_mgmt_exists,
            'item_management_path': os.path.join(ITEM_MANAGEMENT_DIR, 'item-management.html')
        }

    # ---------- FALLBACK ----------
    @application.route('/<path:filename>')
    def serve_file(filename):
        static_file = os.path.join(STATIC_DIR, filename)
        if os.path.exists(static_file):
            return send_file(static_file)
        html_file = os.path.join(INDEX_DIR, filename)
        if os.path.exists(html_file):
            return send_file(html_file)
        return "File not found", 404

    _routes_registered = True
    print(f"✅ Frontend routes registered. Total routes: {len(application.url_map._rules)}")

# For local development
if __name__ == '__main__':
    # Register routes on the local app
    register_routes(app)
    app.run(debug=True, port=8000, host='127.0.0.1')