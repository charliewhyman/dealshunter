"""Module for scraping product data from Shopify stores using their API and web pages."""

import csv
import json
import os
import time
import argparse
import requests
from bs4 import BeautifulSoup
import concurrent.futures
from requests.adapters import HTTPAdapter, Retry

# Configure session with retries
session = requests.Session()
retries = Retry(total=3, backoff_factor=1, status_forcelist=[502, 503, 504])
adapter = HTTPAdapter(max_retries=retries)
session.mount('https://', adapter)
session.mount('http://', adapter)

def is_shopify_store(base_url):
    """Check if the given URL belongs to a Shopify store."""
    try:
        response = session.get(f"{base_url}/products.json", timeout=10)
        has_token = 'X-Shopify-Storefront-Access-Token' in response.headers
        has_products = 'products' in response.json()
        if response.status_code == 200 and (has_token or has_products):
            return True
    except (requests.exceptions.RequestException, ValueError):
        pass
    return False

def fetch_shopify_products(base_url, shop_id, limit=250, max_pages=None):
    """Fetch products from a Shopify store's API."""
    products = []
    page = 1
    sleep_time = 2
    while True:
        url = f"{base_url}/products.json?limit={limit}&page={page}"
        print(f"Fetching page {page} from {base_url}...")
        start_time = time.time()
        try:
            response = session.get(url, timeout=10)
            response.raise_for_status()
            try:
                data = response.json()
            except json.JSONDecodeError as e:
                print(f"Error decoding JSON for page {page} from {base_url}: {e}")
                with open(f"output/{shop_id}_error_page_{page}.txt", "wb") as f:
                    f.write(response.content)
                page += 1
                continue

            fetch_time = time.time() - start_time

            if 'products' not in data or not data['products']:
                print("No more products found.")
                break

            for product in data['products']:
                handle = product.get('handle')
                if handle:
                    product_url = f"{base_url}/products/{handle}"
                    product['product_url'] = product_url
                    product['shop_id'] = shop_id
                    parse_product_page(product_url, product)

            products.extend(data['products'])
            print(f"Page {page} fetched in {fetch_time:.2f}s: {len(data['products'])} products.")

            if max_pages and page >= max_pages:
                print(f"Reached the maximum page limit: {max_pages}")
                break
            page += 1
            time.sleep(sleep_time)

        except requests.exceptions.RequestException as e:
            print(f"Error fetching page {page} from {base_url}: {e}")
            break
    return products

def parse_product_page(product_url, product):
    """Parse additional product data from the product's webpage."""
    try:
        response = session.get(product_url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        script_tag = soup.find('script', type='application/ld+json')
        if script_tag:
            schema_data = json.loads(script_tag.string)
            if isinstance(schema_data, dict) and schema_data.get('@type') == 'Product':
                product['offers'] = schema_data.get('offers', [])
                
        # Add to parse_product_page() after schema extraction
        variant_script = soup.find('script', {'class': 'product-variants'})
        if variant_script:
            try:
                variants_data = json.loads(variant_script.string)
                # Map variant IDs to their specific types
                product['variant_types'] = {
                    v['id']: v.get('type') for v in variants_data.get('variants', [])
                }
            except json.JSONDecodeError:
                pass
            
    except requests.exceptions.RequestException as e:
        print(f"Error fetching product page {product_url}: {e}")

def save_products_to_file(products, file_path):
    """Save product data to a JSON file."""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as file:
        json.dump(products, file, indent=4, ensure_ascii=False)
    print(f"Saved {len(products)} products to {file_path}")

def get_shop_id(shop_data):
    """Get shop id from shop_data dictionary."""
    return shop_data.get("id")

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-shops", type=int, help="Max number of shops to process")
    parser.add_argument("--max-pages", type=int, help="Max pages per shop")
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    MAX_SHOP_TIMEOUT = 180  # seconds

    with open("shop_urls.json", "r", encoding="utf-8") as json_file:
        shop_urls_data = json.load(json_file)
        if args.max_shops:
            shop_urls_data = shop_urls_data[:args.max_shops]

    summary_log = []

    def process_shop(shop_data):
        shopify_base_url = shop_data["url"]
        category = shop_data.get("category", "Unknown")
        shop_id = get_shop_id(shop_data)
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
                max_pages=args.max_pages or 5
            )
            if shop_products:
                save_products_to_file(shop_products, output_file)
                return [shop_id, shopify_base_url, category, f"Success: {len(shop_products)} products fetched"]
            else:
                return [shop_id, shopify_base_url, category, "Failure: No products found"]
        except Exception as e:
            return [shop_id, shopify_base_url, category, f"Failure: {e}"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_shop = {executor.submit(process_shop, shop): shop for shop in shop_urls_data}
        for future in concurrent.futures.as_completed(future_to_shop):
            shop_data = future_to_shop[future]
            try:
                result = future.result(timeout=MAX_SHOP_TIMEOUT)
                summary_log.append(result)
            except concurrent.futures.TimeoutError:
                print(f"Timeout while processing {shop_data['url']}")
                summary_log.append([
                    shop_data.get("id"), shop_data["url"],
                    shop_data.get("category", "Unknown"),
                    "Failure: Timeout"
                ])
            except Exception as e:
                print(f"Error processing {shop_data['url']}: {e}")
                summary_log.append([
                    shop_data.get("id"), shop_data["url"],
                    shop_data.get("category", "Unknown"),
                    f"Failure: {e}"
                ])

    os.makedirs("output", exist_ok=True)
    with open("output/shopify_product_summary.csv", "w", newline="", encoding="utf-8") as csv_file:
        csvwriter = csv.writer(csv_file)
        csvwriter.writerow(["Shop ID", "URL", "Category", "Summary"])
        csvwriter.writerows(summary_log)

    print("Summary written to output/shopify_product_summary.csv.")