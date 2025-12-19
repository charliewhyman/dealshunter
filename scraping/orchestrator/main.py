"""
Main orchestrator for the entire system.
"""

import json
from datetime import datetime
from typing import Dict, Any, List, Optional

from scrapers.shop_scraper import ShopScraper
from scrapers.collection_scraper import CollectionScraper
from scrapers.product_scraper import ProductScraper
from scrapers.collection_products_scraper import CollectionProductsScraper

from uploader.shop_uploader import ShopUploader
from uploader.collection_uploader import CollectionUploader
from uploader.product_uploader import ProductUploader
from uploader.collection_product_uploader import CollectionProductUploader

from processors.size_group_processor import SizeGroupProcessor
from processors.taxonomy_processor import run_taxonomy_mapping

from core.logger import scraper_logger, uploader_logger, processor_logger
import config.settings as settings
from uploader.supabase_client import SupabaseClient

class PipelineOrchestrator:
    """Orchestrates the complete scraping and upload pipeline."""
    
    def __init__(self):
        self.logger = scraper_logger
        self.timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
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
            'processing': {}
        }
    
    def load_shops(self) -> List[Dict[str, Any]]:
        """Load shops from configuration."""
        try:
            with open(settings.SHOP_URLS_FILE, 'r', encoding='utf-8') as f:
                shops = json.load(f)
            
            if not isinstance(shops, list):
                self.logger.error("Shop URLs file must contain a list")
                return []
            
            self.logger.info(f"Loaded {len(shops)} shops from configuration")

            # Resolve database IDs for configured shop URLs so scrapers and
            # uploaders can consistently use the DB-generated `shops.id`.
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
    
    def run_scraping_pipeline(self, shops: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Run the complete scraping pipeline."""
        self.logger.info("\n" + "="*60)
        self.logger.info("STARTING SCRAPING PIPELINE")
        self.logger.info("="*60)
        
        if shops is None:
            shops = self.load_shops()
        
        if not shops:
            self.logger.error("No shops to process")
            return {}
        
        self.results['scraping'] = {
            'total_shops': len(shops),
            'timestamp': self.timestamp,
            'steps': {}
        }
        
        # Step 1: Scrape shops
        self.logger.info("\nStep 1: Scraping shop information...")
        shop_results = self.shop_scraper.scrape_multiple(shops)
        self.results['scraping']['steps']['shops'] = {
            'shops_scraped': len(shop_results),
            'total_records': sum(len(data) for data in shop_results.values())
        }
        
        # Save shop results
        for shop_id, data in shop_results.items():
            if data:
                self.shop_scraper.save_results(shop_id, data, self.timestamp)
        
        # Step 2: Scrape collections
        self.logger.info("\nStep 2: Scraping collections...")
        collection_results = self.collection_scraper.scrape_multiple(shops)
        self.results['scraping']['steps']['collections'] = {
            'shops_scraped': len(collection_results),
            'total_records': sum(len(data) for data in collection_results.values())
        }
        
        # Save collection results
        for shop_id, data in collection_results.items():
            if data:
                self.collection_scraper.save_results(shop_id, data, self.timestamp)
        
        # Step 3: Scrape products
        self.logger.info("\nStep 3: Scraping products...")
        product_results = self.product_scraper.scrape_multiple(shops)
        self.results['scraping']['steps']['products'] = {
            'shops_scraped': len(product_results),
            'total_records': sum(len(data) for data in product_results.values())
        }
        
        # Save product results
        for shop_id, data in product_results.items():
            if data:
                self.product_scraper.save_results(shop_id, data, self.timestamp)
        
        # Step 4: Scrape collection-product mappings
        self.logger.info("\nStep 4: Scraping collection-product mappings...")
        
        # Convert collections data for mapping scraper
        collections_for_mapping = {}
        for shop_id, collections in collection_results.items():
            collections_for_mapping[shop_id] = [
                {
                    'id': coll.get('id'),
                    'handle': coll.get('handle')
                }
                for coll in collections
            ]
        
        self.collection_products_scraper.set_collections_data(collections_for_mapping)
        mapping_results = self.collection_products_scraper.scrape_multiple(shops)
        self.results['scraping']['steps']['collection_products'] = {
            'shops_scraped': len(mapping_results),
            'total_records': sum(len(data) for data in mapping_results.values())
        }
        
        # Save mapping results
        for shop_id, data in mapping_results.items():
            if data:
                self.collection_products_scraper.save_results(shop_id, data, self.timestamp)
        
        self.logger.info("\n" + "="*60)
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
        # aggregated view/table in Supabase so any derived fields are up-to-date.
        try:
            def do_refresh(client):
                # Call the Postgres RPC function; it may return null or a result row
                return client.rpc('refresh_products_with_details').execute()

            sup = SupabaseClient()
            rpc_result = sup.safe_execute(do_refresh, 'Refresh products_with_details', max_retries=3)
            if rpc_result and hasattr(rpc_result, 'data'):
                uploader_logger.info('Called RPC `refresh_products_with_details` successfully')
            else:
                uploader_logger.warning('RPC `refresh_products_with_details` did not return expected data or failed')
        except Exception as e:
            uploader_logger.error(f'Error calling RPC refresh_products_with_details: {e}')

        uploader_logger.info("\n" + "="*60)
        uploader_logger.info("UPLOAD PIPELINE COMPLETE")
        uploader_logger.info("="*60)
        
        return self.results['uploading']
    
    def run_processing_pipeline(self, 
                              process_size_groups: bool = True,
                              process_taxonomy: bool = True,
                              taxonomy_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Run the processing pipeline."""
        processor_logger.info("\n" + "="*60)
        processor_logger.info("STARTING PROCESSING PIPELINE")
        processor_logger.info("="*60)
        
        self.results['processing'] = {
            'timestamp': self.timestamp,
            'steps': {}
        }
        
        if process_size_groups:
            processor_logger.info("\nStep 1: Processing size groups...")
            size_group_processor = SizeGroupProcessor()
            size_group_results = size_group_processor.run()
            self.results['processing']['steps']['size_groups'] = size_group_results
        
        if process_taxonomy:
            processor_logger.info("\nStep 2: Processing taxonomy mapping...")
            
            # Use default config if not provided
            if taxonomy_config is None:
                taxonomy_config = {
                    'max_depth': settings.PROCESSOR_CONFIG['taxonomy_max_depth'],
                    'min_depth': settings.PROCESSOR_CONFIG['taxonomy_min_depth'],
                    'preferred_depth': settings.PROCESSOR_CONFIG['taxonomy_preferred_depth'],
                    'threshold': settings.PROCESSOR_CONFIG['taxonomy_threshold'],
                    'model_name': settings.PROCESSOR_CONFIG['taxonomy_model']
                }
            
            taxonomy_results = run_taxonomy_mapping(**taxonomy_config)
            self.results['processing']['steps']['taxonomy'] = taxonomy_results
        
        processor_logger.info("\n" + "="*60)
        processor_logger.info("PROCESSING PIPELINE COMPLETE")
        processor_logger.info("="*60)
        
        return self.results['processing']
    
    def run_complete_pipeline(self, 
                             shops: Optional[List[Dict[str, Any]]] = None,
                             process_size_groups: bool = True,
                             process_taxonomy: bool = True) -> Dict[str, Any]:
        """Run the complete end-to-end pipeline."""
        self.logger.info("\n" + "="*60)
        self.logger.info("STARTING COMPLETE PIPELINE")
        self.logger.info("="*60)
        
        # Scraping phase
        scraping_results = self.run_scraping_pipeline(shops)
        
        # Uploading phase
        upload_results = self.run_upload_pipeline()
        
        # Processing phase
        processing_results = self.run_processing_pipeline(
            process_size_groups=process_size_groups,
            process_taxonomy=process_taxonomy
        )
        
        # Generate summary
        self._generate_summary()
        
        self.logger.info("\n" + "="*60)
        self.logger.info("COMPLETE PIPELINE FINISHED")
        self.logger.info("="*60)
        
        return {
            'scraping': scraping_results,
            'uploading': upload_results,
            'processing': processing_results,
            'timestamp': self.timestamp
        }
    
    def _generate_summary(self):
        """Generate and save summary report."""
        summary = {
            'overview': {
                'timestamp': self.timestamp,
                'total_steps': 3
            },
            'scraping': self.results.get('scraping', {}),
            'uploading': self.results.get('uploading', {}),
            'processing': self.results.get('processing', {})
        }
        
        # Save summary to file
        summary_file = settings.DATA_DIR / f"pipeline_summary_{self.timestamp}.json"
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        
        self.logger.info(f"Summary saved to: {summary_file}")
        
        # Print summary
        self._print_summary(summary)
    
    def _print_summary(self, summary: Dict[str, Any]):
        """Print a summary of the pipeline results."""
        self.logger.info("\n" + "="*60)
        self.logger.info("PIPELINE SUMMARY")
        self.logger.info("="*60)
        
        # Scraping summary
        scraping = summary.get('scraping', {})
        if scraping:
            self.logger.info("\nSCRAPING:")
            for step, data in scraping.get('steps', {}).items():
                self.logger.info(f"  {step}: {data.get('shops_scraped', 0)} shops, "
                               f"{data.get('total_records', 0)} records")
        
        # Uploading summary
        uploading = summary.get('uploading', {})
        if uploading:
            self.logger.info("\nUPLOADING:")
            for step, data in uploading.get('steps', {}).items():
                self.logger.info(f"  {step}: {data.get('processed', 0)}/{data.get('total_files', 0)} files "
                               f"({data.get('failed', 0)} failed)")
        
        # Processing summary
        processing = summary.get('processing', {})
        if processing:
            self.logger.info("\nPROCESSING:")
            for step, data in processing.get('steps', {}).items():
                if step == 'size_groups':
                    self.logger.info(f"  {step}: {data.get('total_processed', 0)} variants processed")
                elif step == 'taxonomy' and data.get('status') == 'success':
                    summary_data = data.get('summary', {})
                    self.logger.info(f"  {step}: {summary_data.get('total_processed', 0)} products, "
                                   f"{summary_data.get('total_matched', 0)} matched "
                                   f"({summary_data.get('match_rate', 0):.1%})")
        
        self.logger.info("\n" + "="*60)

def main():
    """Main entry point."""
    orchestrator = PipelineOrchestrator()
    
    # Run complete pipeline
    results = orchestrator.run_complete_pipeline(
        process_size_groups=True,
        process_taxonomy=True
    )
    
    return results

if __name__ == "__main__":
    main()