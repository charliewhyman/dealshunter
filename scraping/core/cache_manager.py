"""
Cache management for shop verification and data.
"""

import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import config.settings as settings
from core.logger import scraper_logger

class CacheManager:
    """Manages caching of shop verification and data."""
    
    def __init__(self, cache_file: str = "shop_cache.json"):
        self.cache_file = settings.CACHE_DIR / cache_file
        self.cache = self._load_cache()
    
    def _load_cache(self) -> Dict[str, Any]:
        """Load cache from file."""
        if not self.cache_file.exists():
            return {"shops": {}, "verification": {}}
        
        try:
            with open(self.cache_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            scraper_logger.error(f"Failed to load cache: {e}")
            return {"shops": {}, "verification": {}}
    
    def _save_cache(self):
        """Save cache to file."""
        try:
            with open(self.cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.cache, f, indent=2, ensure_ascii=False)
        except Exception as e:
            scraper_logger.error(f"Failed to save cache: {e}")
    
    def get_shop_verification(self, base_url: str) -> Optional[bool]:
        """Get cached shop verification result."""
        if base_url in self.cache.get("verification", {}):
            cached = self.cache["verification"][base_url]
            expiry = datetime.fromisoformat(cached["expiry"])
            if datetime.now() < expiry:
                return cached["is_shopify"]
        return None
    
    def set_shop_verification(self, base_url: str, is_shopify: bool, expiry_days: int = 7):
        """Cache shop verification result."""
        if "verification" not in self.cache:
            self.cache["verification"] = {}
        
        self.cache["verification"][base_url] = {
            "is_shopify": is_shopify,
            "expiry": (datetime.now() + timedelta(days=expiry_days)).isoformat(),
            "checked": datetime.now().isoformat()
        }
        self._save_cache()
    
    def get_shop_data(self, shop_id: str) -> Optional[Dict[str, Any]]:
        """Get cached shop data."""
        return self.cache.get("shops", {}).get(shop_id)
    
    def set_shop_data(self, shop_id: str, data: Dict[str, Any], expiry_hours: int = 24):
        """Cache shop data."""
        if "shops" not in self.cache:
            self.cache["shops"] = {}
        
        self.cache["shops"][shop_id] = {
            "data": data,
            "expiry": (datetime.now() + timedelta(hours=expiry_hours)).isoformat(),
            "cached": datetime.now().isoformat()
        }
        self._save_cache()
    
    def clear_expired(self):
        """Clear expired cache entries."""
        now = datetime.now()
        cleared = 0
        
        # Clear verification cache
        if "verification" in self.cache:
            expired_keys = []
            for url, data in self.cache["verification"].items():
                expiry = datetime.fromisoformat(data["expiry"])
                if expiry < now:
                    expired_keys.append(url)
            
            for key in expired_keys:
                del self.cache["verification"][key]
                cleared += 1
        
        # Clear shop data cache
        if "shops" in self.cache:
            expired_keys = []
            for shop_id, data in self.cache["shops"].items():
                expiry = datetime.fromisoformat(data["expiry"])
                if expiry < now:
                    expired_keys.append(shop_id)
            
            for key in expired_keys:
                del self.cache["shops"][key]
                cleared += 1
        
        if cleared > 0:
            self._save_cache()
            scraper_logger.info(f"Cleared {cleared} expired cache entries")
    
    def clear_all(self):
        """Clear all cache."""
        self.cache = {"shops": {}, "verification": {}}
        self._save_cache()
        scraper_logger.info("Cleared all cache")