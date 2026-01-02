"""
Scraper for collection-to-product mapping.
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed, ThreadPoolExecutor
import time
import asyncio

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
        self.concurrent_collections = settings.SCRAPER_CONFIG.get('concurrent_collections', 3)
        self.batch_size = settings.SCRAPER_CONFIG.get('batch_size', 250)
    
    def set_collections_data(self, collections_data: Dict[str, List[Dict]]):
        """Set collections data to map against."""
        # Normalize keys to strings so lookups are consistent regardless of id type
        self.collections_data = {str(k): v for k, v in (collections_data or {}).items()}
    
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Scrape collection-product relationships for a single shop with concurrency."""
        shop_id = shop_data.get('id')
        base_url = shop_data.get('url')
        
        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []
        
        sid = str(shop_id)
        if sid not in self.collections_data or not self.collections_data[sid]:
            self.logger.warning(f"No collections data available for {shop_id}")
            return []
        
        self.logger.info(f"Starting collection-products scrape for {shop_id}")
        
        # Fetch mappings concurrently across collections
        mappings = self._fetch_collection_products_concurrent(
            base_url, sid, self.collections_data[sid]
        )
        
        self.logger.info(f"Completed collection-products for {shop_id}: {len(mappings)} mappings")
        return mappings
    
    def _fetch_collection_products_concurrent(self, base_url: str, shop_id: str, 
                                            collections: List[Dict]) -> List[Dict[str, Any]]:
        """Fetch collection-product mappings concurrently across multiple collections."""
        all_mappings = []
        session = SessionManager.get_session(shop_id)
        
        def fetch_collection(collection: Dict) -> List[Dict[str, Any]]:
            """Fetch products for a single collection."""
            collection_id = collection.get('id')
            handle = collection.get('handle')
            
            if not handle or collection_id is None:
                self.logger.debug(f"Skipping collection with missing id/handle: {collection}")
                return []
            
            collection_id_str = str(collection_id)
            
            try:
                mappings = self._fetch_collection_pages_concurrent(
                    base_url, shop_id, collection_id_str, handle, session
                )
                
                self.logger.debug(
                    f"Collection {handle}: {len(mappings)} product mappings"
                )
                
                return mappings
                
            except Exception as e:
                self.logger.error(f"Error fetching collection {handle}: {e}")
                return []
        
        # Use concurrent collection fetching
        max_workers = min(self.concurrent_collections, len(collections))
        
        self.logger.info(
            f"Fetching {len(collections)} collections for {shop_id} "
            f"with {max_workers} concurrent workers"
        )
        
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all collection fetching tasks
            future_to_collection = {
                executor.submit(fetch_collection, collection): collection 
                for collection in collections
            }
            
            completed = 0
            for future in as_completed(future_to_collection):
                try:
                    collection_mappings = future.result()
                    if collection_mappings:
                        all_mappings.extend(collection_mappings)
                    
                    completed += 1
                    
                    # Log progress every 5 collections or at the end
                    if completed % 5 == 0 or completed == len(collections):
                        elapsed = time.time() - start_time
                        collections_per_sec = completed / elapsed if elapsed > 0 else 0
                        remaining = len(collections) - completed
                        eta = remaining / collections_per_sec if collections_per_sec > 0 else 0
                        
                        self.logger.info(
                            f"Progress: {completed}/{len(collections)} collections, "
                            f"{len(all_mappings)} mappings, "
                            f"ETA: {eta/60:.1f} min"
                        )
                        
                except Exception as e:
                    self.logger.error(f"Error in collection future: {e}")
                    completed += 1
        
        elapsed = time.time() - start_time
        self.logger.info(
            f"Completed {len(collections)} collections in {elapsed:.1f}s: "
            f"{len(all_mappings)} total mappings"
        )
        
        return all_mappings
    
    def _fetch_collection_pages_concurrent(self, base_url: str, shop_id: str, 
                                          collection_id: str, handle: str, 
                                          session) -> List[Dict[str, Any]]:
        """Fetch collection product pages concurrently."""
        mappings = []
        
        def fetch_page(page_num: int) -> List[Dict[str, Any]]:
            """Fetch a single page of collection products."""
            page_mappings = []
            try:
                url = f"{base_url}/collections/{handle}/products.json?limit={self.batch_size}&page={page_num}"
                
                start_time = time.time()
                response = session.get(url, timeout=settings.SCRAPER_CONFIG['request_timeout'])
                wait_time = self.rate_limiter.wait(shop_id, response)
                fetch_time = time.time() - start_time
                
                if response.status_code == 429:
                    self.logger.warning(f"Rate limited for collection {handle}, page {page_num}")
                    return []
                
                if response.status_code == 404:
                    # Collection might not exist or have products
                    return []
                
                response.raise_for_status()
                data = self._safe_parse_json(response)
                if data is None:
                    self.logger.error(f"Failed to parse JSON for collection {handle}, page {page_num}")
                    return []
                
                if "products" not in data or not data["products"]:
                    return []
                
                # Process products in this page
                for idx, product in enumerate(data["products"]):
                    if product_id := product.get("id"):
                        mapping = CollectionProductMapping(
                            shop_id=shop_id,
                            scraped_at=datetime.now().isoformat(),
                            collection_id=collection_id,
                            product_id=str(product_id),
                            position=idx + 1,
                            added_at=product.get("created_at")
                        )
                        page_mappings.append(mapping.to_dict())
                
                self.logger.debug(
                    f"Collection {handle}: page {page_num} - {len(data['products'])} products "
                    f"(fetch: {fetch_time:.2f}s, wait: {wait_time:.2f}s)"
                )
                
            except Exception as e:
                self.logger.error(f"Error fetching collection {handle}, page {page_num}: {e}")
            
            return page_mappings
        
        # Fetch pages with limited concurrency
        max_page_workers = 2  # Lower concurrency for collection pages to avoid rate limits
        page = 1
        empty_pages = 0
        max_empty_pages = 2
        
        with ThreadPoolExecutor(max_workers=max_page_workers) as executor:
            while True:
                if self.max_pages and page > self.max_pages:
                    break
                
                # Submit a small batch of pages
                futures = []
                for _ in range(max_page_workers):
                    futures.append(executor.submit(fetch_page, page))
                    page += 1
                
                # Process results from this batch
                batch_mappings = 0
                for future in as_completed(futures):
                    try:
                        page_mappings = future.result()
                        if page_mappings:
                            mappings.extend(page_mappings)
                            batch_mappings += len(page_mappings)
                            empty_pages = 0
                        else:
                            empty_pages += 1
                    except Exception as e:
                        self.logger.error(f"Error in page future for collection {handle}: {e}")
                        empty_pages += 1
                
                # Check stopping conditions
                if empty_pages >= max_empty_pages:
                    self.logger.debug(f"Collection {handle}: Stopping - {empty_pages} empty pages")
                    break
                
                if batch_mappings == 0 and empty_pages >= max_empty_pages:
                    break
        
        return mappings
    
    def scrape_multiple(self, shops: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Scrape collection-product mappings from multiple shops."""
        results = {}
        
        if not shops:
            return results
        
        self.logger.info(f"Starting collection-product mapping scrape for {len(shops)} shops")
        start_time = time.time()
        
        # Process shops sequentially (collections within shops are concurrent)
        for i, shop in enumerate(shops):
            try:
                shop_id = shop.get('id') or shop.get('url', f'shop_{i}')
                self.logger.info(f"Processing shop {i+1}/{len(shops)}: {shop_id}")
                
                # Check if this shop has collections data
                sid = str(shop_id)
                if sid not in self.collections_data or not self.collections_data[sid]:
                    self.logger.warning(f"No collections data for {shop_id}, skipping")
                    results[shop_id] = []
                    continue
                
                # Add a small delay between shops to avoid rate limits
                if i > 0:
                    delay = 8  # 8 seconds between shops for collection-products
                    self.logger.debug(f"Waiting {delay}s before next shop...")
                    time.sleep(delay)
                
                mappings = self.scrape_single(shop)
                results[shop_id] = mappings
                
                # Log progress
                elapsed = time.time() - start_time
                avg_time = elapsed / (i + 1)
                remaining = len(shops) - (i + 1)
                eta = avg_time * remaining if remaining > 0 else 0
                
                self.logger.info(
                    f"Progress: {i+1}/{len(shops)} shops, "
                    f"{len(mappings)} mappings, "
                    f"ETA: {eta/60:.1f} min"
                )
                
            except Exception as e:
                self.logger.error(f"Error scraping collection-products for shop {shop.get('url')}: {e}")
                shop_id = shop.get('id') or shop.get('url', f'shop_{i}')
                results[shop_id] = []
        
        total_mappings = sum(len(m) for m in results.values())
        total_time = time.time() - start_time
        
        self.logger.info(
            f"Collection-product mapping completed: {len(results)}/{len(shops)} shops, "
            f"{total_mappings} total mappings, "
            f"time: {total_time/60:.1f} minutes"
        )
        
        return results