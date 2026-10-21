"""
Product Scraper - With both incremental and full scrape modes.
Optimized to skip OOS products in incremental mode.

Features:
- Robust 429 error handling and retry logic
- Test-product filtering (word-boundary safe)
- Non-tangible filtering (services, gift cards, shipping protection,
  deposits, memberships, digital goods)
- Per-shop collection scoping via config/product_collection_overrides.json
"""

import os
import re
import time
import json
from datetime import datetime
from typing import List, Dict, Any, Optional, Set

from scrapers.base_scraper import BaseScraper
from config.schemas import ProductData
from core.session_manager import SessionManager
from core.state_manager import StateManager


# ===========================================================================
# Test-product detection
# ===========================================================================
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

    if handle and _TEST_HANDLE_RE.match(handle):
        return True, f"handle matches placeholder pattern: {handle!r}"

    for field, value in (
        ("handle", handle),
        ("title", title),
        ("product_type", ptype),
        ("tags", tags),
    ):
        if _contains_test_token(value):
            return True, f"test token in {field}: {value!r}"

    if vendor.lower() in {"test", "testing", "demo", "sample"}:
        return True, f"vendor is {vendor!r}"

    body = (product.get("body_html") or "").lower()
    if any(marker in body for marker in _PLACEHOLDER_BODY_MARKERS):
        return True, "body contains placeholder text"

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


# ===========================================================================
# Non-tangible detection (services, gift cards, shipping, etc.)
# ===========================================================================
# product_type values that are definitively not physical goods
_NON_TANGIBLE_PRODUCT_TYPES = {
    "service",
    "services",
    "insurance",
    "gift card",
    "gift cards",
    "gift wrap",
    "gift wrapping",
    "pre-order deposit",
    "alteration services",
    "repair services",
    "package protection",
    "membership",
    "digital",
    "download",
}

# Phrase list — matched as substrings (already specific enough)
_NON_TANGIBLE_PHRASES = (
    # shipping / protection
    "shipping protection",
    "ship protection",
    "package protection",
    "route protection",
    "shipping insurance",
    "routeins",
    "navidium",
    "safe ship protection",
    "safe-ship",
    # gift cards / credit
    "gift card",
    "gift certificate",
    "e-gift",
    "egift",
    "store credit",
    # deposits / fees
    "pre-order deposit",
    "pre order deposit",
    "down payment",
    # subscriptions / memberships
    "membership fee",
    "elite membership",
    # donations / tips
    "donation match",
    "donation",
    # delivery services
    "hand delivered",
    # alterations (as standalone phrase — product_type covers the rest)
    "custom alterations",
)

# Word-boundary patterns for alteration / repair services
_NON_TANGIBLE_SERVICE_RE = re.compile(
    r"\b(alteration|alterations|hemming|repair services?)\b",
    re.IGNORECASE,
)

# Handle prefixes
_NON_TANGIBLE_HANDLE_PREFIXES = (
    "gift-card",
    "gift_card",
    "e-gift",
    "egift",
    "safe-ship",
    "shipping-",
    "routeins",
    "navidium",
)


def is_non_tangible(product: Dict[str, Any]) -> tuple:
    """Return (is_non_tangible, reason). Reason is '' when it IS tangible.

    Layered checks:
      1. Structural: all variants have requires_shipping == false
      2. product_type is a known non-tangible value
      3. Handle/title/product_type matches a phrase or service regex
      4. Handle starts with a known non-tangible prefix
    """
    variants = product.get("variants") or []
    if variants and all(
        v.get("requires_shipping", True) is False for v in variants
    ):
        return True, "all variants require_shipping=false (digital/service)"

    handle = (product.get("handle") or "").lower()
    title = (product.get("title") or "").lower()
    ptype = (product.get("product_type") or "").lower()
    text = f"{handle} {title} {ptype}"

    if ptype in _NON_TANGIBLE_PRODUCT_TYPES:
        return True, f"product_type is {ptype!r}"

    for phrase in _NON_TANGIBLE_PHRASES:
        if phrase in text:
            return True, f"matches non-tangible phrase: {phrase!r}"

    if _NON_TANGIBLE_SERVICE_RE.search(text):
        return True, "matches alteration/repair service pattern"

    for prefix in _NON_TANGIBLE_HANDLE_PREFIXES:
        if handle.startswith(prefix):
            return True, f"handle starts with {prefix!r}"

    return False, ""


# ===========================================================================
# ProductScraper
# ===========================================================================
class ProductScraper(BaseScraper):
    """Product scraper - supports both incremental and full scraping."""

    def __init__(self):
        super().__init__("products")

        # Modes
        self.full_scrape_mode = False
        self.full_max_pages = 100
        self.full_max_requests = 1000
        self.inc_max_pages = 3
        self.inc_max_requests = 30
        self.batch_size = 50

        # OOS filtering
        self.skip_oos_in_incremental = True
        self.skip_oos_in_full = False

        # Active settings
        self.max_pages = self.inc_max_pages
        self.max_requests_per_shop = self.inc_max_requests

        # State tracking
        self.state_manager = StateManager()

        # Rate limiting
        self.min_shop_delay = 30
        self.skip_shop_hours = 6

        # 429 retry
        self.max_429_retries = 3
        self.retry_delay_multiplier = 2

        # Config (loaded once — fixes bug where filters only loaded in set_full_scrape_mode)
        self.filters = self._load_filters()
        self.collection_overrides = self._load_collection_overrides()

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

    # ----------------------------------------------------------- config
    def _load_filters(self) -> Dict[str, List[Dict]]:
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

    def _load_collection_overrides(self) -> Dict[str, Dict[str, Any]]:
        """Load per-shop collection scoping from config/product_collection_overrides.json.

        Format:
          {
            "1578": { "collection_handles": ["boots"], "reason": "..." }
          }
        """
        try:
            config_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "config",
                "product_collection_overrides.json",
            )
            if not os.path.exists(config_path):
                return {}
            with open(config_path, "r") as f:
                data = json.load(f)
            overrides = {str(k): v for k, v in data.items()}
            if overrides:
                self.logger.info(
                    f"Loaded collection overrides for {len(overrides)} shop(s): "
                    f"{sorted(overrides.keys())}"
                )
            return overrides
        except Exception as e:
            self.logger.error(f"Error loading collection overrides: {e}")
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
            elif pattern in title:
                return True

        p_type = product.get("product_type", "")
        for f in self.filters.get("product_type_filters", []):
            pattern = f.get("pattern", "")
            if f.get("case_insensitive", False):
                if pattern.lower() in p_type.lower():
                    return True
            elif pattern in p_type:
                return True

        return False

    # ------------------------------------------------------------- entry
    def scrape_single(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        if self.full_scrape_mode:
            return self._scrape_single_full(shop_data)
        return self._scrape_single_incremental(shop_data)

    # ---------------------------------------------------- collection URLs
    def _collections_for_shop(self, shop_id: Any) -> Optional[List[str]]:
        override = self.collection_overrides.get(str(shop_id))
        if not override:
            return None
        if override.get("collection_handles"):
            return list(override["collection_handles"])
        if override.get("collection_handle"):
            return [override["collection_handle"]]
        return None

    def _product_endpoints_for_shop(
        self, base_url: str, shop_id: Any
    ) -> List[Dict[str, Any]]:
        base_url = base_url.rstrip("/")
        collections = self._collections_for_shop(shop_id)

        if not collections:
            return [
                {
                    "url": f"{base_url}/products.json",
                    "collection": None,
                }
            ]

        return [
            {
                "url": f"{base_url}/collections/{handle}/products.json",
                "collection": handle,
            }
            for handle in collections
        ]

    # ---------------------------------------------------------- fetching
    def _fetch_page_with_retry(
        self, session, url: str, params: dict, shop_id: str, page: int
    ) -> Optional[Dict]:
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
                            f"after {wait_time:.1f}s"
                        )
                        continue
                    self.logger.error(
                        f"Page {page} failed after {self.max_429_retries} retries due to 429"
                    )
                    return None

                self.rate_limiter.wait(shop_id, response)

                if response.status_code == 404:
                    self.logger.warning(
                        f"Page {page} 404 for {url} — collection may be unpublished"
                    )
                    return None

                if response.status_code != 200:
                    self.logger.warning(
                        f"Page {page} status {response.status_code} for {url}"
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
    def _scrape_shop_pages(
        self,
        session,
        shop_id: Any,
        base_url: str,
        skip_oos: bool,
        collect: Dict[str, Dict[str, Any]],
        stats: Dict[str, int],
    ) -> None:
        """Scrape all pages for one shop (all collections if override exists)."""
        endpoints = self._product_endpoints_for_shop(base_url, shop_id)

        for endpoint in endpoints:
            url = endpoint["url"]
            collection = endpoint["collection"]
            label = f"collection {collection!r}" if collection else "/products.json"
            self.logger.info(f"  {shop_id}: scraping {label}")

            page = 1
            empty_pages = 0
            failed_pages = 0

            while True:
                if page > self.max_pages:
                    self.logger.info(
                        f"  {shop_id}: reached max pages ({self.max_pages}) for {label}"
                    )
                    break

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
                            f"  {shop_id}: too many failed pages for {label}, skipping"
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
                        # 0. Config filters (vendor/title/type)
                        vendor = product.get("vendor")
                        if self._should_skip_product(product, vendor):
                            stats["skipped_config"] += 1
                            continue

                        # 1. Non-tangible filter (services, gift cards, shipping...)
                        nt, nt_reason = is_non_tangible(product)
                        if nt:
                            stats["skipped_non_tangible"] += 1
                            self.logger.info(
                                f"  🚫 Filtered non-tangible product "
                                f"{product.get('handle')!r} (shop={shop_id}): {nt_reason}"
                            )
                            continue

                        # 2. Test-product filter
                        test, reason = is_test_product(product)
                        if test:
                            stats["skipped_test"] += 1
                            self.logger.info(
                                f"  🧪 Filtered test product "
                                f"{product.get('handle')!r} (shop={shop_id}): {reason}"
                            )
                            continue

                        # 3. OOS (incremental only)
                        if skip_oos:
                            variants = product.get("variants", [])
                            if not self._is_available(variants):
                                stats["skipped_oos"] += 1
                                continue

                        # 4. Convert & dedupe
                        product_data = self._convert_to_product_data(
                            product, shop_id, base_url
                        )
                        if product_data:
                            pid = product_data.to_dict().get("id")
                            if not isinstance(pid, str):
                                continue
                            if pid in collect:
                                stats["deduped"] += 1
                                continue
                            collect[pid] = product_data.to_dict()

                    except Exception as e:
                        self.logger.debug(f"Error converting product: {e}")
                        continue

                self.logger.info(
                    f"  {shop_id}: {label} page {page} - {len(products)} products"
                )

                if len(products) < 250:
                    break

                page += 1
                time.sleep(1 if page % 5 == 0 else 0.3)

    def _scrape_single_full(self, shop_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        shop_id = shop_data.get("id")
        base_url = shop_data.get("url")

        if not shop_id or not base_url:
            self.logger.error(f"Invalid shop data: {shop_data}")
            return []

        base_url = base_url.rstrip("/")
        override = self.collection_overrides.get(str(shop_id))
        override_str = (
            f" [collections={self._collections_for_shop(shop_id)}]" if override else ""
        )
        self.logger.info(
            f"🚀 Starting FULL product scrape for {shop_id}{override_str}"
        )
        start_time = time.time()

        try:
            collect: Dict[str, Dict[str, Any]] = {}
            stats = {
                "skipped_oos": 0,
                "skipped_test": 0,
                "skipped_non_tangible": 0,
                "skipped_config": 0,
                "deduped": 0,
            }

            session = SessionManager.get_session(shop_id)
            self._scrape_shop_pages(
                session=session,
                shop_id=shop_id,
                base_url=base_url,
                skip_oos=self.skip_oos_in_full,
                collect=collect,
                stats=stats,
            )

            elapsed = time.time() - start_time
            extra = self._format_stats(stats)

            self.logger.info(
                f"✅ FULL scrape {shop_id}: {len(collect)} products"
                f"{extra} in {elapsed:.1f}s"
            )

            try:
                self.state_manager.update_shop_state(
                    shop_id, "products", len(collect)
                )
            except Exception as e:
                self.logger.debug(f"Could not update state: {e}")

            return list(collect.values())

        except Exception as e:
            self.logger.error(f"Error in full scrape {shop_id}: {e}")
            return []

    def _scrape_single_incremental(
        self, shop_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
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

        override = self.collection_overrides.get(str(shop_id))
        override_str = (
            f" [collections={self._collections_for_shop(shop_id)}]" if override else ""
        )
        self.logger.info(
            f"📊 Starting INCREMENTAL product scrape for {shop_id}{override_str}"
        )
        start_time = time.time()

        try:
            collect: Dict[str, Dict[str, Any]] = {}
            stats = {
                "skipped_oos": 0,
                "skipped_test": 0,
                "skipped_non_tangible": 0,
                "skipped_config": 0,
                "deduped": 0,
            }

            session = SessionManager.get_session(shop_id)
            self._scrape_shop_pages(
                session=session,
                shop_id=shop_id,
                base_url=base_url,
                skip_oos=self.skip_oos_in_incremental,
                collect=collect,
                stats=stats,
            )

            elapsed = time.time() - start_time
            extra = self._format_stats(stats)

            self.logger.info(
                f"✅ INCREMENTAL scrape {shop_id}: {len(collect)} products"
                f"{extra} in {elapsed:.1f}s"
            )

            try:
                self.state_manager.update_shop_state(
                    shop_id, "products", len(collect)
                )
            except Exception as e:
                self.logger.debug(f"Could not update state: {e}")

            return list(collect.values())

        except Exception as e:
            self.logger.error(f"Error in incremental scrape {shop_id}: {e}")
            return []

    @staticmethod
    def _format_stats(stats: Dict[str, int]) -> str:
        """Format skip counts for the summary log line."""
        parts = []
        if stats.get("skipped_oos"):
            parts.append(f"{stats['skipped_oos']} OOS")
        if stats.get("skipped_non_tangible"):
            parts.append(f"{stats['skipped_non_tangible']} non-tangible")
        if stats.get("skipped_test"):
            parts.append(f"{stats['skipped_test']} test")
        if stats.get("skipped_config"):
            parts.append(f"{stats['skipped_config']} config-filtered")
        if stats.get("deduped"):
            parts.append(f"{stats['deduped']} duplicate")
        return f" ({', '.join(parts)} skipped)" if parts else ""

    # -------------------------------------------------------- conversion
    def _convert_to_product_data(
        self, product: Dict[str, Any], shop_id: str, base_url: str
    ) -> Optional[ProductData]:
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