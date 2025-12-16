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
    """Run only scraping."""
    print("\nRunning scraping only...")
    orchestrator = PipelineOrchestrator()
    results = orchestrator.run_scraping_pipeline()
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