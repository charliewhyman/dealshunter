import supabase
import os
from dotenv import load_dotenv

load_dotenv()

def refresh_materialized_view(SUPABASE_URL, SUPABASE_KEY):
    client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)
    
    try:
        # Call our refresh function
        result = client.rpc('refresh_products_view_incremental', {}).execute()
        
        if result.data:
            print(f"Refreshed {result.data[0]['row_count']} products")
        else:
            print("View refreshed successfully")
    except Exception as e:
        print(f"Refresh failed: {str(e)}")
        # Fallback to full refresh if incremental fails
        client.execute('REFRESH MATERIALIZED VIEW CONCURRENTLY public.products_with_details')
        print("Performed full refresh as fallback")
    
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
refresh_materialized_view(supabase_url, supabase_key)