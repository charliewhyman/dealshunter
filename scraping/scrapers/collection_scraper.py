"""
Scraper for collections.
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
from bs4 import BeautifulSoup

from scrapers.base_scraper import BaseScraper
from config.schemas import CollectionData
import config.settings as settings
from core.session_manager import SessionManager

class CollectionScraper(BaseScraper):
    """Scraper for collections."""
    
    def __init__(self):
        super().__init__('collections')
        self.max_pages = settings.SCRAPER_CONFIG['max_pages']['collections']
        self.concurrent_pages = settings.SCRAPER_CONFIG.get('concurrent_pages', 3)
        self.batch_size = settings.SCRAPER_CONFIG.get('batch_size', 250)
    
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Scrape collections for a single shop with concurrency."""
        shop_id = shop_data.get('id')
        base_url = shop_data.get('url')
        
        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []
        
        # Verify it's a Shopify store
        if not self.is_shopify_store(base_url, shop_id):
            self.logger.warning(f"Skipping collections for non-Shopify store: {base_url}")
            return []
        
        self.logger.info(f"Starting collection scrape for {shop_id} ({base_url})")
        
        # Try API with concurrency first (faster)
        collections = self._fetch_via_api_concurrent(base_url, shop_id)
        
        # Fallback to HTML if API returns nothing or very few collections
        if not collections or len(collections) < 5:
            self.logger.info(f"API returned {len(collections)} collections, trying HTML fallback...")
            html_collections = self._fetch_via_html(base_url, shop_id)
            
            # Merge results, avoiding duplicates by handle
            api_handles = {c['handle'] for c in collections}
            for coll in html_collections:
                if coll['handle'] not in api_handles:
                    collections.append(coll)
        
        self.logger.info(f"Completed collection scrape for {shop_id}: {len(collections)} collections")
        return collections
    
    def _fetch_via_api_concurrent(self, base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Fetch collections via Shopify API with concurrent page fetching."""
        all_collections = []
        session = SessionManager.get_session(shop_id)
        
        # First, check if collections API is accessible
        test_url = f"{base_url}/collections.json?limit=1"
        try:
            response = session.get(test_url, timeout=10)
            if response.status_code == 404:
                self.logger.debug(f"Collections API returns 404 for {shop_id}, skipping API")
                return []
        except Exception as e:
            self.logger.debug(f"Collections API test failed for {shop_id}: {e}")
            return []
        
        # Use concurrent page fetching
        return self._fetch_collection_pages_concurrent(base_url, shop_id, session)
    
    def _fetch_collection_pages_concurrent(self, base_url: str, shop_id: str, session) -> List[Dict[str, Any]]:
        """Fetch collection pages concurrently."""
        all_collections = []
        max_workers = min(self.concurrent_pages, self.max_pages or 3)
        
        self.logger.info(f"Fetching collection pages for {shop_id} with {max_workers} workers")
        
        def fetch_page(page_num: int) -> List[Dict[str, Any]]:
            """Fetch a single page of collections."""
            collections = []
            try:
                url = f"{base_url}/collections.json?limit={self.batch_size}&page={page_num}"
                
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
                
                if "collections" not in data or not data["collections"]:
                    return []
                
                # Process collections in this page
                for coll in data["collections"]:
                    if handle := coll.get("handle"):
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
                
                self.logger.debug(
                    f"Page {page_num} for {shop_id}: {len(data['collections'])} collections "
                    f"(fetch: {fetch_time:.2f}s, wait: {wait_time:.2f}s)"
                )
                
            except Exception as e:
                self.logger.error(f"Error on page {page_num} for {shop_id}: {e}")
            
            return collections
        
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
                batch_collections = 0
                for future in as_completed(futures):
                    try:
                        page_collections = future.result()
                        if page_collections:
                            all_collections.extend(page_collections)
                            batch_collections += len(page_collections)
                            empty_pages = 0  # Reset empty pages counter
                        else:
                            empty_pages += 1
                    except Exception as e:
                        self.logger.error(f"Error in page future: {e}")
                        empty_pages += 1
                
                # Log batch progress
                if batch_collections > 0:
                    self.logger.info(
                        f"{shop_id}: Collection batch - {batch_collections} collections "
                        f"(Total: {len(all_collections)})"
                    )
                
                # Check stopping conditions
                if empty_pages >= max_empty_pages:
                    self.logger.info(f"{shop_id}: Stopping - {empty_pages} consecutive empty pages")
                    break
        
        return all_collections
    
    def _fetch_via_html(self, base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Fallback: fetch collections via HTML scraping with smarter detection."""
        collections = []
        session = SessionManager.get_session(shop_id)
        
        # Try multiple collection URLs
        collection_urls = [
            f"{base_url}/collections",
            f"{base_url}/collections/all",
            f"{base_url}",
        ]
        
        seen_handles = set()
        
        for url in collection_urls:
            try:
                self.logger.debug(f"Trying HTML collection URL: {url}")
                response = session.get(url, timeout=15)
                self.rate_limiter.wait(shop_id, response)
                
                if response.status_code != 200:
                    continue
                
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Find collection links with multiple strategies
                found_collections = self._extract_collections_from_html(
                    soup, base_url, shop_id, seen_handles
                )
                
                if found_collections:
                    collections.extend(found_collections)
                    self.logger.debug(f"Found {len(found_collections)} collections from {url}")
                    
                    # If we found a good number, we can stop trying other URLs
                    if len(found_collections) >= 10:
                        break
                        
            except Exception as e:
                self.logger.debug(f"Failed to fetch {url}: {e}")
                continue
        
        # If still no collections, try to find collection links in navigation
        if not collections:
            collections = self._find_collections_in_navigation(base_url, shop_id, session, seen_handles)
        
        self.logger.info(f"HTML fallback found {len(collections)} collections for {shop_id}")
        return collections
    
    def _extract_collections_from_html(self, soup, base_url: str, shop_id: str, 
                                       seen_handles: set) -> List[Dict[str, Any]]:
        """Extract collections from HTML soup."""
        collections = []
        
        # Common collection link patterns
        collection_patterns = [
            ("a[href*='/collections/']", True),  # Any link with /collections/
            (".collection-item a", False),  # Collection grid items
            (".collection-grid-item a", False),
            ("[class*='collection'] a", False),  # Elements with "collection" in class
            ("nav a[href*='/collections/']", True),  # Navigation links
            (".header a[href*='/collections/']", True),  # Header links
            (".footer a[href*='/collections/']", True),  # Footer links
            (".product-collection a", False),  # Product collection links
        ]
        
        for selector, require_collections in collection_patterns:
            try:
                links = soup.select(selector)
                for link in links:
                    href = self._normalize_href(link.get('href'))
                    
                    if not href or '/collections/' not in href:
                        continue
                    
                    # Skip product pages and check for collections only if required
                    if require_collections and ('/products/' in href or '/collections/all' in href):
                        continue
                    
                    handle = self._extract_handle_from_href(href)
                    if not handle or handle in seen_handles:
                        continue
                    
                    # Skip common non-collection handles
                    if handle in ['all', 'frontpage', 'featured', 'best-selling']:
                        continue
                    
                    seen_handles.add(handle)
                    
                    # Get title
                    title = self._extract_collection_title(link, handle)
                    
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
                    
            except Exception as e:
                self.logger.debug(f"Error extracting collections with selector '{selector}': {e}")
                continue
        
        return collections
    
    def _find_collections_in_navigation(self, base_url: str, shop_id: str, 
                                        session, seen_handles: set) -> List[Dict[str, Any]]:
        """Look for collections in site navigation/menus."""
        collections = []
        
        # Try to find sitemap or navigation
        try:
            # Try to fetch sitemap.xml
            sitemap_url = f"{base_url}/sitemap.xml"
            response = session.get(sitemap_url, timeout=10)
            if response.status_code == 200:
                # Parse sitemap for collection URLs
                soup = BeautifulSoup(response.text, 'xml')  # Use xml parser for sitemap
                urls = soup.find_all('loc')
                for url_tag in urls:
                    url = url_tag.text.strip()
                    if '/collections/' in url and '/products/' not in url:
                        handle = url.split('/collections/')[-1].split('?')[0].strip('/')
                        if handle and handle not in seen_handles and handle != 'all':
                            seen_handles.add(handle)
                            
                            collection = CollectionData(
                                shop_id=shop_id,
                                scraped_at=datetime.now().isoformat(),
                                id=f"sitemap_{handle}",
                                handle=handle,
                                title=handle.replace('-', ' ').title(),
                                collection_url=url,
                                description=None,
                                products_count=None,
                                published_at=None,
                                updated_at=None
                            )
                            collections.append(collection.to_dict())
                
                if collections:
                    self.logger.debug(f"Found {len(collections)} collections in sitemap for {shop_id}")
                    return collections
                    
        except Exception as e:
            self.logger.debug(f"Could not fetch sitemap for {shop_id}: {e}")
        
        return collections
    
    def _normalize_href(self, href) -> Optional[str]:
        """Normalize href value to string."""
        if isinstance(href, str):
            return href.strip()
        elif href:
            try:
                # Handle AttributeValueList or similar
                return href[0] if isinstance(href, (list, tuple)) else str(href)
            except:
                return str(href)
        return None
    
    def _extract_handle_from_href(self, href: str) -> Optional[str]:
        """Extract collection handle from href."""
        if not href or '/collections/' not in href:
            return None
        
        parts = href.split('/collections/')
        if len(parts) < 2:
            return None
        
        handle = parts[-1].split('?')[0].strip('/')
        
        # Remove any hash fragments
        if '#' in handle:
            handle = handle.split('#')[0]
        
        # Skip product pages that might be in collections
        if '/products/' in handle:
            return None
        
        return handle if handle and handle != 'all' else None
    
    def _extract_collection_title(self, link, handle: str) -> str:
        """Extract collection title from link element."""
        # Try title attribute first
        title_attr = link.get('title')
        if isinstance(title_attr, str) and title_attr.strip():
            return title_attr.strip()
        
        # Try aria-label
        aria_label = link.get('aria-label')
        if isinstance(aria_label, str) and aria_label.strip():
            return aria_label.strip()
        
        # Try text content
        text = link.text.strip() if hasattr(link, 'text') else ''
        if text:
            return text
        
        # Fallback to handle
        return handle.replace('-', ' ').title()
    
    def scrape_multiple(self, shops: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Scrape collections from multiple shops with intelligent concurrency."""
        results = {}
        
        if not shops:
            return results
        
        self.logger.info(f"Starting collection scrape for {len(shops)} shops")
        start_time = time.time()
        
        # Process shops sequentially but with page-level concurrency within each shop
        for i, shop in enumerate(shops):
            try:
                shop_id = shop.get('id') or shop.get('url', f'shop_{i}')
                self.logger.info(f"Processing shop {i+1}/{len(shops)}: {shop_id}")
                
                # Add a small delay between shops to avoid rate limits
                if i > 0:
                    delay = 5  # 5 seconds between shops for collections
                    self.logger.debug(f"Waiting {delay}s before next shop...")
                    time.sleep(delay)
                
                collections = self.scrape_single(shop)
                results[shop_id] = collections
                
                # Log progress
                elapsed = time.time() - start_time
                avg_time = elapsed / (i + 1)
                remaining = len(shops) - (i + 1)
                eta = avg_time * remaining if remaining > 0 else 0
                
                self.logger.info(
                    f"Progress: {i+1}/{len(shops)} shops, "
                    f"{len(collections)} collections, "
                    f"ETA: {eta/60:.1f} min"
                )
                
            except Exception as e:
                self.logger.error(f"Error scraping collections for shop {shop.get('url')}: {e}")
                shop_id = shop.get('id') or shop.get('url', f'shop_{i}')
                results[shop_id] = []
        
        total_collections = sum(len(c) for c in results.values())
        total_time = time.time() - start_time
        
        self.logger.info(
            f"Collection scraping completed: {len(results)}/{len(shops)} shops, "
            f"{total_collections} total collections, "
            f"time: {total_time/60:.1f} minutes"
        )
        
        return results