from concurrent.futures import ThreadPoolExecutor
import os
import json
from pathlib import Path
import time
import requests
import re

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
        response = requests.get(products_api_url)
        if response.status_code == 200:
            data = response.json()
            products = data.get("products", [])
            if isinstance(products, list):
                return products
            else:
                print(f"Error processing product: Expected a list of dicts but got {type(products).__name__}")
                return []
        else:
            print(f"products.json not available ({response.status_code}), falling back to HTML: {collection_url}")
    except Exception as e:
        print(f"Exception while fetching {products_api_url}: {e}")
        print(f"Falling back to HTML: {collection_url}")

    # Fallback: Parse from HTML
    try:
        response = requests.get(collection_url)
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
                print(f"Error processing product: Expected a list of dicts but got {type(products).__name__}")
                return []
        else:
            print(f"Could not find product data in {collection_url}")
            return []
    except Exception as e:
        print(f"HTML fallback failed for {collection_url}: {e}")
        return []

def get_shop_id(url):
    # Load shop URLs from a JSON file to map the URL to the shop id
    with open("shop_urls.json", "r", encoding="utf-8") as file:
        shop_urls = json.load(file)
        for shop in shop_urls:
            if shop["url"] in url:
                return shop["id"]
    return None

def process_all_collections(output_folder):
    result = {}
    for filename in os.listdir(output_folder):
        if filename.endswith("_collections.json"):
            file_path = os.path.join(output_folder, filename)
            with open(file_path, "r", encoding="utf-8") as file:
                collections = json.load(file)
                for collection in collections:
                    collection_url = collection.get("collection_url")
                    if collection_url:
                        shop_id = get_shop_id(collection_url)
                        if shop_id:
                            if shop_id not in result:
                                result[shop_id] = {}
                            collection_id = collection.get("id")
                            products = get_products_from_collection(collection_url)
                            if products:
                                result[shop_id][collection_id] = [product.get('id') for product in products]
                            else:
                                result[shop_id][collection_id] = []
    return result

def process_single_collection(collection, shop_id):
    collection_url = collection.get("collection_url")
    collection_id = collection.get("id")
    if not collection_url:
        return shop_id, collection_id, []
    
    print(f"Processing collection ID: {collection_id} for shop: {shop_id}")
    products = get_products_from_collection(collection_url)
    time.sleep(2)
    return shop_id, collection_id, [product.get('id') for product in products] if products else []

def process_single_file(filename, output_folder):
    if not filename.endswith("_collections.json"):
        return
    
    print(f"Processing file: {filename}")
    file_path = os.path.join(output_folder, filename)
    result = {}
    
    with open(file_path, "r", encoding="utf-8") as file:
        collections = json.load(file)
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = []
        for collection in collections:
            shop_id = get_shop_id(collection.get("collection_url", ""))
            if shop_id:
                futures.append(
                    executor.submit(process_single_collection, collection, shop_id)
                )
        
        for future in futures:
            shop_id, collection_id, product_ids = future.result()
            if shop_id not in result:
                result[shop_id] = {}
            result[shop_id][collection_id] = product_ids
    
    for shop_id, collections in result.items():
        output_path = Path(output_folder) / f"{shop_id}_collections_to_products.json"
        
        existing_data = {}
        if output_path.exists():
            with open(output_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        
        existing_data.update(collections)
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(existing_data, f, indent=4)

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
        if (item["product_id"], item["collection_id"]) not in seen_ids:
            seen_ids.add((item["product_id"], item["collection_id"]))
            deduplicated_data.append({
                "product_id": item["product_id"],
                "collection_id": item["collection_id"]
            })
        else:
            duplicate_logs.append((item["product_id"], item["collection_id"]))

    return deduplicated_data, duplicate_logs

output_folder = "output"
print("Starting processing of collections...")
result = process_all_collections(output_folder)
print("Finished processing collections. Saving results...")
save_result_to_json(result, output_folder)
print("All results saved.")
