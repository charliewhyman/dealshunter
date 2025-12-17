"""
Shop uploader.
"""

import json
from typing import List, Dict, Any
from pathlib import Path

from uploader.base_uploader import BaseUploader
from config.schemas import DbShop
import config.settings as settings

class ShopUploader(BaseUploader):
    """Uploader for shop data."""
    
    def __init__(self):
        super().__init__('shops')
    
    def get_table_name(self) -> str:
        return "shops"

    def get_on_conflict(self) -> str:
        """Use `url` as the ON CONFLICT target so shops are keyed by URL."""
        return "url"
    
    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Normalize shop entries into DB column names, using url as unique key. Ignore id from JSON."""
        transformed: List[Dict[str, Any]] = []
        for shop in raw_data:
            safe_shop = {
                'shop_name': shop.get('shop_name') or shop.get('name') or 'Unknown',
                'url': shop.get('url', ''),
            }
            if shop.get('category') is not None:
                safe_shop['category'] = shop.get('category')
            tags = shop.get('tags')
            if tags is not None:
                safe_shop['tags'] = tags if isinstance(tags, list) else [t.strip() for t in str(tags).split(',') if t.strip()]
            if 'is_shopify' in shop:
                safe_shop['is_shopify'] = None if shop.get('is_shopify') is None else bool(shop.get('is_shopify'))
            if shop.get('updated_at'):
                safe_shop['updated_at'] = shop.get('updated_at')
            transformed.append(safe_shop)
        return transformed
    
    def process_all(self) -> Dict[str, Any]:
        """Upload shops from `settings.SHOP_URLS_FILE`."""
        results = {
            'processed': 0,
            'failed': 0,
            'total_shops': 0,
            'shop_ids': []
        }

        shop_file = settings.SHOP_URLS_FILE
        if not shop_file or not shop_file.exists():
            self.logger.warning(f"Shop file not found: {shop_file}")
            return results

        try:
            with open(shop_file, 'r', encoding='utf-8') as f:
                shop_list = json.load(f)

            if not isinstance(shop_list, list) or not shop_list:
                self.logger.warning(f"No shops found in {shop_file}")
                return results

            results['total_shops'] = len(shop_list)

            transformed = self.transform_data(shop_list)
            if not transformed:
                self.logger.warning("No shop records to upload after transformation")
                return results

            success = self.supabase.bulk_upsert(
                table_name=self.get_table_name(),
                data=transformed,
                on_conflict=self.get_on_conflict()
            )

            if success:
                results['processed'] = len(transformed)
                # Collect IDs (or urls) for reporting
                for s in shop_list:
                    sid = s.get('id') or s.get('url')
                    if sid:
                        results['shop_ids'].append(str(sid))
            else:
                results['failed'] = len(transformed)

            return results

        except Exception as e:
            self.logger.error(f"Failed to process shops from {shop_file}: {e}")
            return results