"""
Collection uploader.
"""

from typing import List, Dict, Any
from pathlib import Path

from uploader.base_uploader import BaseUploader
from uploader.data_processor import DataProcessor

class CollectionUploader(BaseUploader):
    """Uploader for collection data."""
    
    def __init__(self):
        super().__init__('collections')
        self.processor = DataProcessor()
    
    def get_table_name(self) -> str:
        return "collections"

    def get_on_conflict(self) -> str:
        return "id"
    
    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw collection data, resolving shop_id by querying DB for shop url."""
        # Collect all unique shop URLs from collections that are missing shop_id
        shop_urls = set()
        for collection in raw_data:
            # Prefer an existing shop_id if present
            existing_shop_id = collection.get('shop_id')
            if existing_shop_id is not None and (isinstance(existing_shop_id, int) or (isinstance(existing_shop_id, str) and existing_shop_id.isdigit())):
                # already have shop id; skip URL collection for this item
                continue
            url = collection.get("shop_url") or collection.get("url") or None
            if url:
                shop_urls.add(url)
        # Query DB for shop url -> id mapping
        url_to_id = {}
        if shop_urls:
            def do_select(client):
                return client.table('shops').select('id,url').in_('url', list(shop_urls)).execute()
            result = self.supabase.safe_execute(do_select, 'Fetch shop ids by url', max_retries=3)
            if result and hasattr(result, 'data'):
                for row in result.data:
                    url_to_id[row['url']] = row['id']
        transformed = []
        for collection in raw_data:
            # Use existing shop_id when available
            raw_shop_id = collection.get('shop_id')
            db_id = None
            if raw_shop_id is not None and (isinstance(raw_shop_id, int) or (isinstance(raw_shop_id, str) and str(raw_shop_id).isdigit())):
                db_id = int(raw_shop_id)
            else:
                url = collection.get("shop_url") or collection.get("url") or None
                db_id = url_to_id.get(url)

            if not db_id:
                self.logger.warning(f"No shop id found for url {collection.get('shop_url') or collection.get('url')} in collection {collection.get('id')}")
                continue
            # Ensure we set shop_id for downstream processing
            collection["shop_id"] = db_id
            safe_item = {
                'title': collection.get('title', ''),
                'handle': collection.get('handle', ''),
                'description': collection.get('description'),
                'products_count': collection.get('products_count'),
                'shop_id': db_id,
                'collection_url': collection.get('collection_url', ''),
                'published_at_external': collection.get('published_at'),
                'updated_at_external': collection.get('updated_at')
            }
            raw_id = collection.get('id')
            if isinstance(raw_id, int) or (isinstance(raw_id, str) and raw_id.isdigit()):
                safe_item['id'] = int(raw_id)
            transformed.append(safe_item)
        return transformed

    # _build_shop_id_mapping is no longer needed; mapping is direct by id
    
    def process_all(self) -> Dict[str, Any]:
        """Process all collection files."""
        files = self.find_data_files()
        results = {
            'processed': 0,
            'failed': 0,
            'total_files': len(files),
            'collection_ids': [],
            'shop_ids': set()
        }
        
        if not files:
            self.logger.warning("No collection files found")
            return results
        
        self.logger.info(f"Found {len(files)} collection files")
        
        for filepath in files:
            self.current_file = str(filepath)
            success = self.process_file(filepath)
            if success:
                results['processed'] += 1
                # Extract shop ID from filename
                shop_id = filepath.stem.split('_')[0]
                results['shop_ids'].add(shop_id)
            else:
                results['failed'] += 1
        
        results['shop_ids'] = list(results['shop_ids'])
        return results