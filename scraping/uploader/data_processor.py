"""
Data processing utilities for product uploader.
"""

import re
import uuid
from html import unescape
from typing import Dict, Any, Optional
from urllib.parse import urlparse, parse_qsl, urlencode

from core.logger import uploader_logger


class DataProcessor:
    """Processes data for database upload."""

    @staticmethod
    def strip_html_tags(html_text: str) -> str:
        """Remove HTML tags from text and decode HTML entities."""
        if not html_text:
            return ""
        text = unescape(html_text)
        return re.sub(r"<[^>]*>", "", text)

    @staticmethod
    def clean_numeric(value: Any) -> Optional[float]:
        """Converts string numbers with commas into float."""
        if isinstance(value, str):
            try:
                return float(value.replace(",", ""))
            except ValueError:
                return None
        return value

    @staticmethod
    def clean_boolean(value: Any) -> bool:
        """Converts various truthy values to boolean."""
        return value in [1, "1", True, "true", "yes"]

    @staticmethod
    def generate_deterministic_id(namespace_string: str, *components) -> str:
        """Generate a deterministic UUID based on input components."""
        namespace = uuid.UUID("12345678-1234-5678-1234-567812345678")
        components_str = "|".join(str(c or "") for c in components)
        return str(uuid.uuid5(namespace, f"{namespace_string}:{components_str}"))

    @staticmethod
    def build_image_variants(url: str) -> Dict[str, str]:
        """Build responsive image variant URLs."""
        if not url:
            return {}

        try:
            p = urlparse(url)
            base = p.scheme + "://" + p.netloc + p.path
            original_q = dict(parse_qsl(p.query))
            sizes = [320, 640, 1024, 1600]
            variants = {}

            for w in sizes:
                q = original_q.copy()
                q["width"] = str(w)
                variants[f"src_{w}"] = base + "?" + urlencode(q)

                q_webp = original_q.copy()
                q_webp["width"] = str(w)
                q_webp["format"] = "webp"
                variants[f"src_webp_{w}"] = base + "?" + urlencode(q_webp)

            # Tiny placeholder for blur-up
            q_small = original_q.copy()
            q_small["width"] = "20"
            q_small["format"] = "webp"
            variants["placeholder"] = base + "?" + urlencode(q_small)

            # Build srcset strings
            variants["srcset"] = ", ".join(
                f"{variants['src_' + str(w)]} {w}w" for w in sizes
            )
            variants["webp_srcset"] = ", ".join(
                f"{variants['src_webp_' + str(w)]} {w}w" for w in sizes
            )
            variants["fallback"] = variants.get("src_640") or url

            return variants

        except Exception as e:
            uploader_logger.warning(f"Failed to build image variants: {e}")
            return {"fallback": url}

    @staticmethod
    def extract_size(title: str) -> Optional[str]:
        """Extract standardized size from variant title."""
        if not title:
            return None

        # Convert to upper for easier matching
        title_upper = title.upper()

        # Split by common separators (/, -, |, ,)
        parts = [p.strip() for p in re.split(r"[/|\-,]", title_upper)]

        size_mapping = {
            "X-SMALL": "XS",
            "XSMALL": "XS",
            "XX-SMALL": "XXS",
            "SMALL": "S",
            "MEDIUM": "M",
            "LARGE": "L",
            "X-LARGE": "XL",
            "XLARGE": "XL",
            "XX-LARGE": "2XL",
            "XXLARGE": "2XL",
            "XXX-LARGE": "3XL",
            "XXXLARGE": "3XL",
            "XXXX-LARGE": "4XL",
            "XXXXLARGE": "4XL",
            "XXL": "2XL",
            "XXXL": "3XL",
            "XXXXL": "4XL",
            "1X": "XL",
            "2X": "2XL",
            "3X": "3XL",
            "4X": "4XL",
            "ONE SIZE": "ONE SIZE",
            "OS": "ONE SIZE",
            "O/S": "ONE SIZE",
            "ALL": "ONE SIZE",
        }

        valid_sizes = {
            "XXS",
            "XS",
            "S",
            "M",
            "L",
            "XL",
            "2XL",
            "3XL",
            "4XL",
            "ONE SIZE",
        }

        for part in parts:
            if part in size_mapping:
                return size_mapping[part]
            if part in valid_sizes:
                return part

            # Numeric checks: "8", "08", "24W", "US 8", "UK 10"
            clean_part = re.sub(r"^(US|UK|EU|SIZE)\s+", "", part).strip()

            if re.match(r"^0?\d{1,2}$", clean_part):
                if clean_part == "0" or clean_part == "00":
                    return clean_part
                return str(int(clean_part))

            if re.match(r"^\d{1,2}W$", clean_part):
                return clean_part

        # Regex fallback using word boundaries to ensure '3XL' doesn't match 'XL'
        for word, mapped in size_mapping.items():
            if re.search(r"\b" + re.escape(word) + r"\b", title_upper):
                return mapped

        for valid in valid_sizes:
            if re.search(r"\b" + re.escape(valid) + r"\b", title_upper):
                return valid

        # Regex for numeric fallback correctly capturing isolated numbers
        num_match = re.search(r"\b(US|UK|EU|SIZE)?\s*(\d{1,2}W?)\b", title_upper)
        if num_match:
            val = num_match.group(2)
            if val.endswith("W"):
                return val
            if val == "0" or val == "00":
                return val
            return str(int(val))

        return None
