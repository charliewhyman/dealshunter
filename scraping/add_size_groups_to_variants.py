import os
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Fetch all size groups once
size_groups = supabase.table("size_groups").select("id,size").execute().data

# Get or create an "Unknown" size group for fallback
unknown_size_group = supabase.table("size_groups").select("id").eq("size", "Unknown").execute().data
if not unknown_size_group:
    # Create Unknown size group if it doesn't exist
    unknown_size_group = supabase.table("size_groups").insert({"size": "Unknown"}).execute().data
unknown_size_group_id = unknown_size_group[0]["id"]

print(f"Found {len(size_groups)} size groups")
print(f"Unknown size group ID: {unknown_size_group_id}")

batch_size = 100
total_processed = 0

while True:
    # Fetch variants without size_group_id
    variants = (
        supabase.table("variants")
        .select("id,title")
        .is_("size_group_id", "null")
        .limit(batch_size)
        .execute()
        .data
    )

    if not variants:
        print("No more variants to process")
        break
    
    print(f"Processing batch of {len(variants)} variants...")
    
    updates = []
    for v in variants:
        matched_size_group_id = None
        title = v["title"] or ""
        
        # Sort size groups by length (longest first) to match more specific sizes first
        for sg in sorted(size_groups, key=lambda x: len(x["size"]), reverse=True):
            if sg["size"].lower() in title.lower():
                matched_size_group_id = sg["id"]
                break
        
        # Fallback to unknown size group if no match found
        if not matched_size_group_id:
            matched_size_group_id = unknown_size_group_id
        
        updates.append({"id": v["id"], "size_group_id": matched_size_group_id})
    
    # Update variants in batch
    try:
        for upd in updates:
            supabase.table("variants").update({"size_group_id": upd["size_group_id"]}).eq("id", upd["id"]).execute()
        
        total_processed += len(updates)
        print(f"Updated {len(updates)} variants. Total processed: {total_processed}")
        
    except Exception as e:
        print(f"Error updating batch: {e}")
        # Continue with next batch instead of stopping
        continue

print(f"Completed! Total variants processed: {total_processed}")