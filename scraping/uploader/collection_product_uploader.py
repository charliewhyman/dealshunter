"""
Collection-product uploader.
"""

import json
import time
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path

from uploader.base_uploader import BaseUploader
from config.schemas import DbCollectionProduct
from uploader.supabase_client import SupabaseClient

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
    
    def get_existing_product_ids(self) -> set:
        """Fetch all existing product IDs from products_with_details_core table."""
        try:
            def do_select(client):
                return client.table("products_with_details_core").select("id").execute()
            
            result = self.supabase.safe_execute(
                do_select,
                "Fetch existing product IDs from products_with_details_core",
                max_retries=3
            )
            
            if not result:
                self.logger.warning("Could not fetch existing product IDs")
                return set()
            
            data = None
            if isinstance(result, dict):
                data = result.get('data')
            elif hasattr(result, 'data'):
                data = result.data
            
            if not data:
                self.logger.warning("No products found in products_with_details_core table")
                return set()
            
            # Convert to set of strings for easy lookup
            existing_ids = {str(row["id"]) for row in data}
            self.logger.info(f"Found {len(existing_ids)} existing products in products_with_details_core")
            return existing_ids
            
        except Exception as e:
            self.logger.error(f"Error fetching existing product IDs: {e}")
            return set()
    
    def get_existing_collection_ids(self) -> set:
        """Fetch all existing collection IDs from the database."""
        try:
            def do_select(client):
                return client.table("collections").select("id").execute()
            
            result = self.supabase.safe_execute(
                do_select,
                "Fetch existing collection IDs",
                max_retries=3
            )
            
            if not result:
                self.logger.warning("Could not fetch existing collection IDs")
                return set()
            
            data = None
            if isinstance(result, dict):
                data = result.get('data')
            elif hasattr(result, 'data'):
                data = result.data
            
            if not data:
                self.logger.warning("No collections found in database")
                return set()
            
            existing_ids = {str(row["id"]) for row in data}
            self.logger.info(f"Found {len(existing_ids)} existing collections in database")
            return existing_ids
            
        except Exception as e:
            self.logger.error(f"Error fetching existing collection IDs: {e}")
            return set()
    
    def validate_and_transform_data(self, raw_data: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int, int]:
        """
        Validate that product_id and collection_id exist in their respective tables.
        Returns: (validated_data, skipped_products, skipped_collections)
        """
        # Get existing IDs
        existing_products = self.get_existing_product_ids()
        existing_collections = self.get_existing_collection_ids()
        
        validated = []
        skipped_products = 0
        skipped_collections = 0
        
        for item in raw_data:
            product_id = str(item.get('product_id', '')).strip()
            collection_id = str(item.get('collection_id', '')).strip()
            
            if not product_id or not collection_id:
                continue
            
            # Check if product exists in products_with_details_core
            if product_id not in existing_products:
                self.logger.debug(f"Skipping link: Product {product_id} does not exist in products_with_details_core")
                skipped_products += 1
                continue
            
            # Check if collection exists
            if collection_id not in existing_collections:
                self.logger.debug(f"Skipping link: Collection {collection_id} does not exist")
                skipped_collections += 1
                continue
            
            # Both IDs exist, include in validated data
            mapping = DbCollectionProduct(
                product_id=product_id,
                collection_id=collection_id
            )
            validated.append(mapping.to_dict())
            self.current_links.append((product_id, collection_id))
        
        return validated, skipped_products, skipped_collections
    
    def process_file_with_retry(self, filepath: Path, max_retries: int = 3) -> bool:
        """Process a single collection-product file with retry logic for missing products."""
        for attempt in range(max_retries):
            if attempt > 0:
                self.logger.info(f"Retry attempt {attempt + 1}/{max_retries} for {filepath.name}")
                # Wait before retry (products might still be uploading)
                time.sleep(2 * attempt)  # Exponential backoff: 2, 4, 6 seconds
            
            self.logger.info(f"Processing {filepath.name} (attempt {attempt + 1}/{max_retries})")
            
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    raw_data = json.load(f)

                # Reset current links for this file
                self.current_links = []
                
                # Validate and transform data
                transformed_data, skipped_products, skipped_collections = self.validate_and_transform_data(raw_data)
                
                # Log validation results
                if raw_data:
                    total_skipped = skipped_products + skipped_collections
                    if total_skipped > 0:
                        self.logger.warning(
                            f"Attempt {attempt + 1}: Skipped {total_skipped} links "
                            f"({skipped_products} missing products, {skipped_collections} missing collections) "
                            f"out of {len(raw_data)} total"
                        )
                        
                        if attempt == max_retries - 1:  # Last attempt
                            # Log specific missing products for debugging
                            if skipped_products > 0:
                                missing_products = set()
                                for item in raw_data:
                                    product_id = str(item.get('product_id', '')).strip()
                                    if product_id:
                                        missing_products.add(product_id)
                                self.logger.error(
                                    f"Missing products after all retries. "
                                    f"Sample: {list(missing_products)[:10] if missing_products else 'None'}"
                                )

                if not transformed_data:
                    if attempt == max_retries - 1:  # Last attempt
                        self.logger.warning(f"No valid data in {filepath.name} after {max_retries} attempts")
                        # Move to processed anyway since we tried
                        self.file_manager.move_to_processed(filepath)
                        return True
                    continue  # Try again
                
                # Diagnostic: log count and sample of mappings before upload
                try:
                    sample_count = min(3, len(transformed_data))
                    sample = transformed_data[:sample_count]
                    self.logger.info(
                        f"Attempt {attempt + 1}: Preparing to upsert {len(transformed_data)} links. Sample: {sample}"
                    )
                except Exception:
                    pass

                # Upload to database
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
                    self.logger.error(f"Attempt {attempt + 1}: Failed to upload {filepath.name}")
                    # Don't retry on upload error, just DB FK constraint errors
                    if attempt == max_retries - 1:
                        return False
                    
            except Exception as e:
                error_str = str(e)
                # Check if it's a foreign key constraint error
                if 'foreign key constraint' in error_str.lower() or '23503' in error_str:
                    self.logger.warning(f"Attempt {attempt + 1}: Foreign key constraint error - products may not exist yet: {e}")
                    if attempt < max_retries - 1:
                        continue  # Retry
                    else:
                        self.logger.error(f"Failed after {max_retries} attempts due to foreign key constraint")
                        return False
                else:
                    self.logger.error(f"Error processing {filepath.name}: {e}")
                    return False
        
        return False
    
    def process_file(self, filepath: Path) -> bool:
        """Process a single collection-product file (main entry point with retry)."""
        return self.process_file_with_retry(filepath, max_retries=3)
    
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
            'total_links': 0,
            'skipped_links': 0,
            'retries_needed': 0
        }
        
        if not files:
            self.logger.warning("No collection-product files found")
            return results
        
        self.logger.info(f"Found {len(files)} collection-product files")
        
        all_links = []
        
        # Fetch existing IDs once for all files (more efficient)
        self.logger.info("Fetching existing product and collection IDs for validation...")
        existing_products = self.get_existing_product_ids()
        existing_collections = self.get_existing_collection_ids()
        
        # Store them for use in validation
        self._existing_products = existing_products
        self._existing_collections = existing_collections
        
        if not existing_products:
            self.logger.error("❌ CRITICAL: No products found in products_with_details_core table!")
            self.logger.error("  Make sure ProductUploader runs successfully BEFORE CollectionProductUploader")
            results['failed'] = len(files)
            return results
        
        for filepath in files:
            # Track if retries were needed for this file
            needed_retry = False
            
            for attempt in range(3):  # 3 attempts max
                if attempt > 0:
                    needed_retry = True
                    self.logger.info(f"Retry {attempt} for {filepath.name}")
                    time.sleep(2 * attempt)
                
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        raw_data = json.load(f)
                    
                    # Validate
                    transformed_data, skipped_products, skipped_collections = self.validate_and_transform_data(raw_data)
                    
                    if transformed_data:
                        # Try upload
                        success = self.supabase.bulk_upsert(
                            table_name=self.get_table_name(),
                            data=transformed_data,
                            on_conflict=self.get_on_conflict()
                        )
                        
                        if success:
                            results['processed'] += 1
                            results['total_links'] += len(transformed_data)
                            results['skipped_links'] += skipped_products + skipped_collections
                            if needed_retry:
                                results['retries_needed'] += 1
                            
                            all_links.extend(self.current_links)
                            self.file_manager.move_to_processed(filepath)
                            self.logger.info(f"✅ Successfully processed {filepath.name}")
                            break  # Success, move to next file
                        else:
                            if attempt == 2:  # Last attempt
                                self.logger.error(f"❌ Failed to upload {filepath.name} after 3 attempts")
                                results['failed'] += 1
                    else:
                        if attempt == 2:  # Last attempt
                            self.logger.warning(f"No valid data in {filepath.name} after validation")
                            self.file_manager.move_to_processed(filepath)  # Move anyway
                            results['processed'] += 1  # Count as processed (nothing to do)
                            break
                        
                except Exception as e:
                    if attempt == 2:  # Last attempt
                        self.logger.error(f"❌ Error processing {filepath.name}: {e}")
                        results['failed'] += 1
        
        # Clean up stale links after all files are processed
        if all_links:
            self.cleanup_stale_links(all_links)
        
        # Summary
        if results['retries_needed'] > 0:
            self.logger.warning(f"⚠️  {results['retries_needed']} files needed retries due to timing issues")
        
        return results

    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError
