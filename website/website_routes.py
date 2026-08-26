from flask import Flask, send_from_directory
import os

app = Flask(__name__, static_folder='static')
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_DIR = os.path.join(BASE_DIR, 'index')

@app.route('/')
def index():
    return send_from_directory(INDEX_DIR, 'index.html')

@app.route('/static/<path:path>')
def static_files(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    app.run(debug=True, port=8000)
