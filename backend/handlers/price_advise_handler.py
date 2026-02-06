"""
Price Advise Handler - Integrates Discogs and eBay for price estimation
"""

import os
import requests
import json
import logging
from typing import Dict, List, Optional, Tuple, Any
import time
import urllib.parse

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PriceAdviseHandler:
    """
    Handler for getting price advice from Discogs and eBay APIs
    """
    
    def __init__(self, discogs_token: str = None, 
                 ebay_client_id: str = None, 
                 ebay_client_secret: str = None):
        """
        Initialize the price advise handler with API credentials
        
        Args:
            discogs_token: Discogs API personal access token
            ebay_client_id: eBay OAuth client ID
            ebay_client_secret: eBay OAuth client secret
        """
        self.discogs_token = discogs_token or os.environ.get('DISCOGS_USER_TOKEN')
        self.ebay_client_id = ebay_client_id or os.environ.get('EBAY_CLIENT_ID')
        self.ebay_client_secret = ebay_client_secret or os.environ.get('EBAY_CLIENT_SECRET')
        
        # eBay OAuth token
        self.ebay_access_token = None
        self.ebay_token_expiry = 0
        
        # Condition mapping between different systems
        self.condition_mapping = {
            'M': 'Mint (M)',
            'Mint': 'Mint (M)',
            'NM': 'Near Mint (NM or M-)',
            'Near Mint': 'Near Mint (NM or M-)',
            'VG+': 'Very Good Plus (VG+)',
            'Very Good Plus': 'Very Good Plus (VG+)',
            'VG': 'Very Good (VG)',
            'Very Good': 'Very Good (VG)',
            'G+': 'Good Plus (G+)',
            'Good Plus': 'Good Plus (G+)',
            'G': 'Good (G)',
            'Good': 'Good (G)',
            'F': 'Fair (F)',
            'Fair': 'Fair (F)',
            'P': 'Poor (P)',
            'Poor': 'Poor (P)'
        }
        
        logger.info(f"PriceAdviseHandler initialized with Discogs token: {'Yes' if self.discogs_token else 'No'}")
        logger.info(f"PriceAdviseHandler initialized with eBay credentials: {'Yes' if self.ebay_client_id else 'No'}")
    
    def get_price_estimate(self, 
                          artist: str, 
                          title: str, 
                          selected_condition: str,
                          discogs_genre: str = '',
                          discogs_id: str = '') -> Dict[str, Any]:
        """
        Get price estimate from Discogs and eBay
        
        Args:
            artist: Artist name
            title: Album title
            selected_condition: Condition (M, NM, VG+, VG, G+, G, F, P)
            discogs_genre: Optional Discogs genre for weighting
            discogs_id: Optional Discogs release ID
            
        Returns:
            Dictionary with price estimate and data sources
        """
        result = {
            'success': False,
            'estimated_price': 0.0,
            'price_source': 'none',
            'calculation': [],
            'ebay_summary': {},
            'ebay_listings': [],
            'discogs_price': None,
            'ebay_price': None,
            'search_query': f"{artist} - {title}",
            'error': None
        }
        
        try:
            # Log the search parameters
            logger.info(f"=== PRICE ESTIMATE START ===")
            logger.info(f"Searching: {artist} - {title}")
            logger.info(f"Selected condition: '{selected_condition}'")
            logger.info(f"Discogs ID: {discogs_id}")
            logger.info(f"Discogs genre: {discogs_genre}")
            
            # Get Discogs price if we have an ID
            discogs_price = None
            if discogs_id and self.discogs_token:
                logger.info(f"Attempting Discogs price lookup for release ID: {discogs_id}")
                
                # ADDED: Log the condition we're searching for
                logger.info(f"[DEBUG] Condition being searched for: '{selected_condition}'")
                
                discogs_price = self._get_discogs_price(discogs_id, selected_condition)
                result['discogs_price'] = discogs_price
                
                if discogs_price:
                    logger.info(f"Discogs price found: ${discogs_price:.2f}")
                    result['calculation'].append(f"Discogs price: ${discogs_price:.2f}")
                else:
                    logger.warning(f"Discogs returned no price data for '{artist} - {title}' (release_id: {discogs_id})")
            
            # Get eBay price
            logger.info(f"Attempting eBay price lookup for: {artist} - {title}")
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
            
            # Calculate final price
            estimated_price = 0.0
            calculation_steps = []
            
            if discogs_price and ebay_price:
                # Average both sources with genre weighting
                discogs_weight = 0.4
                ebay_weight = 0.6
                
                # Adjust weights based on genre if provided
                if discogs_genre and 'Rock' in discogs_genre:
                    discogs_weight = 0.5
                    ebay_weight = 0.5
                
                estimated_price = (discogs_price * discogs_weight) + (ebay_price * ebay_weight)
                result['price_source'] = 'combined'
                calculation_steps.append(f"Discogs: ${discogs_price:.2f} × {discogs_weight:.1f} = ${discogs_price * discogs_weight:.2f}")
                calculation_steps.append(f"eBay: ${ebay_price:.2f} × {ebay_weight:.1f} = ${ebay_price * ebay_weight:.2f}")
                calculation_steps.append(f"Combined: ${estimated_price:.2f}")
                
            elif discogs_price:
                estimated_price = discogs_price
                result['price_source'] = 'discogs'
                calculation_steps.append(f"Discogs only: ${discogs_price:.2f}")
                
            elif ebay_price:
                estimated_price = ebay_price
                result['price_source'] = 'ebay'
                calculation_steps.append(f"eBay only: ${ebay_price:.2f}")
                
            else:
                # Fallback price
                estimated_price = 19.99
                result['price_source'] = 'fallback'
                calculation_steps.append(f"No data found, using fallback: ${estimated_price:.2f}")
            
            # Update result
            result['estimated_price'] = round(estimated_price, 2)
            result['price'] = round(estimated_price, 2)  # For compatibility
            result['calculation_steps'] = calculation_steps
            result['calculation'] = calculation_steps  # For compatibility
            result['success'] = True
            
            # Log final result
            logger.info(f"=== PRICE ESTIMATE RESULT ===")
            logger.info(f"Final estimated price: ${result['estimated_price']:.2f}")
            logger.info(f"Price source: {result['price_source']}")
            logger.info(f"Calculation: {result['calculation']}")
            logger.info(f"Discogs price: {discogs_price}")
            logger.info(f"eBay price: {ebay_price}")
            logger.info(f"eBay listings count: {len(ebay_listings)}")
            
        except Exception as e:
            logger.error(f"Error in get_price_estimate: {str(e)}", exc_info=True)
            result['error'] = str(e)
            result['estimated_price'] = 19.99  # Fallback
        
        return result
    
    def _get_discogs_price(self, release_id: str, condition: str) -> Optional[float]:
        """
        Get price suggestion from Discogs API for a specific condition
        
        Args:
            release_id: Discogs release ID
            condition: Record condition (M, NM, VG+, VG, G+, G, F, P)
            
        Returns:
            Price as float or None if not found
        """
        if not self.discogs_token:
            logger.warning("No Discogs token available")
            return None
        
        try:
            # Construct API URL
            url = f"https://api.discogs.com/marketplace/price_suggestions/{release_id}"
            headers = {
                'Authorization': f'Discogs token={self.discogs_token}',
                'User-Agent': 'PigStyleRecords/1.0'
            }
            
            logger.info(f"Making Discogs API call to: {url}")
            logger.info(f"Looking for condition: '{condition}'")
            
            response = requests.get(url, headers=headers, timeout=10)
            
            # Log raw response for debugging
            logger.info(f"Discogs API response status: {response.status_code}")
            
            if response.status_code != 200:
                logger.warning(f"Discogs API error: {response.status_code} - {response.text[:200]}")
                return None
            
            data = response.json()
            
            # ENHANCED DEBUGGING: Log what Discogs returns
            logger.info(f"[DEBUG] === DISCOGS API RESPONSE ===")
            logger.info(f"[DEBUG] Full response keys: {list(data.keys())}")
            
            # Log each condition available
            for key in data.keys():
                if isinstance(data[key], dict) and 'value' in data[key]:
                    value = data[key]['value']
                    currency = data[key].get('currency', 'USD')
                    logger.info(f"[DEBUG] Available condition: '{key}' = {value} {currency}")
            
            # Map our condition to Discogs format
            discogs_condition = self._map_to_discogs_condition(condition)
            logger.info(f"[DEBUG] Mapped condition '{condition}' -> '{discogs_condition}'")
            
            # Check if the mapped condition exists
            if discogs_condition in data:
                price_info = data[discogs_condition]
                logger.info(f"[DEBUG] ✓ MATCH FOUND for '{discogs_condition}'")
                logger.info(f"[DEBUG] Price info: {price_info}")
                
                if isinstance(price_info, dict) and 'value' in price_info:
                    price = price_info['value']
                    currency = price_info.get('currency', 'USD')
                    logger.info(f"[DEBUG] Extracted price: {price} {currency}")
                    return float(price)
                else:
                    logger.warning(f"[DEBUG] Price info is not a dict or missing 'value' key: {price_info}")
                    return None
            else:
                # Try partial matching
                logger.info(f"[DEBUG] ✗ Exact match not found. Attempting partial match...")
                
                # Try to find a partial match
                for key in data.keys():
                    # Check if our condition is in the Discogs condition string
                    condition_lower = condition.lower()
                    key_lower = key.lower()
                    
                    # Check for partial matches
                    if condition_lower in key_lower or any(
                        term in key_lower for term in condition_lower.split()
                    ):
                        logger.info(f"[DEBUG] → Partial match found: '{condition}' matches '{key}'")
                        price_info = data[key]
                        
                        if isinstance(price_info, dict) and 'value' in price_info:
                            price = price_info['value']
                            logger.info(f"[DEBUG] Using partial match price: {price}")
                            return float(price)
                
                # Try exact string matching without mapping
                logger.info(f"[DEBUG] Trying exact match with original condition: '{condition}'")
                if condition in data:
                    price_info = data[condition]
                    logger.info(f"[DEBUG] ✓ Found exact match with original condition")
                    
                    if isinstance(price_info, dict) and 'value' in price_info:
                        price = price_info['value']
                        logger.info(f"[DEBUG] Price from exact match: {price}")
                        return float(price)
                
                logger.warning(f"[DEBUG] ✗ No match found for condition '{condition}' or '{discogs_condition}'")
                logger.warning(f"[DEBUG] Available conditions: {list(data.keys())}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Discogs API request failed: {str(e)}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Discogs JSON response: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error in _get_discogs_price: {str(e)}", exc_info=True)
            return None
    
    def _map_to_discogs_condition(self, condition: str) -> str:
        """
        Map our condition format to Discogs condition format
        
        Args:
            condition: Our condition format (M, NM, VG+, VG, etc.)
            
        Returns:
            Discogs condition format
        """
        # Clean up the condition string
        condition_clean = condition.strip()
        
        # Check if it's already in Discogs format
        if '(' in condition_clean and ')' in condition_clean:
            return condition_clean
        
        # Map from our format to Discogs format
        return self.condition_mapping.get(condition_clean, condition_clean)
    
    def _get_ebay_price_with_listings(self, 
                                     artist: str, 
                                     title: str, 
                                     condition: str) -> Dict[str, Any]:
        """
        Get eBay price estimate with listings
        
        Args:
            artist: Artist name
            title: Album title
            condition: Record condition
            
        Returns:
            Dictionary with estimated price and listings
        """
        result = {
            'estimated_price': None,
            'listings': [],
            'summary': {
                'total_listings': 0,
                'condition_listings': 0,
                'price_range': None,
                'median_price': None
            }
        }
        
        try:
            # Get eBay OAuth token
            access_token = self._get_ebay_access_token()
            if not access_token:
                logger.error("Failed to get eBay access token")
                return result
            
            # Search on eBay
            search_query = f"{artist} {title} vinyl"
            encoded_query = urllib.parse.quote(search_query)
            
            url = f"https://api.ebay.com/buy/browse/v1/item_summary/search?q={encoded_query}&limit=50&filter=conditions:{{NEW|USED}}"
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            logger.info(f"Making eBay API call for: {search_query}")
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code != 200:
                logger.warning(f"eBay API error: {response.status_code} - {response.text[:200]}")
                return result
            
            data = response.json()
            items = data.get('itemSummaries', [])
            
            # Filter for vinyl records and condition
            vinyl_listings = []
            for item in items:
                # Check if it's a vinyl record
                title_lower = item.get('title', '').lower()
                if 'vinyl' not in title_lower and 'lp' not in title_lower:
                    continue
                
                # Get price
                price_obj = item.get('price', {})
                price_value = price_obj.get('value', '0') if isinstance(price_obj, dict) else '0'
                
                try:
                    price = float(price_value)
                except (ValueError, TypeError):
                    price = 0.0
                
                # Get shipping cost using helper method
                shipping_cost = self._get_ebay_shipping_cost(item)
                
                # Calculate total (price + shipping)
                total_price = price + shipping_cost
                
                # Get condition
                item_condition = item.get('condition', '')
                condition_id = item.get('conditionId', '')
                
                # Check if condition matches (simple check)
                matches_condition = False
                if condition and item_condition:
                    condition_lower = condition.lower()
                    item_condition_lower = item_condition.lower()
                    
                    # Simple matching logic
                    condition_mapping = {
                        'm': ['mint', 'new'],
                        'nm': ['near mint', 'nm', 'm-'],
                        'vg+': ['very good plus', 'vg+', 'vg plus'],
                        'vg': ['very good', 'vg'],
                        'g+': ['good plus', 'g+'],
                        'g': ['good', 'g'],
                        'f': ['fair', 'f'],
                        'p': ['poor', 'p']
                    }
                    
                    # Check if any term from our condition mapping matches
                    if condition_lower in condition_mapping:
                        terms_to_check = condition_mapping[condition_lower]
                        matches_condition = any(term in item_condition_lower for term in terms_to_check)
                
                listing = {
                    'title': item.get('title', ''),
                    'price': price,
                    'shipping': shipping_cost,  # Could be 0.0 if not available
                    'total': total_price,  # Always a valid number (price + shipping)
                    'condition': item_condition,
                    'condition_id': condition_id,
                    'url': item.get('itemWebUrl', ''),
                    'image_url': item.get('image', {}).get('imageUrl', '') if isinstance(item.get('image'), dict) else '',
                    'matches_condition': matches_condition,  # Flag for condition matching
                    'free_shipping': shipping_cost == 0.0  # Flag for free shipping
                }
                
                vinyl_listings.append(listing)
            
            # Calculate statistics
            if vinyl_listings:
                # Sort by total price (price + shipping)
                sorted_listings = sorted(vinyl_listings, key=lambda x: x['total'])
                
                # Calculate median
                totals = [l['total'] for l in sorted_listings if l['total'] > 0]
                if totals:
                    median_index = len(totals) // 2
                    median_price = totals[median_index]
                    
                    # Filter by condition if specified
                    condition_listings = []
                    if condition:
                        # Use the matches_condition flag we already calculated
                        condition_listings = [l for l in sorted_listings if l['matches_condition']]
                    
                    # Use condition-filtered listings if available, otherwise all listings
                    price_listings = condition_listings if condition_listings else sorted_listings
                    
                    if price_listings:
                        condition_totals = [l['total'] for l in price_listings if l['total'] > 0]
                        if condition_totals:
                            # Use median of condition-filtered totals
                            cond_median_index = len(condition_totals) // 2
                            estimated_price = condition_totals[cond_median_index]
                        else:
                            # Fallback to overall median
                            estimated_price = median_price
                    else:
                        estimated_price = median_price
                    
                    result['estimated_price'] = round(estimated_price, 2)
                    result['listings'] = sorted_listings[:20]  # Return top 20 listings
                    
                    # Update summary
                    result['summary']['total_listings'] = len(vinyl_listings)
                    result['summary']['condition_listings'] = len(condition_listings)
                    result['summary']['median_price'] = round(median_price, 2)
                    
                    if totals:
                        result['summary']['price_range'] = {
                            'min': round(min(totals), 2),
                            'max': round(max(totals), 2)
                        }
            
            logger.info(f"eBay search found {len(vinyl_listings)} vinyl listings")
            logger.info(f"Estimated eBay price: {result['estimated_price']}")
            
        except Exception as e:
            logger.error(f"Error in _get_ebay_price_with_listings: {str(e)}", exc_info=True)
        
        return result
    
    def _get_ebay_shipping_cost(self, item: dict) -> float:
        """
        Extract shipping cost from eBay item data
        
        Args:
            item: eBay item dictionary from API
            
        Returns:
            Shipping cost as float (0.0 if not available)
        """
        try:
            # eBay API structure may vary - check multiple possible locations
            shipping_cost = 0.0
            
            # Method 1: Check shippingOptions array
            shipping_options = item.get('shippingOptions', [])
            if shipping_options and isinstance(shipping_options, list):
                first_option = shipping_options[0]
                if isinstance(first_option, dict):
                    shipping_cost_dict = first_option.get('shippingCost', {})
                    if isinstance(shipping_cost_dict, dict):
                        cost_value = shipping_cost_dict.get('value', '0')
                        if cost_value:
                            shipping_cost = float(cost_value)
            
            # Method 2: Check for direct shipping cost field (if different API version)
            if shipping_cost == 0.0:
                shipping_info = item.get('shippingCost', {})
                if isinstance(shipping_info, dict):
                    cost_value = shipping_info.get('value', '0')
                    if cost_value:
                        shipping_cost = float(cost_value)
            
            # Method 3: Check for shipping price in additional fields
            if shipping_cost == 0.0 and 'shippingPrice' in item:
                shipping_price = item.get('shippingPrice', {})
                if isinstance(shipping_price, dict):
                    cost_value = shipping_price.get('value', '0')
                    if cost_value:
                        shipping_cost = float(cost_value)
            
            logger.debug(f"Extracted shipping cost: ${shipping_cost:.2f} for item: {item.get('title', '')[:50]}...")
            return shipping_cost
            
        except (KeyError, IndexError, ValueError, TypeError, AttributeError) as e:
            logger.debug(f"Could not extract shipping cost: {str(e)}. Using 0.0")
            return 0.0
    
    def _get_ebay_access_token(self) -> Optional[str]:
        """
        Get OAuth access token for eBay API
        
        Returns:
            Access token string or None if failed
        """
        # Check if we have a valid cached token
        if self.ebay_access_token and time.time() < self.ebay_token_expiry:
            return self.ebay_access_token
        
        if not self.ebay_client_id or not self.ebay_client_secret:
            logger.error("eBay credentials not configured")
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
            
            # Basic auth
            auth = (self.ebay_client_id, self.ebay_client_secret)
            
            response = requests.post(url, headers=headers, data=data, auth=auth, timeout=10)
            
            if response.status_code == 200:
                token_data = response.json()
                self.ebay_access_token = token_data.get('access_token')
                expires_in = token_data.get('expires_in', 7200)
                self.ebay_token_expiry = time.time() + expires_in - 300  # 5 minute buffer
                
                logger.info("Successfully obtained eBay OAuth token")
                return self.ebay_access_token
            else:
                logger.error(f"Failed to get eBay token: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting eBay token: {str(e)}")
            return None

# Example usage
if __name__ == "__main__":
    # Test the handler
    handler = PriceAdviseHandler(
        discogs_token=os.environ.get('DISCOGS_USER_TOKEN'),
        ebay_client_id=os.environ.get('EBAY_CLIENT_ID'),
        ebay_client_secret=os.environ.get('EBAY_CLIENT_SECRET')
    )
    
    # Test with your specific case
    result = handler.get_price_estimate(
        artist="Asleep At The Wheel",
        title="Framed",
        selected_condition="VG+",
        discogs_id="7817943"
    )
    
    print("\n=== TEST RESULT ===")
    print(f"Success: {result['success']}")
    print(f"Estimated Price: ${result['estimated_price']:.2f}")
    print(f"Price Source: {result['price_source']}")
    print(f"Discogs Price: {result['discogs_price']}")
    print(f"eBay Price: {result['ebay_price']}")
    print(f"eBay Listings count: {len(result['ebay_listings'])}")
    
    # Show first few listings with price breakdown
    if result['ebay_listings']:
        print("\n=== FIRST 3 EBAY LISTINGS ===")
        for i, listing in enumerate(result['ebay_listings'][:3]):
            print(f"{i+1}. {listing['title'][:50]}...")
            print(f"   Price: ${listing['price']:.2f}")
            print(f"   Shipping: ${listing['shipping']:.2f}")
            print(f"   Total: ${listing['total']:.2f}")
            print(f"   Condition: {listing['condition']}")
            print(f"   Matches Condition: {listing['matches_condition']}")
            print()