import os
from dotenv import load_dotenv
from flask import Flask, send_from_directory, send_file, session, redirect, request, abort

load_dotenv()

# Create app only if not already created (for local development)
app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'a7f8e9d3c5b1n2m4k6l7j8h9g0f1d3s')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# --- CORRECTED PATHS ---
ADMIN_DIR       = os.path.join(BASE_DIR, 'admin')
INDEX_DIR       = os.path.join(BASE_DIR, 'index')
STATIC_DIR      = os.path.join(BASE_DIR, 'static')
COMPONENTS_DIR  = os.path.join(BASE_DIR, 'index', 'components')  # ← FIXED: components is inside index
ACCOUNTING_DIR  = os.path.join(BASE_DIR, 'accounting')
CHECKOUT_DIR    = os.path.join(BASE_DIR, 'checkout')

# Track if routes have been registered to prevent duplicates
_routes_registered = False

def is_admin():
    return session.get('logged_in') and session.get('role') == 'admin'

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
    @application.route('/item-management')
    def item_management():
        if not is_admin():
            return redirect('/access-denied')
        return send_from_directory(INDEX_DIR, 'item-management.html')

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
        BASE_DIR: {BASE_DIR}<br>
        ADMIN_DIR: {ADMIN_DIR} → exists? {os.path.exists(ADMIN_DIR)}<br>
        CHECKOUT_DIR: {CHECKOUT_DIR} → exists? {os.path.exists(CHECKOUT_DIR)}<br>
        INDEX_DIR: {INDEX_DIR} → exists? {os.path.exists(INDEX_DIR)}<br>
        STATIC_DIR: {STATIC_DIR} → exists? {os.path.exists(STATIC_DIR)}<br>
        COMPONENTS_DIR: {COMPONENTS_DIR} → exists? {os.path.exists(COMPONENTS_DIR)}<br>
        Total routes: {len(application.url_map._rules)}<br>
        """

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