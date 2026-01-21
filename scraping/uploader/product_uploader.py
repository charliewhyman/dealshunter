"""
Product uploader with normalized image structure and product categorization.
Filters to only upload available products (in-stock with valid prices).
"""
import json
from typing import List, Dict, Any, Optional
from pathlib import Path
from uploader.base_uploader import BaseUploader
from uploader.data_processor import DataProcessor
from uploader.supabase_client import SupabaseClient
from core.logger import uploader_logger
from uploader.product_categorizer import ProductCategorizer

class ProductProcessor:
    """Helper class to process product data."""
    
    def __init__(self, filter_available_only: bool = True, min_price_threshold: float = 0):
        self.supabase = SupabaseClient()
        self.processor = DataProcessor()
        self.categorizer = ProductCategorizer()
        self.collections = {
            'products': [],
            'options': [],
            'variants': [],
            'images': [],
            'offers': []
        }
        # Filter settings
        self.filter_available_only = filter_available_only
        self.min_price_threshold = min_price_threshold
        # Statistics
        self.stats = {
            'total_processed': 0,
            'skipped_no_variants': 0,
            'skipped_no_available': 0,
            'skipped_no_price': 0,
            'skipped_below_min_price': 0,
            'uploaded': 0
        }
    
    def should_skip_product(self, variants: List[Dict[str, Any]], min_price: Optional[float]) -> tuple[bool, str]:
        """Determine if product should be skipped based on filters."""
        self.stats['total_processed'] += 1
        
        # Check if product has variants
        if not variants:
            self.stats['skipped_no_variants'] += 1
            return True, "no variants"
        
        # Check availability if filtering is enabled
        if self.filter_available_only:
            has_available = any(
                self.processor.clean_boolean(v.get("available"))
                for v in variants
            )
            if not has_available:
                self.stats['skipped_no_available'] += 1
                return True, "no available variants"
        
        # Check price
        if min_price is None:
            self.stats['skipped_no_price'] += 1
            return True, "no valid price"
        
        # Check minimum price threshold
        if min_price < self.min_price_threshold:
            self.stats['skipped_below_min_price'] += 1
            return True, f"price below threshold ({min_price} < {self.min_price_threshold})"
        
        return False, ""
    
    def process_product(self, product: Dict[str, Any]) -> Optional[str]:
        """Process a single product and its related data WITH filtering."""
        if not isinstance(product, dict):
            uploader_logger.error(f"Expected dictionary but got {type(product).__name__}")
            return None
        
        try:
            product_id = str(product.get("id", ""))
            if not product_id:
                return None
            
            # Process variants first to calculate aggregated values and check filters
            variants = product.get("variants", [])
            variant_prices = []
            variant_available = []
            variant_discounts = []
            variant_data = []
            
            for variant in variants:
                variant_id = str(variant.get("id", ""))
                price = self.processor.clean_numeric(variant.get("price"))
                compare_price = self.processor.clean_numeric(variant.get("compare_at_price"))
                available = self.processor.clean_boolean(variant.get("available"))
                
                position = variant.get("position", 0)
                # Convert to int if it's a float
                if isinstance(position, float):
                    position = int(position)
                elif not isinstance(position, int):
                    try:
                        position = int(float(position))
                    except (ValueError, TypeError):
                        position = 0
                
                # Store variant data for JSON aggregation
                variant_entry = {
                    "id": variant_id,
                    "title": variant.get("title", ""),
                    "price": price,
                    "available": available,
                    "compare_at_price": compare_price,
                    "sku": variant.get("sku", ""),
                    "position": position
                }
                variant_data.append(variant_entry)
                
                # Calculate aggregated values
                if price is not None:
                    variant_prices.append(float(price))
                
                if available:
                    variant_available.append(True)
                
                # Calculate discount percentage if compare price exists
                if price is not None and compare_price is not None and compare_price > 0 and price < compare_price:
                    discount = ((float(compare_price) - float(price)) / float(compare_price)) * 100
                    variant_discounts.append(discount)
            
            # Calculate aggregated values
            min_price = min(variant_prices) if variant_prices else None
            
            # Apply filters BEFORE processing the rest of the data
            skip, reason = self.should_skip_product(variants, min_price)
            if skip:
                uploader_logger.debug(f"Skipping product {product_id}: {reason}")
                return None
            
            # Continue processing if product passes filters
            in_stock = any(variant_available) if variant_available else False
            max_discount = max(variant_discounts) if variant_discounts else None
            on_sale = max_discount is not None and max_discount > 0
            
            # Extract category information
            product_type = product.get("product_type", "")
            category_info = self.categorizer.get_category_info(product_type)
            
            # Process tags
            raw_tags = product.get("tags", [])
            if isinstance(raw_tags, str):
                if raw_tags:
                    tags_list = [tag.strip() for tag in raw_tags.split(",") if tag.strip()]
                else:
                    tags_list = []
            elif isinstance(raw_tags, list):
                tags_list = raw_tags
            else:
                tags_list = []
            
            # Process images for JSON aggregation (simplified - only store what we need)
            images = product.get("images", [])
            image_data = []
            for img in images:
                src = img.get('src')
                if not src:
                    continue
                
                image_entry = {
                    'id': img.get('id'),
                    'src': src,
                    'alt': img.get('alt', ''),
                    'position': img.get('position', 0),
                    'width': img.get('width'),
                    'height': img.get('height'),
                }
                image_data.append(image_entry)
            
            # Process main product WITH aggregated data
            product_data = {
                "id": product_id,
                "title": product.get("title", ""),
                "handle": product.get("handle", ""),
                "vendor": product.get("vendor", ""),
                "description": self.processor.strip_html_tags(product.get("body_html", "")),
                "updated_at_external": product.get("updated_at"),
                "published_at_external": product.get("published_at"),
                "product_type": product_type,
                "grouped_product_type": category_info['grouped_product_type'],
                "top_level_category": category_info['top_level_category'],
                "subcategory": category_info['subcategory'],
                "gender_age": category_info['gender_age'],
                "tags": tags_list,
                "url": product.get("product_url", ""),
                "shop_id": product.get("shop_id", ""),
                # Aggregated data
                "min_price": min_price,
                "in_stock": in_stock,
                "max_discount_percentage": max_discount,
                "on_sale": on_sale,
                # JSON aggregated data
                "variants": json.dumps(variant_data) if variant_data else None,
                "images": json.dumps(image_data) if image_data else None,
                # Will be populated from shops table
                "shop_name": None,
                # Timestamps
                "created_at": product.get("created_at"),
                "updated_at": product.get("updated_at"),
                "last_modified": product.get("updated_at"),
                # FTS search
                "fts": None,
            }
            self.collections['products'].append(product_data)
            self.stats['uploaded'] += 1
            
            # Store individual variants for separate table
            for variant in variants:
                variant_data = {
                    "id": str(variant.get("id", "")),
                    "product_id": product_id,
                    "title": variant.get("title", ""),
                    "available": self.processor.clean_boolean(variant.get("available")),
                    "price": self.processor.clean_numeric(variant.get("price")),
                    "compare_at_price": self.processor.clean_numeric(variant.get("compare_at_price")),
                }
                self.collections['variants'].append(variant_data)
            
            # Store images for images table (simplified)
            for img in images:
                src = img.get('src')
                if not src:
                    continue
                
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
                }
                self.collections['images'].append(image_data)
            
            return product_id
            
        except Exception as e:
            uploader_logger.error(f"Error processing product {product.get('id', 'unknown')}: {e}")
            return None
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about processed products."""
        stats = {
            'filter_stats': self.stats.copy(),
            'collection_counts': {name: len(items) for name, items in self.collections.items()}
        }
        
        # Calculate percentages
        total = self.stats['total_processed']
        if total > 0:
            stats['filter_stats']['uploaded_percentage'] = int(round((self.stats['uploaded'] / total) * 100, 0))
            stats['filter_stats']['skipped_percentage'] = int(round(((total - self.stats['uploaded']) / total) * 100, 0))
        
        return stats
    
    def reset_stats(self):
        """Reset statistics."""
        self.stats = {
            'total_processed': 0,
            'skipped_no_variants': 0,
            'skipped_no_available': 0,
            'skipped_no_price': 0,
            'skipped_below_min_price': 0,
            'uploaded': 0
        }
    
    def reload_categorization_config(self):
        """Reload the categorization configuration."""
        self.categorizer.reload_config()
        uploader_logger.info("🔄 Product categorization config reloaded")


class ProductUploader(BaseUploader):
    """Uploader for product data with filtering for available products only."""
    
    def __init__(self, filter_available_only: bool = True, min_price_threshold: float = 0):
        super().__init__('products')
        self.filter_available_only = filter_available_only
        self.min_price_threshold = min_price_threshold
        self.processor = ProductProcessor(
            filter_available_only=filter_available_only,
            min_price_threshold=min_price_threshold
        )
    
    def get_table_name(self) -> str:
        return "products_with_details_core"
    
    def get_on_conflict(self) -> str:
        return "id"
    
    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw product data (not used because processing is done in process_file)."""
        return []
    
    def process_file(self, filepath: Path) -> bool:
        """Process a single product file with filtering."""
        self.logger.info(f"Processing product file: {filepath.name}")
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                products = json.load(f)
            
            self.logger.info(f"Found {len(products)} products in file")
            
            product_ids = []
            
            # Reset processor collections and stats
            self.processor.collections = {k: [] for k in self.processor.collections}
            self.processor.reset_stats()
            
            # Get shop names mapping
            shop_id_to_name = {}
            for product in products:
                shop_id = product.get('shop_id')
                if shop_id and shop_id not in shop_id_to_name:
                    def get_shop_name(client):
                        result = client.table('shops').select('shop_name').eq('id', shop_id).execute()
                        return result.data[0]['shop_name'] if result.data else None
                    
                    shop_name = self.supabase.safe_execute(
                        get_shop_name, 
                        f"Get shop name for {shop_id}", 
                        max_retries=2
                    )
                    shop_id_to_name[shop_id] = shop_name
            
            # Process products with filtering
            for product in products:
                raw_shop_id = product.get('shop_id')
                
                # Validate and convert shop_id
                if raw_shop_id is None:
                    self.logger.warning(f"No shop_id found for product {product.get('id')}")
                    continue
                
                try:
                    shop_id = int(raw_shop_id)
                except (ValueError, TypeError):
                    self.logger.warning(f"Invalid shop_id format: {raw_shop_id}")
                    continue
                
                product["shop_id"] = shop_id
                product_id = self.processor.process_product(product)
                if product_id:
                    product_ids.append(product_id)
            
            # Log filtering statistics
            stats = self.processor.get_stats()
            filter_stats = stats['filter_stats']
            total = filter_stats['total_processed']
            uploaded = filter_stats['uploaded']
            
            self.logger.info(
                f"📊 Filter stats for {filepath.name}: "
                f"{uploaded}/{total} products uploaded ({filter_stats.get('uploaded_percentage', 0)}%)"
            )
            
            if total > 0:
                self.logger.info(f"  • Skipped no variants: {filter_stats['skipped_no_variants']}")
                self.logger.info(f"  • Skipped no available: {filter_stats['skipped_no_available']}")
                self.logger.info(f"  • Skipped no price: {filter_stats['skipped_no_price']}")
                self.logger.info(f"  • Skipped below min price: {filter_stats['skipped_below_min_price']}")
            
            # Update shop names in the processed products
            for product_data in self.processor.collections.get("products", []):
                shop_id = product_data.get("shop_id")
                if shop_id and shop_id in shop_id_to_name:
                    product_data["shop_name"] = shop_id_to_name[shop_id]
            
            if self.processor.collections.get("products"):
                # Log categorization summary
                grouped_types = {}
                for p in self.processor.collections["products"]:
                    gpt = p.get("grouped_product_type", "Uncategorized")
                    grouped_types[gpt] = grouped_types.get(gpt, 0) + 1
                
                self.logger.info(f"📊 Categorization summary ({uploaded} products):")
                for gpt, count in sorted(grouped_types.items(), key=lambda x: x[1], reverse=True)[:10]:
                    self.logger.info(f"  • {gpt}: {count} products")
                
                # Upload products first
                if self.supabase.bulk_upsert(
                    "products_with_details_core",
                    self.processor.collections["products"],
                    on_conflict="id"
                ):
                    self.logger.info(f"✅ Uploaded {uploaded} products to database")
                    
                    # Upload related tables
                    related_tables = ['options', 'variants', 'images', 'offers']
                    upload_success = True
                    
                    for table in related_tables:
                        data = self.processor.collections.get(table)
                        if data:
                            self.logger.info(f"Uploading {len(data)} {table}...")
                            
                            # Filter related data to only include products that were uploaded
                            if table in ['variants', 'images']:
                                uploaded_product_ids = {p['id'] for p in self.processor.collections['products']}
                                filtered_data = [
                                    item for item in data 
                                    if item.get('product_id') in uploaded_product_ids
                                ]
                                if len(filtered_data) < len(data):
                                    self.logger.info(
                                        f"  Filtered {len(data)} → {len(filtered_data)} {table} "
                                        f"(only for uploaded products)"
                                    )
                                data = filtered_data
                            
                            if data and not self.supabase.bulk_upsert(
                                table_name=table,
                                data=data,
                                on_conflict="id"
                            ):
                                self.logger.error(f"Failed to upload {table}")
                                upload_success = False
                                break
                    
                    if not upload_success:
                        return False
                    
                    # Clean up stale products for this shop
                    shop_ids = {p["shop_id"] for p in self.processor.collections["products"]}
                    if len(shop_ids) == 1:
                        shop_id = list(shop_ids)[0]
                        self.cleanup_stale_records(product_ids, shop_id)
                    
                    self.file_manager.move_to_processed(filepath)
                    self.logger.info(f"✅ Successfully processed {filepath.name}")
                    return True
                else:
                    self.logger.error(f"❌ Failed to upload products")
                    return False
            else:
                self.logger.warning(f"No products passed filters in {filepath.name}")
                # Still move to processed since we processed it
                self.file_manager.move_to_processed(filepath)
                return True
                
        except Exception as e:
            self.logger.error(f"❌ Error processing {filepath.name}: {e}")
            return False
    
    def process_all(self) -> Dict[str, Any]:
        """Process all product files."""
        files = self.find_data_files()
        results = {
            'processed': 0,
            'failed': 0,
            'total_files': len(files),
            'total_products': 0,
            'total_processed_products': 0,
            'shop_ids': set(),
            'filter_stats': {
                'total_processed': 0,
                'uploaded': 0,
                'skipped': 0
            }
        }
        
        if not files:
            self.logger.warning("No product files found")
            return results
        
        self.logger.info(
            f"Found {len(files)} product files "
            f"(filtering: {'ON' if self.filter_available_only else 'OFF'}, "
            f"min price: {self.min_price_threshold})"
        )
        
        for filepath in files:
            success = self.process_file(filepath)
            if success:
                results['processed'] += 1
                stats = self.processor.get_stats()['filter_stats']
                results['total_products'] += stats['uploaded']
                results['total_processed_products'] += stats['total_processed']
                results['filter_stats']['total_processed'] += stats['total_processed']
                results['filter_stats']['uploaded'] += stats['uploaded']
                results['filter_stats']['skipped'] += (stats['total_processed'] - stats['uploaded'])
                
                # Extract shop IDs
                for product in self.processor.collections.get('products', []):
                    if shop_id := product.get('shop_id'):
                        results['shop_ids'].add(shop_id)
            else:
                results['failed'] += 1
        
        results['shop_ids'] = list(results['shop_ids'])
        
        # Calculate final statistics
        total_processed = results['filter_stats']['total_processed']
        total_uploaded = results['filter_stats']['uploaded']
        
        if total_processed > 0:
            upload_percentage = round((total_uploaded / total_processed) * 100, 1)
            skip_percentage = round(((total_processed - total_uploaded) / total_processed) * 100, 1)
            
            self.logger.info(f"\n{'='*60}")
            self.logger.info("📊 FINAL FILTERING STATISTICS")
            self.logger.info(f"{'='*60}")
            self.logger.info(f"Total products processed: {total_processed:,}")
            self.logger.info(f"Total products uploaded: {total_uploaded:,} ({upload_percentage}%)")
            self.logger.info(f"Total products skipped: {total_processed - total_uploaded:,} ({skip_percentage}%)")
            self.logger.info(f"Database size reduction: {skip_percentage}%")
            
            if self.filter_available_only:
                self.logger.info(f"Expected products in database: ~{total_uploaded:,}")
                self.logger.info(f"Expected storage savings: {skip_percentage}%")
            self.logger.info(f"{'='*60}")
        
        return results
    
    def reload_categorization_config(self):
        """Reload the categorization configuration."""
        self.processor.reload_categorization_config()