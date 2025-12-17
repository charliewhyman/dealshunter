"""
Scraper for collections.
"""

import json
from datetime import datetime
from typing import List, Dict, Any
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
    
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Scrape collections for a single shop."""
        shop_id = shop_data.get('id')
        base_url = shop_data.get('url')
        
        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []
        
        # Verify it's a Shopify store
        if not self.is_shopify_store(base_url, shop_id):
            self.logger.warning(f"Skipping collections for non-Shopify store: {base_url}")
            return []
        
        # Try API first
        collections = self._fetch_via_api(base_url, shop_id)
        
        # Fallback to HTML if API returns nothing
        if not collections:
            collections = self._fetch_via_html(base_url, shop_id)
        
        return collections
    
    def _fetch_via_api(self, base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Fetch collections via Shopify API."""
        collections = []
        page = 1
        session = SessionManager.get_session(shop_id)
        
        while True:
            url = f"{base_url}/collections.json?limit={settings.SCRAPER_CONFIG['batch_size']}&page={page}"
            
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
                
                if "collections" not in data or not data["collections"]:
                    break
                
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
                
                self.logger.info(f"Page {page}: {len(data['collections'])} collections for {shop_id}")
                
                if self.max_pages and page >= self.max_pages:
                    break
                    
                page += 1
                
            except Exception as e:
                self.logger.error(f"Error on page {page} for {shop_id}: {e}")
                break
        
        return collections
    
    def _fetch_via_html(self, base_url: str, shop_id: str) -> List[Dict[str, Any]]:
        """Fallback: fetch collections via HTML scraping."""
        url = f"{base_url}/collections"
        collections = []
        
        try:
            session = SessionManager.get_session(shop_id)
            response = session.get(url, timeout=settings.SCRAPER_CONFIG['request_timeout'])
            self.rate_limiter.wait(shop_id, response)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find collection links
            seen_handles = set()
            collection_selectors = [
                "a[href^='/collections/']",
                ".collection-item a",
                ".collection-grid-item a",
                "[class*='collection'] a"
            ]
            
            for selector in collection_selectors:
                links = soup.select(selector)
                for link in links:
                    raw_href = link.get('href')
                    # Normalize href to a string: handle normal strings or list-like AttributeValueList
                    if isinstance(raw_href, str):
                        href = raw_href
                    elif raw_href:
                        try:
                            # If it's list-like (AttributeValueList), take the first item
                            href = raw_href[0]
                        except Exception:
                            href = str(raw_href)
                    else:
                        href = ''
                    if href and '/collections/' in href and 'products' not in href:
                        parts = href.split('/collections/')
                        if len(parts) > 1:
                            handle = parts[-1].split('?')[0].strip('/')
                            if handle and handle not in seen_handles:
                                seen_handles.add(handle)
                                
                                # Try to get title
                                raw_title = link.get('title')
                                if isinstance(raw_title, str) and raw_title.strip():
                                    title = raw_title.strip()
                                else:
                                    text = link.text.strip() if getattr(link, "text", "") else ""
                                    title = text if text else handle.replace('-', ' ').title()
                                
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
            
            self.logger.info(f"HTML fallback found {len(collections)} collections for {shop_id}")
            
        except Exception as e:
            self.logger.error(f"HTML fallback failed for {shop_id}: {e}")
        
        return collections