"""
Collection-Products Scraper - Minimal polling with state tracking.
Collection-product mappings change even less often than products.
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
import time
import hashlib
import json

from scrapers.base_scraper import BaseScraper
from config.schemas import CollectionProductMapping
from core.session_manager import SessionManager
from core.state_manager import StateManager


class CollectionProductsScraper(BaseScraper):
    """Scraper for collection-to-product relationships."""
    
    def __init__(self, collections_data: Optional[Dict[str, List[Dict]]] = None):
        super().__init__('collection_products')
        # Normalize keys to strings
        self.collections_data = {str(k): v for k, v in (collections_data or {}).items()}
        
        # State tracking
        self.state_manager = StateManager()
        
        # Rate limiting - be very conservative
        self.min_shop_delay = 15  # 15 seconds between shops
        self.max_requests_per_shop = 20
        self.concurrent_collections = 2
        
        # Skip thresholds - mappings change rarely
        self.skip_shop_days = 14  # Skip shops scraped in last 14 days
        self.min_collection_size = 5  # Only scrape collections with at least 5 products
    
    def set_collections_data(self, collections_data: Dict[str, List[Dict]]):
        """Set collections data to map against."""
        self.collections_data = {str(k): v for k, v in (collections_data or {}).items()}
    
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Scrape collection-product relationships only if needed."""
        shop_id = shop_data.get('id')
        base_url = shop_data.get('url')
        
        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []
        
        sid = str(shop_id)
        
        # Check if we should skip this shop
        if self.state_manager.should_skip_data_type(sid, 'collection_products', self.skip_shop_days * 24):
            self.logger.info(f"Skipping collection-products for {sid} - scraped recently")
            return []
        
        # Check if we have collections data
        if sid not in self.collections_data or not self.collections_data[sid]:
            self.logger.warning(f"No collections data available for {sid}")
            return []
        
        self.logger.info(f"Starting collection-products scrape for {sid}")
        
        try:
            # Filter collections to only scrape meaningful ones
            collections_to_scrape = self._filter_collections(sid, self.collections_data[sid])
            
            if not collections_to_scrape:
                self.logger.info(f"No collections to scrape for {sid}")
                # Update state to avoid checking again soon
                self.state_manager.update_shop_state(sid, 'collection_products', 0)
                return []
            
            # Fetch mappings with conservative pacing
            mappings = self._fetch_mappings_conservative(
                base_url, sid, collections_to_scrape
            )
            
            # Update state
            if mappings:
                self.state_manager.update_shop_state(sid, 'collection_products', len(mappings), mappings)
            
            self.logger.info(f"Completed: {len(mappings)} mappings for {sid}")
            return mappings
            
        except Exception as e:
            self.logger.error(f"Error scraping collection-products for {sid}: {e}")
            return []
    
    def _filter_collections(self, shop_id: str, collections: List[Dict]) -> List[Dict]:
        """Filter collections to only scrape meaningful ones."""
        filtered = []
        
        # Get existing collection-product mappings from state
        state = self.state_manager.get_shop_state(shop_id)
        cp_state = state.get('collection_products', {})
        existing_hashes = cp_state.get('collection_hashes', {})
        
        for collection in collections:
            handle = collection.get('handle')
            collection_id = str(collection.get('id', ''))
            products_count = collection.get('products_count')
            
            if not handle or not collection_id:
                continue
            
            # Skip collections with very few products (often system collections)
            if products_count is not None and products_count < self.min_collection_size:
                self.logger.debug(f"Skipping small collection {handle} ({products_count} products)")
                continue
            
            # Create a hash of collection metadata for change detection
            collection_hash = self._create_collection_hash(collection)
            
            # Check if we've scraped this collection recently and it hasn't changed
            last_hash = existing_hashes.get(collection_id)
            if last_hash and last_hash == collection_hash:
                self.logger.debug(f"Skipping unchanged collection {handle}")
                continue
            
            filtered.append({
                'collection': collection,
                'hash': collection_hash
            })
        
        self.logger.info(f"Filtered to {len(filtered)}/{len(collections)} collections for {shop_id}")
        return filtered
    
    def _create_collection_hash(self, collection: Dict) -> str:
        """Create a hash of collection metadata for change detection."""
        key_fields = {
            'id': str(collection.get('id', '')),
            'handle': collection.get('handle', ''),
            'title': collection.get('title', ''),
            'products_count': collection.get('products_count'),
            'updated_at': collection.get('updated_at', ''),
        }
        return hashlib.md5(
            json.dumps(key_fields, sort_keys=True).encode()
        ).hexdigest()[:8]
    
    def _fetch_mappings_conservative(self, base_url: str, shop_id: str,
                                     collections_info: List[Dict]) -> List[Dict[str, Any]]:
        """Fetch collection-product mappings with very conservative pacing."""
        all_mappings = []
        session = SessionManager.get_session(shop_id)
        request_count = 0
        
        self.logger.info(f"Fetching mappings for {len(collections_info)} collections for {shop_id}")
        
        for i, info in enumerate(collections_info):
            collection = info['collection']
            collection_hash = info['hash']
            handle = collection.get('handle')
            collection_id = str(collection.get('id', ''))
            
            if request_count >= self.max_requests_per_shop:
                self.logger.warning(f"Hit max requests ({self.max_requests_per_shop}) for {shop_id}")
                break
            
            try:
                # Fetch products for this collection
                collection_mappings = self._fetch_collection_products(
                    base_url, shop_id, collection_id, handle, session
                )
                request_count += 1
                
                if collection_mappings:
                    all_mappings.extend(collection_mappings)
                    
                    # Store collection hash for future reference
                    state = self.state_manager.get_shop_state(shop_id)
                    cp_state = state.get('collection_products', {})
                    collection_hashes = cp_state.get('collection_hashes', {})
                    collection_hashes[collection_id] = collection_hash
                    cp_state['collection_hashes'] = collection_hashes
                    state['collection_products'] = cp_state
                    
                    # Save state periodically
                    if (i + 1) % 5 == 0:
                        self.state_manager.update_shop_state(shop_id, 'collection_products', len(all_mappings))
                
                # Progress logging
                if (i + 1) % 5 == 0 or (i + 1) == len(collections_info):
                    self.logger.info(
                        f"{shop_id}: {i+1}/{len(collections_info)} collections, "
                        f"{len(all_mappings)} mappings"
                    )
                
                # Conservative delay between collections
                if i < len(collections_info) - 1:
                    time.sleep(2)  # 2 seconds between collections
                    
            except Exception as e:
                self.logger.error(f"Error fetching collection {handle}: {e}")
                # Continue with next collection
        
        return all_mappings
    
    def _fetch_collection_products(self, base_url: str, shop_id: str,
                                   collection_id: str, handle: str, 
                                   session) -> List[Dict[str, Any]]:
        """Fetch products for a single collection."""
        mappings = []
        page = 1
        empty_pages = 0
        max_empty_pages = 2
        
        while True:
            if page > 3:  # Max 3 pages per collection (150 products)
                break
            
            try:
                url = f"{base_url}/collections/{handle}/products.json?limit=50&page={page}"
                
                response = session.get(url, timeout=20)
                self.rate_limiter.wait(shop_id, response)
                
                if response.status_code == 404:
                    # Collection doesn't exist or has no products
                    break
                
                if response.status_code != 200:
                    self.logger.warning(f"Failed to fetch collection {handle} page {page}: {response.status_code}")
                    break
                
                data = self._safe_parse_json(response)
                if not data or "products" not in data:
                    break
                
                products = data["products"]
                if not products:
                    empty_pages += 1
                    if empty_pages >= max_empty_pages:
                        break
                    page += 1
                    continue
                
                # Reset empty counter
                empty_pages = 0
                
                # Process products in this page
                for idx, product in enumerate(products):
                    if product_id := product.get("id"):
                        mapping = CollectionProductMapping(
                            shop_id=shop_id,
                            scraped_at=datetime.now().isoformat(),
                            collection_id=collection_id,
                            product_id=str(product_id),
                            position=idx + 1,
                            added_at=product.get("created_at")
                        )
                        mappings.append(mapping.to_dict())
                
                self.logger.debug(f"Collection {handle}: page {page} - {len(products)} products")
                
                # If we got fewer than limit, we're done
                if len(products) < 50:
                    break
                
                page += 1
                
                # Add delay between pages
                time.sleep(0.5)
                
            except Exception as e:
                self.logger.error(f"Error fetching collection {handle} page {page}: {e}")
                break
        
        return mappings
    
    def scrape_multiple(self, shops: List[Dict[str, Any]], max_workers: Optional[int] = 5) -> Dict[str, List[Dict[str, Any]]]:
        """Scrape collection-product mappings with very conservative pacing."""
        results = {}
        
        if not shops:
            return results
        
        self.logger.info(f"Starting collection-product mapping scrape for {len(shops)} shops")
        total_start = time.time()
        
        # Process shops with generous delays
        for i, shop in enumerate(shops):
            shop_id = shop.get('id') or f"shop_{i}"
            sid = str(shop_id)
            
            try:
                # Add generous delay between shops
                if i > 0:
                    delay = self.min_shop_delay
                    self.logger.debug(f"Waiting {delay}s before next shop...")
                    time.sleep(delay)
                
                # Scrape this shop
                mappings = self.scrape_single(shop)
                results[sid] = mappings
                
                # Progress logging
                elapsed = time.time() - total_start
                shops_done = i + 1
                avg_time = elapsed / shops_done if shops_done > 0 else 0
                remaining = len(shops) - shops_done
                eta = avg_time * remaining if remaining > 0 else 0
                
                total_mappings = sum(len(m) for m in results.values())
                
                self.logger.info(
                    f"Progress: {shops_done}/{len(shops)} shops, "
                    f"{total_mappings} mappings, "
                    f"ETA: {eta/60:.1f} min"
                )
                
            except Exception as e:
                self.logger.error(f"Error scraping {shop.get('url', 'unknown')}: {e}")
                results[sid] = []
        
        total_mappings = sum(len(m) for m in results.values())
        total_time = time.time() - total_start
        
        self.logger.info(
            f"Collection-product mapping completed: {len(results)} shops, "
            f"{total_mappings} mappings, "
            f"time: {total_time/60:.1f} minutes"
        )
        
        return results