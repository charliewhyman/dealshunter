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

# Helper to strip HTML tags
def strip_html_tags(html_text):
    """Remove HTML tags from text and decode HTML entities.

    Args:
        html_text (str): Text containing HTML tags

    Returns:
        str: Clean text without HTML tags
    """
    return re.sub(r"<[^>]*>", "", unescape(html_text or ""))

def generate_deterministic_id(namespace_string, *components):
    """Generate a deterministic UUID based on input components."""
    namespace = uuid.UUID('12345678-1234-5678-1234-567812345678')
    components_str = '|'.join(str(c or '') for c in components)
    unique_string = f"{namespace_string}:{components_str}"
    generated_uuid = uuid.uuid5(namespace, unique_string)
    return str(generated_uuid)

def process_options(product):
    """Process product options into a standardized format.

    Args:
        product (dict): Product data containing options

    Returns:
        list: Processed options with generated IDs
    """
    options = product.get("options", [])
    processed_options = []
    for option in options:
        option_uuid = generate_deterministic_id(
            'option',
            product["id"],
            option["name"],
            option["position"]
        )
        processed_options.append({
            "id": option_uuid,
            "product_id": product["id"],
            "name": option["name"],
            "position": option["position"],
            "values": option["values"],
        })
    return processed_options

def process_variants(product):
    """Process product variants into a standardized format."""
    variants = product.get("variants", [])
    processed_variants = []
    for variant in variants:
        variant_data = {
            "id": variant["id"],
            "product_id": product["id"],
            "title": variant["title"],
            "price": variant["price"],
            "sku": variant["sku"]
        }
        # Add optional fields
        optional_fields = [
            "inventory_quantity",
            "requires_shipping",
            "taxable",
            "compare_at_price",
            "created_at",
            "updated_at"
        ]
        for field in optional_fields:
            key = "created_at_external" if field == "created_at" else field
            variant_data[key] = variant.get(field)
        processed_variants.append(variant_data)
    return processed_variants

def process_images(product):
    """Process product images into a standardized format.

    Args:
        product (dict): Product data containing images

    Returns:
        list: Processed images with standardized fields
    """
    images = product.get("images", [])
    processed_images = []
    for image in images:
        img_data = {
            "id": image["id"],
            "product_id": product["id"],
            "src": image["src"],
            "alt": image.get("alt", ""),
            "position": image["position"]
        }
        processed_images.append(img_data)
    return processed_images

def process_offers(product):
    """Process product offers into a standardized format."""
    offers = product.get("offers", [])
    processed_offers = []
    for offer in offers:
        seller = offer.get("seller", {})
        seller_name = None
        if isinstance(seller, dict):
            seller_name = seller.get("name")
        sku = offer.get("sku")
        offer_id = generate_deterministic_id(
            'offer',
            product["id"],
            seller_name,
            sku
        )
        processed_offers.append({
            "id": offer_id,
            "product_id": product["id"],
            "availability": offer.get("availability"),
            "item_condition": offer.get("itemCondition"),
            "price_currency": offer.get("priceCurrency"),
            "price": offer.get("price"),
            "price_valid_until": offer.get("priceValidUntil"),
            "url": offer.get("url"),
            "checkout_page_url_template": offer.get("checkoutPageURLTemplate"),
            "image": offer.get("image"),
            "mpn": offer.get("mpn"),
            "sku": sku,
            "seller_name": seller_name
        })
    return processed_offers

def handle_upsert_response(response, batch_num, batch_size, error_logs):
    """Handle response from Supabase upsert operation."""
    if response.data:
        print(f"Upserted batch {batch_num}: {batch_size} records.")
        return True
    if hasattr(response, 'error') and response.error:
        error_message = f"Error in upsert batch {batch_num}: {response.error}"
        print(error_message)
        error_logs.append(error_message)
    else:
        error_message = f"Unexpected response in batch {batch_num}: {response}"
        print(error_message)
        error_logs.append(error_message)
    return False

def log_duplicates(table_name, duplicates):
    """Log duplicate items found during processing."""
    if duplicates:
        print(f"\nDuplicate IDs found in {table_name}:")
        for dup_id, items in duplicates.items():
            sources = [item.get('source_file', 'Unknown') for item in items]
            print(f"ID: {dup_id}, Sources: {', '.join(sources)}")

def bulk_upsert_data(table_name, data, batch_size=100, retries=3):
    """Bulk upsert data to Supabase table with deduplication and error handling."""
    dedup_data = {
        'seen_ids': set(),
        'filtered': [],
        'duplicates': {},
        'errors': []
    }

    # Deduplicate data
    for item in data:
        if item["id"] not in dedup_data['seen_ids']:
            dedup_data['seen_ids'].add(item["id"])
            dedup_data['filtered'].append(item)
        else:
            dedup_data['duplicates'].setdefault(item["id"], []).append(item)

    # Process batches
    for i in range(0, len(dedup_data['filtered']), batch_size):
        batch = dedup_data['filtered'][i:i + batch_size]
        for attempt in range(retries):
            try:
                response = supabase.table(table_name).upsert(batch, on_conflict="id").execute()
                if handle_upsert_response(
                    response,
                    i // batch_size,
                    len(batch),
                    dedup_data['errors']
                ):
                    break
            except (requests.exceptions.RequestException, json.JSONDecodeError) as e:
                error_message = f"Error in batch {i // batch_size}, attempt {attempt + 1}: {e}"
                print(error_message)
                dedup_data['errors'].append(error_message)
                if attempt == retries - 1:
                    raise
                time.sleep(5)

    log_duplicates(table_name, dedup_data['duplicates'])

    if dedup_data['errors']:
        print("\nSummary of errors encountered during processing:")
        for error in dedup_data['errors']:
            print(error)

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
            "submitted_by": self.submitted_by
        }
        # Add optional fields
        optional_fields = {
            "description": strip_html_tags(product.get("body_html", "")),
            "created_at_external": product.get("created_at"),
            "updated_at_external": product.get("updated_at"),
            "published_at_external": product.get("published_at"),
            "product_type": product.get("product_type", ""),
            "tags": product.get("tags", []),
            "url": product.get("product_url", "")
        }
        fields.update(optional_fields)
        self.collections['products'].append(fields)
        self.collections['options'].extend(process_options(product))
        self.collections['variants'].extend(process_variants(product))
        self.collections['images'].extend(process_images(product))
        self.collections['offers'].extend(process_offers(product))

    def get_stats(self):
        """Get statistics about processed products."""
        return {
            name: len(items) for name, items in self.collections.items()
        }

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
    if not os.path.exists(output_folder):
        print(f"Output folder '{output_folder}' does not exist.")
        return []

    json_files = [
        os.path.join(output_folder, f) 
        for f in os.listdir(output_folder) 
        if f.endswith(".json")
    ]
    if not json_files:
        print(f"No JSON files found in folder '{output_folder}'.")
    return json_files

if __name__ == "__main__":
    USER_UUID = "691aedc4-1055-4b57-adb7-7480febba4c8"
    json_files = get_json_files("output")
    for json_file in json_files:
        print(f"Processing file: {json_file}")
        process_products_file(json_file, USER_UUID)
        