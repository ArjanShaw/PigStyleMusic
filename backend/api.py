import string
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

import requests
import base64
from plaid.model.country_code import CountryCode
from plaid.model.products import Products
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
import time  # if not already imported

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

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

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


def get_account_id(code):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM accounts WHERE code = ?', (code,))
    row = cursor.fetchone()
    conn.close()
    return row['id'] if row else None

# ==================== HELPER: GET CASH ACCOUNT BY SOURCE TYPE ====================

def get_cogs_rates():
    """Get COGS assumption rates from app_config. Raises error if not found."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT config_key, config_value FROM app_config WHERE config_key IN ('cogs_new_record_rate', 'cogs_used_record_rate')")
    rows = cursor.fetchall()
    conn.close()
    
    new_rate = None
    used_rate = None
    
    for row in rows:
        if row['config_key'] == 'cogs_new_record_rate':
            new_rate = float(row['config_value'])
        elif row['config_key'] == 'cogs_used_record_rate':
            used_rate = float(row['config_value'])
    
    if new_rate is None:
        raise ValueError("cogs_new_record_rate not found in app_config")
    if used_rate is None:
        raise ValueError("cogs_used_record_rate not found in app_config")
    
    return new_rate, used_rate

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
    # Fetch Plaid transactions
    plaid_tx = fetch_bank_transactions()
    for tx in plaid_tx:
        tx['source_type'] = 'plaid'

    # Fetch historic transactions from bank_transactions table
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, transaction_date as date, amount, description, processed, source
        FROM bank_transactions
        ORDER BY transaction_date DESC
    ''')
    historic_rows = cursor.fetchall()
    conn.close()
    historic_tx = []
    for row in historic_rows:
        # FIX: Map csv_import to historic
        source_val = row['source'] if row['source'] else 'csv_import'
        mapped_source = 'historic' if source_val in ('csv_import', 'historic') else source_val
        historic_tx.append({
            'id': row['id'],
            'date': row['date'],
            'amount': row['amount'] / 100.0,
            'description': row['description'],
            'processed': bool(row['processed']) if row['processed'] is not None else False,
            'source_type': mapped_source
        })

    all_tx = plaid_tx + historic_tx

    # Apply search filter
    if search:
        search_lower = search.lower()
        all_tx = [tx for tx in all_tx if search_lower in tx.get('description', '').lower()]

    # Filter by source_type if provided
    if source_type:
        all_tx = [tx for tx in all_tx if tx.get('source_type') == source_type]

    # Filter unprocessed if requested
    if unprocessed_only:
        all_tx = [tx for tx in all_tx if not tx.get('processed', False)]

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
            # If cash not found, fallback
            if not cash_account_id:
                cash_account_id = cash_id
            tx['cash_account_id'] = cash_account_id
            tx['account_id'] = non_cash_account_id
        else:
            tx['processed'] = False
            tx['account_id'] = None
            tx['cash_account_id'] = None

    conn.close()

    # Filter unprocessed if requested (again, to be safe)
    if unprocessed_only:
        all_tx = [tx for tx in all_tx if not tx.get('processed', False)]

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

def create_square_terminal_checkout(
    amount_cents,
    record_ids,
    record_titles,
    reference_id=None,
    device_id=None
):
    """Create a Square Terminal checkout using a direct API call."""

    print(f"\n🔍 DEBUG - Received device_id: {device_id!r}")

    access_token = os.environ.get("SQUARE_ACCESS_TOKEN")
    environment = os.environ.get("SQUARE_ENVIRONMENT", "production")

    if not access_token:
        return None, "SQUARE_ACCESS_TOKEN not set"

    if not device_id:
        return None, "No Square Terminal device_id provided"

    # The Devices API returns IDs such as:
    # device:549CS149C4001476
    # Terminal checkout requires:
    # 549CS149C4001476
    device_id = str(device_id).strip()

    if device_id.startswith("device:"):
        device_id = device_id[len("device:"):]

    print(f"🔍 DEBUG - Normalized device_id: {device_id!r}")

    if not device_id:
        return None, "Invalid Square Terminal device_id"

    base_url = (
        "https://connect.squareup.com"
        if environment == "production"
        else "https://connect.squareupsandbox.com"
    )

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Square-Version": "2026-05-20"
    }

    idempotency_key = str(uuid.uuid4())

    checkout_data = {
        "idempotency_key": idempotency_key,
        "checkout": {
            "amount_money": {
                "amount": int(amount_cents),
                "currency": "USD"
            },
            "device_options": {
                "device_id": device_id
            },
            "reference_id": (
                reference_id or f"pigstyle_{idempotency_key[:8]}"
            ),
            "note": (
                f"PigStyle Music: {', '.join(record_titles[:3])}"
                f"{'...' if len(record_titles) > 3 else ''}"
            )
        }
    }

    print(
        "🔍 DEBUG - Sending device_id in payload: "
        f"{checkout_data['checkout']['device_options']['device_id']!r}"
    )

    # Do not print the access token.
    safe_headers = {
        **headers,
        "Authorization": "Bearer [REDACTED]"
    }

    print("\n========== SQUARE REQUEST ==========")
    print(f"URL: {base_url}/v2/terminals/checkouts")
    print("Headers:")
    print(json.dumps(safe_headers, indent=2))
    print("Payload:")
    print(json.dumps(checkout_data, indent=2))
    print("====================================\n")

    try:
        response = requests.post(
            f"{base_url}/v2/terminals/checkouts",
            headers=headers,
            json=checkout_data,
            timeout=30
        )
    except requests.RequestException as exc:
        return None, f"Unable to contact Square: {exc}"

    print("\n========== SQUARE RESPONSE ==========")
    print(f"Status Code: {response.status_code}")
    print(f"Reason: {response.reason}")
    print("Headers:")
    print(response.headers)
    print("Body:")
    print(response.text)
    print("=====================================\n")

    if response.status_code not in (200, 201):
        return None, (
            f"Square API error ({response.status_code}): {response.text}"
        )

    return response.json(), None


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

 


@app.route('/api/discogs/check-auth', methods=['GET'])
def check_discogs_auth():
    """Check if user is authenticated with Discogs"""
    return jsonify({
        'authenticated': 'discogs_access_token' in session
    })



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


# ==================== NEW: SELF-CONTAINED BATCH MARKUP ENDPOINT ====================
# This is the ONLY endpoint that calculates Discogs prices.
# No try/catch – it raises exceptions on invalid data.
# No helper functions – all logic is inlined.
# ================================================================================

@app.route('/api/discogs/calculate-markup-batch', methods=['POST'])
def calculate_markup_batch():
    """
    ONE endpoint for all markup calculations.
    Accepts: {"records": [{"id": 1, "created_at": "2026-01-01", "store_price": 10.0}, ...]}
    Returns: {"status": "success", "results": [{"id": 1, "discogs_price": 12.5, "markup_percent": 20.0, "days_old": 5}, ...]}
    No try/catch – if data is invalid, it raises an exception and returns 500.
    """
    from datetime import date, datetime

    data = request.json
    records_input = data.get('records', [])
    if not records_input:
        raise ValueError('No records provided')

    # Fetch rules once
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT days_old, markup_percent FROM markup_rules ORDER BY days_old ASC')
    rules_rows = cursor.fetchall()
    conn.close()
    if not rules_rows:
        raise ValueError('No markup rules configured')

    rules = [(r['days_old'], r['markup_percent']) for r in rules_rows]
    today = date.today()
    results = []

    for rec in records_input:
        rec_id = rec.get('id')
        if rec_id is None:
            raise ValueError('Missing record id')

        created_at_str = rec.get('created_at')
        if not created_at_str:
            raise ValueError(f'Missing created_at for record {rec_id}')

        store_price = rec.get('store_price')
        if store_price is None:
            raise ValueError(f'Missing store_price for record {rec_id}')
        store_price = float(store_price)
        if store_price <= 0:
            raise ValueError(f'store_price must be > 0 for record {rec_id}')

        # --- Strict date parsing (no fallback) ---
        if isinstance(created_at_str, str):
            try:
                # Try ISO date first
                created_date = datetime.strptime(created_at_str.split('T')[0], '%Y-%m-%d').date()
            except ValueError:
                # Then try full datetime
                created_date = datetime.strptime(created_at_str, '%Y-%m-%d %H:%M:%S').date()
        else:
            created_date = created_at_str

        days_old = (today - created_date).days

        # --- Inline interpolation (no helper) ---
        if days_old <= rules[0][0]:
            markup_percent = rules[0][1]
        elif days_old >= rules[-1][0]:
            markup_percent = rules[-1][1]
        else:
            markup_percent = 0.0
            for i in range(len(rules) - 1):
                x1, y1 = rules[i]
                x2, y2 = rules[i + 1]
                if x1 <= days_old <= x2:
                    if x2 == x1:
                        markup_percent = y1
                    else:
                        t = (days_old - x1) / (x2 - x1)
                        markup_percent = y1 + t * (y2 - y1)
                    break

        discogs_price = round(store_price * (1 + markup_percent / 100), 2)

        results.append({
            'id': rec_id,
            'discogs_price': discogs_price,
            'markup_percent': round(markup_percent, 1),
            'days_old': days_old
        })

    return jsonify({'status': 'success', 'results': results})


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
        cursor.execute('SELECT created_at, store_price FROM records WHERE id = ?', (record['id'],))
        db_record = cursor.fetchone()
        conn.close()
        
        if not db_record:
            return jsonify({'success': False, 'error': f'Record #{record["id"]} not found'}), 404
        
        # ---- Inline markup calculation ----
        from datetime import date, datetime
        
        # Fetch rules
        conn2 = get_db()
        cursor2 = conn2.cursor()
        cursor2.execute('SELECT days_old, markup_percent FROM markup_rules ORDER BY days_old ASC')
        rules_rows = cursor2.fetchall()
        conn2.close()
        if not rules_rows:
            return jsonify({'success': False, 'error': 'No markup rules configured'}), 400

        rules = [(r['days_old'], r['markup_percent']) for r in rules_rows]

        # Parse created_at strictly
        created_at_str = db_record['created_at']
        if isinstance(created_at_str, str):
            try:
                created_date = datetime.strptime(created_at_str.split('T')[0], '%Y-%m-%d').date()
            except ValueError:
                created_date = datetime.strptime(created_at_str, '%Y-%m-%d %H:%M:%S').date()
        else:
            created_date = created_at_str

        days_old = (date.today() - created_date).days

        # Inline interpolation
        if days_old <= rules[0][0]:
            markup_percent = rules[0][1]
        elif days_old >= rules[-1][0]:
            markup_percent = rules[-1][1]
        else:
            markup_percent = 0.0
            for i in range(len(rules) - 1):
                x1, y1 = rules[i]
                x2, y2 = rules[i + 1]
                if x1 <= days_old <= x2:
                    if x2 == x1:
                        markup_percent = y1
                    else:
                        t = (days_old - x1) / (x2 - x1)
                        markup_percent = y1 + t * (y2 - y1)
                    break

        discogs_price = round(db_record['store_price'] * (1 + markup_percent / 100), 2)
        # ---- End of inline calculation ----
        
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
        
        # 👇 CHANGED: redirect to root with status parameter
        if env == "development":
            redirect_url = f"http://localhost:8000/?status=completed&order_id={order_id}"
        else:
            redirect_url = f"https://www.pigstylemusic.com/?status=completed&order_id={order_id}"

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
                payment_status, order_status, notes, created_at, updated_at, notified, channel)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 'website')
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

@app.route('/records', methods=['POST'])
def create_record():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400
    
    required_fields = ['artist', 'title', 'store_price', 'batch_id']
    for field in required_fields:
        if field not in data or data[field] is None:
            return jsonify({'status': 'error', 'error': f'{field} is required'}), 400
    
    batch_id = data.get('batch_id')
    if not batch_id:
        return jsonify({'status': 'error', 'error': 'batch_id must be a valid draft ID'}), 400

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
        
        discogs_genre_raw = data.get('discogs_genre_raw', '')
        notes = data.get('notes', '')
        
        # Location fields - only location_id and location_index
        location_id = data.get('location_id')
        location_index = data.get('location_index')
        format_id = data.get('format_id')
        
        cursor.execute('''
            INSERT INTO records (
                artist, title, barcode, image_url, catalog_number,
                condition_sleeve_id, condition_disc_id, store_price,
                consignor_id, commission_rate, status_id, discogs_genre_raw, notes,
                batch_id, format_id, location_id, location_index,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (
            data.get('artist'), 
            data.get('title'), 
            data.get('barcode', ''), 
            data.get('image_url', ''), 
            data.get('catalog_number', ''), 
            condition_sleeve_id,
            condition_disc_id, 
            float(data.get('store_price', 0.0)),
            consignor_id, 
            float(commission_rate) if commission_rate else None, 
            int(status_id),
            discogs_genre_raw,
            notes,
            batch_id,
            format_id,
            location_id,
            location_index
        ))
        
        record_id = cursor.lastrowid
        
        # ===== STORE CREDIT / GIFT CARD TRADE-IN LOGIC =====
        store_credit = data.get('store_credit', False)
        gift_card_code = data.get('gift_card_code', '').strip().upper()
        debtor_name = data.get('debtor_name', '').strip()
        total_offer = float(data.get('total_offer', 0))

        if store_credit:
            if not gift_card_code:
                conn.rollback()
                conn.close()
                return jsonify({'status': 'error', 'error': 'Gift card code required for store credit'}), 400
            
            if not debtor_name:
                conn.rollback()
                conn.close()
                return jsonify({'status': 'error', 'error': 'Debtor name required for store credit'}), 400
            
            if total_offer <= 0:
                conn.rollback()
                conn.close()
                return jsonify({'status': 'error', 'error': 'Total offer must be greater than 0'}), 400
            
            store_credit_value = total_offer * 1.5
            
            cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1050',))
            inventory = cursor.fetchone()
            cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
            liability = cursor.fetchone()
            
            if not inventory or not liability:
                conn.rollback()
                conn.close()
                return jsonify({'status': 'error', 'error': 'Required accounts not found'}), 500
            
            cursor.execute('SELECT id FROM journal_entries WHERE source_type = "gift_card" AND source_id = ?', (gift_card_code,))
            if cursor.fetchone():
                conn.rollback()
                conn.close()
                return jsonify({'status': 'error', 'error': 'Gift card code already exists'}), 400
            
            value_cents = int(round(store_credit_value * 100))
            today = datetime.now().strftime('%Y-%m-%d')
            trade_notes = data.get('trade_notes', f'Trade-in: {data.get("record_count", 0)} records')
            
            description = f"{debtor_name} | {gift_card_code} | ${store_credit_value:.2f} | Trade-in: {trade_notes}"
            
            cursor.execute('''
                INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
                VALUES (?, ?, ?, ?)
            ''', (today, description, 'gift_card', gift_card_code))
            entry_id = cursor.lastrowid
            
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, inventory['id'], value_cents, 0))
            
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, liability['id'], 0, value_cents))
            
            conn.commit()
            conn.close()
            
            conn2 = get_db()
            cursor2 = conn2.cursor()
            cursor2.execute('''
                SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name,
                cd.condition_name as disc_condition_name,
                f.name as format_name,
                l.name as location_name
                FROM records r 
                LEFT JOIN d_status s ON r.status_id = s.id
                LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
                LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id 
                LEFT JOIN formats f ON r.format_id = f.id
                LEFT JOIN locations l ON r.location_id = l.id
                WHERE r.id = ?
            ''', (record_id,))
            record = cursor2.fetchone()
            conn2.close()
            
            return jsonify({
                'status': 'success',
                'record': dict(record) if record else {},
                'message': f'Record added and store credit created: ${store_credit_value:.2f}',
                'store_credit_value': store_credit_value,
                'gift_card_code': gift_card_code,
                'debtor_name': debtor_name,
                'entry_id': entry_id
            })
        
        conn.commit()
        
        cursor.execute('''
            SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name,
            cd.condition_name as disc_condition_name,
            f.name as format_name,
            l.name as location_name
            FROM records r 
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id 
            LEFT JOIN formats f ON r.format_id = f.id
            LEFT JOIN locations l ON r.location_id = l.id
            WHERE r.id = ?
        ''', (record_id,))
        
        record = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success', 
            'record': dict(record) if record else {}, 
            'message': f'Record added successfully with ID: {record_id}'
        })
        
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'status': 'error', 'error': f"Database error: {str(e)}"}), 500

@app.route('/records', methods=['GET'])
def get_records():
    """Get records with filtering, pagination, and a generic search."""
    try:
        conn = get_db()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # ---------- Base query (all joins) ----------
        # ADDED: LEFT JOIN locations to get genre_id
        base_query = """
            SELECT 
                r.*,
                f.name AS format_name,
                s.status_name AS status_name,
                l.name AS location_name,
                l.genre_id,                     -- <-- ADD THIS LINE
                cd.condition_name AS disc_condition_name,
                cd.abbreviation AS disc_abbr,
                cd.quality_index AS disc_quality,
                cs.condition_name AS sleeve_condition_name,
                cs.abbreviation AS sleeve_abbr,
                cs.quality_index AS sleeve_quality,
                cd.display_name AS disc_display,
                cs.display_name AS sleeve_display,
                CASE 
                    WHEN cd.quality_index IS NOT NULL AND cs.quality_index IS NOT NULL 
                    THEN (cd.quality_index + cs.quality_index) / 2.0 
                    ELSE NULL 
                END AS combined_quality
            FROM records r
            LEFT JOIN formats f ON r.format_id = f.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN locations l ON r.location_id = l.id       -- <-- ADD THIS JOIN
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            WHERE 1=1
        """

        # ---------- Collect filter conditions and parameters ----------
        where_clauses = []
        params = []

        # --- Status filter (comma-separated) ---
        status_ids = request.args.get('status_ids')
        if status_ids:
            ids = [int(x.strip()) for x in status_ids.split(',') if x.strip()]
            if ids:
                placeholders = ','.join(['?'] * len(ids))
                where_clauses.append(f"r.status_id IN ({placeholders})")
                params.extend(ids)

        # --- Artist (partial match) ---
        artist = request.args.get('artist')
        if artist:
            where_clauses.append("r.artist LIKE ?")
            params.append(f'%{artist}%')

        # --- Title (partial match) ---
        title = request.args.get('title')
        if title:
            where_clauses.append("r.title LIKE ?")
            params.append(f'%{title}%')

        # --- Catalog Number (partial match) ---
        catalog_number = request.args.get('catalog_number')
        if catalog_number:
            where_clauses.append("r.catalog_number LIKE ?")
            params.append(f'%{catalog_number}%')

        # --- Barcode (exact match) ---
        barcode = request.args.get('barcode')
        if barcode:
            where_clauses.append("r.barcode = ?")
            params.append(barcode)

        # --- ID (exact match, single or comma-separated) ---
        ids_param = request.args.get('id') or request.args.get('ids')
        if ids_param:
            ids = [int(x.strip()) for x in ids_param.split(',') if x.strip()]
            if ids:
                placeholders = ','.join(['?'] * len(ids))
                where_clauses.append(f"r.id IN ({placeholders})")
                params.extend(ids)

        # --- Generic search (LIKE on id, barcode, artist, title, catalog_number) ---
        search = request.args.get('search')
        if search:
            search_like = f'%{search}%'
            where_clauses.append(
                "(CAST(r.id AS TEXT) LIKE ? OR r.barcode LIKE ? OR r.artist LIKE ? OR r.title LIKE ? OR r.catalog_number LIKE ?)"
            )
            params.extend([search_like, search_like, search_like, search_like, search_like])

        # --- Location (exact) ---
        location_id = request.args.get('location_id')
        if location_id:
            where_clauses.append("r.location_id = ?")
            params.append(int(location_id))

        # --- Formats (comma-separated) ---
        format_ids = request.args.get('format_ids')
        if format_ids:
            ids = [int(x.strip()) for x in format_ids.split(',') if x.strip()]
            if ids:
                placeholders = ','.join(['?'] * len(ids))
                where_clauses.append(f"r.format_id IN ({placeholders})")
                params.extend(ids)

        # ---------- NEW: genre_ids filter (numeric IDs) ----------
        genre_ids_param = request.args.get('genre_ids')
        if genre_ids_param:
            ids = [int(x.strip()) for x in genre_ids_param.split(',') if x.strip()]
            if ids:
                placeholders = ','.join(['?'] * len(ids))
                # Filter by locations.genre_id (joined table)
                where_clauses.append(f"l.genre_id IN ({placeholders})")
                params.extend(ids)

        # --- Legacy 'genres' filter (string-based, OR LIKE on discogs_genre_raw) ---
        genres = request.args.get('genres')
        if genres:
            genre_list = [x.strip() for x in genres.split(',') if x.strip()]
            if genre_list:
                or_conditions = []
                for genre in genre_list:
                    or_conditions.append("r.discogs_genre_raw LIKE ?")
                    params.append(f'%{genre}%')
                where_clauses.append(f"({' OR '.join(or_conditions)})")

        # --- Require image ---
        require_image = request.args.get('require_image', 'false').lower() == 'true'
        if require_image:
            where_clauses.append("r.image_url IS NOT NULL AND r.image_url != ''")

        # --- Created after (date) ---
        created_after = request.args.get('created_after')
        if created_after:
            where_clauses.append("date(r.created_at) >= date(?)")
            params.append(created_after)

        # --- Last seen filters ---
        last_seen_after = request.args.get('last_seen_after')
        if last_seen_after:
            where_clauses.append("date(r.last_seen) >= date(?)")
            params.append(last_seen_after)

        last_seen_before = request.args.get('last_seen_before')
        if last_seen_before:
            where_clauses.append("date(r.last_seen) <= date(?)")
            params.append(last_seen_before)

        # --- Batch filter ---
        batch_id = request.args.get('batch_id')
        if batch_id is not None:
            batch_id_int = int(batch_id)
            if batch_id_int == -1:
                where_clauses.append("r.batch_id IS NULL")
            else:
                where_clauses.append("r.batch_id = ?")
                params.append(batch_id_int)

        # ---------- Assemble WHERE clause ----------
        if where_clauses:
            where_sql = " AND " + " AND ".join(where_clauses)
        else:
            where_sql = ""

        # ---------- Count query (no ORDER BY / LIMIT / OFFSET) ----------
        count_query = f"SELECT COUNT(*) AS total FROM records r LEFT JOIN locations l ON r.location_id = l.id WHERE 1=1 {where_sql}"
        cursor.execute(count_query, params)
        total = cursor.fetchone()['total']

        # ---------- Ordering ----------
        order_by = request.args.get('order_by', 'created_at')
        allowed_order_columns = ['id', 'created_at', 'last_seen', 'artist', 'title', 'store_price', 'status_id', 'format_id']
        if order_by not in allowed_order_columns:
            order_by = 'created_at'

        order_dir = request.args.get('order_dir', 'DESC').upper()
        if order_dir not in ['ASC', 'DESC']:
            order_dir = 'DESC'
        order_sql = f" ORDER BY r.{order_by} {order_dir}"

        # ---------- Pagination (limit + offset) ----------
        limit = request.args.get('limit')
        offset = request.args.get('offset')
        pagination_sql = ""
        if limit is not None:
            pagination_sql += " LIMIT ?"
            params.append(int(limit))
        if offset is not None:
            pagination_sql += " OFFSET ?"
            params.append(int(offset))

        # ---------- Final query ----------
        final_query = base_query + where_sql + order_sql + pagination_sql
        cursor.execute(final_query, params)
        records = [dict(row) for row in cursor.fetchall()]

        conn.close()

        return jsonify({
            'status': 'success',
            'total': total,
            'count': len(records),
            'records': records
        })

    except Exception as e:
        print(f"❌ Error in get_records: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


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
 
# ==================== MARKUP ANALYSIS ENDPOINT ====================
@app.route('/api/markup-analysis', methods=['GET'])
def get_markup_analysis():
    """Get data for markup curve and distribution charts - filtered like posting."""
    try:
        from datetime import date, datetime, timedelta

        conn = get_db()
        cursor = conn.cursor()
        
        # Get markup rules
        cursor.execute('SELECT days_old, markup_percent FROM markup_rules ORDER BY days_old ASC')
        rules = cursor.fetchall()
        rules_list = [(r['days_old'], r['markup_percent']) for r in rules]
        max_rule_days = max([r[0] for r in rules_list]) if rules_list else 0

        if not rules_list:
            conn.close()
            return jsonify({
                'status': 'success',
                'curve_points': [],
                'distribution': {},
                'age_distribution': {},
                'active_records_count': 0,
                'rules_count': 0,
                'warning': 'No markup rules configured'
            })

        cutoff_param = request.args.get('cutoff')
        if cutoff_param:
            try:
                cutoff_date = datetime.strptime(cutoff_param, '%Y-%m-%d').date()
            except ValueError:
                cutoff_date = date.today() - timedelta(days=30)
        else:
            cutoff_date = date.today() - timedelta(days=30)

        cutoff_str = cutoff_date.strftime('%Y-%m-%d')

        cursor.execute('''
            SELECT created_at, store_price 
            FROM records 
            WHERE status_id = 2
              AND (consignor_id IS NULL OR consignor_id = 1)
              AND last_seen IS NOT NULL
              AND date(last_seen) >= ?
              AND location_id IS NOT NULL
              AND created_at IS NOT NULL
        ''', (cutoff_str,))
        records = cursor.fetchall()
        conn.close()

        today = date.today()
        record_ages = []
        total_days = 0

        for rec in records:
            created_at = rec['created_at']
            if isinstance(created_at, str):
                try:
                    created_date = datetime.strptime(created_at.split('T')[0], '%Y-%m-%d').date()
                except:
                    try:
                        created_date = datetime.strptime(created_at, '%Y-%m-%d %H:%M:%S').date()
                    except:
                        continue
            else:
                created_date = created_at

            days_old = (today - created_date).days
            if days_old < 0:
                days_old = 0
            record_ages.append(days_old)
            total_days += days_old

        age_stats = {
            'min_days': min(record_ages) if record_ages else 0,
            'max_days': max(record_ages) if record_ages else 0,
            'avg_days': round(total_days / len(record_ages), 1) if record_ages else 0,
            'total_records': len(record_ages)
        }

        chart_max_days = max(max(record_ages) if record_ages else 0, max_rule_days, 365) + 30

        def get_markup(days):
            if days <= rules_list[0][0]:
                return rules_list[0][1]
            if days >= rules_list[-1][0]:
                return rules_list[-1][1]
            for i in range(len(rules_list)-1):
                x1, y1 = rules_list[i]
                x2, y2 = rules_list[i+1]
                if x1 <= days <= x2:
                    if x2 == x1:
                        return y1
                    t = (days - x1) / (x2 - x1)
                    return y1 + t * (y2 - y1)
            return rules_list[-1][1]

        curve_points = []
        for d in range(0, chart_max_days + 1):
            curve_points.append({
                'days': d,
                'markup_percent': round(get_markup(d), 1)
            })

        distribution = {}
        for age in record_ages:
            markup = get_markup(age)
            bucket = round(markup / 5) * 5
            label = f"+{bucket}%" if bucket >= 0 else f"{bucket}%"
            distribution[label] = distribution.get(label, 0) + 1

        age_distribution = {}
        for age in record_ages:
            bucket_start = (age // 30) * 30
            bucket_end = bucket_start + 29
            key = f"{bucket_start}-{bucket_end}"
            age_distribution[key] = age_distribution.get(key, 0) + 1

        return jsonify({
            'status': 'success',
            'curve_points': curve_points,
            'distribution': distribution,
            'age_distribution': age_distribution,
            'active_records_count': len(record_ages),
            'rules_count': len(rules_list),
            'max_days': max(record_ages) if record_ages else 0,
            'max_rule_days': max_rule_days,
            'chart_max_days': chart_max_days,
            'age_stats': age_stats,
            'cutoff_date': cutoff_str,
            'records_with_data': len(record_ages)
        })

    except Exception as e:
        app.logger.error(f"Error in markup analysis: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500


# Create upload folder for bills of sale if not exists
BILLS_UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'bills')
os.makedirs(BILLS_UPLOAD_FOLDER, exist_ok=True)

def parse_purchase_from_journal(entry):
    """
    Given a journal entry row (sqlite3.Row), parse the description
    to extract purchase fields. Returns a dict.
    """
    row = dict(entry)  # Convert to dict for safe .get()
    
    # Handle description being NULL
    desc = row.get('description')
    if desc is None:
        desc = ''
    else:
        desc = str(desc)  # ensure string
    
    purchase = {
        'id': row.get('id'),
        'purchase_date': row.get('transaction_date', ''),
        'seller_name': 'Unknown',
        'seller_contact': '',
        'amount_spent': 0.0,
        'description': '',
        'bill_of_sale_path': None,
        'created_at': row.get('created_at') or row.get('transaction_date', '')
    }
    
    # Parse pipe‑separated format
    parts = desc.split('|')
    for part in parts:
        part = part.strip()
        if part.startswith('seller:'):
            purchase['seller_name'] = part.split(':', 1)[1].strip()
        elif part.startswith('contact:'):
            purchase['seller_contact'] = part.split(':', 1)[1].strip()
        elif part.startswith('amount:'):
            try:
                purchase['amount_spent'] = float(part.split(':', 1)[1].strip())
            except:
                pass
        elif part.startswith('date:'):
            purchase['purchase_date'] = part.split(':', 1)[1].strip()
        elif part.startswith('desc:'):
            purchase['description'] = part.split(':', 1)[1].strip()
        elif part.startswith('bill:'):
            purchase['bill_of_sale_path'] = part.split(':', 1)[1].strip()
    
    # Fallback for old format "Inventory purchase from <seller>"
    if purchase['seller_name'] == 'Unknown':
        import re
        match = re.search(r'Inventory purchase from (.*?)(?:\||$)', desc)
        if match:
            purchase['seller_name'] = match.group(1).strip()
    
    return purchase

@app.route('/api/inventory-purchases', methods=['GET'])
@login_required
@role_required(['admin'])
def get_inventory_purchases():
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        seller_name = request.args.get('seller_name', '').strip()
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)

        conn = get_db()
        cursor = conn.cursor()

        query = '''
            SELECT 
                p.id,
                p.seller_name,
                p.seller_contact,
                p.description,
                p.bill_of_sale_path,
                p.status,
                p.created_at,
                p.updated_at,
                COUNT(r.id) as record_count,
                COALESCE(
                    (SELECT jl.debit_amount / 100.0 
                     FROM journal_lines jl
                     JOIN journal_entries je ON jl.journal_entry_id = je.id
                     WHERE je.source_id = p.id 
                       AND je.source_type = 'purchase'
                       AND jl.account_id = (SELECT id FROM accounts WHERE code = '1050')
                     LIMIT 1), 
                    0
                ) as amount_spent
            FROM purchases p
            LEFT JOIN records r ON r.batch_id = p.id
            WHERE 1=1
        '''
        params = []

        if start_date:
            query += ' AND p.created_at >= ?'
            params.append(start_date)
        if end_date:
            query += ' AND p.created_at <= ?'
            params.append(end_date)
        if seller_name:
            query += ' AND p.seller_name LIKE ?'
            params.append(f'%{seller_name}%')

        query += ' GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?'
        params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        purchases = []
        for row in rows:
            purchases.append({
                'id': row['id'],
                'seller_name': row['seller_name'],
                'seller_contact': row['seller_contact'] or '',
                'description': row['description'] or '',
                'bill_of_sale_path': row['bill_of_sale_path'],
                'status': row['status'],
                'created_at': row['created_at'],
                'updated_at': row['updated_at'],
                'record_count': row['record_count'] or 0,
                'amount_spent': float(row['amount_spent'] or 0)
            })

        count_query = 'SELECT COUNT(*) as total FROM purchases WHERE 1=1'
        count_params = []
        if start_date:
            count_query += ' AND created_at >= ?'
            count_params.append(start_date)
        if end_date:
            count_query += ' AND created_at <= ?'
            count_params.append(end_date)
        if seller_name:
            count_query += ' AND seller_name LIKE ?'
            count_params.append(f'%{seller_name}%')

        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['total']
        conn.close()

        return jsonify({
            'status': 'success',
            'purchases': purchases,
            'total': total,
            'limit': limit,
            'offset': offset
        })
    except Exception as e:
        app.logger.error(f"Error getting inventory purchases: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/purchases/<int:purchase_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_purchase(purchase_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get all records linked to this purchase
        cursor.execute('SELECT id FROM records WHERE batch_id = ?', (purchase_id,))
        records = cursor.fetchall()
        
        # Unlink records (set batch_id to NULL) - don't delete them
        cursor.execute('UPDATE records SET batch_id = NULL WHERE batch_id = ?', (purchase_id,))
        unlinked_count = cursor.rowcount
        
        # Delete the purchase
        cursor.execute('DELETE FROM purchases WHERE id = ?', (purchase_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Purchase #{purchase_id} deleted. {unlinked_count} records unlinked.',
            'unlinked_records': unlinked_count
        })
    except Exception as e:
        app.logger.error(f"Error deleting purchase: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/inventory-purchases', methods=['POST'])
@login_required
@role_required(['admin'])
def create_inventory_purchase():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400

        seller_name = data.get('seller_name')
        if not seller_name or not str(seller_name).strip():
            return jsonify({'status': 'error', 'error': 'Seller name is required'}), 400

        amount_spent = float(data.get('amount_spent', 0))
        if amount_spent <= 0:
            return jsonify({'status': 'error', 'error': 'amount_spent must be greater than 0'}), 400

        payment_type = data.get('payment_type', 'cash')
        consignor_id = data.get('consignor_id')
        payment_account_code = data.get('payment_account_id')

        # Validate consignor if store credit
        if payment_type == 'store_credit':
            if not consignor_id:
                return jsonify({'status': 'error', 'error': 'Consignor required for store credit'}), 400
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('SELECT id FROM users WHERE id = ? AND role = "consignor"', (consignor_id,))
            if not cursor.fetchone():
                conn.close()
                return jsonify({'status': 'error', 'error': 'Invalid consignor'}), 400
            conn.close()

        purchase_date = data.get('purchase_date') or datetime.now().strftime('%Y-%m-%d')
        seller_contact = (data.get('seller_contact') or '').strip()
        description_text = (data.get('description') or '').strip()
        bill_path = (data.get('bill_of_sale_path') or '').strip()

        # Build description in pipe‑separated format
        desc = f"Inventory purchase | seller: {seller_name} | contact: {seller_contact} | amount: {amount_spent:.2f} | date: {purchase_date} | desc: {description_text}"
        if bill_path:
            desc += f" | bill: {bill_path}"

        conn = get_db()
        cursor = conn.cursor()

        # Insert journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (purchase_date, desc, 'purchase', str(int(time.time()))))
        entry_id = cursor.lastrowid

        # Insert journal lines
        amount_cents = int(round(amount_spent * 100))
        inventory_id = get_account_id('1050')   # Inventory asset

        if payment_type == 'cash':
            if not payment_account_code:
                conn.rollback()
                conn.close()
                return jsonify({'status': 'error', 'error': 'payment_account_id required for cash'}), 400
            cursor.execute('SELECT id FROM accounts WHERE code = ?', (payment_account_code,))
            account_row = cursor.fetchone()
            if not account_row:
                conn.rollback()
                conn.close()
                return jsonify({'status': 'error', 'error': f'Invalid payment account: {payment_account_code}'}), 400
            cash_id = account_row['id']
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, inventory_id, amount_cents, 0))
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, cash_id, 0, amount_cents))
        else:  # store_credit
            liability_id = get_account_id('2015')
            if not liability_id:
                conn.rollback()
                conn.close()
                return jsonify({'status': 'error', 'error': 'Store Credit Liability account not found'}), 500
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, inventory_id, amount_cents, 0))
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, liability_id, 0, amount_cents))

            # Issue store credit to consignor
            cursor.execute('SELECT config_value FROM app_config WHERE config_key = "STORE_CREDIT_MULTIPLIER"')
            config_row = cursor.fetchone()
            multiplier = float(config_row['config_value']) if config_row else 1.5
            credit_amount = amount_spent * multiplier
            cursor.execute('UPDATE users SET store_credit_balance = store_credit_balance + ? WHERE id = ?',
                           (credit_amount, consignor_id))

        conn.commit()
        conn.close()

        return jsonify({
            'status': 'success',
            'message': 'Inventory purchase recorded',
            'purchase_id': entry_id,   # journal entry ID acts as purchase ID
            'payment_type': payment_type
        })
    except Exception as e:
        app.logger.error(f"Error creating inventory purchase: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/inventory-purchases/<int:purchase_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def get_inventory_purchase(purchase_id):
    try:
        conn = get_db()
        cursor = conn.cursor()

        query = '''
            SELECT 
                je.id,
                je.transaction_date,
                je.description,
                je.created_at,
                COALESCE(SUM(jl.debit_amount), 0) / 100.0 as amount_spent
            FROM journal_entries je
            LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
            LEFT JOIN accounts a ON a.id = jl.account_id AND a.code = '1050'
            WHERE je.id = ? AND je.source_type = 'purchase'
            GROUP BY je.id
        '''
        cursor.execute(query, (purchase_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return jsonify({'status': 'error', 'error': 'Purchase not found'}), 404

        row_dict = dict(row)
        desc = row_dict.get('description') or ''
        amount = row_dict.get('amount_spent', 0.0)

        seller = 'Unknown'
        if desc:
            if 'seller:' in desc:
                parts = desc.split('|')
                for part in parts:
                    part = part.strip()
                    if part.startswith('seller:'):
                        seller = part.split(':', 1)[1].strip()
                        break
            else:
                import re
                match = re.search(r'Inventory purchase from (.*?)(?:\||$)', desc)
                if match:
                    seller = match.group(1).strip()

        contact = ''
        description = ''
        bill_path = None
        if desc and '|' in desc:
            parts = desc.split('|')
            for part in parts:
                part = part.strip()
                if part.startswith('contact:'):
                    contact = part.split(':', 1)[1].strip()
                elif part.startswith('desc:'):
                    description = part.split(':', 1)[1].strip()
                elif part.startswith('bill:'):
                    bill_path = part.split(':', 1)[1].strip()

        purchase = {
            'id': row_dict['id'],
            'purchase_date': row_dict['transaction_date'],
            'seller_name': seller,
            'seller_contact': contact,
            'amount_spent': amount,
            'description': description,
            'bill_of_sale_path': bill_path,
            'created_at': row_dict['created_at'] or row_dict['transaction_date']
        }

        return jsonify({'status': 'success', 'purchase': purchase})
    except Exception as e:
        app.logger.error(f"Error getting inventory purchase: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/inventory-purchases/<int:purchase_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_inventory_purchase(purchase_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, description FROM journal_entries WHERE id = ? AND source_type = "purchase"', (purchase_id,))
        entry = cursor.fetchone()
        if not entry:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Purchase not found'}), 404

        # Build updated description from fields
        purchase_date = data.get('purchase_date') or datetime.now().strftime('%Y-%m-%d')
        seller_name = data.get('seller_name', '').strip()
        seller_contact = data.get('seller_contact', '').strip()
        amount_spent = data.get('amount_spent')
        description_text = data.get('description', '').strip()
        bill_path = data.get('bill_of_sale_path', '').strip()

        if not seller_name:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Seller name is required'}), 400
        if not amount_spent or amount_spent <= 0:
            conn.close()
            return jsonify({'status': 'error', 'error': 'amount_spent must be greater than 0'}), 400

        desc = f"Inventory purchase | seller: {seller_name} | contact: {seller_contact} | amount: {amount_spent:.2f} | date: {purchase_date} | desc: {description_text}"
        if bill_path:
            desc += f" | bill: {bill_path}"

        # Update description (and optionally transaction_date)
        cursor.execute('''
            UPDATE journal_entries
            SET description = ?, transaction_date = ?
            WHERE id = ?
        ''', (desc, purchase_date, purchase_id))

        # Note: If amount changed, you'd need to update the journal_lines as well.
        # For simplicity, we only update the description; you may extend this.

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
    try:
        conn = get_db()
        cursor = conn.cursor()
        # Get bill path before deletion (for cleanup)
        cursor.execute('SELECT description FROM journal_entries WHERE id = ? AND source_type = "purchase"', (purchase_id,))
        entry = cursor.fetchone()
        if not entry:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Purchase not found'}), 404

        bill_path = None
        desc = entry['description']
        match = re.search(r'bill:\s*([^\s|]+)', desc)
        if match:
            bill_path = match.group(1).strip()

        # Delete journal lines and entry
        cursor.execute('DELETE FROM journal_lines WHERE journal_entry_id = ?', (purchase_id,))
        cursor.execute('DELETE FROM journal_entries WHERE id = ?', (purchase_id,))

        # Delete bill file if exists
        if bill_path:
            file_path = os.path.join(os.path.dirname(__file__), 'static', bill_path.lstrip('/'))
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception as e:
                    app.logger.warning(f"Could not delete bill image file: {e}")

        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': 'Purchase deleted successfully'})
    except Exception as e:
        app.logger.error(f"Error deleting inventory purchase: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/inventory-purchases/summary', methods=['GET'])
@login_required
@role_required(['admin'])
def get_inventory_purchases_summary():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, transaction_date, description FROM journal_entries WHERE source_type = "purchase"')
        rows = cursor.fetchall()
        conn.close()

        total_spent = 0.0
        month_spent = 0.0
        current_month = datetime.now().strftime('%Y-%m')

        for row in rows:
            purchase = parse_purchase_from_journal(row)
            total_spent += purchase['amount_spent']
            if purchase.get('purchase_date', '').startswith(current_month):
                month_spent += purchase['amount_spent']

        return jsonify({
            'status': 'success',
            'summary': {
                'total_spent': total_spent,
                'month_spent': month_spent,
                'total_purchases': len(rows),
                'month_purchases': sum(1 for r in rows if r['transaction_date'].startswith(current_month))
            }
        })
    except Exception as e:
        app.logger.error(f"Error getting inventory purchases summary: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== END OF INVENTORY PURCHASES ====================



@app.route('/api/inventory-purchases/upload-bill', methods=['POST'])
@login_required
@role_required(['admin'])
def upload_bill_of_sale():
    """Upload a bill of sale image for an inventory purchase"""
    try:
        # Log what's being received
        app.logger.info(f"Files in request: {request.files}")
        app.logger.info(f"Form data: {request.form}")
        
        if 'bill_image' not in request.files:
            app.logger.error("No 'bill_image' in request.files")
            return jsonify({'status': 'error', 'error': 'No image file provided'}), 400
        
        file = request.files['bill_image']
        
        if file.filename == '':
            app.logger.error("Empty filename")
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
        
        # Make sure the directory exists
        os.makedirs(BILLS_UPLOAD_FOLDER, exist_ok=True)
        
        filepath = os.path.join(BILLS_UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        # Return the relative URL path
        file_url = f"/static/uploads/bills/{filename}"
        app.logger.info(f"File saved to: {filepath}")
        
        return jsonify({
            'status': 'success',
            'message': 'Bill of sale uploaded successfully',
            'file_path': file_url,
            'filename': filename
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error uploading bill of sale: {str(e)}")
        app.logger.error(traceback.format_exc())
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
    
    # Allowed fields for update
    allowed_fields = [
        'artist', 'title', 'barcode', 'image_url', 'catalog_number',
        'condition_sleeve_id', 'condition_disc_id', 'store_price',
        'consignor_id', 'commission_rate', 'status_id', 'notes',
        'discogs_genre_raw', 'date_sold', 'last_seen',
        'format_id', 'location_id', 'location_index'
    ]
    
    for key, value in data.items():
        if key in allowed_fields:
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

@app.route('/records/search', methods=['GET'])
def search_records():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'status': 'error', 'error': 'Search query required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    is_numeric = query.isdigit()
    
    if is_numeric:
        id_value = int(query)
        
        cursor.execute('''
            SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name,
            f.name as format_name,
            l.name as location_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            LEFT JOIN formats f ON r.format_id = f.id
            LEFT JOIN locations l ON r.location_id = l.id
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
        search_term = f'%{query}%'
        
        cursor.execute('''
            SELECT r.*, s.status_name, cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name,
            f.name as format_name,
            l.name as location_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            LEFT JOIN formats f ON r.format_id = f.id
            LEFT JOIN locations l ON r.location_id = l.id
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



@app.route('/api/consignor/records', methods=['GET'])
@role_required(['consignor', 'admin'])
def get_consignor_records():
    conn = get_db()
    cursor = conn.cursor()
    if session.get('role') == 'admin':
        cursor.execute('''
            SELECT r.*, s.status_name, u.username as consignor_name,
            cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name,
            f.name as format_name,
            l.name as location_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            LEFT JOIN formats f ON r.format_id = f.id
            LEFT JOIN locations l ON r.location_id = l.id
            WHERE r.consignor_id IS NOT NULL
            ORDER BY r.created_at DESC
        ''')
    else:
        cursor.execute('''
            SELECT r.*, s.status_name,
            cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name,
            f.name as format_name,
            l.name as location_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            LEFT JOIN formats f ON r.format_id = f.id
            LEFT JOIN locations l ON r.location_id = l.id
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

@app.route('/api/genres', methods=['GET'])
def get_genres():
    """Get all genres from the genres table"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, name FROM genres ORDER BY name')
    genres = cursor.fetchall()
    conn.close()
    return jsonify({'status': 'success', 'genres': [dict(g) for g in genres]})


@app.route('/consignment/records', methods=['GET'])
def get_consignment_records():
    user_id = request.args.get('user_id')
    conn = get_db()
    cursor = conn.cursor()
    if user_id:
        cursor.execute('''
            SELECT r.*, s.status_name, u.username as consignor_name,
            cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name,
            f.name as format_name,
            l.name as location_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            LEFT JOIN formats f ON r.format_id = f.id
            LEFT JOIN locations l ON r.location_id = l.id
            WHERE r.consignor_id = ?
            ORDER BY CASE r.status_id WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 4 THEN 4 ELSE 5 END, r.artist, r.title
        ''', (user_id,))
    else:
        cursor.execute('''
            SELECT r.*, s.status_name, u.username as consignor_name,
            cs.condition_name as sleeve_condition_name, cd.condition_name as disc_condition_name,
            f.name as format_name,
            l.name as location_name
            FROM records r
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            LEFT JOIN formats f ON r.format_id = f.id
            LEFT JOIN locations l ON r.location_id = l.id
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


@app.route('/api/discogs/search', methods=['GET'])
def discogs_search_proxy():
    search_term = request.args.get('q', '')
    format_filter = request.args.get('format', 'all')
    
    if not search_term:
        return jsonify({'status': 'error', 'error': 'Search term required'}), 400
    
    TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
    if not TOKEN:
        return jsonify({'status': 'error', 'error': 'Discogs token not configured'}), 500
    
    headers = {
        'Authorization': f'Discogs token={TOKEN}',
        'User-Agent': 'PigStyleMusic/1.0'
    }
    
    # Map format filter to Discogs format parameter
    format_map = {
        'vinyl': 'Vinyl',
        'cd': 'CD',
        'tape': 'Cassette',
        'shellac': 'Shellac'
    }
    
    params = {'q': search_term, 'type': 'release', 'per_page': 20}
    
    if format_filter in format_map:
        params['format'] = format_map[format_filter]
    
    response = requests.get(
        'https://api.discogs.com/database/search',
        headers=headers,
        params=params
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
        
        # Get format
        format_list = item.get('format', [])
        format_str = format_list[0] if format_list else ''
        
        results.append({
            'artist': artist,
            'title': title,
            'year': item.get('year'),
            'genre_raw': raw_genre,
            'format': format_str,
            'country': item.get('country'),
            'image_url': item.get('thumb', ''),
            'catalog_number': item.get('catno', ''),
            'discogs_id': item.get('id'),
            'barcode': item.get('barcode', [''])[0] if item.get('barcode') else ''
        })
    
    return jsonify({'status': 'success', 'results': results, 'count': len(results)})

  

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
        
        # MODIFIED: Added notified = 0 (unread) for new feedback
        cursor.execute('''
            INSERT INTO feedback (type_of_feedback, content, contact_info, event_name, status, notified)
            VALUES (?, ?, ?, ?, 'new', 0)
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


@app.route('/api/record-orders/unread-count', methods=['GET'])
@login_required
@role_required(['admin'])
def get_record_orders_unread_count():
    """Get count of unread record orders (notified = 0)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT COUNT(*) as count 
            FROM record_orders 
            WHERE notified = 0 OR notified IS NULL
        ''')
        
        result = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'count': result['count'] if result else 0
        })
        
    except Exception as e:
        app.logger.error(f"Error getting unread record orders count: {str(e)}")
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


@app.route('/api/locations', methods=['GET'])
def get_locations():
    """Get all locations from the locations table"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if locations table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'")
        if not cursor.fetchone():
            conn.close()
            return jsonify({
                'status': 'success',
                'locations': [],
                'count': 0
            })
        
        cursor.execute('SELECT id, name FROM locations ORDER BY name')
        locations = cursor.fetchall()
        conn.close()
        
        locations_list = []
        for row in locations:
            locations_list.append({
                'id': row['id'],
                'name': row['name']
            })
        
        return jsonify({
            'status': 'success',
            'locations': locations_list,
            'count': len(locations_list)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting locations: {str(e)}")
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

# ==================== SUBSCRIPTION ENDPOINTS ====================

 

def send_alert_notification(email, artist, title, action='new'):
    """Send admin notification for new alert subscription."""
    try:
        admin_conn = get_db()
        admin_cursor = admin_conn.cursor()
        admin_cursor.execute('SELECT email FROM users WHERE role = "admin" AND email IS NOT NULL')
        admins = admin_cursor.fetchall()
        admin_conn.close()
        
        for admin in admins:
            subject = f"🔔 New Record Alert: {artist}"
            body = f"""
New record alert subscription!

Email: {email}
Artist: {artist}
Title: {title or 'Any'}
Action: {action}

View in Admin Panel:
https://www.pigstylemusic.com/admin#email-subscriptions
            """
            send_email(admin['email'], subject, body, from_name="PigStyle Music Alerts")
    except Exception as e:
        app.logger.error(f"Error sending alert notification email: {str(e)}")


@app.route('/api/subscriptions/<int:subscription_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_subscription(subscription_id):
    """Update a subscription - also supports marking as read via notified field"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if subscription exists
        cursor.execute('SELECT id, email FROM email_subscriptions WHERE id = ?', (subscription_id,))
        existing = cursor.fetchone()
        if not existing:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Subscription not found'}), 404
        
        updates = []
        params = []
        
        if 'email' in data:
            email = data['email'].strip().lower()
            if not email or '@' not in email or '.' not in email:
                conn.close()
                return jsonify({'status': 'error', 'error': 'Valid email address required'}), 400
            updates.append('email = ?')
            params.append(email)
        
        if 'artist' in data:
            updates.append('artist = ?')
            params.append(data['artist'].strip() or None)
        
        if 'title' in data:
            updates.append('title = ?')
            params.append(data['title'].strip() or None)
        
        if 'catalog_number' in data:
            updates.append('catalog_number = ?')
            params.append(data['catalog_number'].strip() or None)
        
        if 'is_active' in data:
            updates.append('is_active = ?')
            params.append(1 if data['is_active'] else 0)
        
        # Support marking as read by setting notified = 1
        if 'mark_read' in data:
            updates.append('notified = ?')
            params.append(1 if data['mark_read'] else 0)
        
        # Support marking as unread by setting notified = 0
        if 'mark_unread' in data:
            updates.append('notified = ?')
            params.append(0 if data['mark_unread'] else 1)
        
        if not updates:
            conn.close()
            return jsonify({'status': 'error', 'error': 'No fields to update'}), 400
        
        updates.append('updated_at = CURRENT_TIMESTAMP')
        params.append(subscription_id)
        
        cursor.execute(f'''
            UPDATE email_subscriptions 
            SET {', '.join(updates)}
            WHERE id = ?
        ''', params)
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Subscription updated successfully'
        })
        
    except Exception as e:
        app.logger.error(f"Error updating subscription: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/subscriptions/<int:subscription_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_subscription(subscription_id):
    """Permanently delete a subscription"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if subscription exists
        cursor.execute('SELECT id, email FROM email_subscriptions WHERE id = ?', (subscription_id,))
        sub = cursor.fetchone()
        
        if not sub:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Subscription not found'}), 404
        
        # Delete the subscription
        cursor.execute('DELETE FROM email_subscriptions WHERE id = ?', (subscription_id,))
        
        conn.commit()
        conn.close()
        
        app.logger.info(f"Subscription deleted: {sub['email']} (ID: {subscription_id})")
        
        return jsonify({
            'status': 'success',
            'message': 'Subscription deleted successfully'
        })
        
    except Exception as e:
        app.logger.error(f"Error deleting subscription: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/subscriptions/deactivate-all', methods=['POST'])
@login_required
@role_required(['admin'])
def deactivate_all_subscriptions():
    """Deactivate all active subscriptions"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE email_subscriptions 
            SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE is_active = 1
        ''')
        
        affected = cursor.rowcount
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Deactivated {affected} subscriptions',
            'count': affected
        })
        
    except Exception as e:
        app.logger.error(f"Error deactivating all subscriptions: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/subscriptions/notifications/count', methods=['GET'])
@login_required
@role_required(['admin'])
def get_unread_notification_count():
    """Get count of unread subscription notifications"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT COUNT(*) as count 
            FROM email_subscriptions 
            WHERE notified = 0 AND is_active = 1
        ''')
        
        result = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'count': result['count'] if result else 0
        })
        
    except Exception as e:
        app.logger.error(f"Error getting notification count: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/subscriptions/notifications', methods=['GET'])
@login_required
@role_required(['admin'])
def get_notifications():
    """Get all unread subscriptions (notified = 0)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                id,
                email,
                artist,
                title,
                catalog_number,
                created_at,
                notified
            FROM email_subscriptions
            WHERE notified = 0 AND is_active = 1
            ORDER BY created_at DESC
            LIMIT 100
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        notifications = []
        for row in rows:
            notifications.append({
                'id': row['id'],
                'subscription_id': row['id'],
                'email': row['email'],
                'artist': row['artist'],
                'title': row['title'],
                'catalog_number': row['catalog_number'],
                'created_at': row['created_at'],
                'is_read': row['notified'] == 1
            })
        
        return jsonify({
            'status': 'success',
            'notifications': notifications,
            'count': len(notifications)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting notifications: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/subscriptions', methods=['GET'])
@login_required
@role_required(['admin'])
def get_subscriptions():
    """Get all subscriptions with filtering and pagination"""
    try:
        search = request.args.get('search', '').strip()
        status = request.args.get('status', 'all')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        # Filter by notified status (unread/read)
        notified_filter = request.args.get('notified')  # '0' for unread, '1' for read, None for all
        
        offset = (page - 1) * per_page
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Build query with filters
        query = '''
            SELECT id, email, artist, title, catalog_number, created_at, is_active, notified
            FROM email_subscriptions
            WHERE 1=1
        '''
        params = []
        
        if search:
            query += ''' AND (
                email LIKE ? OR 
                COALESCE(artist, '') LIKE ? OR 
                COALESCE(title, '') LIKE ? OR 
                COALESCE(catalog_number, '') LIKE ?
            )'''
            search_term = f'%{search}%'
            params.extend([search_term, search_term, search_term, search_term])
        
        if status == 'active':
            query += ' AND is_active = 1'
        elif status == 'inactive':
            query += ' AND is_active = 0'
        
        if notified_filter is not None:
            query += ' AND notified = ?'
            params.append(int(notified_filter))
        
        # Get total count
        count_query = query.replace(
            'SELECT id, email, artist, title, catalog_number, created_at, is_active, notified',
            'SELECT COUNT(*) as total'
        )
        cursor.execute(count_query, params)
        total = cursor.fetchone()['total']
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
        params.extend([per_page, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        subscriptions = []
        for row in rows:
            sub = {
                'id': row['id'],
                'email': row['email'],
                'artist': row['artist'],
                'title': row['title'],
                'catalog_number': row['catalog_number'],
                'created_at': row['created_at'],
                'is_active': bool(row['is_active']),
                'notified': bool(row['notified']),
                'is_new': row['notified'] == 0  # Not notified = new/unread
            }
            subscriptions.append(sub)
        
        return jsonify({
            'status': 'success',
            'subscriptions': subscriptions,
            'total': total,
            'page': page,
            'per_page': per_page
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
        'cash': '1015',  # Cash - Register (NEW)
        'paypal': '1020', # PayPal
        'square': '1030', # Square Asset (NEW)
        'discogs': '1020', # PayPal (Discogs payments)
        'giftcard': '1015' # Cash - Register (or gift card liability if you have one)
    }
    debit_account_code = account_map.get(payment_source, '1015') # fallback to register
    
    # Get account IDs
    cursor.execute('SELECT id, code FROM accounts')
    accounts = {row['code']: row['id'] for row in cursor.fetchall()}
    
    # Verify required accounts exist
    required = ['4000', '1050', '5000', '4010', '5010', '5020', '2010'] # revenue accounts will be mapped separately
    # Revenue account mapping
    revenue_map = {
        'cash': '4001',  # Sales Revenue - Cash
        'paypal': '4003', # Sales Revenue - PayPal
        'square': '4000', # Sales Revenue - Square
        'discogs': '4003' # Sales Revenue - PayPal (or create a separate Discogs revenue account)
    }
    revenue_account_code = revenue_map.get(payment_source, '4000')
    
    # Verify all required accounts exist
    for code in required + [debit_account_code, revenue_account_code, '1015', '1050', '5000']:
        if code not in accounts:
            raise KeyError(f"Missing account code: {code}")
    
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
    
    # Revenue entry (debit asset, credit revenue)
    debit_amount = total_sales  # only the item sales, shipping separate
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
        ''', (entry_id, accounts[revenue_account_code], 0, int(round(total_sales * 100))))
    
    # COGS entry (debit COGS, credit Inventory)
    if total_cogs > 0:
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts['5000'], int(round(total_cogs * 100)), 0))
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts['1050'], 0, int(round(total_cogs * 100))))
    
    # Shipping Revenue (credit) and Shipping Expense (debit), but shipping may be charged separately
    if shipping_charged > 0:
        # Debit the same asset account? Actually, shipping is part of total revenue.
        # We'll credit Shipping Revenue (4010) and debit the asset.
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts[debit_account_code], int(round(shipping_charged * 100)), 0))
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, accounts['4010'], 0, int(round(shipping_charged * 100))))
    
    # Shipping expense (if postage cost incurred)
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
    
    # Fees (e.g., PayPal, Square)
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
            new_rate, used_rate = get_cogs_rates()
            
            # 1. Revenue from order_items
            cursor.execute('''
                SELECT COALESCE(SUM(oi.price_at_time), 0) as revenue
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                WHERE o.payment_status = 'paid'
                  AND (? IS NULL OR o.created_at >= ?)
                  AND (? IS NULL OR o.created_at <= ?)
            ''', (date_from, date_from, date_to, date_to))
            revenue = cursor.fetchone()['revenue'] or 0
            
            # 2. COGS - using new rates
            cursor.execute('''
                SELECT 
                    oi.price_at_time,
                    r.batch_id,
                    r.condition_sleeve_id,
                    r.condition_disc_id
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN records r ON oi.record_id = r.id
                WHERE o.payment_status = 'paid'
                  AND (? IS NULL OR o.created_at >= ?)
                  AND (? IS NULL OR o.created_at <= ?)
            ''', (date_from, date_from, date_to, date_to))
            rows = cursor.fetchall()
            
            total_cogs = 0
            for row in rows:
                if row['batch_id']:
                    # Calculate from batch
                    cursor.execute('''
                        SELECT 
                            (SELECT COALESCE(SUM(store_price), 1) FROM records WHERE batch_id = ?) as total_store_price,
                            (SELECT COALESCE(jl.debit_amount / 100.0, 0) FROM journal_lines jl 
                             WHERE jl.journal_entry_id = ? AND jl.account_id = (SELECT id FROM accounts WHERE code = '1050')) as batch_cost
                    ''', (row['batch_id'], row['batch_id']))
                    batch = cursor.fetchone()
                    if batch and batch['total_store_price'] and batch['total_store_price'] > 0 and batch['batch_cost']:
                        total_cogs += row['price_at_time'] / batch['total_store_price'] * batch['batch_cost']
                else:
                    # Use assumption rate based on condition
                    if row['condition_sleeve_id'] == 1 and row['condition_disc_id'] == 1:
                        total_cogs += row['price_at_time'] * new_rate
                    else:
                        total_cogs += row['price_at_time'] * used_rate
            
            # 3. Other expenses (excluding COGS account 5000)
            cursor.execute('''
                SELECT a.code, a.name,
                       COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) as balance
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journal_entry_id = je.id
                JOIN accounts a ON jl.account_id = a.id
                WHERE a.type = 'expense'
                  AND a.code != '5000'
                  AND (? IS NULL OR je.transaction_date >= ?)
                  AND (? IS NULL OR je.transaction_date <= ?)
                GROUP BY a.id
                ORDER BY a.code
            ''', (date_from, date_from, date_to, date_to))
            expense_rows = cursor.fetchall()
            
            report_data = []
            total_expense = total_cogs
            
            # Add revenue line
            report_data.append({
                'Account': 'Sales Revenue',
                'Balance': revenue
            })
            # Add COGS line
            report_data.append({
                'Account': 'COGS',
                'Balance': total_cogs
            })
            
            # Add other expense lines
            for row in expense_rows:
                balance = row['balance'] / 100.0
                report_data.append({
                    'Account': f"{row['code']} - {row['name']}",
                    'Balance': balance
                })
                total_expense += balance
            
            net_profit = revenue - total_expense
            summary = f"Total Revenue: ${revenue:.2f} | Total Expenses: ${total_expense:.2f} | Net Profit: ${net_profit:.2f}"
            
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
            
        elif report_type == 'batch-profit':
            # Batch profitability
            cursor.execute('''
                SELECT 
                    je.id as batch_id,
                    je.description,
                    je.transaction_date as purchase_date,
                    jl.debit_amount / 100.0 as total_cost,
                    COUNT(r.id) as total_records,
                    SUM(CASE WHEN r.status_id = 3 THEN r.store_price ELSE 0 END) as revenue,
                    SUM(CASE WHEN r.status_id = 3 THEN 
                        r.store_price / (
                            SELECT COALESCE(SUM(store_price), 1) FROM records WHERE batch_id = je.id
                        ) * jl.debit_amount / 100.0
                    ELSE 0 END) as cogs
                FROM journal_entries je
                JOIN journal_lines jl ON jl.journal_entry_id = je.id
                LEFT JOIN records r ON r.batch_id = je.id
                WHERE je.source_type = 'purchase'
                  AND jl.account_id = (SELECT id FROM accounts WHERE code = '1050')
                  AND (? IS NULL OR je.transaction_date >= ?)
                  AND (? IS NULL OR je.transaction_date <= ?)
                GROUP BY je.id
                ORDER BY je.transaction_date DESC
            ''', (date_from, date_from, date_to, date_to))
            rows = cursor.fetchall()
            report_data = []
            for row in rows:
                revenue = row['revenue'] or 0
                cogs = row['cogs'] or 0
                profit = revenue - cogs
                roi = (profit / row['total_cost'] * 100) if row['total_cost'] and row['total_cost'] > 0 else 0
                report_data.append({
                    'Batch ID': row['batch_id'],
                    'Description': row['description'],
                    'Acquired': row['purchase_date'],
                    'Total Cost': row['total_cost'] or 0,
                    'Records': row['total_records'] or 0,
                    'Revenue': revenue,
                    'COGS': cogs,
                    'Profit': profit,
                    'ROI %': round(roi, 1)
                })
            summary = f"Total Batches: {len(report_data)}"
            
        elif report_type == 'order-economics':
            # Per-order economics
            cursor.execute('''
                SELECT 
                    o.id as order_id,
                    o.created_at as order_date,
                    o.channel,
                    o.total as order_total,
                    COALESCE(SUM(oi.price_at_time), 0) as item_revenue,
                    COALESCE(o.shipping_charged, 0) as shipping_charged,
                    COALESCE(SUM(r.batch_id), 0) as has_batch,
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
                # Calculate COGS for this order
                cursor.execute('''
                    SELECT 
                        oi.price_at_time,
                        r.batch_id,
                        r.condition_sleeve_id,
                        r.condition_disc_id
                    FROM order_items oi
                    LEFT JOIN records r ON oi.record_id = r.id
                    WHERE oi.order_id = ?
                ''', (row['order_id'],))
                items = cursor.fetchall()
                
                new_rate, used_rate = get_cogs_rates()
                order_cogs = 0
                for item in items:
                    if item['batch_id']:
                        cursor.execute('''
                            SELECT 
                                (SELECT COALESCE(SUM(store_price), 1) FROM records WHERE batch_id = ?) as total_store_price,
                                (SELECT COALESCE(jl.debit_amount / 100.0, 0) FROM journal_lines jl 
                                 WHERE jl.journal_entry_id = ? AND jl.account_id = (SELECT id FROM accounts WHERE code = '1050')) as batch_cost
                        ''', (item['batch_id'], item['batch_id']))
                        batch = cursor.fetchone()
                        if batch and batch['total_store_price'] and batch['total_store_price'] > 0 and batch['batch_cost']:
                            order_cogs += item['price_at_time'] / batch['total_store_price'] * batch['batch_cost']
                    else:
                        if item['condition_sleeve_id'] == 1 and item['condition_disc_id'] == 1:
                            order_cogs += item['price_at_time'] * new_rate
                        else:
                            order_cogs += item['price_at_time'] * used_rate
                
                profit = row['item_revenue'] + row['shipping_charged'] - order_cogs - row['fees'] - row['shipping_cost']
                total_profit += profit
                report_data.append({
                    'Order ID': row['order_id'][:12] + '...' if row['order_id'] else '',
                    'Date': row['order_date'],
                    'Channel': row['channel'],
                    'Revenue': row['item_revenue'],
                    'Shipping Charged': row['shipping_charged'],
                    'COGS': order_cogs,
                    'Fees': row['fees'],
                    'Shipping Cost': row['shipping_cost'],
                    'Net Profit': profit
                })
            summary = f"Total Orders: {len(report_data)} | Total Net Profit: ${total_profit:.2f}"
        
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
    Adds record_status_id for each item (if the PigStyle ID is found).
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
        
        order = result['order']
        items = order.get('items', [])
        
        # Connect to DB to lookup record status by PigStyle ID
        conn = get_db()
        cursor = conn.cursor()
        
        for item in items:
            # Extract PigStyle ID from condition_comments
            condition_comments = item.get('condition_comments', '')
            pigstyle_id = None
            if condition_comments:
                match = re.search(r'\[PIGSTYLE ID:\s*(\d+)\]', condition_comments, re.IGNORECASE)
                if match:
                    pigstyle_id = int(match.group(1))
            
            if pigstyle_id:
                cursor.execute('SELECT status_id FROM records WHERE id = ?', (pigstyle_id,))
                row = cursor.fetchone()
                if row:
                    item['record_status_id'] = row['status_id']
                else:
                    item['record_status_id'] = None
            else:
                item['record_status_id'] = None
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'order': order
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

# ==================== ACCOUNTING: MONTHLY ACCOUNT TRANSACTIONS (FIXED) ====================

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
            je.id as journal_entry_id,
            je.transaction_date,
            je.description,
            jl.debit_amount / 100.0 as debit_amount,
            jl.credit_amount / 100.0 as credit_amount,
            a.name as account_name,
            je.source_type,
            je.source_id
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

    query += ' ORDER BY je.transaction_date DESC, je.id DESC'
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    transactions = []
    for row in rows:
        debit = row['debit_amount'] or 0
        credit = row['credit_amount'] or 0
        net = debit - credit
        
        transactions.append({
            'journal_entry_id': row['journal_entry_id'],
            'transaction_date': row['transaction_date'],
            'description': row['description'],
            'debit_amount': debit,
            'credit_amount': credit,
            'account_name': row['account_name'],
            'source_type': row['source_type'],
            'source_id': row['source_id'],
            'net_amount': net
        })

    return jsonify({
        'status': 'success',
        'transactions': transactions
    })


# ==================== ACCOUNTING: MONTHLY P&L (KEPT AS IS) ====================

@app.route('/api/accounting/monthly-pl', methods=['GET'])
@login_required
@role_required(['admin'])
def monthly_pl():
    """Monthly Profit & Loss - filters by account type (revenue and expense) instead of hardcoded codes."""
    start = request.args.get('start')
    end = request.args.get('end')
    if not start or not end:
        return jsonify({'status': 'error', 'error': 'start and end required'}), 400

    from datetime import datetime, timedelta
    start_date = datetime.strptime(start, '%Y-%m-%d')
    end_date = datetime.strptime(end, '%Y-%m-%d')
    
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')

    conn = get_db()
    cursor = conn.cursor()

    # Get revenue accounts (type = 'revenue')
    cursor.execute('''
        SELECT
            strftime('%Y-%m', je.transaction_date) as month,
            a.name,
            COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0) / 100.0 as amount
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_entry_id = je.id
        JOIN accounts a ON jl.account_id = a.id
        WHERE a.type = 'revenue'
          AND je.transaction_date >= ? AND je.transaction_date <= ?
          AND je.source_type != 'order'
        GROUP BY month, a.id
        ORDER BY month, a.code
    ''', (start_str, end_str))
    revenue_rows = cursor.fetchall()

    # Get expense accounts (type = 'expense') - exclude COGS (handled separately)
    cursor.execute('''
        SELECT
            strftime('%Y-%m', je.transaction_date) as month,
            a.name,
            COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) / 100.0 as amount
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_entry_id = je.id
        JOIN accounts a ON jl.account_id = a.id
        WHERE a.type = 'expense'
          AND a.code != '5000'  -- Exclude COGS (handled separately)
          AND je.transaction_date >= ? AND je.transaction_date <= ?
          AND je.source_type != 'order'
        GROUP BY month, a.id
        ORDER BY month, a.code
    ''', (start_str, end_str))
    expense_rows = cursor.fetchall()

    # Get COGS from records (calculated, not from journal)
    cursor.execute('''
        SELECT
            strftime('%Y-%m', r.date_sold) as month,
            COALESCE(SUM(
                CASE 
                    WHEN r.batch_id IS NOT NULL AND r.batch_id IN (SELECT id FROM journal_entries WHERE source_type = 'purchase') THEN
                        r.store_price / (
                            SELECT COALESCE(SUM(store_price), 1)
                            FROM records r2
                            WHERE r2.batch_id = r.batch_id
                        ) * (
                            SELECT COALESCE(jl.debit_amount / 100.0, 0)
                            FROM journal_lines jl
                            WHERE jl.journal_entry_id = r.batch_id
                              AND jl.account_id = (SELECT id FROM accounts WHERE code = '1050')
                        )
                    ELSE
                        r.store_price * 
                        CASE 
                            WHEN r.condition_sleeve_id = 1 AND r.condition_disc_id = 1 THEN 0.55
                            ELSE 0.30
                        END
                END
            ), 0) as cogs
        FROM records r
        WHERE r.status_id = 3
          AND r.date_sold >= ? AND r.date_sold <= ?
        GROUP BY strftime('%Y-%m', r.date_sold)
        ORDER BY month
    ''', (start_str, end_str))
    cogs_rows = cursor.fetchall()
    cogs_by_month = {row['month']: row['cogs'] for row in cogs_rows}

    conn.close()

    # Build month list
    months = []
    current = start_date
    while current <= end_date:
        months.append(current.strftime('%Y-%m'))
        if current.month == 12:
            current = current.replace(year=current.year+1, month=1, day=1)
        else:
            current = current.replace(month=current.month+1, day=1)

    # Build data structure
    account_breakdown = {}

    # Add revenue
    for row in revenue_rows:
        month = row['month']
        if month not in account_breakdown:
            account_breakdown[month] = {}
        # Filter out near-zero values
        if abs(row['amount']) > 0.01:
            account_breakdown[month][row['name']] = row['amount']

    # Add COGS (negative)
    for month in months:
        cogs = cogs_by_month.get(month, 0)
        if abs(cogs) > 0.01:
            if month not in account_breakdown:
                account_breakdown[month] = {}
            account_breakdown[month]['COGS'] = -cogs

    # Add expenses (negative)
    for row in expense_rows:
        month = row['month']
        if month not in account_breakdown:
            account_breakdown[month] = {}
        # Expenses are debits, so they show as negative
        amount = -row['amount']
        if abs(amount) > 0.01:
            account_breakdown[month][row['name']] = amount

    # Add Net Income for each month
    for month in months:
        if month not in account_breakdown:
            account_breakdown[month] = {}
        total = sum(account_breakdown[month].values())
        if abs(total) > 0.01:
            account_breakdown[month]['Net Income'] = total

    return jsonify({
        'status': 'success',
        'months': months,
        'account_breakdown': account_breakdown
    })

@app.route('/api/accounting/cash-flow-detail', methods=['GET'])
@login_required
@role_required(['admin'])
def cash_flow_detail():
    """Monthly cash flow breakdown - returns ALL data without date filters."""
    conn = get_db()
    cursor = conn.cursor()

    # Get earliest and latest transaction dates for the full range
    cursor.execute('SELECT MIN(transaction_date) as min_date, MAX(transaction_date) as max_date FROM journal_entries')
    date_range = cursor.fetchone()
    
    if not date_range or not date_range['min_date'] or not date_range['max_date']:
        start_date = datetime.now() - timedelta(days=730)
        end_date = datetime.now()
    else:
        start_date = datetime.strptime(date_range['min_date'], '%Y-%m-%d')
        end_date = datetime.strptime(date_range['max_date'], '%Y-%m-%d')
    
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')

    cursor.execute('''
        SELECT
            strftime('%Y-%m', je.transaction_date) as month,
            a.name,
            a.type,
            COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) / 100.0 as net_change
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_entry_id = je.id
        JOIN accounts a ON a.id = jl.account_id
        WHERE a.code IN (
            '4000', '4001', '4003', '4010',
            '1050',
            '1015', '1025',
            '5000', '5010', '5020', '5040', '6010', '6020', '6080', '6090', '6100'
        )
        AND je.transaction_date >= ? AND je.transaction_date <= ?
        AND je.source_type != 'order'
        GROUP BY month, a.id
        ORDER BY month, a.type DESC, a.name
    ''', (start_str, end_str))
    rows = cursor.fetchall()
    conn.close()

    # Build month list
    months = []
    current = start_date
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
            if row['type'] == 'asset':
                data[month][row['name']] = -row['net_change']
            else:
                data[month][row['name']] = row['net_change']

    # Add Net Cash for each month
    for month in months:
        if month not in data:
            data[month] = {}
        total = sum(data[month].values())
        if total != 0:
            data[month]['Net Cash'] = total

    return jsonify({
        'status': 'success',
        'months': months,
        'account_breakdown': data
    })




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


@app.route('/api/records/<int:record_id>/mark-discogs-sold', methods=['POST'])
@login_required
@role_required(['admin'])
def mark_discogs_sold(record_id):
    """
    Mark a record as sold on Discogs.
    1. Look for PIGSTYLE ID in the record's notes
    2. Search Discogs orders for that PIGSTYLE ID
    3. If found, update status to 4 and set store_price to the sale price
    4. If not found, return an error
    """
    app.logger.info("=" * 60)
    app.logger.info(f"📝 [DISOOGS_SOLD] Starting mark_discogs_sold for record_id: {record_id}")
    
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # 1. Get the record
        app.logger.info(f"📡 [DISOOGS_SOLD] Fetching record #{record_id} from database")
        cursor.execute('SELECT id, artist, title, notes, store_price, status_id FROM records WHERE id = ?', (record_id,))
        record = cursor.fetchone()
        
        if not record:
            app.logger.error(f"❌ [DISOOGS_SOLD] Record #{record_id} not found in database")
            conn.close()
            return jsonify({
                'status': 'error',
                'error': f'Record #{record_id} not found'
            }), 404
        
        app.logger.info(f"✅ [DISOOGS_SOLD] Record found: {record['artist']} - {record['title']}")
        app.logger.info(f"📊 [DISOOGS_SOLD] Current status: {record['status_id']}, Store price: ${record['store_price']}")
        app.logger.info(f"📝 [DISOOGS_SOLD] Notes: {record['notes']}")
        
        # 2. Check if already sold
        if record['status_id'] in [3, 4]:
            app.logger.warning(f"⚠️ [DISOOGS_SOLD] Record #{record_id} is already marked as sold (status_id: {record['status_id']})")
            conn.close()
            return jsonify({
                'status': 'error',
                'error': f'Record #{record_id} is already marked as sold (status_id: {record["status_id"]})'
            }), 400
        
        # 3. Extract PIGSTYLE ID from notes
        app.logger.info(f"🔍 [DISOOGS_SOLD] Looking for PIGSTYLE ID in notes...")
        pigstyle_id = None
        if record['notes']:
            match = re.search(r'\[PIGSTYLE ID:\s*(\d+)\]', record['notes'], re.IGNORECASE)
            if match:
                pigstyle_id = int(match.group(1))
                app.logger.info(f"✅ [DISOOGS_SOLD] Found PIGSTYLE ID {pigstyle_id} in record notes")
            else:
                app.logger.warning(f"⚠️ [DISOOGS_SOLD] No PIGSTYLE ID pattern found in notes")
        
        # If no PIGSTYLE ID in notes, use the record ID itself
        if not pigstyle_id:
            pigstyle_id = record_id
            app.logger.info(f"🔄 [DISOOGS_SOLD] No PIGSTYLE ID in notes, using record ID as fallback: {pigstyle_id}")
            app.logger.info(f"💡 [DISOOGS_SOLD] This is for later additions where barcode = record ID")
        
        app.logger.info(f"🎯 [DISOOGS_SOLD] Final PIGSTYLE ID: {pigstyle_id}")
        
        # 4. Get Discogs token
        token = os.environ.get('DISCOGS_USER_TOKEN')
        if not token:
            app.logger.error(f"❌ [DISOOGS_SOLD] DISCOGS_USER_TOKEN not configured in environment")
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'DISCOGS_USER_TOKEN not configured in environment'
            }), 500
        
        app.logger.info(f"🔑 [DISOOGS_SOLD] Discogs token found: {token[:10]}...")
        
        # 5. Initialize Discogs handler
        app.logger.info(f"📡 [DISOOGS_SOLD] Initializing DiscogsHandler")
        handler = DiscogsHandler(token)
        
        # 6. Search for the record in ALL Discogs orders
        app.logger.info(f"🔍 [DISOOGS_SOLD] Searching for PIGSTYLE ID {pigstyle_id} in Discogs orders...")
        orders_result = handler.get_all_orders()
        
        if not orders_result:
            app.logger.error(f"❌ [DISOOGS_SOLD] Could not fetch Discogs orders. Check Discogs token.")
            conn.close()
            return jsonify({
                'status': 'error',
                'error': f'Could not fetch Discogs orders. Please check your Discogs token.'
            }), 500
        
        app.logger.info(f"✅ [DISOOGS_SOLD] Fetched {len(orders_result)} orders from Discogs")
        
        # 7. Find the order with this PIGSTYLE ID
        app.logger.info(f"🔍 [DISOOGS_SOLD] Searching {len(orders_result)} orders for PIGSTYLE ID {pigstyle_id}")
        sale_price = None
        found_order_id = None
        found_item = None
        
        order_count = 0
        for order in orders_result:
            order_count += 1
            if 'items' not in order:
                continue
            
            order_id = order.get('order_id', 'unknown')
            app.logger.debug(f"   📦 [DISOOGS_SOLD] Checking order {order_count}: {order_id} ({len(order.get('items', []))} items)")
                
            for item in order.get('items', []):
                # Check condition_comments
                if 'condition_comments' in item:
                    match = re.search(r'\[PIGSTYLE ID:\s*(\d+)\]', item['condition_comments'], re.IGNORECASE)
                    if match and int(match.group(1)) == pigstyle_id:
                        sale_price = item.get('price', 0)
                        found_order_id = order_id
                        found_item = item
                        app.logger.info(f"✅ [DISOOGS_SOLD] Found PIGSTYLE ID {pigstyle_id} in order {found_order_id}")
                        app.logger.info(f"💰 [DISOOGS_SOLD] Sale price: ${sale_price}")
                        app.logger.info(f"📝 [DISOOGS_SOLD] Item comments: {item.get('condition_comments', '')}")
                        break
                
                # Check private_comments
                if 'private_comments' in item:
                    match = re.search(r'\[PIGSTYLE ID:\s*(\d+)\]', item['private_comments'], re.IGNORECASE)
                    if match and int(match.group(1)) == pigstyle_id:
                        sale_price = item.get('price', 0)
                        found_order_id = order_id
                        found_item = item
                        app.logger.info(f"✅ [DISOOGS_SOLD] Found PIGSTYLE ID {pigstyle_id} in private_comments of order {found_order_id}")
                        app.logger.info(f"💰 [DISOOGS_SOLD] Sale price: ${sale_price}")
                        break
                
                # Check release description
                if 'release' in item and 'description' in item['release']:
                    match = re.search(r'\[PIGSTYLE ID:\s*(\d+)\]', item['release']['description'], re.IGNORECASE)
                    if match and int(match.group(1)) == pigstyle_id:
                        sale_price = item.get('price', 0)
                        found_order_id = order_id
                        found_item = item
                        app.logger.info(f"✅ [DISOOGS_SOLD] Found PIGSTYLE ID {pigstyle_id} in release description of order {found_order_id}")
                        app.logger.info(f"💰 [DISOOGS_SOLD] Sale price: ${sale_price}")
                        break
            
            if sale_price is not None:
                break
        
        # 8. If not found, raise error
        if sale_price is None:
            app.logger.error(f"❌ [DISOOGS_SOLD] Could not find PIGSTYLE ID {pigstyle_id} in any Discogs order")
            app.logger.info(f"📋 [DISOOGS_SOLD] Searched through {order_count} orders")
            conn.close()
            return jsonify({
                'status': 'error',
                'error': f'Could not find Discogs order containing PIGSTYLE ID {pigstyle_id}. '
                         f'Make sure the record has been sold on Discogs and the PIGSTYLE ID is correct.'
            }), 404
        
        # 9. Update the record - removed actual_sale_price
        app.logger.info(f"🔄 [DISOOGS_SOLD] Updating record #{record_id} with sale price ${sale_price}")
        cursor.execute('''
            UPDATE records 
            SET status_id = 4, 
                store_price = ?,
                date_sold = CURRENT_DATE
            WHERE id = ?
        ''', (sale_price, record_id))
        
        conn.commit()
        app.logger.info(f"✅ [DISOOGS_SOLD] Record #{record_id} updated in database")
        
        # 10. Get updated record
        cursor.execute('''
            SELECT id, artist, title, store_price, date_sold, status_id
            FROM records 
            WHERE id = ?
        ''', (record_id,))
        
        updated_record = cursor.fetchone()
        conn.close()
        
        app.logger.info(f"✅ [DISOOGS_SOLD] Record #{record_id} marked as sold on Discogs for ${sale_price}")
        app.logger.info(f"📋 [DISOOGS_SOLD] Order ID: {found_order_id}")
        app.logger.info("=" * 60)
        
        return jsonify({
            'status': 'success',
            'message': f'Record marked as sold on Discogs for ${sale_price:.2f}',
            'record': {
                'id': updated_record['id'],
                'artist': updated_record['artist'],
                'title': updated_record['title'],
                'store_price': float(updated_record['store_price']),
                'date_sold': updated_record['date_sold'],
                'status_id': updated_record['status_id']
            },
            'discogs_order_id': found_order_id,
            'pigstyle_id': pigstyle_id
        })
        
    except Exception as e:
        app.logger.error(f"❌ [DISOOGS_SOLD] Error marking record as sold: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== ACCOUNTING: CREATE/UPDATE ACCOUNT ====================

@app.route('/api/accounting/accounts', methods=['POST'])
@login_required
@role_required(['admin'])
def accounting_create_account():
    """Create a new account"""
    try:
        data = request.json
        code = data.get('code')
        name = data.get('name')
        account_type = data.get('type')
        description = data.get('description')
        
        if not code or not name or not account_type:
            return jsonify({'status': 'error', 'error': 'code, name, and type required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if code already exists
        cursor.execute('SELECT id FROM accounts WHERE code = ?', (code,))
        if cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': f'Account code {code} already exists'}), 400
        
        cursor.execute('''
            INSERT INTO accounts (code, name, type, description)
            VALUES (?, ?, ?, ?)
        ''', (code, name, account_type, description))
        
        account_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Account created successfully',
            'account_id': account_id
        })
    except Exception as e:
        app.logger.error(f"Error creating account: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/accounting/accounts/<int:account_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def accounting_update_account(account_id):
    """Update an existing account"""
    try:
        data = request.json
        code = data.get('code')
        name = data.get('name')
        account_type = data.get('type')
        description = data.get('description')
        
        if not code or not name or not account_type:
            return jsonify({'status': 'error', 'error': 'code, name, and type required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if account exists
        cursor.execute('SELECT id FROM accounts WHERE id = ?', (account_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Account not found'}), 404
        
        # Check if code conflicts with another account
        cursor.execute('SELECT id FROM accounts WHERE code = ? AND id != ?', (code, account_id))
        if cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': f'Account code {code} already exists'}), 400
        
        cursor.execute('''
            UPDATE accounts SET code = ?, name = ?, type = ?, description = ?
            WHERE id = ?
        ''', (code, name, account_type, description, account_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Account updated successfully'
        })
    except Exception as e:
        app.logger.error(f"Error updating account: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/accounting/accounts/<int:account_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def accounting_delete_account(account_id):
    """Delete an account and unpost all its transactions"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if account exists
        cursor.execute('SELECT id, code, name FROM accounts WHERE id = ?', (account_id,))
        account = cursor.fetchone()
        if not account:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Account not found'}), 404
        
        # Find all journal entries for this account
        cursor.execute('''
            SELECT DISTINCT je.id as entry_id, je.source_type, je.source_id
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE jl.account_id = ?
        ''', (account_id,))
        entries = cursor.fetchall()
        
        unposted_count = 0
        
        # Unpost each entry
        for entry in entries:
            source_type = entry['source_type']
            source_id = entry['source_id']
            
            # If it's a bank transaction (plaid or historic), mark as unprocessed
            if source_type in ['plaid', 'historic']:
                if source_type == 'historic':
                    cursor.execute('UPDATE bank_transactions SET processed = 0 WHERE id = ?', (int(source_id),))
                # For plaid, we just delete the journal entry (plaid transactions are not stored in bank_transactions)
                unposted_count += 1
            
            # Delete the journal lines and entry
            cursor.execute('DELETE FROM journal_lines WHERE journal_entry_id = ?', (entry['entry_id'],))
            cursor.execute('DELETE FROM journal_entries WHERE id = ?', (entry['entry_id'],))
        
        # Delete the account
        cursor.execute('DELETE FROM accounts WHERE id = ?', (account_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Account {account["code"]} - {account["name"]} deleted successfully',
            'unposted_count': unposted_count
        })
    except Exception as e:
        app.logger.error(f"Error deleting account: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== ACCOUNTING: COGS CALCULATION ====================
@app.route('/api/accounting/cogs-calculation', methods=['GET'])
@login_required
@role_required(['admin'])
def cogs_calculation():
    """
    Returns the detailed COGS calculation for a given month.
    Calculates COGS dynamically from records sold, using batch allocation or assumption rates.
    """
    month = request.args.get('month')
    if not month:
        return jsonify({'status': 'error', 'error': 'month required'}), 400

    try:
        from datetime import datetime, timedelta
        year, month_num = month.split('-')
        start_date = datetime(int(year), int(month_num), 1)
        if int(month_num) == 12:
            end_date = datetime(int(year) + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = datetime(int(year), int(month_num) + 1, 1) - timedelta(days=1)
        
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get COGS assumption rates from app_config
        try:
            new_rate, used_rate = get_cogs_rates()
        except ValueError as e:
            return jsonify({'status': 'error', 'error': str(e)}), 400
        
        # Get records sold in this month (NO r.cogs column)
        cursor.execute('''
            SELECT 
                r.id,
                r.artist,
                r.title,
                r.store_price as sale_price,
                r.batch_id,
                r.condition_sleeve_id,
                r.condition_disc_id,
                r.date_sold
            FROM records r
            WHERE r.status_id = 3
              AND r.date_sold >= ? AND r.date_sold <= ?
            ORDER BY r.date_sold
        ''', (start_str, end_str))
        records = cursor.fetchall()
        
        records_list = []
        total_cogs = 0
        batch_ids = set()
        
        for rec in records:
            rec_dict = dict(rec)
            
            # Calculate COGS dynamically
            if rec_dict['batch_id']:
                batch_ids.add(rec_dict['batch_id'])
                # We'll calculate batch allocation later
                cogs_value = None  # Placeholder
            else:
                # Use assumption rates
                if rec_dict['condition_sleeve_id'] == 1 and rec_dict['condition_disc_id'] == 1:
                    cogs_value = rec_dict['sale_price'] * new_rate
                else:
                    cogs_value = rec_dict['sale_price'] * used_rate
            
            rec_dict['cogs'] = cogs_value
            
            records_list.append({
                'id': rec_dict['id'],
                'artist': rec_dict['artist'] or '',
                'title': rec_dict['title'] or '',
                'sale_price': float(rec_dict['sale_price'] or 0),
                'cogs': float(rec_dict['cogs']) if rec_dict['cogs'] is not None else None,
                'batch_id': rec_dict['batch_id'],
                'date_sold': rec_dict['date_sold']
            })
        
        # Get batch allocations for records with batch_id
        batch_allocations = []
        for batch_id in batch_ids:
            # Get batch total cost (from journal entry)
            cursor.execute('''
                SELECT jl.debit_amount / 100.0 as total_cost
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journal_entry_id = je.id
                WHERE je.id = ? AND jl.account_id = (SELECT id FROM accounts WHERE code = '1050')
            ''', (batch_id,))
            batch_row = cursor.fetchone()
            
            if batch_row and batch_row['total_cost']:
                total_cost = float(batch_row['total_cost'])
                
                # Get total store price of all records in this batch
                cursor.execute('''
                    SELECT SUM(store_price) as total_store_price
                    FROM records
                    WHERE batch_id = ?
                ''', (batch_id,))
                price_row = cursor.fetchone()
                
                if price_row and price_row['total_store_price'] and price_row['total_store_price'] > 0:
                    total_store_price = float(price_row['total_store_price'])
                    
                    # Get records from this batch that were sold in this month
                    cursor.execute('''
                        SELECT r.id, r.store_price
                        FROM records r
                        WHERE r.batch_id = ? AND r.status_id = 3 
                          AND r.date_sold >= ? AND r.date_sold <= ?
                    ''', (batch_id, start_str, end_str))
                    sold_records = cursor.fetchall()
                    
                    # Calculate allocated COGS for each sold record in this batch
                    for sold_rec in sold_records:
                        sold_price = float(sold_rec['store_price'])
                        allocated_cogs = (sold_price / total_store_price) * total_cost
                        
                        # Update the record in records_list with the calculated COGS
                        for rec in records_list:
                            if rec['id'] == sold_rec['id']:
                                rec['cogs'] = allocated_cogs
                                break
                    
                    # Get total sold store price for this batch
                    cursor.execute('''
                        SELECT SUM(store_price) as sold_store_price
                        FROM records
                        WHERE batch_id = ? AND status_id = 3 
                          AND date_sold >= ? AND date_sold <= ?
                    ''', (batch_id, start_str, end_str))
                    sold_row = cursor.fetchone()
                    sold_store_price = float(sold_row['sold_store_price']) if sold_row and sold_row['sold_store_price'] else 0
                    
                    allocated_total = (sold_store_price / total_store_price) * total_cost if total_store_price > 0 else 0
                    
                    batch_allocations.append({
                        'batch_id': batch_id,
                        'total_cost': total_cost,
                        'sold_store_price': sold_store_price,
                        'total_store_price': total_store_price,
                        'allocated': allocated_total
                    })
        
        # Recalculate total COGS from records_list
        total_cogs = sum(r['cogs'] for r in records_list if r['cogs'] is not None)
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'month': month,
            'total_cogs': total_cogs,
            'records': records_list,
            'batch_allocations': batch_allocations
        })
        
    except Exception as e:
        app.logger.error(f"COGS calculation error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== ACCOUNTING: BALANCE SHEET ====================

@app.route('/api/accounting/balance-sheet', methods=['GET'])
@login_required
@role_required(['admin'])
def balance_sheet():
    """
    Returns balance sheet data - cumulative balances for asset, liability, and equity accounts over time.
    Each month shows the running balance up to that point in time.
    """
    start = request.args.get('start')
    end = request.args.get('end')
    if not start or not end:
        return jsonify({'status': 'error', 'error': 'start and end required'}), 400

    try:
        from datetime import datetime, timedelta
        
        # Parse start and end dates
        start_date = datetime.strptime(start, '%Y-%m-%d')
        end_date = datetime.strptime(end, '%Y-%m-%d')
        
        # Build month list
        months = []
        current = start_date
        while current <= end_date:
            months.append(current.strftime('%Y-%m'))
            if current.month == 12:
                current = current.replace(year=current.year+1, month=1, day=1)
            else:
                current = current.replace(month=current.month+1, day=1)
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get all asset, liability, and equity accounts
        cursor.execute('''
            SELECT id, code, name, type 
            FROM accounts 
            WHERE type IN ('asset', 'liability', 'equity')
            ORDER BY type, code
        ''')
        accounts = cursor.fetchall()
        
        # For each account, get the running balance at the end of each month
        account_breakdown = {}
        
        for account in accounts:
            account_id = account['id']
            account_name = account['name']
            account_type = account['type']
            
            running_balance = 0
            
            for month in months:
                # Get the last day of this month
                month_date = datetime.strptime(month + '-01', '%Y-%m-%d')
                if month_date.month == 12:
                    last_day = month_date.replace(year=month_date.year+1, month=1, day=1) - timedelta(days=1)
                else:
                    last_day = month_date.replace(month=month_date.month+1, day=1) - timedelta(days=1)
                last_day_str = last_day.strftime('%Y-%m-%d')
                
                # Get all transactions up to this point
                cursor.execute('''
                    SELECT 
                        COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) as balance
                    FROM journal_lines jl
                    JOIN journal_entries je ON jl.journal_entry_id = je.id
                    WHERE jl.account_id = ?
                      AND je.transaction_date <= ?
                ''', (account_id, last_day_str))
                
                row = cursor.fetchone()
                balance = row['balance'] / 100.0 if row and row['balance'] else 0
                
                # For liability accounts, invert the sign (liabilities are credit balances)
                if account_type == 'liability':
                    balance = -balance
                
                running_balance = balance
                
                # Only store if non-zero or if it's the first month
                if abs(balance) > 0.01 or month == months[0]:
                    if month not in account_breakdown:
                        account_breakdown[month] = {}
                    account_breakdown[month][account_name] = balance
        
        conn.close()
        
        # Ensure every month has an entry
        for month in months:
            if month not in account_breakdown:
                account_breakdown[month] = {}
        
        # Calculate Net Assets (Total Assets - Total Liabilities) for each month
        # Also add account type totals
        for month in months:
            if month in account_breakdown:
                month_data = account_breakdown[month]
                
                # Calculate totals by type
                total_assets = 0
                total_liabilities = 0
                total_equity = 0
                net_assets = 0
                
                # We need account types, so re-query accounts
                conn2 = get_db()
                cur2 = conn2.cursor()
                cur2.execute('SELECT id, code, name, type FROM accounts WHERE type IN ("asset", "liability", "equity")')
                all_accounts = cur2.fetchall()
                conn2.close()
                
                account_type_map = {}
                for acc in all_accounts:
                    account_type_map[acc['name']] = acc['type']
                
                for account_name, balance in month_data.items():
                    acc_type = account_type_map.get(account_name, 'unknown')
                    if acc_type == 'asset':
                        total_assets += balance
                    elif acc_type == 'liability':
                        total_liabilities += balance
                    elif acc_type == 'equity':
                        total_equity += balance
                
                net_assets = total_assets + total_liabilities + total_equity
                
                # Add total rows
                if abs(total_assets) > 0.01:
                    month_data['Total Assets'] = total_assets
                if abs(total_liabilities) > 0.01:
                    month_data['Total Liabilities'] = total_liabilities
                if abs(total_equity) > 0.01:
                    month_data['Total Equity'] = total_equity
                if abs(net_assets) > 0.01:
                    month_data['Net Assets (A - L + E)'] = net_assets
        
        return jsonify({
            'status': 'success',
            'months': months,
            'account_breakdown': account_breakdown
        })
        
    except Exception as e:
        app.logger.error(f"Balance sheet error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ============================================================
# DEBTOR / CREDITOR SYSTEM ENDPOINTS
# ============================================================
# ============================================================
# GENERIC SQUARE PAYMENT LINK ENDPOINTS
# ============================================================

@app.route('/api/square/create-payment-link', methods=['POST'])
def create_square_payment_link():
    """Create a generic Square payment link."""
    try:
        data = request.json
        
        amount = float(data.get('amount', 0))
        if amount <= 0:
            return jsonify({'status': 'error', 'error': 'Invalid amount'}), 400
        
        purpose = data.get('purpose')
        if not purpose:
            return jsonify({'status': 'error', 'error': 'purpose required'}), 400
        
        metadata = data.get('metadata', {})
        metadata['purpose'] = purpose
        
        item_name = data.get('item_name', f"Payment - {purpose}")
        
        # ========== CHANGED: Use redirect_url from frontend ==========
        redirect_url = data.get('redirect_url')
        if not redirect_url:
            redirect_path = data.get('redirect_path', '/gift-cards')
            redirect_url = request.host_url.rstrip('/') + redirect_path
        
        print(f"🔀 Redirect URL: {redirect_url}")
        
        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        location_id = os.environ.get('SQUARE_LOCATION_ID')
        
        if not access_token or not location_id:
            return jsonify({'status': 'error', 'error': 'Square not configured'}), 500
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "order": {
                "location_id": location_id,
                "line_items": [{
                    "name": item_name,
                    "quantity": "1",
                    "base_price_money": {
                        "amount": int(round(amount * 100)),
                        "currency": "USD"
                    }
                }],
                "metadata": metadata
            },
            "checkout_options": {
                "redirect_url": redirect_url
            }
        }
        
        response = requests.post(
            'https://connect.squareup.com/v2/online-checkout/payment-links',
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            app.logger.error(f"Square payment link error: {response.text}")
            return jsonify({'status': 'error', 'error': 'Failed to create payment link'}), 400
        
        result = response.json()
        payment_link = result.get('payment_link', {})
        
        return jsonify({
            'status': 'success',
            'checkout_url': payment_link.get('url'),
            'payment_link_id': payment_link.get('id'),
            'metadata': metadata
        })
        
    except Exception as e:
        app.logger.error(f"Create payment link error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

 


def handle_donation_payment(payment_id, amount, metadata):
    """Handle a donation payment."""
    try:
        campaign = metadata.get('campaign', 'general')
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get accounts
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        payable = cursor.fetchone()
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1015',))
        cash = cursor.fetchone()
        
        if not payable or not cash:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Required accounts not found'}), 500
        
        amount_cents = int(round(amount * 100))
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Create journal entry for donation (Bernie)
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (today, f"BERNIE | ISSUE | Donation - ${amount:.2f} ({campaign})", 'bernie_donation', payment_id))
        entry_id = cursor.lastrowid
        
        # Debit Cash
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, cash['id'], amount_cents, 0))
        
        # Credit Payable (donation liability)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, payable['id'], 0, amount_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'purpose': 'donation',
            'campaign': campaign,
            'amount': amount,
            'entry_id': entry_id
        })
        
    except Exception as e:
        app.logger.error(f"Handle donation payment error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


def handle_store_credit_payment(payment_id, amount, metadata):
    """Handle a store credit purchase."""
    try:
        debtor_name = metadata.get('debtor_name', '').upper()
        if not debtor_name:
            return jsonify({'status': 'error', 'error': 'debtor_name required for store credit'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get accounts
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        payable = cursor.fetchone()
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1015',))
        cash = cursor.fetchone()
        
        if not payable or not cash:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Required accounts not found'}), 500
        
        # Store credit is 50% higher than cash value
        credit_value = amount * 1.5
        amount_cents = int(round(credit_value * 100))
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Create journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (today, f"{debtor_name} | ISSUE | Store credit - ${credit_value:.2f} (cash paid ${amount:.2f})", 'store_credit', payment_id))
        entry_id = cursor.lastrowid
        
        # Debit Payable
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, payable['id'], amount_cents, 0))
        
        # Credit Revenue (or Store Credit Issued)
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4050',))
        credit_account = cursor.fetchone()
        if not credit_account:
            cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4000',))
            credit_account = cursor.fetchone()
        
        if credit_account:
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, credit_account['id'], 0, amount_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'purpose': 'store_credit',
            'debtor_name': debtor_name,
            'credit_value': credit_value,
            'cash_paid': amount,
            'entry_id': entry_id
        })
        
    except Exception as e:
        app.logger.error(f"Handle store credit payment error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ============================================================
# DEBTOR / CREDITOR SYSTEM ENDPOINTS
# ============================================================

@app.route('/api/debtor/lookup', methods=['POST'])
@login_required
@role_required(['admin'])
def debtor_lookup():
    """Look up a debtor by name and get their balance and transaction history."""
    try:
        data = request.json
        debtor_name = data.get('name', '').strip().upper()
        
        if not debtor_name:
            return jsonify({'status': 'error', 'error': 'Name required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Try exact match first
        cursor.execute('''
            SELECT description, source_type FROM journal_entries
            WHERE description LIKE ?
            LIMIT 1
        ''', (f'{debtor_name} | %',))
        
        row = cursor.fetchone()
        original_name = debtor_name
        
        # If not found and it's not a GIFT- code, try recipient name
        if not row and not debtor_name.startswith('GIFT-'):
            cursor.execute('''
                SELECT description, source_type FROM journal_entries
                WHERE description LIKE ?
                LIMIT 1
            ''', (f'% | {debtor_name} | %',))
            row = cursor.fetchone()
            
            if row:
                parts = row['description'].split(' | ')
                if parts and parts[0].strip():
                    debtor_name = parts[0].strip()
        
        # If still not found, return error
        if not row:
            conn.close()
            return jsonify({'status': 'error', 'error': f'Debtor not found: {original_name}'}), 404
        
        # Get balance - only Payable account (2015)
        cursor.execute('''
            SELECT 
                COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) / 100.0 as balance
            FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.description LIKE ?
              AND a.code = '2015'
        ''', (f'{debtor_name} | %',))
        
        balance_row = cursor.fetchone()
        raw_balance = balance_row['balance'] if balance_row else 0
        
        # Force positive for liability
        balance = abs(raw_balance)
        
        # If balance is 0, return not found
        if balance == 0:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Debtor not found (balance is $0)'}), 404
        
        # Get transactions - only Payable account (2015)
        cursor.execute('''
            SELECT 
                je.id as journal_entry_id,
                je.transaction_date,
                je.description,
                je.source_type,
                COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) / 100.0 as raw_amount
            FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.description LIKE ?
              AND a.code = '2015'
            GROUP BY je.id
            ORDER BY je.transaction_date DESC, je.id DESC
        ''', (f'{debtor_name} | %',))
        
        rows = cursor.fetchall()
        conn.close()
        
        entries = []
        for row in rows:
            amount = abs(row['raw_amount']) if row['raw_amount'] else 0
            entries.append({
                'journal_entry_id': row['journal_entry_id'],
                'transaction_date': row['transaction_date'],
                'description': row['description'],
                'amount': amount,
                'source_type': row['source_type']
            })
        
        is_gift_card = debtor_name.startswith('GIFT-')
        is_bernie = debtor_name == 'BERNIE'
        can_cash_out = not is_gift_card and not is_bernie
        
        return jsonify({
            'status': 'success',
            'debtor': debtor_name,
            'balance': balance,
            'is_gift_card': is_gift_card,
            'is_bernie': is_bernie,
            'can_cash_out': can_cash_out,
            'entries': entries
        })
        
    except Exception as e:
        app.logger.error(f"Debtor lookup error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/debtor/list', methods=['GET'])
@login_required
@role_required(['admin'])
def debtor_list():
    """Get a list of all unique debtors with their display names."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get all unique debtors with their descriptions
        cursor.execute('''
            SELECT DISTINCT 
                SUBSTR(description, 1, INSTR(description, ' | ') - 1) as debtor_name,
                description,
                source_type
            FROM journal_entries
            WHERE description LIKE '% | %'
            ORDER BY debtor_name
        ''')
        
        debtors_raw = cursor.fetchall()
        conn.close()
        
        result = []
        seen_names = set()
        
        for row in debtors_raw:
            name = row['debtor_name']
            if not name:
                continue
            
            if name in seen_names:
                continue
            seen_names.add(name)
            
            # Get balance for this debtor
            conn2 = get_db()
            cur2 = conn2.cursor()
            cur2.execute('''
                SELECT 
                    COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) / 100.0 as balance
                FROM journal_entries je
                JOIN journal_lines jl ON jl.journal_entry_id = je.id
                JOIN accounts a ON a.id = jl.account_id
                WHERE je.description LIKE ?
                  AND a.code = '2015'
            ''', (f'{name} | %',))
            bal = cur2.fetchone()
            conn2.close()
            
            balance = abs(bal['balance']) if bal else 0
            
            # Skip debtors with $0 balance
            if balance <= 0:
                continue
            
            display_name = name
            
            # If it's a gift card, extract the recipient
            if name.startswith('GIFT-'):
                parts = row['description'].split(' | ')
                if len(parts) >= 2 and parts[1].strip():
                    recipient = parts[1].strip()
                    display_name = f"{recipient} - {name}"
                else:
                    display_name = f"Bearer - {name}"
            
            result.append({
                'name': name,
                'display_name': display_name,
                'balance': balance
            })
        
        # Sort by balance descending (highest first)
        result.sort(key=lambda x: x['balance'], reverse=True)
        
        return jsonify({
            'status': 'success',
            'debtors': result
        })
        
    except Exception as e:
        app.logger.error(f"Debtor list error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/debtor/redeem', methods=['POST'])
@login_required
@role_required(['admin'])
def debtor_redeem():
    """Redeem debtor credit for a purchase."""
    try:
        data = request.json
        debtor_name = data.get('name', '').strip().upper()
        amount = float(data.get('amount', 0))
        description = data.get('description', '').strip()
        
        if not debtor_name:
            return jsonify({'status': 'error', 'error': 'Debtor name required'}), 400
        if amount <= 0:
            return jsonify({'status': 'error', 'error': 'Amount must be greater than 0'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get current balance - only Payable account (2015)
        cursor.execute('''
            SELECT 
                COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) / 100.0 as balance
            FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.description LIKE ?
              AND a.code = '2015'
        ''', (f'{debtor_name} | %',))
        
        result = cursor.fetchone()
        raw_balance = result['balance'] if result else 0
        
        # Force positive (liability accounts)
        balance = abs(raw_balance)
        
        if balance < amount:
            conn.close()
            return jsonify({'status': 'error', 'error': f'Insufficient balance. Available: ${balance:.2f}'}), 400
        
        # Get accounts
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        payable = cursor.fetchone()
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4000',))
        revenue = cursor.fetchone()
        
        if not payable or not revenue:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Required accounts not found'}), 500
        
        today = datetime.now().strftime('%Y-%m-%d')
        amount_cents = int(round(amount * 100))
        
        # Create journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (today, f"{debtor_name} | REDEEM | {description}", 'debtor_redeem', debtor_name))
        entry_id = cursor.lastrowid
        
        # Debit Payable (reduce what we owe)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, payable['id'], amount_cents, 0))
        
        # Credit Revenue
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, revenue['id'], 0, amount_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'${amount:.2f} redeemed from {debtor_name}',
            'entry_id': entry_id,
            'new_balance': balance - amount
        })
        
    except Exception as e:
        app.logger.error(f"Debtor redeem error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/debtor/issue', methods=['POST'])
@login_required
@role_required(['admin'])
def debtor_issue():
    """Issue store credit to a debtor."""
    try:
        data = request.json
        debtor_name = data.get('name', '').strip().upper()
        cash_value = float(data.get('cash_value', 0))
        reason = data.get('reason', '').strip()
        
        if not debtor_name:
            return jsonify({'status': 'error', 'error': 'Debtor name required'}), 400
        if cash_value <= 0:
            return jsonify({'status': 'error', 'error': 'Cash value must be greater than 0'}), 400
        if not reason:
            return jsonify({'status': 'error', 'error': 'Reason required'}), 400
        
        credit_value = cash_value * 1.5  # 50% bonus
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get Payable account
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        payable = cursor.fetchone()
        if not payable:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Payable account not found'}), 500
        
        # Get Store Credit Issued account (or fallback to revenue)
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4050',))
        credit_account = cursor.fetchone()
        if not credit_account:
            cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4000',))
            credit_account = cursor.fetchone()
        
        if not credit_account:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Revenue account not found'}), 500
        
        today = datetime.now().strftime('%Y-%m-%d')
        amount_cents = int(round(credit_value * 100))
        
        # Create journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (today, f"{debtor_name} | ISSUE | {reason} (cash value ${cash_value:.2f})", 'store_credit', debtor_name))
        entry_id = cursor.lastrowid
        
        # Debit Payable (increase what we owe)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, payable['id'], amount_cents, 0))
        
        # Credit Store Credit Issued (or revenue)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, credit_account['id'], 0, amount_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Store credit issued: ${credit_value:.2f} to {debtor_name}',
            'entry_id': entry_id,
            'credit_value': credit_value,
            'cash_value': cash_value,
            'debtor': debtor_name
        })
        
    except Exception as e:
        app.logger.error(f"Debtor issue error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/debtor/cashout', methods=['POST'])
@login_required
@role_required(['admin'])
def debtor_cashout():
    """Cash out debtor store credit at 2/3 value."""
    try:
        data = request.json
        debtor_name = data.get('name', '').strip().upper()
        
        if not debtor_name:
            return jsonify({'status': 'error', 'error': 'Debtor name required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get current balance
        cursor.execute('''
            SELECT 
                COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) / 100.0 as balance
            FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.description LIKE ?
              AND a.code = '2015'
        ''', (f'{debtor_name} | %',))
        
        result = cursor.fetchone()
        raw_balance = result['balance'] if result else 0
        balance = abs(raw_balance)
        
        if balance <= 0:
            conn.close()
            return jsonify({'status': 'error', 'error': 'No balance to cash out'}), 400
        
        # Check if gift card or Bernie (cannot cash out)
        if debtor_name.startswith('GIFT-'):
            conn.close()
            return jsonify({'status': 'error', 'error': 'Gift cards cannot be exchanged for cash'}), 400
        if debtor_name == 'BERNIE':
            conn.close()
            return jsonify({'status': 'error', 'error': 'Bernie funds must be donated, not cashed out'}), 400
        
        cash_amount = balance * (2/3)
        amount_cents = int(round(cash_amount * 100))
        credit_cents = int(round(balance * 100))
        
        # Get Payable account
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        payable = cursor.fetchone()
        if not payable:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Payable account not found'}), 500
        
        # Get Cash account
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1015',))
        cash = cursor.fetchone()
        if not cash:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Cash account not found'}), 500
        
        # Get Store Credit Discount account (contra-revenue)
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4051',))
        discount = cursor.fetchone()
        
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Create journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (today, f"{debtor_name} | CASHOUT | Cashed out credit (${balance:.2f} credit = ${cash_amount:.2f} cash)", 'store_credit_cashout', debtor_name))
        entry_id = cursor.lastrowid
        
        # Debit Payable (remove the full credit)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, payable['id'], credit_cents, 0))
        
        # Credit Cash (pay out 2/3)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, cash['id'], 0, amount_cents))
        
        # If discount account exists, credit the difference
        if discount:
            discount_cents = credit_cents - amount_cents
            if discount_cents > 0:
                cursor.execute('''
                    INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                    VALUES (?, ?, ?, ?)
                ''', (entry_id, discount['id'], 0, discount_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Cashed out ${cash_amount:.2f} to {debtor_name}',
            'entry_id': entry_id,
            'credit_cashed_out': balance,
            'cash_paid': cash_amount
        })
        
    except Exception as e:
        app.logger.error(f"Debtor cashout error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

 
@app.route('/api/bernie/donate', methods=['POST'])
@login_required
@role_required(['admin'])
def bernie_donate():
    """Donate Bernie fund balance to the campaign."""
    try:
        data = request.json
        amount = float(data.get('amount', 0))
        
        if amount <= 0:
            return jsonify({'status': 'error', 'error': 'Amount must be greater than 0'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get current Bernie balance
        cursor.execute('''
            SELECT 
                COALESCE(SUM(
                    CASE 
                        WHEN jl.debit_amount > 0 THEN jl.debit_amount 
                        ELSE -jl.credit_amount 
                    END
                ), 0) / 100.0 as balance
            FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            WHERE je.description LIKE ?
        ''', ('BERNIE | %',))
        
        result = cursor.fetchone()
        balance = result['balance'] if result else 0
        
        if balance < amount:
            conn.close()
            return jsonify({'status': 'error', 'error': f'Insufficient Bernie balance. Available: ${balance:.2f}'}), 400
        
        # Get Payable account
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        payable = cursor.fetchone()
        if not payable:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Payable account not found'}), 500
        
        # Get Cash account
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1015',))
        cash = cursor.fetchone()
        if not cash:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Cash account not found'}), 500
        
        today = datetime.now().strftime('%Y-%m-%d')
        amount_cents = int(round(amount * 100))
        
        # Create journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (today, f"BERNIE | REDEEM | Donation to Bernie Sanders campaign", 'bernie_donate', 'BERNIE'))
        entry_id = cursor.lastrowid
        
        # Debit Payable (reduce what we owe)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, payable['id'], amount_cents, 0))
        
        # Credit Cash (pay the donation)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, cash['id'], 0, amount_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'${amount:.2f} donated to Bernie Sanders campaign',
            'entry_id': entry_id,
            'new_balance': balance - amount
        })
        
    except Exception as e:
        app.logger.error(f"Bernie donate error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/accounting/account-balance', methods=['GET'])
@login_required
@role_required(['admin'])
def account_balance():
    """Get the balance of a specific account by code."""
    try:
        account_code = request.args.get('account_code')
        if not account_code:
            return jsonify({'status': 'error', 'error': 'account_code required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id FROM accounts WHERE code = ?', (account_code,))
        account = cursor.fetchone()
        if not account:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Account not found'}), 404
        
        cursor.execute('''
            SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) / 100.0 as balance
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE jl.account_id = ?
        ''', (account['id'],))
        
        result = cursor.fetchone()
        conn.close()
        
        raw_balance = result['balance'] if result else 0
        
        # For liability accounts (2015), force positive
        if account_code == '2015':
            balance = abs(raw_balance)
        else:
            balance = raw_balance
        
        return jsonify({
            'status': 'success',
            'account_code': account_code,
            'balance': balance
        })
        
    except Exception as e:
        app.logger.error(f"Account balance error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ============================================================
# GENERIC SQUARE PAYMENT LINK ENDPOINTS
# ============================================================
@app.route('/api/square/payment-metadata/<payment_id>', methods=['GET'])
@login_required
def get_payment_metadata(payment_id):
    """Get metadata from a Square payment."""
    try:
        headers = {
            'Authorization': f'Bearer {os.environ.get("SQUARE_ACCESS_TOKEN")}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        response = requests.get(
            f'https://connect.squareup.com/v2/payments/{payment_id}',
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            return jsonify({'status': 'error', 'error': 'Payment not found'}), 400
        
        payment = response.json().get('payment', {})
        order_id = payment.get('order_id')
        
        if order_id:
            order_response = requests.get(
                f'https://connect.squareup.com/v2/orders/{order_id}',
                headers=headers,
                timeout=30
            )
            if order_response.status_code == 200:
                order = order_response.json().get('order', {})
                metadata = order.get('metadata', {})
                return jsonify({
                    'status': 'success',
                    'metadata': metadata
                })
        
        return jsonify({
            'status': 'success',
            'metadata': payment.get('metadata', {})
        })
        
    except Exception as e:
        app.logger.error(f"Get payment metadata error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500
    
@app.route('/api/square/order-payment/<order_id>', methods=['GET'])
@login_required
def get_order_payment(order_id):
    """Get the payment_id from an order."""
    try:
        headers = {
            'Authorization': f'Bearer {os.environ.get("SQUARE_ACCESS_TOKEN")}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        response = requests.get(
            f'https://connect.squareup.com/v2/orders/{order_id}',
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            return jsonify({'status': 'error', 'error': 'Order not found'}), 400
        
        order = response.json().get('order', {})
        payment_id = order.get('metadata', {}).get('payment_id')
        
        if not payment_id:
            tenders = order.get('tenders', [])
            for tender in tenders:
                if tender.get('payment_id'):
                    payment_id = tender.get('payment_id')
                    break
        
        return jsonify({
            'status': 'success',
            'payment_id': payment_id
        })
        
    except Exception as e:
        app.logger.error(f"Get order payment error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/payment/confirm', methods=['POST'])
def confirm_payment():
    """
    Confirm a Square payment and execute the appropriate action
    based on the purpose stored in metadata.
    """
    try:
        data = request.json
        payment_id = data.get('payment_id')
        metadata = data.get('metadata', {})
        gift_card_id = data.get('gift_card_id')
        
        if not payment_id:
            return jsonify({'status': 'error', 'error': 'payment_id required'}), 400
        
        # Verify payment with Square
        headers = {
            'Authorization': f'Bearer {os.environ.get("SQUARE_ACCESS_TOKEN")}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        response = requests.get(
            f'https://connect.squareup.com/v2/payments/{payment_id}',
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            return jsonify({'status': 'error', 'error': 'Payment not found'}), 400
        
        payment = response.json().get('payment', {})
        
        if payment.get('status') != 'COMPLETED':
            return jsonify({'status': 'error', 'error': 'Payment not completed'}), 400
        
        amount = payment.get('amount_money', {}).get('amount', 0) / 100
        
        # Get purpose from metadata or payment
        purpose = metadata.get('purpose')
        if not purpose:
            # Try to get from order metadata
            order_id = payment.get('order_id')
            if order_id:
                order_response = requests.get(
                    f'https://connect.squareup.com/v2/orders/{order_id}',
                    headers=headers,
                    timeout=30
                )
                if order_response.status_code == 200:
                    order = order_response.json().get('order', {})
                    metadata = order.get('metadata', {})
                    purpose = metadata.get('purpose')
        
        # Route to the appropriate handler
        if purpose == 'gift_card':
            return handle_gift_card_payment(payment_id, amount, metadata, gift_card_id)
        elif purpose == 'donation':
            return handle_donation_payment(payment_id, amount, metadata)
        elif purpose == 'store_credit':
            return handle_store_credit_payment(payment_id, amount, metadata)
        else:
            return jsonify({
                'status': 'success',
                'message': f'Payment confirmed for {purpose or "unknown purpose"}',
                'payment_id': payment_id,
                'amount': amount,
                'purpose': purpose
            })
        
    except Exception as e:
        app.logger.error(f"Confirm payment error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


def handle_gift_card_payment(payment_id, amount, metadata, gift_card_id=None):
    """Create a gift card from a confirmed payment."""
    try:
        import random, string
        
        # Use provided gift card ID or generate one
        if not gift_card_id:
            gift_card_id = metadata.get('gift_card_id')
        if not gift_card_id:
            random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            gift_card_id = f"GIFT-{random_part}"
        
        # Get recipient info from metadata
        recipient = metadata.get('recipient', '')
        sender = metadata.get('sender', '')
        message = metadata.get('message', '')
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get accounts
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        payable = cursor.fetchone()
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1015',))
        cash = cursor.fetchone()
        
        if not payable or not cash:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Required accounts not found'}), 500
        
        amount_cents = int(round(amount * 100))
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Description format: GIFT-XXXXX | RECIPIENT | amount
        recipient_display = recipient if recipient else 'Bearer'
        desc = f"{gift_card_id} | {recipient_display} | ${amount:.2f} gift card purchased online"
        
        # Create journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (today, desc, 'gift_card', gift_card_id))
        entry_id = cursor.lastrowid
        
        # Debit Cash (money received)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, cash['id'], amount_cents, 0))
        
        # Credit Payable (owe gift card)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, payable['id'], 0, amount_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'purpose': 'gift_card',
            'gift_card_id': gift_card_id,
            'amount': amount,
            'entry_id': entry_id,
            'recipient': recipient,
            'sender': sender,
            'message': message
        })
        
    except Exception as e:
        app.logger.error(f"Handle gift card payment error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

def handle_donation_payment(payment_id, amount, metadata):
    """Handle a donation payment."""
    try:
        campaign = metadata.get('campaign', 'general')
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get accounts
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        payable = cursor.fetchone()
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1015',))
        cash = cursor.fetchone()
        
        if not payable or not cash:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Required accounts not found'}), 500
        
        amount_cents = int(round(amount * 100))
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Create journal entry for donation (Bernie)
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (today, f"BERNIE | ISSUE | Donation - ${amount:.2f} ({campaign})", 'bernie_donation', payment_id))
        entry_id = cursor.lastrowid
        
        # Debit Cash
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, cash['id'], amount_cents, 0))
        
        # Credit Payable (donation liability)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, payable['id'], 0, amount_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'purpose': 'donation',
            'campaign': campaign,
            'amount': amount,
            'entry_id': entry_id
        })
        
    except Exception as e:
        app.logger.error(f"Handle donation payment error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


def handle_store_credit_payment(payment_id, amount, metadata):
    """Handle a store credit purchase."""
    try:
        debtor_name = metadata.get('debtor_name', '').upper()
        if not debtor_name:
            return jsonify({'status': 'error', 'error': 'debtor_name required for store credit'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get accounts
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        payable = cursor.fetchone()
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1015',))
        cash = cursor.fetchone()
        
        if not payable or not cash:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Required accounts not found'}), 500
        
        # Store credit is 50% higher than cash value
        credit_value = amount * 1.5
        amount_cents = int(round(credit_value * 100))
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Create journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (today, f"{debtor_name} | ISSUE | Store credit - ${credit_value:.2f} (cash paid ${amount:.2f})", 'store_credit', payment_id))
        entry_id = cursor.lastrowid
        
        # Debit Payable
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, payable['id'], amount_cents, 0))
        
        # Credit Revenue (or Store Credit Issued)
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4050',))
        credit_account = cursor.fetchone()
        if not credit_account:
            cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4000',))
            credit_account = cursor.fetchone()
        
        if credit_account:
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, credit_account['id'], 0, amount_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'purpose': 'store_credit',
            'debtor_name': debtor_name,
            'credit_value': credit_value,
            'cash_paid': amount,
            'entry_id': entry_id
        })
        
    except Exception as e:
        app.logger.error(f"Handle store credit payment error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

    """Generate blank gift card codes (not activated, no balance)."""
    try:
        data = request.json
        count = data.get('count', 10)
        
        if count < 1 or count > 100:
            return jsonify({'status': 'error', 'error': 'Count must be between 1 and 100'}), 400
        
        import random
        import string
        
        codes = []
        for i in range(count):
            random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            code = f"GIFT-{random_part}"
            codes.append(code)
        
        # Print barcodes for all codes (PDF with multiple barcodes)
        return jsonify({
            'status': 'success',
            'codes': codes,
            'count': len(codes)
        })
        
    except Exception as e:
        app.logger.error(f"Generate blank gift cards error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

import time  # if not already imported

@app.route('/api/refund/process', methods=['POST', 'OPTIONS'])
@login_required
@role_required(['admin'])
def process_refund():
    # Handle OPTIONS preflight
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'DELETE, GET, OPTIONS, PATCH, POST, PUT')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 200

    try:
        data = request.json
        record_ids = data.get('record_ids', [])
        reason = data.get('reason', 'Customer refund')
        mode = data.get('mode', 'restock')   # 'restock' or 'writeoff'

        if not record_ids:
            return jsonify({'status': 'error', 'error': 'No records selected'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Validate records exist and are sold
        placeholders = ','.join('?' for _ in record_ids)
        cursor.execute(f'''
            SELECT id, status_id FROM records WHERE id IN ({placeholders})
        ''', record_ids)
        records = cursor.fetchall()

        if len(records) != len(record_ids):
            conn.close()
            return jsonify({'status': 'error', 'error': 'Some records not found'}), 404

        for rec in records:
            if rec['status_id'] not in (3, 4):
                conn.close()
                return jsonify({'status': 'error', 'error': f'Record {rec["id"]} is not sold'}), 400

        if mode == 'restock':
            # Set status back to Active, clear sale fields
            cursor.execute(f'''
                UPDATE records 
                SET status_id = 2, date_sold = NULL, actual_sale_price = NULL
                WHERE id IN ({placeholders})
            ''', record_ids)
            message = f'Restocked {len(record_ids)} record(s)'
        elif mode == 'writeoff':
            # Delete the records (write-off)
            cursor.execute(f'DELETE FROM records WHERE id IN ({placeholders})', record_ids)
            message = f'Written off {len(record_ids)} record(s)'
        else:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Invalid mode'}), 400

        conn.commit()
        conn.close()

        return jsonify({
            'status': 'success',
            'message': message,
            'mode': mode,
            'count': len(record_ids)
        })

    except Exception as e:
        app.logger.error(f"Refund error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/purchases', methods=['POST'])
@login_required
@role_required(['admin'])
def create_purchase():
    """Create a new purchase draft (alias for /api/purchases/draft)"""
    try:
        data = request.get_json() or {}
        seller_name = data.get('seller_name', 'New Purchase')
        seller_contact = data.get('seller_contact', '')
        description = data.get('description', 'New inventory purchase')
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Insert into purchases table
        cursor.execute('''
            INSERT INTO purchases (seller_name, seller_contact, description, status)
            VALUES (?, ?, ?, 'draft')
        ''', (seller_name, seller_contact, description))
        purchase_id = cursor.lastrowid
        
        # Insert into journal_entries
        from datetime import datetime
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (
            datetime.now().strftime('%Y-%m-%d'),
            f'Purchase #{purchase_id}',
            'purchase',
            str(purchase_id)
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Purchase created',
            'draft_id': purchase_id
        })
        
    except Exception as e:
        app.logger.error(f"Error creating purchase: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/purchases/draft', methods=['GET'])
@login_required
@role_required(['admin'])
def get_active_draft():
    """Get the active draft purchase from session."""
    draft = session.get('active_draft')
    if not draft:
        return jsonify({'status': 'success', 'draft': None})
    
    # Fetch linked record IDs using batch_id
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id FROM records WHERE batch_id = ? AND status_id = 1
    ''', (draft['id'],))
    records = cursor.fetchall()
    conn.close()
    
    draft['record_ids'] = [r['id'] for r in records]
    
    return jsonify({'status': 'success', 'draft': draft})

 
@app.route('/api/purchases/draft/<int:draft_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_draft_purchase(draft_id):
    """
    Accept a draft: mark as complete, add journal lines (debit inventory, credit cash).
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400

        offer_amount = data.get('offer_amount')
        signature_method = data.get('signature_method', 'upload')
        record_ids = data.get('record_ids', [])

        if not offer_amount or offer_amount <= 0:
            return jsonify({'status': 'error', 'error': 'Valid offer amount required'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # 1. Get the purchase and its linked journal entry
        cursor.execute('''
            SELECT p.id, p.status, je.id as journal_entry_id
            FROM purchases p
            JOIN journal_entries je ON je.id = p.id AND je.source_type = 'purchase'  -- ← FIXED JOIN
            WHERE p.id = ?
        ''', (draft_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Draft not found'}), 404

        if row['status'] == 'complete':
            conn.close()
            return jsonify({'status': 'error', 'error': 'Draft already completed'}), 400

        journal_entry_id = row['journal_entry_id']

        # 2. Update purchase status to 'complete'
        cursor.execute('UPDATE purchases SET status = "complete", updated_at = CURRENT_TIMESTAMP WHERE id = ?', (draft_id,))

        # 3. Get account IDs
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1050',))
        inventory = cursor.fetchone()
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1015',))
        cash = cursor.fetchone()
        if not inventory or not cash:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Required accounts not found'}), 500

        # 4. Add journal lines (if not already present)
        amount_cents = int(round(offer_amount * 100))
        cursor.execute('SELECT id FROM journal_lines WHERE journal_entry_id = ?', (journal_entry_id,))
        if not cursor.fetchone():
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (journal_entry_id, inventory['id'], amount_cents, 0))
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (journal_entry_id, cash['id'], 0, amount_cents))

        conn.commit()
        conn.close()

        return jsonify({
            'status': 'success',
            'message': f'Draft #{draft_id} completed',
            'offer_amount': offer_amount,
            'signature_method': signature_method
        })
    except Exception as e:
        app.logger.error(f"Error accepting draft: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/purchases/draft/<draft_id>/unlink/<int:record_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def unlink_record_from_draft(draft_id, record_id):
    """Remove a record from the active draft."""
    draft = session.get('active_draft')
    if not draft or draft['id'] != draft_id:
        return jsonify({'status': 'error', 'error': 'No active draft found'}), 404
    
    conn = get_db()
    cursor = conn.cursor()
    
    # CHANGED: purchase_id → batch_id
    cursor.execute('''
        SELECT id FROM records WHERE id = ? AND batch_id = ? AND status_id = 1
    ''', (record_id, draft_id))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Record not linked to this draft'}), 404
    
    # CHANGED: purchase_id → batch_id
    cursor.execute('UPDATE records SET batch_id = NULL WHERE id = ?', (record_id,))
    conn.commit()
    conn.close()
    
    return jsonify({
        'status': 'success',
        'message': f'Record #{record_id} unlinked from draft'
    })


@app.route('/api/square/bill-of-sale', methods=['POST'])
@login_required
@role_required(['admin'])
def send_bill_of_sale_to_square():
    """
    Send a bill of sale to Square POS for signature.
    """
    data = request.json
    draft_id = data.get('draft_id')
    seller_name = data.get('seller_name', '')
    offer_amount = data.get('offer_amount', 0)
    records = data.get('records', [])
    
    if not draft_id or not seller_name or offer_amount <= 0:
        return jsonify({'status': 'error', 'error': 'Missing required fields'}), 400
    
    bill_lines = []
    bill_lines.append("PIGSTYLE MUSIC")
    bill_lines.append("====================")
    bill_lines.append("BILL OF SALE")
    bill_lines.append(f"Seller: {seller_name}")
    bill_lines.append("")
    bill_lines.append("ITEMS:")
    bill_lines.append("--------------------")
    
    for record in records:
        artist = record.get('artist', 'Unknown')
        title = record.get('title', 'Unknown')
        price = record.get('price', 0)
        bill_lines.append(f"{artist} - {title}")
        bill_lines.append(f"  ${price:.2f}")
    
    bill_lines.append("--------------------")
    bill_lines.append(f"Total Offer: ${offer_amount:.2f}")
    bill_lines.append("")
    bill_lines.append("Seller Signature: ____________________")
    bill_lines.append("Store Rep: ____________________")
    bill_lines.append("")
    bill_lines.append("---")
    bill_lines.append("PigStyle Music")
    bill_lines.append("Thank you for your business!")
    
    bill_text = "\n".join(bill_lines)
    
    try:
        devices, error = get_terminal_devices()
        if error or not devices:
            return jsonify({'status': 'error', 'error': 'No Square terminal available'}), 400
        
        device_id = devices[0].get('id')
        if device_id and device_id.startswith('device:'):
            device_id = device_id[len('device:'):]
        
        checkout_data = {
            "idempotency_key": str(uuid.uuid4()),
            "checkout": {
                "amount_money": {
                    "amount": 1,
                    "currency": "USD"
                },
                "device_options": {
                    "device_id": device_id
                },
                "reference_id": f"bill_{draft_id}",
                "note": bill_text[:500]
            }
        }
        
        result, error = square_api_request('/v2/terminals/checkouts', method='POST', data=checkout_data)
        
        if error:
            return jsonify({'status': 'error', 'error': f'Square error: {error}'}), 400
        
        return jsonify({
            'status': 'success',
            'message': 'Bill of Sale sent to Square POS',
            'checkout_id': result.get('checkout', {}).get('id'),
            'bill_text': bill_text
        })
        
    except Exception as e:
        app.logger.error(f"Error sending to Square POS: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

 
# ============================================================
# BILL OF SALE IMAGE SERVING
# ============================================================

@app.route('/static/uploads/bills/<filename>')
def serve_bill_image(filename):
    """Serve bill of sale images with proper content type"""
    try:
        # Security: Prevent directory traversal
        if '..' in filename or '/' in filename or '\\' in filename:
            return jsonify({'status': 'error', 'error': 'Invalid filename'}), 400
        
        bills_folder = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'bills')
        filepath = os.path.join(bills_folder, filename)
        
        if not os.path.exists(filepath):
            return jsonify({'status': 'error', 'error': 'File not found'}), 404
        
        # Determine content type
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
        content_type = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'pdf': 'application/pdf'
        }.get(ext, 'application/octet-stream')
        
        return send_from_directory(
            os.path.dirname(filepath),
            filename,
            mimetype=content_type
        )
    except Exception as e:
        app.logger.error(f"Error serving bill image: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

 
@app.route('/api/purchases/draft/<int:draft_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def get_draft_by_id(draft_id):
    """
    Get detailed information for a specific draft.
    """
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT 
                p.id as draft_id,
                p.seller_name,
                p.seller_contact,
                p.description,
                p.bill_of_sale_path,
                p.status,
                p.created_at,
                je.id as journal_entry_id,
                COUNT(r.id) as record_count,
                COALESCE((SELECT jl.debit_amount / 100.0 
                         FROM journal_lines jl 
                         WHERE jl.journal_entry_id = je.id 
                         AND jl.account_id = (SELECT id FROM accounts WHERE code = '1050') 
                         LIMIT 1), 0) as offer_amount
            FROM purchases p
            JOIN journal_entries je ON je.source_id = p.id AND je.source_type = 'purchase'
            LEFT JOIN records r ON r.batch_id = je.id
            WHERE p.id = ?
            GROUP BY p.id
        ''', (draft_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return jsonify({'status': 'error', 'error': 'Draft not found'}), 404

        return jsonify({
            'status': 'success',
            'draft': {
                'draft_id': row['draft_id'],
                'seller_name': row['seller_name'],
                'seller_contact': row['seller_contact'] or '',
                'description': row['description'],
                'bill_of_sale_path': row['bill_of_sale_path'],
                'status': row['status'],
                'created_at': row['created_at'],
                'record_count': row['record_count'] or 0,
                'offer_amount': float(row['offer_amount'] or 0)
            }
        })
    except Exception as e:
        app.logger.error(f"Error fetching draft: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/accounting/reconcile/timeline', methods=['GET'])
@login_required
@role_required(['admin'])
def reconcile_timeline():
    account1 = request.args.get('account1', type=int)
    account2 = request.args.get('account2', type=int)
    start = request.args.get('start')
    end = request.args.get('end')

    if not account1 or not account2:
        return jsonify({'status': 'error', 'error': 'Both account IDs required'}), 400
    if account1 == account2:
        return jsonify({'status': 'error', 'error': 'Please select two different accounts'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Fetch account names for display
    cursor.execute('SELECT id, name FROM accounts WHERE id IN (?, ?)', (account1, account2))
    accounts = cursor.fetchall()
    account_names = {row['id']: row['name'] for row in accounts}
    if len(account_names) < 2:
        conn.close()
        return jsonify({'status': 'error', 'error': 'One or both accounts not found'}), 404

    # Query for both accounts in one go (no intersect, just OR)
    query = '''
        SELECT 
            je.transaction_date AS date,
            a.name AS account_name,
            (jl.debit_amount - jl.credit_amount) / 100.0 AS amount,
            je.description
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_entry_id = je.id
        JOIN accounts a ON jl.account_id = a.id
        WHERE jl.account_id IN (?, ?)
    '''
    params = [account1, account2]

    if start:
        query += ' AND je.transaction_date >= ?'
        params.append(start)
    if end:
        query += ' AND je.transaction_date <= ?'
        params.append(end)

    query += ' ORDER BY je.transaction_date ASC, je.id ASC'
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    entries = []
    for row in rows:
        entries.append({
            'date': row['date'],
            'account_name': row['account_name'],
            'amount': float(row['amount'] or 0),
            'description': row['description'] or ''
        })

    return jsonify({
        'status': 'success',
        'entries': entries,
        'account1_name': account_names.get(account1, ''),
        'account2_name': account_names.get(account2, '')
    })
 

@app.route('/api/accounting/bank/fnbo', methods=['GET'])
@login_required
@role_required(['admin'])
def bank_fnbo():
    """Fetch FNBO (Plaid) transactions with filtering - FLIP SIGN to match Square convention."""
    search = request.args.get('search', '').strip()
    unprocessed_only = request.args.get('unprocessed_only')

    try:
        plaid_tx = fetch_bank_transactions()
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500

    # Flip sign to match Square convention (positive = revenue, negative = expense)
    for tx in plaid_tx:
        tx['amount'] = -tx['amount']

    if search:
        search_lower = search.lower()
        plaid_tx = [t for t in plaid_tx if search_lower in t['description'].lower()]

    # Determine processed status and get account_id
    conn = get_db()
    cursor = conn.cursor()
    for tx in plaid_tx:
        cursor.execute('SELECT id FROM journal_entries WHERE source_type = ? AND source_id = ?', ('plaid', tx['id']))
        entry = cursor.fetchone()
        tx['processed'] = entry is not None
        tx['source_type'] = 'plaid'
        tx['account_id'] = None
        if entry:
            # Get the non-cash account (debit for expenses, credit for revenue)
            # For expenses: debit_amount > 0
            # For revenue: credit_amount > 0
            cursor.execute('''
                SELECT jl.account_id
                FROM journal_lines jl
                WHERE jl.journal_entry_id = ?
                AND (jl.debit_amount > 0 OR jl.credit_amount > 0)
                AND jl.account_id != (
                    SELECT id FROM accounts WHERE code IN ('1010', '1011', '1015', '1020', '1025', '1030')
                    LIMIT 1
                )
                LIMIT 1
            ''', (entry['id'],))
            line = cursor.fetchone()
            if line:
                tx['account_id'] = line['account_id']
    conn.close()

    # Apply view filter
    if unprocessed_only is not None:
        filter_unprocessed = unprocessed_only.lower() == 'true'
        if filter_unprocessed:
            plaid_tx = [t for t in plaid_tx if not t['processed']]
        else:
            plaid_tx = [t for t in plaid_tx if t['processed']]

    total = len(plaid_tx)
    unprocessed = len([t for t in plaid_tx if not t['processed']])

    return jsonify({
        'status': 'success',
        'transactions': plaid_tx,
        'total_count': total,
        'unprocessed_count': unprocessed
    })

@app.route('/api/accounting/bank/bluevine', methods=['GET'])
@login_required
@role_required(['admin'])
def bank_bluevine():
    """Fetch Bluevine (historic) transactions with filtering - FLIP SIGN to match Square convention."""
    search = request.args.get('search', '').strip()
    unprocessed_only = request.args.get('unprocessed_only')  # 'true', 'false', or None

    conn = get_db()
    cursor = conn.cursor()

    query = '''
        SELECT id, transaction_date as date, amount, description, processed, source
        FROM bank_transactions
        WHERE 1=1
    '''
    params = []

    if search:
        query += ' AND description LIKE ?'
        params.append(f'%{search}%')

    # Apply view filter
    if unprocessed_only is not None:
        filter_unprocessed = unprocessed_only.lower() == 'true'
        if filter_unprocessed:
            query += ' AND (processed IS NULL OR processed = 0)'
        else:
            query += ' AND processed = 1'

    query += ' ORDER BY transaction_date DESC'
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    transactions = []
    for row in rows:
        source_val = row['source'] if row['source'] else 'csv_import'
        mapped_source = 'historic' if source_val in ('csv_import', 'historic') else source_val
        amount = row['amount'] / 100.0
        # Flip sign to match Square convention (positive = revenue, negative = expense)
        flipped_amount = -amount
        
        # Check if posted and get account_id
        processed = bool(row['processed']) if row['processed'] is not None else False
        account_id = None
        if processed:
            conn2 = get_db()
            cur2 = conn2.cursor()
            cur2.execute('''
                SELECT jl.account_id
                FROM journal_entries je
                JOIN journal_lines jl ON jl.journal_entry_id = je.id
                WHERE je.source_type = ? AND je.source_id = ?
                AND jl.debit_amount > 0
            ''', (mapped_source, str(row['id'])))
            line = cur2.fetchone()
            conn2.close()
            if line:
                account_id = line['account_id']
        
        transactions.append({
            'id': row['id'],
            'date': row['date'],
            'amount': flipped_amount,
            'description': row['description'],
            'category': '',
            'processed': processed,
            'source_type': mapped_source,
            'account_id': account_id
        })

    total = len(transactions)
    unprocessed = len([t for t in transactions if not t['processed']])

    return jsonify({
        'status': 'success',
        'transactions': transactions,
        'total_count': total,
        'unprocessed_count': unprocessed
    })


@app.route('/api/accounting/bank/square', methods=['GET'])
@login_required
@role_required(['admin'])
def bank_square():
    """Fetch Square transactions with filtering. Square already uses positive = revenue, negative = expense."""
    search = request.args.get('search', '').strip()
    unprocessed_only = request.args.get('unprocessed_only')

    from datetime import datetime, timedelta
    import requests

    access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
    if not access_token:
        return jsonify({'status': 'error', 'error': 'SQUARE_ACCESS_TOKEN not configured'}), 500

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
        'Square-Version': '2026-01-22'
    }

    end_date = datetime.now()
    start_date = end_date - timedelta(days=730)
    url = 'https://connect.squareup.com/v2/payments'
    params = {
        'begin_time': start_date.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'end_time': end_date.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'limit': 100
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        if response.status_code != 200:
            return jsonify({'status': 'error', 'error': f'Square API error: {response.status_code}'}), response.status_code
        data = response.json()
    except Exception as e:
        return jsonify({'status': 'error', 'error': f'Failed to fetch Square payments: {str(e)}'}), 500

    payments = data.get('payments', [])
    transactions = []

    conn = get_db()
    cursor = conn.cursor()

    for p in payments:
        if p.get('status') != 'COMPLETED':
            continue
        amount = p.get('amount_money', {}).get('amount', 0) / 100.0
        if amount == 0:
            continue
        settled_at = p.get('updated_at') or p.get('created_at', '')
        date_str = settled_at.split('T')[0] if settled_at else datetime.now().strftime('%Y-%m-%d')

        # Check if already posted - source_type is 'square'
        cursor.execute('SELECT id FROM journal_entries WHERE source_type = ? AND source_id = ?', ('square', p['id']))
        entry = cursor.fetchone()
        processed = entry is not None
        account_id = None
        if processed:
            # Get the non-cash account
            cursor.execute('''
                SELECT jl.account_id
                FROM journal_lines jl
                WHERE jl.journal_entry_id = ?
                AND (jl.debit_amount > 0 OR jl.credit_amount > 0)
                AND jl.account_id != (
                    SELECT id FROM accounts WHERE code IN ('1010', '1011', '1015', '1020', '1025', '1030')
                    LIMIT 1
                )
                LIMIT 1
            ''', (entry['id'],))
            line = cursor.fetchone()
            if line:
                account_id = line['account_id']

        transactions.append({
            'id': p['id'],
            'date': date_str,
            'amount': amount,  # Square already uses positive = revenue, negative = expense
            'description': f"Square Payment: {p.get('id', '')}",
            'category': 'Payment',
            'processed': processed,
            'source_type': 'square',
            'account_id': account_id
        })

    conn.close()

    if search:
        search_lower = search.lower()
        transactions = [t for t in transactions if search_lower in t['description'].lower()]

    # Apply view filter
    if unprocessed_only is not None:
        filter_unprocessed = unprocessed_only.lower() == 'true'
        if filter_unprocessed:
            transactions = [t for t in transactions if not t['processed']]
        else:
            transactions = [t for t in transactions if t['processed']]

    total = len(transactions)
    unprocessed = len([t for t in transactions if not t['processed']])

    return jsonify({
        'status': 'success',
        'transactions': transactions,
        'total_count': total,
        'unprocessed_count': unprocessed
    })

@app.route('/api/purchases/draft/<int:draft_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_draft_purchase(draft_id):
    """
    Decline a draft: delete the purchase, its journal entry, and all linked records.
    """
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Get journal entry and linked records
        cursor.execute('''
            SELECT je.id as journal_entry_id
            FROM purchases p
            JOIN journal_entries je ON je.id = p.id AND je.source_type = 'purchase'  -- ← FIXED JOIN
            WHERE p.id = ?
        ''', (draft_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Draft not found'}), 404

        journal_entry_id = row['journal_entry_id']

        # Delete all records linked to this journal entry (batch_id = journal_entry_id)
        cursor.execute('DELETE FROM records WHERE batch_id = ?', (journal_entry_id,))
        deleted_records = cursor.rowcount

        # Delete journal lines and journal entry
        cursor.execute('DELETE FROM journal_lines WHERE journal_entry_id = ?', (journal_entry_id,))
        cursor.execute('DELETE FROM journal_entries WHERE id = ?', (journal_entry_id,))

        # Delete the purchase row
        cursor.execute('DELETE FROM purchases WHERE id = ?', (draft_id,))

        conn.commit()
        conn.close()

        return jsonify({
            'status': 'success',
            'message': f'Draft #{draft_id} deleted',
            'deleted_records': deleted_records
        })
    except Exception as e:
        app.logger.error(f"Error deleting draft: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== ACCOUNTING: SALE ENTRY ====================

@app.route('/api/accounting/sale', methods=['POST'])
@login_required
@role_required(['admin'])
def accounting_create_sale():
    """Create a sale journal entry from checkout"""
    try:
        data = request.json
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        # Required fields
        order_id = data.get('order_id')
        payment_method = data.get('payment_method', 'cash')
        total_amount = float(data.get('total_amount', 0))
        items = data.get('items', [])
        transaction_date = data.get('transaction_date', datetime.now().strftime('%Y-%m-%d'))
        
        if not order_id:
            return jsonify({'status': 'error', 'error': 'order_id required'}), 400
        if total_amount <= 0:
            return jsonify({'status': 'error', 'error': 'total_amount must be greater than 0'}), 400
        if not items:
            return jsonify({'status': 'error', 'error': 'items required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Map payment method to accounts
        account_map = {
            'cash': {'debit': '1015', 'credit': '4001'},
            'square': {'debit': '1030', 'credit': '4000'},
            'paypal': {'debit': '1020', 'credit': '4003'},
            'discogs': {'debit': '1020', 'credit': '4003'},
            'giftcard': {'debit': '2015', 'credit': '4001'},
            'store_credit': {'debit': '2015', 'credit': '4001'}
        }
        
        mapping = account_map.get(payment_method, account_map['cash'])
        
        # Get account IDs
        cursor.execute('SELECT id FROM accounts WHERE code = ?', (mapping['debit'],))
        debit_account = cursor.fetchone()
        cursor.execute('SELECT id FROM accounts WHERE code = ?', (mapping['credit'],))
        credit_account = cursor.fetchone()
        
        if not debit_account or not credit_account:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Required accounts not found'}), 500
        
        amount_cents = int(round(total_amount * 100))
        
        # Create journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (transaction_date, f"Sale - Order {order_id} - {payment_method}", 'order', str(order_id)))
        entry_id = cursor.lastrowid
        
        # Debit (asset/cash account)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, debit_account['id'], amount_cents, 0))
        
        # Credit (revenue account)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, credit_account['id'], 0, amount_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Sale entry created',
            'entry_id': entry_id,
            'order_id': order_id
        })
        
    except Exception as e:
        app.logger.error(f"Sale entry error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== ACCOUNTING: SQUARE BATCH ====================

@app.route('/api/accounting/square-batch', methods=['POST'])
@login_required
@role_required(['admin'])
def accounting_create_square_batch():
    """Create a Square batch journal entry"""
    try:
        data = request.json
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        batch_id = data.get('batch_id')
        date_str = data.get('date')
        amount = float(data.get('amount', 0))
        description = data.get('description', '').strip()
        matched_sales = data.get('matched_sales', [])
        
        if not batch_id:
            return jsonify({'status': 'error', 'error': 'batch_id required'}), 400
        if not date_str:
            return jsonify({'status': 'error', 'error': 'date required'}), 400
        if amount <= 0:
            return jsonify({'status': 'error', 'error': 'amount must be greater than 0'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get Square Asset account (1030) and Revenue account (4000)
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1030',))
        square_account = cursor.fetchone()
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4000',))
        revenue_account = cursor.fetchone()
        
        if not square_account or not revenue_account:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Required accounts not found'}), 500
        
        amount_cents = int(round(amount * 100))
        
        # Create journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (date_str, f"Square Batch {batch_id} - {description}", 'square_batch', str(batch_id)))
        entry_id = cursor.lastrowid
        
        # Debit Square Asset
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, square_account['id'], amount_cents, 0))
        
        # Credit Revenue
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, revenue_account['id'], 0, amount_cents))
        
        # Link matched sales
        for sale_id in matched_sales:
            cursor.execute('''
                UPDATE journal_entries 
                SET square_batch_id = ? 
                WHERE source_type = 'order' AND source_id = ?
            ''', (entry_id, str(sale_id)))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Square batch entry created',
            'entry_id': entry_id,
            'batch_id': batch_id,
            'matched_count': len(matched_sales)
        })
        
    except Exception as e:
        app.logger.error(f"Square batch error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== ACCOUNTING: RECONCILE BANK DEPOSIT ====================

@app.route('/api/accounting/reconcile-bank-deposit', methods=['POST'])
@login_required
@role_required(['admin'])
def accounting_reconcile_bank_deposit():
    """Match a bank deposit with a Square batch"""
    try:
        data = request.json
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        bank_transaction_id = data.get('bank_transaction_id')
        square_batch_id = data.get('square_batch_id')
        amount = float(data.get('amount', 0))
        notes = data.get('notes', '').strip()
        
        if not bank_transaction_id:
            return jsonify({'status': 'error', 'error': 'bank_transaction_id required'}), 400
        if not square_batch_id:
            return jsonify({'status': 'error', 'error': 'square_batch_id required'}), 400
        if amount <= 0:
            return jsonify({'status': 'error', 'error': 'amount must be greater than 0'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if bank transaction exists
        cursor.execute('SELECT id, amount FROM bank_transactions WHERE id = ?', (bank_transaction_id,))
        bank_tx = cursor.fetchone()
        if not bank_tx:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Bank transaction not found'}), 404
        
        # Check if square batch exists
        cursor.execute('SELECT id FROM journal_entries WHERE id = ? AND source_type = ?', (square_batch_id, 'square_batch'))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Square batch not found'}), 404
        
        # Check if already reconciled
        cursor.execute('SELECT id FROM reconciliation WHERE bank_transaction_id = ?', (bank_transaction_id,))
        if cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Bank transaction already reconciled'}), 400
        
        # Create reconciliation record
        cursor.execute('''
            INSERT INTO reconciliation (bank_transaction_id, square_batch_id, amount, reconciliation_date, status, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (bank_transaction_id, square_batch_id, amount, datetime.now().strftime('%Y-%m-%d'), 'matched', notes))
        recon_id = cursor.lastrowid
        
        # Update journal_entries with bank_transaction_id for square_batch
        cursor.execute('''
            UPDATE journal_entries 
            SET bank_transaction_id = ?, reconciled = 1
            WHERE id = ?
        ''', (bank_transaction_id, square_batch_id))
        
        # Also update any linked sale entries
        cursor.execute('''
            UPDATE journal_entries 
            SET bank_transaction_id = ?, reconciled = 1
            WHERE square_batch_id = ?
        ''', (bank_transaction_id, square_batch_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Bank deposit reconciled',
            'reconciliation_id': recon_id,
            'bank_transaction_id': bank_transaction_id,
            'square_batch_id': square_batch_id
        })
        
    except Exception as e:
        app.logger.error(f"Reconcile bank deposit error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== ACCOUNTING: RECONCILIATION REPORT ====================




@role_required(['admin'])
def accounting_reconciliation_report():
    """Get full reconciliation report"""
    try:
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get all reconciliation records
        query = '''
            SELECT 
                r.*,
                bt.transaction_date as bank_date,
                bt.amount as bank_amount,
                bt.description as bank_description,
                je.transaction_date as batch_date,
                je.description as batch_description,
                je.source_id as batch_source_id
            FROM reconciliation r
            LEFT JOIN bank_transactions bt ON r.bank_transaction_id = bt.id
            LEFT JOIN journal_entries je ON r.square_batch_id = je.id
            WHERE 1=1
        '''
        params = []
        
        if date_from:
            query += ' AND r.reconciliation_date >= ?'
            params.append(date_from)
        if date_to:
            query += ' AND r.reconciliation_date <= ?'
            params.append(date_to)
        
        query += ' ORDER BY r.reconciliation_date DESC'
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        reconciliations = []
        for row in rows:
            reconciliations.append({
                'id': row['id'],
                'bank_transaction_id': row['bank_transaction_id'],
                'square_batch_id': row['square_batch_id'],
                'amount': float(row['amount']) if row['amount'] else 0,
                'reconciliation_date': row['reconciliation_date'],
                'status': row['status'],
                'notes': row['notes'],
                'bank_date': row['bank_date'],
                'bank_amount': float(row['bank_amount']) if row['bank_amount'] else 0,
                'bank_description': row['bank_description'],
                'batch_date': row['batch_date'],
                'batch_description': row['batch_description'],
                'batch_source_id': row['batch_source_id']
            })
        
        # Get summary stats
        cursor.execute('''
            SELECT 
                COUNT(*) as total_reconciled,
                COALESCE(SUM(amount), 0) as total_amount
            FROM reconciliation
        ''')
        stats = cursor.fetchone()
        
        # Get unreconciled sales
        cursor.execute('''
            SELECT COUNT(*) as count, COALESCE(SUM(jl.debit_amount) / 100.0, 0) as amount
            FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            WHERE je.source_type = 'order' 
            AND (je.reconciled IS NULL OR je.reconciled = 0)
            AND jl.debit_amount > 0
        ''')
        unreconciled_sales = cursor.fetchone()
        
        # Get unreconciled square batches
        cursor.execute('''
            SELECT COUNT(*) as count, COALESCE(SUM(jl.debit_amount) / 100.0, 0) as amount
            FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            WHERE je.source_type = 'square_batch' 
            AND (je.reconciled IS NULL OR je.reconciled = 0)
            AND jl.debit_amount > 0
        ''')
        unreconciled_batches = cursor.fetchone()
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'reconciliations': reconciliations,
            'summary': {
                'total_reconciled': stats['total_reconciled'] or 0,
                'total_amount': float(stats['total_amount'] or 0),
                'unreconciled_sales': {
                    'count': unreconciled_sales['count'] or 0,
                    'amount': float(unreconciled_sales['amount'] or 0)
                },
                'unreconciled_batches': {
                    'count': unreconciled_batches['count'] or 0,
                    'amount': float(unreconciled_batches['amount'] or 0)
                }
            },
            'date_from': date_from,
            'date_to': date_to
        })
        
    except Exception as e:
        app.logger.error(f"Reconciliation report error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== ACCOUNTING: UNRECONCILED ITEMS ====================

@app.route('/api/accounting/unreconciled-items', methods=['GET'])
@login_required
@role_required(['admin'])
def accounting_unreconciled_items():
    """Get list of items needing reconciliation"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        items = []
        
        # Unreconciled sales
        cursor.execute('''
            SELECT 
                je.id,
                je.transaction_date,
                je.description,
                je.source_id,
                COALESCE(jl.debit_amount / 100.0, 0) as amount,
                'sale' as type
            FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            WHERE je.source_type = 'order' 
            AND (je.reconciled IS NULL OR je.reconciled = 0)
            AND jl.debit_amount > 0
            ORDER BY je.transaction_date DESC
        ''')
        sales = cursor.fetchall()
        
        for row in sales:
            items.append({
                'id': row['id'],
                'type': 'sale',
                'source_id': row['source_id'],
                'date': row['transaction_date'],
                'description': row['description'],
                'amount': float(row['amount'] or 0)
            })
        
        # Unreconciled square batches
        cursor.execute('''
            SELECT 
                je.id,
                je.transaction_date,
                je.description,
                je.source_id,
                COALESCE(jl.debit_amount / 100.0, 0) as amount,
                'square_batch' as type
            FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            WHERE je.source_type = 'square_batch' 
            AND (je.reconciled IS NULL OR je.reconciled = 0)
            AND jl.debit_amount > 0
            ORDER BY je.transaction_date DESC
        ''')
        batches = cursor.fetchall()
        
        for row in batches:
            items.append({
                'id': row['id'],
                'type': 'square_batch',
                'source_id': row['source_id'],
                'date': row['transaction_date'],
                'description': row['description'],
                'amount': float(row['amount'] or 0)
            })
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'items': items,
            'count': len(items)
        })
        
    except Exception as e:
        app.logger.error(f"Unreconciled items error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== RECONCILIATION: INITIALIZE ====================
# ============================================================
# RECONCILIATION ENDPOINT - UPDATED to use bank-transactions
# ============================================================

@app.route('/api/accounting/reconcile/init', methods=['GET'])
@login_required
@role_required(['admin'])
def accounting_reconcile_init():
    """
    Initialize reconciliation: fetch Square transactions, fetch bank transactions
    (both Plaid and Historic), and auto-match them.
    """
    from datetime import datetime, timedelta
    import requests
    
    conn = get_db()
    cursor = conn.cursor()
    
    # ============================================================
    # 1. FETCH SQUARE TRANSACTIONS
    # ============================================================
    access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
    if not access_token:
        app.logger.error("[RECONCILE] SQUARE_ACCESS_TOKEN not configured")
        return jsonify({'status': 'error', 'error': 'SQUARE_ACCESS_TOKEN not configured'}), 500
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
        'Square-Version': '2026-01-22'
    }
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=730)  # Fetch 2 years of Square transactions
    
    url = 'https://connect.squareup.com/v2/payments'
    params = {
        'begin_time': start_date.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'end_time': end_date.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'limit': 100
    }
    
    app.logger.info(f"[SQUARE] Fetching payments from {params['begin_time']} to {params['end_time']}")
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
    except requests.exceptions.RequestException as e:
        app.logger.error(f"[SQUARE] Request failed: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500
    
    app.logger.info(f"[SQUARE] Response status: {response.status_code}")
    
    if response.status_code != 200:
        app.logger.error(f"[SQUARE] API error: {response.status_code} - {response.text[:200]}")
        return jsonify({'status': 'error', 'error': f"Square API error: {response.status_code}"}), 500
    
    data = response.json()
    payments = data.get('payments', [])
    square_found = len(payments)
    
    app.logger.info(f"[SQUARE] Found {square_found} payments")
    
    # Get accounts
    cursor.execute('SELECT id FROM accounts WHERE code = ?', ('1030',))
    square_account = cursor.fetchone()
    if not square_account:
        conn.close()
        return jsonify({'status': 'error', 'error': "Account with code '1030' (Square Asset) not found"}), 500
    
    cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4000',))
    revenue_account = cursor.fetchone()
    if not revenue_account:
        conn.close()
        return jsonify({'status': 'error', 'error': "Account with code '4000' (Sales Revenue - Square) not found"}), 500
    
    square_imported = 0
    for payment in payments:
        if payment.get('status') != 'COMPLETED':
            continue
            
        batch_id = payment.get('id')
        if not batch_id:
            continue
        
        # Check if already imported
        cursor.execute('SELECT id FROM journal_entries WHERE source_type = "square_batch" AND source_id = ?', (batch_id,))
        if cursor.fetchone():
            continue
        
        amount_money = payment.get('amount_money', {})
        amount = amount_money.get('amount', 0) / 100.0
        if amount <= 0:
            continue
        
        settled_at = payment.get('updated_at') or payment.get('created_at', '')
        date_str = settled_at.split('T')[0] if settled_at else datetime.now().strftime('%Y-%m-%d')
        
        amount_cents = int(round(amount * 100))
        
        # Create journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (date_str, f"Square Batch {batch_id}", 'square_batch', str(batch_id)))
        entry_id = cursor.lastrowid
        
        # Debit Square Asset
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, square_account['id'], amount_cents, 0))
        
        # Credit Revenue
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, revenue_account['id'], 0, amount_cents))
        
        square_imported += 1
    
    conn.commit()
    app.logger.info(f"[RECONCILE] ✅ Imported {square_imported} Square batches")
    
    # ============================================================
    # 2. FETCH BANK TRANSACTIONS (DIRECT - Plaid + Historic)
    # ============================================================
    
    # 2a. Get Plaid transactions (live from Plaid)
    plaid_transactions = []
    try:
        plaid_tx = fetch_bank_transactions()
        for tx in plaid_tx:
            tx['source_type'] = 'plaid'
            tx['processed'] = False  # Plaid transactions are not processed by default
        plaid_transactions = plaid_tx
        app.logger.info(f"[RECONCILE] Fetched {len(plaid_transactions)} Plaid transactions")
    except Exception as e:
        app.logger.warning(f"[RECONCILE] Could not fetch Plaid transactions: {e}")
        plaid_transactions = []
    
    # 2b. Get Historic transactions (from bank_transactions table)
    conn2 = get_db()
    cur2 = conn2.cursor()
    cur2.execute('''
        SELECT id, transaction_date as date, amount, description, processed, source
        FROM bank_transactions
        ORDER BY transaction_date DESC
    ''')
    historic_rows = cur2.fetchall()
    conn2.close()
    
    historic_transactions = []
    for row in historic_rows:
        # Map source column to source_type
        source_val = row['source'] if row['source'] else 'csv_import'
        mapped_source = 'historic' if source_val in ('csv_import', 'historic') else source_val
        historic_transactions.append({
            'id': row['id'],
            'date': row['date'],
            'amount': row['amount'] / 100.0,  # stored in cents
            'description': row['description'],
            'processed': bool(row['processed']) if row['processed'] is not None else False,
            'source_type': mapped_source
        })
    
    app.logger.info(f"[RECONCILE] Fetched {len(historic_transactions)} Historic transactions")
    
    # Combine both sources
    all_bank_transactions = plaid_transactions + historic_transactions
    app.logger.info(f"[RECONCILE] Total bank transactions: {len(all_bank_transactions)}")
    
    # ============================================================
    # 3. GET SQUARE BATCHES FROM JOURNAL
    # ============================================================
    cursor.execute('''
        SELECT je.id, je.transaction_date, je.source_id,
               COALESCE(jl.debit_amount, 0) / 100.0 as amount,
               je.reconciled,
               je.bank_transaction_id
        FROM journal_entries je
        JOIN journal_lines jl ON jl.journal_entry_id = je.id
        WHERE je.source_type = 'square_batch'
          AND jl.debit_amount > 0
        ORDER BY je.transaction_date DESC
    ''')
    square_batches = cursor.fetchall()
    
    batches_list = []
    total_batches_amount = 0
    for b in square_batches:
        amount = float(b['amount'])
        total_batches_amount += amount
        batches_list.append({
            'id': b['id'],
            'date': b['transaction_date'],
            'amount': amount,
            'source_id': b['source_id'],
            'reconciled': bool(b['reconciled']) if b['reconciled'] is not None else False,
            'bank_transaction_id': b['bank_transaction_id']
        })
    
    app.logger.info(f"[RECONCILE] Found {len(batches_list)} Square batches in journal_entries")
    
    # ============================================================
    # 4. GET EXPECTED PAYMENTS (Sales) - FIXED: includes 'order' AND 'record'
    # ============================================================
    cursor.execute('''
        SELECT je.id, je.transaction_date, je.source_id, 
               COALESCE(jl.debit_amount, 0) / 100.0 as amount,
               je.reconciled,
               je.bank_transaction_id
        FROM journal_entries je
        JOIN journal_lines jl ON jl.journal_entry_id = je.id
        WHERE je.source_type IN ('order', 'record') 
          AND jl.debit_amount > 0
        ORDER BY je.transaction_date DESC
    ''')
    sales = cursor.fetchall()
    
    sales_list = []
    total_sales_amount = 0
    for s in sales:
        amount = float(s['amount'])
        total_sales_amount += amount
        sales_list.append({
            'id': s['id'],
            'date': s['transaction_date'],
            'amount': amount,
            'source_id': s['source_id'],
            'status': 'matched' if s['reconciled'] else 'pending',
            'bank_transaction_id': s['bank_transaction_id']
        })
    
    app.logger.info(f"[RECONCILE] Found {len(sales_list)} sales (orders + records)")
    
    # ============================================================
    # 5. AUTO-MATCH SQUARE BATCHES TO BANK DEPOSITS
    # ============================================================
    matched_count = 0
    
    # Get all unreconciled square batches
    cursor.execute('''
        SELECT je.id, je.transaction_date, 
               COALESCE(jl.debit_amount, 0) / 100.0 as amount,
               je.source_id
        FROM journal_entries je
        JOIN journal_lines jl ON jl.journal_entry_id = je.id
        WHERE je.source_type = 'square_batch' 
          AND jl.debit_amount > 0
          AND (je.reconciled IS NULL OR je.reconciled = 0)
        ORDER BY je.transaction_date DESC
    ''')
    unreconciled_batches = cursor.fetchall()
    
    # Get all unreconciled bank deposits (from combined list)
    # Filter to only deposits (positive amounts) that are not matched
    unreconciled_deposits = []
    for tx in all_bank_transactions:
        if tx.get('amount', 0) > 0 and not tx.get('processed', False):
            # Check if already matched via reconciliation_matches
            cursor.execute('SELECT id FROM reconciliation_matches WHERE bank_transaction_id = ?', (tx.get('id'),))
            if not cursor.fetchone():
                unreconciled_deposits.append({
                    'id': tx.get('id'),
                    'date': tx.get('date', ''),
                    'amount': abs(float(tx.get('amount', 0)))
                })
    
    app.logger.info(f"[RECONCILE] Found {len(unreconciled_batches)} unreconciled batches and {len(unreconciled_deposits)} unreconciled deposits")
    
    # Match batches to deposits
    for batch in unreconciled_batches:
        batch_date_str = batch['transaction_date']
        if isinstance(batch_date_str, str):
            batch_date_str = batch_date_str.split('T')[0] if 'T' in batch_date_str else batch_date_str
            try:
                batch_date = datetime.strptime(batch_date_str, '%Y-%m-%d')
            except ValueError:
                continue
        else:
            batch_date = batch_date_str
        
        batch_amount = batch['amount']
        
        for deposit in unreconciled_deposits:
            dep_date_str = deposit['date']
            if isinstance(dep_date_str, str):
                dep_date_str = dep_date_str.split('T')[0] if 'T' in dep_date_str else dep_date_str
                try:
                    dep_date = datetime.strptime(dep_date_str, '%Y-%m-%d')
                except ValueError:
                    continue
            else:
                dep_date = dep_date_str
            
            delta = abs((batch_date - dep_date).days)
            if delta <= 3 and abs(deposit['amount'] - batch_amount) < 0.01:
                cursor.execute('''
                    INSERT INTO reconciliation_matches (square_batch_id, bank_transaction_id, amount, reconciliation_date, status)
                    VALUES (?, ?, ?, ?, ?)
                ''', (batch['id'], deposit['id'], batch_amount, datetime.now().strftime('%Y-%m-%d'), 'matched'))
                
                cursor.execute('''
                    UPDATE journal_entries 
                    SET reconciled = 1, bank_transaction_id = ?
                    WHERE id = ?
                ''', (deposit['id'], batch['id']))
                
                matched_count += 1
                unreconciled_deposits = [d for d in unreconciled_deposits if d['id'] != deposit['id']]
                break
    
    conn.commit()
    
    # ============================================================
    # 6. GET FINAL RECONCILIATION STATUS
    # ============================================================
    
    # Build deposits list with matched status from combined transactions
    final_deposits = []
    for tx in all_bank_transactions:
        # Check if matched
        cursor.execute('SELECT id FROM reconciliation_matches WHERE bank_transaction_id = ?', (tx.get('id'),))
        matched = cursor.fetchone() is not None
        
        # Get the account_id if processed
        account_id = tx.get('account_id')
        if not account_id and tx.get('processed'):
            # Try to look up the account_id from journal entry
            cursor.execute('''
                SELECT jl.account_id
                FROM journal_lines jl
                JOIN journal_entries je ON je.id = jl.journal_entry_id
                WHERE je.source_type = ? AND je.source_id = ?
            ''', (tx.get('source_type', 'historic'), str(tx['id'])))
            line = cursor.fetchone()
            if line:
                account_id = line['account_id']
        
        final_deposits.append({
            'id': tx.get('id'),
            'date': tx.get('date', ''),
            'amount': abs(float(tx.get('amount', 0))),
            'description': tx.get('description', ''),
            'matched': matched,
            'source_type': tx.get('source_type', 'unknown'),
            'processed': tx.get('processed', False),
            'account_id': account_id
        })
    
    # Get updated square batches
    cursor.execute('''
        SELECT je.id, je.transaction_date, je.source_id,
               COALESCE(jl.debit_amount, 0) / 100.0 as amount,
               je.reconciled,
               je.bank_transaction_id
        FROM journal_entries je
        JOIN journal_lines jl ON jl.journal_entry_id = je.id
        WHERE je.source_type = 'square_batch'
          AND jl.debit_amount > 0
        ORDER BY je.transaction_date DESC
    ''')
    updated_batches = cursor.fetchall()
    
    final_batches = []
    for b in updated_batches:
        final_batches.append({
            'id': b['id'],
            'date': b['transaction_date'],
            'amount': float(b['amount']),
            'source_id': b['source_id'],
            'reconciled': bool(b['reconciled']) if b['reconciled'] is not None else False,
            'bank_transaction_id': b['bank_transaction_id']
        })
    
    # Unmatched items (sales or batches not reconciled)
    cursor.execute('''
        SELECT je.id, je.transaction_date, je.source_type,
               COALESCE(jl.debit_amount, 0) / 100.0 as amount,
               je.source_id
        FROM journal_entries je
        JOIN journal_lines jl ON jl.journal_entry_id = je.id
        WHERE je.source_type IN ('order', 'record', 'square_batch')
          AND jl.debit_amount > 0
          AND (je.reconciled IS NULL OR je.reconciled = 0)
        ORDER BY je.transaction_date DESC
    ''')
    unmatched_items = cursor.fetchall()
    
    final_unmatched = []
    for u in unmatched_items:
        final_unmatched.append({
            'id': u['id'],
            'type': u['source_type'],
            'date': u['transaction_date'],
            'amount': float(u['amount']),
            'source_id': u['source_id']
        })
    
    conn.close()
    
    # Calculate totals
    total_sales_final = sum(s['amount'] for s in sales_list)
    total_batches_final = sum(b['amount'] for b in final_batches)
    total_deposits_final = sum(d['amount'] for d in final_deposits)
    variance = total_deposits_final - total_batches_final
    
    return jsonify({
        'status': 'success',
        'summary': {
            'total_sales': len(sales_list),
            'total_sales_amount': total_sales_final,
            'total_batches': len(final_batches),
            'total_batches_amount': total_batches_final,
            'total_deposits': len(final_deposits),
            'total_deposits_amount': total_deposits_final,
            'unmatched_count': len(final_unmatched),
            'variance': variance,
            'matched_count': matched_count,
            'square_imported': square_imported,
            'square_found': square_found,
            'plaid_transactions': len(plaid_transactions),
            'historic_transactions': len(historic_transactions),
            'total_bank_transactions': len(all_bank_transactions)
        },
        'sales': sales_list,
        'batches': final_batches,
        'deposits': final_deposits,
        'unmatched': final_unmatched
    })

# ============================================================
# PURCHASE METADATA UPDATE (PUT)
# ============================================================
@app.route('/api/purchases/<int:purchase_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_purchase(purchase_id):
    """
    Update purchase metadata: seller_name, seller_contact, description, status.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Check if purchase exists
        cursor.execute('SELECT id FROM purchases WHERE id = ?', (purchase_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Purchase not found'}), 404

        allowed_fields = ['seller_name', 'seller_contact', 'description', 'status']
        updates = []
        values = []

        for field in allowed_fields:
            if field in data and data[field] is not None:
                updates.append(f"{field} = ?")
                values.append(data[field])

        if not updates:
            conn.close()
            return jsonify({'status': 'error', 'error': 'No valid fields to update'}), 400

        values.append(purchase_id)
        query = f"UPDATE purchases SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        cursor.execute(query, values)
        conn.commit()
        conn.close()

        return jsonify({'status': 'success', 'message': f'Purchase #{purchase_id} updated'})

    except Exception as e:
        app.logger.error(f"Error updating purchase: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/purchases/<int:purchase_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def get_purchase_by_id(purchase_id):
    """Get a single purchase by ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                p.id,
                p.seller_name,
                p.seller_contact,
                p.description,
                p.bill_of_sale_path,
                p.status,
                p.created_at,
                p.updated_at,
                COUNT(r.id) as record_count,
                COALESCE(
                    (SELECT jl.debit_amount / 100.0 
                     FROM journal_lines jl
                     JOIN journal_entries je ON jl.journal_entry_id = je.id
                     WHERE je.source_id = p.id 
                       AND je.source_type = 'purchase'
                       AND jl.account_id = (SELECT id FROM accounts WHERE code = '1050')
                     LIMIT 1), 
                    0
                ) as amount_spent
            FROM purchases p
            LEFT JOIN records r ON r.batch_id = p.id
            WHERE p.id = ?
            GROUP BY p.id
        ''', (purchase_id,))
        
        purchase = cursor.fetchone()
        conn.close()
        
        if not purchase:
            return jsonify({'status': 'error', 'error': 'Purchase not found'}), 404
        
        return jsonify({
            'status': 'success',
            'purchase': {
                'id': purchase['id'],
                'seller_name': purchase['seller_name'],
                'seller_contact': purchase['seller_contact'] or '',
                'description': purchase['description'] or '',
                'bill_of_sale_path': purchase['bill_of_sale_path'],
                'status': purchase['status'],
                'created_at': purchase['created_at'],
                'updated_at': purchase['updated_at'],
                'record_count': purchase['record_count'] or 0,
                'amount_spent': float(purchase['amount_spent'] or 0)
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error getting purchase: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ============================================================
# PURCHASE BILL UPLOAD (POST)
# ============================================================
@app.route('/api/purchases/<int:purchase_id>/bill', methods=['POST'])
@login_required
@role_required(['admin'])
def upload_purchase_bill(purchase_id):
    """
    Upload a bill of sale image/PDF for a purchase.
    """
    try:
        if 'bill_image' not in request.files:
            return jsonify({'status': 'error', 'error': 'No file uploaded'}), 400

        file = request.files['bill_image']
        if file.filename == '':
            return jsonify({'status': 'error', 'error': 'No file selected'}), 400

        # Validate extension
        allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'}
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in allowed_extensions:
            return jsonify({
                'status': 'error',
                'error': f'File type not allowed. Allowed: {", ".join(allowed_extensions)}'
            }), 400

        # Check if purchase exists
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM purchases WHERE id = ?', (purchase_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Purchase not found'}), 404

        # Save file
        import uuid
        from werkzeug.utils import secure_filename
        filename = secure_filename(f"bill_{purchase_id}_{uuid.uuid4().hex[:8]}.{ext}")
        bills_folder = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'bills')
        os.makedirs(bills_folder, exist_ok=True)
        filepath = os.path.join(bills_folder, filename)
        file.save(filepath)

        bill_path = f"/static/uploads/bills/{filename}"

        # Update purchase record
        cursor.execute('''
            UPDATE purchases 
            SET bill_of_sale_path = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        ''', (bill_path, purchase_id))
        conn.commit()
        conn.close()

        return jsonify({
            'status': 'success',
            'message': 'Bill uploaded successfully',
            'bill_path': bill_path
        })

    except Exception as e:
        app.logger.error(f"Error uploading bill: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500
 
@app.route('/api/accounting/reconcile/date-range', methods=['GET'])
@login_required
@role_required(['admin'])
def reconcile_date_range():
    """Get min and max transaction dates for two accounts."""
    account1 = request.args.get('account1', type=int)
    account2 = request.args.get('account2', type=int)

    if not account1 or not account2:
        return jsonify({'status': 'error', 'error': 'Both account IDs required'}), 400
    if account1 == account2:
        return jsonify({'status': 'error', 'error': 'Please select two different accounts'}), 400

    conn = get_db()
    cursor = conn.cursor()

    query = '''
        SELECT MIN(je.transaction_date) as min_date, MAX(je.transaction_date) as max_date
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_entry_id = je.id
        WHERE jl.account_id IN (?, ?)
    '''
    cursor.execute(query, (account1, account2))
    row = cursor.fetchone()
    conn.close()

    if not row or not row['min_date'] or not row['max_date']:
        from datetime import datetime, timedelta
        today = datetime.now().date()
        min_date = today - timedelta(days=30)
        max_date = today
    else:
        min_date = row['min_date']
        max_date = row['max_date']

    return jsonify({
        'status': 'success',
        'min_date': min_date,
        'max_date': max_date
    })


@app.route('/api/accounting/reconcile/pairs', methods=['GET'])
@login_required
@role_required(['admin'])
def get_reconcile_pairs():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT r.id, r.account_a_id, r.account_b_id, r.name, r.description,
               a1.code AS account_a_code, a1.name AS account_a_name,
               a2.code AS account_b_code, a2.name AS account_b_name
        FROM reconciliation_accounts r
        JOIN accounts a1 ON r.account_a_id = a1.id
        JOIN accounts a2 ON r.account_b_id = a2.id
        ORDER BY r.created_at DESC
    ''')
    rows = cursor.fetchall()
    conn.close()
    pairs = [{
        'id': row['id'],
        'account_a_id': row['account_a_id'],
        'account_b_id': row['account_b_id'],
        'name': row['name'] or f"{row['account_a_code']} ↔ {row['account_b_code']}",
        'description': row['description'] or '',
        'account_a_name': row['account_a_name'],
        'account_b_name': row['account_b_name']
    } for row in rows]
    return jsonify({'status': 'success', 'pairs': pairs})

@app.route('/api/accounting/reconcile/pairs', methods=['POST'])
@login_required
@role_required(['admin'])
def add_reconcile_pair():
    data = request.json
    account_a = data.get('account_a_id')
    account_b = data.get('account_b_id')
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()
    if not account_a or not account_b:
        return jsonify({'status': 'error', 'error': 'Both account IDs required'}), 400
    if account_a == account_b:
        return jsonify({'status': 'error', 'error': 'Accounts must be different'}), 400

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO reconciliation_accounts (account_a_id, account_b_id, name, description)
            VALUES (?, ?, ?, ?)
        ''', (account_a, account_b, name or None, description or None))
        pair_id = cursor.lastrowid
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'status': 'error', 'error': 'This pair already exists'}), 400
    conn.close()
    return jsonify({'status': 'success', 'id': pair_id})


@app.route('/api/accounting/reconcile/pairs/<int:pair_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_reconcile_pair(pair_id):
    data = request.json
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()
    if not name and not description:
        return jsonify({'status': 'error', 'error': 'No fields to update'}), 400

    conn = get_db()
    cursor = conn.cursor()
    updates = []
    params = []
    if name:
        updates.append('name = ?')
        params.append(name)
    if description:
        updates.append('description = ?')
        params.append(description)
    params.append(pair_id)
    cursor.execute(f'UPDATE reconciliation_accounts SET {", ".join(updates)} WHERE id = ?', params)
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Pair updated'})

@app.route('/api/accounting/reconcile/pairs/<int:pair_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_reconcile_pair(pair_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM reconciliation_accounts WHERE id = ?', (pair_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Pair deleted'})


@app.route('/api/plaid/paypal/create-link-token', methods=['POST'])
@login_required
@role_required(['admin'])
def plaid_paypal_create_link_token():
    try:
        client_id = os.environ.get('PLAID_CLIENT_ID')
        secret = os.environ.get('PLAID_SECRET')
        env = os.environ.get('PLAID_ENV', 'sandbox')
        
        if not client_id or not secret:
            return jsonify({'status': 'error', 'error': 'Plaid not configured'}), 500
        
        host = plaid.Environment.Production if env == 'production' else plaid.Environment.Sandbox
        configuration = plaid.Configuration(host=host, api_key={'clientId': client_id, 'secret': secret})
        api_client = plaid.ApiClient(configuration)
        client = plaid_api.PlaidApi(api_client)
        
        request = LinkTokenCreateRequest(
            user=LinkTokenCreateRequestUser(client_user_id=str(session['user_id'])),
            client_name="PigStyle Music",
            products=[Products('transactions')],
            country_codes=[CountryCode('US')],
            language='en'
        )
        
        response = client.link_token_create(request)
        return jsonify({'link_token': response['link_token']})
        
    except Exception as e:
        app.logger.error(f"PayPal link token error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/plaid/paypal/exchange', methods=['POST'])
@login_required
@role_required(['admin'])
def plaid_paypal_exchange():
    try:
        data = request.json
        public_token = data.get('public_token')
        
        if not public_token:
            return jsonify({'status': 'error', 'error': 'public_token required'}), 400
        
        client_id = os.environ.get('PLAID_CLIENT_ID')
        secret = os.environ.get('PLAID_SECRET')
        env = os.environ.get('PLAID_ENV', 'sandbox')
        
        if not client_id or not secret:
            return jsonify({'status': 'error', 'error': 'Plaid not configured'}), 500
        
        host = plaid.Environment.Production if env == 'production' else plaid.Environment.Sandbox
        configuration = plaid.Configuration(host=host, api_key={'clientId': client_id, 'secret': secret})
        api_client = plaid.ApiClient(configuration)
        client = plaid_api.PlaidApi(api_client)
        
        exchange_request = ItemPublicTokenExchangeRequest(public_token=public_token)
        response = client.item_public_token_exchange(exchange_request)
        
        access_token = response['access_token']
        item_id = response['item_id']
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("INSERT OR IGNORE INTO app_config (config_key, config_value) VALUES ('plaid_paypal_access_token', '')")
        cursor.execute("INSERT OR IGNORE INTO app_config (config_key, config_value) VALUES ('plaid_paypal_item_id', '')")
        cursor.execute("UPDATE app_config SET config_value = ? WHERE config_key = 'plaid_paypal_access_token'", (access_token,))
        cursor.execute("UPDATE app_config SET config_value = ? WHERE config_key = 'plaid_paypal_item_id'", (item_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'item_id': item_id})
        
    except Exception as e:
        app.logger.error(f"PayPal exchange error: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/accounting/bank/paypal', methods=['GET'])
@login_required
@role_required(['admin'])
def bank_paypal():
    """
    Fetch PayPal transactions via Plaid.
    """
    search = request.args.get('search', '').strip()
    unprocessed_only = request.args.get('unprocessed_only')
    
    # Get PayPal Plaid access token
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'plaid_paypal_access_token'")
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return jsonify({
            'status': 'error',
            'error': 'PayPal not connected via Plaid. Please connect your PayPal account.',
            'needs_connection': True
        }), 400
    
    access_token = row['config_value']
    
    # Use Plaid to fetch transactions
    client = get_plaid_client()
    
    # Get transactions from last 90 days
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=90)
    
    plaid_request = TransactionsGetRequest(
        access_token=access_token,
        start_date=start_date,
        end_date=end_date,
        options=TransactionsGetRequestOptions(count=500, offset=0)
    )
    
    try:
        response = client.transactions_get(plaid_request)
        transactions = response['transactions']
    except plaid.ApiException as e:
        return jsonify({
            'status': 'error',
            'error': f'Plaid error: {str(e)}'
        }), 500
    
    # Format transactions for frontend - FLIP SIGN to match Square convention
    all_transactions = []
    for tx in transactions:
        amount = tx['amount']
        # Plaid: positive = debit (spending), negative = credit (income)
        # Flip to match Square convention: positive = revenue, negative = expense
        display_amount = -amount
        
        all_transactions.append({
            'id': tx['transaction_id'],
            'date': tx['date'],
            'amount': display_amount,
            'description': tx.get('name', ''),
            'category': tx.get('category', [''])[0] if tx.get('category') else '',
            'pending': tx.get('pending', False),
            'source_type': 'paypal'
        })
    
    # Check which transactions are already posted
    conn = get_db()
    cursor = conn.cursor()
    
    for tx in all_transactions:
        cursor.execute('''
            SELECT id FROM journal_entries 
            WHERE source_type = 'paypal' AND source_id = ?
        ''', (tx['id'],))
        entry = cursor.fetchone()
        tx['processed'] = entry is not None
        tx['account_id'] = None
        if entry:
            # Get the non-cash account (debit for expenses, credit for revenue)
            cursor.execute('''
                SELECT jl.account_id
                FROM journal_lines jl
                WHERE jl.journal_entry_id = ?
                AND (jl.debit_amount > 0 OR jl.credit_amount > 0)
                AND jl.account_id != (
                    SELECT id FROM accounts WHERE code IN ('1010', '1011', '1015', '1020', '1025', '1030')
                    LIMIT 1
                )
                LIMIT 1
            ''', (entry['id'],))
            line = cursor.fetchone()
            if line:
                tx['account_id'] = line['account_id']
    
    conn.close()
    
    # Apply filters
    if search:
        search_lower = search.lower()
        all_transactions = [t for t in all_transactions if search_lower in t['description'].lower()]
    
    if unprocessed_only is not None:
        filter_unprocessed = unprocessed_only.lower() == 'true'
        if filter_unprocessed:
            all_transactions = [t for t in all_transactions if not t.get('processed', False)]
        else:
            all_transactions = [t for t in all_transactions if t.get('processed', False)]
    
    total = len(all_transactions)
    unprocessed = len([t for t in all_transactions if not t.get('processed', False)])
    
    return jsonify({
        'status': 'success',
        'transactions': all_transactions,
        'total_count': total,
        'unprocessed_count': unprocessed
    })

@app.route('/api/accounting/bank/apply-multiple', methods=['POST'])
@login_required
@role_required(['admin'])
def apply_multiple():
    """
    Apply multiple transactions to accounts.
    Handles both unprocessed (new) and processed (update/reassign) transactions.
    """
    data = request.json
    updates = data.get('updates', [])
    
    # LOG: What we received
    app.logger.info("=" * 60)
    app.logger.info("APPLY_MULTIPLE CALLED")
    app.logger.info(f"Updates received: {json.dumps(updates, indent=2)}")
    app.logger.info("=" * 60)
    
    if not updates:
        return jsonify({'status': 'error', 'error': 'No updates provided'}), 400

    conn = get_db()
    cursor = conn.cursor()
    processed = 0
    created = 0
    updated = 0
    errors = []

    # Pre-fetch Plaid transactions once (for FNBO)
    try:
        all_plaid_tx = fetch_bank_transactions()
    except Exception as e:
        all_plaid_tx = []
        app.logger.error(f"Failed to fetch Plaid transactions: {e}")

    for item in updates:
        transaction_id = item.get('transaction_id')
        source_type = item.get('source_type', 'plaid')
        target_account_id = item.get('target_account_id')
        is_update = item.get('is_update', False)
        
        # LOG: Processing this transaction
        app.logger.info(f"Processing: tx_id={transaction_id}, source_type={source_type}, target={target_account_id}, is_update={is_update}")
        
        if not transaction_id or not target_account_id:
            errors.append(f'Missing fields for {transaction_id}: transaction_id or target_account_id missing')
            continue

        # Find the transaction
        tx = None
        
        if source_type == 'paypal':
            app.logger.info(f"Handling PayPal transaction: {transaction_id}")
            try:
                # Get PayPal access token
                conn2 = get_db()
                cur2 = conn2.cursor()
                cur2.execute("SELECT config_value FROM app_config WHERE config_key = 'plaid_paypal_access_token'")
                row = cur2.fetchone()
                conn2.close()
                
                if not row:
                    errors.append(f'PayPal not connected for transaction {transaction_id}')
                    continue
                
                access_token = row['config_value']
                
                # Fetch PayPal transactions using Plaid
                client = get_plaid_client()
                end_date = datetime.now().date()
                start_date = end_date - timedelta(days=90)
                
                plaid_request = TransactionsGetRequest(
                    access_token=access_token,
                    start_date=start_date,
                    end_date=end_date,
                    options=TransactionsGetRequestOptions(count=500, offset=0)
                )
                
                response = client.transactions_get(plaid_request)
                plaid_transactions = response['transactions']
                
                # Find the specific transaction
                tx_data = next((t for t in plaid_transactions if t['transaction_id'] == transaction_id), None)
                
                app.logger.info(f"PayPal tx found: {tx_data is not None}")
                if tx_data:
                    # Plaid transactions use 'name' for description
                    tx = {
                        'id': tx_data['transaction_id'],
                        'date': tx_data['date'],
                        'amount': -tx_data['amount'],  # Flip sign to match Square convention
                        'description': tx_data.get('name', '')
                    }
            except Exception as e:
                app.logger.error(f"Failed to fetch PayPal transaction {transaction_id}: {str(e)}")
                errors.append(f'Failed to fetch PayPal transaction {transaction_id}: {str(e)}')
                continue
        elif source_type == 'plaid':
            app.logger.info(f"Handling Plaid transaction: {transaction_id}")
            tx = next((t for t in all_plaid_tx if str(t['id']) == str(transaction_id)), None)
            app.logger.info(f"Plaid tx found: {tx is not None}")
        elif source_type in ['historic', 'bluevine']:
            app.logger.info(f"Handling Historic transaction: {transaction_id}")
            conn2 = get_db()
            cur2 = conn2.cursor()
            cur2.execute('SELECT id, transaction_date, amount, description FROM bank_transactions WHERE id = ?', (int(transaction_id),))
            row = cur2.fetchone()
            conn2.close()
            if row:
                tx = {
                    'id': row['id'],
                    'date': row['transaction_date'],
                    'amount': row['amount'] / 100.0,
                    'description': row['description']
                }
            app.logger.info(f"Historic tx found: {tx is not None}")
        elif source_type == 'square':
            app.logger.info(f"Handling Square transaction: {transaction_id}")
            try:
                import requests
                access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
                if not access_token:
                    errors.append(f'Square access token not configured for transaction {transaction_id}')
                    continue
                headers = {
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json',
                    'Square-Version': '2026-01-22'
                }
                response = requests.get(f'https://connect.squareup.com/v2/payments/{transaction_id}', headers=headers, timeout=30)
                if response.status_code == 200:
                    payment = response.json().get('payment', {})
                    amount = payment.get('amount_money', {}).get('amount', 0) / 100.0
                    tx = {
                        'id': transaction_id,
                        'date': payment.get('updated_at', '').split('T')[0] if payment.get('updated_at') else datetime.now().strftime('%Y-%m-%d'),
                        'amount': amount,
                        'description': f"Square Payment: {transaction_id}"
                    }
                    app.logger.info(f"Square tx found: {tx is not None}")
                else:
                    app.logger.error(f"Failed to fetch Square transaction {transaction_id}: {response.status_code}")
                    errors.append(f'Failed to fetch Square transaction {transaction_id}: {response.status_code}')
                    continue
            except Exception as e:
                app.logger.error(f"Failed to fetch Square transaction {transaction_id}: {str(e)}")
                errors.append(f'Failed to fetch Square transaction {transaction_id}: {str(e)}')
                continue
        else:
            app.logger.error(f"Unknown source_type: {source_type} for transaction {transaction_id}")
            errors.append(f'Unknown source_type: {source_type} for transaction {transaction_id}')
            continue

        if not tx:
            app.logger.error(f"Transaction {transaction_id} not found in source {source_type}")
            errors.append(f'Transaction {transaction_id} not found in source {source_type}')
            continue

        amount = tx['amount']
        date_raw = tx['date']
        description = tx['description']

        date_str = parse_plaid_date(date_raw) or datetime.now().date().isoformat()
        amount_cents = int(round(abs(amount) * 100))
        is_expense = amount < 0  # Negative = expense (Square convention)

        # Get cash account for this source type
        cash_id = get_cash_account_id(source_type)
        if not cash_id:
            app.logger.error(f"No cash account for source {source_type}, tx {transaction_id}")
            errors.append(f'No cash account for source {source_type}, tx {transaction_id}')
            continue

        # Check if already processed
        app.logger.info(f"Checking for existing entry: source_type={source_type}, source_id={str(transaction_id)}")
        cursor.execute('SELECT id FROM journal_entries WHERE source_type = ? AND source_id = ?',
                       (source_type, str(transaction_id)))
        existing = cursor.fetchone()
        app.logger.info(f"Existing entry found: {existing is not None}")

        try:
            if existing:
                app.logger.info(f"Existing entry ID: {existing['id']}")
                if is_update:
                    app.logger.info(f"Updating entry {existing['id']}")
                    cursor.execute('DELETE FROM journal_lines WHERE journal_entry_id = ?', (existing['id'],))
                    cursor.execute('DELETE FROM journal_entries WHERE id = ?', (existing['id'],))
                    
                    if source_type in ['historic', 'bluevine']:
                        cursor.execute('UPDATE bank_transactions SET processed = 0 WHERE id = ?', (int(transaction_id),))
                    updated += 1
                    
                    cursor.execute('''
                        INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
                        VALUES (?, ?, ?, ?)
                    ''', (date_str, f"Bank transaction: {description}", source_type, str(transaction_id)))
                    entry_id = cursor.lastrowid
                    created += 1
                    app.logger.info(f"Created new entry {entry_id} for update")
                else:
                    app.logger.info(f"Using existing entry {existing['id']}")
                    cursor.execute('DELETE FROM journal_lines WHERE journal_entry_id = ?', (existing['id'],))
                    entry_id = existing['id']
                    created += 1
            else:
                app.logger.info(f"Creating new entry with source_type={source_type}, source_id={str(transaction_id)}")
                cursor.execute('''
                    INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
                    VALUES (?, ?, ?, ?)
                ''', (date_str, f"Bank transaction: {description}", source_type, str(transaction_id)))
                entry_id = cursor.lastrowid
                created += 1
                app.logger.info(f"Created new entry {entry_id}")

            # Insert the new lines
            app.logger.info(f"Inserting lines: is_expense={is_expense}, amount_cents={amount_cents}, target={target_account_id}, cash={cash_id}")
            if is_expense:
                cursor.execute('''
                    INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                    VALUES (?, ?, ?, ?)
                ''', (entry_id, target_account_id, amount_cents, 0))
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
                ''', (entry_id, target_account_id, 0, amount_cents))

            if source_type in ['historic', 'bluevine']:
                cursor.execute('UPDATE bank_transactions SET processed = 1 WHERE id = ?', (int(transaction_id),))

            conn.commit()
            processed += 1
            app.logger.info(f"Successfully processed transaction {transaction_id}")

        except Exception as e:
            conn.rollback()
            app.logger.error(f"Failed to process transaction {transaction_id}: {str(e)}")
            app.logger.error(traceback.format_exc())
            errors.append(f'Failed to process transaction {transaction_id}: {str(e)}')
            continue

    conn.close()
    
    app.logger.info(f"APPLY_MULTIPLE COMPLETE: processed={processed}, created={created}, updated={updated}, errors={len(errors)}")
    
    if errors:
        return jsonify({
            'status': 'success',
            'processed': processed,
            'created': created,
            'updated': updated,
            'errors': errors,
            'message': f'Processed {processed} transactions ({created} created, {updated} updated) with {len(errors)} error(s)'
        })
    else:
        return jsonify({
            'status': 'success',
            'processed': processed,
            'created': created,
            'updated': updated,
            'message': f'Processed {processed} transactions ({created} created, {updated} updated)'
        })

# ============================================================
# EXTERNAL BALANCE ENDPOINTS
# ============================================================

@app.route('/api/accounting/external/square/balance', methods=['GET'])
@login_required
@role_required(['admin'])
def get_square_balance():
    """Get current Square balance from Square API"""
    try:
        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        if not access_token:
            return jsonify({'status': 'error', 'error': 'SQUARE_ACCESS_TOKEN not configured'}), 500
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        # Get all payments and sum completed ones
        response = requests.get(
            'https://connect.squareup.com/v2/payments',
            headers=headers,
            params={'limit': 100},
            timeout=30
        )
        
        if response.status_code != 200:
            return jsonify({'status': 'error', 'error': f'Square API error: {response.status_code}'}), 500
        
        data = response.json()
        payments = data.get('payments', [])
        
        total_balance = 0
        for payment in payments:
            if payment.get('status') == 'COMPLETED':
                amount = payment.get('amount_money', {}).get('amount', 0)
                total_balance += amount / 100.0
        
        return jsonify({
            'status': 'success',
            'balance': total_balance
        })
        
    except Exception as e:
        app.logger.error(f"Error getting Square balance: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/accounting/external/plaid/balance', methods=['GET'])
@login_required
@role_required(['admin'])
def get_plaid_balance():
    """Get current balance from Plaid for FNBO or PayPal"""
    try:
        source = request.args.get('source', 'fnbo')
        
        # Get the appropriate access token
        conn = get_db()
        cursor = conn.cursor()
        
        if source == 'paypal':
            cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'plaid_paypal_access_token'")
        else:  # fnbo
            cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'plaid_access_token'")
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return jsonify({
                'status': 'error',
                'error': f'{source.capitalize()} not connected via Plaid'
            }), 400
        
        access_token = row['config_value']
        
        # Get balance from Plaid
        client = get_plaid_client()
        
        request = plaid.model.accounts_balance_get_request.AccountsBalanceGetRequest(
            access_token=access_token
        )
        
        response = client.accounts_balance_get(request)
        accounts = response['accounts']
        
        total_balance = 0
        for account in accounts:
            # Sum all account balances (checking, savings, etc.)
            balances = account.get('balances', {})
            current = balances.get('current', 0)
            if current:
                total_balance += current
        
        return jsonify({
            'status': 'success',
            'balance': total_balance
        })
        
    except Exception as e:
        app.logger.error(f"Error getting {source} balance: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ==================== GENRES ====================
 
@app.route('/api/formats', methods=['GET'])
def get_formats():
    """Get all formats"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, created_at FROM formats ORDER BY name')
    formats = cursor.fetchall()
    conn.close()
    return jsonify({'status': 'success', 'formats': [dict(f) for f in formats]})

@app.route('/api/formats', methods=['POST'])
@login_required
@role_required(['admin'])
def create_format():
    """Create a new format"""
    data = request.json
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'status': 'error', 'error': 'Name is required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('INSERT INTO formats (name) VALUES (?)', (name,))
        format_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'id': format_id, 'name': name})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'status': 'error', 'error': 'Format already exists'}), 400

@app.route('/api/formats/<int:format_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_format(format_id):
    """Update a format name"""
    data = request.json
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'status': 'error', 'error': 'Name is required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if in use
    cursor.execute('SELECT id FROM records WHERE format_id = ?', (format_id,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Format is in use by records and cannot be renamed'}), 400
    
    try:
        cursor.execute('UPDATE formats SET name = ? WHERE id = ?', (name, format_id))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': 'Format updated'})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'status': 'error', 'error': 'Format name already exists'}), 400

@app.route('/api/formats/<int:format_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_format(format_id):
    """Delete a format"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if in use
    cursor.execute('SELECT id FROM records WHERE format_id = ?', (format_id,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Format is in use by records and cannot be deleted'}), 400
    
    cursor.execute('DELETE FROM formats WHERE id = ?', (format_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Format deleted'})

# ==================== AREAS ====================

@app.route('/api/areas', methods=['GET'])
@login_required
@role_required(['admin'])
def get_areas():
    """Get all areas"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, created_at FROM areas ORDER BY name')
    areas = cursor.fetchall()
    conn.close()
    return jsonify({'status': 'success', 'areas': [dict(a) for a in areas]})


@app.route('/api/scan/apply-location', methods=['POST'])
@login_required
@role_required(['admin'])
def apply_scan_location():
    """
    Apply location to multiple records at once.
    Expects: {
        "record_ids": [1, 2, 3],
        "location_id": 5,
        "location_index_start": 1
    }
    """
    data = request.json
    record_ids = data.get('record_ids', [])
    location_id = data.get('location_id')
    location_index_start = data.get('location_index_start', 1)
    
    if not record_ids:
        return jsonify({'status': 'error', 'error': 'record_ids required'}), 400
    
    if not location_id:
        return jsonify({'status': 'error', 'error': 'location_id required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Verify location exists
    cursor.execute('SELECT id FROM locations WHERE id = ?', (location_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Invalid location_id'}), 400
    
    today = datetime.now().strftime('%Y-%m-%d')
    updated_count = 0
    
    for i, record_id in enumerate(record_ids):
        location_index = location_index_start + i
        cursor.execute('''
            UPDATE records 
            SET location_id = ?,
                location_index = ?,
                last_seen = ?
            WHERE id = ?
        ''', (location_id, location_index, today, record_id))
        updated_count += cursor.rowcount
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'status': 'success',
        'message': f'Updated {updated_count} records',
        'updated_count': updated_count
    })


@app.route('/api/records/filter', methods=['GET'])
@login_required
@role_required(['admin'])
def filter_records():
    """
    Filter records by location and date.
    Query params:
        last_seen_after: YYYY-MM-DD
        location_id: integer
        format_id: integer (optional)
        status_id: integer (optional)
        search: string (optional)
    """
    last_seen_after = request.args.get('last_seen_after')
    location_id = request.args.get('location_id', type=int)
    format_id = request.args.get('format_id', type=int)
    status_id = request.args.get('status_id', type=int)
    search = request.args.get('search', '').strip()
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = '''
        SELECT 
            r.*,
            s.status_name,
            cs.condition_name as sleeve_condition_name,
            cd.condition_name as disc_condition_name,
            f.name as format_name,
            l.name as location_name
        FROM records r
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        LEFT JOIN formats f ON r.format_id = f.id
        LEFT JOIN locations l ON r.location_id = l.id
        WHERE 1=1
    '''
    params = []
    
    if last_seen_after:
        query += ' AND date(r.last_seen) >= date(?)'
        params.append(last_seen_after)
    
    if location_id:
        query += ' AND r.location_id = ?'
        params.append(location_id)
    
    if format_id:
        query += ' AND r.format_id = ?'
        params.append(format_id)
    
    if status_id:
        query += ' AND r.status_id = ?'
        params.append(status_id)
    
    if search:
        query += ' AND (r.artist LIKE ? OR r.title LIKE ? OR r.barcode LIKE ? OR r.catalog_number LIKE ?)'
        search_term = f'%{search}%'
        params.extend([search_term, search_term, search_term, search_term])
    
    query += ' ORDER BY r.last_seen DESC, r.created_at DESC'
    
    cursor.execute(query, params)
    records = cursor.fetchall()
    conn.close()
    
    return jsonify({
        'status': 'success',
        'records': [dict(r) for r in records],
        'count': len(records)
    })


@app.route('/api/gift-card/create', methods=['POST'])
@login_required
def create_gift_card():
    """Create a new gift card / store credit"""
    try:
        data = request.json
        
        # Validate required fields
        code = data.get('code', '').upper().strip()
        card_value = float(data.get('card_value', 0))
        charge_amount = float(data.get('charge_amount', 0))
        recipient_name = data.get('recipient_name', '').strip()
        notes = data.get('notes', '').strip()
        payment_method = data.get('payment_method', 'cash')
        
        if not code:
            return jsonify({'status': 'error', 'error': 'Code is required'}), 400
        
        if card_value <= 0:
            return jsonify({'status': 'error', 'error': 'Card value must be greater than 0'}), 400
        
        if charge_amount < 0:
            return jsonify({'status': 'error', 'error': 'Charge amount cannot be negative'}), 400
        
        if not recipient_name:
            return jsonify({'status': 'error', 'error': 'Recipient name is required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if code already exists
        cursor.execute('SELECT id FROM journal_entries WHERE source_type = "gift_card" AND source_id = ?', (code,))
        if cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Code already exists'}), 400
        
        # Get account IDs
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))  # Store Credit Liability
        liability = cursor.fetchone()
        if not liability:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Store Credit Liability account (2015) not found'}), 500
        
        # Get payment account based on payment method
        account_map = {
            'cash': '1015',
            'square': '1030',
            'card': '1015'
        }
        payment_account_code = account_map.get(payment_method, '1015')
        cursor.execute('SELECT id FROM accounts WHERE code = ?', (payment_account_code,))
        payment_account = cursor.fetchone()
        if not payment_account:
            conn.close()
            return jsonify({'status': 'error', 'error': f'Payment account {payment_account_code} not found'}), 500
        
        # Get promotional expense account (6010)
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('6010',))
        promo_account = cursor.fetchone()
        
        card_value_cents = int(round(card_value * 100))
        charge_amount_cents = int(round(charge_amount * 100))
        
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Build description
        description = f"{recipient_name} | {code} | ${card_value:.2f}"
        if notes:
            description += f" | {notes}"
        
        # Create journal entry
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (today, description, 'gift_card', code))
        entry_id = cursor.lastrowid
        
        # Debit: Payment account (what customer paid)
        if charge_amount_cents > 0:
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, payment_account['id'], charge_amount_cents, 0))
        
        # If charge_amount < card_value, debit the difference to promotional expense
        diff_cents = card_value_cents - charge_amount_cents
        if diff_cents > 0 and promo_account:
            cursor.execute('''
                INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                VALUES (?, ?, ?, ?)
            ''', (entry_id, promo_account['id'], diff_cents, 0))
        
        # If charge_amount > card_value, credit the excess to revenue
        if charge_amount_cents > card_value_cents:
            excess_cents = charge_amount_cents - card_value_cents
            cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4000',))
            revenue = cursor.fetchone()
            if revenue:
                cursor.execute('''
                    INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
                    VALUES (?, ?, ?, ?)
                ''', (entry_id, revenue['id'], 0, excess_cents))
        
        # Credit: Store Credit Liability (what the card is worth)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, liability['id'], 0, card_value_cents))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Gift card created successfully',
            'entry_id': entry_id,
            'code': code,
            'card_value': card_value,
            'charge_amount': charge_amount,
            'balance': card_value
        })
        
    except Exception as e:
        app.logger.error(f"Error creating gift card: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/gift-card/balance/<code>', methods=['GET'])
def get_gift_card_balance(code):
    """Get current balance for a gift card"""
    try:
        code = code.upper().strip()
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if card exists
        cursor.execute('SELECT id FROM journal_entries WHERE source_type = "gift_card" AND source_id = ?', (code,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Gift card not found'}), 404
        
        # Get liability account ID
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        liability = cursor.fetchone()
        if not liability:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Store Credit Liability account (2015) not found'}), 500
        
        # Calculate balance: sum of all credit - debit for this code on liability account
        cursor.execute('''
            SELECT 
                COALESCE(SUM(
                    CASE 
                        WHEN jl.credit_amount > 0 THEN jl.credit_amount
                        WHEN jl.debit_amount > 0 THEN -jl.debit_amount
                        ELSE 0
                    END
                ), 0) / 100.0 as balance
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE je.source_id = ?
              AND jl.account_id = ?
        ''', (code, liability['id']))
        
        result = cursor.fetchone()
        conn.close()
        
        balance = float(result['balance']) if result else 0
        
        return jsonify({
            'status': 'success',
            'code': code,
            'balance': balance
        })
        
    except Exception as e:
        app.logger.error(f"Error getting gift card balance: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/gift-card/redeem', methods=['POST'])
@login_required
def redeem_gift_card():
    """Redeem a gift card at checkout - applies full balance to purchase"""
    try:
        data = request.json
        
        code = data.get('code', '').upper().strip()
        purchase_amount = float(data.get('purchase_amount', 0))
        order_id = data.get('order_id', '')
        
        if not code:
            return jsonify({'status': 'error', 'error': 'Code is required'}), 400
        
        if purchase_amount <= 0:
            return jsonify({'status': 'error', 'error': 'Purchase amount must be greater than 0'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if card exists
        cursor.execute('SELECT id FROM journal_entries WHERE source_type = "gift_card" AND source_id = ?', (code,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Gift card not found'}), 404
        
        # Get liability account ID
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        liability = cursor.fetchone()
        if not liability:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Store Credit Liability account (2015) not found'}), 500
        
        # Calculate current balance
        cursor.execute('''
            SELECT 
                COALESCE(SUM(
                    CASE 
                        WHEN jl.credit_amount > 0 THEN jl.credit_amount
                        WHEN jl.debit_amount > 0 THEN -jl.debit_amount
                        ELSE 0
                    END
                ), 0) / 100.0 as balance
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE je.source_id = ?
              AND jl.account_id = ?
        ''', (code, liability['id']))
        
        result = cursor.fetchone()
        balance = float(result['balance']) if result else 0
        
        if balance <= 0:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Gift card has no balance'}), 400
        
        # Amount to apply is the smaller of balance and purchase amount
        apply_amount = min(balance, purchase_amount)
        
        # Get revenue account
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('4000',))
        revenue = cursor.fetchone()
        if not revenue:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Revenue account (4000) not found'}), 500
        
        apply_amount_cents = int(round(apply_amount * 100))
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Create redemption journal entry
        description = f"{code} | REDEEM | ${apply_amount:.2f}"
        if order_id:
            description += f" | Order #{order_id}"
        
        cursor.execute('''
            INSERT INTO journal_entries (transaction_date, description, source_type, source_id)
            VALUES (?, ?, ?, ?)
        ''', (today, description, 'gift_card_redeem', code))
        entry_id = cursor.lastrowid
        
        # Debit: Store Credit Liability (reduce what we owe)
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, liability['id'], apply_amount_cents, 0))
        
        # Credit: Revenue
        cursor.execute('''
            INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
            VALUES (?, ?, ?, ?)
        ''', (entry_id, revenue['id'], 0, apply_amount_cents))
        
        conn.commit()
        
        # Get new balance
        new_balance = balance - apply_amount
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'${apply_amount:.2f} applied from gift card',
            'code': code,
            'applied_amount': apply_amount,
            'new_balance': new_balance,
            'remaining_purchase_amount': purchase_amount - apply_amount,
            'entry_id': entry_id
        })
        
    except Exception as e:
        app.logger.error(f"Error redeeming gift card: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/gift-card/print', methods=['POST'])
@login_required
@role_required(['admin'])
def print_gift_card_barcodes():
    """Generate barcodes for printing - NO database records created"""
    try:
        data = request.json
        count = int(data.get('count', 10))
        
        if count < 1 or count > 100:
            return jsonify({'status': 'error', 'error': 'Count must be between 1 and 100'}), 400
        
        import random
        import string
        
        codes = []
        for _ in range(count):
            # Generate unique code
            while True:
                random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
                code = f"GC-{random_part}"
                
                # Check if code already exists in database
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute('SELECT id FROM journal_entries WHERE source_type = "gift_card" AND source_id = ?', (code,))
                exists = cursor.fetchone()
                conn.close()
                
                if not exists:
                    codes.append(code)
                    break
        
        # Return codes for rendering barcodes on frontend
        return jsonify({
            'status': 'success',
            'codes': codes,
            'count': len(codes)
        })
        
    except Exception as e:
        app.logger.error(f"Error printing barcodes: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/gift-card/list', methods=['GET'])
@login_required
@role_required(['admin'])
def list_gift_cards():
    """List all gift cards with their current balances"""
    try:
        search = request.args.get('search', '').strip()
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Get liability account ID
        cursor.execute('SELECT id FROM accounts WHERE code = ?', ('2015',))
        liability = cursor.fetchone()
        if not liability:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Store Credit Liability account (2015) not found'}), 500
        
        # Get all gift card entries
        query = '''
            SELECT DISTINCT 
                je.source_id as code,
                je.description,
                je.transaction_date as created_at,
                je.id as entry_id
            FROM journal_entries je
            WHERE je.source_type = 'gift_card'
        '''
        params = []
        
        if search:
            query += ' AND (je.source_id LIKE ? OR je.description LIKE ?)'
            search_term = f'%{search.upper()}%'
            params.extend([search_term, search_term])
        
        query += ' ORDER BY je.transaction_date DESC'
        
        cursor.execute(query, params)
        entries = cursor.fetchall()
        
        result = []
        for entry in entries:
            code = entry['code']
            
            # Calculate current balance
            cursor.execute('''
                SELECT 
                    COALESCE(SUM(
                        CASE 
                            WHEN jl.credit_amount > 0 THEN jl.credit_amount
                            WHEN jl.debit_amount > 0 THEN -jl.debit_amount
                            ELSE 0
                        END
                    ), 0) / 100.0 as balance
                FROM journal_lines jl
                JOIN journal_entries je ON jl.journal_entry_id = je.id
                WHERE je.source_id = ?
                  AND jl.account_id = ?
            ''', (code, liability['id']))
            
            balance_result = cursor.fetchone()
            balance = float(balance_result['balance']) if balance_result else 0
            
            # Extract recipient name from description
            description = entry['description'] or ''
            recipient = 'Unknown'
            if ' | ' in description:
                recipient = description.split(' | ')[0]
            
            # Get last redemption date
            cursor.execute('''
                SELECT transaction_date 
                FROM journal_entries 
                WHERE source_type = 'gift_card_redeem' 
                  AND source_id = ?
                ORDER BY transaction_date DESC 
                LIMIT 1
            ''', (code,))
            last_used = cursor.fetchone()
            
            result.append({
                'code': code,
                'recipient_name': recipient,
                'balance': balance,
                'created_at': entry['created_at'],
                'last_used': last_used['transaction_date'] if last_used else None,
                'entry_id': entry['entry_id']
            })
        
        # Filter out cards with $0 balance if requested
        show_empty = request.args.get('show_empty', 'true').lower() == 'true'
        if not show_empty:
            result = [r for r in result if r['balance'] > 0]
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'gift_cards': result,
            'count': len(result)
        })
        
    except Exception as e:
        app.logger.error(f"Error listing gift cards: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== FEEDBACK NOTIFICATION ENDPOINTS ====================

@app.route('/api/feedback/unread-count', methods=['GET'])
@login_required
@role_required(['admin'])
def get_unread_feedback_count():
    """Get count of unread feedback (notified = 0)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT COUNT(*) as count 
            FROM feedback 
            WHERE notified = 0 OR notified IS NULL
        ''')
        
        result = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'count': result['count'] if result else 0
        })
        
    except Exception as e:
        app.logger.error(f"Error getting unread feedback count: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/feedback/unread', methods=['GET'])
@login_required
@role_required(['admin'])
def get_unread_feedback():
    """Get all unread feedback (notified = 0)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                id,
                type_of_feedback,
                content,
                contact_info,
                event_name,
                status,
                notified,
                created_at
            FROM feedback
            WHERE notified = 0 OR notified IS NULL
            ORDER BY created_at DESC
            LIMIT 50
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        feedback_list = []
        for row in rows:
            feedback_list.append({
                'id': row['id'],
                'type_of_feedback': row['type_of_feedback'],
                'content': row['content'],
                'contact_info': row['contact_info'],
                'event_name': row['event_name'],
                'status': row['status'],
                'notified': bool(row['notified']) if row['notified'] is not None else False,
                'created_at': row['created_at'],
                'email': row['contact_info'] or 'Anonymous'
            })
        
        return jsonify({
            'status': 'success',
            'notifications': feedback_list,
            'count': len(feedback_list)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting unread feedback: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/feedback/<int:feedback_id>/mark-read', methods=['POST'])
@login_required
@role_required(['admin'])
def mark_feedback_read(feedback_id):
    """Mark feedback as read (set notified = 1)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE feedback 
            SET notified = 1 
            WHERE id = ?
        ''', (feedback_id,))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Feedback not found'}), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Feedback #{feedback_id} marked as read'
        })
        
    except Exception as e:
        app.logger.error(f"Error marking feedback read: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500
 
 


@app.route('/api/orders/<int:order_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def get_order_details(order_id):
    """Get detailed information for a specific order including items"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get order
        cursor.execute('''
            SELECT 
                id,
                order_number,
                customer_name,
                customer_email,
                customer_phone,
                shipping_address,
                notes,
                status,
                notified,
                created_at,
                updated_at
            FROM record_orders
            WHERE id = ?
        ''', (order_id,))
        
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Order not found'}), 404
        
        # Get order items
        cursor.execute('''
            SELECT 
                oi.id,
                oi.record_id,
                oi.quantity,
                oi.price_at_time,
                r.artist,
                r.title,
                r.barcode,
                r.image_url
            FROM order_items oi
            LEFT JOIN records r ON oi.record_id = r.id
            WHERE oi.order_id = ?
        ''', (order_id,))
        
        items = cursor.fetchall()
        conn.close()
        
        items_list = []
        for item in items:
            items_list.append({
                'id': item['id'],
                'record_id': item['record_id'],
                'quantity': item['quantity'],
                'price_at_time': float(item['price_at_time']) if item['price_at_time'] else 0,
                'artist': item['artist'],
                'title': item['title'],
                'barcode': item['barcode'],
                'image_url': item['image_url']
            })
        
        return jsonify({
            'status': 'success',
            'order': {
                'id': order['id'],
                'order_number': order['order_number'],
                'customer_name': order['customer_name'],
                'customer_email': order['customer_email'],
                'customer_phone': order['customer_phone'],
                'shipping_address': order['shipping_address'],
                'notes': order['notes'],
                'status': order['status'],
                'notified': bool(order['notified']) if order['notified'] is not None else False,
                'created_at': order['created_at'],
                'updated_at': order['updated_at'],
                'items': items_list,
                'item_count': len(items_list)
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error getting order details: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/orders', methods=['POST'])
def create_order():
    """Create a new order (public endpoint)"""
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ['customer_name']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({'status': 'error', 'error': f'{field} is required'}), 400
        
        customer_name = data['customer_name'].strip()
        customer_email = data.get('customer_email', '').strip()
        customer_phone = data.get('customer_phone', '').strip()
        shipping_address = data.get('shipping_address', '').strip()
        notes = data.get('notes', '').strip()
        items = data.get('items', [])
        
        if not items or len(items) == 0:
            return jsonify({'status': 'error', 'error': 'At least one item is required'}), 400
        
        # Generate order number
        date_str = datetime.now().strftime('%Y%m%d')
        random_chars = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        order_number = f"ORD-{date_str}-{random_chars}"
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Start transaction
        cursor.execute('BEGIN TRANSACTION')
        
        # Insert order
        cursor.execute('''
            INSERT INTO record_orders (
                order_number,
                customer_name,
                customer_email,
                customer_phone,
                shipping_address,
                notes,
                status,
                notified,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ''', (order_number, customer_name, customer_email, customer_phone, shipping_address, notes))
        
        order_id = cursor.lastrowid
        
        # Insert order items
        total_amount = 0
        for item in items:
            record_id = item.get('record_id')
            quantity = item.get('quantity', 1)
            price_at_time = item.get('price_at_time', 0)
            
            if not record_id:
                conn.rollback()
                conn.close()
                return jsonify({'status': 'error', 'error': 'record_id is required for each item'}), 400
            
            # Get record price if not provided
            if not price_at_time:
                cursor.execute('SELECT store_price FROM records WHERE id = ?', (record_id,))
                record = cursor.fetchone()
                if record:
                    price_at_time = record['store_price']
                else:
                    conn.rollback()
                    conn.close()
                    return jsonify({'status': 'error', 'error': f'Record #{record_id} not found'}), 404
            
            cursor.execute('''
                INSERT INTO order_items (order_id, record_id, quantity, price_at_time)
                VALUES (?, ?, ?, ?)
            ''', (order_id, record_id, quantity, price_at_time))
            
            total_amount += price_at_time * quantity
        
        conn.commit()
        conn.close()
        
        # Send admin notification (send email to admins)
        try:
            admin_conn = get_db()
            admin_cursor = admin_conn.cursor()
            admin_cursor.execute('SELECT email FROM users WHERE role = "admin" AND email IS NOT NULL')
            admins = admin_cursor.fetchall()
            admin_conn.close()
            
            for admin in admins:
                subject = f"🛒 New Order Received - {order_number}"
                body = f"""
New order received!

Order Number: {order_number}
Customer: {customer_name}
Email: {customer_email or 'Not provided'}
Phone: {customer_phone or 'Not provided'}

Items:
"""
                for item in items:
                    body += f"  - Record #{item.get('record_id')} x {item.get('quantity', 1)} @ ${item.get('price_at_time', 0):.2f}\n"
                
                body += f"""
Total: ${total_amount:.2f}
Shipping Address: {shipping_address or 'Not provided'}
Notes: {notes or 'None'}

View in Admin Panel: https://www.pigstylemusic.com/admin#record-orders
                """
                send_email(admin['email'], subject, body, from_name="PigStyle Music Orders")
        except Exception as e:
            app.logger.error(f"Error sending order notification email: {str(e)}")
        
        return jsonify({
            'status': 'success',
            'message': 'Order created successfully',
            'order_id': order_id,
            'order_number': order_number,
            'total_amount': total_amount
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error creating order: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

  

 



 
 

# ==================== ORDER NOTIFICATION HELPER ====================

def send_order_notification(email, artist, title, action='new'):
    """Send admin notification for new order request."""
    try:
        admin_conn = get_db()
        admin_cursor = admin_conn.cursor()
        admin_cursor.execute('SELECT email FROM users WHERE role = "admin" AND email IS NOT NULL')
        admins = admin_cursor.fetchall()
        admin_conn.close()
        
        for admin in admins:
            subject = f"📦 New Order Request: {artist} - {title}"
            body = f"""
New order request!

Email: {email}
Artist: {artist}
Title: {title}
Action: {action}

View in Admin Panel:
https://www.pigstylemusic.com/admin#record-orders
            """
            send_email(admin['email'], subject, body, from_name="PigStyle Music Orders")
    except Exception as e:
        app.logger.error(f"Error sending order notification email: {str(e)}")

def send_order_notification(email, artist, title, action='new'):
    """Send admin notification for new order request."""
    try:
        admin_conn = get_db()
        admin_cursor = admin_conn.cursor()
        admin_cursor.execute('SELECT email FROM users WHERE role = "admin" AND email IS NOT NULL')
        admins = admin_cursor.fetchall()
        admin_conn.close()
        
        for admin in admins:
            subject = f"📦 New Order Request: {artist} - {title}"
            body = f"""
New order request!

Email: {email}
Artist: {artist}
Title: {title}
Action: {action}

View in Admin Panel:
https://www.pigstylemusic.com/admin#email-subscriptions
            """
            send_email(admin['email'], subject, body, from_name="PigStyle Music Orders")
    except Exception as e:
        app.logger.error(f"Error sending order notification email: {str(e)}")


# ==================== SUBSCRIPTION ENDPOINT (NO EMAIL) ====================

@app.route('/api/subscribe', methods=['POST'])
def subscribe():
    """Subscribe a user to email notifications for specific artists/titles"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip().lower() if data.get('email') else ''
        artist = data.get('artist', '').strip() if data.get('artist') else ''
        title = data.get('title', '').strip() if data.get('title') else ''
        
        # Validate email
        if not email or '@' not in email or '.' not in email:
            return jsonify({'status': 'error', 'error': 'Valid email address required'}), 400
        
        # Artist is required
        if not artist:
            return jsonify({'status': 'error', 'error': 'Artist name is required'}), 400
        
        # Title is optional for alerts
        title_value = title if title else None
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if subscription already exists
        if title_value:
            cursor.execute('''
                SELECT id, is_active, notified 
                FROM email_subscriptions 
                WHERE email = ? AND artist = ? AND title = ?
            ''', (email, artist, title_value))
        else:
            cursor.execute('''
                SELECT id, is_active, notified 
                FROM email_subscriptions 
                WHERE email = ? AND artist = ? AND (title IS NULL OR title = '')
            ''', (email, artist))
        
        existing = cursor.fetchone()
        
        if existing:
            # If inactive, reactivate it
            if not existing['is_active']:
                cursor.execute('''
                    UPDATE email_subscriptions 
                    SET is_active = 1, notified = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (existing['id'],))
                conn.commit()
                conn.close()
                return jsonify({
                    'status': 'success',
                    'message': 'Subscription reactivated',
                    'already_subscribed': False,
                    'subscription_id': existing['id']
                }), 200
            
            # If active and already notified, reset
            if existing['notified'] == 1:
                cursor.execute('''
                    UPDATE email_subscriptions 
                    SET notified = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (existing['id'],))
                conn.commit()
                conn.close()
                return jsonify({
                    'status': 'success',
                    'message': 'Subscription re-notified',
                    'already_subscribed': False,
                    'subscription_id': existing['id']
                }), 200
            
            conn.close()
            return jsonify({
                'status': 'success',
                'message': 'You are already subscribed to these notifications',
                'already_subscribed': True,
                'subscription_id': existing['id']
            }), 200
        
        # Insert new subscription
        cursor.execute('''
            INSERT INTO email_subscriptions (
                email, 
                artist, 
                title, 
                is_active, 
                notified,
                created_at
            ) VALUES (?, ?, ?, 1, 0, CURRENT_TIMESTAMP)
        ''', (email, artist, title_value))
        
        subscription_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        app.logger.info(f"New subscription: {email} - Artist: {artist}, Title: {title_value or 'Any'}")
        
        return jsonify({
            'status': 'success',
            'message': 'Subscription created successfully',
            'subscription_id': subscription_id
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error creating subscription: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ==================== RECORD ORDERS ENDPOINT (NO EMAIL) ====================

@app.route('/api/record-orders', methods=['POST'])
def create_record_order():
    """
    Create a new record order request.
    Uses the separate record_orders table.
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip().lower() if data.get('email') else ''
        artist = data.get('artist', '').strip() if data.get('artist') else ''
        title = data.get('title', '').strip() if data.get('title') else ''
        
        # Validate email
        if not email or '@' not in email or '.' not in email:
            return jsonify({'status': 'error', 'error': 'Valid email address required'}), 400
        
        # Validate artist
        if not artist:
            return jsonify({'status': 'error', 'error': 'Artist name is required'}), 400
        
        # Validate title
        if not title:
            return jsonify({'status': 'error', 'error': 'Record title is required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if this order already exists
        cursor.execute('''
            SELECT id, status, notified 
            FROM record_orders 
            WHERE email = ? AND artist = ? AND title = ?
        ''', (email, artist, title))
        
        existing = cursor.fetchone()
        
        if existing:
            # If cancelled or completed, reactivate it
            if existing['status'] in ('cancelled', 'completed'):
                cursor.execute('''
                    UPDATE record_orders 
                    SET status = 'pending', notified = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (existing['id'],))
                conn.commit()
                conn.close()
                return jsonify({
                    'status': 'success',
                    'message': 'Order request reactivated',
                    'order_id': existing['id'],
                    'already_exists': True
                }), 200
            
            # If pending and already notified, reset notified
            if existing['notified'] == 1:
                cursor.execute('''
                    UPDATE record_orders 
                    SET notified = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (existing['id'],))
                conn.commit()
                conn.close()
                return jsonify({
                    'status': 'success',
                    'message': 'Order request re-notified',
                    'order_id': existing['id'],
                    'already_exists': True
                }), 200
            
            conn.close()
            return jsonify({
                'status': 'success',
                'message': 'You already have an order request for this record',
                'order_id': existing['id'],
                'already_exists': True
            }), 200
        
        # Insert new order request
        cursor.execute('''
            INSERT INTO record_orders (
                email, 
                artist, 
                title, 
                status,
                notified,
                created_at
            ) VALUES (?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP)
        ''', (email, artist, title))
        
        order_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        app.logger.info(f"New order request: {email} - Artist: {artist}, Title: {title}")
        
        return jsonify({
            'status': 'success',
            'message': 'Order request placed successfully',
            'order_id': order_id
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error creating order request: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500

 


@app.route('/api/record-orders', methods=['GET'])
@login_required
@role_required(['admin'])
def get_all_orders():
    """Get all orders with filtering"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        status = request.args.get('status', 'all')
        search = request.args.get('search', '').strip()
        
        offset = (page - 1) * per_page
        
        conn = get_db()
        cursor = conn.cursor()
        
        query = '''
            SELECT 
                id,
                email,
                artist,
                title,
                status,
                notified,
                created_at,
                updated_at
            FROM record_orders
            WHERE 1=1
        '''
        params = []
        
        if status != 'all':
            query += ' AND status = ?'
            params.append(status)
        
        if search:
            query += ''' AND (
                email LIKE ? OR 
                artist LIKE ? OR 
                title LIKE ? OR 
                status LIKE ?
            )'''
            search_term = f'%{search}%'
            params.extend([search_term, search_term, search_term, search_term])
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
        params.extend([per_page, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        # Get total count
        count_query = 'SELECT COUNT(*) as total FROM record_orders WHERE 1=1'
        count_params = []
        if status != 'all':
            count_query += ' AND status = ?'
            count_params.append(status)
        if search:
            count_query += ''' AND (
                email LIKE ? OR 
                artist LIKE ? OR 
                title LIKE ? OR 
                status LIKE ?
            )'''
            count_params.extend([search_term, search_term, search_term, search_term])
        
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['total']
        conn.close()
        
        orders_list = []
        for row in rows:
            orders_list.append({
                'id': row['id'],
                'email': row['email'],
                'artist': row['artist'],
                'title': row['title'],
                'status': row['status'],
                'notified': bool(row['notified']) if row['notified'] is not None else False,
                'created_at': row['created_at'],
                'updated_at': row['updated_at']
            })
        
        return jsonify({
            'status': 'success',
            'orders': orders_list,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page if total > 0 else 1
        })
        
    except Exception as e:
        app.logger.error(f"Error getting orders: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/record-orders/<int:order_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_order_status(order_id):
    """Update order status"""
    try:
        data = request.json
        new_status = data.get('status')
        
        if not new_status:
            return jsonify({'status': 'error', 'error': 'Status is required'}), 400
        
        valid_statuses = ['pending', 'processing', 'ordered', 'received', 'cancelled']
        if new_status not in valid_statuses:
            return jsonify({'status': 'error', 'error': f'Invalid status. Must be one of: {valid_statuses}'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE record_orders 
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (new_status, order_id))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Order not found'}), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Order status updated to {new_status}'
        })
        
    except Exception as e:
        app.logger.error(f"Error updating order status: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/record-orders/<int:order_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_order(order_id):
    """Delete an order"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM record_orders WHERE id = ?', (order_id,))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'status': 'error', 'error': 'Order not found'}), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Order #{order_id} deleted successfully'
        })
        
    except Exception as e:
        app.logger.error(f"Error deleting order: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500
 
@app.route('/api/orders/unread', methods=['GET'])
@login_required
@role_required(['admin'])
def get_unread_orders():
    """Get unread orders (notified = 0) for notification bell"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, order_number, customer_name, total, created_at
            FROM orders
            WHERE notified = 0 OR notified IS NULL
            ORDER BY created_at DESC
            LIMIT 50
        ''')
        orders = cursor.fetchall()
        conn.close()
        
        orders_list = []
        for order in orders:
            orders_list.append({
                'id': order['id'],
                'order_number': order['order_number'],
                'customer_name': order['customer_name'],
                'total': float(order['total']) if order['total'] else 0,
                'created_at': order['created_at']
            })
        
        return jsonify({
            'status': 'success',
            'orders': orders_list,
            'count': len(orders_list)
        })
    except Exception as e:
        app.logger.error(f"Error getting unread orders: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/orders/<order_id>/mark-read', methods=['POST'])
@login_required
@role_required(['admin'])
def mark_order_read(order_id):
    """Mark an order as read (set notified = 1)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if order exists
        cursor.execute('SELECT id FROM orders WHERE id = ?', (order_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Order not found'}), 404
        
        cursor.execute('UPDATE orders SET notified = 1 WHERE id = ?', (order_id,))
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Order {order_id} marked as read'
        })
    except Exception as e:
        app.logger.error(f"Error marking order read: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

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
                    total = ?, tax = ?, updated_at = CURRENT_TIMESTAMP, notified = 0
                    WHERE id = ? AND payment_status = 'pending'
                ''', (transaction_id, square_total, square_tax, order_id))
            else:
                cursor.execute('''
                    UPDATE orders SET square_payment_id = ?, payment_status = 'paid', order_status = 'confirmed',
                    updated_at = CURRENT_TIMESTAMP, notified = 0
                    WHERE id = ? AND payment_status = 'pending'
                ''', (transaction_id, order_id))
            
            # Get record IDs from order items
            cursor.execute('SELECT record_id FROM order_items WHERE order_id = ?', (order_id,))
            record_ids = [row['record_id'] for row in cursor.fetchall()]
            
            if record_ids:
                placeholders = ','.join('?' for _ in record_ids)
                # CHANGED: status_id = 5 (Sold Online) instead of 3
                cursor.execute(f'UPDATE records SET status_id = 5, date_sold = CURRENT_DATE WHERE id IN ({placeholders})', record_ids)
            
            # --- AUTO-ACCOUNTING ---
            try:
                cursor.execute('SELECT * FROM orders WHERE id = ?', (order_id,))
                order_row = cursor.fetchone()
                if order_row:
                    process_order_for_accounting(order_row, conn, cursor)
                    app.logger.info(f"✅ Auto-accounting created for order {order_id}")
            except Exception as e:
                app.logger.error(f"Auto-accounting failed for order {order_id}: {str(e)}")
                # Don't rollback - order still completes
            
            conn.commit()
            
            # Send order confirmation email
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
 
   
@app.route('/api/record-orders/unread', methods=['GET'])
@login_required
@role_required(['admin'])
def get_unread_record_orders():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, email, artist, title, status, created_at
        FROM record_orders
        WHERE notified = 0 OR notified IS NULL
        ORDER BY created_at DESC
        LIMIT 50
    ''')
    rows = cursor.fetchall()
    conn.close()
    return jsonify({
        'status': 'success',
        'notifications': [dict(row) for row in rows],
        'count': len(rows)
    })

@app.route('/api/record-orders/unread-count', methods=['GET'])
@login_required
@role_required(['admin'])
def get_unread_record_orders_count():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) as count FROM record_orders WHERE notified = 0 OR notified IS NULL')
    row = cursor.fetchone()
    conn.close()
    return jsonify({'status': 'success', 'count': row['count'] if row else 0})

@app.route('/api/record-orders/<int:order_id>/mark-read', methods=['POST'])
@login_required
@role_required(['admin'])
def mark_record_order_read(order_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE record_orders SET notified = 1 WHERE id = ?', (order_id,))
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({'status': 'error', 'error': 'Order not found'}), 404
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/record-orders/mark-all-read', methods=['POST'])
@login_required
@role_required(['admin'])
def mark_all_record_orders_read():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE record_orders SET notified = 1 WHERE notified = 0 OR notified IS NULL')
    updated = cursor.rowcount
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'updated': updated})

@app.route('/api/orders/unread-count', methods=['GET'])
@login_required
@role_required(['admin'])
def get_unread_orders_count():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) as count FROM orders WHERE notified = 0 OR notified IS NULL')
    row = cursor.fetchone()
    conn.close()
    return jsonify({'status': 'success', 'count': row['count'] if row else 0})

@app.route('/api/feedback/mark-all-read', methods=['POST'])
@login_required
@role_required(['admin'])
def mark_all_feedback_read():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE feedback SET notified = 1 WHERE notified = 0 OR notified IS NULL')
    updated = cursor.rowcount
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'updated': updated})

@app.route('/api/subscriptions/mark-all-read', methods=['POST'])
@login_required
@role_required(['admin'])
def mark_all_subscriptions_read():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE email_subscriptions SET notified = 1 WHERE notified = 0 AND is_active = 1')
    updated = cursor.rowcount
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'updated': updated})

@app.route('/api/orders/mark-all-read', methods=['POST'])
@login_required
@role_required(['admin'])
def mark_all_orders_read():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE orders SET notified = 1 WHERE notified = 0 OR notified IS NULL')
    updated = cursor.rowcount
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'updated': updated})


@app.route('/api/records/location-counts', methods=['GET'])
def get_records_location_counts():
    """
    Get count of records by location, based on last_seen after cutoff.
    Uses LEFT JOIN to include all locations (even those with 0 recent scans).
    Filters by LAST_SEEN_CUTOFF_DATE from app_config.
    """
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Fetch cutoff date from app_config
        cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'LAST_SEEN_CUTOFF_DATE'")
        row = cursor.fetchone()
        cutoff_date = row['config_value'] if row else None

        # Build query – LEFT JOIN to include all locations
        query = '''
            SELECT l.name AS location_name, COUNT(r.id) AS record_count
            FROM locations l
            LEFT JOIN records r ON r.location_id = l.id
        '''
        params = []

        if cutoff_date:
            # Move filter into the ON clause to keep all locations
            query += " AND date(r.last_seen) >= date(?)"
            params.append(cutoff_date)

        query += ' GROUP BY l.id, l.name ORDER BY l.name'

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        result = [
            {'location_name': row['location_name'], 'record_count': row['record_count']}
            for row in rows
        ]

        return jsonify({
            'status': 'success',
            'data': result,
            'count': len(result),
            'cutoff_applied': cutoff_date is not None
        })

    except Exception as e:
        app.logger.error(f"Error getting location counts: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/events', methods=['GET'])
def get_events():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, title, description, event_date, image_url, rsvp_count,
               repeat_type, repeat_interval, repeat_end_date,
               repeat_day_of_week, repeat_week_of_month, is_recurring
        FROM events
        WHERE event_date >= date('now')
        ORDER BY event_date ASC
    ''')
    rows = cursor.fetchall()
    conn.close()
    events = [dict(row) for row in rows]
    return jsonify({'status': 'success', 'events': events})


@app.route('/api/events/<int:event_id>/rsvp', methods=['POST'])
def rsvp_event(event_id):
    """Public RSVP - increments RSVP count for an event."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if event exists
        cursor.execute('SELECT id FROM events WHERE id = ?', (event_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Event not found'}), 404
        
        # Increment RSVP count
        cursor.execute('''
            UPDATE events 
            SET rsvp_count = COALESCE(rsvp_count, 0) + 1 
            WHERE id = ?
        ''', (event_id,))
        conn.commit()
        
        # Get updated count
        cursor.execute('SELECT rsvp_count FROM events WHERE id = ?', (event_id,))
        row = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'RSVP recorded successfully',
            'rsvp_count': row['rsvp_count'] if row else 0
        })
        
    except Exception as e:
        app.logger.error(f"Error processing RSVP: {str(e)}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ---------- EVENTS CRUD ----------

# GET single event (for editing)
@app.route('/api/events/<int:event_id>', methods=['GET'])
def get_event(event_id):
    conn = get_db()
    event = conn.execute('SELECT * FROM events WHERE id = ?', (event_id,)).fetchone()
    conn.close()
    if event:
        return jsonify({'status': 'success', 'event': dict(event)})
    return jsonify({'status': 'error', 'error': 'Event not found'}), 404

# POST create event
@app.route('/api/events', methods=['POST'])
def create_event():
    data = request.json
    required = ['title', 'event_date']
    for field in required:
        if field not in data:
            return jsonify({'status': 'error', 'error': f'Missing field: {field}'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO events (
            title, description, event_date, image_url,
            repeat_type, repeat_interval, repeat_end_date,
            repeat_day_of_week, repeat_week_of_month, is_recurring
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['title'],
        data.get('description', ''),
        data['event_date'],
        data.get('image_url', ''),
        data.get('repeat_type', 'none'),
        data.get('repeat_interval', 1),
        data.get('repeat_end_date'),
        data.get('repeat_day_of_week'),
        data.get('repeat_week_of_month'),
        data.get('is_recurring', 0)
    ))
    conn.commit()
    event_id = cursor.lastrowid
    conn.close()
    return jsonify({'status': 'success', 'id': event_id}), 201

# PUT update event
@app.route('/api/events/<int:event_id>', methods=['PUT'])
def update_event(event_id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM events WHERE id = ?', (event_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Event not found'}), 404

    cursor.execute('''
        UPDATE events SET
            title = ?,
            description = ?,
            event_date = ?,
            image_url = ?,
            repeat_type = ?,
            repeat_interval = ?,
            repeat_end_date = ?,
            repeat_day_of_week = ?,
            repeat_week_of_month = ?,
            is_recurring = ?
        WHERE id = ?
    ''', (
        data['title'],
        data.get('description', ''),
        data['event_date'],
        data.get('image_url', ''),
        data.get('repeat_type', 'none'),
        data.get('repeat_interval', 1),
        data.get('repeat_end_date'),
        data.get('repeat_day_of_week'),
        data.get('repeat_week_of_month'),
        data.get('is_recurring', 0),
        event_id
    ))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

# DELETE event
@app.route('/api/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM events WHERE id = ?', (event_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Event not found'}), 404
        cursor.execute('DELETE FROM events WHERE id = ?', (event_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success'})
    except Exception as e:
        app.logger.error(f"Error deleting event {event_id}: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

if __name__ == '__main__': 
    app.run(debug=True, port=5000)