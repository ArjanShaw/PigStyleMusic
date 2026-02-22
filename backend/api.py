import os
import requests
import base64
from flask import Flask, jsonify, request, session, redirect
from flask_cors import CORS
import sqlite3
from datetime import datetime, timedelta
import hashlib
import secrets
import re
import logging
from logging.handlers import RotatingFileHandler
import random
import time
import urllib.parse
import json
import threading
import uuid
import stripe
from functools import wraps
from discogs_handler import DiscogsHandler 
from handlers.price_advise_handler import PriceAdviseHandler
import hmac
import traceback
import os
import subprocess

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'a7f8e9d3c5b1n2m4k6l7j8h9g0f1d2s3')

# Square Configuration - ALL FROM ENVIRONMENT VARIABLES
SQUARE_ENVIRONMENT = os.environ.get('SQUARE_ENVIRONMENT')
SQUARE_LOCATION_ID = os.environ.get('SQUARE_LOCATION_ID')
SQUARE_TERMINAL_DEVICE_ID = os.environ.get('SQUARE_TERMINAL_DEVICE_ID', '0446')
SQUARE_WEBHOOK_SIGNATURE_KEY = os.environ.get('SQUARE_WEBHOOK_SIGNATURE_KEY')
SQUARE_APPLICATION_ID = os.environ.get('SQUARE_APPLICATION_ID')
SQUARE_ACCESS_TOKEN = os.environ.get('SQUARE_ACCESS_TOKEN')

# CORS Configuration
CORS(app, 
     supports_credentials=True,
     origins=[
         "http://localhost:8000",
         "http://127.0.0.1:8000", 
         "http://localhost:5000",
         "http://127.0.0.1:5000",
         "https://pigstylemusic.com",
         "https://www.pigstylemusic.com",
         "https://arjanshaw.github.io",
         "https://pigstylerecords.github.io"
     ],
     allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
     expose_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"])

# Database configuration
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "records.db")

# Spotify configuration
SPOTIFY_CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID', '1a2b3c4d5e6f7g8h9i0j')
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET', 'k1l2m3n4o5p6q7r8s9t0')
SPOTIFY_REDIRECT_URI = '/spotify/callback'

# Stripe configuration
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', 'sk_test_4eC39HqLyjWDarjtT1zdp7dc')
STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY', 'pk_test_TYooMQauvdEDq54NiTphI7jx')
stripe.api_key = STRIPE_SECRET_KEY

# Token storage and background job storage
user_tokens = {}
background_jobs = {}
square_payment_sessions = {}  # Store active payment sessions

def setup_logging():
    logs_dir = os.path.join(os.path.dirname(__file__), 'logs')
    os.makedirs(logs_dir, exist_ok=True)

    logging.basicConfig(level=logging.DEBUG)
    app.logger.setLevel(logging.DEBUG)

    file_handler = RotatingFileHandler(
        os.path.join(logs_dir, 'api.log'),
        maxBytes=1024 * 1024,
        backupCount=10
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
    ))

    app.logger.addHandler(file_handler)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    app.logger.addHandler(console_handler)

setup_logging()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ==================== SQUARE API HELPER FUNCTIONS ====================

def square_api_request(endpoint, method='GET', data=None):
    """Make direct request to Square API"""
    access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
    environment = os.environ.get('SQUARE_ENVIRONMENT', 'production')
    
    if not access_token:
        return None, "SQUARE_ACCESS_TOKEN not set"
    
    # Choose the correct base URL
    if environment == 'production':
        base_url = 'https://connect.squareup.com'
    else:
        base_url = 'https://connect.squareupsandbox.com'
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
        'Square-Version': '2026-01-22'
    }
    
    url = f"{base_url}{endpoint}"  # endpoint should already include the full path
    
    try:
        app.logger.info(f"Square API request: {method} {url}")
        
        if method == 'GET':
            response = requests.get(url, headers=headers)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers)
        else:
            return None, f"Unsupported method: {method}"
        
        app.logger.info(f"Square API response status: {response.status_code}")
        
        if response.status_code >= 400:
            error_text = response.text[:200]
            app.logger.error(f"Square API error ({response.status_code}): {error_text}")
            return None, f"Square API error ({response.status_code}): {error_text}"
        
        return response.json(), None
        
    except requests.exceptions.ConnectionError as e:
        app.logger.error(f"Square API connection error: {e}")
        return None, f"Connection error: {str(e)}"
    except Exception as e:
        app.logger.error(f"Square API request exception: {e}")
        return None, str(e)
 

def verify_square_webhook(signature, body):
    """Verify Square webhook signature"""
    if not SQUARE_WEBHOOK_SIGNATURE_KEY:
        return False
    
    expected_signature = hmac.new(
        key=SQUARE_WEBHOOK_SIGNATURE_KEY.encode('utf-8'),
        msg=body,
        digestmod=hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)

def get_terminal_devices():
    """Get list of available Square Terminal devices using direct API call"""
    # GET /v2/devices - exactly like your working curl command
    result, error = square_api_request('/v2/devices')
    
    if error:
        app.logger.error(f"Failed to get terminal devices: {error}")
        return None, error
    
    # Extract devices from response
    devices = result.get('devices', [])
    
    # Format devices for frontend
    enhanced_devices = []
    for device in devices:
        enhanced_devices.append({
            'id': device.get('id'),
            'device_name': device.get('name', 'Square Terminal'),
            'status': device.get('status', 'UNKNOWN'),
            'device_type': device.get('device_type', 'TERMINAL'),
            'manufacturer': device.get('manufacturer', 'Square')
        })
    
    app.logger.info(f"Found {len(enhanced_devices)} terminal devices")
    return enhanced_devices, None

def create_square_terminal_checkout(amount_cents, record_ids, record_titles, reference_id=None, device_id=None):
    """Create a Square Terminal checkout using direct API call"""
    
    # ADD THIS DEBUG LINE
    print(f"\n🔍 DEBUG - Received device_id: '{device_id}'")
    
    access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
    environment = os.environ.get('SQUARE_ENVIRONMENT', 'production')
    
    if not access_token:
        return None, "SQUARE_ACCESS_TOKEN not set"
    
    base_url = 'https://connect.squareup.com' if environment == 'production' else 'https://connect.squareupsandbox.com'
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
        'Square-Version': '2026-01-22'
    }
    
    # If no device_id provided, get from API
    if not device_id:
        devices_response = requests.get(f'{base_url}/v2/devices', headers=headers)
        if devices_response.status_code == 200:
            devices = devices_response.json().get('devices', [])
            if devices:
                full_device_id = devices[0].get('id')
                # Strip the "device:" prefix if present
                if full_device_id and full_device_id.startswith('device:'):
                    device_id = full_device_id.replace('device:', '')
                else:
                    device_id = full_device_id
                print(f"🔍 DEBUG - Got device from API: '{full_device_id}' → '{device_id}'")
    
    # ADD DEBUG FOR FINAL DEVICE ID
    print(f"🔍 DEBUG - Final device_id being used: '{device_id}'")
    
    if not device_id:
        return None, "No Square Terminal devices found"
    
    idempotency_key = str(uuid.uuid4())
    
    checkout_data = {
        "idempotency_key": idempotency_key,
        "checkout": {
            "amount_money": {
                "amount": amount_cents,
                "currency": "USD"
            },
            "device_options": {
                "device_id": device_id  # This should be WITHOUT prefix
            },
            "reference_id": reference_id or f"pigstyle_{idempotency_key[:8]}",
            "note": f"PigStyle Music: {', '.join(record_titles[:3])}{'...' if len(record_titles) > 3 else ''}"
        }
    }
    
    # ADD DEBUG FOR FINAL PAYLOAD
    print(f"🔍 DEBUG - Sending device_id in payload: '{checkout_data['checkout']['device_options']['device_id']}'")
    
    response = requests.post(
        f'{base_url}/v2/terminals/checkouts',
        headers=headers,
        json=checkout_data
    )
    
    if response.status_code != 200:
        error_text = response.text
        return None, f"Square API error ({response.status_code}): {error_text}"
    
    result = response.json()
    return result, None
 

def get_terminal_checkout_status(checkout_id):
    """Get the status of a terminal checkout"""
    # IMPORTANT: Do NOT add any prefix - use the ID as-is
    result, error = square_api_request(f'/v2/terminals/checkouts/{checkout_id}', method='GET')
    
    if error:
        app.logger.error(f"Failed to get checkout status: {error}")
        return None, error
    
    checkout = result.get('checkout', {})
    status = checkout.get('status', 'UNKNOWN')
    
    # Update stored session
    if checkout_id in square_payment_sessions:
        square_payment_sessions[checkout_id]['status'] = status
        
        # If completed, get payment details
        if status == 'COMPLETED':
            payment_id = checkout.get('payment_ids', [None])[0]
            if payment_id:
                square_payment_sessions[checkout_id]['payment_id'] = payment_id
    
    return checkout, None

def cancel_terminal_checkout(checkout_id):
    """Cancel a pending terminal checkout"""
    # IMPORTANT: Do NOT add any prefix - use the ID as-is
    result, error = square_api_request(f'/v2/terminals/checkouts/{checkout_id}/cancel', method='POST')
    
    if error:
        app.logger.error(f"Failed to cancel checkout: {error}")
        return None, error
    
    if checkout_id in square_payment_sessions:
        square_payment_sessions[checkout_id]['status'] = 'CANCELED'
    
    return result, None

def get_payment_details(payment_id):
    """Get payment details by payment ID"""
    result, error = square_api_request(f'/v2/payments/{payment_id}')
    
    if error:
        app.logger.error(f"Failed to get payment details: {error}")
        return None, error
    
    return result.get('payment'), None

# ==================== SQUARE TERMINAL API ENDPOINTS ====================

def login_required(f):
    """Decorator to require login for endpoints"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session or not session.get('logged_in'):
            return jsonify({
                'status': 'error',
                'error': 'Authentication required'
            }), 401
        return f(*args, **kwargs)
    return decorated_function

def role_required(allowed_roles):
    """Decorator to require specific role(s) for endpoints"""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if session.get('role') not in allowed_roles:
                return jsonify({
                    'status': 'error',
                    'error': 'Insufficient permissions'
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

@app.route('/artist-genre', methods=['GET'])
def get_all_artist_genres():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT ag.artist, ag.genre_id, g.genre_name
        FROM artist_genre ag
        LEFT JOIN genres g ON ag.genre_id = g.id
        ORDER BY ag.artist ASC
    ''')

    artists = cursor.fetchall()
    conn.close()

    return jsonify([dict(artist) for artist in artists])

@app.route('/artist-genre/<artist_name>', methods=['GET'])
def get_artist_genre(artist_name):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT ag.artist, ag.genre_id, g.genre_name
        FROM artist_genre ag
        LEFT JOIN genres g ON ag.genre_id = g.id
        WHERE ag.artist = ?
    ''', (artist_name,))

    artist = cursor.fetchone()
    conn.close()

    if not artist:
        return jsonify({'status': 'error', 'error': 'Artist not found'}), 404

    return jsonify(dict(artist))

# Get all accessories
@app.route('/accessories', methods=['GET'])
def get_accessories():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, description, bar_code, store_price, count, created_at, updated_at
        FROM accessories
        ORDER BY created_at DESC
    ''')
    
    accessories = cursor.fetchall()
    conn.close()
    
    return jsonify({
        'status': 'success',
        'accessories': [dict(acc) for acc in accessories]
    })

@app.route('/print-receipt', methods=['POST'])
def print_receipt():
    """
    Send receipt data to thermal printer
    Expected JSON: {
        "printer": "/dev/usb/lp2",  # printer device path
        "data": "formatted receipt text with ESC/POS commands"
    }
    """
    data = request.get_json()
    
    if not data or 'printer' not in data or 'data' not in data:
        return jsonify({'status': 'error', 'message': 'Missing printer or data'}), 400
    
    printer_path = data['printer']
    receipt_data = data['data']
    
    # Validate printer path (security - prevent path traversal)
    if not printer_path.startswith('/dev/usb/lp'):
        return jsonify({'status': 'error', 'message': 'Invalid printer path'}), 400
    
    try:
        # Method 1: Direct write to device file (most reliable for Linux)
        with open(printer_path, 'wb') as printer:
            printer.write(receipt_data.encode('utf-8'))
            printer.flush()
        
        # Alternative Method 2: Using lp command if direct write doesn't work
        # Uncomment if needed:
        # process = subprocess.run(['lp', '-d', os.path.basename(printer_path)], 
        #                          input=receipt_data, 
        #                          capture_output=True, 
        #                          text=True)
        
        return jsonify({
            'status': 'success', 
            'message': 'Receipt sent to printer',
            'printer': printer_path
        })
        
    except PermissionError:
        # Try to fix permissions if needed
        try:
            # Make printer writable for the web server user
            subprocess.run(['sudo', 'chmod', '666', printer_path], check=False)
            
            # Try writing again
            with open(printer_path, 'wb') as printer:
                printer.write(receipt_data.encode('utf-8'))
                printer.flush()
                
            return jsonify({
                'status': 'success', 
                'message': 'Receipt sent to printer (permission fixed)',
                'printer': printer_path
            })
        except Exception as e:
            return jsonify({
                'status': 'error', 
                'message': f'Permission denied and could not fix: {str(e)}'
            }), 500
            
    except FileNotFoundError:
        return jsonify({
            'status': 'error', 
            'message': f'Printer not found at {printer_path}'
        }), 404
        
    except Exception as e:
        return jsonify({
            'status': 'error', 
            'message': f'Print error: {str(e)}'
        }), 500


# Optional: Add endpoint to test printer
@app.route('/print-test', methods=['POST'])
def print_test():
    """Send a simple test page to the printer"""
    test_data = {
        'printer': '/dev/usb/lp2',
        'data': '\x1B\x40' +  # Initialize
                '\x1B\x61\x01' +  # Center
                'PigStyle Music\n' +
                'Test Page\n' +
                ''.padEnd(32, '=') + '\n' +
                '\x1B\x61\x00' +  # Left
                'Date: ' + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + '\n' +
                'Printer: VCP-8370\n' +
                'Status: Working!\n\n\n\n'
    }
    
    return print_receipt.__wrapped__(test_data)  # Call the actual function


# Optional: Add endpoint to list available printers
@app.route('/printers', methods=['GET'])
def list_printers():
    """List all USB printers connected to the system"""
    import glob
    
    printers = glob.glob('/dev/usb/lp*')
    
    result = []
    for printer in printers:
        try:
            # Try to get printer info (if possible)
            result.append({
                'path': printer,
                'available': os.path.exists(printer),
                'writable': os.access(printer, os.W_OK)
            })
        except:
            result.append({
                'path': printer,
                'available': True,
                'writable': False
            })
    
    return jsonify({
        'status': 'success',
        'printers': result
    })

# Get single accessory
@app.route('/accessories/<int:accessory_id>', methods=['GET'])
def get_accessory(accessory_id):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, description, bar_code, store_price, count, created_at, updated_at
        FROM accessories
        WHERE id = ?
    ''', (accessory_id,))
    
    accessory = cursor.fetchone()
    conn.close()
    
    if accessory:
        return jsonify({
            'status': 'success',
            'accessory': dict(accessory)
        })
    else:
        return jsonify({
            'status': 'error',
            'message': 'Accessory not found'
        }), 404

# Add new accessory
@app.route('/accessories', methods=['POST'])
def add_accessory():
    data = request.json
    
    # Validate required fields
    if not data.get('description') or not data.get('store_price'):
        return jsonify({
            'status': 'error',
            'message': 'Description and store_price are required'
        }), 400
    
    # Generate barcode (you can customize this logic)
    import random
    import string
    
    # Generate a unique barcode (e.g., ACC + timestamp + random numbers)
    timestamp = str(int(time.time()))[-6:]
    random_digits = ''.join(random.choices(string.digits, k=4))
    barcode = f"ACC{timestamp}{random_digits}"
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            INSERT INTO accessories (description, bar_code, store_price, count)
            VALUES (?, ?, ?, ?)
        ''', (
            data['description'],
            barcode,
            float(data['store_price']),
            data.get('count', 0)
        ))
        
        conn.commit()
        accessory_id = cursor.lastrowid
        
        cursor.execute('SELECT * FROM accessories WHERE id = ?', (accessory_id,))
        new_accessory = cursor.fetchone()
        
        return jsonify({
            'status': 'success',
            'message': 'Accessory added successfully',
            'accessory': dict(new_accessory)
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
    finally:
        conn.close()

# Update accessory
@app.route('/accessories/<int:accessory_id>', methods=['PUT'])
def update_accessory(accessory_id):
    data = request.json
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if accessory exists
    cursor.execute('SELECT id FROM accessories WHERE id = ?', (accessory_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({
            'status': 'error',
            'message': 'Accessory not found'
        }), 404
    
    # Build update query dynamically based on provided fields
    updates = []
    values = []
    
    if 'description' in data:
        updates.append('description = ?')
        values.append(data['description'])
    
    if 'store_price' in data:
        updates.append('store_price = ?')
        values.append(float(data['store_price']))
    
    if 'count' in data:
        updates.append('count = ?')
        values.append(data['count'])
    
    if not updates:
        conn.close()
        return jsonify({
            'status': 'error',
            'message': 'No fields to update'
        }), 400
    
    values.append(accessory_id)
    
    try:
        cursor.execute(f'''
            UPDATE accessories 
            SET {', '.join(updates)}
            WHERE id = ?
        ''', values)
        
        conn.commit()
        
        cursor.execute('SELECT * FROM accessories WHERE id = ?', (accessory_id,))
        updated_accessory = cursor.fetchone()
        
        return jsonify({
            'status': 'success',
            'message': 'Accessory updated successfully',
            'accessory': dict(updated_accessory)
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
    finally:
        conn.close()

# Delete accessory
@app.route('/accessories/<int:accessory_id>', methods=['DELETE'])
def delete_accessory(accessory_id):
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute('DELETE FROM accessories WHERE id = ?', (accessory_id,))
        conn.commit()
        
        if cursor.rowcount > 0:
            return jsonify({
                'status': 'success',
                'message': 'Accessory deleted successfully'
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'Accessory not found'
            }), 404
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
    finally:
        conn.close()

# Generate new barcode for accessory
@app.route('/accessories/<int:accessory_id>/generate-barcode', methods=['POST'])
def generate_new_barcode(accessory_id):
    import random
    import string
    
    # Generate a new unique barcode
    timestamp = str(int(time.time()))[-6:]
    random_digits = ''.join(random.choices(string.digits, k=4))
    new_barcode = f"ACC{timestamp}{random_digits}"
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            UPDATE accessories 
            SET bar_code = ?
            WHERE id = ?
        ''', (new_barcode, accessory_id))
        
        conn.commit()
        
        return jsonify({
            'status': 'success',
            'message': 'Barcode regenerated successfully',
            'bar_code': new_barcode
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
    finally:
        conn.close()

@app.route('/artist-genre/genre/<int:genre_id>', methods=['GET'])
def get_artists_by_genre(genre_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT ag.artist, ag.genre_id, g.genre_name
        FROM artist_genre ag
        LEFT JOIN genres g ON ag.genre_id = g.id
        WHERE ag.genre_id = ?
        ORDER BY ag.artist ASC
    ''', (genre_id,))

    artists = cursor.fetchall()
    conn.close()

    return jsonify([dict(artist) for artist in artists])


@app.route('/api/square/terminals', methods=['GET'])
@login_required
@role_required(['admin'])
def api_get_terminals():
    """Get list of available Square Terminal devices"""
    try:
        headers = {
            'Authorization': f'Bearer {os.environ.get("SQUARE_ACCESS_TOKEN")}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        response = requests.get('https://connect.squareup.com/v2/devices', headers=headers)
        data = response.json()
        
        if response.status_code != 200:
            return jsonify({'status': 'error', 'message': str(data)}), 400
        
        devices = data.get('devices', [])
        
        # Format devices for frontend
        enhanced_devices = []
        for device in devices:
            device_id = device.get('id')
            
            # Get status - Square returns {"category": "AVAILABLE"}
            status_obj = device.get('status', {})
            raw_status = status_obj.get('category', 'UNKNOWN')
            
            # Map to frontend expected values
            if raw_status == 'AVAILABLE':
                display_status = 'ONLINE'
            elif raw_status == 'OFFLINE':
                display_status = 'OFFLINE'
            else:
                display_status = 'UNKNOWN'
            
            # Get device name
            attributes = device.get('attributes', {})
            device_name = attributes.get('name', 'Square Terminal')
            
            enhanced_devices.append({
                'id': device_id,
                'device_name': device_name,
                'status': display_status,  # Now 'ONLINE' instead of {'category': 'AVAILABLE'}
                'raw_status': raw_status,  # Include for debugging
                'device_type': attributes.get('type', 'TERMINAL'),
                'manufacturer': attributes.get('manufacturer', 'Square')
            })
        
        app.logger.info(f"Sending {len(enhanced_devices)} devices with status: {enhanced_devices[0]['status'] if enhanced_devices else 'none'}")
        
        return jsonify({
            'status': 'success',
            'terminals': enhanced_devices
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error in api_get_terminals: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
    
     
@app.route('/api/square/terminal/checkout', methods=['POST'])
@login_required
@role_required(['admin'])
def api_create_terminal_checkout():
    """Create a new terminal checkout"""
    try:
        data = request.get_json()
        amount_cents = data.get('amount_cents')
        record_ids = data.get('record_ids', [])
        record_titles = data.get('record_titles', [])
        reference_id = data.get('reference_id')
        device_id = data.get('device_id')
        
        if not amount_cents:
            return jsonify({
                'status': 'error',
                'message': 'Amount is required'
            }), 400
            
        if not record_ids or not record_titles:
            return jsonify({
                'status': 'error',
                'message': 'Record information is required'
            }), 400
        
        result, error = create_square_terminal_checkout(
            amount_cents, 
            record_ids, 
            record_titles, 
            reference_id,
            device_id
        )
        
        if error:
            return jsonify({
                'status': 'error',
                'message': error
            }), 400
        
        return jsonify({
            'status': 'success',
            'checkout': result.get('checkout', {})
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error in api_create_terminal_checkout: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/square/terminal/checkout/<checkout_id>/status', methods=['GET'])
@login_required
@role_required(['admin'])
def api_get_checkout_status(checkout_id):
    """Get status of a terminal checkout"""
    try:
        result, error = get_terminal_checkout_status(checkout_id)
        
        if error:
            return jsonify({
                'status': 'error',
                'message': error
            }), 400
        
        return jsonify({
            'status': 'success',
            'checkout': result
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error in api_get_checkout_status: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
    
     

@app.route('/api/square/terminal/checkout/<checkout_id>/cancel', methods=['POST'])
@login_required
@role_required(['admin'])
def api_cancel_checkout(checkout_id):
    """Cancel a pending terminal checkout"""
    try:
        result, error = cancel_terminal_checkout(checkout_id)
        
        if error:
            return jsonify({
                'status': 'error',
                'message': error
            }), 400
        
        return jsonify({
            'status': 'success',
            'result': result
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error in api_cancel_checkout: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/square/payment/<payment_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def api_get_payment(payment_id):
    """Get payment details"""
    try:
        payment, error = get_payment_details(payment_id)
        
        if error:
            return jsonify({
                'status': 'error',
                'message': error
            }), 400
        
        return jsonify({
            'status': 'success',
            'payment': payment
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error in api_get_payment: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/square/webhook', methods=['POST'])
def square_webhook():
    """Handle Square webhook events"""
    try:
        # Get signature from headers
        signature = request.headers.get('x-square-hmacsha256-signature', '')
        
        # Verify webhook signature
        if not verify_square_webhook(signature, request.data):
            app.logger.warning('Invalid webhook signature')
            return jsonify({'status': 'error', 'message': 'Invalid signature'}), 401
        
        # Parse webhook data
        webhook_data = request.json
        event_type = webhook_data.get('type')
        data = webhook_data.get('data', {})
        
        app.logger.info(f"Received Square webhook: {event_type}")
        
        # Handle different event types
        if event_type == 'terminal.checkout.updated':
            checkout = data.get('object', {}).get('checkout', {})
            checkout_id = checkout.get('id')
            status = checkout.get('status')
            
            if checkout_id in square_payment_sessions:
                square_payment_sessions[checkout_id]['status'] = status
                
                if status == 'COMPLETED':
                    payment_id = checkout.get('payment_ids', [None])[0]
                    if payment_id:
                        square_payment_sessions[checkout_id]['payment_id'] = payment_id
                        app.logger.info(f"Stored payment_id {payment_id} for checkout {checkout_id}")
                        
                        # Auto-process the sale
                        record_ids = square_payment_sessions[checkout_id].get('record_ids', [])
                        if record_ids:
                            conn = get_db()
                            cursor = conn.cursor()
                            today = datetime.now().date().isoformat()
                            placeholders = ','.join('?' for _ in record_ids)
                            
                            cursor.execute(f'''
                                UPDATE records
                                SET status_id = 3, date_sold = ?
                                WHERE id IN ({placeholders})
                            ''', [today] + record_ids)
                            
                            conn.commit()
                            conn.close()
                            
                            app.logger.info(f"Auto-processed {len(record_ids)} records for checkout {checkout_id}")
        
        return jsonify({'status': 'success'}), 200
        
    except Exception as e:
        app.logger.error(f"Error in square_webhook: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


# ==================== RECEIPTS ENDPOINTS ====================

@app.route('/api/receipts', methods=['GET'])
def get_receipts():
    """Get all receipts from database"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get query parameters for filtering
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        payment_method = request.args.get('payment_method')
        search = request.args.get('search')
        
        query = "SELECT * FROM receipts WHERE 1=1"
        params = []
        
        if start_date:
            query += " AND DATE(created_at) >= DATE(?)"
            params.append(start_date)
        
        if end_date:
            query += " AND DATE(created_at) <= DATE(?)"
            params.append(end_date)
        
        if payment_method:
            query += " AND payment_method = ?"
            params.append(payment_method)
        
        if search:
            query += " AND (receipt_id LIKE ? OR transaction_data LIKE ?)"
            search_term = f"%{search}%"
            params.extend([search_term, search_term])
        
        query += " ORDER BY created_at DESC"
        
        cursor.execute(query, params)
        receipts = cursor.fetchall()
        conn.close()
        
        receipts_list = []
        for r in receipts:
            receipt_dict = dict(r)
            # Parse the JSON transaction_data
            try:
                receipt_dict['transaction_data'] = json.loads(receipt_dict['transaction_data'])
            except:
                receipt_dict['transaction_data'] = {}
            receipts_list.append(receipt_dict)
        
        return jsonify({
            'status': 'success',
            'count': len(receipts_list),
            'receipts': receipts_list
        })
        
    except Exception as e:
        app.logger.error(f"Error getting receipts: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/receipts', methods=['POST'])
def save_receipt():
    """Save a receipt to database"""
    try:
        data = request.json
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        receipt_id = data.get('id')
        square_payment_id = data.get('square_payment_id')
        total = data.get('total', 0)
        tax = data.get('tax', 0)
        payment_method = data.get('paymentMethod', 'Unknown')
        cashier = data.get('cashier', 'Admin')
        
        if not receipt_id:
            return jsonify({'status': 'error', 'error': 'Missing receipt ID'}), 400
        
        # Convert the entire transaction to JSON string for storage
        transaction_json = json.dumps(data)
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if receipt already exists
        cursor.execute('SELECT id FROM receipts WHERE receipt_id = ?', (receipt_id,))
        existing = cursor.fetchone()
        
        if existing:
            # Update existing receipt
            cursor.execute('''
                UPDATE receipts 
                SET transaction_data = ?, total = ?, tax = ?, 
                    payment_method = ?, cashier = ?, square_payment_id = ?
                WHERE receipt_id = ?
            ''', (transaction_json, total, tax, payment_method, cashier, square_payment_id, receipt_id))
            message = 'Receipt updated'
        else:
            # Insert new receipt
            cursor.execute('''
                INSERT INTO receipts 
                (receipt_id, square_payment_id, transaction_data, total, tax, payment_method, cashier)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (receipt_id, square_payment_id, transaction_json, total, tax, payment_method, cashier))
            message = 'Receipt saved'
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': message,
            'receipt_id': receipt_id
        })
        
    except Exception as e:
        app.logger.error(f"Error saving receipt: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/receipts/<receipt_id>', methods=['GET'])
def get_receipt(receipt_id):
    """Get a single receipt by ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM receipts WHERE receipt_id = ?', (receipt_id,))
        receipt = cursor.fetchone()
        conn.close()
        
        if not receipt:
            return jsonify({'status': 'error', 'error': 'Receipt not found'}), 404
        
        receipt_dict = dict(receipt)
        try:
            receipt_dict['transaction_data'] = json.loads(receipt_dict['transaction_data'])
        except:
            receipt_dict['transaction_data'] = {}
        
        return jsonify({
            'status': 'success',
            'receipt': receipt_dict
        })
        
    except Exception as e:
        app.logger.error(f"Error getting receipt: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/receipts/<receipt_id>', methods=['DELETE'])
def delete_receipt(receipt_id):
    """Delete a receipt (admin only)"""
    try:
        # Check if user is admin (you may want to add authentication check)
        if session.get('role') != 'admin':
            return jsonify({'status': 'error', 'error': 'Unauthorized'}), 403
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM receipts WHERE receipt_id = ?', (receipt_id,))
        conn.commit()
        affected = cursor.rowcount
        conn.close()
        
        if affected > 0:
            return jsonify({
                'status': 'success',
                'message': 'Receipt deleted'
            })
        else:
            return jsonify({
                'status': 'error',
                'error': 'Receipt not found'
            }), 404
        
    except Exception as e:
        app.logger.error(f"Error deleting receipt: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/receipts/stats', methods=['GET'])
def get_receipt_stats():
    """Get receipt statistics"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get date range
        days = request.args.get('days', 30, type=int)
        
        cursor.execute('''
            SELECT 
                COUNT(*) as total_count,
                SUM(total) as total_sales,
                SUM(tax) as total_tax,
                AVG(total) as average_sale,
                payment_method,
                DATE(created_at) as sale_date
            FROM receipts
            WHERE created_at >= DATE('now', ?)
            GROUP BY DATE(created_at), payment_method
            ORDER BY sale_date DESC
        ''', (f'-{days} days',))
        
        stats = cursor.fetchall()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'stats': [dict(s) for s in stats]
        })
        
    except Exception as e:
        app.logger.error(f"Error getting receipt stats: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/debug/checkout-direct/<checkout_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def debug_checkout_direct(checkout_id):
    """Debug endpoint to directly call Square API for a checkout"""
    try:
        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        environment = os.environ.get('SQUARE_ENVIRONMENT', 'production')
        base_url = 'https://connect.squareup.com' if environment == 'production' else 'https://connect.squareupsandbox.com'
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        # Try different URL formats
        results = {}
        
        # Format 1: Standard
        url1 = f"{base_url}/v2/terminals/checkouts/{checkout_id}"
        response1 = requests.get(url1, headers=headers)
        results['standard'] = {
            'url': url1,
            'status': response1.status_code,
            'response': response1.text[:500]
        }
        
        # Format 2: With termapia prefix
        url2 = f"{base_url}/v2/terminals/checkouts/termapia:{checkout_id}"
        response2 = requests.get(url2, headers=headers)
        results['with_prefix'] = {
            'url': url2,
            'status': response2.status_code,
            'response': response2.text[:500]
        }
        
        return jsonify({
            'status': 'success',
            'checkout_id': checkout_id,
            'results': results
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/receipts/sync', methods=['POST'])
def sync_receipts():
    """Sync localStorage receipts to database"""
    try:
        data = request.json
        if not data or 'receipts' not in data:
            return jsonify({'status': 'error', 'error': 'No receipts provided'}), 400
        
        local_receipts = data['receipts']
        synced_count = 0
        
        conn = get_db()
        cursor = conn.cursor()
        
        for receipt_data in local_receipts:
            receipt_id = receipt_data.get('id')
            if not receipt_id:
                continue
            
            square_payment_id = receipt_data.get('square_payment_id')
            total = receipt_data.get('total', 0)
            tax = receipt_data.get('tax', 0)
            payment_method = receipt_data.get('paymentMethod', 'Unknown')
            cashier = receipt_data.get('cashier', 'Admin')
            transaction_json = json.dumps(receipt_data)
            
            # Check if already exists
            cursor.execute('SELECT id FROM receipts WHERE receipt_id = ?', (receipt_id,))
            existing = cursor.fetchone()
            
            if not existing:
                cursor.execute('''
                    INSERT INTO receipts 
                    (receipt_id, square_payment_id, transaction_data, total, tax, payment_method, cashier, synced_from_local)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                ''', (receipt_id, square_payment_id, transaction_json, total, tax, payment_method, cashier))
                synced_count += 1
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Synced {synced_count} receipts to database',
            'synced_count': synced_count
        })
        
    except Exception as e:
        app.logger.error(f"Error syncing receipts: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/square/terminal/session/<checkout_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def api_get_checkout_session(checkout_id):
    """Get stored checkout session information"""
    try:
        if checkout_id in square_payment_sessions:
            return jsonify({
                'status': 'success',
                'session': square_payment_sessions[checkout_id]
            }), 200
        else:
            return jsonify({
                'status': 'error',
                'message': 'Session not found'
            }), 404
            
    except Exception as e:
        app.logger.error(f"Error in api_get_checkout_session: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# ==================== TEST SQUARE CONNECTION ====================

@app.route('/test-square', methods=['GET'])
def test_square():
    """Test Square API connection and list available devices"""
    result = []
    
    # Test authentication and get devices
    devices, error = get_terminal_devices()
    
    if error:
        result.append(f"❌ Error: {error}")
    else:
        result.append(f"✅ Successfully connected to Square API")
        result.append(f"✅ Found {len(devices)} terminal device(s)")
        
        for device in devices:
            result.append(f"  📱 Device ID: {device.get('id')}")
            result.append(f"  📱 Device Name: {device.get('device_name')}")
            result.append(f"  🔋 Status: {device.get('status')}")
    
    # Environment info
    result.append(f"🏁 Environment: {os.environ.get('SQUARE_ENVIRONMENT', 'not set')}")
    result.append(f"🔑 Token length: {len(os.environ.get('SQUARE_ACCESS_TOKEN', ''))} chars")
    result.append(f"🎯 Location ID: {os.environ.get('SQUARE_LOCATION_ID', 'not set')}")
    
    return jsonify({
        "status": "success" if not error else "error",
        "results": result,
        "environment": SQUARE_ENVIRONMENT,
        "location_id": SQUARE_LOCATION_ID,
        "device_id": SQUARE_TERMINAL_DEVICE_ID
    })

# ==================== PRICE ESTIMATE ENDPOINTS ====================

@app.route('/api/price-estimate-debug', methods=['POST'])
def price_estimate_debug():
    """Debug endpoint: Get price estimate with raw eBay data"""
    try:
        data = request.json
        artist = data.get('artist')
        title = data.get('title')
        condition = data.get('condition')
        discogs_genre = data.get('discogs_genre', '')
        discogs_id = data.get('discogs_id', '')
        
        # Initialize price advisor
        price_advisor = PriceAdviseHandler(
            discogs_token=app.config.get('DISCOGS_USER_TOKEN'),
            ebay_client_id=app.config.get('EBAY_CLIENT_ID'),
            ebay_client_secret=app.config.get('EBAY_CLIENT_SECRET')
        )
        
        # Call internal method directly to get raw eBay data
        ebay_result = price_advisor._get_ebay_price_with_listings(
            artist=artist,
            title=title,
            condition=condition
        )
        
        return jsonify({
            'status': 'success',
            'debug_info': 'Raw eBay API result',
            'ebay_raw_result': ebay_result,
            'artist': artist,
            'title': title,
            'condition': condition
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/price-estimate', methods=['POST'])
def price_estimate():
    try:
        data = request.json
        artist = data.get('artist')
        title = data.get('title')
        condition = data.get('condition')
        discogs_genre = data.get('discogs_genre', '')
        discogs_id = data.get('discogs_id', '')
        
        app.logger.info(f"Price estimate called: {artist} - {title}")
        
        # Initialize price advisor
        price_advisor = PriceAdviseHandler(
            discogs_token=app.config.get('DISCOGS_USER_TOKEN'),
            ebay_client_id=app.config.get('EBAY_CLIENT_ID'),
            ebay_client_secret=app.config.get('EBAY_CLIENT_SECRET')
        )
        
        # Get price estimate
        result = price_advisor.get_price_estimate(
            artist=artist,
            title=title,
            selected_condition=condition,
            discogs_genre=discogs_genre,
            discogs_id=discogs_id
        )
        
        # Apply rounding rules
        estimated_price = result['estimated_price'] if result['success'] else 19.99
        
        def round_down_to_99(price):
            """Round any price DOWN to nearest .99 below it"""
            import math
            price_float = float(price)
            dollars = math.floor(price_float)
            cents = price_float - dollars
            if abs(cents - 0.99) < 0.01:
                return dollars + 0.99
            if dollars == 0:
                return 0.99
            return (dollars - 1) + 0.99
        
        min_price = float(app.config.get('MIN_STORE_PRICE', 1.99))
        rounded_price = round_down_to_99(estimated_price)
        
        if rounded_price < min_price:
            rounded_price = min_price
        
        result['estimated_price'] = rounded_price
        result['original_estimated_price'] = estimated_price
        result['rounded_price'] = rounded_price
        result['minimum_price'] = min_price
        result['price_source'] = result.get('price_source', 'unknown')
        
        if 'calculation' not in result:
            result['calculation'] = []
        
        result['calculation'].append(f"Original estimated price: ${estimated_price:.2f}")
        result['calculation'].append(f"Rounded DOWN to nearest .99: ${rounded_price:.2f}")
        if rounded_price == min_price and round_down_to_99(estimated_price) < min_price:
            result['calculation'].append(f"Minimum price ${min_price:.2f} applied")
        
        return jsonify({
            'status': 'success' if result['success'] else 'error',
            'success': result['success'],
            'estimated_price': result['estimated_price'],
            'original_estimated_price': result.get('original_estimated_price', estimated_price),
            'rounded_price': result['rounded_price'],
            'minimum_price': result['minimum_price'],
            'price': result['estimated_price'],
            'price_source': result.get('price_source', 'unknown'),
            'calculation': result.get('calculation', []),
            'ebay_summary': result.get('ebay_summary', {}),
            'ebay_listings': result.get('ebay_listings', []),
            'ebay_listings_count': len(result.get('ebay_listings', [])),
            'condition_listings_count': result.get('ebay_summary', {}).get('condition_listings', 0),
            'source': result.get('price_source', 'unknown')
        })
        
    except Exception as e:
        app.logger.error(f"Price estimate error: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e),
            'estimated_price': 19.99,
            'rounded_price': 19.99,
            'minimum_price': 1.99,
            'calculation': [f"Error: {str(e)}"],
            'ebay_summary': {},
            'ebay_listings': [],
            'ebay_listings_count': 0
        }), 500

@app.route('/api/price-advice', methods=['POST'])
def get_price_advice():
    """Get price advice based on eBay and Discogs data"""
    try:
        data = request.get_json()
        
        required_fields = ['artist', 'title', 'condition']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'status': 'error',
                    'error': f'Missing required field: {field}'
                }), 400
        
        artist = data['artist']
        title = data['title']
        condition = data['condition']
        discogs_genre = data.get('discogs_genre')
        
        mock_price = 24.99
        
        return jsonify({
            'status': 'success',
            'advised_price': mock_price,
            'price_source': 'mock_data',
            'note': 'PriceAdviseHandler integration pending'
        })
        
    except Exception as e:
        app.logger.error(f"Price advice error: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': f'Server error: {str(e)}'
        }), 500

# ==================== AUTHENTICATION ENDPOINTS ====================

@app.route('/api/login', methods=['POST', 'OPTIONS'])
def login():
    """Authenticate user and return user data with session"""
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 200
    
    try:
        data = request.get_json(force=True, silent=True)
        
        if data is None:
            return jsonify({'status': 'error', 'error': 'Invalid JSON data'}), 400

        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400

        required_fields = ['username', 'password']
        for field in required_fields:
            if field not in data:
                return jsonify({'status': 'error', 'error': f'{field} required'}), 400

        username = data['username']
        password = data['password']

        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT id, username, email, password_hash, role, full_name, 
                    store_credit_balance
            FROM users 
            WHERE username = ?
        ''', (username,))

        user = cursor.fetchone()
        
        if not user:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Invalid username or password'}), 401

        stored_hash = user['password_hash']
        
        if '$' in stored_hash:
            salt, hash_value = stored_hash.split('$')
            password_hash = hashlib.sha256((salt + password).encode()).hexdigest()
            
            if password_hash != hash_value:
                conn.close()
                return jsonify({'status': 'error', 'error': 'Invalid username or password'}), 401
        else:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Invalid password format'}), 401

        cursor.execute('''
            UPDATE users 
            SET last_login = CURRENT_TIMESTAMP 
            WHERE id = ?
        ''', (user['id'],))
        
        conn.commit()
        conn.close()

        session['user_id'] = user['id']
        session['username'] = user['username']
        session['role'] = user['role']
        session['logged_in'] = True
        
        session_id = f"session_{user['id']}_{int(time.time())}"
        
        user_data = {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'role': user['role'],
            'full_name': user['full_name'],
            'store_credit_balance': float(user['store_credit_balance']) if user['store_credit_balance'] is not None else 0.0
        }
        
        response = jsonify({
            'status': 'success',
            'message': 'Login successful',
            'user': user_data,
            'session_id': session_id
        })
        
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        
        return response

    except Exception as e:
        app.logger.error(f"Login error: {str(e)}", exc_info=True)
        
        response = jsonify({
            'status': 'error', 
            'error': f'Server error: {str(e)}'
        })
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 500

@app.route('/logout', methods=['POST'])
def logout():
    """Log out the current user"""
    session.clear()
    
    response = jsonify({
        'status': 'success',
        'message': 'Logged out successfully'
    })
    
    response.set_cookie(
        'session',
        '',
        expires=0,
        max_age=0,
        path='/',
        domain=None,
        secure=False,
        httponly=True,
        samesite='Lax'
    )
    
    response.set_cookie('remember_token', '', expires=0, path='/')
    
    return response

@app.route('/session/check', methods=['GET'])
def check_session():
    """Check if user is logged in and return session info"""
    if 'user_id' in session and session.get('logged_in'):
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, username, email, role, full_name, 
                    store_credit_balance
            FROM users WHERE id = ?
        ''', (session['user_id'],))
        
        user = cursor.fetchone()
        conn.close()
        
        if user:
            user_data = {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'role': user['role'],
                'full_name': user['full_name'],
                'store_credit_balance': float(user['store_credit_balance']) if user['store_credit_balance'] is not None else 0.0
            }
            
            return jsonify({
                'status': 'success',
                'logged_in': True,
                'user': user_data
            })
    
    return jsonify({
        'status': 'success',
        'logged_in': False,
        'user': None
    })

# ==================== USER MANAGEMENT ENDPOINTS ====================

@app.route('/users', methods=['POST'])
def create_user():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400

    required_fields = ['username', 'email', 'password', 'role']
    for field in required_fields:
        if field not in data:
            return jsonify({'status': 'error', 'error': f'{field} required'}), 400

    username = data['username']
    email = data['email']
    password = data['password']
    role = data['role']
    full_name = data.get('full_name', '')

    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        return jsonify({'status': 'error', 'error': 'Invalid email format'}), 400

    if role not in ['admin', 'consignor']:
        return jsonify({'status': 'error', 'error': 'Invalid role'}), 400

    if len(password) < 8:
        return jsonify({'status': 'error', 'error': 'Password must be at least 8 characters long'}), 400

    if not re.search(r'[A-Z]', password):
        return jsonify({'status': 'error', 'error': 'Password must contain at least one uppercase letter'}), 400

    if not re.search(r'[a-z]', password):
        return jsonify({'status': 'error', 'error': 'Password must contain at least one lowercase letter'}), 400

    if not re.search(r'[0-9]', password):
        return jsonify({'status': 'error', 'error': 'Password must contain at least one number'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Username already exists'}), 400

    cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Email already exists'}), 400

    salt = secrets.token_hex(16)
    password_hash = f"{salt}${hashlib.sha256((salt + password).encode()).hexdigest()}"

    cursor.execute('''
        INSERT INTO users (username, email, password_hash, role, full_name, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ''', (username, email, password_hash, role, full_name))

    user_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': 'User created successfully',
        'user_id': user_id
    })

@app.route('/users', methods=['GET'])
def get_users():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, username, email, role, full_name, phone, address, 
               created_at, last_login, store_credit_balance,
               initials, is_active, last_payout_date,
               failed_attempts, locked_until
        FROM users
        ORDER BY username
    ''')

    users = cursor.fetchall()
    conn.close()

    users_list = []
    for user in users:
        users_list.append({
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'role': user['role'],
            'full_name': user['full_name'],
            'phone': user['phone'],
            'address': user['address'],
            'created_at': user['created_at'],
            'last_login': user['last_login'],
            'store_credit_balance': float(user['store_credit_balance']) if user['store_credit_balance'] is not None else 0.0,
            'initials': user['initials'],
            'is_active': bool(user['is_active']) if user['is_active'] is not None else True,
            'last_payout_date': user['last_payout_date'],
            'failed_attempts': user['failed_attempts'],
            'locked_until': user['locked_until']
        })

    return jsonify({
        'status': 'success',
        'count': len(users_list),
        'users': users_list
    })

@app.route('/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, username, email, full_name, phone, address,
               role, created_at, last_login, store_credit_balance,
                initials, is_active
        FROM users WHERE id = ?
    ''', (user_id,))

    user = cursor.fetchone()
    conn.close()

    if user:
        return jsonify({
            'id': user[0],
            'username': user[1],
            'email': user[2],
            'full_name': user[3],
            'phone': user[4],
            'address': user[5],
            'role': user[6],
            'created_at': user[7],
            'last_login': user[8],
            'store_credit_balance': float(user[9]) if user[9] is not None else 0.0,
            'initials': user[10],
            'is_active': bool(user[11]) if user[11] is not None else True
        })
    else:
        return jsonify({'error': 'User not found'}), 404

@app.route('/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM users WHERE id = ?', (user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'User not found'}), 404

    update_fields = []
    update_values = []

    allowed_fields = ['store_credit_balance', 'full_name', 'phone', 'address', 'payout_requested']

    for key, value in data.items():
        if key in allowed_fields:
            update_fields.append(f"{key} = ?")
            update_values.append(value)

    if not update_fields:
        conn.close()
        return jsonify({'status': 'error', 'error': 'No valid fields to update'}), 400

    update_values.append(user_id)
    update_query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = ?"

    cursor.execute(update_query, update_values)
    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'message': 'User updated'})

@app.route('/users/<int:user_id>/reset-password', methods=['POST'])
def reset_password(user_id):
    data = request.get_json()
    if not data or 'new_password' not in data:
        return jsonify({'status': 'error', 'error': 'new_password required'}), 400

    new_password = data['new_password']

    conn = get_db()
    cursor = conn.cursor()

    salt = secrets.token_hex(16)
    password_hash = f"{salt}${hashlib.sha256((salt + new_password).encode()).hexdigest()}"

    cursor.execute('''
        UPDATE users SET password_hash = ? WHERE id = ?
    ''', (password_hash, user_id))

    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'message': 'Password reset successfully'})

@app.route('/users/<int:user_id>/change-password', methods=['POST'])
def change_password(user_id):
    data = request.get_json()
    if not data or 'current_password' not in data or 'new_password' not in data:
        return jsonify({'status': 'error', 'error': 'current_password and new_password required'}), 400

    current_password = data['current_password']
    new_password = data['new_password']

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT password_hash FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()

    if not user:
        return jsonify({'status': 'error', 'error': 'User not found'}), 404

    stored_hash = user['password_hash']
    if '$' in stored_hash:
        salt, hash_value = stored_hash.split('$')
        current_hash = hashlib.sha256((salt + current_password).encode()).hexdigest()
        if current_hash != hash_value:
            return jsonify({'status': 'error', 'error': 'Current password incorrect'}), 400

    salt = secrets.token_hex(16)
    new_password_hash = f"{salt}${hashlib.sha256((salt + new_password).encode()).hexdigest()}"

    cursor.execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_password_hash, user_id))
    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'message': 'Password changed successfully'})

@app.route('/api/admin/users', methods=['GET'])
@role_required(['admin'])
def get_all_users_admin():
    """Admin-only endpoint to get all users"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, username, email, role, full_name, phone, address, 
               created_at, last_login, store_credit_balance
        FROM users
        ORDER BY username
    ''')

    users = cursor.fetchall()
    conn.close()

    users_list = []
    for user in users:
        users_list.append({
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'role': user['role'],
            'full_name': user['full_name'],
            'phone': user['phone'],
            'address': user['address'],
            'created_at': user['created_at'],
            'last_login': user['last_login'],
            'store_credit_balance': float(user['store_credit_balance']) if user['store_credit_balance'] is not None else 0.0
        })

    return jsonify({
        'status': 'success',
        'count': len(users_list),
        'users': users_list
    })

@app.route('/debug/verify-login/<int:user_id>', methods=['POST'])
def verify_login(user_id):
    data = request.get_json()
    if not data or 'password' not in data:
        return jsonify({
            'status': 'error',
            'error': 'Password required'
        }), 400

    password = data['password']

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT password_hash FROM users WHERE id = ?
    ''', (user_id,))

    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({
            'status': 'error',
            'error': 'User not found',
            'login_valid': False
        }), 404

    return jsonify({
        'status': 'success',
        'user_id': user_id,
        'login_valid': True,
        'note': 'Debug endpoint - always returns True for testing'
    })

# ==================== RECORDS ENDPOINTS ====================

@app.route('/records', methods=['POST'])
def create_record():
    """Create a new record in the database"""
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400
    
    required_fields = ['artist', 'title', 'genre_id', 'store_price']
    for field in required_fields:
        if field not in data:
            return jsonify({'status': 'error', 'error': f'{field} required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        consignor_id = data.get('consignor_id')
        commission_rate = data.get('commission_rate', 0.20)
        status_id = data.get('status_id', 1)
        
        cursor.execute('''
            INSERT INTO records (
                artist, title, barcode, genre_id, image_url,
                catalog_number, condition, store_price,
                youtube_url, consignor_id, commission_rate,
                status_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('artist'),
            data.get('title'),
            data.get('barcode', ''),
            data.get('genre_id'),
            data.get('image_url', ''),
            data.get('catalog_number', ''),
            data.get('condition', 'Very Good (VG)'),
            float(data.get('store_price', 0.0)),
            data.get('youtube_url', ''),
            consignor_id,
            float(commission_rate),
            int(status_id)
        ))
        
        record_id = cursor.lastrowid
        conn.commit()
        
        cursor.execute('''
            SELECT r.*, g.genre_name, s.status_name 
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            WHERE r.id = ?
        ''', (record_id,))
        
        record = cursor.fetchone()
        
        response = jsonify({
            'status': 'success',
            'record': dict(record) if record else {},
            'message': f'Record added successfully with ID: {record_id}'
        })
        
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        
        return response
        
    except Exception as e:
        conn.rollback()
        error_msg = f"Database error: {str(e)}"
        
        response = jsonify({
            'status': 'error',
            'error': error_msg
        })
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 500
    finally:
        conn.close()

@app.route('/config/square', methods=['GET'])
def get_square_config():
    """Get Square configuration for frontend - ALWAYS PRODUCTION"""
    try:
        # Force production environment
        application_id = os.environ.get('SQUARE_APPLICATION_ID')
        location_id = os.environ.get('SQUARE_LOCATION_ID')
        
        # Verify we have production credentials (not sandbox)
        if not application_id or not location_id:
            return jsonify({
                'status': 'error',
                'error': 'Square production configuration not found'
            }), 404
            
        # Ensure we're not using sandbox IDs
        if application_id.startswith('sandbox-'):
            return jsonify({
                'status': 'error',
                'error': 'Sandbox application ID detected. Please use production credentials.'
            }), 400
        
        return jsonify({
            'status': 'success',
            'application_id': application_id,
            'location_id': location_id,
            'environment': 'production'
        })
        
    except Exception as e:
        app.logger.error(f"Error getting Square config: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/api/square/online-payment', methods=['POST'])
def process_online_payment():
    """Process online payment with Square - ALWAYS PRODUCTION"""
    try:
        data = request.get_json()
        
        required_fields = ['token', 'amount', 'record_id', 'record_title', 'shipping_address']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'status': 'error',
                    'error': f'Missing required field: {field}'
                }), 400
        
        token = data['token']
        amount = float(data['amount'])
        record_id = data['record_id']
        record_title = data['record_title']
        shipping_address = data['shipping_address']
        
        # Get record details first to verify it's available
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            WHERE r.id = ?
        ''', (record_id,))
        
        record = cursor.fetchone()
        if not record:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Record not found'
            }), 404
        
        if record['status_id'] != 1 and record['status_id'] != 2:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Record is no longer available'
            }), 400
        
        # Get shipping cost from config
        cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'SHIPPING_COST'")
        shipping_result = cursor.fetchone()
        shipping_cost = float(shipping_result['config_value']) if shipping_result else 5.00
        
        # Get tax rate from config (reusing existing TAX_RATE)
        cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'TAX_RATE'")
        tax_result = cursor.fetchone()
        tax_rate = float(tax_result['config_value']) if tax_result else 0.00
        
        # Calculate tax
        # Assuming tax is applied to the record price + shipping
        taxable_amount = amount  # amount already includes everything
        tax_amount = round(taxable_amount * tax_rate, 2)
        
        # Calculate record price (total - shipping - tax)
        record_price = amount - shipping_cost - tax_amount
        
        # Get Square access token
        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        if not access_token:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Square access token not configured'
            }), 500
        
        # Get location ID
        location_id = os.environ.get('SQUARE_LOCATION_ID')
        if not location_id:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Square location ID not configured'
            }), 500
        
        # ALWAYS use production URL
        base_url = 'https://connect.squareup.com'
        
        # Create idempotency key
        idempotency_key = str(uuid.uuid4())
        
        # Prepare payment request
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        payment_data = {
            "idempotency_key": idempotency_key,
            "source_id": token,
            "amount_money": {
                "amount": int(round(amount * 100)),  # Convert to cents
                "currency": "USD"
            },
            "location_id": location_id,
            "note": f"PigStyle Records: {record_title}",
            "reference_id": f"record_{record_id}_{int(time.time())}"
        }
        
        app.logger.info(f"Processing PRODUCTION payment for record {record_id}, amount ${amount}")
        
        # Make API call to Square
        response = requests.post(
            f'{base_url}/v2/payments',
            headers=headers,
            json=payment_data
        )
        
        if response.status_code != 200:
            error_text = response.text[:500]
            app.logger.error(f"Square payment API error: {error_text}")
            conn.close()
            return jsonify({
                'status': 'error',
                'error': f"Payment failed: {error_text}"
            }), response.status_code
        
        result = response.json()
        
        # Check for errors
        if 'errors' in result:
            errors = result['errors']
            error_messages = [e.get('detail', 'Unknown error') for e in errors]
            conn.close()
            return jsonify({
                'status': 'error',
                'error': ', '.join(error_messages)
            }), 400
        
        payment = result.get('payment', {})
        payment_id = payment.get('id')
        
        # Generate order number
        order_number = f"ORD-{int(time.time())}-{record_id}"
        
        # Insert into orders table
        cursor.execute('''
            INSERT INTO orders (
                order_number, record_id, record_title, record_artist,
                record_condition, record_price, shipping_cost, total_amount,
                customer_name, customer_email, shipping_address_line1,
                shipping_address_line2, shipping_city, shipping_state,
                shipping_zip, shipping_country, square_payment_id,
                payment_status, order_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (
            order_number,
            record_id,
            record['title'],
            record['artist'],
            record['condition'],
            record_price,
            shipping_cost,
            amount,
            shipping_address.get('name', ''),
            shipping_address.get('email', ''),
            shipping_address.get('address_line1', ''),
            shipping_address.get('address_line2', ''),
            shipping_address.get('city', ''),
            shipping_address.get('state', ''),
            shipping_address.get('zip', ''),
            shipping_address.get('country', 'USA'),
            payment_id,
            'paid',
            'pending'
        ))
        
        # Update record status to sold with date_sold
        today = datetime.now().date().isoformat()
        cursor.execute('''
            UPDATE records
            SET status_id = 3, date_sold = ?
            WHERE id = ?
        ''', (today, record_id))
        
        # Save receipt with tax field (reusing TAX_RATE value)
        receipt_id = f"REC-{int(time.time())}-{record_id}"
        transaction_data = {
            'order_number': order_number,
            'record_id': record_id,
            'record_title': record['title'],
            'record_artist': record['artist'],
            'amount': amount,
            'record_price': record_price,
            'shipping_cost': shipping_cost,
            'tax_rate': tax_rate,  # Store the rate used
            'tax_amount': tax_amount,  # Store the calculated tax
            'shipping_address': shipping_address,
            'square_payment_id': payment_id,
            'timestamp': datetime.now().isoformat()
        }
        
        cursor.execute('''
            INSERT INTO receipts 
            (receipt_id, square_payment_id, transaction_data, total, tax, payment_method, cashier)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            receipt_id,
            payment_id,
            json.dumps(transaction_data),
            amount,
            tax_amount,  # Use the calculated tax amount
            'Credit Card',
            'Online Customer'
        ))
        
        conn.commit()
        conn.close()
        
        app.logger.info(f"PRODUCTION Order {order_number} created for record {record_id}")
        app.logger.info(f"Payment details - Total: ${amount}, Tax: ${tax_amount} (rate: {tax_rate*100}%), Shipping: ${shipping_cost}, Record: ${record_price}")
        
        return jsonify({
            'status': 'success',
            'payment_id': payment_id,
            'receipt_id': receipt_id,
            'order_number': order_number,
            'amount': amount,
            'tax_rate': tax_rate,
            'tax_amount': tax_amount,
            'shipping': shipping_cost,
            'record_price': record_price,
            'message': 'Payment processed successfully'
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error processing online payment: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/api/orders/pending', methods=['GET'])
@login_required
@role_required(['admin'])
def get_pending_orders():
    """Get all orders that need shipping"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM orders 
            WHERE order_status IN ('pending', 'processing')
            ORDER BY created_at DESC
        ''')
        
        orders = cursor.fetchall()
        conn.close()
        
        orders_list = [dict(order) for order in orders]
        
        return jsonify({
            'status': 'success',
            'count': len(orders_list),
            'orders': orders_list
        })
        
    except Exception as e:
        app.logger.error(f"Error getting pending orders: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/api/orders/all', methods=['GET'])
@login_required
@role_required(['admin'])
def get_all_orders():
    """Get all orders with optional filters"""
    try:
        status = request.args.get('status')
        days = request.args.get('days', type=int)
        
        conn = get_db()
        cursor = conn.cursor()
        
        query = "SELECT * FROM orders WHERE 1=1"
        params = []
        
        if status:
            query += " AND order_status = ?"
            params.append(status)
        
        if days:
            query += " AND created_at >= datetime('now', ?)"
            params.append(f'-{days} days')
        
        query += " ORDER BY created_at DESC"
        
        cursor.execute(query, params)
        orders = cursor.fetchall()
        conn.close()
        
        orders_list = [dict(order) for order in orders]
        
        return jsonify({
            'status': 'success',
            'count': len(orders_list),
            'orders': orders_list
        })
        
    except Exception as e:
        app.logger.error(f"Error getting orders: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/api/orders/<order_number>/mark-shipped', methods=['POST'])
@login_required
@role_required(['admin'])
def mark_order_shipped(order_number):
    """Mark an order as shipped with tracking info"""
    try:
        data = request.get_json()
        tracking_number = data.get('tracking_number')
        carrier = data.get('carrier', 'USPS')
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE orders 
            SET order_status = 'shipped',
                shipped_date = CURRENT_TIMESTAMP,
                tracking_number = ?,
                carrier = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_number = ?
        ''', (tracking_number, carrier, order_number))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Order not found'
            }), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Order {order_number} marked as shipped'
        })
        
    except Exception as e:
        app.logger.error(f"Error marking order shipped: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/api/orders/stats', methods=['GET'])
@login_required
@role_required(['admin'])
def get_order_stats():
    """Get order statistics"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get counts by status
        cursor.execute('''
            SELECT order_status, COUNT(*) as count 
            FROM orders 
            GROUP BY order_status
        ''')
        status_counts = cursor.fetchall()
        
        # Get total revenue
        cursor.execute('''
            SELECT SUM(total_amount) as total_revenue 
            FROM orders 
            WHERE order_status != 'cancelled'
        ''')
        total_revenue = cursor.fetchone()['total_revenue'] or 0
        
        # Get today's shipped orders
        cursor.execute('''
            SELECT COUNT(*) as shipped_today 
            FROM orders 
            WHERE order_status = 'shipped' 
            AND DATE(shipped_date) = DATE('now')
        ''')
        shipped_today = cursor.fetchone()['shipped_today'] or 0
        
        # Get pending count
        cursor.execute('''
            SELECT COUNT(*) as pending_orders 
            FROM orders 
            WHERE order_status = 'pending'
        ''')
        pending_orders = cursor.fetchone()['pending_orders'] or 0
        
        conn.close()
        
        stats = {
            'total_revenue': float(total_revenue),
            'shipped_today': shipped_today,
            'pending_orders': pending_orders,
            'by_status': {row['order_status']: row['count'] for row in status_counts}
        }
        
        return jsonify({
            'status': 'success',
            'stats': stats
        })
        
    except Exception as e:
        app.logger.error(f"Error getting order stats: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500
 

# Add to api.py - Add SHIPPING_COST to app_config if not exists
@app.route('/config/init-shipping', methods=['POST'])
def init_shipping_config():
    """Initialize shipping cost in app_config"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if SHIPPING_COST exists
        cursor.execute('''
            SELECT config_key FROM app_config WHERE config_key = 'SHIPPING_COST'
        ''')
        
        if not cursor.fetchone():
            cursor.execute('''
                INSERT INTO app_config (config_key, config_value, description)
                VALUES (?, ?, ?)
            ''', ('SHIPPING_COST', '5.00', 'Flat rate shipping cost for online orders'))
            conn.commit()
            message = 'Shipping cost initialized to $5.00'
        else:
            message = 'Shipping cost already exists'
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': message
        })
        
    except Exception as e:
        app.logger.error(f"Error initializing shipping config: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/catalog/grouped-by-release', methods=['GET'])
def get_catalog_grouped_by_release():
    """Group records by unique release (artist + title) and show all condition copies"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get all active records (status 1 or 2) with their condition and price
    cursor.execute('''
        SELECT 
            r.id,
            r.artist,
            r.title,
            r.genre_id,
            g.genre_name,
            r.image_url,
            r.catalog_number,
            r.condition,
            r.store_price,
            r.barcode,
            r.consignor_id,
            r.status_id,
            r.created_at,
            u.username as consignor_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN users u ON r.consignor_id = u.id
        WHERE r.status_id IN (1, 2)  -- Active and Available
        AND r.artist IS NOT NULL AND r.title IS NOT NULL
        AND r.artist != '' AND r.title != ''
        ORDER BY r.artist, r.title, 
                 CASE r.condition
                     WHEN 'Mint (M)' THEN 1
                     WHEN 'Near Mint (NM or M-)' THEN 2
                     WHEN 'Very Good Plus (VG+)' THEN 3
                     WHEN 'Very Good (VG)' THEN 4
                     WHEN 'Good Plus (G+)' THEN 5
                     WHEN 'Good (G)' THEN 6
                     WHEN 'Fair (F)' THEN 7
                     WHEN 'Poor (P)' THEN 8
                     ELSE 9
                 END,
                 r.store_price DESC
    ''')
    
    records = cursor.fetchall()
    conn.close()
    
    # Group by artist + title (case-insensitive, trimmed)
    groups = {}
    condition_order = {
        'Mint (M)': 1,
        'Near Mint (NM or M-)': 2,
        'Very Good Plus (VG+)': 3,
        'Very Good (VG)': 4,
        'Good Plus (G+)': 5,
        'Good (G)': 6,
        'Fair (F)': 7,
        'Poor (P)': 8
    }
    
    for record in records:
        # Create unique key from artist and title
        artist = record['artist'].strip()
        title = record['title'].strip()
        key = f"{artist.lower()}|{title.lower()}"
        
        if key not in groups:
            # This is the first copy we've seen of this release
            groups[key] = {
                'artist': artist,
                'title': title,
                'genre_id': record['genre_id'],
                'genre_name': record['genre_name'],
                'image_url': record['image_url'],
                'catalog_number': record['catalog_number'],
                'total_copies': 0,
                'price_range': {'min': float('inf'), 'max': 0},
                'copies': []
            }
        
        # Add this copy to the group
        copy_data = {
            'id': record['id'],
            'condition': record['condition'],
            'condition_rank': condition_order.get(record['condition'], 99),
            'store_price': float(record['store_price']) if record['store_price'] else 0,
            'barcode': record['barcode'],
            'consignor_id': record['consignor_id'],
            'consignor_name': record['consignor_name'],
            'status_id': record['status_id']
        }
        
        groups[key]['copies'].append(copy_data)
        groups[key]['total_copies'] += 1
        
        # Update price range
        price = copy_data['store_price']
        if price > 0:
            groups[key]['price_range']['min'] = min(groups[key]['price_range']['min'], price)
            groups[key]['price_range']['max'] = max(groups[key]['price_range']['max'], price)
    
    # Clean up price ranges for groups with no prices
    for key in groups:
        if groups[key]['price_range']['min'] == float('inf'):
            groups[key]['price_range'] = {'min': 0, 'max': 0}
    
    # Convert to list and sort by artist
    groups_list = list(groups.values())
    groups_list.sort(key=lambda x: (x['artist'].lower(), x['title'].lower()))
    
    return jsonify({
        'status': 'success',
        'total_unique_releases': len(groups_list),
        'total_copies': sum(g['total_copies'] for g in groups_list),
        'groups': groups_list
    })

@app.route('/records', methods=['GET'])
def get_records():
    conn = get_db()
    cursor = conn.cursor()
    
    random_order = request.args.get('random', 'false').lower() == 'true'
    limit = request.args.get('limit', type=int)
    has_youtube = request.args.get('has_youtube', 'false').lower() == 'true'
    
    query = '''
        SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
               s.status_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        WHERE r.artist IS NOT NULL AND r.title IS NOT NULL
        AND r.artist != '' AND r.title != ''
    '''
    
    if has_youtube:
        query += '''
            AND (r.youtube_url LIKE '%youtube.com%' OR
                 r.youtube_url LIKE '%youtu.be%')
        '''
    
    if random_order:
        query += ' ORDER BY RANDOM()'
    else:
        query += ' ORDER BY r.id DESC'
    
    if limit:
        query += f' LIMIT {limit}'
    
    cursor.execute(query)
    records = cursor.fetchall()
    conn.close()
    
    records_list = [dict(record) for record in records]
    
    return jsonify({
        'status': 'success',
        'count': len(records_list),
        'records': records_list
    })

@app.route('/records/<int:record_id>', methods=['GET'])
def get_record(record_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
               s.status_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        WHERE r.id = ?
    ''', (record_id,))

    record = cursor.fetchone()
    conn.close()

    if not record:
        return jsonify({'status': 'error', 'error': 'Record not found'}), 404

    return jsonify(dict(record))

@app.route('/records/<int:record_id>', methods=['PUT'])
def update_record(record_id):
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM records WHERE id = ?', (record_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Record not found'}), 404

    update_fields = []
    update_values = []

    field_mapping = {
        'artist': 'artist',
        'title': 'title',
        'barcode': 'barcode',
        'genre_id': 'genre_id',
        'image_url': 'image_url',
        'catalog_number': 'catalog_number',
        'condition': 'condition',
        'store_price': 'store_price',
        'youtube_url': 'youtube_url',
        'consignor_id': 'consignor_id',
        'commission_rate': 'commission_rate',
        'up_votes': 'up_votes',
        'down_votes': 'down_votes',
        'kill_votes': 'kill_votes',
        'status_id': 'status_id',
        'date_sold': 'date_sold',
        'date_paid': 'date_paid'
    }

    for key, value in data.items():
        if key in field_mapping:
            update_fields.append(f"{field_mapping[key]} = ?")
            update_values.append(value)

    if not update_fields:
        conn.close()
        return jsonify({'status': 'error', 'error': 'No valid fields to update'}), 400

    update_values.append(record_id)
    update_query = f"UPDATE records SET {', '.join(update_fields)} WHERE id = ?"

    cursor.execute(update_query, update_values)
    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'message': 'Record updated'})

@app.route('/records/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('DELETE FROM records WHERE id = ?', (record_id,))
    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'message': 'Record deleted'})

@app.route('/records/barcode/<barcode>', methods=['GET'])
def get_record_by_barcode(barcode):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
               s.status_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        WHERE r.barcode = ?
    ''', (barcode,))

    record = cursor.fetchone()
    conn.close()

    if not record:
        return jsonify({'status': 'error', 'error': 'Record not found'}), 404

    return jsonify(dict(record))

@app.route('/records/search', methods=['GET'])
def search_records():
    """Search records by barcode, title, artist, or catalog number"""
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'status': 'error', 'error': 'Search query required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        search_term = f'%{query}%'
        cursor.execute('''
            SELECT r.*, g.genre_name, s.status_name 
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            WHERE r.barcode LIKE ? 
               OR r.title LIKE ? 
               OR r.artist LIKE ? 
               OR r.catalog_number LIKE ?
            ORDER BY r.created_at DESC
        ''', (search_term, search_term, search_term, search_term))
        
        records = cursor.fetchall()
        records_list = [dict(record) for record in records]
        
        response = jsonify({
            'status': 'success',
            'records': records_list,
            'count': len(records_list)
        })
        
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        
        return response
        
    except Exception as e:
        error_msg = f"Search error: {str(e)}"
        
        response = jsonify({
            'status': 'error',
            'error': error_msg
        })
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 500
    finally:
        conn.close()

@app.route('/api/square/refund', methods=['POST', 'OPTIONS'])
def square_refund():
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response
    
    try:
        data = request.json
        payment_id = data.get('payment_id')
        amount = data.get('amount')
        reason = data.get('reason', 'Customer request')
        device_id = data.get('device_id')
        items = data.get('items', [])
        
        if not payment_id or not amount:
            return jsonify({'status': 'error', 'error': 'Missing payment_id or amount'}), 400
        
        app.logger.info(f"Processing refund for payment_id: {payment_id}")
        
        # Check if this is a local receipt ID (starts with SQUARE-)
        if payment_id.startswith('SQUARE-'):
            # Try to find the real payment_id from square_payment_sessions
            # This would require storing a mapping between receipt_id and payment_id
            app.logger.error(f"Cannot refund local receipt ID: {payment_id}. Need actual Square payment_id.")
            return jsonify({
                'status': 'error', 
                'error': 'Please use the actual Square payment ID, not the receipt ID. This refund must be processed through the Square Dashboard.'
            }), 400
        
        # Convert amount to cents for Square
        amount_cents = int(round(amount * 100))
        
        # Get access token
        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        if not access_token:
            return jsonify({
                'status': 'error',
                'error': 'SQUARE_ACCESS_TOKEN not configured'
            }), 500
        
        # Determine environment
        environment = os.environ.get('SQUARE_ENVIRONMENT', 'sandbox')
        base_url = 'https://connect.squareup.com' if environment == 'production' else 'https://connect.squareupsandbox.com'
        
        # Create idempotency key to prevent duplicate refunds
        idempotency_key = str(uuid.uuid4())
        
        # Prepare refund request
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        refund_data = {
            "idempotency_key": idempotency_key,
            "payment_id": payment_id,
            "amount_money": {
                "amount": amount_cents,
                "currency": "USD"
            },
            "reason": reason
        }
        
        # If device_id is provided, include it
        if device_id:
            refund_data["device_details"] = {
                "device_id": device_id
            }
        
        app.logger.info(f"Sending refund request to Square: {refund_data}")
        
        # Make the API call to Square
        response = requests.post(
            f'{base_url}/v2/refunds',
            headers=headers,
            json=refund_data
        )
        
        if response.status_code != 200:
            error_text = response.text[:500]
            app.logger.error(f"Square refund API error: {error_text}")
            
            # Try to parse the error
            try:
                error_json = response.json()
                if 'errors' in error_json:
                    error_messages = [e.get('detail', 'Unknown error') for e in error_json['errors']]
                    return jsonify({
                        'status': 'error',
                        'error': f"Square API error: {', '.join(error_messages)}"
                    }), response.status_code
            except:
                pass
                
            return jsonify({
                'status': 'error',
                'error': f"Square API error: {error_text}"
            }), response.status_code
        
        result = response.json()
        
        # Check if there were errors in the response
        if 'errors' in result:
            errors = result['errors']
            error_messages = [e.get('detail', 'Unknown error') for e in errors]
            return jsonify({
                'status': 'error',
                'error': ', '.join(error_messages)
            }), 400
        
        # Refund successful
        refund = result.get('refund', {})
        
        app.logger.info(f"Square refund successful: {refund.get('id')}")
        
        return jsonify({
            'status': 'success',
            'refund_id': refund.get('id'),
            'square_refund_id': refund.get('id'),
            'amount': amount,
            'status': refund.get('status'),
            'created_at': refund.get('created_at')
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error processing refund: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500
 
     

@app.route('/records/random', methods=['GET'])
def get_random_records():
    """Get random records with configurable limit"""
    limit = request.args.get('limit', default=500, type=int)
    has_youtube = request.args.get('has_youtube', default=None, type=str)

    conn = get_db()
    cursor = conn.cursor()

    query = '''
        SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
               s.status_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        WHERE r.artist IS NOT NULL AND r.title IS NOT NULL
        AND r.artist != '' AND r.title != ''
    '''

    params = []

    if has_youtube and has_youtube.lower() == 'true':
        query += '''
            AND (r.youtube_url LIKE '%youtube.com%' OR
                 r.youtube_url LIKE '%youtu.be%')
        '''

    query += ' ORDER BY RANDOM() LIMIT ?'
    params.append(limit)

    cursor.execute(query, params)
    records = cursor.fetchall()
    conn.close()

    records_list = [dict(record) for record in records]

    return jsonify({
        'status': 'success',
        'count': len(records_list),
        'limit': limit,
        'has_youtube_filter': has_youtube,
        'records': records_list
    })

@app.route('/records/count', methods=['GET'])
def get_records_count():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) as count FROM records')
    result = cursor.fetchone()
    conn.close()
    return jsonify({'status': 'success', 'count': result['count']})

@app.route('/records/by-ids', methods=['POST'])
def get_records_by_ids():
    data = request.get_json()
    if not data or 'record_ids' not in data:
        return jsonify({'status': 'error', 'error': 'record_ids required'}), 400

    record_ids = data['record_ids']
    if not isinstance(record_ids, list):
        return jsonify({'status': 'error', 'error': 'record_ids must be a list'}), 400

    placeholders = ','.join('?' for _ in record_ids)

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(f'''
        SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
               s.status_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        WHERE r.id IN ({placeholders})
        ORDER BY r.artist, r.title
    ''', record_ids)

    records = cursor.fetchall()
    conn.close()

    records_list = [dict(record) for record in records]
    return jsonify({'status': 'success', 'records': records_list})

@app.route('/records/update-status', methods=['POST'])
def update_records_status():
    """Update status for multiple records"""
    data = request.get_json()
    if not data or 'record_ids' not in data or 'status_id' not in data:
        return jsonify({'status': 'error', 'error': 'record_ids and status_id required'}), 400

    record_ids = data['record_ids']
    status_id = data['status_id']

    if not isinstance(record_ids, list):
        return jsonify({'status': 'error', 'error': 'record_ids must be a list'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM d_status WHERE id = ?', (status_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Invalid status ID'}), 400

    placeholders = ','.join('?' for _ in record_ids)

    cursor.execute(f'''
        UPDATE records
        SET status_id = ?
        WHERE id IN ({placeholders})
    ''', [status_id] + record_ids)

    updated_count = cursor.rowcount
    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': f'Updated status for {updated_count} records',
        'updated_count': updated_count,
        'status_id': status_id
    })

@app.route('/records/user/<int:user_id>', methods=['GET'])
def get_user_records(user_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
               s.status_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        WHERE r.consignor_id = ?
        ORDER BY r.artist, r.title
    ''', (user_id,))

    records = cursor.fetchall()
    conn.close()

    records_list = [dict(record) for record in records]
    return jsonify({'status': 'success', 'records': records_list})

@app.route('/records/no-barcodes', methods=['GET'])
def get_records_without_barcodes():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
               s.status_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        WHERE r.barcode IS NULL OR r.barcode = '' OR r.barcode = 'None'
        ORDER BY r.artist, r.title
    ''')

    records = cursor.fetchall()
    conn.close()

    records_list = [dict(record) for record in records]
    return jsonify({'status': 'success', 'records': records_list})

@app.route('/records/status/<int:status_id>', methods=['GET'])
def get_records_by_status(status_id):
    """Get records by status ID"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM d_status WHERE id = ?', (status_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Invalid status ID'}), 400

    cursor.execute('''
        SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
               s.status_name, u.username as consignor_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN users u ON r.consignor_id = u.id
        WHERE r.status_id = ?
        ORDER BY r.artist, r.title
    ''', (status_id,))

    records = cursor.fetchall()
    conn.close()

    records_list = [dict(record) for record in records]
    return jsonify({
        'status': 'success',
        'count': len(records_list),
        'status_id': status_id,
        'records': records_list
    })

# ==================== GENRES ENDPOINTS ====================

@app.route('/genres', methods=['GET'])
def get_genres():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, genre_name
        FROM genres
        ORDER BY id
    ''')

    genres = cursor.fetchall()
    conn.close()

    genres_list = []
    for genre in genres:
        genres_list.append({
            'id': genre['id'],
            'genre_name': genre['genre_name']
        })

    return jsonify({
        'status': 'success',
        'count': len(genres_list),
        'genres': genres_list
    })

@app.route('/genres', methods=['POST'])
def create_genre():
    data = request.get_json()
    if not data or 'genre_name' not in data:
        return jsonify({'status': 'error', 'error': 'genre_name required'}), 400

    genre_name = data['genre_name']

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM genres WHERE genre_name = ?', (genre_name,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Genre already exists'}), 400

    cursor.execute('INSERT INTO genres (genre_name) VALUES (?)', (genre_name,))
    genre_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'genre_id': genre_id})

@app.route('/genres/by-name/<genre_name>', methods=['GET'])
def get_genre_by_name(genre_name):
    """Get genre ID by genre name"""
    conn = get_db()
    cursor = conn.cursor()

    decoded_genre_name = urllib.parse.unquote(genre_name)

    cursor.execute('''
        SELECT id, genre_name
        FROM genres
        WHERE genre_name = ?
    ''', (decoded_genre_name,))

    genre = cursor.fetchone()

    if not genre:
        cursor.execute('''
            SELECT id, genre_name
            FROM genres
            WHERE LOWER(genre_name) = LOWER(?)
        ''', (decoded_genre_name,))
        genre = cursor.fetchone()

    conn.close()

    if genre:
        return jsonify({
            'status': 'success',
            'genre_id': genre['id'],
            'genre_name': genre['genre_name']
        })
    else:
        return jsonify({
            'status': 'error',
            'error': f'Genre "{decoded_genre_name}" not found'
        }), 404

# ==================== CONFIG ENDPOINTS ====================

@app.route('/config', methods=['GET'])
def get_all_config():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT config_key, config_value, description FROM app_config ORDER BY config_key')
    configs = cursor.fetchall()
    conn.close()

    config_dict = {}
    for row in configs:
        config_dict[row['config_key']] = {
            'value': row['config_value'],
            'description': row['description']
        }

    return jsonify({'status': 'success', 'configs': config_dict})

@app.route('/config/<config_key>', methods=['GET'])
def get_config(config_key):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT config_value FROM app_config WHERE config_key = ?', (config_key,))
    result = cursor.fetchone()
    conn.close()

    if result:
        return jsonify({'status': 'success', 'config_value': result['config_value']})
    else:
        return jsonify({'status': 'success', 'config_value': None})

@app.route('/config/<config_key>', methods=['PUT'])
def update_config(config_key):
    data = request.get_json()
    if not data or 'config_value' not in data:
        return jsonify({'status': 'error', 'error': 'config_value required'}), 400

    config_value = data['config_value']

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT config_key FROM app_config WHERE config_key = ?', (config_key,))
    existing = cursor.fetchone()

    if existing:
        cursor.execute('UPDATE app_config SET config_value = ? WHERE config_key = ?', (config_value, config_key))
    else:
        cursor.execute('INSERT INTO app_config (config_key, config_value) VALUES (?, ?)', (config_key, config_value))

    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'message': 'Config updated'})

# ==================== STATUS ENDPOINTS ====================

@app.route('/statuses', methods=['GET'])
def get_statuses():
    """Get all available statuses"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, status_name, description
        FROM d_status
        ORDER BY id
    ''')

    statuses = cursor.fetchall()
    conn.close()

    statuses_list = [dict(status) for status in statuses]
    return jsonify({
        'status': 'success',
        'count': len(statuses_list),
        'statuses': statuses_list
    })

# ==================== CONSIGNMENT ENDPOINTS ====================

@app.route('/api/consignor/records', methods=['GET'])
@role_required(['consignor', 'admin'])
def get_consignor_records():
    """Get records for the logged-in consignor (or all for admin)"""
    conn = get_db()
    cursor = conn.cursor()

    if session.get('role') == 'admin':
        cursor.execute('''
            SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
                   s.status_name, u.username as consignor_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            WHERE r.consignor_id IS NOT NULL
            ORDER BY r.created_at DESC
        ''')
    else:
        cursor.execute('''
            SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
                   s.status_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            WHERE r.consignor_id = ?
            ORDER BY r.created_at DESC
        ''', (session['user_id'],))

    records = cursor.fetchall()
    conn.close()

    records_list = [dict(record) for record in records]
    return jsonify({
        'status': 'success',
        'count': len(records_list),
        'records': records_list
    })

@app.route('/api/consignor/add-record', methods=['POST'])
@role_required(['consignor', 'admin'])
def add_consignor_record():
    """Add a new record for consignment"""
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400

    required_fields = ['artist', 'title', 'store_price']
    for field in required_fields:
        if field not in data:
            return jsonify({'status': 'error', 'error': f'{field} required'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'COMMISSION_DEFAULT_RATE'")
    commission_result = cursor.fetchone()
    commission_rate = float(commission_result['config_value']) if commission_result else 0.20

    cursor.execute('''
        INSERT INTO records (
            artist, title, barcode, genre_id, image_url,
            catalog_number, condition, store_price,
            youtube_url, consignor_id, commission_rate,
            status_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ''', (
        data.get('artist'),
        data.get('title'),
        data.get('barcode', ''),
        data.get('genre_id'),
        data.get('image_url', ''),
        data.get('catalog_number', ''),
        data.get('condition', '4'),
        float(data.get('store_price')),
        data.get('youtube_url', ''),
        session['user_id'],
        commission_rate,
        1
    ))

    record_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': 'Record added for consignment',
        'record_id': record_id,
        'commission_rate': commission_rate
    })

@app.route('/consignment/records', methods=['GET'])
def get_consignment_records():
    """Get consignment records with status information"""
    user_id = request.args.get('user_id')

    conn = get_db()
    cursor = conn.cursor()

    if user_id:
        cursor.execute('''
            SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
                   s.status_name, u.username as consignor_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            WHERE r.consignor_id = ?
            ORDER BY
                CASE r.status_id
                    WHEN 1 THEN 1
                    WHEN 2 THEN 2
                    WHEN 3 THEN 3
                    WHEN 4 THEN 4
                    ELSE 5
                END,
                r.artist, r.title
        ''', (user_id,))
    else:
        cursor.execute('''
            SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
                   s.status_name, u.username as consignor_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            WHERE r.consignor_id IS NOT NULL
            ORDER BY
                CASE r.status_id
                    WHEN 1 THEN 1
                    WHEN 2 THEN 2
                    WHEN 3 THEN 3
                    WHEN 4 THEN 4
                    ELSE 5
                END,
                r.consignor_id, r.artist, r.title
        ''')

    records = cursor.fetchall()
    conn.close()

    records_list = [dict(record) for record in records]

    for record in records_list:
        barcode = record.get('barcode')
        status_id = record.get('status_id')

        if status_id == 1:
            if not barcode or barcode in [None, '', 'None']:
                record['display_status'] = '🆕 New'
            else:
                record['display_status'] = '✅ Active'
        elif status_id == 2:
            record['display_status'] = '✅ Active'
        elif status_id == 3:
            record['display_status'] = '💰 Sold'
        elif status_id == 4:
            record['display_status'] = '🗑️ Removed'
        else:
            record['display_status'] = '❓ Unknown'

    return jsonify({
        'status': 'success',
        'count': len(records_list),
        'records': records_list
    })

@app.route('/consignment/dropoff-ready', methods=['GET'])
def get_dropoff_records():
    user_id = request.args.get('user_id')

    conn = get_db()
    cursor = conn.cursor()

    if user_id:
        cursor.execute('''
            SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
                   s.status_name, u.username as consignor_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            WHERE r.consignor_id = ?
            AND (r.barcode IS NULL OR r.barcode = '' OR r.barcode = 'None')
            AND r.status_id IN (1, 2)
            ORDER BY r.created_at DESC
        ''', (user_id,))
    else:
        cursor.execute('''
            SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
                   s.status_name, u.username as consignor_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            WHERE r.consignor_id IS NOT NULL
            AND (r.barcode IS NULL OR r.barcode = '' OR r.barcode = 'None')
            AND r.status_id IN (1, 2)
            ORDER BY r.consignor_id, r.created_at DESC
        ''')

    records = cursor.fetchall()
    conn.close()

    records_list = [dict(record) for record in records]
    return jsonify({'status': 'success', 'records': records_list})

# ==================== CATALOG ENDPOINTS ====================

@app.route('/catalog/grouped-records', methods=['GET'])
def get_catalog_grouped_records():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'CATALOG_PRICE_WEIGHTING'")
    weighting_result = cursor.fetchone()

    price_weighting = 0.3
    if weighting_result:
        try:
            price_weighting = float(weighting_result[0])
            price_weighting = max(0.0, min(1.0, price_weighting))
        except (ValueError, TypeError):
            price_weighting = 0.3

    cursor.execute('''
        SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
               s.status_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        WHERE r.artist IS NOT NULL AND r.title IS NOT NULL
        AND r.artist != '' AND r.title != ''
        AND r.store_price IS NOT NULL
        AND r.status_id IN (1, 2)
    ''')

    records = cursor.fetchall()
    conn.close()

    records_list = []
    for record in records:
        record_dict = dict(record)
        if 'store_price' in record_dict:
            try:
                record_dict['store_price'] = float(record_dict['store_price'])
            except (ValueError, TypeError):
                record_dict['store_price'] = 0
        records_list.append(record_dict)

    valid_price_records = [r for r in records_list if isinstance(r.get('store_price'), (int, float))]
    no_price_records = [r for r in records_list if not isinstance(r.get('store_price'), (int, float))]

    if not valid_price_records:
        random.shuffle(records_list)
        return jsonify({
            'status': 'success',
            'count': len(records_list),
            'groups': [{
                'label': 'All Records',
                'min': None,
                'max': None,
                'records': records_list
            }]
        })

    max_price = max(r['store_price'] for r in valid_price_records)
    min_price = min(r['store_price'] for r in valid_price_records)

    scored_records = []
    for record in valid_price_records:
        price = record['store_price']

        price_range = max_price - min_price
        if price_range > 0:
            normalized_price = (price - min_price) / price_range
        else:
            normalized_price = 0.5

        random_factor = random.random()

        score = (price_weighting * normalized_price) + ((1 - price_weighting) * random_factor)

        scored_records.append({
            'record': record,
            'score': score,
            'price': price,
            'normalized_price': normalized_price,
            'random_factor': random_factor
        })

    scored_records.sort(key=lambda x: x['score'], reverse=True)

    sorted_records = [item['record'] for item in scored_records]
    all_records = sorted_records + no_price_records

    result_group = {
        'label': '',
        'min': min_price,
        'max': max_price,
        'price_weighting': price_weighting,
        'records': all_records
    }

    return jsonify({
        'status': 'success',
        'count': len(records_list),
        'price_weighting': price_weighting,
        'min_price': min_price,
        'max_price': max_price,
        'groups': [result_group]
    })

# ==================== DISCOGS ENDPOINTS ====================

@app.route('/api/discogs/search', methods=['GET'])
def api_discogs_search():
    """Search Discogs API through backend"""
    search_term = request.args.get('q', '')
    
    if not search_term:
        return jsonify({'status': 'error', 'error': 'Search term required'}), 400
    
    try:
        discogs_token = os.environ.get('DISCOGS_USER_TOKEN')
        
        if not discogs_token:
            return jsonify({
                'status': 'error',
                'error': 'Discogs API token not configured',
                'mock_data': True
            }), 503
        
        from discogs_handler import DiscogsHandler
        discogs_handler = DiscogsHandler(discogs_token)
        
        results = discogs_handler.get_simple_search_results(search_term)
        
        formatted_results = []
        for item in results:
            formatted_results.append({
                'id': f"discogs_{item.get('discogs_id', '')}",
                'artist': item.get('artist', ''),
                'title': item.get('title', ''),
                'year': item.get('year', ''),
                'genre': item.get('genre', ''),
                'format': item.get('format', ''),
                'country': item.get('country', ''),
                'image_url': item.get('image_url', ''),
                'catalog_number': item.get('catalog_number', ''),
                'discogs_id': item.get('discogs_id'),
                'barcode': item.get('barcode', '') if 'barcode' in item else ''
            })
        
        return jsonify({
            'status': 'success',
            'results': formatted_results
        })
        
    except Exception as e:
        app.logger.error(f"Discogs search error: {str(e)}")
        
        mock_data = [
            {
                'id': 'discogs_mock_1',
                'artist': search_term.split()[0] if search_term else 'Artist',
                'title': f'Demo Album for "{search_term[:20]}"',
                'year': '2023',
                'genre': 'Rock',
                'format': 'Vinyl, LP',
                'country': 'US',
                'image_url': '',
                'catalog_number': 'DEMO001',
                'discogs_id': 'mock_001',
                'barcode': '123456789012'
            }
        ]
        
        return jsonify({
            'status': 'success',
            'results': mock_data,
            'mock_data': True,
            'note': 'Using mock data due to API error'
        })

# ==================== DISCOGS GENRE MAPPINGS ENDPOINTS ====================

@app.route('/discogs-genre-mappings', methods=['POST'])
def save_discogs_genre_mapping():
    data = request.get_json()

    if not data or 'discogs_genre' not in data or 'local_genre_id' not in data:
        return jsonify({'status': 'error', 'message': 'Missing discogs_genre or local_genre_id'}), 400

    discogs_genre = data['discogs_genre']
    local_genre_id = data['local_genre_id']

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT genre_name FROM genres WHERE id = ?', (local_genre_id,))
    genre_result = cursor.fetchone()

    if not genre_result:
        conn.close()
        return jsonify({'status': 'error', 'message': f'Genre ID {local_genre_id} not found'}), 404

    local_genre_name = genre_result['genre_name']

    cursor.execute('SELECT id FROM discogs_genre_mappings WHERE discogs_genre = ?', (discogs_genre,))
    existing = cursor.fetchone()

    if existing:
        cursor.execute('''
            UPDATE discogs_genre_mappings
            SET local_genre_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE discogs_genre = ?
        ''', (local_genre_id, discogs_genre))
        mapping_id = existing['id']
        message = 'updated'
    else:
        cursor.execute('''
            INSERT INTO discogs_genre_mappings (discogs_genre, local_genre_id)
            VALUES (?, ?)
        ''', (discogs_genre, local_genre_id))
        mapping_id = cursor.lastrowid
        message = 'created'

    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': f'Mapping {message}',
        'mapping': {
            'id': mapping_id,
            'discogs_genre': discogs_genre,
            'local_genre_id': local_genre_id,
            'local_genre_name': local_genre_name
        }
    }), 200

@app.route('/discogs-genre-mappings/<discogs_genre>', methods=['GET'])
def get_discogs_genre_mapping(discogs_genre):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        """SELECT dgm.*, g.genre_name as local_genre_name
           FROM discogs_genre_mappings dgm
           LEFT JOIN genres g ON dgm.local_genre_id = g.id
           WHERE dgm.discogs_genre = ?
           ORDER BY dgm.updated_at DESC, dgm.id DESC
           LIMIT 1""",
        (discogs_genre,)
    )
    mapping = cursor.fetchone()

    conn.close()

    if mapping:
        return jsonify({
            'mapping': dict(mapping),
            'status': 'success'
        })
    else:
        return jsonify({
            'mapping': None,
            'status': 'success'
        })

@app.route('/discogs-genre-mappings', methods=['GET'])
def get_all_discogs_genre_mappings():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT dgm.*, g.genre_name as local_genre_name
        FROM discogs_genre_mappings dgm
        LEFT JOIN genres g ON dgm.local_genre_id = g.id
        ORDER BY dgm.discogs_genre
    ''')

    mappings = cursor.fetchall()
    conn.close()

    mappings_list = [dict(mapping) for mapping in mappings]
    return jsonify({
        'status': 'success',
        'count': len(mappings_list),
        'mappings': mappings_list
    })

# ==================== ARTISTS ENDPOINTS ====================

@app.route('/artists/with-genres', methods=['GET'])
def get_artists_with_genres():
    search_term = request.args.get('search', '')

    conn = get_db()
    cursor = conn.cursor()

    if search_term:
        cursor.execute('''
            SELECT DISTINCT r.artist as artist_name, COALESCE(g.genre_name, 'Unknown') as genre_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            WHERE r.artist LIKE ?
            ORDER BY r.artist
        ''', (f'%{search_term}%',))
    else:
        cursor.execute('''
            SELECT DISTINCT r.artist as artist_name, COALESCE(g.genre_name, 'Unknown') as genre_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            ORDER BY r.artist
        ''')

    artists = cursor.fetchall()
    conn.close()

    artists_list = [dict(artist) for artist in artists]
    return jsonify({'status': 'success', 'artists': artists_list})

# ==================== COMMISSION RATE ENDPOINT ====================

@app.route('/api/commission-rate', methods=['GET'])
def get_commission_rate():
    """Calculate current consignment commission rate"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT config_key, config_value
        FROM app_config
        WHERE config_key IN ('STORE_CAPACITY', 'COMMISSION_MAX_CAPACITY',
                            'COMMISSION_MIN_CAPACITY', 'COMMISSION_MAX_RATE',
                            'COMMISSION_MIN_RATE')
    """)

    config = {}
    for row in cursor.fetchall():
        config[row[0]] = float(row[1])

    cursor.execute("SELECT COUNT(*) FROM records WHERE status_id IN (1, 2)")
    total_inventory = cursor.fetchone()[0]

    conn.close()

    fill_percentage = (total_inventory / config['STORE_CAPACITY']) * 100

    if fill_percentage <= config['COMMISSION_MIN_CAPACITY']:
        rate = config['COMMISSION_MIN_RATE']
    elif fill_percentage >= config['COMMISSION_MAX_CAPACITY']:
        rate = config['COMMISSION_MAX_RATE']
    else:
        ratio = (fill_percentage - config['COMMISSION_MIN_CAPACITY']) / \
                (config['COMMISSION_MAX_CAPACITY'] - config['COMMISSION_MIN_CAPACITY'])
        rate = config['COMMISSION_MIN_RATE'] + (config['COMMISSION_MAX_RATE'] - config['COMMISSION_MIN_RATE']) * ratio

    return jsonify({
        'commission_rate': round(rate, 1),
        'commission_rate_percent': f"{round(rate, 1)}%",
        'store_fill_percentage': round(fill_percentage, 1),
        'total_inventory': total_inventory,
        'store_capacity': config['STORE_CAPACITY']
    })

# ==================== BARCODE ASSIGNMENT ENDPOINT ====================

@app.route('/barcodes/assign', methods=['POST'])
def assign_barcodes():
    data = request.get_json()
    if not data or 'record_ids' not in data:
        return jsonify({'status': 'error', 'error': 'record_ids required'}), 400

    record_ids = data['record_ids']
    if not isinstance(record_ids, list):
        return jsonify({'status': 'error', 'error': 'record_ids must be a list'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT MAX(CAST(barcode AS INTEGER)) as max_barcode FROM records WHERE barcode GLOB "[0-9]*"')
    result = cursor.fetchone()
    start_num = int(result['max_barcode']) + 1 if result['max_barcode'] else 1000

    barcode_mapping = {}
    for i, record_id in enumerate(record_ids):
        barcode = str(start_num + i)
        cursor.execute('UPDATE records SET barcode = ?, status_id = 2 WHERE id = ?', (barcode, record_id))
        barcode_mapping[str(record_id)] = barcode

    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'barcode_mapping': barcode_mapping})

# ==================== CHECKOUT PAYMENT ENDPOINT ====================
@app.route('/api/square/generate-device-code', methods=['POST'])
def generate_square_device_code():
    """Generate a device code for Terminal API mode - NO AUTH REQUIRED FOR TESTING"""
    try:
        # Get location_id from request or use env
        data = request.get_json() or {}
        location_id = data.get('location_id') or os.environ.get('SQUARE_LOCATION_ID')
        
        if not location_id:
            return jsonify({
                'status': 'error',
                'message': 'Location ID is required. Set SQUARE_LOCATION_ID in .env or provide in request body'
            }), 400
        
        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        if not access_token:
            return jsonify({
                'status': 'error',
                'message': 'SQUARE_ACCESS_TOKEN not set in environment'
            }), 400
        
        # Generate unique idempotency key
        idempotency_key = str(uuid.uuid4())
        
        # Prepare request to Square API
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        # CRITICAL: product_type MUST be "TERMINAL_API" for API mode
        code_data = {
            "idempotency_key": idempotency_key,
            "device_code": {
                "product_type": "TERMINAL_API",
                "location_id": location_id,
                "name": data.get('name', 'PigStyle Terminal')
            }
        }
        
        # Make the API call to Square
        response = requests.post(
            'https://connect.squareup.com/v2/devices/codes',
            headers=headers,
            json=code_data
        )
        
        if response.status_code != 200:
            app.logger.error(f"Square API error: {response.text}")
            return jsonify({
                'status': 'error',
                'message': f"Square API error: {response.text[:200]}"
            }), response.status_code
        
        result = response.json()
        device_code = result.get('device_code', {})
        
        # Format the response for easy display
        return jsonify({
            'status': 'success',
            'device_code': {
                'code': device_code.get('code'),
                'id': device_code.get('id'),
                'expires_at': device_code.get('expires_at'),
                'location_id': device_code.get('location_id'),
                'name': device_code.get('name'),
                'product_type': device_code.get('product_type'),
                'status': device_code.get('status')
            },
            'message': f"Code generated successfully. Enter '{device_code.get('code')}' on your terminal.",
            'expires_in': '5 minutes',
            'instructions': [
                "1. On your Square Terminal, make sure you're at the 'Sign In' screen",
                "2. Enter the 6-character code shown above",
                "3. The terminal will switch to Terminal API mode (black screen with 'Powered by Square')",
                "4. The code expires in 5 minutes - enter it quickly!"
            ]
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error generating device code: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@app.route('/checkout/process-payment', methods=['POST'])
def process_checkout_payment():
    data = request.get_json()
    if not data or 'record_ids' not in data:
        return jsonify({'status': 'error', 'error': 'record_ids required'}), 400

    record_ids = data['record_ids']
    if not isinstance(record_ids, list):
        return jsonify({'status': 'error', 'error': 'record_ids must be a list'}), 400

    conn = get_db()
    cursor = conn.cursor()

    total_payout = 0.0
    user_payouts = {}
    today = datetime.now().date().isoformat()
    payment_type = data.get('payment_type', 'paid')

    for record_id in record_ids:
        cursor.execute('''
            SELECT id, store_price, consignor_id, commission_rate
            FROM records WHERE id = ?
        ''', (record_id,))

        record = cursor.fetchone()
        if not record:
            continue

        store_price = float(record['store_price']) 
        consignor_id = record['consignor_id']
        commission_rate = float(record['commission_rate'])

        commission = store_price * commission_rate
        payout = store_price - commission

        if consignor_id not in user_payouts:
            user_payouts[consignor_id] = 0.0
        user_payouts[consignor_id] += payout

        total_payout += payout

        cursor.execute('''
            UPDATE records
            SET status_id = 3,
                date_sold = ?,
                date_paid = ?
            WHERE id = ?
        ''', (today, today if payment_type == 'paid' else None, record_id))

    for consignor_id, payout_amount in user_payouts.items():
        cursor.execute('''
            UPDATE users
            SET store_credit_balance = COALESCE(store_credit_balance, 0) + ?
            WHERE id = ?
        ''', (payout_amount, consignor_id))

    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': f'Processed payment for {len(record_ids)} records',
        'total_payout': total_payout,
        'record_ids': record_ids,
        'user_payouts': user_payouts,
        'new_status_id': 3
    })

# ==================== STATS ENDPOINTS ====================

@app.route('/stats', methods=['GET'])
def get_stats():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT COUNT(*) as records_count FROM records')
    records_count = cursor.fetchone()['records_count']

    cursor.execute('SELECT COUNT(*) as users_count FROM users')
    users_count = cursor.fetchone()['users_count']

    cursor.execute('SELECT COUNT(*) as votes_count FROM votes')
    votes_count = cursor.fetchone()['votes_count']

    cursor.execute('SELECT MAX(created_at) as latest_record FROM records')
    latest_record = cursor.fetchone()['latest_record']

    conn.close()

    return jsonify({
        'status': 'success',
        'records_count': records_count,
        'users_count': users_count,
        'votes_count': votes_count,
        'latest_record': latest_record,
        'db_path': 'API-based'
    })

@app.route('/stats/user/<int:user_id>', methods=['GET'])
def get_user_stats(user_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM users WHERE id = ?', (user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'User not found'}), 404

    cursor.execute('SELECT COUNT(*) as records_count FROM records WHERE consignor_id = ?', (user_id,))
    result = cursor.fetchone()
    conn.close()

    return jsonify({
        'status': 'success',
        'records_count': result['records_count'],
        'db_path': 'API-based'
    })

# ==================== HEALTH CHECK ====================

@app.route('/health', methods=['GET'])
def health_check():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT 1')
    cursor.fetchone()
    conn.close()

    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'database': 'connected',
        'service': 'PigStyle API'
    })

# ==================== MAIN ====================

if __name__ == '__main__':
    app.run(debug=True, port=5000)