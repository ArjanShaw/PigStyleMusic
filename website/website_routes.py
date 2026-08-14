import os
from dotenv import load_dotenv  # Load environment variables from .env
from flask import Flask, send_from_directory, session, redirect, request, abort

# Load .env file
load_dotenv()

app = Flask(__name__, static_folder='static')

# Use the same secret key as api.py (from environment, with a consistent fallback)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'a7f8e9d3c5b1n2m4k6l7j8h9g0f1d2s3')

def is_admin():
    """Check if the current user is logged in as an admin."""
    return session.get('logged_in') and session.get('role') == 'admin'

# ============================================================
# SERVE HTML PAGES
# ============================================================

# Main page (the single‑page app with tiles)
@app.route('/')
def index():
    return send_from_directory('HTML', 'index.html')

# Standalone pages (not replaced by tiles)
@app.route('/login')
def login():
    return send_from_directory('HTML', 'login.html')

@app.route('/dashboard')
def dashboard():
    return send_from_directory('HTML', 'dashboard.html')

@app.route('/admin')
def admin_panel():
    if not is_admin():
        return redirect('/access-denied')
    return send_from_directory('HTML', 'admin.html')

@app.route('/item-management')
def item_management():
    if not is_admin():
        return redirect('/access-denied')
    return send_from_directory('HTML', 'item-management.html')

@app.route('/admin/accounting')
def admin_accounting():
    if not is_admin():
        return redirect('/access-denied')
    return send_from_directory('HTML', 'admin-accounting.html')

@app.route('/access-denied')
def access_denied():
    return send_from_directory('HTML', 'access_denied.html')

@app.route('/inventory')
def inventory():
    return send_from_directory('HTML', 'inventory.html')

@app.route('/consignment')
def consignment():
    return send_from_directory('HTML', 'consignment.html')

@app.route('/youtube-linker')
def youtube_linker():
    return send_from_directory('HTML', 'youtube-linker.html')

@app.route('/kiosk')
def kiosk():
    return send_from_directory('HTML', 'kiosk.html')

@app.route('/payment-confirm')
def payment_confirm():
    """Payment confirmation page (fallback for Square redirect)."""
    return send_from_directory('HTML', 'payment-confirm.html')

# ============================================================
# REMOVED ROUTES – pages that are now tiles in index.html
# ============================================================
# /connect      → replaced by Connect tile (index 4)
# /misc         → replaced by Merch tile (index 2)
# /gift-cards   → replaced by Merch tile popup
# /calendar     → replaced by Events tile (index 3)
# /record-alerts → replaced by Alerts tile (index 5)
# /order-records → replaced by Order Records tile (index 6)
# /browse       → replaced by Shop tile (index 1)
# ============================================================

# ============================================================
# GENERIC COMPONENT ROUTE - Serve any component from HTML/components/
# ============================================================

@app.route('/components/<path:filename>')
def serve_component(filename):
    """Serve any component from HTML/components/ folder."""
    if not filename.endswith('.html'):
        abort(404)
    try:
        return send_from_directory('HTML/components', filename)
    except Exception as e:
        print(f"Error serving component {filename}: {e}")
        abort(404)

# ============================================================
# STATIC FILE SERVING
# ============================================================

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/js/<path:path>')
def serve_js(path):
    return send_from_directory('static/js', path)

@app.route('/css/<path:path>')
def serve_css(path):
    return send_from_directory('static/css', path)

@app.route('/images/<path:path>')
def serve_images(path):
    return send_from_directory('static/images', path)

@app.route('/fonts/<path:path>')
def serve_fonts(path):
    return send_from_directory('static/fonts', path)

@app.route('/<path:filename>')
def serve_file(filename):
    static_path = os.path.join('static', filename)
    if os.path.exists(static_path):
        return send_from_directory('static', filename)
    html_path = os.path.join('HTML', filename)
    if os.path.exists(html_path):
        return send_from_directory('HTML', filename)
    return "File not found", 404

if __name__ == '__main__':
    app.run(debug=True, port=8000, host='127.0.0.1')