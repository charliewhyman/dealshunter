import json
import logging
from logging.handlers import RotatingFileHandler
import subprocess
import os
import sys
import httpx
import asyncio
from urllib.parse import urlparse
from typing import Dict,  Optional

class SupabaseMaterializedViewRefresher:
    def __init__(self, config_path: str = "config/pipeline.json"):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self._setup_logging()  # Initialize logger first
        self.config = self._load_config(config_path)
        # Ensure required config values exist
        self.config.setdefault("timeouts", {
            "default": 900,
            "get_shopify_products.py": 1800,
            "upload_shopify_products.py": 1200
        })
        self.config.setdefault("max_concurrent_scripts", 2)
    
    def _setup_logging(self):
        """Initialize logging configuration."""
        self.logger = logging.getLogger("SupabaseRefresher")
        self.logger.setLevel(logging.INFO)
        
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
            # First try to load the config file
            with open(path, 'r') as f:
                user_config = json.load(f)
                # Merge user config with defaults (user values take precedence)
                merged_config = default_config.copy()
                merged_config.update(user_config)
                return merged_config
                
        except FileNotFoundError:
            # If file doesn't exist, create it with defaults
            try:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, 'w') as f:
                    json.dump(default_config, f, indent=2)
                self.logger.info(f"Created default config file at {path}")
                return default_config
            except Exception as e:
                self.logger.warning(f"Could not create config file: {e}")
                return default_config
                
        except json.JSONDecodeError as e:
            self.logger.warning(f"Invalid JSON in config file: {e}")
            return default_config
        except Exception as e:
            self.logger.warning(f"Error loading config: {e}")
            return default_config
    
    def _setup_logging(self):
        self.logger = logging.getLogger("SupabaseRefresher")
        self.logger.setLevel(logging.INFO)
        
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

    async def is_supabase_reachable(self) -> bool:
        """Check if Supabase is available."""
        if not self.supabase_url:
            print("WARNING: SUPABASE_URL is not set.")
            return False

        try:
            parsed = urlparse(self.supabase_url)
            health_check_url = f"{parsed.scheme}://{parsed.netloc}/rest/v1/"
            async with httpx.AsyncClient() as client:
                response = await client.get(health_check_url, timeout=5)
                if response.status_code >= 500:
                    print(f"Supabase is reachable but not responding properly (HTTP {response.status_code}).")
                    return False
                return True
        except Exception as e:
            print(f"Failed to connect to Supabase: {e}")
            return False

    async def execute_script(self, script_path: str) -> bool:
        script_name = os.path.basename(script_path)
        timeout = self.config["timeouts"].get(script_name, self.config["timeouts"]["default"])

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, script_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                if proc.returncode != 0:
                    raise subprocess.CalledProcessError(
                        proc.returncode, script_path, stderr.decode()
                    )
                return True
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                raise
            finally:
                if proc.returncode is None:
                    proc.kill()
                    await proc.wait()
        except Exception as e:
            self.logger.error(f"Error executing {script_name}: {str(e)}")
            return False

    async def refresh_materialized_view(self, method: str = 'direct') -> bool:
        for attempt in range(3):
            try:
                if method == 'direct':
                    response = await self.client.post(
                        "/rest/v1/rpc/refresh_products_view",
                        json={}
                    )
                else:
                    response = await self.client.post(
                        "/rest/v1/pending_view_refreshes",
                        json={}
                    )
                response.raise_for_status()
                return True
            except httpx.HTTPStatusError as e:
                if attempt == 2:
                    return False
                await asyncio.sleep(2 ** attempt)
            except Exception as e:
                return False

    async def verify_refresh(self) -> Optional[str]:
        try:
            response = await self.client.post(
                "/rest/v1/rpc/get_last_refresh_time",
                json={}
            )
            response.raise_for_status()
            return response.json()
        except Exception:
            return None

    async def verify_refresh(self) -> Optional[str]:
        """Check when the view was last refreshed."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.supabase_url}/rest/v1/rpc/get_last_refresh_time",
                    headers={
                        "apikey": self.supabase_key,
                        "Authorization": f"Bearer {self.supabase_key}",
                        "Content-Type": "application/json"
                    },
                    json={}
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            print(f"Couldn't verify refresh time: {e}")
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
                    if script in self.config["critical_scripts"]:
                        critical_failure = True
                    return False

                success = await self.execute_script(script_path)
                if not success and script in self.config["critical_scripts"]:
                    critical_failure = True
                return success

        tasks = [run_script(script) for script in self.config["scripts"]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        if critical_failure:
            return False

        if supabase_reachable:
            return await self.refresh_materialized_view(method=refresh_method)
        return True

async def main():
    refresher = SupabaseMaterializedViewRefresher()
    
    # Choose 'direct' for immediate refresh or 'pending' for cron-based
    success = await refresher.run_all_scripts(refresh_method='direct')
    
    if success:
        print("All scripts executed and view refreshed successfully")
    else:
        print("Script execution or view refresh failed")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())