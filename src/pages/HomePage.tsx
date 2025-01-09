import { useEffect, useState } from 'react';
import { Product } from '../types';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';

export function HomePage() {
    const [Products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);


    useEffect(() => {
        fetchProducts();
      }, []);
    
    // Function to fetch Products from Supabase
    async function fetchProducts() {
    try {
        const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('votes', { ascending: false });

        if (error) throw error;
        setProducts(data || []);
    } catch (error) {
        console.error('Error fetching Products:', error);
    } finally {
        setLoading(false);
    }
    }
  
    // Function to handle voting
    async function handleVote(ProductId: string) {
        try {
          const { error } = await supabase.rpc('increment_votes', {
            Product_id: ProductId
          });
    
          if (error) throw error;
          await fetchProducts();
        } catch (error) {
          console.error('Error voting:', error);
        }
      }

    // handle loading
    if (loading) {
        return (
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        );
      }
    
    // map through Products and render ProductCard components
    // TODO add pagination instead of slicing the array
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {Products.slice(0, 10).map((product) => (
            <div key={product.id} className="max-w-4xl mx-auto w-full">
              <ProductCard
                product={product}
                onVote={handleVote}
              />
            </div>
          ))}
        </div>
      </div>
    );
}