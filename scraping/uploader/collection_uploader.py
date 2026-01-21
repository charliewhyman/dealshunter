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
        """Transform raw collection data using shop_id directly from JSON."""
        transformed = []
        
        for collection in raw_data:
            # Extract shop_id from JSON data
            raw_shop_id = collection.get('shop_id')
            
            # Validate and convert shop_id
            if raw_shop_id is None:
                self.logger.warning(f"No shop_id found for collection {collection.get('id')}")
                continue
            
            # Convert shop_id to integer if possible
            try:
                shop_id = int(raw_shop_id)
                self.logger.debug(f"Using shop_id={shop_id} from JSON for collection {collection.get('id')}")
            except (ValueError, TypeError):
                self.logger.warning(f"Invalid shop_id format: {raw_shop_id} for collection {collection.get('id')}")
                continue
            
            # Prepare the transformed item
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
            
            # Add collection ID if present and valid
            raw_id = collection.get('id')
            if isinstance(raw_id, int) or (isinstance(raw_id, str) and str(raw_id).strip().isdigit()):
                safe_item['id'] = str(raw_id).strip()
            
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
                # Since we can't easily extract shop_id without reading the file again,
                # we'll leave shop_ids tracking for later if needed
                # You can track shop_ids in process_file if needed
            else:
                results['failed'] += 1
        
        # Return empty shop_ids list since we can't extract them easily
        results['shop_ids'] = []
        return results