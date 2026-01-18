import json
import sys
from pathlib import Path
from typing import Dict, Any, Optional
from core.logger import uploader_logger

class ConfigLoader:
    """Load configuration from JSON files with logging."""
    
    @staticmethod
    def load_product_type_mapping() -> Dict[str, Any]:
        """
        Load product type mapping from JSON config.
        Returns empty dict if file not found.
        """
        # Try multiple possible locations
        possible_paths = [
            Path(__file__).parent / "product_types.json",  # Same directory as this file
            Path.cwd() / "config" / "product_types.json",  # config folder in root
            Path.cwd() / "product_types.json",  # Root directory
        ]
        
        for config_path in possible_paths:
            if config_path.exists():
                try:
                    with open(config_path, 'r', encoding='utf-8') as f:
                        config_data = json.load(f)
                    uploader_logger.info(f"✅ Loaded product type mapping from: {config_path}")
                    return config_data
                except json.JSONDecodeError as e:
                    uploader_logger.error(f"❌ Invalid JSON in {config_path}: {e}")
                    return {}
                except Exception as e:
                    uploader_logger.error(f"❌ Error reading {config_path}: {e}")
                    return {}
        
        # If we get here, file wasn't found
        uploader_logger.error("❌ product_type_mapping.json not found in any of these locations:")
        for path in possible_paths:
            uploader_logger.error(f"  - {path}")
        
        # Return empty config to prevent crashes
        return {
            "category_mapping": {},
            "gender_age_patterns": {},
            "uncategorized_fallback": "Uncategorized",
            "default_gender_age": "Unisex"
        }