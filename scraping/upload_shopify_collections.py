import logging
import os
import json
import sys
import time
from supabase import create_client
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from multiprocessing import cpu_count
from dotenv import load_dotenv, find_dotenv

# Configure logging early so dotenv loading can report via logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

# Load environment variables from a dotenv file if present. Respect
# the `UV_ENV_FILE` environment variable when set (used by `uv run`).
env_file = os.environ.get("UV_ENV_FILE")
loaded_env_path = None
if env_file:
    try:
        load_dotenv(env_file)
        loaded_env_path = env_file
    except Exception:
        logger.warning(f"Failed to load env from UV_ENV_FILE={env_file}")
else:
    dotenv_path = find_dotenv()
    if dotenv_path:
        load_dotenv(dotenv_path)
        loaded_env_path = dotenv_path

if loaded_env_path:
    logger.info(f"Loaded environment variables from: {loaded_env_path}")

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in environment variables.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def bulk_upsert_data(table_name, data, batch_size=100, retries=3, raise_on_empty=False):
    """Bulk upsert data to Supabase with deduplication and error handling."""
    # Filter out items that don't have a valid id (null/None/empty)
    valid_data = []
    invalid_count = 0
    for item in data:
        item_id = item.get("id") if isinstance(item, dict) else None
        if item_id is None:
            invalid_count += 1
        else:
            valid_data.append(item)

    if invalid_count:
        logger.warning(f"Skipping {invalid_count} items without a valid 'id' for table '{table_name}'.")

    seen_ids = set()
    deduplicated_data = []
    for item in valid_data:
        if item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            deduplicated_data.append(item)

    if not deduplicated_data:
        if raise_on_empty:
            raise RuntimeError(f"No valid data to upsert for table '{table_name}' after required-field filtering")
        logger.info(f"No valid data to upsert for table '{table_name}' after filtering; skipping.")
    
    # Process batches
    for i in range(0, len(deduplicated_data), batch_size):
        batch = deduplicated_data[i:i + batch_size]
        for attempt in range(retries):
            try:
                response = supabase.table(table_name).upsert(batch, on_conflict="id").execute()
                if response.data:
                    logger.info(f"Upserted batch {i // batch_size}: {len(batch)} records.")
                    break
                else:
                    logger.warning(f"Unexpected response in batch {i // batch_size}: {response}")
            except (requests.exceptions.RequestException, json.JSONDecodeError) as e:
                logger.error(f"Error in batch {i // batch_size}, attempt {attempt + 1}: {e}")
                if attempt == retries - 1:
                    raise
                time.sleep(5)

class CollectionProcessor:
    """Helper class to process and upload collection data."""
    def __init__(self):
        self.collections = []

    def process_collection(self, collection, shop_id):
        """Process a single collection and its related data."""
        if not isinstance(collection, dict):
            logger.error(f"Error processing collection: Expected a dictionary but got {type(collection).__name__}")
            return

        try:
            collection_id = collection.get("id")
            if collection_id is None:
                logger.warning(f"Skipping collection without 'id' for shop {shop_id}: {collection.get('handle') or collection.get('collection_url')}")
                return

            fields = {
                "id": collection_id,
                "title": collection.get("title"),
                "handle": collection.get("handle"),
                "description": collection.get("description"),
                "products_count": collection.get("products_count"),
                "shop_id": shop_id,
                "collection_url": collection.get("collection_url"),
                "published_at_external": collection.get("published_at"),
                "updated_at_external": collection.get("updated_at"),
            }

            self.collections.append(fields)

            # collection images are not used by the app; skip collecting them
        except Exception as e:
            logger.error(f"Error processing collection {collection.get('id', 'unknown')}: {e}")

def process_collections_file(filepath, shop_id):
    """Process a JSON file containing collection data and upload to Supabase."""
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            collections = json.load(file)

        processor = CollectionProcessor()
        for collection in collections:
            processor.process_collection(collection, shop_id)

        if processor.collections:
            logger.info(f"Upserting {len(processor.collections)} collections...")
            bulk_upsert_data("collections", processor.collections)

        # Images are not used in the app; do not upload collection images to avoid
        # FK constraint errors and unnecessary data storage.

        # 🧹 Remove stale collections (and images) no longer in the file
        current_ids = [c["id"] for c in processor.collections if "id" in c]
        remove_deleted_collections(current_ids, shop_id)

    except requests.exceptions.RequestException as e:
        logger.error(f"Error communicating with Supabase: {e}")
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Error processing file {filepath}: {e}")

def get_collection_json_files(output_folder):
    """Get all JSON files from the output folder."""
    return [os.path.join(output_folder, f) for f in os.listdir(output_folder) if f.endswith("_collections.json")]

def remove_deleted_collections(current_collection_ids, shop_id):
    """Remove collections (and their images) from Supabase that are no longer in the latest scrape for a shop."""
    try:
        response = supabase.table("collections").select("id").eq("shop_id", shop_id).execute()
        if not response.data:
            logger.info(f"No existing collections found for shop {shop_id}.")
            return

        existing_ids = {item["id"] for item in response.data}
        to_delete = list(existing_ids - set(current_collection_ids))

        if not to_delete:
            logger.info(f"No stale collections to delete for shop {shop_id}.")
            return

        logger.info(f"Removing {len(to_delete)} stale collections for shop {shop_id}...")

        # Images are no longer used by the app; only delete collections.
        # Perform deletions in reasonably small batches with retries and
        # exponential backoff to handle transient network errors (e.g.
        # Broken pipe) from the Supabase client.
        delete_batch_size = 50
        max_delete_retries = 5

        for i in range(0, len(to_delete), delete_batch_size):
            batch = to_delete[i:i + delete_batch_size]
            backoff = 1
            for attempt in range(1, max_delete_retries + 1):
                try:
                    supabase.table("collections").delete().in_("id", batch).execute()
                    logger.info(f"Deleted collections batch {i // delete_batch_size + 1}: {len(batch)} records")
                    break
                except (requests.exceptions.RequestException, OSError) as e:
                    # Broken pipe shows as OSError Errno 32; handle similarly
                    logger.error(f"Error deleting collections batch (attempt {attempt}): {e}")
                    if attempt == max_delete_retries:
                        logger.error(f"Failed to delete collections batch after {max_delete_retries} attempts: {batch}")
                    else:
                        time.sleep(backoff)
                        backoff = min(backoff * 2, 30)

    except Exception as e:
        logger.error(f"Error deleting stale collections for shop {shop_id}: {e}")

def process_shop_data(shop_data):
    """Process collections for a single shop."""
    shop_id = shop_data.get("id")
    logger.info(f"Processing collections for shop: {shop_id}")
    for json_file in get_collection_json_files("output"):
        process_collections_file(json_file, shop_id)

if __name__ == "__main__":
    with open("shop_urls.json", "r", encoding="utf-8") as json_file:
        shop_data_list = json.load(json_file)

    # Determine the number of workers (use 2x CPU cores as a starting point)
    num_workers = min(cpu_count() * 2, len(shop_data_list))

    # Process shops in parallel
    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = []
        for shop_data in shop_data_list:
            futures.append(executor.submit(process_shop_data, shop_data))

        # Wait for all tasks to complete and handle any exceptions
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as e:
                logger.error(f"Error processing shop data: {e}")