"""
Collection-product uploader.
"""

import json
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path

from uploader.base_uploader import BaseUploader
from config.schemas import DbCollectionProduct
from uploader.supabase_client import SupabaseClient
from core.logger import uploader_logger

class CollectionProductUploader(BaseUploader):
    """Uploader for collection-product relationships."""
    
    def __init__(self):
        super().__init__('collection_products')
        self.supabase = SupabaseClient()
        self.current_links = []
    
    def get_table_name(self) -> str:
        return "product_collections"
    
    def get_on_conflict(self) -> str:
        return "collection_id,product_id"
    
    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw collection-product mapping data."""
        transformed = []
        
        for item in raw_data:
            product_id = str(item.get('product_id', '')).strip()
            collection_id = str(item.get('collection_id', '')).strip()
            
            if not product_id or not collection_id:
                continue
            
            mapping = DbCollectionProduct(
                product_id=product_id,
                collection_id=collection_id
            )
            transformed.append(mapping.to_dict())
            self.current_links.append((product_id, collection_id))
        
        return transformed
    
    def process_file(self, filepath: Path) -> bool:
        """Process a single collection-product file."""
        self.logger.info(f"Processing {filepath.name}")
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                raw_data = json.load(f)

            # Reset current links for this file
            self.current_links = []
            transformed_data = self.transform_data(raw_data)

            if not transformed_data:
                self.logger.warning(f"No valid data in {filepath.name}")
                return False
            
            # Diagnostic: log count and sample of mappings before upload
            try:
                sample_count = min(3, len(transformed_data))
                sample = transformed_data[:sample_count]
                self.logger.info(
                    f"Preparing to upsert {len(transformed_data)} links to {self.get_table_name()}. Sample: {sample}"
                )
            except Exception:
                pass

            # Upload to database - let foreign key constraints handle validation
            success = self.supabase.bulk_upsert(
                table_name=self.get_table_name(),
                data=transformed_data,
                on_conflict=self.get_on_conflict()
            )
            
            if success:
                self.file_manager.move_to_processed(filepath)
                self.logger.info(f"Successfully processed {filepath.name} ({len(transformed_data)} links)")
                return True
            else:
                self.logger.error(f"Failed to upload {filepath.name}")
                return False
                
        except Exception as e:
            self.logger.error(f"Error processing {filepath.name}: {e}")
            return False
    
    def cleanup_stale_links(self, current_links: Optional[List[Tuple[str, str]]] = None) -> bool:
        """Remove stale collection-product links."""
        if current_links is None:
            current_links = self.current_links
        
        if not current_links:
            self.logger.info("No current links to clean up")
            return True
        
        try:
            # Get existing links from database
            def do_select(client):
                return client.table("product_collections").select("product_id,collection_id").execute()
            
            result = self.supabase.safe_execute(
                do_select,
                "Fetch existing collection-product links",
                max_retries=3
            )
            if not result:
                self.logger.warning("Could not fetch existing links")
                return False

            data = None
            if isinstance(result, dict):
                data = result.get('data')
            elif hasattr(result, 'data'):
                data = result.data

            if not data:
                self.logger.warning("Could not fetch existing links")
                return False

            # Normalize to string tuples to match `current_links` format
            existing_links = {(str(row["product_id"]).strip(), str(row["collection_id"]).strip()) for row in data}
            # Ensure current_links are normalized to string tuples as well
            current_links_set = {(str(prod).strip(), str(col).strip()) for prod, col in current_links}
            to_delete = list(existing_links - current_links_set)

            # Diagnostic: if there are deletions, log a small sample to aid debugging
            if to_delete:
                try:
                    sample_del = to_delete[:5]
                    self.logger.info(
                        f"Collection-product cleanup: {len(to_delete)} links to delete. Sample: {sample_del}"
                    )
                except Exception:
                    pass
            
            if not to_delete:
                self.logger.info("No stale links to delete")
                return True
            
            self.logger.info(f"Deleting {len(to_delete)} stale links")
            
            # Delete in batches
            batch_size = 100
            for i in range(0, len(to_delete), batch_size):
                batch = to_delete[i:i + batch_size]
                
                def do_delete(client):
                    for product_id, collection_id in batch:
                        client.table("product_collections").delete()\
                            .eq("product_id", product_id)\
                            .eq("collection_id", collection_id).execute()
                    return True
                
                success = self.supabase.safe_execute(
                    do_delete,
                    f"Delete batch {i//batch_size + 1}",
                    max_retries=3
                )
                
                if not success:
                    self.logger.error(f"Failed to delete batch {i//batch_size + 1}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error cleaning up links: {e}")
            return False
    
    def process_all(self) -> Dict[str, Any]:
        """Process all collection-product files."""
        files = self.find_data_files()
        results = {
            'processed': 0,
            'failed': 0,
            'total_files': len(files),
            'total_links': 0
        }
        
        if not files:
            self.logger.warning("No collection-product files found")
            return results
        
        self.logger.info(f"Found {len(files)} collection-product files")
        
        all_links = []
        
        for filepath in files:
            success = self.process_file(filepath)
            if success:
                results['processed'] += 1
                results['total_links'] += len(self.current_links)
                all_links.extend(self.current_links)
            else:
                results['failed'] += 1
        
        # Clean up stale links after all files are processed
        if all_links:
            self.cleanup_stale_links(all_links)
        
        return results