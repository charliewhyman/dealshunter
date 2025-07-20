"""
Module for scraping collection data from Shopify stores with IP rotation.
"""

import csv
import json
import os
import time
import random
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
import concurrent.futures

# --------------------------------------------------
# 1. IP rotation: free list or commercial gateway
# --------------------------------------------------
FREE_PROXIES = [
    # quick demo list – replace with your own or a commercial endpoint
    "103.151.226.21:8080",
    "103.151.226.22:8080",
    "103.151.226.23:8080",
    "8.219.97.215:8080",
    "47.245.29.242:8080",
]

def get_proxy():
    """
    Returns {"http": ..., "https": ...} for requests.
    Swap the body with your paid provider if desired:
        return {"http": "http://API_KEY@proxy.scraperapi.com:8001",
                "https": "http://API_KEY@proxy.scraperapi.com:8001"}
    """
    proxy_ip = random.choice(FREE_PROXIES)
    proxy_url = f"http://{proxy_ip}"
    return {"http": proxy_url, "https": proxy_url}

# --------------------------------------------------
# 2. Session factory – fresh proxy + headers every call
# --------------------------------------------------
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
]

def get_headers():
    return {"User-Agent": random.choice(USER_AGENTS)}

# --------------------------------------------------
# 3. Shopify helpers
# --------------------------------------------------
def is_shopify_store(base_url):
    try:
        resp = requests.get(
            f"{base_url}/products.json",
            timeout=10,
            headers=get_headers(),
            proxies=get_proxy(),
        )
        if resp.status_code != 200:
            return False
        has_token = "X-Shopify-Storefront-Access-Token" in resp.headers
        has_products = "products" in resp.json()
        return has_token or has_products
    except Exception:
        return False

def fetch_shopify_collections(base_url, shop_id, limit=250, max_pages=None):
    collections = []
    page = 1
    while True:
        url = f"{base_url}/collections.json?limit={limit}&page={page}"
        print(f"Fetching page {page} from {base_url} ...")
        try:
            resp = requests.get(
                url,
                timeout=10,
                headers=get_headers(),
                proxies=get_proxy(),
            )
            if resp.status_code == 429:
                retry = int(resp.headers.get("Retry-After", 5))
                print(f"429 hit – sleeping {retry} s")
                time.sleep(retry)
                continue
            resp.raise_for_status()
            data = resp.json()

            if "collections" not in data or not data["collections"]:
                break

            for coll in data["collections"]:
                handle = coll.get("handle")
                if handle:
                    coll["collection_url"] = f"{base_url}/collections/{handle}"
                    coll["shop_id"] = shop_id

            collections.extend(data["collections"])
            print(f"Page {page}: {len(data['collections'])} collections")

            if max_pages and page >= max_pages:
                break
            page += 1
            time.sleep(random.uniform(4, 7))  # polite crawl
        except Exception as e:
            print(f"Error on page {page}: {e}")
            break
    return collections

def save_collections_to_file(collections, file_path):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as file:
        json.dump(collections, file, indent=4, ensure_ascii=False)
    print(f"Saved {len(collections)} collections to {file_path}")

def get_shop_id(shop_data):
    return shop_data.get("id")

def scrape_collections_from_html(base_url, shop_id):
    url = f"{base_url}/collections"
    try:
        resp = requests.get(url, timeout=10, headers=get_headers(), proxies=get_proxy())
        resp.raise_for_status()
    except Exception as e:
        print(f"Failed to fetch collections HTML for {base_url}: {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    links = soup.select("a[href^='/collections/']")
    seen, collections = set(), []
    for link in links:
        href = link.get("href")
        if not href or href in seen:
            continue
        seen.add(href)
        handle = href.split("/collections/")[-1].split("?")[0].strip("/")
        if handle:
            collections.append(
                {
                    "handle": handle,
                    "collection_url": f"{base_url}/collections/{handle}",
                    "shop_id": shop_id,
                }
            )
    print(f"Scraped {len(collections)} collections from HTML at {url}")
    return collections

def process_shop(shop_data):
    base_url = shop_data["url"]
    category = shop_data.get("category", "Unknown")
    shop_id = get_shop_id(shop_data)
    output_file = f"output/{shop_id}_collections.json"

    print(f"Processing shop: {shop_id} ({category})")
    if not is_shopify_store(base_url):
        return [shop_id, base_url, category, "Failure: Not a Shopify store"]

    try:
        collections = fetch_shopify_collections(base_url, shop_id, limit=250, max_pages=10)
        if collections:
            save_collections_to_file(collections, output_file)
            return [shop_id, base_url, category, f"Success: {len(collections)} collections via API"]

        print("No collections via API – trying HTML fallback...")
        html_collections = scrape_collections_from_html(base_url, shop_id)
        if html_collections:
            save_collections_to_file(html_collections, output_file)
            return [shop_id, base_url, category, f"Success: {len(html_collections)} collections via HTML"]
        else:
            return [shop_id, base_url, category, "Failure: No collections found"]
    except Exception as e:
        return [shop_id, base_url, category, f"Failure: {e}"]

if __name__ == "__main__":
    with open("shop_urls.json", "r", encoding="utf-8") as f:
        shop_urls_data = json.load(f)

    summary_log = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        future_to_shop = {executor.submit(process_shop, shop): shop for shop in shop_urls_data}
        for future in concurrent.futures.as_completed(future_to_shop):
            shop = future_to_shop[future]
            try:
                summary_log.append(future.result())
            except Exception as e:
                summary_log.append(
                    [shop.get("id"), shop["url"], shop.get("category", "Unknown"), f"Failure: {e}"]
                )

    os.makedirs("output", exist_ok=True)
    with open("output/shopify_collections_summary.csv", "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["Shop ID", "URL", "Category", "Summary"])
        writer.writerows(summary_log)

    print("Summary written to output/shopify_collections_summary.csv")