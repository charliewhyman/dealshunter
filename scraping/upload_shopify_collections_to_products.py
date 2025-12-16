"""Module for uploading scraped Shopify collection-to-product relationships to Supabase database."""

import os
import json
import time
import logging
import argparse
from supabase import create_client
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from multiprocessing import cpu_count

# ---------------- Logging Setup ---------------- #

parser = argparse.ArgumentParser()
parser.add_argument("--debug", action="store_true", help="Enable debug logging")
args = parser.parse_args()

logging.basicConfig(
    level=logging.DEBUG if args.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Load environment variables from a dotenv file if present. Respect
# the `UV_ENV_FILE` environment variable when set (used by `uv run`).
from dotenv import load_dotenv, find_dotenv
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

# ---------------- Supabase Setup ---------------- #

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in environment variables.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------- Functions ---------------- #

def bulk_upsert_data(table_name, data, batch_size=100, retries=3):
    """Bulk upsert data to Supabase with deduplication and error handling."""
    seen_ids = set()
    deduplicated_data = []
    duplicate_logs = []

    for item in data:
        unique_key = (item["product_id"], item["collection_id"])
        if unique_key not in seen_ids:
            seen_ids.add(unique_key)
            deduplicated_data.append(item)
        else:
            duplicate_logs.append(unique_key)

    if duplicate_logs:
        logger.debug(f"Duplicate entries skipped in {table_name}: {len(duplicate_logs)} records")

    for i in range(0, len(deduplicated_data), batch_size):
        batch = deduplicated_data[i:i + batch_size]
        for attempt in range(retries):
            try:
                response = supabase.table(table_name).upsert(batch, on_conflict="collection_id, product_id").execute()
                if response.data:
                    logger.info(f"Upserted batch {i // batch_size + 1}: {len(batch)} records.")
                    break
                else:
                    logger.warning(f"Unexpected response for batch {i // batch_size + 1}: {response}")
            except (requests.exceptions.RequestException, json.JSONDecodeError) as e:
                logger.error(f"Error on batch {i // batch_size + 1}, attempt {attempt + 1}: {e}")
                if attempt == retries - 1:
                    raise
                time.sleep(5)

def get_existing_product_ids():
    """Fetch all product IDs from Supabase."""
    try:
        response = supabase.table("products").select("id").execute()
        return set(row["id"] for row in response.data)
    except Exception as e:
        logger.error(f"Failed to fetch existing product IDs: {e}")
        return set()

def process_collection_product_pairs(filepath, valid_product_ids):
    """Process a JSON file containing collection-product pairs and upload to Supabase."""
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            collection_product_pairs = json.load(file)

        data_to_upsert = []
        current_links = []

        for collection_id, product_ids in collection_product_pairs.items():
            for product_id in product_ids:
                if product_id not in valid_product_ids:
                    logger.debug(f"Skipping product_id {product_id} – not found in products table.")
                    continue

                record = {
                    "product_id": product_id,
                    "collection_id": collection_id
                }

                data_to_upsert.append(record)
                current_links.append((product_id, collection_id))

        if data_to_upsert:
            logger.info(f"Processing {len(data_to_upsert)} collection-product pairs from {filepath}")
            bulk_upsert_data("product_collections", data_to_upsert)
        else:
            logger.info(f"No valid data to upsert from {filepath}.")

        return current_links

    except requests.exceptions.RequestException as e:
        logger.error(f"Error communicating with Supabase: {e}")
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Error processing file {filepath}: {e}")

    return []

def get_collection_product_json_files(output_folder):
    """Get all JSON files from the output folder ending with _collections_to_products.json."""
    return [
        os.path.join(output_folder, f)
        for f in os.listdir(output_folder)
        if f.endswith("_collections_to_products.json")
    ]

def remove_deleted_collection_product_links(current_links):
    """Remove stale product-collection links that are no longer present in the latest scrape."""
    try:
        response = supabase.table("product_collections").select("product_id, collection_id").execute()
        if not response.data:
            logger.info("No existing product-collection links found.")
            return

        existing_links = {(row["product_id"], row["collection_id"]) for row in response.data}
        current_links_set = set(current_links)

        to_delete = list(existing_links - current_links_set)

        if not to_delete:
            logger.info("No stale product-collection links to delete.")
            return

        logger.info(f"Removing {len(to_delete)} stale product-collection links...")

        # Process deletions in parallel batches
        def delete_batch(batch):
            for product_id, collection_id in batch:
                supabase.table("product_collections").delete().eq("product_id", product_id).eq("collection_id", collection_id).execute()

        batch_size = 100
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = []
            for i in range(0, len(to_delete), batch_size):
                batch = to_delete[i:i + batch_size]
                futures.append(executor.submit(delete_batch, batch))
            
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    logger.error(f"Error deleting batch: {e}")

    except Exception as e:
        logger.error(f"Error deleting stale product-collection links: {e}")

# ---------------- Main Execution ---------------- #

def main():
    output_folder = "output"
    json_files = get_collection_product_json_files(output_folder)
    valid_product_ids = get_existing_product_ids()

    if not json_files:
        logger.warning(f"No collection-product JSON files found in {output_folder}")
        return

    logger.info(f"Found {len(json_files)} files to process")
    all_current_links = []

    # Process files in parallel with dynamic worker count
    num_workers = min(cpu_count() * 2, len(json_files))
    logger.debug(f"Using {num_workers} workers for parallel processing")

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = {executor.submit(process_collection_product_pairs, file, valid_product_ids): file for file in json_files}
        
        for future in as_completed(futures):
            file = futures[future]
            try:
                result = future.result()
                if result:
                    all_current_links.extend(result)
                    logger.info(f"Completed processing {file}")
                else:
                    logger.warning(f"File {file} returned no results")
            except Exception as e:
                logger.error(f"Error processing file {file}: {e}")

    if all_current_links:
        logger.info(f"Total {len(all_current_links)} current links collected")
        remove_deleted_collection_product_links(all_current_links)
    else:
        logger.warning("No valid collection-product links were processed")

if __name__ == "__main__":
    main()