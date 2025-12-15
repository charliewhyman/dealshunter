#!/Users/charlie/dealshunter/scraping/.venv/bin/python3
"""
scrape_and_upload_all.py
One-shot runner that executes the whole Shopify scraping → upload → refresh
pipeline in the correct order.  Run via:

    uv run python scrape_and_upload_all.py

Environment variables expected in a `.env` file:
  SUPABASE_URL                 – e.g. https://xyz.supabase.co
  SUPABASE_SERVICE_ROLE_KEY     – service_role key (bypasses RLS)
"""

import os
import subprocess
import sys
from pathlib import Path
from typing import List

from supabase import create_client, Client
from dotenv import load_dotenv

# ------------------------------------------------------------------
# 1. Configuration
# ------------------------------------------------------------------
SCRIPTS: List[str] = [
    "get_shopify_collections.py",
    "get_shopify_products.py",
    "get_shopify_collections_to_products.py",
    "upload_shops.py",
    "upload_shopify_collections.py",
    "upload_shopify_products.py",
    "upload_shopify_collections_to_products.py",
    "taxonomy_mapper.py",  # Updated from map_product_to_taxonomy.py
]

# Load environment variables from .env
load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL")
SUPABASE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in environment.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ------------------------------------------------------------------
# 2. Helper: run a single script
# ------------------------------------------------------------------
def run_script(script: str) -> None:
    """Execute script via subprocess; stream stdout/stderr in real time."""
    script_path = Path(__file__).parent / script
    if not script_path.exists():
        print(f"ERROR: Script {script} not found at {script_path}")
        sys.exit(1)

    print(f"\nRUNNING: {script}")
    result = subprocess.run(
        [sys.executable, str(script_path)],
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    if result.returncode != 0:
        print(f"ERROR: {script} failed with exit code {result.returncode}")
        sys.exit(result.returncode)
    print(f"COMPLETED: {script}")

# ------------------------------------------------------------------
# 3. Helper: incremental refresh via Supabase RPC
# ------------------------------------------------------------------
def refresh_products_with_details() -> None:
    print("\nREFRESHING: products_with_details")
    try:
        resp = supabase.rpc("refresh_products_with_details_incremental").execute()
        if resp.data is None:
            print("SUCCESS: products_with_details refreshed")
        else:
            print("WARNING: Unexpected response from RPC:", resp.data)
    except Exception as exc:
        print("ERROR: refresh_products_with_details failed:", exc)
        sys.exit(1)

# ------------------------------------------------------------------
# 4. Main runner
# ------------------------------------------------------------------
def main() -> None:
    print("STARTING: Shopify scrape → upload → refresh pipeline")
    for script in SCRIPTS:
        run_script(script)
    refresh_products_with_details()
    print("\nSUCCESS: All scripts completed successfully")

if __name__ == "__main__":
    main()