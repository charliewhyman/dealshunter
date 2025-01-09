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

def generate_option_uuid(product_id, name, position):
    """Generate a deterministic UUID for an option."""
    namespace = uuid.UUID('12345678-1234-5678-1234-567812345678')  # Fixed namespace
    unique_string = f"{product_id}:{name}:{position}"
    return str(uuid.uuid5(namespace, unique_string))

def process_options(product):
    """Process options from a product and prepare for upsert."""
    options = product.get("options", [])
    processed_options = []
    for option in options:
        option_uuid = generate_option_uuid(
            product_id=product["id"],
            name=option["name"],
            position=option["position"]
        )
        processed_options.append({
            "id": option_uuid,
            "product_id": product["id"],
            "name": option["name"],
            "position": option["position"],
            "values": option["values"],  # Assuming `values` is a valid column
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

# Bulk upsert function with deduplication and logging
def bulk_upsert_data(table_name, data, batch_size=100, retries=3):
    seen_ids = set()  # Set to track already seen ids for deduplication
    filtered_data = []
    duplicates = {}  # Dictionary to track duplicates per file

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
                    print(f"Error in upsert batch {i // batch_size}: {response._raw_error['message']}")
                    break
                else:
                    print(f"Unexpected response: {response}")
            except Exception as e:
                print(f"Error in upsert batch {i // batch_size}, attempt {attempt + 1}: {e}")
                if attempt < retries - 1:
                    time.sleep(5)
                else:
                    raise

# Process products and associated data
def process_products_file(filepath, submitted_by):
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            products = json.load(file)

        product_data = []
        option_data = []
        variant_data = []
        image_data = []

        for product in products:
            # Prepare product data
            product_id = product["id"]  # Shopify globally unique product ID (int64)
            title = product["title"]
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
                "description": description,
                "created_at_external": created_at_external,
                "updated_at_external": updated_at_external,
                "vendor": vendor,
                "product_type": product_type,
                "tags": tags,
                "submitted_by": submitted_by,
                "url": url,
                # Exclude `votes` to prevent overwriting
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

    except Exception as e:
        print(f"Error processing file {filepath}: {e}")

# Main
if __name__ == "__main__":
    submitted_by = "691aedc4-1055-4b57-adb7-7480febba4c8"  # Replace with the UUID of the user submitting data
    output_folder = "output"

    if not os.path.exists(output_folder):
        print(f"Output folder '{output_folder}' does not exist.")
        exit(1)

    json_files = [os.path.join(output_folder, f) for f in os.listdir(output_folder) if f.endswith(".json")]

    if not json_files:
        print(f"No JSON files found in folder '{output_folder}'.")
        exit(0)

    for json_file in json_files:
        print(f"Processing file: {json_file}")
        process_products_file(json_file, submitted_by)
