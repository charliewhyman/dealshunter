#!/usr/bin/env python3
"""
Optimized script to fetch product-collection relationships from Shopify stores
with parallel processing, progress tracking, and robust error handling.
"""

import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
from tqdm import tqdm
import logging

# Configuration
MAX_WORKERS = 10  # Number of parallel threads for processing collections
COLLECTION_TIMEOUT = 120  # Timeout per collection in seconds
REQUEST_DELAY = 1  # Delay between requests to avoid rate limiting
MAX_RETRIES = 3  # Max retries for failed requests
CACHE_EXPIRY = 3600  # Cache expiry time in seconds (1 hour)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('collection_processor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configure HTTP session with retries and caching
session = requests.Session()
retry_strategy = Retry(
    total=MAX_RETRIES,
    backoff_factor=1,
    status_forcelist=[500, 502, 503, 504],
    allowed_methods=["GET"]
)
adapter = HTTPAdapter(
    max_retries=retry_strategy,
    pool_connections=MAX_WORKERS * 2,
    pool_maxsize=MAX_WORKERS * 2
)
session.mount('http://', adapter)
session.mount('https://', adapter)


def extract_handle(collection_url: str) -> Optional[str]:
    """Extract collection handle from URL."""
    match = re.search(r"/collections/([^/?#]+)", collection_url)
    return match.group(1) if match else None


def get_products_from_collection(collection_url: str) -> List[Dict]:
    """
    Fetch products from a Shopify collection using either the JSON API or HTML fallback.
    
    Args:
        collection_url: Full URL to the collection
        
    Returns:
        List of product dictionaries or empty list if failed
    """
    handle = extract_handle(collection_url)
    if not handle:
        logger.warning(f"Could not extract handle from {collection_url}")
        return []

    base_url = collection_url.split("/collections/")[0]
    products_api_url = f"{base_url}/collections/{handle}/products.json"

    # Try JSON API first
    try:
        response = session.get(products_api_url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            products = data.get("products", [])
            if isinstance(products, list):
                return products
            logger.warning(f"Expected list of products but got {type(products).__name__}")
            return []
    except Exception as e:
        logger.warning(f"Error fetching JSON API {products_api_url}: {e}")

    # Fallback to HTML parsing
    try:
        response = session.get(collection_url, timeout=10)
        if response.status_code != 200:
            logger.warning(f"Failed to fetch {collection_url} (HTTP {response.status_code})")
            return []

        html = response.text
        match = re.search(r'var meta = (\{.*?\});', html, re.DOTALL)
        if match:
            meta_json = match.group(1)
            meta_data = json.loads(meta_json)
            products = meta_data.get("products", [])
            if isinstance(products, list):
                return products
            logger.warning(f"Expected list of products in HTML but got {type(products).__name__}")
            return []
        logger.warning(f"No product data found in HTML for {collection_url}")
        return []
    except Exception as e:
        logger.error(f"HTML fallback failed for {collection_url}: {e}")
        return []


def get_shop_id(url: str) -> Optional[int]:
    """Look up shop ID from shop_urls.json based on URL."""
    try:
        with open("shop_urls.json", "r", encoding="utf-8") as file:
            shop_urls = json.load(file)
            for shop in shop_urls:
                if shop["url"].rstrip('/') in url.rstrip('/'):
                    return shop["id"]
    except Exception as e:
        logger.error(f"Error loading shop_urls.json: {e}")
    return None


def process_single_collection(collection: Dict) -> Tuple[Optional[int], Optional[int], List[int]]:
    """
    Process a single collection to get its products.
    
    Args:
        collection: Dictionary containing collection data
        
    Returns:
        Tuple of (shop_id, collection_id, product_ids)
    """
    collection_url = collection.get("collection_url")
    collection_id = collection.get("id")
    if not collection_url or not collection_id:
        return None, None, []

    shop_id = get_shop_id(collection_url)
    if not shop_id:
        logger.warning(f"No shop ID found for collection URL: {collection_url}")
        return None, None, []

    logger.debug(f"Processing collection {collection_id} for shop {shop_id}")
    products = get_products_from_collection(collection_url)
    time.sleep(REQUEST_DELAY)  # Be polite with delays between requests
    
    product_ids = []
    for product in products:
        if isinstance(product, dict) and 'id' in product:
            product_ids.append(product['id'])
        elif isinstance(product, (int, str)):
            product_ids.append(product)
    
    return shop_id, collection_id, product_ids


def process_collection_chunk(collections: List[Dict]) -> Dict:
    """
    Process a chunk of collections in parallel.
    
    Args:
        collections: List of collection dictionaries
        
    Returns:
        Dictionary of results in format {shop_id: {collection_id: [product_ids]}}
    """
    chunk_results = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_single_collection, col): col 
            for col in collections
        }
        
        for future in as_completed(futures):
            try:
                shop_id, collection_id, product_ids = future.result(timeout=COLLECTION_TIMEOUT)
                if shop_id and collection_id:
                    if shop_id not in chunk_results:
                        chunk_results[shop_id] = {}
                    chunk_results[shop_id][collection_id] = product_ids
            except Exception as e:
                col = futures[future]
                logger.error(f"Error processing collection {col.get('id')}: {e}")
    
    return chunk_results


def save_results(results: Dict, output_folder: str, shop_id: int) -> None:
    """
    Save results to a shop-specific JSON file.
    
    Args:
        results: Dictionary of results to save
        output_folder: Path to output directory
        shop_id: ID of the shop being processed
    """
    output_path = Path(output_folder) / f"{shop_id}_collections_to_products.json"
    try:
        # Load existing data if file exists
        existing_data = {}
        if output_path.exists():
            with open(output_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        
        # Update with new results
        existing_data.update(results.get(shop_id, {}))
        
        # Save back to file
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(existing_data, f, indent=4)
            logger.info(f"Saved results for shop {shop_id} to {output_path}")
    except Exception as e:
        logger.error(f"Failed to save results for shop {shop_id}: {e}")


def process_single_file(filename: str, output_folder: str) -> None:
    """
    Process a single collections JSON file.
    
    Args:
        filename: Name of the collections file to process
        output_folder: Path to output directory
    """
    if not filename.endswith("_collections.json"):
        return

    file_path = Path(output_folder) / filename
    progress_file = Path(output_folder) / f"{filename}.progress"
    
    try:
        # Load collections data
        with open(file_path, "r", encoding="utf-8") as file:
            collections = json.load(file)
        
        # Load progress if exists
        processed_ids = set()
        if progress_file.exists():
            try:
                with open(progress_file, "r") as f:
                    processed_ids = set(json.load(f))
            except Exception as e:
                logger.warning(f"Error loading progress file: {e}")

        # Filter to unprocessed collections
        unprocessed = [
            col for col in collections 
            if str(col.get("id")) not in processed_ids
        ]
        
        if not unprocessed:
            logger.info(f"No unprocessed collections in {filename}")
            return

        logger.info(f"Processing {len(unprocessed)} collections from {filename}")
        
        # Process in chunks
        chunk_size = 50
        results = {}
        
        with tqdm(total=len(unprocessed), desc=f"Processing {filename}") as pbar:
            for i in range(0, len(unprocessed), chunk_size):
                chunk = unprocessed[i:i + chunk_size]
                
                # Process the chunk
                chunk_result = process_collection_chunk(chunk)
                
                # Merge results
                for shop_id, cols in chunk_result.items():
                    if shop_id not in results:
                        results[shop_id] = {}
                    results[shop_id].update(cols)
                
                # Update progress
                processed_ids.update(str(col.get("id")) for col in chunk)
                with open(progress_file, "w") as f:
                    json.dump(list(processed_ids), f)
                
                pbar.update(len(chunk))
                
                # Save intermediate results
                for shop_id in chunk_result.keys():
                    save_results(results, output_folder, shop_id)
        
    except Exception as e:
        logger.error(f"Error processing file {filename}: {e}")


def process_all_collections(output_folder: str = "output") -> None:
    """
    Main function to process all collection files in the output folder.
    
    Args:
        output_folder: Path to directory containing collection files
    """
    logger.info("Starting processing of collections...")
    start_time = time.time()
    
    # Ensure output directory exists
    Path(output_folder).mkdir(exist_ok=True)
    
    # Process each collections file
    for filename in os.listdir(output_folder):
        try:
            process_single_file(filename, output_folder)
        except Exception as e:
            logger.error(f"Error processing {filename}: {e}")
            continue
    
    logger.info(f"Finished processing collections in {time.time() - start_time:.2f} seconds")


if __name__ == "__main__":
    process_all_collections()