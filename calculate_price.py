import requests
import json
import time
from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple
from enum import Enum

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
        return condition_map.get(condition_str.lower().strip(), cls.VERY_GOOD_PLUS)

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
    
    # Weighted average: media matters more than sleeve
    combined_multiplier = (media_mult * 0.7) + (sleeve_mult * 0.3)
    
    return round(combined_multiplier, 3)

# ============================================
# DEMAND CALCULATION
# ============================================

def calculate_demand_adjustment(wants: int, haves: int) -> Tuple[float, float]:
    """
    Calculate demand adjustment and want/have ratio.
    Returns (adjustment_factor, ratio)
    """
    if haves == 0:
        return 1.0, 0.0
    
    ratio = wants / haves if haves > 0 else 0
    
    # Demand-based pricing adjustments
    if ratio >= 2.0:  # Very high demand (2+ wants per have)
        adjustment = 1.25
    elif ratio >= 1.5:
        adjustment = 1.15
    elif ratio >= 1.0:
        adjustment = 1.05
    elif ratio >= 0.5:
        adjustment = 1.00
    elif ratio >= 0.2:
        adjustment = 0.95
    else:  # Low demand
        adjustment = 0.85
        
    return adjustment, ratio

# ============================================
# CONFIDENCE SCORE
# ============================================

def calculate_confidence(num_sales: int, want_have_ratio: float) -> float:
    """
    Calculate confidence score (0-100) based on data availability.
    """
    # More sales = higher confidence
    sales_confidence = min(num_sales / 30.0, 1.0) * 70
    
    # Extreme ratios indicate potential instability
    if 0.5 <= want_have_ratio <= 2.0:
        ratio_confidence = 30
    elif 0.2 <= want_have_ratio <= 5.0:
        ratio_confidence = 15
    else:
        ratio_confidence = 5
        
    return min(sales_confidence + ratio_confidence, 100)

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
        self.user_token = user_token
        self.base_url = "https://api.discogs.com"
        self.headers = {
            'User-Agent': 'RecordPriceEstimator/1.0',
            'Authorization': f'Discogs token={user_token}'
        }
        
    def search_by_catalog(self, catalog_number: str) -> Optional[Dict]:
        """
        Search for a release by catalog number.
        Returns the first matching release.
        """
        search_url = f"{self.base_url}/database/search"
        params = {
            'q': catalog_number,
            'type': 'release',
            'per_page': 5
        }
        
        try:
            response = requests.get(search_url, headers=self.headers, params=params)
            response.raise_for_status()
            data = response.json()
            
            if data.get('results'):
                # Find exact catalog match
                for result in data['results']:
                    if catalog_number.lower() in [cat.lower() for cat in result.get('catno', '').split(',')]:
                        return result
                # Return first result if no exact match
                return data['results'][0]
                
        except requests.exceptions.RequestException as e:
            print(f"Error searching for catalog {catalog_number}: {e}")
            
        return None
    
    def get_release_stats(self, release_id: int) -> Optional[Dict]:
        """
        Get community stats and market data for a release.
        """
        stats_url = f"{self.base_url}/releases/{release_id}/stats"
        
        try:
            response = requests.get(stats_url, headers=self.headers)
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"Error fetching stats for release {release_id}: {e}")
            
        return None
    
    def get_marketplace_stats(self, release_id: int) -> Optional[Dict]:
        """
        Get marketplace statistics including price history.
        """
        marketplace_url = f"{self.base_url}/marketplace/stats/{release_id}"
        
        try:
            response = requests.get(marketplace_url, headers=self.headers)
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"Error fetching marketplace stats: {e}")
            return None
    
    def estimate_price(self, 
                      catalog_number: str,
                      media_condition: str,
                      sleeve_condition: str,
                      fallback_price: float = 20.0) -> Optional[PriceEstimate]:
        """
        Main method to estimate price for a record.
        
        Args:
            catalog_number: The record's catalog number
            media_condition: Media condition (e.g., "NM", "VG+")
            sleeve_condition: Sleeve condition
            fallback_price: Default price when no data available
            
        Returns:
            PriceEstimate object or None if error
        """
        
        # Step 1: Find the release
        release = self.search_by_catalog(catalog_number)
        if not release:
            print(f"Release not found for catalog number: {catalog_number}")
            return None
            
        release_id = release['id']
        title = release.get('title', 'Unknown')
        
        print(f"Found release: {title} (ID: {release_id})")
        
        # Step 2: Get community stats
        stats = self.get_release_stats(release_id)
        
        # Step 3: Parse conditions
        media_cond = Condition.from_string(media_condition)
        sleeve_cond = Condition.from_string(sleeve_condition)
        
        print(f"Media condition: {media_cond.value}, Sleeve condition: {sleeve_cond.value}")
        
        # Step 4: Get base price (from marketplace if available, otherwise estimate from stats)
        marketplace = self.get_marketplace_stats(release_id)
        base_median_price = fallback_price
        num_sales = 0
        
        if marketplace and 'median' in marketplace:
            base_median_price = marketplace['median']
            num_sales = marketplace.get('num_sales', 0)
            print(f"Marketplace median price: ${base_median_price}")
        elif stats:
            # Fallback: use community sentiment to estimate
            community_rating = stats.get('community', {}).get('rating', {}).get('average', 3.5)
            base_median_price = fallback_price * (community_rating / 3.0)
            print(f"Estimated base price from community rating: ${base_median_price}")
            num_sales = 0
        else:
            print(f"No market data available, using fallback price: ${fallback_price}")
            num_sales = 0
        
        # Step 5: Calculate condition multiplier
        condition_mult = get_condition_multiplier(media_cond, sleeve_cond)
        print(f"Condition multiplier: {condition_mult}")
        
        # Step 6: Calculate demand adjustment
        wants = stats.get('community', {}).get('want', 0) if stats else 0
        haves = stats.get('community', {}).get('have', 0) if stats else 0
        demand_adjust, want_have_ratio = calculate_demand_adjustment(wants, haves)
        print(f"Demand adjustment: {demand_adjust} (Want/Have ratio: {want_have_ratio:.2f})")
        
        # Step 7: Calculate final price
        estimated_price = base_median_price * condition_mult * demand_adjust
        print(f"Estimated price before rounding: ${estimated_price:.2f}")
        
        # Step 8: Apply price range based on condition confidence
        condition_variance = 1.0 - (condition_mult / 1.35)  # 0 for mint, higher for poor
        price_range_low = estimated_price * (0.85 - (condition_variance * 0.15))
        price_range_high = estimated_price * (1.15 + (condition_variance * 0.15))
        
        # Step 9: Calculate confidence score
        confidence = calculate_confidence(num_sales, want_have_ratio)
        
        # Step 10: Return result
        return PriceEstimate(
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

# ============================================
# MAIN FUNCTION
# ============================================

# INSERT YOUR ACTUAL DISCOGS TOKEN HERE
DISCOGS_TOKEN = "HylxGPoAuRgKwLfzbybZRyTxvxqXbrYJUhsZAkZq"  # Your token

def main():
    # Initialize estimator with your token
    estimator = DiscogsPriceEstimator(DISCOGS_TOKEN)
    
    print("\n" + "="*60)
    print("🎵 RECORD PRICE ESTIMATOR")
    print("="*60)
    
    # Get user input
    catalog = input("\nEnter catalog number: ").strip()
    media_cond = input("Enter media condition (Mint, NM, VG+, VG, G, F, P): ").strip()
    sleeve_cond = input("Enter sleeve condition (Mint, NM, VG+, VG, G, F, P): ").strip()
    
    # Get estimate
    estimate = estimator.estimate_price(
        catalog_number=catalog,
        media_condition=media_cond,
        sleeve_condition=sleeve_cond,
        fallback_price=20.0
    )
    
    if estimate:
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
    else:
        print("\n❌ Could not estimate price. Please check the catalog number.")

# ============================================
# QUICK FUNCTION FOR PROGRAMMATIC USE
# ============================================

def quick_price_estimate(catalog_nr: str, media_cond: str, sleeve_cond: str) -> Optional[float]:
    """
    Quick function to get a price estimate programmatically.
    
    Usage:
        price = quick_price_estimate("MG V-8367", "VG", "VG")
    """
    estimator = DiscogsPriceEstimator(DISCOGS_TOKEN)
    result = estimator.estimate_price(catalog_nr, media_cond, sleeve_cond)
    return result.estimated_price if result else None



if __name__ == "__main__":
    main()