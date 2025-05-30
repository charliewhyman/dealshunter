import subprocess
import os
import sys
import httpx
import asyncio
from urllib.parse import urlparse
from typing import List, Optional

class SupabaseMaterializedViewRefresher:
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_KEY")
        self.scripts = [
            'upload_shops.py',
            'get_shopify_collections.py',
            'get_shopify_products.py',
            'get_shopify_collections_to_products.py',
            'upload_shopify_collections.py',
            'upload_shopify_products.py',
            'upload_shopify_collections_to_products.py',
        ]

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

    async def execute_script(self, script_path: str, timeout: int = 900) -> bool:
        """Execute a single Python script with a timeout (default 15 minutes)."""
        try:
            proc = await asyncio.create_subprocess_exec(
                'python', script_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                print(f'Timeout while executing {script_path}')
                return False

            if proc.returncode != 0:
                print(f'Error executing {script_path}:\n{stderr.decode()}')
                error_output = stderr.decode()
                with open("output/failures.log", "a", encoding="utf-8") as f:
                    f.write(f"{script_path} failed with error:\n{error_output}\n\n")
                return False

            print(f'Script {script_path} stdout:\n{stdout.decode()}')
            return True
        except Exception as e:
            print(f'Exception executing {script_path}: {str(e)}')
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
        """Execute all scripts and trigger view refresh."""
        supabase_reachable = await self.is_supabase_reachable()
        base_path = os.path.dirname(__file__)
        all_success = True

        for script in self.scripts:
            if script.startswith('upload_') and not supabase_reachable:
                print(f"Skipping {script} because Supabase is unreachable.")
                continue

            script_path = os.path.join(base_path, script)
            print(f'Running script: {script_path}')
            
            success = await self.execute_script(script_path)
            if not success:
                print(f"WARNING: {script} failed. Continuing with pipeline.")
                all_success = False  # Flag for later

        if supabase_reachable:
            refresh_success = await self.refresh_materialized_view(method=refresh_method)
            if refresh_success:
                refresh_time = await self.verify_refresh()
                print(f"Refresh completed. Last refresh time: {refresh_time}")
            all_success = all_success and refresh_success

        return all_success

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