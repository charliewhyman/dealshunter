"""
Collection Scraper - Minimal polling.
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
        self.max_pages = 2  # Much lower - collections are fewer
        self.concurrent_pages = 1  # No concurrency needed
        
        # State tracking
        self.state_manager = StateManager()
        
        # Rate limiting
        self.min_shop_delay = 10
        self.max_requests_per_shop = 10  # Very low - collections are few
        
        # Skip thresholds (collections change rarely)
        self.skip_shop_days = 7  # Skip shops scraped in last 7 days
    
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
    
    def _fetch_via_api_simple(self, base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Simple API fetch with minimal requests."""
        collections = []
        session = SessionManager.get_session(shop_id)
        
        # Quick API test
        test_url = f"{base_url}/collections.json?limit=1"
        try:
            response = session.get(test_url, timeout=10)
            self.rate_limiter.wait(shop_id, response)
            
            if response.status_code == 404:
                return []
        except:
            return []
        
        # Fetch with small pages
        page = 1
        while page <= 2:  # Max 2 pages
            try:
                url = f"{base_url}/collections.json?limit=50&page={page}"
                
                response = session.get(url, timeout=15)
                self.rate_limiter.wait(shop_id, response)
                
                if response.status_code != 200:
                    break
                
                data = self._safe_parse_json(response)
                if not data or "collections" not in data:
                    break
                
                page_collections = data["collections"]
                if not page_collections:
                    break
                
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
                    break
                    
                page += 1
                time.sleep(0.5)  # Small delay between pages
                
            except Exception as e:
                self.logger.error(f"Error fetching collections page {page}: {e}")
                break
        
        return collections
    
    def _fetch_via_html_minimal(self, base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Minimal HTML fallback - just check main page."""
        session = SessionManager.get_session(shop_id)
        collections = []
        
        # Only check homepage and collections page
        urls_to_check = [
            f"{base_url}",
            f"{base_url}/collections",
        ]
        
        for url in urls_to_check:
            try:
                response = session.get(url, timeout=10)
                self.rate_limiter.wait(shop_id, response)
                
                if response.status_code != 200:
                    continue
                
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
                            
                            if handle and handle not in ['all', 'frontpage']:
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
                if collections:
                    break
                    
            except Exception as e:
                self.logger.debug(f"HTML fetch failed for {url}: {e}")
        
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