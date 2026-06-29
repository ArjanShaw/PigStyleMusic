# discogs_handler.py
import requests
import json
import re
import time
from typing import Dict, List, Optional
import logging
import sqlite3

# Set up logging for API calls
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DiscogsHandler:
    def __init__(self, user_token: str, db_path: str = None):
        self.user_token = user_token
        self.base_url = "https://api.discogs.com"
        self.headers = {
            "User-Agent": "PigStyleInventory/1.0",
            "Authorization": f"Discogs token={self.user_token}"
        }
        # Cache for release pricing data
        self._release_cache = {}
        self._orders_cache = {}
        self.db_path = db_path or 'data/records.db'
        self._condition_cache = None
        self._load_condition_cache()
    
    def _load_condition_cache(self):
        """Load condition data from database into cache"""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT id, condition_name, display_name, quality_index,
                       is_consignor_allowed, ebay_condition_id, abbreviation
                FROM d_condition
            ''')
            
            self._condition_cache = [dict(row) for row in cursor.fetchall()]
            conn.close()
        except Exception as e:
            logger.error(f"Error loading condition cache: {e}")
            self._condition_cache = []
    
    def get_condition_by_name(self, condition_name: str) -> Optional[Dict]:
        """Get condition data by name"""
        if not self._condition_cache:
            self._load_condition_cache()
        
        for condition in self._condition_cache:
            if condition['condition_name'].lower() == condition_name.lower():
                return condition
        return None
    
    def get_condition_by_id(self, condition_id: int) -> Optional[Dict]:
        """Get condition data by ID"""
        if not self._condition_cache:
            self._load_condition_cache()
        
        for condition in self._condition_cache:
            if condition['id'] == condition_id:
                return condition
        return None
    
    # Condition pattern matching for text detection
    CONDITION_PATTERNS = {
        "Mint (M)": [r'\bmint\b', r'\bm\b', r'\bstill sealed\b', r'\bsealed\b'],
        "Near Mint (NM or M-)": [r'\bnear mint\b', r'\bnm\b', r'\bm-\b', r'\bm\s*-\s*'],
        "Very Good Plus (VG+)": [r'\bvery good plus\b', r'\bvg\+\b', r'\bvg\s*\+\s*'],
        "Very Good (VG)": [r'\bvery good\b', r'\bvg\b'],
        "Good Plus (G+)": [r'\bgood plus\b', r'\bg\+\b', r'\bg\s*\+\s*'],
        "Good (G)": [r'\bgood\b', r'\bg\b'],
        "Fair (F)": [r'\bfair\b', r'\bf\b'],
        "Poor (P)": [r'\bpoor\b', r'\bp\b']
    }
    
    CONDITION_ABBREVIATIONS = {
        "Mint (M)": ["M", "Mint"],
        "Near Mint (NM or M-)": ["NM", "M-", "Near Mint"],
        "Very Good Plus (VG+)": ["VG+"],
        "Very Good (VG)": ["VG"],
        "Good Plus (G+)": ["G+"],
        "Good (G)": ["G"],
        "Fair (F)": ["F"],
        "Poor (P)": ["P"]
    }
    
    def detect_condition_from_text(self, text: str) -> Optional[str]:
        """Detect condition name from text"""
        if not text:
            return None
        
        text_lower = text.lower()
        
        for condition, patterns in self.CONDITION_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, text_lower, re.IGNORECASE):
                    return condition
        
        return None
    
    def get_condition_id_from_text(self, text: str) -> Optional[int]:
        """Get condition ID from text detection"""
        condition_name = self.detect_condition_from_text(text)
        if condition_name:
            condition = self.get_condition_by_name(condition_name)
            return condition['id'] if condition else None
        return None
    
    def extract_conditions_from_release(self, release_data: Dict) -> Dict:
        """Extract sleeve and disc conditions from release data"""
        result = {
            'sleeve_condition_id': None,
            'disc_condition_id': None,
            'sleeve_condition_name': None,
            'disc_condition_name': None
        }
        
        # Try to find condition info in notes
        if 'notes' in release_data:
            for note in release_data.get('notes', []):
                text = note.get('text', '')
                condition_name = self.detect_condition_from_text(text)
                if condition_name:
                    condition = self.get_condition_by_name(condition_name)
                    if condition:
                        text_lower = text.lower()
                        # Check if note specifies sleeve or disc
                        if 'sleeve' in text_lower or 'cover' in text_lower:
                            result['sleeve_condition_id'] = condition['id']
                            result['sleeve_condition_name'] = condition_name
                        elif 'disc' in text_lower or 'vinyl' in text_lower or 'record' in text_lower:
                            result['disc_condition_id'] = condition['id']
                            result['disc_condition_name'] = condition_name
                        else:
                            # If not specified, set both to same value
                            if not result['sleeve_condition_id']:
                                result['sleeve_condition_id'] = condition['id']
                                result['sleeve_condition_name'] = condition_name
                            if not result['disc_condition_id']:
                                result['disc_condition_id'] = condition['id']
                                result['disc_condition_name'] = condition_name
        
        # Try to find in community data
        if 'community' in release_data:
            community = release_data.get('community', {})
            if 'data_quality' in community:
                condition_name = self.detect_condition_from_text(community['data_quality'])
                if condition_name and not result['sleeve_condition_id']:
                    condition = self.get_condition_by_name(condition_name)
                    if condition:
                        result['sleeve_condition_id'] = condition['id']
                        result['sleeve_condition_name'] = condition_name
        
        return result
    
    def get_release_statistics_pricing(self, release_id: str, use_cache: bool = True):
        """Get pricing data with timing measurement and caching"""
        # Check cache first if enabled
        if use_cache and release_id in self._release_cache:
            cache_entry = self._release_cache[release_id]
            if time.time() - cache_entry['timestamp'] < 300:  # 5 minute cache
                logger.info(f"Discogs Cache Hit: Release {release_id}")
                return cache_entry['data']
        
        endpoint_url = f"{self.base_url}/marketplace/price_suggestions/{release_id}"
        
        start_time = time.time()
        logger.info(f"Discogs API CALL [START]: GET /marketplace/price_suggestions/{release_id}")
        
        response = requests.get(
            endpoint_url,
            headers=self.headers,
            timeout=15
        )
        
        duration = time.time() - start_time
        logger.info(f"Discogs API CALL [END]: GET /marketplace/price_suggestions/{release_id} - {duration:.3f}s - Status: {response.status_code}")
        
        if response.status_code != 200:
            logger.error(f"Discogs API Error {response.status_code}: {response.text}")
            return None
        
        data = response.json()
        
        price_suggestions = {}
        for condition, price_data in data.items():
            price_value = self._parse_price_from_suggestion(price_data)
            if price_value:
                # Map Discogs condition names to our condition IDs
                condition_obj = self.get_condition_by_name(condition)
                if condition_obj:
                    price_suggestions[condition_obj['id']] = {
                        'price': price_value,
                        'condition_name': condition,
                        'condition_id': condition_obj['id']
                    }
                else:
                    price_suggestions[condition] = price_value
        
        result = {
            'price_suggestions': price_suggestions,
            'success': True,
            'total_conditions': len(price_suggestions),
            'release_id': release_id,
            'api_time': duration
        }
        
        # Cache the result
        self._release_cache[release_id] = {
            'data': result,
            'timestamp': time.time()
        }
        
        return result

    def _parse_price_from_suggestion(self, price_data):
        if not price_data:
            return None
        
        if isinstance(price_data, dict):
            if 'value' in price_data:
                price_float = float(price_data['value'])
                if 0.1 <= price_float <= 10000:
                    return round(price_float, 2)
        
        return self._parse_price(price_data)

    def get_simple_search_results(self, query: str):
        """Get simple search results with timing measurement"""
        endpoint_url = f"{self.base_url}/database/search"
        params = {
            'q': query,
            'type': 'release',
            'per_page': 25,
            'currency': 'USD'
        }
        
        start_time = time.time()
        logger.info(f"Discogs API CALL [START]: GET /database/search?q={query[:50]}...")
        
        response = requests.get(
            endpoint_url,
            params=params,
            headers=self.headers,
            timeout=15
        )
        
        duration = time.time() - start_time
        logger.info(f"Discogs API CALL [END]: GET /database/search?q={query[:50]}... - {duration:.3f}s - Status: {response.status_code}")
        
        if response.status_code != 200:
            error_msg = f"Discogs API returned status {response.status_code}: {response.text}"
            logger.error(error_msg)
            raise Exception(error_msg)
        
        search_data = response.json()
        
        formatted_results = []
        
        for result in search_data.get('results', []):
            master_id = result.get('master_id')
            
            artist = self._extract_artist_from_result(result)
            title = self._extract_title_from_result(result)
            image_url = self._extract_image_from_result(result)
            catalog_number = self._extract_catalog_number(result)
            release_id = result.get('id')
            year = result.get('year', '')
            format_info = self._extract_format_info(result)
            country = result.get('country', '')
            genre = self._extract_genre_from_result(result)
            barcode = result.get('barcode', '')
            
            # Try to detect condition from title or notes
            condition_result = self.extract_conditions_from_release(result)
            
            formatted_result = {
                'artist': artist,
                'title': title,
                'image_url': image_url,
                'catalog_number': catalog_number,
                'discogs_id': release_id,
                'year': year,
                'format': format_info,
                'country': country,
                'master_id': master_id,
                'genre': genre,
                'barcode': barcode,
                'suggested_sleeve_condition_id': condition_result['sleeve_condition_id'],
                'suggested_disc_condition_id': condition_result['disc_condition_id'],
                'suggested_sleeve_condition': condition_result['sleeve_condition_name'],
                'suggested_disc_condition': condition_result['disc_condition_name']
            }
            formatted_results.append(formatted_result)
        
        return formatted_results

    def _extract_genre_from_result(self, result):
        if not isinstance(result, dict):
            return ""
        
        genres = result.get('genre', [])
        if genres and isinstance(genres, list) and len(genres) > 0:
            return genres[0]
        
        styles = result.get('style', [])
        if styles and isinstance(styles, list) and len(styles) > 0:
            return styles[0]
                
        return ""

    def _extract_image_from_result(self, result):
        image_fields = [
            result.get('cover_image'),
            result.get('thumb'),
            result.get('images', [{}])[0].get('uri'),
            result.get('images', [{}])[0].get('uri150'),
        ]
        
        for image_field in image_fields:
            if image_field and isinstance(image_field, str) and image_field.startswith('http'):
                return image_field
        
        return ""
    
    def _parse_price(self, price_data):
        if not price_data:
            return None
        
        if isinstance(price_data, (int, float)):
            price_float = float(price_data)
            if 0.1 <= price_float <= 10000:
                return round(price_float, 2)
            return None
        
        if isinstance(price_data, dict):
            for key in ['value', 'amount', 'price']:
                if key in price_data:
                    return self._parse_price(price_data[key])
            return None
        
        if isinstance(price_data, str):
            cleaned = re.sub(r'[^\d.,]', '', str(price_data))
            
            if not cleaned:
                return None
            
            if ',' in cleaned and '.' in cleaned:
                cleaned = cleaned.replace(',', '')
            elif ',' in cleaned:
                parts = cleaned.split(',')
                if len(parts) == 2 and len(parts[1]) <= 2:
                    cleaned = cleaned.replace(',', '.')
                else:
                    cleaned = cleaned.replace(',', '')
            
            cleaned = re.sub(r'[^\d.]', '', cleaned)
            
            if cleaned:
                price_float = float(cleaned)
                if 0.1 <= price_float <= 10000:
                    return round(price_float, 2)
        
        return None
    
    def _extract_artist_from_result(self, result):
        if isinstance(result, dict):
            if result.get('artists') and isinstance(result['artists'], list):
                for artist in result['artists']:
                    if artist.get('name'):
                        artist_name = artist['name']
                        artist_name = re.sub(r'\s*\(\d+\)\s*$', '', artist_name)
                        return artist_name.strip()
            
            if result.get('artist'):
                artist_name = result['artist']
                artist_name = re.sub(r'\s*\(\d+\)\s*$', '', artist_name)
                return artist_name.strip()
            
            if result.get('title'):
                title = result['title']
                if ' - ' in title:
                    artist_name = title.split(' - ')[0].strip()
                    artist_name = re.sub(r'\s*\(\d+\)\s*$', '', artist_name)
                    return artist_name.strip()
        
        return 'Unknown Artist'

    def _extract_title_from_result(self, result):
        if isinstance(result, dict):
            if result.get('title'):
                title_text = result['title']
                if ' - ' in title_text:
                    parts = title_text.split(' - ', 1)
                    return parts[1].strip()
                return title_text
        return 'Unknown Title'

    def _extract_catalog_number(self, result):
        if not isinstance(result, dict):
            return ''
            
        if result.get('catno'):
            return result['catno']
        
        if result.get('label'):
            labels = result['label']
            if isinstance(labels, list):
                for label in labels:
                    if isinstance(label, dict) and label.get('catno'):
                        return label['catno']
                    elif isinstance(label, str):
                        if any(char.isdigit() for char in label):
                            return label
            elif isinstance(labels, str):
                if any(char.isdigit() for char in labels):
                    return labels
        
        if result.get('format') and isinstance(result['format'], list):
            for format_item in result['format']:
                if isinstance(format_item, str) and any(char.isdigit() for char in format_item):
                    return format_item
        
        return ''

    def _extract_format_info(self, result):
        if not isinstance(result, dict):
            return ''
            
        format_list = result.get('format', [])
        if isinstance(format_list, list):
            return ', '.join([str(f) for f in format_list])
        elif isinstance(format_list, str):
            return format_list
        return ''

    def get_release_details(self, release_id: str):
        """Get detailed release information including notes for condition detection"""
        endpoint_url = f"{self.base_url}/releases/{release_id}"
        
        start_time = time.time()
        logger.info(f"Discogs API CALL [START]: GET /releases/{release_id}")
        
        response = requests.get(
            endpoint_url,
            headers=self.headers,
            timeout=15
        )
        
        duration = time.time() - start_time
        logger.info(f"Discogs API CALL [END]: GET /releases/{release_id} - {duration:.3f}s - Status: {response.status_code}")
        
        if response.status_code != 200:
            logger.error(f"Discogs API Error {response.status_code}: {response.text}")
            return None
        
        data = response.json()
        
        # Extract conditions from release details
        conditions = self.extract_conditions_from_release(data)
        
        result = {
            'release': data,
            'conditions': conditions,
            'success': True,
            'api_time': duration
        }
        
        return result

    def get_orders(self, status: str = None, page: int = 1, per_page: int = 50):
        """
        Fetch orders from Discogs API.
        
        Args:
            status: Filter by status (New, Paid, Shipped, etc.)
            page: Page number for pagination
            per_page: Items per page (max 100)
        
        Returns:
            Dict with orders list and pagination info
        """
        endpoint_url = f"{self.base_url}/marketplace/orders"
        
        params = {
            'page': page,
            'per_page': min(per_page, 100)
        }
        
        if status:
            params['status'] = status
        
        start_time = time.time()
        logger.info(f"Discogs API CALL [START]: GET /marketplace/orders - page={page}, status={status}")
        
        response = requests.get(
            endpoint_url,
            params=params,
            headers=self.headers,
            timeout=30
        )
        
        duration = time.time() - start_time
        logger.info(f"Discogs API CALL [END]: GET /marketplace/orders - {duration:.3f}s - Status: {response.status_code}")
        
        if response.status_code != 200:
            logger.error(f"Discogs API Error {response.status_code}: {response.text}")
            return {
                'success': False,
                'error': f"Discogs API returned status {response.status_code}: {response.text[:200]}",
                'orders': [],
                'pagination': {'page': page, 'per_page': per_page, 'pages': 0, 'items': 0}
            }
        
        try:
            data = response.json()
            logger.info(f"Response type: {type(data)}")
            logger.info(f"Response keys: {data.keys() if isinstance(data, dict) else 'not a dict'}")
        except Exception as e:
            logger.error(f"Failed to parse JSON: {e}")
            return {
                'success': False,
                'error': f"Failed to parse JSON: {str(e)}",
                'orders': [],
                'pagination': {'page': page, 'per_page': per_page, 'pages': 0, 'items': 0}
            }
        
        # Parse orders
        orders = []
        orders_data = data.get('orders', [])
        
        logger.info(f"Found {len(orders_data)} orders in response")
        
        for order_data in orders_data:
            try:
                order = self._parse_order(order_data)
                if order:
                    orders.append(order)
            except Exception as e:
                logger.error(f"Error parsing order: {e}")
                continue
        
        pagination = data.get('pagination', {})
        
        return {
            'success': True,
            'orders': orders,
            'pagination': {
                'page': pagination.get('page', page),
                'per_page': pagination.get('per_page', per_page),
                'pages': pagination.get('pages', 0),
                'items': pagination.get('items', 0)
            }
        }

    def get_order_details(self, order_id: str) -> Dict:
        """
        Get detailed information for a single order.
        
        Args:
            order_id: The Discogs order ID
        
        Returns:
            Dict with order details
        """
        endpoint_url = f"{self.base_url}/marketplace/orders/{order_id}"
        
        start_time = time.time()
        logger.info(f"Discogs API CALL [START]: GET /marketplace/orders/{order_id}")
        
        response = requests.get(
            endpoint_url,
            headers=self.headers,
            timeout=15
        )
        
        duration = time.time() - start_time
        logger.info(f"Discogs API CALL [END]: GET /marketplace/orders/{order_id} - {duration:.3f}s - Status: {response.status_code}")
        
        if response.status_code != 200:
            logger.error(f"Discogs API Error {response.status_code}: {response.text}")
            return {
                'success': False,
                'error': f"Discogs API returned status {response.status_code}: {response.text[:200]}"
            }
        
        try:
            data = response.json()
        except Exception as e:
            logger.error(f"Failed to parse JSON: {e}")
            return {
                'success': False,
                'error': f"Failed to parse JSON: {str(e)}"
            }
        
        # Parse the order
        order = self._parse_order(data)
        
        return {
            'success': True,
            'order': order
        }

    def _parse_order(self, order_data: Dict) -> Dict:
        """
        Parse Discogs order data into a clean format.
        
        Args:
            order_data: Raw order data from Discogs API
        
        Returns:
            Parsed order dict
        """
        if not order_data:
            return {}
        
        if isinstance(order_data, str):
            # If it's a string, try to parse it as JSON
            try:
                order_data = json.loads(order_data)
            except:
                return {}
        
        if not isinstance(order_data, dict):
            return {}
        
        # Extract shipping address
        shipping_address = order_data.get('shipping_address', '')
        if isinstance(shipping_address, dict):
            # Sometimes it's a dict
            address_parts = []
            address_parts.append(shipping_address.get('name', ''))
            address_parts.append(shipping_address.get('street', ''))
            city = shipping_address.get('city', '')
            state = shipping_address.get('state', '')
            zipcode = shipping_address.get('zip', '')
            country = shipping_address.get('country', '')
            
            if city:
                address_parts.append(city)
            if state:
                address_parts.append(state)
            if zipcode:
                address_parts.append(zipcode)
            if country:
                address_parts.append(country)
            
            shipping_address = ', '.join([p for p in address_parts if p])
        elif not isinstance(shipping_address, str):
            shipping_address = ''
        
        # Get items
        items = order_data.get('items', [])
        if isinstance(items, str):
            try:
                items = json.loads(items)
            except:
                items = []
        
        parsed_items = []
        for item in items:
            if isinstance(item, str):
                try:
                    item = json.loads(item)
                except:
                    continue
                    
            if not isinstance(item, dict):
                continue
                
            # Try to get artist and title from the item
            release = item.get('release', {})
            if isinstance(release, str):
                try:
                    release = json.loads(release)
                except:
                    release = {}
            
            # Get artist and title
            artist = release.get('artist', '') or item.get('artist', 'Unknown Artist')
            title = release.get('title', '') or item.get('title', 'Unknown Title')
            
            # If title contains " - ", it might be "Artist - Title"
            if ' - ' in title and not artist:
                parts = title.split(' - ', 1)
                artist = parts[0]
                title = parts[1] if len(parts) > 1 else title
            
            # Handle price
            price_data = item.get('price', {})
            if isinstance(price_data, (int, float)):
                price = float(price_data)
            elif isinstance(price_data, dict):
                price = float(price_data.get('value', 0))
            else:
                price = 0
                
            # ==== ADDED: Extract condition_comments, private_comments, and release description ====
            condition_comments = item.get('condition_comments', '')
            private_comments = item.get('private_comments', '')
            release_description = release.get('description', '') if isinstance(release, dict) else ''
                
            parsed_items.append({
                'release_id': item.get('release_id') or release.get('id'),
                'listing_id': item.get('listing_id'),
                'artist': artist,
                'title': title,
                'catalog_number': release.get('catalog_number', '') or item.get('catalog_number', ''),
                'media_condition': item.get('media_condition', ''),
                'sleeve_condition': item.get('sleeve_condition', ''),
                'price': price,
                'quantity': item.get('quantity', 1),
                # ==== NEW FIELDS for PigStyle ID extraction ====
                'condition_comments': condition_comments,
                'private_comments': private_comments,
                'release_description': release_description,
                # Keep full release object for future use
                'release': release if isinstance(release, dict) else {}
            })
        
        # Parse amounts
        total_data = order_data.get('total', {})
        if isinstance(total_data, (int, float)):
            total_amount = float(total_data)
        elif isinstance(total_data, dict):
            total_amount = float(total_data.get('value', 0))
        else:
            total_amount = 0
        
        shipping_data = order_data.get('shipping', {})
        if isinstance(shipping_data, (int, float)):
            shipping_amount = float(shipping_data)
        elif isinstance(shipping_data, dict):
            shipping_amount = float(shipping_data.get('value', 0))
        else:
            shipping_amount = 0
        
        # Parse dates
        created_at = order_data.get('created')
        if created_at and 'T' in created_at:
            created_at = created_at.split('T')[0]
        
        paid_at = order_data.get('paid_at')
        if paid_at and 'T' in paid_at:
            paid_at = paid_at.split('T')[0]
        
        shipped_at = order_data.get('shipped_at')
        if shipped_at and 'T' in shipped_at:
            shipped_at = shipped_at.split('T')[0]
        
        # Handle buyer
        buyer = order_data.get('buyer', {})
        if isinstance(buyer, str):
            try:
                buyer = json.loads(buyer)
            except:
                buyer = {}
        
        # Get currency
        currency = 'USD'
        if isinstance(total_data, dict):
            currency = total_data.get('currency', 'USD')
        
        return {
            'order_id': order_data.get('id'),
            'status': order_data.get('status', 'Unknown'),
            'buyer_username': buyer.get('username', '') if isinstance(buyer, dict) else '',
            'buyer_name': buyer.get('name', '') if isinstance(buyer, dict) else '',
            'buyer_email': buyer.get('email', '') if isinstance(buyer, dict) else '',
            'shipping_address': shipping_address,
            'shipping_method': order_data.get('shipping_method', ''),
            'total_amount': total_amount,
            'shipping_amount': shipping_amount,
            'subtotal': total_amount - shipping_amount,
            'currency': currency,
            'created_at': created_at,
            'paid_at': paid_at,
            'shipped_at': shipped_at,
            'items': parsed_items,
            'buyer_message': order_data.get('additional_instructions', '') or '',
            'feedback': {
                'buyer_feedback': order_data.get('buyer_feedback', {}),
                'seller_feedback': order_data.get('seller_feedback', {})
            }
        }

    def get_all_orders(self, status: str = None) -> List[Dict]:
        """
        Get all orders (handles pagination).
        
        Args:
            status: Filter by status
        
        Returns:
            List of all orders
        """
        all_orders = []
        page = 1
        per_page = 100
        
        while True:
            result = self.get_orders(status=status, page=page, per_page=per_page)
            
            if not result['success']:
                break
            
            orders = result['orders']
            if not orders:
                break
            
            all_orders.extend(orders)
            
            pagination = result['pagination']
            if page >= pagination.get('pages', 1):
                break
            // ============================================================================
// discogs-orders.js - Discogs Orders Management with Barcode Scanning
// ============================================================================

console.log('📦 discogs-orders.js loading...');

let currentOrders = [];
let ordersPagination = null;
let isLoadingOrders = false;
let ordersSearchTerm = '';
let ordersStatusFilter = '';
let ordersInitialized = false;

// DOM Elements
let ordersTableBody = null;
let ordersRefreshBtn = null;
let ordersStatusFilterSelect = null;
let ordersSearchInput = null;
let ordersSearchButton = null;
let ordersStatusMessage = null;
let ordersTotalDisplay = null;
let ordersRevenueDisplay = null;
let ordersPaginationContainer = null;
let ordersPrevPageBtn = null;
let ordersNextPageBtn = null;
let ordersPageInfo = null;

// ============================================================================
// Initialize Orders Tab
// ============================================================================

function initDiscogsOrdersTab() {
    console.log('📦 initDiscogsOrdersTab() called');
    
    if (ordersInitialized) {
        console.log('📦 Already initialized, skipping');
        return;
    }
    
    // Get DOM elements
    ordersTableBody = document.getElementById('discogs-orders-body');
    ordersRefreshBtn = document.getElementById('discogs-orders-refresh');
    ordersStatusFilterSelect = document.getElementById('discogs-orders-status-filter');
    ordersSearchInput = document.getElementById('discogs-orders-search');
    ordersSearchButton = document.getElementById('discogs-orders-search-btn');
    ordersStatusMessage = document.getElementById('discogs-orders-status');
    ordersTotalDisplay = document.getElementById('discogs-orders-total');
    ordersRevenueDisplay = document.getElementById('discogs-orders-revenue');
    ordersPaginationContainer = document.getElementById('discogs-orders-pagination');
    ordersPrevPageBtn = document.getElementById('discogs-orders-prev');
    ordersNextPageBtn = document.getElementById('discogs-orders-next');
    ordersPageInfo = document.getElementById('discogs-orders-page-info');
    
    console.log('📦 DOM elements found:', {
        ordersTableBody: !!ordersTableBody,
        ordersRefreshBtn: !!ordersRefreshBtn,
        ordersStatusFilterSelect: !!ordersStatusFilterSelect,
        ordersSearchInput: !!ordersSearchInput,
        ordersSearchButton: !!ordersSearchButton,
        ordersStatusMessage: !!ordersStatusMessage
    });
    
    if (!ordersTableBody) {
        console.error('❌ ordersTableBody not found! Check HTML for id="discogs-orders-body"');
        return;
    }
    
    // Set up event listeners
    if (ordersRefreshBtn) {
        ordersRefreshBtn.addEventListener('click', function() {
            console.log('📦 Refresh button clicked');
            loadDiscogsOrders();
        });
    }
    
    if (ordersStatusFilterSelect) {
        ordersStatusFilterSelect.addEventListener('change', function() {
            console.log('📦 Status filter changed to:', this.value);
            ordersStatusFilter = this.value;
            loadDiscogsOrders();
        });
    }
    
    if (ordersSearchButton) {
        ordersSearchButton.addEventListener('click', function() {
            ordersSearchTerm = ordersSearchInput ? ordersSearchInput.value.trim() : '';
            console.log('📦 Search clicked:', ordersSearchTerm);
            loadDiscogsOrders();
        });
    }
    
    if (ordersSearchInput) {
        ordersSearchInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') {
                ordersSearchTerm = this.value.trim();
                console.log('📦 Search enter:', ordersSearchTerm);
                loadDiscogsOrders();
            }
        });
    }
    
    if (ordersPrevPageBtn) {
        ordersPrevPageBtn.addEventListener('click', function() {
            if (ordersPagination && ordersPagination.page > 1) {
                console.log('📦 Previous page clicked');
                loadDiscogsOrders(ordersPagination.page - 1);
            }
        });
    }
    
    if (ordersNextPageBtn) {
        ordersNextPageBtn.addEventListener('click', function() {
            if (ordersPagination && ordersPagination.page < ordersPagination.pages) {
                console.log('📦 Next page clicked');
                loadDiscogsOrders(ordersPagination.page + 1);
            }
        });
    }
    
    ordersInitialized = true;
    console.log('✅ Discogs Orders Tab initialized');
    
    // Load orders
    loadDiscogsOrders();
}

// ============================================================================
// Load Orders from API
// ============================================================================

async function loadDiscogsOrders(page = 1) {
    console.log('📦 loadDiscogsOrders() called, page:', page);
    
    if (isLoadingOrders) {
        console.log('📦 Already loading, skipping');
        return;
    }
    
    isLoadingOrders = true;
    
    // Show loading state
    if (ordersTableBody) {
        ordersTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-spinner fa-pulse" style="font-size: 24px;"></i>
                    <p style="margin-top: 10px; color: #666;">Loading orders from Discogs...</p>
                    <p style="font-size: 12px; color: #999; margin-top: 5px;">Check console for debug info</p>
                </td>
            </tr>
        `;
    }
    
    try {
        if (typeof AppConfig === 'undefined') {
            console.error('❌ AppConfig is not defined!');
            throw new Error('AppConfig not loaded. Please refresh the page.');
        }
        
        console.log('📦 AppConfig found:', AppConfig);
        console.log('📦 AppConfig.baseUrl:', AppConfig.baseUrl);
        
        let url = `${AppConfig.baseUrl}/api/discogs/orders?page=${page}&per_page=50`;
        
        if (ordersStatusFilter && ordersStatusFilter.trim() !== '') {
            url += `&status=${encodeURIComponent(ordersStatusFilter)}`;
        }
        
        console.log(`📦 Fetching orders from: ${url}`);
        
        let headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        if (AppConfig.getHeaders) {
            console.log('📦 Using AppConfig.getHeaders()');
            headers = { ...headers, ...AppConfig.getHeaders() };
        }
        
        console.log('📦 Headers:', headers);
        
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: headers
        });
        
        console.log(`📦 Response status: ${response.status}`);
        console.log(`📦 Response statusText: ${response.statusText}`);
        
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                console.log('📦 Error response:', errorData);
                if (errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch (e) {
                console.log('📦 Could not parse error response as JSON');
                const text = await response.text();
                console.log('📦 Raw error response:', text);
            }
            
            if (response.status === 401) {
                throw new Error('Not authenticated. Please log in as admin.');
            } else if (response.status === 403) {
                throw new Error('Admin access required.');
            } else if (response.status === 500) {
                throw new Error(`Server error (500). Check Flask logs.`);
            } else {
                throw new Error(errorMessage);
            }
        }
        
        const data = await response.json();
        console.log('📦 Response data:', data);
        console.log('📦 Response status:', data.status);
        console.log('📦 Orders count:', data.orders ? data.orders.length : 0);
        
        if (data.status === 'success') {
            currentOrders = data.orders || [];
            ordersPagination = data.pagination || null;
            
            console.log(`📦 Loaded ${currentOrders.length} orders`);
            
            renderOrdersTable(currentOrders);
            updatePagination();
            updateStats(currentOrders);
            updateStatusMessage(`✅ Loaded ${currentOrders.length} orders`, 'success');
        } else {
            throw new Error(data.error || 'Failed to load orders');
        }
        
    } catch (error) {
        console.error('❌ Error loading Discogs orders:', error);
        console.error('❌ Error stack:', error.stack);
        
        if (ordersTableBody) {
            ordersTableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: #dc3545;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 32px; display: block; margin-bottom: 15px;"></i>
                        <p style="font-size: 16px; font-weight: 600; margin-bottom: 5px;">Error loading orders</p>
                        <p style="font-size: 14px; color: #666; margin-bottom: 15px;">${escapeHtml(error.message)}</p>
                        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-sm" onclick="loadDiscogsOrders()" style="padding: 8px 20px;">
                                <i class="fas fa-sync-alt"></i> Retry
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="checkDiscogsAuth()" style="padding: 8px 20px;">
                                <i class="fas fa-key"></i> Check Auth
                            </button>
                        </div>
                        <p style="font-size: 12px; color: #999; margin-top: 15px;">Check browser console for more details</p>
                    </td>
                </tr>
            `;
        }
        
        updateStatusMessage(`❌ Error: ${error.message}`, 'error');
    } finally {
        isLoadingOrders = false;
        console.log('📦 loadDiscogsOrders() finished, isLoadingOrders:', isLoadingOrders);
    }
}

// ============================================================================
// Check Discogs Authentication
// ============================================================================

async function checkDiscogsAuth() {
    console.log('📦 checkDiscogsAuth() called');
    
    try {
        if (typeof AppConfig === 'undefined') {
            console.error('❌ AppConfig not defined');
            alert('❌ AppConfig not loaded. Please refresh the page.');
            return;
        }
        
        console.log('📦 Checking auth at:', `${AppConfig.baseUrl}/api/discogs/check-auth`);
        
        const response = await fetch(`${AppConfig.baseUrl}/api/discogs/check-auth`, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        console.log('📦 Auth response status:', response.status);
        
        const data = await response.json();
        console.log('📦 Auth data:', data);
        
        if (data.authenticated) {
            alert('✅ Authenticated with Discogs');
        } else {
            alert('❌ Not authenticated with Discogs. Please authenticate first.');
        }
        
    } catch (error) {
        console.error('❌ Auth check error:', error);
        alert(`Error checking auth: ${error.message}`);
    }
}

// ============================================================================
// Render Orders Table (list view)
// ============================================================================

function renderOrdersTable(orders) {
    console.log('📦 renderOrdersTable() called with', orders ? orders.length : 0, 'orders');
    
    if (!ordersTableBody) {
        console.error('❌ ordersTableBody is null');
        return;
    }
    
    if (!orders || orders.length === 0) {
        console.log('📦 No orders to display');
        ordersTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-inbox" style="font-size: 48px; display: block; margin-bottom: 15px; color: #ccc;"></i>
                    <p>No orders found${ordersStatusFilter ? ` with status "${ordersStatusFilter}"` : ''}.</p>
                    <p style="font-size: 13px; margin-top: 5px;">Click Refresh to fetch orders from Discogs.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    let filteredOrders = orders;
    if (ordersSearchTerm) {
        const searchLower = ordersSearchTerm.toLowerCase();
        filteredOrders = orders.filter(order => {
            const orderId = (order.order_id || '').toLowerCase();
            const buyer = (order.buyer_username || '').toLowerCase();
            const buyerName = (order.buyer_name || '').toLowerCase();
            return orderId.includes(searchLower) || 
                   buyer.includes(searchLower) || 
                   buyerName.includes(searchLower);
        });
        console.log(`📦 Filtered to ${filteredOrders.length} orders matching "${ordersSearchTerm}"`);
    }
    
    if (filteredOrders.length === 0) {
        ordersTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-search" style="font-size: 32px; display: block; margin-bottom: 15px; color: #ccc;"></i>
                    <p>No orders matching "${ordersSearchTerm}"</p>
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    
    const sortedOrders = [...filteredOrders].sort((a, b) => {
        if (!a.created_at && !b.created_at) return 0;
        if (!a.created_at) return 1;
        if (!b.created_at) return -1;
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return dateB - dateA;
    });
    
    console.log(`📦 Sorted ${sortedOrders.length} orders, newest first`);
    
    for (const order of sortedOrders) {
        const items = order.items || [];
        let artist = 'Unknown';
        let title = 'Unknown';
        let catalog = '';
        
        if (items.length > 0) {
            const firstItem = items[0];
            artist = firstItem.artist || 'Unknown';
            title = firstItem.title || 'Unknown';
            catalog = firstItem.catalog_number || '';
        }
        
        const itemCount = items.length;
        const titleDisplay = itemCount > 1 ? `${title} (+${itemCount - 1} more)` : title;
        const statusBadge = getStatusBadge(order.status);
        const amount = order.total_amount || 0;
        const currency = order.currency || 'USD';
        const amountDisplay = `${currency} ${amount.toFixed(2)}`;
        const createdDate = order.created_at ? formatDate(order.created_at) : '—';
        const paidDate = order.paid_at ? formatDate(order.paid_at) : '—';
        
        html += `
            <tr>
                <td>
                    <div style="font-weight: 600; font-size: 13px;">${escapeHtml(order.order_id || '—')}</div>
                    <div style="font-size: 11px; color: #999;">${escapeHtml(order.buyer_username || '')}</div>
                </td>
                <td>
                    <div style="font-weight: 600;">${escapeHtml(artist)}</div>
                    <div style="font-size: 13px; color: #555;">${escapeHtml(titleDisplay)}</div>
                    ${catalog ? `<div style="font-size: 11px; color: #999;">${escapeHtml(catalog)}</div>` : ''}
                </td>
                <td style="font-weight: 600; color: #28a745;">${amountDisplay}</td>
                <td>${statusBadge}</td>
                <td style="font-size: 13px;">${createdDate}</td>
                <td style="font-size: 13px;">${paidDate}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewDiscogsOrder('${order.order_id}')" style="padding: 4px 8px; font-size: 12px;">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }
    
    ordersTableBody.innerHTML = html;
    console.log(`📦 Rendered ${sortedOrders.length} orders, newest first`);
}

// ============================================================================
// Update Statistics
// ============================================================================

function updateStats(orders) {
    if (ordersTotalDisplay) {
        ordersTotalDisplay.textContent = orders.length;
    }
    
    if (ordersRevenueDisplay) {
        let totalRevenue = 0;
        for (const order of orders) {
            totalRevenue += order.total_amount || 0;
        }
        ordersRevenueDisplay.textContent = `$${totalRevenue.toFixed(2)}`;
    }
}

// ============================================================================
// Get Status Badge HTML
// ============================================================================

function getStatusBadge(status) {
    const statusMap = {
        'Pending': { class: 'status-badge status-pending', label: '⏳ Pending' },
        'Payment Received': { class: 'status-badge status-paid', label: '✅ Payment Received' },
        'In Progress': { class: 'status-badge status-in-progress', label: '🔄 In Progress' },
        'Shipped': { class: 'status-badge status-shipped', label: '📦 Shipped' },
        'Completed': { class: 'status-badge status-completed', label: '✔️ Completed' },
        'Cancelled (Item Unavailable)': { class: 'status-badge status-cancelled', label: '❌ Cancelled' },
        'Cancelled (Per Buyer\'s Request)': { class: 'status-badge status-cancelled', label: '❌ Cancelled by Buyer' }
    };
    
    const mapping = statusMap[status] || { class: 'status-badge', label: status || 'Unknown' };
    return `<span class="${mapping.class}">${mapping.label}</span>`;
}

// ============================================================================
// Update Pagination Controls
// ============================================================================

function updatePagination() {
    if (!ordersPaginationContainer) return;
    
    if (!ordersPagination || ordersPagination.pages <= 1) {
        ordersPaginationContainer.style.display = 'none';
        return;
    }
    
    ordersPaginationContainer.style.display = 'flex';
    
    const currentPage = ordersPagination.page || 1;
    const totalPages = ordersPagination.pages || 1;
    
    if (ordersPrevPageBtn) {
        ordersPrevPageBtn.disabled = currentPage <= 1;
    }
    
    if (ordersNextPageBtn) {
        ordersNextPageBtn.disabled = currentPage >= totalPages;
    }
    
    if (ordersPageInfo) {
        ordersPageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
}

// ============================================================================
// View Order Details (Modal)
// ============================================================================

async function viewDiscogsOrder(orderId) {
    if (!orderId) return;
    showOrderDetailModal(orderId);
}

function showOrderDetailModal(orderId) {
    let modal = document.getElementById('discogs-order-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="discogs-order-modal" class="modal-overlay" style="display: none; z-index: 10002;">
                <div class="modal-content" style="max-width: 850px; width: 95%; background: white; border-radius: 8px;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 20px; border-radius: 8px 8px 0 0;">
                        <h3 id="discogs-order-modal-title" style="margin: 0; color: white;">Order Details</h3>
                        <button class="modal-close" onclick="closeDiscogsOrderModal()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; float: right;">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px; max-height: 600px; overflow-y: auto;">
                        <div id="discogs-order-modal-content">
                            <div style="text-align: center; padding: 30px;">
                                <i class="fas fa-spinner fa-pulse" style="font-size: 32px;"></i>
                                <p>Loading order details...</p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #ddd; border-radius: 0 0 8px 8px; display: flex; justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="closeDiscogsOrderModal()">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('discogs-order-modal');
    }
    
    modal.style.display = 'flex';
    loadOrderDetail(orderId);
}

async function loadOrderDetail(orderId) {
    const content = document.getElementById('discogs-order-modal-content');
    if (!content) return;
    
    content.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <i class="fas fa-spinner fa-pulse" style="font-size: 32px;"></i>
            <p>Loading order details...</p>
        </div>
    `;
    
    try {
        const url = `${AppConfig.baseUrl}/api/discogs/orders/${orderId}`;
        const response = await fetch(url, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success' && data.order) {
            renderOrderDetail(data.order);
        } else {
            throw new Error(data.error || 'Failed to load order details');
        }
        
    } catch (error) {
        console.error('Error loading order detail:', error);
        content.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle" style="font-size: 32px;"></i>
                <p>Error loading order details: ${error.message}</p>
            </div>
        `;
    }
}

// ============================================================================
// Helper: Extract PigStyle ID from item fields
// ============================================================================

function extractPigstyleIdFromItem(item) {
    // Log the full item to console for debugging
    console.log('🔍 Item data:', item);
    
    // Try condition_comments first (most common)
    if (item.condition_comments) {
        const match = item.condition_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
        if (match) {
            console.log(`✅ Found PigStyle ID in condition_comments: ${match[1]}`);
            return parseInt(match[1], 10);
        }
    }
    
    // Try private_comments
    if (item.private_comments) {
        const match = item.private_comments.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
        if (match) {
            console.log(`✅ Found PigStyle ID in private_comments: ${match[1]}`);
            return parseInt(match[1], 10);
        }
    }
    
    // Try release.description (unlikely but just in case)
    if (item.release && item.release.description) {
        const match = item.release.description.match(/\[PIGSTYLE ID:\s*(\d+)\]/i);
        if (match) {
            console.log(`✅ Found PigStyle ID in release.description: ${match[1]}`);
            return parseInt(match[1], 10);
        }
    }
    
    console.warn('⚠️ No PigStyle ID found in item:', item);
    return null;
}

// ============================================================================
// Render Order Detail with Barcode Scanning (includes PigStyle ID column)
// ============================================================================

function renderOrderDetail(order) {
    console.log('🔥 renderOrderDetail called with order:', order.order_id);
    
    const content = document.getElementById('discogs-order-modal-content');
    if (!content) {
        console.error('❌ Content element not found');
        return;
    }
    
    const items = order.items || [];
    const statusBadge = getStatusBadge(order.status);
    const currency = order.currency || 'USD';
    const orderId = order.order_id || '';
    
    let html = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div>
                <div style="font-size: 12px; color: #999;">Order ID</div>
                <div style="font-weight: 600; font-size: 16px;">${escapeHtml(orderId)}</div>
            </div>
            <div>
                <div style="font-size: 12px; color: #999;">Status</div>
                <div>${statusBadge}</div>
            </div>
            <div>
                <div style="font-size: 12px; color: #999;">Buyer</div>
                <div style="font-weight: 600;">${escapeHtml(order.buyer_username || '—')}</div>
                <div style="font-size: 13px; color: #666;">${escapeHtml(order.buyer_name || '')}</div>
                <div style="font-size: 13px; color: #666;">${escapeHtml(order.buyer_email || '')}</div>
            </div>
            <div>
                <div style="font-size: 12px; color: #999;">Total</div>
                <div style="font-weight: 600; font-size: 18px; color: #28a745;">${currency} ${(order.total_amount || 0).toFixed(2)}</div>
                <div style="font-size: 13px; color: #666;">Subtotal: ${currency} ${(order.subtotal || 0).toFixed(2)}</div>
                <div style="font-size: 13px; color: #666;">Shipping: ${currency} ${(order.shipping_amount || 0).toFixed(2)}</div>
            </div>
            <div>
                <div style="font-size: 12px; color: #999;">Created</div>
                <div>${order.created_at ? formatDate(order.created_at) : '—'}</div>
            </div>
            <div>
                <div style="font-size: 12px; color: #999;">Paid</div>
                <div>${order.paid_at ? formatDate(order.paid_at) : '—'}</div>
            </div>
        </div>
        
        <div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="font-weight: 600;">Items (${items.length})</div>
            </div>
            <div style="margin-bottom: 15px; padding: 10px; background: #fff3cd; border-radius: 4px; font-size: 13px; color: #856404;">
                <i class="fas fa-info-circle"></i> 
                <strong>SCAN BARCODE:</strong> Type or scan the barcode, then press Enter.
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 8px; text-align: left;">Artist</th>
                        <th style="padding: 8px; text-align: left;">Title</th>
                        <th style="padding: 8px; text-align: center;">PigStyle ID</th>   <!-- ★ NEW COLUMN HEADER -->
                        <th style="padding: 8px; text-align: left;">Condition</th>
                        <th style="padding: 8px; text-align: right;">Price</th>
                        <th style="padding: 8px; text-align: center;">Qty</th>
                        <th style="padding: 8px; text-align: center;">Barcode Scan</th>
                        <th style="padding: 8px; text-align: center;">Status</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemPrice = item.price || 0;
        const itemCurrency = currency;
        const itemArtist = item.artist || 'Unknown';
        const itemTitle = item.title || 'Unknown';
        const rowId = `item-${orderId}-${i}`;
        
        // Extract PigStyle ID using the enhanced function
        const pigstyleId = extractPigstyleIdFromItem(item);
        const pigstyleDisplay = pigstyleId ? `#${pigstyleId}` : '—';
        
        html += `
            <tr style="border-bottom: 1px solid #eee;" id="${rowId}">
                <td style="padding: 8px;">${escapeHtml(itemArtist)}</td>
                <td style="padding: 8px;">${escapeHtml(itemTitle)}</td>
                <td style="padding: 8px; text-align: center; font-weight: bold; color: #007bff;">${pigstyleDisplay}</td>   <!-- ★ NEW DATA CELL -->
                <td style="padding: 8px; font-size: 12px;">${escapeHtml(item.media_condition || '—')}</td>
                <td style="padding: 8px; text-align: right; font-weight: 600;">${itemCurrency} ${itemPrice.toFixed(2)}</td>
                <td style="padding: 8px; text-align: center;">${item.quantity || 1}</td>
                <td style="padding: 8px; text-align: center;">
                    <input type="text" 
                        class="barcode-scan-input" 
                        data-order-id="${escapeHtml(orderId)}" 
                        data-item-index="${i}"
                        data-price="${itemPrice}"
                        data-artist="${escapeHtml(itemArtist)}"
                        data-title="${escapeHtml(itemTitle)}"
                        data-row-id="${rowId}"
                        placeholder="Scan barcode..."
                        style="width: 160px; padding: 8px 10px; border: 3px solid #28a745; border-radius: 4px; font-size: 14px; text-align: center; background: #f0fff0; font-weight: bold;"
                        ${i === 0 ? 'autofocus' : ''}
                    >
                </td>
                <td style="padding: 8px; text-align: center;">
                    <span class="item-status" style="font-size: 12px; color: #999; font-weight: bold;">Waiting...</span>
                </td>
            </tr>
        `;
    }
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    if (order.shipping_address) {
        html += `
            <div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 15px;">
                <div style="font-weight: 600; margin-bottom: 5px;">Shipping Address</div>
                <div style="font-size: 14px; color: #333;">${escapeHtml(order.shipping_address)}</div>
                <div style="font-size: 13px; color: #666; margin-top: 5px;">Method: ${escapeHtml(order.shipping_method || '—')}</div>
            </div>
        `;
    }
    
    if (order.buyer_message) {
        html += `
            <div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 15px;">
                <div style="font-weight: 600; margin-bottom: 5px;">Buyer Message</div>
                <div style="font-size: 14px; color: #333; background: #f8f9fa; padding: 10px; border-radius: 4px;">${escapeHtml(order.buyer_message)}</div>
            </div>
        `;
    }
    
    content.innerHTML = html;
    
    // Add event listeners for barcode inputs
    const inputs = content.querySelectorAll('.barcode-scan-input');
    console.log(`✅ Found ${inputs.length} barcode input fields - THEY SHOULD BE VISIBLE NOW!`);
    
    inputs.forEach(input => {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const barcode = this.value.trim();
                if (barcode) {
                    handleBarcodeScan(this);
                }
            }
        });
    });
    
    if (inputs.length > 0) {
        inputs[0].focus();
    }
}

// ============================================================================
// Handle Barcode Scan
// ============================================================================

async function handleBarcodeScan(inputElement) {
    console.log('🔍 handleBarcodeScan called');
    const barcode = inputElement.value.trim();
    
    if (!barcode) {
        showToast('Please enter or scan a barcode.', 'warning');
        return;
    }
    
    const orderId = inputElement.dataset.orderId;
    const salePrice = parseFloat(inputElement.dataset.price);
    const artist = inputElement.dataset.artist;
    const title = inputElement.dataset.title;
    const rowId = inputElement.dataset.rowId;
    
    // Show loading state
    const statusSpan = document.querySelector(`#${rowId} .item-status`);
    if (statusSpan) {
        statusSpan.innerHTML = '⏳ Searching...';
        statusSpan.style.color = '#ffc107';
    }
    
    inputElement.disabled = true;
    
    try {
        // Search for records with this barcode
        const searchUrl = `${AppConfig.baseUrl}/api/records/search-by-barcode?barcode=${encodeURIComponent(barcode)}`;
        console.log('🔍 Searching:', searchUrl);
        
        const response = await fetch(searchUrl, {
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {}
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('🔍 Search results:', data);
        
        if (data.status === 'success') {
            const matches = data.records || [];
            
            if (matches.length === 0) {
                // No matches found
                if (statusSpan) {
                    statusSpan.innerHTML = '❌ No match found';
                    statusSpan.style.color = '#dc3545';
                }
                inputElement.style.borderColor = '#dc3545';
                inputElement.disabled = false;
                inputElement.focus();
                inputElement.select();
                showToast(`No record found with barcode: ${barcode}`, 'error');
                return;
            }
            
            if (matches.length === 1) {
                // Single match - mark it as sold
                const record = matches[0];
                await markRecordSold(record.id, salePrice, orderId, artist, title, rowId, inputElement);
            } else {
                // Multiple matches - let user choose
                await handleMultipleMatches(matches, {
                    orderId,
                    salePrice,
                    artist,
                    title,
                    rowId,
                    inputElement
                });
            }
        } else {
            throw new Error(data.error || 'Failed to search for barcode');
        }
        
    } catch (error) {
        console.error('❌ Error scanning barcode:', error);
        if (statusSpan) {
            statusSpan.innerHTML = '❌ Error';
            statusSpan.style.color = '#dc3545';
        }
        inputElement.style.borderColor = '#dc3545';
        inputElement.disabled = false;
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ============================================================================
// Handle Multiple Matches
// ============================================================================

function handleMultipleMatches(matches, itemData) {
    // Create a modal for selecting the correct record
    let modal = document.getElementById('duplicate-record-selection-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="duplicate-record-selection-modal" class="modal-overlay" style="display: none; z-index: 10003;">
                <div class="modal-content" style="max-width: 600px; width: 90%; background: white; border-radius: 8px;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%); color: #333; padding: 15px 20px; border-radius: 8px 8px 0 0;">
                        <h3 style="margin: 0; color: #333;">Multiple Records Found</h3>
                        <button class="modal-close" onclick="closeDuplicateSelectionModal()" style="background: none; border: none; color: #333; font-size: 24px; cursor: pointer; float: right;">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px; max-height: 400px; overflow-y: auto;">
                        <p style="margin-bottom: 15px; color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px;">
                            <i class="fas fa-exclamation-triangle"></i> 
                            Multiple records found with this barcode. Please select the correct one:
                        </p>
                        <div id="duplicate-selection-list"></div>
                    </div>
                    <div class="modal-footer" style="padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #ddd; border-radius: 0 0 8px 8px; display: flex; justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="closeDuplicateSelectionModal()">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('duplicate-record-selection-modal');
    }
    
    // Store the item data for use in selection
    modal.dataset.itemData = JSON.stringify(itemData);
    
    // Render the list of matches
    const listContainer = document.getElementById('duplicate-selection-list');
    if (listContainer) {
        let html = '';
        for (const record of matches) {
            const statusText = record.status_name || 'Unknown';
            const statusColor = record.status_id === 2 ? '#28a745' : '#ffc107';
            html += `
                <div class="record-selection-item" 
                     style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 8px; cursor: pointer; hover:background: #f0f0f0;"
                     onclick="selectDuplicateRecord(${record.id}, '${escapeHtml(record.artist)}', '${escapeHtml(record.title)}')">
                    <div>
                        <div style="font-weight: 600;">${escapeHtml(record.artist)} - ${escapeHtml(record.title)}</div>
                        <div style="font-size: 12px; color: #666;">ID: ${record.id} | Catalog: ${escapeHtml(record.catalog_number || 'N/A')} | Price: $${(record.store_price || 0).toFixed(2)}</div>
                        <div style="font-size: 12px; color: ${statusColor};">Status: ${statusText}</div>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-primary" style="padding: 4px 12px;">Select</button>
                    </div>
                </div>
            `;
        }
        listContainer.innerHTML = html;
    }
    
    modal.style.display = 'flex';
}

// ============================================================================
// Select Duplicate Record
// ============================================================================

async function selectDuplicateRecord(recordId, artist, title) {
    const modal = document.getElementById('duplicate-record-selection-modal');
    if (!modal) return;
    
    const itemData = JSON.parse(modal.dataset.itemData || '{}');
    
    closeDuplicateSelectionModal();
    
    // Mark the selected record as sold
    await markRecordSold(
        recordId,
        itemData.salePrice,
        itemData.orderId,
        itemData.artist,
        itemData.title,
        itemData.rowId,
        itemData.inputElement
    );
}

function closeDuplicateSelectionModal() {
    const modal = document.getElementById('duplicate-record-selection-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ============================================================================
// Mark Record as Sold
// ============================================================================

async function markRecordSold(recordId, salePrice, orderId, artist, title, rowId, inputElement) {
    const statusSpan = document.querySelector(`#${rowId} .item-status`);
    
    if (statusSpan) {
        statusSpan.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Marking as sold...';
        statusSpan.style.color = '#ffc107';
    }
    
    try {
        const url = `${AppConfig.baseUrl}/api/records/mark-sold-on-discogs`;
        
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: AppConfig.getHeaders ? AppConfig.getHeaders() : {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                record_id: recordId,
                sale_price: salePrice,
                discogs_order_id: orderId
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            // Update the UI
            if (statusSpan) {
                statusSpan.innerHTML = '✅ SOLD!';
                statusSpan.style.color = '#28a745';
            }
            
            if (inputElement) {
                inputElement.style.borderColor = '#28a745';
                inputElement.style.background = '#d4edda';
                inputElement.disabled = true;
            }
            
            // Update the row background
            const row = document.getElementById(rowId);
            if (row) {
                row.style.background = '#d4edda';
            }
            
            showToast(`✅ "${artist} - ${title}" marked as sold for $${salePrice.toFixed(2)}`, 'success');
            
            // Focus the next input if available
            const inputs = document.querySelectorAll('.barcode-scan-input:not([disabled])');
            let currentIndex = -1;
            for (let i = 0; i < inputs.length; i++) {
                if (inputs[i] === inputElement) {
                    currentIndex = i;
                    break;
                }
            }
            if (currentIndex >= 0 && currentIndex < inputs.length - 1) {
                setTimeout(() => {
                    inputs[currentIndex + 1].focus();
                }, 500);
            }
            
            // Refresh orders list after a delay
            setTimeout(() => {
                loadDiscogsOrders();
            }, 3000);
            
        } else {
            throw new Error(data.error || 'Failed to mark as sold');
        }
        
    } catch (error) {
        console.error('❌ Error marking record as sold:', error);
        if (statusSpan) {
            statusSpan.innerHTML = '❌ Error';
            statusSpan.style.color = '#dc3545';
        }
        if (inputElement) {
            inputElement.style.borderColor = '#dc3545';
            inputElement.disabled = false;
        }
        showToast(`❌ Error: ${error.message}`, 'error');
    }
}

// ============================================================================
// Toast Notification
// ============================================================================

function showToast(message, type) {
    // Create toast container if it doesn't exist
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 100000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 400px;
        `;
        document.body.appendChild(container);
    }
    
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${colors[type] || colors.info};
        color: ${type === 'warning' ? '#333' : 'white'};
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-size: 14px;
        animation: slideInRight 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 500);
    }, 4000);
}

// ============================================================================
// Close Order Modal
// ============================================================================

function closeDiscogsOrderModal() {
    const modal = document.getElementById('discogs-order-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return dateStr;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateStatusMessage(message, type) {
    if (!ordersStatusMessage) return;
    
    type = type || 'info';
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    
    ordersStatusMessage.innerHTML = (icons[type] || 'ℹ️') + ' ' + escapeHtml(message);
    ordersStatusMessage.className = `status-message status-${type}`;
    ordersStatusMessage.style.display = 'block';
    
    setTimeout(function() {
        if (ordersStatusMessage) {
            ordersStatusMessage.style.display = 'none';
        }
    }, 8000);
}

// ============================================================================
// Tab Activation Handler
// ============================================================================

document.addEventListener('tabChanged', function(e) {
    console.log('📦 tabChanged event received:', e.detail);
    if (e.detail && e.detail.tabName === 'discogs-orders') {
        console.log('📦 Discogs Orders tab activated');
        setTimeout(function() {
            console.log('📦 Calling initDiscogsOrdersTab after delay');
            initDiscogsOrdersTab();
        }, 100);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 DOMContentLoaded fired');
    const ordersTab = document.querySelector('.tab[data-tab="discogs-orders"]');
    console.log('📦 Orders tab element:', ordersTab);
    if (ordersTab) {
        console.log('📦 Orders tab classes:', ordersTab.className);
        if (ordersTab.classList.contains('active')) {
            console.log('📦 Orders tab is active, initializing');
            setTimeout(initDiscogsOrdersTab, 200);
        } else {
            console.log('📦 Orders tab is not active, waiting for tab change');
        }
    } else {
        console.error('❌ Orders tab element not found!');
    }
});

// Add CSS animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    .barcode-scan-input:focus {
        border-color: #007bff !important;
        box-shadow: 0 0 0 3px rgba(0,123,255,0.25);
        outline: none;
    }
    .barcode-scan-input:disabled {
        background: #e9ecef;
        cursor: not-allowed;
    }
    .record-selection-item:hover {
        background: #f0f0f0 !important;
    }
`;
document.head.appendChild(styleSheet);

console.log('✅ discogs-orders.js loaded');
            page += 1
        
        return all_orders

    def clear_cache(self):
        """Clear all caches"""
        self._release_cache = {}
        self._orders_cache = {}
        self._condition_cache = None
        logger.info("Discogs cache cleared")