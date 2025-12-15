"""
map_shopify_taxonomy.py
Download Shopify’s latest taxonomy.json, create embeddings,
and map products → taxonomy paths directly into products_with_details.
"""
import os
import re
import json
import logging
import requests
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

# ----------------------------------------------
# 1.  Setup
# ----------------------------------------------
load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

SUPABASE_URL   = os.getenv("SUPABASE_URL")
SUPABASE_KEY   = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
CACHE_DIR       = Path("./taxonomy_cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)
BATCH_SIZE      = 500
MIN_SIMILARITY  = 0.60


# ----------------------------------------------
# 2.  Taxonomy downloader & parser
# ----------------------------------------------
def download_and_cache_taxonomy() -> list[str]:
    """Return a flat list of Shopify category paths in ' > ' notation."""
    cache_file = CACHE_DIR / f"taxonomy.json"

    # 1.  Use cache if present
    if cache_file.exists():
        logger.info(f"Using cached taxonomy")
        return json.loads(cache_file.read_text())["paths"]

    # 2.  Download official JSON (CANONICAL URL)
    url = "https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/taxonomy.json"
    logger.info(f"Downloading taxonomy from {url}")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    # 3.  Flatten every node into “Root > Child > Grandchild”
    def flatten(node, parent_path="") -> list[str]:
        current = (parent_path + node["name"]).strip(" > ")
        paths = [current]
        for child in node.get("children", []):
            paths.extend(flatten(child, current + " > "))
        return paths

    paths = []
    for vertical in data.get("verticals", []):
        paths.extend(flatten(vertical))

    # 4.  Persist cache
    cache_file.write_text(json.dumps({"paths": paths}))
    logger.info(f"Cached {len(paths)} taxonomy paths")
    return paths

# ----------------------------------------------
# 3.  Helpers
# ----------------------------------------------
def prepare_text(product: dict) -> str:
    """Return enhanced searchable text for a product row."""
    # Extract key information
    title = product.get("title", "")
    description = product.get("description", "")
    product_type = product.get("product_type", "")
    tags = product.get("tags", [])
    
    # Clean and structure the text better
    parts = []
    
    # 1. Title - most important, keep it prominent
    if title:
        parts.append(title)
        # Add title variations (remove brand names if needed)
        title_lower = title.lower()
        parts.append(title_lower)
    
    # 2. Product type - very important for taxonomy
    if product_type:
        parts.append(product_type)
        # Add variations of product type
        if " > " in product_type:
            # If it's already a path-like structure, break it down
            for segment in product_type.split(" > "):
                parts.append(segment.strip())
    
    # 3. Tags - important keywords
    if tags:
        parts.extend(tags)
        # Add tags as a string too
        parts.append(" ".join(tags))
    
    # 4. Description - clean it properly
    if description:
        # Remove HTML tags and excessive whitespace
        clean_desc = re.sub(r'<[^>]+>', ' ', description)
        clean_desc = re.sub(r'\s+', ' ', clean_desc).strip()
        # Take first 200 chars for key info
        parts.append(clean_desc[:200])
        # Also add keywords from description
        if len(clean_desc) > 100:
            # Extract potential keywords (longer words)
            words = clean_desc.split()
            keywords = [w for w in words if len(w) > 5][:10]
            if keywords:
                parts.append(" ".join(keywords))
    
    # 5. Add inferred categories based on keywords
    text_lower = " ".join(parts).lower()
    if any(word in text_lower for word in ['jacket', 'coat', 'outerwear', 'raincoat']):
        parts.append('outerwear jacket coat')
    if any(word in text_lower for word in ['mens', 'men', 'male']):
        parts.append('mens clothing apparel')
    if any(word in text_lower for word in ['waxed', 'cotton', 'water resistant']):
        parts.append('waterproof outdoor clothing')
    
    # Combine and clean
    text = " ".join(filter(None, parts))
    text = re.sub(r'[^\w\s>]', ' ', text.lower())  # Keep '>' for path preservation
    return re.sub(r'\s+', ' ', text).strip()


# ----------------------------------------------
# 4.  Main mapper
# ----------------------------------------------
def map_products_to_taxonomy() -> None:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    taxonomy_paths = download_and_cache_taxonomy()
    model = SentenceTransformer("all-MiniLM-L6-v2")
    embeddings = model.encode(taxonomy_paths)

    progress_file = CACHE_DIR / "taxonomy_progress.json"
    last_id = 0
    if progress_file.exists():
        last_id = json.loads(progress_file.read_text()).get("last_id", 0)

    processed = matched = 0
    logger.info(f"Starting taxonomy mapping from id > {last_id}")

    while True:
        # Fetch next batch of *unmapped* products
        query = (
            supabase.table("products_with_details")
            .select("id, title, description, product_type, tags")
            .gt("id", last_id)
            .is_("taxonomy_path", "null")
            .order("id")
            .limit(BATCH_SIZE)
        )
        rows = query.execute().data
        if not rows:
            logger.info("No more products to map")
            break

        updates = []
        for row in rows:
            last_id = row["id"]
            processed += 1

            text = prepare_text(row)
            if not text:
                continue

            text_emb = model.encode([text])
            sims = cosine_similarity(text_emb, embeddings)[0]
            best_idx = int(np.argmax(sims))
            score = float(sims[best_idx])

            if score >= MIN_SIMILARITY:
                matched += 1
                updates.append(
                    {
                        "id": last_id,
                        "taxonomy_path": taxonomy_paths[best_idx],
                        "taxonomy_mapped_at": datetime.now(timezone.utc).isoformat(),
                    }
                )

        # Upsert in one round-trip
        if updates:
            supabase.table("products_with_details").upsert(updates).execute()
            logger.info(
                f"Upserted {len(updates)} rows | processed={processed} matched={matched}"
            )

        # Persist resume point
        progress_file.write_text(
            json.dumps(
                {
                    "last_id": last_id,
                    "processed": processed,
                    "matched": matched,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
        )

# Add this test function after the helper functions
def test_single_product(product_id: int) -> None:
    """Test taxonomy mapping for a single product ID."""
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Download and prepare taxonomy
    taxonomy_paths = download_and_cache_taxonomy()
    model = SentenceTransformer("all-MiniLM-L6-v2")
    embeddings = model.encode(taxonomy_paths)
    
    # Fetch the specific product
    query = (
        supabase.table("products_with_details")
        .select("id, title, description, product_type, tags")
        .eq("id", product_id)
    )
    
    product = query.execute().data
    if not product:
        logger.error(f"Product ID {product_id} not found")
        return
    
    product = product[0]
    logger.info(f"Testing product: {product['title']}")
    logger.info(f"Description: {product.get('description', '')[:100]}...")
    logger.info(f"Product Type: {product.get('product_type', '')}")
    logger.info(f"Tags: {product.get('tags', [])}")
    
    # Prepare and analyze
    text = prepare_text(product)
    logger.info(f"Prepared text: {text}")
    
    text_emb = model.encode([text])
    sims = cosine_similarity(text_emb, embeddings)[0]
    best_idx = int(np.argmax(sims))
    score = float(sims[best_idx])
    
    logger.info(f"Best match score: {score:.4f}")
    logger.info(f"Taxonomy path: {taxonomy_paths[best_idx]}")
    
    # Show top 5 matches
    logger.info("\nTop 5 matches:")
    top_indices = np.argsort(sims)[-5:][::-1]
    for idx in top_indices:
        logger.info(f"  Score: {sims[idx]:.4f} - {taxonomy_paths[idx]}")
    
    # Apply if good enough
    if score >= MIN_SIMILARITY:
        update_data = {
            "id": product_id,
            "taxonomy_path": taxonomy_paths[best_idx],
            "taxonomy_mapped_at": datetime.now(timezone.utc).isoformat(),
        }
        supabase.table("products_with_details").upsert(update_data).execute()
        logger.info(f"✓ Updated product {product_id} with taxonomy path")
    else:
        logger.warning(f"✗ Score below threshold ({MIN_SIMILARITY})")

# Modify the entrypoint
if __name__ == "__main__":
    import sys
    
    # Check if testing a single product
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        product_id = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        logger.info(f"Testing single product ID: {product_id}")
        test_single_product(product_id)
    else:
        try:
            map_products_to_taxonomy()
        except Exception:
            logger.exception("Fatal error during taxonomy mapping")
            
# ----------------------------------------------
# 5.  Entrypoint
# ----------------------------------------------
if __name__ == "__main__":
    try:
        map_products_to_taxonomy()
    except Exception:
        logger.exception("Fatal error during taxonomy mapping")