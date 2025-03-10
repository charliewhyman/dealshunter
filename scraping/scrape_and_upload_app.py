import subprocess
import os

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

    base_path = os.path.join(os.path.dirname(__file__))

    for script in scripts:
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