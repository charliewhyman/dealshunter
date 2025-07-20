#!/usr/bin/env python3
"""
Optimized script to fetch product-collection relationships from Shopify stores
with IP rotation, parallel processing, progress tracking, and robust error handling.
"""

import json
import os
import re
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
from tqdm import tqdm
import logging

# --------------------------------------------------
# 1. IP-rotation configuration
# --------------------------------------------------
FREE_PROXIES = [
    # Replace with your own list or a paid gateway (see get_proxy())
    "103.151.226.21:8080",
    "103.151.226.22:8080",
    "103.151.226.23:8080",
    "8.219.97.215:8080",
    "47.245.29.242:8080",
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
]

def get_proxy():
    """
    Returns dict for session.proxies.
    Commercial gateway (ScraperAPI, Bright Data, Oxylabs, etc.) example:
        api_key = "YOUR_API_KEY"
        return {"http": f"http://scraperapi:{api_key}@proxy-server.scraperapi.com:8001",
                "https": f"http://scraperapi:{api_key}@proxy-server.scraperapi.com:8001"}
    """
    proxy_ip = random.choice(FREE_PROXIES)
    proxy_url = f"http://{proxy_ip}"
    return {"http": proxy_url, "https": proxy_url}

# --------------------------------------------------
# 2. Session factory – fresh proxy + headers every call
# --------------------------------------------------
def build_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({"User-Agent": random.choice(USER_AGENTS)})
    session.proxies.update(get_proxy())
    return session

# --------------------------------------------------
# 3. Rest of the original script – unchanged logic
# --------------------------------------------------
MAX_WORKERS = 10
COLLECTION_TIMEOUT = 120
REQUEST_DELAY = 1
CACHE_EXPIRY = 3600

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler("collection_processor.log"), logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

# --------------------------------------------------
# Helper functions (unchanged)
# --------------------------------------------------
def extract_handle(collection_url: str) -> Optional[str]:
    match = re.search(r"/collections/([^/?#]+)", collection_url)
    return match.group(1) if match else None

def get_products_from_collection(collection_url: str) -> List[Dict]:
    handle = extract_handle(collection_url)
    if not handle:
        logger.warning(f"Could not extract handle from {collection_url}")
        return []

    base_url = collection_url.split("/collections/")[0]
    api_url = f"{base_url}/collections/{handle}/products.json"

    sess = build_session()

    # JSON API
    try:
        r = sess.get(api_url, timeout=10)
        if r.status_code == 200:
            data = r.json()
            products = data.get("products", [])
            if isinstance(products, list):
                return products
            logger.warning("Expected list of products but got %s", type(products).__name__)
            return []
    except Exception as e:
        logger.warning("Error fetching JSON API %s: %s", api_url, e)

    # HTML fallback
    try:
        r = sess.get(collection_url, timeout=10)
        if r.status_code != 200:
            logger.warning("Failed to fetch %s (HTTP %s)", collection_url, r.status_code)
            return []

        match = re.search(r"var meta = ({.*?});", r.text, re.DOTALL)
        if match:
            meta = json.loads(match.group(1))
            products = meta.get("products", [])
            if isinstance(products, list):
                return products
            logger.warning("Expected list of products in HTML but got %s", type(products).__name__)
            return []
        logger.warning("No product data found in HTML for %s", collection_url)
        return []
    except Exception as e:
        logger.error("HTML fallback failed for %s: %s", collection_url, e)
        return []

def get_shop_id(url: str) -> Optional[int]:
    try:
        with open("shop_urls.json", "r", encoding="utf-8") as f:
            for shop in json.load(f):
                if shop["url"].rstrip("/") in url.rstrip("/"):
                    return shop["id"]
    except Exception as e:
        logger.error("Error loading shop_urls.json: %s", e)
    return None

def process_single_collection(collection: Dict) -> Tuple[Optional[int], Optional[int], List[int]]:
    url = collection.get("collection_url")
    cid = collection.get("id")
    if not url or not cid:
        return None, None, []

    sid = get_shop_id(url)
    if not sid:
        logger.warning("No shop ID for %s", url)
        return None, None, []

    logger.debug("Processing collection %s for shop %s", cid, sid)
    products = get_products_from_collection(url)
    time.sleep(REQUEST_DELAY)

    pids = []
    for p in products:
        if isinstance(p, dict) and "id" in p:
            pids.append(p["id"])
        elif isinstance(p, (int, str)):
            pids.append(p)
    return sid, cid, pids

def process_collection_chunk(collections: List[Dict]) -> Dict:
    results = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_single_collection, c): c for c in collections}
        for future in as_completed(futures):
            try:
                sid, cid, pids = future.result(timeout=COLLECTION_TIMEOUT)
                if sid and cid:
                    results.setdefault(sid, {})[cid] = pids
            except Exception as e:
                logger.error("Error processing collection %s: %s", futures[future].get("id"), e)
    return results

def save_results(results: Dict, output_folder: str, shop_id: int) -> None:
    path = Path(output_folder) / f"{shop_id}_collections_to_products.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        data.update(results.get(shop_id, {}))
        path.write_text(json.dumps(data, indent=4), encoding="utf-8")
        logger.info("Saved results for shop %s to %s", shop_id, path)
    except Exception as e:
        logger.error("Failed to save results for shop %s: %s", shop_id, e)

def process_single_file(filename: str, output_folder: str) -> None:
    if not filename.endswith("_collections.json"):
        return

    file_path = Path(output_folder) / filename
    progress_file = file_path.with_suffix(".json.progress")

    with open(file_path, encoding="utf-8") as f:
        collections = json.load(f)

    processed = set()
    if progress_file.exists():
        try:
            processed = set(json.loads(progress_file.read_text()))
        except Exception as e:
            logger.warning("Error loading progress file: %s", e)

    unprocessed = [c for c in collections if str(c.get("id")) not in processed]
    if not unprocessed:
        logger.info("No unprocessed collections in %s", filename)
        return

    logger.info("Processing %d collections from %s", len(unprocessed), filename)
    chunk_size = 50
    results = {}

    with tqdm(total=len(unprocessed), desc=f"Processing {filename}") as pbar:
        for i in range(0, len(unprocessed), chunk_size):
            chunk = unprocessed[i : i + chunk_size]
            chunk_res = process_collection_chunk(chunk)

            for sid, cols in chunk_res.items():
                results.setdefault(sid, {}).update(cols)

            processed.update(str(c.get("id")) for c in chunk)
            progress_file.write_text(json.dumps(list(processed)))
            pbar.update(len(chunk))

            for sid in chunk_res:
                save_results(results, output_folder, sid)

def process_all_collections(output_folder: str = "output") -> None:
    logger.info("Starting processing of collections...")
    start = time.time()
    Path(output_folder).mkdir(exist_ok=True)
    for fname in os.listdir(output_folder):
        try:
            process_single_file(fname, output_folder)
        except Exception as e:
            logger.error("Error processing %s: %s", fname, e)
    logger.info("Finished in %.2f seconds", time.time() - start)

if __name__ == "__main__":
    process_all_collections()