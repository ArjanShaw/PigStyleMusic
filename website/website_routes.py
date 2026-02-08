import os
from flask import Flask, send_from_directory

app = Flask(__name__, static_folder='static')

# Serve HTML pages from HTML directory
@app.route('/')
def index():
    return send_from_directory('HTML', 'index.html')

@app.route('/catalog')
def catalog():
    return send_from_directory('HTML', 'catalog.html')

@app.route('/streaming')
def streaming():
    return send_from_directory('HTML', 'streaming.html')

@app.route('/consignment')
def consignment():
    return send_from_directory('HTML', 'consignment.html')

@app.route('/login')
def login():
    return send_from_directory('HTML', 'login.html')

@app.route('/dashboard')
def dashboard():
    return send_from_directory('HTML', 'dashboard.html')

@app.route('/admin')
def admin():
    return send_from_directory('HTML', 'admin.html')

# Serve static files
@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

# Serve JS files
@app.route('/js/<path:path>')
def serve_js(path):
    return send_from_directory('static/js', path)

# Serve CSS files  
@app.route('/css/<path:path>')
def serve_css(path):
    return send_from_directory('static/css', path)

# Serve images
@app.route('/images/<path:path>')
def serve_images(path):
    return send_from_directory('static/images', path)

# Serve fonts
@app.route('/fonts/<path:path>')
def serve_fonts(path):
    return send_from_directory('static/fonts', path)

# Catch-all for other static files
@app.route('/<path:filename>')
def serve_file(filename):
    # Check if file exists in static
    static_path = os.path.join('static', filename)
    if os.path.exists(static_path):
        return send_from_directory('static', filename)
    
    # Check if file exists in HTML
    html_path = os.path.join('HTML', filename)
    if os.path.exists(html_path):
        return send_from_directory('HTML', filename)
    
    # Return 404
    return "File not found", 404

if __name__ == '__main__':
    app.run(debug=True, port=8000, host='0.0.0.0')