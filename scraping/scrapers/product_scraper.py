"""
Product Scraper - With both incremental and full scrape modes.
Optimized to skip OOS products in incremental mode.
Now with robust 429 error handling and retry logic.
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
import time
import json
from scrapers.base_scraper import BaseScraper
from config.schemas import ProductData
from core.session_manager import SessionManager
from core.state_manager import StateManager


class ProductScraper(BaseScraper):
    """Product scraper - supports both incremental and full scraping."""

    def __init__(self):
        super().__init__("products")

        # TWO MODES: Full vs Incremental
        self.full_scrape_mode = False  # Set to True for initial data collection

        # Full scrape settings (when full_scrape_mode = True)
        self.full_max_pages = 100  # High limit for full scrape
        self.full_max_requests = 1000  # High limit for full scrape

        # Incremental scrape settings (when full_scrape_mode = False)
        self.inc_max_pages = 3  # Reduced from 10+ for incremental
        self.inc_max_requests = 30  # Reduced concurrency for incremental
        self.batch_size = 50  # Smaller batches for incremental

        # OOS filtering
        self.skip_oos_in_incremental = True  # Skip out-of-stock products
        self.skip_oos_in_full = False  # Keep OOS in full scrapes for complete dataset

        # Current active settings (set based on mode)
        self.max_pages = self.inc_max_pages
        self.max_requests_per_shop = self.inc_max_requests

        # State tracking
        self.state_manager = StateManager()

        # Rate limiting
        self.min_shop_delay = 30  # Seconds between shops
        self.skip_shop_hours = 6  # Skip shops scraped in last 6 hours

        # Retry settings for 429 errors
        self.max_429_retries = 3  # Max retries per page on 429
        self.retry_delay_multiplier = 2  # Exponential backoff multiplier

    def set_full_scrape_mode(self, enabled: bool = True):
        """Switch between full and incremental scrape modes."""
        self.full_scrape_mode = enabled
        if enabled:
            self.max_pages = self.full_max_pages
            self.max_requests_per_shop = self.full_max_requests
            self.logger.info("🔄 Set to FULL scrape mode")
        else:
            self.max_pages = self.inc_max_pages
            self.max_requests_per_shop = self.inc_max_requests
            self.logger.info("📊 Set to INCREMENTAL scrape mode")

        # Load product filters
        self.filters = self._load_filters()

    def _load_filters(self) -> Dict[str, List[Dict]]:
        """Load product filters from config file."""
        try:
            import os

            config_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "config",
                "product_filters.json",
            )
            if os.path.exists(config_path):
                with open(config_path, "r") as f:
                    return json.load(f)
            return {}
        except Exception as e:
            self.logger.error(f"Error loading product filters: {e}")
            return {}

    def _should_skip_product(self, product: Dict[str, Any], vendor: str) -> bool:
        """Check if product should be filtered out based on criteria."""
        if not self.filters:
            return False

        # Vendor filters
        for f in self.filters.get("vendor_filters", []):
            if f.get("vendor") == vendor and f.get("product_type") == product.get(
                "product_type"
            ):
                return True

        # Title filters
        title = product.get("title", "")
        for f in self.filters.get("title_filters", []):
            pattern = f.get("pattern", "")
            if f.get("case_insensitive", False):
                if pattern.lower() in title.lower():
                    return True
            else:
                if pattern in title:
                    return True

        # Product Type filters
        p_type = product.get("product_type", "")
        for f in self.filters.get("product_type_filters", []):
            pattern = f.get("pattern", "")
            if f.get("case_insensitive", False):
                if pattern.lower() in p_type.lower():
                    return True
            else:
                if pattern in p_type:
                    return True

        return False

    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Main entry point - routes to full or incremental based on mode."""
        if self.full_scrape_mode:
            return self._scrape_single_full(shop_data)
        else:
            return self._scrape_single_incremental(shop_data)

    def _fetch_page_with_retry(
        self, session, url: str, params: dict, shop_id: str, page: int
    ) -> Optional[Dict]:
        """Fetch a page with retry logic for 429 errors."""
        retry_count = 0

        while retry_count <= self.max_429_retries:
            try:
                # Proactive wait before request
                self.rate_limiter.wait_before_request(shop_id)

                response = session.get(url, params=params, timeout=30)

                # Handle 429 specifically
                if response.status_code == 429:
                    # Let rate limiter handle backoff
                    wait_time = self.rate_limiter.wait(shop_id, response)

                    if retry_count < self.max_429_retries:
                        retry_count += 1
                        self.logger.warning(
                            f"Page {page} got 429, retry {retry_count}/{self.max_429_retries} "
                            f"after {wait_time:.1f}s wait"
                        )
                        continue  # Retry same page
                    else:
                        self.logger.error(
                            f"Page {page} failed after {self.max_429_retries} retries due to 429"
                        )
                        return None

                # Normal rate limiting for non-429 responses
                self.rate_limiter.wait(shop_id, response)

                # Handle other non-200 status codes
                if response.status_code != 200:
                    self.logger.warning(
                        f"Page {page} returned status {response.status_code}"
                    )
                    return None

                # Success - parse and return
                data = self._safe_parse_json(response)
                return data

            except Exception as e:
                self.logger.error(f"Error fetching page {page}: {e}")
                if retry_count < self.max_429_retries:
                    retry_count += 1
                    time.sleep(2 * retry_count)  # Linear backoff for errors
                else:
                    return None

        return None

    def _scrape_single_full(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """FULL scrape: Get ALL products from a shop."""
        shop_id = shop_data.get("id")
        base_url = shop_data.get("url")

        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []

        self.logger.info(f"🚀 Starting FULL product scrape for {shop_id}")
        start_time = time.time()

        try:
            all_products = []
            page = 1
            empty_pages = 0
            skipped_oos = 0
            failed_pages = 0

            session = SessionManager.get_session(shop_id)

            # Determine if we should skip OOS for this mode
            skip_oos = self.skip_oos_in_full

            while True:
                if page > self.max_pages:
                    self.logger.warning(
                        f"Hit max pages ({self.max_pages}) for {shop_id}"
                    )
                    break

                # Use retry logic for fetching
                url = f"{base_url}/products.json"
                params = {
                    "limit": 250,
                    "page": page,
                    "currency": "CAD",
                    "country": "CA",
                }

                data = self._fetch_page_with_retry(session, url, params, shop_id, page)

                if data is None:
                    failed_pages += 1
                    if failed_pages >= 3:
                        self.logger.error(
                            f"Too many failed pages ({failed_pages}), stopping"
                        )
                        break
                    page += 1
                    continue

                # Reset failed counter on success
                failed_pages = 0

                if "products" not in data:
                    break

                products = data["products"]

                if not products:
                    empty_pages += 1
                    if empty_pages >= 2:
                        break
                    page += 1
                    continue

                # Reset empty counter
                empty_pages = 0

                # Process each product
                for product in products:
                    try:
                        # Check global filters
                        vendor = product.get("vendor")
                        if self._should_skip_product(product, vendor):
                            continue

                        # Skip OOS products if enabled
                        if skip_oos:
                            variants = product.get("variants", [])
                            if not self._is_available(variants):
                                skipped_oos += 1
                                continue

                        product_data = self._convert_to_product_data(
                            product, shop_id, base_url
                        )
                        if product_data:
                            all_products.append(product_data.to_dict())
                    except Exception as e:
                        self.logger.debug(f"Error converting product: {e}")
                        continue

                self.logger.info(f"  {shop_id}: Page {page} - {len(products)} products")

                # Stop if we got fewer than limit
                if len(products) < 250:
                    break

                page += 1

                # Small delay between pages (in addition to rate limiter)
                if page % 5 == 0:  # Every 5 pages
                    time.sleep(1)
                else:
                    time.sleep(0.3)

            elapsed = time.time() - start_time

            if skip_oos and skipped_oos > 0:
                self.logger.info(
                    f"✅ FULL scrape {shop_id}: {len(all_products)} products "
                    f"({skipped_oos} OOS skipped) in {elapsed:.1f}s"
                )
            else:
                self.logger.info(
                    f"✅ FULL scrape {shop_id}: {len(all_products)} products in {elapsed:.1f}s"
                )

            # Update state manager
            try:
                self.state_manager.update_shop_state(
                    shop_id, "products", len(all_products)
                )
            except Exception as e:
                self.logger.debug(f"Could not update state: {e}")

            return all_products

        except Exception as e:
            self.logger.error(f"Error in full scrape {shop_id}: {e}")
            return []

    def _scrape_single_incremental(
        self, shop_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """INCREMENTAL scrape - optimized to skip OOS products."""
        shop_id = shop_data.get("id")
        base_url = shop_data.get("url")

        # Validate shop_id before proceeding
        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data - missing id or url: {shop_data}")
            return []

        # Check if we should skip this shop entirely
        should_skip = False
        try:
            should_skip = self.state_manager.should_skip_data_type(
                shop_id, "products", self.skip_shop_hours
            )
        except Exception as e:
            self.logger.debug(f"Could not check skip status: {e}")

        if should_skip:
            self.logger.info(f"⏭️  Skipping products for {shop_id} - scraped recently")
            return []

        self.logger.info(f"📊 Starting INCREMENTAL product scrape for {shop_id}")
        start_time = time.time()

        try:
            all_products = []
            page = 1
            empty_pages = 0
            skipped_oos = 0
            failed_pages = 0

            session = SessionManager.get_session(shop_id)

            # Use incremental settings with OOS filtering
            skip_oos = self.skip_oos_in_incremental

            while True:
                if page > self.max_pages:
                    self.logger.info(
                        f"Reached max pages ({self.max_pages}) for incremental scrape"
                    )
                    break

                # Use retry logic for fetching
                url = f"{base_url}/products.json"
                params = {
                    "limit": 250,
                    "page": page,
                    "currency": "CAD",
                    "country": "CA",
                }

                data = self._fetch_page_with_retry(session, url, params, shop_id, page)

                if data is None:
                    failed_pages += 1
                    if failed_pages >= 3:
                        self.logger.error(
                            f"Too many failed pages ({failed_pages}), stopping"
                        )
                        break
                    page += 1
                    continue

                # Reset failed counter on success
                failed_pages = 0

                if "products" not in data:
                    break

                products = data["products"]

                if not products:
                    empty_pages += 1
                    if empty_pages >= 2:
                        break
                    page += 1
                    continue

                empty_pages = 0

                # Process products with OOS filtering
                for product in products:
                    try:
                        # Check global filters first
                        vendor = product.get("vendor")
                        if self._should_skip_product(product, vendor):
                            continue

                        # CRITICAL: Skip OOS products in incremental mode
                        if skip_oos:
                            variants = product.get("variants", [])
                            if not self._is_available(variants):
                                skipped_oos += 1
                                continue

                        product_data = self._convert_to_product_data(
                            product, shop_id, base_url
                        )
                        if product_data:
                            all_products.append(product_data.to_dict())

                    except Exception as e:
                        self.logger.debug(f"Error converting product: {e}")
                        continue

                self.logger.info(
                    f"  {shop_id}: Page {page} - {len(products)} found, "
                    f"{len([p for p in products if self._is_available(p.get('variants', []))])} in stock"
                )

                # Stop if we got fewer than limit
                if len(products) < 250:
                    break

                page += 1

                # Delay between pages (in addition to rate limiter)
                time.sleep(0.5)

            elapsed = time.time() - start_time

            if skip_oos:
                self.logger.info(
                    f"✅ INCREMENTAL scrape {shop_id}: {len(all_products)} in-stock products "
                    f"({skipped_oos} OOS skipped) in {elapsed:.1f}s"
                )
            else:
                self.logger.info(
                    f"✅ INCREMENTAL scrape {shop_id}: {len(all_products)} products in {elapsed:.1f}s"
                )

            # Update state
            try:
                self.state_manager.update_shop_state(
                    shop_id, "products", len(all_products)
                )
            except Exception as e:
                self.logger.debug(f"Could not update state: {e}")

            return all_products

        except Exception as e:
            self.logger.error(f"Error in incremental scrape {shop_id}: {e}")
            return []

    def _convert_to_product_data(
        self, product: Dict[str, Any], shop_id: str, base_url: str
    ) -> Optional[ProductData]:
        """Convert raw Shopify product to ProductData."""
        try:
            handle = product.get("handle", "")
            product_url = f"{base_url}/products/{handle}" if handle else ""

            return ProductData(
                shop_id=shop_id,
                scraped_at=datetime.now().isoformat(),
                id=str(product.get("id", "")),
                handle=handle,
                title=product.get("title", ""),
                product_url=product_url,
                description=product.get("body_html"),
                product_type=product.get("product_type"),
                vendor=product.get("vendor"),
                tags=product.get("tags", []),
                price=self._get_min_price(product.get("variants", [])),
                compare_at_price=self._get_min_compare_at_price(
                    product.get("variants", [])
                ),
                available=self._is_available(product.get("variants", [])),
                image_url=self._get_primary_image(product.get("images", [])),
                published_at=product.get("published_at"),
                updated_at=product.get("updated_at"),
                variants=product.get("variants", []),
                images=product.get("images", []),
            )
        except Exception as e:
            self.logger.debug(f"Error converting product {product.get('id')}: {e}")
            return None

    # Helper methods
    def _get_min_price(self, variants: List[Dict]) -> Optional[float]:
        """Get minimum price from variants."""
        if not variants:
            return None

        prices = []
        for v in variants:
            if "price" in v and v["price"]:
                try:
                    prices.append(float(v["price"]))
                except (ValueError, TypeError):
                    continue

        return min(prices) if prices else None

    def _get_min_compare_at_price(self, variants: List[Dict]) -> Optional[float]:
        """Get minimum compare_at_price from variants."""
        if not variants:
            return None

        prices = []
        for v in variants:
            if "compare_at_price" in v and v["compare_at_price"]:
                try:
                    prices.append(float(v["compare_at_price"]))
                except (ValueError, TypeError):
                    continue

        return min(prices) if prices else None

    def _is_available(self, variants: List[Dict]) -> bool:
        """Check if any variant is available (in stock)."""
        if not variants:
            return False

        for v in variants:
            if v.get("available", False):
                return True

        return False

    def _get_primary_image(self, images: List[Dict]) -> Optional[str]:
        """Get primary image URL."""
        if not images:
            return None

        for img in images:
            if "src" in img and img["src"]:
                return img["src"]

        return None

    def scrape_multiple(
        self, shops: List[Dict[str, Any]], max_workers: Optional[int] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Scrape multiple shops."""
        return super().scrape_multiple(shops, max_workers)
