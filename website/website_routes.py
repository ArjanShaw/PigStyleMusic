from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
import sys
import os

# Add the backend directory to the path so we can import api.py
sys.path.insert(0, '/home/arjanshaw/PigStyleMusic/backend')

# Import your backend API functions
from api import get_commission_rate  # Make sure this function exists in api.py

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing if needed

# Route for the main page
@app.route('/')
def index():
    return send_from_directory('HTML', 'index.html')

# Route for other HTML pages
@app.route('/<page_name>.html')
def html_page(page_name):
    return send_from_directory('HTML', f'{page_name}.html')

# Route for static files
@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)

# NEW ROUTE: API endpoint for commission rate
@app.route('/api/commission-rate', methods=['GET'])
def api_commission_rate():
    try:
        # Call the function from your backend api.py
        rate_data = get_commission_rate()
        return jsonify(rate_data)
    except Exception as e:
        # Return an error if something goes wrong
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)