import requests
import json
import time
from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple
from enum import Enum
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================
# DATA MODELS
# ============================================

class Condition(Enum):
    MINT = "Mint (M)"
    NEAR_MINT = "Near Mint (NM)"
    VERY_GOOD_PLUS = "Very Good Plus (VG+)"
    VERY_GOOD = "Very Good (VG)"
    GOOD = "Good (G)"
    FAIR = "Fair (F)"
    POOR = "Poor (P)"
    
    @classmethod
    def from_string(cls, condition_str: str):
        """Convert string input to Condition enum"""
        logger.debug(f"Converting condition string: '{condition_str}'")
        condition_map = {
            'm': cls.MINT,
            'mint': cls.MINT,
            'nm': cls.NEAR_MINT,
            'near mint': cls.NEAR_MINT,
            'vg+': cls.VERY_GOOD_PLUS,
            'vgplus': cls.VERY_GOOD_PLUS,
            'vg': cls.VERY_GOOD,
            'very good': cls.VERY_GOOD,
            'g': cls.GOOD,
            'good': cls.GOOD,
            'f': cls.FAIR,
            'fair': cls.FAIR,
            'p': cls.POOR,
            'poor': cls.POOR
        }
        result = condition_map.get(condition_str.lower().strip(), cls.VERY_GOOD_PLUS)
        logger.debug(f"Condition mapping result: {result}")
        return result

@dataclass
class PriceEstimate:
    catalog_number: str
    estimated_price: float
    price_range_low: float
    price_range_high: float
    confidence_score: float
    condition_multiplier: float
    demand_adjustment: float
    base_median_price: float
    want_have_ratio: float
    num_sales: int

# ============================================
# CONDITION MULTIPLIERS
# ============================================

def get_condition_multiplier(media_condition: Condition, sleeve_condition: Condition) -> float:
    """
    Returns a price multiplier based on media and sleeve conditions.
    Uses established Discogs grading standards.
    """
    logger.info("Calculating condition multiplier")
    logger.debug(f"Media condition: {media_condition}, Sleeve condition: {sleeve_condition}")
    
    condition_multipliers = {
        Condition.MINT: 1.35,
        Condition.NEAR_MINT: 1.00,
        Condition.VERY_GOOD_PLUS: 0.80,
        Condition.VERY_GOOD: 0.55,
        Condition.GOOD: 0.25,
        Condition.FAIR: 0.15,
        Condition.POOR: 0.08
    }
    
    media_mult = condition_multipliers.get(media_condition, 0.55)
    sleeve_mult = condition_multipliers.get(sleeve_condition, 0.55)
    logger.info(f"Media multiplier: {media_mult}, Sleeve multiplier: {sleeve_mult}")
    
    # Weighted average: media matters more than sleeve
    combined_multiplier = (media_mult * 0.7) + (sleeve_mult * 0.3)
    logger.info(f"Combined condition multiplier (70% media, 30% sleeve): {combined_multiplier:.3f}")
    
    return round(combined_multiplier, 3)

# ============================================
# DEMAND CALCULATION
# ============================================

def calculate_demand_adjustment(wants: int, haves: int) -> Tuple[float, float]:
    """
    Calculate demand adjustment and want/have ratio.
    Returns (adjustment_factor, ratio)
    """
    logger.info("Calculating demand adjustment")
    logger.debug(f"Wants: {wants}, Haves: {haves}")
    
    if haves == 0:
        logger.warning("No 'haves' data available - cannot calculate demand ratio")
        return 1.0, 0.0
    
    ratio = wants / haves if haves > 0 else 0
    logger.info(f"Want/Have ratio: {ratio:.2f}")
    
    # Demand-based pricing adjustments
    if ratio >= 2.0:  # Very high demand (2+ wants per have)
        adjustment = 1.25
        logger.info(f"Very high demand detected (ratio >= 2.0) - adjustment: {adjustment}")
    elif ratio >= 1.5:
        adjustment = 1.15
        logger.info(f"High demand detected (ratio >= 1.5) - adjustment: {adjustment}")
    elif ratio >= 1.0:
        adjustment = 1.05
        logger.info(f"Above average demand (ratio >= 1.0) - adjustment: {adjustment}")
    elif ratio >= 0.5:
        adjustment = 1.00
        logger.info(f"Average demand (ratio >= 0.5) - adjustment: {adjustment}")
    elif ratio >= 0.2:
        adjustment = 0.95
        logger.info(f"Below average demand (ratio >= 0.2) - adjustment: {adjustment}")
    else:  # Low demand
        adjustment = 0.85
        logger.info(f"Low demand detected (ratio < 0.2) - adjustment: {adjustment}")
        
    return adjustment, ratio

# ============================================
# CONFIDENCE SCORE
# ============================================

def calculate_confidence(num_sales: int, want_have_ratio: float) -> float:
    """
    Calculate confidence score (0-100) based on data availability.
    """
    logger.info("Calculating confidence score")
    logger.debug(f"Number of sales: {num_sales}, Want/Have ratio: {want_have_ratio:.2f}")
    
    # More sales = higher confidence
    sales_confidence = min(num_sales / 30.0, 1.0) * 70
    logger.info(f"Sales-based confidence: {sales_confidence:.1f} (based on {num_sales} sales)")
    
    # Extreme ratios indicate potential instability
    if 0.5 <= want_have_ratio <= 2.0:
        ratio_confidence = 30
        logger.info(f"Stable demand ratio - ratio confidence: {ratio_confidence}")
    elif 0.2 <= want_have_ratio <= 5.0:
        ratio_confidence = 15
        logger.info(f"Moderate demand ratio - ratio confidence: {ratio_confidence}")
    else:
        ratio_confidence = 5
        logger.warning(f"Extreme demand ratio detected - ratio confidence: {ratio_confidence}")
        
    total_confidence = min(sales_confidence + ratio_confidence, 100)
    logger.info(f"Total confidence score: {total_confidence:.1f}%")
    
    return total_confidence

# ============================================
# DISCOGS API INTERACTION
# ============================================

class DiscogsPriceEstimator:
    """
    Main class for estimating record prices using Discogs data.
    """
    
    def __init__(self, user_token: str):
        """
        Initialize with your Discogs API token.
        """
        logger.info("Initializing DiscogsPriceEstimator")
        self.user_token = user_token
        self.base_url = "https://api.discogs.com"
        self.headers = {
            'User-Agent': 'RecordPriceEstimator/1.0',
            'Authorization': f'Discogs token={user_token}'
        }
        logger.debug("Headers configured for Discogs API")
        
    def search_by_catalog(self, catalog_number: str) -> Dict:
        """
        Search for a release by catalog number.
        Returns the matching release.
        Raises ValueError if no release found.
        """
        logger.info(f"Searching Discogs for catalog number: '{catalog_number}'")
        search_url = f"{self.base_url}/database/search"
        params = {
            'q': catalog_number,
            'type': 'release',
            'per_page': 5
        }
        logger.debug(f"Search URL: {search_url}, Params: {params}")
        
        try:
            logger.info("Sending search request to Discogs API")
            response = requests.get(search_url, headers=self.headers, params=params)
            logger.debug(f"Response status code: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            logger.debug(f"Response received, results count: {len(data.get('results', []))}")
            
            if not data.get('results'):
                logger.error(f"No results found for catalog number: {catalog_number}")
                raise ValueError(f"No release found for catalog number: {catalog_number}")
                
            logger.info(f"Found {len(data['results'])} potential matches")
            # Find exact catalog match
            for result in data['results']:
                result_catnos = result.get('catno', '').split(',')
                logger.debug(f"Checking result: {result.get('title')} - Catalog numbers: {result_catnos}")
                if catalog_number.lower() in [cat.lower() for cat in result_catnos]:
                    logger.info(f"Exact catalog match found: {result.get('title')}")
                    return result
                    
            # No exact match found
            logger.warning(f"No exact catalog match found for: {catalog_number}")
            raise ValueError(f"No exact catalog match found for: {catalog_number}")
                
        except requests.exceptions.RequestException as e:
            logger.error(f"API error searching for catalog {catalog_number}: {e}")
            raise RuntimeError(f"Discogs API error: {e}")
    
    def get_release_stats(self, release_id: int) -> Dict:
        """
        Get community stats and market data for a release.
        Raises RuntimeError if stats unavailable.
        """
        logger.info(f"Fetching community stats for release ID: {release_id}")
        stats_url = f"{self.base_url}/releases/{release_id}/stats"
        logger.debug(f"Stats URL: {stats_url}")
        
        try:
            logger.info("Sending stats request to Discogs API")
            response = requests.get(stats_url, headers=self.headers)
            logger.debug(f"Response status code: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            
            if not data.get('community'):
                logger.error(f"No community data in stats response for release {release_id}")
                raise RuntimeError(f"No community data available for release {release_id}")
                
            community = data.get('community', {})
            logger.info(f"Community stats retrieved - Wants: {community.get('want', 0)}, Haves: {community.get('have', 0)}")
            return data
            
        except requests.exceptions.RequestException as e:
            logger.error(f"API error fetching stats for release {release_id}: {e}")
            raise RuntimeError(f"Failed to fetch community stats: {e}")
    
    def get_marketplace_stats(self, release_id: int) -> Dict:
        """
        Get marketplace statistics including price history.
        Raises RuntimeError if no marketplace data available.
        """
        logger.info(f"Fetching marketplace stats for release ID: {release_id}")
        marketplace_url = f"{self.base_url}/marketplace/stats/{release_id}"
        logger.debug(f"Marketplace URL: {marketplace_url}")
        
        try:
            logger.info("Sending marketplace stats request to Discogs API")
            response = requests.get(marketplace_url, headers=self.headers)
            logger.debug(f"Response status code: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            
            # Check if we have actual price data
            if 'median' not in data or data['median'] is None:
                logger.error(f"No median price data in marketplace response for release {release_id}")
                logger.debug(f"Marketplace response: {data}")
                raise RuntimeError(f"No median price data available for release {release_id} - this release has no sales history")
            
            if data['median'] == 0:
                logger.warning(f"Median price is $0 for release {release_id}")
                raise RuntimeError(f"Median price is $0 - no sales data available")
                
            logger.info(f"Marketplace stats retrieved - Median: ${data['median']}, Sales: {data.get('num_sales', 0)}")
            return data
            
        except requests.exceptions.RequestException as e:
            logger.error(f"API error fetching marketplace stats: {e}")
            raise RuntimeError(f"Failed to fetch marketplace stats: {e}")
    
    def estimate_price(self, 
                      catalog_number: str,
                      media_condition: str,
                      sleeve_condition: str) -> PriceEstimate:
        """
        Main method to estimate price for a record.
        RAISES EXCEPTIONS - NO SILENT FAILURES!
        
        Args:
            catalog_number: The record's catalog number
            media_condition: Media condition (e.g., "NM", "VG+")
            sleeve_condition: Sleeve condition
            
        Returns:
            PriceEstimate object
            
        Raises:
            ValueError: If release not found or invalid input
            RuntimeError: If no market data available
            requests.exceptions.RequestException: If API calls fail
        """
        
        logger.info("="*60)
        logger.info(f"STARTING PRICE ESTIMATION for catalog: {catalog_number}")
        logger.info("="*60)
        
        # Step 1: Find the release - FAIL HARD if not found
        logger.info("STEP 1: Searching for release by catalog number")
        release = self.search_by_catalog(catalog_number)
        release_id = release['id']
        title = release.get('title', 'Unknown')
        logger.info(f"STEP 1 COMPLETE: Found release '{title}' (ID: {release_id})")
        
        # Step 2: Get community stats
        logger.info("STEP 2: Fetching community statistics")
        stats = self.get_release_stats(release_id)
        logger.info(f"STEP 2 COMPLETE: Community stats retrieved successfully")
        
        # Step 3: Parse conditions
        logger.info("STEP 3: Parsing condition inputs")
        media_cond = Condition.from_string(media_condition)
        sleeve_cond = Condition.from_string(sleeve_condition)
        logger.info(f"STEP 3 COMPLETE: Media: {media_cond.value}, Sleeve: {sleeve_cond.value}")
        
        # Step 4: Get marketplace data - MUST HAVE MEDIAN PRICE
        logger.info("STEP 4: Fetching marketplace statistics")
        marketplace = self.get_marketplace_stats(release_id)
        base_median_price = marketplace['median']
        num_sales = marketplace.get('num_sales', 0)
        logger.info(f"STEP 4 COMPLETE: Base median price: ${base_median_price}, Sales: {num_sales}")
        
        # Step 5: Calculate condition multiplier
        logger.info("STEP 5: Calculating condition multiplier")
        condition_mult = get_condition_multiplier(media_cond, sleeve_cond)
        logger.info(f"STEP 5 COMPLETE: Condition multiplier: {condition_mult}")
        
        # Step 6: Calculate demand adjustment
        logger.info("STEP 6: Calculating demand adjustment")
        wants = stats.get('community', {}).get('want', 0)
        haves = stats.get('community', {}).get('have', 0)
        logger.debug(f"Wants: {wants}, Haves: {haves}")
        
        if haves == 0:
            logger.warning("No 'haves' data - demand adjustment will be neutral")
        
        demand_adjust, want_have_ratio = calculate_demand_adjustment(wants, haves)
        logger.info(f"STEP 6 COMPLETE: Demand adjustment: {demand_adjust}, Want/Have ratio: {want_have_ratio:.2f}")
        
        # Step 7: Calculate final price
        logger.info("STEP 7: Calculating final estimated price")
        logger.debug(f"Base price: ${base_median_price} × Condition multiplier: {condition_mult} × Demand adjustment: {demand_adjust}")
        estimated_price = base_median_price * condition_mult * demand_adjust
        logger.info(f"STEP 7 COMPLETE: Estimated price: ${estimated_price:.2f}")
        
        # Step 8: Apply price range based on condition confidence
        logger.info("STEP 8: Calculating price range")
        condition_variance = 1.0 - (condition_mult / 1.35)
        logger.debug(f"Condition variance: {condition_variance:.3f}")
        price_range_low = estimated_price * (0.85 - (condition_variance * 0.15))
        price_range_high = estimated_price * (1.15 + (condition_variance * 0.15))
        logger.info(f"STEP 8 COMPLETE: Price range: ${price_range_low:.2f} - ${price_range_high:.2f}")
        
        # Step 9: Calculate confidence score
        logger.info("STEP 9: Calculating confidence score")
        confidence = calculate_confidence(num_sales, want_have_ratio)
        logger.info(f"STEP 9 COMPLETE: Confidence score: {confidence:.1f}%")
        
        # Step 10: Return result
        logger.info("STEP 10: Creating final PriceEstimate object")
        result = PriceEstimate(
            catalog_number=catalog_number,
            estimated_price=round(estimated_price, 2),
            price_range_low=round(price_range_low, 2),
            price_range_high=round(price_range_high, 2),
            confidence_score=round(confidence, 1),
            condition_multiplier=condition_mult,
            demand_adjustment=round(demand_adjust, 2),
            base_median_price=round(base_median_price, 2),
            want_have_ratio=round(want_have_ratio, 2),
            num_sales=num_sales
        )
        logger.info("="*60)
        logger.info(f"PRICE ESTIMATION COMPLETE: ${result.estimated_price}")
        logger.info("="*60)
        
        return result

# ============================================
# MAIN FUNCTION
# ============================================

# INSERT YOUR ACTUAL DISCOGS TOKEN HERE
DISCOGS_TOKEN = "HylxGPoAuRgKwLfzbybZRyTxvxqXbrYJUhsZAkZq"  # Your token

def main():
    # Initialize estimator with your token
    logger.info("Starting Record Price Estimator")
    estimator = DiscogsPriceEstimator(DISCOGS_TOKEN)
    
    print("\n" + "="*60)
    print("🎵 RECORD PRICE ESTIMATOR")
    print("="*60)
    
    # Get user input
    catalog = input("\nEnter catalog number: ").strip()
    media_cond = input("Enter media condition (Mint, NM, VG+, VG, G, F, P): ").strip()
    sleeve_cond = input("Enter sleeve condition (Mint, NM, VG+, VG, G, F, P): ").strip()
    
    try:
        # Get estimate - NO FALLBACKS!
        estimate = estimator.estimate_price(
            catalog_number=catalog,
            media_condition=media_cond,
            sleeve_condition=sleeve_cond
        )
        
        print("\n" + "-"*40)
        print("💰 PRICE ESTIMATE RESULTS")
        print("-"*40)
        print(f"📀 Catalog: {estimate.catalog_number}")
        print(f"💵 Estimated Price: ${estimate.estimated_price}")
        print(f"📊 Price Range: ${estimate.price_range_low} - ${estimate.price_range_high}")
        print(f"✅ Confidence Score: {estimate.confidence_score}%")
        print(f"📈 Condition Multiplier: {estimate.condition_multiplier}")
        print(f"🎯 Demand Adjustment: {estimate.demand_adjustment}")
        print(f"📉 Base Median Price: ${estimate.base_median_price}")
        print(f"📊 Want/Have Ratio: {estimate.want_have_ratio}")
        print(f"🔄 Based on {estimate.num_sales} sales")
        print("-"*40)
        
    except ValueError as e:
        logger.error(f"Input error: {e}")
        print(f"\n❌ CANNOT CALCULATE - {e}")
        print("💡 Check that the catalog number exists on Discogs")
        
    except RuntimeError as e:
        logger.error(f"Data error: {e}")
        print(f"\n❌ CANNOT CALCULATE - {e}")
        print("💡 The release exists but has no market data available")
        
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error: {e}")
        print(f"\n❌ CANNOT CALCULATE - API ERROR: {e}")
        if e.response.status_code == 401:
            print("💡 Your Discogs API token is invalid or expired")
            print("   Get a new token at: https://www.discogs.com/settings/developers")
        elif e.response.status_code == 429:
            print("💡 Rate limit exceeded - wait a minute and try again")
        else:
            print(f"💡 HTTP {e.response.status_code} error")
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Network error: {e}")
        print(f"\n❌ CANNOT CALCULATE - NETWORK ERROR: {e}")
        print("💡 Check your internet connection")
        
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        print(f"\n❌ CANNOT CALCULATE - UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()

# ============================================
# QUICK FUNCTION FOR PROGRAMMATIC USE
# ============================================

def quick_price_estimate(catalog_nr: str, media_cond: str, sleeve_cond: str) -> float:
    """
    Quick function to get a price estimate programmatically.
    RAISES EXCEPTIONS - NO SILENT FAILURES!
    
    Usage:
        price = quick_price_estimate("MG V-8367", "VG", "VG")
    """
    logger.info(f"Quick price estimate called for {catalog_nr}")
    estimator = DiscogsPriceEstimator(DISCOGS_TOKEN)
    result = estimator.estimate_price(catalog_nr, media_cond, sleeve_cond)
    return result.estimated_price

# ============================================
# TEST FUNCTION TO VERIFY API TOKEN
# ============================================

def test_api_connection() -> bool:
    """
    Test if the Discogs API token is working.
    Returns True if successful, False otherwise.
    """
    logger.info("Testing API connection")
    print("\n🔍 Testing API connection...")
    estimator = DiscogsPriceEstimator(DISCOGS_TOKEN)
    
    try:
        # Try to search for a known release
        release = estimator.search_by_catalog("MG V-8367")
        logger.info("API connection successful")
        print(f"✅ API connection successful!")
        print(f"   Found: {release.get('title')}")
        return True
    except Exception as e:
        logger.error(f"API error: {e}")
        print(f"❌ API error: {e}")
        return False

if __name__ == "__main__":
    # Test API first
    if test_api_connection():
        main()
    else:
        print("\n⚠️  CANNOT CONTINUE - Fix your Discogs API token!")
        print("   Get a new token at: https://www.discogs.com/settings/developers")