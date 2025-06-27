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
        
        # Setup basic logging first
        self.logger = logging.getLogger("PipelineRunner")
        self.logger.addHandler(logging.StreamHandler())
        self.logger.setLevel(logging.INFO)
        
        # Load configuration
        self.config = self._load_config(config_path)
        
        # Setup propedeer logging
        self._setup_logging()
        
        # Ensure required config values
        self.config.setdefault("timeouts", {
            "default": 900,
            "get_shopify_products.py": 1800,
            "upload_shopify_products.py": 1200
        })
        self.config.setdefault("max_concurrent_scripts", 2)
        
        # Initialize clients
        self.supabase_client = None
    
    def _setup_logging(self):
        """Initialize proper logging configuration."""
        # Remove any existing handlers
        for handler in self.logger.handlers[:]:
            self.logger.removeHandler(handler)
            
        # Create output directory
        os.makedirs('output', exist_ok=True)
        
        # File handler
        file_handler = RotatingFileHandler(
            'output/pipeline.log',
            maxBytes=5*1024*1024,
            backupCount=3
        )
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        file_handler.setFormatter(file_formatter)
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_formatter = logging.Formatter('%(levelname)s - %(message)s')
        console_handler.setFormatter(console_formatter)

        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)
        self.logger.setLevel(logging.INFO)

    def _load_config(self, path: str) -> Dict:
        """Load pipeline configuration with defaults."""
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
            "post_refresh_scripts": []
        }

        try:
            # Create config directory if needed
            os.makedirs(os.path.dirname(path), exist_ok=True)
            
            # Try to load existing config
            if os.path.exists(path):
                with open(path, 'r') as f:
                    user_config = json.load(f)
                    # Merge with defaults
                    return {**default_config, **user_config}
            
            # Create new config file
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
        # Initialize Supabase client
        if self.supabase_url and self.supabase_key:
            self.supabase_client = create_client(self.supabase_url, self.supabase_key)
            self.logger.info("Supabase client initialized")
        else:
            self.logger.warning("Supabase credentials missing - some features disabled")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.supabase_client = None

    def _is_supabase_available(self) -> bool:
        """Check if Supabase client is ready."""
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
        """Run scripts after view refresh."""
        if "post_refresh_scripts" not in self.config:
            return True
            
        scripts = self.config["post_refresh_scripts"]
        if not scripts:
            return True
            
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
        """Log the start of a refresh operation."""
        if not self._is_supabase_available():
            return None
            
        try:
            result = self.supabase_client.table("view_refresh_history").insert({
                "start_time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "refresh_method": method,
                "status": "started"
            }).execute()
            
            if result.data and len(result.data) > 0:
                refresh_id = result.data[0].get('refresh_id')
                self.logger.info(f"📝 Started refresh tracking with ID: {refresh_id}")
                return refresh_id
            return None
        except Exception as e:
            self.logger.warning(f"⚠️ Failed to log refresh start: {e}")
            return None
    
    async def log_refresh_end(self, refresh_id: int, rows_affected: Optional[int] = None, success: bool = True):
        """Log the end of a refresh operation."""
        if not self._is_supabase_available():
            return
            
        try:
            update_data = {
                "end_time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "status": "completed" if success else "failed"
            }
            if rows_affected is not None:
                update_data["rows_affected"] = rows_affected
            
            self.supabase_client.table("view_refresh_history").update(update_data).eq(
                "refresh_id", refresh_id
            ).execute()
            
            status = "completed" if success else "failed"
            self.logger.info(f"📝 Refresh {refresh_id} {status}")
        except Exception as e:
            self.logger.warning(f"⚠️ Failed to log refresh end: {e}")
        
    async def should_refresh_view(self, threshold_minutes: int = 30) -> bool:
        """Check if view needs refresh based on last refresh time and method."""
        if not self._is_supabase_available():
            self.logger.warning("Supabase unavailable - skipping refresh check")
            return False
            
        try:
            # Get most recent successful refresh
            result = self.supabase_client.table("view_refresh_history").select(
                "end_time", "refresh_method"
            ).eq(
                "view_name", "products_with_details"
            ).eq(
                "status", "completed"
            ).order(
                "end_time", desc=True
            ).limit(1).execute()
            
            if not result.data:
                self.logger.info("No previous refresh found - refresh needed")
                return True
                
            last_refresh = result.data[0]
            last_refresh_time = datetime.datetime.fromisoformat(last_refresh['end_time'].replace('Z', '+00:00'))
            time_since_refresh = datetime.datetime.now(datetime.timezone.utc) - last_refresh_time
            minutes_since = time_since_refresh.total_seconds() / 60
            
            # If last refresh was incremental, consider forcing periodic full refresh
            if last_refresh['refresh_method'] == 'incremental' and minutes_since > (threshold_minutes * 24):  # Daily full refresh
                self.logger.info(
                    f"Last refresh was incremental {minutes_since/60:.1f} hours ago - "
                    "recommending full refresh"
                )
                return True
            elif minutes_since < threshold_minutes:
                self.logger.info(
                    f"View refreshed {minutes_since:.1f} minutes ago "
                    f"(under {threshold_minutes} minute threshold) - skipping refresh"
                )
                return False
                
            self.logger.info(
                f"View last refreshed {minutes_since:.1f} minutes ago - refresh needed"
            )
            return True
            
        except Exception as e:
            self.logger.error(f"Error checking refresh status: {e} - proceeding with refresh")
            return True

    async def refresh_materialized_view(self) -> bool:
        """Refresh the materialized view with proper error handling."""
        if not self._is_supabase_available():
            self.logger.warning("❌ Supabase client not available - cannot refresh view")
            return False
            
        refresh_id = await self.log_refresh_start()
        success = False
        rows_affected = None
        
        try:
            # First try incremental refresh
            self.logger.info("🔄 Attempting incremental materialized view refresh")
            try:
                result = self.supabase_client.rpc('refresh_products_view_incremental', {}).execute()
                
                if result.data and isinstance(result.data, list) and len(result.data) > 0:
                    rows_affected = result.data[0].get('row_count', 0)
                    message = f"✅ Incremental refresh successful ({rows_affected} products updated)"
                    self.logger.info(message)
                    success = True
                else:
                    raise RuntimeError("Incremental refresh returned no data")
                    
            except Exception as e:
                error_msg = str(e)
                if isinstance(e, dict):
                    error_msg = e.get('message', str(e))
                
                if 'cannot change materialized view' in error_msg:
                    self.logger.warning("⚠️ Incremental refresh not supported - falling back to full refresh")
                    raise RuntimeError("Incremental refresh not supported")
                raise RuntimeError(error_msg)
                
        except Exception as e:
            self.logger.error(f"❌ Incremental refresh failed: {str(e)}")
            try:
                # Fallback to full refresh using the renamed function
                self.logger.warning("🔄 Attempting full refresh as fallback")
                
                # Updated to use the new function name
                result = self.supabase_client.rpc('refresh_materialized_view_full', {}).execute()
                
                if result.data and isinstance(result.data, list) and len(result.data) > 0:
                    rows_affected = result.data[0].get('row_count', 0)
                    self.logger.info(f"✅ Full refresh completed successfully ({rows_affected} products)")
                    success = True
                else:
                    raise RuntimeError("Full refresh returned no data")
                    
            except Exception as full_refresh_error:
                error_msg = str(full_refresh_error)
                if isinstance(full_refresh_error, dict):
                    error_msg = full_refresh_error.get('message', str(full_refresh_error))
                self.logger.error(f"❌ Full refresh failed: {error_msg}")
                success = False
        finally:
            if refresh_id:
                await self.log_refresh_end(refresh_id, rows_affected, success)
                
        return success

    async def run_scripts(self, script_list: List[str]) -> bool:
        """Run a list of scripts with proper concurrency and error handling."""
        base_path = os.path.dirname(__file__)
        critical_failure = False
        semaphore = asyncio.Semaphore(self.config["max_concurrent_scripts"])
        supabase_available = self._is_supabase_available()

        async def run_script(script: str) -> bool:
            nonlocal critical_failure
            async with semaphore:
                script_path = os.path.join(base_path, script)
                
                # Skip upload scripts if Supabase is unavailable
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
        """Run the complete pipeline including scripts and view refresh."""
        # Separate get and upload scripts for better control
        get_scripts = [s for s in self.config["scripts"] if s.startswith('get_')]
        upload_scripts = [s for s in self.config["scripts"] if s.startswith('upload_')]
        other_scripts = [s for s in self.config["scripts"] if s not in get_scripts + upload_scripts]
        
        # Run scripts in order: get, then other, then upload
        script_groups = [get_scripts, other_scripts, upload_scripts]
        
        for group in script_groups:
            if group:
                group_success = await self.run_scripts(group)
                if not group_success:
                    self.logger.error("❌ Critical script failed - aborting pipeline")
                    return False

        # Refresh materialized view if needed
        refresh_success = True
        if self._is_supabase_available():
            if await self.should_refresh_view(threshold_minutes=30):
                refresh_success = await self.refresh_materialized_view()
            else:
                self.logger.info("⏭️ Skipping view refresh - recently refreshed")
        else:
            self.logger.warning("⏭️ Skipping view refresh - Supabase unavailable")

        # Run post-refresh scripts only if everything succeeded
        if refresh_success:
            post_refresh_success = await self.run_post_refresh_scripts()
            return post_refresh_success
        
        return refresh_success

async def main():
    try:
        async with PipelineRunner() as runner:
            success = await runner.run_all_scripts()
            
            if success:
                print("✅ All scripts executed and view refreshed successfully")
                return 0
            else:
                print("❌ Script execution or view refresh failed")
                return 1
    except Exception as e:
        logging.error(f"💥 Fatal error in main: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))