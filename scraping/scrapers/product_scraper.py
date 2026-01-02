"""
Scraper for products.
"""

from datetime import datetime
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed, Future
import time

from scrapers.base_scraper import BaseScraper
from config.schemas import ProductData
import config.settings as settings
from core.session_manager import SessionManager

class ProductScraper(BaseScraper):
    """Scraper for products."""
    
    def __init__(self):
        super().__init__('products')
        self.max_pages = settings.SCRAPER_CONFIG['max_pages']['products']
        self.concurrent_variants = settings.SCRAPER_CONFIG.get('concurrent_variants', 5)
        self.batch_size = settings.SCRAPER_CONFIG.get('batch_size', 250)
    
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
        
        self.logger.info(f"Starting product scrape for {shop_id} ({base_url})")
        
        # Use API-based scraping
        products = self._fetch_via_api_concurrent(base_url, shop_id)
        
        self.logger.info(f"Completed product scrape for {shop_id}: {len(products)} products")
        return products
    
    def _fetch_via_api_concurrent(self, base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Fetch products via Shopify API with concurrent page fetching."""
        all_products = []
        session = SessionManager.get_session(shop_id)
        
        # First, get total product count to estimate pages
        try:
            initial_url = f"{base_url}/products.json?limit=1"
            response = session.get(initial_url, timeout=settings.SCRAPER_CONFIG['request_timeout'])
            self.rate_limiter.wait(shop_id, response)
            
            if response.status_code == 200:
                data = self._safe_parse_json(response)
                if data and "products" in data:
                    # Estimate total pages
                    # Shopify doesn't give total count in this endpoint, but we can guess
                    pass
        except Exception as e:
            self.logger.debug(f"Could not get initial product count for {shop_id}: {e}")
        
        # Use concurrent page fetching
        return self._fetch_pages_concurrent(base_url, shop_id, session)
    
    def _fetch_pages_concurrent(self, base_url: str, shop_id: str, session) -> List[Dict[str, Any]]:
        """Fetch product pages concurrently."""
        all_products = []
        max_workers = min(3, self.max_pages or 3)  # Don't fetch too many pages concurrently
        
        self.logger.info(f"Fetching product pages for {shop_id} with {max_workers} workers")
        
        def fetch_page(page_num: int) -> List[Dict[str, Any]]:
            """Fetch a single page of products."""
            products = []
            try:
                url = f"{base_url}/products.json?limit={self.batch_size}&page={page_num}"
                
                start_time = time.time()
                response = session.get(url, timeout=settings.SCRAPER_CONFIG['request_timeout'])
                wait_time = self.rate_limiter.wait(shop_id, response)
                fetch_time = time.time() - start_time
                
                if response.status_code == 429:
                    self.logger.warning(f"Rate limited for {shop_id}, page {page_num}")
                    return []
                
                response.raise_for_status()
                data = self._safe_parse_json(response)
                if data is None:
                    self.logger.error(f"Failed to parse JSON for {shop_id}, page {page_num}")
                    return []
                
                if "products" not in data or not data["products"]:
                    return []
                
                # Process products in this page
                for product in data["products"]:
                    if handle := product.get("handle"):
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
                            price=None,
                            compare_at_price=None,
                            available=None,
                            image_url=None,
                            published_at=product.get("published_at"),
                            updated_at=product.get("updated_at"),
                            variants=product.get("variants", []),
                            images=product.get("images", [])
                        )
                        products.append(product_data.to_dict())
                
                self.logger.debug(
                    f"Page {page_num} for {shop_id}: {len(data['products'])} products "
                    f"(fetch: {fetch_time:.2f}s, wait: {wait_time:.2f}s)"
                )
                
            except Exception as e:
                self.logger.error(f"Error on page {page_num} for {shop_id}: {e}")
            
            return products
        
        # Try to fetch pages concurrently
        page = 1
        empty_pages = 0
        max_empty_pages = 2  # Stop after 2 consecutive empty pages
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            while True:
                if self.max_pages and page > self.max_pages:
                    break
                
                # Submit a batch of pages
                futures = []
                for _ in range(max_workers):
                    futures.append(executor.submit(fetch_page, page))
                    page += 1
                
                # Process results from this batch
                batch_products = 0
                for future in as_completed(futures):
                    try:
                        page_products = future.result()
                        if page_products:
                            all_products.extend(page_products)
                            batch_products += len(page_products)
                            empty_pages = 0  # Reset empty pages counter
                        else:
                            empty_pages += 1
                    except Exception as e:
                        self.logger.error(f"Error in page future: {e}")
                        empty_pages += 1
                
                # Log batch progress
                if batch_products > 0:
                    self.logger.info(
                        f"{shop_id}: Batch completed - {batch_products} products "
                        f"(Total: {len(all_products)})"
                    )
                
                # Check stopping conditions
                if empty_pages >= max_empty_pages:
                    self.logger.info(f"{shop_id}: Stopping - {empty_pages} consecutive empty pages")
                    break
                
                if len(all_products) >= 1000 and self.max_pages is None:
                    # Safety limit for very large stores
                    self.logger.info(f"{shop_id}: Reached safety limit of 1000 products")
                    break
        
        return all_products
    
    def _enrich_products_concurrent(self, products: List[Dict[str, Any]], base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Enrich products with additional data concurrently."""
        if not products or len(products) < 10:
            return products
        
        session = SessionManager.get_session(shop_id)
        enriched_products = []
        
        def enrich_product(product: Dict[str, Any]) -> Dict[str, Any]:
            """Fetch additional product details."""
            try:
                product_id = product.get('id')
                handle = product.get('handle')
                
                if not product_id or not handle:
                    return product
                
                # Fetch product details page for more data
                url = f"{base_url}/products/{handle}.json"
                
                response = session.get(url, timeout=settings.SCRAPER_CONFIG['request_timeout'])
                self.rate_limiter.wait(shop_id, response)
                
                if response.status_code == 200:
                    data = self._safe_parse_json(response)
                    if data and "product" in data:
                        # Update product with additional data
                        product_data = data["product"]
                        # Add any additional fields you need
                        # product['additional_data'] = ...
                        
                        # Log if we got more variants
                        if "variants" in product_data and len(product_data["variants"]) > len(product.get("variants", [])):
                            self.logger.debug(f"Enriched {handle}: {len(product_data['variants'])} variants")
                
                # Add a small delay to avoid overwhelming the shop
                time.sleep(0.1)
                
            except Exception as e:
                self.logger.debug(f"Could not enrich product {product.get('handle')}: {e}")
            
            return product
        
        # Use concurrent enrichment for larger product sets
        if len(products) > 50:
            self.logger.info(f"Enriching {len(products)} products for {shop_id} concurrently")
            
            with ThreadPoolExecutor(max_workers=self.concurrent_variants) as executor:
                future_to_product = {executor.submit(enrich_product, product): product for product in products}
                
                completed = 0
                for future in as_completed(future_to_product):
                    try:
                        enriched_products.append(future.result())
                        completed += 1
                        
                        if completed % 20 == 0:
                            self.logger.debug(f"Enrichment progress: {completed}/{len(products)}")
                            
                    except Exception as e:
                        self.logger.error(f"Error enriching product: {e}")
                        # Add the original product if enrichment fails
                        enriched_products.append(future_to_product[future])
        else:
            # For small sets, do it sequentially
            enriched_products = [enrich_product(p) for p in products]
        
        return enriched_products
    
    def scrape_multiple(self, shops: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Scrape products from multiple shops with intelligent concurrency."""
        results = {}
        
        if not shops:
            return results
        
        self.logger.info(f"Starting product scrape for {len(shops)} shops")
        start_time = time.time()
        
        # Group shops by size if we have that info, or by whether they're active
        # For now, process sequentially but with page-level concurrency
        for i, shop in enumerate(shops):
            try:
                shop_id = shop.get('id') or shop.get('url', f'shop_{i}')
                self.logger.info(f"Processing shop {i+1}/{len(shops)}: {shop_id}")
                
                # Add a small delay between shops to avoid rate limits
                if i > 0:
                    delay = 10  # 10 seconds between shops
                    self.logger.debug(f"Waiting {delay}s before next shop...")
                    time.sleep(delay)
                
                products = self.scrape_single(shop)
                results[shop_id] = products
                
                # Log progress
                elapsed = time.time() - start_time
                avg_time = elapsed / (i + 1)
                remaining = len(shops) - (i + 1)
                eta = avg_time * remaining if remaining > 0 else 0
                
                self.logger.info(
                    f"Progress: {i+1}/{len(shops)} shops, "
                    f"{len(products)} products, "
                    f"ETA: {eta/60:.1f} min"
                )
                
            except Exception as e:
                self.logger.error(f"Error scraping products for shop {shop.get('url')}: {e}")
                shop_id = shop.get('id') or shop.get('url', f'shop_{i}')
                results[shop_id] = []
        
        total_products = sum(len(p) for p in results.values())
        total_time = time.time() - start_time
        
        self.logger.info(
            f"Product scraping completed: {len(results)}/{len(shops)} shops, "
            f"{total_products} total products, "
            f"time: {total_time/60:.1f} minutes"
        )
        
        return results