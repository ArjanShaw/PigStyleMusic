import os
from dotenv import load_dotenv
from flask import Flask, send_from_directory, send_file, session, redirect, request, abort

load_dotenv()

app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'a7f8e9d3c5b1n2m4k6l7j8h9g0f1d3s')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# --- CORRECTED PATHS ---
ADMIN_DIR       = os.path.join(BASE_DIR, 'admin')
INDEX_DIR       = os.path.join(BASE_DIR, 'index')
STATIC_DIR      = os.path.join(BASE_DIR, 'static')
COMPONENTS_DIR  = os.path.join(BASE_DIR, 'components')
ACCOUNTING_DIR  = os.path.join(BASE_DIR, 'accounting')
CHECKOUT_DIR    = os.path.join(BASE_DIR, 'checkout')

def is_admin():
    return session.get('logged_in') and session.get('role') == 'admin'

# ---------- ROUTES ----------
@app.route('/')
def index():
    return send_from_directory(INDEX_DIR, 'index.html')

@app.route('/login')
def login():
    return send_from_directory(INDEX_DIR, 'login.html')

@app.route('/dashboard')
def dashboard():
    return send_from_directory(INDEX_DIR, 'dashboard.html')

# --- Admin panel ---
@app.route('/admin')
def admin_panel():
    if not is_admin():
        return redirect('/access-denied')
    return send_from_directory(ADMIN_DIR, 'admin.html')

@app.route('/admin.css')
def admin_css():
    return send_from_directory(ADMIN_DIR, 'admin.css')

# --- Accounting page ---
@app.route('/admin/accounting')
def admin_accounting():
    if not is_admin():
        return redirect('/access-denied')
    return send_from_directory(ACCOUNTING_DIR, 'admin-accounting.html')

@app.route('/accounting/<path:filename>')
def serve_accounting(filename):
    return send_from_directory(ACCOUNTING_DIR, filename)

# --- CHECKOUT PAGE ---
@app.route('/checkout')
@app.route('/checkout/')
@app.route('/checkout/checkout.html')
def checkout():
    return send_from_directory(CHECKOUT_DIR, 'checkout.html')

@app.route('/checkout/<path:filename>')
def serve_checkout_asset(filename):
    if '..' in filename:
        abort(404)
    return send_from_directory(CHECKOUT_DIR, filename)

# --- Admin component route ---
@app.route('/admin-components/<component>/<path:filename>')
def serve_admin_component(component, filename):
    if '..' in filename or '..' in component:
        abort(404)
    component_dir = os.path.join(ADMIN_DIR, component)
    if not os.path.exists(component_dir):
        abort(404)
    return send_from_directory(component_dir, filename)

# --- Public component route ---
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
    return send_from_directory(INDEX_DIR, 'item-management.html')

@app.route('/access-denied')
def access_denied():
    return send_from_directory(INDEX_DIR, 'access_denied.html')

@app.route('/inventory')
def inventory():
    return send_from_directory(INDEX_DIR, 'inventory.html')

@app.route('/consignment')
def consignment():
    return send_from_directory(INDEX_DIR, 'consignment.html')

@app.route('/youtube-linker')
def youtube_linker():
    return send_from_directory(INDEX_DIR, 'youtube-linker.html')

@app.route('/kiosk')
def kiosk():
    return send_from_directory(INDEX_DIR, 'kiosk.html')

@app.route('/payment-confirm')
def payment_confirm():
    return send_from_directory(INDEX_DIR, 'payment-confirm.html')

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
    ACCOUNTING_DIR: {ACCOUNTING_DIR} → exists? {os.path.exists(ACCOUNTING_DIR)}<br>
    CHECKOUT_DIR: {CHECKOUT_DIR} → exists? {os.path.exists(CHECKOUT_DIR)}<br>
    admin.html: {os.path.join(ADMIN_DIR, 'admin.html')} → exists? {os.path.exists(os.path.join(ADMIN_DIR, 'admin.html'))}<br>
    checkout.html: {os.path.join(CHECKOUT_DIR, 'checkout.html')} → exists? {os.path.exists(os.path.join(CHECKOUT_DIR, 'checkout.html'))}<br>
    INDEX_DIR: {INDEX_DIR} → exists? {os.path.exists(INDEX_DIR)}<br>
    STATIC_DIR: {STATIC_DIR} → exists? {os.path.exists(STATIC_DIR)}
    """

# ---------- FALLBACK ----------
@app.route('/<path:filename>')
def serve_file(filename):
    static_file = os.path.join(STATIC_DIR, filename)
    if os.path.exists(static_file):
        return send_file(static_file)
    html_file = os.path.join(INDEX_DIR, filename)
    if os.path.exists(html_file):
        return send_file(html_file)
    return "File not found", 404

if __name__ == '__main__':
    app.run(debug=True, port=8000, host='127.0.0.1')