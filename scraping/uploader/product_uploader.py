"""
Product uploader with normalized image structure.
"""

import json
import re
from typing import List, Dict, Any, Optional
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from uploader.base_uploader import BaseUploader
from uploader.data_processor import DataProcessor
from uploader.supabase_client import SupabaseClient
from core.logger import uploader_logger

class ProductProcessor:
    """Helper class to process product data."""
    
    def __init__(self):
        self.supabase = SupabaseClient()
        self.processor = DataProcessor()
        self.collections = {
            'products': [],
            'options': [],
            'variants': [],
            'images': [],
            'offers': []
        }
        # Cache for base_url_id lookups
        self.base_url_cache = {}
    
    def get_or_create_base_url_id(self, src: str) -> Optional[int]:
        """Extract base URL and get/create its ID."""
        if not src:
            return None
        
        # Extract base URL (everything up to the filename)
        # e.g. "https://cdn.shopify.com/s/files/1/0684/1067/1421/files/"
        match = re.match(r'^(https://[^/]+/.+/)', src)
        if not match:
            uploader_logger.warning(f"Could not extract base URL from: {src}")
            return None
        
        base_url = match.group(1)
        
        # Check cache first
        if base_url in self.base_url_cache:
            return self.base_url_cache[base_url]
        
        # Query or insert the base URL
        try:
            def do_select(client):
                return client.table('image_base_urls').select('id').eq('base_url', base_url).execute()
            
            result = self.supabase.safe_execute(do_select, 'Fetch base_url_id', max_retries=3)
            
            if result and result.data:
                base_url_id = result.data[0]['id']
            else:
                # Insert new base URL
                def do_insert(client):
                    return client.table('image_base_urls').insert({'base_url': base_url}).execute()
                
                insert_result = self.supabase.safe_execute(do_insert, 'Insert base_url', max_retries=3)
                if insert_result and insert_result.data:
                    base_url_id = insert_result.data[0]['id']
                else:
                    uploader_logger.error(f"Failed to insert base_url: {base_url}")
                    return None
            
            # Cache the result
            self.base_url_cache[base_url] = base_url_id
            return base_url_id
            
        except Exception as e:
            uploader_logger.error(f"Error getting base_url_id: {e}")
            return None
    
    def extract_image_parts(self, src: str) -> Dict[str, Optional[str]]:
        """Extract file_path and version from full URL."""
        if not src:
            return {'file_path': None, 'version': None}
        
        # Extract filename (last path segment before query params)
        # e.g. "ecksand-06733-w-0.70-round-ring_36b477ef-6e7b-4ee5-a38f-1a123c04ae87.png"
        file_match = re.search(r'/([^/]+\.(?:png|jpg|jpeg|gif|webp))(?:\?|$)', src)
        file_path = file_match.group(1) if file_match else None
        
        # Extract version parameter
        # e.g. "v=1766140581"
        version_match = re.search(r'v=(\d+)', src)
        version = version_match.group(1) if version_match else None
        
        return {
            'file_path': file_path,
            'version': version
        }
    
    def process_product(self, product: Dict[str, Any]) -> Optional[str]:
        """Process a single product and its related data."""
        if not isinstance(product, dict):
            uploader_logger.error(f"Expected dictionary but got {type(product).__name__}")
            return None
        
        try:
            product_id = str(product.get("id", ""))
            if not product_id:
                return None
            
            # Process main product
            product_data = {
                "id": product_id,
                "title": product.get("title", ""),
                "handle": product.get("handle", ""),
                "vendor": product.get("vendor", ""),
                "description": self.processor.strip_html_tags(product.get("body_html", "")),
                "updated_at_external": product.get("updated_at"),
                "published_at_external": product.get("published_at"),
                "product_type": product.get("product_type", ""),
                "tags": product.get("tags", []),
                "url": product.get("product_url", ""),
                "shop_id": product.get("shop_id", ""),
            }
            self.collections['products'].append(product_data)
            
            # Process options
            options = product.get("options", [])
            for opt in options:
                option_data = {
                    "id": self.processor.generate_deterministic_id('option', product_id, opt.get("name"), opt.get("position")),
                    "product_id": product_id,
                    "name": opt.get("name", ""),
                    "position": opt.get("position", 0),
                    "values": opt.get("values", []),
                }
                self.collections['options'].append(option_data)
            
            # Process variants
            variants = product.get("variants", [])
            for variant in variants:
                variant_data = {
                    "id": str(variant.get("id", "")),
                    "product_id": product_id,
                    "title": variant.get("title", ""),
                    "option1": variant.get("option1"),
                    "option2": variant.get("option2"),
                    "option3": variant.get("option3"),
                    "sku": variant.get("sku", ""),
                    "requires_shipping": variant.get("requires_shipping"),
                    "taxable": variant.get("taxable"),
                    "featured_image": (variant.get("featured_image") or (variant.get("image") and variant.get("image").get("src"))),
                    "available": self.processor.clean_boolean(variant.get("available")),
                    "price": self.processor.clean_numeric(variant.get("price")),
                    "grams": variant.get("grams"),
                    "compare_at_price": self.processor.clean_numeric(variant.get("compare_at_price")),
                    "position": variant.get("position"),
                    "inventory_quantity": variant.get("inventory_quantity"),
                    "updated_at_external": variant.get("updated_at"),
                    "variant_type": variant.get("variant_type")
                }
                self.collections['variants'].append(variant_data)
            
            # Process images with new normalized structure
            images = product.get("images", [])
            for img in images:
                src = img.get('src')
                if not src:
                    continue
                
                # Get or create base_url_id
                base_url_id = self.get_or_create_base_url_id(src)
                if not base_url_id:
                    uploader_logger.warning(f"Skipping image {img.get('id')} - could not resolve base_url_id")
                    continue
                
                # Extract file_path and version
                parts = self.extract_image_parts(src)
                
                image_data = {
                    'id': img.get('id'),
                    'product_id': product_id,
                    'base_url_id': base_url_id,
                    'file_path': parts['file_path'],
                    'version': parts['version'],
                    'alt': img.get('alt', ''),
                    'position': img.get('position', 0),
                    'updated_at': img.get('updated_at'),
                    'created_at': img.get('created_at'),
                    'width': img.get('width'),
                    'height': img.get('height'),
                }
                self.collections['images'].append(image_data)
            
            # Process offers
            offers = product.get("offers", [])
            if isinstance(offers, dict):
                offers = [offers]
            
            for offer in offers:
                seller_name = None
                if isinstance(offer.get("seller"), dict):
                    seller_name = offer["seller"].get("name")
                
                offer_data = {
                    "id": self.processor.generate_deterministic_id(
                        'offer', 
                        product_id, 
                        seller_name,
                        offer.get("sku")
                    ),
                    "product_id": product_id,
                    "availability": offer.get("availability"),
                    "item_condition": offer.get("itemCondition"),
                    "price_currency": offer.get("priceCurrency"),
                    "price": self.processor.clean_numeric(offer.get("price")),
                    "price_valid_until": offer.get("priceValidUntil"),
                    "url": offer.get("url"),
                    "checkout_page_url_template": offer.get("checkoutPageURLTemplate"),
                    "image": offer.get("image"),
                    "mpn": offer.get("mpn"),
                    "sku": offer.get("sku"),
                    "seller_name": seller_name,
                }
                self.collections['offers'].append(offer_data)
            
            return product_id
            
        except Exception as e:
            uploader_logger.error(f"Error processing product {product.get('id', 'unknown')}: {e}")
            return None
    
    def get_stats(self) -> Dict[str, int]:
        """Get statistics about processed products."""
        return {name: len(items) for name, items in self.collections.items()}

class ProductUploader(BaseUploader):
    """Uploader for product data."""
    
    def __init__(self):
        super().__init__('products')
        self.processor = ProductProcessor()
    
    def get_table_name(self) -> str:
        # main core table for product details
        return "products_with_details_core"

    def get_on_conflict(self) -> str:
        """Use id as the ON CONFLICT target for products."""
        return "id"
    
    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw product data (not used because processing is done in process_file)."""
        # This is handled in process_file with full processing
        return []
    
    def process_file(self, filepath: Path) -> bool:
        """Process a single product file with full processing."""
        self.logger.info(f"Processing product file: {filepath.name}")
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                products = json.load(f)
            
            product_ids = []
            
            # Collect shop URLs only for products missing numeric shop_id
            shop_urls = set()
            for product in products:
                raw_shop_id = product.get('shop_id')
                # Skip if already has valid numeric shop_id
                if raw_shop_id is not None and (isinstance(raw_shop_id, int) or (isinstance(raw_shop_id, str) and str(raw_shop_id).strip().isdigit())):
                    continue
                # Need to look up shop_id by URL
                url = product.get("product_url") or product.get("shop_url") or product.get("url")
                if url:
                    shop_urls.add(url)
            
            # Query DB for shop url -> id mapping (only if needed)
            url_to_id = {}
            if shop_urls:
                def do_select(client):
                    return client.table('shops').select('id,url').in_('url', list(shop_urls)).execute()
                result = self.supabase.safe_execute(do_select, 'Fetch shop ids by url', max_retries=3)
                if result and hasattr(result, 'data'):
                    for row in result.data:
                        url_to_id[row['url']] = row['id']
            
            # Process all products
            self.processor.collections = {k: [] for k in self.processor.collections}
            
            for product in products:
                raw_shop_id = product.get('shop_id')
                db_id = None
                
                # Trust numeric shop_id if present
                if raw_shop_id is not None and (isinstance(raw_shop_id, int) or (isinstance(raw_shop_id, str) and str(raw_shop_id).strip().isdigit())):
                    db_id = int(raw_shop_id)
                    self.logger.debug(f"Using numeric shop_id={db_id} for product {product.get('id')}")
                else:
                    # Fall back to URL lookup
                    url = product.get("product_url") or product.get("shop_url") or product.get("url")
                    db_id = url_to_id.get(url)
                    if db_id:
                        self.logger.debug(f"Resolved shop_id={db_id} from URL for product {product.get('id')}")

                if not db_id:
                    self.logger.warning(f"No valid shop_id found for product {product.get('id')} (raw_shop_id={raw_shop_id})")
                    continue
                
                product["shop_id"] = db_id
                product_id = self.processor.process_product(product)
                if product_id:
                    product_ids.append(product_id)
            
            if self.processor.collections.get("products"):
                # Debug: log count and a small sample before attempting upsert
                try:
                    sample_count = min(3, len(self.processor.collections.get("products", [])))
                    self.logger.info(
                        f"Preparing to upsert {len(self.processor.collections['products'])} products. Sample ids: {[p.get('id') for p in self.processor.collections['products'][:sample_count]]}"
                    )
                except Exception:
                    # don't fail processing for logging issues
                    pass

                # Upsert into the core products table
                if self.supabase.bulk_upsert(
                    "products_with_details_core",
                    self.processor.collections["products"],
                    on_conflict="id"
                ):
                    self.logger.info(f"Uploaded {len(self.processor.collections['products'])} products from {filepath.name}")
                else:
                    self.logger.error(f"Failed to upload products from {filepath.name}")
                    return False
            else:
                self.logger.warning(f"No products to upload from {filepath.name}")
                return True
            
            # Upload related tables in parallel
            related_tables = ['options', 'variants', 'images', 'offers']
            
            def upload_table(table_name: str, data: List[Dict]) -> bool:
                if data:
                    # Use primary key `id` for conflict target
                    on_conflict = "id"
                    return self.supabase.bulk_upsert(
                        table_name=table_name,
                        data=data,
                        on_conflict=on_conflict
                    )
                return True
            
            with ThreadPoolExecutor(max_workers=4) as executor:
                futures = []
                for table in related_tables:
                    if self.processor.collections.get(table):
                        futures.append(
                            executor.submit(
                                upload_table,
                                table,
                                self.processor.collections[table]
                            )
                        )
                
                for future in as_completed(futures):
                    try:
                        if not future.result():
                            self.logger.error("Failed to upload related table")
                            return False
                    except Exception as e:
                        self.logger.error(f"Error in parallel upload: {e}")
                        return False
            
            # Clean up stale products for this shop
            shop_ids = {p["shop_id"] for p in self.processor.collections["products"]}
            if len(shop_ids) == 1:
                shop_id = list(shop_ids)[0]
                self.cleanup_stale_records(product_ids, shop_id)

            self.file_manager.move_to_processed(filepath)
            self.logger.info(f"Successfully processed {filepath.name}")
            return True
            
        except Exception as e:
            self.logger.error(f"Error processing {filepath.name}: {e}")
            return False
    
    def process_all(self) -> Dict[str, Any]:
        """Process all product files."""
        files = self.find_data_files()
        results = {
            'processed': 0,
            'failed': 0,
            'total_files': len(files),
            'total_products': 0,
            'shop_ids': set()
        }
        
        if not files:
            self.logger.warning("No product files found")
            return results
        
        self.logger.info(f"Found {len(files)} product files")
        
        for filepath in files:
            success = self.process_file(filepath)
            if success:
                results['processed'] += 1
                results['total_products'] += len(self.processor.collections.get('products', []))
                
                # Extract shop IDs
                for product in self.processor.collections.get('products', []):
                    if shop_id := product.get('shop_id'):
                        results['shop_ids'].add(shop_id)
            else:
                results['failed'] += 1
        
        results['shop_ids'] = list(results['shop_ids'])
        return results