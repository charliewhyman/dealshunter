#!/usr/bin/env python3
"""
Re-categorize existing products in database using updated config.

Usage:
    python recategorize_products.py              # re-categorize all products
    python recategorize_products.py 9950559404317  # debug a single product ID
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db_client import DatabaseClient
from product_categorizer import ProductCategorizer


def debug_product(product_id: int):
    """Debug categorisation for a single product by ID."""
    db = DatabaseClient()
    categorizer = ProductCategorizer()
    categorizer.reload_config()

    def get_product(conn):
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, product_type, title, description, vendor, tags
                FROM products_with_details_core
                WHERE id = %s
            """,
                (product_id,),
            )
            return cur.fetchone()

    row = db.safe_execute(get_product, f"Get product {product_id}")
    if not row:
        print(f"Product {product_id} not found.")
        return

    print(f"\n=== Debug: Product {product_id} ===")
    print(f"  type    : {row['product_type']}")
    print(f"  title   : {row['title']}")
    print(f"  vendor  : {row['vendor']}")
    print(f"  tags    : {row['tags']}")
    print(f"  desc    : {(row['description'] or '')[:200]}...")

    category_info = categorizer.get_category_info(
        product_type=row["product_type"],
        title=row["title"],
        tags=row["tags"],
        description=row["description"],
        vendor=row["vendor"],
    )

    print(f"\n  -> top_level_category  : {category_info['top_level_category']}")
    print(f"  -> grouped_product_type: {category_info['grouped_product_type']}")
    print(f"  -> gender_age          : {category_info['gender_age']}")


def recategorize_all_products():
    """Re-categorize ALL products in database using updated config."""

    # Initialize
    db = DatabaseClient()
    categorizer = ProductCategorizer()
    categorizer.reload_config()  # Load updated config

    print("Starting re-categorization of all products...")

    def get_all_products(conn):
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, product_type, title, description, vendor, tags
                FROM products_with_details_core
            """
            )
            return cur.fetchall()

    all_products = db.safe_execute(get_all_products, "Get all products")

    if not all_products:
        print("No products found!")
        return

    print(f"Found {len(all_products)} products to re-categorize")

    updated = 0
    batch = []
    batch_size = 100

    for row in all_products:
        product_id = row["id"]
        product_type = row["product_type"]
        title = row["title"]
        description = row["description"]
        vendor = row["vendor"]
        tags = row["tags"]

        # Re-categorize using full context
        category_info = categorizer.get_category_info(
            product_type=product_type,
            title=title,
            tags=tags,
            description=description,
            vendor=vendor,
        )

        batch.append(
            (
                category_info["grouped_product_type"],
                category_info["top_level_category"],
                category_info["gender_age"],
                product_id,
            )
        )
        updated += 1

        # Batch update
        if len(batch) >= batch_size:

            def update_batch(conn, b=batch):
                with conn.cursor() as cur:
                    cur.executemany(
                        """
                        UPDATE products_with_details_core
                        SET
                            grouped_product_type = %s,
                            top_level_category = %s,
                            gender_age = %s,
                            updated_at = NOW()
                        WHERE id = %s
                    """,
                        b,
                    )
                conn.commit()

            db.safe_execute(update_batch, f"Update batch of {len(batch)} products")
            print(f"  Progress: {updated} / {len(all_products)} updated...")
            batch = []

    # Final batch
    if batch:

        def update_final_batch(conn, b=batch):
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    UPDATE products_with_details_core
                    SET
                        grouped_product_type = %s,
                        top_level_category = %s,
                        gender_age = %s,
                        updated_at = NOW()
                    WHERE id = %s
                """,
                    b,
                )
            conn.commit()

        db.safe_execute(
            update_final_batch, f"Update final batch of {len(batch)} products"
        )

    print(f"\n✅ Re-categorization complete!")
    print(f"   Updated: {updated} / {len(all_products)}")

    # Show resulting category distribution
    def get_stats(conn):
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT top_level_category, COUNT(*) as count
                FROM products_with_details_core
                GROUP BY top_level_category
                ORDER BY count DESC
                LIMIT 20
            """
            )
            return cur.fetchall()

    stats = db.safe_execute(get_stats, "Get category stats")

    if stats:
        print("\nCategory distribution after re-categorization:")
        for row in stats:
            print(f"  {row['top_level_category']}: {row['count']}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Debug a specific product
        debug_product(int(sys.argv[1]))
    else:
        recategorize_all_products()
