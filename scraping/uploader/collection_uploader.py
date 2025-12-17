"""
Collection uploader.
"""

import json
from typing import List, Dict, Any
from pathlib import Path

from uploader.base_uploader import BaseUploader
from config.schemas import DbCollection
from uploader.data_processor import DataProcessor

class CollectionUploader(BaseUploader):
    """Uploader for collection data."""
    
    def __init__(self):
        super().__init__('collections')
        self.processor = DataProcessor()
    
    def get_table_name(self) -> str:
        return "collections"
    
    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw collection data."""
        transformed = []
        
        for collection in raw_data:
            # Extract shop_id from data
            shop_id = collection.get('shop_id', '')
            if not shop_id:
                # Try to get from filename if available
                if hasattr(self, 'current_file'):
                    filename = Path(self.current_file).stem
                    shop_id = filename.split('_')[0]
            
            # Build a safe mapping for DB insertion. The DB `id` column is a
            # bigint primary key; scraped `id` values are sometimes textual
            # (e.g. 'html_all') and would cause a type error. Only include
            # `id` when it's numeric.
            safe_item = {
                'title': collection.get('title', ''),
                'handle': collection.get('handle', ''),
                'description': collection.get('description'),
                'products_count': collection.get('products_count'),
                'shop_id': shop_id,
                'collection_url': collection.get('collection_url', ''),
                'published_at_external': collection.get('published_at'),
                'updated_at_external': collection.get('updated_at')
            }

            raw_id = collection.get('id')
            # Accept integers or digit-strings as valid IDs
            if isinstance(raw_id, int) or (isinstance(raw_id, str) and raw_id.isdigit()):
                safe_item['id'] = int(raw_id)

            transformed.append(safe_item)
        
        return transformed
    
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