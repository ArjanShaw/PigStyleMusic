import string
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

import requests
import base64
from flask import Flask, jsonify, request, session, redirect, send_from_directory
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
from functools import wraps
from discogs_handler import DiscogsHandler 
import hmac
import traceback
import subprocess
import os
import discogs_client
from flask import session, request, jsonify
from functools import wraps
from werkzeug.utils import secure_filename
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'a7f8e9d3c5b1n2m4k6l7j8h9g0f1d2s3')



# Configure upload settings for accessories
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'images', 'merch')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'}

# Configure upload settings for accessories
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'images', 'misc')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'}

# Create upload folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    """Check if file extension is allowed for accessory images"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Create upload folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Square Configuration - ALL FROM ENVIRONMENT VARIABLES
SQUARE_ENVIRONMENT = os.environ.get('SQUARE_ENVIRONMENT')
SQUARE_LOCATION_ID = os.environ.get('SQUARE_LOCATION_ID')
SQUARE_TERMINAL_DEVICE_ID = os.environ.get('SQUARE_TERMINAL_DEVICE_ID', '0446')
SQUARE_WEBHOOK_SIGNATURE_KEY = os.environ.get('SQUARE_WEBHOOK_SIGNATURE_KEY')
SQUARE_APPLICATION_ID = os.environ.get('SQUARE_APPLICATION_ID')
SQUARE_ACCESS_TOKEN = os.environ.get('SQUARE_ACCESS_TOKEN')
DISCOGS_USER_TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
DISCOGS_USER_AGENT = os.environ.get('DISCOGS_USER_AGENT')

# Gmail Configuration
GMAIL_USER = os.environ.get('GMAIL_USER', 'pigstyle.loveland@gmail.com')
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD', '')


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
 

# Token storage and background job storage
user_tokens = {}
background_jobs = {}
square_payment_sessions = {}  # Store active payment sessions

def allowed_file(filename):
    """Check if file extension is allowed for accessory images"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.before_request
def log_request_info():
    app.logger.debug('Headers: %s', request.headers)
    app.logger.debug('Method: %s', request.method)
    app.logger.debug('URL: %s', request.url)

@app.after_request
def log_response_info(response):
    app.logger.debug('Response Status: %s', response.status)
    app.logger.debug('Response Headers: %s', response.headers)
    return response

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

# ==================== EMAIL HELPER FUNCTIONS ====================

def send_email(to_email, subject, body, from_name="PigStyle Music"):
    """
    Send a plain text email using Gmail SMTP
    
    Args:
        to_email (str): Recipient email address
        subject (str): Email subject line
        body (str): Plain text email body
        from_name (str): Display name for sender (default: "PigStyle Music")
    
    Returns:
        tuple: (success boolean, message string)
    """
    if not GMAIL_APP_PASSWORD:
        app.logger.error("GMAIL_APP_PASSWORD not configured - cannot send email")
        return False, "Email not configured. Please set GMAIL_APP_PASSWORD in environment."
    
    if not to_email or not subject or not body:
        return False, "Missing required email fields (to_email, subject, or body)"
    
    try:
        # Create message
        msg = MIMEMultipart()
        msg['From'] = f"{from_name} <{GMAIL_USER}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        
        # Attach plain text body
        msg.attach(MIMEText(body, 'plain'))
        
        # Send via Gmail SMTP
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.send_message(msg)
        
        app.logger.info(f"Email sent successfully to {to_email}: {subject}")
        return True, "Email sent successfully"
        
    except smtplib.SMTPAuthenticationError:
        app.logger.error("SMTP Authentication failed - check GMAIL_APP_PASSWORD")
        return False, "Authentication failed: Invalid Gmail app password"
    except smtplib.SMTPException as e:
        app.logger.error(f"SMTP error sending email: {str(e)}")
        return False, f"SMTP error: {str(e)}"
    except Exception as e:
        app.logger.error(f"Unexpected error sending email: {str(e)}")
        return False, f"Error: {str(e)}"

# ==================== SQUARE API HELPER FUNCTIONS ====================

def square_api_request(endpoint, method='GET', data=None):
    """Make direct request to Square API"""
    access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
    environment = os.environ.get('SQUARE_ENVIRONMENT', 'production')
    
    if not access_token:
        return None, "SQUARE_ACCESS_TOKEN not set"
    
    if environment == 'production':
        base_url = 'https://connect.squareup.com'
    else:
        base_url = 'https://connect.squareupsandbox.com'
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
        'Square-Version': '2026-01-22'
    }
    
    url = f"{base_url}{endpoint}"
    
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

def get_terminal_devices():
    """Get list of available Square Terminal devices using direct API call"""
    result, error = square_api_request('/v2/devices')
    
    if error:
        app.logger.error(f"Failed to get terminal devices: {error}")
        return None, error
    
    devices = result.get('devices', [])
    
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
    
    if not device_id:
        devices_response = requests.get(f'{base_url}/v2/devices', headers=headers)
        if devices_response.status_code == 200:
            devices = devices_response.json().get('devices', [])
            if devices:
                full_device_id = devices[0].get('id')
                if full_device_id and full_device_id.startswith('device:'):
                    device_id = full_device_id.replace('device:', '')
                else:
                    device_id = full_device_id
                print(f"🔍 DEBUG - Got device from API: '{full_device_id}' → '{device_id}'")
    
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
                "device_id": device_id
            },
            "reference_id": reference_id or f"pigstyle_{idempotency_key[:8]}",
            "note": f"PigStyle Music: {', '.join(record_titles[:3])}{'...' if len(record_titles) > 3 else ''}"
        }
    }
    
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
    result, error = square_api_request(f'/v2/terminals/checkouts/{checkout_id}', method='GET')
    
    if error:
        app.logger.error(f"Failed to get checkout status: {error}")
        return None, error
    
    checkout = result.get('checkout', {})
    status = checkout.get('status', 'UNKNOWN')
    
    if checkout_id in square_payment_sessions:
        square_payment_sessions[checkout_id]['status'] = status
        
        if status == 'COMPLETED':
            payment_id = checkout.get('payment_ids', [None])[0]
            if payment_id:
                square_payment_sessions[checkout_id]['payment_id'] = payment_id
    
    return checkout, None

def cancel_terminal_checkout(checkout_id):
    """Cancel a pending terminal checkout"""
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

# ==================== AUTHENTICATION DECORATORS ====================

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

 

# ==================== DISCOGS ENDPOINTS ====================

@app.route('/api/discogs/auth', methods=['GET'])
def discogs_auth():
    """Start Discogs OAuth flow"""
    try:
        import discogs_client
        import traceback
        
        consumer_key = os.environ.get('DISCOGS_CONSUMER_KEY')
        consumer_secret = os.environ.get('DISCOGS_CONSUMER_SECRET')
        callback_url = os.environ.get('DISCOGS_CALLBACK_URL', f"{request.host_url.rstrip('/')}/api/discogs/callback")
        
        app.logger.info("=== DISCOGS AUTH START ===")
        app.logger.info(f"Consumer Key present: {bool(consumer_key)}")
        app.logger.info(f"Consumer Secret present: {bool(consumer_secret)}")
        app.logger.info(f"Callback URL: {callback_url}")
        app.logger.info(f"Request host_url: {request.host_url}")
        
        if not consumer_key or not consumer_secret:
            app.logger.error("Discogs credentials not configured")
            return jsonify({
                'error': 'Discogs credentials not configured',
                'debug': {
                    'has_key': bool(consumer_key),
                    'has_secret': bool(consumer_secret)
                }
            }), 500
        
        # Initialize client
        d = discogs_client.Client(
            'PigStyleMusic/1.0',
            consumer_key=consumer_key,
            consumer_secret=consumer_secret
        )
        
        # Get request token and authorization URL
        request_token, request_token_secret, auth_url = d.get_authorize_url(callback_url=callback_url)
        
        app.logger.info(f"Got request token: {request_token[:10]}...")
        app.logger.info(f"Got auth URL: {auth_url}")
        
        # Store in session
        session['discogs_request_token'] = request_token
        session['discogs_request_token_secret'] = request_token_secret
        
        # Force session save
        session.modified = True
        
        app.logger.info(f"Stored tokens in session. Session keys: {list(session.keys())}")
        
        return jsonify({
            'success': True,
            'auth_url': auth_url,
            'debug': {
                'callback_url': callback_url,
                'session_stored': True
            }
        })
        
    except Exception as e:
        app.logger.error(f"Discogs auth error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/discogs/callback', methods=['GET'])
def discogs_callback():
    """OAuth callback after user authorizes"""
    try:
        import discogs_client
        import traceback
        
        verifier = request.args.get('oauth_verifier')
        if not verifier:
            app.logger.error("No verifier provided in callback")
            return jsonify({'error': 'No verifier provided'}), 400
        
        # Get stored request token
        request_token = session.get('discogs_request_token')
        request_token_secret = session.get('discogs_request_token_secret')
        
        if not request_token or not request_token_secret:
            app.logger.error("No request token found in session")
            return jsonify({'error': 'No request token found'}), 400
        
        consumer_key = os.environ.get('DISCOGS_CONSUMER_KEY')
        consumer_secret = os.environ.get('DISCOGS_CONSUMER_SECRET')
        
        # Initialize client with request token
        d = discogs_client.Client(
            'PigStyleMusic/1.0',
            consumer_key=consumer_key,
            consumer_secret=consumer_secret,
            token=request_token,
            secret=request_token_secret
        )
        
        # Get access token - try with just the verifier
        access_token, access_token_secret = d.get_access_token(verifier)
        
        # Store access token in session
        session['discogs_access_token'] = {
            'oauth_token': access_token,
            'oauth_token_secret': access_token_secret
        }
        
        # Get username for display
        d = discogs_client.Client(
            'PigStyleMusic/1.0',
            consumer_key=consumer_key,
            consumer_secret=consumer_secret,
            token=access_token,
            secret=access_token_secret
        )
        user = d.identity()
        
        # Clean up
        session.pop('discogs_request_token', None)
        session.pop('discogs_request_token_secret', None)
        
        app.logger.info(f"Discogs authentication successful for user: {user.username}")
        
        # Redirect back to admin panel Discogs tab
        return redirect('http://localhost:8000/admin#discogs')
        
    except Exception as e:
        app.logger.error(f"Discogs callback error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/discogs/check-auth', methods=['GET'])
def check_discogs_auth():
    """Check if user is authenticated with Discogs"""
    return jsonify({
        'authenticated': 'discogs_access_token' in session
    })


@app.route('/api/discogs/logout', methods=['POST'])
def discogs_logout():
    """Clear Discogs authentication"""
    session.pop('discogs_access_token', None)
    return jsonify({'success': True})


def get_discogs_client():
    """Get authenticated Discogs client from session"""
    access_token = session.get('discogs_access_token')
    if not access_token:
        return None
    
    consumer_key = os.environ.get('DISCOGS_CONSUMER_KEY')
    consumer_secret = os.environ.get('DISCOGS_CONSUMER_SECRET')
    
    d = discogs_client.Client(
        'PigStyleMusic/1.0',
        consumer_key=consumer_key,
        consumer_secret=consumer_secret,
        token=access_token['oauth_token'],
        secret=access_token['oauth_token_secret']
    )
    return d


def require_discogs_auth(f):
    """Decorator to require Discogs authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'discogs_access_token' not in session:
            return jsonify({
                'error': 'Not authenticated with Discogs',
                'auth_required': True
            }), 401
        return f(*args, **kwargs)
    return decorated_function

 
@app.route('/api/discogs/create-listing-single', methods=['POST'])
def create_discogs_listing_single():
    """Create a single listing on Discogs with dynamic markup based on record age"""
    try:
        data = request.json
        record = data.get('record', {})
        
        if not record:
            return jsonify({'error': 'No record provided'}), 400
        
        if not record.get('media_condition') or record['media_condition'].strip() == '':
            return jsonify({'success': False, 'error': 'media_condition is required'}), 400
        
        if not record.get('sleeve_condition') or record['sleeve_condition'].strip() == '':
            return jsonify({'success': False, 'error': 'sleeve_condition is required'}), 400
        
        TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
        if not TOKEN:
            return jsonify({'success': False, 'error': 'Discogs token not configured'}), 500
        
        # Get the full record from database to access created_at and store_price
        conn = get_db()
        cursor = conn.cursor()
        # Only select columns that exist - NO discogs_listing_id
        cursor.execute('SELECT created_at, store_price FROM records WHERE id = ?', (record['id'],))
        db_record = cursor.fetchone()
        conn.close()
        
        if not db_record:
            return jsonify({'success': False, 'error': f'Record #{record["id"]} not found'}), 404
        
        # Calculate dynamic markup based on record age
        markup_info = calculate_markup_for_record(db_record['created_at'], db_record['store_price'])
        
        discogs_price = markup_info['discogs_price']
        markup_percent = markup_info['markup_percent']
        days_old = markup_info['days_old']
        
        headers = {
            'Authorization': f'Discogs token={TOKEN}',
            'User-Agent': 'PigStyleMusic/1.0'
        }
        
        # Search for release
        search_url = "https://api.discogs.com/database/search"
        target_catalog = record.get('catalog_number', '')
        target_artist = record.get('artist', '')
        target_title = record.get('title', '')
        
        if not target_catalog:
            return jsonify({'success': False, 'error': 'catalog_number is required for search'}), 400
        
        search_query_parts = []
        if target_artist:
            search_query_parts.append(target_artist)
        if target_title:
            search_query_parts.append(target_title)
        if target_catalog:
            search_query_parts.append(target_catalog)
        
        search_query = ' '.join(search_query_parts)
        
        search_params = {
            'q': search_query,
            'type': 'release',
            'per_page': 50
        }
        
        search_response = requests.get(search_url, headers=headers, params=search_params)
        
        if search_response.status_code != 200:
            app.logger.error(f"Search failed: {search_response.status_code}")
            return jsonify({'success': False, 'error': f'Search failed: {search_response.status_code}'}), search_response.status_code
        
        search_data = search_response.json()
        all_releases = search_data.get('results', [])
        
        # Find exact match
        exact_matches = []
        target_normalized_catno = target_catalog.replace(' ', '').replace('-', '').replace('–', '').strip().lower()
        target_artist_lower = target_artist.strip().lower() if target_artist else ''
        target_title_lower = target_title.strip().lower() if target_title else ''
        
        for release in all_releases:
            release_catno = release.get('catno', '')
            release_title = release.get('title', '')
            release_artist = release.get('artist', '')
            
            release_normalized_catno = release_catno.replace(' ', '').replace('-', '').replace('–', '').strip().lower()
            catalog_matches = release_normalized_catno == target_normalized_catno
            
            artist_matches = False
            if target_artist_lower:
                artist_matches = (target_artist_lower in release_artist.lower() or 
                                 target_artist_lower in release_title.lower())
            
            title_matches = False
            if target_title_lower:
                title_matches = target_title_lower in release_title.lower()
            
            if catalog_matches and (artist_matches or title_matches):
                exact_matches.append(release)
        
        if not exact_matches:
            # Return more helpful error message
            return jsonify({
                'success': False, 
                'error': f'No exact match found for catalog number "{target_catalog}".'
            }), 400
        
        selected_release = exact_matches[0]
        release_id = selected_release.get('id')
        
        # Create listing on Discogs
        listing_url_endpoint = "https://api.discogs.com/marketplace/listings"
        
        comments = f"[PIGSTYLE ID: {record['id']}]"
        if record.get('location'):
            comments += f" | Location: {record.get('location')}"
        if record.get('notes'):
            comments += f" | {record.get('notes')}"
        
        listing_data = {
            "release_id": release_id,
            "condition": record.get('media_condition'),
            "sleeve_condition": record.get('sleeve_condition'),
            "price": discogs_price,
            "status": "For Sale",
            "comments": comments
        }
        
        app.logger.info(f"Creating listing for release {release_id} at price ${discogs_price} (Record age: {days_old} days, Markup: {markup_percent}%)")
        
        listing_response = requests.post(listing_url_endpoint, headers=headers, json=listing_data)
        
        if listing_response.status_code in [200, 201]:
            listing_result = listing_response.json()
            listing_id = listing_result.get('listing_id')
            discogs_url = f"https://www.discogs.com/sell/item/{listing_id}"
            
            # NO DATABASE UPDATE - just return success
            return jsonify({
                'success': True,
                'listing_id': listing_id,
                'listing_url': discogs_url,
                'release_id': release_id,
                'price': discogs_price,
                'record_id': record['id'],
                'days_old': days_old,
                'markup_percent': markup_percent
            })
        else:
            error_text = listing_response.text[:500]
            return jsonify({
                'success': False, 
                'error': f'Discogs API error: {error_text}'
            }), listing_response.status_code
        
    except Exception as e:
        app.logger.error(f"Error creating listing: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500
 
 # ==================== ADMIN ORDERS ENDPOINTS ====================

@app.route('/api/admin/orders', methods=['GET', 'OPTIONS'])
def get_admin_orders():
    """Get all orders for admin panel"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        status = request.args.get('status', 'all')
        search = request.args.get('search', '').strip()
        
        offset = (page - 1) * per_page
        
        conn = get_db()
        cursor = conn.cursor()
        
        # FIXED: Removed the problematic GROUP BY - get item_count separately if needed
        query = '''
            SELECT o.*
            FROM orders o
            WHERE 1=1
        '''
        params = []
        
        if status != 'all':
            query += ' AND o.order_status = ?'
            params.append(status)
        
        if search:
            query += ' AND (o.order_number LIKE ? OR o.customer_name LIKE ? OR o.customer_email LIKE ?)'
            search_term = f'%{search}%'
            params.extend([search_term, search_term, search_term])
        
        query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?'
        params.extend([per_page, offset])
        
        cursor.execute(query, params)
        orders = cursor.fetchall()
        
        # Get total count separately
        count_query = 'SELECT COUNT(*) as total FROM orders WHERE 1=1'
        count_params = []
        if status != 'all':
            count_query += ' AND order_status = ?'
            count_params.append(status)
        
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['total']
        
        conn.close()
        
        orders_list = []
        for order in orders:
            order_dict = dict(order)
            # Get item count for each order
            conn2 = get_db()
            cur2 = conn2.cursor()
            cur2.execute('SELECT COUNT(*) as item_count FROM order_items WHERE order_id = ?', (order_dict['id'],))
            item_count = cur2.fetchone()['item_count']
            conn2.close()
            order_dict['item_count'] = item_count
            orders_list.append(order_dict)
        
        return jsonify({
            'status': 'success',
            'orders': orders_list,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page if total > 0 else 1
        })
        
    except Exception as e:
        app.logger.error(f"Error getting admin orders: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== ADMIN ORDERS DETAIL ENDPOINTS ====================

@app.route('/api/admin/orders/<order_id>', methods=['GET', 'OPTIONS'])
@login_required
@role_required(['admin'])
def get_admin_order_detail(order_id):
    """Get detailed order information"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM orders WHERE id = ?', (order_id,))
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Order not found'}), 404
        
        cursor.execute('SELECT * FROM order_items WHERE order_id = ?', (order_id,))
        items = cursor.fetchall()
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'order': dict(order),
            'items': [dict(item) for item in items]
        })
        
    except Exception as e:
        app.logger.error(f"Error getting order detail: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/admin/orders/<order_id>/status', methods=['PUT', 'OPTIONS'])
@login_required
@role_required(['admin'])
def update_order_status(order_id):
    """Update order status"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    
    try:
        data = request.json
        new_status = data.get('status')
        
        if not new_status:
            return jsonify({'status': 'error', 'error': 'Status required'}), 400
        
        valid_statuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']
        if new_status not in valid_statuses:
            return jsonify({'status': 'error', 'error': f'Invalid status. Must be one of: {valid_statuses}'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('UPDATE orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (new_status, order_id))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Order not found'}), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': f'Order status updated to {new_status}'})
        
    except Exception as e:
        app.logger.error(f"Error updating order status: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/admin/orders/stats', methods=['GET', 'OPTIONS'])
def get_admin_orders_stats():
    """Get order statistics for admin panel"""
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 200
    
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Total orders
        cursor.execute('SELECT COUNT(*) as total FROM orders')
        total = cursor.fetchone()['total']
        
        # Total revenue from paid orders
        cursor.execute("SELECT COALESCE(SUM(total), 0) as revenue FROM orders WHERE payment_status = 'paid'")
        revenue = cursor.fetchone()['revenue']
        
        # Pending orders
        cursor.execute("SELECT COUNT(*) as pending FROM orders WHERE order_status = 'pending'")
        pending = cursor.fetchone()['pending']
        
        # Paid orders
        cursor.execute("SELECT COUNT(*) as paid FROM orders WHERE payment_status = 'paid'")
        paid = cursor.fetchone()['paid']
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'stats': {
                'total_orders': total,
                'total_revenue': float(revenue),
                'pending_orders': pending,
                'paid_orders': paid
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error getting order stats: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/stats/sales-over-time-discogs', methods=['GET'])
def get_sales_over_time_discogs_stats():
    """Get daily sales revenue for Discogs sales (status_id = 4)"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get daily sales data for Discogs listed/sold records (status_id = 4)
    cursor.execute('''
        SELECT 
            date_sold as date,
            SUM(store_price) as total_revenue
        FROM records
        WHERE status_id = 4 AND date_sold IS NOT NULL
        GROUP BY date_sold
        ORDER BY date_sold ASC
    ''')
    
    results = cursor.fetchall()
    conn.close()
    
    dates = [row['date'] for row in results]
    revenue = [float(row['total_revenue'] or 0) for row in results]
    
    return jsonify({
        'status': 'success',
        'dates': dates,
        'revenue': revenue
    })


@app.route('/api/stats/sales-over-time-all', methods=['GET'])
def get_sales_over_time_all_stats():
    """Get combined daily sales revenue for both store and Discogs sales"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get combined daily sales for status_id IN (3, 4)
    cursor.execute('''
        SELECT 
            date_sold as date,
            SUM(store_price) as total_revenue,
            COUNT(CASE WHEN status_id = 3 THEN 1 END) as store_units,
            COUNT(CASE WHEN status_id = 4 THEN 1 END) as discogs_units
        FROM records
        WHERE status_id IN (3, 4) AND date_sold IS NOT NULL
        GROUP BY date_sold
        ORDER BY date_sold ASC
    ''')
    
    results = cursor.fetchall()
    conn.close()
    
    dates = [row['date'] for row in results]
    revenue = [float(row['total_revenue'] or 0) for row in results]
    store_units = [row['store_units'] or 0 for row in results]
    discogs_units = [row['discogs_units'] or 0 for row in results]
    
    return jsonify({
        'status': 'success',
        'dates': dates,
        'revenue': revenue,
        'store_units': store_units,
        'discogs_units': discogs_units
    })

@app.route('/api/discogs/stats', methods=['GET'])
def get_discogs_stats():
    """Get Discogs inventory statistics"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Total records
        cursor.execute('SELECT COUNT(*) as total FROM records')
        total_records = cursor.fetchone()['total']
        
        # Active records (status_id = 2)
        cursor.execute('SELECT COUNT(*) as active FROM records WHERE status_id = 2')
        active_records = cursor.fetchone()['active']
        
        conn.close()
        
        return jsonify({
            'success': True,
            'stats': {
                'total_records': total_records,
                'active_records': active_records
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error in get_discogs_stats: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


 
 

@app.route('/api/discogs/search-release', methods=['POST'])
def search_discogs_release():
    """Search Discogs for a release - returns raw genre string"""
    try:
        data = request.json
        artist = data.get('artist', '')
        title = data.get('title', '')
        catalog = data.get('catalog_number', '')
        
        query = f"{artist} {title}"
        if catalog:
            query += f" {catalog}"
        
        search_url = "https://api.discogs.com/database/search"
        params = {'q': query, 'type': 'release', 'per_page': 10}
        headers = {'User-Agent': 'PigStyleMusic/1.0'}
        
        response = requests.get(search_url, params=params, headers=headers)
        
        if response.status_code != 200:
            return jsonify({'error': 'Discogs search failed'}), response.status_code
        
        data = response.json()
        results = data.get('results', [])
        
        formatted_results = []
        for result in results[:10]:
            result_title = result.get('title', '')
            result_artist = result.get('artist', '')
            
            if ' - ' in result_title and not result_artist:
                parts = result_title.split(' - ', 1)
                result_artist = parts[0]
                result_title = parts[1]
            
            # Get raw genre string (comma-separated list)
            genre_list = result.get('genre', [])
            raw_genre = ', '.join(genre_list) if genre_list else ''
            
            formatted_results.append({
                'release_id': result.get('id'),
                'title': result_title,
                'artist': result_artist,
                'year': result.get('year'),
                'format': result.get('format', [''])[0] if result.get('format') else '',
                'label': result.get('label', [''])[0] if result.get('label') else '',
                'catalog_number': result.get('catno', ''),
                'thumb': result.get('thumb', ''),
                'url': f"https://www.discogs.com/release/{result.get('id')}",
                'genre_raw': raw_genre  # Return raw genre string
            })
        
        return jsonify({'success': True, 'results': formatted_results, 'count': len(formatted_results)})
        
    except Exception as e:
        app.logger.error(f"Error searching Discogs: {str(e)}")
        return jsonify({'error': str(e)}), 500

  

# ==================== SQUARE WEBHOOK ====================

@app.route('/api/square-webhook', methods=['POST'])
def square_webhook():
    """Handle Square webhook events"""
    try:
        webhook_data = request.json
        app.logger.info(f"Square webhook received: {json.dumps(webhook_data, indent=2)}")
        return jsonify({'status': 'success', 'message': 'Webhook received'}), 200
    except Exception as e:
        app.logger.error(f"Webhook error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ==================== CHECKOUT ENDPOINTS ====================

@app.route('/api/checkout/process', methods=['POST'])
def process_checkout():
    """Create a Square payment link for either records or accessories"""
    try:
        data = request.json
        items = data.get('items', [])
        item_type = data.get('item_type', 'record')
        shipping = data.get('shipping')
        subtotal = data.get('subtotal', 0)
        total = data.get('total', 0)
        
        order_id = str(uuid.uuid4())
        date_str = datetime.now().strftime('%Y%m%d')
        random_chars = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        order_number = f"PS-{date_str}-{random_chars}"
        
        if not items or total <= 0:
            return jsonify({'status': 'error', 'error': 'Invalid cart data'}), 400
        
        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        location_id = os.environ.get('SQUARE_LOCATION_ID')
        
        if not access_token or not location_id:
            return jsonify({'status': 'error', 'error': 'Payment system not configured'}), 500
        
        line_items = []
        item_ids = []
        record_descriptions = []
        
        def trim_string(s, max_length=50):
            if not s:
                return ''
            s = str(s)
            if len(s) <= max_length:
                return s
            return s[:max_length-3] + '...'
        
        for item in items:
            if item_type == 'accessory':
                item_name = item.get('description') or item.get('title', 'Merchandise')
                barcode = item.get('bar_code') or 'NO-BARCODE'
                trimmed_name = trim_string(item_name)
                record_descriptions.append(f"{barcode} | ACC: {trimmed_name}")
                display_name = item_name
            else:
                barcode = item.get('barcode') or item.get('bar_code') or 'NO-BARCODE'
                artist = item.get('artist', 'Unknown Artist')
                title = item.get('title', 'Unknown Title')
                trimmed_artist = trim_string(artist)
                trimmed_title = trim_string(title)
                record_descriptions.append(f"{barcode} | {trimmed_artist} | {trimmed_title}")
                artist_name = item.get('artist', '')
                item_name = item.get('title', 'Unknown')
                if artist_name:
                    display_name = f"{artist_name} - {item_name}"
                else:
                    display_name = item_name
            
            line_items.append({
                "name": display_name,
                "quantity": str(item.get('quantity', 1)),
                "base_price_money": {"amount": int(round(float(item.get('price', 0)) * 100)), "currency": "USD"}
            })
            
            item_id = item.get('copy_id') or item.get('accessory_id') or item.get('id')
            if item_id:
                item_ids.append(str(item_id))
        
        if shipping and shipping.get('amount', 0) > 0:
            line_items.append({
                "name": "Shipping",
                "quantity": "1",
                "base_price_money": {"amount": int(round(shipping.get('amount', 0) * 100)), "currency": "USD"}
            })
        
        tax_amount = data.get('tax', 0)
        if tax_amount and float(tax_amount) > 0:
            line_items.append({
                "name": "Sales Tax",
                "quantity": "1",
                "base_price_money": {"amount": int(round(float(tax_amount) * 100)), "currency": "USD"}
            })
        
        formatted_note = " || ".join(record_descriptions)
        if len(formatted_note) > 500:
            formatted_note = formatted_note[:497] + "..."
        
        metadata = {'order_id': str(order_id), 'order_number': order_number, 'item_type': item_type, 'item_ids': json.dumps(item_ids)}
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        env = os.getenv("ENV", "production")
        redirect_path = '/merchandise' if item_type == 'accessory' else '/browse'
        
        if env == "development":
            redirect_url = f"http://localhost:8000{redirect_path}?status=completed&order_id={order_id}"
        else:
            redirect_url = f"https://www.pigstylemusic.com{redirect_path}?status=completed&order_id={order_id}"

        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "order": {"location_id": location_id, "line_items": line_items, "reference_id": str(order_id)},
            "payment_note": formatted_note,
            "metadata": metadata,
            "checkout_options": {"redirect_url": redirect_url}
        }
        
        square_base_url = 'https://connect.squareup.com'
        response = requests.post(f'{square_base_url}/v2/online-checkout/payment-links', headers=headers, json=payload)
        
        if response.status_code != 200:
            return jsonify({'status': 'error', 'error': 'Failed to create payment link'}), 400
        
        result = response.json()
        payment_link = result.get('payment_link', {})
        checkout_url = payment_link.get('url')
        square_order_id = payment_link.get('order_id')
        
        if not square_order_id or not checkout_url:
            return jsonify({'status': 'error', 'error': 'Missing required data from Square'}), 500
        
        if item_type == 'accessory':
            return jsonify({'status': 'success', 'checkout_url': checkout_url, 'order_id': order_id, 'order_number': order_number, 'square_order_id': square_order_id}), 200
        
        # For records, create order in database
        conn = get_db()
        cursor = conn.cursor()
        
        shipping_method = shipping.get('method', 'pickup') if shipping else 'pickup'
        shipping_cost = float(shipping.get('amount', 0)) if shipping else 0
        
        try:
            cursor.execute("BEGIN TRANSACTION")
            cursor.execute('''
                INSERT INTO orders (id, order_number, customer_name, customer_email, shipping_method,
                shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_zip,
                shipping_country, shipping_cost, subtotal, tax, total, square_checkout_id, square_order_id,
                payment_status, order_status, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ''', (order_id, order_number, data.get('customer_name', 'Walk-in Customer'), data.get('customer_email', ''),
                  shipping_method, data.get('address', ''), data.get('apt', ''), data.get('city', ''),
                  data.get('state', ''), data.get('zip', ''), data.get('country', 'USA'), shipping_cost,
                  subtotal, data.get('tax', 0), total, payment_link.get('id'), square_order_id, 'pending', 'pending', data.get('notes', '')))
            
            for item in items:
                cursor.execute('''
                    INSERT INTO order_items (order_id, record_id, record_title, record_artist, record_condition, price_at_time, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ''', (order_id, item.get('copy_id'), item.get('title'), item.get('artist'), item.get('condition'), float(item.get('price'))))
            
            conn.commit()
        except Exception as e:
            conn.rollback()
            app.logger.error(f"Error creating order: {str(e)}")
        finally:
            conn.close()
        
        return jsonify({'status': 'success', 'checkout_url': checkout_url, 'order_id': order_id, 'order_number': order_number, 'square_order_id': square_order_id}), 200
        
    except Exception as e:
        app.logger.error(f"Checkout error: {str(e)}")
        return jsonify({'status': 'error', 'error': f'Server error: {str(e)}'}), 500


@app.route('/api/order/complete', methods=['POST'])
def order_complete():
    """Update order status and mark records as sold after successful payment"""
    try:
        data = request.json
        transaction_id = data.get('transaction_id')
        order_id = data.get('order_id')
        
        if not transaction_id or not order_id:
            return jsonify({'status': 'error', 'error': 'Missing transaction_id or order_id'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        try:
            cursor.execute("BEGIN TRANSACTION")
            
            access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
            headers = {'Authorization': f'Bearer {access_token}', 'Square-Version': '2026-01-22'}
            
            payment_response = requests.get(f'https://connect.squareup.com/v2/payments/{transaction_id}', headers=headers)
            
            if payment_response.status_code == 200:
                payment_data = payment_response.json()
                payment = payment_data.get('payment', {})
                square_total = float(payment.get('amount_money', {}).get('amount', 0)) / 100
                square_tax = float(payment.get('tax_money', {}).get('amount', 0)) / 100 if payment.get('tax_money') else 0
                
                cursor.execute('''
                    UPDATE orders SET square_payment_id = ?, payment_status = 'paid', order_status = 'confirmed',
                    total = ?, tax = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status = 'pending'
                ''', (transaction_id, square_total, square_tax, order_id))
            else:
                cursor.execute('''
                    UPDATE orders SET square_payment_id = ?, payment_status = 'paid', order_status = 'confirmed',
                    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status = 'pending'
                ''', (transaction_id, order_id))
            
            cursor.execute('SELECT record_id FROM order_items WHERE order_id = ?', (order_id,))
            record_ids = [row['record_id'] for row in cursor.fetchall()]
            
            if record_ids:
                placeholders = ','.join('?' for _ in record_ids)
                cursor.execute(f'UPDATE records SET status_id = 3, date_sold = CURRENT_DATE WHERE id IN ({placeholders})', record_ids)
            
            conn.commit()
            
            # Send order confirmation email if customer email exists
            try:
                cursor.execute('SELECT customer_name, customer_email, order_number, total FROM orders WHERE id = ?', (order_id,))
                order_details = cursor.fetchone()
                
                if order_details and order_details['customer_email']:
                    email_body = f"""Thank you for your order from PigStyle Music!

Order Number: {order_details['order_number']}
Customer: {order_details['customer_name']}
Total: ${float(order_details['total']):.2f}

Your order has been confirmed and will be processed soon.

Records purchased:
"""
                    # Add record details
                    cursor.execute('SELECT record_title, record_artist, price_at_time FROM order_items WHERE order_id = ?', (order_id,))
                    items = cursor.fetchall()
                    for item in items:
                        email_body += f"  - {item['record_artist']} - {item['record_title']} (${float(item['price_at_time']):.2f})\n"
                    
                    email_body += """

Thank you for shopping at PigStyle Music!

Questions? Reply to this email or contact us at the store.

- PigStyle Music Team
"""
                    send_email(order_details['customer_email'], f"Order Confirmation - {order_details['order_number']}", email_body)
            except Exception as email_error:
                app.logger.error(f"Failed to send order confirmation email: {str(email_error)}")
                # Don't fail the order completion if email fails
            
            return jsonify({'status': 'success', 'message': f'Order completed, {len(record_ids)} records marked as sold'})
            
        except Exception as e:
            conn.rollback()
            raise
        finally:
            conn.close()
        
    except Exception as e:
        app.logger.error(f"Order complete error: {str(e)}")
        return jsonify({'status': 'error', 'error': f'Server error: {str(e)}'}), 500


# ==================== SQUARE TERMINAL ENDPOINTS ====================

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
        enhanced_devices = []
        
        for device in devices:
            device_id = device.get('id')
            attributes = device.get('attributes', {})
            device_name = attributes.get('name', 'Square Terminal')
            status_obj = device.get('status', {})
            raw_status = status_obj.get('category', 'UNKNOWN')
            
            # IMPROVED: Check actual connectivity from components
            components = device.get('components', [])
            has_active_wifi = False
            has_active_ethernet = False
            
            for component in components:
                if component.get('type') == 'WIFI':
                    wifi_details = component.get('wifi_details', {})
                    if wifi_details.get('active') == True:
                        has_active_wifi = True
                elif component.get('type') == 'ETHERNET':
                    ethernet_details = component.get('ethernet_details', {})
                    if ethernet_details.get('active') == True:
                        has_active_ethernet = True
            
            # Device is online if it has active network connection OR status is AVAILABLE
            is_online = (has_active_wifi or has_active_ethernet) or raw_status == 'AVAILABLE'
            display_status = 'ONLINE' if is_online else 'OFFLINE'
            
            enhanced_devices.append({
                'id': device_id,
                'device_name': device_name,
                'status': display_status,
                'raw_status': raw_status,
                'device_type': attributes.get('type', 'TERMINAL'),
                'manufacturer': attributes.get('manufacturer', 'Square'),
                'has_wifi': has_active_wifi,
                'has_ethernet': has_active_ethernet
            })
        
        return jsonify({'status': 'success', 'terminals': enhanced_devices}), 200
        
    except Exception as e:
        app.logger.error(f"Error in api_get_terminals: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

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
        
        if not amount_cents or not record_ids or not record_titles:
            return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
        
        result, error = create_square_terminal_checkout(amount_cents, record_ids, record_titles, reference_id, device_id)
        
        if error:
            return jsonify({'status': 'error', 'message': error}), 400
        
        return jsonify({'status': 'success', 'checkout': result.get('checkout', {})}), 200
        
    except Exception as e:
        app.logger.error(f"Error in api_create_terminal_checkout: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/square/terminal/checkout/<checkout_id>/status', methods=['GET'])
@login_required
@role_required(['admin'])
def api_get_checkout_status(checkout_id):
    """Get status of a terminal checkout"""
    try:
        result, error = get_terminal_checkout_status(checkout_id)
        
        if error:
            return jsonify({'status': 'error', 'message': error}), 400
        
        return jsonify({'status': 'success', 'checkout': result}), 200
        
    except Exception as e:
        app.logger.error(f"Error in api_get_checkout_status: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/square/terminal/checkout/<checkout_id>/cancel', methods=['POST'])
@login_required
@role_required(['admin'])
def api_cancel_checkout(checkout_id):
    """Cancel a pending terminal checkout"""
    try:
        result, error = cancel_terminal_checkout(checkout_id)
        
        if error:
            return jsonify({'status': 'error', 'message': error}), 400
        
        return jsonify({'status': 'success', 'result': result}), 200
        
    except Exception as e:
        app.logger.error(f"Error in api_cancel_checkout: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/square/payment/<payment_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def api_get_payment(payment_id):
    """Get payment details"""
    try:
        payment, error = get_payment_details(payment_id)
        
        if error:
            return jsonify({'status': 'error', 'message': error}), 400
        
        return jsonify({'status': 'success', 'payment': payment}), 200
        
    except Exception as e:
        app.logger.error(f"Error in api_get_payment: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/square/terminal/session/<checkout_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def api_get_checkout_session(checkout_id):
    """Get stored checkout session information"""
    try:
        if checkout_id in square_payment_sessions:
            return jsonify({'status': 'success', 'session': square_payment_sessions[checkout_id]}), 200
        else:
            return jsonify({'status': 'error', 'message': 'Session not found'}), 404
            
    except Exception as e:
        app.logger.error(f"Error in api_get_checkout_session: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ==================== TEST SQUARE CONNECTION ====================

@app.route('/test-square', methods=['GET'])
def test_square():
    """Test Square API connection and list available devices"""
    result = []
    devices, error = get_terminal_devices()
    
    if error:
        result.append(f"Error: {error}")
    else:
        result.append(f"Successfully connected to Square API")
        result.append(f"Found {len(devices)} terminal device(s)")
        for device in devices:
            result.append(f"  Device ID: {device.get('id')}")
            result.append(f"  Device Name: {device.get('device_name')}")
            result.append(f"  Status: {device.get('status')}")
    
    return jsonify({"status": "success" if not error else "error", "results": result})


# ==================== PRINTING ENDPOINTS ====================

@app.route('/print-receipt', methods=['POST'])
def print_receipt():
    """Send receipt data to thermal printer"""
    data = request.get_json()
    
    if not data or 'printer' not in data or 'data' not in data:
        return jsonify({'status': 'error', 'message': 'Missing printer or data'}), 400
    
    printer_path = data['printer']
    receipt_data = data['data']
    
    try:
        with open(printer_path, 'wb') as printer:
            printer.write(receipt_data.encode('utf-8'))
            printer.flush()
        
        return jsonify({'status': 'success', 'message': 'Receipt sent to printer', 'printer': printer_path})
        
    except PermissionError:
        try:
            subprocess.run(['sudo', 'chmod', '666', printer_path], check=False)
            with open(printer_path, 'wb') as printer:
                printer.write(receipt_data.encode('utf-8'))
                printer.flush()
            return jsonify({'status': 'success', 'message': 'Receipt sent to printer (permission fixed)', 'printer': printer_path})
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'Permission denied: {str(e)}'}), 500
    except FileNotFoundError:
        return jsonify({'status': 'error', 'message': f'Printer not found at {printer_path}'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Print error: {str(e)}'}), 500


@app.route('/print-test', methods=['POST'])
def print_test():
    """Send a simple test page to the printer"""
    test_data = {
        'printer': '/dev/usb/lp2',
        'data': '\x1B\x40' + '\x1B\x61\x01' + 'PigStyle Music\nTest Page\n' + ''.ljust(32, '=') + '\n' + '\x1B\x61\x00' + 'Date: ' + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + '\nStatus: Working!\n\n\n\n'
    }
    return print_receipt.__wrapped__(test_data)


@app.route('/printers', methods=['GET'])
def list_printers():
    """List all USB printers connected to the system"""
    import glob
    printers = glob.glob('/dev/usb/lp*')
    
    result = []
    for printer in printers:
        try:
            result.append({'path': printer, 'available': os.path.exists(printer), 'writable': os.access(printer, os.W_OK)})
        except:
            result.append({'path': printer, 'available': True, 'writable': False})
    
    return jsonify({'status': 'success', 'printers': result})


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

        required_fields = ['username', 'password']
        for field in required_fields:
            if field not in data:
                return jsonify({'status': 'error', 'error': f'{field} required'}), 400

        username = data['username']
        password = data['password']

        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('SELECT id, username, email, password_hash, role, full_name, store_credit_balance FROM users WHERE username = ?', (username,))
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

        cursor.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', (user['id'],))
        conn.commit()
        conn.close()

        session['user_id'] = user['id']
        session['username'] = user['username']
        session['role'] = user['role']
        session['logged_in'] = True
        
        user_data = {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'role': user['role'],
            'full_name': user['full_name'],
            'store_credit_balance': float(user['store_credit_balance']) if user['store_credit_balance'] is not None else 0.0
        }
        
        response = jsonify({'status': 'success', 'message': 'Login successful', 'user': user_data})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response

    except Exception as e:
        app.logger.error(f"Login error: {str(e)}")
        response = jsonify({'status': 'error', 'error': f'Server error: {str(e)}'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 500


@app.route('/logout', methods=['POST'])
def logout():
    """Log out the current user"""
    session.clear()
    response = jsonify({'status': 'success', 'message': 'Logged out successfully'})
    response.set_cookie('session', '', expires=0, max_age=0, path='/', httponly=True, samesite='Lax')
    return response


@app.route('/session/check', methods=['GET'])
def check_session():
    """Check if user is logged in and return session info"""
    if 'user_id' in session and session.get('logged_in'):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, username, email, role, full_name, store_credit_balance FROM users WHERE id = ?', (session['user_id'],))
        user = cursor.fetchone()
        conn.close()
        
        if user:
            return jsonify({
                'status': 'success',
                'logged_in': True,
                'user': {
                    'id': user['id'],
                    'username': user['username'],
                    'email': user['email'],
                    'role': user['role'],
                    'full_name': user['full_name'],
                    'store_credit_balance': float(user['store_credit_balance']) if user['store_credit_balance'] is not None else 0.0
                }
            })
    
    return jsonify({'status': 'success', 'logged_in': False, 'user': None})


# ==================== YOUTUBE ENDPOINTS ====================

@app.route('/api/youtube/status', methods=['GET'])
def youtube_status():
    """Check if YouTube API is configured"""
    youtube_api_key = os.environ.get('YOUTUBE_API_KEY')
    return jsonify({'status': 'success', 'configured': bool(youtube_api_key)})


@app.route('/api/youtube/search', methods=['POST'])
def youtube_search():
    """Proxy YouTube API search"""
    try:
        data = request.get_json()
        query = data.get('query')
        
        if not query:
            return jsonify({'status': 'error', 'error': 'Search query required'}), 400
        
        youtube_api_key = os.environ.get('YOUTUBE_API_KEY')
        if not youtube_api_key:
            return jsonify({'status': 'error', 'error': 'YouTube API not configured'}), 503
        
        search_url = "https://www.googleapis.com/youtube/v3/search"
        params = {
            'part': 'snippet',
            'q': query,
            'type': 'video',
            'maxResults': 20,
            'videoEmbeddable': 'true',
            'videoDuration': 'short',
            'order': 'relevance',
            'key': youtube_api_key
        }
        
        response = requests.get(search_url, params=params)
        
        if response.status_code != 200:
            return jsonify({'status': 'error', 'error': f'YouTube API error: {response.status_code}'}), response.status_code
        
        data = response.json()
        results = []
        
        for item in data.get('items', []):
            video_id = item.get('id', {}).get('videoId')
            if not video_id:
                continue
            snippet = item.get('snippet', {})
            results.append({
                'title': snippet.get('title', ''),
                'channel': snippet.get('channelTitle', ''),
                'url': f"https://www.youtube.com/watch?v={video_id}",
                'video_id': video_id,
                'thumbnail': snippet.get('thumbnails', {}).get('default', {}).get('url', '')
            })
        
        return jsonify({'status': 'success', 'results': results})
        
    except Exception as e:
        app.logger.error(f"YouTube search error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== USER MANAGEMENT ENDPOINTS ====================

@app.route('/users', methods=['POST'])
def create_user():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400

    if 'username' not in data or 'role' not in data:
        return jsonify({'status': 'error', 'error': 'username and role required'}), 400

    username = data['username']
    role = data['role']
    
    if role not in ['admin', 'consignor', 'youtube_linker', 'seller']:
        return jsonify({'status': 'error', 'error': 'Invalid role'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Username already exists'}), 400

    full_name = data.get('full_name', '')
    initials = data.get('initials', '')
    flag_color = data.get('flag_color', '')
    email = data.get('email', '')
    password = data.get('password', '')

    if role != 'seller' and not password:
        conn.close()
        return jsonify({'status': 'error', 'error': 'Password required for this role'}), 400

    if password:
        salt = secrets.token_hex(16)
        password_hash = f"{salt}${hashlib.sha256((salt + password).encode()).hexdigest()}"
    else:
        password_hash = None

    cursor.execute('''
        INSERT INTO users (username, email, password_hash, role, full_name, initials, flag_color, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ''', (username, email if email else None, password_hash, role, full_name, initials, flag_color if flag_color else None))

    user_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'message': 'User created successfully', 'user_id': user_id})


@app.route('/users', methods=['GET'])
def get_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, username, email, role, full_name, phone, address, created_at, last_login, store_credit_balance, initials, is_active FROM users ORDER BY username')
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
            'is_active': bool(user['is_active']) if user['is_active'] is not None else True
        })

    return jsonify({'status': 'success', 'count': len(users_list), 'users': users_list})


@app.route('/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, username, email, full_name, phone, address, role, created_at, last_login, store_credit_balance, initials, is_active FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()

    if user:
        return jsonify({
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'full_name': user['full_name'],
            'phone': user['phone'],
            'address': user['address'],
            'role': user['role'],
            'created_at': user['created_at'],
            'last_login': user['last_login'],
            'store_credit_balance': float(user['store_credit_balance']) if user['store_credit_balance'] is not None else 0.0,
            'initials': user['initials'],
            'is_active': bool(user['is_active']) if user['is_active'] is not None else True
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

    allowed_fields = ['store_credit_balance', 'full_name', 'phone', 'address', 'payout_requested']
    update_fields = []
    update_values = []

    for key, value in data.items():
        if key in allowed_fields:
            update_fields.append(f"{key} = ?")
            update_values.append(value)

    if not update_fields:
        conn.close()
        return jsonify({'status': 'error', 'error': 'No valid fields to update'}), 400

    update_values.append(user_id)
    cursor.execute(f"UPDATE users SET {', '.join(update_fields)} WHERE id = ?", update_values)
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
    cursor.execute('UPDATE users SET password_hash = ? WHERE id = ?', (password_hash, user_id))
    conn.commit()
    conn.close()

    return jsonify({'status': 'success', 'message': 'Password reset successfully'})


@app.route('/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    if not session.get('logged_in') or session.get('role') != 'admin':
        return jsonify({'status': 'error', 'error': 'Admin access required'}), 403
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, username FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'status': 'error', 'error': 'User not found'}), 404
    
    cursor.execute('SELECT COUNT(*) as count FROM records WHERE consignor_id = ?', (user_id,))
    records_count = cursor.fetchone()['count']
    
    if records_count > 0:
        conn.close()
        return jsonify({'status': 'error', 'error': f'Cannot delete user with {records_count} existing records'}), 400
    
    cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success', 'message': f'User {user["username"]} deleted successfully'})


# ==================== GENRE-RELATED ENDPOINTS REMOVED ====================
# The following endpoints have been removed:
# - GET /artist-genre
# - GET /artist-genre/<artist_name>
# - POST /artist-genre
# - PUT /artist-genre/<artist_name>
# - GET /artist-genre/genre/<int:genre_id>
# - GET /genres
# - POST /genres
# - GET /genres/by-name/<genre_name>
# - GET /artists/with-genres (modified below to return artists without genre)

# ==================== ARTISTS ENDPOINT (MODIFIED - NO GENRES) ====================

@app.route('/artists', methods=['GET'])
def get_artists():
    """Get all unique artists from records (no genre mapping)"""
    search_term = request.args.get('search', '')
    conn = get_db()
    cursor = conn.cursor()
    if search_term:
        cursor.execute('SELECT DISTINCT artist FROM records WHERE artist LIKE ? ORDER BY artist', (f'%{search_term}%',))
    else:
        cursor.execute('SELECT DISTINCT artist FROM records ORDER BY artist')
    artists = cursor.fetchall()
    conn.close()
    return jsonify({'status': 'success', 'artists': [dict(artist) for artist in artists]})


# ==================== RECORDS ENDPOINTS (ALL MODIFIED - NO GENRE JOINS) ====================

@app.route('/records', methods=['POST'])
def create_record():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400
    
    required_fields = ['artist', 'title', 'store_price']
    for field in required_fields:
        if field not in data:
            return jsonify({'status': 'error', 'error': f'{field} required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        consignor_id = data.get('consignor_id')
        commission_rate = data.get('commission_rate')
        status_id = data.get('status_id', 1)
        
        condition_sleeve_id = data.get('condition_sleeve_id')
        condition_disc_id = data.get('condition_disc_id')
        
        if not condition_sleeve_id and data.get('condition'):
            cursor.execute('SELECT id FROM d_condition WHERE condition_name = ?', (data.get('condition'),))
            result = cursor.fetchone()
            if result:
                condition_sleeve_id = result['id']
                condition_disc_id = result['id']
        
        # Get discogs_genre_raw if provided
        discogs_genre_raw = data.get('discogs_genre_raw', '')
        
        cursor.execute('''
            INSERT INTO records (
                artist, title, barcode, image_url, catalog_number,
                condition_sleeve_id, condition_disc_id, store_price, youtube_url, 
                consignor_id, commission_rate, status_id, discogs_genre_raw, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (
            data.get('artist'), 
            data.get('title'), 
            data.get('barcode', ''), 
            data.get('image_url', ''), 
            data.get('catalog_number', ''), 
            condition_sleeve_id,
            condition_disc_id, 
            float(data.get('store_price', 0.0)), 
            data.get('youtube_url', ''),
            consignor_id, 
            float(commission_rate) if commission_rate else None, 
            int(status_id),
            discogs_genre_raw
        ))
        
        record_id = cursor.lastrowid
        conn.commit()
        
        cursor.execute('''
            SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name,
            cd.condition_name as disc_condition_name 
            FROM records r 
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id 
            WHERE r.id = ?
        ''', (record_id,))
        
        record = cursor.fetchone()
        return jsonify({
            'status': 'success', 
            'record': dict(record) if record else {}, 
            'message': f'Record added successfully with ID: {record_id}'
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({'status': 'error', 'error': f"Database error: {str(e)}"}), 500
    finally:
        conn.close()


@app.route('/records', methods=['GET'])
def get_records():
    conn = get_db()
    cursor = conn.cursor()
    
    random_order = request.args.get('random', 'false').lower() == 'true'
    limit = request.args.get('limit', type=int)
    has_youtube = request.args.get('has_youtube', 'false').lower() == 'true'
    status_id = request.args.get('status_id', type=int)
    status_ids = request.args.get('status_ids', '')
    created_after = request.args.get('created_after')
    search = request.args.get('search', '').strip()
    
    require_image = request.args.get('require_image', 'false').lower() == 'true'
    require_location = request.args.get('require_location', 'false').lower() == 'true'
    exclude_old_no_location = request.args.get('exclude_old_no_location', 'false').lower() == 'true'
    
    bypass_date_filter = request.args.get('bypass_date_filter', 'false').lower() == 'true'
    
    query = '''
        SELECT 
            r.id, r.artist, r.title, r.barcode, r.image_url, r.catalog_number,
            r.condition_sleeve_id, r.condition_disc_id, r.store_price, r.youtube_url,
            r.consignor_id, r.commission_rate, r.status_id, r.created_at, r.date_sold,
            r.last_seen, r.location, r.notes, r.discogs_genre_raw,r.cogs,
            s.status_name,
            cs.condition_name as sleeve_condition_name, cs.display_name as sleeve_display,
            cs.abbreviation as sleeve_abbr, cs.quality_index as sleeve_quality,
            cd.condition_name as disc_condition_name, cd.display_name as disc_display,
            cd.abbreviation as disc_abbr, cd.quality_index as disc_quality
        FROM records r
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.artist IS NOT NULL AND r.title IS NOT NULL 
        AND r.artist != '' AND r.title != ''
    '''
    
    params = []
    
    # Handle status filtering
    if status_ids:
        status_list = [int(s.strip()) for s in status_ids.split(',') if s.strip()]
        if status_list:
            placeholders = ','.join('?' for _ in status_list)
            query += f' AND r.status_id IN ({placeholders})'
            params.extend(status_list)
    elif status_id is not None:
        query += ' AND r.status_id = ?'
        params.append(status_id)
    
    # Apply search filter if provided
    if search:
        query += ' AND (r.artist LIKE ? OR r.title LIKE ?)'
        search_term = f'%{search}%'
        params.extend([search_term, search_term])
    else:
        # Only apply 7-day filter if bypass_date_filter is NOT true
        if not bypass_date_filter and not created_after:
            seven_days_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            query += ' AND date(r.created_at) >= ?'
            params.append(seven_days_ago)
        elif created_after:
            query += ' AND date(r.created_at) >= ?'
            params.append(created_after)
        # If bypass_date_filter is true, don't add any date filter
    
    if has_youtube:
        query += ' AND (r.youtube_url LIKE "%youtube.com%" OR r.youtube_url LIKE "%youtu.be%")'
    
    if require_image:
        query += ' AND r.image_url IS NOT NULL AND r.image_url != \'\''
    
    if require_location:
        query += ' AND r.location IS NOT NULL AND r.location != \'\' AND r.location != \'NULL\''
    
    if exclude_old_no_location:
        query += ''' AND (r.created_at >= date('now', '-30 days') 
                     OR (r.location IS NOT NULL AND r.location != '' AND r.location != 'NULL')) '''
    
    # Order by newest first
    query += ' ORDER BY r.created_at DESC'
    
    if limit:
        query += ' LIMIT ?'
        params.append(limit)
    
    cursor.execute(query, params)
    records = cursor.fetchall()
    conn.close()
    
    records_list = []
    for record in records:
        record_dict = dict(record)
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)
    
    return jsonify({'status': 'success', 'count': len(records_list), 'records': records_list})


@app.route('/records/<int:record_id>', methods=['GET'])
def get_record(record_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name,
        cd.condition_name as disc_condition_name 
        FROM records r
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.id = ?
    ''', (record_id,))
    record = cursor.fetchone()
    conn.close()
    if not record:
        return jsonify({'status': 'error', 'error': 'Record not found'}), 404
    return jsonify(dict(record))

@app.route('/api/stats/last-seen-distribution', methods=['GET'])
def get_last_seen_distribution_stats():
    """Get distribution of active records by weeks since last seen"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get active records (status_id = 2) with non-null last_seen
    cursor.execute('''
        SELECT last_seen
        FROM records
        WHERE status_id = 2 AND last_seen IS NOT NULL
    ''')
    
    records = cursor.fetchall()
    conn.close()
    
    today = datetime.now().date()
    
    # Dictionary to store counts by week number
    week_counts = {}
    
    for record in records:
        last_seen_str = record['last_seen']
        try:
            # Parse last_seen date
            if isinstance(last_seen_str, str):
                last_seen = datetime.strptime(last_seen_str.split('T')[0], '%Y-%m-%d').date()
            else:
                last_seen = last_seen_str
            
            # Calculate days since last seen
            days_ago = (today - last_seen).days
            
            # Calculate weeks since last seen (floor division)
            weeks_ago = days_ago // 7
            
            # Increment count for this week number
            week_counts[weeks_ago] = week_counts.get(weeks_ago, 0) + 1
            
        except Exception as e:
            app.logger.error(f"Error parsing last_seen date {last_seen_str}: {e}")
            continue
    
    # If no data, return empty
    if not week_counts:
        return jsonify({
            'status': 'success',
            'week_numbers': [],
            'counts': []
        })
    
    # Get the maximum week number
    max_week = max(week_counts.keys())
    
    # Build complete arrays from week 0 to max_week
    week_numbers = list(range(max_week + 1))
    counts = [week_counts.get(week, 0) for week in week_numbers]
    
    return jsonify({
        'status': 'success',
        'week_numbers': week_numbers,
        'counts': counts
    })
# ==================== INVENTORY PURCHASES ENDPOINTS ====================

# Create upload folder for bills of sale if not exists
BILLS_UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'bills')
os.makedirs(BILLS_UPLOAD_FOLDER, exist_ok=True)

@app.route('/api/inventory-purchases', methods=['GET'])
@login_required
@role_required(['admin'])
def get_inventory_purchases():
    """Get all inventory purchases with optional filtering"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get filter parameters
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        seller_name = request.args.get('seller_name', '').strip()
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        query = '''
            SELECT 
                id,
                purchase_date,
                seller_name,
                seller_contact,
                amount_spent,
                description,
                bill_of_sale_path,
                created_at,
                updated_at
            FROM inventory_purchases
            WHERE 1=1
        '''
        params = []
        
        if start_date:
            query += ' AND purchase_date >= ?'
            params.append(start_date)
        
        if end_date:
            query += ' AND purchase_date <= ?'
            params.append(end_date)
        
        if seller_name:
            query += ' AND seller_name LIKE ?'
            params.append(f'%{seller_name}%')
        
        query += ' ORDER BY purchase_date DESC, created_at DESC LIMIT ? OFFSET ?'
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        purchases = cursor.fetchall()
        
        # Get total count
        count_query = '''
            SELECT COUNT(*) as total FROM inventory_purchases WHERE 1=1
        '''
        count_params = []
        if start_date:
            count_query += ' AND purchase_date >= ?'
            count_params.append(start_date)
        if end_date:
            count_query += ' AND purchase_date <= ?'
            count_params.append(end_date)
        if seller_name:
            count_query += ' AND seller_name LIKE ?'
            count_params.append(f'%{seller_name}%')
        
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['total']
        
        conn.close()
        
        purchases_list = []
        for purchase in purchases:
            purchase_dict = dict(purchase)
            # Convert amount to float for JSON
            purchase_dict['amount_spent'] = float(purchase_dict['amount_spent'])
            purchases_list.append(purchase_dict)
        
        return jsonify({
            'status': 'success',
            'purchases': purchases_list,
            'total': total,
            'limit': limit,
            'offset': offset
        })
        
    except Exception as e:
        app.logger.error(f"Error getting inventory purchases: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/inventory-purchases', methods=['POST'])
@login_required
@role_required(['admin'])
def create_inventory_purchase():
    """Create a new inventory purchase record"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        # Validate required fields
        if 'amount_spent' not in data:
            return jsonify({'status': 'error', 'error': 'amount_spent is required'}), 400
        
        amount_spent = float(data['amount_spent'])
        if amount_spent <= 0:
            return jsonify({'status': 'error', 'error': 'amount_spent must be greater than 0'}), 400
        
        purchase_date = data.get('purchase_date', datetime.now().strftime('%Y-%m-%d'))
        seller_name = data.get('seller_name', '').strip()
        seller_contact = data.get('seller_contact', '').strip()
        description = data.get('description', '').strip()
        bill_of_sale_path = data.get('bill_of_sale_path', '').strip()
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO inventory_purchases (
                purchase_date, seller_name, seller_contact, amount_spent, 
                description, bill_of_sale_path
            ) VALUES (?, ?, ?, ?, ?, ?)
        ''', (purchase_date, seller_name, seller_contact, amount_spent, description, bill_of_sale_path))
        
        purchase_id = cursor.lastrowid
        conn.commit()
        
        # Fetch the created record
        cursor.execute('''
            SELECT id, purchase_date, seller_name, seller_contact, amount_spent, 
                   description, bill_of_sale_path, created_at, updated_at
            FROM inventory_purchases WHERE id = ?
        ''', (purchase_id,))
        
        new_purchase = cursor.fetchone()
        conn.close()
        
        purchase_dict = dict(new_purchase)
        purchase_dict['amount_spent'] = float(purchase_dict['amount_spent'])
        
        return jsonify({
            'status': 'success',
            'message': 'Inventory purchase recorded successfully',
            'purchase': purchase_dict
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error creating inventory purchase: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/inventory-purchases/upload-bill', methods=['POST'])
@login_required
@role_required(['admin'])
def upload_bill_of_sale():
    """Upload a bill of sale image for an inventory purchase"""
    try:
        if 'bill_image' not in request.files:
            return jsonify({'status': 'error', 'error': 'No image file provided'}), 400
        
        file = request.files['bill_image']
        
        if file.filename == '':
            return jsonify({'status': 'error', 'error': 'No file selected'}), 400
        
        # Check file extension
        allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'}
        file_ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        
        if file_ext not in allowed_extensions:
            return jsonify({'status': 'error', 'error': f'File type not allowed. Allowed: {", ".join(allowed_extensions)}'}), 400
        
        # Generate unique filename
        import uuid
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_id = uuid.uuid4().hex[:8]
        filename = f"bill_{timestamp}_{unique_id}.{file_ext}"
        
        filepath = os.path.join(BILLS_UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        # Return the relative URL path
        file_url = f"/static/uploads/bills/{filename}"
        
        return jsonify({
            'status': 'success',
            'message': 'Bill of sale uploaded successfully',
            'file_path': file_url,
            'filename': filename
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error uploading bill of sale: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/inventory-purchases/<int:purchase_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def get_inventory_purchase(purchase_id):
    """Get a single inventory purchase by ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, purchase_date, seller_name, seller_contact, amount_spent, 
                   description, bill_of_sale_path, created_at, updated_at
            FROM inventory_purchases WHERE id = ?
        ''', (purchase_id,))
        
        purchase = cursor.fetchone()
        conn.close()
        
        if not purchase:
            return jsonify({'status': 'error', 'error': 'Purchase not found'}), 404
        
        purchase_dict = dict(purchase)
        purchase_dict['amount_spent'] = float(purchase_dict['amount_spent'])
        
        return jsonify({
            'status': 'success',
            'purchase': purchase_dict
        })
        
    except Exception as e:
        app.logger.error(f"Error getting inventory purchase: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/inventory-purchases/<int:purchase_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_inventory_purchase(purchase_id):
    """Update an existing inventory purchase"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if purchase exists
        cursor.execute('SELECT id FROM inventory_purchases WHERE id = ?', (purchase_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Purchase not found'}), 404
        
        update_fields = []
        update_values = []
        
        if 'purchase_date' in data:
            update_fields.append('purchase_date = ?')
            update_values.append(data['purchase_date'])
        
        if 'seller_name' in data:
            update_fields.append('seller_name = ?')
            update_values.append(data['seller_name'].strip() if data['seller_name'] else None)
        
        if 'seller_contact' in data:
            update_fields.append('seller_contact = ?')
            update_values.append(data['seller_contact'].strip() if data['seller_contact'] else None)
        
        if 'amount_spent' in data:
            amount = float(data['amount_spent'])
            if amount <= 0:
                conn.close()
                return jsonify({'status': 'error', 'error': 'amount_spent must be greater than 0'}), 400
            update_fields.append('amount_spent = ?')
            update_values.append(amount)
        
        if 'description' in data:
            update_fields.append('description = ?')
            update_values.append(data['description'].strip() if data['description'] else None)
        
        if 'bill_of_sale_path' in data:
            update_fields.append('bill_of_sale_path = ?')
            update_values.append(data['bill_of_sale_path'].strip() if data['bill_of_sale_path'] else None)
        
        if not update_fields:
            conn.close()
            return jsonify({'status': 'error', 'error': 'No fields to update'}), 400
        
        update_fields.append('updated_at = CURRENT_TIMESTAMP')
        update_values.append(purchase_id)
        
        cursor.execute(f"UPDATE inventory_purchases SET {', '.join(update_fields)} WHERE id = ?", update_values)
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': 'Purchase updated successfully'})
        
    except Exception as e:
        app.logger.error(f"Error updating inventory purchase: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/inventory-purchases/<int:purchase_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_inventory_purchase(purchase_id):
    """Delete an inventory purchase (and optionally the bill image file)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get bill path before deletion
        cursor.execute('SELECT bill_of_sale_path FROM inventory_purchases WHERE id = ?', (purchase_id,))
        purchase = cursor.fetchone()
        
        if not purchase:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Purchase not found'}), 404
        
        # Delete the associated bill image file if it exists
        if purchase['bill_of_sale_path']:
            file_path = os.path.join(os.path.dirname(__file__), 'static', purchase['bill_of_sale_path'].lstrip('/'))
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception as e:
                    app.logger.warning(f"Could not delete bill image file: {e}")
        
        cursor.execute('DELETE FROM inventory_purchases WHERE id = ?', (purchase_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': 'Purchase deleted successfully'})
        
    except Exception as e:
        app.logger.error(f"Error deleting inventory purchase: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== COGS (Cost of Goods Sold) ENDPOINTS ====================

@app.route('/api/cogs/batch', methods=['POST'])
@login_required
@role_required(['admin'])
def set_batch_cogs():
    """
    Set COGS for all NEW records (status_id = 1) by distributing a batch total
    proportionally based on each record's store_price.
    
    Request body: { "batch_cogs": 100.00 }
    """
    try:
        data = request.get_json()
        
        if not data or 'batch_cogs' not in data:
            return jsonify({'status': 'error', 'error': 'batch_cogs required'}), 400
        
        batch_cogs = float(data['batch_cogs'])
        
        if batch_cogs < 0:
            return jsonify({'status': 'error', 'error': 'batch_cogs cannot be negative'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get all NEW records (status_id = 1) with their store_price
        cursor.execute('''
            SELECT id, store_price 
            FROM records 
            WHERE status_id = 1 AND store_price IS NOT NULL AND store_price > 0
        ''')
        
        records = cursor.fetchall()
        
        if not records:
            conn.close()
            return jsonify({
                'status': 'error', 
                'error': 'No NEW records (status_id=1) with valid store_price found'
            }), 404
        
        # Calculate total store price sum for all new records
        total_store_price = sum(record['store_price'] for record in records)
        
        if total_store_price <= 0:
            conn.close()
            return jsonify({
                'status': 'error', 
                'error': 'Total store price sum is zero or negative'
            }), 400
        
        # Calculate and update COGS for each record proportionally
        records_updated = 0
        total_cogs_sum = 0
        
        for record in records:
            # Calculate proportional COGS
            proportion = record['store_price'] / total_store_price
            cogs_value = batch_cogs * proportion
            cogs_value = round(cogs_value, 2)  # Round to 2 decimal places
            
            # Update the record
            cursor.execute('''
                UPDATE records 
                SET cogs = ? 
                WHERE id = ?
            ''', (cogs_value, record['id']))
            
            records_updated += 1
            total_cogs_sum += cogs_value
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Successfully distributed ${batch_cogs:.2f} across {records_updated} records',
            'records_updated': records_updated,
            'batch_cogs': batch_cogs,
            'total_store_price_sum': round(total_store_price, 2),
            'total_cogs_sum': round(total_cogs_sum, 2),
            'average_cogs': round(total_cogs_sum / records_updated, 2) if records_updated > 0 else 0
        })
        
    except Exception as e:
        app.logger.error(f"Error setting batch COGS: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/cogs/summary', methods=['GET'])
@login_required
def get_cogs_summary():
    """Get COGS summary statistics by status"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Summary by status
        cursor.execute('''
            SELECT 
                r.status_id,
                s.status_name,
                COUNT(*) as record_count,
                COALESCE(SUM(r.store_price), 0) as total_store_price,
                COALESCE(SUM(r.cogs), 0) as total_cogs,
                COALESCE(AVG(r.cogs), 0) as avg_cogs,
                COALESCE(SUM(r.store_price - r.cogs), 0) as total_profit
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            GROUP BY r.status_id
            ORDER BY r.status_id
        ''')
        
        summary = cursor.fetchall()
        
        # Overall totals
        cursor.execute('''
            SELECT 
                COUNT(*) as total_records,
                COALESCE(SUM(store_price), 0) as total_store_price,
                COALESCE(SUM(cogs), 0) as total_cogs,
                COALESCE(SUM(store_price - cogs), 0) as total_profit
            FROM records
            WHERE cogs IS NOT NULL
        ''')
        
        overall = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'summary': [dict(row) for row in summary],
            'overall': {
                'total_records_with_cogs': overall['total_records'],
                'total_store_price': float(overall['total_store_price']),
                'total_cogs': float(overall['total_cogs']),
                'total_profit': float(overall['total_profit'])
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error getting COGS summary: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/cogs/record/<int:record_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_individual_cogs(record_id):
    """Update COGS for a single record"""
    try:
        data = request.get_json()
        
        if not data or 'cogs' not in data:
            return jsonify({'status': 'error', 'error': 'cogs value required'}), 400
        
        cogs_value = float(data['cogs'])
        
        if cogs_value < 0:
            return jsonify({'status': 'error', 'error': 'COGS cannot be negative'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id FROM records WHERE id = ?', (record_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Record not found'}), 404
        
        cursor.execute('UPDATE records SET cogs = ? WHERE id = ?', (cogs_value, record_id))
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'COGS updated to ${cogs_value:.2f} for record #{record_id}'
        })
        
    except Exception as e:
        app.logger.error(f"Error updating individual COGS: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/cogs/clear', methods=['POST'])
@login_required
@role_required(['admin'])
def clear_cogs_for_status():
    """Clear COGS values for records with a specific status (or all)"""
    try:
        data = request.get_json()
        status_id = data.get('status_id') if data else None
        
        conn = get_db()
        cursor = conn.cursor()
        
        if status_id is not None:
            cursor.execute('UPDATE records SET cogs = NULL WHERE status_id = ?', (status_id,))
            cleared_count = cursor.rowcount
            message = f'Cleared COGS for {cleared_count} records with status_id={status_id}'
        else:
            cursor.execute('UPDATE records SET cogs = NULL')
            cleared_count = cursor.rowcount
            message = f'Cleared COGS for all {cleared_count} records'
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': message,
            'records_cleared': cleared_count
        })
        
    except Exception as e:
        app.logger.error(f"Error clearing COGS: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/inventory-purchases/summary', methods=['GET'])
@login_required
@role_required(['admin'])
def get_inventory_purchases_summary():
    """Get summary statistics for inventory purchases"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Total spent all time
        cursor.execute('SELECT COALESCE(SUM(amount_spent), 0) as total_spent FROM inventory_purchases')
        total_spent = cursor.fetchone()['total_spent']
        
        # Total spent this month
        cursor.execute('''
            SELECT COALESCE(SUM(amount_spent), 0) as month_spent 
            FROM inventory_purchases 
            WHERE strftime('%Y-%m', purchase_date) = strftime('%Y-%m', 'now')
        ''')
        month_spent = cursor.fetchone()['month_spent']
        
        # Total purchases count
        cursor.execute('SELECT COUNT(*) as total_purchases FROM inventory_purchases')
        total_purchases = cursor.fetchone()['total_purchases']
        
        # Purchases this month
        cursor.execute('''
            SELECT COUNT(*) as month_purchases 
            FROM inventory_purchases 
            WHERE strftime('%Y-%m', purchase_date) = strftime('%Y-%m', 'now')
        ''')
        month_purchases = cursor.fetchone()['month_purchases']
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'summary': {
                'total_spent': float(total_spent),
                'month_spent': float(month_spent),
                'total_purchases': total_purchases,
                'month_purchases': month_purchases
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error getting inventory purchases summary: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

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
    for key, value in data.items():
        update_fields.append(f"{key} = ?")
        update_values.append(value)
    if not update_fields:
        conn.close()
        return jsonify({'status': 'error', 'error': 'No fields to update'}), 400
    update_values.append(record_id)
    cursor.execute(f"UPDATE records SET {', '.join(update_fields)} WHERE id = ?", update_values)
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
        SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.barcode = ?
    ''', (barcode,))
    record = cursor.fetchone()
    conn.close()
    if not record:
        return jsonify({'status': 'error', 'error': 'Record not found'}), 404
    record_dict = dict(record)
    if record_dict.get('sleeve_condition_name'):
        record_dict['condition'] = record_dict['sleeve_condition_name']
    return jsonify(record_dict)

@app.route('/records/search', methods=['GET'])
def search_records():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'status': 'error', 'error': 'Search query required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Determine if query is numeric (could be ID or barcode)
    is_numeric = query.isdigit()
    
    if is_numeric:
        # NUMERIC QUERY - Exact matches only (ID or barcode)
        id_value = int(query)
        
        cursor.execute('''
            SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.id = ? OR r.barcode = ?
            ORDER BY 
                CASE 
                    WHEN r.id = ? THEN 1
                    WHEN r.barcode = ? THEN 2
                    ELSE 3
                END,
                r.created_at DESC
        ''', (id_value, query, id_value, query))
        
    else:
        # NON-NUMERIC QUERY - Partial matches for artist/title only
        search_term = f'%{query}%'
        
        cursor.execute('''
            SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.artist LIKE ? OR r.title LIKE ? OR r.catalog_number LIKE ?
            ORDER BY r.created_at DESC
        ''', (search_term, search_term, search_term))
    
    records = cursor.fetchall()
    conn.close()
    
    records_list = []
    for record in records:
        record_dict = dict(record)
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)
    
    return jsonify({
        'status': 'success', 
        'records': records_list, 
        'count': len(records_list)
    })


@app.route('/records/random', methods=['GET'])
def get_random_records():
    limit = request.args.get('limit', default=500, type=int)
    has_youtube = request.args.get('has_youtube', default=None, type=str)
    conn = get_db()
    cursor = conn.cursor()
    query = '''
        SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.artist IS NOT NULL AND r.title IS NOT NULL AND r.artist != '' AND r.title != ''
    '''
    params = []
    if has_youtube and has_youtube.lower() == 'true':
        query += ' AND (r.youtube_url LIKE "%youtube.com%" OR r.youtube_url LIKE "%youtu.be%")'
    query += ' ORDER BY RANDOM() LIMIT ?'
    params.append(limit)
    cursor.execute(query, params)
    records = cursor.fetchall()
    conn.close()
    records_list = []
    for record in records:
        record_dict = dict(record)
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)
    return jsonify({'status': 'success', 'count': len(records_list), 'limit': limit, 'records': records_list})


@app.route('/records/count', methods=['GET'])
def get_records_count():
    """Get count of records. Can optionally filter by status_id."""
    conn = get_db()
    cursor = conn.cursor()
    
    status_id = request.args.get('status_id', type=int)
    
    if status_id is not None:
        cursor.execute('SELECT COUNT(*) as count FROM records WHERE status_id = ?', (status_id,))
    else:
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
        SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.id IN ({placeholders})
        ORDER BY r.artist, r.title
    ''', record_ids)
    records = cursor.fetchall()
    conn.close()
    records_list = []
    for record in records:
        record_dict = dict(record)
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)
    return jsonify({'status': 'success', 'records': records_list})


@app.route('/records/update-status', methods=['POST'])
def update_records_status():
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
    cursor.execute(f'UPDATE records SET status_id = ? WHERE id IN ({placeholders})', [status_id] + record_ids)
    updated_count = cursor.rowcount
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': f'Updated status for {updated_count} records', 'updated_count': updated_count, 'status_id': status_id})


@app.route('/records/user/<int:user_id>', methods=['GET'])
def get_user_records(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.consignor_id = ?
        ORDER BY r.artist, r.title
    ''', (user_id,))
    records = cursor.fetchall()
    conn.close()
    records_list = []
    for record in records:
        record_dict = dict(record)
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)
    return jsonify({'status': 'success', 'records': records_list})


@app.route('/records/no-barcodes', methods=['GET'])
def get_records_without_barcodes():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.barcode IS NULL OR r.barcode = '' OR r.barcode = 'None'
        ORDER BY r.artist, r.title
    ''')
    records = cursor.fetchall()
    conn.close()
    records_list = []
    for record in records:
        record_dict = dict(record)
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)
    return jsonify({'status': 'success', 'records': records_list})


@app.route('/records/status/<int:status_id>', methods=['GET'])
def get_records_by_status(status_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM d_status WHERE id = ?', (status_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Invalid status ID'}), 400
    cursor.execute('''
        SELECT r.*, s.status_name, u.username as consignor_name,
        cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN users u ON r.consignor_id = u.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.status_id = ?
        ORDER BY r.artist, r.title
    ''', (status_id,))
    records = cursor.fetchall()
    conn.close()
    records_list = []
    for record in records:
        record_dict = dict(record)
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)
    return jsonify({'status': 'success', 'count': len(records_list), 'status_id': status_id, 'records': records_list})


# ==================== CONDITIONS ENDPOINTS ====================

@app.route('/api/conditions', methods=['GET'])
def get_conditions():
    try:
        user_role = request.args.get('role', session.get('role', 'admin'))
        conn = get_db()
        cursor = conn.cursor()
        if user_role == 'consignor':
            cursor.execute('SELECT id, condition_name, display_name, abbreviation, description, quality_index FROM d_condition WHERE is_consignor_allowed = 1 ORDER BY quality_index')
        else:
            cursor.execute('SELECT id, condition_name, display_name, abbreviation, description, quality_index FROM d_condition ORDER BY quality_index')
        conditions = cursor.fetchall()
        conn.close()
        return jsonify({'status': 'success', 'conditions': [dict(c) for c in conditions]})
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/conditions/<int:condition_id>', methods=['GET'])
def get_condition_by_id(condition_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, condition_name, display_name, abbreviation, description, quality_index FROM d_condition WHERE id = ?', (condition_id,))
        condition = cursor.fetchone()
        conn.close()
        if not condition:
            return jsonify({'status': 'error', 'error': 'Condition not found'}), 404
        return jsonify({'status': 'success', 'condition': dict(condition)})
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== CONFIG ENDPOINTS ====================

@app.route('/config', methods=['GET'])
def get_all_config():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT config_key, config_value, description FROM app_config ORDER BY config_key')
    configs = cursor.fetchall()
    conn.close()
    config_dict = {row['config_key']: {'value': row['config_value'], 'description': row['description']} for row in configs}
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
    if cursor.fetchone():
        cursor.execute('UPDATE app_config SET config_value = ? WHERE config_key = ?', (config_value, config_key))
    else:
        cursor.execute('INSERT INTO app_config (config_key, config_value) VALUES (?, ?)', (config_key, config_value))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Config updated'})


# ==================== STATUS ENDPOINTS ====================

@app.route('/statuses', methods=['GET'])
def get_statuses():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, status_name, description FROM d_status ORDER BY id')
    statuses = cursor.fetchall()
    conn.close()
    return jsonify({'status': 'success', 'count': len(statuses), 'statuses': [dict(s) for s in statuses]})


# ==================== CONSIGNMENT ENDPOINTS ====================

@app.route('/api/consignor/records', methods=['GET'])
@role_required(['consignor', 'admin'])
def get_consignor_records():
    conn = get_db()
    cursor = conn.cursor()
    if session.get('role') == 'admin':
        cursor.execute('''
            SELECT r.*, s.status_name, u.username as consignor_name,
            cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.consignor_id IS NOT NULL
            ORDER BY r.created_at DESC
        ''')
    else:
        cursor.execute('''
            SELECT r.*, s.status_name,
            cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.consignor_id = ?
            ORDER BY r.created_at DESC
        ''', (session['user_id'],))
    records = cursor.fetchall()
    conn.close()
    records_list = []
    for record in records:
        record_dict = dict(record)
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)
    return jsonify({'status': 'success', 'count': len(records_list), 'records': records_list})



@app.route('/api/consignor/add-record', methods=['POST'])
@role_required(['consignor', 'admin'])
def add_consignor_record():
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
    commission_rate = float(commission_result['config_value']) if commission_result else 25.0
    condition_sleeve_id = data.get('condition_sleeve_id')
    condition_disc_id = data.get('condition_disc_id')
    if not condition_sleeve_id and data.get('condition'):
        cursor.execute('SELECT id FROM d_condition WHERE condition_name = ?', (data.get('condition'),))
        result = cursor.fetchone()
        if result:
            condition_sleeve_id = result['id']
            condition_disc_id = result['id']
    
    discogs_genre_raw = data.get('discogs_genre_raw', '')
    
    cursor.execute('''
        INSERT INTO records (
            artist, title, barcode, image_url, catalog_number,
            condition_sleeve_id, condition_disc_id, store_price, youtube_url, 
            consignor_id, commission_rate, status_id, created_at, discogs_genre_raw
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    ''', (
        data.get('artist'), 
        data.get('title'), 
        data.get('barcode', ''), 
        data.get('image_url', ''),
        data.get('catalog_number', ''), 
        condition_sleeve_id, 
        condition_disc_id, 
        float(data.get('store_price')), 
        data.get('youtube_url', ''), 
        session['user_id'],
        commission_rate, 
        1, 
        discogs_genre_raw
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


@app.route('/api/genres', methods=['GET'])
def get_genres():
    """Get unique genres from record locations (first part before ' | ')"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT location FROM records 
            WHERE location IS NOT NULL AND location != ''
        ''')
        
        records = cursor.fetchall()
        conn.close()
        
        genres = set()
        
        for record in records:
            location = record['location']
            if location:
                # New format: split on " | " (space pipe space)
                if ' | ' in location:
                    # Extract genre (everything before first " | ")
                    genre = location.split(' | ')[0].strip()
                    if genre:
                        genres.add(genre)
                # Legacy format: split on " - " (space dash space) for backward compatibility
                elif ' - ' in location:
                    genre = location.split(' - ')[0].strip()
                    if genre:
                        genres.add(genre)
                # If no separator and not obviously a location prefix, treat as genre
                elif not location.startswith(('bin', 'shelf', 'rack', 'row', 'box', 'drawer', 'Bin', 'Shelf', 'Rack', 'Display', 'Wall')):
                    genres.add(location.strip())
        
        # Sort alphabetically
        genres_list = sorted(list(genres))
        
        return jsonify({
            'status': 'success',
            'genres': genres_list,
            'count': len(genres_list)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting genres: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/consignment/records', methods=['GET'])
def get_consignment_records():
    user_id = request.args.get('user_id')
    conn = get_db()
    cursor = conn.cursor()
    if user_id:
        cursor.execute('''
            SELECT r.*, s.status_name, u.username as consignor_name,
            cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.consignor_id = ?
            ORDER BY CASE r.status_id WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 4 THEN 4 ELSE 5 END, r.artist, r.title
        ''', (user_id,))
    else:
        cursor.execute('''
            SELECT r.*, s.status_name, u.username as consignor_name,
            cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.consignor_id IS NOT NULL
            ORDER BY CASE r.status_id WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 4 THEN 4 ELSE 5 END, r.consignor_id, r.artist, r.title
        ''')
    records = cursor.fetchall()
    conn.close()
    records_list = []
    for record in records:
        record_dict = dict(record)
        barcode = record_dict.get('barcode')
        status_id = record_dict.get('status_id')
        if status_id == 1:
            record_dict['display_status'] = 'New' if not barcode or barcode in [None, '', 'None'] else 'Active'
        elif status_id == 2:
            record_dict['display_status'] = 'Active'
        elif status_id == 3:
            record_dict['display_status'] = 'Sold'
        elif status_id == 4:
            record_dict['display_status'] = 'Removed'
        else:
            record_dict['display_status'] = 'Unknown'
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)
    return jsonify({'status': 'success', 'count': len(records_list), 'records': records_list})


@app.route('/consignment/dropoff-ready', methods=['GET'])
def get_dropoff_records():
    user_id = request.args.get('user_id')
    conn = get_db()
    cursor = conn.cursor()
    if user_id:
        cursor.execute('''
            SELECT r.*, s.status_name, u.username as consignor_name,
            cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.consignor_id = ? AND (r.barcode IS NULL OR r.barcode = '' OR r.barcode = 'None') AND r.status_id IN (1, 2)
            ORDER BY r.created_at DESC
        ''', (user_id,))
    else:
        cursor.execute('''
            SELECT r.*, s.status_name, u.username as consignor_name,
            cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.consignor_id IS NOT NULL AND (r.barcode IS NULL OR r.barcode = '' OR r.barcode = 'None') AND r.status_id IN (1, 2)
            ORDER BY r.consignor_id, r.created_at DESC
        ''')
    records = cursor.fetchall()
    conn.close()
    records_list = []
    for record in records:
        record_dict = dict(record)
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)
    return jsonify({'status': 'success', 'records': records_list})


# ==================== PRICE ESTIMATE ENDPOINT ====================
 
@app.route('/api/discogs/price-suggestions/<release_id>', methods=['GET'])
def discogs_price_suggestions_proxy(release_id):
    """Proxy endpoint to fetch Discogs price suggestions"""
    try:
        TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
        if not TOKEN:
            return jsonify({'status': 'error', 'error': 'Discogs token not configured'}), 500
        
        headers = {
            'Authorization': f'Discogs token={TOKEN}',
            'User-Agent': 'PigStyleMusic/1.0'
        }
        
        url = f"https://api.discogs.com/marketplace/price_suggestions/{release_id}"
        
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code != 200:
            return jsonify({'status': 'error', 'error': f'Discogs API returned {response.status_code}'}), response.status_code
        
        return jsonify(response.json())
        
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/ebay/search', methods=['POST'])
def ebay_search_proxy():
    """Proxy endpoint to search eBay listings"""
    try:
        data = request.get_json()
        
        if not data or 'query' not in data:
            return jsonify({'status': 'error', 'error': 'query required'}), 400
        
        search_query = data.get('query')
        limit = data.get('limit', 50)
        
        ebay_client_id = os.environ.get('EBAY_CLIENT_ID')
        ebay_client_secret = os.environ.get('EBAY_CLIENT_SECRET')
        
        if not ebay_client_id or not ebay_client_secret:
            return jsonify({'status': 'error', 'error': 'eBay credentials not configured'}), 500
        
        # Get OAuth token
        token_url = "https://api.ebay.com/identity/v1/oauth2/token"
        token_headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        token_data = {
            'grant_type': 'client_credentials',
            'scope': 'https://api.ebay.com/oauth/api_scope'
        }
        
        token_response = requests.post(
            token_url, 
            headers=token_headers, 
            data=token_data, 
            auth=(ebay_client_id, ebay_client_secret), 
            timeout=10
        )
        
        if token_response.status_code != 200:
            return jsonify({'status': 'error', 'error': 'Failed to get eBay access token'}), 500
        
        access_token = token_response.json().get('access_token')
        
        # Search eBay
        search_url = "https://api.ebay.com/buy/browse/v1/item_summary/search"
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        params = {
            'q': search_query,
            'limit': limit,
            'filter': 'conditions:{NEW|USED}',
            'sort': 'price'
        }
        
        response = requests.get(search_url, headers=headers, params=params, timeout=15)
        
        if response.status_code != 200:
            return jsonify({
                'status': 'error',
                'error': f'eBay API returned {response.status_code}'
            }), response.status_code
        
        return jsonify(response.json())
        
    except Exception as e:
        app.logger.error(f"eBay search error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

        
@app.route('/api/discogs/search', methods=['GET'])
def discogs_search_proxy():
    try:
        search_term = request.args.get('q', '')
        
        if not search_term:
            return jsonify({'status': 'error', 'error': 'Search term required'}), 400
        
        TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
        if not TOKEN:
            return jsonify({'status': 'error', 'error': 'Discogs token not configured'}), 500
        
        headers = {
            'Authorization': f'Discogs token={TOKEN}',
            'User-Agent': 'PigStyleMusic/1.0'
        }
        
        response = requests.get(
            'https://api.discogs.com/database/search',
            headers=headers,
            params={'q': search_term, 'type': 'release', 'per_page': 20}
        )
        
        if response.status_code != 200:
            return jsonify({'status': 'error', 'error': 'Discogs search failed'}), response.status_code
        
        data = response.json()
        results = []
        
        for item in data.get('results', []):
            # Get artist from response or extract from title
            artist = item.get('artist', '')
            title = item.get('title', '')
            
            # If artist is missing or "Unknown", try to extract from title
            if not artist or artist == 'Unknown':
                if title and ' - ' in title:
                    parts = title.split(' - ', 1)
                    artist = parts[0].strip()
                    title = parts[1].strip() if len(parts) > 1 else title
                    print(f"Extracted artist '{artist}' from title")
            
            # Handle artist being a list
            if isinstance(artist, list):
                artist = artist[0] if artist else 'Unknown'
            
            # Final fallback
            if not artist or artist == 'Unknown':
                artist = 'Unknown Artist'
            
            # Get raw genre string
            genre_list = item.get('genre', [])
            raw_genre = ', '.join(genre_list) if genre_list else ''
            
            results.append({
                'artist': artist,
                'title': title,
                'year': item.get('year'),
                'genre_raw': raw_genre,
                'format': item.get('format', [''])[0] if item.get('format') else '',
                'country': item.get('country'),
                'image_url': item.get('thumb', ''),
                'catalog_number': item.get('catno', ''),
                'discogs_id': item.get('id'),
                'barcode': item.get('barcode', [''])[0] if item.get('barcode') else ''
            })
        
        return jsonify({'status': 'success', 'results': results, 'count': len(results)})
        
    except Exception as e:
        app.logger.error(f"Discogs search error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/catalog/records', methods=['GET'])
def get_catalog_records():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'INVENTORY_CUTOFF_DAYS'")
        cutoff_row = cursor.fetchone()
        cutoff_days = int(cutoff_row['config_value']) if cutoff_row else 30
        query = """
            SELECT r.id, r.artist, r.title, r.barcode, r.image_url, r.catalog_number, r.store_price, r.youtube_url, r.consignor_id,
            r.commission_rate, r.created_at, r.status_id, ds.status_name as status_name,
            r.date_sold, r.condition_sleeve_id, cs.condition_name as condition_sleeve,
            r.condition_disc_id, cd.condition_name as condition_disc, r.last_seen,
            r.discogs_listing_id, r.discogs_listed_date, r.location, r.discogs_genre_raw
            FROM records r
            LEFT JOIN d_status ds ON r.status_id = ds.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE (r.last_seen >= DATE('now', '-' || ? || ' days') OR r.last_seen IS NULL)
            ORDER BY r.created_at DESC
        """
        cursor.execute(query, (cutoff_days,))
        rows = cursor.fetchall()
        records = []
        for row in rows:
            record = {
                'id': row['id'], 'artist': row['artist'], 'title': row['title'],
                'barcode': row['barcode'], 'image_url': row['image_url'],
                'catalog_number': row['catalog_number'], 'store_price': row['store_price'],
                'youtube_url': row['youtube_url'], 'consignor_id': row['consignor_id'],
                'commission_rate': row['commission_rate'], 'created_at': row['created_at'],
                'status_id': row['status_id'], 'status_name': row['status_name'],
                'date_sold': row['date_sold'], 'condition_sleeve_id': row['condition_sleeve_id'],
                'condition_sleeve': row['condition_sleeve'], 'condition_disc_id': row['condition_disc_id'],
                'condition_disc': row['condition_disc'], 'last_seen': row['last_seen'],
                'discogs_listing_id': row['discogs_listing_id'], 'discogs_listed_date': row['discogs_listed_date'],
                'location': row['location'] if row['location'] else 'Check with staff',
                'discogs_genre_raw': row['discogs_genre_raw'] or ''
            }
            records.append(record)
        return jsonify({'status': 'success', 'records': records, 'total': len(records), 'cutoff_days': cutoff_days})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/catalog/grouped-by-release', methods=['GET'])
def get_catalog_grouped_by_release():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT r.id, r.artist, r.title, r.barcode, COALESCE(r.image_url, '') as image_url,
        cs.condition_name as sleeve_condition, cd.condition_name as disc_condition, 
        r.store_price, r.catalog_number, r.youtube_url, r.created_at, s.status_name,
        r.discogs_genre_raw
        FROM records r
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.artist IS NOT NULL AND r.title IS NOT NULL AND r.artist != '' AND r.title != ''
        AND r.store_price IS NOT NULL AND r.status_id = 2
        ORDER BY r.created_at DESC
    ''')
    records = cursor.fetchall()
    conn.close()
    
    def get_format_from_barcode(barcode):
        if not barcode:
            return 'Vinyl'
        barcode_str = str(barcode)
        if barcode_str.startswith('22'):
            return 'Vinyl'
        elif barcode_str.startswith('33'):
            return 'CD'
        elif barcode_str.startswith('44'):
            return 'Cassette'
        else:
            return 'Vinyl'
    
    condition_order = {'Mint (M)': 1, 'Near Mint (NM or M-)': 2, 'Very Good Plus (VG+)': 3,
                      'Very Good (VG)': 4, 'Good Plus (G+)': 5, 'Good (G)': 6, 'Fair (F)': 7, 'Poor (P)': 8}
    
    groups = {}
    total_copies = 0
    unique_releases = 0
    
    for record in records:
        record_dict = dict(record)
        artist = (record_dict.get('artist') or '').strip()
        title = (record_dict.get('title') or '').strip()
        if not artist or not title:
            continue
        key = f"{artist.lower()}|{title.lower()}"
        if 'store_price' in record_dict and record_dict['store_price'] is not None:
            record_dict['store_price'] = float(record_dict['store_price'])
        record_format = get_format_from_barcode(record_dict.get('barcode'))
        if key not in groups:
            unique_releases += 1
            groups[key] = {
                'artist': artist, 'title': title, 'image_url': record_dict.get('image_url', ''),
                'total_copies': 0, 'formats': {}, 'created_at': record_dict.get('created_at'),
                'discogs_genre_raw': record_dict.get('discogs_genre_raw', ''),
                'price_range': {'min': float('inf'), 'max': 0}
            }
        if record_format not in groups[key]['formats']:
            groups[key]['formats'][record_format] = {
                'format': record_format, 'copies': [], 'total_copies': 0,
                'price_range': {'min': float('inf'), 'max': 0}
            }
        copy_data = {
            'id': record_dict['id'], 'sleeve_condition': record_dict.get('sleeve_condition', 'Unknown'),
            'disc_condition': record_dict.get('disc_condition', 'Unknown'),
            'sleeve_condition_rank': condition_order.get(record_dict.get('sleeve_condition'), 99),
            'disc_condition_rank': condition_order.get(record_dict.get('disc_condition'), 99),
            'store_price': record_dict['store_price'], 'barcode': record_dict.get('barcode', ''),
            'catalog_number': record_dict.get('catalog_number', ''),
            'youtube_url': record_dict.get('youtube_url', ''), 'created_at': record_dict.get('created_at')
        }
        groups[key]['formats'][record_format]['copies'].append(copy_data)
        groups[key]['formats'][record_format]['total_copies'] += 1
        groups[key]['total_copies'] += 1
        total_copies += 1
        price = record_dict['store_price']
        if price > 0:
            if price < groups[key]['formats'][record_format]['price_range']['min']:
                groups[key]['formats'][record_format]['price_range']['min'] = price
            if price > groups[key]['formats'][record_format]['price_range']['max']:
                groups[key]['formats'][record_format]['price_range']['max'] = price
            groups[key]['price_range']['min'] = min(groups[key]['price_range']['min'], price)
            groups[key]['price_range']['max'] = max(groups[key]['price_range']['max'], price)
        if record_dict.get('created_at') and (not groups[key]['created_at'] or record_dict['created_at'] < groups[key]['created_at']):
            groups[key]['created_at'] = record_dict['created_at']
    
    for group in groups.values():
        if group['price_range']['min'] == float('inf'):
            group['price_range'] = {'min': 0, 'max': 0}
        for format_data in group['formats'].values():
            if format_data['price_range']['min'] == float('inf'):
                format_data['price_range'] = {'min': 0, 'max': 0}
    
    groups_list = list(groups.values())
    groups_list.sort(key=lambda x: x['created_at'] if x['created_at'] else '', reverse=True)
    for group in groups_list:
        group['formats'] = list(group['formats'].values())
        group['formats'].sort(key=lambda x: x['format'])
        for format_data in group['formats']:
            format_data['copies'].sort(key=lambda x: (x['sleeve_condition_rank'], -x['store_price']))
            for copy in format_data['copies']:
                del copy['sleeve_condition_rank']
                del copy['disc_condition_rank']
                if copy['sleeve_condition'] == copy['disc_condition']:
                    copy['condition'] = copy['sleeve_condition']
                else:
                    copy['condition'] = f"Sleeve: {copy['sleeve_condition']}, Disc: {copy['disc_condition']}"
    
    return jsonify({'status': 'success', 'total_unique_releases': len(groups_list), 'total_copies': total_copies, 'groups': groups_list})


# ==================== COMMISSION RATE ENDPOINT ====================

@app.route('/commission-rate', methods=['GET'])
def get_commission_rate_simple():
    return jsonify({'commission_rate': 25.0, 'commission_rate_percent': '25.0%', 'store_fill_percentage': 75.0, 'total_inventory': 5000, 'store_capacity': 10000, 'message': 'This is a test endpoint with default values'})


@app.route('/api/commission-rate', methods=['GET'])
def get_commission_rate():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT config_key, config_value FROM app_config WHERE config_key IN ('STORE_CAPACITY', 'COMMISSION_MAX_CAPACITY', 'COMMISSION_MIN_CAPACITY', 'COMMISSION_MAX_RATE', 'COMMISSION_MIN_RATE')")
    config = {row[0]: float(row[1]) for row in cursor.fetchall()}
    cursor.execute("SELECT COUNT(*) FROM records WHERE status_id IN (1, 2)")
    total_inventory = cursor.fetchone()[0]
    conn.close()
    fill_percentage = (total_inventory / config['STORE_CAPACITY']) * 100
    if fill_percentage <= config['COMMISSION_MIN_CAPACITY']:
        rate = config['COMMISSION_MIN_RATE']
    elif fill_percentage >= config['COMMISSION_MAX_CAPACITY']:
        rate = config['COMMISSION_MAX_RATE']
    else:
        ratio = (fill_percentage - config['COMMISSION_MIN_CAPACITY']) / (config['COMMISSION_MAX_CAPACITY'] - config['COMMISSION_MIN_CAPACITY'])
        rate = config['COMMISSION_MIN_RATE'] + (config['COMMISSION_MAX_RATE'] - config['COMMISSION_MIN_RATE']) * ratio
    return jsonify({'commission_rate': round(rate, 1), 'commission_rate_percent': f"{round(rate, 1)}%", 'store_fill_percentage': round(fill_percentage, 1), 'total_inventory': total_inventory, 'store_capacity': config['STORE_CAPACITY']})


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
    return jsonify({'status': 'success', 'records_count': records_count, 'users_count': users_count, 'votes_count': votes_count, 'latest_record': latest_record, 'db_path': 'API-based'})


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
    return jsonify({'status': 'success', 'records_count': result['records_count'], 'db_path': 'API-based'})


# ==================== HEALTH CHECK ====================

@app.route('/health', methods=['GET'])
def health_check():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT 1')
    cursor.fetchone()
    conn.close()
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat(), 'database': 'connected', 'service': 'PigStyle API'})


# ==================== ACCESSORIES (MERCHANDISE) ENDPOINTS ====================

@app.route('/accessories', methods=['GET'])
def get_all_accessories():
    """Get all active accessories"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                id,
                title,
                description,
                price as store_price,
                image_url,
                bar_code,
                status_id,
                created_at,
                updated_at
            FROM accessories
            WHERE status_id = 1
            ORDER BY created_at DESC
        ''')
        
        accessories = cursor.fetchall()
        conn.close()
        
        accessories_list = []
        for acc in accessories:
            accessories_list.append({
                'id': acc['id'],
                'title': acc['title'],
                'description': acc['description'],
                'store_price': float(acc['store_price']),
                'image_url': acc['image_url'],
                'bar_code': acc['bar_code'],
                'status_id': acc['status_id'],
                'created_at': acc['created_at'],
                'updated_at': acc['updated_at']
            })
        
        return jsonify({
            'status': 'success',
            'accessories': accessories_list,
            'count': len(accessories_list)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting accessories: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/accessories', methods=['POST'])
@login_required
@role_required(['admin'])
def create_accessory():
    """Create a new accessory/merchandise item"""
    try:
        data = request.get_json()
        
        required_fields = ['title', 'price']
        for field in required_fields:
            if field not in data:
                return jsonify({'status': 'error', 'error': f'{field} is required'}), 400
        
        title = data['title'].strip()
        description = data.get('description', '').strip()
        price = float(data['price'])
        image_url = data.get('image_url', '').strip()
        
        if not title:
            return jsonify({'status': 'error', 'error': 'Title cannot be empty'}), 400
        
        if price <= 0:
            return jsonify({'status': 'error', 'error': 'Price must be greater than 0'}), 400
        
        import random
        import string
        prefix = 'ACC'
        random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        bar_code = f"{prefix}{random_part}"
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO accessories (title, description, price, image_url, bar_code, status_id)
            VALUES (?, ?, ?, ?, ?, 1)
        ''', (title, description, price, image_url, bar_code))
        
        accessory_id = cursor.lastrowid
        conn.commit()
        
        cursor.execute('''
            SELECT id, title, description, price as store_price, image_url, bar_code, status_id
            FROM accessories WHERE id = ?
        ''', (accessory_id,))
        
        new_accessory = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Accessory created successfully',
            'accessory': {
                'id': new_accessory['id'],
                'title': new_accessory['title'],
                'description': new_accessory['description'],
                'store_price': float(new_accessory['store_price']),
                'image_url': new_accessory['image_url'],
                'bar_code': new_accessory['bar_code'],
                'status_id': new_accessory['status_id']
            }
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error creating accessory: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/accessories/upload-image', methods=['POST'])
@login_required
@role_required(['admin'])
def upload_accessory_image():
    """Upload an image for an accessory"""
    try:
        if 'image' not in request.files:
            return jsonify({'status': 'error', 'error': 'No image file provided'}), 400
        
        file = request.files['image']
        
        if file.filename == '':
            return jsonify({'status': 'error', 'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'status': 'error', 'error': f'File type not allowed. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'}), 400
        
        original_filename = secure_filename(file.filename)
        ext = original_filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{uuid.uuid4().hex}_{original_filename}"
        
        filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
        file.save(filepath)
        
        image_url = f"/static/images/misc/{unique_filename}"
        
        accessory_id = request.form.get('accessory_id')
        if accessory_id:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('UPDATE accessories SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (image_url, accessory_id))
            conn.commit()
            conn.close()
        
        return jsonify({'status': 'success', 'message': 'Image uploaded successfully', 'image_url': image_url, 'filename': unique_filename}), 200
        
    except Exception as e:
        app.logger.error(f"Error uploading image: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/accessories/<int:accessory_id>', methods=['GET'])
def get_accessory(accessory_id):
    """Get a single accessory by ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id, title, description, price as store_price, image_url, bar_code, status_id FROM accessories WHERE id = ?', (accessory_id,))
        accessory = cursor.fetchone()
        conn.close()
        
        if not accessory:
            return jsonify({'status': 'error', 'error': 'Accessory not found'}), 404
        
        return jsonify({
            'status': 'success',
            'accessory': {
                'id': accessory['id'],
                'title': accessory['title'],
                'description': accessory['description'],
                'store_price': float(accessory['store_price']),
                'image_url': accessory['image_url'],
                'bar_code': accessory['bar_code'],
                'status_id': accessory['status_id']
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error getting accessory: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/accessories/<int:accessory_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_accessory(accessory_id):
    """Update an existing accessory"""
    try:
        data = request.get_json()
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id FROM accessories WHERE id = ?', (accessory_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Accessory not found'}), 404
        
        update_fields = []
        update_values = []
        
        if 'title' in data:
            update_fields.append('title = ?')
            update_values.append(data['title'].strip())
        
        if 'description' in data:
            update_fields.append('description = ?')
            update_values.append(data['description'].strip())
        
        if 'price' in data:
            price = float(data['price'])
            if price <= 0:
                conn.close()
                return jsonify({'status': 'error', 'error': 'Price must be greater than 0'}), 400
            update_fields.append('price = ?')
            update_values.append(price)
        
        if 'image_url' in data:
            update_fields.append('image_url = ?')
            update_values.append(data['image_url'].strip())
        
        if 'status_id' in data:
            update_fields.append('status_id = ?')
            update_values.append(int(data['status_id']))
        
        if not update_fields:
            conn.close()
            return jsonify({'status': 'error', 'error': 'No valid fields to update'}), 400
        
        update_fields.append('updated_at = CURRENT_TIMESTAMP')
        update_values.append(accessory_id)
        
        cursor.execute(f"UPDATE accessories SET {', '.join(update_fields)} WHERE id = ?", update_values)
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': 'Accessory updated successfully'})
        
    except Exception as e:
        app.logger.error(f"Error updating accessory: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/accessories/<int:accessory_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_accessory(accessory_id):
    """Soft delete an accessory (set status_id to 0)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id, title, image_url FROM accessories WHERE id = ?', (accessory_id,))
        accessory = cursor.fetchone()
        
        if not accessory:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Accessory not found'}), 404
        
        if accessory['image_url']:
            image_path = os.path.join(os.path.dirname(__file__), 'static', accessory['image_url'].lstrip('/'))
            if os.path.exists(image_path):
                try:
                    os.remove(image_path)
                except:
                    pass
        
        cursor.execute('UPDATE accessories SET status_id = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (accessory_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': f'Accessory "{accessory["title"]}" has been deleted'})
        
    except Exception as e:
        app.logger.error(f"Error deleting accessory: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/accessories/barcode/<barcode>', methods=['GET'])
def get_accessory_by_barcode(barcode):
    """Get accessory by barcode"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id, title, description, price as store_price, image_url, bar_code, status_id FROM accessories WHERE bar_code = ? AND status_id = 1', (barcode,))
        accessory = cursor.fetchone()
        conn.close()
        
        if not accessory:
            return jsonify({'status': 'error', 'error': 'Accessory not found'}), 404
        
        return jsonify({
            'status': 'success',
            'accessory': {
                'id': accessory['id'],
                'title': accessory['title'],
                'description': accessory['description'],
                'store_price': float(accessory['store_price']),
                'image_url': accessory['image_url'],
                'bar_code': accessory['bar_code'],
                'status_id': accessory['status_id']
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error getting accessory by barcode: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/accessories/search', methods=['GET'])
def search_accessories():
    """Search accessories by title or description"""
    try:
        query = request.args.get('q', '').strip()
        
        if not query:
            return jsonify({'status': 'error', 'error': 'Search query required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        search_term = f'%{query}%'
        
        cursor.execute('''
            SELECT id, title, description, price as store_price, image_url, bar_code, status_id
            FROM accessories
            WHERE (title LIKE ? OR description LIKE ?) AND status_id = 1
            ORDER BY title
        ''', (search_term, search_term))
        
        accessories = cursor.fetchall()
        conn.close()
        
        accessories_list = []
        for acc in accessories:
            accessories_list.append({
                'id': acc['id'],
                'title': acc['title'],
                'description': acc['description'],
                'store_price': float(acc['store_price']),
                'image_url': acc['image_url'],
                'bar_code': acc['bar_code'],
                'status_id': acc['status_id']
            })
        
        return jsonify({'status': 'success', 'accessories': accessories_list, 'count': len(accessories_list)})
        
    except Exception as e:
        app.logger.error(f"Error searching accessories: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/accessories/regenerate-barcode/<int:accessory_id>', methods=['POST'])
@login_required
@role_required(['admin'])
def regenerate_accessory_barcode(accessory_id):
    """Regenerate barcode for an accessory"""
    try:
        import random
        import string
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id FROM accessories WHERE id = ?', (accessory_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Accessory not found'}), 404
        
        prefix = 'ACC'
        random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        new_barcode = f"{prefix}{random_part}"
        
        cursor.execute('UPDATE accessories SET bar_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (new_barcode, accessory_id))
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'message': 'Barcode regenerated successfully', 'new_barcode': new_barcode})
        
    except Exception as e:
        app.logger.error(f"Error regenerating barcode: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/merchandise')
def merchandise_page():
    """Serve the merchandise store page"""
    return send_from_directory('static', 'accessories.html')

 
# ==================== FEEDBACK ENDPOINT ====================

@app.route('/api/feedback', methods=['POST'])
def submit_feedback():
    """Submit feedback from the connect page"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        type_of_feedback = data.get('type_of_feedback', 'general')
        content = data.get('content', '').strip()
        contact_info = data.get('contact_info', '').strip()
        event_name = data.get('event_name', '').strip()
        
        # Validate based on feedback type
        if type_of_feedback == 'general' and not content:
            return jsonify({'status': 'error', 'error': 'Feedback content is required'}), 400
        
        if type_of_feedback == 'event' and not event_name and not content:
            return jsonify({'status': 'error', 'error': 'Event selection or description is required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO feedback (type_of_feedback, content, contact_info, event_name, status)
            VALUES (?, ?, ?, ?, 'new')
        ''', (type_of_feedback, content, contact_info, event_name))
        
        feedback_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        app.logger.info(f"Feedback submitted: ID={feedback_id}, Type={type_of_feedback}")
        
        return jsonify({
            'status': 'success',
            'message': 'Feedback submitted successfully',
            'feedback_id': feedback_id
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error submitting feedback: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/feedback', methods=['GET'])
@login_required
@role_required(['admin'])
def get_feedback():
    """Get all feedback submissions (admin only)"""
    try:
        status_filter = request.args.get('status', 'all')
        
        conn = get_db()
        cursor = conn.cursor()
        
        if status_filter == 'all':
            cursor.execute('SELECT * FROM feedback ORDER BY created_at DESC')
        else:
            cursor.execute('SELECT * FROM feedback WHERE status = ? ORDER BY created_at DESC', (status_filter,))
        
        feedback_list = cursor.fetchall()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'feedback': [dict(f) for f in feedback_list],
            'count': len(feedback_list)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting feedback: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/feedback/<int:feedback_id>/status', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_feedback_status(feedback_id):
    """Update feedback status (admin only)"""
    try:
        data = request.get_json()
        new_status = data.get('status')
        
        if not new_status:
            return jsonify({'status': 'error', 'error': 'Status required'}), 400
        
        valid_statuses = ['new', 'read', 'responded', 'archived']
        if new_status not in valid_statuses:
            return jsonify({'status': 'error', 'error': f'Invalid status. Must be one of: {valid_statuses}'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('UPDATE feedback SET status = ? WHERE id = ?', (new_status, feedback_id))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Feedback not found'}), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Feedback #{feedback_id} status updated to {new_status}'
        })
        
    except Exception as e:
        app.logger.error(f"Error updating feedback status: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500
 
 
 
 
# ==================== STICKY NOTES ENDPOINTS ====================

@app.route('/api/sticky-notes', methods=['GET'])
def get_sticky_notes():
    """Get all sticky notes"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, note_text, position, is_active, created_at, updated_at
            FROM sticky_notes
            ORDER BY position ASC, created_at ASC
        ''')
        
        notes = cursor.fetchall()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'notes': [dict(note) for note in notes]
        })
        
    except Exception as e:
        app.logger.error(f"Error getting sticky notes: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/sticky-notes', methods=['POST'])
@login_required
@role_required(['admin'])
def create_sticky_note():
    """Create a new sticky note"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        note_text = data.get('note_text', '').strip()
        position = data.get('position')
        is_active = data.get('is_active', True)
        
        if not note_text:
            return jsonify({'status': 'error', 'error': 'Note text is required'}), 400
        
        if len(note_text) > 200:
            return jsonify({'status': 'error', 'error': 'Note text must be 200 characters or less'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # If position provided, shift existing positions
        if position is not None:
            cursor.execute('''
                UPDATE sticky_notes 
                SET position = position + 1 
                WHERE position >= ? AND position IS NOT NULL
            ''', (position,))
        
        cursor.execute('''
            INSERT INTO sticky_notes (note_text, position, is_active)
            VALUES (?, ?, ?)
        ''', (note_text, position if position is not None else None, 1 if is_active else 0))
        
        note_id = cursor.lastrowid
        conn.commit()
        
        # Fetch the created note
        cursor.execute('SELECT id, note_text, position, is_active, created_at, updated_at FROM sticky_notes WHERE id = ?', (note_id,))
        note = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Sticky note created successfully',
            'note': dict(note)
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error creating sticky note: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/sticky-notes/<int:note_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_sticky_note(note_id):
    """Update an existing sticky note"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if note exists
        cursor.execute('SELECT id FROM sticky_notes WHERE id = ?', (note_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Sticky note not found'}), 404
        
        update_fields = []
        update_values = []
        
        if 'note_text' in data:
            note_text = data['note_text'].strip()
            if not note_text:
                conn.close()
                return jsonify({'status': 'error', 'error': 'Note text cannot be empty'}), 400
            if len(note_text) > 200:
                conn.close()
                return jsonify({'status': 'error', 'error': 'Note text must be 200 characters or less'}), 400
            update_fields.append('note_text = ?')
            update_values.append(note_text)
        
        if 'position' in data:
            position = data['position']
            
            # Get current position
            cursor.execute('SELECT position FROM sticky_notes WHERE id = ?', (note_id,))
            old_position = cursor.fetchone()['position']
            
            # Adjust positions if needed
            if old_position != position:
                if position is None:
                    # Removing position - shift others down
                    cursor.execute('''
                        UPDATE sticky_notes 
                        SET position = position - 1 
                        WHERE position > ? AND position IS NOT NULL
                    ''', (old_position,))
                elif old_position is None:
                    # Adding position - shift others up
                    cursor.execute('''
                        UPDATE sticky_notes 
                        SET position = position + 1 
                        WHERE position >= ? AND position IS NOT NULL
                    ''', (position,))
                else:
                    # Moving to new position
                    if position > old_position:
                        cursor.execute('''
                            UPDATE sticky_notes 
                            SET position = position - 1 
                            WHERE position > ? AND position <= ?
                        ''', (old_position, position))
                    else:
                        cursor.execute('''
                            UPDATE sticky_notes 
                            SET position = position + 1 
                            WHERE position >= ? AND position < ?
                        ''', (position, old_position))
            
            update_fields.append('position = ?')
            update_values.append(position if position is not None else None)
        
        if 'is_active' in data:
            update_fields.append('is_active = ?')
            update_values.append(1 if data['is_active'] else 0)
        
        if not update_fields:
            conn.close()
            return jsonify({'status': 'error', 'error': 'No fields to update'}), 400
        
        update_fields.append('updated_at = CURRENT_TIMESTAMP')
        update_values.append(note_id)
        
        cursor.execute(f"UPDATE sticky_notes SET {', '.join(update_fields)} WHERE id = ?", update_values)
        conn.commit()
        
        # Fetch updated note
        cursor.execute('SELECT id, note_text, position, is_active, created_at, updated_at FROM sticky_notes WHERE id = ?', (note_id,))
        note = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Sticky note updated successfully',
            'note': dict(note)
        })
        
    except Exception as e:
        app.logger.error(f"Error updating sticky note: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/sticky-notes/<int:note_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_sticky_note(note_id):
    """Delete a sticky note"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get the position before deleting
        cursor.execute('SELECT position FROM sticky_notes WHERE id = ?', (note_id,))
        note = cursor.fetchone()
        
        if not note:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Sticky note not found'}), 404
        
        old_position = note['position']
        
        # Delete the note
        cursor.execute('DELETE FROM sticky_notes WHERE id = ?', (note_id,))
        
        # Shift remaining positions down
        if old_position is not None:
            cursor.execute('''
                UPDATE sticky_notes 
                SET position = position - 1 
                WHERE position > ? AND position IS NOT NULL
            ''', (old_position,))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Sticky note deleted successfully'
        })
        
    except Exception as e:
        app.logger.error(f"Error deleting sticky note: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== EMAIL ENDPOINTS ====================

@app.route('/api/send-email', methods=['POST'])
@login_required
@role_required(['admin'])
def api_send_email():
    """
    Send a generic email (admin only)
    
    Request body:
    {
        "to_email": "customer@example.com",
        "subject": "Your order is ready",
        "body": "Plain text message here..."
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        to_email = data.get('to_email', '').strip()
        subject = data.get('subject', '').strip()
        body = data.get('body', '').strip()
        
        # Validate required fields
        if not to_email:
            return jsonify({'status': 'error', 'error': 'Recipient email (to_email) is required'}), 400
        if not subject:
            return jsonify({'status': 'error', 'error': 'Subject is required'}), 400
        if not body:
            return jsonify({'status': 'error', 'error': 'Email body is required'}), 400
        
        # Basic email validation
        if '@' not in to_email or '.' not in to_email:
            return jsonify({'status': 'error', 'error': 'Invalid email address format'}), 400
        
        # Send the email
        success, message = send_email(to_email, subject, body)
        
        if success:
            app.logger.info(f"Admin {session.get('username')} sent email to {to_email}: {subject}")
            return jsonify({
                'status': 'success',
                'message': message,
                'to_email': to_email,
                'subject': subject
            }), 200
        else:
            return jsonify({
                'status': 'error',
                'error': message
            }), 500
        
    except Exception as e:
        app.logger.error(f"Error in send_email endpoint: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/test-email', methods=['POST'])
@login_required
@role_required(['admin'])
def api_test_email():
    """
    Send a test email to verify configuration (admin only)
    
    Request body:
    {
        "to_email": "your-test-email@gmail.com"  # optional, defaults to store email
    }
    """
    try:
        data = request.get_json() or {}
        to_email = data.get('to_email', GMAIL_USER)
        
        # Test email content
        subject = "PigStyle Music - Email Test"
        body = f"""This is a test email from PigStyle Music API.

Your email configuration is working correctly!

Sent by: {session.get('username', 'Admin')}
Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

If you received this, your Gmail SMTP settings are correct.

- PigStyle Music System
"""
        
        success, message = send_email(to_email, subject, body)
        
        if success:
            return jsonify({
                'status': 'success',
                'message': f'Test email sent to {to_email}',
                'to_email': to_email
            }), 200
        else:
            return jsonify({
                'status': 'error',
                'error': message
            }), 500
        
    except Exception as e:
        app.logger.error(f"Error in test email endpoint: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/email/status', methods=['GET'])
@login_required
@role_required(['admin'])
def api_email_status():
    """Check if email is configured (admin only)"""
    is_configured = bool(GMAIL_APP_PASSWORD)
    return jsonify({
        'status': 'success',
        'configured': is_configured,
        'from_email': GMAIL_USER if is_configured else None,
        'message': 'Email is configured and ready' if is_configured else 'Email not configured - set GMAIL_APP_PASSWORD'
    })

# ==================== ADMIN DATABASE QUERY ENDPOINTS ====================

@app.route('/api/admin/db-schema', methods=['GET', 'OPTIONS'])
def admin_db_schema():
    """Get database schema information for admin query tool"""
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 200
    
    try:
        # Check login
        if 'user_id' not in session or not session.get('logged_in'):
            return jsonify({
                'status': 'error',
                'message': 'Authentication required'
            }), 401
        
        # Check admin role
        if session.get('role') != 'admin':
            return jsonify({
                'status': 'error',
                'message': 'Admin access required'
            }), 403
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get all tables (exclude sqlite internal tables)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        tables = cursor.fetchall()
        
        schema = {'tables': {}}
        
        for table in tables:
            table_name = table['name']
            
            # Use double quotes to handle table names with special characters
            cursor.execute(f'PRAGMA table_info("{table_name}")')
            columns = cursor.fetchall()
            
            column_list = []
            for col in columns:
                column_list.append({
                    'column_name': col[1],  # name is at index 1
                    'data_type': col[2],     # type is at index 2
                    'is_primary': col[5] == 1,  # pk is at index 5
                    'is_nullable': 'YES' if col[3] == 0 else 'NO'  # notnull is at index 3 (0=nullable, 1=not null)
                })
            
            schema['tables'][table_name] = column_list
        
        conn.close()
        
        response = jsonify({
            'status': 'success',
            'schema': schema
        })
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response
        
    except Exception as e:
        app.logger.error(f"Error getting schema: {str(e)}")
        app.logger.error(traceback.format_exc())
        response = jsonify({
            'status': 'error', 
            'message': str(e)
        })
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 500


@app.route('/api/admin/execute-query', methods=['POST', 'OPTIONS'])
def admin_execute_query():
    """Execute SQL query (admin only)"""
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 200
    
    try:
        # Check login
        if 'user_id' not in session or not session.get('logged_in'):
            response = jsonify({
                'status': 'error',
                'message': 'Authentication required'
            })
            response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
            response.headers.add('Access-Control-Allow-Credentials', 'true')
            return response, 401
        
        # Check admin role
        if session.get('role') != 'admin':
            response = jsonify({
                'status': 'error',
                'message': 'Admin access required'
            })
            response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
            response.headers.add('Access-Control-Allow-Credentials', 'true')
            return response, 403
        
        data = request.get_json()
        query = data.get('query', '').strip()
        
        if not query:
            response = jsonify({'status': 'error', 'message': 'Query is required'})
            response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
            response.headers.add('Access-Control-Allow-Credentials', 'true')
            return response, 400
        
        # Basic security: prevent dangerous operations
        query_upper = query.upper()
        
        # Block certain dangerous commands
        dangerous_keywords = ['DROP DATABASE', 'DROP TABLE', 'TRUNCATE', 'ALTER DATABASE']
        for keyword in dangerous_keywords:
            if keyword in query_upper:
                response = jsonify({
                    'status': 'error', 
                    'message': f'Operation not allowed: {keyword}'
                })
                response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
                response.headers.add('Access-Control-Allow-Credentials', 'true')
                return response, 403
        
        # Log the query for audit
        app.logger.info(f"Admin user {session.get('username')} executing query: {query[:200]}")
        
        conn = get_db()
        cursor = conn.cursor()
        
        start_time = datetime.now()
        
        # Determine query type
        query_type = 'UNKNOWN'
        if query_upper.startswith('SELECT'):
            query_type = 'SELECT'
        elif query_upper.startswith('INSERT'):
            query_type = 'INSERT'
        elif query_upper.startswith('UPDATE'):
            query_type = 'UPDATE'
        elif query_upper.startswith('DELETE'):
            query_type = 'DELETE'
        elif query_upper.startswith('PRAGMA'):
            query_type = 'PRAGMA'
        
        try:
            if query_type == 'SELECT':
                cursor.execute(query)
                results = cursor.fetchall()
                # Convert to list of dicts
                results_list = [dict(row) for row in results]
                
                execution_time = (datetime.now() - start_time).total_seconds() * 1000
                
                response_data = {
                    'status': 'success',
                    'query_type': 'SELECT',
                    'results': results_list,
                    'row_count': len(results_list),
                    'execution_time': round(execution_time, 2)
                }
                
                response = jsonify(response_data)
                response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
                response.headers.add('Access-Control-Allow-Credentials', 'true')
                return response
                
            elif query_type in ['INSERT', 'UPDATE', 'DELETE']:
                cursor.execute(query)
                conn.commit()
                affected_rows = cursor.rowcount
                
                execution_time = (datetime.now() - start_time).total_seconds() * 1000
                
                response_data = {
                    'status': 'success',
                    'query_type': query_type,
                    'affected_rows': affected_rows,
                    'execution_time': round(execution_time, 2),
                    'message': f'{query_type} executed successfully'
                }
                
                # For INSERT, also return the last insert ID if available
                if query_type == 'INSERT' and cursor.lastrowid:
                    response_data['last_insert_id'] = cursor.lastrowid
                
                response = jsonify(response_data)
                response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
                response.headers.add('Access-Control-Allow-Credentials', 'true')
                return response
                
            elif query_type == 'PRAGMA':
                cursor.execute(query)
                results = cursor.fetchall()
                results_list = [dict(row) for row in results]
                
                response = jsonify({
                    'status': 'success',
                    'query_type': 'PRAGMA',
                    'results': results_list,
                    'row_count': len(results_list)
                })
                response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
                response.headers.add('Access-Control-Allow-Credentials', 'true')
                return response
                
            else:
                # Try to execute anyway for other query types
                cursor.execute(query)
                conn.commit()
                
                response = jsonify({
                    'status': 'success',
                    'query_type': 'UNKNOWN',
                    'message': 'Query executed successfully',
                    'affected_rows': cursor.rowcount
                })
                response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
                response.headers.add('Access-Control-Allow-Credentials', 'true')
                return response
                
        except sqlite3.Error as e:
            conn.rollback()
            response = jsonify({
                'status': 'error',
                'message': f'SQL Error: {str(e)}'
            })
            response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
            response.headers.add('Access-Control-Allow-Credentials', 'true')
            return response, 400
            
        finally:
            conn.close()
        
    except Exception as e:
        app.logger.error(f"Error executing admin query: {str(e)}")
        app.logger.error(traceback.format_exc())
        response = jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        })
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 500

# ==================== STATS ENDPOINTS ====================

@app.route('/api/stats/top-artists', methods=['GET'])
def get_top_artists_stats():
    """Get top selling artists by number of copies sold"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get top 10 artists by number of sold copies (status_id = 3)
    cursor.execute('''
        SELECT artist, COUNT(*) as copies_sold
        FROM records
        WHERE status_id = 3 AND artist IS NOT NULL AND artist != ''
        GROUP BY artist
        ORDER BY copies_sold DESC
         
    ''')
    
    results = cursor.fetchall()
    conn.close()
    
    artists = [row['artist'] for row in results]
    sales = [row['copies_sold'] for row in results]
    
    return jsonify({
        'status': 'success',
        'artists': artists,
        'sales': sales
    })


@app.route('/api/stats/sales-over-time', methods=['GET'])
def get_sales_over_time_stats():
    """Get sales revenue and units sold grouped by month"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get monthly sales data for the last 12 months
    cursor.execute('''
        SELECT 
            strftime('%Y-%m', date_sold) as month,
            COUNT(*) as units_sold,
            SUM(store_price) as total_revenue
        FROM records
        WHERE status_id = 3 AND date_sold IS NOT NULL
            AND date_sold >= date('now', '-12 months')
        GROUP BY strftime('%Y-%m', date_sold)
        ORDER BY month ASC
    ''')
    
    results = cursor.fetchall()
    conn.close()
    
    dates = [row['month'] for row in results]
    revenue = [float(row['total_revenue'] or 0) for row in results]
    units = [row['units_sold'] for row in results]
    
    return jsonify({
        'status': 'success',
        'dates': dates,
        'revenue': revenue,
        'units': units
    })


@app.route('/api/stats/status-distribution', methods=['GET'])
def get_status_distribution_stats():
    """Get distribution of records by status"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT 
            CASE r.status_id
                WHEN 1 THEN 'New'
                WHEN 2 THEN 'Active'
                WHEN 3 THEN 'Sold'
                WHEN 4 THEN 'Removed'
                ELSE 'Other'
            END as status_name,
            COUNT(*) as count
        FROM records r
        GROUP BY r.status_id
        ORDER BY r.status_id
    ''')
    
    results = cursor.fetchall()
    conn.close()
    
    statuses = [row['status_name'] for row in results]
    counts = [row['count'] for row in results]
    
    return jsonify({
        'status': 'success',
        'statuses': statuses,
        'counts': counts
    })


@app.route('/api/stats/condition-sales', methods=['GET'])
def get_condition_sales_stats():
    """Get sales broken down by media condition"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT 
            dc.condition_name as condition_name,
            COUNT(*) as units_sold
        FROM records r
        JOIN d_condition dc ON r.condition_disc_id = dc.id
        WHERE r.status_id = 3
        GROUP BY r.condition_disc_id
        ORDER BY units_sold DESC
    ''')
    
    results = cursor.fetchall()
    conn.close()
    
    conditions = [row['condition_name'] for row in results]
    sales = [row['units_sold'] for row in results]
    
    return jsonify({
        'status': 'success',
        'conditions': conditions,
        'sales': sales
    })


@app.route('/api/stats/top-genres', methods=['GET'])
def get_top_genres_stats():
    """Get top selling genres based on discogs_genre_raw"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get genres from sold records
    cursor.execute('''
        SELECT 
            CASE 
                WHEN discogs_genre_raw IS NOT NULL AND discogs_genre_raw != '' 
                THEN discogs_genre_raw
                ELSE 'Unknown'
            END as genre,
            COUNT(*) as units_sold
        FROM records
        WHERE status_id = 3
        GROUP BY 
            CASE 
                WHEN discogs_genre_raw IS NOT NULL AND discogs_genre_raw != '' 
                THEN discogs_genre_raw
                ELSE 'Unknown'
            END
        ORDER BY units_sold DESC
        LIMIT 10
    ''')
    
    results = cursor.fetchall()
    conn.close()
    
    genres = [row['genre'] for row in results]
    sales = [row['units_sold'] for row in results]
    
    return jsonify({
        'status': 'success',
        'genres': genres,
        'sales': sales
    })

@app.route('/api/stats/price-trends', methods=['GET'])
def get_price_trends_stats():
    """Get average list price vs sold price over time"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get average list price by month for last 12 months
    cursor.execute('''
        SELECT 
            strftime('%Y-%m', created_at) as month,
            AVG(store_price) as avg_list_price
        FROM records
        WHERE created_at IS NOT NULL
            AND created_at >= date('now', '-12 months')
        GROUP BY strftime('%Y-%m', created_at)
        ORDER BY month ASC
    ''')
    
    list_price_results = cursor.fetchall()
    
    # Get average sold price by month for last 12 months
    cursor.execute('''
        SELECT 
            strftime('%Y-%m', date_sold) as month,
            AVG(store_price) as avg_sold_price
        FROM records
        WHERE status_id = 3 AND date_sold IS NOT NULL
            AND date_sold >= date('now', '-12 months')
        GROUP BY strftime('%Y-%m', date_sold)
        ORDER BY month ASC
    ''')
    
    sold_price_results = cursor.fetchall()
    conn.close()
    
    # Create dictionaries for easy lookup
    list_prices_dict = {}
    for row in list_price_results:
        list_prices_dict[row['month']] = float(row['avg_list_price'] or 0)
    
    sold_prices_dict = {}
    for row in sold_price_results:
        sold_prices_dict[row['month']] = float(row['avg_sold_price'] or 0)
    
    # Get all unique months
    all_months_set = set(list_prices_dict.keys()) | set(sold_prices_dict.keys())
    all_months = sorted(list(all_months_set))
    
    list_prices = [list_prices_dict.get(month, 0) for month in all_months]
    sold_prices = [sold_prices_dict.get(month, 0) for month in all_months]
    
    return jsonify({
        'status': 'success',
        'months': all_months,
        'list_prices': list_prices,
        'sold_prices': sold_prices
    })

@app.route('/api/stats/sales-over-time-daily', methods=['GET'])
def get_sales_over_time_daily_stats():
    """Get daily sales revenue for all time (no smoothing)"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get daily sales data for ALL available dates
    cursor.execute('''
        SELECT 
            date_sold as date,
            SUM(store_price) as total_revenue
        FROM records
        WHERE status_id = 3 AND date_sold IS NOT NULL
        GROUP BY date_sold
        ORDER BY date_sold ASC
    ''')
    
    results = cursor.fetchall()
    conn.close()
    
    dates = [row['date'] for row in results]
    revenue = [float(row['total_revenue'] or 0) for row in results]
    
    return jsonify({
        'status': 'success',
        'dates': dates,
        'revenue': revenue
    })

# ==================== LOCATION-BASED ENDPOINTS FOR DISCOGS TAB ====================
@app.route('/api/locations', methods=['GET'])
def get_unique_locations():
    """Get unique bins (genre + bin, ignoring sublocation and counter)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT DISTINCT location 
            FROM records 
            WHERE location IS NOT NULL AND location != ''
        ''')
        
        locations = cursor.fetchall()
        conn.close()
        
        # REMOVE ALL print statements - use app.logger.debug instead if needed
        unique_bins = set()
        
        for row in locations:
            location = row['location']
            
            # Split by " | " separator
            if ' | ' in location:
                parts = location.split(' | ')
                
                # Keep only the first two parts (Genre and Bin)
                if len(parts) >= 2:
                    bin_location = ' | '.join(parts[:2])
                    unique_bins.add(bin_location)
            else:
                unique_bins.add(location)
        
        # Sort alphabetically
        bin_list = sorted(list(unique_bins))
        
        return jsonify({
            'status': 'success',
            'locations': bin_list,
            'count': len(bin_list)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting locations: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500



@app.route('/api/records/by-location', methods=['GET'])
def get_records_by_location():
    """Get all records matching a bin (genre + bin), with or without sublocation"""
    try:
        bin_pattern = request.args.get('location', '').strip()
        
        if not bin_pattern:
            return jsonify({'status': 'error', 'error': 'Location parameter required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Use a simpler query without multiple pattern attempts
        # Just match locations that START with the bin_pattern
        search_pattern = bin_pattern + '%'
        
        cursor.execute('''
            SELECT 
                r.id, r.artist, r.title, r.barcode, r.image_url, 
                r.catalog_number, r.store_price, r.location, 
                r.status_id, r.notes, r.created_at, r.last_seen,   -- ✅ ADDED last_seen
                COALESCE(cs.condition_name, '') as sleeve_condition_name,
                COALESCE(cd.condition_name, '') as disc_condition_name,
                COALESCE(s.status_name, '') as status_name
            FROM records r
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            LEFT JOIN d_status s ON r.status_id = s.id
            WHERE r.location LIKE ? OR r.location = ?
            ORDER BY r.location, r.created_at DESC
        ''', (search_pattern, bin_pattern))
        
        records = cursor.fetchall()
        conn.close()
        
        records_list = []
        for record in records:
            records_list.append({
                'id': record['id'],
                'artist': record['artist'],
                'title': record['title'],
                'barcode': record['barcode'],
                'image_url': record['image_url'],
                'catalog_number': record['catalog_number'],
                'store_price': float(record['store_price']) if record['store_price'] else 0,
                'location': record['location'],
                'status_id': record['status_id'],
                'status_name': record['status_name'],
                'notes': record['notes'],
                'created_at': record['created_at'],
                'last_seen': record['last_seen'],   # ✅ ADDED last_seen to output
                'sleeve_condition_name': record['sleeve_condition_name'],
                'disc_condition_name': record['disc_condition_name']
            })
        
        return jsonify({
            'status': 'success',
            'records': records_list,
            'count': len(records_list),
            'location_pattern': bin_pattern
        })
        
    except Exception as e:
        app.logger.error(f"Error getting records by location: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== MARKUP RULES ENDPOINTS ====================

@app.route('/api/stats/created-at-distribution', methods=['GET'])
def get_created_at_distribution_stats():
    """Get distribution of records by created_at month"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get all records grouped by month of creation
    cursor.execute('''
        SELECT 
            strftime('%Y-%m', created_at) as month,
            COUNT(*) as count
        FROM records
        WHERE created_at IS NOT NULL
        GROUP BY strftime('%Y-%m', created_at)
        ORDER BY month ASC
    ''')
    
    results = cursor.fetchall()
    conn.close()
    
    months = [row['month'] for row in results]
    counts = [row['count'] for row in results]
    
    return jsonify({
        'status': 'success',
        'months': months,
        'counts': counts
    })

@app.route('/api/markup-rules', methods=['GET'])
def get_markup_rules():
    """Get all markup rules"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, days_old, markup_percent, description FROM markup_rules ORDER BY days_old ASC')
        rules = cursor.fetchall()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'rules': [dict(rule) for rule in rules]
        })
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/markup-rules', methods=['POST'])
@login_required
@role_required(['admin'])
def create_markup_rule():
    """Create a new markup rule"""
    try:
        data = request.json
        days_old = data.get('days_old')
        markup_percent = data.get('markup_percent')
        description = data.get('description', '')
        
        if days_old is None or markup_percent is None:
            return jsonify({'status': 'error', 'error': 'days_old and markup_percent required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO markup_rules (days_old, markup_percent, description)
            VALUES (?, ?, ?)
        ''', (days_old, markup_percent, description))
        rule_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'id': rule_id})
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/markup-rules/<int:rule_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_markup_rule(rule_id):
    """Update a markup rule"""
    try:
        data = request.json
        conn = get_db()
        cursor = conn.cursor()
        
        updates = []
        params = []
        
        if 'days_old' in data:
            updates.append('days_old = ?')
            params.append(data['days_old'])
        if 'markup_percent' in data:
            updates.append('markup_percent = ?')
            params.append(data['markup_percent'])
        if 'description' in data:
            updates.append('description = ?')
            params.append(data['description'])
        
        if not updates:
            conn.close()
            return jsonify({'status': 'error', 'error': 'No fields to update'}), 400
        
        updates.append('updated_at = CURRENT_TIMESTAMP')
        params.append(rule_id)
        
        cursor.execute(f'UPDATE markup_rules SET {", ".join(updates)} WHERE id = ?', params)
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/markup-rules/<int:rule_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_markup_rule(rule_id):
    """Delete a markup rule"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM markup_rules WHERE id = ?', (rule_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


def calculate_markup_for_record(created_at_date, store_price):
    """Calculate the Discogs price based on record age and markup rules"""
    from datetime import datetime, date
    
    # Parse created_at - handle both date and datetime strings
    if isinstance(created_at_date, str):
        try:
            created_date = datetime.strptime(created_at_date.split('T')[0], '%Y-%m-%d').date()
        except:
            try:
                created_date = datetime.strptime(created_at_date, '%Y-%m-%d %H:%M:%S').date()
            except:
                try:
                    created_date = datetime.strptime(created_at_date, '%Y-%m-%d').date()
                except:
                    print(f"⚠️ Could not parse date: {created_at_date}, using today")
                    created_date = date.today()
    else:
        created_date = created_at_date
    
    # Calculate days old
    today = date.today()
    days_old = (today - created_date).days
    
    # Get markup rules from database
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT days_old, markup_percent FROM markup_rules ORDER BY days_old ASC')
    rules = cursor.fetchall()
    conn.close()
    
    if not rules or len(rules) == 0:
        # No rules found - return store price with 0% markup
        print(f"⚠️ No markup rules found! Using 0% markup for record {days_old} days old")
        return {
            'days_old': days_old,
            'markup_percent': 0,
            'store_price': store_price,
            'discogs_price': store_price
        }
    
    # Interpolate markup based on days old
    markup_percent = interpolate_markup(days_old, rules)
    
    # Calculate Discogs price
    discogs_price = store_price * (1 + markup_percent / 100)
    discogs_price = round(discogs_price, 2)
    
    print(f"📅 Record age: {days_old} days, Markup: {markup_percent}%, Store: ${store_price}, Discogs: ${discogs_price}")
    
    return {
        'days_old': days_old,
        'markup_percent': round(markup_percent, 1),
        'store_price': store_price,
        'discogs_price': discogs_price
    }

def interpolate_markup(days_old, rules):
    """Interpolate markup percentage between rule points"""
    if not rules:
        return 0
    
    rules_list = [(r['days_old'], r['markup_percent']) for r in rules]
    rules_list.sort()
    
    # If days_old is less than first rule, use first rule
    if days_old <= rules_list[0][0]:
        return rules_list[0][1]
    
    # If days_old is greater than last rule, use last rule
    if days_old >= rules_list[-1][0]:
        return rules_list[-1][1]
    
    # Find the two rules to interpolate between
    for i in range(len(rules_list) - 1):
        if rules_list[i][0] <= days_old <= rules_list[i+1][0]:
            x1, y1 = rules_list[i]
            x2, y2 = rules_list[i+1]
            
            # Linear interpolation
            if x2 == x1:
                return y1
            
            t = (days_old - x1) / (x2 - x1)
            return y1 + t * (y2 - y1)
    
    return rules_list[-1][1]
  
@app.route('/api/discogs/calculate-markup', methods=['POST'])
def calculate_markup():
    """Calculate Discogs price based on record age and markup rules (NO FALLBACK)"""
    try:
        data = request.json
        created_at = data.get('created_at')
        store_price = float(data.get('store_price', 0))
        
        if not created_at:
            return jsonify({'success': False, 'error': 'created_at required'}), 400
        
        # Get markup rules from database
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT days_old, markup_percent FROM markup_rules ORDER BY days_old ASC')
        rules = cursor.fetchall()
        conn.close()
        
        # NO FALLBACK - if no rules, return error
        if not rules or len(rules) == 0:
            return jsonify({
                'success': False, 
                'error': 'No markup rules configured. Please add markup rules in the Discogs tab.'
            }), 400
        
        # Parse created_at date
        from datetime import datetime, date
        if isinstance(created_at, str):
            try:
                created_date = datetime.strptime(created_at.split('T')[0], '%Y-%m-%d').date()
            except:
                try:
                    created_date = datetime.strptime(created_at, '%Y-%m-%d %H:%M:%S').date()
                except:
                    try:
                        created_date = datetime.strptime(created_at, '%Y-%m-%d').date()
                    except:
                        return jsonify({'success': False, 'error': f'Could not parse date: {created_at}'}), 400
        else:
            created_date = created_at
        
        # Calculate days old
        today = date.today()
        days_old = (today - created_date).days
        
        # Calculate markup percentage
        markup_percent = interpolate_markup(days_old, rules)
        
        # Calculate Discogs price
        discogs_price = round(store_price * (1 + markup_percent / 100), 2)
        
        return jsonify({
            'success': True,
            'days_old': days_old,
            'markup_percent': round(markup_percent, 1),
            'store_price': store_price,
            'discogs_price': discogs_price
        })
        
    except Exception as e:
        app.logger.error(f"Error calculating markup: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/price-estimate-v3', methods=['POST'])
def price_estimate_v3():
    """Self-contained Discogs price estimator - no external class dependencies, NO FALLBACKS"""
    import requests
    import re
    from enum import Enum
    from typing import Tuple
    
    # Log the incoming request
    app.logger.info("=" * 60)
    app.logger.info("🔍 PRICE ESTIMATE V3 CALLED")
    app.logger.info(f"Request data: {request.json}")
    
    # ============================================
    # CONDITION ENUM (defined inside endpoint)
    # ============================================
    class Condition(Enum):
        MINT = "Mint (M)"
        NEAR_MINT = "Near Mint (NM)"
        VERY_GOOD_PLUS = "Very Good Plus (VG+)"
        VERY_GOOD = "Very Good (VG)"
        GOOD = "Good (G)"
        FAIR = "Fair (F)"
        POOR = "Poor (P)"
        
        @classmethod
        def from_string(cls, condition_str: str):
            """Convert string to Condition enum - NO FALLBACK, raises error if not found"""
            # Try direct match first (comparing enum values)
            for condition in cls:
                if condition.value.lower() == condition_str.lower():
                    app.logger.info(f"   Direct match: '{condition_str}' -> {condition.value}")
                    return condition
            
            # Try cleaning parentheses and matching
            cleaned = condition_str.lower().strip()
            cleaned = re.sub(r'\s*\([^)]*\)', '', cleaned).strip()
            
            # Exact matches after cleaning
            exact_matches = {
                'mint': cls.MINT, 'm': cls.MINT,
                'nm': cls.NEAR_MINT, 'near mint': cls.NEAR_MINT,
                'vg+': cls.VERY_GOOD_PLUS, 'vgplus': cls.VERY_GOOD_PLUS, 'very good plus': cls.VERY_GOOD_PLUS,
                'vg': cls.VERY_GOOD, 'very good': cls.VERY_GOOD,
                'g+': cls.GOOD, 'good plus': cls.GOOD,
                'g': cls.GOOD, 'good': cls.GOOD,
                'f': cls.FAIR, 'fair': cls.FAIR,
                'p': cls.POOR, 'poor': cls.POOR
            }
            
            if cleaned in exact_matches:
                result = exact_matches[cleaned]
                app.logger.info(f"   Cleaned match: '{condition_str}' -> cleaned: '{cleaned}' -> {result.value}")
                return result
            
            # NO FALLBACK - raise error if condition not found
            raise ValueError(f"Unknown condition: '{condition_str}'. Valid conditions: Mint, Near Mint, Very Good Plus, Very Good, Good, Fair, Poor")
    
    # ============================================
    # HELPER FUNCTIONS
    # ============================================
    def get_condition_multiplier(media_condition: Condition, sleeve_condition: Condition) -> float:
        multipliers = {
            Condition.MINT: 1.35, Condition.NEAR_MINT: 1.00,
            Condition.VERY_GOOD_PLUS: 0.80, Condition.VERY_GOOD: 0.55,
            Condition.GOOD: 0.25, Condition.FAIR: 0.15, Condition.POOR: 0.08
        }
        media_mult = multipliers.get(media_condition)
        sleeve_mult = multipliers.get(sleeve_condition)
        
        # NO FALLBACK - if multiplier not found, raise error
        if media_mult is None:
            raise ValueError(f"No multiplier defined for media condition: {media_condition.value}")
        if sleeve_mult is None:
            raise ValueError(f"No multiplier defined for sleeve condition: {sleeve_condition.value}")
        
        return round((media_mult * 0.7) + (sleeve_mult * 0.3), 3)
    
    def calculate_demand_adjustment(wants: int, haves: int) -> Tuple[float, float]:
        if haves == 0:
            return 1.0, 0.0
        ratio = wants / haves
        if ratio >= 2.0: adjustment = 1.25
        elif ratio >= 1.5: adjustment = 1.15
        elif ratio >= 1.0: adjustment = 1.05
        elif ratio >= 0.5: adjustment = 1.00
        elif ratio >= 0.2: adjustment = 0.95
        else: adjustment = 0.85
        return adjustment, ratio
    
    def calculate_confidence(num_sales: int, want_have_ratio: float) -> float:
        sales_confidence = min(num_sales / 30.0, 1.0) * 70
        if 0.5 <= want_have_ratio <= 2.0: ratio_confidence = 30
        elif 0.2 <= want_have_ratio <= 5.0: ratio_confidence = 15
        else: ratio_confidence = 5
        return min(sales_confidence + ratio_confidence, 100)
    
    # ============================================
    # MAIN LOGIC
    # ============================================
    try:
        data = request.json
        catalog_number = data.get('catalog_number', '').strip()
        media_condition = data.get('media_condition', '').strip()
        sleeve_condition = data.get('sleeve_condition', '').strip()
        
        # DEBUG: Log what was received
        app.logger.info(f"📥 RECEIVED PARAMETERS:")
        app.logger.info(f"   catalog_number: '{catalog_number}'")
        app.logger.info(f"   media_condition: '{media_condition}'")
        app.logger.info(f"   sleeve_condition: '{sleeve_condition}'")
        
        # Validation
        if not catalog_number:
            app.logger.error("❌ catalog_number is missing")
            return jsonify({'status': 'error', 'error': 'catalog_number is required'}), 400
        if not media_condition:
            app.logger.error("❌ media_condition is missing")
            return jsonify({'status': 'error', 'error': 'media_condition is required'}), 400
        if not sleeve_condition:
            app.logger.error("❌ sleeve_condition is missing")
            return jsonify({'status': 'error', 'error': 'sleeve_condition is required'}), 400
        
        # Get Discogs token
        discogs_token = os.environ.get('DISCOGS_USER_TOKEN')
        if not discogs_token:
            app.logger.error("❌ DISCOGS_USER_TOKEN not configured")
            return jsonify({'status': 'error', 'error': 'DISCOGS_USER_TOKEN not configured'}), 500
        
        headers = {
            'User-Agent': 'PigStyleMusic/1.0',
            'Authorization': f'Discogs token={discogs_token}'
        }
        
        # Step 1: Search for release by catalog number
        app.logger.info(f"🔍 Searching Discogs for catalog: {catalog_number}")
        search_url = "https://api.discogs.com/database/search"
        params = {'q': catalog_number, 'type': 'release', 'per_page': 5}
        
        search_response = requests.get(search_url, headers=headers, params=params, timeout=10)
        app.logger.info(f"   Search response status: {search_response.status_code}")
        
        if search_response.status_code != 200:
            app.logger.error(f"❌ Discogs search failed: {search_response.status_code}")
            return jsonify({'status': 'error', 'error': f'Discogs search failed: {search_response.status_code}'}), 500
        
        search_data = search_response.json()
        results = search_data.get('results', [])
        
        if not results:
            app.logger.error(f"❌ No release found for catalog: {catalog_number}")
            return jsonify({'status': 'error', 'error': f'No release found for catalog: {catalog_number}'}), 404
        
        # Find exact catalog match
        release = None
        for result in results:
            catno = result.get('catno', '')
            if catalog_number.lower() in [c.lower() for c in catno.split(',')]:
                release = result
                break
        
        if not release:
            release = results[0]
            app.logger.warning(f"⚠️ No exact catalog match, using first result: {release.get('catno', '')}")
        
        release_id = release['id']
        release_title = release.get('title', 'Unknown')
        app.logger.info(f"✅ Found release: {release_title} (ID: {release_id})")
        
        # Step 2: Get release stats
        stats_url = f"https://api.discogs.com/releases/{release_id}/stats"
        stats_response = requests.get(stats_url, headers=headers, timeout=10)
        stats = stats_response.json() if stats_response.status_code == 200 else None
        app.logger.info(f"📊 Stats response status: {stats_response.status_code}")
        
        # Step 3: Get marketplace stats
        marketplace_url = f"https://api.discogs.com/marketplace/stats/{release_id}"
        marketplace_response = requests.get(marketplace_url, headers=headers, timeout=10)
        marketplace = marketplace_response.json() if marketplace_response.status_code == 200 else None
        app.logger.info(f"💰 Marketplace response status: {marketplace_response.status_code}")
        
        # Step 4: Calculate base price
        fallback_price = 20.0
        
        if marketplace and 'median' in marketplace:
            base_median_price = marketplace['median']
            num_sales = marketplace.get('num_sales', 0)
            app.logger.info(f"📈 Base median price from marketplace: ${base_median_price}")
        elif stats:
            community_rating = stats.get('community', {}).get('rating', {}).get('average', 3.5)
            base_median_price = fallback_price * (community_rating / 3.0)
            num_sales = 0
            app.logger.info(f"📈 Base price estimated from rating: ${base_median_price}")
        else:
            base_median_price = fallback_price
            num_sales = 0
            app.logger.info(f"📈 Using fallback price: ${base_median_price}")
        
        # Step 5: Parse conditions from user input - THIS WILL THROW ERROR IF CONDITION NOT FOUND
        app.logger.info(f"🎚️ Parsing conditions - Media: '{media_condition}', Sleeve: '{sleeve_condition}'")
        try:
            media_cond = Condition.from_string(media_condition)
            sleeve_cond = Condition.from_string(sleeve_condition)
        except ValueError as e:
            app.logger.error(f"❌ Condition parsing error: {str(e)}")
            return jsonify({'status': 'error', 'error': str(e)}), 400
        
        app.logger.info(f"   Parsed media: {media_cond.value}")
        app.logger.info(f"   Parsed sleeve: {sleeve_cond.value}")
        
        # Step 6: Calculate condition multiplier - THIS WILL THROW ERROR IF MULTIPLIER NOT FOUND
        try:
            condition_mult = get_condition_multiplier(media_cond, sleeve_cond)
        except ValueError as e:
            app.logger.error(f"❌ Multiplier error: {str(e)}")
            return jsonify({'status': 'error', 'error': str(e)}), 400
        
        app.logger.info(f"📊 Condition multiplier: {condition_mult}")
        
        # Step 7: Calculate demand adjustment
        wants = stats.get('community', {}).get('want', 0) if stats else 0
        haves = stats.get('community', {}).get('have', 0) if stats else 0
        demand_adjust, want_have_ratio = calculate_demand_adjustment(wants, haves)
        app.logger.info(f"📊 Demand adjustment: {demand_adjust} (Want/Have ratio: {want_have_ratio:.2f})")
        
        # Step 8: Calculate final price
        estimated_price = base_median_price * condition_mult * demand_adjust
        app.logger.info(f"💰 Estimated price: ${estimated_price:.2f}")
        
        # Step 9: Calculate price range
        condition_variance = 1.0 - (condition_mult / 1.35)
        price_range_low = estimated_price * (0.85 - (condition_variance * 0.15))
        price_range_high = estimated_price * (1.15 + (condition_variance * 0.15))
        
        # Step 10: Calculate confidence
        confidence = calculate_confidence(num_sales, want_have_ratio)
        
        # Step 11: Return result
        result = {
            'status': 'success',
            'catalog_number': catalog_number,
            'release_id': release_id,
            'release_title': release_title,
            'media_condition_input': media_condition,
            'sleeve_condition_input': sleeve_condition,
            'media_condition_parsed': media_cond.value,
            'sleeve_condition_parsed': sleeve_cond.value,
            'estimated_price': round(estimated_price, 2),
            'price_range_low': round(price_range_low, 2),
            'price_range_high': round(price_range_high, 2),
            'confidence_score': round(confidence, 1),
            'condition_multiplier': condition_mult,
            'demand_adjustment': round(demand_adjust, 2),
            'base_median_price': round(base_median_price, 2),
            'want_have_ratio': round(want_have_ratio, 2),
            'num_sales': num_sales
        }
        
        app.logger.info(f"✅ Returning result: estimated_price = ${result['estimated_price']}")
        app.logger.info("=" * 60)
        
        return jsonify(result)
        
    except Exception as e:
        app.logger.error(f"❌ Price estimate error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/stats/sales-history', methods=['POST'])
def get_sales_history():
    """Get sales history - two levels: by artist, and by artist+title"""
    try:
        data = request.json
        artist = data.get('artist', '').strip()
        title = data.get('title', '').strip()
        
        app.logger.info("=" * 60)
        app.logger.info(f"📊 Sales history requested for: '{artist}' - '{title}'")
        
        if not artist:
            return jsonify({
                'status': 'error',
                'error': 'artist is required'
            }), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # ============================================
        # LEVEL 1: ARTIST-LEVEL SALES
        # How many times has this artist sold ANY record?
        # ============================================
        cursor.execute('''
            SELECT 
                COUNT(*) as total_sold,
                COUNT(DISTINCT title) as unique_titles,
                MAX(date_sold) as last_sold_date,
                AVG(store_price) as avg_sold_price,
                MIN(store_price) as min_sold_price,
                MAX(store_price) as max_sold_price,
                SUM(store_price) as total_revenue
            FROM records
            WHERE artist LIKE ? 
              AND status_id IN (3, 4)
              AND date_sold IS NOT NULL
        ''', (f'%{artist}%',))
        
        artist_stats = cursor.fetchone()
        
        # Get top selling titles for this artist
        cursor.execute('''
            SELECT 
                title,
                COUNT(*) as sold_count,
                MAX(date_sold) as last_sold,
                AVG(store_price) as avg_price
            FROM records
            WHERE artist LIKE ? 
              AND status_id IN (3, 4)
              AND date_sold IS NOT NULL
              AND title IS NOT NULL
              AND title != ''
            GROUP BY title
            ORDER BY sold_count DESC
            LIMIT 5
        ''', (f'%{artist}%',))
        
        top_titles = cursor.fetchall()
        
        # ============================================
        # LEVEL 2: ARTIST + TITLE LEVEL
        # How many times has this specific record sold?
        # ============================================
        title_stats = {
            'total_sold': 0,
            'last_sold_date': None,
            'avg_sold_price': None,
            'min_sold_price': None,
            'max_sold_price': None,
            'total_revenue': 0
        }
        
        if title:
            cursor.execute('''
                SELECT 
                    COUNT(*) as total_sold,
                    MAX(date_sold) as last_sold_date,
                    AVG(store_price) as avg_sold_price,
                    MIN(store_price) as min_sold_price,
                    MAX(store_price) as max_sold_price,
                    SUM(store_price) as total_revenue
                FROM records
                WHERE artist LIKE ? 
                  AND title LIKE ?
                  AND status_id IN (3, 4)
                  AND date_sold IS NOT NULL
            ''', (f'%{artist}%', f'%{title}%'))
            
            title_stats = cursor.fetchone()
            
            # Get condition breakdown for this specific title
            cursor.execute('''
                SELECT 
                    dc.condition_name,
                    dc.display_name,
                    COUNT(*) as sold_count
                FROM records r
                JOIN d_condition dc ON r.condition_disc_id = dc.id
                WHERE r.artist LIKE ? 
                  AND r.title LIKE ?
                  AND r.status_id IN (3, 4)
                GROUP BY r.condition_disc_id
                ORDER BY sold_count DESC
            ''', (f'%{artist}%', f'%{title}%'))
            
            condition_breakdown = cursor.fetchall()
            
            # Get recent sales for this specific title
            cursor.execute('''
                SELECT 
                    r.id,
                    r.store_price,
                    r.date_sold,
                    dc.condition_name as condition
                FROM records r
                JOIN d_condition dc ON r.condition_disc_id = dc.id
                WHERE r.artist LIKE ? 
                  AND r.title LIKE ?
                  AND r.status_id IN (3, 4)
                  AND r.date_sold IS NOT NULL
                ORDER BY r.date_sold DESC
                LIMIT 5
            ''', (f'%{artist}%', f'%{title}%'))
            
            recent_sales = cursor.fetchall()
        else:
            condition_breakdown = []
            recent_sales = []
        
        conn.close()
        
        # Format response
        result = {
            'status': 'success',
            'artist': artist,
            'title': title if title else None,
            # Artist-level stats
            'artist_stats': {
                'total_sold': artist_stats['total_sold'] if artist_stats['total_sold'] else 0,
                'unique_titles': artist_stats['unique_titles'] if artist_stats['unique_titles'] else 0,
                'last_sold_date': artist_stats['last_sold_date'] if artist_stats['last_sold_date'] else None,
                'avg_sold_price': round(float(artist_stats['avg_sold_price']), 2) if artist_stats['avg_sold_price'] else None,
                'min_sold_price': round(float(artist_stats['min_sold_price']), 2) if artist_stats['min_sold_price'] else None,
                'max_sold_price': round(float(artist_stats['max_sold_price']), 2) if artist_stats['max_sold_price'] else None,
                'total_revenue': round(float(artist_stats['total_revenue']), 2) if artist_stats['total_revenue'] else 0,
                'top_titles': [
                    {
                        'title': row['title'],
                        'sold_count': row['sold_count'],
                        'last_sold': row['last_sold'],
                        'avg_price': round(float(row['avg_price']), 2) if row['avg_price'] else None
                    } for row in top_titles
                ]
            },
            # Title-level stats (only if title provided)
            'title_stats': {
                'total_sold': title_stats['total_sold'] if title_stats['total_sold'] else 0,
                'last_sold_date': title_stats['last_sold_date'] if title_stats['last_sold_date'] else None,
                'avg_sold_price': round(float(title_stats['avg_sold_price']), 2) if title_stats['avg_sold_price'] else None,
                'min_sold_price': round(float(title_stats['min_sold_price']), 2) if title_stats['min_sold_price'] else None,
                'max_sold_price': round(float(title_stats['max_sold_price']), 2) if title_stats['max_sold_price'] else None,
                'total_revenue': round(float(title_stats['total_revenue']), 2) if title_stats['total_revenue'] else 0,
                'condition_breakdown': [
                    {
                        'condition_name': row['condition_name'],
                        'display_name': row['display_name'],
                        'sold_count': row['sold_count']
                    } for row in condition_breakdown
                ] if title else [],
                'recent_sales': [
                    {
                        'id': row['id'],
                        'price': float(row['store_price']),
                        'date_sold': row['date_sold'],
                        'condition': row['condition']
                    } for row in recent_sales
                ] if title else []
            }
        }
        
        app.logger.info(f"✅ Artist total sold: {result['artist_stats']['total_sold']}")
        if title:
            app.logger.info(f"✅ Title total sold: {result['title_stats']['total_sold']}")
        app.logger.info("=" * 60)
        
        return jsonify(result)
        
    except Exception as e:
        app.logger.error(f"Error getting sales history: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)