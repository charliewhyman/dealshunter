from typing import Dict, Optional, Tuple, List, Any, Union
import re
from config.product_type_loader import ConfigLoader
from core.logger import uploader_logger


class ProductCategorizer:
    """Service for categorizing products using JSON configuration with enhanced gender detection and metadata extraction."""
    """Service for categorizing products using JSON configuration with enhanced gender detection."""

    def __init__(self):
        self.config = ConfigLoader.load_product_type_mapping()
        
        # Validate config structure
        if not self.config or not self.config.get("category_mapping"):
            uploader_logger.error("Invalid product type mapping config, using fallback")
            self.config = {
                "category_mapping": {},
                "default_gender_age": "Unisex",
                "default_category": "Uncategorized",
                "uncategorized_fallback": "Uncategorized",
                "gender_age_patterns": {},
            }
        
        self._cache = {}  # Cache for category lookups
        self._prepare_keywords()
        self._init_size_patterns()

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

    def _init_size_patterns(self):
        """Initialize size pattern matching."""
        self._size_patterns = {
            "XS": r"\bxs\b|\bextra small\b",
            "XSS": r"\bxsmall\b|\bxs\b",
            "S": r"\bs\b|\bsmall\b",
            "SXL": r"\bsmall xl\b",
            "M": r"\bm\b|\bmedium\b",
            "MXXL": r"\bmedium xl\b|\bmedium xxl\b",
            "L": r"\bl\b|\blarge\b",
            "LXL": r"\blarge xl\b|\blarge xxl\b",
            "XL": r"\b\b|\bextra large\b|\bxl\b",
            "XXL": r"\b\b|\b2xl\b|\bextra extra large\b|\bxtra large\b",
            "3XL": r"\b3xl\b|\b3x large\b",
            "4XL": r"\b4xl\b|\b4x large\b",
            "5XL": r"\b5xl\b|\b5x large\b",
            "6XL": r"\b6xl\b|\b6x large\b",
            "7XL": r"\b7xl\b|\b7x large\b",
            "8XL": r"\b8xl\b|\b8x large\b",
            "9XL": r"\b9xl\b|\b9x large\b",
            "10XL": r"\b10xl\b|\b10x large\b",
            "11XL": r"\b11xl\b|\b11x large\b",
            "12XL": r"\b12xl\b|\b12x large\b",
        }
        self._size_keywords = {
            "XS": ["xs", "extra small", "xsmall"],
            "S": ["s", "small"],
            "M": ["m", "medium", "med"],
            "L": ["l", "large"],
            "XL": ["xl", "extra large", "xtra large"],
            "XXL": ["xxl", "2xl", "double xl"],
            "3XL": ["3xl"],
            "4XL": ["4xl"],
            "5XL": ["5xl"],
            "6XL": ["6xl"],
            "7XL": ["7xl"],
            "8XL": ["8xl"],
            "9XL": ["9xl"],
            "10XL": ["10xl"],
            "11XL": ["11xl"],
            "12XL": ["12xl"],
        }

    def _normalize_text(self, text: str) -> str:
        """Normalize text for matching."""
        if not text or not isinstance(text, str):
            return ""
        return text.lower().strip()

    def _extract_metadata_from_text(self, text: str) -> Dict[str, Any]:
        """Extract all metadata from text."""
        metadata = {
            "size": None,
            "color": None,
            "pattern": None,
            "material": None,
            "fit": None,
            "sleeve_length": None,
            "neckline": None,
            "waist": None,
            "length": None,
            "closure": None,
            "style": None,
            "occasion": None,
            "season": None,
            "temperature": None,
            "care_instructions": None,
        }

        if not text:
            return metadata

        text_lower = text.lower()

        # Extract size
        for size, pattern in self._size_patterns.items():
            if re.search(pattern, text_lower):
                metadata["size"] = size
                break

        # Extract colors (with color intensity)
        color_intensity_keywords = {
            "pale": 1,
            "light": 2,
            "medium": 3,
            "deep": 4,
            "rich": 5,
            "bright": 6,
            "vivid": 7,
            "bold": 8,
            "dark": 9,
        }

        colors = []
        color_keywords = [
            "red", "blue", "green", "yellow", "orange", "purple", "pink", "black",
            "white", "gray", "grey", "brown", "beige", "tan", "cream", "ivory",
            "navy", "teal", "turquoise", "cyan", "mint", "lime", "olive", "khaki",
            "burgundy", "maroon", "wine", "plum", "lavender", "peach", "coral",
            "amber", "gold", "silver", "bronze", "copper", "rose", "blush",
            "scarlet", "crimson", "fuchsia", "magenta", "indigo", "violet",
            "azure", "cobalt", "cerulean", "sapphire", "emerald", "jade",
            "ruby", "cherry", "chocolate", "chestnut", "cinnamon", "russet",
            "umber", "sienna", "burnt orange", "candy", "pastel", "neon",
            "pastel pink", "pastel blue", "pastel green", "pastel yellow",
            "pastel purple", "pastel orange", "pastel red", "pastel teal",
            "pastel mint", "pastel lavender", "pastel peach", "pastel coral",
            "pastel lilac", "pastel mint green", "pastel sky blue",
            "pastel seafoam", "pastel periwinkle", "pastel salmon",
            "pastel apricot", "pastel tangerine", "pastel lemon",
            "pastel lime", "pastel olive", "pastel mustard",
        ]

        for color in color_keywords:
            if color in text_lower:
                colors.append(color)

        if colors:
            # Apply intensity modifier if present
            if "pale" in text_lower:
                colors = [c for c in colors if "pale" in c.lower() or "light" in c.lower()]
            elif "light" in text_lower:
                colors = [c for c in colors if "light" in c.lower() or "pale" in c.lower()]
            elif "medium" in text_lower:
                colors = [c for c in colors if "medium" in c.lower()]
            elif "dark" in text_lower or "deep" in text_lower:
                colors = [c for c in colors if "dark" in c.lower() or "deep" in c.lower() or "rich" in c.lower()]
            elif "bright" in text_lower or "vivid" in text_lower:
                colors = [c for c in colors if "bright" in c.lower() or "vivid" in c.lower() or "bold" in c.lower()]

            # If no color matches intensity, keep original
            if not colors:
                colors = color_keywords

            metadata["color"] = ", ".join(colors[:3])  # Limit to top 3

        # Extract pattern
        pattern_keywords = [
            "striped", "plaid", "floral", "florals", "floral print",
            "geometric", "geometric print", "dot", "dots", "polka dot",
            "polka dots", "checkered", "check", "checked", "gingham",
            "herringbone", "tweed", "jacquard", "ikat", "ombre",
            "tie dye", "graphic", "graphic print", "abstract", "abstract print",
            "animal print", "animal prints", "zebra", "tiger", "leopard",
            "leopard print", "leopard print", "cheetah", "paw print",
            "houndstooth", "paisley", "mandala", "mandala print",
            "mandalas", "mandala prints", "camo", "camo print", "camouflage",
            "camouflage print", "camo pattern", "camouflage pattern",
            "lattice", "lattice print", "lattice pattern",
            "cable knit", "cable knit pattern",
            "argyle", "argyle pattern",
        ]

        for pattern in pattern_keywords:
            if pattern in text_lower:
                metadata["pattern"] = pattern
                break

        # Extract material
        material_keywords = [
            "cotton", "polyester", "linen", "silk", "wool", "rayon",
            "spandex", "nylon", "viscose", "acrylic", "modal",
            "bamboo", "bamboo rayon", "tencel", "lyocell", "jersey",
            "terry", "terry cloth", "ribbed", "sateen", "satin",
            "chiffon", "voile", "organza", "taffeta", "tulle",
            "lace", "mesh", "netting", "sequin", "sequins",
            "velvet", "velveteen", "corduroy", "denim", "jeans",
            "leather", "faux leather", "synthetic leather", "pleather",
            "vinyl", "rubber", "latex", "neoprene", "canvas",
            "suede", "faux suede", "microfiber", "fleece", "thermal",
            "brushed cotton", "brushed cotton fleece",
            "heavyweight", "lightweight", "breathable", "quick-dry",
            "water-resistant", "waterproof", "wind-resistant", "moisture-wicking",
            "stretch", "four-way stretch", "two-way stretch",
        ]

        for material in material_keywords:
            if material in text_lower:
                metadata["material"] = material
                break

        # Extract fit
        fit_keywords = {
            "relaxed": "Relaxed",
            "loose": "Loose",
            "tight": "Tight",
            "snug": "Snug",
            "fitted": "Fitted",
            "slim": "Slim",
            "skinny": "Skinny",
            "oversized": "Oversized",
            "boxy": "Boxy",
            "drop shoulder": "Drop Shoulder",
            "regular": "Regular",
            "straight": "Straight",
            "curvy": "Curvy",
            "maternity": "Maternity",
            "plus size": "Plus Size",
            "petite": "Petite",
            "tall": "Tall",
            "athletic": "Athletic",
            "athletic fit": "Athletic",
        }

        for fit_keyword in fit_keywords:
            if fit_keyword in text_lower:
                metadata["fit"] = fit_keywords[fit_keyword]
                break

        # Extract sleeve length
        sleeve_keywords = {
            "sleeveless": "Sleeveless",
            "short sleeve": "Short Sleeve",
            "short sleeves": "Short Sleeve",
            "long sleeve": "Long Sleeve",
            "long sleeves": "Long Sleeve",\n            "3/4 sleeve": "3/4 Sleeve",
            "3/4 sleeves": "3/4 Sleeve",
            "cap sleeve": "Cap Sleeve",
            "cap sleeves": "Cap Sleeve",
            "off shoulder": "Off Shoulder",
            "cold shoulder": "Cold Shoulder",
            "cold shoulders": "Cold Shoulder",
            "bell sleeve": "Bell Sleeve",
            "bell sleeves": "Bell Sleeve",
            "puff sleeve": "Puff Sleeve",
            "puff sleeves": "Puff Sleeve",
            "bishop sleeve": "Bishop Sleeve",
            "bishop sleeves": "Bishop Sleeve",
            "balloon sleeve": "Balloon Sleeve",
            "balloon sleeves": "Balloon Sleeve",
            "ruffle sleeve": "Ruffle Sleeve",
            "ruffle sleeves": "Ruffle Sleeve",
            "flutter sleeve": "Flutter Sleeve",
            "flutter sleeves": "Flutter Sleeve",
            "leg-of-mutton sleeve": "Leg-of-Mutton Sleeve",
            "leg-of-mutton sleeves": "Leg-of-Mutton Sleeve",
            "bishop sleeve": "Bishop Sleeve",
            "bishop sleeves": "Bishop Sleeve",
        }

        for sleeve_keyword in sleeve_keywords:
            if sleeve_keyword in text_lower:
                metadata["sleeve_length"] = sleeve_keywords[sleeve_keyword]
                break

        # Extract neckline
        neckline_keywords = {
            "v-neck": "V-Neck",
            "v-neckline": "V-Neck",
            "v neck": "V-Neck",
            "v neck line": "V-Neck",
            "v neck line": "V-Neck",
            "crew neck": "Crew Neck",
            "crew neckline": "Crew Neck",
            "crew neck line": "Crew Neck",
            "round neck": "Round Neck",
            "round neckline": "Round Neck",
            "round neck line": "Round Neck",
            "boat neck": "Boat Neck",
            "boat neckline": "Boat Neck",
            "boat neck line": "Boat Neck",
            "scoop neck": "Scoop Neck",
            "scoop neckline": "Scoop Neck",
            "scoop neck line": "Scoop Neck",
            "off shoulder": "Off Shoulder",
            "off shoulder neckline": "Off Shoulder",
            "off shoulder neck line": "Off Shoulder",
            "squared neck": "Squared Neck",
            "squared neckline": "Squared Neck",
            "squared neck line": "Squared Neck",
            "halter neck": "Halter Neck",
            "halter neckline": "Halter Neck",
            "halter neck line": "Halter Neck",
            "off the shoulder": "Off Shoulder",
            "off the shoulder neckline": "Off Shoulder",
            "off the shoulder neck line": "Off Shoulder",
            "strapless": "Strapless",
            "strapless neckline": "Strapless",
            "strapless neck line": "Strapless",
            "scoop back": "Scoop Back",
            "scoop back neckline": "Scoop Back",
            "scoop back neck line": "Scoop Back",
            "square back": "Square Back",
            "square back neckline": "Square Back",
            "square back neck line": "Square Back",
            "racerback": "Racerback",
            "racer back": "Racerback",
            "racer back neckline": "Racerback",
            "racer back neck line": "Racerback",
            "junge back": "Junge Back",
            "junge back neckline": "Junge Back",
            "junge back neck line": "Junge Back",
            "deep v": "Deep V",
            "deep v-neck": "Deep V",
            "deep v neck": "Deep V",
            "deep v neckline": "Deep V",
            "deep v neck line": "Deep V",
            "plunge": "Plunge",
            "plunge neckline": "Plunge",
            "plunge neck line": "Plunge",
            "high neck": "High Neck",
            "high neck line": "High Neck",
            "mock neck": "Mock Neck",
            "mock neck line": "Mock Neck",
            "turtleneck": "Turtleneck",
            "turtle neck": "Turtleneck",
            "turtle neck line": "Turtleneck",
            "turnover neck": "Turnover Neck",
            "turnover neck line": "Turnover Neck",
            "mandarin collar": "Mandarin Collar",
            "mandarin collar neckline": "Mandarin Collar",
            "mandarin collar neck line": "Mandarin Collar",
            "collared": "Collared",
            "collar": "Collared",
            "collar neckline": "Collared",
            "collar neck line": "Collared",
            "shawl collar": "Shawl Collar",
            "shawl collar neckline": "Shawl Collar",
            "shawl collar neck line": "Shawl Collar",
            "wrap neck": "Wrap Neck",
            "wrap neck line": "Wrap Neck",
            "cowl neck": "Cowl Neck",
            "cowl neckline": "Cowl Neck",
            "cowl neck line": "Cowl Neck",
            "keyhole neck": "Keyhole Neck",
            "keyhole neckline": "Keyhole Neck",
            "keyhole neck line": "Keyhole Neck",
        }

        for neckline_keyword in neckline_keywords:
            if neckline_keyword in text_lower:
                metadata["neckline"] = neckline_keywords[neckline_keyword]
                break

        # Extract waist
        waist_keywords = {
            "high waist": "High Waist",
            "high waistline": "High Waist",
            "high waist line": "High Waist",
            "mid rise": "Mid Rise",
            "mid rise waist": "Mid Rise",
            "mid rise waistline": "Mid Rise",
            "mid rise waist line": "Mid Rise",
            "low rise": "Low Rise",
            "low rise waist": "Low Rise",
            "low rise waistline": "Low Rise",
            "low rise waist line": "Low Rise",
            "waist cinched": "Waist Cinched",
            "waist cinched in": "Waist Cinched",
            "waist cinched in": "Waist Cinched",
            "waist defined": "Waist Defined",
            "waist defined": "Waist Defined",
            "waist elastic": "Waist Elastic",
            "waist elasticized": "Waist Elastic",
            "waist adjustable": "Waist Adjustable",
            "waist drawstring": "Waist Drawstring",
            "waist ruched": "Waist Ruched",
            "waist gathered": "Waist Gathered",
            "waist pleated": "Waist Pleated",
            "waist smocked": "Waist Smocked",
        }

        for waist_keyword in waist_keywords:
            if waist_keyword in text_lower:
                metadata["waist"] = waist_keywords[waist_keyword]
                break

        # Extract length
        length_keywords = {
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini-length": "Mini Length",
            "mini-length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",
            "mini length": "Mini Length",

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
                f"Categorized '{product_type}' as '{
            best_category}' (score: {best_score})"
            )

            # Extract top-level category
            if " - " in best_category:
                top_level, subcategory = best_category.split(" - ", 1)
                result = (top_level, best_category)
            else:
                result = (best_category, None)

            self._cache[cache_key] = result
            return result

        # No match found
        result = (self.config.get("uncategorized_fallback", "Uncategorized"), None)
        self._cache[cache_key] = result
        uploader_logger.debug(
            f"No category match found for '{product_type}', using fallback: {result}"
        )
        return result

    def categorize_product_with_context(
        self,
        product_type: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        vendor: Optional[str] = None,
        tags: Union[List[str], str, None] = None,
    ) -> Tuple[str, Optional[str]]:
        """
        Enhanced categorization using multiple data sources.
        Falls back to product_type only if no better match found.
        """
        # Flatten tags into a single searchable string (filter empty strings)
        tags_text = None
        if tags:
            if isinstance(tags, list):
                tags_text = " ".join(str(t) for t in tags if t and t.strip())
            elif isinstance(tags, str):
                tags_text = tags.strip() if tags.strip() else None

        # Priority weights for different sources
        weights = {
            "product_type": 1.5,
            "title": 1.2,
            "description": 0.3,  # Reduced: long descriptions caused false positives
            "vendor": 0.5,
            "tags": 0.6,  # Tags often encode product category (e.g. "excludeFromTieredUnderwear")
        }

        sources = [
            (product_type, "product_type"),
            (title, "title"),
            (description, "description"),
            (vendor, "vendor"),
            (tags_text, "tags"),
        ]

        all_matches = {}

        for text, source_name in sources:
            if not text:
                continue

            normalized = self._normalize_text(text)

            # Find matches in this text
            for category, patterns in self._keyword_patterns.items():
                match_score = self._calculate_match_score(
                    normalized, patterns["include"], patterns["raw_keywords"]
                )

                # Apply source weight
                weighted_score = match_score * weights[source_name]

                # Check excludes (case-insensitive)
                exclude_penalty = 0
                for exclude in patterns["raw_excludes"]:
                    if exclude.lower() in normalized:
                        exclude_penalty = 30  # Heavy penalty
                        break

                final_score = weighted_score - exclude_penalty

                if exclude_penalty > 0:
                    # Skip excluded categories entirely
                    continue

                if final_score > 0:
                    # Add to aggregate scores
                    if category not in all_matches:
                        all_matches[category] = 0
                    all_matches[category] += final_score

        if all_matches:
            # Pick best category
            best_category = max(all_matches.items(), key=lambda x: x[1])[0]
            best_score = all_matches[best_category]

            uploader_logger.debug(
                f"Categorized with context: '{best_category}' (score: {best_score})"
            )

            if " - " in best_category:
                top_level, subcategory = best_category.split(" - ", 1)
                return (top_level, best_category)
            else:
                return (best_category, None)

        # Fall back to product_type only
        return self.categorize_product(product_type)

    def get_category_info(
        self,
        product_type: str,
        tags: Union[List[str], str, None] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        vendor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get complete category information for a product.
        Returns a dictionary where some values may be None.

        Args:
            product_type: The product type string
            tags: Optional list of tags or string of tags for gender detection
            title: Optional product title for better categorization
            description: Optional description for better categorization
        vendor: Optional vendor for better categorization
        """
        # Use enhanced categorization if additional context is provided
        if title or description or vendor or tags:
            top_level, subcategory = self.categorize_product_with_context(
                product_type, title, description, vendor, tags
            )
        else:
            top_level, subcategory = self.categorize_product(product_type)

        primary_gender, all_genders = self.extract_gender_age_with_unisex_expansion(
            product_type, tags
        )

        # Determine grouped product type
        if subcategory:
            grouped_type = subcategory
        else:
            grouped_type = top_level

        return {
            "grouped_product_type": grouped_type,
            "top_level_category": top_level,
            "subcategory": subcategory,  # This can be None
            "gender_age": primary_gender,
            "gender_categories": all_genders,
            "is_unisex": primary_gender == "Unisex" or "Unisex" in all_genders,
        }

    def get_category_info_with_defaults(
        self,
        product_type: str,
        tags: Union[List[str], str, None] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        vendor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get complete category information with default values instead of None."""
        category_info = self.get_category_info(
            product_type, tags, title, description, vendor
        )

        # Replace None with empty string or other defaults
        return {
            "grouped_product_type": category_info["grouped_product_type"] or "",
            "top_level_category": category_info["top_level_category"] or "",
            "subcategory": category_info["subcategory"]
            or "",  # Convert None to empty string
            "gender_age": category_info["gender_age"] or "",
            "gender_categories": category_info["gender_categories"] or [],
            "is_unisex": category_info.get("is_unisex", False),
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
        uploader_logger.info(
            f"🔄 Reloaded product type mapping with {category_count} categories"
        )

    def get_category_hierarchy(self, product_type: str) -> Dict[str, Any]:
        """
        Returns structured hierarchy for UI filters.
        Useful for building breadcrumbs and multi-level filtering.
        """
        top_level, subcategory = self.categorize_product(product_type)

        hierarchy = {
            "level_1": top_level,
            "level_2": None,
            "level_3": None,
            "breadcrumb": [top_level],
            "filter_path": top_level.lower().replace(" ", "-"),
        }

        if subcategory:
            parts = subcategory.split(" - ")
            for i, part in enumerate(
                parts[1:], 1
            ):  # Skip level_1 (already in parts[0])
                hierarchy[f"level_{i+1}"] = part
                hierarchy["breadcrumb"].append(part)

            # Update filter path
            hierarchy["filter_path"] = "/".join(
                p.lower().replace(" ", "-") for p in parts
            )

        return hierarchy
