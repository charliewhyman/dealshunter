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
        self.config = self._load_config(config_path)
        self._setup_logging()
        self.config["timeouts"] = {
            "default": 900,
            "get_shopify_products.py": 1800,
            "upload_shopify_products.py": 1200
        }
        self.config["max_concurrent_scripts"] = 2
    
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

    def _load_config(self, path: str) -> Dict:
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
            with open(path) as f:
                return {**default_config, **json.load(f)}
        except (FileNotFoundError, json.JSONDecodeError) as e:
            self.logger.warning(f"Using default config: {str(e)}")
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
        """
        Refresh the materialized view using either:
        - 'direct': Calls refresh_products_view() function immediately
        - 'pending': Inserts into pending_view_refreshes for cron-based refresh
        """
        if not self.supabase_url or not self.supabase_key:
            print("WARNING: Supabase credentials not set - cannot refresh view")
            return False

        try:
            async with httpx.AsyncClient() as client:
                if method == 'direct':
                    # Directly call the refresh function
                    response = await client.post(
                        f"{self.supabase_url}/rest/v1/rpc/refresh_products_view",
                        headers={
                            "apikey": self.supabase_key,
                            "Authorization": f"Bearer {self.supabase_key}",
                            "Content-Type": "application/json"
                        },
                        json={}
                    )
                else:
                    # Use the pending refreshes table
                    response = await client.post(
                        f"{self.supabase_url}/rest/v1/pending_view_refreshes",
                        headers={
                            "apikey": self.supabase_key,
                            "Authorization": f"Bearer {self.supabase_key}",
                            "Content-Type": "application/json"
                        },
                        json={}  # Using DEFAULT VALUES
                    )

                response.raise_for_status()
                print(f"Materialized view refresh triggered via {method} method")
                return True
        except httpx.HTTPStatusError as e:
            print(f"HTTP error refreshing view: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            print(f"Failed to refresh materialized view: {e}")
        return False

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