import datetime
import json
import logging
from logging.handlers import RotatingFileHandler
import subprocess
import os
import sys
import httpx
import asyncio
from urllib.parse import urlparse
from typing import Dict, Optional

class SupabaseMaterializedViewRefresher:
    def __init__(self, config_path: str = "config/pipeline.json"):
        # First initialize basic attributes
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        # Initialize a temporary basic logger
        self.logger = logging.getLogger("SupabaseRefresher")
        self.logger.addHandler(logging.StreamHandler())
        self.logger.setLevel(logging.INFO)
        
        # Now load config which might use the basic logger
        self.config = self._load_config(config_path)
        
        # Setup proper logging with file handler after we have config
        self._setup_logging()
        
        # Ensure required config values exist
        self.config.setdefault("timeouts", {
            "default": 900,
            "get_shopify_products.py": 1800,
            "upload_shopify_products.py": 1200
        })
        self.config.setdefault("max_concurrent_scripts", 2)
    
    def _setup_logging(self):
        """Initialize proper logging configuration."""
        # Remove any existing handlers
        for handler in self.logger.handlers[:]:
            self.logger.removeHandler(handler)
            
        # Create output directory if it doesn't exist
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

    def _load_config(self, path: str) -> Dict:
        """Load pipeline configuration with defaults."""
        default_config = {
            "scripts": [
                'upload_shops.py',
                'get_shopify_collections.py',
                'get_shopify_products.py',
                'get_shopify_collections_to_products.py',
                'upload_shopify_collections.py',
                'upload_shopify_products.py',
                'upload_shopify_collections_to_products.py',
            ],
            "critical_scripts": [
                "upload_shops.py",
                "get_shopify_products.py",
                "upload_shopify_products.py"
            ]
        }

        try:
            # Create config directory if it doesn't exist
            os.makedirs(os.path.dirname(path), exist_ok=True)
            
            # Try to load existing config
            if os.path.exists(path):
                with open(path, 'r') as f:
                    user_config = json.load(f)
                    # Merge with defaults
                    return {**default_config, **user_config}
            
            # Create new config file with defaults
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
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0),
            limits=httpx.Limits(max_connections=5),
            base_url=self.supabase_url,
            headers={
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}",
                "Content-Type": "application/json"
            }
        )
        await self.client.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.client:
            await self.client.__aexit__(exc_type, exc_val, exc_tb)

    async def is_supabase_reachable(self) -> bool:
        """Check if Supabase is available."""
        if not self.supabase_url:
            self.logger.warning("SUPABASE_URL is not set.")
            return False

        try:
            parsed = urlparse(self.supabase_url)
            health_check_url = f"{parsed.scheme}://{parsed.netloc}/rest/v1/"
            async with httpx.AsyncClient() as client:
                response = await client.get(health_check_url, timeout=5)
                if response.status_code >= 500:
                    self.logger.warning(f"Supabase is reachable but not responding properly (HTTP {response.status_code}).")
                    return False
                return True
        except Exception as e:
            self.logger.warning(f"Failed to connect to Supabase: {e}")
            return False

    async def execute_script(self, script_path: str) -> bool:
        script_name = os.path.basename(script_path)
        timeout = self.config["timeouts"].get(script_name, self.config["timeouts"]["default"])

        try:
            self.logger.info(f"Starting script: {script_name}")
            proc = await asyncio.create_subprocess_exec(
                sys.executable, script_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                if proc.returncode != 0:
                    error_msg = stderr.decode().strip()
                    self.logger.error(f"Script {script_name} failed with error: {error_msg}")
                    return False
                self.logger.info(f"Script {script_name} completed successfully")
                return True
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                self.logger.error(f"Script {script_name} timed out after {timeout} seconds")
                return False
            finally:
                if proc.returncode is None:
                    proc.kill()
                    await proc.wait()
        except Exception as e:
            self.logger.error(f"Error executing {script_name}: {str(e)}")
            return False
        
    async def run_post_refresh_scripts(self) -> bool:
        """Run scripts that should execute after the view refresh."""
        if "post_refresh_scripts" not in self.config:
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

        tasks = [run_script(script) for script in self.config["post_refresh_scripts"]]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return not critical_failure
    
    async def log_refresh_start(self, method: str = 'direct') -> Optional[int]:
        """Log the start of a refresh operation and return the refresh_id."""
        try:
            response = await self.client.post(
                "/rest/v1/view_refresh_history",
                json={
                    "start_time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "refresh_method": method
                }
            )
            response.raise_for_status()
            result = response.json()
            if result and len(result) > 0:
                refresh_id = result[0].get('refresh_id')
                self.logger.info(f"Started refresh tracking with ID: {refresh_id}")
                return refresh_id
            return None
        except Exception as e:
            self.logger.warning(f"Failed to log refresh start: {e}")
            return None
    
    async def log_refresh_end(self, refresh_id: int, rows_affected: Optional[int] = None, success: bool = True):
        """Log the end of a refresh operation."""
        try:
            update_data = {
                "end_time": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            if rows_affected is not None:
                update_data["rows_affected"] = rows_affected
            
            response = await self.client.patch(
                f"/rest/v1/view_refresh_history?refresh_id=eq.{refresh_id}",
                json=update_data
            )
            response.raise_for_status()
            status = "completed" if success else "failed"
            self.logger.info(f"Refresh {refresh_id} {status}")
        except Exception as e:
            self.logger.warning(f"Failed to log refresh end: {e}")
        
    async def should_refresh_view(self, threshold_minutes: int = 30) -> bool:
        """Check if view needs refresh based on last refresh time."""
        try:
            # Get the most recent successful refresh
            response = await self.client.get(
                "/rest/v1/view_refresh_history?end_time=not.is.null&order=end_time.desc&limit=1"
            )
            response.raise_for_status()
            result = response.json()
            
            if not result:
                self.logger.info("No previous refresh found - refresh needed")
                return True
                
            last_refresh_str = result[0]['end_time']
            last_refresh_time = datetime.datetime.fromisoformat(last_refresh_str.replace('Z', '+00:00'))
            time_since_refresh = datetime.datetime.now(datetime.timezone.utc) - last_refresh_time
            minutes_since = time_since_refresh.total_seconds() / 60
            
            if minutes_since < threshold_minutes:
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

    async def refresh_materialized_view(self, method: str = 'direct') -> bool:
        """Refresh the materialized view with proper logging."""
        refresh_id = await self.log_refresh_start(method)
        
        for attempt in range(3):
            try:
                if method == 'direct':
                    # Direct refresh via RPC function
                    response = await self.client.post(
                        "/rest/v1/rpc/refresh_products_with_details",
                        json={}
                    )
                else:
                    # Alternative method - you might need to implement this differently
                    # based on your specific refresh mechanism
                    self.logger.warning("Non-direct refresh method not implemented")
                    return False
                    
                response.raise_for_status()
                self.logger.info("Materialized view refresh successful")
                
                # Log successful completion
                if refresh_id:
                    await self.log_refresh_end(refresh_id, success=True)
                
                return True
                
            except httpx.HTTPStatusError as e:
                if attempt == 2:
                    self.logger.error(f"Failed to refresh view after 3 attempts: {e}")
                    if refresh_id:
                        await self.log_refresh_end(refresh_id, success=False)
                    return False
                wait_time = 2 ** attempt
                self.logger.warning(f"View refresh failed (attempt {attempt + 1}), retrying in {wait_time} seconds...")
                await asyncio.sleep(wait_time)
            except Exception as e:
                self.logger.error(f"Error refreshing view: {e}")
                if refresh_id:
                    await self.log_refresh_end(refresh_id, success=False)
                return False

    async def get_refresh_history(self, limit: int = 10) -> Optional[list]:
        """Get recent refresh history for monitoring."""
        try:
            response = await self.client.get(
                f"/rest/v1/view_refresh_history?order=start_time.desc&limit={limit}"
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            self.logger.warning(f"Couldn't fetch refresh history: {e}")
            return None

    async def run_all_scripts(self, refresh_method: str = 'direct') -> bool:
        supabase_reachable = await self.is_supabase_reachable()
        base_path = os.path.dirname(__file__)
        critical_failure = False
        semaphore = asyncio.Semaphore(self.config["max_concurrent_scripts"])

        async def run_script(script: str) -> bool:
            nonlocal critical_failure
            async with semaphore:
                script_path = os.path.join(base_path, script)
                
                if script.startswith('upload_') and not supabase_reachable:
                    self.logger.warning(f"Skipping {script} - Supabase unreachable")
                    if script in self.config["critical_scripts"]:
                        critical_failure = True
                    return False

                success = await self.execute_script(script_path)
                if not success and script in self.config["critical_scripts"]:
                    critical_failure = True
                return success

        # Run main scripts
        tasks = [run_script(script) for script in self.config["scripts"]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        if critical_failure:
            self.logger.error("Critical script failed - aborting pipeline")
            return False

        refresh_success = True
        if supabase_reachable:
            # Only refresh if needed
            if await self.should_refresh_view(threshold_minutes=30):
                refresh_success = await self.refresh_materialized_view(method=refresh_method)
                if refresh_success:
                    # Get recent refresh history for logging
                    history = await self.get_refresh_history(limit=1)
                    if history and len(history) > 0:
                        last_refresh = history[0]
                        self.logger.info(f"View refreshed at: {last_refresh['end_time']}")

        # Run post-refresh scripts only if everything succeeded so far
        if refresh_success and not critical_failure:
            post_refresh_success = await self.run_post_refresh_scripts()
            return post_refresh_success
        
        return refresh_success and not critical_failure

async def main():
    try:
        async with SupabaseMaterializedViewRefresher() as refresher:
            success = await refresher.run_all_scripts(refresh_method='direct')
            
            if success:
                print("All scripts executed and view refreshed successfully")
                return 0
            else:
                print("Script execution or view refresh failed")
                return 1
    except Exception as e:
        logging.error(f"Fatal error in main: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))