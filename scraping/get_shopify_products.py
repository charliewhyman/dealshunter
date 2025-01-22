import requests
import json
import csv
import os
from urllib.parse import urlparse
import time
from bs4 import BeautifulSoup

def is_shopify_store(base_url):
    try:
        response = requests.get(f"{base_url}/products.json", timeout=10)
        if response.status_code == 200 and ('X-Shopify-Storefront-Access-Token' in response.headers or 'products' in response.json()):
            return True
    except (requests.exceptions.RequestException, ValueError):
        pass
    return False

def fetch_shopify_products(base_url, limit=250, max_pages=None):
    products = []
    page = 1
    while True:
        url = f"{base_url}/products.json?limit={limit}&page={page}"
        print(f"Fetching page {page} from {base_url}...")
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            if 'products' not in data or not data['products']:
                print("No more products found.")
                break

            # Add product URLs to the data
            for product in data['products']:
                handle = product.get('handle')
                if handle:
                    product_url = f"{base_url}/products/{handle}"
                    product['product_url'] = product_url

                    # Fetch and parse additional data from the product page
                    parse_product_page(product_url, product)

            products.extend(data['products'])
            print(f"Page {page} fetched: {len(data['products'])} products.")
            if max_pages and page >= max_pages:
                print(f"Reached the maximum page limit: {max_pages}")
                break
            page += 1
            time.sleep(4)
        except requests.exceptions.RequestException as e:
            print(f"Error fetching page {page} from {base_url}: {e}")
            break
    return products

def parse_product_page(product_url, product):
    try:
        response = requests.get(product_url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        # Look for JSON-LD schema data
        script_tag = soup.find('script', type='application/ld+json')
        if script_tag:
            schema_data = json.loads(script_tag.string)
            if isinstance(schema_data, dict) and schema_data.get('@type') == 'Product':
                product['offers'] = schema_data.get('offers', [])
    except requests.exceptions.RequestException as e:
        print(f"Error fetching product page {product_url}: {e}")

def save_products_to_file(products, output_file):
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as file:
        json.dump(products, file, indent=4, ensure_ascii=False)
    print(f"Saved {len(products)} products to {output_file}")

def get_shop_name(base_url):
    parsed_url = urlparse(base_url)
    shop_name = parsed_url.netloc.replace('.', '_')
    return shop_name

if __name__ == "__main__":
    # Load shop URLs from JSON file
    with open("shop_urls.json", "r", encoding="utf-8") as file:
        shop_urls_data = json.load(file)

    summary_log = []

    for shop_data in shop_urls_data:
        shopify_base_url = shop_data["url"]
        category = shop_data.get("category", "Unknown")
        priority = shop_data.get("priority", "Unknown")

        shop_name = get_shop_name(shopify_base_url)
        output_file = f"output/{shop_name}_products.json"

        print(f"Processing shop: {shop_name} (Category: {category}, Priority: {priority})")
        if not is_shopify_store(shopify_base_url):
            print(f"Skipping {shopify_base_url}: Not a Shopify store.")
            summary_log.append([shop_name, shopify_base_url, category, priority, "Failure: Not a Shopify store"])
            continue

        try:
            products = fetch_shopify_products(shopify_base_url, limit=250, max_pages=10)
            if products:
                save_products_to_file(products, output_file)
                summary_log.append([shop_name, shopify_base_url, category, priority, f"Success: {len(products)} products fetched"])
            else:
                print(f"No products found for {shopify_base_url}.")
                summary_log.append([shop_name, shopify_base_url, category, priority, "Failure: No products found"])
        except Exception as e:
            print(f"Error processing {shopify_base_url}: {e}")
            summary_log.append([shop_name, shopify_base_url, category, priority, f"Failure: {e}"])

    # Write summary to CSV
    os.makedirs("output", exist_ok=True)
    with open("output/shopify_summary.csv", "w", newline="", encoding="utf-8") as csvfile:
        csvwriter = csv.writer(csvfile)
        csvwriter.writerow(["Shop Name", "URL", "Category", "Priority", "Summary"])
        csvwriter.writerows(summary_log)

    print("Summary written to output/shopify_summary.csv.")
