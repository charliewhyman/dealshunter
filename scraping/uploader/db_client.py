"""
PostgreSQL client using psycopg 3 (replacing Supabase client).
"""
import os
import time
import random
import logging
from typing import Optional, Callable, Any, List, Dict, Union
from psycopg import connect, Connection, Cursor
from psycopg.rows import dict_row
from psycopg.errors import UniqueViolation, OperationalError

from dotenv import load_dotenv
from core.logger import uploader_logger
import config.settings as settings

# Load .env file once at module import (only if it exists)
if settings.ENV_FILE.exists():
    load_dotenv(settings.ENV_FILE)

class DatabaseClient:
    """Manages PostgreSQL connections with retry patterns."""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """Initialize Database configuration."""
        self.connection_string = os.environ.get("VITE_DATABASE_URL")
        # Fallback to DATABASE_URL if VITE_DATABASE_URL is not set
        if not self.connection_string:
             self.connection_string = os.environ.get("DATABASE_URL")

        if not self.connection_string:
            raise ValueError("VITE_DATABASE_URL or DATABASE_URL not set")

    def get_connection(self) -> Connection:
        """Create a fresh database connection."""
        try:
            return connect(self.connection_string, row_factory=dict_row, autocommit=True)
        except Exception as e:
            uploader_logger.error(f"Database connection failed: {e}")
            raise

    def safe_execute(self, operation_fn: Callable[[Connection], Any], operation_name: str, 
                    max_retries: int = 3) -> Optional[Any]:
        """
        Execute with retries and fresh connection on each attempt.
        """
        for attempt in range(max_retries):
            conn = None
            try:
                conn = self.get_connection()
                result = operation_fn(conn)
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
            finally:
                if conn:
                    conn.close()
        
        return None

    def bulk_upsert(self, table_name: str, data: List[Dict[str, Any]], 
                   batch_size: int = 100, on_conflict: Optional[str] = "id", 
                   retries: int = 3) -> bool:
        """
        Bulk upsert with batch processing using SQL INSERT ... ON CONFLICT.
        """
        if not data:
            uploader_logger.warning(f"No data to upsert to {table_name}")
            return True
        
        total_batches = (len(data) + batch_size - 1) // batch_size
        
        for i in range(0, len(data), batch_size):
            batch = data[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            
            # Deduplication logic (same as original)
            deduped_batch = batch
            if on_conflict:
                try:
                    keys = [k.strip() for k in str(on_conflict).split(',') if k.strip()]
                    seen = {}
                    for rec in batch:
                        # Extract key values. If key missing, use None?
                        # Assuming records have all keys.
                        key_val = tuple(rec.get(k) for k in keys)
                        seen[key_val] = rec
                    
                    if len(seen) != len(batch):
                        deduped_batch = list(seen.values())
                        uploader_logger.info(f"Deduplicated batch {batch_num}: removed {len(batch)-len(deduped_batch)} duplicate(s) based on {keys}")
                except Exception as e:
                    uploader_logger.warning(f"Deduplication failed: {e}. Proceeding with original batch.")
                    deduped_batch = batch

            if not deduped_batch:
                continue

            # Prepare SQL
            # Assuming all records in batch have same keys.
            first_record = deduped_batch[0]
            columns = list(first_record.keys())
            
            # Filter out keys not present in first record (if any inconsistency, executemany might fail or we should normalize)
            # We assume consistency for now.
            
            cols_str = ', '.join(f'"{c}"' for c in columns)
            vals_str = ', '.join(['%s'] * len(columns))
            
            sql = f'INSERT INTO "{table_name}" ({cols_str}) VALUES ({vals_str})'
            
            if on_conflict:
                conflict_keys = [k.strip() for k in str(on_conflict).split(',') if k.strip()]
                conflict_clause = ', '.join(f'"{k}"' for k in conflict_keys)
                
                # UPDATE SET col = EXCLUDED.col
                # We exclude the conflict keys from update
                update_cols = [c for c in columns if c not in conflict_keys]
                
                if update_cols:
                    set_clause = ', '.join(f'"{c}" = EXCLUDED."{c}"' for c in update_cols)
                    sql += f' ON CONFLICT ({conflict_clause}) DO UPDATE SET {set_clause}'
                else:
                    sql += f' ON CONFLICT ({conflict_clause}) DO NOTHING'

            # Prepare values list
            values_list = [
                tuple(rec.get(c) for c in columns) for rec in deduped_batch
            ]

            def do_upsert(conn: Connection):
                with conn.cursor() as cur:
                    cur.executemany(sql, values_list)
                    return True

            result = self.safe_execute(
                do_upsert,
                f"Upsert batch {batch_num}/{total_batches} to {table_name} ({len(deduped_batch)} records)",
                max_retries=retries
            )
            
            if not result:
                uploader_logger.error(f"Failed batch {batch_num} for {table_name}")
                return False
            
            uploader_logger.info(f"Batch {batch_num}/{total_batches} upserted to {table_name}")
            
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
            
            sql = f'DELETE FROM "{table_name}" WHERE "{id_column}" = ANY(%s)'

            def do_delete(conn: Connection):
                with conn.cursor() as cur:
                    cur.execute(sql, (batch,))
                    return True
            
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

    def execute_query(self, query: str, params: Union[List, Tuple, Dict] = None, fetch_all: bool = False) -> Any:
        """Execute a raw query."""
        def do_query(conn: Connection):
            with conn.cursor() as cur:
                cur.execute(query, params)
                if fetch_all:
                    return cur.fetchall()
                # Try simple execute, return something if needed. 
                # If command is SELECT, maybe return items.
                if cur.description:
                    return cur.fetchall()
                return None

        return self.safe_execute(do_query, "Execute Query")
