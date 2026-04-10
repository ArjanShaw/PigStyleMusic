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
import subprocess
import os
import discogs_client
from flask import session, request, jsonify
from functools import wraps

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

# ==================== SQUARE API HELPER FUNCTIONS ====================
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

# Helper function for authenticated Discogs client
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



@app.route('/api/discogs/test-listings', methods=['GET'])
def test_discogs_listings():
    """Fetch Discogs listings and mark which ones match local records"""
    try:
        TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
        
        if not TOKEN:
            return jsonify({
                'success': False,
                'error': 'Discogs token not configured'
            }), 500
        
        headers = {
            'Authorization': f'Discogs token={TOKEN}',
            'User-Agent': 'PigStyleMusic/1.0'
        }
        
        # First, get all local records with Discogs listing IDs
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, discogs_listing_id 
            FROM records 
            WHERE discogs_listing_id IS NOT NULL
        ''')
        local_listings = cursor.fetchall()
        local_listing_map = {row['discogs_listing_id']: row['id'] for row in local_listings}
        conn.close()
        
        all_listings = []
        page = 1
        
        while True:
            response = requests.get(
                f'https://api.discogs.com/users/pigstyle/inventory',
                headers=headers,
                params={'page': page, 'per_page': 100}
            )
            
            if response.status_code != 200:
                return jsonify({
                    'success': False,
                    'error': f'Discogs API error: {response.status_code}'
                }), response.status_code
            
            data = response.json()
            listings = data.get('listings', [])
            
            if not listings:
                break
            
            for listing in listings:
                release = listing.get('release', {})
                listing_id = listing.get('id')
                
                # Check if this listing matches a local record
                local_record_id = local_listing_map.get(listing_id)
                
                # Parse comments to find pigstyle ID if not matched by listing_id
                comments = listing.get('comments', '')
                pigstyle_id_match = None
                if '[PIGSTYLE ID:' in comments:
                    import re
                    match = re.search(r'\[PIGSTYLE ID:\s*(\d+)\]', comments)
                    if match:
                        pigstyle_id_match = int(match.group(1))
                
                all_listings.append({
                    'listing_id': listing_id,
                    'release_id': listing.get('release_id'),
                    'artist': release.get('artist', 'Unknown'),
                    'title': release.get('title', 'Unknown'),
                    'price': listing.get('price', {}).get('value', 0),
                    'condition': listing.get('condition', ''),
                    'sleeve_condition': listing.get('sleeve_condition', ''),
                    'status': listing.get('status', ''),
                    'url': f"https://www.discogs.com/sell/item/{listing_id}",
                    'local_record_id': local_record_id,
                    'pigstyle_id_in_comments': pigstyle_id_match
                })
            
            pagination = data.get('pagination', {})
            if page >= pagination.get('pages', 1):
                break
            
            page += 1
        
        return jsonify({
            'success': True,
            'listings': all_listings,
            'count': len(all_listings)
        })
        
    except Exception as e:
        app.logger.error(f"Error fetching Discogs listings: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
 

@app.route('/api/discogs/my-listings', methods=['GET'])
@require_discogs_auth
def get_my_discogs_listings():
    """
    Get all items currently listed in your Discogs inventory
    """
    try:
        app.logger.info("Fetching Discogs listings")
        d = get_discogs_client()
        
        # Get the authenticated user
        user = d.identity()
        app.logger.info(f"Authenticated as: {user.username}")
        
        # Get inventory (listings for sale) - CORRECT METHOD
        # The method is likely 'inventory' not 'inventory_folders'
        inventory = user.inventory
        
        listings = []
        
        # Iterate through all pages of inventory
        for page_num in range(inventory.pages):
            app.logger.info(f"Fetching page {page_num + 1} of {inventory.pages}")
            page = inventory.page(page_num)
            
            for listing in page:
                try:
                    # Get release details
                    release = listing.release
                    artist = release.artists[0].name if release.artists else 'Unknown'
                    
                    listings.append({
                        'listing_id': str(listing.id),
                        'release_id': str(release.id),
                        'artist': artist,
                        'title': release.title,
                        'label': release.labels[0].name if release.labels else '',
                        'catalog_number': release.labels[0].catalog_number if release.labels and hasattr(release.labels[0], 'catalog_number') else '',
                        'format': release.formats[0]['name'] if release.formats else '',
                        'year': release.year,
                        'price': float(listing.price.value),
                        'condition': listing.condition,
                        'sleeve_condition': listing.sleeve_condition,
                        'comments': listing.comments,
                        'status': listing.status,
                        'listed_date': listing.listed.isoformat() if hasattr(listing.listed, 'isoformat') else str(listing.listed),
                        'url': listing.url
                    })
                except Exception as e:
                    app.logger.error(f"Error processing listing {listing.id}: {str(e)}")
                    continue
        
        app.logger.info(f"Found {len(listings)} listings")
        
        return jsonify({
            'success': True,
            'listings': listings,
            'count': len(listings),
            'username': user.username
        })
        
    except Exception as e:
        app.logger.error(f"Error fetching Discogs listings: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/discogs/create-listing-single', methods=['POST'])
def create_discogs_listing_single():
    """Create a single listing on Discogs with markup pricing"""
    try:
        data = request.json
        record = data.get('record', {})
        
        if not record:
            return jsonify({'error': 'No record provided'}), 400
        
        TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
        if not TOKEN:
            return jsonify({'success': False, 'error': 'Discogs token not configured'}), 500
        
        # Get markup percentage from config
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT config_value FROM app_config WHERE config_key = ?', ('DISCOGS_MARKUP_PERCENT',))
        row = cursor.fetchone()
        markup_percent = float(row['config_value']) if row else 20
        conn.close()
        
        # Calculate Discogs price with markup
        store_price = float(record.get('price', 0))
        discogs_price = round(store_price * (1 + markup_percent / 100), 2)
        
        headers = {
            'Authorization': f'Discogs token={TOKEN}',
            'User-Agent': 'PigStyleMusic/1.0'
        }
        
        # Search for release
        search_url = "https://api.discogs.com/database/search"
        search_query = f"{record.get('artist')} {record.get('title')}"
        if record.get('catalog_number'):
            search_query += f" {record.get('catalog_number')}"
        
        search_response = requests.get(search_url, headers=headers, params={'q': search_query, 'type': 'release', 'per_page': 1})
        
        if search_response.status_code != 200:
            return jsonify({'success': False, 'error': f'Search failed: {search_response.status_code}'}), search_response.status_code
        
        search_data = search_response.json()
        releases = search_data.get('results', [])
        
        if not releases:
            return jsonify({'success': False, 'error': 'No matching release found on Discogs'})
        
        release_id = releases[0].get('id')
        
        # Create listing with calculated price
        listing_url = "https://api.discogs.com/marketplace/listings"
        comments = f"[PIGSTYLE ID: {record['id']}] {record.get('notes', '')}"
        if record.get('location'):
            comments += f" | Location: {record.get('location')}"
        comments += f" | Store: ${store_price:.2f} | Listed: ${discogs_price:.2f} ({markup_percent}% markup)"
        
        listing_data = {
            "release_id": release_id,
            "condition": record.get('media_condition', 'Very Good Plus (VG+)'),
            "sleeve_condition": record.get('sleeve_condition', record.get('media_condition', 'Very Good Plus (VG+)')),
            "price": discogs_price,
            "status": "For Sale",
            "comments": comments
        }
        
        listing_response = requests.post(listing_url, headers=headers, json=listing_data)
        
        if listing_response.status_code in [200, 201]:
            listing_result = listing_response.json()
            listing_id = listing_result.get('listing_id')
            
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE records 
                SET discogs_listing_id = ?, discogs_listed_date = CURRENT_DATE
                WHERE id = ?
            ''', (listing_id, record['id']))
            conn.commit()
            conn.close()
            
            return jsonify({
                'success': True,
                'listing_id': listing_id,
                'price': discogs_price,
                'markup_percent': markup_percent,
                'record_id': record['id']
            })
        else:
            return jsonify({'success': False, 'error': f'Discogs API error: {listing_response.text[:200]}'})
        
    except Exception as e:
        app.logger.error(f"Error creating listing: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    

@app.route('/api/discogs/sync-prices', methods=['POST'])
def sync_discogs_prices():
    """Apply weekly price reductions to Discogs listings based on age"""
    try:
        TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
        if not TOKEN:
            return jsonify({'success': False, 'error': 'Discogs token not configured'}), 500
        
        # Get config values
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT config_value FROM app_config WHERE config_key = ?', ('DISCOGS_MARKUP_PERCENT',))
        markup_row = cursor.fetchone()
        markup_percent = float(markup_row['config_value']) if markup_row else 20
        
        cursor.execute('SELECT config_value FROM app_config WHERE config_key = ?', ('DISCOGS_PRICE_STEP',))
        step_row = cursor.fetchone()
        step_percent = float(step_row['config_value']) if step_row else 5
        conn.close()
        
        headers = {
            'Authorization': f'Discogs token={TOKEN}',
            'User-Agent': 'PigStyleMusic/1.0'
        }
        
        # Fetch all Discogs listings
        all_listings = []
        page = 1
        
        while True:
            response = requests.get(
                'https://api.discogs.com/users/pigstyle/inventory',
                headers=headers,
                params={'page': page, 'per_page': 100}
            )
            
            if response.status_code != 200:
                return jsonify({'success': False, 'error': f'Discogs API error: {response.status_code}'}), response.status_code
            
            data = response.json()
            listings = data.get('listings', [])
            
            if not listings:
                break
            
            for listing in listings:
                release = listing.get('release', {})
                all_listings.append({
                    'listing_id': str(listing.get('id')),
                    'price': float(listing.get('price', {}).get('value', 0)),
                    'listed_date': listing.get('listed', ''),
                    'artist': release.get('artist', 'Unknown'),
                    'title': release.get('title', 'Unknown'),
                    'condition': listing.get('condition', 'Very Good Plus (VG+)'),
                    'sleeve_condition': listing.get('sleeve_condition', 'Very Good Plus (VG+)')
                })
            
            pagination = data.get('pagination', {})
            if page >= pagination.get('pages', 1):
                break
            page += 1
        
        from datetime import datetime
        
        updated = 0
        failed = 0
        results = []
        
        for listing in all_listings:
            # Find local record
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('SELECT id, store_price, discogs_listed_date FROM records WHERE discogs_listing_id = ?', (listing['listing_id'],))
            record = cursor.fetchone()
            conn.close()
            
            if not record:
                continue
            
            # Calculate weeks on Discogs
            if listing['listed_date']:
                listed_date = datetime.strptime(listing['listed_date'].split('T')[0], '%Y-%m-%d')
                today = datetime.now()
                weeks = max(0, (today - listed_date).days // 7)
            else:
                weeks = 0
            
            # Calculate expected price
            reduction = weeks * step_percent
            effective_markup = max(0, markup_percent - reduction)
            expected_price = record['store_price'] * (1 + effective_markup / 100)
            expected_price = max(record['store_price'], round(expected_price, 2))
            
            # Update if price changed (allow 1 cent rounding)
            if abs(listing['price'] - expected_price) > 0.01:
                update_data = {
                    "price": expected_price,
                    "condition": listing['condition'],
                    "sleeve_condition": listing['sleeve_condition'],
                    "status": "For Sale"
                }
                
                update_response = requests.post(
                    f'https://api.discogs.com/marketplace/listings/{listing["listing_id"]}',
                    headers=headers,
                    json=update_data
                )
                
                if update_response.status_code in [200, 201]:
                    updated += 1
                    results.append(f"✅ ${listing['price']:.2f} → ${expected_price:.2f}: {listing['artist']} - {listing['title']}")
                else:
                    failed += 1
                    results.append(f"❌ Failed: {listing['artist']} - {listing['title']}")
            
            # Rate limiting delay
            import time
            time.sleep(1)
        
        return jsonify({
            'success': True,
            'message': f'Updated {updated} listings, Failed: {failed}',
            'updated': updated,
            'failed': failed,
            'results': results
        })
        
    except Exception as e:
        app.logger.error(f"Error in sync_prices: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500   



@app.route('/api/discogs/create-listings', methods=['POST'])
def create_discogs_listings():
    """
    Create multiple listings on Discogs using Personal Access Token with progress reporting
    """
    try:
        data = request.json
        records = data.get('records', [])
        
        app.logger.info(f"=== CREATE LISTINGS CALLED ===")
        app.logger.info(f"Records received: {len(records)}")
        
        if not records:
            return jsonify({'error': 'No records provided'}), 400
        
        # Get token from environment variable
        TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
        
        if not TOKEN:
            app.logger.error("DISCOGS_USER_TOKEN not set in environment")
            return jsonify({
                'success': False,
                'error': 'Discogs token not configured. Please set DISCOGS_USER_TOKEN in .env file.'
            }), 500
        
        conn = get_db()
        cursor = conn.cursor()
        
        results = []
        successful_count = 0
        failed_count = 0
        
        # Process in batches of 5 to avoid rate limiting
        batch_size = 5
        total_batches = (len(records) + batch_size - 1) // batch_size
        
        for batch_num in range(total_batches):
            start_idx = batch_num * batch_size
            end_idx = min(start_idx + batch_size, len(records))
            batch_records = records[start_idx:end_idx]
            
            app.logger.info(f"Processing batch {batch_num + 1} of {total_batches} ({len(batch_records)} records)")
            
            for idx, record in enumerate(batch_records):
                current_num = start_idx + idx + 1
                try:
                    app.logger.info(f"[{current_num}/{len(records)}] Processing record {record['id']}: {record.get('artist')} - {record.get('title')}")
                    
                    # First, search for the release on Discogs
                    search_url = "https://api.discogs.com/database/search"
                    search_query = f"{record.get('artist')} {record.get('title')}"
                    
                    if record.get('catalog_number'):
                        search_query += f" {record.get('catalog_number')}"
                    
                    search_params = {
                        'q': search_query,
                        'type': 'release',
                        'per_page': 1
                    }
                    
                    headers = {
                        'Authorization': f'Discogs token={TOKEN}',
                        'User-Agent': 'PigStyleMusic/1.0'
                    }
                    
                    search_response = requests.get(search_url, headers=headers, params=search_params)
                    
                    if search_response.status_code != 200:
                        error_msg = f"Search failed: {search_response.status_code}"
                        app.logger.error(f"[{current_num}/{len(records)}] {error_msg} - {search_response.text}")
                        results.append({
                            'record_id': record['id'],
                            'success': False,
                            'error': error_msg
                        })
                        failed_count += 1
                        continue
                    
                    search_data = search_response.json()
                    releases = search_data.get('results', [])
                    
                    if not releases:
                        error_msg = "No matching release found on Discogs"
                        app.logger.warning(f"[{current_num}/{len(records)}] {error_msg}")
                        results.append({
                            'record_id': record['id'],
                            'success': False,
                            'error': error_msg
                        })
                        failed_count += 1
                        continue
                    
                    release_id = releases[0].get('id')
                    app.logger.info(f"[{current_num}/{len(records)}] Found release ID: {release_id}")
                    
                    # Now create the listing using the Marketplace API
                    listing_url = "https://api.discogs.com/marketplace/listings"
                    
                    listing_data = {
                        "release_id": release_id,
                        "condition": record.get('media_condition', 'Very Good Plus (VG+)'),
                        "sleeve_condition": record.get('sleeve_condition', record.get('media_condition', 'Very Good Plus (VG+)')),
                        "price": float(record.get('price', 0)),
                        "status": "For Sale",
                        "comments": f"[PIGSTYLE ID: {record['id']}] {record.get('notes', '')}"
                    }
                    
                    listing_response = requests.post(
                        listing_url,
                        headers=headers,
                        json=listing_data
                    )
                    
                    app.logger.info(f"[{current_num}/{len(records)}] Listing response status: {listing_response.status_code}")
                    
                    # Check if the request was successful
                    if listing_response.status_code in [200, 201]:
                        listing_result = listing_response.json()
                        listing_id = listing_result.get('listing_id')
                        
                        app.logger.info(f"[{current_num}/{len(records)}] Got listing ID: {listing_id}")
                        
                        # Update local record with Discogs listing ID
                        cursor.execute('''
                            UPDATE records 
                            SET discogs_listing_id = ?,
                                discogs_listed_date = CURRENT_TIMESTAMP 
                            WHERE id = ?
                        ''', (listing_id, record['id']))
                        
                        conn.commit()
                        
                        app.logger.info(f"[{current_num}/{len(records)}] ✅ Successfully listed record {record['id']}")
                        
                        results.append({
                            'record_id': record['id'],
                            'listing_id': listing_id,
                            'release_id': release_id,
                            'url': f"https://www.discogs.com/sell/item/{listing_id}",
                            'success': True
                        })
                        successful_count += 1
                    else:
                        error_msg = f"Discogs API returned {listing_response.status_code}: {listing_response.text[:200]}"
                        app.logger.error(f"[{current_num}/{len(records)}] ❌ {error_msg}")
                        results.append({
                            'record_id': record['id'],
                            'success': False,
                            'error': error_msg
                        })
                        failed_count += 1
                    
                    # Small delay between requests to avoid rate limiting
                    time.sleep(0.5)
                    
                except Exception as e:
                    error_msg = str(e)
                    app.logger.error(f"[{current_num}/{len(records)}] ❌ Exception: {error_msg}")
                    results.append({
                        'record_id': record['id'],
                        'success': False,
                        'error': error_msg
                    })
                    failed_count += 1
            
            # Delay between batches
            if batch_num < total_batches - 1:
                app.logger.info(f"Batch {batch_num + 1} complete. Waiting 2 seconds before next batch...")
                time.sleep(2)
        
        conn.close()
        
        return jsonify({
            'success': True,
            'results': results,
            'successful': successful_count,
            'failed': failed_count,
            'total': len(records),
            'message': f"Listed {successful_count} of {len(records)} records on Discogs. Failed: {failed_count}"
        })
        
    except Exception as e:
        app.logger.error(f"Error creating Discogs listings: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/discogs/delete-listing/<listing_id>', methods=['DELETE'])
def delete_discogs_listing(listing_id):
    """Delete a listing from Discogs using Personal Access Token"""
    try:
        TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
        
        if not TOKEN:
            return jsonify({
                'success': False,
                'error': 'Discogs token not configured'
            }), 500
        
        headers = {
            'Authorization': f'Discogs token={TOKEN}',
            'User-Agent': 'PigStyleMusic/1.0'
        }
        
        url = f"https://api.discogs.com/marketplace/listings/{listing_id}"
        
        response = requests.delete(url, headers=headers)
        
        if response.status_code == 204:
            return jsonify({
                'success': True,
                'message': f'Listing {listing_id} deleted successfully'
            })
        elif response.status_code == 404:
            return jsonify({
                'success': False,
                'error': f'Listing {listing_id} not found on Discogs'
            }), 404
        else:
            return jsonify({
                'success': False,
                'error': f'Discogs API returned {response.status_code}: {response.text}'
            }), response.status_code
            
    except Exception as e:
        app.logger.error(f"Error deleting Discogs listing: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/discogs/search-release', methods=['POST'])
def search_discogs_release():
    """Search Discogs for a release"""
    try:
        data = request.json
        artist = data.get('artist', '')
        title = data.get('title', '')
        catalog = data.get('catalog_number', '')
        
        # Build search query
        query = f"{artist} {title}"
        if catalog:
            query += f" {catalog}"
        
        app.logger.info(f"Searching Discogs for: {query}")
        
        # Use Discogs API directly with requests
        import requests
        
        # Search Discogs database (no auth needed for search)
        search_url = "https://api.discogs.com/database/search"
        params = {
            'q': query,
            'type': 'release',
            'per_page': 10
        }
        
        headers = {
            'User-Agent': 'PigStyleMusic/1.0'
        }
        
        response = requests.get(search_url, params=params, headers=headers)
        
        if response.status_code != 200:
            app.logger.error(f"Discogs API error: {response.text}")
            return jsonify({'error': 'Discogs search failed'}), response.status_code
        
        data = response.json()
        results = data.get('results', [])
        
        formatted_results = []
        for result in results[:10]:
            # Extract artist from title if needed
            result_title = result.get('title', '')
            result_artist = result.get('artist', '')
            
            # Some results have title as "Artist - Title"
            if ' - ' in result_title and not result_artist:
                parts = result_title.split(' - ', 1)
                result_artist = parts[0]
                result_title = parts[1]
            
            formatted_results.append({
                'release_id': result.get('id'),
                'title': result_title,
                'artist': result_artist,
                'year': result.get('year'),
                'format': result.get('format', [''])[0] if result.get('format') else '',
                'label': result.get('label', [''])[0] if result.get('label') else '',
                'catalog_number': result.get('catno', ''),
                'thumb': result.get('thumb', ''),
                'url': f"https://www.discogs.com/release/{result.get('id')}"
            })
        
        return jsonify({
            'success': True,
            'results': formatted_results,
            'count': len(formatted_results)
        })
        
    except Exception as e:
        app.logger.error(f"Error searching Discogs: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/discogs/sync', methods=['POST'])
@require_discogs_auth
def sync_with_discogs():
    """
    Sync your local records with Discogs listings
    This will mark records as listed if they're found on Discogs
    """
    try:
        d = get_discogs_client()
        user = d.identity()
        
        # Get all Discogs listings
        inventory = user.inventory
        
        # Build a map of Discogs listings
        discogs_map = {}
        for page_num in range(inventory.pages):
            page = inventory.page(page_num)
            for listing in page:
                # Key by release ID and price/condition combo
                key = f"{listing.release.id}_{listing.condition}_{listing.price.value}"
                discogs_map[key] = {
                    'listing_id': listing.id,
                    'price': float(listing.price.value),
                    'condition': listing.condition,
                    'sleeve_condition': listing.sleeve_condition
                }
        
        # Here you would update your database
        # This would require database access and matching logic
        
        return jsonify({
            'success': True,
            'message': f"Found {len(discogs_map)} listings on Discogs",
            'count': len(discogs_map)
        })
        
    except Exception as e:
        app.logger.error(f"Error syncing with Discogs: {str(e)}")
        return jsonify({'error': str(e)}), 500
  
@app.route('/api/square-webhook', methods=['POST'])
def square_webhook():
    """Handle Square webhook events - simplified version"""
    try:
        webhook_data = request.json
        app.logger.info(f"🔔 Square webhook received: {json.dumps(webhook_data, indent=2)}")
        return jsonify({'status': 'success', 'message': 'Webhook received'}), 200
    except Exception as e:
        app.logger.error(f"Webhook error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

def verify_square_webhook(signature, body):
    """Verify Square webhook signature"""
    webhook_signature_key = os.environ.get('SQUARE_WEBHOOK_SIGNATURE_KEY')
    
    if not webhook_signature_key:
        app.logger.warning("SQUARE_WEBHOOK_SIGNATURE_KEY not set")
        return False
    
    expected_signature = hmac.new(
        key=webhook_signature_key.encode('utf-8'),
        msg=body,
        digestmod=hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)


@app.route('/api/checkout/process', methods=['POST'])
def process_checkout():
    """Create a Square payment link for either records or accessories"""
    try:
        data = request.json
        app.logger.info(f"Checkout request received: {data}")
        
        items = data.get('items', [])
        item_type = data.get('item_type', 'record')  # 'record' or 'accessory'
        shipping = data.get('shipping')
        subtotal = data.get('subtotal', 0)
        total = data.get('total', 0)
        
        import uuid
        import random
        import string
        from datetime import datetime
        
        order_id = str(uuid.uuid4())
        date_str = datetime.now().strftime('%Y%m%d')
        random_chars = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        order_number = f"PS-{date_str}-{random_chars}"
        
        if not items or total <= 0:
            return jsonify({
                'status': 'error',
                'error': 'Invalid cart data'
            }), 400
        
        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        location_id = os.environ.get('SQUARE_LOCATION_ID')
        
        if not access_token or not location_id:
            app.logger.error("Square credentials not configured")
            return jsonify({
                'status': 'error',
                'error': 'Payment system not configured'
            }), 500
        
        # Build line items for Square
        line_items = []
        item_ids = []  # Track IDs for metadata
        
        # Build a formatted note with clear delimiters
        # Format: barcode | artist | title (trimmed to 50 chars each) || next item
        record_descriptions = []
        
        # Helper function to trim string to max length
        def trim_string(s, max_length=50):
            if not s:
                return ''
            s = str(s)
            if len(s) <= max_length:
                return s
            return s[:max_length-3] + '...'
        
        for item in items:
            # For accessories, use description as name
            if item_type == 'accessory':
                item_name = item.get('description') or item.get('title', 'Merchandise')
                barcode = item.get('barcode') or item.get('bar_code') or 'NO-BARCODE'
                trimmed_name = trim_string(item_name)
                record_descriptions.append(f"{barcode} | ACC: {trimmed_name}")
            else:
                # For records, get barcode, artist, title
                barcode = item.get('barcode') or item.get('bar_code') or 'NO-BARCODE'
                artist = item.get('artist', 'Unknown Artist')
                title = item.get('title', 'Unknown Title')
                
                # Trim artist and title to 50 chars max
                trimmed_artist = trim_string(artist)
                trimmed_title = trim_string(title)
                
                # Format: barcode | artist | title
                record_descriptions.append(f"{barcode} | {trimmed_artist} | {trimmed_title}")
            
            # Build the display name for line item
            if item_type == 'accessory':
                display_name = item_name
            else:
                artist_name = item.get('artist', '')
                item_name = item.get('title', 'Unknown')
                if artist_name:
                    display_name = f"{artist_name} - {item_name}"
                else:
                    display_name = item_name
            
            line_items.append({
                "name": display_name,
                "quantity": str(item.get('quantity', 1)),
                "base_price_money": {
                    "amount": int(round(float(item.get('price', 0)) * 100)),
                    "currency": "USD"
                }
            })
            
            # Track the item ID (either copy_id or accessory_id)
            item_id = item.get('copy_id') or item.get('accessory_id')
            if item_id:
                item_ids.append(str(item_id))
        
        # Add shipping line item if present
        if shipping and shipping.get('amount', 0) > 0:
            line_items.append({
                "name": "Shipping",
                "quantity": "1",
                "base_price_money": {
                    "amount": int(round(shipping.get('amount', 0) * 100)),
                    "currency": "USD"
                }
            })
        
        # Add tax line item if present
        tax_amount = data.get('tax', 0)
        if tax_amount and float(tax_amount) > 0:
            line_items.append({
                "name": "Sales Tax",
                "quantity": "1",
                "base_price_money": {
                    "amount": int(round(float(tax_amount) * 100)),
                    "currency": "USD"
                }
            })
            app.logger.info(f"✅ Added tax line item: ${tax_amount}")
        
        # Join multiple records with " || " delimiter
        formatted_note = " || ".join(record_descriptions)
        
        # Truncate if too long (Square has 500 char limit)
        if len(formatted_note) > 500:
            formatted_note = formatted_note[:497] + "..."
        
        # Prepare metadata
        metadata = {
            'order_id': str(order_id),
            'order_number': order_number,
            'item_type': item_type,
            'item_ids': json.dumps(item_ids)
        }
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        # Determine redirect URL based on item type
        env = os.getenv("ENV", "production")
        
        if item_type == 'accessory':
            redirect_path = '/merchandise'
        else:
            redirect_path = '/shop'
        
        if env == "development":
            redirect_url = f"http://localhost:8000{redirect_path}?status=completed&order_id={order_id}"
        else:
            redirect_url = f"https://www.pigstylemusic.com{redirect_path}?status=completed&order_id={order_id}"

        payload = {
            "idempotency_key": str(uuid.uuid4()),
            "order": {
                "location_id": location_id,
                "line_items": line_items,
                "reference_id": str(order_id)
            },
            "payment_note": formatted_note,  # Now uses barcode | artist | title format with 50 char trim
            "metadata": metadata,
            "checkout_options": {
                "redirect_url": redirect_url
            }
        }
        
        square_base_url = 'https://connect.squareup.com'
        
        app.logger.info(f"Sending to Square with reference_id: {order_id}")
        app.logger.info(f"Payment note: {formatted_note}")
        app.logger.info(f"Line items: {json.dumps(line_items, indent=2)}")
        
        response = requests.post(
            f'{square_base_url}/v2/online-checkout/payment-links',
            headers=headers,
            json=payload
        )
        
        app.logger.info("=== SQUARE API RESPONSE ===")
        app.logger.info(f"Status Code: {response.status_code}")
        app.logger.info(f"Response Body: {response.text}")
        app.logger.info("=== END SQUARE RESPONSE ===")
        
        if response.status_code != 200:
            app.logger.error(f"Square API error: {response.text}")
            return jsonify({
                'status': 'error',
                'error': 'Failed to create payment link'
            }), 400
        
        result = response.json()
        payment_link = result.get('payment_link', {})
        checkout_url = payment_link.get('url')
        square_order_id = payment_link.get('order_id')
        
        if not square_order_id:
            return jsonify({
                'status': 'error',
                'error': 'No square_order_id returned'
            }), 500

        if not checkout_url:
            return jsonify({
                'status': 'error',
                'error': 'No checkout URL returned'
            }), 500
        
        # For accessories, we don't need to create orders in the database yet
        # Just return success with checkout URL
        if item_type == 'accessory':
            return jsonify({
                'status': 'success',
                'checkout_url': checkout_url,
                'order_id': order_id,
                'order_number': order_number,
                'square_order_id': square_order_id,
                'message': 'Checkout created successfully'
            }), 200
        
        # For records, create order in database (existing code)
        conn = get_db()
        cursor = conn.cursor()
        
        shipping_method = shipping.get('method', 'pickup') if shipping else 'pickup'
        shipping_cost = float(shipping.get('amount', 0)) if shipping else 0
        
        cursor.execute("BEGIN TRANSACTION")
        
        try:
            insert_sql = '''
                INSERT INTO orders (
                    id, order_number, customer_name, customer_email,
                    shipping_method, shipping_address_line1, shipping_address_line2,
                    shipping_city, shipping_state, shipping_zip, shipping_country,
                    shipping_cost, subtotal, tax, total,
                    square_checkout_id, square_order_id,
                    payment_status, order_status, notes,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            '''
            
            cursor.execute(insert_sql, (
                order_id,
                order_number,
                data.get('customer_name', 'Walk-in Customer'),
                data.get('customer_email', ''),
                shipping_method,
                data.get('address', ''),
                data.get('apt', ''),
                data.get('city', ''),
                data.get('state', ''),
                data.get('zip', ''),
                data.get('country', 'USA'),
                shipping_cost,
                subtotal,
                data.get('tax', 0),
                total,
                payment_link.get('id'),
                square_order_id,
                'pending',
                'pending',
                data.get('notes', '')
            ))
            
            for item in items:
                item_sql = '''
                    INSERT INTO order_items (
                        order_id, record_id, record_title, record_artist,
                        record_condition, price_at_time, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                '''
                
                cursor.execute(item_sql, (
                    order_id,
                    item.get('copy_id'),
                    item.get('title'),
                    item.get('artist'),
                    item.get('condition'),
                    float(item.get('price'))
                ))
            
            conn.commit()
            app.logger.info(f"Order created successfully: {order_number}")
            
        except Exception as e:
            conn.rollback()
            app.logger.error(f"Error creating order: {str(e)}")
            app.logger.error(traceback.format_exc())
            # Still return success for Square even if order creation fails
            # The payment was still created
        finally:
            conn.close()
        
        return jsonify({
            'status': 'success',
            'checkout_url': checkout_url,
            'order_id': order_id,
            'order_number': order_number,
            'square_order_id': square_order_id,
            'message': 'Checkout created successfully'
        }), 200
        
    except Exception as e:
        app.logger.error(f"Checkout error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': f'Server error: {str(e)}'
        }), 500
 

 
@app.route('/api/order/complete', methods=['POST'])
def order_complete():
    """Update order status and mark records as sold after successful payment"""
    try:
        data = request.json
        transaction_id = data.get('transaction_id')
        order_id = data.get('order_id')
        
        if not transaction_id or not order_id:
            return jsonify({'status': 'error', 'error': 'Missing transaction_id or order_id'}), 400
        
        app.logger.info(f"Completing order: {order_id} with transaction: {transaction_id}")
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("BEGIN TRANSACTION")
        
        try:
            access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Square-Version': '2026-01-22'
            }
            
            payment_response = requests.get(
                f'https://connect.squareup.com/v2/payments/{transaction_id}',
                headers=headers
            )
            
            if payment_response.status_code == 200:
                payment_data = payment_response.json()
                payment = payment_data.get('payment', {})
                
                square_total = float(payment.get('amount_money', {}).get('amount', 0)) / 100
                square_tax = float(payment.get('tax_money', {}).get('amount', 0)) / 100 if payment.get('tax_money') else 0
                
                app.logger.info(f"Square amounts - Total: {square_total}, Tax: {square_tax}")
                
                cursor.execute('''
                    UPDATE orders 
                    SET square_payment_id = ?,
                        payment_status = 'paid',
                        order_status = 'confirmed',
                        total = ?,
                        tax = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND payment_status = 'pending'
                ''', (transaction_id, square_total, square_tax, order_id))
            else:
                app.logger.warning(f"Could not fetch payment details from Square: {payment_response.status_code}")
                cursor.execute('''
                    UPDATE orders 
                    SET square_payment_id = ?,
                        payment_status = 'paid',
                        order_status = 'confirmed',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND payment_status = 'pending'
                ''', (transaction_id, order_id))
            
            cursor.execute('''
                SELECT record_id FROM order_items WHERE order_id = ?
            ''', (order_id,))
            
            record_ids = [row['record_id'] for row in cursor.fetchall()]
            app.logger.info(f"Found {len(record_ids)} records in order {order_id}")
            
            if record_ids:
                placeholders = ','.join('?' for _ in record_ids)
                cursor.execute(f'''
                    UPDATE records 
                    SET status_id = 3, 
                        date_sold = CURRENT_DATE
                    WHERE id IN ({placeholders})
                ''', record_ids)
                
                app.logger.info(f"Updated {cursor.rowcount} records to sold status")
            
            conn.commit()
            app.logger.info(f"Order {order_id} completed successfully")
            
            return jsonify({
                'status': 'success',
                'message': f'Order completed, {len(record_ids)} records marked as sold'
            })
            
        except Exception as e:
            conn.rollback()
            app.logger.error(f"Error in order completion transaction: {e}")
            raise
        finally:
            conn.close()
        
    except Exception as e:
        app.logger.error(f"Order complete error: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': f'Server error: {str(e)}'
        }), 500

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

    # Search for the specific artist directly
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
    
    if not printer_path.startswith('/dev/usb/lp'):
        return jsonify({'status': 'error', 'message': 'Invalid printer path'}), 400
    
    try:
        with open(printer_path, 'wb') as printer:
            printer.write(receipt_data.encode('utf-8'))
            printer.flush()
        
        return jsonify({
            'status': 'success', 
            'message': 'Receipt sent to printer',
            'printer': printer_path
        })
        
    except PermissionError:
        try:
            subprocess.run(['sudo', 'chmod', '666', printer_path], check=False)
            
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

@app.route('/print-test', methods=['POST'])
def print_test():
    """Send a simple test page to the printer"""
    test_data = {
        'printer': '/dev/usb/lp2',
        'data': '\x1B\x40' +  # Initialize
                '\x1B\x61\x01' +  # Center
                'PigStyle Music\n' +
                'Test Page\n' +
                ''.ljust(32, '=') + '\n' +
                '\x1B\x61\x00' +  # Left
                'Date: ' + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + '\n' +
                'Printer: VCP-8370\n' +
                'Status: Working!\n\n\n\n'
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
 
# ==================== SQUARE PAYMENTS ENDPOINTS ====================

@app.route('/api/square/payments', methods=['GET'])
@login_required
@role_required(['admin'])
def get_square_payments():
    """Get Square payments with optional date filters"""
    try:
        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        if not access_token:
            return jsonify({
                'status': 'error',
                'error': 'SQUARE_ACCESS_TOKEN not configured'
            }), 500
        
        environment = os.environ.get('SQUARE_ENVIRONMENT', 'production')
        base_url = 'https://connect.squareup.com' if environment == 'production' else 'https://connect.squareupsandbox.com'
        
        # Get query parameters
        begin_time = request.args.get('begin_time')
        end_time = request.args.get('end_time')
        cursor = request.args.get('cursor')
        limit = request.args.get('limit', 100)
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        params = {
            'limit': limit
        }
        
        if begin_time:
            params['begin_time'] = begin_time
        if end_time:
            params['end_time'] = end_time
        if cursor:
            params['cursor'] = cursor
        
        app.logger.info(f"Fetching Square payments with params: {params}")
        
        response = requests.get(
            f'{base_url}/v2/payments',
            headers=headers,
            params=params
        )
        
        if response.status_code != 200:
            app.logger.error(f"Square API error: {response.text}")
            return jsonify({
                'status': 'error',
                'error': f"Square API error: {response.status_code}"
            }), response.status_code
        
        data = response.json()
        
        # Format payments for response
        payments = data.get('payments', [])
        
        app.logger.info(f"Found {len(payments)} payments")
        
        return jsonify({
            'status': 'success',
            'payments': payments,
            'cursor': data.get('cursor'),
            'count': len(payments)
        })
        
    except Exception as e:
        app.logger.error(f"Error fetching Square payments: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/square/payments/<payment_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def get_square_payment(payment_id):
    """Get a single Square payment by ID"""
    try:
        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        if not access_token:
            return jsonify({
                'status': 'error',
                'error': 'SQUARE_ACCESS_TOKEN not configured'
            }), 500
        
        environment = os.environ.get('SQUARE_ENVIRONMENT', 'production')
        base_url = 'https://connect.squareup.com' if environment == 'production' else 'https://connect.squareupsandbox.com'
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        response = requests.get(
            f'{base_url}/v2/payments/{payment_id}',
            headers=headers
        )
        
        if response.status_code != 200:
            return jsonify({
                'status': 'error',
                'error': f"Square API error: {response.status_code}"
            }), response.status_code
        
        data = response.json()
        payment = data.get('payment')
        
        if not payment:
            return jsonify({
                'status': 'error',
                'error': 'Payment not found'
            }), 404
        
        return jsonify({
            'status': 'success',
            'payment': payment
        })
        
    except Exception as e:
        app.logger.error(f"Error fetching Square payment: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500
 

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
        
        enhanced_devices = []
        for device in devices:
            device_id = device.get('id')
            
            status_obj = device.get('status', {})
            raw_status = status_obj.get('category', 'UNKNOWN')
            
            if raw_status == 'AVAILABLE':
                display_status = 'ONLINE'
            elif raw_status == 'OFFLINE':
                display_status = 'OFFLINE'
            else:
                display_status = 'UNKNOWN'
            
            attributes = device.get('attributes', {})
            device_name = attributes.get('name', 'Square Terminal')
            
            enhanced_devices.append({
                'id': device_id,
                'device_name': device_name,
                'status': display_status,
                'raw_status': raw_status,
                'device_type': attributes.get('type', 'TERMINAL'),
                'manufacturer': attributes.get('manufacturer', 'Square')
            })
        
        app.logger.info(f"Sending {len(enhanced_devices)} devices")
        
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

# ==================== RECEIPTS ENDPOINTS ====================

@app.route('/api/receipts', methods=['GET'])
def get_receipts():
    """Get all receipts from database"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
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
        
        transaction_json = json.dumps(data)
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id FROM receipts WHERE receipt_id = ?', (receipt_id,))
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute('''
                UPDATE receipts 
                SET transaction_data = ?, total = ?, tax = ?, 
                    payment_method = ?, cashier = ?, square_payment_id = ?
                WHERE receipt_id = ?
            ''', (transaction_json, total, tax, payment_method, cashier, square_payment_id, receipt_id))
            message = 'Receipt updated'
        else:
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
        
        results = {}
        
        url1 = f"{base_url}/v2/terminals/checkouts/{checkout_id}"
        response1 = requests.get(url1, headers=headers)
        results['standard'] = {
            'url': url1,
            'status': response1.status_code,
            'response': response1.text[:500]
        }
        
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
        
        price_advisor = PriceAdviseHandler(
            discogs_token=app.config.get('DISCOGS_USER_TOKEN'),
            ebay_client_id=app.config.get('EBAY_CLIENT_ID'),
            ebay_client_secret=app.config.get('EBAY_CLIENT_SECRET')
        )
        
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
        discogs_format = data.get('discogs_format', '')  # ADD THIS LINE
        
        app.logger.info(f"Price estimate called: {artist} - {title} - Format: {discogs_format}")
        
        price_advisor = PriceAdviseHandler(
            discogs_token=app.config.get('DISCOGS_USER_TOKEN'),
            ebay_client_id=app.config.get('EBAY_CLIENT_ID'),
            ebay_client_secret=app.config.get('EBAY_CLIENT_SECRET')
        )
        
        result = price_advisor.get_price_estimate(
            artist=artist,
            title=title,
            selected_condition=condition,
            discogs_genre=discogs_genre,
            discogs_id=discogs_id,
            discogs_format=discogs_format  # ADD THIS LINE
        )
        
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
 
@app.route('/api/youtube/status', methods=['GET'])
def youtube_status():
    """Check if YouTube API is configured (without exposing the key)"""
    youtube_api_key = os.environ.get('YOUTUBE_API_KEY')
    return jsonify({
        'status': 'success',
        'configured': bool(youtube_api_key)
    })

@app.route('/api/youtube/search', methods=['POST'])
def youtube_search():
    """Proxy YouTube API search - uses environment variable for API key"""
    try:
        data = request.get_json()
        query = data.get('query')
        
        if not query:
            return jsonify({'status': 'error', 'error': 'Search query required'}), 400
        
        youtube_api_key = os.environ.get('YOUTUBE_API_KEY')
        if not youtube_api_key:
            app.logger.error("YOUTUBE_API_KEY not found in environment variables")
            return jsonify({
                'status': 'error', 
                'error': 'YouTube API not configured on server'
            }), 503
        
        import requests
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
        
        if response.status_code == 403:
            error_text = response.text.lower()
            if 'quota' in error_text:
                app.logger.warning("YouTube API quota exceeded")
                return jsonify({
                    'status': 'error', 
                    'error': 'YouTube API quota exceeded'
                }), 429
        
        if response.status_code != 200:
            app.logger.error(f"YouTube API error: {response.status_code}")
            return jsonify({
                'status': 'error', 
                'error': f'YouTube API error: {response.status_code}'
            }), response.status_code
        
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
        
        return jsonify({
            'status': 'success',
            'results': results
        })
        
    except Exception as e:
        app.logger.error(f"YouTube search error: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

# ==================== USER MANAGEMENT ENDPOINTS ====================

@app.route('/users', methods=['POST'])
def create_user():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400

    if 'username' not in data:
        return jsonify({'status': 'error', 'error': 'username required'}), 400
    if 'role' not in data:
        return jsonify({'status': 'error', 'error': 'role required'}), 400

    username = data['username']
    role = data['role']
    
    if role not in ['admin', 'consignor', 'youtube_linker', 'seller']:
        return jsonify({'status': 'error', 'error': 'Invalid role'}), 400

    if role != 'seller':
        if 'email' not in data:
            return jsonify({'status': 'error', 'error': 'email required for this role'}), 400
        if 'password' not in data:
            return jsonify({'status': 'error', 'error': 'password required for this role'}), 400
        
        email = data['email']
        password = data['password']
        
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
            return jsonify({'status': 'error', 'error': 'Invalid email format'}), 400
        
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
        cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
        if cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'error': 'Email already exists'}), 400
    else:
        email = data.get('email', '')
        password = data.get('password', '')
        
        if email and not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
            return jsonify({'status': 'error', 'error': 'Invalid email format'}), 400
        
        if password:
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
        
        if email:
            cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
            if cursor.fetchone():
                conn.close()
                return jsonify({'status': 'error', 'error': 'Email already exists'}), 400

    cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Username already exists'}), 400

    full_name = data.get('full_name', '')
    initials = data.get('initials', '')
    flag_color = data.get('flag_color', '')

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

@app.route('/artist-genre', methods=['POST'])
def create_artist_genre():
    """Create a new artist-genre mapping"""
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'error': 'No data provided'}), 400

    artist = data.get('artist')
    genre_id = data.get('genre_id')

    if not artist or not genre_id:
        return jsonify({'status': 'error', 'error': 'artist and genre_id required'}), 400

    # Clean artist name
    artist = artist.strip()
    if not artist:
        return jsonify({'status': 'error', 'error': 'Artist name cannot be empty'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Verify genre exists
    cursor.execute('SELECT id, genre_name FROM genres WHERE id = ?', (genre_id,))
    genre = cursor.fetchone()
    if not genre:
        conn.close()
        return jsonify({'status': 'error', 'error': f'Genre ID {genre_id} not found'}), 404

    # Check if artist already exists
    cursor.execute('SELECT * FROM artist_genre WHERE artist = ?', (artist,))
    existing = cursor.fetchone()

    if existing:
        conn.close()
        return jsonify({
            'status': 'error',
            'error': f'Artist "{artist}" already exists with genre ID {existing["genre_id"]}'
        }), 400

    # Insert new mapping
    cursor.execute('''
        INSERT INTO artist_genre (artist, genre_id)
        VALUES (?, ?)
    ''', (artist, genre_id))

    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': f'Artist "{artist}" mapped to genre "{genre["genre_name"]}"',
        'artist': artist,
        'genre_id': genre_id,
        'genre_name': genre['genre_name']
    }), 201



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

@app.route('/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Delete a user (admin only)"""
    print(f"DELETE /users/{user_id} - Session: {dict(session)}")
    print(f"DELETE /users/{user_id} - logged_in: {session.get('logged_in')}")
    print(f"DELETE /users/{user_id} - role: {session.get('role')}")
    
    if not session.get('logged_in') or 'user_id' not in session:
        return jsonify({
            'status': 'error',
            'error': 'Authentication required - not logged in'
        }), 401
    
    if session.get('role') != 'admin':
        return jsonify({
            'status': 'error',
            'error': f'Admin role required. Current role: {session.get("role")}'
        }), 403
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute('SELECT id, username, role FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({
                'status': 'error',
                'error': 'User not found'
            }), 404
        
        cursor.execute('SELECT COUNT(*) as count FROM records WHERE consignor_id = ?', (user_id,))
        records_count = cursor.fetchone()['count']
        
        if records_count > 0:
            return jsonify({
                'status': 'error',
                'error': f'Cannot delete user with {records_count} existing records. Please reassign or delete records first.'
            }), 400
        
        cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()
        
        app.logger.info(f"User {user_id} ({user['username']}) deleted by admin")
        
        return jsonify({
            'status': 'success',
            'message': f'User {user["username"]} deleted successfully'
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error deleting user {user_id}: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': f'Server error: {str(e)}'
        }), 500
    finally:
        conn.close()
 

@app.route('/api/admin/orders/<string:order_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def get_admin_order(order_id):
    """Get single order by UUID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT o.*,
                   GROUP_CONCAT(
                       json_object(
                           'record_id', oi.record_id,
                           'artist', oi.record_artist,
                           'title', oi.record_title,
                           'condition', oi.record_condition,
                           'price', oi.price_at_time
                       )
                   ) as items_json
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.id = ?
            GROUP BY o.id
        ''', (order_id,))
        
        order = cursor.fetchone()
        conn.close()
        
        if not order:
            return jsonify({'status': 'error', 'error': 'Order not found'}), 404
        
        order_dict = dict(order)
        
        if order_dict['payment_status'] == 'paid' and order_dict['order_status'] == 'confirmed':
            order_dict['status'] = 'paid'
        elif order_dict['payment_status'] == 'failed' or order_dict['order_status'] == 'cancelled':
            order_dict['status'] = 'cancelled'
        elif order_dict['payment_status'] == 'pending':
            order_dict['status'] = 'pending'
        else:
            order_dict['status'] = order_dict['order_status'] or 'pending'
        
        try:
            if order_dict['items_json']:
                items_json = '[' + order_dict['items_json'] + ']'
                order_dict['items'] = json.loads(items_json)
            else:
                order_dict['items'] = []
        except Exception as e:
            app.logger.error(f"Error parsing items JSON: {e}")
            order_dict['items'] = []
        
        if 'items_json' in order_dict:
            del order_dict['items_json']
        
        return jsonify({
            'status': 'success',
            'order': order_dict
        })
        
    except Exception as e:
        app.logger.error(f"Error fetching order: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/admin/orders/stats', methods=['GET'])
@login_required
@role_required(['admin'])
def get_admin_order_stats():
    """Get order statistics for admin panel"""
    app.logger.info("=== ADMIN STATS GET HIT ===")
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                COUNT(*) as total_orders,
                SUM(store_price) as total_revenue,
                AVG(store_price) as avg_order_value,
                COUNT(CASE WHEN date_sold >= DATE('now', '-7 days') THEN 1 END) as orders_last_7_days,
                SUM(CASE WHEN date_sold >= DATE('now', '-7 days') THEN store_price ELSE 0 END) as revenue_last_7_days
            FROM records
            WHERE status_id = 3 AND date_sold IS NOT NULL
        ''')
        
        stats = cursor.fetchone()
        conn.close()
        
        response = jsonify({
            'status': 'success',
            'stats': {
                'total_orders': stats['total_orders'] or 0,
                'total_revenue': float(stats['total_revenue'] or 0),
                'avg_order_value': float(stats['avg_order_value'] or 0),
                'orders_last_7_days': stats['orders_last_7_days'] or 0,
                'revenue_last_7_days': float(stats['revenue_last_7_days'] or 0)
            }
        })
        
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response
        
    except Exception as e:
        app.logger.error(f"Error fetching order stats: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500

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

@app.route('/api/admin/orders', methods=['GET'])
@login_required
@role_required(['admin'])
def get_admin_orders():
    """Get orders for admin panel with UUID support"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                o.*,
                GROUP_CONCAT(
                    json_object(
                        'record_id', oi.record_id,
                        'artist', oi.record_artist,
                        'title', oi.record_title,
                        'condition', oi.record_condition,
                        'price', oi.price_at_time
                    )
                ) as items_json
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        ''')
        
        orders = cursor.fetchall()
        
        cursor.execute('''
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid,
                SUM(total) as revenue
            FROM orders
        ''')
        
        stats = cursor.fetchone()
        conn.close()
        
        orders_list = []
        for order in orders:
            order_dict = dict(order)
            
            if order_dict['payment_status'] == 'paid' and order_dict['order_status'] == 'confirmed':
                order_dict['status'] = 'paid'
            elif order_dict['payment_status'] == 'failed' or order_dict['order_status'] == 'cancelled':
                order_dict['status'] = 'cancelled'
            elif order_dict['payment_status'] == 'pending':
                order_dict['status'] = 'pending'
            else:
                order_dict['status'] = order_dict['order_status'] or 'pending'
            
            try:
                if order_dict['items_json']:
                    items_json = '[' + order_dict['items_json'] + ']'
                    order_dict['items'] = json.loads(items_json)
                else:
                    order_dict['items'] = []
            except Exception as e:
                app.logger.error(f"Error parsing items JSON: {e}")
                order_dict['items'] = []
            
            if 'items_json' in order_dict:
                del order_dict['items_json']
            
            orders_list.append(order_dict)
        
        stats_dict = {
            'total': stats['total'] if stats and stats['total'] else 0,
            'pending': stats['pending'] if stats and stats['pending'] else 0,
            'paid': stats['paid'] if stats and stats['paid'] else 0,
            'revenue': float(stats['revenue']) if stats and stats['revenue'] else 0
        }
        
        return jsonify({
            'status': 'success',
            'orders': orders_list,
            'stats': stats_dict
        })
        
    except Exception as e:
        app.logger.error(f"Error fetching orders: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/admin/orders/<string:order_id>/refresh-payment', methods=['POST','OPTIONS'])
def refresh_order_payment(order_id):
    """Check Square for payment status using stored square_order_id"""

    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:8000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response, 200

    try:
        app.logger.info(f"Refreshing payment for order: {order_id}")

        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT o.id, o.square_order_id, o.payment_status,
                   oi.record_id
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.id = ?
        ''', (order_id,))
        rows = cursor.fetchall()

        if not rows:
            conn.close()
            return jsonify({'status':'error','error':'Order not found'}), 404

        order = dict(rows[0])
        record_ids = [r['record_id'] for r in rows if r['record_id']]
        square_order_id = order.get('square_order_id')

        if order['payment_status'] == 'paid':
            conn.close()
            return jsonify({
                'status':'success',
                'message':'Order already paid',
                'payment_found': True,
                'payment_status':'paid'
            })

        if not square_order_id:
            conn.close()
            return jsonify({
                'status':'error',
                'error':'No Square order ID found'
            }), 400

        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        if not access_token:
            conn.close()
            return jsonify({'status':'error','error':'Square access token not configured'}), 500

        headers = {
            'Authorization': f'Bearer {access_token}',
            'Square-Version': '2026-01-22',
            'Content-Type': 'application/json'
        }

        end_time = datetime.utcnow().isoformat() + "Z"
        begin_time = (datetime.utcnow() - timedelta(days=7)).isoformat() + "Z"

        cursor_token = None
        matching_payment = None

        while True:
            params = {
                'begin_time': begin_time,
                'end_time': end_time,
                'sort_order': 'DESC',
                'limit': 100
            }
            if cursor_token:
                params['cursor'] = cursor_token

            response = requests.get(
                'https://connect.squareup.com/v2/payments',
                headers=headers,
                params=params,
                timeout=10
            )

            if response.status_code != 200:
                app.logger.error(f"Square payments list failed: {response.text}")
                break

            data = response.json()
            payments = data.get('payments', [])

            for payment in payments:
                if (payment.get('status') == 'COMPLETED' and
                    payment.get('order_id') == square_order_id):
                    matching_payment = payment
                    break

            if matching_payment:
                break

            cursor_token = data.get('cursor')
            if not cursor_token:
                break

        if matching_payment:
            cursor.execute('''
                UPDATE orders
                SET payment_status = 'paid',
                    order_status = 'confirmed',
                    square_payment_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND payment_status != 'paid'
            ''', (matching_payment['id'], order_id))

            if cursor.rowcount > 0 and record_ids:
                placeholders = ','.join('?' for _ in record_ids)
                cursor.execute(f'''
                    UPDATE records
                    SET status_id = 3, date_sold = CURRENT_DATE
                    WHERE id IN ({placeholders})
                ''', record_ids)

            conn.commit()
            message = f"Order {order_id} marked as paid"
            app.logger.info(message)
        else:
            message = f"No completed payment found for Order {order_id}"

        conn.close()

        response = jsonify({
            'status':'success',
            'message': message,
            'payment_found': bool(matching_payment),
            'payment_status':'paid' if matching_payment else 'pending'
        })
        response.headers.add('Access-Control-Allow-Origin','http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials','true')
        return response

    except Exception as e:
        app.logger.error(f"Error: {e}")
        app.logger.error(traceback.format_exc())
        conn.close()
        response = jsonify({'status':'error','error':str(e)})
        response.headers.add('Access-Control-Allow-Origin','http://localhost:8000')
        response.headers.add('Access-Control-Allow-Credentials','true')
        return response, 500

# ==================== UPDATED RECORDS ENDPOINTS WITH CONDITION TABLE ====================

@app.route('/records', methods=['POST'])
def create_record():
    """Create a new record in the database with separate sleeve and disc conditions"""
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
        commission_rate = data.get('commission_rate')
        status_id = data.get('status_id', 1)
        
        # Get condition IDs - either from direct IDs or from condition string
        condition_sleeve_id = data.get('condition_sleeve_id')
        condition_disc_id = data.get('condition_disc_id')
        
        # If only a single condition string is provided, use it for both sleeve and disc
        if not condition_sleeve_id and data.get('condition'):
            cursor.execute('SELECT id FROM d_condition WHERE condition_name = ?', 
                          (data.get('condition'),))
            result = cursor.fetchone()
            if result:
                condition_sleeve_id = result['id']
                condition_disc_id = result['id']  # Set both to same value
        
        cursor.execute('''
            INSERT INTO records (
                artist, title, barcode, genre_id, image_url,
                catalog_number, condition_sleeve_id, condition_disc_id, store_price,
                youtube_url, consignor_id, commission_rate,
                status_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('artist'),
            data.get('title'),
            data.get('barcode', ''),
            data.get('genre_id'),
            data.get('image_url', ''),
            data.get('catalog_number', ''),
            condition_sleeve_id,
            condition_disc_id,
            float(data.get('store_price', 0.0)),
            data.get('youtube_url', ''),
            consignor_id,
            float(commission_rate) if commission_rate else None,
            int(status_id)
        ))
        
        record_id = cursor.lastrowid
        conn.commit()
        
        # Get the record with joined condition data
        cursor.execute('''
            SELECT 
                r.*,
                g.genre_name,
                s.status_name,
                cs.condition_name as sleeve_condition_name,
                cs.display_name as sleeve_display,
                cs.abbreviation as sleeve_abbr,
                cd.condition_name as disc_condition_name,
                cd.display_name as disc_display,
                cd.abbreviation as disc_abbr
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
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

@app.route('/api/sticky-notes', methods=['GET'])
def get_sticky_notes():
    """Get all active sticky notes ordered by position"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT id, note_text, position 
            FROM sticky_notes 
            WHERE is_active = 1 
            ORDER BY position ASC, created_at DESC
        ''')
        
        notes = cursor.fetchall()
        
        response = jsonify({
            'status': 'success',
            'notes': [dict(note) for note in notes]
        })
        
        # Add CORS headers if needed
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        
        return response
        
    except Exception as e:
        error_msg = f"Database error: {str(e)}"
        response = jsonify({
            'status': 'error',
            'error': error_msg
        })
        response.headers.add('Access-Control-Allow-Origin', '*')
        return response, 500
    finally:
        conn.close()


@app.route('/records', methods=['GET'])
def get_records():
    """Get records with condition data joined from d_condition table"""
    conn = get_db()
    cursor = conn.cursor()
    
    random_order = request.args.get('random', 'false').lower() == 'true'
    limit = request.args.get('limit', type=int)
    has_youtube = request.args.get('has_youtube', 'false').lower() == 'true'
    status_id = request.args.get('status_id', type=int)
    
    query = '''
        SELECT 
            r.*,
            COALESCE(g.genre_name, 'Unknown') as genre_name,
            s.status_name,
            cs.condition_name as sleeve_condition_name,
            cs.display_name as sleeve_display,
            cs.abbreviation as sleeve_abbr,
            cs.quality_index as sleeve_quality,
            cd.condition_name as disc_condition_name,
            cd.display_name as disc_display,
            cd.abbreviation as disc_abbr,
            cd.quality_index as disc_quality
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.artist IS NOT NULL AND r.title IS NOT NULL
        AND r.artist != '' AND r.title != ''
    '''
    
    params = []
    
    if has_youtube:
        query += '''
            AND (r.youtube_url LIKE '%youtube.com%' OR
                 r.youtube_url LIKE '%youtu.be%')
        '''
    
    if status_id is not None:
        query += ' AND r.status_id = ?'
        params.append(status_id)
    
    if random_order:
        query += ' ORDER BY RANDOM()'
    else:
        query += ' ORDER BY r.id DESC'
    
    if limit:
        query += ' LIMIT ?'
        params.append(limit)
    
    cursor.execute(query, params)
    records = cursor.fetchall()
    conn.close()
    
    records_list = []
    for record in records:
        record_dict = dict(record)
        # Add a combined condition field for backward compatibility
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)
    
    return jsonify({
        'status': 'success',
        'count': len(records_list),
        'records': records_list
    })

@app.route('/records/<int:record_id>', methods=['GET'])
def get_record(record_id):
    """Get a single record by ID with condition data"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT 
            r.*,
            g.genre_name,
            s.status_name,
            cs.condition_name as sleeve_condition_name,
            cs.display_name as sleeve_display,
            cs.abbreviation as sleeve_abbr,
            cd.condition_name as disc_condition_name,
            cd.display_name as disc_display,
            cd.abbreviation as disc_abbr
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.id = ?
    ''', (record_id,))

    record = cursor.fetchone()
    conn.close()

    if not record:
        return jsonify({'status': 'error', 'error': 'Record not found'}), 404

    record_dict = dict(record)
    # Add a combined condition field for backward compatibility
    if record_dict.get('sleeve_condition_name'):
        record_dict['condition'] = record_dict['sleeve_condition_name']

    return jsonify(record_dict)
 
@app.route('/records/<int:record_id>', methods=['PUT'])
def update_record(record_id):
    """Update a record with support for separate sleeve and disc conditions"""
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
        'condition_sleeve_id': 'condition_sleeve_id',
        'condition_disc_id': 'condition_disc_id',
        'store_price': 'store_price',
        'youtube_url': 'youtube_url',
        'consignor_id': 'consignor_id',
        'commission_rate': 'commission_rate',
        'up_votes': 'up_votes',
        'down_votes': 'down_votes',
        'kill_votes': 'kill_votes',
        'status_id': 'status_id',
        'date_sold': 'date_sold',
        'date_paid': 'date_paid',
        'discogs_listing_id': 'discogs_listing_id',
        'discogs_listed_date': 'discogs_listed_date'
    }

    # Handle backward compatibility - if 'condition' is provided but not condition_sleeve_id
    if 'condition' in data and 'condition_sleeve_id' not in data:
        cursor.execute('SELECT id FROM d_condition WHERE condition_name = ?', (data['condition'],))
        result = cursor.fetchone()
        if result:
            condition_id = result['id']
            update_fields.append('condition_sleeve_id = ?')
            update_values.append(condition_id)
            # Optionally set disc condition too if not provided
            if 'condition_disc_id' not in data:
                update_fields.append('condition_disc_id = ?')
                update_values.append(condition_id)

    for key, value in data.items():
        if key in field_mapping and key not in ['condition']:  # Skip 'condition' as we handled it
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
        SELECT 
            r.*,
            g.genre_name,
            s.status_name,
            cs.condition_name as sleeve_condition_name,
            cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
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
    """Search records by barcode, title, artist, or catalog number"""
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'status': 'error', 'error': 'Search query required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        search_term = f'%{query}%'
        cursor.execute('''
            SELECT 
                r.*,
                g.genre_name,
                s.status_name,
                cs.condition_name as sleeve_condition_name,
                cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.barcode LIKE ? 
               OR r.title LIKE ? 
               OR r.artist LIKE ? 
               OR r.catalog_number LIKE ?
            ORDER BY r.created_at DESC
        ''', (search_term, search_term, search_term, search_term))
        
        records = cursor.fetchall()
        records_list = []
        for record in records:
            record_dict = dict(record)
            if record_dict.get('sleeve_condition_name'):
                record_dict['condition'] = record_dict['sleeve_condition_name']
            records_list.append(record_dict)
        
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
        
        if payment_id.startswith('SQUARE-'):
            app.logger.error(f"Cannot refund local receipt ID: {payment_id}. Need actual Square payment_id.")
            return jsonify({
                'status': 'error', 
                'error': 'Please use the actual Square payment ID, not the receipt ID. This refund must be processed through the Square Dashboard.'
            }), 400
        
        amount_cents = int(round(amount * 100))
        
        access_token = os.environ.get('SQUARE_ACCESS_TOKEN')
        if not access_token:
            return jsonify({
                'status': 'error',
                'error': 'SQUARE_ACCESS_TOKEN not configured'
            }), 500
        
        environment = os.environ.get('SQUARE_ENVIRONMENT', 'sandbox')
        base_url = 'https://connect.squareup.com' if environment == 'production' else 'https://connect.squareupsandbox.com'
        
        idempotency_key = str(uuid.uuid4())
        
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
        
        if device_id:
            refund_data["device_details"] = {
                "device_id": device_id
            }
        
        app.logger.info(f"Sending refund request to Square: {refund_data}")
        
        response = requests.post(
            f'{base_url}/v2/refunds',
            headers=headers,
            json=refund_data
        )
        
        if response.status_code != 200:
            error_text = response.text[:500]
            app.logger.error(f"Square refund API error: {error_text}")
            
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
        
        if 'errors' in result:
            errors = result['errors']
            error_messages = [e.get('detail', 'Unknown error') for e in errors]
            return jsonify({
                'status': 'error',
                'error': ', '.join(error_messages)
            }), 400
        
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
        SELECT 
            r.*,
            g.genre_name,
            s.status_name,
            cs.condition_name as sleeve_condition_name,
            cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
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

    records_list = []
    for record in records:
        record_dict = dict(record)
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
        records_list.append(record_dict)

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
        SELECT 
            r.*,
            g.genre_name,
            s.status_name,
            cs.condition_name as sleeve_condition_name,
            cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
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
        SELECT 
            r.*,
            g.genre_name,
            s.status_name,
            cs.condition_name as sleeve_condition_name,
            cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
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
        SELECT 
            r.*,
            g.genre_name,
            s.status_name,
            cs.condition_name as sleeve_condition_name,
            cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
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
    """Get records by status ID"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM d_status WHERE id = ?', (status_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'error': 'Invalid status ID'}), 400

    cursor.execute('''
        SELECT 
            r.*,
            g.genre_name,
            s.status_name,
            u.username as consignor_name,
            cs.condition_name as sleeve_condition_name,
            cd.condition_name as disc_condition_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
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

    return jsonify({
        'status': 'success',
        'count': len(records_list),
        'status_id': status_id,
        'records': records_list
    })

# ==================== CONDITIONS ENDPOINTS (NEW) ====================

@app.route('/api/conditions', methods=['GET'])
def get_conditions():
    """Get available conditions based on user role"""
    try:
        user_role = request.args.get('role', session.get('role', 'admin'))
        
        conn = get_db()
        cursor = conn.cursor()
        
        if user_role == 'consignor':
            cursor.execute('''
                SELECT id, condition_name, display_name, abbreviation, description, quality_index
                FROM d_condition
                WHERE is_consignor_allowed = 1
                ORDER BY quality_index
            ''')
        else:
            cursor.execute('''
                SELECT id, condition_name, display_name, abbreviation, description, quality_index
                FROM d_condition
                ORDER BY quality_index
            ''')
        
        conditions = cursor.fetchall()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'conditions': [dict(c) for c in conditions]
        })
        
    except Exception as e:
        app.logger.error(f"Error getting conditions: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/conditions/<int:condition_id>', methods=['GET'])
def get_condition_by_id(condition_id):
    """Get a single condition by ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, condition_name, display_name, abbreviation, description, quality_index
            FROM d_condition
            WHERE id = ?
        ''', (condition_id,))
        
        condition = cursor.fetchone()
        conn.close()
        
        if not condition:
            return jsonify({'status': 'error', 'error': 'Condition not found'}), 404
        
        return jsonify({
            'status': 'success',
            'condition': dict(condition)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting condition: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

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
            SELECT 
                r.*,
                g.genre_name,
                s.status_name,
                u.username as consignor_name,
                cs.condition_name as sleeve_condition_name,
                cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.consignor_id IS NOT NULL
            ORDER BY r.created_at DESC
        ''')
    else:
        cursor.execute('''
            SELECT 
                r.*,
                g.genre_name,
                s.status_name,
                cs.condition_name as sleeve_condition_name,
                cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
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
    commission_rate = float(commission_result['config_value']) 

    # Get condition IDs
    condition_sleeve_id = data.get('condition_sleeve_id')
    condition_disc_id = data.get('condition_disc_id')
    
    # If only a condition string is provided, try to map it
    if not condition_sleeve_id and data.get('condition'):
        cursor.execute('SELECT id FROM d_condition WHERE condition_name = ?', 
                      (data.get('condition'),))
        result = cursor.fetchone()
        if result:
            condition_sleeve_id = result['id']
            condition_disc_id = result['id']

    cursor.execute('''
        INSERT INTO records (
            artist, title, barcode, genre_id, image_url,
            catalog_number, condition_sleeve_id, condition_disc_id, store_price,
            youtube_url, consignor_id, commission_rate,
            status_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ''', (
        data.get('artist'),
        data.get('title'),
        data.get('barcode', ''),
        data.get('genre_id'),
        data.get('image_url', ''),
        data.get('catalog_number', ''),
        condition_sleeve_id,
        condition_disc_id,
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
            SELECT 
                r.*,
                g.genre_name,
                s.status_name,
                u.username as consignor_name,
                cs.condition_name as sleeve_condition_name,
                cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
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
            SELECT 
                r.*,
                g.genre_name,
                s.status_name,
                u.username as consignor_name,
                cs.condition_name as sleeve_condition_name,
                cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
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

    records_list = []
    for record in records:
        record_dict = dict(record)
        
        # Add display status
        barcode = record_dict.get('barcode')
        status_id = record_dict.get('status_id')

        if status_id == 1:
            if not barcode or barcode in [None, '', 'None']:
                record_dict['display_status'] = '🆕 New'
            else:
                record_dict['display_status'] = '✅ Active'
        elif status_id == 2:
            record_dict['display_status'] = '✅ Active'
        elif status_id == 3:
            record_dict['display_status'] = '💰 Sold'
        elif status_id == 4:
            record_dict['display_status'] = '🗑️ Removed'
        else:
            record_dict['display_status'] = '❓ Unknown'
        
        # Add condition field for backward compatibility
        if record_dict.get('sleeve_condition_name'):
            record_dict['condition'] = record_dict['sleeve_condition_name']
            
        records_list.append(record_dict)

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
            SELECT 
                r.*,
                g.genre_name,
                s.status_name,
                u.username as consignor_name,
                cs.condition_name as sleeve_condition_name,
                cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.consignor_id = ?
            AND (r.barcode IS NULL OR r.barcode = '' OR r.barcode = 'None')
            AND r.status_id IN (1, 2)
            ORDER BY r.created_at DESC
        ''', (user_id,))
    else:
        cursor.execute('''
            SELECT 
                r.*,
                g.genre_name,
                s.status_name,
                u.username as consignor_name,
                cs.condition_name as sleeve_condition_name,
                cd.condition_name as disc_condition_name
            FROM records r
            LEFT JOIN genres g ON r.genre_id = g.id
            LEFT JOIN d_status s ON r.status_id = s.id
            LEFT JOIN users u ON r.consignor_id = u.id
            LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
            LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
            WHERE r.consignor_id IS NOT NULL
            AND (r.barcode IS NULL OR r.barcode = '' OR r.barcode = 'None')
            AND r.status_id IN (1, 2)
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

# ==================== CATALOG ENDPOINTS ====================

@app.route('/catalog/grouped-by-release', methods=['GET'])
def get_catalog_grouped_by_release():
    """
    Returns catalog data grouped by unique releases (artist + title combination)
    Sorted by date added descending (newest first)
    Each group contains all copies of that release with their details, grouped by format
    Format is derived from barcode prefix (22=vinyl, 33=cd, 44=cassette)
    """
    conn = get_db()
    cursor = conn.cursor()

    # Get all in-stock records
    cursor.execute('''
        SELECT 
            r.id,
            r.artist,
            r.title,
            r.barcode,
            COALESCE(r.image_url, '') as image_url,
            COALESCE(g.genre_name, 'Unknown') as genre_name,
            cs.condition_name as sleeve_condition,
            cd.condition_name as disc_condition,
            r.store_price,
            r.catalog_number,
            r.youtube_url,
            r.created_at,
            s.status_name
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.artist IS NOT NULL AND r.title IS NOT NULL
        AND r.artist != '' AND r.title != ''
        AND r.store_price IS NOT NULL
        AND r.status_id = 2
        ORDER BY r.created_at DESC
    ''')

    records = cursor.fetchall()
    conn.close()

    # Helper function to get format from barcode
    def get_format_from_barcode(barcode):
        if not barcode:
            return 'Vinyl'  # Default to vinyl if no barcode
        
        barcode_str = str(barcode)
        if barcode_str.startswith('22'):
            return 'Vinyl'
        elif barcode_str.startswith('33'):
            return 'CD'
        elif barcode_str.startswith('44'):
            return 'Cassette'
        else:
            return 'Vinyl'  # Default fallback

    # Define condition order for sorting copies within groups
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

    # Group records by release (artist + title)
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
        
        # Convert price to float
        if 'store_price' in record_dict and record_dict['store_price'] is not None:
            record_dict['store_price'] = float(record_dict['store_price'])
        
        # Get format from barcode
        barcode = record_dict.get('barcode')
        record_format = get_format_from_barcode(barcode)
        
        if key not in groups:
            unique_releases += 1
            groups[key] = {
                'artist': artist,
                'title': title,
                'genre_name': record_dict.get('genre_name', 'Unknown'),
                'image_url': record_dict.get('image_url', ''),
                'total_copies': 0,
                'formats': {},  # Will hold format-specific data
                'created_at': record_dict.get('created_at'),
                'price_range': {
                    'min': float('inf'),
                    'max': 0
                }
            }
        
        # Get or create format group
        if record_format not in groups[key]['formats']:
            groups[key]['formats'][record_format] = {
                'format': record_format,
                'copies': [],
                'total_copies': 0,
                'price_range': {
                    'min': float('inf'),
                    'max': 0
                }
            }
        
        # Add copy to format group
        copy_data = {
            'id': record_dict['id'],
            'sleeve_condition': record_dict.get('sleeve_condition', 'Unknown'),
            'disc_condition': record_dict.get('disc_condition', 'Unknown'),
            'sleeve_condition_rank': condition_order.get(record_dict.get('sleeve_condition'), 99),
            'disc_condition_rank': condition_order.get(record_dict.get('disc_condition'), 99),
            'store_price': record_dict['store_price'],
            'barcode': record_dict.get('barcode', ''),
            'catalog_number': record_dict.get('catalog_number', ''),
            'youtube_url': record_dict.get('youtube_url', ''),
            'created_at': record_dict.get('created_at')
        }
        
        groups[key]['formats'][record_format]['copies'].append(copy_data)
        groups[key]['formats'][record_format]['total_copies'] += 1
        groups[key]['total_copies'] += 1
        total_copies += 1
        
        # Update format price range
        price = record_dict['store_price']
        if price > 0:
            if price < groups[key]['formats'][record_format]['price_range']['min']:
                groups[key]['formats'][record_format]['price_range']['min'] = price
            if price > groups[key]['formats'][record_format]['price_range']['max']:
                groups[key]['formats'][record_format]['price_range']['max'] = price
        
        # Update overall price range
        if price > 0:
            groups[key]['price_range']['min'] = min(groups[key]['price_range']['min'], price)
            groups[key]['price_range']['max'] = max(groups[key]['price_range']['max'], price)
        
        # Track earliest creation date for the group
        if record_dict.get('created_at') and (
            not groups[key]['created_at'] or 
            record_dict['created_at'] < groups[key]['created_at']
        ):
            groups[key]['created_at'] = record_dict['created_at']
    
    # Fix groups with no valid prices
    for group in groups.values():
        if group['price_range']['min'] == float('inf'):
            group['price_range'] = {'min': 0, 'max': 0}
        for format_data in group['formats'].values():
            if format_data['price_range']['min'] == float('inf'):
                format_data['price_range'] = {'min': 0, 'max': 0}
    
    # Convert groups dict to list and sort by created_at descending (newest first)
    groups_list = list(groups.values())
    groups_list.sort(key=lambda x: x['created_at'] if x['created_at'] else '', reverse=True)
    
    # Convert formats dict to list and sort copies within each format
    for group in groups_list:
        # Convert formats from dict to list
        group['formats'] = list(group['formats'].values())
        
        # Sort formats alphabetically
        group['formats'].sort(key=lambda x: x['format'])
        
        # Sort copies within each format by condition (best first) and price (highest first)
        for format_data in group['formats']:
            format_data['copies'].sort(key=lambda x: (x['sleeve_condition_rank'], -x['store_price']))
            
            # Clean up temporary fields
            for copy in format_data['copies']:
                del copy['sleeve_condition_rank']
                del copy['disc_condition_rank']
                
                # Create a combined condition field for display
                if copy['sleeve_condition'] == copy['disc_condition']:
                    copy['condition'] = copy['sleeve_condition']
                else:
                    copy['condition'] = f"Sleeve: {copy['sleeve_condition']}, Disc: {copy['disc_condition']}"

    return jsonify({
        'status': 'success',
        'total_unique_releases': len(groups_list),
        'total_copies': total_copies,
        'groups': groups_list
    })

@app.route('/catalog/grouped-records', methods=['GET'])
def get_catalog_grouped_records():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT config_value FROM app_config WHERE config_key = 'CATALOG_PRICE_WEIGHTING'")
    weighting_result = cursor.fetchone()
    
    if not weighting_result:
        raise Exception("CATALOG_PRICE_WEIGHTING not found in app_config table")
    
    price_weighting = float(weighting_result[0])
    price_weighting = max(0.0, min(1.0, price_weighting))

    cursor.execute('''
        SELECT 
            r.*,
            g.genre_name,
            s.status_name,
            cs.condition_name as sleeve_condition,
            cd.condition_name as disc_condition
        FROM records r
        LEFT JOIN genres g ON r.genre_id = g.id
        LEFT JOIN d_status s ON r.status_id = s.id
        LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
        LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
        WHERE r.artist IS NOT NULL AND r.title IS NOT NULL
        AND r.artist != '' AND r.title != ''
        AND r.store_price IS NOT NULL
        AND r.status_id = 2
    ''')

    records = cursor.fetchall()
    conn.close()

    records_list = []
    for record in records:
        record_dict = dict(record)
        if 'store_price' in record_dict:
            record_dict['store_price'] = float(record_dict['store_price'])
        if record_dict.get('sleeve_condition'):
            if record_dict['sleeve_condition'] == record_dict.get('disc_condition'):
                record_dict['condition'] = record_dict['sleeve_condition']
            else:
                record_dict['condition'] = f"Sleeve: {record_dict['sleeve_condition']}, Disc: {record_dict['disc_condition']}"
        records_list.append(record_dict)

    valid_price_records = [r for r in records_list if isinstance(r.get('store_price'), (int, float)) and r['store_price'] > 0]
    
    if not valid_price_records:
        return jsonify({
            'status': 'success',
            'count': 0,
            'price_weighting': price_weighting,
            'min_price': None,
            'max_price': None,
            'groups': []
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

    result_group = {
        'label': '',
        'min': min_price,
        'max': max_price,
        'price_weighting': price_weighting,
        'records': sorted_records
    }

    return jsonify({
        'status': 'success',
        'count': len(sorted_records),
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

@app.route('/commission-rate', methods=['GET'])
def get_commission_rate_simple():
    """Simple commission rate endpoint with default values"""
    return jsonify({
        'commission_rate': 25.0,
        'commission_rate_percent': '25.0%',
        'store_fill_percentage': 75.0,
        'total_inventory': 5000,
        'store_capacity': 10000,
        'message': 'This is a test endpoint with default values'
    })

# ==================== NEW DB QUERY ENDPOINTS ====================

@app.route('/api/admin/db-schema')
@login_required
def get_db_schema():
    """Get database schema information"""
    if session.get('role') != 'admin':
        return jsonify({
            'status': 'error', 
            'message': 'Admin access required',
            'debug': {
                'role': session.get('role'),
                'logged_in': session.get('logged_in'),
                'session_keys': list(session.keys())
            }
        }), 403
    
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = cursor.fetchall()
        
        schema = {'tables': {}}
        
        for table in tables:
            table_name = table[0]
            
            import re
            if not re.match(r'^[a-zA-Z0-9_]+$', table_name):
                continue
                
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = cursor.fetchall()
            
            schema['tables'][table_name] = []
            for col in columns:
                schema['tables'][table_name].append({
                    'column_name': col[1],
                    'data_type': col[2],
                    'is_nullable': 'YES' if col[3] == 0 else 'NO',
                    'is_primary': col[5] == 1
                })
        
        conn.close()
        return jsonify({'status': 'success', 'schema': schema})
        
    except Exception as e:
        print(f"Error in get_db_schema: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/api/admin/execute-query', methods=['POST'])
@login_required
def execute_query():
    """Execute a SQL query (admin only)"""
    if session.get('role') != 'admin':
        return jsonify({
            'status': 'error', 
            'message': 'Admin access required',
            'debug': {
                'role': session.get('role'),
                'logged_in': session.get('logged_in')
            }
        }), 403
    
    data = request.get_json()
    query = data.get('query', '').strip()
    
    if not query:
        return jsonify({'status': 'error', 'message': 'No query provided'}), 400
    
    if ';' in query and query.count(';') > 1:
        return jsonify({
            'status': 'error', 
            'message': 'Multiple SQL statements are not allowed for security reasons'
        }), 400
    
    dangerous_keywords = ['DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'RENAME']
    query_upper = query.upper()
    for keyword in dangerous_keywords:
        if keyword in query_upper:
            return jsonify({
                'status': 'error',
                'message': f'{keyword} operations are not allowed in the query tool'
            }), 400
    
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        query_type = 'SELECT' if query_upper.lstrip().startswith('SELECT') else \
                    'INSERT' if query_upper.lstrip().startswith('INSERT') else \
                    'UPDATE' if query_upper.lstrip().startswith('UPDATE') else \
                    'DELETE' if query_upper.lstrip().startswith('DELETE') else 'OTHER'
        
        import time
        start_time = time.time()
        
        cursor.execute(query)
        
        execution_time = round((time.time() - start_time) * 1000, 2)
        
        if query_type == 'SELECT':
            rows = cursor.fetchall()
            
            columns = [description[0] for description in cursor.description] if cursor.description else []
            
            results = []
            for row in rows:
                row_dict = {}
                for i, col in enumerate(columns):
                    value = row[i]
                    if hasattr(value, 'isoformat'):
                        value = value.isoformat()
                    row_dict[col] = value
                results.append(row_dict)
            
            conn.close()
            
            return jsonify({
                'status': 'success',
                'query_type': query_type,
                'results': results,
                'count': len(results),
                'execution_time': execution_time
            })
            
        else:
            conn.commit()
            affected_rows = cursor.rowcount
            last_insert_id = cursor.lastrowid if query_type == 'INSERT' else None
            
            conn.close()
            
            return jsonify({
                'status': 'success',
                'query_type': query_type,
                'message': 'Query executed successfully',
                'affected_rows': affected_rows,
                'last_insert_id': last_insert_id,
                'execution_time': execution_time
            })
            
    except Exception as e:
        conn.rollback()
        print(f"Error executing query: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400

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
        
        idempotency_key = str(uuid.uuid4())
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Square-Version': '2026-01-22'
        }
        
        code_data = {
            "idempotency_key": idempotency_key,
            "device_code": {
                "product_type": "TERMINAL_API",
                "location_id": location_id,
                "name": data.get('name', 'PigStyle Terminal')
            }
        }
        
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


# ==================== BATCHES ENDPOINTS ====================

@app.route('/api/batches', methods=['GET'])
@login_required
@role_required(['admin'])
def get_batches():
    """Get all batches with optional filtering"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        status = request.args.get('status')
        search = request.args.get('search', '')
        
        query = '''
            SELECT 
                b.*,
                u.username as created_by_name,
                COUNT(r.id) as record_count,
                COALESCE(SUM(r.store_price), 0) as total_store_value,
                COALESCE(SUM(r.store_price * (b.offer_percentage / 100)), 0) as total_offer_amount
            FROM batches b
            LEFT JOIN users u ON b.created_by = u.id
            LEFT JOIN records r ON r.created_at BETWEEN b.start_datetime AND COALESCE(b.end_datetime, datetime('now'))
            WHERE 1=1
        '''
        params = []
        
        if status:
            query += ' AND b.status = ?'
            params.append(status)
        
        if search:
            query += ' AND (b.seller_name LIKE ? OR b.seller_contact LIKE ? OR b.notes LIKE ?)'
            search_term = f'%{search}%'
            params.extend([search_term, search_term, search_term])
        
        query += ' GROUP BY b.id ORDER BY b.start_datetime DESC'
        
        cursor.execute(query, params)
        batches = cursor.fetchall()
        conn.close()
        
        batches_list = []
        for batch in batches:
            batch_dict = dict(batch)
            
            # Format dates for JSON
            for key in ['start_datetime', 'end_datetime', 'created_at', 'updated_at']:
                if batch_dict.get(key):
                    batch_dict[key] = batch_dict[key]
            
            batches_list.append(batch_dict)
        
        return jsonify({
            'status': 'success',
            'batches': batches_list,
            'count': len(batches_list)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting batches: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/batches/<int:batch_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def get_batch(batch_id):
    """Get a single batch by ID with its records"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get batch info
        cursor.execute('''
            SELECT 
                b.*,
                u.username as created_by_name,
                COUNT(r.id) as record_count,
                COALESCE(SUM(r.store_price), 0) as total_store_value,
                COALESCE(SUM(r.store_price * (b.offer_percentage / 100)), 0) as total_offer_amount
            FROM batches b
            LEFT JOIN users u ON b.created_by = u.id
            LEFT JOIN records r ON r.created_at BETWEEN b.start_datetime AND COALESCE(b.end_datetime, datetime('now'))
            WHERE b.id = ?
            GROUP BY b.id
        ''', (batch_id,))
        
        batch = cursor.fetchone()
        
        if not batch:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Batch not found'
            }), 404
        
        batch_dict = dict(batch)
        
        # Get records in this batch
        if batch_dict['end_datetime']:
            # Completed batch - use end_datetime
            cursor.execute('''
                SELECT 
                    r.id,
                    r.artist,
                    r.title,
                    r.catalog_number,
                    r.barcode,
                    r.store_price,
                    r.created_at,
                    cs.condition_name as sleeve_condition,
                    cd.condition_name as disc_condition,
                    g.genre_name
                FROM records r
                LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
                LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
                LEFT JOIN genres g ON r.genre_id = g.id
                WHERE r.created_at BETWEEN ? AND ?
                ORDER BY r.created_at ASC
            ''', (batch_dict['start_datetime'], batch_dict['end_datetime']))
        else:
            # Active batch - use current time as end
            cursor.execute('''
                SELECT 
                    r.id,
                    r.artist,
                    r.title,
                    r.catalog_number,
                    r.barcode,
                    r.store_price,
                    r.created_at,
                    cs.condition_name as sleeve_condition,
                    cd.condition_name as disc_condition,
                    g.genre_name
                FROM records r
                LEFT JOIN d_condition cs ON r.condition_sleeve_id = cs.id
                LEFT JOIN d_condition cd ON r.condition_disc_id = cd.id
                LEFT JOIN genres g ON r.genre_id = g.id
                WHERE r.created_at >= ?
                ORDER BY r.created_at ASC
            ''', (batch_dict['start_datetime'],))
        
        records = cursor.fetchall()
        conn.close()
        
        records_list = []
        for record in records:
            record_dict = dict(record)
            if record_dict.get('sleeve_condition'):
                record_dict['condition'] = record_dict['sleeve_condition']
            records_list.append(record_dict)
        
        batch_dict['records'] = records_list
        
        return jsonify({
            'status': 'success',
            'batch': batch_dict
        })
        
    except Exception as e:
        app.logger.error(f"Error getting batch: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/batches', methods=['POST'])
@login_required
@role_required(['admin'])
def create_batch():
    """Create a new batch (start offer)"""
    try:
        data = request.get_json()
        
        required_fields = ['seller_name', 'seller_contact']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'status': 'error',
                    'error': f'{field} required'
                }), 400
        
        # Get offer_percentage from request or use default (0)
        offer_percentage = data.get('offer_percentage', 0)
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO batches (
                seller_name,
                seller_contact,
                offer_percentage,
                start_datetime,
                status,
                notes,
                created_by
            ) VALUES (?, ?, ?, datetime('now'), 'active', ?, ?)
        ''', (
            data['seller_name'],
            data['seller_contact'],
            float(offer_percentage),
            data.get('notes', ''),
            session.get('user_id')
        ))
        
        batch_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        app.logger.info(f"Batch {batch_id} created by user {session.get('user_id')}")
        
        return jsonify({
            'status': 'success',
            'message': 'Batch started successfully',
            'batch_id': batch_id
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error creating batch: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/api/batches/<int:batch_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_batch(batch_id):
    """Update a batch (e.g., offer_percentage)"""
    try:
        data = request.get_json()
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if batch exists
        cursor.execute('SELECT id, status FROM batches WHERE id = ?', (batch_id,))
        batch = cursor.fetchone()
        
        if not batch:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Batch not found'
            }), 404
        
        # Update offer_percentage
        if 'offer_percentage' in data:
            cursor.execute('''
                UPDATE batches 
                SET offer_percentage = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (float(data['offer_percentage']), batch_id))
            
            conn.commit()
            conn.close()
            
            app.logger.info(f"Batch {batch_id} offer_percentage updated to {data['offer_percentage']}%")
            
            return jsonify({
                'status': 'success',
                'message': 'Batch updated successfully',
                'batch_id': batch_id,
                'offer_percentage': data['offer_percentage']
            }), 200
        else:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'No valid fields to update'
            }), 400
        
    except Exception as e:
        app.logger.error(f"Error updating batch: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/api/batches/<int:batch_id>/complete', methods=['POST'])
@login_required
@role_required(['admin'])
def complete_batch(batch_id):
    """Mark a batch as completed (finish adding records)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if batch exists and is active
        cursor.execute('SELECT id, status FROM batches WHERE id = ?', (batch_id,))
        batch = cursor.fetchone()
        
        if not batch:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Batch not found'
            }), 404
        
        if batch['status'] != 'active':
            conn.close()
            return jsonify({
                'status': 'error',
                'error': f'Batch is already {batch["status"]}'
            }), 400
        
        # Update batch
        cursor.execute('''
            UPDATE batches 
            SET end_datetime = datetime('now'),
                status = 'completed' 
            WHERE id = ? AND status = 'active'
        ''', (batch_id,))
        
        conn.commit()
        conn.close()
        
        app.logger.info(f"Batch {batch_id} completed")
        
        return jsonify({
            'status': 'success',
            'message': 'Batch completed successfully'
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error completing batch: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/batches/<int:batch_id>/cancel', methods=['POST'])
@login_required
@role_required(['admin'])
def cancel_batch(batch_id):
    """Cancel a batch and optionally delete its records"""
    try:
        data = request.get_json()
        delete_records = data.get('delete_records', True)
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Start transaction
        cursor.execute("BEGIN TRANSACTION")
        
        # Check if batch exists
        cursor.execute('''
            SELECT id, start_datetime, end_datetime, status 
            FROM batches 
            WHERE id = ?
        ''', (batch_id,))
        
        batch = cursor.fetchone()
        
        if not batch:
            conn.rollback()
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Batch not found'
            }), 404
        
        if batch['status'] != 'active' and batch['status'] != 'completed':
            conn.rollback()
            conn.close()
            return jsonify({
                'status': 'error',
                'error': f'Batch is already {batch["status"]}'
            }), 400
        
        # If delete_records is True, delete all records in this batch
        if delete_records:
            if batch['end_datetime']:
                # Completed batch - use end_datetime
                cursor.execute('''
                    DELETE FROM records 
                    WHERE created_at BETWEEN ? AND ?
                ''', (batch['start_datetime'], batch['end_datetime']))
            else:
                # Active batch - use current time
                cursor.execute('''
                    DELETE FROM records 
                    WHERE created_at >= ?
                ''', (batch['start_datetime'],))
            
            deleted_count = cursor.rowcount
            app.logger.info(f"Deleted {deleted_count} records from batch {batch_id}")
        
        # Update batch status to cancelled
        cursor.execute('''
            UPDATE batches 
            SET status = 'cancelled',
                end_datetime = COALESCE(end_datetime, datetime('now')) 
            WHERE id = ?
        ''', (batch_id,))
        
        conn.commit()
        
        message = f'Batch cancelled'
        if delete_records:
            message += f' and {deleted_count} records deleted'
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': message,
            'deleted_records': deleted_count if delete_records else 0
        }), 200
        
    except Exception as e:
        conn.rollback()
        app.logger.error(f"Error cancelling batch: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/batches/<int:batch_id>/print', methods=['GET'])
@login_required
@role_required(['admin'])
def get_batch_print_data(batch_id):
    """Get data formatted for printing bill of sale"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get batch with records
        cursor.execute('''
            SELECT 
                b.*,
                u.username as created_by_name,
                COUNT(r.id) as record_count,
                COALESCE(SUM(r.store_price), 0) as total_store_value,
                COALESCE(SUM(r.store_price * (b.offer_percentage / 100)), 0) as total_offer_amount
            FROM batches b
            LEFT JOIN users u ON b.created_by = u.id
            LEFT JOIN records r ON r.created_at BETWEEN b.start_datetime AND COALESCE(b.end_datetime, datetime('now'))
            WHERE b.id = ?
            GROUP BY b.id
        ''', (batch_id,))
        
        batch = cursor.fetchone()
        
        if not batch:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Batch not found'
            }), 404
        
        batch_dict = dict(batch)
        
        # Get all records in this batch
        if batch_dict['end_datetime']:
            cursor.execute('''
                SELECT 
                    r.id,
                    r.artist,
                    r.title,
                    r.catalog_number,
                    r.barcode,
                    r.store_price,
                    r.created_at
                FROM records r
                WHERE r.created_at BETWEEN ? AND ?
                ORDER BY r.artist, r.title
            ''', (batch_dict['start_datetime'], batch_dict['end_datetime']))
        else:
            cursor.execute('''
                SELECT 
                    r.id,
                    r.artist,
                    r.title,
                    r.catalog_number,
                    r.barcode,
                    r.store_price,
                    r.created_at
                FROM records r
                WHERE r.created_at >= ?
                ORDER BY r.artist, r.title
            ''', (batch_dict['start_datetime'],))
        
        records = cursor.fetchall()
        conn.close()
        
        records_list = [dict(record) for record in records]
        
        # Calculate offer amounts
        offer_percentage = batch_dict['offer_percentage']
        for record in records_list:
            record['offer_price'] = round(record['store_price'] * (offer_percentage / 100), 2)
        
        batch_dict['records'] = records_list
        
        # Format for printing
        print_data = {
            'batch_id': batch_dict['id'],
            'seller_name': batch_dict['seller_name'],
            'seller_contact': batch_dict['seller_contact'],
            'offer_percentage': batch_dict['offer_percentage'],
            'start_date': batch_dict['start_datetime'],
            'end_date': batch_dict['end_datetime'],
            'created_by': batch_dict['created_by_name'],
            'notes': batch_dict['notes'],
            'items': records_list,
            'total_store_value': sum(r['store_price'] for r in records_list),
            'total_offer_amount': sum(r['offer_price'] for r in records_list),
            'item_count': len(records_list)
        }
        
        return jsonify({
            'status': 'success',
            'print_data': print_data
        })
        
    except Exception as e:
        app.logger.error(f"Error getting batch print data: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/batches/stats', methods=['GET'])
@login_required
@role_required(['admin'])
def get_batch_stats():
    """Get batch statistics"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                COUNT(*) as total_batches,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_batches,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_batches,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_batches,
                COALESCE(SUM(
                    SELECT COUNT(*) 
                    FROM records r 
                    WHERE r.created_at BETWEEN b.start_datetime AND COALESCE(b.end_datetime, datetime('now'))
                ), 0) as total_records_in_batches
            FROM batches b
        ''')
        
        stats = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'stats': {
                'total_batches': stats['total_batches'] or 0,
                'active_batches': stats['active_batches'] or 0,
                'completed_batches': stats['completed_batches'] or 0,
                'cancelled_batches': stats['cancelled_batches'] or 0,
                'total_records_in_batches': stats['total_records_in_batches'] or 0
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error getting batch stats: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/batches/current-active', methods=['GET'])
@login_required
@role_required(['admin'])
def get_current_active_batch():
    """Get the currently active batch (if any)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                b.*,
                u.username as created_by_name,
                COUNT(r.id) as record_count,
                COALESCE(SUM(r.store_price), 0) as total_store_value,
                COALESCE(SUM(r.store_price * (b.offer_percentage / 100)), 0) as total_offer_amount
            FROM batches b
            LEFT JOIN users u ON b.created_by = u.id
            LEFT JOIN records r ON r.created_at >= b.start_datetime
            WHERE b.status = 'active'
            GROUP BY b.id
            ORDER BY b.start_datetime DESC
            LIMIT 1
        ''')
        
        batch = cursor.fetchone()
        conn.close()
        
        if not batch:
            return jsonify({
                'status': 'success',
                'has_active': False
            })
        
        batch_dict = dict(batch)
        
        return jsonify({
            'status': 'success',
            'has_active': True,
            'batch': batch_dict
        })
        
    except Exception as e:
        app.logger.error(f"Error getting current active batch: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


# ==================== FEEDBACK ENDPOINTS ====================

@app.route('/api/feedback', methods=['POST'])
def submit_feedback():
    """
    Submit feedback (general or event suggestion)
    Expected JSON:
    {
        "contact_info": "email or phone (optional)",
        "type_of_feedback": "event" or "general",
        "content": "the actual feedback text",
        "event_name": "custom event name or one of the hardcoded options (optional)"
    }
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No data provided'
            }), 400
        
        if 'type_of_feedback' not in data:
            return jsonify({
                'status': 'error',
                'error': 'type_of_feedback is required (event or general)'
            }), 400
        
        if 'content' not in data:
            return jsonify({
                'status': 'error',
                'error': 'content is required'
            }), 400
        
        type_of_feedback = data['type_of_feedback']
        if type_of_feedback not in ['event', 'general']:
            return jsonify({
                'status': 'error',
                'error': 'type_of_feedback must be "event" or "general"'
            }), 400
        
        # Prepare data
        contact_info = data.get('contact_info', '')
        content = data['content']
        event_name = data.get('event_name', '')
        
        # Validate event_name for event feedback
        if type_of_feedback == 'event' and not event_name:
            # If no event name provided, use the content as event name
            event_name = content
            content = f"Event suggestion: {content}"
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO feedback (contact_info, type_of_feedback, content, event_name, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (contact_info, type_of_feedback, content, event_name))
        
        feedback_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        app.logger.info(f"Feedback submitted: ID={feedback_id}, type={type_of_feedback}")
        
        return jsonify({
            'status': 'success',
            'message': 'Thank you for your feedback!',
            'feedback_id': feedback_id
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error submitting feedback: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': f'Server error: {str(e)}'
        }), 500


@app.route('/api/feedback', methods=['GET'])
@login_required
@role_required(['admin'])
def get_all_feedback():
    """
    Get all feedback entries (admin only)
    Query params:
        type: filter by type (event/general)
        status: filter by status (new/read/archived)
        limit: max number of results
        offset: pagination offset
    """
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        type_filter = request.args.get('type')
        status_filter = request.args.get('status', 'new')
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        query = "SELECT * FROM feedback WHERE 1=1"
        params = []
        
        if type_filter and type_filter in ['event', 'general']:
            query += " AND type_of_feedback = ?"
            params.append(type_filter)
        
        if status_filter and status_filter in ['new', 'read', 'archived']:
            query += " AND status = ?"
            params.append(status_filter)
        
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        feedback = cursor.fetchall()
        
        # Get total count for pagination
        count_query = "SELECT COUNT(*) as total FROM feedback WHERE 1=1"
        count_params = []
        if type_filter and type_filter in ['event', 'general']:
            count_query += " AND type_of_feedback = ?"
            count_params.append(type_filter)
        if status_filter and status_filter in ['new', 'read', 'archived']:
            count_query += " AND status = ?"
            count_params.append(status_filter)
        
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['total']
        
        conn.close()
        
        feedback_list = [dict(f) for f in feedback]
        
        return jsonify({
            'status': 'success',
            'feedback': feedback_list,
            'total': total,
            'limit': limit,
            'offset': offset
        })
        
    except Exception as e:
        app.logger.error(f"Error getting feedback: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/feedback/<int:feedback_id>', methods=['GET'])
@login_required
@role_required(['admin'])
def get_feedback(feedback_id):
    """Get a single feedback entry by ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM feedback WHERE id = ?', (feedback_id,))
        feedback = cursor.fetchone()
        conn.close()
        
        if not feedback:
            return jsonify({
                'status': 'error',
                'error': 'Feedback not found'
            }), 404
        
        return jsonify({
            'status': 'success',
            'feedback': dict(feedback)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting feedback: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/feedback/<int:feedback_id>/status', methods=['PATCH'])
@login_required
@role_required(['admin'])
def update_feedback_status(feedback_id):
    """Update the status of a feedback entry"""
    try:
        data = request.get_json()
        
        if not data or 'status' not in data:
            return jsonify({
                'status': 'error',
                'error': 'status is required'
            }), 400
        
        new_status = data['status']
        if new_status not in ['new', 'read', 'archived']:
            return jsonify({
                'status': 'error',
                'error': 'status must be new, read, or archived'
            }), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE feedback 
            SET status = ?,  
            WHERE id = ?
        ''', (new_status, feedback_id))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Feedback not found'
            }), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Feedback status updated to {new_status}'
        })
        
    except Exception as e:
        app.logger.error(f"Error updating feedback status: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/feedback/<int:feedback_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_feedback(feedback_id):
    """Delete a feedback entry (admin only)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM feedback WHERE id = ?', (feedback_id,))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Feedback not found'
            }), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Feedback deleted successfully'
        })
        
    except Exception as e:
        app.logger.error(f"Error deleting feedback: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/feedback/events/suggestions', methods=['GET'])
def get_event_suggestions():
    """
    Get all event-related feedback suggestions
    Returns both the hardcoded options and user-submitted event suggestions
    """
    try:
        # Hardcoded event options
        hardcoded_events = [
            {'id': 'open_mic', 'name': 'Open Mic Night', 'type': 'hardcoded'},
            {'id': 'bring_your_record', 'name': 'Bring Your Favorite Record - Listening Evening', 'type': 'hardcoded'},
            {'id': '78s_listening', 'name': "78's Listening Evening", 'type': 'hardcoded'}
        ]
        
        # Get user-submitted event suggestions from feedback
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, event_name, content, contact_info, created_at
            FROM feedback
            WHERE type_of_feedback = 'event' 
            AND event_name IS NOT NULL 
            AND event_name != ''
            AND status != 'archived'
            ORDER BY created_at DESC
        ''')
        
        user_events = cursor.fetchall()
        conn.close()
        
        user_suggestions = []
        for event in user_events:
            user_suggestions.append({
                'id': f"user_{event['id']}",
                'name': event['event_name'],
                'type': 'user_suggestion',
                'feedback_id': event['id'],
                'details': event['content'],
                'contact_info': event['contact_info'],
                'created_at': event['created_at']
            })
        
        return jsonify({
            'status': 'success',
            'hardcoded_events': hardcoded_events,
            'user_suggestions': user_suggestions,
            'total_suggestions': len(user_suggestions)
        })
        
    except Exception as e:
        app.logger.error(f"Error getting event suggestions: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/feedback/stats', methods=['GET'])
@login_required
@role_required(['admin'])
def get_feedback_stats():
    """Get feedback statistics (admin only)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN type_of_feedback = 'event' THEN 1 ELSE 0 END) as event_count,
                SUM(CASE WHEN type_of_feedback = 'general' THEN 1 ELSE 0 END) as general_count,
                SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
                SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count,
                SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived_count,
                COUNT(DISTINCT CASE WHEN contact_info IS NOT NULL AND contact_info != '' THEN contact_info END) as unique_contacts
            FROM feedback
        ''')
        
        stats = cursor.fetchone()
        
        # Get last 7 days trend
        cursor.execute('''
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count,
                SUM(CASE WHEN type_of_feedback = 'event' THEN 1 ELSE 0 END) as event_count
            FROM feedback
            WHERE created_at >= DATE('now', '-7 days')
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        ''')
        
        trend = cursor.fetchall()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'stats': dict(stats),
            'trend': [dict(t) for t in trend]
        })
        
    except Exception as e:
        app.logger.error(f"Error getting feedback stats: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

# ==================== GIFT CARDS ENDPOINTS ====================

@app.route('/api/gift-cards', methods=['POST'])
def create_gift_card():
    """Create a new gift card"""
    try:
        data = request.json
        amount = float(data.get('amount', 0))
        
        if amount <= 0:
            return jsonify({'success': False, 'error': 'Amount must be greater than 0'}), 400
        
        # Generate simple code: GC_ + 6 random alphanumeric chars (excluding similar looking chars)
        import random
        import string
        chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        code = 'GC_' + ''.join(random.choices(chars, k=6))
        
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('INSERT INTO gift_cards (id, balance) VALUES (?, ?)', (code, amount))
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'card': {
                'id': code,
                'balance': amount,
                'created_at': datetime.now().isoformat()
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error creating gift card: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/gift-cards/<card_id>', methods=['GET'])
def get_gift_card(card_id):
    """Get gift card balance"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, balance, created_at FROM gift_cards WHERE id = ?', (card_id,))
        card = cursor.fetchone()
        conn.close()
        
        if not card:
            return jsonify({'success': False, 'error': 'Gift card not found'}), 404
        
        return jsonify({
            'success': True,
            'card': {
                'id': card['id'],
                'balance': card['balance'],
                'created_at': card['created_at']
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error getting gift card: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/gift-cards/<card_id>/redeem', methods=['POST'])
def redeem_gift_card(card_id):
    """Redeem amount from gift card"""
    try:
        data = request.json
        amount = float(data.get('amount', 0))
        
        if amount <= 0:
            return jsonify({'success': False, 'error': 'Amount must be greater than 0'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT balance FROM gift_cards WHERE id = ?', (card_id,))
        card = cursor.fetchone()
        
        if not card:
            conn.close()
            return jsonify({'success': False, 'error': 'Gift card not found'}), 404
        
        if card['balance'] < amount:
            conn.close()
            return jsonify({'success': False, 'error': 'Insufficient balance'}), 400
        
        new_balance = card['balance'] - amount
        cursor.execute('UPDATE gift_cards SET balance = ? WHERE id = ?', (new_balance, card_id))
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'new_balance': new_balance,
            'redeemed_amount': amount
        })
        
    except Exception as e:
        app.logger.error(f"Error redeeming gift card: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== GIFT CARDS ENDPOINTS ====================


 # ==================== STICKY NOTES MANAGEMENT ENDPOINTS ====================

@app.route('/api/admin/sticky-notes', methods=['GET'])
@login_required
@role_required(['admin'])
def admin_get_sticky_notes():
    """Get all sticky notes (including inactive) for admin management"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT id, note_text, position, is_active, created_at, updated_at
            FROM sticky_notes 
            ORDER BY position ASC, created_at DESC
        ''')
        
        notes = cursor.fetchall()
        
        return jsonify({
            'status': 'success',
            'notes': [dict(note) for note in notes]
        })
        
    except Exception as e:
        app.logger.error(f"Error getting admin sticky notes: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500
    finally:
        conn.close()


@app.route('/api/admin/sticky-notes', methods=['POST'])
@login_required
@role_required(['admin'])
def create_sticky_note():
    """Create a new sticky note"""
    try:
        data = request.get_json()
        
        if not data or 'note_text' not in data:
            return jsonify({
                'status': 'error',
                'error': 'note_text is required'
            }), 400
        
        note_text = data['note_text'].strip()
        if not note_text:
            return jsonify({
                'status': 'error',
                'error': 'Note text cannot be empty'
            }), 400
        
        position = data.get('position', 999)  # Default to end
        is_active = data.get('is_active', True)
        
        conn = get_db()
        cursor = conn.cursor()
        
        # If position is specified, shift other notes
        if position != 999:
            cursor.execute('''
                UPDATE sticky_notes 
                SET position = position + 1 
                WHERE position >= ? AND is_active = 1
            ''', (position,))
        
        cursor.execute('''
            INSERT INTO sticky_notes (note_text, position, is_active)
            VALUES (?, ?, ?)
        ''', (note_text, position, 1 if is_active else 0))
        
        note_id = cursor.lastrowid
        conn.commit()
        
        # Get the created note
        cursor.execute('''
            SELECT id, note_text, position, is_active, created_at, updated_at
            FROM sticky_notes WHERE id = ?
        ''', (note_id,))
        
        new_note = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Sticky note created successfully',
            'note': dict(new_note)
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error creating sticky note: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/admin/sticky-notes/<int:note_id>', methods=['PUT'])
@login_required
@role_required(['admin'])
def update_sticky_note(note_id):
    """Update a sticky note"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No data provided'
            }), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if note exists
        cursor.execute('SELECT id FROM sticky_notes WHERE id = ?', (note_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Sticky note not found'
            }), 404
        
        update_fields = []
        update_values = []
        
        if 'note_text' in data:
            update_fields.append('note_text = ?')
            update_values.append(data['note_text'].strip())
        
        if 'position' in data:
            update_fields.append('position = ?')
            update_values.append(data['position'])
        
        if 'is_active' in data:
            update_fields.append('is_active = ?')
            update_values.append(1 if data['is_active'] else 0)
        
        if not update_fields:
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'No valid fields to update'
            }), 400
        
        update_fields.append('updated_at = CURRENT_TIMESTAMP')
        update_values.append(note_id)
        
        cursor.execute(f'''
            UPDATE sticky_notes 
            SET {', '.join(update_fields)}
            WHERE id = ?
        ''', update_values)
        
        conn.commit()
        
        # Get updated note
        cursor.execute('''
            SELECT id, note_text, position, is_active, created_at, updated_at
            FROM sticky_notes WHERE id = ?
        ''', (note_id,))
        
        updated_note = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Sticky note updated successfully',
            'note': dict(updated_note)
        })
        
    except Exception as e:
        app.logger.error(f"Error updating sticky note: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/admin/sticky-notes/<int:note_id>', methods=['DELETE'])
@login_required
@role_required(['admin'])
def delete_sticky_note(note_id):
    """Delete a sticky note (hard delete)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if note exists
        cursor.execute('SELECT id FROM sticky_notes WHERE id = ?', (note_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({
                'status': 'error',
                'error': 'Sticky note not found'
            }), 404
        
        cursor.execute('DELETE FROM sticky_notes WHERE id = ?', (note_id,))
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': 'Sticky note deleted successfully'
        })
        
    except Exception as e:
        app.logger.error(f"Error deleting sticky note: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/api/admin/sticky-notes/reorder', methods=['POST'])
@login_required
@role_required(['admin'])
def reorder_sticky_notes():
    """Reorder sticky notes by updating their positions"""
    try:
        data = request.get_json()
        
        if not data or 'notes' not in data:
            return jsonify({
                'status': 'error',
                'error': 'notes array required'
            }), 400
        
        notes = data['notes']  # Array of {id, position}
        
        conn = get_db()
        cursor = conn.cursor()
        
        for note in notes:
            cursor.execute('''
                UPDATE sticky_notes 
                SET position = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (note['position'], note['id']))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Reordered {len(notes)} sticky notes'
        })
        
    except Exception as e:
        app.logger.error(f"Error reordering sticky notes: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500
 

@app.route('/api/discogs/combined-inventory', methods=['GET'])
def get_combined_inventory():
    """One API call to Discogs + one DB query = combined inventory with orphan detection"""
    try:
        TOKEN = os.environ.get('DISCOGS_USER_TOKEN')
        if not TOKEN:
            return jsonify({'success': False, 'error': 'Discogs token not configured'}), 500
        
        # Get cutoff date from query parameter (default to 30 days ago)
        cutoff_date = request.args.get('cutoff_date')
        if not cutoff_date:
            from datetime import datetime, timedelta
            cutoff_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        
        headers = {
            'Authorization': f'Discogs token={TOKEN}',
            'User-Agent': 'PigStyleMusic/1.0'
        }
        
        # === STEP 1: Fetch ALL Discogs listings ===
        all_discogs_listings = []
        page = 1
        
        while True:
            response = requests.get(
                'https://api.discogs.com/users/pigstyle/inventory',
                headers=headers,
                params={'page': page, 'per_page': 100}
            )
            
            if response.status_code != 200:
                return jsonify({'success': False, 'error': f'Discogs API error: {response.status_code}'}), response.status_code
            
            data = response.json()
            listings = data.get('listings', [])
            
            if not listings:
                break
            
            for listing in listings:
                release = listing.get('release', {})
                all_discogs_listings.append({
                    'listing_id': str(listing.get('id')),
                    'artist': release.get('artist', 'Unknown'),
                    'title': release.get('title', 'Unknown'),
                    'price': float(listing.get('price', {}).get('value', 0)),
                    'condition': listing.get('condition', ''),
                    'sleeve_condition': listing.get('sleeve_condition', ''),
                    'status': listing.get('status', 'Unknown'),
                    'url': f"https://www.discogs.com/sell/item/{listing.get('id')}"
                })
            
            pagination = data.get('pagination', {})
            if page >= pagination.get('pages', 1):
                break
            page += 1
        
        # === STEP 2: Fetch ALL local records ===
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, artist, title, last_seen, location, discogs_listing_id, store_price, status_id
            FROM records
        ''')
        local_records = cursor.fetchall()
        conn.close()
        
        # === STEP 3: Build local record map by discogs_listing_id ===
        local_map = {}  # discogs_listing_id -> local record
        for record in local_records:
            if record['discogs_listing_id']:
                local_map[str(record['discogs_listing_id'])] = {
                    'id': record['id'],
                    'artist': record['artist'],
                    'title': record['title'],
                    'last_seen': record['last_seen'],
                    'location': record['location'],
                    'discogs_listing_id': record['discogs_listing_id'],
                    'store_price': record['store_price'],
                    'status_id': record['status_id']
                }
        
        # === STEP 4: Helper function - does record meet Discogs criteria? ===
        def meets_criteria(record):
            """Returns True only if ALL criteria are met"""
            if record['status_id'] != 2:
                return False
            if not record['location'] or record['location'].strip() == '':
                return False
            if not record['last_seen']:
                return False
            try:
                from datetime import datetime
                last_seen_date = datetime.strptime(record['last_seen'], '%Y-%m-%d')
                cutoff = datetime.strptime(cutoff_date, '%Y-%m-%d')
                return last_seen_date > cutoff
            except:
                return False
        
        # === STEP 5: Build Discogs map ===
        discogs_map = {}
        for listing in all_discogs_listings:
            discogs_map[listing['listing_id']] = listing
        
        # === STEP 6: Build combined results ===
        combined_results = []
        processed_listing_ids = set()
        processed_record_ids = set()
        
        # Check each Discogs listing against local records
        for listing_id, discogs_item in discogs_map.items():
            local_match = local_map.get(listing_id)
            
            if local_match and meets_criteria(local_match):
                # Perfect match - keep
                combined_results.append({
                    'type': 'both',
                    'record_id': local_match['id'],
                    'listing_id': listing_id,
                    'artist': local_match['artist'],
                    'title': local_match['title'],
                    'last_seen': local_match['last_seen'],
                    'location': local_match['location'],
                    'price': discogs_item['price'],
                    'discogs_status': discogs_item['status'],
                    'local_status_id': local_match['status_id'],
                    'url': discogs_item['url'],
                    'should_delete': False
                })
                processed_listing_ids.add(listing_id)
                processed_record_ids.add(local_match['id'])
            else:
                # Discogs orphan - local record missing or doesn't meet criteria
                reason = ''
                if not local_match:
                    reason = 'No matching local record'
                elif local_match['status_id'] != 2:
                    reason = f'Local status is not Active (status_id={local_match["status_id"]})'
                elif not local_match['location'] or local_match['location'].strip() == '':
                    reason = 'Local record missing location'
                elif not local_match['last_seen']:
                    reason = 'Local record missing last_seen'
                else:
                    reason = f'Local last_seen ({local_match["last_seen"]}) <= {cutoff_date}'
                
                combined_results.append({
                    'type': 'discogs_orphan',
                    'record_id': local_match['id'] if local_match else None,
                    'listing_id': listing_id,
                    'artist': discogs_item['artist'],
                    'title': discogs_item['title'],
                    'last_seen': local_match['last_seen'] if local_match else None,
                    'location': local_match['location'] if local_match else None,
                    'price': discogs_item['price'],
                    'discogs_status': discogs_item['status'],
                    'local_status_id': local_match['status_id'] if local_match else None,
                    'url': discogs_item['url'],
                    'reason': reason,
                    'should_delete': True
                })
                processed_listing_ids.add(listing_id)
        
        # Check local records that have discogs_listing_id but no matching Discogs listing
        for record in local_records:
            if record['id'] in processed_record_ids:
                continue
            
            if record['discogs_listing_id'] and meets_criteria(record):
                listing_id = str(record['discogs_listing_id'])
                if listing_id not in discogs_map:
                    # Local orphan - has discogs_listing_id but not on Discogs
                    combined_results.append({
                        'type': 'local_orphan',
                        'record_id': record['id'],
                        'listing_id': listing_id,
                        'artist': record['artist'],
                        'title': record['title'],
                        'last_seen': record['last_seen'],
                        'location': record['location'],
                        'price': record['store_price'],
                        'discogs_status': None,
                        'local_status_id': record['status_id'],
                        'url': None,
                        'reason': 'discogs_listing_id not found on Discogs',
                        'should_clear': True
                    })
                    processed_record_ids.add(record['id'])
        
        # Add eligible records that are not on Discogs at all
        for record in local_records:
            if record['id'] in processed_record_ids:
                continue
            
            if meets_criteria(record) and not record['discogs_listing_id']:
                combined_results.append({
                    'type': 'not_listed',
                    'record_id': record['id'],
                    'listing_id': None,
                    'artist': record['artist'],
                    'title': record['title'],
                    'last_seen': record['last_seen'],
                    'location': record['location'],
                    'price': record['store_price'],
                    'discogs_status': None,
                    'local_status_id': record['status_id'],
                    'url': None,
                    'reason': 'Eligible but not listed on Discogs',
                    'should_list': True
                })
                processed_record_ids.add(record['id'])
        
        # Calculate stats
        both_count = len([r for r in combined_results if r['type'] == 'both'])
        discogs_orphan_count = len([r for r in combined_results if r['type'] == 'discogs_orphan'])
        local_orphan_count = len([r for r in combined_results if r['type'] == 'local_orphan'])
        not_listed_count = len([r for r in combined_results if r['type'] == 'not_listed'])
        
        return jsonify({
            'success': True,
            'results': combined_results,
            'count': len(combined_results),
            'cutoff_date': cutoff_date,
            'stats': {
                'total': len(combined_results),
                'both': both_count,
                'discogs_orphans': discogs_orphan_count,
                'local_orphans': local_orphan_count,
                'not_listed': not_listed_count
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error in get_combined_inventory: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/discogs/stats', methods=['GET'])
def get_discogs_stats():
    """Get true counts from database without filtering"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Total records
        cursor.execute('SELECT COUNT(*) as count FROM records')
        total_records = cursor.fetchone()['count']
        
        # Active records (status_id = 2)
        cursor.execute('SELECT COUNT(*) as count FROM records WHERE status_id = 2')
        active_records = cursor.fetchone()['count']
        
        # Records with discogs_listing_id (ever listed)
        cursor.execute('SELECT COUNT(*) as count FROM records WHERE discogs_listing_id IS NOT NULL')
        on_discogs = cursor.fetchone()['count']
        
        conn.close()
        
        return jsonify({
            'success': True,
            'stats': {
                'total_records': total_records,
                'active_records': active_records,
                'on_discogs': on_discogs
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)