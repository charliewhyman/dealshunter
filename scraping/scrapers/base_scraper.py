"""
Base class for all scrapers.
"""

from abc import ABC, abstractmethod
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

import config.settings as settings
from core.rate_limiter import SmartRateLimiter
from core.session_manager import SessionManager
from core.cache_manager import CacheManager
from core.file_manager import FileManager
from core.logger import scraper_logger
from json import JSONDecodeError

class BaseScraper(ABC):
    """Abstract base class for all Shopify scrapers."""
    
    def __init__(self, scraper_type: str):
        self.scraper_type = scraper_type
        self.rate_limiter = SmartRateLimiter(
            base_delay=settings.SCRAPER_CONFIG['base_delay'],
            max_delay=settings.SCRAPER_CONFIG['max_delay']
        )
        self.file_manager = FileManager()
        self.cache_manager = CacheManager()
        self.logger = scraper_logger
    
    @abstractmethod
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Scrape data for a single shop. Must be implemented by subclasses."""
        pass
    
    def scrape_multiple(self, shops_data: List[Dict[str, Any]], 
                       max_workers: Optional[int] = None) -> Dict[str, List[Dict[str, Any]]]:
        """Scrape data for multiple shops concurrently."""
        max_workers = max_workers or settings.SCRAPER_CONFIG['max_workers']
        results = {}
        
        self.logger.info(f"Scraping {len(shops_data)} shops with {max_workers} workers")
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_shop = {
                executor.submit(self.scrape_single, shop): shop 
                for shop in shops_data
            }
            
            for future in as_completed(future_to_shop):
                shop = future_to_shop[future]
                shop_id = shop.get('id', 'unknown')
                
                try:
                    shop_results = future.result()
                    results[shop_id] = shop_results
                    self.logger.info(f"Scraped {len(shop_results)} {self.scraper_type} for {shop_id}")
                except Exception as e:
                    self.logger.error(f"Failed to scrape {self.scraper_type} for {shop_id}: {e}")
                    results[shop_id] = []
        
        return results
    
    def save_results(self, shop_id: str, results: List[Dict[str, Any]], 
                    timestamp: Optional[str] = None) -> Optional[str]:
        """Save scraped results to file."""
        if not results:
            self.logger.warning(f"No results to save for {shop_id}")
            return None
        
        timestamp = timestamp or datetime.now().strftime('%Y%m%d_%H%M%S')
        
        try:
            filepath = self.file_manager.save_raw_data(
                data=results,
                shop_id=shop_id,
                data_type=self.scraper_type,
                timestamp=timestamp
            )
            return str(filepath)
            
        except Exception as e:
            self.logger.error(f"Failed to save results for {shop_id}: {e}")
            return None
    
    def is_shopify_store(self, base_url: str, shop_id: str) -> bool:
        """Check if a store is a Shopify store."""
        # Check cache first
        cached = self.cache_manager.get_shop_verification(base_url)
        if cached is not None:
            return cached
        
        # Perform actual check
        try:
            session = SessionManager.get_session(shop_id)
            response = session.get(
                f"{base_url}/products.json", 
                timeout=settings.SCRAPER_CONFIG['request_timeout']
            )
            self.rate_limiter.wait(shop_id, response)
            
            # If we got a 200, try several guarded checks rather than assuming JSON
            if response.status_code == 200:
                # 1) Check for Shopify-specific response headers
                headers_lower = {k.lower(): v for k, v in response.headers.items()}
                if any(k.startswith('x-shopify') for k in headers_lower.keys()):
                    self.cache_manager.set_shop_verification(base_url, True)
                    return True

                # 2) If content-type indicates JSON, parse safely
                content_type = response.headers.get('Content-Type', '')
                if 'application/json' in content_type.lower():
                    try:
                        data = response.json()
                        is_shopify = isinstance(data, dict) and 'products' in data
                        if is_shopify:
                            self.cache_manager.set_shop_verification(base_url, True)
                            return True
                    except (ValueError, JSONDecodeError):
                        # Not valid JSON, fall through to HTML checks
                        pass

                # 3) Fallback: inspect body for Shopify indicators
                body = (response.text or '').lower()
                if 'cdn.shopify.com' in body or 'shopify' in body:
                    self.cache_manager.set_shop_verification(base_url, True)
                    return True

            # If products.json didn't prove it, try the root HTML for Shopify markers
            response = session.get(
                base_url,
                timeout=settings.SCRAPER_CONFIG['request_timeout']
            )
            self.rate_limiter.wait(shop_id, response)

            if response.status_code == 200:
                headers_lower = {k.lower(): v for k, v in response.headers.items()}
                if any(k.startswith('x-shopify') for k in headers_lower.keys()):
                    self.cache_manager.set_shop_verification(base_url, True)
                    return True

                body = (response.text or '').lower()
                # Look for common Shopify artifacts: CDN, asset paths, or generator/meta tags
                if any(token in body for token in ('cdn.shopify.com', 'cdn.shopify', '/cdn/shopify', 'shopify.theme', 'shopify_design_mode', 'shopify')):
                    self.cache_manager.set_shop_verification(base_url, True)
                    return True
        except Exception as e:
            self.logger.warning(f"Failed to verify Shopify store {base_url}: {e}")
        
        self.cache_manager.set_shop_verification(base_url, False)
        return False
    
    def load_shops(self) -> List[Dict[str, Any]]:
        """Load shops from configuration file."""
        try:
            with open(settings.SHOP_URLS_FILE, 'r', encoding='utf-8') as f:
                shops = json.load(f)
            
            if not isinstance(shops, list):
                self.logger.error("Shop URLs file must contain a list")
                return []
            
            self.logger.info(f"Loaded {len(shops)} shops from configuration")
            return shops
            
        except Exception as e:
            self.logger.error(f"Failed to load shops: {e}")
            return []