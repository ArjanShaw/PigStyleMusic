"""
PriceAdviseHandler - Integrated price estimation with eBay and Discogs
"""
import re
import time
import requests
import base64
import logging
import os
import json
from datetime import datetime

logger = logging.getLogger(__name__)

class PriceAdviseHandler:
    def __init__(self, discogs_token=None, ebay_client_id=None, ebay_client_secret=None):
        # Credentials
        self.discogs_token = discogs_token or os.environ.get('DISCOGS_USER_TOKEN')
        self.ebay_client_id = ebay_client_id or os.environ.get('EBAY_CLIENT_ID')
        self.ebay_client_secret = ebay_client_secret or os.environ.get('EBAY_CLIENT_SECRET')
        self.ebay_access_token = None
        self.token_expiry = None
        
        # Import condition patterns
        try:
            from conditions import DiscogsConditions
            self.DiscogsConditions = DiscogsConditions
        except ImportError:
            # Fallback if conditions module not available
            logger.warning("conditions.py not found, using simple condition patterns")
            class SimpleConditions:
                CONDITION_PATTERNS = {
                    'Mint (M)': [r'\bmint\b'],
                    'Near Mint (NM or M-)': [r'\bnear mint\b', r'\bNM\b'],
                    'Very Good Plus (VG+)': [r'\bvery good plus\b', r'\bVG\+\b'],
                    'Very Good (VG)': [r'\bvery good\b', r'\bVG\b'],
                    'Good Plus (G+)': [r'\bgood plus\b', r'\bG\+\b'],
                    'Good (G)': [r'\bgood\b', r'\bG\b'],
                    'Fair (F)': [r'\bfair\b', r'\bF\b'],
                    'Poor (P)': [r'\bpoor\b', r'\bP\b']
                }
            self.DiscogsConditions = SimpleConditions
        
        # Import rounding handler
        try:
            from handlers.rounding_handler import RoundingHandler
            self.RoundingHandler = RoundingHandler
        except ImportError:
            logger.warning("rounding_handler.py not found, using simple rounding")
            class SimpleRounding:
                @staticmethod
                def round_to_99(price):
                    return round(price, 2)
            self.RoundingHandler = SimpleRounding
    
    def get_price_estimate(self, artist, title, selected_condition, discogs_genre=None, discogs_id=None):
        """
        Get price estimate from eBay and Discogs
        Returns minimum of both sources
        """
        result = {
            'discogs_price': None,
            'ebay_price': None,
            'estimated_price': 0.0,
            'price_source': 'unknown',
            'calculation': [],
            'success': False,
            'error': None
        }
        
        try:
            # Step 1: Get Discogs price
            discogs_price = self._get_discogs_price(artist, title, selected_condition, discogs_id)
            result['discogs_price'] = discogs_price
            
            if discogs_price:
                result['calculation'].append(f"Discogs: ${discogs_price:.2f}")
            
            # Step 2: Get eBay price
            ebay_price = self._get_ebay_price(artist, title, selected_condition)
            result['ebay_price'] = ebay_price
            
            if ebay_price:
                result['calculation'].append(f"eBay: ${ebay_price:.2f}")
            
            # Step 3: Calculate minimum price
            prices = []
            if discogs_price and discogs_price > 0:
                prices.append(discogs_price)
            if ebay_price and ebay_price > 0:
                prices.append(ebay_price)
            
            if prices:
                # Use minimum price
                min_price = min(prices)
                result['estimated_price'] = self.RoundingHandler.round_to_store_price(min_price)
                
                # Determine source
                if discogs_price == min_price and ebay_price == min_price:
                    result['price_source'] = 'both'
                elif discogs_price == min_price:
                    result['price_source'] = 'discogs'
                else:
                    result['price_source'] = 'ebay'
                
                result['calculation'].append(f"Minimum: ${min_price:.2f}")
                result['calculation'].append(f"Rounded: ${result['estimated_price']:.2f}")
                result['success'] = True
            else:
                result['error'] = "No prices found from either source"
                result['estimated_price'] = 19.99  # Default fallback price
            
            return result
            
        except Exception as e:
            logger.error(f"Price estimation error: {str(e)}")
            result['error'] = str(e)
            result['estimated_price'] = 19.99  # Fallback price
            return result
    
    def _get_discogs_price(self, artist, title, condition, discogs_id=None):
        """Get price from Discogs API"""
        try:
            if not self.discogs_token:
                logger.warning("No Discogs token available")
                return None
            
            # Try to get price from Discogs Marketplace
            search_query = f"{artist} {title}"
            encoded_query = requests.utils.quote(search_query)
            
            headers = {
                'User-Agent': 'PigStyleRecords/1.0',
                'Authorization': f'Discogs token={self.discogs_token}'
            }
            
            # Search for the release
            search_url = f"https://api.discogs.com/database/search?q={encoded_query}&type=release&per_page=5"
            
            response = requests.get(search_url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                results = data.get('results', [])
                
                if results:
                    # Get the first result's ID if discogs_id not provided
                    release_id = discogs_id or results[0].get('id')
                    
                    if release_id:
                        # Get marketplace stats
                        stats_url = f"https://api.discogs.com/marketplace/stats/{release_id}"
                        stats_response = requests.get(stats_url, headers=headers, timeout=10)
                        
                        if stats_response.status_code == 200:
                            stats_data = stats_response.json()
                            
                            # Try to find price for our condition
                            condition_prices = {}
                            
                            # Check lowest price
                            lowest_price = stats_data.get('lowest_price', {}).get('value')
                            if lowest_price:
                                condition_prices['lowest'] = float(lowest_price)
                            
                            # Check for condition-specific prices
                            for price_info in stats_data.get('prices', []):
                                cond = price_info.get('condition', '').lower()
                                price_val = price_info.get('value')
                                
                                if price_val:
                                    # Map to our condition system
                                    for our_cond, patterns in self.DiscogsConditions.CONDITION_PATTERNS.items():
                                        if any(re.search(p, cond, re.IGNORECASE) for p in patterns):
                                            condition_prices[our_cond] = float(price_val)
                                            break
                            
                            # Return price for selected condition, or lowest price
                            if condition in condition_prices:
                                return condition_prices[condition]
                            elif 'lowest' in condition_prices:
                                return condition_prices['lowest']
            
            return None
            
        except Exception as e:
            logger.error(f"Discogs price error: {str(e)}")
            return None
    
    def _get_ebay_price(self, artist, title, condition):
        """Get price from eBay API"""
        try:
            if not self.ebay_client_id or not self.ebay_client_secret:
                logger.warning("No eBay credentials available")
                return None
            
            # Get eBay access token
            token = self._get_ebay_token()
            if not token:
                return None
            
            # Search eBay for vinyl records
            search_query = f"{artist} {title} vinyl"
            encoded_query = requests.utils.quote(search_query)
            
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
                'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
            }
            
            # Build search with condition filter
            params = {
                'q': search_query,
                'limit': '20',
                'filter': 'conditions:{USED}'
            }
            
            search_url = "https://api.ebay.com/buy/browse/v1/item_summary/search"
            response = requests.get(search_url, headers=headers, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                items = data.get('itemSummaries', [])
                
                # Filter by condition and calculate average
                matching_prices = []
                
                for item in items:
                    item_title = item.get('title', '').lower()
                    item_cond = item.get('condition', '').lower()
                    
                    # Check if item matches our condition
                    matches_condition = False
                    patterns = self.DiscogsConditions.CONDITION_PATTERNS.get(condition, [])
                    
                    for pattern in patterns:
                        if re.search(pattern, item_title, re.IGNORECASE) or \
                           re.search(pattern, item_cond, re.IGNORECASE):
                            matches_condition = True
                            break
                    
                    # Get price
                    price_data = item.get('price', {})
                    price_value = price_data.get('value')
                    
                    if price_value and matches_condition:
                        matching_prices.append(float(price_value))
                
                # Calculate average of matching prices
                if matching_prices:
                    # Remove outliers and calculate median
                    sorted_prices = sorted(matching_prices)
                    n = len(sorted_prices)
                    
                    if n % 2 == 1:
                        median = sorted_prices[n // 2]
                    else:
                        median = (sorted_prices[n // 2 - 1] + sorted_prices[n // 2]) / 2
                    
                    return median
            
            return None
            
        except Exception as e:
            logger.error(f"eBay price error: {str(e)}")
            return None
    
    def _get_ebay_token(self):
        """Get OAuth token for eBay API"""
        try:
            # Check if token is still valid
            if self.ebay_access_token and self.token_expiry and time.time() < self.token_expiry:
                return self.ebay_access_token
            
            auth_string = base64.b64encode(
                f"{self.ebay_client_id}:{self.ebay_client_secret}".encode()
            ).decode()
            
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': f'Basic {auth_string}'
            }
            
            data = {
                'grant_type': 'client_credentials',
                'scope': 'https://api.ebay.com/oauth/api_scope'
            }
            
            response = requests.post(
                'https://api.ebay.com/identity/v1/oauth2/token',
                headers=headers,
                data=data,
                timeout=10
            )
            
            if response.status_code == 200:
                token_data = response.json()
                self.ebay_access_token = token_data.get('access_token')
                self.token_expiry = time.time() + token_data.get('expires_in', 7200) - 300
                return self.ebay_access_token
            
            return None
            
        except Exception as e:
            logger.error(f"eBay token error: {str(e)}")
            return None