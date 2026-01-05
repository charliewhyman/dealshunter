"""
Main orchestrator for the entire system with scrapers.
"""

import json
from datetime import datetime
from typing import Dict, Any, List, Optional
import time
import os
import sys

# Add parent directory to path to import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.shop_scraper import ShopScraper
from scrapers.collection_scraper import CollectionScraper
from scrapers.product_scraper import ProductScraper
from scrapers.collection_products_scraper import CollectionProductsScraper

from uploader.shop_uploader import ShopUploader
from uploader.collection_uploader import CollectionUploader
from uploader.product_uploader import ProductUploader
from uploader.collection_product_uploader import CollectionProductUploader

from core.logger import scraper_logger, uploader_logger
import config.settings as settings
from uploader.supabase_client import SupabaseClient
from core.state_manager import StateManager


class PipelineOrchestrator:
    """Orchestrates the complete scraping and upload pipeline with optimization."""
    
    def __init__(self, max_concurrent_shops: int = 3, batch_size: int = 5):
        self.logger = scraper_logger
        self.timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        self.max_concurrent_shops = max_concurrent_shops
        self.batch_size = batch_size
        
        # Initialize state manager
        self.state_manager = StateManager()
        
        # Initialize scrapers
        self.shop_scraper = ShopScraper()
        self.collection_scraper = CollectionScraper()
        self.product_scraper = ProductScraper()
        self.collection_products_scraper = CollectionProductsScraper()
        
        # Initialize uploaders
        self.shop_uploader = ShopUploader()
        self.collection_uploader = CollectionUploader()
        self.product_uploader = ProductUploader()
        self.collection_product_uploader = CollectionProductUploader()
        
        # Results storage
        self.results = {
            'scraping': {},
            'uploading': {},
        }
        
        # Statistics
        self.total_api_calls_saved = 0
        self.total_shops_skipped = 0
    
    def load_shops(self) -> List[Dict[str, Any]]:
        """Load shops from configuration."""
        try:
            with open(settings.SHOP_URLS_FILE, 'r', encoding='utf-8') as f:
                shops = json.load(f)
            
            if not isinstance(shops, list):
                self.logger.error("Shop URLs file must contain a list")
                return []
            
            self.logger.info(f"Loaded {len(shops)} shops from configuration")

            # Resolve database IDs for configured shop URLs
            try:
                urls = [s.get('url') for s in shops if s.get('url')]
                if urls:
                    def do_select(client):
                        return client.table('shops').select('id,url').in_('url', urls).execute()

                    sup = SupabaseClient()
                    result = sup.safe_execute(do_select, 'Fetch shop ids by url', max_retries=3)
                    url_to_id = {}
                    if result and hasattr(result, 'data'):
                        for row in result.data:
                            url_to_id[row.get('url')] = row.get('id')

                    resolved = 0
                    for shop in shops:
                        url = shop.get('url')
                        if url and url in url_to_id and url_to_id[url] is not None:
                            shop['id'] = url_to_id[url]
                            resolved += 1

                    self.logger.info(f"Resolved {resolved}/{len(urls)} shop ids from DB")
                else:
                    self.logger.debug('No shop urls found to resolve')
            except Exception as e:
                self.logger.warning(f"Failed to resolve shop ids from DB: {e}")

            return shops
            
        except Exception as e:
            self.logger.error(f"Failed to load shops: {e}")
            return []
    
    def _get_shops_needing_scrape(self, shops: List[Dict[str, Any]], 
                                  data_type: str, hours_threshold: int) -> List[Dict[str, Any]]:
        """Filter shops that need scraping for a specific data type."""
        shops_needed = []
        
        for shop in shops:
            shop_id = shop.get('id')
            if not shop_id:
                shops_needed.append(shop)
                continue
            
            # Check if we should skip this shop for this data type
            if self.state_manager.should_skip_data_type(shop_id, data_type, hours_threshold):
                self.total_shops_skipped += 1
                self.logger.debug(f"Skipping {data_type} for {shop_id} - scraped recently")
            else:
                shops_needed.append(shop)
        
        self.logger.info(
            f"Filtered shops for {data_type}: {len(shops_needed)}/{len(shops)} need scraping"
        )
        return shops_needed
    
    def _scrape_with_optimization(self, scraper, shops: List[Dict[str, Any]], 
                                  scraper_name: str, hours_threshold: int) -> Dict[str, Any]:
        """Scrape with optimization based on state."""
        if not shops:
            return {}
        
        # Filter shops that actually need scraping
        shops_to_scrape = self._get_shops_needing_scrape(shops, scraper_name.lower(), hours_threshold)
        
        if not shops_to_scrape:
            self.logger.info(f"No shops need {scraper_name} scraping (all scraped recently)")
            return {}
        
        self.logger.info(f"Starting {scraper_name} scrape for {len(shops_to_scrape)} shops")
        start_time = time.time()
        
        # Use the scraper's own scrape_multiple method
        results = scraper.scrape_multiple(shops_to_scrape)
        
        elapsed = time.time() - start_time
        shops_scraped = len(results)
        
        # Calculate API calls saved (estimate)
        api_calls_saved = len(shops) - len(shops_to_scrape)
        self.total_api_calls_saved += api_calls_saved
        
        self.logger.info(
            f"Completed {scraper_name}: {shops_scraped}/{len(shops_to_scrape)} shops, "
            f"{api_calls_saved} API calls saved, "
            f"time: {elapsed/60:.1f} minutes"
        )
        
        return results
    
    def run_scraping_pipeline(self, shops: Optional[List[Dict[str, Any]]] = None,
                             skip_shops: bool = False,
                             shop_update_days: Optional[int] = None) -> Dict[str, Any]:
        """Run the scraping pipeline."""
        self.logger.info("\n" + "="*60)
        self.logger.info("STARTING SCRAPING PIPELINE")
        self.logger.info(f"Max concurrent shops: {self.max_concurrent_shops}")
        self.logger.info(f"Batch size: {self.batch_size}")
        self.logger.info("="*60)
        
        if shops is None:
            shops = self.load_shops()
        
        if not shops:
            self.logger.error("No shops to process")
            return {}
        
        # Reset statistics
        self.total_api_calls_saved = 0
        self.total_shops_skipped = 0
        
        self.results['scraping'] = {
            'total_shops': len(shops),
            'timestamp': self.timestamp,
            'max_concurrent_shops': self.max_concurrent_shops,
            'batch_size': self.batch_size,
            'skip_shops': skip_shops,
            'shop_update_days': shop_update_days,
            'steps': {}
        }
        
        # Process shops in batches
        all_shop_results = {}
        all_collection_results = {}
        all_product_results = {}
        all_mapping_results = {}
        
        total_batches = (len(shops) - 1) // self.batch_size + 1
        
        for batch_num, batch_start in enumerate(range(0, len(shops), self.batch_size), 1):
            batch = shops[batch_start:batch_start + self.batch_size]
            
            self.logger.info(f"\nProcessing batch {batch_num}/{total_batches} ({len(batch)} shops)")
            batch_start_time = time.time()
            
            # Step 1: Scrape shops (if not skipped) - shops are always scraped
            if not skip_shops:
                self.logger.info("Scraping shop information...")
                shop_results = self.shop_scraper.scrape_multiple(batch)
                all_shop_results.update(shop_results)
                
                for shop_id, data in shop_results.items():
                    if data:
                        self.shop_scraper.save_results(shop_id, data, self.timestamp)
            
            # Step 2: Scrape collections
            self.logger.info("Scraping collections...")
            collection_results = self._scrape_with_optimization(
                self.collection_scraper, batch, "Collections", hours_threshold=168  # 7 days
            )
            all_collection_results.update(collection_results)
            
            for shop_id, data in collection_results.items():
                if data:
                    self.collection_scraper.save_results(shop_id, data, self.timestamp)
            
            # Step 3: Scrape products
            self.logger.info("Scraping products")
            product_results = self._scrape_with_optimization(
                self.product_scraper, batch, "Products", hours_threshold=6  # 6 hours
            )
            all_product_results.update(product_results)
            
            for shop_id, data in product_results.items():
                if data:
                    self.product_scraper.save_results(shop_id, data, self.timestamp)
            
            # Step 4: Scrape collection-product mappings
            self.logger.info("Scraping collection-product mappings...")
            
            # Prepare collections data for mapping scraper
            collections_for_mapping = {}
            for shop_id, collections in collection_results.items():
                if collections:  # Only include shops that have collections
                    collections_for_mapping[shop_id] = [
                        {
                            'id': coll.get('id'),
                            'handle': coll.get('handle'),
                            'products_count': coll.get('products_count'),
                            'title': coll.get('title'),
                            'updated_at': coll.get('updated_at')
                        }
                        for coll in collections
                    ]
            
            self.collection_products_scraper.set_collections_data(collections_for_mapping)
            
            # Scrape mappings with optimization
            mapping_results = self._scrape_with_optimization(
                self.collection_products_scraper, batch, "Collection-Products", hours_threshold=336  # 14 days
            )
            all_mapping_results.update(mapping_results)
            
            for shop_id, data in mapping_results.items():
                if data:
                    self.collection_products_scraper.save_results(shop_id, data, self.timestamp)
            
            # Log batch completion
            batch_time = time.time() - batch_start_time
            self.logger.info(f"Batch {batch_num} completed in {batch_time/60:.1f} minutes")
        
        # Update results with optimization statistics
        if not skip_shops:
            self.results['scraping']['steps']['shops'] = {
                'shops_scraped': len(all_shop_results),
                'total_records': sum(len(data) for data in all_shop_results.values()),
                'optimization': 'none (always scrape shops)'
            }
        
        self.results['scraping']['steps']['collections'] = {
            'shops_scraped': len(all_collection_results),
            'total_records': sum(len(data) for data in all_collection_results.values()),
            'shops_skipped': len(shops) - len(all_collection_results),
            'optimization': 'skip if scraped in last 7 days'
        }
        
        self.results['scraping']['steps']['products'] = {
            'shops_scraped': len(all_product_results),
            'total_records': sum(len(data) for data in all_product_results.values()),
            'shops_skipped': len(shops) - len(all_product_results),
            'optimization': 'skip if scraped in last 6 hours, only fetch changed products'
        }
        
        self.results['scraping']['steps']['collection_products'] = {
            'shops_scraped': len(all_mapping_results),
            'total_records': sum(len(data) for data in all_mapping_results.values()),
            'shops_skipped': len(shops) - len(all_mapping_results),
            'optimization': 'skip if scraped in last 14 days, only scrape meaningful collections'
        }
        
        # Add optimization summary
        self.results['scraping']['optimization_summary'] = {
            'total_api_calls_saved': self.total_api_calls_saved,
            'total_shops_skipped': self.total_shops_skipped,
            'estimated_time_saved_percent': int((self.total_api_calls_saved / len(shops)) * 100) if shops else 0
        }
        
        self.logger.info("\n" + "="*60)
        self.logger.info("OPTIMIZATION SUMMARY")
        self.logger.info(f"Total API calls saved: {self.total_api_calls_saved}")
        self.logger.info(f"Total shops skipped: {self.total_shops_skipped}")
        self.logger.info(f"Estimated time saved: {self.results['scraping']['optimization_summary']['estimated_time_saved_percent']}%")
        self.logger.info("="*60)
        self.logger.info("SCRAPING PIPELINE COMPLETE")
        self.logger.info("="*60)
        
        return self.results['scraping']
    
    def run_upload_pipeline(self) -> Dict[str, Any]:
        """Run the complete upload pipeline."""
        uploader_logger.info("\n" + "="*60)
        uploader_logger.info("STARTING UPLOAD PIPELINE")
        uploader_logger.info("="*60)
        
        self.results['uploading'] = {
            'timestamp': self.timestamp,
            'steps': {}
        }
        
        # Step 1: Upload shops
        uploader_logger.info("\nStep 1: Uploading shops...")
        shop_upload_results = self.shop_uploader.process_all()
        self.results['uploading']['steps']['shops'] = shop_upload_results
        
        # Step 2: Upload collections
        uploader_logger.info("\nStep 2: Uploading collections...")
        collection_upload_results = self.collection_uploader.process_all()
        self.results['uploading']['steps']['collections'] = collection_upload_results
        
        # Step 3: Upload products (with related data)
        uploader_logger.info("\nStep 3: Uploading products...")
        product_upload_results = self.product_uploader.process_all()
        self.results['uploading']['steps']['products'] = product_upload_results
        
        # Step 4: Upload collection-product mappings
        uploader_logger.info("\nStep 4: Uploading collection-product mappings...")
        mapping_upload_results = self.collection_product_uploader.process_all()
        self.results['uploading']['steps']['collection_products'] = mapping_upload_results
        
        # After uploading all entity data, refresh the products_with_details
        try:
            def do_refresh(client):
                return client.rpc('refresh_products_core').execute()

            sup = SupabaseClient()
            rpc_result = sup.safe_execute(do_refresh, 'Refresh products core data', max_retries=3)
            if rpc_result and hasattr(rpc_result, 'data'):
                uploader_logger.info('Called RPC `refresh_products_core` successfully')
            else:
                uploader_logger.warning('RPC `refresh_products_core` did not return expected data or failed')
        except Exception as e:
            uploader_logger.error(f'Error calling RPC refresh_products_core: {e}')

        uploader_logger.info("\n" + "="*60)
        uploader_logger.info("UPLOAD PIPELINE COMPLETE")
        uploader_logger.info("="*60)
        
        return self.results['uploading']
    
    def run_complete_pipeline(self, shops: Optional[List[Dict[str, Any]]] = None,
                             skip_shops: bool = False,
                             shop_update_days: Optional[int] = None) -> Dict[str, Any]:
        """Run the complete end-to-end pipeline."""
        self.logger.info("\n" + "="*60)
        self.logger.info("STARTING COMPLETE PIPELINE")
        self.logger.info("="*60)
        
        # Scraping phase
        scraping_results = self.run_scraping_pipeline(
            shops=shops,
            skip_shops=skip_shops,
            shop_update_days=shop_update_days
        )
        
        # Uploading phase
        upload_results = self.run_upload_pipeline()
        
        # Generate summary with optimization info
        self._generate_summary()
        
        self.logger.info("\n" + "="*60)
        self.logger.info("PIPELINE COMPLETE")
        self.logger.info("="*60)
        
        return {
            'scraping': scraping_results,
            'uploading': upload_results,
            'timestamp': self.timestamp,
        }
    
    def _generate_summary(self):
        """Generate and save summary report."""
        summary = {
            'overview': {
                'timestamp': self.timestamp,
                'max_concurrent_shops': self.max_concurrent_shops,
                'batch_size': self.batch_size,
                'optimization_enabled': True,
            },
            'scraping': self.results.get('scraping', {}),
            'uploading': self.results.get('uploading', {}),
            'optimization_benefits': {
                'products': 'Skip shops scraped in last 6 hours, only fetch changed products',
                'collections': 'Skip shops scraped in last 7 days',
                'collection_products': 'Skip shops scraped in last 14 days, only meaningful collections',
                'estimated_api_reduction': '70-90% after first run',
                'estimated_time_reduction': '60-80% for daily runs'
            }
        }
        
        # Save summary to file
        summary_file = settings.DATA_DIR / f"optimized_pipeline_summary_{self.timestamp}.json"
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        
        self.logger.info(f"Summary saved to: {summary_file}")


def main():
    """Main entry point."""
    orchestrator = PipelineOrchestrator()
    
    # Run complete pipeline
    results = orchestrator.run_complete_pipeline()
    
    return results


if __name__ == "__main__":
    main()