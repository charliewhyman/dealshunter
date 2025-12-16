"""
Data processing utilities for product uploader.
"""

import re
import uuid
from html import unescape
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

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
        namespace = uuid.UUID('12345678-1234-5678-1234-567812345678')
        components_str = '|'.join(str(c or '') for c in components)
        return str(uuid.uuid5(namespace, f"{namespace_string}:{components_str}"))
    
    @staticmethod
    def build_image_variants(url: str) -> Dict[str, str]:
        """Build responsive image variant URLs."""
        if not url:
            return {}
        
        try:
            p = urlparse(url)
            base = p.scheme + '://' + p.netloc + p.path
            original_q = dict(parse_qsl(p.query))
            sizes = [320, 640, 1024, 1600]
            variants = {}
            
            for w in sizes:
                q = original_q.copy()
                q['width'] = str(w)
                variants[f'src_{w}'] = base + '?' + urlencode(q)
                
                q_webp = original_q.copy()
                q_webp['width'] = str(w)
                q_webp['format'] = 'webp'
                variants[f'src_webp_{w}'] = base + '?' + urlencode(q_webp)
            
            # Tiny placeholder for blur-up
            q_small = original_q.copy()
            q_small['width'] = '20'
            q_small['format'] = 'webp'
            variants['placeholder'] = base + '?' + urlencode(q_small)
            
            # Build srcset strings
            variants['srcset'] = ', '.join(f"{variants['src_' + str(w)]} {w}w" for w in sizes)
            variants['webp_srcset'] = ', '.join(f"{variants['src_webp_' + str(w)]} {w}w" for w in sizes)
            variants['fallback'] = variants.get('src_640') or url
            variants['thumbnail'] = variants.get('src_320') or variants['fallback']
            variants['thumbnail_webp'] = variants.get('src_webp_320') or variants.get('webp_srcset')
            
            return variants
            
        except Exception as e:
            uploader_logger.warning(f"Failed to build image variants: {e}")
            return {'fallback': url}