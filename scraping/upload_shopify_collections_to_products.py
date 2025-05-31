"""Module for uploading scraped Shopify collection-to-product relationships to Supabase database."""

import os
import json
import time
from supabase import create_client
import requests

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    ERROR_MSG = "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    raise ValueError(f"{ERROR_MSG} is not set in environment variables.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def bulk_upsert_data(table_name, data, batch_size=100, retries=3):
    """Bulk upsert data to Supabase with deduplication and error handling."""
    seen_ids = set()
    deduplicated_data = []
    duplicate_logs = []

    # Deduplicate data
    for item in data:
        unique_key = (item["product_id"], item["collection_id"])
        if unique_key not in seen_ids:
            seen_ids.add(unique_key)
            deduplicated_data.append(item)
        else:
            duplicate_logs.append(unique_key)

    # Log duplicates
    if duplicate_logs:
        print(f"Duplicate IDs found in {table_name}: {duplicate_logs}")

    # Process batches
    for i in range(0, len(deduplicated_data), batch_size):
        batch = deduplicated_data[i:i + batch_size]
        for attempt in range(retries):
            try:
                response = supabase.table(table_name).upsert(batch, on_conflict="collection_id, product_id").execute()
                if response.data:
                    print(f"Upserted batch {i // batch_size}: {len(batch)} records.")
                    break
                else:
                    print(f"Unexpected response in batch {i // batch_size}: {response}")
            except (requests.exceptions.RequestException, json.JSONDecodeError) as e:
                print(f"Error in batch {i // batch_size}, attempt {attempt + 1}: {e}")
                if attempt == retries - 1:
                    raise
                time.sleep(5)

def process_collection_product_pairs(filepath):
    """Process a JSON file containing collection-product pairs and upload to Supabase."""
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            collection_product_pairs = json.load(file)

        data_to_upsert = []
        skipped = []
        current_links = []

        valid_collection_ids = get_valid_collection_ids()

        for collection_id, product_ids in collection_product_pairs.items():
            if collection_id not in valid_collection_ids:
                skipped.append({"reason": "missing_collection", "collection_id": collection_id})
                continue

            for product_id in product_ids:
                # Validate product_id exists in products table
                response = supabase.table("products").select("id").eq("id", product_id).execute()
                if not response.data:
                    skipped.append({
                        "reason": "missing_product",
                        "product_id": product_id,
                        "collection_id": collection_id
                    })
                    continue

                record = {
                    "product_id": product_id,
                    "collection_id": collection_id
                }
                data_to_upsert.append(record)
                current_links.append((product_id, collection_id))

        if data_to_upsert:
            print(f"Upserting {len(data_to_upsert)} collection-product pairs...")
            bulk_upsert_data("product_collections", data_to_upsert)

        if skipped:
            skipped_path = os.path.join("output", "skipped_product_collections.json")
            with open(skipped_path, "w", encoding="utf-8") as f:
                json.dump(skipped, f, indent=2)
            print(f"Skipped {len(skipped)} invalid entries. See {skipped_path}")

        return current_links

    except requests.exceptions.RequestException as e:
        print(f"Error communicating with Supabase: {e}")
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error processing file {filepath}: {e}")
    return []

def get_collection_product_json_files(output_folder):
    """Get all JSON files from the output folder ending with _collections_to_products.json."""
    return [os.path.join(output_folder, f) for f in os.listdir(output_folder) if f.endswith("_collections_to_products.json")]

def remove_deleted_collection_product_links(current_links):
    """Remove stale product-collection links that are no longer present in the latest scrape."""
    try:
        response = supabase.table("product_collections").select("product_id, collection_id").execute()
        if not response.data:
            print("No existing product-collection links found.")
            return

        existing_links = {(row["product_id"], row["collection_id"]) for row in response.data}
        current_links_set = set(current_links)

        to_delete = list(existing_links - current_links_set)

        if not to_delete:
            print("No stale product-collection links to delete.")
            return

        print(f"Removing {len(to_delete)} stale product-collection links...")

        for i in range(0, len(to_delete), 100):
            batch = to_delete[i:i+100]
            for product_id, collection_id in batch:
                supabase.table("product_collections").delete().eq("product_id", product_id).eq("collection_id", collection_id).execute()

    except Exception as e:
        print(f"Error deleting stale product-collection links: {e}")

# Fetch all valid collection_ids from Supabase
def get_valid_collection_ids():
    try:
        response = supabase.table("collections").select("id").execute()
        return set(item["id"] for item in response.data)
    except Exception as e:
        print(f"Error fetching valid collection IDs: {e}")
        return set()

if __name__ == "__main__":
    output_folder = 'output'
    all_current_links = []

    for json_file in get_collection_product_json_files(output_folder):
        print(f"Processing file: {json_file}")
        current_links = process_collection_product_pairs(json_file)
        all_current_links.extend(current_links) 

    # 🧹 Run cleanup once after processing all files
    if all_current_links:
        remove_deleted_collection_product_links(all_current_links)