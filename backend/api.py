import string
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

import requests
import base64
from flask import Flask, jsonify, request, session, redirect, send_from_directory
from flask_cors import CORS
import sqlite3
from datetime import datetime, timedelta, date
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
from datetime import datetime
import re

# ===== NEW IMPORTS FOR ACCOUNTING =====
from decimal import Decimal
import csv
import io

# ===== NEW IMPORTS FOR PLAID =====
import plaid
from plaid.api import plaid_api
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest

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


# ==================== HELPER: GET CASH ACCOUNT BY SOURCE TYPE ====================

def get_cash_account_id(source_type):
    """
    Return the account_id for the cash account associated with the given source type.
    Mapping is stored in app_config:
        cash_account_plaid    -> account id for FNBO (e.g., '1011')
        cash_account_historic -> account id for Bluevine (e.g., '1010')
    If not set, fallback to account with code '1010'.
    """
    conn = get_db()
    cursor = conn.cursor()
    if source_type == 'plaid':
        key = 'cash_account_plaid'
    elif source_type == 'historic':
        key = 'cash_account_historic'
    else:
        # fallback to default cash account
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1010',))
        row = cursor.fetchone()
        conn.close()
        return row['id'] if row else None

    cursor.execute('SELECT config_value FROM app_config WHERE config_key = ?', (key,))
    row = cursor.fetchone()
    conn.close()
    if row:
        try:
            acc_id = int(row['config_value'])
            # verify it exists
            conn2 = get_db()
            cur2 = conn2.cursor()
            cur2.execute('SELECT id FROM accounts WHERE id = ?', (acc_id,))
            if cur2.fetchone():
                conn2.close()
                return acc_id
            conn2.close()
        except:
            pass
    # fallback to default
    conn3 = get_db()
    cur3 = conn3.cursor()
    cur3.execute('SELECT id FROM accounts WHERE code = ?', ('1010',))
    row3 = cur3.fetchone()
    conn3.close()
    return row3['id'] if row3 else None


def get_transactions_matching_filter(search, unprocessed_only, source_type):
    """
    Returns a list of transaction dicts that match the given filter.
    Adds 'processed' flag, 'source_type' ('plaid' or 'historic'), and if processed,
    the 'account_id' of the non-cash account and 'cash_account_id'.
    """
    # Fetch Plaid transactions
    plaid_tx = fetch_bank_transactions()  # returns list with id, date, amount, description
    for tx in plaid_tx:
        tx['source_type'] = 'plaid'

    # Fetch historic transactions from bank_transactions table
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, transaction_date as date, amount, description, processed
        FROM bank_transactions
        ORDER BY transaction_date DESC
    ''')
    historic_rows = cursor.fetchall()
    conn.close()
    historic_tx = []
    for row in historic_rows:
        historic_tx.append({
            'id': row['id'],
            'date': row['date'],
            'amount': row['amount'] / 100.0,  # stored in cents
            'description': row['description'],
            'processed': bool(row['processed']),
            'source_type': 'historic'
        })

    all_tx = plaid_tx + historic_tx

    # Apply search filter
    if search:
        search_lower = search.lower()
        all_tx = [tx for tx in all_tx if search_lower in tx.get('description', '').lower()]

    # Filter by source_type if provided
    if source_type:
        all_tx = [tx for tx in all_tx if tx.get('source_type') == source_type]

    # Determine processed status and account_id for each transaction
    conn = get_db()
    cursor = conn.cursor()

    for tx in all_tx:
        tx_id = str(tx['id'])
        source_type_val = tx['source_type']
        # Get the cash account for this source type
        cash_id = get_cash_account_id(source_type_val)
        if not cash_id:
            # fallback to 1010
            cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1010',))
            row = cursor.fetchone()
            cash_id = row['id'] if row else None

        # Check if a journal entry exists for this transaction
        cursor.execute('''
            SELECT je.id FROM journal_entries je
            WHERE je.source_type = ? AND je.source_id = ?
        ''', (source_type_val, tx_id))
        entry = cursor.fetchone()
        if entry:
            tx['processed'] = True
            # Get both lines
            cursor.execute('''
                SELECT jl.account_id, a.code
                FROM journal_lines jl
                JOIN accounts a ON a.id = jl.account_id
                WHERE jl.journal_entry_id = ?
            ''', (entry['id'],))
            lines = cursor.fetchall()
            # Determine which line is cash
            cash_account_id = None
            non_cash_account_id = None
            for line in lines:
                if line['account_id'] == cash_id:
                    cash_account_id = line['account_id']
                else:
                    non_cash_account_id = line['account_id']
            # If cash not found (shouldn't happen), fallback
            if not cash_account_id:
                cash_account_id = cash_id
            tx['cash_account_id'] = cash_account_id
            tx['account_id'] = non_cash_account_id
        else:
            tx['processed'] = False
            tx['account_id'] = None
            tx['cash_account_id'] = None

    conn.close()

    # Filter unprocessed if requested
    if unprocessed_only:
        all_tx = [tx for tx in all_tx if not tx['processed']]

    return all_tx


def parse_plaid_date(date_str):
    """Convert various date formats to YYYY-MM-DD."""
    if date_str is None:
        return None
    
    # If it's already a date or datetime object, convert to ISO string
    if isinstance(date_str, (date, datetime)):
        return date_str.isoformat()
    
    # Ensure it's a string
    if not isinstance(date_str, str):
        date_str = str(date_str)
    
    # Clean up common prefixes
    date_str = date_str.strip()
    
    # Try ISO format first (e.g., '2026-06-22' or '2026-06-22T...')
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00')).date().isoformat()
    except:
        pass
    
    # Try RFC 2822 (e.g., 'Mon, 15 Jun 2026 00:00:00 GMT')
    try:
        return datetime.strptime(date_str, '%a, %d %b %Y %H:%M:%S %Z').date().isoformat()
    except:
        pass
    
    # Try the mangled format: 'un 2-06-22' or 'ay 2-05-18'
    match = re.search(r'(\d{2})-(\d{2})-(\d{2})$', date_str)
    if match:
        month = match.group(1)
        day = match.group(2)
        year = '20' + match.group(3)
        return f"{year}-{month}-{day}"
    
    # Fallback to today
    return datetime.now().date().isoformat()


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
    """Update order status and mark records as sold after successful payment."""
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
            
            # --- Auto‑accounting removed ---
            
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
    Set COGS for selected records by distributing a batch total
    proportionally based on each record's store_price.
    
    Request body: { 
        "batch_cogs": 100.00,
        "record_ids": [1, 2, 3, ...]  # Array of record IDs to update
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'batch_cogs' not in data:
            return jsonify({'status': 'error', 'error': 'batch_cogs required'}), 400
        
        batch_cogs = float(data['batch_cogs'])
        
        if batch_cogs < 0:
            return jsonify({'status': 'error', 'error': 'batch_cogs cannot be negative'}), 400
        
        # Get the record IDs from the request
        record_ids = data.get('record_ids', [])
        
        if not record_ids or not isinstance(record_ids, list) or len(record_ids) == 0:
            return jsonify({'status': 'error', 'error': 'No records selected. Please add records to the print queue first.'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get the selected records with their store_price
        placeholders = ','.join('?' for _ in record_ids)
        cursor.execute(f'''
            SELECT id, store_price 
            FROM records 
            WHERE id IN ({placeholders}) 
            AND store_price IS NOT NULL AND store_price > 0
        ''', record_ids)
        
        records = cursor.fetchall()
        
        if not records:
            conn.close()
            return jsonify({
                'status': 'error', 
                'error': 'No valid records found with store_price > 0'
            }), 404
        
        # Calculate total store_price sum for selected records
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
        updated_records = []
        
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
            
            updated_records.append({
                'id': record['id'],
                'cogs': cogs_value
            })
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Successfully distributed ${batch_cogs:.2f} across {records_updated} selected records',
            'records_updated': records_updated,
            'batch_cogs': batch_cogs,
            'total_store_price_sum': round(total_store_price, 2),
            'total_cogs_sum': round(total_cogs_sum, 2),
            'average_cogs': round(total_cogs_sum / records_updated, 2) if records_updated > 0 else 0,
            'updated_records': updated_records
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


# ==================== PRICE ESTIMATE ENDPOINT - NO FALLBACKS, NO TRY/CATCH ====================
 
@app.route('/api/discogs/price-suggestions/<release_id>', methods=['GET'])
def discogs_price_suggestions_proxy(release_id):
    """Proxy endpoint to fetch Discogs price suggestions"""
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


@app.route('/api/ebay/search', methods=['POST'])
def ebay_search_proxy():
    """Proxy endpoint to search eBay listings"""
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

        
@app.route('/api/discogs/search', methods=['GET'])
def discogs_search_proxy():
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


@app.route('/catalog/records', methods=['GET'])
def get_catalog_records():
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
    """Price estimate - uses Discogs price suggestions directly"""
    import requests
    import re
    
    app.logger.info("=" * 60)
    app.logger.info("🔍 PRICE ESTIMATE V3 CALLED")
    
    data = request.json
    catalog_number = data.get('catalog_number', '').strip()
    media_condition = data.get('media_condition', '').strip()
    sleeve_condition = data.get('sleeve_condition', '').strip()
    
    # Validation
    if not catalog_number:
        return jsonify({'status': 'error', 'error': 'catalog_number is required'}), 400
    if not media_condition:
        return jsonify({'status': 'error', 'error': 'media_condition is required'}), 400
    if not sleeve_condition:
        return jsonify({'status': 'error', 'error': 'sleeve_condition is required'}), 400
    
    # Get Discogs token
    discogs_token = os.environ.get('DISCOGS_USER_TOKEN')
    if not discogs_token:
        return jsonify({'status': 'error', 'error': 'DISCOGS_USER_TOKEN not configured'}), 500
    
    headers = {
        'User-Agent': 'PigStyleMusic/1.0',
        'Authorization': f'Discogs token={discogs_token}'
    }
    
    # Step 1: Search for release
    app.logger.info(f"🔍 Searching for catalog: {catalog_number}")
    search_url = "https://api.discogs.com/database/search"
    params = {'q': catalog_number, 'type': 'release', 'per_page': 10}
    
    search_response = requests.get(search_url, headers=headers, params=params, timeout=10)
    
    if search_response.status_code != 200:
        return jsonify({'status': 'error', 'error': f'Discogs search failed: {search_response.status_code}'}), 500
    
    search_data = search_response.json()
    results = search_data.get('results', [])
    
    if not results:
        return jsonify({'status': 'error', 'error': f'No release found for catalog: {catalog_number}'}), 404
    
    # Find exact catalog match
    release = None
    catalog_normalized = catalog_number.lower().replace(' ', '').replace('-', '')
    
    for result in results:
        catno = result.get('catno', '').lower().replace(' ', '').replace('-', '')
        if catalog_normalized in catno:
            release = result
            break
    
    if not release:
        return jsonify({
            'status': 'error',
            'error': f'No exact match for: {catalog_number}',
            'suggestions': [r.get('catno', '') for r in results[:5]]
        }), 404
    
    release_id = release['id']
    app.logger.info(f"✅ Found release ID: {release_id}")
    
    # Step 2: Get price suggestions - THIS RETURNS CONDITION-SPECIFIC PRICES!
    app.logger.info(f"💰 Getting price suggestions for release: {release_id}")
    price_url = f"https://api.discogs.com/marketplace/price_suggestions/{release_id}"
    
    price_response = requests.get(price_url, headers=headers, timeout=10)
    
    if price_response.status_code != 200:
        return jsonify({
            'status': 'error',
            'error': f'Failed to get price suggestions: {price_response.status_code}'
        }), 500
    
    price_data = price_response.json()
    
    if not price_data:
        return jsonify({
            'status': 'error',
            'error': f'No price data available for release {release_id}'
        }), 404
    
    # Step 3: Get the price for the specific condition
    # Map user-friendly condition names to Discogs condition names
    condition_map = {
        'mint': 'Mint (M)',
        'near mint': 'Near Mint (NM or M-)',
        'very good plus': 'Very Good Plus (VG+)',
        'very good': 'Very Good (VG)',
        'good plus': 'Good Plus (G+)',
        'good': 'Good (G)',
        'fair': 'Fair (F)',
        'poor': 'Poor (P)'
    }
    
    # Clean the media condition input
    media_clean = media_condition.lower().strip()
    media_clean = re.sub(r'\s*\([^)]*\)', '', media_clean).strip()
    
    # Find matching condition key
    condition_key = None
    for key in condition_map:
        if key in media_clean:
            condition_key = condition_map[key]
            break
    
    if not condition_key:
        return jsonify({
            'status': 'error',
            'error': f'Unknown condition: {media_condition}',
            'valid_conditions': list(condition_map.values())
        }), 400
    
    # Get the price for the condition
    if condition_key not in price_data:
        return jsonify({
            'status': 'error',
            'error': f'No price data for condition: {condition_key}',
            'available_conditions': list(price_data.keys())
        }), 404
    
    condition_price = price_data[condition_key]
    estimated_price = condition_price.get('value')
    
    if estimated_price is None or estimated_price == 0:
        return jsonify({
            'status': 'error',
            'error': f'Price is $0 for condition: {condition_key}'
        }), 404
    
    app.logger.info(f"💰 Price for {condition_key}: ${estimated_price}")
    
    # Step 4: Get community stats for confidence
    stats_url = f"https://api.discogs.com/releases/{release_id}/stats"
    stats_response = requests.get(stats_url, headers=headers, timeout=10)
    stats = stats_response.json() if stats_response.status_code == 200 else {}
    
    wants = stats.get('community', {}).get('want', 0)
    haves = stats.get('community', {}).get('have', 0)
    
    # Calculate confidence based on community data
    confidence = 50  # Base confidence
    if wants > 0:
        confidence += 10
    if haves > 0:
        confidence += 10
    if wants > 100:
        confidence += 10
    if haves > 100:
        confidence += 10
    
    # Get min and max prices from all conditions
    all_prices = [data.get('value', 0) for data in price_data.values() if data.get('value')]
    min_price = min(all_prices) if all_prices else estimated_price
    max_price = max(all_prices) if all_prices else estimated_price
    
    result = {
        'status': 'success',
        'catalog_number': catalog_number,
        'release_id': release_id,
        'condition': condition_key,
        'estimated_price': round(estimated_price, 2),
        'price_range_low': round(min_price, 2),
        'price_range_high': round(max_price, 2),
        'confidence_score': min(confidence, 100),
        'condition_multiplier': 1.0,  # Not needed since Discogs gives condition-specific prices
        'demand_adjustment': 1.0,  # Not needed
        'base_median_price': round(estimated_price, 2),
        'want_have_ratio': round(wants / haves, 2) if haves > 0 else 0,
        'num_sales': 0  # Not available from price_suggestions
    }
    
    app.logger.info(f"✅ Returning price: ${result['estimated_price']}")
    return jsonify(result)

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

# ==================== SUBSCRIPTION ENDPOINTS ====================

@app.route('/api/subscribe', methods=['POST'])
def subscribe():
    """Subscribe a user to email notifications for specific artists/titles"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip().lower()
        artist = data.get('artist', '').strip()
        title = data.get('title', '').strip()
        catalog_number = data.get('catalog_number', '').strip()
        
        # Validate email
        if not email or '@' not in email or '.' not in email:
            return jsonify({'status': 'error', 'error': 'Valid email address required'}), 400
        
        # At least one search term required
        if not artist and not title and not catalog_number:
            return jsonify({'status': 'error', 'error': 'At least one search term (artist, title, or catalog number) is required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if subscription already exists (active)
        cursor.execute('''
            SELECT id FROM email_subscriptions 
            WHERE email = ? AND artist = ? AND title = ? AND catalog_number = ? AND is_active = 1
        ''', (email, artist or None, title or None, catalog_number or None))
        
        existing = cursor.fetchone()
        
        if existing:
            conn.close()
            return jsonify({'status': 'success', 'message': 'You are already subscribed to these notifications', 'already_subscribed': True}), 200
        
        # Insert new subscription
        cursor.execute('''
            INSERT INTO email_subscriptions (email, artist, title, catalog_number, created_at, is_active)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
        ''', (email, artist or None, title or None, catalog_number or None))
        
        subscription_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        app.logger.info(f"New subscription: {email} - artist:{artist} title:{title} catalog:{catalog_number}")
        
        return jsonify({
            'status': 'success',
            'message': 'Subscription created successfully',
            'subscription_id': subscription_id
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error creating subscription: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/subscriptions', methods=['GET'])
@login_required
@role_required(['admin'])
def get_subscriptions():
    """Get all subscriptions (admin only)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, email, artist, title, catalog_number, created_at, is_active
            FROM email_subscriptions
            ORDER BY created_at DESC
        ''')
        
        subscriptions = cursor.fetchall()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'subscriptions': [dict(sub) for sub in subscriptions],
            'count': len(subscriptions)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting subscriptions: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/subscriptions/<int:subscription_id>', methods=['DELETE'])
def unsubscribe(subscription_id):
    """Unsubscribe (deactivate a subscription)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id, email FROM email_subscriptions WHERE id = ?', (subscription_id,))
        sub = cursor.fetchone()
        
        if not sub:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Subscription not found'}), 404
        
        # Soft delete - set is_active to 0
        cursor.execute('UPDATE email_subscriptions SET is_active = 0 WHERE id = ?', (subscription_id,))
        conn.commit()
        conn.close()
        
        app.logger.info(f"Unsubscribed: {sub['email']} (ID: {subscription_id})")
        
        return jsonify({'status': 'success', 'message': 'Unsubscribed successfully'})
        
    except Exception as e:
        app.logger.error(f"Error unsubscribing: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ============================================================
# ============================================================
# ACCOUNTING ENDPOINTS
# ============================================================
# ============================================================

# ==================== ACCOUNTING: ACCOUNTS ====================

@app.route('/api/accounting/accounts', methods=['GET'])
@login_required
@role_required(['admin'])
def accounting_get_accounts():
    """Get chart of accounts for dropdowns"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, code, name, type FROM accounts ORDER BY code')
        accounts = cursor.fetchall()
        conn.close()
        return jsonify({
            'status': 'success',
            'accounts': [dict(row) for row in accounts]
        })
    except Exception as e:
        app.logger.error(f"Error fetching accounts: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== COGS ASSUMPTION RATE HELPER ====================

def get_cogs_assumption_rate():
    """Get the COGS assumption rate from app_config, default 0.3."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'cogs_assumption_rate'")
    row = cursor.fetchone()
    conn.close()
    if row:
        try:
            return float(row['config_value'])
        except:
            return 0.3
    # If key doesn't exist, create it with default
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT OR IGNORE INTO app_config (config_key, config_value, description) VALUES ('cogs_assumption_rate', '0.3', 'COGS assumption rate for records without actual COGS')")
    conn.commit()
    conn.close()
    return 0.3

# ==================== ACCOUNTING: DASHBOARD ====================
@app.route('/api/accounting/dashboard', methods=['GET'])
@login_required
@role_required(['admin'])
def accounting_dashboard():
    """Get dashboard stats: revenue, COGS, net profit, pending sync, unreconciled"""
    try:
        today = date.today()
        month_start = today.replace(day=1).isoformat()
        month_end = today.isoformat()
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Revenue for this month - using order_items and price_at_time
        cursor.execute('''
            SELECT COALESCE(SUM(oi.price_at_time), 0) as revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.created_at >= ? AND o.created_at <= ?
              AND o.payment_status = 'paid'
        ''', (month_start, month_end))
        revenue = cursor.fetchone()['revenue'] or 0
        
        # COGS – use assumption for records with NULL cogs
        rate = get_cogs_assumption_rate()
        cursor.execute('''
            SELECT oi.price_at_time, r.cogs
            FROM order_items oi
            JOIN records r ON oi.record_id = r.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.created_at >= ? AND o.created_at <= ?
              AND o.payment_status = 'paid'
        ''', (month_start, month_end))
        rows = cursor.fetchall()
        total_cogs = 0
        for row in rows:
            if row['cogs'] is not None:
                total_cogs += row['cogs']
            else:
                total_cogs += row['price_at_time'] * rate
        
        net_profit = revenue - total_cogs
        
        # Pending sync: orders that are paid but not accounted
        cursor.execute('''
            SELECT COUNT(*) as pending
            FROM orders
            WHERE payment_status = 'paid' AND (is_accounted IS NULL OR is_accounted = 0)
        ''')
        pending_sync = cursor.fetchone()['pending'] or 0
        
        # Unreconciled: payments without a match (if table exists)
        try:
            cursor.execute('''
                SELECT COUNT(*) as unreconciled
                FROM payments p
                LEFT JOIN reconciliation_matches rm ON rm.source_type = 'payment' AND rm.source_id = p.id
                WHERE rm.id IS NULL
            ''')
            unreconciled = cursor.fetchone()['unreconciled'] or 0
        except:
            unreconciled = 0
        
        # Recent journal entries (last 5)
        cursor.execute('''
            SELECT je.id, je.transaction_date, je.description,
                   COALESCE(SUM(jl.debit_amount), 0) as debit_total,
                   COALESCE(SUM(jl.credit_amount), 0) as credit_total
            FROM journal_entries je
            LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
            GROUP BY je.id
            ORDER BY je.transaction_date DESC, je.id DESC
            LIMIT 5
        ''')
        recent = cursor.fetchall()
        recent_entries = []
        for row in recent:
            recent_entries.append({
                'id': row['id'],
                'date': row['transaction_date'],
                'description': row['description'],
                'debit_total': row['debit_total'] / 100.0,
                'credit_total': row['credit_total'] / 100.0
            })
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'revenue': float(revenue),
            'cogs': float(total_cogs),
            'net_profit': float(net_profit),
            'pending_sync': pending_sync,
            'unreconciled': unreconciled,
            'recent_entries': recent_entries
        })
    except Exception as e:
        app.logger.error(f"Dashboard error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== ACCOUNTING: JOURNAL ====================

@app.route('/api/accounting/journal', methods=['GET'])
@login_required
@role_required(['admin'])
def accounting_get_journal():
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        account_id = request.args.get('account_id', type=int)
        search = request.args.get('search', '').strip()
        offset = (page - 1) * per_page

        conn = get_db()
        cursor = conn.cursor()

        # Base query for journal entries - NO DATE FILTERS
        entry_query = '''
            SELECT id, transaction_date, description, source_type, source_id
            FROM journal_entries
            WHERE 1=1
        '''
        params = []

        # Search filter
        if search:
            entry_query += ' AND (description LIKE ? OR source_id LIKE ?)'
            search_term = f'%{search}%'
            params.append(search_term)
            params.append(search_term)

        # Account filter
        if account_id:
            entry_query += ''' AND EXISTS (
                SELECT 1 FROM journal_lines jl 
                WHERE jl.journal_entry_id = journal_entries.id 
                AND jl.account_id = ?
            )'''
            params.append(account_id)

        # Get total count
        count_query = entry_query.replace(
            'SELECT id, transaction_date, description, source_type, source_id',
            'SELECT COUNT(*) as total'
        )
        cursor.execute(count_query, params)
        total = cursor.fetchone()['total']

        # Get paginated entries - newest first
        entry_query += ' ORDER BY transaction_date DESC, id DESC LIMIT ? OFFSET ?'
        params.extend([per_page, offset])
        cursor.execute(entry_query, params)
        entries_rows = cursor.fetchall()

        # For each entry, fetch its lines
        entries = []
        for entry in entries_rows:
            lines_query = '''
                SELECT jl.id, jl.account_id, jl.debit_amount, jl.credit_amount,
                       a.code, a.name, a.type
                FROM journal_lines jl
                LEFT JOIN accounts a ON a.id = jl.account_id
                WHERE jl.journal_entry_id = ?
            '''
            cursor.execute(lines_query, (entry['id'],))
            lines = cursor.fetchall()

            debit_total = 0
            credit_total = 0
            debit_account = ''
            credit_account = ''

            for line in lines:
                if line['debit_amount'] and line['debit_amount'] > 0:
                    debit_total += line['debit_amount'] / 100.0
                    if line['code']:
                        debit_account = f"{line['code']} - {line['name']}"
                if line['credit_amount'] and line['credit_amount'] > 0:
                    credit_total += line['credit_amount'] / 100.0
                    if line['code']:
                        credit_account = f"{line['code']} - {line['name']}"

            entries.append({
                'id': entry['id'],
                'transaction_date': entry['transaction_date'],
                'description': entry['description'] or '',
                'source_type': entry['source_type'] or '',
                'source_id': entry['source_id'] or '',
                'debit_account': debit_account,
                'debit_amount': debit_total,
                'credit_account': credit_account,
                'credit_amount': credit_total
            })

        conn.close()
        return jsonify({
            'status': 'success',
            'entries': entries,
            'total': total,
            'page': page,
            'per_page': per_page
        })
    except Exception as e:
        app.logger.error(f"Journal error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== ACCOUNTING: MANUAL ENTRY ====================

@app.route('/api/accounting/manual', methods=['POST'])
@login_required
@role_required(['admin'])
def accounting_post_manual():
    """Post a manual journal entry"""
    try:
        data = request.json
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        date_str = data.get('date')
        description = data.get('description', '').strip()
        lines = data.get('lines', [])
        
        if not date_str or not lines:
            return jsonify({'status': 'error', 'error': 'Date and lines are required'}), 400
        
        total_debit = 0
        total_credit = 0
        for line in lines:
            debit = float(line.get('debit', 0))
            credit = float(line.get('credit', 0))
            if debit > 0 and credit > 0:
                return jsonify({'status': 'error', 'error': 'A line cannot have both debit and credit'}), 400
            if debit == 0 and credit == 0:
                return jsonify({'status': 'error', 'error': 'Line must have either debit or credit'}), 400
            total_debit += debit
            total_credit += credit
        
        if abs(total_debit - total_credit) > 0.001:
            return jsonify({'status': 'error', 'error': 'Debits and credits must balance'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (date_str, description, 'manual', 'admin'))
        entry_id = cursor.lastrowid
        
        for line in lines:
            debit_cents = int(round(float(line.get('debit', 0)) * 100))
            credit_cents = int(round(float(line.get('credit', 0)) * 100))
            account_id = int(line.get('account_id'))
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, account_id, debit_cents, credit_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Manual journal entry posted',
            'entry_id': entry_id
        })
    except Exception as e:
        app.logger.error(f"Manual entry error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


def process_order_for_accounting(order, conn, cursor):
    """Helper function to create journal entries for a single order."""
    # Convert sqlite3.Row to dict for safe .get() usage
    order = dict(order)
    order_id = order['id']
    app.logger.info(f"  → Processing order {order_id}")
    
    # Get order items with inventory COGS
    cursor.execute('''
        SELECT oi.id, oi.record_id, oi.price_at_time, r.cogs
        FROM order_items oi
        LEFT JOIN records r ON oi.record_id = r.id
        WHERE oi.order_id = ?
    ''', (order_id,))
    items = cursor.fetchall()
    app.logger.info(f"    Found {len(items)} order items")
    
    # Get payments (table may be missing)
    try:
        cursor.execute('SELECT id, source, gross_amount FROM payments WHERE order_id = ?', (order_id,))
        payments = cursor.fetchall()
    except sqlite3.OperationalError:
        app.logger.warning("    Payments table missing – using cash default")
        payments = []
    
    # Get fees (table may be missing)
    try:
        cursor.execute('SELECT id, fee_type, amount, source FROM fees WHERE order_id = ?', (order_id,))
        fees = cursor.fetchall()
    except sqlite3.OperationalError:
        app.logger.warning("    Fees table missing – skipping fees")
        fees = []
    
    # Get shipping info – handle missing table gracefully
    shipping = None
    try:
        cursor.execute('SELECT shipping_charged, postage_cost FROM shipments WHERE order_id = ?', (order_id,))
        shipping = cursor.fetchone()
        if shipping:
            # Convert to dict if needed
            shipping = dict(shipping)
    except sqlite3.OperationalError:
        app.logger.warning("    Shipments table missing – using order shipping_cost")
        shipping = None
    
    # Determine payment source
    payment_source = payments[0]['source'] if payments else 'cash'
    app.logger.info(f"    Payment source: {payment_source}")
    
    # Map payment source to account code
    account_map = {
        'cash': '1010',
        'paypal': '1020',
        'square': '1030',
        'discogs': '1020',
        'giftcard': '1010'
    }
    debit_account_code = account_map.get(payment_source, '1010')
    
    # Get account IDs
    cursor.execute('SELECT id, code FROM accounts')
    accounts = {row['code']: row['id'] for row in cursor.fetchall()}
    
    # Verify required accounts exist
    required = ['4000', '1050', '5000', '4010', '5010', '5020', '2010']
    missing = [code for code in required if code not in accounts]
    if missing:
        raise KeyError(f"Missing account codes: {missing}")
    
    total_sales = sum(item['price_at_time'] for item in items) if items else 0
    total_cogs = sum(item['cogs'] or 0 for item in items) if items else 0
    app.logger.info(f"    Total sales: {total_sales}, Total COGS: {total_cogs}")
    
    # Shipping – use shipment record if available, else fallback to order
    if shipping:
        shipping_charged = shipping.get('shipping_charged', 0) or 0
        postage_cost = shipping.get('postage_cost', 0) or 0
    else:
        shipping_charged = order.get('shipping_charged', 0) or 0
        postage_cost = 0
    app.logger.info(f"    Shipping charged: {shipping_charged}, Postage cost: {postage_cost}")
    
    tax_total = order.get('tax_total', 0) or 0
    total_fees = sum(fee['amount'] or 0 for fee in fees) if fees else 0
    
    # Create journal entry
    cursor.execute('''
        INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
        VALUES (?, ?, ?, ?)
    ''', (order['created_at'], f"Sale - Order {order_id}", 'order', order_id))
    entry_id = cursor.lastrowid
    app.logger.info(f"    Created journal entry {entry_id}")
    
    # Revenue entry
    debit_amount = total_sales + shipping_charged
    if debit_amount > 0:
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts[debit_account_code], int(round(debit_amount * 100)), 0))
    
    # Credit Sales Revenue
    if total_sales > 0:
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts['4000'], 0, int(round(total_sales * 100))))
    
    # Credit Shipping Revenue
    if shipping_charged > 0:
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts['4010'], 0, int(round(shipping_charged * 100))))
    
    # COGS entry
    if total_cogs > 0:
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts['5000'], int(round(total_cogs * 100)), 0))
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts['1050'], 0, int(round(total_cogs * 100))))
    
    # Shipping expense
    if postage_cost > 0:
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts['5010'], int(round(postage_cost * 100)), 0))
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts[debit_account_code], 0, int(round(postage_cost * 100))))
    
    # Sales Tax
    if tax_total > 0:
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts[debit_account_code], int(round(tax_total * 100)), 0))
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts['2010'], 0, int(round(tax_total * 100))))
    
    # Fees
    if total_fees > 0:
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts['5020'], int(round(total_fees * 100)), 0))
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts[debit_account_code], 0, int(round(total_fees * 100))))
    
    cursor.execute('UPDATE orders SET is_accounted = 1 WHERE id = ?', (order_id,))
    conn.commit()
    app.logger.info(f"    ✅ Order {order_id} marked as accounted")


# ==================== ACCOUNTING: RECONCILIATION UPLOAD ====================

@app.route('/api/accounting/reconcile/upload', methods=['POST'])
@login_required
@role_required(['admin'])
def accounting_upload_bank():
    """Upload a bank CSV and store transactions"""
    try:
        data = request.json
        bank_account_id = data.get('bank_account_id')
        transactions = data.get('transactions', [])
        
        if not bank_account_id or not transactions:
            return jsonify({'status': 'error', 'error': 'Missing bank_account_id or transactions'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        inserted = 0
        skipped = 0
        
        for tx in transactions:
            date_val = tx.get('Date') or tx.get('date') or tx.get('Transaction Date')
            amount_val = tx.get('Amount') or tx.get('amount') or tx.get('Deposit') or tx.get('Withdrawal')
            description = tx.get('Description') or tx.get('description') or tx.get('Memo') or ''
            external_id = tx.get('Transaction ID') or tx.get('transaction_id') or tx.get('ID') or None
            
            if not date_val or not amount_val:
                continue
            
            try:
                amount_clean = str(amount_val).replace('$', '').replace(',', '').strip()
                amount_cents = int(round(float(amount_clean) * 100))
            except:
                continue
            
            try:
                if isinstance(date_val, str) and '/' in date_val:
                    parts = date_val.split('/')
                    if len(parts) == 3:
                        m, d, y = parts
                        if len(y) == 2:
                            y = '20' + y
                        date_obj = datetime.strptime(f"{y}-{m}-{d}", '%Y-%m-%d')
                    else:
                        continue
                else:
                    date_obj = datetime.strptime(date_val.split('T')[0], '%Y-%m-%d')
                date_str = date_obj.strftime('%Y-%m-%d')
            except:
                continue
            
            if external_id:
                cursor.execute('SELECT id FROM bank_transactions WHERE external_id = ?', (external_id,))
                if cursor.fetchone():
                    skipped += 1
                    continue
            else:
                cursor.execute('''
                    SELECT id FROM bank_transactions 
                    WHERE bank_account_id = ? AND transaction_date = ? AND amount = ? AND description = ?
                ''', (bank_account_id, date_str, amount_cents, description[:100]))
                if cursor.fetchone():
                    skipped += 1
                    continue
            
            cursor.execute('''
                INSERT INTO bank_transactions (bank_account_id, transaction_date, amount, description, external_id)
                VALUES (?, ?, ?, ?, ?)
            ''', (bank_account_id, date_str, amount_cents, description[:255], external_id))
            inserted += 1
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'inserted': inserted,
            'skipped': skipped
        })
    except Exception as e:
        app.logger.error(f"Upload error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== ACCOUNTING: RECONCILIATION STATUS ====================

@app.route('/api/accounting/reconcile/status', methods=['GET'])
@login_required
@role_required(['admin'])
def accounting_reconcile_status():
    """Get expected payments, bank deposits, and unmatched items"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT p.id as payment_id, p.order_id, p.transaction_date as date, p.gross_amount as amount,
                   CASE WHEN rm.id IS NOT NULL THEN 'matched' ELSE 'pending' END as status
            FROM payments p
            LEFT JOIN reconciliation_matches rm ON rm.source_type = 'payment' AND rm.source_id = p.id
            ORDER BY p.transaction_date DESC
        ''')
        expected = cursor.fetchall()
        expected_list = [{
            'payment_id': row['payment_id'],
            'order_id': row['order_id'],
            'date': row['date'],
            'amount': row['amount'] / 100.0,
            'status': row['status']
        } for row in expected]
        
        cursor.execute('''
            SELECT bt.id, bt.transaction_date as date, bt.amount, bt.description,
                   CASE WHEN rm.id IS NOT NULL THEN 'matched' ELSE 'unmatched' END as status
            FROM bank_transactions bt
            LEFT JOIN reconciliation_matches rm ON rm.bank_transaction_id = bt.id
            WHERE bt.amount > 0
            ORDER BY bt.transaction_date DESC
        ''')
        deposits = cursor.fetchall()
        deposits_list = [{
            'id': row['id'],
            'date': row['date'],
            'amount': row['amount'] / 100.0,
            'description': row['description'],
            'matched': row['status'] == 'matched'
        } for row in deposits]
        
        unmatched = []
        cursor.execute('''
            SELECT p.id, p.transaction_date, p.gross_amount, 'payment' as type, p.order_id
            FROM payments p
            LEFT JOIN reconciliation_matches rm ON rm.source_type = 'payment' AND rm.source_id = p.id
            WHERE rm.id IS NULL
        ''')
        for row in cursor.fetchall():
            unmatched.append({
                'id': row['id'],
                'type': 'payment',
                'date': row['transaction_date'],
                'amount': row['gross_amount'] / 100.0
            })
        cursor.execute('''
            SELECT bt.id, bt.transaction_date, bt.amount, 'deposit' as type
            FROM bank_transactions bt
            LEFT JOIN reconciliation_matches rm ON rm.bank_transaction_id = bt.id
            WHERE rm.id IS NULL AND bt.amount > 0
        ''')
        for row in cursor.fetchall():
            unmatched.append({
                'id': row['id'],
                'type': 'deposit',
                'date': row['transaction_date'],
                'amount': row['amount'] / 100.0
            })
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'expected': expected_list,
            'deposits': deposits_list,
            'unmatched': unmatched
        })
    except Exception as e:
        app.logger.error(f"Reconciliation status error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== ACCOUNTING: AUTO-MATCH ====================

@app.route('/api/accounting/reconcile/auto-match', methods=['POST'])
@login_required
@role_required(['admin'])
def accounting_auto_match():
    """Attempt to automatically match expected payments with bank deposits"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT p.id, p.transaction_date, p.gross_amount
            FROM payments p
            LEFT JOIN reconciliation_matches rm ON rm.source_type = 'payment' AND rm.source_id = p.id
            WHERE rm.id IS NULL
        ''')
        payments = cursor.fetchall()
        
        cursor.execute('''
            SELECT bt.id, bt.transaction_date, bt.amount
            FROM bank_transactions bt
            LEFT JOIN reconciliation_matches rm ON rm.bank_transaction_id = bt.id
            WHERE rm.id IS NULL AND bt.amount > 0
        ''')
        deposits = cursor.fetchall()
        
        matched_count = 0
        for pay in payments:
            pay_date = datetime.strptime(pay['transaction_date'], '%Y-%m-%d')
            pay_amount = pay['gross_amount']
            for dep in deposits:
                dep_date = datetime.strptime(dep['transaction_date'], '%Y-%m-%d')
                delta = abs((pay_date - dep_date).days)
                if delta <= 3 and dep['amount'] == pay_amount:
                    cursor.execute('''
                        INSERT INTO reconciliation_matches (bank_transaction_id, source_type, source_id, matched_amount)
                        VALUES (?, ?, ?, ?)
                    ''', (dep['id'], 'payment', pay['id'], pay_amount))
                    matched_count += 1
                    deposits = [d for d in deposits if d['id'] != dep['id']]
                    break
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'matched': matched_count
        })
    except Exception as e:
        app.logger.error(f"Auto-match error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== ACCOUNTING: REPORTS ====================


@app.route('/api/accounting/reports', methods=['GET'])
@login_required
@role_required(['admin'])
def accounting_reports():
    """Generate financial reports: pll, balance-sheet, batch-profit, order-economics"""
    try:
        report_type = request.args.get('type', 'pll')
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        
        conn = get_db()
        cursor = conn.cursor()
        
        if report_type == 'pll':
            rate = get_cogs_assumption_rate()
            
            # 1. Revenue from order_items
            cursor.execute('''
                SELECT COALESCE(SUM(oi.price_at_time), 0) as revenue
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                WHERE o.payment_status = 'paid'
                  AND (? IS NULL OR o.created_at >= ?)
                  AND (? IS NULL OR o.created_at <= ?)
            ''', (date_from, date_from, date_to, date_to))
            revenue = cursor.fetchone()['revenue']
            
            # 2. COGS (assumed for NULL cogs)
            cursor.execute('''
                SELECT COALESCE(SUM(
                    CASE WHEN r.cogs IS NULL THEN oi.price_at_time * ? ELSE r.cogs END
                ), 0) as cogs
                FROM order_items oi
                JOIN records r ON oi.record_id = r.id
                JOIN orders o ON oi.order_id = o.id
                WHERE o.payment_status = 'paid'
                  AND (? IS NULL OR o.created_at >= ?)
                  AND (? IS NULL OR o.created_at <= ?)
            ''', (rate, date_from, date_from, date_to, date_to))
            cogs = cursor.fetchone()['cogs']
            
            # 3. Other expenses (from journal_lines, excluding COGS account 5000)
            cursor.execute('''
                SELECT a.code, a.name,
                       COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) as balance
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journal_entry_id = je.id
                JOIN accounts a ON jl.account_id = a.id
                WHERE a.type = 'expense'
                  AND a.code != '5000'   -- exclude COGS account
                  AND (? IS NULL OR je.transaction_date >= ?)
                  AND (? IS NULL OR je.transaction_date <= ?)
                GROUP BY a.id
                ORDER BY a.code
            ''', (date_from, date_from, date_to, date_to))
            expense_rows = cursor.fetchall()
            
            report_data = []
            total_revenue = revenue
            total_expense = cogs
            
            # Add revenue line
            report_data.append({
                'Account': 'Sales Revenue',
                'Balance': revenue   # positive
            })
            # Add COGS line
            report_data.append({
                'Account': 'COGS (Assumed)',
                'Balance': cogs      # positive
            })
            
            # Add other expense lines
            for row in expense_rows:
                balance = row['balance'] / 100.0
                report_data.append({
                    'Account': f"{row['code']} - {row['name']}",
                    'Balance': balance
                })
                total_expense += balance
            
            net_profit = total_revenue - total_expense
            summary = f"Total Revenue: ${total_revenue:.2f} | Total Expenses: ${total_expense:.2f} | Net Profit: ${net_profit:.2f}"
            
        elif report_type == 'batch-profit':
            # Batch profitability: group records by batch
            cursor.execute('''
                SELECT 
                    b.id as batch_id,
                    b.seller_name,
                    b.start_datetime as acquisition_date,
                    b.total_cost,
                    COUNT(r.id) as total_records,
                    SUM(CASE WHEN r.status_id = 3 THEN r.store_price ELSE 0 END) as revenue,
                    SUM(CASE WHEN r.status_id = 3 THEN r.cogs ELSE 0 END) as cogs
                FROM batches b
                LEFT JOIN records r ON r.batch_id = b.id
                GROUP BY b.id
                ORDER BY b.start_datetime DESC
            ''')
            rows = cursor.fetchall()
            report_data = []
            for row in rows:
                revenue = row['revenue'] or 0
                cogs = row['cogs'] or 0
                profit = revenue - cogs
                roi = (profit / row['total_cost'] * 100) if row['total_cost'] and row['total_cost'] > 0 else 0
                report_data.append({
                    'Batch ID': row['batch_id'],
                    'Seller': row['seller_name'] or 'Unknown',
                    'Acquired': row['acquisition_date'],
                    'Total Cost': row['total_cost'] or 0,
                    'Records': row['total_records'] or 0,
                    'Revenue': revenue,
                    'COGS': cogs,
                    'Profit': profit,
                    'ROI %': round(roi, 1)
                })
            summary = f"Total Batches: {len(report_data)}"
            
        elif report_type == 'order-economics':
            # Per-order economics - using order_items and price_at_time
            cursor.execute('''
                SELECT 
                    o.id as order_id,
                    o.created_at as order_date,
                    o.channel,
                    o.total as order_total,
                    COALESCE(SUM(oi.price_at_time), 0) as item_revenue,
                    COALESCE(o.shipping_charged, 0) as shipping_charged,
                    COALESCE(SUM(r.cogs), 0) as cogs,
                    COALESCE(SUM(f.amount), 0) as fees,
                    COALESCE(s.postage_cost, 0) as shipping_cost
                FROM orders o
                LEFT JOIN order_items oi ON oi.order_id = o.id
                LEFT JOIN records r ON oi.record_id = r.id
                LEFT JOIN fees f ON f.order_id = o.id
                LEFT JOIN shipments s ON s.order_id = o.id
                WHERE o.payment_status = 'paid'
                  AND (? IS NULL OR o.created_at >= ?)
                  AND (? IS NULL OR o.created_at <= ?)
                GROUP BY o.id
                ORDER BY o.created_at DESC
            ''', (date_from, date_from, date_to, date_to))
            rows = cursor.fetchall()
            report_data = []
            total_profit = 0
            for row in rows:
                profit = row['item_revenue'] + row['shipping_charged'] - row['cogs'] - row['fees'] - row['shipping_cost']
                total_profit += profit
                report_data.append({
                    'Order ID': row['order_id'][:12] + '...' if row['order_id'] else '',
                    'Date': row['order_date'],
                    'Channel': row['channel'],
                    'Revenue': row['item_revenue'],
                    'Shipping Charged': row['shipping_charged'],
                    'COGS': row['cogs'],
                    'Fees': row['fees'],
                    'Shipping Cost': row['shipping_cost'],
                    'Net Profit': profit
                })
            summary = f"Total Orders: {len(report_data)} | Total Net Profit: ${total_profit:.2f}"
            
        elif report_type == 'balance-sheet':
            # Balance Sheet: assets, liabilities, equity
            cursor.execute('''
                SELECT 
                    a.type,
                    a.code,
                    a.name,
                    COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) as balance
                FROM accounts a
                LEFT JOIN journal_lines jl ON jl.account_id = a.id
                LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
                WHERE a.type IN ('asset', 'liability', 'equity')
                  AND (? IS NULL OR je.transaction_date >= ?)
                  AND (? IS NULL OR je.transaction_date <= ?)
                GROUP BY a.id
                ORDER BY a.type, a.code
            ''', (date_from, date_from, date_to, date_to))
            rows = cursor.fetchall()
            report_data = []
            total_assets = 0
            total_liabilities = 0
            total_equity = 0
            for row in rows:
                balance = row['balance'] / 100.0
                report_data.append({
                    'Type': row['type'],
                    'Account': f"{row['code']} - {row['name']}",
                    'Balance': balance
                })
                if row['type'] == 'asset':
                    total_assets += balance
                elif row['type'] == 'liability':
                    total_liabilities += balance
                else:
                    total_equity += balance
            summary = f"Total Assets: ${total_assets:.2f} | Total Liabilities: ${total_liabilities:.2f} | Total Equity: ${total_equity:.2f} | (Assets = Liabilities + Equity: {abs(total_assets - (total_liabilities + total_equity)) < 0.01})"
        else:
            return jsonify({'status': 'error', 'error': 'Invalid report type'}), 400
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'report': report_data,
            'summary': summary,
            'type': report_type
        })
    except Exception as e:
        app.logger.error(f"Report error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500



@app.route('/api/checkout/create-order', methods=['POST'])
@login_required
def create_order_from_checkout():
    """Create an order from checkout (Cash, Square, Gift Card, Discogs)."""
    try:
        data = request.json
        order = data.get('order')
        items = data.get('items', [])
        payment = data.get('payment')
        
        if not order or not items or not payment:
            return jsonify({'status': 'error', 'error': 'Missing order, items, or payment data'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Insert order
        cursor.execute('''
            INSERT INTO orders (
                id, order_number, customer_name, customer_email, shipping_method,
                shipping_cost, subtotal, tax, total, payment_status, order_status,
                created_at, updated_at, channel, is_accounted, external_order_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            order['id'], order['order_number'], order['customer_name'], order['customer_email'],
            order['shipping_method'], order['shipping_cost'], order['subtotal'], order['tax'],
            order['total'], order['payment_status'], order['order_status'],
            order['created_at'], order['updated_at'], order['channel'],
            order.get('is_accounted', 0), order.get('external_order_id')
        ))
        
        order_id = order['id']
        
        # Insert order items
        for item in items:
            cursor.execute('''
                INSERT INTO order_items (
                    order_id, record_id, record_title, record_artist,
                    record_condition, price_at_time, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ''', (
                order_id,
                item.get('record_id'),
                item.get('record_title'),
                item.get('record_artist'),
                item.get('record_condition'),
                item.get('price_at_time')
            ))
        
        # Insert payment (amount in cents)
        cursor.execute('''
            INSERT INTO payments (
                order_id, source, gross_amount, transaction_date, external_transaction_id
            ) VALUES (?, ?, ?, ?, ?)
        ''', (
            order_id,
            payment['source'],
            int(round(payment['gross_amount'] * 100)),
            payment['transaction_date'],
            payment.get('external_transaction_id')
        ))
        
        conn.commit()
        
        # --- Auto‑accounting removed ---
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'order_id': order_id
        })
    except Exception as e:
        app.logger.error(f"Checkout order creation error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ===== PLAID INTEGRATION =====
# Helper functions for Plaid client and token storage

def get_plaid_client():
    """Initialize Plaid client using environment credentials."""
    client_id = os.environ.get('PLAID_CLIENT_ID')
    secret = os.environ.get('PLAID_SECRET')
    env = os.environ.get('PLAID_ENV', 'sandbox')
    if not client_id or not secret:
        raise Exception("PLAID_CLIENT_ID or PLAID_SECRET not configured")
    host = plaid.Environment.Production if env == 'production' else plaid.Environment.Sandbox
    configuration = plaid.Configuration(host=host, api_key={'clientId': client_id, 'secret': secret})
    api_client = plaid.ApiClient(configuration)
    return plaid_api.PlaidApi(api_client)

def get_plaid_access_token():
    """Retrieve stored access token from app_config."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'plaid_access_token'")
    row = cursor.fetchone()
    conn.close()
    return row['config_value'] if row else None

def set_plaid_access_token(token, item_id=None, institution_name=None):
    """Store access token and related info in app_config."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT OR IGNORE INTO app_config (config_key, config_value) VALUES ('plaid_access_token', '')")
    cursor.execute("INSERT OR IGNORE INTO app_config (config_key, config_value) VALUES ('plaid_item_id', '')")
    cursor.execute("INSERT OR IGNORE INTO app_config (config_key, config_value) VALUES ('plaid_institution_name', '')")
    cursor.execute("UPDATE app_config SET config_value = ? WHERE config_key = 'plaid_access_token'", (token,))
    if item_id:
        cursor.execute("UPDATE app_config SET config_value = ? WHERE config_key = 'plaid_item_id'", (item_id,))
    if institution_name:
        cursor.execute("UPDATE app_config SET config_value = ? WHERE config_key = 'plaid_institution_name'", (institution_name,))
    conn.commit()
    conn.close()

# ===== CATEGORISATION RULES FUNCTIONS =====

def get_categorisation_rules(active_only=True):
    conn = get_db()
    cursor = conn.cursor()
    query = 'SELECT * FROM categorisation_rules'
    if active_only:
        query += ' WHERE active = 1'
    cursor.execute(query)
    rules = cursor.fetchall()
    conn.close()
    return rules

def apply_rule(rule_id, dry_run=False):
    """Apply a single rule to unprocessed bank transactions.
    If dry_run=True, only return matching transactions without posting.
    Returns dict with transactions and count.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM categorisation_rules WHERE id = ?', (rule_id,))
    rule = cursor.fetchone()
    if not rule:
        raise Exception("Rule not found")

    pattern = rule['pattern'].upper()
    account_id = rule['account_id']

    # Get unprocessed withdrawals (amount > 0) from historic bank_transactions
    cursor.execute('''
        SELECT id, transaction_date, amount, description
        FROM bank_transactions
        WHERE processed = 0 AND amount > 0
    ''')
    transactions = cursor.fetchall()

    matched = []
    for tx in transactions:
        desc = tx['description'].upper()
        if pattern in desc:
            matched.append(dict(tx))

    if dry_run:
        conn.close()
        return {'transactions': matched, 'count': len(matched)}

    # Process matched transactions
    processed_count = 0
    # Get cash account for historic transactions
    cash_id = get_cash_account_id('historic')
    for tx in matched:
        amount_cents = int(round(tx['amount'] * 100))
        # Create journal entry with source_type 'historic'
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (tx['transaction_date'], f"Bank expense: {tx['description']}", 'historic', str(tx['id'])))
        entry_id = cursor.lastrowid

        # Debit expense account
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, account_id, amount_cents, 0))

        # Credit cash account (specific to historic)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, cash_id, 0, amount_cents))

        # Mark processed
        cursor.execute('UPDATE bank_transactions SET processed = 1 WHERE id = ?', (tx['id'],))
        processed_count += 1

    conn.commit()
    conn.close()
    return {'transactions': matched, 'count': processed_count}


# ===== RULES ENDPOINTS =====

@app.route('/api/accounting/rules', methods=['GET'])
@login_required
@role_required(['admin'])
def get_rules():
    rules = get_categorisation_rules(active_only=False)
    return jsonify({'status': 'success', 'rules': [dict(r) for r in rules]})

@app.route('/api/accounting/rules', methods=['POST'])
@login_required
@role_required(['admin'])
def create_rule():
    data = request.json
    name = data.get('name')
    pattern = data.get('pattern')
    account_id = data.get('account_id')
    if not name or not pattern or not account_id:
        return jsonify({'status': 'error', 'error': 'Missing fields'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO categorisation_rules (name, pattern, account_id)
        VALUES (?, ?, ?)
    ''', (name, pattern, account_id))
    rule_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'id': rule_id})

@app.route('/api/accounting/rules/<int:rule_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_rule(rule_id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    updates = []
    params = []
    if 'name' in data:
        updates.append('name = ?')
        params.append(data['name'])
    if 'pattern' in data:
        updates.append('pattern = ?')
        params.append(data['pattern'])
    if 'account_id' in data:
        updates.append('account_id = ?')
        params.append(data['account_id'])
    if 'active' in data:
        updates.append('active = ?')
        params.append(1 if data['active'] else 0)
    if not updates:
        conn.close()
        return jsonify({'status': 'error', 'error': 'No fields to update'}), 400
    params.append(rule_id)
    cursor.execute(f'UPDATE categorisation_rules SET {", ".join(updates)} WHERE id = ?', params)
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/accounting/rules/<int:rule_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_rule(rule_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM categorisation_rules WHERE id = ?', (rule_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/accounting/rules/<int:rule_id>/apply', methods=['POST'])
@login_required
@role_required(['admin'])
def apply_rule_endpoint(rule_id):
    data = request.json or {}
    dry_run = data.get('dry_run', False)
    try:
        result = apply_rule(rule_id, dry_run=dry_run)
        return jsonify({'status': 'success', **result})
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


def fetch_bank_transactions(date_from=None, date_to=None):
    """Fetch transactions using stored access token."""
    access_token = get_plaid_access_token()
    if not access_token:
        raise Exception("No Plaid access token found. Please connect your bank account.")

    client = get_plaid_client()
    if not client:
        raise Exception("Plaid client not initialized")

    if not date_to:
        end_date = datetime.now().date()
    else:
        end_date = datetime.strptime(date_to, '%Y-%m-%d').date()

    if not date_from:
        # ✅ Fetch as far back as Plaid allows (2 years)
        start_date = end_date - timedelta(days=730)
    else:
        start_date = datetime.strptime(date_from, '%Y-%m-%d').date()

    request = TransactionsGetRequest(
        access_token=access_token,
        start_date=start_date,
        end_date=end_date,
        options=TransactionsGetRequestOptions(count=500, offset=0)
    )
    response = client.transactions_get(request)
    transactions = response['transactions']
    
    result = []
    for tx in transactions:
        result.append({
            'id': tx['transaction_id'],
            'date': tx['date'],
            'amount': tx['amount'],
            'description': tx.get('name', ''),
            'category': tx.get('category', [''])[0] if tx.get('category') else '',
            'pending': tx.get('pending', False),
            'status': 'pending' if tx.get('pending', False) else 'posted'
        })
    return result

@app.route('/api/accounting/bank-transactions', methods=['GET'])
@login_required
@role_required(['admin'])
def accounting_get_bank_transactions():
    try:
        search = request.args.get('search', '').strip()
        unprocessed_only = request.args.get('unprocessed_only', 'false').lower() == 'true'
        source_type = request.args.get('source_type')  # 'plaid' or 'historic' or None
        if source_type == 'all':
            source_type = None

        transactions = get_transactions_matching_filter(search, unprocessed_only, source_type)
        total = len(transactions)
        unprocessed_count = len([tx for tx in transactions if not tx['processed']])

        return jsonify({
            'status': 'success',
            'transactions': transactions,
            'total': total,
            'total_count': total,
            'unprocessed_count': unprocessed_count
        })
    except Exception as e:
        app.logger.error(f"Error fetching bank transactions: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/accounting/bank/apply-multiple', methods=['POST'])
@login_required
@role_required(['admin'])
def apply_multiple():
    data = request.json
    updates = data.get('updates', [])
    if not updates:
        return jsonify({'status': 'error', 'error': 'No updates provided'}), 400

    conn = get_db()
    cursor = conn.cursor()
    processed = 0
    errors = []

    # Pre-fetch Plaid transactions once
    try:
        all_plaid_tx = fetch_bank_transactions()
    except Exception as e:
        all_plaid_tx = []

    for item in updates:
        transaction_id = item.get('transaction_id')
        source_account_id = item.get('source_account_id')  # new
        target_account_id = item.get('target_account_id')  # renamed
        source_type = item.get('source_type', 'plaid')
        if not transaction_id or not source_account_id or not target_account_id:
            errors.append(f'Missing fields for {transaction_id}')
            continue

        # Find the transaction
        tx = None
        if source_type == 'plaid':
            tx = next((t for t in all_plaid_tx if t['id'] == transaction_id), None)
        else:
            conn2 = get_db()
            cur2 = conn2.cursor()
            cur2.execute('SELECT id, transaction_date, amount, description FROM bank_transactions WHERE id = ?', (transaction_id,))
            row = cur2.fetchone()
            conn2.close()
            if row:
                tx = {
                    'id': row['id'],
                    'date': row['transaction_date'],
                    'amount': row['amount'] / 100.0,
                    'description': row['description']
                }

        if not tx:
            errors.append(f'Transaction {transaction_id} not found in source {source_type}')
            continue

        amount = tx['amount']
        date_raw = tx['date']
        description = tx['description']

        date_str = parse_plaid_date(date_raw) or datetime.now().date().isoformat()

        # Check if already processed
        cursor.execute('SELECT id FROM journal_entries WHERE source_type = ? AND source_id = ?',
                       (source_type, str(transaction_id)))
        existing = cursor.fetchone()
        if existing:
            cursor.execute('DELETE FROM journal_lines WHERE journal_entry_id = ?', (existing['id'],))
            entry_id = existing['id']
        else:
            cursor.execute('''
                INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
                VALUES (?, ?, ?, ?)
            ''', (date_str, f"Bank transaction: {description}", source_type, str(transaction_id)))
            entry_id = cursor.lastrowid

        amount_cents = int(round(abs(amount) * 100))
        is_expense = amount > 0   # Positive = expense

        if is_expense:
            # Debit target, Credit source
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, target_account_id, amount_cents, 0))
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, source_account_id, 0, amount_cents))
        else:
            # Debit source, Credit target
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, source_account_id, amount_cents, 0))
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, target_account_id, 0, amount_cents))

        conn.commit()
        processed += 1

    conn.close()
    return jsonify({
        'status': 'success',
        'processed': processed,
        'errors': errors if errors else None,
        'message': f'Processed {processed} transactions' + (f', errors: {len(errors)}' if errors else '')
    })


@app.route('/api/accounting/bank/apply-filter-bulk', methods=['POST'])
@login_required
@role_required(['admin'])
def apply_filter_bulk():
    """Apply source and target accounts to ALL transactions matching the given filter."""
    data = request.json
    search = data.get('search', '').strip()
    unprocessed_only = data.get('unprocessed_only', True)
    source_type = data.get('source_type')  # None or 'plaid'/'historic'
    source_account_id = data.get('source_account_id')
    target_account_id = data.get('target_account_id')

    if not source_account_id or not target_account_id:
        return jsonify({'status': 'error', 'error': 'source_account_id and target_account_id required'}), 400

    # Get the matching transactions using the helper
    transactions = get_transactions_matching_filter(search, unprocessed_only, source_type)

    if not transactions:
        return jsonify({'status': 'success', 'message': 'No transactions match the filter.', 'count': 0})

    conn = get_db()
    cursor = conn.cursor()

    # Verify accounts exist
    cursor.execute('SELECT id, code, name, type FROM accounts WHERE id = ?', (source_account_id,))
    source = cursor.fetchone()
    if not source:
        conn.close()
        return jsonify({'status': 'error', 'error': 'Source account not found'}), 404

    cursor.execute('SELECT id, code, name, type FROM accounts WHERE id = ?', (target_account_id,))
    target = cursor.fetchone()
    if not target:
        conn.close()
        return jsonify({'status': 'error', 'error': 'Target account not found'}), 404

    processed_count = 0
    for tx in transactions:
        try:
            tx_id = tx['id']
            amount = tx['amount']
            date_raw = tx['date']
            description = tx.get('description', '')
            src_type = tx.get('source_type', 'historic')

            date_str = parse_plaid_date(date_raw) or datetime.now().date().isoformat()

            amount_cents = int(round(abs(amount) * 100))
            is_expense = amount > 0   # Positive = withdrawal (expense)

            # Check if already processed
            cursor.execute('SELECT id FROM journal_entries WHERE source_type = ? AND source_id = ?',
                           (src_type, str(tx_id)))
            existing = cursor.fetchone()

            if existing:
                cursor.execute('DELETE FROM journal_lines WHERE journal_entry_id = ?', (existing['id'],))
                entry_id = existing['id']
            else:
                cursor.execute('''
                    INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
                    VALUES (?, ?, ?, ?)
                ''', (date_str, f"Bank transaction: {description}", src_type, str(tx_id)))
                entry_id = cursor.lastrowid

            # Insert lines using the provided source and target accounts
            if is_expense:
                # Debit target, Credit source
                cursor.execute('''
                    INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                    VALUES (?, ?, ?, ?)
                ''', (entry_id, target_account_id, amount_cents, 0))
                cursor.execute('''
                    INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                    VALUES (?, ?, ?, ?)
                ''', (entry_id, source_account_id, 0, amount_cents))
            else:
                # Debit source, Credit target
                cursor.execute('''
                    INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                    VALUES (?, ?, ?, ?)
                ''', (entry_id, source_account_id, amount_cents, 0))
                cursor.execute('''
                    INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                    VALUES (?, ?, ?, ?)
                ''', (entry_id, target_account_id, 0, amount_cents))

            conn.commit()
            processed_count += 1
        except Exception as e:
            app.logger.error(f"Error processing transaction {tx.get('id')}: {str(e)}")
            continue

    conn.close()

    return jsonify({
        'status': 'success',
        'message': f'Applied {processed_count} transactions to source "{source["name"]}" and target "{target["name"]}".',
        'count': processed_count
    })


@app.route('/api/accounting/bank/process-transaction', methods=['POST'])
@login_required
@role_required(['admin'])
def accounting_process_single_transaction():
    """
    Process a single transaction by assigning it to an account.
    Handles both historic (CSV) and Plaid transactions.
    """
    data = request.json
    transaction_id = data.get('transaction_id')
    account_id = data.get('account_id')
    source = data.get('source', 'plaid')   # 'plaid' or 'historic'
    date = data.get('date')
    amount = data.get('amount')
    description = data.get('description', '')
    
    if not transaction_id or not account_id:
        return jsonify({'status': 'error', 'error': 'transaction_id and account_id required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Get the account details
    cursor.execute('SELECT id, code, name, type FROM accounts WHERE id = ?', (account_id,))
    account = cursor.fetchone()
    if not account:
        conn.close()
        return jsonify({'status': 'error', 'error': 'Account not found'}), 404
    
    # Determine the transaction details based on source
    if source == 'historic':
        cursor.execute('''
            SELECT id, transaction_date as date, amount, description, processed
            FROM bank_transactions 
            WHERE id = ?
        ''', (int(transaction_id),))
        tx = cursor.fetchone()
        if not tx:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Historic transaction not found'}), 404
        if tx['processed'] == 1:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Transaction already processed'}), 400
        
        tx_date = tx['date']
        tx_amount = tx['amount'] / 100.0  # stored in cents
        tx_description = tx['description']
        
    else:
        # For Plaid transactions, use the data passed from the frontend
        if not date or amount is None:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Missing transaction data for Plaid transaction'}), 400
        
        # Check if already processed
        cursor.execute('''
            SELECT id FROM journal_entries
            WHERE source_type = 'plaid' AND source_id = ?
        ''', (str(transaction_id),))
        if cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Transaction already processed'}), 400
        
        tx_date = date
        tx_amount = amount
        tx_description = description or 'Plaid transaction'
    
    amount_cents = int(round(abs(tx_amount) * 100))
    is_expense = tx_amount < 0
    is_expense_account = account['type'] == 'expense'
    
    # Get cash account for this source
    cash_id = get_cash_account_id(source)
    if not cash_id:
        conn.close()
        return jsonify({'status': 'error', 'error': f'Cash account not configured for source {source}'}), 500
    
    # Create journal entry with source_type = source
    entry_description = f"Bank transaction: {tx_description}"
    cursor.execute('''
        INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
        VALUES (?, ?, ?, ?)
    ''', (tx_date, entry_description, source, str(transaction_id)))
    entry_id = cursor.lastrowid
    
    if is_expense:
        if is_expense_account:
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, account_id, amount_cents, 0))
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, cash_id, 0, amount_cents))
        else:
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, cash_id, amount_cents, 0))
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, account_id, 0, amount_cents))
    else:
        if is_expense_account:
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, account_id, 0, amount_cents))
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, cash_id, amount_cents, 0))
        else:
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, cash_id, amount_cents, 0))
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, account_id, 0, amount_cents))
    
    # Mark as processed in the appropriate table
    if source == 'historic':
        cursor.execute('UPDATE bank_transactions SET processed = 1 WHERE id = ?', (int(transaction_id),))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'status': 'success',
        'message': f'Transaction processed successfully to {account["name"]}',
        'entry_id': entry_id,
        'account': {
            'id': account['id'],
            'code': account['code'],
            'name': account['name'],
            'type': account['type']
        }
    })


# ==================== DISCOGS ORDERS ENDPOINTS ====================

@app.route('/api/discogs/orders', methods=['GET'])
def get_discogs_orders():
    """
    Get orders from Discogs API.
    
    Query params:
        status: Filter by status (New, Paid, Shipped, etc.)
        page: Page number (default: 1)
        per_page: Items per page (default: 50, max: 100)
        all: If 'true', fetch all pages (default: false)
    """
    try:
        # Check if Discogs token exists
        TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
        if not TOKEN:
            return jsonify({
                'status': 'error',
                'error': 'Discogs token not configured'
            }), 500
        
        # Get query parameters
        status = request.args.get('status')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        fetch_all = request.args.get('all', 'false').lower() == 'true'
        
        # Initialize Discogs handler
        handler = DiscogsHandler(TOKEN)
        
        if fetch_all:
            # Fetch all orders (handles pagination internally)
            orders = handler.get_all_orders(status=status)
            
            return jsonify({
                'status': 'success',
                'orders': orders,
                'total': len(orders),
                'pagination': {
                    'page': 1,
                    'per_page': len(orders),
                    'pages': 1,
                    'items': len(orders)
                }
            })
        else:
            # Fetch a single page
            result = handler.get_orders(status=status, page=page, per_page=per_page)
            
            if not result['success']:
                return jsonify({
                    'status': 'error',
                    'error': result.get('error', 'Failed to fetch orders')
                }), 500
            
            return jsonify({
                'status': 'success',
                'orders': result['orders'],
                'pagination': result['pagination']
            })
            
    except Exception as e:
        app.logger.error(f"Error fetching Discogs orders: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/discogs/orders/<order_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def get_discogs_order_detail(order_id):
    """
    Get detailed information for a specific Discogs order.
    """
    try:
        TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
        if not TOKEN:
            return jsonify({
                'status': 'error',
                'error': 'Discogs token not configured'
            }), 500
        
        handler = DiscogsHandler(TOKEN)
        result = handler.get_order_details(order_id)
        
        if not result['success']:
            return jsonify({
                'status': 'error',
                'error': result.get('error', 'Failed to fetch order')
            }), 500
        
        return jsonify({
            'status': 'success',
            'order': result['order']
        })
        
    except Exception as e:
        app.logger.error(f"Error fetching Discogs order detail: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500
 

@app.route('/api/records/mark-sold-on-discogs', methods=['POST'])
@login_required
@role_required(['admin'])
def mark_sold_on_discogs():
    """
    Mark a record as sold on Discogs.
    Updates status_id to 4, sets actual_sale_price, and date_sold.
    
    Request body:
    {
        "record_id": 9976,
        "sale_price": 34.99
    }
    """
    try:
        data = request.json
        record_id = data.get('record_id')
        sale_price = data.get('sale_price')
        
        if not record_id:
            return jsonify({'status': 'error', 'error': 'record_id is required'}), 400
        
        if sale_price is None:
            return jsonify({'status': 'error', 'error': 'sale_price is required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if record exists
        cursor.execute('SELECT id, artist, title, status_id FROM records WHERE id = ?', (record_id,))
        record = cursor.fetchone()
        
        if not record:
            conn.close()
            return jsonify({'status': 'error', 'error': f'Record #{record_id} not found'}), 404
        
        # Check if already sold
        if record['status_id'] == 3 or record['status_id'] == 4:
            conn.close()
            return jsonify({
                'status': 'error', 
                'error': f'Record #{record_id} is already marked as sold (status_id: {record["status_id"]})'
            }), 400
        
        # Update the record - NO discogs_order_id
        cursor.execute('''
            UPDATE records 
            SET status_id = 4, 
                actual_sale_price = ?, 
                date_sold = CURRENT_DATE
            WHERE id = ?
        ''', (sale_price, record_id))
        
        conn.commit()
        
        # Get updated record
        cursor.execute('''
            SELECT id, artist, title, status_id, actual_sale_price, date_sold
            FROM records 
            WHERE id = ?
        ''', (record_id,))
        
        updated_record = cursor.fetchone()
        conn.close()
        
        app.logger.info(f"✅ Record #{record_id} marked as sold on Discogs for ${sale_price}")
        
        return jsonify({
            'status': 'success',
            'message': f'Record #{record_id} marked as sold on Discogs',
            'record': {
                'id': updated_record['id'],
                'artist': updated_record['artist'],
                'title': updated_record['title'],
                'status_id': updated_record['status_id'],
                'actual_sale_price': float(updated_record['actual_sale_price']) if updated_record['actual_sale_price'] else None,
                'date_sold': updated_record['date_sold']
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error marking record as sold on Discogs: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/records/search-by-barcode', methods=['GET'])
@login_required
@role_required(['admin'])
def search_records_by_barcode():
    """
    Search for records by barcode.
    Returns all records that match the barcode.
    
    Query params:
        barcode: The barcode to search for
    """
    try:
        barcode = request.args.get('barcode', '').strip()
        
        if not barcode:
            return jsonify({
                'status': 'error',
                'error': 'barcode parameter is required'
            }), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Search for records with this barcode
        cursor.execute('''
            SELECT 
                r.id, r.artist, r.title, r.barcode, r.catalog_number,
                r.store_price, r.status_id, r.location,
                s.status_name,
                cs.condition_name as sleeve_condition_name,
                cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.barcode = ?
            ORDER BY r.created_at DESC
        ''', (barcode,))
        
        records = cursor.fetchall()
        conn.close()
        
        records_list = []
        for record in records:
            records_list.append({
                'id': record['id'],
                'artist': record['artist'],
                'title': record['title'],
                'barcode': record['barcode'],
                'catalog_number': record['catalog_number'],
                'store_price': float(record['store_price']) if record['store_price'] else 0,
                'status_id': record['status_id'],
                'status_name': record['status_name'],
                'location': record['location'],
                'sleeve_condition': record['sleeve_condition_name'],
                'disc_condition': record['disc_condition_name']
            })
        
        return jsonify({
            'status': 'success',
            'records': records_list,
            'count': len(records_list)
        })
        
    except Exception as e:
        app.logger.error(f"Error searching records by barcode: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/accounting/monthly-performance', methods=['GET'])
@login_required
@role_required(['admin'])
def monthly_performance():
    """Get monthly account breakdown for each month in the selected range."""
    start = request.args.get('start')  # YYYY-MM
    end = request.args.get('end')      # YYYY-MM
    if not start or not end:
        return jsonify({'status': 'error', 'error': 'start and end months required'}), 400

    from datetime import datetime, timedelta
    start_date = datetime.strptime(start + '-01', '%Y-%m-%d')
    end_date = datetime.strptime(end + '-01', '%Y-%m-%d')
    if end_date.month == 12:
        end_date = end_date.replace(year=end_date.year+1, month=1, day=1) - timedelta(days=1)
    else:
        end_date = end_date.replace(month=end_date.month+1, day=1) - timedelta(days=1)

    conn = get_db()
    cursor = conn.cursor()

    # Account‑level breakdown: for each month, get all revenue and expense accounts with non‑zero balance
    cursor.execute('''
        SELECT 
            strftime('%Y-%m', je.transaction_date) as month,
            a.code,
            a.name,
            a.type,
            SUM(jl.debit_amount - jl.credit_amount) / 100.0 as net_amount
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        JOIN accounts a ON a.id = jl.account_id
        WHERE a.type IN ('revenue', 'expense')
          AND je.transaction_date >= ? AND je.transaction_date <= ?
        GROUP BY month, a.id
        ORDER BY month, a.code
    ''', (start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')))
    rows = cursor.fetchall()

    account_breakdown = {}
    for row in rows:
        month = row['month']
        if month not in account_breakdown:
            account_breakdown[month] = {}
        # For revenue accounts, net_amount = debit - credit; we want positive for revenue, so invert.
        if row['type'] == 'revenue':
            amount = -row['net_amount']
        else:
            amount = row['net_amount']
        account_breakdown[month][row['name']] = amount

    # Build month list
    months = []
    current = datetime.strptime(start + '-01', '%Y-%m-%d')
    while current <= end_date:
        months.append(current.strftime('%Y-%m'))
        if current.month == 12:
            current = current.replace(year=current.year+1, month=1, day=1)
        else:
            current = current.replace(month=current.month+1, day=1)

    # Ensure each month has an entry in account_breakdown
    for m in months:
        if m not in account_breakdown:
            account_breakdown[m] = {}

    conn.close()

    return jsonify({
        'status': 'success',
        'months': months,
        'account_breakdown': account_breakdown
    })


@app.route('/api/accounting/monthly-account-transactions', methods=['GET'])
@login_required
@role_required(['admin'])
def monthly_account_transactions():
    """Return journal entries for a given month.
       If account_id is provided, filter by that account.
       If exclude_orders=true, skip entries with source_type = 'order'.
    """
    month = request.args.get('month')
    account_id = request.args.get('account_id', type=int)  # can be None
    exclude_orders = request.args.get('exclude_orders', 'false').lower() == 'true'

    if not month:
        return jsonify({'status': 'error', 'error': 'month required'}), 400

    conn = get_db()
    cursor = conn.cursor()

    query = '''
        SELECT 
            je.transaction_date,
            je.description,
            jl.debit_amount / 100.0 as debit_amount,
            jl.credit_amount / 100.0 as credit_amount,
            a.name as account_name,
            je.source_type
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        JOIN accounts a ON a.id = jl.account_id
        WHERE strftime('%Y-%m', je.transaction_date) = ?
    '''
    params = [month]

    if account_id is not None:
        query += ' AND jl.account_id = ?'
        params.append(account_id)

    if exclude_orders:
        query += ' AND je.source_type != ?'
        params.append('order')

    query += ' ORDER BY je.transaction_date DESC'
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    transactions = []
    for row in rows:
        transactions.append({
            'transaction_date': row['transaction_date'],
            'description': row['description'],
            'debit_amount': row['debit_amount'],
            'credit_amount': row['credit_amount'],
            'account_name': row['account_name'],
            'source_type': row['source_type']
        })

    return jsonify({
        'status': 'success',
        'transactions': transactions
    })


@app.route('/api/accounting/cash-flow', methods=['GET'])
@login_required
@role_required(['admin'])
def cash_flow():
    """Monthly cash inflows and outflows from bank transactions."""
    start = request.args.get('start')  # YYYY-MM
    end = request.args.get('end')      # YYYY-MM
    if not start or not end:
        return jsonify({'status': 'error', 'error': 'start and end months required'}), 400

    from datetime import datetime, timedelta
    start_date = datetime.strptime(start + '-01', '%Y-%m-%d')
    end_date = datetime.strptime(end + '-01', '%Y-%m-%d')
    if end_date.month == 12:
        end_date = end_date.replace(year=end_date.year+1, month=1, day=1) - timedelta(days=1)
    else:
        end_date = end_date.replace(month=end_date.month+1, day=1) - timedelta(days=1)

    conn = get_db()
    cursor = conn.cursor()

    # Get all bank account IDs (asset accounts with code 1010, 1020, 1025, or name like 'Bank')
    cursor.execute('''
        SELECT id FROM accounts
        WHERE type = 'asset' AND (code IN ('1010', '1020', '1025') OR name LIKE '%Bank%' OR name LIKE '%Cash%')
    ''')
    bank_ids = [row['id'] for row in cursor.fetchall()]
    if not bank_ids:
        conn.close()
        return jsonify({'status': 'error', 'error': 'No bank accounts found'}), 400

    placeholders = ','.join('?' for _ in bank_ids)

    # For each month, sum debit_amount (inflows) and credit_amount (outflows)
    cursor.execute(f'''
        SELECT
            strftime('%Y-%m', je.transaction_date) as month,
            COALESCE(SUM(jl.debit_amount), 0) / 100.0 as cash_in,
            COALESCE(SUM(jl.credit_amount), 0) / 100.0 as cash_out
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.account_id IN ({placeholders})
          AND je.transaction_date >= ? AND je.transaction_date <= ?
        GROUP BY month
        ORDER BY month
    ''', bank_ids + [start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')])
    rows = cursor.fetchall()
    conn.close()

    # Build month list
    months = []
    current = datetime.strptime(start + '-01', '%Y-%m-%d')
    while current <= end_date:
        months.append(current.strftime('%Y-%m'))
        if current.month == 12:
            current = current.replace(year=current.year+1, month=1, day=1)
        else:
            current = current.replace(month=current.month+1, day=1)

    # Map results
    data = {row['month']: {'cash_in': row['cash_in'], 'cash_out': row['cash_out']} for row in rows}

    cash_in_arr = []
    cash_out_arr = []
    net_arr = []
    for m in months:
        ci = data.get(m, {}).get('cash_in', 0)
        co = data.get(m, {}).get('cash_out', 0)
        cash_in_arr.append(ci)
        cash_out_arr.append(co)
        net_arr.append(ci - co)

    return jsonify({
        'status': 'success',
        'months': months,
        'cash_in': cash_in_arr,
        'cash_out': cash_out_arr,
        'net': net_arr
    })


@app.route('/api/accounting/cash-flow-detail', methods=['GET'])
@login_required
@role_required(['admin'])
def cash_flow_detail():
    """Monthly cash flow breakdown by account: positive = inflow, negative = outflow.
       Excludes order entries so only bank transactions appear.
    """
    start = request.args.get('start')  # YYYY-MM
    end = request.args.get('end')      # YYYY-MM
    if not start or not end:
        return jsonify({'status': 'error', 'error': 'start and end months required'}), 400

    from datetime import datetime, timedelta
    start_date = datetime.strptime(start + '-01', '%Y-%m-%d')
    end_date = datetime.strptime(end + '-01', '%Y-%m-%d')
    if end_date.month == 12:
        end_date = end_date.replace(year=end_date.year+1, month=1, day=1) - timedelta(days=1)
    else:
        end_date = end_date.replace(month=end_date.month+1, day=1) - timedelta(days=1)

    conn = get_db()
    cursor = conn.cursor()

    # Get net credit amount per account per month: credit - debit
    # For revenue accounts this is positive (inflow), for expenses it's negative (outflow)
    cursor.execute('''
        SELECT
            strftime('%Y-%m', je.transaction_date) as month,
            a.name,
            a.type,
            COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0) / 100.0 as net_credit
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        JOIN accounts a ON a.id = jl.account_id
        WHERE a.type IN ('revenue', 'expense')
          AND je.transaction_date >= ? AND je.transaction_date <= ?
          AND je.source_type != 'order'   -- <-- EXCLUDE ORDER ENTRIES
        GROUP BY month, a.id
        ORDER BY month, a.type DESC, a.name
    ''', (start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')))
    rows = cursor.fetchall()
    conn.close()

    # Build month list
    months = []
    current = datetime.strptime(start + '-01', '%Y-%m-%d')
    while current <= end_date:
        months.append(current.strftime('%Y-%m'))
        if current.month == 12:
            current = current.replace(year=current.year+1, month=1, day=1)
        else:
            current = current.replace(month=current.month+1, day=1)

    # Group by month
    data = {m: {} for m in months}
    for row in rows:
        month = row['month']
        if month in data:
            data[month][row['name']] = row['net_credit']

    return jsonify({
        'status': 'success',
        'months': months,
        'account_breakdown': data
    })

@app.route('/api/accounting/bank/sync', methods=['POST'])
@login_required
@role_required(['admin'])
def accounting_bank_sync():
    # Just return success; the GET will fetch fresh data
    return jsonify({'status': 'success', 'message': 'Sync triggered'})


@app.route('/api/accounting/bank/apply-filter', methods=['POST'])
@login_required
@role_required(['admin'])
def accounting_apply_filter():
    """Apply a list of transactions to an account, creating or replacing journal entries.
       Always processes every transaction – if an entry exists, it is updated.
    """
    try:
        data = request.json
        transactions = data.get('transactions', [])
        account_id = data.get('account_id')
        
        if not transactions or not account_id:
            return jsonify({'status': 'error', 'error': 'transactions and account_id required'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Get the account details
        cursor.execute('SELECT id, code, name, type FROM accounts WHERE id = ?', (account_id,))
        account = cursor.fetchone()
        if not account:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Account not found'}), 404
        
        app.logger.info(f"Applying transactions to account: {account['code']} - {account['name']} (type: {account['type']})")

        processed_count = 0
        error_count = 0
        created_entries = []

        for tx in transactions:
            try:
                tx_id = tx.get('id')
                amount = tx.get('amount', 0)
                date_raw = tx.get('date')
                description = tx.get('description', '')
                source_type = tx.get('source_type', 'plaid')  # should be provided

                if not tx_id or amount == 0 or not date_raw:
                    error_count += 1
                    continue

                # ---------- DATE PARSING ----------
                date_str = parse_plaid_date(date_raw)
                if not date_str:
                    app.logger.warning(f"Could not parse date {date_raw} for tx {tx_id}, using today")
                    date_str = datetime.now().date().isoformat()

                amount_cents = int(round(abs(amount) * 100))
                is_expense = amount > 0   # Positive = withdrawal (expense)

                # Check if already processed
                cursor.execute('''
                    SELECT id FROM journal_entries
                    WHERE source_type = ? AND source_id = ?
                ''', (source_type, str(tx_id)))
                existing = cursor.fetchone()

                if existing:
                    # Entry exists – delete its old lines
                    cursor.execute('DELETE FROM journal_lines WHERE journal_entry_id = ?', (existing['id'],))
                    entry_id = existing['id']
                else:
                    # Create new entry
                    cursor.execute('''
                        INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
                        VALUES (?, ?, ?, ?)
                    ''', (date_str, f"Bank transaction: {description}", source_type, str(tx_id)))
                    entry_id = cursor.lastrowid

                # Get cash account for this source type
                cash_id = get_cash_account_id(source_type)
                if not cash_id:
                    app.logger.warning(f"No cash account for source {source_type}, skipping tx {tx_id}")
                    error_count += 1
                    continue

                # Insert the new lines for this entry
                if is_expense:
                    # Withdrawal: Debit expense, Credit cash
                    cursor.execute('''
                        INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                        VALUES (?, ?, ?, ?)
                    ''', (entry_id, account_id, amount_cents, 0))
                    cursor.execute('''
                        INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                        VALUES (?, ?, ?, ?)
                    ''', (entry_id, cash_id, 0, amount_cents))
                    app.logger.info(f"Expense: Debit {account['name']} ${amount_cents/100:.2f}, Credit Cash ${amount_cents/100:.2f}")
                else:
                    # Deposit: Debit cash, Credit account
                    cursor.execute('''
                        INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                        VALUES (?, ?, ?, ?)
                    ''', (entry_id, cash_id, amount_cents, 0))
                    cursor.execute('''
                        INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                        VALUES (?, ?, ?, ?)
                    ''', (entry_id, account_id, 0, amount_cents))
                    app.logger.info(f"Income: Debit Cash ${amount_cents/100:.2f}, Credit {account['name']} ${amount_cents/100:.2f}")

                created_entries.append({
                    'entry_id': entry_id,
                    'transaction_id': tx_id,
                    'amount': amount,
                    'account': account['name'],
                    'account_type': account['type'],
                    'is_expense': is_expense,
                    'description': description
                })
                processed_count += 1
                conn.commit()

            except Exception as e:
                app.logger.error(f"Error processing transaction {tx.get('id')}: {str(e)}")
                error_count += 1
                continue

        conn.close()

        return jsonify({
            'status': 'success',
            'message': f'Applied {processed_count} transactions to {account["name"]}. Errors: {error_count}',
            'count': processed_count,
            'errors': error_count,
            'account': {
                'id': account['id'],
                'code': account['code'],
                'name': account['name'],
                'type': account['type']
            },
            'entries': created_entries[:10]
        })
        
    except Exception as e:
        app.logger.error(f"Apply filter error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== ACCOUNTING: ACCOUNT TRANSACTIONS ====================

@app.route('/api/accounting/account-transactions', methods=['GET'])
@login_required
@role_required(['admin'])
def accounting_get_account_transactions():
    """
    Get all journal lines for a specific account with pagination.
    Returns transactions with debit/credit amounts and running balance.
    """
    try:
        account_id = request.args.get('account_id', type=int)
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        offset = (page - 1) * per_page

        if not account_id:
            return jsonify({'status': 'error', 'error': 'account_id is required'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Verify account exists
        cursor.execute('SELECT id, code, name, type FROM accounts WHERE id = ?', (account_id,))
        account = cursor.fetchone()
        if not account:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Account not found'}), 404

        # Build the query for journal lines with this account
        # Use date() function to handle date comparisons regardless of format
        query = '''
            SELECT 
                jl.id,
                jl.journal_entry_id,
                jl.account_id,
                jl.debit_amount,
                jl.credit_amount,
                je.transaction_date,
                je.description as journal_description,
                je.source_type,
                je.source_id,
                a.code as account_code,
                a.name as account_name
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            JOIN accounts a ON jl.account_id = a.id
            WHERE jl.account_id = ?
        '''
        params = [account_id]

        # Handle date filters - use date() function to normalize
        if date_from:
            query += ' AND date(je.transaction_date) >= date(?)'
            params.append(date_from)
        if date_to:
            query += ' AND date(je.transaction_date) <= date(?)'
            params.append(date_to)

        # Get total count
        count_query = '''
            SELECT COUNT(*) as total
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE jl.account_id = ?
        '''
        count_params = [account_id]
        if date_from:
            count_query += ' AND date(je.transaction_date) >= date(?)'
            count_params.append(date_from)
        if date_to:
            count_query += ' AND date(je.transaction_date) <= date(?)'
            count_params.append(date_to)
            
        cursor.execute(count_query, count_params)
        result = cursor.fetchone()
        total = result['total'] if result else 0

        # Get paginated results
        query += ' ORDER BY je.transaction_date DESC, je.id DESC LIMIT ? OFFSET ?'
        params.extend([per_page, offset])
        cursor.execute(query, params)
        rows = cursor.fetchall()

        # Get running balance
        balance_query = '''
            SELECT 
                COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) as balance
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE jl.account_id = ?
        '''
        balance_params = [account_id]
        if date_from:
            balance_query += ' AND date(je.transaction_date) >= date(?)'
            balance_params.append(date_from)
        if date_to:
            balance_query += ' AND date(je.transaction_date) <= date(?)'
            balance_params.append(date_to)

        cursor.execute(balance_query, balance_params)
        balance_row = cursor.fetchone()
        balance = balance_row['balance'] / 100.0 if balance_row and balance_row['balance'] is not None else 0

        # Format results
        transactions = []
        for row in rows:
            row_dict = dict(row) if row else {}
            
            # Get debit and credit amounts
            debit = row_dict.get('debit_amount') or 0
            credit = row_dict.get('credit_amount') or 0
            
            transactions.append({
                'id': row_dict.get('id'),
                'journal_entry_id': row_dict.get('journal_entry_id'),
                'account_id': row_dict.get('account_id'),
                'account_code': row_dict.get('account_code', ''),
                'account_name': row_dict.get('account_name', ''),
                'transaction_date': row_dict.get('transaction_date', ''),
                'journal_description': row_dict.get('journal_description') or '',
                'description': row_dict.get('journal_description') or '',
                'debit_amount': debit / 100.0,
                'credit_amount': credit / 100.0,
                'source_type': row_dict.get('source_type') or '',
                'source_id': row_dict.get('source_id') or ''
            })

        conn.close()

        return jsonify({
            'status': 'success',
            'transactions': transactions,
            'total': total,
            'page': page,
            'per_page': per_page,
            'balance': balance,
            'account': {
                'id': account['id'],
                'code': account['code'],
                'name': account['name'],
                'type': account['type']
            }
        })
    except Exception as e:
        app.logger.error(f"Account transactions error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/accounting/journal/<int:entry_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def accounting_delete_journal_entry(entry_id):
    """
    Delete a journal entry and all its lines.
    """
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if entry exists
        cursor.execute('SELECT id, source_id, source_type FROM journal_entries WHERE id = ?', (entry_id,))
        entry = cursor.fetchone()
        if not entry:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Journal entry not found'}), 404
        
        # Delete journal lines first (foreign key constraint)
        cursor.execute('DELETE FROM journal_lines WHERE journal_entry_id = ?', (entry_id,))
        # Delete the journal entry
        cursor.execute('DELETE FROM journal_entries WHERE id = ?', (entry_id,))
        
        conn.commit()
        conn.close()
        
        app.logger.info(f"Deleted journal entry #{entry_id}")
        return jsonify({
            'status': 'success',
            'message': f'Journal entry #{entry_id} deleted successfully'
        })
    except Exception as e:
        app.logger.error(f"Error deleting journal entry: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/accounting/account-date-range', methods=['GET'])
@login_required
@role_required(['admin'])
def accounting_account_date_range():
    """Return the earliest and latest transaction dates for a given account."""
    account_id = request.args.get('account_id', type=int)
    if not account_id:
        return jsonify({'status': 'error', 'error': 'account_id required'}), 400
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT MIN(je.transaction_date) as min_date, MAX(je.transaction_date) as max_date
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_entry_id = je.id
        WHERE jl.account_id = ?
    ''', (account_id,))
    row = cursor.fetchone()
    conn.close()
    if row and row['min_date'] and row['max_date']:
        return jsonify({
            'status': 'success',
            'min_date': row['min_date'],
            'max_date': row['max_date']
        })
    else:
        return jsonify({
            'status': 'success',
            'min_date': None,
            'max_date': None
        })

@app.route('/api/accounting/earliest-transaction', methods=['GET'])
@login_required
@role_required(['admin'])
def earliest_transaction():
    """Return the earliest transaction date from journal_entries."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT MIN(transaction_date) as earliest FROM journal_entries')
    row = cursor.fetchone()
    conn.close()
    if row and row['earliest']:
        return jsonify({'status': 'success', 'earliest': row['earliest']})
    else:
        # Fallback to 1 year ago if no entries
        fallback = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
        return jsonify({'status': 'success', 'earliest': fallback})

if __name__ == '__main__': 
    app.run(debug=True, port=5000)