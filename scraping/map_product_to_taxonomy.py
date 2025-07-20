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
    """Return cleaned-up searchable text for a product row."""
    parts = [
        product.get("title", ""),
        product.get("description", ""),
        product.get("product_type", ""),
        " ".join(product.get("tags", [])),
    ]
    text = " ".join(filter(None, parts)).lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


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


# ----------------------------------------------
# 5.  Entrypoint
# ----------------------------------------------
if __name__ == "__main__":
    try:
        map_products_to_taxonomy()
    except Exception:
        logger.exception("Fatal error during taxonomy mapping")