from typing import Dict, Optional, Tuple, List, Any, Union
import re
from config.product_type_loader import ConfigLoader
from core.logger import uploader_logger


# ---------------------------------------------------------------------------
# Module-level keyword tables (easy to test & extend)
# ---------------------------------------------------------------------------
_SIZE_PATTERNS: Dict[str, str] = {
    "XS": r"\b(?:xs|xsmall|extra[ -]?small)\b",
    "S":  r"\b(?:s|small)\b",
    "M":  r"\b(?:m|med|medium)\b",
    "L":  r"\b(?:l|large)\b",
    "XL": r"\b(?:xl|extra[ -]?large|xtra[ -]?large)\b",
    "XXL": r"\b(?:xxl|2xl|extra[ -]?extra[ -]?large)\b",
    "3XL": r"\b(?:3xl|3x[ -]?large)\b",
    "4XL": r"\b(?:4xl|4x[ -]?large)\b",
    "5XL": r"\b(?:5xl|5x[ -]?large)\b",
    "6XL": r"\b(?:6xl|6x[ -]?large)\b",
    "7XL": r"\b(?:7xl|7x[ -]?large)\b",
    "8XL": r"\b(?:8xl|8x[ -]?large)\b",
    "9XL": r"\b(?:9xl|9x[ -]?large)\b",
    "10XL": r"\b(?:10xl|10x[ -]?large)\b",
    "11XL": r"\b(?:11xl|11x[ -]?large)\b",
    "12XL": r"\b(?:12xl|12x[ -]?large)\b",
}

_COLOR_KEYWORDS = [
    "red", "blue", "green", "yellow", "orange", "purple", "pink", "black",
    "white", "gray", "grey", "brown", "beige", "tan", "cream", "ivory",
    "navy", "teal", "turquoise", "cyan", "mint", "lime", "olive", "khaki",
    "burgundy", "maroon", "wine", "plum", "lavender", "peach", "coral",
    "amber", "gold", "silver", "bronze", "copper", "rose", "blush",
    "scarlet", "crimson", "fuchsia", "magenta", "indigo", "violet",
    "azure", "cobalt", "cerulean", "sapphire", "emerald", "jade",
    "ruby", "cherry", "chocolate", "chestnut", "cinnamon", "russet",
    "umber", "sienna", "burnt orange",
]

_INTENSITY_TOKENS = {
    "pale": {"pale", "light"},
    "light": {"light", "pale"},
    "deep": {"deep", "dark", "rich"},
    "dark": {"dark", "deep", "rich"},
    "rich": {"rich", "deep", "dark"},
    "bright": {"bright", "vivid", "bold"},
    "vivid": {"vivid", "bright", "bold"},
    "bold": {"bold", "bright", "vivid"},
}

_PATTERN_KEYWORDS = [
    "striped", "plaid", "floral", "geometric", "polka dot", "polka dots",
    "checkered", "check", "checked", "gingham", "herringbone", "tweed",
    "jacquard", "ikat", "ombre", "tie dye", "graphic", "abstract",
    "animal print", "zebra", "tiger", "leopard", "cheetah",
    "houndstooth", "paisley", "mandala", "camo", "camouflage",
    "lattice", "cable knit", "argyle",
]

_MATERIAL_KEYWORDS = [
    "cotton", "polyester", "linen", "silk", "wool", "rayon", "spandex",
    "nylon", "viscose", "acrylic", "modal", "bamboo", "tencel", "lyocell",
    "jersey", "terry", "ribbed", "sateen", "satin", "chiffon", "voile",
    "organza", "taffeta", "tulle", "lace", "mesh", "netting", "sequin",
    "velvet", "velveteen", "corduroy", "denim", "jeans", "leather",
    "faux leather", "pleather", "vinyl", "rubber", "latex", "neoprene",
    "canvas", "suede", "faux suede", "microfiber", "fleece", "thermal",
    "heavyweight", "lightweight", "breathable", "quick-dry",
    "water-resistant", "waterproof", "wind-resistant", "moisture-wicking",
    "stretch", "four-way stretch", "two-way stretch",
]

_FIT_KEYWORDS = {
    "relaxed": "Relaxed", "loose": "Loose", "tight": "Tight", "snug": "Snug",
    "fitted": "Fitted", "slim": "Slim", "skinny": "Skinny",
    "oversized": "Oversized", "boxy": "Boxy", "drop shoulder": "Drop Shoulder",
    "regular": "Regular", "straight": "Straight", "curvy": "Curvy",
    "maternity": "Maternity", "plus size": "Plus Size", "petite": "Petite",
    "tall": "Tall", "athletic": "Athletic",
}

_SLEEVE_KEYWORDS = {
    "sleeveless": "Sleeveless",
    "short sleeve": "Short Sleeve", "short sleeves": "Short Sleeve",
    "long sleeve": "Long Sleeve", "long sleeves": "Long Sleeve",
    "3/4 sleeve": "3/4 Sleeve", "3/4 sleeves": "3/4 Sleeve",
    "cap sleeve": "Cap Sleeve", "cap sleeves": "Cap Sleeve",
    "off shoulder": "Off Shoulder", "cold shoulder": "Cold Shoulder",
    "cold shoulders": "Cold Shoulder",
    "bell sleeve": "Bell Sleeve", "bell sleeves": "Bell Sleeve",
    "puff sleeve": "Puff Sleeve", "puff sleeves": "Puff Sleeve",
    "bishop sleeve": "Bishop Sleeve", "bishop sleeves": "Bishop Sleeve",
    "balloon sleeve": "Balloon Sleeve", "balloon sleeves": "Balloon Sleeve",
    "ruffle sleeve": "Ruffle Sleeve", "ruffle sleeves": "Ruffle Sleeve",
    "flutter sleeve": "Flutter Sleeve", "flutter sleeves": "Flutter Sleeve",
    "leg-of-mutton sleeve": "Leg-of-Mutton Sleeve",
    "leg-of-mutton sleeves": "Leg-of-Mutton Sleeve",
}

_NECKLINE_KEYWORDS = {
    "v-neck": "V-Neck", "v neck": "V-Neck", "v-neckline": "V-Neck",
    "crew neck": "Crew Neck", "crew neckline": "Crew Neck",
    "round neck": "Round Neck", "round neckline": "Round Neck",
    "boat neck": "Boat Neck", "boat neckline": "Boat Neck",
    "scoop neck": "Scoop Neck", "scoop neckline": "Scoop Neck",
    "off shoulder": "Off Shoulder", "off the shoulder": "Off Shoulder",
    "squared neck": "Squared Neck", "square neck": "Squared Neck",
    "halter neck": "Halter Neck", "halter neckline": "Halter Neck",
    "strapless": "Strapless",
    "racerback": "Racerback", "racer back": "Racerback",
    "deep v": "Deep V", "deep v-neck": "Deep V", "plunge": "Plunge",
    "high neck": "High Neck", "mock neck": "Mock Neck",
    "turtleneck": "Turtleneck", "turtle neck": "Turtleneck",
    "mandarin collar": "Mandarin Collar", "collared": "Collared",
    "shawl collar": "Shawl Collar", "wrap neck": "Wrap Neck",
    "cowl neck": "Cowl Neck", "keyhole neck": "Keyhole Neck",
}

_WAIST_KEYWORDS = {
    "high waist": "High Waist", "high waistline": "High Waist",
    "mid rise": "Mid Rise", "mid rise waist": "Mid Rise",
    "low rise": "Low Rise", "low rise waist": "Low Rise",
    "waist cinched": "Waist Cinched", "waist defined": "Waist Defined",
    "waist elastic": "Waist Elastic", "waist elasticized": "Waist Elastic",
    "waist adjustable": "Waist Adjustable",
    "waist drawstring": "Waist Drawstring",
    "waist ruched": "Waist Ruched", "waist gathered": "Waist Gathered",
    "waist pleated": "Waist Pleated", "waist smocked": "Waist Smocked",
}

_LENGTH_KEYWORDS = {
    "mini length": "Mini Length", "mini-length": "Mini Length",
    "knee length": "Knee Length", "knee-length": "Knee Length",
    "midi length": "Midi Length", "midi-length": "Midi Length",
    "maxi length": "Maxi Length", "maxi-length": "Maxi Length",
    "floor length": "Floor Length", "floor-length": "Floor Length",
    "ankle length": "Ankle Length", "ankle-length": "Ankle Length",
    "cropped": "Cropped", "crop": "Cropped",
}


def _find_first(text: str, mapping: Union[Dict[str, str], List[str]]) -> Optional[str]:
    """Return the canonical value for the first keyword found in `text`."""
    if isinstance(mapping, dict):
        for keyword, canonical in mapping.items():
            if re.search(r"\b" + re.escape(keyword) + r"\b", text):
                return canonical
        return None
    for keyword in mapping:
        if re.search(r"\b" + re.escape(keyword) + r"\b", text):
            return keyword
    return None


class ProductCategorizer:
    """Categorize products using JSON configuration with gender detection and metadata extraction."""

    def __init__(self):
        self.config = ConfigLoader.load_product_type_mapping()

        if not self.config or not self.config.get("category_mapping"):
            uploader_logger.error("Invalid product type mapping config, using fallback")
            self.config = {
                "category_mapping": {},
                "default_gender_age": "Unisex",
                "default_category": "Uncategorized",
                "uncategorized_fallback": "Uncategorized",
                "gender_age_patterns": {},
            }

        self._cache: Dict[str, Tuple[str, Optional[str]]] = {}
        self._prepare_keywords()
        self._init_size_patterns()

        category_count = len(self.config.get("category_mapping", {}))
        uploader_logger.info(
            f"📊 ProductCategorizer initialized with {category_count} categories"
        )

    # ------------------------------------------------------------------ setup
    def _prepare_keywords(self) -> None:
        self._keyword_patterns: Dict[str, Dict[str, Any]] = {}
        for category, rules in self.config.get("category_mapping", {}).items():
            includes = [
                r"\b" + re.escape(k) + r"\b" for k in rules.get("keywords", [])
            ]
            excludes = [
                r"\b" + re.escape(e) + r"\b" for e in rules.get("exclude", [])
            ]
            self._keyword_patterns[category] = {
                "include": includes,
                "exclude": excludes,
                "raw_keywords": rules.get("keywords", []),
                "raw_excludes": rules.get("exclude", []),
            }

    def _init_size_patterns(self) -> None:
        self._size_patterns = _SIZE_PATTERNS

    # --------------------------------------------------------------- helpers
    def _normalize_text(self, text: str) -> str:
        if not text or not isinstance(text, str):
            return ""
        # Lowercase, unify separators, strip punctuation
        t = text.lower().strip()
        t = re.sub(r"[_\-/]+", " ", t)
        t = re.sub(r"[^\w\s]", " ", t)
        t = re.sub(r"\s+", " ", t).strip()
        return t

    def _calculate_match_score(
        self, text: str, patterns: List[str], keywords: List[str]
    ) -> int:
        score = 0
        for pattern in patterns:
            if re.search(pattern, text):
                score += 10
        for keyword in keywords:
            kw = re.escape(keyword)
            if re.search(r"\b" + kw + r"\b", text):
                score += 15 if f" {keyword} " in f" {text} " else 10
            elif keyword in text:
                score += 5
        return score

    # ------------------------------------------------------------- metadata
    def _extract_metadata_from_text(self, text: str) -> Dict[str, Any]:
        metadata: Dict[str, Any] = {
            k: None
            for k in (
                "size", "color", "pattern", "material", "fit", "sleeve_length",
                "neckline", "waist", "length", "closure", "style", "occasion",
                "season", "temperature", "care_instructions",
            )
        }
        if not text:
            return metadata

        text_lower = self._normalize_text(text)

        # Size: iterate from most specific to least (longest patterns first)
        for size in sorted(self._size_patterns, key=lambda s: -len(s)):
            if re.search(self._size_patterns[size], text_lower):
                metadata["size"] = size
                break

        # Color with intensity modifier
        colors = [c for c in _COLOR_KEYWORDS if c in text_lower]
        if colors:
            for intensity, allowed in _INTENSITY_TOKENS.items():
                if intensity in text_lower:
                    filtered = [
                        c for c in colors
                        if any(a in c for a in allowed) or any(a in text_lower for a in allowed)
                    ]
                    # If nothing fits, keep the original colors (don't reset to global list!)
                    colors = filtered or colors
                    break
            metadata["color"] = ", ".join(colors[:3])

        metadata["pattern"] = _find_first(text_lower, _PATTERN_KEYWORDS)
        metadata["material"] = _find_first(text_lower, _MATERIAL_KEYWORDS)
        metadata["fit"] = _find_first(text_lower, _FIT_KEYWORDS)
        metadata["sleeve_length"] = _find_first(text_lower, _SLEEVE_KEYWORDS)
        metadata["neckline"] = _find_first(text_lower, _NECKLINE_KEYWORDS)
        metadata["waist"] = _find_first(text_lower, _WAIST_KEYWORDS)
        metadata["length"] = _find_first(text_lower, _LENGTH_KEYWORDS)
        return metadata

    # --------------------------------------------------------------- gender
    def extract_gender_age(
        self, product_type: str, tags: Union[List[str], str, None] = None
    ) -> str:
        default = self.config.get("default_gender_age", "Unisex")
        if not product_type:
            return default

        texts = [self._normalize_text(product_type)]
        if tags:
            if isinstance(tags, list):
                texts.extend(self._normalize_text(str(t)) for t in tags if t)
            elif isinstance(tags, str):
                texts.append(self._normalize_text(tags))
        combined = " ".join(texts)

        patterns = self.config.get("gender_age_patterns", {})
        scores: Dict[str, int] = {}

        for category, pattern_list in patterns.items():
            score = 0
            for p in pattern_list:
                p_esc = re.escape(p)
                for text in texts:
                    if re.search(r"\b" + p_esc + r"\b", text):
                        score += 10
                    elif p in text:
                        score += 5
                if re.search(r"\b" + p_esc + r"\b", combined):
                    score += 5
                elif p in combined:
                    score += 2
            if score > 0:
                scores[category] = score

        if scores:
            best = max(scores.items(), key=lambda x: x[1])[0]
            uploader_logger.debug(f"Matched gender '{best}' with score {scores[best]}")
            return best

        uploader_logger.debug(f"No gender match, using default: '{default}'")
        return default

    def extract_gender_age_with_unisex_expansion(
        self, product_type: str, tags: Union[List[str], str, None] = None
    ) -> Tuple[str, List[str]]:
        primary = self.extract_gender_age(product_type, tags)

        # Normalize to canonical plural form used by config
        canon = {"Women": "Womens", "Men": "Mens",
                 "Womens": "Womens", "Mens": "Mens"}.get(primary, primary)

        if canon == "Unisex":
            return primary, ["Unisex", "Mens", "Womens"]
        if canon in ("Womens", "Mens", "Kids", "Baby"):
            return primary, [canon]
        return primary, [primary]

    # ----------------------------------------------------------- categorize
    def categorize_product(self, product_type: str) -> Tuple[str, Optional[str]]:
        if product_type in self._cache:
            return self._cache[product_type]

        normalized = self._normalize_text(product_type)
        fallback = (self.config.get("uncategorized_fallback", "Uncategorized"), None)

        if not normalized:
            self._cache[product_type] = fallback
            return fallback

        matches: List[Tuple[int, str]] = []
        for category, patterns in self._keyword_patterns.items():
            score = self._calculate_match_score(
                normalized, patterns["include"], patterns["raw_keywords"]
            )
            # Excludes: apply as a hard skip (cleaner than penalty math)
            if any(re.search(p, normalized) for p in patterns["exclude"]):
                continue
            if any(e.lower() in normalized for e in patterns["raw_excludes"]):
                continue
            if score > 0:
                specificity = category.count(" - ")
                score += specificity * 5
                matches.append((score, category))

        matches.sort(key=lambda x: x[0], reverse=True)

        if matches:
            best_score, best_category = matches[0]
            uploader_logger.debug(
                f"Categorized '{product_type}' as '{best_category}' (score: {best_score})"
            )
            if " - " in best_category:
                top_level, _ = best_category.split(" - ", 1)
                result: Tuple[str, Optional[str]] = (top_level, best_category)
            else:
                result = (best_category, None)
        else:
            result = fallback
            uploader_logger.debug(
                f"No category match for '{product_type}', fallback: {result}"
            )

        self._cache[product_type] = result
        return result

    def categorize_product_with_context(
        self,
        product_type: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        vendor: Optional[str] = None,
        tags: Union[List[str], str, None] = None,
    ) -> Tuple[str, Optional[str]]:
        tags_text: Optional[str] = None
        if tags:
            if isinstance(tags, list):
                tags_text = " ".join(str(t) for t in tags if t and str(t).strip())
            elif isinstance(tags, str):
                tags_text = tags.strip() or None

        weights = {
            "product_type": 1.5,
            "title": 1.2,
            "description": 0.3,
            "vendor": 0.5,
            "tags": 0.6,
        }
        sources = [
            (product_type, "product_type"),
            (title, "title"),
            (description, "description"),
            (vendor, "vendor"),
            (tags_text, "tags"),
        ]

        aggregate: Dict[str, float] = {}
        for text, source in sources:
            if not text:
                continue
            normalized = self._normalize_text(text)
            for category, patterns in self._keyword_patterns.items():
                if any(re.search(p, normalized) for p in patterns["exclude"]):
                    continue
                if any(e.lower() in normalized for e in patterns["raw_excludes"]):
                    continue
                score = self._calculate_match_score(
                    normalized, patterns["include"], patterns["raw_keywords"]
                )
                if score > 0:
                    aggregate[category] = aggregate.get(category, 0.0) + score * weights[source]

        if aggregate:
            best_category = max(aggregate.items(), key=lambda x: x[1])[0]
            uploader_logger.debug(
                f"Categorized with context: '{best_category}' (score: {aggregate[best_category]})"
            )
            if " - " in best_category:
                top_level, _ = best_category.split(" - ", 1)
                return (top_level, best_category)
            return (best_category, None)

        return self.categorize_product(product_type)

    # --------------------------------------------------------------- public
    def get_category_info(
        self,
        product_type: str,
        tags: Union[List[str], str, None] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        vendor: Optional[str] = None,
    ) -> Dict[str, Any]:
        if title or description or vendor or tags:
            top_level, subcategory = self.categorize_product_with_context(
                product_type, title, description, vendor, tags
            )
        else:
            top_level, subcategory = self.categorize_product(product_type)

        primary_gender, all_genders = self.extract_gender_age_with_unisex_expansion(
            product_type, tags
        )
        grouped = subcategory or top_level

        return {
            "grouped_product_type": grouped,
            "top_level_category": top_level,
            "subcategory": subcategory,
            "gender_age": primary_gender,
            "gender_categories": all_genders,
            "is_unisex": primary_gender == "Unisex",
        }

    def get_category_info_with_defaults(self, *args, **kwargs) -> Dict[str, Any]:
        info = self.get_category_info(*args, **kwargs)
        return {
            "grouped_product_type": info["grouped_product_type"] or "",
            "top_level_category": info["top_level_category"] or "",
            "subcategory": info["subcategory"] or "",
            "gender_age": info["gender_age"] or "",
            "gender_categories": info["gender_categories"] or [],
            "is_unisex": info.get("is_unisex", False),
        }

    def clear_cache(self) -> None:
        self._cache.clear()
        uploader_logger.debug("🧹 Cleared product categorization cache")

    def reload_config(self) -> None:
        self.config = ConfigLoader.load_product_type_mapping()
        self._prepare_keywords()
        self.clear_cache()
        uploader_logger.info(
            f"🔄 Reloaded product type mapping with "
            f"{len(self.config.get('category_mapping', {}))} categories"
        )

    def get_category_hierarchy(self, product_type: str) -> Dict[str, Any]:
        top_level, subcategory = self.categorize_product(product_type)
        hierarchy: Dict[str, Any] = {
            "level_1": top_level,
            "level_2": None,
            "level_3": None,
            "breadcrumb": [top_level],
            "filter_path": top_level.lower().replace(" ", "-"),
        }
        if subcategory:
            parts = subcategory.split(" - ")
            for i, part in enumerate(parts[1:], 1):
                hierarchy[f"level_{i + 1}"] = part
                hierarchy["breadcrumb"].append(part)
            hierarchy["filter_path"] = "/".join(
                p.lower().replace(" ", "-") for p in parts
            )
        return hierarchy