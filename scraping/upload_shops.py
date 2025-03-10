import os
import json
import time
import requests
from supabase import create_client

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in environment variables.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def bulk_upsert_data(table_name, data, batch_size=50, retries=5, initial_delay=5):
    """Bulk upsert data to Supabase with retry logic and exponential backoff."""
    for i in range(0, len(data), batch_size):
        batch = data[i:i + batch_size]
        delay = initial_delay
        for attempt in range(retries):
            try:
                response = supabase.table(table_name).upsert(batch, on_conflict="id").execute()
                if response.data:
                    print(f"Upserted {len(batch)} records to {table_name}.")
                    break
                else:
                    print(f"Unexpected response: {response}")
            except requests.exceptions.RequestException as e:
                print(f"Error upserting batch, attempt {attempt + 1}: {e}")
                if attempt == retries - 1:
                    raise
                time.sleep(delay)
                delay *= 2  # Exponential backoff

def process_shops_file(filepath):
    """Process a JSON file containing shop data and upload it to Supabase."""
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            shops = json.load(file)
        
        if not isinstance(shops, list):
            raise ValueError("JSON file must contain a list of shop objects.")
        
        bulk_upsert_data("shops", shops)
        print("Upload completed.")
    
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error processing file {filepath}: {e}")

if __name__ == "__main__":
    json_file = "shop_urls.json"
    print(f"Processing file: {json_file}")
    process_shops_file(json_file)
