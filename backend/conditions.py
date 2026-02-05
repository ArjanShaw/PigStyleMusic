"""
Centralized Discogs condition management
Provides a single source of truth for condition mappings, patterns, and constants
"""

class DiscogsConditions:
    """Discogs condition constants and utilities"""
    
    # Main conditions in order from best to worst
    MINT = "Mint (M)"
    NEAR_MINT = "Near Mint (NM or M-)"
    VERY_GOOD_PLUS = "Very Good Plus (VG+)"
    VERY_GOOD = "Very Good (VG)"
    GOOD_PLUS = "Good Plus (G+)"
    GOOD = "Good (G)"
    FAIR = "Fair (F)"
    POOR = "Poor (P)"
    
    # All conditions list in descending order of quality
    ALL_CONDITIONS = [
        MINT,
        NEAR_MINT, 
        VERY_GOOD_PLUS,
        VERY_GOOD,
        GOOD_PLUS,
        GOOD,
        FAIR,
        POOR
    ]
    
    # Conditions available to consignors (better conditions only)
    CONSIGNOR_CONDITIONS = [
        MINT,
        NEAR_MINT,
        VERY_GOOD_PLUS,
        VERY_GOOD
    ]
    
    # Condition mapping for pattern matching (lowercase for case-insensitive matching)
    CONDITION_PATTERNS = {
        MINT: [r'\bmint\b', r'\bm\b', r'\bstill sealed\b', r'\bsealed\b'],
        NEAR_MINT: [r'\bnear mint\b', r'\bnm\b', r'\bm-\b', r'\bm\s*-\s*'],
        VERY_GOOD_PLUS: [r'\bvery good plus\b', r'\bvg\+\b', r'\bvg\s*\+\s*'],
        VERY_GOOD: [r'\bvery good\b', r'\bvg\b'],
        GOOD_PLUS: [r'\bgood plus\b', r'\bg\+\b', r'\bg\s*\+\s*'],
        GOOD: [r'\bgood\b', r'\bg\b'],
        FAIR: [r'\bfair\b', r'\bf\b'],
        POOR: [r'\bpoor\b', r'\bp\b']
    }
    
    # Condition abbreviations mapping
    CONDITION_ABBREVIATIONS = {
        MINT: ["M", "Mint"],
        NEAR_MINT: ["NM", "M-", "Near Mint"],
        VERY_GOOD_PLUS: ["VG+"],
        VERY_GOOD: ["VG"],
        GOOD_PLUS: ["G+"],
        GOOD: ["G"],
        FAIR: ["F"],
        POOR: ["P"]
    }
    
    # eBay condition IDs mapping
    EBAY_CONDITION_IDS = {
        "1": "3000",  # Used - equivalent to Mint/Near Mint
        "2": "3000",  # Used - equivalent to Very Good Plus
        "3": "3000",  # Used - equivalent to Very Good
        "4": "3000",  # Used - equivalent to Good Plus/Good
        "5": "1000",  # New
    }
    
    @classmethod
    def get_condition_by_abbreviation(cls, abbreviation):
        """Get full condition name by abbreviation"""
        abbreviation = abbreviation.strip().lower()
        for condition, abbrs in cls.CONDITION_ABBREVIATIONS.items():
            for abbr in abbrs:
                if abbr.lower() == abbreviation:
                    return condition
        return None
    
    @classmethod
    def get_available_conditions(cls, user_role):
        """Get available conditions based on user role"""
        if user_role == 'consignor':
            return cls.CONSIGNOR_CONDITIONS
        else:
            return cls.ALL_CONDITIONS
    
    @classmethod
    def detect_condition_from_text(cls, text):
        """Detect Discogs condition from text (title, description, etc.)"""
        if not text:
            return None
        
        text_lower = text.lower()
        
        for condition, patterns in cls.CONDITION_PATTERNS.items():
            for pattern in patterns:
                import re
                if re.search(pattern, text_lower, re.IGNORECASE):
                    return condition
        
        return None
    
    @classmethod
    def get_ebay_condition_id(cls, condition_grade):
        """Get eBay condition ID from condition grade (1-5)"""
        return cls.EBAY_CONDITION_IDS.get(str(condition_grade), "3000")  # Default to Used
    
    @classmethod
    def is_condition_allowed(cls, condition, user_role):
        """Check if a condition is allowed for a user role"""
        if user_role == 'consignor':
            return condition in cls.CONSIGNOR_CONDITIONS
        return condition in cls.ALL_CONDITIONS
    
    @classmethod
    def get_condition_quality_index(cls, condition):
        """Get quality index (0=best, 7=worst) for sorting"""
        try:
            return cls.ALL_CONDITIONS.index(condition)
        except ValueError:
            return len(cls.ALL_CONDITIONS)  # Unknown conditions go last