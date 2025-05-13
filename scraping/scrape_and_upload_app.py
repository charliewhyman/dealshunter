import subprocess
import os
import sys
import httpx
from urllib.parse import urlparse

def supabase_is_reachable():
    supabase_url = os.environ.get("SUPABASE_URL")
    if not supabase_url:
        print("WARNING: SUPABASE_URL is not set.")
        return False

    try:
        parsed = urlparse(supabase_url)
        health_check_url = f"{parsed.scheme}://{parsed.netloc}/rest/v1/"
        response = httpx.get(health_check_url, timeout=5)
        if response.status_code >= 500:
            print(f"Supabase is reachable but not responding properly (HTTP {response.status_code}).")
            return False
        return True
    except Exception as e:
        print(f"Failed to connect to Supabase: {e}")
        return False

def run_python_scripts():
    scripts = [
        'upload_shops.py',
        'get_shopify_collections.py',
        'get_shopify_products.py',
        'get_shopify_collections_to_products.py',
        'upload_shopify_collections.py',
        'upload_shopify_products.py',
        'upload_shopify_collections_to_products.py',
    ]

    supabase_reachable = supabase_is_reachable()
    base_path = os.path.join(os.path.dirname(__file__))

    for script in scripts:
        if script.startswith('upload_') and not supabase_reachable:
            print(f"Skipping {script} because Supabase is unreachable or paused.")
            continue

        script_path = os.path.join(base_path, script)
        print(f'Running script: {script_path}')

        try:
            result = subprocess.run(
                ['python', script_path],
                check=True,
                text=True,
                capture_output=True
            )
            print(f'Script {script} stdout:\n{result.stdout}')
        except subprocess.CalledProcessError as e:
            print(f'Error executing {script}:\n{e.stderr}')
            break

    print('All scripts executed successfully.')

# Call the function
run_python_scripts()