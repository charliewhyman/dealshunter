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
        for collection_id, product_ids in collection_product_pairs.items():
            for product_id in product_ids:
                data_to_upsert.append({
                    "product_id": product_id,
                    "collection_id": collection_id
                })

        # Bulk upsert all collection-product pairs
        if data_to_upsert:
            print(f"Upserting {len(data_to_upsert)} collection-product pairs...")
            bulk_upsert_data("product_collections", data_to_upsert)

    except requests.exceptions.RequestException as e:
        print(f"Error communicating with Supabase: {e}")
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error processing file {filepath}: {e}")

if __name__ == "__main__":
    FILEPATH = 'c:/Users/cwhym/Documents/GitHub/dealshunter/scraping/output/Simply Merino_collections_to_products.json'
    process_collection_product_pairs(FILEPATH)