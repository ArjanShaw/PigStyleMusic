from flask import Flask, render_template, send_from_directory
import os

app = Flask(__name__)

# Route to serve the main index.html from the HTML folder
@app.route('/')
def index():
    return send_from_directory('HTML', 'index.html')

# Route to serve other HTML pages (e.g., /consignment)
@app.route('/<page_name>.html')
def html_page(page_name):
    return send_from_directory('HTML', f'{page_name}.html')

# Route to serve static files (CSS, JS, images)
@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)

if __name__ == '__main__':
    app.run(debug=True)