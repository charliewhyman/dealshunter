"""
Base class for all uploaders.
"""

import json
import os
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pathlib import Path

from uploader.supabase_client import SupabaseClient
from core.file_manager import FileManager
from core.logger import uploader_logger
import config.settings as settings

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
        """Find JSON files for this entity type."""
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
            
            existing_ids = {item['id'] for item in result.data}
            to_delete = list(existing_ids - set(current_ids))
            
            if not to_delete:
                self.logger.info(f"No stale {self.entity_type} to delete")
                return True
            
            self.logger.info(f"Deleting {len(to_delete)} stale {self.entity_type}")
            
            # Delete stale records
            return self.supabase.bulk_delete(table_name, to_delete)
            
        except Exception as e:
            self.logger.error(f"Error cleaning up {self.entity_type}: {e}")
            return False