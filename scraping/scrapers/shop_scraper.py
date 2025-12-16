"""
Scraper for shop information.
"""

import json
from datetime import datetime
from typing import List, Dict, Any
from bs4 import BeautifulSoup

from scrapers.base_scraper import BaseScraper
from config.schemas import ShopData
import config.settings as settings
from core.session_manager import SessionManager

class ShopScraper(BaseScraper):
    """Scraper for shop information."""
    
    def __init__(self):
        super().__init__('shops')
    
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Scrape information for a single shop."""
        shop_id = shop_data.get('id')
        base_url = shop_data.get('url')
        
        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []
        
        # Verify it's a Shopify store
        if not self.is_shopify_store(base_url, shop_id):
            self.logger.warning(f"{base_url} is not a Shopify store")
            shop = ShopData(
                shop_id=shop_id,
                scraped_at=datetime.now().isoformat(),
                id=shop_id,
                name=shop_data.get('name', 'Unknown'),
                domain=base_url,
                url=base_url,
                is_shopify=False,
                scrape_status="failed_not_shopify"
            )
            return [shop.to_dict()]
        
        # Fetch shop info
        shop_info = self._fetch_shop_info(base_url, shop_id)
        
        shop = ShopData(
            shop_id=shop_id,
            scraped_at=datetime.now().isoformat(),
            id=shop_info.get('id', shop_id),
            name=shop_info.get('name', shop_data.get('name', 'Unknown')),
            domain=shop_info.get('domain', base_url),
            url=base_url,
            currency=shop_info.get('currency'),
            country=shop_info.get('country'),
            phone=shop_info.get('phone'),
            email=shop_info.get('email'),
            description=shop_info.get('description'),
            is_shopify=True,
            scrape_status="success"
        )
        
        return [shop.to_dict()]
    
    def _fetch_shop_info(self, base_url: str, shop_id: str) -> Dict[str, Any]:
        """Fetch shop information from Shopify."""
        session = SessionManager.get_session(shop_id)
        
        # Try to get shop info from various endpoints
        endpoints_to_try = [
            f"{base_url}/admin/api/2023-10/shop.json",
            f"{base_url}/shop.json",
            f"{base_url}/api/shop"
        ]
        
        for endpoint in endpoints_to_try:
            try:
                response = session.get(
                    endpoint,
                    timeout=settings.SCRAPER_CONFIG['request_timeout']
                )
                wait_time = self.rate_limiter.wait(shop_id, response)
                
                if response.status_code == 200:
                    data = response.json()
                    if 'shop' in data:
                        return data['shop']
                    return data
            except:
                continue
        
        # Fallback to HTML scraping
        try:
            response = session.get(
                base_url,
                timeout=settings.SCRAPER_CONFIG['request_timeout']
            )
            self.rate_limiter.wait(shop_id, response)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                title = soup.find('title')
                shop_name = title.text.strip() if title else 'Unknown'
                
                return {
                    'id': shop_id,
                    'name': shop_name,
                    'domain': base_url
                }
        except Exception as e:
            self.logger.error(f"HTML fallback failed for {shop_id}: {e}")
        
        return {}