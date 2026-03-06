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
            'per_page': 25,  # Reduced from 50 for faster response
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
        seen_masters = set()
        
        for result in search_data.get('results', []):
            master_id = result.get('master_id')
            
            if master_id and master_id in seen_masters:
                continue
                
            if master_id:
                seen_masters.add(master_id)
            
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

    def clear_cache(self):
        """Clear the pricing cache"""
        self._release_cache = {}
        self._condition_cache = None
        logger.info("Discogs cache cleared")