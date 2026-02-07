#!/usr/bin/env python3
"""
Re-categorize existing products in database using updated config.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db_client import DatabaseClient
from product_categorizer import ProductCategorizer

def recategorize_all_products():
    """Re-categorize all products in database."""
    
    # Initialize
    db = DatabaseClient()
    categorizer = ProductCategorizer()
    categorizer.reload_config()  # Load updated config
    
    print("Starting re-categorization of all products...")
    
    def get_uncategorized_products(conn):
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, product_type, title, description, vendor, tags
                FROM products_with_details_core
                WHERE grouped_product_type = 'Uncategorized'
            """)
            return cur.fetchall()
    
    # Get uncategorized products
    uncategorized = db.safe_execute(
        get_uncategorized_products, 
        'Get uncategorized products'
    )
    
    if not uncategorized:
        print("No uncategorized products found!")
        return
    
    print(f"Found {len(uncategorized)} uncategorized products")
    
    updated = 0
    batch = []
    batch_size = 100
    
    for row in uncategorized:
        product_id = row['id']
        product_type = row['product_type']
        title = row['title']
        description = row['description']
        vendor = row['vendor']
        tags = row['tags']
        
        # Re-categorize using full context
        category_info = categorizer.get_category_info(
            product_type=product_type,
            title=title,
            tags=tags,
            description=description,
            vendor=vendor
        )
        
        # Only update if no longer uncategorized
        if category_info['grouped_product_type'] != 'Uncategorized':
            batch.append((
                category_info['grouped_product_type'],
                category_info['top_level_category'],
                category_info['gender_age'],
                product_id
            ))
            updated += 1
            
        # Debug logging for first 5 items
        if product_id in [r['id'] for r in uncategorized[:5]]:
            print(f"DEBUG: Product {product_id} | Type: {product_type} | Title: {title}")
            print(f"       Result: {category_info['grouped_product_type']} | Sub: {category_info['subcategory']}")
            
            # Batch update
            if len(batch) >= batch_size:
                def update_batch(conn):
                    with conn.cursor() as cur:
                        cur.executemany("""
                            UPDATE products_with_details_core
                            SET 
                                grouped_product_type = %s,
                                top_level_category = %s,
                                gender_age = %s,
                                updated_at = NOW()
                            WHERE id = %s
                        """, batch)
                    conn.commit()
                
                db.safe_execute(update_batch, f'Update batch of {len(batch)} products')
                print(f"  Progress: {updated} updated...")
                batch = []
    
    # Final batch
    if batch:
        def update_final_batch(conn):
            with conn.cursor() as cur:
                cur.executemany("""
                    UPDATE products_with_details_core
                    SET 
                        grouped_product_type = %s,
                        top_level_category = %s,
                        gender_age = %s,
                        updated_at = NOW()
                    WHERE id = %s
                """, batch)
            conn.commit()
        
        db.safe_execute(update_final_batch, f'Update final batch of {len(batch)} products')
    
    print(f"\n✅ Re-categorization complete!")
    print(f"   Updated: {updated} / {len(uncategorized)}")
    print(f"   Still uncategorized: {len(uncategorized) - updated}")
    
    # Show remaining uncategorized counts
    def get_remaining_stats(conn):
        with conn.cursor() as cur:
            cur.execute("""
                SELECT grouped_product_type, COUNT(*) as count
                FROM products_with_details_core
                GROUP BY grouped_product_type
                ORDER BY count DESC
                LIMIT 20
            """)
            return cur.fetchall()
    
    stats = db.safe_execute(get_remaining_stats, 'Get category stats')
    
    if stats:
        print("\nCurrent category distribution:")
        for row in stats:
            cat = row['grouped_product_type']
            count = row['count']
            print(f"  {cat}: {count}")

if __name__ == "__main__":
    recategorize_all_products()