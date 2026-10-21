"""
Product Scraper - With both incremental and full scrape modes.
Optimized to skip OOS products in incremental mode.
Now with robust 429 error handling, retry logic, and test-product filtering.
"""

import os
import re
import time
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

from scrapers.base_scraper import BaseScraper
from config.schemas import ProductData
from core.session_manager import SessionManager
from core.state_manager import StateManager


# ---------------------------------------------------------------------------
# Test-product detection
# ---------------------------------------------------------------------------
_TEST_TOKENS = {
    "test", "testing", "tested",
    "dummy", "placeholder",
    "example", "demo", "sandbox",
    "qa", "tmp", "temp",
    "do-not-buy", "donotbuy",
    "delete-me",
}

_TEST_HANDLE_RE = re.compile(
    r"^(?:test|sample|dummy|demo|placeholder|example)(?:[-_].*)?$"
    r"|^(?:.*[-_])?(?:test|dummy|placeholder)(?:[-_].*)?$",
    re.IGNORECASE,
)

_PLACEHOLDER_BODY_MARKERS = (
    "lorem ipsum",
    "this is a test product",
    "test product - do not buy",
    "placeholder text",
)


def _contains_test_token(text: str) -> bool:
    """True if `text` contains a whole-word test token (avoids 'latest'/'contest')."""
    if not text:
        return False
    tokens = re.split(r"[\s\-_/]+", text.lower())
    return any(tok in _TEST_TOKENS for tok in tokens)


def is_test_product(product: Dict[str, Any]) -> tuple:
    """Return (is_test, reason). Reason is '' when not a test product."""
    handle = (product.get("handle") or "").strip()
    title = (product.get("title") or "").strip()
    vendor = (product.get("vendor") or "").strip()
    ptype = (product.get("product_type") or "").strip()
    tags = " ".join(str(t) for t in (product.get("tags") or []))

    # 1. Handle matches a placeholder pattern
    if handle and _TEST_HANDLE_RE.match(handle):
        return True, f"handle matches placeholder pattern: {handle!r}"

    # 2. Whole-word test token in any text field
    for field, value in (
        ("handle", handle),
        ("title", title),
        ("product_type", ptype),
        ("tags", tags),
    ):
        if _contains_test_token(value):
            return True, f"test token in {field}: {value!r}"

    # 3. Vendor is literally a test label
    if vendor.lower() in {"test", "testing", "demo", "sample"}:
        return True, f"vendor is {vendor!r}"

    # 4. Body contains obvious placeholder copy
    body = (product.get("body_html") or "").lower()
    if any(marker in body for marker in _PLACEHOLDER_BODY_MARKERS):
        return True, "body contains placeholder text"

    # 5. Zero/near-zero price AND (no images OR test token in title)
    variants = product.get("variants") or []
    prices = []
    for v in variants:
        try:
            prices.append(float(v.get("price") or 0))
        except (TypeError, ValueError):
            pass
    if prices and max(prices) <= 0.01:
        if not product.get("images"):
            return True, "zero price, no images"
        if _contains_test_token(title):
            return True, "zero price + test token"

    return False, ""


class ProductScraper(BaseScraper):
    """Product scraper - supports both incremental and full scraping."""

    def __init__(self):
        super().__init__("products")

        # TWO MODES: Full vs Incremental
        self.full_scrape_mode = False

        # Full scrape settings
        self.full_max_pages = 100
        self.full_max_requests = 1000

        # Incremental scrape settings
        self.inc_max_pages = 3
        self.inc_max_requests = 30
        self.batch_size = 50

        # OOS filtering
        self.skip_oos_in_incremental = True
        self.skip_oos_in_full = False

        # Current active settings
        self.max_pages = self.inc_max_pages
        self.max_requests_per_shop = self.inc_max_requests

        # State tracking
        self.state_manager = StateManager()

        # Rate limiting
        self.min_shop_delay = 30
        self.skip_shop_hours = 6

        # 429 retry settings
        self.max_429_retries = 3
        self.retry_delay_multiplier = 2

        # Load filters once (was a bug: only loaded inside set_full_scrape_mode)
        self.filters = self._load_filters()

    # ------------------------------------------------------------------ mode
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

    def _load_filters(self) -> Dict[str, List[Dict]]:
        """Load product filters from config file."""
        try:
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
        """Check if product should be filtered out by config filters."""
        if not self.filters:
            return False

        for f in self.filters.get("vendor_filters", []):
            if f.get("vendor") == vendor and f.get("product_type") == product.get(
                "product_type"
            ):
                return True

        title = product.get("title", "")
        for f in self.filters.get("title_filters", []):
            pattern = f.get("pattern", "")
            if f.get("case_insensitive", False):
                if pattern.lower() in title.lower():
                    return True
            else:
                if pattern in title:
                    return True

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

    # --------------------------------------------------------------- entry
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Main entry point - routes to full or incremental based on mode."""
        if self.full_scrape_mode:
            return self._scrape_single_full(shop_data)
        return self._scrape_single_incremental(shop_data)

    # ----------------------------------------------------------- fetching
    def _fetch_page_with_retry(
        self, session, url: str, params: dict, shop_id: str, page: int
    ) -> Optional[Dict]:
        """Fetch a page with retry logic for 429 errors."""
        retry_count = 0

        while retry_count <= self.max_429_retries:
            try:
                self.rate_limiter.wait_before_request(shop_id)
                response = session.get(url, params=params, timeout=30)

                if response.status_code == 429:
                    wait_time = self.rate_limiter.wait(shop_id, response)
                    if retry_count < self.max_429_retries:
                        retry_count += 1
                        self.logger.warning(
                            f"Page {page} got 429, retry {retry_count}/{self.max_429_retries} "
                            f"after {wait_time:.1f}s wait"
                        )
                        continue
                    self.logger.error(
                        f"Page {page} failed after {self.max_429_retries} retries due to 429"
                    )
                    return None

                self.rate_limiter.wait(shop_id, response)

                if response.status_code != 200:
                    self.logger.warning(
                        f"Page {page} returned status {response.status_code}"
                    )
                    return None

                return self._safe_parse_json(response)

            except Exception as e:
                self.logger.error(f"Error fetching page {page}: {e}")
                if retry_count < self.max_429_retries:
                    retry_count += 1
                    time.sleep(2 * retry_count)
                else:
                    return None

        return None

    # ------------------------------------------------------------- loops
    def _scrape_single_full(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """FULL scrape: Get ALL products from a shop."""
        shop_id = shop_data.get("id")
        base_url = shop_data.get("url")

        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []

        base_url = base_url.rstrip("/")
        self.logger.info(f"🚀 Starting FULL product scrape for {shop_id}")
        start_time = time.time()

        try:
            all_products: List[Dict[str, Any]] = []
            page = 1
            empty_pages = 0
            skipped_oos = 0
            skipped_test = 0
            failed_pages = 0

            session = SessionManager.get_session(shop_id)
            skip_oos = self.skip_oos_in_full

            while True:
                if page > self.max_pages:
                    self.logger.warning(f"Hit max pages ({self.max_pages}) for {shop_id}")
                    break

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

                for product in products:
                    try:
                        vendor = product.get("vendor")
                        if self._should_skip_product(product, vendor):
                            continue

                        # --- test product filter ---
                        test, reason = is_test_product(product)
                        if test:
                            skipped_test += 1
                            self.logger.info(
                                f"  🧪 Filtered test product "
                                f"{product.get('handle')!r} (shop={shop_id}): {reason}"
                            )
                            continue
                        # ---------------------------

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

                if len(products) < 250:
                    break

                page += 1
                time.sleep(1 if page % 5 == 0 else 0.3)

            elapsed = time.time() - start_time
            extra = []
            if skip_oos and skipped_oos:
                extra.append(f"{skipped_oos} OOS skipped")
            if skipped_test:
                extra.append(f"{skipped_test} test skipped")
            extra_str = f" ({', '.join(extra)})" if extra else ""

            self.logger.info(
                f"✅ FULL scrape {shop_id}: {len(all_products)} products"
                f"{extra_str} in {elapsed:.1f}s"
            )

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

        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data - missing id or url: {shop_data}")
            return []

        base_url = base_url.rstrip("/")

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
            all_products: List[Dict[str, Any]] = []
            page = 1
            empty_pages = 0
            skipped_oos = 0
            skipped_test = 0
            failed_pages = 0

            session = SessionManager.get_session(shop_id)
            skip_oos = self.skip_oos_in_incremental

            while True:
                if page > self.max_pages:
                    self.logger.info(
                        f"Reached max pages ({self.max_pages}) for incremental scrape"
                    )
                    break

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

                for product in products:
                    try:
                        vendor = product.get("vendor")
                        if self._should_skip_product(product, vendor):
                            continue

                        # --- test product filter ---
                        test, reason = is_test_product(product)
                        if test:
                            skipped_test += 1
                            self.logger.info(
                                f"  🧪 Filtered test product "
                                f"{product.get('handle')!r} (shop={shop_id}): {reason}"
                            )
                            continue
                        # ---------------------------

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

                in_stock_count = sum(
                    1 for p in products if self._is_available(p.get("variants", []))
                )
                self.logger.info(
                    f"  {shop_id}: Page {page} - {len(products)} found, "
                    f"{in_stock_count} in stock"
                )

                if len(products) < 250:
                    break

                page += 1
                time.sleep(0.5)

            elapsed = time.time() - start_time
            extra = []
            if skip_oos and skipped_oos:
                extra.append(f"{skipped_oos} OOS skipped")
            if skipped_test:
                extra.append(f"{skipped_test} test skipped")
            extra_str = f" ({', '.join(extra)})" if extra else ""

            self.logger.info(
                f"✅ INCREMENTAL scrape {shop_id}: {len(all_products)} "
                f"in-stock products{extra_str} in {elapsed:.1f}s"
            )

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

    # --------------------------------------------------------- conversion
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

    # ------------------------------------------------------------ helpers
    def _get_min_price(self, variants: List[Dict]) -> Optional[float]:
        if not variants:
            return None
        prices = []
        for v in variants:
            if v.get("price"):
                try:
                    prices.append(float(v["price"]))
                except (ValueError, TypeError):
                    continue
        return min(prices) if prices else None

    def _get_min_compare_at_price(self, variants: List[Dict]) -> Optional[float]:
        if not variants:
            return None
        prices = []
        for v in variants:
            if v.get("compare_at_price"):
                try:
                    prices.append(float(v["compare_at_price"]))
                except (ValueError, TypeError):
                    continue
        return min(prices) if prices else None

    def _is_available(self, variants: List[Dict]) -> bool:
        if not variants:
            return False
        return any(v.get("available", False) for v in variants)

    def _get_primary_image(self, images: List[Dict]) -> Optional[str]:
        if not images:
            return None
        for img in images:
            if img.get("src"):
                return img["src"]
        return None

    def scrape_multiple(
        self, shops: List[Dict[str, Any]], max_workers: Optional[int] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        return super().scrape_multiple(shops, max_workers)