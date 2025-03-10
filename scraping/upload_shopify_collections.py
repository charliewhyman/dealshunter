"""Module for uploading scraped Shopify collection data to Supabase database."""

import os
import json
import time
import uuid
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
        if item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            deduplicated_data.append(item)
        else:
            duplicate_logs.append(item["id"])

    # Log duplicates
    if duplicate_logs:
        print(f"Duplicate IDs found in {table_name}: {duplicate_logs}")

    # Process batches
    for i in range(0, len(deduplicated_data), batch_size):
        batch = deduplicated_data[i:i + batch_size]
        for attempt in range(retries):
            try:
                response = supabase.table(table_name).upsert(batch, on_conflict="id").execute()
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

class CollectionProcessor:
    """Helper class to process and upload collection data."""
    def __init__(self, submitted_by):
        self.submitted_by = submitted_by
        self.collections = []
        self.images = []

    def process_collection(self, collection):
        """Process a single collection and its related data."""
        if not isinstance(collection, dict):
            print(f"Error processing collection: Expected a dictionary but got {type(collection).__name__}")
            return

        try:
            fields = {}
            try:
                fields["id"] = collection["id"]
            except Exception as e:
                print(f"Error generating 'id' for collection: {e}")
                raise

            try:
                fields["title"] = collection["title"]
            except Exception as e:
                print(f"Error accessing 'title' for collection {fields.get('id', 'unknown')}: {e}")
                raise

            try:
                fields["handle"] = collection["handle"]
            except Exception as e:
                print(f"Error accessing 'handle' for collection {fields.get('id', 'unknown')}: {e}")
                raise

            try:
                fields["description"] = collection["description"]
            except Exception as e:
                print(f"Error accessing 'description' for collection {fields.get('id', 'unknown')}: {e}")
                raise
            
            try:
                fields["products_count"] = collection["products_count"]
            except Exception as e:
                print(f"Error accessing 'products_count' for collection {fields.get('id', 'unknown')}: {e}")
                raise
            
            try:
                fields["shop_id"] = collection["shop_id"]
            except Exception as e:
                print(f"Error accessing 'shop_id' for collection {fields.get('id', 'unknown')}: {e}")
                raise

            try:
                fields["collection_url"] = collection["collection_url"]
            except Exception as e:
                print(f"Error accessing 'collection_url' for collection {fields.get('id', 'unknown')}: {e}")
                raise

            try:
                fields["submitted_by"] = self.submitted_by
            except Exception as e:
                print(f"Error accessing 'submitted_by' for collection {fields.get('id', 'unknown')}: {e}")
                raise

            try:
                fields["published_at_external"] = collection.get("published_at")
            except Exception as e:
                print(f"Error accessing 'published_at' for collection {fields.get('id', 'unknown')}: {e}")
                raise

            try:
                fields["updated_at_external"] = collection.get("updated_at")
            except Exception as e:
                print(f"Error accessing 'updated_at' for collection {fields.get('id', 'unknown')}: {e}")
                raise

            self.collections.append(fields)

            # Process image if it exists
            if "image" in collection and collection["image"]:
                try:
                    image = collection["image"]
                    image_data = {
                        "id": image["id"],
                        "collection_id": collection["id"],
                        "src": image["src"],
                        "alt": image.get("alt", ""),
                        "created_at_external": image.get("created_at")
                    }
                    self.images.append(image_data)
                except Exception as e:
                    print(f"Error processing image for collection {fields.get('id', 'unknown')}: {e}")

        except Exception as e:
            print(f"Error processing collection {fields.get('id', 'unknown')}: {e}")

def process_collections_file(filepath, user_id):
    """Process a JSON file containing collection data and upload to Supabase."""
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            collections = json.load(file)

        processor = CollectionProcessor(user_id)
        for collection in collections:
            processor.process_collection(collection)

        # Bulk upsert all collections
        if processor.collections:
            print(f"Upserting {len(processor.collections)} collections...")
            bulk_upsert_data("collections", processor.collections)

        # Bulk upsert all images
        if processor.images:
            print(f"Upserting {len(processor.images)} images...")
            bulk_upsert_data("images", processor.images)

    except requests.exceptions.RequestException as e:
        print(f"Error communicating with Supabase: {e}")
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error processing file {filepath}: {e}")

def get_collection_json_files(output_folder):
    """Get all JSON files from the output folder."""
    return [os.path.join(output_folder, f) for f in os.listdir(output_folder) if f.endswith("_collections.json")]

if __name__ == "__main__":
    
    USER_UUID = "691aedc4-1055-4b57-adb7-7480febba4c8"
    for json_file in get_collection_json_files("output"):
        print(f"Processing file: {json_file}")
        process_collections_file(json_file, USER_UUID)