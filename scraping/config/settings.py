"""
Configuration for the entire system.
"""
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Data directories
DATA_DIR = BASE_DIR / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
ARCHIVE_DIR = DATA_DIR / "archive"
LOG_DIR = BASE_DIR / "logs"
CACHE_DIR = BASE_DIR / ".cache"

# Create directories
for directory in [DATA_DIR, RAW_DATA_DIR, PROCESSED_DATA_DIR, ARCHIVE_DIR, LOG_DIR, CACHE_DIR]:
    directory.mkdir(exist_ok=True, parents=True)

# File paths
SHOP_URLS_FILE = BASE_DIR / "config" / "shop_urls.json"
ENV_FILE = BASE_DIR / ".env"

# Scraper settings
SCRAPER_CONFIG = {
    'max_pages': {
        'products': 3,
    },
    'concurrent_pages': 2,
    'batch_size': 50,
    'request_timeout': 20,
    'retry_attempts': 3,
    'base_delay': 2.0,
    'max_delay': 30.0,
    'max_workers': 3,

    'skip_shop_hours': 6,  # Skip shops scraped in last 6 hours
    'min_shop_delay': 30,  # Minimum delay between shops
    'max_requests_per_shop': {
        'products': 30,
    }
}

# Uploader settings
UPLOADER_CONFIG = {
    'batch_size': 100,
    'max_retries': 3,
    'max_workers': 4,
    'delete_batch_size': 100
}


# API endpoints
API_ENDPOINTS = {
    'products': '/products.json',
    'shop_info': '/admin/api/2023-10/shop.json'
}

# Headers
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

# Logging
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
LOG_LEVEL = "INFO"