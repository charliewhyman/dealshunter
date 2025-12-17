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
from processors.taxonomy_processor import run_taxonomy_mapping
import config.settings as settings

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
            from pathlib import Path
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
    results = orchestrator.run_upload_pipeline()
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
    
    results = orchestrator.run_processing_pipeline(
        process_size_groups=not args.skip_size_groups,
        process_taxonomy=not args.skip_taxonomy,
        taxonomy_config=taxonomy_config if not args.skip_taxonomy else None
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
    
    results = orchestrator.run_complete_pipeline(
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
    
    # Processing options
    parser.add_argument("--skip-size-groups", action="store_true",
                       help="Skip size group processing")
    parser.add_argument("--skip-taxonomy", action="store_true",
                       help="Skip taxonomy mapping")
    
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