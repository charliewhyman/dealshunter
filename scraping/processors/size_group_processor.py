"""
Process size groups for variants.
"""

import os
from typing import Dict, Optional, Any, Sequence, cast
from supabase import create_client
from dotenv import load_dotenv

from core.logger import processor_logger
import config.settings as settings

class SizeGroupProcessor:
    """Process size groups for variants."""
    
    def __init__(self):
        load_dotenv(settings.ENV_FILE)
        
        SUPABASE_URL = os.environ.get("SUPABASE_URL")
        SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
        
        self.supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        # use a Sequence of dicts to avoid invariant list/JSON typing issues
        self.size_groups: Sequence[Dict[str, Any]] = []
        self.unknown_size_group_id: Optional[str] = None
        
    def initialize(self):
        # Fetch all size groups
        response = self.supabase.table("size_groups").select("id,size").execute()
        data = response.data or []
        # ensure we have a sequence of dict-like items
        self.size_groups = cast(Sequence[Dict[str, Any]], [d for d in data if isinstance(d, dict)])
        processor_logger.info(f"Found {len(list(self.size_groups))} size groups")
        
        # Get or create "Unknown" size group
        unknown_resp = self.supabase.table("size_groups")\
            .select("id").eq("size", "Unknown").execute()
        unknown_group = unknown_resp.data or []
        
        if not unknown_group:
            # Create Unknown size group
            result = self.supabase.table("size_groups")\
                .insert({"size": "Unknown"}).execute()
            rows = result.data or []
            if rows and isinstance(rows[0], dict):
                id_val = rows[0].get("id")
                if id_val is not None:
                    self.unknown_size_group_id = str(id_val)
        else:
            # Use existing Unknown group id if present
            if isinstance(unknown_group[0], dict):
                id_val = unknown_group[0].get("id")
                if id_val is not None:
                    self.unknown_size_group_id = str(id_val)
    def match_size_group(self, variant_title: Optional[str]) -> Optional[str]:
        """Match variant title to size group."""
        title = (variant_title or "").strip()
        if not title:
            return self.unknown_size_group_id
        
        # Sort size groups by length (longest first) for more specific matches
    def process_variants(self, batch_size: int = 100) -> Dict[str, int]:
        """Process variants in batches and assign size_group_id when matched."""
        total_processed = 0
        batch_count = 0

        while True:
            # Fetch variants without size_group_id
            response = self.supabase.table("variants")\
                .select("id,title")\
                .is_("size_group_id", "null")\
                .limit(batch_size)\
                .execute()

            variants = response.data or []
            if not variants:
                processor_logger.info("No more variants to process")
                break

            batch_count += 1
            updates = []

            for variant in variants:
                if not isinstance(variant, dict):
                    continue
                raw_title = variant.get("title")
                title = str(raw_title) if raw_title is not None else ""
                size_group_id = self.match_size_group(title)
                updates.append({
                    "id": variant.get("id"),
                    "size_group_id": size_group_id
                })

            # Update variants in batch
            try:
                for update in updates:
                    self.supabase.table("variants")\
                        .update({"size_group_id": update["size_group_id"]})\
                        .eq("id", update["id"]).execute()

                total_processed += len(updates)
                processor_logger.info(
                    f"Batch {batch_count}: Updated {len(updates)} variants. "
                    f"Total: {total_processed}"
                )

            except Exception as e:
                processor_logger.error(f"Error updating batch {batch_count}: {e}")
                # Continue with next batch

        processor_logger.info(f"Completed! Total variants processed: {total_processed}")

        return {
            "total_processed": total_processed,
            "batches_processed": batch_count
        }
                # Continue with next batch
        
        processor_logger.info(f"Completed! Total variants processed: {total_processed}")
        
        return {
            "total_processed": total_processed,
            "batches_processed": batch_count
        }
    
    def run(self) -> Dict[str, int]:
        """Run the complete size group processing."""
        self.initialize()
        return self.process_variants()

if __name__ == "__main__":
    processor = SizeGroupProcessor()
    results = processor.run()
    print(f"Results: {results}")