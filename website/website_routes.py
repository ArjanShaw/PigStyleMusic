from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
import sys

# Add the backend directory to the Python path
sys.path.insert(0, '/home/arjanshaw/PigStyleMusic/backend')

try:
    from api import get_commission_rate
    BACKEND_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Could not import from api.py. Error: {e}")
    BACKEND_AVAILABLE = False
    # Define a fallback function if the import fails
    def get_commission_rate():
        return {"commission_rate_percent": "Rate info currently unavailable", "error": "Backend not loaded"}

app = Flask(__name__)
CORS(app)  # Enable if your frontend needs it

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

# API endpoint for commission rate
@app.route('/api/commission-rate', methods=['GET'])
def api_commission_rate():
    try:
        rate_data = get_commission_rate()
        # Ensure the response is a dictionary and includes the expected key
        if not isinstance(rate_data, dict):
            rate_data = {"commission_rate_percent": str(rate_data)}
        return jsonify(rate_data)
    except Exception as e:
        # Log the error and return a consistent error response
        print(f"API Error: {e}")  # This will appear in your server error log
        return jsonify({'error': 'Internal server error fetching rate', 'details': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)