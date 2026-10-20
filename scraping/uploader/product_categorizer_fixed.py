from typing import Dict, Optional, Tuple, List, Any, Union
import re
from config.product_type_loader import ConfigLoader
from core.logger import uploader_logger


class ProductCategorizer:
    """Service for categorizing products using JSON configuration with enhanced gender detection."""

    def __init__(self):
        self.config = ConfigLoader.load_product_type_mapping()
        
        # Validate config structure
        if not self.config or not self.config.get("category_mapping"):
            uploader_logger.error("Invalid product type mapping config, using fallback")
            self.config = {"category_mapping": {}, "default_gender_age": "Unisex", "default_category": "Uncategorized", "uncategorized_fallback": "Uncategorized", "gender_age_patterns": {}}
        
        self._cache = {}  # Cache for category lookups
        self._prepare_keywords()

        # Log initialization
        category_count = len(self.config.get("category_mapping", {}))
        uploader_logger.info(
            f"📊 ProductCategorizer initialized with {category_count} categories"
        )

    def _prepare_keywords(self):
        """Preprocess keywords for better matching."""
        self._keyword_patterns = {}
        category_mapping = self.config.get("category_mapping", {})

        for category, rules in category_mapping.items():
            # Create regex patterns for each keyword
            patterns = []
            for keyword in rules.get("keywords", []):
                # Escape special characters and create word boundary pattern
                pattern = r"\b" + re.escape(keyword) + r"\b"
                patterns.append(pattern)

            # Create exclude patterns
            exclude_patterns = []
            for exclude in rules.get("exclude", []):
                pattern = r"\b" + re.escape(exclude) + r"\b"
                exclude_patterns.append(pattern)

            self._keyword_patterns[category] = {
                "include": patterns,
                "exclude": exclude_patterns,
                "raw_keywords": rules.get("keywords", []),
                "raw_excludes": rules.get("exclude", []),
            }

    def _normalize_text(self, text: str) -> str:
        """Normalize text for matching."""
        if not text or not isinstance(text, str):
            return ""
        return text.lower().strip()

    def _calculate_match_score(
        self, text: str, patterns: List[str], keywords: List[str]
    ) -> int:
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
            elif re.search(r"\b" + re.escape(keyword) + r"\b", text):
                score += 10
            # Simple contains (lowest score)
            elif keyword in text:
                score += 5

        return score

    def extract_gender_age(
        self, product_type: str, tags: Union[List[str], str, None] = None
    ) -> str:
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
                    if re.search(r"\b" + re.escape(pattern) + r"\b", text):
                        score += 10
                    elif pattern in text:
                        score += 5

            # Check combined text
            for pattern in pattern_list:
                if re.search(r"\b" + re.escape(pattern) + r"\b", combined_text):
                    score += 5
                elif pattern in combined_text:
                    score += 2

            if score > 0:
                gender_scores[category] = score

        # Pick best match
        if gender_scores:
            best_gender = max(gender_scores.items(), key=lambda x: x[1])[0]
            uploader_logger.debug(
                f"Matched gender '{best_gender}' with score {gender_scores[best_gender]}"
            )
            return best_gender

        # No match found, use default
        default = self.config.get("default_gender_age", "Unisex")
        uploader_logger.debug(f"No gender match found, using default: '{default}'")
        return default

    def extract_gender_age_with_unisex_expansion(
        self, product_type: str, tags: Union[List[str], str, None] = None
    ) -> Tuple[str, List[str]]:
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
                normalized, patterns["include"], patterns["raw_keywords"]
            )

            # Check for excludes (case-insensitive)
            exclude_score = 0
            for exclude_pattern in patterns["exclude"]:
                if re.search(exclude_pattern, normalized, re.IGNORECASE):
                    exclude_score += 20  # Heavy penalty for excluded terms
                    break

            for exclude in patterns["raw_excludes"]:
                if exclude.lower() in normalized:
                    exclude_score += 10
                    break

            # Final score
            final_score = match_score - exclude_score

            if final_score > 0:
                # Add specificity bonus (more specific categories get higher score)
                specificity = len(category.split(" - "))  # More dashes = more specific
                final_score += specificity * 5

                matches.append((final_score, category))

        # Sort by score (highest first)
        matches.sort(key=lambda x: x[0], reverse=True)

        if matches:
            best_score, best_category = matches[0]

            # Log the match for debugging
            uploader_logger.debug(
                f"Categorized '{product_type}' as '{best_category}' (score: {best_score})"
            )

            # Extract top-level category
            if " - " in best_category