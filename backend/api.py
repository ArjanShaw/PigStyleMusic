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
from functools import wraps  # ADD THIS LINE
from discogs_handler import DiscogsHandler 
from handlers.price_advise_handler import PriceAdviseHandler



app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'your-secret-key-here-change-this')

# CORS Configuration - UPDATED to support credentials
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
SPOTIFY_CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID', 'your-client-id-here')
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET', 'your-client-secret-here')
SPOTIFY_REDIRECT_URI = '/spotify/callback'

# Add these lines with your other configuration variables
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', 'sk_test_your_key_here')
STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY', 'pk_test_your_key_here')
stripe.api_key = STRIPE_SECRET_KEY


# Token storage and background job storage
user_tokens = {}
background_jobs = {}

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

#===========================================================================

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
        
        # Return the RAW eBay result for debugging
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
        
        # Debug log
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
        
        # Debug log the result structure
        app.logger.info(f"Result keys: {list(result.keys())}")
        app.logger.info(f"eBay listings count: {len(result.get('ebay_listings', []))}")
        
        # Return the FULL result including ebay_listings
        return jsonify({
            'status': 'success' if result['success'] else 'error',
            'success': result['success'],
            'estimated_price': result['estimated_price'],
            'price': result['estimated_price'],  # For compatibility
            'price_source': result.get('price_source', 'unknown'),
            'calculation': result.get('calculation', []),
            'ebay_summary': result.get('ebay_summary', {}),
            'ebay_listings': result.get('ebay_listings', []),  # ← THIS WAS MISSING
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
        
        # Validate required fields
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
        
        # For now, return mock data
        # TODO: Integrate with actual PriceAdviseHandler
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


@app.route('/api/login', methods=['POST', 'OPTIONS'])
def login():
    """Authenticate user and return user data with session"""
    if request.method == 'OPTIONS':
        app.logger.info("OPTIONS preflight request received")
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 200
    
    try:
        app.logger.info(f"=== LOGIN ATTEMPT STARTED ===")
        app.logger.info(f"Origin: {request.headers.get('Origin')}")
        app.logger.info(f"Content-Type: {request.headers.get('Content-Type')}")
        
        data = request.get_json(force=True, silent=True)
        app.logger.info(f"Raw request data: {request.data}")
        app.logger.info(f"Parsed JSON data: {data}")
        
        if data is None:
            app.logger.error("Failed to parse JSON data")
            return jsonify({'status': 'error', 'error': 'Invalid JSON data'}), 400

        if not data:
            app.logger.error("No data provided")
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400

        required_fields = ['username', 'password']
        for field in required_fields:
            if field not in data:
                app.logger.error(f"Missing field: {field}")
                return jsonify({'status': 'error', 'error': f'{field} required'}), 400

        username = data['username']
        password = data['password']
        
        app.logger.info(f"Attempting login for user: {username}")
        app.logger.info(f"Database path: {DB_PATH}")
        app.logger.info(f"Database exists: {os.path.exists(DB_PATH)}")

        conn = get_db()
        cursor = conn.cursor()
        app.logger.info("Database connection established")

        # Get user by username
        cursor.execute('''
            SELECT id, username, email, password_hash, role, full_name, 
                   master_agreement_signed, store_credit_balance
            FROM users 
            WHERE username = ?
        ''', (username,))

        user = cursor.fetchone()
        app.logger.info(f"User query result: {user}")
        
        if not user:
            app.logger.error(f"User not found: {username}")
            conn.close()
            return jsonify({'status': 'error', 'error': 'Invalid username or password'}), 401

        # Verify password
        stored_hash = user['password_hash']
        app.logger.info(f"Stored hash: {stored_hash[:50]}...")
        
        if '$' in stored_hash:
            salt, hash_value = stored_hash.split('$')
            password_hash = hashlib.sha256((salt + password).encode()).hexdigest()
            app.logger.info(f"Computed hash: {password_hash}")
            
            if password_hash != hash_value:
                app.logger.error("Password hash mismatch")
                conn.close()
                return jsonify({'status': 'error', 'error': 'Invalid username or password'}), 401
        else:
            # Handle legacy passwords if any
            app.logger.error(f"Invalid password format for user {username}")
            conn.close()
            return jsonify({'status': 'error', 'error': 'Invalid password format'}), 401

        # Update last login time
        cursor.execute('''
            UPDATE users 
            SET last_login = CURRENT_TIMESTAMP 
            WHERE id = ?
        ''', (user['id'],))
        
        conn.commit()
        conn.close()
        app.logger.info("Database update committed")

        # Create session
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['role'] = user['role']
        session['logged_in'] = True
        
        app.logger.info(f"Session created: user_id={session['user_id']}, username={session['username']}")
        
        # Generate a session ID if needed (Flask doesn't have .sid by default)
        session_id = f"session_{user['id']}_{int(time.time())}"
        
        # Prepare user data for response
        user_data = {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'role': user['role'],
            'full_name': user['full_name'],
            'master_agreement_signed': bool(user['master_agreement_signed']),
            'store_credit_balance': float(user['store_credit_balance']) if user['store_credit_balance'] is not None else 0.0
        }

        app.logger.info(f"Login successful for user: {username}")
        
        response = jsonify({
            'status': 'success',
            'message': 'Login successful',
            'user': user_data,
            'session_id': session_id
        })
        
        # Add CORS headers to the actual response
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        
        return response

    except Exception as e:
        app.logger.error(f"Login error: {str(e)}", exc_info=True)
        import traceback
        app.logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Still return CORS headers even on error
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
    return jsonify({
        'status': 'success',
        'message': 'Logged out successfully'
    })

@app.route('/session/check', methods=['GET'])
def check_session():
    """Check if user is logged in and return session info"""
    if 'user_id' in session and session.get('logged_in'):
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, username, email, role, full_name, 
                   master_agreement_signed, store_credit_balance
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
                'master_agreement_signed': bool(user['master_agreement_signed']),
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

# ==================== PROTECTED ENDPOINTS ====================

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

@app.route('/api/protected/user-info', methods=['GET'])
@login_required
def get_protected_user_info():
    """Example protected endpoint - requires login"""
    return jsonify({
        'status': 'success',
        'message': f'Hello {session["username"]}!',
        'user': {
            'id': session['user_id'],
            'username': session['username'],
            'role': session['role']
        }
    })

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

@app.route('/api/consignor/records', methods=['GET'])
@role_required(['consignor', 'admin'])
def get_consignor_records():
    """Get records for the logged-in consignor (or all for admin)"""
    conn = get_db()
    cursor = conn.cursor()

    if session.get('role') == 'admin':
        # Admin can see all consignment records
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
        # Consignor can only see their own records
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

    # Get current commission rate
    cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'COMMISSION_DEFAULT_RATE'")
    commission_result = cursor.fetchone()
    commission_rate = float(commission_result['config_value']) if commission_result else 0.20

    cursor.execute('''
        INSERT INTO records (
            artist, title, barcode, genre_id, image_url,
            catalog_number, condition, store_price,
            youtube_url, consignor_id, commission_rate,
            compilation, status_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
        session['user_id'],  # Set consignor_id to logged-in user
        commission_rate,
        data.get('compilation', False),
        1  # Default status: new
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


#======================test-square=============================================
@app.route('/test-square')
def test_square():
    import os
    from square import Square
    from square.environment import SquareEnvironment

    access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
    result = []

    if not access_token:
        return jsonify({"error": "SQUARE_ACCESS_TOKEN not found"})

    result.append(f"Token: {access_token[:20]}... ({len(access_token)} chars)")

    try:
        client = Square(token=access_token, environment=SquareEnvironment.SANDBOX)
        result.append("✅ Square client created successfully.")

        # CORRECT: Access the locations directly from the response object
        api_response = client.locations.list()

        # Check if there are any errors
        if api_response.errors:
            result.append(f"❌ API errors: {api_response.errors}")
        else:
            # Access locations directly - it's an attribute on the response object
            locations = api_response.locations if hasattr(api_response, 'locations') else []
            result.append(f"✅ SUCCESS! Found {len(locations)} location(s).")

            for location in locations:
                result.append(f"  📍 Location ID: {location.id}")  # Note: uses .id not ['id']
                result.append(f"  🏢 Business Name: {location.business_name or 'N/A'}")

                # Store the first location ID for future use
                if 'SQUARE_LOCATION_ID' not in os.environ:
                    os.environ['SQUARE_LOCATION_ID'] = location.id
                    result.append(f"  ⚡ Set SQUARE_LOCATION_ID={location.id}")

    except Exception as e:
        result.append(f"❌ Error: {type(e).__name__}: {e}")
        import traceback
        result.append(f"Traceback: {traceback.format_exc()}")

    return jsonify({"results": result})


#============square checkout
@app.route('/api/square/terminal-checkout', methods=['POST'])
def create_terminal_checkout():
    """
    Endpoint for your inventory app to call when checking out vinyl records.
    Expects JSON: {'record_ids': [1, 2, 3], 'total_amount': 29.99, 'record_titles': ['Album1', 'Album2']}
    """
    import uuid
    import os
    from square import Square
    from square.environment import SquareEnvironment

    data = request.get_json()

    # Validate request
    required_fields = ['record_ids', 'total_amount']
    for field in required_fields:
        if field not in data:
            return jsonify({'status': 'error', 'error': f'{field} required'}), 400

    # Convert price to cents (Square expects integer cents)
    amount_cents = int(float(data['total_amount']) * 100)

    # Generate unique idempotency key
    idempotency_key = str(uuid.uuid4())

    try:
        # Initialize Square client
        client = Square(
            token=os.environ.get('SQUARE_ACCESS_TOKEN'),
            environment=SquareEnvironment.SANDBOX
        )

        # Create terminal checkout
        checkout_response = client.terminal.checkouts.create(
            idempotency_key=idempotency_key,
            checkout={
                "amount_money": {
                    "amount": amount_cents,
                    "currency": "USD"
                },
                "device_options": {
                    "device_id": os.environ.get('SQUARE_TERMINAL_DEVICE_ID', 'TERMINAL'),
                    "skip_receipt_screen": True,
                    "collect_signature": False
                },
                "reference_id": f"vinyl_checkout_{idempotency_key[:8]}",
                "note": f"PigStyle Records: {', '.join(data.get('record_titles', ['Vinyl'])[:3])}"
            }
        )

        # Check for errors in the Square API response
        if hasattr(checkout_response, 'errors') and checkout_response.errors:
            app.logger.error(f"Square API error: {checkout_response.errors}")
            return jsonify({
                'status': 'error',
                'error': 'Square API error',
                'details': checkout_response.errors
            }), 500

        # Get the checkout ID
        checkout_id = None
        if hasattr(checkout_response, 'checkout') and hasattr(checkout_response.checkout, 'id'):
            checkout_id = checkout_response.checkout.id
        elif hasattr(checkout_response, 'body') and hasattr(checkout_response.body, 'checkout'):
            checkout_id = checkout_response.body.checkout.id
        else:
            checkout_id = "unknown"

        # Update records status to sold (status_id = 3) WITHOUT date_sold column
        conn = get_db()
        cursor = conn.cursor()

        placeholders = ','.join('?' for _ in data['record_ids'])
        cursor.execute(f'''
            UPDATE records
            SET status_id = 3
            WHERE id IN ({placeholders})
        ''', data['record_ids'])

        updated_count = cursor.rowcount
        conn.commit()
        conn.close()

        app.logger.info(f"Updated {updated_count} records to status_id = 3")

        return jsonify({
            'status': 'success',
            'message': 'Payment initiated on Square Terminal',
            'checkout_id': checkout_id,
            'amount': amount_cents / 100,
            'record_ids': data['record_ids'],
            'records_updated': updated_count
        })

    except Exception as e:
        app.logger.error(f"Terminal checkout failed: {e}")
        import traceback
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': 'Failed to initiate payment',
            'details': str(e)
        }), 500


@app.route('/api/square/cancel-checkout/<checkout_id>', methods=['POST'])
def cancel_terminal_checkout(checkout_id):
    import os
    from square import Square
    from square.environment import SquareEnvironment

    try:
        client = Square(
            token=os.environ.get('SQUARE_ACCESS_TOKEN'),
            environment=SquareEnvironment.SANDBOX
        )

        # Call the cancel method on the checkouts object
        cancel_response = client.terminal.checkouts.cancel(checkout_id)

        if hasattr(cancel_response, 'errors') and cancel_response.errors:
            return jsonify({'status': 'error', 'details': cancel_response.errors}), 500

        # Optional: You can also mark your internal records as "cancelled" here
        return jsonify({
            'status': 'success',
            'message': f'Checkout {checkout_id} cancelled.',
            'new_status': 'CANCELED'
        })

    except Exception as e:
        app.logger.error(f"Failed to cancel checkout: {e}")
        return jsonify({'status': 'error', 'details': str(e)}), 500

#===================================================================
@app.route('/api/commission-rate', methods=['GET'])
def get_commission_rate():
    """Calculate current consignment commission rate"""
    conn = get_db()  # Use the same get_db() function
    cursor = conn.cursor()

    # Fetch config values
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

    # Count active inventory (status_id 1 or 2 = active)
    cursor.execute("SELECT COUNT(*) FROM records WHERE status_id IN (1, 2)")
    total_inventory = cursor.fetchone()[0]

    conn.close()

    # Calculate fill percentage
    fill_percentage = (total_inventory / config['STORE_CAPACITY']) * 100

    # Apply sliding scale calculation
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

@app.route('/records/status/<int:status_id>', methods=['GET'])
def get_records_by_status(status_id):
    """Get records by status ID"""
    conn = get_db()
    cursor = conn.cursor()

    # Verify status exists
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

# ==================== PAYOUT ENDPOINTS ====================

@app.route('/users/<int:user_id>/request-payout', methods=['PUT'])
def request_payout(user_id):
    """User requests a payout"""
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM users WHERE id = ?', (user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'User not found'}), 404

    cursor.execute('''
        UPDATE users
        SET payout_requested = 1
        WHERE id = ?
    ''', (user_id,))

    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'message': 'Payout request submitted'})

@app.route('/users/<int:user_id>/process-payout', methods=['PUT'])
def process_payout(user_id):
    """Admin processes a payout"""
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM users WHERE id = ?', (user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'User not found'}), 404

    cursor.execute('''
        UPDATE users
        SET store_credit_balance = 0,
            payout_requested = 0
        WHERE id = ?
    ''', (user_id,))

    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'message': 'Payout processed successfully'})

# ==================== VOTING ENDPOINTS ====================
@app.route('/votes/record/<int:record_id>', methods=['GET'])
def get_record_votes(record_id):
    """Get vote count and voting status for a specific record"""
    conn = get_db()
    cursor = conn.cursor()

    # Verify record exists
    cursor.execute('SELECT id, artist, title FROM records WHERE id = ?', (record_id,))
    record = cursor.fetchone()

    if not record:
        conn.close()
        return jsonify({'status': 'error', 'error': 'Record not found'}), 404

    # Get vote count
    cursor.execute('''
        SELECT COUNT(*) as vote_count
        FROM votes
        WHERE record_id = ?
    ''', (record_id,))

    vote_data = cursor.fetchone()
    vote_count = vote_data['vote_count'] if vote_data else 0

    # Check if current IP has voted for this record
    ip_address = request.headers.get('X-Forwarded-For', request.remote_addr).split(',')[0].strip()
    cursor.execute('''
        SELECT 1 FROM votes
        WHERE record_id = ? AND ip_address = ?
        LIMIT 1
    ''', (record_id, ip_address))

    has_voted = cursor.fetchone() is not None

    conn.close()

    return jsonify({
        'status': 'success',
        'record_id': record_id,
        'artist': record['artist'],
        'title': record['title'],
        'vote_count': vote_count,
        'has_voted': has_voted
    })

@app.route('/vote/<int:record_id>', methods=['POST'])
def vote_record(record_id):
    """Record a vote from an IP address and return new vote count"""
    conn = get_db()
    cursor = conn.cursor()

    # Get client IP
    ip_address = request.headers.get('X-Forwarded-For', request.remote_addr).split(',')[0].strip()

    # Check if record exists
    cursor.execute('SELECT id, artist, title FROM records WHERE id = ?', (record_id,))
    record = cursor.fetchone()

    if not record:
        conn.close()
        return jsonify({'status': 'error', 'error': 'Record not found'}), 404

    # Insert vote (unique constraint prevents duplicate votes from same IP)
    cursor.execute('''
        INSERT OR IGNORE INTO votes (record_id, ip_address)
        VALUES (?, ?)
    ''', (record_id, ip_address))

    if cursor.rowcount == 0:
        # Already voted - get current count
        cursor.execute('''
            SELECT COUNT(*) as vote_count
            FROM votes
            WHERE record_id = ?
        ''', (record_id,))
        vote_data = cursor.fetchone()
        vote_count = vote_data['vote_count'] if vote_data else 0

        conn.close()
        return jsonify({
            'status': 'error',
            'error': 'Already voted',
            'record_id': record_id,
            'artist': record['artist'],
            'title': record['title'],
            'vote_count': vote_count
        }), 409

    # Get the new vote count
    cursor.execute('''
        SELECT COUNT(*) as vote_count
        FROM votes
        WHERE record_id = ?
    ''', (record_id,))

    vote_data = cursor.fetchone()
    vote_count = vote_data['vote_count'] if vote_data else 0

    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': 'Vote recorded',
        'record_id': record_id,
        'artist': record['artist'],
        'title': record['title'],
        'vote_count': vote_count
    })


@app.route('/votes', methods=['GET'])
def get_votes():
    """Get all votes with counts per record"""
    conn = get_db()
    cursor = conn.cursor()

    # Get votes grouped by record
    cursor.execute('''
        SELECT
            r.id as record_id,
            r.artist,
            r.title,
            COUNT(v.id) as vote_count
        FROM records r
        LEFT JOIN votes v ON r.id = v.record_id
        GROUP BY r.id, r.artist, r.title
        ORDER BY vote_count DESC
    ''')

    votes = cursor.fetchall()
    conn.close()

    return jsonify({
        'status': 'success',
        'votes': [dict(vote) for vote in votes]
    })
# ==================== AUTHENTICATION ENDPOINTS ====================

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
        SELECT id, username, email, role, full_name, phone, address, created_at, last_login,
               master_agreement_signed, master_agreement_signed_at, current_master_agreement_id,
               store_credit_balance, payout_requested
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
            'master_agreement_signed': bool(user['master_agreement_signed']),
            'master_agreement_signed_at': user['master_agreement_signed_at'],
            'current_master_agreement_id': user['current_master_agreement_id'],
            'store_credit_balance': float(user['store_credit_balance']) if user['store_credit_balance'] is not None else 0.0,
            'payout_requested': bool(user['payout_requested'])
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

    stored_hash = user['password_hash']

    login_valid = True

    return jsonify({
        'status': 'success',
        'user_id': user_id,
        'login_valid': login_valid,
        'note': 'Debug endpoint - always returns True for testing'
    })

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
        'service': 'PigStyle API',
        'endpoints': [
            '/vote/<record_id>/<voter_ip>/<vote_type>',
            '/user-votes/<voter_ip>',
            '/votes/<record_id>',
            '/users',
            '/debug/verify-login/<user_id>',
            '/users/<user_id>/reset-password',
            '/users/<user_id>/change-password',
            '/users/<user_id>/request-payout',
            '/users/<user_id>/process-payout',
            '/health',
            '/barcodes/assign',
            '/records',
            '/records/<record_id>',
            '/search',
            '/records/barcode/<barcode>',
            '/config/<config_key>',
            '/config',
            '/genres',
            '/records/by-ids',
            '/stats',
            '/stats/user/<user_id>',
            '/records/user/<user_id>',
            '/records/no-barcodes',
            '/spotify/authorize-and-update',
            '/spotify/callback',
            '/spotify/job-status/<job_id>',
            '/spotify/stored-playlists',
            '/spotify/playlist-tracks/<playlist_id>',
            '/spotify/get-app-token',
            '/genres',
            '/records',
            '/records/count',
            '/votes/all',
            '/votes/statistics',
            '/user-vote/<record_id>/<voter_hash>',
            '/discogs-genre-mappings',
            '/discogs-genre-mappings/<discogs_genre>',
            '/catalog/grouped-records',
            '/stats/genres',
            '/contract-audit-log',
            '/contract-audit-log/<user_id>',
            '/master-agreements',
            '/consignment-batches',
            '/consignment-batches/<user_id>',
            '/verify-contract/<contract_hash>',
            '/debug-db',
            '/users/<user_id>/unsign-master-agreement',
            '/checkout/process-payment',
            '/statuses',
            '/records/status/<status_id>',
            '/records/update-status',
            '/consignment/records'
        ]
    })

# ==================== STREAMLIT ENDPOINTS ====================

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

@app.route('/records', methods=['POST'])
def create_record():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400

    required_fields = ['artist', 'title']
    for field in required_fields:
        if field not in data:
            return jsonify({'status': 'error', 'error': f'{field} required'}), 400

    conn = get_db()
    cursor = conn.cursor()

    consignor_id = data.get('consignor_id')
    commission_rate = data.get('commission_rate')

    # Default status_id is 1 (new) if not provided
    status_id = data.get('status_id', 1)

    cursor.execute('''
        INSERT INTO records (
            artist, title, barcode, genre_id, image_url,
            catalog_number, condition, store_price,
            youtube_url, consignor_id, commission_rate,
            compilation, status_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.get('artist'),
        data.get('title'),
        data.get('barcode', ''),
        data.get('genre_id'),
        data.get('image_url', ''),
        data.get('catalog_number', ''),
        data.get('condition', '4'),
        data.get('store_price'),
        data.get('youtube_url', ''),
        consignor_id,
        commission_rate,
        data.get('compilation', False),
        status_id
    ))

    record_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'record_id': record_id})

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

    record_dict = dict(record)
    return jsonify(record_dict)

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
        'compilation': 'compilation',
        'up_votes': 'up_votes',
        'down_votes': 'down_votes',
        'kill_votes': 'kill_votes',
        'original_consignor_price': 'original_consignor_price',
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

    cursor.execute('DELETE FROM votes WHERE record_id = ?', (record_id,))
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

@app.route('/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, username, email, full_name, phone, address,
               role, created_at, last_login,
               master_agreement_signed, master_agreement_signed_at,
               current_master_agreement_id, store_credit_balance, payout_requested
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
            'master_agreement_signed': bool(user[9]) if user[9] is not None else False,
            'master_agreement_signed_at': user[10],
            'current_master_agreement_id': user[11],
            'store_credit_balance': float(user[12]) if user[12] is not None else 0.0,
            'payout_requested': bool(user[13]) if user[13] is not None else False
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

# ==================== CHECKOUT ENDPOINT ====================

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
        # Get record information
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

        # Calculate payout
        commission = store_price * commission_rate
        payout = store_price - commission

        # Track payouts by consignor
        if consignor_id not in user_payouts:
            user_payouts[consignor_id] = 0.0
        user_payouts[consignor_id] += payout

        total_payout += payout

        # Update record status to sold (3) and set dates
        cursor.execute('''
            UPDATE records
            SET status_id = 3,
                date_sold = ?,
                date_paid = ?
            WHERE id = ?
        ''', (today, today if payment_type == 'paid' else None, record_id))

    # Update store credit for consignors
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
        'new_status_id': 3  # sold
    })

# ==================== RECORDS UPDATE STATUS ENDPOINT ====================

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

    # Verify status exists
    cursor.execute('SELECT id FROM d_status WHERE id = ?', (status_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Invalid status ID'}), 400

    placeholders = ','.join('?' for _ in record_ids)

    # Update records
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

# ==================== CONSIGNMENT RECORDS ENDPOINT ====================

@app.route('/consignment/records', methods=['GET'])
def get_consignment_records():
    """Get consignment records with status information"""
    user_id = request.args.get('user_id')

    conn = get_db()
    cursor = conn.cursor()

    if user_id:
        # Get records for specific user
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
                    WHEN 1 THEN 1  -- new
                    WHEN 2 THEN 2  -- active
                    WHEN 3 THEN 3  -- sold
                    WHEN 4 THEN 4  -- removed
                    ELSE 5
                END,
                r.artist, r.title
        ''', (user_id,))
    else:
        # Get all consignment records
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
                    WHEN 1 THEN 1  -- new
                    WHEN 2 THEN 2  -- active
                    WHEN 3 THEN 3  -- sold
                    WHEN 4 THEN 4  -- removed
                    ELSE 5
                END,
                r.consignor_id, r.artist, r.title
        ''')

    records = cursor.fetchall()
    conn.close()

    records_list = [dict(record) for record in records]

    # Add display_status for compatibility with frontend
    for record in records_list:
        barcode = record.get('barcode')
        status_id = record.get('status_id')
        status_name = record.get('status_name', 'new')

        # Determine display status
        if status_id == 1:  # new
            if not barcode or barcode in [None, '', 'None']:
                record['display_status'] = '🆕 New'
            else:
                record['display_status'] = '✅ Active'
        elif status_id == 2:  # active
            record['display_status'] = '✅ Active'
        elif status_id == 3:  # sold
            record['display_status'] = '💰 Sold'
        elif status_id == 4:  # removed
            record['display_status'] = '🗑️ Removed'
        else:
            record['display_status'] = '❓ Unknown'

    return jsonify({
        'status': 'success',
        'count': len(records_list),
        'records': records_list
    })

# ==================== SPOTIFY FUNCTIONS ====================

def store_spotify_playlist(playlist_id, playlist_name, genre_name, spotify_url, embed_url, tracks_count):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id FROM spotify_playlists WHERE playlist_id = ?
    ''', (playlist_id,))

    existing = cursor.fetchone()

    if existing:
        cursor.execute('''
            UPDATE spotify_playlists
            SET playlist_name = ?, genre_name = ?, spotify_url = ?, embed_url = ?,
                tracks_count = ?, updated_at = CURRENT_TIMESTAMP, is_active = 1
            WHERE playlist_id = ?
        ''', (playlist_name, genre_name, spotify_url, embed_url, tracks_count, playlist_id))
    else:
        cursor.execute('''
            INSERT INTO spotify_playlists
            (playlist_id, playlist_name, genre_name, spotify_url, embed_url, tracks_count)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (playlist_id, playlist_name, genre_name, spotify_url, embed_url, tracks_count))

    conn.commit()
    conn.close()
    return True

def deactivate_all_playlists():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE spotify_playlists SET is_active = 0
    ''')

    conn.commit()
    conn.close()
    return True

def get_stored_playlists(genre_filter=None):
    conn = get_db()
    cursor = conn.cursor()

    if genre_filter:
        cursor.execute('''
            SELECT playlist_id, playlist_name, genre_name, spotify_url, embed_url, tracks_count
            FROM spotify_playlists
            WHERE is_active = 1 AND genre_name = ?
            ORDER BY playlist_name
        ''', (genre_filter,))
    else:
        cursor.execute('''
            SELECT playlist_id, playlist_name, genre_name, spotify_url, embed_url, tracks_count
            FROM spotify_playlists
            WHERE is_active = 1
            ORDER BY genre_name, playlist_name
        ''')

    playlists = cursor.fetchall()
    conn.close()

    playlists_list = []
    for playlist in playlists:
        playlists_list.append({
            'id': playlist['playlist_id'],
            'name': playlist['playlist_name'],
            'genre': playlist['genre_name'],
            'url': playlist['spotify_url'],
            'embed_url': playlist['embed_url'],
            'tracks': playlist['tracks_count'],
            'public': True,
            'description': f"PigStyle: {playlist['genre_name']} - {playlist['tracks_count']} tracks"
        })

    return playlists_list

def get_spotify_app_token():
    token_url = 'https://accounts.spotify.com/api/token'
    headers = {
        'Authorization': f'Basic {get_basic_auth_header()}',
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    data = {
        'grant_type': 'client_credentials'
    }

    response = requests.post(token_url, headers=headers, data=data)

    if response.status_code == 200:
        token_data = response.json()
        token_data['expires_at'] = datetime.now().timestamp() + token_data.get('expires_in', 3600)
        return token_data
    else:
        return None

def get_valid_app_token():
    token_key = 'spotify_app_token'
    token_data = user_tokens.get(token_key)

    if not token_data or datetime.now().timestamp() > token_data['expires_at']:
        token_data = get_spotify_app_token()
        if token_data:
            user_tokens[token_key] = token_data
        else:
            return None

    return token_data['access_token']

def get_playlist_tracks_with_details(playlist_id, access_token):

    tracks_url = f'https://api.spotify.com/v1/playlists/{playlist_id}/tracks'
    headers = {'Authorization': f'Bearer {access_token}'}

    all_tracks = []
    next_url = tracks_url

    while next_url:
        response = requests.get(next_url, headers=headers)

        if response.status_code != 200:
            return []

        data = response.json()
        tracks_data = data.get('items', [])

        for item in tracks_data:
            track = item.get('track')
            if track and track.get('type') == 'track':
                album_images = track.get('album', {}).get('images', [])
                album_art_url = None
                if album_images:
                    sorted_images = sorted(album_images, key=lambda x: x.get('width', 0), reverse=True)
                    album_art_url = sorted_images[0].get('url') if sorted_images else None

                track_info = {
                    'id': track.get('id'),
                    'name': track.get('name'),
                    'artists': [artist.get('name') for artist in track.get('artists', [])],
                    'duration_ms': track.get('duration_ms', 0),
                    'album_name': track.get('album', {}).get('name'),
                    'album_art_url': album_art_url,
                    'preview_url': track.get('preview_url'),
                    'track_number': track.get('track_number'),
                    'uri': track.get('uri'),
                    'popularity': track.get('popularity', 0)
                }
                all_tracks.append(track_info)

        next_url = data.get('next')
        if next_url:
            time.sleep(0.1)

    return all_tracks

def get_basic_auth_header():
    auth_string = f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}"
    auth_bytes = auth_string.encode('utf-8')
    return base64.b64encode(auth_bytes).decode('utf-8')

def exchange_code_for_token(code, redirect_uri=None):
    token_url = 'https://accounts.spotify.com/api/token'
    headers = {
        'Authorization': f'Basic {get_basic_auth_header()}',
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': redirect_uri or SPOTIFY_REDIRECT_URI
    }

    response = requests.post(token_url, headers=headers, data=data)

    if response.status_code == 200:
        token_data = response.json()
        token_data['expires_at'] = datetime.now().timestamp() + token_data.get('expires_in', 3600)
        return token_data
    else:
        return None

def get_valid_token(token_key):
    token_data = user_tokens.get(token_key)

    if not token_data:
        return None

    if datetime.now().timestamp() > token_data['expires_at']:
        refresh_token = token_data.get('refresh_token')
        return None

    return token_data['access_token']

def search_spotify_album_track(artist, album_title, access_token):

    clean_album_title = album_title
    for suffix in ['(Vinyl)', '[Vinyl]', '(LP)', '[LP]', '(Album)', '[Album]']:
        clean_album_title = clean_album_title.replace(suffix, '').strip()

    search_query = f'album:"{clean_album_title}" artist:"{artist}"'
    search_url = 'https://api.spotify.com/v1/search'
    headers = {'Authorization': f'Bearer {access_token}'}
    params = {'q': search_query, 'type': 'album', 'limit': 5}

    response = requests.get(search_url, headers=headers, params=params)

    if response.status_code != 200:
        return None

    albums = response.json().get('albums', {}).get('items', [])

    if not albums:
        return None

    album = albums[0]
    album_id = album['id']

    tracks_url = f'https://api.spotify.com/v1/albums/{album_id}/tracks?limit=50'
    tracks_response = requests.get(tracks_url, headers=headers)

    if tracks_response.status_code != 200:
        return None

    tracks = tracks_response.json().get('items', [])

    if not tracks:
        return None

    most_popular_track = None
    highest_popularity = -1

    for track in tracks[:10]:
        track_id = track['id']
        track_details_url = f'https://api.spotify.com/v1/tracks/{track_id}'
        track_response = requests.get(track_details_url, headers=headers)

        if track_response.status_code == 200:
            track_detail = track_response.json()
            popularity = track_detail.get('popularity', 0)
            if popularity > highest_popularity:
                highest_popularity = popularity
                most_popular_track = track_detail

    if not most_popular_track and tracks:
        track_id = tracks[0]['id']
        track_url = f'https://api.spotify.com/v1/tracks/{track_id}'
        track_response = requests.get(track_url, headers=headers)
        if track_response.status_code == 200:
            most_popular_track = track_response.json()

    if most_popular_track:
        return {
            'id': most_popular_track['id'],
            'name': most_popular_track['name'],
            'artists': [artist['name'] for artist in most_popular_track['artists']],
            'album': most_popular_track.get('album', {}).get('name', clean_album_title),
            'uri': most_popular_track['uri'],
            'popularity': most_popular_track.get('popularity', 0)
        }

    return None

def clear_spotify_playlist(playlist_id, access_token):
    url = f'https://api.spotify.com/v1/playlists/{playlist_id}/tracks'
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    all_tracks = []
    next_url = f"{url}?fields=items(track(uri))&limit=100"

    while next_url:
        response = requests.get(next_url, headers=headers)

        if response.status_code != 200:
            return False, f"Failed to get playlist tracks: {response.status_code}"

        data = response.json()
        tracks = data.get('items', [])
        all_tracks.extend([{'uri': item['track']['uri']} for item in tracks])
        next_url = data.get('next')


    if not all_tracks:
        return True, "Playlist is already empty"

    remove_url = f'https://api.spotify.com/v1/playlists/{playlist_id}/tracks'
    remove_data = {'tracks': all_tracks}

    response = requests.delete(remove_url, headers=headers, json=remove_data)

    if response.status_code == 200:
        return True, f"Cleared {len(all_tracks)} tracks"
    else:
        return False, f"Failed to clear: {response.status_code} - {response.text}"

def add_tracks_to_playlist(playlist_id, track_uris, access_token):
    url = f'https://api.spotify.com/v1/playlists/{playlist_id}/tracks'
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    random.shuffle(track_uris)

    successful = 0
    for i in range(0, len(track_uris), 100):
        batch = track_uris[i:i+100]
        data = {'uris': batch}

        response = requests.post(url, headers=headers, json=data)

        if response.status_code == 201:
            successful += len(batch)

        time.sleep(0.1)

    return True, f"Added {successful}/{len(track_uris)} tracks in random order"

def create_or_get_genre_playlist(genre_name, access_token):

    clean_genre = re.sub(r'[^\w\s-]', '', genre_name).strip()
    if not clean_genre:
        clean_genre = "Miscellaneous"

    playlist_name = f"PigStyle: {clean_genre}"
    playlist_description = f"Vinyl records from PigStyle Records - Genre: {genre_name}"


    user_url = 'https://api.spotify.com/v1/me'
    headers = {'Authorization': f'Bearer {access_token}'}

    user_response = requests.get(user_url, headers=headers)

    if user_response.status_code != 200:
        return None

    user_id = user_response.json()['id']

    playlists_url = f'https://api.spotify.com/v1/users/{user_id}/playlists?limit=50'
    playlists_response = requests.get(playlists_url, headers=headers)

    if playlists_response.status_code == 200:
        playlists = playlists_response.json().get('items', [])

        for playlist in playlists:
            if playlist['name'] == playlist_name:
                return playlist['id']

    create_url = f'https://api.spotify.com/v1/users/{user_id}/playlists'
    playlist_data = {
        'name': playlist_name,
        'description': playlist_description,
        'public': True
    }

    create_response = requests.post(create_url, headers=headers, json=playlist_data)

    if create_response.status_code == 201:
        new_playlist = create_response.json()
        return new_playlist['id']
    else:
        return None

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
        AND r.status_id IN (1, 2)  -- Only new and active records
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
        import random
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

    import random
    import math

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

  
# ==================== GENRES ENDPOINT ====================

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


@app.route('/genres/by-name/<genre_name>', methods=['GET'])
def get_genre_by_name(genre_name):
    """Get genre ID by genre name"""
    conn = get_db()
    cursor = conn.cursor()

    # Use LIKE for case-insensitive matching and handle URL-encoded spaces
    decoded_genre_name = urllib.parse.unquote(genre_name)

    cursor.execute('''
        SELECT id, genre_name
        FROM genres
        WHERE genre_name = ?
    ''', (decoded_genre_name,))

    genre = cursor.fetchone()

    # If exact match not found, try case-insensitive search
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

# ==================== RECORDS ENDPOINTS ====================

@app.route('/records/random', methods=['GET'])
def get_random_records():
    """Get random records with configurable limit"""
    # Get parameters with defaults
    limit = request.args.get('limit', default=500, type=int)
    has_youtube = request.args.get('has_youtube', default=None, type=str)

    conn = get_db()
    cursor = conn.cursor()

    # Base query
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

    # Filter for records with YouTube URLs if requested
    if has_youtube and has_youtube.lower() == 'true':
        query += '''
            AND (r.youtube_url LIKE '%youtube.com%' OR
                 r.youtube_url LIKE '%youtu.be%')
        '''

    # Add random ordering and limit
    query += ' ORDER BY RANDOM() LIMIT ?'
    params.append(limit)

    cursor.execute(query, params)
    records = cursor.fetchall()
    conn.close()

    records_list = []
    for record in records:
        record_dict = dict(record)
        records_list.append(record_dict)

    return jsonify({
        'status': 'success',
        'count': len(records_list),
        'limit': limit,
        'has_youtube_filter': has_youtube,
        'records': records_list
    })



@app.route('/records', methods=['GET'])
def get_records():
    conn = get_db()
    cursor = conn.cursor()


    cursor.execute('''
        SELECT r.*, COALESCE(g.genre_name, 'Unknown') as genre_name,
               s.status_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        WHERE r.artist IS NOT NULL AND r.title IS NOT NULL
        AND r.artist != '' AND r.title != ''
        ORDER BY r.id DESC

    ''' )

    records = cursor.fetchall()
    conn.close()

    records_list = []
    for record in records:
        record_dict = dict(record)
        records_list.append(record_dict)

    return jsonify({
        'status': 'success',
        'count': len(records_list),
        'total': len(records_list),
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



# ==================== SEARCH ENDPOINT ====================
@app.route('/search', methods=['GET'])
def search_records():
    search_term = request.args.get('q', '')
    if not search_term:
        return jsonify({'status': 'error', 'error': 'Search term required'}), 400

    conn = get_db()
    cursor = conn.cursor()

    search_pattern = f'%{search_term}%'

    cursor.execute('''
        SELECT
            r.id,
            r.artist,
            r.title,
            r.barcode,
            r.catalog_number,
            r.image_url,
            r.store_price,
            r.condition,
            r.youtube_url,
            r.compilation,
            r.consignor_id,
            r.created_at,
            r.status_id,
            s.status_name as status,
            COALESCE(g.genre_name, 'Unknown') as genre_name,
            u.username as consignor_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN users u ON r.consignor_id = u.id
        LEFT JOIN d_status s ON r.status_id = s.id
        WHERE (r.artist LIKE ? OR r.title LIKE ? OR
               r.catalog_number LIKE ? OR r.barcode LIKE ? OR
               r.artist || ' - ' || r.title LIKE ?)
        ORDER BY
            CASE
                WHEN r.artist LIKE ? THEN 1
                WHEN r.title LIKE ? THEN 2
                ELSE 3
            END,
            r.artist, r.title
        LIMIT 50
    ''', (search_pattern, search_pattern, search_pattern, search_pattern,
          search_pattern, search_pattern, search_pattern))

    records = cursor.fetchall()
    conn.close()

    records_list = [dict(record) for record in records]
    return jsonify({'status': 'success', 'records': records_list})


@app.route('/api/discogs/search', methods=['GET'])
def api_discogs_search():
    """Search Discogs API through backend"""
    search_term = request.args.get('q', '')
    
    if not search_term:
        return jsonify({'status': 'error', 'error': 'Search term required'}), 400
    
    try:
        # You need to set DISCOGS_USER_TOKEN in your environment
        discogs_token = os.environ.get('DISCOGS_USER_TOKEN')
        
        if not discogs_token:
            return jsonify({
                'status': 'error',
                'error': 'Discogs API token not configured',
                'mock_data': True
            }), 503
        
        # Create DiscogsHandler instance
        from discogs_handler import DiscogsHandler  # Import your existing handler
        discogs_handler = DiscogsHandler(discogs_token)
        
        # Perform search using your existing handler
        results = discogs_handler.get_simple_search_results(search_term)
        
        # Format results for frontend
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
        
        # Return mock data if API fails
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
            AND r.status_id IN (1, 2)  -- Only new and active
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
            AND r.status_id IN (1, 2)  -- Only new and active
            ORDER BY r.consignor_id, r.created_at DESC
        ''')

    records = cursor.fetchall()
    conn.close()

    records_list = [dict(record) for record in records]
    return jsonify({'status': 'success', 'records': records_list})

# ==================== CONTRACT ENDPOINTS ====================

@app.route('/contract-audit-log', methods=['POST'])
def log_contract_audit():
    data = request.json

    required = ['user_id', 'event_type', 'session_id']
    if not all(field in data for field in required):
        return jsonify({'error': 'Missing required fields'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO contract_audit_log
        (user_id, event_type, event_data, ip_address, user_agent, session_id, document_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['user_id'],
        data['event_type'],
        data.get('event_data'),
        data.get('ip_address'),
        data.get('user_agent'),
        data['session_id'],
        data.get('document_hash')
    ))
    conn.commit()

    return jsonify({'status': 'success', 'id': cursor.lastrowid})

@app.route('/contract-audit-log/<int:user_id>', methods=['GET'])
def get_audit_log(user_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM contract_audit_log
        WHERE user_id = ?
        ORDER BY created_at ASC
    ''', (user_id,))

    logs = cursor.fetchall()
    logs_list = [dict(log) for log in logs]
    return jsonify({'audit_log': logs_list})

@app.route('/master-agreements', methods=['POST'])
def create_master_agreement():
    data = request.json

    required = ['user_id', 'commission_rate', 'store_return_days',
                'contract_html', 'contract_hash', 'signed_at']

    if not all(field in data for field in required):
        return jsonify({'error': 'Missing required fields'}), 400

    conn = get_db()
    cursor = conn.cursor()


    cursor.execute('''
        INSERT INTO master_agreements
        (user_id, version, commission_rate, store_return_days,
         customer_return_days, consignor_pickup_days, additional_terms,
         contract_html, contract_hash, audit_trail_hash, signed_at, signed_by_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        int(data['user_id']),
        data.get('version', '1.0'),
        float(data['commission_rate']),
        int(data['store_return_days']),
        int(data.get('customer_return_days', 30)),
        int(data.get('consignor_pickup_days', 14)),
        data.get('additional_terms', ''),
        data['contract_html'],
        data['contract_hash'],
        data.get('audit_trail_hash', ''),
        data['signed_at'],
        bool(data.get('signed_by_admin', False))
    ))

    agreement_id = cursor.lastrowid

    cursor.execute('''
        UPDATE users
        SET master_agreement_signed = 1,
            master_agreement_signed_at = ?,
            current_master_agreement_id = ?
        WHERE id = ?
    ''', (
        data['signed_at'],
        agreement_id,
        int(data['user_id'])
    ))


    conn.commit()
    return jsonify({'status': 'success', 'id': agreement_id})

@app.route('/users/<int:user_id>/unsign-master-agreement', methods=['POST'])
def unsign_master_agreement(user_id):
    data = request.get_json() or {}
    reason = data.get('reason', 'User requested unsigned')

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO contract_audit_log
        (user_id, event_type, event_data, session_id)
        VALUES (?, ?, ?, ?)
    ''', (
        user_id,
        'agreement_signed',
        json.dumps({
            'reason': reason,
            'timestamp': datetime.now().isoformat(),
            'action': 'unsigned',
            'status': False
        }),
        secrets.token_hex(16)
    ))

    cursor.execute('''
        UPDATE users
        SET master_agreement_signed = 0,
            master_agreement_signed_at = NULL,
            current_master_agreement_id = NULL
        WHERE id = ?
    ''', (user_id,))

    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': 'Master agreement unsigned successfully',
        'user_id': user_id
    })

@app.route('/consignment-batches/<int:user_id>', methods=['GET'])
def get_consignment_batches(user_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM consignment_batches
        WHERE user_id = ?
        ORDER BY created_at DESC
    ''', (user_id,))

    batches = cursor.fetchall()
    batches_list = [dict(batch) for batch in batches]
    return jsonify({'batches': batches_list})

@app.route('/consignment-batches', methods=['POST'])
def create_consignment_batch():
    data = request.json

    required = ['user_id', 'batch_number']
    if not all(field in data for field in required):
        return jsonify({'error': 'Missing required fields'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO consignment_batches
        (user_id, batch_number, status, item_count, total_estimated_value,
         receipt_html, receipt_hash, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['user_id'],
        data['batch_number'],
        data.get('status', 'pending'),
        data.get('item_count', 0),
        data.get('total_estimated_value', 0.00),
        data.get('receipt_html'),
        data.get('receipt_hash'),
        data.get('notes', '')
    ))

    conn.commit()
    return jsonify({'status': 'success', 'id': cursor.lastrowid})

@app.route('/verify-contract/<string:contract_hash>', methods=['GET'])
def verify_contract(contract_hash):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT m.*, u.username, u.full_name
        FROM master_agreements m
        JOIN users u ON m.user_id = u.id
        WHERE m.contract_hash = ?
    ''', (contract_hash,))

    contract = cursor.fetchone()
    if not contract:
        return jsonify({'error': 'Contract not found'}), 404

    cursor.execute('''
        SELECT event_type, created_at, ip_address, session_id
        FROM contract_audit_log
        WHERE user_id = ?
        ORDER BY created_at ASC
    ''', (contract['user_id'],))

    audit_trail = cursor.fetchall()
    audit_list = [dict(log) for log in audit_trail]

    audit_data = json.dumps(audit_list, default=str)
    calculated_hash = hashlib.sha256(audit_data.encode()).hexdigest()[:32]

    verification = {
        'contract_valid': True,
        'contract_hash_matches': True,
        'audit_trail_valid': calculated_hash == contract.get('audit_trail_hash'),
        'audit_events_count': len(audit_list),
        'signature_date': contract['signed_at'],
        'consignor': {
            'id': contract['user_id'],
            'name': contract['full_name'],
            'username': contract['username']
        }
    }

    return jsonify(verification)

@app.route('/debug-db', methods=['GET'])
def debug_db():
    import traceback
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT 1 as test')
    test_result = cursor.fetchone()

    cursor.execute("PRAGMA table_info(master_agreements)")
    table_info = cursor.fetchall()
    table_info_list = [dict(col) for col in table_info]

    cursor.execute("PRAGMA table_info(users)")
    users_info = cursor.fetchall()
    users_info_list = [dict(col) for col in users_info]

    cursor.execute("SELECT COUNT(*) FROM master_agreements")
    count = cursor.fetchone()[0]

    cursor.execute("PRAGMA table_info(contract_audit_log)")
    audit_info = cursor.fetchall()
    audit_info_list = [dict(col) for col in audit_info]

    cursor.close()
    conn.close()

    return jsonify({
        'status': 'success',
        'db_test': dict(test_result),
        'master_agreements_columns': table_info_list,
        'users_columns': users_info_list,
        'audit_log_columns': audit_info_list,
        'existing_agreements': count
    })

# ==================== STATS ENDPOINT ====================

@app.route('/stats/genres', methods=['GET'])
def get_genre_statistics():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT g.genre_name, COUNT(r.id) as record_count
        FROM genres g
        LEFT JOIN records r ON g.id = r.genre_id
        WHERE r.status_id IN (1, 2)  -- Only new and active records
        GROUP BY g.id, g.genre_name
        ORDER BY record_count DESC
    ''')

    stats = cursor.fetchall()
    conn.close()

    stats_list = [dict(row) for row in stats]
    return jsonify({'status': 'success', 'genre_stats': stats_list})

# ==================== MAIN ====================

if __name__ == '__main__':
    app.run(debug=True, port=5000)