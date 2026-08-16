import os
from dotenv import load_dotenv
from flask import Flask, send_from_directory, send_file, session, redirect, request, abort

load_dotenv()

app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'a7f8e9d3c5b1n2m4k6l7j8h9g0f1d2s3')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# --- CORRECTED PATHS (no extra 'website' folder) ---
ADMIN_DIR   = os.path.join(BASE_DIR, 'admin')          # website/admin
HTML_DIR    = os.path.join(BASE_DIR, 'HTML')           # website/HTML
STATIC_DIR  = os.path.join(BASE_DIR, 'static')         # website/static
COMPONENTS_DIR = os.path.join(BASE_DIR, 'components')  # website/components (for public tile)

def is_admin():
    return session.get('logged_in') and session.get('role') == 'admin'

# ---------- ROUTES ----------
@app.route('/')
def index():
    return send_from_directory(HTML_DIR, 'index.html')

@app.route('/login')
def login():
    return send_from_directory(HTML_DIR, 'login.html')

@app.route('/dashboard')
def dashboard():
    return send_from_directory(HTML_DIR, 'dashboard.html')

# --- Admin panel (now in website/admin/) ---
@app.route('/admin')
def admin_panel():
    if not is_admin():
        return redirect('/access-denied')
    return send_from_directory(ADMIN_DIR, 'admin.html')

@app.route('/admin.css')
def admin_css():
    return send_from_directory(ADMIN_DIR, 'admin.css')

# --- Admin component route (for events tab) ---
@app.route('/admin-components/<component>/<path:filename>')
def serve_admin_component(component, filename):
    if '..' in filename or '..' in component:
        abort(404)
    component_dir = os.path.join(ADMIN_DIR, component)  # admin/events/
    if not os.path.exists(component_dir):
        abort(404)
    return send_from_directory(component_dir, filename)

# --- Public component route (for tile) ---
@app.route('/components/<component>/<path:filename>')
def serve_public_component(component, filename):
    if '..' in filename or '..' in component:
        abort(404)
    component_dir = os.path.join(COMPONENTS_DIR, component)
    if not os.path.exists(component_dir):
        abort(404)
    return send_from_directory(component_dir, filename)

# --- Other HTML pages ---
@app.route('/item-management')
def item_management():
    if not is_admin():
        return redirect('/access-denied')
    return send_from_directory(HTML_DIR, 'item-management.html')

@app.route('/admin/accounting')
def admin_accounting():
    if not is_admin():
        return redirect('/access-denied')
    return send_from_directory(HTML_DIR, 'admin-accounting.html')

@app.route('/access-denied')
def access_denied():
    return send_from_directory(HTML_DIR, 'access_denied.html')

@app.route('/inventory')
def inventory():
    return send_from_directory(HTML_DIR, 'inventory.html')

@app.route('/consignment')
def consignment():
    return send_from_directory(HTML_DIR, 'consignment.html')

@app.route('/youtube-linker')
def youtube_linker():
    return send_from_directory(HTML_DIR, 'youtube-linker.html')

@app.route('/kiosk')
def kiosk():
    return send_from_directory(HTML_DIR, 'kiosk.html')

@app.route('/payment-confirm')
def payment_confirm():
    return send_from_directory(HTML_DIR, 'payment-confirm.html')

# ---------- STATIC ----------
@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory(STATIC_DIR, path)

@app.route('/js/<path:path>')
def serve_js(path):
    return send_from_directory(os.path.join(STATIC_DIR, 'js'), path)

@app.route('/css/<path:path>')
def serve_css(path):
    return send_from_directory(os.path.join(STATIC_DIR, 'css'), path)

@app.route('/images/<path:path>')
def serve_images(path):
    return send_from_directory(os.path.join(STATIC_DIR, 'images'), path)

@app.route('/fonts/<path:path>')
def serve_fonts(path):
    return send_from_directory(os.path.join(STATIC_DIR, 'fonts'), path)

# ---------- DEBUG ----------
@app.route('/debug')
def debug():
    return f"""
    BASE_DIR: {BASE_DIR}<br>
    ADMIN_DIR: {ADMIN_DIR} → exists? {os.path.exists(ADMIN_DIR)}<br>
    admin.html: {os.path.join(ADMIN_DIR, 'admin.html')} → exists? {os.path.exists(os.path.join(ADMIN_DIR, 'admin.html'))}<br>
    admin.css: {os.path.join(ADMIN_DIR, 'admin.css')} → exists? {os.path.exists(os.path.join(ADMIN_DIR, 'admin.css'))}<br>
    HTML_DIR: {HTML_DIR} → exists? {os.path.exists(HTML_DIR)}<br>
    STATIC_DIR: {STATIC_DIR} → exists? {os.path.exists(STATIC_DIR)}<br>
    COMPONENTS_DIR: {COMPONENTS_DIR} → exists? {os.path.exists(COMPONENTS_DIR)}
    """

# ---------- FALLBACK ----------
@app.route('/<path:filename>')
def serve_file(filename):
    static_file = os.path.join(STATIC_DIR, filename)
    if os.path.exists(static_file):
        return send_file(static_file)
    html_file = os.path.join(HTML_DIR, filename)
    if os.path.exists(html_file):
        return send_file(html_file)
    return "File not found", 404

if __name__ == '__main__':
    app.run(debug=True, port=8000, host='127.0.0.1')