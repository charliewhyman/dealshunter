#!/usr/bin/env python3
"""
Main runner script for the Shopify scraper system.
"""

import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, timedelta

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from orchestrator.main import PipelineOrchestrator
import config.settings as settings
from uploader.supabase_client import SupabaseClient

def setup_environment():
    """Setup environment and logging."""
    # Create necessary directories
    for directory in [settings.DATA_DIR, settings.LOG_DIR, settings.CACHE_DIR]:
        directory.mkdir(exist_ok=True, parents=True)
    
    print(f"\n{'='*60}")
    print("SHOPIFY SCRAPER SYSTEM")
    print(f"{'='*60}")

def filter_shops_needing_update(shops, days_threshold=7):
    """Filter shops that haven't been scraped recently.
    
    Args:
        shops: List of shop dictionaries
        days_threshold: Only return shops older than this many days
        
    Returns:
        List of shops that need updating
    """
    cutoff = datetime.now() - timedelta(days=days_threshold)
    shops_to_update = []
    
    for shop in shops:
        # Check various possible timestamp fields
        last_scraped = (shop.get('last_scraped_at') or 
                       shop.get('updated_at') or 
                       shop.get('last_updated'))
        
        if not last_scraped:
            # No timestamp found, needs scraping
            shops_to_update.append(shop)
        else:
            try:
                # Handle ISO format timestamps
                last_dt = datetime.fromisoformat(last_scraped.replace('Z', '+00:00'))
                if last_dt < cutoff:
                    shops_to_update.append(shop)
                else:
                    shop_id = shop.get('id') or shop.get('url', 'unknown')
                    print(f"  Skipping shop {shop_id} (last scraped: {last_scraped})")
            except (ValueError, AttributeError):
                # Invalid timestamp, include for scraping
                shops_to_update.append(shop)
    
    return shops_to_update

def filter_shops_by_id(shops, shop_id_filter):
    """Filter shops by ID or URL."""
    if not shop_id_filter:
        return shops
    
    raw_vals = [v.strip() for v in shop_id_filter.split(',') if v.strip()]
    filtered = []
    
    for s in shops:
        sid = str(s.get('id') or s.get('shop_id', '')).strip()
        url = (s.get('url') or '').strip()
        
        for v in raw_vals:
            if not v:
                continue
            if v == sid or v == url:
                filtered.append(s)
                break
    
    return filtered

def run_scraping_only(args):
    """Run only scraping with the updated orchestrator."""
    print("\nRunning scraping only...")
    
    # Create orchestrator with proper concurrency settings
    orchestrator = PipelineOrchestrator(
        max_concurrent_shops=args.max_concurrent,
        batch_size=args.batch_size
    )
    
    # Set full product scrape mode if requested
    if getattr(args, 'full_product_scrape', False):
        orchestrator.set_full_product_scrape(True)
        print("🔄 FULL product scrape mode enabled")
    
    # Load shops
    shops = orchestrator.load_shops()
    if not shops:
        orchestrator.logger.error("No shops to process")
        return {}
    
    # Filter shops if needed
    if getattr(args, 'shop_id', None):
        shops = filter_shops_by_id(shops, args.shop_id)
        if not shops:
            orchestrator.logger.error(f"No matching shops found for --shop-id={args.shop_id}")
            return {}
    
    # Check if any specific scraper flags are provided
    flags = [getattr(args, 'scrape_shops', False), 
             getattr(args, 'scrape_collections', False),
             getattr(args, 'scrape_products', False), 
             getattr(args, 'scrape_collection_products', False)]
    
    skip_shops = getattr(args, 'skip_shops', False)
    
    # If no specific flags, run full scraping pipeline
    if not any(flags) and not skip_shops:
        return orchestrator.run_scraping_pipeline(
            shops=shops,
            skip_shops=skip_shops,
            shop_update_days=getattr(args, 'shop_update_days', None),
            full_product_scrape=getattr(args, 'full_product_scrape', False)
        )
    
    # Handle individual scraper modes
    results = {
        'total_shops': len(shops),
        'timestamp': datetime.now().strftime('%Y%m%d_%H%M%S'),
        'steps': {}
    }
    
    collection_results = {}
    
    # Shops scraper
    if getattr(args, 'scrape_shops', False) or (not any(flags) and not skip_shops):
        shop_update_days = getattr(args, 'shop_update_days', None)
        
        if shop_update_days is not None and shop_update_days > 0:
            print(f"\nFiltering shops: only scraping those older than {shop_update_days} days...")
            shops_to_scrape = filter_shops_needing_update(shops, days_threshold=shop_update_days)
            print(f"Found {len(shops_to_scrape)} shops needing update (out of {len(shops)} total)")
        else:
            shops_to_scrape = shops
        
        if shops_to_scrape:
            print(f"\nStep: Scraping {len(shops_to_scrape)} shops...")
            shop_results = orchestrator.shop_scraper.scrape_multiple(shops_to_scrape)
            results['steps']['shops'] = {
                'shops_scraped': len(shop_results),
                'shops_skipped': len(shops) - len(shops_to_scrape),
                'total_records': sum(len(data) for data in shop_results.values())
            }
            for shop_id, data in shop_results.items():
                if data:
                    orchestrator.shop_scraper.save_results(shop_id, data, results['timestamp'])
        else:
            print("\nStep: All shops recently updated, skipping shop scraping")
            results['steps']['shops'] = {
                'shops_scraped': 0,
                'shops_skipped': len(shops),
                'total_records': 0
            }
    
    # Collections scraper
    if getattr(args, 'scrape_collections', False):
        print("\nStep: Scraping collections...")
        collection_results = orchestrator.collection_scraper.scrape_multiple(shops)
        results['steps']['collections'] = {
            'shops_scraped': len(collection_results),
            'total_records': sum(len(data) for data in collection_results.values())
        }
        for shop_id, data in collection_results.items():
            if data:
                orchestrator.collection_scraper.save_results(shop_id, data, results['timestamp'])
    
    # Products scraper
    if getattr(args, 'scrape_products', False):
        print("\nStep: Scraping products...")
        product_results = orchestrator.product_scraper.scrape_multiple(shops)
        results['steps']['products'] = {
            'shops_scraped': len(product_results),
            'total_records': sum(len(data) for data in product_results.values())
        }
        for shop_id, data in product_results.items():
            if data:
                orchestrator.product_scraper.save_results(shop_id, data, results['timestamp'])
    
    # Collection-products scraper
    if getattr(args, 'scrape_collection_products', False):
        print("\nStep: Scraping collection->product mappings...")
        
        # Get collections for mapping
        if not collection_results:
            # Try to load from existing collection results
            collection_results = {}
            processed_dir = settings.PROCESSED_DATA_DIR / 'collections'
            if processed_dir.exists():
                import json as _json
                for f in sorted(processed_dir.glob('*.json')):
                    try:
                        with open(f, 'r', encoding='utf-8') as fh:
                            arr = _json.load(fh)
                            for coll in arr:
                                sid = str(coll.get('shop_id') or coll.get('shop'))
                                if not sid:
                                    continue
                                collection_results.setdefault(sid, []).append(coll)
                    except Exception:
                        continue
        
        if collection_results:
            collections_for_mapping = {}
            for shop_id, collections in collection_results.items():
                if shop_id in [str(s.get('id') or s.get('url', '')) for s in shops]:
                    collections_for_mapping[shop_id] = [
                        {'id': coll.get('id'), 'handle': coll.get('handle')}
                        for coll in collections
                    ]
            
            orchestrator.collection_products_scraper.set_collections_data(collections_for_mapping)
            mapping_results = orchestrator.collection_products_scraper.scrape_multiple(shops)
            results['steps']['collection_products'] = {
                'shops_scraped': len(mapping_results),
                'total_records': sum(len(data) for data in mapping_results.values())
            }
            for shop_id, data in mapping_results.items():
                if data:
                    orchestrator.collection_products_scraper.save_results(shop_id, data, results['timestamp'])
        else:
            print("  No collections data available for mapping")
            results['steps']['collection_products'] = {
                'shops_scraped': 0,
                'total_records': 0
            }
    
    print("\nScraping finished")
    return results

def run_upload_only(args):
    """Run only uploading."""
    print("\nRunning upload only...")
    
    # Create orchestrator
    orchestrator = PipelineOrchestrator()
    
    # Check if per-entity upload flags are provided
    flags = [getattr(args, 'upload_shops', False), 
             getattr(args, 'upload_collections', False),
             getattr(args, 'upload_products', False), 
             getattr(args, 'upload_collection_products', False)]
    
    # If no specific flags, run full upload pipeline
    if not any(flags):
        return orchestrator.run_upload_pipeline()
    
    # Handle individual upload modes
    results = {
        'timestamp': datetime.now().strftime('%Y%m%d_%H%M%S'),
        'steps': {}
    }
    
    # Shops uploader
    if getattr(args, 'upload_shops', False):
        print("\nStep: Uploading shops...")
        shop_results = orchestrator.shop_uploader.process_all()
        results['steps']['shops'] = shop_results
    
    # Collections uploader
    if getattr(args, 'upload_collections', False):
        print("\nStep: Uploading collections...")
        collection_results = orchestrator.collection_uploader.process_all()
        results['steps']['collections'] = collection_results
    
    # Products uploader
    if getattr(args, 'upload_products', False):
        print("\nStep: Uploading products...")
        product_results = orchestrator.product_uploader.process_all()
        results['steps']['products'] = product_results
    
    # Collection-products uploader
    if getattr(args, 'upload_collection_products', False):
        print("\nStep: Uploading collection->product mappings...")
        mapping_results = orchestrator.collection_product_uploader.process_all()
        results['steps']['collection_products'] = mapping_results
    
    print("\nUpload finished")
    return results

def run_complete_pipeline(args):
    """Run complete pipeline with smart shop updating."""
    print("\nRunning complete pipeline...")
    
    # Determine concurrency based on arguments
    max_concurrent = args.max_concurrent
    batch_size = args.batch_size
    
    orchestrator = PipelineOrchestrator(
        max_concurrent_shops=max_concurrent,
        batch_size=batch_size
    )
    
    # Set full product scrape mode if requested
    if getattr(args, 'full_product_scrape', False):
        orchestrator.set_full_product_scrape(True)
        print("🔄 FULL product scrape mode enabled")
    
    # Load and filter shops if needed
    shops = orchestrator.load_shops()
    if not shops:
        orchestrator.logger.error("No shops to process")
        return {}
    
    if getattr(args, 'shop_id', None):
        shops = filter_shops_by_id(shops, args.shop_id)
        if not shops:
            orchestrator.logger.error(f"No matching shops found for --shop-id={args.shop_id}")
            return {}
    
    # Run complete pipeline with filtering options
    skip_shops = getattr(args, 'skip_shops', False)
    shop_update_days = getattr(args, 'shop_update_days', None)
    
    results = orchestrator.run_complete_pipeline(
        shops=shops,
        skip_shops=skip_shops,
        shop_update_days=shop_update_days,
        full_product_scrape=getattr(args, 'full_product_scrape', False)
    )
    
    print("\nComplete pipeline finished")
    return results

def setup_database_structure(args):
    """Set up the new database structure and populate initial data."""
    print("\nSetting up new database structure...")
    try:
        sup = SupabaseClient()
        
        def do_setup(client):
            return client.rpc('populate_initial_data').execute()
        
        rpc_result = sup.safe_execute(do_setup, 'Setup database structure', max_retries=3)
        
        if rpc_result and hasattr(rpc_result, 'data'):
            print("Database structure setup complete")
            # Save result file
            out = settings.DATA_DIR / f"setup_database_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(out, 'w', encoding='utf-8') as fh:
                json.dump({'status': 'success', 'data': rpc_result.data}, fh, indent=2, ensure_ascii=False)
            print(f"Setup result saved to: {out}")
            return True
        else:
            print("Failed to setup database structure")
            return False
            
    except Exception as e:
        print(f"Error setting up database: {e}")
        return False

def run_database_refresh(args):
    """Run database refresh RPC (Kept for backward compatibility but will not be called)."""
    print(f"\n⚠️  Database refresh via RPC is deprecated. Products are uploaded directly to products_with_details_core.")
    print("  No refresh needed. Continuing...")
    return True

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Shopify Scraper System - Complete pipeline for scraping, uploading, and processing Shopify data"
    )
    
    # Mode selection
    parser.add_argument("--mode", choices=["all", "scrape", "upload", "process", "db"], 
                       default="all", help="Operation mode (default: all). Use with --full-product-scrape for initial data collection")
    
    # Scraping options
    parser.add_argument("--shops-file", type=str, 
                       default=str(settings.SHOP_URLS_FILE),
                       help="Path to shops JSON file")
    
    # Smart shop scraping options
    parser.add_argument("--skip-shops", action="store_true",
                       help="Skip scraping shop data (only scrape products/collections)")
    parser.add_argument("--shop-update-days", type=int, default=None,
                       help="Only re-scrape shops older than N days (e.g., 7 for weekly shop updates)")
    
    # Full product scrape option - ADD THIS NEW ARGUMENT
    parser.add_argument("--full-product-scrape", action="store_true",
                       help="Force full product scrape (get ALL products, not just changed ones). Use for initial data collection.")
    
    # Per-scraper flags (used when --mode scrape)
    parser.add_argument("--scrape-shops", action="store_true",
                       help="Run only the shops scraper")
    parser.add_argument("--scrape-collections", action="store_true",
                       help="Run only the collections scraper")
    parser.add_argument("--scrape-products", action="store_true",
                       help="Run only the products scraper")
    parser.add_argument("--scrape-collection-products", action="store_true",
                       help="Run only the collection->product mapping scraper")

    # Optional shop filter (single id or comma-separated list). Matches shop `id` or `url`.
    parser.add_argument("--shop-id", type=str,
                       help="Comma-separated shop id(s) or shop url(s) to limit operations to specific shop(s)")
    
    # Per-entity upload flags (used when --mode upload)
    parser.add_argument("--upload-shops", action="store_true",
                       help="Upload only shops to the target (skip other entities)")
    parser.add_argument("--upload-collections", action="store_true",
                       help="Upload only collections to the target (skip other entities)")
    parser.add_argument("--upload-products", action="store_true",
                       help="Upload only products to the target (skip other entities)")
    parser.add_argument("--upload-collection-products", action="store_true",
                       help="Upload only collection->product mappings to the target")

    # Database operations (kept for backward compatibility but won't be used)
    parser.add_argument("--setup-db", action="store_true",
                       help="Set up new database structure (run once after migration)")
    parser.add_argument("--refresh-core", action="store_true",
                       help="Refresh core product data (deprecated - products uploaded directly)")
    parser.add_argument("--refresh-full", action="store_true",
                       help="Refresh full product data (deprecated - products uploaded directly)")
    
    # Concurrency options
    parser.add_argument("--max-concurrent", type=int, default=3,
                       help="Maximum concurrent shops to scrape (default: 3)")
    parser.add_argument("--batch-size", type=int, default=5,
                       help="Batch size for processing shops (default: 5)")
    
    # Other options
    parser.add_argument("--output-dir", type=str,
                       default=str(settings.DATA_DIR),
                       help="Output directory for data")
    
    args = parser.parse_args()
    
    # Update settings if specified
    if args.shops_file:
        settings.SHOP_URLS_FILE = Path(args.shops_file)
    
    if args.output_dir:
        settings.DATA_DIR = Path(args.output_dir)
        settings.RAW_DATA_DIR = settings.DATA_DIR / "raw"
        settings.PROCESSED_DATA_DIR = settings.DATA_DIR / "processed"
        settings.ARCHIVE_DIR = settings.DATA_DIR / "archive"
    
    # Setup environment
    setup_environment()

    # Database setup mode
    if getattr(args, 'setup_db', False):
        success = setup_database_structure(args)
        sys.exit(0 if success else 1)
    
    # Database refresh mode (deprecated - show warning but don't run)
    if getattr(args, 'refresh_core', False) or getattr(args, 'refresh_full', False):
        print("\n⚠️  WARNING: --refresh-core and --refresh-full are deprecated.")
        print("  Products are now uploaded directly to products_with_details_core.")
        print("  No RPC refresh is needed or recommended.")
        sys.exit(0)
    
    # Run based on mode
    try:
        if args.mode == "scrape":
            results = run_scraping_only(args)
        elif args.mode == "upload":
            results = run_upload_only(args)
        elif args.mode == "db":
            print("Database operations:")
            print("  --setup-db      : Set up new database structure (run once)")
            print("\n⚠️  Note: --refresh-core and --refresh-full are deprecated")
            print("  Products are uploaded directly to products_with_details_core")
            sys.exit(0)
        else:  # all
            results = run_complete_pipeline(args)
        
        # Save results
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        results_file = settings.DATA_DIR / f"run_results_{timestamp}.json"
        
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        print(f"\nResults saved to: {results_file}")
        print(f"\n{'='*60}")
        print("PROCESS COMPLETE")
        print(f"{'='*60}")
        
        return 0
        
    except KeyboardInterrupt:
        print("\n\nProcess interrupted by user")
        return 130
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())