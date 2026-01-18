from typing import Dict, Optional, Tuple
from config.product_type_loader import ConfigLoader
from core.logger import uploader_logger

class ProductCategorizer:
    """Service for categorizing products using JSON configuration."""
    
    def __init__(self):
        self.config = ConfigLoader.load_product_type_mapping()
        self._cache = {}  # Cache for category lookups
        
        # Log initialization
        category_count = len(self.config.get("category_mapping", {}))
        uploader_logger.info(f"📊 ProductCategorizer initialized with {category_count} categories")
    
    def _normalize_text(self, text: str) -> str:
        """Normalize text for matching."""
        if not text or not isinstance(text, str):
            return ""
        return text.lower().strip()
    
    def extract_gender_age(self, product_type: str) -> str:
        """Extract gender/age category from product type."""
        if not product_type:
            return self.config.get("default_gender_age", "Unisex")
        
        normalized = self._normalize_text(product_type)
        patterns = self.config.get("gender_age_patterns", {})
        
        for category, pattern_list in patterns.items():
            if any(pattern in normalized for pattern in pattern_list):
                return category
        
        return self.config.get("default_gender_age", "Unisex")
    
    def categorize_product(self, product_type: str) -> Tuple[str, Optional[str]]:
        """Categorize product based on keywords.
        Returns: (top_level_category, subcategory)
        """
        # Check cache first
        cache_key = product_type
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        normalized = self._normalize_text(product_type)
        
        if not normalized:
            result = (self.config.get("uncategorized_fallback", "Uncategorized"), None)
            self._cache[cache_key] = result
            return result
        
        category_mapping = self.config.get("category_mapping", {})
        
        for category, rules in category_mapping.items():
            # Check keywords
            keywords = rules.get("keywords", [])
            has_keyword = any(keyword in normalized for keyword in keywords)
            
            if has_keyword:
                # Check excludes
                excludes = rules.get("exclude", [])
                has_exclude = any(exclude in normalized for exclude in excludes)
                
                if not has_exclude:
                    # Extract top-level category
                    if ' - ' in category:
                        top_level, subcategory = category.split(' - ', 1)
                        result = (top_level, category)
                    else:
                        result = (category, None)
                    
                    self._cache[cache_key] = result
                    return result
        
        # No match found
        result = (self.config.get("uncategorized_fallback", "Uncategorized"), None)
        self._cache[cache_key] = result
        return result
    
    def get_category_info(self, product_type: str) -> Dict[str, Optional[str]]:
        """Get complete category information for a product.
        Returns a dictionary where some values may be None.
        """
        top_level, subcategory = self.categorize_product(product_type)
        gender_age = self.extract_gender_age(product_type)
        
        # Determine grouped product type
        if subcategory:
            grouped_type = subcategory
        else:
            grouped_type = top_level
        
        return {
            'grouped_product_type': grouped_type,
            'top_level_category': top_level,
            'subcategory': subcategory,  # This can be None
            'gender_age': gender_age
        }
    
    def get_category_info_with_defaults(self, product_type: str) -> Dict[str, str]:
        """Get complete category information with default values instead of None."""
        category_info = self.get_category_info(product_type)
        
        # Replace None with empty string or other defaults
        return {
            'grouped_product_type': category_info['grouped_product_type'] or '',
            'top_level_category': category_info['top_level_category'] or '',
            'subcategory': category_info['subcategory'] or '',  # Convert None to empty string
            'gender_age': category_info['gender_age'] or ''
        }
    
    def clear_cache(self):
        """Clear the categorization cache."""
        self._cache.clear()
        uploader_logger.debug("🧹 Cleared product categorization cache")
    
    def reload_config(self):
        """Reload configuration from file."""
        self.config = ConfigLoader.load_product_type_mapping()
        self.clear_cache()
        category_count = len(self.config.get("category_mapping", {}))
        uploader_logger.info(f"🔄 Reloaded product type mapping with {category_count} categories")