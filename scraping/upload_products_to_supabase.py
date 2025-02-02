"""Module for uploading scraped Shopify product data to Supabase database."""

import os
import json
import re
import time
import uuid
from html import unescape
from supabase import create_client
import requests

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    ERROR_MSG = "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    raise ValueError(f"{ERROR_MSG} is not set in environment variables.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Helper functions
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

# Processing functions
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

def process_variants(product):
    """Process product variants into a standardized format."""
    variants = product.get("variants", [])
    processed_variants = []
    for variant in variants:
        variant_data = {
            "id": variant["id"],
            "product_id": product["id"],
            "title": variant["title"],
            "price": clean_numeric(variant["price"]),
            "compare_at_price": clean_numeric(variant.get("compare_at_price")),
            "sku": variant["sku"],
            "inventory_quantity": variant.get("inventory_quantity"),
            "requires_shipping": variant.get("requires_shipping"),
            "taxable": variant.get("taxable"),
            "created_at_external": variant.get("created_at"),
            "updated_at": variant.get("updated_at"),
        }
        processed_variants.append(variant_data)
    return processed_variants

def process_images(product):
    """Process product images into a standardized format."""
    images = product.get("images", [])
    return [
        {
            "id": img["id"],
            "product_id": product["id"],
            "src": img["src"],
            "alt": img.get("alt", ""),
            "position": img["position"]
        }
        for img in images
    ]

def process_offers(product):
    """Process product offers into a standardized format."""
    offers = product.get("offers", [])
    return [
        {
            "id": generate_deterministic_id(
                'offer', 
                product["id"], 
                offer.get("seller", {}).get("name") if isinstance(offer.get("seller"), dict) else None, 
                offer.get("sku")
            ),
            "product_id": product["id"],
            "availability": clean_boolean(offer.get("availability")),
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

# Database operations
def bulk_upsert_data(table_name, data, batch_size=100, retries=3):
    """Bulk upsert data to Supabase with deduplication and error handling."""
    seen_ids = set()
    deduplicated_data = []
    duplicate_logs = []

    # Deduplicate data
    for item in data:
        if item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            deduplicated_data.append(item)
        else:
            duplicate_logs.append(item["id"])

    # Log duplicates
    if duplicate_logs:
        print(f"Duplicate IDs found in {table_name}: {duplicate_logs}")

    # Process batches
    for i in range(0, len(deduplicated_data), batch_size):
        batch = deduplicated_data[i:i + batch_size]
        for attempt in range(retries):
            try:
                response = supabase.table(table_name).upsert(batch, on_conflict="id").execute()
                if response.data:
                    print(f"Upserted batch {i // batch_size}: {len(batch)} records.")
                    break
                else:
                    print(f"Unexpected response in batch {i // batch_size}: {response}")
            except (requests.exceptions.RequestException, json.JSONDecodeError) as e:
                print(f"Error in batch {i // batch_size}, attempt {attempt + 1}: {e}")
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
        fields = {
            "id": product["id"],
            "title": product["title"],
            "handle": product["handle"],
            "vendor": product["vendor"],
            "submitted_by": self.submitted_by,
            "description": strip_html_tags(product.get("body_html", "")),
            "created_at_external": product.get("created_at"),
            "updated_at_external": product.get("updated_at"),
            "published_at_external": product.get("published_at"),
            "product_type": product.get("product_type", ""),
            "tags": product.get("tags", []),
            "url": product.get("product_url", "")
        }
        self.collections['products'].append(fields)
        self.collections['options'].extend(process_options(product))
        self.collections['variants'].extend(process_variants(product))
        self.collections['images'].extend(process_images(product))
        self.collections['offers'].extend(process_offers(product))

    def get_stats(self):
        """Get statistics about processed products."""
        return {name: len(items) for name, items in self.collections.items()}

def process_products_file(filepath, user_id):
    """Process a JSON file containing product data and upload to Supabase."""
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            products = json.load(file)

        processor = ProductProcessor(user_id)
        for product in products:
            processor.process_product(product)

        # Bulk upsert all collections
        for table_name, data in processor.collections.items():
            if data:
                print(f"Upserting {len(data)} {table_name}...")
                bulk_upsert_data(table_name, data)

    except requests.exceptions.RequestException as e:
        print(f"Error communicating with Supabase: {e}")
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error processing file {filepath}: {e}")

def get_json_files(output_folder):
    """Get all JSON files from the output folder."""
    return [os.path.join(output_folder, f) for f in os.listdir(output_folder) if f.endswith(".json")]

if __name__ == "__main__":
    USER_UUID = "691aedc4-1055-4b57-adb7-7480febba4c8"
    for json_file in get_json_files("output"):
        print(f"Processing file: {json_file}")
        process_products_file(json_file, USER_UUID)
