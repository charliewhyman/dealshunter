"""
Map products to Shopify taxonomy.
"""

import os
import re
import json
import sys
import requests
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from supabase import create_client
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

from core.logger import processor_logger
import config.settings as settings

class TaxonomyManager:
    """Manages Shopify taxonomy."""
    
    def __init__(self):
        self.clean_paths_cache = {}
        self.cache_dir = settings.CACHE_DIR / "taxonomy"
        self.cache_dir.mkdir(exist_ok=True, parents=True)
    
    def get_clean_taxonomy_paths(self, max_depth: int, min_depth: int) -> List[str]:
        """Get clean taxonomy paths."""
        cache_key = f"clean_paths_{min_depth}_{max_depth}"
        
        if cache_key in self.clean_paths_cache:
            return self.clean_paths_cache[cache_key]
        
        cache_file = self.cache_dir / f"{cache_key}.json"
        
        if cache_file.exists():
            try:
                data = json.loads(cache_file.read_text())
                paths = data.get("paths", [])
                if paths:
                    processor_logger.info(f"Loaded {len(paths)} paths from cache")
                    self.clean_paths_cache[cache_key] = paths
                    return paths
            except Exception as e:
                processor_logger.warning(f"Cache read error: {e}")
        
        paths = self._download_and_parse_taxonomy(max_depth, min_depth)
        
        cache_data = {
            "paths": paths,
            "count": len(paths),
            "max_depth": max_depth,
            "min_depth": min_depth,
            "cached_at": datetime.now(timezone.utc).isoformat()
        }
        cache_file.write_text(json.dumps(cache_data, indent=2))
        
        self.clean_paths_cache[cache_key] = paths
        return paths
    
    def _download_and_parse_taxonomy(self, max_depth: int, min_depth: int) -> List[str]:
        """Download and parse Shopify taxonomy."""
        url = "https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/categories.txt"
        processor_logger.info(f"Downloading taxonomy from {url}")
        
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            
            all_paths = []
            seen = set()
            
            for line in resp.text.strip().split('\n'):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                clean_path = self._extract_clean_path(line)
                if not clean_path:
                    continue
                
                truncated = self._truncate_to_depth(clean_path, max_depth, min_depth)
                if truncated and truncated not in seen:
                    all_paths.append(truncated)
                    seen.add(truncated)
            
            processor_logger.info(f"Extracted {len(all_paths)} paths")
            
            if len(all_paths) < 100:
                processor_logger.warning("Low path count, using fallback")
                all_paths = self._get_fallback_paths(max_depth, min_depth)
            
            return all_paths
            
        except Exception as e:
            processor_logger.error(f"Failed to download taxonomy: {e}")
            return self._get_fallback_paths(max_depth, min_depth)
    
    def _extract_clean_path(self, line: str) -> Optional[str]:
        """Extract clean path from taxonomy line."""
        if '\t' in line:
            parts = line.split('\t')
            for part in reversed(parts):
                if '>' in part or 'Apparel' in part or 'Clothing' in part:
                    clean = part.strip()
                    clean = re.sub(r'^[^A-Za-z&]+', '', clean)
                    return clean.strip()
        
        if ':' in line:
            parts = line.split(':', 1)
            if len(parts) == 2 and ('>' in parts[1] or 'Apparel' in parts[1]):
                clean = parts[1].strip()
                clean = re.sub(r'^[^A-Za-z&]+', '', clean)
                return clean.strip()
        
        return None
    
    def _truncate_to_depth(self, path: str, max_depth: int, min_depth: int) -> Optional[str]:
        """Truncate path to specified depth."""
        if '>' not in path:
            return path if min_depth <= 1 <= max_depth else None
        
        parts = [p.strip() for p in path.split('>')]
        current_depth = len(parts)
        
        if min_depth <= current_depth <= max_depth:
            return path
        
        if current_depth > max_depth:
            return ' > '.join(parts[:max_depth])
        
        if current_depth < min_depth:
            return None
        
        return path
    
    def _get_fallback_paths(self, max_depth: int, min_depth: int) -> List[str]:
        """Get fallback taxonomy paths."""
        base_paths = [
            "Apparel & Accessories",
            "Apparel & Accessories > Clothing",
            "Apparel & Accessories > Clothing > Outerwear",
            "Apparel & Accessories > Clothing > Outerwear > Jackets",
            "Apparel & Accessories > Clothing > Outerwear > Coats",
            "Apparel & Accessories > Clothing > Activewear",
            "Apparel & Accessories > Clothing > Activewear > Jackets",
            "Apparel & Accessories > Shoes",
            "Apparel & Accessories > Bags & Luggage",
            "Electronics",
            "Electronics > Computers",
            "Electronics > Mobile Phones",
            "Home & Garden",
            "Home & Garden > Furniture",
            "Home & Garden > Kitchen & Dining",
            "Sports & Outdoors",
            "Sports & Outdoors > Outdoor Recreation",
            "Sports & Outdoors > Outdoor Recreation > Camping & Hiking",
            "Sports & Outdoors > Outdoor Recreation > Camping & Hiking > Outerwear",
            "Health & Beauty",
            "Toys & Games",
            "Food & Beverages",
            "Office Supplies",
            "Pet Supplies"
        ]
        
        filtered = []
        for path in base_paths:
            depth = path.count('>') + 1
            if min_depth <= depth <= max_depth:
                filtered.append(path)
        
        processor_logger.info(f"Generated {len(filtered)} fallback paths")
        return filtered

def prepare_product_text(product: Dict[str, Any]) -> str:
    """Prepare product text for taxonomy matching."""
    parts = []
    
    title = product.get("title", "")
    if title:
        parts.append(title)
    
    product_type = product.get("product_type", "")
    if product_type:
        parts.append(product_type)
        if " > " in product_type:
            for segment in product_type.split(" > "):
                parts.append(segment.strip())
    
    tags = product.get("tags", [])
    if tags:
        parts.extend(tags)
        parts.append(" ".join(tags))
    
    description = product.get("description", "")
    if description:
        clean_desc = re.sub(r'<[^>]+>', ' ', description)
        clean_desc = re.sub(r'\s+', ' ', clean_desc).strip()
        if clean_desc:
            parts.append(clean_desc[:150])
    
    text = " ".join(filter(None, parts))
    text = re.sub(r'[^\w\s>]', ' ', text.lower())
    text = re.sub(r'\s+', ' ', text).strip()
    
    words = text.split()
    meaningful = [w for w in words if len(w) >= 4]
    
    return " ".join(meaningful)

class TaxonomyMatcher:
    """Matches products to taxonomy."""
    
    def __init__(self, 
                 model_name: str = "all-MiniLM-L6-v2",
                 max_depth: int = 4,
                 min_depth: int = 3,
                 preferred_depth: int = 4):
        
        self.model_name = model_name
        self.max_depth = max_depth
        self.min_depth = min_depth
        self.preferred_depth = preferred_depth
        
        self.model = SentenceTransformer(model_name)
        self.taxonomy_manager = TaxonomyManager()
        
        self.taxonomy_paths = []
        self.embeddings = None
    
    def initialize(self):
        """Initialize the matcher."""
        self.taxonomy_paths = self.taxonomy_manager.get_clean_taxonomy_paths(
            self.max_depth, self.min_depth
        )
        
        processor_logger.info(f"Initialized with {len(self.taxonomy_paths)} taxonomy paths")
        
        if not self.taxonomy_paths:
            raise ValueError("No taxonomy paths available")
        
        # ensure embeddings are numpy arrays for sklearn compatibility
        self.embeddings = self.model.encode(self.taxonomy_paths, convert_to_numpy=True)
    
    def match_product(self, product: Dict[str, Any], 
                     threshold: float = 0.45) -> Dict[str, Any]:
        text = prepare_product_text(product)
        if not text:
            return {
                "success": False,
                "error": "Could not prepare product text",
                "product_id": product.get("id")
            }
        
        # encode as numpy array to satisfy sklearn's cosine_similarity input types
        text_embedding = self.model.encode([text], convert_to_numpy=True)
        # Ensure we have numpy ndarrays (sometimes encode may return list/tensor) and 2D shapes
        text_embedding_arr = np.asarray(text_embedding)
        embeddings_arr = np.asarray(self.embeddings)
        text_embedding_arr = np.atleast_2d(text_embedding_arr)
        embeddings_arr = np.atleast_2d(embeddings_arr)
        similarities = cosine_similarity(text_embedding_arr, embeddings_arr)[0]
        
        candidates = []
        for idx, score in enumerate(similarities):
            if score >= threshold:
                path = self.taxonomy_paths[idx]
                depth = path.count('>') + 1
                candidates.append({
                    "path": path,
                    "score": float(score),
                    "depth": depth,
                    "depth_diff": abs(depth - self.preferred_depth),
                    "index": idx
                })
        
        if candidates:
            candidates.sort(key=lambda x: (-x["score"], x["depth_diff"], -x["depth"]))
            best = candidates[0]
            
            return {
                "success": True,
                "match_found": True,
                "taxonomy_path": best["path"],
                "score": best["score"],
                "depth": best["depth"],
                "product_id": product.get("id"),
                "candidate_count": len(candidates)
            }
        
        best_idx = np.argmax(similarities)
        best_score = float(similarities[best_idx])
        best_path = self.taxonomy_paths[best_idx]
        best_depth = best_path.count('>') + 1
        
        return {
            "success": True,
            "match_found": False,
            "taxonomy_path": best_path,
            "score": best_score,
            "depth": best_depth,
            "product_id": product.get("id"),
            "threshold": threshold,
            "message": f"No matches above threshold {threshold}"
        }

class BatchTaxonomyMapper:
    """Batch processor for taxonomy mapping."""
    
    def __init__(self,
                 model_name: str = "all-MiniLM-L6-v2",
                 max_depth: int = 4,
                 min_depth: int = 3,
                 preferred_depth: int = 4,
                 threshold: float = 0.45):
        
        self.model_name = model_name
        self.max_depth = max_depth
        self.min_depth = min_depth
        self.preferred_depth = preferred_depth
        self.threshold = threshold
        
        load_dotenv(settings.ENV_FILE)
        
        SUPABASE_URL = os.environ.get("SUPABASE_URL")
        SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
        
        self.supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        self.matcher = TaxonomyMatcher(
            model_name=model_name,
            max_depth=max_depth,
            min_depth=min_depth,
            preferred_depth=preferred_depth
        )
        
        self.progress_file = settings.CACHE_DIR / f"taxonomy_progress_depth{max_depth}.json"
        self.last_id = 0
        self.total_processed = 0
        self.total_matched = 0
        self.depth_stats = {}
    
    def initialize(self):
        """Initialize the mapper."""
        processor_logger.info(f"Initializing mapper with depth {self.min_depth}-{self.max_depth}")
        self.matcher.initialize()
        self._load_progress()
    
    def _load_progress(self):
        """Load progress from file."""
        if self.progress_file.exists():
            try:
                data = json.loads(self.progress_file.read_text())
                self.last_id = data.get("last_id", 0)
                self.total_processed = data.get("processed", 0)
                self.total_matched = data.get("matched", 0)
                self.depth_stats = data.get("depth_stats", {})
                processor_logger.info(f"Resuming from ID > {self.last_id}")
            except Exception as e:
                processor_logger.warning(f"Failed to load progress: {e}")
    
    def _save_progress(self):
        """Save progress to file."""
        data = {
            "last_id": self.last_id,
            "processed": self.total_processed,
            "matched": self.total_matched,
            "match_rate": self.total_matched / max(self.total_processed, 1),
            "depth_stats": self.depth_stats,
            "max_depth": self.max_depth,
            "min_depth": self.min_depth,
            "preferred_depth": self.preferred_depth,
            "threshold": self.threshold,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        self.progress_file.write_text(json.dumps(data, indent=2))
    
    def process_batch(self, limit: Optional[int] = None) -> Dict[str, Any]:
        """Process a batch of products."""
        batch_count = 0
        start_time = datetime.now(timezone.utc)
        batch_size = settings.PROCESSOR_CONFIG['taxonomy_batch_size']
        
        while True:
            if limit and batch_count >= limit:
                processor_logger.info(f"Reached batch limit: {limit}")
                break
            
            # Fetch unmapped products
            query = (
                self.supabase.table("products_with_details")
                .select("*")
                .gt("id", self.last_id)
                .is_("taxonomy_path", "null")
                .order("id")
                .limit(batch_size)
            )
            
            products = query.execute().data
            if not products:
                processor_logger.info("No more unmapped products")
                break

            # Guard against unexpected return types from the client (None, bool, dict, etc.)
            if not isinstance(products, list):
                processor_logger.warning(f"Unexpected products response type: {type(products)}")
            for product in products:
                # ensure the product is a mapping and has a usable id
                if not isinstance(product, dict):
                    processor_logger.warning(f"Skipping non-dict product: {type(product)}")
                    continue

                pid = product.get("id")
                if pid is None:
                    processor_logger.warning("Skipping product without id")
                    continue

                try:
                    # normalize id to int to avoid type checker complaints and ensure ordering works
                    self.last_id = int(pid)
                except (ValueError, TypeError):
                    processor_logger.warning(f"Invalid product id: {pid}")
                    continue

                self.total_processed += 1
                
                result = self.matcher.match_product(product, self.threshold)
                
                if result.get("success") and result.get("match_found"):
                    self.total_matched += 1
                    depth = result.get("depth", 0)
                    self.depth_stats[depth] = self.depth_stats.get(depth, 0) + 1
                    
                    updates.append({
                        "id": self.last_id,
                        "taxonomy_path": result["taxonomy_path"],
                        "taxonomy_score": result["score"],
                        "taxonomy_depth": depth,
                        "taxonomy_model": self.model_name,
                        "taxonomy_mapped_at": datetime.now(timezone.utc).isoformat(),
                    })
                    
            if updates:
                self.supabase.table("products_with_details").upsert(updates).execute()
                match_rate = (len(updates) / len(products)) * 100
                processor_logger.info(
                    f"Batch {batch_count}: {len(updates)}/{len(products)} matched "
                    f"({match_rate:.1f}%) | Total: {self.total_processed}, "
                    f"Matched: {self.total_matched}"
                )
            
            self._save_progress()
        
        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
        
        return {
            "batches_processed": batch_count,
            "total_processed": self.total_processed,
            "total_matched": self.total_matched,
            "match_rate": self.total_matched / max(self.total_processed, 1),
            "elapsed_seconds": elapsed,
            "depth_stats": self.depth_stats
        }
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of processing."""
        summary = {
            "last_id": self.last_id,
            "total_processed": self.total_processed,
            "total_matched": self.total_matched,
            "match_rate": self.total_matched / max(self.total_processed, 1),
            "depth_stats": self.depth_stats,
            "configuration": {
                "model": self.model_name,
                "max_depth": self.max_depth,
                "min_depth": self.min_depth,
                "preferred_depth": self.preferred_depth,
                "threshold": self.threshold
            }
        }
        
        if self.depth_stats:
            depth_items = sorted(self.depth_stats.items())
            summary["depth_distribution"] = [
                {
                    "depth": depth, 
                    "count": count, 
                    "percentage": (count / self.total_matched * 100) if self.total_matched > 0 else 0
                }
                for depth, count in depth_items
            ]
        
        return summary

def run_taxonomy_mapping(
    max_depth: int = 4,
    min_depth: int = 3,
    preferred_depth: int = 4,
    threshold: float = 0.45,
    batch_limit: Optional[int] = None,
    model_name: str = "all-MiniLM-L6-v2",
    reset: bool = False
) -> Dict[str, Any]:
    """Run taxonomy mapping."""
    
    processor_logger.info("Starting taxonomy mapping")
    processor_logger.info(f"Configuration: depth={min_depth}-{max_depth}, threshold={threshold}")
    
    # Reset progress if requested
    if reset:
        progress_file = settings.CACHE_DIR / f"taxonomy_progress_depth{max_depth}.json"
        if progress_file.exists():
            progress_file.unlink()
            processor_logger.info("Progress reset")
    
    mapper = BatchTaxonomyMapper(
        model_name=model_name,
        max_depth=max_depth,
        min_depth=min_depth,
        preferred_depth=preferred_depth,
        threshold=threshold
    )
    
    try:
        mapper.initialize()
        result = mapper.process_batch(limit=batch_limit)
        summary = mapper.get_summary()
        
        processor_logger.info("Taxonomy mapping completed")
        processor_logger.info(f"Processed: {summary['total_processed']}, Matched: {summary['total_matched']}")
        processor_logger.info(f"Match rate: {summary['match_rate']:.1%}")
        
        if summary.get('depth_distribution'):
            processor_logger.info("Depth distribution:")
            for item in summary['depth_distribution']:
                processor_logger.info(f"  Depth {item['depth']}: {item['count']} ({item['percentage']:.1f}%)")
        
        return {
            "status": "success",
            "summary": summary,
            "processing_result": result
        }
        
    except Exception as e:
        processor_logger.error(f"Taxonomy mapping failed: {e}")
        return {
            "status": "error",
            "error": str(e)
        }

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Map products to Shopify taxonomy with depth control"
    )
    
    parser.add_argument("--max-depth", type=int, default=4,
                       help="Maximum taxonomy depth (default: 4)")
    
    parser.add_argument("--min-depth", type=int, default=3,
                       help="Minimum taxonomy depth (default: 3)")
    
    parser.add_argument("--preferred-depth", type=int, default=4,
                       help="Preferred taxonomy depth (default: 4)")
    
    parser.add_argument("--threshold", type=float, default=0.45,
                       help="Similarity threshold (default: 0.45)")
    
    parser.add_argument("--batch-limit", type=int,
                       help="Limit number of batches to process")
    
    parser.add_argument("--model", type=str, default="all-MiniLM-L6-v2",
                       help="Embedding model (default: all-MiniLM-L6-v2)")
    
    parser.add_argument("--reset", action="store_true",
                       help="Reset progress and start from beginning")
    
    args = parser.parse_args()
    
    result = run_taxonomy_mapping(
        max_depth=args.max_depth,
        min_depth=args.min_depth,
        preferred_depth=args.preferred_depth,
        threshold=args.threshold,
        batch_limit=args.batch_limit,
        model_name=args.model,
        reset=args.reset
    )
    
    if result["status"] == "error":
        sys.exit(1)