from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
import os
import json
from pathlib import Path
import time
import requests
import re
from requests.adapters import HTTPAdapter, Retry

# Configure session with retries
session = requests.Session()
retries = Retry(total=3, backoff_factor=1, status_forcelist=[502, 503, 504])
adapter = HTTPAdapter(max_retries=retries)
session.mount('http://', adapter)
session.mount('https://', adapter)

COLLECTION_TIMEOUT = 60  # seconds

def extract_handle(collection_url):
    match = re.search(r"/collections/([^/?#]+)", collection_url)
    return match.group(1) if match else None

def get_products_from_collection(collection_url):
    handle = extract_handle(collection_url)
    if not handle:
        print(f"Could not extract handle from {collection_url}")
        return []

    base_url = collection_url.split("/collections/")[0]
    products_api_url = f"{base_url}/collections/{handle}/products.json"

    try:
        response = session.get(products_api_url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            products = data.get("products", [])
            if isinstance(products, list):
                return products
            else:
                print(f"Expected list of products but got {type(products).__name__}")
                return []
        else:
            print(f"products.json not available ({response.status_code}), fallback to HTML: {collection_url}")
    except Exception as e:
        print(f"Error fetching JSON API {products_api_url}: {e}, falling back to HTML.")

    try:
        response = session.get(collection_url, timeout=10)
        if response.status_code != 200:
            print(f"Failed to fetch {collection_url}")
            return []
        
        html = response.text
        match = re.search(r'var meta = (\{.*?\});', html, re.DOTALL)
        if match:
            meta_json = match.group(1)
            meta_data = json.loads(meta_json)
            products = meta_data.get("products")
            if isinstance(products, list):
                return products
            else:
                print(f"Expected list of products in HTML but got {type(products).__name__}")
                return []
        else:
            print(f"No product data found in HTML for {collection_url}")
            return []
    except Exception as e:
        print(f"HTML fallback failed for {collection_url}: {e}")
        return []

def get_shop_id(url):
    with open("shop_urls.json", "r", encoding="utf-8") as file:
        shop_urls = json.load(file)
        for shop in shop_urls:
            if shop["url"] in url:
                return shop["id"]
    return None

def process_single_collection(collection, shop_id):
    collection_url = collection.get("collection_url")
    collection_id = collection.get("id")
    if not collection_url:
        return shop_id, collection_id, []

    print(f"Processing collection ID: {collection_id} for shop: {shop_id}")
    products = get_products_from_collection(collection_url)
    time.sleep(2)
    return shop_id, collection_id, [product.get("id") for product in products] if products else []

def process_single_file(filename, output_folder):
    if not filename.endswith("_collections.json"):
        return

    print(f"Processing file: {filename}")
    file_path = os.path.join(output_folder, filename)
    result = {}

    with open(file_path, "r", encoding="utf-8") as file:
        collections = json.load(file)

    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_collection = {}
        for collection in collections:
            shop_id = get_shop_id(collection.get("collection_url", ""))
            if shop_id:
                future = executor.submit(process_single_collection, collection, shop_id)
                future_to_collection[future] = (shop_id, collection.get("id"))

        for future in as_completed(future_to_collection):
            shop_id, collection_id = future_to_collection[future]
            try:
                shop_id, collection_id, product_ids = future.result(timeout=COLLECTION_TIMEOUT)
                if shop_id not in result:
                    result[shop_id] = {}
                result[shop_id][collection_id] = product_ids
            except TimeoutError:
                print(f"Timeout processing collection {collection_id} for shop {shop_id}")
            except Exception as e:
                print(f"Error processing collection {collection_id} for shop {shop_id}: {e}")

    for shop_id, collections in result.items():
        output_path = Path(output_folder) / f"{shop_id}_collections_to_products.json"
        existing_data = {}
        if output_path.exists():
            with open(output_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        existing_data.update(collections)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(existing_data, f, indent=4)

def process_all_collections(output_folder):
    result = {}
    for filename in os.listdir(output_folder):
        if filename.endswith("_collections.json"):
            process_single_file(filename, output_folder)

def save_result_to_json(result, output_folder):
    for shop_id, collections in result.items():
        output_path = Path(output_folder) / f"{shop_id}_collections_to_products.json"
        print(f"Saving results for shop: {shop_id} to file: {output_path}")
        with open(output_path, "w", encoding="utf-8") as file:
            json.dump(collections, file, indent=4)

def deduplicate_data(data):
    seen_ids = set()
    deduplicated_data = []
    duplicate_logs = []

    for item in data:
        pair = (item["product_id"], item["collection_id"])
        if pair not in seen_ids:
            seen_ids.add(pair)
            deduplicated_data.append({
                "product_id": item["product_id"],
                "collection_id": item["collection_id"]
            })
        else:
            duplicate_logs.append(pair)

    return deduplicated_data, duplicate_logs

if __name__ == "__main__":
    output_folder = "output"
    print("Starting processing of collections...")
    process_all_collections(output_folder)
    print("Finished processing collections.")