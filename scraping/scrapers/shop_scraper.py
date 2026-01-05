"""
Scraper for shop information with state tracking.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import time
from bs4 import BeautifulSoup

from scrapers.base_scraper import BaseScraper
from config.schemas import ShopData
from core.session_manager import SessionManager
from core.state_manager import StateManager


class ShopScraper(BaseScraper):
    """Scraper for shop information with intelligent updates."""
    
    def __init__(self):
        super().__init__('shops')
        self.state_manager = StateManager()
        
        # Shop update settings
        self.shop_update_days = 7  # Update shop info weekly
        self.max_shop_age_days = 90  # Mark shops as inactive if not seen in 90 days
        
        # Rate limiting
        self.min_shop_delay = 5  # 5 seconds between shops when sequential
    
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Scrape information for a single shop with state tracking."""
        shop_id = shop_data.get('id')
        base_url = shop_data.get('url')
        
        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []
        
        # Check if we should skip this shop (recently scraped)
        if self._should_skip_shop(shop_id, base_url):
            self.logger.info(f"Skipping shop {shop_id} - scraped recently")
            return []
        
        self.logger.info(f"Scraping shop information for {shop_id}")
        start_time = time.time()
        
        try:
            # Verify it's a Shopify store
            if not self.is_shopify_store(base_url, shop_id):
                self.logger.warning(f"{base_url} is not a Shopify store")
                shop = self._create_failed_shop_data(shop_id, base_url, shop_data)
                self._update_shop_state(shop_id, False)
                return [shop.to_dict()]
            
            # Fetch shop info
            shop_info = self._fetch_shop_info_efficient(base_url, shop_id)
            
            if not shop_info:
                # If we couldn't fetch shop info, mark as potentially problematic
                shop = self._create_partial_shop_data(shop_id, base_url, shop_data)
                self._update_shop_state(shop_id, False)
                return [shop.to_dict()]
            
            # Create complete shop data
            shop = ShopData(
                shop_id=shop_id,
                scraped_at=datetime.now().isoformat(),
                id=shop_info.get('id', shop_id),
                name=shop_info.get('name', shop_data.get('name', 'Unknown')),
                url=base_url,
                is_shopify=True,
                scrape_status="success",
            )
            
            # Update shop state with success
            self._update_shop_state(shop_id, True, shop_info)
            
            elapsed = time.time() - start_time
            self.logger.info(f"Completed shop {shop_id} in {elapsed:.1f}s")
            
            return [shop.to_dict()]
            
        except Exception as e:
            self.logger.error(f"Error scraping shop {shop_id}: {e}")
            # Create failed shop data
            shop = self._create_failed_shop_data(shop_id, base_url, shop_data)
            self._update_shop_state(shop_id, False)
            return [shop.to_dict()]
    
    def _should_skip_shop(self, shop_id: str, base_url: str) -> bool:
        """Check if we should skip scraping this shop."""
        # Try both shop_id and URL as identifiers
        identifiers = [shop_id, base_url]
        
        for identifier in identifiers:
            if not identifier:
                continue
            
            state = self.state_manager.get_shop_state(identifier)
            shops_state = state.get('shops', {})
            last_scraped = shops_state.get('last_scraped')
            
            if not last_scraped:
                continue  # Never scraped before
            
            try:
                last_time = datetime.fromisoformat(last_scraped.replace('Z', '+00:00'))
                days_since = (datetime.now() - last_time).days
                
                # Skip if scraped within update threshold
                if days_since < self.shop_update_days:
                    return True
                    
            except Exception as e:
                self.logger.debug(f"Could not parse last_scraped for {identifier}: {e}")
        
        return False
    
    def _fetch_shop_info_efficient(self, base_url: str, shop_id: str) -> Dict[str, Any]:
        """Fetch shop information efficiently with fallbacks."""
        session = SessionManager.get_session(shop_id)
        shop_info = {}
        
        # Try the most common endpoints first
        endpoints = [
            f"{base_url}/shop.json",  # Most common
            f"{base_url}/api/shop",   # Less common
        ]
        
        for endpoint in endpoints:
            try:
                self.logger.debug(f"Trying endpoint: {endpoint}")
                response = session.get(
                    endpoint,
                    timeout=10  # Shorter timeout for shop info
                )
                wait_time = self.rate_limiter.wait(shop_id, response)
                
                if response.status_code == 200:
                    data = self._safe_parse_json(response)
                    if data:
                        if 'shop' in data:
                            shop_info = data['shop']
                        else:
                            shop_info = data
                        
                        self.logger.debug(f"Found shop info at {endpoint}")
                        return shop_info
                        
            except Exception as e:
                self.logger.debug(f"Failed to fetch from {endpoint}: {e}")
                continue
        
        # HTML fallback - only if API endpoints fail
        self.logger.debug(f"API endpoints failed, trying HTML fallback for {shop_id}")
        try:
            response = session.get(
                base_url,
                timeout=15
            )
            self.rate_limiter.wait(shop_id, response)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Extract shop name from title
                title = soup.find('title')
                shop_name = title.get_text(strip=True) if title else 'Unknown'
                
                # Try to find shop description
                description = None
                meta_desc = soup.find('meta', attrs={'name': 'description'})
                if meta_desc:
                    content = meta_desc.get('content')
                    if content:
                        description = str(content).strip()
                
                # Check for Shopify-specific elements
                is_shopify = self._check_shopify_in_html(soup)
                
                shop_info = {
                    'id': shop_id,
                    'name': shop_name,
                    'description': description,
                    'is_shopify': is_shopify,
                    'source': 'html_fallback'
                }
                
                self.logger.debug(f"HTML fallback successful for {shop_id}")
                return shop_info
                
        except Exception as e:
            self.logger.debug(f"HTML fallback failed for {shop_id}: {e}")

        return shop_info
    
    def _check_shopify_in_html(self, soup: BeautifulSoup) -> bool:
        """Check if HTML contains Shopify indicators."""
        html_text = str(soup).lower()
        
        # Common Shopify indicators in HTML
        shopify_indicators = [
            'cdn.shopify.com',
            'shopify.theme',
            'shopify_design_mode',
            'shopify.settings',
            'var Shopify =',
            'window.Shopify =',
        ]
        
        for indicator in shopify_indicators:
            if indicator in html_text:
                return True
        
        # Check for Shopify meta tags
        meta_tags = soup.find_all('meta')
        for meta in meta_tags:
            # Helper to safely get string attributes
            def get_attr(attr_name: str) -> str:
                value = meta.get(attr_name)
                return str(value).lower() if value else ''
            
            content = get_attr('content')
            name = get_attr('name')
            property_attr = get_attr('property')
            
            if any('shopify' in attr for attr in [content, name, property_attr]):
                return True
        
        return False
    
    def _create_failed_shop_data(self, shop_id: str, base_url: str, 
                                 shop_data: Dict[str, Any]) -> ShopData:
        """Create shop data for a failed scrape."""
        return ShopData(
            shop_id=shop_id,
            scraped_at=datetime.now().isoformat(),
            id=shop_id,
            name=shop_data.get('name', 'Unknown'),
            url=base_url,
            is_shopify=False,
            scrape_status="failed_not_shopify"
        )
    
    def _create_partial_shop_data(self, shop_id: str, base_url: str,
                                  shop_data: Dict[str, Any]) -> ShopData:
        """Create shop data for a partial scrape."""
        return ShopData(
            shop_id=shop_id,
            scraped_at=datetime.now().isoformat(),
            id=shop_id,
            name=shop_data.get('name', 'Unknown'),
            url=base_url,
            is_shopify=True,  # We know it's Shopify but couldn't get details
            scrape_status="partial_fetch"
        )
    
    def _update_shop_state(self, shop_id: str, success: bool, 
                           shop_info: Optional[Dict] = None):
        """Update shop state after scraping."""
        state_data = {
            'last_scraped': datetime.now().isoformat(),
            'success': success,
            'timestamp': datetime.now().isoformat(),
        }
        
        if shop_info:
            # Store minimal shop info for future reference
            state_data['shop_info'] = {
                'name': shop_info.get('name'),
                'is_shopify': shop_info.get('is_shopify', True),
                'updated_at': shop_info.get('updated_at'),
            }
        
        self.state_manager.update_shop_state(shop_id, 'shops', 1, [state_data])
    
    def scrape_multiple(self, shops: List[Dict[str, Any]], 
                       max_workers: Optional[int] = None) -> Dict[str, List[Dict[str, Any]]]:
        """Scrape multiple shops with intelligent pacing."""
        # Use the parent class's concurrent implementation for efficiency
        return super().scrape_multiple(shops, max_workers)
    
    def _scrape_multiple_sequential(self, shops: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Alternative sequential implementation with delays between shops."""
        results = {}
        
        if not shops:
            return results
        
        self.logger.info(f"Starting sequential shop scraping for {len(shops)} shops")
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
                shop_data = self.scrape_single(shop)
                results[shop_id] = shop_data
                
                # Progress logging
                elapsed = time.time() - total_start
                shops_done = i + 1
                avg_time = elapsed / shops_done if shops_done > 0 else 0
                remaining = len(shops) - shops_done
                eta = avg_time * remaining if remaining > 0 else 0
                
                successful_shops = sum(1 for data in results.values() if data and len(data) > 0)
                
                self.logger.info(
                    f"Progress: {shops_done}/{len(shops)} shops, "
                    f"{successful_shops} successful, "
                    f"ETA: {eta/60:.1f} min"
                )
                
            except Exception as e:
                self.logger.error(f"Error scraping shop {shop.get('url', 'unknown')}: {e}")
                results[shop_id] = []
        
        total_shops = len(results)
        successful_shops = sum(1 for data in results.values() if data and len(data) > 0)
        total_time = time.time() - total_start
        
        self.logger.info(
            f"Shop scraping completed: {successful_shops}/{total_shops} successful, "
            f"time: {total_time/60:.1f} minutes"
        )
        
        return results
    
    def cleanup_old_shops(self, days_threshold: int = 90):
        """Clean up state for shops not seen in a long time."""
        self.logger.info(f"Cleaning up shops not seen in {days_threshold} days")
        
        all_shop_ids = self.state_manager.get_all_shop_ids()
        cutoff_time = datetime.now() - timedelta(days=days_threshold)
        
        for shop_id in all_shop_ids:
            state = self.state_manager.get_shop_state(shop_id)
            shops_state = state.get('shops', {})
            last_scraped = shops_state.get('last_scraped')
            
            if not last_scraped:
                continue
            
            try:
                last_time = datetime.fromisoformat(last_scraped.replace('Z', '+00:00'))
                if last_time < cutoff_time:
                    # Mark shop as potentially inactive
                    self.logger.debug(f"Shop {shop_id} last seen {last_time}, marking as inactive")
                    
                    # Could add logic here to mark shop as inactive in database
                    # or remove from active scraping list
                    
            except Exception as e:
                self.logger.debug(f"Could not parse last_scraped for {shop_id}: {e}")