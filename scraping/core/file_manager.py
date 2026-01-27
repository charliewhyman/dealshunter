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
        
        # Create subdirectories for each entity type under raw and processed.
        # Also reorganize any existing files in processed root into the
        # corresponding processed/<entity>/ folder (pattern: *_<entity>_*.json)
        entity_types = ['shops', 'products']
        for entity_type in entity_types:
            (self.data_dirs['raw'] / entity_type).mkdir(exist_ok=True, parents=True)
            (self.data_dirs['processed'] / entity_type).mkdir(exist_ok=True, parents=True)

        # Reorganize files currently sitting in processed/ root into subfolders
        try:
            processed_root = self.data_dirs['processed']
            # Only move files whose filename follows the convention
            # <shop>_<entity>_<timestamp>.json where the second token
            # exactly equals the entity_type. This avoids substring
            # collisions.
            for p in sorted(processed_root.glob("*.json")):
                parts = p.name.split("_")
                if len(parts) < 3:
                    continue
                token = parts[1]
                if token in entity_types:
                    try:
                        target = self.data_dirs['processed'] / token / p.name
                        if not target.exists():
                            shutil.move(str(p), str(target))
                            uploader_logger.info(f"Reorganized processed file {p.name} -> processed/{token}/")
                    except Exception as e:
                        uploader_logger.error(f"Failed to reorganize {p}: {e}")
        except Exception:
            # Non-fatal; proceed
            pass
    
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
            # Determine entity subdirectory to preserve structure.
            entity_dir = None
            try:
                parent_name = filepath.parent.name
                if parent_name in ['shops', 'products',]:
                    entity_dir = parent_name
            except Exception:
                entity_dir = None

            # If not under a known parent, try to infer from filename pattern
            if not entity_dir:
                parts = filepath.name.split('_')
                if len(parts) >= 2 and parts[1] in ['shops', 'products']:
                    entity_dir = parts[1]

            if entity_dir:
                target_dir = self.data_dirs['processed'] / entity_dir
            else:
                target_dir = self.data_dirs['processed']

            target_dir.mkdir(parents=True, exist_ok=True)
            processed_path = target_dir / filepath.name
            shutil.move(str(filepath), str(processed_path))

            uploader_logger.info(f"Moved {filepath.name} to processed/{entity_dir or ''}".rstrip('/'))
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

    def restore_processed_to_raw(self, data_type: str) -> int:
        """Restore files matching the data_type from processed into raw.

        This moves files named like `<shop>_{data_type}_<timestamp>.json` from
        either `processed/` root or `processed/<data_type>/` into
        `raw/<data_type>/` so uploaders can pick them up where scrapers write.

        Returns the number of files moved.
        """
        moved = 0
        raw_dir = self.data_dirs['raw'] / data_type
        processed_dir = self.data_dirs['processed']
        processed_subdir = processed_dir / data_type

        raw_dir.mkdir(parents=True, exist_ok=True)

        # Helper to move files from a source directory matching pattern
        def _move_from(src_dir: Path):
            nonlocal moved
            if not src_dir.exists():
                return
            # Iterate all json files and only move those where the
            # second underscore-separated token exactly matches
            # the requested data_type. This avoids accidental
            # matches.
            for p in sorted(src_dir.glob("*.json")):
                parts = p.name.split("_")
                if len(parts) < 3:
                    continue
                if parts[1] != data_type:
                    continue
                target = raw_dir / p.name
                if target.exists():
                    uploader_logger.info(f"Skipping move; target already exists: {target}")
                    continue
                try:
                    shutil.move(str(p), str(target))
                    moved += 1
                    uploader_logger.info(f"Restored {p.name} -> {target}")
                except Exception as e:
                    uploader_logger.error(f"Failed to restore {p}: {e}")

        # Move from processed/<data_type>/ first
        _move_from(processed_subdir)

        # Then move matching files from processed/ root
        _move_from(processed_dir)

        return moved
    
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
                    
    def read_json(self, filepath: str) -> Optional[Dict[str, Any]]:
        """Read and parse a JSON file."""
        try:
            path = Path(filepath)
            if not path.exists():
                return None
            
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
                
        except Exception as e:
            scraper_logger.error(f"Failed to read JSON from {filepath}: {e}")
            return None
        
    def write_json(self, filepath: str, data: Dict[str, Any]) -> bool:
        """Write data to a JSON file."""
        try:
            path = Path(filepath)
            path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            scraper_logger.info(f"Wrote JSON to {filepath}")
            return True
            
        except Exception as e:
            scraper_logger.error(f"Failed to write JSON to {filepath}: {e}")
            return False