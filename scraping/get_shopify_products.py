"""Module for scraping product data from Shopify stores using their API and web pages."""

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

def fetch_shopify_products(base_url, shop_id, limit=250, max_pages=None):
    """Fetch products from a Shopify store's API.

    Args:
        base_url (str): The base URL of the Shopify store
        shop_id (str): The name of the shop
        limit (int, optional): Number of products per page. Defaults to 250.
        max_pages (int, optional): Maximum number of pages to fetch. Defaults to None.

    Returns:
        list: List of product dictionaries containing product data
    """
    products = []
    page = 1
    sleep_time = 2
    while True:
        url = f"{base_url}/products.json?limit={limit}&page={page}"
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
            
            if 'products' not in data or not data['products']:
                print("No more products found.")
                break

            # Add product URLs and shop name to the data
            for product in data['products']:
                handle = product.get('handle')
                if handle:
                    product_url = f"{base_url}/products/{handle}"
                    product['product_url'] = product_url
                    product['shop_id'] = shop_id

                    # Fetch and parse additional data from the product page
                    parse_product_page(product_url, product)

            products.extend(data['products'])
            print(f"Page {page} fetched in {fetch_time:.2f}s: {len(data['products'])} products.")
            
            if max_pages and page >= max_pages:
                print(f"Reached the maximum page limit: {max_pages}")
                break
            page += 1
            time.sleep(sleep_time)
            print(f"Waiting {sleep_time} seconds before next request...")

        except requests.exceptions.RequestException as e:
            print(f"Error fetching page {page} from {base_url}: {e}")
            break
    return products

def parse_product_page(product_url, product):
    """Parse additional product data from the product's webpage.

    Args:
        product_url (str): URL of the product page
        product (dict): Product dictionary to update with additional data
    """
    try:
        response = requests.get(product_url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        script_tag = soup.find('script', type='application/ld+json')
        if script_tag:
            schema_data = json.loads(script_tag.string)
            if isinstance(schema_data, dict) and schema_data.get('@type') == 'Product':
                product['offers'] = schema_data.get('offers', [])
    except requests.exceptions.RequestException as e:
        print(f"Error fetching product page {product_url}: {e}")

def save_products_to_file(products, file_path):
    """Save product data to a JSON file.

    Args:
        products (list): List of product dictionaries to save
        file_path (str): Path to the output JSON file
    """
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as file:
        json.dump(products, file, indent=4, ensure_ascii=False)
    print(f"Saved {len(products)} products to {file_path}")

def get_shop_name(shop_data):
    """Get shop name from shop_data dictionary.

    Args:
        shop_data (dict): Dictionary containing shop data including shop_id

    Returns:
        str: Shop name from the shop_data, or formatted URL if shop_id not found
    """
    # Return shop_id if present, otherwise fallback to URL formatting
    return shop_data.get("shop_id") or urlparse(shop_data["url"]).netloc.replace('.', '_')

if __name__ == "__main__":
    # Load shop URLs from JSON file
    with open("shop_urls.json", "r", encoding="utf-8") as json_file:
        shop_urls_data = json.load(json_file)

    summary_log = []

    def process_shop(shop_data):
        shopify_base_url = shop_data["url"]
        category = shop_data.get("category", "Unknown")
        shop_id = get_shop_name(shop_data)
        output_file = f"output/{shop_id}_products.json"

        print(f"Processing shop: {shop_id} (Category: {category})")
        if not is_shopify_store(shopify_base_url):
            print(f"Skipping {shopify_base_url}: Not a Shopify store.")
            return [shop_id, shopify_base_url, category, "Failure: Not a Shopify store"]

        try:
            shop_products = fetch_shopify_products(
                shopify_base_url,
                shop_id,
                limit=250,
                max_pages=10
            )
            if shop_products:
                save_products_to_file(shop_products, output_file)
                success_msg = f"Success: {len(shop_products)} products fetched"
                return [shop_id, shopify_base_url, category, success_msg]
            else:
                print(f"No products found for {shopify_base_url}.")
                return [shop_id, shopify_base_url, category, "Failure: No products found"]
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
    with open("output/shopify_product_summary.csv", "w", newline="", encoding="utf-8") as csv_file:
        csvwriter = csv.writer(csv_file)
        csvwriter.writerow(["Shop Name", "URL", "Category", "Summary"])
        csvwriter.writerows(summary_log)

    print("Summary written to output/shopify_product_summary.csv.")
