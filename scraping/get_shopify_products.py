"""
Module for scraping Shopify stores (NO PROXY VERSION).
- Uses direct connection only
- Recommended for small-scale or testing purposes
"""

import csv
import json
import os
import time
import argparse
import random
import requests
from bs4 import BeautifulSoup
import concurrent.futures
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

# --------------------------------------------------
# 1. Proxy function returns empty (no proxies)
# --------------------------------------------------
def get_proxy():
    """
    Return empty proxy dict for direct connection.
    """
    return {}

# --------------------------------------------------
# 2. Requests session with retries only (no proxies)
# --------------------------------------------------
def create_session():
    """
    Create session with retries but no proxy configuration.
    """
    sess = requests.Session()
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[429, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retries)
    sess.mount("https://", adapter)
    sess.mount("http://", adapter)
    return sess

# --------------------------------------------------
# 3. Shopify scraping logic
# --------------------------------------------------
def is_shopify_store(base_url):
    """Check if the given URL belongs to a Shopify store."""
    try:
        # Direct connection without proxy
        sess = create_session()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = sess.get(f"{base_url}/products.json", timeout=10, headers=headers)
        has_token = 'X-Shopify-Storefront-Access-Token' in response.headers
        has_products = 'products' in response.json()
        if response.status_code == 200 and (has_token or has_products):
            return True
    except Exception as e:
        print(f"Error checking Shopify store at {base_url}: {e}")
    return False

def fetch_shopify_products(base_url, shop_id, limit=250, max_pages=None):
    """Fetch products from Shopify store."""
    products = []
    page = 1
    while True:
        url = f"{base_url}/products.json?limit={limit}&page={page}"
        print(f"Fetching page {page} from {base_url} ...")
        
        # Create new session for each page (no proxy)
        sess = create_session()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        try:
            response = sess.get(url, timeout=15, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            if "products" not in data or not data["products"]:
                break
                
            for product in data["products"]:
                handle = product.get("handle")
                if handle:
                    product_url = f"{base_url}/products/{handle}"
                    product["product_url"] = product_url
                    product["shop_id"] = shop_id
                    parse_product_page(product_url, product, sess)
                    
            products.extend(data["products"])
            print(f"Page {page}: {len(data['products'])} products")
            
            if max_pages and page >= max_pages:
                break
                
            page += 1
            time.sleep(random.uniform(5, 8))  # Polite crawl delay
            
        except Exception as e:
            print(f"Error fetching page {page} from {base_url}: {e}")
            break
            
    return products

def parse_product_page(product_url, product, sess):
    """Parse extra data from the product page."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = sess.get(product_url, timeout=10, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        script_tag = soup.find("script", type="application/ld+json")
        if script_tag:
            schema_data = json.loads(script_tag.string)
            if isinstance(schema_data, dict) and schema_data.get("@type") == "Product":
                product["offers"] = schema_data.get("offers", [])
    except Exception as e:
        print(f"Error parsing product page {product_url}: {e}")

# --------------------------------------------------
# 4. I/O helpers
# --------------------------------------------------
def save_products_to_file(products, file_path):
    """Save products to JSON file."""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as file:
        json.dump(products, file, indent=4, ensure_ascii=False)
    print(f"Saved {len(products)} products to {file_path}")

def get_shop_id(shop_data):
    """Extract shop ID from shop data."""
    return shop_data.get("id")

def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-shops", type=int, help="Max number of shops to process")
    parser.add_argument("--max-pages", type=int, help="Max pages per shop")
    return parser.parse_args()

# --------------------------------------------------
# 5. Main entry point
# --------------------------------------------------
if __name__ == "__main__":
    args = parse_args()
    MAX_SHOP_TIMEOUT = 180

    # Load shop URLs
    with open("shop_urls.json", "r", encoding="utf-8") as f:
        shop_urls_data = json.load(f)
        if args.max_shops:
            shop_urls_data = shop_urls_data[:args.max_shops]

    summary_log = []

    def process_shop(shop_data):
        """Process a single shop."""
        base_url = shop_data["url"]
        shop_id = get_shop_id(shop_data)
        output_file = f"output/{shop_id}_products.json"

        print(f"Processing shop: {shop_id}")
        
        # Check if it's a Shopify store
        if not is_shopify_store(base_url):
            return [shop_id, base_url, "Failure: Not a Shopify store"]

        try:
            # Fetch products
            prods = fetch_shopify_products(
                base_url,
                shop_id,
                limit=250,
                max_pages=args.max_pages or 5,
            )
            
            if prods:
                save_products_to_file(prods, output_file)
                return [shop_id, base_url, f"Success: {len(prods)} products"]
            else:
                return [shop_id, base_url, "Failure: No products found"]
                
        except Exception as e:
            return [shop_id, base_url, f"Failure: {e}"]

    # Process shops with threading (reduced to 2 workers for direct connection)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_to_shop = {executor.submit(process_shop, shop): shop for shop in shop_urls_data}
        for future in concurrent.futures.as_completed(future_to_shop):
            shop = future_to_shop[future]
            try:
                summary_log.append(future.result(timeout=MAX_SHOP_TIMEOUT))
            except concurrent.futures.TimeoutError:
                summary_log.append([shop.get("id"), shop["url"], "Failure: Timeout"])
            except Exception as e:
                summary_log.append([shop.get("id"), shop["url"], f"Failure: {e}"])

    # Save summary
    os.makedirs("output", exist_ok=True)
    with open("output/shopify_product_summary.csv", "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["Shop ID", "URL", "Summary"])
        writer.writerows(summary_log)

    print("Summary written to output/shopify_product_summary.csv")