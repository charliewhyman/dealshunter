import os
import re
import requests
import zipfile
import json
from pathlib import Path
from supabase import create_client
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from io import BytesIO
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
DEFAULT_VERSION = "2025-03"  # Fallback version from requirements
REPO_URL = "https://github.com/Shopify/product-taxonomy"
BATCH_SIZE = 500
MIN_SIMILARITY = 0.6
CACHE_DIR = Path("./taxonomy_cache")

# Initialize Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

def get_latest_taxonomy_version():
    """Fetch the latest taxonomy version from GitHub repository"""
    try:
        version_url = f"{REPO_URL}/raw/main/VERSION"
        response = requests.get(version_url, timeout=10)
        response.raise_for_status()
        version = response.text.strip()
        logger.info(f"Detected latest taxonomy version: {version}")
        return version
    except Exception as e:
        logger.warning(f"Failed to fetch latest version: {str(e)}. Using fallback {DEFAULT_VERSION}")
        return DEFAULT_VERSION

def download_and_cache_taxonomy(version):
    """Download and cache taxonomy with version validation"""
    # Create version-specific cache file
    cache_file = CACHE_DIR / f"taxonomy_{version}.json"
    v_version = f"v{version}"  # GitHub uses v-prefixed tags
    
    # Return cached data if available
    if cache_file.exists():
        try:
            with open(cache_file, 'r') as f:
                cache = json.load(f)
            if cache.get('version') == version:
                logger.info(f"Using cached taxonomy for version {version}")
                return cache['taxonomy']
        except (json.JSONDecodeError, KeyError):
            logger.warning("Cache corrupted, redownloading...")
    
    # Download taxonomy zip from GitHub
    zip_url = f"{REPO_URL}/archive/refs/tags/{v_version}.zip"
    logger.info(f"Downloading taxonomy {version} from {zip_url}")
    
    try:
        response = requests.get(zip_url, timeout=30)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        logger.error(f"Taxonomy download failed: {str(e)}")
        raise

    taxonomy_paths = []
    try:
        with zipfile.ZipFile(BytesIO(response.content)) as zip_ref:
            # Extract taxonomy files for all languages
            txt_files = [f for f in zip_ref.namelist() 
                       if f.startswith(f'product-taxonomy-{version}/taxonomy/') 
                       and f.endswith('.txt')]
            
            for file_path in txt_files:
                # Extract language from path
                lang = file_path.split('/')[2]
                with zip_ref.open(file_path) as f:
                    paths = [line.strip().decode('utf-8') for line in f if line.strip()]
                    taxonomy_paths.extend(paths)
                    logger.debug(f"Added {len(paths)} paths from {lang} taxonomy")
    except (zipfile.BadZipFile, KeyError, IndexError) as e:
        logger.error(f"Failed to process taxonomy zip: {str(e)}")
        raise

    # Create and save cache
    cache_data = {
        'version': version,
        'source': zip_url,
        'taxonomy': taxonomy_paths
    }
    
    with open(cache_file, 'w') as f:
        json.dump(cache_data, f)
    
    logger.info(f"Cached taxonomy with {len(taxonomy_paths)} entries")
    return taxonomy_paths

def prepare_text(product):
    """Create searchable text from product data with enhanced cleaning"""
    fields = [
        product.get('title', ''),
        product.get('description', ''),
        product.get('product_type', '')
    ]
    if product.get('tags'):
        fields.append(' '.join(product['tags']))
    
    # Clean and normalize text
    text = " ".join(str(field) for field in fields).lower()
    text = re.sub(r'[^\w\s]', ' ', text)  # Remove punctuation
    text = re.sub(r'\s+', ' ', text).strip()  # Normalize whitespace
    return text

def map_products_to_taxonomy():
    """Main processing function with enhanced error handling"""
    try:
        # Get taxonomy version (latest or fallback)
        version = get_latest_taxonomy_version()
        taxonomy = download_and_cache_taxonomy(version)
        
        # Initialize model
        model = SentenceTransformer('all-MiniLM-L6-v2')
        logger.info("Generating taxonomy embeddings...")
        taxonomy_embeddings = model.encode(taxonomy)
        
        # Batch processing with resume capability
        last_id = 0
        progress_file = CACHE_DIR / "progress.json"
        
        # Resume from last processed ID if available
        if progress_file.exists():
            with open(progress_file, 'r') as f:
                progress = json.load(f)
                last_id = progress.get('last_id', 0)
                logger.info(f"Resuming from ID {last_id}")
        
        processed = 0
        matched = 0
        
        while True:
            try:
                # Fetch product batch
                query = supabase.table('products').select('*')
                if last_id > 0:
                    query = query.gt('id', last_id)
                
                products = query.order('id').limit(BATCH_SIZE).execute()
                
                if not products.data:
                    logger.info("Reached end of products table")
                    break
                    
                updates = []
                for product in products.data:
                    last_id = product['id']
                    processed += 1
                    
                    # Skip products with existing taxonomy
                    if product.get('taxonomy_path'):
                        continue
                    
                    product_text = prepare_text(product)
                    if not product_text.strip():
                        continue
                    
                    # Semantic matching
                    text_embedding = model.encode([product_text])
                    similarities = cosine_similarity(text_embedding, taxonomy_embeddings)[0]
                    max_idx = np.argmax(similarities)
                    
                    if similarities[max_idx] >= MIN_SIMILARITY:
                        matched += 1
                        updates.append({
                            'id': product['id'],
                            'taxonomy_path': taxonomy[max_idx]
                        })
                
                # Batch update Supabase
                if updates:
                    supabase.table('products').upsert(updates).execute()
                    logger.info(f"Updated {len(updates)} products | Total processed: {processed} | Matched: {matched}")
                
                # Save progress after each batch
                with open(progress_file, 'w') as f:
                    json.dump({'last_id': last_id}, f)
            
            except Exception as e:
                logger.error(f"Error processing batch: {str(e)}")
                # Save progress for recovery
                with open(progress_file, 'w') as f:
                    json.dump({'last_id': last_id}, f)
                raise

    except Exception as e:
        logger.exception("Fatal error in taxonomy mapping")
    finally:
        logger.info("Taxonomy mapping completed")

if __name__ == "__main__":
    map_products_to_taxonomy()