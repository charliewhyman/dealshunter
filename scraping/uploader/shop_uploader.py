"""
Shop uploader.
"""

import json
from typing import List, Dict, Any
from pathlib import Path

from uploader.base_uploader import BaseUploader
from config.schemas import DbShop

class ShopUploader(BaseUploader):
    """Uploader for shop data."""
    
    def __init__(self):
        super().__init__('shops')
    
    def get_table_name(self) -> str:
        return "shops"
    
    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw shop data to database schema."""
        transformed = []
        
        for shop in raw_data:
            shop_data = DbShop(
                id=shop.get('id', ''),
                name=shop.get('name', 'Unknown'),
                domain=shop.get('domain', shop.get('url', '')),
                url=shop.get('url', ''),
                currency=shop.get('currency'),
                country=shop.get('country'),
                phone=shop.get('phone'),
                email=shop.get('email'),
                description=shop.get('description'),
                is_shopify=shop.get('is_shopify', True),
                scrape_status=shop.get('scrape_status', 'success')
            )
            transformed.append(shop_data.to_dict())
        
        return transformed
    
    def process_all(self) -> Dict[str, Any]:
        """Process all shop files."""
        files = self.find_data_files()
        results = {
            'processed': 0,
            'failed': 0,
            'total_files': len(files),
            'shop_ids': []
        }
        
        if not files:
            self.logger.warning("No shop files found")
            return results
        
        self.logger.info(f"Found {len(files)} shop files")
        
        for filepath in files:
            success = self.process_file(filepath)
            if success:
                results['processed'] += 1
                # Extract shop IDs from filename
                shop_id = filepath.stem.split('_')[0]
                results['shop_ids'].append(shop_id)
            else:
                results['failed'] += 1
        
        return results