# discogs_handler.py
import requests
import json
import re
import time
from typing import Dict, List, Optional
import logging

# Set up logging for API calls
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DiscogsHandler:
    def __init__(self, user_token: str):
        self.user_token = user_token
        self.base_url = "https://api.discogs.com"
        self.headers = {
            "User-Agent": "PigStyleInventory/1.0",
            "Authorization": f"Discogs token={self.user_token}"
        }
        # Cache for release pricing data
        self._release_cache = {}
    
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
                'barcode': barcode
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

    def clear_cache(self):
        """Clear the pricing cache"""
        self._release_cache = {}
        logger.info("Discogs cache cleared")