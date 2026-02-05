"""
PriceAdviseHandler - Integrated price estimation with eBay and Discogs
Restored detailed calculation logic from old application
"""
import re
import time
import requests
import base64
import logging
import os
import json
import statistics
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

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
                @staticmethod
                def round_to_store_price(price):
                    # Implement store pricing rules
                    if price <= 5:
                        return round(price + 0.99, 2)
                    elif price <= 15:
                        return round(price * 1.5, 2)
                    else:
                        return round(price, 2)
            self.RoundingHandler = SimpleRounding
    
    def get_price_estimate(self, artist: str, title: str, selected_condition: str, 
                          discogs_genre: str = None, discogs_id: str = None) -> Dict[str, Any]:
        """
        Get comprehensive price estimate from eBay and Discogs with detailed calculations
        """
        # Initialize result with all required keys
        result = {
            'discogs_price': None,
            'ebay_price': None,
            'ebay_condition_price': None,
            'estimated_price': 0.0,
            'price_source': 'unknown',
            'calculation': [],  # This will store detailed calculation steps
            'ebay_summary': '',  # Initialize as empty string, not None
            'ebay_listings_count': 0,
            'condition_listings_count': 0,
            'success': False,
            'error': None,
            'ebay_search_query': '',
            'ebay_raw_data': [],
            'price_range': (0, 0),
            'average_price': 0
        }
        
        try:
            # Generate search query
            search_query = self._generate_search_query(artist, title)
            result['ebay_search_query'] = search_query
            
            # Step 1: Get Discogs price
            discogs_price = self._get_discogs_price(artist, title, selected_condition, discogs_id)
            result['discogs_price'] = discogs_price
            
            # Step 2: Get comprehensive eBay data
            ebay_data = self._get_comprehensive_ebay_data(search_query, selected_condition)
            # Update result with ebay_data, ensuring all keys exist
            for key in ['ebay_generic_median', 'ebay_condition_median', 'ebay_listings', 
                       'condition_listings', 'ebay_listings_count', 'condition_listings_count',
                       'price_range', 'average_price', 'raw_listings']:
                if key in ebay_data:
                    result[key] = ebay_data[key]
            
            # Step 3: Build detailed calculation
            calculation = []
            
            # Start with header
            calculation.append("📊 Price Details\n")
            calculation.append("\n🧮 Price Calculation:\n")
            
            # Add Discogs info
            if discogs_price:
                calculation.append(f"• Discogs Price (cached): ${discogs_price:.2f}")
            
            # Add eBay search query
            calculation.append(f"\neBay Search: {search_query}")
            
            # Add price sources
            if discogs_price:
                calculation.append(f"• Discogs: ${discogs_price:.2f}")
            
            ebay_generic = result.get('ebay_generic_median')
            ebay_condition = result.get('ebay_condition_median')
            ebay_count = result.get('ebay_listings_count', 0)
            condition_count = result.get('condition_listings_count', 0)
            
            if ebay_generic:
                calculation.append(f"• eBay (generic): ${ebay_generic:.2f} (n={ebay_count})")
            
            if ebay_condition and condition_count > 0:
                calculation.append(f"• eBay (condition): ${ebay_condition:.2f} (n={condition_count})")
            else:
                calculation.append(f"• Using eBay generic price (condition n={condition_count} < 3.0)")
            
            # Step 4: Calculate minimum price
            prices = []
            if discogs_price and discogs_price > 0:
                prices.append(('Discogs', discogs_price))
            if ebay_generic and ebay_generic > 0:
                prices.append(('eBay', ebay_generic))
            if ebay_condition and ebay_condition > 0:
                prices.append(('eBay (condition)', ebay_condition))
            
            if prices:
                # Find minimum price
                min_source, min_price = min(prices, key=lambda x: x[1])
                calculation.append(f"• Minimum market price: ${min_price:.2f} (min of Discogs and eBay)")
                
                # Apply 0.9x multiplier
                multiplied_price = min_price * 0.9
                calculation.append(f"• Multiplier: 0.9× = ${multiplied_price:.2f}")
                
                # Round to store pricing
                final_price = self.RoundingHandler.round_to_store_price(multiplied_price)
                calculation.append(f"• Rounded to store pricing rules: ${final_price:.2f}")
                calculation.append(f"\nFinal advised price: ${final_price:.2f}")
                
                result['estimated_price'] = final_price
                result['price_source'] = min_source.lower()
                result['success'] = True
            else:
                # Fallback
                calculation.append("• No market prices found, using fallback price")
                final_price = 19.99
                result['estimated_price'] = final_price
                result['price_source'] = 'fallback'
                result['success'] = True
            
            # Store calculation steps
            result['calculation'] = calculation
            
            # Step 5: Generate eBay summary (ensure it always returns a string)
            result['ebay_summary'] = self._generate_ebay_summary(result)
            
            return result
            
        except Exception as e:
            logger.error(f"Price estimation error: {str(e)}", exc_info=True)
            result['error'] = str(e)
            result['calculation'] = [f"Error: {str(e)}"]
            result['estimated_price'] = 19.99
            result['ebay_summary'] = "Error generating eBay summary"
            return result
    
    def _generate_search_query(self, artist: str, title: str) -> str:
        """Generate search query for eBay/Discogs"""
        # Clean and format artist/title
        clean_artist = re.sub(r'[^\w\s\-&]', '', artist).strip()
        clean_title = re.sub(r'[^\w\s\-&]', '', title).strip()
        
        # Handle special characters and multiple artists
        if ',' in clean_artist or '&' in clean_artist:
            artists = re.split(r'[,&]', clean_artist)
            artist_query = ', '.join([a.strip() + '*' for a in artists if a.strip()])
        else:
            artist_query = clean_artist + '*'
        
        return f"{artist_query}, {clean_title} - VINYL"
    
    def _get_discogs_price(self, artist: str, title: str, condition: str, discogs_id: str = None) -> Optional[float]:
        """Get comprehensive price data from Discogs"""
        try:
            if not self.discogs_token:
                logger.warning("No Discogs token available")
                return None
            
            search_query = f"{artist} {title}"
            encoded_query = requests.utils.quote(search_query)
            
            headers = {
                'User-Agent': 'PigStyleRecords/1.0',
                'Authorization': f'Discogs token={self.discogs_token}'
            }
            
            # Try to get specific release if ID provided
            if discogs_id:
                try:
                    release_url = f"https://api.discogs.com/releases/{discogs_id}"
                    release_response = requests.get(release_url, headers=headers, timeout=10)
                    
                    if release_response.status_code == 200:
                        # Get marketplace stats for this specific release
                        stats_url = f"https://api.discogs.com/marketplace/stats/{discogs_id}"
                        stats_response = requests.get(stats_url, headers=headers, timeout=10)
                        
                        if stats_response.status_code == 200:
                            stats_data = stats_response.json()
                            lowest_price = stats_data.get('lowest_price', {}).get('value')
                            if lowest_price:
                                return float(lowest_price)
                except Exception as e:
                    logger.warning(f"Could not get specific Discogs release {discogs_id}: {e}")
            
            # Search for the release
            search_url = f"https://api.discogs.com/database/search?q={encoded_query}&type=release&per_page=5"
            response = requests.get(search_url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                results = data.get('results', [])
                
                if results:
                    # Get the first result's ID
                    first_result_id = results[0].get('id')
                    if first_result_id:
                        # Get marketplace stats
                        stats_url = f"https://api.discogs.com/marketplace/stats/{first_result_id}"
                        stats_response = requests.get(stats_url, headers=headers, timeout=10)
                        
                        if stats_response.status_code == 200:
                            stats_data = stats_response.json()
                            lowest_price = stats_data.get('lowest_price', {}).get('value')
                            if lowest_price:
                                return float(lowest_price)
            
            logger.info(f"No Discogs price found for {artist} - {title}")
            return None
            
        except Exception as e:
            logger.error(f"Discogs price error: {str(e)}")
            return None
    
    def _get_comprehensive_ebay_data(self, search_query: str, selected_condition: str) -> Dict[str, Any]:
        """Get comprehensive eBay data including all listings"""
        # Initialize with default values
        result = {
            'ebay_generic_median': None,
            'ebay_condition_median': None,
            'ebay_listings': [],
            'condition_listings': [],
            'ebay_listings_count': 0,
            'condition_listings_count': 0,
            'price_range': (0, 0),
            'average_price': 0,
            'raw_listings': []
        }
        
        try:
            if not self.ebay_client_id or not self.ebay_client_secret:
                logger.warning("No eBay credentials available")
                return result
            
            token = self._get_ebay_token()
            if not token:
                logger.warning("Could not get eBay token")
                return result
            
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
                'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
            }
            
            # Search eBay
            params = {
                'q': search_query,
                'limit': '50',  # Increased for better statistics
                'filter': 'buyingOptions:{FIXED_PRICE},priceCurrency:USD'
            }
            
            search_url = "https://api.ebay.com/buy/browse/v1/item_summary/search"
            response = requests.get(search_url, headers=headers, params=params, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                all_listings = data.get('itemSummaries', [])
                result['raw_listings'] = all_listings
                result['ebay_listings_count'] = len(all_listings)
                
                # Extract prices from all listings
                all_prices = []
                condition_prices = []
                
                for item in all_listings:
                    # Get price
                    price_data = item.get('price', {})
                    price_value = price_data.get('value')
                    
                    if price_value:
                        price = float(price_value)
                        all_prices.append(price)
                        
                        # Check if matches condition
                        item_cond = item.get('condition', '').lower()
                        item_title = item.get('title', '').lower()
                        
                        # Check condition matching
                        if self._matches_condition(selected_condition, item_cond, item_title):
                            condition_prices.append(price)
                            result['condition_listings'].append({
                                'title': item.get('title'),
                                'price': price,
                                'condition': item_cond
                            })
                
                # Calculate statistics for all listings
                if all_prices:
                    try:
                        result['ebay_generic_median'] = statistics.median(all_prices)
                        result['price_range'] = (min(all_prices), max(all_prices))
                        result['average_price'] = statistics.mean(all_prices)
                        result['ebay_listings'] = all_prices
                    except statistics.StatisticsError as e:
                        logger.warning(f"Statistics error for all listings: {e}")
                
                # Calculate statistics for condition listings
                if condition_prices:
                    try:
                        result['ebay_condition_median'] = statistics.median(condition_prices)
                        result['condition_listings_count'] = len(condition_prices)
                        result['condition_listings'] = condition_prices
                    except statistics.StatisticsError as e:
                        logger.warning(f"Statistics error for condition listings: {e}")
            
            else:
                logger.warning(f"eBay API returned status {response.status_code}: {response.text}")
            
            return result
            
        except Exception as e:
            logger.error(f"eBay data error: {str(e)}")
            return result
    
    def _matches_condition(self, selected_condition: str, item_condition: str, item_title: str) -> bool:
        """Check if item matches the selected condition"""
        patterns = self.DiscogsConditions.CONDITION_PATTERNS.get(selected_condition, [])
        
        # Check condition field
        for pattern in patterns:
            if re.search(pattern, item_condition, re.IGNORECASE):
                return True
        
        # Also check title for condition mentions
        for pattern in patterns:
            if re.search(pattern, item_title, re.IGNORECASE):
                return True
        
        return False
    
    def _generate_ebay_summary(self, result: Dict[str, Any]) -> str:
        """Generate detailed eBay summary string matching old format"""
        try:
            logger.info(f"Generating eBay summary with data: {result.keys()}")
            logger.info(f"eBay listings count: {result.get('ebay_listings_count')}")
            logger.info(f"eBay generic median: {result.get('ebay_generic_median')}")
            
            summary_lines = []
            
            # eBay Listings Summary header
            summary_lines.append("🛒 eBay Listings Summary\n")
            summary_lines.append("")
            summary_lines.append(f"Search Query: {result.get('ebay_search_query', 'N/A')}\n")
            summary_lines.append("")
            summary_lines.append("Total Listings")
            summary_lines.append(f"{result.get('ebay_listings_count', 0)}\n")
            summary_lines.append("")
            summary_lines.append("Condition Listings")
            summary_lines.append(f"{result.get('condition_listings_count', 0)}\n")
            summary_lines.append("")
            summary_lines.append("Condition Median")
            
            # FIX: Handle None value for ebay_condition_median
            ebay_condition_median = result.get('ebay_condition_median')
            if ebay_condition_median is not None:
                summary_lines.append(f"${ebay_condition_median:.2f}\n")
            else:
                summary_lines.append("$0.00\n")
            
            summary_lines.append("")
            
            # All eBay Listings details
            ebay_listings_count = result.get('ebay_listings_count', 0)
            ebay_generic_median = result.get('ebay_generic_median')
            
            if ebay_listings_count > 0 and ebay_generic_median is not None:
                summary_lines.append(f"📊 All eBay Listings ({ebay_listings_count} listings) - Generic Median: ${ebay_generic_median:.2f}\n")
                summary_lines.append("")
                
                # Get price range
                price_range = result.get('price_range', (0, 0))
                price_min = price_range[0] if isinstance(price_range, (tuple, list)) and len(price_range) >= 2 else 0
                price_max = price_range[1] if isinstance(price_range, (tuple, list)) and len(price_range) >= 2 else 0
                average_price = result.get('average_price', 0)
                
                summary_lines.append(f"Median Calculation: ${ebay_generic_median:.2f}")
                summary_lines.append(f"Number of Listings: {ebay_listings_count}")
                summary_lines.append(f"Price Range: {price_min:.2f} - {price_max:.2f}")
                summary_lines.append(f"Average Price: ${average_price:.2f}")
            
            return "\n".join(summary_lines)
            
        except Exception as e:
            logger.error(f"Error generating eBay summary: {e}", exc_info=True)
            return "Error generating eBay summary"   
    
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
            
            logger.warning(f"Failed to get eBay token: {response.status_code} - {response.text}")
            return None
            
        except Exception as e:
            logger.error(f"eBay token error: {str(e)}")
            return None