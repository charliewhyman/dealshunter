#!/usr/bin/env python3
"""
Main runner script for the Shopify scraper system.
"""

import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from orchestrator.main import PipelineOrchestrator
from processors.size_group_processor import SizeGroupProcessor
import processors.taxonomy_processor as taxonomy_processor
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

def run_scraping_only(args):
    """Run only scraping. Supports per-scraper flags in `args`.

    If no per-scraper flags are provided, the full scraping pipeline
    is executed (same as before).
    """
    print("\nRunning scraping only...")
    orchestrator = PipelineOrchestrator()

    # Load shops (resolves DB ids when possible)
    shops = orchestrator.load_shops()
    if not shops:
        orchestrator.logger.error("No shops to process")
        return {}

    # Support filtering by --shop-id (can be comma-separated list of ids or urls)
    if getattr(args, 'shop_id', None):
        raw_vals = [v.strip() for v in args.shop_id.split(',') if v.strip()]
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
        if not filtered:
            orchestrator.logger.error(f"No matching shops found for --shop-id={args.shop_id}")
            return {}
        shops = filtered

    # If no specific scraper flags provided, run the full scraping pipeline
    flags = [getattr(args, 'scrape_shops', False), getattr(args, 'scrape_collections', False),
             getattr(args, 'scrape_products', False), getattr(args, 'scrape_collection_products', False)]
    if not any(flags):
        return orchestrator.run_scraping_pipeline(shops)

    results = {
        'total_shops': len(shops),
        'timestamp': datetime.now().strftime('%Y%m%d_%H%M%S'),
        'steps': {}
    }

    collection_results = {}

    # Shops
    if getattr(args, 'scrape_shops', False):
        print("\nStep: Scraping shops...")
        shop_results = orchestrator.shop_scraper.scrape_multiple(shops)
        results['steps']['shops'] = {
            'shops_scraped': len(shop_results),
            'total_records': sum(len(data) for data in shop_results.values())
        }
        for shop_id, data in shop_results.items():
            if data:
                orchestrator.shop_scraper.save_results(shop_id, data, results['timestamp'])

    # Collections
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

    # Products
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

    # Collection -> Product mappings
    if getattr(args, 'scrape_collection_products', False):
        print("\nStep: Scraping collection->product mappings...")

        # Prefer using collections scraped in this run; otherwise load from processed collections files
        if collection_results:
            collections_for_mapping = {}
            for shop_id, collections in collection_results.items():
                collections_for_mapping[shop_id] = [
                    {'id': coll.get('id'), 'handle': coll.get('handle')}
                    for coll in collections
                ]
        else:
            # Load from processed collections files if available
            import json as _json
            processed_dir = settings.PROCESSED_DATA_DIR / 'collections'
            collections_for_mapping = {}
            if processed_dir.exists():
                for f in sorted(processed_dir.glob('*.json')):
                    try:
                        with open(f, 'r', encoding='utf-8') as fh:
                            arr = _json.load(fh)
                            for coll in arr:
                                sid = str(coll.get('shop_id') or coll.get('shop'))
                                if not sid:
                                    continue
                                collections_for_mapping.setdefault(sid, []).append({
                                    'id': coll.get('id'), 'handle': coll.get('handle')
                                })
                    except Exception:
                        continue

        orchestrator.collection_products_scraper.set_collections_data(collections_for_mapping)
        mapping_results = orchestrator.collection_products_scraper.scrape_multiple(shops)
        results['steps']['collection_products'] = {
            'shops_scraped': len(mapping_results),
            'total_records': sum(len(data) for data in mapping_results.values())
        }
        for shop_id, data in mapping_results.items():
            if data:
                orchestrator.collection_products_scraper.save_results(shop_id, data, results['timestamp'])

    print("\nScraping finished")
    return results

def run_upload_only(args):
    """Run only uploading."""
    print("\nRunning upload only...")
    orchestrator = PipelineOrchestrator()

    # If no per-entity upload flags provided, run full upload pipeline
    flags = [getattr(args, 'upload_shops', False), getattr(args, 'upload_collections', False),
             getattr(args, 'upload_products', False), getattr(args, 'upload_collection_products', False)]
    if not any(flags):
        return orchestrator.run_upload_pipeline()

    results = {
        'timestamp': orchestrator.timestamp,
        'steps': {}
    }

    # Helper to process only files for given shop ids when provided
    def _process_entity_for_shop(uploader, entity_name: str):
        if getattr(args, 'shop_id', None):
            shop_vals = [v.strip() for v in args.shop_id.split(',') if v.strip()]
            files = uploader.file_manager.get_raw_files(entity_name)
            # Filter filenames that start with one of the shop tokens followed by _{entity}_
            matched = [f for f in files if any(f.name.startswith(f"{token}_{entity_name}_") for token in shop_vals)]
            processed = 0
            failed = 0
            total = len(matched)
            for fp in matched:
                ok = uploader.process_file(fp)
                if ok:
                    processed += 1
                else:
                    failed += 1
            return {
                'processed': processed,
                'failed': failed,
                'total_files': total
            }
        else:
            return uploader.process_all()

    if getattr(args, 'upload_shops', False):
        print("\nStep: Uploading shops...")
        shop_results = _process_entity_for_shop(orchestrator.shop_uploader, 'shops')
        results['steps']['shops'] = shop_results

    if getattr(args, 'upload_collections', False):
        print("\nStep: Uploading collections...")
        collection_results = _process_entity_for_shop(orchestrator.collection_uploader, 'collections')
        results['steps']['collections'] = collection_results

    if getattr(args, 'upload_products', False):
        print("\nStep: Uploading products...")
        product_results = _process_entity_for_shop(orchestrator.product_uploader, 'products')
        results['steps']['products'] = product_results

    if getattr(args, 'upload_collection_products', False):
        print("\nStep: Uploading collection->product mappings...")
        mapping_results = _process_entity_for_shop(orchestrator.collection_product_uploader, 'collection_products')
        results['steps']['collection_products'] = mapping_results

    print("\nUpload finished")
    return results

def run_processing_only(args):
    """Run only processing."""
    print("\nRunning processing only...")
    orchestrator = PipelineOrchestrator()
    
    taxonomy_config = {
        'max_depth': args.max_depth if args.max_depth else settings.PROCESSOR_CONFIG['taxonomy_max_depth'],
        'min_depth': args.min_depth if args.min_depth else settings.PROCESSOR_CONFIG['taxonomy_min_depth'],
        'preferred_depth': args.preferred_depth if args.preferred_depth else settings.PROCESSOR_CONFIG['taxonomy_preferred_depth'],
        'threshold': args.threshold if args.threshold else settings.PROCESSOR_CONFIG['taxonomy_threshold'],
        'model_name': args.model if args.model else settings.PROCESSOR_CONFIG['taxonomy_model'],
        'reset': args.reset
    }
    
    # Determine whether explicit process-only flags were provided.
    explicit = getattr(args, 'process_size_groups', False) or getattr(args, 'process_taxonomy', False)

    if explicit:
        process_size_groups = getattr(args, 'process_size_groups', False)
        process_taxonomy = getattr(args, 'process_taxonomy', False)

        results = {
            'timestamp': datetime.now().strftime('%Y%m%d_%H%M%S'),
            'steps': {}
        }

        if process_size_groups:
            print("\nStep: Processing size groups...")
            size_group_processor = SizeGroupProcessor()
            size_group_results = size_group_processor.run()
            results['steps']['size_groups'] = size_group_results

        if process_taxonomy:
            print("\nStep: Processing taxonomy mapping...")
            taxonomy_results = taxonomy_processor.run_taxonomy_mapping(**taxonomy_config)
            results['steps']['taxonomy'] = taxonomy_results

        print("\nProcessing finished")
        return results

    # No explicit flags — fall back to skip flags and orchestrator behavior
    process_size_groups = not getattr(args, 'skip_size_groups', False)
    process_taxonomy = not getattr(args, 'skip_taxonomy', False)

    results = orchestrator.run_processing_pipeline(
        process_size_groups=process_size_groups,
        process_taxonomy=process_taxonomy,
        taxonomy_config=taxonomy_config if process_taxonomy else None
    )
    return results

def run_complete_pipeline(args):
    """Run complete pipeline."""
    print("\nRunning complete pipeline...")
    orchestrator = PipelineOrchestrator()
    
    taxonomy_config = {
        'max_depth': args.max_depth if args.max_depth else settings.PROCESSOR_CONFIG['taxonomy_max_depth'],
        'min_depth': args.min_depth if args.min_depth else settings.PROCESSOR_CONFIG['taxonomy_min_depth'],
        'preferred_depth': args.preferred_depth if args.preferred_depth else settings.PROCESSOR_CONFIG['taxonomy_preferred_depth'],
        'threshold': args.threshold if args.threshold else settings.PROCESSOR_CONFIG['taxonomy_threshold'],
        'model_name': args.model if args.model else settings.PROCESSOR_CONFIG['taxonomy_model'],
        'reset': args.reset
    }
    
    # Optionally load and filter shops when --shop-id is provided
    shops = None
    if getattr(args, 'shop_id', None):
        shops_all = orchestrator.load_shops()
        raw_vals = [v.strip() for v in args.shop_id.split(',') if v.strip()]
        filtered = []
        for s in shops_all:
            sid = str(s.get('id') or s.get('shop_id', '')).strip()
            url = (s.get('url') or '').strip()
            for v in raw_vals:
                if not v:
                    continue
                if v == sid or v == url:
                    filtered.append(s)
                    break
        if not filtered:
            orchestrator.logger.error(f"No matching shops found for --shop-id={args.shop_id}")
            return {}
        shops = filtered

    results = orchestrator.run_complete_pipeline(
        shops=shops,
        process_size_groups=not args.skip_size_groups,
        process_taxonomy=not args.skip_taxonomy
    )
    return results

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Shopify Scraper System - Complete pipeline for scraping, uploading, and processing Shopify data"
    )
    
    # Mode selection
    parser.add_argument("--mode", choices=["all", "scrape", "upload", "process"], 
                       default="all", help="Operation mode (default: all)")
    
    # Scraping options
    parser.add_argument("--shops-file", type=str, 
                       default=str(settings.SHOP_URLS_FILE),
                       help="Path to shops JSON file")
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
    
    # Processing options
    parser.add_argument("--skip-size-groups", action="store_true",
                       help="Skip size group processing")
    parser.add_argument("--skip-taxonomy", action="store_true",
                       help="Skip taxonomy mapping")

    # RPC helper: refresh aggregated products view/table
    parser.add_argument("--refresh-products-with-details", action="store_true",
                       help="Run only the RPC `refresh_products_with_details` and exit")
    
    # Explicit processing-only flags (used when --mode process)
    parser.add_argument("--process-size-groups", action="store_true",
                       help="Run only size group processing (ignores taxonomy unless also specified)")
    parser.add_argument("--process-taxonomy", action="store_true",
                       help="Run only taxonomy mapping (ignores size groups unless also specified)")
    
    # Taxonomy options
    parser.add_argument("--max-depth", type=int,
                       help="Maximum taxonomy depth")
    parser.add_argument("--min-depth", type=int,
                       help="Minimum taxonomy depth")
    parser.add_argument("--preferred-depth", type=int,
                       help="Preferred taxonomy depth")
    parser.add_argument("--threshold", type=float,
                       help="Similarity threshold for taxonomy matching")
    parser.add_argument("--model", type=str,
                       help="Embedding model for taxonomy matching")
    parser.add_argument("--reset", action="store_true",
                       help="Reset taxonomy progress and start from beginning")
    
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

    # If requested, run only the RPC to refresh the `products_with_details`
    # aggregated table/view and exit immediately.
    if getattr(args, 'refresh_products_with_details', False):
        print("\nRefreshing `products_with_details` via RPC...")
        try:
            sup = SupabaseClient()

            def do_refresh(client):
                return client.rpc('refresh_products_with_details').execute()

            rpc_result = sup.safe_execute(do_refresh, 'Refresh products_with_details', max_retries=3)
            if rpc_result and hasattr(rpc_result, 'data'):
                print("RPC `refresh_products_with_details` completed successfully.")
                # Save a simple result file for visibility in DATA_DIR
                try:
                    out = settings.DATA_DIR / f"rpc_refresh_products_with_details_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                    with open(out, 'w', encoding='utf-8') as fh:
                        json.dump({'status': 'success', 'data': getattr(rpc_result, 'data')}, fh, indent=2, ensure_ascii=False)
                    print(f"Result saved to: {out}")
                except Exception:
                    pass
                sys.exit(0)
            else:
                print("RPC `refresh_products_with_details` failed or returned unexpected result. Check logs.")
                sys.exit(1)
        except Exception as e:
            print(f"Error calling RPC: {e}")
            sys.exit(1)
    
    # Run based on mode
    if args.mode == "scrape":
        results = run_scraping_only(args)
    elif args.mode == "upload":
        results = run_upload_only(args)
    elif args.mode == "process":
        results = run_processing_only(args)
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

if __name__ == "__main__":
    sys.exit(main())