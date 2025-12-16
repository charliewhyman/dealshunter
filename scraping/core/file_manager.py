"""
File management for scraped data.
"""

import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
import config.settings as settings
from core.logger import scraper_logger, uploader_logger

class FileManager:
    """Manages file operations for scraped data."""
    
    def __init__(self):
        self.data_dirs = {
            'raw': settings.RAW_DATA_DIR,
            'processed': settings.PROCESSED_DATA_DIR,
            'archive': settings.ARCHIVE_DIR
        }
        
        # Create subdirectories for each entity type
        for entity_type in ['shops', 'collections', 'products', 'collection_products']:
            (self.data_dirs['raw'] / entity_type).mkdir(exist_ok=True, parents=True)
    
    def save_raw_data(self, data: List[Dict[str, Any]], shop_id: str, 
                     data_type: str, timestamp: Optional[str] = None) -> Path:
        """Save raw scraped data to file."""
        if not timestamp:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        filename = f"{shop_id}_{data_type}_{timestamp}.json"
        filepath = self.data_dirs['raw'] / data_type / filename
        
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            scraper_logger.info(f"Saved {len(data)} {data_type} to {filepath}")
            return filepath
            
        except Exception as e:
            scraper_logger.error(f"Failed to save {data_type} data: {e}")
            raise
    
    def get_raw_files(self, data_type: str) -> List[Path]:
        """Get all raw files for a data type."""
        dir_path = self.data_dirs['raw'] / data_type
        if not dir_path.exists():
            return []
        
        return sorted(dir_path.glob("*.json"))
    
    def get_latest_file(self, shop_id: str, data_type: str) -> Optional[Path]:
        """Get the latest file for a specific shop and data type."""
        dir_path = self.data_dirs['raw'] / data_type
        if not dir_path.exists():
            return None
        
        pattern = f"{shop_id}_{data_type}_*.json"
        files = sorted(dir_path.glob(pattern))
        
        return files[-1] if files else None
    
    def move_to_processed(self, filepath: Path) -> bool:
        """Move file to processed directory."""
        try:
            if not filepath.exists():
                return False
            
            processed_path = self.data_dirs['processed'] / filepath.name
            shutil.move(str(filepath), str(processed_path))
            
            uploader_logger.info(f"Moved {filepath.name} to processed")
            return True
            
        except Exception as e:
            uploader_logger.error(f"Failed to move {filepath}: {e}")
            return False
    
    def archive_file(self, filepath: Path, prefix: str = "") -> bool:
        """Archive file with timestamp."""
        try:
            if not filepath.exists():
                return False
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            archived_name = f"{prefix}_{filepath.stem}_{timestamp}{filepath.suffix}"
            archived_path = self.data_dirs['archive'] / archived_name
            
            shutil.move(str(filepath), str(archived_path))
            
            uploader_logger.info(f"Archived {filepath.name}")
            return True
            
        except Exception as e:
            uploader_logger.error(f"Failed to archive {filepath}: {e}")
            return False
    
    def clean_old_files(self, data_type: str, keep_last: int = 3):
        """Clean old files, keeping only the most recent ones."""
        dir_path = self.data_dirs['raw'] / data_type
        if not dir_path.exists():
            return
        
        files = sorted(dir_path.glob("*.json"), key=lambda x: x.stat().st_mtime)
        
        if len(files) > keep_last:
            files_to_delete = files[:-keep_last]
            for filepath in files_to_delete:
                try:
                    filepath.unlink()
                    scraper_logger.info(f"Deleted old file: {filepath.name}")
                except Exception as e:
                    scraper_logger.error(f"Failed to delete {filepath}: {e}")