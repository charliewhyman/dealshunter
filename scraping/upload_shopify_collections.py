import logging
import os
import json
import sys
import time
import random
from supabase import create_client
from dotenv import load_dotenv, find_dotenv

# Configure logging
logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Load environment variables
env_file = os.environ.get("UV_ENV_FILE")
if env_file:
    load_dotenv(env_file)
else:
    dotenv_path = find_dotenv()
    if dotenv_path:
        load_dotenv(dotenv_path)

# Initialize Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")

def get_fresh_client():
    """Create a fresh Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def safe_execute(operation_fn, operation_name, max_retries=3):
    """
    Execute a Supabase operation with retries and fresh client on connection errors.
    
    Args:
        operation_fn: Function that takes a supabase client and returns the result
        operation_name: Description for logging
        max_retries: Maximum number of retry attempts
    """
    for attempt in range(max_retries):
        try:
            client = get_fresh_client()
            result = operation_fn(client)
            return result
        except Exception as e:
            error_msg = str(e)
            is_last_attempt = (attempt == max_retries - 1)
            
            if is_last_attempt:
                logger.error(f"{operation_name} failed after {max_retries} attempts: {error_msg}")
                return None
            else:
                logger.warning(f"{operation_name} failed (attempt {attempt + 1}/{max_retries}): {error_msg}")
                # Wait with exponential backoff
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                logger.info(f"   Retrying in {wait_time:.1f}s...")
                time.sleep(wait_time)
    
    return None

def upsert_collections(collections, shop_id):
    """Upsert collections in small batches."""
    if not collections:
        logger.info(f"No collections to upsert for shop {shop_id}")
        return True
    
    logger.info(f"Upserting {len(collections)} collections for shop {shop_id}...")
    
    batch_size = 20
    total_batches = (len(collections) + batch_size - 1) // batch_size
    
    for i in range(0, len(collections), batch_size):
        batch = collections[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        
        def do_upsert(client):
            return client.table("collections").upsert(batch, on_conflict="id").execute()
        
        result = safe_execute(
            do_upsert,
            f"Upsert batch {batch_num}/{total_batches} ({len(batch)} records)",
            max_retries=3
        )
        
        if result:
            logger.info(f"✓ Batch {batch_num}/{total_batches} complete")
        else:
            logger.error(f"✗ Batch {batch_num}/{total_batches} failed")
            return False
        
        # Small delay between batches
        if batch_num < total_batches:
            time.sleep(0.5)
    
    return True

def get_existing_collection_ids(shop_id):
    """Get all existing collection IDs for a shop."""
    def do_select(client):
        return client.table("collections").select("id").eq("shop_id", shop_id).execute()
    
    result = safe_execute(
        do_select,
        f"Fetch existing collections for shop {shop_id}",
        max_retries=3
    )
    
    if result and result.data:
        return {item["id"] for item in result.data}
    return set()

def delete_stale_collections(current_ids, shop_id):
    """Delete collections that no longer exist."""
    existing_ids = get_existing_collection_ids(shop_id)
    to_delete = list(existing_ids - set(current_ids))
    
    if not to_delete:
        logger.info(f"✓ No stale collections for shop {shop_id}")
        return True
    
    logger.info(f"Deleting {len(to_delete)} stale collections for shop {shop_id}...")
    
    batch_size = 10
    total_batches = (len(to_delete) + batch_size - 1) // batch_size
    
    for i in range(0, len(to_delete), batch_size):
        batch = to_delete[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        
        def do_delete(client):
            return client.table("collections").delete().in_("id", batch).execute()
        
        result = safe_execute(
            do_delete,
            f"Delete batch {batch_num}/{total_batches} ({len(batch)} records)",
            max_retries=3
        )
        
        if result:
            logger.info(f"✓ Batch {batch_num}/{total_batches} deleted")
        else:
            logger.error(f"✗ Batch {batch_num}/{total_batches} failed")
        
        # Delay between delete batches
        if batch_num < total_batches:
            time.sleep(1.0)
    
    return True

def process_collections_file(filepath, shop_id):
    """Process a single collections JSON file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            collections_data = json.load(f)
        
        collections = []
        skipped = 0
        
        for collection in collections_data:
            if not isinstance(collection, dict):
                continue
            
            collection_id = collection.get("id")
            if not collection_id:
                skipped += 1
                continue
            
            collections.append({
                "id": collection_id,
                "title": collection.get("title"),
                "handle": collection.get("handle"),
                "description": collection.get("description"),
                "products_count": collection.get("products_count"),
                "shop_id": shop_id,
                "collection_url": collection.get("collection_url"),
                "published_at_external": collection.get("published_at"),
                "updated_at_external": collection.get("updated_at"),
            })
        
        if skipped > 0:
            logger.warning(f"Skipped {skipped} collections without IDs")
        
        if not collections:
            logger.info(f"No valid collections found in {filepath}")
            return True
        
        # Upsert collections
        success = upsert_collections(collections, shop_id)
        if not success:
            return False
        
        # Clean up stale collections
        collection_ids = [c["id"] for c in collections]
        delete_stale_collections(collection_ids, shop_id)
        
        return True
        
    except Exception as e:
        logger.error(f"Error processing file {filepath}: {e}")
        return False

def process_shop(shop_data):
    """Process all collections for a single shop."""
    shop_id = shop_data.get("id")
    shop_name = shop_data.get("name", shop_id)
    
    logger.info(f"\n{'='*60}")
    logger.info(f"Processing shop: {shop_name} (ID: {shop_id})")
    logger.info(f"{'='*60}")
    
    # Find collections file for this shop
    output_folder = "output"
    if not os.path.exists(output_folder):
        logger.error(f"Output folder '{output_folder}' not found")
        return False
    
    json_files = [
        f for f in os.listdir(output_folder)
        if f.endswith("_collections.json")
    ]
    
    if not json_files:
        logger.warning(f"No collection files found in {output_folder}")
        return False
    
    # Process each collections file
    for json_file in json_files:
        filepath = os.path.join(output_folder, json_file)
        logger.info(f"Processing file: {json_file}")
        
        success = process_collections_file(filepath, shop_id)
        if not success:
            logger.error(f"Failed to process {json_file}")
            return False
        
        # Small delay between files
        time.sleep(0.5)
    
    logger.info(f"Shop {shop_name} complete\n")
    return True

def main():
    """Main entry point."""
    # Load shop data
    shop_file = "shop_urls.json"
    if not os.path.exists(shop_file):
        logger.error(f"{shop_file} not found")
        return 1
    
    with open(shop_file, "r", encoding="utf-8") as f:
        shops = json.load(f)
    
    logger.info(f"Starting upload for {len(shops)} shops")
    logger.info(f"Processing sequentially to avoid connection issues\n")
    
    successful = 0
    failed = 0
    
    for idx, shop_data in enumerate(shops, 1):
        logger.info(f"Progress: {idx}/{len(shops)}")
        
        if process_shop(shop_data):
            successful += 1
        else:
            failed += 1
        
        # Brief pause between shops
        if idx < len(shops):
            time.sleep(1.0)
    
    logger.info(f"\n{'='*60}")
    logger.info(f"Upload complete!")
    logger.info(f"   Successful: {successful}")
    logger.info(f"   Failed: {failed}")
    logger.info(f"{'='*60}")
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        logger.info("Upload interrupted by user")
        sys.exit(130)