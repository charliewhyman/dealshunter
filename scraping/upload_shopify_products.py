"""Module for uploading scraped Shopify product data to Supabase database."""

import os
import json
import re
import time
import uuid
import logging
from html import unescape
from concurrent.futures import ThreadPoolExecutor, as_completed
from multiprocessing import cpu_count
from supabase import create_client
import requests
from dotenv import load_dotenv, find_dotenv

# ---------------- Logging Setup ---------------- #
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# ---------------- Supabase Setup ---------------- #
# Load environment variables from a dotenv file if present. Respect
# the `UV_ENV_FILE` environment variable when set (used by `uv run`).
env_file = os.environ.get("UV_ENV_FILE")
loaded_env_path = None
if env_file:
    try:
        load_dotenv(env_file)
        loaded_env_path = env_file
    except Exception:
        logger.warning(f"Failed to load env from UV_ENV_FILE={env_file}")
else:
    # find_dotenv searches upwards for a .env file; fallback to local .env
    dotenv_path = find_dotenv()
    if dotenv_path:
        load_dotenv(dotenv_path)
        loaded_env_path = dotenv_path

if loaded_env_path:
    logger.info(f"Loaded environment variables from: {loaded_env_path}")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    ERROR_MSG = "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    raise ValueError(f"{ERROR_MSG} is not set in environment variables.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------- Helper Functions ---------------- #
def strip_html_tags(html_text):
    """Remove HTML tags from text and decode HTML entities."""
    return re.sub(r"<[^>]*>", "", unescape(html_text or ""))

def clean_numeric(value):
    """Converts string numbers with commas into float."""
    if isinstance(value, str):
        try:
            return float(value.replace(",", ""))
        except ValueError:
            return None
    return value

def clean_boolean(value):
    """Converts various truthy values to boolean."""
    return value in [1, "1", True, "true", "yes"]

def generate_deterministic_id(namespace_string, *components):
    """Generate a deterministic UUID based on input components."""
    namespace = uuid.UUID('12345678-1234-5678-1234-567812345678')
    components_str = '|'.join(str(c or '') for c in components)
    return str(uuid.uuid5(namespace, f"{namespace_string}:{components_str}"))

# ---------------- Processing Functions ---------------- #
def process_options(product):
    """Process product options into a standardized format."""
    options = product.get("options", [])
    return [
        {
            "id": generate_deterministic_id('option', product["id"], opt["name"], opt["position"]),
            "product_id": product["id"],
            "name": opt["name"],
            "position": opt["position"],
            "values": opt["values"],
        }
        for opt in options
    ]

def process_variants(product, variant_types=None):
    """Process product variants into a standardized format."""
    variants = product.get("variants", [])
    
    variant_types = variant_types or product.get("variant_types", {}) or {}
    if variant_types:
        try:
            logger.debug(f"Found {len(variant_types)} variant types for product {product['id']}")
        except Exception:
            logger.debug(f"Found variant types for product {product.get('id')}")
        
    return [
        {
            "id": variant["id"],
            "product_id": product["id"],
            "variant_type": variant_types.get(str(variant["id"])),
            "title": variant["title"],
            "price": clean_numeric(variant["price"]),
            "compare_at_price": clean_numeric(variant.get("compare_at_price")),
            "sku": variant["sku"],
            "inventory_quantity": variant.get("inventory_quantity"),
            "requires_shipping": variant.get("requires_shipping"),
            "taxable": variant.get("taxable"),
            "available": clean_boolean(variant.get("available")),
            "created_at_external": variant.get("created_at"),
            "updated_at": variant.get("updated_at"),
        }
        for variant in variants
    ]

def process_images(product):
    """Process product images into a standardized format."""
    images = product.get("images", [])
    def build_image_variants(url):
        """Build a small set of responsive variant URLs and a tiny webp placeholder.

        This avoids local image processing by leveraging CDN URL params (e.g. Shopify CDN).
        We produce URLs for widths 320, 640, 1024, 1600 and webp variants, plus a
        `placeholder` (width=20, webp) that can be used as an LQIP/blur-up source.
        """
        from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

        if not url:
            return {}

        try:
            p = urlparse(url)
            base = p.scheme + '://' + p.netloc + p.path
            original_q = dict(parse_qsl(p.query))
            sizes = [320, 640, 1024, 1600]
            variants = {}

            for w in sizes:
                q = original_q.copy()
                q['width'] = str(w)
                variants[f'src_{w}'] = base + '?' + urlencode(q)

                q_webp = original_q.copy()
                q_webp['width'] = str(w)
                q_webp['format'] = 'webp'
                variants[f'src_webp_{w}'] = base + '?' + urlencode(q_webp)

            # Tiny placeholder (webp) for blur-up LQIP
            q_small = original_q.copy()
            q_small['width'] = '20'
            q_small['format'] = 'webp'
            variants['placeholder'] = base + '?' + urlencode(q_small)

            # Build srcset strings
            variants['srcset'] = ', '.join(f"{variants['src_' + str(w)]} {w}w" for w in sizes)
            variants['webp_srcset'] = ', '.join(f"{variants['src_webp_' + str(w)]} {w}w" for w in sizes)
            variants['fallback'] = variants.get('src_640') or url
            # Explicit thumbnail (small) for list views — prefer 320px if available
            variants['thumbnail'] = variants.get('src_320') or variants.get('src_200') or variants['fallback']
            variants['thumbnail_webp'] = variants.get('src_webp_320') or variants.get('src_webp_200') or variants.get('webp_srcset')
            return variants
        except Exception:
            return {'fallback': url}

    processed = []
    for img in images:
        src = img.get('src')
        variants = build_image_variants(src)

        processed.append({
            'id': img.get('id'),
            'product_id': img.get('product_id'),
            'src': src,
            'alt': img.get('alt', ''),
            'position': img.get('position'),
            'updated_at': img.get('updated_at'),
            'created_at': img.get('created_at'),
            'width': img.get('width'),
            'height': img.get('height'),
            # Responsive variants useful for srcset/picture in the frontend
            'responsive_fallback': variants.get('fallback'),
            'srcset': variants.get('srcset'),
            'webp_srcset': variants.get('webp_srcset'),
            'placeholder': variants.get('placeholder'),
        })

    return processed

def process_offers(product):
    """Process product offers into a standardized format."""
    offers = product.get("offers", [])
    if isinstance(offers, dict):
        offers = [offers]
    return [
        {
            "id": generate_deterministic_id(
                'offer', 
                product["id"], 
                offer.get("seller", {}).get("name") if isinstance(offer.get("seller"), dict) else None, 
                offer.get("sku")
            ),
            "product_id": product["id"],
            "availability": offer.get("availability"),
            "item_condition": offer.get("itemCondition"),
            "price_currency": offer.get("priceCurrency"),
            "price": clean_numeric(offer.get("price")),
            "price_valid_until": offer.get("priceValidUntil"),
            "url": offer.get("url"),
            "checkout_page_url_template": offer.get("checkoutPageURLTemplate"),
            "image": offer.get("image"),
            "mpn": offer.get("mpn"),
            "sku": offer.get("sku"),
            "seller_name": offer.get("seller", {}).get("name") if isinstance(offer.get("seller"), dict) else None,
        }
        for offer in offers
    ]

# ---------------- Database Operations ---------------- #
def bulk_upsert_data(table_name, data, batch_size=100, retries=3):
    """Bulk upsert data to Supabase with deduplication and error handling."""
    seen_ids = set()
    deduplicated_data = []
    duplicate_count = 0

    # Special handling for variants table
    if table_name == "variants":
        # Ensure variant_type field exists with None default
        for item in data:
            if "variant_type" not in item:
                item["variant_type"] = None

    for item in data:
        if item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            deduplicated_data.append(item)
        else:
            duplicate_count += 1

    if duplicate_count:
        logger.debug(f"Skipped {duplicate_count} duplicate IDs in {table_name}")

    for i in range(0, len(deduplicated_data), batch_size):
        batch = deduplicated_data[i:i + batch_size]
        for attempt in range(retries):
            try:
                # Handle variant_type conflict resolution
                on_conflict = "id"
                if table_name == "variants":
                    on_conflict = "id,variant_type"  # Include variant_type in conflict resolution
                
                response = supabase.table(table_name).upsert(batch, on_conflict=on_conflict).execute()
                
                if response.data:
                    logger.info(f"Upserted batch {i // batch_size + 1} to {table_name}: {len(batch)} records")
                    break
                else:
                    logger.warning(f"Unexpected response for batch {i // batch_size + 1} in {table_name}")
            except (requests.exceptions.RequestException, json.JSONDecodeError) as e:
                logger.error(f"Error in batch {i // batch_size + 1}, attempt {attempt + 1}: {e}")
                # Special debug for variants
                if table_name == "variants":
                    logger.debug(f"Problematic batch contents: {batch}")
                if attempt == retries - 1:
                    raise
                time.sleep(5)
                
class ProductProcessor:
    """Helper class to process and upload product data."""
    def __init__(self, submitted_by):
        self.submitted_by = submitted_by
        self.collections = {
            'products': [],
            'options': [],
            'variants': [],
            'images': [],
            'offers': []
        }

    def process_product(self, product):
        """Process a single product and its related data."""
        if not isinstance(product, dict):
            logger.error(f"Expected dictionary but got {type(product).__name__}")
            return None

        try:
            # Process main product fields
            product_data = {
                "id": product["id"],
                "title": product["title"],
                "handle": product["handle"],
                "vendor": product["vendor"],
                "category": product.get("category") or product.get("product_type", ""),
                "submitted_by": self.submitted_by,
                "description": strip_html_tags(product.get("body_html", "")),
                "created_at_external": product.get("created_at"),
                "updated_at_external": product.get("updated_at"),
                "published_at_external": product.get("published_at"),
                "product_type": product.get("product_type", ""),
                "tags": product.get("tags", []),
                "url": product.get("product_url", ""),
                "shop_id": product.get("shop_id", ""),
            }
            self.collections['products'].append(product_data)

            # Process related data
            self.collections['options'].extend(process_options(product))
            self.collections['variants'].extend(process_variants(product))
            self.collections['images'].extend(process_images(product))
            self.collections['offers'].extend(process_offers(product))
            
            # Capture variant types if available
            self.variant_types = product.get("variant_types", {})
            
            # Process variants with variant types
            self.collections['variants'].extend(
                process_variants(product, self.variant_types)  # Pass to processor
            )

            return product["id"]
        except Exception as e:
            logger.error(f"Error processing product {product.get('id', 'unknown')}: {e}")
            return None

    def get_stats(self):
        """Get statistics about processed products."""
        return {name: len(items) for name, items in self.collections.items()}

# ---------------- File Processing ---------------- #
def process_products_file(filepath, user_id):
    """Process a JSON file containing product data and upload to Supabase."""
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            products = json.load(file)

        processor = ProductProcessor(user_id)
        product_ids = []
        
        for product in products:
            product_id = processor.process_product(product)
            if product_id:
                product_ids.append(product_id)

        # Upload all data in parallel
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = []
            for table_name, data in processor.collections.items():
                if data:
                    futures.append(executor.submit(
                        bulk_upsert_data, 
                        table_name, 
                        data
                    ))
            
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    logger.error(f"Error in parallel upload: {e}")

        # Clean up stale products if single shop
        shop_ids = {p["shop_id"] for p in processor.collections["products"]}
        if len(shop_ids) == 1:
            remove_deleted_products(product_ids, shop_ids.pop())
        elif shop_ids:
            logger.warning(f"Multiple shop_ids found in {filepath}. Skipping stale product deletion.")

        return processor.get_stats()
    except Exception as e:
        logger.error(f"Error processing {filepath}: {e}")
        return None

def get_json_files(output_folder):
    """Get all JSON files from the output folder."""
    return [
        os.path.join(output_folder, f) 
        for f in os.listdir(output_folder) 
        if f.endswith("_products.json")
    ]

def remove_deleted_products(current_product_ids, shop_id):
    """Remove products from Supabase that are no longer in the latest scrape."""
    try:
        response = supabase.table("products").select("id").eq("shop_id", shop_id).execute()
        existing_ids = {item["id"] for item in response.data} if response.data else set()
        to_delete = list(existing_ids - set(current_product_ids))

        if not to_delete:
            logger.info(f"No stale products to delete for shop {shop_id}")
            return

        logger.info(f"Removing {len(to_delete)} stale products for shop {shop_id}")

        # Delete in parallel batches
        def delete_batch(batch):
            supabase.table("products").delete().in_("id", batch).execute()

        batch_size = 100
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = []
            for i in range(0, len(to_delete), batch_size):
                batch = to_delete[i:i + batch_size]
                futures.append(executor.submit(delete_batch, batch))
            
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    logger.error(f"Error deleting batch: {e}")

    except Exception as e:
        logger.error(f"Error deleting stale products: {e}")

# ---------------- Main Execution ---------------- #
def main():
    USER_UUID = "691aedc4-1055-4b57-adb7-7480febba4c8"
    json_files = get_json_files("output")
    
    if not json_files:
        logger.warning("No product JSON files found in output folder")
        return

    logger.info(f"Found {len(json_files)} product files to process")

    # Process files in parallel with dynamic worker count
    num_workers = min(cpu_count() * 2, len(json_files))
    total_stats = {}

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = {executor.submit(process_products_file, file, USER_UUID): file for file in json_files}
        
        for future in as_completed(futures):
            file = futures[future]
            try:
                stats = future.result()
                if stats:
                    logger.info(f"Completed {file}: {stats}")
                    for k, v in stats.items():
                        total_stats[k] = total_stats.get(k, 0) + v
                else:
                    logger.warning(f"File {file} returned no stats")
            except Exception as e:
                logger.error(f"Error processing {file}: {e}")

    logger.info("Processing complete. Total records processed:")
    for table, count in total_stats.items():
        logger.info(f"{table}: {count}")

if __name__ == "__main__":
    main()