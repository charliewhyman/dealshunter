"""
Product uploader with full processing.
"""

import json
from typing import List, Dict, Any, Optional
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from uploader.base_uploader import BaseUploader
from uploader.data_processor import DataProcessor
from uploader.supabase_client import SupabaseClient
from core.logger import uploader_logger
import config.settings as settings

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
                "created_at_external": product.get("created_at"),
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
                    "variant_type": variant.get("variant_type"),
                    "title": variant.get("title", ""),
                    "price": self.processor.clean_numeric(variant.get("price")),
                    "compare_at_price": self.processor.clean_numeric(variant.get("compare_at_price")),
                    "sku": variant.get("sku", ""),
                    "inventory_quantity": variant.get("inventory_quantity"),
                    "requires_shipping": variant.get("requires_shipping"),
                    "taxable": variant.get("taxable"),
                    "available": self.processor.clean_boolean(variant.get("available")),
                    "created_at_external": variant.get("created_at"),
                    "updated_at": variant.get("updated_at"),
                }
                self.collections['variants'].append(variant_data)
            
            # Process images
            images = product.get("images", [])
            for img in images:
                src = img.get('src')
                variants = self.processor.build_image_variants(src)
                
                image_data = {
                    'id': img.get('id'),
                    'product_id': product_id,
                    'src': src,
                    'alt': img.get('alt', ''),
                    'position': img.get('position', 0),
                    'updated_at': img.get('updated_at'),
                    'created_at': img.get('created_at'),
                    'width': img.get('width'),
                    'height': img.get('height'),
                    'responsive_fallback': variants.get('fallback'),
                    'srcset': variants.get('srcset'),
                    'webp_srcset': variants.get('webp_srcset'),
                    'placeholder': variants.get('placeholder'),
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
        return "products"

    def get_on_conflict(self) -> str:
        """Use id as the ON CONFLICT target for products."""
        return "id"
    
    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw product data."""
        # This is handled in process_file with full processing
        return []
    
    def process_file(self, filepath: Path) -> bool:
        """Process a single product file with full processing."""
        self.logger.info(f"Processing product file: {filepath.name}")
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                products = json.load(f)
            product_ids = []
            # Collect all unique shop URLs from products
            shop_urls = set()
            for product in products:
                url = product.get("product_url") or product.get("shop_url") or product.get("url")
                if url:
                    shop_urls.add(url)
            # Query DB for shop url -> id mapping
            url_to_id = {}
            if shop_urls:
                def do_select(client):
                    return client.table('shops').select('id,url').in_('url', list(shop_urls)).execute()
                result = self.supabase.safe_execute(do_select, 'Fetch shop ids by url', max_retries=3)
                if result and hasattr(result, 'data'):
                    for row in result.data:
                        url_to_id[row['url']] = row['id']
            # Process all products, replacing shop_id with DB id
            self.processor.collections = {k: [] for k in self.processor.collections}
            for product in products:
                url = product.get("product_url") or product.get("shop_url") or product.get("url")
                db_id = url_to_id.get(url)
                if db_id:
                    product["shop_id"] = db_id
                else:
                    self.logger.warning(f"No shop id found for url {url} in product {product.get('id')}")
                    continue
                product_id = self.processor.process_product(product)
                if product_id:
                    product_ids.append(product_id)
            if self.processor.collections.get("products"):
                if self.supabase.bulk_upsert(
                    "products",
                    self.processor.collections["products"],
                    on_conflict="id"
                ):
                    self.logger.info(f"Uploaded products from {filepath.name}")
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
                    on_conflict = "id"
                    if table_name == "variants":
                        on_conflict = "id,variant_type"
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
            
            # Upload related tables in parallel
            related_tables = ['options', 'variants', 'images', 'offers']
            
            def upload_table(table_name: str, data: List[Dict]) -> bool:
                if data:
                    on_conflict = "id"
                    if table_name == "variants":
                        on_conflict = "id,variant_type"
                    
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
                
                # Wait for all uploads to complete
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
            
            # Move file to processed
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