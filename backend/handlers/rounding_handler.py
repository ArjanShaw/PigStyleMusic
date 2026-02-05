"""Price rounding utilities for PigStyle Records"""
class RoundingHandler:
    """Handles price rounding according to business rules"""
    
    @staticmethod
    def round_to_99(price):
        """Round price to nearest .49 or .99"""
        if not price or price <= 0:
            return 0.0
        
        # Round to nearest .49 or .99
        floor_price = int(price)
        decimal_part = price - floor_price
        
        if decimal_part < 0.25:
            return float(floor_price) + 0.49
        elif decimal_part < 0.75:
            return float(floor_price) + 0.99
        else:
            return float(floor_price + 1) + 0.49
    
    @staticmethod 
    def round_to_nearest(value, nearest=0.5):
        """Round to nearest specified increment"""
        if not value:
            return 0.0
        return round(value / nearest) * nearest
    
    @staticmethod
    def round_to_store_price(price):
        """Apply store-specific rounding rules"""
        if price < 5:
            return round(price, 2)
        elif price < 20:
            return RoundingHandler.round_to_99(price)
        else:
            # For higher prices, round to nearest $0.50
            return RoundingHandler.round_to_nearest(price, 0.5)