#!/usr/bin/env python3
"""
test_one_product.py
Single-product sanity-check using the **canonical Shopify JSON** approach.
"""

import json
import re
import requests
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

URL = "https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/taxonomy.json"

# ------------------------------------------------------------------
# 1.  Download & flatten taxonomy (once)
# ------------------------------------------------------------------
def load_taxonomy() -> list[str]:
    resp = requests.get(URL, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    def flatten(node, prefix="") -> list[str]:
        path = f"{prefix}{node['name']}".strip(" > ")
        yield path
        for child in node.get("children", []):
            yield from flatten(child, path + " > ")

    return [p for v in data.get("verticals", []) for p in flatten(v)]


# ------------------------------------------------------------------
# 2.  Map one product
# ------------------------------------------------------------------
def map_one(product: dict) -> str:
    taxonomy = load_taxonomy()
    model = SentenceTransformer("all-MiniLM-L6-v2")
    emb_tax = model.encode(taxonomy)

    text = " ".join(
        filter(
            None,
            [
                product.get("title", ""),
                product.get("description", ""),
                product.get("product_type", ""),
                " ".join(product.get("tags", [])),
            ],
        )
    ).lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return "Uncategorised"

    sims = cosine_similarity(model.encode([text]), emb_tax)[0]
    idx = int(np.argmax(sims))
    return taxonomy[idx]


# ------------------------------------------------------------------
# 3.  Quick test
# ------------------------------------------------------------------
if __name__ == "__main__":
    product = {
        "title": "Men's Red Cotton T-Shirt with Crew Neck",
        "description": "Comfortable 100% cotton tee for everyday wear",
        "product_type": "T-Shirt",
        "tags": ["men", "cotton", "casual"],
    }
    print("Product:", product["title"])
    print("Mapped to:", map_one(product))