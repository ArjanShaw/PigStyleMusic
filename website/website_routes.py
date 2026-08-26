from flask import Flask, send_from_directory
import os

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_DIR = os.path.join(BASE_DIR, 'index')
IMAGES_DIR = os.path.join(BASE_DIR, 'images')

@app.route('/')
def index():
    return send_from_directory(INDEX_DIR, 'index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/images/<path:filename>')
def serve_images(filename):
    return send_from_directory(IMAGES_DIR, filename)

@app.route('/tiles/<path:filename>')
def serve_tile(filename):
    return send_from_directory(os.path.join(INDEX_DIR, 'tiles'), filename)

if __name__ == '__main__':
    app.run(debug=True, port=8000, host='0.0.0.0')
