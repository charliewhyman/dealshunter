# core/state_manager.py
"""
State manager for tracking scraped data across runs.
"""

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import hashlib

from core.file_manager import FileManager
from core.cache_manager import CacheManager


class StateManager:
    """Manages scraper state across runs using files and cache."""
    
    def __init__(self, data_dir: str = "data/scraper_state"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.file_manager = FileManager()
        self.cache = CacheManager()
        
        # In-memory cache for performance
        self.memory_cache = {}
        self.cache_ttl = 300  # 5 minutes
        
    def get_shop_state(self, shop_id: str) -> Dict[str, Any]:
        """Get shop's scraping state with multiple fallbacks."""
        # Check memory cache first
        cache_key = f"shop_state_{shop_id}"
        if cache_key in self.memory_cache:
            cached = self.memory_cache[cache_key]
            if time.time() - cached.get('_timestamp', 0) < self.cache_ttl:
                return cached
        
        # Check file state
        state_file = self.data_dir / f"{shop_id}_state.json"
        state_data = {}
        
        if state_file.exists():
            try:
                state_data = self.file_manager.read_json(str(state_file)) or {}
            except:
                pass
        
        # Add timestamp for cache invalidation
        state_data['_timestamp'] = time.time()
        self.memory_cache[cache_key] = state_data
        
        return state_data
    
    def update_shop_state(self, shop_id: str, data_type: str, 
                         item_count: int = 0, items: Optional[List[Dict]] = None):
        """Update shop's state after scraping a specific data type."""
        state = self.get_shop_state(shop_id)
        
        timestamp = datetime.now().isoformat()
        
        # Update state for this data type
        if data_type not in state:
            state[data_type] = {}
        
        state[data_type].update({
            'last_scraped': timestamp,
            'item_count': item_count,
            'items_scraped': item_count,
        })
        
        # Store minimal item metadata for change detection
        if items and len(items) > 0:
            # Store just enough to detect changes
            item_versions = {}
            for item in items[:1000]:  # Limit to prevent huge files
                handle = item.get('handle') or item.get('id') or str(item.get('title', ''))
                if handle:
                    # Create a hash of key fields for change detection
                    key_fields = {
                        'updated_at': item.get('updated_at'),
                        'title': item.get('title'),
                        'price': item.get('price'),
                    }
                    item_hash = hashlib.md5(
                        json.dumps(key_fields, sort_keys=True).encode()
                    ).hexdigest()[:8]
                    
                    item_versions[handle] = {
                        'hash': item_hash,
                        'updated_at': item.get('updated_at'),
                        'timestamp': timestamp
                    }
            
            state[data_type]['item_versions'] = item_versions
        
        # Save to file
        state_file = self.data_dir / f"{shop_id}_state.json"
        try:
            # Remove cache timestamp before saving
            if '_timestamp' in state:
                del state['_timestamp']
            
            self.file_manager.write_json(str(state_file), state)
            
            # Update memory cache
            state['_timestamp'] = time.time()
            self.memory_cache[f"shop_state_{shop_id}"] = state
            
        except Exception as e:
            print(f"Warning: Could not save shop state: {e}")
    
    def should_skip_data_type(self, shop_id: str, data_type: str, 
                             hours_threshold: int = 6) -> bool:
        """Check if we should skip scraping this data type for this shop."""
        state = self.get_shop_state(shop_id)
        type_state = state.get(data_type, {})
        last_scraped = type_state.get('last_scraped')
        
        if not last_scraped:
            return False  # Never scraped before
        
        try:
            last_time = datetime.fromisoformat(last_scraped.replace('Z', '+00:00'))
            hours_since = (datetime.now() - last_time).total_seconds() / 3600
            
            # Skip if scraped recently
            if hours_since < hours_threshold:
                return True
        except:
            pass
        
        return False
    
    def get_item_version(self, shop_id: str, data_type: str, 
                        item_handle: str) -> Optional[str]:
        """Get version hash of an item."""
        state = self.get_shop_state(shop_id)
        type_state = state.get(data_type, {})
        item_versions = type_state.get('item_versions', {})
        
        item_info = item_versions.get(item_handle)
        return item_info.get('hash') if item_info else None
    
    def get_item_updated_at(self, shop_id: str, data_type: str,
                           item_handle: str) -> Optional[str]:
        """Get last updated_at timestamp of an item."""
        state = self.get_shop_state(shop_id)
        type_state = state.get(data_type, {})
        item_versions = type_state.get('item_versions', {})
        
        item_info = item_versions.get(item_handle)
        return item_info.get('updated_at') if item_info else None
    
    def cleanup_old_versions(self, data_type: str, keep_days: int = 30):
        """Clean up old version data to prevent state files from growing too large."""
        cutoff_time = time.time() - (keep_days * 24 * 3600)
        
        for state_file in self.data_dir.glob("*_state.json"):
            try:
                state = self.file_manager.read_json(str(state_file))
                if not state:
                    continue
                
                type_state = state.get(data_type, {})
                item_versions = type_state.get('item_versions', {})
                
                # Remove versions older than cutoff
                if item_versions:
                    filtered = {}
                    for handle, info in item_versions.items():
                        timestamp_str = info.get('timestamp')
                        if timestamp_str:
                            try:
                                item_time = datetime.fromisoformat(
                                    timestamp_str.replace('Z', '+00:00')
                                ).timestamp()
                                if item_time > cutoff_time:
                                    filtered[handle] = info
                            except:
                                filtered[handle] = info  # Keep if can't parse
                    
                    if len(filtered) < len(item_versions):
                        type_state['item_versions'] = filtered
                        state[data_type] = type_state
                        self.file_manager.write_json(str(state_file), state)
                        
            except Exception as e:
                print(f"Warning: Could not clean up {state_file}: {e}")
    
    def get_all_shop_ids(self) -> List[str]:
        """Get all shop IDs that have state files."""
        return [f.stem.replace('_state', '') 
                for f in self.data_dir.glob("*_state.json")]