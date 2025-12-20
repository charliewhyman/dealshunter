"""
Supabase client with retry logic.
"""

import os
import time
import random
import socket
from urllib.parse import urlparse
from typing import Optional, Callable, Any, List, Dict
from supabase import create_client, Client
from dotenv import load_dotenv

from core.logger import uploader_logger
import config.settings as settings

class SupabaseClient:
    """Manages Supabase connections with retry patterns."""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """Initialize Supabase client from environment."""
        # Load environment variables
        load_dotenv(settings.ENV_FILE)
        
        SUPABASE_URL = os.environ.get("SUPABASE_URL")
        SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
        # Validate that the host in SUPABASE_URL resolves to avoid confusing
        # downstream errors like "nodename nor servname provided, or not known".
        try:
            parsed = urlparse(SUPABASE_URL)
            host = parsed.hostname
            if not host:
                raise ValueError(f"Invalid SUPABASE_URL: {SUPABASE_URL}")
            # attempt a DNS resolution
            socket.getaddrinfo(host, parsed.port or 443)
        except Exception as e:
            uploader_logger.error(f"SUPABASE host resolution failed for '{SUPABASE_URL}': {e}")
            raise

        self.client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    def get_fresh_client(self) -> Client:
        """Create a fresh Supabase client."""
        load_dotenv(settings.ENV_FILE)
        
        SUPABASE_URL = os.environ.get("SUPABASE_URL")
        SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
        # Validate host before creating client
        parsed = urlparse(SUPABASE_URL)
        host = parsed.hostname
        if not host:
            raise ValueError(f"Invalid SUPABASE_URL: {SUPABASE_URL}")
        try:
            socket.getaddrinfo(host, parsed.port or 443)
        except Exception as e:
            uploader_logger.error(f"SUPABASE host resolution failed for '{SUPABASE_URL}': {e}")
            raise

        return create_client(SUPABASE_URL, SUPABASE_KEY)
    
    def safe_execute(self, operation_fn: Callable, operation_name: str, 
                    max_retries: int = 3) -> Optional[Any]:
        """
        Execute with retries and fresh client on each attempt.
        """
        for attempt in range(max_retries):
            try:
                client = self.get_fresh_client()
                result = operation_fn(client)
                return result
            except Exception as e:
                error_msg = str(e)
                is_last = (attempt == max_retries - 1)
                
                if is_last:
                    uploader_logger.error(f"{operation_name} failed after {max_retries} attempts: {error_msg}")
                    return None
                else:
                    uploader_logger.warning(f"{operation_name} failed (attempt {attempt + 1}/{max_retries}): {error_msg}")
                    wait = (2 ** attempt) + random.uniform(0, 1)
                    uploader_logger.info(f"Retrying in {wait:.1f}s...")
                    time.sleep(wait)
        
        return None
    
    def bulk_upsert(self, table_name: str, data: List[Dict[str, Any]], 
                   batch_size: int = 100, on_conflict: Optional[str] = "id", 
                   retries: int = 3) -> bool:
        """
        Bulk upsert with batch processing.
        """
        if not data:
            uploader_logger.warning(f"No data to upsert to {table_name}")
            return True
        
        total_batches = (len(data) + batch_size - 1) // batch_size
        
        for i in range(0, len(data), batch_size):
            batch = data[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            # If an ON CONFLICT target is provided, deduplicate records within
            # the batch by those key(s) to avoid Postgres error 21000 where
            # multiple rows in the same insert share the same constrained
            # value and would cause the same row to be affected more than
            # once during ON CONFLICT DO UPDATE.
            deduped_batch = batch
            if on_conflict:
                try:
                    keys = [k.strip() for k in str(on_conflict).split(',') if k.strip()]
                    seen = {}
                    for rec in batch:
                        key = tuple(rec.get(k) for k in keys)
                        # keep the last occurrence for this key
                        seen[key] = rec

                    if len(seen) != len(batch):
                        deduped_batch = list(seen.values())
                        uploader_logger.info(f"Deduplicated batch {batch_num}: removed {len(batch)-len(deduped_batch)} duplicate(s) based on {keys}")
                except Exception:
                    # If anything goes wrong with dedupe, fall back to original batch
                    deduped_batch = batch
            
            def do_upsert(client):
                # Only pass an ON CONFLICT target when it's provided. Some tables
                # (like `shops`) may not have a unique constraint on the chosen
                # column, so callers can return None to do plain inserts.
                if on_conflict:
                    return client.table(table_name).upsert(deduped_batch, on_conflict=on_conflict).execute()
                return client.table(table_name).upsert(deduped_batch).execute()
            
            result = self.safe_execute(
                do_upsert,
                f"Upsert batch {batch_num}/{total_batches} to {table_name} ({len(batch)} records)",
                max_retries=retries
            )
            
            if not result or not hasattr(result, 'data'):
                uploader_logger.error(f"Failed batch {batch_num} for {table_name}")
                return False
            
            uploader_logger.info(f"Batch {batch_num}/{total_batches} upserted to {table_name}")
            
            # Small delay between batches
            if batch_num < total_batches:
                time.sleep(0.5)
        
        return True
    
    def bulk_delete(self, table_name: str, ids: List[str], 
                   id_column: str = "id", batch_size: int = 100) -> bool:
        """
        Bulk delete records by ID.
        """
        if not ids:
            return True
        
        total_batches = (len(ids) + batch_size - 1) // batch_size
        
        for i in range(0, len(ids), batch_size):
            batch = ids[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            
            def do_delete(client):
                return client.table(table_name).delete().in_(id_column, batch).execute()
            
            result = self.safe_execute(
                do_delete,
                f"Delete batch {batch_num}/{total_batches} from {table_name} ({len(batch)} records)",
                max_retries=3
            )
            
            if result:
                uploader_logger.info(f"Batch {batch_num}/{total_batches} deleted from {table_name}")
            else:
                uploader_logger.error(f"Failed to delete batch {batch_num} from {table_name}")
        
        return True