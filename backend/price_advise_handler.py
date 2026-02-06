"""
PriceAdviseHandler - Integrated price estimation with eBay and Discogs with detailed eBay listings
"""
import re
import time
import requests
import base64
import logging
import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

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
    
    def get_price_estimate(self, artist: str, title: str, selected_condition: str, 
                          discogs_genre: Optional[str] = None, discogs_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get price estimate from eBay and Discogs with detailed eBay listings
        Returns enriched result with calculation steps and eBay listing data
        """
        result = {
            'discogs_price': None,
            'ebay_price': None,
            'ebay_listings': [],  # Detailed eBay listings
            'ebay_summary': {},   # Summary statistics
            'estimated_price': 0.0,
            'price_source': 'unknown',
            'calculation': [],
            'success': False,
            'error': None,
            'search_query': f"{artist} {title}"
        }
        
        try:
            # Step 1: Get Discogs price
            discogs_price = self._get_discogs_price(artist, title, selected_condition, discogs_id)
            result['discogs_price'] = discogs_price
            
            if discogs_price:
                result['calculation'].append(f"Discogs Price (cached): ${discogs_price:.2f}")
            
            # Step 2: Get eBay price with detailed listings
            ebay_result = self._get_ebay_price_with_listings(artist, title, selected_condition)
            result['ebay_price'] = ebay_result.get('median_price')
            result['ebay_listings'] = ebay_result.get('listings', [])
            result['ebay_summary'] = ebay_result.get('summary', {})
            
            # Step 3: Build calculation details
            self._build_calculation_details(result)
            
            # Step 4: Calculate final price
            self._calculate_final_price(result)
            
            return result
            
        except Exception as e:
            logger.error(f"Price estimation error: {str(e)}")
            result['error'] = str(e)
            result['estimated_price'] = 19.99  # Fallback price
            return result
    
    def _build_calculation_details(self, result: Dict[str, Any]) -> None:
        """Build detailed calculation steps"""
        discogs_price = result['discogs_price']
        ebay_price = result['ebay_price']
        ebay_summary = result['ebay_summary']
        ebay_listings = result['ebay_listings']
        
        calculation = result['calculation']
        
        # Add eBay summary
        if ebay_price:
            calculation.append(f"eBay (generic): ${ebay_price:.2f} (n={ebay_summary.get('total_listings', 0)})")
        
        # Add condition-specific info
        condition_count = ebay_summary.get('condition_listings', 0)
        calculation.append(f"Using eBay generic price (condition n={condition_count} < 3.0)")
        
        # Add eBay listings info
        if ebay_listings:
            condition_matches = [l for l in ebay_listings if l.get('matches_condition', False)]
            if condition_matches:
                calculation.append(f"Found {len(condition_matches)} eBay listings matching condition '{result.get('search_query', '')}'")
            else:
                calculation.append(f"Found {len(ebay_listings)} eBay listings total")
        
        # Calculate minimum market price
        prices = []
        if discogs_price and discogs_price > 0:
            prices.append(discogs_price)
        if ebay_price and ebay_price > 0:
            prices.append(ebay_price)
        
        if prices:
            min_price = min(prices)
            calculation.append(f"Minimum market price: ${min_price:.2f} (min of Discogs and eBay)")
            
            # Apply multiplier (example: 0.9x)
            multiplier = 0.9
            adjusted_price = min_price * multiplier
            calculation.append(f"Multiplier: {multiplier}× = ${adjusted_price:.2f}")
            
            # Round to store pricing
            rounded_price = self.RoundingHandler.round_to_store_price(adjusted_price)
            calculation.append(f"Rounded to store pricing rules: ${rounded_price:.2f}")
            
            result['calculation_steps'] = {
                'discogs_price': discogs_price,
                'ebay_price': ebay_price,
                'min_price': min_price,
                'multiplier': multiplier,
                'adjusted_price': adjusted_price,
                'rounded_price': rounded_price
            }
    
    def _calculate_final_price(self, result: Dict[str, Any]) -> None:
        """Calculate final advised price"""
        steps = result.get('calculation_steps', {})
        
        if steps:
            final_price = steps.get('rounded_price', 0)
            result['estimated_price'] = final_price
            result['price'] = final_price
            result['source'] = 'calculated'
            result['success'] = True
            
            # Add final calculation step
            result['calculation'].append(f"Final advised price: ${final_price:.2f}")
        else:
            # Fallback calculation
            prices = []
            if result['discogs_price'] and result['discogs_price'] > 0:
                prices.append(result['discogs_price'])
            if result['ebay_price'] and result['ebay_price'] > 0:
                prices.append(result['ebay_price'])
            
            if prices:
                min_price = min(prices)
                result['estimated_price'] = self.RoundingHandler.round_to_store_price(min_price)
                
                if result['discogs_price'] == min_price and result['ebay_price'] == min_price:
                    result['price_source'] = 'both'
                elif result['discogs_price'] == min_price:
                    result['price_source'] = 'discogs'
                else:
                    result['price_source'] = 'ebay'
                
                result['calculation'].append(f"Minimum: ${min_price:.2f}")
                result['calculation'].append(f"Rounded: ${result['estimated_price']:.2f}")
                result['success'] = True
            else:
                result['error'] = "No prices found from either source"
                result['estimated_price'] = 19.99  # Default fallback price
    
    def _get_discogs_price(self, artist: str, title: str, condition: str, discogs_id: Optional[str] = None) -> Optional[float]:
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
    
    def _get_ebay_price_with_listings(self, artist: str, title: str, condition: str) -> Dict[str, Any]:
        """Get price and detailed listings from eBay API"""
        result = {
            'median_price': None,
            'listings': [],
            'summary': {
                'total_listings': 0,
                'condition_listings': 0,
                'condition_median': 0,
                'generic_median': 0,
                'price_range': (0, 0),
                'average_price': 0,
                'search_query': f"{artist} {title} vinyl"
            }
        }
        
        try:
            if not self.ebay_client_id or not self.ebay_client_secret:
                logger.warning("No eBay credentials available")
                return result
            
            # Get eBay access token
            token = self._get_ebay_token()
            if not token:
                return result
            
            # Search eBay for vinyl records
            search_query = f"{artist} {title} vinyl"
            
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
                'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
            }
            
            params = {
                'q': search_query,
                'limit': '50',  # Get more listings for better stats
                'filter': 'conditions:{USED}'
            }
            
            search_url = "https://api.ebay.com/buy/browse/v1/item_summary/search"
            response = requests.get(search_url, headers=headers, params=params, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                items = data.get('itemSummaries', [])
                
                # Process all listings
                all_listings = []
                condition_listings = []
                
                for item in items:
                    listing = self._process_ebay_listing(item, artist, title, condition)
                    if listing:
                        all_listings.append(listing)
                        
                        # Check if matches our condition
                        if listing.get('matches_condition', False):
                            condition_listings.append(listing)
                
                # Sort by total price (price + shipping)
                all_listings.sort(key=lambda x: x.get('total', 0))
                condition_listings.sort(key=lambda x: x.get('total', 0))
                
                # Calculate statistics
                result['listings'] = all_listings
                result['summary']['total_listings'] = len(all_listings)
                result['summary']['condition_listings'] = len(condition_listings)
                
                # Calculate median prices
                if all_listings:
                    generic_prices = [l.get('total', 0) for l in all_listings if l.get('total', 0) > 0]
                    if generic_prices:
                        result['summary']['generic_median'] = self._calculate_median(generic_prices)
                        result['median_price'] = result['summary']['generic_median']
                        result['summary']['price_range'] = (min(generic_prices), max(generic_prices))
                        result['summary']['average_price'] = sum(generic_prices) / len(generic_prices)
                
                if condition_listings:
                    condition_prices = [l.get('total', 0) for l in condition_listings if l.get('total', 0) > 0]
                    if condition_prices:
                        result['summary']['condition_median'] = self._calculate_median(condition_prices)
            
            return result
            
        except Exception as e:
            logger.error(f"eBay price error: {str(e)}")
            return result
    
    def _process_ebay_listing(self, item: Dict, artist: str, title: str, condition: str) -> Optional[Dict]:
        """Process individual eBay listing with detailed information"""
        try:
            item_id = item.get('itemId', '')
            item_title = item.get('title', '')
            item_cond = item.get('condition', '')
            item_url = item.get('itemWebUrl', '')
            
            # Get price and shipping
            price_data = item.get('price', {})
            price_value = price_data.get('value', 0)
            
            shipping_data = item.get('shippingOptions', [{}])[0] if item.get('shippingOptions') else {}
            shipping_cost = shipping_data.get('shippingCost', {}).get('value', 0)
            
            # Calculate total
            total_price = float(price_value) + float(shipping_cost)
            
            # Check if matches our condition
            matches_condition = False
            patterns = self.DiscogsConditions.CONDITION_PATTERNS.get(condition, [])
            
            title_lower = item_title.lower()
            cond_lower = item_cond.lower()
            
            for pattern in patterns:
                if re.search(pattern, title_lower, re.IGNORECASE) or \
                   re.search(pattern, cond_lower, re.IGNORECASE):
                    matches_condition = True
                    break
            
            # Format eBay link
            search_slug = requests.utils.quote(f"{artist} {title} VINYL")
            formatted_url = f"{item_url}"
            
            return {
                'item_id': item_id,
                'title': item_title[:80] + ('...' if len(item_title) > 80 else ''),
                'condition': item_cond,
                'price': float(price_value),
                'shipping': float(shipping_cost),
                'total': total_price,
                'url': formatted_url,
                'matches_condition': matches_condition,
                'full_title': item_title  # Keep full title for reference
            }
            
        except Exception as e:
            logger.error(f"Error processing eBay listing: {str(e)}")
            return None
    
    def _calculate_median(self, prices: List[float]) -> float:
        """Calculate median of prices"""
        if not prices:
            return 0.0
        
        sorted_prices = sorted(prices)
        n = len(sorted_prices)
        
        if n % 2 == 1:
            return sorted_prices[n // 2]
        else:
            return (sorted_prices[n // 2 - 1] + sorted_prices[n // 2]) / 2
    
    def _get_ebay_token(self) -> Optional[str]:
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