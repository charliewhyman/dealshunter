"""
Process size groups for variants.
"""

import os
from typing import Dict, Optional, Any, Sequence, cast
from supabase import create_client
from dotenv import load_dotenv

from core.logger import processor_logger
import config.settings as settings
from uploader.supabase_client import SupabaseClient

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
        # Build a cached, sorted list of (size_lower, id) tuples for matching
        try:
            cleaned = []
            for sg in self.size_groups:
                size_val = sg.get('size')
                sid = sg.get('id')
                if size_val and sid is not None:
                    s = str(size_val).strip()
                    if s:
                        cleaned.append((s.lower(), str(sid)))

            # Sort by length descending so longer (more specific) sizes match first
            self._sorted_size_groups = sorted(cleaned, key=lambda x: len(x[0]), reverse=True)
            processor_logger.info(f"Cached {len(self._sorted_size_groups)} size groups for matching")
            if self._sorted_size_groups:
                sample_count = min(10, len(self._sorted_size_groups))
                sample = ", ".join([f"'{s}'->{i}" for s, i in self._sorted_size_groups[:sample_count]])
                processor_logger.debug(f"Sample size groups: {sample}")
        except Exception:
            self._sorted_size_groups = []
    def match_size_group(self, variant_title: Optional[str]) -> Optional[str]:
        """Match variant title to size group."""
        title = (variant_title or "").strip()
        if not title:
            return self.unknown_size_group_id
        import re

        title_lower = title.lower()

        # If no size groups loaded, return Unknown
        if not getattr(self, '_sorted_size_groups', None):
            return self.unknown_size_group_id

        # Try to match each size group using word boundaries to avoid partial matches
        for size_str, sid in self._sorted_size_groups:
            # exact word match (case-insensitive)
            try:
                pattern = r"\b" + re.escape(size_str) + r"\b"
                if re.search(pattern, title_lower):
                    return sid
            except re.error:
                # fallback to substring match if regex invalid for some reason
                if size_str in title_lower:
                    return sid

        # No match — use Unknown group id
        return self.unknown_size_group_id
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
            processor_logger.info(f"Processing batch {batch_count}: fetched {len(variants)} variants")

            # Log a sample of variants and the computed size_group mapping for quick debugging
            try:
                sample_n = min(10, len(variants))
                for v in variants[:sample_n]:
                    if not isinstance(v, dict):
                        continue
                    raw_title = v.get('title')
                    title = str(raw_title) if raw_title is not None else ""
                    try:
                        mapped = self.match_size_group(title)
                    except Exception as e:
                        mapped = None
                        processor_logger.debug(f"Error matching variant id={v.get('id')}: {e}")
                    processor_logger.debug(f"Sample variant id={v.get('id')} title='{title}' => size_group_id={mapped}")
            except Exception:
                # Don't fail processing due to logging
                pass
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

            # Update variants in batch using bulk upsert to avoid many small HTTP/2 requests
            if updates:
                try:
                    sup = SupabaseClient()
                    # Use bulk_upsert which will perform batched upserts using a fresh client per attempt
                    success = sup.bulk_upsert("variants", updates, batch_size=len(updates), on_conflict="id", retries=3)

                    if success:
                        total_processed += len(updates)
                        processor_logger.info(
                            f"Batch {batch_count}: Updated {len(updates)} variants. "
                            f"Total: {total_processed}"
                        )
                    else:
                        # Fallback: attempt per-record update with fresh client per request
                        processor_logger.error(f"Batch {batch_count}: bulk_upsert failed; falling back to individual updates")
                        try:
                            for update in updates:
                                client = sup.get_fresh_client()
                                client.table("variants").update({"size_group_id": update["size_group_id"]}).eq("id", update["id"]).execute()

                            total_processed += len(updates)
                            processor_logger.info(
                                f"Batch {batch_count}: Updated {len(updates)} variants (fallback). Total: {total_processed}"
                            )
                        except Exception as e:
                            processor_logger.error(f"Fallback per-record update also failed for batch {batch_count}: {e}")

                except Exception as e:
                    processor_logger.error(f"Error updating batch {batch_count}: {e}")
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