"""
Price Advise Handler - Integrates Discogs and eBay for price estimation
Uses minimum of median eBay and Discogs price suggestion
"""

import os
import requests
import json
import logging
from typing import Dict, List, Optional, Tuple, Any
import time
import urllib.parse
import statistics

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PriceAdviseHandler:
    """
    Handler for getting price advice from Discogs and eBay APIs
    Uses minimum of median eBay and Discogs price suggestion
    """
    
    def __init__(self, discogs_token: str = None, 
                 ebay_client_id: str = None, 
                 ebay_client_secret: str = None):
        """
        Initialize the price advise handler with API credentials
        """
        self.discogs_token = discogs_token or os.environ.get('DISCOGS_USER_TOKEN')
        self.ebay_client_id = ebay_client_id or os.environ.get('EBAY_CLIENT_ID')
        self.ebay_client_secret = ebay_client_secret or os.environ.get('EBAY_CLIENT_SECRET')
        
        # eBay OAuth token
        self.ebay_access_token = None
        self.ebay_token_expiry = 0
        
        # Condition mapping
        self.condition_mapping = {
            'M': 'Mint (M)', 'Mint': 'Mint (M)',
            'NM': 'Near Mint (NM or M-)', 'Near Mint': 'Near Mint (NM or M-)',
            'VG+': 'Very Good Plus (VG+)', 'Very Good Plus': 'Very Good Plus (VG+)',
            'VG': 'Very Good (VG)', 'Very Good': 'Very Good (VG)',
            'G+': 'Good Plus (G+)', 'Good Plus': 'Good Plus (G+)',
            'G': 'Good (G)', 'Good': 'Good (G)',
            'F': 'Fair (F)', 'Fair': 'Fair (F)',
            'P': 'Poor (P)', 'Poor': 'Poor (P)'
        }
        
        self.ebay_condition_mapping = {
            'm': ['mint', 'new', 'sealed', 'brand new'],
            'nm': ['near mint', 'nm', 'm-', 'near-mint', 'near mint (nm or m-)'],
            'vg+': ['very good plus', 'vg+', 'vg plus', 'very good plus (vg+)'],
            'vg': ['very good', 'vg', 'very good (vg)'],
            'g+': ['good plus', 'g+', 'good plus (g+)'],
            'g': ['good', 'g', 'good (g)'],
            'f': ['fair', 'f', 'fair (f)'],
            'p': ['poor', 'p', 'poor (p)']
        }
    
    def get_price_estimate(self, 
                          artist: str, 
                          title: str, 
                          selected_condition: str,
                          discogs_genre: str = '',
                          discogs_id: str = '') -> Dict[str, Any]:
        """
        Get price estimate from Discogs and eBay
        """
        result = {
            'success': False,
            'estimated_price': 0.0,
            'price': 0.0,
            'price_source': 'none',
            'calculation': [],
            'calculation_steps': [],
            'ebay_summary': {},
            'ebay_listings': [],
            'discogs_price': None,
            'ebay_price': None,
            'search_query': f"{artist} - {title}",
            'price_discrepancy_warning': False,
            'discrepancy_ratio': 1.0,
            'warning_message': '',
            'error': None
        }
        
        try:
            # Get Discogs price if we have an ID
            discogs_price = None
            if discogs_id and self.discogs_token:
                discogs_result = self._get_discogs_price_with_details(discogs_id, selected_condition)
                discogs_price = discogs_result.get('price')
                result['discogs_price'] = discogs_price
            
            # Get eBay price with detailed listings
            ebay_result = self._get_ebay_price_with_listings(
                artist=artist, 
                title=title, 
                condition=selected_condition
            )
            
            ebay_price = ebay_result.get('estimated_price')
            ebay_listings = ebay_result.get('listings', [])
            ebay_summary = ebay_result.get('summary', {})
            
            result['ebay_price'] = ebay_price
            result['ebay_listings'] = ebay_listings
            result['ebay_summary'] = ebay_summary
            
            # Calculate minimum price with discrepancy detection
            estimated_price = 0.0
            calculation_steps = []
            price_discrepancy_warning = False
            discrepancy_ratio = 1.0
            warning_message = ''
            price_source = 'minimum'
            
            if discogs_price is not None and ebay_price is not None:
                estimated_price = min(discogs_price, ebay_price)
                price_source = 'discogs' if discogs_price <= ebay_price else 'ebay'
                
                max_price = max(discogs_price, ebay_price)
                min_price = min(discogs_price, ebay_price)
                
                if min_price > 0:
                    discrepancy_ratio = max_price / min_price
                    
                    if discrepancy_ratio > 2.0:
                        price_discrepancy_warning = True
                        higher_source = 'Discogs' if discogs_price > ebay_price else 'eBay'
                        lower_source = 'Discogs' if discogs_price < ebay_price else 'eBay'
                        warning_message = f"Price discrepancy: {higher_source} (${max_price:.2f}) is {discrepancy_ratio:.1f}x {lower_source} (${min_price:.2f})"
                
                calculation_steps.append(f"Discogs Price: ${discogs_price:.2f}")
                calculation_steps.append(f"eBay Median Price: ${ebay_price:.2f}")
                calculation_steps.append(f"Minimum Price Selected: ${estimated_price:.2f} (from {price_source})")
                
            elif discogs_price is not None:
                estimated_price = discogs_price
                price_source = 'discogs'
                calculation_steps.append(f"Discogs Price: ${discogs_price:.2f}")
                
            elif ebay_price is not None:
                estimated_price = ebay_price
                price_source = 'ebay'
                calculation_steps.append(f"eBay Median Price: ${ebay_price:.2f}")
                
            else:
                estimated_price = 19.99
                price_source = 'fallback'
                calculation_steps.append(f"No data found, using fallback: ${estimated_price:.2f}")
            
            result['estimated_price'] = round(estimated_price, 2)
            result['price'] = round(estimated_price, 2)
            result['price_source'] = price_source
            result['calculation_steps'] = calculation_steps
            result['calculation'] = calculation_steps
            result['price_discrepancy_warning'] = price_discrepancy_warning
            result['discrepancy_ratio'] = discrepancy_ratio
            result['warning_message'] = warning_message
            result['success'] = True
            
        except Exception as e:
            result['error'] = str(e)
            result['estimated_price'] = 19.99
            result['price'] = 19.99
        
        return result
    
    def _get_discogs_price_with_details(self, release_id: str, condition: str) -> Dict[str, Any]:
        """
        Get price suggestion from Discogs API
        """
        result = {'price': None, 'calculation': [], 'raw_data': None}
        
        if not self.discogs_token:
            return result
        
        try:
            url = f"https://api.discogs.com/marketplace/price_suggestions/{release_id}"
            headers = {'Authorization': f'Discogs token={self.discogs_token}', 'User-Agent': 'PigStyleRecords/1.0'}
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code != 200:
                return result
            
            data = response.json()
            result['raw_data'] = data
            
            condition_lower = condition.lower().strip()
            
            matching_strategies = [
                lambda: self._map_to_discogs_condition(condition),
                lambda: condition.split('(')[0].strip() if '(' in condition else condition,
                lambda: condition_lower.upper() if len(condition_lower) <= 3 else None,
                lambda: 'Mint (M)' if 'mint' in condition_lower and 'near' not in condition_lower else None,
                lambda: 'Near Mint (NM or M-)' if 'near' in condition_lower or 'nm' in condition_lower else None,
                lambda: 'Very Good Plus (VG+)' if 'vg+' in condition_lower or 'very good plus' in condition_lower else None,
                lambda: 'Very Good (VG)' if 'very good' in condition_lower and 'plus' not in condition_lower else None,
            ]
            
            matched_price = None
            for strategy in matching_strategies:
                discogs_condition = strategy()
                if discogs_condition and discogs_condition in data:
                    price_info = data[discogs_condition]
                    if isinstance(price_info, dict) and 'value' in price_info:
                        matched_price = float(price_info['value'])
                        break
            
            if not matched_price and data:
                first_key = list(data.keys())[0]
                price_info = data[first_key]
                if isinstance(price_info, dict) and 'value' in price_info:
                    matched_price = float(price_info['value'])
            
            if matched_price:
                result['price'] = matched_price
                
        except Exception:
            pass
        
        return result
    
    def _map_to_discogs_condition(self, condition: str) -> str:
        """Map our condition format to Discogs condition format"""
        condition_clean = condition.strip()
        if '(' in condition_clean and ')' in condition_clean:
            return condition_clean
        return self.condition_mapping.get(condition_clean, condition_clean)
    
    def _get_ebay_price_with_listings(self, 
                                     artist: str, 
                                     title: str, 
                                     condition: str) -> Dict[str, Any]:
        """
        Get eBay price estimate with detailed listings and calculation
        """
        result = {
            'estimated_price': None,
            'listings': [],
            'summary': {
                'total_listings': 0,
                'condition_listings': 0,
                'generic_median': None,
                'condition_median': None,
                'price_range': None,
                'average_price': None,
                'search_query': '',
                'raw_api_query': ''
            },
            'calculation': []
        }
        
        try:
            # === START OF FOCUSED EBAY API LOGGING ===
            logger.info("=" * 80)
            logger.info("EBAY API CALL - DETAILED LOG")
            logger.info("=" * 80)
            
            # Get eBay OAuth token
            access_token = self._get_ebay_access_token()
            result['calculation'].append(f"Access token obtained: {'Yes' if access_token else 'No'}")
            
            if not access_token:
                logger.error("Failed to get eBay access token")
                result['calculation'].append("eBay: Failed to get access token")
                return result
            
            # Build search query - FIXED: Don't pre-encode the query for params
            search_query = self._build_ebay_search_query(artist, title)
            result['summary']['search_query'] = search_query
            
            # Keep encoded version for logging only
            encoded_query = urllib.parse.quote(search_query)
            result['summary']['raw_api_query'] = encoded_query
            
            # Build API URL with filters - FIXED: Pass raw string to params
            url = "https://api.ebay.com/buy/browse/v1/item_summary/search"
            params = {
                'q': search_query,  # FIXED: Use raw string, not encoded_query
                'limit': 50,
                'filter': 'conditions:{NEW|USED}',
                'sort': 'price'
            }
            
            # Build the full URL for logging
            full_url = f"{url}?{urllib.parse.urlencode(params)}"
            
            # Log request details
            logger.info(f"REQUEST DETAILS:")
            logger.info(f"  Endpoint: {url}")
            logger.info(f"  Full URL: {full_url}")
            logger.info(f"  Search Query: '{search_query}'")
            logger.info(f"  Encoded Query (for reference): '{encoded_query}'")
            logger.info(f"  Params: {params}")
            logger.info(f"  Access Token (first 50 chars): {access_token[:50]}...")
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            # Make the API call
            logger.info(f"\nMAKING API REQUEST...")
            response = requests.get(url, headers=headers, params=params, timeout=15)
            
            # Log response details
            logger.info(f"\nRESPONSE DETAILS:")
            logger.info(f"  Status Code: {response.status_code}")
            logger.info(f"  Response Headers: {dict(response.headers)}")
            
            try:
                response_json = response.json()
                logger.info(f"  Response Body (JSON):")
                logger.info(json.dumps(response_json, indent=2))
                
                # Check for API errors
                if 'errors' in response_json:
                    logger.error(f"  API Errors: {response_json['errors']}")
                    for error in response_json['errors']:
                        result['calculation'].append(f"eBay API Error: {error.get('message', 'Unknown error')}")
                
            except json.JSONDecodeError:
                logger.info(f"  Response Body (Raw): {response.text[:500]}")
                result['calculation'].append(f"eBay: Invalid JSON response")
            
            logger.info("=" * 80 + "\n")
            # === END OF FOCUSED EBAY API LOGGING ===
            
            if response.status_code != 200:
                return result
            
            data = response.json()
            items = data.get('itemSummaries', [])
            
            # Filter for vinyl records
            vinyl_listings = []
            for item in items:
                title_lower = item.get('title', '').lower()
                item_description = item.get('shortDescription', '').lower()
                
                vinyl_keywords = ['vinyl', 'lp', 'record', '12"', '7"', '45 rpm', '33 rpm']
                is_vinyl = any(keyword in title_lower or keyword in item_description 
                              for keyword in vinyl_keywords)
                
                if not is_vinyl:
                    continue
                
                price_obj = item.get('price', {})
                price_value = price_obj.get('value', '0') if isinstance(price_obj, dict) else '0'
                
                try:
                    price = float(price_value)
                except (ValueError, TypeError):
                    price = 0.0
                
                if price <= 0:
                    continue
                
                shipping_cost = self._get_ebay_shipping_cost(item)
                total_price = price + shipping_cost
                
                item_condition = item.get('condition', '')
                condition_id = item.get('conditionId', '')
                
                matches_condition = False
                if condition and item_condition:
                    condition_lower = condition.lower().strip()
                    item_condition_lower = item_condition.lower()
                    matching_terms = self.ebay_condition_mapping.get(condition_lower, [])
                    matches_condition = any(term in item_condition_lower for term in matching_terms)
                
                listing = {
                    'title': item.get('title', ''),
                    'full_title': item.get('title', ''),
                    'price': price,
                    'shipping': shipping_cost,
                    'total': total_price,
                    'condition': item_condition,
                    'condition_id': condition_id,
                    'url': item.get('itemWebUrl', ''),
                    'image_url': item.get('image', {}).get('imageUrl', '') if isinstance(item.get('image'), dict) else '',
                    'matches_condition': matches_condition,
                    'free_shipping': shipping_cost == 0.0
                }
                
                vinyl_listings.append(listing)
            
            result['summary']['total_listings'] = len(vinyl_listings)
            
            if not vinyl_listings:
                return result
            
            all_totals = [listing['total'] for listing in vinyl_listings if listing['total'] > 0]
            
            if not all_totals:
                return result
            
            # Calculate statistics
            generic_median = statistics.median(all_totals) if len(all_totals) >= 3 else statistics.median_low(all_totals)
            result['summary']['generic_median'] = round(generic_median, 2)
            result['summary']['price_range'] = {
                'min': round(min(all_totals), 2),
                'max': round(max(all_totals), 2)
            }
            result['summary']['average_price'] = round(statistics.mean(all_totals), 2)
            
            # Filter by condition if specified
            condition_listings = []
            condition_median = None
            
            if condition:
                condition_listings = [listing for listing in vinyl_listings if listing['matches_condition']]
                result['summary']['condition_listings'] = len(condition_listings)
                
                if condition_listings:
                    condition_totals = [listing['total'] for listing in condition_listings if listing['total'] > 0]
                    if condition_totals:
                        if len(condition_totals) >= 3:
                            condition_median = statistics.median(condition_totals)
                        else:
                            condition_median = statistics.median_low(condition_totals)
                        result['summary']['condition_median'] = round(condition_median, 2)
            
            # Determine which price to use
            if condition_median is not None:
                estimated_price = condition_median
            else:
                estimated_price = generic_median
            
            result['estimated_price'] = round(estimated_price, 2)
            
            # Sort listings by total price
            sorted_listings = sorted(vinyl_listings, key=lambda x: x['total'])
            result['listings'] = sorted_listings[:20]
            
        except Exception as e:
            logger.error(f"Error in _get_ebay_price_with_listings: {str(e)}")
            result['calculation'].append(f"eBay error: {str(e)}")
        
        return result
    
    def _build_ebay_search_query(self, artist: str, title: str) -> str:
        """
        Build an optimized search query for eBay
        """
        artist_clean = artist.strip()
        title_clean = title.strip()
        
        # Remove common prefixes for better search results
        to_remove = ['the ', '& ', 'and ', 'feat.', 'ft.', 'featuring ', 'with ']
        for prefix in to_remove:
            if artist_clean.lower().startswith(prefix):
                artist_clean = artist_clean[len(prefix):].strip()
        
        query_parts = []
        if artist_clean:
            query_parts.append(artist_clean)
        if title_clean:
            query_parts.append(title_clean)
        
        query_parts.append("vinyl")
        
        search_query = " ".join(query_parts)
        
        # Limit length for eBay API
        if len(search_query) > 100:
            search_query = search_query[:97] + "..."
        
        return search_query
    
    def _get_ebay_shipping_cost(self, item: dict) -> float:
        """
        Extract shipping cost from eBay item data
        """
        try:
            shipping_cost = 0.0
            
            shipping_options = item.get('shippingOptions', [])
            if shipping_options and isinstance(shipping_options, list):
                for option in shipping_options:
                    if isinstance(option, dict):
                        shipping_cost_dict = option.get('shippingCost', {})
                        if isinstance(shipping_cost_dict, dict):
                            cost_value = shipping_cost_dict.get('value', '0')
                            if cost_value and cost_value != '0':
                                try:
                                    shipping_cost = float(cost_value)
                                    break
                                except (ValueError, TypeError):
                                    continue
            
            if shipping_cost == 0.0:
                shipping_info = item.get('shippingCost', {})
                if isinstance(shipping_info, dict):
                    cost_value = shipping_info.get('value', '0')
                    if cost_value and cost_value != '0':
                        try:
                            shipping_cost = float(cost_value)
                        except (ValueError, TypeError):
                            pass
            
            return shipping_cost
            
        except Exception:
            return 0.0
    
    def _get_ebay_access_token(self) -> Optional[str]:
        """
        Get OAuth access token for eBay API
        """
        if self.ebay_access_token and time.time() < self.ebay_token_expiry:
            return self.ebay_access_token
        
        if not self.ebay_client_id or not self.ebay_client_secret:
            return None
        
        try:
            url = "https://api.ebay.com/identity/v1/oauth2/token"
            
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
            
            data = {
                'grant_type': 'client_credentials',
                'scope': 'https://api.ebay.com/oauth/api_scope'
            }
            
            auth = (self.ebay_client_id, self.ebay_client_secret)
            
            response = requests.post(url, headers=headers, data=data, auth=auth, timeout=10)
            
            if response.status_code == 200:
                token_data = response.json()
                self.ebay_access_token = token_data.get('access_token')
                expires_in = token_data.get('expires_in', 7200)
                self.ebay_token_expiry = time.time() + expires_in - 300
                
                return self.ebay_access_token
            else:
                logger.error(f"Failed to get eBay token: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting eBay token: {str(e)}")
            return None