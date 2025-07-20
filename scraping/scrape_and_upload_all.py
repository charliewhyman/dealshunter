#!/usr/bin/env python3
"""
scrape_and_upload_all.py
One-shot runner that executes the whole Shopify scraping → upload → refresh
pipeline in the correct order.  Add this file next to the other upload
scripts and run:

    python scrape_and_upload_all.py

Environment variables expected:
  SUPABASE_URL   – e.g. https://xyz.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  – service_role key (bypasses RLS so you can write)
"""

import os
import subprocess
import sys
from pathlib import Path
from typing import List

from supabase import create_client, Client

# ------------------------------------------------------------------
# 1.  Configuration
# ------------------------------------------------------------------
SCRIPTS: List[str] = [
    "get_shopify_collections.py",
    "get_shopify_products.py",
    "get_shopify_collections_to_products.py",
    "upload_shops.py",
    "upload_shopify_collections.py",
    "upload_shopify_products.py",
    "upload_shopify_collections_to_products.py",
    "map_shopify_taxonomy.py",
]

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ------------------------------------------------------------------
# 2.  Helper: run a single script and abort on non-zero exit code
# ------------------------------------------------------------------
def run_script(script: str) -> None:
    """Execute script via subprocess; stream stdout/stderr in real time."""
    print(f"\n🚀  Running {script} …")
    result = subprocess.run(
        [sys.executable, script],
        cwd=Path(__file__).parent,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    if result.returncode != 0:
        print(f"❌  {script} failed with exit code {result.returncode}")
        sys.exit(result.returncode)
    print(f"✅  {script} finished successfully")


# ------------------------------------------------------------------
# 3.  Helper: incremental refresh via Supabase RPC
# ------------------------------------------------------------------
def refresh_products_with_details() -> None:
    print("\n🔄  Refreshing products_with_details …")
    try:
        resp = supabase.rpc("refresh_products_with_details_incremental").execute()
        if resp.data is None:  # returns void on success
            print("✅  products_with_details refreshed")
        else:
            print("Unexpected response:", resp.data)
    except Exception as exc:
        print("❌  refresh_products_with_details failed:", exc)
        sys.exit(1)


# ------------------------------------------------------------------
# 4.  Main orchestration
# ------------------------------------------------------------------
def main() -> None:
    for script in SCRIPTS:
        run_script(script)

    refresh_products_with_details()
    print("\n🎉  All scraping & upload steps completed.")


if __name__ == "__main__":
    main()