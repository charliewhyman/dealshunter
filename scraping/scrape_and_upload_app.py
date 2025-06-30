import datetime
import json
import logging
from logging.handlers import RotatingFileHandler
import subprocess
import os
import sys
import asyncio
from typing import Dict, Optional, List
import supabase
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

class PipelineRunner:
    def __init__(self, config_path: str = "config/pipeline.json"):
        # Initialize with environment variables
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.supabase_admin_key = os.getenv("SUPABASE_ADMIN_KEY") or self.supabase_key
        
        # Setup basic logging first
        self.logger = logging.getLogger("PipelineRunner")
        self.logger.addHandler(logging.StreamHandler())
        self.logger.setLevel(logging.INFO)
        
        # Load configuration
        self.config = self._load_config(config_path)
        
        # Setup proper logging
        self._setup_logging()
        
        # Ensure required config values
        self.config.setdefault("timeouts", {
            "default": 900,
            "get_shopify_products.py": 1800,
            "upload_shopify_products.py": 1200,
            "map_shopify_taxonomy.py": 3600
        })
        self.config.setdefault("max_concurrent_scripts", 2)
        
        # Initialize clients
        self.supabase_client = None
        self.supabase_admin_client = None
    
    def _setup_logging(self):
        """Initialize proper logging configuration."""
        for handler in self.logger.handlers[:]:
            self.logger.removeHandler(handler)
            
        os.makedirs('output', exist_ok=True)
        
        file_handler = RotatingFileHandler(
            'output/pipeline.log',
            maxBytes=5*1024*1024,
            backupCount=3
        )
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        file_handler.setFormatter(file_formatter)
        
        console_handler = logging.StreamHandler()
        console_formatter = logging.Formatter('%(levelname)s - %(message)s')
        console_handler.setFormatter(console_formatter)

        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)
        self.logger.setLevel(logging.INFO)

    def _load_config(self, path: str) -> Dict:
        """Load pipeline configuration with taxonomy defaults."""
        default_config = {
            "scripts": [
                'get_shopify_collections.py',
                'get_shopify_products.py',
                'get_shopify_collections_to_products.py',
                'upload_shops.py',
                'upload_shopify_collections.py',
                'upload_shopify_products.py',
                'upload_shopify_collections_to_products.py',
            ],
            "critical_scripts": [
                "get_shopify_products.py",
                "upload_shopify_products.py"
            ],
            "post_refresh_scripts": ["map_shopify_taxonomy.py"]
        }

        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            
            if os.path.exists(path):
                with open(path, 'r') as f:
                    user_config = json.load(f)
                    # Ensure taxonomy mapping is in post-refresh
                    if "post_refresh_scripts" not in user_config:
                        user_config["post_refresh_scripts"] = default_config["post_refresh_scripts"]
                    return {**default_config, **user_config}
            
            with open(path, 'w') as f:
                json.dump(default_config, f, indent=2)
            self.logger.info(f"Created default config file at {path}")
            return default_config
            
        except json.JSONDecodeError as e:
            self.logger.warning(f"Invalid config file: {e}. Using defaults.")
            return default_config
        except Exception as e:
            self.logger.warning(f"Error loading config: {e}. Using defaults.")
            return default_config

    async def __aenter__(self):
        if self.supabase_url and self.supabase_key:
            self.supabase_client = create_client(self.supabase_url, self.supabase_key)
            
            if self.supabase_admin_key and self.supabase_admin_key != self.supabase_key:
                self.supabase_admin_client = create_client(self.supabase_url, self.supabase_admin_key)
                self.logger.info("Supabase client and admin client initialized")
            else:
                self.supabase_admin_client = self.supabase_client
                self.logger.info("Supabase client initialized")
        else:
            self.logger.warning("Supabase credentials missing - some features disabled")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.supabase_client = None
        self.supabase_admin_client = None

    def _is_supabase_available(self) -> bool:
        return self.supabase_client is not None

    async def execute_script(self, script_path: str) -> bool:
        script_name = os.path.basename(script_path)
        timeout = self.config["timeouts"].get(script_name, self.config["timeouts"]["default"])

        try:
            self.logger.info(f"🚀 Starting script: {script_name}")
            proc = await asyncio.create_subprocess_exec(
                sys.executable, script_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                if proc.returncode != 0:
                    error_msg = stderr.decode().strip()
                    self.logger.error(f"❌ Script {script_name} failed with error: {error_msg}")
                    return False
                self.logger.info(f"✅ Script {script_name} completed successfully")
                return True
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                self.logger.error(f"⏱️ Script {script_name} timed out after {timeout} seconds")
                return False
            finally:
                if proc.returncode is None:
                    proc.kill()
                    await proc.wait()
        except Exception as e:
            self.logger.error(f"⚠️ Error executing {script_name}: {str(e)}")
            return False
        
    async def run_post_refresh_scripts(self) -> bool:
        """Run post-refresh scripts including taxonomy mapping."""
        if not self.config.get("post_refresh_scripts"):
            return True
            
        scripts = self.config["post_refresh_scripts"]
        base_path = os.path.dirname(__file__)
        critical_failure = False
        semaphore = asyncio.Semaphore(self.config["max_concurrent_scripts"])

        async def run_script(script: str) -> bool:
            nonlocal critical_failure
            async with semaphore:
                script_path = os.path.join(base_path, script)
                success = await self.execute_script(script_path)
                if not success and script in self.config.get("critical_scripts", []):
                    critical_failure = True
                return success

        tasks = [run_script(script) for script in scripts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return not critical_failure
    
    async def log_refresh_start(self, method: str = 'incremental') -> Optional[int]:
        if not self._is_supabase_available():
            return None
            
        try:
            result = self.supabase_client.table("table_refresh_history").insert({
                "table_name": "products_with_details",
                "start_time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "refresh_method": method,
                "status": "started"
            }).execute()
            
            if result.data:
                refresh_id = result.data[0].get('refresh_id')
                self.logger.info(f"📝 Started refresh tracking with ID: {refresh_id}")
                return refresh_id
            return None
        except Exception as e:
            self.logger.warning(f"⚠️ Failed to log refresh start: {e}")
            return None

    async def log_refresh_end(self, refresh_id: int, rows_affected: Optional[int] = None, success: bool = True):
        if not self._is_supabase_available():
            return
            
        try:
            update_data = {
                "end_time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "status": "completed" if success else "failed"
            }
            if rows_affected is not None:
                update_data["rows_affected"] = rows_affected
            
            self.supabase_client.table("table_refresh_history").update(update_data).eq(
                "refresh_id", refresh_id
            ).execute()
            
            status = "completed" if success else "failed"
            self.logger.info(f"📝 Refresh {refresh_id} {status}")
        except Exception as e:
            self.logger.warning(f"⚠️ Failed to log refresh end: {e}")                           
        
    async def refresh_products_table(self, product_ids: Optional[List[int]] = None):
        if not self._is_supabase_available():
            self.logger.error("Supabase client not available - cannot refresh products")
            return False

        refresh_id = await self.log_refresh_start(
            method='targeted' if product_ids else 'full'
        )
        success = False
        rows_affected = 0

        try:
            if product_ids:
                self.logger.info(f"🔄 Refreshing {len(product_ids)} products in batches")
                batch_size = 100
                for i in range(0, len(product_ids), batch_size):
                    batch = product_ids[i:i + batch_size]
                    self.logger.debug(f"Processing batch {i//batch_size + 1}")
                    
                    result = self.supabase_client.rpc(
                        'refresh_products_batch',
                        {'product_ids': batch}
                    ).execute()
                    
                    if result.data:
                        rows_affected += len(batch)
            else:
                self.logger.info("🔄 Refreshing all products")
                result = self.supabase_client.rpc('refresh_all_products').execute()
                if result.data:
                    rows_affected = result.data[0] if isinstance(result.data[0], int) else 0

            success = True
            self.logger.info(f"✅ Refreshed {rows_affected} products")
            
        except Exception as e:
            self.logger.error(f"❌ Product refresh failed: {str(e)}")
            success = False
        
        finally:
            await self.log_refresh_end(refresh_id, rows_affected, success)
            return success

    async def get_modified_product_ids(self, since_minutes: int = 30) -> List[int]:
        if not self._is_supabase_available():
            self.logger.warning("Supabase unavailable - cannot get modified products")
            return []

        try:
            cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=since_minutes)
            
            products = self.supabase_client.table('products').select('id').gte('last_modified', cutoff.isoformat()).execute()
            variants = self.supabase_client.table('variants').select('product_id').gte('last_modified', cutoff.isoformat()).execute()
            images = self.supabase_client.table('images').select('product_id').gte('last_modified', cutoff.isoformat()).execute()
            
            all_ids = (
                [p['id'] for p in products.data] +
                [v['product_id'] for v in variants.data] +
                [i['product_id'] for i in images.data]
            )
            
            return list(set(all_ids))
        
        except Exception as e:
            self.logger.error(f"Error getting modified products: {e}")
            return []

    async def should_refresh_products(self, threshold_minutes: int = 30) -> bool:
        if not self._is_supabase_available():
            self.logger.warning("Supabase unavailable - proceeding with refresh")
            return True

        try:
            result = self.supabase_client.table("table_refresh_history").select(
                "end_time", "refresh_method"
            ).eq("table_name", "products_with_details"
            ).eq("status", "completed"
            ).order("end_time", desc=True
            ).limit(1).execute()
            
            if not result.data:
                return True
                
            last_refresh = result.data[0]
            last_refresh_time = datetime.datetime.fromisoformat(last_refresh['end_time'].replace('Z', '+00:00'))
            minutes_since = (datetime.datetime.now(datetime.timezone.utc) - last_refresh_time).total_seconds() / 60
            
            if minutes_since > (threshold_minutes * 24 * 3):
                self.logger.info("Time for periodic full refresh")
                return True
                
            modified_ids = await self.get_modified_product_ids(threshold_minutes)
            if modified_ids:
                self.logger.info(f"Found {len(modified_ids)} modified products needing refresh")
                return True
                
            self.logger.info("No products modified recently - skipping refresh")
            return False
            
        except Exception as e:
            self.logger.error(f"Error checking refresh need: {e}")
            return True

    async def run_scripts(self, script_list: List[str]) -> bool:
        base_path = os.path.dirname(__file__)
        critical_failure = False
        semaphore = asyncio.Semaphore(self.config["max_concurrent_scripts"])
        supabase_available = self._is_supabase_available()

        async def run_script(script: str) -> bool:
            nonlocal critical_failure
            async with semaphore:
                script_path = os.path.join(base_path, script)
                
                if script.startswith('upload_') and not supabase_available:
                    self.logger.warning(f"⏭️ Skipping {script} - Supabase unavailable")
                    if script in self.config["critical_scripts"]:
                        critical_failure = True
                    return False

                success = await self.execute_script(script_path)
                if not success and script in self.config["critical_scripts"]:
                    critical_failure = True
                return success

        tasks = [run_script(script) for script in script_list]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return not critical_failure

    async def run_all_scripts(self) -> bool:
        """Run complete pipeline with taxonomy mapping integration."""
        get_scripts = [s for s in self.config["scripts"] if s.startswith('get_')]
        upload_scripts = [s for s in self.config["scripts"] if s.startswith('upload_')]
        other_scripts = [s for s in self.config["scripts"] if s not in get_scripts + upload_scripts]
        
        for group in [get_scripts, other_scripts, upload_scripts]:
            if group:
                group_success = await self.run_scripts(group)
                if not group_success:
                    self.logger.error("❌ Critical script failed - aborting pipeline")
                    return False

        refresh_success = True
        if self._is_supabase_available():
            if await self.should_refresh_products(threshold_minutes=30):
                modified_ids = await self.get_modified_product_ids(24*60)
                if modified_ids:
                    refresh_success = await self.refresh_products_table(modified_ids)
                
                if not refresh_success or not modified_ids:
                    refresh_success = await self.refresh_products_table()
            else:
                self.logger.info("⏭️ Skipping product refresh - no changes detected")
        else:
            self.logger.warning("⏭️ Skipping product refresh - Supabase unavailable")

        if refresh_success:
            post_refresh_success = await self.run_post_refresh_scripts()
            return post_refresh_success
        
        return refresh_success

async def main():
    try:
        async with PipelineRunner() as runner:
            success = await runner.run_all_scripts()
            
            if success:
                print("✅ Pipeline completed successfully")
                return 0
            else:
                print("❌ Pipeline failed")
                return 1
    except Exception as e:
        logging.error(f"💥 Fatal error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))