from typing import Dict, Optional, Tuple, List, Any, Union
import re
from config.product_type_loader import ConfigLoader
from core.logger import uploader_logger

class ProductCategorizer:
    """Service for categorizing products using JSON configuration with enhanced gender detection."""
    
    def __init__(self):
        self.config = ConfigLoader.load_product_type_mapping()
        self._cache = {}  # Cache for category lookups
        self._prepare_keywords()
        
        # Log initialization
        category_count = len(self.config.get("category_mapping", {}))
        uploader_logger.info(f"📊 ProductCategorizer initialized with {category_count} categories")
    
    def _prepare_keywords(self):
        """Preprocess keywords for better matching."""
        self._keyword_patterns = {}
        category_mapping = self.config.get("category_mapping", {})
        
        for category, rules in category_mapping.items():
            # Create regex patterns for each keyword
            patterns = []
            for keyword in rules.get("keywords", []):
                # Escape special characters and create word boundary pattern
                pattern = r'\b' + re.escape(keyword) + r'\b'
                patterns.append(pattern)
            
            # Create exclude patterns
            exclude_patterns = []
            for exclude in rules.get("exclude", []):
                pattern = r'\b' + re.escape(exclude) + r'\b'
                exclude_patterns.append(pattern)
            
            self._keyword_patterns[category] = {
                'include': patterns,
                'exclude': exclude_patterns,
                'raw_keywords': rules.get("keywords", []),
                'raw_excludes': rules.get("exclude", [])
            }
    
    def _normalize_text(self, text: str) -> str:
        """Normalize text for matching."""
        if not text or not isinstance(text, str):
            return ""
        return text.lower().strip()
    
    def _calculate_match_score(self, text: str, patterns: List[str], keywords: List[str]) -> int:
        """Calculate a match score based on keyword presence and specificity."""
        score = 0
        
        # Check each pattern
        for pattern in patterns:
            if re.search(pattern, text):
                score += 10
        
        # Additional scoring based on exact matches and specificity
        for keyword in keywords:
            # Exact match gets highest score
            if f" {keyword} " in f" {text} ":
                score += 15
            # Contains with word boundaries
            elif re.search(r'\b' + re.escape(keyword) + r'\b', text):
                score += 10
            # Simple contains (lowest score)
            elif keyword in text:
                score += 5
        
        return score
    
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
        
        # Track matches with scores
        gender_scores = {}
        
        for category, pattern_list in patterns.items():
            score = 0
            
            # Check each text individually
            for text in texts_to_search:
                for pattern in pattern_list:
                    if re.search(r'\b' + re.escape(pattern) + r'\b', text):
                        score += 10
                    elif pattern in text:
                        score += 5
            
            # Check combined text
            for pattern in pattern_list:
                if re.search(r'\b' + re.escape(pattern) + r'\b', combined_text):
                    score += 5
                elif pattern in combined_text:
                    score += 2
            
            if score > 0:
                gender_scores[category] = score
        
        # Pick best match
        if gender_scores:
            best_gender = max(gender_scores.items(), key=lambda x: x[1])[0]
            uploader_logger.debug(f"Matched gender '{best_gender}' with score {gender_scores[best_gender]}")
            return best_gender
        
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
        elif primary_gender == "Women":
            all_genders = ["Women"]
        elif primary_gender == "Men":
            all_genders = ["Men"]
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
            uploader_logger.debug(f"No product type provided, using fallback: {result}")
            return result
        
        # Track all matches with scores
        matches = []
        
        for category, patterns in self._keyword_patterns.items():
            # Calculate match score
            match_score = self._calculate_match_score(
                normalized, 
                patterns['include'], 
                patterns['raw_keywords']
            )
            
            # Check for excludes
            exclude_score = 0
            for exclude_pattern in patterns['exclude']:
                if re.search(exclude_pattern, normalized):
                    exclude_score += 20  # Heavy penalty for excluded terms
                    break
            
            for exclude in patterns['raw_excludes']:
                if exclude in normalized:
                    exclude_score += 10
                    break
            
            # Final score
            final_score = match_score - exclude_score
            
            if final_score > 0:
                # Add specificity bonus (more specific categories get higher score)
                specificity = len(category.split(' - '))  # More dashes = more specific
                final_score += specificity * 5
                
                matches.append((final_score, category))
        
        # Sort by score (highest first)
        matches.sort(key=lambda x: x[0], reverse=True)
        
        if matches:
            best_score, best_category = matches[0]
            
            # Log the match for debugging
            uploader_logger.debug(f"Categorized '{product_type}' as '{best_category}' (score: {best_score})")
            
            # Extract top-level category
            if ' - ' in best_category:
                top_level, subcategory = best_category.split(' - ', 1)
                result = (top_level, best_category)
            else:
                result = (best_category, None)
            
            self._cache[cache_key] = result
            return result
        
        # No match found
        result = (self.config.get("uncategorized_fallback", "Uncategorized"), None)
        self._cache[cache_key] = result
        uploader_logger.debug(f"No category match found for '{product_type}', using fallback: {result}")
        return result
    
    def categorize_product_with_context(self, 
                                      product_type: str,
                                      title: Optional[str] = None,
                                      description: Optional[str] = None,
                                      vendor: Optional[str] = None) -> Tuple[str, Optional[str]]:
        """
        Enhanced categorization using multiple data sources.
        Falls back to product_type only if no better match found.
        """
        # Create search text from all available sources
        search_parts = []
        
        # Priority weights for different sources
        weights = {
            'product_type': 1.5,
            'title': 1.2,
            'description': 0.8,
            'vendor': 0.5
        }
        
        sources = [
            (product_type, 'product_type'),
            (title, 'title'),
            (description, 'description'),
            (vendor, 'vendor')
        ]
        
        all_matches = {}
        
        for text, source_name in sources:
            if not text:
                continue
                
            normalized = self._normalize_text(text)
            
            # Find matches in this text
            for category, patterns in self._keyword_patterns.items():
                match_score = self._calculate_match_score(
                    normalized,
                    patterns['include'],
                    patterns['raw_keywords']
                )
                
                # Apply source weight
                weighted_score = match_score * weights[source_name]
                
                # Check excludes
                exclude_penalty = 0
                for exclude in patterns['raw_excludes']:
                    if exclude in normalized:
                        exclude_penalty = 30  # Heavy penalty
                        break
                
                final_score = weighted_score - exclude_penalty
                
                if final_score > 0:
                    # Add to aggregate scores
                    if category not in all_matches:
                        all_matches[category] = 0
                    all_matches[category] += final_score
        
        if all_matches:
            # Pick best category
            best_category = max(all_matches.items(), key=lambda x: x[1])[0]
            best_score = all_matches[best_category]
            
            uploader_logger.debug(f"Categorized with context: '{best_category}' (score: {best_score})")
            
            if ' - ' in best_category:
                top_level, subcategory = best_category.split(' - ', 1)
                return (top_level, best_category)
            else:
                return (best_category, None)
        
        # Fall back to product_type only
        return self.categorize_product(product_type)
    
    def get_category_info(self, 
                         product_type: str, 
                         tags: Union[List[str], str, None] = None,
                         title: Optional[str] = None,
                         description: Optional[str] = None,
                         vendor: Optional[str] = None) -> Dict[str, Any]:
        """Get complete category information for a product.
        Returns a dictionary where some values may be None.
        
        Args:
            product_type: The product type string
            tags: Optional list of tags or string of tags for gender detection
            title: Optional product title for better categorization
            description: Optional description for better categorization
            vendor: Optional vendor/brand for better categorization
        """
        # Use enhanced categorization if additional context is provided
        if title or description or vendor:
            top_level, subcategory = self.categorize_product_with_context(
                product_type, title, description, vendor
            )
        else:
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
    
    def get_category_info_with_defaults(self, 
                                       product_type: str, 
                                       tags: Union[List[str], str, None] = None,
                                       title: Optional[str] = None,
                                       description: Optional[str] = None,
                                       vendor: Optional[str] = None) -> Dict[str, Any]:
        """Get complete category information with default values instead of None."""
        category_info = self.get_category_info(
            product_type, tags, title, description, vendor
        )
        
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
        self._prepare_keywords()  # Re-prepare keywords
        self.clear_cache()
        category_count = len(self.config.get("category_mapping", {}))
        uploader_logger.info(f"🔄 Reloaded product type mapping with {category_count} categories")
    
    def get_category_hierarchy(self, product_type: str) -> Dict[str, Any]:
        """
        Returns structured hierarchy for UI filters.
        Useful for building breadcrumbs and multi-level filtering.
        """
        top_level, subcategory = self.categorize_product(product_type)
        
        hierarchy = {
            'level_1': top_level,
            'level_2': None,
            'level_3': None,
            'breadcrumb': [top_level],
            'filter_path': top_level.lower().replace(' ', '-')
        }
        
        if subcategory:
            parts = subcategory.split(' - ')
            for i, part in enumerate(parts[1:], 1):  # Skip level_1 (already in parts[0])
                hierarchy[f'level_{i+1}'] = part
                hierarchy['breadcrumb'].append(part)
            
            # Update filter path
            hierarchy['filter_path'] = '/'.join(
                p.lower().replace(' ', '-') 
                for p in parts
            )
        
        return hierarchy