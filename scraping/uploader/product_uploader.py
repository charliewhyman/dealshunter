"""
Product uploader with normalized image structure and product categorization.
Filters to only upload available products (in-stock with valid prices).
"""
import json
import re
import html as html_lib
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime
import time

from uploader.base_uploader import BaseUploader
from uploader.data_processor import DataProcessor
from core.logger import uploader_logger
from uploader.product_categorizer import ProductCategorizer


class HtmlSanitizer:
    """Secure HTML sanitizer for Shopify descriptions."""
    
    def __init__(self):
        # Shopify-allowed tags
        self.allowed_tags = [
            'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ins', 'del',
            'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'div', 'span', 'a', 'img', 'table', 'tr', 'td', 'th',
            'tbody', 'thead', 'tfoot', 'blockquote', 'hr', 'pre',
            'code', 'sup', 'sub'
        ]
        
        # Simple sanitization (for production, use bleach library)
        self.shopify_app_patterns = [
            r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>',
            r'<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>',
            r'<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>',
        ]
    
    def sanitize(self, html_content: str) -> str:
        """Sanitize HTML content from Shopify - minimal sanitization."""
        if not html_content or not html_content.strip():
            return ""
        
        try:
            # Just decode HTML entities and return
            decoded = html_lib.unescape(html_content)
            
            # Only remove script tags
            cleaned = re.sub(r'<script[^>]*>.*?</script>', '', decoded, flags=re.IGNORECASE | re.DOTALL)
            
            return cleaned.strip()
            
        except Exception as e:
            uploader_logger.error(f"HTML sanitization error: {e}")
            return html_content  # Return original as fallback
    
    def _html_to_plain_text(self, html_content: str, max_length: int = 2000) -> str:
        """Convert HTML to plain text as fallback."""
        try:
            # Remove HTML tags
            text = re.sub(r'<[^>]+>', ' ', html_content)
            # Decode HTML entities
            text = html_lib.unescape(text)
            # Normalize whitespace
            text = ' '.join(text.split())
            # Truncate
            if len(text) > max_length:
                text = text[:max_length].rsplit(' ', 1)[0] + '...'
            return text
        except:
            return ""


class ProductProcessor:
    """Helper class to process product data with HTML description support."""
    
    def __init__(
        self, 
        filter_available_only: bool = True, 
        min_price_threshold: float = 0,
        preserve_html: bool = True
    ):
        self.processor = DataProcessor()
        self.categorizer = ProductCategorizer()
        self.html_sanitizer = HtmlSanitizer()
        
        # Configuration
        self.filter_available_only = filter_available_only
        self.min_price_threshold = min_price_threshold
        self.preserve_html = preserve_html
        
        # Collections
        self.collections = {
            'products': [],
            'variants': [],
            'images': [],
        }
        
        # Statistics
        self.stats = {
            'total_processed': 0,
            'skipped_no_variants': 0,
            'skipped_no_available': 0,
            'skipped_no_price': 0,
            'skipped_below_min_price': 0,
            'uploaded': 0,
            'descriptions_found': 0,
            'descriptions_uploaded': 0,
            'html_descriptions': 0,
            'plain_text_descriptions': 0,
            'failed_descriptions': 0,
        }
    
    def _process_description(self, raw_description: Optional[str]) -> Tuple[Optional[str], str]:
        """Process product description with HTML preservation."""
        if not raw_description or not raw_description.strip():
            return None, 'none'
        
        self.stats['descriptions_found'] += 1
        
        try:
            # Clean whitespace
            description = raw_description.strip()
            
            if self.preserve_html:
                # Sanitize HTML
                sanitized_html = self.html_sanitizer.sanitize(description)
                
                if sanitized_html and len(sanitized_html) > 10:  # Minimum length
                    # Check if it's actually HTML (contains tags)
                    if re.search(r'<[^>]+>', sanitized_html):
                        self.stats['html_descriptions'] += 1
                        self.stats['descriptions_uploaded'] += 1
                        return sanitized_html, 'html'
                    else:
                        # It's plain text that went through HTML sanitizer
                        self.stats['plain_text_descriptions'] += 1
                        self.stats['descriptions_uploaded'] += 1
                        return sanitized_html, 'plain'
            
            # Fallback to plain text
            text = self.html_sanitizer._html_to_plain_text(description)
            if text:
                self.stats['plain_text_descriptions'] += 1
                self.stats['descriptions_uploaded'] += 1
                return text, 'plain'
            else:
                self.stats['failed_descriptions'] += 1
                return None, 'none'
                
        except Exception as e:
            uploader_logger.warning(f"Error processing description: {e}")
            self.stats['failed_descriptions'] += 1
            return None, 'none'
        
    def should_skip_product(self, variants: List[Dict[str, Any]], min_price: Optional[float]) -> Tuple[bool, str]:
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
    
    def _extract_variant_data(self, variant: Dict[str, Any]) -> Dict[str, Any]:
        """Extract and clean variant data."""
        variant_id = str(variant.get("id", ""))
        price = self.processor.clean_numeric(variant.get("price"))
        compare_price = self.processor.clean_numeric(variant.get("compare_at_price"))
        available = self.processor.clean_boolean(variant.get("available"))
        
        return {
            "id": variant_id,
            "title": variant.get("title", ""),
            "price": price,
            "available": available,
            "compare_at_price": compare_price,

        }
    
    def _extract_image_data(self, image: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract and clean image data."""
        src = image.get('src')
        if not src:
            return None
        
        width = image.get('width')
        height = image.get('height')
        
        # If no dimensions in data, try to extract from URL
        if not width or not height:
            match = re.search(r'_(\d+)x(\d+)\.', src)
            if match:
                width = int(match.group(1))
                height = int(match.group(2))
        
        return {
            'id': image.get('id'),
            'src': src,
            'alt': image.get('alt', ''),
            'position': image.get('position', 0),
            'width': width,
            'height': height,
        }
    
    def process_product(self, product: Dict[str, Any]) -> Optional[str]:
        """Process a single product and its related data with enhanced gender detection."""
        if not isinstance(product, dict):
            uploader_logger.error(f"Expected dictionary but got {type(product).__name__}")
            return None
        
        try:
            product_id = str(product.get("id", ""))
            if not product_id:
                return None
            
            # Process variants first for filtering
            variants = product.get("variants", [])
            variant_prices = []
            variant_available = []
            variant_discounts = []
            variant_data = []
            
            for variant in variants:
                variant_entry = self._extract_variant_data(variant)
                if variant_entry:
                    variant_data.append(variant_entry)
                    
                    # Collect for aggregation
                    if variant_entry["price"] is not None:
                        variant_prices.append(float(variant_entry["price"]))
                    
                    if variant_entry["available"]:
                        variant_available.append(True)
                    
                    # Calculate discount
                    price = variant_entry["price"]
                    compare_price = variant_entry["compare_at_price"]
                    if (price is not None and compare_price is not None and 
                        compare_price > 0 and price < compare_price):
                        discount = ((float(compare_price) - float(price)) / float(compare_price)) * 100
                        variant_discounts.append(discount)
            
            # Calculate aggregated values
            min_price = min(variant_prices) if variant_prices else None
            
            # Apply filters
            skip, reason = self.should_skip_product(variants, min_price)
            if skip:
                uploader_logger.debug(f"Skipping product {product_id}: {reason}")
                return None
            
            # Product passed filters - continue processing
            in_stock = any(variant_available) if variant_available else False
            max_discount = max(variant_discounts) if variant_discounts else None
            on_sale = max_discount is not None and max_discount > 0
            
            # Process tags FIRST (needed for gender detection)
            raw_tags = product.get("tags", [])
            if isinstance(raw_tags, str):
                tags_list = [tag.strip() for tag in raw_tags.split(",") if tag.strip()] if raw_tags else []
            elif isinstance(raw_tags, list):
                tags_list = [str(tag).strip() for tag in raw_tags if tag]
            else:
                tags_list = []
            
            # Extract category information WITH TAGS for better gender detection
            product_type = product.get("product_type", "")
            title = product.get("title", "")
            description = product.get("description", "")
            vendor = product.get("vendor", "")
            
            # Check if the categorizer has the enhanced method
            if hasattr(self.categorizer, 'get_category_info') and callable(self.categorizer.get_category_info):
                try:
                    # Try to call with improved context
                    category_info = self.categorizer.get_category_info(
                        product_type=product_type,
                        tags=tags_list,
                        title=title,
                        description=description,
                        vendor=vendor
                    )
                    
                    # Log gender detection for debugging
                    uploader_logger.debug(
                        f"Gender detection for product {product_id}: "
                        f"type='{product_type}', "
                        f"primary_gender='{category_info.get('gender_age', 'Unknown')}', "
                        f"all_genders={category_info.get('gender_categories', [])}, "
                        f"is_unisex={category_info.get('is_unisex', False)}"
                    )
                except TypeError:
                    # Fallback to old method if new signature not supported (though we verified it is)
                    category_info = self.categorizer.get_category_info(product_type)
                    # Add default gender categories for backward compatibility
                    primary_gender = category_info.get('gender_age', 'Unisex')
                    gender_categories = [primary_gender]
                    if primary_gender == 'Unisex':
                        gender_categories = ['Unisex', 'Men', 'Women']
                    category_info.update({
                        'gender_categories': gender_categories,
                        'is_unisex': primary_gender == 'Unisex'
                    })
            else:
                # Fallback if categorizer doesn't have expected method
                uploader_logger.warning(f"Categorizer doesn't have get_category_info method")
                category_info = {
                    'grouped_product_type': '',
                    'top_level_category': '',
                    'subcategory': None,
                    'gender_age': 'Unisex',
                    'gender_categories': ['Unisex', 'Men', 'Women'],
                    'is_unisex': True
                }
            
            # Process images
            images = product.get("images", [])
            image_data = []
            for img in images:
                img_data = self._extract_image_data(img)
                if img_data:
                    image_data.append(img_data)
            
            # Process description WITH HTML PRESERVATION
            raw_description = product.get("description", "")
            processed_description, description_format = self._process_description(raw_description)
            
            # Ensure we have some description text
            if not processed_description and raw_description:
                # Fallback to plain text if HTML processing failed
                processed_description = self.html_sanitizer._html_to_plain_text(raw_description)
                description_format = 'plain'
                uploader_logger.debug(f"Using plain text fallback for description of product {product_id}")
            
            # Get product URL
            url = product.get("product_url", "")
            if not url and product.get("handle"):
                url = f"https://{product.get('shop_domain', 'store')}.myshopify.com/products/{product['handle']}"
            
            # Build product data with gender categories
            product_data = {
                # Core product info
                "id": product_id,
                "title": product.get("title", ""),
                "handle": product.get("handle", ""),
                "vendor": product.get("vendor", ""),
                "product_type": product_type,
                
                # Description (HTML or plain text)
                "description": processed_description,
                "description_format": description_format,
                
                # Category information with enhanced gender support
                "grouped_product_type": category_info.get('grouped_product_type', ''),
                "top_level_category": category_info.get('top_level_category', ''),
                "subcategory": category_info.get('subcategory'),
                "gender_age": category_info.get('gender_age', 'Unisex'),
                
                # NEW: Gender categories for filtering
                "gender_categories": category_info.get('gender_categories', []),
                "is_unisex": category_info.get('is_unisex', False),
                
                # Tags and metadata
                "tags": tags_list,
                "url": url,
                "shop_id": product.get("shop_id", ""),
                "shop_domain": product.get("shop_domain", ""),
                "shop_name": product.get("shop_name", ""),
                
                # Aggregated data
                "min_price": min_price,
                "in_stock": in_stock,
                "max_discount_percentage": max_discount,
                "on_sale": on_sale,
                
                # JSON aggregated data
                "variants": json.dumps(variant_data) if variant_data else None,
                "images": json.dumps(image_data) if image_data else None,
                
                # Dates
                "created_at": product.get("created_at"),
                "updated_at": product.get("updated_at"),
                "updated_at_external": product.get("updated_at"),
                "published_at_external": product.get("published_at"),
                "last_modified": product.get("updated_at") or datetime.now().isoformat(),
            }
            
            self.collections['products'].append(product_data)
            self.stats['uploaded'] += 1
            
            # Store individual variants
            for variant_entry in variant_data:
                variant_db_entry = {
                    "id": variant_entry["id"],
                    "product_id": product_id,
                    "title": variant_entry["title"],
                    "available": variant_entry["available"],
                    "price": variant_entry["price"],
                    "compare_at_price": variant_entry["compare_at_price"],
                }
                self.collections['variants'].append(variant_db_entry)
            
            # Store images
            for img_entry in image_data:
                image_db_entry = {
                    'id': img_entry['id'],
                    'product_id': product_id,
                    'src': img_entry['src'],
                    'alt': img_entry['alt'],
                    'position': img_entry['position'],
                    'width': img_entry['width'],
                    'height': img_entry['height'],
                }
                self.collections['images'].append(image_db_entry)
            
            return product_id
            
        except Exception as e:
            uploader_logger.error(f"Error processing product {product.get('id', 'unknown')}: {e}")
            import traceback
            uploader_logger.error(traceback.format_exc())
            return None
    
    def get_stats(self) -> Dict[str, Any]:
        """Get detailed statistics about processed products."""
        stats = {
            'filter_stats': self.stats.copy(),
            'collection_counts': {name: len(items) for name, items in self.collections.items()},
            'description_stats': {
                'total_found': self.stats['descriptions_found'],
                'html_descriptions': self.stats['html_descriptions'],
                'plain_text_descriptions': self.stats['plain_text_descriptions'],
                'failed_descriptions': self.stats['failed_descriptions'],
            }
        }
        
        # Calculate percentages
        total = self.stats['total_processed']
        if total > 0:
            stats['filter_stats']['uploaded_percentage'] = int(round((self.stats['uploaded'] / total) * 100, 0))
            stats['filter_stats']['skipped_percentage'] = int(round(((total - self.stats['uploaded']) / total) * 100, 0))
        
        uploaded = self.stats['uploaded']
        if uploaded > 0:
            # Description percentage
            desc_percentage = int(round((self.stats['descriptions_uploaded'] / uploaded) * 100, 0))
            stats['filter_stats']['description_percentage'] = desc_percentage
            
            # HTML description percentage
            if self.stats['descriptions_uploaded'] > 0:
                html_percentage = int(round((self.stats['html_descriptions'] / self.stats['descriptions_uploaded']) * 100, 0))
                stats['description_stats']['html_percentage'] = html_percentage
        
        return stats
    
    def reset_collections(self):
        """Reset collections and statistics."""
        self.collections = {
            'products': [],
            'variants': [],
            'images': [],
        }
        self.reset_stats()
    
    def reset_stats(self):
        """Reset statistics."""
        self.stats = {
            'total_processed': 0,
            'skipped_no_variants': 0,
            'skipped_no_available': 0,
            'skipped_no_price': 0,
            'skipped_below_min_price': 0,
            'uploaded': 0,
            'descriptions_found': 0,
            'descriptions_uploaded': 0,
            'html_descriptions': 0,
            'plain_text_descriptions': 0,
            'failed_descriptions': 0,
        }
    
    def reload_categorization_config(self):
        """Reload the categorization configuration."""
        self.categorizer.reload_config()
        uploader_logger.info("🔄 Product categorization config reloaded")


class ProductUploader(BaseUploader):
    """Main product uploader with HTML description support and timeout handling."""
    
    def __init__(
        self, 
        filter_available_only: bool = True, 
        min_price_threshold: float = 0,
        preserve_html: bool = True,
        batch_size: int = 100,
        timeout_retry_config: Optional[Dict[str, Any]] = None
    ):
        super().__init__('products')
        self.filter_available_only = filter_available_only
        self.min_price_threshold = min_price_threshold
        self.preserve_html = preserve_html
        self.batch_size = batch_size
        
        # Configure timeout handling with aggressive settings for deletes
        self.timeout_retry_config = timeout_retry_config or {
            'max_retries': 5,  # Increased retries
            'initial_delay': 1.0,  # Start with 1 second
            'backoff_factor': 2.0,
            'max_delay': 60.0,  # Longer max delay
            'batch_size_reduction_factor': 0.3,  # More aggressive reduction
            'min_batch_size': 5,  # Smaller minimum
            'delete_batch_size': 10,  # Even smaller for deletes
        }
        
        self.product_processor = ProductProcessor(
            filter_available_only=filter_available_only,
            min_price_threshold=min_price_threshold,
            preserve_html=preserve_html
        )
        
        uploader_logger.info(
            f"ProductUploader initialized: "
            f"filter_available_only={filter_available_only}, "
            f"min_price_threshold={min_price_threshold}, "
            f"preserve_html={preserve_html}, "
            f"timeout_retries={self.timeout_retry_config['max_retries']}"
        )
    
    def get_table_name(self) -> str:
        return "products_with_details_core"
    
    def transform_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform raw product data."""
        return []
    
    
    def _get_shop_names_mapping(self, shop_ids: set) -> Dict[str, str]:
        """Get shop names for a set of shop IDs."""
        shop_id_to_name = {}
        
        if not shop_ids:
            return shop_id_to_name
        
        try:
            shop_ids_list = list(shop_ids)
            
            # Query shops table with smaller batches
            all_shops = []
            batch_size = 50
            
            for i in range(0, len(shop_ids_list), batch_size):
                batch = shop_ids_list[i:i + batch_size]
                batch_num = i // batch_size + 1
                total_batches = (len(shop_ids_list) - 1) // batch_size + 1
                
                def get_shops_batch(conn):
                    with conn.cursor() as cur:
                         # Using ANY(%s) for array check
                         cur.execute('SELECT "id", "shop_name" FROM "shops" WHERE "id" = ANY(%s)', (batch,))
                         return cur.fetchall()
                
                shops_batch = self.db.safe_execute(
                    get_shops_batch,
                    f"Get shop names batch {batch_num}/{total_batches}",
                    max_retries=2
                )
                
                if shops_batch:
                    all_shops.extend(shops_batch)
            
            if all_shops:
                for shop in all_shops:
                    shop_id_to_name[str(shop['id'])] = shop['shop_name']
            
            uploader_logger.debug(f"Found {len(shop_id_to_name)} shop names")
            
        except Exception as e:
            uploader_logger.error(f"Error fetching shop names: {e}")
        
        return shop_id_to_name
    
    def _is_timeout_error(self, error: Exception) -> bool:
        """Check if error is a timeout error."""
        error_msg = str(error).lower()
        return any(timeout_indicator in error_msg for timeout_indicator in 
                  ['timeout', '57014', 'statement timeout', 'canceling statement', 'operationalerror'])
    
    def _handle_timeout_retry(self, operation_type: str, operation_name: str,
                             attempt: int = 1, batch_size: Optional[int] = None) -> bool:
        """
        Handle timeout retry logic with exponential backoff.
        """
        config = self.timeout_retry_config
        max_retries = config['max_retries']
        
        if attempt > max_retries:
            self.logger.error(f"Max retries ({max_retries}) exceeded for {operation_name}")
            return False
        
        # Calculate exponential backoff delay
        delay = min(
            config['initial_delay'] * (config['backoff_factor'] ** (attempt - 1)),
            config['max_delay']
        )
        
        self.logger.warning(
            f"Timeout attempt {attempt}/{max_retries} for {operation_name}. "
            f"Waiting {delay:.1f}s before retry..."
        )
        
        time.sleep(delay)
        return True  # Continue retry
    
    def _safe_bulk_upsert(self, data: List[Dict[str, Any]], table_name: str, 
                         on_conflict: str = "id") -> bool:
        """
        Safe bulk upsert with timeout retry handling and correct batch numbering.
        """
        if not data:
            return True
        
        config = self.timeout_retry_config
        
        # Start with small batch sizes
        initial_batch_size = min(50, len(data))  # Start small
        total_batches = (len(data) - 1) // initial_batch_size + 1
        
        self.logger.info(f"Uploading {len(data)} records to {table_name} in {total_batches} batches")
        
        all_success = True
        
        for i in range(0, len(data), initial_batch_size):
            batch = data[i:i + initial_batch_size]
            batch_num = i // initial_batch_size + 1
            batch_name = f"batch {batch_num}/{total_batches} to {table_name}"
            
            # Only log progress for large operations
            if total_batches > 10 and batch_num % 10 == 0:
                self.logger.info(f"Processing {batch_name} ({len(batch)} records)")
            
            success = self._execute_upsert_with_retry(batch, table_name, on_conflict, batch_name)
            if not success:
                all_success = False
                # Try individual inserts as last resort
                if len(batch) > 1:
                    self.logger.info(f"Trying individual inserts for failed batch {batch_num}/{total_batches}...")
                    individual_success = True
                    for idx, record in enumerate(batch, 1):
                        record_name = f"individual record {idx}/{len(batch)} to {table_name}"
                        record_success = self._execute_upsert_with_retry(
                            [record], table_name, on_conflict, record_name
                        )
                        if not record_success:
                            individual_success = False
                    
                    if individual_success:
                        self.logger.info(f"Individual inserts succeeded for batch {batch_num}/{total_batches}")
                    else:
                        self.logger.error(f"Individual inserts also failed for batch {batch_num}/{total_batches}")
        
        return all_success
    
    def _execute_upsert_with_retry(self, data: List[Dict[str, Any]], table_name: str,
                                  on_conflict: str, operation_name: str) -> bool:
        """Execute upsert with retry logic."""
        config = self.timeout_retry_config
        max_retries = config['max_retries']
        
        for attempt in range(1, max_retries + 1):
            try:
                success = self.db.bulk_upsert(
                    table_name=table_name,
                    data=data,
                    on_conflict=on_conflict,
                    retries=1 # DB client has its own retries, we handle outer timeout retries here
                )
                if success and attempt == 1:
                    self.logger.debug(f"✅ {operation_name} succeeded")
                elif success:
                    self.logger.debug(f"✅ {operation_name} succeeded on retry {attempt}")
                return success
            except Exception as e:
                if self._is_timeout_error(e):
                    self.logger.warning(f"Timeout on {operation_name} (attempt {attempt}): {e}")
                    if attempt < max_retries:
                        # Wait and retry with same data
                        time.sleep(config['initial_delay'] * (config['backoff_factor'] ** (attempt - 1)))
                    else:
                        self.logger.error(f"Max retries exceeded for {operation_name}")
                        return False
                else:
                    self.logger.error(f"Non-timeout error on {operation_name}: {e}")
                    return False
        
        return False
    
    def _safe_bulk_delete(self, table_name: str, ids: List[str]) -> bool:
        """
        Safe bulk delete with ultra-small batch sizes and aggressive retry.
        """
        if not ids:
            return True
        
        config = self.timeout_retry_config
        delete_batch_size = config.get('delete_batch_size', 5)  # Very small batches
        total_batches = (len(ids) - 1) // delete_batch_size + 1
        
        self.logger.info(f"Deleting {len(ids)} records from {table_name} in {total_batches} batches")
        
        all_success = True
        
        for i in range(0, len(ids), delete_batch_size):
            batch = ids[i:i + delete_batch_size]
            batch_num = i // delete_batch_size + 1
            
            # Only log progress for large operations
            if total_batches > 10 and batch_num % 10 == 0:
                self.logger.info(f"Deleting batch {batch_num}/{total_batches} ({len(batch)} records)")
            
            success = self._execute_delete_with_retry(table_name, batch, batch_num, total_batches)
            if not success:
                all_success = False
                
                # Try individual deletes
                self.logger.info(f"Trying individual deletes for batch {batch_num}/{total_batches}...")
                individual_success = True
                for idx, record_id in enumerate(batch, 1):
                    if not self._execute_single_delete(table_name, record_id):
                        individual_success = False
                        self.logger.warning(f"Failed to delete individual record {idx}/{len(batch)}")
                
                if individual_success:
                    self.logger.info(f"Individual deletes succeeded for batch {batch_num}/{total_batches}")
                else:
                    self.logger.error(f"Individual deletes also failed for batch {batch_num}/{total_batches}")
            
            # Small delay between batches to prevent overwhelming the database
            if i + delete_batch_size < len(ids):
                time.sleep(0.1)
        
        return all_success
    
    def _execute_delete_with_retry(self, table_name: str, ids: List[str], 
                                  batch_num: int, total_batches: int) -> bool:
        """Execute delete with retry logic and correct batch numbering."""
        config = self.timeout_retry_config
        max_retries = config['max_retries']
        operation_name = f"batch {batch_num}/{total_batches} delete from {table_name} ({len(ids)} records)"
        
        for attempt in range(1, max_retries + 1):
            try:
                success = self.db.bulk_delete(table_name, ids)
                if success:
                    self.logger.debug(f"✅ {operation_name} succeeded")
                    return True
                else:
                    self.logger.warning(f"⚠️ {operation_name} failed (not a timeout)")
                    return False
            except Exception as e:
                if self._is_timeout_error(e):
                    self.logger.warning(f"Timeout on {operation_name} (attempt {attempt}): {e}")
                    if attempt < max_retries:
                        # Exponential backoff
                        delay = min(
                            config['initial_delay'] * (config['backoff_factor'] ** (attempt - 1)),
                            config['max_delay']
                        )
                        time.sleep(delay)
                    else:
                        self.logger.error(f"Max retries exceeded for {operation_name}")
                        return False
                else:
                    self.logger.error(f"Non-timeout error on {operation_name}: {e}")
                    return False
        
        return False
    
    def _execute_single_delete(self, table_name: str, record_id: str) -> bool:
        """Execute a single record delete with retry."""
        config = self.timeout_retry_config
        max_retries = 3
        
        for attempt in range(1, max_retries + 1):
            try:
                # Use direct query for single delete
                def do_delete(conn):
                    with conn.cursor() as cur:
                        cur.execute(f'DELETE FROM "{table_name}" WHERE "id" = %s', (record_id,))
                        return True
                        
                result = self.db.safe_execute(do_delete, f"Single delete {record_id}")
                return bool(result)

            except Exception as e:
                if self._is_timeout_error(e):
                    if attempt < max_retries:
                        time.sleep(1)
                    else:
                        self.logger.debug(f"Max retries exceeded for single delete of {record_id}")
                        return False
                else:
                    self.logger.debug(f"Error deleting {record_id}: {e}")
                    return False
        
        return False
    
    def _safe_execute_query(self, query_func, description: str, max_retries: int = 3) -> Any:
        """Execute a query with timeout retry handling."""
        for attempt in range(1, max_retries + 1):
            try:
                return self.db.safe_execute(query_func, description, max_retries=1)
            except Exception as e:
                if self._is_timeout_error(e) and attempt < max_retries:
                    delay = min(2.0 * (attempt - 1), 10.0)
                    self.logger.warning(f"Query timeout ({description}), retry {attempt}/{max_retries} in {delay}s...")
                    time.sleep(delay)
                else:
                    self.logger.error(f"Error during {description}: {e}")
                    return None
        
        return None
    
    def process_file(self, filepath: Path) -> bool:
        """Process a single product file with filtering and HTML support."""
        self.logger.info(f"📦 Processing product file: {filepath.name}")
        
        try:
            # Load JSON data
            with open(filepath, 'r', encoding='utf-8') as f:
                products = json.load(f)
            
            self.logger.info(f"Found {len(products)} products in file")
            
            # Reset processor for this file
            self.product_processor.reset_collections()
            
            # Collect all shop IDs first
            all_shop_ids = set()
            for product in products:
                if shop_id := product.get('shop_id'):
                    all_shop_ids.add(str(shop_id))
            
            # Get shop names for all shops in this file
            shop_id_to_name = self._get_shop_names_mapping(all_shop_ids)
            
            product_ids = []
            
            # Process each product with filtering
            for idx, product in enumerate(products, 1):
                if idx % 100 == 0:
                    self.logger.debug(f"Processed {idx}/{len(products)} products")
                
                raw_shop_id = product.get('shop_id')
                
                # Validate shop_id
                if raw_shop_id is None:
                    self.logger.warning(f"No shop_id found for product {product.get('id')}")
                    continue
                
                try:
                    shop_id = int(raw_shop_id)
                except (ValueError, TypeError):
                    self.logger.warning(f"Invalid shop_id format: {raw_shop_id}")
                    continue
                
                # Add shop name to product data
                product["shop_id"] = shop_id
                shop_id_str = str(shop_id)
                if shop_id_str in shop_id_to_name:
                    product["shop_name"] = shop_id_to_name[shop_id_str]
                else:
                    product["shop_name"] = None
                
                # Process product with filters
                product_id = self.product_processor.process_product(product)
                if product_id:
                    product_ids.append(product_id)
            
            # Log statistics
            stats = self.product_processor.get_stats()
            filter_stats = stats['filter_stats']
            desc_stats = stats['description_stats']
            total = filter_stats['total_processed']
            uploaded = filter_stats['uploaded']
            
            self.logger.info(f"📊 Filter stats for {filepath.name}:")
            self.logger.info(f"  • Total processed: {total}")
            self.logger.info(f"  • Uploaded: {uploaded} ({filter_stats.get('uploaded_percentage', 0)}%)")
            self.logger.info(f"  • Skipped: {total - uploaded} ({filter_stats.get('skipped_percentage', 0)}%)")
            
            # Description statistics
            self.logger.info(f"📝 Description stats:")
            self.logger.info(f"  • Found: {desc_stats['total_found']}")
            self.logger.info(f"  • HTML: {desc_stats['html_descriptions']}")
            self.logger.info(f"  • Plain text: {desc_stats['plain_text_descriptions']}")
            
            # Upload if we have products
            if uploaded > 0:
                # Upload products
                products_data = self.product_processor.collections["products"]
                
                self.logger.info(f"🚀 Uploading {uploaded} products to database...")
                
                success = self._safe_bulk_upsert(
                    data=products_data,
                    table_name="products_with_details_core",
                    on_conflict="id"
                )
                
                if success:
                    self.logger.info(f"✅ Successfully uploaded {uploaded} products")
                    
                    # Upload variants
                    variants = self.product_processor.collections.get("variants", [])
                    if variants:
                        self.logger.info(f"📋 Uploading {len(variants)} variants...")
                        variants_success = self._safe_bulk_upsert(
                            data=variants,
                            table_name="variants",
                            on_conflict="id"
                        )
                        if variants_success:
                            self.logger.info(f"✅ Uploaded {len(variants)} variants")
                        else:
                            self.logger.error("❌ Failed to upload variants")
                    
                    # Upload images
                    images = self.product_processor.collections.get("images", [])
                    if images:
                        self.logger.info(f"🖼️  Uploading {len(images)} images...")
                        images_success = self._safe_bulk_upsert(
                            data=images,
                            table_name="images",
                            on_conflict="id"
                        )
                        if images_success:
                            self.logger.info(f"✅ Uploaded {len(images)} images")
                        else:
                            self.logger.error("❌ Failed to upload images")
                    
                    # Clean up stale records for shops in this file
                    if product_ids:
                        shop_ids = {p["shop_id"] for p in self.product_processor.collections["products"]}
                        for shop_id in shop_ids:
                            # Skip cleanup if we're having timeout issues
                            if len(product_ids) > 1000:  # Skip cleanup for large datasets
                                self.logger.warning(f"Skipping cleanup for shop {shop_id} due to large dataset")
                            else:
                                self.cleanup_stale_records(product_ids, str(shop_id))
                    
                    # Move file to processed
                    try:
                        self.file_manager.move_to_processed(filepath)
                    except Exception as e:
                        self.logger.warning(f"Could not move file to processed: {e}")
                        try:
                            processed_dir = self.file_manager.data_dirs['processed'] / 'products'
                            processed_dir.mkdir(parents=True, exist_ok=True)
                            filepath.rename(processed_dir / filepath.name)
                        except Exception as e2:
                            self.logger.error(f"Failed to move file: {e2}")
                    
                    self.logger.info(f"🎉 Successfully processed {filepath.name}")
                    return True
                else:
                    self.logger.error(f"❌ Failed to upload products from {filepath.name}")
                    # Move file to failed directory
                    try:
                        failed_dir = self.file_manager.data_dirs['failed'] / 'products'
                        failed_dir.mkdir(parents=True, exist_ok=True)
                        filepath.rename(failed_dir / filepath.name)
                    except Exception as e:
                        self.logger.error(f"Failed to move file to failed: {e}")
                    return False
            else:
                self.logger.warning(f"⚠️  No products passed filters in {filepath.name}")
                # Move to processed since we processed it
                try:
                    self.file_manager.move_to_processed(filepath)
                except Exception as e:
                    self.logger.warning(f"Could not move file: {e}")
                return True
                
        except json.JSONDecodeError as e:
            self.logger.error(f"❌ JSON decode error in {filepath.name}: {e}")
            try:
                failed_dir = self.file_manager.data_dirs['failed'] / 'products'
                failed_dir.mkdir(parents=True, exist_ok=True)
                filepath.rename(failed_dir / filepath.name)
            except Exception as e2:
                self.logger.error(f"Failed to move file to failed: {e2}")
            return False
        except Exception as e:
            self.logger.error(f"❌ Error processing {filepath.name}: {e}")
            import traceback
            self.logger.error(traceback.format_exc())
            try:
                failed_dir = self.file_manager.data_dirs['failed'] / 'products'
                failed_dir.mkdir(parents=True, exist_ok=True)
                filepath.rename(failed_dir / filepath.name)
            except Exception as e2:
                self.logger.error(f"Failed to move file to failed: {e2}")
            return False
    
    def cleanup_stale_records(self, current_ids: List[str], shop_id: Optional[str] = None) -> bool:
        """
        Remove products from database that are no longer in the current data.
        """
        try:
            if not current_ids:
                return True
            
            self.logger.debug(f"Starting cleanup for shop {shop_id}...")
            
            # Get all product IDs for this shop from database
            def get_existing_products(conn):
                with conn.cursor() as cur:
                    sql = 'SELECT "id" FROM "products_with_details_core"'
                    params = []
                    if shop_id:
                        sql += ' WHERE "shop_id" = %s'
                        params.append(shop_id)
                    sql += ' LIMIT 10000'
                    cur.execute(sql, params)
                    return cur.fetchall()
            
            result = self._safe_execute_query(
                get_existing_products,
                f"Get existing product IDs for shop {shop_id}",
                max_retries=2
            )
            
            if result is None:
                self.logger.warning(f"Could not fetch existing products for shop {shop_id}")
                return True
            
            # Normalize IDs
            existing_ids = {str(item.get('id')).strip() for item in result if item.get('id') is not None}
            current_ids_str = {str(cid).strip() for cid in current_ids}
            to_delete = list(existing_ids - current_ids_str)
            
            if not to_delete:
                self.logger.info(f"No stale products to delete for shop {shop_id}")
                return True
            
            if len(to_delete) > 1000:
                self.logger.warning(
                    f"Large number of records to delete ({len(to_delete)}). "
                    f"Consider manual cleanup for shop {shop_id}"
                )
                # Process in smaller chunks
                for i in range(0, len(to_delete), 500):
                    chunk = to_delete[i:i + 500]
                    chunk_num = i // 500 + 1
                    total_chunks = (len(to_delete) - 1) // 500 + 1
                    self.logger.info(f"Deleting chunk {chunk_num}/{total_chunks} ({len(chunk)} records)")
                    self._safe_bulk_delete("products_with_details_core", chunk)
                return True
            
            self.logger.info(f"🗑️  Removing {len(to_delete)} stale products for shop {shop_id}")
            
            # Delete stale records using safe delete
            success = self._safe_bulk_delete("products_with_details_core", to_delete)
            
            if success:
                self.logger.info(f"✅ Removed {len(to_delete)} stale products")
            else:
                self.logger.warning(f"⚠️  Failed to remove some stale products")
            
            return True
                
        except Exception as e:
            self.logger.error(f"Error in cleanup_stale_records: {e}")
            return False
    
    def _is_timeout_error(self, error: Exception) -> bool:
        """Check if error is a timeout error."""
        error_msg = str(error).lower()
        return any(timeout_indicator in error_msg for timeout_indicator in 
                  ['timeout', '57014', 'statement timeout', 'canceling statement'])
    
    def _handle_timeout_retry(self, operation_type: str, operation_name: str,
                             attempt: int = 1, batch_size: Optional[int] = None) -> bool:
        """
        Handle timeout retry logic with exponential backoff.
        """
        config = self.timeout_retry_config
        max_retries = config['max_retries']
        
        if attempt > max_retries:
            self.logger.error(f"Max retries ({max_retries}) exceeded for {operation_name}")
            return False
        
        # Calculate exponential backoff delay
        delay = min(
            config['initial_delay'] * (config['backoff_factor'] ** (attempt - 1)),
            config['max_delay']
        )
        
        self.logger.warning(
            f"Timeout attempt {attempt}/{max_retries} for {operation_name}. "
            f"Waiting {delay:.1f}s before retry..."
        )
        
        time.sleep(delay)
        return True  # Continue retry
    
    def _safe_bulk_upsert(self, data: List[Dict[str, Any]], table_name: str, 
                         on_conflict: str = "id") -> bool:
        """
        Safe bulk upsert with timeout retry handling and correct batch numbering.
        """
        if not data:
            return True
        
        config = self.timeout_retry_config
        
        # Start with small batch sizes
        initial_batch_size = min(50, len(data))  # Start small
        total_batches = (len(data) - 1) // initial_batch_size + 1
        
        self.logger.info(f"Uploading {len(data)} records to {table_name} in {total_batches} batches")
        
        all_success = True
        
        for i in range(0, len(data), initial_batch_size):
            batch = data[i:i + initial_batch_size]
            batch_num = i // initial_batch_size + 1
            batch_name = f"batch {batch_num}/{total_batches} to {table_name}"
            
            # Only log progress for large operations
            if total_batches > 10 and batch_num % 10 == 0:
                self.logger.info(f"Processing {batch_name} ({len(batch)} records)")
            
            success = self._execute_upsert_with_retry(batch, table_name, on_conflict, batch_name)
            if not success:
                all_success = False
                # Try individual inserts as last resort
                if len(batch) > 1:
                    self.logger.info(f"Trying individual inserts for failed batch {batch_num}/{total_batches}...")
                    individual_success = True
                    for idx, record in enumerate(batch, 1):
                        record_name = f"individual record {idx}/{len(batch)} to {table_name}"
                        record_success = self._execute_upsert_with_retry(
                            [record], table_name, on_conflict, record_name
                        )
                        if not record_success:
                            individual_success = False
                    
                    if individual_success:
                        self.logger.info(f"Individual inserts succeeded for batch {batch_num}/{total_batches}")
                    else:
                        self.logger.error(f"Individual inserts also failed for batch {batch_num}/{total_batches}")
        
        return all_success
    
    def _execute_upsert_with_retry(self, data: List[Dict[str, Any]], table_name: str,
                                  on_conflict: str, operation_name: str) -> bool:
        """Execute upsert with retry logic."""
        config = self.timeout_retry_config
        max_retries = config['max_retries']
        
        for attempt in range(1, max_retries + 1):
            try:
                success = self.db.bulk_upsert(
                    table_name=table_name,
                    data=data,
                    on_conflict=on_conflict,
                    retries=1 # DB client has its own retries, we handle outer timeout retries here
                )
                if success and attempt == 1:
                    self.logger.debug(f"✅ {operation_name} succeeded")
                elif success:
                    self.logger.debug(f"✅ {operation_name} succeeded on retry {attempt}")
                return success
            except Exception as e:
                if self._is_timeout_error(e):
                    self.logger.warning(f"Timeout on {operation_name} (attempt {attempt}): {e}")
                    if attempt < max_retries:
                        # Wait and retry with same data
                        time.sleep(config['initial_delay'] * (config['backoff_factor'] ** (attempt - 1)))
                    else:
                        self.logger.error(f"Max retries exceeded for {operation_name}")
                        return False
                else:
                    self.logger.error(f"Non-timeout error on {operation_name}: {e}")
                    return False
        
        return False
    
    def _safe_bulk_delete(self, table_name: str, ids: List[str]) -> bool:
        """
        Safe bulk delete with ultra-small batch sizes and aggressive retry.
        """
        if not ids:
            return True
        
        config = self.timeout_retry_config
        delete_batch_size = config.get('delete_batch_size', 5)  # Very small batches
        total_batches = (len(ids) - 1) // delete_batch_size + 1
        
        self.logger.info(f"Deleting {len(ids)} records from {table_name} in {total_batches} batches")
        
        all_success = True
        
        for i in range(0, len(ids), delete_batch_size):
            batch = ids[i:i + delete_batch_size]
            batch_num = i // delete_batch_size + 1
            
            # Only log progress for large operations
            if total_batches > 10 and batch_num % 10 == 0:
                self.logger.info(f"Deleting batch {batch_num}/{total_batches} ({len(batch)} records)")
            
            success = self._execute_delete_with_retry(table_name, batch, batch_num, total_batches)
            if not success:
                all_success = False
                
                # Try individual deletes
                self.logger.info(f"Trying individual deletes for batch {batch_num}/{total_batches}...")
                individual_success = True
                for idx, record_id in enumerate(batch, 1):
                    if not self._execute_single_delete(table_name, record_id):
                        individual_success = False
                        self.logger.warning(f"Failed to delete individual record {idx}/{len(batch)}")
                
                if individual_success:
                    self.logger.info(f"Individual deletes succeeded for batch {batch_num}/{total_batches}")
                else:
                    self.logger.error(f"Individual deletes also failed for batch {batch_num}/{total_batches}")
            
            # Small delay between batches to prevent overwhelming the database
            if i + delete_batch_size < len(ids):
                time.sleep(0.1)
        
        return all_success
    
    def _execute_delete_with_retry(self, table_name: str, ids: List[str], 
                                  batch_num: int, total_batches: int) -> bool:
        """Execute delete with retry logic and correct batch numbering."""
        config = self.timeout_retry_config
        max_retries = config['max_retries']
        operation_name = f"batch {batch_num}/{total_batches} delete from {table_name} ({len(ids)} records)"
        
        for attempt in range(1, max_retries + 1):
            try:
                success = self.db.bulk_delete(table_name, ids)
                if success:
                    self.logger.debug(f"✅ {operation_name} succeeded")
                    return True
                else:
                    self.logger.warning(f"⚠️ {operation_name} failed (not a timeout)")
                    return False
            except Exception as e:
                if self._is_timeout_error(e):
                    self.logger.warning(f"Timeout on {operation_name} (attempt {attempt}): {e}")
                    if attempt < max_retries:
                        # Exponential backoff
                        delay = min(
                            config['initial_delay'] * (config['backoff_factor'] ** (attempt - 1)),
                            config['max_delay']
                        )
                        time.sleep(delay)
                    else:
                        self.logger.error(f"Max retries exceeded for {operation_name}")
                        return False
                else:
                    self.logger.error(f"Non-timeout error on {operation_name}: {e}")
                    return False
        
        return False
    
    def _execute_single_delete(self, table_name: str, record_id: str) -> bool:
        """Execute a single record delete with retry."""
        config = self.timeout_retry_config
        max_retries = 3
        
        for attempt in range(1, max_retries + 1):
            try:
                # Use direct query for single delete
                def do_delete(conn):
                    with conn.cursor() as cur:
                        cur.execute(f'DELETE FROM "{table_name}" WHERE "id" = %s', (record_id,))
                        return True
                        
                result = self.db.safe_execute(do_delete, f"Single delete {record_id}")
                return bool(result)

            except Exception as e:
                if self._is_timeout_error(e):
                    if attempt < max_retries:
                        time.sleep(1)
                    else:
                        self.logger.debug(f"Max retries exceeded for single delete of {record_id}")
                        return False
                else:
                    self.logger.debug(f"Error deleting {record_id}: {e}")
                    return False
        
        return False
    
    def _safe_execute_query(self, query_func, description: str, max_retries: int = 3) -> Any:
        """Execute a query with timeout retry handling."""
        for attempt in range(1, max_retries + 1):
            try:
                return self.db.safe_execute(query_func, description, max_retries=1)
            except Exception as e:
                if self._is_timeout_error(e) and attempt < max_retries:
                    delay = min(2.0 * (attempt - 1), 10.0)
                    self.logger.warning(f"Query timeout ({description}), retry {attempt}/{max_retries} in {delay}s...")
                    time.sleep(delay)
                else:
                    self.logger.error(f"Error during {description}: {e}")
                    return None
        
        return None
    
    def process_file(self, filepath: Path) -> bool:
        """Process a single product file with filtering and HTML support."""
        self.logger.info(f"📦 Processing product file: {filepath.name}")
        
        try:
            # Load JSON data
            with open(filepath, 'r', encoding='utf-8') as f:
                products = json.load(f)
            
            self.logger.info(f"Found {len(products)} products in file")
            
            # Reset processor for this file
            self.product_processor.reset_collections()
            
            # Collect all shop IDs first
            all_shop_ids = set()
            for product in products:
                if shop_id := product.get('shop_id'):
                    all_shop_ids.add(str(shop_id))
            
            # Get shop names for all shops in this file
            shop_id_to_name = self._get_shop_names_mapping(all_shop_ids)
            
            product_ids = []
            
            # Process each product with filtering
            for idx, product in enumerate(products, 1):
                if idx % 100 == 0:
                    self.logger.debug(f"Processed {idx}/{len(products)} products")
                
                raw_shop_id = product.get('shop_id')
                
                # Validate shop_id
                if raw_shop_id is None:
                    self.logger.warning(f"No shop_id found for product {product.get('id')}")
                    continue
                
                try:
                    shop_id = int(raw_shop_id)
                except (ValueError, TypeError):
                    self.logger.warning(f"Invalid shop_id format: {raw_shop_id}")
                    continue
                
                # Add shop name to product data
                product["shop_id"] = shop_id
                shop_id_str = str(shop_id)
                if shop_id_str in shop_id_to_name:
                    product["shop_name"] = shop_id_to_name[shop_id_str]
                else:
                    product["shop_name"] = None
                
                # Process product with filters
                product_id = self.product_processor.process_product(product)
                if product_id:
                    product_ids.append(product_id)
            
            # Log statistics
            stats = self.product_processor.get_stats()
            filter_stats = stats['filter_stats']
            desc_stats = stats['description_stats']
            total = filter_stats['total_processed']
            uploaded = filter_stats['uploaded']
            
            self.logger.info(f"📊 Filter stats for {filepath.name}:")
            self.logger.info(f"  • Total processed: {total}")
            self.logger.info(f"  • Uploaded: {uploaded} ({filter_stats.get('uploaded_percentage', 0)}%)")
            self.logger.info(f"  • Skipped: {total - uploaded} ({filter_stats.get('skipped_percentage', 0)}%)")
            
            # Description statistics
            self.logger.info(f"📝 Description stats:")
            self.logger.info(f"  • Found: {desc_stats['total_found']}")
            self.logger.info(f"  • HTML: {desc_stats['html_descriptions']}")
            self.logger.info(f"  • Plain text: {desc_stats['plain_text_descriptions']}")
            
            # Upload if we have products
            if uploaded > 0:
                # Upload products
                products_data = self.product_processor.collections["products"]
                
                self.logger.info(f"🚀 Uploading {uploaded} products to database...")
                
                success = self._safe_bulk_upsert(
                    data=products_data,
                    table_name="products_with_details_core",
                    on_conflict="id"
                )
                
                if success:
                    self.logger.info(f"✅ Successfully uploaded {uploaded} products")
                    
                    # Upload variants
                    variants = self.product_processor.collections.get("variants", [])
                    if variants:
                        self.logger.info(f"📋 Uploading {len(variants)} variants...")
                        variants_success = self._safe_bulk_upsert(
                            data=variants,
                            table_name="variants",
                            on_conflict="id"
                        )
                        if variants_success:
                            self.logger.info(f"✅ Uploaded {len(variants)} variants")
                        else:
                            self.logger.error("❌ Failed to upload variants")
                    
                    # Upload images
                    images = self.product_processor.collections.get("images", [])
                    if images:
                        self.logger.info(f"🖼️  Uploading {len(images)} images...")
                        images_success = self._safe_bulk_upsert(
                            data=images,
                            table_name="images",
                            on_conflict="id"
                        )
                        if images_success:
                            self.logger.info(f"✅ Uploaded {len(images)} images")
                        else:
                            self.logger.error("❌ Failed to upload images")
                    
                    # Clean up stale records for shops in this file
                    if product_ids:
                        shop_ids = {p["shop_id"] for p in self.product_processor.collections["products"]}
                        for shop_id in shop_ids:
                            # Skip cleanup if we're having timeout issues
                            if len(product_ids) > 1000:  # Skip cleanup for large datasets
                                self.logger.warning(f"Skipping cleanup for shop {shop_id} due to large dataset")
                            else:
                                self.cleanup_stale_records(product_ids, str(shop_id))
                    
                    # Move file to processed
                    try:
                        self.file_manager.move_to_processed(filepath)
                    except Exception as e:
                        self.logger.warning(f"Could not move file to processed: {e}")
                        try:
                            processed_dir = self.file_manager.data_dirs['processed'] / 'products'
                            processed_dir.mkdir(parents=True, exist_ok=True)
                            filepath.rename(processed_dir / filepath.name)
                        except Exception as e2:
                            self.logger.error(f"Failed to move file: {e2}")
                    
                    self.logger.info(f"🎉 Successfully processed {filepath.name}")
                    return True
                else:
                    self.logger.error(f"❌ Failed to upload products from {filepath.name}")
                    # Move file to failed directory
                    try:
                        failed_dir = self.file_manager.data_dirs['failed'] / 'products'
                        failed_dir.mkdir(parents=True, exist_ok=True)
                        filepath.rename(failed_dir / filepath.name)
                    except Exception as e:
                        self.logger.error(f"Failed to move file to failed: {e}")
                    return False
            else:
                self.logger.warning(f"⚠️  No products passed filters in {filepath.name}")
                # Move to processed since we processed it
                try:
                    self.file_manager.move_to_processed(filepath)
                except Exception as e:
                    self.logger.warning(f"Could not move file: {e}")
                return True
                
        except json.JSONDecodeError as e:
            self.logger.error(f"❌ JSON decode error in {filepath.name}: {e}")
            try:
                failed_dir = self.file_manager.data_dirs['failed'] / 'products'
                failed_dir.mkdir(parents=True, exist_ok=True)
                filepath.rename(failed_dir / filepath.name)
            except Exception as e2:
                self.logger.error(f"Failed to move file to failed: {e2}")
            return False
        except Exception as e:
            self.logger.error(f"❌ Error processing {filepath.name}: {e}")
            import traceback
            self.logger.error(traceback.format_exc())
            try:
                failed_dir = self.file_manager.data_dirs['failed'] / 'products'
                failed_dir.mkdir(parents=True, exist_ok=True)
                filepath.rename(failed_dir / filepath.name)
            except Exception as e2:
                self.logger.error(f"Failed to move file to failed: {e2}")
            return False
    
    def cleanup_stale_records(self, current_ids: List[str], shop_id: Optional[str] = None) -> bool:
        """
        Remove products from database that are no longer in the current data.
        """
        try:
            if not current_ids:
                return True
            
            self.logger.debug(f"Starting cleanup for shop {shop_id}...")
            
            # Get all product IDs for this shop from database
            def get_existing_products(conn):
                with conn.cursor() as cur:
                    sql = 'SELECT "id" FROM "products_with_details_core"'
                    params = []
                    if shop_id:
                        sql += ' WHERE "shop_id" = %s'
                        params.append(shop_id)
                    sql += ' LIMIT 10000'
                    cur.execute(sql, params)
                    return cur.fetchall()
            
            result = self._safe_execute_query(
                get_existing_products,
                f"Get existing product IDs for shop {shop_id}",
                max_retries=2
            )
            
            if not result or not hasattr(result, 'data'):
                self.logger.warning(f"Could not fetch existing products for shop {shop_id}")
                return True
            
            # Normalize IDs
            existing_ids = {str(item.get('id')).strip() for item in result.data if item.get('id') is not None}
            current_ids_str = {str(cid).strip() for cid in current_ids}
            to_delete = list(existing_ids - current_ids_str)
            
            if not to_delete:
                self.logger.info(f"No stale products to delete for shop {shop_id}")
                return True
            
            if len(to_delete) > 1000:
                self.logger.warning(
                    f"Large number of records to delete ({len(to_delete)}). "
                    f"Consider manual cleanup for shop {shop_id}"
                )
                # Process in smaller chunks
                for i in range(0, len(to_delete), 500):
                    chunk = to_delete[i:i + 500]
                    chunk_num = i // 500 + 1
                    total_chunks = (len(to_delete) - 1) // 500 + 1
                    self.logger.info(f"Deleting chunk {chunk_num}/{total_chunks} ({len(chunk)} records)")
                    self._safe_bulk_delete("products_with_details_core", chunk)
                return True
            
            self.logger.info(f"🗑️  Removing {len(to_delete)} stale products for shop {shop_id}")
            
            # Delete stale records using safe delete
            success = self._safe_bulk_delete("products_with_details_core", to_delete)
            
            if success:
                self.logger.info(f"✅ Removed {len(to_delete)} stale products")
            else:
                self.logger.warning(f"⚠️  Failed to remove some stale products")
            
            return True
                
        except Exception as e:
            self.logger.error(f"Error in cleanup_stale_records: {e}")
            return False
    
    def process_all(self) -> Dict[str, Any]:
        """Process all product files with comprehensive reporting."""
        files = self.find_data_files()
        results = {
            'processed_files': 0,
            'failed_files': 0,
            'total_files': len(files),
            'total_products_processed': 0,
            'total_products_uploaded': 0,
            'shop_ids': set(),
            'filter_stats': {
                'total_processed': 0,
                'uploaded': 0,
                'skipped': 0,
            },
            'description_stats': {
                'html_descriptions': 0,
                'plain_text_descriptions': 0,
                'total_with_descriptions': 0,
            }
        }
        
        if not files:
            self.logger.warning("⚠️  No product files found")
            return results
        
        self.logger.info(
            f"🔍 Found {len(files)} product files "
            f"(filtering: {'ON' if self.filter_available_only else 'OFF'}, "
            f"min price: ${self.min_price_threshold:.2f}, "
            f"HTML: {'PRESERVED' if self.preserve_html else 'STRIPPED'})"
        )
        
        for file_idx, filepath in enumerate(files, 1):
            self.logger.info(f"\n{'='*60}")
            self.logger.info(f"Processing file {file_idx}/{len(files)}: {filepath.name}")
            self.logger.info(f"{'='*60}")
            
            success = self.process_file(filepath)
            if success:
                results['processed_files'] += 1
                
                # Accumulate stats
                stats = self.product_processor.get_stats()['filter_stats']
                desc_stats = self.product_processor.get_stats()['description_stats']
                
                results['total_products_processed'] += stats['total_processed']
                results['total_products_uploaded'] += stats['uploaded']
                results['filter_stats']['total_processed'] += stats['total_processed']
                results['filter_stats']['uploaded'] += stats['uploaded']
                results['filter_stats']['skipped'] += (stats['total_processed'] - stats['uploaded'])
                results['description_stats']['html_descriptions'] += desc_stats['html_descriptions']
                results['description_stats']['plain_text_descriptions'] += desc_stats['plain_text_descriptions']
                results['description_stats']['total_with_descriptions'] += stats['descriptions_uploaded']
                
                # Collect shop IDs
                for product in self.product_processor.collections.get('products', []):
                    if shop_id := product.get('shop_id'):
                        results['shop_ids'].add(shop_id)
            else:
                results['failed_files'] += 1
        
        results['shop_ids'] = list(results['shop_ids'])
        
        # Display final statistics
        self._display_final_statistics(results)
        
        return results
    
    def _display_final_statistics(self, results: Dict[str, Any]) -> None:
        """Display comprehensive final statistics."""
        total_processed = results['filter_stats']['total_processed']
        total_uploaded = results['filter_stats']['uploaded']
        
        self.logger.info(f"\n{'='*80}")
        self.logger.info("📊 FINAL UPLOAD STATISTICS")
        self.logger.info(f"{'='*80}")
        
        # File statistics
        self.logger.info(f"📁 Files:")
        self.logger.info(f"  • Processed: {results['processed_files']}/{results['total_files']}")
        if results['failed_files'] > 0:
            self.logger.warning(f"  • Failed: {results['failed_files']}")
        
        # Product statistics
        self.logger.info(f"\n📦 Products:")
        self.logger.info(f"  • Processed: {total_processed:,}")
        self.logger.info(f"  • Uploaded: {total_uploaded:,}")
        self.logger.info(f"  • Skipped: {results['filter_stats']['skipped']:,}")
        
        if total_processed > 0:
            upload_percentage = round((total_uploaded / total_processed) * 100, 1)
            skip_percentage = round((results['filter_stats']['skipped'] / total_processed) * 100, 1)
            
            self.logger.info(f"\n📈 Percentages:")
            self.logger.info(f"  • Upload rate: {upload_percentage}%")
            self.logger.info(f"  • Skip rate: {skip_percentage}%")
        
        # Description statistics
        desc_stats = results['description_stats']
        if total_uploaded > 0:
            desc_percentage = round((desc_stats['total_with_descriptions'] / total_uploaded) * 100, 1)
            
            self.logger.info(f"\n📝 Descriptions:")
            self.logger.info(f"  • Products with descriptions: {desc_stats['total_with_descriptions']:,} ({desc_percentage}%)")
            self.logger.info(f"  • HTML descriptions: {desc_stats['html_descriptions']:,}")
            self.logger.info(f"  • Plain text descriptions: {desc_stats['plain_text_descriptions']:,}")
        
        # Shop statistics
        self.logger.info(f"\n🏪 Shops:")
        self.logger.info(f"  • Total shops updated: {len(results['shop_ids'])}")
        
        self.logger.info(f"\n⚡ Settings:")
        self.logger.info(f"  • HTML preservation: {'ENABLED' if self.preserve_html else 'DISABLED'}")
        self.logger.info(f"  • Availability filtering: {'ENABLED' if self.filter_available_only else 'DISABLED'}")
        self.logger.info(f"  • Minimum price: ${self.min_price_threshold:.2f}")
        
        self.logger.info(f"{'='*80}")
        self.logger.info("✅ Upload process completed!")
    
    def reload_categorization_config(self):
        """Reload the categorization configuration."""
        self.product_processor.reload_categorization_config()
        self.logger.info("🔄 Product categorization configuration reloaded")


# For backward compatibility
ProductProcessor = ProductProcessor