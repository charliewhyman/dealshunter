"""
Scraper for products.
"""

from datetime import datetime
from typing import List, Dict, Any

from scrapers.base_scraper import BaseScraper
from config.schemas import ProductData
import config.settings as settings
from core.session_manager import SessionManager

class ProductScraper(BaseScraper):
    """Scraper for products."""
    
    def __init__(self):
        super().__init__('products')
        self.max_pages = settings.SCRAPER_CONFIG['max_pages']['products']
    
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Scrape products for a single shop."""
        shop_id = shop_data.get('id')
        base_url = shop_data.get('url')
        
        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []
        
        # Verify it's a Shopify store
        if not self.is_shopify_store(base_url, shop_id):
            self.logger.warning(f"Skipping products for non-Shopify store: {base_url}")
            return []
        
        products = self._fetch_via_api(base_url, shop_id)
        return products
    
    def _fetch_via_api(self, base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Fetch products via Shopify API."""
        products = []
        page = 1
        session = SessionManager.get_session(shop_id)
        
        while True:
            url = f"{base_url}/products.json?limit={settings.SCRAPER_CONFIG['batch_size']}&page={page}"
            
            try:
                response = session.get(url, timeout=settings.SCRAPER_CONFIG['request_timeout'])
                wait_time = self.rate_limiter.wait(shop_id, response)
                
                if response.status_code == 429:
                    self.logger.warning(f"Rate limited for {shop_id}, page {page}")
                    continue
                
                response.raise_for_status()
                data = self._safe_parse_json(response)
                if data is None:
                    raise ValueError('Failed to parse JSON response')
                
                if "products" not in data or not data["products"]:
                    break
                
                for product in data["products"]:
                    if handle := product.get("handle"):
                        # Get first image if available
                        image_url = None
                        if product.get("images") and len(product["images"]) > 0:
                            image_url = product["images"][0].get("src")
                        
                        # Get variants for pricing
                        variants = product.get("variants", [])
                        price = None
                        compare_at_price = None
                        available = False
                        
                        if variants:
                            first_variant = variants[0]
                            price = first_variant.get("price")
                            compare_at_price = first_variant.get("compare_at_price")
                            available = first_variant.get("available", False)
                        
                        product_data = ProductData(
                            shop_id=shop_id,
                            scraped_at=datetime.now().isoformat(),
                            id=str(product.get("id", "")),
                            handle=handle,
                            title=product.get("title", ""),
                            product_url=f"{base_url}/products/{handle}",
                            description=product.get("body_html"),
                            product_type=product.get("product_type"),
                            vendor=product.get("vendor"),
                            tags=product.get("tags", []),
                            price=price,
                            compare_at_price=compare_at_price,
                            available=available,
                            image_url=image_url,
                            published_at=product.get("published_at"),
                            updated_at=product.get("updated_at")
                        )
                        products.append(product_data.to_dict())
                
                self.logger.info(f"Page {page}: {len(data['products'])} products for {shop_id}")
                
                if self.max_pages and page >= self.max_pages:
                    break
                    
                page += 1
                
            except Exception as e:
                self.logger.error(f"Error on page {page} for {shop_id}: {e}")
                break
        
        return products