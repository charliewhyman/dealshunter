"""
Collection Scraper - Minimal polling with robust 429 handling.
Collections change rarely, so we scrape them less frequently.
"""
from datetime import datetime
from typing import List, Dict, Any, Optional
import time
from bs4 import BeautifulSoup

from scrapers.base_scraper import BaseScraper
from config.schemas import CollectionData
from core.session_manager import SessionManager
from core.state_manager import StateManager


class CollectionScraper(BaseScraper):
    """Collection scraper - only scrapes when needed."""
    
    def __init__(self):
        super().__init__('collections')
        self.max_pages = None  # No limit - fetch all collections
        self.concurrent_pages = 1  # No concurrency needed
        
        # State tracking
        self.state_manager = StateManager()
        
        # Rate limiting
        self.min_shop_delay = 10
        self.max_requests_per_shop = 50  # Increased from 10 to ensure we get all collections
        
        # Skip thresholds (collections change rarely)
        self.skip_shop_days = 7  # Skip shops scraped in last 7 days
        
        # Retry settings for 429 errors
        self.max_429_retries = 3
        self.retry_delay_multiplier = 2
    
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Scrape collections only if needed."""
        shop_id = shop_data.get('id')
        base_url = shop_data.get('url')
        
        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []
        
        # Check if we should skip this shop (collections change rarely)
        if self.state_manager.should_skip_data_type(shop_id, 'collections', self.skip_shop_days * 24):
            self.logger.info(f"Skipping collections for {shop_id} - scraped recently")
            return []
        
        # Verify it's a Shopify store
        if not self.is_shopify_store(base_url, shop_id):
            self.logger.warning(f"Skipping collections for non-Shopify store: {base_url}")
            return []
        
        self.logger.info(f"Starting collection scrape for {shop_id}")
        
        try:
            # Try API first
            collections = self._fetch_via_api_simple(base_url, shop_id)
            
            # If no collections via API, try one HTML fallback
            if not collections:
                self.logger.debug(f"No collections via API for {shop_id}, trying HTML")
                collections = self._fetch_via_html_minimal(base_url, shop_id)
            
            # Update state
            if collections:
                self.state_manager.update_shop_state(shop_id, 'collections', len(collections), collections)
            
            self.logger.info(f"Completed: {len(collections)} collections for {shop_id}")
            return collections
            
        except Exception as e:
            self.logger.error(f"Error scraping collections for {shop_id}: {e}")
            return []
    
    def _fetch_page_with_retry(self, session, url: str, shop_id: str, page: int) -> Optional[Dict]:
        """Fetch a page with retry logic for 429 errors."""
        retry_count = 0
        
        while retry_count <= self.max_429_retries:
            try:
                # Proactive wait before request
                self.rate_limiter.wait_before_request(shop_id)
                
                response = session.get(url, timeout=15)
                
                # Handle 429 specifically
                if response.status_code == 429:
                    # Let rate limiter handle backoff
                    wait_time = self.rate_limiter.wait(shop_id, response)
                    
                    if retry_count < self.max_429_retries:
                        retry_count += 1
                        self.logger.warning(
                            f"Collections page {page} got 429, retry {retry_count}/{self.max_429_retries} "
                            f"after {wait_time:.1f}s wait"
                        )
                        continue  # Retry same page
                    else:
                        self.logger.error(
                            f"Collections page {page} failed after {self.max_429_retries} retries due to 429"
                        )
                        return None
                
                # Normal rate limiting for non-429 responses
                self.rate_limiter.wait(shop_id, response)
                
                # Handle other non-200 status codes
                if response.status_code != 200:
                    self.logger.debug(f"Page {page} returned status {response.status_code}")
                    return None
                
                # Success - parse and return
                data = self._safe_parse_json(response)
                return data
                
            except Exception as e:
                self.logger.error(f"Error fetching collections page {page}: {e}")
                if retry_count < self.max_429_retries:
                    retry_count += 1
                    time.sleep(2 * retry_count)  # Linear backoff for errors
                else:
                    return None
        
        return None
    
    def _fetch_via_api_simple(self, base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Fetch all collections via API - no page limits."""
        collections = []
        session = SessionManager.get_session(shop_id)
        request_count = 0
        
        # Quick API test with retry logic
        test_url = f"{base_url}/collections.json?limit=1"
        test_data = self._fetch_page_with_retry(session, test_url, shop_id, 0)
        request_count += 1
        
        if test_data is None:
            # Could be 404 or other error
            try:
                # One more try without retry wrapper to check for 404
                self.rate_limiter.wait_before_request(shop_id)
                response = session.get(test_url, timeout=10)
                self.rate_limiter.wait(shop_id, response)
                if response.status_code == 404:
                    return []
            except:
                pass
            return []
        
        # Fetch all pages until we run out
        page = 1
        empty_pages = 0
        max_empty_pages = 2
        failed_pages = 0
        
        while True:
            # Check if we're approaching the limit
            if request_count >= self.max_requests_per_shop:
                self.logger.warning(
                    f"Hit max requests ({self.max_requests_per_shop}) for {shop_id}. "
                    f"Got {len(collections)} collections so far. "
                    f"Increase max_requests_per_shop if more collections exist."
                )
                break
            
            url = f"{base_url}/collections.json?limit=50&page={page}"
            
            data = self._fetch_page_with_retry(session, url, shop_id, page)
            request_count += 1
            
            if data is None:
                failed_pages += 1
                if failed_pages >= 3:
                    self.logger.error(f"Too many failed pages ({failed_pages}), stopping")
                    break
                page += 1
                continue
            
            # Reset failed counter on success
            failed_pages = 0
            
            if "collections" not in data:
                break
            
            page_collections = data["collections"]
            if not page_collections:
                empty_pages += 1
                if empty_pages >= max_empty_pages:
                    self.logger.debug(f"Got {empty_pages} empty pages, stopping")
                    break
                page += 1
                continue
            
            # Reset empty counter
            empty_pages = 0
            
            for coll in page_collections:
                if handle := coll.get("handle"):
                    # Skip system collections
                    if handle in ['all', 'frontpage', 'best-selling', 'featured']:
                        continue
                    
                    collection = CollectionData(
                        shop_id=shop_id,
                        scraped_at=datetime.now().isoformat(),
                        id=str(coll.get("id", "")),
                        handle=handle,
                        title=coll.get("title", ""),
                        collection_url=f"{base_url}/collections/{handle}",
                        description=coll.get("description"),
                        products_count=coll.get("products_count"),
                        published_at=coll.get("published_at"),
                        updated_at=coll.get("updated_at")
                    )
                    collections.append(collection.to_dict())
            
            self.logger.debug(f"{shop_id}: Page {page} - {len(page_collections)} collections")
            
            # If we got fewer than limit, we're done
            if len(page_collections) < 50:
                self.logger.debug(f"Page {page} returned {len(page_collections)} < 50, finishing")
                break
                
            page += 1
            
            # Small delay between pages (in addition to rate limiter)
            time.sleep(0.5)
        
        self.logger.info(f"{shop_id}: Fetched {len(collections)} collections using {request_count} requests")
        return collections
    
    def _fetch_via_html_minimal(self, base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Minimal HTML fallback - just check main page."""
        session = SessionManager.get_session(shop_id)
        collections = []
        seen_handles = set()
        
        # Only check homepage and collections page
        urls_to_check = [
            f"{base_url}",
            f"{base_url}/collections",
        ]
        
        for url in urls_to_check:
            retry_count = 0
            while retry_count <= self.max_429_retries:
                try:
                    # Proactive wait
                    self.rate_limiter.wait_before_request(shop_id)
                    
                    response = session.get(url, timeout=10)
                    
                    # Handle 429
                    if response.status_code == 429:
                        wait_time = self.rate_limiter.wait(shop_id, response)
                        if retry_count < self.max_429_retries:
                            retry_count += 1
                            self.logger.warning(f"HTML fetch got 429, retry {retry_count}/{self.max_429_retries}")
                            continue
                        else:
                            break
                    
                    self.rate_limiter.wait(shop_id, response)
                    
                    if response.status_code != 200:
                        break
                    
                    soup = BeautifulSoup(response.text, 'html.parser')
                    
                    # Look for collection links in navigation
                    nav_links = soup.select("nav a[href*='/collections/'], .header a[href*='/collections/']")
                    
                    for link in nav_links:
                        href = link.get('href')
                        if not href:
                            continue
                        
                        # Convert to string immediately
                        href = str(href)
                        
                        if '/products/' in href:
                            continue
                        
                        # Extract handle
                        if '/collections/' in href:
                            parts = href.split('/collections/')
                            if len(parts) >= 2:
                                handle = parts[-1].split('?')[0].strip('/')
                                
                                if handle and handle not in ['all', 'frontpage'] and handle not in seen_handles:
                                    seen_handles.add(handle)
                                    
                                    # Properly extract title from BeautifulSoup element
                                    title_attr = link.get('title')
                                    title = (str(title_attr) if title_attr else '') or link.get_text(strip=True) or handle.replace('-', ' ').title()
                                    
                                    collection = CollectionData(
                                        shop_id=shop_id,
                                        scraped_at=datetime.now().isoformat(),
                                        id=f"html_{handle}",
                                        handle=handle,
                                        title=title,
                                        collection_url=f"{base_url}/collections/{handle}",
                                        description=None,
                                        products_count=None,
                                        published_at=None,
                                        updated_at=None
                                    )
                                    collections.append(collection.to_dict())
                    
                    # Success - exit retry loop
                    break
                    
                except Exception as e:
                    self.logger.debug(f"HTML fetch failed for {url}: {e}")
                    if retry_count < self.max_429_retries:
                        retry_count += 1
                        time.sleep(2 * retry_count)
                    else:
                        break
            
            if collections:
                self.logger.info(f"{shop_id}: Found {len(collections)} collections via HTML")
                break
        
        return collections
    
    def scrape_multiple(self, shops: List[Dict[str, Any]], 
                       max_workers: Optional[int] = None) -> Dict[str, List[Dict[str, Any]]]:
        """Scrape multiple shops with intelligent pacing."""
        # Use parent class's concurrent implementation for efficiency
        # This handles thread pooling and error handling properly
        return super().scrape_multiple(shops, max_workers)
    
    def _scrape_multiple_sequential(self, shops: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Alternative sequential implementation with delays between shops."""
        results = {}
        
        if not shops:
            return results
        
        self.logger.info(f"Starting sequential collection scrape for {len(shops)} shops")
        
        # Collections change rarely, so we can be even slower
        for i, shop in enumerate(shops):
            shop_id = shop.get('id') or f"shop_{i}"
            
            try:
                # Longer delay for collections
                if i > 0:
                    time.sleep(15)  # 15 seconds between shops
                
                collections = self.scrape_single(shop)
                results[shop_id] = collections
                
                self.logger.info(
                    f"Progress: {i+1}/{len(shops)} shops, "
                    f"{len(collections)} collections"
                )
                
            except Exception as e:
                self.logger.error(f"Error scraping {shop.get('url', 'unknown')}: {e}")
                results[shop_id] = []
        
        total_collections = sum(len(c) for c in results.values())
        self.logger.info(f"Collection scraping completed: {total_collections} total collections")
        
        return results