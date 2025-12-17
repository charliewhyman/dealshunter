"""
Scraper for collection-to-product mapping.
"""

from datetime import datetime
from typing import List, Dict, Any, Optional

from scrapers.base_scraper import BaseScraper
from config.schemas import CollectionProductMapping
import config.settings as settings
from core.session_manager import SessionManager

class CollectionProductsScraper(BaseScraper):
    """Scraper for collection-to-product relationships."""
    
    def __init__(self, collections_data: Optional[Dict[str, List[Dict]]] = None):
        super().__init__('collection_products')
        # normalize keys to strings to avoid int/str mismatch when looking up by shop id
        self.collections_data = {str(k): v for k, v in (collections_data or {}).items()}
        self.max_pages = settings.SCRAPER_CONFIG['max_pages']['collection_products']
    
    def set_collections_data(self, collections_data: Dict[str, List[Dict]]):
        """Set collections data to map against."""
        # Normalize keys to strings so lookups are consistent regardless of id type
        self.collections_data = {str(k): v for k, v in (collections_data or {}).items()}
    
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Scrape collection-product relationships for a single shop."""
        shop_id = shop_data.get('id')
        base_url = shop_data.get('url')
        
        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []
        
        sid = str(shop_id)
        if sid not in self.collections_data or not self.collections_data[sid]:
            self.logger.warning(f"No collections data available for {shop_id}")
            return []
        
        mappings = []
        
        for collection in self.collections_data[sid]:
            collection_id = collection.get('id')
            handle = collection.get('handle')
            
            if not handle:
                continue
            if collection_id is None:
                self.logger.warning(f"Collection missing id for shop {shop_id}, handle {handle}")
                continue
            
            collection_mappings = self._fetch_collection_products(
                base_url, sid, str(collection_id), handle
            )
            mappings.extend(collection_mappings)
        
        return mappings
    
    def _fetch_collection_products(self, base_url: str, shop_id: str, 
                                  collection_id: str, handle: str) -> List[Dict[str, Any]]:
        """Fetch products for a specific collection."""
        mappings = []
        page = 1
        session = SessionManager.get_session(shop_id)
        
        while True:
            url = f"{base_url}/collections/{handle}/products.json?limit={settings.SCRAPER_CONFIG['batch_size']}&page={page}"
            
            try:
                response = session.get(url, timeout=settings.SCRAPER_CONFIG['request_timeout'])
                wait_time = self.rate_limiter.wait(shop_id, response)
                
                if response.status_code == 429:
                    self.logger.warning(f"Rate limited for collection {handle}, page {page}")
                    continue
                
                response.raise_for_status()
                data = response.json()
                
                if "products" not in data or not data["products"]:
                    break
                
                for idx, product in enumerate(data["products"]):
                    if product_id := product.get("id"):
                        mapping = CollectionProductMapping(
                            shop_id=shop_id,
                            scraped_at=datetime.now().isoformat(),
                            collection_id=str(collection_id),
                            product_id=str(product_id),
                            position=idx + 1,
                            added_at=product.get("created_at")
                        )
                        mappings.append(mapping.to_dict())
                
                self.logger.info(f"Collection {handle}: page {page} - {len(data['products'])} products")
                
                if self.max_pages and page >= self.max_pages:
                    break
                    
                page += 1
                
            except Exception as e:
                self.logger.error(f"Error fetching products for collection {handle}, page {page}: {e}")
                break
        
        return mappings