import os
import json
import requests
import re

# Function to get product data from a collection page
def get_products_from_collection(collection_url):
    response = requests.get(collection_url)
    
    if response.status_code != 200:
        print(f"Failed to fetch {collection_url}")
        return None
    
    html = response.text
    
    # Find the 'meta' variable containing product data
    match = re.search(r'var meta = (\{.*?\});', html, re.DOTALL)
    
    if match:
        meta_json = match.group(1)
        meta_data = json.loads(meta_json) 
        return meta_data.get("products", []) 
    else:
        print(f"Could not find product data in {collection_url}")
        return None

# Function to process all collection files in the output folder
def process_all_collections(output_folder):
    for filename in os.listdir(output_folder):
        if filename.endswith("_collections.json"):
            file_path = os.path.join(output_folder, filename)
            with open(file_path, "r", encoding="utf-8") as file:
                collections = json.load(file)
                for collection in collections:
                    collection_url = collection.get("collection_url")
                    if collection_url:
                        products = get_products_from_collection(collection_url)
                        if products:
                            print(f"Found {len(products)} products in {collection_url}")
                            for product in products[:3]:  # Print first 3 products as an example
                                print(f"- {product['title']} (ID: {product['id']})")
                        else:
                            print(f"No products found in {collection_url}")

output_folder = "output"
process_all_collections(output_folder)
