"""Module for scraping collection data from Shopify stores using their API."""

import csv
import json
import os
import time
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
import concurrent.futures

def is_shopify_store(base_url):
    """Check if the given URL belongs to a Shopify store."""
    try:
        response = requests.get(f"{base_url}/products.json", timeout=10)
        has_token = 'X-Shopify-Storefront-Access-Token' in response.headers
        has_products = 'products' in response.json()
        if response.status_code == 200 and (has_token or has_products):
            return True
    except (requests.exceptions.RequestException, ValueError):
        pass
    return False

def fetch_shopify_collections(base_url, shop_id, limit=250, max_pages=None):
    """Fetch collections from a Shopify store's API.

    Args:
        base_url (str): The base URL of the Shopify store
        shop_id (str): The name of the shop
        limit (int, optional): Number of collections per page. Defaults to 250.
        max_pages (int, optional): Maximum number of pages to fetch. Defaults to None.

    Returns:
        list: List of collection dictionaries containing collection data
    """
    collections = []
    page = 1
    sleep_time = 2
    while True:
        url = f"{base_url}/collections.json?limit={limit}&page={page}"
        print(f"Fetching page {page} from {base_url}...")
        start_time = time.time()
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            try:
                data = response.json()
            except json.JSONDecodeError as e:
                print(f"Error decoding JSON for page {page} from {base_url}: {e}")
                page += 1
                continue
            fetch_time = time.time() - start_time
            
            if 'collections' not in data or not data['collections']:
                print("No more collections found.")
                break

            # Add collection URLs and shop id to the data
            for collection in data['collections']:
                handle = collection.get('handle')
                if handle:
                    collection_url = f"{base_url}/collections/{handle}"
                    collection['collection_url'] = collection_url
                    collection['shop_id'] = shop_id

            collections.extend(data['collections'])
            print(f"Page {page} fetched in {fetch_time:.2f}s: {len(data['collections'])} collections.")
            
            if max_pages and page >= max_pages:
                print(f"Reached the maximum page limit: {max_pages}")
                break
            page += 1
            time.sleep(sleep_time)
            print(f"Waiting {sleep_time} seconds before next request...")

        except requests.exceptions.RequestException as e:
            print(f"Error fetching page {page} from {base_url}: {e}")
            break
    return collections

def save_collections_to_file(collections, file_path):
    """Save collection data to a JSON file.

    Args:
        collections (list): List of collection dictionaries to save
        file_path (str): Path to the output JSON file
    """
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as file:
        json.dump(collections, file, indent=4, ensure_ascii=False)
    print(f"Saved {len(collections)} collections to {file_path}")

def get_shop_id(shop_data):
    """Get shop name from shop_data dictionary.

    Args:
        shop_data (dict): Dictionary containing shop data including shop_id

    Returns:
        str: Shop name from the shop_data, or formatted URL if shop_id not found
    """
    # Return shop_id
    return shop_data.get("shop_id")

if __name__ == "__main__":
    # Load shop URLs from JSON file
    with open("shop_urls.json", "r", encoding="utf-8") as json_file:
        shop_urls_data = json.load(json_file)

    summary_log = []

    def process_shop(shop_data):
        shopify_base_url = shop_data["url"]
        category = shop_data.get("category", "Unknown")
        shop_id = get_shop_id(shop_data)
        output_file = f"output/{shop_id}_collections.json"

        print(f"Processing shop: {shop_id} (Category: {category})")
        if not is_shopify_store(shopify_base_url):
            print(f"Skipping {shopify_base_url}: Not a Shopify store.")
            return [shop_id, shopify_base_url, category, "Failure: Not a Shopify store"]

        try:
            shop_collections = fetch_shopify_collections(
                shopify_base_url,
                shop_id,
                limit=250,
                max_pages=10
            )
            if shop_collections:
                save_collections_to_file(shop_collections, output_file)
                success_msg = f"Success: {len(shop_collections)} collections fetched"
                return [shop_id, shopify_base_url, category, success_msg]
            else:
                print(f"No collections found for {shopify_base_url}.")
                return [shop_id, shopify_base_url, category, "Failure: No collections found"]
        except (requests.exceptions.RequestException, json.JSONDecodeError, OSError) as e:
            print(f"Error processing {shopify_base_url}: {e}")
            return [shop_id, shopify_base_url, category, f"Failure: {e}"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_shop = {executor.submit(process_shop, shop_data): shop_data for shop_data in shop_urls_data}
        for future in concurrent.futures.as_completed(future_to_shop):
            shop_data = future_to_shop[future]
            try:
                result = future.result()
                summary_log.append(result)
            except Exception as e:
                print(f"Error processing {shop_data['url']}: {e}")
                summary_log.append([shop_data["shop_id"], shop_data["url"], shop_data.get("category", "Unknown"), f"Failure: {e}"])

    # Write summary to CSV
    os.makedirs("output", exist_ok=True)
    with open("output/shopify_collections_summary.csv", "w", newline="", encoding="utf-8") as csv_file:
        csvwriter = csv.writer(csv_file)
        csvwriter.writerow(["Shop Name", "URL", "Category", "Summary"])
        csvwriter.writerows(summary_log)

    print("Summary written to output/shopify_collections_summary.csv.")