"""
Base class for all uploaders.
"""

import json
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pathlib import Path

from uploader.supabase_client import SupabaseClient
from core.file_manager import FileManager
from core.logger import uploader_logger

class BaseUploader(ABC):
    """Base class for all entity uploaders."""
    
    def __init__(self, entity_type: str):
        self.entity_type = entity_type
        self.supabase = SupabaseClient()
        self.file_manager = FileManager()
        self.logger = uploader_logger
    
    @abstractmethod
    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw data to database schema. Must be implemented."""
        pass
    
    @abstractmethod
    def get_table_name(self) -> str:
        """Get the target table name. Must be implemented."""
        pass
    
    def get_on_conflict(self) -> Optional[str]:
        """Get the ON CONFLICT clause. Override if needed.

        Return None to perform plain inserts (no ON CONFLICT target).
        """
        return "id"
    
    def find_data_files(self) -> List[Path]:
        """Find JSON files for this entity type.

        Ensure uploaders read from the same `raw/<entity>` folders that
        scrapers write to. If raw is empty but matching files exist in
        `processed/<entity>` or `processed/`, attempt to restore them
        back into `raw/<entity>` so they can be uploaded.
        """
        try:
            # If there are no raw files, attempt to restore any processed files
            raw_files = self.file_manager.get_raw_files(self.entity_type)
            if not raw_files:
                restored = self.file_manager.restore_processed_to_raw(self.entity_type)
                if restored:
                    self.logger.info(f"Restored {restored} {self.entity_type} files from processed to raw")
        except Exception:
            # Non-fatal; fall back to returning whatever get_raw_files returns
            pass

        return self.file_manager.get_raw_files(self.entity_type)
    
    def process_file(self, filepath: Path) -> bool:
        """Process a single data file."""
        self.logger.info(f"Processing {filepath.name}")
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                raw_data = json.load(f)
            
            # Transform data
            transformed_data = self.transform_data(raw_data)
            if not transformed_data:
                self.logger.warning(f"No valid data in {filepath.name}")
                self.file_manager.move_to_processed(filepath)
                return False

            # Debug: log count and a small sample before attempting upsert
            try:
                sample_count = min(3, len(transformed_data))
                # Build a small sample representation depending on record shape
                sample_items = []
                for rec in transformed_data[:sample_count]:
                    if isinstance(rec, dict):
                        # Prefer id, else first two keys
                        if 'id' in rec:
                            sample_items.append(rec.get('id'))
                        else:
                            keys = list(rec.keys())[:2]
                            sample_items.append({k: rec.get(k) for k in keys})
                    else:
                        sample_items.append(str(rec))

                self.logger.info(
                    f"Preparing to upsert {len(transformed_data)} records to {self.get_table_name()}. Sample: {sample_items}"
                )
            except Exception:
                pass

            # Upload to database
            table_name = self.get_table_name()
            on_conflict = self.get_on_conflict()

            success = self.supabase.bulk_upsert(
                table_name=table_name,
                data=transformed_data,
                on_conflict=on_conflict
            )
            
            if success:
                self.file_manager.move_to_processed(filepath)
                self.logger.info(f"Successfully processed {filepath.name}")
                return True
            else:
                self.logger.error(f"Failed to upload {filepath.name}")
                return False
                
        except Exception as e:
            self.logger.error(f"Error processing {filepath.name}: {e}")
            return False
    
    def cleanup_stale_records(self, current_ids: List[str], shop_id: Optional[str] = None):
        """Remove records that no longer exist."""
        try:
            table_name = self.get_table_name()
            
            # Get existing IDs from database
            def do_select(client):
                query = client.table(table_name).select("id")
                if shop_id:
                    # Check if table has shop_id column
                    query = query.eq("shop_id", shop_id)
                return query.execute()
            
            result = self.supabase.safe_execute(
                do_select,
                f"Fetch existing {self.entity_type} records",
                max_retries=3
            )
            
            if not result or not hasattr(result, 'data'):
                self.logger.warning(f"Could not fetch existing {self.entity_type}")
                return False
            
            # Normalize IDs from DB and current_ids to strings to avoid
            # int/str mismatches that can cause unintended deletions.
            existing_ids = {str(item.get('id')).strip() for item in result.data if item.get('id') is not None}
            current_ids_str = {str(cid).strip() for cid in current_ids}
            to_delete = list(existing_ids - current_ids_str)
            
            if not to_delete:
                self.logger.info(f"No stale {self.entity_type} to delete")
                return True
            # Log a small sample of IDs to be deleted for diagnostics
            try:
                sample_del = to_delete[:5]
                self.logger.info(f"Deleting {len(to_delete)} stale {self.entity_type}. Sample: {sample_del}")
            except Exception:
                self.logger.info(f"Deleting {len(to_delete)} stale {self.entity_type}")
            
            # Delete stale records
            return self.supabase.bulk_delete(table_name, to_delete)
            
        except Exception as e:
            self.logger.error(f"Error cleaning up {self.entity_type}: {e}")
            return False