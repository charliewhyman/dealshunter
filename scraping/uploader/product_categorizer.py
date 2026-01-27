from typing import Dict, Optional, Tuple, List, Any, Union
from config.product_type_loader import ConfigLoader
from core.logger import uploader_logger

class ProductCategorizer:
    """Service for categorizing products using JSON configuration with enhanced gender detection."""
    
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
    
    def extract_gender_age(self, product_type: str, tags: Union[List[str], str, None] = None) -> str:
        """
        Extract gender/age category from product type and tags.
        Checks both the product type string and any tags for gender indicators.
        """
        if not product_type:
            return self.config.get("default_gender_age", "Unisex")
        
        # Normalize product type
        normalized_type = self._normalize_text(product_type)
        
        # Build combined text to search
        texts_to_search = [normalized_type]
        
        # Add tags if provided
        if tags:
            if isinstance(tags, list):
                for tag in tags:
                    if tag:  # Skip None/empty tags
                        texts_to_search.append(self._normalize_text(str(tag)))
            elif isinstance(tags, str):
                texts_to_search.append(self._normalize_text(tags))
        
        # Also create a combined string for broader matching
        combined_text = " ".join(texts_to_search)
        
        patterns = self.config.get("gender_age_patterns", {})
        
        # Check each pattern
        for category, pattern_list in patterns.items():
            # Check each text individually
            for text in texts_to_search:
                for pattern in pattern_list:
                    if pattern in text:
                        uploader_logger.debug(f"Matched gender '{category}' with pattern '{pattern}' in text: '{text}'")
                        return category
            
            # Also check the combined text
            for pattern in pattern_list:
                if pattern in combined_text:
                    uploader_logger.debug(f"Matched gender '{category}' with pattern '{pattern}' in combined text")
                    return category
        
        # No match found, use default
        default = self.config.get("default_gender_age", "Unisex")
        uploader_logger.debug(f"No gender match found, using default: '{default}'")
        return default
    
    def extract_gender_age_with_unisex_expansion(self, product_type: str, tags: Union[List[str], str, None] = None) -> Tuple[str, List[str]]:
        """
        Extract gender/age category with unisex expansion.
        Returns: (primary_gender, all_gender_categories)
        
        For unisex items, returns ('Unisex', ['Unisex', 'Men', 'Women'])
        For women's items, returns ('Women', ['Women'])
        For men's items, returns ('Men', ['Men'])
        """
        primary_gender = self.extract_gender_age(product_type, tags)
        
        if primary_gender == "Unisex":
            # Unisex items should appear in both Men's and Women's categories
            all_genders = ["Unisex", "Men", "Women"]
        elif primary_gender == "Womens":
            all_genders = ["Womens"]
        elif primary_gender == "Mens":
            all_genders = ["Mens"]
        elif primary_gender in ["Kids", "Baby"]:
            all_genders = [primary_gender]
        else:
            # Fallback for any other category
            all_genders = [primary_gender]
        
        return primary_gender, all_genders
    
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
    
    def get_category_info(self, product_type: str, tags: Union[List[str], str, None] = None) -> Dict[str, Any]:
        """Get complete category information for a product.
        Returns a dictionary where some values may be None.
        
        Args:
            product_type: The product type string
            tags: Optional list of tags or string of tags for gender detection
        """
        top_level, subcategory = self.categorize_product(product_type)
        primary_gender, all_genders = self.extract_gender_age_with_unisex_expansion(product_type, tags)
        
        # Determine grouped product type
        if subcategory:
            grouped_type = subcategory
        else:
            grouped_type = top_level
        
        return {
            'grouped_product_type': grouped_type,
            'top_level_category': top_level,
            'subcategory': subcategory,  # This can be None
            'gender_age': primary_gender,
            'gender_categories': all_genders,
            'is_unisex': primary_gender == "Unisex" or "Unisex" in all_genders
        }
    
    def get_category_info_with_defaults(self, product_type: str, tags: Union[List[str], str, None] = None) -> Dict[str, Any]:
        """Get complete category information with default values instead of None."""
        category_info = self.get_category_info(product_type, tags)
        
        # Replace None with empty string or other defaults
        return {
            'grouped_product_type': category_info['grouped_product_type'] or '',
            'top_level_category': category_info['top_level_category'] or '',
            'subcategory': category_info['subcategory'] or '',  # Convert None to empty string
            'gender_age': category_info['gender_age'] or '',
            'gender_categories': category_info['gender_categories'] or [],
            'is_unisex': category_info.get('is_unisex', False)
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