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
        """Use `url` as the conflict target so upserts deduplicate by URL.

        Ensure the `shops.url` column has a UNIQUE constraint in the DB; if
        it doesn't, Postgres will raise an error. If you haven't added the
        constraint yet, run the SQL shown in the README notes after this
        change.
        """
        return "url"
    
    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw shop data to database schema."""
        transformed = []
        
        for shop in raw_data:
            # Map local fields to the columns present in the `shops` table.
            # The DB uses `shop_name` (not `name`) and has columns for
            # `category`, `tags` (text[]), `updated_at`, and `is_shopify`.
            # Prefer `shop_name` in the source, fall back to `name`.
            safe_shop = {
                'shop_name': shop.get('shop_name') or shop.get('name') or 'Unknown',
                'url': shop.get('url', ''),
            }

            # Optional: category
            if 'category' in shop and shop.get('category') is not None:
                safe_shop['category'] = shop.get('category')

            # Optional: tags (ensure list)
            if 'tags' in shop and shop.get('tags') is not None:
                tags = shop.get('tags')
                if isinstance(tags, list):
                    safe_shop['tags'] = tags
                elif isinstance(tags, str):
                    safe_shop['tags'] = [t.strip() for t in tags.split(',') if t.strip()]

            # Optional: is_shopify (only include if explicitly provided)
            if 'is_shopify' in shop:
                val = shop.get('is_shopify')
                if val is None:
                    safe_shop['is_shopify'] = None
                else:
                    safe_shop['is_shopify'] = bool(val)

            # Optional: updated_at
            if 'updated_at' in shop and shop.get('updated_at'):
                safe_shop['updated_at'] = shop.get('updated_at')
            transformed.append(safe_shop)
        
        return transformed
    
    def process_all(self) -> Dict[str, Any]:
        """Process shops by reading the canonical `shop_urls.json` file.

        This uploader uses `config.settings.SHOP_URLS_FILE` as the single
        source of truth for shops rather than consuming raw scraped files.
        """
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