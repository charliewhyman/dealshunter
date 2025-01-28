import os
import json
import time
import uuid
from html import unescape
from supabase import create_client

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in environment variables.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Helper to strip HTML tags
def strip_html_tags(html_text):
    import re
    return re.sub(r"<[^>]*>", "", unescape(html_text or ""))

def generate_deterministic_id(namespace_string, *components):
    """Generate a deterministic UUID based on components.
    
    Args:
        namespace_string: String to identify the type of ID (e.g., 'option' or 'offer')
        components: Variable number of components to generate the unique string
    """
    namespace = uuid.UUID('12345678-1234-5678-1234-567812345678')
    unique_string = f"{namespace_string}:{'|'.join(str(c or '') for c in components)}"
    generated_uuid = uuid.uuid5(namespace, unique_string)
    
    return str(generated_uuid)

def process_options(product):
    """Process options from a product and prepare for upsert."""
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
    """Prepare variant data for upsert."""
    variants = product.get("variants", [])
    processed_variants = []
    for variant in variants:
        # Set inventory_quantity to None (NULL in DB) if missing
        inventory_quantity = variant.get("inventory_quantity", None)  # Set to None if missing
        processed_variants.append({
            "id": variant["id"],
            "product_id": product["id"],
            "title": variant["title"],
            "price": variant["price"],
            "sku": variant["sku"],
            "inventory_quantity": inventory_quantity,
            "requires_shipping": variant.get("requires_shipping", None),
            "taxable": variant.get("taxable", None), 
            "compare_at_price": variant.get("compare_at_price", None),  
            "created_at_external": variant.get("created_at"),
            "updated_at_external": variant.get("updated_at")
        })
    return processed_variants


def process_images(product):
    """Prepare image data for upsert."""
    images = product.get("images", [])
    processed_images = []
    for image in images:
        processed_images.append({
            "id": image["id"],
            "product_id": product["id"],
            "src": image["src"],
            "alt": image.get("alt", ""),
            "position": image["position"]
        })
    return processed_images

def process_offers(product):
    """Prepare offer data for upsert."""
    offers = product.get("offers", [])
    processed_offers = []
    for offer in offers:
        # Extract seller name from the seller object if it exists
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

# Bulk upsert function with deduplication and logging
def bulk_upsert_data(table_name, data, batch_size=100, retries=3):
    seen_ids = set()  # Set to track already seen ids for deduplication
    filtered_data = []
    duplicates = {}  # Dictionary to track duplicates per file
    error_logs = []  # List to collect error logs

    # Filter out duplicate entries and track duplicates
    for item in data:
        if item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            filtered_data.append(item)
        else:
            # Track duplicates by file
            duplicates.setdefault(item["id"], []).append(item)

    # Log duplicates at the end
    if duplicates:
        print(f"\nDuplicate IDs found in {table_name}:")
        for duplicate_id, items in duplicates.items():
            print(f"ID: {duplicate_id}, Source Files: {', '.join([item.get('source_file', 'Unknown') for item in items])}")

    for i in range(0, len(filtered_data), batch_size):
        batch = filtered_data[i:i + batch_size]
        for attempt in range(retries):
            try:
                response = (
                    supabase.table(table_name)
                    .upsert(batch, on_conflict="id")
                    .execute()
                )
                if response.data:
                    print(f"Upserted batch {i // batch_size}: {len(batch)} records.")
                    break
                elif response._raw_error:
                    error_message = f"Error in upsert batch {i // batch_size}: {response._raw_error['message']}"
                    print(error_message)
                    error_logs.append(error_message)
                    break
                else:
                    error_message = f"Unexpected response in batch {i // batch_size}: {response}"
                    print(error_message)
                    error_logs.append(error_message)
            except Exception as e:
                error_message = f"Error in upsert batch {i // batch_size}, attempt {attempt + 1}: {e}"
                print(error_message)
                error_logs.append(error_message)
                if attempt < retries - 1:
                    time.sleep(5)
                else:
                    raise

    # Log all errors at the end
    if error_logs:
        print("\nSummary of errors encountered during processing:")
        for error in error_logs:
            print(error)

# Process products and associated data
def process_products_file(filepath, submitted_by):
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            products = json.load(file)

        product_data = []
        option_data = []
        variant_data = []
        image_data = []
        offer_data = []

        for product in products:
            # Prepare product data
            product_id = product["id"]  # Shopify globally unique product ID (int64)
            title = product["title"]
            handle = product["handle"]
            description = strip_html_tags(product.get("body_html", ""))
            created_at_external = product.get("created_at")
            updated_at_external = product.get("updated_at")
            vendor = product["vendor"]
            product_type = product.get("product_type", "")
            tags = product.get("tags", [])
            url = product.get("product_url", "")

            # Add product data
            product_data.append({
                "id": product_id,
                "title": title,
                "handle": handle,
                "description": description,
                "created_at_external": created_at_external,
                "updated_at_external": updated_at_external,
                "published_at_external": product.get("published_at"),  # New field
                "vendor": vendor,
                "product_type": product_type,
                "tags": tags,
                "submitted_by": submitted_by,
                "url": url,
            })

            # Prepare options data
            options = process_options(product)
            option_data.extend(options)

            # Prepare variants data
            variants = process_variants(product)
            variant_data.extend(variants)

            # Prepare images data
            images = process_images(product)
            image_data.extend(images)

            # Prepare offers data
            offers = process_offers(product)
            offer_data.extend(offers)

        # Bulk upsert products
        if product_data:
            print(f"Upserting {len(product_data)} products...")
            bulk_upsert_data("products", product_data)

        # Bulk upsert options
        if option_data:
            print(f"Upserting {len(option_data)} options...")
            bulk_upsert_data("options", option_data)

        # Bulk upsert variants
        if variant_data:
            print(f"Upserting {len(variant_data)} variants...")
            bulk_upsert_data("variants", variant_data)

        # Bulk upsert images
        if image_data:
            print(f"Upserting {len(image_data)} images...")
            bulk_upsert_data("images", image_data)

        # Bulk upsert offers
        if offer_data:
            print(f"Upserting {len(offer_data)} offers...")
            bulk_upsert_data("offers", offer_data)

    except Exception as e:
        print(f"Error processing file {filepath}: {e}")

# Main
if __name__ == "__main__":
    submitted_by = "691aedc4-1055-4b57-adb7-7480febba4c8"
    output_folder = "output"

    if not os.path.exists(output_folder):
        print(f"Output folder '{output_folder}' does not exist.")
        exit(1)

    json_files = [os.path.join(output_folder, f) for f in os.listdir(output_folder) if f.endswith(".json")]

    if not json_files:
        print(f"No JSON files found in folder '{output_folder}'.")
        exit(0)

    # Process only the first JSON file
    json_file = json_files[0]
    print(f"Processing file: {json_file}")
    process_products_file(json_file, submitted_by)