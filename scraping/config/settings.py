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
    'max_workers': 3,
    'request_timeout': 15,
    'base_delay': 2.0,
    'max_delay': 30.0,
    'retry_attempts': 3,
    'batch_size': 250,
    'max_pages': {
        'collections': 10,
        'products': 50,
        'collection_products': 20
    }
}

# Uploader settings
UPLOADER_CONFIG = {
    'batch_size': 100,
    'max_retries': 3,
    'max_workers': 4,
    'delete_batch_size': 100
}

# Processor settings
PROCESSOR_CONFIG = {
    'size_group_batch_size': 100,
    'taxonomy_batch_size': 500,
    'taxonomy_threshold': 0.45,
    'taxonomy_max_depth': 4,
    'taxonomy_min_depth': 3,
    'taxonomy_preferred_depth': 4,
    'taxonomy_model': 'all-MiniLM-L6-v2'
}

# API endpoints
API_ENDPOINTS = {
    'collections': '/collections.json',
    'products': '/products.json',
    'collection_products': '/collections/{handle}/products.json',
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