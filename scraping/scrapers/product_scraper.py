"""
Product Scraper - Reduced polling with state tracking.
Uses metadata-first approach to only fetch changed products.
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
import time
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

from scrapers.base_scraper import BaseScraper
from config.schemas import ProductData
import config.settings as settings
from core.session_manager import SessionManager
from core.state_manager import StateManager
from core.rate_limiter import SmartRateLimiter


class ProductScraper(BaseScraper):
    """Product scraper - only scrapes what changed."""
    
    def __init__(self):
        super().__init__('products')
        self.max_pages = 3  # Reduced from 10+
        self.concurrent_pages = 2  # Reduced concurrency
        self.batch_size = 50  # Smaller batches
        
        # State tracking
        self.state_manager = StateManager()
        
        # Rate limiting
        self.min_shop_delay = 30  # Seconds between shops
        self.max_requests_per_shop = 30  # Reduced from 50+
        
        # Skip thresholds
        self.skip_shop_hours = 6  # Skip shops scraped in last 6 hours
        self.skip_product_hours = 24  # Skip individual products updated recently
    
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Scrape ONLY changed products for a single shop."""
        shop_id = shop_data.get('id')
        base_url = shop_data.get('url')
        
        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []
        
        # Check if we should skip this shop entirely
        if self.state_manager.should_skip_data_type(shop_id, 'products', self.skip_shop_hours):
            self.logger.info(f"Skipping products for {shop_id} - scraped recently")
            return []
        
        # Verify it's a Shopify store
        if not self.is_shopify_store(base_url, shop_id):
            self.logger.warning(f"Skipping products for non-Shopify store: {base_url}")
            return []
        
        self.logger.info(f"Starting product scrape for {shop_id}")
        start_time = time.time()
        
        try:
            # STEP 1: Fetch product metadata only (lightweight)
            product_metadata = self._fetch_product_metadata(base_url, shop_id)
            
            if not product_metadata:
                self.logger.info(f"No products found for {shop_id}")
                # Update state to avoid checking again soon
                self.state_manager.update_shop_state(shop_id, 'products', 0)
                return []
            
            # STEP 2: Identify changed products
            products_to_scrape = self._identify_changed_products(shop_id, product_metadata)
            
            if not products_to_scrape:
                self.logger.info(f"No changed products for {shop_id}")
                # Update state with current count
                self.state_manager.update_shop_state(shop_id, 'products', len(product_metadata))
                return []
            
            self.logger.info(
                f"{shop_id}: {len(products_to_scrape)}/{len(product_metadata)} products changed"
            )
            
            # STEP 3: Fetch full details only for changed products
            scraped_products = self._fetch_product_details(
                base_url, shop_id, products_to_scrape
            )
            
            # STEP 4: Update state
            self.state_manager.update_shop_state(
                shop_id, 'products', len(scraped_products), scraped_products
            )
            
            elapsed = time.time() - start_time
            self.logger.info(
                f"Completed {shop_id}: {len(scraped_products)} products in {elapsed:.1f}s "
                f"({len(products_to_scrape) - len(scraped_products)} failed)"
            )
            
            return scraped_products
            
        except Exception as e:
            self.logger.error(f"Error scraping {shop_id}: {e}")
            return []
    
    def _fetch_product_metadata(self, base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Fetch minimal product metadata (IDs, handles, updated_at)."""
        metadata = []
        page = 1
        empty_pages = 0
        session = SessionManager.get_session(shop_id)
        
        self.logger.debug(f"Fetching product metadata for {shop_id}")
        
        while True:
            if page > self.max_pages:
                break
            
            try:
                # Only request minimal fields - reduces response size significantly
                url = f"{base_url}/products.json?limit=50&page={page}&fields=id,handle,title,updated_at"
                
                response = session.get(url, timeout=15)
                self.rate_limiter.wait(shop_id, response)
                
                if response.status_code != 200:
                    self.logger.warning(f"Metadata fetch failed: {response.status_code}")
                    break
                
                data = self._safe_parse_json(response)
                if not data or "products" not in data:
                    break
                
                products = data["products"]
                if not products:
                    empty_pages += 1
                    if empty_pages >= 2:
                        break
                    page += 1
                    continue
                
                # Reset empty counter
                empty_pages = 0
                
                # Extract only what we need for change detection
                for product in products:
                    metadata.append({
                        'id': str(product.get('id', '')),
                        'handle': product.get('handle', ''),
                        'title': product.get('title', ''),
                        'updated_at': product.get('updated_at', ''),
                    })
                
                self.logger.debug(f"{shop_id}: Page {page} - {len(products)} products")
                
                # If we got fewer than limit, we're done
                if len(products) < 50:
                    break
                
                page += 1
                
                # Add delay between pages to be nice
                if page % 2 == 0:  # Every 2 pages
                    time.sleep(0.5)
                    
            except Exception as e:
                self.logger.error(f"Error fetching metadata page {page}: {e}")
                break
        
        return metadata
    
    def _identify_changed_products(self, shop_id: str, 
                                   metadata: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Identify which products have changed since last scrape."""
        changed = []
        now = datetime.now()
        
        for product in metadata:
            handle = product.get('handle')
            updated_at = product.get('updated_at')
            
            if not handle or not updated_at:
                continue
            
            # Check if product was recently updated
            try:
                # Parse updated_at timestamp
                updated_dt = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                hours_since_update = (now - updated_dt).total_seconds() / 3600
                
                # Skip products updated very recently (they'll be fresh)
                if hours_since_update < 1:  # Less than 1 hour ago
                    continue
            except:
                pass
            
            # Check if we've seen this product before and if it changed
            last_version = self.state_manager.get_item_version(shop_id, 'products', handle)
            last_updated = self.state_manager.get_item_updated_at(shop_id, 'products', handle)
            
            # If product is new OR updated_at changed OR no version hash
            if not last_version or last_updated != updated_at:
                # Create a hash of key metadata for comparison
                key_fields = {
                    'handle': handle,
                    'title': product.get('title'),
                    'updated_at': updated_at,
                }
                current_hash = hashlib.md5(
                    json.dumps(key_fields, sort_keys=True).encode()
                ).hexdigest()[:8]
                
                # Only scrape if hash is different or doesn't exist
                if not last_version or last_version != current_hash:
                    changed.append(product)
        
        return changed
    
    def _fetch_product_details(self, base_url: str, shop_id: str,
                               products_to_scrape: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Fetch full details for changed products with rate limiting."""
        scraped_products = []
        session = SessionManager.get_session(shop_id)
        request_count = 0
        failed_count = 0
        
        self.logger.info(f"Fetching {len(products_to_scrape)} changed products for {shop_id}")
        
        for i, product_info in enumerate(products_to_scrape):
            if request_count >= self.max_requests_per_shop:
                self.logger.warning(f"Hit max requests ({self.max_requests_per_shop}) for {shop_id}")
                break
            
            try:
                product_data = self._fetch_single_product(
                    base_url, shop_id, product_info['handle'], session
                )
                request_count += 1
                
                if product_data:
                    scraped_products.append(product_data)
                else:
                    failed_count += 1
                
                # Progress logging
                if (i + 1) % 10 == 0 or (i + 1) == len(products_to_scrape):
                    self.logger.info(
                        f"{shop_id}: {i+1}/{len(products_to_scrape)} products "
                        f"({len(scraped_products)} scraped, {failed_count} failed)"
                    )
                
                # Rate limiting between requests
                if i < len(products_to_scrape) - 1:
                    time.sleep(0.5)  # 500ms between requests
                    
            except Exception as e:
                self.logger.error(f"Error fetching product {product_info.get('handle')}: {e}")
                failed_count += 1
                # Continue with next product
        
        return scraped_products
    
    def _fetch_single_product(self, base_url: str, shop_id: str,
                              handle: str, session) -> Optional[Dict[str, Any]]:
        """Fetch full product details."""
        try:
            url = f"{base_url}/products/{handle}.json"
            
            response = session.get(url, timeout=20)
            self.rate_limiter.wait(shop_id, response)
            
            if response.status_code != 200:
                self.logger.debug(f"Failed to fetch product {handle}: {response.status_code}")
                return None
            
            data = self._safe_parse_json(response)
            if not data or "product" not in data:
                return None
            
            product = data["product"]
            
            # Convert to ProductData
            product_data = ProductData(
                shop_id=shop_id,
                scraped_at=datetime.now().isoformat(),
                id=str(product.get("id", "")),
                handle=product.get("handle", ""),
                title=product.get("title", ""),
                product_url=f"{base_url}/products/{handle}",
                description=product.get("body_html"),
                product_type=product.get("product_type"),
                vendor=product.get("vendor"),
                tags=product.get("tags", []),
                price=self._get_min_price(product.get("variants", [])),
                compare_at_price=self._get_min_compare_at_price(product.get("variants", [])),
                available=self._is_available(product.get("variants", [])),
                image_url=self._get_primary_image(product.get("images", [])),
                published_at=product.get("published_at"),
                updated_at=product.get("updated_at"),
                variants=product.get("variants", []),
                images=product.get("images", [])
            )
            
            return product_data.to_dict()
            
        except Exception as e:
            self.logger.debug(f"Error fetching product {handle}: {e}")
            return None
    
    # Keep helper methods from original
    def _get_min_price(self, variants: List[Dict]) -> Optional[float]:
        """Get minimum price from variants."""
        if not variants:
            return None
        
        prices = []
        for v in variants:
            if 'price' in v and v['price']:
                try:
                    prices.append(float(v['price']))
                except (ValueError, TypeError):
                    continue
        
        return min(prices) if prices else None
    
    def _get_min_compare_at_price(self, variants: List[Dict]) -> Optional[float]:
        """Get minimum compare_at_price from variants."""
        if not variants:
            return None
        
        prices = []
        for v in variants:
            if 'compare_at_price' in v and v['compare_at_price']:
                try:
                    prices.append(float(v['compare_at_price']))
                except (ValueError, TypeError):
                    continue
        
        return min(prices) if prices else None
    
    def _is_available(self, variants: List[Dict]) -> Optional[bool]:
        """Check if any variant is available."""
        if not variants:
            return None
        
        for v in variants:
            if v.get('available', False):
                return True
        
        return False
    
    def _get_primary_image(self, images: List[Dict]) -> Optional[str]:
        """Get primary image URL."""
        if not images:
            return None
        
        for img in images:
            if 'src' in img and img['src']:
                return img['src']
        
        return None
    
    def scrape_multiple(self, shops: List[Dict[str, Any]], 
                       max_workers: Optional[int] = None) -> Dict[str, List[Dict[str, Any]]]:
        """Scrape multiple shops with intelligent pacing using parent's concurrency."""
        # Use parent class's concurrent implementation for efficiency
        return super().scrape_multiple(shops, max_workers)
    
    def _scrape_multiple_sequential(self, shops: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Alternative sequential implementation with delays between shops."""
        results = {}
        
        if not shops:
            return results
        
        self.logger.info(f"Starting sequential product scrape for {len(shops)} shops")
        total_start = time.time()
        
        for i, shop in enumerate(shops):
            shop_id = shop.get('id') or f"shop_{i}"
            
            try:
                # Add delay between shops
                if i > 0:
                    delay = self.min_shop_delay
                    self.logger.debug(f"Waiting {delay}s before next shop...")
                    time.sleep(delay)
                
                # Scrape this shop
                products = self.scrape_single(shop)
                results[shop_id] = products
                
                # Progress logging
                elapsed = time.time() - total_start
                shops_done = i + 1
                avg_time = elapsed / shops_done if shops_done > 0 else 0
                remaining = len(shops) - shops_done
                eta = avg_time * remaining if remaining > 0 else 0
                
                total_products = sum(len(p) for p in results.values())
                
                self.logger.info(
                    f"Progress: {shops_done}/{len(shops)} shops, "
                    f"{total_products} products, "
                    f"ETA: {eta/60:.1f} min"
                )
                
            except Exception as e:
                self.logger.error(f"Error scraping {shop.get('url', 'unknown')}: {e}")
                results[shop_id] = []
        
        total_products = sum(len(p) for p in results.values())
        total_time = time.time() - total_start
        
        self.logger.info(
            f"Product scraping completed: {len(results)} shops, "
            f"{total_products} products, "
            f"time: {total_time/60:.1f} minutes"
        )
        
        return results